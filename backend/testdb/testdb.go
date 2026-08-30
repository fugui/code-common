package testdb

import (
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// SetupIsolatedDB 为当前测试用例或测试套件创建一个完全物理隔离的临时数据库。
// 测试结束时（无论是成功、失败还是 panic），通过 t.Cleanup 自动彻底 DROP 销毁该临时数据库。
// 如果提供了 modelsToMigrate，会自动在临时库中执行 AutoMigrate 初始化表结构。
//
// 数据库连接串必须通过环境变量 TEST_DB_DSN 显式提供，且其中的库名只能是：
//   - postgres（PostgreSQL 管理库，用于执行建库/删库操作）
//   - 以 _test 结尾的测试专用库（如 code_shield_test）
//
// 其余库名（包括所有生产/核心业务库）一律视为非法并熔断拦截，防止测试误连生产库。
// 未设置 TEST_DB_DSN 或管理员库不可达时测试将被跳过（t.Skipf）。
func SetupIsolatedDB(t *testing.T, serviceName string, modelsToMigrate ...interface{}) *gorm.DB {
	t.Helper()

	baseDSN := strings.TrimSpace(os.Getenv("TEST_DB_DSN"))
	if baseDSN == "" {
		t.Skipf("Skipping DB test: TEST_DB_DSN not set. " +
			"Example: TEST_DB_DSN='host=127.0.0.1 port=5432 user=postgres dbname=postgres sslmode=disable'")
		return nil
	}

	// 1. 生产库熔断检查：仅允许 postgres 管理库或 *_test 测试库
	currentDB := extractDBName(baseDSN)
	if !isSafeBaseDBName(currentDB) {
		t.Fatalf("🚨 [FATAL ERROR] TEST_DB_DSN 指向的库名 %q 不在白名单（postgres 或 *_test 后缀）内，"+
			"已被 testdb 熔断拦截！请使用 postgres 管理库或带有 _test 后缀的测试专用配置。", currentDB)
	}

	// 2. 连接 PostgreSQL 管理库（用于执行建库与删库操作）
	adminDSN := withDBName(baseDSN, "postgres")
	adminDB, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  adminDSN,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Skipf("Skipping DB test: PostgreSQL admin connection not available (%v)", err)
		return nil
	}

	// 3. 生成唯一的临时测试库名
	testDBName := newTestDBName(serviceName)

	// 4. 创建一次性测试库
	if err := adminDB.Exec("CREATE DATABASE " + quoteIdent(testDBName)).Error; err != nil {
		t.Fatalf("testdb: failed to create temporary isolated test database %q: %v", testDBName, err)
	}

	// 5. 连接到刚创建的临时测试库
	targetDSN := withDBName(baseDSN, testDBName)
	testDB, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  targetDSN,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
		Logger:                                   logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		// 建库成功但连接失败时，尝试清理已建的库
		adminDB.Exec("DROP DATABASE IF EXISTS " + quoteIdent(testDBName))
		t.Fatalf("testdb: failed to connect to isolated test database %q: %v", testDBName, err)
	}

	// 6. 注册自动化生命周期销毁钩子 (无论测试结果如何，退出时自动销毁临时库)
	t.Cleanup(func() {
		if sqlDB, err := testDB.DB(); err == nil {
			_ = sqlDB.Close()
		}
		// 断开可能残留的连接并强制 DROP DATABASE
		_ = adminDB.Exec("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", testDBName)
		if err := adminDB.Exec("DROP DATABASE IF EXISTS " + quoteIdent(testDBName)).Error; err != nil {
			t.Logf("testdb: warning - failed to drop test database %q: %v", testDBName, err)
		}
		if adminSQL, err := adminDB.DB(); err == nil {
			_ = adminSQL.Close()
		}
	})

	// 7. 若传入了模型定义，执行自动表迁移
	if len(modelsToMigrate) > 0 {
		if err := testDB.AutoMigrate(modelsToMigrate...); err != nil {
			t.Fatalf("testdb: failed to migrate models for %s: %v", serviceName, err)
		}
	}

	return testDB
}

