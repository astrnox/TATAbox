/**
 * HTML sink 棘轮门禁（M-05）
 * ------------------------------------------------------------
 * 统计 js/（排除 vendor）中 `.innerHTML =` 的数量，作为 XSS 面的棘轮基线：
 *   - 高于基线 → 失败（禁止新增裸写 HTML 的赋值）；
 *   - 低于基线 → 通过（允许渐进迁移到 safeHtml / setSafeHtml）。
 * 合法新增静态模板应优先使用 DOMParser / createElement，确需新增时手动下调基线。
 *
 * 用法：node scripts/audit-html-sinks.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');
const BASELINE = 478; // M-05 迁移起点（2026-11-01，只许下降）

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'vendor') continue;
      walk(abs, out);
    } else if (e.name.endsWith('.js')) {
      out.push(abs);
    }
  }
  return out;
}

let count = 0;
const byFile = {};
for (const file of walk(JS_DIR, [])) {
  const text = fs.readFileSync(file, 'utf8');
  const matches = text.match(/\.innerHTML\s*=/g);
  if (!matches) continue;
  const n = matches.length;
  count += n;
  byFile[path.relative(ROOT, file).replace(/\\/g, '/')] = n;
}

if (count > BASELINE) {
  console.error(`[audit-html-sinks] 失败：innerHTML 赋值 ${count} 处，超过基线 ${BASELINE}。`);
  console.error('  禁止新增裸写 HTML；请改用 setSafeHtml / DOMParser / createElement。');
  Object.keys(byFile).sort((a, b) => byFile[b] - byFile[a]).slice(0, 10).forEach((f) => {
    console.error(`  ${byFile[f]}  ${f}`);
  });
  process.exit(1);
}

const delta = BASELINE - count;
console.log(`[audit-html-sinks] 通过：innerHTML 赋值 ${count} 处（基线 ${BASELINE}，可下降 ${delta}）`);
