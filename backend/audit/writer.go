package audit

import (
	"context"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"code-common/backend/models"
	"gorm.io/gorm"
)

// AsyncWriter 异步无锁批量审计写入引擎
type AsyncWriter struct {
	db           *gorm.DB
	queue        chan *models.SysAuditLog
	batchSize    int
	flushPeriod  time.Duration
	droppedCount atomic.Int64 // 原子丢包监控计数器
	stopCh       chan struct{}
	closeOnce    sync.Once
	closed       atomic.Bool
	wg           sync.WaitGroup
}

// NewAsyncWriter 创建并启动异步审计写入器
func NewAsyncWriter(db *gorm.DB, queueCap, batchSize int, flushPeriod time.Duration) *AsyncWriter {
	if queueCap <= 0 {
		queueCap = 10000
	}
	if batchSize <= 0 {
		batchSize = 100
	}
	if flushPeriod <= 0 {
		flushPeriod = 2 * time.Second
	}

	w := &AsyncWriter{
		db:          db,
		queue:       make(chan *models.SysAuditLog, queueCap),
		batchSize:   batchSize,
		flushPeriod: flushPeriod,
		stopCh:      make(chan struct{}),
	}
	w.wg.Add(1)
	go w.workerLoop()
	return w
}

// Push 非阻塞投递审计日志实体
func (w *AsyncWriter) Push(logItem *models.SysAuditLog) {
	if logItem == nil || w.closed.Load() {
		return
	}

	select {
	case w.queue <- logItem:
	default:
		w.droppedCount.Add(1)
		log.Printf("[Audit Warning] Queue full (cap %d), total dropped: %d, dropped log: %s",
			cap(w.queue), w.droppedCount.Load(), logItem.Summary)
	}
}

// DroppedCount 获取历史丢包总数 (用于监控告警)
func (w *AsyncWriter) DroppedCount() int64 {
	return w.droppedCount.Load()
}

func (w *AsyncWriter) workerLoop() {
	defer w.wg.Done()
	ticker := time.NewTicker(w.flushPeriod)
	defer ticker.Stop()

	buffer := make([]*models.SysAuditLog, 0, w.batchSize)

	flush := func() {
		if len(buffer) == 0 {
			return
		}
		if w.db != nil {
			if err := w.db.CreateInBatches(buffer, w.batchSize).Error; err != nil {
				log.Printf("[Audit Error] Failed to batch insert audit logs: %v", err)
			}
		}
		buffer = make([]*models.SysAuditLog, 0, w.batchSize)
	}

	for {
		select {
		case item := <-w.queue:
			buffer = append(buffer, item)
			if len(buffer) >= w.batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		case <-w.stopCh:
			// 停机前排空队列内剩余日志
			for {
				select {
				case item := <-w.queue:
					buffer = append(buffer, item)
				default:
					flush()
					return
				}
			}
		}
	}
}

// Close 优雅停机：带 Context 超时保护
func (w *AsyncWriter) Close(ctx context.Context) error {
	w.closeOnce.Do(func() {
		w.closed.Store(true)
		if w.stopCh != nil {
			close(w.stopCh)
		}
	})

	done := make(chan struct{})
	go func() {
		w.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		return nil
	case <-ctx.Done():
		log.Printf("[Audit Warning] Shutdown timeout, some remaining audit logs may be lost")
		return ctx.Err()
	}
}
