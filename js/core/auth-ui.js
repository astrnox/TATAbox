

// Modal 焦点陷阱句柄（统一在 app.js 管理）
var _authFocusTrap = null;


/**
 * 初始化 Supabase 云端同步
 * 先动态加载 supabase 相关脚本（首屏不加载，节省 ~140KB）
 */
// 全局「认证就绪」信号
// 修复：「我的」等需要登录的页面在整页加载时，会先于 Supabase 会话恢复
// 而渲染，导致 isLoggedIn() 误判为未登录。通过该 Promise 让这些页面
// 等待会话恢复完成后再判断登录态，实现「登录一次全局生效」。
var _authReadyResolve = null;

var _authReadyPromise = new Promise(function (res) { _authReadyResolve = res; });


// 设计：用户拖动滑块到缺口位置，验证水平距离 + 通过时间
// - 缺口位置随机（80-220px）
// - 容差 ±5px，时间需 0.5-30s 内完成
// - 通过后 60s 内有效，存储到 sessionStorage

var _slideCaptchaState = {
  pass: { login: false, register: false },
  expireAt: { login: 0, register: 0 }
};


// 保留旧数学验证码作为兜底（连续失败 3 次后弹出）
var _captchaAnswers = { register: 0, login: 0 };

var _captchaFailCount = { register: 0, login: 0 };


/**
 * 更新认证 UI
 */
function updateAuthUI() {
  var authBtn = document.getElementById('auth-btn');
  if (!authBtn) return;

  // supabase-client 为懒加载（首屏不载入），Supabase 初始化失败走本地模式时
  // 这些全局函数可能尚未定义——必须守卫，避免 updateAuthUI 直接抛 ReferenceError
  var loggedIn = (typeof window.isLoggedIn === 'function') && !!window.isLoggedIn();
  if (loggedIn) {
    var user = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
    if (!user) user = { user_group: 'guest', display_name: '', username: '' };
    var groupLabels = { admin: '管理员', premium: '高级会员', verified: '认证会员', member: '会员', guest: '访客' };
    var groupLabel = groupLabels[user.user_group] || '会员';
    var displayName = user.display_name || user.username || '用户';
    var isGuest = user.isGuest || user.user_group === 'guest';
    // 头像：优先 getAvatarUrl()，无头像时用首字母兜底
    var avatarUrl = (typeof getAvatarUrl === 'function') ? getAvatarUrl() : null;
    var initial = displayName.charAt(0).toUpperCase();
    var displayNameSafe = escapeHtml(displayName);
    var avatarHtml;
    if (avatarUrl) {
      var avatarUrlSafe = escapeHtml(avatarUrl);
      avatarHtml = '<img src="' + avatarUrlSafe + '" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;">';
    } else {
      var initialSafe = escapeHtml(initial);
      avatarHtml = '<span style="width:24px;height:24px;border-radius:50%;background:var(--color-warm,#c4956a);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:600;flex-shrink:0;">' + initialSafe + '</span>';
    }
    authBtn.innerHTML = avatarHtml + '<span style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + displayNameSafe + '</span> <span style="font-size:0.7rem;opacity:0.7;">' + groupLabel + '</span>';
    authBtn.style.cssText = 'background: var(--color-deep, #1a3a2a); color: #fff; border: none; padding: 6px 14px; border-radius: 16px; cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 8px; max-width: 240px;';
    authBtn.onclick = function() {
      navigateTo('/user');
    };
    authBtn.title = groupLabel + (isGuest ? ' · 点击进入用户中心（可升级为正式会员）' : ' · 点击进入用户中心');
  } else {
    authBtn.textContent = '登录';
    authBtn.style.cssText = 'background: #3a8c5c; color: #fff; border: none; padding: 8px 16px; border-radius: 16px; cursor: pointer; font-size: 0.85rem;';
    authBtn.onclick = showAuthModal;
    authBtn.title = '登录/注册 TATABOX 账号';
  }
}


/**
 * 显示登录注册弹窗 — Tab 切换设计
 */
