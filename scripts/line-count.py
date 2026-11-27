#!/usr/bin/env python3
"""
工作区源码行数统计脚本 (line-count.py)

默认自动定位工作区根目录，无参数运行即可依次输出：
1. 分项目按语言统计（含各项目小计）
2. 按项目全量代码量汇总（含全平台总计）
"""

import argparse
import os
import sys
import unicodedata

# 后缀与语言的对应关系
LANG_MAP = {
    '.go': 'Go',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript (React)',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript (React)',
    '.py': 'Python',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.html': 'HTML',
    '.vue': 'Vue',
    '.sh': 'Shell',
    '.sql': 'SQL',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.json': 'JSON',
    '.md': 'Markdown',
    '.rs': 'Rust',
    '.c': 'C',
    '.cpp': 'C++',
    '.h': 'C/C++ Header',
}

# 排除的目录或文件名
EXCLUDE_DIRS = {
    '.git', 'node_modules', 'dist', 'build', '.vscode', '.idea',
    'storage', '.gemini', '.agents',
}

EXCLUDE_FILES = {
    'package-lock.json', 'go.sum', 'go.mod', 'yarn.lock', 'pnpm-lock.yaml',
}


def display_width(text: str) -> int:
    """计算字符串在等宽终端中的显示宽度（中文等宽字符按 2 列计算）。"""
    width = 0
    for ch in text:
        width += 2 if unicodedata.east_asian_width(ch) in ('W', 'F') else 1
    return width


def pad_right(text: str, width: int) -> str:
    """按终端显示宽度右补空格，确保中英文混排对齐。"""
    return text + ' ' * max(0, width - display_width(text))


def pad_left(text: str, width: int) -> str:
    """按终端显示宽度左补空格，用于数字列右对齐。"""
    return ' ' * max(0, width - display_width(text)) + text


def count_lines(file_path: str) -> int:
    """统计单个文件的总行数。"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return sum(1 for _ in f)
    except OSError:
        return 0


def resolve_root_dir() -> str:
    """解析默认工作区根目录（兼容通过根目录软链接调用）。"""
    script_dir = os.path.dirname(os.path.realpath(__file__))
    candidate_root = os.path.abspath(os.path.join(script_dir, '../..'))
    if os.path.exists(os.path.join(candidate_root, 'code-bench')):
        return candidate_root
    return os.getcwd()


def get_sub_projects(root_dir: str) -> list[tuple[str, str]]:
    """收集目标目录下一级子项目目录；若无子目录则统计目标目录本身。"""
    projects: list[tuple[str, str]] = []
    try:
        for name in os.listdir(root_dir):
            path = os.path.join(root_dir, name)
            if os.path.isdir(path) and name not in EXCLUDE_DIRS and not name.startswith('.'):
                projects.append((name, path))
    except OSError as exc:
        print(f"Error listing directory: {exc}", file=sys.stderr)
        sys.exit(1)

    if not projects:
        abs_root = os.path.abspath(root_dir)
        return [(os.path.basename(abs_root) or abs_root, abs_root)]
    return sorted(projects, key=lambda item: item[0])


def collect_project_stats(proj_path: str) -> tuple[dict[str, dict[str, int]], int, int]:
    """统计单个项目内按语言分类的文件数与代码行数。"""
    stats: dict[str, dict[str, int]] = {}
    total_lines = 0
    total_files = 0

    for root, dirs, files in os.walk(proj_path):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith('.')]

        for file in files:
            if file.startswith('.') or file in EXCLUDE_FILES:
                continue

            ext = os.path.splitext(file)[1].lower()
            lang = LANG_MAP.get(ext)
            if not lang:
                continue

            lines = count_lines(os.path.join(root, file))
            if lang not in stats:
                stats[lang] = {'lines': 0, 'files': 0}
            stats[lang]['lines'] += lines
            stats[lang]['files'] += 1
            total_lines += lines
            total_files += 1

    return stats, total_files, total_lines


def print_table(headers: tuple[str, str, str], rows: list[tuple[str, int, int]],
                summary: tuple[str, int, int], indent: str = '') -> None:
    """统一格式化输出三列表格（名称、文件数、代码行数）及底部分隔汇总行。"""
    col1_w = max(
        display_width(headers[0]),
        display_width(summary[0]),
        *(display_width(r[0]) for r in rows),
        22,
    )
    col2_w = max(display_width(headers[1]), len(str(summary[1])), 8)
    col3_w = max(display_width(headers[2]), len(f"{summary[2]:,}"), 12)
    sep_len = col1_w + col2_w + col3_w + 6

    print(
        f"{indent}{pad_right(headers[0], col1_w)} | "
        f"{pad_left(headers[1], col2_w)} | {pad_left(headers[2], col3_w)}"
    )
    print(f"{indent}{'-' * sep_len}")

    for name, files_cnt, lines_cnt in rows:
        print(
            f"{indent}{pad_right(name, col1_w)} | "
            f"{pad_left(str(files_cnt), col2_w)} | {pad_left(f'{lines_cnt:,}', col3_w)}"
        )

    print(f"{indent}{'-' * sep_len}")
    print(
        f"{indent}{pad_right(summary[0], col1_w)} | "
        f"{pad_left(str(summary[1]), col2_w)} | {pad_left(f'{summary[2]:,}', col3_w)}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog=os.path.basename(sys.argv[0]),
        description='统计工作区源码行数（先输出分项目按语言明细，再输出按项目全量代码量汇总）。',
    )
    parser.add_argument(
        'target_dir',
        nargs='?',
        default=None,
        help='可选目标目录（默认自动定位工作区根目录）',
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root_dir = os.path.abspath(args.target_dir) if args.target_dir else resolve_root_dir()

    if not os.path.isdir(root_dir):
        print(f"错误: 目录不存在: {root_dir}", file=sys.stderr)
        sys.exit(1)

    projects = get_sub_projects(root_dir)
    project_summaries: list[tuple[str, int, int]] = []
    grand_files = 0
    grand_lines = 0

    print(f"\n==================== 1. 分项目按语言统计 (目录: {root_dir}) ====================")

    for proj_name, proj_path in projects:
        stats, total_files, total_lines = collect_project_stats(proj_path)
        if total_files == 0:
            continue

        project_summaries.append((proj_name, total_files, total_lines))
        grand_files += total_files
        grand_lines += total_lines

        sorted_rows = [
            (lang, data['files'], data['lines'])
            for lang, data in sorted(stats.items(), key=lambda x: x[1]['lines'], reverse=True)
        ]

        print(f"\n项目: {proj_name}")
        print_table(
            headers=('编程语言', '文件数', '代码行数'),
            rows=sorted_rows,
            summary=('小计 (Subtotal)', total_files, total_lines),
            indent='  ',
        )

    print(f"\n==================== 2. 按项目全量代码量汇总 (目录: {root_dir}) ====================\n")

    if not project_summaries:
        print("未统计到任何匹配的源码文件。\n")
        return

    sorted_projects = sorted(project_summaries, key=lambda item: item[2], reverse=True)
    print_table(
        headers=('项目名称', '文件数', '代码行数'),
        rows=sorted_projects,
        summary=('总计 (Total)', grand_files, grand_lines),
    )
    print()


if __name__ == '__main__':
    main()
