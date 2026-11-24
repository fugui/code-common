#!/usr/bin/env node
/**
 * 全工作区弹层与层叠上下文静态门禁 (OverlayGuard)
 * 用法: node check-overlay-guard.mjs <srcDir1> [<srcDir2> ...]
 *
 * 检查规则：
 * 1. 禁止在业务 .tsx/.ts 中伪造复用公共弹层类名 (.code-drawer-mask / .code-drawer-panel / .code-modal-mask / .code-modal)
 * 2. 禁止在业务代码手写 position: fixed 全屏遮罩 (inset: 0 或同时包含 top: 0 与 bottom: 0)
 * 3. 禁止在业务代码硬编码 >= 1000 的裸 z-index / zIndex 数值（应使用 var(--z-index-*) Token）
 *
 * 支持在当行或上一行通过 `overlay-guard-ignore` 注释显式豁免特定基础设施文件（如全屏灯箱）。
 */

import fs from 'node:fs';
import path from 'node:path';

const targetDirs = process.argv.slice(2);
if (targetDirs.length === 0) {
  console.error('Usage: check-overlay-guard.mjs <dir1> [<dir2> ...]');
  process.exit(2);
}

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', '__tests__', 'coverage']);
const CHECK_EXTS = new Set(['.ts', '.tsx', '.css', '.scss']);

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (CHECK_EXTS.has(path.extname(entry.name))) {
      if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
      out.push(full);
    }
  }
  return out;
}

function hasIgnoreComment(lines, lineIdx) {
  const cur = lines[lineIdx] || '';
  const prev = lineIdx > 0 ? lines[lineIdx - 1] : '';
  return cur.includes('overlay-guard-ignore') || prev.includes('overlay-guard-ignore');
}

const violations = [];

for (const dir of targetDirs) {
  const absDir = path.resolve(dir);
  const files = walkFiles(absDir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    const ext = path.extname(file);
    const isScript = ext === '.ts' || ext === '.tsx';
    const isStyle = ext === '.css' || ext === '.scss';

    // 规则 1：禁止在业务 .ts/.tsx 中伪造复用公共弹层内部类名
    if (isScript) {
      const fakeClassRegex = /className\s*=\s*(?:["'`])[^"'`]*\b(?:code-drawer-mask|code-drawer-panel|code-modal-mask|code-modal)(?=["'`\s])/;
      lines.forEach((line, idx) => {
        if (hasIgnoreComment(lines, idx)) return;
        if (fakeClassRegex.test(line)) {
          violations.push({
            file,
            line: idx + 1,
            rule: 'NO_FAKE_COMMON_OVERLAY_CLASS',
            message: '禁止手写伪造公共弹层类名 (.code-drawer-*/.code-modal*)，请直接使用 @code/common 的 <Drawer> 或 <Modal>',
            snippet: line.trim(),
          });
        }
      });

      // 规则 2a：TS/TSX 内联 style 中的 position: 'fixed' + 全屏覆盖
      lines.forEach((line, idx) => {
        if (hasIgnoreComment(lines, idx)) return;
        if (/position\s*:\s*['"]fixed['"]/.test(line)) {
          const windowLines = lines.slice(Math.max(0, idx - 2), Math.min(lines.length, idx + 12));
          const block = windowLines.join('\n');
          const hasIgnoreInWindow = windowLines.some((l) => l.includes('overlay-guard-ignore'));
          if (hasIgnoreInWindow) return;
          const isFullscreenOverlay =
            /\binset\s*:\s*0\b/.test(block) ||
            (/\btop\s*:\s*0\b/.test(block) && /\bbottom\s*:\s*0\b/.test(block));
          if (isFullscreenOverlay) {
            violations.push({
              file,
              line: idx + 1,
              rule: 'NO_CUSTOM_FIXED_OVERLAY',
              message: '禁止手写 position: fixed 全屏弹层遮罩，请迁移至 @code/common 的 <Drawer> / <Modal> / useConfirm',
              snippet: line.trim(),
            });
          }
        }
      });
    }

    // 规则 2b：CSS/SCSS 规则块中的 position: fixed + 全屏覆盖
    if (isStyle) {
      const blockRegex = /([^{}]+)\{([^{}]*)\}/g;
      let match;
      while ((match = blockRegex.exec(content)) !== null) {
        const body = match[2];
        if (!/position\s*:\s*fixed\b/.test(body)) continue;
        const isFullscreenOverlay =
          /\binset\s*:\s*0\b/.test(body) ||
          (/\btop\s*:\s*0\b/.test(body) && /\bbottom\s*:\s*0\b/.test(body));
        if (!isFullscreenOverlay) continue;
        if (body.includes('overlay-guard-ignore') || match[1].includes('overlay-guard-ignore')) continue;

        const prefix = content.slice(0, match.index);
        const startLine = prefix.split(/\r?\n/).length;
        const posOffset = body.indexOf('position');
        const fixedLine = startLine + body.slice(0, posOffset).split(/\r?\n/).length - 1;
        if (hasIgnoreComment(lines, fixedLine - 1)) continue;

        violations.push({
          file,
          line: fixedLine,
          rule: 'NO_CUSTOM_FIXED_OVERLAY_CSS',
          message: `样式 ${match[1].trim()} 禁止手写 position: fixed 全屏遮罩，请改用 @code/common 的 <Drawer> / <Modal>`,
          snippet: lines[fixedLine - 1]?.trim() || 'position: fixed;',
        });
      }
    }

    // 规则 3：禁止硬编码 >= 1000 的裸 z-index / zIndex
    lines.forEach((line, idx) => {
      if (hasIgnoreComment(lines, idx)) return;
      const m = line.match(/\b(?:z-index|zIndex)\s*:\s*(\d+)\b/);
      if (m) {
        const val = Number(m[1]);
        if (val >= 1000) {
          violations.push({
            file,
            line: idx + 1,
            rule: 'NO_HARDCODED_HIGH_ZINDEX',
            message: `禁止硬编码高位 z-index (${val} >= 1000)，请使用 var(--z-index-*) Token 或公共弹层组件`,
            snippet: line.trim(),
          });
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`❌ [OverlayGuard Failed] 发现 ${violations.length} 处弹层/层叠规范违规：`);
  for (const v of violations) {
    console.error(`  - ${v.file}:${v.line} [${v.rule}] ${v.message}`);
    console.error(`    > ${v.snippet}`);
  }
  process.exit(1);
}

console.log(`✅ [OverlayGuard Passed] 已扫描 ${targetDirs.join(', ')}，零弹层/层叠违规。`);
