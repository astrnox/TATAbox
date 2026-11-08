/**
 * TATABOX — 主题切换 / 移动端菜单 / 标签页预取（M-01 自 app.js 拆分）
 * ------------------------------------------------------------
 * 由 index.html 在 app.js 之后以 defer 加载；运行期依赖 app.js 的
 * _AppState、_loadedModules/_loadingModules 与全局 saveSetting/loadModule。
 * 对外全局入口（toggleTheme / toggleMobileMenu / closeMobileMenu /
 * _prefetchTabModules）保持不变。
 * ============================================================
 */
'use strict';

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

// M-01：显式挂载对外入口（header 按钮与 initApp/bindEvents 仍按原名调用）
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window._prefetchTabModules = _prefetchTabModules;

// 注册到全站唯一命名空间（window.BioQuest，Q-03 约定；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.app = BQ.app || {};
  BQ.app.shell = {
    toggleTheme: toggleTheme,
    toggleMobileMenu: toggleMobileMenu,
    closeMobileMenu: closeMobileMenu,
    prefetchTabModules: _prefetchTabModules
  };
})();
