/**
 * ============================================================
 * TATABOX - 管理员后台模块
 * 题目管理、用户管理、密钥验证
 * 设计风格：与主站一致，深绿/琥珀色系，衬线字体
 * ============================================================
 */

var _adminAuthenticated = false;

// admin modal 焦点陷阱管理（统一通过 MutationObserver 监听 display 变化）
var _adminModalTraps = {};

var ADMIN_TOKEN_TTL = 5 * 60 * 1000;            // 管理员 token 有效期（5 分钟）
var ADMIN_COUNT_LIMIT = 100000;                 // 统计总数用的查询 limit
var ADMIN_CARDS_COUNT_LIMIT = 1000;             // 卡片统计查询 limit
var ADMIN_LIST_LIMIT = 100;                     // 列表查询默认 limit
var ADMIN_FEEDBACK_LIMIT = 200;                 // 反馈/举报列表查询 limit
var ADMIN_ANNOUNCEMENT_LIMIT = 50;              // 公告列表查询 limit
var ADMIN_IMAGE_MAX_BYTES = 2 * 1024 * 1024;    // 题目配图上传大小上限（2MB）
var ADMIN_EBOOK_MAX_BYTES = 50 * 1024 * 1024;   // PDF 上传大小上限（50MB）
var ADMIN_EBOOK_UPLOAD_TIMEOUT_MS = 300000;     // 大文件上传超时（5 分钟）
var ADMIN_EBOOK_RETRY_BASE_DELAY_MS = 2000;     // 上传失败重试退避基础延迟
var OCR_MAX_IMAGES = 10;                        // OCR 单次最多处理图片数
var OCR_IMAGE_MAX_BYTES = 5 * 1024 * 1024;      // OCR 单图大小上限（5MB）
var ADMIN_TOAST_DISPLAY_MS = 2500;              // 后台 Toast 默认展示时长
var AI_GEN_MAX_TOKENS = 4096;                   // AI 题目生成最大 token 数

function _getAdminModalTitle(overlay) {
  var titleEl = overlay.querySelector('.admin-modal-title, h3');
  return titleEl ? titleEl.textContent.trim() : '管理弹窗';
}

function _applyAdminModalA11y(overlay) {
  if (!overlay) return;
  if (!overlay.getAttribute('role')) overlay.setAttribute('role', 'dialog');
  if (overlay.getAttribute('aria-modal') !== 'true') overlay.setAttribute('aria-modal', 'true');
  var title = _getAdminModalTitle(overlay);
  if (title && !overlay.getAttribute('aria-label') && !overlay.getAttribute('aria-labelledby')) {
    overlay.setAttribute('aria-label', title);
  }
}

function _trapAdminModal(overlay) {
  if (!overlay || !window.BioQuestA11y || typeof window.BioQuestA11y.trapFocus !== 'function') return;
  var id = overlay.id || ('admin-modal-' + Math.random().toString(36).slice(2, 9));
  if (!overlay.id) overlay.id = id;
  if (_adminModalTraps[id]) { _adminModalTraps[id].release(); _adminModalTraps[id] = null; }
  _applyAdminModalA11y(overlay);
  var firstFocus = overlay.querySelector('input, select, textarea, button, a[href]');
  _adminModalTraps[id] = window.BioQuestA11y.trapFocus(overlay, {
    onEscape: function() {
      // 尝试调用常见的关闭函数；若不存在则隐藏 overlay
      var closeFn = window['closeUserModal'] || window['closeMuteModal'] || window['closePostStatModal'] ||
                    window['closeCardModal'] || window['closeQuestionModal'] || window['closePostDetailModal'] ||
                    window['closeCommentsModal'];
      if (typeof closeFn === 'function') {
        try { closeFn(); } catch (e) {}
      } else {
        overlay.style.display = 'none';
      }
    },
    initialFocus: firstFocus || overlay.querySelector('.admin-modal-close') || overlay
  });
}

function _releaseAdminModal(overlay) {
  if (!overlay || !overlay.id) return;
  var trap = _adminModalTraps[overlay.id];
  if (trap) { trap.release(); delete _adminModalTraps[overlay.id]; }
}

function _initAdminModalObserver() {
  if (typeof MutationObserver === 'undefined') return;
  var observer = new MutationObserver(function(records) {
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      // 属性变化：监听 style.display
      if (record.type === 'attributes' && record.attributeName === 'style') {
        var target = record.target;
        if (!target.classList || !target.classList.contains('admin-modal-overlay')) continue;
        if (target.style.display === 'flex' || target.style.display === 'block') {
          _trapAdminModal(target);
        } else if (target.style.display === 'none') {
          _releaseAdminModal(target);
        }
      }
      // 子树变化：为新创建的 overlay 初始化并监控
      if (record.type === 'childList') {
        var added = record.addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.classList && node.classList.contains('admin-modal-overlay')) {
            _applyAdminModalA11y(node);
            if (node.style.display === 'flex' || node.style.display === 'block') {
              _trapAdminModal(node);
            }
            // 监听该节点的 style 变化
            observer.observe(node, { attributes: true, attributeFilter: ['style'] });
          }
          // 递归子元素
          var nested = node.querySelectorAll ? node.querySelectorAll('.admin-modal-overlay') : [];
          for (var k = 0; k < nested.length; k++) {
            _applyAdminModalA11y(nested[k]);
            if (nested[k].style.display === 'flex' || nested[k].style.display === 'block') {
              _trapAdminModal(nested[k]);
            }
            observer.observe(nested[k], { attributes: true, attributeFilter: ['style'] });
          }
        }
        // 节点被移除时释放
        var removed = record.removedNodes;
        for (var r = 0; r < removed.length; r++) {
          var rnode = removed[r];
          if (rnode.nodeType !== 1) continue;
          if (rnode.id && rnode.classList && rnode.classList.contains('admin-modal-overlay')) {
            _releaseAdminModal(rnode);
          }
          var rnested = rnode.querySelectorAll ? rnode.querySelectorAll('.admin-modal-overlay') : [];
          for (var rn = 0; rn < rnested.length; rn++) {
            _releaseAdminModal(rnested[rn]);
          }
        }
      }
    }
  });

  // 初始化现有 overlay
  var existing = document.querySelectorAll('.admin-modal-overlay');
  for (var e = 0; e < existing.length; e++) {
    _applyAdminModalA11y(existing[e]);
    observer.observe(existing[e], { attributes: true, attributeFilter: ['style'] });
  }
  // 监听 body 子树，捕获动态创建的 overlay
  observer.observe(document.body, { childList: true, subtree: true });
}

// DOM 就绪后启动监听
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initAdminModalObserver);
} else {
  _initAdminModalObserver();
}

// escapeHtml 本地 fallback
var escapeHtml = (typeof window !== 'undefined' ? window : globalThis).escapeHtml; // 规范实现见 js/core/utils.js（Q-01 统一）

// 修复：当 Supabase auth 状态变化时，admin 模块同步更新认证状态
// 管理员入口只认「管理员口令」验证（adminVerifyKey 写入的会话 token）；
// 账号本身 user_group=admin 不再自动解锁——杜绝「管理员账号密码直入」，
// 仅用于校正状态：非 admin 账号或登出时清除可能残留的解锁状态。
window._onAuthUserLoaded = function(user) {
  if (user && user.user_group !== 'admin') {
    // 普通用户登录时，清除可能残留的 admin 认证（user_group 非 admin 一律视为无权限）
    if (_adminAuthenticated) {
      _adminAuthenticated = false;
      sessionStorage.removeItem('bioquest_admin_auth');

    }
  } else if (!user) {
    // 用户登出时
    _adminAuthenticated = false;
    sessionStorage.removeItem('bioquest_admin_auth');
  }
};

