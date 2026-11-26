package gitsync

import (
	"context"
	"fmt"
	"path"
	"regexp"
	"sort"
	"strings"
)

var (
	commitSHAPattern  = regexp.MustCompile(`^[0-9a-fA-F]{7,40}$`)
	branchNamePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$`)
)

// ChangedFile 描述两次提交间的文件级变更。
type ChangedFile struct {
	Status  string // "A" | "M" | "D" | "R"
	Path    string
	OldPath string // 重命名时非空
}

// RemoteBranch 描述远端 Git 仓库的单个分支摘要。
type RemoteBranch struct {
	Name      string `json:"name"`
	CommitSHA string `json:"commit_sha"`
	IsHead    bool   `json:"is_head"`
}

// ValidateBranchName 校验 Git 分支名称是否合法且安全，阻断命令行选项注入（- 前缀）与路径穿越。
func ValidateBranchName(branch string) error {
	if strings.TrimSpace(branch) == "" {
		return fmt.Errorf("分支名称不能为空")
	}
	if len(branch) > 128 {
		return fmt.Errorf("分支名称长度不能超过 128 个字符")
	}
	if strings.HasPrefix(branch, "-") {
		return fmt.Errorf("非法的分支名称: %q", branch)
	}
	if !branchNamePattern.MatchString(branch) {
		return fmt.Errorf("非法的分支名称: %q", branch)
	}
	if strings.Contains(branch, "..") || strings.Contains(branch, "//") || strings.Contains(branch, "@{") {
		return fmt.Errorf("非法的分支名称: %q", branch)
	}
	if strings.HasSuffix(branch, "/") || strings.HasSuffix(branch, ".") || strings.HasSuffix(branch, ".lock") {
		return fmt.Errorf("非法的分支名称: %q", branch)
	}
	for _, seg := range strings.Split(branch, "/") {
		if seg == "" || strings.HasPrefix(seg, ".") || strings.HasSuffix(seg, ".lock") {
			return fmt.Errorf("非法的分支名称: %q", branch)
		}
	}
	return nil
}

// ListRemoteBranches 轻量枚举远端仓库全部分支与默认 HEAD 分支（仅执行 git ls-remote --symref，零对象拉取）。
func ListRemoteBranches(ctx context.Context, repoURL string) (branches []RemoteBranch, headBranch string, err error) {
	if ctx == nil {
		ctx = context.Background()
	}
	repoURL = strings.TrimSpace(repoURL)
	if repoURL == "" || strings.HasPrefix(repoURL, "-") {
		return nil, "", fmt.Errorf("仓库地址非法或为空")
	}

	out, _, cmdErr := ExecCommandWithProcessGroup(ctx, "", "git", "ls-remote", "--symref", repoURL, "HEAD", "refs/heads/*")
	if cmdErr != nil {
		return nil, "", fmt.Errorf("git ls-remote failed: %s: %w", strings.TrimSpace(SanitizeGitOutput(string(out))), cmdErr)
	}

	seen := make(map[string]bool)
	lines := strings.Split(string(out), "\n")
	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "ref:") {
			rest := strings.TrimSpace(strings.TrimPrefix(line, "ref:"))
			fields := strings.Fields(rest)
			if len(fields) >= 2 && fields[len(fields)-1] == "HEAD" && strings.HasPrefix(fields[0], "refs/heads/") {
				headBranch = strings.TrimPrefix(fields[0], "refs/heads/")
			}
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 2 && commitSHAPattern.MatchString(fields[0]) && strings.HasPrefix(fields[1], "refs/heads/") {
			name := strings.TrimPrefix(fields[1], "refs/heads/")
			if name == "" || seen[name] {
				continue
			}
			seen[name] = true
			branches = append(branches, RemoteBranch{
				Name:      name,
				CommitSHA: fields[0],
			})
		}
	}

	for i := range branches {
		if headBranch != "" && branches[i].Name == headBranch {
			branches[i].IsHead = true
		}
	}

	sort.Slice(branches, func(i, j int) bool {
		if branches[i].IsHead != branches[j].IsHead {
			return branches[i].IsHead
		}
		return branches[i].Name < branches[j].Name
	})

	if branches == nil {
		branches = []RemoteBranch{}
	}
	return branches, headBranch, nil
}

// LsRemoteHead 轻量查询远端指定分支的最新提交哈希（仅执行 git ls-remote，不拉取对象、不克隆）。
// 当 branch 为空或为 "master" 且远端不存在 refs/heads/master 时，自动回退查询 refs/heads/main。
func LsRemoteHead(ctx context.Context, repoURL, branch string) (commitSHA string, resolvedBranch string, err error) {
	if ctx == nil {
		ctx = context.Background()
	}
	repoURL = strings.TrimSpace(repoURL)
	if repoURL == "" || strings.HasPrefix(repoURL, "-") {
		return "", "", fmt.Errorf("仓库地址非法或为空")
	}

	targetBranch := strings.TrimSpace(branch)
	if targetBranch == "" {
		targetBranch = "master"
	}
	if err := ValidateBranchName(targetBranch); err != nil {
		return "", "", err
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

// FetchCommitMetadata 按需拉取指定历史提交对象至本地仓库（用于历史版本源码预览与双提交 Diff）。
// 对已存在的非 shallow 仓库，严格禁止使用 `--depth=1`（防止写入 `.git/shallow` 导致共享缓存历史降级）。
func FetchCommitMetadata(ctx context.Context, localPath, repoURL, commitSHA string) error {
	if !commitSHAPattern.MatchString(commitSHA) {
		return fmt.Errorf("非法的 commitSHA: %q", commitSHA)
	}

	// 若本地已包含该提交对象，直接返回
	if _, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "cat-file", "-e", commitSHA+"^{commit}"); err == nil {
		return nil
	}

	repoLock, err := AcquireRepoLock(ctx, "", localPath, LockExclusive)
	if err != nil {
		return err
	}
	defer func() {
		_ = repoLock.Release()
	}()

	// 加锁后二次确认
	if _, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "cat-file", "-e", commitSHA+"^{commit}"); err == nil {
		return nil
	}

	CleanStaleGitLocks(localPath)

	remote := "origin"
	if strings.TrimSpace(repoURL) != "" {
		remote = strings.TrimSpace(repoURL)
	}

	shallow, _ := IsShallowRepository(ctx, localPath)
	if shallow {
		// 仅对本就是浅克隆的仓库按单提交深度补齐
		if _, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "fetch", "--depth=1", remote, commitSHA); err == nil {
			return nil
		}
	} else {
		// 非 shallow 仓库严禁传递 --depth，避免写入 .git/shallow
		if _, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-c", "gc.auto=0", "-c", "maintenance.auto=false", "-C", localPath, "fetch", "--no-tags", remote, commitSHA); err == nil {
			return nil
		}
	}

	if shallow {
		// 兼容未开启 allowAnySHA1InWant 的远端或本地裸仓：退化为解除浅克隆限制全量补齐
		out, _, unshallowErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "fetch", "--unshallow", remote)
		if unshallowErr != nil {
			if out2, _, fetchErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "fetch", "--no-tags", remote); fetchErr != nil {
				return fmt.Errorf("fetch commit %s failed: %s / %s: %w", commitSHA,
					strings.TrimSpace(SanitizeGitOutput(string(out))),
					strings.TrimSpace(SanitizeGitOutput(string(out2))),
					fetchErr)
			}
		}
	} else {
		if out2, _, fetchErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-c", "gc.auto=0", "-c", "maintenance.auto=false", "-C", localPath, "fetch", "--no-tags", remote); fetchErr != nil {
			return fmt.Errorf("fetch commit %s failed: %s: %w", commitSHA,
				strings.TrimSpace(SanitizeGitOutput(string(out2))),
				fetchErr)
		}
	}

	if checkOut, _, checkErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "cat-file", "-e", commitSHA+"^{commit}"); checkErr != nil {
		return fmt.Errorf("拉取后仍未找到提交 %s: %s: %w", commitSHA, strings.TrimSpace(SanitizeGitOutput(string(checkOut))), checkErr)
	}
	return nil
}
