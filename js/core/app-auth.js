/**
 * TATABOX — Supabase 初始化与认证流程（M-01 自 app.js 拆分）
 * ------------------------------------------------------------
 * 由 index.html 在 app.js 之后以 defer 加载；initApp 运行时调用 initSupabase，
 * 路由 /reset-password 运行时调用 renderResetPasswordPage。
 * 外部入口保持 window.initSupabase / window.renderResetPasswordPage 等原名。
 * ============================================================
 */
'use strict';

function _resolveAuthReady() {
  if (_authReadyResolve) {
    _authReadyResolve = null;
    _authReadyPromise = Promise.resolve();
    window._authReadyPromise = _authReadyPromise;
    window._authReadyDone = true;
  }
}

async function initSupabase() {
  try {
    // 等待 Supabase SDK 加载完成（由 HTML 中的 requestIdleCallback 触发加载）
    var sdkWait = 0;
    while (typeof window.supabase === 'undefined' && sdkWait < 10000) {
      await new Promise(function(r) { setTimeout(r, 200); });
      sdkWait += 200;
    }
    if (typeof window.supabase === 'undefined') {
      console.warn('[TATABOX] Supabase SDK 加载超时，使用本地模式');
      showStorageStatus('local');
      updateAuthUI();
      _resolveAuthReady();
      return;
    }

    // 动态加载 supabase 相关脚本（按依赖顺序）
    // sb-* 四件套必须随链加载（与 quiz.html 等子页面顺序一致）：
    //   sb-gamify  —— 打卡/成就/bio分/信用点；sb-data —— 错题本/复习卡/练习云同步
    //   sb-social  —— 社区动态；sb-study —— 学习记录
    // 缺失会让主 SPA 各页面的全局调用点静默失效
    var v = '20261013a';
    var supabaseScripts = [
      __jsBase + 'js/core/supabase-client.js?v=' + v,
      __jsBase + 'js/core/sb-gamify.js?v=' + v,
      __jsBase + 'js/core/sb-social.js?v=' + v,
      __jsBase + 'js/core/sb-data.js?v=' + v,
      __jsBase + 'js/core/sb-study.js?v=' + v,
      __jsBase + 'js/core/supabase.js?v=' + v,
      __jsBase + 'js/core/storage.js?v=' + v
    ];
    await __loadScriptChain(supabaseScripts);

    // 先检测 API 基地址
    if (typeof initApi === 'function') {
      await initApi();
    }

    // 恢复会话 —— 注意 await！restoreSession 是 async 函数
    var restored = await restoreSession();
    if (restored) {
      var user = getCurrentUser();

      showStorageStatus('cloud');
      updateAuthUI();
      await mergeCloudData();
      _resolveAuthReady();
      return;
    }

    // 尝试恢复游客会话
    if (typeof restoreGuestSession === 'function' && restoreGuestSession()) {

      showStorageStatus('local');
      updateAuthUI();
      _resolveAuthReady();
      return;
    }

    // 未登录用户使用本地存储
    showStorageStatus('local');
  } catch (e) {
    console.warn('[TATABOX] Supabase 初始化失败，使用本地模式:', e.message);
    showStorageStatus('local');
  }
  updateAuthUI();
  _resolveAuthReady();
}

/**
 * 打开密码设置器（从表单调用）
 * @param {string} source - 'register' | 'forgot' | 'login'
 */
function _openPasswordSetup(source) {
  _showPasswordSetup(function (pwd) {
    if (!pwd) return;
    if (source === 'register') {
      var pwdInput = document.getElementById('auth-register-password');
      if (pwdInput) pwdInput.value = pwd;
    } else if (source === 'login') {
      var pwdInput2 = document.getElementById('auth-login-password');
      if (pwdInput2) pwdInput2.value = pwd;
    } else if (source === 'forgot') {
      var pwdInput3 = document.getElementById('auth-forgot-newpassword');
      if (pwdInput3) pwdInput3.value = pwd;
    }
  });
}

function _isSlideCaptchaPassed(type) {
  if (!_slideCaptchaState.pass[type]) return false;
  if (Date.now() > _slideCaptchaState.expireAt[type]) {
    _slideCaptchaState.pass[type] = false;
    return false;
  }
  return true;
}

function _markSlideCaptchaPassed(type) {
  _slideCaptchaState.pass[type] = true;
  _slideCaptchaState.expireAt[type] = Date.now() + 60 * 1000; // 60 秒有效
}

