/**
 * HTML sink 棘轮门禁（M-05）
 * ------------------------------------------------------------
 * 统计 js/（排除 vendor）中所有可直接注入 HTML 的 API：
 *   - `.innerHTML =` / `.outerHTML =`
 *   - `insertAdjacentHTML(...)`
 *   - `document.write(...)` / `document.writeln(...)`
 * 作为 XSS 面的棘轮基线：
 *   - 高于基线 → 失败（禁止新增裸写 HTML）；
 *   - 低于基线 → 通过（允许渐进迁移到 safeHtml / setSafeHtml）。
 * 合法新增静态模板应优先使用 DOMParser / createElement；确需新增时手动下调基线。
 *
 * 基线说明：489 是 2026-11-13 扩展 sink 口径后的实测值（旧口径只统计
 * `.innerHTML =`，基线 478）。此后只许下降；注释里的示例不计入。
 *
 * 用法：node scripts/audit-html-sinks.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');
const BASELINE = 489; // 2026-11-13 扩展 sink 口径后重设（只许下降）

const SINK_RES = [
  { name: 'innerHTML', re: /\.innerHTML\s*=/g },
  { name: 'outerHTML', re: /\.outerHTML\s*=/g },
  { name: 'insertAdjacentHTML', re: /insertAdjacentHTML\s*\(/g },
  { name: 'document.write', re: /document\.write(?:ln)?\s*\(/g },
];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

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
const byApi = {};
const byFile = {};
SINK_RES.forEach((s) => { byApi[s.name] = 0; });

for (const file of walk(JS_DIR, [])) {
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  let fileCount = 0;
  for (const sink of SINK_RES) {
    const n = (text.match(sink.re) || []).length;
    if (!n) continue;
    byApi[sink.name] += n;
    fileCount += n;
  }
  if (!fileCount) continue;
  count += fileCount;
  byFile[path.relative(ROOT, file).replace(/\\/g, '/')] = fileCount;
}

const breakdown = SINK_RES
  .map((s) => `${s.name} ${byApi[s.name]}`)
  .join(' / ');

if (count > BASELINE) {
  console.error(`[audit-html-sinks] 失败：HTML 注入 ${count} 处，超过基线 ${BASELINE}（${breakdown}）。`);
  console.error('  禁止新增裸写 HTML；请改用 setSafeHtml / DOMParser / createElement。');
  Object.keys(byFile).sort((a, b) => byFile[b] - byFile[a]).slice(0, 10).forEach((f) => {
    console.error(`  ${byFile[f]}  ${f}`);
  });
  process.exit(1);
}

const delta = BASELINE - count;
console.log(`[audit-html-sinks] 通过：HTML 注入 ${count} 处（基线 ${BASELINE}，可下降 ${delta}；${breakdown}）`);
