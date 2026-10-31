/**
 * ============================================================
 * TATABOX — SPA 路由与全局状态管理
 * 使用 hash-based 路由实现单页应用导航
 * ============================================================
 */

// 启动标记：boot-mask.js 用它区分"应用脚本已开始执行"与"脚本加载/解析失败"，
// 一旦脚本因任何原因没能跑到这里，首屏遮罩会在兜底超时后展示错误重试而不是
// 淡出成一页空白（修复"加载到 20% 卡死 / 遮罩消失但内容没加载好"）。
window.__appBooted = true;

/* CSP 改造辅助：把无法用 data-on 数组直接表达的复杂内联处理器
 * 收敛为极小的命名函数，供 csp-events.js 的委托通过 window[fn] 查找调用。
 * 语义均与原内联表达式完全等价。 */
window.__cspRoot = function () {};
window._cspGotoHash = function (hash) { window.location.hash = hash; };
window._cspShowAuth = function () {
  if (typeof window.showAuthModal === 'function') window.showAuthModal();
  else if (typeof window.renderAuthModal === 'function') window.renderAuthModal();
};
window._cspReload = function () { window.location.reload(); };
window._cspRemoveParent = function () { if (this.parentNode) this.parentNode.remove(); };
window._cspSlideCaptcha = function (mode) {
  var fn = window._showSlideCaptcha || window.__cspSlideCaptchaImpl;
  var p = fn ? fn(mode) : Promise.resolve();
  return Promise.resolve(p).then(function () {
    if (typeof window._updateSlideTriggerUI === 'function') window._updateSlideTriggerUI();
  });
};
window._cspOpenGitHub = function () {
  window.open('https://github.com/astrnox/TATAbox/issues/new/choose', '_blank');
};

/**
 * 动态加载脚本（返回 Promise），用于延迟加载非首屏 JS
 * 统一委托给 window.loadScriptOnce（公共加载器，带去重与超时），
 * 同时保留对已存在于 DOM 的 <script> 标签的预检兼容。
 */
function __loadScriptAsync(src) {
  // 预检：若该脚本已作为 <script> 标签存在于 DOM（如 HTML 中静态声明），直接复用其加载状态
  var existing = document.querySelector('script[src="' + src + '"]');
  if (existing) {
    if (existing._loaded) return Promise.resolve();
    return new Promise(function(resolve, reject) {
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', function() { reject(new Error('Failed to load: ' + src)); });
    });
  }
  // 委托公共加载器（去重 + 超时 + 失败可重试）
  if (typeof window !== 'undefined' && typeof window.loadScriptOnce === 'function') {
    return window.loadScriptOnce(src);
  }
  // 兜底：utils.js 尚未就绪时（理论上不会发生，因 utils.js 是首个 defer 脚本）
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = function() { s._loaded = true; resolve(); };
    s.onerror = function() { reject(new Error('Failed to load: ' + src)); };
    document.head.appendChild(s);
  });
}

/**
 * 按顺序加载多个脚本
 */
function __loadScriptChain(sources) {
  var p = Promise.resolve();
  sources.forEach(function(src) {
    p = p.then(function() { return __loadScriptAsync(src); });
  });
  return p;
}

// 获取 JS 基路径（适配子目录部署）
var __jsBase = (function() {
  var scripts = document.querySelectorAll('script[src*="js/core/app.js"]');
  if (scripts.length > 0) {
    var src = scripts[scripts.length - 1].src;
    var base = src.substring(0, src.lastIndexOf('/js/core/app.js'));
    return base ? base + '/' : '';
  }
  return '';
})();

/**
 * @typedef {Object} _AppState
 * @property {string} currentRoute - 当前路由路径
 * @property {string} theme - 当前主题 ('light' | 'dark')
 * @property {Object} userSettings - 用户偏好设置
 * @property {boolean} initialized - 应用是否已初始化
 */

/** @type {_AppState} */
const _AppState = {
  currentRoute: '',
  theme: 'light',
  userSettings: {
    fontSize: 'medium',
    questionCount: 30,
    showTimer: true,
    autoSubmit: false
  },
  initialized: false
};

