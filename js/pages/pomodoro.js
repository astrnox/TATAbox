/**
 * ============================================================
 * TATABOX — 专注模式 / 番茄钟
 * 集成到学习流程的计时工具，竞品无此功能
 * 支持自定义时长、休息提醒、学习统计
 * ============================================================
 */

(function () {
  'use strict';

  var _timerInterval = null;
  var _remainingSeconds = 0;
  var _totalSeconds = 0;
  var _isRunning = false;
  var _isPaused = false;
  var _currentMode = 'focus'; // 'focus' | 'short' | 'long'
  var _completedPomodoros = 0;
  var _sessionStart = null;
  var _pomodoroHistory = [];

  var DURATIONS = {
    focus: 25 * 60,  // 25 分钟
    short: 5 * 60,   // 5 分钟
    long: 15 * 60    // 15 分钟
  };

  var MODE_LABELS = {
    focus: '专注',
    short: '短休息',
    long: '长休息'
  };

  var MODE_COLORS = {
    focus: 'var(--color-sage, #5a7d5c)',
    short: 'var(--color-amber, #c4956a)',
    long: 'var(--color-deep, #1a3a2a)'
  };

  var _stylesInjected = false;

  function injectPomodoroStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;

    var style = document.createElement('style');
    style.id = 'bioquest-pomodoro-styles';
    style.textContent = '\
    .pomo-container{max-width:480px;margin:0 auto;padding:24px;text-align:center}\
    .pomo-title{font-family:var(--font-serif,"Noto Serif SC",serif);font-size:1.4rem;font-weight:700;color:var(--color-deep,#1a3a2a);margin-bottom:4px}\
    .pomo-subtitle{font-size:0.82rem;color:var(--text-muted,#8a8a8a);margin-bottom:28px}\
    .pomo-mode-tabs{display:flex;gap:8px;justify-content:center;margin-bottom:28px}\
    .pomo-mode-tab{padding:8px 20px;border-radius:var(--radius-full, 9999px);border:1px solid var(--border-default,#e0dcd5);background:var(--surface-primary,#fff);color:var(--text-secondary,#4a4a4a);font-size:0.85rem;font-weight:500;cursor:pointer;transition:all 0.2s}\
    .pomo-mode-tab:hover{border-color:var(--color-sage,#5a7d5c);color:var(--color-sage,#5a7d5c)}\
    .pomo-mode-tab.active{background:var(--color-sage,#5a7d5c);color:#fff;border-color:var(--color-sage,#5a7d5c)}\
    .pomo-ring-wrap{position:relative;width:240px;height:240px;margin:0 auto 24px}\
    .pomo-ring-svg{width:100%;height:100%;transform:rotate(-90deg)}\
    .pomo-ring-bg{fill:none;stroke:var(--surface-tertiary,#f0ebe0);stroke-width:8}\
    .pomo-ring-progress{fill:none;stroke:var(--color-sage,#5a7d5c);stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset 0.5s ease,stroke 0.3s}\
    .pomo-ring-center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center}\
    .pomo-time{font-family:var(--font-mono,monospace);font-size:2.8rem;font-weight:700;color:var(--color-deep,#1a3a2a);line-height:1}\
    .pomo-mode-label{font-size:0.82rem;color:var(--text-muted,#8a8a8a);margin-top:6px}\
    .pomo-controls{display:flex;gap:12px;justify-content:center;margin-bottom:28px}\
    .pomo-btn{padding:12px 32px;border-radius:var(--radius-full, 9999px);font-size:0.95rem;font-weight:600;cursor:pointer;transition:all 0.2s;border:none}\
    .pomo-btn-primary{background:var(--color-sage,#5a7d5c);color:#fff}\
    .pomo-btn-primary:hover{transform:translateY(-1px);box-shadow:var(--shadow-md)}\
    .pomo-btn-secondary{background:var(--surface-secondary,#faf7f2);color:var(--text-secondary,#4a4a4a);border:1px solid var(--border-default,#e0dcd5)}\
    .pomo-btn-secondary:hover{border-color:var(--color-sage,#5a7d5c);color:var(--color-sage,#5a7d5c)}\
    .pomo-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}\
    .pomo-stat-item{text-align:center;padding:16px 8px;background:var(--surface-secondary,#faf7f2);border-radius:var(--radius-md, 8px);border:1px solid var(--border-light,#ece8e1)}\
    .pomo-stat-num{font-family:var(--font-mono,monospace);font-size:1.6rem;font-weight:700;color:var(--color-deep,#1a3a2a)}\
    .pomo-stat-label{font-size:0.75rem;color:var(--text-muted,#8a8a8a);margin-top:2px}\
    .pomo-tips{background:var(--surface-secondary,#faf7f2);border-radius:var(--radius-md, 8px);padding:16px 20px;text-align:left;border:1px solid var(--border-light,#ece8e1)}\
    .pomo-tips-title{font-size:0.85rem;font-weight:600;color:var(--color-deep,#1a3a2a);margin-bottom:8px}\
    .pomo-tips-list{list-style:none;padding:0;margin:0}\
    .pomo-tips-list li{font-size:0.8rem;color:var(--text-secondary,#4a4a4a);padding:4px 0;line-height:1.5}\
    .pomo-tips-list li::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--color-sage,#5a7d5c);margin-right:8px;vertical-align:middle}\
    .pomo-duration-input{display:flex;align-items:center;gap:8px;justify-content:center;margin-bottom:20px}\
    .pomo-duration-input label{font-size:0.82rem;color:var(--text-secondary,#4a4a4a)}\
    .pomo-duration-input input{width:60px;padding:6px 8px;border:1px solid var(--border-default,#e0dcd5);border-radius:var(--radius-sm, 4px);text-align:center;font-family:var(--font-mono,monospace);font-size:0.9rem}\
    .pomo-duration-input span{font-size:0.82rem;color:var(--text-muted,#8a8a8a)}\
    .pomo-done-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(26,58,42,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;animation:pomoFadeIn 0.3s ease}\
    .pomo-done-card{background:var(--surface-primary,#fff);border-radius:var(--radius-lg, 12px);padding:40px;text-align:center;max-width:360px;width:90%;animation:pomoScaleIn 0.3s ease}\
    .pomo-done-icon{font-size:3rem;margin-bottom:12px}\
    .pomo-done-title{font-family:var(--font-serif,"Noto Serif SC",serif);font-size:1.3rem;font-weight:700;color:var(--color-deep,#1a3a2a);margin-bottom:8px}\
    .pomo-done-desc{font-size:0.88rem;color:var(--text-secondary,#4a4a4a);margin-bottom:24px;line-height:1.6}\
    @keyframes pomoFadeIn{from{opacity:0}to{opacity:1}}\
    @keyframes pomoScaleIn{from{transform:scale(0.9);opacity:0}to{transform:scale(1);opacity:1}}\
    @media(max-width:480px){.pomo-ring-wrap{width:200px;height:200px}.pomo-time{font-size:2.2rem}.pomo-stats{grid-template-columns:1fr 1fr}.pomo-stat-item:last-child{grid-column:1/-1}}\
    ';
    document.head.appendChild(style);
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem('tatabox_pomodoro_history');
      if (raw) _pomodoroHistory = JSON.parse(raw);
    } catch (e) { _pomodoroHistory = []; }
  }

  function saveHistory() {
    try {
      // 只保留最近 100 条
      if (_pomodoroHistory.length > 100) _pomodoroHistory = _pomodoroHistory.slice(-100);
      localStorage.setItem('tatabox_pomodoro_history', JSON.stringify(_pomodoroHistory));
    } catch (e) {}
  }

  function getTodayCount() {
    var today = new Date().toISOString().split('T')[0];
    return _pomodoroHistory.filter(function (h) {
      return h.date === today && h.mode === 'focus';
    }).length;
  }

  function getTodayMinutes() {
    var today = new Date().toISOString().split('T')[0];
    return _pomodoroHistory.filter(function (h) {
      return h.date === today && h.mode === 'focus';
    }).reduce(function (sum, h) {
      return sum + (h.duration || 0);
    }, 0);
  }

  function getStreak() {
    var dates = {};
    _pomodoroHistory.forEach(function (h) {
      if (h.mode === 'focus') dates[h.date] = true;
    });
    var streak = 0;
    var d = new Date();
    while (true) {
      var key = d.toISOString().split('T')[0];
      if (dates[key]) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function startTimer() {
    if (_isRunning && !_isPaused) return;

    if (!_isPaused) {
      _remainingSeconds = DURATIONS[_currentMode];
      _totalSeconds = _remainingSeconds;
      _sessionStart = Date.now();
    }

    _isRunning = true;
    _isPaused = false;

    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = setInterval(function () {
      _remainingSeconds--;
      updateDisplay();

      if (_remainingSeconds <= 0) {
        clearInterval(_timerInterval);
        _timerInterval = null;
        _isRunning = false;
        _isPaused = false;
        onTimerComplete();
      }
    }, 1000);

    updateDisplay();
    updateControls();
  }

  function pauseTimer() {
    if (!_isRunning || _isPaused) return;
    _isPaused = true;
    clearInterval(_timerInterval);
    _timerInterval = null;
    updateControls();
  }

  function resumeTimer() {
    if (!_isRunning || !_isPaused) return;
    _isPaused = false;
    startTimer();
  }

  function resetTimer() {
    clearInterval(_timerInterval);
    _timerInterval = null;
    _isRunning = false;
    _isPaused = false;
    _remainingSeconds = DURATIONS[_currentMode];
    _totalSeconds = _remainingSeconds;
    updateDisplay();
    updateControls();
  }

  function switchMode(mode) {
    if (_isRunning) {
      resetTimer();
    }
    _currentMode = mode;
    _remainingSeconds = DURATIONS[mode];
    _totalSeconds = _remainingSeconds;
    updateDisplay();
    updateModeTabs();
    updateControls();
  }

  function onTimerComplete() {
    if (_currentMode === 'focus') {
      _completedPomodoros++;
      var duration = Math.round((_sessionStart ? (Date.now() - _sessionStart) : DURATIONS.focus * 1000) / 60000);
      _pomodoroHistory.push({
        date: new Date().toISOString().split('T')[0],
        mode: 'focus',
        duration: duration,
        timestamp: Date.now()
      });
      saveHistory();

      // 每 4 个番茄钟后建议长休息
      var nextMode = (_completedPomodoros % 4 === 0) ? 'long' : 'short';
      showCompleteOverlay('专注完成！', '已完成 ' + _completedPomodoros + ' 个番茄钟，建议' + MODE_LABELS[nextMode], nextMode);
    } else {
      showCompleteOverlay('休息结束！', '精力充沛，继续下一个番茄钟吧', 'focus');
    }

    // 尝试播放提示音
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660;
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }

  function showCompleteOverlay(title, desc, nextMode) {
    var existing = document.getElementById('pomo-done-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'pomo-done-overlay';
    overlay.className = 'pomo-done-overlay';
    overlay.innerHTML = '<div class="pomo-done-card">' +
      '<div class="pomo-done-icon">' + (_currentMode === 'focus' ? '&#x1F345;' : '&#x2615;') + '</div>' +
      '<div class="pomo-done-title">' + title + '</div>' +
      '<div class="pomo-done-desc">' + desc + '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center">' +
      '<button class="pomo-btn pomo-btn-secondary" id="pomo-done-close">关闭</button>' +
      '<button class="pomo-btn pomo-btn-primary" id="pomo-done-next">开始' + MODE_LABELS[nextMode] + '</button>' +
      '</div></div>';

    document.body.appendChild(overlay);

    document.getElementById('pomo-done-close').addEventListener('click', function () {
      overlay.remove();
      switchMode('focus');
    });
    document.getElementById('pomo-done-next').addEventListener('click', function () {
      overlay.remove();
      switchMode(nextMode);
      startTimer();
    });
  }

  function updateDisplay() {
    var timeEl = document.getElementById('pomo-time');
    var labelEl = document.getElementById('pomo-mode-label');
    var progressEl = document.getElementById('pomo-ring-progress');
    var ringWrap = document.querySelector('.pomo-ring-wrap');

    if (timeEl) timeEl.textContent = formatTime(_remainingSeconds);
    if (labelEl) labelEl.textContent = MODE_LABELS[_currentMode] + (_isPaused ? ' (已暂停)' : _isRunning ? ' 进行中' : '');

    if (progressEl) {
      var circumference = 2 * Math.PI * 108;
      var progress = _totalSeconds > 0 ? (_totalSeconds - _remainingSeconds) / _totalSeconds : 0;
      progressEl.setAttribute('stroke-dasharray', circumference);
      progressEl.setAttribute('stroke-dashoffset', circumference * (1 - progress));
      progressEl.setAttribute('stroke', MODE_COLORS[_currentMode]);
    }

    if (ringWrap) {
      ringWrap.style.filter = _isPaused ? 'opacity(0.7)' : '';
    }

    // 更新页面标题
    if (_isRunning) {
      document.title = formatTime(_remainingSeconds) + ' - ' + MODE_LABELS[_currentMode] + ' | TATABOX';
    } else {
      document.title = '专注模式 | TATABOX';
    }

    // 更新统计
    updateStats();
  }

  function updateControls() {
    var startBtn = document.getElementById('pomo-start-btn');
    var pauseBtn = document.getElementById('pomo-pause-btn');
    var resetBtn = document.getElementById('pomo-reset-btn');

    if (startBtn) startBtn.style.display = (!_isRunning || _isPaused) ? '' : 'none';
    if (pauseBtn) pauseBtn.style.display = (_isRunning && !_isPaused) ? '' : 'none';
    if (resetBtn) resetBtn.style.display = _isRunning ? '' : 'none';
  }

  function updateModeTabs() {
    var tabs = document.querySelectorAll('.pomo-mode-tab');
    tabs.forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.mode === _currentMode);
    });
  }

  function updateStats() {
    var todayEl = document.getElementById('pomo-stat-today');
    var minutesEl = document.getElementById('pomo-stat-minutes');
    var streakEl = document.getElementById('pomo-stat-streak');

    if (todayEl) todayEl.textContent = getTodayCount();
    if (minutesEl) minutesEl.textContent = getTodayMinutes();
    if (streakEl) streakEl.textContent = getStreak();
  }

  function renderPomodoroPage(target) {
    if (!target) return;

    loadHistory();

    var circumference = 2 * Math.PI * 108;

    target.innerHTML = '<div class="pomo-container animate-fade-in">' +
      '<div class="pomo-title">专注模式</div>' +
      '<div class="pomo-subtitle">番茄钟工作法，高效学习每一刻</div>' +

      // 模式切换
      '<div class="pomo-mode-tabs">' +
      '<button class="pomo-mode-tab active" data-mode="focus">专注 25min</button>' +
      '<button class="pomo-mode-tab" data-mode="short">短休息 5min</button>' +
      '<button class="pomo-mode-tab" data-mode="long">长休息 15min</button>' +
      '</div>' +

      // 自定义时长
      '<div class="pomo-duration-input">' +
      '<label>自定义：</label>' +
      '<input type="number" id="pomo-custom-min" min="1" max="120" value="25" />' +
      '<span>分钟</span>' +
      '<button class="pomo-btn pomo-btn-secondary" style="padding:6px 16px;font-size:0.8rem" id="pomo-custom-apply">应用</button>' +
      '</div>' +

      // 计时器圆环
      '<div class="pomo-ring-wrap">' +
      '<svg class="pomo-ring-svg" viewBox="0 0 240 240">' +
      '<circle class="pomo-ring-bg" cx="120" cy="120" r="108"/>' +
      '<circle class="pomo-ring-progress" id="pomo-ring-progress" cx="120" cy="120" r="108" ' +
      'stroke-dasharray="' + circumference + '" stroke-dashoffset="' + circumference + '"/>' +
      '</svg>' +
      '<div class="pomo-ring-center">' +
      '<div class="pomo-time" id="pomo-time">25:00</div>' +
      '<div class="pomo-mode-label" id="pomo-mode-label">专注</div>' +
      '</div>' +
      '</div>' +

      // 控制按钮
      '<div class="pomo-controls">' +
      '<button class="pomo-btn pomo-btn-primary" id="pomo-start-btn">开始专注</button>' +
      '<button class="pomo-btn pomo-btn-secondary" id="pomo-pause-btn" style="display:none">暂停</button>' +
      '<button class="pomo-btn pomo-btn-secondary" id="pomo-reset-btn" style="display:none">重置</button>' +
      '</div>' +

      // 统计
      '<div class="pomo-stats">' +
      '<div class="pomo-stat-item"><div class="pomo-stat-num" id="pomo-stat-today">0</div><div class="pomo-stat-label">今日番茄</div></div>' +
      '<div class="pomo-stat-item"><div class="pomo-stat-num" id="pomo-stat-minutes">0</div><div class="pomo-stat-label">今日专注(分钟)</div></div>' +
      '<div class="pomo-stat-item"><div class="pomo-stat-num" id="pomo-stat-streak">0</div><div class="pomo-stat-label">连续天数</div></div>' +
      '</div>' +

      // 学习建议
      '<div class="pomo-tips">' +
      '<div class="pomo-tips-title">高效学习建议</div>' +
      '<ul class="pomo-tips-list">' +
      '<li>每个番茄钟专注 25 分钟，期间不做任何与学习无关的事</li>' +
      '<li>短休息 5 分钟：站起来活动、喝水、远眺放松眼睛</li>' +
      '<li>每完成 4 个番茄钟，进行 15 分钟长休息</li>' +
      '<li>专注时关闭手机通知，将手机放到视线之外</li>' +
      '<li>记录每个番茄钟的学习内容，便于复盘</li>' +
      '</ul>' +
      '</div>' +

      '</div>';

    // 绑定事件
    var modeTabs = target.querySelectorAll('.pomo-mode-tab');
    modeTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchMode(tab.dataset.mode);
      });
    });

    var startBtn = document.getElementById('pomo-start-btn');
    var pauseBtn = document.getElementById('pomo-pause-btn');
    var resetBtn = document.getElementById('pomo-reset-btn');

    if (startBtn) startBtn.addEventListener('click', function () {
      if (_isPaused) resumeTimer();
      else startTimer();
    });
    if (pauseBtn) pauseBtn.addEventListener('click', pauseTimer);
    if (resetBtn) resetBtn.addEventListener('click', resetTimer);

    var customApply = document.getElementById('pomo-custom-apply');
    var customMin = document.getElementById('pomo-custom-min');
    if (customApply && customMin) {
      customApply.addEventListener('click', function () {
        var val = parseInt(customMin.value, 10);
        if (val >= 1 && val <= 120) {
          DURATIONS.focus = val * 60;
          // 更新标签
          var focusTab = target.querySelector('[data-mode="focus"]');
          if (focusTab) focusTab.textContent = '专注 ' + val + 'min';
          switchMode('focus');
        }
      });
    }

    updateDisplay();
    updateStats();
  }

  function initPomodoro(target) {
    injectPomodoroStyles();

    if (!target) {
      target = (typeof AppState !== 'undefined' && AppState.rootElement) ? AppState.rootElement : document.getElementById('page-content');
    }

    renderPomodoroPage(target);
  }

  // 页面离开时清理
  function cleanup() {
    if (_timerInterval) {
      clearInterval(_timerInterval);
      _timerInterval = null;
    }
  }

  window.initPomodoro = initPomodoro;
  window.renderPomodoroPage = renderPomodoroPage;
  window.cleanupPomodoro = cleanup;

})();
