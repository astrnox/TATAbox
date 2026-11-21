/**
 * @jest-environment jsdom
 *
 * 设计系统 v2 回归测试（P0/P1 设计整改）
 * --------------------------------------
 * 背景：全站曾大量使用"AI 味"设计（毛玻璃 / 渐变 / emoji 当图标 / 内联样式
 * 就地发明色值）。本测试锁定整改后的约定，防止回潮：
 *   1. 全局图标系统 BQ_ICONS 可用且风格统一（currentColor + stroke 线性）；
 *   2. 全局组件类（按钮/卡片/chip/页头/状态点/结果态/提示条）已在 globals.css 定义；
 *   3. 底部标签栏为实色材质（不使用 backdrop-filter）；
 *   4. 设计审计脚本与 npm 脚本已就位（CI 门禁）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const utilsSrc = read('js/core/utils.js');
const globalsCss = read('css/globals.css');
const pkg = JSON.parse(read('package.json'));

beforeAll(() => {
  // 以全局脚本语义执行 utils.js（与 index.html 一致）
  (0, eval)(utilsSrc); // eslint-disable-line no-eval
});

describe('BQ_ICONS 全局图标系统', () => {
  test('暴露到 window 并包含设计系统所需图标', () => {
    expect(typeof window.BQ_ICONS).toBe('object');
    ['check', 'checkCircle', 'alert', 'info', 'x', 'edit', 'trophy', 'flag'].forEach((k) => {
      expect(typeof window.BQ_ICONS[k]).toBe('string');
      expect(window.BQ_ICONS[k]).toContain('<svg');
    });
  });

  test('图标风格统一：currentColor + stroke 线性（不允许彩色 emoji）', () => {
    Object.keys(window.BQ_ICONS).forEach((k) => {
      const svg = window.BQ_ICONS[k];
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('fill="none"');
      expect(svg).toContain('aria-hidden="true"');
    });
  });

  test('挂载在 TATABOX 命名空间下（Q-03 约定）', () => {
    expect(window.BioQuest.icons).toBe(window.BQ_ICONS);
  });
});

describe('全局组件层（设计系统 v2）', () => {
  test('按钮 / 卡片 / chip / 页头 / 状态点 / 结果态 / 提示条 均已定义', () => {
    [
      '.bq-btn', '.bq-btn--primary', '.bq-btn--ghost', '.bq-btn--warm', '.bq-btn--block',
      '.bq-card', '.bq-card--flat', '.bq-chip',
      '.bq-section-header', '.bq-section-header__title', '.bq-section-header__desc',
      '.bq-dot', '.bq-dot--high', '.bq-dot--medium', '.bq-dot--low', '.bq-dot--none',
      '.bq-result-icon', '.bq-note', '.bq-note__icon', '.bq-empty'
    ].forEach((sel) => expect(globalsCss).toContain(sel));
  });

  test('组件颜色走全局 token（不写死色值）', () => {
    // 抽查按钮主色与卡片边框必须引用 token
    expect(globalsCss).toMatch(/\.bq-btn--primary\s*\{[^}]*background:\s*var\(--color-sage\)/);
    expect(globalsCss).toMatch(/\.bq-card\s*\{[^}]*border:\s*1px solid var\(--color-border\)/);
  });
});

describe('底部标签栏：实色材质（去玻璃）', () => {
  test('.bottom-tab-bar 不再使用 backdrop-filter', () => {
    const block = globalsCss.match(/\.bottom-tab-bar \{[\s\S]*?\n\}/);
    expect(block).not.toBeNull();
    const noComment = block[0].replace(/\/\*[\s\S]*?\*\//g, ''); // 注释里提到该属性名不算违规
    expect(noComment).not.toMatch(/backdrop-filter\s*:/);
    expect(noComment).toMatch(/background:\s*var\(--tabbar-bg\)/);
  });

  test('标签栏材质全部引用主题 token（明暗主题自动生效）', () => {
    const block = globalsCss.match(/\.bottom-tab-bar \{[\s\S]*?\n\}/)[0];
    expect(block).toMatch(/--tabbar-bg:\s*var\(--color-surface\)/);
    expect(block).toMatch(/--tabbar-border:\s*var\(--color-border\)/);
    expect(block).toMatch(/--tabbar-bar-shadow:\s*var\(--shadow-lg\)/);
  });
});

describe('设计审计门禁', () => {
  test('scripts/audit-design.js 存在且可由 node --check 通过', () => {
    const p = path.join(ROOT, 'scripts', 'audit-design.js');
    expect(fs.existsSync(p)).toBe(true);
    // 用 vm 做语法解析（require 会执行 main 并 process.exit，不可用）
    const vm = require('vm');
    expect(() => new vm.Script(read('scripts/audit-design.js'), { filename: 'audit-design.js' })).not.toThrow();
  });

  test('npm 脚本暴露 audit:design，并纳入 npm test 链路', () => {
    expect(pkg.scripts['audit:design']).toBe('node scripts/audit-design.js');
    expect(pkg.scripts.test).toContain('audit:design');
  });

  test('CI 已接入设计规范审计', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toContain('audit:design');
  });
});

/* ============================================================
 * 导航信息架构（防止回潮到"功能堆砌"）
 *背景：桌面顶栏曾平铺 23 个入口，且与底部标签栏并存两套全屏导航。
 * 约定：一级只留 6 项；其余收进「更多」面板；桌面端隐藏底部栏。
 * ============================================================ */
