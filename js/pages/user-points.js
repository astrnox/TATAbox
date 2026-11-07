/**
 * TATABOX — 信用积分系统（M-01 自 user.js 拆分）
 * ============================================================
 * 由 loadModule('user') 依赖链先于 user.js 加载；addPoints 等入口保持全局。
 */
'use strict';

var _POINTS_STORAGE = 'tatabox_credit_state';
var _POINTS_DEFAULTS = {
  BASE: 100,                 // 基础信任值，不随时间衰减
  DECAY_DAYS: 90,            // 信任增量经过多久全部清零（线性衰减）
  MIN: 0,                    // 下限
  // 符合社区期望的行为 → 获得信任增量（会随时间衰减）
  REWARD: {
    POST: 2.0,               // 发帖
    COMMENT: 0.8,            // 评论
    ANSWER_CORRECT: 0.5,     // 单次答题正确
    ANSWER_WRONG: 0.1,       // 单次答题错误（也有微弱鼓励）
    DAILY_LOGIN: 0.3         // 每日首启
  },
  // 违规行为 → 直接扣减（永久，不受时间恢复）
  PENALTY: {
    SPAM: 15,
    BAD_SPEECH: 25,
    FALSE_REPORT_SINGLE: 3,
    FALSE_REPORT_REPEAT: 10
  }
};

// 信任等级（由当前信用指数推导；指数越高，社区信任越高）
var _POINTS_LEVELS = [
  { min: 0,   label: '不受信任', title: '不受信任', color: '#c0553a' },
  { min: 10,  label: '极低信任', title: '极低信任', color: '#d47030' },
  { min: 30,  label: '有限信任', title: '有限信任', color: '#c49b30' },
  { min: 50,  label: '基本信任', title: '基本信任', color: '#5a7d5c' },
  { min: 80,  label: '高度信任', title: '高度信任', color: '#3a8c5c' },
  { min: 100, label: '极高信任', title: '极高信任', color: '#ffd700' }
];

function _getPointsState() {
  try {
    var raw = localStorage.getItem(_POINTS_STORAGE);
    var st = raw ? JSON.parse(raw) : null;
    if (!st || typeof st !== 'object') throw new Error('empty');
    if (typeof st.base !== 'number' || !isFinite(st.base)) st.base = _POINTS_DEFAULTS.BASE;
    if (!Array.isArray(st.fragments)) st.fragments = [];
    if (typeof st.decayDays !== 'number') st.decayDays = _POINTS_DEFAULTS.DECAY_DAYS;
    if (typeof st.lastDecayTs !== 'number') st.lastDecayTs = Date.now();
    if (!Array.isArray(st.history)) st.history = [];
    return st;
  } catch (e) {
    return { base: _POINTS_DEFAULTS.BASE, fragments: [], decayDays: _POINTS_DEFAULTS.DECAY_DAYS, lastDecayTs: Date.now(), history: [] };
  }
}

function _savePointsState(st) {
  try {
    // history 限长 200
    if (Array.isArray(st.history) && st.history.length > 200) {
      st.history = st.history.slice(st.history.length - 200);
    }
    localStorage.setItem(_POINTS_STORAGE, JSON.stringify(st));
  } catch (e) {}
}

function _appendPointsHistory(st, type, amount, reason, note) {
  try {
    st.history.push({ ts: Date.now(), type: type, amount: amount, reason: reason || '', note: note || '' });
  } catch (e) {}
}

// 对信任增量做线性衰减：每笔在 decayDays 天后 remaining 从 delta → 0
function _applyPointsDecay(st) {
  var now = Date.now();
  var totalMs = Math.max(1, st.decayDays) * 24 * 60 * 60 * 1000;
  var newFrag = [];
  for (var i = 0; i < st.fragments.length; i++) {
    var f = st.fragments[i];
    if (!f || typeof f.delta !== 'number' || f.delta <= 0) continue;
    var age = now - (f.ts || now);
    var ratio = Math.min(1, Math.max(0, age / totalMs));
    var remaining = Math.max(0, f.delta * (1 - ratio));
    if (remaining > 0.001) newFrag.push({ ts: f.ts, delta: f.delta, remaining: remaining });
  }
  st.fragments = newFrag;
  st.lastDecayTs = now;
  return st;
}