/**
 * 弹出滑动拼图验证码
 * @param {string} type - 'login' | 'register'
 * @returns {Promise<boolean>}
 */
/**
 * 弹出滑动拼图验证码（增强版算法）
 * @param {string} type - 'login' | 'register'
 * @returns {Promise<boolean>}
 *
 * 算法优化（v2）：
 *  1. 复杂拼图（4 凸 1 凹，随机旋转）
 *  2. 随机背景纹理
 *  3. 轨迹采样：(x, y, t) 序列
 *  4. 行为分析：
 *     - 至少 N 个采样点（防止瞬移）
 *     - 速度方差 > 阈值（真人有加速/减速）
 *     - 反应时间 200ms-3s（太快=脚本）
 *     - 微调时间 50ms+（结尾的微调）
 *  5. 容差 ±5px
 *  6. 通过时间 0.5-30s
 */
/**
 * 弹出滑动拼图验证码（v3：自由移动 + 目标随机 + 无箭头）
 * @param {string} type - 'login' | 'register'
 * @returns {Promise<boolean>}
 *
 * v3 算法优化：
 *  1. 拼图可自由移动（x 和 y 都允许）
 *  2. 目标位置完全随机（x 80-220, y 20-60）
 *  3. 拖动手柄无箭头 SVG（避免视觉杂乱）
 *  4. 拼图块和手柄完全对齐（piece 即 handle）
 *  5. 复杂拼图（4 凸 1 凹）
 *  6. 轨迹采样 (x, y, t)
 *  7. 行为分析（采样点、速度方差、反应时间）
 *  8. 容差 ±5px（位置 + 垂直方向）
 */
