# Code Common (代码平台通用基础库)

`code-common` 是面向 `code-shield`、`code-bench`、`code-pipeline`、`code-pdm` 四个子系统的公共基础包。

## 目录结构

- `backend/`: Go 语言后端公共库（`models` / `auth` / `utils`）
- `frontend/`: TS/React 前端公共库（`components` / `hooks` / `utils` / `types` / `styles`）

## 接入说明

### 后端 (Go)
在子系统 `go.mod` 中声明：
```go
require code-common/backend v0.0.0
replace code-common/backend => ../code-common/backend
```

### 前端 (TS/React)
在子系统 `package.json` 中声明：
```json
{
  "dependencies": {
    "@code/common": "file:../../code-common/frontend"
  }
}
```

## 治理规范

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
