package models

import (
	"time"
)

// AuditLevel 风险等级
type AuditLevel string

const (
	AuditLevelP0 AuditLevel = "P0" // 极高危操作 (权限提升、规则篡改、基线变更、审计清理等)
	AuditLevelP1 AuditLevel = "P1" // 重要管理操作 (方案覆盖、组织架构、代码仓纳管、设备资产等)
	AuditLevelP2 AuditLevel = "P2" // 常规业务写操作 (常规业务触发、配置微调等)
)

// SysAuditLog 系统全局操作审计日志模型 (存放于共享数据库 code_shield 中)
type SysAuditLog struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	CreatedAt time.Time `gorm:"index:idx_audit_created_at;not null" json:"created_at"`
	TraceID   string    `gorm:"size:64;index:idx_audit_trace_id" json:"trace_id"` // 全链路追踪 ID

	// 1. Who (操作人信息)
	UserID         uint   `gorm:"index:idx_audit_user_id;not null" json:"user_id"`
	Username       string `gorm:"size:64;index:idx_audit_username;not null" json:"username"`
	UserRole       string `gorm:"size:64;not null" json:"user_role"`
	DepartmentID   *uint  `gorm:"index:idx_audit_dept_id" json:"department_id,omitempty"`
	DepartmentName string `gorm:"size:128" json:"department_name,omitempty"`

	// 2. Where & Context (环境与链路)
	Service       string `gorm:"size:32;index:idx_audit_service_module;not null" json:"service"` // bench | pipeline | shield | pdm
	ClientIP      string `gorm:"size:64;not null" json:"client_ip"`
	UserAgent     string `gorm:"size:255" json:"user_agent"`
	RequestPath   string `gorm:"size:255;not null" json:"request_path"`
	RequestMethod string `gorm:"size:16;not null" json:"request_method"`

	// 3. What (业务操作)
	Module  string     `gorm:"size:64;index:idx_audit_service_module;not null" json:"module"` // user, scheme, pipeline, rule, scan, device...
	Action  string     `gorm:"size:64;not null" json:"action"`                                // create, update, delete, trigger, sync...
	Level   AuditLevel `gorm:"size:8;index:idx_audit_level;default:'P2'" json:"level"`
	Summary string     `gorm:"size:500;not null" json:"summary"` // 易读操作描述

	// 4. Which (目标对象与二级明细逻辑关联键)
	TargetType string `gorm:"size:64;index:idx_audit_target" json:"target_type"` // repo, user, scheme, pipeline, task_trigger_log, device...
	TargetID   string `gorm:"size:128;index:idx_audit_target" json:"target_id"`  // 1024, "TRG-20260817-001" (关联 TaskTriggerLog.ID)
	TargetName string `gorm:"size:255" json:"target_name"`

	// 5. Diff & Snapshots (结构化快照与差异)
	BeforeData  string `gorm:"type:text" json:"before_data,omitempty"`  // 变更前 JSON 快照
	AfterData   string `gorm:"type:text" json:"after_data,omitempty"`   // 变更后 JSON 快照
	DiffSummary string `gorm:"type:text" json:"diff_summary,omitempty"` // 结构化变动字段概览

	// 6. Result (执行结果)
	StatusCode   int    `gorm:"not null" json:"status_code"` // HTTP Code
	DurationMs   int64  `gorm:"not null" json:"duration_ms"` // 执行耗时(ms)
	ErrorMessage string `gorm:"type:text" json:"error_message,omitempty"`
}

// TableName 指定统一物理表名为 sys_audit_logs
func (SysAuditLog) TableName() string {
	return "sys_audit_logs"
}
