/**
 * M-01：user.js 子模块拆分回归
 * -------------------------------------------------
 * user.js 只保留共享工具（showToast / escapeHtml / user key / fallback copy），
 * 各面板与入口拆到 user-*.js，并通过 loadModule('user') 依赖链先行加载。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('M-01 user.js 子模块拆分', () => {
  test('面板/入口实现已移出 user.js', () => {
    const src = read('js/pages/user.js');
    [
      'function injectUserStyles',
      'function getAvatarUrl',
      'function renderProfilePanel',
      'function renderSettingsPanel',
      'var _AI_DAILY_LIMIT',
      'var _POINTS_STORAGE',
      'function renderDataManagement',
      'function renderRecordsPanel',
      'function renderUserPage',
      'function initUser'
    ].forEach((sig) => expect(src).not.toContain(sig));
  });

  test('user.js 保留共享工具', () => {
    const src = read('js/pages/user.js');
    expect(src).toContain('function showToast');
    expect(src).toContain('var escapeHtml');
    expect(src).toContain('function _getUserKey');
    expect(src).toContain('function _fallbackCopy');
  });

  test('各子模块提供原函数与命名空间入口', () => {
    const checks = [
      ['js/pages/user-styles.js', ['function injectUserStyles', 'BQ.user.styles', 'css/user-styles.css']],
      ['js/pages/user-avatar.js', ['function getAvatarUrl', 'function setupAvatarUpload', 'BQ.user.avatar']],
      ['js/pages/user-profile.js', ['function renderProfilePanel', 'function renderSettingsPanel', 'BQ.user.profile']],
      ['js/pages/user-ai-key.js', ['var _AI_DAILY_LIMIT', 'function _testAiKeyConnection', 'BQ.user.aiKey']],
      ['js/pages/user-points.js', ['function addPoints', 'function getPoints', 'BQ.user.points']],
      ['js/pages/user-data.js', ['function renderDataManagement', 'BQ.user.data']],
      ['js/pages/user-panels.js', ['function renderRecordsPanel', 'function renderAchievementsPanel', 'BQ.user.panels']],
      ['js/pages/user-page.js', ['function renderUserPage', 'function initUser', 'BQ.user.page']]
    ];
    for (const [file, sigs] of checks) {
      const src = read(file);
      sigs.forEach((sig) => expect(src).toContain(sig));
    }
  });

  test('个人中心 CSS 已外置为独立样式表', () => {
    const js = read('js/pages/user-styles.js');
    expect(js).not.toContain('style.textContent');
    expect(js).toContain("link.href = 'css/user-styles.css");
    const css = read('css/user-styles.css');
    expect(css).toContain('.user-grid');
    expect(css).toContain('.user-card');
    expect(read('sw.js')).toContain("'./css/user-styles.css'");
  });

  test('模块依赖与 SW 预热已接入', () => {
    const modules = read('js/core/app-modules.js');
    expect(modules).toMatch(/'user':\s*\[[^\]]*'user-styles'/);
    expect(modules).toMatch(/'user':\s*\[[^\]]*'user-page'/);
    const sw = read('sw.js');
    ['styles', 'avatar', 'profile', 'ai-key', 'points', 'data', 'panels', 'page'].forEach((name) => {
      expect(sw).toContain("'./js/pages/user-" + name + ".js'");
    });
  });
});
