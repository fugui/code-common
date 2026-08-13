package models

import (
	"fmt"
	"os"
)

type FieldMappingConfig struct {
	Username     string `yaml:"username"`
	Email        string `yaml:"email"`
	Name         string `yaml:"name"`
	EmployeeID   string `yaml:"employee_id"`
	UniqueID     string `yaml:"unique_id"`
	EmployeeType string `yaml:"employee_type"`
}

type OAuth2Config struct {
	Enabled             bool               `yaml:"enabled"`
	ClientID            string             `yaml:"client_id"`
	ClientSecret        string             `yaml:"client_secret"`
	AuthURL             string             `yaml:"auth_url"`
	TokenURL            string             `yaml:"token_url"`
	UserInfoURL         string             `yaml:"userinfo_url"`
	RedirectURL         string             `yaml:"redirect_url"`
	Scopes              []string           `yaml:"scopes"`
	AdminList           []string           `yaml:"admin_list"`
	AllowedEmailDomains []string           `yaml:"allowed_email_domains"`
	FieldMapping        FieldMappingConfig `yaml:"field_mapping"`
	DeptAPIURL          string             `yaml:"dept_api_url"`
}

type DatabaseConfig struct {
	Host         string `yaml:"host"`
	Port         int    `yaml:"port"`
	User         string `yaml:"user"`
	Password     string `yaml:"password"`
	DBName       string `yaml:"dbname"`
	SSLMode      string `yaml:"sslmode"`
	MaxOpenConns int    `yaml:"max_open_conns"`
	MaxIdleConns int    `yaml:"max_idle_conns"`
	DSN          string `yaml:"dsn"`
}

func (d *DatabaseConfig) GetDSN() string {
	if envDSN := os.Getenv("DB_DSN"); envDSN != "" {
		return envDSN
	}
	if d.DSN != "" {
		return d.DSN
	}

	host := os.Getenv("DB_HOST")
	if host == "" {
		host = d.Host
	}
	if host == "" {
		host = "127.0.0.1"
	}

	portStr := os.Getenv("DB_PORT")
	port := 0
	if portStr != "" {
		fmt.Sscanf(portStr, "%d", &port)
	}
	if port <= 0 {
		port = d.Port
	}
	if port <= 0 {
		port = 5432
	}

	user := os.Getenv("DB_USER")
	if user == "" {
		user = d.User
	}
	if user == "" {
		user = "postgres"
	}

	password := os.Getenv("DB_PASSWORD")
	if password == "" {
		password = d.Password
	}

	dbname := os.Getenv("DB_NAME")
	if dbname == "" {
		dbname = d.DBName
	}
	if dbname == "" {
		dbname = "postgres"
	}

	sslmode := d.SSLMode
	if sslmode == "" {
		sslmode = "disable"
	}

	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, password, dbname, sslmode)
}
