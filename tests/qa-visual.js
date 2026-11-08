/**
 * 可视化抽检：light + dark 模式下关键页面截图对比
 * 重点验证 UI 修复后（learning-hub / practice / mobile-nav / auth-btn / hero 按钮）
 * 在两种主题下均无视觉撕裂。
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8000/';
const OUT = '/workspace/qa-output/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { route: '/',           name: 'home',          wait: 1800 },
  { route: '/#/dashboard', name: 'dashboard',    wait: 2500 },
  { route: '/#/practice',  name: 'practice',     wait: 1500 },
  { route: '/#/wrongbook', name: 'wrongbook',    wait: 1500 },
  { route: '/#/trends',    name: 'trends',       wait: 2500 },
  { route: '/#/learning-hub', name: 'learninghub', wait: 2000 }
];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const issues = [];

  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: theme === 'dark' ? 'dark' : 'light'
    });
    // 禁用 Service Worker 避免旧缓存干扰 UI 修复验证
    if (ctx.serviceWorkers) await ctx.serviceWorkers();
    await ctx.route('**sw.js', route => route.abort());
    // 预设主题，避免依赖系统偏好
    await ctx.addInitScript((t) => {
      try { localStorage.setItem('tatabox_settings', JSON.stringify({ theme: t })); } catch (e) {}
      try {
        Object.defineProperty(document.documentElement, 'data-theme', {
          value: t, configurable: true, writable: true
        });
      } catch (e) {}
      // 在 DOMContentLoaded 前强行设置
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.setAttribute('data-theme', t);
      }, { once: true });
    }, theme);

    const page = await ctx.newPage();
    const consoleErr = [];
    page.on('console', m => { if (m.type() === 'error') consoleErr.push(m.text()); });
    page.on('pageerror', e => consoleErr.push('JS:' + e.message));

    for (const p of PAGES) {
      try {
        await page.goto(BASE + p.route.replace(/^\//, ''), { waitUntil: 'networkidle', timeout: 15000 });
      } catch (e) {
        try { await page.goto(BASE + p.route.replace(/^\//, ''), { waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (e2) {}
      }
      // 强制设置主题（覆盖 restoreSettings）
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(p.wait);

      const shot = path.join(OUT, `vis-${p.name}-${theme}.png`);
      await page.screenshot({ path: shot, fullPage: false });

      // 采集关键样式信号
      const signal = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const header = document.querySelector('.header, header');
        const headerStyle = header ? getComputedStyle(header) : null;
        return {
          bodyBg: body.backgroundColor,
          bodyColor: body.color,
          fontFamily: body.fontFamily.substring(0, 40),
          headerBg: headerStyle ? headerStyle.backgroundColor : null,
          dataTheme: document.documentElement.getAttribute('data-theme')
        };
      });
      console.log(`[${theme}] ${p.name.padEnd(12)} theme=${signal.dataTheme} bodyBg=${signal.bodyBg}`);
      if (theme === 'dark' && signal.bodyBg === 'rgb(250, 248, 245)') {
        issues.push(`[P1] ${p.name} dark 模式下 body 背景仍为亮色（rgb(250,248,245)）→ 主题未生效`);
      }
    }

    // 单独抽检：打开移动端汉堡菜单 + 主题切换按钮（dark 模式下）
    if (theme === 'dark') {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), 'dark');
      await page.waitForTimeout(1000);
      await page.setViewportSize({ width: 375, height: 800 });
      await page.waitForTimeout(500);
      const hamburger = page.locator('#hamburgerBtn').first();
      if (await hamburger.count()) {
        await hamburger.click().catch(() => {});
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, 'vis-mobile-nav-dark.png') });
        const navBg = await page.evaluate(() => {
          const nav = document.querySelector('.mobile-nav');
          return nav ? getComputedStyle(nav).backgroundColor : null;
        });
        console.log(`[dark-mobile] mobile-nav bg = ${navBg}`);
        if (navBg && navBg.includes('255, 255, 255')) {
          issues.push(`[P2] dark 模式下 mobile-nav 背景仍为纯白 → 修复未生效`);
        }
      }
    }

    if (consoleErr.length) {
      console.log(`[${theme}] console.error 数: ${consoleErr.length}`);
      consoleErr.slice(0, 3).forEach(e => console.log('  -', e.substring(0, 120)));
    }
    await ctx.close();
  }

  await browser.close();

  console.log('\n========== 可视化抽检总结 ==========');
  console.log('截图目录:', OUT);
  if (issues.length === 0) {
    console.log('✓ 无视觉撕裂问题');
  } else {
    console.log(`发现 ${issues.length} 个问题:`);
    issues.forEach(i => console.log(' ' + i));
  }
})();
