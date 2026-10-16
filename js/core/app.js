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
  window.open('https://github.com/astrnox/BioQuest/issues/new/choose', '_blank');
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
  initialized: false,
  pageModules: {}
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
var _donationFocusTrap = null;

// 路由配置表已拆分至 js/core/app-routes.js（P1-2），此处通过全局 `Routes` 引用

/**
 * 隐私政策页（静态内容，P1-19）
 * 仅内联样式（CSP style-src 允许 'unsafe-inline'），不含内联脚本，避免引入 XSS 面。
 */
function renderPrivacyPage(target) {
  if (!target) return;
  var s = {
    bg: '#f7f5f0',
    card: '#ffffff',
    border: '#ece8e1',
    text: '#2c3840',
    muted: '#8a8a8a',
    sage: '#3a6b4a',
    accent: '#1a3a2a'
  };
  target.innerHTML =
  '<div style="max-width:860px;margin:0 auto;padding:40px 20px 64px;font-family:var(--font-sans,\'Noto Sans SC\',sans-serif);color:' + s.text + ';line-height:1.8;">' +
    '<a href="#/" style="display:inline-flex;align-items:center;gap:6px;color:' + s.sage + ';text-decoration:none;font-size:0.88rem;margin-bottom:20px;">← 返回首页</a>' +
    '<div style="background:' + s.card + ';border:1px solid ' + s.border + ';border-radius:16px;padding:36px 40px 44px;box-shadow:var(--shadow-lg);">' +
      '<h1 style="font-family:var(--font-serif,\'Noto Serif SC\',serif);font-size:1.7rem;color:' + s.accent + ';margin:0 0 6px;">隐私政策</h1>' +
      '<p style="color:' + s.muted + ';font-size:0.82rem;margin:0 0 26px;">更新日期：2026-08-19 · 适用于 TATABOX（高中生物学习平台）</p>' +
      _privacySection('一、我们收集哪些数据', [
        '账户信息：你在登录/注册时提供的姓名、邮箱（例如通过 Supabase 账号系统）。',
        '学习数据：练习作答、错题、收藏、统计、习惯打卡、徽章与学习进度等，默认仅保存在你的浏览器本地（localStorage／IndexedDB）。',
        '设备标识：用于本地数据关联的匿名设备标识（bioquest.xxx 下）。',
        '日志：浏览器控制台与运行错误日志，仅用于排障，不含可直读的敏感凭据。'
      ]) +
      _privacySection('二、数据如何使用', [
        '用于个性化学习：错题复盘、学情分析、成绩画像、复习排程（FSRS/IRT 算法）。',
        '用于功能交互：社区、排行榜、教师协同视图、AI 助手（见第五条）。',
        '不会在未经你同意的情况下用于广告画像或出售给第三方。'
      ]) +
      _privacySection('三、数据存储与安全', [
        '默认本地优先：学习数据存于你的浏览器本地存储；你可在「用户中心 → 数据管理」导出备份或一键清除。',
        '云端数据（如已登录账号、反馈、社区内容、AI 额度的服务端部分）通过 Supabase 存储与传输。',
        'API Key 保护：AI 接口 Key 仅保存在当前页面内存（可选「会话内记住」写入 sessionStorage，关闭标签页即清除），不会持久化到你浏览器的 localStorage 或磁盘，也不会在控制台之外以明文全局属性暴露。',
        '传输加密：外发请求走 HTTPS，第三方 AI 服务商在请求中有独立的服务条款与隐私政策。'
      ]) +
      _privacySection('四、Cookie 与本地存储', [
        '本平台主要依赖浏览器 Web Storage（localStorage / sessionStorage / IndexedDB）存储功能数据，而非传统 Cookie。',
        '第三方服务（Supabase、AI 服务商、jsDelivr CDN 等）可能按其自身政策使用 Cookie／本地存储，请查阅各自隐私政策。',
        '你可随时在浏览器设置中清除站点本地数据；清除后学习数据将不可恢复（建议先导出备份）。'
      ]) +
      _privacySection('五、AI 功能与第三方处理', [
        'AI 助手（导师、诊断、文档问答等）会将你的提问与相关上下文发送到所选 AI 服务商（如 DeepSeek、智谱、通义千问、Kimi、NVIDIA、硅基流动）的接口处理。',
        '若你使用自定义 API Key，请求由你的前端携带你的 Key 直连服务商；请勿将涉及他人敏感信息的文本提交给 AI 功能。',
        'AI 调用受每日次数限制，用于防止滥用。'
      ]) +
      _privacySection('六、你的权利', [
        '访问权：在「用户中心」查看个人与学习数据。',
        '导出权：在「用户中心 → 数据管理 → 导出我的数据」获取可读明文 JSON。',
        '删除权：在「用户中心 → 数据管理 → 清除所有数据」删除本地全部业务数据；账号相关数据可在登录状态下申请。',
        '撤回同意与投诉：可通过下方邮箱联系我们对数据处理行为提出异议。'
      ]) +
      _privacySection('七、未成年人保护', [
        '本平台面向生物学科学习，若你为未成年人，建议在监护人指导下使用，并由监护人知悉本政策后使用。'
      ]) +
      _privacySection('八、政策更新与联系', [
        '我们会不时更新本政策，重大变更将在页面明显位置提示。',
        '如有隐私相关问题，可通过邮箱联系作者：astrnox@163.com（或 QQ：3930523703）。'
      ]) +
      '<div style="margin-top:8px;padding-top:18px;border-top:1px solid ' + s.border + ';font-size:0.82rem;color:' + s.muted + ';">TATABOX · 本政策以最新页面版本为准。</div>' +
    '</div>' +
  '</div>';
  try { if (typeof updatePageTitle === 'function') updatePageTitle('/privacy'); } catch (e) {}
}

// 生成"小节标题 + 列表"的静态 HTML（仅内联样式，无脚本）
function _privacySection(title, items) {
  var lis = items.map(function (it) {
    return '<li style="margin:6px 0;padding-left:2px;">' + String(it).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</li>';
  }).join('');
  return '<h2 style="font-family:var(--font-serif,\'Noto Serif SC\',serif);font-size:1.12rem;color:' + '#1a3a2a' + ';margin:26px 0 10px;">' + title + '</h2>' +
    '<ul style="margin:0;padding-left:20px;font-size:0.9rem;color:#2c3840;">' + lis + '</ul>';
}

/**
 * 首次访问隐私政策提示（P1-19）。
 * 一次性、可关闭；仅用内联样式 + textContent/按钮，无内联脚本（符合 CSP）。
 * 关键约束：任何分支都不抛异常、不依赖 DOM 状态，绝不影响 initApp 后续执行
 * （initApp 在 DOMContentLoaded 直接触发，无 try/catch 兜底）。
 */
