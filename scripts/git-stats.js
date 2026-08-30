const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 获取当前用户的 git 邮箱或用户名
let author = '';
try {
    author = execSync('git config user.name', { encoding: 'utf-8' }).trim();
} catch (e) {
    console.warn('警告: 无法获取 git config user.name，将统计所有人的提交');
}

// 目标目录为当前目录
const targetDir = process.cwd();

// 获取一个月前的日期
const date = new Date();
date.setMonth(date.getMonth() - 1);
const sinceDate = date.toISOString().split('T')[0];

console.log(`统计目录: ${targetDir}`);
console.log(`统计作者: ${author || '所有作者'}`);
console.log(`统计起始日期: ${sinceDate}\n`);

// 查找所有的 git 仓库
console.log('正在查找 git 仓库...');
let gitRepos = [];
try {
    const findCmd = `find "${targetDir}" -name ".git" -type d -not -path "*/node_modules/*"`;
    const findResult = execSync(findCmd, { encoding: 'utf-8' });
    gitRepos = findResult.split('\n').filter(line => line.trim() !== '').map(p => path.dirname(p));
} catch (e) {
    console.error('查找 git 仓库失败:', e.message);
    process.exit(1);
}

console.log(`找到 ${gitRepos.length} 个 git 仓库。\n`);

const dailyStats = {};

gitRepos.forEach(repo => {
    try {
        const authorFilter = author ? `--author="${author}"` : '';
        const gitCmd = `git -C "${repo}" log ${authorFilter} --since="${sinceDate}" --numstat --format="%ad" --date=short --no-merges`;
        
        const logOutput = execSync(gitCmd, { encoding: 'utf-8' });
        const lines = logOutput.split('\n');
        let currentDate = '';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            if (line.match(/^\d{4}-\d{2}-\d{2}$/)) {
                currentDate = line;
                if (!dailyStats[currentDate]) {
                    dailyStats[currentDate] = { 添加行数: 0, 删除行数: 0 };
                }
            } else {
                const parts = line.split('\t');
                if (parts.length >= 2 && currentDate) {
                    const added = parseInt(parts[0], 10);
                    const deleted = parseInt(parts[1], 10);
                    
                    if (!isNaN(added)) dailyStats[currentDate].添加行数 += added;
                    if (!isNaN(deleted)) dailyStats[currentDate].删除行数 += deleted;
                }
            }
        }
    } catch (e) {
        console.error(`在处理仓库 ${repo} 时出错: ${e.message}`);
    }
});

const dates = Object.keys(dailyStats).sort();
if (dates.length === 0) {
    console.log('过去一个月没有代码提交记录。');
    process.exit(0);
}

let totalAdded = 0;
let totalDeleted = 0;
let totalChanged = 0;
let totalNet = 0;

const tableData = dates.map(date => {
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
        净增行数: net
    };
});

tableData.push({
    日期: '======',
    添加行数: '======',
    删除行数: '======',
    变更总数: '======',
    净增行数: '======'
});

tableData.push({
    日期: '30天总计',
    添加行数: totalAdded,
    删除行数: totalDeleted,
    变更总数: totalChanged,
    净增行数: totalNet
});

console.log('====== 过去一个月代码提交统计 ======');
console.table(tableData);
