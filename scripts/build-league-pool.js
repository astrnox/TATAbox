#!/usr/bin/env node
/**
 * TATABOX — 联赛真题池构建器（PR #197 配套）
 * ============================================================
 * 把 resource/cnbo_league/ 下的单题 JSON（3011 道全国中学生生物学联赛真题）
 * 聚合为前端练习页可直读的轻量题池：
 *
 *   resource/all.json   { _meta: {...}, questions: [轻量条目...] }
 *   resource/count.json { live, playable, generated_at }   ← 首页/练习页计数用（~200B）
 *
 * 职责边界（资源层只做数据归一，不碰判卷/统计）：
 *   1. 剔除 voided（作废题）与残缺题（选项 <4 / 标答缺失或歧义）；
 *   2. 标答归一：{A:true,...} → 字母串 'C' / 'ABCD'（single/multiple），
 *      mtf 保留布尔映射供子题展开；
 *   3. concept 补全（考的范围）：卷内内容级 section（如「第一部分：生物化学
 *      分子生物学 细胞生物学」）→ 学科名归一短语；题型级 section（如「一、
 *      单项选择」）→ 用该题所属模块的学科名兜底；
 *   4. 共用题干聚合：group.stimulus（材料题共用背景）拼进题干；
 *   5. multiple / mtf 转 subQuestions 判卷格式（练习页对/错 UI 直接可用），
 *      single 保留 options+字母答案（练习页单选 UI）；
 *   6. 裁剪冗余字段（images[] 与 image 重复、paper.pdf 等）控制体积。
 *
 * 过滤口径与 js/core/utils.js filterLectureStyleQuestion 对齐：
 *   单选项 >600 字剔除、全局 >4000 字剔除（防超长讲义）。
 *
 * 运行：node scripts/build-league-pool.js
 * 校验：node scripts/verify-league-pool.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'resource', 'cnbo_league');
const OUT_ALL = path.join(ROOT, 'resource', 'all.json');
const OUT_COUNT = path.join(ROOT, 'resource', 'count.json');

/** 递归收集目录下所有 .json 文件（不引入 glob 依赖） */
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

/* ============================================================
 * 学科词表（与 js/core/question-model.js SUBJECT_MODULE_KEYS、
 * js/pages/practice.js PracticeModuleGroups 同口径，只增补联赛卷面用词）
 * ============================================================ */
const SUBJECT_WORDS = [
  '生物化学', '分子生物学', '细胞生物学', '微生物学',
  '植物学', '植物生理学', '植物生理', '植物演化', '植物的解剖',
  '动物学', '动物生理学', '生理学', '生态学', '动物行为学',
  '遗传学', '进化生物学', '演化生物学', '生物信息学', '生物系统学'
];

/** 模块 → 兜底学科（题型级 section 或无内容级 section 时用） */
const MODULE_FALLBACK_SUBJECT = {
  module_1: '生物化学',
  module_2: '植物学',
  module_3: '动物学',
  module_4: '遗传学'
};

/** 模块 → 兜底概念（考的范围：无内容级 section 时按卷面部分给出） */
const MODULE_FALLBACK_CONCEPT = {
  module_1: '细胞生物学与生物化学',
  module_2: '植物学与微生物学',
  module_3: '动物学与生态学',
  module_4: '遗传学与进化生物学'
};

const TYPE_WORDS = /选择|判断|填空|每小题|四选一|单选|多选/;

function isTypeLevelSection(sec) {
  return TYPE_WORDS.test(sec);
}

/**
 * 内容级 section → 学科列表（按 SUBJECT_WORDS 顺序收集去重）
 */
function extractSubjects(section) {
  const hit = [];
  for (const w of SUBJECT_WORDS) {
    if (section.indexOf(w) >= 0 && hit.indexOf(w) < 0) hit.push(w);
  }
  return hit;
}

