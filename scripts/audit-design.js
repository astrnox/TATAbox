#!/usr/bin/env node
'use strict';
/**
 * ============================================================
 * scripts/audit-design.js — 设计规范审计（P0 设计整改门禁）
 * ============================================================
 * 背景：
 *   项目曾出现大量"AI 味"设计（玻璃拟态 / 渐变 / emoji 当图标 / 内联样式
 *   就地发明色值）。本脚本把这些约定固化为 CI 门禁，防止回潮：
 *     - 硬门禁（FAIL）：彩色 emoji、backdrop-filter 模糊、渐变数量超预算；
 *     - 棘轮门禁（FAIL）：内联样式数、硬编码色值数不得超过基线（只许下降）；
 *     - 软报告：各项计数明细，便于逐步收敛。
 *
 * 预算与依据：
 *   emoji        0    （图标统一走 js/core/utils.js 的 BQ_ICONS）
 *   backdrop-filter ≤ 3（保留场景：模态遮罩；当前仅登录遮罩 1 处）
 *   渐变          ≤ 4（白名单：首页 hero 可读性遮罩 ×2、加载动画 ×2）
 *
 * 用法：
 *   node scripts/audit-design.js            # 审计（CI 使用）
 *   node scripts/audit-design.js --update   # 下调棘轮基线（只在确实减少后使用）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* ── 棘轮基线：只允许下调；确需上调必须在 PR 里说明理由并在此处修改 ── */
const BASELINE_INLINE_STYLE = 1261; // js/**（不含 vendor）中 style=" 出现次数
const BASELINE_INLINE_STYLE_SETATTR = 0; // js/** 中 setAttribute('style') 出现次数（豁免需行内/上一行登记 audit-design-allow）
const BASELINE_UNIQUE_HEX = 469;    // js/**（不含 vendor）中唯一 #rrggbb 数量

/* ── 预算 ── */
const BUDGET_BACKDROP_FILTER = 3;
const BUDGET_GRADIENT = 4;

/* 彩色 emoji / 彩色符号（不含 ✓✗✕★ 等排版符号——那些允许使用） */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2705}\u{274C}\u{26A0}\u{2139}\u{2B50}\u{2B55}\u{26AA}\u{26AB}\u{2B07}\u{2B06}\u{2B05}\u{27A1}\u{23F0}\u{2728}\u{2714}\u{2753}\u{2757}]/u;

function walkJs(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'vendor' || name === 'node_modules') continue;
      walkJs(p, out);
    } else if (name.endsWith('.js')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * bundle-core.css 是 scripts/build-css-bundle.js 生成的聚合产物，
 * 内容为下列源文件的顺序拼接。它是 index.html 实际加载的全站主样式表，
 * 若把它排除在审计之外，等于门禁对主样式表完全失明（有人往里加毛玻璃/渐变也不报）。
 *
 * 处理方式：审计**源文件**（globals/layout/header/learning-hub/home/debug-fix，
 * 它们已被 bundle 覆盖），并**额外校验 bundle 与源文件一致**——
 * 即 bundle 不得含有源文件里不存在的 backdrop-filter/渐变，
 * 防止绕过「改 bundle 不改源文件」这条路径。
 */
const BUNDLE_SOURCES = [
  'globals.css',
  'layout.css',
  'header.css',
  'learning-hub.css',
  'home.css',
  'debug-fix.css',
];

function collectFiles() {
  const js = walkJs(path.join(ROOT, 'js'), []);
  const allCss = fs.readdirSync(path.join(ROOT, 'css'))
    .filter((f) => f.endsWith('.css'));
  // css/ 下除 bundle-core.css 外的都是独立样式表（子页直接 <link>）；
  // bundle 自身的 6 个源文件也在其中，天然被覆盖，无需重复处理。
  const css = allCss
    .filter((f) => f !== 'bundle-core.css')
    .map((f) => path.join(ROOT, 'css', f));
  const html = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .map((f) => path.join(ROOT, f));
  return { js, css, html, bundle: path.join(ROOT, 'css', 'bundle-core.css') };
}

/**
 * 剥离注释后再检测，避免"注释里提到属性名/含emoji"被误判为真实使用。
 * 原实现按行首判断（isCommentLine），无法处理行尾注释与多行注释，
 * 会同时造成漏报（innerHTML 拼接串里的 emoji）与误报。
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // 块注释
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // 行注释（避开 http://）
}

/** 逐行扫描：先剥离注释，再匹配 */
function scanLines(files, pattern, onHit) {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const lines = stripComments(fs.readFileSync(f, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      const m = line.match(re);
      if (m) onHit(`${rel(f)}:${i + 1}  ${line.trim().slice(0, 70)}`, m);
    });
  }
}