/**
 * P1-7：通过只读 Proxy 视图暴露内部状态。
 * - 内部（app.js）直接读写 `_AppState` 可变对象；
 * - 外部（window.AppState / 其他模块 / 第三方脚本）只能读取，
 *   写入、删除、原型污染均被拒绝，限制对全局状态的篡改与注入。
 */
window.AppState = createReadOnlyStateView(_AppState);

function createReadOnlyStateView(target) {
  return new Proxy(target, {
    get: function (t, k) { return t[k]; },
    set: function (t, k, v) {
      if (k === '__proto__' || k === 'prototype' || k === 'constructor') return false;
      console.warn('[TATABOX] AppState 为只读视图，已拒绝外部写入:', String(k));
      return true; // 严格模式返回 false 会抛错，改为静默拒绝
    },
    deleteProperty: function () { return false; },
    defineProperty: function () { return false; },
    setPrototypeOf: function () { return false; },
    has: function (t, k) { return k in t; },
    ownKeys: function (t) { return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor: function (t, k) { return Reflect.getOwnPropertyDescriptor(t, k); },
    getPrototypeOf: function (t) { return Reflect.getPrototypeOf(t); }
  });
}
// 路由配置表已拆分至 js/core/app-routes.js（P1-2），此处通过全局 `Routes` 引用

/**
 * 获取当前 hash 对应的路由路径
 * @returns {string} 路由路径，如 '/', '/practice', '/exam'
 */
function showUndoToast(message, onUndo, options) {
  options = options || {};
  var label = options.label || '撤销';
  var existing = document.getElementById('bioquest-undo-toast');
  if (existing) existing.remove();

  var bar = document.createElement('div');
  bar.id = 'bioquest-undo-toast';
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  bar.style.cssText = [
    'position:fixed',
    'bottom:80px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:99999',
    'display:flex',
    'align-items:center',
    'gap:14px',
    'background:rgba(26,58,42,0.96)',
    'color:#fff',
    'padding:12px 18px',
    'border-radius:12px',
    'font-size:0.9rem',
    'font-weight:500',
    'box-shadow:var(--shadow-lg)',
    'border:1px solid rgba(58,140,92,0.3)',
    'animation:toastSlideUp 0.3s ease',
    'max-width:90vw',
    'pointer-events:auto'
  ].join(';');

  var text = document.createElement('span');
  text.textContent = message;

  var undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.textContent = label;
  undoBtn.style.cssText = 'border:none;background:transparent;color:#91d8ab;font-weight:700;font-size:0.9rem;cursor:pointer;padding:4px 8px;white-space:nowrap;';

  var fired = false;
  function dismiss() {
    if (bar.parentNode) bar.parentNode.removeChild(bar);
  }
  undoBtn.addEventListener('click', function () {
    if (fired) return;
    fired = true;
    dismiss();
    if (typeof onUndo === 'function') {
      try { onUndo(); } catch (e) { /* 撤销失败不影响页面 */ }
    }
  });

  bar.appendChild(text);
  bar.appendChild(undoBtn);
  document.body.appendChild(bar);

  setTimeout(function () {
    bar.style.animation = 'toastSlideDown 0.3s ease forwards';
    setTimeout(dismiss, 300);
  }, options.duration || 5000);

  return { dismiss: dismiss };
}

// 暴露到全局
window.showFeedbackModal = showFeedbackModal;
window.closeFeedbackModal = closeFeedbackModal;
window.handleFeedbackSubmit = handleFeedbackSubmit;
window.showToast = showToast;
window.showUndoToast = showUndoToast;

// PRD §5-30：网络状态指示器
(function () {
  var indicator = document.createElement('div');
  indicator.id = 'network-status-indicator';
  indicator.style.cssText = [
    'position:fixed',
    'top:8px',
    'right:60px',
    'z-index:9995',
    'display:inline-flex',
    'align-items:center',
    'gap:4px',
    'padding:3px 10px',
    'border-radius:12px',
    'font-size:0.7rem',
    'font-weight:500',
    'transition:all 0.3s ease',
    'pointer-events:none',
    'opacity:0'
  ].join(';');

  function setOnline() {
    indicator.textContent = '在线';
    indicator.style.background = 'rgba(90,125,92,0.15)';
    indicator.style.color = '#5a7d5c';
    indicator.style.opacity = '0';
    setTimeout(function () { indicator.style.opacity = '0'; }, 2000);
  }

  function setOffline() {
    indicator.textContent = '离线模式';
    indicator.style.background = 'rgba(196,149,106,0.2)';
    indicator.style.color = '#c4956a';
    indicator.style.opacity = '1';
  }

  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOffline);

  if (!navigator.onLine) {
    setOffline();
  } else {
    indicator.textContent = '';
    indicator.style.opacity = '0';
  }

  document.body.appendChild(indicator);
})();

