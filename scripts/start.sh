#!/usr/bin/env bash
# ==============================================================================
# 脚本名称: start.sh
# 功能描述: 在 Tmux 中以分屏布局启动运行各个核心服务
# 布局结构 (默认启动: code-bench, code-shield, code-traefik):
#   ┌───────────────────┬───────────────────┐
#   │   code-bench      │    code-shield    │
#   │     (左上格)      │      (右上格)     │
#   ├───────────────────┴───────────────────┤
#   │              code-traefik             │
#   │                 (下格)                │
#   └───────────────────────────────────────┘
# ==============================================================================

set -euo pipefail

# 获取工作区根目录（自适应符号链接与脚本所在层级）
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
    DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
    SOURCE="$(readlink "$SOURCE")"
    [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_REAL_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"

if [ -d "$SCRIPT_REAL_DIR/../../code-bench" ]; then
    BASE_DIR="$(cd "$SCRIPT_REAL_DIR/../.." && pwd)"
elif [ -d "$SCRIPT_REAL_DIR/code-bench" ]; then
    BASE_DIR="$SCRIPT_REAL_DIR"
else
    BASE_DIR="$(pwd)"
fi
SESSION_NAME="code-stack"

# 颜色高亮定义
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    echo "使用方式: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  (无参数)      默认模式：按需编译 (make build) 并启动 Tmux 分屏会话运行核心服务 (code-bench, code-shield, code-traefik)"
    echo "  --update, -u  先拉取最新代码 (code-common 及 3 个服务模块) 并执行按需编译，然后启动服务"
    echo "  --build, -b   强制重新编译 3 个服务模块 (make -B build)，然后启动服务"
    echo "  --help, -h    显示帮助信息"
    echo ""
}

# 模式开关
DO_UPDATE=false
DO_BUILD=true
FORCE_BUILD=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --update|-u)
            DO_UPDATE=true
            shift
            ;;
        --build|-b)
            FORCE_BUILD=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "未知参数: $1"
            show_help
            exit 1
            ;;
    esac
done

# 前置依赖检查
REQUIRED_CMDS=("tmux")
if [ "$DO_UPDATE" = true ]; then
    REQUIRED_CMDS+=("git")
fi
if [ "$DO_BUILD" = true ]; then
    REQUIRED_CMDS+=("make" "go" "npm")
fi

for cmd in "${REQUIRED_CMDS[@]}"; do
    if ! command -v "$cmd" &>/dev/null; then
        log_error "未检测到必要依赖工具: $cmd，请先安装后再运行本脚本。"
        exit 1
    fi
done

# 前置项目目录检查（默认启动 code-bench, code-shield, code-traefik；pipeline 与 pdm 暂不启动）
DEFAULT_MODULES=("code-bench" "code-shield" "code-traefik")
for dir in "${DEFAULT_MODULES[@]}"; do
    if [ ! -d "$BASE_DIR/$dir" ]; then
        log_error "核心项目目录不存在: $BASE_DIR/$dir"
        exit 1
    fi
done

# ==============================================================================
# 第一步: 独立更新公共依赖代码 (仅当指定 --update 时执行)
# ==============================================================================
# 由于其他服务模块可能会依赖公共代码，因此先独立同步更新它
if [ "$DO_UPDATE" = true ]; then
    echo "=================================================================="
    echo "       开始更新公共模块 (git pull: code-common)                   "
    echo "=================================================================="
    PROJECT_DIR="$BASE_DIR/code-common"
    if [ ! -d "$PROJECT_DIR" ]; then
        log_error "项目目录不存在: $PROJECT_DIR"
        exit 1
    fi
    log_info "正在更新 code-common (cd $PROJECT_DIR && git pull)..."
    (cd "$PROJECT_DIR" && git pull)
    log_success "code-common 更新完成！"
    echo "=================================================================="
fi

