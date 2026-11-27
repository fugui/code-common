#!/usr/bin/env node
/**
 * 脚本名称: git-stats.js
 * 功能描述: 统计工作区下各 Git 仓库按日聚合的提交代码行数（添加/删除/变更/净增）
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_GIT_BUFFER = 16 * 1024 * 1024;

function showHelp() {
    const scriptName = path.basename(process.argv[1] || 'git-stats.js');
    console.log(`使用方式: ${scriptName} [选项]

功能说明:
  扫描工作区下的一级 Git 仓库（或指定目录），按日汇总代码提交行数统计。

选项:
  --days <N>       统计最近 N 天的提交（默认近 1 个月）
  --author <name>  按指定作者名称过滤（默认读取 git config user.name）
  --all            统计所有作者的提交（覆盖 --author）
  --dir <路径>     指定要扫描的工作区根目录（默认自动定位工作区根目录）
  -h, --help       显示此帮助信息`);
}

function resolveDefaultDir() {
    try {
        const scriptDir = path.dirname(fs.realpathSync(__filename));
        const candidateRoot = path.resolve(scriptDir, '../..');
        if (fs.existsSync(path.join(candidateRoot, 'code-bench'))) {
            return candidateRoot;
        }
    } catch (_) {
        // 回退当前工作目录
    }
    return process.cwd();
}

function parseArgs(argv) {
    const opts = {
        days: null,
        author: null,
        allAuthors: false,
        dir: null,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '-h' || arg === '--help') {
            showHelp();
            process.exit(0);
        } else if (arg === '--all') {
            opts.allAuthors = true;
        } else if (arg === '--days' || arg.startsWith('--days=')) {
            const val = arg.includes('=') ? arg.split('=')[1] : argv[++i];
            const days = Number.parseInt(val, 10);
            if (!Number.isFinite(days) || days <= 0) {
                console.error(`错误: --days 需要正整数，收到: ${val}`);
                process.exit(1);
            }
            opts.days = days;
        } else if (arg === '--author' || arg.startsWith('--author=')) {
            const val = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
            if (!val) {
                console.error('错误: --author 缺少作者名称');
                process.exit(1);
            }
            opts.author = val;
        } else if (arg === '--dir' || arg.startsWith('--dir=')) {
            const val = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
            if (!val) {
                console.error('错误: --dir 缺少目录路径');
                process.exit(1);
            }
            opts.dir = path.resolve(val);
        } else {
            console.error(`未知参数: ${arg}`);
            showHelp();
            process.exit(1);
        }
    }
    return opts;
}

function resolveAuthor(opts) {
    if (opts.allAuthors) return '';
    if (opts.author) return opts.author;
    try {
        return execFileSync('git', ['config', 'user.name'], { encoding: 'utf-8' }).trim();
    } catch (_) {
        console.warn('警告: 无法获取 git config user.name，将统计所有人的提交');
        return '';
    }
}

function resolveSinceDate(days) {
    const date = new Date();
    if (days !== null) {
        date.setDate(date.getDate() - days);
    } else {
        date.setMonth(date.getMonth() - 1);
    }
    return date.toISOString().split('T')[0];
}

function findGitRepos(targetDir) {
    const repos = [];
    if (fs.existsSync(path.join(targetDir, '.git'))) {
        repos.push(targetDir);
    }

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue;
        }
        const subDir = path.join(targetDir, entry.name);
        if (fs.existsSync(path.join(subDir, '.git'))) {
            repos.push(subDir);
        }
    }
    return repos.sort();
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    const targetDir = opts.dir || resolveDefaultDir();

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        console.error(`错误: 目标目录不存在: ${targetDir}`);
        process.exit(1);
    }

    const author = resolveAuthor(opts);
    const sinceDate = resolveSinceDate(opts.days);

    console.log(`统计目录: ${targetDir}`);
    console.log(`统计作者: ${author || '所有作者'}`);
    console.log(`统计起始日期: ${sinceDate}\n`);

    console.log('正在查找 git 仓库...');
    let gitRepos = [];
    try {
        gitRepos = findGitRepos(targetDir);
    } catch (e) {
        console.error('查找 git 仓库失败:', e.message);
        process.exit(1);
    }

    console.log(`找到 ${gitRepos.length} 个 git 仓库。\n`);

    const dailyStats = {};

    gitRepos.forEach((repo) => {
        try {
            const gitArgs = ['-C', repo, 'log'];
            if (author) {
                gitArgs.push(`--author=${author}`);
            }
            gitArgs.push(`--since=${sinceDate}`, '--numstat', '--format=%ad', '--date=short', '--no-merges');

            const logOutput = execFileSync('git', gitArgs, {
                encoding: 'utf-8',
                maxBuffer: MAX_GIT_BUFFER,
            });
            const lines = logOutput.split('\n');
            let currentDate = '';

            for (let i = 0; i < lines.length; i += 1) {
                const line = lines[i].trim();
                if (!line) continue;

                if (/^\d{4}-\d{2}-\d{2}$/.test(line)) {
                    currentDate = line;
                    if (!dailyStats[currentDate]) {
                        dailyStats[currentDate] = { 添加行数: 0, 删除行数: 0 };
                    }
                } else {
                    const parts = line.split('\t');
                    if (parts.length >= 2 && currentDate) {
                        const added = parseInt(parts[0], 10);
                        const deleted = parseInt(parts[1], 10);

                        if (!Number.isNaN(added)) dailyStats[currentDate].添加行数 += added;
                        if (!Number.isNaN(deleted)) dailyStats[currentDate].删除行数 += deleted;
                    }
                }
            }
        } catch (e) {
            console.error(`在处理仓库 ${repo} 时出错: ${e.message}`);
        }
    });

    const dates = Object.keys(dailyStats).sort();
    if (dates.length === 0) {
        console.log('指定时间范围内没有代码提交记录。');
        process.exit(0);
    }

    let totalAdded = 0;
    let totalDeleted = 0;
    let totalChanged = 0;
    let totalNet = 0;

    const tableData = dates.map((date) => {
        const added = dailyStats[date].添加行数;
        const deleted = dailyStats[date].删除行数;
        const changed = added + deleted;
        const net = added - deleted;

        totalAdded += added;
        totalDeleted += deleted;
        totalChanged += changed;
        totalNet += net;

        return {
            日期: date,
            添加行数: added,
            删除行数: deleted,
            变更总数: changed,
            净增行数: net,
        };
    });

    tableData.push({
        日期: '======',
        添加行数: '======',
        删除行数: '======',
        变更总数: '======',
        净增行数: '======',
    });

    tableData.push({
        日期: opts.days !== null ? `${opts.days}天总计` : '30天总计',
        添加行数: totalAdded,
        删除行数: totalDeleted,
        变更总数: totalChanged,
        净增行数: totalNet,
    });

    const titlePeriod = opts.days !== null ? `最近 ${opts.days} 天` : '过去一个月';
    console.log(`====== ${titlePeriod}代码提交统计 ======`);
    console.table(tableData);
}

main();
