package gitsync

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const defaultSyncTimeout = 5 * time.Minute

// SyncOptions 定义单次仓库同步参数。
type SyncOptions struct {
	RepoURL        string        // 远端仓库地址（SSH/HTTPS/本地路径）
	LocalPath      string        // 宿主机本地目标目录
	Branch         string        // 目标分支（为空时默认 master，并兼容 fallback 至 main）
	Depth          int           // 浅克隆深度（0 表示完整克隆，>0 表示浅克隆深度）
	Timeout        time.Duration // 单次同步超时（<=0 时默认 5 分钟；鉴权失败快速熔断 < 30s）
	AutoHealCache  bool          // 非权限类本地损坏时是否清理重建缓存
	CleanUntracked bool          // 同步前是否执行 reset --hard && clean -fd
}

// SyncResult 返回同步后的仓库状态。
type SyncResult struct {
	LocalPath      string
	ResolvedBranch string // 实际检出的分支名（如 master 自动适配为 main）
	CommitSHA      string // 当前 HEAD 40 位提交哈希
	RawOutput      string // 脱敏后的 git 输出摘要
}

// Sync 执行完整的仓库同步闭环（同路径互斥锁 -> 清理残留锁 -> clone/fetch/checkout/reset -> 自愈重试 -> 解析 HEAD）。
func Sync(ctx context.Context, opts SyncOptions) (*SyncResult, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	repoURL := strings.TrimSpace(opts.RepoURL)
	if repoURL == "" || strings.HasPrefix(repoURL, "-") {
		return nil, fmt.Errorf("仓库地址非法或为空")
	}

	localPath := strings.TrimSpace(opts.LocalPath)
	if localPath == "" {
		return nil, fmt.Errorf("本地目标目录不能为空")
	}
	if absPath, err := filepath.Abs(localPath); err == nil {
		localPath = absPath
	}

	if err := os.MkdirAll(filepath.Dir(localPath), 0755); err != nil {
		return nil, fmt.Errorf("创建仓库父目录失败: %w", err)
	}

	branch := strings.TrimSpace(opts.Branch)
	if branch == "" {
		branch = "master"
	}
	if err := ValidateBranchName(branch); err != nil {
		return nil, err
	}

	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = defaultSyncTimeout
	}

	syncCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	pathLock := GetPathLock(localPath)
	pathLock.Lock()
	defer pathLock.Unlock()

	CleanStaleGitLocks(localPath)

	var (
		output         []byte
		resolvedBranch string
		gitErr         error
	)

	for attempt := 1; attempt <= 2; attempt++ {
		output, resolvedBranch, gitErr = ExecGitSyncWithOptions(syncCtx, localPath, branch, repoURL, opts.Depth, opts.CleanUntracked)
		if gitErr == nil {
			break
		}

		// 若上下文已取消或超时，立即退出，不执行重试
		if syncCtx.Err() != nil {
			break
		}

		sanitizedOut := SanitizeGitOutput(string(output))
		errStr := sanitizedOut + " " + SanitizeGitOutput(gitErr.Error())

		// 1. 权限或鉴权错误：属于外部凭据缺失或仓库无权访问，不可自愈，快速失败并明确报错
		if IsAuthOrPermissionError(errStr) {
			log.Printf("[GitSync] 检测到鉴权/权限错误 (%s): %s（快速失败，不重试）", localPath, errStr)
			break
		}

		// 2. 锁冲突：清理残留锁文件并短暂退避后重试
		if strings.Contains(errStr, ".lock") || strings.Contains(errStr, "File exists") || strings.Contains(errStr, "Another git process") {
			log.Printf("[GitSync] 第 %d 次同步检测到锁冲突 (%s)，清理锁文件后重试", attempt, localPath)
			CleanStaleGitLocks(localPath)
			select {
			case <-syncCtx.Done():
				return nil, fmt.Errorf("git sync canceled during lock retry: %w", syncCtx.Err())
			case <-time.After(500 * time.Millisecond):
			}
			continue
		}

		// 3. 本地缓存损坏自愈：首次非权限失败后销毁本地目录并执行全新 clone
		if attempt == 1 && opts.AutoHealCache {
			if _, statErr := os.Stat(localPath); statErr == nil {
				log.Printf("[GitSync] 第 1 次同步非权限失败 (%s): %s，触发本地缓存自愈重建", localPath, errStr)
				if rmErr := os.RemoveAll(localPath); rmErr != nil {
					log.Printf("[GitSync] 清理损坏缓存目录 %s 失败: %v", localPath, rmErr)
					break
				}
				output, resolvedBranch, gitErr = ExecGitSyncWithOptions(syncCtx, localPath, branch, repoURL, opts.Depth, opts.CleanUntracked)
				if gitErr == nil {
					log.Printf("[GitSync] 仓库缓存自愈成功: %s", localPath)
					break
				}
			}
		}
		break
	}

	sanitizedOut := SanitizeGitOutput(string(output))
	if gitErr != nil {
		if sanitizedOut != "" {
			return nil, fmt.Errorf("git sync failed: %s: %w", strings.TrimSpace(sanitizedOut), gitErr)
		}
		return nil, fmt.Errorf("git sync failed: %w", gitErr)
	}

	commitOut, _, revErr := ExecCommandWithProcessGroup(syncCtx, localPath, "git", "-C", localPath, "rev-parse", "HEAD")
	if revErr != nil {
		return nil, fmt.Errorf("解析 HEAD 提交哈希失败: %s: %w", SanitizeGitOutput(string(commitOut)), revErr)
	}
	commitSHA := strings.TrimSpace(string(commitOut))

	if resolvedBranch == "" || resolvedBranch == "HEAD" {
		branchOut, _, brErr := ExecCommandWithProcessGroup(syncCtx, localPath, "git", "-C", localPath, "rev-parse", "--abbrev-ref", "HEAD")
		if brErr == nil {
			b := strings.TrimSpace(string(branchOut))
			if b != "" && b != "HEAD" {
				resolvedBranch = b
			}
		}
		if resolvedBranch == "" {
			resolvedBranch = branch
		}
	}

	return &SyncResult{
		LocalPath:      localPath,
		ResolvedBranch: resolvedBranch,
		CommitSHA:      commitSHA,
		RawOutput:      sanitizedOut,
	}, nil
}