// 当前信用指数 = base + Σ(fragment.remaining)，结果 ≥ MIN
function _computePointsTotal(st) {
  var sum = 0;
  for (var i = 0; i < st.fragments.length; i++) sum += (st.fragments[i] && st.fragments[i].remaining) || 0;
  return Math.max(_POINTS_DEFAULTS.MIN, st.base + sum);
}

function _getPointsDecayed() {
  var st = _getPointsState();
  _applyPointsDecay(st);
  _savePointsState(st);
  return { state: st, total: _computePointsTotal(st) };
}

/** 对外：获取当前信用指数（保留 1 位小数） */
function getPoints() {
  return Math.round(_getPointsDecayed().total * 10) / 10;
}

/** 对外：获取带明细的对象（信用中心展示用） */
function getPointsDetail() {
  var d = _getPointsDecayed();
  var total = Math.round(d.total * 10) / 10;
  return {
    total: total,
    base: d.state.base,
    level: getPointsLevel(total),
    history: (d.state.history || []).slice().reverse()
  };
}

/** 信任等级推导：由当前信用指数阈值推导 */
function getPointsLevel(points) {
  var total = (typeof points === 'number' && isFinite(points)) ? Math.max(0, points) : getPoints();
  var current = _POINTS_LEVELS[0];
  var next = null;
  for (var i = 0; i < _POINTS_LEVELS.length; i++) {
    var lv = _POINTS_LEVELS[i];
    if (total >= lv.min) { current = lv; next = _POINTS_LEVELS[i + 1] || null; }
  }
  var curMin = current.min;
  var nxtMin = next ? next.min : curMin;
  var span = Math.max(1, nxtMin - curMin);
  var progress = next ? Math.min(1, Math.max(0, (total - curMin) / span)) : 1;
  return {
    label: current.label,
    title: current.title,
    color: current.color,
    min: curMin,
    nextAt: next ? nxtMin : null,
    progress: Math.round(progress * 1000) / 1000
  };
}

/**
 * 获得信任增量（符合社区期望的行为）
 * @param {string} reasonKey - 'POST' | 'COMMENT' | 'ANSWER_CORRECT' | 'ANSWER_WRONG' | 'DAILY_LOGIN'
 * @param {number} [amount] - 可选，覆盖默认值
 * @returns {number} 最新信用指数
 */
function addPoints(reasonKey, amount) {
  var d = _getPointsDecayed();
  var st = d.state;
  var def = _POINTS_DEFAULTS.REWARD;
  var amt = (typeof amount === 'number' && isFinite(amount)) ? amount : (def[reasonKey] || 0);
  if (amt > 0) {
    st.fragments.push({ ts: Date.now(), delta: amt, remaining: amt });
    _appendPointsHistory(st, 'reward', amt, reasonKey || '');
  }
  _savePointsState(st);
  _trySyncPointsToCloud();
  _tryRefreshPointsBadge();
  return getPoints();
}

/**
 * 消费信任（做出对社区影响更大的行为：发帖/评论/悬赏/举报）
 * 优先扣减未衰减的信任增量，不够再扣基础值（永久）
 * @param {string} reasonKey
 * @param {number} [amount] - 可选，覆盖默认值
 * @returns {number} 最新信用指数
 */
function deductPoints(reasonKey, amount) {
  var d = _getPointsDecayed();
  var st = d.state;
  var amt = (typeof amount === 'number' && isFinite(amount)) ? amount : 0;
  var remaining = amt;
  for (var i = 0; i < st.fragments.length && remaining > 0; i++) {
    var f = st.fragments[i];
    if (!f) continue;
    if (f.remaining <= remaining) { remaining -= f.remaining; f.remaining = 0; }
    else { f.remaining -= remaining; remaining = 0; }
  }
  st.fragments = st.fragments.filter(function (f) { return f && f.remaining > 0.001; });
  if (remaining > 0) st.base = Math.max(_POINTS_DEFAULTS.MIN, st.base - remaining);
  if (amt > 0) _appendPointsHistory(st, 'spend', -amt, reasonKey || '');
  _savePointsState(st);
  _trySyncPointsToCloud();
  _tryRefreshPointsBadge();
  return getPoints();
}

