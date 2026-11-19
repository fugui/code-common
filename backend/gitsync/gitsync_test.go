package gitsync

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

func runTestGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{
		"-c", "user.name=GitSync Test",
		"-c", "user.email=gitsync-test@example.com",
	}, args...)...)
	if dir != "" {
		cmd.Dir = dir
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s 失败: %v\n%s", strings.Join(args, " "), err, string(out))
	}
	return strings.TrimSpace(string(out))
}

func initBareRepoWithCommits(t *testing.T, branch string) (bareDir string, seedDir string, sha1 string) {
	t.Helper()
	tmp := t.TempDir()
	bareDir = filepath.Join(tmp, "remote.git")
	seedDir = filepath.Join(tmp, "seed")

	if err := os.MkdirAll(bareDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(seedDir, 0755); err != nil {
		t.Fatal(err)
	}

	runTestGit(t, bareDir, "init", "--bare", "--initial-branch="+branch)
	runTestGit(t, seedDir, "init", "--initial-branch="+branch)
	if err := os.WriteFile(filepath.Join(seedDir, "README.md"), []byte("v1\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(seedDir, "keep.txt"), []byte("keep-v1\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(seedDir, "obsolete.txt"), []byte("to-be-deleted\n"), 0644); err != nil {
		t.Fatal(err)
	}
	runTestGit(t, seedDir, "add", ".")
	runTestGit(t, seedDir, "commit", "-m", "initial commit")
	runTestGit(t, seedDir, "remote", "add", "origin", bareDir)
	runTestGit(t, seedDir, "push", "-u", "origin", branch)
	sha1 = runTestGit(t, seedDir, "rev-parse", "HEAD")
	return bareDir, seedDir, sha1
}

func TestSyncLocalBareRepoAndConcurrentLock(t *testing.T) {
	bareDir, _, expectedSHA := initBareRepoWithCommits(t, "master")
	localPath := filepath.Join(t.TempDir(), "sandbox", "repo_1")

	const workers = 5
	var wg sync.WaitGroup
	results := make([]*SyncResult, workers)
	errs := make([]error, workers)

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			res, err := Sync(context.Background(), SyncOptions{
				RepoURL:        bareDir,
				LocalPath:      localPath,
				Branch:         "master",
				Depth:          1,
				Timeout:        30 * time.Second,
				AutoHealCache:  true,
				CleanUntracked: true,
			})
			results[idx] = res
			errs[idx] = err
		}(i)
	}
	wg.Wait()

	for i := 0; i < workers; i++ {
		if errs[i] != nil {
			t.Fatalf("协程 %d 并发 Sync 失败: %v", i, errs[i])
		}
		if results[i] == nil {
			t.Fatalf("协程 %d 返回空 SyncResult", i)
		}
		if len(results[i].CommitSHA) != 40 {
			t.Fatalf("期望 40 位 CommitSHA，实际为 %q", results[i].CommitSHA)
		}
		if results[i].CommitSHA != expectedSHA {
			t.Fatalf("协程 %d CommitSHA 不一致: got=%s want=%s", i, results[i].CommitSHA, expectedSHA)
		}
		if results[i].ResolvedBranch != "master" {
			t.Fatalf("期望 ResolvedBranch=master，实际为 %q", results[i].ResolvedBranch)
		}
	}

	// 验证同路径互斥锁返回相同实例
	if GetPathLock(localPath) != GetPathLock(localPath) {
		t.Fatal("GetPathLock 应对同一规范路径返回同一锁实例")
	}
}

