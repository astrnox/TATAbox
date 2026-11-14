#!/usr/bin/env node
/**
 * 构建首页「每日一题」首屏题面。
 *
 * 从 data/questions 中挑 5 道结构完整的四段判断题（无配图、解析齐全），
 * 渲染成静态 HTML 写进 index.html 的 <!-- build:home-quiz --> 区块。
 * 首屏因此不需要任何请求即可显示题目；日期轮换由前端按天取模完成。
 *
 * 用法：node scripts/build-home-quiz.mjs [--check]
 *   --check  只校验已写入内容是否最新，不修改文件（供 CI 使用）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const QUESTIONS = path.join(ROOT, 'data', 'questions');
const START = '<!-- build:home-quiz:start -->';
const END = '<!-- build:home-quiz:end -->';
const POOL_SIZE = 5;

// 与 js/core/question-model.js 的 TYPE_LABELS / QUIZ_SCORES 保持一致
const TYPE_LABEL = { single: '单选题', multiple: '多选题', judge: '判断题', mtf: '多重判断题' };
const TYPE_SCORE = { single: 3, judge: 3, multiple: 5, mtf: 3 };

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.json')) out.push(full);
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 从整段解析中拆出 A/B/C/D 四段，失败返回 null */
function splitExplanation(text) {
  if (!text) return null;
  const body = String(text).replace(/【思路引导】[\s\S]*$/, '').trim();
  const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const parts = {};
  for (const line of lines) {
    const m = line.match(/^([A-D])[\s.、:：]?([\s\S]*)$/);
    if (!m) continue;
    const label = m[1];
    if (parts[label]) continue;
    parts[label] = m[2].replace(/^【[^】]*】/, '').trim();
  }
  if (!parts.A || !parts.B || !parts.C || !parts.D) return null;
  const hintMatch = String(text).match(/【思路引导】([\s\S]*)$/);
  return { parts, hint: hintMatch ? hintMatch[1].trim() : '' };
}

function loadCandidates() {
  const files = [];
  walk(QUESTIONS, files);
  files.sort();

  const pool = [];
  for (const file of files) {
    let q;
    try {
      q = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (!q || !q.question || !Array.isArray(q.subQuestions) || q.subQuestions.length !== 4) continue;
    if (q.image || q.images || q.figure || q.imageUrl) continue;
    if (String(q.question).length > 260) continue;
    if (!q.subQuestions.every((s) => s && typeof s.answer === 'boolean' && s.text && s.label)) continue;
    const exp = splitExplanation(q.explanation);
    if (!exp) continue;
    const tags = Array.isArray(q.tags) ? q.tags : [];
    const moduleTag = tags.find((t) => /^module_\d+$/.test(t)) || q.subject || 'module_x';
    pool.push({
      id: path.basename(file, '.json'),
      module: moduleTag,
      question: String(q.question),
      subs: q.subQuestions.map((s) => ({ label: s.label, text: String(s.text), answer: s.answer === true })),
      exp: exp.parts,
      hint: exp.hint,
      concept: q.concept || '',
      subject: q.subject || '',
      type: q.type || 'mtf',
      tags: Array.isArray(q.tags) ? q.tags : []
    });
  }
  return pool;
}

/** 每个模块取一道，保证题材分散；不足 5 道时用剩余题目补齐 */
function pickQuestions(pool) {
  const byModule = new Map();
  for (const q of pool) {
    if (!byModule.has(q.module)) byModule.set(q.module, []);
    byModule.get(q.module).push(q);
  }
  const modules = [...byModule.keys()].sort((a, b) => {
    const na = parseInt(String(a).replace(/\D/g, ''), 10);
    const nb = parseInt(String(b).replace(/\D/g, ''), 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a).localeCompare(String(b));
  });

  // 同一模块内按「解析长度适中」优先，避免过短的信息量不足
  const score = (q) => Math.abs(Object.values(q.exp).join('').length - 260);
  for (const m of modules) byModule.get(m).sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));

  const picked = [];
  for (let round = 0; picked.length < POOL_SIZE && round < 20; round++) {
    for (const m of modules) {
      const list = byModule.get(m);
      if (list[round]) picked.push(list[round]);
      if (picked.length >= POOL_SIZE) break;
    }
  }
  return picked.slice(0, POOL_SIZE);
}

