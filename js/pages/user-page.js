/**
 * TATABOX — 个人中心入口 / 子页 / 通知 / 分享（M-01 自 user.js 拆分）
 * ============================================================
 * 由 loadModule('user') 依赖链先于 user.js 加载；initUser 与 renderUserPage 为核心入口。
 */
'use strict';

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

/* ============== 管理员入口（只在 #/admin 页内用 TOTP 动态码验证） ============== */
function _userAdminEntry() {
  // 管理员入口不提供账号密码登录弹窗：统一跳转 #/admin，由页内「TOTP 动态码」
  // （服务端 RPC admin_login_with_totp）完成验证；账号本身为 admin 也不再自动放行。
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
      try { joined = JSON.parse(localStorage.getItem('tatabox_joined_classes') || '[]'); } catch(e) {}
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
      localStorage.setItem('tatabox_joined_classes', JSON.stringify(joined));
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
    try { localStats = JSON.parse(localStorage.getItem('tatabox_stats') || '{}'); } catch(e){}
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

window.renderUserPage = renderUserPage;
window.initUser = initUser;
window.generateShareCard = generateShareCard;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.user = BQ.user || {};
  BQ.user.page = { renderUserPage: renderUserPage, initUser: initUser, generateShareCard: generateShareCard };
})();
