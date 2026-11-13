/**
 * TATABOX — 动态模块加载与路由渲染（M-01 自 app.js 拆分）
 * ------------------------------------------------------------
 * 由 index.html 在 app.js 之后、app-router.js 之后以 defer 加载；
 * handleRoute 运行时调用 doRouteRender。window.loadModule 入口保持不变。
 * ============================================================
 */
'use strict';

var _loadedModules = {};
var _loadingModules = {};

function _resolveModuleUrl(modName) {
    // 适配子目录部署：取当前页面最后一个 js/core/app.js 的目录作为基路径
    var base = '';
    var scripts = document.querySelectorAll('script[src*="js/core/app.js"]');
    if (scripts.length > 0) {
      var src = scripts[scripts.length - 1].src;
      base = src.substring(0, src.lastIndexOf('/js/core/app.js'));
      if (base) base += '/';
    }
    // 使用 app.js 自己的版本号作为 query string，避免 head 中预加载的脚本与动态加载版本不一致
    var appScript = scripts.length > 0 ? scripts[scripts.length - 1] : null;
    var ver = '20260809i';
    if (appScript && appScript.src) {
      var m = appScript.src.match(/[?&]v=([\w-]+)/);
      if (m) ver = m[1];
    }
    return base + 'js/' + _moduleDir(modName) + '/' + modName + '.js?v=' + ver;
  }

// 模块名 → 子目录（js/ 下的分类存放）。页面模块默认在 pages/，其余显式归属。
function _moduleDir(modName) {
  var core = { 'app': 1, 'app-routes': 1, 'boot-mask': 1, 'boot-lazy': 1, 'sw-register': 1,
    'theme-init': 1, 'theme-transition': 1, 'config': 1, 'utils': 1, 'storage': 1, 'rating': 1,
    'supabase': 1, 'supabase-client': 1, 'loader': 1, 'question-utils': 1, 'question-model': 1, 'event-bus': 1,
    'csp-events': 1, 'error-recovery': 1, 'empty-state': 1, 'a11y-utils': 1, 'sync-tabs': 1,
    'cell-loader': 1, 'lazy-images': 1, 'offline-queue': 1, 'offline-status': 1, 'offline-bank': 1,
    'shortcut-panel': 1, 'hamburger': 1, 'micro-details': 1,
    'score-engine': 1, 'credit-metrics': 1 };
  var algo = { 'fsrs-algorithm': 1, 'fsrs-optimizer': 1, 'irt-engine': 1 };
  var ai = { 'ai-client': 1, 'ai-key-store': 1, 'ai-diagnostic-engine': 1, 'smart-diagnosis': 1, 'multi-agent': 1 };
  var admin = { 'admin': 1, 'admin-users': 1, 'admin-questions': 1, 'admin-cards': 1,
    'admin-community': 1, 'admin-ebook': 1, 'admin-ops': 1, 'admin-ocr': 1, 'admin-aigen': 1 };
  var engagement = { 'achievements': 1, 'badge-motifs': 1, 'eggs': 1, 'countdown': 1,
    'soundscape': 1, 'social-impact': 1, 'mood-tracker': 1, 'points-ui': 1,
    'notifications': 1, 'whiteboard': 1, 'tts': 1 };
  // H-04：仅特定路由使用的集成模块改为路由级懒加载（由 Routes[route].module 驱动）。
  var integrations = { 'community-enhanced': 1, 'ai-chat-enhanced': 1, 'molecule-viewer': 1,
    'rdkit-viewer': 1, 'sketch-pad': 1, 'genome-browser': 1, 'ocr-engine': 1,
    'diagram-renderer': 1, 'data-store': 1, 'irt-enhanced': 1, 'bkt-engine': 1,
    'vendor-init': 1 };
  if (core[modName]) return 'core';
  if (algo[modName]) return 'algo';
  if (ai[modName]) return 'ai';
  if (admin[modName]) return 'admin';
  if (engagement[modName]) return 'engagement';
  if (integrations[modName]) return 'integrations';
  return 'pages';
}