function _showSlideCaptcha(type) {
  return new Promise(function (resolve) {
    // 移除已有的
    var existing = document.getElementById('slide-captcha-modal');
    if (existing) existing.remove();

    var containerWidth = 280;
    var containerHeight = 120;
    var pieceSize = 44;
    // 目标位置完全随机（不仅 x，y 也随机）
    var targetX = 60 + Math.floor(Math.random() * 160); // 60-220
    var targetY = 18 + Math.floor(Math.random() * 50);  // 18-68

    // 复杂拼图形状（4 凸 1 凹 + 缺角）
    var piecePath = 'M2,2 L18,2 L18,8 L26,8 L26,18 L36,18 L36,30 L26,30 L26,38 L18,38 L18,42 L2,42 Z';

    // 随机背景纹理
    var bgSeed = Math.floor(Math.random() * 100000);
    var dotCount = 12 + Math.floor(Math.random() * 8);
    var dots = '';
    for (var i = 0; i < dotCount; i++) {
      var dx = 10 + Math.floor(Math.random() * (containerWidth - 20));
      var dy = 10 + Math.floor(Math.random() * (containerHeight - 20));
      var dr = 2 + Math.floor(Math.random() * 3);
      var doC = Math.random() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)';
      dots += '<circle cx="' + dx + '" cy="' + dy + '" r="' + dr + '" fill="' + doC + '"/>';
    }

    var modal = document.createElement('div');
    modal.id = 'slide-captcha-modal';
    modal.innerHTML = [
      '<div class="slide-cap-overlay">',
      '  <div class="slide-cap-panel">',
      '    <div class="slide-cap-title">安全验证<span class="slide-cap-sub">拖动拼图到缺口位置（自由移动）</span></div>',
      '    <div class="slide-cap-stage" id="slide-cap-stage" style="width:' + containerWidth + 'px;height:' + containerHeight + 'px;">',
      '      <svg class="slide-cap-bg" viewBox="0 0 ' + containerWidth + ' ' + containerHeight + '" xmlns="http://www.w3.org/2000/svg">',
      '        <defs>',
      '          <linearGradient id="slideGrad' + bgSeed + '" x1="0" y1="0" x2="1" y2="1">',
      '            <stop offset="0" stop-color="#3a8c5c"/>',
      '            <stop offset="0.5" stop-color="#5a7d5c"/>',
      '            <stop offset="1" stop-color="#1a3a2a"/>',
      '          </linearGradient>',
      '          <pattern id="slidePattern' + bgSeed + '" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">',
      '            <circle cx="10" cy="10" r="1.5" fill="rgba(255,255,255,0.15)"/>',
      '          </pattern>',
      '        </defs>',
      '        <rect width="' + containerWidth + '" height="' + containerHeight + '" fill="url(#slideGrad' + bgSeed + ')"/>',
      '        <rect width="' + containerWidth + '" height="' + containerHeight + '" fill="url(#slidePattern' + bgSeed + ')"/>',
      '        <text x="' + (containerWidth / 2) + '" y="' + (containerHeight / 2 + 12) + '" text-anchor="middle" fill="rgba(255,255,255,0.32)" font-size="38" font-weight="900" font-family="monospace">TATABOX</text>',
      '        ' + dots,
      '        <!-- 缺口：显示为半透明深色，提示目标位置 -->',
      '        <path d="' + piecePath + '" transform="translate(' + targetX + ',' + targetY + ')" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.85)" stroke-width="2.5"/>',
      '        <!-- 缺口装饰虚线框 -->',
      '        <rect x="' + (targetX - 2) + '" y="' + (targetY - 2) + '" width="40" height="46" fill="none" stroke="rgba(58,140,92,0.55)" stroke-width="1" stroke-dasharray="3,2"/>',
      '      </svg>',
      '      <!-- 拼图块（即可拖动，无内嵌箭头） -->',
      '      <div class="slide-cap-piece slide-cap-handle" id="slide-cap-piece" style="left:6px;top:6px;width:38px;height:42px;">',
      '        <svg viewBox="0 0 38 44" xmlns="http://www.w3.org/2000/svg" width="38" height="42">',
      '          <path d="' + piecePath + '" fill="rgba(255,255,255,0.95)" stroke="#1a3a2a" stroke-width="1.5"/>',
      '        </svg>',
      '      </div>',
      '      <!-- 进度条（底部） -->',
      '      <div class="slide-cap-track-bottom">',
      '        <div class="slide-cap-progress" id="slide-cap-progress"></div>',
      '      </div>',
      '      <div class="slide-cap-status" id="slide-cap-status">拖动拼图到缺口</div>',
      '    </div>',
      '    <div class="slide-cap-actions">',
      '      <button type="button" class="slide-cap-retry" id="slide-cap-retry">换一张</button>',
      '      <button type="button" class="slide-cap-cancel" id="slide-cap-cancel">取消</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);

    var piece = modal.querySelector('#slide-cap-piece');
    var progress = modal.querySelector('#slide-cap-progress');
    var status = modal.querySelector('#slide-cap-status');
    var startTime = 0;
    var dragging = false;
    var startMouseX = 0;
    var startMouseY = 0;
    var currentX = 6;
    var currentY = 6;
    var pass = false;
    var resolved = false;

    // 轨迹采样
    var trace = [];
    var lastMoveTime = 0;
    var moveSampleMin = 4;
    var reactTimeMin = 200;
    var failCount = (window._slideCaptchaFailCount || 0) + 1;
    window._slideCaptchaFailCount = failCount;
    var tolerance = failCount >= 3 ? 2 : (failCount >= 2 ? 3 : 5);

    function close(result) {
      if (resolved) return;
      resolved = true;
      modal.remove();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      if (result) window._slideCaptchaFailCount = 0;
      resolve(result);
    }

    function recordTrace(dx, dy, t) {
      if (t - lastMoveTime < 30 && trace.length > 0) return;
      lastMoveTime = t;
      trace.push({ x: dx, y: dy, t: t });
    }

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function onMouseDown(e) {
      if (pass) return;
      dragging = true;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      startTime = Date.now();
      trace = [{ x: 0, y: 0, t: 0 }];
      piece.classList.add('dragging');
      e.preventDefault();
    }
    function onTouchStart(e) {
      if (pass) return;
      dragging = true;
      startMouseX = e.touches[0].clientX;
      startMouseY = e.touches[0].clientY;
      startTime = Date.now();
      trace = [{ x: 0, y: 0, t: 0 }];
      piece.classList.add('dragging');
      e.preventDefault();
    }
    function onMouseMove(e) {
      if (!dragging) return;
      var dx = e.clientX - startMouseX;
      var dy = e.clientY - startMouseY;
      var maxX = containerWidth - 38 - 6;
      var maxY = containerHeight - 42 - 6;
      currentX = clamp(6 + dx, 6, maxX);
      currentY = clamp(6 + dy, 6, maxY);
      piece.style.left = currentX + 'px';
      piece.style.top = currentY + 'px';
      // 进度条按 x 距离算
      var distX = Math.abs(currentX - targetX);
      var maxDistX = Math.max(targetX - 6, maxX - targetX);
      progress.style.width = Math.max(0, 100 - distX / maxDistX * 100) + '%';
      recordTrace(dx, dy, Date.now() - startTime);
    }
    function onTouchMove(e) {
      if (!dragging) return;
      var dx = e.touches[0].clientX - startMouseX;
      var dy = e.touches[0].clientY - startMouseY;
      var maxX = containerWidth - 38 - 6;
      var maxY = containerHeight - 42 - 6;
      currentX = clamp(6 + dx, 6, maxX);
      currentY = clamp(6 + dy, 6, maxY);
      piece.style.left = currentX + 'px';
      piece.style.top = currentY + 'px';
      var distX = Math.abs(currentX - targetX);
      var maxDistX = Math.max(targetX - 6, maxX - targetX);
      progress.style.width = Math.max(0, 100 - distX / maxDistX * 100) + '%';
      recordTrace(dx, dy, Date.now() - startTime);
    }
    function analyzeBehavior(elapsed) {
      if (elapsed < reactTimeMin) return '操作过快（疑似脚本）';
      if (elapsed > 30000) return '已超时，请重试';
      if (trace.length < moveSampleMin) return '操作过于单一，请用鼠标拖动';
      if (trace.length >= 4) {
        var speeds = [];
        for (var i = 1; i < trace.length; i++) {
          var dt = trace[i].t - trace[i-1].t || 1;
          var ddx = trace[i].x - trace[i-1].x;
          var ddy = trace[i].y - trace[i-1].y;
          speeds.push(Math.sqrt(ddx * ddx + ddy * ddy) / dt);
        }
        var mean = 0;
        for (var j = 0; j < speeds.length; j++) mean += speeds[j];
        mean /= speeds.length;
        var variance = 0;
        for (var k = 0; k < speeds.length; k++) variance += (speeds[k] - mean) * (speeds[k] - mean);
        variance /= speeds.length;
        var std = Math.sqrt(variance);
        if (mean > 0 && std / mean < 0.15 && failCount < 3) {
          return '操作过于机械，请自然拖动';
        }
      }
      return null;
    }
    function finish() {
      if (!dragging || pass) return;
      dragging = false;
      piece.classList.remove('dragging');
      var elapsed = Date.now() - startTime;
      var diffX = Math.abs(currentX - targetX);
      var diffY = Math.abs(currentY - targetY);
      var diff = Math.sqrt(diffX * diffX + diffY * diffY);

      var behaviorErr = analyzeBehavior(elapsed);
      if (behaviorErr) {
        status.textContent = behaviorErr + '（' + failCount + '/3）';
        status.className = 'slide-cap-status err';
        if (failCount >= 3) status.textContent = '行为异常，请刷新页面后重试';
        resetPosition();
        return;
      }

      if (diff > tolerance) {
        status.textContent = '位置偏差 ' + Math.round(diff) + 'px（容差 ±' + tolerance + 'px），请重试';
        status.className = 'slide-cap-status err';
        resetPosition();
        return;
      }
      pass = true;
      status.textContent = '验证通过';
      status.className = 'slide-cap-status ok';
      piece.classList.add('passed');
      _markSlideCaptchaPassed(type);
      setTimeout(function () { close(true); }, 400);
    }
    function onMouseUp() { finish(); }
    function onTouchEnd() { finish(); }
    function resetPosition() {
      piece.style.transition = 'left 0.3s, top 0.3s';
      piece.style.left = '6px';
      piece.style.top = '6px';
      progress.style.transition = 'width 0.3s';
      progress.style.width = '0%';
      setTimeout(function () {
        piece.style.transition = '';
        progress.style.transition = '';
      }, 300);
    }

    function onRetry() {
      if (pass) return;
      modal.remove();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      if (!resolved) {
        resolved = true;
        _showSlideCaptcha(type).then(resolve);
      }
    }

    piece.addEventListener('mousedown', onMouseDown);
    piece.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    modal.querySelector('#slide-cap-retry').addEventListener('click', onRetry);
    modal.querySelector('#slide-cap-cancel').addEventListener('click', function () { close(false); });
  });
}

