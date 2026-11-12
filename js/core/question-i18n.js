/**
 * ============================================================
 * TATABOX — 题目双语（IBO）语言选择与字段读取
 * ============================================================
 *
 * 背景：IBO 真题为英文原题，题库同时保存逐题中文翻译
 * （question_zh / subQuestions[].text_zh / tables_zh / images[].caption_zh）。
 * 展示默认英文，用户可在练习页切换中文；选择写入 localStorage 长期生效。
 *
 * 约定：中文缺失时一律回退原文，绝不显示空题干。
 * 依赖：无 DOM，可在 Node 直接单测（tests/unit/question-i18n.test.js）。
 * 挂载：浏览器 window.QuestionI18n；Node module.exports。
 * ============================================================
 */
'use strict';

var QuestionI18n = (function () {
  var STORAGE_KEY = 'bq_question_lang';
  var EN = 'en';
  var ZH = 'zh';
  var _lang = null;

  function _store() {
    try {
      return (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : null;
    } catch (e) {
      return null;
    }
  }

  /** 当前题目语言：'en'（默认）或 'zh' */
  function getLang() {
    if (_lang) return _lang;
    var v = '';
    try {
      var s = _store();
      v = (s && s.getItem(STORAGE_KEY)) || '';
    } catch (e) { /* 隐私模式 */ }
    _lang = (v === ZH) ? ZH : EN;
    return _lang;
  }

  /** 设置语言，返回生效值 */
  function setLang(lang) {
    _lang = (lang === ZH) ? ZH : EN;
    try {
      var s = _store();
      if (s) s.setItem(STORAGE_KEY, _lang);
    } catch (e) { /* 忽略写入失败 */ }
    return _lang;
  }

  function toggleLang() {
    return setLang(getLang() === EN ? ZH : EN);
  }

  /** 该题是否有中文翻译（至少有题干或任一子题译文） */
  function hasTranslation(q) {
    if (!q || typeof q !== 'object') return false;
    if (typeof q.question_zh === 'string' && q.question_zh) return true;
    var subs = Array.isArray(q.subQuestions) ? q.subQuestions : [];
    for (var i = 0; i < subs.length; i++) {
      if (subs[i] && typeof subs[i].text_zh === 'string' && subs[i].text_zh) return true;
    }
    return false;
  }

  /**
   * 读取对象字段的当前语言值：zh 时优先 <field>_zh，缺失回退原字段。
   * @param {Object} obj
   * @param {string} field 如 'question' / 'text' / 'explanation'
   * @param {string} [lang]
   */
  function pick(obj, field, lang) {
    if (!obj || typeof obj !== 'object') return '';
    var l = lang || getLang();
    if (l === ZH) {
      var zh = obj[field + '_zh'];
      if (typeof zh === 'string' && zh) return zh;
    }
    var v = obj[field];
    return v == null ? '' : String(v);
  }

  function stem(q, lang) {
    return pick(q, 'question', lang);
  }

  function subText(sub, lang) {
    return pick(sub, 'text', lang);
  }

  function explanation(q, lang) {
    return pick(q, 'explanation', lang);
  }

  /**
   * 表格：中文优先 tables_zh，缺失回退 tables。
   * 结构：[{ title, head:[...], rows:[[...]] }]
   */
  function tables(q, lang) {
    if (!q || typeof q !== 'object') return [];
    var l = lang || getLang();
    if (l === ZH && Array.isArray(q.tables_zh) && q.tables_zh.length > 0) return q.tables_zh;
    return Array.isArray(q.tables) ? q.tables : [];
  }

  /**
   * 配图列表（统一 images[]，兼容单图 image 对象），并按语言取图注。
   * @returns {Array<{file:string,caption:string,alt:string}>}
   */
  function images(q, lang) {
    if (!q || typeof q !== 'object') return [];
    var arr = Array.isArray(q.images) ? q.images
      : (q.image && typeof q.image === 'object' ? [q.image] : []);
    var l = lang || getLang();
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var im = arr[i] || {};
      if (!im.file) continue;
      var cap = (l === ZH && typeof im.caption_zh === 'string' && im.caption_zh)
        ? im.caption_zh
        : (im.caption || '');
      out.push({ file: im.file, caption: cap, alt: cap || '题目配图' });
    }
    return out;
  }

  /** 练习页语言切换按钮文案 */
  function getToggleLabel(lang) {
    return (lang || getLang()) === ZH ? '中文' : 'English';
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    getLang: getLang,
    setLang: setLang,
    toggleLang: toggleLang,
    hasTranslation: hasTranslation,
    pick: pick,
    stem: stem,
    subText: subText,
    explanation: explanation,
    tables: tables,
    images: images,
    getToggleLabel: getToggleLabel
  };
})();

if (typeof window !== 'undefined') {
  window.QuestionI18n = QuestionI18n;
  if (window.TATABOX) window.TATABOX.questionI18n = QuestionI18n;
  (function () {
    var BQ = (window.BioQuest = window.BioQuest || {});
    BQ.i18n = QuestionI18n;
  })();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QuestionI18n;
}