function _maybeShowPrivacyNotice() {
  try {
    var seen = false;
    try { seen = localStorage.getItem('bioquest_privacy_notice_seen') === '1'; } catch (e) {}
    if (seen || typeof document === 'undefined' || !document.body) return;

    var el = document.createElement('div');
    el.id = 'privacy-notice';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;' +
      'display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:14px 16px;border-radius:12px;' +
      'background:#ffffff;border:1px solid #ece8e1;box-shadow:var(--shadow-lg);' +
      'font-family:var(--font-sans, sans-serif);font-size:0.85rem;color:#2c3e30;line-height:1.5;max-width:640px;margin:0 auto;';
    var txt = document.createElement('span');
    txt.style.cssText = 'flex:1 1 100%;';
    txt.textContent = '我们重视你的数据隐私：学习数据默认仅保存在本地，可随时导出或清除。';
    // P1-33：未成年人保护——首次使用需确认年龄/监护人同意。
    // 该确认仅作为最小合规门槛（不阻塞应用启动，用户也可自行访问隐私政策页后再确认）。
    var ageWrap = document.createElement('label');
    ageWrap.style.cssText = 'display:flex;align-items:flex-start;gap:8px;flex:1 1 100%;cursor:pointer;font-size:0.82rem;color:#54665c;';
    var ageInput = document.createElement('input');
    ageInput.type = 'checkbox';
    ageInput.setAttribute('aria-label', '我已阅读并同意隐私政策；确认年满14周岁，或未成年人使用已取得监护人同意');
    ageInput.style.cssText = 'margin-top:1px;accent-color:#3a6b4a;';
    var ageText = document.createElement('span');
    ageText.textContent = '我已阅读并同意隐私政策；确认年满 14 周岁（若为未成年人，已取得监护人同意后使用本平台）。';
    ageWrap.appendChild(ageInput);
    ageWrap.appendChild(ageText);

    var link = document.createElement('a');
    link.href = '#/privacy';
    link.textContent = '查看隐私政策';
    link.style.cssText = 'color:#3a6b4a;font-weight:600;white-space:nowrap;text-decoration:none;';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '我知道了';
    closeBtn.disabled = true;
    closeBtn.style.cssText = 'border:1px solid #3a6b4a;background:#3a6b4a;color:#fff;border-radius:8px;padding:6px 14px;font-size:0.82rem;cursor:pointer;white-space:nowrap;';
    closeBtn.style.opacity = '0.5';
    closeBtn.addEventListener('click', function () {
      try { localStorage.setItem('bioquest_privacy_notice_seen', '1'); } catch (e) {}
      try { localStorage.setItem('bioquest_age_consent', '1'); } catch (e) {}
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    ageInput.addEventListener('change', function () {
      closeBtn.disabled = !ageInput.checked;
      closeBtn.style.opacity = ageInput.checked ? '1' : '0.5';
    });

    el.appendChild(txt);
    el.appendChild(ageWrap);
    el.appendChild(link);
    el.appendChild(closeBtn);
    document.body.appendChild(el);
  } catch (e) { /* 提示失败绝不能影响应用启动 */ }
}

/**
 * 获取当前 hash 对应的路由路径
 * @returns {string} 路由路径，如 '/', '/practice', '/exam'
 */
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
function renderPracticePage(target) {

  if (typeof window.initPractice === 'function') {
    window.initPractice(target);
  } else {
    target.innerHTML = `
      <div class="bq-empty-block-lg">
        <div class="bq-fs-2rem bq-mb-12"></div>
        <p class="bq-text-muted">练习模块加载中…</p>
      </div>
    `;
    // 如果全局函数还没有，延迟再试
    setTimeout(() => {
      if (typeof window.initPractice === 'function') {
        window.initPractice(target);
      }
    }, 200);
  }
}

/**
 * 模拟考试页面渲染
 * @param {HTMLElement} target - 渲染目标元素
 */
function renderExamPage(target) {

  // 确保 target 正确
  if (!target) {
    target = document.getElementById('page-content');
  }
  
  if (typeof window.initExam === 'function') {
    try {
      window.initExam(target);
    } catch (err) {
      console.error('初始化考试模块失败:', err);
      target.innerHTML = `
        <div class="bq-empty-block-lg">
          <div class="bq-fs-2rem bq-mb-12"></div>
          <p class="bq-text-error">加载考试模块失败，请刷新页面重试</p>
          <p style="color:var(--text-muted);font-size:0.9rem;margin-top:8px;">错误信息: ${errText(err)}</p>
        </div>
      `;
    }
  } else {
    target.innerHTML = `
      <div class="bq-empty-block-lg">
        <div class="bq-fs-2rem bq-mb-12"></div>
        <p class="bq-text-muted">考试模块加载中…</p>
        <p class="bq-hint bq-hint--mt">如长时间未响应，请刷新页面</p>
      </div>
    `;
    
    // 多次尝试初始化
    let attempts = 0;
    const tryInit = () => {
      attempts++;
      if (typeof window.initExam === 'function') {
        window.initExam(target);
      } else if (attempts < 10) {
        setTimeout(tryInit, 200);
      } else {
        target.innerHTML = `
          <div class="bq-empty-block-lg">
            <div class="bq-fs-2rem bq-mb-12"></div>
            <p class="bq-text-error">考试模块加载超时，请刷新页面重试</p>
            <button style="margin-top:16px;padding:8px 20px;background:var(--color-amber);border:none;border-radius:8px;cursor:pointer;" data-on='["_cspReload"]'>刷新页面</button>
          </div>
        `;
      }
    };
    tryInit();
  }
}

/**
 * 学习分析页面渲染
 * @param {HTMLElement} target - 渲染目标元素
 */
function renderAnalyticsPage(target) {

  if (typeof window.initAnalytics === 'function') {
    window.initAnalytics(target);
  } else {
    target.innerHTML = `
      <div class="bq-empty-block-lg">
        <div class="bq-fs-2rem bq-mb-12"></div>
        <p class="bq-text-muted">分析模块加载中…</p>
      </div>
    `;
    setTimeout(() => {
      if (typeof window.initAnalytics === 'function') {
        window.initAnalytics(target);
      }
    }, 200);
  }
}

/**
 * 用户中心页面渲染
 * @param {HTMLElement} target - 渲染目标元素
 */
function renderUserPage(target) {

  if (typeof window.initUser === 'function') {
    window.initUser(target);
  } else {
    target.innerHTML = `
      <div class="bq-empty-block-lg">
        <div class="bq-fs-2rem bq-mb-12"></div>
        <p class="bq-text-muted">用户模块加载中…</p>
      </div>
    `;
    setTimeout(() => {
      if (typeof window.initUser === 'function') {
        window.initUser(target);
      }
    }, 200);
  }
}

/**
 * 知识卡片页面渲染 — Anki 风格间隔重复
 */
function renderCardsPage() {
  var container = document.getElementById('page-content');
  if (!container) return;

  container.innerHTML = `
    <div style="max-width:720px;margin:0 auto;padding:40px 20px 60px;">
      <!-- P1：页头统一使用全局组件（不再逐页写内联字号/样式） -->
      <div class="bq-section-header">
        <h2 class="bq-section-header__title">间隔重复记忆卡</h2>
        <p class="bq-section-header__desc">基于 FSRS 的间隔重复复习 · 选择牌组开始学习</p>
      </div>

      <!-- 牌组选择器（动态渲染） -->
      <div id="anki-deck-selector"></div>

      <!-- 卡片学习区域 -->
      <div id="anki-card-area">
        <div class="anki-card-container" id="anki-card-area-inner">
          <div class="anki-card" id="anki-card">
              <div class="anki-face anki-front-face" id="anki-front"></div>
              <div class="anki-face anki-back-face" id="anki-back"></div>
          </div>
        </div>
        <div class="anki-progress-bar" id="anki-progress-bar"></div>
      </div>

      <div class="anki-shortcut-hint" style="margin-top:14px;">
        <span><kbd>空格</kbd> 翻转</span>
        <span><kbd>1</kbd> 再来一次</span>
        <span><kbd>2</kbd> 一般</span>
        <span><kbd>3</kbd> 简单</span>
      </div>
    </div>
  `;

  // 加载 cards.js 模块（如果尚未加载）
  if (typeof window.AnkiSystem === 'undefined') {
    var script = document.createElement('script');
    script.src = 'js/pages/cards.js';
    script.onload = function () {

    };
    document.head.appendChild(script);
  } else {
    // 已加载，重新初始化
    if (typeof window.AnkiSystem.loadData === 'function') {
      window.AnkiSystem.loadData();
    }
  }
}

/**
 * HTML 转义 — 统一使用 window.escapeHtml（Q-01）
 * 规范实现在 js/core/utils.js，避免各模块重复定义导致转义字符集不一致
 */
var escapeHtml = (typeof window !== 'undefined' ? window : globalThis).escapeHtml; // 规范实现见 js/core/utils.js（Q-01 统一）

/**
 * 重新初始化首页关键组件（倒计时、Hero 动画、滚动动画）
 * 这些组件位于首屏或影响全局交互，需要立即执行。
 * 首次进入时会标记 _AppState._homePaintedReady，
 * 配合 finishRouting → bioquest:app-ready 实现"加载界面期间就加载好"。
 */
function reinitHomeComponents() {
  const daysEl = document.getElementById('cd-days');
  const hoursEl = document.getElementById('cd-hours');
  const minsEl = document.getElementById('cd-mins');
  const secsEl = document.getElementById('cd-secs');

  // 倒计时复用 countdown.js 的唯一实现与唯一目标日期（init 幂等，内部自行清理旧定时器），
  // 避免在 app.js 再复制一份计算逻辑、也不在多处硬编码目标日期。
  if (daysEl || hoursEl || minsEl || secsEl) {
    if (window.BioQuestCountdown && typeof window.BioQuestCountdown.init === 'function') {
      window.BioQuestCountdown.init();
    }
  }

  // 首页「题库总量」动态化：与练习页「可用题目」保持同一口径
  // （模块精编题 manifest.total_questions + 逻辑推理题 logic_questions.json）。
  // 若只读 manifest.total_questions 会漏掉逻辑推理题，导致与练习页数字对不上。
  const statTotalQ = document.getElementById('statTotalQuestions');
  if (statTotalQ) {
    const countP = (typeof window.getPlayableQuestionCount === 'function')
      ? window.getPlayableQuestionCount()
      : (typeof window.getQuestionBankCount === 'function'
          ? window.getQuestionBankCount()
          : Promise.resolve(null));
    Promise.resolve(countP).then(function (n) {
      if (n && statTotalQ) statTotalQ.textContent = String(n);
    });
    statTotalQ.title = '可练题总数：模块精编题 + 逻辑推理题';
  }

  // 注：原此处调用 initHeroSketch()（首屏 35 个随机漂移粒子），已移除。
  // 首屏背景现为纯 CSS 静态层次，见 css/home.css 的 .hero-bg。

  // 初始化平滑滚动动画（全局，首屏可见元素立即触发动画）
  initScrollAnimations();

  // 标记首页渲染完成（Hero 画布 + 倒计时数字 + 滚动动画已启动）
  // 下一帧再确认高度>0，确保布局已写入，避免撤遮罩后"还没撑开页面 → 下拉卡一下"
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var hero = document.getElementById('main-content') || document.querySelector('.hero');
      if (hero) {
        // 触发一次 reflow 读取，强制浏览器完成布局
        void hero.offsetHeight;
      }
      _AppState._homePaintedReady = true;
      // 若 finishRouting 已经执行过，则这里补发 app-ready 信号（解除遮罩等待）
      if (_AppState._homeRouteRendered && !_AppState._appReadyDispatched) {
        _AppState._appReadyDispatched = true;
        try { document.dispatchEvent(new CustomEvent('bioquest:app-ready')); } catch (e) {}
      }
    });
  });

  // 非关键模块延迟执行，避免阻塞首屏交互
  scheduleIdleWork(initNonCriticalHomeModules, { delay: 80 });
}

