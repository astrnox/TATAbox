/**
 * TATABOX — 首屏「每日一题」答题卡
 * ------------------------------------------------------------
 * 首屏题面由 scripts/build-home-quiz.mjs 在构建期写入 index.html，
 * 这里只负责判分、翻页动画、回访衔接与工作台数据填充，不发起任何请求。
 * 入口：window.HomeQuiz.init()，由 app-home.js 在首页渲染后调用。
 * ============================================================
 */
'use strict';

(function () {
  var STATE_KEY = 'bq:home-quiz:v1';
  var MODE_KEY = 'bq:home-mode';
  var DAY_MS = 86400000;

  var _boundEl = null;

  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 隐私模式 / 配额不足时静默 */ }
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function isClassicMode() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('home') === 'classic') return true;
    } catch (e) { /* 老浏览器无 URLSearchParams 时忽略 */ }
    try {
      return window.localStorage.getItem(MODE_KEY) === 'classic';
    } catch (e) {
      return false;
    }
  }

  /** 回退到旧版 hero：?home=classic 或本地 home-mode=classic */
  function applyClassicMode() {
    var quiz = document.getElementById('homeQuiz');
    var classic = document.getElementById('homeHeroClassic');
    if (quiz) quiz.hidden = true;
    if (classic) classic.hidden = false;
  }

  function setKicker(text) {
    var el = document.querySelector('.hq-kicker');
    if (el) el.textContent = text;
  }

  function rowsOf(question) {
    return question ? question.querySelectorAll('.hq-row') : [];
  }

  function checkedValue(row) {
    var input = row.querySelector('input[type="radio"]:checked');
    return input ? input.value : null;
  }

  function updateStatus(question) {
    if (!question) return;
    var rows = rowsOf(question);
    var missing = 0;
    for (var i = 0; i < rows.length; i++) {
      if (!checkedValue(rows[i])) missing++;
    }
    var status = question.querySelector('.hq-status');
    var submit = question.querySelector('.hq-submit');
    if (status) {
      status.textContent = missing ? '还有 ' + missing + ' 条未选' : '已选完，可以提交';
    }
    if (submit) submit.disabled = missing > 0;
  }

  function clearMarks(question) {
    var rows = rowsOf(question);
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.remove('is-correct', 'is-wrong');
      var exp = rows[i].querySelector('.hq-exp');
      if (exp) exp.hidden = true;
      var inputs = rows[i].querySelectorAll('input');
      for (var j = 0; j < inputs.length; j++) inputs[j].disabled = false;
    }
    var hint = question.querySelector('.hq-hint');
    if (hint) hint.hidden = true;
    var submit = question.querySelector('.hq-submit');
    if (submit) {
      submit.disabled = true;
      submit.textContent = '提交答案';
    }
    var status = question.querySelector('.hq-status');
    if (status) status.textContent = '还有 ' + rows.length + ' 条未选';
  }

  /** 还原已提交状态（当天已答完并刷新/返回首页时） */
  function restoreSubmitted(question, state) {
    var rows = rowsOf(question);
    for (var i = 0; i < rows.length; i++) {
      var label = rows[i].getAttribute('data-label');
      var picked = state.answers && state.answers[label];
      if (picked === undefined || picked === null) continue;
      var inputs = rows[i].querySelectorAll('input');
      for (var j = 0; j < inputs.length; j++) {
        inputs[j].checked = String(inputs[j].value) === String(picked);
        inputs[j].disabled = true;
      }
      var correct = rows[i].getAttribute('data-answer') === 'true';
      rows[i].classList.add(correct ? 'is-correct' : 'is-wrong');
      var exp = rows[i].querySelector('.hq-exp');
      if (exp) exp.hidden = false;
    }
    var hint = question.querySelector('.hq-hint');
    if (hint) hint.hidden = false;
    var submit = question.querySelector('.hq-submit');
    if (submit) {
      submit.disabled = true;
      submit.textContent = '已提交';
    }
    var status = question.querySelector('.hq-status');
    if (status) status.textContent = '本题已完成';
    showResult(state.correct || 0, rows.length, false);
  }

  function showResult(correct, total, jump) {
    var panel = document.getElementById('homeQuizPanel');
    var score = document.getElementById('homeQuizScore');
    if (!panel || !score) return;
    var tail = correct === total ? '全对，今天的题感不错' :
      (correct >= total - 1 ? '只差一条，再看一眼解析' :
        (correct * 2 >= total ? '有一半需要回看' : '建议先读解析再做一道'));
    var title = document.getElementById('homeQuizPanelTitle');
    if (title) title.textContent = '答对 ' + correct + ' / ' + total + ' 条';
    score.textContent = tail;
    panel.hidden = false;
    paintBoard();

    if (jump === false) return;
    // 答完就跳到面板：滚动到顶部并把焦点交给标题，键盘/读屏用户不会丢失位置
    if (typeof panel.scrollIntoView === 'function') {
      try {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        panel.scrollIntoView();
      }
    }
    if (title) {
      try { title.focus({ preventScroll: true }); } catch (e2) { /* 忽略 */ }
    }
  }

  /** 工作台数字：错题、今日已刷、正确率、连续天数 */
  function paintBoard() {
    var wrong = readJSON('tatabox_wrong_questions', []);
    var stats = readJSON('tatabox_stats', null) || {};
    var history = readJSON('tatabox_history', []);

    var wrongCount = Array.isArray(wrong) ? wrong.length : 0;
    var todayTotal = 0;
    var todayCorrect = 0;
    if (Array.isArray(history)) {
      for (var i = 0; i < history.length; i++) {
        var item = history[i] || {};
        var date = item.date || '';
        if (date.slice(0, 10) !== todayISO()) continue;
        todayTotal += item.total || 0;
        todayCorrect += item.correct || 0;
      }
    }

    var totalAnswered = stats.totalAnswered || 0;
    var totalCorrect = stats.totalCorrect || 0;
    var acc = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null;

    setText('hqWrongCount', wrongCount);
    setText('hqTodayCount', todayTotal);
    setText('hqAcc', acc === null ? '—' : acc + '%');
    setText('hqStreak', stats.streak > 0 ? stats.streak + ' 天' : '—');
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  /** 把首页答题计入学习统计与错题本，口径与练习页一致 */
  function recordResult(question, allCorrect) {
    var stats = readJSON('tatabox_stats', null) || {};
    stats.totalAnswered = (stats.totalAnswered || 0) + 1;
    if (allCorrect) stats.totalCorrect = (stats.totalCorrect || 0) + 1;
    if (!stats.modules) stats.modules = {};
    writeJSON('tatabox_stats', stats);

    var history = readJSON('tatabox_history', []);
    if (!Array.isArray(history)) history = [];
    history.push({ date: todayISO(), correct: allCorrect ? 1 : 0, total: 1, timestamp: Date.now() });
    writeJSON('tatabox_history', history.slice(-500));

    if (allCorrect) return;
    var wrong = readJSON('tatabox_wrong_questions', []);
    if (!Array.isArray(wrong)) wrong = [];
    var qid = question.getAttribute('data-qid') || '';
    var stemEl = question.querySelector('.hq-stem');
    var subject = question.getAttribute('data-subject') || '';
    var concept = question.getAttribute('data-concept') || '';
    var tags = (question.getAttribute('data-tags') || '').split(',').filter(Boolean);
    // 同一题当天只记一次，避免反复提交把错题本刷屏
    var exists = wrong.some(function (item) { return item && item.qId === qid; });
    if (!exists && qid) {
      wrong.push({
        qId: qid,
        questionText: stemEl ? stemEl.textContent : '',
        subject: subject,
        concept: concept,
        tags: tags,
        module: 'general',
        timestamp: Date.now(),
        wrongCount: 1
      });
      writeJSON('tatabox_wrong_questions', wrong.slice(-200));
    }
  }

  function submitQuestion(button) {
    var question = button.closest ? button.closest('.hq-question') : null;
    if (!question || question.getAttribute('data-submitted') === '1') return;
    var rows = rowsOf(question);
    var answers = {};
    var correct = 0;
    var missing = false;

    for (var i = 0; i < rows.length; i++) {
      var label = rows[i].getAttribute('data-label');
      var picked = checkedValue(rows[i]);
      if (!picked) { missing = true; break; }
      answers[label] = picked === 'true';
      var expected = rows[i].getAttribute('data-answer') === 'true';
      var isRight = (picked === 'true') === expected;
      if (isRight) correct++;
      rows[i].classList.add(isRight ? 'is-correct' : 'is-wrong');
      var exp = rows[i].querySelector('.hq-exp');
      if (exp) exp.hidden = false;
    }
    if (missing) {
      updateStatus(question);
      return;
    }

    question.setAttribute('data-submitted', '1');
    var inputs = question.querySelectorAll('input');
    for (var k = 0; k < inputs.length; k++) inputs[k].disabled = true;
    button.disabled = true;
    button.textContent = '已提交';
    var hint = question.querySelector('.hq-hint');
    if (hint) hint.hidden = false;
    var status = question.querySelector('.hq-status');
    if (status) status.textContent = '本题已完成';

    recordResult(question, correct === rows.length);
    showResult(correct, rows.length);

    writeJSON(STATE_KEY, {
      date: todayKey(),
      idx: parseInt(question.getAttribute('data-day'), 10) || 0,
      qid: question.getAttribute('data-qid') || '',
      answers: answers,
      submitted: true,
      correct: correct
    });
  }

  /** 切换到第 idx 道；animate 时做一次翻页（旧题淡出 → 替换 → 回正） */
  function showQuestion(questions, idx, animate) {
    var flip = document.getElementById('homeQuizFlip');
    if (!flip || !questions.length) return;
    var safeIdx = ((idx % questions.length) + questions.length) % questions.length;

    var swap = function () {
      for (var i = 0; i < questions.length; i++) {
        questions[i].hidden = i !== safeIdx;
      }
      var panel = document.getElementById('homeQuizPanel');
      if (panel) panel.hidden = true;
      updateStatus(questions[safeIdx]);
    };

    if (!animate || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      swap();
      return;
    }
    flip.classList.add('is-flipping');
    window.setTimeout(function () {
      swap();
      flip.classList.remove('is-flipping');
    }, 320);
  }

  function bind(questions) {
    var flip = document.getElementById('homeQuizFlip');
    if (!flip || _boundEl === flip) return;
    _boundEl = flip;

    flip.addEventListener('change', function (event) {
      var target = event.target;
      if (!target || target.type !== 'radio') return;
      var question = target.closest ? target.closest('.hq-question') : null;
      updateStatus(question);
    });

    flip.addEventListener('click', function (event) {
      var target = event.target;
      var button = target && target.closest ? target.closest('.hq-submit') : null;
      if (button) submitQuestion(button);
    });

    var next = document.getElementById('homeQuizNext');
    if (next) {
      next.addEventListener('click', function () {
        var current = 0;
        for (var i = 0; i < questions.length; i++) {
          if (!questions[i].hidden) { current = i; break; }
        }
        var nextIdx = (current + 1) % questions.length;
        showQuestion(questions, nextIdx, true);
      });
    }
  }

  function init() {
    var quiz = document.getElementById('homeQuiz');
    var classic = document.getElementById('homeHeroClassic');
    if (!quiz) return;

    document.body.classList.add('js-enhanced');

    if (isClassicMode()) {
      applyClassicMode();
      return;
    }
    if (classic) classic.hidden = true;
    quiz.hidden = false;

    var flip = document.getElementById('homeQuizFlip');
    var questions = flip ? flip.querySelectorAll('.hq-question') : [];
    if (!questions.length) {
      // 构建脚本未写入题面时退回旧版 hero，避免首屏空白
      applyClassicMode();
      return;
    }

    bind(questions);

    var state = readJSON(STATE_KEY, null);
    var baseIdx = Math.floor(Date.now() / DAY_MS) % questions.length;
    var targetIdx = baseIdx;
    var animate = false;

    if (state && state.date === todayKey() && !state.submitted && typeof state.idx === 'number') {
      targetIdx = state.idx;
      setKicker('接着上次 · 4 条判断');
      animate = targetIdx !== baseIdx;
    } else if (state && state.date === todayKey() && state.submitted && state.correct < 4) {
      targetIdx = (baseIdx + 1) % questions.length;
      setKicker('换一道 · 4 条判断');
      animate = true;
    } else if (state && state.date === todayKey() && state.submitted && state.correct === 4) {
      targetIdx = typeof state.idx === 'number' ? state.idx : baseIdx;
      setKicker('今天已完成 · 4 条判断');
      animate = false;
    } else {
      setKicker('每日一题 · 4 条判断');
    }

    showQuestion(questions, targetIdx, animate);

    // 还原状态放在切换之后，避免翻页过程中闪出答案
    var settle = animate ? 360 : 0;
    window.setTimeout(function () {
      var active = null;
      for (var i = 0; i < questions.length; i++) {
        if (!questions[i].hidden) { active = questions[i]; break; }
      }
      if (!active || !state || state.date !== todayKey()) return;

      if (state.submitted && state.idx === parseInt(active.getAttribute('data-day'), 10)) {
        restoreSubmitted(active, state);
        return;
      }
      if (!state.submitted && state.answers) {
        var rows = rowsOf(active);
        for (var r = 0; r < rows.length; r++) {
          var label = rows[r].getAttribute('data-label');
          var picked = state.answers[label];
          var inputs = rows[r].querySelectorAll('input');
          for (var j = 0; j < inputs.length; j++) {
            inputs[j].checked = picked !== undefined && String(inputs[j].value) === String(picked);
          }
        }
        updateStatus(active);
      }
    }, settle);
  }

  window.HomeQuiz = { init: init };
})();