describe('导航信息架构', () => {
  const indexHtml = read('index.html');
  const layoutCss = read('css/layout.css');

  test('桌面一级导航不超过 6 项（其余收进「更多」）', () => {
    const nav = indexHtml.match(/<nav class="header-nav"[\s\S]*?<\/nav>/);
    expect(nav).not.toBeNull();
    // 「更多」面板内部的链接不计入一级项
    const topLevel = nav[0]
      .replace(/<div class="header-more"[\s\S]*$/, '')
      .match(/<a\b[^>]*>/g) || [];
    expect(topLevel.length).toBeLessThanOrEqual(6);
  });

  test('「更多」面板按五组划分，与移动端抽屉一致', () => {
    const panel = indexHtml.match(/<div class="header-more-panel"[\s\S]*?<\/div>\s*<\/div>\s*<\/nav>/);
    expect(panel).not.toBeNull();
    ['学习', '题库', '探索', '智能与社区', '账户'].forEach((g) => {
      expect(panel[0]).toContain(`>${g}</div>`);
    });
  });

  test('不再出现「错题录题」错别字', () => {
    expect(indexHtml).not.toContain('错题录题');
  });

  test('桌面端（>768px）隐藏底部标签栏，避免两套导航并存', () => {
    expect(layoutCss).toMatch(/@media \(min-width: 769px\)[\s\S]*?\.bottom-tab-bar\s*\{[\s\S]*?display:\s*none/);
  });

  test('「更多」按钮与面板具备可访问性关联', () => {
    expect(indexHtml).toContain('aria-controls="headerMorePanel"');
    expect(indexHtml).toContain('aria-haspopup="true"');
    expect(indexHtml).toMatch(/id="headerMorePanel"[^>]*hidden/);
  });
});

describe('首屏背景：静态 CSS 层次（无脚本粒子）', () => {
  const indexHtml = read('index.html');
  const homeCss = read('css/home.css');

  test('不再引入 hero-sketch 随机粒子脚本', () => {
    expect(indexHtml).not.toContain('hero-sketch');
    expect(fs.existsSync(path.join(ROOT, 'js', 'core', 'hero-sketch.js'))).toBe(false);
  });

  test('.hero-bg 自带实色底，且不含 backdrop-filter', () => {
    const block = homeCss.match(/\.hero-bg \{[\s\S]*?\n\}/);
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/background:\s*linear-gradient/);
    expect(block[0]).not.toMatch(/backdrop-filter/);
  });

  test('hero 区域不再依赖 canvas 容器', () => {
    expect(indexHtml).not.toContain('id="heroCanvas"');
  });
});

/* ============================================================
 *用户可见文案：去 AI 腔（给事实，不给情绪评价）
 * 约定：结果页/空状态不出现「太厉害」「继续保持」「恭喜」这类评判；
 *      「智能推荐」等含 AI 暗示的标签改为说明实际依据。
 * ============================================================ */
describe('用户可见文案：无 AI 腔', () => {
  // 这些文件是结果页 / 空状态 / 诊断的主要来源
  const COPY_FILES = [
    'js/pages/exam.js',
    'js/pages/analytic.js',
    'js/pages/trends.js',
    'js/pages/practice.js',
    'js/pages/review-deep.js',
    'js/pages/daily-billion.js',
    'js/pages/classmate.js',
    'js/pages/study.js',
    'js/pages/onboarding.js',
    'js/ai/smart-diagnosis.js',
  ];

  test('结果页/空状态不含情绪化评价', () => {
    const BANNED = /继续保持|太厉害|厉害！|真棒|太棒|恭喜|继续加油|该恭喜还是该劝退/;
    COPY_FILES.forEach((f) => {
      expect(BANNED.test(read(f))).toBe(false);
    });
  });

  test('「已刷完当前题库」不再带 emoji 与感叹', () => {
    const src = read('js/pages/daily-billion.js');
    expect(src).toContain('已刷完当前题库');
    expect(src).not.toContain('&#127881;');
  });

  test('成就描述保留黑色幽默，但不含「该X还是该Y」两难句式', () => {
    const src = read('js/core/supabase-client.js');
    expect(src).not.toMatch(/该[^']*还是该/);
    // 语气基准：成就体系整体是作者刻意写的俏皮文风，不应被整体抹平
    expect(src).toContain('羊入虎口');
  });

  test('review-deep 有错时给出具体题数而非情绪鼓励', () => {
    const src = read('js/pages/review-deep.js');
    expect(src).toContain('题待复习');
    expect(src).toMatch(/wrongCount\s*=\s*0/);
    expect(src).toMatch(/if \(!right\) \{ allRight = false; wrongCount\+\+; \}/);
  });
});