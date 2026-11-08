/**
 * TATABOX — 应用启动与全局事件绑定（M-01 自 app.js 拆分）
 * ------------------------------------------------------------
 * 由 index.html 在 app.js 之后加载；DOMContentLoaded 时调用 initApp。
 * ============================================================
 */
'use strict';

function bindEvents() {
  window.addEventListener('hashchange', () => {
    const route = getRouteFromHash();
    handleRoute(route);
  });

  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-route]');
    if (link) {
      const route = link.getAttribute('data-route');
      if (route && Routes[route]) {
        e.preventDefault();
        // 解析 href 中的 ?tab=xxx 并写入 sessionStorage（绕过 hash 不能携带 query 的限制）
        try {
          var href = link.getAttribute('href') || '';
          var qIdx = href.indexOf('?');
          if (qIdx > 0) {
            var qs = href.slice(qIdx + 1);
            var params = new URLSearchParams(qs);
            var tab = params.get('tab');
            if (tab) {
              sessionStorage.setItem('bioquest:studyTab', tab);
            }
          }
        } catch (e2) { /* ignore */ }
        const target = _AppState.rootElement || document.getElementById('page-content');
        if (target) {
          target.setAttribute('data-page-transition', 'exiting');
        }
        navigateTo(route);
        closeMobileMenu();
        return;
      }
    }

    if (e.target.closest('#themeToggle') || e.target.closest('#themeToggleMobile')) {
      e.preventDefault();
      toggleTheme();
      return;
    }

    if (e.target.closest('#hamburgerBtn')) {
      e.preventDefault();
      toggleMobileMenu();
      return;
    }

    if (e.target.closest('#mobileOverlay') || e.target.closest('#mobileNavClose')) {
      closeMobileMenu();
      return;
    }

    // 排行榜按钮点击处理
    if (e.target.closest('#nav-leaderboard-btn-desktop') || e.target.closest('#nav-leaderboard-btn')) {
      e.preventDefault();
      if (typeof showLeaderboard === 'function') showLeaderboard();
      return;
    }
  });

  /* ---------- 桌面端「更多」下拉（一级导航收纳） ----------
     一级只留 6 项，其余入口收进 #headerMorePanel；分组与移动端抽屉一致。 */
  (function initHeaderMore() {
    var wrap = document.getElementById('headerMore');
    var btn = document.getElementById('headerMoreBtn');
    var panel = document.getElementById('headerMorePanel');
    if (!wrap || !btn || !panel) return;

    function setOpen(open) {
      wrap.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
    }
    function isOpen() { return btn.getAttribute('aria-expanded') === 'true'; }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!isOpen());
    });

    // 点击面板内的链接后收起（路由切换由既有 data-route 委托处理）
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });

    // 点击面板外部 / Esc / 失焦时收起
    document.addEventListener('click', function (e) {
      if (isOpen() && !wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { setOpen(false); btn.focus(); }
    });
    btn.addEventListener('blur', function () {
      // 焦点完全离开「更多」区域时收起
      setTimeout(function () {
        if (isOpen() && !wrap.contains(document.activeElement)) setOpen(false);
      }, 0);
    });
  })();

  // 底部标签栏：点击瞬间即高亮（液态玻璃胶囊立即滑动），不等路由渲染完成；
  // handleRoute 渲染后会再次定位（幂等），做到"点击→反馈"几乎零延迟。
  // 同时支持"按住滑动"：Pointer Events 拖动液滴胶着跟手（shadow 加深给出
  // 液态反馈），松手吸附最近 tab 并导航 —— 完全符合 Liquid Glass 交互预期。
  var bottomBar = document.getElementById('bottomTabBar');
  if (bottomBar) {
    var _tabDrag = null;          // 拖拽状态
    var _suppressClick = false;   // 拖拽结束吞掉随之而来的 click（避免二次导航）
    var _tabDragThreshold = 6;    // 触发拖拽的最小位移（px），小于它视为点击

    function _tabGlowEl() {
      return bottomBar.querySelector('.bottom-tab-glow');
    }
    function _tabAtCenter(cx) {
      var tabs = bottomBar.querySelectorAll('.bottom-tab');
      for (var i = 0; i < tabs.length; i++) {
        var left = tabs[i].offsetLeft, w = tabs[i].offsetWidth;
        if (cx >= left && cx <= left + w) return tabs[i];
      }
      return null;
    }
    function _tabNearest(cx) {
      var tabs = bottomBar.querySelectorAll('.bottom-tab');
      var best = null, bestD = Infinity;
      for (var i = 0; i < tabs.length; i++) {
        var c = tabs[i].offsetLeft + tabs[i].offsetWidth / 2;
        var d = Math.abs(cx - c);
        if (d < bestD) { bestD = d; best = tabs[i]; }
      }
      return best;
    }
    function _tabBarPadding() {
      var cs = window.getComputedStyle ? getComputedStyle(bottomBar) : null;
      return cs && cs.paddingLeft ? parseFloat(cs.paddingLeft) : 8;
    }

    function _tabDragStart(e) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      var glow = _tabGlowEl();
      if (!glow) return;
      // 记录按下时的 tab：指针捕获会把 click 重定向到 bar 本体（target 丢失锚点），
      // 因此拖拽结束需用这里保存的引用做导航（而非事件 target）
      var downTab = e.target && e.target.closest ? e.target.closest('.bottom-tab') : null;
      _tabDrag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startLeft: parseFloat(glow.style.left) || glow.offsetLeft || 0,
        startCenter: (parseFloat(glow.style.left) || glow.offsetLeft || 0) + glow.offsetWidth / 2,
        downTab: downTab,
        moved: false,
        captured: false
      };
      // 注意：这里不 setPointerCapture —— 一旦捕获，浏览器会把随后的 click 派发给
      // bar 本身（e.target 变成 NAV 而非锚点），普通点击的高亮会失效。
      // 捕获延后到真正产生拖拽位移时（见 _tabDragMove）。
    }

    function _tabDragMove(e) {
      if (!_tabDrag || e.pointerId !== _tabDrag.pointerId) return;
      var dx = e.clientX - _tabDrag.startX;
      if (!_tabDrag.moved) {
        if (Math.abs(dx) < _tabDragThreshold) return;
        _tabDrag.moved = true;
        bottomBar.classList.add('is-dragging');
        // 仅在真正拖动时捕获指针：拖出 bar 范围后仍能继续收到 pointermove。
        // 延迟捕获也避免普通点击被重定向（见 _tabDragStart 注）。
        if (!_tabDrag.captured) {
          _tabDrag.captured = true;
          try { bottomBar.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
      }
      e.preventDefault();
      var glow = _tabGlowEl();
      if (!glow) return;
      var pad = _tabBarPadding();
      var minL = pad;
      var maxL = bottomBar.clientWidth - glow.offsetWidth - pad;
      var left = Math.max(minL, Math.min(maxL, _tabDrag.startLeft + dx));
      // 拖动期间禁用 CSS 过渡：液滴 1:1 胶着跟手（松手后再恢复过渡做轻弹吸附）
      glow.style.transition = 'none';
      glow.style.left = left + 'px';
      _tabDrag.center = left + glow.offsetWidth / 2;
    }

    function _tabDragEnd(e) {
      if (!_tabDrag || (e && e.pointerId !== _tabDrag.pointerId)) return;
      var drag = _tabDrag;
      _tabDrag = null;
      if (drag.moved) _suppressClick = true;
      bottomBar.classList.remove('is-dragging');
      var glow = _tabGlowEl();
      if (!glow) { return; }
      // 恢复过渡（轻弹吸附用）
      glow.style.transition = '';
      if (!drag.moved) return; // 未拖动：交给原生 click 处理

      // 计算吸附目标：优先手指所在 tab；手指在间隙时吸附最近 tab
      var barRect = bottomBar.getBoundingClientRect();
      var relX = (e ? e.clientX - barRect.left : (glow.offsetLeft + glow.offsetWidth / 2));
      var target = _tabAtCenter(relX) || _tabNearest(relX);
      if (!target) return;
      // 立即高亮并平滑吸附过去
      if (typeof _setActiveBottomTab === 'function') _setActiveBottomTab(target);
      // 导航到目标 tab（hash 变更触发 handleRoute；同页 tab 无 hash 时仅高亮）
      var href = target.getAttribute('href');
      if (href && href.indexOf('#') === 0 && href !== window.location.hash) {
        try { window.location.hash = href.slice(1); } catch (err) { /* ignore */ }
      }
    }

    bottomBar.addEventListener('pointerdown', _tabDragStart);
    bottomBar.addEventListener('pointermove', _tabDragMove);
    bottomBar.addEventListener('pointerup', function (e) { _tabDragEnd(e); });
    bottomBar.addEventListener('pointercancel', function (e) { _tabDragEnd(e); });

    bottomBar.addEventListener('click', function (e) {
      // 拖拽刚结束：吞掉这次 click，避免触发默认锚点跳转（导航已由 _tabDragEnd 完成）
      if (_suppressClick) { e.preventDefault(); _suppressClick = false; return; }
      var tab = e.target && e.target.closest ? e.target.closest('.bottom-tab') : null;
      if (!tab) return;
      if (typeof _setActiveBottomTab === 'function') _setActiveBottomTab(tab);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileMenu();
      if (typeof closeLeaderboard === 'function') closeLeaderboard();
    }
  });
}

