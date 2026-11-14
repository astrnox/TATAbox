/**
 * 旧内核降级判定单测（fail-open：能用就放行）
 * 运行环境：node + jsdom（在用例内构造浏览器环境，便于直接加载 IIFE 源码）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(path.resolve(__dirname, '../js/core/legacy-fallback.js'), 'utf8');

const HTML = `
  <body>
    <div id="bq-boot-mask"><span>加载中</span></div>
    <article class="hq-question">
      <p class="hq-stem">测试题干</p>
      <div class="hq-toggle"><label>正确</label></div>
      <div class="hq-submit-row"><button class="hq-submit">提交答案</button></div>
      <details class="hq-nojs"><summary>查看答案与解析</summary><ul><li>A 正确</li></ul></details>
    </article>
  </body>`;

function buildDom(flags) {
  const dom = new JSDOM(HTML, { url: 'https://example.com/', runScripts: 'outside-only' });
  const win = dom.window;
  if (flags.parsed) win.__bqProbeParsed = true;
  if (flags.modern) win.__bqModern = true;
  if (flags.booted) win.__appBooted = true;
  win.eval(SRC);
  return dom;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

async function run() {
  // 1. 现代浏览器：探针正常且 API 齐备 → 不做任何事
  {
    const { window } = buildDom({ parsed: true, modern: true });
    await sleep(50);
    assert(!window.document.getElementById('bq-legacy-notice'), '现代浏览器不应出现降级提示');
    assert(window.document.documentElement.className.indexOf('bq-legacy') === -1, '现代浏览器不应加 bq-legacy');
  }

  // 2. 探针文件没加载成功，但应用正常启动 → 放行，不误报
  {
    const { window } = buildDom({ booted: true });
    await sleep(3200);
    assert(!window.document.getElementById('bq-legacy-notice'), '应用已启动时不应误报浏览器过旧');
  }

  // 3. 真老内核：探针没解析、应用没启动 → 只读降级
  {
    const { window } = buildDom({});
    await sleep(3200);
    const notice = window.document.getElementById('bq-legacy-notice');
    assert(!!notice, '老内核应出现只读提示');
    assert(window.document.documentElement.className.indexOf('bq-legacy') !== -1, '老内核应加 bq-legacy');
    assert(!window.document.getElementById('bq-boot-mask'), '降级时应摘除首屏遮罩');
    assert(window.document.querySelector('.hq-nojs').open === true, '降级时应直接展开答案解析');

    // 4. 误判自愈：应用晚到（app-ready）→ 撤销降级
    window.document.dispatchEvent(new window.Event('bioquest:app-ready'));
    assert(!window.document.getElementById('bq-legacy-notice'), 'app-ready 后应移除提示');
    assert(window.document.documentElement.className.indexOf('bq-legacy') === -1, 'app-ready 后应移除 bq-legacy');
    assert(!window.document.getElementById('bq-legacy-style'), 'app-ready 后应移除降级样式');
  }

  console.log('legacy-fallback smoke: 3 组用例通过');
}

run();
