// TATABOX — 三大卖点端到端实测（IRT 学情诊断 / AI 生物导师 / OCR 拍照录题）
//
// 目标：在真实 Chromium 中验证三大核心卖点的「功能正确性 + 降级健壮性」，而不只是
// 路由能否渲染。核心覆盖：
//   1. IRT/学情诊断（/diagnosis）
//        a) 无练习数据 → 展示「数据不足」空状态与「去练习」入口；
//        b) 预置 ≥10 道题数据后 → 渲染完整诊断概览（含 Bio Score / 最薄弱模块 / 薄弱点数
//           3 张卡）与真实诊断报告；
//   2. AI 生物导师（/tutor）
//        a) 页面渲染聊天消息区、输入框、发送按钮、快捷问题；
//        b) 无 API Key 时发送消息 → 优雅降级为配置引导（不崩溃、不漏消息）；
//   3. OCR 拍照录题（/photo-quiz）
//        a) 页面渲染拍照/上传、OCR 按钮、题目输入框、AI 解析按钮；
//        b) 手动录入题目并点「AI 解析」→ 无页面级 JS 异常。
// 全程断言未触发 pageerror。
//
// 用法：E2E_BASE_URL=http://localhost:8091 node tests/e2e-features.js
const { chromium } = require('playwright');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8091';
const GOTO_TIMEOUT = 30000;
const WAIT_TIMEOUT = 8000;

