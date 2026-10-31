// TATABOX 浏览器回归测试 v3 - 全面覆盖，覆盖所有 P0/P1 修复
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8765/';
const OUT = '/workspace/qa-output';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });

const report = { issues: [], summary: {} };

function logIssue(level, page, msg, evidence) {
  const issue = {
    id: `ISSUE-${String(report.issues.length + 1).padStart(3, '0')}`,
    level, page, message: msg, evidence: evidence || null, timestamp: new Date().toISOString()
  };
  report.issues.push(issue);
  console.log(`[${level}] ${issue.id} @ ${page}: ${msg}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), url: page.url(), t: Date.now() });
  });
  page.on('pageerror', err => pageErrors.push({ msg: err.message, stack: err.stack || '', url: page.url(), t: Date.now() }));

  // 路由列表
  const ROUTES = [
    '/', '/dashboard', '/practice', '/tutor', '/classroom',
    '/knowledge-graph', '/bio-lab', '/phet-sims',
    '/games', '/sketch', '/smiles', '/molecules', '/community-enhanced',
    '/community', '/user', '/wrongbook', '/trends'
  ];

  console.log('\n========== 阶段 A: 路由扫描 ==========');
  const routeErrors = {};
  for (const route of ROUTES) {
    const beforeErrs = pageErrors.length;
    const beforeConsole = consoleErrors.length;
    try {
      await page.goto(BASE + '#' + route, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1800);
    } catch (e) {
      console.log(`[warn] ${route} 导航异常: ${e.message}`);
    }
    const newPE = pageErrors.slice(beforeErrs);
    const newCE = consoleErrors.slice(beforeConsole);
    routeErrors[route] = { pageErrors: newPE, consoleErrors: newCE };
    const peCount = newPE.length;
    const ceCount = newCE.length;
    const flag = (peCount > 0 || ceCount > 0) ? ' ✗' : ' ✓';
    console.log(`${route.padEnd(22)} PE=${peCount} CE=${ceCount}${flag}`);
    if (peCount > 0) {
      // P0: 路由加载时 JS 异常
      logIssue('P0', route, `加载时 ${peCount} 个 JS 异常: ${newPE.slice(0, 2).map(e => e.msg).join(' | ')}`);
    }
  }

  console.log('\n========== 阶段 B: P0 修复点验证 ==========');

  // B1: cal-heatmap / d3 修复验证（首页不应再有 timeSecond 错误）
  console.log('\n--- B1: cal-heatmap d3 修复（首页）---');
  const homePE_before = pageErrors.length;
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const homeNewPE = pageErrors.slice(homePE_before);
  const timeSecondErrs = homeNewPE.filter(e => /timeSecond|d3/i.test(e.msg));
  console.log('首页新增 JS 异常:', homeNewPE.length, '其中 timeSecond/d3:', timeSecondErrs.length);
  if (timeSecondErrs.length > 0) {
    logIssue('P0', 'home', `cal-heatmap 仍未修复，timeSecond/d3 错误: ${timeSecondErrs[0].msg}`);
  } else {
    console.log('✓ 首页 cal-heatmap/d3 修复确认');
  }
  // H-04：d3 / cal-heatmap 已从首屏移除（仓库内无调用方）。
  // 首页只需确认不再出现 timeSecond/d3 相关异常，不再断言 d3 必须存在。
  console.log(
    'window.d3:', await page.evaluate(() => typeof window.d3),
    '| CalHeatmap:', await page.evaluate(() => typeof window.CalHeatmap)
  );

  // B2: sketch Excalidraw 修复验证
  console.log('\n--- B2: sketch Excalidraw 修复 ---');
  const sketchPE_before = pageErrors.length;
  await page.goto(BASE + '#/sketch', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // Excalidraw React 需要时间挂载
  await page.screenshot({ path: path.join(OUT, 'screenshots', 'v3-sketch.png') });
  const excalidrawCount = await page.locator('.excalidraw, [class*="excalidraw"]').count();
  const sketchNewPE = pageErrors.slice(sketchPE_before);
  console.log('excalidraw DOM:', excalidrawCount, '| 新增 JS 异常:', sketchNewPE.length);
  if (excalidrawCount === 0) {
    logIssue('P0', 'sketch', `Excalidraw 未注入（DOM=0），新增异常: ${sketchNewPE.slice(0,2).map(e=>e.msg).join(' | ')}`);
  } else {
    console.log('✓ sketch Excalidraw 渲染成功');
  }

  // B3: kaplay-games canvas 修复验证
  console.log('\n--- B3: kaplay-games canvas 修复 ---');
  const gamesPE_before = pageErrors.length;
  await page.goto(BASE + '#/games', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const startBtn = page.locator('#game-start-btn');
  if (await startBtn.count()) {
    await startBtn.first().click().catch(()=>{});
    await page.waitForTimeout(4500); // kaplay.js 注入 + 游戏启动
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'v3-games.png') });
    const canvasCount = await page.locator('#game-container canvas').count();
    const gamesNewPE = pageErrors.slice(gamesPE_before);
    console.log('点击开始后 canvas 数:', canvasCount, '| 新增 JS 异常:', gamesNewPE.length);
    if (canvasCount === 0) {
      logIssue('P0', 'games', `canvas 未渲染。JS 异常: ${gamesNewPE.slice(-2).map(e=>e.msg).join(' | ')}`);
    } else {
      console.log('✓ games canvas 渲染成功');
    }
  } else {
    logIssue('P1', 'games', '开始游戏按钮 #game-start-btn 未找到');
  }

  // B4: SMILES RDKit 预设 + 自定义
  console.log('\n--- B4: SMILES RDKit 预设 ---');
  const smilesPE_before = pageErrors.length;
  await page.goto(BASE + '#/smiles', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const smilesCard = page.locator('.smiles-card').first();
  let presetSvg = 0;
  if (await smilesCard.count()) {
    await smilesCard.click().catch(()=>{});
    await page.waitForTimeout(6000); // RDKit WASM 6.7MB
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'v3-smiles-preset.png') });
    presetSvg = await page.locator('#smiles-modal-container svg').count();
    console.log('点击预设后 SVG 数:', presetSvg);
    if (presetSvg === 0) {
      const rdkitErrs = consoleErrors.slice(smilesPE_before).filter(e => e.url.includes('smiles') || /rdkit/i.test(e.text));
      logIssue('P1', 'smiles', `预设分子 SVG 未渲染。console: ${rdkitErrs.slice(-2).map(e=>e.text).join(' | ')}`);
    } else {
      console.log('✓ SMILES 预设 SVG 渲染成功');
    }
  } else {
    logIssue('P1', 'smiles', '.smiles-card 未找到');
  }

  // B5: 自定义 SMILES
  console.log('\n--- B5: 自定义 SMILES 输入 ---');
  // 先关闭预设 modal，避免遮挡输入
  const modalClose = page.locator('#smiles-close-btn');
  if (await modalClose.count()) {
    await modalClose.click().catch(()=>{});
    await page.waitForTimeout(500);
  }
  const smilesInput = page.locator('#smiles-input');
  if (await smilesInput.count()) {
    await smilesInput.fill('CCO');
    await page.locator('#smiles-render-btn').click().catch(()=>{});
    await page.waitForTimeout(5000); // RDKit 已加载，应快速返回
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'v3-smiles-custom.png') });
    const customSvg = await page.locator('#smiles-custom-container svg').count();
    console.log('自定义 SMILES SVG 数:', customSvg);
    if (customSvg === 0) {
      logIssue('P2', 'smiles', '自定义 SMILES 渲染未出现 SVG（RDKit 已加载，应复用预设路径）');
    } else {
      console.log('✓ 自定义 SMILES 渲染成功');
    }
  }

  // B6: molecules 3D 分子
  console.log('\n--- B6: molecules 3D 分子 ---');
  const molPE_before = pageErrors.length;
  await page.goto(BASE + '#/molecules', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  // 点击预设 PDB 卡片打开 modal
  const molCard = page.locator('.molecule-card').first();
  let molCanvas = 0;
  if (await molCard.count()) {
    await molCard.click().catch(()=>{});
    await page.waitForTimeout(8000); // PDB 下载
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'v3-molecules-modal.png') });
    molCanvas = await page.locator('#molecule-3d-container canvas').count();
    console.log('molecules modal canvas 数:', molCanvas);
    if (molCanvas === 0) {
      const molErrs = pageErrors.slice(molPE_before);
      logIssue('P1', 'molecules', `3D 分子 modal canvas 未渲染。异常: ${molErrs.slice(-2).map(e=>e.msg).join(' | ')}`);
    } else {
      console.log('✓ molecules 3D modal 渲染成功');
    }
  } else {
    logIssue('P1', 'molecules', '.molecule-card 未找到');
  }

  // B7: community-enhanced chat
  console.log('\n--- B7: community-enhanced chat ---');
  const chatPE_before = pageErrors.length;
  await page.goto(BASE + '#/community-enhanced', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, 'screenshots', 'v3-community.png') });
  const chatWidget = await page.locator('[class*="quikchat"]').count();
  const chatInput = await page.locator('#community-chat input, #community-chat textarea, .quikchat-input input, .quikchat-input textarea').count();
  console.log('quikchat widget:', chatWidget, '| input:', chatInput);
  const chatNewPE = pageErrors.slice(chatPE_before);
  if (chatWidget === 0) {
    logIssue('P1', 'community-enhanced', `quikchat 未挂载（DOM=0）。异常: ${chatNewPE.slice(0,2).map(e=>e.msg).join(' | ')}`);
  } else if (chatInput === 0) {
    logIssue('P2', 'community-enhanced', 'quikchat 挂载但未找到输入框');
  } else {
    // 测试输入消息
    const inp = page.locator('#community-chat input, #community-chat textarea, .quikchat-input input, .quikchat-input textarea').first();
    await inp.fill('测试消息').catch(()=>{});
    await page.keyboard.press('Enter').catch(()=>{});
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'v3-community-sent.png') });
    const msgCount = await page.locator('#community-chat [class*="message"], .quikchat-message').count();
    console.log('发送后消息 DOM 数:', msgCount);
    if (msgCount < 2) {
      logIssue('P2', 'community-enhanced', '发送消息后消息 DOM 数 < 2');
    } else {
      console.log('✓ quikchat 消息发送成功');
    }
  }

  console.log('\n========== 阶段 C: 主题切换 ==========');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const beforeTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || '<none>');
  const beforeBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const beforeHtmlBg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  console.log('切换前: html data-theme =', beforeTheme, '| body bg =', beforeBg, '| html bg =', beforeHtmlBg);

  // 桌面端没有 #themeToggle，需要用 mobile 版（在汉堡菜单里）
  // 注意：#themeToggleMobile 位于 .mobile-nav 内，CSS transform: translateX(100%) 默认隐藏，
  // 必须先点击 #hamburgerBtn 打开 mobile-nav，按钮才会可见可点。
  const themeBtnMobile = page.locator('#themeToggleMobile').first();
  if (await themeBtnMobile.count()) {
    // 先打开汉堡菜单，使 #themeToggleMobile 可见
    const hamburger = page.locator('#hamburgerBtn').first();
    if (await hamburger.count()) {
      await hamburger.click().catch(()=>{});
      await page.waitForTimeout(600);
    }
    // 等待按钮可见后再点击
    await themeBtnMobile.waitFor({ state: 'visible', timeout: 3000 }).catch(()=>{});
    await themeBtnMobile.click().catch(()=>{});
    await page.waitForTimeout(1500);
    const afterTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || '<none>');
    const afterBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const afterHtmlBg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    console.log('切换后: html data-theme =', afterTheme, '| body bg =', afterBg, '| html bg =', afterHtmlBg);
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'v3-theme-after.png') });
    if (beforeTheme === afterTheme) {
      logIssue('P2', 'theme', `点击 #themeToggleMobile 后 data-theme 未变化（仍为 ${afterTheme}）`);
    } else {
      console.log('✓ 主题切换成功:', beforeTheme, '->', afterTheme);
    }
  } else {
    logIssue('P2', 'theme', '未找到 #themeToggleMobile 按钮');
  }

  console.log('\n========== 阶段 D: 移动端响应式 ==========');
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'screenshots', 'v3-mobile-home.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log('移动端横向溢出:', overflow, 'px');
  if (overflow > 5) logIssue('P2', 'mobile', `移动端横向溢出 ${overflow}px`);

  // 汉堡菜单
  const hamburger = page.locator('#hamburgerBtn, .hamburger').first();
  if (await hamburger.count()) {
    await hamburger.click().catch(()=>{});
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'v3-mobile-nav.png') });
    const mobileNavVisible = await page.locator('#mobileNav').isVisible().catch(()=> false);
    console.log('mobile-nav 可见:', mobileNavVisible);
    if (!mobileNavVisible) logIssue('P2', 'mobile', '点击汉堡菜单后 mobile-nav 不可见');
    // 关闭
    const closeBtn = page.locator('#mobileNavClose').first();
    if (await closeBtn.count()) await closeBtn.click().catch(()=>{});
  }

  console.log('\n========== 阶段 E: UI 一致性 ==========');
  await page.setViewportSize({ width: 1280, height: 900 });
  const uiChecks = [];

  // E1: 按钮风格统一性
  console.log('\n--- E1: 按钮风格 ---');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const btnStyles = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, .btn-primary, .btn-outline, a[data-route]'));
    return btns.slice(0, 30).map(b => {
      const cs = getComputedStyle(b);
      return {
        text: (b.textContent || '').trim().slice(0, 20),
        bg: cs.backgroundColor,
        color: cs.color,
        radius: cs.borderRadius,
        fontFamily: cs.fontFamily.slice(0, 30),
        fontSize: cs.fontSize,
        padding: cs.padding
      };
    });
  });
  const radii = [...new Set(btnStyles.map(b => b.radius))];
  const fontSizes = [...new Set(btnStyles.map(b => b.fontSize))];
  const fonts = [...new Set(btnStyles.map(b => b.fontFamily))];
  console.log('按钮圆角种类:', radii.length, radii.slice(0,5));
  console.log('按钮字号种类:', fontSizes.length, fontSizes.slice(0,5));
  console.log('按钮字体种类:', fonts.length, fonts.slice(0,3));
  if (radii.length > 4) logIssue('P2', 'ui-consistency', `按钮圆角种类过多 (${radii.length}): ${radii.join(', ')}`);
  if (fonts.length > 2) logIssue('P2', 'ui-consistency', `按钮字体种类过多 (${fonts.length}): ${fonts.join(', ')}`);

  // E2: 字体加载（LXGW WenKai）
  console.log('\n--- E2: 字体加载 ---');
  const fontLoaded = await page.evaluate(() => {
    const ff = getComputedStyle(document.body).fontFamily;
    return { fontFamily: ff, hasLXGW: ff.indexOf('LXGW') !== -1 };
  });
  console.log('body fontFamily:', fontLoaded.fontFamily.slice(0, 80));
  if (!fontLoaded.hasLXGW) logIssue('P2', 'ui-consistency', 'body 字体未使用 LXGW WenKai');

  // E3: 颜色变量一致性（首页卡片）
  console.log('\n--- E3: 卡片颜色变量 ---');
  const cardColors = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.card, .feature-card, .stat-card, [class*="card"]')).slice(0, 10);
    return cards.map(c => {
      const cs = getComputedStyle(c);
      return { radius: cs.borderRadius, bg: cs.backgroundColor, border: cs.borderColor };
    });
  });
  const cardRadii = [...new Set(cardColors.map(c => c.radius))];
  console.log('卡片圆角种类:', cardRadii.length, cardRadii.slice(0,5));
  if (cardRadii.length > 4) logIssue('P2', 'ui-consistency', `卡片圆角种类过多 (${cardRadii.length}): ${cardRadii.join(', ')}`);

  // E4: 标题层级一致性
  console.log('\n--- E4: 标题层级 ---');
  const headings = await page.evaluate(() => {
    const hs = Array.from(document.querySelectorAll('h1, h2, h3'));
    return hs.slice(0, 10).map(h => {
      const cs = getComputedStyle(h);
      return { tag: h.tagName, fontSize: cs.fontSize, fontFamily: cs.fontFamily.slice(0, 30), color: cs.color };
    });
  });
  console.log('标题:', headings.slice(0, 4).map(h => `${h.tag}:${h.fontSize}`).join(' | '));

  // E5: 多页面 UI 检查（路由切换后样式仍正确）
  console.log('\n--- E5: 跨页面 UI ---');
  for (const r of ['/dashboard', '/practice', '/trends']) {
    await page.goto(BASE + '#' + r, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const pageBtnStyles = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, .btn-primary, a[data-route]')).slice(0, 5);
      return btns.map(b => getComputedStyle(b).borderRadius);
    });
    const pageRadii = [...new Set(pageBtnStyles)];
    console.log(`${r}: 圆角种类 ${pageRadii.length}`);
  }

  console.log('\n========== 总结 ==========');
  report.summary.routeErrors = Object.fromEntries(
    Object.entries(routeErrors).map(([r, e]) => [r, { pe: e.pageErrors.length, ce: e.consoleErrors.length }])
  );
  report.summary.btnStyles = btnStyles.slice(0, 15);
  report.summary.btnRadii = radii;
  report.summary.fontSizes = fontSizes;
  report.summary.fonts = fonts;
  report.summary.consoleErrors = consoleErrors.length;
  report.summary.pageErrors = pageErrors.length;
  report.summary.totalIssues = report.issues.length;
  report.summary.byLevel = report.issues.reduce((acc, i) => { acc[i.level] = (acc[i.level]||0)+1; return acc; }, {});

  fs.writeFileSync(path.join(OUT, 'report-v3.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, 'console-errors-v3.json'), JSON.stringify(consoleErrors, null, 2));
  fs.writeFileSync(path.join(OUT, 'page-errors-v3.json'), JSON.stringify(pageErrors, null, 2));

  console.log('总问题:', report.summary.totalIssues, '按级别:', JSON.stringify(report.summary.byLevel));
  console.log('console.error:', consoleErrors.length, 'JS 异常:', pageErrors.length);

  await browser.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