// isSafeBaseDBName 判断 TEST_DB_DSN 中的库名是否属于安全白名单：
// 仅允许 postgres 管理库，或以 _test 结尾的测试专用库（大小写不敏感）。
func isSafeBaseDBName(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	return lower == "postgres" || strings.HasSuffix(lower, "_test")
}

// newTestDBName 生成一次性测试库名：code_test_<service>_<纳秒时间戳>。
// 服务名会经过 sanitizeName 消毒并截断，保证总长度不超 PostgreSQL 63 字节标识符上限。
func newTestDBName(serviceName string) string {
	cleanService := sanitizeName(serviceName)
	if cleanService == "" {
		cleanService = "general"
	}
	return fmt.Sprintf("code_test_%s_%d", cleanService, time.Now().UnixNano())
}

// quoteIdent 为 PostgreSQL 标识符加双引号。此处库名全部由 sanitizeName 消毒生成
// （仅小写字母、数字、下划线），加引号仅为防御性写法。
func quoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// withDBName 将 DSN 中的数据库名称安全替换为目标 dbname（兼容 key=value 与 URL 两种形式）
func withDBName(dsn, dbname string) string {
	if strings.Contains(dsn, "://") {
		return withURLDBName(dsn, dbname)
	}
	return withKeyValueDBName(dsn, dbname)
}

// withURLDBName 使用 net/url 替换 URL 形式 DSN 的库名，
// 正确处理无库名路径、查询参数等情况。
func withURLDBName(dsn, dbname string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return dsn
	}
	u.Path = "/" + dbname
	return u.String()
}

// withKeyValueDBName 替换 libpq key=value 形式 DSN 中的 dbname。
// 通过 (^|\s) 锚定 dbname 键，避免误匹配密码等值内部的 "dbname=..." 片段；
// DSN 中不存在 dbname 键时追加到末尾。
func withKeyValueDBName(dsn, dbname string) string {
	if keyValueDBNameKeyRe.MatchString(dsn) {
		return keyValueDBNameRe.ReplaceAllString(dsn, "${1}dbname="+dbname)
	}
	return strings.TrimSpace(dsn) + " dbname=" + dbname
}

var (
	// keyValueDBNameRe 匹配 dbname 键及其值（兼容单/双引号值），并保留键前的空白。
	keyValueDBNameRe = regexp.MustCompile(`(^|\s)dbname\s*=\s*("[^"]*"|'[^']*'|\S+)`)
	// keyValueDBNameKeyRe 仅匹配 dbname 键，用于判断 DSN 中是否已存在该键。
	keyValueDBNameKeyRe = regexp.MustCompile(`(^|\s)dbname\s*=`)
)

// extractDBName 从 DSN 中提取当前的数据库名称
func extractDBName(dsn string) string {
	if strings.Contains(dsn, "://") {
		return extractURLDBName(dsn)
	}
	return extractKeyValueDBName(dsn)
}

func extractURLDBName(dsn string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return ""
	}
	return strings.Trim(strings.TrimPrefix(u.Path, "/"), "/")
}

func extractKeyValueDBName(dsn string) string {
	m := keyValueDBNameRe.FindStringSubmatch(dsn)
	if len(m) < 2 {
		return ""
	}
	val := m[2]
	if len(val) >= 2 && (val[0] == '"' || val[0] == '\'') && val[len(val)-1] == val[0] {
		val = val[1 : len(val)-1]
	}
	return strings.TrimSpace(val)
}

// sanitizeName 将服务名过滤为合法的 PostgreSQL 标识符字符（小写字母、数字、下划线），
// 并截断到 maxServiceLen，避免生成超长库名。
func sanitizeName(name string) string {
	name = strings.ToLower(name)
	re := regexp.MustCompile(`[^a-z0-9_]+`)
	cleaned := re.ReplaceAllString(name, "_")
	cleaned = strings.Trim(cleaned, "_")
	const maxServiceLen = 24
	if len(cleaned) > maxServiceLen {
		cleaned = cleaned[:maxServiceLen]
	}
	return cleaned
}
