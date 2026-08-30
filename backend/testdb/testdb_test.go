package testdb

import (
	"testing"
)

func TestExtractAndWithDBName(t *testing.T) {
	tests := []struct {
		dsn      string
		targetDB string
		expected string
		name     string
	}{
		{
			dsn:      "host=localhost port=5432 user=postgres password=secret dbname=code_shield sslmode=disable",
			targetDB: "postgres",
			expected: "host=localhost port=5432 user=postgres password=secret dbname=postgres sslmode=disable",
			name:     "code_shield",
		},
		{
			dsn:      "postgres://postgres:secret@localhost:5432/code_shield?sslmode=disable",
			targetDB: "code_test_123",
			expected: "postgres://postgres:secret@localhost:5432/code_test_123?sslmode=disable",
			name:     "code_shield",
		},
		{
			dsn:      "postgres://postgres:secret@localhost:5432",
			targetDB: "code_test_123",
			expected: "postgres://postgres:secret@localhost:5432/code_test_123",
			name:     "",
		},
		{
			dsn:      "postgres://postgres:secret@localhost:5432?sslmode=disable",
			targetDB: "code_test_123",
			expected: "postgres://postgres:secret@localhost:5432/code_test_123?sslmode=disable",
			name:     "",
		},
		{
			dsn:      "postgres://postgres:secret@localhost:5432/code_shield",
			targetDB: "postgres",
			expected: "postgres://postgres:secret@localhost:5432/postgres",
			name:     "code_shield",
		},
		{
			dsn:      "host=localhost port=5432 user=postgres password=xxdbname=prod dbname=code_shield sslmode=disable",
			targetDB: "code_test_123",
			expected: "host=localhost port=5432 user=postgres password=xxdbname=prod dbname=code_test_123 sslmode=disable",
			name:     "code_shield",
		},
		{
			dsn:      "host=localhost port=5432 user=postgres dbname='code shield' sslmode=disable",
			targetDB: "code_test_123",
			expected: "host=localhost port=5432 user=postgres dbname=code_test_123 sslmode=disable",
			name:     "code shield",
		},
		{
			dsn:      "host=localhost port=5432 user=postgres sslmode=disable",
			targetDB: "code_test_123",
			expected: "host=localhost port=5432 user=postgres sslmode=disable dbname=code_test_123",
			name:     "",
		},
	}

	for _, tt := range tests {
		gotName := extractDBName(tt.dsn)
		if gotName != tt.name {
			t.Errorf("extractDBName(%q) = %q, expected %q", tt.dsn, gotName, tt.name)
		}

		gotDSN := withDBName(tt.dsn, tt.targetDB)
		if gotDSN != tt.expected {
			t.Errorf("withDBName(%q, %q) = %q, expected %q", tt.dsn, tt.targetDB, gotDSN, tt.expected)
		}
	}
}

func TestIsSafeBaseDBName(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{"postgres", true},
		{"POSTGRES", true},
		{"code_shield_test", true},
		{"code_shield_TEST", true},
		{"code_test_abc_test", true},
		{"code_shield", false},
		{"CODE_SHIELD", false},
		{"production", false},
		{"master", false},
		{"", false},
		{"app", false},
		{"code_shield_prod", false},
	}
	for _, tt := range tests {
		if got := isSafeBaseDBName(tt.name); got != tt.want {
			t.Errorf("isSafeBaseDBName(%q) = %v, want %v", tt.name, got, tt.want)
		}
	}
}

func TestSanitizeName(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"code_bench", "code_bench"},
		{"Pipeline-Execution!", "pipeline_execution"},
		{"---", ""},
		{"a very long service name that exceeds the identifier budget easily", "a_very_long_service_name"},
	}
	for _, tt := range tests {
		if got := sanitizeName(tt.in); got != tt.want {
			t.Errorf("sanitizeName(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestNewTestDBNameLength(t *testing.T) {
	name := newTestDBName("a very long service name that exceeds the identifier budget easily")
	if len(name) > 63 {
		t.Errorf("test DB name %q exceeds PostgreSQL 63-byte identifier limit: %d", name, len(name))
	}
}

type TestSampleModel struct {
	ID   uint   `gorm:"primaryKey"`
	Name string `gorm:"size:50"`
}

func TestSetupIsolatedDB_Lifecycle(t *testing.T) {
	db := SetupIsolatedDB(t, "unit_test_lifecycle", &TestSampleModel{})
	if db == nil {
		return
	}

	// 在独立测试库中写入数据
	item := TestSampleModel{Name: "isolated-sample"}
	if err := db.Create(&item).Error; err != nil {
		t.Fatalf("failed to insert record into isolated test DB: %v", err)
	}

	var count int64
	db.Model(&TestSampleModel{}).Count(&count)
	if count != 1 {
		t.Fatalf("expected count 1, got %d", count)
	}
}