const rel = (p) => path.relative(ROOT, p);

function main() {
  const { js, css, html, bundle } = collectFiles();
  const failures = [];
  const report = [];

  /* ── 1. 彩色 emoji ── */
  const emojiHits = [];
  scanLines(js.concat(html, css), EMOJI_RE, (loc, m) => {
    emojiHits.push(`${loc}  ${[...new Set(m)].join(' ')}`);
  });
  report.push(`彩色 emoji                    : ${emojiHits.length} 处（预算 0）`);
  if (emojiHits.length > 0) {
    failures.push(`发现 ${emojiHits.length} 处彩色 emoji（图标请改用 BQ_ICONS）：\n    ` + emojiHits.slice(0, 12).join('\n    '));
  }

  /* ── 1b. bundle-core.css 与源文件一致性 ──
     bundle 是index.html 加载的主样式表。逐条比对"源文件合计"与"bundle"的
     backdrop-filter / 渐变数量：bundle 多出来的，说明有人绕过源文件直接改产物。 */
  if (fs.existsSync(bundle)) {
    const bundleSrc = stripComments(fs.readFileSync(bundle, 'utf8'));
    const srcFiles = BUNDLE_SOURCES.map((f) => path.join(ROOT, 'css', f));
    const srcSrc = srcFiles
      .filter((f) => fs.existsSync(f))
      .map((f) => stripComments(fs.readFileSync(f, 'utf8')))
      .join('\n');
    const count = (s, re) => (s.match(re) || []).length;
    const bfRe = /(?<!webkit-)backdrop-filter\s*:/g;
    const gradRe = /(linear|radial)-gradient\(/g;
    const bfDelta = count(bundleSrc, bfRe) - count(srcSrc, bfRe);
    const gradDelta = count(bundleSrc, gradRe) - count(srcSrc, gradRe);
    report.push(`bundle-core 与源文件一致性      : backdrop-filter 差 ${bfDelta} / 渐变差 ${gradDelta}（须均为 0）`);
    if (bfDelta !== 0 || gradDelta !== 0) {
      failures.push(
        `css/bundle-core.css 与源文件不一致（backdrop-filter 差 ${bfDelta}、渐变差 ${gradDelta}）。\n` +
        `    bundle-core.css 由 scripts/build-css-bundle.js 从 ${BUNDLE_SOURCES.join('/')} 生成，\n` +
        `    请修改源文件后执行 node scripts/build-css-bundle.js 重新生成，不要直接改产物。`
      );
    }
  }

  /* ── 2. backdrop-filter 模糊 ── */
  const bfHits = [];
  scanLines(js.concat(html, css), /(?<!webkit-)backdrop-filter\s*:/, (loc) => bfHits.push(loc));
  report.push(`backdrop-filter（去-webkit）  : ${bfHits.length} 处（预算 ${BUDGET_BACKDROP_FILTER}）`);
  if (bfHits.length > BUDGET_BACKDROP_FILTER) {
    failures.push(`backdrop-filter 超出预算（${bfHits.length} > ${BUDGET_BACKDROP_FILTER}）：\n    ` + bfHits.join('\n    '));
  }

  /* ── 3. 渐变 ── */
  const gradHits = [];
  scanLines(css.concat(js, html), /(linear|radial)-gradient\(/, (loc) => gradHits.push(loc));
  report.push(`渐变（linear/radial）         : ${gradHits.length} 处（预算 ${BUDGET_GRADIENT}）`);
  if (gradHits.length > BUDGET_GRADIENT) {
    failures.push(`渐变超出预算（${gradHits.length} > ${BUDGET_GRADIENT}）：\n    ` + gradHits.join('\n    '));
  }

  /* ── 4. 棘轮：内联样式 / 硬编码色值 ── */
  let inlineStyle = 0;
  let inlineSetAttr = 0;
  const inlineSetAttrHits = [];
  const hexSet = new Set();
  for (const f of js) {
    const raw = fs.readFileSync(f, 'utf8');
    inlineStyle += (raw.match(/style="/g) || []).length;
    (raw.match(/#[0-9a-fA-F]{6}\b/g) || []).forEach((h) => hexSet.add(h.toLowerCase()));
    // setAttribute('style') 同样绕过 style=" 计数：逐行识别，
    // 确需使用的场景（如离屏打印 iframe）用 audit-design-allow 登记豁免。
    const lines = raw.split('\n');
    lines.forEach((line, i) => {
      if (!/setAttribute\(\s*['"]style['"]\s*,/.test(line)) return;
      if (/audit-design-allow/.test(line) || /audit-design-allow/.test(lines[i - 1] || '')) return;
      inlineSetAttr++;
      inlineSetAttrHits.push(`${rel(f)}:${i + 1}`);
    });
  }
  report.push(`js 内联 style="               : ${inlineStyle} 处（基线 ${BASELINE_INLINE_STYLE}，只许下降）`);
  report.push(`js setAttribute('style')      : ${inlineSetAttr} 处（基线 ${BASELINE_INLINE_STYLE_SETATTR}，只许下降）`);
  report.push(`js 硬编码 #rrggbb 唯一色值    : ${hexSet.size} 个（基线 ${BASELINE_UNIQUE_HEX}，只许下降）`);
  if (inlineStyle > BASELINE_INLINE_STYLE) {
    failures.push(`内联样式数超过基线（${inlineStyle} > ${BASELINE_INLINE_STYLE}）：新代码请使用全局组件类（.bq-btn/.bq-card/.bq-section-header…）`);
  }
  if (inlineSetAttr > BASELINE_INLINE_STYLE_SETATTR) {
    failures.push(`setAttribute('style') 超过基线（${inlineSetAttr} > ${BASELINE_INLINE_STYLE_SETATTR}）：\n    ` +
      inlineSetAttrHits.join('\n    ') +
      `\n    请改用 class/CSS 变量；确需运行期样式时，在行内或上一行写 audit-design-allow 并说明原因。`);
  }
  if (hexSet.size > BASELINE_UNIQUE_HEX) {
    failures.push(`硬编码色值数超过基线（${hexSet.size} > ${BASELINE_UNIQUE_HEX}）：新代码请引用全局 token（--color-* / --state-*）`);
  }

  /* ── 输出 ── */
  console.log('TATABOX 设计规范审计');
  console.log('──────────────────────────────────────────────');
  report.forEach((l) => console.log('  ' + l));
  console.log('──────────────────────────────────────────────');

  if (process.argv.includes('--update')) {
    if (failures.length > 0) {
      console.error('存在未达标项，禁止更新基线。请先修到达标后再 --update。');
      process.exit(1);
    }
    const self = path.join(__dirname, 'audit-design.js');
    let src = fs.readFileSync(self, 'utf8');
    src = src.replace(/const BASELINE_INLINE_STYLE = \d+;/, `const BASELINE_INLINE_STYLE = ${inlineStyle};`);
    src = src.replace(/const BASELINE_INLINE_STYLE_SETATTR = \d+;/, `const BASELINE_INLINE_STYLE_SETATTR = ${inlineSetAttr};`);
    src = src.replace(/const BASELINE_UNIQUE_HEX = \d+;/, `const BASELINE_UNIQUE_HEX = ${hexSet.size};`);
    fs.writeFileSync(self, src);
    console.log(`棘轮基线已下调：inline=${inlineStyle} setAttr=${inlineSetAttr} hex=${hexSet.size}`);
    process.exit(0);
  }

  if (failures.length > 0) {
    console.error('设计规范审计未通过：\n');
    failures.forEach((f) => console.error('  ✗ ' + f + '\n'));
    process.exit(1);
  }
  console.log('设计规范审计通过');
}

main();