/**
 * 概念（考的范围）的学科词是否与本题 subject 相容。
 * 大类「生物学」与空 subject 视为不限；细粒度概念（酶/神经系统等）无学科词自然相容。
 * 不相容示例：subject=动物学 而 concept 含「植物」（环节动物题被挂到植物学）。
 */
function conceptFitsSubject(concept, subject) {
  const s = String(subject || '');
  if (!s || s === '生物学') return true;
  const c = String(concept || '');
  const sPlant = s.indexOf('植物') >= 0 || s.indexOf('微生物') >= 0;
  const sAnimal = s.indexOf('动物') >= 0 || s.indexOf('生态') >= 0;
  const sGen = s.indexOf('遗传') >= 0 || s.indexOf('进化') >= 0;
  const cPlant = c.indexOf('植物') >= 0;
  const cAnimal = c.indexOf('动物') >= 0;
  const cBasic = c.indexOf('生物化学') >= 0 || c.indexOf('细胞生物学') >= 0;
  if (cPlant && !sPlant) return false;   // 动物/细胞题挂上植物学科词（环节动物题→植物学）
  if (cAnimal && !sAnimal) return false; // 植物/细胞题挂上动物学科词
  if (cBasic && sGen) return false;      // 遗传题被模块兜底成生化/细胞学科词
  if (cBasic && sPlant) return false;    // 植物题被模块兜底成生化/细胞学科词
  if (cBasic && sAnimal) return false;   // 动物题被模块兜底成生化/细胞学科词（解剖生理题）
  return true;
}

/**
 * 混合多学科 section（如「第二部分 植物学、…、无脊椎动物学」）：
 * 优先取与本题 subject 逐字命中（或包含 subject）的学科词
 * （如 subject=动物学 → 「动物学」「无脊椎动物学」），否则回退首词保持既有
 * 行为；残余矛盾由 reconcileConcept 按 subject 学科改写。
 */
function pickSubjectCompatible(subs, subject) {
  const s = String(subject || '');
  if (!s || s === '生物学') return subs[0];
  for (const w of subs) {
    if (w === s || w.indexOf(s) >= 0) return w;
  }
  return subs[0];
}

/**
 * 派生 concept 与 subject 学科互斥时，改写为 subject 对应的学科短语
 * （仅作用于由 section/模块兜底派生的 concept；源文件已填的 concept 视为真源）。
 */
function reconcileConcept(concept, subject, module) {
  if (conceptFitsSubject(concept, subject)) return concept;
  const s = String(subject);
  if (s.indexOf('生态') >= 0) return '生态学';
  if (s.indexOf('动物') >= 0) return '动物学';
  if (s.indexOf('植物') >= 0) return '植物学';
  if (s.indexOf('微生物') >= 0) return '微生物学';
  if (s.indexOf('遗传') >= 0 || s.indexOf('进化') >= 0) return '遗传学与进化生物学';
  if (s.indexOf('细胞') >= 0 || s.indexOf('生物化学') >= 0 || s.indexOf('生化') >= 0 || s.indexOf('分子') >= 0) return '细胞生物学与生物化学';
  return MODULE_FALLBACK_CONCEPT[module] || concept;
}

/**
 * 标答归一：
 *   single   → 第一个 true 的字母；恰 1 个 true 才有效（否则 null）
 *   multiple → 全部 true 的字母串；≥1 才有效
 *   mtf      → {A:true,...} 原样（子题展开用布尔）
 * 返回 { answer, ok }
 */
function normalizeAnswer(type, raw) {
  if (!raw || typeof raw !== 'object') return { answer: null, ok: false };
  const trueKeys = Object.keys(raw).filter((k) => raw[k] === true);
  if (type === 'single') {
    if (trueKeys.length !== 1) return { answer: null, ok: false };
    return { answer: trueKeys[0], ok: true };
  }
  if (type === 'multiple') {
    if (trueKeys.length < 1) return { answer: null, ok: false };
    return { answer: trueKeys.sort().join(''), ok: true };
  }
  // mtf：至少 1 条可判定
  if (trueKeys.length < 1) return { answer: null, ok: false };
  const map = {};
  for (const k of Object.keys(raw)) map[k] = raw[k] === true;
  return { answer: map, ok: true };
}

