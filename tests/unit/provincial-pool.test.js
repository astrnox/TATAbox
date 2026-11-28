/**
 * @jest-environment jsdom
 *
 * 四川省初赛题池接入验证
 * -------------------------------------------------
 * 验证矩阵：
 *   1. resource/provincial/<year>/ 源题与 resource/provincial.json 一致、ID 唯一；
 *   2. 判卷格式归一：single → options+字母答案；multiple → subQuestions 对错；
 *   3. 来源分类落入「校考/模拟题」（examType=school），不误判为 CnBO/IBO；
 *   4. 练习页 / 离线包 / 管理后台已接入 provincial.json；
 *   5. data/stats.json 把省初赛计入 unique_questions。
 */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const QuestionModel = require(path.join(ROOT, 'js/core/question-model.js'));

const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'resource/provincial.json'), 'utf-8'));
const count = JSON.parse(fs.readFileSync(path.join(ROOT, 'resource/provincial-count.json'), 'utf-8'));
const stats = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stats.json'), 'utf-8'));

function sourceFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) out.push(...sourceFiles(abs));
    else if (name.endsWith('.json')) out.push(abs);
  }
  return out;
}

describe('四川初赛题池数据完整性', () => {
  const files = sourceFiles(path.join(ROOT, 'resource/provincial'));

  test('源题文件数 = 题池题数 = count.playable', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(pool.questions.length).toBe(files.length);
    expect(count.playable).toBe(files.length);
    expect(count.live).toBeGreaterThanOrEqual(count.playable);
  });

  test('ID 唯一且符合 PROV-SC-<year>-<no> 规范', () => {
    const ids = new Set();
    pool.questions.forEach((q) => {
      expect(q.id).toMatch(/^PROV-SC-\d{4}-\d{2}$/);
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);
    });
  });

  test('每题带年份/来源/考试类型，且年份在 2021–2023', () => {
    pool.questions.forEach((q) => {
      expect([2021, 2022, 2023]).toContain(q.year);
      expect(q.competition).toBe('SC-Prelim');
      expect(q.examType).toBe('school');
      expect(q.source).toContain('四川省赛区初赛');
      expect(q.has_figure).toBe(false);
      expect(q.tags).toContain('provincial');
      expect(q.tags).toContain(String(q.year));
    });
  });

  test('判卷格式：single 用 options+字母，multiple 用 subQuestions', () => {
    pool.questions.forEach((q) => {
      expect(['single', 'multiple']).toContain(q.type);
      expect(String(q.answer)).toMatch(/^[A-E]+$/);
      if (q.type === 'single') {
        expect(q.subQuestions).toBeUndefined();
        expect(QuestionModel.isStandardChoice(q)).toBe(true);
        expect(String(q.answer).length).toBe(1);
        expect(Object.keys(q.options).length).toBeGreaterThanOrEqual(4);
      } else {
        expect(q.options).toBeUndefined();
        expect(Array.isArray(q.subQuestions)).toBe(true);
        expect(q.subQuestions.length).toBeGreaterThanOrEqual(4);
        const trueCount = q.subQuestions.filter((s) => s.answer === true).length;
        expect(trueCount).toBe(String(q.answer).length);
      }
    });
  });

  test('来源分类为「校考/模拟题」', () => {
    pool.questions.forEach((q) => {
      expect(QuestionModel.getQuestionSourceKey(q)).toBe('school');
    });
  });
});

describe('省初赛接入点', () => {
  test('练习页加载 provincial.json', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/pages/practice-data.js'), 'utf-8');
    expect(src).toContain('resource/provincial.json');
  });

  test('Service Worker 完整离线包包含 provincial.json', () => {
    const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf-8');
    expect(src).toContain('./resource/provincial.json');
    expect(src).toContain('./resource/provincial-count.json');
  });

  test('管理后台全量题库包含 provincial.json', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/admin/admin-questions.js'), 'utf-8');
    expect(src).toContain('resource/provincial.json');
  });

  test('data/stats.json 计入省初赛且 unique_questions 覆盖', () => {
    expect(stats.question_sources.provincial_pool).toBe(pool.questions.length);
    expect(stats.unique_questions).toBeGreaterThanOrEqual(pool.questions.length);
  });
});
