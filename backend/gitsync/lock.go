package gitsync

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// LockMode 定义仓库级两层锁模式。
type LockMode int

const (
	// LockShared 共享读锁（用于 ls-tree / cat-file / log 等只读 Git 对象操作）。
	LockShared LockMode = iota
	// LockExclusive 独占写锁（用于 clone / fetch / checkout / reset / clean / 删库 / 清理锁文件）。
	LockExclusive
)

const (
	defaultExclusiveLockTimeout = 10 * time.Minute
	defaultSharedLockTimeout    = 2 * time.Minute
	defaultWarnWaitDuration     = 10 * time.Second
)

// RepoLockOptions 配置两层锁的超时与告警阈值。
type RepoLockOptions struct {
	Timeout       time.Duration
	WarnWaitAfter time.Duration
}

// RepoLock 表示已获取的「进程内 RWMutex + 跨进程 flock」双层锁句柄。
type RepoLock struct {
	rwMu     *sync.RWMutex
	mode     LockMode
	file     *os.File
	lockPath string
	released atomic.Bool
}

var (
	pathLocksMu sync.Mutex
	pathLocks   = make(map[string]*sync.RWMutex)
)

// GetPathLock 获取指定仓库物理路径对应的进程内读写锁（RWMutex）。
func GetPathLock(localPath string) *sync.RWMutex {
	key := canonicalLockKey(localPath)

	pathLocksMu.Lock()
	defer pathLocksMu.Unlock()

	l, exists := pathLocks[key]
	if !exists {
		l = &sync.RWMutex{}
		pathLocks[key] = l
	}
	return l
}

func canonicalLockKey(localPath string) string {
	key := filepath.Clean(localPath)
	if absPath, err := filepath.Abs(key); err == nil {
		key = absPath
	}
	if resolved, err := filepath.EvalSymlinks(key); err == nil {
		key = resolved
	}
	return key
}

// ResolveLockFilePath 计算仓库对应的跨进程锁文件路径：<codesRoot>/.locks/<sha1(absLocalPath)>.lock。
func ResolveLockFilePath(codesRoot, localPath string) (string, error) {
	key := canonicalLockKey(localPath)
	if key == "" || key == "." || key == "/" {
		return "", fmt.Errorf("非法的仓库锁路径: %q", localPath)
	}
	locksDir := ""
	if strings.TrimSpace(codesRoot) != "" {
		absRoot := filepath.Clean(codesRoot)
		if a, err := filepath.Abs(absRoot); err == nil {
			absRoot = a
		}
		locksDir = filepath.Join(absRoot, ".locks")
	} else {
		locksDir = filepath.Join(filepath.Dir(key), ".locks")
	}

	sum := sha1.Sum([]byte(key))
	return filepath.Join(locksDir, hex.EncodeToString(sum[:])+".lock"), nil
}

