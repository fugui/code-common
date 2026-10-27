# 工作区通用开发规范与行为准则 (Workspace AGENTS Constitution) 🛡️

本准则为工作区所有工程（`code-bench`、`code-common`、`code-template`、`code-shield`、`code-pipeline`、`code-pdm`、`code-gate`、`code-traefik` 等）的**上位架构宪法**。所有团队成员与 AI 代理（Agents）必须严格遵守。

---

## 🧭 一、核心工程哲学：SDD (规范驱动) + TDD (测试驱动)

工作区严禁直接跳过设计堆砌业务代码。所有新业务子系统构建与重大特性演进，必须遵循 **SDD (Spec-Driven Development) + TDD (Test-Driven Development)** 四阶段研发流水线：

> **「阶段一：特性与边界明确 (`01-features`) -> 阶段二：架构与模型定稿 (`02-design`) -> 阶段三：契约冻结与任务拆解 (`03-api` & `04-tasks`) -> 阶段四：TDD 测试先行与分阶段交付」**

### 1. 标准 `docs/` 知识库目录结构与双位编号治理
由 `code-template/scripts/init-module.sh` 派生的新业务工程，默认内置以下标准 SDD + TDD 文档骨架。一级子目录与内部所有 Markdown 文档**强制采用双位数字编号前缀**（如 `01-xxx.md`），保证在文件树与 IDE 中具备严格的时序与逻辑演进关系：

```text
docs/
├── README.md                              # 文档知识库索引与 SDD+TDD 治理总则
├── 00-prompt/                             # 提示词资产库：沉淀各阶段 SDD/TDD 上下文 Prompt 指令
│   ├── 01-init-features-prompt.md         # 阶段一：需求边界与 Feature Matrix 生成提示词
│   ├── 02-design-prompt.md                # 阶段二：系统架构、数据模型与微前端交互设计提示词
│   ├── 03-api-and-tasks-prompt.md         # 阶段三：API 契约冻结与 TDD Milestone 拆解提示词
│   └── 04-tdd-implementation-prompt.md    # 阶段四：红-绿-重构 TDD 实施与全链路交付验证提示词
├── 01-features/                           # 阶段一（特性与边界）：Feature Matrix、P0~P2 优先级与 Non-Goals
│   └── 01-feature-matrix.md               # 核心功能矩阵、验收指标与非目标边界 (Non-Goals)
├── 02-design/                             # 阶段二（系统架构设计）：架构拓扑、GORM 模型与前端组件分层
│   └── 01-system-architecture.md          # 双模运行架构、数据库表结构（前缀隔离）与核心流程设计
├── 03-api/                                # 阶段三（接口与数据契约）：RESTful API 契约、权限矩阵与审计规范
│   └── 01-http-api-contract.md            # 请求/响应 Schema、RBAC 角色守卫与字段级 Diff 审计契约
├── 04-tasks/                              # 阶段三/四（TDD 路线图与作战卡）：Milestone DAG 与验收门禁 (AC)
│   ├── 01-roadmap.md                      # 工程实施路线图、Milestone 依赖拓扑图与全局质量门禁
│   └── 02-m1-domain-model-and-api.md      # M1 作战卡（含 TDD 先行测试用例清单与自动化验收命令）
├── 05-adr/                                # 架构决策记录 (ADR)：关键技术选型、权衡背景与决策后果
│   └── 01-module-architecture-adr.md      # ADR-01：微前端集成、共享库表前缀隔离与可测试性设计决策
└── 06-ops/                                # 交付与运维手册：联调验证、数据库隔离测试与生产部署清单
    └── 01-verification-and-deployment.md  # 独立/嵌入双模验证、隔离测试执行与单二进制部署指南
```

### 2. TDD (测试驱动开发) 实施红线
*   **测试先行循环 (Red -> Green -> Refactor)**：每个 Milestone 实施时，先依据 `docs/03-api/` 契约与 `docs/04-tasks/` 作战卡编写单元测试/接口测试（覆盖正常分支、边界条件、非法入参拦截与 RBAC 越权拦截），再编写业务实现直至测试全绿。
*   **物理隔离数据库测试 (`testdb.SetupIsolatedDB`)**：
    *   所有涉及数据库读写的 Go 单元测试，必须使用 `code-common/backend/testdb.SetupIsolatedDB(t)` 动态创建临时隔离库（并在 `t.Cleanup` 中自动销毁）。
    *   **严禁将 `TEST_DB_DSN` 指向生产库或团队共享库（如 `code_shield`）**！`testdb` 内置熔断机制，仅允许指向 `postgres` 管理库或带 `*_test` 后缀的测试库。
*   **里程碑质量门禁**：前一个 Milestone 的 `make test`（`go fmt` + `go vet` + `go test`）与 `make lint`（`tsc --noEmit` + `eslint`）必须 100% 零警告通过，方可推进至下一 Milestone。

---