function renderQuestion(q, day) {
  const rows = q.subs
    .map(
      (s) => `
        <div class="hq-row" data-label="${esc(s.label)}" data-answer="${s.answer}">
          <span class="hq-label" aria-hidden="true">${esc(s.label)}</span>
          <span class="hq-text">${esc(s.text)}</span>
          <div class="hq-toggle">
            <label class="hq-choice"><input type="radio" name="hq-${day}-${esc(s.label)}" value="true"><span>正确</span></label>
            <label class="hq-choice"><input type="radio" name="hq-${day}-${esc(s.label)}" value="false"><span>错误</span></label>
          </div>
          <p class="hq-exp" hidden>${esc(q.exp[s.label] || '')}</p>
        </div>`
    )
    .join('');

  const nojs = q.subs
    .map(
      (s) => `<li><strong>${esc(s.label)}</strong> ${s.answer ? '正确' : '错误'}：${esc(q.exp[s.label] || '')}</li>`
    )
    .join('');

  const typeLabel = TYPE_LABEL[q.type] || TYPE_LABEL.mtf;
  const typeScore = TYPE_SCORE[q.type] || TYPE_SCORE.mtf;
  // 知识点标签：只保留中文、去掉模块编号，和练习页展示口径一致
  const knowledgeTags = (q.tags || []).filter(
    (t) => typeof t === 'string' && /[\u4e00-\u9fa5]/.test(t) && !/^module_\d+$/.test(t) && t !== q.subject
  ).slice(0, 2);
  const allTags = [q.subject, ...knowledgeTags].filter(Boolean);

  return `
      <article class="hq-question" data-day="${day}" data-qid="${esc(q.id)}" data-subject="${esc(q.subject)}" data-concept="${esc(q.concept)}" data-tags="${esc(allTags.join(','))}"${day === 0 ? '' : ' hidden'}>
        <div class="hq-tags">
          <span class="hq-tag hq-tag-type">【${typeLabel}】</span>
          <span class="hq-tag hq-tag-score">${typeScore} 分</span>
          ${q.subject ? `<span class="hq-tag hq-tag-subject">${esc(q.subject)}</span>` : ''}
          ${knowledgeTags.map((t) => `<span class="hq-tag">${esc(t)}</span>`).join('')}
        </div>
        <p class="hq-concept">${esc(q.concept)}</p>
        <p class="hq-stem">${esc(q.question)}</p>
        <fieldset class="hq-options">
          <legend class="hq-legend">判断以下每条陈述是否正确</legend>${rows}
        </fieldset>
        <div class="hq-submit-row">
          <button type="button" class="hq-submit" disabled>提交答案</button>
          <span class="hq-status" role="status" aria-live="polite">还有 4 条未选</span>
        </div>
        ${q.hint ? `<p class="hq-hint" hidden>思路：${esc(q.hint)}</p>` : ''}
        <details class="hq-nojs">
          <summary>查看答案与解析</summary>
          <ul>${nojs}</ul>
        </details>
      </article>`;
}

function render(picked) {
  const cards = picked.map((q, i) => renderQuestion(q, i)).join('');
  return `${START}${cards}
      ${END}`;
}

function main() {
  const check = process.argv.includes('--check');
  const picked = pickQuestions(loadCandidates());
  if (picked.length < POOL_SIZE) {
    console.error(`[home-quiz] 可用题目不足：${picked.length}/${POOL_SIZE}`);
    process.exit(1);
  }
  const html = fs.readFileSync(INDEX, 'utf8');
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < start) {
    console.error('[home-quiz] index.html 缺少 build:home-quiz 标记');
    process.exit(1);
  }
  const next = html.slice(0, start) + render(picked) + html.slice(end + END.length);
  if (check) {
    if (next !== html) {
      console.error('[home-quiz] 首屏题面不是最新，请运行 npm run build:home-quiz');
      process.exit(1);
    }
    console.log(`[home-quiz] 已是最新：${picked.map((q) => q.id).join(', ')}`);
    return;
  }
  if (next !== html) fs.writeFileSync(INDEX, next);
  console.log(`[home-quiz] 写入 ${picked.length} 道：${picked.map((q) => q.id).join(', ')}`);
}

main();
