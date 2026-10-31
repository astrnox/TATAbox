/**
 * TATABOX — 路由门禁与分发（M-01 自 app.js 拆分）
 * ------------------------------------------------------------
 * 由 index.html 在 app.js 之后以 defer 加载；bindEvents 的 hashchange 运行时调用。
 * 外部入口保持 window.handleRoute 原名。
 * ============================================================
 */
'use strict';

function getRouteFromHash() {
  const hash = window.location.hash.slice(1) || '/';
  if (hash.startsWith('/')) {
    const cleanHash = hash.split('?')[0];
    return Routes[cleanHash] ? cleanHash : '/';
  }
  return '/';
}

/**
 * P1-5（Issue #102）：处理 PWA 快捷方式的 ?page= 查询参数。
 * manifest.json 的 shortcuts 指向 ./index.html?page=cards|quiz|diagnosis，
 * 此前该参数无任何消费方（点击快捷方式只会落到首页）。
 * 规则：
 *   - 仅接受白名单映射（cards→/cards、quiz→/practice、diagnosis→/diagnosis），
 *     未知值一律忽略，杜绝参数注入与任意跳转；
 *   - 显式 hash 优先级高于 ?page=（用户带 hash 进入时不覆盖）；
 *   - 用 history.replaceState 清理查询串，不产生多余历史记录。
 */
function _applyPageQueryParam() {
  try {
    if (!window.location.search) return;
    var params = new URLSearchParams(window.location.search);
    var page = params.get('page');
    // 无论是否命中白名单都清掉查询串（一次性参数，避免刷新/分享时残留）
    var baseUrl = window.location.pathname + window.location.hash;
    if (!page) {
      window.history.replaceState(null, '', baseUrl);
      return;
    }
    var PAGE_ROUTE_WHITELIST = {
      cards: '/cards',
      quiz: '/practice',      // manifest 快捷方式「模拟练习」
      diagnosis: '/diagnosis'
    };
    var target = PAGE_ROUTE_WHITELIST[String(page).toLowerCase()];
    var hasExplicitHash = !!window.location.hash && window.location.hash !== '#/' && window.location.hash !== '#';
    if (target && Routes[target] && !hasExplicitHash) {
      // 先清查询串，再设置目标 hash（异步触发 hashchange → 常规路由）
      window.history.replaceState(null, '', window.location.pathname);
      window.location.hash = target;
    } else {
      window.history.replaceState(null, '', baseUrl);
    }
  } catch (e) { /* URL API 异常时静默忽略，保持默认路由 */ }
}

/**
 * 导航到指定路由
 * @param {string} route - 目标路由路径
 * @param {Object} [options] - 导航选项
 * @param {boolean} [options.replace=false] - 是否替换当前历史记录
 */
function navigateTo(route, options = {}) {
  const { replace = false } = options;

  if (!Routes[route]) {
    console.warn(`[TATABOX] 未知路由: ${route}，回退到首页`);
    route = '/';
  }

  if (route === _AppState.currentRoute) {
    return;
  }

  if (replace) {
    window.location.replace(`#${route}`);
  } else {
    window.location.hash = route;
  }
}

window.navigateTo = navigateTo;

/**
 * 更新页面标题
 * @param {string} route - 当前路由
 */
function updatePageTitle(route) {
  const routeConfig = Routes[route];
  if (routeConfig) {
    // 首页用完整品牌语（与静态 <title> 保持一致），其余路由为「页面名 - 品牌」
    document.title = route === '/'
      ? 'TATABOX — 高中生物刷题平台'
      : `${routeConfig.title} - TATABOX 高中生物学习平台`;
  }
}

/**
 * 更新导航栏的激活状态
 * @param {string} route - 当前路由
 */
function updateNavActive(route) {
  document.querySelectorAll('.header-nav a, .mobile-nav a[data-route]').forEach((link) => {
    const linkRoute = link.getAttribute('data-route') || link.getAttribute('href');
    const normalized = linkRoute ? linkRoute.replace('#', '') : '';

    if (normalized === route || (route === '/' && (normalized === '/' || normalized === ''))) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    }
  });

  // 「更多」按钮：当前路由落在其面板内任一入口时，保持高亮，
  // 否则用户进入二级页后顶栏会"没有任何一级项亮起"。
  var moreWrap = document.getElementById('headerMore');
  if (moreWrap) {
    var activeInside = moreWrap.querySelector('a.active') !== null;
    moreWrap.classList.toggle('has-active', activeInside);
  }
}

