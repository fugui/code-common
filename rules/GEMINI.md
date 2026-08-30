# GEMINI.md - Code-Shield 🛡️ 开发者指南

## 📜 核心工作规章
为了保持团队高效协同与代码库的健康度，所有团队成员（包括 AI 助手）必须严格遵守以下规章：
*   **沟通语言**：团队成员全部为简体中文母语，所有交流、文档、代码注释及提交日志应**尽可能使用中文**进行沟通与书写。
*   **提交日志规范**：Git 提交日志必须符合 **Conventional Commits（约定式提交）** 规范。提交消息必须使用如 `feat:`、`fix:`、`docs:`、`refactor:`、`style:`、`test:`、`chore:` 等前缀，前缀后需加半角冒号与空格，随后紧跟中文描述。例如：`fix: 修复漏扫快速补扫逻辑`。
*   **开发流与交付**：每次代码修改完成后，**必须进行修改代码的代码检视**。确认无误且本地构建与测试全部通过后，请**直接 push 到 GitHub** 仓库。
*   **代码精简原则**：始终保持代码极其简洁。**严禁 Copy-Paste 产生冗余雷同代码**，遇到无用或冗余代码应及时予以重构或彻底删除。
*   **浏览器与网络访问**：**一般情况下（除非用户明确要求），不需要访问浏览器进行界面验证**。如果确需进行浏览器调试与访问（包括 AI 助手使用浏览器子代理访问页面）时，**请勿使用 `127.0.0.1` 或 `localhost`**，必须统一使用物理 IP 地址 **`192.168.56.18`**（例如 `http://192.168.56.18:8000` 或 `http://192.168.56.18:8080`）。
*   **后台进程管理**：在开发调试、本地构建或测试完成后，必须主动停止并释放后台启动的进程（如 `code-pipeline` 等）。**特别是对于 AI 助手，在完成代码编译运行与状态验证后，必须在单次回复用户之前主动关闭所有由其拉起的后台服务或测试进程，严禁留存后台进程占用物理端口（例如 `8082` 等）导致后续调试启动冲突。**

---

## 🎨 代码风格与开发规范

### 1. 后端 (Go 语言)
*   **命名规范**：遵循标准 Go 命名法则。
    *   外部包可导出对象使用首字母大写 `PascalCase`。
    *   内部变量、包内私有函数/结构体使用小驼峰 `camelCase`。
*   **错误处理**：必须显式且严格地处理所有 `error`。**禁止使用 `_ = err` 忽略任何错误**，应当使用标准的 `if err != nil { return ... }` 处理。
*   **数据库交互**：采用 **GORM v2** 进行持久化。所有数据库的模型定义（Model）必须统一放置在 `shield-server/models` 目录下。
*   **接口路由**：API 路由在 `shield-server/main.go` 中进行集中式配置，路由应严格区分为：
    *   **免密路由 (Unprotected)**：无需认证的开放 API。
    *   **受保护路由 (Protected)**：使用 JWT/SSO 鉴权的受保护路由，必须挂载 `handlers.AuthMiddleware()` 中间件。
*   **任务与引擎**：AI 核心检视逻辑包含 `single`（单仓分析）和 `chunked`（分片并发分析）两种执行引擎，所有实现与接口均定义在 `shield-server/services` 目录下。

### 2. 前端 (React / TypeScript)
*   **核心技术栈**：React 18, Vite 5, TypeScript, Ant Design (AntD)。
*   **样式与 UI 规范**：优先使用 **Vanilla CSS** 进行精细化布局与设计，拒绝粗糙的默认 UI 配置。保持界面的**高端质感**与**流畅动效**（例如：分片分析进度条的实时流畅呈现、防止界面卡死的优雅骨架屏等）。
*   **深浅主题双模适配与 Design Tokens 规范 (Theme & Design Tokens)**：所有页面、组件、抽屉弹窗（Drawer/Modal）、表格及表单必须**严格同时兼顾亮色（Light）与暗色（Dark）主题模式**：
    *   **单一真实源 (SSOT)**：所有样式颜色变量必须统一以 `theme.css` 中的 `--color-*` 语义 Token 为唯一基准（如 `--color-bg-surface`、`--color-text-primary`、`--color-border-primary`）。旧别名（如 `--card-bg`、`--text-main`、`--border-color`）仅为向后兼容过渡，严禁在组件中写超过 1 层的嵌套 fallback。
    *   **严禁硬编码绝对颜色**：禁止在内联样式或组件中写死 `#fff`、`#000`、`#111827`、`rgba(15, 23, 42, 0.6)` 等纯黑/纯白固定色值，避免亮色模式下产生黑块、黑表头、文字发黑融底等视觉灾难。
    *   **标准颜色变量映射**：
        *   **背景层**：卡片与主表面统一使用 `var(--color-bg-surface)`（兼容别名 `var(--card-bg)`）；表头与次级灰色背景使用 `var(--color-bg-muted)`；输入框/下拉框使用 `var(--color-bg-input)`；鼠标悬停使用 `var(--color-bg-hover)`。
        *   **文字层**：主要文本使用 `var(--color-text-primary)`（兼容别名 `var(--text-main)`）；次级/说明文本使用 `var(--color-text-secondary)`；辅助弱化文本使用 `var(--color-text-muted)`；纯白文字使用 `var(--color-text-white)`。
        *   **边框与阴影**：边框统一使用 `var(--color-border-primary)`（兼容别名 `var(--border-color)`）；浮层阴影统一使用 `var(--shadow-lg)` 或 `var(--shadow-drawer-right)`。