func TestCleanStaleGitLocks(t *testing.T) {
	bareDir, _, expectedSHA := initBareRepoWithCommits(t, "master")
	localPath := filepath.Join(t.TempDir(), "repo_lock_test")

	// 首次同步建立本地仓库
	if _, err := Sync(context.Background(), SyncOptions{
		RepoURL:        bareDir,
		LocalPath:      localPath,
		Branch:         "master",
		AutoHealCache:  true,
		CleanUntracked: true,
	}); err != nil {
		t.Fatalf("首次 Sync 失败: %v", err)
	}

	// 人工注入残留锁文件
	indexLock := filepath.Join(localPath, ".git", "index.lock")
	shallowLock := filepath.Join(localPath, ".git", "shallow.lock")
	refsLock := filepath.Join(localPath, ".git", "refs", "heads", "master.lock")
	for _, p := range []string{indexLock, shallowLock, refsLock} {
		if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("stale"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	// 再次同步应自动清理残留锁并成功
	res, err := Sync(context.Background(), SyncOptions{
		RepoURL:        bareDir,
		LocalPath:      localPath,
		Branch:         "master",
		AutoHealCache:  true,
		CleanUntracked: true,
	})
	if err != nil {
		t.Fatalf("存在残留锁文件时 Sync 应自愈成功，实际失败: %v", err)
	}
	if res.CommitSHA != expectedSHA {
		t.Fatalf("CommitSHA 不匹配: got=%s want=%s", res.CommitSHA, expectedSHA)
	}

	for _, p := range []string{indexLock, shallowLock, refsLock} {
		if _, statErr := os.Stat(p); !os.IsNotExist(statErr) {
			t.Fatalf("残留锁文件 %s 未被清理", p)
		}
	}
}

func TestExecCommandProcessGroupCancelKillsChild(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "child.pid")
	script := fmt.Sprintf("sleep 30 & echo $! > %s; wait", pidFile)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		// 等待子进程 PID 文件落盘后再取消
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			if data, err := os.ReadFile(pidFile); err == nil && strings.TrimSpace(string(data)) != "" {
				break
			}
			time.Sleep(15 * time.Millisecond)
		}
		time.Sleep(80 * time.Millisecond)
		cancel()
	}()

	start := time.Now()
	_, _, err := ExecCommandWithProcessGroup(ctx, "", "sh", "-c", script)
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("ctx 取消后期望返回错误")
	}
	if elapsed > 3*time.Second {
		t.Fatalf("ctx 取消后命令退出过慢: %v", elapsed)
	}

	rawPID, readErr := os.ReadFile(pidFile)
	if readErr != nil {
		t.Fatalf("未能读取子进程 PID 文件: %v", readErr)
	}
	childPID, convErr := strconv.Atoi(strings.TrimSpace(string(rawPID)))
	if convErr != nil || childPID <= 0 {
		t.Fatalf("解析子进程 PID 失败: %q (%v)", string(rawPID), convErr)
	}

	// 轮询短时间确认内核已完成子进程回收（ESRCH）
	alive := true
	for i := 0; i < 20; i++ {
		if killErr := syscall.Kill(childPID, 0); killErr == syscall.ESRCH {
			alive = false
			break
		}
		time.Sleep(25 * time.Millisecond)
	}
	if alive {
		_ = syscall.Kill(childPID, syscall.SIGKILL)
		t.Fatalf("子进程 PID=%d 未随进程组被强杀，存在孤儿进程泄漏", childPID)
	}
}

