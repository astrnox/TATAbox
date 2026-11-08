#!/usr/bin/env node
'use strict';
/**
 * verify-prod-build.js —— 校验 dist/ 生产产物可部署且未回退（H-04）
 *
 * 校验项：
 *  1. 必需文件存在（index.html / sw.js / 压缩后的 app.js / vendor / 数据 manifest）
 *  2. index.html 引用的本地资源全部存在（避免构建漏拷）
 *  3. 开发目录不进入产物（tests / scripts / archive / docs / node_modules）
 *  4. 预算：总包体、JS gzip、index 脚本标签数（棘轮，只许下降）
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BUDGET = {
  totalMB: 320,
  firstScreenJsGzipKB: 400, // H-04 目标：首屏关键 JS ≤ 400 KB（gzip）
  indexScriptTags: 90
};

const errors = [];

function mustExist(rel) {
  if (!fs.existsSync(path.join(DIST, rel))) errors.push('缺少产物: ' + rel);
}

function listFiles(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(p, out);
    else out.push(p);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error('[verify-prod] dist/ 不存在，请先运行 npm run build:prod');
  process.exit(1);
}

['index.html', 'sw.js', 'manifest.json', '_headers', '404.html',
  'js/core/app.js', 'js/vendor/purify.min.js', 'css/bundle-core.css',
  'data/manifest.json', 'build-report.json'].forEach(mustExist);

for (const dir of ['tests', 'scripts', 'archive', 'docs', 'node_modules']) {
  if (fs.existsSync(path.join(DIST, dir))) errors.push('开发目录不应进入产物: ' + dir + '/');
}

// 校验 index.html 本地引用是否齐全
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const refs = [];
const re = /(?:src|href)="([^"]+)"/g;
let m;
while ((m = re.exec(html)) !== null) {
  const raw = m[1];
  if (/^(?:https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i.test(raw)) continue;
  const clean = raw.split('#')[0].split('?')[0];
  if (!clean || clean.endsWith('/')) continue;
  refs.push(clean);
}
for (const rel of refs) {
  const abs = path.join(DIST, rel);
  if (!fs.existsSync(abs)) errors.push('index.html 引用缺失: ' + rel);
}

const files = listFiles(DIST, []);
const totalBytes = files.reduce((s, p) => s + fs.statSync(p).size, 0);
const jsFiles = files.filter((p) => p.endsWith('.js'));
const jsGzip = jsFiles.reduce((s, p) => s + zlib.gzipSync(fs.readFileSync(p)).length, 0);
const scriptTags = (html.match(/<script[^>]+src=/g) || []).length;

// 首屏关键 JS：只统计 index.html 直接引用的本地脚本
let firstScreenRaw = 0;
let firstScreenGzip = 0;
const scriptRefs = (html.match(/<script[^>]+src="([^"]+)"/g) || [])
  .map((tag) => tag.match(/src="([^"]+)"/)[1])
  .filter((src) => !/^https?:/i.test(src));
for (const src of scriptRefs) {
  const abs = path.join(DIST, src.split('?')[0]);
  if (!fs.existsSync(abs)) continue;
  const buf = fs.readFileSync(abs);
  firstScreenRaw += buf.length;
  firstScreenGzip += zlib.gzipSync(buf).length;
}

if (totalBytes > BUDGET.totalMB * 1048576) {
  errors.push('总包体 ' + (totalBytes / 1048576).toFixed(1) + ' MB 超预算 ' + BUDGET.totalMB + ' MB');
}
if (firstScreenGzip > BUDGET.firstScreenJsGzipKB * 1024) {
  errors.push('首屏关键 JS gzip ' + Math.round(firstScreenGzip / 1024) + ' KB 超预算 ' + BUDGET.firstScreenJsGzipKB + ' KB');
}
if (scriptTags > BUDGET.indexScriptTags) {
  errors.push('index.html 脚本标签 ' + scriptTags + ' 个，超预算 ' + BUDGET.indexScriptTags);
}

console.log('[verify-prod] 文件 ' + files.length + ' 个，合计 ' + (totalBytes / 1048576).toFixed(1) + ' MB');
console.log('  首屏关键 JS：' + Math.round(firstScreenGzip / 1024) + ' KB gzip / ' +
  Math.round(firstScreenRaw / 1024) + ' KB raw（预算 ' + BUDGET.firstScreenJsGzipKB + ' KB gzip）');
console.log('  全部 JS：' + Math.round(jsGzip / 1024) + ' KB gzip（' + jsFiles.length + ' 个文件，含按需懒加载）');
console.log('  index.html 脚本标签：' + scriptTags + '（预算 ' + BUDGET.indexScriptTags + '）');

if (errors.length) {
  console.error('[verify-prod] 失败：');
  errors.forEach((e) => console.error('  - ' + e));
  process.exit(1);
}
console.log('[verify-prod] 通过');