// showToast 本地 fallback
function showToast(message) {
  if (typeof window.showToast === 'function' && window.showToast !== showToast) {
    window.showToast(message);
    return;
  }
  var existing = document.getElementById('admin-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'admin-toast';
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--color-deep,#1a3a2a);color:#fff;padding:12px 28px;border-radius:12px;font-size:0.88rem;z-index:9999;box-shadow:var(--shadow-lg);animation:slideUp 0.3s ease,fadeOut 0.3s ease 1.7s forwards;';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.remove(); }, 2200);
}

function injectAdminStyles() {
  const styleId = 'admin-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* ===== 管理员登录页 ===== */
    .admin-login-wrap {
      min-height: 70vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
    }

    .admin-login-card {
      width: 100%;
      max-width: 420px;
      background: var(--surface-primary, #ffffff);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: 16px;
      padding: 48px 40px;
      box-shadow: var(--shadow-lg);
      text-align: center;
      position: relative;
      overflow: hidden;
    }

    .admin-login-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: var(--color-sage, #5a7d5c);
    }

    .admin-login-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 20px;
      background: var(--color-sage, #5a7d5c);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow-md);
    }

    .admin-login-icon svg {
      width: 32px;
      height: 32px;
      stroke: #fff;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .admin-login-title {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 6px;
    }

    .admin-login-subtitle {
      font-size: 0.88rem;
      color: var(--text-muted, #8a8a8a);
      margin-bottom: 32px;
      line-height: 1.5;
    }

    .admin-login-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .admin-login-input-wrap {
      position: relative;
    }

    .admin-login-input-wrap svg {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      width: 18px;
      height: 18px;
      stroke: var(--text-muted, #8a8a8a);
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: stroke 0.2s;
    }

    .admin-login-input {
      width: 100%;
      padding: 14px 18px 14px 46px;
      border: 1.5px solid var(--border-light, #ece8e1);
      border-radius: 12px;
      font-size: 0.95rem;
      background: var(--surface-secondary, #faf7f2);
      transition: all 0.25s ease;
      box-sizing: border-box;
    }

    .admin-login-input:focus {
      outline: none;
      border-color: var(--color-sage, #5a7d5c);
      background: var(--surface-primary, #ffffff);
      box-shadow: 0 0 0 3px rgba(90,125,92,0.1);
    }

    .admin-login-input:focus + svg,
    .admin-login-input:focus ~ svg {
      stroke: var(--color-sage, #5a7d5c);
    }

    .admin-login-btn {
      padding: 14px 28px;
      background: var(--color-sage, #5a7d5c);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.25s ease;
      position: relative;
      overflow: hidden;
    }

    .admin-login-btn:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-lg);
    }

    .admin-login-btn:active {
      transform: translateY(0);
    }

    .admin-login-error {
      color: var(--color-error, #c0553a);
      font-size: 0.85rem;
      margin-top: 8px;
      display: none;
      animation: adminShake 0.4s ease;
    }

    @keyframes adminShake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-4px); }
      40%, 80% { transform: translateX(4px); }
    }

    .admin-login-hint {
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--border-light, #ece8e1);
      font-size: 0.78rem;
      color: var(--text-muted, #8a8a8a);
      line-height: 1.6;
    }

    /* ===== 管理员仪表盘 ===== */
    .admin-dash {
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 20px;
      animation: adminFadeIn 0.4s ease;
    }

    @keyframes adminFadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .admin-dash-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
      padding: 28px 32px;
      background: var(--color-deep, #1a3a2a);
      border-radius: 16px;
      color: #fff;
      position: relative;
      overflow: hidden;
    }

    .admin-dash-header::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -10%;
      width: 300px;
      height: 300px;
      background: none;
      border-radius: 50%;
    }

    .admin-dash-header-left {
      position: relative;
      z-index: 1;
    }

    .admin-dash-title {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.6rem;
      font-weight: 700;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .admin-dash-title svg {
      width: 24px;
      height: 24px;
      stroke: var(--color-amber, #c4956a);
      fill: none;
      stroke-width: 2;
    }

    .admin-dash-subtitle {
      font-size: 0.88rem;
      color: rgba(255,255,255,0.6);
    }

    .admin-dash-logout {
      padding: 10px 20px;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
      z-index: 1;
    }

    .admin-dash-logout:hover {
      background: rgba(255,255,255,0.2);
    }

    /* ===== 标签页导航 ===== */
    .admin-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      background: var(--surface-primary, #ffffff);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: 12px;
      padding: 6px;
    }

    .admin-tab {
      flex: 1;
      padding: 12px 20px;
      background: transparent;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.9rem;
      color: var(--text-secondary, #4a4a4a);
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .admin-tab svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .admin-tab:hover {
      background: var(--surface-secondary, #faf7f2);
      color: var(--color-deep, #1a3a2a);
    }

    .admin-tab.active {
      background: var(--color-sage, #5a7d5c);
      color: #fff;
      box-shadow: var(--shadow-md);
    }

    /* ===== 统计卡片 ===== */
    .admin-stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .admin-stat-card {
      background: var(--surface-primary, #ffffff);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: 16px;
      padding: 20px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      transition: all 0.2s;
    }

    .admin-stat-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg);
    }

    .admin-stat-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .admin-stat-icon svg {
      width: 22px;
      height: 22px;
      stroke-width: 2;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .admin-stat-icon--green {
      background: rgba(90,125,92,0.12);
      stroke: var(--color-sage, #5a7d5c);
    }

    .admin-stat-icon--amber {
      background: rgba(196,149,106,0.12);
      stroke: var(--color-amber, #c4956a);
    }

    .admin-stat-icon--blue {
      background: rgba(59,130,246,0.12);
      stroke: #3b82f6;
    }

    .admin-stat-num {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
      line-height: 1;
    }

    .admin-stat-label {
      font-size: 0.78rem;
      color: var(--text-muted, #8a8a8a);
      margin-top: 2px;
    }

    /* ===== 内容区域 ===== */
    .admin-section {
      background: var(--surface-primary, #ffffff);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 24px;
      box-shadow: var(--shadow-sm);
    }

    .admin-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-light, #ece8e1);
    }

    .admin-section-title {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .admin-section-title svg {
      width: 20px;
      height: 20px;
      stroke: var(--color-amber, #c4956a);
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .admin-section-badge {
      font-family: var(--font-mono, monospace);
      font-size: 0.75rem;
      padding: 4px 10px;
      background: rgba(196,149,106,0.12);
      color: var(--color-amber, #c4956a);
      border-radius: 8px;
      font-weight: 600;
    }

    /* ===== 用户表格 ===== */
    .admin-table-wrap {
      overflow-x: auto;
      border-radius: 12px;
      border: 1px solid var(--border-light, #ece8e1);
    }

    .admin-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }

    .admin-table th {
      background: var(--surface-secondary, #faf7f2);
      padding: 14px 16px;
      text-align: left;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid var(--border-light, #ece8e1);
    }

    .admin-table td {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-light, #ece8e1);
      color: var(--text-primary, #1a1a1a);
    }

    .admin-table tr:last-child td {
      border-bottom: none;
    }

    .admin-table tr:hover td {
      background: rgba(90,125,92,0.03);
    }

    .admin-table-name {
      font-weight: 600;
      color: var(--color-deep, #1a3a2a);
    }

    .admin-table-score {
      font-family: var(--font-mono, monospace);
      font-weight: 700;
      color: var(--color-sage, #5a7d5c);
    }

    .admin-table-actions {
      display: flex;
      gap: 8px;
    }

    /* ===== 按钮 ===== */
    .admin-btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .admin-btn svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .admin-btn--danger {
      background: rgba(192,85,58,0.1);
      color: var(--color-error, #c0553a);
    }

    .admin-btn--danger:hover {
      background: var(--color-error, #c0553a);
      color: #fff;
    }

    .admin-btn--primary {
      background: var(--color-sage, #5a7d5c);
      color: #fff;
    }

    .admin-btn--primary:hover {
      background: var(--color-deep, #1a3a2a);
      transform: translateY(-1px);
    }

    .admin-btn--ghost {
      background: transparent;
      border: 1.5px solid var(--border-default, #e0dcd5);
      color: var(--text-secondary, #4a4a4a);
    }

    .admin-btn--ghost:hover {
      border-color: var(--color-sage, #5a7d5c);
      color: var(--color-sage, #5a7d5c);
    }

    /* ===== 题目卡片 ===== */
    .admin-q-card {
      background: var(--surface-secondary, #faf7f2);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: 12px;
      padding: 18px 20px;
      margin-bottom: 12px;
      transition: all 0.2s;
    }

    .admin-q-card:hover {
      border-color: var(--color-sage, #5a7d5c);
      box-shadow: var(--shadow-md);
    }

    .admin-q-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .admin-q-body {
      flex: 1;
      min-width: 0;
    }

    .admin-q-text {
      font-weight: 600;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 8px;
      line-height: 1.5;
    }

    .admin-q-meta {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }

    .admin-q-tag {
      padding: 3px 10px;
      border-radius: 8px;
      font-size: 0.7rem;
      font-weight: 600;
    }

    .admin-q-tag--module {
      background: rgba(90,125,92,0.12);
      color: var(--color-sage, #5a7d5c);
    }

    .admin-q-tag--diff {
      background: rgba(196,149,106,0.12);
      color: var(--color-amber, #c4956a);
    }

    .admin-q-tag--subject {
      background: rgba(139,92,246,0.1);
      color: #7c3aed;
    }

    .admin-q-options {
      font-size: 0.8rem;
      color: var(--text-muted, #8a8a8a);
      margin-top: 8px;
      line-height: 1.6;
    }

    .admin-q-explanation {
      font-size: 0.8rem;
      color: var(--text-secondary, #4a4a4a);
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed var(--border-light, #ece8e1);
    }

    /* ===== 表单 ===== */
    .admin-form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 18px;
    }

    .admin-form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .admin-form-group.full {
      grid-column: 1 / -1;
    }

    .admin-form-label {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-secondary, #4a4a4a);
    }

    .admin-form-input,
    .admin-form-select,
    .admin-form-textarea {
      padding: 12px 16px;
      border: 1.5px solid var(--border-light, #ece8e1);
      border-radius: 12px;
      font-size: 0.9rem;
      background: var(--surface-secondary, #faf7f2);
      transition: all 0.2s ease;
      font-family: inherit;
    }

    .admin-form-textarea {
      resize: vertical;
      min-height: 90px;
    }

    .admin-form-input:focus,
    .admin-form-select:focus,
    .admin-form-textarea:focus {
      outline: none;
      border-color: var(--color-sage, #5a7d5c);
      background: var(--surface-primary, #ffffff);
      box-shadow: 0 0 0 3px rgba(90,125,92,0.08);
    }

    .admin-form-submit {
      padding: 14px 28px;
      background: var(--color-sage, #5a7d5c);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
      width: 100%;
      transition: all 0.25s ease;
    }

    .admin-form-submit:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-lg);
    }

    /* ===== 空状态 & 加载 ===== */
    .admin-empty {
      text-align: center;
      padding: 48px 24px;
      color: var(--text-muted, #8a8a8a);
    }

    .admin-empty-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 16px;
      background: var(--surface-secondary, #faf7f2);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .admin-empty-icon svg {
      width: 28px;
      height: 28px;
      stroke: var(--text-muted, #8a8a8a);
      fill: none;
      stroke-width: 1.5;
    }

    .admin-empty-text {
      font-size: 0.95rem;
    }

    .admin-empty-hint {
      margin-top: 12px;
      font-size: 0.8rem;
      color: #999;
      line-height: 1.8;
      text-align: left;
      display: inline-block;
      background: var(--surface-secondary, #faf7f2);
      padding: 12px 18px;
      border-radius: 8px;
      max-width: 480px;
    }

    .admin-loading {
      text-align: center;
      padding: 48px 24px;
    }

    .admin-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(90,125,92,0.15);
      border-top-color: var(--color-sage, #5a7d5c);
      border-radius: 50%;
      animation: adminSpin 0.8s linear infinite;
      margin: 0 auto 12px;
    }

    @keyframes adminSpin {
      to { transform: rotate(360deg); }
    }

    .admin-loading-text {
      font-size: 0.88rem;
      color: var(--text-muted, #8a8a8a);
    }

    /* ===== 响应式 ===== */
    @media (max-width: 768px) {
      .admin-form-grid {
        grid-template-columns: 1fr;
      }

      .admin-stats-row {
        grid-template-columns: 1fr;
      }

      .admin-dash-header {
        flex-direction: column;
        gap: 16px;
        text-align: center;
      }

      .admin-table {
        font-size: 0.82rem;
      }

      .admin-table th,
      .admin-table td {
        padding: 10px 8px;
      }

      .admin-login-card {
        padding: 36px 24px;
      }
    }

    /* ===== 弹窗 ===== */
    .admin-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    }

    .admin-modal {
      background: var(--surface-primary, #ffffff);
      border-radius: 16px;
      padding: 32px;
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: var(--shadow-floating);
    }

    .admin-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-light, #ece8e1);
    }

    .admin-modal-title {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
    }

    .admin-modal-close {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: none;
      background: var(--surface-secondary, #faf7f2);
      cursor: pointer;
      font-size: 1.2rem;
      color: var(--text-muted, #8a8a8a);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .admin-modal-close:hover {
      background: var(--color-error, #c0553a);
      color: #fff;
    }
  `;
  document.head.appendChild(style);
}

/* ===== API 调用 ===== */
// 管理员认证只有一条路径（管理员入口仅接受管理员口令）：
//   管理员口令：RPC admin_login_with_key（sql/migration_v11_admin_auth.sql）
//   在服务端比对 SHA-256 摘要，通过后把「当前登录账号」升级为 user_group='admin'；
//   纯前端伪造状态无法提权（密钥摘要不下发、不在前端比对）。
//   账号密码登录不再作为管理员入口（adminLogin 已移除）。
// 数据读写权限始终由 sql/ 中的 RLS 策略在服务端强制。
// 详见 sql/migration_v11_admin_auth.sql。

/**
 * 判断是否为「服务端未部署同名 RPC」错误（PostgREST: Could not find the function ... / does not exist）
 * @param {string} msg
 */
function _isMissingRpcError(msg) {
  var s = String(msg || '');
  return s.indexOf('Could not find') >= 0 || s.indexOf('not found') >= 0 || s.indexOf('does not exist') >= 0;
}

/**
 * 管理员密钥验证（服务端校验）
 * @param {string} key 管理员密钥
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function adminVerifyKey(key) {
  if (!key || !String(key).trim()) return { ok: false, error: '请输入管理员密钥' };
  var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
  if (!sb) return { ok: false, error: '系统未初始化，请刷新页面后重试' };
  try {
    var res = await sb.rpc('admin_login_with_key', { p_key: String(key).trim() });
    if (res && res.error) {
      var msg = res.error.message || '验证失败';
      if (_isMissingRpcError(msg)) {
        msg = '服务端尚未部署管理员密钥功能，请先在 Supabase 执行 sql/migration_v11_admin_auth.sql';
      }
      return { ok: false, error: msg };
    }
    var row = Array.isArray(res && res.data) ? res.data[0] : (res && res.data);
    if (!row || !row.ok) {
      return { ok: false, error: (row && row.error_msg) || '管理员密钥不正确' };
    }
    // 授权成功：服务端 profiles.user_group 已升级为 admin，这里同步内存用户并解锁管理 UI
    var user = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
    if (user) user.user_group = 'admin';
    _adminAuthenticated = true;
    sessionStorage.setItem('bioquest_admin_auth', JSON.stringify({ t: Date.now(), exp: ADMIN_TOKEN_TTL }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: '验证异常：' + ((e && e.message) || e) };
  }
}
window.adminVerifyKey = adminVerifyKey;

// 检查会话中是否已认证（带过期校验）
// 注：仅凭 token 恢复 UI 解锁状态；token 只可能由 adminVerifyKey（口令 RPC 校验）写入，
// 管理员账号本身不产生解锁；非 admin 账号/登出时由 _onAuthUserLoaded 清除。
(function() {
  try {
    var raw = sessionStorage.getItem('bioquest_admin_auth');
    if (!raw) return;
    var token = JSON.parse(raw);
    // 校验 token 结构和过期时间
    if (!token || typeof token.t !== 'number' || typeof token.exp !== 'number') {
      sessionStorage.removeItem('bioquest_admin_auth');
      return;
    }
    if (Date.now() - token.t > token.exp) {
      // 过期，清除
      sessionStorage.removeItem('bioquest_admin_auth');
      return;
    }
    _adminAuthenticated = true;
  } catch (e) {
    sessionStorage.removeItem('bioquest_admin_auth');
  }
})();

// 解析 Supabase 错误，返回用户友好的错误信息
function parseSupabaseError(error) {
  if (!error) return errText(error);
  var msg = error.message || String(error);
  var code = error.code || '';
  var details = error.details || '';
  var hint = error.hint || '';
  // 常见错误分类
  if (code === '42P01' || msg.includes('does not exist') || msg.includes('relation') && msg.includes('exist')) {
    return '数据库表不存在。请在 Supabase SQL Editor 中运行 sql/schema.sql 初始化表结构。';
  }
  if (code === '42501' || msg.includes('permission denied') || msg.includes('policy') || msg.includes('violates row-level security')) {
    return '权限不足（RLS 策略拒绝）。请确认管理员账号的 user_group 已设为 "admin"，并在 Supabase 中运行最新 schema.sql 添加管理员策略。';
  }
  if (code === '23505' || msg.includes('duplicate key') || msg.includes('unique')) {
    return '数据重复，该记录已存在。';
  }
  if (code === '23503' || msg.includes('foreign key')) {
    return '外键约束失败，关联数据不存在。';
  }
  if (msg.includes('JWT') || msg.includes('token') || msg.includes('expired') || msg.includes('auth')) {
    return '认证已过期，请刷新页面重新登录 Supabase。';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
    return '网络连接失败，请检查网络后重试。';
  }
  if (details) return details;
  if (hint) return hint;
  return msg;
}

// Supabase 直连的管理员 API
async function adminApiCall(method, endpoint, body = null) {
  if (!_adminAuthenticated) {
    return { ok: false, data: { error: '管理员未认证，请重新登录' }, status: 401 };
  }
  return await handleAdminSupabaseCall(method, endpoint, body);
}

// 获取当前 Supabase 会话 access_token（供本地 server.py 管理端点的新认证模型使用：
// 后端以 service role key 独立校验该 token 并确认 user_group === 'admin'，不信任前端自述）。
// 返回 Promise<string>，无会话时为空串。
window.getSupabaseSessionToken = async function () {
  var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
  if (!sb || !sb.auth) return '';
  try {
    var sessionRes = await sb.auth.getSession();
    return (sessionRes && sessionRes.data && sessionRes.data.session && sessionRes.data.session.access_token) || '';
  } catch (e) {
    return '';
  }
};

// 使用 fetch() 直接调用 Supabase REST API，避免 Supabase JS 客户端内部取消请求导致 net::ERR_ABORTED
async function adminFetchRest(method, table, queryParams, body) {
  // 公开表（社区帖子、社区评论、profiles 等）必须用 anon key 拉取，
  // 避免登录用户的 RLS 策略限制（如 auth.uid() = author_id 导致只能看自己发的）
  // 管理员专属操作（更新/删除/插入）才用 session token
  var PUBLIC_TABLES = ['community_posts', 'community_comments', 'profiles', 'checkins', 'questions'];
  var isWriteOp = (method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE');
  var useAnon = PUBLIC_TABLES.indexOf(table) >= 0 && method === 'GET';
  var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
  var token = null;
  if (sb && !useAnon) {
    try {
      var { data } = await sb.auth.getSession();
      token = (data && data.session && data.session.access_token) || null;
    } catch (e) {}
  }
  // 安全加固 F-06：写操作（非公开表的 POST/PATCH/PUT/DELETE）必须携带有效 session token，
  // 绝不静默降级为 anon key，避免越权写入被 RLS 默默拦截或被误判成功
  if (isWriteOp && !useAnon && !token) {
    return {
      ok: false,
      data: { error: '管理员会话已失效，请重新登录后再执行写操作（拒绝降级为匿名身份）' },
      status: 401
    };
  }
  var url = 'https://qxehkfucvmxuojjkdaqy.supabase.co/rest/v1/' + table + (queryParams ? '?' + queryParams : '');
  var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZWhrZnVjdm14dW9qamtkYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjU2ODUsImV4cCI6MjEwMjIwMTY4NX0.lbiJxhFvy0t_J4qSeoP6K0r53M4KaEDSKkRlZu03ze8';
  var headers = {
    'apikey': anonKey,
    // 写操作必定有 token（上方已校验），读公开表用 anon，读私有表用 token
    'Authorization': 'Bearer ' + (token || anonKey),
    'Content-Type': 'application/json'
  };
  if (method === 'POST' || method === 'PATCH') {
    headers['Prefer'] = 'return=representation';
  }
  if (method === 'DELETE') {
    headers['Prefer'] = 'return=representation';
  }
  var fetchOpts = { method: method, headers: headers };
  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    fetchOpts.body = JSON.stringify(body);
  }

  try {
    var resp = await fetch(url, fetchOpts);
    var json = null;
    try {
      json = await resp.json();
    } catch (e) {}
    if (!resp.ok) {
      var errMsg = (json && json.message) || (json && json.msg) || resp.statusText || '请求失败';
      var errCode = (json && json.code) || '';
      console.error('[Admin REST] 请求失败:', resp.status, errCode, errMsg, json);
      // 如果是 401/403，提示认证问题
      if (resp.status === 401 || resp.status === 403) {
        errMsg = '权限不足（' + (token ? 'token可能已过期' : '未登录') + '）：' + errMsg;
      }
      return { ok: false, data: { error: errMsg }, status: resp.status, _raw: json };
    }

    return { ok: true, data: json, status: resp.status };
  } catch (fetchErr) {
    console.error('[Admin REST] 网络错误:', fetchErr.message);
    return { ok: false, data: { error: '网络请求失败: ' + fetchErr.message }, status: 0 };
  }
}

async function handleAdminSupabaseCall(method, endpoint, body) {
  try {
    if (endpoint === '/admin/users') {
      var result = await adminFetchRest('GET', 'profiles', 'select=*&order=created_at.desc', null);
      if (!result.ok) return { ok: false, data: { error: '查询用户列表失败: ' + result.data.error }, status: result.status };
      var data = Array.isArray(result.data) ? result.data : [];

      return { ok: true, data: { users: data }, status: 200 };
    }
    if (endpoint.startsWith('/admin/users/') && method === 'DELETE') {
      var username = endpoint.split('/').pop();
      var selResult = await adminFetchRest('GET', 'profiles', 'username=eq.' + encodeURIComponent(username), null);
      if (!selResult.ok) return { ok: false, data: { error: '查询用户失败: ' + selResult.data.error }, status: selResult.status };
      var profiles = Array.isArray(selResult.data) ? selResult.data : [];
      if (!profiles.length) return { ok: false, data: { error: '用户 "' + username + '" 不存在' }, status: 404 };
      var delResult = await adminFetchRest('DELETE', 'profiles', 'id=eq.' + profiles[0].id, null);
      if (!delResult.ok) return { ok: false, data: { error: '删除用户失败: ' + delResult.data.error }, status: delResult.status };
      return { ok: true, data: {}, status: 200 };
    }
    if (endpoint.startsWith('/admin/users/') && method === 'PUT') {
      var username = endpoint.split('/')[3];
      var updResult = await adminFetchRest('PATCH', 'profiles', 'username=eq.' + encodeURIComponent(username), body);
      if (!updResult.ok) return { ok: false, data: { error: '更新用户失败: ' + updResult.data.error }, status: updResult.status };
      var updated = Array.isArray(updResult.data) ? updResult.data[0] : body;
      return { ok: true, data: updated, status: 200 };
    }
    if (endpoint.startsWith('/admin/users/') && endpoint.includes('/reset-password')) {
      return { ok: true, data: { message: '密码重置请求已记录' }, status: 200 };
    }

    if (endpoint.startsWith('/admin/questions') && !endpoint.startsWith('/admin/questions/')) {
      if (method === 'GET') {
        // Parse pagination params from endpoint query string
        var page = 1;
        var perPage = 30;
        var searchMatch = endpoint.match(/search=([^&]*)/);
        var moduleMatch = endpoint.match(/module=([^&]*)/);
        var pageMatch = endpoint.match(/page=(\d+)/);
        if (pageMatch) page = parseInt(pageMatch[1], 10) || 1;

        var queryParams = 'select=*&order=created_at.desc&limit=' + perPage + '&offset=' + ((page - 1) * perPage);

        // Add search filter if provided
        if (searchMatch && searchMatch[1]) {
          var searchTerm = decodeURIComponent(searchMatch[1]);
          queryParams += '&or=(id.ilike.*' + encodeURIComponent(searchTerm) + '*,question.ilike.*' + encodeURIComponent(searchTerm) + '*,concept.ilike.*' + encodeURIComponent(searchTerm) + '*,subject.ilike.*' + encodeURIComponent(searchTerm) + '*)';
        }
        // Add module filter if provided
        if (moduleMatch && moduleMatch[1]) {
          var modVal = decodeURIComponent(moduleMatch[1]);
          queryParams += '&module=eq.' + encodeURIComponent(modVal);
        }

        var result = await adminFetchRest('GET', 'questions', queryParams, null);
        if (!result.ok) return { ok: false, data: { error: '查询题目列表失败: ' + result.data.error }, status: result.status };
        var data = Array.isArray(result.data) ? result.data : [];

        // 使用 Supabase Prefer: count=exact 精确计数（解决默认 limit 1000 导致只显示1000的问题）
        // 原理：加 count=exact 后，Supabase 在 Content-Range 响应头返回 0-0/实际总数，无需拉取全量ID
        var totalCount = data.length;
        try {
          var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
          var token = null;
          if (sb) {
            try {
              var sesData = await sb.auth.getSession();
              token = (sesData && sesData.data && sesData.data.session && sesData.data.session.access_token) || null;
            } catch (e) {}
          }
          var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZWhrZnVjdm14dW9qamtkYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjU2ODUsImV4cCI6MjEwMjIwMTY4NX0.lbiJxhFvy0t_J4qSeoP6K0r53M4KaEDSKkRlZu03ze8';
          // 精确计数：带上与主查询相同的搜索/模块过滤条件，不带分页/排序
          var countParams = 'select=id&limit=1';
          if (searchMatch && searchMatch[1]) {
            countParams += '&or=(id.ilike.*' + encodeURIComponent(searchTerm) + '*,question.ilike.*' + encodeURIComponent(searchTerm) + '*,concept.ilike.*' + encodeURIComponent(searchTerm) + '*,subject.ilike.*' + encodeURIComponent(searchTerm) + '*)';
          }
          if (moduleMatch && moduleMatch[1]) {
            countParams += '&module=eq.' + encodeURIComponent(modVal);
          }
          var countUrl = 'https://qxehkfucvmxuojjkdaqy.supabase.co/rest/v1/questions?' + countParams;
          var countResp = await fetch(countUrl, {
            method: 'GET',
            headers: {
              'apikey': anonKey,
              'Authorization': 'Bearer ' + (token || anonKey),
              'Prefer': 'count=exact'
            }
          });
          var contentRange = countResp.headers.get('Content-Range') || '';
          var match = contentRange.match(/\/(\d+)$/);
          if (match && match[1]) {
            totalCount = parseInt(match[1], 10) || data.length;
          } else {
            // 兜底：旧版 Supabase 可能不返回 Content-Range，退回到分页数据 + ADMIN_COUNT_LIMIT 推测
            totalCount = Math.max(data.length, (data.length === perPage) ? (page * perPage + 1) : data.length);
          }
        } catch (countErr) {
          console.warn('[Admin] 精确计数失败，使用分页数据兜底:', countErr.message);
        }

        // 后台「题目总数」对齐数据源：选择本地题库时统计本地题库（manifest 真源），
        // 仅当显式选择云端同步时才展示云端题目数量。
        try {
          var adminQSource = (typeof loadSetting === 'function') ? loadSetting('question_source', 'cloud') : 'cloud';
          if (adminQSource === 'local' && typeof window.getQuestionBankCount === 'function') {
            var localTotal = await window.getQuestionBankCount();
            if (localTotal) totalCount = localTotal;
          }
        } catch (e) {} // 本地计数失败时保留云端统计，不阻断后台加载

        // 提取模块（从 subject 字段去重）
        var modules = [];
        var modSet = {};
        // 从当前页数据中提取 subject 作为模块
        for (var i = 0; i < data.length; i++) {
          var subj = data[i].subject || data[i].module || '';
          if (subj && !modSet[subj]) { modSet[subj] = true; modules.push(subj); }
        }
        // 如果当前页没有模块信息，再从更多数据中提取
        if (modules.length === 0 && data.length > 0) {
          try {
            var subjResult = await adminFetchRest('GET', 'questions', 'select=subject&limit=' + ADMIN_COUNT_LIMIT, null);
            if (Array.isArray(subjResult.data)) {
              for (var j = 0; j < subjResult.data.length; j++) {
                var s = subjResult.data[j].subject || '';
                if (s && !modSet[s]) { modSet[s] = true; modules.push(s); }
              }
            }
          } catch(e) { /* 模块提取失败，静默 */ }
        }
        modules.sort();

        return { ok: true, data: { questions: data, total: totalCount, modules: modules, page: page, per_page: perPage }, status: 200 };
      }
      if (method === 'POST') {
        var result = await adminFetchRest('POST', 'questions', null, body);
        if (!result.ok) return { ok: false, data: { error: '添加题目失败: ' + result.data.error }, status: result.status };
        var item = Array.isArray(result.data) ? result.data[0] : body;
        return { ok: true, data: item, status: 200 };
      }
    }
    if (endpoint.startsWith('/admin/questions/') && method === 'PUT') {
      var qId = decodeURIComponent(endpoint.split('/').pop());
      var result = await adminFetchRest('PATCH', 'questions', 'id=eq.' + encodeURIComponent(qId), body);
      if (!result.ok) return { ok: false, data: { error: '更新题目失败: ' + result.data.error }, status: result.status };
      var item = Array.isArray(result.data) ? result.data[0] : body;
      return { ok: true, data: item, status: 200 };
    }
    if (endpoint.startsWith('/admin/questions/') && method === 'DELETE') {
      var qId = decodeURIComponent(endpoint.split('/').pop());
      var result = await adminFetchRest('DELETE', 'questions', 'id=eq.' + encodeURIComponent(qId), null);
      if (!result.ok) return { ok: false, data: { error: '删除题目失败: ' + result.data.error }, status: result.status };
      return { ok: true, data: {}, status: 200 };
    }

    if (endpoint.startsWith('/admin/cards') && !endpoint.startsWith('/admin/cards/')) {
      if (method === 'GET') {
        var page = 1;
        var perPage = 30;
        var pageMatch = endpoint.match(/page=(\d+)/);
        if (pageMatch) page = parseInt(pageMatch[1], 10) || 1;

        var queryParams = 'select=*&order=created_at.desc&limit=' + perPage + '&offset=' + ((page - 1) * perPage);

        var searchMatch = endpoint.match(/search=([^&]*)/);
        if (searchMatch && searchMatch[1]) {
          var searchTerm = decodeURIComponent(searchMatch[1]);
          queryParams += '&or=(title.ilike.*' + encodeURIComponent(searchTerm) + '*,question.ilike.*' + encodeURIComponent(searchTerm) + '*)';
        }
        var categoryMatch = endpoint.match(/category=([^&]*)/);
        if (categoryMatch && categoryMatch[1]) {
          queryParams += '&category=eq.' + encodeURIComponent(decodeURIComponent(categoryMatch[1]));
        }

        var result = await adminFetchRest('GET', 'cards', queryParams, null);
        if (!result.ok) {
          var isMissingTable = result._raw && result._raw.code === 'PGRST205';
          if (isMissingTable) {
            console.warn('[Admin] cards 表不存在，请在 Supabase SQL Editor 中运行 sql/schema.sql');
            return { ok: true, data: { cards: [], total: 0, categories: [], page: page, per_page: perPage, _missing_table: true }, status: 200 };
          }
          return { ok: false, data: { error: '查询卡片列表失败: ' + result.data.error }, status: result.status };
        }
        var data = Array.isArray(result.data) ? result.data : [];

        // 使用 limit 获取总数（更高效）
        var countResult = await adminFetchRest('GET', 'cards', 'select=id&limit=' + ADMIN_CARDS_COUNT_LIMIT, null);
        var totalCount = Array.isArray(countResult.data) ? countResult.data.length : (Array.isArray(result.data) ? result.data.length : 0);

        return { ok: true, data: { cards: data, total: totalCount, categories: [], page: page, per_page: perPage }, status: 200 };
      }
      if (method === 'POST') {
        var result = await adminFetchRest('POST', 'cards', null, body);
        if (!result.ok) return { ok: false, data: { error: '添加卡片失败: ' + result.data.error }, status: result.status };
        var item = Array.isArray(result.data) ? result.data[0] : body;
        return { ok: true, data: item, status: 200 };
      }
    }
    if (endpoint.startsWith('/admin/cards/') && method === 'PUT') {
      var cId = parseInt(decodeURIComponent(endpoint.split('/').pop()), 10);
      var result = await adminFetchRest('PATCH', 'cards', 'id=eq.' + cId, body);
      if (!result.ok) return { ok: false, data: { error: '更新卡片失败: ' + result.data.error }, status: result.status };
      var item = Array.isArray(result.data) ? result.data[0] : body;
      return { ok: true, data: item, status: 200 };
    }
    if (endpoint.startsWith('/admin/cards/') && method === 'DELETE') {
      var cId = parseInt(decodeURIComponent(endpoint.split('/').pop()), 10);
      var result = await adminFetchRest('DELETE', 'cards', 'id=eq.' + cId, null);
      if (!result.ok) return { ok: false, data: { error: '删除卡片失败: ' + result.data.error }, status: result.status };
      return { ok: true, data: {}, status: 200 };
    }
    if (endpoint.startsWith('/admin/card-categories')) {
      var result = await adminFetchRest('GET', 'cards', 'select=category', null);
      if (!result.ok) return { ok: false, data: { error: '查询卡片分类失败: ' + result.data.error }, status: result.status };
      var data = Array.isArray(result.data) ? result.data : [];
      var categories = [...new Set(data.map(function(c) { return c.category; }).filter(Boolean))];
      return { ok: true, data: { categories: categories }, status: 200 };
    }

    if (endpoint.startsWith('/admin/community/posts') && !endpoint.startsWith('/admin/community/posts/')) {
      if (method === 'GET') {
        var result = await adminFetchRest('GET', 'community_posts', 'select=*&order=created_at.desc&limit=' + ADMIN_LIST_LIMIT, null);
        if (!result.ok) {
          console.error('[Admin] 查询帖子列表失败:', result.data);
          return { ok: false, data: { error: '查询帖子列表失败: ' + result.data.error }, status: result.status };
        }
        var data = Array.isArray(result.data) ? result.data : [];

        return { ok: true, data: { posts: data, total: data.length, page: 1, per_page: 100 }, status: 200 };
      }
    }
    if (endpoint.startsWith('/admin/community/posts/') && method === 'PUT' && !endpoint.includes('/pin') && !endpoint.includes('/comments')) {
      var pId = decodeURIComponent(endpoint.split('/').pop());
      var result = await adminFetchRest('PATCH', 'community_posts', 'id=eq.' + encodeURIComponent(pId), body);
      if (!result.ok) return { ok: false, data: { error: '更新帖子失败: ' + result.data.error }, status: result.status };
      var item = Array.isArray(result.data) ? result.data[0] : body;
      return { ok: true, data: item, status: 200 };
    }
    if (endpoint.startsWith('/admin/community/posts/') && method === 'DELETE' && !endpoint.includes('/comments')) {
      var pId = decodeURIComponent(endpoint.split('/').pop());
      var result = await adminFetchRest('PATCH', 'community_posts', 'id=eq.' + encodeURIComponent(pId), { is_deleted: true });
      if (!result.ok) return { ok: false, data: { error: '删除帖子失败: ' + result.data.error }, status: result.status };
      return { ok: true, data: {}, status: 200 };
    }
    if (endpoint.startsWith('/admin/community/posts/') && endpoint.includes('/pin')) {
      var pId = decodeURIComponent(endpoint.split('/')[4]);
      var pinResult = await adminFetchRest('PATCH', 'community_posts', 'id=eq.' + encodeURIComponent(pId), { is_pinned: body.pinned });
      if (!pinResult.ok) return { ok: false, data: { error: '置顶操作失败: ' + pinResult.data.error }, status: pinResult.status };
      return { ok: true, data: { pinned: body.pinned }, status: 200 };
    }
    // 删除帖子评论
    if (endpoint.startsWith('/admin/community/comments/') && method === 'DELETE') {
      var commentId = decodeURIComponent(endpoint.split('/').pop());
      var result = await adminFetchRest('DELETE', 'community_comments', 'id=eq.' + encodeURIComponent(commentId), null);
      if (!result.ok) return { ok: false, data: { error: '删除评论失败: ' + result.data.error }, status: result.status };
      return { ok: true, data: {}, status: 200 };
    }

    if (endpoint === '/admin/community/mutes') {
      if (method === 'GET') {
        var result = await adminFetchRest('GET', 'community_mutes', 'select=*&order=created_at.desc', null);
        if (!result.ok) {
          var isMissingTable = result._raw && result._raw.code === 'PGRST205';
          if (isMissingTable) {
            console.warn('[Admin] community_mutes 表不存在，请在 Supabase SQL Editor 中运行 sql/schema.sql');
            return { ok: true, data: { mutes: [], _missing_table: true }, status: 200 };
          }
          return { ok: false, data: { error: '查询禁言列表失败: ' + result.data.error }, status: result.status };
        }
        var data = Array.isArray(result.data) ? result.data : [];
        return { ok: true, data: { mutes: data }, status: 200 };
      }
      if (method === 'POST') {
        var result = await adminFetchRest('POST', 'community_mutes', null, body);
        if (!result.ok) return { ok: false, data: { error: '添加禁言失败: ' + result.data.error }, status: result.status };
        var item = Array.isArray(result.data) ? result.data[0] : body;
        return { ok: true, data: item, status: 200 };
      }
    }
    if (endpoint.startsWith('/admin/community/mutes/') && method === 'DELETE') {
      var uId = decodeURIComponent(endpoint.split('/').pop());
      var result = await adminFetchRest('DELETE', 'community_mutes', 'user_id=eq.' + encodeURIComponent(uId), null);
      if (!result.ok) return { ok: false, data: { error: '解除禁言失败: ' + result.data.error }, status: result.status };
      return { ok: true, data: {}, status: 200 };
    }

    if (endpoint.startsWith('/admin/announcements') && !endpoint.startsWith('/admin/announcements/')) {
      if (method === 'GET') {
        var result = await adminFetchRest('GET', 'announcements', 'select=*&order=created_at.desc&limit=' + ADMIN_LIST_LIMIT, null);
        if (!result.ok) {
          console.error('[Admin] 查询公告列表失败:', result.data);
          return { ok: false, data: { error: '查询公告列表失败: ' + result.data.error }, status: result.status };
        }
        var data = Array.isArray(result.data) ? result.data : [];

        return { ok: true, data: { announcements: data, total: data.length }, status: 200 };
      }
      if (method === 'POST') {
        var result = await adminFetchRest('POST', 'announcements', null, body);
        if (!result.ok) return { ok: false, data: { error: '添加公告失败: ' + result.data.error }, status: result.status };
        var item = Array.isArray(result.data) ? result.data[0] : body;
        return { ok: true, data: item, status: 200 };
      }
    }
    if (endpoint.startsWith('/admin/announcements/') && method === 'PUT') {
      var annId = Number(endpoint.split('/').pop());
      var result = await adminFetchRest('PATCH', 'announcements', 'id=eq.' + annId, body);
      if (!result.ok) return { ok: false, data: { error: '更新公告失败: ' + result.data.error }, status: result.status };
      var item = Array.isArray(result.data) ? result.data[0] : body;
      return { ok: true, data: item, status: 200 };
    }
    if (endpoint.startsWith('/admin/announcements/') && method === 'DELETE') {
      var annId = Number(endpoint.split('/').pop());
      var result = await adminFetchRest('DELETE', 'announcements', 'id=eq.' + annId, null);
      if (!result.ok) return { ok: false, data: { error: '删除公告失败: ' + result.data.error }, status: result.status };
      return { ok: true, data: {}, status: 200 };
    }

    if (endpoint === '/admin/feedbacks' && method === 'GET') {
      var result = await adminFetchRest('GET', 'feedbacks', 'select=*&order=created_at.desc&limit=' + ADMIN_FEEDBACK_LIMIT, null);
      if (!result.ok) {
        var isMissing = result._raw && result._raw.code === 'PGRST205';
        if (isMissing) {
          console.warn('[Admin] feedbacks 表不存在，请在 Supabase SQL Editor 中运行 sql/migration_v2.sql');
          return { ok: true, data: { feedbacks: [], _missing_table: true }, status: 200 };
        }
        return { ok: false, data: { error: '查询反馈列表失败: ' + result.data.error }, status: result.status };
      }
      var data = Array.isArray(result.data) ? result.data : [];
      return { ok: true, data: { feedbacks: data }, status: 200 };
    }

    if (endpoint === '/admin/sync') {
      return { ok: true, data: { message: '同步功能暂不可用（无后端服务器）' }, status: 200 };
    }
    return { ok: false, data: { error: '未知的管理员操作: ' + method + ' ' + endpoint }, status: 404 };
  } catch (e) {
    console.error('[Admin] REST API 调用异常:', e);
    return { ok: false, data: { error: '请求异常: ' + errText(e) }, status: 500 };
  }
}

async function getUsers() {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('GET', '/admin/users');
  return result.ok ? result.data.users : null;
}

async function deleteUser(username) {
  if (!_adminAuthenticated) return false;
  const result = await adminApiCall('DELETE', `/admin/users/${encodeURIComponent(username)}`);
  return result.ok;
}

async function updateUser(username, updates) {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('PUT', `/admin/users/${encodeURIComponent(username)}`, updates);
  return result.ok ? result.data : null;
}

async function resetUserPassword(username, newPassword) {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('POST', `/admin/users/${encodeURIComponent(username)}/reset-password`, { new_password: newPassword });
  return result.ok ? result.data : null;
}

async function getQuestions(params = {}) {
  if (!_adminAuthenticated) return null;
  const query = new URLSearchParams(params).toString();
  const result = await adminApiCall('GET', `/admin/questions?${query}`);
  if (!result.ok) {
    console.error('[Admin] getQuestions 失败:', result.data);
  }
  return result.ok ? result.data : null;
}

async function addQuestion(question) {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('POST', '/admin/questions', question);
  return result.ok ? result.data : null;
}

async function updateQuestion(id, question) {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('PUT', `/admin/questions/${encodeURIComponent(id)}`, question);
  return result.ok ? result.data : null;
}

async function deleteQuestion(id) {
  if (!_adminAuthenticated) return false;
  const result = await adminApiCall('DELETE', `/admin/questions/${encodeURIComponent(id)}`);
  return result.ok;
}

/* ===== 卡片管理 API ===== */
async function getCards(params = {}) {
  if (!_adminAuthenticated) return null;
  const query = new URLSearchParams(params).toString();
  const result = await adminApiCall('GET', `/admin/cards?${query}`);
  if (!result.ok) {
    console.error('[Admin] getCards 失败:', result.data);
  }
  return result.ok ? result.data : null;
}

async function addCard(card) {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('POST', '/admin/cards', card);
  return result.ok ? result.data : null;
}

async function updateCard(id, card) {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('PUT', `/admin/cards/${encodeURIComponent(id)}`, card);
  return result.ok ? result.data : null;
}

async function deleteCard(id) {
  if (!_adminAuthenticated) return false;
  const result = await adminApiCall('DELETE', `/admin/cards/${encodeURIComponent(id)}`);
  return result.ok;
}

async function getCardCategories() {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('GET', '/admin/card-categories');
  return result.ok ? result.data.categories : null;
}

/* ===== 社区管理 API ===== */
async function getCommunityPosts(params = {}) {
  if (!_adminAuthenticated) return null;
  const query = new URLSearchParams(params).toString();
  const result = await adminApiCall('GET', `/admin/community/posts?${query}`);
  return result.ok ? result.data : null;
}

async function deleteCommunityPost(id) {
  if (!_adminAuthenticated) return false;
  const result = await adminApiCall('DELETE', `/admin/community/posts/${encodeURIComponent(id)}`);
  return result.ok;
}

async function toggleCommunityPostPin(id, pinned) {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('POST', `/admin/community/posts/${encodeURIComponent(id)}/pin`, { pinned: !!pinned });
  return result.ok ? result.data : null;
}

async function getCommunityMutes() {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('GET', '/admin/community/mutes');
  return result.ok ? result.data : null;
}

async function muteCommunityUser(userId, reason, durationHours) {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('POST', '/admin/community/mutes', { user_id: userId, reason, duration_hours: durationHours });
  return result.ok ? result.data : null;
}

async function unmuteCommunityUser(userId) {
  if (!_adminAuthenticated) return false;
  const result = await adminApiCall('DELETE', `/admin/community/mutes/${encodeURIComponent(userId)}`);
  return result.ok;
}

async function updateCommunityPost(postId, updates) {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('PUT', `/admin/community/posts/${encodeURIComponent(postId)}`, updates);
  return result.ok ? result.data : null;
}

async function deleteCommunityComment(commentId) {
  if (!_adminAuthenticated) return false;
  const result = await adminApiCall('DELETE', `/admin/community/comments/${encodeURIComponent(commentId)}`);
  return result.ok;
}

/* ===== 举报管理 API ===== */
async function getCommunityReports() {
  // 直接用 anon REST 查询举报表（如果表不存在会返回空，不影响页面）
  try {
    var result = await adminFetchRest('GET', 'community_reports', 'select=*&order=created_at.desc&limit=' + ADMIN_FEEDBACK_LIMIT, null);
    if (result.ok && Array.isArray(result.data)) {
      return { reports: result.data };
    }
    // 表不存在的错误
    if (result._raw && (result._raw.code === 'PGRST205' || result._raw.code === '42P01')) {
      return { reports: [], _missing_table: true };
    }
  } catch (e) {
    console.warn('[Admin] 查询举报表失败:', e.message);
  }
  return { reports: [], _missing_table: true };
}

async function dismissCommunityReport(reportId) {
  try {
    var result = await adminFetchRest('DELETE', 'community_reports', 'id=eq.' + encodeURIComponent(reportId), null);
    return result.ok;
  } catch (e) {
    return false;
  }
}

window.dismissCommunityReport = dismissCommunityReport;

// 驳回指定帖子的所有举报（按 post_id 批量删除举报记录）
async function dismissReportsByPostId(postId) {
  try {
    var result = await adminFetchRest('DELETE', 'community_reports', 'post_id=eq.' + encodeURIComponent(postId), null);
    return result.ok;
  } catch (e) {
    return false;
  }
}
window.dismissReportsByPostId = dismissReportsByPostId;

/* ===== 反馈管理 API ===== */
async function getFeedbacks() {
  if (!_adminAuthenticated) return null;
  const result = await adminApiCall('GET', '/admin/feedbacks');
  return result.ok ? result.data : null;
}

async function getCommunityPostComments(postId) {
  if (!_adminAuthenticated) return null;
  var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
  if (!sb) return null;
  var { data, error } = await sb.from('community_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
  if (error) { console.error('[Admin] 查询评论失败:', error); return null; }
  return data || [];
}

/* ===== SVG 图标 ===== */
var ICONS = {
  shield: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  key: '<svg viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  logout: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  inbox: '<svg viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  layers: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
  messageCircle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  ebook: '<svg viewBox="0 0 24 24"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>',
  check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  alertCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
};

/* ===== 登录页渲染 ===== */
// 管理员入口只提供「管理员口令」验证（服务端 RPC 比对）；
// 不提供管理员账号密码登录入口（账号密码不得进入管理后台）。
function renderAdminLoginPage(target) {
  target.innerHTML = `
    <div class="admin-login-wrap">
      <div class="admin-login-card">
        <div class="admin-login-icon">
          ${ICONS.shield}
        </div>
        <div class="admin-login-title">管理员后台</div>
        <div class="admin-login-subtitle" id="admin-login-subtitle">输入管理员口令完成身份验证</div>
        <form class="admin-login-form" id="admin-key-form">
          <div class="admin-login-input-wrap">
            <input
              type="password"
              class="admin-login-input"
              id="admin-key-input"
              placeholder="管理员口令"
              required
              autocomplete="off"
            >
            ${ICONS.key}
          </div>
          <button type="submit" class="admin-login-btn">验证进入</button>
        </form>
        <div class="admin-login-error" id="admin-login-error"></div>
        <div class="admin-login-hint">
          仅限授权管理员。口令仅在服务端校验，验证通过后当前账号将获得管理员权限；不支持账号密码登录。
        </div>
      </div>
    </div>
  `;

  var errorEl = document.getElementById('admin-login-error');
  var keyForm = document.getElementById('admin-key-form');
  var keyInput = document.getElementById('admin-key-input');

  function showError(msg) {
    if (!errorEl) return;
    if (msg) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    } else {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
  showError('');

  if (keyForm) keyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    var btn = keyForm.querySelector('.admin-login-btn');
    showError('');
    btn.textContent = '验证中...';
    btn.disabled = true;

    var result = await adminVerifyKey(keyInput ? keyInput.value : '');

    btn.textContent = '验证进入';
    btn.disabled = false;
    if (result.ok) {
      renderAdminDashboard(target);
    } else {
      showError(result.error || '验证失败');
      if (keyInput) { keyInput.value = ''; keyInput.focus(); }
    }
  });
}

/* ===== 仪表盘渲染 ===== */
function renderAdminDashboard(target) {
  // 管理员入口只认口令验证（adminVerifyKey 的会话 token）；
  // 此处不再因 user_group==='admin' 自动放行——账号密码不得直入管理后台。
  // 服务端管理操作由 Supabase RLS 策略强制。
  if (!_adminAuthenticated) {
    renderAdminLoginPage(target);
    return;
  }

  // 修复：如果 _adminAuthenticated 是从 sessionStorage 恢复的，但 _currentUser 还是 null，
  // 等待 _currentUser 加载完成（最多等 2 秒）。
  // 关键：禁止在 setInterval 回调中同步重入 renderAdminDashboard，
  // 否则一旦 _currentUser 状态在多次触发间反复切换，可能累积调用栈导致 "Maximum call stack size exceeded"。
  // 改为：使用 setTimeout 链式轮询，并在用户就绪后通过 setTimeout(0) 异步重入。
  // 注：管理员认证只来自管理员口令验证写入的会话 token。
  if (_adminAuthenticated && !window.getCurrentUser()) {
    // 显示加载中
    target.innerHTML = '<div style="padding:80px 20px;text-align:center;color:#666;">正在恢复登录状态...</div>';
    var waitCount = 0;
    var _adminWaitTimer = null;
    function _pollUserReady() {
      waitCount++;
      var u = window.getCurrentUser();
      if (u) {
        // 用户就绪，异步重入（避免同步重入导致栈累积）
        setTimeout(function() { renderAdminDashboard(target); }, 0);
        return;
      }
      if (waitCount > 20) {
        // 2 秒后仍无用户，可能是 session 真的过期
        sessionStorage.removeItem('bioquest_admin_auth');
        _adminAuthenticated = false;
        setTimeout(function() { renderAdminLoginPage(target); }, 0);
        return;
      }
      _adminWaitTimer = setTimeout(_pollUserReady, 100);
    }
    _adminWaitTimer = setTimeout(_pollUserReady, 100);
    return;
  }

  target.innerHTML = `
    <div class="admin-dash">
      <div class="admin-dash-header">
        <div class="admin-dash-header-left">
          <div class="admin-dash-title">
            ${ICONS.settings}
            管理面板
          </div>
          <div class="admin-dash-subtitle">TATABOX 后台管理系统</div>
        </div>
        <button class="admin-dash-logout" id="admin-logout-btn">
          ${ICONS.logout}
          退出
        </button>
      </div>

      <div class="admin-tabs">
        <button class="admin-tab active" data-tab="questions">
          ${ICONS.book}
          题目管理
        </button>
        <button class="admin-tab" data-tab="users">
          ${ICONS.users}
          用户管理
        </button>
        <button class="admin-tab" data-tab="cards">
          ${ICONS.layers}
          知识卡片
        </button>
        <button class="admin-tab" data-tab="community">
          ${ICONS.messageCircle || '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'}
          社区管理
        </button>
        <button class="admin-tab" data-tab="ebook">
          ${ICONS.ebook}
          电子书管理
        </button>
        <button class="admin-tab" data-tab="announcements">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          公告管理
        </button>
        <button class="admin-tab" data-tab="feedbacks">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          反馈管理
        </button>
        <button class="admin-tab" data-tab="appeals">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          申诉管理
        </button>
        <button class="admin-tab" data-tab="sync">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
          数据同步
        </button>
        <button class="admin-tab" data-tab="ocr">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          OCR 录题
        </button>
        <button class="admin-tab" data-tab="aigen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
          AI 出题
        </button>
      </div>

      <div id="admin-tab-content"></div>
    </div>
  `;

  // 退出登录
  document.getElementById('admin-logout-btn').addEventListener('click', () => {
    _adminAuthenticated = false;
    sessionStorage.removeItem('bioquest_admin_auth');
    renderAdminLoginPage(target);
  });

  // 标签页切换
  const tabs = target.querySelectorAll('.admin-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadTabContent(target, tab.dataset.tab);
    });
  });

  loadTabContent(target, 'questions');
}

/* ===== 标签页分页/筛选状态（Issue #17：保留在核心，供 loadTabContent 与子模块共享） ===== */
var _adminQuestionPage = 1;
var _adminQuestionSearch = '';
var _adminQuestionModule = '';
var _adminQuestionTarget = '';

var _adminCardPage = 1;
var _adminCardSearch = '';
var _adminCardCategory = '';

/* ===== 标签页子模块懒加载（Issue #17：admin 按功能页拆分，点击后才加载） ===== */
var ADMIN_TAB_MODULES = {
  questions: 'js/admin/admin-questions.js',
  users: 'js/admin/admin-users.js',
  cards: 'js/admin/admin-cards.js',
  community: 'js/admin/admin-community.js',
  ebook: 'js/admin/admin-ebook.js',
  feedbacks: 'js/admin/admin-ops.js',
  appeals: 'js/admin/admin-ops.js',
  sync: 'js/admin/admin-ops.js',
  announcements: 'js/admin/admin-ops.js',
  ocr: 'js/admin/admin-ocr.js',
  aigen: 'js/admin/admin-aigen.js'
};
var _adminModulePromises = {};

/**
 * 动态注入 admin 子模块脚本（去重 + 失败可重试）。
 * @param {string} src 形如 'js/admin/admin-users.js' 的相对路径
 * @returns {Promise<boolean>} 是否加载成功
 */
function _ensureAdminModule(src) {
  if (_adminModulePromises[src]) return _adminModulePromises[src];
  _adminModulePromises[src] = new Promise(function (resolve) {
    var existing = document.querySelector('script[data-admin-module="' + src + '"]');
    if (existing) {
      if (existing.getAttribute('data-loaded') === '1') { resolve(true); return; }
      existing.addEventListener('load', function () { resolve(true); });
      existing.addEventListener('error', function () { resolve(false); });
      return;
    }
    var s = document.createElement('script');
    s.src = src + '?v=20260817a';
    s.setAttribute('data-admin-module', src);
    s.async = true;
    s.onload = function () { s.setAttribute('data-loaded', '1'); resolve(true); };
    s.onerror = function () { resolve(false); };
    document.head.appendChild(s);
  });
  // 失败后允许重试：清掉缓存的 promise（成功则复用）
  var p = _adminModulePromises[src];
  p.then(function (ok) { if (!ok) delete _adminModulePromises[src]; });
  return p;
}
window._ensureAdminModule = _ensureAdminModule;

/* ===== 加载标签内容（Issue #17：先按需注入子模块，再渲染） ===== */
async function loadTabContent(target, tab) {
  const contentEl = document.getElementById('admin-tab-content');
  if (!contentEl) return;
  contentEl.innerHTML = `<div class="admin-loading"><div class="admin-spinner"></div><div class="admin-loading-text">加载中...</div></div>`;

  // 子模块按需加载：未就绪则先拉取脚本，失败给出重试提示（应用主功能不受影响）
  var moduleSrc = ADMIN_TAB_MODULES[tab];
  if (moduleSrc) {
    var loaded = await _ensureAdminModule(moduleSrc);
    if (!loaded) {
      contentEl.innerHTML = `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">模块加载失败</div><div class="admin-empty-hint">网络异常或资源不可达，请切换标签重试。</div></div>`;
      return;
    }
  }

  if (tab === 'users') {
    const users = await getUsers();
    if (users) {
      renderUsersTab(contentEl, users);
    } else {
      contentEl.innerHTML = `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">加载用户数据失败</div><div class="admin-empty-hint">请确认：<br>1. 已登录 Supabase（页面右上角显示用户信息）<br>2. profiles 表已创建（运行 sql/schema.sql）<br>3. 当前用户的 user_group 已设为 "admin"</div></div>`;
    }
  } else if (tab === 'community') {
    renderCommunityTab(contentEl);
  } else if (tab === 'feedbacks') {
    await renderFeedbacksTab(contentEl);
  } else if (tab === 'appeals') {
    renderAppealsTab(contentEl);
  } else if (tab === 'ebook') {
    renderEbookTab(contentEl);
  } else if (tab === 'sync') {
    renderSyncTab(contentEl);
  } else if (tab === 'announcements') {
    renderAnnouncementsTab(contentEl);
  } else if (tab === 'ocr') {
    renderOcrTab(contentEl);
  } else if (tab === 'aigen') {
    renderAiGenTab(contentEl);
  } else if (tab === 'cards') {
    try {
      const data = await getCards({ page: _adminCardPage, search: _adminCardSearch, category: _adminCardCategory });
      if (data && data.cards && data.cards.length > 0) {
        renderCardsTab(contentEl, data);
      } else {
        // Supabase cards 表为空或不可用，尝试从 data/cards.json 加载
        try {
          const resp = await fetch('data/cards.json');
          if (resp.ok) {
            const jsonCards = await resp.json();
            let cardsArr = [];
            // 修复：data/cards.json 实际格式为 { "分类": [ { name, id, cards: [...] } ] }
            if (jsonCards && Array.isArray(jsonCards['分类'])) {
              jsonCards['分类'].forEach(function(cat) {
                const catName = cat.name || cat.id || '未分类';
                const catCards = Array.isArray(cat.cards) ? cat.cards : [];
                catCards.forEach(function(card) {
                  cardsArr.push(Object.assign({}, card, { category: catName }));
                });
              });
            } else if (Array.isArray(jsonCards)) {
              cardsArr = jsonCards;
            } else if (jsonCards && Array.isArray(jsonCards.cards)) {
              cardsArr = jsonCards.cards;
            }
            // 应用分类过滤
            let filtered = cardsArr;
            if (_adminCardCategory && _adminCardCategory !== 'all') {
              filtered = filtered.filter(function(c) { return c.category === _adminCardCategory; });
            }
            // 应用搜索过滤
            if (_adminCardSearch) {
              var sTerm = _adminCardSearch.toLowerCase();
              filtered = filtered.filter(function(c) {
                return (c.title && c.title.toLowerCase().indexOf(sTerm) >= 0) ||
                       (c.question && c.question.toLowerCase().indexOf(sTerm) >= 0) ||
                       (c.answer && c.answer.toLowerCase().indexOf(sTerm) >= 0) ||
                       (c.category && c.category.toLowerCase().indexOf(sTerm) >= 0);
              });
            }
            // 提取分类
            var cats = {};
            cardsArr.forEach(function(c) { if (c.category) cats[c.category] = true; });
            var categories = Object.keys(cats).sort();
            // 分页
            var perPage = 30;
            var pageCards = filtered.slice((_adminCardPage - 1) * perPage, _adminCardPage * perPage);
            var fallbackData = {
              cards: pageCards,
              total: filtered.length,
              categories: categories,
              page: _adminCardPage,
              per_page: perPage,
              _source: 'json'
            };
            if (pageCards.length === 0) {
              contentEl.innerHTML = `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">暂无知识卡片</div><div class="admin-empty-hint">当前分类/搜索条件下没有卡片。<br>共 ${cardsArr.length} 张卡片，${categories.length} 个分类。</div></div>`;
            } else {
              renderCardsTab(contentEl, fallbackData);
              showAdminToast('Supabase cards 表为空，已从 data/cards.json 加载 ' + cardsArr.length + ' 张卡片（仅作展示）', 'info');
            }
          } else {
            contentEl.innerHTML = `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">暂无知识卡片</div><div class="admin-empty-hint">Supabase cards 表为空且 data/cards.json 不可读。<br>可在 Supabase SQL Editor 中运行 sql/schema.sql 创建表后手动添加卡片。</div></div>`;
          }
        } catch(fetchErr) {
          console.warn('[Admin] 从 cards.json 加载失败:', fetchErr);
          contentEl.innerHTML = `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">暂无知识卡片</div><div class="admin-empty-hint">Supabase cards 表为空，且 data/cards.json 加载失败。</div></div>`;
        }
      }
    } catch(e) {
      console.error('[Admin] 加载卡片出错:', e);
      // S-007：不向用户暴露底层错误信息（可能含表名/字段/SQL），仅显示通用提示
      contentEl.innerHTML = `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">卡片加载失败</div><div class="admin-empty-hint">请稍后重试；若持续失败，请检查浏览器控制台（F12）获取详细信息</div></div>`;
    }
  } else {
    try {
      const data = await getQuestions({ page: _adminQuestionPage, search: _adminQuestionSearch, module: _adminQuestionModule });
      if (data) {
        renderQuestionsTab(contentEl, data);
      } else {
        contentEl.innerHTML = `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">加载题目数据失败</div><div class="admin-empty-hint">请确认：<br>1. 已登录 Supabase（页面右上角显示用户信息）<br>2. questions 表已创建（在 Supabase SQL Editor 中运行 sql/schema.sql）<br>3. 当前用户的 user_group 已设为 "admin"<br>4. 打开浏览器控制台（F12）查看详细错误</div></div>`;
        // 远端题目失败时仍挂载「本地题库 · 评分与回收站」，保证回收站入口始终可见
        if (typeof window._mountLocalSectionFallback === 'function') {
          window._mountLocalSectionFallback(contentEl);
        }
      }
    } catch(e) {
      console.error('[Admin] 加载题目出错:', e);
      // S-007：不向用户暴露底层错误信息，仅显示通用提示
      contentEl.innerHTML = `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">题目加载失败</div><div class="admin-empty-hint">请稍后重试；若持续失败，请检查浏览器控制台（F12）获取详细信息</div></div>`;
      if (typeof window._mountLocalSectionFallback === 'function') {
        window._mountLocalSectionFallback(contentEl);
      }
    }
  }
}

/* ===== Toast 通知 ===== */
function showAdminToast(message, type = 'success') {
  const existing = document.getElementById('admin-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'admin-toast';
  const bgColor = type === 'success' ? '#22c55e' : type === 'error' ? '#c0553a' : '#3b82f6';
  const iconSvg = type === 'success' ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#fff" fill="none" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' :
                 type === 'error' ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#fff" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' : '';
  toast.style.cssText = `
    position: fixed; top: 24px; right: 24px; z-index: 11000;
    background: ${bgColor}; color: #fff; padding: 14px 24px;
    border-radius: 12px; font-size: 0.88rem; font-weight: 500;
    display: flex; align-items: center; gap: 10px;
    box-shadow: var(--shadow-lg);
    animation: adminToastIn 0.35s ease; max-width: 380px;
  `;
  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'adminToastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, ADMIN_TOAST_DISPLAY_MS);
}

// 注入 Toast 动画样式
if (!document.getElementById('admin-toast-styles')) {
  const toastStyle = document.createElement('style');
  toastStyle.id = 'admin-toast-styles';
  toastStyle.textContent = `
    @keyframes adminToastIn { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes adminToastOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(40px); } }
  `;
  document.head.appendChild(toastStyle);
}

/* ===== 共享工具：文件 → base64（Issue #17：admin-ocr / admin-ebook 共用，置于核心） ===== */
function _ocrReadFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      // 去掉 data:image/...;base64, 前缀
      const b64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ===== 入口函数 ===== */
var _adminRenderGuard = false;
function renderAdminPage(target) {
  if (_adminRenderGuard) {
    console.warn('[Admin] renderAdminPage 重入检测，已阻止');
    return;
  }
  _adminRenderGuard = true;
  try {
    injectAdminStyles();
    if (_adminAuthenticated) {
      renderAdminDashboard(target);
    } else {
      renderAdminLoginPage(target);
    }
  } finally {
    _adminRenderGuard = false;
  }
}

var _adminInitGuard = false;
function initAdmin(target) {
  if (_adminInitGuard) {
    console.warn('[Admin] initAdmin 重入检测，已阻止');
    return;
  }
  _adminInitGuard = true;
  try {
    injectAdminStyles();
    if (!target) {
      if (typeof AppState !== 'undefined' && AppState.rootElement) {
        target = AppState.rootElement;
      } else {
        target = document.getElementById('page-content');
      }
    }
    renderAdminPage(target);
  } finally {
    _adminInitGuard = false;
  }
}

window.initAdmin = initAdmin;
window.renderAdminPage = renderAdminPage;
