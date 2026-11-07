/**
 * ============================================================
 * TATABOX v4.0 — 模块 4：身心健康融合层
 * ------------------------------------------------------------
 * - 每日多次情绪打卡（5 种情绪：开心/平静/焦虑/疲惫/难过）
 * - 压力指数计算（情绪 + 正确率 + 学习时长）
 * - 危机词检测 + 资源卡片弹窗
 * - 学习行为信号收集（连续错题、长时间无休）
 * - 数据持久化：Supabase mood_logs 表 + localStorage 兜底
 * ============================================================
 */
(function (global) {
  'use strict';

  if (global.BioQuestMoodTracker) return;

  // 情绪值（0-1，越高越积极）
  var MOOD_VALUES = {
    happy: 1.0,
    calm: 0.8,
    neutral: 0.5,
    anxious: 0.3,
    tired: 0.4,
    sad: 0.2
  };

  var MOOD_LABELS = {
    happy: '开心',
    calm: '平静',
    neutral: '一般',
    anxious: '焦虑',
    tired: '疲惫',
    sad: '难过'
  };

  // 危机关键词（与 classmate.js 的 CRISIS_KEYWORDS 保持一致）
  var CRISIS_KEYWORDS = [
    '自杀', '自残', '不想活', '想死', '了结', '结束生命',
    '无意义', '绝望', '崩溃', '撑不下去', '解脱', '消失',
    '伤害自己', '割腕', '跳楼', '安眠药',
    '活着没意思', '不想面对', '一了百了', '走不下去'
  ];

  var STORAGE_KEY = 'tatabox_mood_logs';

  function _loadLogs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function _saveLogs(logs) {
    try {
      // 最多保留 200 条
      if (logs.length > 200) logs = logs.slice(-200);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    } catch (e) { /* 静默 */ }
  }

  function _todayKey() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /**
   * 危机词检测
   */
  function detectCrisis(text) {
    if (!text || typeof text !== 'string') return false;
    var lower = text.toLowerCase();
    for (var i = 0; i < CRISIS_KEYWORDS.length; i++) {
      if (lower.indexOf(CRISIS_KEYWORDS[i]) !== -1) return true;
    }
    return false;
  }

  /**
   * 显示危机资源卡片
   */
  function showCrisisResource() {
    // 避免重复弹窗
    var existing = document.querySelector('.bq-crisis-modal');
    if (existing) return;

    var modal = document.createElement('div');
    modal.className = 'bq-crisis-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'bq-crisis-title');
    modal.innerHTML =
      '<div class="bq-crisis-backdrop"></div>' +
      '<div class="bq-crisis-card">' +
        '<h2 id="bq-crisis-title">你不是一个人</h2>' +
        '<p>我注意到你可能正在经历困难的时刻。请记得，寻求帮助是勇敢的表现。</p>' +
        '<div class="bq-crisis-resources">' +
          '<a class="bq-crisis-item" href="tel:12320" target="_blank" rel="noopener">' +
            '<strong>全国心理援助热线</strong>' +
            '<span>12320-5（24 小时）</span>' +
          '</a>' +
          '<a class="bq-crisis-item" href="tel:010-82951332" target="_blank" rel="noopener">' +
            '<strong>北京心理危机研究与干预中心</strong>' +
            '<span>010-82951332</span>' +
          '</a>' +
          '<a class="bq-crisis-item" href="tel:400-161-9995" target="_blank" rel="noopener">' +
            '<strong>希望24热线</strong>' +
            '<span>400-161-9995</span>' +
          '</a>' +
          '<div class="bq-crisis-item">' +
            '<strong>学校心理老师</strong>' +
            '<span>请直接联系你信任的老师</span>' +
          '</div>' +
        '</div>' +
        '<p class="bq-crisis-disclaimer">' +
          'TATABOX 不是医疗机构，本卡片仅提供资源转介，不构成医学诊断或治疗建议。' +
          '如遇紧急情况请立即拨打 120 或前往最近医院急诊。' +
        '</p>' +
        '<button class="bq-crisis-close" type="button">我已了解</button>' +
      '</div>';

    document.body.appendChild(modal);

    var _focusTrap = null;
    function close() {
      if (_focusTrap) { _focusTrap.release(); _focusTrap = null; }
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    modal.querySelector('.bq-crisis-close').addEventListener('click', close);
    modal.querySelector('.bq-crisis-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    // v4.0 焦点陷阱：使用 BioQuestA11y.trapFocus 实现 Tab/Shift+Tab 循环 + ESC 关闭
    if (typeof window.BioQuestA11y === 'object' && window.BioQuestA11y &&
        typeof window.BioQuestA11y.trapFocus === 'function') {
      var closeBtn = modal.querySelector('.bq-crisis-close');
      _focusTrap = window.BioQuestA11y.trapFocus(modal, {
        onEscape: close,
        initialFocus: closeBtn
      });
    } else {
      // 兜底：仅聚焦关闭按钮
      setTimeout(function () {
        var closeBtnFallback = modal.querySelector('.bq-crisis-close');
        if (closeBtnFallback) closeBtnFallback.focus();
      }, 50);
    }
  }

  /**
   * 记录情绪打卡
   * @param {string} mood - happy/calm/neutral/anxious/tired/sad
   * @param {string} note - 可选备注
   * @param {Object} opts - { period: 'morning'|'noon'|'evening' }
   * @returns {Object} entry
   */
  function logMood(mood, note, opts) {
    opts = opts || {};
    var value = MOOD_VALUES[mood];
    if (value == null) value = 0.5;

    var entry = {
      id: 'mood_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      date: _todayKey(),
      mood: mood,
      moodValue: value,
      note: note || '',
      period: opts.period || ''
    };

    // 危机词检测
    if (note && detectCrisis(note)) {
      // 延迟弹窗，避免阻塞 UI
      setTimeout(showCrisisResource, 100);
    }

    // 保存到 localStorage
    var logs = _loadLogs();
    logs.push(entry);
    _saveLogs(logs);

    // 异步同步到 Supabase
    _syncToSupabase(entry);

    return entry;
  }

  function _syncToSupabase(entry) {
    try {
      if (!global.getSupabase || !global.getSupabase()) return;
      var sb = global.getSupabase();
      sb.from('mood_logs').insert([{
        timestamp: new Date(entry.timestamp).toISOString(),
        mood: entry.mood,
        mood_value: entry.moodValue,
        note: entry.note,
        period: entry.period
      }]).then(function () { /* 成功 */ })
        .catch(function (err) { console.warn('[MoodTracker] supabase sync failed:', err && err.message); });
    } catch (e) { /* 静默 */ }
  }

  /**
   * 获取最近 N 天的情绪日志
   */
  function getRecentLogs(days) {
    days = days || 7;
    var logs = _loadLogs();
    var cutoff = Date.now() - days * 24 * 3600 * 1000;
    return logs.filter(function (l) { return l.timestamp >= cutoff; });
  }

  /**
   * 获取今日所有打卡
   */
  function getTodayLogs() {
    var today = _todayKey();
    return _loadLogs().filter(function (l) { return l.date === today; });
  }

  /**
   * 计算压力指数（0-100，越高压力越大）
   * 综合：近 7 日情绪 + 答题正确率 + 学习时长
   */
  function computeStressIndex(moodLog7d, accuracy7d, studyMin7d) {
    // 1. 情绪负向度（0-1）
    var moodAvg = 0.5;
    if (moodLog7d && moodLog7d.length >= 3) {
      var recent = moodLog7d.slice(-21);
      var sum = 0;
      for (var i = 0; i < recent.length; i++) {
        var v = typeof recent[i].moodValue === 'number'
          ? recent[i].moodValue
          : (MOOD_VALUES[recent[i].mood] != null ? MOOD_VALUES[recent[i].mood] : 0.5);
        sum += v;
      }
      moodAvg = sum / recent.length;
    }
    var moodNeg = 1 - moodAvg;

    // 2. 正确率反向
    var accNeg = 1 - (accuracy7d != null ? accuracy7d : 0.7);

    // 3. 学习时长过载度（>300 分钟/日视为过载）
    var overload = Math.min(1, (studyMin7d != null ? studyMin7d : 120) / 300);

    var stress = 0.4 * moodNeg + 0.3 * accNeg + 0.3 * overload;
    return Math.round(stress * 100);
  }

  /**
   * 获取压力等级
   */
  function getStressLevel(stressIndex) {
    if (stressIndex < 30) return { level: 'low', label: '轻松', color: '#5a7d5c' };
    if (stressIndex < 55) return { level: 'medium', label: '适中', color: '#c4956a' };
    if (stressIndex < 75) return { level: 'high', label: '偏高', color: '#c45a5a' };
    return { level: 'critical', label: '过高', color: '#a02020' };
  }

  /**
   * 显示情绪打卡弹窗
   */
  function showCheckinModal(opts) {
    opts = opts || {};
    var existing = document.querySelector('.bq-mood-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.className = 'bq-mood-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'bq-mood-title');

    var title = opts.title || '现在的你怎么样？';
    var period = opts.period || '';

    var moods = ['happy', 'calm', 'neutral', 'anxious', 'tired', 'sad'];
    var buttonsHtml = moods.map(function (m) {
      return '<button type="button" class="bq-mood-option" data-mood="' + m + '">' +
        '<span>' + MOOD_LABELS[m] + '</span>' +
      '</button>';
    }).join('');

    modal.innerHTML =
      '<div class="bq-mood-backdrop"></div>' +
      '<div class="bq-mood-checkin">' +
        '<h3 id="bq-mood-title">' + title + '</h3>' +
        '<div class="bq-mood-options">' + buttonsHtml + '</div>' +
        '<textarea class="bq-mood-note" placeholder="想说点什么？（可选，会保密保存）" maxlength="200"></textarea>' +
        '<div class="bq-mood-actions">' +
          '<button type="button" class="bq-mood-cancel">稍后再说</button>' +
          '<button type="button" class="bq-mood-submit" disabled>记录今天</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    var selectedMood = null;
    var submitBtn = modal.querySelector('.bq-mood-submit');
    var noteInput = modal.querySelector('.bq-mood-note');
    var _focusTrap = null;

    function close() {
      if (_focusTrap) { _focusTrap.release(); _focusTrap = null; }
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }

    modal.querySelectorAll('.bq-mood-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modal.querySelectorAll('.bq-mood-option').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        selectedMood = btn.getAttribute('data-mood');
        submitBtn.disabled = false;
        // v4.0 a11y：向屏幕阅读器播报选中状态
        if (window.BioQuestA11y && typeof window.BioQuestA11y.announce === 'function') {
          window.BioQuestA11y.announce('已选择情绪：' + MOOD_LABELS[selectedMood]);
        }
      });
    });

    submitBtn.addEventListener('click', function () {
      if (!selectedMood) return;
      var note = noteInput.value || '';
      var entry = logMood(selectedMood, note, { period: period });
      if (typeof opts.onSubmitted === 'function') {
        try { opts.onSubmitted(entry); } catch (e) {}
      }
      close();
    });

    modal.querySelector('.bq-mood-cancel').addEventListener('click', close);
    modal.querySelector('.bq-mood-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    // v4.0 焦点陷阱：使用 BioQuestA11y.trapFocus 实现 Tab/Shift+Tab 循环 + ESC 关闭
    var firstBtn = modal.querySelector('.bq-mood-option');
    if (typeof window.BioQuestA11y === 'object' && window.BioQuestA11y &&
        typeof window.BioQuestA11y.trapFocus === 'function') {
      _focusTrap = window.BioQuestA11y.trapFocus(modal, {
        onEscape: close,
        initialFocus: firstBtn
      });
    } else {
      // 兜底：仅聚焦第一个按钮
      setTimeout(function () {
        if (firstBtn) firstBtn.focus();
      }, 50);
    }
  }

  /**
   * 在指定容器渲染常驻情绪卡片
   */
  function renderMoodWidget(container) {
    if (!container) return;
    var todayLogs = getTodayLogs();
    var lastMood = todayLogs.length > 0 ? todayLogs[todayLogs.length - 1] : null;

    var label = lastMood ? MOOD_LABELS[lastMood.mood] : '今日未打卡';

    container.innerHTML =
      '<div class="bq-mood-widget">' +
        '<div class="bq-mood-widget-info">' +
          '<div class="bq-mood-widget-label">' + label + '</div>' +
          '<div class="bq-mood-widget-count">今日打卡 ' + todayLogs.length + ' 次</div>' +
        '</div>' +
        '<button type="button" class="bq-mood-widget-btn">打卡</button>' +
      '</div>';

    container.querySelector('.bq-mood-widget-btn').addEventListener('click', function () {
      var hour = new Date().getHours();
      var period = hour < 12 ? 'morning' : (hour < 18 ? 'noon' : 'evening');
      showCheckinModal({ period: period, onSubmitted: function () { renderMoodWidget(container); } });
    });
  }

  /**
   * 注入样式
   */
  function injectStyles() {
    if (document.getElementById('bq-mood-tracker-styles')) return;
    var style = document.createElement('style');
    style.id = 'bq-mood-tracker-styles';
    style.textContent = [
      '/* 危机资源弹窗 */',
      '.bq-crisis-modal { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; }',
      '.bq-crisis-backdrop { position: absolute; inset: 0; background: rgba(26, 58, 42, 0.85); }',
      '.bq-crisis-card { position: relative; max-width: 480px; width: 100%; background: #fff; border-radius: 16px; padding: 32px; box-shadow: var(--shadow-floating); }',
      '.bq-crisis-card h2 { font-family: "Noto Serif SC", serif; color: #1a3a2a; font-size: 1.4rem; margin: 0 0 12px; }',
      '.bq-crisis-card p { color: #4a4a4a; font-size: 0.95rem; line-height: 1.6; margin: 0 0 16px; }',
      '.bq-crisis-resources { display: flex; flex-direction: column; gap: 10px; margin: 20px 0; }',
      '.bq-crisis-item { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; background: #faf7f2; border: 1px solid #ece8e1; border-radius: 12px; text-decoration: none; color: inherit; transition: all 0.15s; }',
      '.bq-crisis-item:hover { background: #f0ebe0; border-color: #c4956a; }',
      '.bq-crisis-item strong { color: #1a3a2a; font-size: 0.95rem; }',
      '.bq-crisis-item span { color: #5a7d5c; font-size: 0.85rem; font-family: "JetBrains Mono", monospace; }',
      '.bq-crisis-disclaimer { font-size: 0.78rem !important; color: #8a8a8a !important; background: #fffaeb; padding: 10px 12px; border-radius: 8px; border-left: 3px solid #c4956a; }',
      '.bq-crisis-close { width: 100%; padding: 12px; background: #1a3a2a; color: #fff; border: none; border-radius: 12px; font-size: 0.95rem; font-weight: 600; cursor: pointer; margin-top: 8px; }',
      '.bq-crisis-close:hover { background: #2a4a3a; }',
      '',
      '/* 情绪打卡弹窗 */',
      '.bq-mood-modal { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }',
      '.bq-mood-backdrop { position: absolute; inset: 0; background: rgba(26, 58, 42, 0.7); }',
      '.bq-mood-checkin { position: relative; max-width: 420px; width: 100%; background: #fff; border-radius: 16px; padding: 28px; box-shadow: var(--shadow-floating); }',
      '.bq-mood-checkin h3 { font-family: "Noto Serif SC", serif; color: #1a3a2a; font-size: 1.2rem; margin: 0 0 20px; text-align: center; }',
      '.bq-mood-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }',
      '.bq-mood-option { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 8px; border: 2px solid #ece8e1; border-radius: 12px; background: #faf7f2; cursor: pointer; transition: all 0.15s; font-family: inherit; }',
      '.bq-mood-option:hover { border-color: #c4956a; transform: translateY(-2px); }',
      '.bq-mood-option.selected { border-color: #5a7d5c; background: rgba(90, 125, 92, 0.08); }',
      '.bq-mood-emoji { font-size: 1.8rem; }',
      '.bq-mood-option span:last-child { font-size: 0.78rem; color: #4a4a4a; }',
      '.bq-mood-note { width: 100%; min-height: 70px; padding: 10px 12px; border: 1px solid #ece8e1; border-radius: 8px; font-family: inherit; font-size: 0.9rem; resize: vertical; box-sizing: border-box; }',
      '.bq-mood-note:focus { outline: none; border-color: #5a7d5c; }',
      '.bq-mood-actions { display: flex; gap: 10px; margin-top: 14px; }',
      '.bq-mood-cancel { flex: 1; padding: 10px; background: #f0ebe0; color: #4a4a4a; border: none; border-radius: 8px; font-size: 0.9rem; cursor: pointer; font-family: inherit; }',
      '.bq-mood-submit { flex: 2; padding: 10px; background: #5a7d5c; color: #fff; border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; font-family: inherit; }',
      '.bq-mood-submit:disabled { background: #c4a4a4; cursor: not-allowed; }',
      '.bq-mood-submit:not(:disabled):hover { background: #4a6d4c; }',
      '',
      '/* 常驻情绪卡片 */',
      '.bq-mood-widget { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--color-bg-warm, #f5f0e8); border-radius: 16px; border: 1px solid #ece8e1; }',
      '.bq-mood-widget-icon { font-size: 1.6rem; }',
      '.bq-mood-widget-info { flex: 1; }',
      '.bq-mood-widget-label { font-size: 0.95rem; font-weight: 600; color: #1a3a2a; }',
      '.bq-mood-widget-count { font-size: 0.78rem; color: #8a8a8a; }',
      '.bq-mood-widget-btn { padding: 8px 16px; background: #5a7d5c; color: #fff; border: none; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; font-family: inherit; }',
      '.bq-mood-widget-btn:hover { background: #4a6d4c; }',
      '',
      '@media (prefers-reduced-motion: reduce) {',
      '  .bq-mood-option:hover { transform: none; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // 自动注入样式
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }

  global.BioQuestMoodTracker = {
    MOOD_VALUES: MOOD_VALUES,
    MOOD_LABELS: MOOD_LABELS,
    CRISIS_KEYWORDS: CRISIS_KEYWORDS,
    STORAGE_KEY: STORAGE_KEY,
    logMood: logMood,
    detectCrisis: detectCrisis,
    showCrisisResource: showCrisisResource,
    showCheckinModal: showCheckinModal,
    renderMoodWidget: renderMoodWidget,
    getRecentLogs: getRecentLogs,
    getTodayLogs: getTodayLogs,
    computeStressIndex: computeStressIndex,
    getStressLevel: getStressLevel,
    injectStyles: injectStyles
  };
})(window);
