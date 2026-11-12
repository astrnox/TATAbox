/**
 * @jest-environment jsdom
 *
 * IBO 真题池接入验证
 * -------------------------------------------------
 * 1. resource/ibo-count.json 与 resource/ibo.json 题数一致
 * 2. 每题中英文齐全（题干 / 子题 / 解析），题型为 mtf、4–5 条陈述
 * 3. 配图文件真实存在，且与 has_figure 一致
 * 4. 与 CnBO 池无重复 id，标签/模块/年份规范
 */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'resource/ibo.json'), 'utf-8'));
const count = JSON.parse(fs.readFileSync(path.join(ROOT, 'resource/ibo-count.json'), 'utf-8'));
const league = JSON.parse(fs.readFileSync(path.join(ROOT, 'resource/all.json'), 'utf-8'));

describe('IBO 真题池数据完整性', () => {
  test('ibo-count.json 与 ibo.json 题数一致且非空', () => {
    expect(pool.questions.length).toBe(count.playable);
    expect(count.playable).toBeGreaterThan(0);
    expect(count.live).toBeGreaterThanOrEqual(count.playable);
  });

  test('每题都有英文题干与中文翻译', () => {
    pool.questions.forEach((q) => {
      expect(q.competition).toBe('IBO');
      expect(q.type).toBe('mtf');
      expect(typeof q.question).toBe('string');
      expect(q.question.length).toBeGreaterThan(20);
      expect(typeof q.question_zh).toBe('string');
      expect(q.question_zh.length).toBeGreaterThan(10);
      expect(typeof q.explanation).toBe('string');
      expect(q.explanation.length).toBeGreaterThan(30);
      expect(q.source).toContain('IBO');
      expect(q.license).toBe('CC BY-NC-SA 4.0');
    });
  });

  test('子题 4–5 条，标签连续，中英文与布尔答案齐全', () => {
    const labels = ['A', 'B', 'C', 'D', 'E'];
    pool.questions.forEach((q) => {
      expect(q.subQuestions.length).toBeGreaterThanOrEqual(4);
      expect(q.subQuestions.length).toBeLessThanOrEqual(5);
      q.subQuestions.forEach((s, i) => {
        expect(s.label).toBe(labels[i]);
        expect(s.text.length).toBeGreaterThan(5);
        expect(s.text_zh.length).toBeGreaterThan(3);
        expect(typeof s.answer).toBe('boolean');
      });
    });
  });

  test('配图文件存在，has_figure 与 images 一致', () => {
    pool.questions.forEach((q) => {
      const imgs = q.images || [];
      if (q.has_figure) expect(imgs.length).toBeGreaterThan(0);
      if (imgs.length > 0) expect(q.has_figure).toBe(true);
      imgs.forEach((im) => {
        expect(fs.existsSync(path.join(ROOT, im.file))).toBe(true);
        expect(im.caption).toBeTruthy();
        expect(im.caption_zh).toBeTruthy();
      });
    });
  });

  test('id 唯一且不与 CnBO 池重复', () => {
    const ids = new Set();
    const leagueIds = new Set(league.questions.map((q) => q.id));
    pool.questions.forEach((q) => {
      expect(ids.has(q.id)).toBe(false);
      expect(leagueIds.has(q.id)).toBe(false);
      ids.add(q.id);
    });
  });

  test('模块/年份/标签规范', () => {
    const MODULES = new Set(['module_1', 'module_2', 'module_3', 'module_4']);
    pool.questions.forEach((q) => {
      expect(MODULES.has(q.module)).toBe(true);
      expect(Number.isInteger(q.year)).toBe(true);
      expect(q.tags[0]).toBe('ibo');
      expect(q.tags).toContain(q.module);
      expect(q.tags.map(String)).toContain(String(q.year));
    });
  });

  test('表格中英文结构一致（切换语言不错位）', () => {
    pool.questions.forEach((q) => {
      if (!q.tables) return;
      expect(Array.isArray(q.tables_zh)).toBe(true);
      expect(q.tables.length).toBe(q.tables_zh.length);
      q.tables.forEach((t, i) => {
        expect(t.head.length).toBe(q.tables_zh[i].head.length);
        expect(t.rows.length).toBe(q.tables_zh[i].rows.length);
        t.rows.forEach((r, j) => {
          expect(r.length).toBe(q.tables_zh[i].rows[j].length);
        });
      });
    });
  });
});
