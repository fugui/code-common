package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
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
