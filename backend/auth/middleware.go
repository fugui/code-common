package auth

import (
	"net/http"
	"strings"

	"code-common/backend/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ExtractToken 从请求头 Authorization 或 query 中提取 JWT Token
func ExtractToken(c *gin.Context) string {
	tokenString := c.GetHeader("Authorization")
	if tokenString == "" {
		tokenString = c.Query("token")
	}
	if tokenString == "" {
		return ""
	}
	if strings.HasPrefix(tokenString, "Bearer ") {
		return strings.TrimPrefix(tokenString, "Bearer ")
	}
	return tokenString
}

// ExtractTokenFromHeader 兼容旧接口命名
func ExtractTokenFromHeader(c *gin.Context) string {
	return ExtractToken(c)
}

// RequireAuth 标准 JWT 认证中间件，注入通用上下文常量
func RequireAuth(jwtSecretGetter func() string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := ExtractToken(c)
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header or token missing"})
			c.Abort()
			return
		}

		claims, err := ParseToken(tokenString, jwtSecretGetter())
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token signature"})
			c.Abort()
			return
		}

		c.Set(ContextClaims, claims)
		c.Set(ContextUserID, claims.UserID)
		c.Set(ContextUsername, claims.Username)
		c.Set(ContextEmail, claims.Email)
		c.Set(ContextName, claims.Name)
		c.Set(ContextIsAdmin, claims.IsAdmin)
		c.Set(ContextRoles, claims.Roles)
		c.Next()
	}
}

// RequireRoles 角色权限校验中间件（支持 super_admin 自动放行）
func RequireRoles(jwtSecretGetter func() string, allowedRoles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		claimsVal, exists := c.Get(ContextClaims)
		var claims *PortalClaims
		if !exists {
			tokenString := ExtractToken(c)
			if tokenString == "" {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header or token missing"})
				c.Abort()
				return
			}
			var err error
			claims, err = ParseToken(tokenString, jwtSecretGetter())
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token signature"})
				c.Abort()
				return
			}
			c.Set(ContextClaims, claims)
			c.Set(ContextUserID, claims.UserID)
			c.Set(ContextRoles, claims.Roles)
		} else {
			claims = claimsVal.(*PortalClaims)
		}

		// 超级管理员自动拥有所有权限
		for _, r := range claims.Roles {
			if r == RoleSuperAdmin {
				c.Next()
				return
			}
		}

		// 检查是否具备目标角色中的任意一个
		hasPermission := false
		for _, requiredRole := range allowedRoles {
			for _, r := range claims.Roles {
				if r == requiredRole {
					hasPermission = true
					break
				}
			}
			if hasPermission {
				break
			}
		}

		if !hasPermission {
			c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden: insufficient permissions"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// SimpleAuthMiddleware 兼容别名
func SimpleAuthMiddleware(jwtSecretGetter func() string) gin.HandlerFunc {
	return RequireAuth(jwtSecretGetter)
}

// AuthConfig 统一认证中间件的可配置选项
type AuthConfig struct {
	JWTSecretGetter func() string

	// DB 模式配置 (传入 nil 则为纯 Claims 模式)
	DB            *gorm.DB
	PreloadAssocs []string // GORM Preload 关联列表，如 "Department"

	// SSO 用户自动注册回调 (仅 DB 模式生效)
	// 当 JWT 中的用户在本地 DB 中不存在时触发
	// 返回注册后的 User 对象；返回 error 将中止请求并响应 500
	OnUserNotFound func(c *gin.Context, claims *PortalClaims, db *gorm.DB) (*models.User, error)

	// 用户已存在时的同步回调 (可选)
	// 用于从 JWT claims 同步更新本地字段（如 Name、EmployeeID 变更等）
	OnUserSynced func(c *gin.Context, claims *PortalClaims, user *models.User, db *gorm.DB)

	// 是否以 DB 中存储的角色覆盖 JWT 中携带的角色 (默认 false)
	MergeDBRoles bool
}

// AuthMiddleware 创建统一的认证中间件
func AuthMiddleware(cfg AuthConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. 提取并校验 JWT Token
		tokenString := ExtractToken(c)
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header or token missing"})
			c.Abort()
			return
		}

		claims, err := ParseToken(tokenString, cfg.JWTSecretGetter())
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token signature"})
			c.Abort()
			return
		}

		// 注入 Claims 对象 (始终可用)
		c.Set(ContextClaims, claims)

		// 2. 构建统一 UserContext
		uc := &UserContext{
			UserID:     claims.UserID,
			Username:   claims.Username,
			Name:       claims.Name,
			Email:      claims.Email,
			EmployeeID: claims.EmployeeID,
			Roles:      claims.Roles,
		}

		// 3. DB 模式：查找/注册本地用户
		if cfg.DB != nil {
			var user models.User
			query := cfg.DB
			for _, assoc := range cfg.PreloadAssocs {
				query = query.Preload(assoc)
			}

			if err := query.First(&user, claims.UserID).Error; err != nil {
				// 用户不存在 → 调用注册回调
				if cfg.OnUserNotFound != nil {
					registeredUser, provErr := cfg.OnUserNotFound(c, claims, cfg.DB)
					if provErr != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"error": "SSO user provisioning failed"})
						c.Abort()
						return
					}
					if registeredUser != nil {
						user = *registeredUser
					}
				} else {
					c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
					c.Abort()
					return
				}
			} else {
				// 用户已存在 → 调用同步回调
				if cfg.OnUserSynced != nil {
					cfg.OnUserSynced(c, claims, &user, cfg.DB)
				}
			}

			// IsActive 检查
			if !user.IsActive {
				c.JSON(http.StatusForbidden, gin.H{"error": "Account is inactive"})
				c.Abort()
				return
			}

			// 填充 UserContext
			uc.UserID = user.ID
			uc.Name = user.Name
			uc.Username = user.Email
			if uc.Username == "" {
				uc.Username = user.Username
			}
			uc.Email = user.Email
			uc.EmployeeID = user.EmployeeID
			uc.DepartmentID = user.DepartmentID
			if user.Department != nil {
				uc.DepartmentName = user.Department.Name
			}
			uc.User = &user

			// 角色合并
			if cfg.MergeDBRoles {
				dbRoles := user.GetRoles()
				if len(dbRoles) > 0 {
					uc.Roles = dbRoles
				}
			}
		}

		// 显示姓名兜底
		if uc.Name == "" {
			uc.Name = uc.Email
		}
		if uc.Name == "" {
			uc.Name = uc.Username
		}

		// 4. 写入标准化上下文
		SetUserContext(c, uc)
		c.Next()
	}
}

// RequireAdmin 统一的管理员鉴权中间件
// allowedRoles 为该服务允许的管理员角色 (super_admin 始终放行)
func RequireAdmin(allowedRoles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		uc := GetUserContext(c)
		if uc == nil || uc.UserID == 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}

		// super_admin 自动放行
		if hasRole(uc.Roles, RoleSuperAdmin) {
			c.Next()
			return
		}

		// 检查目标角色
		for _, required := range allowedRoles {
			if hasRole(uc.Roles, required) {
				c.Next()
				return
			}
		}

		c.JSON(http.StatusForbidden, gin.H{"error": "Admin privileges required"})
		c.Abort()
	}
}
