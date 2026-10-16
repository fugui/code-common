# Code Common (代码平台公共基础库) 📦

`code-common` 是面向代码平台各子系统（`code-shield`、`code-bench`、`code-pipeline`、`code-pdm`、`code-proto`）的**统一公共基础资产库**。它包含 Go 语言后端公共模块与 React / TypeScript 前端公共组件库，旨在消除跨子系统间的重复代码、统一数据模型事实源、拉齐 API 响应与鉴权规范，并提供符合团队交互标准的 UI 基础组件。

---

## 🌟 核心价值与设计原则

1. **单一事实源 (Single Source of Truth)**：基础核心模型（如 `User`、`Department`、`DatabaseConfig`）与 JWT Claims 统一在此收敛维护，各业务子系统直接引用，彻底解决各仓库独立维护导致的数据结构漂移与字段不一致缺陷。
2. **业务中立与解耦 (Business Neutrality)**：公共库内组件与工具严格剔除特定子系统的专属业务逻辑，API 路径与 Endpoint 均参数化、可配置化。
3. **标准化规范落地 (Specification Enforcement)**：前端提供符合团队通用规范的统一分页组件（URL 状态同步、5 页连续滑动窗口、15/25/50/100 阶梯选项）、全局异常边界（ErrorBoundary）、主题响应（Dark/Light）以及统一的 API Client 实例。
4. **轻量与依赖隔离 (Peer Dependencies)**：前端框架级依赖（如 React 18、React Router）统一声明为 `peerDependencies`，杜绝因版本锁死或多重打包引发的运行时实例冲突。

---

## 📁 目录结构

```text
code-common/
├── backend/                        # Go 后端公共包 (code-common/backend)
│   ├── auth/                       # 鉴权与 JWT Claims 中间件
│   │   ├── claims.go               # 标准 PortalClaims 结构体与解析方法
│   │   └── middleware.go           # Gin 统一 JWT 校验中间件 AuthMiddleware()
│   ├── models/                     # 共享数据模型与数据库配置
│   │   ├── user.go                 # 全局统一 User & Department 实体模型
│   │   └── config.go               # 统一 PostgreSQL DatabaseConfig 结构体
│   └── utils/                      # 基础工具与响应封装
│       ├── response.go             # 统一 JSON 响应 (Success / Error / PageResult)
│       └── response_test.go        # 响应单元测试
├── frontend/                       # React / TS 前端组件库 (@code/common)
│   ├── src/
│   │   ├── components/             # 公共 UI 组件 (Pagination, ErrorBoundary, Toast 等)
│   │   ├── hooks/                  # 通用自定义 Hooks (usePagination, useTheme 等)
│   │   ├── utils/                  # 工具方法与常量 (apiClient, constants 等)
│   │   ├── types/                  # 全局通用 TypeScript 类型定义
│   │   └── styles/                 # 统一 CSS 变量与设计规范 Token
│   └── package.json
├── infra/                          # 统一基础设施与反向代理网关配置
│   └── Caddyfile                   # 统一反向代理网关配置
├── rules/                          # 团队开发规章与智能体行为准则
│   └── AGENTS.md                   # 统一开发规范、命名准则与全栈样式准则
├── scripts/                        # 平台工程运维与全景启动脚本
│   ├── start.sh                    # Tmux 田字格多服务并发拉取/构建/启动脚本
│   ├── setup-symlinks.sh           # 工作区根目录软链接一键初始化脚本
│   ├── count_lines.py              # 全平台源码语言行数统计
│   ├── count_lines_by_project.py   # 按各子项目代码行数统计
│   └── git-stats.js                # Git 提交与贡献度分析
└── CONTRIBUTING.md                 # 准入标准与治理规范文档
```

---

## 🛠️ 模块详解与使用指南

### 1. 后端 (Go) 模块：`code-common/backend`

#### 引入依赖
在子系统的 `go.mod` 中声明：
```go
require code-common/backend v0.0.0

replace code-common/backend => ../code-common/backend
```

#### ① 数据模型 (Models)
统一使用 `models.User` 与 `models.Department`：
```go
import "code-common/backend/models"

// 数据库模型统一引用
type MyCustomEntity struct {
    ID     uint        `gorm:"primaryKey" json:"id"`
    UserID uint        `json:"user_id"`
    User   models.User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}
```

#### ② JWT 鉴权中间件 (Auth Middleware)
集中式路由挂载鉴权：
```go
import "code-common/backend/auth"

r := gin.Default()

// 受保护路由分组统一挂载
protected := r.Group("/api")
protected.Use(auth.AuthMiddleware(cfg.Auth.JWTSecret))
{
    protected.GET("/me", func(c *gin.Context) {
        claims, exists := auth.GetClaims(c)
        if !exists {
            c.JSON(401, gin.H{"error": "未登录"})
            return
        }
        // 读取通用字段
        c.JSON(200, gin.H{"username": claims.Username, "roles": claims.Roles})
    })
}
```

