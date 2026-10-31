#!/usr/bin/env node
/**
 * TATABOX — 题库重建生成器（Issue #10）
 * ============================================================
 * 将散落题库重建为「按考点分类」的三层分片架构：
 *   - data/manifest.json           { rev, updated_at, total, topics, sources, files:{path:sha256} }
 *   - data/index/<topic>.json      极小的题目索引 { bioID: {tags,diff,len,src,year,module} }
 *   - data/bank/<topic>.json       完整题目内容 { bioID: question }
 *   - data/bioid-map.json          oldId -> bioID 迁移映射表
 *   - data/knowledge-graph.json    知识图谱（由 scripts/bio-topic-schema.js 单一数据源生成）
 *
 * 考点分类（tag）来源：scripts/bio-topic-schema.js 的 TOPICS（80 个考点、13 学科）。
 * 每道题经「concept/subject/题干 关键词评分」确定性归入唯一考点 → 分片互斥、全覆盖。
 *
 * bioID 格式：BQ-<topic>-<12位十六进制>
 *   - topic 前缀仅用于分片归属（= 知识图谱考点 id）
 *   - 12 位标识 = sha256(canonKey) 截断（内容寻址），保证「唯一且稳定」：
 *     同一题目在内容不变时永远得到同一 bioID；它是题目的纯函数，
 *     与其它题目是否存在 / 新增 / 删除 / 排序完全无关 → 天然抗漂移。
 *     12 位十六进制 = 48 bit 空间，单 topic 需约 2400 万题才出现首个期望碰撞。
 *
 * 运行：node scripts/generate-bio-shards.js
 * 校验：node scripts/verify-bio-shards.js（CI 使用）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

/* ============================================================
 * Issue #15：CDN 版本锚点
 * manifest 写入 git（生成时的 HEAD commit SHA）与 repo（origin 仓库 slug），
 * 前端据此构造 https://cdn.jsdelivr.net/gh/<repo>@<git>/data/... 版本化长缓存 URL。
 * 注意：manifest.json 不参与 CI「分片确定性」哈希比对，新增字段不影响 CI。
 *
 * 锚点一致性（PR #25 教训）：自动探测读的是「当前 clone」的 origin/HEAD，
 * 在贡献者 fork 里跑会把锚点写成 fork 仓库（上游部署时 CDN 全部指向 fork，
 * jsDelivr 404 后静默回退同源，版本化分发失效）。
 *   - 在 fork 中生成、准备合入上游时，必须显式指定：
 *       node scripts/generate-bio-shards.js --repo=astrnox/TATAbox --git=<上游存在的 commit>
 *   - 合并到上游后由维护者在 main 重跑生成器（自动探测即正确）。
 * 校验：node scripts/verify-manifest-anchor.js（已挂 CI 与 npm test）
 * ============================================================ */

/** 解析 --repo=<slug> / --git=<sha> 覆盖参数（优先于自动探测）。 */
function anchorOverrides() {
  const out = { repo: null, git: null };
  for (const arg of process.argv.slice(2)) {
    let m = /^--repo=(.+)$/.exec(arg);
    if (m) out.repo = m[1].trim();
    m = /^--git=(.+)$/.exec(arg);
    if (m) out.git = m[1].trim().replace(/[^0-9a-f]/gi, '');
  }
  return out;
}

function gitHeadSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim().replace(/[^0-9a-f]/g, '') || null;
  } catch (e) { return null; }
}

function originRepoSlug() {
  try {
    const url = execSync('git remote get-url origin', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    // ssh: git@github.com:owner/repo.git  |  https://github.com/owner/repo.git
    const m = url.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\s*$/i);
    if (!m) return null;
    const slug = (m[1] + '/' + m[2]).replace(/\.git$/, '');
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(slug) ? slug : null;
  } catch (e) { return null; }
}

/**
 * 解析最终锚点：CLI 覆盖 > 自动探测。
 * 未显式覆盖时打印提示（fork 生成的锚点对上游部署无效，见上方说明）。
 */
function resolveAnchors() {
  const ov = anchorOverrides();
  const repo = ov.repo || originRepoSlug();
  const git = ov.git || gitHeadSha();
  const notes = [];
  if (!ov.repo && repo) {
    notes.push('[warn] 锚点 repo=' + repo + ' 自动探测自当前 origin；若在 fork 中为上游生成，请加 --repo=<owner>/<repo>');
  }
  if (!ov.git && git) {
    notes.push('[warn] 锚点 git=' + git.slice(0, 12) + ' 取自当前 HEAD；后续提交会使 SHA 前移，合并到上游后请在 main 重跑生成器');
  }
  return { repo, git, notes };
}

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const INDEX_DIR = path.join(DATA_DIR, 'index');
const BANK_DIR = path.join(DATA_DIR, 'bank');

