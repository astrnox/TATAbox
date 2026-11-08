/**
 * 启动辅助（defer 加载，非首帧关键）：
 *  - __loadSupabaseFallback / __loadSupabaseSDK：延迟加载 Supabase SDK，不阻塞 DOMContentLoaded
 *  - data-route 点击委托兜底：app.js 未就绪时由本脚本处理 [data-route] 导航
 */
(function () {
  // 将 <link rel="preload" as="style" data-css-async> 提升为真正生效的样式表（等价于 onload 切换 rel）。
  // 必须在 DOMContentLoaded 前执行；defer 脚本在解析完成后、DOMContentLoaded 前运行，时机满足。
  function promoteAsyncCss() {
    var links = document.querySelectorAll('link[rel="preload"][as="style"][data-css-async]');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      link.rel = 'stylesheet';
      link.removeAttribute('data-css-async');
    }
  }
  if (document.readyState === 'interactive' || document.readyState === 'complete') promoteAsyncCss();
  else document.addEventListener('DOMContentLoaded', promoteAsyncCss);

  // 注：原此处加载 hero-sketch（首屏随机粒子背景），已移除。
  // 首屏背景改为纯 CSS 静态层次，见 css/home.css 的 .hero-bg。

  // L-07：KaTeX 样式本地优先，加载失败时回退 CDN（CDN 样式带 SRI）。
  // 样式表在 defer 阶段才挂载：KaTeX 非首屏依赖，不影响首屏渲染。
  function loadKatexCss() {
    var LOCAL_KATEX_CSS = 'css/vendor/katex.min.css';
    var REMOTE_KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
    var REMOTE_KATEX_SRI = 'sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV';
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LOCAL_KATEX_CSS;
    link.setAttribute('data-katex-css', 'local');
    link.onerror = function () {
      if (window.BQLog && window.BQLog.warn) {
        window.BQLog.warn('[KaTeX] 本地样式加载失败，回退 CDN');
      } else {
        console.warn('[TATABOX] KaTeX 本地样式加载失败，回退 CDN');
      }
      var remote = document.createElement('link');
      remote.rel = 'stylesheet';
      remote.href = REMOTE_KATEX_CSS;
      remote.integrity = REMOTE_KATEX_SRI;
      remote.crossOrigin = 'anonymous';
      remote.setAttribute('data-katex-css', 'remote');
      document.head.appendChild(remote);
    };
    document.head.appendChild(link);
  }
  loadKatexCss();

  // #104：动态注入同样固定精确版本并携带 SRI integrity（与各页面静态
  // <script> 标签一致），杜绝"版本漂移 + 供应链被替换"风险。
  var SUPABASE_JS_VERSION = '2.115.0';
  var SUPABASE_JS_SRI = 'sha384-EyR2P0dlmjnEGcm9xcjdAn0VedZpRHEwDLP9oSS6wYMvzHBHkUrvgonveazJ/sSx';
  window.__supabaseLoaded = false;
  window.__loadSupabaseFallback = function (script) {
    if (window.__supabaseLoaded || typeof window.supabase !== 'undefined') return;
    var s = document.createElement('script');
    s.src = 'https://unpkg.com/@supabase/supabase-js@' + SUPABASE_JS_VERSION + '/dist/umd/supabase.min.js';
    s.defer = true;
    s.onerror = function () {
      console.warn('[TATABOX] Supabase SDK 镜像加载失败，将使用本地存储模式');
      document.documentElement.classList.add('supabase-fallback');
      if (typeof window.showStorageStatus === 'function') window.showStorageStatus('local');
    };
    document.head.appendChild(s);
  };

  function __loadSupabaseSDK() {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@' + SUPABASE_JS_VERSION;
    s.integrity = SUPABASE_JS_SRI;
    s.crossOrigin = 'anonymous';
    s.defer = true;
    s.onload = function () { window.__supabaseLoaded = true; };
    s.onerror = function () { window.__loadSupabaseFallback(this); };
    document.head.appendChild(s);
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(__loadSupabaseSDK, { timeout: 3000 });
  } else {
    setTimeout(__loadSupabaseSDK, 1000);
  }

  // app.js 加载后会暴露 navigateTo，此时由 app.js 统一处理；这里仅作兜底
  document.addEventListener('click', function (e) {
    // 跳过链接：不改变 hash（避免被 SPA 路由当作未知路由），直接聚焦主内容区
    var skip = e.target.closest && e.target.closest('.skip-link');
    if (skip) {
      e.preventDefault();
      var main = document.getElementById('page-content');
      if (main) {
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        try { main.focus({ preventScroll: true }); } catch (err) { main.focus(); }
      }
      return;
    }
    // data-action 委托：调用 window 上的同名函数（如 showFeedbackModal / openDonation）
    var actionEl = e.target.closest('[data-action]');
    if (actionEl && !actionEl.getAttribute('data-route')) {
      var fnName = actionEl.getAttribute('data-action');
      var fn = fnName && window[fnName];
      if (typeof fn === 'function') {
        e.preventDefault();
        fn.call(actionEl);
        return;
      }
    }
    if (typeof window.navigateTo === 'function') return;
    var link = e.target.closest('[data-route]');
    if (link) {
      var route = link.getAttribute('data-route');
      if (route && route.startsWith('/')) {
        e.preventDefault();
        window.location.hash = route;
      }
    }
  });
})();