/**
 * 违规扣减（恶意行为，永久）
 * @param {string} reasonKey - 'SPAM' | 'BAD_SPEECH' | 'FALSE_REPORT_SINGLE' | 'FALSE_REPORT_REPEAT'
 * @param {number} [amount]
 * @returns {number} 最新信用指数
 */
function penalizePoints(reasonKey, amount) {
  var d = _getPointsDecayed();
  var st = d.state;
  var amt = (typeof amount === 'number' && isFinite(amount)) ? amount : (_POINTS_DEFAULTS.PENALTY[reasonKey] || 0);
  var remaining = amt;
  for (var i = 0; i < st.fragments.length && remaining > 0; i++) {
    var f = st.fragments[i];
    if (!f) continue;
    if (f.remaining <= remaining) { remaining -= f.remaining; f.remaining = 0; }
    else { f.remaining -= remaining; remaining = 0; }
  }
  st.fragments = st.fragments.filter(function (f) { return f && f.remaining > 0.001; });
  if (remaining > 0) st.base = Math.max(_POINTS_DEFAULTS.MIN, st.base - remaining);
  if (amt > 0) _appendPointsHistory(st, 'penalty', -amt, reasonKey || '');
  _savePointsState(st);
  _trySyncPointsToCloud();
  _tryRefreshPointsBadge();
  return getPoints();
}

/**
 * 手动重置信用指数（管理员/初始化用）
 */
function resetPoints() {
  var st = { base: _POINTS_DEFAULTS.BASE, fragments: [], decayDays: _POINTS_DEFAULTS.DECAY_DAYS, lastDecayTs: Date.now(), history: [] };
  _savePointsState(st);
  _tryRefreshPointsBadge();
  return st.base;
}

/** 云端同步：本地信用指数变更后调用（函数在 supabase-client.js 中挂载，未挂载则静默） */
function _trySyncPointsToCloud() {
  try {
    if (typeof window.syncPointsToCloud === 'function') window.syncPointsToCloud(getPoints());
  } catch (e) {}
}

function _tryRefreshPointsBadge() {
  try {
    if (typeof window.refreshPointsBadge === 'function') window.refreshPointsBadge();
  } catch (e) {}
}

window.getPoints = getPoints;
window.getPointsDetail = getPointsDetail;
window.getPointsLevel = getPointsLevel;
window.addPoints = addPoints;
window.deductPoints = deductPoints;
window.penalizePoints = penalizePoints;
window.resetPoints = resetPoints;
window.POINTS_DEFAULTS = _POINTS_DEFAULTS;
window.POINTS_LEVELS = _POINTS_LEVELS;

// 每日首次启动 → 微弱信任增量
(function _pointsDailyLoginReward() {
  try {
    var LAST_KEY = 'tatabox_credit_last_login_day';
    var today = new Date();
    var tag = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
    var last = localStorage.getItem(LAST_KEY);
    if (last !== tag) {
      localStorage.setItem(LAST_KEY, tag);
      // 给 addPoints 一点时间等 getPoints 挂好
      setTimeout(function () {
        try { addPoints('DAILY_LOGIN'); } catch (e) {}
      }, 2000);
    }
  } catch (e) {}
})();

// 降级复制方案（clipboard API 不可用时）

window.addPoints = addPoints;
window.deductPoints = deductPoints;
window.penalizePoints = penalizePoints;
window.getPoints = getPoints;
window.getPointsDetail = getPointsDetail;
window.getPointsLevel = getPointsLevel;
window.resetPoints = resetPoints;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.user = BQ.user || {};
  BQ.user.points = { addPoints: addPoints, deductPoints: deductPoints, penalizePoints: penalizePoints, getPoints: getPoints, getPointsDetail: getPointsDetail, getPointsLevel: getPointsLevel, resetPoints: resetPoints };
})();
