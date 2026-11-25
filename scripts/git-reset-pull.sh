#!/usr/bin/env bash
# ==============================================================================
# 脚本名称: git-reset-pull.sh
# 功能描述: 批量清除工作区下全部 Git 仓库的本地修改，并拉取最新远端代码
# ==============================================================================

set -euo pipefail

# 本地缺失仓库时的 clone 来源（SSH 模式，github.com/fugui/ 下）
GITHUB_SSH_PREFIX="git@github.com:fugui/"

# 颜色高亮定义
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
BOLD="\033[1m"
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
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# 自适应解析工作区根目录（兼容通过根目录软链接调用）
resolve_base_dir() {
    local source="${BASH_SOURCE[0]}"
    local dir=""
    while [ -h "$source" ]; do
        dir="$(cd "$(dirname "$source")" && pwd)"
        source="$(readlink "$source")"
        [[ "$source" != /* ]] && source="$dir/$source"
    done
    local script_real_dir
    script_real_dir="$(cd "$(dirname "$source")" && pwd)"
    cd "$script_real_dir/../.." && pwd
}

show_help() {
    cat <<EOF
使用方式: $(basename "$0") [选项] [仓库名...]

功能说明:
  批量扫描工作区下所有一级 Git 仓库（或指定的仓库），先预览远端同步状态与
  本地变更，经确认后清除本地修改并拉取最新代码（保留 .gitignore 忽略文件）。

选项:
  (无参数)             预览状态并交互确认后，执行 reset --hard HEAD、clean -fd 与 pull --ff-only
  -y, --yes            跳过交互确认，直接执行
  -n, --dry-run        仅 fetch 并展示状态预览表，不修改任何工作区文件或分支指针
  -f, --force-remote   强制对齐远端追踪分支（git reset --hard <upstream>），连同未推送提交一并丢弃
  --no-clean           仅还原已跟踪文件修改（git reset --hard HEAD），保留未跟踪文件
  --dir <路径>         指定要扫描的工作区根目录（默认自动定位脚本所在工作区根目录）
  -h, --help           显示此帮助信息

参数:
  [仓库名...]          可选，仅处理指定子目录名称（例如: code-common code-bench）
                       若指定的目录在本地不存在，将先通过 SSH 从
                       ${GITHUB_SSH_PREFIX}<仓库名>.git clone 下来再处理
                       （--dry-run 下仅提示，不实际 clone）
EOF
}

main() {
    local auto_yes=false
    local dry_run=false
    local force_remote=false
    local no_clean=false
    local custom_dir=""
    local target_repos=()

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -y|--yes)
                auto_yes=true
                shift
                ;;
            -n|--dry-run)
                dry_run=true
                shift
                ;;
            -f|--force-remote)
                force_remote=true
                shift
                ;;
            --no-clean)
                no_clean=true
                shift
                ;;
            --dir)
                if [[ $# -lt 2 ]] || [[ -z "$2" ]]; then
                    log_error "--dir 参数缺少目录路径"
                    exit 1
                fi
                custom_dir="$2"
                shift 2
                ;;
            --dir=*)
                custom_dir="${1#*=}"
                if [[ -z "$custom_dir" ]]; then
                    log_error "--dir 参数缺少目录路径"
                    exit 1
                fi
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            -*)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
            *)
                target_repos+=("$1")
                shift
                ;;
        esac
    done

    if ! command -v git &>/dev/null; then
        log_error "未检测到 git 命令，请先安装 git。"
        exit 1
    fi

    local base_dir=""
    if [[ -n "$custom_dir" ]]; then
        if [[ ! -d "$custom_dir" ]]; then
            log_error "指定的工作区目录不存在: $custom_dir"
            exit 1
        fi
        base_dir="$(cd "$custom_dir" && pwd)"
    else
        base_dir="$(resolve_base_dir)"
    fi

    # 收集待处理的 Git 仓库列表
    local repo_paths=()
    local repo_names=()

    if [[ ${#target_repos[@]} -gt 0 ]]; then
        local name=""
        local seen_list=""
        for name in "${target_repos[@]}"; do
            name="${name%/}"
            local candidate="$base_dir/$name"
            if [[ ! -e "$candidate" ]]; then
                if [[ ! "$name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
                    log_error "仓库名不合法，无法 clone: $name"
                    exit 1
                fi
                local clone_url="${GITHUB_SSH_PREFIX}${name}.git"
                if [[ "$dry_run" == true ]]; then
                    log_info "[DRY-RUN] 本地不存在 $name，实际执行时将 clone: $clone_url"
                    continue
                fi
                log_info "本地不存在 $name，正在通过 SSH clone: $clone_url"
                if ! git clone -- "$clone_url" "$candidate"; then
                    log_error "clone 失败: $clone_url（请检查 SSH 密钥与仓库是否存在）"
                    exit 1
                fi
                log_success "已 clone: $candidate"
            fi
            if [[ ! -d "$candidate" ]]; then
                log_error "目标路径不是目录: $candidate"
                exit 1
            fi
            if [[ ! -e "$candidate/.git" ]]; then
                log_error "目标目录不是 Git 仓库（缺少 .git）: $candidate"
                exit 1
            fi
            local canonical
            canonical="$(cd "$candidate" && pwd)"
            if [[ "$seen_list" == *"|$canonical|"* ]]; then
                continue
            fi
            seen_list+="|$canonical|"
            repo_paths+=("$canonical")
            repo_names+=("$(basename "$canonical")")
        done
    else
        local dir=""
        local discovered=()
        for dir in "$base_dir"/*/; do
            [[ -d "$dir" ]] || continue
            dir="${dir%/}"
            if [[ -e "$dir/.git" ]]; then
                discovered+=("$dir")
            fi
        done
        if [[ ${#discovered[@]} -gt 0 ]]; then
            local sorted_dirs=()
            while IFS= read -r dir; do
                [[ -n "$dir" ]] && sorted_dirs+=("$dir")
            done < <(printf '%s\n' "${discovered[@]}" | LC_ALL=C sort)
            for dir in "${sorted_dirs[@]}"; do
                repo_paths+=("$dir")
                repo_names+=("$(basename "$dir")")
            done
        fi
    fi

    if [[ ${#repo_paths[@]} -eq 0 ]]; then
        log_warn "在 $base_dir 下未发现任何 Git 仓库。"
        exit 0
    fi

    log_info "工作区根目录: $base_dir（共发现 ${#repo_paths[@]} 个 Git 仓库）"
    log_info "阶段一：正在 fetch 远端并检测各仓库状态（暂不修改本地工作区）..."

    # 阶段一状态数组（与 repo_paths 索引一一对应）
    local repo_branches=()
    local repo_upstreams=()
    local repo_remotes=()
    local repo_fetch_ok=()
    local repo_fetch_errs=()
    local repo_tracked_cnt=()
    local repo_untracked_cnt=()
    local repo_ahead=()
    local repo_behind=()
    local repo_in_progress=()
    local repo_notes=()

    local any_fetch_failed=false
    local i=0
    for ((i = 0; i < ${#repo_paths[@]}; i++)); do
        local repo="${repo_paths[$i]}"
        local branch=""
        branch="$(git -C "$repo" symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED")"

        local upstream=""
        upstream="$(git -C "$repo" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"

        local remote=""
        if [[ -n "$upstream" ]]; then
            remote="${upstream%%/*}"
        else
            local remotes_raw=""
            remotes_raw="$(git -C "$repo" remote 2>/dev/null || true)"
            if printf '%s\n' "$remotes_raw" | grep -qx "origin"; then
                remote="origin"
            else
                remote="$(printf '%s\n' "$remotes_raw" | head -n 1)"
            fi
        fi

        local fetch_ok=1
        local fetch_err=""
        if [[ -n "$remote" ]]; then
            if ! fetch_err="$(git -C "$repo" fetch --prune "$remote" 2>&1)"; then
                fetch_ok=0
                any_fetch_failed=true
            fi
        fi

        # 若未配置上游但非游离 HEAD 且远端存在同名分支，则自动关联有效上游以计算领先/落后
        if [[ -z "$upstream" ]] && [[ "$branch" != "DETACHED" ]] && [[ -n "$remote" ]]; then
            if git -C "$repo" show-ref --verify --quiet "refs/remotes/$remote/$branch"; then
                upstream="$remote/$branch"
            fi
        fi

        local tracked_cnt=0
        local untracked_cnt=0
        local status_line=""
        while IFS= read -r status_line; do
            [[ -z "$status_line" ]] && continue
            if [[ "$status_line" == "?? "* ]]; then
                untracked_cnt=$((untracked_cnt + 1))
            else
                tracked_cnt=$((tracked_cnt + 1))
            fi
        done < <(git -C "$repo" status --porcelain 2>/dev/null || true)

        local ahead=0
        local behind=0
        if [[ -n "$upstream" ]] && git -C "$repo" rev-parse --verify --quiet "$upstream" >/dev/null; then
            local counts=""
            counts="$(git -C "$repo" rev-list --left-right --count "HEAD...$upstream" 2>/dev/null || echo "0 0")"
            read -r ahead behind <<< "$counts"
        fi

        local in_prog=""
        local git_merge_head git_rebase_merge git_rebase_apply git_cherry_head
        git_merge_head="$(git -C "$repo" rev-parse --git-path MERGE_HEAD)"
        git_rebase_merge="$(git -C "$repo" rev-parse --git-path rebase-merge)"
        git_rebase_apply="$(git -C "$repo" rev-parse --git-path rebase-apply)"
        git_cherry_head="$(git -C "$repo" rev-parse --git-path CHERRY_PICK_HEAD)"
        [[ "$git_merge_head" != /* ]] && git_merge_head="$repo/$git_merge_head"
        [[ "$git_rebase_merge" != /* ]] && git_rebase_merge="$repo/$git_rebase_merge"
        [[ "$git_rebase_apply" != /* ]] && git_rebase_apply="$repo/$git_rebase_apply"
        [[ "$git_cherry_head" != /* ]] && git_cherry_head="$repo/$git_cherry_head"

        if [[ -d "$git_rebase_merge" ]] || [[ -d "$git_rebase_apply" ]]; then
            in_prog="rebase"
        elif [[ -f "$git_merge_head" ]]; then
            in_prog="merge"
        elif [[ -f "$git_cherry_head" ]]; then
            in_prog="cherry-pick"
        fi

        local note=""
        if [[ "$fetch_ok" -eq 0 ]]; then
            note="fetch失败（将跳过以保护本地改动）"
        elif [[ -z "$remote" ]]; then
            note="无远端（仅清理本地，跳过拉取）"
        elif [[ "$branch" == "DETACHED" ]]; then
            note="游离HEAD（仅清理本地，跳过拉取）"
        elif [[ -z "$upstream" ]]; then
            note="远端无对应分支（仅清理本地，跳过拉取）"
        elif [[ "$ahead" -gt 0 ]] && [[ "$behind" -gt 0 ]]; then
            if [[ "$force_remote" == true ]]; then
                note="分叉提交（-f 将丢弃本地提交并重置到 $upstream）"
            else
                note="本地与远端分叉（--ff-only 将拒绝，需 -f 强刷）"
            fi
        elif [[ "$ahead" -gt 0 ]]; then
            if [[ "$force_remote" == true ]]; then
                note="领先远端（-f 将丢弃本地未推送提交并重置到 $upstream）"
            else
                note="存在本地未推送提交（将保留提交并跳过快进）"
            fi
        elif [[ "$behind" -gt 0 ]]; then
            note="落后远端 ${behind} 个提交（将拉取更新）"
        elif [[ "$tracked_cnt" -gt 0 ]] || [[ "$untracked_cnt" -gt 0 ]] || [[ -n "$in_prog" ]]; then
            note="需清理本地工作区"
        else
            note="已是最新且工作区干净"
        fi

        if [[ -n "$in_prog" ]] && [[ "$fetch_ok" -eq 1 ]]; then
            note="检测到未完成的 ${in_prog}；$note"
        fi

        repo_branches+=("$branch")
        repo_upstreams+=("$upstream")
        repo_remotes+=("$remote")
        repo_fetch_ok+=("$fetch_ok")
        repo_fetch_errs+=("$fetch_err")
        repo_tracked_cnt+=("$tracked_cnt")
        repo_untracked_cnt+=("$untracked_cnt")
        repo_ahead+=("$ahead")
        repo_behind+=("$behind")
        repo_in_progress+=("$in_prog")
        repo_notes+=("$note")
    done

    echo ""
    printf "${BOLD}%-20s %-14s %-8s %-8s %-12s %s${NC}\n" "Repo" "Branch" "Tracked" "Untrack" "Ahead/Behind" "Status"
    printf "%-20s %-14s %-8s %-8s %-12s %s\n" "--------------------" "--------------" "--------" "--------" "------------" "------------------------------"
    for ((i = 0; i < ${#repo_paths[@]}; i++)); do
        local ab="+${repo_ahead[$i]}/-${repo_behind[$i]}"
        printf "%-20s %-14s %-8s %-8s %-12s %s\n" \
            "${repo_names[$i]}" \
            "${repo_branches[$i]}" \
            "${repo_tracked_cnt[$i]}" \
            "${repo_untracked_cnt[$i]}" \
            "$ab" \
            "${repo_notes[$i]}"
        if [[ "${repo_fetch_ok[$i]}" -eq 0 ]] && [[ -n "${repo_fetch_errs[$i]}" ]]; then
            log_warn "  └─ ${repo_names[$i]} fetch 详情: ${repo_fetch_errs[$i]//$'\n'/ }"
        fi
    done
    echo ""

    if [[ "$dry_run" == true ]]; then
        log_info "[DRY-RUN] 预览模式：未对任何仓库工作区或分支指针做任何修改。"
        if [[ "$any_fetch_failed" == true ]]; then
            log_error "部分仓库 fetch 失败，请检查网络或远端配置。"
            exit 1
        fi
        exit 0
    fi

    if [[ "$auto_yes" == false ]]; then
        if [[ ! -t 0 ]]; then
            log_error "当前为非交互终端且未指定 -y / --yes，已中止以防误删本地改动。"
            exit 1
        fi

        echo -e "${YELLOW}${BOLD}警告：即将对上述仓库执行不可逆清理操作：${NC}"
        echo -e "  - 永久丢弃所有已跟踪文件的本地修改与暂存内容（git reset --hard HEAD）"
        if [[ "$no_clean" == true ]]; then
            echo -e "  - 已指定 --no-clean：保留未跟踪文件及 .gitignore 忽略文件"
        else
            echo -e "  - 永久删除所有未跟踪文件与目录（git clean -fd），但保留 .gitignore 忽略文件（如 node_modules、.env）"
        fi
        if [[ "$force_remote" == true ]]; then
            echo -e "  - ${RED}已指定 -f / --force-remote：将强制对齐远端追踪分支，本地未推送提交也会被丢弃！${NC}"
        fi
        echo ""
        read -r -p "确认继续执行？[y/N]: " confirm
        case "$confirm" in
            y|Y|yes|YES)
                ;;
            *)
                log_info "已取消操作，未做任何修改。"
                exit 0
                ;;
        esac
    fi

    log_info "阶段二：开始逐仓清理本地修改并拉取最新代码..."

    local succeeded_repos=()
    local skipped_repos=()
    local failed_repos=()

    for ((i = 0; i < ${#repo_paths[@]}; i++)); do
        local repo="${repo_paths[$i]}"
        local name="${repo_names[$i]}"
        local branch="${repo_branches[$i]}"
        local upstream="${repo_upstreams[$i]}"
        local remote="${repo_remotes[$i]}"
        local fetch_ok="${repo_fetch_ok[$i]}"
        local in_prog="${repo_in_progress[$i]}"

        echo "------------------------------------------------------------------"
        log_info "正在处理: $name ($repo)"

        if [[ "$fetch_ok" -eq 0 ]]; then
            log_error "$name: 阶段一 fetch 失败，已跳过清理与拉取以保护本地改动。"
            failed_repos+=("$name (fetch 失败)")
            continue
        fi

        if [[ "$in_prog" == "merge" ]]; then
            log_warn "$name: 中止未完成的 merge..."
            git -C "$repo" merge --abort 2>/dev/null || true
        elif [[ "$in_prog" == "rebase" ]]; then
            log_warn "$name: 中止未完成的 rebase..."
            git -C "$repo" rebase --abort 2>/dev/null || true
        elif [[ "$in_prog" == "cherry-pick" ]]; then
            log_warn "$name: 中止未完成的 cherry-pick..."
            git -C "$repo" cherry-pick --abort 2>/dev/null || true
        fi

        if ! git -C "$repo" reset --hard HEAD; then
            log_error "$name: git reset --hard HEAD 失败。"
            failed_repos+=("$name (reset 失败)")
            continue
        fi

        if [[ "$no_clean" == false ]]; then
            if ! git -C "$repo" clean -fd; then
                log_error "$name: git clean -fd 失败。"
                failed_repos+=("$name (clean 失败)")
                continue
            fi
        fi

        if [[ -z "$remote" ]] || [[ "$branch" == "DETACHED" ]] || [[ -z "$upstream" ]]; then
            log_warn "$name: 已完成本地工作区清理；由于无可用远端追踪分支（branch=$branch），已跳过 pull。"
            skipped_repos+=("$name (HEAD=$(git -C "$repo" log -1 --oneline 2>/dev/null || echo unknown))")
            continue
        fi

        if [[ "$force_remote" == true ]]; then
            if git -C "$repo" reset --hard "$upstream"; then
                local head_summary
                head_summary="$(git -C "$repo" log -1 --oneline 2>/dev/null || echo unknown)"
                log_success "$name: 已强制对齐远端 $upstream ($head_summary)"
                succeeded_repos+=("$name -> $head_summary")
            else
                log_error "$name: 强制重置到 $upstream 失败。"
                failed_repos+=("$name (reset --hard $upstream 失败)")
            fi
        else
            local target_branch="${upstream#"$remote/"}"
            if git -C "$repo" pull --ff-only "$remote" "$target_branch"; then
                local head_summary
                head_summary="$(git -C "$repo" log -1 --oneline 2>/dev/null || echo unknown)"
                log_success "$name: 已更新到最新 ($head_summary)"
                succeeded_repos+=("$name -> $head_summary")
            else
                log_error "$name: git pull --ff-only $remote $target_branch 失败（可能存在与远端分叉的本地提交）；如需丢弃本地提交并强制对齐远端，请使用 -f / --force-remote 参数。"
                failed_repos+=("$name (pull --ff-only 失败)")
            fi
        fi
    done

    echo "=================================================================="
    echo -e "${BOLD}执行汇总报告${NC}"
    echo "------------------------------------------------------------------"
    echo -e "${GREEN}成功更新 (${#succeeded_repos[@]}):${NC}"
    if [[ ${#succeeded_repos[@]} -eq 0 ]]; then
        echo "  (无)"
    else
        for item in "${succeeded_repos[@]}"; do
            echo "  - $item"
        done
    fi

    echo -e "${YELLOW}仅清理本地并跳过拉取 (${#skipped_repos[@]}):${NC}"
    if [[ ${#skipped_repos[@]} -eq 0 ]]; then
        echo "  (无)"
    else
        for item in "${skipped_repos[@]}"; do
            echo "  - $item"
        done
    fi

    echo -e "${RED}失败 (${#failed_repos[@]}):${NC}"
    if [[ ${#failed_repos[@]} -eq 0 ]]; then
        echo "  (无)"
    else
        for item in "${failed_repos[@]}"; do
            echo "  - $item"
        done
    fi
    echo "=================================================================="

    if [[ ${#failed_repos[@]} -gt 0 ]]; then
        exit 1
    fi
    exit 0
}

main "$@"