/**
 * 将任务调度到浏览器空闲时段执行
 * 优先使用 requestIdleCallback，不支持时使用 setTimeout(0) 兜底
 */
function scheduleIdleWork(fn, options) {
  options = options || {};
  var execute = function () {
    try {
      fn();
    } catch (e) {
      console.warn('[TATABOX] 空闲任务执行失败:', e);
    }
  };

  if (!options.immediate && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(execute, { timeout: options.timeout || 2000 });
  } else {
    setTimeout(execute, options.delay || 0);
  }
}
window.scheduleIdleWork = scheduleIdleWork;

/**
 * 初始化首页非关键模块
 * 每日一题、公告、生物学史时间轴、能力雷达、社区摘要等首屏下方内容
 * 在首屏渲染完成后再按需加载，不阻塞 DOMContentLoaded 后的交互
 */
function initNonCriticalHomeModules() {
  // 每日一题：首屏下方，按需渲染
  if (typeof window.renderDailyQuestion === 'function') {
    scheduleIdleWork(function () { window.renderDailyQuestion(); }, { delay: 50 });
  } else if (typeof window.loadModule === 'function') {
    window.loadModule('daily-question');
  }

  // 首页公告
  scheduleIdleWork(function () { loadHomeAnnouncements(); }, { delay: 100 });

  // 生物学史时间轴：由另一个 agent 负责添加 DOM，检测到容器后按需加载
  var bioSection = document.getElementById('biologyHistorySection');
  if (bioSection) {
    if (typeof window.initBiologyTimeline === 'function') {
      scheduleIdleWork(function () { window.initBiologyTimeline(bioSection); }, { delay: 120 });
    } else if (typeof window.loadModule === 'function') {
      window.loadModule('biology-history').then(function () {
        if (typeof window.initBiologyTimeline === 'function') {
          window.initBiologyTimeline(bioSection);
        }
      }).catch(function (err) {
        console.warn('[TATABOX] 生物学史模块加载失败:', err);
      });
    }
  }

  // 能力雷达：仅在 DOM 存在时加载
  var radarEl = document.getElementById('radarChart') || document.querySelector('[data-radar-chart]');
  if (radarEl && typeof window.loadModule === 'function') {
    window.loadModule('analytic');
  }

  // 社区摘要：仅在 DOM 存在时加载
  var communityEl = document.querySelector('[data-section="community-summary"]');
  if (communityEl && typeof window.loadModule === 'function') {
    window.loadModule('community');
  }
}
window.initNonCriticalHomeModules = initNonCriticalHomeModules;

/**
 * 加载首页公告
 */
var _announcementList = [];
var _announcementIndex = 0;

