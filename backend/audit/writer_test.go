package audit

import (
	"context"
	"testing"
	"time"

	"code-common/backend/models"
)

func TestAsyncWriterDropCount(t *testing.T) {
	// 创建一个小容量队列以验证丢包计数
	writer := NewAsyncWriter(nil, 5, 10, 100*time.Millisecond)

	// 投递超过容量的日志
	for i := 0; i < 15; i++ {
		writer.Push(&models.SysAuditLog{
			Summary: "test log",
		})
	}

	// 验证存在丢包记录
	dropped := writer.DroppedCount()
	if dropped <= 0 {
		t.Errorf("expected dropped count > 0, got %d", dropped)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := writer.Close(ctx); err != nil {
		t.Fatalf("failed to close writer: %v", err)
	}
}

func TestAsyncWriterGracefulShutdown(t *testing.T) {
	writer := NewAsyncWriter(nil, 100, 10, 500*time.Millisecond)

	for i := 0; i < 25; i++ {
		writer.Push(&models.SysAuditLog{
			Summary: "shutdown test",
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	if err := writer.Close(ctx); err != nil {
		t.Fatalf("expected clean shutdown, got error: %v", err)
	}
}

func TestAsyncWriterConcurrencyPressure(t *testing.T) {
	// 验证 10,000 并发 Goroutine 压力投递
	writer := NewAsyncWriter(nil, 10000, 100, 50*time.Millisecond)

	done := make(chan struct{})
	totalGoroutines := 10000

	for i := 0; i < totalGoroutines; i++ {
		go func(idx int) {
			writer.Push(&models.SysAuditLog{
				Summary: "high concurrency log",
			})
			done <- struct{}{}
		}(i)
	}

	for i := 0; i < totalGoroutines; i++ {
		<-done
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := writer.Close(ctx); err != nil {
		t.Fatalf("expected clean shutdown under pressure, got: %v", err)
	}
}