const { CATEGORIES, TOPICS, EDGES, validateSchema } = require('./bio-topic-schema');

/* ============================================================
 * bioID / 指纹工具
 * ============================================================ */

/**
 * 与 js/core/storage.js 完全一致的旧 ID 生成算法（Java String.hashCode 风格 32 位）。
 * 旧题库无 id 时前端用 hashQuestionId(question + concept) 作为题目 ID，
 * 迁移映射表必须能复算出该旧 ID，才能把旧 progress/错题映射到 bioID。
 */
function hashQuestionId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // 32-bit
  }
  return String(Math.abs(hash));
}

/**
 * 计算题目规范内容指纹（用于全局去重）
 */
function canonKey(q) {
  let opts = '';
  if (Array.isArray(q.subQuestions)) {
    opts = JSON.stringify(q.subQuestions.map((s) => [s.label, s.text, !!s.answer]));
  }
  return (q.question || '') + '\u0000' + opts;
}

/**
 * 计算题目旧 ID（供映射表用）
 * 规则：源题自带稳定 id（如 crawled_* 服务器 id）→ 直接用；
 *       否则复算 hashQuestionId(question + concept)。
 */
function oldIdFor(q, rawId) {
  if (rawId !== undefined && rawId !== null && rawId !== '') return String(rawId);
  return hashQuestionId(String(q.question || '') + String(q.concept || ''));
}

/**
 * 内容寻址的 bioID 序号（12 位小写十六进制 = 48 bit）。
 */
function contentSeq(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
}

/* ============================================================
 * 考点分类（concept / subject / 题干 关键词评分）
 * ============================================================ */

// 学科别名 -> 规范学科（覆盖题库中全部 subject 写法，含复合学科取首段）
const SUBJECT_ALIAS = {
  '细胞生物学': '细胞生物学', '植物学': '植物学', '植物生理学': '植物生理学',
  '动物学': '动物学', '动物生理学': '动物生理学', '遗传学': '遗传学',
  '演化生物学': '演化生物学', '进化生物学': '演化生物学', '生态学': '生态学',
  '微生物学': '微生物学', '生物化学': '生物化学', '分子生物学': '分子生物学',
  '生物信息学': '生物信息学', '生物技术': '生物技术',
  '发育生物学': '细胞生物学', '基因组学': '生物信息学', '神经科学': '动物生理学',
  '群体遗传学': '演化生物学', '群体遗传学与进化生物学': '演化生物学',
  '进化生物学与群体遗传学': '演化生物学', '进化生物学与遗传学': '演化生物学',
  '动物生态学': '生态学', '动物行为学与生态学': '生态学',
  '动物生理学与生态学': '动物生理学', '动物生理学与行为学': '动物生理学',
  '动物生理学与进化生物学': '动物生理学', '动物学与动物生理学': '动物学',
  '生物化学与细胞生物学': '生物化学', '细胞生物学与生物化学': '细胞生物学',
  '植物学与细胞生物学': '植物学', '植物生理学与细胞生物学': '植物生理学',
  '神经生物学': '动物生理学',
  '生理学': '动物生理学', '实验设计': '细胞生物学'
};

const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
const TOPIC_BY_CATEGORY = {};
for (const t of TOPICS) {
  (TOPIC_BY_CATEGORY[t.category] = TOPIC_BY_CATEGORY[t.category] || []).push(t);
}

function normalizeSubject(subj) {
  if (!subj) return '';
  const s = String(subj).trim();
  if (SUBJECT_ALIAS[s]) return SUBJECT_ALIAS[s];
  // 复合学科："A 与 B" / "A、B" 取第一个可识别学科
  const first = s.split(/[与、和及]/)[0].trim();
  return SUBJECT_ALIAS[first] || '';
}

/**
 * 计算考点关键词命中得分。
 * @param {Object} t 考点
 * @param {Object} q 题目
 * @returns {number}
 */
