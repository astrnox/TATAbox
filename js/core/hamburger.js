/**
 * ============================================================
 * TATABOX — 全站统一汉堡菜单模块
 * 以主页（index.html）的移动端导航为准，供其它多页页面（MPA）
 * 复用，保证所有界面的汉堡菜单结构、交互与主页完全一致。
 *
 * 用法：
 *   1. 在页面 <head> 引入：<script src="js/core/hamburger.js" defer></script>
 *   2. 在页面底部调用：window.BioQuestHamburger.init()
 *      （若页面 #mobileNav 为主页简化版，可先调用 render() 注入主页结构）
 *
 * 依赖页面需存在：
 *   <button id="hamburgerBtn">、<div id="mobileOverlay">、<nav id="mobileNav">
 *   （CSS 由 css/header.css 提供）
 * ============================================================
 */
(function () {
  'use strict';

  // 判断当前页是否为主页（index.html 或站点根目录）
  // 主页的 SPA 路由用 "#/..."；其它页面需跳转到 "index.html#/..." 
  function isHomePage() {
    var path = location.pathname || '';
    return path === '/' || path.toLowerCase().indexOf('index.html') !== -1;
  }

  // 路由前缀：MPA 页面统一回主页
  var BASE = isHomePage() ? '' : 'index.html';

  // 与主页一致的移动端导航结构（BASE 用于修正 SPA 路由前缀）
  var MOBILE_NAV_HTML = [
    '<div class="mn-header">',
    '  <div class="mn-brand">',
    '    <svg width="30" height="30" viewBox="0 0 28 28" fill="none" aria-hidden="true">',
    '      <circle cx="14" cy="14" r="12" stroke="#e8a830" stroke-width="2"/>',
    '      <circle cx="14" cy="14" r="4" fill="#e8a830"/>',
    '      <path d="M14 2v4M14 22v4M2 14h4M22 14h4" stroke="#5a7d5c" stroke-width="1.5"/>',
    '    </svg>',
    '    <span class="mn-brand-name">TATABOX</span>',
    '  </div>',
    '  <button id="mobileNavClose" class="mn-close" aria-label="关闭菜单">×</button>',
    '</div>',
    '<div class="mn-body">',
    '  <a href="' + BASE + '#/" class="mn-home">首页</a>',
    '  <div class="mn-section"><div class="mn-section-label">学习</div>',
    '    <a href="' + BASE + '#/study?tab=hub">学习管理</a>',
    '    <a href="' + BASE + '#/practice">练习</a>',
    '    <a href="' + BASE + '#/exam">模考</a>',
    '    <a href="' + BASE + '#/wrongbook">错题录题</a>',
    '  </div>',
    '  <div class="mn-section"><div class="mn-section-label">题库</div>',
    '    <a href="quiz.html">试题</a>',
    '    <a href="cards.html">卡片</a>',
    '  </div>',
    '  <div class="mn-section"><div class="mn-section-label">探索</div>',
    '    <a href="' + BASE + '#/videos">动画视频</a>',
    '    <a href="biology-history.html">生物学史</a>',
    '    <a href="wiki.html">生物百科</a>',
    '    <a href="' + BASE + '#/knowledge-graph">图谱</a>',
    '    <a href="' + BASE + '#/bio-lab">实验室</a>',
    '    <a href="' + BASE + '#/phet-sims">PhET 模拟</a>',
    '    <a href="' + BASE + '#/sketch">画板</a>',
    '    <a href="' + BASE + '#/smiles">SMILES</a>',
    '    <a href="' + BASE + '#/molecules">3D 分子</a>',
    '    <a href="' + BASE + '#/genome">基因组</a>',
    '  </div>',
    '  <div class="mn-section"><div class="mn-section-label">智能与社区</div>',
    '    <a href="' + BASE + '#/tutor">AI 对话</a>',
    '    <a href="' + BASE + '#/community">社区</a>',
    '    <a href="' + BASE + '#/daily-billion">每日亿题</a>',
    '    <a href="#" role="button" id="nav-leaderboard-btn">排行</a>',
    '  </div>',
    '  <div class="mn-section"><div class="mn-section-label">账户</div>',
    '    <a href="' + BASE + '#/dashboard">仪表盘</a>',
    '    <a href="' + BASE + '#/trends">趋势</a>',
    '    <a href="' + BASE + '#/teacher">教师</a>',
    '    <a href="' + BASE + '#/user">我的</a>',
    '  </div>',
    '</div>',
    '<div class="theme-toggle-row">',
    '  <span>主题模式</span>',
    '  <button class="theme-toggle theme-toggle--mobile" id="themeToggleMobile" aria-label="切换主题">',
    '    <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    '    <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    '  </button>',
    '</div>'
  ].join('\n');

  // 与主页一致的抽屉导航样式（主页经 debug-fix.css 提供；其它页面由此注入，保证渲染一致）
  var HAMBURGER_STYLES = [
    '#mobileNav .mn-header { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; padding:16px 14px 14px 20px; border-bottom:1px solid var(--color-border-light, rgba(0,0,0,0.08)); }',
    '#mobileNav .mn-brand { display:flex; align-items:center; gap:10px; }',
    '#mobileNav .mn-brand-name { font-family:var(--font-serif); font-weight:700; font-size:1.15rem; color:var(--color-deep,#1a2f1d); }',
    '#mobileNav .mn-close { width:34px; height:34px; border:none; border-radius:8px; background:var(--color-surface-sunken, rgba(0,0,0,0.05)); color:var(--color-text-muted,#8a8578); font-size:1.05rem; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background 0.2s,color 0.2s,transform 0.2s; }',
    '#mobileNav .mn-close:hover { background:rgba(90,125,92,0.14); color:var(--color-primary); transform:rotate(90deg); }',
    '#mobileNav .mn-body { flex:1 1 auto; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:6px 0 18px; }',
    '#mobileNav .mn-home { display:flex; align-items:center; margin:8px 12px 4px; padding:12px 16px; border-radius:12px; font-weight:600; color:var(--color-text,#2d2d2d); text-decoration:none; background:var(--color-surface-sunken, rgba(0,0,0,0.04)); transition:background 0.18s,color 0.18s; }',
    '#mobileNav .mn-home:hover, #mobileNav .mn-home.active { background:rgba(90,125,92,0.14); color:var(--color-primary); }',
    '#mobileNav .mn-section { padding:12px 0 6px; }',
    '#mobileNav .mn-section + .mn-section { margin-top:2px; }',
    '#mobileNav .mn-section-label { font-size:0.66rem; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:var(--color-text-muted,#8a8578); padding:0 20px 8px; }',
    '#mobileNav .mn-section a { display:flex; align-items:center; gap:10px; padding:11px 20px; color:var(--color-text,#2d2d2d); text-decoration:none; font-size:0.95rem; font-weight:500; border-left:3px solid transparent; transition:background-color 0.18s,color 0.18s,border-left-color 0.18s; }',
    '#mobileNav .mn-section a:hover, #mobileNav .mn-section a.active { background:rgba(90,125,92,0.12); color:var(--color-primary,#3a6b4a); border-left-color:var(--color-primary,#3a6b4a); }',
    '#mobileNav .theme-toggle-row { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; margin-top:0; padding:14px 20px; border-top:1px solid var(--color-border-light, rgba(0,0,0,0.08)); color:var(--color-text,#2d2d2d); font-size:0.875rem; }',
    '#mobileNav .mn-body a { opacity:1 !important; transform:none !important; }'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('bq-hamburger-styles')) return;
    var style = document.createElement('style');
    style.id = 'bq-hamburger-styles';
    style.textContent = HAMBURGER_STYLES;
    document.head.appendChild(style);
  }

  /**
   * 将主页导航结构注入当前页面的 #mobileNav。
   * - 主页本身已有该结构（含 .mn-body），自动跳过，避免重复。
   * - 其它页面用主页结构替换原有简化导航，并注入所需样式。
   */
  function render() {
    var nav = document.getElementById('mobileNav');
    if (!nav) return;
    // 主页已有完整结构，无需注入
    if (nav.querySelector('.mn-body')) return;
    nav.setAttribute('aria-label', '导航菜单');
    nav.innerHTML = MOBILE_NAV_HTML;
    injectStyles();
  }

  /**
   * 绑定汉堡菜单交互（与主页 toggleMobileMenu/closeMobileMenu 行为一致）。
   * 需在 render() 之后调用（或页面已内置主页结构）。
   */
  function init() {
    var hamburger = document.getElementById('hamburgerBtn');
    var mobileNav = document.getElementById('mobileNav');
    var overlay = document.getElementById('mobileOverlay');
    if (!hamburger || !mobileNav || !overlay) return;

    function setActive(active) {
      hamburger.classList.toggle('active', !!active);
      hamburger.setAttribute('aria-expanded', active ? 'true' : 'false');
      mobileNav.classList.toggle('active', !!active);
      overlay.classList.toggle('active', !!active);
      document.body.style.overflow = active ? 'hidden' : '';
    }

    hamburger.addEventListener('click', function (e) {
      e.preventDefault();
      setActive(!hamburger.classList.contains('active'));
    });
    overlay.addEventListener('click', function () { setActive(false); });

    var closeBtn = document.getElementById('mobileNavClose');
    if (closeBtn) closeBtn.addEventListener('click', function () { setActive(false); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setActive(false);
    });

    // 点击菜单内链接后自动收起
    mobileNav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setActive(false);
    });

    // 主题切换（与主页一致）：切换 documentElement 的 data-theme 并持久化
    function bindThemeToggle() {
      var toggles = document.querySelectorAll('.theme-toggle--mobile, .theme-toggle');
      if (!toggles.length) return;
      toggles.forEach(function (btn) {
        if (btn._bqBound) return;
        btn._bqBound = true;
        btn.addEventListener('click', function () {
          var next = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          try { localStorage.setItem('bioquest_theme', next); } catch (e) {}
          toggles.forEach(function (b) {
            b.setAttribute('aria-label', next === 'dark' ? '切换浅色模式' : '切换深色模式');
            b.setAttribute('title', next === 'dark' ? '切换浅色模式' : '切换深色模式');
          });
        });
      });
    }
    bindThemeToggle();
  }

  window.BioQuestHamburger = {
    render: render,
    init: init,
    isHomePage: isHomePage
  };
})();