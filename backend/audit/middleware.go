package audit

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"code-common/backend/auth"
	"code-common/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Middleware 全局操作审计 Gin 中间件
// 建议挂载在 AuthMiddleware 之后，确保认证上下文已解析
func Middleware(serviceName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. 生成或透传 TraceID
		traceID := c.GetHeader("X-Trace-Id")
		if traceID == "" {
			traceID = c.GetHeader("X-Request-Id")
		}
		if traceID == "" {
			traceID = uuid.New().String()
		}
		c.Set(ContextTraceID, traceID)
		c.Header("X-Trace-Id", traceID)

		// 2. 判定是否为写操作请求
		isWriteMethod := c.Request.Method == http.MethodPost ||
			c.Request.Method == http.MethodPut ||
			c.Request.Method == http.MethodPatch ||
			c.Request.Method == http.MethodDelete

		startTime := time.Now()

		// 执行后续 Handler
		c.Next()

		// 3. 过滤逻辑：
		// 3.1 显式标记跳过审计（如 Webhook 推送、自动日志上报、网关代理转发等非人工操作）
		if skipVal, exists := c.Get(ContextAuditSkip); exists {
			if skip, ok := skipVal.(bool); ok && skip {
				return
			}
		}

		// 3.2 非写操作且未显式指定 audit_module 的请求不记录
		moduleVal, _ := c.Get(ContextAuditModule)
		if !isWriteMethod && moduleVal == nil {
			return
		}

		// 4. 提取当前登录人信息 (通过 code-common/backend/auth.GetUserContext 统一提取)
		uc := auth.GetUserContext(c)
		userID := uc.UserID
		username := uc.Name
		if username == "" {
			username = uc.Username
		}
		userRole := strings.Join(uc.Roles, ",")
		deptID := uc.DepartmentID
		deptName := uc.DepartmentName

		// 未认证的开放接口写操作 (如未登录的尝试)，以匿名记录
		if username == "" {
			username = "Anonymous"
			userRole = "guest"
		}

		// 5. 提取上下文注入的审计数据 (安全判空)
		actionVal, _ := c.Get(ContextAuditAction)
		summaryVal, _ := c.Get(ContextAuditSummary)
		targetTypeVal, _ := c.Get(ContextAuditTargetType)
		targetIDVal, _ := c.Get(ContextAuditTargetID)
		targetNameVal, _ := c.Get(ContextAuditTargetName)
		levelVal, _ := c.Get(ContextAuditLevel)
		beforeObj, _ := c.Get(ContextAuditBefore)
		afterObj, _ := c.Get(ContextAuditAfter)

		level := models.AuditLevelP2
		if l, ok := levelVal.(models.AuditLevel); ok {
			level = l
		} else if lStr, ok := levelVal.(string); ok {
			level = models.AuditLevel(lStr)
		}

		modStr := getString(moduleVal)
		if modStr == "" {
			modStr = inferModuleFromPath(c.Request.URL.Path)
		}

		actStr := getString(actionVal)
		if actStr == "" {
			actStr = inferAction(c.Request.Method, c.Request.URL.Path)
		}

		sumStr := getString(summaryVal)
		if sumStr == "" {
			if modStr == "auth" && actStr == "login" {
				if c.Writer.Status() >= 200 && c.Writer.Status() < 300 {
					sumStr = fmt.Sprintf("用户 [%s] 登录系统成功 (IP: %s)", username, c.ClientIP())
				} else {
					sumStr = fmt.Sprintf("用户 [%s] 登录失败 (状态码: %d)", username, c.Writer.Status())
				}
			} else if modStr == "auth" && actStr == "sso_login" {
				sumStr = fmt.Sprintf("用户 [%s] SSO单点登录成功 (IP: %s)", username, c.ClientIP())
			} else if modStr == "auth" && actStr == "update_password" {
				sumStr = fmt.Sprintf("用户 [%s] 修改密码成功", username)
			} else {
				sumStr = fmt.Sprintf("%s %s %s", username, c.Request.Method, c.Request.URL.Path)
			}
		}

		// 6. 数据脱敏与差异计算
		beforeJSON := MaskJSONString(beforeObj)
		afterJSON := MaskJSONString(afterObj)
		diffSummary := CalculateDiff(beforeJSON, afterJSON)

		// 7. 组装审计实体并异步投递
		logItem := &models.SysAuditLog{
			CreatedAt:      startTime,
			TraceID:        traceID,
			UserID:         userID,
			Username:       username,
			UserRole:       userRole,
			DepartmentID:   deptID,
			DepartmentName: deptName,
			Service:        serviceName,
			ClientIP:       c.ClientIP(),
			UserAgent:      c.Request.UserAgent(),
			RequestPath:    c.Request.URL.Path,
			RequestMethod:  c.Request.Method,
			Module:         modStr,
			Action:         actStr,
			Level:          level,
			Summary:        sumStr,
			TargetType:     getString(targetTypeVal),
			TargetID:       getString(targetIDVal),
			TargetName:     getString(targetNameVal),
			BeforeData:     truncatePayload(beforeJSON, 32*1024), // 限制最大 32KB
			AfterData:      truncatePayload(afterJSON, 32*1024),
			DiffSummary:    diffSummary,
			StatusCode:     c.Writer.Status(),
			DurationMs:     time.Since(startTime).Milliseconds(),
		}

		if len(c.Errors) > 0 {
			logItem.ErrorMessage = c.Errors.String()
		}

		Manager.Push(logItem)
	}
}

func getString(v any) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%v", v)
}

func inferModuleFromPath(path string) string {
	cleanPath := strings.Trim(strings.ToLower(path), "/")
	if strings.Contains(cleanPath, "login") || strings.Contains(cleanPath, "oauth2") || strings.Contains(cleanPath, "auth") || strings.Contains(cleanPath, "password") {
		return "auth"
	}
	parts := strings.Split(cleanPath, "/")
	if len(parts) >= 2 {
		return parts[1]
	}
	if len(parts) == 1 && parts[0] != "" {
		return parts[0]
	}
	return "system"
}

func inferAction(method, path string) string {
	lowerPath := strings.ToLower(path)
	if strings.HasSuffix(lowerPath, "/login") || lowerPath == "login" {
		return "login"
	}
	if strings.HasSuffix(lowerPath, "/logout") || lowerPath == "logout" {
		return "logout"
	}
	if strings.Contains(lowerPath, "password") {
		return "update_password"
	}
	if strings.Contains(lowerPath, "oauth2") {
		return "sso_login"
	}
	return inferActionFromMethod(method)
}

func inferActionFromMethod(method string) string {
	switch method {
	case http.MethodPost:
		return "create"
	case http.MethodPut, http.MethodPatch:
		return "update"
	case http.MethodDelete:
		return "delete"
	default:
		return strings.ToLower(method)
	}
}

func truncatePayload(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen] + "... [truncated]"
	}
	return s
}
