package gitsync

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// ErrOriginURLMismatch 表示本地缓存目录的 remote.origin.url 与期望仓库 URL 归一化后不一致（防跨服务器同名碰撞）。
var ErrOriginURLMismatch = errors.New("本地缓存目录 remote.origin.url 与期望仓库 URL 不一致")

// ResolveRepoLocalPath 将远端 Git 仓库 URL 映射为宿主机共享缓存目录 <codesRoot>/<group>/<repo>。
// 对 https:// / http:// / ssh:// 路径提取逻辑严格与 code-shield 现有实现逐字节一致：
// TrimSuffix(TrimPrefix(u.Path, "/"), ".git")；同时兼容 SCP 风格 git@host:group/repo.git 并阻断路径穿越。
func ResolveRepoLocalPath(codesRoot, repoURL string) (string, error) {
	rootTrimmed := strings.TrimSpace(codesRoot)
	if rootTrimmed == "" {
		return "", fmt.Errorf("codesRoot 不能为空")
	}
	absRoot, err := filepath.Abs(filepath.Clean(rootTrimmed))
	if err != nil {
		return "", fmt.Errorf("解析 codesRoot 绝对路径失败: %w", err)
	}

	trimmedURL := strings.TrimSpace(repoURL)
	if trimmedURL == "" || strings.HasPrefix(trimmedURL, "-") {
		return "", fmt.Errorf("仓库地址非法或为空")
	}
	if hasUnsafeControlOrBackslash(trimmedURL) {
		return "", fmt.Errorf("仓库地址包含非法控制字符或反斜杠")
	}

	rawPath := ""
	if isSCPStyleURL(trimmedURL) {
		colonIdx := strings.IndexByte(trimmedURL, ':')
		rawPath = trimmedURL[colonIdx+1:]
		rawPath = strings.TrimSuffix(strings.TrimPrefix(rawPath, "/"), ".git")
	} else {
		u, parseErr := url.Parse(trimmedURL)
		if parseErr != nil {
			return "", fmt.Errorf("解析仓库 URL 失败: %w", parseErr)
		}
		rawPath = strings.TrimSuffix(strings.TrimPrefix(u.Path, "/"), ".git")
	}

	rawPath = strings.Trim(rawPath, "/")
	if rawPath == "" {
		return "", fmt.Errorf("仓库 URL 缺少有效路径段: %q", SanitizeGitOutput(trimmedURL))
	}
	if err := validateSafeRelSegments(rawPath); err != nil {
		return "", err
	}

	joined := filepath.Join(absRoot, filepath.FromSlash(rawPath))
	absTarget, err := filepath.Abs(joined)
	if err != nil {
		return "", fmt.Errorf("解析目标缓存路径失败: %w", err)
	}

	rel, relErr := filepath.Rel(absRoot, absTarget)
	if relErr != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("仓库映射路径越界 (%q -> %q)", rawPath, absTarget)
	}
	return absTarget, nil
}

func isSCPStyleURL(rawURL string) bool {
	if strings.Contains(rawURL, "://") {
		return false
	}
	atIdx := strings.IndexByte(rawURL, '@')
	colonIdx := strings.IndexByte(rawURL, ':')
	return atIdx > 0 && colonIdx > atIdx+1
}

func hasUnsafeControlOrBackslash(s string) bool {
	if strings.ContainsRune(s, '\\') {
		return true
	}
	for _, r := range s {
		if r < 0x20 || r == 0x7f {
			return true
		}
	}
	return false
}

func validateSafeRelSegments(relSlash string) error {
	if strings.HasPrefix(relSlash, "/") {
		return fmt.Errorf("仓库映射路径禁止绝对路径: %q", relSlash)
	}
	for _, seg := range strings.Split(relSlash, "/") {
		if seg == "" || seg == "." || seg == ".." || hasUnsafeControlOrBackslash(seg) {
			return fmt.Errorf("仓库映射路径包含非法段 %q", relSlash)
		}
	}
	return nil
}

