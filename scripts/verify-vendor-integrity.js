#!/usr/bin/env node
'use strict';
/**
 * TATABOX — vendor 完整性校验门禁（P0 供应链安全）
 *
 * 目的：杜绝"被捧杀/投毒"——任何人以"升级某库"为名替换 js/vendor/ 下的三方
 * min 文件（或新增一个带后门的文件），只要不同步更新清单，CI 就会报红，
 * 强制人工确认改动来源。防的就是"盲合并一个看起来很好心、实则藏炸弹的 PR"。
 *
 * 用法：
 *   node scripts/verify-vendor-integrity.js            # 校验模式（CI 调用）
 *   node scripts/verify-vendor-integrity.js --update   # 重新生成清单（合法升级后执行）
 *
 * 零依赖：仅使用 node 内置 crypto + fs。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VENDOR_DIR = path.join(__dirname, '..', 'js', 'vendor');
const MANIFEST = path.join(__dirname, 'vendor-hashes.json');

// 递归收集 js/vendor/ 下所有文件（相对路径统一为正斜杠）
function walk(dir, base) {
  let out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(abs, base));
    else out.push({ rel: path.relative(base, abs).split(path.sep).join('/'), abs });
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

// 统一换行符后再哈希：Git 的 core.autocrlf 会在 Windows 检出时把 LF 改成 CRLF，
// 若直接对工作区字节哈希，同一 commit 在 Windows 必红、Linux CI 却通过。
// 归一化只消除检出差异，不掩盖任何实际内容改动。
function sha256(file) {
  // 二进制文件按原始字节哈希（用文本编码读写会破坏 wasm 等文件）
  if (/\.(wasm|png|jpe?g|gif|ico|woff2?|ttf|otf|mp4|webp)$/i.test(file)) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  const raw = fs.readFileSync(file, 'utf8');
  return crypto.createHash('sha256').update(raw.replace(/\r\n/g, '\n')).digest('hex');
}

const files = walk(VENDOR_DIR, VENDOR_DIR);
const current = {};
for (const f of files) current[f.rel] = sha256(f.abs);

// 更新模式：把当前文件指纹写入清单
if (process.argv.includes('--update')) {
  const out = { updated: new Date().toISOString(), files: current };
  fs.writeFileSync(MANIFEST, JSON.stringify(out, null, 2) + '\n');
  console.log(`[vendor] 清单已更新：${Object.keys(current).length} 个文件 → ${path.relative(process.cwd(), MANIFEST)}`);
  process.exit(0);
}

// 校验模式：读取清单
let manifest;
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
catch (e) {
  console.error(`[vendor] 找不到或损坏清单：${MANIFEST}`);
  console.error('        首次使用请运行：node scripts/verify-vendor-integrity.js --update');
  process.exit(1);
}
const expected = manifest.files || {};

let errors = 0;

// 1) 篡改检测：在清单里的文件，哈希必须一致
for (const rel of Object.keys(expected)) {
  if (!current[rel]) {
    console.error(`[vendor] FAIL: 清单在册但仓库缺失：${rel}`);
    errors++;
    continue;
  }
  if (expected[rel] !== current[rel]) {
    console.error(`[vendor] FAIL: 文件被改动，SHA-256 不一致：${rel}`);
    console.error(`         仓库=${current[rel]}`);
    console.error(`         清单=${expected[rel]}`);
    errors++;
  }
}

// 2) 新增检测：仓库出现但未登记的文件（可能是投毒），必须显式登记
for (const rel of Object.keys(current)) {
  if (!expected[rel]) {
    console.error(`[vendor] FAIL: 新增未登记文件：${rel}`);
    errors++;
  }
}

if (errors) {
  console.error(`[vendor] ${errors} 处不一致。若为合法升级/新增，请先人工审查 diff，再运行：`);
  console.error('        node scripts/verify-vendor-integrity.js --update 并提交清单');
  process.exit(1);
}

console.log(`[vendor] OK：${Object.keys(current).length} 个 vendor 文件哈希与清单一致`);