// AcquireRepoLock 按「先进程内 RWMutex、后跨进程 flock」顺序获取两层锁，支持 ctx 取消与退避轮询。
func AcquireRepoLock(ctx context.Context, codesRoot, localPath string, mode LockMode, opts ...RepoLockOptions) (*RepoLock, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	var opt RepoLockOptions
	if len(opts) > 0 {
		opt = opts[0]
	}
	if opt.Timeout <= 0 {
		if mode == LockExclusive {
			opt.Timeout = defaultExclusiveLockTimeout
		} else {
			opt.Timeout = defaultSharedLockTimeout
		}
	}
	if opt.WarnWaitAfter <= 0 {
		opt.WarnWaitAfter = defaultWarnWaitDuration
	}

	lockPath, err := ResolveLockFilePath(codesRoot, localPath)
	if err != nil {
		return nil, err
	}
	locksDir := filepath.Dir(lockPath)
	if err := os.MkdirAll(locksDir, 0775); err != nil {
		return nil, fmt.Errorf("创建锁目录 %s 失败: %w", locksDir, err)
	}
	// 尽力保证同属组共享进程可读写 .locks 目录
	_ = os.Chmod(locksDir, 0775)

	waitCtx, cancel := context.WithTimeout(ctx, opt.Timeout)
	defer cancel()

	rwMu := GetPathLock(localPath)
	startWait := time.Now()
	warned := false

	// 1. 先获取进程内 RWMutex（使用 TryLock/TryRLock 轮询以响应 ctx 取消）
	backoff := 20 * time.Millisecond
	for {
		acquired := false
		if mode == LockExclusive {
			acquired = rwMu.TryLock()
		} else {
			acquired = rwMu.TryRLock()
		}
		if acquired {
			break
		}
		if mode == LockExclusive && !warned && time.Since(startWait) >= opt.WarnWaitAfter {
			warned = true
			log.Printf("[GitSync/Lock] 等待进程内独占写锁超过 %v (%s)", opt.WarnWaitAfter, localPath)
		}
		select {
		case <-waitCtx.Done():
			return nil, fmt.Errorf("等待进程内仓库锁超时或取消 (%s): %w", localPath, waitCtx.Err())
		case <-time.After(backoff):
		}
		if backoff < 250*time.Millisecond {
			backoff *= 2
			if backoff > 250*time.Millisecond {
				backoff = 250 * time.Millisecond
			}
		}
	}

	unlockInProc := func() {
		if mode == LockExclusive {
			rwMu.Unlock()
		} else {
			rwMu.RUnlock()
		}
	}

	// 2. 每次获取独立打开文件描述符，再执行跨进程 flock(LOCK_NB)
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0664)
	if err != nil {
		unlockInProc()
		return nil, fmt.Errorf("打开仓库锁文件 %s 失败: %w", lockPath, err)
	}
	_ = os.Chmod(lockPath, 0664)

	flockHow := syscall.LOCK_SH
	if mode == LockExclusive {
		flockHow = syscall.LOCK_EX
	}

	backoff = 50 * time.Millisecond
	for {
		flockErr := syscall.Flock(int(f.Fd()), flockHow|syscall.LOCK_NB)
		if flockErr == nil {
			return &RepoLock{
				rwMu:     rwMu,
				mode:     mode,
				file:     f,
				lockPath: lockPath,
			}, nil
		}
		if !errors.Is(flockErr, syscall.EWOULDBLOCK) && !errors.Is(flockErr, syscall.EAGAIN) && !errors.Is(flockErr, syscall.EINTR) {
			_ = f.Close()
			unlockInProc()
			return nil, fmt.Errorf("获取跨进程 flock 失败 (%s): %w", lockPath, flockErr)
		}
		if mode == LockExclusive && !warned && time.Since(startWait) >= opt.WarnWaitAfter {
			warned = true
			log.Printf("[GitSync/Lock] 等待跨进程独占写锁超过 %v (%s)", opt.WarnWaitAfter, localPath)
		}
		select {
		case <-waitCtx.Done():
			_ = f.Close()
			unlockInProc()
			return nil, fmt.Errorf("等待跨进程仓库锁超时或取消 (%s): %w", lockPath, waitCtx.Err())
		case <-time.After(backoff):
		}
		if backoff < time.Second {
			backoff *= 2
			if backoff > time.Second {
				backoff = time.Second
			}
		}
	}
}

// Release 按「先释放跨进程 flock 并关闭文件描述符、再释放进程内 RWMutex」逆序释放锁（幂等）。
func (l *RepoLock) Release() error {
	if l == nil || !l.released.CompareAndSwap(false, true) {
		return nil
	}
	var firstErr error
	if l.file != nil {
		if err := syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN); err != nil && firstErr == nil {
			firstErr = err
		}
		if err := l.file.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if l.rwMu != nil {
		if l.mode == LockExclusive {
			l.rwMu.Unlock()
		} else {
			l.rwMu.RUnlock()
		}
	}
	return firstErr
}

// CleanStaleGitLocks 检查并清理由于历史进程崩溃或异常中断残留的 .git/*.lock 文件。
// 调用方必须已持有对应仓库路径的 LOCK_EX 独占锁。
func CleanStaleGitLocks(localPath string) {
	gitDir := filepath.Join(localPath, ".git")
	if stat, err := os.Stat(gitDir); err != nil || !stat.IsDir() {
		return
	}

	lockFiles := []string{
		filepath.Join(gitDir, "index.lock"),
		filepath.Join(gitDir, "shallow.lock"),
		filepath.Join(gitDir, "config.lock"),
		filepath.Join(gitDir, "HEAD.lock"),
	}

	refsDir := filepath.Join(gitDir, "refs")
	if walkErr := filepath.Walk(refsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && strings.HasSuffix(path, ".lock") {
			lockFiles = append(lockFiles, path)
		}
		return nil
	}); walkErr != nil {
		log.Printf("[GitSync] 遍历 refs 目录查找残留锁文件出现告警 (%s): %v", refsDir, walkErr)
	}

	for _, lockPath := range lockFiles {
		if stat, err := os.Stat(lockPath); err == nil && !stat.IsDir() {
			log.Printf("[GitSync] 检测到残留 Git 锁文件 %s (modTime: %v)，自动清理以自愈仓库",
				lockPath, stat.ModTime())
			if rmErr := os.Remove(lockPath); rmErr != nil && !os.IsNotExist(rmErr) {
				log.Printf("[GitSync] 清理残留锁文件 %s 失败: %v", lockPath, rmErr)
			}
		}
	}
}
