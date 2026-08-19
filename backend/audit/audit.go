package audit

import (
	"context"
	"sync"
	"time"

	"code-common/backend/models"
	"gorm.io/gorm"
)

// Manager 全局 AuditManager 单例
var (
	Manager = &AuditManager{}
	once    sync.Once
)

// AuditManager 全局审计日志管理器
type AuditManager struct {
	writer *AsyncWriter
	mu     sync.RWMutex
}

// InitOptions 审计引擎初始化参数
type InitOptions struct {
	QueueCap    int           // 缓冲队列容量，默认 10000
	BatchSize   int           // 批量写入大小，默认 100
	FlushPeriod time.Duration // 自动刷新周期，默认 2s
}

// Init 初始化全局审计日志管理器
func Init(db *gorm.DB, opts ...InitOptions) {
	var opt InitOptions
	if len(opts) > 0 {
		opt = opts[0]
	}
	if opt.QueueCap <= 0 {
		opt.QueueCap = 10000
	}
	if opt.BatchSize <= 0 {
		opt.BatchSize = 100
	}
	if opt.FlushPeriod <= 0 {
		opt.FlushPeriod = 2 * time.Second
	}

	Manager.mu.Lock()
	defer Manager.mu.Unlock()

	if Manager.writer != nil {
		// 已初始化过，直接返回
		return
	}
	Manager.writer = NewAsyncWriter(db, opt.QueueCap, opt.BatchSize, opt.FlushPeriod)
}

// Push 向全局审计队列提交日志实体
func Push(item *models.SysAuditLog) {
	Manager.Push(item)
}

// Push 实例方法
func (m *AuditManager) Push(item *models.SysAuditLog) {
	m.mu.RLock()
	writer := m.writer
	m.mu.RUnlock()

	if writer != nil {
		writer.Push(item)
	}
}

// DroppedCount 获取历史丢包总数
func DroppedCount() int64 {
	return Manager.DroppedCount()
}

// DroppedCount 实例方法
func (m *AuditManager) DroppedCount() int64 {
	m.mu.RLock()
	writer := m.writer
	m.mu.RUnlock()

	if writer != nil {
		return writer.DroppedCount()
	}
	return 0
}

// Close 优雅停机并清空队列
func Close(ctx context.Context) error {
	return Manager.Close(ctx)
}

// Close 实例方法
func (m *AuditManager) Close(ctx context.Context) error {
	m.mu.Lock()
	writer := m.writer
	m.writer = nil
	m.mu.Unlock()

	if writer != nil {
		return writer.Close(ctx)
	}
	return nil
}