function topicScore(t, q) {
  let score = 0;
  const concept = String(q.concept || '');
  const subject = String(q.subject || '');
  const question = String(q.question || '');
  for (const kw of t.keywords) {
    if (concept && concept.indexOf(kw) !== -1) score += 3;
    else if (subject && subject.indexOf(kw) !== -1) score += 2;
    else if (question && question.indexOf(kw) !== -1) score += 1;
  }
  return score;
}

/**
 * 确定性归类：将题目归入唯一考点（分片互斥、全覆盖）。
 * 策略（优先级从高到低）：
 *   1. 该题 subject 所属学科内的考点，取关键词得分最高者（>0）；
 *   2. 全考点得分最高者（>0）；
 *   3. 学科兜底：该学科第一个考点；
 *   4. 全局兜底：第一个考点。
 */
function classifyTopic(q) {
  const ns = normalizeSubject(q.subject);
  let best = null;
  let bestScore = 0;

  const consider = (t) => {
    const sc = topicScore(t, q);
    if (sc > bestScore) { bestScore = sc; best = t; }
  };

  if (ns && TOPIC_BY_CATEGORY[ns]) {
    for (const t of TOPIC_BY_CATEGORY[ns]) consider(t);
  }
  if (!best || bestScore === 0) {
    // 学科内无命中 → 全考点评分
    for (const t of TOPICS) consider(t);
  }
  if (!best || bestScore === 0) {
    // 兜底：学科第一个考点；无学科则全局第一
    if (ns && TOPIC_BY_CATEGORY[ns] && TOPIC_BY_CATEGORY[ns][0]) return TOPIC_BY_CATEGORY[ns][0];
    return TOPICS[0];
  }
  return best;
}

/* ============================================================
 * 源数据装配
 * ============================================================ */

// 源文件（优先顺序即去重优先级；quiz_m* 拥有最高优先级）
const SOURCES = [
  { file: 'data/quiz_m1.json' },
  { file: 'data/quiz_m2.json' },
  { file: 'data/quiz_m3.json' },
  { file: 'data/quiz_m4.json' },
  { file: 'data/quiz.json' },
  { file: 'data/logic_questions.json' },
  { file: 'data/legacy/crawled_competition.json' },
  { file: 'data/legacy/questions.json' }
];

/**
 * 读取源文件题目数组（兼容数组 / {题库|questions|data} 三种形态）
 */
function loadRaw(file) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    console.warn('[warn] 源文件缺失，跳过: ' + file);
    return [];
  }
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.题库)) return raw.题库;
  if (Array.isArray(raw.questions)) return raw.questions;
  if (Array.isArray(raw.data)) return raw.data;
  return [];
}

/**
 * 规范化题目到统一前端格式。
 * 兼容 server.py 格式（stem/options/answer/analysis）与前端格式（question/subQuestions）。
 * 保留源数据里的 id 供映射表使用。
 */
function normalizeQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // 隔离/污染标记直接排除（与 loader._filterQuarantinedQuestions 一致）
  if (raw._needs_review === true || raw._unverified === true || raw._quarantined === true) return null;

  const q = { ...raw };
  const rawId = q.id;

  // server.py 格式 -> 前端 MTF 格式
  if (q.stem && q.options) {
    const labels = Object.keys(q.options).sort();
    const isMultiJudge = (typeof q.answer === 'object' && q.answer !== null);
    q.type = q.type || (isMultiJudge ? 'multi_judge' : 'mtf');
    q.question = q.stem;
    q.subQuestions = labels.map((label) => ({
      label,
      text: q.options[label],
      answer: isMultiJudge ? (q.answer[label] === true) : (q.answer === label)
    }));
    q.explanation = q.analysis || q.explanation || '';
    q.subject = q.subject || (Array.isArray(q.knowledge) ? q.knowledge[0] : '') || '';
    q.concept = q.concept || (Array.isArray(q.knowledge) ? q.knowledge[1] : '') || '';
    q.difficulty = q.difficulty || 'medium';
    q.tags = Array.isArray(q.tags) ? q.tags : [];
    q.chart = q.chart || null;
    q.year = q.year || null;
  }

  // 统一字段默认值
  q.id = undefined; // 迁移映射使用 bioID，源 id 单独存 oldId
  q.oldId = oldIdFor(q, rawId);
  q.module = q.module || '';
  q.subQuestions = Array.isArray(q.subQuestions) ? q.subQuestions : [];
  q.tags = Array.isArray(q.tags) ? q.tags : [];
  if (!q.subject) q.subject = '';
  if (!q.concept) q.concept = '';
  if (!q.difficulty) q.difficulty = 'medium';
  if (q.chart === undefined) q.chart = null;
  if (q.year === undefined) q.year = null;
  if (!q.type) q.type = (Array.isArray(q.subQuestions) && q.subQuestions.length > 0) ? 'multi_judge' : 'mtf';
  return q;
}

