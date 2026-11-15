const fs = require('fs');
const { chromium } = require('playwright-core');
const CHROME = '/root/.cache/puppeteer/chrome/linux-155.0.8059.39/chrome-linux64/chrome';
const BASE = 'http://127.0.0.1:8124/';
const MODE = process.argv[2] || 'A';
const VID = '/workspace/.demo-build/vid-' + MODE;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const cursorScript = () => {
  const mount = () => {
    if (!document.body || document.getElementById('__dc')) return;
    const wrap = document.createElement('div');
    wrap.id = '__dc';
    wrap.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(800px,450px);transition:transform .5s cubic-bezier(.22,.61,.36,1)';
    wrap.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" style="display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))"><path d="M3.5 2.2l7.8 18.2 2.4-7.4 7.4-2.4z" fill="#0B1A12" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(wrap);
  };
  window.__dcMove = (x, y) => { mount(); const w = document.getElementById('__dc'); if (w) w.style.transform = `translate(${x}px, ${y}px)`; };
  window.__dcClick = () => {
    const w = document.getElementById('__dc');
    if (!w) return;
    const r = document.createElement('span');
    r.style.cssText = 'position:absolute;left:-6px;top:-6px;width:48px;height:48px;border-radius:50%;border:3px solid rgba(58,124,84,.9);opacity:.85;transform:scale(.35);transition:transform .5s ease-out,opacity .5s ease-out;display:block';
    w.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(1.15)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 600);
  };
};

