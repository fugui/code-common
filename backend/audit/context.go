package audit

import (
	"code-common/backend/models"

	"github.com/gin-gonic/gin"
)

const (
	ContextAuditModule     = "audit_module"
	ContextAuditAction     = "audit_action"
	ContextAuditLevel      = "audit_level"
	ContextAuditSummary    = "audit_summary"
	ContextAuditTargetType = "audit_target_type"
	ContextAuditTargetID   = "audit_target_id"
	ContextAuditTargetName = "audit_target_name"
	ContextAuditBefore     = "audit_before"
	ContextAuditAfter      = "audit_after"
	ContextTraceID         = "trace_id"
)

// SetModule 设置审计所属模块 (如 user, scheme, pipeline, rule, scan, device...)
func SetModule(c *gin.Context, module string) {
	c.Set(ContextAuditModule, module)
}

// SetAction 设置审计操作动作 (如 create, update, delete, trigger, sync...)
func SetAction(c *gin.Context, action string) {
	c.Set(ContextAuditAction, action)
}

// SetLevel 设置审计风险等级 (P0, P1, P2)
func SetLevel(c *gin.Context, level models.AuditLevel) {
	c.Set(ContextAuditLevel, level)
}

// SetSummary 设置人类易读的操作摘要描述
func SetSummary(c *gin.Context, summary string) {
	c.Set(ContextAuditSummary, summary)
}

// SetTarget 设置操作目标对象类型、ID及名称
func SetTarget(c *gin.Context, targetType, targetID, targetName string) {
	if targetType != "" {
		c.Set(ContextAuditTargetType, targetType)
	}
	if targetID != "" {
		c.Set(ContextAuditTargetID, targetID)
	}
	if targetName != "" {
		c.Set(ContextAuditTargetName, targetName)
	}
}

// SetBefore 设置变更前状态快照
func SetBefore(c *gin.Context, beforeObj any) {
	c.Set(ContextAuditBefore, beforeObj)
}

// SetAfter 设置变更后状态快照
func SetAfter(c *gin.Context, afterObj any) {
	c.Set(ContextAuditAfter, afterObj)
}

// SetAuditContext 一站式设置审计上下文
func SetAuditContext(
	c *gin.Context,
	module string,
	action string,
	level models.AuditLevel,
	summary string,
	targetType string,
	targetID string,
	targetName string,
	beforeObj any,
	afterObj any,
) {
	if module != "" {
		c.Set(ContextAuditModule, module)
	}
	if action != "" {
		c.Set(ContextAuditAction, action)
	}
	if level != "" {
		c.Set(ContextAuditLevel, level)
	}
	if summary != "" {
		c.Set(ContextAuditSummary, summary)
	}
	if targetType != "" {
		c.Set(ContextAuditTargetType, targetType)
	}
	if targetID != "" {
		c.Set(ContextAuditTargetID, targetID)
	}
	if targetName != "" {
		c.Set(ContextAuditTargetName, targetName)
	}
	if beforeObj != nil {
		c.Set(ContextAuditBefore, beforeObj)
	}
	if afterObj != nil {
		c.Set(ContextAuditAfter, afterObj)
	}
}