/**
 * 恢复用户设置
 */
function restoreSettings() {
  try {
    if (typeof loadSetting === 'function') {
      const theme = loadSetting('theme', 'light');
      const fontSize = loadSetting('fontSize', 'medium');
      const questionCount = loadSetting('questionCount', 30);
      const showTimer = loadSetting('showTimer', true);
      const autoSubmit = loadSetting('autoSubmit', false);

      _AppState.userSettings = { fontSize, questionCount, showTimer, autoSubmit };
      toggleTheme(theme);
    } else {
      const theme = localStorage.getItem('bioquest-theme') || 'light';
      if (theme === 'dark') {
        toggleTheme('dark');
      }
    }
  } catch (e) {
    console.warn('[TATABOX] 设置恢复失败:', e);
  }
}

/**
 * 诊断后端 API 连通性（暴露到全局供调试）
 */
window.testSupabaseAPI = async function() {

  try {
    var sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
    if (!sb) { return { status: 'error', msg: 'Supabase 未初始化' }; }
    // H-01：profiles 已收紧为本人/管理员可读，匿名探活改走公开视图
    var { data, error } = await sb.from('public_profiles').select('id,username').limit(1);
    if (error) { return { status: 'error', msg: error.message }; }

    return { status: 'ok', data: data };
  } catch (err) {

    return { status: 'error', msg: err.message };
  }
};
window._authReadyPromise = _authReadyPromise;

