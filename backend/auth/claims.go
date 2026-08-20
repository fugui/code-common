package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// PortalClaims represents the standard JWT Claims passed across subsystems
type PortalClaims struct {
	UserID     uint     `json:"user_id"`
	Username   string   `json:"username"`
	Email      string   `json:"email"`
	Name       string   `json:"name"`
	EmployeeID string   `json:"employee_id,omitempty"`
	IsAdmin    bool     `json:"is_admin"`
	Roles      []string `json:"roles"`
	jwt.RegisteredClaims
}

// ParseToken parses and validates a JWT token string with the given secret
func ParseToken(tokenString string, jwtSecret string) (*PortalClaims, error) {
	if jwtSecret == "" {
		return nil, fmt.Errorf("jwt secret is empty")
	}
	secret := []byte(jwtSecret)
	claims := &PortalClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}

// GenerateToken generates a new signed JWT token for a given user (backward compatible)
func GenerateToken(userID uint, username, email, name string, isAdmin bool, roles []string, jwtSecret string, duration time.Duration) (string, error) {
	return GenerateTokenWithEmployeeID(userID, username, email, name, "", isAdmin, roles, jwtSecret, duration)
}

// GenerateTokenWithEmployeeID generates a new signed JWT token with employeeID
func GenerateTokenWithEmployeeID(userID uint, username, email, name, employeeID string, isAdmin bool, roles []string, jwtSecret string, duration time.Duration) (string, error) {
	if jwtSecret == "" {
		return "", fmt.Errorf("jwt secret is empty")
	}
	claims := PortalClaims{
		UserID:     userID,
		Username:   username,
		Email:      email,
		Name:       name,
		EmployeeID: employeeID,
		IsAdmin:    isAdmin,
		Roles:      roles,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(duration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(jwtSecret))
}