async function loadHomeAnnouncements() {
  var banner = document.getElementById('announcementBanner');
  if (!banner) return;

  try {
    var announcements = [];
    if (typeof window.getAnnouncements === 'function') {
      announcements = await window.getAnnouncements({ onlyActive: true, limit: 10 });
    }
    if (!announcements || announcements.length === 0) {
      banner.style.display = 'none';
      return;
    }
    _announcementList = announcements;
    _announcementIndex = 0;
    banner.style.display = 'block';
    showAnnouncementAtIndex(0);

    var nav = document.getElementById('announcementNav');
    if (announcements.length > 1 && nav) {
      nav.style.display = 'flex';
      document.getElementById('announcementPrev').onclick = function() {
        _announcementIndex = (_announcementIndex - 1 + _announcementList.length) % _announcementList.length;
        showAnnouncementAtIndex(_announcementIndex);
      };
      document.getElementById('announcementNext').onclick = function() {
        _announcementIndex = (_announcementIndex + 1) % _announcementList.length;
        showAnnouncementAtIndex(_announcementIndex);
      };
    }
  } catch (e) {
    banner.style.display = 'none';
  }
}

function showAnnouncementAtIndex(index) {
  var textEl = document.getElementById('announcementText');
  var counterEl = document.getElementById('announcementCounter');
  if (!textEl || !_announcementList[index]) return;
  var ann = _announcementList[index];
  var prefix = ann.is_pinned ? '[置顶] ' : '';
  textEl.textContent = prefix + ann.title + (ann.content ? ' | ' + ann.content.substring(0, 100) : '');
  textEl.style.animation = 'none';
  textEl.offsetHeight; // reflow
  textEl.style.animation = '';
  if (counterEl) {
    counterEl.textContent = (index + 1) + '/' + _announcementList.length;
  }
}

/**
 * 更新底部标签栏高亮状态
 * 液态玻璃外观：选中 tab 顶部覆盖一层高亮胶囊，切换时平滑滑动
 */
function updateBottomTabBar(route) {
  var bar = document.getElementById('bottomTabBar');
  if (!bar) return;
  var tabs = bar.querySelectorAll('.bottom-tab');
  if (!tabs || tabs.length === 0) return;

  // 路由到标签的映射
  var tabMap = {
    '/': 'home',
    '/practice': 'practice',
    '/exam': 'exam',
    '/dashboard': 'dashboard',
    '/user': 'user'
  };

  var activeName = tabMap[route] || '';
  var activeTab = null;
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].getAttribute('data-tab') === activeName) {
      activeTab = tabs[i];
      break;
    }
  }
  _setActiveBottomTab(activeTab);
}

/** 内部标记：胶囊是否已完成首次定位（首帧不做滑入动画） */
var _bottomGlowReady = false;
/** 内部标记：resize 监听已绑定 */
var _bottomGlowResizeBound = false;

/**
 * 将底部标签栏高亮胶囊移动到指定 tab（无匹配 tab 时仅移除高亮）
 * 供路由渲染与点击即时反馈共用：点击瞬间即更新，不等路由重新渲染
 */
function _setActiveBottomTab(activeTab) {
  var bar = document.getElementById('bottomTabBar');
  if (!bar) return;
  var tabs = bar.querySelectorAll('.bottom-tab');
  if (!tabs) return;

  for (var i = 0; i < tabs.length; i++) {
    if (activeTab && tabs[i] === activeTab) {
      tabs[i].classList.add('active');
    } else {
      tabs[i].classList.remove('active');
    }
  }

  if (!activeTab) {
    // 当前路由不在底部标签内（如 /leaderboard）：隐藏高亮胶囊
    bar.classList.remove('has-active');
    return;
  }
  _positionBottomTabGlow(activeTab);
}

/**
 * 定位液态玻璃高亮胶囊：跟随激活 tab 的位置与宽度
 * 首帧（bar 尚无可视胶囊）不做过渡动画，避免从左上角"飞"进来的跳动
 */
function _positionBottomTabGlow(activeTab) {
  var bar = document.getElementById('bottomTabBar');
  if (!bar || !activeTab) return;

  var glow = bar.querySelector('.bottom-tab-glow');
  if (!glow) {
    // 稳妥兜底：SW 缓存的旧 index.html 可能没有胶囊节点，动态补建
    glow = document.createElement('div');
    glow.className = 'bottom-tab-glow';
    glow.setAttribute('aria-hidden', 'true');
    bar.insertBefore(glow, bar.firstChild);
  }

  var x = activeTab.offsetLeft;
  var w = activeTab.offsetWidth;

  // 布局尚未就绪（首帧样式/字体未落定）：短暂重试，保证高亮胶囊最终可见
  if (!w && !glow._retryT) {
    glow._retryT = setTimeout(function () {
      glow._retryT = null;
      var cur = bar.querySelector('.bottom-tab.active');
      if (cur) _positionBottomTabGlow(cur);
    }, 250);
    return;
  }
  if (!w) return;

  if (!_bottomGlowReady) {
    // 首帧：禁止过渡，直接落位
    glow.style.transition = 'none';
    glow.style.left = x + 'px';
    glow.style.width = w + 'px';
    void glow.offsetWidth; // 强制 reflow 使定位生效后再启用过渡
    glow.style.transition = '';
    bar.classList.add('has-active');
    _bottomGlowReady = true;
  } else {
    glow.style.left = x + 'px';
    glow.style.width = w + 'px';
    if (!bar.classList.contains('has-active')) bar.classList.add('has-active');
  }

  if (!_bottomGlowResizeBound) {
    _bottomGlowResizeBound = true;
    var _resizeT;
    window.addEventListener('resize', function () {
      if (_resizeT) return;
      _resizeT = setTimeout(function () {
        _resizeT = null;
        var cur = bar.querySelector('.bottom-tab.active');
        if (cur) _positionBottomTabGlow(cur);
      }, 120);
    });
  }
}

/**
 * 初始化主页滚动动画
 * 使用 Intersection Observer 实现 section 入场动画
 */
function initScrollAnimations() {
  // 清理旧的 observer
  if (_AppState._scrollObserver) {
    _AppState._scrollObserver.disconnect();
  }

  // 为主页各区块添加 reveal 类
  var sections = document.querySelectorAll('[data-section]');
  for (var i = 0; i < sections.length; i++) {
    sections[i].classList.add('section-reveal');
  }

  // 为模块卡片添加子级 reveal
  var moduleBlocks = document.querySelectorAll('.module-block');
  for (var i = 0; i < moduleBlocks.length; i++) {
    moduleBlocks[i].classList.add('section-reveal-child');
    moduleBlocks[i].style.transitionDelay = (i * 0.08) + 's';
  }

  // 为统计项添加子级 reveal
  var statItems = document.querySelectorAll('.stat-item');
  for (var i = 0; i < statItems.length; i++) {
    statItems[i].classList.add('section-reveal-child');
    statItems[i].style.transitionDelay = (i * 0.1) + 's';
  }

  // 为流程步骤添加子级 reveal
  var processSteps = document.querySelectorAll('.process-step');
  for (var i = 0; i < processSteps.length; i++) {
    processSteps[i].classList.add('section-reveal-child');
    processSteps[i].style.transitionDelay = (i * 0.12) + 's';
  }

  _AppState._scrollObserver = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (entry.isIntersecting) {
        if (entry.target.classList.contains('section-reveal-child')) {
          entry.target.classList.add('section-reveal-child--visible');
        } else {
          entry.target.classList.add('section-reveal--visible');
        }
        // 区块可见后不再观察，但子元素继续观察以便 stagger
        if (!entry.target.classList.contains('section-reveal-child')) {
          _AppState._scrollObserver.unobserve(entry.target);
        }
      }
    }
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  // 观察所有目标元素
  var allReveals = document.querySelectorAll('.section-reveal, .section-reveal-child');
  for (var i = 0; i < allReveals.length; i++) {
    _AppState._scrollObserver.observe(allReveals[i]);
  }

  // 创建或更新滚动指示器
  setupScrollIndicator();
}

