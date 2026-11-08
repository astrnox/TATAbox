/**
 * M-13：暗色模式回归测试
 * -------------------------------------------------
 * 背景：Issue #182 —— 暗色下部分组件仍使用亮色硬编码底/文字，
 * 出现「浅底 + 浅字」或「亮块刺眼」。
 * 本测试锁定两条基线：
 *   1) 语义令牌在 [data-theme="dark"] 下必须重映射核心表面/文字；
 *   2) 已修复的浅色背景组件必须保留暗色覆盖，防止回潮。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('M-13 暗色模式', () => {
  test('theme-init：显式选择优先，否则跟随系统偏好', () => {
    const src = read('js/core/theme-init.js');
    expect(src).toContain("localStorage.getItem('bioquest-theme')");
    expect(src).toMatch(/prefers-color-scheme:\s*dark/);
    expect(src).toContain("setAttribute('data-theme', 'dark')");
  });

  test('语义令牌在暗色下重映射页面/表面/文字', () => {
    const tokens = read('css/tokens.css');
    const darkBlock = tokens.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/);
    expect(darkBlock).toBeTruthy();
    const body = darkBlock[1];
    ['--bg-page', '--bg-surface', '--bg-elevated', '--text-primary', '--text-secondary', '--border-subtle'].forEach((key) => {
      expect(body).toContain(key + ':');
    });
  });

  test('已修复组件保留暗色覆盖（防浅底浅字回潮）', () => {
    const checks = [
      ['css/ebook.css', '.ebook-key-point-card'],
      ['css/phet-sims.css', '.phet-modal-fallback'],
      ['css/practice.css', '.practice-loading-overlay'],
      ['css/habits.css', '.calendar-day.intensity-100'],
      ['css/globals.css', '.search-filter-chip:hover'],
      ['css/globals.css', '.search-result-local:hover'],
      ['css/globals.css', '.knowledge-refresh-btn']
    ];
    for (const [file, selector] of checks) {
      const src = read(file);
      const re = new RegExp('\\[data-theme="dark"\\]\\s+' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      expect(src).toMatch(re);
    }
  });

  test('习惯日历五档强度均有独立暗色底色', () => {
    const src = read('css/habits.css');
    ['0', '25', '50', '75', '100'].forEach((level) => {
      expect(src).toMatch(new RegExp('\\[data-theme="dark"\\]\\s+\\.calendar-day\\.intensity-' + level + '\\s*\\{'));
    });
  });
});
