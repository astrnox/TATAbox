/**
 * @jest-environment jsdom
 *
 * 统一会话落盘服务（js/core/record-session.js）单元测试
 * -------------------------------------------------
 * practice / exam / quiz / 每日亿题四页共用的「刷题 → 全局体系」链路：
 *   1. question()：模块统计（QuestionModel.getStatModuleKey 权威映射）/ 难度自适应 /
 *      答错入错题本（云端 review_cards）/ 信用点（按模块配置 + 每日封顶）
 *   2. 模块信用配置：practice 沿用 user.js 默认额度；每日亿题 0.25/0.05 且日封顶 5；
 *      exam / quiz 不给信用（与历史行为一致）
 *   3. 挂起补发：addPoints（user.js）未加载时先挂起，loadModule('user') 就绪后补发
 *   4. finish()：练习记录 saveRecord 归一 + stats:false 防双计 + bio 分同步
 */
'use strict';

const fs = require('fs');
const path = require('path');

const QuestionModel = require('../../js/core/question-model.js');
const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'core', 'record-session.js'), 'utf8'
);

/** 全量桩：每次用例前重置为干净的可观测桩 */
function setupStubs() {
  window.updateStats = jest.fn();
  window.saveRecord = jest.fn();
  window.recordQuestionAnswer = jest.fn();
  window.recordWrongAnswer = jest.fn(() => Promise.resolve({ ok: true }));
  window.addPoints = jest.fn(() => 100);
  window.updateBioScore = jest.fn(() => Promise.resolve());
  window.recordDailyCheckIn = jest.fn();
  window.checkAchievement = jest.fn();
  window.getStats = jest.fn(() => ({
    totalAnswered: 10, totalCorrect: 8, accuracy: 80, moduleStats: {}
  }));
  window.getRecords = jest.fn(() => []);
  window.calcBioScore = jest.fn(() => ({ score: 77 }));
  window.QuestionModel = QuestionModel;
  window.loadModule = jest.fn(() => Promise.resolve());
  localStorage.clear();
}

function loadSession() {
  window.eval(SRC);
  return window.BioQuestSession;
}

const q = (subject) => ({
  id: 'BQ-test-000000000001',
  question: '测试题干',
  subject,
  difficulty: 'medium'
});

beforeEach(() => {
  setupStubs();
});

describe('BioQuestSession.question（每题提交）', () => {
  test('模块统计走 QuestionModel.getStatModuleKey 权威映射', () => {
    const s = loadSession();
    s.question({ module: 'practice', q: q('遗传学'), correct: true });
    expect(window.updateStats).toHaveBeenCalledWith('module_4', true);
    expect(window.recordQuestionAnswer).toHaveBeenCalledWith('BQ-test-000000000001', true, 'medium');
  });

  test('答对不入错题本；答错入错题本（云端 review_cards）', () => {
    const s = loadSession();
    s.question({ module: 'practice', q: q('遗传学'), correct: true });
    expect(window.recordWrongAnswer).not.toHaveBeenCalled();

    s.question({ module: 'practice', q: q('遗传学'), correct: false });
    expect(window.recordWrongAnswer).toHaveBeenCalledTimes(1);
    expect(window.recordWrongAnswer.mock.calls[0][0].id).toBe('BQ-test-000000000001');
  });

  test('wrongbook:false / stats:false 开关生效（防双计）', () => {
    const s = loadSession();
    s.question({ module: 'practice', q: q('生态学'), correct: false, wrongbook: false, stats: false });
    expect(window.recordWrongAnswer).not.toHaveBeenCalled();
    expect(window.updateStats).not.toHaveBeenCalled();
    // 难度统计默认仍开启
    expect(window.recordQuestionAnswer).toHaveBeenCalledTimes(1);
  });

  test('每日亿题信用额度减半：答对 +0.25 / 答错 +0.05', () => {
    const s = loadSession();
    s.question({ module: 'daily-billion', q: q('植物学'), correct: true });
    s.question({ module: 'daily-billion', q: q('植物学'), correct: false });
    expect(window.addPoints.mock.calls).toEqual([
      ['ANSWER_CORRECT', 0.25],
      ['ANSWER_WRONG', 0.05]
    ]);
  });

  test('每日亿题信用每日封顶 5：超过后不再发放', () => {
    const s = loadSession();
    for (let i = 0; i < 30; i++) {
      s.question({ module: 'daily-billion', q: q('植物学'), correct: true });
    }
    const total = window.addPoints.mock.calls.reduce((sum, a) => sum + a[1], 0);
    expect(total).toBe(5);
    expect(window.addPoints).toHaveBeenCalledTimes(20); // 0.25 × 20 = 5，第 21 笔封顶不再发放
  });

  test('practice 沿用 user.js 默认额度（不传 amount）', () => {
    const s = loadSession();
    s.question({ module: 'practice', q: q('动物学'), correct: true });
    expect(window.addPoints).toHaveBeenCalledWith('ANSWER_CORRECT');
  });

  test('exam / quiz 不给信用点（与历史行为一致）', () => {
    const s = loadSession();
    s.question({ module: 'exam', q: q('动物学'), correct: false });
    s.question({ module: 'quiz', q: q('动物学'), correct: true });
    expect(window.addPoints).not.toHaveBeenCalled();
  });

  test('打卡/成就：checkin 与 achievements 参数驱动', () => {
    const s = loadSession();
    s.question({ module: 'practice', q: q('动物学'), correct: true, checkin: true, achievements: [{ type: 'practice', value: 1 }] });
    expect(window.recordDailyCheckIn).toHaveBeenCalledTimes(1);
    expect(window.checkAchievement).toHaveBeenCalledWith('practice', 1);
  });

  test('无 bioId/id 的老题用题干前 20 字兜底（难度统计不静默丢失）', () => {
    const s = loadSession();
    const stem = '这是一道没有稳定ID的老数据题目，用来验证难度统计兜底逻辑';
    s.question({ module: 'practice', q: { question: stem, subject: '动物学' }, correct: true });
    expect(window.recordQuestionAnswer).toHaveBeenCalledTimes(1);
    const qid = window.recordQuestionAnswer.mock.calls[0][0];
    expect(qid).toBe(stem.slice(0, 20));
    expect(qid.length).toBe(20);
  });

  test('题干也为空时跳过难度统计但不抛错', () => {
    const s = loadSession();
    expect(() => s.question({ module: 'practice', q: { subject: '动物学' }, correct: true })).not.toThrow();
    expect(window.recordQuestionAnswer).not.toHaveBeenCalled();
  });
});

