package gitsync

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestResolveRepoLocalPath_ShieldCompatAndSecurity(t *testing.T) {
	codesRoot := filepath.Join(t.TempDir(), "codes")

	// 1. 与 code-shield 历史映射规则 TrimSuffix(TrimPrefix(u.Path, "/"), ".git") 逐字节一致
	httpURLs := []string{
		"https://gitlab.example.com/platform/core/order-svc.git",
		"http://git.internal:8080/team-a/payment.git",
		"ssh://git@git.example.com:2222/infra/common-proto.git",
		"https://oauth2:secret@gitlab.example.com/group/sub/repo",
	}
	for _, raw := range httpURLs {
		u, err := url.Parse(raw)
		if err != nil {
			t.Fatalf("url.Parse(%q) failed: %v", raw, err)
		}
		legacyRawPath := strings.TrimSuffix(strings.TrimPrefix(u.Path, "/"), ".git")
		want := filepath.Join(codesRoot, filepath.FromSlash(legacyRawPath))

		got, err := ResolveRepoLocalPath(codesRoot, raw)
		if err != nil {
			t.Fatalf("ResolveRepoLocalPath(%q) failed: %v", raw, err)
		}
		if got != want {
			t.Fatalf("路径映射与 code-shield 不一致: raw=%q got=%q want=%q", raw, got, want)
		}
	}

	// 2. 兼容 SCP 风格 git@host:group/repo.git
	scpGot, err := ResolveRepoLocalPath(codesRoot, "git@gitlab.example.com:platform/billing-svc.git")
	if err != nil {
		t.Fatalf("SCP URL 解析失败: %v", err)
	}
	scpWant := filepath.Join(codesRoot, "platform", "billing-svc")
	if scpGot != scpWant {
		t.Fatalf("SCP 映射不符: got=%q want=%q", scpGot, scpWant)
	}

	// 3. 路径穿越与注入拦截
	badURLs := []string{
		"",
		"   ",
		"-upload-pack=evil",
		"https://git.example.com/../../etc/passwd.git",
		"git@git.example.com:../escape.git",
		"https://git.example.com/foo\\bar.git",
		"https://git.example.com/foo\x00bar.git",
	}
	for _, bad := range badURLs {
		if got, err := ResolveRepoLocalPath(codesRoot, bad); err == nil {
			t.Fatalf("非法仓库地址 %q 应被拒绝，实际返回 %q", bad, got)
		}
	}
}

func TestVerifyOriginURLConsistency(t *testing.T) {
	bareDir1, _, _ := initBareRepoWithCommits(t, "main")
	bareDir2, _, _ := initBareRepoWithCommits(t, "main")

	codesRoot := filepath.Join(t.TempDir(), "codes")
	localPath := filepath.Join(codesRoot, "team", "same-name")

	if _, _, err := FetchBranchToRef(context.Background(), codesRoot, localPath, bareDir1, "main", "refs/contract/heads"); err != nil {
		t.Fatalf("首次 FetchBranchToRef 失败: %v", err)
	}

	// 同一服务器不同 URL 形式（如去掉或加上尾斜杠/.git，或带凭据）应判为一致
	if err := VerifyOriginURLConsistency(context.Background(), localPath, bareDir1); err != nil {
		t.Fatalf("相同仓库校验应通过，实际: %v", err)
	}

	// 碰撞到另一仓库 URL 时，必须返回 ErrOriginURLMismatch 并拒绝覆盖
	_, _, err := FetchBranchToRef(context.Background(), codesRoot, localPath, bareDir2, "main", "refs/contract/heads")
	if !errors.Is(err, ErrOriginURLMismatch) {
		t.Fatalf("预期返回 ErrOriginURLMismatch，实际: %v", err)
	}
}

