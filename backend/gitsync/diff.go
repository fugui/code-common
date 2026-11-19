package gitsync

import (
	"context"
	"fmt"
	"path"
	"regexp"
	"strings"
)

var commitSHAPattern = regexp.MustCompile(`^[0-9a-fA-F]{7,40}$`)

// ChangedFile 描述两次提交间的文件级变更。
type ChangedFile struct {
	Status  string // "A" | "M" | "D" | "R"
	Path    string
	OldPath string // 重命名时非空
}

// LsRemoteHead 轻量查询远端指定分支的最新提交哈希（仅执行 git ls-remote，不拉取对象、不克隆）。
// 当 branch 为空或为 "master" 且远端不存在 refs/heads/master 时，自动回退查询 refs/heads/main。
func LsRemoteHead(ctx context.Context, repoURL, branch string) (commitSHA string, resolvedBranch string, err error) {
	repoURL = strings.TrimSpace(repoURL)
	if repoURL == "" || strings.HasPrefix(repoURL, "-") {
		return "", "", fmt.Errorf("仓库地址非法或为空")
	}

	targetBranch := strings.TrimSpace(branch)
	if targetBranch == "" {
		targetBranch = "master"
	}
	if strings.HasPrefix(targetBranch, "-") {
		return "", "", fmt.Errorf("非法的分支名称: %q", targetBranch)
	}

	sha, found, err := lsRemoteSingleBranch(ctx, repoURL, targetBranch)
	if err != nil {
		return "", "", err
	}
	if found {
		return sha, targetBranch, nil
	}

	if targetBranch == "master" {
		mainSHA, mainFound, mainErr := lsRemoteSingleBranch(ctx, repoURL, "main")
		if mainErr != nil {
			return "", "", mainErr
		}
		if mainFound {
			return mainSHA, "main", nil
		}
	}

	return "", "", fmt.Errorf("远端仓库未找到分支 %q", targetBranch)
}

func lsRemoteSingleBranch(ctx context.Context, repoURL, branch string) (string, bool, error) {
	refName := "refs/heads/" + branch
	out, _, err := ExecCommandWithProcessGroup(ctx, "", "git", "ls-remote", "--heads", repoURL, refName)
	if err != nil {
		return "", false, fmt.Errorf("git ls-remote failed: %s: %w", strings.TrimSpace(SanitizeGitOutput(string(out))), err)
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) >= 2 && fields[1] == refName && commitSHAPattern.MatchString(fields[0]) {
			return fields[0], true, nil
		}
	}
	return "", false, nil
}

// DiffNameStatus 计算两次提交之间的文件级变更清单（A/M/D/R）。
func DiffNameStatus(ctx context.Context, localPath, baseSHA, headSHA string) ([]ChangedFile, error) {
	if !commitSHAPattern.MatchString(baseSHA) {
		return nil, fmt.Errorf("非法的 baseSHA: %q", baseSHA)
	}
	if !commitSHAPattern.MatchString(headSHA) {
		return nil, fmt.Errorf("非法的 headSHA: %q", headSHA)
	}

	out, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "diff", "--name-status", "-M", baseSHA, headSHA)
	if err != nil {
		return nil, fmt.Errorf("git diff --name-status failed: %s: %w", strings.TrimSpace(SanitizeGitOutput(string(out))), err)
	}

	raw := strings.TrimSpace(string(out))
	if raw == "" {
		return []ChangedFile{}, nil
	}

	lines := strings.Split(raw, "\n")
	result := make([]ChangedFile, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 2 {
			continue
		}
		statusCode := strings.TrimSpace(parts[0])
		if strings.HasPrefix(statusCode, "R") && len(parts) >= 3 {
			result = append(result, ChangedFile{
				Status:  "R",
				OldPath: parts[1],
				Path:    parts[2],
			})
			continue
		}
		if len(statusCode) > 1 {
			statusCode = statusCode[:1]
		}
		result = append(result, ChangedFile{
			Status: statusCode,
			Path:   parts[1],
		})
	}
	return result, nil
}

// ShowFileAtCommit 读取指定历史提交中的单个文件内容（不切换工作区 HEAD）。
func ShowFileAtCommit(ctx context.Context, localPath, commitSHA, relPath string) ([]byte, error) {
	if !commitSHAPattern.MatchString(commitSHA) {
		return nil, fmt.Errorf("非法的 commitSHA: %q", commitSHA)
	}
	if strings.ContainsRune(relPath, '\x00') || strings.Contains(relPath, "\\") || strings.HasPrefix(relPath, "/") {
		return nil, fmt.Errorf("非法的文件相对路径: %q", relPath)
	}
	cleaned := path.Clean(strings.TrimSpace(relPath))
	if cleaned == "." || cleaned == "" || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return nil, fmt.Errorf("非法的文件相对路径: %q", relPath)
	}

	spec := commitSHA + ":" + cleaned
	out, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "show", spec)
	if err != nil {
		return nil, fmt.Errorf("git show %s failed: %s: %w", spec, strings.TrimSpace(SanitizeGitOutput(string(out))), err)
	}
	return out, nil
}

// FetchCommitMetadata 按需拉取指定历史提交对象至本地浅克隆仓库（用于历史版本源码预览与双提交 Diff）。
func FetchCommitMetadata(ctx context.Context, localPath, repoURL, commitSHA string) error {
	if !commitSHAPattern.MatchString(commitSHA) {
		return fmt.Errorf("非法的 commitSHA: %q", commitSHA)
	}

	// 若本地已包含该提交对象，直接返回
	if _, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "cat-file", "-e", commitSHA+"^{commit}"); err == nil {
		return nil
	}

	pathLock := GetPathLock(localPath)
	pathLock.Lock()
	defer pathLock.Unlock()

	// 加锁后二次确认
	if _, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "cat-file", "-e", commitSHA+"^{commit}"); err == nil {
		return nil
	}

	CleanStaleGitLocks(localPath)

	remote := "origin"
	if strings.TrimSpace(repoURL) != "" {
		remote = strings.TrimSpace(repoURL)
	}

	// 优先按单提交深度拉取
	if _, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "fetch", "--depth=1", remote, commitSHA); err == nil {
		return nil
	}

	// 兼容未开启 allowAnySHA1InWant 的远端或本地裸仓：退化为解除浅克隆限制全量补齐
	out, _, unshallowErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "fetch", "--unshallow", remote)
	if unshallowErr != nil {
		// 若当前仓库本身不是浅克隆，尝试常规 fetch
		if out2, _, fetchErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "fetch", remote); fetchErr != nil {
			return fmt.Errorf("fetch commit %s failed: %s / %s: %w", commitSHA,
				strings.TrimSpace(SanitizeGitOutput(string(out))),
				strings.TrimSpace(SanitizeGitOutput(string(out2))),
				fetchErr)
		}
	}

	if checkOut, _, checkErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "cat-file", "-e", commitSHA+"^{commit}"); checkErr != nil {
		return fmt.Errorf("拉取后仍未找到提交 %s: %s: %w", commitSHA, strings.TrimSpace(SanitizeGitOutput(string(checkOut))), checkErr)
	}
	return nil
}