// 模块依赖表：加载某模块前先加载其依赖
var _moduleDeps = {
  // M-01：practice 分享/深链、拉取题目、筛选面板、答题渲染子模块先行加载，practice.js 保持原有全局入口
  // 知识图谱页内含「代谢网络」子视图（独立渲染模块）
  'knowledge-graph': ['metabolic-map'],
  'practice': ['practice-share', 'practice-pull', 'practice-filters', 'practice-quiz',
    'practice-data', 'practice-rating', 'practice-session', 'practice-redo', 'practice-input',
    'practice-sync', 'practice-styles', 'practice-helpers', 'practice-page',
    'question-model', 'question-utils', 'loader', 'rating'],
  // M-01：user 面板子模块先行加载，user.js 保留全局入口与共享工具
  'user': ['user-styles', 'user-avatar', 'user-profile', 'user-ai-key', 'user-points', 'user-data', 'user-panels', 'user-page'],
  'exam': ['question-model', 'question-utils', 'loader'],
  'review': ['question-model', 'question-utils', 'loader'],
  'wrongbook': ['question-model', 'question-utils', 'loader', 'review-deep'],
  'review-deep': ['question-model', 'question-utils', 'loader'],
  'admin': ['rating', 'question-model'],
  // 模块名为 'smart-diagnosis'（app-routes /diagnosis 的 module 字段），
  // 此前误写成 'diagnosis' 导致依赖声明永不命中
  'smart-diagnosis': ['question-model'],
  'daily-billion': ['question-model', 'score-engine'],
  'analytics': ['score-engine'],
  // 键必须与 app-routes.js '/analytics' 的 module:'analytic' 一致（同 diagnosis 死键教训）
  'analytic': ['score-engine'],
  'bio-calc': ['score-engine'],
  'score-calc': ['score-engine', 'credit-metrics']
};

// 模块名 → 初始化函数名（用于检测 head 中预加载的脚本是否已注册 init）
function modNameToInitFn(modName) {
  var map = {
    'practice': 'initPractice',
    'exam': 'initExam',
    'analytics': 'initAnalytics',
    'user': 'initUser',
    'admin': 'initAdmin',
    'community': 'initCommunity',
    'knowledge-graph': 'initKnowledgeGraph',
    'smart-diagnosis': 'initSmartDiagnosis',
    'pomodoro': 'initPomodoro',
    'habits': 'initHabits',
    'review': 'initReview',
    'bounties': 'initBounties',
    'wrongbook': 'initWrongbook',
    'review-deep': 'initReviewDeep',
    'study': 'initStudy',
    'bio-video': 'initBioVideo',
    'dashboard': 'initDashboard',
    'tutor': 'initTutor',
    'discussion': 'initDiscussion',
    'bio-lab': 'initBioLab',
    'phet-sims': 'initPhetSims',
    'trends': 'initTrends',
    'teacher': 'initTeacher',
    'photo-quiz': 'initPhotoQuiz',
    'learning-hub': 'initLearningHub',
    'daily-billion': 'initDailyBillion',
    'score-calc': 'initScoreCalc',
    'bio-calc': 'initBioCalc'
  };
  return map[modName];
}

window.loadModule = function(modName, options) {
  options = options || {};
  if (_loadedModules[modName]) return Promise.resolve();
  if (_loadingModules[modName]) return _loadingModules[modName];

  // 先加载依赖模块
  var deps = _moduleDeps[modName] || [];
  var depsPromise = deps.length > 0
    ? Promise.all(deps.map(function(d) { return window.loadModule(d, options); }))
    : Promise.resolve();

  _loadingModules[modName] = depsPromise.then(function() {
    var maxRetries = options.maxRetries || 2;
    var timeoutMs = options.timeout || 15000;
    return new Promise(function(resolve, reject) {
    var attempt = 0;
    var script = null;
    var timer = null;

    function cleanup() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    function onSuccess() {
      cleanup();
      _loadedModules[modName] = true;
      delete _loadingModules[modName];
      resolve();
    }

    function onFailure(err) {
      cleanup();
      attempt++;
      if (attempt <= maxRetries) {
        setTimeout(loadOnce, 300 * attempt);
      } else {
        delete _loadingModules[modName];
        reject(err || new Error('Failed to load module: ' + modName));
      }
    }

    function loadOnce() {
      // 防御性检查：如果对应 script 标签已经在 head 中，跳过动态加载
      // 精确匹配模块自身路径（忽略 query 版本号）：裸文件名匹配会被同名后缀的
      // 核心脚本误命中（如 sb-study.js 匹配 "study.js"），导致 study.js 永远
      // 不被注入、initStudy 3 秒后被误判为「已加载」而报初始化函数未找到。
      var targetUrl = _resolveModuleUrl(modName);
      // 模块固定路径片段（如 /js/pages/study.js）：绝对/相对 src 都能归一比较
      var modPath = '/js/' + _moduleDir(modName) + '/' + modName + '.js';
      var existing = null;
      var allScripts = document.querySelectorAll('script[src]');
      for (var si = 0; si < allScripts.length; si++) {
        var rawSrc = allScripts[si].getAttribute('src') || '';
        // 归一为绝对 pathname（丢弃 query/hash）；URL 构造异常时退回手动去 query，
        // 并补前导 '/'，否则相对 src（"js/pages/study.js"）的 slice 前缀比较会永远不命中
        var srcPath;
        try { srcPath = new URL(rawSrc, document.baseURI).pathname; }
        catch (e) { srcPath = rawSrc.split('?')[0].split('#')[0]; }
        if (srcPath.charAt(0) !== '/') srcPath = '/' + srcPath;
        if (srcPath.slice(-modPath.length) === modPath) {
          existing = allScripts[si];
          break;
        }
      }
      if (existing) {
        // 已经在 head 中预加载，等待初始化函数暴露
        var waitStart = Date.now();
        var initFnName = modNameToInitFn(modName);
        function tryFinish() {
          if (initFnName && typeof window[initFnName] === 'function') {
            onSuccess();
          } else if (Date.now() - waitStart < 3000) {
            setTimeout(tryFinish, 50);
          } else {
            // 3s 后仍未暴露，假定已经加载完成（init 函数可能在路由分支中才注册）
            onSuccess();
          }
        }
        tryFinish();
        return;
      }
      script = document.createElement('script');
      script.src = targetUrl;
      script.async = true;

      timer = setTimeout(function() {
        timer = null;
        onFailure(new Error('加载模块超时: ' + modName));
      }, timeoutMs);

      script.onload = onSuccess;
      script.onerror = function() {
        onFailure(new Error('加载模块失败: ' + modName));
      };

      document.head.appendChild(script);
    }

    loadOnce();
    });
  });

  return _loadingModules[modName];
};

