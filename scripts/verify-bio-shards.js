#!/usr/bin/env node
/**
 * TATABOX — 题库校验器（Issue #10，CI 使用）
 *
 * 适配 #150 新题库（M 格式 bioID）：
 *   1. manifest 结构
 *   2. manifest 各分片 SHA-256 与实际文件一致
 *   3. bioID 全局唯一 + 格式合法（M<模块>-<tag 十六进制>-<8~16位hash>）
 *      并校验前缀「M<模块>」与题目自身 module_<N> 一致
 *   4. index/bank 双向一致（bank 有对应 index，index 有对应 bank）
 *
 * 说明（相对旧校验器移除/变更的部分）：
 *   - 旧的「内容寻址反向复算（抗漂移）」：新 ID 的 12 位 hash 由各模块生成脚本
 *     （generate_m*_questions.py）自定义拼接产生，留存脚本与已提交数据非同一版本，
 *     无法在本仓库确定性重建，故移除该段。
 *   - 旧的「bioid-map 迁移映射 / oldId」：新题库已删除 bioid-map.json 与 oldId 迁移
 *     体系（旧引用不再需要通过映射表解析），故移除该段。
 *   - bioID hash 段位数：#150 曾为 12 位；v1.1 存储规范（docs/question-bank-review-rules.md
 *     §9.3）规定新题为 M{模块}-{主题序号}-{8位hex}（内容 sha256 前 8 位），
 *     故此处放宽到 8~16 位以兼容两代题库。
 *
 * 运行：node scripts/verify-bio-shards.js
 * 退出码：0 通过；1 失败（任何一项不通过都视为失败）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

let failures = 0;

function fail(msg) {
  failures++;
  console.error('  [FAIL] ' + msg);
}

function ok(msg) {
  console.log('  [ok] ' + msg);
}

function sha256(absPath) {
  // 统一按 LF 计算：Windows 检出若为 CRLF，直接哈希原始字节会与 manifest
  // （按 LF 生成）不匹配，导致 Linux CI 全量误报。
  const raw = fs.readFileSync(absPath);
  const normalized = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// 新格式：M<模块1-4>-<tag十六进制>-<8~16位hash>
// tag 十六进制如 05 / 0C / 0F（2 位为主，允许 1-3 位）；尾 hash 为小写十六进制
// （v1.1 规范为 8 位内容寻址，兼容 12 位旧格式，故放宽到 8~16 位）。
const bioRegex = /^M[1-4]-[0-9A-Fa-f]{1,3}-[0-9a-f]{8,16}$/;

/* ---- 1. manifest ---- */
const manifestPath = path.join(DATA_DIR, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log('== manifest 结构 ==');
if (!manifest.rev || typeof manifest.rev !== 'number') fail('manifest 缺少 rev 字段');
else ok('rev = ' + manifest.rev);
if (!manifest.updated_at) fail('manifest 缺少 updated_at');
else ok('updated_at = ' + manifest.updated_at);
if (!manifest.files || typeof manifest.files !== 'object') fail('manifest 缺少 files');
if (typeof manifest.total_questions !== 'number') fail('manifest 缺少 total_questions 字段');
else ok('total_questions = ' + manifest.total_questions);
if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) fail('manifest 缺少 sources');
else ok('sources = ' + manifest.sources.length + ' 个分片');