describe('信用点挂起补发（user.js 按需加载）', () => {
  test('addPoints 缺失时挂起，user.js 按需加载就绪后补发', async () => {
    delete window.addPoints;
    const s = loadSession();

    s.question({ module: 'daily-billion', q: q('植物学'), correct: true });
    s.question({ module: 'daily-billion', q: q('植物学'), correct: false });
    expect(window.loadModule).toHaveBeenCalledWith('user');
    // 未就绪期间不丢额度：挂起 2 笔
    expect(window.addPoints).toBeUndefined();

    // 模拟 user.js 加载完成：补挂 addPoints 并让 loadModule 的 promise resolve
    window.addPoints = jest.fn(() => 100);
    await new Promise((r) => setTimeout(r, 0)); // 触发 .then(_flushPendingGrants)
    expect(window.addPoints.mock.calls).toEqual([
      ['ANSWER_CORRECT', 0.25],
      ['ANSWER_WRONG', 0.05]
    ]);
  });
});

describe('BioQuestSession.finish（一段刷题结束）', () => {
  const entries = [
    { q: q('遗传学'), userAnswers: { A: true }, correctSubs: 2, totalSubs: 2, score: 2, totalScore: 2 },
    { q: q('生态学'), userAnswers: { A: true }, correctSubs: 1, totalSubs: 2, score: 1, totalScore: 2 }
  ];

  test('saveRecord 归一：correctCount = 题级全对数，统计键走权威映射', () => {
    const s = loadSession();
    const out = s.finish({ module: 'practice', duration: 60, questions: entries });
    expect(window.saveRecord).toHaveBeenCalledTimes(1);
    const rec = window.saveRecord.mock.calls[0][0];
    expect(rec.module).toBe('practice');
    expect(rec.totalQuestions).toBe(2);
    expect(rec.correctCount).toBe(1);
    expect(rec.score).toBe(3);
    expect(rec.totalScore).toBe(4);
    expect(rec.duration).toBe(60);
    expect(rec.questions[0].questionId).toBe('BQ-test-000000000001');
    // 逐题统计键由 QuestionModel.getStatModuleKey 映射（module_1..4）
    expect(window.updateStats.mock.calls).toEqual([
      ['module_4', true],
      ['module_3', false]
    ]);
    expect(out.correctCount).toBe(1);
  });

  test('stats:false 时不再逐题写 updateStats（防与 question() 双计）', () => {
    const s = loadSession();
    s.finish({ module: 'practice', questions: entries, stats: false });
    expect(window.updateStats).not.toHaveBeenCalled();

    s.finish({ module: 'practice', questions: entries });
    expect(window.updateStats).toHaveBeenCalledTimes(2);
  });

  test('bio 分同步经 updateBioScore（带全局统计）', () => {
    const s = loadSession();
    const out = s.finish({ module: 'practice', questions: entries, stats: false });
    expect(window.updateBioScore).toHaveBeenCalledTimes(1);
    expect(window.updateBioScore.mock.calls[0][0]).toBe(77);
    expect(window.updateBioScore.mock.calls[0][1].total_answered).toBe(10);
    expect(out.bioScore).toBe(77);
  });

  test('computeBioDimensions 返回 null（stats 结构异常）时不同步 0 分上云', () => {
    window.computeBioDimensions = jest.fn(() => null);
    window.computeBioScoreFromRaw = jest.fn(() => ({ score: 0 }));
    const s = loadSession();
    const out = s.finish({ module: 'practice', questions: entries, stats: false });
    expect(window.computeBioScoreFromRaw).not.toHaveBeenCalled();
    expect(window.updateBioScore).not.toHaveBeenCalled();
    expect(out.bioScore).toBeNull();
  });

  test('空 questions：返回全 0 且不落 saveRecord（0 题空记录不污染列表）', () => {
    const s = loadSession();
    const out = s.finish({ module: 'practice', questions: [] });
    expect(out).toMatchObject({ correctCount: 0, totalQuestions: 0, score: 0, totalScore: 0 });
    expect(window.saveRecord).not.toHaveBeenCalled();
  });
});
