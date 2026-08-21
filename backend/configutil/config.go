package configutil

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"strings"
	"time"
)

// ServerConfigInterface 标准服务器配置接口
type ServerConfig struct {
	Port              string        `yaml:"port"`
	GinLog            bool          `yaml:"gin_log"`
	ReadTimeout       time.Duration `yaml:"read_timeout"`
	ReadHeaderTimeout time.Duration `yaml:"read_header_timeout"`
	WriteTimeout      time.Duration `yaml:"write_timeout"`
	IdleTimeout       time.Duration `yaml:"idle_timeout"`
	MaxHeaderBytes    int           `yaml:"max_header_bytes"`
	ExternalURL       string        `yaml:"external_url"`
}

// ApplyServerDefaults 填充服务器配置的推荐默认值
func ApplyServerDefaults(s *ServerConfig, defaultPort string) {
	if s.Port == "" {
		s.Port = defaultPort
	}
	if s.ExternalURL == "" {
		port := s.Port
		if strings.HasPrefix(port, ":") {
			s.ExternalURL = "http://127.0.0.1" + port
		} else {
			s.ExternalURL = "http://127.0.0.1:" + port
		}
	}
	if s.ReadTimeout == 0 {
		s.ReadTimeout = 120 * time.Second
	}
	if s.ReadHeaderTimeout == 0 {
		s.ReadHeaderTimeout = 10 * time.Second
	}
	if s.WriteTimeout == 0 {
		s.WriteTimeout = 120 * time.Second
	}
	if s.IdleTimeout == 0 {
		s.IdleTimeout = 180 * time.Second
	}
	if s.MaxHeaderBytes == 0 {
		s.MaxHeaderBytes = 1 << 20 // 1MB
	}
}

// EnsureJWTSecret 确保 JWT Secret 存在，若为空则自动生成临时高强度随机密钥
func EnsureJWTSecret(secret *string, serviceName string) {
	if *secret == "" {
		randomBytes := make([]byte, 32)
		if _, err := rand.Read(randomBytes); err != nil {
			log.Fatalf("[%s] Failed to generate random JWT secret: %v", serviceName, err)
		}
		*secret = hex.EncodeToString(randomBytes)
		log.Printf("[%s] WARNING: jwt_secret not configured. Using ephemeral random secret.", serviceName)
	}
}
