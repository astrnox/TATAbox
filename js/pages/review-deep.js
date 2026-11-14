/**
 * ============================================================
 * TATABOX — 错题深度复盘
 * 与错题本不同：强调"深度分析 + 同类题练习"
 * 数据来源：localStorage 错题记录（bioquest_wrong_questions）
 * ============================================================
 */

(function() {
  'use strict';

  var STORAGE_WRONG = 'tatabox_wrong_questions';
  var STORAGE_ANALYSIS = 'tatabox_review_analysis';  // { qId: { errorType, analysis, suggestion, similarConcepts, ts } }
  var STORAGE_MASTERY = 'tatabox_review_mastery';     // { qId: { attempts, correct, mastered, lastAt } }

  var ERROR_TYPE_LABELS = {
    concept: '概念混淆',
    careless: '粗心',
    knowledge_gap: '知识盲区',
    logic: '逻辑错误',
    unanalyzed: '未分析'
  };
  var ERROR_TYPE_COLORS = {
    concept: '#d97706',
    careless: '#3b82f6',
    knowledge_gap: '#ef4444',
    logic: '#8b5cf6',
    unanalyzed: '#9ca3af'
  };

  var _list = [];
  var _expandedId = null;

  function _addStyles() {
    if (document.getElementById('review-deep-styles')) return;
    var style = document.createElement('style');
    style.id = 'review-deep-styles';
    style.textContent = `
      .rd-container { max-width: 960px; margin: 0 auto; padding: 20px; }
      .rd-page-header { padding: 24px 20px 8px; text-align: center; }
      .rd-page-header h1 { margin: 0; font-family: var(--font-serif, serif); color: var(--color-deep, #2c4a3b); font-size: 1.6rem; }
      .rd-page-header p { margin: 6px 0 0; color: var(--text-muted, #888); font-size: 0.88rem; }
      .rd-dashboard { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
      .rd-panel { background: var(--card-bg, #fff); border-radius: 12px; padding: 16px; box-shadow: var(--shadow-sm); }
      .rd-panel h3 { margin: 0 0 12px; font-size: 0.95rem; color: var(--color-deep, #2c4a3b); }
      .rd-stats-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
      .rd-stat { flex: 1; min-width: 120px; background: var(--card-bg, #fff); border-radius: 12px; padding: 14px; text-align: center; box-shadow: var(--shadow-sm); }
      .rd-stat-num { font-size: 1.6rem; font-weight: 700; color: var(--color-sage, #5a7d5c); line-height: 1.2; }
      .rd-stat-label { font-size: 0.78rem; color: var(--text-muted, #888); margin-top: 4px; }
      .rd-chart-wrap { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
      .rd-legend { flex: 1; min-width: 120px; }
      .rd-legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; margin-bottom: 4px; color: var(--text-secondary, #555); }
      .rd-legend-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
      .rd-legend-val { margin-left: auto; font-weight: 600; color: var(--text-primary, #222); }
      .rd-empty-mini { color: var(--text-muted, #888); font-size: 0.85rem; padding: 20px 0; text-align: center; }
      .rd-list { }
      .rd-card { background: var(--card-bg, #fff); border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; box-shadow: var(--shadow-sm); cursor: pointer; transition: box-shadow 0.15s; }
      .rd-card:hover { box-shadow: var(--shadow-md); }
      .rd-card-title { font-weight: 600; color: var(--color-deep, #2c4a3b); line-height: 1.45; margin: 0 0 6px; font-size: 0.95rem; }
      .rd-card-meta { font-size: 0.8rem; color: var(--text-muted, #888); }
      .rd-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .rd-tag { display: inline-block; padding: 2px 9px; border-radius: 8px; font-size: 0.72rem; background: var(--color-sage, #5a7d5c); color: #fff; }
      .rd-tag--module { background: #6b7f74; }
      .rd-tag--error { color: #fff; }
      .rd-tag--mastered { background: #16a34a; }
      .rd-tag--wrong { background: #ef4444; }
      .rd-practice-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .rd-practice-btn { display: inline-block; padding: 6px 14px; border-radius: 9999px; border: 1px solid var(--color-sage, #5a7d5c); background: transparent; color: var(--color-sage, #5a7d5c); font-size: 0.82rem; font-weight: 500; cursor: pointer; text-decoration: none; }
      .rd-practice-btn:hover { background: rgba(90, 125, 92, 0.1); }
      .rd-badge-count { display: inline-block; background: #fee2e2; color: #b91c1c; font-size: 0.72rem; padding: 2px 8px; border-radius: 8px; font-weight: 600; }
      .rd-detail { background: var(--card-bg, #fff); border-radius: 12px; padding: 18px; margin-bottom: 12px; box-shadow: var(--shadow-md); border-left: 4px solid var(--color-sage, #5a7d5c); }
      .rd-detail h4 { margin: 0 0 10px; color: var(--color-deep, #2c4a3b); font-size: 1rem; }
      .rd-q-text { font-size: 0.95rem; line-height: 1.6; color: var(--text-primary, #222); margin-bottom: 10px; }
      .rd-answer-row { display: flex; gap: 16px; flex-wrap: wrap; margin: 10px 0; font-size: 0.88rem; }
      .rd-answer-row .rd-ans-wrong { color: #b91c1c; }
      .rd-answer-row .rd-ans-right { color: #15803d; }
      .rd-options { margin: 10px 0; padding: 10px 14px; background: rgba(0,0,0,0.02); border-radius: 8px; font-size: 0.85rem; line-height: 1.7; }
      .rd-analysis-box { background: #f0fdf4; border-left: 4px solid var(--color-sage, #5a7d5c); padding: 12px 16px; border-radius: 8px; margin: 12px 0; }
      .rd-analysis-box p { margin: 4px 0; font-size: 0.88rem; line-height: 1.6; color: var(--text-primary, #222); }
      .rd-suggestion { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 10px 14px; border-radius: 8px; margin: 10px 0; font-size: 0.86rem; line-height: 1.6; color: var(--text-primary, #222); }
      .rd-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      .rd-btn { padding: 7px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.85rem; background: var(--color-sage, #5a7d5c); color: #fff; }
      .rd-btn--secondary { background: #e5e7eb; color: #374151; }
      .rd-btn--amber { background: #d97706; }
      .rd-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .rd-loading { color: var(--text-muted, #888); font-size: 0.88rem; padding: 8px 0; }
      .rd-practice { margin-top: 14px; padding: 14px; background: rgba(58,140,92,0.05); border: 1px solid rgba(58,140,92,0.15); border-radius: 8px; }
      .rd-practice h5 { margin: 0 0 10px; color: var(--color-deep, #2c4a3b); font-size: 0.95rem; }
      .rd-practice-q { font-size: 0.9rem; line-height: 1.55; margin-bottom: 10px; color: var(--text-primary, #222); }
      .rd-practice-opt { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 0.86rem; }
      .rd-practice-opt-text { flex: 1; }
      .rd-practice-toggle { display: inline-flex; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
      .rd-practice-toggle button { padding: 3px 10px; border: none; background: #fff; cursor: pointer; font-size: 0.8rem; color: #555; }
      .rd-practice-toggle button.active { background: var(--color-sage, #5a7d5c); color: #fff; }
      .rd-practice-result { margin-top: 10px; padding: 10px; border-radius: 8px; font-size: 0.86rem; line-height: 1.6; }
      .rd-practice-result--pass { background: #f0fdf4; color: #15803d; }
      .rd-practice-result--fail { background: #fef2f2; color: #b91c1c; }
      .rd-empty { text-align: center; padding: 60px 20px; color: var(--text-muted, #888); }
      @media (max-width: 640px) {
        .rd-dashboard { grid-template-columns: 1fr; }
        .rd-stats-row { flex-direction: column; }
      }
    `;
    document.head.appendChild(style);
  }

  function _esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function _safeGetJSON(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }
  function _safeSetJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function _truncate(s, n) {
    s = s || '';
    return s.length > n ? s.substring(0, n) + '...' : s;
  }
  function _fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function _loadWrongQuestions() {
    var list = [];
    if (typeof window.getWrongQuestions === 'function') {
      try {
        var r = window.getWrongQuestions({ limit: 500 });
        if (Array.isArray(r) && r.length) list = r;
      } catch (e) {}
    }
    if (!list.length) {
      var arr = _safeGetJSON(STORAGE_WRONG, []);
      if (Array.isArray(arr)) list = arr;
    }
    return list;
  }

  function _getAnalysis(qId) {
    var c = _safeGetJSON(STORAGE_ANALYSIS, {});
    return (qId && c[qId]) || null;
  }
  function _setAnalysis(qId, analysis) {
    if (!qId) return;
    var c = _safeGetJSON(STORAGE_ANALYSIS, {});
    c[qId] = analysis;
    _safeSetJSON(STORAGE_ANALYSIS, c);
  }
  function _getMastery(qId) {
    var m = _safeGetJSON(STORAGE_MASTERY, {});
    return (qId && m[qId]) || { attempts: 0, correct: 0, mastered: false };
  }
  function _recordMastery(qId, correct) {
    if (!qId) return;
    var m = _safeGetJSON(STORAGE_MASTERY, {});
    var cur = m[qId] || { attempts: 0, correct: 0, mastered: false };
    cur.attempts++;
    if (correct) cur.correct++;
    cur.mastered = correct;
    cur.lastAt = Date.now();
    m[qId] = cur;
    _safeSetJSON(STORAGE_MASTERY, m);
  }

  function _getQuestionText(q) {
    var fq = q.fullQuestion || {};
    return q.questionText || q.question_text || fq.question || fq.stem || fq.questionText || '';
  }
  function _getOptions(q) {
    var fq = q.fullQuestion || {};
    if (fq.options && typeof fq.options === 'object') return fq.options;
    if (Array.isArray(fq.subQuestions)) {
      var opts = {};
      fq.subQuestions.forEach(function(s) { if (s && s.label) opts[s.label] = s.text || ''; });
      return opts;
    }
    return {};
  }
  function _getCorrectAnswer(q) {
    var fq = q.fullQuestion || {};
    if (fq.answer != null) {
      if (typeof fq.answer === 'string') return fq.answer;
      try { return JSON.stringify(fq.answer); } catch (e) { return String(fq.answer); }
    }
    if (Array.isArray(fq.subQuestions)) {
      return fq.subQuestions.map(function(s) { return s.label + (s.answer ? '√' : '×'); }).join('  ');
    }
    return q.correct_answer || q.correctAnswer || '';
  }
  function _getUserAnswer(q) {
    return q.userAnswer || q.user_answer || (q.fullQuestion && q.fullQuestion.userAnswer) || '';
  }
  function _getConcept(q) {
    var fq = q.fullQuestion || {};
    return q.concept || fq.concept || (Array.isArray(fq.knowledge) ? fq.knowledge.join('、') : (fq.knowledge || ''));
  }
  function _normalizeModule(mod) {
    if (mod == null || mod === '') return null;
    if (typeof mod === 'number') return 'module_' + mod;
    if (typeof mod === 'string') {
      if (/^\d+$/.test(mod)) return 'module_' + mod;
      return mod;
    }
    return null;
  }
  function _getModule(q) {
    var fq = q.fullQuestion || {};
    return _normalizeModule(q.module || fq.module);
  }
  function _getModuleLabel(mod) {
    var map = { module_1: '模块1', module_2: '模块2', module_3: '模块3', module_4: '模块4', general: '综合' };
    return map[mod] || (mod ? mod : '未分类');
  }

  /**
   * 题目标签：优先用题目自带的学科 / 概念 / 知识点标签，
   * 只有在完全取不到时才退回模块名，避免列表满屏「general」。
   */
  function _getTagList(q) {
    var fq = q.fullQuestion || {};
    var out = [];
    var subject = q.subject || fq.subject || '';
    if (subject && subject !== 'general' && out.indexOf(subject) < 0) out.push(subject);
    var concept = _getConcept(q);
    if (concept && out.indexOf(concept) < 0) out.push(concept);
    var raw = Array.isArray(q.tags) ? q.tags : [];
    raw.concat(Array.isArray(fq.tags) ? fq.tags : []).forEach(function (t) {
      if (typeof t !== 'string' || !t) return;
      if (/^module_\d+$/.test(t)) return;
      if (!/[\u4e00-\u9fa5]/.test(t)) return; // 英文 slug 对用户无意义
      if (out.indexOf(t) >= 0) return;
      out.push(t);
    });
    var mod = _getModule(q);
    if (!out.length && mod) out.push(_getModuleLabel(mod));
    return out.slice(0, 4);
  }
  function _getQId(q) {
    return q.qId || q.id || q.question_id || '';
  }

  function _renderBarChart(data) {
    var max = 0;
    data.forEach(function(d) { if (d.value > max) max = d.value; });
    if (max === 0) return '<div class="rd-empty-mini">暂无数据</div>';
    var barW = 34, gap = 18, padL = 24, padB = 24, padT = 14;
    var h = 150;
    var n = data.length;
    var totalW = padL * 2 + n * barW + (n - 1) * gap;
    var chartH = h - padB - padT;
    var bars = '';
    data.forEach(function(d, i) {
      var bh = (d.value / max) * chartH;
      var x = padL + i * (barW + gap);
      var y = h - padB - bh;
      bars += '<rect x="' + x + '" y="' + y.toFixed(1) + '" width="' + barW + '" height="' + bh.toFixed(1) + '" rx="3" fill="' + d.color + '"/>';
      bars += '<text x="' + (x + barW/2) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle" font-size="11" fill="#666">' + d.value + '</text>';
      bars += '<text x="' + (x + barW/2) + '" y="' + (h - 6) + '" text-anchor="middle" font-size="11" fill="#666">' + _esc(d.label) + '</text>';
    });
    return '<svg width="' + totalW + '" height="' + h + '" viewBox="0 0 ' + totalW + ' ' + h + '">' + bars + '</svg>';
  }

  function _renderPieChart(data) {
    var total = 0;
    data.forEach(function(d) { total += d.value; });
    if (total === 0) return '<div class="rd-empty-mini">暂无数据</div>';
    var cx = 70, cy = 70, r = 62;
    var startAngle = -Math.PI / 2;
    var paths = '';
    data.forEach(function(d) {
      if (d.value <= 0) return;
      var angle = (d.value / total) * Math.PI * 2;
      var endAngle = startAngle + angle;
      if (angle >= Math.PI * 2 - 1e-6) {
        paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + d.color + '"/>';
      } else {
        var x1 = cx + r * Math.cos(startAngle);
        var y1 = cy + r * Math.sin(startAngle);
        var x2 = cx + r * Math.cos(endAngle);
        var y2 = cy + r * Math.sin(endAngle);
        var largeArc = angle > Math.PI ? 1 : 0;
        paths += '<path d="M' + cx + ',' + cy + ' L' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' A' + r + ',' + r + ' 0 ' + largeArc + ' 1 ' + x2.toFixed(2) + ',' + y2.toFixed(2) + ' Z" fill="' + d.color + '"/>';
      }
      startAngle = endAngle;
    });
    var legend = data.map(function(d) {
      return '<div class="rd-legend-item"><span class="rd-legend-dot" style="background:' + d.color + '"></span><span>' + _esc(d.label) + '</span><span class="rd-legend-val">' + d.value + '</span></div>';
    }).join('');
    return '<div class="rd-chart-wrap"><svg width="140" height="140" viewBox="0 0 140 140">' + paths + '</svg><div class="rd-legend">' + legend + '</div></div>';
  }

  function _renderDashboard(container) {
    var moduleCount = {};
    var errorTypeCount = { concept: 0, careless: 0, knowledge_gap: 0, logic: 0, unanalyzed: 0 };
    var analyzedCount = 0;
    var masteredCount = 0;
    _list.forEach(function(q) {
      var mod = _getModule(q) || 'unclassified';
      moduleCount[mod] = (moduleCount[mod] || 0) + (q.wrongCount || 1);
      var a = _getAnalysis(_getQId(q));
      if (a && a.errorType && ERROR_TYPE_LABELS[a.errorType]) {
        errorTypeCount[a.errorType]++;
        analyzedCount++;
      } else {
        errorTypeCount.unanalyzed++;
      }
      var m = _getMastery(_getQId(q));
      if (m.mastered) masteredCount++;
    });

    var barData = Object.keys(moduleCount).sort(function(a, b) { return moduleCount[b] - moduleCount[a]; }).slice(0, 6).map(function(mod) {
      return { label: _getModuleLabel(mod), value: moduleCount[mod], color: '#5a7d5c' };
    });
    var pieData = Object.keys(errorTypeCount).map(function(k) {
      return { label: ERROR_TYPE_LABELS[k], value: errorTypeCount[k], color: ERROR_TYPE_COLORS[k] };
    }).filter(function(d) { return d.value > 0; });

    container.innerHTML =
      '<div class="rd-stats-row">' +
        '<div class="rd-stat"><div class="rd-stat-num">' + _list.length + '</div><div class="rd-stat-label">错题总数</div></div>' +
        '<div class="rd-stat"><div class="rd-stat-num">' + analyzedCount + '</div><div class="rd-stat-label">已深度分析</div></div>' +
        '<div class="rd-stat"><div class="rd-stat-num">' + masteredCount + '</div><div class="rd-stat-label">已掌握</div></div>' +
      '</div>' +
      '<div class="rd-dashboard">' +
        '<div class="rd-panel"><h3>按模块错误数</h3>' + _renderBarChart(barData) + '</div>' +
        '<div class="rd-panel"><h3>错误类型分布</h3>' + _renderPieChart(pieData) + '</div>' +
      '</div>';
  }

  function _sortedList() {
    return _list.slice().sort(function(a, b) {
      var wa = (a.wrongCount || 1), wb = (b.wrongCount || 1);
      if (wb !== wa) return wb - wa;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
  }

  function _renderList(container) {
    var items = _sortedList();
    if (items.length === 0) {
      container.innerHTML = '<div class="rd-empty">暂无错题记录。<br>去<a href="#/practice" data-route="/practice" style="color:var(--color-sage);font-weight:600;">练习</a>中挑战题目，答错的会自动收录，再来这里深度复盘。</div>';
      return;
    }
    var html = items.map(function(q) {
      var qid = _getQId(q);
      var txt = _getQuestionText(q);
      var concept = _getConcept(q);
      var a = _getAnalysis(qid);
      var m = _getMastery(qid);
      var tags = '';
      _getTagList(q).forEach(function (label) {
        tags += '<span class="rd-tag">' + _esc(_truncate(label, 16)) + '</span>';
      });
      if (a && a.errorType) tags += '<span class="rd-tag rd-tag--error" style="background:' + (ERROR_TYPE_COLORS[a.errorType] || '#888') + '">' + ERROR_TYPE_LABELS[a.errorType] + '</span>';
      if (m.mastered) tags += '<span class="rd-tag rd-tag--mastered">已掌握</span>';
      var countBadge = (q.wrongCount && q.wrongCount > 1) ? '<span class="rd-badge-count">错 ' + q.wrongCount + ' 次</span>' : '';
      return '<div class="rd-card" data-qid="' + _esc(qid) + '">' +
        '<p class="rd-card-title">' + _esc(_truncate(txt, 110)) + '</p>' +
        '<div class="rd-card-meta">' + _fmtDate(q.timestamp) + ' ' + countBadge + '</div>' +
        '<div class="rd-tags">' + tags + '</div>' +
      '</div>';
    }).join('');
    container.innerHTML = html;

    container.querySelectorAll('.rd-card').forEach(function(card) {
      card.addEventListener('click', function() { _expand(card.getAttribute('data-qid')); });
    });
  }

  function _findQuestion(qid) {
    for (var i = 0; i < _list.length; i++) {
      if (String(_getQId(_list[i])) === String(qid)) return _list[i];
    }
    return null;
  }

  function _expand(qid) {
    var q = _findQuestion(qid);
    if (!q) return;
    _expandedId = qid;
    var host = document.getElementById('rd-detail-host');
    if (!host) return;
    _renderDetail(host, q);
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function _renderDetail(host, q) {
    var qid = _getQId(q);
    var txt = _getQuestionText(q);
    var opts = _getOptions(q);
    var correct = _getCorrectAnswer(q);
    var userAns = _getUserAnswer(q);
    var concept = _getConcept(q);
    var mod = _getModule(q);

    var optsHtml = '';
    if (opts && Object.keys(opts).length) {
      optsHtml = '<div class="rd-options">';
      Object.keys(opts).forEach(function(k) {
        optsHtml += '<div><strong>' + _esc(k) + '.</strong> ' + _esc(opts[k]) + '</div>';
      });
      optsHtml += '</div>';
    }

    host.innerHTML =
      '<div class="rd-detail" id="rd-detail-card">' +
        '<h4>错题深度复盘</h4>' +
        '<div class="rd-q-text">' + _esc(txt) + '</div>' +
        optsHtml +
        '<div class="rd-answer-row">' +
          '<div class="rd-ans-wrong">你的答案：' + (userAns ? _esc(userAns) : '（未记录）') + '</div>' +
          '<div class="rd-ans-right">正确答案：' + (correct ? _esc(correct) : '（未记录）') + '</div>' +
        '</div>' +
        '<div id="rd-analysis-area">' + _renderAnalysisArea(q) + '</div>' +
        '<div class="rd-actions">' +
          '<button class="rd-btn" id="rd-analyze-btn">' + (_getAnalysis(qid) ? '重新分析' : 'AI 深度分析') + '</button>' +
          '<button class="rd-btn rd-btn--amber" id="rd-practice-btn">练习同类题</button>' +
          '<button class="rd-btn rd-btn--secondary" id="rd-collapse-btn">收起</button>' +
        '</div>' +
        '<div id="rd-practice-area"></div>' +
      '</div>';

    document.getElementById('rd-analyze-btn').addEventListener('click', function() { _doAnalyze(q); });
    document.getElementById('rd-practice-btn').addEventListener('click', function() { _doPractice(q); });
    document.getElementById('rd-collapse-btn').addEventListener('click', function() {
      host.replaceChildren();
      _expandedId = null;
    });
  }

  function _renderAnalysisArea(q) {
    var qid = _getQId(q);
    var a = _getAnalysis(qid);
    if (!a) {
      return '<div class="rd-loading">尚未分析，点击下方"AI 深度分析"开始复盘。</div>';
    }
    var html = '<div class="rd-analysis-box">';
    html += '<p><strong>错误类型：</strong><span class="rd-tag rd-tag--error" style="background:' + (ERROR_TYPE_COLORS[a.errorType] || '#888') + '">' + (ERROR_TYPE_LABELS[a.errorType] || a.errorType || '-') + '</span></p>';
    if (a.analysis) html += '<p><strong>原因分析：</strong>' + _esc(a.analysis) + '</p>';
    html += '</div>';
    if (a.suggestion) html += '<div class="rd-suggestion"><strong>改进建议：</strong>' + _esc(a.suggestion) + '</div>';
    if (a.similarConcepts && a.similarConcepts.length) {
      html += '<div class="rd-analysis-box" style="background:#eff6ff;border-left-color:#3b82f6;"><p><strong>相关/易混淆概念：</strong>' + a.similarConcepts.map(function(c) { return '<span class="rd-tag" style="background:#3b82f6">' + _esc(c) + '</span>'; }).join(' ') + '</p></div>';
    }
    return html;
  }

  async function _doAnalyze(q) {
    var qid = _getQId(q);
    var btn = document.getElementById('rd-analyze-btn');
    var area = document.getElementById('rd-analysis-area');
    if (btn) { btn.disabled = true; btn.textContent = '分析中...'; }
    if (area) area.innerHTML = '<div class="rd-loading">AI 正在分析错误原因，请稍候...</div>';
    try {
      var body = {
        question: _getQuestionText(q),
        userAnswer: _getUserAnswer(q),
        correctAnswer: _getCorrectAnswer(q),
        options: _getOptions(q)
      };
      var resp = await fetch('/analyze-wrong', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'AI 分析失败');
      var analysis = data.analysis || {};
      analysis.ts = Date.now();
      _setAnalysis(qid, analysis);
      if (area) area.innerHTML = _renderAnalysisArea(q);
      // 刷新仪表盘（错误类型分布变化）与列表标签
      var dashHost = document.getElementById('rd-dashboard-host');
      if (dashHost) _renderDashboard(dashHost);
      var listEl = document.getElementById('rd-list');
      if (listEl) _renderList(listEl);
    } catch (e) {
      if (area) area.innerHTML = '<div class="rd-loading" style="color:#b91c1c;">分析失败：' + _escerrText(e) + '</div>' + _renderAnalysisArea(q);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = _getAnalysis(qid) ? '重新分析' : 'AI 深度分析'; }
    }
  }

  async function _loadSimilar(concept, mod) {
    if (typeof window.fetchQuestionsBatch !== 'function') return [];
    var modulesArr = mod ? [mod] : null;
    if (concept) {
      var qs = await window.fetchQuestionsBatch({ concept: concept, count: 3, modules: modulesArr });
      if (qs && qs.length) return qs;
    }
    if (modulesArr) {
      return await window.fetchQuestionsBatch({ count: 3, modules: modulesArr });
    }
    return await window.fetchQuestionsBatch({ count: 3 });
  }

  async function _doPractice(q) {
    var qid = _getQId(q);
    var concept = _getConcept(q);
    var mod = _getModule(q);
    var area = document.getElementById('rd-practice-area');
    var btn = document.getElementById('rd-practice-btn');
    if (btn) { btn.disabled = true; }
    if (area) area.innerHTML = '<div class="rd-practice"><h5>同类题练习</h5><div class="rd-loading">正在根据知识点「' + _esc(concept || _getModuleLabel(mod)) + '」推荐 3 道同类题...</div></div>';
    try {
      var questions = await _loadSimilar(concept, mod);
    } catch (e) {
      questions = [];
    }
    if (btn) { btn.disabled = false; }
    if (!questions || questions.length === 0) {
      if (area) {
        var box = document.createElement('div');
        box.className = 'rd-practice';
        var head = document.createElement('h5');
        head.textContent = '同类题练习';
        var tip = document.createElement('p');
        tip.className = 'rd-loading';
        tip.textContent = '这道题暂时没有匹配到同类题（题库可能还没加载完）。可以先去专项练习按学科自选，或重试一次。';
        var acts = document.createElement('div');
        acts.className = 'rd-practice-actions';
        var link = document.createElement('a');
        link.className = 'rd-practice-btn';
        link.href = '#/practice';
        link.textContent = '去专项练习';
        var retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'rd-practice-btn';
        retry.textContent = '重试';
        retry.addEventListener('click', function () { _doPractice(q); });
        acts.appendChild(link);
        acts.appendChild(retry);
        box.appendChild(head);
        box.appendChild(tip);
        box.appendChild(acts);
        area.textContent = '';
        area.appendChild(box);
      }
      return;
    }
    if (area) area.innerHTML = '<div class="rd-practice"><h5>同类题练习（共 ' + questions.length + ' 题）</h5><div id="rd-practice-list"></div></div>';
    var listHost = document.getElementById('rd-practice-list');
    _renderPracticeList(listHost, questions, qid);
  }

  function _renderPracticeList(host, questions, qid) {
    var idx = 0;
    function renderCurrent() {
      var qItem = questions[idx];
      var subs = qItem.subQuestions || [];
      var stem = qItem.question || qItem.stem || '';
      var picks = {}; // label -> bool
      var submitted = false;

      var body = '<div class="rd-practice-q">' + (idx + 1) + '. ' + _esc(stem) + '</div>';
      if (subs.length) {
        body += subs.map(function(s) {
          return '<div class="rd-practice-opt" data-label="' + _esc(s.label) + '">' +
            '<span class="rd-practice-opt-text"><strong>' + _esc(s.label) + '.</strong> ' + _esc(s.text) + '</span>' +
            '<span class="rd-practice-toggle">' +
              '<button data-pick="true">√</button>' +
              '<button data-pick="false">×</button>' +
            '</span>' +
          '</div>';
        }).join('');
      } else {
        body += '<div class="rd-practice-opt"><span class="rd-practice-opt-text">（该题无选项，跳过）</span></div>';
      }
      body += '<div class="rd-actions">' +
        '<button class="rd-btn" id="rd-submit-' + idx + '">提交</button>' +
        '<button class="rd-btn rd-btn--secondary" id="rd-next-' + idx + '" style="display:none;">' + (idx < questions.length - 1 ? '下一题' : '完成练习') + '</button>' +
      '</div>' +
      '<div id="rd-result-' + idx + '"></div>';
      host.innerHTML = body;

      host.querySelectorAll('.rd-practice-opt').forEach(function(opt) {
        var label = opt.getAttribute('data-label');
        opt.querySelectorAll('button').forEach(function(b) {
          b.addEventListener('click', function() {
            if (submitted) return;
            opt.querySelectorAll('button').forEach(function(x) { x.classList.remove('active'); });
            b.classList.add('active');
            picks[label] = (b.getAttribute('data-pick') === 'true');
          });
        });
      });

      var submitBtn = document.getElementById('rd-submit-' + idx);
      var nextBtn = document.getElementById('rd-next-' + idx);
      if (submitBtn) submitBtn.addEventListener('click', function() {
        if (submitted) return;
        submitted = true;
        var allRight = true;
        var wrongCount = 0;
        var detailHtml = '';
        subs.forEach(function(s) {
          var userPick = picks[s.label];
          var right = (userPick === s.answer);
          if (!right) { allRight = false; wrongCount++; }
          detailHtml += '<div><strong>' + _esc(s.label) + '.</strong> ' + _esc(s.text) +
            ' → 你选 <strong>' + (userPick === undefined ? '—' : (userPick ? '√' : '×')) + '</strong>' +
            ' / 正确 <strong>' + (s.answer ? '√' : '×') + '</strong>' +
            (right ? ' ✓' : ' ✗') + '</div>';
        });
        _recordMastery(qid, allRight);
        var resultEl = document.getElementById('rd-result-' + idx);
        if (resultEl) {
          resultEl.innerHTML = '<div class="rd-practice-result ' + (allRight ? 'rd-practice-result--pass' : 'rd-practice-result--fail') + '">' +
            '<strong>' + (allRight ? '全对 · 已记录为掌握' : (wrongCount + ' 题待复习') ) + '</strong>' + detailHtml +
            (qItem.explanation ? '<div style="margin-top:6px;color:var(--text-secondary,#555);">解析：' + _esc(qItem.explanation) + '</div>' : '') +
          '</div>';
        }
        if (submitBtn) submitBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = '';
        // 刷新仪表盘掌握数 + 列表标签
        var dashHost = document.getElementById('rd-dashboard-host');
        if (dashHost) _renderDashboard(dashHost);
        var listEl = document.getElementById('rd-list');
        if (listEl) _renderList(listEl);
      });
      if (nextBtn) nextBtn.addEventListener('click', function() {
        if (idx < questions.length - 1) {
          idx++;
          renderCurrent();
        } else {
          var m = _getMastery(qid);
          host.innerHTML = '<div class="rd-practice-result rd-practice-result--pass">练习完成！本题掌握度：' + m.correct + '/' + m.attempts + (m.mastered ? '（已掌握）' : '') + '</div>';
        }
      });
    }
    renderCurrent();
  }

  // 现作为「错题与复盘」页的「深度复盘」Tab 内嵌渲染，不再输出独立页头
  function initReviewDeep(target) {
    _addStyles();
    target = target || document.getElementById('page-content');
    if (!target) return;
    target.innerHTML =
      '<div class="rd-container">' +
        '<div id="rd-dashboard-host"><div class="rd-loading">加载中...</div></div>' +
        '<div id="rd-list"><div class="rd-loading">加载中...</div></div>' +
        '<div id="rd-detail-host"></div>' +
      '</div>';

    _list = _loadWrongQuestions();
    _renderDashboard(document.getElementById('rd-dashboard-host'));
    _renderList(document.getElementById('rd-list'));
  }

  window.initReviewDeep = initReviewDeep;
})();
