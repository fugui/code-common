package gitsync

import (
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	pathLocksMu sync.Mutex
	pathLocks   = make(map[string]*sync.Mutex)
)

// GetPathLock 获取指定仓库物理路径对应的互斥锁，确保同一物理目录的 Git 同步操作严格串行排队。
func GetPathLock(localPath string) *sync.Mutex {
	key := filepath.Clean(localPath)
	if absPath, err := filepath.Abs(key); err == nil {
		key = absPath
	}

	pathLocksMu.Lock()
	defer pathLocksMu.Unlock()

	l, exists := pathLocks[key]
	if !exists {
		l = &sync.Mutex{}
		pathLocks[key] = l
	}
	return l
}

// CleanStaleGitLocks 检查并清理由于历史进程崩溃或异常中断残留的 .git/*.lock 文件。
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
