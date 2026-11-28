#!/usr/bin/env node
/**
 * TATABOX — 四川省初赛题池构建器
 * ============================================================
 * 把 resource/provincial/ 下的单题 JSON 聚合为练习页可直读的轻量题池：
 *
 *   resource/provincial.json        { _meta: {...}, questions: [...] }
 *   resource/provincial-count.json  { live, playable, generated_at }  ← 首页计数用
 *
 * 数据来源：github.com/huicishengbodebianfu/biology-competition 的
 * 四川初赛 2021–2023 试卷（文本层可解析部分）。只收录自包含题：
 * 依赖原卷图片 / 题组材料 / 跨题引用的题目在导入阶段已剔除。
 *
 * 运行：node scripts/build-provincial-pool.js
 * 校验：node scripts/build-provincial-pool.js --check（数据与产物不一致时退出码 1）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'resource', 'provincial');
const OUT_POOL = path.join(ROOT, 'resource', 'provincial.json');
const OUT_COUNT = path.join(ROOT, 'resource', 'provincial-count.json');

const ID_RE = /^PROV-SC-\d{4}-\d{2}$/;

function walkJson(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) out.push(...walkJson(abs));
    else if (name.endsWith('.json')) out.push(abs);
  }
  return out;
}

function fail(msg) {
  console.error('[provincial] ' + msg);
  process.exit(1);
}

function validate(q, file) {
  const rel = path.relative(ROOT, file);
  if (!q || typeof q !== 'object') fail(rel + ' 不是对象');
  if (!ID_RE.test(String(q.id || ''))) fail(rel + ' id 非法: ' + q.id);
  if (q.type !== 'single' && q.type !== 'multiple') fail(rel + ' type 非法: ' + q.type);
  if (!String(q.question || '').trim()) fail(rel + ' 题干为空');
  if (!String(q.answer || '').match(/^[A-E]+$/)) fail(rel + ' answer 非法: ' + q.answer);
  if (!String(q.source || '').trim()) fail(rel + ' 缺少 source');
  if (!Array.isArray(q.tags) || !q.tags.includes('provincial')) fail(rel + ' tags 缺少 provincial');
  if (q.has_figure) fail(rel + ' 含图题应剔除（has_figure=true）');

  const labels = q.type === 'single'
    ? Object.keys(q.options || {}).sort()
    : (q.subQuestions || []).map((s) => s.label).sort();
  if (labels.length < 4) fail(rel + ' 选项不足 4 个');
  if (labels.join('') !== labels.map((_, i) => String.fromCharCode(65 + i)).join('')) {
    fail(rel + ' 选项标号不连续: ' + labels.join(''));
  }
  for (const ch of String(q.answer)) {
    if (!labels.includes(ch)) fail(rel + ' 答案 ' + ch + ' 不在选项中');
  }
  if (q.type === 'single') {
    if (String(q.answer).length !== 1) fail(rel + ' 单选题答案必须为 1 个字母');
    if (q.subQuestions) fail(rel + ' 单选题不应含 subQuestions');
    labels.forEach((k) => {
      if (!String(q.options[k]).trim()) fail(rel + ' 选项 ' + k + ' 文本为空');
    });
  } else {
    if (q.options) fail(rel + ' 多选题不应含 options（会被判成单选）');
    if (q.subQuestions.length !== labels.length) fail(rel + ' subQuestions 标号重复');
    q.subQuestions.forEach((s) => {
      if (!String(s.text || '').trim()) fail(rel + ' 子题 ' + s.label + ' 文本为空');
      if (typeof s.answer !== 'boolean') fail(rel + ' 子题 ' + s.label + ' answer 非布尔');
    });
    const trueCount = q.subQuestions.filter((s) => s.answer).length;
    if (trueCount !== String(q.answer).length) fail(rel + ' 答案字母数与正确子题数不符');
  }
}

function build() {
  const files = walkJson(SRC_DIR);
  if (files.length === 0) fail('未找到源题文件: ' + path.relative(ROOT, SRC_DIR));

  const seen = new Set();
  const questions = [];
  for (const file of files) {
    const q = JSON.parse(fs.readFileSync(file, 'utf8'));
    validate(q, file);
    if (seen.has(q.id)) fail('id 重复: ' + q.id);
    seen.add(q.id);
    questions.push(q);
  }

  questions.sort((a, b) => (a.year - b.year) || (a.paper.question_no - b.paper.question_no));

  const years = [...new Set(questions.map((q) => q.year))].sort();
  const pool = {
    _meta: {
      generated_at: new Date().toISOString().slice(0, 10),
      schema_version: 1,
      province: '四川',
      event: '四川省生物学联赛初赛',
      source_repo: 'https://github.com/huicishengbodebianfu/biology-competition',
      exams: years,
      total: questions.length
    },
    questions
  };
  const count = { live: questions.length, playable: questions.length, generated_at: pool._meta.generated_at };
  return { pool, count, questions };
}

function main() {
  const check = process.argv.includes('--check');
  const { pool, count, questions } = build();

  if (check) {
    let bad = false;
    try {
      const oldPool = JSON.parse(fs.readFileSync(OUT_POOL, 'utf8'));
      const oldCount = JSON.parse(fs.readFileSync(OUT_COUNT, 'utf8'));
      if (JSON.stringify(oldPool.questions) !== JSON.stringify(questions)) bad = true;
      if (oldCount.playable !== count.playable) bad = true;
    } catch (e) {
      bad = true;
    }
    if (bad) fail('resource/provincial.json 已过期，请运行 node scripts/build-provincial-pool.js');
    console.log('[provincial] 校验通过：' + questions.length + ' 道（' + pool._meta.exams.join(' / ') + '）');
    return;
  }

  fs.writeFileSync(OUT_POOL, JSON.stringify(pool, null, 1) + '\n', 'utf8');
  fs.writeFileSync(OUT_COUNT, JSON.stringify(count, null, 1) + '\n', 'utf8');
  console.log('[provincial] 已写入 resource/provincial.json：' + questions.length + ' 道');
  const byYear = {};
  questions.forEach((q) => { byYear[q.year] = (byYear[q.year] || 0) + 1; });
  console.log('  ' + Object.keys(byYear).sort().map((y) => y + ': ' + byYear[y]).join('  '));
}

main();
