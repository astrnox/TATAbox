/**
 * @jest-environment jsdom
 *
 * 题目评分 / 投票 / 回收站 / 管理员覆盖 存储逻辑单元测试
 * -------------------------------------------------------
 * 覆盖 js/core/storage.js 中 QUESTION_* 系列存储键对应函数：
 *   1. rateQuestion：点赞/点踩/切换/取消，聚合与「我的投票」一致
 *   2. getQuestionRating / getMyVoteForQuestion：读回正确
 *   3. setQuestionRating：管理员重新评分
 *   4. recycleQuestion / restoreQuestion / isQuestionRecycled：回收站流转
 *   5. saveQuestionOverride / applyQuestionOverride：管理员覆盖修改在出卷时生效
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/core/storage.js'), 'utf8');

beforeAll(() => {
  // 与浏览器 <script> 加载语义一致：注入全局作用域
  // eslint-disable-next-line no-eval
  (0, eval)(SRC);
  window.resolveQuestionBioId = (q) => (q && q.bioId) || q || '';
  window.getQuestionBioId = window.resolveQuestionBioId;
});

beforeEach(() => {
  localStorage.clear();
});

const q = { bioId: 'q-local-0001' };

describe('rateQuestion（点赞/点踩/切换/取消）', () => {
  test('点赞一次 → up=1, myVote=1', () => {
    const r = window.rateQuestion(q, 1);
    expect(r).toEqual({ up: 1, down: 0, myVote: 1 });
    expect(window.getQuestionRating(q)).toEqual({ up: 1, down: 0 });
    expect(window.getMyVoteForQuestion(q)).toBe(1);
  });

  test('点踩一次 → down=1, myVote=-1', () => {
    window.rateQuestion(q, -1);
    expect(window.getQuestionRating(q)).toEqual({ up: 0, down: 1 });
    expect(window.getMyVoteForQuestion(q)).toBe(-1);
  });

  test('重复点赞只计一票（幂等）', () => {
    window.rateQuestion(q, 1);
    window.rateQuestion(q, 1);
    expect(window.getQuestionRating(q)).toEqual({ up: 1, down: 0 });
  });

  test('从赞切换到踩：赞取消、踩生效', () => {
    window.rateQuestion(q, 1);
    window.rateQuestion(q, -1);
    expect(window.getQuestionRating(q)).toEqual({ up: 0, down: 1 });
    expect(window.getMyVoteForQuestion(q)).toBe(-1);
  });

  test('取消投票（vote=0）→ 聚合归零且记录删除', () => {
    window.rateQuestion(q, 1);
    window.rateQuestion(q, 0);
    expect(window.getQuestionRating(q)).toBeNull();
    expect(window.getMyVoteForQuestion(q)).toBe(0);
  });

  test('多用户聚合：两个不同题目标识互不串扰', () => {
    const q2 = { bioId: 'q-local-0002' };
    window.rateQuestion(q, 1);
    window.rateQuestion(q2, -1);
    expect(window.getQuestionRating(q)).toEqual({ up: 1, down: 0 });
    expect(window.getQuestionRating(q2)).toEqual({ up: 0, down: 1 });
  });

  test('无效投票（非 1/-1/0）视为取消，不产生脏数据', () => {
    const r = window.rateQuestion(q, 5);
    expect(r.myVote).toBe(0);
    expect(window.getQuestionRating(q)).toBeNull();
  });
});

describe('setQuestionRating（管理员重新评分）', () => {
  test('直接覆盖聚合数据并持久化', () => {
    window.rateQuestion(q, 1);
    const ok = window.setQuestionRating(q, 40, 10);
    expect(ok).toBe(true);
    expect(window.getQuestionRating(q)).toEqual({ up: 40, down: 10 });
    // 重新评分后持久化，重读仍一致
    const reloaded = JSON.parse(localStorage.getItem('tatabox_question_ratings'));
    expect(reloaded['q-local-0001']).toEqual({ up: 40, down: 10 });
  });

  test('归零数据删除记录', () => {
    window.rateQuestion(q, 1);
    window.setQuestionRating(q, 0, 0);
    expect(window.getQuestionRating(q)).toBeNull();
  });
});

describe('回收站流转（recycle / restore / isRecycled）', () => {
  test('初始不在回收站', () => {
    expect(window.isQuestionRecycled(q)).toBe(false);
  });

  test('回收后 isRecycled=true，且持久化', () => {
    window.recycleQuestion(q);
    expect(window.isQuestionRecycled(q)).toBe(true);
    expect(JSON.parse(localStorage.getItem('tatabox_question_recycled'))).toContain('q-local-0001');
  });

  test('重复回收幂等', () => {
    window.recycleQuestion(q);
    window.recycleQuestion(q);
    expect(JSON.parse(localStorage.getItem('tatabox_question_recycled'))).toHaveLength(1);
  });

  test('恢复后 isRecycled=false 且列表移除', () => {
    window.recycleQuestion(q);
    window.restoreQuestion(q);
    expect(window.isQuestionRecycled(q)).toBe(false);
    expect(JSON.parse(localStorage.getItem('tatabox_question_recycled'))).toHaveLength(0);
  });
});

describe('管理员覆盖（override）', () => {
  test('保存覆盖 → 出卷时 applyQuestionOverride 生效', () => {
    window.saveQuestionOverride(q.bioId, { question: '（已修正题干）根据以上信息，判断以下陈述的正误。' });
    const applied = window.applyQuestionOverride({ bioId: 'q-local-0001', question: '原始题干' });
    expect(applied.question).toBe('（已修正题干）根据以上信息，判断以下陈述的正误。');
  });

  test('无覆盖时原题不动', () => {
    const original = { bioId: 'q-local-9999', question: '原题', options: ['a', 'b'] };
    const applied = window.applyQuestionOverride(original);
    expect(applied).toEqual(original);
  });

  test('可清除覆盖恢复原题', () => {
    window.saveQuestionOverride(q.bioId, { question: '新' });
    window.clearQuestionOverride(q.bioId);
    const applied = window.applyQuestionOverride({ bioId: 'q-local-0001', question: '原' });
    expect(applied.question).toBe('原');
  });
});
