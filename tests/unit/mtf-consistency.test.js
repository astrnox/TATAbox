/**
 * MTF 语义一致性回归测试（PR #165 审计修复 / 全局化改造后指向唯一内核）
 *
 * 背景：
 * - 逻辑题库(data/logic_questions.json)的 type==='mtf' 题目以 Options 数组 + mtfTruth
 *   作为每条陈述真假的唯一权威来源，answer 仅为旧单选题遗留索引；
 * - 历史上 practice.js / quiz.js 各自维护一份 getEffectiveSubQuestions，
 *   曾因 quiz.js 忽略 mtfTruth 导致两页判分相反（PR #165）。
 * - 全局化改造后两页均薄封装 js/core/question-model.js 的同一实现，
 *   本测试锁定内核本身：mtfTruth 优先、与数据完全吻合。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const QuestionModel = require('../../js/core/question-model.js');
const ROOT = path.join(__dirname, '..', '..');

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

describe('逻辑推理 MTF（type="mtf"）语义一致性', () => {
  const logic = loadJson('data/logic_questions.json');
  const mtfQs = logic.filter(q => q.type === 'mtf');

  test('逻辑题库存在 MTF 题目（32 道）', () => {
    expect(mtfQs.length).toBeGreaterThan(0);
  });

  test('practice / quiz / exam / daily 页的薄封装都指向 question-model 内核', () => {
    ['js/pages/practice.js', 'js/pages/quiz.js'].forEach(fileRel => {
      const src = fs.readFileSync(path.join(ROOT, fileRel), 'utf8');
      expect(src).toContain('QuestionModel.getEffectiveSubQuestions');
    });
    const examSrc = fs.readFileSync(path.join(ROOT, 'js/pages/exam.js'), 'utf8');
    expect(examSrc).toContain("QuestionModel.gradeQuestion(q, userAnswers[qIndex], 'exam')");
    const dailySrc = fs.readFileSync(path.join(ROOT, 'js/pages/daily-billion.js'), 'utf8');
    expect(dailySrc).toContain('QuestionModel.');
  });

  test('内核优先采用 mtfTruth，且与 mtfTruth 完全吻合', () => {
    mtfQs.forEach(q => {
      expect(Array.isArray(q.mtfTruth)).toBe(true);
      expect(q.mtfTruth.length).toBe(q.options.length);
      const subs = QuestionModel.getEffectiveSubQuestions(q);
      subs.forEach((s, i) => {
        expect(s.text).toBe(String(q.options[i]));
        expect(s.answer).toBe(q.mtfTruth[i]);
      });
    });
  });

  test('样例题 M2-01-9875a511：answer 索引与 mtfTruth 相反时判分正确', () => {
    const q = mtfQs.find(x => (x.bioId || x.id) === 'M2-01-9875a511');
    expect(q).toBeTruthy();
    const subs = QuestionModel.getEffectiveSubQuestions(q);
    expect(subs.map(s => s.answer)).toEqual([true, true, false, true]);
    // answer=2（旧单选题「最不合理的是C」）不能反向覆盖 mtfTruth
    expect(subs[2].answer).toBe(false);
  });
});

describe('基础知识题库 MTF 数据完整性', () => {
  const quiz = loadJson('data/quiz.json');
  const arr = Array.isArray(quiz) ? quiz : (quiz['题库'] || []);

  test('全部为题干的 subQuestions MTF 且每条 answer 为布尔', () => {
    arr.forEach(q => {
      expect(Array.isArray(q.subQuestions)).toBe(true);
      q.subQuestions.forEach(s => {
        expect(typeof s.answer).toBe('boolean');
        expect(typeof s.text).toBe('string');
      });
    });
  });
});