## 📜 二、核心工作规章与自动化交付闭环

为了保持团队高效协同与代码库的健康度，所有团队成员（包括 AI 助手）必须严格遵守以下规章：
*   **沟通与注释语言**：团队成员全部为简体中文母语，所有交流、SDD 设计文档、代码注释及提交日志应**统一使用简体中文**进行沟通与书写。
*   **提交日志规范**：Git 提交日志必须符合 **Conventional Commits（约定式提交）** 规范。提交消息必须使用如 `feat:`、`fix:`、`docs:`、`refactor:`、`style:`、`test:`、`chore:` 等前缀，前缀后需加半角冒号与空格，随后紧跟中文描述。例如：`fix: 修复状态追踪展示逻辑`。
*   **开发流与自动交付闭环**：
    1. **代码自检 (Self-Review)**：每次代码修改完成后，必须进行严密的代码检视（检查错误处理、并发安全、表名前缀、主题色 Token、类型安全与文档同步）。
    2. **本地构建与验证**：确保本地构建与测试全部通过（`make test && make lint && make build`）。
    3. **清理与推送**：清理临时构建产物与后台测试进程后，若该仓库已配置远端 GitHub 仓库，直接提交并 push，无需等待口头指示。
*   **代码精简原则**：始终保持代码极其简洁。**严禁 Copy-Paste 产生冗余雷同代码**，遇到无用或冗余代码应及时予以重构或彻底删除。
*   **浏览器与网络访问**：**一般情况下（除非用户明确要求），不需要访问浏览器进行界面验证**。如果确需进行浏览器调试与访问（包括 AI 助手使用浏览器子代理访问页面）时，**请勿使用 `127.0.0.1` 或 `localhost`**，必须统一使用物理 IP 地址 **`192.168.56.18`**（例如 `http://192.168.56.18:8000` 或 `http://192.168.56.18:8080`）。
*   **后台进程与端口卫生管理**：在开发调试、本地构建或测试完成后，必须主动停止并释放后台启动的进程。**特别是对于 AI 助手，在完成代码编译运行与状态验证后，必须在单次回复用户之前主动关闭所有由其拉起的后台服务或测试进程，严禁留存后台进程占用物理端口（例如 `8000`、`8080`、`8090`、`8091` 等）导致后续调试启动冲突。**

---

## 🧩 三、CodeBench 微前端生态与模块契约

*   **一键派生新模块**：新建业务子系统时，统一在工作区根目录执行 `code-template/scripts/init-module.sh --key <module_key> --title "<中文名>"`，自动生成符合微前端契约与 SDD+TDD 规范的独立工程。
*   **主从 `AGENTS.md` 协同治理**：
    *   工作区根目录 `/home/fugui/codes/AGENTS.md`（软链至 `code-common/rules/AGENTS.md`）定义全局通用准则；
    *   各业务子系统根目录维护各自的 `AGENTS.md`（如 `code-shield/AGENTS.md`、`code-traefik/AGENTS.md`），聚焦本模块的业务边界、专有架构防腐红线、端口/表前缀契约与 SDD 路线图。
*   **共享库表名前缀强制隔离**：各业务模块默认与 `code-bench` 共享同一 PostgreSQL 实例（复用 `users`、`departments`、`audit_logs`），子模块自建的 GORM 模型**必须显式实现 `TableName() string` 并冠以模块专属前缀**（如 `tpl_`、`traefik_`、`pdm_`），严禁创建无前缀的裸表。
*   **双模运行与网关透明代理**：
    *   **后端**：统一通过 `code-common/backend/server.Run` 启动，自动识别并剥离宿主网关转发的 `/<module_key>` 路径前缀，通过 `go:embed all:frontend/dist` 实现单二进制交付。
    *   **前端**：通过 `@originjs/vite-plugin-federation` 暴露 `./App` 与 `./menu`；同时兼容嵌入门户模式（`isEmbedded=true`）与独立开发调试模式（`isEmbedded=false`）。

---

## 🎨 四、全栈代码风格与开发规范

### 1. 后端 (Go 语言)
*   **命名规范**：遵循标准 Go 命名法则。外部包可导出对象使用首字母大写 `PascalCase`；内部变量、包内私有函数/结构体使用小驼峰 `camelCase`。
*   **严格错误处理**：必须显式且严格地处理所有 `error`。**严禁使用 `_ = err` 忽略任何错误**，应当使用标准的 `if err != nil { return ... }` 处理。
*   **数据库交互与操作审计**：采用 **GORM v2** 进行持久化，数据模型统一放置在各工程的 `models/` 目录下；所有写操作（增/删/改）应接入 `code-common/backend/audit` 记录操作审计日志（支持字段级 Diff）。
*   **接口路由与鉴权**：API 路由集中注册，严格区分为：
    *   **免密路由 (Unprotected)**：无需认证的开放 API（如 `/api/health`、`/api/auth/*`）。
    *   **受保护路由 (Protected)**：使用 `commonAuth.AuthMiddleware` JWT 鉴权；管理员专属路由额外挂载 `commonAuth.RequireAdmin("<module_key>_admin")`。