#### ③ 统一响应 (Utils / Response)
```go
import "code-common/backend/utils"

// 成功响应
utils.Success(c, data)

// 分页数据标准响应
utils.PageResult(c, items, total, page, pageSize)

// 错误响应
utils.Error(c, 400, "参数错误")
```

---

### 2. 前端 (React / TypeScript) 模块：`@code/common`

#### 引入依赖
在子系统的 `package.json` 中声明：
```json
{
  "dependencies": {
    "@code/common": "file:../../code-common/frontend"
  }
}
```

#### ① 规范化通用分页组件 (Pagination)
严格符合团队交互标准（URL 参数双向绑定、5 页滑动窗口）：
```tsx
import React from 'react';
import { Pagination, usePagination } from '@code/common';

export const UserListPage: React.FC = () => {
  const { page, pageSize, setPage, setPageSize } = usePagination({
    defaultPageSize: 25,
    syncUrl: true, // 自动将 page/pageSize 同步至 URL Search Params
  });

  return (
    <div>
      {/* 列表渲染 */}
      <Pagination
        current={page}
        pageSize={pageSize}
        total={120}
        onChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
        }}
        pageSizeOptions={[15, 25, 50, 100]}
      />
    </div>
  );
};
```

#### ② 全局异常捕获边界 (ErrorBoundary)
```tsx
import React from 'react';
import { ErrorBoundary } from '@code/common';

export const App: React.FC = () => {
  return (
    <ErrorBoundary fallbackTitle="子系统加载异常" onReset={() => window.location.reload()}>
      <MainContent />
    </ErrorBoundary>
  );
};
```

#### ③ 统一 API 客户端工厂 (createApiClient)
```tsx
import { createApiClient, AUTH_TOKEN_KEY } from '@code/common';

export const api = createApiClient({
  baseURL: '/api',
  getToken: () => localStorage.getItem(AUTH_TOKEN_KEY) || '',
  onUnauthorized: () => {
    // 登录态失效处理
  }
});
```

#### ④ 暗黑/明亮主题切换 (useTheme)
```tsx
import { useTheme } from '@code/common';

const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme}>
      当前主题: {theme === 'dark' ? '🌙 暗黑' : '☀️ 明亮'}
    </button>
  );
};
```

---

### 3. 基础设施、运维脚本与规范

`code-common` 统一承载跨项目的工程脚本、网关配置与 AI 协作规范。在工作区根目录执行以下命令即可一键完成软链接映射：

```bash
# 在工作区根目录下初始化所有软链接
bash code-common/scripts/setup-symlinks.sh
```

- **`scripts/start.sh`**：Tmux 田字格多服务并发拉取、按需编译并一键启动脚本（根目录 `./start.sh`）。
- **`infra/Caddyfile`**：统一反向代理网关配置，默认将端口 80 流量转发至 `code-bench`（端口 8000）。
- **`rules/AGENTS.md`**：团队开发核心规章、约定式提交、前端 Design Token 与智能体协同准则。
- **`scripts/count_lines.py`**：全平台源码语言行数统计。
- **`scripts/git-stats.js`**：Git 提交统计与贡献分析。

---

## 📜 治理规范与准入标准

为了保证公共库的纯粹性与稳定性，代码抽取与变更必须严格执行以下准则（详见 [CONTRIBUTING.md](./CONTRIBUTING.md)）：

*   **复用阈值**：仅当功能模块被 **≥ 2 个子系统**（或具备明确的平台跨系统规范）消费时，方可抽取下沉至公共库。
*   **单一事实源**：`User`、`Department`、`DatabaseConfig` 等基础实体仅在 `code-common` 中定义，禁止在各子系统中自行声明雷同结构。
*   **平滑兼容**：对于破坏性变更采用 `deprecate-not-delete` 策略，修改公共模块后必须在全平台 5 个业务子系统进行构建与回归验证。

---

## 🏷️ 版本历史

### v0.2.0 (2026-08-10)
- **后端鉴权与模型标准化**：下沉 `User`、`Department`、`DatabaseConfig` 模型，新增标准 `PortalClaims` 与 Gin `AuthMiddleware` 鉴权中间件。
- **前端公共组件与 Hooks 矩阵构建**：提供标准 `Pagination` 分页组件、`ErrorBoundary` 异常边界、`MemberSearchSelect` 成员检索组件及 `usePagination`、`useTheme` 等 Hooks。
- **React 依赖中立化**：将 React / React-DOM 调整为 `peerDependencies`，消除多版本构建冲突。
- **治理与单测体系**：新增 `CONTRIBUTING.md` 准入标准规范文档与后端响应处理单元测试。

### v0.1.0 (2026-08-01)
- **基础库初始化**：创建 `code-common` 统一公共库基础设施，实现标准分页组件与基础样式 Token。