# ==============================================================================
# 第二步: 配置与启动 Tmux 分屏会话
# ==============================================================================
log_info "正在配置 Tmux 分屏布局会话: $SESSION_NAME ..."

# 若已存在同名会话，先清理旧会话
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    log_warn "检测到已存在的 Tmux 会话 '$SESSION_NAME'，正在终止重建..."
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
    # 轮询等待旧会话完全销毁，避免 tmux server/socket 退出与重建竞态
    wait_count=0
    while tmux has-session -t "$SESSION_NAME" 2>/dev/null && [ "$wait_count" -lt 20 ]; do
        sleep 0.05
        wait_count=$((wait_count + 1))
    done
    # 微小缓冲，确保 tmux server 优雅完成 socket 释放
    sleep 0.1
fi

# 1. 创建会话，初始窗格作为【左上格】: code-bench（增加轻量重试应对 socket 瞬态波动）
PANE_TL=""
for retry in {1..5}; do
    if PANE_TL=$(tmux new-session -d -P -F '#{pane_id}' -s "$SESSION_NAME" -n "code-services" -c "$BASE_DIR/code-bench" 2>/dev/null); then
        break
    fi
    sleep 0.15
done

if [ -z "$PANE_TL" ]; then
    log_error "创建 Tmux 会话 '$SESSION_NAME' 失败！"
    # 执行一次未静默命令以便输出具体错误原因
    tmux new-session -d -P -F '#{pane_id}' -s "$SESSION_NAME" -n "code-services" -c "$BASE_DIR/code-bench"
    exit 1
fi

# 2. 从左上格向下垂直切分，创建【下格】: code-traefik (独占下半屏宽度)
PANE_BOTTOM=$(tmux split-window -v -P -F '#{pane_id}' -t "$PANE_TL" -c "$BASE_DIR/code-traefik")

# 3. 从左上格向右水平切分，创建【右上格】: code-shield (与左上格平分上半屏)
PANE_TR=$(tmux split-window -h -P -F '#{pane_id}' -t "$PANE_TL" -c "$BASE_DIR/code-shield")

# 4. 配置各窗格的标题与边框显示
tmux set-option -t "$SESSION_NAME" pane-border-status top
tmux set-option -t "$SESSION_NAME" pane-border-format " [ #{pane_title} ] "

tmux select-pane -t "$PANE_TL" -T "左上: code-bench"
tmux select-pane -t "$PANE_TR" -T "右上: code-shield"
tmux select-pane -t "$PANE_BOTTOM" -T "下格: code-traefik"

# ==============================================================================
# 第三步: 向各窗格分发启动指令 (并发执行 pull/build/run)
# ==============================================================================
log_info "正在向各窗格发送并发拉取、构建和启动命令..."

# 构造复合命令的函数
build_cmd() {
    local bin_name=$1
    local cmd=""
    if [ "$DO_UPDATE" = true ]; then
        cmd+="git pull && "
    fi
    if [ "$FORCE_BUILD" = true ]; then
        cmd+="make -B build && "
    elif [ "$DO_BUILD" = true ]; then
        cmd+="make build && "
    fi
    cmd+="./$bin_name"
    echo "$cmd"
}

tmux send-keys -t "$PANE_TL" "$(build_cmd code-bench-portal)" C-m
tmux send-keys -t "$PANE_TR" "$(build_cmd code-shield-server)" C-m
tmux send-keys -t "$PANE_BOTTOM" "$(build_cmd code-traefik-server)" C-m

# 默认将光标焦点置于左上格 (code-bench)
tmux select-pane -t "$PANE_TL"

log_success "多服务 Tmux 会话创建并分发任务完成！"

# ==============================================================================
# 第四步: 连接进入 Tmux 会话
# ==============================================================================
if [ -n "${TMUX:-}" ]; then
    # 若当前已经在 Tmux 环境中，则切换客户端
    tmux switch-client -t "$SESSION_NAME"
else
    # 否则直接附加到会话
    tmux attach-session -t "$SESSION_NAME"
fi
