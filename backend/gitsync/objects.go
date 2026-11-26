package gitsync

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// TreeEntry 描述 `git ls-tree -z` 返回的单个 Git 树对象条目。
type TreeEntry struct {
	Mode string
	Type string // blob | tree | commit
	SHA  string
	Path string
}

// CommitMeta 描述提交快照的血缘元数据。
type CommitMeta struct {
	CommitSHA     string
	AuthorName    string
	AuthorEmail   string
	CommittedAt   time.Time
	CommitMessage string
}

// FetchBranchToRef 在 LOCK_EX 下通过无工作树协议拉取目标分支至私有 ref 命名空间（如 refs/contract/heads/<branch>）。
// 绝不修改工作区/index，不修改 origin 配置与 refs/remotes/origin/*，且关闭自动 gc。
func FetchBranchToRef(ctx context.Context, codesRoot, localPath, repoURL, branch, refPrefix string, extraEnv ...string) (resolvedBranch string, fullRef string, err error) {
	if ctx == nil {
		ctx = context.Background()
	}
	repoURL = strings.TrimSpace(repoURL)
	if repoURL == "" || strings.HasPrefix(repoURL, "-") {
		return "", "", fmt.Errorf("仓库地址非法或为空")
	}
	localPath = strings.TrimSpace(localPath)
	if localPath == "" {
		return "", "", fmt.Errorf("本地缓存路径不能为空")
	}
	if absPath, absErr := filepath.Abs(filepath.Clean(localPath)); absErr == nil {
		localPath = absPath
	}
	refPrefix = strings.TrimRight(strings.TrimSpace(refPrefix), "/")
	if refPrefix == "" {
		refPrefix = "refs/contract/heads"
	}

	targetBranch := ResolveBranchDefault(branch)
	if err := ValidateBranchName(targetBranch); err != nil {
		return "", "", err
	}

	if err := os.MkdirAll(filepath.Dir(localPath), 0775); err != nil {
		return "", "", fmt.Errorf("创建缓存父目录失败: %w", err)
	}

	repoLock, err := AcquireRepoLock(ctx, codesRoot, localPath, LockExclusive)
	if err != nil {
		return "", "", err
	}
	defer func() {
		_ = repoLock.Release()
	}()

	CleanStaleGitLocks(localPath)

	gitDir := filepath.Join(localPath, ".git")
	if st, statErr := os.Stat(gitDir); statErr != nil || !st.IsDir() {
		// 首次拉取执行完整无工作树 clone（不带 --depth），后续 code-shield 同步可正常检出工作树
		cloneOut, _, cloneErr := ExecCommandWithProcessGroupEnv(
			ctx, "", extraEnv,
			"git", "-c", "gc.auto=0", "-c", "maintenance.auto=false",
			"clone", "--no-checkout", repoURL, localPath,
		)
		if cloneErr != nil {
			_ = os.RemoveAll(localPath)
			return "", "", fmt.Errorf("git clone --no-checkout 失败: %s: %w",
				strings.TrimSpace(SanitizeGitOutput(string(cloneOut))), cloneErr)
		}
	} else {
		if err := VerifyOriginURLConsistency(ctx, localPath, repoURL); err != nil {
			return "", "", err
		}
	}

	tryFetch := func(br string) ([]byte, error) {
		destRef := refPrefix + "/" + br
		refspec := fmt.Sprintf("+refs/heads/%s:%s", br, destRef)
		out, _, fErr := ExecCommandWithProcessGroupEnv(
			ctx, localPath, extraEnv,
			"git", "-c", "gc.auto=0", "-c", "maintenance.auto=false",
			"-C", localPath, "fetch", "--no-tags", "--no-write-fetch-head", repoURL, refspec,
		)
		return out, fErr
	}

	resolved := targetBranch
	out, fetchErr := tryFetch(targetBranch)
	if fetchErr != nil && targetBranch == "master" && !IsAuthOrPermissionError(SanitizeGitOutput(string(out))+" "+SanitizeGitOutput(fetchErr.Error())) {
		if outMain, errMain := tryFetch("main"); errMain == nil {
			resolved = "main"
			fetchErr = nil
		} else {
			out = append(out, '\n')
			out = append(out, outMain...)
		}
	}
	if fetchErr != nil {
		return "", "", fmt.Errorf("git fetch to ref %s failed: %s: %w",
			refPrefix+"/"+targetBranch, strings.TrimSpace(SanitizeGitOutput(string(out))), fetchErr)
	}

	return resolved, refPrefix + "/" + resolved, nil
}

