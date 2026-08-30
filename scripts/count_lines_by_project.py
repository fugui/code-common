#!/usr/bin/env python3
import os
import sys

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
    'storage', '.gemini', '.agents'
}

EXCLUDE_FILES = {
    'package-lock.json', 'go.sum', 'go.mod', 'yarn.lock', 'pnpm-lock.yaml'
}

def count_lines(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return sum(1 for _ in f)
    except Exception:
        return 0

def get_sub_projects(root_dir):
    projects = []
    try:
        for name in os.listdir(root_dir):
            path = os.path.join(root_dir, name)
            if os.path.isdir(path) and name not in EXCLUDE_DIRS and not name.startswith('.'):
                projects.append((name, path))
    except Exception as e:
        print(f"Error listing directory: {e}")
    return sorted(projects)

def main():
    # 默认自动探测工作区根目录（脚本所在的上两级目录）
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidate_root = os.path.abspath(os.path.join(script_dir, '../..'))
    root_dir = candidate_root if os.path.exists(os.path.join(candidate_root, 'code-bench')) else os.getcwd()
    if len(sys.argv) > 1:
        root_dir = sys.argv[1]

    projects = get_sub_projects(root_dir)
    if not projects:
        projects = [(os.path.basename(os.path.abspath(root_dir)), root_dir)]

    print(f"\n==================== 按子项目统计源码行数 ====================")

    for proj_name, proj_path in projects:
        stats = {}
        total_lines = 0
        total_files = 0

        for root, dirs, files in os.walk(proj_path):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith('.')]

            for file in files:
                if file.startswith('.') or file in EXCLUDE_FILES:
                    continue
                
                ext = os.path.splitext(file)[1].lower()
                if ext in LANG_MAP:
                    lang = LANG_MAP[ext]
                    file_path = os.path.join(root, file)
                    lines = count_lines(file_path)
                    
                    if lang not in stats:
                        stats[lang] = {'lines': 0, 'files': 0}
                    stats[lang]['lines'] += lines
                    stats[lang]['files'] += 1
                    total_lines += lines
                    total_files += 1

        if total_files == 0:
            continue

        print(f"\n项目: {proj_name}")
        print(f"  {'编程语言':<22} | {'文件数':<8} | {'代码行数':<12}")
        print("  " + "-" * 50)
        
        sorted_stats = sorted(stats.items(), key=lambda x: x[1]['lines'], reverse=True)
        for lang, data in sorted_stats:
            print(f"  {lang:<22} | {data['files']:<8} | {data['lines']:<12}")
            
        print("  " + "-" * 50)
        print(f"  {'小计 (Subtotal)':<22} | {total_files:<8} | {total_lines:<12}")
        print("=" * 60)

if __name__ == '__main__':
    main()