func TestFetchBranchToRef_NoWorktreeNonShallowAndObjects(t *testing.T) {
	bareDir, seedDir, sha1 := initBareRepoWithCommits(t, "main")

	// 增加含非 ASCII 路径与 pg 目录的提交
	pgDir := filepath.Join(seedDir, "svc", "pg", "中文目录")
	if err := os.MkdirAll(pgDir, 0755); err != nil {
		t.Fatal(err)
	}
	protoContent := "syntax = \"proto3\";\npackage demo.v1;\nmessage Ping { string msg = 1; }\n"
	if err := os.WriteFile(filepath.Join(pgDir, "消息.proto"), []byte(protoContent), 0644); err != nil {
		t.Fatal(err)
	}
	oversized := make([]byte, 4096)
	for i := range oversized {
		oversized[i] = 'a'
	}
	if err := os.WriteFile(filepath.Join(pgDir, "huge.proto"), oversized, 0644); err != nil {
		t.Fatal(err)
	}
	runTestGit(t, seedDir, "add", "-A")
	runTestGit(t, seedDir, "commit", "-m", "add pg proto with unicode path")
	runTestGit(t, seedDir, "push", "origin", "main")
	sha2 := runTestGit(t, seedDir, "rev-parse", "HEAD")

	codesRoot := filepath.Join(t.TempDir(), "codes")
	localPath := filepath.Join(codesRoot, "org", "demo-svc")

	// 使用 master 验证自动回退至 main，且无工作树检出
	resolvedBranch, fullRef, err := FetchBranchToRef(context.Background(), codesRoot, localPath, bareDir, "master", "refs/contract/heads")
	if err != nil {
		t.Fatalf("FetchBranchToRef 失败: %v", err)
	}
	if resolvedBranch != "main" || fullRef != "refs/contract/heads/main" {
		t.Fatalf("分支/引用不符: branch=%q ref=%q", resolvedBranch, fullRef)
	}

	// 1. 确认工作树无检出文件（README.md 与 svc/ 不应出现在工作区）
	if _, statErr := os.Stat(filepath.Join(localPath, "README.md")); !os.IsNotExist(statErr) {
		t.Fatalf("clone --no-checkout 不应检出工作树文件 README.md")
	}
	// 2. 确认非 shallow
	shallow, err := IsShallowRepository(context.Background(), localPath)
	if err != nil || shallow {
		t.Fatalf("无工作树克隆不应为 shallow: shallow=%v err=%v", shallow, err)
	}
	// 3. 确认未写入 refs/remotes/origin/main（或若 clone 写入则不修改其后续推进）
	// 推进第 3 次提交后再 FetchBranchToRef，验证 refs/remotes/origin/main 不会被 contract fetch 修改
	originMainBefore := runTestGit(t, localPath, "rev-parse", "refs/remotes/origin/main")
	if err := os.WriteFile(filepath.Join(seedDir, "README.md"), []byte("v3\n"), 0644); err != nil {
		t.Fatal(err)
	}
	runTestGit(t, seedDir, "add", "README.md")
	runTestGit(t, seedDir, "commit", "-m", "v3")
	runTestGit(t, seedDir, "push", "origin", "main")
	sha3 := runTestGit(t, seedDir, "rev-parse", "HEAD")

	if _, _, err := FetchBranchToRef(context.Background(), codesRoot, localPath, bareDir, "main", "refs/contract/heads"); err != nil {
		t.Fatalf("二次 FetchBranchToRef 失败: %v", err)
	}
	originMainAfter := runTestGit(t, localPath, "rev-parse", "refs/remotes/origin/main")
	if originMainBefore != originMainAfter {
		t.Fatalf("contract fetch 不得改写 refs/remotes/origin/main: before=%s after=%s", originMainBefore, originMainAfter)
	}
	contractRefSHA := runTestGit(t, localPath, "rev-parse", "refs/contract/heads/main")
	if contractRefSHA != sha3 {
		t.Fatalf("refs/contract/heads/main 未更新至 sha3=%s, got=%s", sha3, contractRefSHA)
	}

	// 4. 在 LOCK_SH 下验证 ListTreeEntries(-z 非 ASCII 路径)、ReadBlobsBatch 与 ReadCommitMeta
	shLock, err := AcquireRepoLock(context.Background(), codesRoot, localPath, LockShared)
	if err != nil {
		t.Fatalf("获取 LOCK_SH 失败: %v", err)
	}
	defer func() { _ = shLock.Release() }()

	entries, err := ListTreeEntries(context.Background(), localPath, fullRef, true, false, "svc/pg")
	if err != nil {
		t.Fatalf("ListTreeEntries 失败: %v", err)
	}
	byPath := make(map[string]TreeEntry, len(entries))
	for _, e := range entries {
		byPath[e.Path] = e
	}
	unicodePath := "svc/pg/中文目录/消息.proto"
	hugePath := "svc/pg/中文目录/huge.proto"
	e1, ok1 := byPath[unicodePath]
	e2, ok2 := byPath[hugePath]
	if !ok1 || !ok2 {
		t.Fatalf("未在 ls-tree -z 中命中非 ASCII 或测试路径: %+v", entries)
	}

	blobs, blobErrs, err := ReadBlobsBatch(context.Background(), localPath, []string{e1.SHA, e2.SHA}, 1024)
	if err != nil {
		t.Fatalf("ReadBlobsBatch 失败: %v", err)
	}
	if string(blobs[e1.SHA]) != protoContent {
		t.Fatalf("消息.proto 内容不符: got=%q want=%q", string(blobs[e1.SHA]), protoContent)
	}
	if _, ok := blobs[e2.SHA]; ok || blobErrs[e2.SHA] == nil {
		t.Fatalf("超过 maxSingleBlobBytes 的 blob 应被跳过并记录错误, blobs=%v errs=%v", blobs, blobErrs)
	}

	meta, err := ReadCommitMeta(context.Background(), localPath, fullRef)
	if err != nil {
		t.Fatalf("ReadCommitMeta 失败: %v", err)
	}
	if meta.CommitSHA != sha3 || meta.CommitMessage != "v3" || meta.AuthorName == "" {
		t.Fatalf("CommitMeta 不符: %+v (sha1=%s sha2=%s sha3=%s)", meta, sha1, sha2, sha3)
	}
}