/**
 * 练习页面渲染
 * @param {HTMLElement} target - 渲染目标元素
 */

// 路由辅助同样注册到 BQ.app.router
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.app = BQ.app || {};
  BQ.app.router = BQ.app.router || {};
  BQ.app.router.navigateTo = navigateTo;
  BQ.app.router.getRouteFromHash = getRouteFromHash;
  BQ.app.router.updatePageTitle = updatePageTitle;
  BQ.app.router.updateNavActive = updateNavActive;
})();

function _checkRouteAccess(route) {
  var cfg = Routes[route];
  if (!cfg || (!cfg.auth && !cfg.role)) return { allowed: true };
  var loggedIn = (typeof isLoggedIn === 'function') ? isLoggedIn() : false;
  if (!loggedIn) {
    return { allowed: false, reason: 'auth', route: route };
  }
  if (cfg.role) {
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user || user.user_group !== cfg.role) {
      return { allowed: false, reason: 'role', role: cfg.role, route: route };
    }
  }
  return { allowed: true };
}

/**
 * P0-1 路由访问拒绝处理：记录来源 → 在目标页内展示访问提示。
 * 不强制跳回首页、不自动弹登录框：认证会话恢复慢或被拒时，
 * 用户停留在目标页看到「请先登录/权限不足」提示，避免被误认为还要重新登录。
 */
function _denyRouteAccess(route, access) {
  console.warn('[TATABOX] 路由访问被拒绝（随登录后恢复）:', access);
  try { sessionStorage.setItem('bioquest:authRedirect', route); } catch (e) {}

  var target = (typeof _AppState !== 'undefined' && _AppState.rootElement) || document.getElementById('page-content');
  if (!target) {
    // 兜底：找不到容器时才回退为跳首页
    if (typeof navigateTo === 'function') navigateTo('/');
    else if (typeof window.location !== 'undefined') window.location.hash = '#/';
    return;
  }

  _AppState.currentRoute = route;
  try { if (typeof updatePageTitle === 'function') updatePageTitle(route); } catch (e) {}
  var denied = !!(access && access.reason === 'role');
  target.innerHTML =
    '<div class="animate-fade-in bq-center-vh" >' +
      '<div style="text-align:center;max-width:420px;padding:48px 32px;">' +
        '<div style="font-family:var(--font-serif,\'Noto Serif SC\',serif);font-size:1.4rem;font-weight:700;color:var(--color-deep,#1a3a2a);margin-bottom:8px;">' +
          (denied ? '权限不足' : '请先登录') +
        '</div>' +
        '<div style="font-size:0.9rem;color:var(--text-muted,#8a8a8a);line-height:1.7;margin-bottom:32px;">' +
          (denied ? '需要管理员权限才能访问此页面' : '登录后即可访问此页面') +
        '</div>' +
        '<div style="display:flex;gap:16px;justify-content:center;">' +
          '<button id="routeAccessLoginBtn" style="display:inline-flex;align-items:center;gap:8px;padding:14px 30px;border:none;border-radius:16px;background:var(--color-sage,#5a7d5c);color:#fff;font-size:1rem;font-weight:600;cursor:pointer;box-shadow:var(--shadow-lg);">' + (denied ? '切换账号' : '立即登录') + '</button>' +
          '<button id="routeAccessHomeBtn" style="display:inline-flex;align-items:center;gap:8px;padding:14px 30px;border:1px solid var(--border-light,#ece8e1);border-radius:16px;background:var(--bg-card,#fff);color:var(--text-primary,#1a2f1d);font-size:1rem;font-weight:600;cursor:pointer;">返回首页</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  var loginBtn = document.getElementById('routeAccessLoginBtn');
  if (loginBtn) loginBtn.addEventListener('click', function () {
    if (typeof showAuthModal === 'function') showAuthModal('login');
  });
  var homeBtn = document.getElementById('routeAccessHomeBtn');
  if (homeBtn) homeBtn.addEventListener('click', function () {
    if (typeof navigateTo === 'function') navigateTo('/');
  });
}