/**
 * 设置滚动指示器按钮
 */
function setupScrollIndicator() {
  var existing = document.getElementById('scrollIndicator');
  if (existing) return;

  var btn = document.createElement('button');
  btn.id = 'scrollIndicator';
  btn.className = 'scroll-down-indicator';
  btn.setAttribute('aria-label', '向下滚动');
  btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
  btn.addEventListener('click', function () {
    window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
  });
  document.body.appendChild(btn);

  // 监听滚动以显示/隐藏指示器
  var scrollTicking = false;
  window.addEventListener('scroll', function () {
    if (!scrollTicking) {
      requestAnimationFrame(function () {
        var scrollY = window.scrollY || window.pageYOffset;
        var docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (scrollY > 200 && scrollY < docHeight - 100) {
          btn.classList.add('scroll-down-indicator--visible');
        } else {
          btn.classList.remove('scroll-down-indicator--visible');
        }
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  }, { passive: true });
}

/**
 * 路由处理 — 根据当前路由渲染页面
 * @param {string} route - 路由路径
 */
var _routingInProgress = false;
var _pendingRoute = null;

/**
 * P0-1 路由访问检查：返回 { allowed } 或失败原因。
 * - auth:true  → 需已登录（含游客会话）
 * - role:'admin' → 需已登录且 user_group === 'admin'
 */
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
    '/bio-animation': 'bio-animation',
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
        '/bio-animation': 'initBioAnimation',
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
    'cell-loader': 1, 'lazy-images': 1, 'offline-queue': 1, 'offline-status': 1,
    'shortcut-panel': 1, 'hamburger': 1, 'micro-details': 1,
    'score-engine': 1, 'credit-metrics': 1 };
  var algo = { 'fsrs-algorithm': 1, 'fsrs-optimizer': 1, 'irt-engine': 1 };
  var ai = { 'ai-client': 1, 'ai-key-store': 1, 'ai-diagnostic-engine': 1, 'smart-diagnosis': 1, 'multi-agent': 1 };
  var admin = { 'admin': 1, 'admin-users': 1, 'admin-questions': 1, 'admin-cards': 1,
    'admin-community': 1, 'admin-ebook': 1, 'admin-ops': 1, 'admin-ocr': 1, 'admin-aigen': 1 };
  var engagement = { 'achievements': 1, 'badge-motifs': 1, 'eggs': 1, 'countdown': 1,
    'soundscape': 1, 'social-impact': 1, 'mood-tracker': 1, 'points-ui': 1,
    'notifications': 1, 'whiteboard': 1, 'tts': 1 };
  if (core[modName]) return 'core';
  if (algo[modName]) return 'algo';
  if (ai[modName]) return 'ai';
  if (admin[modName]) return 'admin';
  if (engagement[modName]) return 'engagement';
  return 'pages';
}

// 模块依赖表：加载某模块前先加载其依赖
var _moduleDeps = {
  'practice': ['question-model', 'question-utils', 'loader', 'rating'],
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
    'bio-animation': 'initBioAnimation',
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
      case '/bio-animation':
        _safeInit('initBioAnimation', route, target);
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
 * 主题切换（PRD §5-10：支持多套色彩主题）
 * @param {string} [theme] - 目标主题，不传则在 light/dark 之间切换
 *   支持: 'light', 'dark', 'amber', 'indigo', 'rose'
 */
function toggleTheme(theme) {
  const COLOR_THEMES = ['amber', 'indigo', 'rose'];

  if (theme && COLOR_THEMES.indexOf(theme) >= 0) {
    // 色彩主题（保留深色模式，仅改变强调色）
    _AppState.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'amber') {
      document.documentElement.style.setProperty('--color-amber', '#c4956a');
      document.documentElement.style.setProperty('--color-sage', '#5a7d5c');
      document.documentElement.style.setProperty('--color-accent', '#c4956a');
    } else if (theme === 'indigo') {
      document.documentElement.style.setProperty('--color-amber', '#7c8db5');
      document.documentElement.style.setProperty('--color-sage', '#4a6a8a');
      document.documentElement.style.setProperty('--color-accent', '#7c8db5');
    } else if (theme === 'rose') {
      document.documentElement.style.setProperty('--color-amber', '#c47a8a');
      document.documentElement.style.setProperty('--color-sage', '#8a5a6a');
      document.documentElement.style.setProperty('--color-accent', '#c47a8a');
    }
    if (typeof saveSetting === 'function') {
      saveSetting('theme', theme);
    } else {
      try { localStorage.setItem('bioquest-theme', theme); } catch (e) {}
    }
    return;
  }

  const current = _AppState.theme;
  let nextTheme;

  if (theme === 'light' || theme === 'dark') {
    nextTheme = theme;
  } else {
    nextTheme = current === 'light' ? 'dark' : 'light';
  }

  _AppState.theme = nextTheme;

  if (nextTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  if (typeof saveSetting === 'function') {
    saveSetting('theme', nextTheme);
  } else {
    try {
      localStorage.setItem('bioquest-theme', nextTheme);
    } catch (e) {
    }
  }

  const themeIcons = document.querySelectorAll('.theme-toggle');
  themeIcons.forEach((btn) => {
    btn.setAttribute('aria-label', nextTheme === 'dark' ? '切换浅色模式' : '切换深色模式');
    btn.setAttribute('title', nextTheme === 'dark' ? '切换浅色模式' : '切换深色模式');
  });
}

window.toggleTheme = toggleTheme;

/**
 * 汉堡菜单切换
 */
function toggleMobileMenu() {
  const hamburger = document.getElementById('hamburgerBtn');
  const mobileNav = document.getElementById('mobileNav');
  const overlay = document.getElementById('mobileOverlay');

  if (!hamburger || !mobileNav || !overlay) return;

  const isActive = hamburger.classList.contains('active');

  if (isActive) {
    hamburger.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileNav.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  } else {
    hamburger.classList.add('active');
    hamburger.setAttribute('aria-expanded', 'true');
    mobileNav.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * 空闲预加载底部标签页模块（练习/考试/仪表盘/个人中心）
 * 首屏渲染完成后的浏览器空闲时段提前拉取脚本，让首次点击标签接近"即点即开"，
 * 配合 handleRoute 的 loading 反馈，消除"点击后原地静默等待"
 */
var _tabModulesPrefetched = false;
function _prefetchTabModules() {
  if (_tabModulesPrefetched) return;
  _tabModulesPrefetched = true;

  var run = function () {
    // 弱网/离线时不预加载，避免无谓网络开销
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    var mods = ['practice', 'exam', 'dashboard', 'user'];
    mods.forEach(function (m) {
      if (typeof window.loadModule !== 'function') return;
      if (_loadedModules[m] || _loadingModules[m]) return;
      try { window.loadModule(m).catch(function () {}); } catch (e) {}
    });
  };

  if (typeof window.requestIdleCallback === 'function') {
    try { window.requestIdleCallback(run, { timeout: 3000 }); } catch (e) { setTimeout(run, 1500); }
  } else {
    setTimeout(run, 1500);
  }
}

/**
 * 关闭汉堡菜单
 */
function closeMobileMenu() {
  const hamburger = document.getElementById('hamburgerBtn');
  const mobileNav = document.getElementById('mobileNav');
  const overlay = document.getElementById('mobileOverlay');

  if (hamburger) {
    hamburger.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
  }
  if (mobileNav) mobileNav.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
}

/**
 * 绑定全局事件
 */
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
 * 延迟加载页面模块脚本
 * @param {string} moduleName - 模块名称
 * @returns {Promise<void>}
 */
async function loadPageModule(moduleName) {
  if (_AppState.pageModules[moduleName]) {
    return;
  }

  try {
    // 添加 cache-bust 参数避免浏览器缓存旧版模块（如 tutor.js）
    const module = await import(`./${moduleName}.js?v=20260809g`);
    _AppState.pageModules[moduleName] = module;
  } catch (err) {
    console.warn(`[TATABOX] 模块 ${moduleName} 加载失败:`, err.message);
  }
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
    var { data, error } = await sb.from('profiles').select('id,username').limit(1);
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
/**
 * AI 生物课堂入口页（v3.1）
 * 提供话题输入 + 推荐话题 + 一键生成课堂
 */
function renderClassroomPage(target) {
  // 推荐话题（覆盖联赛核心考点）
  var recommended = [
    { topic: '光合作用的光反应与暗反应', kgNodeId: 'photosynthesis' },
    { topic: '减数分裂与遗传规律', kgNodeId: 'meiosis' },
    { topic: 'DNA 复制的半保留机制', kgNodeId: 'dna' },
    { topic: '细胞呼吸的能量转化', kgNodeId: 'respiration' },
    { topic: '神经冲动的传导机制', kgNodeId: 'membrane' },
    { topic: '基因表达：转录与翻译', kgNodeId: 'transcription' }
  ];

  var cardsHtml = recommended.map(function (r, i) {
    return '<button class="cls-topic-card" data-topic="' + _escapeHtmlAttr(r.topic) + '" data-kg="' + _escapeHtmlAttr(r.kgNodeId) + '">'
      + '<span class="cls-topic-name">' + r.topic + '</span>'
      + '<span class="cls-topic-arrow">→</span>'
      + '</button>';
  }).join('');

  target.innerHTML = [
    '<div class="cls-page">',
    '  <div class="cls-page-header">',
    '    <h1 class="cls-page-title">AI 生物课堂</h1>',
    '    <p class="cls-page-subtitle">输入任意生物主题，AI 老师将为你生成 6 段式沉浸课堂：导入 → 讲解 → 模拟 → 讨论 → 测验 → 项目</p>',
    '  </div>',
    '  <div class="cls-input-row">',
    '    <input type="text" id="cls-topic-input" placeholder="例如：酶的竞争性抑制、C4 植物光合途径..." />',
    '    <button id="cls-start-btn">生成课堂</button>',
    '  </div>',
    '<div class="cls-section-label">或从推荐话题开始：</div>',
    '  <div class="cls-topic-grid">' + cardsHtml + '</div>',
    '  <div class="cls-ai-hint" id="cls-ai-hint"></div>',
    '  <div class="cls-mode-row" style="display:flex;align-items:center;gap:8px;margin-top:16px;padding:12px;background:#f8f9fa;border-radius:8px;font-size:13px;color:#666;flex-wrap:wrap;">',
    '    <span>课堂生成模式：</span>',
    '    <label><input type="radio" name="cls-mode" value="outline" checked /> 6 段式（v3.1 推荐）</label>',
    '    <label><input type="radio" name="cls-mode" value="v4" /> v4.0 4 段深化（[ACTION:] 标签流）</label>',
    '    <label><input type="radio" name="cls-mode" value="omaic" /> OpenMAIC 6 步进度</label>',
    '    <label><input type="radio" name="cls-mode" value="dsl" /> OpenMAIC DSL（完整 Slide）</label>',
    '    <span style="margin-left:auto;color:#999;">v4.0 模式：4 段课堂 + AI 老师输出含 [ACTION:] 标签驱动动画/图谱/测验</span>',
    '  </div>',
    '</div>'
  ].join('');

  // 绑定事件
  var input = target.querySelector('#cls-topic-input');
  var startBtn = target.querySelector('#cls-start-btn');
  var hint = target.querySelector('#cls-ai-hint');

  function startClassroom(topic, kgNodeId) {
    if (!topic) {
      hint.textContent = '请输入或选择一个话题';
      hint.style.color = '#d44';
      return;
    }
    if (!window.ClassroomPlayer) {
      hint.textContent = '课堂模块加载中，请稍后重试';
      hint.style.color = '#d44';
      return;
    }
    hint.textContent = '';
    // 读取模式
    var modeRadio = target.querySelector('input[name="cls-mode"]:checked');
    var mode = modeRadio ? modeRadio.value : 'outline';

    // 通用：选择正确的 GenProgress preset
    var presetMap = { outline: 'outline-6', omaic: 'omaic', dsl: 'dsl', v4: 'outline-4' };
    var preset = presetMap[mode] || 'outline-6';

    // 6 段式：直接调用 ClassroomPlayer 进行真实生成，不再显示假进度
    if (mode === 'outline') {
      if (!window.ClassroomPlayer) {
        hint.textContent = '课堂模块加载中，请稍后重试';
        hint.style.color = '#d44';
        return;
      }
      hint.textContent = '正在调用 AI 生成 6 段式课堂，请稍候...';
      hint.style.color = '#4a7c59';
      window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'outline' });
      return;
    }

    // v4.0 4 段深化模式：4 scene + [ACTION:] 标签流
    if (mode === 'v4') {
      if (!window.ClassroomPlayer || !window.Classroom || !window.Classroom.generateOutlineV4) {
        hint.textContent = 'v4.0 课堂模块加载中，请稍后重试';
        hint.style.color = '#d44';
        return;
      }
      hint.textContent = '正在调用 AI 生成 v4.0 4 段深化课堂（含 [ACTION:] 标签流）...';
      hint.style.color = '#4a7c59';
      window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'v4', mode: 'v4' });
      return;
    }

    if (mode === 'omaic') {
      // OpenMAIC 6 步进度模式：先显示生成进度，跑完进入 TATABOX 课堂
      if (!window.OpenMAICClassroomRunner) {
        hint.textContent = 'OpenMAIC Runner 未加载，降级为普通模式';
        hint.style.color = '#d44';
        window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'manual' });
        return;
      }
      hint.textContent = 'OpenMAIC 6 步生成中...';
      hint.style.color = '#4a7c59';
      window.OpenMAICClassroomRunner.startFromEntry({
        topic: topic,
        kgNodeId: kgNodeId || '',
        sourceType: 'manual',
        onClassroomReady: function () {
          window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'omaic' });
        }
      });
      return;
    }

    if (mode === 'dsl') {
      // OpenMAIC DSL：进度页 + 1 次 LLM 调用生成完整 Stage
      if (!window.OpenMAICGenProgress || !window.Classroom || !window.Classroom.generateStageDSL) {
        hint.textContent = 'DSL 组件未加载';
        hint.style.color = '#d44';
        return;
      }
      hint.textContent = 'OpenMAIC DSL 正在生成完整 Stage（生成中可最小化窗口）...';
      hint.style.color = '#4a7c59';
      // 缓存：先生成再播放
      var stageDataCache = null;
      var dslError = null;
      window.OpenMAICGenProgress.open({
        topic: topic,
        preset: 'dsl',
        hooks: {
          onStepStart: async () => { await sleep(300 + Math.random() * 200); },
          onStepEnd: async (idx) => {
            if (idx === 4) {
              // 第 5 步：实际调用 LLM 生成 Stage（带 90s 超时，与课堂一致）
              try {
                stageDataCache = await Promise.race([
                  window.Classroom.generateStageDSL(topic),
                  new Promise(function (_, reject) {
                    setTimeout(function () { reject(new Error('DSL 生成超时（90s）')); }, 90000);
                  })
                ]);
              } catch (e) {
                console.error('[DSL] generateStageDSL failed', e);
                dslError = e.message || String(e);
                stageDataCache = null;
                if (window.OpenMAICGenProgress.setStepStatus) {
                  window.OpenMAICGenProgress.setStepStatus(4, 'error', { preview: String(dslError).substring(0, 80) });
                }
              }
            }
          }
        },
        onComplete: function () {
          // DSL 失败 → 自动降级到 6 段式课堂
          if (!stageDataCache) {
            console.warn('[DSL] 降级到 6 段式课堂（DSL 生成失败）');
            showHint('DSL 课堂已自动降级到 6 段式（LLM 超时）', '#c4956a');
            setTimeout(function () {
              if (window.ClassroomPlayer && window.ClassroomPlayer.open) {
                window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'dsl-fallback' });
              }
            }, 50);
            return;
          }
          // DSL 降级（解析失败但有 fallback data）→ 仍可进入
          if (stageDataCache._isFallback) {
            showHint('DSL 解析已降级（LLM 输出异常），仍可进入课堂', '#c4956a');
          }
          if (window.ClassroomPlayer.openDSL) {
            window.ClassroomPlayer.openDSL(stageDataCache);
          } else if (window.Classroom.runDSLStage) {
            window.Classroom.runDSLStage(stageDataCache, { onSceneStart: function () {} });
          } else {
            // 终极降级：6 段式
            showHint('DSL 播放器未加载，已降级到 6 段式', '#c4956a');
            window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'dsl-fallback' });
          }
        }
      });
      return;
    }
    window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'manual' });
  }

  function showHint(text, color) {
    if (!hint) return;
    hint.textContent = text;
    hint.style.color = color || '#4a7c59';
  }

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  startBtn.addEventListener('click', function () {
    startClassroom(input.value.trim(), '');
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') startClassroom(input.value.trim(), '');
  });
  target.querySelectorAll('.cls-topic-card').forEach(function (card) {
    card.addEventListener('click', function () {
      startClassroom(card.getAttribute('data-topic'), card.getAttribute('data-kg'));
    });
  });
}

