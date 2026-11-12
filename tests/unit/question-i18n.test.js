/**
 * @jest-environment jsdom
 *
 * QuestionI18n：IBO 双语字段读取与语言切换
 */
'use strict';

const path = require('path');
const QuestionI18n = require(path.resolve(__dirname, '../../js/core/question-i18n.js'));

const q = {
  question: 'English stem',
  question_zh: '中文题干',
  explanation: '中文解析',
  subQuestions: [
    { label: 'A', text: 'English A', text_zh: '中文 A', answer: true },
    { label: 'B', text: 'English B', answer: false }
  ],
  tables: [{ title: 'T', head: ['h'], rows: [['1']] }],
  tables_zh: [{ title: '表', head: ['列'], rows: [['1']] }],
  images: [{ file: 'a.webp', caption: 'Fig. 1', caption_zh: '图 1' }]
};

describe('QuestionI18n', () => {
  beforeEach(() => {
    window.localStorage.clear();
    QuestionI18n.setLang('en');
  });

  test('默认英文，切换后持久化', () => {
    expect(QuestionI18n.getLang()).toBe('en');
    expect(QuestionI18n.toggleLang()).toBe('zh');
    expect(window.localStorage.getItem(QuestionI18n.STORAGE_KEY)).toBe('zh');
    expect(QuestionI18n.toggleLang()).toBe('en');
  });

  test('stem/subText 中文优先，缺失回退英文', () => {
    expect(QuestionI18n.stem(q, 'en')).toBe('English stem');
    expect(QuestionI18n.stem(q, 'zh')).toBe('中文题干');
    expect(QuestionI18n.subText(q.subQuestions[0], 'zh')).toBe('中文 A');
    expect(QuestionI18n.subText(q.subQuestions[1], 'zh')).toBe('English B');
  });

  test('tables/images 中英文切换', () => {
    expect(QuestionI18n.tables(q, 'zh')[0].title).toBe('表');
    expect(QuestionI18n.tables(q, 'en')[0].title).toBe('T');
    expect(QuestionI18n.images(q, 'zh')[0].caption).toBe('图 1');
    expect(QuestionI18n.images(q, 'en')[0].caption).toBe('Fig. 1');
  });

  test('hasTranslation 识别题干或子题译文', () => {
    expect(QuestionI18n.hasTranslation(q)).toBe(true);
    expect(QuestionI18n.hasTranslation({ question: 'x', subQuestions: [] })).toBe(false);
    expect(QuestionI18n.hasTranslation({ subQuestions: [{ text_zh: '有' }] })).toBe(true);
  });
});
