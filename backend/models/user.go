package models

import (
	"encoding/json"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// User represents the standard system user model shared across subsystems
type User struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	UniqueID     *string        `gorm:"uniqueIndex" json:"unique_id,omitempty"`
	EmployeeID   string         `gorm:"index;default:''" json:"employee_id"`
	EmployeeType string         `gorm:"default:''" json:"employee_type"`
	Email        string         `gorm:"uniqueIndex;not null;default:''" json:"email"`
	Username     string         `gorm:"index;default:''" json:"username"`
	Name         string         `gorm:"not null;default:''" json:"name"`
	Password     string         `gorm:"not null" json:"-"`
	RegMethod    string         `gorm:"default:'local'" json:"reg_method"`
	IsActive     bool           `gorm:"default:true" json:"is_active"`
	IsAdmin      bool           `gorm:"-" json:"is_admin"`
	Roles        datatypes.JSON `gorm:"type:text" json:"roles"`
	LastLogin    *time.Time     `json:"last_login"`
	LastIP       string         `gorm:"default:''" json:"last_ip"`
	DepartmentID *uint          `json:"department_id"`
	Department   *Department    `gorm:"foreignKey:DepartmentID" json:"department,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
}

func (u *User) GetRoles() []string {
	var roles []string
	if len(u.Roles) > 0 {
		_ = json.Unmarshal(u.Roles, &roles)
	}
	return roles
}

func (u *User) AfterFind(tx *gorm.DB) (err error) {
	u.IsAdmin = u.IsSuperAdmin()
	return
}

func (u *User) HasRole(targetRole string) bool {
	roles := u.GetRoles()
	for _, r := range roles {
		if r == "super_admin" || r == targetRole {
			return true
		}
	}
	return false
}

func (u *User) IsSuperAdmin() bool {
	roles := u.GetRoles()
	for _, r := range roles {
		if r == "super_admin" {
			return true
		}
	}
	return false
}

// Department represents the organizational department model
type Department struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"uniqueIndex;not null" json:"name"`
	LeaderID  *uint     `json:"leader_id"`
	Leader    *User     `gorm:"foreignKey:LeaderID" json:"leader,omitempty"`
	UserCount int64     `gorm:"-" json:"user_count"`
	RepoCount int64     `gorm:"-" json:"repo_count"`
	CreatedAt time.Time `json:"created_at"`
}
