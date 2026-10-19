/**
 * ============================================================
 * TATABOX — 用户中心模块
 * 设置面板、数据管理、学习记录、收藏夹、存储用量
 * ============================================================
 */

'use strict';

let userStylesInjected = false;

// CSP 安全的事件委托 wrapper（由 data-on 委托调用，供内联处理器改造使用）
window._cspSetBg = function (color) { if (this) this.style.background = color; };
window._cspClearNotifs = function () {
  if (typeof BioQuestNotifications === 'object' && BioQuestNotifications) BioQuestNotifications.clear();
  renderNotificationsPanel(document.getElementById('userSubPageBody'));
};

// escapeHtml 本地 fallback：优先使用全局函数，否则使用内联实现
var escapeHtml = (typeof window !== 'undefined' ? window : globalThis).escapeHtml; // 规范实现见 js/core/utils.js（Q-01 统一）

function injectUserStyles() {
  if (userStylesInjected) return;
  userStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'bioquest-user-styles';
  style.textContent = `
    .user-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    .user-card {
      background: var(--surface-primary, #ffffff);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-lg, 12px);
      padding: 28px;
      box-shadow: var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));
    }

    .user-card--full {
      grid-column: 1 / -1;
    }

    .user-card-title {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 4px;
    }

    .user-card-subtitle {
      font-size: 0.82rem;
      color: var(--text-muted, #8a8a8a);
      margin-bottom: 20px;
    }

    .user-setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--border-light, #ece8e1);
    }

    .user-setting-row:last-child {
      border-bottom: none;
    }

    .user-setting-label {
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text-primary, #1a1a1a);
    }

    .user-setting-desc {
      font-size: 0.75rem;
      color: var(--text-muted, #8a8a8a);
      margin-top: 2px;
    }

    .user-theme-select {
      padding: 8px 14px;
      border: 1px solid var(--border-default, #e0dcd5);
      border-radius: var(--radius-sm, 4px);
      background: var(--surface-secondary, #faf7f2);
      font-size: 0.85rem;
      color: var(--text-primary, #1a1a1a);
      cursor: pointer;
      transition: border-color var(--transition-fast, 0.15s ease);
    }

    .user-theme-select:focus {
      border-color: var(--color-amber, #c4956a);
      outline: none;
    }

    .user-data-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .user-data-action {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--border-light, #ece8e1);
    }

    .user-data-action:last-child {
      border-bottom: none;
    }

    .user-data-action-info {
      flex: 1;
    }

    .user-data-action-label {
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text-primary, #1a1a1a);
    }

    .user-data-action-desc {
      font-size: 0.75rem;
      color: var(--text-muted, #8a8a8a);
      margin-top: 2px;
    }

    .user-import-input {
      display: none;
    }

    .user-confirm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease;
    }

    .user-confirm-dialog {
      background: var(--surface-primary, #ffffff);
      border-radius: var(--radius-lg, 12px);
      padding: 32px;
      max-width: 420px;
      width: 90%;
      box-shadow: var(--shadow-lg, 0 4px 16px rgba(44, 62, 48, 0.07));
      text-align: center;
    }

    .user-confirm-icon {
      font-size: 2.5rem;
      margin-bottom: 12px;
    }

    .user-confirm-title {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 8px;
    }

    .user-confirm-text {
      font-size: 0.9rem;
      color: var(--text-secondary, #4a4a4a);
      margin-bottom: 24px;
      line-height: 1.6;
    }

    .user-confirm-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
    }

    .user-record-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .user-record-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--surface-secondary, #faf7f2);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-md, 8px);
      gap: 12px;
      flex-wrap: wrap;
    }

    .user-record-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .user-record-date {
      font-family: var(--font-mono, monospace);
      font-size: 0.78rem;
      color: var(--text-muted, #8a8a8a);
      min-width: 80px;
    }

    .user-record-type {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 2px 10px;
      border-radius: var(--radius-full, 9999px);
    }

    .user-record-type--practice {
      background: rgba(90, 125, 92, 0.1);
      color: var(--color-sage, #5a7d5c);
    }

    .user-record-type--exam {
      background: rgba(196, 149, 106, 0.1);
      color: var(--color-amber, #c4956a);
    }

    .user-record-info {
      font-size: 0.8rem;
      color: var(--text-secondary, #4a4a4a);
    }

    .user-record-accuracy {
      font-family: var(--font-mono, monospace);
      font-size: 0.85rem;
      font-weight: 700;
    }

    .user-record-accuracy--good {
      color: var(--color-success, #3a8c5c);
    }

    .user-record-accuracy--mid {
      color: var(--color-amber, #c4956a);
    }

    .user-record-accuracy--low {
      color: var(--color-error, #c0553a);
    }

    .user-fav-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .user-fav-group {
      margin-bottom: 4px;
    }

    .user-fav-group-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--color-sage, #5a7d5c);
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border-light, #ece8e1);
    }

    .user-fav-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--surface-secondary, #faf7f2);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-md, 8px);
      gap: 12px;
    }

    .user-fav-id {
      font-size: 0.85rem;
      color: var(--text-primary, #1a1a1a);
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-fav-go-btn {
      font-size: 0.78rem;
      padding: 6px 14px;
      border-radius: var(--radius-sm, 4px);
      border: 1px solid var(--color-amber, #c4956a);
      background: transparent;
      color: var(--color-amber, #c4956a);
      cursor: pointer;
      font-weight: 500;
      white-space: nowrap;
      transition: all var(--transition-fast, 0.15s ease);
    }

    .user-fav-go-btn:hover {
      background: rgba(196, 149, 106, 0.1);
    }

    .user-storage-info {
      padding: 16px;
      background: var(--surface-secondary, #faf7f2);
      border-radius: var(--radius-md, 8px);
      border: 1px solid var(--border-light, #ece8e1);
    }

    .user-storage-bar {
      height: 8px;
      background: var(--surface-tertiary, #f0ebe0);
      border-radius: 4px;
      overflow: hidden;
      margin: 10px 0;
    }

    .user-storage-fill {
      height: 100%;
      background: var(--color-sage, #5a7d5c);
      border-radius: 4px;
      transition: width 0.4s ease;
    }

    .user-storage-text {
      font-size: 0.78rem;
      color: var(--text-muted, #8a8a8a);
      font-family: var(--font-mono, monospace);
    }

    .user-empty-state {
      text-align: center;
      padding: 32px 16px;
      color: var(--text-muted, #8a8a8a);
    }

    .user-empty-state-icon {
      font-size: 2rem;
      margin-bottom: 8px;
    }

    .user-empty-state-text {
      font-size: 0.9rem;
    }

    .user-toast {
      position: fixed;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--color-deep, #1a3a2a);
      color: var(--text-inverse, #ffffff);
      padding: 12px 24px;
      border-radius: var(--radius-md, 8px);
      font-size: 0.88rem;
      font-weight: 500;
      z-index: 2000;
      animation: slideUp 0.3s ease, fadeOut 0.3s ease 1.7s forwards;
      box-shadow: var(--shadow-lg, 0 4px 16px rgba(44, 62, 48, 0.07));
    }

    @keyframes fadeOut {
      to { opacity: 0; transform: translateX(-50%) translateY(10px); }
    }

    @media (max-width: 768px) {
      .user-grid {
        grid-template-columns: 1fr;
      }
    }

    /* ===== 百词斩折叠式设计 ===== */
    .user-accordion-page {
      max-width: 700px;
      margin: 0 auto;
      padding: 16px 20px 80px;
    }

    /* 紧凑资料卡 */
    .user-profile-compact {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      background: var(--surface-primary, #fff);
      border-radius: var(--radius-lg, 12px);
      box-shadow: var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));
      margin-bottom: 16px;
      cursor: pointer;
      transition: box-shadow 0.2s;
    }
    .user-profile-compact:active {
      box-shadow: var(--shadow-md, 0 2px 8px rgba(44, 62, 48, 0.06));
    }
    .user-profile-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--color-sage, #5a7d5c);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 1.4rem;
      font-weight: 700;
      flex-shrink: 0;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      z-index: 5;
    }
    .user-profile-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
    }
    .user-profile-avatar-cam {
      position: absolute;
      right: -2px;
      bottom: -2px;
      width: 22px;
      height: 22px;
      background: var(--color-deep, #1a3a2a);
      border: 2px solid var(--surface-primary, #fff);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      pointer-events: none;
      z-index: 2;
    }
    .user-profile-avatar:hover::after {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      border-radius: 50%;
      pointer-events: none;
    }
    .user-profile-avatar input[type=file] {
      display: none;
    }
    .user-profile-avatar--loading {
      opacity: 0.55;
      pointer-events: none;
    }
    .user-profile-info {
      flex: 1;
      min-width: 0;
    }
    .user-profile-name {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 2px;
    }
    .user-profile-meta {
      font-size: 0.78rem;
      color: var(--text-muted, #8a8a8a);
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .user-profile-meta-points {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 8px;
      border-radius: 8px;
      background: rgba(196, 149, 106, 0.12);
      color: var(--color-amber-700, #8a5a2e);
      font-weight: 600;
      font-size: 0.76rem;
      border: 1px solid rgba(196, 149, 106, 0.3);
      white-space: nowrap;
    }
    .user-profile-meta-points[data-low="true"] {
      background: rgba(255, 107, 107, 0.12);
      color: #c0392b;
      border-color: rgba(255, 107, 107, 0.35);
    }
    .user-profile-meta-arrow {
      color: var(--text-muted, #8a8a8a);
    }
    .user-profile-badge {
      font-size: 0.68rem;
      padding: 2px 8px;
      border-radius: 8px;
      background: var(--color-sage, #5a7d5c);
      color: #fff;
      margin-left: 6px;
    }

    /* 快捷入口横排 */
    .user-quick-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    .user-quick-item {
      background: var(--surface-primary, #fff);
      border-radius: var(--radius-md, 8px);
      padding: 14px 8px;
      text-align: center;
      box-shadow: var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));
      cursor: pointer;
      transition: transform 0.15s;
    }
    .user-quick-item:active {
      transform: scale(0.95);
    }
    .user-quick-icon {
      font-size: 1.5rem;
      margin-bottom: 4px;
    }
    .user-quick-label {
      font-size: 0.72rem;
      color: var(--text-secondary, #4a4a4a);
    }

    /* 折叠面板 */
    .user-accordion {
      background: var(--surface-primary, #fff);
      border-radius: var(--radius-lg, 12px);
      box-shadow: var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));
      margin-bottom: 12px;
      overflow: hidden;
    }

    /* 列表式导航（替代折叠面板） */
    .user-list-group {
      display: flex;
      flex-direction: column;
      gap: 2px;
      background: var(--surface-primary, #fff);
      border-radius: var(--radius-lg, 12px);
      box-shadow: var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));
      overflow: hidden;
      margin-bottom: 16px;
    }
    .user-list-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 20px;
      cursor: pointer;
      transition: background 0.15s;
      border-bottom: 1px solid var(--border-light, #ece8e1);
    }
    .user-list-item:last-child { border-bottom: none; }
    .user-list-item:active { background: var(--surface-secondary, #faf7f2); }
    .user-list-icon {
      width: 40px; height: 40px;
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.2rem;
      flex-shrink: 0;
    }
    .user-list-info { flex: 1; min-width: 0; }
    .user-list-title { font-size: 0.92rem; font-weight: 600; color: var(--text-primary, #1a1a1a); }
    .user-list-desc { font-size: 0.75rem; color: var(--text-muted, #8a8a8a); margin-top: 2px; }
    .user-list-arrow { width: 18px; height: 18px; color: var(--text-muted, #8a8a8a); flex-shrink: 0; }

    /* 子页面 */
    .user-subpage { animation: fadeIn 0.2s; }
    .user-subpage-header {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 0 20px;
      border-bottom: 1px solid var(--border-light, #ece8e1);
      margin-bottom: 20px;
    }
    .user-subpage-back {
      display: flex; align-items: center; gap: 4px;
      background: none; border: none;
      color: var(--color-sage, #5a7d5c);
      font-size: 0.88rem; cursor: pointer; padding: 6px 10px;
    }
    .user-subpage-title {
      font-size: 1.1rem; font-weight: 700;
      color: var(--color-deep, #1a3a2a);
      font-family: var(--font-serif, "Noto Serif SC", serif);
    }
    .user-accordion-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }
    .user-accordion-header:active {
      background: var(--surface-secondary, #faf7f2);
    }
    .user-accordion-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      flex-shrink: 0;
      background: var(--color-sage, #5a7d5c);
      color: #fff;
    }
    .user-accordion-titles {
      flex: 1;
      min-width: 0;
    }
    .user-accordion-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary, #1a1a1a);
    }
    .user-accordion-summary {
      font-size: 0.74rem;
      color: var(--text-muted, #8a8a8a);
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .user-accordion-chevron {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      transition: transform 0.3s ease;
      color: var(--text-muted, #8a8a8a);
    }
    .user-accordion.open .user-accordion-chevron {
      transform: rotate(180deg);
    }
    .user-accordion-body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.35s ease;
    }
    .user-accordion.open .user-accordion-body {
      max-height: 2000px;
    }
    .user-accordion-content {
      padding: 0 20px 20px;
    }

    /* 成就横滑 */
    .user-ach-scroll {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding: 4px 0 8px;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .user-ach-scroll::-webkit-scrollbar {
      display: none;
    }
    .user-ach-chip {
      flex-shrink: 0;
      padding: 8px 14px;
      border-radius: 16px;
      background: var(--surface-secondary, #faf7f2);
      border: 1px solid var(--border-light, #ece8e1);
      font-size: 0.78rem;
      color: var(--text-secondary, #4a4a4a);
      white-space: nowrap;
    }
    .user-ach-chip--locked {
      opacity: 0.4;
    }

    @media (max-width: 640px) {
      .user-quick-row {
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
      }
      .user-quick-item {
        padding: 10px 4px;
      }
      .user-quick-icon {
        font-size: 1.2rem;
      }
    }
    @media (max-width: 380px) {
      .user-quick-row {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `;

  document.head.appendChild(style);
}

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
function getAvatarUrl() {
  try {
    var local = localStorage.getItem('bioquest_avatar');
    if (local) return local;
  } catch (e) {}
  if (typeof getCurrentUser === 'function') {
    try {
      var user = getCurrentUser();
      if (user && user.avatar_url) return user.avatar_url;
    } catch (e) {}
  }
  return null;
}