/** 计入题数的可用题判定（与 filterLectureStyleQuestion 同口径） */
function isPlayable(raw) {
  const opts = raw.options || {};
  const keys = Object.keys(opts);
  if (keys.length < 4) return false;
  const texts = keys.map((k) => String(opts[k]));
  if (texts.some((t) => t.length > 600)) return false;
  const total = String(raw.question || '').length +
    String((raw.group && raw.group.stimulus) || '').length +
    String(raw.explanation || '').length +
    texts.reduce((a, t) => a + t.length, 0);
  return total <= 4000;
}

/**
 * 归一单题 → 轻量条目；返回 null 表示剔除
 */
function normalize(raw) {
  if (!raw || typeof raw !== 'object' || raw.voided === true) return null;
  const type = raw.type;
  if (type !== 'single' && type !== 'multiple' && type !== 'mtf') return null;
  if (!isPlayable(raw)) return null;

  const na = normalizeAnswer(type, raw.answer);
  if (!na.ok) return null;

  const opts = raw.options || {};
  const labels = Object.keys(opts).sort();

  // subject：试卷大类「生物学」保留（判定模块走 q.module 兜底）
  const subject = String(raw.subject || '').trim();

  // concept（考的范围）：内容级 section 提取学科（混合 section 优先取与本题
  // subject 同学科域的词）；题型级/空 → 模块兜底；派生结果再与 subject 做
  // 学科互斥校验（如环节动物题被卷面首词误挂到「植物学」时改回 subject 学科）
  const paper = raw.paper || {};
  const section = String(paper.section || '').trim();
  let concept = String(raw.concept || '').trim();
  const conceptDerived = !concept;
  if (!concept && section && !isTypeLevelSection(section)) {
    const subs = extractSubjects(section);
    if (subs.length > 0) concept = pickSubjectCompatible(subs, subject);
  }
  if (!concept) concept = MODULE_FALLBACK_CONCEPT[raw.module] || '';
  if (conceptDerived) concept = reconcileConcept(concept, subject, raw.module);

  // 标签：按旧题库规范（data/bank/*.json 的 tags 口径）——
  //   [来源key, 模块, 学科, 概念(考的范围), 年份]，类别固定不新增
  const tags = [];
  const pushTag = function (t) {
    if (t && tags.indexOf(String(t)) < 0) tags.push(String(t));
  };
  pushTag('cnbo_league');
  pushTag(raw.module || '');
  pushTag(subject);
  pushTag(concept);
  if (raw.year) pushTag(raw.year);

  // 共用题干（材料题）拼进题干，保证单条可独立作答
  const stimulus = String((raw.group && raw.group.stimulus) || '').trim();
  const question = (stimulus && questionOf(raw).indexOf(stimulus) < 0)
    ? (stimulus + '\n\n' + questionOf(raw))
    : questionOf(raw);

  // multiple / mtf → subQuestions（练习页对/错 UI）；single 保留 options 单选 UI
  const out = {
    id: raw.id,
    type,
    question,
    answer: na.answer,
    answer_key: raw.answer_key || null,
    score: typeof raw.score === 'number' ? raw.score : null,
    module: raw.module || '',
    subject,
    concept,
    tags,
    difficulty: raw.difficulty || 'league',
    target: raw.target || 'competition',
    year: raw.year || null,
    competition: raw.competition || 'CnBO',
    source: raw.source || '',
    explanation: raw.explanation || '',
    has_figure: !!raw.has_figure,
    paper: {
      key: paper.key || null,
      title: paper.title || '',
      event: paper.event || '',
      question_no: paper.question_no == null ? null : paper.question_no
    }
  };

  if (Array.isArray(raw.explanation_tags) && raw.explanation_tags.length > 0) {
    out.explanation_tags = raw.explanation_tags.slice();
  }

  if (type === 'single') {
    out.options = {};
    for (const k of labels) out.options[k] = String(opts[k]);
  } else {
    // multiple / mtf：options 映射字段会触发 QuestionModel.isStandardChoice
    // （options 为对象且 answer 真值 → 判为单选题），导致判卷走单选卷、UI 走
    // 单选分支。因此不输出 options，只输出 subQuestions（对/错子题形态）。
    const sub = [];
    for (const k of labels) {
      sub.push({ label: k, text: String(opts[k]), answer: raw.answer[k] === true });
    }
    out.subQuestions = sub;
  }

  // 图：images[] 与 image 重复，仅留 image（figure-viewer 读 q.image.file）
  if (raw.image && typeof raw.image === 'object' && raw.image.file) {
    const im = raw.image;
    out.image = {
      file: im.file,
      caption: im.caption || '',
      source: im.source || 'paper',
      credit: im.credit || '',
      license: im.license || '',
      page: im.page == null ? null : im.page,
      kind: im.kind || 'raster'
    };
  }

  return out;
}

