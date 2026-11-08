#!/usr/bin/env node
'use strict';
/**
 * build-prod.js —— 生成可部署的生产目录 dist/（H-04）
 *
 * 步骤：
 *  1. 清空 dist/
 *  2. 重建首屏 CSS 合并包（scripts/build-css-bundle.js）
 *  3. esbuild 逐文件压缩 JS/CSS 到 dist/（scripts/minify-assets.js）
 *  4. 复制站点运行所需的静态资源（HTML/JSON/图片/字体/视频/vendor 等）
 *  5. 用 dist 内容哈希重写 dist/sw.js 的 CACHE_VERSION
 *  6. 输出 dist/build-report.json（体积 / 脚本数 / gzip 预算）
 *
 * 设计取舍：项目是多脚本经典全局依赖模型，脚本之间有严格加载顺序，
 * 因此不做跨文件 concat bundle（会破坏 'use strict' 与全局声明语义），
 * 生产构建只做「逐文件压缩 + 资源裁剪 + 可部署目录」。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// 不进入生产部署的开发/构建目录（与 .assetsignore 对齐）
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.github', 'archive', 'docs', 'prd', 'reports',
  'screenshots', 'scripts', 'sql', 'tests', 'tools', 'coverage', 'dist',
  '.trae', '.trae-html-share-packages', 'vendor'
]);
// 开发期文件，站点运行不需要
const SKIP_FILES = new Set([
  'package.json', 'package-lock.json', 'eslint.config.mjs', '.prettierrc.json',
  'README.md', 'README-en.md', 'SECURITY.md', 'CONTRIBUTING.md', '.assetsignore',
  '.env.example'
]);
// 仅构建期使用的源字体（运行时使用 subset）
const SKIP_FILES_REL = new Set(['fonts/lxgw-wenkai.woff2']);

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

/**
 * 清空目录内容但保留目录本身。
 * Windows 下若某终端/资源管理器把 dist/ 作为当前目录，目录句柄会阻止
 * rmdir/rename（EPERM），但不影响写入；这里逐个清理子项以兼容该场景。
 */
function clearDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    rmrf(path.join(dir, name));
  }
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyTree(fromDir, toDir, relPrefix) {
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const rel = relPrefix ? relPrefix + '/' + entry.name : entry.name;
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      copyTree(from, to, rel);
    } else {
      if (SKIP_FILES.has(entry.name) || SKIP_FILES_REL.has(rel.replace(/\\/g, '/'))) continue;
      copyFile(from, to);
    }
  }
}

function runScript(name) {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', name)], { cwd: ROOT, stdio: 'inherit' });
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

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function gzipSize(p) {
  return zlib.gzipSync(fs.readFileSync(p)).length;
}

function buildVersionHash() {
  const files = listFiles(DIST, []).filter((p) => path.basename(p) !== 'sw.js');
  const h = crypto.createHash('sha256');
  for (const p of files.sort()) {
    h.update(path.relative(DIST, p).replace(/\\/g, '/'));
    h.update(sha256File(p));
  }
  return h.digest('hex').slice(0, 12);
}

function countIndexScripts() {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  return (html.match(/<script[^>]+src=/g) || []).length;
}

function main() {
  console.log('[build-prod] 清理 dist/ …');
  clearDir(DIST);

  if (!fs.existsSync(path.join(ROOT, 'css', 'bundle-core.css'))) {
    console.error('[build-prod] 缺少 css/bundle-core.css，请先运行 npm run build:css');
    process.exit(1);
  }

  console.log('[build-prod] 1/3 esbuild 逐文件压缩 JS/CSS');
  runScript('minify-assets.js');

  console.log('[build-prod] 2/3 复制静态资源');
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    const name = entry.name;
    if (SKIP_DIRS.has(name)) continue;
    const from = path.join(ROOT, name);
    if (entry.isDirectory()) {
      if (name === 'css') {
        // 顶层 CSS 已由 minify-assets 写入 dist/css；css/vendor/ 为未压缩的
        // 第三方样式与字体（如 KaTeX），需原样复制（L-07）。
        // 目录可能尚未创建（纯业务 CSS 项目），此时跳过而不是让构建失败。
        const cssVendor = path.join(from, 'vendor');
        if (fs.existsSync(cssVendor)) {
          copyTree(cssVendor, path.join(DIST, 'css', 'vendor'), 'css/vendor');
        }
        continue;
      }
      if (name === 'js') {
        // 业务 JS 已压缩进 dist/js；vendor 保持原样（已是压缩后的三方库）
        copyTree(path.join(from, 'vendor'), path.join(DIST, 'js', 'vendor'), 'js/vendor');
        continue;
      }
      copyTree(from, path.join(DIST, name), name);
    } else {
      if (SKIP_FILES.has(name)) continue;
      copyFile(from, path.join(DIST, name));
    }
  }

  console.log('[build-prod] 3/3 重写 SW 版本号 + 生成报告');
  const version = buildVersionHash();
  const swPath = path.join(DIST, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8').replace(
    /var CACHE_VERSION = '[^']*';/,
    "var CACHE_VERSION = 'bioquest-" + version + "';"
  );
  fs.writeFileSync(swPath, sw, 'utf8');

  const allFiles = listFiles(DIST, []);
  const totalBytes = allFiles.reduce((s, p) => s + fs.statSync(p).size, 0);
  const jsFiles = allFiles.filter((p) => p.endsWith('.js'));
  const cssFiles = allFiles.filter((p) => p.endsWith('.css'));
  const jsGzip = jsFiles.reduce((s, p) => s + gzipSize(p), 0);
  const cssGzip = cssFiles.reduce((s, p) => s + gzipSize(p), 0);
  const indexScripts = countIndexScripts();

  const report = {
    generatedAt: new Date().toISOString(),
    swVersion: 'bioquest-' + version,
    files: allFiles.length,
    totalBytes,
    totalMB: Math.round((totalBytes / 1048576) * 10) / 10,
    js: { files: jsFiles.length, gzipBytes: jsGzip, gzipKB: Math.round(jsGzip / 1024) },
    css: { files: cssFiles.length, gzipBytes: cssGzip, gzipKB: Math.round(cssGzip / 1024) },
    indexScriptTags: indexScripts
  };
  fs.writeFileSync(path.join(DIST, 'build-report.json'), JSON.stringify(report, null, 2), 'utf8');

  console.log('');
  console.log('[build-prod] 完成：dist/ 共 ' + report.files + ' 个文件，' + report.totalMB + ' MB');
  console.log('  JS  gzip：' + report.js.gzipKB + ' KB（' + report.js.files + ' 个文件）');
  console.log('  CSS gzip：' + report.css.gzipKB + ' KB（' + report.css.files + ' 个文件）');
  console.log('  index.html 脚本标签：' + indexScripts);
  console.log('  SW 版本：' + report.swVersion);
}

main();