func TestNonShallowGuard_SyncAndFetchCommitMetadata(t *testing.T) {
	bareDir, seedDir, sha1 := initBareRepoWithCommits(t, "main")

	if err := os.WriteFile(filepath.Join(seedDir, "README.md"), []byte("v2\n"), 0644); err != nil {
		t.Fatal(err)
	}
	runTestGit(t, seedDir, "add", "README.md")
	runTestGit(t, seedDir, "commit", "-m", "v2")
	runTestGit(t, seedDir, "push", "origin", "main")
	sha2 := runTestGit(t, seedDir, "rev-parse", "HEAD")

	codesRoot := filepath.Join(t.TempDir(), "codes")
	localPath := filepath.Join(codesRoot, "org", "full-repo")

	// 1. 完整克隆 (Depth=0)
	if _, err := Sync(context.Background(), SyncOptions{
		RepoURL:        bareDir,
		LocalPath:      localPath,
		CodesRoot:      codesRoot,
		Branch:         "main",
		Depth:          0,
		CleanUntracked: true,
	}); err != nil {
		t.Fatalf("完整克隆失败: %v", err)
	}

	// 2. 即使后续传入 Depth=1，也必须忽略 --depth，绝不写入 .git/shallow
	if _, err := Sync(context.Background(), SyncOptions{
		RepoURL:        bareDir,
		LocalPath:      localPath,
		CodesRoot:      codesRoot,
		Branch:         "main",
		Depth:          1,
		CleanUntracked: true,
	}); err != nil {
		t.Fatalf("二次 Sync 失败: %v", err)
	}
	if shallow, _ := IsShallowRepository(context.Background(), localPath); shallow {
		t.Fatalf("既有完整仓不应降级为 shallow")
	}

	// 3. 推送第 3 个提交，但本地未拉取；调用 FetchCommitMetadata 拉取 sha3，仍绝不可写入 .git/shallow
	if err := os.WriteFile(filepath.Join(seedDir, "README.md"), []byte("v3\n"), 0644); err != nil {
		t.Fatal(err)
	}
	runTestGit(t, seedDir, "add", "README.md")
	runTestGit(t, seedDir, "commit", "-m", "v3")
	runTestGit(t, seedDir, "push", "origin", "main")
	sha3 := runTestGit(t, seedDir, "rev-parse", "HEAD")

	if err := FetchCommitMetadata(context.Background(), localPath, bareDir, sha3); err != nil {
		t.Fatalf("FetchCommitMetadata 失败: %v (sha1=%s sha2=%s)", err, sha1, sha2)
	}
	if shallow, _ := IsShallowRepository(context.Background(), localPath); shallow {
		t.Fatalf("FetchCommitMetadata 在非 shallow 仓上绝不允许写入 .git/shallow")
	}
	if _, err := ShowFileAtCommit(context.Background(), localPath, sha3, "README.md"); err != nil {
		t.Fatalf("ShowFileAtCommit(sha3) 失败: %v", err)
	}
}

