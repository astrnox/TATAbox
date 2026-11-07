/**
 * ============================================================
 * TATABOX — 轻量级成就 / 激励引擎（游客与本地场景）
 * 用途：在「未登录 / 本地」场景提供成就触发判定、解锁动画与本地存储，
 *      登录用户的云端徽章面板（user.js + supabase）保持原样，二者互不干扰。
 * 依赖（可选）：window.renderBadgeSvg（js/engagement/badge-motifs.js）渲染手绘徽章 SVG；
 *      未加载时回退为本引擎内置的 emoji 兜底图。
 * 数据源（localStorage）：bioquest_records / bioquest_favorites /
 *      bioquest_wrong_questions / bioquest_habits / bioquest_progress_stats
 * 对外 API：window.BioQuestAchievements = { evaluate, unlock, render, getEarned, reset }
 * 自动触发：DOMContentLoaded 后 evaluate 一次；监听 'bq:record-saved'（storage.js）
 *      与 'bq:streak-updated'（习惯场景可选）再 evaluate。
 * ============================================================
 */
(function (root) {
  'use strict';

  var STORE_KEY = 'tatabox_achievements';
  var UNLOCKED_EVENT = 'bq:achievement-unlocked';

  /* ---------- 成就定义（数据源单表，便于测试与维护） ----------
   * check(counts) 为纯判定函数；counts = {
   *   practiceCount: 累计答题量（records[].totalQuestions 之和）,
   *   favoritesCount: 收藏数量, wrongCount: 错题本数量, maxStreak: 连续打卡最大天数
   * }
   */
  var ACHIEVEMENTS = [
    /* 首练 */
    { key: 'first_practice', tier: 'bronze', name: '首战告捷', desc: '完成第一次练习', emoji: '\u270F\uFE0F',
      check: function (c) { return c.recordCount >= 1; } },
    /* 累计练习 */
    { key: 'practice_10',  tier: 'bronze', name: '小试牛刀', desc: '累计练习 10 题',  emoji: '\uD83D\uDCDA',
      check: function (c) { return c.practiceCount >= 10; } },
    { key: 'practice_50',  tier: 'silver', name: '渐入佳境', desc: '累计练习 50 题',  emoji: '\uD83D\uDCDA',
      check: function (c) { return c.practiceCount >= 50; } },
    { key: 'practice_200', tier: 'gold',   name: '题海达人', desc: '累计练习 200 题', emoji: '\uD83C\uDFC6',
      check: function (c) { return c.practiceCount >= 200; } },
    /* 收藏 */
    { key: 'favorite_1',  tier: 'bronze', name: '初遇心仪', desc: '收藏第一道题',       emoji: '\u2B50',
      check: function (c) { return c.favoritesCount >= 1; } },
    { key: 'favorite_20', tier: 'silver', name: '收藏达人', desc: '累计收藏 20 道题',   emoji: '\u2B50',
      check: function (c) { return c.favoritesCount >= 20; } },
    /* 错题本 */
    { key: 'wrong_5',     tier: 'bronze', name: '查漏先锋', desc: '错题本收录 5 道题', emoji: '\uD83D\uDD0D',
      check: function (c) { return c.wrongCount >= 5; } },
    /* 连续打卡 */
    { key: 'streak_3',  tier: 'bronze', name: '三日之约', desc: '连续打卡 3 天',  emoji: '\uD83D\uDD25',
      check: function (c) { return c.maxStreak >= 3; } },
    { key: 'streak_7',  tier: 'silver', name: '七日习惯', desc: '连续打卡 7 天',  emoji: '\uD83D\uDD25',
      check: function (c) { return c.maxStreak >= 7; } },
    { key: 'streak_30', tier: 'gold',   name: '坚持之巅', desc: '连续打卡 30 天', emoji: '\uD83D\uDD25',
      check: function (c) { return c.maxStreak >= 30; } }
  ];

  /* 按 key 建立索引 */
  var BY_KEY = {};
  for (var ai = 0; ai < ACHIEVEMENTS.length; ai++) BY_KEY[ACHIEVEMENTS[ai].key] = ACHIEVEMENTS[ai];

  /* ---------- 底层存储工具（经 root.localStorage，沿用仓库 safeGet/setJSON 习惯） ---------- */

  function getStore() {
    var arr;
    try {
      var raw = root && root.localStorage && root.localStorage.getItem(STORE_KEY);
      arr = raw ? JSON.parse(raw) : [];
    } catch (e) { arr = []; }
    return Array.isArray(arr) ? arr : [];
  }

  function setStore(arr) {
    arr = Array.isArray(arr) ? arr : [];
    try {
      if (root && root.localStorage) root.localStorage.setItem(STORE_KEY, JSON.stringify(arr));
    } catch (e) { /* 配额等异常静默，不影响业务 */ }
  }

  /* ---------- 纯判定 ---------- */

  /**
   * 将 evaluate 入参规范化为计数。
   * @param {object} stats - { records, favorites, wrongCount, maxStreak }
   *   records: 数组（bioquest_records）或数字（答题量/条数）；favorites: 数组或数字；wrongCount/maxStreak 数字。
   */
  function normalizeCounts(stats) {
    stats = stats || {};
    var records = stats.records;
    var practiceCount = 0;
    var recordCount = 0;
    if (Array.isArray(records)) {
      recordCount = records.length;
      for (var i = 0; i < records.length; i++) {
        var t = records[i] && records[i].totalQuestions;
        practiceCount += (typeof t === 'number' && t > 0) ? t : 0;
      }
    } else if (typeof records === 'number' && records > 0) {
      practiceCount = records;
      recordCount = records;
    }

    function lenOf(v, fallback) {
      if (typeof v === 'number') return v;
      if (Array.isArray(v)) return v.length;
      return fallback || 0;
    }
    var favoritesCount = lenOf(stats.favorites);
    var wrongCount = lenOf(stats.wrongCount, lenOf(stats.wrong));
    var maxStreak = (typeof stats.maxStreak === 'number' && stats.maxStreak > 0) ? stats.maxStreak : 0;

    return {
      practiceCount: practiceCount,
      recordCount: recordCount,
      favoritesCount: favoritesCount,
      wrongCount: wrongCount,
      maxStreak: maxStreak
    };
  }

  function makeEntry(def) {
    var earnedAt = Date.now();
    // 优先让外部传入时间（便于测试种子），否则用当前时间
    return {
      key: def.key,
      name: def.name,
      desc: def.desc,
      tier: def.tier,
      emoji: def.emoji,
      earnedAt: earnedAt
    };
  }

  function earnedKeyMap() {
    var earned = getStore();
    var map = {};
    for (var i = 0; i < earned.length; i++) map[earned[i].key] = true;
    return map;
  }

  /**
   * 纯函数：给定状态快照，返回「应新解锁但尚未解锁」的成就条目数组（不落盘、不弹 toast）。
   * @param {object} stats - { records, favorites, wrongCount, maxStreak }
   * @returns {Array<{key,name,desc,tier,emoji,earnedAt}>}
   */
  function evaluate(stats) {
    var counts = normalizeCounts(stats);
    var earned = earnedKeyMap();
    var newly = [];
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      var def = ACHIEVEMENTS[i];
      var satisfied = !!def.check(counts);
      if (satisfied && !earned[def.key]) {
        newly.push(makeEntry(def));
      }
    }
    return newly;
  }

  /* ---------- 解锁动作 ---------- */

  function toEntry(item) {
    if (!item) return null;
    if (typeof item === 'string') {
      var def = BY_KEY[item];
      return def ? makeEntry(def) : null;
    }
    if (typeof item === 'object' && item.key) {
      var def2 = BY_KEY[item.key];
      if (!def2) return null;
      var entry = makeEntry(def2);
      if (item.name !== undefined) entry.name = item.name;
      if (item.desc !== undefined) entry.desc = item.desc;
      if (item.emoji !== undefined) entry.emoji = item.emoji;
      if (item.earnedAt !== undefined) entry.earnedAt = item.earnedAt;
      return entry;
    }
    return null;
  }

  function emitUnlocked(entry) {
    try {
      if (root && typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
        root.dispatchEvent(new root.CustomEvent(UNLOCKED_EVENT, { detail: entry }));
      }
    } catch (e) { /* 事件派发失败不影响解锁持久化 */ }
  }

  function showToast(entry) {
    try {
      if (typeof document === 'undefined' || !document.body || typeof document.createElement !== 'function') return;
      var toast = document.createElement('div');
      toast.className = 'bq-ach-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');

      var badgeHtml = '';
      if (typeof root.renderBadgeSvg === 'function') {
        try { badgeHtml = root.renderBadgeSvg(entry.key, { size: 44, earned: true }); } catch (e) { badgeHtml = ''; }
      }
      if (!badgeHtml) {
        badgeHtml = '<span class="bq-ach-toast__emoji" aria-hidden="true">' + entry.emoji + '</span>';
      }

      toast.innerHTML =
        '<div class="bq-ach-toast__inner">' +
          '<div class="bq-ach-toast__badge">' + badgeHtml + '</div>' +
          '<div class="bq-ach-toast__body">' +
            '<div class="bq-ach-toast__tag">\uD83C\uDF1F 成就解锁</div>' +
            '<div class="bq-ach-toast__name"></div>' +
            '<div class="bq-ach-toast__desc"></div>' +
          '</div>' +
        '</div>';

      var nameEl = toast.querySelector('.bq-ach-toast__name');
      if (nameEl && nameEl.textContent !== undefined) nameEl.textContent = entry.name;
      var descEl = toast.querySelector('.bq-ach-toast__desc');
      if (descEl && descEl.textContent !== undefined) descEl.textContent = entry.desc;

      document.body.appendChild(toast);
      void toast.offsetWidth; // 触发重排以启动进入动画
      toast.classList.add('bq-ach-toast--show');

      setTimeout(function () {
        toast.classList.remove('bq-ach-toast--show');
        setTimeout(function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 600);
      }, 2400);
    } catch (e) { /* toast 仅为增强，失败静默 */ }
  }

  function _escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * 解锁单个成就：持久化 + 弹 toast + 派发事件。
   * @param {string|object} item - 成就 key 或 { key, name?, desc?, emoji?, earnedAt? }
   * @returns {object|null} 生成的成就条目
   */
  function unlock(item) {
    var entry = toEntry(item);
    if (!entry) return null;
    var earned = getStore();
    for (var i = 0; i < earned.length; i++) {
      if (earned[i].key === entry.key) return earned[i]; // 已解锁，幂等跳过
    }
    earned.push(entry);
    setStore(earned);
    showToast(entry);
    emitUnlocked(entry);
    return entry;
  }

  /**
   * 便捷入口：判定 + 全部解锁（供自动触发与外部调用）。
   * @param {object} stats - 同 evaluate
   * @returns {Array} 实际新解锁的条目
   */
  function checkAndUnlock(stats) {
    var newly = evaluate(stats);
    var unlocked = [];
    for (var i = 0; i < newly.length; i++) {
      var done = unlock(newly[i]);
      if (done) unlocked.push(done);
    }
    return unlocked;
  }

  /* ---------- 查询 / 重置 ---------- */

  function getEarned() {
    return getStore();
  }

  function reset() {
    var had = getStore().length;
    try {
      if (root && root.localStorage) root.localStorage.removeItem(STORE_KEY);
    } catch (e) { /* ignore */ }
    return had;
  }

  /* ---------- 本地数据收集（自动触发用） ---------- */

  function _safeParse(key, def) {
    try {
      var raw = root && root.localStorage && root.localStorage.getItem(key);
      var v = raw ? JSON.parse(raw) : def;
      return v === undefined || v === null ? def : v;
    } catch (e) { return def; }
  }

  function _todayStr() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function _addDays(dateStr, delta) {
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() + delta);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  /**
   * 参照 habits.js 的语义：统计每个「活跃习惯」以今天（或昨天）为连续天数的当前连续天数，
   * 取其最大值作为 maxStreak（不重复实现 habits 的完整热力图，仅取关键连续段）。
   */
  function gatherMaxStreak() {
    // 1) 优先读进度统计快照（若已含连续信息）
    try {
      var snap = _safeParse('tatabox_progress_stats', null);
      var sd = snap && snap.data;
      if (sd && (typeof sd.maxStreak === 'number' || typeof sd.streak === 'number')) {
        return Math.max(sd.maxStreak || 0, sd.streak || 0);
      }
    } catch (e) {}

    // 2) 基于习惯打卡日志计算
    try {
      var habits = _safeParse('tatabox_habits', []);
      var logs = _safeParse('tatabox_habit_logs', []);
      if (!Array.isArray(habits) || !Array.isArray(logs) || !logs.length) return 0;
      var max = 0;
      var i, h;
      for (i = 0; i < habits.length; i++) {
        h = habits[i];
        if (!h || (h.active === false)) continue;
        var ones = {};
        var j;
        for (j = 0; j < logs.length; j++) {
          if (logs[j] && logs[j].habitId === h.id && logs[j].completed && logs[j].date) {
            ones[logs[j].date] = true;
          }
        }
        var today = _todayStr();
        var hToday = !!ones[today];
        var checkDate = hToday ? today : _addDays(today, -1);
        var streak = 0;
        while (ones[checkDate]) {
          streak++;
          checkDate = _addDays(checkDate, -1);
        }
        if (streak > max) max = streak;
      }
      return max;
    } catch (e) { return 0; }
  }

  /**
   * 从 localStorage 收集当前本地状态快照供 evaluate。
   * @returns {{records:Array, favorites:number, wrongCount:number, maxStreak:number}}
   */
  function gatherStats() {
    var stats = { records: [], favorites: 0, wrongCount: 0, maxStreak: 0 };
    try {
      var recs = _safeParse('tatabox_records', []);
      stats.records = Array.isArray(recs) ? recs : [];
    } catch (e) { stats.records = []; }
    try {
      var favs = _safeParse('tatabox_favorites', []);
      stats.favorites = Array.isArray(favs) ? favs.length : (typeof favs === 'number' ? favs : 0);
    } catch (e) { stats.favorites = 0; }
    try {
      var wrongs = _safeParse('tatabox_wrong_questions', []);
      stats.wrongCount = Array.isArray(wrongs) ? wrongs.length : (typeof wrongs === 'number' ? wrongs : 0);
    } catch (e) { stats.wrongCount = 0; }
    stats.maxStreak = gatherMaxStreak();
    return stats;
  }

  /* ---------- 面板渲染 ---------- */

  function badgeHtml(def, earned) {
    if (typeof root.renderBadgeSvg === 'function') {
      try { return root.renderBadgeSvg(def.key, { size: 40, earned: earned }); } catch (e) {}
    }
    return '<span class="bq-ach__emoji">' + def.emoji + '</span>';
  }

  /**
   * 将成就面板渲染到指定容器。
   * @param {Element} containerEl
   */
  function render(containerEl) {
    if (!containerEl || typeof document === 'undefined') return;
    var earnedMap = earnedKeyMap();
    var earnedCount = 0;
    for (var k in earnedMap) { if (Object.prototype.hasOwnProperty.call(earnedMap, k)) earnedCount++; }

    var html = '<div class="bq-ach">' +
      '<div class="bq-ach__head">' +
        '<div class="bq-ach__title">成就徽章</div>' +
        '<div class="bq-ach__summary">已获得 ' + earnedCount + ' / ' + ACHIEVEMENTS.length + '</div>' +
      '</div>' +
      '<div class="bq-ach__grid">';

    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      var def = ACHIEVEMENTS[i];
      var isEarned = !!earnedMap[def.key];
      html += '<div class="bq-ach__item' + (isEarned ? ' bq-ach__item--earned' : '') + '" data-key="' + _escapeHtml(def.key) + '">' +
        '<div class="bq-ach__badge">' + badgeHtml(def, isEarned) + '</div>' +
        '<div class="bq-ach__name">' + _escapeHtml(def.name) + '</div>' +
        '<div class="bq-ach__desc">' + _escapeHtml(def.desc) + '</div>' +
      '</div>';
    }

    html += '</div></div>';
    containerEl.innerHTML = html;
  }

  /* ---------- 自动触发 ---------- */

  function reevaluate() {
    try {
      checkAndUnlock(gatherStats());
    } catch (e) { /* 自动触发失败静默，不阻塞页面 */ }
  }

  function init() {
    if (!root || typeof root.addEventListener !== 'function') return;
    var done = false;
    function onReady() {
      if (done) return;
      done = true;
      reevaluate();
    }
    if (root.document && root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', onReady);
    } else {
      // 兼容脚本较晚加载的情况
      setTimeout(onReady, 0);
    }
    // storage.js 保存练习成功后派发
    root.addEventListener('bq:record-saved', reevaluate);
    // 习惯场景（可选）连续打卡更新后派发
    root.addEventListener('bq:streak-updated', reevaluate);
  }

  /* ---------- 导出 ---------- */

  var api = {
    evaluate: evaluate,
    unlock: unlock,
    checkAndUnlock: checkAndUnlock,
    render: render,
    getEarned: getEarned,
    reset: reset,
    // 测试挂载：纯判定逻辑 + 内部数据，供 node 沙箱直接断言
    __test: {
      ACHIEVEMENTS: ACHIEVEMENTS,
      normalizeCounts: normalizeCounts,
      evaluate: evaluate,
      gatherStats: gatherStats,
      gatherMaxStreak: gatherMaxStreak,
      STORE_KEY: STORE_KEY
    }
  };

  if (root) {
    root.BioQuestAchievements = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  init();
})(typeof window !== 'undefined' ? window : null);