#!/usr/bin/env node
/**
 * TATABOX — IBO 真题池构建器
 * ============================================================
 * 把 resource/ibo/<year>/<paper>.json（每卷一个文件，含 questions 数组）
 * 聚合为前端练习页可直读的题池：
 *
 *   resource/ibo.json        { _meta: {...}, questions: [完整题目对象...] }
 *   resource/ibo-count.json  { live, playable, generated_at }  ← 计数用
 *
 * 与 CnBO 池（resource/all.json，scripts/build-league-pool.js）分文件存放：
 *   - IBO 题带双语字段（question_zh / text_zh / tables_zh / caption_zh），
 *     许可证为 CC BY-NC-SA 4.0，来源与 CnBO 不同；
 *   - 练习页把两个池合并展示，计数分别读取。
 *
 * 运行：node scripts/build-ibo-pool.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'resource', 'ibo');
const OUT_ALL = path.join(ROOT, 'resource', 'ibo.json');
const OUT_COUNT = path.join(ROOT, 'resource', 'ibo-count.json');

const LABELS = ['A', 'B', 'C', 'D', 'E'];

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

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** 校验单题；返回错误数组（空数组=通过） */
function validateQuestion(q, file) {
  const errors = [];
  const where = path.relative(ROOT, file) + ':' + (q && q.id ? q.id : '?');
  if (!q || typeof q !== 'object') return [where + ' 不是对象'];
  if (!isNonEmptyString(q.id)) errors.push(where + ' 缺 id');
  if (q.type !== 'mtf') errors.push(where + ' type 必须为 mtf（IBO 理论题）');
  if (!isNonEmptyString(q.question)) errors.push(where + ' 缺英文题干');
  if (!isNonEmptyString(q.question_zh)) errors.push(where + ' 缺中文题干 question_zh');
  if (!isNonEmptyString(q.explanation)) errors.push(where + ' 缺解析');
  if (!/^module_[1-4]$/.test(String(q.module || ''))) errors.push(where + ' module 非法');
  if (!Number.isInteger(q.year)) errors.push(where + ' year 必须为整数');
  if (q.competition !== 'IBO') errors.push(where + ' competition 必须为 IBO');
  if (!isNonEmptyString(q.source)) errors.push(where + ' 缺 source');

  const subs = Array.isArray(q.subQuestions) ? q.subQuestions : [];
  if (subs.length < 4 || subs.length > 5) {
    errors.push(where + ' subQuestions 必须为 4~5 条');
  } else {
    subs.forEach((s, i) => {
      if (!s || s.label !== LABELS[i]) errors.push(where + ' 子题标签应连续为 A..' + LABELS[subs.length - 1]);
      if (!isNonEmptyString(s.text)) errors.push(where + ' 子题 ' + LABELS[i] + ' 缺英文 text');
      if (!isNonEmptyString(s.text_zh)) errors.push(where + ' 子题 ' + LABELS[i] + ' 缺中文 text_zh');
      if (typeof s.answer !== 'boolean') errors.push(where + ' 子题 ' + LABELS[i] + ' answer 非布尔');
    });
  }

  // 表格（可选）：中英文行数/列数需一致，防止切换语言错位
  if (q.tables !== undefined || q.tables_zh !== undefined) {
    const t = Array.isArray(q.tables) ? q.tables : [];
    const tz = Array.isArray(q.tables_zh) ? q.tables_zh : [];
    if (t.length !== tz.length) {
      errors.push(where + ' tables 与 tables_zh 数量不一致');
    } else {
      t.forEach((tb, i) => {
        const h1 = (tb && tb.head) || [];
        const h2 = (tz[i] && tz[i].head) || [];
        const r1 = (tb && tb.rows) || [];
        const r2 = (tz[i] && tz[i].rows) || [];
        if (h1.length !== h2.length || r1.length !== r2.length) {
          errors.push(where + ' 表 ' + (i + 1) + ' 中英文结构不一致');
        }
      });
    }
  }

  const imgs = Array.isArray(q.images) ? q.images : [];
  imgs.forEach((im, i) => {
    if (!im || !isNonEmptyString(im.file)) {
      errors.push(where + ' 配图 ' + (i + 1) + ' 缺 file');
      return;
    }
    if (!fs.existsSync(path.join(ROOT, im.file))) {
      errors.push(where + ' 配图文件不存在: ' + im.file);
    }
  });
  if (q.has_figure === true && imgs.length === 0) {
    errors.push(where + ' has_figure=true 但 images 为空');
  }

  return errors;
}

function main() {
  const files = walkJson(SRC_DIR);
  const questions = [];
  const ids = new Set();
  const errors = [];
  let total = 0;

  for (const f of files) {
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      errors.push(path.relative(ROOT, f) + ' JSON 解析失败: ' + e.message);
      continue;
    }
    const list = Array.isArray(doc) ? doc
      : (Array.isArray(doc && doc.questions) ? doc.questions
        : (doc && doc.id ? [doc] : []));
    if (!Array.isArray(list)) continue;
    for (const q of list) {
      total++;
      const errs = validateQuestion(q, f);
      if (errs.length) errors.push(...errs);
      if (q && q.id) {
        if (ids.has(q.id)) errors.push('重复 id: ' + q.id);
        ids.add(q.id);
      }
      questions.push(q);
    }
  }

  if (errors.length) {
    console.error('[ibo-pool] 校验失败 ' + errors.length + ' 项：');
    errors.slice(0, 50).forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }

  questions.sort((a, b) =>
    (a.year || 0) - (b.year || 0) ||
    String((a.paper && a.paper.key) || '').localeCompare(String((b.paper && b.paper.key) || '')) ||
    ((a.paper && a.paper.question_no) || 0) - ((b.paper && b.paper.question_no) || 0));

  const generatedAt = new Date().toISOString().slice(0, 10);
  const out = {
    _meta: {
      generated_at: generatedAt,
      schema_version: 1,
      competition: 'IBO',
      event: '国际生物学奥林匹克竞赛',
      license: 'CC BY-NC-SA 4.0',
      note: '由 scripts/build-ibo-pool.js 从 resource/ibo/**/*.json 生成；勿手改',
      source_total: total,
      playable: questions.length
    },
    questions
  };
  fs.writeFileSync(OUT_ALL, JSON.stringify(out), 'utf8');
  fs.writeFileSync(OUT_COUNT, JSON.stringify({
    live: total,
    playable: questions.length,
    generated_at: generatedAt
  }, null, 1) + '\n', 'utf8');

  console.log('[ibo-pool] 读取 %d 题，收录 %d 题；%s MB',
    total, questions.length, (fs.statSync(OUT_ALL).size / 1e6).toFixed(2));
  console.log('[ibo-pool] 写入 %s / %s',
    path.relative(ROOT, OUT_ALL), path.relative(ROOT, OUT_COUNT));
}

main();