// ResolveLocalRef 在不发起网络请求的情况下解析本地引用（如 LOCAL_CACHE_ONLY 模式下读取 refs/remotes/origin/<branch>）。
func ResolveLocalRef(ctx context.Context, localPath, refPrefix, branch string) (resolvedBranch string, fullRef string, err error) {
	if ctx == nil {
		ctx = context.Background()
	}
	refPrefix = strings.TrimRight(strings.TrimSpace(refPrefix), "/")
	if refPrefix == "" {
		refPrefix = "refs/remotes/origin"
	}
	targetBranch := ResolveBranchDefault(branch)
	if err := ValidateBranchName(targetBranch); err != nil {
		return "", "", err
	}

	verifyRef := func(br string) (string, bool) {
		cand := refPrefix + "/" + br
		if _, _, vErr := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "rev-parse", "--verify", "--quiet", cand+"^{commit}"); vErr == nil {
			return cand, true
		}
		return "", false
	}

	if ref, ok := verifyRef(targetBranch); ok {
		return targetBranch, ref, nil
	}
	if targetBranch == "master" {
		if ref, ok := verifyRef("main"); ok {
			return "main", ref, nil
		}
	}
	return "", "", fmt.Errorf("本地缓存未找到引用 %s/%s", refPrefix, targetBranch)
}

// ListTreeEntries 使用 `git ls-tree -z` 列举指定 ref 的树对象条目（规避 core.quotePath 对非 ASCII 路径的转义）。
func ListTreeEntries(ctx context.Context, localPath, ref string, recursive, dirsOnly bool, prefixes ...string) ([]TreeEntry, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	trimmedRef := strings.TrimSpace(ref)
	if trimmedRef == "" || strings.HasPrefix(trimmedRef, "-") {
		return nil, fmt.Errorf("非法的 Git 引用: %q", ref)
	}

	args := []string{"-C", localPath, "ls-tree", "-z"}
	if recursive {
		args = append(args, "-r")
	}
	if dirsOnly {
		args = append(args, "-d")
	}
	args = append(args, trimmedRef)
	if len(prefixes) > 0 {
		cleanPrefixes := make([]string, 0, len(prefixes))
		for _, p := range prefixes {
			trimmed := strings.TrimSpace(p)
			if trimmed == "" || strings.HasPrefix(trimmed, "-") {
				continue
			}
			cleanPrefixes = append(cleanPrefixes, trimmed)
		}
		if len(cleanPrefixes) > 0 {
			args = append(args, "--")
			args = append(args, cleanPrefixes...)
		}
	}

	out, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", args...)
	if err != nil {
		return nil, fmt.Errorf("git ls-tree 失败 (%s): %s: %w",
			trimmedRef, strings.TrimSpace(SanitizeGitOutput(string(out))), err)
	}
	return parseLsTreeZOutput(out), nil
}

func parseLsTreeZOutput(raw []byte) []TreeEntry {
	if len(raw) == 0 {
		return nil
	}
	records := bytes.Split(raw, []byte{0})
	entries := make([]TreeEntry, 0, len(records))
	for _, rec := range records {
		if len(rec) == 0 {
			continue
		}
		tabIdx := bytes.IndexByte(rec, '\t')
		if tabIdx <= 0 || tabIdx+1 >= len(rec) {
			continue
		}
		metaFields := strings.Fields(string(rec[:tabIdx]))
		if len(metaFields) < 3 {
			continue
		}
		entries = append(entries, TreeEntry{
			Mode: metaFields[0],
			Type: metaFields[1],
			SHA:  metaFields[2],
			Path: string(rec[tabIdx+1:]),
		})
	}
	return entries
}

