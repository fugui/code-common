package auth

import (
	"testing"
	"time"
)

func TestGenerateAndParseToken(t *testing.T) {
	secret := "my_test_jwt_secret"
	userID := uint(101)
	username := "testuser"
	email := "testuser@example.com"
	name := "Test User"
	isAdmin := true
	roles := []string{"admin", "developer"}

	tokenStr, err := GenerateToken(userID, username, email, name, isAdmin, roles, secret, 1*time.Hour)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	claims, err := ParseToken(tokenStr, secret)
	if err != nil {
		t.Fatalf("ParseToken failed: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("expected UserID %d, got %d", userID, claims.UserID)
	}
	if claims.Username != username {
		t.Errorf("expected Username %s, got %s", username, claims.Username)
	}
	if claims.IsAdmin != isAdmin {
		t.Errorf("expected IsAdmin %v, got %v", isAdmin, claims.IsAdmin)
	}
	if len(claims.Roles) != 2 || claims.Roles[0] != "admin" {
		t.Errorf("unexpected roles: %v", claims.Roles)
	}
}

func TestParseTokenInvalidSecret(t *testing.T) {
	secret := "secret1"
	tokenStr, _ := GenerateToken(1, "u", "e", "n", false, nil, secret, 1*time.Hour)

	_, err := ParseToken(tokenStr, "wrong_secret")
	if err == nil {
		t.Error("expected error parsing token with wrong secret, got nil")
	}
}