/**
 * 用 Canvas 将图片压缩为 maxSize×maxSize 的 JPEG dataURL
 */
function _compressAvatarImage(dataUrl, maxSize, quality, callback) {
  var img = new Image();
  img.onload = function() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = maxSize;
      canvas.height = maxSize;
      var ctx = canvas.getContext('2d');
      // 居中裁剪为正方形（cover）
      var min = Math.min(img.width, img.height);
      var sx = (img.width - min) / 2;
      var sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, maxSize, maxSize);
      callback(canvas.toDataURL('image/jpeg', quality));
    } catch (e) {
      callback(null);
    }
  };
  img.onerror = function() { callback(null); };
  img.src = dataUrl;
}

function _dataUrlToBlob(dataUrl) {
  var parts = dataUrl.split(',');
  var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
  var bin = atob(parts[1]);
  var arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function _renderAvatarInto(avatarEl, url) {
  if (!avatarEl) return;
  var input = avatarEl.querySelector('input[type=file]');
  avatarEl.textContent = '';
  var imgEl = document.createElement('img');
  imgEl.src = url;
  imgEl.alt = '头像';
  avatarEl.appendChild(imgEl);
  if (input) avatarEl.appendChild(input);
}

/**
 * 绑定头像点击上传逻辑
 * 头像容器是 <label for="userAvatarInput">，原生点击即可打开文件选择框；
 * 这里只需阻止冒泡（避免触发父级 navigateTo）并处理 change 事件。
 */
function setupAvatarUpload() {
  var avatarBtn = document.getElementById('userAvatarBtn');
  var avatarInput = document.getElementById('userAvatarInput');
  if (!avatarBtn || !avatarInput) return;

  // 阻止冒泡到父级 .user-profile-compact 的 navigateTo('/dashboard')
  // <label for="userAvatarInput"> 原生会触发关联 input 的文件选择，无需手动 click()
  avatarBtn.addEventListener('click', function(e) {
    e.stopPropagation();
  });

  avatarInput.addEventListener('change', function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    var allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.indexOf(file.type) === -1) {
      showToast('仅支持 JPEG / PNG / WebP 格式');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('图片大小不能超过 5MB');
      e.target.value = '';
      return;
    }

    avatarBtn.classList.add('user-profile-avatar--loading');

    var reader = new FileReader();
    reader.onload = function(ev) {
      _compressAvatarImage(ev.target.result, 200, 0.8, function(compressed) {
        avatarBtn.classList.remove('user-profile-avatar--loading');
        if (!compressed) {
          showToast('图片处理失败，请更换图片');
          e.target.value = '';
          return;
        }
        // 存到 localStorage
        try { localStorage.setItem('bioquest_avatar', compressed); } catch (storageErr) {
          showToast('本地存储失败：' + (storageErr.message || '空间不足'));
          e.target.value = '';
          return;
        }
        // 立即更新显示
        _renderAvatarInto(avatarBtn, compressed);

        // 已登录 Supabase 则尝试上传，失败静默降级
        if (typeof window.uploadAvatar === 'function'
            && typeof window.isLoggedIn === 'function' && window.isLoggedIn()) {
          var user = window.getCurrentUser ? window.getCurrentUser() : null;
          if (user && !user.isGuest) {
            try {
              var blob = _dataUrlToBlob(compressed);
              var blobFile = new File([blob], user.id + '.jpg', { type: 'image/jpeg' });
              window.uploadAvatar(blobFile).catch(function() {});
            } catch (uploadErr) { /* 静默 */ }
          }
        }
        showToast('头像已更新');
        e.target.value = '';
      });
    };
    reader.onerror = function() {
      avatarBtn.classList.remove('user-profile-avatar--loading');
      showToast('读取文件失败');
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  });
}

window.getAvatarUrl = getAvatarUrl;

function renderProfilePanel(container) {
  var username = '';
  var displayName = '';
  var group = 'guest';
  var email = '';
  var emailVerified = false;

  if (typeof getCurrentUser === 'function') {
    try {
      var user = getCurrentUser();
      if (user && typeof user === 'object') {
        username = user.username || user.email || '';
        displayName = user.displayName || user.display_name || username;
        email = user.email || '';
        group = user.group || user.role || 'guest';
        emailVerified = !!(user.emailVerified || user.email_verified);
      }
    } catch (e) {
      console.warn('[TATABOX] 获取用户信息失败:', e);
    }
  }

  var groupLabels = {
    admin: '管理员',
    premium: '高级会员',
    verified: '认证会员',
    member: '普通会员',
    guest: '访客'
  };
  var groupColors = {
    admin: '#c0553a',
    premium: '#c4956a',
    verified: '#3a8c5c',
    member: '#5a7d5c',
    guest: '#8a8a8a'
  };

  var groupLabel = groupLabels[group] || group;
  var groupColor = groupColors[group] || '#8a8a8a';

  // 信用指数（优先使用本地信用，稍后异步刷新云端）
  var points = (typeof window.getPoints === 'function') ? window.getPoints() : _POINTS_DEFAULTS.BASE;
  var levelInfo = (typeof window.getPointsLevel === 'function')
    ? window.getPointsLevel(points)
    : { label: '基本信任', title: '基本信任', color: '#5a7d5c' };
  var ptsPercent = levelInfo.nextAt ? Math.round(levelInfo.progress * 100) : 100;

  var upgradeHint = '';
  if (group === 'member') {
    upgradeHint = '<div style="font-size:0.82rem;color:var(--text-muted,#8a8a8a);margin-top:12px;padding:10px 14px;background:var(--surface-secondary,#faf7f2);border-radius:8px;border:1px solid var(--border-light,#ece8e1);">验证邮箱升级为认证会员</div>';
  } else if (group === 'verified') {
    upgradeHint = '<div style="font-size:0.82rem;color:var(--text-muted,#8a8a8a);margin-top:12px;padding:10px 14px;background:var(--surface-secondary,#faf7f2);border-radius:8px;border:1px solid var(--border-light,#ece8e1);">认证会员可访问学习分析等功能</div>';
  }

  var emailBadge = emailVerified
    ? '<span style="color:var(--color-success,#3a8c5c);font-size:0.82rem;">邮箱已验证</span>'
    : '<span style="color:var(--color-amber,#c4956a);font-size:0.82rem;cursor:pointer;" id="userVerifyEmailBtn">请验证邮箱</span>';

  container.innerHTML = `
    <div class="user-card" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
      <div style="flex:1;min-width:200px;">
        <div style="font-family:var(--font-serif,'Noto Serif SC',serif);font-size:1.3rem;font-weight:700;color:var(--color-deep,#1a3a2a);margin-bottom:4px;">${escapeHtml(displayName || '用户')}</div>
        ${username && username !== displayName ? '<div style="font-size:0.82rem;color:var(--text-muted,#8a8a8a);margin-bottom:8px;">@' + escapeHtml(username) + '</div>' : ''}
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="display:inline-block;padding:3px 12px;border-radius:16px;font-size:0.78rem;font-weight:600;color:#fff;background:${groupColor};">${escapeHtml(groupLabel)}</span>
          ${emailBadge}
        </div>
        ${upgradeHint}
      </div>
      <div style="min-width:180px;flex:1;max-width:320px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary,#1a1a1a);">信用指数</span>
          <span style="font-size:0.85rem;font-weight:700;color:${levelInfo.color};" id="user-points-score">${points}</span>
        </div>
        <div style="height:8px;background:var(--border-light,#ece8e1);border-radius:16px;overflow:hidden;margin-bottom:6px;">
          <div id="user-points-bar" style="width:${ptsPercent}%;height:100%;background:${levelInfo.color};border-radius:16px;transition:width 0.4s ease;"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:0.78rem;color:var(--text-muted,#8a8a8a);" id="user-points-level">${levelInfo.title}</span>
          <span style="font-size:0.75rem;color:var(--text-muted,#8a8a8a);">信用</span>
        </div>
      </div>
    </div>
  `;

  // 异步刷新最新信用指数（云端为准）
  if (typeof window.getUserPoints === 'function') {
    window.getUserPoints().then(function(info) {
      if (!info || typeof info.points !== 'number') return;
      var scoreEl = document.getElementById('user-points-score');
      var barEl = document.getElementById('user-points-bar');
      var levelEl = document.getElementById('user-points-level');
      var lv = (typeof window.getPointsLevel === 'function') ? window.getPointsLevel(info.points) : null;
      if (scoreEl) scoreEl.textContent = info.points;
      if (barEl && lv) {
        barEl.style.width = (lv.nextAt ? Math.round(lv.progress * 100) : 100) + '%';
        barEl.style.background = lv.color;
      }
      if (levelEl && lv) levelEl.textContent = lv.title;
    }).catch(function() {});
  }

  var verifyBtn = document.getElementById('userVerifyEmailBtn');
  if (verifyBtn) {
    verifyBtn.addEventListener('click', function() {
      if (typeof window.resendConfirmationEmail === 'function') {
        window.resendConfirmationEmail(email);
        showToast('验证邮件已发送，请查收');
      } else {
        showToast('验证邮件功能暂不可用');
      }
    });
  }
}

