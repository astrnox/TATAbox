// TATABOX — 每日亿题全链路回归测试（统一判卷内核改造后的深度 E2E）
//
// 覆盖面：
//   1. 渲染：单选/判断混排卡片、题型标签、顶部进度条；
//   2. 作答：单选互斥、判断逐项、未答完提交按钮禁用；
//   3. 零判卷：作答阶段卡片不泄题（无正确答案/标记/解析）；
//   4. 判卷：点「结束并判卷」出成绩单，正确率/逐题状态与本地题库答案严格一致；
//   5. 全局关联：打卡 recordDailyCheckIn / 成就 checkAchievement 是否被调用，
//      saveRecord / updateStats / updateBioScore 是否写入（bio 分链路），
//      bioquest_stats / bioquest_records 是否变化；
//   6. 持久化：退出后 bioquest_billion_v3 落盘、重进恢复进度计数；
//   7. 懒加载：首屏 3 题后滚动可继续加载（历史自锁 bug 回归）；
//   8. 全程无 pageerror。
//
// 用法：E2E_BASE_URL=http://localhost:8091 node tests/e2e-daily-billion.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8091';
const GOTO_TIMEOUT = 30000;
const SHOT_DIR = '/tmp/bioquest-e2e-daily';

// 本地题库答案表（判卷真值）
const bankDir = path.join(__dirname, '..', 'data', 'bank');
const answerMap = {};
for (const f of fs.readdirSync(bankDir).filter((f) => f.startsWith('daily_league_'))) {
  const d = JSON.parse(fs.readFileSync(path.join(bankDir, f), 'utf8'));
  for (const id in d) answerMap[id] = d[id];
}

