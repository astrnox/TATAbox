#!/usr/bin/env node
/**
 * 把 data/_version.json 作为唯一版本源，同步到 package.json 与 README 徽章（H-06）。
 *
 * 用法：node scripts/sync-version.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const versionFile = path.join(ROOT, 'data/_version.json');
const version = JSON.parse(fs.readFileSync(versionFile, 'utf8')).version;

if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error('[sync-version] data/_version.json 缺少合法的 version 字段');
  process.exit(1);
}

const pkgPath = path.join(ROOT, 'package.json');
const pkgText = fs.readFileSync(pkgPath, 'utf8');
const nextPkg = pkgText.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`);
if (nextPkg !== pkgText) fs.writeFileSync(pkgPath, nextPkg, 'utf8');

for (const file of ['README.md', 'README-en.md']) {
  const filePath = path.join(ROOT, file);
  if (!fs.existsSync(filePath)) continue;
  const text = fs.readFileSync(filePath, 'utf8');
  const next = text.replace(/version-\d+\.\d+\.\d+-blue/g, `version-${version}-blue`);
  if (next !== text) fs.writeFileSync(filePath, next, 'utf8');
}

console.log(`[sync-version] 版本已同步为 ${version}`);
