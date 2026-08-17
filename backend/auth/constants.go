package auth

// 平台标准角色常量
const (
	RoleSuperAdmin    = "super_admin"
	RoleShieldAdmin   = "shield_admin"
	RoleBenchAdmin    = "bench_admin"
	RolePipelineAdmin = "pipeline_admin"
	RolePdmAdmin      = "pdm_admin"
)

// 平台统一的 Gin Context Key
const (
	ContextUserID     = "userID"
	ContextUser       = "user"
	ContextRoles      = "roles"
	ContextEmail      = "email"
	ContextUsername   = "username"
	ContextEmployeeID = "employeeID"
	ContextClaims     = "claims"
)

// StandardTokenKey 前端与后端统一的登录 Cookie / Header Token 标识
const StandardTokenKey = "code_shield_token"