// ExecGitSyncWithOptions 执行单次底层 Git Clone / Fetch / Checkout / Reset 操作，返回原始输出、实际检出分支与错误。
func ExecGitSyncWithOptions(ctx context.Context, localPath, branch, repoURL string, depth int, cleanUntracked bool) ([]byte, string, error) {
	branch = strings.TrimSpace(branch)
	if branch == "" {
		branch = "master"
	}
	if err := ValidateBranchName(branch); err != nil {
		return nil, branch, err
	}

	var output []byte
	var gitErr error
	resolvedBranch := branch

	if stat, errStat := os.Stat(filepath.Join(localPath, ".git")); errStat == nil && stat.IsDir() {
		log.Printf("[GitSync] 更新已有仓库 %s (分支: %s)", localPath, branch)
		if cleanUntracked {
			if cleanErr := CleanExistingWorkspace(ctx, localPath); cleanErr != nil {
				return nil, resolvedBranch, fmt.Errorf("clean existing workspace: %w", cleanErr)
			}
		}

		remotesOut, _, remoteErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "remote")
		hasOrigin := remoteErr == nil && strings.Contains(string(remotesOut), "origin")

		if hasOrigin {
			if setOut, _, setErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "remote", "set-url", "origin", repoURL); setErr != nil {
				return setOut, resolvedBranch, fmt.Errorf("set origin url: %w", setErr)
			}

			fetchRefSpec := func(targetBr string) ([]byte, error) {
				fetchArgs := []string{"-C", localPath, "fetch"}
				if depth > 0 {
					fetchArgs = append(fetchArgs, "--depth="+strconv.Itoa(depth))
				}
				refspec := fmt.Sprintf("+refs/heads/%s:refs/remotes/origin/%s", targetBr, targetBr)
				fetchArgs = append(fetchArgs, "origin", refspec)
				out, _, fErr := ExecCommandWithProcessGroup(ctx, localPath, "git", fetchArgs...)
				return out, fErr
			}

			out, err := fetchRefSpec(branch)
			// 若默认分支为 master 但远端实际为 main，显式 refspec 回退拉取 main
			if err != nil && branch == "master" && !IsAuthOrPermissionError(SanitizeGitOutput(string(out))+" "+SanitizeGitOutput(err.Error())) {
				if outMain, errMain := fetchRefSpec("main"); errMain == nil {
					branch = "main"
					resolvedBranch = "main"
					out = outMain
					err = nil
				}
			}
			if err != nil {
				output = out
				gitErr = err
			}
		}

		if gitErr == nil {
			if hasOrigin {
				targetRef := "refs/remotes/origin/" + branch

				// 使用 checkout -B 强制对齐 targetRef，天然免疫 force-push / rebase 导致的分叉与浅克隆跨分支切换
				if out, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "checkout", "-B", branch, targetRef); err != nil {
					if outFallback, _, errFallback := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "checkout", "-f", branch); errFallback != nil {
						output = out
						gitErr = err
					} else {
						output = outFallback
					}
				} else {
					output = out
				}

				if gitErr == nil {
					if resetOut, _, resetErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "reset", "--hard", targetRef); resetErr == nil {
						output = resetOut
					}
					if cleanUntracked {
						if cleanOut, _, cleanErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "clean", "-fd"); cleanErr != nil {
							log.Printf("[GitSync] 清理未跟踪文件告警 (%s): %s (%v)", localPath, SanitizeGitOutput(string(cleanOut)), cleanErr)
						}
					}
				}
			} else {
				if out, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "checkout", "-f", branch); err != nil {
					output = out
					gitErr = err
				} else {
					output = out
				}
			}
		}
	} else {
		log.Printf("[GitSync] 执行全新克隆 (分支: %s, depth: %d) -> %s", branch, depth, localPath)
		cloneArgs := []string{"clone"}
		if depth > 0 {
			cloneArgs = append(cloneArgs, "--depth="+strconv.Itoa(depth))
		}
		cloneArgs = append(cloneArgs, "-b", branch, repoURL, localPath)

		output, _, gitErr = ExecCommandWithProcessGroup(ctx, "", "git", cloneArgs...)
		if gitErr != nil && branch == "master" && !IsAuthOrPermissionError(string(output)+" "+gitErr.Error()) {
			log.Printf("[GitSync] 指定分支 %s 克隆失败，尝试默认分支克隆 -> %s", branch, localPath)
			if rmErr := os.RemoveAll(localPath); rmErr != nil {
				log.Printf("[GitSync] 清理失败克隆残余目录 %s 告警: %v", localPath, rmErr)
			}
			fallbackArgs := []string{"clone"}
			if depth > 0 {
				fallbackArgs = append(fallbackArgs, "--depth="+strconv.Itoa(depth))
			}
			fallbackArgs = append(fallbackArgs, repoURL, localPath)
			outputFallback, _, fallbackErr := ExecCommandWithProcessGroup(ctx, "", "git", fallbackArgs...)
			if fallbackErr == nil {
				gitErr = nil
				output = outputFallback
				if brOut, _, brErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "rev-parse", "--abbrev-ref", "HEAD"); brErr == nil {
					if actualBranch := strings.TrimSpace(string(brOut)); actualBranch != "" && actualBranch != "HEAD" {
						resolvedBranch = actualBranch
					}
				}
			}
		}
	}

	return output, resolvedBranch, gitErr
}

// CleanExistingWorkspace 在同步前重置托管工作区，避免上次运行残留的未跟踪产物污染后续分析。
func CleanExistingWorkspace(ctx context.Context, localPath string) error {
	if _, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "rev-parse", "--verify", "HEAD"); err != nil {
		return fmt.Errorf("resolve current HEAD: %w", err)
	}
	if out, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "reset", "--hard"); err != nil {
		return fmt.Errorf("reset worktree: %s: %w", SanitizeGitOutput(string(out)), err)
	}
	if out, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "clean", "-fd"); err != nil {
		return fmt.Errorf("clean untracked files: %s: %w", SanitizeGitOutput(string(out)), err)
	}
	return nil
}