/**
 * 登录/登出后：若当前处于受保护路由且现在已可访问，则重新渲染以刷新登录态，
 * 避免「登录成功后仍在原页看不到用户中心 / 体验上需要再次登录」。
 */
function _refreshCurrentProtectedRoute() {
  var route = _AppState.currentRoute || (window.location.hash || '#/').replace(/^#/, '') || '/';
  var cfg = Routes[route];
  if (!cfg || (!cfg.auth && !cfg.role)) return;
  var access = _checkRouteAccess(route);
  if (access.allowed) {
    try { sessionStorage.removeItem('bioquest:authRedirect'); } catch (e) {}
    if (route === _AppState.currentRoute) {
      handleRoute(route);
    } else if (typeof navigateTo === 'function') {
      navigateTo(route);
    }
  }
}

function handleRoute(route) {
  // 路由重定向（用于合并相似模块，如 /review-deep → /wrongbook）
  var routeCfg = Routes[route];
  if (routeCfg && routeCfg.redirect) {
    // 特殊：带 redirectFlag 时，跳过 hash 跳转，直接渲染目标路由（避免 hash 丢失 query）
    if (routeCfg.redirectFlag) {
      try { sessionStorage.setItem('bioquest:redirectFlag', routeCfg.redirectFlag); } catch (e) {}
    }
    if (typeof navigateTo === 'function') {
      navigateTo(routeCfg.redirect);
    } else if (typeof window.location !== 'undefined') {
      window.location.hash = '#' + routeCfg.redirect;
    }
    return;
  }

  // P0-1 路由守卫：未登录/无权限路由拦截。
  // 需认证（auth）或需特定角色（role）的路由，在渲染前统一校验；
  // 首帧若认证尚未就绪，则等待其完成后重新判定，避免误拦截已登录用户。
  var _access = _checkRouteAccess(route);
  if (!_access.allowed) {
    if (window._authReadyDone !== true && typeof window.waitAuthReady === 'function') {
      window.waitAuthReady().then(function () {
        var again = _checkRouteAccess(route);
        if (again.allowed) {
          handleRoute(route);
        } else {
          _denyRouteAccess(route, again);
        }
      });
    } else {
      _denyRouteAccess(route, _access);
    }
    return;
  }

  // 防止递归调用导致栈溢出；同时把最新请求记下来，当前渲染结束后补跑
  if (_routingInProgress) {
    _pendingRoute = route;
    console.warn('[TATABOX] handleRoute 被递归调用，已暂存:', route);
    return;
  }
  _routingInProgress = true;
  _pendingRoute = null;

  _AppState.currentRoute = route;
  updatePageTitle(route);
  updateNavActive(route);

  // #119 路由切换播报：SPA 视图切换对屏幕阅读器不可见（无整页加载），
  // 用共享 aria-live 区播报目标页标题，让盲人用户感知导航已生效。
  if (window.BioQuestA11y && typeof window.BioQuestA11y.announce === 'function') {
    var _pageTitle = (routeCfg && routeCfg.title) ? routeCfg.title : '页面';
    window.BioQuestA11y.announce(_pageTitle + '，已加载', 'polite');
  }

  var target = _AppState.rootElement || document.getElementById('page-content');
  if (!target) {
    _routingInProgress = false;
    _flushPendingRoute();
    return;
  }

  // 清除旧状态
  target.classList.remove('animate-fade-out', 'animate-fade-in-up', 'page-content--home');
  target.style.opacity = '';
  target.style.transform = '';
  target.style.pointerEvents = '';
  target.style.visibility = '';

  // 清理全屏模块（如每日亿题）
  if (route !== '/daily-billion' && typeof window.destroyDailyBillion === 'function') {
    try { window.destroyDailyBillion(); } catch(e) { console.warn('[TATABOX] 清理daily-billion模块失败:', e); }
  }

  // 延迟加载对应模块 — 动态加载 JS 文件
  var moduleMap = {
    '/practice': 'practice',
    '/photo-quiz': 'photo-quiz',
    '/exam': 'exam',
    '/analytics': 'analytic',
    '/user': 'user',
    '/admin': 'admin',
    '/community': 'community',
    '/knowledge-graph': 'knowledge-graph',
    '/diagnosis': 'smart-diagnosis',
    '/pomodoro': 'pomodoro',
    '/habits': 'habits',
    '/review': 'review',
    '/bounties': 'bounty',
    '/wrongbook': 'wrongbook',
    '/review-deep': 'review-deep',
    '/study': 'study',
    '/videos': 'bio-video',
    '/dashboard': 'dashboard',
    '/tutor': 'tutor',
    '/discussion': 'discussion',
    '/bio-lab': 'bio-lab',
    '/phet-sims': 'phet-sims',
    '/trends': 'trends',
    '/teacher': 'teacher',
    // bio-calc.js 未在 index.html 预加载，必须经 loadModule 拉起（依赖 score-engine）
    '/bio-calc': 'bio-calc'
  };
  var modName = moduleMap[route];

  // 路由切换即时反馈：任意模块路由（含已缓存模块）在渲染完成前都先展示
  // 轻量 loading——避免"点击标签后旧页面原地保留、新页面在后台静默加载"的
  // 无反馈等待。120ms 阈值延迟展示：秒开场景（缓存模块同步渲染）不闪烁。
  var _routeFbTimer = null;
  function _showRouteLoading() {
    try { target.classList.add('route-loading'); } catch (e) {}
  }
  function _scheduleRouteLoading() {
    _clearRouteLoading();
    if (!modName || typeof window.loadModule !== 'function') return;
    _routeFbTimer = setTimeout(_showRouteLoading, 120);
  }
  function _clearRouteLoading() {
    if (_routeFbTimer) { clearTimeout(_routeFbTimer); _routeFbTimer = null; }
    try { target.classList.remove('route-loading'); } catch (e) {}
  }
  _scheduleRouteLoading();

  var renderFn = function() {
    _clearRouteLoading();
    // bio-calc 走专用渲染（内嵌模式 → #userBioCalcEmbed，否则整页）：
    // 不走 doRouteRender，它没有针对该模块的 render 分支，会静默渲染出空壳
    if (route === '/bio-calc' && typeof window.renderBioCalcPage === 'function') {
      window.renderBioCalcPage(target);
    } else {
      doRouteRender(route, target);
    }
  };

  function finishRouting() {
    _routingInProgress = false;
    _flushPendingRoute();
    // 每次路由渲染完成都广播，供"回到顶部按钮"等按路由变化的组件刷新状态
    try { document.dispatchEvent(new CustomEvent('bioquest:route-change')); } catch (e) {}
    // P1-18 修复：路由切换后把焦点移入新页面主体标题，读屏/键盘用户不必回顶重按 Tab
    _manageFocusForNewRoute();
    // 首次路由渲染完成 → 通知首屏骨架遮罩淡出（只在首次触发一次）
    if (!_AppState._appReadyDispatched) {
      var route = _AppState.currentRoute || (window.location.hash || '#/').replace(/^#/, '') || '/';
      var isHome = (route === '/' || route === '' || route === '/index.html');
      if (isHome) {
        // 首页：等 reinitHomeComponents 把 Hero/倒计时/滚动动画都绘制完成（见 reinitHomeComponents rAF 回调）
        _AppState._homeRouteRendered = true;
        // 保险兜底：若 reinitHomeComponents 没被调用或超时，500ms 后仍会发 app-ready，不让遮罩卡住
        var safetyTimer = setTimeout(function () {
          if (!_AppState._appReadyDispatched) {
            _AppState._appReadyDispatched = true;
            try { document.dispatchEvent(new CustomEvent('bioquest:app-ready')); } catch (e) {}
          }
        }, 1500);
        // 若已提前 ready（非典型路径），立刻派发并清定时器
        if (_AppState._homePaintedReady) {
          clearTimeout(safetyTimer);
          _AppState._appReadyDispatched = true;
          try { document.dispatchEvent(new CustomEvent('bioquest:app-ready')); } catch (e) {}
        }
      } else {
        // 非首页路由：首次路由渲染完即可撤遮罩
        _AppState._appReadyDispatched = true;
        try { document.dispatchEvent(new CustomEvent('bioquest:app-ready')); } catch (e) {}
      }
    }
  }

  // P1-18 修复：路由渲染完成后，把键盘/读屏焦点移到新页面主体标题。
  // 优先聚焦 #page-content 内的 h1/h2 或带 .page-title 的元素；
  // 找不到标题时聚焦容器本身。
  // 注意：标题元素默认不可聚焦，故统一加 tabindex=-1（可编程聚焦、不进 Tab 顺序），
  // 否则对 h1/h2 调用 focus() 会静默失效。模块若自行聚焦输入框，会在其后
  // setTimeout 覆盖标题焦点，因此无需抢占守卫。
  function _manageFocusForNewRoute() {
    try {
      var root = (typeof _AppState !== 'undefined' && _AppState.rootElement) || document.getElementById('page-content');
      if (!root) return;
      var targets = ['h1', '.page-title', '[role="heading"]', 'h2'];
      var el = null;
      for (var i = 0; i < targets.length; i++) {
        el = root.querySelector(targets[i]);
        if (el) break;
      }
      if (!el) el = root;
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    } catch (e) { /* 聚焦失败不影响路由渲染 */ }
  }

  function showModuleError(modName, err) {
    console.error('[TATABOX] 模块加载失败:', modName, err);
    target.innerHTML = '<div class="bq-empty-block">' +
      '<p class="bq-error-title">模块加载失败</p>' +
      '<p class="bq-note">' + escapeHtml(err && err.message ? err.message : '请检查网络或刷新页面重试') + '</p>' +
      '<button data-on=\'["_cspReload"]\' class="bq-btn--compact">刷新页面</button>' +
      '</div>';
  }

  if (modName && typeof window.loadModule === 'function') {
    window.loadModule(modName).then(function() {
      // 模块脚本执行后，再次确认初始化函数确实已暴露
      var initFnName = {
        '/practice': 'initPractice',
        '/photo-quiz': 'initPhotoQuiz',
        '/exam': 'initExam',
        '/analytics': 'initAnalytics',
        '/user': 'initUser',
        '/admin': 'initAdmin',
        '/community': 'initCommunity',
        '/knowledge-graph': 'initKnowledgeGraph',
        '/diagnosis': 'initSmartDiagnosis',
        '/pomodoro': 'initPomodoro',
        '/habits': 'initHabits',
        '/review': 'initReview',
        '/bounties': 'initBounties',
        '/wrongbook': 'initWrongbook',
        '/review-deep': 'initReviewDeep',
        '/study': 'initStudy',
        '/videos': 'initBioVideo',
        '/dashboard': 'initDashboard',
        '/tutor': 'initTutor',
        '/discussion': 'initDiscussion',
        '/bio-lab': 'initBioLab',
        '/trends': 'initTrends',
        '/teacher': 'initTeacher',
        '/data-lab': 'initScoreCalc',
        '/bio-calc': 'initBioCalc'
      }[route];
      if (initFnName && typeof window[initFnName] !== 'function') {
        // 给脚本一个微任务时间完成初始化
        setTimeout(function() {
          renderFn();
          finishRouting();
        }, 50);
        return;
      }
      renderFn();
      finishRouting();
    }).catch(function(err) {
      _clearRouteLoading();
      showModuleError(modName, err);
      finishRouting();
    });
  } else {
    renderFn();
    finishRouting();
  }
}

function _flushPendingRoute() {
  if (_pendingRoute && _pendingRoute !== _AppState.currentRoute) {
    var r = _pendingRoute;
    _pendingRoute = null;
    handleRoute(r);
  }
}

/**
 * 动态加载 JS 模块文件
 * 特性：并发去重、失败重试、超时保护、子目录自适应
 */

// M-01：显式挂载对外入口
window.handleRoute = handleRoute;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.app = BQ.app || {};
  BQ.app.router = { handleRoute: handleRoute };
})();
