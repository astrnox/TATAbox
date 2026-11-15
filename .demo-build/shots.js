const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const CHROME = '/root/.cache/puppeteer/chrome/linux-155.0.8059.39/chrome-linux64/chrome';
const BASE = 'http://127.0.0.1:8123/';
const OUT = '/workspace/.demo-build/scenes';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--hide-scrollbars']
  });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2,
    locale: 'zh-CN', serviceWorkers: 'block'
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('tatabox_privacy_notice_seen', '1');
      localStorage.setItem('tatabox_age_consent', '1');
      localStorage.setItem('tatabox_onboarding_done', 'true');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));

  const shot = async (name) => {
    const extra = await page.evaluate(() => {
      const p = document.getElementById('privacy-notice');
      if (p && p.parentNode) p.parentNode.removeChild(p);
      return !!p;
    });
    if (extra) console.log('removed privacy notice before', name);
    await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 94 });
    console.log('shot', name);
  };
  const go = async (hash, marker) => {
    await page.evaluate(h => { location.hash = h; }, hash);
    await sleep(1200);
    for (let i = 0; i < 18; i++) {
      const ok = await page.evaluate(m => {
        const pc = document.getElementById('page-content');
        return !!pc && pc.innerText.indexOf(m) >= 0;
      }, marker);
      if (ok) break;
      await sleep(600);
    }
    await sleep(1600);
  };

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(9000);
  // 关掉首访隐私提示，避免遮挡画面
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => (x.textContent || '').trim() === '我知道了');
    if (b) b.click();
  });
  await sleep(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(600);
  await shot('01-home');

  // 首屏以下：统计条 + 每日一题 + 公益承诺（section-reveal 需滚动触发）
  await page.evaluate(async () => {
    const step = (y) => new Promise(r => { window.scrollTo(0, y); setTimeout(r, 420); });
    for (let y = 0; y <= 1260; y += 180) await step(y);
  });
  await sleep(1400);
  await shot('01b-home-lower');
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(900);

  const pick = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#homeQuizCard .hq-row'));
    rows.forEach((r, idx) => {
      const inputs = r.querySelectorAll('input[type=radio]');
      const i = inputs[idx % inputs.length];
      if (i) i.click();
    });
    return { rows: rows.length, checked: document.querySelectorAll('#homeQuizCard input:checked').length };
  });
  console.log('pick', JSON.stringify(pick));
  await sleep(900);
  await shot('02-answering');

  await page.evaluate(() => {
    const s = document.querySelector('.hq-submit');
    if (s) s.click();
  });
  await sleep(1800);
  const res = await page.evaluate(() => {
    const p = document.getElementById('homeQuizPanel');
    if (p && !p.hidden && p.scrollIntoView) p.scrollIntoView({ block: 'center' });
    return { hidden: p ? p.hidden : null, txt: p ? p.innerText.replace(/\s+/g, ' ').slice(0, 60) : null };
  });
  console.log('result', JSON.stringify(res));
  await sleep(1200);
  await shot('03-result');

  await go('#/practice', '专项练习');
  await page.evaluate(() => window.scrollTo(0, 230));
  await sleep(700);
  await shot('04-practice');

  await go('#/knowledge-graph', '知识图谱');
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1600);
  await shot('05-graph');

  await go('#/cards', '知识卡片');
  const cardsEmpty = await page.evaluate(() => {
    const pc = document.getElementById('page-content');
    return pc.innerText.indexOf('还没有任何记忆卡片') >= 0;
  });
  if (!cardsEmpty) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(900);
    await shot('06-cards');
  }
  console.log('cards empty?', cardsEmpty);

  await go('#/wrongbook', '错题');
  await sleep(1400);
  await shot(cardsEmpty ? '06-wrongbook' : '07-wrongbook');

  await go('#/credit-leaderboard', '信用排行榜');
  await sleep(2400);
  await shot(cardsEmpty ? '07-credit-board' : '08-credit-board');

  await go('#/points-shop', '信用中心');
  await sleep(1600);
  await shot(cardsEmpty ? '08-credit-center' : '09-credit-center');

  await go('#/', '每日一题');
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1200);
  await shot(cardsEmpty ? '09-outro' : '10-outro');

  await browser.close();
})();
