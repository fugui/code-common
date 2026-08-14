package auth

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	"code-common/backend/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// EnsureSeedAdmin ensures at least one active super_admin account exists in the database.
// Default email is 'admin@code-shield.com' or overridden by ADMIN_EMAIL env var.
// Default password is 'Admin@123456' or overridden by ADMIN_PASSWORD env var.
func EnsureSeedAdmin(db *gorm.DB, defaultAdminRole string) error {
	var count int64
	if err := db.Model(&models.User{}).Count(&count).Error; err != nil {
		return fmt.Errorf("failed to count users: %w", err)
	}

	if count > 0 {
		return nil
	}

	adminEmail := os.Getenv("ADMIN_EMAIL")
	if adminEmail == "" {
		adminEmail = "admin@code-shield.com"
	}

	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminPassword == "" {
		adminPassword = "Admin@123456"
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash default admin password: %w", err)
	}

	roles := []string{"super_admin"}
	if defaultAdminRole != "" && defaultAdminRole != "super_admin" {
		roles = append(roles, defaultAdminRole)
	}
	rolesJSON, _ := json.Marshal(roles)

	user := models.User{
		Email:     adminEmail,
		Username:  adminEmail,
		Name:      "系统管理员",
		Password:  string(hashedPassword),
		IsActive:  true,
		RegMethod: "seed",
		Roles:     datatypes.JSON(rolesJSON),
	}

	if err := db.Create(&user).Error; err != nil {
		return fmt.Errorf("failed to create seed admin user: %w", err)
	}

	log.Printf("[Auth] Seed admin user initialized successfully (email: %s)", adminEmail)
	return nil
}