/**
 * 切换密码输入框的明文/密文显示（眼睛图标按钮）
 * 通过 data-on 委托调用：data-on='["_toggleAuthPwd", "输入框id"]'
 * @param {string} inputId 密码输入框的 DOM id
 */
function _toggleAuthPwd(inputId) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  // 更新按钮的无障碍标签与眼睛图标（闭眼状态）
  var btn = (this && this.tagName === 'BUTTON') ? this : null;
  if (btn) {
    btn.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
    btn.setAttribute('title', show ? '隐藏密码' : '显示密码');
    var icon = btn.querySelector('.auth-pwd-toggle-icon');
    if (icon) {
      icon.innerHTML = show
        ? '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'
        : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="2" y1="2" x2="22" y2="22"/>';
    }
  }
  // 保持焦点在输入框，便于继续输入
  input.focus();
}

/**
 * 排行榜独立页面渲染（/leaderboard 路由）
 */
/**
 * 重置密码页面（从邮件链接跳转）
 */
function renderResetPasswordPage(target) {
  target.innerHTML = '<div style="max-width:400px;margin:60px auto;padding:32px 24px;background:var(--card-bg,#1a1f1c);border-radius:16px;border:1px solid rgba(58,140,92,0.15);">' +
    '<h2 style="text-align:center;font-size:1.2rem;margin-bottom:8px;color:var(--color-sage,#3a8c5c);">设置新密码</h2>' +
    '<p style="text-align:center;font-size:0.85rem;color:var(--text-secondary,#8a8a8a);margin-bottom:20px;">请输入您的新密码</p>' +
    '<input type="password" class="auth-input" id="reset-new-password" placeholder="新密码（至少6位）" autocomplete="new-password" style="margin-bottom:12px;width:100%;box-sizing:border-box;">' +
    '<input type="password" class="auth-input" id="reset-confirm-password" placeholder="确认新密码" autocomplete="new-password" style="margin-bottom:16px;width:100%;box-sizing:border-box;">' +
    '<button class="auth-btn" data-on=\'["handleResetPasswordSubmit"]\'>确认修改</button>' +
    '<p id="reset-password-error" class="auth-error"></p>' +
  '</div>';
}
window.renderResetPasswordPage = renderResetPasswordPage;