/* ---- 2. SHA-256 一致性 ---- */
console.log('== SHA-256 一致性 ==');
const filePaths = Object.keys(manifest.files || {});
let shaOk = 0;
for (const rel of filePaths) {
  const abs = path.join(DATA_DIR, rel.replace(/^data\//, ''));
  if (!fs.existsSync(abs)) {
    fail('manifest 声明的文件不存在: ' + rel);
    continue;
  }
  const actual = sha256(abs);
  if (actual !== manifest.files[rel]) {
    fail('SHA-256 不匹配: ' + rel + ' (manifest=' + manifest.files[rel].slice(0, 12) + ' actual=' + actual.slice(0, 12) + ')');
  } else {
    shaOk++;
  }
}
ok('SHA-256 一致 ' + shaOk + '/' + filePaths.length);

/* ---- 3. bioID 唯一性 + 格式 + 模块一致 ---- */
console.log('== bioID 唯一性 / 格式 / 模块一致 ==');
const bioSet = new Set();
const bankRel = filePaths.filter((r) => r.startsWith('bank/'));
let totalInBank = 0;
let modBad = 0;
for (const rel of bankRel) {
  const abs = path.join(DATA_DIR, rel.replace(/^data\//, ''));
  const obj = JSON.parse(fs.readFileSync(abs, 'utf8'));
  for (const bioId of Object.keys(obj)) {
    totalInBank++;
    if (!bioRegex.test(bioId)) {
      fail('非法 bioID 格式: ' + bioId);
      continue;
    }
    if (bioSet.has(bioId)) fail('bioID 重复: ' + bioId);
    bioSet.add(bioId);
    // 前缀 M<模块> 应与题目 module_<N> 一致
    const m = bioId.match(/^M([1-4])-/);
    const q = obj[bioId];
    const modTag = Array.isArray(q.tags) ? q.tags.find((t) => /^module_[1-4]$/.test(t)) : null;
    const modNum = modTag ? modTag.replace('module_', '') : null;
    if (modNum !== m[1]) {
      modBad++;
      if (modBad <= 10) fail('模块不一致: ' + bioId + '（bioID=M' + m[1] + ' 题目 module=' + (modTag || q.module || '缺失') + '）');
    }
  }
}
ok('bioID 唯一，共 ' + bioSet.size + ' 个');
if (modBad === 0) ok('全部 ' + totalInBank + ' 题的 M<模块> 前缀与题目 module 一致');
else fail(modBad + ' 题模块前缀不一致');
if (totalInBank !== manifest.total_questions) {
  fail('bank 题量与 manifest.total_questions 不一致: bank=' + totalInBank + ' manifest=' + manifest.total_questions);
} else {
  ok('bank 题量 = manifest.total_questions = ' + totalInBank);
}

/* ---- 4. index/bank 双向一致 ---- */
console.log('== index/bank 双向一致 ==');
const tagList = (manifest.sources || []).map((s) => s.tag);
// 确保每个 source tag 都有 index 与 bank 文件
for (const tag of tagList) {
  const indexPath = path.join(DATA_DIR, 'index', tag + '.json');
  const bankPath = path.join(DATA_DIR, 'bank', tag + '.json');
  if (!fs.existsSync(indexPath) || !fs.existsSync(bankPath)) {
    fail('tag=' + tag + ' 缺少 index 或 bank 文件');
  }
}
// bank 文件名 → 也必须在 sources 中声明（反之已检查）
const declaredTagSet = new Set(tagList);
for (const rel of bankRel) {
  const tag = rel.replace(/^bank\//, '').replace(/\.json$/, '');
  if (!declaredTagSet.has(tag)) fail('bank 文件未在 manifest.sources 声明: ' + tag);
}

let pairOk = 0;
for (const tag of tagList) {
  const indexPath = path.join(DATA_DIR, 'index', tag + '.json');
  const bankPath = path.join(DATA_DIR, 'bank', tag + '.json');
  if (!fs.existsSync(indexPath) || !fs.existsSync(bankPath)) continue;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  const iIds = Object.keys(index);
  const bIds = Object.keys(bank);
  if (iIds.length !== bIds.length) fail('tag=' + tag + ' index/bank 数量不一致: ' + iIds.length + ' vs ' + bIds.length);
  for (const id of iIds) if (!bank[id]) fail('tag=' + tag + ' index 有但 bank 无: ' + id);
  for (const id of bIds) if (!index[id]) fail('tag=' + tag + ' bank 有但 index 无: ' + id);
  for (const id of iIds) {
    const meta = index[id];
    // index 元数据存在新旧两种格式混用：新 `difficulty`+`tag`，旧 `diff`+`src`。
    const hasNew = meta && meta.difficulty !== undefined && meta.tag !== undefined;
    const hasOld = meta && meta.diff !== undefined && meta.src !== undefined;
    if (!meta || !Array.isArray(meta.tags) || meta.module === undefined || (!hasNew && !hasOld)) {
      fail('tag=' + tag + ' index 元数据字段缺失: ' + id);
      break;
    }
  }
  pairOk++;
}
ok('index/bank 双向一致，共检查 ' + pairOk + '/' + tagList.length + ' 个分片');

/* ---- 汇总 ---- */
if (failures > 0) {
  console.error('\n[结果] 校验失败：' + failures + ' 项不通过');
  process.exit(1);
} else {
  console.log('\n[结果] 全部校验通过 ✓');
  process.exit(0);
}