### 2. 前端 (React / TypeScript)
*   **核心技术栈**：React 18, Vite 5, TypeScript。
*   **样式与 UI 规范**：优先使用 **Vanilla CSS** 进行精细化布局与设计，拒绝粗糙的默认 UI 配置。保持界面的**高端质感**与**流畅动效**。
*   **深浅主题双模适配与 Design Tokens 规范 (Theme & Design Tokens)**：所有页面、组件、抽屉弹窗（Drawer/Modal）、表格及表单必须**严格同时兼顾亮色（Light）与暗色（Dark）主题模式**：
    *   **单一真实源 (SSOT)**：所有样式颜色变量必须统一以 `theme.css` 中的 `--color-*` 语义 Token 为唯一基准（如 `--color-bg-surface`、`--color-text-primary`、`--color-border-primary`）。旧别名（如 `--card-bg`、`--text-main`、`--border-color`）仅为向后兼容过渡，严禁在组件中写超过 1 层的嵌套 fallback。
    *   **严禁硬编码绝对颜色**：禁止在内联样式或组件中写死 `#fff`、`#000`、`#111827`、`rgba(15, 23, 42, 0.6)` 等纯黑/纯白固定色值，避免亮色模式下产生黑块、黑表头、文字发黑融底等视觉灾难。
    *   **标准颜色变量映射**：
        *   **背景层**：卡片与主表面统一使用 `var(--color-bg-surface)`；表头与次级灰色背景使用 `var(--color-bg-muted)`；输入框/下拉框使用 `var(--color-bg-input)`；鼠标悬停使用 `var(--color-bg-hover)`。
        *   **文字层**：主要文本使用 `var(--color-text-primary)`；次级/说明文本使用 `var(--color-text-secondary)`；辅助弱化文本使用 `var(--color-text-muted)`；纯白文字使用 `var(--color-text-white)`。
        *   **边框与阴影**：边框统一使用 `var(--color-border-primary)`；浮层阴影统一使用 `var(--shadow-lg)` 或 `var(--shadow-drawer-right)`。
*   **样式抽象与 BEM 命名规范 (Style Abstraction & Flat BEM)**：
    *   **严禁内联 Style 滥用**：静态布局、边框、颜色与伪类交互严禁写在 JSX `style={{ ... }}` 中；只有真动态计算属性（如 `width: percentage`、`zIndex: dynamicZ`）允许使用内联 style。
    *   **严禁 JS 模拟伪类**：严禁在 `onMouseEnter`/`onMouseLeave` 中修改 DOM style 模拟 hover，必须使用原生 CSS `:hover`、`:active`、`:focus-visible` 伪类。
    *   **扁平化 BEM 命名**：公共组件统一使用 `.code-{component}-{element}--{modifier}` 命名空间。
*   **优先复用已有 CSS 样式 (CSS Reuse First)**：公共工具类统一在 `@code/common`（`code-common/frontend/src/styles/`）中沉淀与维护。充分复用成熟样式类与组件（如 `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.glass-card`, `.status-badge`, `Drawer`, `Pagination` 等），严禁随意编写同质冗余、割裂生硬的临时 ad-hoc CSS 样式。
*   **通用分页规范 (Pagination Standard)**：所有具备列表/表格分页功能的页面必须统一遵守以下交互与渲染规范：
    *   **URL 状态同步**：必须使用 `useSearchParams` 将 `page`、`pageSize` 以及筛选项同步至 URL Search Params，确保浏览器的“前进 / 后退”历史导航完全可用。
    *   **每页条数与默认值**：每页条数下拉选项统一为 `15`、`25`、`50`、`100` 条/页，缺省默认值统一为 `25` 条/页。
    *   **控件布局与结构**：分页栏控件组合由左至右固定为：`[首页]` `[上一页]` `[5页连续数字滑动窗口]` `[下一页]` `[末页]` `[条/页下拉框]`。
    *   **极简界面设计**：中间数字区域仅平滑展示当前页附近的 5 个连续页码（如 `18 19 [20] 21 22`），不夹杂离散数字或 `...` 省略号，且无需放置额外的页码跳转输入框。
*   **类型安全**：**严禁滥用 `any` 类型**。所有 API 响应数据、组件 Props、以及内部状态（State）都必须定义清晰明确的 TypeScript `interface`。

---

## 🛠️ 五、工程标准与构建规范
*   各工程统一在根目录维护 `Makefile`，支持 `make install`、`make build`、`make test`、`make lint`、`make clean` 等标准目标。
*   代码格式化与门禁遵循标准工具：后端执行 `make test`（内置 `go fmt`、`go vet`、`go test`），前端执行 `make lint`（内置 `tsc --noEmit` 与 `eslint`）。
