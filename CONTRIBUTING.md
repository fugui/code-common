# code-common 治理规范与准入标准

为了保证公共库的健壮性与可维护性，所有存入与修改 `code-common` 的代码必须遵守以下准则：

## 1. 准入标准
- **复用阈值**：只有被 **≥ 2 个消费方**（或具备明确的平台跨系统标准规范，如 API 响应格式）引用的模块才允许抽取入库。
- **业务中立**：所有组件与工具不得硬编码特定子系统的专属业务逻辑，路径与 API Endpoint 必须可配置或参数化。
- **单一事实源**：基础数据模型（如 `User`、`Department`、`Config`）与标准 JWT Claims 统一在此定义，消费方只能以 type alias 或 import 形式复用，严禁本地自写重复接口导致结构漂移。

## 2. 依赖管理
- 前端 React/React-DOM 等框架级依赖统一声明在 `peerDependencies` 中，严禁强制捆绑特定版本。

## 3. 变更纪律
- 破坏性变更必须提前通知，采用 `deprecate-not-delete` 策略，保留兼容层。
- 每次在 `code-common` 中修改代码后，必须在本仓及四个消费方（`code-shield`, `code-bench`, `code-pipeline`, `code-pdm`）执行全量构建与测试回归。