/**
 * 等待认证状态初始化完成（会话恢复 / 游客恢复 / 降级本地模式均已结束）。
 * 供 initUser 等需要判断登录态的模块调用，避免竞态导致的「重新登录」。
 */
window.waitAuthReady = function () { return _authReadyPromise; };

function showStorageStatus(status) {
  var existing = document.getElementById('storage-status');
  if (existing) existing.remove();

  var el = document.createElement('div');
  el.id = 'storage-status';
  var labels = {
    syncing: { text: '云端同步中...', color: '#f59e0b' },
    cloud:   { text: '云端已连接',   color: '#22c55e' },
    local:   { text: '本地存储模式', color: '#94a3b8' }
  };
  var info = labels[status] || labels.local;
  el.style.cssText = [
    'position:fixed',
    'bottom:16px',
    'right:16px',
    'z-index:9999',
    'background:' + info.color,
    'color:#fff',
    'padding:6px 12px',
    'border-radius:16px',
    'font-size:12px',
    'font-weight:500',
    'box-shadow:var(--shadow-md)',
    'pointer-events:none',
    'transition:opacity 0.3s'
  ].join(';');
  el.textContent = info.text;
  document.body.appendChild(el);

  if (status !== 'syncing') {
    setTimeout(function () {
      if (document.getElementById('storage-status') === el) {
        el.style.opacity = '0';
        setTimeout(function () { el.remove(); }, 300);
      }
    }, 3000);
  }
}

/**
 * 从云端拉取数据合并到本地
 */
/**
 * 初始化应用 — 在 DOMContentLoaded 时执行
 */
function initApp() {
  if (_AppState.initialized) {
    return;
  }

  restoreSettings();

  // P1-19：首次访问时展示隐私政策提示（一次性，可关闭；无内联脚本）
  _maybeShowPrivacyNotice();

  // 异步初始化 Supabase — 不阻塞页面首次渲染
  // 使用 requestIdleCallback 在空闲时初始化，确保首屏交互优先
  var _initSupabase = function() {
    initSupabase().catch(function(e) {
      console.warn('[TATABOX] Supabase 初始化失败，使用本地模式:', e.message);
      showStorageStatus('local');
      updateAuthUI();
    });
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(_initSupabase, { timeout: 5000 });
  } else {
    setTimeout(_initSupabase, 500);
  }

  const root = document.getElementById('page-content');
  if (!root) {
    console.error('[TATABOX] 找不到 #page-content 元素');
    return;
  }

  _AppState.rootElement = root;
  _AppState._homeHTML = root.innerHTML;

  // P1-5（Issue #102）：PWA 快捷方式 ?page= 白名单路由（读取后清理 URL）
  _applyPageQueryParam();

  const route = getRouteFromHash();

  bindEvents();

  // 空闲预加载底部标签页模块：首次点击标签时不用再等脚本网络拉取
  _prefetchTabModules();

  requestAnimationFrame(() => {
    // 路由渲染是整个启动链路的核心：任何一步抛错都不能让首屏遮罩
    // 陷入"卡 20% 直到 15s 兜底淡出"的假死状态，这里捕获并补发
    // bioquest:app-ready，让遮罩走完/淡出（页面内容随后由错误兜底渲染）。
    try {
      handleRoute(route);
    } catch (e) {
      console.error('[TATABOX] 初始路由渲染失败(已兜底):', e);
      try {
        document.dispatchEvent(new CustomEvent('bioquest:app-ready'));
      } catch (e2) { /* ignore */ }
    }
  });

  _AppState.initialized = true;

}

// M-01：显式挂载对外入口
window.initApp = initApp;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.app = BQ.app || {};
  BQ.app.boot = { initApp: initApp, bindEvents: bindEvents, restoreSettings: restoreSettings };
})();

// 启动触发与 initApp 同文件：避免 app.js 先调度 initApp 而本文件尚未加载
document.addEventListener('DOMContentLoaded', initApp);

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  setTimeout(initApp, 0);
}
