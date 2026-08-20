package audit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"code-common/backend/auth"
	"code-common/backend/models"

	"github.com/gin-gonic/gin"
)

func TestMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// 构造测试专用接收队列（不启动后台消费协程，便于测试用例直接断言）
	received := make(chan *models.SysAuditLog, 10)
	writer := &AsyncWriter{
		queue:  received,
		stopCh: make(chan struct{}),
	}
	Manager.mu.Lock()
	Manager.writer = writer
	Manager.mu.Unlock()

	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()
		_ = Close(ctx)
	}()

	r := gin.New()
	r.Use(func(c *gin.Context) {
		// 模拟已登录用户
		auth.SetUserContext(c, &auth.UserContext{
			UserID:   100,
			Username: "admin@test.com",
			Name:     "超级管理员",
			Roles:    []string{"super_admin"},
		})
		c.Next()
	})
	r.Use(Middleware("test_service"))

	r.GET("/api/items", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.POST("/api/items", func(c *gin.Context) {
		SetBefore(c, map[string]any{"name": "old_name", "password": "secret_pwd"})
		SetAfter(c, map[string]any{"name": "new_name", "password": "new_secret_pwd"})
		SetLevel(c, models.AuditLevelP1)
		SetSummary(c, "更新了测试项目")
		SetTarget(c, "item", "101", "测试项目A")
		c.JSON(http.StatusOK, gin.H{"result": "created"})
	})

	// 1. 发送 GET 请求，预期不生成审计日志
	reqGet, _ := http.NewRequest(http.MethodGet, "/api/items", nil)
	wGet := httptest.NewRecorder()
	r.ServeHTTP(wGet, reqGet)

	select {
	case log := <-received:
		t.Fatalf("unexpected audit log for GET request: %+v", log)
	case <-time.After(100 * time.Millisecond):
		// 正常通过
	}

	// 2. 发送 POST 请求，预期捕获完整审计日志
	reqPost, _ := http.NewRequest(http.MethodPost, "/api/items", nil)
	reqPost.Header.Set("X-Trace-Id", "trace-xyz-123")
	wPost := httptest.NewRecorder()
	r.ServeHTTP(wPost, reqPost)

	select {
	case log := <-received:
		if log.TraceID != "trace-xyz-123" {
			t.Errorf("expected TraceID 'trace-xyz-123', got %q", log.TraceID)
		}
		if log.Username != "超级管理员" {
			t.Errorf("expected Username '超级管理员', got %q", log.Username)
		}
		if log.Service != "test_service" {
			t.Errorf("expected Service 'test_service', got %q", log.Service)
		}
		if log.Level != models.AuditLevelP1 {
			t.Errorf("expected Level P1, got %v", log.Level)
		}
		if log.TargetID != "101" || log.TargetType != "item" {
			t.Errorf("unexpected target info: %s/%s", log.TargetType, log.TargetID)
		}
		if log.DiffSummary == "" {
			t.Errorf("expected non-empty DiffSummary")
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timeout waiting for audit log on POST request")
	}
}

func TestMiddlewareAnonymousAndErrors(t *testing.T) {
	gin.SetMode(gin.TestMode)

	received := make(chan *models.SysAuditLog, 10)
	writer := &AsyncWriter{
		queue:  received,
		stopCh: make(chan struct{}),
	}
	Manager.mu.Lock()
	Manager.writer = writer
	Manager.mu.Unlock()

	r := gin.New()
	// 未挂载身份认证中间件，模拟未登录匿名请求
	r.Use(Middleware("anonymous_service"))

	r.POST("/api/fail-op", func(c *gin.Context) {
		SetSummary(c, "尝试非法操作")
		_ = c.Error(gin.Error{
			Err:  http.ErrHandlerTimeout,
			Type: gin.ErrorTypePrivate,
		})
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	})

	req, _ := http.NewRequest(http.MethodPost, "/api/fail-op", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	select {
	case log := <-received:
		if log.Username != "Anonymous" {
			t.Errorf("expected Username 'Anonymous', got %q", log.Username)
		}
		if log.UserRole != "guest" {
			t.Errorf("expected UserRole 'guest', got %q", log.UserRole)
		}
		if log.StatusCode != http.StatusInternalServerError {
			t.Errorf("expected StatusCode 500, got %d", log.StatusCode)
		}
		if log.ErrorMessage == "" {
			t.Errorf("expected non-empty ErrorMessage from c.Errors")
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timeout waiting for audit log on anonymous failed POST request")
	}
}

func TestMiddlewareSkip(t *testing.T) {
	gin.SetMode(gin.TestMode)

	received := make(chan *models.SysAuditLog, 10)
	writer := &AsyncWriter{
		queue:  received,
		stopCh: make(chan struct{}),
	}
	Manager.mu.Lock()
	Manager.writer = writer
	Manager.mu.Unlock()

	r := gin.New()
	r.Use(Middleware("test_service"))

	// 1. 测试调用 Skip 的 POST 请求（例如 Webhook 或日志上报）
	r.POST("/api/webhook", func(c *gin.Context) {
		Skip(c)
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// 2. 测试正常未调 Skip 的 POST 请求
	r.POST("/api/normal-action", func(c *gin.Context) {
		SetSummary(c, "正常操作")
		c.JSON(http.StatusOK, gin.H{"status": "created"})
	})

	// 发送 Webhook POST 请求
	reqWebhook, _ := http.NewRequest(http.MethodPost, "/api/webhook", nil)
	wWebhook := httptest.NewRecorder()
	r.ServeHTTP(wWebhook, reqWebhook)

	select {
	case log := <-received:
		t.Fatalf("unexpected audit log for skipped webhook request: %+v", log)
	case <-time.After(150 * time.Millisecond):
		// 预期不产生审计日志
	}

	// 发送正常 POST 请求
	reqNormal, _ := http.NewRequest(http.MethodPost, "/api/normal-action", nil)
	wNormal := httptest.NewRecorder()
	r.ServeHTTP(wNormal, reqNormal)

	select {
	case log := <-received:
		if log.Summary != "正常操作" {
			t.Errorf("expected Summary '正常操作', got %q", log.Summary)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timeout waiting for audit log on normal POST request")
	}
}
