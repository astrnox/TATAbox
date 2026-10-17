// TATABOX 端到端冒烟测试（P1-28）
//
// 用 Playwright 驱动真实 Chromium，依次访问关键路由并断言页面成功渲染，
// 覆盖既有 jsdom 烟雾测试无法覆盖的「真实浏览器回归」环节。核心目标：
//   1. 首页可加载、标题非空、导航入口完整、主内容容器存在；
//   2. 关键业务路由（练习 / 卡片 / 错题 / 学习 / 仪表盘 / 用户中心 / AI 导师…）
//      都能渲染出非空内容（捕获模块未能挂载 / 渲染崩溃等回归）；
//   3. 重定向路由（/review → /wrongbook、/points-leaderboard → /credit-leaderboard、
//      /bio-animation → /videos）生效；
//   4. 全程未触发页面级 JS 异常（pageerror）。
//   5. （Issue #121 P3-30 视觉回归）关键路由渲染后各截图落盘 /tmp 供人工比对，
//      并断言渲染期间无 console error（CSS/JS/资源加载失败等视觉破坏信号）。
//
// 注意：不把「未登录访问 auth 路由必须被拦截」作为硬性断言——本应用对游客会
// 建立匿名会话，isLoggedIn() 对游客返回 true（见 supabase-client.js），因此
// /user /dashboard 等 auth 路由在匿名会话下会被正常允许渲染；这是预期行为，
// 不应在冒烟测试里误判为漏洞。路由守卫的单元级语义由 app.js 周边单测负责。
//
// 用法：E2E_BASE_URL=http://localhost:8091 node tests/e2e-smoke.js
// CI 中由 .github/workflows/ci.yml 的 Playwright E2E job 调用 npm run test:e2e。
const { chromium } = require('playwright');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8091';
const GOTO_TIMEOUT = 30000;
const SETTLE_MS = 1500; // 路由渲染/动态脚本加载的稳定等待时间
const SCREENSHOT_DIR = '/tmp/bioquest-e2e'; // 视觉回归截图目录（不污染仓库）

// 关键路由（hash 路由）。只断言「渲染出非空内容」，不做易碎的中文关键词匹配。
const ROUTES = [
  { hash: '/' },
  { hash: '/practice' },
  { hash: '/cards' },
  { hash: '/wrongbook' },
  { hash: '/study' },
  { hash: '/dashboard' },
  { hash: '/user' },
  { hash: '/tutor' },
  { hash: '/credit-leaderboard' },
  { hash: '/videos' }
];

// 重定向路由：访问 from 后应落在 to（location.hash 包含 '#' 前缀）
const REDIRECTS = [
  { from: '/review', to: '/wrongbook' },
  { from: '/points-leaderboard', to: '/credit-leaderboard' },
  { from: '/bio-animation', to: '/videos' }
];