// PRD §5-31：Service Worker 更新提示（防挂起版）
// 修复：首次进入 navigator.serviceWorker.ready 可能永远 pending（新用户没有
// controller 时），必须加超时安全网 + controllerchange 双保险，避免
// 监听 updatefound 的回调永远注册不上导致用户感知"卡住/要刷新"。
(function () {
  if (!('serviceWorker' in navigator)) return;

  var bannerShown = false;
  function showUpdateBanner() {
    if (bannerShown) return;
    bannerShown = true;
    // 延迟插入，避免阻塞首屏关键渲染路径（首帧之后再显示提示，不会白屏闪烁）
    requestAnimationFrame(function () {
      setTimeout(function () {
        if (!document.body) return;
        var banner = document.createElement('div');
        banner.id = 'sw-update-banner';
        banner.style.cssText = [
          'position:fixed',
          'bottom:80px',
          'left:50%',
          'transform:translateX(-50%)',
          'z-index:99999',
          'background:rgba(26,58,42,0.95)',
          'color:#fff',
          'padding:12px 24px',
          'border-radius:16px',
          'font-size:0.9rem',
          'box-shadow:var(--shadow-lg)',
          'border:1px solid rgba(58,140,92,0.3)',
          'display:flex',
          'align-items:center',
          'gap:12px',
          'max-width:90vw',
          'animation:toastSlideUp 0.3s ease'
        ].join(';');
        banner.innerHTML = '<span>新版本可用</span>' +
          '<button data-on=\'["_cspReload"]\' style="padding:6px 16px;border-radius:8px;border:none;background:#5a7d5c;color:#fff;cursor:pointer;font-size:0.85rem;font-weight:600;white-space:nowrap;">刷新</button>' +
          '<button data-on=\'["_cspRemoveParent"]\' style="padding:6px 10px;border-radius:8px;border:none;background:transparent;color:#999;cursor:pointer;font-size:0.85rem;">×</button>';
        document.body.appendChild(banner);
      }, 0);
    });
  }

  function wireUpdateFound(reg) {
    if (!reg) return;
    // 已有 installing worker，直接跟踪（例如 register 时立刻进入 install）
    trackWorker(reg.installing);
    reg.addEventListener('updatefound', function () {
      trackWorker(reg.installing);
    });
  }

  function trackWorker(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', function () {
      // installed 且当前已有 controller → 新旧并存，提示刷新即可激活新版本
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateBanner();
      }
    });
  }

  // 保险1：ready promise + 3s 硬超时兜底（避免首次启动 pending 到天荒地老）
  var safetyDone = false;
  var safetyTimer = setTimeout(function () {
    if (safetyDone) return;
    safetyDone = true;
    // ready 超时：直接从 getRegistrations 拿现有 registration
    if (navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        (regs || []).forEach(wireUpdateFound);
      }).catch(function () {});
    }
  }, 3000);

  navigator.serviceWorker.ready.then(function (reg) {
    if (safetyDone) return;
    clearTimeout(safetyTimer);
    safetyDone = true;
    wireUpdateFound(reg);
  }).catch(function () {
    /* ready 拒绝不算错误，静默忽略 */
  });

  // 保险2：controller 变化（SW claim 之后）也重新尝试绑定
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then(wireUpdateFound).catch(function () {});
    }
  });
})();

