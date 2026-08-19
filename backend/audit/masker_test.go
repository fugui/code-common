package audit

import (
	"encoding/json"
	"testing"
)

func TestMasker(t *testing.T) {
	// 1. 测试敏感 key 识别与防误伤
	tests := []struct {
		key      string
		expected bool
	}{
		{"password", true},
		{"PassWord", true},
		{"pwd", true},
		{"jwt", true},
		{"token", true},
		{"access_token", true},
		{"client_secret", true},
		{"db_password", true},
		{"app_key", true},
		{"secret_key", true},
		// 非敏感业务字段（防误伤）
		{"token_type", false},
		{"secret_name", false},
		{"key_alias", false},
		{"keyword", false},
		{"username", false},
		{"email", false},
	}

	for _, tt := range tests {
		got := IsSensitiveKey(tt.key)
		if got != tt.expected {
			t.Errorf("IsSensitiveKey(%q) = %v; expected %v", tt.key, got, tt.expected)
		}
	}

	// 2. 测试嵌套数据结构脱敏
	input := map[string]any{
		"username":      "admin",
		"password":      "plaintext123",
		"client_secret": "my-secret-key-12345",
		"token_type":    "Bearer",
		"config": map[string]any{
			"db_password": "nested_db_pwd",
			"host":        "192.168.56.18",
			"tokens": []any{
				map[string]any{"access_token": "secret_token_1", "name": "prod_token"},
			},
		},
	}

	masked := MaskData(input).(map[string]any)

	if masked["password"] != "******" {
		t.Errorf("expected password to be masked, got %v", masked["password"])
	}
	if masked["client_secret"] != "******" {
		t.Errorf("expected client_secret to be masked, got %v", masked["client_secret"])
	}
	if masked["username"] != "admin" {
		t.Errorf("expected username to be admin, got %v", masked["username"])
	}
	if masked["token_type"] != "Bearer" {
		t.Errorf("expected token_type to be untouched, got %v", masked["token_type"])
	}

	cfg := masked["config"].(map[string]any)
	if cfg["db_password"] != "******" {
		t.Errorf("expected nested db_password to be masked, got %v", cfg["db_password"])
	}
	if cfg["host"] != "192.168.56.18" {
		t.Errorf("expected nested host to be untouched, got %v", cfg["host"])
	}

	tokens := cfg["tokens"].([]any)
	tok0 := tokens[0].(map[string]any)
	if tok0["access_token"] != "******" {
		t.Errorf("expected nested access_token to be masked, got %v", tok0["access_token"])
	}
	if tok0["name"] != "prod_token" {
		t.Errorf("expected nested name to be untouched, got %v", tok0["name"])
	}

	// 3. 测试 MaskJSONString
	jsonStr := `{"user":"alice","password":"123","token_type":"Bearer"}`
	maskedJSON := MaskJSONString(jsonStr)
	var parsed map[string]any
	if err := json.Unmarshal([]byte(maskedJSON), &parsed); err != nil {
		t.Fatalf("failed to parse masked JSON: %v", err)
	}
	if parsed["password"] != "******" {
		t.Errorf("expected password in json to be masked, got %v", parsed["password"])
	}
	if parsed["token_type"] != "Bearer" {
		t.Errorf("expected token_type in json to be Bearer, got %v", parsed["token_type"])
	}
}
