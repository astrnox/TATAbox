/**
 * 试题页（quiz.html）端到端冒烟测试
 * @jest-environment jsdom
 *
 * 注入 storage.js + rating.js + quiz.js，出基础模拟卷后验证：
 * 1. MTF 题目正常渲染（pq-mtf-card）；
 * 2. 每道题都有点赞/点踩按钮（评分系统“试题页同步支持”）；
 * 3. 投票 → 计数/激活态/评分 tag/回收联动 全链路可用，数据落 localStorage。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

describe('试题页（quiz.html）投票/评分冒烟', () => {
  beforeAll(async () => {
    document.body.innerHTML = `
      <div id="quizEmpty"></div>
      <div id="quizPaper"></div>
      <button id="quizCrawlBtn">出题</button>
      <span id="quizLabel"></span>
    `;
    const quizData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/quiz.json'), 'utf8'));
    const logicData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/logic_questions.json'), 'utf8'));
    window.fetch = async (url) => {
      if (String(url).endsWith('quiz.json')) return { ok: true, json: async () => quizData };
      if (String(url).endsWith('logic_questions.json')) return { ok: true, json: async () => logicData };
      return { ok: false, json: async () => ({}) };
    };

    // 与浏览器一致：utils.js（规范 escapeHtml 等共享工具）先于业务模块加载
    window.eval(read('js/core/utils.js'));
    // storage.js / rating.js 显式挂载到 window，直接求值即可
    window.eval(read('js/core/storage.js'));
    window.eval(read('js/core/rating.js'));
    // question-model.js：quiz.js 顶层引用 QuestionModel 分值常量
    window.eval(read('js/core/question-model.js'));
    // quiz.js 为 'use strict' 经典脚本：去掉首行指令后以非严格模式 eval，
    // 使其函数声明进入全局作用域（等价于页面以 <script> 加载时的行为）
    const quizSrc = read('js/pages/quiz.js').replace(/^('use strict'|"use strict");?\s*\n?/, '');
    window.eval(quizSrc);

    // 触发页面初始化（DOMContentLoaded 已触发过，手动重放一次）
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await sleep(50); // 等待题库异步加载
  });

  test('题库加载后出基础卷（全 MTF），渲染题目与投票按钮', async () => {
    expect(typeof window.generateBasicPaper).toBe('function');
    window.generateBasicPaper();
    await sleep(0);
    const paper = document.querySelectorAll('.paper-question');
    expect(paper.length).toBeGreaterThanOrEqual(5);
    expect(document.querySelectorAll('.pq-mtf-card').length).toBe(paper.length * 4);
    expect(document.querySelectorAll('.pq-vote-btn').length).toBe(paper.length * 2);
  });

  test('点赞 → 计数+激活态+评分 tag 联动，且落盘 localStorage', () => {
    const firstUp = document.querySelector('[data-exam-vote-q="0"][data-vote="1"]');
    expect(firstUp).toBeTruthy();
    firstUp.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(firstUp.querySelector('.pq-vote-count').textContent).toBe('1');
    expect(firstUp.classList.contains('pq-vote-active')).toBe(true);
    const tag = document.querySelector('[data-exam-rating-tag]');
    expect(tag).toBeTruthy();
    expect(tag.textContent).toContain('评分');
    const stored = JSON.parse(localStorage.getItem('bioquest_question_ratings') || '{}');
    expect(Object.keys(stored).length).toBeGreaterThan(0);
  });

  test('再点同一方向 = 取消投票，计数归零、tag 移除', () => {
    const firstUp = document.querySelector('[data-exam-vote-q="0"][data-vote="1"]');
    firstUp.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(firstUp.querySelector('.pq-vote-count').textContent).toBe('0');
    expect(firstUp.classList.contains('pq-vote-active')).toBe(false);
    expect(document.querySelector('[data-exam-rating-tag]')).toBeNull();
  });
});