// Issue #16：「检查更新」手动入口
// 两级检查：
//   1. 外壳更新：reg.update() 发现新 SW → 提示刷新（复用上方横幅）；
//   2. 题库更新：拉取最新 data/manifest.json，比对 rev（loader 持久化于
//      localStorage.bq_manifest_rev）→ 有新版则清空 SW 题库 runtime cache
//      + 触发后台增量刷新（IndexedDB 按 manifest SHA 增量替换）。
// 全程离线安全：任何网络失败都提示"检查失败"，不影响现有功能。
(function () {
  function _updateToast(text, ms) {
    try {
      var old = document.getElementById('bq-update-toast');
      if (old) old.remove();
      var el = document.createElement('div');
      el.id = 'bq-update-toast';
      el.style.cssText = 'position:fixed;bottom:110px;left:50%;transform:translateX(-50%);' +
        'z-index:99999;background:rgba(26,58,42,0.95);color:#fff;padding:10px 22px;border-radius:12px;' +
        'font-size:0.88rem;box-shadow:var(--shadow-lg);max-width:86vw;text-align:center;';
      el.textContent = text;
      document.body.appendChild(el);
      setTimeout(function () { if (el.parentNode) el.remove(); }, ms || 2600);
    } catch (e) {}
  }

  function _sendSwMessage(msg) {
    return new Promise(function (resolve) {
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        resolve(null);
        return;
      }
      var channel = new MessageChannel();
      var settled = false;
      channel.port1.onmessage = function (e) {
        settled = true;
        resolve(e.data || null);
      };
      try {
        navigator.serviceWorker.controller.postMessage(msg, [channel.port2]);
      } catch (err) { resolve(null); return; }
      setTimeout(function () { if (!settled) resolve(null); }, 3000);
    });
  }

  function _fetchFreshManifestRev() {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 6000);
    return fetch('data/manifest.json?v=' + Date.now(), { signal: controller.signal, cache: 'no-store' })
      .then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (mf) {
        clearTimeout(timer);
        return (mf && (mf.rev || mf.updated_at)) ? String(mf.rev || mf.updated_at) : null;
      })
      .catch(function () {
        clearTimeout(timer);
        return null;
      });
  }

  window.checkForAppUpdates = function () {
    var savedRev = null;
    try { savedRev = localStorage.getItem('bq_manifest_rev'); } catch (e) {}

    var swUpdatePromise = ('serviceWorker' in navigator && navigator.serviceWorker.getRegistration)
      ? navigator.serviceWorker.getRegistration().then(function (reg) {
          return reg ? reg.update().then(function () { return reg; }) : null;
        }).catch(function () { return null; })
      : Promise.resolve(null);

    return swUpdatePromise.then(function (reg) {
      var hasNewSw = !!(reg && (reg.waiting || (reg.installing && reg.installing.state === 'installed')));

      return _fetchFreshManifestRev().then(function (freshRev) {
        // 1) 外壳有新 SW → 提示刷新即激活（skipWaiting 已内置）
        if (hasNewSw) {
          _updateToast('发现新版本应用，3 秒后自动刷新…', 3000);
          setTimeout(function () { location.reload(); }, 3000);
          return { shell: true, data: false };
        }

        // 2) 题库 manifest 有新版 → 清 SW 题库缓存 + 后台增量刷新 IndexedDB
        if (freshRev && savedRev && String(freshRev) !== String(savedRev)) {
          _updateToast('题库有更新（v' + freshRev + '），正在同步…');
          return _sendSwMessage({ type: 'PURGE_DATA_CACHE' }).then(function () {
            try { localStorage.setItem('bq_manifest_rev', String(freshRev)); } catch (e) {}
            if (typeof window.clearQuestionCache === 'function') window.clearQuestionCache();
            if (typeof window.maintainQuestionBank === 'function') window.maintainQuestionBank();
            _updateToast('题库已更新到 v' + freshRev + '，刷新页面生效', 3600);
            return { shell: false, data: true };
          });
        }

        // 3) 无更新（或离线检查失败但 SW 正常）
        if (freshRev === null && savedRev === null) {
          _updateToast('检查更新失败，请检查网络');
        } else {
          // 首次检查（本地无版本记录）：落盘基线，供后续比对
          if (freshRev && !savedRev) {
            try { localStorage.setItem('bq_manifest_rev', String(freshRev)); } catch (e) {}
          }
          _updateToast('已是最新版本（题库 v' + (freshRev || savedRev) + '）');
        }
        return { shell: false, data: false };
      });
    });
  };
})();