(async () => {
  const failures = [];
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push({ url: page.url(), msg: err.message }));

  function check(cond, msg) {
    if (cond) console.log('  PASS: ' + msg);
    else { failures.push(msg); console.error('  FAIL: ' + msg); }
  }

  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

  // 每次导航前预置「已看过隐私声明」，避免首访合规条（z-index 最高）拦截底部按钮点击
  await context.addInitScript(() => {
    try {
      localStorage.setItem('bioquest_privacy_notice_seen', '1');
      localStorage.setItem('bioquest_age_consent', '1');
    } catch (e) {}
  });

  console.log('每日亿题深度回归 E2E: ' + BASE_URL);
  console.log('本地题库真值: ' + Object.keys(answerMap).length + ' 题');

  // ---------- 1. 进入页面并注入全局关联 spy ----------
  await page.goto(BASE_URL + '/#/daily-billion', { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT });
  await page.waitForSelector('.db-card', { timeout: 20000 });
  await page.waitForTimeout(800);

  // 全局关联函数探测：sb-gamify.js 已随主 SPA 的 initSupabase 脚本链加载，
  // 打卡/成就/bio 分三个函数必须真实存在（历史缺口回归），storage 层随后就绪。
  const GAMIFY_FNS = ['recordDailyCheckIn', 'checkAchievement', 'updateBioScore'];
  const STORAGE_FNS = ['saveRecord', 'updateStats'];
  const UTIL_FNS = ['recordQuestionAnswer'];
  const DATA_FNS = ['recordWrongAnswer']; // sb-data 云端错题本（review_cards 复习卡）
  const POINTS_FNS = ['addPoints'];       // user.js 信用指数：按需加载，允许初始缺失（record-session 挂起补发）
  await page.waitForFunction(
    (fns) => fns.every((n) => typeof window[n] === 'function'),
    [...STORAGE_FNS, ...GAMIFY_FNS, ...UTIL_FNS, ...DATA_FNS], { timeout: 20000 }
  );
  const gamifyAvailability = await page.evaluate((fns) =>
    fns.map((n) => ({ name: n, type: typeof window[n] })), [...GAMIFY_FNS, ...STORAGE_FNS, ...UTIL_FNS, ...DATA_FNS]);
  console.log('  全局函数可用性: ' + JSON.stringify(gamifyAvailability));
  gamifyAvailability.forEach((a) =>
    check(a.type === 'function', '主 SPA 中全局函数真实存在: ' + a.name));

  await page.evaluate(({ fns: all }) => {
    window.__spies = {};
    window.__spyArgs = {};
    window.__spiesMissing = [];
    all.forEach((name) => {
      const orig = window[name];
      if (typeof orig === 'function') {
        const wrapped = function (...args) {
          window.__spies[name] = (window.__spies[name] || 0) + 1;
          (window.__spyArgs[name] = window.__spyArgs[name] || []).push(args);
          return orig.apply(this, args);
        };
        wrapped.__isSpy = true;
        window[name] = wrapped;
      } else {
        window.__spiesMissing.push(name);
        // 定义占位 spy，捕获每日亿题调用点是否尝试调用（typeof 守卫会放行）
        window[name] = function (...args) {
          window.__spies[name] = (window.__spies[name] || 0) + 1;
          (window.__spyArgs[name] = window.__spyArgs[name] || []).push(args);
          return undefined;
        };
        window[name].__isStub = true;
      }
    });
    // 记录全局统计初始快照
    window.__statsBefore = localStorage.getItem('bioquest_stats');
    window.__recordsBefore = localStorage.getItem('bioquest_records');
  }, { fns: [...GAMIFY_FNS, ...STORAGE_FNS, ...UTIL_FNS, ...DATA_FNS, ...POINTS_FNS] });

  // ---------- 2. 首屏渲染 ----------
  let cards = await page.$$('.db-card');
  check(cards.length >= 3, '首屏渲染至少 3 张题目卡片（实际 ' + cards.length + '）');
  const topBar = await page.$('.db-stop-btn');
  check(!!topBar, '顶部存在「结束并判卷」按钮');
  const counter0 = await page.$eval('#dbCounterNum', (el) => el.textContent.trim());
  check(counter0 === '0', '初始「已刷」计数为 0（实际 ' + counter0 + '）');

  const cardInfos = await page.$$eval('.db-card', (els) =>
    els.map((el) => ({
      id: el.dataset.questionId,
      idx: el.dataset.index,
      type: (el.querySelector('.db-card-type') || {}).textContent || '',
      hasOptions: !!el.querySelector('.db-opt-list'),
      subCount: el.querySelectorAll('.db-sub-item').length
    }))
  );
  const typeLabels = new Set(cardInfos.map((c) => c.type.trim()));
  console.log('  首屏题型分布: ' + JSON.stringify(cardInfos.map((c) => c.type.trim() + '#' + c.id)));
  check(cardInfos.every((c) => c.id && answerMap[c.id]), '首屏题目 ID 均命中本地题库真值表');

  // ---------- 3. 零判卷基线：未作答不泄题 ----------
  const leak0 = await page.$eval('.db-card', (el) => ({
    hasCorrectAnswer: el.innerText.includes('正确答案'),
    hasReportNode: !!el.querySelector('[class*="report"]')
  }));
  check(!leak0.hasCorrectAnswer && !leak0.hasReportNode, '未作答卡片不包含正确答案/判卷节点');

  // ---------- 4. 第 1 题：故意答对 ----------
  const q0 = cardInfos[0];
  const truth0 = answerMap[q0.id];
  async function answerCard(info, wantCorrect) {
    const selector = '.db-card[data-question-id="' + info.id + '"]';
    if (info.hasOptions) {
      const letters = ['A', 'B', 'C', 'D'].slice(0, answerMap[info.id].options.length);
      const correct = answerMap[info.id].answer;
      const pick = wantCorrect ? correct : letters.find((l) => l !== correct);
      await page.click(selector + ' .db-opt-btn[data-value="' + pick + '"]');
    } else {
      const truth = answerMap[info.id].subQuestions || [];
      for (let i = 0; i < info.subCount; i++) {
        const val = wantCorrect ? String(Boolean(truth[i].answer)) : String(!Boolean(truth[i].answer));
        await page.click(selector + ' .db-sub-item[data-sub-idx="' + i + '"] .db-tf-btn[data-value="' + val + '"]');
      }
    }
  }

  // 互斥校验（仅单选）：连点两个选项应只留一个 selected
  if (q0.hasOptions) {
    const selector = '.db-card[data-question-id="' + q0.id + '"]';
    const opts = await page.$$(selector + ' .db-opt-btn');
    if (opts.length >= 2) {
      await opts[0].click();
      await opts[1].click();
      const selectedCount = await page.$$eval(selector + ' .db-opt-btn.selected', (els) => els.length);
      check(selectedCount === 1, '单选互斥：连续点两个选项后仅 1 个 selected（实际 ' + selectedCount + '）');
    }
  }

  await answerCard(q0, true);
  let submitBtn = await page.$('.db-card[data-question-id="' + q0.id + '"] .db-submit-btn');
  let disabled = await submitBtn.evaluate((el) => el.disabled);
  check(!disabled, '答完后「完成本题」按钮可用');
  await submitBtn.click();
  await page.waitForTimeout(400);

  // 作答后零判卷：无正确答案/标记节点，选项锁定
  const after0 = await page.$eval('.db-card[data-question-id="' + q0.id + '"]', (el) => ({
    leakText: el.innerText.includes('正确答案') || el.innerText.includes('回答正确'),
    hasReportNode: !!el.querySelector('[class*="report"]'),
    doneChip: !!el.querySelector('.db-done-chip'),
    anyOptionDisabled: !!el.querySelector('.db-opt-btn:disabled, .db-tf-btn:disabled')
  }));
  check(!after0.leakText && !after0.hasReportNode, '提交后作答卡片仍不泄题（零判卷口径）');
  check(after0.doneChip, '提交后显示「已作答 ✓」标记');
  check(after0.anyOptionDisabled, '提交后选项按钮锁定');

  // ---------- 5. 第 2 题：故意答错 ----------
  const q1 = cardInfos[1];
  await answerCard(q1, false);
  submitBtn = await page.$('.db-card[data-question-id="' + q1.id + '"] .db-submit-btn');
  await submitBtn.click();
  await page.waitForTimeout(400);

  const counter1 = await page.$eval('#dbCounterNum', (el) => el.textContent.trim());
  check(counter1 === '2', '两题提交后「已刷」计数为 2（实际 ' + counter1 + '）');

  // ---------- 6. 第 3 题：MTF 只答一半，提交按钮应保持禁用 ----------
  const q2 = cardInfos[2];
  if (!q2.hasOptions && q2.subCount >= 2) {
    const selector = '.db-card[data-question-id="' + q2.id + '"]';
    await page.click(selector + ' .db-sub-item[data-sub-idx="0"] .db-tf-btn[data-value="true"]');
    submitBtn = await page.$(selector + ' .db-submit-btn');
    disabled = await submitBtn.evaluate((el) => el.disabled);
    check(disabled, 'MTF 只答 1/2 小题时「完成本题」保持禁用');
  } else {
    console.log('  SKIP: 第 3 题为单选或仅 1 小题，跳过半答禁用校验');
  }

  // ---------- 7. 收藏持久化（快速关联项） ----------
  const favBtn = await page.$('.db-card[data-question-id="' + q0.id + '"] [data-action="fav"]');
  if (favBtn) { await favBtn.click(); await page.waitForTimeout(400); }

  // ---------- 8. 结束并判卷 → 成绩单 ----------
  await page.click('.db-stop-btn');
  await page.waitForSelector('#dbReportOverlay', { timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOT_DIR, 'report-panel.png'), fullPage: false });

  // 真值：第1题全对，第2题全错，第3题未提交不计入
  function subsOf(info) {
    const q = answerMap[info.id];
    if (q.options) return 1;
    return (q.subQuestions || []).length;
  }
  const totalSubExpected = subsOf(q0) + subsOf(q1);
  const correctExpected = subsOf(q0); // 第1题全对
  const accExpected = Math.round((correctExpected / totalSubExpected) * 100);

  const accActual = await page.$eval('.db-report-acc-val', (el) => parseInt(el.textContent, 10));
  check(accActual === accExpected, '成绩单正确率 = ' + accExpected + '%（实际 ' + accActual + '%）');

  const statuses = await page.$$eval('.db-report-item .db-report-status', (els) => els.map((el) => el.textContent.trim()));
  const expectStatus0 = q0.hasOptions ? '回答正确' : '全部正确';
  const expectStatus1 = q1.hasOptions ? '回答错误' : '全部错误';
  check(statuses[0] === expectStatus0, '第 1 题成绩单状态 = ' + expectStatus0 + '（实际 ' + statuses[0] + '）');
  check(statuses[1] === expectStatus1, '第 2 题成绩单状态 = ' + expectStatus1 + '（实际 ' + statuses[1] + '）');
  check(statuses[2] === '未作答', '第 3 题成绩单状态 = 未作答（实际 ' + statuses[2] + '）');

  // 逐题得分
  const scores = await page.$$eval('.db-report-item .db-report-score', (els) => els.map((el) => el.textContent.trim()));
  check(scores[0] === '得分 ' + subsOf(q0) + '/' + subsOf(q0), '第 1 题满分 ' + scores[0]);
  check(scores[1] === '得分 0/' + subsOf(q1), '第 2 题 0 分 ' + scores[1]);
  check(scores[2] === '—', '第 3 题未作答得分 —（实际 ' + scores[2] + '）');

  // 解析展示：已作答题有解析，未作答无解析（不泄题）
  const explStates = await page.$$eval('.db-report-item', (els) =>
    els.map((el) => ({
      hasExpl: !!el.querySelector('.db-report-explanation:not(.db-report-explanation--na)'),
      naExpl: !!el.querySelector('.db-report-explanation--na')
    }))
  );
  check(explStates[0].hasExpl && explStates[1].hasExpl, '已作答题目在成绩单中展示解析');
  check(explStates[2].naExpl && !explStates[2].hasExpl, '未作答题不展示解析（不泄题）');

  // 单选成绩单逐选项：正确答案高亮 + 你的选择标记（仅第1题为单选时校验）
  if (q0.hasOptions) {
    const marks = await page.$$eval('.db-report-item:first-child .db-report-sub', (els) =>
      els.map((el) => ({
        ok: el.classList.contains('db-report-sub--ok'),
        bad: el.classList.contains('db-report-sub--bad'),
        text: el.innerText
      }))
    );
    const okIdx = marks.findIndex((m) => m.ok);
    const correctLetter = String.fromCharCode(65 + okIdx);
    check(correctLetter === answerMap[q0.id].answer, '成绩单正确答案高亮 = ' + answerMap[q0.id].answer + '（高亮 ' + correctLetter + '）');
    check(marks.some((m) => m.text.includes('你的选择')), '成绩单标注「你的选择」');
    check(marks.some((m) => m.text.includes('正确答案')), '成绩单标注「正确答案」');
  }

  // 单选成绩单：你的选择标错（bad）
  if (q1.hasOptions) {
    const badCount = await page.$$eval('.db-report-item:nth-child(2) .db-report-sub--bad', (els) => els.length);
    check(badCount >= 1, '答错题的所选项被标记为错误（bad 节点 ' + badCount + '）');
  }

  // ---------- 9. 全局关联断言（核心回归面） ----------
  // bio 分同步在 score-engine 按需加载完成后异步重试触发，先等它落地
  await page.waitForFunction(() => ((window.__spies && window.__spies.updateBioScore) || 0) >= 1, null, { timeout: 8000 })
    .catch(() => {});

  const spies = await page.evaluate(() => window.__spies);
  const spyArgs = await page.evaluate(() => window.__spyArgs);
  const spyMissing = await page.evaluate(() => window.__spiesMissing || []);
  console.log('  全局调用计数: ' + JSON.stringify(spies) + '（本应缺失: ' + JSON.stringify(spyMissing) + '）');
  check(spyMissing.every((n) => n === 'addPoints'),
    '无「本应缺失」的全局函数（历史缺口已修复；addPoints 允许由 user.js 按需加载补齐: ' + JSON.stringify(spyMissing) + '）');
  check((spies.recordDailyCheckIn || 0) >= 2, '每题提交触发每日打卡 recordDailyCheckIn（计 ' + (spies.recordDailyCheckIn || 0) + '）');
  check((spies.checkAchievement || 0) >= 2, '每题提交触发成就检查 checkAchievement（计 ' + (spies.checkAchievement || 0) + '）');

  // 每题 updateStats：次数 = 已提交题数（2），键 ∈ module_1..4/general，第二参 = 题级全对
  check(spies.updateStats === 2, '每题提交各写一次模块统计 updateStats=2（实际 ' + spies.updateStats + '）');
  const statsArgs = spyArgs.updateStats || [];
  const MODULE_KEYS = ['module_1', 'module_2', 'module_3', 'module_4', 'general'];
  check(statsArgs.every((a) => MODULE_KEYS.includes(a[0])),
    'updateStats 模块键与全局口径一致: ' + JSON.stringify(statsArgs.map((a) => a[0])));
  check(statsArgs.length === 2 && typeof statsArgs[0][1] === 'boolean' && typeof statsArgs[1][1] === 'boolean' &&
    statsArgs[0][1] === true && statsArgs[1][1] === false,
    'updateStats 正确位与作答一致：第1题对=true、第2题错=false（' + JSON.stringify(statsArgs.map((a) => a[1])) + '）');

  // 每题难度统计接入
  check(spies.recordQuestionAnswer === 2, '每题提交写难度统计 recordQuestionAnswer=2（实际 ' + (spies.recordQuestionAnswer || 0) + '）');

  // 答错入错题本（云端 review_cards 复习卡）：仅第 2 题（答错）触发，题目对象携带稳定 ID
  check(spies.recordWrongAnswer === 1, '答错题触发云端错题本 recordWrongAnswer=1（实际 ' + (spies.recordWrongAnswer || 0) + '）');
  const wrongArg = (spyArgs.recordWrongAnswer || [])[0] || [null];
  const wrongQid = wrongArg[0] && (wrongArg[0].id || wrongArg[0].question_id);
  check(!!wrongQid, '错题本写入携带题目稳定 ID（实际 ' + JSON.stringify(wrongQid || null) + '）');

  // 信用点：每日亿题额度减半（答对 +0.25 / 答错 +0.05，走 user.js 的 addPoints）
  // 注：user.js 自带每日登录奖励 DAILY_LOGIN，断言时过滤只看答题相关发放
  check((spies.addPoints || 0) >= 2, '每题提交发放信用点（答题相关 >= 2，实际 ' + (spies.addPoints || 0) + '）');
  const ptsArgs = (spyArgs.addPoints || []).filter((a) => a[0] === 'ANSWER_CORRECT' || a[0] === 'ANSWER_WRONG');
  const ptsOk = ptsArgs.length === 2 &&
    ptsArgs[0][0] === 'ANSWER_CORRECT' && ptsArgs[0][1] === 0.25 &&
    ptsArgs[1][0] === 'ANSWER_WRONG' && ptsArgs[1][1] === 0.05;
  check(ptsOk, '信用点额度：答对 +0.25 / 答错 +0.05（实际 ' + JSON.stringify(ptsArgs.map((a) => a.slice(0, 2))) + '）');

  // saveRecord：本次段落恰好 1 条，口径与成绩单一致
  check(spies.saveRecord === 1, '结束判卷写入 1 条练习记录 saveRecord=1（实际 ' + (spies.saveRecord || 0) + '）');
  const rec = (spyArgs.saveRecord || [])[0] || [{}];
  const recObj = rec[0] || {};
  check(recObj.module === 'daily-billion', '记录 module=daily-billion（实际 ' + recObj.module + '）');
  check(recObj.totalQuestions === 2, '记录 totalQuestions=2（实际 ' + recObj.totalQuestions + '）');
  check(recObj.correctCount === 1, '记录 correctCount=1（实际 ' + recObj.correctCount + '）');
  check(recObj.totalScore === totalSubExpected && recObj.score === correctExpected,
    '记录 score/totalScore = ' + correctExpected + '/' + totalSubExpected +
    '（实际 ' + recObj.score + '/' + recObj.totalScore + '）');
  check(Array.isArray(recObj.questions) && recObj.questions.length === 2 &&
    recObj.questions.every((q) => typeof q.correctSubs === 'number' && typeof q.totalSubs === 'number'),
    '记录逐题含 correctSubs/totalSubs（云端题级全对判定依赖）');

  // updateBioScore：用最新全局统计重算后同步
  check(spies.updateBioScore >= 1, '结束判卷同步 bio 分 updateBioScore（计 ' + (spies.updateBioScore || 0) + '）');
  const bioArgs = (spyArgs.updateBioScore || [])[0] || [];
  check(typeof bioArgs[0] === 'number' && bioArgs[0] >= 0 && bioArgs[0] <= 100,
    'bio 分为 0-100 数值（实际 ' + bioArgs[0] + '）');
  check(!!bioArgs[1] && bioArgs[1].total_answered >= 2,
    'bio 分附带全局统计 total_answered>=2（实际 ' + JSON.stringify(bioArgs[1] || null) + '）');
  const engineAvail = await page.evaluate(() => ({
    dims: typeof window.computeBioDimensions,
    raw: typeof window.computeBioScoreFromRaw
  }));
  check(engineAvail.dims === 'function' && engineAvail.raw === 'function',
    'score-engine 六维内核随 daily-billion 模块加载（' + JSON.stringify(engineAvail) + '）');

  const statsAfter = await page.evaluate(() => ({
    stats: localStorage.getItem('bioquest_stats'),
    records: localStorage.getItem('bioquest_records'),
    billion: localStorage.getItem('bioquest_billion_v3'),
    favorites: localStorage.getItem('bioquest_favorites')
  }));
  const billion = JSON.parse(statsAfter.billion || '{}');
  check(billion.totalAnswered === 2, '本地进度持久化 totalAnswered=2（实际 ' + billion.totalAnswered + '）');
  const expectCorrect = subsOf(q0);
  check(billion.totalCorrect === expectCorrect, '本地进度持久化 totalCorrect=' + expectCorrect + '（实际 ' + billion.totalCorrect + '）');
  check(billion.totalSubQuestions === totalSubExpected, '本地进度持久化 totalSubQuestions=' + totalSubExpected + '（实际 ' + billion.totalSubQuestions + '）');
  check(!!billion.favorites && Object.keys(billion.favorites).length === 1, '收藏写入本地进度');

  // bio 分链路：saveRecord / updateStats / updateBioScore 是否接入
  const statsChanged = statsAfter.stats !== (await page.evaluate(() => window.__statsBefore));
  const recordsChanged = statsAfter.records !== (await page.evaluate(() => window.__recordsBefore));
  console.log('  [bio分链路] saveRecord=' + spies.saveRecord + ' updateStats=' + spies.updateStats +
    ' updateBioScore=' + spies.updateBioScore + ' stats变化=' + statsChanged + ' records变化=' + recordsChanged);
  check(statsChanged, 'bioquest_stats 被 updateStats 写入');
  check(recordsChanged, 'bioquest_records 被 saveRecord 写入');

  // 落盘内容口径：记录与模块统计必须与成绩单一致，且 recordedQids 已持久化（防重放）
  const recList = JSON.parse(statsAfter.records || '[]');
  const lastRec = recList[recList.length - 1] || {};
  check(lastRec.module === 'daily-billion' && lastRec.totalQuestions === 2 && lastRec.correctCount === 1,
    'bioquest_records 末条为 daily-billion 记录且口径一致（' +
    JSON.stringify({ m: lastRec.module, t: lastRec.totalQuestions, c: lastRec.correctCount }) + '）');
  const statObj = JSON.parse(statsAfter.stats || '{}');
  const modAgg = Object.values(statObj).reduce((acc, m) => ({
    a: acc.a + (m.totalAnswered || 0), c: acc.c + (m.totalCorrect || 0)
  }), { a: 0, c: 0 });
  check(modAgg.a === 2 && modAgg.c === 1,
    'bioquest_stats 累计 totalAnswered=2 / totalCorrect=1（实际 ' + modAgg.a + '/' + modAgg.c + '）');
  check(Object.keys(billion.recordedQids || {}).length === 2,
    'recordedQids 持久化 2 题（防同一批题重复计入）');

  // ---------- 10. 成绩单交互：跳回本题 + 关闭 ----------
  await page.click('.db-report-item:nth-child(2)');
  await page.waitForTimeout(400);
  const overlayGone = !(await page.$('#dbReportOverlay'));
  check(overlayGone, '点击成绩单题目条目跳回本题并关闭面板');

  // 再次打开成绩单走「退出」——重复打开不得重复计入（recordedQids 幂等）
  await page.click('.db-stop-btn');
  await page.waitForSelector('#dbReportOverlay', { timeout: 5000 });
  await page.waitForTimeout(300);
  const spies2 = await page.evaluate(() => window.__spies || {});
  check((spies2.saveRecord || 0) === 1, '重复打开成绩单不重复落记录 saveRecord 仍=1（实际 ' + (spies2.saveRecord || 0) + '）');
  check((spies2.updateStats || 0) === 2, '重复打开成绩单不重复计统计 updateStats 仍=2（实际 ' + (spies2.updateStats || 0) + '）');
  await page.click('[data-action="report-exit"]');
  await page.waitForTimeout(600);
  check(page.url().includes('#/'), '成绩单「退出」回到首页（' + page.url() + '）');
  check(!(await page.$('#dbWrapper')), '退出后每日亿题 DOM 已销毁');
  const spies3 = await page.evaluate(() => window.__spies || {});
  check((spies3.saveRecord || 0) === 1, '退出销毁阶段不追加重复记录 saveRecord 仍=1（实际 ' + (spies3.saveRecord || 0) + '）');

  // ---------- 11. 重进恢复进度 ----------
  await page.goto(BASE_URL + '/#/daily-billion', { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT });
  await page.waitForSelector('.db-card', { timeout: 20000 });
  await page.waitForTimeout(800);
  const counterRestored = await page.$eval('#dbCounterNum', (el) => el.textContent.trim());
  check(counterRestored === '2', '重进页面恢复「已刷」计数 = 2（实际 ' + counterRestored + '）');

  // ---------- 12. 懒加载回归（历史自锁 bug：刷到第 3 题卡住） ----------
  let cardCount = (await page.$$('.db-card')).length;
  for (let i = 0; i < 8 && cardCount < 6; i++) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(700);
    cardCount = (await page.$$('.db-card')).length;
  }
  check(cardCount > 3, '滚动到底可继续懒加载更多题目（首屏 3 → 现 ' + cardCount + '）');
  await page.screenshot({ path: path.join(SHOT_DIR, 'final.png') });

  // ---------- 13. pageerror ----------
  const realErrors = pageErrors.filter((e) => !/net::|Failed to load resource|AbortError/i.test(e.msg));
  check(realErrors.length === 0, '全程无页面级 JS 异常' + (realErrors.length ? '：' + JSON.stringify(realErrors) : ''));

  // ---------- 汇总 ----------
  console.log('\n== 每日亿题回归结果: ' + (failures.length ? failures.length + ' 失败' : '全部通过') + ' ==');
  failures.forEach((f) => console.log('  ✗ ' + f));
  console.log('截图目录: ' + SHOT_DIR);

  await browser.close();
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('E2E 执行异常:', err);
  process.exit(1);
});
