package models

import (
	"time"

	"gorm.io/datatypes"
)

// Repository represents the standard code repository model shared across subsystems
type Repository struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	DepartmentID   uint           `gorm:"index" json:"department_id"`
	Department     Department     `gorm:"foreignKey:DepartmentID" json:"department"`
	Name           string         `gorm:"uniqueIndex;not null" json:"name"`
	ProjectID      string         `gorm:"default:''" json:"project_id"`
	URL            string         `gorm:"not null" json:"url"`
	HTTPURL        string         `gorm:"default:''" json:"http_url"`
	OwnerID        uint           `gorm:"index" json:"owner_id"`
	Owner          User           `gorm:"foreignKey:OwnerID" json:"owner"`
	Branch         string         `gorm:"default:master" json:"branch"`
	ServiceGroup   string         `gorm:"size:30" json:"service_group"`
	RelatedMembers datatypes.JSON `json:"related_members"`
	IsActive       bool           `gorm:"default:true" json:"is_active"`
	LastCommitHash string         `json:"last_commit_hash,omitempty"`
	ReportCount    int64          `gorm:"-" json:"report_count,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
}