// P1-26 修复：beforeinstallprompt — 自定义 PWA 安装引导
// 监听 beforeinstallprompt；可安装时在左下角显示自定义安装引导条，
// 替代浏览器默认安装 UI。点击后调用 deferredPrompt.prompt()；
// 安装完成（appinstalled）或用户拒绝/手动关闭后移除，
// 并用 localStorage 记录"已处理"，避免重复打扰。
// 仅 Chromium 系支持 beforeinstallprompt，其余浏览器直接跳过。
(function () {
  if (!('beforeinstallprompt' in window)) return;

  var INSTALL_STORE_KEY = 'bioquest_a2hs_dismissed';
  var deferredPrompt = null;

  function _wasDismissed() {
    try { return localStorage.getItem(INSTALL_STORE_KEY) === '1'; } catch (e) { return false; }
  }
  function _markDismissed() {
    try { localStorage.setItem(INSTALL_STORE_KEY, '1'); } catch (e) {}
  }
  function _removeInstallBar() {
    var bar = document.getElementById('bq-install-bar');
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  }

  function _showInstallBar() {
    _removeInstallBar();
    if (!document.body || !deferredPrompt) return;

    var bar = document.createElement('div');
    bar.id = 'bq-install-bar';
    bar.setAttribute('role', 'region');   // 非模态横幅，避免误导屏读器认为是对话框
    bar.setAttribute('aria-label', '安装 TATABOX 应用');
    bar.style.cssText = [
      'position:fixed',
      'left:16px',
      'bottom:16px',
      'z-index:99998',
      'max-width:min(340px, 86vw)',
      'background:#2c5a3a',
      'color:#fff',
      'padding:12px 16px',
      'border-radius:16px',
      'font-size:0.9rem',
      'line-height:1.5',
      'display:flex',
      'align-items:center',
      'gap:12px',
      'box-shadow:var(--shadow-lg)',
      'animation:toastSlideUp 0.3s ease'
    ].join(';');
    bar.appendChild(document.createTextNode('将 TATABOX 添加至主屏幕，随时随地学习'));

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'bq-install-btn';
    btn.textContent = '安装 App';
    btn.style.cssText = 'flex:none;padding:8px 16px;border:none;border-radius:8px;background:#fff;color:#1a3a2a;font-weight:700;cursor:pointer;';
    bar.appendChild(btn);

    var dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.textContent = '×';
    dismissBtn.setAttribute('aria-label', '不再提示');
    dismissBtn.style.cssText = 'flex:none;padding:2px 8px;border:none;background:transparent;color:rgba(255,255,255,0.7);cursor:pointer;font-size:1.1rem;';
    bar.appendChild(dismissBtn);

    var installing = false;
    btn.addEventListener('click', function () {
      if (installing || !deferredPrompt) return;
      installing = true;
      deferredPrompt.prompt();
      deferredPrompt.userChoice
        .then(function (choice) {
          deferredPrompt = null;
          installing = false;
          _markDismissed(); // 接受或拒绝后都不再重复打扰
          _removeInstallBar();
        })
        .catch(function () {
          deferredPrompt = null;
          installing = false;
          _removeInstallBar();
        });
    });
    dismissBtn.addEventListener('click', function () {
      _markDismissed();
      _removeInstallBar();
    });

    document.body.appendChild(bar);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // 拦截默认安装提示，统一走自定义引导
    deferredPrompt = e;
    if (_wasDismissed()) return; // 曾安装/拒绝：不再展示
    requestAnimationFrame(function () { _showInstallBar(); });
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    _markDismissed();
    _removeInstallBar();
  });
})();

// M-01：initApp 已随启动流程拆入 app-boot.js，触发逻辑也随文件迁移