var _doRouteRenderCount = 0;

/**
 * 渲染模块初始化错误提示
 */
function _renderModuleError(target, route, err) {
  try {
    target.innerHTML = '<div class="bq-empty-block">' +
      '<p class="bq-error-title">页面加载失败</p>' +
      '<p class="bq-note">' +
      escapeHtml((err && err.message) ? err.message : '模块初始化异常，请刷新页面重试') +
      '</p>' +
      '<button data-on=\'["_cspReload"]\' style="padding:8px 20px;background:var(--color-sage);color:#fff;border:none;border-radius:8px;cursor:pointer;margin-right:8px;">刷新页面</button>' +
      '<button data-on=\'["_cspGotoHash","/"]\' style="padding:8px 20px;background:transparent;border:1px solid var(--color-sage);color:var(--color-sage);border-radius:8px;cursor:pointer;">返回首页</button>' +
      '</div>';
  } catch (e2) { /* ignore */ }
}

function _showModuleLoading(target, initFnName) {
  try {
    if (!target) return;
    target.innerHTML = '<div class="bq-empty-block">' +
      '<div style="display:inline-block;width:32px;height:32px;border:3px solid rgba(0,0,0,0.1);border-top-color:var(--color-sage,#5a7d5c);border-radius:50%;animation:spin 0.8s linear infinite;"></div>' +
      '<p style="color:var(--text-muted);font-size:0.9rem;margin-top:16px;">加载中...</p>' +
      '</div>' +
      '<style>@keyframes spin { to { transform: rotate(360deg); } }</style>';
  } catch (e) {}
}

/**
 * 安全调用模块初始化函数
 * 修复：增加 try-catch + 栈深度检测，防止模块初始化内部同步重入导致栈溢出
 */
function _safeInit(initFnName, route, target) {
  // 同一 init 函数在同一调用栈中只允许执行一次，避免同步递归
  var _initDepthKey = '_initDepth_' + initFnName;
  var _depth = window[_initDepthKey] || 0;
  if (_depth > 3) {
    console.error('[TATABOX] 模块初始化递归检测 (depth=' + _depth + '):', route, initFnName);
    _renderModuleError(target, route, new Error('模块初始化递归过深: ' + initFnName));
    return;
  }
  window[_initDepthKey] = _depth + 1;
  // 异步加载的模块：如果 init 函数尚未就绪，等待其脚本加载（Bust 缓存版本号随修改同步升级）
  if (typeof window[initFnName] !== 'function') {
    var _pendingModules = {
      'initAdmin': 'admin',
      'initCommunity': 'community',
      'initUser': 'user'
    };
    var modName = _pendingModules[initFnName];
    if (modName) {
      _showModuleLoading(target, initFnName);
      var _script = document.createElement('script');
      _script.src = 'js/' + _moduleDir(modName) + '/' + modName + '.js?v=20260814c';
      _script.onload = function() {
        if (typeof window[initFnName] === 'function') {
          try { window[initFnName](target); } catch (e) { console.error(e); }
        }
      };
      document.head.appendChild(_script);
      return;
    }
  }
  try {
    if (typeof window[initFnName] === 'function') {
      try {
        window[initFnName](target);
      } catch (err) {
        console.error('[TATABOX] 模块初始化失败:', route, initFnName, err);
        _renderModuleError(target, route, err);
      }
    } else {
      console.error('[TATABOX] 模块初始化函数未找到:', route, initFnName);
      _renderModuleError(target, route, new Error('模块初始化函数未找到: ' + initFnName));
    }
  } finally {
    window[_initDepthKey] = _depth;
  }
}