// 预置的练习数据统计（模块 key 与 smart-diagnosis 的 DIAGNOSIS_MODULES 语义一致，
// 仅需满足 totalAnswered >= 10 即可触发完整诊断）。
function seedData(page) {
  return page.evaluate(() => {
    localStorage.setItem('tatabox_stats', JSON.stringify({
      module1: { totalAnswered: 8, totalCorrect: 7, accuracy: 88 },
      module2: { totalAnswered: 10, totalCorrect: 5, accuracy: 50 },
      module3: { totalAnswered: 6, totalCorrect: 3, accuracy: 50 }
    }));
    localStorage.setItem('tatabox_records', JSON.stringify([
      {
        timestamp: 1724220000000, date: '2026-08-19', totalQuestions: 5, correctCount: 3,
        questions: [
          { type: 'single', score: 1 }, { type: 'single', score: 0 },
          { type: 'multiple', score: 1 }, { type: 'tf', score: 0 }, { type: 'mtf', score: 1 }
        ]
      }
    ]));
    localStorage.setItem('tatabox_wrong_questions', JSON.stringify([]));
    return true;
  });
}

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

  function check(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures.push(msg); console.error('  FAIL: ' + msg); }
  }

  async function goto(hashPath) {
    await page.goto(BASE_URL + '/#' + hashPath, {
      waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT
    });
  }

  // 建立本地游客会话，使 isLoggedIn() 为 true（auth 路由 /diagnosis 才能渲染；
  // 本静态环境无 Supabase，游客会话由 app 的 handleGuestLogin 离线建立）。
  async function loginAsGuest() {
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.handleGuestLogin());
    await page.waitForTimeout(800);
  }

  console.log('三大卖点 E2E 目标: ' + BASE_URL);
  await loginAsGuest();
  const loggedIn = await page.evaluate(() => (typeof isLoggedIn === 'function') && isLoggedIn());
  check(loggedIn, '已建立游客会话（isLoggedIn()=true）');

  /* ================= 1. IRT / 学情诊断 ================= */
  console.log('\n== 1. IRT 学情诊断（/diagnosis）==');

  // 1a) 空状态（全新 context，无任何练习数据）
  console.log('-- 1a 无数据空状态 --');
  await goto('/diagnosis');
  await page.waitForSelector('.diagnosis-empty', { timeout: WAIT_TIMEOUT }).catch(() => {});
  const emptyTitle = await page.locator('.diagnosis-empty-title').innerText().catch(() => '');
  const emptyBtn = await page.locator('.diagnosis-empty-btn').count();
  check(emptyTitle.indexOf('数据不足') !== -1, '无数据时展示「数据不足」空状态（实际：' + emptyTitle.trim() + '）');
  check(emptyBtn > 0, '空状态含「去练习」入口按钮');

  // 1b) 预置 ≥10 题数据 → 完整诊断报告（同 SPA 内切走再切回以重触发渲染，不 reload，避免游客会话丢失）
  console.log('-- 1b 预置数据后的完整诊断 --');
  await seedData(page);
  await goto('/');
  await goto('/diagnosis');
  await page.waitForSelector('.diagnosis-overview', { timeout: WAIT_TIMEOUT }).catch(() => {});
  const cardCount = await page.locator('.diagnosis-overview-card').count();
  const headerTitle = await page.locator('.diagnosis-header-title').innerText().catch(() => '');
  check(cardCount === 3, '完整诊断渲染出 3 张概览卡（实际 ' + cardCount + '）');
  check(headerTitle.indexOf('学情诊断') !== -1, '诊断页标题正确（实际：' + headerTitle.trim() + '）');
  const rankTitle = await page.locator('.diagnosis-section-title', { hasText: '模块正确率排名' }).count();
  check(rankTitle > 0, '渲染出「模块正确率排名」区块');

  /* ================= 2. AI 生物导师 ================= */
  console.log('\n== 2. AI 生物导师（/tutor）==');
  await goto('/tutor');
  await page.waitForSelector('#tutor-messages', { timeout: WAIT_TIMEOUT }).catch(() => {});
  check((await page.locator('#tutor-messages').count()) > 0, '渲染 AI 对话消息区');
  check((await page.locator('#tutor-input').count()) > 0, '渲染消息输入框');
  check((await page.locator('#tutor-send').count()) > 0, '渲染发送按钮');
  const quickCount = await page.locator('.tutor-quick-btn').count();
  check(quickCount > 0, '渲染快捷问题（' + quickCount + ' 个）');

  // 2b) 无 API Key 时发送 → 优雅降级，不崩溃
  console.log('-- 2b 无 API Key 的优雅降级 --');
  const bubblesBefore = await page.locator('#tutor-messages .tutor-msg-bubble').count();
  await page.fill('#tutor-input', '请解释光合作用');
  await page.click('#tutor-send');
  await page.waitForFunction(
    (n) => document.querySelectorAll('#tutor-messages .tutor-msg-bubble').length >= n + 2,
    bubblesBefore, { timeout: WAIT_TIMEOUT }
  ).catch(() => {});
  const bubblesAfter = await page.locator('#tutor-messages .tutor-msg-bubble').count();
  check(bubblesAfter >= bubblesBefore + 2, '发送后新增用户+AI 两条消息（' + bubblesBefore + ' → ' + bubblesAfter + '）');
  const lastAiText = await page.locator('#tutor-messages .tutor-msg-bubble').last().innerText().catch(() => '');
  check(lastAiText.trim().length > 0, 'AI 侧有非空回复（降级引导文本）');
  check(lastAiText.indexOf('API Key') !== -1, '降级回复是「配置 API Key」引导（而非空/崩溃）');

  /* ================= 3. OCR 拍照录题 ================= */
  console.log('\n== 3. OCR / 拍照录题（/photo-quiz）==');
  await goto('/photo-quiz');
  await page.waitForSelector('#pq-question', { timeout: WAIT_TIMEOUT }).catch(() => {});
  check((await page.locator('#pq-upload').count()) > 0, '渲染「上传图片」按钮');
  check((await page.locator('#pq-capture').count()) > 0, '渲染「拍照」控件');
  check((await page.locator('#pq-file').count()) > 0, '渲染隐藏文件上传 input（#pq-file）');
  check((await page.locator('#pq-question').count()) > 0, '渲染题目文字输入框');
  check((await page.locator('#pq-analyze').count()) > 0, '渲染「AI 解析」按钮');

  // 3b) 手动录入题目 + 点「AI 解析」：静态服务器无 /photo-quiz 后端，应真实走「解析失败」反馈路径
  //     （有后端 + Key 的完整识别流程无法在静态环断言，这里验证失败能给出可见反馈而不卡死/崩溃）
  console.log('-- 3b 手动录入 + AI 解析 --');
  await page.fill('#pq-question', '单选题：细胞呼吸的主要场所是____。A 细胞核 B 线粒体 C 核糖体 D 内质网');
  await page.click('#pq-analyze');
  // 等「解析中」loading 消失（fetch 落定后才会替换为最终结果），再读取并断言
  await page.waitForFunction(() => !document.querySelector('#pq-result .pq-loading'), { timeout: WAIT_TIMEOUT }).catch(() => {});
  const resultText = await page.locator('#pq-result').innerText().catch(() => '');
  check(resultText.length > 0, '点击 AI 解析后 #pq-result 出现可见反馈（实际：' + resultText.slice(0, 40).trim() + '…）');
  check(resultText.indexOf('解析失败') !== -1, '无后端时走「解析失败」反馈路径（而非静默卡死）');

  /* ================= 4. 全程页面 JS 错误 ================= */
  console.log('\n== 4. 全程页面级 JS 错误 ==');
  const relevantErrors = pageErrors.filter(e => !/favicon/i.test(e.url || ''));
  check(relevantErrors.length === 0, '三大卖点全程未触发页面级 JS 错误（实际 ' + relevantErrors.length + ' 个）');
  if (relevantErrors.length) {
    relevantErrors.slice(0, 8).forEach(e => console.error('   - ' + e.url + ' :: ' + e.msg));
  }

  await browser.close();

  if (failures.length) {
    console.error('\n三大卖点 E2E 实测失败，共 ' + failures.length + ' 项：');
    failures.forEach(m => console.error('  ✘ ' + m));
    process.exit(1);
  }
  console.log('\n三大卖点 E2E 实测全部通过 ✔');
})().catch(err => {
  console.error('三大卖点 E2E 实测执行异常：', err);
  process.exit(1);
});