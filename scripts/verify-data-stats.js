#!/usr/bin/env node
/**
 * 校验 data/stats.json 与真实数据源、版本号、README 口径一致（H-06）。
 *
 * 失败场景：
 *   1) 题库/内容变更后忘记运行 npm run build:stats；
 *   2) package.json 版本与 data/_version.json 漂移；
 *   3) README 版本徽章/题量宣传与数据不一致。
 *
 * 用法：node scripts/verify-data-stats.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { computeStats } = require('./build-data-stats.js');

const ROOT = path.resolve(__dirname, '..');

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function fail(messages) {
  console.error('[verify-data-stats] 失败：');
  messages.forEach((m) => console.error('  - ' + m));
  process.exit(1);
}

const errors = [];
const actual = computeStats();

let saved;
try {
  saved = JSON.parse(readText('data/stats.json'));
} catch (e) {
  fail(['data/stats.json 不存在或不是合法 JSON，请运行 npm run build:stats']);
}

if (JSON.stringify(saved) !== JSON.stringify(actual)) {
  errors.push('data/stats.json 已过期，请运行 npm run build:stats');
}

const pkg = JSON.parse(readText('package.json'));
if (String(pkg.version) !== String(actual.site_version)) {
  errors.push(
    `package.json 版本 ${pkg.version} 与 data/_version.json ${actual.site_version} 不一致，` +
    '请运行 npm run sync:version'
  );
}

const readme = readText('README.md');
const readmeEn = readText('README-en.md');
if (!new RegExp(`version-${actual.site_version.replace(/\./g, '\\.')}-blue`).test(readme)) {
  errors.push(`README.md 版本徽章未同步到 ${actual.site_version}，请运行 npm run sync:version`);
}
if (!new RegExp(`version-${actual.site_version.replace(/\./g, '\\.')}-blue`).test(readmeEn)) {
  errors.push(`README-en.md 版本徽章未同步到 ${actual.site_version}，请运行 npm run sync:version`);
}

// 对外宣传只允许「向下取整到百 + 」，避免手写数字漂移。
const claimedHundreds = Math.floor(actual.unique_questions / 100) * 100;
if (!readme.includes(claimedHundreds + '+')) {
  errors.push(
    `README.md 未出现与 unique_questions=${actual.unique_questions} 对应的「${claimedHundreds}+」口径`
  );
}

// 视频目录数量与 data/videos.json 对账（README 当前写 37 条）。
if (!readme.includes(`${actual.videos} 条`)) {
  errors.push(`README.md 视频数量未与 data/videos.json（${actual.videos}）对齐`);
}

if (errors.length) fail(errors);

console.log('[verify-data-stats] 通过');
console.log(
  `  unique_questions=${actual.unique_questions} ` +
  `site_version=${actual.site_version} ` +
  `manifest_total=${actual.manifest_total_questions}`
);
