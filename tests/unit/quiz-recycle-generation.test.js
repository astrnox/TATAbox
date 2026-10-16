/**
 * 试题页二次出卷排除回收站题目（PR #165 审计修复回归测试）
 * @jest-environment jsdom
 *
 * 背景：练习页 generateQuestionSet 每次都会实时排除回收站题目；而试题页此前
 * 仅在 loadQuizData 时过滤一次，会话中某题被（5 踩）回收后，点「重新出卷」
 * 仍可能把它再次放进新试卷。本测试锁定 generateBasicPaper / generateLogicPaper
 * / generateMixedPaper 每次都实时排除 bioquest_question_recycled 中的题目。
 *
 * 说明：quiz.js 为 'use strict' 脚本、顶层 let 不挂 window，因此断言走渲染后的
 * DOM（试卷中不出现被回收题的题干/陈述文本），而非读取内部数组。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

describe('试题页出卷实时排除回收站题目', () => {
  beforeAll(async () => {
    document.body.innerHTML = `
      <div id="quizEmpty"></div>
      <div id="quizPaper"></div>
      <button id="quizCrawlBtn">出题</button>
      <span id="quizLabel"></span>
    `;
    window.fetch = async (url) => {
      if (String(url).endsWith('quiz.json')) {
        const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/quiz.json'), 'utf8'));
        return { ok: true, json: async () => d };
      }
      if (String(url).endsWith('logic_questions.json')) {
        const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/logic_questions.json'), 'utf8'));
        return { ok: true, json: async () => d };
      }
      return { ok: false, json: async () => ({}) };
    };

    // 与浏览器一致：utils.js（规范 escapeHtml 等共享工具）先于业务模块加载
    window.eval(read('js/core/utils.js'));
    window.eval(read('js/core/storage.js'));
    window.eval(read('js/core/rating.js'));
    // question-model.js：quiz.js 顶层引用 QuestionModel 分值常量
    window.eval(read('js/core/question-model.js'));
    const quizSrc = read('js/pages/quiz.js').replace(/^('use strict'|"use strict");?\s*\n?/, '');
    window.eval(quizSrc);

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await sleep(60);
  });

  function renderedTexts() {
    return Array.from(document.querySelectorAll('.pq-text, .pq-mtf-text')).map(el => el.textContent.trim());
  }

  test('基础卷：回收站中的题目（题干+陈述）不出现在新试卷', () => {
    const quizData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/quiz.json'), 'utf8'));
    const first = quizData['题库'][0];
    const qId = window.getQuestionBioId(first);
    window.recycleQuestion(qId);

    window.generateBasicPaper();
    const texts = renderedTexts();
    // 被回收题的题干与每条陈述都不应出现
    expect(texts).not.toContain(first.question.trim());
    (first.subQuestions || []).forEach(sq => {
      expect(texts).not.toContain(sq.text.trim());
    });
    expect(document.querySelectorAll('.paper-question').length).toBeGreaterThan(0);
    expect(window.isQuestionRecycled(qId)).toBe(true);
  });

  test('逻辑卷：回收站中的逻辑题不出现在新试卷', () => {
    const logicData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/logic_questions.json'), 'utf8'));
    const target = logicData.find(q => q.type !== 'mtf') || logicData[0];
    const qId = window.getQuestionBioId(target);
    window.recycleQuestion(qId);

    window.generateLogicPaper();
    const texts = renderedTexts();
    expect(texts).not.toContain(target.question.trim());
    expect(document.querySelectorAll('.paper-question').length).toBeGreaterThan(0);
  });

  test('混合卷：所有已回收题目均不出现在新试卷', () => {
    window.generateMixedPaper();
    const texts = renderedTexts();
    const recycledIds = window.getRecycledQuestionIds();
    expect(recycledIds.length).toBeGreaterThanOrEqual(2);
    expect(document.querySelectorAll('.paper-question').length).toBeGreaterThanOrEqual(5);
    // 基础题库与被回收逻辑题的题干都不应出现
    const quizData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/quiz.json'), 'utf8'));
    const recycledQ = quizData['题库'].filter(q => recycledIds.includes(window.getQuestionBioId(q)));
    recycledQ.forEach(q => {
      expect(texts).not.toContain(q.question.trim());
    });
  });
});