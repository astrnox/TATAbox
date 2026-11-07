/**
 * ============================================================
 * TATABOX — 学习管理中心 (/study)
 *  - 6 个 Tab：课程表 / 待办 / 番茄钟 / 笔记 / 倒计时 / 工具
 *  - Tab 栏吸顶
 *  - 底部"今日学习节奏"常驻速览卡片
 *  - 待办与番茄钟数据关联（番茄完成后自动标记待办进度）
 *  - 工具 Tab 聚合错题流程 / 虚拟实验室等入口
 * ============================================================
 */

(function() {
  'use strict';

  var _tasks = [];
  var _sessions = [];
  var _notes = [];
  var _schedule = { items: [] };
  var _activeTab = 'schedule';
  var _pomodoroTimer = null;
  var _pomodoroSeconds = 25 * 60;
  var _pomodoroRunning = false;
  var _pomodoroMode = 25;            // 当前模式（分钟）
  var _pomodoroLinkedTask = null;    // 关联的待办任务 id
  var _examDate = localStorage.getItem('tatabox_exam_date') || '';
  var _reviewCount = 0;

  /* ---------- 样式（Trae 设计 Token） ---------- */
  function _addStyles() {
    if (document.getElementById('study-styles')) return;
    var style = document.createElement('style');
    style.id = 'study-styles';
    style.textContent = `
      .st-container { max-width: 960px; margin: 0 auto; padding: 0 20px 120px; }

      /* Tab 栏吸顶 */
      .st-tabs-wrap {
        position: sticky;
        top: var(--header-height, 64px);
        z-index: 50;
        background: var(--color-cream, #faf7f2);
        padding: 12px 0;
        margin: 0 -20px 16px;
        padding-left: 20px;
        padding-right: 20px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }
      .st-tabs { display: flex; gap: 6px; flex-wrap: wrap; max-width: 920px; margin: 0 auto; }
      .st-tab {
        padding: 8px 18px; border-radius: 16px; cursor: pointer;
        font-size: 0.9rem; font-weight: 500;
        color: var(--text-secondary, #4a4a4a);
        background: transparent; border: 1px solid transparent;
        transition: all 0.2s ease;
        font-family: var(--font-sans, sans-serif);
      }
      .st-tab:hover { background: rgba(90,125,92,0.08); color: var(--color-sage, #5a7d5c); }
      .st-tab.active {
        background: var(--color-sage, #5a7d5c); color: #fff;
        box-shadow: var(--shadow-md);
      }

      .st-card {
        background: var(--color-white, #fff); border-radius: 12px;
        padding: 20px; margin-bottom: 14px;
        box-shadow: var(--shadow-sm);
        border: 1px solid var(--border-light, #eee);
      }
      .st-card h3 { margin: 0 0 14px; font-size: 1.05rem; color: var(--color-deep, #1a3a2a); font-family: var(--font-serif, serif); }

      .st-task { display: flex; align-items: flex-start; gap: 10px; padding: 10px; border: 1px solid var(--border-light, #e5e7eb); border-radius: 8px; margin-bottom: 8px; transition: background 0.2s; }
      .st-task:hover { background: rgba(90,125,92,0.03); }
      .st-task.done { opacity: 0.55; }
      .st-task.done .st-task-title { text-decoration: line-through; }
      .st-task-priority { width: 4px; height: 40px; border-radius: 2px; flex-shrink: 0; }
      .st-task-priority.high { background: var(--color-error, #c0553a); }
      .st-task-priority.medium { background: var(--color-warning, #e8a830); }
      .st-task-priority.low { background: var(--color-success, #3a8c5c); }
      .st-task-content { flex: 1; min-width: 0; }
      .st-task-title { font-weight: 600; color: var(--text-primary, #222); }
      .st-task-meta { font-size: 0.78rem; color: var(--text-muted, #8a8a8a); margin-top: 3px; }
      .st-task-actions { display: flex; gap: 6px; flex-shrink: 0; }

      .st-btn { padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.85rem; font-weight: 500; background: var(--color-sage, #5a7d5c); color: #fff; transition: all 0.2s; font-family: var(--font-sans, sans-serif); }
      .st-btn:hover { background: var(--color-mid, #2d5a3f); }
      .st-btn--secondary { background: var(--color-cream-dark, #f0ebe0); color: var(--text-primary, #374151); }
      .st-btn--secondary:hover { background: var(--border-light, #e5e7eb); }
      .st-btn--danger { background: var(--color-error, #c0553a); color: #fff; }
      .st-btn--amber { background: var(--color-amber, #c4956a); color: #1a2f1d; }
      .st-btn--small { padding: 4px 10px; font-size: 0.75rem; }

      .st-input, .st-select { width: 100%; padding: 9px 12px; border: 1px solid var(--border-light, #ddd); border-radius: 8px; font-size: 0.9rem; background: var(--color-white, #fff); color: var(--text-primary, #222); font-family: var(--font-sans, sans-serif); box-sizing: border-box; }
      .st-input:focus, .st-select:focus { outline: none; border-color: var(--color-sage, #5a7d5c); }
      .st-form-row { display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
      .st-form-row > * { flex: 1; min-width: 120px; }

      /* 番茄钟 */
      .st-pomodoro { text-align: center; padding: 36px 20px; }
      .st-pomodoro-time { font-size: 4.5rem; font-weight: 700; color: var(--color-deep, #1a3a2a); font-family: var(--font-mono, monospace); letter-spacing: 0.02em; line-height: 1; }
      .st-pomodoro-mode { color: var(--text-muted, #8a8a8a); font-size: 0.85rem; margin-top: 6px; letter-spacing: 0.08em; text-transform: uppercase; }
      .st-pomodoro-controls { display: flex; justify-content: center; gap: 10px; margin-top: 24px; flex-wrap: wrap; }
      .st-pomo-modes { display: flex; gap: 6px; justify-content: center; margin-top: 14px; flex-wrap: wrap; }
      .st-pomo-mode-btn { padding: 5px 12px; border-radius: 8px; border: 1px solid var(--border-light, #ddd); background: transparent; cursor: pointer; font-size: 0.8rem; color: var(--text-secondary, #4a4a4a); }
      .st-pomo-mode-btn.active { background: var(--color-sage, #5a7d5c); color: #fff; border-color: var(--color-sage, #5a7d5c); }
      .st-pomo-link { margin-top: 16px; padding: 12px; background: var(--color-cream-dark, #f0ebe0); border-radius: 8px; font-size: 0.85rem; }
      .st-pomo-stat { color: var(--text-muted, #8a8a8a); font-size: 0.85rem; margin-top: 14px; }

      /* 课程表 */
      .st-schedule-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
      .st-schedule-table th, .st-schedule-table td { border: 1px solid var(--border-light, #e5e7eb); padding: 8px; text-align: left; vertical-align: top; }
      .st-schedule-table th { background: var(--color-cream-dark, #f9fafb); width: 70px; color: var(--color-deep, #1a3a2a); font-family: var(--font-serif, serif); }
      .st-schedule-item { padding: 4px 6px; border-radius: 4px; margin-bottom: 4px; font-size: 0.78rem; color: #fff; display: flex; align-items: center; justify-content: space-between; gap: 4px; }

      /* 倒计时 */
      .st-countdown { text-align: center; padding: 30px; }
      .st-countdown-number { font-size: 3rem; font-weight: 700; color: var(--color-deep, #1a3a2a); font-family: var(--font-serif, serif); }
      .st-countdown-number .unit { font-size: 1rem; color: var(--text-muted, #8a8a8a); margin-left: 6px; }

      .st-empty { text-align: center; padding: 36px 20px; color: var(--text-muted, #8a8a8a); font-size: 0.9rem; }

      .st-note { padding: 14px; border: 1px solid var(--border-light, #e5e7eb); border-radius: 8px; margin-bottom: 8px; transition: border-color 0.2s; }
      .st-note:hover { border-color: var(--color-olive, #8ba888); }
      .st-note-title { font-weight: 600; color: var(--color-deep, #1a3a2a); }
      .st-note-meta { font-size: 0.78rem; color: var(--text-muted, #8a8a8a); margin-top: 4px; }

      /* 底部"今日学习节奏"常驻卡片 */
      .st-rhythm {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        z-index: 40;
        background: var(--color-white, #fff);
        border-top: 1px solid var(--border-light, #eee);
        box-shadow: var(--shadow-lg);
        padding: 14px 20px;
      }
      .st-rhythm-inner { max-width: 920px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
      .st-rhythm-item { text-align: center; cursor: pointer; padding: 8px 4px; border-radius: 8px; transition: background 0.2s; }
      .st-rhythm-item:hover { background: var(--color-cream-dark, #f0ebe0); }
      .st-rhythm-value { font-size: 1.5rem; font-weight: 700; color: var(--color-sage, #5a7d5c); font-family: var(--font-serif, serif); line-height: 1.1; }
      .st-rhythm-value .unit { font-size: 0.7rem; color: var(--text-muted, #8a8a8a); font-weight: 400; margin-left: 2px; }
      .st-rhythm-label { font-size: 0.72rem; color: var(--text-muted, #8a8a8a); margin-top: 3px; letter-spacing: 0.04em; }

      /* 工具 Tab */
      .st-tools-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
      .st-tool-card { padding: 20px; border: 1px solid var(--border-light, #eee); border-radius: 12px; cursor: pointer; transition: all 0.25s cubic-bezier(0.22,1,0.36,1); background: var(--color-white, #fff); display: flex; flex-direction: column; gap: 8px; }
      .st-tool-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--color-olive, #8ba888); }
      .st-tool-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(90,125,92,0.08); color: var(--color-sage, #5a7d5c); }
      .st-tool-name { font-weight: 700; color: var(--color-deep, #1a3a2a); font-size: 1rem; font-family: var(--font-serif, serif); }
      .st-tool-desc { font-size: 0.82rem; color: var(--text-muted, #8a8a8a); line-height: 1.5; }
      .st-tool-flow { font-size: 0.72rem; color: var(--color-amber, #c4956a); font-family: var(--font-mono, monospace); margin-top: 4px; }

      @media (max-width: 640px) {
        .st-pomodoro-time { font-size: 3.2rem; }
        .st-schedule-table { font-size: 0.78rem; }
        .st-rhythm-inner { grid-template-columns: repeat(4, 1fr); gap: 4px; }
        .st-rhythm-value { font-size: 1.2rem; }
        .st-rhythm-label { font-size: 0.65rem; }
        .st-container { padding-bottom: 110px; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------- 工具函数 ---------- */
  function _formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function _daysUntil(iso) {
    if (!iso) return null;
    var target = new Date(iso + 'T00:00:00');
    var now = new Date();
    now.setHours(0,0,0,0);
    var diff = Math.round((target - now) / (1000 * 60 * 60 * 24));
    return diff;
  }
  function _formatDuration(minutes) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    if (h && m) return h + 'h' + m + 'm';
    if (h) return h + '小时';
    if (m) return m + '分钟';
    return '0分钟';
  }
  function _isToday(iso) {
    if (!iso) return false;
    var d = new Date(iso);
    var n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }
  function _pomoCountToday() {
    return _sessions.filter(function(s) { return _isToday(s.start_time) && s.is_completed; }).length;
  }
  function _todayFocusMinutes() {
    return _sessions.filter(function(s) { return _isToday(s.start_time); }).reduce(function(sum, s) { return sum + (s.duration || 0); }, 0);
  }

  /* ---------- 数据加载 ---------- */
  async function _loadData() {
    if (typeof window.getStudyTasks === 'function') _tasks = await window.getStudyTasks();
    if (typeof window.getFocusSessions === 'function') _sessions = await window.getFocusSessions(7);
    if (typeof window.getNotes === 'function') _notes = await window.getNotes();
    if (typeof window.getSchedule === 'function') {
      var res = await window.getSchedule();
      if (res && res.ok) _schedule = res;
    }
    // 复习题数（来自错题本）
    if (typeof window.getReviewQueue === 'function') {
      try { var rq = await window.getReviewQueue(); _reviewCount = (rq && rq.items) ? rq.items.length : 0; }
      catch(e) { _reviewCount = 0; }
    } else if (typeof window.getWrongQuestions === 'function') {
      try { var wq = await window.getWrongQuestions(); _reviewCount = wq && wq.length ? wq.length : 0; }
      catch(e) { _reviewCount = 0; }
    }
  }

  /* ---------- Tab 栏 ---------- */
  function _renderTabs(container) {
    // 课程表 / 待办 / 番茄钟 / 笔记 / 倒计时 / 工具 / 管理
    var tabs = [
      { id: 'schedule',  label: '课程表' },
      { id: 'tasks',     label: '待办' },
      { id: 'pomodoro',  label: '番茄钟' },
      { id: 'notes',     label: '笔记' },
      { id: 'countdown', label: '倒计时' },
      { id: 'tools',     label: '工具' },
      { id: 'hub',       label: '管理' }
    ];
    container.innerHTML = tabs.map(function(t) {
      return '<button class="st-tab ' + (_activeTab === t.id ? 'active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
    }).join('');
    container.querySelectorAll('.st-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _activeTab = btn.dataset.tab;
        _render();
      });
    });
  }

  /* ---------- 主渲染 ---------- */
  function _render() {
    var content = document.getElementById('st-content');
    if (!content) return;
    _renderTabs(document.getElementById('st-tabs'));
    switch (_activeTab) {
      case 'schedule':  _renderSchedule(content); break;
      case 'tasks':     _renderTasks(content); break;
      case 'pomodoro':  _renderPomodoro(content); break;
      case 'notes':     _renderNotes(content); break;
      case 'countdown': _renderCountdown(content); break;
      case 'tools':     _renderTools(content); break;
      case 'hub':       _renderHub(content); break;
      default:          _renderOverview(content); break;
    }
    _renderRhythm();
  }

  /* ---------- 学习总览（默认 Tab） ---------- */
  function _renderOverview(container) {
    var overdueTasks = _tasks.filter(function(t) { return t.status !== 'done' && t.status !== 'archived' && t.due_date && new Date(t.due_date) < new Date(); }).length;
    var todoCount = _tasks.filter(function(t) { return t.status !== 'done' && t.status !== 'archived'; }).length;
    var pomoToday = _pomoCountToday();
    var focusMin = _todayFocusMinutes();
    var days = _daysUntil(_examDate);

    container.innerHTML = '<div class="st-card">' +
      '<h3>今天：' + todoCount + ' 个待办 · 番茄 ' + pomoToday + ' 个 · 专注 ' + _formatDuration(focusMin) + '</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin-top:12px;">' +
        '<div class="st-stat-box"><div class="st-stat-value">' + todoCount + '</div><div class="st-stat-label">待办任务</div></div>' +
        '<div class="st-stat-box"><div class="st-stat-value">' + pomoToday + '</div><div class="st-stat-label">今日番茄</div></div>' +
        '<div class="st-stat-box"><div class="st-stat-value">' + _formatDuration(focusMin) + '</div><div class="st-stat-label">今日专注</div></div>' +
        '<div class="st-stat-box"><div class="st-stat-value">' + (days !== null ? days : '—') + '</div><div class="st-stat-label">距联考</div></div>' +
      '</div>' +
      (overdueTasks > 0 ? '<div class="bq-note bq-note--danger" style="margin-top:16px;"><span class="bq-note__icon">' + BQ_ICONS.alert + '</span><span>有 ' + overdueTasks + ' 个待办已逾期，请尽快处理</span></div>' : '') +
    '</div>' +
    '<div class="st-card">' +
      '<h3>快速入口</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:8px;">' +
        '<button class="st-btn" data-jump-tab="tasks">待办列表</button>' +
        '<button class="st-btn" data-jump-tab="pomodoro">开始番茄钟</button>' +
        '<button class="st-btn" data-jump-tab="notes">学习笔记</button>' +
        '<button class="st-btn" data-jump-tab="countdown">考试倒计时</button>' +
      '</div>' +
    '</div>';

    // 绑定快速入口点击
    container.querySelectorAll('[data-jump-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _activeTab = btn.dataset.jumpTab;
        _render();
      });
    });
  }

  /* ---------- 底部"今日学习节奏"常驻卡片 ---------- */
  function _renderRhythm() {
    var el = document.getElementById('st-rhythm');
    if (!el) return;
    var todoCount = _tasks.filter(function(t) { return t.status !== 'done' && t.status !== 'archived'; }).length;
    var pomoCount = _pomoCountToday();
    var days = _daysUntil(_examDate);

    el.innerHTML = '<div class="st-rhythm-inner">' +
      '<div class="st-rhythm-item" data-jump="tasks">' +
        '<div class="st-rhythm-value">' + todoCount + '<span class="unit">件</span></div>' +
        '<div class="st-rhythm-label">待办</div></div>' +
      '<div class="st-rhythm-item" data-jump="pomodoro">' +
        '<div class="st-rhythm-value">' + pomoCount + '<span class="unit">个</span></div>' +
        '<div class="st-rhythm-label">番茄</div></div>' +
      '<div class="st-rhythm-item" data-jump="wrongbook">' +
        '<div class="st-rhythm-value">' + _reviewCount + '<span class="unit">题</span></div>' +
        '<div class="st-rhythm-label">复习</div></div>' +
      '<div class="st-rhythm-item" data-jump="hub">' +
        '<div class="st-rhythm-label">管理</div></div>' +
      '<div class="st-rhythm-item" data-jump="countdown">' +
        '<div class="st-rhythm-value">' + (days !== null ? days : '—') + '<span class="unit">天</span></div>' +
        '<div class="st-rhythm-label">联考</div></div>' +
    '</div>';

    el.querySelectorAll('.st-rhythm-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var jump = item.dataset.jump;
        if (jump === 'wrongbook') {
          window.location.hash = '#/wrongbook';
        } else {
          _activeTab = jump;
          _render();
          var top = document.getElementById('st-tabs-wrap');
          if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  /* ---------- 课程表 ---------- */
  function _renderSchedule(container) {
    var days = ['周日','周一','周二','周三','周四','周五','周六'];
    // 周一至周日排列
    var order = [1,2,3,4,5,6,0];
    var rows = order.map(function(idx) {
      var items = _schedule.items.filter(function(i) { return i.day_of_week === idx; }).sort(function(a,b){return (a.start_time||'').localeCompare(b.start_time||'');});
      return '<tr><th>' + days[idx] + '</th><td>' + (items.length ? items.map(function(i) {
        return '<div class="st-schedule-item" style="background:' + (i.color || '#5a7d5c') + '">' +
          '<span><strong>' + (i.start_time || '').slice(0,5) + '-' + (i.end_time || '').slice(0,5) + '</strong> ' + (i.subject || '') +
          (i.location ? ' @' + i.location : '') + '</span>' +
          '<button class="st-btn st-btn--secondary st-btn--small st-del-schedule" data-id="' + i.id + '" style="background:rgba(255,255,255,0.25);color:#fff;padding:2px 6px;">×</button>' +
        '</div>';
      }).join('') : '<span class="bq-text-muted">—</span>') + '</td></tr>';
    }).join('');

    container.innerHTML = '<div class="st-card"><h3>添加课程</h3>' +
      '<div class="st-form-row">' +
        '<select class="st-select" id="st-sched-day">' + order.map(function(i){return '<option value="' + i + '">' + days[i] + '</option>';}).join('') + '</select>' +
        '<input type="time" class="st-input" id="st-sched-start" value="08:00">' +
        '<input type="time" class="st-input" id="st-sched-end" value="08:45">' +
        '<input type="text" class="st-input" id="st-sched-subject" placeholder="科目">' +
      '</div>' +
      '<div class="st-form-row">' +
        '<input type="text" class="st-input" id="st-sched-location" placeholder="地点（可选）">' +
        '<button class="st-btn" id="st-add-schedule">添加课程</button>' +
      '</div></div>' +
      '<div class="st-card"><h3>本周课程</h3><table class="st-schedule-table"><tbody>' + rows + '</tbody></table></div>';

    document.getElementById('st-add-schedule').addEventListener('click', _addScheduleItem);
    container.querySelectorAll('.st-del-schedule').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); _deleteScheduleItem(btn.dataset.id); });
    });
  }

  async function _addScheduleItem() {
    var item = {
      day_of_week: parseInt(document.getElementById('st-sched-day').value, 10),
      start_time: document.getElementById('st-sched-start').value + ':00',
      end_time: document.getElementById('st-sched-end').value + ':00',
      subject: document.getElementById('st-sched-subject').value.trim(),
      location: document.getElementById('st-sched-location').value.trim()
    };
    if (!item.subject) return alert('请输入科目');
    var res = await window.saveScheduleItem(item);
    if (!res || !res.ok) return alert('添加失败：' + errText(res));
    await _loadData();
    _render();
  }

  async function _deleteScheduleItem(id) {
    if (!confirm('删除该课程？')) return;
    var res = await window.deleteScheduleItem(id);
    if (!res || !res.ok) return alert('删除失败：' + errText(res));
    await _loadData();
    _render();
  }

  /* ---------- 待办 ---------- */
  function _renderTasks(container) {
    var todo = _tasks.filter(function(t) { return t.status !== 'done' && t.status !== 'archived'; });
    var done = _tasks.filter(function(t) { return t.status === 'done'; });
    var aiBtn = (typeof window.LearningHub !== 'undefined' && window.LearningHub._showAIBreakdownDialog)
      ? '<button class="st-btn" id="st-ai-breakdown-btn" style="background:#5a7d5c;color:#fff;border:none;margin-left:8px;">AI 目标细化</button>'
      : '';
    container.innerHTML = '<div class="st-card"><h3>新建待办 ' + aiBtn + '</h3>' +
      '<div class="st-form-row"><input type="text" class="st-input" id="st-task-title" placeholder="任务名称，如：复习必修1第5章">' +
      '<select class="st-select" id="st-task-priority"><option value="low">低优先级</option><option value="medium" selected>中优先级</option><option value="high">高优先级</option></select>' +
      '<input type="date" class="st-input" id="st-task-due"></div>' +
      '<button class="st-btn" id="st-add-task">+ 添加待办</button></div>' +
      '<div class="st-card"><h3>进行中 (' + todo.length + ')</h3>' + (todo.length ? todo.map(function(t) {
        return '<div class="st-task"><div class="st-task-priority ' + (t.priority||'medium') + '"></div><div class="st-task-content"><div class="st-task-title">' + (t.title||'') + '</div>' +
          '<div class="st-task-meta">' + (t.due_date ? '截止 ' + _formatDate(t.due_date) : '无截止日期') +
          (t.pomodoro_count ? ' · 已专注 ' + t.pomodoro_count + ' 个番茄' : '') + '</div></div>' +
          '<div class="st-task-actions">' +
            '<button class="st-btn st-btn--small st-pomo-task" data-id="' + t.id + '" title="用番茄钟专注此任务">专注</button>' +
            '<button class="st-btn st-btn--secondary st-btn--small st-done-task" data-id="' + t.id + '">完成</button>' +
            '<button class="st-btn st-btn--danger st-btn--small st-delete-task" data-id="' + t.id + '">删除</button>' +
          '</div></div>';
      }).join('') : '<div class="st-empty">暂无待办任务，开始规划你的学习吧</div>') + '</div>' +
      '<div class="st-card"><h3>已完成 (' + done.length + ')</h3>' + (done.length ? done.slice(0, 8).map(function(t) {
        return '<div class="st-task done"><div class="st-task-content"><div class="st-task-title">' + (t.title||'') + '</div></div></div>';
      }).join('') : '<div class="st-empty">暂无已完成任务</div>') + '</div>';

    document.getElementById('st-add-task').addEventListener('click', _addTask);
    var aiBtnEl = document.getElementById('st-ai-breakdown-btn');
    if (aiBtnEl) {
      aiBtnEl.addEventListener('click', function () {
        if (window.LearningHub && typeof window.LearningHub._showAIBreakdownDialog === 'function') {
          window.LearningHub._showAIBreakdownDialog();
        } else {
          alert('学习管理中心未加载，无法使用 AI 细化');
        }
      });
    }
    container.querySelectorAll('.st-done-task').forEach(function(btn) {
      btn.addEventListener('click', function() { _completeTask(btn.dataset.id); });
    });
    container.querySelectorAll('.st-delete-task').forEach(function(btn) {
      btn.addEventListener('click', function() { _deleteTask(btn.dataset.id); });
    });
    container.querySelectorAll('.st-pomo-task').forEach(function(btn) {
      btn.addEventListener('click', function() {
        // 待办可关联番茄钟 —— 点击后跳转番茄钟并关联该任务
        _pomodoroLinkedTask = btn.dataset.id;
        _activeTab = 'pomodoro';
        _render();
      });
    });
  }

  async function _addTask() {
    var title = document.getElementById('st-task-title').value.trim();
    if (!title) return alert('请输入任务名称');
    var res = await window.addStudyTask({
      title: title,
      priority: document.getElementById('st-task-priority').value,
      due_date: document.getElementById('st-task-due').value ? new Date(document.getElementById('st-task-due').value).toISOString() : null
    });
    if (!res || !res.ok) return alert('添加失败：' + errText(res));
    await _loadData();
    _render();
  }

  async function _completeTask(id) {
    var res = await window.updateStudyTask(id, { status: 'done' });
    if (!res || !res.ok) return alert('操作失败：' + errText(res));
    await _loadData();
    _render();
  }

  async function _deleteTask(id) {
    if (!confirm('删除该任务？')) return;
    var res = await window.deleteStudyTask(id);
    if (!res || !res.ok) return alert('删除失败：' + errText(res));
    await _loadData();
    _render();
  }

  /* ---------- 番茄钟（支持关联待办） ---------- */
  function _renderPomodoro(container) {
    var minutes = Math.floor(_pomodoroSeconds / 60);
    var seconds = _pomodoroSeconds % 60;
    var linkedTask = _pomodoroLinkedTask ? _tasks.filter(function(t){return String(t.id) === String(_pomodoroLinkedTask);})[0] : null;

    container.innerHTML = '<div class="st-card st-pomodoro"><h3>番茄钟</h3>' +
      '<div class="st-pomodoro-time">' + String(minutes).padStart(2,'0') + ':' + String(seconds).padStart(2,'0') + '</div>' +
      '<div class="st-pomodoro-mode">' + (_pomodoroRunning ? '专注中' : '准备就绪') + '</div>' +
      '<div class="st-pomo-modes">' +
        '<button class="st-pomo-mode-btn ' + (_pomodoroMode === 25 ? 'active' : '') + '" data-mode="25">25 / 5</button>' +
        '<button class="st-pomo-mode-btn ' + (_pomodoroMode === 45 ? 'active' : '') + '" data-mode="45">45 / 10</button>' +
        '<button class="st-pomo-mode-btn ' + (_pomodoroMode === 60 ? 'active' : '') + '" data-mode="60">60 / 15</button>' +
      '</div>' +
      '<div class="st-pomodoro-controls">' +
        '<button class="st-btn" id="st-pomo-start">' + (_pomodoroRunning ? '暂停' : '开始专注') + '</button>' +
        '<button class="st-btn st-btn--secondary" id="st-pomo-reset">重置</button>' +
      '</div>' +
      '<div class="st-pomo-link">' +
        '<label style="display:block;margin-bottom:6px;color:var(--text-secondary,#4a4a4a);">关联待办任务（番茄完成后自动标记进度）</label>' +
        '<select class="st-select" id="st-pomo-task">' +
          '<option value="">不关联</option>' +
          _tasks.filter(function(t){return t.status !== 'done' && t.status !== 'archived';}).map(function(t) {
            return '<option value="' + t.id + '"' + (_pomodoroLinkedTask && String(_pomodoroLinkedTask) === String(t.id) ? ' selected' : '') + '>' + (t.title||'').substring(0,30) + '</option>';
          }).join('') +
        '</select>' +
        (linkedTask ? '<div style="margin-top:8px;color:var(--color-sage,#5a7d5c);">当前关联：' + (linkedTask.title||'') + '</div>' : '') +
      '</div>' +
      '<div class="st-pomo-stat">今日已完成 ' + _pomoCountToday() + ' 个番茄 · 专注 ' + _formatDuration(_todayFocusMinutes()) + '</div>' +
      '</div>';

    document.getElementById('st-pomo-start').addEventListener('click', _togglePomodoro);
    document.getElementById('st-pomo-reset').addEventListener('click', _resetPomodoro);
    document.getElementById('st-pomo-task').addEventListener('change', function(e) {
      _pomodoroLinkedTask = e.target.value || null;
    });
    container.querySelectorAll('.st-pomo-mode-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (_pomodoroRunning) return alert('请先暂停或重置当前番茄钟');
        _pomodoroMode = parseInt(btn.dataset.mode, 10);
        _pomodoroSeconds = _pomodoroMode * 60;
        _render();
      });
    });
  }

  function _togglePomodoro() {
    if (_pomodoroRunning) {
      clearInterval(_pomodoroTimer);
      _pomodoroRunning = false;
    } else {
      _pomodoroRunning = true;
      _pomodoroTimer = setInterval(function() {
        _pomodoroSeconds--;
        if (_pomodoroSeconds <= 0) {
          _finishPomodoro();
        } else {
          // 仅更新时间显示，避免整页重渲染
          var el = document.querySelector('.st-pomodoro-time');
          if (el) {
            var m = Math.floor(_pomodoroSeconds / 60), s = _pomodoroSeconds % 60;
            el.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
          }
        }
      }, 1000);
    }
    _render();
  }

  function _resetPomodoro() {
    clearInterval(_pomodoroTimer);
    _pomodoroRunning = false;
    _pomodoroSeconds = _pomodoroMode * 60;
    _render();
  }

  async function _finishPomodoro() {
    clearInterval(_pomodoroTimer);
    _pomodoroRunning = false;
    var mins = _pomodoroMode;
    if (typeof window.addFocusSession === 'function') {
      await window.addFocusSession({ duration: mins, is_completed: true, task_id: _pomodoroLinkedTask || null });
    }
    // 番茄钟完成后自动标记待办进度
    if (_pomodoroLinkedTask) {
      var task = _tasks.filter(function(t){return String(t.id) === String(_pomodoroLinkedTask);})[0];
      if (task && typeof window.updateStudyTask === 'function') {
        var newCount = (task.pomodoro_count || 0) + 1;
        await window.updateStudyTask(_pomodoroLinkedTask, { pomodoro_count: newCount });
      }
    }
    _pomodoroSeconds = mins * 60;
    await _loadData();
    _render();
    if (_pomodoroLinkedTask) {
      alert('番茄钟完成！已记录 ' + mins + ' 分钟专注，并已更新关联待办进度。');
    } else {
      alert('番茄钟完成！已记录 ' + mins + ' 分钟专注时间。');
    }
  }

  /* ---------- 倒计时 ---------- */
  function _renderCountdown(container) {
    var days = _daysUntil(_examDate);
    container.innerHTML = '<div class="st-card st-countdown"><h3>考试倒计时</h3>' +
      '<div class="st-countdown-number">' + (days !== null ? days + '<span class="unit">天</span>' : '未设置') + '</div>' +
      '<p style="color:var(--text-muted,#8a8a8a);font-size:0.85rem;margin-top:8px;">' + (_examDate || '请在下方设置考试日期') + '</p>' +
      '<div class="st-form-row" style="max-width:320px;margin:20px auto 0;">' +
        '<input type="date" class="st-input" id="st-exam-date" value="' + (_examDate || '') + '">' +
        '<button class="st-btn" id="st-save-exam">保存</button>' +
      '</div></div>';

    document.getElementById('st-save-exam').addEventListener('click', function() {
      _examDate = document.getElementById('st-exam-date').value;
      localStorage.setItem('tatabox_exam_date', _examDate);
      _render();
    });
  }

  /* ---------- 笔记 ---------- */
  function _renderNotes(container) {
    container.innerHTML = '<div class="st-card"><h3>新建笔记</h3>' +
      '<div class="st-form-row"><input type="text" class="st-input" id="st-note-title" placeholder="笔记标题"></div>' +
      '<div class="st-form-row"><textarea class="st-input" id="st-note-content" rows="4" placeholder="笔记内容（支持 Markdown）"></textarea></div>' +
      '<button class="st-btn" id="st-add-note">+ 添加笔记</button></div>' +
      '<div class="st-card"><h3>我的笔记 (' + _notes.length + ')</h3>' + (_notes.length ? _notes.map(function(n) {
        return '<div class="st-note"><div class="st-note-title">' + (n.title||'') + '</div>' +
          '<div style="margin-top:6px;color:var(--text-secondary,#4a4a4a);font-size:0.88rem;line-height:1.6;">' + (n.content || '').substring(0, 160) + '</div>' +
          '<div class="st-note-meta">' + _formatDate(n.updated_at || n.created_at) + '</div></div>';
      }).join('') : '<div class="st-empty">暂无笔记</div>') + '</div>';

    document.getElementById('st-add-note').addEventListener('click', _addNote);
  }

  async function _addNote() {
    var title = document.getElementById('st-note-title').value.trim();
    var content = document.getElementById('st-note-content').value.trim();
    if (!title) return alert('请输入笔记标题');
    var res = await window.addNote({ title: title, content: content });
    if (!res || !res.ok) return alert('添加失败：' + errText(res));
    await _loadData();
    _render();
  }

  /* ---------- 工具 Tab（聚合错题 / 实验室等流程入口） ---------- */
  function _renderTools(container) {
    var tools = [
      {
        name: '错题本',
        desc: '错题录入 → AI 分析 → 复习推送，自动定位知识点与错因',
        flow: '5.1 错题录入流程',
        route: '#/wrongbook',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'
      },
      {
        name: '虚拟实验室',
        desc: '步骤引导 + 实验台，AI 实时引导，自动生成实验报告',
        flow: '5.2 虚拟实验室流程',
        route: '#/bio-lab',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/></svg>'
      },
      {
        name: '习惯打卡',
        desc: '每日打卡 + AI 目标拆解，养成稳定学习节奏',
        flow: '目标 → AI 拆解 → 每日打卡',
        route: '#/study',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
        action: 'habits'
      },
      {
        name: 'AI 导师',
        desc: '智能问答，支持上传图片、SVG 实时渲染',
        flow: '提问 → AI 解答 → 关联图谱',
        route: '#/tutor',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V18H8v-3.3C6.2 13.5 5 11.4 5 9a7 7 0 0 1 7-7z"/><path d="M9 21h6"/></svg>'
      },
      {
        name: '知识图谱',
        desc: '生物概念网络可视化，点击节点跳转练习',
        flow: '浏览 → 定位薄弱 → 强化',
        route: '#/map',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/></svg>'
      },
      {
        name: '拍照录题',
        desc: 'OCR 识别题目文字，AI 生成选项、答案与解析',
        flow: '拍照 → OCR → AI 出题',
        route: '#/photo-quiz',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
      }
    ];

    container.innerHTML = '<div class="st-card"><h3>学习工具箱</h3>' +
      '<p style="color:var(--text-muted,#8a8a8a);font-size:0.85rem;margin:-6px 0 16px;">聚合各模块入口，练习、错题、实验室都可以从这里进入</p>' +
      '<div class="st-tools-grid">' + tools.map(function(t) {
        return '<div class="st-tool-card" data-route="' + t.route + '"' + (t.action ? ' data-action="' + t.action + '"' : '') + '>' +
          '<div class="st-tool-icon">' + t.icon + '</div>' +
          '<div class="st-tool-name">' + t.name + '</div>' +
          '<div class="st-tool-desc">' + t.desc + '</div>' +
          '<div class="st-tool-flow">' + t.flow + '</div>' +
        '</div>';
      }).join('') + '</div></div>';

    container.querySelectorAll('.st-tool-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var action = card.dataset.action;
        if (action === 'habits') {
          // 习惯打卡：内嵌加载 habits 模块
          _renderHabitsInline(container);
        } else {
          window.location.hash = card.dataset.route;
        }
      });
    });
  }

  // 习惯打卡内嵌渲染
  function _renderHabitsInline(container) {
    container.innerHTML = '<div class="st-card"><h3>习惯打卡</h3><div id="st-habits-host"><p style="color:var(--text-muted,#8a8a8a);text-align:center;padding:30px;">加载习惯模块...</p></div></div>';
    if (typeof window.initHabits === 'function' || typeof window.renderHabitsPage === 'function') {
      _embedHabits();
    } else {
      var base = (typeof _getModuleBaseUrl === 'function') ? _getModuleBaseUrl() : 'js/pages/';
      var script = document.createElement('script');
      script.src = base + 'habits.js?v=20260628i';
      script.onload = function() { _embedHabits(); };
      script.onerror = function() {
        var host = document.getElementById('st-habits-host');
        if (host) host.innerHTML = '<p style="color:var(--text-muted,#8a8a8a);text-align:center;padding:30px;">习惯模块加载失败，请刷新重试。</p>';
      };
      document.head.appendChild(script);
    }
  }

  function _embedHabits() {
    var host = document.getElementById('st-habits-host');
    if (!host) return;
    if (typeof window.initHabits === 'function') {
      window.initHabits(host);
    } else if (typeof window.renderHabitsPage === 'function') {
      window.renderHabitsPage(host);
    } else {
      host.innerHTML = '<p style="color:var(--text-muted,#8a8a8a);text-align:center;padding:30px;">习惯模块接口缺失。</p>';
    }
  }

  /* ---------- 管理（嵌入 LearningHub：今日任务 / 时间线 / 进度 / AI 抢救 / 日志） ---------- */
  function _renderHub(container) {
    // 复用 LearningHub 模块（含 AI 自动细化目标、模态框、抢救方案等）
    if (typeof window.initLearningHub === 'function') {
      window.initLearningHub(container);
    } else {
      container.innerHTML =
        '<div class="st-card" style="text-align:center;padding:32px;">' +
          '<p class="bq-text-muted">学习管理中心未加载</p>' +
          '<p style="color:var(--text-muted,#8a8a8a);font-size:12px;margin-top:4px;">请检查 js/pages/learning-hub.js 是否成功加载</p>' +
        '</div>';
    }
  }

  /* ---------- 入口 ---------- */
  async function initStudy(target) {
    _addStyles();
    var pageTarget = target || document.getElementById('page-content');
    if (!pageTarget) return;

    // 支持 ?tab=xxx 参数（hash query）+ redirectFlag 机制（路由 /learning-hub → /study 带 lmc flag 自动切到 hub tab）
    try {
      // 1) hash 中的 ?tab=xxx
      var hash = window.location.hash || '';
      var queryStr = hash.split('?')[1] || '';
      if (queryStr) {
        var params = new URLSearchParams(queryStr);
        var requestedTab = params.get('tab');
        if (requestedTab && /^(schedule|tasks|pomodoro|notes|countdown|tools|hub)$/.test(requestedTab)) {
          _activeTab = requestedTab;
        }
      }
      // 2) 兼容 search 部分（一些嵌入场景）
      if (_activeTab === 'schedule') {
        var search = window.location.search || '';
        if (search) {
          var sParams = new URLSearchParams(search);
          var sTab = sParams.get('tab');
          if (sTab && /^(schedule|tasks|pomodoro|notes|countdown|tools|hub)$/.test(sTab)) {
            _activeTab = sTab;
          }
        }
      }
    } catch (e) { /* ignore URL parse errors */ }
    // 3) 重定向标记：/learning-hub → /study（app.js 写入 sessionStorage）
    try {
      var flag = sessionStorage.getItem('bioquest:redirectFlag');
      if (flag === 'lmc') {
        _activeTab = 'hub';
        sessionStorage.removeItem('bioquest:redirectFlag');
      }
      // 4) 通过链接点击写入的 studyTab（href="#/study?tab=hub" → sessionStorage）
      var stTab = sessionStorage.getItem('bioquest:studyTab');
      if (stTab && /^(schedule|tasks|pomodoro|notes|countdown|tools|hub)$/.test(stTab)) {
        _activeTab = stTab;
        sessionStorage.removeItem('bioquest:studyTab');
      }
    } catch (e) { /* ignore storage errors */ }

    pageTarget.innerHTML = '<div style="padding:32px 20px 8px;text-align:center;">' +
      '<div style="font-family:var(--font-mono,monospace);font-size:0.72rem;letter-spacing:0.16em;color:var(--color-amber,#c4956a);text-transform:uppercase;margin-bottom:8px;">STUDY HUB</div>' +
      '<h1 style="margin:0;font-family:var(--font-serif,serif);color:var(--color-deep,#1a3a2a);font-size:1.8rem;">学习管理中心</h1>' +
      '<p style="margin:8px 0 0;color:var(--text-muted,#8a8a8a);font-size:0.9rem;">课程表 · 待办 · 番茄钟 · 笔记 · 倒计时 · 工具 · 学习管理，都在这里</p>' +
    '</div>' +
    '<div class="st-container">' +
      '<div class="st-tabs-wrap" id="st-tabs-wrap"><div class="st-tabs" id="st-tabs"></div></div>' +
      '<div id="st-content"><div class="st-empty">加载中...</div></div>' +
    '</div>' +
    '<div class="st-rhythm" id="st-rhythm"></div>';

    await _loadData();
    _pomodoroSeconds = _pomodoroMode * 60;
    _render();
  }

  window.initStudy = initStudy;
})();