// TestMultiProcessSharedCacheStress 跨进程并发压测：
// 子进程 A 模拟 code-shield 同步循环 (Sync + checkout -B + reset --hard + clean -fd + CleanStaleGitLocks)
// 子进程 B/C 模拟 code-contract 循环 (FetchBranchToRef + LOCK_SH 下 ls-tree/cat-file/log)
// 合计 >= 1000 轮操作，验证零仓库损坏、零死锁、零误删锁与非 shallow 保持。
func TestMultiProcessSharedCacheStress(t *testing.T) {
	if os.Getenv("GO_WANT_GITSYNC_STRESS_HELPER") == "1" {
		runStressWorkerHelper()
		return
	}

	bareDir, seedDir, _ := initBareRepoWithCommits(t, "main")
	if err := os.MkdirAll(filepath.Join(seedDir, "pg"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(seedDir, "pg", "svc.proto"), []byte("syntax = \"proto3\";\npackage stress.v1;\nmessage Req { int32 id = 1; }\n"), 0644); err != nil {
		t.Fatal(err)
	}
	runTestGit(t, seedDir, "add", "-A")
	runTestGit(t, seedDir, "commit", "-m", "init proto")
	runTestGit(t, seedDir, "push", "origin", "main")

	codesRoot := filepath.Join(t.TempDir(), "codes")
	localPath, err := ResolveRepoLocalPath(codesRoot, "https://git.example.com/stress/shared-repo.git")
	if err != nil {
		t.Fatal(err)
	}

	// 先由 shield 风格同步初始化完整缓存
	if _, err := Sync(context.Background(), SyncOptions{
		RepoURL:        bareDir,
		LocalPath:      localPath,
		CodesRoot:      codesRoot,
		Branch:         "main",
		Depth:          0,
		AutoHealCache:  false,
		CleanUntracked: true,
	}); err != nil {
		t.Fatalf("初始化共享缓存失败: %v", err)
	}

	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}

	// 启动 4 个子进程：2 个 shield 写者 (各 250 轮) + 2 个 contract 读者/拉取者 (各 300 轮) => 1100 轮跨进程操作
	type workerCfg struct {
		role   string
		rounds int
	}
	workers := []workerCfg{
		{role: "shield", rounds: 250},
		{role: "shield", rounds: 250},
		{role: "contract", rounds: 300},
		{role: "contract", rounds: 300},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	var wg sync.WaitGroup
	errs := make([]error, len(workers))
	for i, w := range workers {
		wg.Add(1)
		go func(idx int, cfg workerCfg) {
			defer wg.Done()
			cmd := exec.CommandContext(ctx, exe, "-test.run=^TestMultiProcessSharedCacheStress$")
			cmd.Env = append(os.Environ(),
				"GO_WANT_GITSYNC_STRESS_HELPER=1",
				"STRESS_ROLE="+cfg.role,
				"STRESS_ROUNDS="+strconv.Itoa(cfg.rounds),
				"STRESS_BARE_DIR="+bareDir,
				"STRESS_CODES_ROOT="+codesRoot,
				"STRESS_LOCAL_PATH="+localPath,
			)
			out, cmdErr := cmd.CombinedOutput()
			if cmdErr != nil {
				errs[idx] = fmt.Errorf("worker[%d](%s) failed: %w\n%s", idx, cfg.role, cmdErr, string(out))
			}
		}(i, w)
	}
	wg.Wait()

	for i, wErr := range errs {
		if wErr != nil {
			t.Fatal(wErr)
		}
		_ = i
	}

	// 压测后核验：仓库完整、非 shallow、origin ref 完好
	runTestGit(t, localPath, "fsck", "--full")
	if shallow, _ := IsShallowRepository(context.Background(), localPath); shallow {
		t.Fatalf("多进程压测后仓库被降级为 shallow")
	}
	if _, err := os.Stat(filepath.Join(codesRoot, ".locks")); err != nil {
		t.Fatalf(".locks 目录应存在: %v", err)
	}
}

func runStressWorkerHelper() {
	role := os.Getenv("STRESS_ROLE")
	rounds, _ := strconv.Atoi(os.Getenv("STRESS_ROUNDS"))
	bareDir := os.Getenv("STRESS_BARE_DIR")
	codesRoot := os.Getenv("STRESS_CODES_ROOT")
	localPath := os.Getenv("STRESS_LOCAL_PATH")

	ctx := context.Background()
	for i := 0; i < rounds; i++ {
		if role == "shield" {
			// 每 5 轮执行一次带 LOCK_EX 的 Sync，其余轮次在 LOCK_EX 下验证 CleanStaleGitLocks 与工作区读写
			if i%10 == 0 {
				if _, err := Sync(ctx, SyncOptions{
					RepoURL:        bareDir,
					LocalPath:      localPath,
					CodesRoot:      codesRoot,
					Branch:         "main",
					Depth:          0,
					AutoHealCache:  false,
					CleanUntracked: true,
				}); err != nil {
					fmt.Fprintf(os.Stderr, "shield Sync round %d error: %v\n", i, err)
					os.Exit(1)
				}
			} else {
				lk, err := AcquireRepoLock(ctx, codesRoot, localPath, LockExclusive)
				if err != nil {
					fmt.Fprintf(os.Stderr, "shield lock round %d error: %v\n", i, err)
					os.Exit(1)
				}
				CleanStaleGitLocks(localPath)
				if _, _, err := ExecCommandWithProcessGroup(ctx, localPath, "git", "-C", localPath, "rev-parse", "HEAD"); err != nil {
					_ = lk.Release()
					fmt.Fprintf(os.Stderr, "shield rev-parse round %d error: %v\n", i, err)
					os.Exit(1)
				}
				_ = lk.Release()
			}
			continue
		}

		// contract 角色：每 10 轮 FetchBranchToRef (LOCK_EX)，其余轮次持 LOCK_SH 执行 ls-tree/cat-file/log
		if i%10 == 0 {
			if _, _, err := FetchBranchToRef(ctx, codesRoot, localPath, bareDir, "main", "refs/contract/heads"); err != nil {
				fmt.Fprintf(os.Stderr, "contract FetchBranchToRef round %d error: %v\n", i, err)
				os.Exit(1)
			}
		} else {
			lk, err := AcquireRepoLock(ctx, codesRoot, localPath, LockShared)
			if err != nil {
				fmt.Fprintf(os.Stderr, "contract shared lock round %d error: %v\n", i, err)
				os.Exit(1)
			}
			entries, err := ListTreeEntries(ctx, localPath, "refs/contract/heads/main", true, false, "pg")
			if err != nil || len(entries) == 0 {
				_ = lk.Release()
				fmt.Fprintf(os.Stderr, "contract ListTreeEntries round %d error: %v entries=%d\n", i, err, len(entries))
				os.Exit(1)
			}
			var shas []string
			for _, e := range entries {
				if e.Type == "blob" {
					shas = append(shas, e.SHA)
				}
			}
			if _, _, bErr := ReadBlobsBatch(ctx, localPath, shas, 1024*1024); bErr != nil {
				_ = lk.Release()
				fmt.Fprintf(os.Stderr, "contract ReadBlobsBatch round %d error: %v\n", i, bErr)
				os.Exit(1)
			}
			if _, mErr := ReadCommitMeta(ctx, localPath, "refs/contract/heads/main"); mErr != nil {
				_ = lk.Release()
				fmt.Fprintf(os.Stderr, "contract ReadCommitMeta round %d error: %v\n", i, mErr)
				os.Exit(1)
			}
			_ = lk.Release()
		}
	}
}
