package gitsync

import (
	"bytes"
	"context"
	"errors"
	"log"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"syscall"
)

const defaultGitSSHCommand = "ssh -o BatchMode=yes -o ConnectTimeout=15"

var urlCredPattern = regexp.MustCompile(`(https?://)([^:@/\s]+):([^@/\s]+)@`)

// SanitizeGitOutput 脱敏 Git 命令输出中的内嵌 URL 凭据（如 https://user:pass@host），防止敏感信息泄露到日志或响应。
func SanitizeGitOutput(raw string) string {
	return urlCredPattern.ReplaceAllString(raw, "${1}***:***@")
}

// IsAuthOrPermissionError 判断 Git 输出或错误信息是否属于权限、鉴权或凭据类问题。
// 此类问题属于外部配置或凭证缺失，不能通过本地缓存清理重试解决，应快速阻断并向调用方明确报告。
func IsAuthOrPermissionError(msg string) bool {
	lower := strings.ToLower(msg)
	authPatterns := []string{
		"permission denied",
		"authentication failed",
		"could not read username",
		"could not read password",
		"host key verification failed",
		"repository not found",
		"does not exist",
		"returned error: 401",
		"returned error: 403",
		"access denied",
		"not allowed to",
		"unauthorized",
		"invalid credentials",
		"key exchange failed",
		"could not read from remote repository",
		"correct access rights",
		"does not appear to be a git repository",
	}
	for _, pattern := range authPatterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

// ExecCommandWithProcessGroup 执行外部命令，并为其创建独立的 Linux 进程组 (Setpgid=true, Pdeathsig=SIGKILL)。
// 当 Context 被取消或超时时，向整个负进程组 (-pgid) 发送 SIGKILL 强杀并等待回收，彻底杜绝孤儿进程泄漏。
// 当执行 git 命令时，强制注入 GIT_TERMINAL_PROMPT=0 与非交互式 SSH BatchMode 参数，确保鉴权失败快速返回。
func ExecCommandWithProcessGroup(ctx context.Context, dir string, name string, args ...string) ([]byte, int, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	cmd := exec.Command(name, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid:   true,
		Pdeathsig: syscall.SIGKILL,
	}

	if name == "git" {
		cmd.Env = buildGitEnv(os.Environ())
	}

	var outputBuf bytes.Buffer
	cmd.Stdout = &outputBuf
	cmd.Stderr = &outputBuf

	if err := cmd.Start(); err != nil {
		return nil, -1, err
	}

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case err := <-done:
		exitCode := 0
		if cmd.ProcessState != nil {
			exitCode = cmd.ProcessState.ExitCode()
		}
		return outputBuf.Bytes(), exitCode, err
	case <-ctx.Done():
		if cmd.Process != nil {
			pgid := cmd.Process.Pid
			log.Printf("[GitSync/ProcessGroup] 上下文已取消，强制终止整个进程组 -%d (%s)", pgid, name)
			if killErr := syscall.Kill(-pgid, syscall.SIGKILL); killErr != nil && !errors.Is(killErr, syscall.ESRCH) {
				log.Printf("[GitSync/ProcessGroup] 发送 SIGKILL 至进程组 -%d 告警: %v", pgid, killErr)
			}
		}
		<-done
		return outputBuf.Bytes(), -1, ctx.Err()
	}
}

func buildGitEnv(baseEnv []string) []string {
	env := make([]string, 0, len(baseEnv)+2)
	hasSSHCommand := false
	for _, entry := range baseEnv {
		if strings.HasPrefix(entry, "GIT_TERMINAL_PROMPT=") {
			continue
		}
		if strings.HasPrefix(entry, "GIT_SSH_COMMAND=") {
			hasSSHCommand = true
		}
		env = append(env, entry)
	}
	env = append(env, "GIT_TERMINAL_PROMPT=0")
	if !hasSSHCommand {
		env = append(env, "GIT_SSH_COMMAND="+defaultGitSSHCommand)
	}
	return env
}
