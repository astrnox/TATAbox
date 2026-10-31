#!/usr/bin/env node
/**
 * 仓库体积预算守卫（H-05）。
 *
 * 背景：视频/题目配图/字体/历史归档把仓库快照推到 ~267MB、Git 对象 ~1.15GB，
 * clone/CI/部署成本持续上升；jsDelivr 对 >50MB 包还会直接拒绝。
 * 本脚本在 CI 中对「已跟踪文件快照」设上限，阻止继续无约束增长。
 *
 * 用法：node scripts/check-repo-size.js [--max-mb=300] [--max-file-mb=25]
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const hit = process.argv.find((v) => v.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
}

const MAX_MB = arg('max-mb', 300);
const MAX_FILE_MB = arg('max-file-mb', 25);

const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

let total = 0;
const largest = [];
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let size = 0;
  try {
    size = fs.statSync(abs).size;
  } catch (e) {
    continue;
  }
  total += size;
  largest.push({ rel, size });
}

largest.sort((a, b) => b.size - a.size);

const totalMb = total / 1024 / 1024;
const top = largest.slice(0, 10);

console.log('[repo-size] 已跟踪文件快照：' + totalMb.toFixed(1) + ' MB');
console.log('[repo-size] 最大文件：');
for (const item of top) {
  console.log(`  ${(item.size / 1024 / 1024).toFixed(1).padStart(7)} MB  ${item.rel}`);
}

const tooBig = largest.filter((item) => item.size / 1024 / 1024 > MAX_FILE_MB);
const errors = [];
if (totalMb > MAX_MB) {
  errors.push(`快照 ${totalMb.toFixed(1)} MB 超过预算 ${MAX_MB} MB`);
}
if (tooBig.length) {
  errors.push(`存在超过 ${MAX_FILE_MB} MB 的单文件：` + tooBig.map((i) => i.rel).join(', '));
}

if (errors.length) {
  console.error('[repo-size] 失败：');
  errors.forEach((e) => console.error('  - ' + e));
  console.error('  治理建议：视频/大图迁 Git LFS 或 R2/S3；历史归档移出主分支。');
  process.exit(1);
}

if (totalMb > MAX_MB * 0.85) {
  console.warn(`[repo-size] 警告：已使用预算的 ${((totalMb / MAX_MB) * 100).toFixed(0)}%`);
}
console.log('[repo-size] 通过');
