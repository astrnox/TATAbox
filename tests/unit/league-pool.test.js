/**
 * @jest-environment jsdom
 *
 * 联赛真题池接入验证（练习页题库总量 + 标签规范）
 * -------------------------------------------------
 * 验证矩阵：
 *   1. resource/count.json 与 resource/all.json 可用题数一致，且被
 *      getPlayableQuestionCount 计入（首页/练习页「题库总量」不再停在 141/101）
 *   2. 联赛题标签按旧题库规范：[来源key, 模块, 学科, 概念, 年份]，
 *      不新增标签类别；每题都有年份/考试来源字段
 *   3. QuestionModel.getStatModuleKey 对 subject='生物学'（未收录大类）
 *      按 q.module 兜底，统计键不落 general
 *   4. 联赛题判卷格式归一：single → options+字母答案；multiple/mtf → subQuestions
 */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const QuestionModel = require(path.join(ROOT, 'js/core/question-model.js'));

const count = JSON.parse(fs.readFileSync(path.join(ROOT, 'resource/count.json'), 'utf-8'));
const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'resource/all.json'), 'utf-8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/manifest.json'), 'utf-8'));
const logic = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/logic_questions.json'), 'utf-8'));

const logicCount = (Array.isArray(logic) ? logic : (logic['题库'] || logic.questions || [])).length;

describe('联赛真题池数据完整性', () => {
  test('count.json 的 playable 与 all.json 实际题数一致', () => {
    expect(pool.questions.length).toBe(count.playable);
    expect(count.playable).toBeGreaterThan(0);
    expect(count.live).toBeGreaterThanOrEqual(count.playable);
  });

  test('每题都有年份 + 考试来源 + 考的范围（concept）', () => {
    pool.questions.forEach((q) => {
      expect(q.year).toBeTruthy();
      expect(String(q.year)).toMatch(/^\d{4}$/);
      expect(q.source || q.competition).toBeTruthy();
      expect(q.concept).toBeTruthy();
    });
  });

  test('标签按旧题库规范：[来源key, 模块, 学科, 概念, 年份]，不新增类别', () => {
    const ALLOWED_TAG_KEYS = new Set(['cnbo_league']);
    const ALLOWED_MODULES = new Set(['module_1', 'module_2', 'module_3', 'module_4']);
    pool.questions.forEach((q) => {
      expect(Array.isArray(q.tags)).toBe(true);
      expect(q.tags.length).toBeGreaterThanOrEqual(3);
      // 来源 key 与模块固定在前
      expect(q.tags[0]).toBe('cnbo_league');
      if (q.module) expect(ALLOWED_TAG_KEYS.has(q.tags[1]) || ALLOWED_MODULES.has(q.tags[1])).toBe(true);
      // tags 内不出现标签类别之外的新词（年份为数字，学科/概念为已有词）
      q.tags.forEach((t) => {
        const isYear = /^\d{4}$/.test(String(t));
        const isKey = ALLOWED_TAG_KEYS.has(t) || ALLOWED_MODULES.has(t);
        expect(isYear || isKey || t === q.subject || t === q.concept).toBe(true);
      });
      // 年份必须入 tags（哪一年的考试）
      expect(q.tags.map(String)).toContain(String(q.year));
    });
  });

  test('判卷格式归一：single 走 options+字母，multiple/mtf 走 subQuestions', () => {
    pool.questions.forEach((q) => {
      if (q.type === 'single') {
        expect(QuestionModel.isStandardChoice(q)).toBe(true);
        expect(Object.keys(q.options).length).toBeGreaterThanOrEqual(4);
        expect(q.subQuestions).toBeUndefined();
        expect(String(q.answer)).toMatch(/^[A-F]+$/);
      } else {
        // multiple / mtf：不得输出 options（否则被判为单选卷）
        expect(q.options).toBeUndefined();
        expect(Array.isArray(q.subQuestions)).toBe(true);
        expect(q.subQuestions.length).toBeGreaterThanOrEqual(4);
        q.subQuestions.forEach((sq) => expect(typeof sq.answer).toBe('boolean'));
      }
    });
  });
});

