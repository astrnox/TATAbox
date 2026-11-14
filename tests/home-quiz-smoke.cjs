/**
 * 首屏「每日一题」答题卡单测（H-01）
 * 运行环境：node + jsdom（在用例内构造浏览器环境，便于直接加载 IIFE 源码）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(path.resolve(__dirname, '../js/pages/home-quiz.js'), 'utf8');

function row(label, answer, text) {
  return `
    <div class="hq-row" data-label="${label}" data-answer="${answer}">
      <span class="hq-label">${label}</span>
      <span class="hq-text">${text}</span>
      <label class="hq-choice"><input type="radio" name="q-${label}" value="true"><span>正确</span></label>
      <label class="hq-choice"><input type="radio" name="q-${label}" value="false"><span>错误</span></label>
      <p class="hq-exp" hidden>解析 ${label}</p>
    </div>`;
}

function buildDom(search) {
  const html = `
    <body>
      <div id="homeQuiz">
        <p class="hq-kicker">每日一题</p>
        <div id="homeQuizCard"><div id="homeQuizFlip">
          <article class="hq-question" data-day="0" data-qid="Q-TEST">
            <p class="hq-stem">测试题干</p>
            <fieldset class="hq-options">
              ${row('A', 'true', '陈述 A')}
              ${row('B', 'false', '陈述 B')}
            </fieldset>
            <button type="button" class="hq-submit" disabled>提交答案</button>
            <span class="hq-status"></span>
          </article>
        </div></div>
        <section class="hq-panel" id="homeQuizPanel" hidden>
          <p class="hq-kicker" id="homeQuizPanelKicker">今日完成</p>
          <h2 class="hq-panel-title" id="homeQuizPanelTitle"></h2>
          <p class="hq-score" id="homeQuizScore"></p>
          <span id="hqWrongCount"></span><span id="hqTodayCount"></span>
          <span id="hqAcc"></span><span id="hqStreak"></span>
          <nav id="homeQuizNav">
            <a href="#/practice" data-route="/practice">继续刷题</a>
            <a href="#/wrongbook" data-route="/wrongbook">错题本</a>
            <a href="#/dashboard" data-route="/dashboard">仪表盘</a>
          </nav>
        </section>
      </div>
      <nav id="mobileNav"><div class="mn-body">
        <a href="#/" data-route="/" class="mn-home">首页</a>
        <div class="mn-section"><div class="mn-section-label">学习</div>
          <a href="#/practice" data-route="/practice">练习</a>
          <a href="#/wrongbook" data-route="/wrongbook">错题本</a>
        </div>
      </div></nav>
      <div class="hero-content" id="homeHeroClassic" hidden></div>
    </body>`;
  const dom = new JSDOM(html, { url: 'https://example.com/' + (search || ''), runScripts: 'outside-only' });
  dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  dom.window.eval(SRC);
  return dom;
}

function choose(win, label, value) {
  const input = win.document.querySelector(`.hq-row[data-label="${label}"] input[value="${value}"]`);
  input.checked = true;
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
}


function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

function run() {
  // 1. 选完才能提交；提交后展开工作台并计入统计
  {
    const { window } = buildDom();
    window.HomeQuiz.init();
    const submit = window.document.querySelector('.hq-submit');
    assert(submit.disabled === true, '未作答时提交按钮应禁用');
    choose(window, 'A', 'true');
    choose(window, 'B', 'false');
    assert(submit.disabled === false, '选完后提交按钮应可用');
    submit.click();
    assert(window.document.getElementById('homeQuizPanel').hidden === false, '提交后应展开结果面板');
    assert(/2 \/ 2/.test(window.document.getElementById('homeQuizPanelTitle').textContent), '面板标题应显示 2 / 2');
    const panelNav = window.document.getElementById('homeQuizNav');
    assert(panelNav.children.length === 3, '面板应只有 3 个常用入口');
    assert(panelNav.querySelector('a[href="#/wrongbook"]'), '面板入口应包含错题本');
    assert(window.document.querySelectorAll('.hq-row.is-correct').length === 2, '两条都应标为正确');
    const stats = JSON.parse(window.localStorage.getItem('tatabox_stats'));
    assert(stats.totalAnswered === 1 && stats.totalCorrect === 1, '统计应累加 1 题 1 对');
    assert(window.document.getElementById('hqAcc').textContent === '100%', '正确率应为 100%');
  }

  // 2. 答错写入错题本
  {
    const { window } = buildDom();
    window.HomeQuiz.init();
    choose(window, 'A', 'false');
    choose(window, 'B', 'false');
    window.document.querySelector('.hq-submit').click();
    const wrong = JSON.parse(window.localStorage.getItem('tatabox_wrong_questions'));
    assert(wrong.length === 1 && wrong[0].qId === 'Q-TEST', '错题应写入错题本');
    assert(window.document.getElementById('hqWrongCount').textContent === '1', '工作台应显示待复活 1 道');
  }

  // 3. classic 回退
  {
    const { window } = buildDom('?home=classic');
    window.HomeQuiz.init();
    assert(window.document.getElementById('homeQuiz').hidden === true, 'classic 模式应隐藏答题卡');
    assert(window.document.getElementById('homeHeroClassic').hidden === false, 'classic 模式应显示旧版 hero');
  }

  console.log('home-quiz smoke: 3 组用例通过');
}

run();

// 4. 真实 index.html 构建产物：5 道题、可判分、工作台可展开
{
  const indexPath = path.resolve(__dirname, '../index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  dom.window.eval(SRC);
  dom.window.HomeQuiz.init();

  const questions = dom.window.document.querySelectorAll('#homeQuizFlip .hq-question');
  assert(questions.length === 5, '构建产物应内联 5 道题，实际 ' + questions.length);

  let active = null;
  for (const q of questions) if (!q.hidden) { active = q; break; }
  assert(!!active, '应有且仅有一道题可见');
  assert(active.querySelectorAll('.hq-row').length === 4, '每题应为 4 条判断');

  for (const row of active.querySelectorAll('.hq-row')) {
    const answer = row.getAttribute('data-answer');
    const input = row.querySelector('input[value="' + answer + '"]');
    input.checked = true;
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }
  const submit = active.querySelector('.hq-submit');
  assert(submit.disabled === false, '全部选完后应可提交');
  submit.click();
  assert(dom.window.document.getElementById('homeQuizPanel').hidden === false, '真实页面提交后应展开结果面板');
  assert(/4 \/ 4/.test(dom.window.document.getElementById('homeQuizPanelTitle').textContent), '全对应显示 4 / 4');
  const realNav = dom.window.document.getElementById('homeQuizNav');
  assert(realNav.children.length === 3, '真实页面的面板应有 3 个常用入口');
  assert(realNav.querySelector('a[href="#/practice"]'), '真实页面面板应包含继续刷题');
  console.log('home-quiz index smoke: 通过（5 题 / 4 条 / 判分 / 结果面板 / 3 个常用入口）');
}
