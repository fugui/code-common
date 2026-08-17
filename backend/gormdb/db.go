package gormdb

import (
	commonModels "code-common/backend/models"
	"io"
	"log"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Options 数据库连接与日志参数
type Options struct {
	ServiceName   string
	SlowLogFile   string
	SlowThreshold time.Duration
}

// Connect 创建并配置标准的 GORM 数据库连接实例及连接池
func Connect(dbCfg commonModels.DatabaseConfig, opts Options) (*gorm.DB, error) {
	slowLogPath := opts.SlowLogFile
	if slowLogPath == "" {
		slowLogPath = "slow_sql.log"
	}
	slowThreshold := opts.SlowThreshold
	if slowThreshold <= 0 {
		slowThreshold = time.Second
	}

	var logWriter io.Writer = os.Stdout
	if logFile, err := os.OpenFile(slowLogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666); err == nil {
		logWriter = io.MultiWriter(os.Stdout, logFile)
	}

	newLogger := logger.New(
		log.New(logWriter, "\r\n", log.LstdFlags),
		logger.Config{
			SlowThreshold:             slowThreshold,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		},
	)

	dsn := dbCfg.GetDSN()
	serviceTag := opts.ServiceName
	if serviceTag == "" {
		serviceTag = "DB"
	}
	log.Printf("[%s] Connecting to database...", serviceTag)

	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		Logger:                                   newLogger,
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err == nil {
		maxOpen := dbCfg.MaxOpenConns
		if maxOpen <= 0 {
			maxOpen = 50
		}
		maxIdle := dbCfg.MaxIdleConns
		if maxIdle <= 0 {
			maxIdle = 10
		}
		sqlDB.SetMaxOpenConns(maxOpen)
		sqlDB.SetMaxIdleConns(maxIdle)
		sqlDB.SetConnMaxLifetime(time.Hour)
		log.Printf("[%s] Database connection pool initialized (MaxOpen: %d, MaxIdle: %d)", serviceTag, maxOpen, maxIdle)
	}

	return db, nil
}