function renderAccountActions(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="user-card-title">账户操作</div>
    <div class="user-card-subtitle">管理你的账户状态</div>
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:16px;">
      <button id="userForceLogoutBtn" style="
        display:inline-flex;align-items:center;gap:8px;
        padding:12px 28px;border:1.5px solid var(--color-amber,#c4956a);border-radius:16px;
        background:transparent;color:var(--color-amber,#c4956a);
        font-size:0.9rem;font-weight:600;cursor:pointer;
        transition:all 0.2s ease;
      " data-on-mouseover='["_cspSetBg","rgba(196,149,106,0.08)"]' data-on-mouseout='["_cspSetBg","transparent"]'>
        永久退出登录
      </button>
      <button id="userDeleteAccountBtn" style="
        display:inline-flex;align-items:center;gap:8px;
        padding:12px 28px;border:1.5px solid var(--color-error,#c0553a);border-radius:16px;
        background:transparent;color:var(--color-error,#c0553a);
        font-size:0.9rem;font-weight:600;cursor:pointer;
        transition:all 0.2s ease;
      " data-on-mouseover='["_cspSetBg","rgba(192,85,58,0.08)"]' data-on-mouseout='["_cspSetBg","transparent"]'>
        注销账号
      </button>
    </div>
  `;

  document.getElementById('userForceLogoutBtn').addEventListener('click', function() {
    if (confirm('确定要永久退出登录吗？\n\n此操作将清除所有本地登录数据，下次使用需重新登录。')) {
      forceLogout();
    }
  });

  document.getElementById('userDeleteAccountBtn').addEventListener('click', function() {
    if (confirm('确定要注销账号吗？\n\n此操作不可恢复！将永久删除你的账户、学习记录、收藏和错题数据。\n\n建议先导出数据备份。')) {
      if (confirm('再次确认：注销后所有数据将永久丢失！')) {
        deleteAccount();
      }
    }
  });
}

function renderSettingsPanel(container) {
  const currentTheme = (typeof loadSetting === 'function') ? loadSetting('theme', 'light') : 'light';
  // 题库数据源：'cloud' 云端同步（默认）/ 'local' 本地题库（不发 Supabase 请求）
  const qSource = (typeof loadSetting === 'function') ? loadSetting('question_source', 'cloud') : 'cloud';
  var avatarUrl = (typeof getAvatarUrl === 'function') ? getAvatarUrl() : null;
  var avatarHtml = avatarUrl ? '<img src="' + avatarUrl + '" alt="头像">' : '';

  // 已保存的 API Key 配置
  var apiKeyConfig = _loadApiKeyConfig();
  var dailyUsage = _getApiKeyDailyUsage();

  container.innerHTML = `
    <div class="user-card">
      <div class="user-card-title">设置面板</div>
      <div class="user-card-subtitle">自定义你的学习体验</div>

      <div class="user-setting-row">
        <div>
          <div class="user-setting-label">主题切换</div>
          <div class="user-setting-desc">选择浅色、深色或跟随系统</div>
        </div>
        <select class="user-theme-select" id="userThemeSelect">
          <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>浅色模式</option>
          <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>深色模式</option>
          <option value="system" ${currentTheme === 'system' ? 'selected' : ''}>跟随系统</option>
        </select>
      </div>

      <div class="user-setting-row">
        <div>
          <div class="user-setting-label">字体大小</div>
          <div class="user-setting-desc">调整界面字体大小</div>
        </div>
        <select class="user-theme-select" id="userFontSize">
          <option value="small">小</option>
          <option value="medium" selected>中</option>
          <option value="large">大</option>
        </select>
      </div>

      <div class="user-setting-row">
        <div>
          <div class="user-setting-label">题库数据源</div>
          <div class="user-setting-desc">「本地题库」直接从站点内 data/ 读取题目，不发远程请求</div>
        </div>
        <select class="user-theme-select" id="userQuestionSource">
          <option value="cloud" ${qSource === 'cloud' ? 'selected' : ''}>云端同步</option>
          <option value="local" ${qSource === 'local' ? 'selected' : ''}>本地题库</option>
        </select>
      </div>
    </div>

    <!-- 头像上传（已迁移到设置） -->
    <div class="user-card">
      <div class="user-card-title">个人头像</div>
      <div class="user-card-subtitle">上传后会同步到云端（如已登录）</div>
      <div style="display:flex;align-items:center;gap:16px;margin-top:12px;">
        <label class="user-profile-avatar user-profile-avatar--lg" for="userAvatarInput" title="点击上传头像" style="width:72px;height:72px;cursor:pointer;flex-shrink:0;">
          ${avatarHtml}
          <span class="user-profile-avatar-cam" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </span>
          <input type="file" accept="image/jpeg,image/png,image/webp" id="userAvatarInput" style="display:none;">
        </label>
        <div style="flex:1;font-size:0.84rem;color:var(--text-secondary,#4a4a4a);line-height:1.6;">
          支持 JPEG / PNG / WebP，单张不超过 5MB。<br>
          点击左侧头像即可选择图片。
        </div>
      </div>
    </div>

    <!-- 自定义 AI API Key -->
    <div class="user-card">
      <div class="user-card-title">AI 模型 API Key（个人使用）</div>
      <div class="user-card-subtitle">自带 Key 可解锁 AI 导师、讨论、错题讲解等高级功能，仅你本人使用</div>

      <div class="user-setting-row" style="flex-direction:column;align-items:stretch;gap:10px;">
        <div>
          <div class="user-setting-label">服务商</div>
          <select class="user-theme-select" id="aiProviderSelect" style="width:100%;margin-top:6px;">
            <option value="deepseek" ${apiKeyConfig.provider === 'deepseek' ? 'selected' : ''}>DeepSeek（推荐 · 价格低）</option>
            <option value="zhipu" ${apiKeyConfig.provider === 'zhipu' ? 'selected' : ''}>智谱 GLM（免费额度大）</option>
            <option value="qwen" ${apiKeyConfig.provider === 'qwen' ? 'selected' : ''}>阿里通义千问</option>
            <option value="moonshot" ${apiKeyConfig.provider === 'moonshot' ? 'selected' : ''}>月之暗面 Kimi</option>
            <option value="nvidia" ${apiKeyConfig.provider === 'nvidia' ? 'selected' : ''}>NVIDIA NIM（1000 次免费）</option>
            <option value="siliconflow" ${apiKeyConfig.provider === 'siliconflow' ? 'selected' : ''}>硅基流动（多模型免费）</option>
          </select>
        </div>

        <div>
          <div class="user-setting-label">API Key</div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <input type="password" id="aiApiKeyInput" placeholder="sk-..." value="${apiKeyConfig.apiKey ? (apiKeyConfig.apiKey.length > 4 ? '****' + apiKeyConfig.apiKey.slice(-4) : '****') : ''}" style="flex:1;padding:10px 12px;border:1px solid var(--border-light,#e3e0d8);border-radius:8px;font-size:0.88rem;font-family:var(--font-mono,monospace);background:var(--surface-primary,#fff);color:var(--text-primary,#1a1a1a);outline:none;" data-has-key="${apiKeyConfig.apiKey ? '1' : '0'}">
            <button id="aiKeyToggleBtn" class="btn btn-sm btn-secondary" style="padding:0 14px;">显示</button>
          </div>
        </div>

        <div>
          <div class="user-setting-label">模型名称（可选）</div>
          <input type="text" id="aiModelInput" placeholder="留空使用服务商默认推荐模型" value="${escapeHtml(apiKeyConfig.model || '')}" style="width:100%;margin-top:6px;padding:10px 12px;border:1px solid var(--border-light,#e3e0d8);border-radius:8px;font-size:0.84rem;background:var(--surface-primary,#fff);color:var(--text-primary,#1a1a1a);outline:none;">
        </div>

        <div>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--text-secondary,#4a4a4a);cursor:pointer;">
            <input type="checkbox" id="aiKeyRememberCb" ${apiKeyConfig.remember ? 'checked' : ''} style="accent-color:var(--color-sage,#5a7d5c);width:16px;height:16px;">
            <span>会话内记住 Key（刷新不丢失，关闭标签页自动清除）</span>
          </label>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
          <button class="btn btn-sm btn-primary" id="aiKeySaveBtn">保存</button>
          <button class="btn btn-sm btn-secondary" id="aiKeyTestBtn">测试连接</button>
          <button class="btn btn-sm btn-danger" id="aiKeyClearBtn">清除</button>
        </div>

        <div id="aiKeyTestResult" style="font-size:0.78rem;color:var(--text-muted,#8a8a8a);min-height:18px;"></div>

        <!-- 今日用量 -->
        <div style="padding:10px 12px;background:rgba(90,125,92,0.06);border-radius:8px;font-size:0.8rem;color:var(--text-secondary,#4a4a4a);">
          <strong>今日用量：</strong> ${dailyUsage.count} / ${_AI_DAILY_LIMIT} 次
          <div style="margin-top:6px;height:6px;background:rgba(0,0,0,0.08);border-radius:2px;overflow:hidden;">
            <div style="width:${Math.min(100, dailyUsage.count / _AI_DAILY_LIMIT * 100)}%;height:100%;background:${dailyUsage.count >= _AI_DAILY_LIMIT ? '#e53e3e' : 'var(--color-sage,#5a7d5c)'};transition:width .3s;"></div>
          </div>
          ${dailyUsage.count >= _AI_DAILY_LIMIT ? '<div style="color:var(--color-error,#c0553a);margin-top:6px;font-size:0.76rem;">今日额度已用完，明日 0:00 重置</div>' : ''}
        </div>

        <!-- 申请指引 -->
        <details style="margin-top:8px;border:1px solid var(--border-light,#ece8e1);border-radius:8px;padding:0;">
          <summary style="padding:10px 14px;cursor:pointer;font-size:0.84rem;font-weight:600;color:var(--color-sage,#3a6b4a);">如何免费申请 API Key？</summary>
          <div style="padding:0 14px 14px;font-size:0.8rem;line-height:1.75;color:var(--text-secondary,#4a4a4a);">
            <p class="bq-m-0 bq-mt-8 bq-mb-4"><strong>1. DeepSeek（推荐 · 性价比最高）</strong></p>
            <p class="bq-m-0 bq-mb-8">访问 <a href="https://platform.deepseek.com" target="_blank" class="bq-hint--amber">platform.deepseek.com</a> → 注册 → 顶部「API Keys」创建。新用户送 500 万 tokens 免费额度，1 元可买 100 万 tokens。模型填 <code class="bq-kbd">deepseek-chat</code></p>

            <p class="bq-m-0 bq-mt-8 bq-mb-4"><strong>2. 智谱 GLM（免费额度大）</strong></p>
            <p class="bq-m-0 bq-mb-8">访问 <a href="https://open.bigmodel.cn" target="_blank" class="bq-hint--amber">open.bigmodel.cn</a> → 注册 → 「API Keys」创建。新用户送 2000 万 tokens 免费额度。模型填 <code class="bq-kbd">glm-4-flash</code>（免费）或 <code class="bq-kbd">glm-4-plus</code></p>

            <p class="bq-m-0 bq-mt-8 bq-mb-4"><strong>3. 阿里通义千问</strong></p>
            <p class="bq-m-0 bq-mb-8">访问 <a href="https://dashscope.console.aliyun.com" target="_blank" class="bq-hint--amber">dashscope.console.aliyun.com</a> → 注册 → 「API-KEY 管理」。新用户送 100 万 tokens 免费额度。模型填 <code class="bq-kbd">qwen-turbo</code></p>

            <p class="bq-m-0 bq-mt-8 bq-mb-4"><strong>4. 月之暗面 Kimi</strong></p>
            <p class="bq-m-0 bq-mb-8">访问 <a href="https://platform.moonshot.cn" target="_blank" class="bq-hint--amber">platform.moonshot.cn</a> → 注册 → 「API Key 管理」。新用户送 15 元体验金。模型填 <code class="bq-kbd">moonshot-v1-8k</code></p>

            <p class="bq-m-0 bq-mt-8 bq-mb-4"><strong>5. NVIDIA NIM（1000 次免费）</strong></p>
            <p class="bq-m-0 bq-mb-8">访问 <a href="https://build.nvidia.com" target="_blank" class="bq-hint--amber">build.nvidia.com</a> → 注册 → 任选模型 → 右侧「Get API Key」。每个账号 1000 次免费调用，可调用 Llama 3.3 70B 等开源大模型。模型填 <code class="bq-kbd">meta/llama-3.3-70b-instruct</code></p>

            <p class="bq-m-0 bq-mt-8 bq-mb-4"><strong>6. 硅基流动 SiliconFlow（多模型免费）</strong></p>
            <p class="bq-m-0 bq-mb-8">访问 <a href="https://cloud.siliconflow.cn" target="_blank" class="bq-hint--amber">cloud.siliconflow.cn</a> → 注册 → 「API 密钥」。新用户送 14 元额度，Qwen2.5-7B 等小模型永久免费。模型填 <code class="bq-kbd">Qwen/Qwen2.5-7B-Instruct</code></p>

            <p style="margin:10px 0 4px;padding-top:8px;border-top:1px dashed var(--border-light,#ece8e1);"><strong>隐私说明</strong></p>
            <p style="margin:0;">API Key 仅保存在当前页面的内存中；若勾选「会话内记住」，会额外存入本标签页的 sessionStorage（关闭标签页即自动清除）。Key 不会上传服务器，也不会持久化到你浏览器的 localStorage 或磁盘，关闭浏览器后长期不留存。</p>

            <p style="margin:10px 0 4px;"><strong>用量限制</strong></p>
            <p style="margin:0;">为避免滥用，每个用户每日限 ${_AI_DAILY_LIMIT} 次 AI 调用，0:00 自动重置。自定义 Key 用户同样受此限制。</p>
          </div>
        </details>
      </div>
    </div>

    <!-- Bio 分计算器（六维 → Bio Score，随设置面板联动，主题复用站点变量） -->
    <div class="user-card">
      <div class="user-card-title">Bio 分计算器</div>
      <div class="user-card-subtitle">输入六维属性（0-100）实时推演 Bio Score 总分与评级，公式与评级规则 100% 公开</div>
      <div id="userBioCalcEmbed" class="bq-mt-12"></div>
    </div>
  `;

  // 主题切换
  document.getElementById('userThemeSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    if (typeof saveSetting === 'function') {
      saveSetting('theme', val);
    }

    if (val === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (typeof toggleTheme === 'function') {
        toggleTheme(prefersDark ? 'dark' : 'light');
      }
    } else {
      if (typeof toggleTheme === 'function') {
        toggleTheme(val);
      }
    }

    showToast('主题已切换');
  });

  // 题库数据源切换（云端同步 / 本地题库）
  document.getElementById('userQuestionSource').addEventListener('change', (e) => {
    const val = e.target.value;
    if (typeof saveSetting === 'function') {
      saveSetting('question_source', val);
    }
    showToast(val === 'local' ? '已切换为本地题库，考试/练习将读取 data/ 题目' : '已切换为云端同步');
  });

  // 头像上传（设置页内）
  if (typeof setupAvatarUpload === 'function') {
    // 延迟一帧让 DOM 完全渲染
    setTimeout(setupAvatarUpload, 0);
  }

  // API Key 相关交互
  _bindApiKeySettings();

  // Bio 分计算器：懒加载共享模块（bio-calc + score-engine），幂等挂载
  var bioEmbed = document.getElementById('userBioCalcEmbed');
  function _mountBioCalc() {
    if (!bioEmbed) return;
    if (typeof window.renderBioCalcWidget === 'function') {
      window.renderBioCalcWidget(bioEmbed);
    } else if (typeof window.loadModule === 'function') {
      window.loadModule('bio-calc').then(function () {
        if (typeof window.renderBioCalcWidget === 'function') {
          window.renderBioCalcWidget(bioEmbed);
        }
      }).catch(function () {
        if (bioEmbed) {
          bioEmbed.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted,#8a8a8a);">计算器加载失败，请刷新页面重试。</p>';
        }
      });
    }
  }
  _mountBioCalc();
}

/* ============== AI API Key 管理 ============== */
var _AI_DAILY_LIMIT = 100; // 每用户每日限 100 次 AI 调用
var _AI_KEY_STORAGE = 'bioquest_ai_key_config';
var _AI_USAGE_STORAGE = 'bioquest_ai_usage';

// 安全：API Key 存储统一委托 window.BioQuestKeyStore（闭包化单例，P1-3 修复）。
// - 页面内存：默认，刷新后需重新输入 Key；
// - 会话内记住（用户显式勾选）：额外写入 sessionStorage，同标签页刷新可恢复，关闭标签页即清除；
// - 绝不写入 localStorage，避免明文长留存磁盘；也不再使用 window 全局明文属性
//   window.__bioquest_ai_key_memory__（该属性已由 ai-key-store.js 接管并废弃）。

function _getMemKey() {
  try {
    if (window.BioQuestKeyStore && typeof window.BioQuestKeyStore.get === 'function') {
      return window.BioQuestKeyStore.get() || '';
    }
  } catch (e) {}
  return '';
}

function _setMemKey(k, remember) {
  try {
    if (window.BioQuestKeyStore && typeof window.BioQuestKeyStore.set === 'function') {
      window.BioQuestKeyStore.set(k, remember);
    }
  } catch (e) {}
}

function _loadApiKeyConfig() {
  var cfg = { provider: 'deepseek', apiKey: '', model: '', remember: false };
  try {
    var raw = localStorage.getItem(_AI_KEY_STORAGE);
    if (raw) {
      var stored = JSON.parse(raw);
      cfg.provider = stored.provider || cfg.provider;
      cfg.model = stored.model || '';
    }
  } catch (e) {}
  // 旧版 localStorage 明文 Key 的迁移由 BioQuestKeyStore.get() 内部完成并擦除
  cfg.apiKey = _getMemKey();
  cfg.remember = !!(window.BioQuestKeyStore && window.BioQuestKeyStore.isRemember &&
    window.BioQuestKeyStore.isRemember());
  return cfg;
}

function _saveApiKeyConfig(cfg, remember) {
  // API Key 一律经闭包单例保存（可选「会话内记住」），绝不落 localStorage
  _setMemKey((cfg && cfg.apiKey) || '', !!remember);
  try {
    localStorage.setItem(_AI_KEY_STORAGE, JSON.stringify({
      provider: (cfg && cfg.provider) || 'deepseek',
      model: (cfg && cfg.model) || '',
      apiKey: '' // 永不落盘
    }));
  } catch (e) {}
}

function _getApiKeyConfig() {
  return _loadApiKeyConfig();
}

// 获取今日用量（按本地日期重置，与界面「明日 0:00 重置」文案一致）
function _getApiKeyDailyUsage() {
  try {
    var raw = localStorage.getItem(_AI_USAGE_STORAGE);
    var data = raw ? JSON.parse(raw) : {};
    var today = localTodayStr(); // YYYY-MM-DD（本地时区）
    if (data.date !== today) {
      data = { date: today, count: 0 };
      localStorage.setItem(_AI_USAGE_STORAGE, JSON.stringify(data));
    }
    return data;
  } catch (e) {
    return { date: localTodayStr(), count: 0 };
  }
}

// 自增用量（调用 AI 前调用），返回 true 表示可继续，false 表示已达上限
function _incrementAiUsage() {
  var data = _getApiKeyDailyUsage();
  if (data.count >= _AI_DAILY_LIMIT) return false;
  data.count += 1;
  try {
    localStorage.setItem(_AI_USAGE_STORAGE, JSON.stringify(data));
  } catch (e) {}
  return true;
}

// 检查是否可以使用 AI（仅检查每日用量上限，不强制要求自定义 Key）
// 未配置自定义 Key 的用户可使用平台默认 Key，但同样受每日上限限制
function _canUseAi() {
  var usage = _getApiKeyDailyUsage();
  if (usage.count >= _AI_DAILY_LIMIT) {
showToast('今日 AI 调用已达上限（' + _AI_DAILY_LIMIT + ' 次），明日 0:00 重置。配置自定义 API Key 可解锁更多额度。');
    return false;
  }
  return true;
}

// 服务商 → 端点/默认模型 映射
var _AI_PROVIDER_MAP = {
  deepseek:    { base: 'https://api.deepseek.com/v1',           defaultModel: 'deepseek-chat',         name: 'DeepSeek' },
  zhipu:       { base: 'https://open.bigmodel.cn/api/paas/v4',  defaultModel: 'glm-4-flash',           name: '智谱 GLM' },
  qwen:        { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-turbo', name: '通义千问' },
  moonshot:    { base: 'https://api.moonshot.cn/v1',            defaultModel: 'moonshot-v1-8k',        name: 'Kimi' },
  nvidia:      { base: 'https://integrate.api.nvidia.com/v1',   defaultModel: 'meta/llama-3.3-70b-instruct', name: 'NVIDIA NIM' },
  siliconflow: { base: 'https://api.siliconflow.cn/v1',         defaultModel: 'Qwen/Qwen2.5-7B-Instruct', name: '硅基流动' }
};

function _bindApiKeySettings() {
  var toggleBtn = document.getElementById('aiKeyToggleBtn');
  var keyInput = document.getElementById('aiApiKeyInput');
  if (toggleBtn && keyInput) {
    toggleBtn.addEventListener('click', function() {
      if (keyInput.type === 'password') {
        keyInput.type = 'text';
        toggleBtn.textContent = '隐藏';
      } else {
        keyInput.type = 'password';
        toggleBtn.textContent = '显示';
      }
    });
    // 用户聚焦输入框时清空遮罩值，允许输入新 Key
    keyInput.addEventListener('focus', function() {
      if (keyInput.value.indexOf('****') !== -1) {
        keyInput.value = '';
        keyInput.removeAttribute('data-has-key');
      }
    });
  }

  // 读取「会话内记住」勾选项
  function _rememberChecked() {
    var cb = document.getElementById('aiKeyRememberCb');
    return !!(cb && cb.checked);
  }

  var saveBtn = document.getElementById('aiKeySaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      var inputVal = keyInput.value.trim();
      // 如果输入框是遮罩值（未修改），保留原 Key
      if (inputVal.indexOf('****') !== -1) {
        var existingCfg = _loadApiKeyConfig();
        inputVal = existingCfg.apiKey || '';
      }
      var cfg = {
        provider: document.getElementById('aiProviderSelect').value,
        apiKey: inputVal,
        model: document.getElementById('aiModelInput').value.trim()
      };
      if (!cfg.apiKey) {
        showToast('请输入 API Key');
        return;
      }
      _saveApiKeyConfig(cfg, _rememberChecked());
      // 恢复遮罩显示
      keyInput.value = cfg.apiKey.length > 4 ? '****' + cfg.apiKey.slice(-4) : '****';
      keyInput.type = 'password';
showToast(_rememberChecked()
  ? '已保存（会话内记住：刷新不丢失，关闭标签页自动清除）'
  : '已保存（Key 仅存当前页面内存，刷新页面后需重新输入）');
    });
  }

  var testBtn = document.getElementById('aiKeyTestBtn');
  if (testBtn) {
    testBtn.addEventListener('click', _testAiKeyConnection);
  }

  var clearBtn = document.getElementById('aiKeyClearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      var cb = document.getElementById('aiKeyRememberCb');
      // 清除 Key 的同时复位「会话内记住」偏好（remember=false 会一并清除 session 中的 Key 与偏好标记）
      _saveApiKeyConfig({ provider: 'deepseek', apiKey: '', model: '' }, false);
      if (cb) cb.checked = false;
      keyInput.value = '';
      document.getElementById('aiModelInput').value = '';
      document.getElementById('aiProviderSelect').value = 'deepseek';
      showToast('已清除 API Key');
    });
  }
}

function _testAiKeyConnection() {
  var resultEl = document.getElementById('aiKeyTestResult');
  if (!resultEl) return;
  var inputVal = document.getElementById('aiApiKeyInput').value.trim();
  // 如果输入框是遮罩值，从内存单例读取真实 Key（不再触达已废弃的明文全局属性）
  if (inputVal.indexOf('****') !== -1) {
    var existingCfg = _loadApiKeyConfig();
    inputVal = existingCfg.apiKey || '';
  }
  var cfg = {
    provider: document.getElementById('aiProviderSelect').value,
    apiKey: inputVal,
    model: document.getElementById('aiModelInput').value.trim()
  };
  if (!cfg.apiKey) {
    resultEl.textContent = '请先输入 API Key';
    resultEl.style.color = 'var(--color-error,#c0553a)';
    return;
  }

  resultEl.textContent = '正在测试连接...';
  resultEl.style.color = 'var(--text-muted,#8a8a8a)';

  var prov = _AI_PROVIDER_MAP[cfg.provider] || _AI_PROVIDER_MAP.deepseek;
  var model = cfg.model || prov.defaultModel;

  // 简单发一条 chat completions 请求测试
  fetch(prov.base + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.apiKey
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: '你好' }],
      max_tokens: 10,
      stream: false
    })
  }).then(function(resp) {
    if (resp.ok) {
      resultEl.textContent = '连接成功，模型 ' + model + ' 可用';
      resultEl.style.color = 'var(--color-sage,#3a6b4a)';
      // 保存配置（携带「会话内记住」偏好）
      _saveApiKeyConfig(cfg, document.getElementById('aiKeyRememberCb')
        ? document.getElementById('aiKeyRememberCb').checked : false);
    } else {
      return resp.text().then(function(txt) {
        var msg = '连接失败（HTTP ' + resp.status + '）';
        try { var j = JSON.parse(txt); if (j.error && j.error.message) msg += '：' + j.error.message; } catch(e) {}
        resultEl.textContent = msg;
        resultEl.style.color = 'var(--color-error,#c0553a)';
      });
    }
  }).catch(function(err) {
    resultEl.textContent = '网络错误：' + errText(err);
    resultEl.style.color = 'var(--color-error,#c0553a)';
  });
}

// 暴露给其他模块使用
window._canUseAi = _canUseAi;
window._incrementAiUsage = _incrementAiUsage;
window._getApiKeyConfig = _getApiKeyConfig;
window._AI_PROVIDER_MAP = _AI_PROVIDER_MAP;
window._AI_DAILY_LIMIT = _AI_DAILY_LIMIT;

/* ============== 用户密钥（用于教师添加学生） ============== */
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
var _POINTS_STORAGE = 'bioquest_credit_state';
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
    var LAST_KEY = 'bioquest_credit_last_login_day';
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

function renderDataManagement(container) {
  container.innerHTML = `
    <div class="user-card">
      <div class="user-card-title">数据管理</div>
      <div class="user-card-subtitle">备份、恢复与清理学习数据</div>

      <div class="user-data-actions">
        <div class="user-data-action">
          <div class="user-data-action-info">
            <div class="user-data-action-label">导出加密备份</div>
            <div class="user-data-action-desc">一键导出加密备份文件 (.bqb)，用于数据迁移与灾难还原（需本机解密密钥）</div>
          </div>
          <button class="btn btn-sm btn-primary" id="userExportBtn">导出备份</button>
        </div>

        <div class="user-data-action">
          <div class="user-data-action-info">
            <div class="user-data-action-label">导出我的数据</div>
            <div class="user-data-action-desc">输出可读的明文 JSON，包含学习记录、收藏、错题与统计，供自行查看与留存（GDPR/个保法数据可携权）</div>
          </div>
          <button class="btn btn-sm btn-secondary" id="userExportPlainBtn">导出明文</button>
        </div>

        <div class="user-data-action">
          <div class="user-data-action-info">
            <div class="user-data-action-label">导入学习数据</div>
            <div class="user-data-action-desc">从之前导出的 JSON 文件恢复数据（会合并而非覆盖）</div>
          </div>
          <button class="btn btn-sm btn-secondary" id="userImportBtn">导入</button>
          <input type="file" accept=".json" class="user-import-input" id="userImportInput">
        </div>

        <div class="user-data-action">
          <div class="user-data-action-info">
            <div class="user-data-action-label">清除所有数据</div>
            <div class="user-data-action-desc" style="color: var(--color-error, #c0553a);">此操作不可恢复，请先导出备份</div>
          </div>
          <button class="btn btn-sm btn-danger" id="userClearBtn">清除数据</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('userExportBtn').addEventListener('click', async () => {
    if (typeof exportData === 'function') {
      var result = await exportData();
      showToast(result ? '加密备份已导出' : '数据导出失败');
    }
  });

  document.getElementById('userExportPlainBtn').addEventListener('click', async () => {
    if (typeof exportData === 'function') {
      var result = await exportData({ encrypted: false });
      showToast(result ? '明文数据已导出（我的数据 .json）' : '数据导出失败');
    } else {
      showToast('导出模块未就绪');
    }
  });

  document.getElementById('userImportBtn').addEventListener('click', () => {
    document.getElementById('userImportInput').click();
  });

  document.getElementById('userImportInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (typeof importData === 'function') {
        const success = await importData(ev.target.result);
        if (success) {
          showToast('数据导入成功');
          refreshAllData();
        } else {
          showToast('数据导入失败，请检查文件格式');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('userClearBtn').addEventListener('click', () => {
    showConfirmDialog(
      '!',
      '确认清除所有数据？',
      '此操作将删除全部学习记录、收藏、错题、统计、习惯、AI 配置与本地缓存等所有 bioquest_* 数据，且不可恢复。建议先导出备份。',
      () => {
        try {
          // 清除 Web Storage + IndexedDB 用户数据库（clearAllLocalData 现已一并删除 Dexie 数据，
          // 如 cards/reviews/wrongbook/sessions/settings，以及可重建的 BioQuestCache 缓存）
          var wipePromise;
          if (typeof window.clearAllLocalData === 'function') {
            wipePromise = window.clearAllLocalData();
          } else {
            // 兜底：仅清 Web Storage
            for (var i = localStorage.length - 1; i >= 0; i--) {
              var k = localStorage.key(i);
              if (k && k.indexOf('bioquest_') === 0) localStorage.removeItem(k);
            }
            wipePromise = Promise.resolve([]);
          }
          // 一并清除 AI Key 内存与会话内 Key
          if (typeof window.BioQuestKeyStore === 'object' && window.BioQuestKeyStore.clear) {
            try { window.BioQuestKeyStore.clear(); } catch (e) {}
          }
          wipePromise.then(function () {
            showToast('所有数据已清除');
            refreshAllData();
          }, function () {
            showToast('部分数据可能未完全清除（请关闭其他标签页后重试）');
            refreshAllData();
          });
        } catch (e) {
          showToast('清除失败: ' + e.message);
        }
      }
    );
  });
}

function showConfirmDialog(icon, title, text, onConfirm) {
  var esc = function (s) {
    return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };
  var safeIcon = esc(icon);
  const overlay = document.createElement('div');
  overlay.className = 'user-confirm-overlay';
  overlay.innerHTML = `
    <div class="user-confirm-dialog">
      <div class="user-confirm-icon">${safeIcon}</div>
      <div class="user-confirm-title">${esc(title)}</div>
      <div class="user-confirm-text">${esc(text)}</div>
      <div class="user-confirm-actions">
        <button class="btn btn-sm btn-secondary" id="confirmCancel">取消</button>
        <button class="btn btn-sm btn-danger" id="confirmOk">确认清除</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#confirmCancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirmOk').addEventListener('click', () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function renderRecordsPanel(container) {
  var records = [];
  if (typeof getRecords === 'function') {
    try {
      var raw = getRecords({ limit: 20 });
      var recData = raw && raw.data ? raw.data : raw;
      records = Array.isArray(recData) ? recData : [];
    } catch (e) {
      console.warn('[TATABOX] 获取学习记录失败:', e);
      records = [];
    }
  }

  let html = `
    <div class="user-card">
      <div class="user-card-title">学习记录</div>
      <div class="user-card-subtitle">最近 20 条练习与考试记录</div>
  `;

  if (records.length === 0) {
    // Issue #125（P3-22）：统一温暖空状态——生物主题 icon + 提示 + 行动按钮
    if (window.BioQuest && typeof window.BioQuest.emptyStateHTML === 'function') {
      html += window.BioQuest.emptyStateHTML({
        title: '暂无学习记录',
        hint: '完成一次练习或考试后，记录会自动出现在这里',
        action: { label: '去练习', onClick: function () { if (typeof navigateTo === 'function') navigateTo('/practice'); } }
      });
    } else {
      html += `
        <div class="user-empty-state">
          <p class="user-empty-state-text">暂无学习记录</p>
        </div>
      `;
    }
  } else {
    html += '<div class="user-record-list">';
    records.forEach((rec) => {
      const date = rec.date || '';
      const type = rec.module === 'exam' ? '考试' : '练习';
      const typeClass = rec.module === 'exam' ? 'user-record-type--exam' : 'user-record-type--practice';
      const totalQ = rec.totalQuestions || 0;
      const score = rec.score || 0;
      const totalScore = rec.totalScore || 0;
      const recAccuracy = totalQ > 0 ? Math.round((rec.correctCount || 0) / totalQ * 100) : 0;

      let accClass = 'user-record-accuracy--low';
      if (recAccuracy >= 80) accClass = 'user-record-accuracy--good';
      else if (recAccuracy >= 60) accClass = 'user-record-accuracy--mid';

      html += `
        <div class="user-record-item">
          <div class="user-record-left">
            <span class="user-record-date">${date}</span>
            <span class="user-record-type ${typeClass}">${type}</span>
            <span class="user-record-info">${totalQ} 题</span>
            <span class="user-record-info">${score} / ${totalScore} 分</span>
          </div>
          <span class="user-record-accuracy ${accClass}">${recAccuracy}%</span>
        </div>
      `;
    });
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function renderFavoritesPanel(container) {
  var favIds = [];
  if (typeof getFavorites === 'function') {
    try {
      var rawFav = getFavorites();
      var favData = rawFav && rawFav.data ? rawFav.data : rawFav;
      favIds = Array.isArray(favData) ? favData : [];
    } catch (e) {
      console.warn('[TATABOX] 获取收藏列表失败:', e);
      favIds = [];
    }
  }

  // 构建题目ID→题目文本的映射
  var questionMap = {};
  // 从错题本中查找
  var wrongQuestions = [];
  if (typeof getWrongQuestions === 'function') {
    try {
      var rawWrong = getWrongQuestions();
      var wrongData = rawWrong && rawWrong.data ? rawWrong.data : rawWrong;
      wrongQuestions = Array.isArray(wrongData) ? wrongData : [];
    } catch (e) {
      console.warn('[TATABOX] 获取错题列表失败:', e);
      wrongQuestions = [];
    }
  }
  wrongQuestions.forEach(function(w) {
    try {
      // 错题可能有多种结构: {qId, questionText} 或 {id, text} 或 {questionId, question}
      var qid = w.qId || w.id || w.questionId;
      var qtext = w.questionText || w.text || w.question || '';
      if (qid && qtext) {
        questionMap[String(qid)] = qtext;
      }
    } catch (e) { /* skip malformed entry */ }
  });
  // 从练习记录中查找
  var records = [];
  if (typeof getRecords === 'function') {
    try {
      var rawRec = getRecords();
      var recData = rawRec && rawRec.data ? rawRec.data : rawRec;
      records = Array.isArray(recData) ? recData : [];
    } catch (e) {
      console.warn('[TATABOX] 获取记录列表(收藏映射)失败:', e);
      records = [];
    }
  }
  records.forEach(function(r) {
    try {
      var questions = r.questions || r.questionList || [];
      if (!Array.isArray(questions)) return;
      questions.forEach(function(q) {
        if (!q || typeof q !== 'object') return;
        // 记录中的题目可能有多种结构:
        // {id, text}, {questionId, questionText}, {qId, question}, {id, question}, {question: "text"} (question 本身就是 ID)
        var qid = q.id || q.qId || q.questionId || q.question || '';
        var qtext = q.text || q.questionText || q.question || q.stem || '';
        if (qid) {
          qid = String(qid);
          // 如果 qtext 和 qid 相同，说明 question 字段就是 ID，不是文本——不存入映射
          if (qtext && qtext !== qid && !questionMap[qid]) {
            questionMap[qid] = qtext;
          }
        }
      });
    } catch (e) { /* skip malformed record */ }
  });

  let html = `
    <div class="user-card">
      <div class="user-card-title">收藏夹</div>
      <div class="user-card-subtitle">收藏的题目列表</div>
  `;

  if (favIds.length === 0) {
    // Issue #125（P3-22）：统一温暖空状态——生物主题 icon + 提示 + 行动按钮
    if (window.BioQuest && typeof window.BioQuest.emptyStateHTML === 'function') {
      html += window.BioQuest.emptyStateHTML({
        title: '暂无收藏题目',
        hint: '练习或浏览题库时点击「收藏」，题目就会出现在这里',
        action: { label: '去练习', onClick: function () { if (typeof navigateTo === 'function') navigateTo('/practice'); } }
      });
    } else {
      html += `
        <div class="user-empty-state">
          <p class="user-empty-state-text">暂无收藏题目</p>
        </div>
      `;
    }
  } else {
    html += '<div class="user-fav-list">';

    html += `
      <div class="user-fav-group">
        <div class="user-fav-group-title">全部收藏 (${favIds.length}题)</div>
    `;

    favIds.forEach(function(id) {
      var displayText = questionMap[id] || id;
      var shortText = displayText.length > 80 ? displayText.slice(0, 80) + '...' : displayText;
      html += `
        <div class="user-fav-item">
          <span class="user-fav-id" title="${escapeHtml ? escapeHtml(displayText) : displayText}">${escapeHtml ? escapeHtml(shortText) : shortText}</span>
          <button class="user-fav-go-btn" data-fav-go="${id}">去练习</button>
        </div>
      `;
    });

    html += '</div></div>';
  }

  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('[data-fav-go]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (typeof navigateTo === 'function') {
        navigateTo('/practice');
      }
    });
  });
}

function renderStorageInfo(container) {
  let usage;
  if (typeof getStorageUsage === 'function') {
    usage = getStorageUsage();
  }
  if (!usage || typeof usage !== 'object') {
    usage = { used: 0, available: 5 * 1024 * 1024 };
  }

  const usedKB = ((usage.used || 0) / 1024).toFixed(1);
  const availableKB = ((usage.available || 5 * 1024 * 1024) / 1024).toFixed(0);
  const percent = Math.min(100, ((usage.used || 0) / (usage.available || 5 * 1024 * 1024)) * 100);
  const percentStr = percent.toFixed(1);

  container.innerHTML = `
    <div class="user-card">
      <div class="user-card-title">存储用量</div>
      <div class="user-card-subtitle">本地存储空间使用情况</div>
      <div class="user-storage-info">
        <div class="user-storage-text">已用: ${usedKB} KB / 可用: ${availableKB} KB</div>
        <div class="user-storage-bar">
          <div class="user-storage-fill" style="width:${percentStr}%"></div>
        </div>
        <div class="user-storage-text">${percentStr}% 已使用</div>
      </div>
    </div>
  `;
}

function refreshAllData() {
  const recordsContainer = document.getElementById('userRecordsContainer');
  if (recordsContainer) renderRecordsPanel(recordsContainer);

  const favContainer = document.getElementById('userFavoritesContainer');
  if (favContainer) renderFavoritesPanel(favContainer);

  const storageContainer = document.getElementById('userStorageContainer');
  if (storageContainer) renderStorageInfo(storageContainer);
}

async function renderStreakPanel(container) {
  container.innerHTML = '<div class="user-card"><div class="user-card-title">学习打卡</div><div class="user-card-subtitle">坚持学习，不断进步</div><div style="text-align:center;padding:20px;">加载中...</div></div>';

  var data = await (typeof getCheckInData === 'function' ? getCheckInData() : Promise.resolve({ current_streak: 0, longest_streak: 0, total_checkins: 0, calendar: [] }));

  // 统一使用本地时区日期（与 recordDailyCheckIn/getCheckInData 的 _localDateStr 一致），
  // 避免 toISOString() 的 UTC 日期导致「今日已打卡」判断与日历错位。
  var today = _localDateStrP(new Date());
  var checkedToday = data.last_checkin === today;

  // Build 30-day calendar
  var calHtml = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin:16px 0;">';
  for (var i = 29; i >= 0; i--) {
    var d = new Date(Date.now() - i * 86400000);
    var dateStr = _localDateStrP(d);
    var isChecked = data.calendar && data.calendar.some(function(c) { return c.checkin_date === dateStr; });
    var isToday = dateStr === today;
    var bg = isChecked ? 'var(--color-sage,#3a8c5c)' : 'var(--border-light,#ece8e1)';
    var border = isToday ? '2px solid var(--color-sage,#3a8c5c)' : 'none';
    calHtml += '<div title="' + dateStr + '" style="width:20px;height:20px;border-radius:4px;background:' + bg + ';border:' + border + ';"></div>';
  }
  calHtml += '</div>';

  container.innerHTML = '<div class="user-card">' +
    '<div class="user-card-title">学习打卡</div>' +
    '<div class="user-card-subtitle">坚持学习，不断进步</div>' +
    '<div style="display:flex;align-items:center;gap:24px;margin-bottom:16px;">' +
      '<div style="text-align:center;">' +
        '<div style="display:inline-flex;align-items:center;justify-content:center;width:2.5rem;height:2.5rem;border-radius:50%;background:#ff6b35;color:#fff;font-size:1rem;font-weight:700;">' + (data.current_streak || 0) + '</div>' +
        '<div style="font-size:2rem;font-weight:700;color:var(--color-deep,#1a3a2a);">' + (data.current_streak || 0) + '</div>' +
        '<div style="font-size:0.75rem;color:var(--text-muted,#8a8a8a);">天连续打卡</div>' +
      '</div>' +
      '<div class="bq-flex-1">' +
        '<div style="font-size:0.85rem;color:var(--text-secondary,#555);margin-bottom:4px;">累计打卡 <strong>' + (data.total_checkins || 0) + '</strong> 天</div>' +
        '<div style="font-size:0.85rem;color:var(--text-secondary,#555);">最长连续 <strong>' + (data.longest_streak || 0) + '</strong> 天</div>' +
      '</div>' +
    '</div>' +
    calHtml +
    (checkedToday ?
      '<div style="text-align:center;font-size:0.85rem;color:var(--color-sage,#3a8c5c);font-weight:600;">今日已打卡</div>' :
      '<button id="userCheckInBtn" style="display:block;margin:0 auto;padding:10px 32px;background:#3a8c5c;color:#fff;border:none;border-radius:16px;cursor:pointer;font-size:0.9rem;font-weight:600;">立即打卡</button>'
    ) +
  '</div>';

  var checkInBtn = document.getElementById('userCheckInBtn');
  if (checkInBtn) {
    checkInBtn.addEventListener('click', async function() {
      checkInBtn.textContent = '打卡中...';
      checkInBtn.disabled = true;
      var result = await (typeof recordDailyCheckIn === 'function' ? recordDailyCheckIn() : Promise.resolve(null));
      if (result) {
        renderStreakPanel(container);
      } else {
        // 游客没有云端账号，无法写入云端打卡表，给出友好提示
        var isGuest = false;
        try { isGuest = !!(window.getCurrentUser && window.getCurrentUser() && window.getCurrentUser().isGuest); } catch (e) {}
        checkInBtn.textContent = isGuest ? '游客暂不支持云端打卡，请注册登录后使用' : '打卡失败，重试';
        checkInBtn.disabled = false;
      }
    });
  }
}

// 本地时区日期字符串 YYYY-MM-DD（与 supabase-client 的 _localDateStr 一致）
function _localDateStrP(date) {
  date = date || new Date();
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

async function renderAchievementsPanel(container) {
  container.innerHTML = '<div class="user-card"><div class="user-card-title">成就徽章</div><div class="user-card-subtitle">收集徽章，记录成长</div><div style="text-align:center;padding:20px;">加载中...</div></div>';

  var earned = await (typeof getUserAchievements === 'function' ? getUserAchievements() : Promise.resolve([]));
  var all = typeof getAllAchievements === 'function' ? getAllAchievements() : {};
  var tiers = typeof getAchievementTiers === 'function' ? getAchievementTiers() : {};
  var categories = typeof getAchievementCategories === 'function' ? getAchievementCategories() : {};

  var earnedKeys = {};
  (earned || []).forEach(function(e) { earnedKeys[e.achievement_key] = e; });

  var earnedCount = Object.keys(earnedKeys).length;
  var totalCount = Object.keys(all).length;

  // 按段位统计
  var tierStats = {};
  for (var tierKey in tiers) { tierStats[tierKey] = 0; }
  for (var k in all) {
    var a = all[k];
    var tier = a.tier || 'iron';
    if (earnedKeys[k]) tierStats[tier] = (tierStats[tier] || 0) + 1;
  }

  // 段位进度条
  var tierBarHtml = '<div style="display:flex;gap:4px;margin-bottom:16px;">';
  var tierOrder = ['iron','bronze','silver','gold','platinum','diamond','master','challenger'];
  tierOrder.forEach(function(tk) {
    var t = tiers[tk];
    if (!t) return;
    var hasAny = tierStats[tk] > 0;
    tierBarHtml += '<div title="' + t.label + '" style="flex:1;height:6px;border-radius:2px;background:' + (hasAny ? t.color : 'var(--border-light,#ece8e1)') + ';transition:background 0.3s;"></div>';
  });
  tierBarHtml += '</div>';

  // 按分类展示
  var html = '<div class="user-card">' +
    '<div class="user-card-title">成就徽章</div>' +
    '<div class="user-card-subtitle">已获得 ' + earnedCount + '/' + totalCount + '</div>' +
    tierBarHtml;

  // 遍历每个分类
  var catOrder = ['journey','persistence','mastery','conquest','precision','community','exam'];
  catOrder.forEach(function(catKey) {
    var cat = categories[catKey];
    if (!cat) return;

    // 收集该分类下的成就
    var catAchievements = [];
    for (var ak in all) {
      if (all[ak].category === catKey) {
        catAchievements.push({ key: ak, ...all[ak] });
      }
    }
    if (catAchievements.length === 0) return;

    // 按段位排序
    catAchievements.sort(function(a, b) {
      var oa = tiers[a.tier] ? tiers[a.tier].order : 0;
      var ob = tiers[b.tier] ? tiers[b.tier].order : 0;
      return oa - ob;
    });

    html += '<div style="margin-top:16px;margin-bottom:8px;font-size:0.85rem;font-weight:600;color:var(--text-secondary,#555);">' +
      cat.icon + ' ' + cat.name + '</div>';

    html += '<div style="display:flex;flex-wrap:wrap;gap:10px;">';
    catAchievements.forEach(function(ach) {
      var isEarned = !!earnedKeys[ach.key];
      var tierInfo = tiers[ach.tier] || tiers.iron;
      var borderColor = isEarned ? tierInfo.color : 'transparent';
      var earnedDate = isEarned ? new Date(earnedKeys[ach.key].created_at).toLocaleDateString('zh-CN') : '';

      // 手绘徽章（badge-motifs.js）：SVG 内部已区分已获得/未解锁配色，
      // 未加载时兜底为原文字 icon + 外层灰度滤镜
      var badgeInner = null;
      if (typeof window.renderBadgeSvg === 'function') {
        try { badgeInner = window.renderBadgeSvg(ach.key, { size: 34, earned: isEarned }); } catch (e) { badgeInner = null; }
      }
      var useSvg = (badgeInner !== null);
      var opacity = useSvg ? '1' : (isEarned ? '1' : '0.25');
      var iconCell = useSvg
        ? '<div style="line-height:1;border:2px solid ' + borderColor + ';border-radius:8px;padding:4px;background:' + (isEarned ? 'rgba(255,255,255,0.05)' : 'transparent') + ';">' + badgeInner + '</div>'
        : '<div style="font-size:1.6rem;line-height:1;border:2px solid ' + borderColor + ';border-radius:8px;padding:4px;background:' + (isEarned ? 'rgba(255,255,255,0.05)' : 'transparent') + ';">' + ach.icon + '</div>';

      html += '<div title="' + (isEarned ?
        ach.name + ' · ' + tierInfo.label + ' · ' + ach.desc + ' · ' + earnedDate :
        ach.name + ' · ' + tierInfo.label + ' · ' + ach.desc + ' · 未解锁') + '" style="display:flex;flex-direction:column;align-items:center;width:60px;opacity:' + opacity + ';transition:all 0.2s;cursor:default;' +
        ((isEarned || useSvg) ? '' : 'filter:grayscale(1);') + '">' +
        iconCell +
        '<div style="font-size:0.6rem;text-align:center;margin-top:3px;color:' + (isEarned ? tierInfo.color : 'var(--text-muted,#8a8a8a)') + ';line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:56px;font-weight:' + (isEarned ? '600' : '400') + ';">' + ach.name + '</div>' +
      '</div>';
    });
    html += '</div>';
  });

  html += '</div>';
  container.innerHTML = html;
}

function renderUserPage(target) {
  if (!target) return;

  try {
    injectUserStyles();

    // 未登录时显示登录提示
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
      target.innerHTML = `
        <div class="animate-fade-in bq-center-vh" >
          <div style="text-align:center;max-width:400px;padding:48px 32px;">
            <div style="font-size:3.5rem;margin-bottom:16px;"></div>
            <div style="font-family:var(--font-serif,'Noto Serif SC',serif);font-size:1.4rem;font-weight:700;color:var(--color-deep,#1a3a2a);margin-bottom:8px;">请先登录</div>
            <div style="font-size:0.9rem;color:var(--text-muted,#8a8a8a);line-height:1.7;margin-bottom:32px;">登录后即可查看学习记录、收藏夹和存储用量等个人数据</div>
            <button id="userLoginPromptBtn" style="
              display:inline-flex;align-items:center;gap:8px;
              padding:14px 36px;border:none;border-radius:16px;
              background:var(--color-sage,#5a7d5c);
              color:#fff;font-size:1rem;font-weight:600;cursor:pointer;
              box-shadow:var(--shadow-lg);
              transition:all 0.2s ease;
            ">立即登录</button>
          </div>
        </div>
      `;
      var loginBtn = document.getElementById('userLoginPromptBtn');
      if (loginBtn) {
        loginBtn.addEventListener('click', function() {
          if (typeof window.showAuthModal === 'function') {
            window.showAuthModal();
          }
        });
      }
      return;
    }

    // 获取用户信息用于头部
    var currentUser = null;
    try { currentUser = window.getCurrentUser ? window.getCurrentUser() : null; } catch(e) {}
    var displayName = (currentUser && (currentUser.display_name || currentUser.username)) || '同学';
    var userGroup = (currentUser && currentUser.user_group) || 'member';
    var groupLabels = { admin: '管理员', premium: '高级会员', verified: '认证会员', member: '普通会员', guest: '访客' };
    var avatarUrl = (typeof getAvatarUrl === 'function') ? getAvatarUrl() : null;
    var avatarHtml = avatarUrl ? '<img src="' + avatarUrl + '" alt="头像">' : escapeHtml(displayName.charAt(0));

    target.innerHTML = `
      <div class="animate-fade-in user-accordion-page">

        <!-- 紧凑资料卡（点击跳转仪表盘） -->
        <div class="user-profile-compact" data-on='["navigateTo","/dashboard"]'>
          <div class="user-profile-avatar" id="userAvatarBtn" title="头像可在「设置」中上传">
            ${avatarHtml}
          </div>
          <div class="user-profile-info">
            <div class="user-profile-name">${escapeHtml(displayName)} <span class="user-profile-badge">${groupLabels[userGroup] || '会员'}</span></div>
            <div class="user-profile-meta">
              <span class="user-profile-meta-points" id="userCompactPointsBadge" title="信用指数（CR）：社区对用户的信任程度，随时间衰减">信用&nbsp;<span class="user-points-val">100</span></span>
              <span class="user-profile-meta-arrow">点击查看仪表盘 →</span>
            </div>
          </div>
        </div>

        <!-- 我的密钥（用于教师添加学生） -->
        <div class="user-key-card" style="margin:10px 0;padding:10px 14px;background:rgba(90,125,92,0.06);border:1px solid var(--border-light,#ece8e1);border-radius:12px;display:flex;align-items:center;gap:10px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.74rem;color:var(--text-muted,#8a8a8a);margin-bottom:2px;">我的密钥（教师添加学生时需要）</div>
            <code id="user-my-key" style="font-family:var(--font-mono,monospace);font-size:0.86rem;color:var(--color-deep,#1a3a2a);font-weight:600;letter-spacing:0.5px;word-break:break-all;">${_getUserKey()}</code>
          </div>
          <button id="user-copy-key-btn" style="background:var(--color-sage,#5a7d5c);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:0.78rem;cursor:pointer;flex-shrink:0;">复制</button>
        </div>

        <!-- 快捷入口横排 -->
        <div class="user-quick-row">
          <div class="user-quick-item" data-on='["navigateTo","/analytics"]'>
            <div class="user-quick-label">学习分析</div>
          </div>
          <div class="user-quick-item" data-on='["navigateTo","/wrongbook"]'>
            <div class="user-quick-label">错题与复盘</div>
          </div>
          <div class="user-quick-item" data-on='["navigateTo","/community"]'>
            <div class="user-quick-label">社区</div>
          </div>
          <div class="user-quick-item" data-on='["navigateTo","/leaderboard"]'>
            <div class="user-quick-label">排行</div>
          </div>
        </div>

        <!-- 功能列表（点击进入独立子页面） -->
        <div class="user-list-group" id="userListGroup">
          <div class="user-list-item" data-on='["_showUserSubPage","notifications"]'>
            
            <div class="user-list-info"><div class="user-list-title">通知</div><div class="user-list-desc">社区回帖和系统通知</div></div>
            <span class="user-notif-badge" id="userNotifBadge" style="display:none;">0</span>
            <svg class="user-list-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="user-list-item" data-on='["_showUserSubPage","streak"]'>
            
            <div class="user-list-info"><div class="user-list-title">打卡与成就</div><div class="user-list-desc">连续打卡天数与成就徽章</div></div>
            <svg class="user-list-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="user-list-item" data-on='["_showUserSubPage","records"]'>
            
            <div class="user-list-info"><div class="user-list-title">学习记录</div><div class="user-list-desc">最近 20 条练习与考试记录</div></div>
            <svg class="user-list-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="user-list-item" data-on='["_showUserSubPage","favorites"]'>
            
            <div class="user-list-info"><div class="user-list-title">收藏夹</div><div class="user-list-desc">已收藏的题目</div></div>
            <svg class="user-list-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="user-list-item" data-on='["_showUserSubPage","settings"]'>
            
            <div class="user-list-info"><div class="user-list-title">设置</div><div class="user-list-desc">主题、字体大小偏好</div></div>
            <svg class="user-list-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="user-list-item" data-on='["_showUserSubPage","data"]'>
            
            <div class="user-list-info"><div class="user-list-title">数据管理</div><div class="user-list-desc">导出、导入、清除学习数据</div></div>
            <svg class="user-list-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="user-list-item" data-on='["_showUserSubPage","storage"]'>
            
            <div class="user-list-info"><div class="user-list-title">存储与账号</div><div class="user-list-desc">存储用量与账号操作</div></div>
            <svg class="user-list-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="user-list-item" data-on='["_userJoinClass"]'>
            
            <div class="user-list-info"><div class="user-list-title">加入班级</div><div class="user-list-desc">输入班级码和密钥加入教师班级</div></div>
            <svg class="user-list-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="user-list-item" data-on='["navigateTo","/credit"]'>
            
            <div class="user-list-info"><div class="user-list-title">信用中心</div><div class="user-list-desc">信用指数、信任等级、明细与社区信任排行</div></div>
            <svg class="user-list-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          ${userGroup === 'admin' ? `
          <div class="user-list-item" data-on='["_userAdminEntry"]'>
            
            <div class="user-list-info"><div class="user-list-title">管理员入口</div><div class="user-list-desc">管理后台（需输入管理员密码）</div></div>
            <svg class="user-list-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>` : ''}
        </div>

        <!-- 子页面容器（默认隐藏，点击列表项后显示） -->
        <div class="user-subpage" id="userSubPage" style="display:none;">
          <div class="user-subpage-header">
            <button class="user-subpage-back" data-on='["_hideUserSubPage"]'>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
              返回
            </button>
            <div class="user-subpage-title" id="userSubPageTitle"></div>
          </div>
          <div class="user-subpage-body" id="userSubPageBody"></div>
        </div>

      </div>
    `;

    // 绑定头像上传逻辑
    setupAvatarUpload();

    // 渲染后立刻刷新信用徽标（刷新 localStorage 里的数字到 DOM）
    try {
      if (typeof window.refreshPointsBadge === 'function') window.refreshPointsBadge();
    } catch (_) {}

    // 刷新通知未读角标
    try { _updateNotifBadge(); } catch (_) {}

    // 绑定密钥复制按钮
    var copyKeyBtn = document.getElementById('user-copy-key-btn');
    if (copyKeyBtn) {
      copyKeyBtn.addEventListener('click', function() {
        var keyEl = document.getElementById('user-my-key');
        if (!keyEl) return;
        var key = keyEl.textContent;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(key).then(function() {
              showToast('密钥已复制：' + key);
            }, function() { _fallbackCopy(key); });
          } else {
            _fallbackCopy(key);
          }
        } catch (e) { _fallbackCopy(key); }
      });
    }
  } catch (err) {
    console.error('[TATABOX] 用户中心渲染错误:', err);
    // 安全修复（P1 XSS）：err.message 转义后再注入 innerHTML
    var _ueMsg = err && err.message ? String(err.message) : '';
    var _ueEsc = _ueMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    target.innerHTML = '<div class="bq-empty-block-lg"><p class="bq-text-error">用户中心加载失败</p><p class="bq-hint bq-hint--mt">' + _ueEsc + '</p></div>';
  }
}

/**
 * 刷新头部紧凑资料卡上的"信用指数"数字
 *  - addPoints / deductPoints / penalizePoints 变更后都会自动调用
 *  - 也会在每次页面初始化时被调用
 *  - 找不到 DOM 就静默跳过（不会 crash）
 */
function refreshPointsBadge() {
  try {
    var badge = document.getElementById('userCompactPointsBadge');
    var valEl = badge ? badge.querySelector('.user-points-val') : null;
    var total = (typeof window.getPoints === 'function') ? window.getPoints() : _POINTS_DEFAULTS.BASE;
    if (total === null || typeof total !== 'number' || !isFinite(total)) total = _POINTS_DEFAULTS.BASE;
    if (valEl) valEl.textContent = String(Math.round(total * 10) / 10);
    if (badge) {
      badge.setAttribute('data-low', total < 80 ? 'true' : 'false');
      badge.setAttribute('title',
        '信用指数（CR）' + (Math.round(total * 10) / 10) + '：社区信任度，随活跃衰减，违规扣减');
    }
  } catch (e) {
    // 不对外抛错，避免破坏 initUser 主流程
  }
}
window.refreshPointsBadge = refreshPointsBadge;

// 子页面切换逻辑
var _userSubPageTitles = {
  notifications: '通知', streak: '打卡与成就', records: '学习记录', favorites: '收藏夹',
  settings: '设置', data: '数据管理', storage: '存储与账号'
};
function _showUserSubPage(key) {
  var listGroup = document.getElementById('userListGroup');
  var subPage = document.getElementById('userSubPage');
  var titleEl = document.getElementById('userSubPageTitle');
  var bodyEl = document.getElementById('userSubPageBody');
  if (!listGroup || !subPage || !bodyEl) return;

  listGroup.style.display = 'none';
  subPage.style.display = 'block';
  titleEl.textContent = _userSubPageTitles[key] || '';

  // 渲染对应内容
  bodyEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">加载中...</div>';
  setTimeout(function() {
    try {
      if (key === 'streak') {
        bodyEl.innerHTML = '<div id="userStreakContainer"></div><div id="userAchievementsContainer" style="margin-top:16px;"></div>';
        renderStreakPanel(document.getElementById('userStreakContainer'));
        renderAchievementsPanel(document.getElementById('userAchievementsContainer'));
      } else if (key === 'records') {
        bodyEl.innerHTML = '<div id="userRecordsContainer"></div>';
        renderRecordsPanel(document.getElementById('userRecordsContainer'));
      } else if (key === 'favorites') {
        bodyEl.innerHTML = '<div id="userFavoritesContainer"></div>';
        renderFavoritesPanel(document.getElementById('userFavoritesContainer'));
      } else if (key === 'settings') {
        bodyEl.innerHTML = '<div id="userSettingsContainer"></div>';
        renderSettingsPanel(document.getElementById('userSettingsContainer'));
      } else if (key === 'data') {
        bodyEl.innerHTML = '<div id="userDataContainer"></div><div style="margin-top:16px;text-align:center;"><button data-on=\'["generateShareCard"]\' style="display:inline-flex;align-items:center;gap:8px;padding:10px 24px;border:none;border-radius:16px;background:#3a8c5c;color:#fff;font-size:0.85rem;font-weight:600;cursor:pointer;box-shadow:var(--shadow-md);">生成学习报告卡片</button></div>';
        renderDataManagement(document.getElementById('userDataContainer'));
      } else if (key === 'storage') {
        bodyEl.innerHTML = '<div id="userStorageContainer"></div><div id="userAccountActionsContainer" style="margin-top:16px;text-align:center;"></div>';
        renderStorageInfo(document.getElementById('userStorageContainer'));
        renderAccountActions(document.getElementById('userAccountActionsContainer'));
      } else if (key === 'notifications') {
        renderNotificationsPanel(bodyEl);
      }
    } catch (e) {
      console.warn('[TATABOX] 子页面渲染失败:', key, e);
      bodyEl.innerHTML = '<div class="user-empty-state"><p>加载失败</p></div>';
    }
  }, 50);
  // 滚动到顶部
  window.scrollTo(0, 0);
}
function _hideUserSubPage() {
  var listGroup = document.getElementById('userListGroup');
  var subPage = document.getElementById('userSubPage');
  if (listGroup) listGroup.style.display = 'block';
  if (subPage) subPage.style.display = 'none';
  window.scrollTo(0, 0);
}
window._showUserSubPage = _showUserSubPage;
window._hideUserSubPage = _hideUserSubPage;

/* ============== 通知中心（我的 → 通知） ============== */
function _updateNotifBadge() {
  try {
    var badge = document.getElementById('userNotifBadge');
    if (!badge) return;
    var n = (typeof window.BioQuestNotifications === 'object' && typeof window.BioQuestNotifications.unreadCount === 'function')
      ? window.BioQuestNotifications.unreadCount() : 0;
    if (n > 0) {
      badge.style.display = 'inline-flex';
      badge.textContent = n > 99 ? '99+' : String(n);
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {}
}

function renderNotificationsPanel(bodyEl) {
  // 打开通知中心时视为已读
  var list = (window.BioQuestNotifications && typeof window.BioQuestNotifications.markAllRead === 'function')
    ? window.BioQuestNotifications.markAllRead() : [];
  _updateNotifBadge();

  var html = '<div class="user-notif-actions">' +
    '<span class="user-notif-count">共 ' + list.length + ' 条通知</span>' +
    '<button class="user-notif-clear" data-on=\'["_cspClearNotifs"]\'>清空</button>' +
    '</div>';
  if (!list.length) {
    html += '<div class="user-empty-state" style="padding:48px 20px;text-align:center;color:var(--text-muted,#8a8a8a);"><p>暂无通知</p><p style="font-size:0.82rem;margin-top:6px;">当有人回复你的社区帖子时，会在这里提醒你</p></div>';
  } else {
    html += '<div class="notif-list">' + list.map(function (n) {
      var time = formatNotifTime(n.time);
      return '<div class="notif-item">' +
        '<div class="notif-body">' +
          '<div class="notif-title">' + escapeHtml(n.commenter || '同学') + ' 回复了你</div>' +
          '<div class="notif-post">' + escapeHtml(n.postPreview || '你的帖子') + '</div>' +
          '<div class="notif-comment">' + escapeHtml(n.comment || '') + '</div>' +
          '<div class="notif-time">' + time + '</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }
  bodyEl.innerHTML = html;
}

function formatNotifTime(iso) {
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var now = Date.now();
    var diff = now - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 172800000) return '昨天';
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return (d.getFullYear() + '-' + m + '-' + day);
  } catch (e) { return ''; }
}
window._updateNotifBadge = _updateNotifBadge;

/* ============== 管理员入口（只在 #/admin 页内用管理员口令验证） ============== */
function _userAdminEntry() {
  // 管理员入口不提供账号密码登录弹窗：统一跳转 #/admin，由页内「管理员口令」
  // （服务端 RPC admin_login_with_key）完成验证；账号本身为 admin 也不再自动放行。
  navigateTo('/admin');
}
window._userAdminEntry = _userAdminEntry;

/* ============== 加入班级（班级码 + 我的密钥） ============== */
function _userJoinClass() {
  var myKey = _getUserKey();
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10030;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML =
    '<div style="background:var(--surface-primary,#fff);border-radius:12px;padding:24px;width:min(420px,92vw);box-shadow:var(--shadow-floating);">' +
      '<div style="font-family:var(--font-serif,"Noto Serif SC",serif);font-size:1.1rem;font-weight:700;color:var(--color-deep,#1a3a2a);margin-bottom:6px;">加入班级</div>' +
      '<div style="font-size:0.82rem;color:var(--text-muted,#8a8a8a);margin-bottom:14px;">输入教师的班级码和你的密钥以加入班级</div>' +
      '<label style="font-size:0.8rem;color:var(--text-secondary,#4a4a4a);display:block;margin-bottom:4px;">班级码（教师的密钥）</label>' +
      '<input type="text" id="join-class-code" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border-light,#e3e0d8);border-radius:8px;font-size:0.92rem;outline:none;background:var(--surface-primary,#fff);color:var(--text-primary,#1a2f1d);margin-bottom:12px;text-transform:uppercase;" placeholder="8 位字母数字" autocomplete="off">' +
      '<label style="font-size:0.8rem;color:var(--text-secondary,#4a4a4a);display:block;margin-bottom:4px;">我的密钥</label>' +
      '<input type="text" id="join-my-key" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border-light,#e3e0d8);border-radius:8px;font-size:0.92rem;outline:none;background:var(--surface-primary,#fff);color:var(--text-primary,#1a2f1d);text-transform:uppercase;" placeholder="你的 8 位密钥" value="' + escapeHtml(myKey) + '" autocomplete="off">' +
      '<div id="join-err" style="font-size:0.78rem;color:var(--color-error,#c0553a);margin-top:8px;display:none;"></div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">' +
        '<button class="teacher-btn teacher-btn-ghost teacher-btn-sm" id="join-cancel">取消</button>' +
        '<button class="teacher-btn teacher-btn-primary teacher-btn-sm" id="join-ok">加入</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  var codeInput = overlay.querySelector('#join-class-code');
  var keyInput = overlay.querySelector('#join-my-key');
  var errEl = overlay.querySelector('#join-err');
  setTimeout(function() { codeInput.focus(); }, 30);

  function close() { overlay.remove(); }
  function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
  overlay.querySelector('#join-cancel').addEventListener('click', close);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

  async function submit() {
    errEl.style.display = 'none';
    var classCode = codeInput.value.trim().toUpperCase();
    var myKeyVal = keyInput.value.trim().toUpperCase();
    if (!classCode || classCode.length !== 8) { showErr('班级码应为 8 位字母数字'); return; }
    if (!myKeyVal || myKeyVal.length !== 8) { showErr('密钥应为 8 位字母数字'); return; }
    if (classCode === myKeyVal) { showErr('不能加入自己的班级'); return; }

    // 通过 Supabase 查找教师（班级码 = 教师的 user_key）
    if (typeof window.getStudentByKey !== 'function') {
      showErr('数据服务不可用，请稍后重试'); return;
    }
    var btn = overlay.querySelector('#join-ok');
    btn.disabled = true; btn.textContent = '验证中...';
    try {
      var teacher = await window.getStudentByKey(classCode);
      if (!teacher) {
        btn.disabled = false; btn.textContent = '加入';
        showErr('未找到该班级码对应的教师，请确认班级码'); return;
      }
      // 验证学生自己的密钥
      if (myKeyVal !== myKey) {
        btn.disabled = false; btn.textContent = '加入';
        showErr('密钥不正确，请确认你的密钥'); return;
      }
      // 保存加入记录
      var joined = [];
      try { joined = JSON.parse(localStorage.getItem('bioquest_joined_classes') || '[]'); } catch(e) {}
      // 避免重复加入
      var exists = joined.filter(function(c) { return c.classCode === classCode; })[0];
      if (exists) {
        btn.disabled = false; btn.textContent = '加入';
        showErr('你已加入该班级'); return;
      }
      joined.push({
        classCode: classCode,
        teacherName: teacher.display_name || teacher.username || '教师' + classCode.slice(0, 4),
        studentKey: myKeyVal,
        joinedAt: new Date().toISOString()
      });
      localStorage.setItem('bioquest_joined_classes', JSON.stringify(joined));
      showToast('已加入 ' + (teacher.display_name || teacher.username || '') + ' 的班级');
      close();
    } catch (e) {
      btn.disabled = false; btn.textContent = '加入';
      showErr('查询失败：' + errText(e)); return;
    }
  }
  overlay.querySelector('#join-ok').addEventListener('click', submit);
  codeInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); keyInput.focus(); } });
  keyInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
}
window._userJoinClass = _userJoinClass;

function initUser(target) {
  injectUserStyles();

  if (!target) {
    if (typeof AppState !== 'undefined' && AppState.rootElement) {
      target = AppState.rootElement;
    } else {
      target = document.getElementById('page-content');
    }
  }

  // 修复：等待全局认证状态恢复完成后再判断登录态。
  // 整页加载到「我的」时，若立即渲染，_currentUser 尚未恢复，会误判为未登录而要求重新登录。
  // 登录一次后，这里会等到会话恢复，从而正确显示已登录的用户中心。
  var authReady = (typeof window.waitAuthReady === 'function')
    ? window.waitAuthReady()
    : Promise.resolve();
  var timeout = new Promise(function (res) { setTimeout(res, 8000); });
  Promise.race([authReady, timeout]).then(function () {
    renderUserPage(target);
  }).catch(function () {
    renderUserPage(target);
  });
}

/**
 * 生成学习数据分享卡片（Canvas → 图片下载）
 */
function generateShareCard() {
  var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  // 未登录时用本地数据降级
  if (!user) {
    var localStats = {};
    try { localStats = JSON.parse(localStorage.getItem('bioquest_stats') || '{}'); } catch(e){}
    user = {
      display_name: '学习者',
      user_group: 'member',
      bio_score: localStats.bio_score || 0,
      total_answered: localStats.total_answered || 0,
      accuracy: localStats.accuracy || 0,
      current_streak: localStats.current_streak || 0
    };
  }

  var canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 400;
  var ctx = canvas.getContext('2d');

  // roundRect polyfill
  if (!ctx.roundRect) {
    ctx.roundRect = function(x, y, w, h, r) {
      if (typeof r === 'number') r = [r, r, r, r];
      this.moveTo(x + r[0], y);
      this.lineTo(x + w - r[1], y);
      this.arcTo(x + w, y, x + w, y + r[1], r[1]);
      this.lineTo(x + w, y + h - r[2]);
      this.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]);
      this.lineTo(x + r[3], y + h);
      this.arcTo(x, y + h, x, y + h - r[3], r[3]);
      this.lineTo(x, y + r[0]);
      this.arcTo(x, y, x + r[0], y, r[0]);
      this.closePath();
    };
  }

  // 背景
  var grad = ctx.createLinearGradient(0, 0, 600, 400);
  grad.addColorStop(0, '#1a3a2a');
  grad.addColorStop(1, '#2d6a47');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 400);

  // 装饰圆
  ctx.fillStyle = 'rgba(58,140,92,0.15)';
  ctx.beginPath();
  ctx.arc(520, 80, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(80, 350, 80, 0, Math.PI * 2);
  ctx.fill();

  // 标题
  ctx.fillStyle = '#e0e8e4';
  ctx.font = 'bold 28px "Noto Serif SC", serif';
  ctx.fillText('TATABOX 学习报告', 40, 55);

  // 分隔线
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 72);
  ctx.lineTo(560, 72);
  ctx.stroke();

  // 用户名
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(user.display_name || user.username || '用户', 40, 110);

  // 用户组
  var groupLabels = { admin: '管理员', premium: '高级会员', verified: '认证会员', member: '普通会员', guest: '访客' };
  var groupColors = { admin: '#ff6b6b', premium: '#ffd43b', verified: '#51cf66', member: '#74c0fc', guest: '#adb5bd' };
  var group = user.user_group || 'member';
  ctx.fillStyle = groupColors[group] || '#74c0fc';
  ctx.font = '16px sans-serif';
  ctx.fillText(groupLabels[group] || '会员', 40, 140);

  // 数据区
  ctx.fillStyle = '#e0e8e4';
  ctx.font = '15px sans-serif';
  var bioScore = user.bio_score || 0;
  var y = 185;
  var dataItems = [
    { label: 'Bio 分', value: String(bioScore), icon: 'B' },
    { label: '答题数', value: String(user.total_answered || 0), icon: 'Q' },
    { label: '正确率', value: (user.accuracy || 0).toFixed(1) + '%', icon: '%' },
    { label: '连续打卡', value: String(user.current_streak || 0) + '天', icon: 'S' }
  ];

  dataItems.forEach(function(item, idx) {
    var x = 40 + (idx % 2) * 270;
    var row = Math.floor(idx / 2);
    var cy = y + row * 70;

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(x, cy, 250, 55, 12);
    ctx.fill();

    ctx.fillStyle = '#e0e8e4';
    ctx.font = '14px sans-serif';
    ctx.fillText(item.icon + ' ' + item.label, x + 16, cy + 22);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(item.value, x + 16, cy + 44);
  });

  // 底部
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '12px sans-serif';
  ctx.fillText('TATABOX 高中生物学习平台 · ' + new Date().toLocaleDateString('zh-CN'), 40, 370);
  ctx.fillText('bioquest.dada.im', 460, 370);

  // 下载
  try {
    var link = document.createElement('a');
    link.download = 'bioquest-share-' + Date.now() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (e) {
    alert('生成卡片失败：' + errText(e));
  }
}

// 挂载到 window 对象，供 app.js 调用
window.initUser = initUser;
window.generateShareCard = generateShareCard;