/**
 * 提交新密码
 */
async function handleResetPasswordSubmit() {
  var newPwd = document.getElementById('reset-new-password').value;
  var confirmPwd = document.getElementById('reset-confirm-password').value;
  var errorEl = document.getElementById('reset-password-error');

  if (!newPwd || newPwd.length < 6) {
    errorEl.textContent = '密码至少6位';
    return;
  }
  if (newPwd !== confirmPwd) {
    errorEl.textContent = '两次输入的密码不一致';
    return;
  }

  errorEl.textContent = '';
  var sb = typeof getSupabase === 'function' ? getSupabase() : null;
  if (!sb) {
    errorEl.textContent = '系统未初始化，请刷新页面';
    return;
  }

  try {
    var { error } = await sb.auth.updateUser({ password: newPwd });
    if (error) {
      errorEl.textContent = error.message.includes('same') ? '新密码不能与旧密码相同' : '修改失败：' + error.message;
      return;
    }
    var target = _AppState.rootElement || document.getElementById('page-content');
    if (target) {
      target.innerHTML = '<div style="text-align:center;padding:80px 20px;">' +
        '<div style="font-size:3rem;margin-bottom:16px;">&#10003;</div>' +
        '<h2 style="font-size:1.3rem;margin-bottom:8px;color:var(--color-sage,#3a8c5c);">密码修改成功</h2>' +
        '<p style="font-size:0.9rem;color:var(--text-secondary,#8a8a8a);margin-bottom:24px;">请使用新密码登录</p>' +
        '<button data-on=\'["_cspGotoHash","/"]\' style="background:var(--color-sage,#3a8c5c);color:#fff;border:none;padding:10px 24px;border-radius:16px;cursor:pointer;font-size:0.9rem;">返回首页</button>' +
      '</div>';
    }
  } catch (e) {
    errorEl.textContent = '修改失败，请稍后重试';
  }
}
window.handleResetPasswordSubmit = handleResetPasswordSubmit;

// M-01：显式挂载对外入口
window.initSupabase = initSupabase;
window.renderResetPasswordPage = renderResetPasswordPage;
window.handleResetPasswordSubmit = handleResetPasswordSubmit;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.app = BQ.app || {};
  BQ.app.auth = { initSupabase: initSupabase, renderResetPasswordPage: renderResetPasswordPage, handleResetPasswordSubmit: handleResetPasswordSubmit };
})();