function _escapeHtmlAttr(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
window.renderClassroomPage = renderClassroomPage;

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

function openDonation() {
  const styleId = 'bioquest-donation-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .donation-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(5, 10, 7, 0.88);
        animation: donationFadeIn 0.25s ease;
      }

      .donation-overlay.closing {
        animation: donationFadeOut 0.2s ease forwards;
      }

      @keyframes donationFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes donationFadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }

      .donation-modal {
        position: relative;
        width: 90vw;
        max-width: 400px;
        max-height: 90vh;
        overflow-y: auto;
        background: #111613;
        border: 1px solid rgba(58, 140, 92, 0.2);
        border-radius: var(--radius-lg, 12px);
        padding: 36px 32px 28px;
        box-shadow: var(--shadow-floating)
                    0 20px 48px rgba(26, 42, 24, 0.25);
        animation: donationSlideUp 0.3s ease;
      }

      @keyframes donationSlideUp {
        from { opacity: 0; transform: translateY(24px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .donation-close {
        position: absolute;
        top: 12px;
        right: 14px;
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(255, 255, 255, 0.1);
        cursor: pointer;
        color: #e8e6e2;
        font-size: 1.4rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        line-height: 1;
      }
      .donation-close:hover {
        background: rgba(232, 168, 48, 0.2);
        color: #f5d491;
      }

      .donation-title {
        font-family: var(--font-serif, 'Noto Serif SC', serif);
        font-size: 1.45rem;
        font-weight: 700;
        color: #f5d491;
        text-align: center;
        margin-bottom: 16px;
        text-shadow: 0 0 12px rgba(232, 168, 48, 0.35);
      }

      .donation-desc {
        font-size: 0.95rem;
        color: #e8e6e2;
        text-align: center;
        line-height: 1.7;
        margin-bottom: 28px;
      }

      .donation-qr-area {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(232, 168, 48, 0.08);
        border: 1px solid rgba(232, 168, 48, 0.25);
        border-radius: var(--radius-md, 8px);
        margin-bottom: 20px;
      }

      .donation-link-btn {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 14px 28px;
        border-radius: var(--radius-md, 8px);
        background: #e8a830;
        color: #1a2f1d;
        font-weight: 700;
        font-size: 1rem;
        text-decoration: none;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        box-shadow: var(--shadow-lg);
      }
      .donation-link-btn:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg);
      }
      .donation-link-btn svg {
        width: 22px;
        height: 22px;
        stroke-width: 2.5;
      }

      .donation-thanks {
        text-align: center;
        font-size: 0.95rem;
        font-weight: 600;
        color: #e8a830;
        text-shadow: 0 0 8px rgba(232, 168, 48, 0.35);
      }

      [data-theme="dark"] .donation-overlay {
        background: rgba(0, 0, 0, 0.75);
      }

      [data-theme="light"] .donation-modal {
        background: #1a2a1e;
      }
      [data-theme="light"] .donation-desc {
        color: #f0eee9;
      }
      [data-theme="light"] .donation-title {
        color: #f5d491;
      }

      @media (max-width: 480px) {
        .donation-modal {
          padding: 24px 20px 20px;
        }
        .donation-title {
          font-size: 1.25rem;
        }
        .donation-qr-img {
          width: 160px;
          height: 160px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement('div');
  overlay.className = 'donation-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '赞赏支持');

  overlay.innerHTML = `
    <div class="donation-modal">
      <button class="donation-close" aria-label="关闭">&times;</button>
      <div class="donation-title">赞赏支持</div>
      <div class="donation-desc">TATABOX 是开源免费的高中生物学习平台。如果您觉得这个项目有帮助，欢迎通过爱发电支持我们持续维护和更新。</div>
      <div class="donation-qr-area">
        <a href="https://ifdian.net/a/astrnox" target="_blank" rel="noopener noreferrer" class="donation-link-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          在爱发电支持我们
        </a>
      </div>
      <div class="donation-thanks">感谢您的支持！</div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const closeDonation = () => {
    if (_donationFocusTrap) { _donationFocusTrap.release(); _donationFocusTrap = null; }
    overlay.classList.add('closing');
    overlay.addEventListener('animationend', () => {
      overlay.remove();
      document.body.style.overflow = '';
    }, { once: true });
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDonation();
  });

  overlay.querySelector('.donation-close').addEventListener('click', closeDonation);

  if (window.BioQuestA11y && typeof window.BioQuestA11y.trapFocus === 'function') {
    _donationFocusTrap = window.BioQuestA11y.trapFocus(overlay, {
      onEscape: closeDonation,
      initialFocus: overlay.querySelector('.donation-close')
    });
  }
}

window.openDonation = openDonation;
window.handleRoute = handleRoute;
window.navigateTo = navigateTo;

// 用户反馈系统

/**
 * 显示反馈弹窗
 */
function showFeedbackModal() {
  var existing = document.getElementById('feedback-modal');
  if (existing) {
    existing.classList.add('visible');
    return;
  }

  var overlay = document.createElement('div');
  overlay.id = 'feedback-modal';
  overlay.className = 'auth-modal-overlay';
  overlay.innerHTML = `
    <div class="auth-container" style="max-width:500px;">
      <button class="auth-close-btn" data-on='["closeFeedbackModal"]' title="关闭">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <div style="padding:24px 20px;">
        <h2 class="auth-form-title" style="margin-bottom:4px;">用户反馈</h2>
        <p class="auth-form-sub" style="margin-bottom:20px;">告诉我们你的想法，帮助我们改进 TATABOX</p>

        <div class="auth-field bq-mb-14">
          <label class="bq-hint--block-sm">反馈类型</label>
          <select id="feedback-type" style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:var(--text-primary,#e0e0e0);font-size:0.9rem;outline:none;">
            <option value="bug">Bug 报告</option>
            <option value="feature">功能建议</option>
            <option value="question_error">题目/内容纠错</option>
            <option value="suggestion">其他建议</option>
          </select>
        </div>

        <div class="auth-field bq-mb-14">
          <label class="bq-hint--block-sm">标题</label>
          <input type="text" id="feedback-title" class="auth-input" placeholder="简要描述你的反馈" style="width:100%;box-sizing:border-box;">
        </div>

        <div class="auth-field bq-mb-14">
          <label class="bq-hint--block-sm">详细描述</label>
          <textarea id="feedback-description" class="auth-input" placeholder="请详细描述问题或建议..." style="width:100%;box-sizing:border-box;min-height:100px;resize:vertical;font-family:inherit;" rows="4"></textarea>
        </div>

        <div class="auth-field bq-mb-14">
          <label class="bq-hint--block-sm">联系方式（选填）</label>
          <input type="text" id="feedback-contact" class="auth-input" placeholder="QQ/微信/邮箱，方便我们回复" style="width:100%;box-sizing:border-box;">
        </div>

        <div style="margin-bottom:14px;padding:10px 12px;background:rgba(58,140,92,0.08);border:1px solid rgba(58,140,92,0.25);border-radius:8px;font-size:0.82rem;color:var(--text-secondary,#9aa5a0);line-height:1.6;">
          想得到更快的回复，建议直接去 GitHub 提 Issue（有模板，填起来很快）：
          <br>
          <button type="button" data-stop-propagation data-on='["_cspOpenGitHub"]' style="margin-top:8px;padding:6px 14px;border-radius:8px;background:rgba(58,140,92,0.15);border:1px solid rgba(58,140,92,0.4);color:#7fd0a3;font-size:0.82rem;cursor:pointer;">前往 GitHub 提 Issue →</button>
        </div>

        <button type="button" class="auth-btn" data-on='["handleFeedbackSubmit"]' data-prevent-default style="width:100%;">提交反馈</button>
        <p class="auth-error" id="feedback-error" style="margin-top:8px;"></p>
        <p style="margin-top:14px;text-align:center;font-size:0.78rem;color:rgba(255,255,255,0.35);">作者（高中生）较忙，回复可能偏慢，见谅 · 作者 astrnox · astrnox@163.com · QQ 3930523703</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeFeedbackModal();
  });

  setTimeout(function() { overlay.classList.add('visible'); }, 10);
}

/**
 * 关闭反馈弹窗
 */
function closeFeedbackModal() {
  var modal = document.getElementById('feedback-modal');
  if (modal) modal.classList.remove('visible');
}

/**
 * 提交反馈
 */
function handleFeedbackSubmit() {
  var type = document.getElementById('feedback-type').value;
  var title = document.getElementById('feedback-title').value.trim();
  var description = document.getElementById('feedback-description').value.trim();
  var contact = document.getElementById('feedback-contact').value.trim();
  var errorEl = document.getElementById('feedback-error');

  if (!title) {
    if (errorEl) errorEl.textContent = '请填写标题';
    return;
  }
  if (!description) {
    if (errorEl) errorEl.textContent = '请填写详细描述';
    return;
  }

  var currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  var feedback = {
    id: 'fb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: type,
    title: title,
    description: description,
    contact: contact || '',
    user: currentUser ? { id: currentUser.id, username: currentUser.username } : null,
    createdAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  // 存储到 localStorage
  try {
    var existing = [];
    var raw = localStorage.getItem('bioquest_feedbacks');
    if (raw) existing = JSON.parse(raw);
    if (!Array.isArray(existing)) existing = [];
    existing.push(feedback);
    localStorage.setItem('bioquest_feedbacks', JSON.stringify(existing));
  } catch (e) {
    if (errorEl) {
      errorEl.textContent = '存储失败：' + errText(e);
      return;
    }
  }

  // 尝试发送到 Supabase（如果已登录）
  if (currentUser && !currentUser.isGuest) {
    try {
      var sb = (typeof getSupabase === 'function') ? getSupabase() : null;
      if (sb) {
        sb.from('feedbacks').insert({
          type: type,
          title: title,
          description: description,
          contact: contact || '',
          user_id: currentUser.id,
          user_agent: navigator.userAgent
        }).then(function() { /* 静默 */ }).catch(function() { /* 静默 */ });
      }
    } catch (e) { /* 静默 */ }
  }

  closeFeedbackModal();
  showToast('感谢你的反馈！我们会认真查看每一条建议');
}

/**
 * P1-21：带“撤销”按钮的操作反馈条，用于删除等可逆操作。
 * 自动经过 options.duration 后消失（不触发撤销）；点“撤销”则执行 onUndo 并收起。
 * 返回 { dismiss }，调用方可主动收起（例如已重新恢复场景）。
 * 仅用 DOM API + addEventListener，无内联脚本（符合 CSP）。
 * @param {string} message - 提示文本
 * @param {Function} onUndo - 点撤销时执行的回调
 * @param {Object} [options] - { duration, label }
 * @returns {{ dismiss: Function }}
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

document.addEventListener('DOMContentLoaded', initApp);

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  setTimeout(initApp, 0);
}