function questionOf(raw) {
  return String(raw.question || '');
}

/* ============================================================
 * 主流程
 * ============================================================ */

function main() {
  const files = walkJson(SRC_DIR);

  const questions = [];
  const stats = { total: 0, voided: 0, unplayable: 0, noAnswer: 0, kept: 0 };
  const byType = {};

  for (const f of files) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      console.warn('[warn] 解析失败跳过: ' + f + ' — ' + e.message);
      continue;
    }
    stats.total++;
    if (raw.voided === true) { stats.voided++; continue; }
    if (!isPlayable(raw)) { stats.unplayable++; continue; }
    const item = normalize(raw);
    if (!item) { stats.noAnswer++; continue; }
    questions.push(item);
    byType[item.type] = (byType[item.type] || 0) + 1;
    stats.kept++;
  }

  // 题号内稳定排序：年份 → 卷 key → 题号（跨次构建输出一致，diff 干净）
  questions.sort((a, b) =>
    (a.year || 0) - (b.year || 0) ||
    String(a.paper.key || '').localeCompare(String(b.paper.key || '')) ||
    (a.paper.question_no || 0) - (b.paper.question_no || 0));

  const all = {
    _meta: {
      generated_at: new Date().toISOString().slice(0, 10),
      schema_version: 1,
      competition: 'CnBO',
      event: '全国中学生生物学联赛',
      note: '由 scripts/build-league-pool.js 从 resource/cnbo_league/**/*.json 生成；勿手改',
      source_total: stats.total,
      live: stats.total - stats.voided,
      playable: stats.kept
    },
    questions
  };
  fs.writeFileSync(OUT_ALL, JSON.stringify(all), 'utf8');

  const count = {
    live: stats.total - stats.voided,
    playable: stats.kept,
    generated_at: all._meta.generated_at
  };
  fs.writeFileSync(OUT_COUNT, JSON.stringify(count, null, 1) + '\n', 'utf8');

  const size = (fs.statSync(OUT_ALL).size / 1e6).toFixed(2);
  console.log('[league-pool] 扫描 %d，作废 %d，残缺剔除 %d，标答缺失/歧义剔除 %d',
    stats.total, stats.voided, stats.unplayable, stats.noAnswer);
  console.log('[league-pool] 收录 %d（可用题数） 题型分布 %o，all.json %s MB',
    stats.kept, byType, size);
  console.log('[league-pool] 写入 %s', path.relative(ROOT, OUT_ALL));
  console.log('[league-pool] 写入 %s', path.relative(ROOT, OUT_COUNT));
}

main();
