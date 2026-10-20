/**
 * @jest-environment jsdom
 *
 * 错题本本地存储归一化（js/core/storage.js 错题管理段）
 * ---------------------------------------------------------------
 * 历史上错题条目有多条写入路径、字段不一：
 *   - 早期：{ qId, questionText, timestamp, wrongCount, fullQuestion }
 *   - quiz.js 对象入参：window.addWrongQuestion(question) —— 旧实现把对象当 qId 传，
 *     题干/学科被丢弃（questionText 恒为空）
 * 错题本列表渲染（id/question_text/subject/concept/created_at）与 FSRS 徽标
 * 联接（qId ↔ review_cards.question_id）都依赖归一化字段。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/core/storage.js'), 'utf8');

beforeAll(() => {
  window.OfflineQueue = { register: jest.fn(), flush: jest.fn() }; // storage.js 顶部依赖
  // storage.js 头部 'use strict'：strict 间接 eval 的声明不外泄，追加导出
  // eslint-disable-next-line no-eval
  (0, eval)(SRC + '\n;window.addWrongQuestion = addWrongQuestion; window.getWrongQuestions = getWrongQuestions;');
});

beforeEach(() => {
  localStorage.clear();
});

describe('addWrongQuestion 对象入参兼容', () => {
  test('对象入参：题干/学科/概念不丢失（quiz 加入错题路径）', () => {
    const ok = window.addWrongQuestion({
      question_id: 'M3-57-e783fb7b032b',
      question: '被子植物的减数分裂发生在哪个结构？',
      subject: '植物学',
      concept: '生殖发育'
    });
    expect(ok).toBe(true);
    const items = window.getWrongQuestions();
    expect(items).toHaveLength(1);
    expect(items[0].question_text).toBe('被子植物的减数分裂发生在哪个结构？');
    expect(items[0].subject).toBe('植物学');
    expect(items[0].concept).toBe('生殖发育');
    // FSRS/列表联接键完整
    expect(items[0].id).toBeTruthy();
    expect(items[0].qId).toBe(items[0].id);
    expect(items[0].question_id).toBe(items[0].id);
    expect(items[0].created_at).toBeTruthy();
  });

  test('字符串入参（练习页标记错题）：新建与再次标记的字段补齐', () => {
    expect(window.addWrongQuestion('BQ-legacy-000000000009', '遗传学', '红绿色盲的遗传方式是')).toBe(true);
    expect(window.addWrongQuestion('BQ-legacy-000000000009', '遗传学', '红绿色盲的遗传方式是')).toBe(true);
    const items = window.getWrongQuestions();
    expect(items).toHaveLength(1);
    expect(items[0].wrongCount).toBe(2);
    expect(items[0].question_text).toBe('红绿色盲的遗传方式是');
    expect(items[0].subject).toBe('遗传学');
    expect(items[0].id).toBeTruthy();
  });
});

describe('getWrongQuestions 读取归一化（存量旧条目）', () => {
  test('早期 {qId,questionText} 条目补齐 id/question_text/created_at', () => {
    const ts = Date.parse('2026-10-01T00:00:00Z');
    localStorage.setItem('bioquest_wrong_questions', JSON.stringify([
      { qId: 'LEG-1', questionText: '旧题干', timestamp: ts, wrongCount: 2 }
    ]));
    const items = window.getWrongQuestions();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('LEG-1');
    expect(items[0].question_id).toBe('LEG-1');
    expect(items[0].question_text).toBe('旧题干');
    expect(items[0].created_at).toBe('2026-10-01T00:00:00.000Z');
    expect(items[0].timestamp).toBe(ts);
    expect(items[0].wrongCount).toBe(2);
  });

  test('fullQuestion 快照可回填题干与学科', () => {
    localStorage.setItem('bioquest_wrong_questions', JSON.stringify([
      { qId: 'LEG-2', questionText: '', timestamp: Date.now(), wrongCount: 1,
        fullQuestion: { question: '快照题干', subject: '动物学', concept: '循环' } }
    ]));
    const items = window.getWrongQuestions();
    expect(items[0].question_text).toBe('快照题干');
    expect(items[0].subject).toBe('动物学');
    expect(items[0].concept).toBe('循环');
  });
});