// ReadBlobsBatch 通过单次 `git cat-file --batch` 流式读取一批 blob SHA 的原始字节内容。
// 超出 maxSingleBlobBytes（>0 时生效）的 blob 会安全跳过并在 blobErrs 中记录错误。
func ReadBlobsBatch(ctx context.Context, localPath string, shas []string, maxSingleBlobBytes int64) (map[string][]byte, map[string]error, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	blobs := make(map[string][]byte)
	blobErrs := make(map[string]error)
	if len(shas) == 0 {
		return blobs, blobErrs, nil
	}

	seen := make(map[string]struct{}, len(shas))
	uniqueSHAs := make([]string, 0, len(shas))
	var stdinBuf bytes.Buffer
	for _, sha := range shas {
		s := strings.TrimSpace(sha)
		if s == "" {
			continue
		}
		if !commitSHAPattern.MatchString(s) {
			blobErrs[s] = fmt.Errorf("非法的 blob SHA: %q", s)
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		uniqueSHAs = append(uniqueSHAs, s)
		stdinBuf.WriteString(s)
		stdinBuf.WriteByte('\n')
	}
	if len(uniqueSHAs) == 0 {
		return blobs, blobErrs, nil
	}

	cmd := exec.Command("git", "-C", localPath, "cat-file", "--batch")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid:   true,
		Pdeathsig: syscall.SIGKILL,
	}
	cmd.Env = buildGitEnv(os.Environ(), nil)
	cmd.Stdin = &stdinBuf

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, err
	}
	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		return nil, nil, err
	}

	doneWatch := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			if cmd.Process != nil {
				_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
			}
		case <-doneWatch:
		}
	}()

	reader := bufio.NewReaderSize(stdoutPipe, 64*1024)
	var parseErr error
	for _, expectedSHA := range uniqueSHAs {
		headerLine, rErr := reader.ReadString('\n')
		if rErr != nil {
			parseErr = fmt.Errorf("读取 cat-file --batch 头失败 (%s): %w", expectedSHA, rErr)
			break
		}
		headerTrimmed := strings.TrimSuffix(headerLine, "\n")
		parts := strings.Split(headerTrimmed, " ")
		if len(parts) < 2 {
			parseErr = fmt.Errorf("cat-file --batch 返回非法头: %q", headerTrimmed)
			break
		}
		objName := parts[0]
		if parts[1] == "missing" || len(parts) < 3 {
			blobErrs[objName] = fmt.Errorf("Git 对象不存在或类型异常: %s", headerTrimmed)
			continue
		}
		size, convErr := strconv.ParseInt(parts[2], 10, 64)
		if convErr != nil || size < 0 {
			parseErr = fmt.Errorf("解析 blob 大小失败 (%s): %q", objName, headerTrimmed)
			break
		}

		if maxSingleBlobBytes > 0 && size > maxSingleBlobBytes {
			if _, discErr := io.CopyN(io.Discard, reader, size); discErr != nil {
				parseErr = discErr
				break
			}
			if _, nlErr := reader.ReadByte(); nlErr != nil {
				parseErr = nlErr
				break
			}
			blobErrs[objName] = fmt.Errorf("文件体积 %d 字节超过上限 %d 字节", size, maxSingleBlobBytes)
			continue
		}

		data := make([]byte, size)
		if _, fullErr := io.ReadFull(reader, data); fullErr != nil {
			parseErr = fmt.Errorf("读取 blob 内容失败 (%s): %w", objName, fullErr)
			break
		}
		if _, nlErr := reader.ReadByte(); nlErr != nil {
			parseErr = fmt.Errorf("读取 blob 分隔符失败 (%s): %w", objName, nlErr)
			break
		}
		if parts[1] != "blob" {
			blobErrs[objName] = fmt.Errorf("对象 %s 类型为 %s，非 blob", objName, parts[1])
			continue
		}
		blobs[objName] = data
	}

	waitErr := cmd.Wait()
	close(doneWatch)

	if ctx.Err() != nil {
		return nil, nil, ctx.Err()
	}
	if parseErr != nil {
		return nil, nil, fmt.Errorf("%w (stderr: %s)", parseErr, strings.TrimSpace(SanitizeGitOutput(stderrBuf.String())))
	}
	if waitErr != nil {
		return nil, nil, fmt.Errorf("git cat-file --batch 异常退出: %s: %w",
			strings.TrimSpace(SanitizeGitOutput(stderrBuf.String())), waitErr)
	}
	return blobs, blobErrs, nil
}

// ReadCommitMeta 读取指定引用末端提交的 SHA、作者、提交时间与提交说明。
func ReadCommitMeta(ctx context.Context, localPath, ref string) (*CommitMeta, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	trimmedRef := strings.TrimSpace(ref)
	if trimmedRef == "" || strings.HasPrefix(trimmedRef, "-") {
		return nil, fmt.Errorf("非法的 Git 引用: %q", ref)
	}

	out, _, err := ExecCommandWithProcessGroup(
		ctx, localPath,
		"git", "-C", localPath, "log", "-1", "-z", "--format=%H%x00%an%x00%ae%x00%ct%x00%B", trimmedRef,
	)
	if err != nil {
		return nil, fmt.Errorf("git log -1 失败 (%s): %s: %w",
			trimmedRef, strings.TrimSpace(SanitizeGitOutput(string(out))), err)
	}

	raw := bytes.TrimSuffix(out, []byte{0})
	fields := bytes.SplitN(raw, []byte{0}, 5)
	if len(fields) < 5 {
		return nil, fmt.Errorf("解析 git log 输出失败: 字段数量不足 (%d)", len(fields))
	}

	unixSec, convErr := strconv.ParseInt(strings.TrimSpace(string(fields[3])), 10, 64)
	committedAt := time.Now().UTC()
	if convErr == nil && unixSec > 0 {
		committedAt = time.Unix(unixSec, 0).UTC()
	}

	return &CommitMeta{
		CommitSHA:     strings.TrimSpace(string(fields[0])),
		AuthorName:    string(fields[1]),
		AuthorEmail:   string(fields[2]),
		CommittedAt:   committedAt,
		CommitMessage: strings.TrimSpace(string(fields[4])),
	}, nil
}
