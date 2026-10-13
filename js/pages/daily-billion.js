/**
 * 每日亿题 — 随机刷题 · TikTok风格
 * v6: 专属题库重构（100 道判断题 + 300 道基础单选题，纯文字）——
 *     云端按 daily-league 标签过滤，本地按主题分片异步加载
 *     单选题结构：{type:'single', options:[...4项], answer:'A'~'D', explanation}
 */
(function() {
  'use strict';

  var SUPABASE_URL = 'https://qxehkfucvmxuojjkdaqy.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZWhrZnVjdm14dW9qamtkYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjU2ODUsImV4cCI6MjEwMjIwMTY4NX0.lbiJxhFvy0t_J4qSeoP6K0r53M4KaEDSKkRlZu03ze8';

  // 每日亿题专属题库 v3（2026 联赛送分池）
  // 100 道纯文字判断题（MTF）+ 300 道基础知识点单选题（single）：
  //   - 题干简洁、纯文字、无图
  //   - 难度对齐联赛「送分题 / 简单想一想就出来」区间，只考基础知识点
  //   - 判断题解析逐项说明对错依据；单选题解析说明正确选项依据 + 其余选项错因
  // 通用上传脚本会把这 6 个分片带 daily-league 标签写入 questions 表，
  // 云端查询按该标签过滤；本地直接读取分片文件（与云端内容同源）。
  var LOCAL_BANK_FILES = [
    'data/bank/daily_league_cellbio.json',            // 细胞生物学（判断12 + 单选50）
    'data/bank/daily_league_biochem_microbe.json',    // 生物化学+微生物学（判断13 + 单选50）
    'data/bank/daily_league_plant.json',              // 植物解剖与生理（判断15 + 单选50）
    'data/bank/daily_league_animal.json',             // 动物解剖与生理（判断15 + 单选50）
    'data/bank/daily_league_behavior_ecology.json',   // 动物行为+生态学（判断20 + 单选50）
    'data/bank/daily_league_genetics_evolution.json'  // 遗传+进化+系统学（判断25 + 单选50）
  ];

  var _localBankPromise = null;
  var _supabaseRetryCount = 0;
  var _supabaseMaxRetries = 3;

  var state = {
    questions: [],
    loadedIds: {},           // 已加载的题目ID集合，防重复
    totalAnswered: 0,
    totalCorrect: 0,
    totalSubQuestions: 0,
    isLoading: false,
    hasMore: true,
    totalPoolSize: 0,        // Supabase中MTF题目总数
    answeredMap: {},
    submittedMap: {},
    favorites: {},           // 收藏 {questionId: true}
    feedback: {},            // 反馈 {questionId: 'like'|'dislike'}
    error: null,
    usingLocalQuestions: false,
    // 刷太快检测
    lastSubmitTime: 0,
    speedWarnCount: 0
  };

  var targetEl = null;
  var wrapperEl = null;
  var pageEl = null;
  var topBarEl = null;
  var scrollObserver = null;
  var _destroyed = false;
  var _sbClient = null;
  var _touchStartY = 0;
  var _touchStartTime = 0;
  var _progressTimer = null;
  var _progressStart = 0;
  var _toastTimer = null;

  var escapeHtml = window.escapeHtml;

  function waitForSupabaseSDK(timeoutMs) {
    return new Promise(function(resolve) {
      var start = Date.now();
      function check() {
        if (typeof window.supabase !== 'undefined' || typeof getSupabase === 'function') {
          resolve(true);
        } else if (Date.now() - start >= timeoutMs) {
          resolve(false);
        } else {
          setTimeout(check, 100);
        }
      }
      check();
    });
  }

  function getSupabaseClient() {
    if (_sbClient) return _sbClient;
    if (typeof getSupabase === 'function' && typeof window.supabase !== 'undefined') {
      try { _sbClient = getSupabase(); return _sbClient; } catch(e) {}
    }
    if (typeof window.supabase !== 'undefined') {
      try {
        _sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
        });
        return _sbClient;
      } catch(e) {}
    }
    return null;
  }

  // 判断题/单选题统一判定 —— 题型归一唯一实现在 js/core/question-model.js
  function isSingleQ(q) { return QuestionModel.isChoiceQuestion(q); }

  // 异步加载并合并本地专属题库（6 个主题分片 + 超长讲义过滤），带缓存
  // 同时兼容两种题型：mtf 判断题（subQuestions）与 single 单选题（options + answer）
  function loadLocalBank() {
    if (!_localBankPromise) {
      _localBankPromise = Promise.all(LOCAL_BANK_FILES.map(function(file) {
        return fetch(file, { cache: 'no-cache' })
          .then(function(resp) { return resp.ok ? resp.json() : null; })
          .catch(function() { return null; });
      })).then(function(files) {
        var pool = [];
        files.forEach(function(f) {
          if (!f) return;
          Object.keys(f).forEach(function(id) {
            var q = f[id];
            if (!q) return;
            // 单选题：4 个选项 + 单一答案（'A'~'D' 或数字下标）
            if (QuestionModel.isSingle(q) && Array.isArray(q.options) && q.options.length >= 2 && q.answer !== undefined && q.answer !== null && q.answer !== '') {
              pool.push({
                id: id,
                type: 'single',
                question: q.question || '',
                subject: q.subject || '',
                explanation: q.explanation || '',
                options: q.options.map(function(t) { return String(t); }),
                answer: (typeof q.answer === 'number') ? String.fromCharCode(65 + q.answer) : String(q.answer).trim().toUpperCase()
              });
              return;
            }
            // 判断题（MTF）
            if (!Array.isArray(q.subQuestions)) return;
            pool.push({
              id: id,
              question: q.question || '',
              subject: q.subject || '',
              explanation: q.explanation || '',
              subQuestions: q.subQuestions.map(function(sq) {
                return { label: sq.label, text: sq.text, answer: Boolean(sq.answer) };
              })
            });
          });
        });
        // 本地题库也经过"超长知识讲义型"过滤
        var filterFn = (typeof window.filterQuestionList === 'function') ? window.filterQuestionList : function(x){return x;};
        return filterFn(pool);
      });
    }
    return _localBankPromise;
  }

  function getLocalQuestions() {
    return loadLocalBank();
  }

  async function loadQuestionsFromLocal(limit) {
    var pool = await getLocalQuestions();
    var shuffled = pool.slice().sort(function() { return Math.random() - 0.5; });
    var result = [];
    var seen = state.loadedIds;
    for (var i = 0; i < shuffled.length && result.length < limit; i++) {
      if (!seen[shuffled[i].id]) {
        result.push(shuffled[i]);
      }
    }
    if (result.length < limit) {
      state.loadedIds = {};
      seen = state.loadedIds;
      for (var j = 0; j < shuffled.length && result.length < limit; j++) {
        if (!seen[shuffled[j].id]) {
          result.push(shuffled[j]);
        }
      }
    }
    state.totalPoolSize = pool.length;
    state.usingLocalQuestions = true;
    return result;
  }

  // 云题库查询统一包裹"超时保护"：Supabase 位于韩国，弱网/跨国链路下单请求
  // 可能长时间无响应（表现为进入路由后迟迟不出题、用户等待中切走路由时
  // 在途请求被取消产生 net::ERR_ABORTED）。超时后按失败处理，立即回退本地题库。
  var REQUEST_TIMEOUT_MS = 8000;
  function _withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        clearTimeout(timer);
        reject(Object.assign(new Error('云题库请求超时'), { code: 'REQUEST_TIMEOUT' }));
      }, ms);
      promise.then(
        function (v) { clearTimeout(timer); resolve(v); },
        function (e) { clearTimeout(timer); reject(e); }
      );
    });
  }

  async function loadQuestionsFromSupabase(limit) {
    var sb = getSupabaseClient();
    if (!sb) return null;

    try {
      // 首次获取总数
      if (state.totalPoolSize === 0) {
        var countResult = await _withTimeout(sb.from('daily_questions').select('id', { count: 'exact', head: true }).eq('type', 'mtf').contains('tags', ['daily-league']), REQUEST_TIMEOUT_MS);
        if (!countResult.error && countResult.count !== null) {
          state.totalPoolSize = countResult.count;
        }
      }

      // 如果已加载完所有题目，从头循环
      if (Object.keys(state.loadedIds).length >= state.totalPoolSize && state.totalPoolSize > 0) {
        state.loadedIds = {};
        state.hasMore = true;
      }

      // 随机偏移
      var poolSize = state.totalPoolSize > 0 ? state.totalPoolSize : 100;
      var maxOffset = Math.max(0, poolSize - limit);
      var randomOffset = Math.floor(Math.random() * maxOffset);

      var result = await _withTimeout(sb.from('daily_questions')
        .select('id,question,sub_questions,explanation,subject')
        .eq('type', 'mtf')
        .contains('tags', ['daily-league'])
        .range(randomOffset, randomOffset + limit - 1), REQUEST_TIMEOUT_MS);

      if (result.error) {
        console.warn('[每日亿题] Supabase查询失败:', result.error.message);
        return null;
      }

      if (!result.data || result.data.length === 0) return [];

      // 过滤已加载的ID
      var freshQuestions = result.data.filter(function(q) { return !state.loadedIds[q.id]; });

      // 如果过滤后不够，再随机拉一批
      if (freshQuestions.length < limit && state.totalPoolSize > limit) {
        var retryOffset = Math.floor(Math.random() * Math.max(0, poolSize - limit));
        var retryResult = await _withTimeout(sb.from('daily_questions')
          .select('id,question,sub_questions,explanation,subject')
          .eq('type', 'mtf')
          .contains('tags', ['daily-league'])
          .range(retryOffset, retryOffset + limit - 1), REQUEST_TIMEOUT_MS);
        if (retryResult.data) {
          var more = retryResult.data.filter(function(q) { return !state.loadedIds[q.id]; });
          var seen = {};
          freshQuestions.forEach(function(q) { seen[q.id] = true; });
          more.forEach(function(q) {
            if (!seen[q.id]) { seen[q.id] = true; freshQuestions.push(q); }
          });
        }
      }

      return freshQuestions.map(function(q) {
        var subQuestions = [];
        try {
          var raw = q.sub_questions;
          if (typeof raw === 'string') raw = JSON.parse(raw);
          if (Array.isArray(raw)) {
            // 选项排列修复：数据库存储顺序不保证（可能 B/A/D/C），统一按 label 排序展示
            raw = raw.slice().sort(function (a, b) {
              return String(a.label || '').localeCompare(String(b.label || ''), 'en', { numeric: true });
            });
            subQuestions = raw.map(function(sq, i) {
              return { label: sq.label || String.fromCharCode(65 + i), text: sq.text || '', answer: Boolean(sq.answer) };
            });
          }
        } catch(e) {}
        return { id: q.id, question: q.question || '', subQuestions: subQuestions, explanation: q.explanation || '', subject: q.subject || '' };
      }).filter(function (q) {
        // Supabase 远程题库超长讲义过滤：null 会被后面的 filterQuestionList 剔除
        var fn = typeof window.filterLectureStyleQuestion === 'function' ? window.filterLectureStyleQuestion : null;
        if (!fn) return true;
        var cleaned = fn(q);
        if (cleaned) { Object.assign(q, cleaned); return true; }
        return false;
      });
    } catch(e) {
      console.warn('[每日亿题] Supabase请求异常:', e.message);
      return null;
    }
  }

  async function loadQuestions(limit) {
    if (state.isLoading) return;
    state.isLoading = true;
    state.error = null;

    startProgressBar();

    var newQuestions = null;

    // 本地分片优先（含判断题 + 单选题，与云端 mtf 内容同源）；
    // 本地分片全部失败时才回退云端（云端只有 mtf，且弱网下有 8s 超时）。
    newQuestions = await loadQuestionsFromLocal(limit);

    if (!newQuestions || newQuestions.length === 0) {
      console.log('[每日亿题] 本地分片不可用，尝试云端题库');
      if (!getSupabaseClient() && _supabaseRetryCount < _supabaseMaxRetries) {
        _supabaseRetryCount++;
        await waitForSupabaseSDK(5000);
      }
      newQuestions = await loadQuestionsFromSupabase(limit);
      if (newQuestions && newQuestions.length > 0 && state.questions.length === 0) {
        showToast('已切换到云端题库模式');
      }
    }

    if (!newQuestions || newQuestions.length === 0) {
      if (state.questions.length === 0) {
        state.error = '题库加载失败，请稍后重试';
      } else {
        state.error = '网络连接失败，无法加载更多题目';
      }
      state.isLoading = false;
      finishProgressBar();
      return;
    }

    newQuestions.forEach(function(q) { state.loadedIds[q.id] = true; });
    state.questions = state.questions.concat(newQuestions);
    state.isLoading = false;
    finishProgressBar();
  }

  function startProgressBar() {
    _progressStart = Date.now();
    var bar = wrapperEl && wrapperEl.querySelector('#dbProgressBar');
    if (bar) {
      bar.style.width = '0%';
      bar.style.opacity = '1';
      bar.style.transition = 'none';
    }
    if (_progressTimer) clearInterval(_progressTimer);
    _progressTimer = setInterval(function() {
      var bar2 = wrapperEl && wrapperEl.querySelector('#dbProgressBar');
      if (!bar2) { clearInterval(_progressTimer); _progressTimer = null; return; }
      var elapsed = Date.now() - _progressStart;
      var pct = Math.min(90, elapsed < 2000 ? (elapsed / 2000) * 60 : 60 + (elapsed - 2000) / 8000 * 30);
      bar2.style.transition = 'width 0.3s ease-out';
      bar2.style.width = pct + '%';
    }, 300);
  }

  function finishProgressBar() {
    if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null; }
    var bar = wrapperEl && wrapperEl.querySelector('#dbProgressBar');
    if (bar) {
      bar.style.transition = 'width 0.2s ease-out, opacity 0.3s ease-out';
      bar.style.width = '100%';
      setTimeout(function() {
        if (bar) { bar.style.opacity = '0'; bar.style.width = '0%'; }
      }, 250);
    }
  }

  function showToast(msg) {
    if (_toastTimer) clearTimeout(_toastTimer);
    if (!wrapperEl) return;
    var existing = wrapperEl.querySelector('#dbToast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'dbToast';
    toast.className = 'db-toast';
    toast.textContent = msg;
    wrapperEl.appendChild(toast);
    requestAnimationFrame(function() { toast.classList.add('show'); });
    _toastTimer = setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { if (toast.parentNode) toast.remove(); }, 300);
    }, 2000);
  }

  function checkSpeedWarn() {
    var now = Date.now();
    if (state.lastSubmitTime > 0) {
      var elapsed = now - state.lastSubmitTime;
      if (elapsed < 3000) {
        state.speedWarnCount++;
        if (state.speedWarnCount === 1) {
          showToast('慢一点，想想再答');
        } else if (state.speedWarnCount === 2) {
          showToast('刷太快了，仔细审题');
        } else if (state.speedWarnCount >= 3) {
          showToast('每题至少花3秒思考，质量比数量重要');
        }
      } else if (elapsed > 10000) {
        state.speedWarnCount = Math.max(0, state.speedWarnCount - 1);
      }
    }
    state.lastSubmitTime = now;
  }

  function renderTopBar() {
    if (!wrapperEl || _destroyed) return;
    var html = '';
    html += '<div class="db-progress-wrap"><div class="db-progress-bar" id="dbProgressBar"></div></div>';
    html += '<div class="db-top-bar" id="dbTopBar">';
    html += '<div class="db-top-bar-left">';
    html += '<a class="db-back-btn" href="#/" data-on=\'["_dbExitFlow"]\' data-prevent-default title="返回（先看成绩单）">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    html += '</a>';
    html += '<span class="db-top-bar-title">每日亿题</span>';
    html += '</div>';
    html += '<div class="db-top-bar-right">';
    html += '<button class="db-stop-btn" data-action="db-stop" title="结束本次刷题，统一查看得分与解析">结束并判卷</button>';
    html += '<div class="db-counter-badge" id="dbCounterBadge">';
    html += '<span>已刷</span><span class="db-counter-num" id="dbCounterNum">' + state.totalAnswered + '</span><span>题</span>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    var existing = wrapperEl.querySelector('#dbTopBar');
    if (existing) existing.remove();
    var existingProgress = wrapperEl.querySelector('.db-progress-wrap');
    if (existingProgress) existingProgress.remove();
    wrapperEl.insertAdjacentHTML('afterbegin', html);
    topBarEl = wrapperEl.querySelector('#dbTopBar');
  }

  function renderActionBar(q) {
    var fid = 'fav-' + q.id;
    var isFav = state.favorites[q.id];
    var fb = state.feedback[q.id];
    var html = '';
    html += '<div class="db-action-bar">';
    // 收藏
    html += '<button class="db-action-btn db-fav-btn' + (isFav ? ' active' : '') + '" data-action="fav" data-qid="' + escapeHtml(q.id) + '" title="收藏">';
    html += '<svg viewBox="0 0 24 24" fill="' + (isFav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    html += '</button>';
    // 赞
    html += '<button class="db-action-btn db-like-btn' + (fb === 'like' ? ' active' : '') + '" data-action="like" data-qid="' + escapeHtml(q.id) + '" title="赞">';
    html += '<svg viewBox="0 0 24 24" fill="' + (fb === 'like' ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg>';
    html += '</button>';
    // 踩
    html += '<button class="db-action-btn db-dislike-btn' + (fb === 'dislike' ? ' active' : '') + '" data-action="dislike" data-qid="' + escapeHtml(q.id) + '" title="踩">';
    html += '<svg viewBox="0 0 24 24" fill="' + (fb === 'dislike' ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/></svg>';
    html += '</button>';
    // 分享
    html += '<button class="db-action-btn db-share-btn" data-action="share" data-qid="' + escapeHtml(q.id) + '" title="分享">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
    html += '</button>';
    html += '</div>';
    return html;
  }

  // 统一判卷模式：作答阶段只保留"选择 + 完成本题"，不显示任何对错/得分/解析，
  // 全部判卷在点击「结束/返回」时由成绩单面板统一完成。
  function renderQuestionCard(q, index) {
    var submitted = state.submittedMap[q.id];
    var answers = state.answeredMap[q.id] || {};
    var single = isSingleQ(q);
    // 脏数据防御：无选项/无子题的题目不允许提交（已答判定统一走内核）
    var allAnswered = QuestionModel.isAllAnswered(q, answers);

    var html = '';
    html += '<div class="db-card" data-question-id="' + escapeHtml(q.id) + '" data-index="' + index + '">';
    html += '<div class="db-card-inner">';

    html += '<div class="db-card-header">';
    html += '<span class="db-card-num">' + (index + 1) + '</span>';
    if (q.subject) html += '<span class="db-card-subject">' + escapeHtml(q.subject) + '</span>';
    // 题型标签（判断/单选）
    html += '<span class="db-card-type">' + (single ? '单选' : '判断') + '</span>';
    // 题目ID（紧贴标签，供管理员后台按ID调题）
    html += '<span class="db-card-qid" title="题目ID（管理员可据此调出本题）">#' + escapeHtml(String(q.id)) + '</span>';
    if (submitted) html += '<span class="db-done-chip" title="已完成本题，结束时统一判卷">已作答 ✓</span>';
    html += '</div>';

    html += '<div class="db-question-text">' + escapeHtml(q.question) + '</div>';
    if (typeof window !== 'undefined' && window.BioQuestFigure) {
      html += window.BioQuestFigure.render(q, { alt: '题目配图' });
    }

    if (single) {
      // 单选题：A~D 选项按钮，单选互斥
      html += '<div class="db-opt-list">';
      for (var o = 0; o < q.options.length; o++) {
        var optLabel = String.fromCharCode(65 + o);
        var optSelected = answers[0] === optLabel;
        html += '<button class="db-opt-btn' + (optSelected ? ' selected' : '') + '" data-value="' + optLabel + '" data-sub-idx="0"' + (submitted ? ' disabled' : '') + '>';
        html += '<span class="db-opt-label">' + optLabel + '</span>';
        html += '<span class="db-opt-text">' + escapeHtml(q.options[o]) + '</span>';
        html += '</button>';
      }
      html += '</div>';
    } else {
      html += '<div class="db-sub-list">';
      for (var i = 0; i < q.subQuestions.length; i++) {
        var sq = q.subQuestions[i];
        var userAnswer = answers[i];
        var itemCls = 'db-sub-item' + (submitted ? ' submitted' : '');
        html += '<div class="' + itemCls + '" data-sub-idx="' + i + '">';
        html += '<div class="db-sub-head">';
        html += '<span class="db-sub-label">' + escapeHtml(sq.label) + '</span>';
        html += '<span class="db-sub-text">' + escapeHtml(sq.text) + '</span>';
        html += '</div>';
        html += '<div class="db-sub-toggle">';
        html += '<button class="db-tf-btn' + (userAnswer === true ? ' selected' : '') + '" data-value="true" data-sub-idx="' + i + '"' + (submitted ? ' disabled' : '') + '>正确</button>';
        html += '<button class="db-tf-btn' + (userAnswer === false ? ' selected' : '') + '" data-value="false" data-sub-idx="' + i + '"' + (submitted ? ' disabled' : '') + '>错误</button>';
        html += '</div></div>';
      }
      html += '</div>';
    }

    // 作答阶段提示：明确告知"结束时统一判卷"，避免用户误以为没有记录答案
    if (submitted) {
      html += '<div class="db-done-hint">本题已作答 ✓ 上滑继续刷题；点击右上角「结束并判卷」统一查看得分与解析</div>';
    } else if (allAnswered) {
      html += single
        ? '<div class="db-hint">已选择答案，点击「完成本题」记录答案（对错与解析在结束时统一判卷）</div>'
        : '<div class="db-hint">已选完所有小题，点击「完成本题」记录答案（对错与解析在结束时统一判卷）</div>';
    }

    var submitCls = 'db-submit-btn' + (submitted ? ' db-submit-btn--done' : '');
    html += '<button class="' + submitCls + '" data-action="submit" data-card-idx="' + index + '"' + (allAnswered && !submitted ? '' : ' disabled') + '>';
    html += submitted ? '已完成' : '完成本题';
    html += '</button>';

    html += '</div>';
    // 右侧操作栏
    html += renderActionBar(q);
    html += '</div>';
    return html;
  }

  function renderLoadingCard() {
    // Issue #139：全屏加载改用原子轨道动画（bq-loader-atom，纯 CSS）
    return '<div class="db-loading-card"><div class="db-loading-content">' +
      '<div class="bq-loader-atom" role="status" aria-label="加载中">' +
      '<span class="bq-atom-core"></span>' +
      '<span class="bq-atom-orbit"><i></i></span>' +
      '<span class="bq-atom-orbit bq-atom-orbit--2"><i></i></span>' +
      '<span class="bq-atom-orbit bq-atom-orbit--3"><i></i></span>' +
      '</div><span>加载题目中<span class="bq-loader-typing" aria-hidden="true"><i></i><i></i><i></i></span></span></div></div>';
  }

  // 设计原则（人性化）：
  //   1. 作答阶段零判卷——不出现对错/得分/解析，保持刷题心流
  //   2. 结束时统一出成绩单：每题得分、每子项你的判断 vs 正确答案、解析
  //   3. 未作答不计入正确率，但显式展示并支持"返回继续"
  //   4. 空状态（一题没做）只轻确认退出，不弹空成绩单

  // 单题成绩计算 —— 判卷/计分唯一实现在 js/core/question-model.js（daily 档：每计分项 1 分）。
  // 页面只叠加「作答阶段不判卷」的口径：未提交一律按未作答展示，不泄题。
  function buildQuestionReport(q) {
    var answers = state.answeredMap[q.id] || {};
    var submitted = !!state.submittedMap[q.id];
    var g = QuestionModel.gradeQuestion(q, answers, 'daily');

    // 单选题：整题 1 个计分项
    if (g.isChoice) {
      var user = answers[0];
      var answered = submitted && g.answered;
      var ok = submitted && g.correct === 1;
      return {
        submitted: submitted,
        single: true,
        correctCount: ok ? 1 : 0,
        totalSub: g.total,
        items: [],
        options: q.options || [],
        userChoice: user,
        correctChoice: q.answer,
        isAnswered: answered,
        allCorrect: submitted && ok,
        allWrong: submitted && answered && !ok
      };
    }

    var subs = QuestionModel.getEffectiveSubQuestions(q);
    var items = subs.map(function(sq, i) {
      var d = g.details[i] || {};
      return {
        label: sq.label,
        text: sq.text,
        userAnswer: answers[i],
        correct: !!sq.answer,
        isAnswered: submitted && !!d.answered
      };
    });
    var correctCount = submitted ? g.correct : 0;
    return {
      submitted: submitted,
      correctCount: correctCount,
      totalSub: g.total,
      items: items,
      allCorrect: submitted && g.total > 0 && correctCount === g.total,
      allWrong: submitted && correctCount === 0
    };
  }

  function renderReportItem(r, idx) {
    var q = state.questions[idx];
    var cls = 'db-report-item';
    if (!r.submitted) cls += ' db-report-item--unanswered';
    else if (r.allCorrect) cls += ' db-report-item--correct';
    else if (r.allWrong) cls += ' db-report-item--wrong';
    else cls += ' db-report-item--partial';
    var statusCls = !r.submitted ? 'none' : (r.allCorrect ? 'ok' : (r.allWrong ? 'bad' : 'mid'));
    var statusTxt;
    if (!r.submitted) statusTxt = '未作答';
    else if (r.single) statusTxt = r.allCorrect ? '回答正确' : '回答错误';
    else statusTxt = r.allCorrect ? '全部正确' : (r.allWrong ? '全部错误' : '部分正确');

    var html = '';
    html += '<div class="' + cls + '" data-action="report-jump" data-idx="' + idx + '" title="回到本题">';
    html += '<div class="db-report-item-head">';
    html += '<span class="db-report-num">第 ' + (idx + 1) + ' 题</span>';
    if (q.subject) html += '<span class="db-report-subject">' + escapeHtml(q.subject) + '</span>';
    html += '<span class="db-report-status ' + statusCls + '">' + statusTxt + '</span>';
    html += '<span class="db-report-score">' + (r.submitted ? '得分 ' + r.correctCount + '/' + r.totalSub : '—') + '</span>';
    html += '</div>';

    html += '<div class="db-report-question">' + escapeHtml(q.question) + '</div>';
    if (typeof window !== 'undefined' && window.BioQuestFigure) {
      html += window.BioQuestFigure.render(q, { alt: '题目配图' });
    }

    html += '<div class="db-report-subs">';
    if (r.single) {
      // 单选题：逐选项展示 —— 正确答案高亮、你的选择标对错；未作答不泄题
      for (var k = 0; k < r.options.length; k++) {
        var optLabel = String.fromCharCode(65 + k);
        var isUser = !!(r.isAnswered && r.userChoice === optLabel);
        var isRight = !!(r.isAnswered && r.correctChoice === optLabel);
        var subCls = 'db-report-sub';
        if (!r.submitted || !r.isAnswered) subCls += ' db-report-sub--na';
        else if (isRight) subCls += ' db-report-sub--ok';
        else if (isUser) subCls += ' db-report-sub--bad';
        else subCls += ' db-report-sub--na';
        html += '<div class="' + subCls + '">';
        html += '<div class="db-report-sub-row">';
        html += '<span class="db-report-sub-label">' + optLabel + '</span>';
        html += '<span class="db-report-sub-text">' + escapeHtml(r.options[k]) + '</span>';
        html += '</div>';
        if (r.submitted && r.isAnswered && (isUser || isRight)) {
          html += '<div class="db-report-sub-meta">';
          if (isUser) html += '<span class="db-report-user">你的选择</span>';
          if (isRight) html += '<span class="db-report-correct">正确答案</span>';
          html += '<span class="db-report-mark ' + (isRight ? 'ok' : 'bad') + '">' + (isRight ? '&#10003;' : '&#10007;') + '</span>';
          html += '</div>';
        }
        html += '</div>';
      }
      if (!r.submitted || !r.isAnswered) {
        html += '<div class="db-report-sub db-report-sub--na"><div class="db-report-sub-meta">' +
          '<span class="db-report-user">未作答</span>' +
          '<span class="db-report-correct">作答后再评判 · 不剧透答案</span>' +
          '</div></div>';
      }
    } else {
      for (var k2 = 0; k2 < r.items.length; k2++) {
        var it = r.items[k2];
        var subCls2 = 'db-report-sub';
        var userTxt = '';
        var mark = '';
        var correctTxt = '';
        if (!r.submitted || !it.isAnswered) {
          subCls2 += ' db-report-sub--na';
          userTxt = '未作答';
          // 未作答不泄题：回到本题作答后再评判，避免"继续作答"失去意义
          correctTxt = '作答后再评判 · 不剧透答案';
        } else {
          var ok = it.userAnswer === it.correct;
          subCls2 += ok ? ' db-report-sub--ok' : ' db-report-sub--bad';
          userTxt = '你判「' + (it.userAnswer ? '正确' : '错误') + '」';
          mark = ok ? '&#10003;' : '&#10007;';
          correctTxt = '正确答案：' + (it.correct ? '正确' : '错误');
        }
        html += '<div class="' + subCls2 + '">';
        html += '<div class="db-report-sub-row">';
        html += '<span class="db-report-sub-label">' + escapeHtml(it.label) + '</span>';
        html += '<span class="db-report-sub-text">' + escapeHtml(it.text) + '</span>';
        html += '</div>';
        html += '<div class="db-report-sub-meta">';
        html += '<span class="db-report-user">' + userTxt + '</span>';
        html += '<span class="db-report-correct">' + correctTxt + '</span>';
        if (r.submitted && it.isAnswered) html += '<span class="db-report-mark ' + (it.userAnswer === it.correct ? 'ok' : 'bad') + '">' + mark + '</span>';
        html += '</div></div>';
      }
    }
    html += '</div>';

    if (r.submitted && q.explanation) {
      html += '<div class="db-report-explanation"><span class="db-report-expl-label">解析</span><span class="db-report-expl-text">' + renderExplanationWithImages(q.explanation) + '</span></div>';
    } else if (!r.submitted) {
      html += '<div class="db-report-explanation db-report-explanation--na">本题未作答，完成后再来看得分与解析</div>' +
              '<button class="db-report-cta" data-action="report-jump" data-idx="' + idx + '">继续作答 →</button>';
    }
    html += '</div>';
    return html;
  }

  function renderReportPanel() {
    var submittedCount = 0, totalSub = 0, correctSub = 0, unanswered = 0;
    var reports = [];
    for (var i = 0; i < state.questions.length; i++) {
      var r = buildQuestionReport(state.questions[i]);
      r.index = i;
      reports.push(r);
      if (r.submitted) { submittedCount++; totalSub += r.totalSub; correctSub += r.correctCount; }
      else unanswered++;
    }
    var accuracy = totalSub > 0 ? Math.round(correctSub / totalSub * 100) : 0;
    var wrongSubs = totalSub - correctSub;

    var html = '';
    html += '<div class="db-report-overlay" id="dbReportOverlay">';
    html += '<div class="db-report-panel">';

    // 头部（吸顶）
    html += '<div class="db-report-head">';
    html += '<div class="db-report-head-row">';
    html += '<div class="db-report-title">刷题成绩单</div>';
    html += '<button class="db-report-close" data-action="report-close" title="返回继续刷题" data-stop-propagation>&#10005;</button>';
    html += '</div>';
    html += '<div class="db-report-hero">';
    html += '<div class="db-report-acc"><span class="db-report-acc-val">' + accuracy + '%</span><span class="db-report-acc-lbl">正确率</span></div>';
    html += '<div class="db-report-stats">';
    html += '<div class="db-report-stat"><span class="db-report-stat-val">' + submittedCount + '</span><span class="db-report-stat-lbl">已刷</span></div>';
    html += '<div class="db-report-stat"><span class="db-report-stat-val">' + totalSub + '</span><span class="db-report-stat-lbl">计分项</span></div>';
    html += '<div class="db-report-stat"><span class="db-report-stat-val ' + (wrongSubs ? 'bad' : 'ok') + '">' + wrongSubs + '</span><span class="db-report-stat-lbl">错项</span></div>';
    if (unanswered) html += '<div class="db-report-stat"><span class="db-report-stat-val na">' + unanswered + '</span><span class="db-report-stat-lbl">未作答</span></div>';
    html += '</div></div>';
    html += '<div class="db-report-tip">' +
      (unanswered
        ? '有 <b>' + unanswered + '</b> 题未作答（不计入正确率），点题目可回到本题继续挑战'
        : '全部题目已作答，点击题目下方可回到任意一题重看') +
      '</div>';
    html += '</div>';

    // 题目明细（可滚动）
    html += '<div class="db-report-list">';
    for (var j = 0; j < reports.length; j++) html += renderReportItem(reports[j], j);
    html += '</div>';

    // 底部操作（吸底）
    html += '<div class="db-report-footer">';
    html += '<button class="db-report-btn db-report-btn--ghost" data-action="report-restart">重新开始</button>';
    html += '<button class="db-report-btn db-report-btn--primary" data-action="report-continue">返回继续刷题</button>';
    html += '<button class="db-report-btn db-report-btn--danger" data-action="report-exit">退出</button>';
    html += '</div>';

    html += '</div></div>';
    return html;
  }

  function openReportPanel() {
    if (_destroyed || !wrapperEl) return;
    var existing = wrapperEl.querySelector('#dbReportOverlay');
    if (existing) return;

    // 一行都没作答：不要弹空成绩单，轻确认退出即可（防误触丢进度）
    var hasAnySelection = Object.keys(state.answeredMap).length > 0;
    if (state.totalAnswered === 0 && !hasAnySelection) {
      showConfirmExitOverlay();
      return;
    }

    var html = renderReportPanel();
    wrapperEl.insertAdjacentHTML('beforeend', html);
  }

  function closeReportPanel() {
    if (!wrapperEl) return;
    var overlay = wrapperEl.querySelector('#dbReportOverlay');
    if (overlay) overlay.remove();
    var confirm = wrapperEl.querySelector('#dbConfirmExitOverlay');
    if (confirm) confirm.remove();
  }

  // 空作答确认（防误触）：没有任何作答记录时点退出/返回的轻确认
  function showConfirmExitOverlay() {
    if (_destroyed || !wrapperEl) return;
    if (wrapperEl.querySelector('#dbConfirmExitOverlay')) return;
    var html = '<div class="db-confirm-exit-overlay" id="dbConfirmExitOverlay">' +
      '<div class="db-confirm-exit-card">' +
      '<div class="db-confirm-exit-title">结束每日亿题？</div>' +
      '<div class="db-confirm-exit-desc">本次还没有作答记录，确定要退出吗？</div>' +
      '<div class="db-confirm-exit-actions">' +
      '<button class="db-report-btn db-report-btn--ghost" data-action="report-continue">继续刷题</button>' +
      '<button class="db-report-btn db-report-btn--danger" data-action="report-exit">退出</button>' +
      '</div></div></div>';
    wrapperEl.insertAdjacentHTML('beforeend', html);
  }

  function renderErrorCard() {
    return '<div class="db-error-card"><div class="db-error-content">' +
      '<div class="db-error-icon">&#128565;</div>' +
      '<div class="db-error-title">加载失败</div>' +
      '<div class="db-error-desc">' + (state.error || '题目加载出错，请检查网络连接后重试') + '</div>' +
      '<button class="db-error-retry-btn" data-action="retry">重试</button>' +
      '</div></div>';
  }

  function renderPage() {
    if (!pageEl || _destroyed) return;
    var html = '';
    for (var i = 0; i < state.questions.length; i++) {
      html += renderQuestionCard(state.questions[i], i);
    }
    if (state.isLoading) html += renderLoadingCard();
    else if (state.error && state.questions.length === 0) html += renderErrorCard();
    else if (state.questions.length === 0) html += renderLoadingCard();
    pageEl.innerHTML = html;
    setupScrollObserver();
    updateCounter();
  }

  function updateCounter() {
    var numEl = wrapperEl && wrapperEl.querySelector('#dbCounterNum');
    if (numEl) numEl.textContent = state.totalAnswered;
  }

  function pulseCounter() {
    var badge = wrapperEl && wrapperEl.querySelector('#dbCounterBadge');
    if (badge) { badge.classList.remove('pulse'); void badge.offsetWidth; badge.classList.add('pulse'); }
  }

  function setupGlobalDelegation() {
    if (!wrapperEl || _destroyed) return;
    wrapperEl.removeEventListener('click', globalClickHandler);
    wrapperEl.addEventListener('click', globalClickHandler);
  }

  function globalClickHandler(e) {
    var target = e.target;
    var tfBtn = target.closest ? target.closest('.db-tf-btn') : (target.classList && target.classList.contains('db-tf-btn') ? target : null);
    if (tfBtn) { handleTFClickDelegated(tfBtn); return; }
    // 单选题选项按钮
    var optBtn = target.closest ? target.closest('.db-opt-btn') : (target.classList && target.classList.contains('db-opt-btn') ? target : null);
    if (optBtn) { handleOptionClick(optBtn); return; }
    var actionEl = target.closest ? target.closest('[data-action]') : (target.hasAttribute && target.hasAttribute('data-action') ? target : null);
    if (actionEl) {
      var action = actionEl.getAttribute('data-action');
      if (action === 'submit') { handleSubmitDelegated(actionEl); return; }
      // 注：勿用 action="stop"（与原生 window.stop 冲突，boot-lazy 兜底会 Illegal invocation）
      if (action === 'db-stop') { handleStop(); return; }
      if (action === 'restart') { handleRestart(); return; }
      if (action === 'retry') { handleRetry(); return; }
      if (action === 'report-close') { closeReportPanel(); return; }
      if (action === 'report-continue') { handleReportContinue(); return; }
      if (action === 'report-restart') { handleRestart(); return; }
      if (action === 'report-exit') { handleReportExit(); return; }
      if (action === 'report-jump') { handleReportJump(actionEl); return; }
      if (action === 'fav') { handleFav(actionEl); return; }
      if (action === 'like') { handleFeedback(actionEl, 'like'); return; }
      if (action === 'dislike') { handleFeedback(actionEl, 'dislike'); return; }
      if (action === 'share') { handleShare(actionEl); return; }
    }
  }

  function handleTFClickDelegated(btn) {
    var subIdx = parseInt(btn.dataset.subIdx, 10);
    var value = btn.dataset.value === 'true';
    var cardEl = btn.closest('.db-card');
    if (!cardEl) return;
    var questionId = cardEl.dataset.questionId;
    var cardIdx = parseInt(cardEl.dataset.index, 10);
    var q = state.questions[cardIdx];
    if (!q || q.id !== questionId) return;
    if (state.submittedMap[q.id]) return;

    if (!state.answeredMap[q.id]) state.answeredMap[q.id] = {};
    state.answeredMap[q.id][subIdx] = value;

    var subItem = btn.closest('.db-sub-item');
    if (subItem) {
      var trueBtn = subItem.querySelector('.db-tf-btn[data-value="true"]');
      var falseBtn = subItem.querySelector('.db-tf-btn[data-value="false"]');
      if (trueBtn) trueBtn.classList.remove('selected');
      if (falseBtn) falseBtn.classList.remove('selected');
    }
    btn.classList.add('selected');

    var answers = state.answeredMap[q.id];
    var allAnswered = QuestionModel.isAllAnswered(q, answers);
    var submitBtn = cardEl.querySelector('.db-submit-btn');
    if (submitBtn && allAnswered) { submitBtn.disabled = false; submitBtn.textContent = '完成本题'; }
    saveState();
  }

  // 单选题选项点击：互斥单选，答案记录在 answeredMap[qid][0] = 'A'~'D'
  function handleOptionClick(btn) {
    if (btn.disabled) return;
    var cardEl = btn.closest('.db-card');
    if (!cardEl) return;
    var questionId = cardEl.dataset.questionId;
    var cardIdx = parseInt(cardEl.dataset.index, 10);
    var q = state.questions[cardIdx];
    if (!q || q.id !== questionId || !isSingleQ(q)) return;
    if (state.submittedMap[q.id]) return;

    if (!state.answeredMap[q.id]) state.answeredMap[q.id] = {};
    state.answeredMap[q.id][0] = btn.dataset.value;

    var list = btn.closest('.db-opt-list');
    if (list) {
      var prev = list.querySelectorAll('.db-opt-btn.selected');
      for (var i = 0; i < prev.length; i++) prev[i].classList.remove('selected');
    }
    btn.classList.add('selected');

    var submitBtn = cardEl.querySelector('.db-submit-btn');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '完成本题'; }
    saveState();
  }

  function handleSubmitDelegated(btn) {
    var cardIdx = parseInt(btn.dataset.cardIdx, 10);
    var q = state.questions[cardIdx];
    if (!q) return;
    var cardEl = pageEl.querySelector('.db-card[data-index="' + cardIdx + '"]');
    if (!cardEl) return;

    var answers = state.answeredMap[q.id] || {};
    var allAnswered = QuestionModel.isAllAnswered(q, answers);
    if (!allAnswered) return;
    if (state.submittedMap[q.id]) return;

    checkSpeedWarn();

    state.submittedMap[q.id] = true;
    state.totalAnswered++;

    // 统一判卷：提交时只累计统计，不要在作答阶段渲染对错/解析（计分内核统一）
    var g = QuestionModel.gradeQuestion(q, answers, 'daily');
    state.totalSubQuestions += g.total;
    state.totalCorrect += g.correct;

    saveState();
    updateCounter();
    pulseCounter();

    if (typeof window.recordDailyCheckIn === 'function') { try { window.recordDailyCheckIn(); } catch(e) {} }
    if (typeof window.checkAchievement === 'function') { try { window.checkAchievement('practice', 1); } catch(e) {} }

    // 作答阶段不判卷：卡片刷新为"已作答"锁定态，并平滑滚动到下一题保持刷题节奏
    cardEl.outerHTML = renderQuestionCard(q, cardIdx);
    setTimeout(function() {
      if (_destroyed || !pageEl) return;
      var cards = pageEl.querySelectorAll('.db-card');
      if (cards.length > 1) {
        var nextIdx = Math.min(cardIdx + 1, cards.length - 1);
        cards[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 160);
  }

  function handleFav(btn) {
    var qid = btn.dataset.qid;
    if (state.favorites[qid]) {
      delete state.favorites[qid];
      btn.classList.remove('active');
      var svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', 'none');
    } else {
      state.favorites[qid] = true;
      btn.classList.add('active');
      var svg2 = btn.querySelector('svg');
      if (svg2) svg2.setAttribute('fill', 'currentColor');
      showToast('已收藏');
    }
    saveState();
  }

  function handleFeedback(btn, type) {
    var qid = btn.dataset.qid;
    // 切换：再次点击取消
    if (state.feedback[qid] === type) {
      delete state.feedback[qid];
      btn.classList.remove('active');
      var svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', 'none');
      // 同时取消另一边的active
      var cardEl = btn.closest('.db-card');
      if (cardEl) {
        var other = cardEl.querySelector('.db-action-btn[data-action="' + (type === 'like' ? 'dislike' : 'like') + '"]');
        if (other) other.classList.remove('active');
        var otherSvg = other && other.querySelector('svg');
        if (otherSvg) otherSvg.setAttribute('fill', 'none');
      }
    } else {
      state.feedback[qid] = type;
      btn.classList.add('active');
      var svg2 = btn.querySelector('svg');
      if (svg2) svg2.setAttribute('fill', 'currentColor');
      // 取消另一边
      var cardEl2 = btn.closest('.db-card');
      if (cardEl2) {
        var other2 = cardEl2.querySelector('.db-action-btn[data-action="' + (type === 'like' ? 'dislike' : 'like') + '"]');
        if (other2) { other2.classList.remove('active'); var os = other2.querySelector('svg'); if (os) os.setAttribute('fill', 'none'); }
      }
      showToast(type === 'like' ? '感谢反馈' : '已记录');
    }
    saveState();
  }

  function handleShare(btn) {
    var qid = btn.dataset.qid;
    var url = window.location.origin + window.location.pathname + '#/daily-billion?q=' + qid;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function() {
        showToast('链接已复制');
      }).catch(function() {
        showToast('分享链接: ' + url);
      });
    } else {
      showToast('分享链接: ' + url);
    }
  }

  // 缓存：避免重复绑定 scroll fallback
  var _scrollFallbackBound = false;
  var _scrollFallbackTimer = null;
  var _cardAnimObserver = null;    // 控制卡片入场动画：仅对进入视口的卡片播放
  var _initCheckTimer = null;      // 首屏渲染后的延迟兜底检查
  var _lastSettledCheck = 0;       // 防抖：scroll settle 检查节流

  function setupScrollObserver() {
    if (!pageEl || _destroyed) return;
    if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }

    // 问题：scroll-snap-mandatory 模式下首屏会同时创建多张卡片 DOM，
    //       浏览器同时排队播放入场动画（dbCardReveal / dbSubItemIn 等）
    //       → 合成线程压力大 → 掉帧 / 卡顿
    // 策略：默认所有卡片用 paused 态（无动画），用 IntersectionObserver 只在卡片
    //       真正进入视口后为其加 .db-card--animate 类，才触发一次入场动画，
    //       离开视口后动画自动结束（不会回退），后续无需再播放。
    if (_cardAnimObserver) { _cardAnimObserver.disconnect(); _cardAnimObserver = null; }
    try {
      _cardAnimObserver = new IntersectionObserver(function (entries) {
        if (_destroyed) return;
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          var inner = entry.target.querySelector && entry.target.querySelector('.db-card-inner');
          if (!inner) continue;
          if (entry.isIntersecting) {
            // 进入视口 → 加动画类（仅一次，加过就不再回退）
            if (!inner.classList.contains('db-card--animate')) {
              inner.classList.add('db-card--animate');
            }
          }
        }
      }, { root: pageEl, rootMargin: '20% 0px 10% 0px', threshold: 0.02 });
    } catch (e) { _cardAnimObserver = null; }

    // 先把当前所有卡片登记
    var allCards = pageEl.querySelectorAll('.db-card');
    for (var ac = 0; ac < allCards.length; ac++) {
      if (_cardAnimObserver) {
        try { _cardAnimObserver.observe(allCards[ac]); } catch (e) {}
      } else {
        // 不支持 IO 时退化：直接给前 2 张加动画类，后续默认有
        var inr = allCards[ac].querySelector('.db-card-inner');
        if (inr && ac < 3) inr.classList.add('db-card--animate');
      }
    }

    // 额外兜底：滚动事件监听（IntersectionObserver 在极端情况下不触发时的备用）
    if (!_scrollFallbackBound) {
      _scrollFallbackBound = true;
      pageEl.addEventListener('scroll', function onScroll() {
        if (_destroyed || !pageEl) return;
        // 节流：120ms 内只检查一次
        if (_scrollFallbackTimer) return;
        _scrollFallbackTimer = setTimeout(function () {
          _scrollFallbackTimer = null;
          _checkShouldLazyLoadByScroll();
          // 每次滚动后再额外做一次 settled 检查（应对快速滑到底部）
          _throttledSettledCheck();
        }, 120);
      }, { passive: true });
    }

    // 优先观察 loading card（如果存在）
    var loadingCard = pageEl.querySelector('.db-loading-card');
    if (loadingCard && !state.isLoading) {
      // 有 loading 占位卡片但没在加载中 → 异常状态，移除并重新观察最后一题
      loadingCard.remove();
    }
    var targetEl = null;
    var cards = pageEl.querySelectorAll('.db-card');
    if (cards.length === 0 && !loadingCard) return;

    // 选择触发目标：接近末尾的最后一张卡片（或 loading card 本身）
    if (loadingCard) {
      targetEl = loadingCard;
    } else if (cards.length > 0) {
      // 用倒数第 2 张（不是 -3）在移动端更可靠；只有 1 张时用它自己
      var targetIdx = Math.max(0, cards.length - 2);
      targetEl = cards[targetIdx];
    }

    if (targetEl) {
      scrollObserver = new IntersectionObserver(function(entries) {
        if (entries[0].isIntersecting && !state.isLoading && state.hasMore) {
          lazyLoadMore();
        }
      }, { root: pageEl, rootMargin: '240px 0px', threshold: [0.01, 0.1, 0.3] });
      try { scrollObserver.observe(targetEl); } catch (e) {}
    }
  }

  // scroll 结束后的延迟二次检查（应对 iOS Safari scroll-snap + IO 冲突）
  function _throttledSettledCheck() {
    var now = Date.now();
    if (now - _lastSettledCheck < 350) return;
    _lastSettledCheck = now;
    setTimeout(function () {
      if (_destroyed) return;
      _checkShouldLazyLoadByScroll();
    }, 380);
  }

  // 兜底：用滚动位置判断是否该懒加载（应对 IntersectionObserver 偶发不触发）
  function _checkShouldLazyLoadByScroll() {
    if (state.isLoading || _destroyed || !state.hasMore || !pageEl) return;
    // 距底部 < 380px 且未在加载 → 触发（阈值调高，移动端体验更稳）
    var distToBottom = pageEl.scrollHeight - pageEl.scrollTop - pageEl.clientHeight;
    if (distToBottom < 380) {
      lazyLoadMore();
    }
  }

  async function lazyLoadMore() {
    if (state.isLoading || _destroyed) return;
    // 注意：不要在这里提前把 state.isLoading 置 true —— loadQuestions() 开头有
    // `if (state.isLoading) return;`，提前置位会让它直接空返回，导致永远加载不出
    // 新题（表现为刷到第 3 张就卡住）。loadQuestions 的同步首段会立即置位，防重入已足够。
    if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }
    var oldLen = state.questions.length;
    try {
      await loadQuestions(3);
    } catch (loadErr) {
      console.warn('[DailyBillion] lazyLoadMore 异常:', loadErr);
      state.error = loadErr.message || '加载失败，请下拉再试';
    }
    state.isLoading = false;
    if (_destroyed) return;
    var addedCardEls = [];
    if (state.questions.length > oldLen) {
      var loadingCard = pageEl.querySelector('.db-loading-card');
      if (loadingCard) {
        var newHtml = '';
        for (var i = oldLen; i < state.questions.length; i++) newHtml += renderQuestionCard(state.questions[i], i);
        if (state.isLoading) newHtml += renderLoadingCard();
        // 先找到 loading 的前一个（即新卡片将插入后位置的基准），以便稍后收集新增卡片
        var prevSibling = loadingCard.previousElementSibling;
        loadingCard.insertAdjacentHTML('beforebegin', newHtml);
        loadingCard.remove();
        // 收集新增卡片：从 prevSibling 的下一个开始到末尾
        var walker = prevSibling ? prevSibling.nextElementSibling : pageEl.firstElementChild;
        while (walker) {
          if (walker.classList && walker.classList.contains('db-card')) addedCardEls.push(walker);
          walker = walker.nextElementSibling;
        }
      } else {
        var beforeCount = pageEl.children.length;
        var newHtml2 = '';
        for (var k = oldLen; k < state.questions.length; k++) newHtml2 += renderQuestionCard(state.questions[k], k);
        if (state.isLoading) newHtml2 += renderLoadingCard();
        pageEl.insertAdjacentHTML('beforeend', newHtml2);
        // 收集：从 beforeCount 索引开始的后续孩子
        for (var ci = beforeCount; ci < pageEl.children.length; ci++) {
          var ch = pageEl.children[ci];
          if (ch.classList && ch.classList.contains('db-card')) addedCardEls.push(ch);
        }
      }
    } else if (state.error) {
      showToast(state.error);
      state.error = null;
    } else if (state.hasMore === false) {
      // 题库到底：移除 loading 占位，显示结束提示（如果还没显示）
      var loading = pageEl.querySelector('.db-loading-card');
      if (loading) {
        loading.innerHTML = '<div class="db-loading-content"><span>已刷完当前题库</span></div>';
      }
    }
    if (_cardAnimObserver && addedCardEls.length > 0) {
      for (var ai = 0; ai < addedCardEls.length; ai++) {
        try { _cardAnimObserver.observe(addedCardEls[ai]); } catch (e) {}
      }
    } else if (addedCardEls.length > 0) {
      // 退化：给全部新加卡片直接加动画类（但只有 1 张会在视口，影响不大）
      for (var aj = 0; aj < addedCardEls.length; aj++) {
        var inr2 = addedCardEls[aj].querySelector && addedCardEls[aj].querySelector('.db-card-inner');
        if (inr2) inr2.classList.add('db-card--animate');
      }
    }
    setupScrollObserver();
  }

  function handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    _touchStartY = e.touches[0].clientY;
    _touchStartTime = Date.now();
  }

  function handleTouchEnd(e) {
    if (!pageEl || _destroyed || !_touchStartY) return;
    // 成绩单/确认面板打开时禁止滑动手势翻页，避免误滚背后列表
    if (wrapperEl && (wrapperEl.querySelector('#dbReportOverlay') || wrapperEl.querySelector('#dbConfirmExitOverlay'))) { _touchStartY = 0; return; }
    var dy = e.changedTouches[0].clientY - _touchStartY;
    var dt = Date.now() - _touchStartTime;
    _touchStartY = 0;
    var isGesture = dt <= 500 && Math.abs(dy) >= 50 &&
      !e.target.closest('.db-tf-btn') && !e.target.closest('.db-opt-btn') && !e.target.closest('.db-submit-btn') && !e.target.closest('.db-action-btn');
    if (isGesture) {
      if (dy < 0) scrollToNextCard();
      else scrollToPrevCard();
    }
    // 触摸结束 → 不管有没有滑动手势，都做一次懒加载 + settled 检查
    // （应对"下拉不会加载出动画/题目"：scroll-snap 结束时 IO 偶发不触发）
    setTimeout(function () {
      if (_destroyed) return;
      _checkShouldLazyLoadByScroll();
      _throttledSettledCheck();
    }, isGesture ? 460 : 120);
  }

  function handleStop() {
    openReportPanel();
  }

  // 顶部返回键（退出）同样进入统一判卷流程，防止误触直接丢进度
  function handleExitRequest() {
    openReportPanel();
  }
  window._dbExitFlow = handleExitRequest;

  function handleReportContinue() {
    closeReportPanel();
    // 人性化：返回后自动定位到第一个未作答/未提交的卡片，方便接续
    if (!pageEl) return;
    var firstIdx = -1;
    for (var i = 0; i < state.questions.length; i++) {
      if (!state.submittedMap[state.questions[i].id]) { firstIdx = i; break; }
    }
    setTimeout(function() {
      if (_destroyed || !pageEl || firstIdx < 0) return;
      var card = pageEl.querySelector('.db-card[data-index="' + firstIdx + '"]');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function handleReportJump(btn) {
    var idx = parseInt(btn.getAttribute('data-idx'), 10);
    closeReportPanel();
    if (isNaN(idx) || !pageEl) return;
    setTimeout(function() {
      if (_destroyed || !pageEl) return;
      var card = pageEl.querySelector('.db-card[data-index="' + idx + '"]');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function handleReportExit() {
    // 保存进度并离开（路由切换会触发 destroyDailyBillion 持久化）
    saveState();
    window.location.hash = '#/';
  }

  function handleRestart() {
    if (_destroyed || !wrapperEl) return;
    closeReportPanel();
    cleanupDom();
    resetState();
    initDailyBillionCore();
  }

  function handleRetry() {
    if (_destroyed) return;
    cleanupDom();
    resetState();
    initDailyBillionCore();
  }

  function cleanupDom() {
    document.removeEventListener('keydown', handleKeyDown);
    if (wrapperEl) {
      wrapperEl.removeEventListener('click', globalClickHandler);
    }
    if (pageEl) {
      pageEl.removeEventListener('touchstart', handleTouchStart);
      pageEl.removeEventListener('touchend', handleTouchEnd);
    }
    if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null; }
    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
    if (wrapperEl) {
      var report = wrapperEl.querySelector('#dbReportOverlay');
      if (report) report.remove();
      var confirm = wrapperEl.querySelector('#dbConfirmExitOverlay');
      if (confirm) confirm.remove();
    }
    if (wrapperEl && wrapperEl.parentNode) {
      wrapperEl.parentNode.removeChild(wrapperEl);
    }
    wrapperEl = null;
    pageEl = null;
    topBarEl = null;
    _touchStartY = 0;
    _touchStartTime = 0;
  }

  function resetState() {
    state.questions = [];
    state.loadedIds = {};
    state.totalAnswered = 0;
    state.totalCorrect = 0;
    state.totalSubQuestions = 0;
    state.isLoading = false;
    state.hasMore = true;
    state.totalPoolSize = 0;
    state.answeredMap = {};
    state.submittedMap = {};
    state.favorites = {};
    state.feedback = {};
    state.error = null;
    state.usingLocalQuestions = false;
    state.lastSubmitTime = 0;
    state.speedWarnCount = 0;
    _supabaseRetryCount = 0;
    _sbClient = null;
    try { localStorage.removeItem('bioquest_billion_v3'); } catch(e) {}
  }

  var _saveTimer = null;
  function saveState() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() {
      _saveTimer = null;
      try {
        var data = {
          totalAnswered: state.totalAnswered,
          totalCorrect: state.totalCorrect,
          totalSubQuestions: state.totalSubQuestions,
          answeredMap: state.answeredMap,
          submittedMap: state.submittedMap,
          favorites: state.favorites,
          feedback: state.feedback
        };
        localStorage.setItem('bioquest_billion_v3', JSON.stringify(data));
      } catch(e) {}
    }, 300);
  }

  function loadPersistedState() {
    try {
      var raw = localStorage.getItem('bioquest_billion_v3');
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.totalAnswered !== undefined) state.totalAnswered = data.totalAnswered;
      if (data.totalCorrect !== undefined) state.totalCorrect = data.totalCorrect;
      if (data.totalSubQuestions !== undefined) state.totalSubQuestions = data.totalSubQuestions;
      if (data.answeredMap) state.answeredMap = data.answeredMap;
      if (data.submittedMap) state.submittedMap = data.submittedMap;
      if (data.favorites) state.favorites = data.favorites;
      if (data.feedback) state.feedback = data.feedback;
    } catch(e) {}
  }

  function handleKeyDown(e) {
    if (!pageEl || _destroyed) return;
    if (!wrapperEl || !document.body.contains(wrapperEl)) return;
    // 成绩单/确认面板打开时不响应翻页快捷键，防止误滚背后列表
    if (wrapperEl.querySelector('#dbReportOverlay') || wrapperEl.querySelector('#dbConfirmExitOverlay')) return;
    var activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); scrollToNextCard(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); scrollToPrevCard(); }
  }

  function getCurrentCardIndex() {
    if (!pageEl) return -1;
    var cards = pageEl.querySelectorAll('.db-card');
    if (cards.length === 0) return -1;
    var containerRect = pageEl.getBoundingClientRect();
    var threshold = containerRect.top + containerRect.height * 0.4;
    for (var i = 0; i < cards.length; i++) {
      var rect = cards[i].getBoundingClientRect();
      if (rect.top <= threshold && rect.bottom > containerRect.top + 50) {
        return i;
      }
    }
    return 0;
  }

  function scrollToNextCard() {
    if (!pageEl || _destroyed) return;
    var cards = pageEl.querySelectorAll('.db-card');
    if (cards.length === 0) return;
    var currentIdx = getCurrentCardIndex();
    var nextIdx = Math.min(currentIdx + 1, cards.length - 1);
    if (nextIdx !== currentIdx) cards[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function scrollToPrevCard() {
    if (!pageEl || _destroyed) return;
    var cards = pageEl.querySelectorAll('.db-card');
    if (cards.length === 0) return;
    var currentIdx = getCurrentCardIndex();
    var prevIdx = Math.max(currentIdx - 1, 0);
    if (prevIdx !== currentIdx) cards[prevIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function initDailyBillionCore() {
    if (_destroyed) return;
    if (wrapperEl) { cleanupDom(); }
    loadPersistedState();

    wrapperEl = document.createElement('div');
    wrapperEl.id = 'dbWrapper';
    wrapperEl.style.cssText = 'position:fixed;inset:0;z-index:10001;';
    document.body.appendChild(wrapperEl);

    if (targetEl) { targetEl.innerHTML = ''; }

    pageEl = document.createElement('div');
    pageEl.className = 'db-page';
    pageEl.id = 'dbPageScroll';
    wrapperEl.appendChild(pageEl);

    renderTopBar();
    setupGlobalDelegation();
    pageEl.innerHTML = renderLoadingCard();

    await loadQuestions(3);
    if (_destroyed) return;
    renderPage();

    if (state.questions.length > 0) {
      var firstUnsubmittedIdx = -1;
      for (var i = 0; i < state.questions.length; i++) {
        if (!state.submittedMap[state.questions[i].id]) { firstUnsubmittedIdx = i; break; }
      }
      if (firstUnsubmittedIdx > 0) {
        setTimeout(function() {
          var card = pageEl.querySelector('.db-card[data-index="' + firstUnsubmittedIdx + '"]');
          if (card) card.scrollIntoView({ behavior: 'instant' });
        }, 100);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    pageEl.addEventListener('touchstart', handleTouchStart, { passive: true });
    pageEl.addEventListener('touchend', handleTouchEnd, { passive: true });
  }

  function init(target) {
    targetEl = target;
    _destroyed = false;
    if (wrapperEl) { saveState(); cleanupDom(); }
    initDailyBillionCore();
  }

  function destroy() {
    _destroyed = true;
    try {
      var data = {
        totalAnswered: state.totalAnswered,
        totalCorrect: state.totalCorrect,
        totalSubQuestions: state.totalSubQuestions,
        answeredMap: state.answeredMap,
        submittedMap: state.submittedMap,
        favorites: state.favorites,
        feedback: state.feedback
      };
      localStorage.setItem('bioquest_billion_v3', JSON.stringify(data));
    } catch(e) {}
    cleanupDom();
    if (targetEl) { targetEl.innerHTML = ''; targetEl.style.cssText = ''; }
    targetEl = null;
    _sbClient = null;
  }

  window.initDailyBillion = function(target) { init(target); };
  window.destroyDailyBillion = function() { if (wrapperEl) { saveState(); destroy(); } };

})();