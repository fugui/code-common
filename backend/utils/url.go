package utils

import (
	"regexp"
	"strings"
)

// SSHToHTTPS 将 SSH 或其它协议的 Git URL 转换为标准 HTTPS 访问地址
func SSHToHTTPS(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}

	rawURL = strings.TrimPrefix(rawURL, "ssh://")

	if strings.Contains(rawURL, "git@") {
		parts := strings.SplitN(rawURL, "git@", 2)
		afterGit := parts[1]

		// 匹配第一个 ":"，如果它后面跟着的不是数字（即非端口号），就把它换成 "/"
		reg := regexp.MustCompile(`:([^0-9])`)
		afterGit = reg.ReplaceAllString(afterGit, "/$1")

		return "https://" + afterGit
	}

	if strings.HasPrefix(rawURL, "http://") {
		return "https://" + strings.TrimPrefix(rawURL, "http://")
	}

	if strings.HasPrefix(rawURL, "https://") {
		return rawURL
	}

	return "https://" + rawURL
}

// ExtractRepoPath 提取不含协议、Host 与末尾 .git 的仓库路径（如 "org/group/repo"）
func ExtractRepoPath(repoURL string) string {
	httpsURL := SSHToHTTPS(repoURL)
	if httpsURL == "" {
		return ""
	}

	pathPart := strings.TrimPrefix(httpsURL, "https://")
	firstSlash := strings.Index(pathPart, "/")
	if firstSlash == -1 {
		return ""
	}
	pathPart = pathPart[firstSlash+1:]
	pathPart = strings.TrimSuffix(pathPart, ".git")
	return strings.Trim(pathPart, "/")
}