*   **样式抽象与 BEM 命名规范 (Style Abstraction & Flat BEM)**：
    *   **严禁内联 Style 滥用**：静态布局、边框、颜色与伪类交互严禁写在 JSX `style={{ ... }}` 中；只有真动态计算属性（如 `width: percentage`、`zIndex: dynamicZ`）允许使用内联 style。
    *   **严禁 JS 模拟伪类**：严禁在 `onMouseEnter`/`onMouseLeave` 中修改 DOM style 模拟 hover，必须使用原生 CSS `:hover`、`:active`、`:focus-visible` 伪类。
    *   **扁平化 BEM 命名**：公共组件统一使用 `.code-{component}-{element}--{modifier}` 命名空间（如 `.code-drawer-panel`、`.code-drawer-mask--visible`）。
*   **优先复用已有 CSS 样式 (CSS Reuse First)**：公共工具类统一在 `@code/common`（`code-common/frontend/src/styles/`）中沉淀与维护。充分复用成熟样式类与组件（如 `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.glass-card`, `.status-badge`, `Drawer`, `Pagination` 等），严禁随意编写同质冗余、割裂生硬的临时 ad-hoc CSS 样式。
*   **通用分页规范 (Pagination Standard)**：所有具备列表/表格分页功能的页面必须统一遵守以下交互与渲染规范：
    *   **URL 状态同步**：必须使用 `useSearchParams` 将 `page`、`pageSize` 以及筛选项同步至 URL Search Params，确保浏览器的“前进 / 后退”历史导航完全可用。
    *   **每页条数与默认值**：每页条数下拉选项统一为 `15`、`25`、`50`、`100` 条/页，缺省默认值统一为 `25` 条/页。
    *   **控件布局与结构**：分页栏控件组合由左至右固定为：`[首页]` `[上一页]` `[5页连续数字滑动窗口]` `[下一页]` `[末页]` `[条/页下拉框]`。
    *   **极简界面设计**：中间数字区域仅平滑展示当前页附近的 5 个连续页码（如 `18 19 [20] 21 22`），不夹杂离散数字或 `...` 省略号，且无需放置额外的页码跳转输入框。
*   **组件设计**：公共组件统一放置在 `frontend/src/components` 下，确保单一职责且具备高复用性；路由页面与视图存放于 `frontend/src/pages`。
*   **类型安全**：**严禁滥用 `any` 类型**。所有 API 响应数据、组件 Props、以及内部状态（State）都必须定义清晰明确的 TypeScript `interface`。

### 3. 系统配置 (Config)
*   **配置文件**：系统默认加载 `shield-server/config.yaml`。
*   **解析与全局管理**：所有配置文件的解析代码和全局配置单例均集中放置于 `shield-server/models/config.go`。修改配置项时，请务必保持注释及说明高度一致。

---

## 🛠️ 常用开发命令速查
*为方便 AI 助手与开发人员进行日常校验与本地测试，以下提供核心开发命令汇总：*

*   **依赖安装与编译构建**：
    *   一键全系统构建：`make build`
    *   仅编译后端：`make -C shield-server backend`
    *   仅编译前端：`make -C shield-server frontend`
*   **运行服务**：
    *   快捷启动系统：`make run`
    *   启动前端开发服务器：`cd shield-server/frontend && npm run dev`
*   **测试与格式化**：
    *   运行后端 Go 测试：`cd shield-server && go test ./...`
    *   格式化 Go 代码：`cd shield-server && go fmt ./...`
    *   前端静态检查：`cd shield-server/frontend && npm run lint`
