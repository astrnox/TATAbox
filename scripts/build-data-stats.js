#!/usr/bin/env node
/**
 * 构建 data/stats.json —— 题库/内容/版本口径的唯一汇总源（H-06）。
 *
 * 背景：仓库同时存在 shard（manifest/index/bank）、legacy quiz、
 * resource/all.json 联赛池、每日联赛 bank 等多个数据源，README/后台/
 * manifest 的“总题数”口径互不一致。本脚本把各源数量与去重后的
 * 唯一题目数固化到 data/stats.json，供文档与 CI 对账。
 *
 * 用法：node scripts/build-data-stats.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJSON(rel) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function computeStats() {
  const version = readJSON('data/_version.json');
  const manifest = readJSON('data/manifest.json');
  const pool = readJSON('resource/all.json');
  const iboPool = readJSON('resource/ibo.json');
  const quiz = readJSON('data/quiz.json');
  const logic = readJSON('data/logic_questions.json');
  const cards = readJSON('data/cards.json');
  const wiki = readJSON('data/wiki-seed.json');
  const videos = readJSON('data/videos.json');

  const poolQuestions = Array.isArray(pool.questions) ? pool.questions : [];
  const iboQuestions = Array.isArray(iboPool.questions) ? iboPool.questions : [];
  const quizQuestions = Array.isArray(quiz['题库']) ? quiz['题库'] : (Array.isArray(quiz.questions) ? quiz.questions : []);
  const logicQuestions = Array.isArray(logic) ? logic : (Array.isArray(logic.questions) ? logic.questions : []);
  const cardsTotal = Array.isArray(cards['分类'])
    ? cards['分类'].reduce((sum, cat) => sum + (Array.isArray(cat.cards) ? cat.cards.length : 0), 0)
    : 0;

  const uniqueIds = new Set();
  poolQuestions.forEach((q) => { if (q && q.id) uniqueIds.add(String(q.id)); });
  iboQuestions.forEach((q) => { if (q && q.id) uniqueIds.add(String(q.id)); });
  quizQuestions.forEach((q) => { const id = q && (q.bioId || q.id); if (id) uniqueIds.add(String(id)); });
  logicQuestions.forEach((q) => { const id = q && (q.id || q.bioId); if (id) uniqueIds.add(String(id)); });

  let bankObjects = 0;
  const bankDir = path.join(ROOT, 'data/bank');
  if (fs.existsSync(bankDir)) {
    for (const file of fs.readdirSync(bankDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const bank = readJSON(path.join('data/bank', file));
        for (const id of Object.keys(bank)) {
          uniqueIds.add(String(id));
          bankObjects += 1;
        }
      } catch (e) {
        // 单个分片损坏不应阻断统计；verify 阶段会由分片一致性门禁单独报错
      }
    }
  }

  return {
    site_version: version.version || '',
    site_updated_at: version.updated_at || '',
    question_sources: {
      league_pool: poolQuestions.length,
      ibo_pool: iboQuestions.length,
      quiz: quizQuestions.length,
      bank: bankObjects,
      logic: logicQuestions.length
    },
    unique_questions: uniqueIds.size,
    manifest_total_questions: Number(manifest.total_questions) || 0,
    cards: cardsTotal,
    wiki_entries: Array.isArray(wiki.entries) ? wiki.entries.length : 0,
    videos: Array.isArray(videos.videos) ? videos.videos.length : 0,
    notes: [
      'unique_questions = 联赛池/IBO 池/quiz/每日联赛 bank/logic 按 bioID 去重后的总数',
      'manifest_total_questions 仅统计 shard（manifest/index/bank）体系的 MTF 题，不等于全站题库'
    ]
  };
}

function writeStats() {
  const stats = computeStats();
  fs.writeFileSync(
    path.join(ROOT, 'data/stats.json'),
    JSON.stringify(stats, null, 2) + '\n',
    'utf8'
  );
  return stats;
}

module.exports = { computeStats, writeStats };

if (require.main === module) {
  const stats = writeStats();
  console.log('[data-stats] 已写入 data/stats.json');
  console.log(
    `  unique_questions=${stats.unique_questions} ` +
    `(league=${stats.question_sources.league_pool}, quiz=${stats.question_sources.quiz}, ` +
    `bank=${stats.question_sources.bank}, logic=${stats.question_sources.logic})`
  );
}
