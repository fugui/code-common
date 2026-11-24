# 工作区 AGENTS 规范

适用于 `/home/fugui/codes` 下所有子目录 Git 仓库（含新增目录）。根目录 `AGENTS.md` 软链至此文件；子目录若有独立 `AGENTS.md`，同时遵守。

## 1. 交付闭环与工作纪律

- **语言与精简**：沟通、文档、注释、提交信息统一使用简体中文；拒绝 Copy-Paste 冗余代码，及时清理无用代码。
- **交付闭环（验证 -> 提交 -> 推送）**：任一子目录修订完成后，按顺序直接执行，**无需等待用户确认**：
  1. **自检与验证**：完成代码自检并执行该目录的测试、静态检查与构建（如 `make test`、`make lint`、`make lint-arch`、`make build`），全部零警告通过后，**立即停止临时后台进程释放端口**并清理临时产物。
  2. **核查与提交**：核对 `git status` / `git diff` 排除无关改动与敏感信息，按 Conventional Commits（`feat:`/`fix:`/`docs:`/`refactor:`/`style:`/`test:`/`chore:` + 空格 + 中文描述）执行 `git commit`。
  3. **直接推送**：若已配置远端，直接 `git push`（禁止强推）；涉及多子目录时逐个完成；无远端或推送失败时明确说明原因与本地提交状态。
- **浏览器访问**：除非用户明确要求，否则不做浏览器界面验证；确需访问时严禁使用 `127.0.0.1`/`localhost`，统一使用 `192.168.56.8`。

## 2. SDD + TDD 与测试红线

- **四阶段流水线**（新子系统与重大特性）：`01-features` -> `02-design` -> `03-api` & `04-tasks` -> TDD 实施。`docs/` 采用双位数字前缀（`00-prompt` ~ `06-ops` 及内部 `01-xxx.md`）。
- **TDD 与门禁**：按 Red -> Green -> Refactor 先写单测/接口测试（覆盖正常、边界、非法入参、RBAC 越权）；前一 Milestone 的 `make test` 与 `make lint` 全绿后方可推进。
- **隔离测试库熔断**：涉及 DB 读写的 Go 单测必须使用 `code-common/backend/testdb.SetupIsolatedDB(t)`；**严禁将 `TEST_DB_DSN` 指向生产库或共享库**（仅允许 `postgres` 管理库或 `*_test` 库）。

## 3. CodeBench 微前端与模块契约

- **模块派生与双模运行**：新模块通过 `code-template/scripts/init-module.sh --key <module_key> --title "<中文名>"` 派生；后端经 `code-common/backend/server.Run` 剥离 `/<module_key>` 前缀并通过 `go:embed all:frontend/dist` 单二进制交付；前端通过 `@originjs/vite-plugin-federation` 暴露 `./App` 与 `./menu`，兼容嵌入与独立模式。
- **共享库表前缀隔离**：子模块 GORM 模型必须显式实现 `TableName() string` 并带模块专属前缀（如 `contract_`、`archdoc_`），严禁无前缀裸表。
- **标准 Makefile**：各工程根目录维护 `Makefile`，提供 `install` / `build` / `test`（含 `go fmt` + `go vet` + `go test`） / `lint`（含 `tsc --noEmit` + `eslint`） / `clean`。

## 4. 后端规范（Go）

- 遵循标准 Go 命名（导出 `PascalCase`、私有 `camelCase`）；**严禁 `_ = err` 忽略错误**。
- GORM v2 模型统一放 `models/`；写操作（增/删/改）接入 `code-common/backend/audit` 记录字段级 Diff 审计。
- 路由集中注册并区分免密（`/api/health`、`/api/auth/*`）与受保护路由（`commonAuth.AuthMiddleware`，管理路由加 `commonAuth.RequireAdmin("<module_key>_admin")`）。

## 5. 前端规范（React 18 / Vite 5 / TypeScript）

- **禁止提交 `package-lock.json`**：因研发与现网网络/镜像源环境不同，锁文件会导致三方包下载失败；各工程严禁生成或提交 `package-lock.json`（亦禁使用 `npm ci`），须在 `.gitignore` 中忽略 `package-lock.json`、在 `frontend/.npmrc` 配置 `package-lock=false`，并在 `Makefile`/`Dockerfile` 中使用 `npm install --no-package-lock`。
- **样式复用与命名**：优先 Vanilla CSS，复用 `@code/common`（`code-common/frontend/src/styles/`）组件与工具类，公共样式采用扁平 BEM（`.code-{component}-{element}--{modifier}`）；禁滥用内联 `style`（仅允许动态计算值），禁 JS 模拟 hover（用原生 CSS 伪类）。
- **双模主题 Token（SSOT）**：所有页面/弹窗/表格兼顾亮暗主题，统一使用 `theme.css` 的 `--color-*`（如 `--color-bg-surface/muted/input/hover`、`--color-text-primary/secondary/muted/white`、`--color-border-primary`、`--shadow-lg`）；**严禁硬编码 `#fff`/`#000` 等绝对色值**，旧别名嵌套 fallback 不超过 1 层。
- **微前端 CSS 防污染**：严禁重定义全局裸 `.btn` / `.btn-*` 或高特异性裸表单选择器（以 `@code/common/src/styles/theme.css` 的 `@layer` 为唯一基准）；子系统 `src/index.css` 首行必须 `@import '@code/common/src/styles/theme.css';`，且 `main.tsx`/`App.tsx` 先于页面组件导入 `./index.css`；按钮必须带语义变体（如 `btn btn-primary`，禁裸 `className="btn"`）。
- **通用分页**：用 `useSearchParams` 同步 `page`/`pageSize`/筛选项；每页选项 `15/25/50/100`（默认 `25`）；布局固定 `[首页][上一页][5页连续滑动窗口][下一页][末页][条/页]`，无省略号与跳转输入框。
- **类型安全**：严禁滥用 `any`，为 API 响应、Props、State 定义明确 `interface`。