function doRouteRender(route, target) {
  _doRouteRenderCount++;
  if (_doRouteRenderCount > 5) {
    var recErr = new Error('[TATABOX] doRouteRender 递归检测! count=' + _doRouteRenderCount + ' route=' + route);
    console.error(recErr.stack);
    _doRouteRenderCount = 0;
    return;
  }
  try {
    // 权限检查（仅用于需要登录才能查看的页面；社区允许游客浏览，发帖/评论在社区模块内部校验）
    var routePermissions = {
      '/exam': 'guest',
      '/practice': 'guest',
      '/community': 'guest',
      '/analytics': 'verified'
    };
    var requiredGroup = routePermissions[route];
    if (requiredGroup && typeof hasPermission === 'function' && !hasPermission(requiredGroup)) {
      var groupLabels = { admin: '管理员', premium: '高级会员', verified: '认证会员', member: '普通会员', guest: '访客' };
      target.innerHTML = '<div class="bq-empty-block">' +
        '<div style="font-size:48px;margin-bottom:16px;opacity:0.3;">需要登录</div>' +
        '<h2 style="font-size:20px;font-weight:600;margin-bottom:8px;">权限不足</h2>' +
        '<p style="font-size:14px;color:var(--text-secondary);margin-bottom:20px;">此功能需要【' + (groupLabels[requiredGroup] || requiredGroup) + '】及以上权限</p>' +
        '<button data-on=\'["_cspShowAuth"]\' style="background:var(--color-sage);color:#fff;border:none;padding:10px 24px;border-radius:16px;cursor:pointer;">升级权限</button>' +
        '</div>';
      return;
    }

    switch (route) {
      case '/':
        target.classList.add('page-content--home');
        if (_AppState._homeHTML) {
          target.innerHTML = _AppState._homeHTML;
          reinitHomeComponents();
        }
        break;
      case '/practice':
        _safeInit('initPractice', route, target);
        break;
      case '/photo-quiz':
        _safeInit('initPhotoQuiz', route, target);
        break;
      case '/exam':
        _safeInit('initExam', route, target);
        break;
      case '/analytics':
        _safeInit('initAnalytics', route, target);
        break;
      case '/user':
        _safeInit('initUser', route, target);
        break;
      case '/privacy':
        renderPrivacyPage(target);
        break;
      case '/search':
        renderSearchPage();
        break;
      case '/admin':
        _safeInit('initAdmin', route, target);
        break;
      case '/cards':
        renderCardsPage();
        break;
      case '/community':
        _safeInit('initCommunity', route, target);
        break;
      case '/leaderboard':
        renderLeaderboardPage(target);
        break;
      case '/points-leaderboard':
      case '/credit-leaderboard':
        // points-ui.js -> window.initCreditLeaderboard
        if (typeof window.initCreditLeaderboard === 'function') {
          window.initCreditLeaderboard(target);
        } else {
          _renderModuleError(target, route, new Error('points-ui 模块未加载'));
        }
        break;
      case '/points-shop':
      case '/credit':
        // points-ui.js -> window.initCreditCenter
        if (typeof window.initCreditCenter === 'function') {
          window.initCreditCenter(target);
        } else {
          _renderModuleError(target, route, new Error('points-ui 模块未加载'));
        }
        break;
      case '/knowledge-graph':
        _safeInit('initKnowledgeGraph', route, target);
        break;
      case '/diagnosis':
        _safeInit('initSmartDiagnosis', route, target);
        break;
      case '/pomodoro':
        _safeInit('initPomodoro', route, target);
        break;
      case '/habits':
        _safeInit('initHabits', route, target);
        break;
      case '/review':
        _safeInit('initReview', route, target);
        break;
      case '/bounties':
        _safeInit('initBounties', route, target);
        break;
      case '/wrongbook':
        _safeInit('initWrongbook', route, target);
        break;
      case '/review-deep':
        _safeInit('initReviewDeep', route, target);
        break;
      case '/study':
        _safeInit('initStudy', route, target);
        break;
      case '/videos':
        _safeInit('initBioVideo', route, target);
        break;
      case '/dashboard':
        _safeInit('initDashboard', route, target);
        break;
      case '/tutor':
        _safeInit('initTutor', route, target);
        break;
      case '/discussion':
        _safeInit('initDiscussion', route, target);
        break;
      case '/bio-lab':
        _safeInit('initBioLab', route, target);
        break;
      case '/phet-sims':
        _safeInit('initPhetSims', route, target);
        break;
      case '/trends':
        _safeInit('initTrends', route, target);
        break;
      case '/teacher':
        _safeInit('initTeacher', route, target);
        break;
      case '/classroom':
        // AI 课堂模块已移除，跳转到练习页（避免老书签 404）
        navigateTo('/practice');
        break;
      case '/learning-hub':
        _safeInit('initLearningHub', route, target);
        break;
      case '/reset-password':
        renderResetPasswordPage(target);
        break;
      // —— 集成模块路由（脚本在 index.html 中 defer 预加载，直接调用 window 上暴露的渲染函数） ——
      case '/sketch':
        // sketch-pad.js -> window.renderSketchPadPage
        if (typeof window.renderSketchPadPage === 'function') {
          window.renderSketchPadPage(target);
        } else {
          _renderModuleError(target, route, new Error('sketch-pad 模块未加载'));
        }
        break;
      case '/smiles':
        // rdkit-viewer.js -> window.renderSmilesPage
        if (typeof window.renderSmilesPage === 'function') {
          window.renderSmilesPage(target);
        } else {
          _renderModuleError(target, route, new Error('rdkit-viewer 模块未加载'));
        }
        break;
      case '/molecules':
        // molecule-viewer.js -> window.renderMoleculesPage
        if (typeof window.renderMoleculesPage === 'function') {
          window.renderMoleculesPage(target);
        } else {
          _renderModuleError(target, route, new Error('molecule-viewer 模块未加载'));
        }
        break;
      case '/genome':
        // genome-browser.js -> window.renderGenomeBrowserPage
        // igv.js (MIT) 懒加载：访问路由时才动态注入 igv.min.js（~1.5MB）
        if (typeof window.renderGenomeBrowserPage === 'function') {
          window.renderGenomeBrowserPage(target);
        } else if (window.GenomeBrowser && typeof window.GenomeBrowser.renderGenomeBrowserPage === 'function') {
          window.GenomeBrowser.renderGenomeBrowserPage(target);
        } else if (typeof window.initGenomeBrowser === 'function') {
          window.initGenomeBrowser(route, target);
        } else {
          _renderModuleError(target, route, new Error('genome-browser 模块未加载'));
        }
        break;
      case '/community-enhanced':
        // community-enhanced.js -> window.initCommunityEnhanced / window.CommunityEnhanced.renderCommunityEnhancedPage
        if (typeof window.initCommunityEnhanced === 'function') {
          window.initCommunityEnhanced(route, target);
        } else if (window.CommunityEnhanced && typeof window.CommunityEnhanced.renderCommunityEnhancedPage === 'function') {
          window.CommunityEnhanced.renderCommunityEnhancedPage(target);
        } else {
          _renderModuleError(target, route, new Error('community-enhanced 模块未加载'));
        }
        break;
      case '/daily-billion':
        if (typeof window.initDailyBillion === 'function') {
          window.initDailyBillion(target);
        } else {
          _renderModuleError(target, route, new Error('daily-billion 模块未加载'));
        }
        break;
      default:
        target.classList.add('page-content--home');
        if (_AppState._homeHTML) {
          target.innerHTML = _AppState._homeHTML;
          reinitHomeComponents();
        }
    }

    // 非首页路由添加页面进入动画
    if (route !== '/') {
      target.classList.add('page-enter');
      target.addEventListener('animationend', function handler() {
        target.classList.remove('page-enter');
        target.removeEventListener('animationend', handler);
      });
    }

    // 更新底部标签栏高亮
    updateBottomTabBar(route);
  } catch (err) {
    console.error('[TATABOX] 路由渲染错误:', route, err);
    try {
      target.innerHTML = '<div class="bq-empty-block-lg"><p class="bq-text-error">页面加载失败，请刷新重试</p><p class="bq-hint bq-hint--mt">路由: ' + route + '</p></div>';
    } catch (e2) { /* ignore */ }
  } finally {
    _doRouteRenderCount--;
  }
}

/**
 * 绑定全局事件
 */

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.app = BQ.app || {};
  BQ.app.modules = { doRouteRender: doRouteRender };
})();
