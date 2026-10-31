/**
 * ============================================================
 * TATABOX — 用户中心模块
 * 设置面板、数据管理、学习记录、收藏夹、存储用量
 * ============================================================
 */

'use strict';

// M-01：userStylesInjected 已随 injectUserStyles 迁入 user-styles.js

// CSP 安全的事件委托 wrapper（由 data-on 委托调用，供内联处理器改造使用）
window._cspSetBg = function (color) { if (this) this.style.background = color; };
window._cspClearNotifs = function () {
  if (typeof BioQuestNotifications === 'object' && BioQuestNotifications) BioQuestNotifications.clear();
  renderNotificationsPanel(document.getElementById('userSubPageBody'));
};

// escapeHtml 本地 fallback：优先使用全局函数，否则使用内联实现
var escapeHtml = (typeof window !== 'undefined' ? window : globalThis).escapeHtml; // 规范实现见 js/core/utils.js（Q-01 统一）

function showToast(message) {
  const existing = document.querySelector('.user-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'user-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 2200);
}


/**
 * 获取当前头像 URL
 * 优先 localStorage，其次 user.avatar_url，都没有返回 null（用首字母兜底）
 */
var _USER_KEY_STORAGE = 'bioquest_user_key';

// 获取或生成本机用户密钥（8 位字母数字，易于口头传达）
function _getUserKey() {
  try {
    var k = localStorage.getItem(_USER_KEY_STORAGE);
    if (k && k.length === 8) return k;
    // 生成新密钥：排除易混字符 0/O/1/I/L
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var key = '';
    for (var i = 0; i < 8; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    localStorage.setItem(_USER_KEY_STORAGE, key);
    return key;
  } catch (e) {
    return 'XXXXXXXX';
  }
}

// 验证密钥格式（8 位大写字母数字，排除易混字符）
function _isValidUserKey(key) {
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(key);
}

window._getUserKey = _getUserKey;
window._isValidUserKey = _isValidUserKey;

/* ============================================================
 * 信用指数（Trust / Credit）系统
 *  - 信用点（CR）不是经验值、不是货币，而是社区对用户信任程度的量化
 *  - 通过符合社区期望的行为获得信任增量；信任增量会随时间线性衰减回 0
 *  - 消费信任以做出对社区影响更大的行为（发帖/评论/悬赏/举报）
 *  - 违规行为直接扣减总量，并同步拉低未衰减的信任增量
 *  - 持久化：localStorage.bioquest_credit_state =
 *      { base, fragments:[{ts,delta,remaining}], decayDays, lastDecayTs, history:[...] }
 * ============================================================ */
function _fallbackCopy(text) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('密钥已复制：' + text);
  } catch (e) {
    showToast('复制失败，请手动选择密钥文本');
  }
}
window._fallbackCopy = _fallbackCopy;

// 构建带用户 API Key 的请求头（供 tutor/discussion 等模块复用）
// 返回 { headers: {...}, isCustom: bool }，isCustom=true 表示使用用户自定义 Key
window._buildAiHeaders = function(extra) {
  var headers = extra || {};
  headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  var cfg = _loadApiKeyConfig();
  if (cfg.apiKey) {
    headers['X-User-Api-Key'] = cfg.apiKey;
    headers['X-User-Provider'] = cfg.provider || 'deepseek';
    if (cfg.model) headers['X-User-Model'] = cfg.model;
    return { headers: headers, isCustom: true };
  }
  return { headers: headers, isCustom: false };
};

