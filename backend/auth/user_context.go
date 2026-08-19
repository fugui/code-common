package auth

import (
	"code-common/backend/models"

	"github.com/gin-gonic/gin"
)

// UserContext 标准化的用户上下文，所有服务在 AuthMiddleware 之后均可获取
type UserContext struct {
	UserID         uint
	Username       string // 登录标识 (通常为 Email)
	Name           string // 显示姓名
	Email          string
	EmployeeID     string
	Roles          []string
	DepartmentID   *uint
	DepartmentName string
	User           *models.User // 完整 User 对象 (仅 DB 模式可用)
}

// SetUserContext 将标准化用户上下文写入 Gin Context
func SetUserContext(c *gin.Context, uc *UserContext) {
	if uc == nil {
		return
	}
	c.Set(ContextUserID, uc.UserID)
	c.Set(ContextUsername, uc.Username)
	c.Set(ContextName, uc.Name)
	c.Set(ContextEmail, uc.Email)
	c.Set(ContextEmployeeID, uc.EmployeeID)
	c.Set(ContextRoles, uc.Roles)
	c.Set(ContextIsAdmin, hasRole(uc.Roles, RoleSuperAdmin))
	if uc.User != nil {
		c.Set(ContextUser, *uc.User)
	}
}

// GetUserContext 从 Gin Context 中提取标准化用户上下文
func GetUserContext(c *gin.Context) *UserContext {
	uc := &UserContext{}

	// 优先从完整 User 对象提取
	if u, exists := c.Get(ContextUser); exists {
		if user, ok := u.(models.User); ok {
			uc.User = &user
			uc.UserID = user.ID
			uc.Name = user.Name
			uc.Username = user.Email
			if uc.Username == "" {
				uc.Username = user.Username
			}
			uc.Email = user.Email
			uc.EmployeeID = user.EmployeeID
			uc.Roles = user.GetRoles()
			uc.DepartmentID = user.DepartmentID
			if user.Department != nil {
				uc.DepartmentName = user.Department.Name
			}
			return uc
		}
	}

	// 回退：从标量 Key 提取
	if uid, exists := c.Get(ContextUserID); exists {
		if id, ok := uid.(uint); ok {
			uc.UserID = id
		}
	}
	if v, exists := c.Get(ContextName); exists {
		if s, ok := v.(string); ok {
			uc.Name = s
		}
	}
	if v, exists := c.Get(ContextUsername); exists {
		if s, ok := v.(string); ok {
			uc.Username = s
		}
	}
	if v, exists := c.Get(ContextEmail); exists {
		if s, ok := v.(string); ok {
			uc.Email = s
		}
	}
	if v, exists := c.Get(ContextRoles); exists {
		if roles, ok := v.([]string); ok {
			uc.Roles = roles
		}
	}
	if v, exists := c.Get(ContextEmployeeID); exists {
		if s, ok := v.(string); ok {
			uc.EmployeeID = s
		}
	}
	return uc
}

func hasRole(roles []string, target string) bool {
	for _, r := range roles {
		if r == target {
			return true
		}
	}
	return false
}