// NormalizeGitURL 归一化 Git 仓库地址（移除内嵌凭据、统一协议/端口/尾缀 `.git` 与斜杠），用于跨进程碰撞校验。
func NormalizeGitURL(rawURL string) string {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return ""
	}
	if isSCPStyleURL(trimmed) {
		atIdx := strings.IndexByte(trimmed, '@')
		colonIdx := strings.IndexByte(trimmed, ':')
		host := strings.ToLower(strings.TrimSpace(trimmed[atIdx+1 : colonIdx]))
		repoPath := strings.Trim(strings.TrimSuffix(strings.TrimSpace(trimmed[colonIdx+1:]), ".git"), "/")
		return host + "/" + repoPath
	}
	if strings.HasPrefix(trimmed, "/") || strings.HasPrefix(trimmed, "./") || strings.HasPrefix(trimmed, "../") {
		abs, err := filepath.Abs(trimmed)
		if err == nil {
			trimmed = abs
		}
		return "file://" + strings.TrimSuffix(strings.TrimRight(trimmed, "/"), ".git")
	}
	u, err := url.Parse(trimmed)
	if err != nil {
		return strings.ToLower(strings.TrimSuffix(strings.TrimRight(trimmed, "/"), ".git"))
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme == "file" {
		p := filepath.Clean(u.Path)
		return "file://" + strings.TrimSuffix(strings.TrimRight(p, "/"), ".git")
	}
	host := strings.ToLower(u.Hostname())
	port := u.Port()
	defaultPort := ""
	switch scheme {
	case "http":
		defaultPort = "80"
	case "https":
		defaultPort = "443"
	case "ssh":
		defaultPort = "22"
	}
	if port != "" && port != defaultPort {
		host = host + ":" + port
	}
	repoPath := strings.Trim(strings.TrimSuffix(u.Path, ".git"), "/")
	if host == "" {
		return repoPath
	}
	return host + "/" + repoPath
}

// VerifyOriginURLConsistency 校验本地缓存目录的 remote.origin.url 与期望仓库地址归一化后是否一致。
func VerifyOriginURLConsistency(ctx context.Context, localPath, expectedURL string) error {
	if ctx == nil {
		ctx = context.Background()
	}
	gitDir := filepath.Join(localPath, ".git")
	if st, err := os.Stat(gitDir); err != nil || !st.IsDir() {
		return nil
	}
	out, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "config", "--get", "remote.origin.url")
	if err != nil {
		// 若尚未配置 origin remote，不阻断
		return nil
	}
	actualURL := strings.TrimSpace(string(out))
	if actualURL == "" {
		return nil
	}
	normActual := NormalizeGitURL(actualURL)
	normExpected := NormalizeGitURL(expectedURL)
	if normActual != normExpected {
		log.Printf("[GitSync] 警告: 目录 %s 的 origin URL (%s) 与期望仓库 URL (%s) 不一致，拒绝覆盖",
			localPath, SanitizeGitOutput(actualURL), SanitizeGitOutput(expectedURL))
		return fmt.Errorf("%w: actual=%q expected=%q", ErrOriginURLMismatch, SanitizeGitOutput(actualURL), SanitizeGitOutput(expectedURL))
	}
	return nil
}

// ResolveBranchDefault 统一分支名解析（空分支名默认回退为 master）。
func ResolveBranchDefault(branch string) string {
	trimmed := strings.TrimSpace(branch)
	if trimmed == "" {
		return "master"
	}
	return trimmed
}

// IsShallowRepository 检测本地缓存仓库是否为浅克隆仓库。
func IsShallowRepository(ctx context.Context, localPath string) (bool, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	gitDir := filepath.Join(localPath, ".git")
	if st, err := os.Stat(gitDir); err != nil || !st.IsDir() {
		return false, nil
	}
	out, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "rev-parse", "--is-shallow-repository")
	if err != nil {
		// 兼容旧版 git 退化检查 .git/shallow
		if _, sErr := os.Stat(filepath.Join(gitDir, "shallow")); sErr == nil {
			return true, nil
		}
		return false, nil
	}
	return strings.EqualFold(strings.TrimSpace(string(out)), "true"), nil
}
