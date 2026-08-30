#!/usr/bin/env bash
# ==============================================================================
# 脚本名称: setup-symlinks.sh
# 功能描述: 在工作区根目录一键创建/更新指向 code-common 的软链接
# ==============================================================================

set -euo pipefail

# 颜色高亮定义
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
NC="\033[0m"

# 定位脚本所在目录与工作区根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "${BLUE}[INFO]${NC} 开始为工作区根目录 ($BASE_DIR) 初始化软链接..."

# 确保脚本具备可执行权限
chmod +x "$SCRIPT_DIR/start.sh" "$SCRIPT_DIR/count_lines.py" "$SCRIPT_DIR/count_lines_by_project.py" "$SCRIPT_DIR/git-stats.js" "$SCRIPT_DIR/setup-symlinks.sh" 2>/dev/null || true

# 辅助函数：创建或更新软链接
link_file() {
    local target_rel=$1
    local link_name=$2

    local target_path="$BASE_DIR/$target_rel"
    local link_path="$BASE_DIR/$link_name"

    if [ ! -e "$target_path" ]; then
        echo -e "${YELLOW}[WARN]${NC} 目标文件不存在，跳过: $target_rel"
        return
    fi

    # 如果存在非软链接的普通文件，先备份或替换
    if [ -e "$link_path" ] && [ ! -L "$link_path" ]; then
        rm -f "$link_path"
    fi

    ln -sf "$target_rel" "$link_path"
    echo -e "${GREEN}[LINK]${NC} $link_name -> $target_rel"
}

# 根目录文件软链接
link_file "code-common/scripts/start.sh" "start.sh"
link_file "code-common/infra/Caddyfile" "Caddyfile"
link_file "code-common/rules/GEMINI.md" "GEMINI.md"
link_file "code-common/scripts/count_lines.py" "count_lines.py"
link_file "code-common/scripts/count_lines_by_project.py" "count_lines_by_project.py"
link_file "code-common/scripts/git-stats.js" "git-stats.js"

# .agents 目录处理
mkdir -p "$BASE_DIR/.agents"
if [ -e "$BASE_DIR/.agents/AGENTS.md" ] && [ ! -L "$BASE_DIR/.agents/AGENTS.md" ]; then
    rm -f "$BASE_DIR/.agents/AGENTS.md"
fi
(cd "$BASE_DIR/.agents" && ln -sf "../code-common/rules/AGENTS.md" "AGENTS.md")
echo -e "${GREEN}[LINK]${NC} .agents/AGENTS.md -> ../code-common/rules/AGENTS.md"

echo -e "${GREEN}[SUCCESS]${NC} 所有软链接初始化完成！"
