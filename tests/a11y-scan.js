// TATABOX 无障碍扫描（L-02）
//
// 用 Playwright + axe-core 在真实 Chromium 中对关键路由做 WCAG 2.1 A/AA 扫描，
// 并在首页验证键盘焦点链路（Tab 可达 skip-link、主内容区可编程聚焦）。
//
// 仅以 impact=critical 的违规作为失败门禁；serious 违规打印告警并留档，
// 避免历史遗留样式（对比度等）一次性阻断 CI。新增 critical 违规必须修复。
//
// 用法：E2E_BASE_URL=http://localhost:8091 node tests/a11y-scan.js
// CI 由 .github/workflows/ci.yml 在 E2E job（静态服务器启动后）调用。
'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8091';
const GOTO_TIMEOUT = 30000;
const SETTLE_MS = 1800;

const ROUTES = [
  { name: '首页', hash: '/' },
  { name: '练习', hash: '/practice' },
  { name: '卡片', hash: '/cards' },
  { name: '错题本', hash: '/wrongbook' },
  { name: '学习管理', hash: '/study' },
  { name: '仪表盘', hash: '/dashboard' },
  { name: '用户中心', hash: '/user' },
  { name: 'AI 导师', hash: '/tutor' },
  { name: '视频栏目', hash: '/videos' }
];

const AXE_OPTIONS = {
  runOnly: {
    type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
  },
  resultTypes: ['violations']
};

(async () => {
  const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const failures = [];
  const warnings = [];

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  function waitReady() {
    return page.waitForTimeout(SETTLE_MS);
  }

  async function gotoRoute(hash) {
    // 静态服务器冷启动重试（与 e2e-smoke.js 一致）
    let lastErr = null;
    for (let i = 0; i < 10; i++) {
      try {
        await page.goto(BASE_URL + '/#' + hash, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT });
        await waitReady();
        return;
      } catch (e) {
        lastErr = e;
        await page.waitForTimeout(500);
      }
    }
    throw lastErr;
  }

  async function scanRoute(route) {
    await gotoRoute(route.hash);
    // 通过 CDP 求值注入 axe，绕过 CSP 对内联 <script> 的限制
    await page.evaluate(axeSource);
    const result = await page.evaluate(async (opts) => {
      return await window.axe.run(document, opts);
    }, AXE_OPTIONS);

    const critical = result.violations.filter((v) => v.impact === 'critical');
    const serious = result.violations.filter((v) => v.impact === 'serious');

    if (critical.length) {
      failures.push(`${route.name} (${route.hash}) 存在 ${critical.length} 项 critical 违规`);
      critical.forEach((v) => {
        console.error(`  ✘ [critical] ${v.id}: ${v.help}`);
        v.nodes.slice(0, 5).forEach((n) => console.error('      ' + n.target.join(' ')));
      });
    }
    if (serious.length) {
      warnings.push(`${route.name} (${route.hash}) 存在 ${serious.length} 项 serious 违规`);
      serious.slice(0, 3).forEach((v) => {
        console.warn(`  ! [serious] ${v.id}: ${v.help}（${v.nodes.length} 处）`);
      });
    }
    console.log(
      `  ${critical.length ? 'FAIL' : 'PASS'}: ${route.name} (${route.hash}) — critical=${critical.length} serious=${serious.length}`
    );
    return { route: route.name, hash: route.hash, critical: critical.length, serious: serious.length };
  }

  console.log('A11y scan target: ' + BASE_URL);
  const summary = [];
  for (const route of ROUTES) {
    try {
      summary.push(await scanRoute(route));
    } catch (e) {
      failures.push(`${route.name} (${route.hash}) 扫描失败：${e.message}`);
    }
  }

  // 键盘可达性：首页 Tab 应首先命中 skip-link（且可见），主内容区应可聚焦
  console.log('\n== 键盘焦点链路 ==');
  try {
    // 用一次全新文档加载验证「首次 Tab」：先前路由扫描是 hash 变更（同文档），
    // 焦点仍停在上一路由标题上是预期行为，不能代表首屏键盘起点。
    await gotoRoute('/');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitReady();
    await page.keyboard.press('Tab');
    const focusInfo = await page.evaluate(() => {
      const el = document.activeElement;
      const skip = document.querySelector('.skip-link');
      return {
        tag: el ? el.tagName : '',
        cls: el ? el.className : '',
        skipVisible: skip ? getComputedStyle(skip).top !== '-100%' : false,
        mainFocusable: Boolean(document.querySelector('#page-content[tabindex="-1"]'))
      };
    });
    const skipFocused = /skip-link/.test(String(focusInfo.cls));
    if (skipFocused) console.log('  PASS: 首次 Tab 命中 skip-link');
    else failures.push('首次 Tab 未命中 skip-link（实际焦点：' + focusInfo.tag + ' ' + focusInfo.cls + '）');
    if (focusInfo.skipVisible) console.log('  PASS: skip-link 获得焦点时可见');
    else failures.push('skip-link 获得焦点时仍不可见');
    if (focusInfo.mainFocusable) console.log('  PASS: #page-content 可编程聚焦（tabindex=-1）');
    else failures.push('#page-content 缺少 tabindex="-1"，skip-link 跳转后焦点不会移动');

    // Enter 激活 skip-link：焦点应落到主内容区，且 hash 不应被改写为 #page-content
    if (skipFocused) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const afterSkip = await page.evaluate(() => ({
        id: document.activeElement ? document.activeElement.id : '',
        hash: location.hash
      }));
      if (afterSkip.id === 'page-content') console.log('  PASS: 激活 skip-link 后焦点进入主内容区');
      else failures.push('激活 skip-link 后焦点未进入主内容区（实际 #' + afterSkip.id + '）');
      if (afterSkip.hash !== '#page-content') console.log('  PASS: skip-link 未污染 SPA 路由 hash（' + (afterSkip.hash || '(空)') + '）');
      else failures.push('skip-link 把 hash 改写为 #page-content，会触发未知路由');
    }
  } catch (e) {
    failures.push('键盘焦点检查失败：' + e.message);
  }

  await browser.close();

  fs.mkdirSync('/tmp', { recursive: true });
  fs.writeFileSync('/tmp/bioquest-a11y-summary.json', JSON.stringify({ baseUrl: BASE_URL, summary }, null, 2));

  if (warnings.length) {
    console.warn('\n[a11y] 非阻断告警：');
    warnings.forEach((w) => console.warn('  - ' + w));
  }
  if (failures.length) {
    console.error('\n无障碍扫描失败，共 ' + failures.length + ' 项：');
    failures.forEach((f) => console.error('  ✘ ' + f));
    process.exit(1);
  }
  console.log('\n无障碍扫描通过 ✔（critical=0）');
})().catch((err) => {
  console.error('无障碍扫描执行异常：', err);
  process.exit(1);
});