(async () => {
  fs.rmSync(VID, { recursive: true, force: true });
  fs.mkdirSync(VID, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none']
  });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 }, locale: 'zh-CN', serviceWorkers: 'block',
    recordVideo: { dir: VID, size: { width: 1600, height: 900 } }
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('tatabox_privacy_notice_seen','1'); localStorage.setItem('tatabox_onboarding_done','true'); } catch(e){} });
  const t0 = Date.now();
  const ev = {};
  let tDemo = 0;
  const mark = (name) => { ev[name] = +((Date.now() - tDemo) / 1000).toFixed(2); console.log('MARK', name, ev[name]); };
  const page = await ctx.newPage();
  await page.addInitScript(cursorScript);
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 140)));

  const moveClick = async (x, y, pause = 800) => {
    await page.evaluate(([cx, cy]) => window.__dcMove(cx, cy), [x, y]);
    await sleep(430);
    await page.evaluate(() => window.__dcClick());
    await page.mouse.click(x, y);
    await sleep(pause);
  };

  const boxOf = (text, exact) => page.evaluate(([t, ex]) => {
    const els = Array.from(document.querySelectorAll('button, a, [role=button]'));
    const el = els.find(e => {
      if (e.disabled) return false;
      const s = (e.textContent || '').replace(/\s+/g, ' ').trim();
      const r = e.getBoundingClientRect();
      const visible = r.width > 4 && r.height > 4 && r.left >= 0 && r.top >= 0 && r.left < window.innerWidth;
      if (!visible) return false;
      return ex ? s === t : s.startsWith(t);
    });
    if (!el || el.disabled) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, [text, exact]);

  const clickText = async (text, pause = 800, exact = true) => {
    const box = await boxOf(text, exact);
    if (!box) {
      const dbg = await page.evaluate((t) => Array.from(document.querySelectorAll('button, a, [role=button]'))
        .filter(e => {
          const s = (e.textContent || '').replace(/\s+/g, ' ').trim();
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (s === t || s.startsWith(t));
        })
        .map(e => {
          const r = e.getBoundingClientRect();
          return { t: (e.textContent || '').trim().slice(0, 14), dis: e.disabled, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cls: (e.className || '').toString().slice(0, 24) };
        }), text);
      console.log('MISS', text, JSON.stringify(dbg));
      return false;
    }
    await moveClick(box.x, box.y, pause);
    return true;
  };

  const hasBtn = (text) => page.evaluate((t) => Array.from(document.querySelectorAll('button, a, [role=button]'))
    .some(e => {
      if (e.disabled) return false;
      const r = e.getBoundingClientRect();
      const s = (e.textContent || '').replace(/\s+/g, ' ').trim();
      return r.width > 4 && r.height > 4 && s.startsWith(t);
    }), text);

  const clickNav = async (text, pause = 800) => {
    const box = await page.evaluate((t) => {
      const els = Array.from(document.querySelectorAll('header a, nav a, .site-header a, .app-header a, a[href^="#/"]'));
      const el = els.find(e => (e.textContent || '').replace(/\s+/g, ' ').trim().startsWith(t));
      if (!el) return null;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }, text);
    if (!box) { console.log('MISS nav', text); return false; }
    await moveClick(box.x, box.y, pause);
    return true;
  };

  const openMenuThen = async (text) => {
    const hb = await page.evaluate(() => {
      const b = document.querySelector('.hamburger');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    if (hb) await moveClick(hb.x, hb.y, 1400);
    await clickText(text, 900, false);
  };

  const waitFor = async (fn, timeout = 20000) => {
    const t = Date.now();
    while (Date.now() - t < timeout) {
      try { if (await page.evaluate(fn)) return true; } catch (e) {}
      await sleep(300);
    }
    console.log('TIMEOUT waiting', String(fn).slice(0, 60));
    await page.screenshot({ path: '/workspace/.demo-build/dbg-' + MODE + '.jpg', type: 'jpeg', quality: 80 }).catch(() => {});
    return false;
  };

  const readPlan = () => page.evaluate(() => {
    try {
      const q = PracticeState.currentSet[PracticeState.currentIndex];
      let subs = [];
      if (typeof getEffectiveSubQuestions === 'function') subs = getEffectiveSubQuestions(q);
      else if (Array.isArray(q.subQuestions)) subs = q.subQuestions;
      return { tf: subs.length > 0, ans: subs.map(s => !!s.answer), key: q.answer == null ? null : String(q.answer) };
    } catch (e) { return { err: String(e).slice(0, 120) }; }
  });

  const clickEl = async (b, pause) => {
    if (!b) return false;
    await page.evaluate(([x, y]) => window.__dcMove(x, y), [b.x, b.y]);
    await sleep(380);
    await page.evaluate(() => window.__dcClick());
    await page.mouse.click(b.x, b.y);
    await sleep(pause);
    return true;
  };

  let flipped = false;
  const answerQuestion = async (qIndex) => {
    const plan = await readPlan();
    console.log('plan', qIndex, JSON.stringify(plan));
    if (plan.tf) {
      for (let i = 0; i < plan.ans.length; i++) {
        let want = plan.ans[i];
        if (i === 1 && !flipped) { want = !plan.ans[1]; flipped = true; }
        const b = await page.evaluate(([idx, w]) => {
          const card = document.querySelectorAll('.practice-option-card')[idx];
          if (!card) return null;
          const btns = Array.from(card.querySelectorAll('.practice-tf-btn'));
          const el = btns.find(x => (x.textContent || '').trim() === w) || btns[0];
          if (!el) return null;
          const r0 = el.getBoundingClientRect();
          if (r0.top < 90 || r0.bottom > window.innerHeight - 60) el.scrollIntoView({ block: 'center', behavior: 'instant' });
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        }, [i, want ? '正确' : '错误']);
        await clickEl(b, 520);
      }
      return true;
    }
    const b = await page.evaluate((key) => {
      let el = null;
      if (key) el = document.querySelector('[data-choice-key="' + key + '"]') || document.querySelector('[data-logic-idx="' + key + '"]');
      if (!el) el = document.querySelector('.practice-logic-option');
      if (!el) return null;
      const r0 = el.getBoundingClientRect();
      if (r0.top < 90 || r0.bottom > window.innerHeight - 60) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }, plan.key);
    if (!b) return false;
    await clickEl(b, 800);
    return true;
  };

  const clickLabel = async (text, pause = 900) => {
    const box = await page.evaluate((t) => {
      const els = Array.from(document.querySelectorAll('.practice-filter-check'));
      const el = els.find(e => (e.textContent || '').replace(/\s+/g, ' ').trim().startsWith(t));
      if (!el) return null;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }, text);
    if (!box) { console.log('MISS label', text); return false; }
    await moveClick(box.x, box.y, pause);
    return true;
  };

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(9000);
  tDemo = Date.now();
  await page.evaluate(() => window.__dcMove(1500, 300));
  await sleep(900);

  if (MODE === 'A') {
    await openMenuThen('练习');
    mark('menu');
    await waitFor(() => !!document.querySelector('#page-content') && /开始练习/.test(document.body.innerText), 25000);
    await sleep(900);
    await clickLabel('CnBO 联赛真题', 1200);
    mark('source');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(900);
    await clickText('竞赛模式', 1000, false);
    mark('mode');
    await clickText('开始练习', 400, false);
    await waitFor(() => document.querySelectorAll('.practice-tf-btn, .practice-logic-option, .practice-option-card').length > 0, 20000);
    mark('start');
    await sleep(1600);
    for (let i = 0; i < 4; i++) {
      const ok = await answerQuestion(i);
      console.log('answered', i, ok);
      if (!ok) break;
      mark('answer' + i);
      await sleep(1200);
      if (await hasBtn('提交答案')) { await clickText('提交答案', 500, false); mark('submit' + i); }
      await sleep(3800);
      mark('grade' + i);
      const hasNext = await hasBtn('下一题');
      if (!hasNext) break;
      await clickText('下一题', 2400, false);
      await waitFor(() => document.querySelectorAll('.practice-tf-btn, .practice-logic-option, .practice-option-card').length > 0, 10000);
      mark('next' + i);
      await sleep(1800);
    }
    await sleep(2600);
    await page.keyboard.press('Escape');
    mark('back');
    await sleep(3500);
  } else {
    await page.evaluate(() => { location.hash = '#/knowledge-graph'; });
    await sleep(7000);
    await page.evaluate(() => window.scrollTo({ top: 120, behavior: 'smooth' }));
    await sleep(1600);
    await page.evaluate(() => window.__dcMove(1010, 520));
    await sleep(1800);
    await page.evaluate(() => window.scrollTo({ top: 380, behavior: 'smooth' }));
    await sleep(2600);
    await page.evaluate(() => { location.hash = '#/credit-leaderboard'; });
    await sleep(6500);
    await page.evaluate(() => window.__dcMove(1400, 640));
    await sleep(2600);
    await page.evaluate(() => { location.hash = '#/points-shop'; });
    await sleep(6500);
    await page.evaluate(() => window.__dcMove(900, 700));
    await sleep(2600);
  }

  const tEnd = Date.now();
  const video = page.video();
  await ctx.close();
  await browser.close();
  fs.writeFileSync('/workspace/.demo-build/events-' + MODE + '.json', JSON.stringify({ offset: +((tDemo - t0) / 1000).toFixed(2), dur: +((tEnd - tDemo) / 1000).toFixed(2), ev }, null, 2));
  console.log('video', await video.path());
  console.log('offset', ((tDemo - t0) / 1000).toFixed(2), 'dur', ((tEnd - tDemo) / 1000).toFixed(2));
  console.log(JSON.stringify(ev));
})();
