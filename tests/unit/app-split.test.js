/**
 * M-01：app.js 隐私模块拆分回归
 * -------------------------------------------------
 * 隐私政策页与首次访问提示拆到 app-privacy.js，app.js 仍按原名调用。
 * 同时锁定 M-13：隐私页/提示不再使用硬编码浅色，暗色下自动适配。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('M-01 app.js 隐私/捐赠模块拆分', () => {
  test('隐私/捐赠实现已移出 app.js', () => {
    const src = read('js/core/app.js');
    expect(src).not.toContain('function renderPrivacyPage');
    expect(src).not.toContain('function _maybeShowPrivacyNotice');
    expect(src).not.toContain('function _privacySection');
    expect(src).not.toContain('function openDonation');
    expect(src).not.toContain('var _donationFocusTrap');
    expect(src).not.toContain('function toggleTheme');
    expect(src).not.toContain('function toggleMobileMenu');
    expect(src).not.toContain('function closeMobileMenu');
    expect(src).not.toContain('function _prefetchTabModules');
    expect(src).not.toContain('function renderClassroomPage');
    expect(src).not.toContain('function _escapeHtmlAttr');
    expect(src).not.toContain('function _resolveAuthReady');
    expect(src).not.toContain('async function initSupabase');
    expect(src).not.toContain('function renderResetPasswordPage');
    expect(src).not.toContain('function handleResetPasswordSubmit');
    expect(src).not.toContain('function reinitHomeComponents');
    expect(src).not.toContain('function updateBottomTabBar');
    expect(src).not.toContain('function _checkRouteAccess');
    expect(src).not.toContain('function handleRoute');
    expect(src).not.toContain('function doRouteRender');
    expect(src).not.toContain('window.loadModule = function');
    expect(src).not.toContain('function bindEvents');
    expect(src).not.toContain('function restoreSettings');
    expect(src).not.toContain('function initApp');
    expect(src).not.toContain('function showFeedbackModal');
    expect(src).not.toContain('function closeFeedbackModal');
    expect(src).not.toContain('function handleFeedbackSubmit');
    expect(src).not.toContain('document.addEventListener(\'DOMContentLoaded\', initApp)');
  });

  test('页面桩/启动/反馈模块各自提供原函数', () => {
    const expectFn = (file, names) => {
      const src = read(file);
      names.forEach((n) => expect(src).toContain(n));
    };
    expectFn('js/core/app-pages.js', ['function renderPracticePage', 'function renderExamPage', 'function renderAnalyticsPage', 'function renderUserPage', 'function renderCardsPage']);
    expectFn('js/core/app-boot.js', ['function bindEvents', 'function restoreSettings', 'function initApp', "addEventListener('DOMContentLoaded', initApp)"]);
    expectFn('js/core/app-feedback.js', ['function showFeedbackModal', 'function closeFeedbackModal', 'function handleFeedbackSubmit']);
  });

  test('认证/首页/路由/模块模块各自提供原函数', () => {
    const expectFn = (file, names) => {
      const src = read(file);
      names.forEach((n) => expect(src).toContain(n));
    };
    expectFn('js/core/app-auth.js', ['function _resolveAuthReady', 'async function initSupabase', 'function renderResetPasswordPage', 'function handleResetPasswordSubmit']);
    expectFn('js/core/app-home.js', ['function reinitHomeComponents', 'function initNonCriticalHomeModules', 'function updateBottomTabBar']);
    expectFn('js/core/app-router.js', ['function _checkRouteAccess', 'function handleRoute']);
    expectFn('js/core/app-modules.js', ['function doRouteRender', 'window.loadModule = function', 'var _moduleDeps']);
  });

  test('app-classroom.js 提供课堂入口页', () => {
    const src = read('js/core/app-classroom.js');
    expect(src).toContain('function renderClassroomPage');
    expect(src).toContain('function _escapeHtmlAttr');
    expect(src).toContain('window.renderClassroomPage = renderClassroomPage;');
  });

  test('app-shell.js 提供主题/菜单/预取入口', () => {
    const src = read('js/core/app-shell.js');
    ['toggleTheme', 'toggleMobileMenu', 'closeMobileMenu', '_prefetchTabModules'].forEach((fn) => {
      expect(src).toContain('function ' + fn);
    });
    expect(src).toContain('window.toggleTheme = toggleTheme;');
    expect(src).toContain('window.toggleMobileMenu = toggleMobileMenu;');
    expect(src).toContain('window.closeMobileMenu = closeMobileMenu;');
    expect(src).toContain('window._prefetchTabModules = _prefetchTabModules;');
  });

  test('app-donation.js 提供捐赠弹窗与原全局入口', () => {
    const src = read('js/core/app-donation.js');
    expect(src).toContain('function openDonation');
    expect(src).toContain('var _donationFocusTrap = null;');
    expect(src).toContain('window.openDonation = openDonation;');
  });

  test('app-privacy.js 提供原函数并挂载全局入口', () => {
    const src = read('js/core/app-privacy.js');
    expect(src).toContain('function renderPrivacyPage');
    expect(src).toContain('function _privacySection');
    expect(src).toContain('function _maybeShowPrivacyNotice');
    expect(src).toContain('window.renderPrivacyPage = renderPrivacyPage;');
    expect(src).toContain('window._maybeShowPrivacyNotice = _maybeShowPrivacyNotice;');
  });

  test('index.html 在 app.js 之后加载，SW 骨架已缓存', () => {
    const html = read('index.html');
    const appIdx = html.indexOf('js/core/app.js');
    const privacyIdx = html.indexOf('js/core/app-privacy.js');
    const donationIdx = html.indexOf('js/core/app-donation.js');
    const shellIdx = html.indexOf('js/core/app-shell.js');
    const classroomIdx = html.indexOf('js/core/app-classroom.js');
    const authIdx = html.indexOf('js/core/app-auth.js');
    const homeIdx = html.indexOf('js/core/app-home.js');
    const routerIdx = html.indexOf('js/core/app-router.js');
    const modulesIdx = html.indexOf('js/core/app-modules.js');
    const pagesIdx = html.indexOf('js/core/app-pages.js');
    const bootIdx = html.indexOf('js/core/app-boot.js');
    const feedbackIdx = html.indexOf('js/core/app-feedback.js');
    expect(appIdx).toBeGreaterThanOrEqual(0);
    [privacyIdx, donationIdx, shellIdx, classroomIdx, authIdx, homeIdx, routerIdx, modulesIdx, pagesIdx, bootIdx, feedbackIdx].forEach((idx) => {
      expect(idx).toBeGreaterThan(appIdx);
    });
    // 路由先于模块加载（handleRoute 运行时依赖 doRouteRender）
    expect(routerIdx).toBeGreaterThan(homeIdx);
    expect(modulesIdx).toBeGreaterThan(routerIdx);
    // boot 最后加载并触发 initApp
    expect(bootIdx).toBeGreaterThan(classroomIdx);
    expect(feedbackIdx).toBeGreaterThan(bootIdx);
    ['app-auth', 'app-home', 'app-router', 'app-modules', 'app-pages', 'app-privacy', 'app-donation', 'app-shell', 'app-classroom', 'app-boot', 'app-feedback'].forEach((name) => {
      expect(read('sw.js')).toContain("'./js/core/" + name + ".js'");
    });
  });

  test('M-13：隐私页颜色走语义令牌而非硬编码浅色', () => {
    const src = read('js/core/app-privacy.js');
    expect(src).toContain('var(--bg-page, #f7f5f0)');
    expect(src).toContain('var(--bg-surface, #ffffff)');
    expect(src).toContain('var(--text-primary');
    expect(src).toContain('var(--border-subtle');
    expect(src).not.toMatch(/background\s*:\s*#ffffff/);
  });
});