describe('题库总量计数（getPlayableQuestionCount 计入联赛题）', () => {
  test('本地口径 = manifest 模块题 + 逻辑题 + 联赛可用题', () => {
    // 与 loader.js getPlayableQuestionCount 同口径
    const total = manifest.total_questions + logicCount + count.playable;
    expect(total).toBe(manifest.total_questions + logicCount + pool.questions.length);
    expect(total).toBeGreaterThan(manifest.total_questions + logicCount);
  });

  test('loader.js 已接入 resource/count.json', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/core/loader.js'), 'utf-8');
    expect(src).toContain('resource/count.json');
    expect(src).toContain('r[1] + r[2]');
  });
});

describe('getStatModuleKey：联赛 subject 大类按 q.module 兜底', () => {
  test('未收录科目「生物学」+ module_3 → module_3（不落 general）', () => {
    expect(QuestionModel.getStatModuleKey({ subject: '生物学', module: 'module_3' })).toBe('module_3');
    expect(QuestionModel.getStatModuleKey({ subject: '生物学', module: 'module_1' })).toBe('module_1');
  });

  test('已收录科目仍走权威映射，q.module 不越权', () => {
    expect(QuestionModel.getStatModuleKey({ subject: '遗传学', module: 'module_1' })).toBe('module_4');
    expect(QuestionModel.getStatModuleKey('生态学')).toBe('module_3');
  });

  test('无 subject 也无 module → general；脏 module 不兜底', () => {
    expect(QuestionModel.getStatModuleKey({ subject: '生物学' })).toBe('general');
    expect(QuestionModel.getStatModuleKey({ subject: '未知学科', module: 'module_9' })).toBe('general');
  });

  test('全量联赛题统计键不为 general（模块卡归组正确）', () => {
    const bad = pool.questions.filter((q) =>
      QuestionModel.getStatModuleKey(q) === 'general');
    expect(bad.length).toBe(0);
  });
});

describe('练习页标签栏：年份 / 考试来源 tag 渲染', () => {
  /* 从 practice.js 源码截取 _renderExamSourceTag 真实实现 */
  function loadRenderExamSourceTag() {
    const src = fs.readFileSync(path.join(ROOT, 'js/pages/practice.js'), 'utf-8');
    const m = src.match(/(function\s+_renderExamSourceTag[\s\S]*?^})/m);
    if (!m) throw new Error('未找到 _renderExamSourceTag');
    const body = m[1] + '\n;return _renderExamSourceTag;';
    return new Function('escapeHtml', body)(function (s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    });
  }

  const render = loadRenderExamSourceTag();

  test('联赛题：显示考试来源（截到「第 N 题」前）+ 完整信息放 title', () => {
    const q = pool.questions[0];
    const html = render(q);
    expect(html).toContain('tag tag--outline');
    expect(html).toContain('全国中学生生物学联赛');
    expect(html).toContain('title=');
    expect(html).toContain(String(q.year));
    // 不把题号带进短标签
    expect(html.indexOf('第 1 题') === -1 || html.indexOf('title') < html.indexOf('第 1 题')).toBe(true);
  });

  test('无 source 但有 competition → competition 真题', () => {
    expect(render({ competition: 'CnBO' })).toContain('CnBO 真题');
  });

  test('旧题库题（无 year/source/competition）→ 空串，不新增标签', () => {
    expect(render({ subject: '遗传学', concept: '自由组合' })).toBe('');
    expect(render(null)).toBe('');
  });

  test('标签栏模板含年份与来源 tag 插槽（renderQuiz）', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/pages/practice.js'), 'utf-8');
    expect(src).toMatch(/q\.year \? '<span class="tag tag--outline">/);
    expect(src).toContain('${_renderExamSourceTag(q)}');
  });
});