func TestLsRemoteHeadAndDiffAndShowFile(t *testing.T) {
	bareDir, seedDir, sha1 := initBareRepoWithCommits(t, "main")

	// 验证 master 默认参数可智能回退至 main
	headSHA1, resolved1, err := LsRemoteHead(context.Background(), bareDir, "master")
	if err != nil {
		t.Fatalf("LsRemoteHead (fallback main) 失败: %v", err)
	}
	if headSHA1 != sha1 || resolved1 != "main" {
		t.Fatalf("LsRemoteHead 结果不符: sha=%s (want %s), branch=%s (want main)", headSHA1, sha1, resolved1)
	}

	// 推进第 2 次提交：修改 README.md，新增 added.txt，删除 obsolete.txt
	if err := os.WriteFile(filepath.Join(seedDir, "README.md"), []byte("v2\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(seedDir, "added.txt"), []byte("new file\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(seedDir, "obsolete.txt")); err != nil {
		t.Fatal(err)
	}
	runTestGit(t, seedDir, "add", "-A")
	runTestGit(t, seedDir, "commit", "-m", "second commit")
	runTestGit(t, seedDir, "push", "origin", "main")
	sha2 := runTestGit(t, seedDir, "rev-parse", "HEAD")

	// LsRemoteHead 返回最新 SHA
	headSHA2, resolved2, err := LsRemoteHead(context.Background(), bareDir, "main")
	if err != nil {
		t.Fatalf("LsRemoteHead 第 2 次提交失败: %v", err)
	}
	if headSHA2 != sha2 || resolved2 != "main" {
		t.Fatalf("LsRemoteHead 不符: got (%s, %s), want (%s, main)", headSHA2, resolved2, sha2)
	}

	// 浅克隆同步本地仓（depth=1），再用 FetchCommitMetadata 按需拉取历史提交
	localPath := filepath.Join(t.TempDir(), "shallow_work")
	syncRes, err := Sync(context.Background(), SyncOptions{
		RepoURL:        bareDir,
		LocalPath:      localPath,
		Branch:         "master", // 测试 master -> main 自动回退
		Depth:          1,
		AutoHealCache:  true,
		CleanUntracked: true,
	})
	if err != nil {
		t.Fatalf("Sync 失败: %v", err)
	}
	if syncRes.CommitSHA != sha2 || syncRes.ResolvedBranch != "main" {
		t.Fatalf("Sync 结果不符: got (%s, %s), want (%s, main)", syncRes.CommitSHA, syncRes.ResolvedBranch, sha2)
	}

	// 按需补齐旧提交以便 DiffNameStatus 与 ShowFileAtCommit 工作
	if err := FetchCommitMetadata(context.Background(), localPath, bareDir, sha1); err != nil {
		t.Fatalf("FetchCommitMetadata 失败: %v", err)
	}

	// 验证 DiffNameStatus 精确返回 A / M / D
	changes, err := DiffNameStatus(context.Background(), localPath, sha1, sha2)
	if err != nil {
		t.Fatalf("DiffNameStatus 失败: %v", err)
	}
	changeMap := make(map[string]string, len(changes))
	for _, ch := range changes {
		changeMap[ch.Path] = ch.Status
	}
	if changeMap["added.txt"] != "A" || changeMap["README.md"] != "M" || changeMap["obsolete.txt"] != "D" {
		t.Fatalf("DiffNameStatus 变更集不符: %+v", changes)
	}

	// 验证 ShowFileAtCommit 精确读取旧提交文件内容
	oldReadme, err := ShowFileAtCommit(context.Background(), localPath, sha1, "README.md")
	if err != nil {
		t.Fatalf("ShowFileAtCommit 读取旧版本 README.md 失败: %v", err)
	}
	if string(oldReadme) != "v1\n" {
		t.Fatalf("旧版本 README.md 内容不符: got %q, want %q", string(oldReadme), "v1\n")
	}

	oldObsolete, err := ShowFileAtCommit(context.Background(), localPath, sha1, "obsolete.txt")
	if err != nil {
		t.Fatalf("ShowFileAtCommit 读取旧版本 obsolete.txt 失败: %v", err)
	}
	if string(oldObsolete) != "to-be-deleted\n" {
		t.Fatalf("旧版本 obsolete.txt 内容不符: got %q", string(oldObsolete))
	}
}

func TestAuthErrorFastFailNoHealRetry(t *testing.T) {
	// 1. 关键词识别断言
	authSamples := []string{
		"Permission denied (publickey).",
		"fatal: Authentication failed for 'https://git.example.com/repo.git'",
		"fatal: could not read Username for 'https://git.example.com': terminal prompts disabled",
		"Host key verification failed.",
		"remote: Repository not found.",
		"error: The requested URL returned error: 403",
	}
	for _, sample := range authSamples {
		if !IsAuthOrPermissionError(sample) {
			t.Errorf("期望识别为鉴权/权限错误: %q", sample)
		}
	}
	if IsAuthOrPermissionError("fatal: index file corrupt") {
		t.Error("本地索引损坏不应误判为鉴权错误")
	}

	// 2. 模拟无效 SSH 地址（本机关闭端口），验证在 30s 内快速失败且触发权限/连接错误而非挂死
	// 同时验证不存在的本地/远端仓库触发 "does not exist" -> IsAuthOrPermissionError == true
	nonExistentURL := "file://" + filepath.Join(t.TempDir(), "no-such-repo.git")
	localPath := filepath.Join(t.TempDir(), "work_auth_fail")
	start := time.Now()
	_, err := Sync(context.Background(), SyncOptions{
		RepoURL:       nonExistentURL,
		LocalPath:     localPath,
		Branch:        "master",
		Timeout:       20 * time.Second,
		AutoHealCache: true,
	})
	elapsed := time.Since(start)
	if err == nil {
		t.Fatal("无效仓库地址期望 Sync 失败")
	}
	if elapsed >= 30*time.Second {
		t.Fatalf("鉴权/不存在仓库失败耗时过长: %v", elapsed)
	}
	if !IsAuthOrPermissionError(err.Error()) {
		t.Fatalf("期望 IsAuthOrPermissionError 为 true，实际错误: %v", err)
	}

	// 3. 测试 SSH BatchMode 快速失败（不可达本机无效端口，确保不会挂死等交互输入）
	sshCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	sshStart := time.Now()
	_, sshErr := Sync(sshCtx, SyncOptions{
		RepoURL:       "ssh://invalid-user@127.0.0.1:1/nonexistent/repo.git",
		LocalPath:     filepath.Join(t.TempDir(), "ssh_fail"),
		Branch:        "master",
		Timeout:       15 * time.Second,
		AutoHealCache: true,
	})
	sshElapsed := time.Since(sshStart)
	if sshErr == nil {
		t.Fatal("无效 SSH 端口期望 Sync 返回错误")
	}
	if sshElapsed >= 30*time.Second {
		t.Fatalf("SSH 快速失败超出 30s 上限: %v", sshElapsed)
	}
}
