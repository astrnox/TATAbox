#!/usr/bin/env node
/**
 * ============================================================
 * scripts/bump-sw.js — Service Worker 缓存版本号自动 bump（P1-4）
 * ============================================================
 * 用途：
 *   每次修改 js/css/data 下的内容后执行 `npm run bump:sw`（或 node scripts/bump-sw.js），
 *   自动基于 git 跟踪的 js/css/data 文件内容计算 SHA-256 并写入 sw.js 的 CACHE_VERSION。
 *   避免"人肉维护版本号"导致的旧新资源混用灵异 bug。
 *
 * 跨平台一致性：
 *   内容哈希取 git 的 blob 哈希（git hash-object --stdin-paths），会应用
 *   .gitattributes / core.autocrlf 的 clean 过滤；Windows(CRLF) 与 Linux(LF)
 *   检出得到同一版本号，不再出现"换台机器 bump 就变号"。
 *
 * 幂等性：
 *   内容未变化时输出不变、不改写文件（不会弄脏工作区 / 不产生空提交）。
 *
 * 零依赖：仅使用 Node 内置模块。git 不可用时退化为目录遍历（忽略 node_modules）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SW_FILE = path.join(ROOT, 'sw.js');

// 参与版本哈希的目录（与 PRD P1-4 约定一致：js/css/data）
const HASH_DIRS = ['js', 'css', 'data'];

function gitListFiles() {
  try {
    return execSync('git ls-files js css data', { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (e) {
    // git 不可用（如未初始化的目录）→ 退化为递归遍历
    const out = [];
    HASH_DIRS.forEach((dir) => walk(dir, out));
    return out;
  }
}

function walk(relDir, out) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return;
  const stack = [abs];
  while (stack.length) {
    const p = stack.pop();
    for (const name of fs.readdirSync(p)) {
      if (name === 'node_modules' || name === '.git') continue;
      const full = path.join(p, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) stack.push(full);
      else out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
}

/**
 * 工作区文件在 git 中的 blob 哈希（应用 clean 过滤，跨平台稳定）。
 * git 不可用或输出异常时返回 null，调用方退化为直接读文件字节。
 */
function gitBlobHashes(files) {
  if (!files.length) return null;
  try {
    const out = execSync('git hash-object --stdin-paths', {
      cwd: ROOT,
      input: files.join('\n') + '\n',
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024
    }).split('\n').map((s) => s.trim()).filter(Boolean);
    if (out.length !== files.length) return null;
    if (out.some((h) => !/^[0-9a-f]{40,64}$/.test(h))) return null;
    return out;
  } catch (e) {
    return null;
  }
}

const files = gitListFiles();
// index.html 也在 CORE_ASSETS 预缓存里，但它不在 js/css/data 目录内；
// 首屏骨架/内联样式改动同样需要换缓存版本，否则老用户会继续吃旧壳。
if (fs.existsSync(path.join(ROOT, 'index.html'))) files.push('index.html');
const blobHashes = gitBlobHashes(files);
const hash = crypto.createHash('sha256');
for (let i = 0; i < files.length; i++) {
  const f = files[i];
  let part;
  if (blobHashes) {
    part = blobHashes[i];
  } else {
    try {
      part = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
    } catch (e) {
      // 文件被删除/不可读则跳过，不影响其余内容哈希
      continue;
    }
  }
  // 文件名参与哈希，避免不同文件同内容相互抵消
  hash.update(f + '\0' + part + '\n');
}
const digest = hash.digest('hex');
// 纯内容哈希驱动：内容不变则版本号不变（幂等）
const version = 'bioquest-' + digest.slice(0, 12);

let sw;
try {
  sw = fs.readFileSync(SW_FILE, 'utf8');
} catch (e) {
  console.error('[bump-sw] 读取 sw.js 失败:', e.message);
  process.exit(1);
}

const re = /var CACHE_VERSION = '[^']*';/;
if (!re.test(sw)) {
  console.error('[bump-sw] sw.js 中未找到 var CACHE_VERSION = \'...\'; 定义，请人工核对');
  process.exit(1);
}

const next = `var CACHE_VERSION = '${version}';`;
if (re.exec(sw)[0] === next) {
  console.log('[bump-sw] 缓存版本未变化:', version);
  process.exit(0);
}

sw = sw.replace(re, next);
fs.writeFileSync(SW_FILE, sw);
console.log('[bump-sw] 已更新 CACHE_VERSION →', version);
console.log('[bump-sw] 已参与哈希文件数:', files.length);