/* ============================================================
 * 输出
 * ============================================================ */

function sha256(absPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

/* ============================================================
 * 主流程
 * ============================================================ */

function main() {
  validateSchema();

  const seen = new Map();    // canonKey -> bioID
  const topicQuestions = {}; // topicId -> [ {bioID, q} ]
  const oldIdCandidates = {};// oldId -> [bioID...]（同 oldId 可能对应多道变体题）
  const classifyStat = {};   // topicId -> 归类方式计数（学科命中/兜底）
  let assigned = 0;
  let dropped = 0;
  let subjectFallback = 0;   // 完全靠兜底归类的题（关键词未命中任何考点）

  for (const src of SOURCES) {
    const rawItems = loadRaw(src.file);
    const collected = [];    // {q, key, oldId, topic}
    const localSeen = new Set();
    for (const raw of rawItems) {
      const q = normalizeQuestion(raw);
      if (!q) continue;
      const key = canonKey(q);
      if (seen.has(key) || localSeen.has(key)) {
        const bioId = seen.get(key);
        (oldIdCandidates[q.oldId] = oldIdCandidates[q.oldId] || []).push(bioId);
        dropped++;
        continue;
      }
      localSeen.add(key);
      collected.push({ q, key, oldId: q.oldId });
    }
    collected.sort((a, b) => a.key.localeCompare(b.key));
    for (const entry of collected) {
      const topic = classifyTopic(entry.q);
      const bioId = 'BQ-' + topic.id + '-' + contentSeq(entry.key);
      seen.set(entry.key, bioId);
      (oldIdCandidates[entry.oldId] = oldIdCandidates[entry.oldId] || []).push(bioId);
      (topicQuestions[topic.id] = topicQuestions[topic.id] || []).push({ bioId, q: entry.q });
      classifyStat[topic.id] = classifyStat[topic.id] || { assigned: 0, fallback: 0 };
      classifyStat[topic.id].assigned++;
      const ns = normalizeSubject(entry.q.subject);
      const inCat = ns && TOPIC_BY_CATEGORY[ns] && TOPIC_BY_CATEGORY[ns].some((t) => t.id === topic.id);
      if (topicScore(topic, entry.q) === 0 || !inCat) {
        classifyStat[topic.id].fallback++;
        subjectFallback++;
      }
      assigned++;
    }
    console.log(`[${src.file}] 读入 ${rawItems.length}，收录 ${collected.length}，去重 ${rawItems.length - collected.length}`);
  }

  const allBio = [];
  for (const t of Object.keys(topicQuestions)) allBio.push(...topicQuestions[t].map((e) => e.bioId));
  const bioSet = new Set(allBio);
  if (bioSet.size !== allBio.length) {
    console.error('[FATAL] bioID 不唯一！' + (allBio.length - bioSet.size) + ' 个重复');
    process.exit(1);
  }

  const bioIdMap = {};
  for (const oldId of Object.keys(oldIdCandidates)) {
    const cands = oldIdCandidates[oldId].slice().sort();
    bioIdMap[oldId] = cands[0];
  }
  const sharedOldIds = Object.keys(oldIdCandidates).filter((k) => oldIdCandidates[k].length > 1);

  console.log(`[total] 收录 ${assigned} 道，去重 ${dropped} 道，考点=${Object.keys(topicQuestions).length}，关键词兜底 ${subjectFallback} 道`);

  const emptyTopics = TOPICS.filter((t) => !topicQuestions[t.id] || topicQuestions[t.id].length === 0);
  if (emptyTopics.length) {
    console.error('[FATAL] 存在空考点（无题目可归，关键词需补充）: ' + emptyTopics.map((t) => t.id).join(', '));
    process.exit(1);
  }

  fs.mkdirSync(INDEX_DIR, { recursive: true });
  fs.mkdirSync(BANK_DIR, { recursive: true });

  for (const topic of TOPICS) {
    const entries = topicQuestions[topic.id];
    const indexObj = {};
    const bankObj = {};
    for (const { bioId, q } of entries) {
      indexObj[bioId] = {
        tags: [topic.id].concat(q.tags.filter((tg) => tg !== topic.id)),
        diff: q.difficulty || 'medium',
        len: String(q.question || '').length,
        src: topic.id,
        year: q.year || null,
        module: q.module || topic.relatedModule
      };
      bankObj[bioId] = q;
    }
    const indexPath = path.join(INDEX_DIR, topic.id + '.json');
    const bankPath = path.join(BANK_DIR, topic.id + '.json');
    fs.writeFileSync(indexPath, JSON.stringify(indexObj, null, 1) + '\n', 'utf8');
    fs.writeFileSync(bankPath, JSON.stringify(bankObj, null, 1) + '\n', 'utf8');
  }

  const kg = {
    version: '3.0.0',
    updated_at: new Date().toISOString().slice(0, 10),
    categories: CATEGORIES.map((c) => ({ name: c, count: TOPICS.filter((t) => t.category === c).length })),
    nodes: TOPICS.map((t) => ({
      id: t.id, label: t.label, category: t.category,
      description: t.description, relatedModule: t.relatedModule,
      questionCount: (topicQuestions[t.id] || []).length
    })),
    edges: EDGES.map((e) => ({ source: e[0], target: e[1] }))
  };
  const kgPath = path.join(DATA_DIR, 'knowledge-graph.json');
  fs.writeFileSync(kgPath, JSON.stringify(kg, null, 2) + '\n', 'utf8');

  const mapPath = path.join(DATA_DIR, 'bioid-map.json');
  fs.writeFileSync(mapPath, JSON.stringify(bioIdMap, null, 1) + '\n', 'utf8');

  const files = {};
  for (const t of TOPICS) {
    files['index/' + t.id + '.json'] = sha256(path.join(INDEX_DIR, t.id + '.json'));
    files['bank/' + t.id + '.json'] = sha256(path.join(BANK_DIR, t.id + '.json'));
  }
  files['bioid-map.json'] = sha256(mapPath);
  files['knowledge-graph.json'] = sha256(kgPath);

  // 模块 -> 考点 tag 列表（module1~4，供 loader 按模块拉取对应分片）
  const modules = {};
  for (let mi = 1; mi <= 4; mi++) {
    modules['module' + mi] = TOPICS.filter((t) => t.relatedModule === 'module' + mi && topicQuestions[t.id] && topicQuestions[t.id].length > 0).map((t) => t.id);
  }

  // Issue #15：CDN 版本锚点（jsDelivr 版本化 URL = 长缓存 + 精确版本控制）
  // CLI --repo/--git 覆盖 > 自动探测（HEAD/origin）；fork 环境务必显式覆盖，见文件头说明
  const anchors = resolveAnchors();
  const manifest = {
    rev: 2,
    updated_at: new Date().toISOString().slice(0, 10),
    git: anchors.git,
    repo: anchors.repo,
    // H-05：仓库快照 ~253MB > jsDelivr 50MB 包限制，默认关闭 CDN 兜底，
    // 只用「同源 + IndexedDB」；拆分独立题库仓后可改为 true。
    cdn: false,
    total_questions: assigned,
    topics: TOPICS.map((t) => ({
      id: t.id, label: t.label, category: t.category,
      relatedModule: t.relatedModule,
      count: (topicQuestions[t.id] || []).length
    })),
    // sources 保持 {tag,count} 形态，loader 按 tag 拉取对应分片
    sources: TOPICS.filter((t) => topicQuestions[t.id] && topicQuestions[t.id].length > 0).map((t) => ({
      tag: t.id, count: topicQuestions[t.id].length
    })),
    modules,
    files
  };
  const manifestPath = path.join(DATA_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log('[write] data/manifest.json');
  console.log('[anchor] git=' + (anchors.git || 'null') + ' repo=' + (anchors.repo || 'null'));
  for (const note of anchors.notes) console.log(note);
  console.log('[write] data/bioid-map.json (' + Object.keys(bioIdMap).length + ' 条映射)');
  console.log('[write] data/knowledge-graph.json (' + TOPICS.length + ' 节点 / ' + EDGES.length + ' 边 / ' + CATEGORIES.length + ' 学科)');
  console.log('[write] index/*.json ' + TOPICS.length + ' 个, bank/*.json ' + TOPICS.length + ' 个');
  if (subjectFallback) {
    console.log('[warn] ' + subjectFallback + ' 道题靠关键词兜底归类（subject 学科内无关键词命中）');
  }
  console.log('[done] 题库重建完成');
}

main();
