/**
 * ============================================================
 * TATABOX lite — 极简版单文件应用（设计方案 v2.1 Wave 3-6）
 * ------------------------------------------------------------
 * 五视图：今日 / 练 / 复 / 错 / 榜（hash 路由 lite.html#/today …）
 * 宪章落地：
 *   1 一个绿（令牌层由 tokens.css 保证，夜巡为唯一例外）
 *   2 动效只准表达进度与反馈（本文件仅三处：判对呼吸 / 计数位移 / 进度线）
 *   3 数字必须为真（配额、到期、队列、名次全部来自引擎或数据库实时值）
 *   4 UI 一律系统黑体（--font-sans，lite 不加载任何 webfont）
 *   5 留白不替用户解码（空态均附真实预期文案）
 * 数据硬契约：只经 storage.js / sb-data.js / weekly_leaderboard 视图读写，
 *             不自建 localStorage 进度键、不直查 Supabase 表。
 * ============================================================
 */
(function () {
  'use strict';

  /* ================= 工具 ================= */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  var fmtDate = function (ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '月' + pad2(d.getDate()) + '日';
  };
  var todayStr = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  };
  var dayStart = function (d) { var x = new Date(d || Date.now()); x.setHours(0, 0, 0, 0); return x.getTime(); };
  var weekStart = function () {
    var x = new Date(); x.setHours(0, 0, 0, 0);
    var dow = (x.getDay() + 6) % 7;             // 周一为一周之始（Asia/Shanghai 由系统时区保证）
    x.setDate(x.getDate() - dow);
    return x.getTime();
  };
  var weekKey = function () { return todayStr(new Date(weekStart())); };

  /* ================= 全局状态 ================= */
  var S = {
    view: 'today',
    bank: null,            // 题库（懒加载；与主站同源：manifest + data/bank 分片）
    decks: null,           // cards.json 卡片（启动加载）
    dueList: [],           // FSRS 当日到期卡（引擎实时值）
    target: 20,            // 今日练配额（引擎推荐，min(recommend, 20)）
    todayAnswered: 0,
    todayCorrect: 0,
    practice: null,        // 练习会话
    review: null,          // 复习会话
    wrong: { mode: 'queue', openIdx: -1, answer: null },
    board: { tab: 'practice', loading: true, rows: null, localOnly: false, my: null, seq: 0, myAnonLabelOk: false },
    privacy: 'public',     // public | anon | out
    loggedIn: false,
    sampleOn: false,
    _patchTimer: null
  };

  var LS = {
    theme: 'bioquest-theme',
    privacy: 'bioquest_lb_privacy',
    entryPref: 'bioquest-entry-pref',
    sample: 'bioquest_lite_sample_done',
    touched: 'bioquest_lite_touched'   // 首次从主站跳入的 toast 标记
  };

  /* ================= 三态主题（亮 → 暗 → 夜巡） ================= */
  var THEME_CYCLE = ['light', 'dark', 'night'];
  var THEME_LABEL = { light: '亮', dark: '暗', night: '夜' };

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }
  function nextThemeOf(t) {
    return THEME_CYCLE[(THEME_CYCLE.indexOf(t) + 1) % THEME_CYCLE.length];
  }
  function cycleTheme() {
    var next = nextThemeOf(currentTheme());
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(LS.theme, next); } catch (e) {}
    // 同步主站 toggleTheme 所需的运行时状态（若主站脚本存在）
    try { if (window._AppState) window._AppState.theme = next; } catch (e) {}
    paintThemeBtn();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      // theme-color 三色映射放在 HTML data-* 上（避免 JS 硬编码色值，audit 棘轮）
      var map = {
        light: meta.getAttribute('data-color-light') || '',
        dark: meta.getAttribute('data-color-dark') || '',
        night: meta.getAttribute('data-color-night') || ''
      };
      if (map[next]) meta.setAttribute('content', map[next]);
    }
  }

  /** 主题按钮显示"将切换到的主题"（而非当前），点击前语义自明 */
  function paintThemeBtn() {
    var btn = $('#liteThemeBtn');
    if (!btn) return;
    var nx = nextThemeOf(currentTheme());
    btn.textContent = THEME_LABEL[nx];
    btn.setAttribute('aria-label', '切换主题，下一个是' +
      ({ light: '亮色', dark: '暗色', night: '夜巡模式' })[nx]);
    btn.setAttribute('title', '当前：' + THEME_LABEL[currentTheme()] + ' → 点击切到 ' + THEME_LABEL[nx]);
  }

  /* ================= 进度线（全站唯一常驻动效） ================= */
  function setProgress(fraction, hold) {
    var el = $('#liteProgress');
    if (!el) return;
    var bar = el.querySelector('i') || el;
    if (hold) {
      el.classList.add('hold');
      bar.style.width = '100%';
      setTimeout(function () {
        el.classList.remove('hold');           // 保持 1s 后转为普通过渡（4.5：进度被确认）
      }, 1000);
    } else {
      el.classList.remove('hold');
      bar.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
    }
  }

  function toast(msg, ms) {
    var el = $('#liteToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, ms || 5000);
  }

  /* ============================================================
   * 数据：今日三项的真实值（宪章 3：数字必须为真）
   * ============================================================ */

  /** 引擎推荐配额：由最近 10 次练习的真实正确率推导，封顶 20（设计 §4.2） */
  function recommendTarget() {
    var recs = (typeof getRecords === 'function' ? getRecords({ limit: 10 }) : [])
      .filter(function (r) { return (r.totalQuestions || 0) > 0; });
    if (recs.length === 0) return 10;                    // 无历史：从 10 组起步
    var q = 0, c = 0;
    recs.forEach(function (r) { q += r.totalQuestions; c += r.correctCount; });
    var acc = q > 0 ? c / q : 0;
    var rec = acc >= 0.8 ? 20 : (acc >= 0.6 ? 15 : 10);   // 正确率越高，任务越重
    return Math.min(rec, 20);
  }

  function todayStats() {
    var t = todayStr(), q = 0, c = 0;
    (typeof getRecords === 'function' ? getRecords() : []).forEach(function (r) {
      if ((r.date || todayStr(new Date(r.timestamp || 0))) === t) {
        q += r.totalQuestions || 0;
        c += r.correctCount || 0;
      }
    });
    return { answered: q, correct: c };
  }

  /* ---- FSRS 到期（与 cards.js 共享同一进度键 anki_progress_v2） ---- */
  var ANKI_KEY = 'anki_progress_v2';
  function loadDeckProgress() {
    try { return JSON.parse(localStorage.getItem(ANKI_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveDeckProgress(p) {
    try { localStorage.setItem(ANKI_KEY, JSON.stringify(p)); } catch (e) {}
  }
  /** 引擎实时值：到期待复习卡 + 今日已复习卡（去重按卡） */
  function computeDue() {
    var due = [], reviewedToday = 0, learned = 0;
    var prog = loadDeckProgress();
    var ts0 = dayStart(), now = Date.now();
    (S.decks || []).forEach(function (cat, di) {
      var deckId = 'deck_' + di;
      var dp = prog[deckId] && prog[deckId].cards ? prog[deckId].cards : {};
      (cat.cards || []).forEach(function (card, ci) {
        var cp = dp[String(ci)];
        if (cp && cp.repetitions > 0) {
          learned++;
          if ((cp.lastReview || 0) >= ts0) reviewedToday++;
          if (cp.dueDate <= now && (cp.lastReview || 0) < ts0) {
            due.push({ deckId: deckId, catId: cat.id, cat: cat.name, cardIdx: ci, card: card, cp: cp });
          }
        }
      });
    });
    // 过期越久优先（与 fsrs-algorithm.getDueCards 同序）
    due.sort(function (a, b) { return (a.cp.dueDate || 0) - (b.cp.dueDate || 0); });
    return { due: due, reviewedToday: reviewedToday, learned: learned };
  }

  function wrongQueue() {
    return (typeof getWrongQuestions === 'function' ? getWrongQuestions() : []);
  }
  function specimenList() {
    return (typeof getSpecimens === 'function' ? getSpecimens() : []);
  }

  /** 今日三任务的真实状态 */
  function todayTasks() {
    var st = todayStats();
    S.todayAnswered = st.answered;
    S.todayCorrect = st.correct;
    S.target = recommendTarget();

    var d = computeDue();
    S.dueList = d.due;

    var q = wrongQueue().length;
    var learnedAny = d.learned > 0 || st.answered > 0 || q > 0;

    var tasks = [
      {
        key: 'practice',
        title: '练习 ' + S.target + ' 题',
        done: st.answered >= S.target,
        state: st.answered >= S.target ? '✓' :
          (st.answered > 0 ? st.answered + '/' + S.target : '未开始'),
        cls: st.answered >= S.target ? 'done' : (st.answered > 0 ? 'inprogress' : '')
      },
      d.due.length === 0 && d.reviewedToday === 0
        ? {
            key: 'review', title: '今日无到期复习', done: true, cls: 'done',
            state: '无需复习', collapse: true
          }
        : {
            key: 'review',
            title: '复习 ' + d.due.length + ' 张',
            done: d.due.length === 0,
            state: d.due.length === 0 ? '✓ 已清' : '待复习 ' + d.due.length,
            cls: d.due.length === 0 ? 'done' : (d.reviewedToday > 0 ? 'inprogress' : '')
          },
      {
        key: 'wrong',
        title: '错题清理 ' + q + ' 题',
        done: q === 0,
        state: q === 0 ? '✓ 已清' : '未开始',
        cls: q === 0 ? 'done' : ''
      }
    ];
    // 冷启动判定（B6）：从未使用过
    S.sampleOn = !learnedAny && (typeof getRecords === 'function' ? getRecords() : []).length === 0
      && !tryGet(LS.sample);
    return tasks;
  }

  function tryGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function trySet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ============================================================
   * 视图：今日
   * ============================================================ */
  function renderToday() {
    var tasks = todayTasks();
    var doneN = tasks.filter(function (t) { return t.done; }).length;
    var allDone = doneN === tasks.length;

    var h = '';
    h += '<div class="lite-date">' + esc(fmtDate(Date.now())) + ' ' +
      ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()] + '</div>';
    h += '<h1 class="lite-h1" id="h1-today">今天 ' + tasks.length + ' 件事</h1>';

    // 折叠项（如「今日无到期复习」）不再整行降级——三行同字号同明度，等宽栈只留纯数字
    h += '<div class="lite-tasks">';
    tasks.forEach(function (t) {
      h += '<a class="lite-task ' + t.cls + '" href="#/' + t.key + '">' +
        '<span class="lite-task-dot"></span>' +
        '<span class="lite-task-title">' + esc(t.title) + '</span>' +
        '<span class="lite-task-state">' + esc(t.state) + '</span></a>';
    });
    h += '</div>';

    if (allDone) {
      h += '<div class="lite-done">今日完毕。</div>';
      h += weekDotsHtml();
      setProgress(1, true);
    } else {
      setProgress(doneN / tasks.length, false);
      if (!allDone && doneN > 0) h += weekDotsHtml();
    }

    if (S.sampleOn) h += sampleCardHtml();
    if (S.todayAnswered > 0) {
      h += '<p class="lite-note mt-24">今日已练 ' + S.todayAnswered +
        ' 题 · 正确 ' + S.todayCorrect + ' 题' +
        (S.target > S.todayAnswered ? '（还差 ' + (S.target - S.todayAnswered) + ' 题）' : '') + '</p>';
    }

    $('#view-today').innerHTML = h;
  }

  /** 7 日方点（4.4）：完成日绿、未完成灰、今天 1px 绿描边 */
  function weekDotsHtml() {
    var ws = weekStart(), today0 = dayStart();
    var prog = loadDeckProgress();
    var recs = typeof getRecords === 'function' ? getRecords() : [];
    var h = '<div class="lite-week" role="img" aria-label="本周每日完成情况">';
    for (var i = 0; i < 7; i++) {
      var d = ws + i * 86400000;
      var cls = '';
      if (d === today0) cls = 'today';
      var t = todayStr(new Date(d));
      // 完成 = 当日有练习记录 或 当日有卡被复习过（均为可回溯的真值）
      var hasRec = recs.some(function (r) { return (r.date || '') === t && (r.totalQuestions || 0) > 0; });
      var hasRev = false;
      (S.decks || []).forEach(function (cat, di) {
        var dp = prog['deck_' + di] && prog['deck_' + di].cards || {};
        for (var k in dp) {
          if (dp[k] && (dp[k].lastReview || 0) >= d && (dp[k].lastReview || 0) < d + 86400000) hasRev = true;
        }
      });
      if (hasRec || hasRev) cls += ' done';
      h += '<span class="lite-week-dot ' + cls.trim() + '"></span>';
    }
    h += '</div>';
    return h;
  }

  function sampleCardHtml() {
    var qn = 5, cn = 10;
    var h = '<div class="lite-sample">';
    h += '<span class="lite-sample-tag">示例</span>';
    h += '<div class="lite-note">还没有你的数据。以下为示例任务，点一下就会用你自己的数据替换：</div>';
    h += '<ul><li>练 ' + qn + ' 道真实试练题（选自题库）</li>' +
      '<li>复 ' + cn + ' 张示例卡（选自知识卡片）</li>' +
      '<li>错题清理 —— 第一次答错的题会进入队列</li></ul>';
    h += '<button class="btn-primary" data-lite="sample-start" type="button">以我的数据开始</button>';
    h += '</div>';
    return h;
  }

  /* ============================================================
   * 视图：练（mtf 判断题，键盘 1=正确 2=错误，Enter 提交/下一题）
   * ============================================================ */
  async function ensureBank() {
    if (S.bank) return S.bank;
    S.bank = await loadShardBank();
    if (!S.bank || !S.bank.length) {
      // 分片不可用（离线/旧缓存）时回退静态 quiz.json
      try {
        var r = await fetch('data/quiz.json');
        var j = await r.json();
        S.bank = (j['题库'] || []).filter(function (q) { return q.type === 'mtf' && q.subQuestions && q.subQuestions.length; });
      } catch (e) { S.bank = []; }
    }
    return S.bank;
  }

  /**
   * 题库与主站联动：以 data/manifest.json 的 files 清单为准拉取全部
   * bank 分片（主站 loadQuestions 同一数据真源），不再依赖会过期的
   * quiz.json 静态快照。过滤口径与主站练习页一致：mtf、子题 ≥4、
   * 未被隔离标记（_needs_review/_unverified/_quarantined）。
   */
  async function loadShardBank() {
    try {
      var mfRes = await fetch('data/manifest.json');
      if (!mfRes.ok) return [];
      var mf = await mfRes.json();
      var files = Object.keys(mf.files || {}).filter(function (k) {
        return k.indexOf('bank/') === 0 && k.slice(-5) === '.json';
      });
      if (!files.length) return [];
      var pending = files.slice();
      var seen = {};
      var list = [];
      async function pull() {
        while (pending.length) {
          var f = pending.shift();
          try {
            var res = await fetch('data/' + f);
            if (!res.ok) continue;
            var obj = await res.json();
            Object.keys(obj).forEach(function (id) {
              var q = obj[id];
              if (!q || typeof q !== 'object' || seen[id]) return;
              seen[id] = 1;
              q.id = id;      // 稳定 bioID 作题目 ID（与 loader.js 一致）
              q.bioId = id;
              list.push(q);
            });
          } catch (e) { /* 单分片失败不阻断整体 */ }
        }
      }
      var workers = [];
      for (var w = 0; w < 8; w++) workers.push(pull());   // 并发上限，避免 80 个连接齐发
      await Promise.all(workers);
      return list.filter(function (q) {
        if (q.type !== 'mtf' || !q.subQuestions || q.subQuestions.length < 4) return false;
        return q._needs_review !== true && q._unverified !== true && q._quarantined !== true;
      });
    } catch (e) { return []; }
  }

  function startPractice() {
    S.target = recommendTarget();
    var pool = (S.bank || []).slice();
    // 简单洗牌后取配额
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    S.practice = {
      list: pool.slice(0, S.target),
      idx: 0,
      answers: {},          // { qIdx: { subIdx: bool } }
      submitted: {},
      correct: 0,
      finished: false,
      startedAt: Date.now()
    };
  }

  function moduleOf(q) {
    var m = /^M(\d+)/.exec(q.bioId || '');
    return 'module_' + (m ? m[1] : '1');
  }

  /** 模块号 → 用户可读的中文标签（不把 module_4 这类内部 ID 直出给用户） */
  var MODULE_NAMES = { 'module_1': '模块一', 'module_2': '模块二', 'module_3': '模块三', 'module_4': '模块四' };
  function moduleLabel(m) {
    return MODULE_NAMES[m] || '';
  }

  function renderPractice() {
    var p = S.practice;
    var root = $('#view-practice');
    if (!p || p.finished) { renderPracticeResult(); return; }
    if (root) root.classList.remove('lite-view--fill');
    var q = p.list[p.idx];
    var total = p.list.length;
    var h = '';

    h += '<div class="lite-q-meta"><span>第 ' + (p.idx + 1) + ' 题 / ' + total + '</span>' +
      '<span>正确 ' + p.correct + '</span></div>';
    h += '<div class="lite-concept-tag">' + esc(q.subject || '') +
      (q.concept ? ' · ' + esc(q.concept) : '') + '</div>';
    h += '<div class="lite-q-text">' + esc(q.question) + '</div>';

    var submitted = !!p.submitted[p.idx];
    h += '<div class="lite-q-meta"><span class="lite-howto">逐条判断：' +
      '<span class="num">1</span> = 正确 · <span class="num">2</span> = 错误</span>' +
      (submitted ? ' · Enter 下一题' : ' · Enter 提交') + '</div>';

    q.subQuestions.forEach(function (sq, si) {
      var ua = p.answers[p.idx] ? p.answers[p.idx][si] : undefined;
      var cls = 'lite-mtf';
      if (submitted) {
        cls += (ua === sq.answer) ? ' judge-ok' : ' judge-bad';
      }
      h += '<div class="' + cls + '" data-sub="' + si + '">';
      h += '<div class="lite-mtf-label">' + esc(sq.label || ('（' + (si + 1) + '）')) + '</div>';
      h += '<div class="lite-mtf-text">' + esc(sq.text) + '</div>';
      h += '<div class="lite-tf-row">';
      h += '<button class="lite-tf-btn" type="button" data-lite="answer" data-val="1" data-sub="' + si + '"' +
        (ua === true ? ' aria-pressed="true"' : '') + (submitted ? ' disabled' : '') + '>正确</button>';
      h += '<button class="lite-tf-btn" type="button" data-lite="answer" data-val="0" data-sub="' + si + '"' +
        (ua === false ? ' aria-pressed="true"' : '') + (submitted ? ' disabled' : '') + '>错误</button>';
      h += '</div>';
      if (submitted) {
        h += '<div class="lite-mtf-result">' +
          (ua === sq.answer ? '<span class="ok">判断正确</span>'
            : '<span class="bad">判断错误，正确答案为「' + (sq.answer ? '正确' : '错误') + '」</span>') +
          '</div>';
      }
      h += '</div>';
    });

    h += '<div class="lite-q-actions">';
    if (submitted) {
      var last = (p.idx + 1 >= total);
      h += '<button class="btn-primary" data-lite="' + (last ? 'finish' : 'next') + '" type="button">' +
        (last ? '完成练习' : '下一题') + '</button>';
      if (q.explanation) {
        h += '<button class="btn-quiet" data-lite="toggle-explain" type="button">解析</button>';
      }
      h += '<button class="btn-quiet" data-lite="quit" type="button">退出并保存</button>';
    } else {
      var answeredAll = q.subQuestions.every(function (_, si) {
        return p.answers[p.idx] && p.answers[p.idx][si] !== undefined;
      });
      h += '<button class="btn-primary" data-lite="submit" type="button"' +
        (answeredAll ? '' : ' disabled') + '>提交</button>';
      h += '<button class="btn-quiet" data-lite="quit" type="button">退出并保存</button>';
    }
    h += '</div>';

    if (submitted && q.explanation) {
      h += '<div class="lite-explain" id="liteExplain" hidden>' +
        esc(q.explanation).replace(/\n/g, '<br>') + '</div>';
    }

    $('#view-practice').innerHTML = h;
    setProgress((p.idx + (submitted ? 1 : 0)) / total, false);
  }

  function submitAnswer() {
    var p = S.practice;
    if (!p || p.submitted[p.idx]) return;
    var q = p.list[p.idx];
    // 提交保护：子题全部作答才可提交
    var answeredAll = q.subQuestions.every(function (_, si) {
      return p.answers[p.idx] && p.answers[p.idx][si] !== undefined;
    });
    if (!answeredAll) return;
    var allOk = true;
    q.subQuestions.forEach(function (sq, si) {
      var ua = p.answers[p.idx] ? p.answers[p.idx][si] : undefined;
      if (ua !== sq.answer) allOk = false;
    });
    p.submitted[p.idx] = true;
    if (allOk) p.correct++;
    // 错题入队（本地 + wrong_questions dual-write + 云端 review_cards），
    // module 字段沿用主站 practice 口径（存 subject，如「植物学」）；标本馆 relapse 出馆由 storage 统一处理
    if (typeof addWrongQuestion === 'function') {
      addWrongQuestion(q.bioId, q.subject || moduleOf(q), (q.question || '').slice(0, 200), q);
    }
    // 统一会话口径（record-session，与主站 practice 完全同参）：
    // 模块统计 / 难度自适应 / 云端复习卡 recordWrongAnswer / 打卡与成就
    if (window.BioQuestSession && typeof window.BioQuestSession.question === 'function') {
      try {
        window.BioQuestSession.question({
          module: 'practice',
          q: Object.assign({}, q, { id: q.bioId }),
          correct: allOk,
          checkin: true,
          achievements: [{ type: 'practice', value: 1 }]
        });
      } catch (e) { /* 静默：统计失败不影响答题 */ }
    }
    renderPractice();
    // 判对呼吸（B2）：只给答对的子项 120ms 一次，判错静态黑边
    var root = $('#view-practice');
    q.subQuestions.forEach(function (sq, si) {
      var ua = p.answers[p.idx] ? p.answers[p.idx][si] : undefined;
      var el = root.querySelector('.lite-mtf[data-sub="' + si + '"]');
      if (el && ua === sq.answer) {
        el.classList.add('breathe');
        setTimeout(function () { el.classList.remove('breathe'); }, 160);
      }
    });
  }

  function finishPractice() {
    var p = S.practice;
    if (!p) return;
    var dur = Math.round((Date.now() - p.startedAt) / 1000);
    // 只统计已作答（已提交）的题：中途退出/未提交的题不应算作答错计入正确率
    var items = p.list.map(function (q, qi) {
      if (!p.submitted[qi]) return null;
      var ok = q.subQuestions.every(function (sq, si) {
        return p.answers[qi] && p.answers[qi][si] === sq.answer;
      });
      var subs = q.subQuestions;
      var correctSubs = subs.filter(function (sq, si) {
        return p.answers[qi] && p.answers[qi][si] === sq.answer;
      }).length;
      return {
        questionId: q.bioId,
        q: Object.assign({}, q, { id: q.bioId }),
        question: (q.question || '').slice(0, 200),
        subject: q.subject || '', concept: q.concept || '',
        userAnswers: p.answers[qi] || {},
        correctSubs: correctSubs, totalSubs: subs.length,
        score: ok ? subs.length : 0, totalScore: subs.length,
        correct: ok
      };
    }).filter(Boolean);

    // 统一落盘（与 practice/exam/quiz 同一入口 BioQuestSession.finish）：
    // saveRecord + 云端 dual-write + bio 分重算。
    // stats:false —— 逐题 updateStats 已由 submitAnswer 的 question() 写入，防双计。
    if (items.length > 0 && window.BioQuestSession && typeof window.BioQuestSession.finish === 'function') {
      try {
        window.BioQuestSession.finish({
          module: 'practice', duration: dur, questions: items,
          stats: false, checkin: false
        });
      } catch (e) { _fallbackSaveRecord(items, dur); }
    } else if (items.length > 0) {
      _fallbackSaveRecord(items, dur);
    }
    p.finished = true;
    scheduleWeekPatch();
    renderPractice();
    setProgress(1, false);
  }

  /** record-session 未就绪时的兜底：仅写本地练习记录（保持今日统计口径） */
  function _fallbackSaveRecord(items, dur) {
    if (typeof saveRecord !== 'function') return;
    try {
      saveRecord({
        totalQuestions: items.length,
        correctCount: items.filter(function (it) { return it.correct; }).length,
        score: items.reduce(function (s, it) { return s + it.score; }, 0),
        totalScore: items.reduce(function (s, it) { return s + it.totalScore; }, 0),
        duration: dur, module: 'quiz',
        questions: items.map(function (it) {
          return {
            questionId: it.questionId, question: it.question,
            subject: it.subject, concept: it.concept,
            userAnswers: it.userAnswers, correct: it.correct,
            correctSubs: it.correctSubs, totalSubs: it.totalSubs
          };
        })
      });
    } catch (e) { /* 静默 */ }
  }

  function renderPracticeResult() {
    var p = S.practice;
    var root = $('#view-practice');
    if (!p) {
      if (root) root.classList.add('lite-view--fill');
      root.innerHTML =
        '<div class="lite-empty">还没有开始练习。<br><span class="lite-note">点击下方开始，按引擎推荐完成今日配额。</span></div>' +
        '<div class="center"><button class="btn-primary" data-lite="start" type="button">开始练习 →</button></div>';
      return;
    }
    if (root) root.classList.remove('lite-view--fill');
    var n = p.list.length, c = p.correct;
    var h = '<div class="lite-result">';
    h += '<div class="lite-result-num">' + c + ' / ' + n + '</div>';
    h += '<div class="lite-note mt-8">用时 ' + Math.max(1, Math.round((Date.now() - p.startedAt) / 1000)) + ' 秒</div>';
    h += '<div class="lite-note">' + (n - c > 0 ? '错的 ' + (n - c) + ' 题已加入错题队列' : '全部答对，队列没有增加') + '</div>';
    h += '<div class="lite-q-actions"><a class="btn-primary" href="#/today">回到今日</a>' +
      '<button class="btn-secondary" data-lite="start" type="button">再来一组</button></div>';
    h += '</div>';
    $('#view-practice').innerHTML = h;
  }

  /* ============================================================
   * 视图：复（FSRS 三档评分，J/K 键盘）
   * ============================================================ */
  function startReview() {
    var d = computeDue();
    S.dueList = d.due;
    S.review = { list: d.due.slice(), idx: 0, revealed: false, reviewed: d.reviewedToday };
  }

  function renderReview() {
    if (!S.review) startReview();
    var r = S.review;
    var root = $('#view-review');

    if (!r.list.length || r.idx >= r.list.length) {
      var st = todayTasks();
      root.classList.add('lite-view--fill');   // 单页空态纵向居中，消除下方空洞
      root.innerHTML = '<div class="lite-empty">' +
        (st[1].done ? '到期卡已清。' : '今日无到期复习。') +
        '<br><span class="lite-note">到期量由 FSRS 引擎实时计算，明天会按真实间隔回来。</span></div>' +
        '<div class="center"><a class="btn-secondary" href="#/today">回到今日</a></div>';
      setProgress(taskFraction(), false);
      return;
    }
    root.classList.remove('lite-view--fill');

    var item = r.list[r.idx];
    var h = '';
    h += '<div class="lite-q-meta"><span>' + esc(item.cat) + '</span>' +
      '<span class="lite-review-counter" id="revCounter">剩 ' + (r.list.length - r.idx) + ' · 今日已复 ' + r.reviewed + '</span></div>';
    h += '<div class="lite-card">';
    h += '<div class="lite-card-tag">' + esc(item.card.title || '') + '</div>';
    h += '<div class="lite-card-q">' + esc(item.card.question || '') + '</div>';
    if (r.revealed) {
      h += '<div class="lite-card-a">' + esc(item.card.answer || '') + '</div>';
    }
    h += '</div>';

    if (r.revealed) {
      h += '<div class="lite-rate-row">';
      h += '<button class="lite-rate-btn" data-lite="rate" data-rating="again" type="button">忘<span class="lite-rate-sub">1</span></button>';
      h += '<button class="lite-rate-btn" data-lite="rate" data-rating="hard" type="button">模糊<span class="lite-rate-sub">2</span></button>';
      h += '<button class="lite-rate-btn" data-lite="rate" data-rating="good" type="button">记得<span class="lite-rate-sub">3</span></button>';
      h += '</div>';
      h += '<div class="lite-note mt-12">间隔由 FSRS-4.5 按你的真实评分调度。</div>';
    } else {
      h += '<div class="lite-q-actions"><button class="btn-primary" data-lite="flip" type="button">翻面 <span class="num">J</span></button></div>';
    }

    root.innerHTML = h;
    setProgress(taskFraction(), false);
  }

  function rateCard(rating) {
    var r = S.review;
    if (!r || !r.revealed) return;
    var item = r.list[r.idx];
    if (!item) return;
    if (typeof window.FSRS === 'undefined' || !window.FSRS.schedule) return;

    var prog = loadDeckProgress();
    if (!prog[item.deckId]) prog[item.deckId] = { cards: {}, lastReview: Date.now() };
    if (!prog[item.deckId].cards) prog[item.deckId].cards = {};
    var cur = prog[item.deckId].cards[String(item.cardIdx)] || {
      stability: 0, difficulty: 5, lastReview: 0, repetitions: 0, lapses: 0, dueDate: 0
    };
    var map = { again: window.FSRS.RATING.AGAIN, hard: window.FSRS.RATING.HARD, good: window.FSRS.RATING.GOOD };
    var ns = window.FSRS.schedule({
      stability: cur.stability || 0, difficulty: cur.difficulty || 5,
      lastReview: cur.lastReview || 0, repetitions: cur.repetitions || 0, lapses: cur.lapses || 0
    }, map[rating] || window.FSRS.RATING.GOOD, Date.now());
    prog[item.deckId].cards[String(item.cardIdx)] = {
      stability: ns.stability, difficulty: ns.difficulty, interval: ns.interval,
      dueDate: ns.dueDate, lastReview: ns.lastReview,
      repetitions: ns.repetitions, lapses: ns.lapses, retrievability: ns.retrievability
    };
    prog[item.deckId].lastReview = Date.now();
    saveDeckProgress(prog);

    r.reviewed++;
    // "忘" → 队列末尾重学（与主站 cards.js 行为一致）
    if (rating === 'again') { r.list.push(item); }
    item.done = true;
    r.idx++;
    r.revealed = false;

    renderReview();
    var counter = $('#revCounter');
    if (counter) {
      counter.classList.add('tick');
      setTimeout(function () { counter.classList.remove('tick'); }, 160);
    }
    scheduleWeekPatch();
    if (computeDue().due.length === 0) {
      setProgress(taskFraction(), false);
    }
  }

  /* ============================================================
   * 视图：错（队列 + 标本馆，9.1）
   * ============================================================ */
  function renderWrong() {
    var root = $('#view-wrong');
    if (S.wrong.mode === 'museum') { renderMuseum(); return; }

    var list = wrongQueue();
    var h = '';
    h += '<div class="lite-date">' + esc(fmtDate(Date.now())) + '</div>';
    h += '<h1 class="lite-h1" id="h1-wrong">错题队列 · ' + list.length + '</h1>';

    if (list.length === 0) {
      var everHad = specimenList().length > 0;
      root.classList.add('lite-view--fill');
      h += '<div class="lite-empty">' +
        (everHad ? '队列已清空。<br><span class="lite-note">清空的队列都会存放到标本馆。</span>'
          : '队列还是空的。<br><span class="lite-note">答错的题会自动排到这里；掌握后压制成标本入馆。</span>') +
        '</div>';
    } else {
      root.classList.remove('lite-view--fill');
      list.forEach(function (w, i) {
        h += '<div class="lite-wrong-item" data-idx="' + i + '">';
        var metaBits = [];
        if (moduleLabel(w.module)) metaBits.push(moduleLabel(w.module));
        metaBits.push('错 ' + (w.wrongCount || 1) + ' 次');
        metaBits.push(fmtDate(w.timestamp || Date.now()));
        h += '<div class="lite-wrong-meta">' + esc(metaBits.join(' · ')) + '</div>';
        h += '<div class="lite-wrong-text">' + esc((w.questionText || '').slice(0, 220)) + '</div>';
        if (S.wrong.openIdx === i) {
          h += wrongRedoHtml(w, i);
        } else {
          h += '<div class="lite-wrong-actions">' +
            (w.fullQuestion && w.fullQuestion.subQuestions
              ? '<button class="btn-secondary" data-lite="redo" data-idx="' + i + '" type="button">重做一遍</button>' : '') +
            '<button class="btn-primary" data-lite="master" data-idx="' + i + '" type="button">标记已掌握</button>' +
            '</div>';
        }
        h += '</div>';
      });
    }
    h += '<div class="lite-q-actions mt-24">' +
      '<button class="btn-quiet" data-lite="museum" type="button">标本馆 →</button></div>';
    root.innerHTML = h;
    setProgress(taskFraction(), false);
  }

  function wrongRedoHtml(w, i) {
    var fq = w.fullQuestion;
    if (!fq || !fq.subQuestions) return '';
    var open = S.wrong.answer;
    var h = '';
    fq.subQuestions.forEach(function (sq, si) {
      var ua = open ? open[si] : undefined;
      var judged = open && open.__submitted;
      var cls = 'lite-mtf' + (judged ? (ua === sq.answer ? ' judge-ok' : ' judge-bad') : '');
      h += '<div class="' + cls + '">';
      h += '<div class="lite-mtf-label">' + esc(sq.label || ('（' + (si + 1) + '）')) + '</div>';
      h += '<div class="lite-mtf-text">' + esc(sq.text) + '</div>';
      h += '<div class="lite-tf-row">' +
        '<button class="lite-tf-btn" type="button" data-lite="wanswer" data-idx="' + i + '" data-sub="' + si + '" data-val="1"' +
        (ua === true ? ' aria-pressed="true"' : '') + (judged ? ' disabled' : '') + '>正确</button>' +
        '<button class="lite-tf-btn" type="button" data-lite="wanswer" data-idx="' + i + '" data-sub="' + si + '" data-val="0"' +
        (ua === false ? ' aria-pressed="true"' : '') + (judged ? ' disabled' : '') + '>错误</button>' +
        '</div>';
      if (judged) {
        h += '<div class="lite-mtf-result">' + (ua === sq.answer
          ? '<span class="ok">判断正确</span>'
          : '<span class="bad">仍需巩固，正确为「' + (sq.answer ? '正确' : '错误') + '」</span>') + '</div>';
      }
      h += '</div>';
    });
    if (open && open.__submitted) {
      var allOk = fq.subQuestions.every(function (sq, si) { return open[si] === sq.answer; });
      h += '<div class="lite-q-actions">' +
        (allOk ? '<button class="btn-primary" data-lite="master" data-idx="' + i + '" type="button">答对了，标记已掌握</button>' : '') +
        '<button class="btn-quiet" data-lite="close-redo" type="button">收起</button></div>';
    } else {
      h += '<div class="lite-q-actions">' +
        '<button class="btn-primary" data-lite="wsubmit" data-idx="' + i + '" type="button">提交</button>' +
        '<button class="btn-quiet" data-lite="close-redo" type="button">收起</button></div>';
    }
    return h;
  }

  function renderMuseum() {
    var list = specimenList();
    var ws = weekStart();
    var added = list.filter(function (s) { return (s.enteredAt || 0) >= ws; }).length;
    var h = '';
    h += '<div class="lite-date">' + esc(fmtDate(Date.now())) + '</div>';
    h += '<h1 class="lite-h1" id="h1-wrong">标本馆</h1>';
    h += '<div class="lite-specimen-head">馆藏 ' + list.length + ' 件 · 本周 +' + added + '</div>';

    if (list.length === 0) {
      $('#view-wrong').classList.add('lite-view--fill');
      h += '<div class="lite-empty">馆藏 0 件——清空的队列都会存放在这里。</div>';
    } else {
      $('#view-wrong').classList.remove('lite-view--fill');
      list.forEach(function (s) {
        h += '<div class="lite-specimen">';
        h += '<span class="sp-subject">' + esc(s.subject || moduleLabel(s.module) || '综合') + '</span>';
        h += '<span class="sp-id">' + esc(s.qId) + '</span>';
        h += '<span class="sp-date">采集 ' + esc(fmtDate(s.collectedAt || s.enteredAt)) + '</span>';
        h += '<span class="sp-date">入馆 ' + esc(fmtDate(s.enteredAt)) + '</span>';
        h += '<button class="sp-out" data-lite="spec-out" data-qid="' + esc(s.qId) + '" type="button">移出馆藏</button>';
        h += '</div>';
      });
    }
    h += '<div class="lite-q-actions mt-24">' +
      '<button class="btn-quiet" data-lite="queue" type="button">← 返回队列</button></div>';
    $('#view-wrong').innerHTML = h;
    setProgress(taskFraction(), false);
  }

  /* ============================================================
   * 视图：榜（周榜 + 三态匿名，设计方案 §5）
   * ============================================================ */
  function weekStats() {
    var ws = weekStart();
    var seen = Object.create(null), dayNew = Object.create(null), capped = 0;
    (typeof getRecords === 'function' ? getRecords() : []).forEach(function (r) {
      var ts = r.timestamp || 0;
      if (ts < ws) return;
      var day = r.date || todayStr(new Date(ts));
      (r.questions || []).forEach(function (q) {
        var id = q.questionId || q.id;
        if (!id || seen[day + '|' + id]) return;   // 跨天同题只在首次出现的那天计入
        seen[day + '|' + id] = 1;
        dayNew[day] = (dayNew[day] || 0) + 1;
      });
    });
    for (var d in dayNew) capped += Math.min(dayNew[d], 500);   // 单日 500 上限（超出不计）
    // 本周复习过的卡数（按卡去重，FSRS lastReview 真值）
    var prog = loadDeckProgress(), rev = 0;
    (S.decks || []).forEach(function (cat, di) {
      var dp = prog['deck_' + di] && prog['deck_' + di].cards || {};
      for (var k in dp) if (dp[k] && (dp[k].lastReview || 0) >= ws) rev++;
    });
    return { practice: capped, review: rev };
  }

  function myNickname() {
    try {
      var u = JSON.parse(localStorage.getItem('bioquest_user_info') || 'null');
      if (u && (u.display_name || u.username)) return u.display_name || u.username;
    } catch (e) {}
    if (window.getCurrentUser) {
      var c = window.getCurrentUser();
      if (c && (c.display_name || c.username)) return c.display_name || c.username;
    }
    return '我';
  }

  function sbHeaders() {
    return {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Accept': 'application/json',
      'Accept-Profile': 'public'
    };
  }

  /**
   * 写操作专用头：必须带当前用户的 access_token。
   * anon key 的 UPDATE 会被 RLS（auth.uid() = id）匹配 0 行并静默成功，
   * 导致 wk_ 与 leader_ 列永远写不进去 —— 所有 PATCH / RPC 一律走本函数。
   */
  async function userHeaders(extra) {
    var h = { 'apikey': SUPABASE_ANON_KEY, 'Accept': 'application/json' };
    try {
      var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
      var s = sb && sb.auth ? await sb.auth.getSession() : null;
      var t = s && s.data && s.data.session && s.data.session.access_token;
      h['Authorization'] = 'Bearer ' + (t || SUPABASE_ANON_KEY);
      h['_hasSession'] = !!t;
    } catch (e) { h['Authorization'] = 'Bearer ' + SUPABASE_ANON_KEY; }
    Object.assign(h, extra || {});
    return h;
  }

  /** 写回自己本周真值（登录态 + 用户 token；列缺失 400/404 → 降级本地模式） */
  async function patchWeek() {
    if (!S.loggedIn) return;
    var ws = weekStats();
    try {
      var u = window.getCurrentUser();
      if (!u || !u.id) return;
      var h = await userHeaders({
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      });
      if (!h._hasSession) return;   // 会话未恢复：不发注定被 RLS 拦的写请求
      var res = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(u.id), {
        method: 'PATCH',
        headers: h,
        body: JSON.stringify({ wk_key: weekKey(), wk_practice: ws.practice, wk_review: ws.review })
      });
      if (!res.ok && (res.status === 400 || res.status === 404)) S.board.localOnly = true;
      // 200 但 0 行（RLS 拦截/id 不符）不静默吞：榜侧用"是否在榜"如实呈现（见 paintBoard）
    } catch (e) { /* 离线静默：本地数据仍是真值 */ }
  }
  function scheduleWeekPatch() {
    clearTimeout(S._patchTimer);
    S._patchTimer = setTimeout(patchWeek, 2000);
  }

  async function fetchBoard() {
    var col = S.board.tab === 'practice' ? 'wk_practice' : 'wk_review';
    var seq = ++S.board.seq;            // 竞态保护：tab 快速切换时只认最后一次
    S.board.loading = true;
    if (S.view === 'board') paintBoard();
    // 自己的真值先上行（列缺失 → localOnly）
    await patchWeek();
    if (seq !== S.board.seq) return;    // 已被更新的请求取代
    var mine = weekStats()[S.board.tab === 'practice' ? 'practice' : 'review'];
    S.board.my = { value: mine, label: myNickname(), rank: null };

    // 退出榜 = 不被列出，但**仍可围观**（方案 5.3）——因此不在此处短路，照常拉榜
    if (S.board.localOnly) { S.board.rows = null; S.board.loading = false; if (S.view === 'board') paintBoard(); return; }

    try {
      var url = SUPABASE_URL + '/rest/v1/weekly_leaderboard?select=label,anon,is_me,wk_practice,wk_review' +
        '&order=' + col + '.desc.nullslast&limit=1000';
      var res = await fetch(url, { headers: sbHeaders() });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var rows = await res.json();
      if (seq !== S.board.seq) return;  // 过期响应丢弃
      rows = (rows || []).map(function (r) {
        return { label: r.label, anon: !!r.anon, isMe: !!r.is_me, value: r[col] || 0 };
      }).filter(function (r) { return r.value > 0; });
      rows.sort(function (a, b) { return b.value - a.value; });
      // 并列同名次
      var rank = 0, prev = null;
      rows.forEach(function (r, i) {
        if (prev !== null && r.value !== prev) rank = i + 1;
        else if (prev === null) rank = 1;
        r.rank = rank;
        prev = r.value;
      });
      S.board.rows = rows;
      S.board.localOnly = false;
      if (S.privacy === 'anon') {
        // 匿名代号由服务端 RPC 生成（不下发可反推的用户标识）；
        // 必须带用户 token（auth.uid()），失败则不渲染自己的行，避免昵称泄露
        S.board.myAnonLabelOk = false;
        try {
          var rr = await fetch(SUPABASE_URL + '/rest/v1/rpc/leader_my_label', {
            method: 'POST',
            headers: await userHeaders({ 'Content-Type': 'application/json' }),
            body: '{}'
          });
          if (rr.ok) {
            var jj = await rr.json();
            if (jj && jj.label) { S.board.my.label = jj.label; S.board.myAnonLabelOk = true; }
          }
        } catch (e) {}
      }
      // 我的名次 = 榜中数值严格大于我的行数 + 1（真实值，不依赖 label 匹配）
      var gt = rows.filter(function (r) { return r.value > (S.board.my ? S.board.my.value : 0); }).length;
      S.board.my.rank = gt + 1;
    } catch (e) {
      // 降级：migration 未上线 / 离线 → 本地模式（数字仍为真，不显示红错）
      if (seq !== S.board.seq) return;
      S.board.rows = null;
      S.board.localOnly = true;
      if (S.board.my) S.board.my.rank = 1;
    }
    if (seq !== S.board.seq) return;
    S.board.loading = false;
    if (S.view === 'board') paintBoard();
  }

  /**
   * 榜单展示窗口：前 3 名 +（未退出时）自己 ±5 名。
   * @param {boolean} skipMe 退出榜（out）时传 true：只展示前 3，自己不进窗口
   */
  function boardWindowRows(skipMe) {
    var rows = S.board.rows || [];
    var myIdx = -1;
    if (!skipMe && S.board.my && S.board.my.rank) {
      myIdx = rows.findIndex(function (r) { return r.rank === S.board.my.rank; });
    }
    var pick = {};
    rows.slice(0, 3).forEach(function (r, i) { pick[i] = true; });
    if (myIdx >= 0) {
      for (var i = Math.max(0, myIdx - 5); i <= Math.min(rows.length - 1, myIdx + 5); i++) pick[i] = true;
    }
    var out = [], gap = false;
    rows.forEach(function (r, i) {
      if (pick[i]) {
        if (gap) { out.push({ ellipsis: true }); gap = false; }
        out.push(r);
      } else { gap = true; }
    });
    return out;
  }

  function renderBoard() {
    var h = '';
    h += '<div class="lite-date">' + esc(fmtDate(Date.now())) + ' · 本周</div>';
    h += '<div class="lite-board-head"><h1 class="lite-h1 m0" id="h1-board">本周榜</h1>';
    h += '<div class="lite-board-switch" role="group" aria-label="榜单指标">' +
      '<button type="button" data-lite="tab" data-tab="practice" aria-pressed="' + (S.board.tab === 'practice') + '">练习量</button>' +
      '<button type="button" data-lite="tab" data-tab="review" aria-pressed="' + (S.board.tab === 'review') + '">复习量</button>' +
      '</div></div>';
    h += '<div id="lbBody"></div>';
    h += privacyHtml();
    $('#view-board').innerHTML = h;
    paintBoard();
  }

  /** 自己的展示名（匿名态必须等 RPC 成功，否则回退"我"，绝不露昵称） */
  function myPublicLabel() {
    if (!S.board.my) return '我';
    if (S.privacy === 'anon') return S.board.myAnonLabelOk ? S.board.my.label : '我';
    return S.board.my.label;
  }

  function paintBoard() {
    var body = $('#lbBody');
    if (!body) return;
    var unit = S.board.tab === 'practice' ? '题' : '张';
    var me = S.board.my;

    if (S.board.loading && S.board.rows === null) {
      body.innerHTML = '<div class="lite-skeleton w60"></div><div class="lite-skeleton w40"></div>';
      return;
    }

    var h = '';
    if (S.board.localOnly || !S.board.rows || S.board.rows.length === 0) {
      h += '<div class="lite-empty">本周还没有人上榜</div>';
      if (me) {
        h += '<div class="lite-specimen"><span class="sp-subject">' + esc(myPublicLabel()) + '</span>' +
          '<span class="sp-date">本周 ' + me.value + ' ' + unit + '</span>' +
          (S.privacy === 'out' ? '<span class="sp-date">（已退出榜单）</span>' : '') + '</div>';
      }
      // 「每周一重置 · 只显示你前后 5 名」由页脚常驻，此处不重复
      if (S.board.localOnly) {
        h += '<p class="lite-note center">云端榜单未连接，当前显示本机数据。</p>';
      }
      body.innerHTML = h;
      return;
    }

    // 退出榜（5.3）：榜照常显示他人（仍可围观），自己不进窗口
    var win = S.privacy === 'out' ? boardWindowRows(true) : boardWindowRows();
    h += '<table class="lite-lb-table"><caption>本周' +
      (S.board.tab === 'practice' ? '练习量榜' : '复习量榜') + ' · 前 3 名与你前后 5 名</caption>';
    h += '<thead><tr><th scope="col">名次</th><th scope="col">名称</th>' +
      '<th scope="col" class="ta-right">本周' + unit + '</th></tr></thead><tbody>';
    var meInWin = false;
    win.forEach(function (r) {
      if (r.ellipsis) { h += '<tr class="lb-ellipsis"><td colspan="3">…</td></tr>'; return; }
      // is_me 由服务端按 auth.uid() 判定（并列名次/昵称变化下仍精确），未登录恒 false
      var isMe = S.privacy !== 'out' && me && !!r.isMe;
      if (isMe) meInWin = true;
      h += '<tr' + (isMe ? ' class="lb-me" aria-current="true"' : '') + '>' +
        '<td class="lb-rank">#' + r.rank + '</td>' +
        '<td>' + esc(r.label) + '</td>' +
        '<td class="lb-score">' + r.value + '</td></tr>';
    });
    h += '</tbody></table>';

    // 表外补行：退出榜（标注） / 名次在窗口外（如 wk 未同步导致"未上榜"）
    if (me) {
      if (S.privacy === 'out') {
        h += '<div class="lite-specimen"><span class="sp-subject">' + esc(myPublicLabel()) + '</span>' +
          '<span class="sp-date">本周 ' + me.value + ' ' + unit + '</span>' +
          '<span class="sp-date">（已退出榜单，不参与排名）</span></div>';
      } else if (!meInWin) {
        h += '<div class="lite-specimen"><span class="sp-subject">' + esc(myPublicLabel()) + '</span>' +
          '<span class="sp-date">本周 ' + me.value + ' ' + unit + '</span>' +
          '<span class="sp-date">（未进入本周榜）</span></div>';
      }
    }
    body.innerHTML = h;
  }

  function privacyHtml() {
    var opts = [
      { v: 'public', t: '显示昵称', d: '默认' },
      { v: 'anon', t: '匿名参与', d: '同学 #XXXX' },
      { v: 'out', t: '退出榜单', d: '围观不参赛' }
    ];
    var h = '<div class="lite-privacy"><div class="lite-note">榜单设置</div>';
    h += '<div class="lite-privacy-opts" role="radiogroup" aria-label="榜单参与方式">';
    opts.forEach(function (o) {
      h += '<label class="lite-privacy-opt"><input type="radio" name="lbPriv" value="' + o.v + '"' +
        (S.privacy === o.v ? ' checked' : '') + ' data-lite="privacy">' +
        '<span>' + o.t + '</span><span class="opt-desc">' + o.d + '</span></label>';
    });
    h += '</div>';
    h += '<p class="lite-note mt-8">匿名代号每周更换，任何人（包括管理员）无法通过代号定位到你。' +
      (S.loggedIn ? '' : ' 登录后同步到榜单。') + '</p>';
    h += '</div>';
    return h;
  }

  async function setPrivacy(v) {
    S.privacy = v;
    try { localStorage.setItem(LS.privacy, v); } catch (e) {}
    if (S.loggedIn) {
      try {
        var u = window.getCurrentUser();
        if (u && u.id) {
          var h = await userHeaders({
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          });
          if (h._hasSession) {   // 用户 token 才能过 RLS（anon key 会 0 行静默失败）
            await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(u.id), {
              method: 'PATCH', headers: h,
              body: JSON.stringify({ leader_anon: v === 'anon', leader_optout: v === 'out' })
            });
          }
        }
      } catch (e) { /* 列未上线：本地偏好仍生效于下一次成功连接 */ }
    }
    S.board.myAnonLabelOk = false;
    await fetchBoard();
  }

  /* ============================================================
   * 登录（lite 入口）：复用 supabase-client 的 loginUser/logoutUser，
   * 不引入主站 auth-ui（其弹层/验证码依赖主站 DOM，与 lite 无交集）
   * ============================================================ */
  function localPrivacy() {
    try { return localStorage.getItem(LS.privacy) || 'public'; } catch (e) { return 'public'; }
  }

  /** 读自己的榜单隐私两位（云优先，失败回退本地偏好） */
  async function loadCloudPrivacy() {
    try {
      var u = window.getCurrentUser();
      if (u && u.id) {
        var pr = await fetch(SUPABASE_URL + '/rest/v1/profiles?select=leader_anon,leader_optout&id=eq.' + encodeURIComponent(u.id),
          { headers: sbHeaders() });
        if (pr.ok) {
          var pj = await pr.json();
          if (pj && pj[0]) {
            S.privacy = pj[0].leader_optout ? 'out' : (pj[0].leader_anon ? 'anon' : 'public');
            return;
          }
        } else if (pr.status === 400 || pr.status === 404) {
          S.board.localOnly = true;
        }
      }
    } catch (e) { /* 回退本地 */ }
    S.privacy = localPrivacy();
  }

  /** footer 账户行：状态文字 + 登录/登出按钮 + 入口偏好 */
  function paintAccount() {
    var acc = $('#liteAccount');
    if (!acc) return;
    var pref = '';
    try { pref = localStorage.getItem(LS.entryPref) || ''; } catch (e) {}
    acc.innerHTML = (S.loggedIn ? '已登录 · 数据与主站互通' : '未登录 · 本机存储') +
      ' · <button type="button" class="lite-auth-btn" data-lite="auth">' +
      (S.loggedIn ? '登出' : '登录') + '</button>' +
      ' · <label class="cursor-ptr"><input type="checkbox" id="liteEntryPref"' +
      (pref === 'lite' ? ' checked' : '') + '> 记住入口偏好</label>';
    var cb = $('#liteEntryPref');
    if (cb) cb.addEventListener('change', function () {
      try {
        if (cb.checked) localStorage.setItem(LS.entryPref, 'lite');
        else localStorage.removeItem(LS.entryPref);
      } catch (e) {}
    });
  }

  /** 登录/登出后的状态切换（footer、隐私偏好、榜单视图、周值上行） */
  async function afterAuthChange(loggedIn) {
    S.loggedIn = loggedIn;
    if (loggedIn) {
      await loadCloudPrivacy();
      toast('已登录 · 数据与主站互通');
      scheduleWeekPatch();
    } else {
      S.privacy = localPrivacy();
      S.board.my = null;
      S.board.rows = null;
      toast('已登出 · 本机存储');
    }
    paintAccount();
    if (S.view === 'board') { renderBoard(); fetchBoard(); }
  }

  /** 登录表单：错误提示 + 对应字段聚焦（aria-invalid 供读屏与样式共用） */
  function setLoginError(msg, field) {
    var errEl = $('#liteLoginErr');
    var uEl = $('#liteLoginUser');
    var pEl = $('#liteLoginPass');
    if (uEl) uEl.setAttribute('aria-invalid', field === 'username' ? 'true' : 'false');
    if (pEl) pEl.setAttribute('aria-invalid', field === 'password' ? 'true' : 'false');
    if (errEl) {
      if (msg) {
        errEl.textContent = msg;
        errEl.hidden = false;
      } else {
        errEl.textContent = '';
        errEl.hidden = true;
      }
    }
    if (msg && field) {
      var target = field === 'username' ? uEl : pEl;
      if (target) {
        try { target.focus(); } catch (e) { /* ignore */ }
      }
    }
  }

  /** 重置登录弹窗状态：错误、密码可见性；clearPwd 时清空密码（关闭即清） */
  function resetLoginState(clearPwd) {
    var pEl = $('#liteLoginPass');
    var eye = $('#liteLoginEye');
    setLoginError('');
    if (clearPwd && pEl) pEl.value = '';
    if (pEl) pEl.type = 'password';
    if (eye) {
      eye.textContent = '显示';
      eye.setAttribute('aria-pressed', 'false');
      eye.setAttribute('aria-label', '显示密码');
    }
  }

  var _loginBusy = false;

  /** 登录表单提交（dialog 内，CSP：无内联 handler） */
  function bindLoginForm() {
    var form = $('#liteLoginForm');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();   // method=dialog 会自动关窗，这里按成败接管
      if (_loginBusy) return;
      var btn = $('#liteLoginSubmit');
      var uEl = $('#liteLoginUser');
      var pEl = $('#liteLoginPass');
      var name = uEl ? uEl.value.trim() : '';
      var pwd = pEl ? pEl.value : '';
      setLoginError('');
      if (!name) { setLoginError('请输入用户名或邮箱', 'username'); return; }
      if (!pwd) { setLoginError('请输入密码', 'password'); return; }

      _loginBusy = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = '登录中…';
        btn.setAttribute('aria-busy', 'true');
      }
      if (uEl) uEl.disabled = true;
      if (pEl) pEl.disabled = true;

      var res = null;
      try { res = await window.loginUser(name, pwd); }
      catch (ex) { res = { ok: false, error: (ex && ex.message) || '登录失败，请稍后再试' }; }

      _loginBusy = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = '登录';
        btn.removeAttribute('aria-busy');
      }
      if (uEl) uEl.disabled = false;
      if (pEl) pEl.disabled = false;

      if (!res.ok) {
        var msg = res.error || '登录失败，请稍后再试';
        // 技术性错误转用户可执行文案（Supabase SDK/网络未就绪）
        if (/Supabase 未初始化|Failed to fetch|network|NetworkError/i.test(msg)) {
          msg = '登录服务暂不可用，请检查网络后重试';
        }
        // 仅当错误明确指向某个字段时才把焦点送回该字段
        var field = '';
        if (/密码/.test(msg)) field = 'password';
        else if (/用户名|邮箱/.test(msg)) field = 'username';
        setLoginError(msg, field);
        return;
      }
      var dlg = $('#liteLoginDlg');
      if (dlg && dlg.open) dlg.close();
      resetLoginState(true);
      await afterAuthChange(true);
    });

    // 原生 dialog：ESC / 取消 / 成功后关闭都走 close 事件，统一清理密码
    var dlg = $('#liteLoginDlg');
    if (dlg) {
      dlg.addEventListener('close', function () { resetLoginState(true); });
    }
  }

  /* ============================================================
   * 路由与渲染
   * ============================================================ */
  var VIEWS = ['today', 'practice', 'review', 'wrong', 'board'];

  function taskFraction() {
    var t = todayTasks();
    return t.filter(function (x) { return x.done; }).length / t.length;
  }

  function route() {
    var hash = (location.hash || '').replace(/^#\//, '');
    var v = VIEWS.indexOf(hash) >= 0 ? hash : 'today';
    S.view = v;
    VIEWS.forEach(function (k) {
      var el = $('#view-' + k);
      if (el) el.classList.toggle('active', k === v);
    });
    var links = document.querySelectorAll('#liteNav a');
    for (var i = 0; i < links.length; i++) {
      var isCur = links[i].getAttribute('data-view') === v;
      if (isCur) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    }
    if (v === 'today') renderToday();
    else if (v === 'practice') renderPractice();
    else if (v === 'review') renderReview();
    else if (v === 'wrong') renderWrong();
    else if (v === 'board') { renderBoard(); fetchBoard(); }
    document.title = ({ today: '今日', practice: '练', review: '复', wrong: '错', board: '榜' })[v] + ' · 极简版 TATABOX';
  }

  /* ============================================================
   * 事件（CSP：无内联 handler，全部委托）
   * ============================================================ */
  function onClick(e) {
    var t = e.target.closest('[data-lite]');
    if (!t) return;
    var act = t.getAttribute('data-lite');

    if (act === 'sample-start') {
      e.preventDefault();
      trySet(LS.sample, '1');
      location.hash = '#/practice';
      startPractice();
      renderPractice();
      return;
    }
    if (act === 'start') { startPractice(); renderPractice(); return; }

    if (act === 'auth') {
      if (!S.loggedIn) {
        var dlg = $('#liteLoginDlg');
        if (dlg) {
          resetLoginState(false);   // 打开时清错误/恢复密码可见性，但保留已输入用户名
          dlg.showModal();
          var uEl = $('#liteLoginUser');
          if (uEl && !uEl.value) uEl.focus();
          else { var pEl0 = $('#liteLoginPass'); if (pEl0) pEl0.focus(); }
        }
        return;
      }
      Promise.resolve(typeof window.logoutUser === 'function' ? window.logoutUser() : null)
        .then(function () { return afterAuthChange(false); })
        .catch(function () { return afterAuthChange(false); });
      return;
    }
    if (act === 'toggle-pwd') {
      var pEl = $('#liteLoginPass');
      var eye = $('#liteLoginEye');
      if (!pEl || !eye) return;
      var show = pEl.type === 'password';
      pEl.type = show ? 'text' : 'password';
      eye.textContent = show ? '隐藏' : '显示';
      eye.setAttribute('aria-pressed', show ? 'true' : 'false');
      eye.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      try { pEl.focus(); } catch (e) { /* ignore */ }
      return;
    }
    if (act === 'login-cancel') {
      var cdlg = $('#liteLoginDlg');
      if (cdlg && cdlg.open) cdlg.close();
      return;
    }

    if (act === 'answer') {
      var p = S.practice;
      if (!p || p.submitted[p.idx]) return;
      var sub = t.getAttribute('data-sub'), val = t.getAttribute('data-val') === '1';
      (p.answers[p.idx] = p.answers[p.idx] || {})[sub] = val;
      renderPractice();
      return;
    }
    if (act === 'submit') { submitAnswer(); return; }
    if (act === 'next') { S.practice.idx++; renderPractice(); return; }
    if (act === 'finish') { finishPractice(); return; }
    if (act === 'quit') {
      if (S.practice && !S.practice.finished && S.practice.idx > 0) finishPractice();
      S.practice = null;
      location.hash = '#/today';
      return;
    }
    if (act === 'toggle-explain') {
      var ex = $('#liteExplain');
      if (ex) ex.hidden = !ex.hidden;
      return;
    }

    if (act === 'flip') { S.review.revealed = true; renderReview(); return; }
    if (act === 'rate') { rateCard(t.getAttribute('data-rating')); return; }

    if (act === 'redo') {
      S.wrong.openIdx = parseInt(t.getAttribute('data-idx'), 10);
      S.wrong.answer = null;
      renderWrong();
      return;
    }
    if (act === 'close-redo') { S.wrong.openIdx = -1; S.wrong.answer = null; renderWrong(); return; }
    if (act === 'wanswer') {
      var wi = parseInt(t.getAttribute('data-idx'), 10);
      if (!S.wrong.answer || S.wrong.answer.__submitted) S.wrong.answer = {};
      S.wrong.answer[t.getAttribute('data-sub')] = t.getAttribute('data-val') === '1';
      renderWrong();
      return;
    }
    if (act === 'wsubmit') {
      if (S.wrong.answer) S.wrong.answer.__submitted = true;
      renderWrong();
      return;
    }
    if (act === 'master') {
      var idx = parseInt(t.getAttribute('data-idx'), 10);
      var wq = wrongQueue();
      var w = wq[idx];
      if (w && typeof specAddSpecimen === 'function') {
        // 引擎单点入馆（9.1）：同时移出队列
        specAddSpecimen({
          qId: w.qId, subject: (w.fullQuestion && w.fullQuestion.subject) || '',
          module: w.module, text: w.questionText, collectedAt: w.timestamp
        });
        S.wrong.openIdx = -1; S.wrong.answer = null;
        // 240ms 滑入归档（进度反馈，非庆祝）
        var el = t.closest('.lite-wrong-item');
        if (el) {
          el.style.transition = 'opacity var(--dur-slow) var(--ease), transform var(--dur-slow) var(--ease)';
          el.style.opacity = '0';
          el.style.transform = 'translateY(-6px)';
          setTimeout(function () { renderWrong(); }, 240);
        } else renderWrong();
      }
      return;
    }
    if (act === 'museum') { S.wrong.mode = 'museum'; renderWrong(); return; }
    if (act === 'queue') { S.wrong.mode = 'queue'; renderWrong(); return; }
    if (act === 'spec-out') {
      var qid = t.getAttribute('data-qid');
      var sp = specimenList().filter(function (s) { return s.qId === qid; })[0];
      if (sp && typeof specRemoveSpecimen === 'function' && typeof addWrongQuestion === 'function') {
        specRemoveSpecimen(qid);
        // 移出馆藏 → 重新进入错题队列（重练）
        addWrongQuestion(qid, sp.module || 'general', sp.text || '', null);
      }
      renderWrong();
      return;
    }

    if (act === 'tab') {
      S.board.tab = t.getAttribute('data-tab');
      renderBoard();
      fetchBoard();
      return;
    }
  }

  function onChange(e) {
    var t = e.target;
    if (t && t.matches && t.matches('input[name="lbPriv"]')) setPrivacy(t.value);
  }

  function onKey(e) {
    if (/input|textarea/i.test((e.target.tagName || ''))) return;
    var k = e.key;
    if (k === 'Escape') {
      // 登录弹窗打开时交给 dialog 原生 Esc 关闭，不叠加视图级退出
      if (document.querySelector('dialog[open]')) return;
      if (S.view === 'practice' && S.practice && !S.practice.finished) {
        if (S.practice.idx > 0) finishPractice();
        S.practice = null;
        location.hash = '#/today';
      } else if (S.view === 'review') location.hash = '#/today';
      return;
    }
    if (S.view === 'practice' && S.practice && !S.practice.finished) {
      var p = S.practice, q = p.list[p.idx], submitted = !!p.submitted[p.idx];
      if (!submitted) {
        if (k === '1' || k === '2') {
          var val = (k === '1');
          if (!p.answers[p.idx]) p.answers[p.idx] = {};
          // 逐条作答：填入第一个尚未作答的子题
          for (var si = 0; si < q.subQuestions.length; si++) {
            if (p.answers[p.idx][si] === undefined) { p.answers[p.idx][si] = val; break; }
          }
          renderPractice();
        } else if (k === 'Enter') { submitAnswer(); }
      } else if (k === 'Enter') {
        if (p.idx + 1 >= p.list.length) finishPractice();
        else { p.idx++; renderPractice(); }
      }
      return;
    }
    if (S.view === 'review') {
      var r = S.review;
      if (!r || r.idx >= r.list.length) return;
      if (k === 'j' || k === 'J' || k === ' ') {
        e.preventDefault();
        if (!r.revealed) { r.revealed = true; renderReview(); }
      } else if (r.revealed && (k === '1' || k === '2' || k === '3')) {
        rateCard({ 1: 'again', 2: 'hard', 3: 'good' }[k]);
      } else if (k === 'k' || k === 'K') {
        if (!r.revealed) { r.revealed = true; renderReview(); }
      }
    }
  }

  /* ============================================================
   * 启动
   * ============================================================ */
  async function boot() {
    // 首次从主站跳入的互通提示（lite 唯一主动提示，5s 自愈）
    try {
      if (document.referrer && document.referrer.indexOf(location.origin) === 0 &&
          !sessionStorage.getItem(LS.touched)) {
        sessionStorage.setItem(LS.touched, '1');
        setTimeout(function () { toast('进度与主站实时互通'); }, 600);
      }
    } catch (e) {}

    // 主题按钮初值
    var themeBtn = $('#liteThemeBtn');
    if (themeBtn) {
      paintThemeBtn();
      themeBtn.addEventListener('click', cycleTheme);
    }

    // 数据与云端会话（不阻塞首屏渲染）
    try {
      var cr = await fetch('data/cards.json');
      var cj = await cr.json();
      S.decks = cj['分类'] || [];
    } catch (e) { S.decks = []; }

    // 恢复登录会话（登录态决定榜单三态与周值上行）
    try {
      if (typeof window.restoreSession === 'function') {
        S.loggedIn = !!(await window.restoreSession());
      }
    } catch (e) { S.loggedIn = false; }
    if (S.loggedIn) await loadCloudPrivacy();
    else S.privacy = localPrivacy();

    // footer 账户行（登录/登出入口 + 入口偏好，5.3 默认关）+ 登录表单
    paintAccount();
    bindLoginForm();

    // 事件委托（CSP 无内联 handler）
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', route);
    // 跨标签实时（主站练习/复习 → lite 同步刷新；storage 事件为浏览器级广播）
    window.addEventListener('storage', function (e) {
      if (!e.key) return;
      if (e.key.indexOf('bioquest_') === 0) {
        if (S.view === 'today') renderToday();
        else if (S.view === 'wrong') renderWrong();
        else if (S.view === 'board') fetchBoard();
        else if (S.view === 'review') { /* 会话进行中不打断 */ }
      }
    });

    // 首屏
    if (!location.hash) location.replace('#/today');
    route();
    // 预热题库（练视图进入前）
    ensureBank();
    // 首次登录态下预热周值（真值上行）
    if (S.loggedIn) scheduleWeekPatch();

    var boot = $('#lite-boot');
    if (boot) { boot.classList.add('gone'); setTimeout(function () { boot.remove(); }, 350); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