function showAuthModal(mode) {
  var existing = document.getElementById('auth-modal');
  if (existing) {
    existing.classList.add('visible');
    if (mode === 'register') authSwitchToRegister();
    else authSwitchToLogin();
    return;
  }

  var overlay = document.createElement('div');
  overlay.id = 'auth-modal';
  overlay.className = 'auth-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '登录或注册 TATABOX 账号');
  overlay.innerHTML = `
    <div class="auth-container" id="auth-container">
      <button class="auth-close-btn" data-on='["closeAuthModal"]' title="关闭">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <div class="auth-tabs" id="auth-tabs">
        <span class="auth-tab-indicator" id="auth-tab-indicator"></span>
        <button class="auth-tab active" id="auth-tab-login" data-on='["authSwitchToLogin"]'>登录</button>
        <button class="auth-tab" id="auth-tab-register" data-on='["authSwitchToRegister"]'>注册</button>
        <button class="auth-tab" id="auth-tab-forgot" data-on='["authSwitchToForgot"]'>找回密码</button>
      </div>
      <div class="auth-form-panel active" id="auth-form-login">
        <h2 class="auth-form-title">欢迎回来</h2>
        <p class="auth-form-sub">登录你的 TATABOX 账号继续探索</p>
        <div class="auth-field">
          <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
          <input type="text" class="auth-input" id="auth-login-username" placeholder="用户名 / 邮箱" autocomplete="username">
        </div>
        <div class="auth-field">
          <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <input type="password" class="auth-input" id="auth-login-password" placeholder="密码" autocomplete="current-password">
          <button type="button" class="auth-pwd-toggle" data-on='["_toggleAuthPwd","auth-login-password"]' data-stop-propagation aria-label="显示密码" title="显示密码" tabindex="-1">
            <svg class="auth-pwd-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
        <div class="slide-cap-trigger" id="slide-cap-trigger-login" data-state="pending" data-on='["_cspSlideCaptcha","login"]'>
          <svg class="slide-cap-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span class="slide-cap-trigger-text" id="slide-cap-trigger-text-login">点击完成安全验证</span>
          <span class="slide-cap-trigger-arrow">→</span>
        </div>
        <div class="auth-form-extra">
          <label for="auth-remember" style="display:flex;align-items:center;gap:6px;font-size:0.85rem;color:#cfd8d0;cursor:pointer;user-select:none;">
            <input type="checkbox" id="auth-remember" checked style="accent-color:#5a7d5c;cursor:pointer;">
            记住我的账号
          </label>
          <a href="#" data-on='["authSwitchToForgot"]' data-prevent-default>忘记密码？</a>
        </div>
        <button type="button" class="auth-btn" data-on='["handleLogin"]' data-prevent-default>登 录</button>
        <p class="auth-error" id="auth-login-error"></p>
        <div style="text-align:center;margin-top:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">
          <div class="auth-field">
            <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <input type="password" class="auth-input" id="auth-guest-password" placeholder="设置密码（可选，用于找回账号）" autocomplete="new-password">
            <button type="button" class="auth-pwd-toggle" data-on='["_toggleAuthPwd","auth-guest-password"]' data-stop-propagation aria-label="显示密码" title="显示密码" tabindex="-1">
              <svg class="auth-pwd-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <button type="button" class="bq-btn bq-btn--warm bq-btn--block" data-on='["handleGuestLogin"]' data-prevent-default>
            游客登录（无需注册）
          </button>
        </div>
        <div style="text-align:center;margin-top:6px;">
          <a href="#/admin" data-on='["closeAuthModal"]' class="auth-link" style="font-size:0.72rem;">管理员入口</a>
        </div>
      </div>
      <div class="auth-form-panel" id="auth-form-register">
        <h2 class="auth-form-title">创建账号</h2>
        <p class="auth-form-sub">注册 TATABOX 账号，开始刷题</p>
        <div class="auth-field">
          <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
          <input type="text" class="auth-input" id="auth-register-username" placeholder="用户名" autocomplete="username">
        </div>
        <div class="auth-field">
          <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7-4-4"/></svg>
          <input type="email" class="auth-input" id="auth-register-email" placeholder="邮箱（选填，丢失密码时找回）" autocomplete="email">
        </div>
        <div class="auth-field">
          <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <input type="text" class="auth-input" id="auth-register-name" placeholder="昵称（选填）" autocomplete="nickname">
        </div>
        <div class="auth-field">
          <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <input type="password" class="auth-input" id="auth-register-password" placeholder="密码（至少6位）" autocomplete="new-password">
          <button type="button" class="auth-pwd-toggle" data-on='["_toggleAuthPwd","auth-register-password"]' data-stop-propagation aria-label="显示密码" title="显示密码" tabindex="-1">
            <svg class="auth-pwd-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
        <div class="slide-cap-trigger" id="slide-cap-trigger-register" data-state="pending" data-on='["_cspSlideCaptcha","register"]'>
          <svg class="slide-cap-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span class="slide-cap-trigger-text" id="slide-cap-trigger-text-register">点击完成安全验证</span>
          <span class="slide-cap-trigger-arrow">→</span>
        </div>
        <button type="button" class="auth-btn" data-on='["handleRegister"]' data-prevent-default>注 册</button>
        <p class="auth-error" id="auth-register-error"></p>
        <p id="auth-register-debug" style="font-size:0.65rem;color:#889;text-align:center;margin:4px 0;line-height:1.5;word-break:break-all;display:none;"></p>
      </div>
      <div class="auth-form-panel" id="auth-form-forgot">
        <h2 class="auth-form-title">重置密码</h2>
        <p class="auth-form-sub">使用 8 字符密钥重置密码（无需邮件）</p>
        <div style="display:flex;gap:8px;margin-bottom:14px;justify-content:center;">
          <label style="display:flex;align-items:center;gap:4px;font-size:0.82rem;cursor:pointer;color:#cfd8d0;">
            <input type="radio" name="forgot-mode" value="reset" checked data-on-change='["toggleForgotMode"]'> 重置密码
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;color:#cfd8d0;cursor:pointer;">
            <input type="radio" name="forgot-mode" value="recover-key" data-on-change='["toggleForgotMode"]'> 找回密钥
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;color:#cfd8d0;cursor:pointer;">
            <input type="radio" name="forgot-mode" value="email" data-on-change='["toggleForgotMode"]'> 邮箱重置
          </label>
        </div>

        <div id="forgot-mode-reset">
          <div class="auth-field">
            <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
            <input type="text" class="auth-input" id="auth-forgot-username" placeholder="用户名" autocomplete="username">
          </div>
          <div class="auth-field">
            <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1.5"/></svg>
            <input type="text" class="auth-input" id="auth-forgot-userkey" placeholder="8 字符密钥（如 XXXX2K7M）" maxlength="8" autocomplete="off" style="text-transform:uppercase;letter-spacing:2px;font-family:monospace;">
          </div>
          <div class="auth-field">
            <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <input type="password" class="auth-input" id="auth-forgot-newpassword" placeholder="新密码（至少 6 位）" autocomplete="new-password">
            <button type="button" class="auth-pwd-toggle" data-on='["_toggleAuthPwd","auth-forgot-newpassword"]' data-stop-propagation aria-label="显示密码" title="显示密码" tabindex="-1">
              <svg class="auth-pwd-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <div class="auth-field">
            <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <input type="password" class="auth-input" id="auth-forgot-newpassword2" placeholder="再次输入新密码" autocomplete="new-password">
            <button type="button" class="auth-pwd-toggle" data-on='["_toggleAuthPwd","auth-forgot-newpassword2"]' data-stop-propagation aria-label="显示密码" title="显示密码" tabindex="-1">
              <svg class="auth-pwd-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>

        <div id="forgot-mode-recover-key" style="display:none;">
          <div class="auth-field">
            <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
            <input type="text" class="auth-input" id="auth-recover-username" placeholder="用户名" autocomplete="username">
          </div>
          <div class="auth-field">
            <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7-4-4"/></svg>
            <input type="text" class="auth-input" id="auth-recover-email" placeholder="邮箱后缀（如 @gmail.com）" autocomplete="off">
          </div>
          <p style="font-size:0.72rem;color:#8a9a8a;margin:6px 0 12px;line-height:1.5;">需要通过用户名 + 邮箱后缀验证身份</p>
        </div>

        <div id="forgot-mode-email" style="display:none;">
          <div class="auth-field">
            <svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7-4-4"/></svg>
            <input type="email" class="auth-input" id="auth-forgot-email" placeholder="注册时填写的邮箱" autocomplete="email">
          </div>
          <p style="font-size:0.72rem;color:#8a9a8a;margin:6px 0 12px;line-height:1.5;">发送重置链接到该邮箱（仅对注册时填过真实邮箱的账号有效）</p>
        </div>

        <button type="button" class="auth-btn" data-on='["handleForgotPassword"]' data-prevent-default>重置密码</button>
        <p class="auth-error" id="auth-forgot-error"></p>
        <p class="auth-success" id="auth-forgot-success"></p>
        <div style="text-align:center;margin-top:10px;">
          <a href="#" data-on='["authSwitchToLogin"]' data-prevent-default class="auth-link">返回登录</a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeAuthModal();
  });

  setTimeout(function() { overlay.classList.add('visible'); }, 10);
  if (mode === 'register') setTimeout(authSwitchToRegister, 20);
  else setTimeout(updateAuthTabIndicator, 20);

  // P0 登录持久化：若用户勾选了“记住我的账号”，自动预填上次登录标识
  if (mode !== 'register') {
    var savedId = null;
    try { savedId = localStorage.getItem('tatabox_remember_id'); } catch (e) {}
    if (savedId) {
      var loginUserEl = document.getElementById('auth-login-username');
      if (loginUserEl) loginUserEl.value = savedId;
      var loginPwdEl = document.getElementById('auth-login-password');
      if (loginPwdEl) loginPwdEl.focus();
    }
  }

  // 延迟渲染验证码
  setTimeout(function () {
    refreshCaptcha('register');
    refreshCaptcha('login');
  }, 100);

  // 焦点陷阱：ESC 关闭、初始聚焦到用户名输入
  if (window.BioQuestA11y && typeof window.BioQuestA11y.trapFocus === 'function') {
    if (_authFocusTrap) { _authFocusTrap.release(); _authFocusTrap = null; }
    _authFocusTrap = window.BioQuestA11y.trapFocus(overlay, {
      onEscape: closeAuthModal,
      initialFocus: overlay.querySelector('#auth-login-username')
    });
  }
}


/**
 * 关闭登录弹窗
 */
function closeAuthModal() {
  if (_authFocusTrap) { _authFocusTrap.release(); _authFocusTrap = null; }
  var modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('visible');
}


/**
 * 弹出「逃跑按钮」反向验证码（v5：去 AI 味 + 备选入口）
 * @param {string} type - 'login' | 'register'
 * @returns {Promise<boolean>}
 *
 * 设计：让真人和机器人做反的事情
 *  - 移动端直接通过
 *  - PC 端 mouseenter 触发按钮瞬移
 *  - 失败 3 次后按钮投降自动通过
 *  - 「我抓不到」入口 → 跳到扫雷小游戏
 */
function _showEscapeCaptcha(type) {
  return new Promise(function (resolve) {
    return _showEscapeCaptchaInner(type, resolve);
  });
}


function _showEscapeCaptchaInner(type, resolve) {
  // 移除已有的
  var existing = document.getElementById('escape-captcha-modal');
  if (existing) existing.remove();

  var isTouch = (typeof window.matchMedia === 'function') &&
    (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches);

  // 文案池
  var escapeLines = [
    '点这里',
    '换个地方',
    '没点到',
    '再试试',
    '差一点',
    '换个位置',
    '又跑了',
    '继续',
    '没抓住',
    '往哪跑'
  ];
  var surrenderText = '行 你赢了';

  // 随机选 3 条
  var shuffled = escapeLines.slice().sort(function () { return Math.random() - 0.5; });
  var selectedLines = [shuffled[0], shuffled[1], shuffled[2]];

  var modal = document.createElement('div');
  modal.id = 'escape-captcha-modal';
  modal.innerHTML = [
    '<div class="escape-cap-overlay">',
    '  <div class="escape-cap-panel">',
    '    <div class="escape-cap-stage" id="escape-cap-stage">',
    '      <button type="button" class="escape-cap-btn" id="escape-cap-btn">点这里</button>',
    '    </div>',
    '    <div class="escape-cap-bottom">',
    '      <button type="button" class="escape-cap-fail" id="escape-cap-fail">我抓不到</button>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('');

  document.body.appendChild(modal);

  var btn = modal.querySelector('#escape-cap-btn');
  var failBtn = modal.querySelector('#escape-cap-fail');

  var escapeCount = 0;
  var pass = false;
  var resolved = false;
  var maxEscapes = 3;

  function close(result) {
    if (resolved) return;
    resolved = true;
    modal.remove();
    if (result) {
      _markSlideCaptchaPassed(type);
    }
    resolve(result);
  }

  function triggerPass() {
    if (pass || resolved) return;
    pass = true;
    btn.classList.add('passed');
    btn.textContent = '通过';
    failBtn.style.display = 'none';
    setTimeout(function () { close(true); }, 700);
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function escapeButton() {
    if (pass || resolved) return;
    if (isTouch) return;
    escapeCount += 1;

    if (escapeCount >= maxEscapes) {
      // 投降
      btn.removeEventListener('mouseenter', escapeButton);
      btn.textContent = surrenderText;
      btn.classList.add('surrendered');
      setTimeout(function () {
        triggerPass();
      }, 500);
      return;
    }

    // 显示文案
    var i = Math.min(escapeCount - 1, selectedLines.length - 1);
    btn.textContent = selectedLines[i];

    // 瞬移
    var rect = btn.getBoundingClientRect();
    var btnW = rect.width;
    var btnH = rect.height;
    var viewportW = window.innerWidth;
    var viewportH = window.innerHeight;

    var angle = Math.random() * Math.PI * 2;
    var dist = rand(100, 220);
    var dx = Math.cos(angle) * dist;
    var dy = Math.sin(angle) * dist;

    var cx = rect.left + btnW / 2;
    var cy = rect.top + btnH / 2;
    var nx = cx + dx;
    var ny = cy + dy;

    var minX = btnW / 2 + 16;
    var maxX = viewportW - btnW / 2 - 16;
    var minY = btnH / 2 + 16;
    var maxY = viewportH - btnH / 2 - 16;
    nx = Math.max(minX, Math.min(maxX, nx));
    ny = Math.max(minY, Math.min(maxY, ny));

    var newLeft = nx - btnW / 2;
    var newTop = ny - btnH / 2;

    btn.style.position = 'fixed';
    btn.style.left = newLeft + 'px';
    btn.style.top = newTop + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
    btn.style.transform = 'none';
  }

  if (isTouch) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (pass) return;
      triggerPass();
    });
  } else {
    btn.addEventListener('mouseenter', escapeButton);
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (pass) return;
      if (escapeCount >= maxEscapes) {
        triggerPass();
      }
      // 未投降时点击无效 —— 按钮已经瞬移走了
    });
  }

  // 「我抓不到」入口
  failBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (resolved) return;
    // 切换到备选验证码（扫雷）
    modal.remove();
    resolved = true;
    _showMinesweeperCaptcha(type).then(resolve);
  });
}


/**
 * 备选验证码 #1：扫雷小游戏
 * 5x5 网格 + 4 颗雷，点开 5 个安全格算通过
 */
function _showMinesweeperCaptcha(type) {
  return new Promise(function (resolve) {
    var existing = document.getElementById('mine-captcha-modal');
    if (existing) existing.remove();

    var GRID = 5;
    var MINES = 4;
    var NEED_SAFE = 5;

    // 随机生成雷
    var mineSet = {};
    while (Object.keys(mineSet).length < MINES) {
      var k = Math.floor(Math.random() * GRID * GRID);
      mineSet[k] = true;
    }

    // 计算每个格的邻雷数
    var numMap = {};
    for (var r = 0; r < GRID; r++) {
      for (var c = 0; c < GRID; c++) {
        var idx = r * GRID + c;
        if (mineSet[idx]) { numMap[idx] = -1; continue; }
        var cnt = 0;
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            var nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
            if (mineSet[nr * GRID + nc]) cnt++;
          }
        }
        numMap[idx] = cnt;
      }
    }

    var opened = 0;
    var flagged = 0;
    var dead = false;
    var pass = false;
    var resolved = false;

    function buildGrid() {
      var html = '';
      for (var i = 0; i < GRID * GRID; i++) {
        html += '<div class="mine-cell" data-idx="' + i + '"></div>';
      }
      return html;
    }

    var modal = document.createElement('div');
    modal.id = 'mine-captcha-modal';
    modal.innerHTML = [
      '<div class="mine-cap-overlay">',
      '  <div class="mine-cap-panel">',
      '    <div class="mine-cap-title">找出安全区</div>',
      '    <div class="mine-cap-sub">5×5 网格 · 4 颗雷 · 点开 <strong>' + NEED_SAFE + '</strong> 个安全格</div>',
      '    <div class="mine-cap-stage">',
      '      <div class="mine-cap-grid" id="mine-cap-grid">' + buildGrid() + '</div>',
      '    </div>',
      '    <div class="mine-cap-status" id="mine-cap-status">右键标记雷 · 左键翻开</div>',
      '    <div class="mine-cap-bottom">',
      '      <button type="button" class="mine-cap-back" id="mine-cap-back">← 回去抓</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);

    var grid = modal.querySelector('#mine-cap-grid');
    var status = modal.querySelector('#mine-cap-status');

    function close(result) {
      if (resolved) return;
      resolved = true;
      modal.remove();
      if (result) {
        _markSlideCaptchaPassed(type);
      }
      resolve(result);
    }

    function openCell(idx) {
      if (pass || dead) return;
      var cell = grid.querySelector('.mine-cell[data-idx="' + idx + '"]');
      if (!cell || cell.classList.contains('open') || cell.classList.contains('flag')) return;
      var n = numMap[idx];
      if (n === -1) return; // 雷不在这里处理
      cell.classList.add('open');
      cell.textContent = n > 0 ? n : '';
      if (n === 0) cell.classList.add('zero');
      opened += 1;
      if (opened >= NEED_SAFE) {
        pass = true;
        status.textContent = '通过';
        status.className = 'mine-cap-status ok';
        grid.querySelectorAll('.mine-cell').forEach(function (c) {
          c.style.pointerEvents = 'none';
        });
        setTimeout(function () { close(true); }, 600);
      }
      // flood-fill: 零格自动展开相邻格
      if (n === 0) {
        var r = Math.floor(idx / GRID);
        var c = idx % GRID;
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            var nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
            openCell(nr * GRID + nc);
          }
        }
      }
    }

    function reveal(idx) {
      if (dead || pass) return;
      var cell = grid.querySelector('.mine-cell[data-idx="' + idx + '"]');
      if (!cell || cell.classList.contains('open') || cell.classList.contains('flag')) return;
      var n = numMap[idx];
      if (n === -1) {
        // 踩雷
        cell.classList.add('mine');
        cell.textContent = 'X';
        dead = true;
        status.textContent = '踩雷了，重新开始';
        status.className = 'mine-cap-status err';
        Object.keys(mineSet).forEach(function (mi) {
          var c2 = grid.querySelector('.mine-cell[data-idx="' + mi + '"]');
          if (c2 && !c2.classList.contains('open')) {
            c2.classList.add('open', 'mine-show');
            c2.textContent = 'X';
          }
        });
        setTimeout(function () {
          modal.remove();
          if (!resolved) {
            _showMinesweeperCaptcha(type).then(resolve);
          }
        }, 1200);
        return;
      }
      openCell(idx);
      if (!pass) {
        status.textContent = '还差 ' + (NEED_SAFE - opened) + ' 个安全格';
      }
    }

    function toggleFlag(idx) {
      var cell = grid.querySelector('.mine-cell[data-idx="' + idx + '"]');
      if (!cell || cell.classList.contains('open')) return;
      if (cell.classList.contains('flag')) {
        cell.classList.remove('flag');
        cell.textContent = '';
        flagged -= 1;
      } else {
        cell.classList.add('flag');
        cell.innerHTML = BQ_ICONS.flag;
        flagged += 1;
      }
    }

    // 事件委托
    grid.addEventListener('click', function (e) {
      if (dead || pass) return;
      var cell = e.target.closest('.mine-cell');
      if (!cell) return;
      var idx = parseInt(cell.dataset.idx, 10);
      reveal(idx);
    });
    grid.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (dead || pass) return;
      var cell = e.target.closest('.mine-cell');
      if (!cell) return;
      var idx = parseInt(cell.dataset.idx, 10);
      toggleFlag(idx);
    });

    // 返回按钮
    modal.querySelector('#mine-cap-back').addEventListener('click', function (e) {
      e.preventDefault();
      modal.remove();
      if (!resolved) {
        resolved = true;
        _showEscapeCaptchaInner(type, resolve);
      }
    });
  });
}


/**
 * 密码强度计算（the sarcastic strength meter 风格）
 * 综合：长度、字符种类、唯一性、是否常见
 * @returns {0-5} + 讽刺文案
 */
function _calcPasswordStrength(pwd) {
  if (!pwd) {
    return { score: 0, label: '...', sarcastic: '还没开始' };
  }
  var score = 0;
  var factors = [];

  // 长度
  if (pwd.length >= 6) score += 1;
  if (pwd.length >= 10) score += 1;
  if (pwd.length >= 14) score += 1;
  if (pwd.length >= 20) score += 1;
  factors.push(pwd.length + '位');

  // 字符种类
  if (/[a-z]/.test(pwd)) { score += 0.4; factors.push('小写'); }
  if (/[A-Z]/.test(pwd)) { score += 0.4; factors.push('大写'); }
  if (/[0-9]/.test(pwd)) { score += 0.3; factors.push('数字'); }
  if (/[^a-zA-Z0-9]/.test(pwd)) { score += 0.5; factors.push('符号'); }

  // 唯一字符数
  var uniqueChars = {};
  for (var i = 0; i < pwd.length; i++) uniqueChars[pwd[i]] = true;
  if (Object.keys(uniqueChars).length >= pwd.length * 0.7) { score += 0.3; }

  // 常见密码扣分
  var commonPwd = ['123456', 'password', 'qwerty', 'abc123', '111111', '12345', 'iloveyou', 'admin', 'welcome', 'letmein'];
  if (commonPwd.some(function (c) { return pwd.toLowerCase().indexOf(c) >= 0; })) {
    score = Math.max(0, score - 2);
    factors.push('常见密码');
  }

  // 重复字符扣分
  if (/(.)\1{2,}/.test(pwd)) {
    score = Math.max(0, score - 0.5);
  }

  // 数字映射到 0-5
  var level = Math.min(5, Math.floor(score));

  // 讽刺文案池（参考 the sarcastic strength meter）
  var sarcasticMap = {
    0: ['空的', '这不算密码', '随便按的？', '空气密码'],
    1: ['湿纸一样', '被蜗牛一碰就碎', '小孩都能破解', '算了吧'],
    2: ['你家金鱼就能猜中', '纪念日？', '还在用这个？', '你奶奶都嫌弱'],
    3: ['还行，能用', '但还是会被字典攻击', '装个样子', '初学者级别'],
    4: ['不错', '老黑客会皱眉头', '安全的', '多数人做不到'],
    5: ['NSA 看了都点头', '量子计算机也怕', '这密码够硬', '已经是传奇']
  };
  var pool = sarcasticMap[level] || sarcasticMap[0];
  var sarcastic = pool[Math.floor(Math.random() * pool.length)];

  return { score: level, label: factors.join('+'), sarcastic: sarcastic };
}


/**
 * XKCD 风格密码生成器
 * 4 个随机词（Correct Horse Battery Staple 风格）
 */
function _generateXKCDPassword() {
  var words = [
    'correct', 'horse', 'battery', 'staple', 'apple', 'banana', 'cherry', 'dragon',
    'eagle', 'forest', 'guitar', 'hammer', 'island', 'jacket', 'kitchen', 'lemon',
    'mountain', 'noodle', 'ocean', 'piano', 'quartz', 'rocket', 'sunset', 'tiger',
    'umbrella', 'violin', 'window', 'yellow', 'zebra', 'amber', 'breeze', 'candle',
    'donut', 'engine', 'feather', 'galaxy', 'iceberg', 'jasmine', 'koala',
    'ladder', 'marble', 'needle', 'octopus', 'pencil', 'quiver', 'ribbon', 'silver',
    'tunnel', 'unicorn', 'velvet', 'whisper', 'xenon', 'yogurt', 'zenith', 'anchor',
    'bridge', 'canyon', 'desert', 'eclipse', 'falcon', 'glacier', 'horizon', 'igloo',
    'jungle', 'knight', 'lantern', 'meteor', 'nucleus', 'orbit', 'puddle', 'quill',
    'rainbow', 'shadow', 'thunder', 'utopia', 'vortex', 'willow', 'yacht', 'zephyr',
    'beacon', 'crimson', 'dynamo', 'emerald', 'flame', 'garnet', 'harbor',
    'indigo', 'jade', 'lava', 'mosaic', 'nebula', 'onyx', 'pearl', 'ruby',
    'sapphire', 'topaz', 'crystal', 'comet', 'cosmic', 'dawn', 'dusk',
    'echo', 'frost', 'mist', 'storm', 'wave', 'aurora', 'meadow',
    'valley', 'ridge', 'cliff', 'cave', 'river', 'stream', 'gust',
    'pulse', 'rhythm', 'melody', 'harmony', 'silence', 'light', 'spark',
    'ember', 'glow', 'radiance', 'voyage', 'journey', 'quest', 'wander',
    'explore', 'discover', 'dream', 'vision', 'wisdom', 'courage', 'honor',
    'glory', 'mystery', 'secret', 'legend', 'myth', 'phoenix', 'griffin',
    'titan', 'atlas', 'orion', 'vega', 'sirius', 'cipher', 'enigma',
    'riddle', 'puzzle', 'labyrinth', 'maze', 'gate', 'portal', 'dungeon',
    'castle', 'tower', 'fortress', 'citadel', 'kingdom', 'empire', 'realm',
    'volcano', 'plateau', 'mesa', 'butte', 'archipelago', 'lagoon'
  ];
  var picked = [];
  for (var j = 0; j < 4; j++) {
    var w;
    do {
      w = words[Math.floor(Math.random() * words.length)];
    } while (picked.indexOf(w) >= 0);
    picked.push(w);
  }
  return picked.join('-');
}


/**
 * 弹出密码设置器（独立界面）
 * 包含：强度计 + XKCD 生成 + 字典攻击演示
 */
function _showPasswordSetup(onConfirm) {
  var existing = document.getElementById('pwd-setup-modal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'pwd-setup-modal';
  modal.innerHTML = [
    '<div class="pwd-setup-overlay">',
    '  <div class="pwd-setup-panel">',
    '    <div class="pwd-setup-title">造一个没人能破的密码</div>',
    '    <div class="pwd-setup-sub">支持自定义 · XKCD 生成 · 字典攻击演示</div>',
    '    <div class="pwd-setup-row">',
    '      <div class="pwd-setup-input-wrap">',
    '        <input type="password" class="pwd-setup-input" id="pwd-setup-input" placeholder="输入或生成密码" autocomplete="off">',
    '        <button type="button" class="pwd-setup-toggle" id="pwd-setup-toggle" title="隐藏/显示"></button>',
    '      </div>',
    '      <button type="button" class="pwd-setup-gen" id="pwd-setup-gen">XKCD 生成</button>',
    '    </div>',
    '    <div class="pwd-strength-wrap">',
    '      <div class="pwd-strength-bar">',
    '        <div class="pwd-strength-fill" id="pwd-strength-fill"></div>',
    '      </div>',
    '      <div class="pwd-strength-meta">',
    '        <span class="pwd-strength-label" id="pwd-strength-label">弱</span>',
    '        <span class="pwd-strength-info" id="pwd-strength-info">还没开始</span>',
    '      </div>',
    '    </div>',
    '    <div class="pwd-sarcastic" id="pwd-sarcastic">"随便按的？"</div>',
    '    <div class="pwd-attack-section">',
    '      <div class="pwd-attack-title">字典攻击演示 <span class="pwd-attack-hint">模拟 · 不会真攻击</span></div>',
    '      <div class="pwd-attack-row">',
    '        <button type="button" class="pwd-attack-start" id="pwd-attack-start">开始攻击</button>',
    '        <div class="pwd-attack-progress">',
    '          <div class="pwd-attack-fill" id="pwd-attack-fill"></div>',
    '        </div>',
    '        <span class="pwd-attack-stat" id="pwd-attack-stat">未开始</span>',
    '      </div>',
    '      <div class="pwd-attack-log" id="pwd-attack-log"></div>',
    '    </div>',
    '    <div class="pwd-setup-actions">',
    '      <button type="button" class="pwd-setup-cancel" id="pwd-setup-cancel">取消</button>',
    '      <button type="button" class="pwd-setup-confirm" id="pwd-setup-confirm">用这个密码</button>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('');

  document.body.appendChild(modal);

  var input = modal.querySelector('#pwd-setup-input');
  var toggle = modal.querySelector('#pwd-setup-toggle');
  var gen = modal.querySelector('#pwd-setup-gen');
  var fill = modal.querySelector('#pwd-strength-fill');
  var label = modal.querySelector('#pwd-strength-label');
  var info = modal.querySelector('#pwd-strength-info');
  var sarcastic = modal.querySelector('#pwd-sarcastic');
  var attackStart = modal.querySelector('#pwd-attack-start');
  var attackFill = modal.querySelector('#pwd-attack-fill');
  var attackStat = modal.querySelector('#pwd-attack-stat');
  var attackLog = modal.querySelector('#pwd-attack-log');
  var cancelBtn = modal.querySelector('#pwd-setup-cancel');
  var confirmBtn = modal.querySelector('#pwd-setup-confirm');

  var colorMap = ['#d63a2a', '#e87a3a', '#e8c43a', '#a8d63a', '#3a8c5c', '#5a4ad6'];
  var labelMap = ['弱', '弱', '较弱', '中等', '强', '极强'];

  function updateUI() {
    var pwd = input.value;
    var r = _calcPasswordStrength(pwd);
    var pct = (r.score / 5) * 100;
    fill.style.width = pct + '%';
    fill.style.background = colorMap[r.score] || colorMap[0];
    label.textContent = labelMap[r.score] || '弱';
    label.style.color = colorMap[r.score] || colorMap[0];
    info.textContent = r.label || '还没开始';
    sarcastic.textContent = '"' + r.sarcastic + '"';
  }
  input.addEventListener('input', updateUI);

  // 切换可见
  toggle.addEventListener('click', function () {
    if (input.type === 'password') {
      input.type = 'text';
    } else {
      input.type = 'password';
    }
  });

  // XKCD 生成
  gen.addEventListener('click', function () {
    var pwd = _generateXKCDPassword();
    input.value = pwd;
    input.type = 'text';
    updateUI();
  });

  // 字典攻击演示
  var attackCancelId = null; // null 表示空闲，存 requestAnimationFrame id（#118：rAF 替代 setInterval）
  function stopAttack() {
    if (attackCancelId !== null) cancelAnimationFrame(attackCancelId);
    attackCancelId = null;
    attackStart.textContent = '开始攻击';
  }
  attackStart.addEventListener('click', function () {
    if (attackCancelId !== null) { stopAttack(); return; }
    var pwd = input.value;
    if (!pwd) {
      attackStat.textContent = '请先输入密码';
      return;
    }
    attackStart.textContent = '停止';
    attackFill.style.transform = 'scaleX(0)';
    attackFill.style.background = '#d63a2a';
    attackLog.replaceChildren();
    var tried = 0;
    var lastMs = Date.now();
    var speed = 50 + Math.floor(Math.random() * 30);
    var strength = _calcPasswordStrength(pwd).score;
    var maxTries = strength <= 1 ? 2000 : (strength <= 2 ? 20000 : (strength <= 3 ? 200000 : (strength <= 4 ? 5000000 : 99999999)));
    var likelyHit = strength <= 2;

    function tick() {
      if (attackCancelId === null) return; // 已停止
      // 按真实时间步进，避免 rAF 在不同刷新率下速度不一致
      var now = Date.now();
      var elapsed = Math.max(1, now - lastMs);
      lastMs = now;
      tried += speed * (elapsed / 80);

      if (tried > maxTries) tried = maxTries;
      var pct = Math.min(1, tried / maxTries); // 0~1，配合 transform: scaleX
      attackFill.style.transform = 'scaleX(' + pct + ')';
      var displayTried = tried >= 1000000 ? (tried / 1000000).toFixed(1) + 'M' :
                        tried >= 1000 ? (tried / 1000).toFixed(1) + 'K' : String(Math.floor(tried));
      var displayMax = maxTries >= 1000000 ? (maxTries/1000000).toFixed(0) + 'M' : (maxTries/1000).toFixed(0) + 'K';
      attackStat.textContent = '尝试 ' + displayTried + ' / ' + displayMax;

      if (Math.random() < 0.05) {
        var sampleWords = ['password', 'qwerty', 'letmein', 'admin', 'iloveyou', 'monkey', 'dragon', 'abc123', 'pokemon'];
        var sw = sampleWords[Math.floor(Math.random() * sampleWords.length)] + Math.floor(Math.random() * 99);
        var logLine = document.createElement('div');
        logLine.textContent = '× ' + sw;
        attackLog.appendChild(logLine);
        if (attackLog.children.length > 5) attackLog.removeChild(attackLog.firstChild);
        attackLog.scrollTop = attackLog.scrollHeight;
      }

      if (likelyHit && tried >= maxTries * 0.95) {
        attackFill.style.background = '#d63a2a';
        var hitLine = document.createElement('div');
        hitLine.textContent = '√ 已破解：' + pwd;
        hitLine.style.color = '#d63a2a';
        hitLine.style.fontWeight = '700';
        attackLog.appendChild(hitLine);
        attackStat.textContent = '已破解';
        stopAttack();
        return;
      }
      if (tried >= maxTries) {
        attackFill.style.background = '#3a8c5c';
        var safeLine = document.createElement('div');
        safeLine.textContent = '√ 攻击终止 · 密码安全';
        safeLine.style.color = '#3a8c5c';
        safeLine.style.fontWeight = '700';
        attackLog.appendChild(safeLine);
        attackStat.textContent = '已停止';
        stopAttack();
        return;
      }
      attackCancelId = requestAnimationFrame(tick);
    }
    attackCancelId = requestAnimationFrame(tick);
  });

  cancelBtn.addEventListener('click', function () {
    if (attackCancelId !== null) cancelAnimationFrame(attackCancelId);
    attackCancelId = null;
    modal.remove();
    if (typeof onConfirm === 'function') onConfirm(null);
  });
  confirmBtn.addEventListener('click', function () {
    var pwd = input.value;
    if (!pwd) {
      sarcastic.textContent = '"不能为空"';
      return;
    }
    if (pwd.length < 6) {
      sarcastic.textContent = '"至少 6 位"';
      return;
    }
    if (attackCancelId !== null) cancelAnimationFrame(attackCancelId);
    attackCancelId = null;
    modal.remove();
    if (typeof onConfirm === 'function') onConfirm(pwd);
  });

  updateUI();
}


/**
 * 滑动触发器 UI 更新回调
 * @param {boolean} passed
 */
function _updateSlideTriggerUI(passed) {
  // 找出当前已存在的触发器（login / register）
  var triggers = document.querySelectorAll('.slide-cap-trigger');
  triggers.forEach(function (el) {
    var textEl = el.querySelector('.slide-cap-trigger-text');
    var arrowEl = el.querySelector('.slide-cap-trigger-arrow');
    var type = el.id.indexOf('login') >= 0 ? 'login' : 'register';
    if (passed && _isSlideCaptchaPassed(type)) {
      el.dataset.state = 'passed';
      if (textEl) textEl.textContent = '已通过安全验证';
      if (arrowEl) arrowEl.textContent = '√';
    } else {
      el.dataset.state = 'pending';
      if (textEl) textEl.textContent = '点击完成安全验证';
      if (arrowEl) arrowEl.textContent = '→';
    }
  });
}


/**
 * 切换忘记密码面板的三种模式：重置密码（密钥）/ 找回密钥 / 邮箱重置
 */
function toggleForgotMode() {
  var mode = (document.querySelector('input[name="forgot-mode"]:checked') || {}).value || 'reset';
  var resetDiv = document.getElementById('forgot-mode-reset');
  var recoverDiv = document.getElementById('forgot-mode-recover-key');
  var emailDiv = document.getElementById('forgot-mode-email');
  var btn = document.querySelector('#auth-form-forgot .auth-btn');
  var title = document.querySelector('#auth-form-forgot .auth-form-sub');
  if (resetDiv) resetDiv.style.display = 'none';
  if (recoverDiv) recoverDiv.style.display = 'none';
  if (emailDiv) emailDiv.style.display = 'none';
  if (mode === 'recover-key') {
    if (recoverDiv) recoverDiv.style.display = 'block';
    if (btn) btn.textContent = '查询密钥';
    if (title) title.textContent = '通过用户名 + 邮箱后缀找回密钥';
  } else if (mode === 'email') {
    if (emailDiv) emailDiv.style.display = 'block';
    if (btn) btn.textContent = '发送重置邮件';
    if (title) title.textContent = '通过注册邮箱重置密码';
  } else {
    if (resetDiv) resetDiv.style.display = 'block';
    if (btn) btn.textContent = '重置密码';
    if (title) title.textContent = '使用 8 字符密钥重置密码（无需邮件）';
  }
  // 清空错误/成功提示
  var errorEl = document.getElementById('auth-forgot-error');
  var successEl = document.getElementById('auth-forgot-success');
  if (errorEl) errorEl.textContent = '';
  if (successEl) successEl.textContent = '';
}


function refreshCaptcha(type) {
  var a = Math.floor(Math.random() * 10) + 1;
  var b = Math.floor(Math.random() * 10) + 1;
  var op = Math.random() < 0.5 ? '+' : '-';
  var ans = op === '+' ? a + b : a - b;
  if (op === '-' && b > a) { var t = a; a = b; b = t; ans = a - b; }
  _captchaAnswers[type] = ans;
  var el = document.getElementById('captcha-question-' + type);
  if (el) el.textContent = a + ' ' + op + ' ' + b + ' = ?';
  var input = document.getElementById('captcha-answer-' + type);
  if (input) input.value = '';
}


function _verifyCaptcha(type) {
  var input = document.getElementById('captcha-answer-' + type);
  if (!input) return false;
  var val = parseInt(String(input.value || '').trim(), 10);
  if (isNaN(val) || val !== _captchaAnswers[type]) return false;
  return true;
}


/**
 * 切换到登录表单
 */
function authSwitchToLogin() {
  setActiveAuthTab('auth-tab-login', 'auth-form-login');
}

function authSwitchToRegister() {
  setActiveAuthTab('auth-tab-register', 'auth-form-register');
}

function authSwitchToForgot() {
  setActiveAuthTab('auth-tab-forgot', 'auth-form-forgot');
}


function updateAuthTabIndicator() {
  var indicator = document.getElementById('auth-tab-indicator');
  var container = document.getElementById('auth-tabs');
  var activeTab = container ? container.querySelector('.auth-tab.active') : null;
  if (indicator && container && activeTab) {
    var cr = container.getBoundingClientRect();
    var tr = activeTab.getBoundingClientRect();
    indicator.style.left = (tr.left - cr.left) + 'px';
    indicator.style.width = tr.width + 'px';
  }
}


function setActiveAuthTab(tabId, panelId) {
  // Tabs
  document.querySelectorAll('.auth-tab').forEach(function(t) { t.classList.remove('active'); });
  var tab = document.getElementById(tabId);
  if (tab) tab.classList.add('active');
  // Panels
  document.querySelectorAll('.auth-form-panel').forEach(function(p) { p.classList.remove('active'); });
  var panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
  // Sliding indicator
  var indicator = document.getElementById('auth-tab-indicator');
  var container = document.getElementById('auth-tabs');
  if (indicator && container && tab) {
    var cr = container.getBoundingClientRect();
    var tr = tab.getBoundingClientRect();
    indicator.style.left = (tr.left - cr.left) + 'px';
    indicator.style.width = tr.width + 'px';
  }
}


/**
 * 处理忘记密码（基于 user_key 8 字符密钥，无需邮件）
 * 流程：
 *   1. 用户输入 username + user_key + 新密码
 *   2. 调 resetPasswordByKey RPC
 *   3. 成功后直接登录
 */
async function handleForgotPassword() {
  if (typeof resetPasswordByKey !== 'function') {
    try { await initSupabase(); } catch(e) { /* ignore */ }
  }

  var mode = (document.querySelector('input[name="forgot-mode"]:checked') || {}).value || 'reset';
  var errorEl = document.getElementById('auth-forgot-error');
  var successEl = document.getElementById('auth-forgot-success');

  if (errorEl) errorEl.textContent = '';
  if (successEl) successEl.textContent = '';

  if (mode === 'recover-key') {
    // 找回 user_key 模式
    var username = document.getElementById('auth-recover-username').value.trim();
    var emailHint = document.getElementById('auth-recover-email').value.trim();

    if (!username || !emailHint) {
      if (errorEl) errorEl.textContent = '请填写用户名和邮箱后缀';
      return;
    }
    if (!emailHint.startsWith('@')) {
      if (errorEl) errorEl.textContent = '邮箱后缀请以 @ 开头，如 @gmail.com';
      return;
    }

    var btn1 = document.querySelector('#auth-form-forgot .auth-btn');
    if (btn1) { btn1.disabled = true; btn1.textContent = '查询中...'; }
    try {
      var res = await recoverUserKey(username, emailHint);
      if (btn1) { btn1.disabled = false; btn1.textContent = '查询密钥'; }
      if (res && res.ok && res.userKey) {
        if (successEl) {
          successEl.innerHTML = '<div style="background:rgba(58,140,92,0.12);padding:14px;border-radius:8px;margin:10px 0;">' +
            '<div style="font-size:0.82rem;color:#3a8c5c;margin-bottom:6px;">你的 8 字符密钥：</div>' +
            '<div style="font-family:monospace;font-size:1.4rem;letter-spacing:4px;font-weight:700;color:#fff;background:rgba(0,0,0,0.3);padding:10px;border-radius:8px;text-align:center;">' + escapeHtml(res.userKey) + '</div>' +
            '<div style="font-size:0.72rem;color:#8a9a8a;margin-top:6px;">请截图保存（密钥只展示一次）</div>' +
            '</div>';
        }
      } else {
        if (errorEl) errorEl.textContent = (res && res.error) || '查询失败';
      }
    } catch (e) {
      console.error('[TATABOX] recoverUserKey 异常:', e);
      if (errorEl) errorEl.textContent = '查询异常: ' + (e.message || String(e));
      if (btn1) { btn1.disabled = false; btn1.textContent = '查询密钥'; }
    }
    return;
  }

  if (mode === 'email') {
    // 邮箱重置模式：发送重置密码邮件（Supabase Auth），用户点邮件链接回到 #/reset-password 设置新密码
    var emailInput = document.getElementById('auth-forgot-email');
    var emailVal = emailInput ? emailInput.value.trim() : '';
    if (!emailVal || !emailVal.includes('@')) {
      if (errorEl) errorEl.textContent = '请输入有效的邮箱地址';
      return;
    }
    if (typeof resetPassword !== 'function') {
      try { await initSupabase(); } catch (e) { /* ignore */ }
    }
    if (typeof resetPassword !== 'function') {
      if (errorEl) errorEl.textContent = '系统未就绪，请刷新页面后重试';
      return;
    }
    var btnE = document.querySelector('#auth-form-forgot .auth-btn');
    if (btnE) { if (btnE.disabled) return; btnE.disabled = true; btnE.textContent = '发送中...'; }
    try {
      var mailRes = await resetPassword(emailVal);
      if (btnE) { btnE.disabled = false; btnE.textContent = '发送重置邮件'; }
      if (mailRes && mailRes.ok) {
        if (successEl) {
          successEl.innerHTML = '<div style="background:rgba(58,140,92,0.12);padding:14px;border-radius:8px;margin:10px 0;text-align:left;">' +
            '<div style="font-size:0.85rem;color:#3a8c5c;margin-bottom:6px;">重置邮件已发送</div>' +
            '<div style="font-size:0.78rem;color:#8a9a8a;line-height:1.6;">请到邮箱查收并点击链接设置新密码（未收到请检查垃圾箱）。<br>注册时未填邮箱的账号请改用「重置密码」（8 字符密钥）。</div>' +
            '</div>';
        }
      } else {
        if (errorEl) errorEl.textContent = (mailRes && mailRes.error) || '发送失败，请稍后重试';
      }
    } catch (e) {
      console.error('[TATABOX] 邮箱重置异常:', e);
      if (errorEl) errorEl.textContent = '发送异常: ' + (e.message || String(e));
      if (btnE) { btnE.disabled = false; btnE.textContent = '发送重置邮件'; }
    }
    return;
  }

  // 重置密码模式（默认）
  var username2 = document.getElementById('auth-forgot-username').value.trim();
  var userKey = document.getElementById('auth-forgot-userkey').value.trim();
  var newPwd = document.getElementById('auth-forgot-newpassword').value;
  var newPwd2 = document.getElementById('auth-forgot-newpassword2').value;

  if (!username2 || !userKey || !newPwd) {
    if (errorEl) errorEl.textContent = '请填写完整信息';
    return;
  }
  if (newPwd.length < 6) {
    if (errorEl) errorEl.textContent = '新密码至少 6 位';
    return;
  }
  if (newPwd !== newPwd2) {
    if (errorEl) errorEl.textContent = '两次输入的密码不一致';
    return;
  }
  if (userKey.length !== 8) {
    if (errorEl) errorEl.textContent = '8 字符密钥必须为 8 位';
    return;
  }

  var btn = document.querySelector('#auth-form-forgot .auth-btn');
  if (btn) { if (btn.disabled) return; btn.disabled = true; btn.textContent = '重置中...'; }

  try {
    var result = await resetPasswordByKey(username2, userKey, newPwd);
    if (btn) { btn.disabled = false; btn.textContent = '重置密码'; }

    if (result && result.ok) {
      var forgotForm = document.getElementById('auth-form-forgot');
      if (forgotForm) {
        forgotForm.innerHTML = '<div style="text-align:center;padding:20px 0;">' +
          '<div class="bq-result-icon">' + BQ_ICONS.checkCircleLarge + '</div>' +
          '<h3 style="font-size:1.1rem;margin-bottom:8px;color:var(--color-sage,#3a8c5c);">密码已重置</h3>' +
          '<p style="font-size:0.85rem;color:var(--text-secondary,#8a8a8a);line-height:1.6;margin-bottom:12px;">' +
            '你的密码已成功重置。<br>请使用新密码登录。' +
          '</p>' +
          '<button data-on=\'["authSwitchToLogin"]\' ' +
            'style="background:var(--color-sage,#3a8c5c);color:#fff;border:none;padding:8px 20px;border-radius:16px;cursor:pointer;font-size:0.85rem;margin-top:8px;">' +
            '返回登录</button>' +
        '</div>';
      }
    } else {
      if (errorEl) errorEl.textContent = (result && result.error) || '重置失败';
    }
  } catch (e) {
    console.error('[TATABOX] handleForgotPassword 异常:', e);
    if (errorEl) errorEl.textContent = '重置异常: ' + (e.message || String(e));
    if (btn) { btn.disabled = false; btn.textContent = '重置密码'; }
  }
}


/**
 * 处理登录
 */
async function handleLogin() {
  // 确保 supabase 脚本已加载
  if (typeof loginUser !== 'function') {
    try { await initSupabase(); } catch(e) { /* ignore */ }
  }
  var username = document.getElementById('auth-login-username').value.trim();
  var password = document.getElementById('auth-login-password').value;
  var errorEl = document.getElementById('auth-login-error');

  if (!username || !password) {
    errorEl.textContent = '请填写用户名和密码';
    return;
  }

  // 客户端冷却检查
  if (errorEl) {
    var cooldown = checkAuthCooldown('login');
    if (cooldown.blocked) {
      errorEl.textContent = '登录尝试过于频繁，请 ' + cooldown.remaining + ' 秒后再试';
      return;
    }
  }

  // 反向 captcha：逃跑按钮（通过后 60s 内有效）
  if (!_isSlideCaptchaPassed('login')) {
    errorEl.textContent = '请先完成安全验证';
    try {
      var passed = await _showSlideCaptcha('login');
      if (!passed) {
        errorEl.textContent = '已取消安全验证';
        return;
      }
    } catch (e) {
      errorEl.textContent = '安全验证组件异常';
      return;
    }
  }

  var btn = document.querySelector('#auth-form-login .auth-btn');
  if (btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '登录中... <span style="display:block;font-size:0.7rem;font-weight:normal;opacity:0.85;margin-top:2px;">请耐心等待，数据库在韩国</span>';
  }
  errorEl.textContent = '';
  try {
    var result = await loginUser(username, password);

    if (result && result.ok) {
      // P0 登录持久化：登录成功后按“记住我的账号”选择持久化登录标识（下次自动预填）
      var rememberEl = document.getElementById('auth-remember');
      try {
        if (rememberEl && rememberEl.checked) {
          localStorage.setItem('tatabox_remember_id', username);
        } else {
          localStorage.removeItem('tatabox_remember_id');
        }
      } catch (e) {}
      setAuthCooldown('login');
      closeAuthModal();
      showStorageStatus('cloud');
      updateAuthUI();
      if (typeof _setCurrentUser === 'function') _setCurrentUser(result.user);
      await mergeCloudData();
      var uname = (result.user || {}).username || '用户';
      // P0-1：登录成功后回到此前因权限不足被拦截的目标路由；
      // 若没有待恢复路由（如直接在受保护页内登录），则刷新当前受保护路由的登录态
      try {
        var authRedirect = sessionStorage.getItem('bioquest:authRedirect');
        if (authRedirect && Routes[authRedirect] && (_checkRouteAccess(authRedirect) || {}).allowed) {
          sessionStorage.removeItem('bioquest:authRedirect');
          navigateTo(authRedirect);
        } else {
          _refreshCurrentProtectedRoute();
        }
      } catch (e) {
        _refreshCurrentProtectedRoute();
      }

    } else {
      // 只展示原始错误信息，不再拼接任何调侃/旧人机验证文案
      var origErr = (result && result.error) || '登录失败';
      errorEl.textContent = origErr;
      // 更新验证码状态
      if (typeof _updateSlideTriggerUI === 'function') _updateSlideTriggerUI(false);
    }
  } catch (e) {
    console.error('[TATABOX] handleLogin 异常:', e);
    errorEl.textContent = '登录异常: ' + (e.message || String(e));
    refreshCaptcha('login');
  }
  if (btn) { btn.disabled = false; btn.textContent = '登 录'; }
}


/**
 * 游客登录
 */
async function handleGuestLogin() {
  if (typeof guestLogin !== 'function') {
    var errorEl = document.getElementById('auth-login-error');
    if (errorEl) errorEl.textContent = '系统未就绪，请刷新页面后重试';
    return;
  }

  var password = (document.getElementById('auth-guest-password') || {}).value || null;
  var errorEl = document.getElementById('auth-login-error');

  // 检查是否存在已有的游客会话
  var existingSession = null;
  try {
    existingSession = JSON.parse(localStorage.getItem('tatabox_guest_session') || 'null');
  } catch (e) {}

  var result;
  if (existingSession && existingSession.username && password) {
    // 已有游客会话，验证密码后恢复
    if (typeof guestLoginWithPassword === 'function') {
      result = guestLoginWithPassword(existingSession.username, password);
    } else {
      result = guestLogin(password);
    }
  } else {
    result = guestLogin(password);
  }

  if (result && result.ok) {
    closeAuthModal();
    showStorageStatus('local');
    updateAuthUI();
showToast('已作为游客登录，数据保存在本地');
    // 游客登录后同样刷新当前受保护路由的登录态，避免停在「请先登录」页
    if (typeof _refreshCurrentProtectedRoute === 'function') {
      try {
        var guestRedirect = sessionStorage.getItem('bioquest:authRedirect');
        if (guestRedirect && Routes[guestRedirect] && (_checkRouteAccess(guestRedirect) || {}).allowed) {
          sessionStorage.removeItem('bioquest:authRedirect');
          navigateTo(guestRedirect);
        } else {
          _refreshCurrentProtectedRoute();
        }
      } catch (e) { _refreshCurrentProtectedRoute(); }
    }
  } else if (result && result.error) {
    if (errorEl) errorEl.textContent = result.error;
  }
}


/**
 * 检查注册/登录操作冷却时间
 * @returns {boolean} true 表示在冷却期内
 */
function checkAuthCooldown(action) {
  try {
    var key = 'tatabox_cooldown_' + action;
    var lastAttempt = parseInt(localStorage.getItem(key) || '0', 10);
    var now = Date.now();
    var cooldowns = { register: 30000, login: 15000, resetPassword: 60000 };
    var cooldownMs = cooldowns[action] || 30000;
    var elapsed = now - lastAttempt;
    if (elapsed < cooldownMs) {
      return { blocked: true, remaining: Math.ceil((cooldownMs - elapsed) / 1000) };
    }
    return { blocked: false, remaining: 0 };
  } catch (e) {
    return { blocked: false, remaining: 0 };
  }
}


/**
 * 更新认证操作的冷却时间戳（仅在操作成功时调用）
 */
function setAuthCooldown(action) {
  try {
    var key = 'tatabox_cooldown_' + action;
    localStorage.setItem(key, String(Date.now()));
  } catch (e) { /* 静默 */ }
}


/**
 * 处理注册
 */
async function handleRegister() {
  // 确保 supabase 脚本已加载
  if (typeof registerUser !== 'function') {
    try { await initSupabase(); } catch(e) { /* ignore */ }
  }
  var username = document.getElementById('auth-register-username').value.trim();
  var email = document.getElementById('auth-register-email').value.trim();
  var displayName = document.getElementById('auth-register-name').value.trim();
  var password = document.getElementById('auth-register-password').value;
  var errorEl = document.getElementById('auth-register-error');

  // 客户端冷却检查
  if (errorEl) {
    var cooldown = checkAuthCooldown('register');
    if (cooldown.blocked) {
      errorEl.textContent = '操作过于频繁，请 ' + cooldown.remaining + ' 秒后再试';
      return;
    }
  }

  if (!username || !password) {
    errorEl.textContent = '请填写用户名和密码';
    return;
  }
  if (username.length < 3 || username.length > 20) {
    errorEl.textContent = '用户名长度需在 3-20 位之间';
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errorEl.textContent = '用户名只能包含字母、数字、下划线';
    return;
  }
  if (email) {
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errorEl.textContent = '请输入有效的邮箱地址（或留空）';
      return;
    }
  }

  // 滑动拼图验证码（通过后 60s 内有效）
  if (!_isSlideCaptchaPassed('register')) {
    errorEl.textContent = '请先完成安全验证';
    try {
      var passed = await _showSlideCaptcha('register');
      if (!passed) {
        errorEl.textContent = '已取消安全验证';
        return;
      }
    } catch (e) {
      errorEl.textContent = '安全验证组件异常';
      return;
    }
  }

  if (typeof registerUser !== 'function') {
    errorEl.textContent = '系统未就绪，请刷新页面后重试';
    console.error('[TATABOX] registerUser 函数未定义！');
    return;
  }

  // 防止重复提交
  var btn = document.querySelector('#auth-form-register .auth-btn');
  if (btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '注册中... <span style="display:block;font-size:0.7rem;font-weight:normal;opacity:0.85;margin-top:2px;">请耐心等待，数据库在韩国</span>';
  }
  errorEl.textContent = '';

  try {
    var result = await registerUser(username, password, displayName, email);

  } catch (e) {
    console.error('[TATABOX] handleRegister 异常:', e);
    errorEl.textContent = '注册异常: ' + (e.message || String(e));
    if (btn) { btn.disabled = false; btn.textContent = '注 册'; }
    return;
  }

  // 恢复按钮
  if (btn) { btn.disabled = false; btn.textContent = '注 册'; }

  if (result && result.ok) {
    setAuthCooldown('register');
    // 重要：注册成功第一件事是展示 8 字符 user_key
    var userKey = result.userKey || (result.user && result.user.user_key) || null;
    if (userKey) {
      _showUserKeyCard(userKey, function () {
        _continueRegisterSuccess(result, password);
      });
    } else {
      _continueRegisterSuccess(result, password);
    }
  } else {
    // 不显示调试信息，只显示用户友好的错误提示
    var rawError = (result && result.error) || '注册失败';
    if (rawError.indexOf('after') !== -1 && rawError.indexOf('seconds') !== -1) {
      errorEl.textContent = '操作太频繁，请稍等片刻后再试';
    } else {
      errorEl.textContent = rawError;
    }
    _updateSlideTriggerUI(false);
  }
}


/**
 * 注册成功后的实际处理（关闭弹窗、登录）
 */
function _continueRegisterSuccess(result, password) {
  if (result.needEmailConfirm) {
    // 走兜底路径：关闭弹窗 + 跳到登录（用密码直接登录）
    closeAuthModal();
    showStorageStatus('cloud');
    if (typeof _setCurrentUser === 'function') _setCurrentUser(result.user);
showToast('注册成功！账号已激活，正在为你登录...');
    setTimeout(function () {
      // 自动用刚注册的密码登录
      var loginInput = document.getElementById('auth-login-username');
      var loginPwd = document.getElementById('auth-login-password');
      if (loginInput) loginInput.value = (result.user && result.user.username) || (result.user && result.user.email);
      if (loginPwd) loginPwd.value = password;
      if (typeof handleLogin === 'function') handleLogin();
    }, 200);
    return;
  }
  closeAuthModal();
  showStorageStatus('cloud');
  updateAuthUI();
  if (typeof _setCurrentUser === 'function') _setCurrentUser(result.user);
  var uname = (result.user || {}).username || '用户';

showToast('注册成功！欢迎加入 TATABOX');
}


/**
 * 展示 user_key 关键提示卡（用户必须点击"我已保存"才能继续）
 * @param {string} userKey
 * @param {function} onConfirm 用户确认后回调
 */
function _showUserKeyCard(userKey, onConfirm) {
  var existing = document.getElementById('userkey-card-modal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'userkey-card-modal';
  modal.innerHTML = [
    '<div class="userkey-card-overlay">',
    '  <div class="userkey-card-panel">',
    '    <h2 class="userkey-card-title">请保存你的密钥</h2>',
    '    <p class="userkey-card-sub">这是你的 8 字符密钥，用于忘记密码时验证身份</p>',
    '    <div class="userkey-card-key" id="userkey-card-key-display">' + escapeHtml(userKey) + '</div>',
    '    <div class="userkey-card-tips">',
    '      <div class="userkey-card-tip">' + BQ_ICONS.check + ' 请截图保存或抄写在纸上</div>',
    '      <div class="userkey-card-tip">' + BQ_ICONS.check + ' 不要告诉任何人</div>',
    '      <div class="userkey-card-tip">' + BQ_ICONS.check + ' 丢失后无法找回，需要重置密码</div>',
    '    </div>',
    '    <button type="button" class="userkey-card-btn" id="userkey-card-btn">我已保存密钥</button>',
    '  </div>',
    '</div>'
  ].join('');

  document.body.appendChild(modal);

  var btn = modal.querySelector('#userkey-card-btn');
  btn.addEventListener('click', function () {
    modal.remove();
    if (typeof onConfirm === 'function') onConfirm();
  });

  // 也允许点击复制
  var keyEl = modal.querySelector('#userkey-card-key-display');
  if (keyEl) {
    keyEl.addEventListener('click', function () {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(userKey).then(function () {
            keyEl.classList.add('copied');
            setTimeout(function () { keyEl.classList.remove('copied'); }, 1200);
          });
        }
      } catch (e) { /* ignore */ }
    });
    keyEl.title = '点击复制';
  }
}


/**
 * 重发验证邮件
 */
async function handleResendEmail(email) {
  var statusEl = document.getElementById('resend-email-status');
  var btn = document.getElementById('resend-email-btn');
  if (statusEl) statusEl.textContent = '发送中...';
  if (btn) btn.disabled = true;

  var result = await resendConfirmationEmail(email);
  if (result.ok) {
    if (statusEl) statusEl.textContent = '验证邮件已重新发送';
    if (statusEl) statusEl.style.color = 'var(--color-sage,#3a8c5c)';
  } else {
    if (statusEl) statusEl.textContent = result.error || '发送失败，请稍后重试';
    if (statusEl) statusEl.style.color = 'var(--color-error,#e53e3e)';
    if (btn) btn.disabled = false;
  }
  // 60秒冷却
  setTimeout(function() {
    if (btn) btn.disabled = false;
    if (statusEl) statusEl.textContent = '';
  }, 60000);
}


window.updateAuthUI = updateAuthUI;

window.showAuthModal = showAuthModal;

window.handleLogin = handleLogin;

window.handleGuestLogin = handleGuestLogin;

window.handleRegister = handleRegister;

window.handleResendEmail = handleResendEmail;

window.closeAuthModal = closeAuthModal;

window.authSwitchToLogin = authSwitchToLogin;

window.authSwitchToRegister = authSwitchToRegister;

window.authSwitchToForgot = authSwitchToForgot;

window.handleForgotPassword = handleForgotPassword;
