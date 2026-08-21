package server

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

// Options 定义微服务启动与配置选项
type Options struct {
	ServiceName       string        // 微服务显示名称，如 "Code-Shield"
	Prefix            string        // URL 前缀（如 "shield", "pipeline", "pdm"），为空表示根路径
	Port              string        // 监听端口，如 ":8080"
	GinLog            bool          // 是否启用 Gin 请求日志
	ReadTimeout       time.Duration // HTTP 读取超时
	ReadHeaderTimeout time.Duration // HTTP 请求头读取超时
	WriteTimeout      time.Duration // HTTP 写入超时
	IdleTimeout       time.Duration // HTTP 空闲连接超时
	MaxHeaderBytes    int           // 最大请求头字节数
	FrontendFS        *embed.FS     // 嵌入的前端静态资源
	FrontendDistPath  string        // 前端打包产物相对路径，默认为 "frontend/dist"
	CustomMiddlewares []gin.HandlerFunc
	RegisterRoutes    func(r *gin.Engine)
	ExtraNoRoute      func(c *gin.Context) bool // 自定义 NoRoute 拦截，返回 true 表示已被消费
	OnShutdown        func(ctx context.Context) // 停机清理钩子
}

// DefaultCORSMiddleware 统一跨域中间件
func DefaultCORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, cftk")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

// Run 启动微服务，处理路由挂载、静态资源托管、SPA fallback、超时及优雅停机
func Run(opts Options) error {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	if opts.GinLog {
		r.Use(gin.Logger())
	}
	r.Use(DefaultCORSMiddleware())

	for _, mw := range opts.CustomMiddlewares {
		r.Use(mw)
	}

	// 注册业务路由
	if opts.RegisterRoutes != nil {
		opts.RegisterRoutes(r)
	}

	// 挂载前端静态文件与 SPA 404 Fallback
	if opts.FrontendFS != nil {
		distPath := opts.FrontendDistPath
		if distPath == "" {
			distPath = "frontend/dist"
		}

		distFS, err := fs.Sub(*opts.FrontendFS, distPath)
		if err != nil {
			log.Printf("[%s] Warning: frontend dist folder not found, skipping frontend embedding: %v", opts.ServiceName, err)
		} else {
			httpFS := http.FS(distFS)
			r.NoRoute(func(c *gin.Context) {
				if opts.ExtraNoRoute != nil && opts.ExtraNoRoute(c) {
					return
				}

				path := c.Request.URL.Path

				// API 路由不进行 SPA 页面回退，直接 404
				if len(path) >= 4 && path[:4] == "/api" {
					c.JSON(http.StatusNotFound, gin.H{"error": "API route not found"})
					return
				}

				// 前缀重定向规范化处理
				if opts.Prefix != "" {
					prefixWithSlash := "/" + opts.Prefix
					if path == prefixWithSlash {
						c.Redirect(http.StatusMovedPermanently, prefixWithSlash+"/")
						return
					}
					if strings.HasPrefix(path, prefixWithSlash+"/") {
						path = strings.TrimPrefix(path, prefixWithSlash)
					}
				}

				// 尝试查找静态文件
				f, err := distFS.Open(strings.TrimPrefix(path, "/"))
				if err == nil {
					f.Close()
					c.FileFromFS(path, httpFS)
					return
				}

				// 最终回退至 index.html
				c.FileFromFS("/", httpFS)
			})
		}
	}

	// 处理外部反向代理前缀剥离 (如 /shield/xxx -> /xxx)
	var rootHandler http.Handler = r
	if opts.Prefix != "" {
		prefixWithSlash := "/" + opts.Prefix
		origHandler := rootHandler
		rootHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if req.URL.Path == prefixWithSlash {
				http.Redirect(w, req, prefixWithSlash+"/", http.StatusMovedPermanently)
				return
			}
			if strings.HasPrefix(req.URL.Path, prefixWithSlash+"/") {
				req.URL.Path = strings.TrimPrefix(req.URL.Path, prefixWithSlash)
			}
			origHandler.ServeHTTP(w, req)
		})
	}

	// 端口与超时设置
	port := opts.Port
	if port == "" {
		port = ":8080"
	}
	if !strings.HasPrefix(port, ":") {
		port = ":" + port
	}

	readTimeout := opts.ReadTimeout
	if readTimeout == 0 {
		readTimeout = 120 * time.Second
	}
	readHeaderTimeout := opts.ReadHeaderTimeout
	if readHeaderTimeout == 0 {
		readHeaderTimeout = 10 * time.Second
	}
	writeTimeout := opts.WriteTimeout
	if writeTimeout == 0 {
		writeTimeout = 120 * time.Second
	}
	idleTimeout := opts.IdleTimeout
	if idleTimeout == 0 {
		idleTimeout = 180 * time.Second
	}
	maxHeaderBytes := opts.MaxHeaderBytes
	if maxHeaderBytes == 0 {
		maxHeaderBytes = 1 << 20 // 1MB
	}

	srv := &http.Server{
		Addr:              port,
		Handler:           rootHandler,
		ReadTimeout:       readTimeout,
		ReadHeaderTimeout: readHeaderTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		MaxHeaderBytes:    maxHeaderBytes,
	}

	// 优雅停机信号捕获
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("[%s] Server listening on http://127.0.0.1%s", opts.ServiceName, port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[%s] Listen error: %v", opts.ServiceName, err)
		}
	}()

	<-ctx.Done()
	stop()
	log.Printf("[%s] Shutting down gracefully, press Ctrl+C again to force", opts.ServiceName)

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if opts.OnShutdown != nil {
		opts.OnShutdown(shutdownCtx)
	}

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[%s] Server forced to shutdown: %v", opts.ServiceName, err)
		return err
	}

	log.Printf("[%s] Server exited successfully", opts.ServiceName)
	return nil
}