(async () => {
  const failures = [];
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push({ url: page.url(), msg: err.message }));
  // Issue #121：记录渲染期间的 console error（CSS/JS/资源加载失败等视觉破坏信号）
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ url: page.url(), text: msg.text().slice(0, 160) });
  });
  // 记录 4xx/5xx 响应：本机静态资源失败是视觉硬错误；外域（CDN/Supabase 等）
  // 失败多为环境相关（如 CI 无后端），仅告警不阻断。
  const failedRequests = [];
  page.on('response', resp => {
    if (resp.status() >= 400) failedRequests.push({ url: resp.url(), status: resp.status() });
  });

  function check(cond, msg) {
    if (cond) {
      console.log('  PASS: ' + msg);
    } else {
      failures.push(msg);
      console.error('  FAIL: ' + msg);
    }
  }

  async function gotoWithRetry(path) {
    // 静态服务器冷启动时首次连接可能失败，做有限次重试
    let lastErr = null;
    for (let i = 0; i < 10; i++) {
      try {
        await page.goto(BASE_URL + path, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT });
        return true;
      } catch (e) {
        lastErr = e;
        await page.waitForTimeout(500);
      }
    }
    throw lastErr;
  }

  console.log('E2E smoke target: ' + BASE_URL);

  // 1) 首页
  console.log('\n== 1. 首页加载 ==');
  await gotoWithRetry('/');
  await page.waitForSelector('#page-content', { timeout: GOTO_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
  const title = await page.title().catch(() => '');
  const hc = await page.locator('#page-content').count();
  check(hc > 0, '首页存在 #page-content 容器');
  check(title && title.trim().length > 0, '页面 title 非空（title=' + title + '）');
  const navCount = await page.locator('.header-nav a, header a[data-route]').count();
  check(navCount > 0, '导航入口非空（nav=' + navCount + '）');
  const fs = require('fs');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: SCREENSHOT_DIR + '/home.png', fullPage: false }).catch(() => {});

  // 2) 路由逐个渲染 + 截图（视觉回归留档）
  console.log('\n== 2. 关键路由渲染 ==');
  for (const r of ROUTES) {
    if (r.hash === '/') continue;
    try {
      await gotoWithRetry('#' + r.hash);
      await page.waitForTimeout(SETTLE_MS);
      const text = (await page.locator('#page-content').innerText().catch(() => '')) || '';
      check(text.trim().length > 0, `#${r.hash} 渲染出非空内容`);
      const shotName = (r.hash === '/' ? 'home' : r.hash.replace(/[^a-z0-9-]/gi, '_')) + '.png';
      await page.screenshot({ path: SCREENSHOT_DIR + '/' + shotName, fullPage: false }).catch(() => {});
    } catch (e) {
      check(false, `#${r.hash} 访问失败：${e.message}`);
    }
  }

  // 3) 重定向路由
  console.log('\n== 3. 重定向路由 ==');
  for (const rd of REDIRECTS) {
    await gotoWithRetry('#' + rd.from);
    await page.waitForTimeout(800);
    const real = await page.evaluate(() => location.hash);
    check(real === '#' + rd.to, `#${rd.from} 重定向到 #${rd.to}（实际 ${real}）`);
  }

  // 4) 全程页面 JS 错误
  console.log('\n== 4. 页面 JS 错误 ==');
  const relevantErrors = pageErrors.filter(e => !/favicon/i.test(e.url || ''));
  check(relevantErrors.length === 0, '关键路由未触发页面级 JS 错误（实际 ' + relevantErrors.length + ' 个）');
  if (relevantErrors.length) {
    relevantErrors.slice(0, 5).forEach(e => console.error('   - ' + e.url + ' :: ' + e.msg));
  }

  // 5) 渲染期间 JS 级 console error（视觉健康信号）
  console.log('\n== 5. console error 检查 ==');
  // 网络层失败（"Failed to load resource"）单独归入 failedRequests 按来源判定；
  // 此处只拦截真正的 JS 运行时错误（语法/引用/类型错误等）。
  const runtimeErrors = consoleErrors.filter(e => !/Failed to load resource/.test(e.text || ''));
  const hardErrors = runtimeErrors.filter(e => !/favicon/.test(e.text || ''));
  check(hardErrors.length === 0, '渲染期间无 JS 运行时错误（实际 ' + hardErrors.length + ' 个，截图存于 ' + SCREENSHOT_DIR + ' 供视觉比对）');
  if (hardErrors.length) {
    hardErrors.slice(0, 5).forEach(e => console.error('   - ' + e.url + ' :: ' + e.text));
  }

  // 5b) 本机静态资源 4xx/5xx 应严格为零；外域失败（CDN/后端）仅告警
  console.log('\n== 5b. 资源加载检查（本机严格 / 外域告警） ==');
  const localFailures = failedRequests.filter(r => r.url.startsWith(BASE_URL));
  check(localFailures.length === 0, '本机静态资源无 4xx/5xx 失败（实际 ' + localFailures.length + ' 个）');
  localFailures.slice(0, 5).forEach(r => console.error('   - [本机] ' + r.status + ' ' + r.url));
  const externalFailures = failedRequests.filter(r => !r.url.startsWith(BASE_URL));
  externalFailures.slice(0, 5).forEach(r => console.warn('   [外域/后端，仅告警] ' + r.status + ' ' + r.url));

  await browser.close();

  if (failures.length) {
    console.error('\nE2E 冒烟测试失败，共 ' + failures.length + ' 项：');
    failures.forEach(m => console.error('  ✘ ' + m));
    process.exit(1);
  }
  console.log('\nE2E 冒烟测试全部通过 ✔');
})().catch(err => {
  console.error('E2E 冒烟测试执行异常：', err);
  process.exit(1);
});