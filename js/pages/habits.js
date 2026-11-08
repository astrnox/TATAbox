/**
 * 习惯养成模块 — TATABOX
 * 数据管理 + 页面渲染
 */

'use strict';

/* ========================= 数据层 ========================= */

var HABITS_KEY = 'tatabox_habits';
var HABIT_LOGS_KEY = 'tatabox_habit_logs';
var BADGES_KEY = 'tatabox_badges';

var _habitFocusTrap = null;

function _releaseHabitModal() {
  if (_habitFocusTrap) { _habitFocusTrap.release(); _habitFocusTrap = null; }
}

var AUTO_HABIT_DEFS = [
  { id: 'auto_practice', name: '每日刷题', color: '#5a7d5c', targetType: 'count', targetValue: 30, frequency: 'daily', auto: true },
  { id: 'auto_focus', name: '专注学习', color: '#e8a87c', targetType: 'duration', targetValue: 60, frequency: 'daily', auto: true },
  { id: 'auto_review', name: '错题复习', color: '#c38d9e', targetType: 'count', targetValue: 5, frequency: 'daily', auto: true }
];

var BADGE_DEFS = [
  { id: 'streak_3', name: '初出茅庐', svg: 'badge-streak3', description: '连续打卡 3 天', condition: function(s) { return s.maxStreak >= 3; } },
  { id: 'streak_7', name: '坚持不懈', svg: 'badge-streak7', description: '连续打卡 7 天', condition: function(s) { return s.maxStreak >= 7; } },
  { id: 'streak_30', name: '习惯大师', svg: 'badge-streak30', description: '连续打卡 30 天', condition: function(s) { return s.maxStreak >= 30; } },
  { id: 'streak_100', name: '百日不辍', svg: 'badge-streak100', description: '连续打卡 100 天', condition: function(s) { return s.maxStreak >= 100; } },
  { id: 'all_done', name: '全勤标兵', svg: 'badge-alldone', description: '单日完成所有习惯', condition: function(s) { return s.allDoneCount > 0; } },
  { id: 'total_100', name: '百日筑基', svg: 'badge-total100', description: '累计打卡 100 次', condition: function(s) { return s.totalCompleted >= 100; } },
  { id: 'total_500', name: '勤学不倦', svg: 'badge-total500', description: '累计打卡 500 次', condition: function(s) { return s.totalCompleted >= 500; } },
  { id: 'early_bird', name: '早起鸟', svg: 'badge-earlybird', description: '在 8:00 前完成首个习惯', condition: function(s) { return s.earlyBird; } },
  { id: 'night_owl', name: '夜猫子', svg: 'badge-nightowl', description: '在 23:00 后完成习惯', condition: function(s) { return s.nightOwl; } },
  { id: 'goal_master', name: '目标达人', svg: 'badge-goal', description: '完成 10 个 AI 拆解目标', condition: function(s) { return s.goalCompleted >= 10; } }
];

/* 徽章渲染：优先使用手绘徽章库（badge-motifs.js，LEGACY_ID_MAP 自动映射旧 id），
   未加载时兜底为内联几何 SVG，保证任何页面/时序下不空白。 */
function _badgeSvg(id, earned) {
  if (typeof window !== 'undefined' && typeof window.renderBadgeSvg === 'function') {
    try {
      return window.renderBadgeSvg(id, { size: 40, earned: !!earned });
    } catch (e) { /* 落到下方兜底 */ }
  }
  var op = earned ? 1 : 0.35;
  var fill = earned ? '#c4956a' : '#bfb8ad';
  var stroke = earned ? '#8a6a4a' : '#9a948a';
  var svgs = {
    'badge-streak3': '<path d="M12 30 L20 14 L28 30 Z" fill="' + fill + '" opacity="' + op + '"/><circle cx="20" cy="26" r="3" fill="#fff" opacity="' + op + '"/>',
    'badge-streak7': '<path d="M12 32 L20 10 L28 32 Z" fill="' + fill + '" opacity="' + op + '"/><path d="M16 28 L24 28" stroke="#fff" stroke-width="2" opacity="' + op + '"/><text x="20" y="27" font-size="8" fill="#fff" text-anchor="middle" opacity="' + op + '">7</text>',
    'badge-streak30': '<polygon points="20,8 26,16 24,26 16,26 14,16" fill="' + fill + '" opacity="' + op + '"/><text x="20" y="24" font-size="9" fill="#fff" text-anchor="middle" opacity="' + op + '">30</text>',
    'badge-streak100': '<circle cx="20" cy="20" r="12" fill="' + fill + '" opacity="' + op + '"/><text x="20" y="24" font-size="9" fill="#fff" text-anchor="middle" opacity="' + op + '">100</text>',
    'badge-alldone': '<circle cx="20" cy="20" r="12" fill="' + fill + '" opacity="' + op + '"/><path d="M14 20 L18 24 L26 16" stroke="#fff" stroke-width="2.5" fill="none" opacity="' + op + '"/>',
    'badge-total100': '<rect x="10" y="12" width="20" height="16" rx="3" fill="' + fill + '" opacity="' + op + '"/><text x="20" y="24" font-size="8" fill="#fff" text-anchor="middle" opacity="' + op + '">100</text>',
    'badge-total500': '<rect x="8" y="10" width="24" height="20" rx="4" fill="' + fill + '" opacity="' + op + '"/><text x="20" y="24" font-size="8" fill="#fff" text-anchor="middle" opacity="' + op + '">500</text>',
    'badge-earlybird': '<circle cx="20" cy="22" r="8" fill="' + fill + '" opacity="' + op + '"/><path d="M20 10 L20 14 M12 14 L15 17 M28 14 L25 17 M8 22 L12 22 M32 22 L28 22" stroke="' + fill + '" stroke-width="2" opacity="' + op + '"/>',
    'badge-nightowl': '<circle cx="20" cy="20" r="10" fill="' + fill + '" opacity="' + op + '"/><path d="M16 18 A3 3 0 0 1 16 24" fill="#fff" opacity="' + op + '"/><path d="M24 18 A3 3 0 0 1 24 24" fill="#fff" opacity="' + op + '"/><path d="M18 28 Q20 30 22 28" stroke="#fff" stroke-width="1.5" fill="none" opacity="' + op + '"/>',
    'badge-goal': '<circle cx="20" cy="20" r="12" fill="' + fill + '" opacity="' + op + '"/><circle cx="20" cy="20" r="8" fill="none" stroke="#fff" stroke-width="1.5" opacity="' + op + '"/><circle cx="20" cy="20" r="4" fill="#fff" opacity="' + op + '"/><circle cx="20" cy="20" r="1.5" fill="' + stroke + '"/>'
  };
  return '<svg width="40" height="40" viewBox="0 0 40 40">' + (svgs[id] || '') + '</svg>';
}

function _lsGet(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function _lsSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
}

function _todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _addDays(str, n) {
  var parts = str.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setDate(d.getDate() + n);
  return _dateStr(d);
}

function _genId() {
  return 'habit_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
}

/* ---------- 读写 ---------- */

function getHabits() {
  return _lsGet(HABITS_KEY, []);
}

function saveHabits(habits) {
  _lsSet(HABITS_KEY, habits);
}

function getHabitLogs() {
  return _lsGet(HABIT_LOGS_KEY, []);
}

function saveHabitLogs(logs) {
  _lsSet(HABIT_LOGS_KEY, logs);
}

function getBadges() {
  return _lsGet(BADGES_KEY, []);
}

function saveBadges(badges) {
  _lsSet(BADGES_KEY, badges);
}

/* ---------- CRUD ---------- */

function createHabit(data) {
  var habits = getHabits();
  var habit = {
    id: _genId(),
    name: data.name || '新习惯',
    color: data.color || '#5a7d5c',
    targetType: data.targetType || 'boolean',
    targetValue: typeof data.targetValue === 'number' ? data.targetValue : 1,
    step: typeof data.step === 'number' ? data.step : (data.targetType === 'duration' ? 25 : 1),
    frequency: data.frequency || 'daily',
    createdAt: Date.now(),
    active: true
  };
  habits.push(habit);
  saveHabits(habits);
  return habit;
}

function updateHabit(id, updates) {
  var habits = getHabits();
  for (var i = 0; i < habits.length; i++) {
    if (habits[i].id === id) {
      for (var k in updates) {
        if (updates.hasOwnProperty(k)) {
          habits[i][k] = updates[k];
        }
      }
      saveHabits(habits);
      return habits[i];
    }
  }
  return null;
}

function deleteHabit(id) {
  var habits = getHabits().filter(function(h) { return h.id !== id; });
  saveHabits(habits);
  var logs = getHabitLogs().filter(function(l) { return l.habitId !== id; });
  saveHabitLogs(logs);
}

function toggleHabitActive(id) {
  var habits = getHabits();
  for (var i = 0; i < habits.length; i++) {
    if (habits[i].id === id) {
      habits[i].active = !habits[i].active;
      saveHabits(habits);
      return habits[i].active;
    }
  }
  return null;
}

/* ---------- 日志 ---------- */

function getTodayLog(habitId) {
  var today = _todayStr();
  var logs = getHabitLogs();
  for (var i = 0; i < logs.length; i++) {
    if (logs[i].habitId === habitId && logs[i].date === today) {
      return logs[i];
    }
  }
  return null;
}

function logHabit(habitId, value) {
  var habits = getHabits();
  var habit = null;
  for (var i = 0; i < habits.length; i++) {
    if (habits[i].id === habitId) {
      habit = habits[i];
      break;
    }
  }
  if (!habit) return null;

  var today = _todayStr();
  var logs = getHabitLogs();
  var existing = null;
  for (var j = 0; j < logs.length; j++) {
    if (logs[j].habitId === habitId && logs[j].date === today) {
      existing = logs[j];
      break;
    }
  }

  var completed = false;
  if (habit.targetType === 'boolean') {
    completed = !!value;
  } else {
    completed = value >= habit.targetValue;
  }

  if (existing) {
    existing.value = value;
    existing.completed = completed;
  } else {
    logs.push({ habitId: habitId, date: today, value: value, completed: completed });
  }
  saveHabitLogs(logs);

  // 检查徽章
  var newBadges = checkBadges();
  if (newBadges.length > 0) {
    newBadges.forEach(function(b) {
      showToast('获得徽章：' + b.name, 'success');
    });
  }

  return existing || { habitId: habitId, date: today, value: value, completed: completed };
}

/* ---------- 连续天数 ---------- */

function getHabitStreak(habitId) {
  var logs = getHabitLogs().filter(function(l) { return l.habitId === habitId && l.completed; });
  if (logs.length === 0) return 0;

  var today = _todayStr();
  var hasToday = false;
  for (var i = 0; i < logs.length; i++) {
    if (logs[i].date === today) {
      hasToday = true;
      break;
    }
  }

  var streak = 0;
  var checkDate = hasToday ? today : _addDays(today, -1);

  while (true) {
    var found = false;
    for (var j = 0; j < logs.length; j++) {
      if (logs[j].date === checkDate) {
        found = true;
        break;
      }
    }
    if (found) {
      streak++;
      checkDate = _addDays(checkDate, -1);
    } else {
      break;
    }
  }
  return streak;
}

/* ---------- 热力图 ---------- */

function getWeeklyHeatmap(habitId) {
  var result = [];
  var today = new Date();
  for (var i = 6; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var ds = _dateStr(d);
    var logs = getHabitLogs();
    var completed = false;
    var value = 0;
    for (var j = 0; j < logs.length; j++) {
      if (logs[j].habitId === habitId && logs[j].date === ds) {
        completed = logs[j].completed;
        value = logs[j].value;
        break;
      }
    }
    result.push({ date: ds, completed: completed, value: value });
  }
  return result;
}

function getMonthlyCalendar() {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth();
  var firstDay = new Date(year, month, 1);
  var lastDay = new Date(year, month + 1, 0);
  var daysInMonth = lastDay.getDate();
  var startWeekday = firstDay.getDay();

  var onlineTime = _getOnlineTimeMap();

  var days = [];
  for (var i = 0; i < startWeekday; i++) {
    days.push({ date: '', empty: true });
  }
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var minutes = onlineTime[ds] || 0;
    // 热力图强度按在线分钟数分级（仿 GitHub：0/30/60/120/180+）
    var ratio = Math.min(1, minutes / 180);
    days.push({ date: ds, day: d, minutes: minutes, ratio: ratio, empty: false });
  }
  return { year: year, month: month + 1, days: days };
}

/* ========================= 在线时间追踪（仿 GitHub 热力图） ========================= */
var ONLINE_TIME_KEY = 'tatabox_online_time';
var _sessionStart = Date.now();

// 每 30 秒自动记录一次在线时间
setInterval(function () {
  try {
    var today = _todayStr();
    var map = _lsGet(ONLINE_TIME_KEY, {});
    map[today] = (map[today] || 0) + 0.5; // 0.5 分钟
    _lsSet(ONLINE_TIME_KEY, map);
  } catch (e) {}
}, 30000);

function _getOnlineTimeMap() {
  return _lsGet(ONLINE_TIME_KEY, {});
}

// 获取最近 N 天的在线时间数据（用于 GitHub 风格热力图）
function getOnlineTimeHeatmap(days) {
  days = days || 365;
  var map = _getOnlineTimeMap();
  var result = [];
  var now = new Date();
  for (var i = days - 1; i >= 0; i--) {
    var d = new Date(now);
    d.setDate(d.getDate() - i);
    var ds = _dateStr(d);
    result.push({ date: ds, minutes: map[ds] || 0 });
  }
  return result;
}

// 渲染 GitHub 风格年度热力图
function renderOnlineTimeHeatmap() {
  var data = getOnlineTimeHeatmap(364); // 52 周 × 7 天
  var totalMinutes = 0;
  for (var i = 0; i < data.length; i++) totalMinutes += data[i].minutes;

  var html = '<div class="online-heatmap-container" style="overflow-x:auto;padding:8px 0;">';
  html += '<div style="margin-bottom:8px;font-size:13px;color:var(--text-muted);">';
  html += '过去一年在线学习 <strong style="color:var(--color-deep);">' + Math.round(totalMinutes) + '</strong> 分钟（约 ' + (totalMinutes / 60).toFixed(1) + ' 小时）';
  html += '</div>';

  // 按周分列（每周 7 天）
  html += '<div style="display:flex;gap:3px;min-width:680px;">';
  var weekdayLabels = ['一', '', '三', '', '五', '', '日'];
  html += '<div style="display:flex;flex-direction:column;gap:3px;margin-right:4px;padding-top:0;">';
  for (var w = 0; w < 7; w++) {
    html += '<div style="height:11px;line-height:11px;font-size:9px;color:var(--text-muted);">' + weekdayLabels[w] + '</div>';
  }
  html += '</div>';

  // 分列：从最早一周开始，每列 7 天
  for (var col = 0; col < Math.ceil(data.length / 7); col++) {
    html += '<div style="display:flex;flex-direction:column;gap:3px;">';
    for (var row = 0; row < 7; row++) {
      var idx = col * 7 + row;
      if (idx >= data.length) {
        html += '<div style="width:11px;height:11px;"></div>';
        continue;
      }
      var item = data[idx];
      var level = 0;
      var m = item.minutes;
      if (m >= 180) level = 4;
      else if (m >= 120) level = 3;
      else if (m >= 60) level = 2;
      else if (m >= 15) level = 1;
      var colors = ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127'];
      var bg = level === 0 ? 'var(--surface-muted,#ebedf0)' : colors[level];
      html += '<div style="width:11px;height:11px;border-radius:2px;background:' + bg + ';" title="' + item.date + '：' + Math.round(m) + ' 分钟"></div>';
    }
    html += '</div>';
  }
  html += '</div>';

  // 图例
  html += '<div style="display:flex;align-items:center;gap:4px;margin-top:8px;font-size:10px;color:var(--text-muted);">';
  html += '<span>少</span>';
  var legendColors = ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127'];
  for (var lc = 0; lc < legendColors.length; lc++) {
    html += '<div style="width:11px;height:11px;border-radius:2px;background:' + (lc === 0 ? 'var(--surface-muted,#ebedf0)' : legendColors[lc]) + ';"></div>';
  }
  html += '<span>多</span>';
  html += '</div>';

  html += '</div>';
  return html;
}

/* ---------- 自动同步 ---------- */

function syncAutoHabits() {
  var habits = getHabits();
  var today = _todayStr();

  // 确保自动习惯存在
  for (var i = 0; i < AUTO_HABIT_DEFS.length; i++) {
    var def = AUTO_HABIT_DEFS[i];
    var exists = false;
    for (var j = 0; j < habits.length; j++) {
      if (habits[j].id === def.id) {
        exists = true;
        break;
      }
    }
    if (!exists) {
      habits.push({
        id: def.id,
        name: def.name,
        color: def.color,
        targetType: def.targetType,
        targetValue: def.targetValue,
        frequency: def.frequency,
        createdAt: Date.now(),
        active: true,
        auto: true
      });
    }
  }
  saveHabits(habits);

  // 同步今日数据
  // 1. 每日刷题 — 从 bioquest_history 统计今日答题数
  try {
    var history = _lsGet('tatabox_history', []);
    var todayCount = 0;
    for (var h = 0; h < history.length; h++) {
      if (history[h].date && history[h].date.startsWith(today)) {
        todayCount += history[h].answers ? history[h].answers.length : 0;
      }
    }
    if (todayCount > 0) {
      logHabit('auto_practice', todayCount);
    }
  } catch (e) {}

  // 2. 专注学习 — 从 bioquest_pomodoro_history 统计今日专注分钟
  try {
    var pomodoroHistory = _lsGet('tatabox_pomodoro_history', []);
    var todayMinutes = 0;
    for (var p = 0; p < pomodoroHistory.length; p++) {
      if (pomodoroHistory[p].date && pomodoroHistory[p].date.startsWith(today)) {
        todayMinutes += pomodoroHistory[p].duration || 0;
      }
    }
    if (todayMinutes > 0) {
      logHabit('auto_focus', todayMinutes);
    }
  } catch (e) {}

  // 3. 错题复习 — 从 bioquest_wrong_book 统计今日重做数
  try {
    var wrongBook = _lsGet('tatabox_wrong_book', []);
    var todayReview = 0;
    for (var w = 0; w < wrongBook.length; w++) {
      if (wrongBook[w].lastReviewed && wrongBook[w].lastReviewed.startsWith(today)) {
        todayReview++;
      }
    }
    if (todayReview > 0) {
      logHabit('auto_review', todayReview);
    }
  } catch (e) {}
}

/* ---------- 徽章 ---------- */

function checkBadges() {
  var badges = getBadges();
  var habits = getHabits().filter(function(h) { return h.active; });
  var logs = getHabitLogs();

  var maxStreak = 0;
  for (var i = 0; i < habits.length; i++) {
    var s = getHabitStreak(habits[i].id);
    if (s > maxStreak) maxStreak = s;
  }

  var totalCompleted = 0;
  for (var j = 0; j < logs.length; j++) {
    if (logs[j].completed) totalCompleted++;
  }

  var today = _todayStr();
  var allDoneCount = 0;
  if (habits.length > 0) {
    var allDoneToday = true;
    for (var h = 0; h < habits.length; h++) {
      var done = false;
      for (var l = 0; l < logs.length; l++) {
        if (logs[l].habitId === habits[h].id && logs[l].date === today && logs[l].completed) {
          done = true;
          break;
        }
      }
      if (!done) {
        allDoneToday = false;
        break;
      }
    }
    if (allDoneToday) allDoneCount = 1;
  }

  var earlyBird = false;
  for (var e = 0; e < logs.length; e++) {
    if (logs[e].date === today && logs[e].completed) {
      var hour = new Date().getHours();
      if (hour < 8) {
        earlyBird = true;
      }
      break;
    }
  }

  // 夜猫子：在 23:00 后完成习惯
  var nightOwl = false;
  var nowHour = new Date().getHours();
  for (var n = 0; n < logs.length; n++) {
    if (logs[n].date === today && logs[n].completed) {
      if (nowHour >= 23 || nowHour < 1) {
        nightOwl = true;
      }
      break;
    }
  }

  // 目标达人：完成 10 个 AI 拆解目标（从 localStorage 统计已完成的 D 开头习惯）
  var goalCompleted = 0;
  try {
    var allHabitsList = getHabits();
    for (var gh = 0; gh < allHabitsList.length; gh++) {
      if (/^D\d+\s·/.test(allHabitsList[gh].name)) {
        var ghStreak = getHabitStreak(allHabitsList[gh].id);
        if (ghStreak > 0) goalCompleted++;
      }
    }
  } catch (e) {}

  var state = { maxStreak: maxStreak, totalCompleted: totalCompleted, allDoneCount: allDoneCount, earlyBird: earlyBird, nightOwl: nightOwl, goalCompleted: goalCompleted };
  var newBadges = [];

  for (var b = 0; b < BADGE_DEFS.length; b++) {
    var def = BADGE_DEFS[b];
    var alreadyHas = false;
    for (var g = 0; g < badges.length; g++) {
      if (badges[g].id === def.id) {
        alreadyHas = true;
        break;
      }
    }
    if (!alreadyHas && def.condition(state)) {
      var badge = { id: def.id, name: def.name, svg: def.svg, description: def.description, awardedAt: Date.now() };
      badges.push(badge);
      newBadges.push(badge);
    }
  }

  if (newBadges.length > 0) {
    saveBadges(badges);
  }
  return newBadges;
}

/* ========================= 渲染层 ========================= */

/* AI 目标拆解卡片 HTML */
function _renderAiGoalCard() {
  var html = '<div class="habit-card" id="ai-goal-card" style="margin-bottom:24px;border:1px dashed var(--color-warm,#c4956a);background:rgba(196,149,106,0.05);">';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">';
  html += '<div>';
  html += '<div class="habit-name" style="font-size:16px;">AI 目标拆解</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);">输入你的大目标，AI 帮你拆解为每天的小目标并加入打卡</div>';
  html += '</div>';
  html += '</div>';
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">';
  html += '<input type="text" id="ai-goal-input" placeholder="例如：30 天内搞定生物竞赛遗传学模块" style="flex:1;min-width:240px;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:var(--card-bg,#fff);color:var(--text-primary,#222);">';
  html += '<input type="number" id="ai-goal-days" value="7" min="1" max="30" style="width:90px;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:var(--card-bg,#fff);color:var(--text-primary,#222);" title="拆解天数">';
  html += '<button class="habit-checkin-btn" id="ai-goal-btn" style="font-size:14px;padding:10px 20px;">AI 拆解</button>';
  html += '</div>';
  html += '<div id="ai-goal-result" style="display:none;"></div>';
  html += '</div>';
  return html;
}

/* 调用 AI 拆解大目标为每日小目标 */
function _aiBreakdownGoal(goal, days, callback) {
  var sysPrompt = '你是一位学习规划专家。用户会给你一个大目标和天数，你需要将其拆解为每天可执行的小目标。' +
    '要求：1. 每个小目标必须是具体、可完成的任务；2. 难度循序渐进；3. 严格输出 JSON 格式：{"tasks":["第1天任务","第2天任务",...]}；' +
    '4. 任务数量等于天数；5. 不要输出任何其他内容，只输出 JSON。';
  var userPrompt = '大目标：' + goal + '\n天数：' + days + '\n请拆解为 ' + days + ' 个每日小目标，严格输出 JSON。';

  if (typeof window.AiClient !== 'function') {
    callback(new Error('AI 客户端未加载'), null);
    return;
  }
  var check = window.AiClient.canUse();
  if (!check.ok) {
    callback(new Error(check.reason || 'AI 调用受限'), null);
    return;
  }

  window.AiClient.chat({
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.6,
    maxTokens: 1500
  }).then(function (resp) {
    var content = '';
    try {
      content = resp.choices[0].message.content;
    } catch (e) {
      callback(new Error('AI 响应格式异常'), null);
      return;
    }
    // 提取 JSON（兼容 AI 可能包裹 ```json ... ``` 的情况）
    var jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      callback(new Error('AI 未返回有效任务列表'), null);
      return;
    }
    try {
      var parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.tasks || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
        callback(new Error('AI 返回的任务列表为空'), null);
        return;
      }
      callback(null, parsed.tasks);
    } catch (err) {
      callback(new Error('JSON 解析失败：' + err.message), null);
    }
  }).catch(function (err) {
    callback(err, null);
  });
}

/* 绑定 AI 目标拆解事件 */
function _bindAiGoalEvents(container) {
  var btn = container.querySelector('#ai-goal-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var input = container.querySelector('#ai-goal-input');
    var daysInput = container.querySelector('#ai-goal-days');
    var resultDiv = container.querySelector('#ai-goal-result');
    if (!input || !resultDiv) return;

    var goal = input.value.trim();
    if (!goal) {
      showToast('请输入你的大目标', 'error');
      return;
    }
    var days = parseInt(daysInput.value, 10) || 7;
    if (days < 1) days = 1;
    if (days > 30) days = 30;

    // 加载状态
    btn.disabled = true;
    btn.textContent = 'AI 拆解中...';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);"><span style="display:inline-block;animation:spin 1s linear infinite;">⟳</span> AI 正在拆解目标...</div>' +
      '<style>@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>';

    _aiBreakdownGoal(goal, days, function (err, tasks) {
      btn.disabled = false;
      btn.textContent = 'AI 拆解';
      if (err) {
        // 安全修复（P1 XSS）：err.message 可能含 HTML，必须转义后再注入 innerHTML
        var _errMsg = errText(err);
        var _esc = _errMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        resultDiv.innerHTML = '<div style="padding:12px;color:var(--color-error,#e53e3e);font-size:13px;">拆解失败：' + _esc + '</div>';
        return;
      }

      // 渲染预览
      var html = '<div style="margin-top:12px;padding:12px;background:var(--card-bg,#fff);border-radius:8px;border:1px solid #eee;">';
      html += '<div style="font-weight:600;margin-bottom:10px;font-size:14px;color:var(--color-deep,#2c4a3b);">已拆解 ' + tasks.length + ' 个每日小目标</div>';
      html += '<div style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;">';
      for (var i = 0; i < tasks.length; i++) {
        html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:8px;background:rgba(90,125,92,0.05);font-size:13px;">';
        html += '<span style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:var(--color-sage,#5a7d5c);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;">' + (i + 1) + '</span>';
        html += '<span style="flex:1;line-height:1.5;">' + tasks[i] + '</span>';
        html += '</div>';
      }
      html += '</div>';
      html += '<div style="display:flex;gap:10px;margin-top:12px;">';
      html += '<button class="habit-checkin-btn" id="ai-goal-add" style="font-size:13px;padding:8px 16px;background:var(--color-sage,#5a7d5c);">加入打卡</button>';
      html += '<button class="habit-checkin-btn" id="ai-goal-cancel" style="font-size:13px;padding:8px 16px;background:#e5e7eb;color:#374151;">取消</button>';
      html += '</div>';
      html += '</div>';
      resultDiv.innerHTML = html;

      // 加入打卡
      var addBtn = resultDiv.querySelector('#ai-goal-add');
      if (addBtn) {
        addBtn.addEventListener('click', function () {
          var added = 0;
          for (var j = 0; j < tasks.length; j++) {
            var taskName = 'D' + (j + 1) + ' · ' + tasks[j];
            if (taskName.length > 40) taskName = taskName.substring(0, 40) + '...';
            createHabit({
              name: taskName,
              color: '#4a7c59',
              targetType: 'boolean',
              targetValue: 1,
              step: 1,
              frequency: 'daily'
            });
            added++;
          }
          showToast('已添加 ' + added + ' 个每日小目标到打卡列表', 'success');
          resultDiv.style.display = 'none';
          resultDiv.replaceChildren();
          input.value = '';
          renderHabitsPage(container);
        });
      }
      // 取消
      var cancelBtn = resultDiv.querySelector('#ai-goal-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
          resultDiv.style.display = 'none';
          resultDiv.replaceChildren();
        });
      }
    });
  });
}

function renderHabitsPage(target) {
  if (!target) target = document.getElementById('page-content');
  if (!target) return;

  var habits = getHabits().filter(function(h) { return h.active; });
  var badges = getBadges();

  var html = '<div class="habits-page animate-fade-in">';

  // Header
  html += '<div class="habits-header">';
  html += '<div>';
  html += '<div class="habits-title">习惯养成</div>';
  html += '<div class="habits-subtitle">每日打卡，积少成多</div>';
  html += '</div>';
  html += '<button class="habit-checkin-btn" id="habit-new-btn" style="font-size:14px;">+ 新建习惯</button>';
  html += '</div>';

  // AI 目标拆解卡片
  html += _renderAiGoalCard();

  // 今日打卡区
  html += '<div class="habits-grid">';
  for (var i = 0; i < habits.length; i++) {
    var habit = habits[i];
    var todayLog = getTodayLog(habit.id);
    var streak = getHabitStreak(habit.id);
    var weekly = getWeeklyHeatmap(habit.id);
    var value = todayLog ? todayLog.value : 0;
    var completed = todayLog ? todayLog.completed : false;
    var progress = habit.targetType === 'boolean' ? (completed ? 100 : 0) : (habit.targetValue > 0 ? Math.min(100, Math.round(value / habit.targetValue * 100)) : 0);

    html += '<div class="habit-card" data-hid="' + habit.id + '">';
    html += '<div class="habit-card-header">';
    html += '<div class="bq-flex-1">';
    html += '<div class="habit-name">' + habit.name + '</div>';
    html += '<div class="habit-streak">' + (streak > 0 ? ' ' + streak + '天' : '') + '</div>';
    html += '</div>';
    if (completed) {
      html += '<span style="color:' + habit.color + ';font-weight:600;font-size:13px;">已完成</span>';
    } else {
      html += '<button class="habit-checkin-btn" data-hid="' + habit.id + '">打卡</button>';
    }
    html += '</div>';

    // 环形进度
    if (habit.targetType !== 'boolean') {
      var radius = 26;
      var circumference = 2 * Math.PI * radius;
      var offset = circumference - (progress / 100) * circumference;
      html += '<div class="habit-progress">';
      html += '<svg class="habit-progress-ring" viewBox="0 0 64 64">';
      html += '<circle class="habit-progress-ring-bg" cx="32" cy="32" r="' + radius + '"/>';
      html += '<circle class="habit-progress-ring-fill" cx="32" cy="32" r="' + radius + '" stroke="' + habit.color + '" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '"/>';
      html += '</svg>';
      html += '</div>';
      html += '<div class="habit-progress-text">' + value + ' / ' + habit.targetValue + (habit.targetType === 'duration' ? ' 分钟' : '') + '</div>';
    }

    // 周视图
    html += '<div class="habit-weekly">';
    for (var w = 0; w < weekly.length; w++) {
      var wd = weekly[w];
      var cls = 'habit-weekly-day' + (wd.completed ? ' completed' : '');
      html += '<div class="' + cls + '" style="' + (wd.completed ? 'background:' + habit.color + ';' : '') + '" title="' + wd.date + '"></div>';
    }
    html += '</div>';

    html += '</div>';
  }
  html += '</div>';

  // 在线时间热力图（仿 GitHub，年度）
  html += '<div class="habit-card bq-mt-24">';
  html += '<div class="habit-name bq-mb-16">在线时间热力图</div>';
  html += renderOnlineTimeHeatmap();
  html += '</div>';

  // 本月在线时间日历
  html += '<div class="habit-card bq-mt-24">';
  html += '<div class="habit-name bq-mb-16">本月在线时间</div>';
  html += renderCalendarHeatmap();
  html += '</div>';

  // 徽章展示
  html += '<div class="habit-card bq-mt-24">';
  html += '<div class="habit-name bq-mb-16">成就徽章</div>';
  html += '<div class="badge-showcase">';
  for (var b = 0; b < BADGE_DEFS.length; b++) {
    var def = BADGE_DEFS[b];
    var earned = null;
    for (var g = 0; g < badges.length; g++) {
      if (badges[g].id === def.id) {
        earned = badges[g];
        break;
      }
    }
    var lockedClass = earned ? '' : ' locked';
    html += '<div class="badge-item' + lockedClass + '">';
    html += '<div style="width:44px;height:44px;border-radius:50%;background:' + (earned ? 'rgba(196,149,106,0.15)' : '#f0ede5') + ';display:flex;align-items:center;justify-content:center;margin-bottom:6px;">' + _badgeSvg(def.svg, !!earned) + '</div>';
    html += '<div style="font-size:12px;font-weight:500;color:' + (earned ? 'var(--text-primary)' : 'var(--text-muted)') + ';">' + def.name + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + def.description + '</div>';
    html += '</div>';
  }
  html += '</div>';
  html += '</div>';

  // 习惯管理
  html += '<div class="habit-card bq-mt-24">';
  html += '<div class="habit-name bq-mb-16">习惯管理</div>';
  html += '<div class="habit-management-list">';
  var allHabits = getHabits();
  for (var m = 0; m < allHabits.length; m++) {
    var mh = allHabits[m];
    html += '<div class="habit-management-item">';
    html += '<div style="display:flex;align-items:center;gap:10px;flex:1;">';
    html += '<div>';
    html += '<div style="font-weight:500;font-size:14px;">' + mh.name + '</div>';
    html += '<div style="font-size:12px;color:var(--text-muted);">' + (mh.auto ? '自动' : '自定义') + ' · ' + (mh.active ? '启用' : '暂停') + '</div>';
    html += '</div>';
    html += '</div>';
    html += '<div style="display:flex;gap:8px;">';
    html += '<button class="habit-checkin-btn" style="padding:4px 12px;font-size:12px;" data-edit="' + mh.id + '">编辑</button>';
    if (!mh.auto) {
      html += '<button class="habit-checkin-btn" style="padding:4px 12px;font-size:12px;background:var(--color-clay);" data-del="' + mh.id + '">删除</button>';
    }
    html += '<button class="habit-checkin-btn" style="padding:4px 12px;font-size:12px;background:' + (mh.active ? '#999' : 'var(--color-sage)') + ';" data-toggle="' + mh.id + '">' + (mh.active ? '暂停' : '启用') + '</button>';
    html += '</div>';
    html += '</div>';
  }
  html += '</div>';
  html += '</div>';

  html += '</div>';
  target.innerHTML = html;

  // 绑定事件
  bindHabitEvents(target);
  // 绑定 AI 目标拆解事件
  _bindAiGoalEvents(target);
}

function renderCalendarHeatmap() {
  var cal = getMonthlyCalendar();
  var html = '<div class="calendar-heatmap">';
  var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  for (var w = 0; w < weekdays.length; w++) {
    html += '<div style="text-align:center;font-size:12px;color:var(--text-muted);padding-bottom:4px;">' + weekdays[w] + '</div>';
  }
  for (var d = 0; d < cal.days.length; d++) {
    var day = cal.days[d];
    if (day.empty) {
      html += '<div class="calendar-day empty"></div>';
    } else {
      var intensity = 'intensity-0';
      if (day.ratio >= 1) intensity = 'intensity-100';
      else if (day.ratio >= 0.67) intensity = 'intensity-75';
      else if (day.ratio >= 0.33) intensity = 'intensity-50';
      else if (day.ratio >= 0.08) intensity = 'intensity-25';
      html += '<div class="calendar-day ' + intensity + '" title="' + day.date + '：' + Math.round(day.minutes) + ' 分钟">' + day.day + '</div>';
    }
  }
  html += '</div>';
  return html;
}

function bindHabitEvents(container) {
  // 打卡按钮
  var checkinBtns = container.querySelectorAll('[data-hid]');
  for (var i = 0; i < checkinBtns.length; i++) {
    checkinBtns[i].addEventListener('click', function(e) {
      var hid = e.target.getAttribute('data-hid');
      if (!hid) return;
      var habits = getHabits();
      var habit = null;
      for (var h = 0; h < habits.length; h++) {
        if (habits[h].id === hid) {
          habit = habits[h];
          break;
        }
      }
      if (!habit) return;
      if (habit.targetType === 'boolean') {
        var todayLog = getTodayLog(hid);
        var current = todayLog ? todayLog.value : 0;
        var step = habit.step || 1;
        logHabit(hid, current + step);
      } else {
        var todayLog = getTodayLog(hid);
        var current = todayLog ? todayLog.value : 0;
        var add = habit.step || (habit.targetType === 'duration' ? 25 : 1);
        logHabit(hid, current + add);
      }
      // 不刷新整个页面，仅局部更新 UI
      updateHabitCardUI(hid, container);
    });
  }

  // 新建习惯
  var newBtn = document.getElementById('habit-new-btn');
  if (newBtn) {
    newBtn.addEventListener('click', function() {
      showHabitModal(null, container);
    });
  }

  // 编辑
  var editBtns = container.querySelectorAll('[data-edit]');
  for (var e = 0; e < editBtns.length; e++) {
    editBtns[e].addEventListener('click', function(ev) {
      var id = ev.target.getAttribute('data-edit');
      var habits = getHabits();
      var habit = null;
      for (var h = 0; h < habits.length; h++) {
        if (habits[h].id === id) {
          habit = habits[h];
          break;
        }
      }
      if (habit) showHabitModal(habit, container);
    });
  }

  // 删除
  var delBtns = container.querySelectorAll('[data-del]');
  for (var d = 0; d < delBtns.length; d++) {
    delBtns[d].addEventListener('click', function(ev) {
      var id = ev.target.getAttribute('data-del');
      if (confirm('确定要删除这个习惯吗？相关记录也会被清除。')) {
        deleteHabit(id);
        renderHabitsPage(container);
      }
    });
  }

  // 暂停/启用
  var toggleBtns = container.querySelectorAll('[data-toggle]');
  for (var t = 0; t < toggleBtns.length; t++) {
    toggleBtns[t].addEventListener('click', function(ev) {
      var id = ev.target.getAttribute('data-toggle');
      toggleHabitActive(id);
      renderHabitsPage(container);
    });
  }
}

/**
 * 局部更新习惯卡片 UI（打卡后不刷新整个页面）
 */
function updateHabitCardUI(hid, container) {
  var habits = getHabits().filter(function(h) { return h.active; });
  var habit = null;
  for (var i = 0; i < habits.length; i++) {
    if (habits[i].id === hid) { habit = habits[i]; break; }
  }
  if (!habit) return;

  var todayLog = getTodayLog(hid);
  var streak = getHabitStreak(hid);
  var value = todayLog ? todayLog.value : 0;
  var completed = todayLog ? todayLog.completed : false;
  var progress = habit.targetType === 'boolean' ? (completed ? 100 : 0) : (habit.targetValue > 0 ? Math.min(100, Math.round(value / habit.targetValue * 100)) : 0);

  var card = container.querySelector('.habit-card[data-hid="' + hid + '"]');
  if (!card) return;

  // 更新打卡按钮状态
  var btnWrap = card.querySelector('.habit-card-header');
  var oldBtn = btnWrap.querySelector('[data-hid]');
  var statusLabel = btnWrap.querySelector('.habit-status-label');
  if (completed) {
    if (oldBtn) oldBtn.remove();
    if (!statusLabel) {
      statusLabel = document.createElement('span');
      statusLabel.className = 'habit-status-label';
      statusLabel.style.cssText = 'color:' + habit.color + ';font-weight:600;font-size:13px;';
      statusLabel.textContent = '已完成';
      btnWrap.appendChild(statusLabel);
    }
  }

  // 更新进度条（带动画）
  if (habit.targetType !== 'boolean') {
    var ring = card.querySelector('.habit-progress-ring-fill');
    var progressText = card.querySelector('.habit-progress-text');
    if (ring) {
      var radius = 26;
      var circumference = 2 * Math.PI * radius;
      var newOffset = circumference - (progress / 100) * circumference;
      ring.style.transition = 'stroke-dashoffset 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
      ring.setAttribute('stroke-dashoffset', newOffset);
    }
    if (progressText) {
      progressText.textContent = value + ' / ' + habit.targetValue + (habit.targetType === 'duration' ? ' 分钟' : '');
    }
  }

  // 更新连续天数
  var streakEl = card.querySelector('.habit-streak');
  if (streakEl) {
    streakEl.textContent = streak > 0 ? ' ' + streak + '天' : '';
  }

  // Issue #128：连续打卡里程碑（每 7 天）触发 DNA 链生长彩蛋
  if (streak > 0 && streak % 7 === 0 && typeof window.BioEggs === 'object' &&
      typeof window.BioEggs.dnaGrow === 'function') {
    try { window.BioEggs.dnaGrow(streakEl || card); } catch (e) {}
  }

  // 更新周视图今天状态
  var weeklyDays = card.querySelectorAll('.habit-weekly-day');
  if (weeklyDays.length > 0) {
    var todayIdx = weeklyDays.length - 1;
    var todayDay = weeklyDays[todayIdx];
    if (todayDay && completed) {
      todayDay.classList.add('completed');
      todayDay.style.background = habit.color;
    }
  }

  // 检查新徽章并 toast
  var newBadges = checkBadges();
  if (newBadges.length > 0) {
    for (var b = 0; b < newBadges.length; b++) {
      showToast('获得徽章：' + newBadges[b].name, 'success');
    }
  }
}

function showHabitModal(habit, container) {
  _releaseHabitModal();
  var isEdit = !!habit;
  var overlay = document.createElement('div');
  overlay.className = 'habit-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', isEdit ? '编辑习惯' : '新建习惯');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;';

  var colorPresets = ['#5a7d5c','#e8a87c','#c38d9e','#7a9cc6','#c47a4a','#8a6ac4','#4a9c6a','#c45a7a','#c49a4a','#4aaac4'];
  var typeTabs = [{v:'count',l:'次数'},{v:'duration',l:'时长（分钟）'},{v:'boolean',l:'是否完成'}];
  var freqOpts = [{v:'daily',l:'每天'},{v:'weekly',l:'每周'}];

  var currentColor = isEdit ? (habit.color || '#5a7d5c') : '#5a7d5c';
  var currentType = isEdit ? (habit.targetType || 'count') : 'count';
  var currentFreq = isEdit ? (habit.frequency || 'daily') : 'daily';

  var html = '<div class="habit-modal">';
  html += '<div class="habit-modal-header">';
  html += '<div class="habit-modal-title">' + (isEdit ? '编辑习惯' : '新建习惯') + '</div>';
  html += '<button class="habit-modal-close" id="habit-modal-close">×</button>';
  html += '</div>';

  // 名称
  html += '<div class="habit-form-group">';
  html += '<div class="habit-form-label">习惯名称</div>';
  html += '<input type="text" class="habit-form-input" id="hm-name" value="' + (isEdit ? habit.name : '') + '" placeholder="例如：每日背单词">';
  html += '</div>';

  // 颜色选择器
  html += '<div class="habit-form-group">';
  html += '<div class="habit-form-label">主题色</div>';
  html += '<div class="habit-color-presets" id="hm-color-presets">';
  for (var ci = 0; ci < colorPresets.length; ci++) {
    var colSel = currentColor === colorPresets[ci] ? ' selected' : '';
    html += '<div class="habit-color-swatch' + colSel + '" data-color="' + colorPresets[ci] + '" style="background:' + colorPresets[ci] + ';"></div>';
  }
  html += '<div class="habit-color-input-wrap" title="自定义颜色">';
  html += '<input type="color" id="hm-color-custom" value="' + currentColor + '">';
  html += '</div>';
  html += '</div>';
  html += '<input type="hidden" id="hm-color" value="' + currentColor + '">';
  html += '</div>';

  // 目标类型（标签式）
  html += '<div class="habit-form-group">';
  html += '<div class="habit-form-label">目标类型</div>';
  html += '<div class="habit-type-tabs" id="hm-type-tabs">';
  for (var ti = 0; ti < typeTabs.length; ti++) {
    var tSel = currentType === typeTabs[ti].v ? ' active' : '';
    html += '<button class="habit-type-tab' + tSel + '" data-type="' + typeTabs[ti].v + '">' + typeTabs[ti].l + '</button>';
  }
  html += '</div>';
  html += '<input type="hidden" id="hm-targetType" value="' + currentType + '">';
  html += '</div>';

  // 目标值
  html += '<div class="habit-form-group">';
  html += '<div class="habit-form-label">目标值</div>';
  html += '<input type="number" class="habit-form-input" id="hm-targetValue" value="' + (isEdit ? habit.targetValue : '1') + '" min="1">';
  html += '</div>';

  // 每次打卡增量
  html += '<div class="habit-form-group" id="hm-step-group">';
  html += '<div class="habit-form-label">每次打卡增量</div>';
  html += '<input type="number" class="habit-form-input" id="hm-step" value="' + (isEdit ? (habit.step || (habit.targetType === 'duration' ? 25 : 1)) : '1') + '" min="1">';
  html += '</div>';

  // 频率
  html += '<div class="habit-form-group">';
  html += '<div class="habit-form-label">频率</div>';
  html += '<select class="habit-form-select" id="hm-frequency">';
  for (var fi = 0; fi < freqOpts.length; fi++) {
    var fsel = currentFreq === freqOpts[fi].v ? ' selected' : '';
    html += '<option value="' + freqOpts[fi].v + '"' + fsel + '>' + freqOpts[fi].l + '</option>';
  }
  html += '</select>';
  html += '</div>';

  html += '<button class="habit-save-btn" id="hm-save">' + (isEdit ? '保存修改' : '创建习惯') + '</button>';
  html += '</div>';

  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  // 焦点陷阱：ESC 关闭、初始聚焦到名称输入
  if (window.BioQuestA11y && typeof window.BioQuestA11y.trapFocus === 'function') {
    _habitFocusTrap = window.BioQuestA11y.trapFocus(overlay, {
      onEscape: closeModal,
      initialFocus: overlay.querySelector('#hm-name')
    });
  }

  function closeModal() {
    _releaseHabitModal();
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  document.getElementById('habit-modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeModal();
  });

  // 颜色选择交互
  var colorSwatches = overlay.querySelectorAll('.habit-color-swatch');
  var colorInput = document.getElementById('hm-color');
  var customColorInput = document.getElementById('hm-color-custom');
  function setColor(val) {
    colorInput.value = val;
    colorSwatches.forEach(function(s) {
      s.classList.toggle('selected', s.dataset.color === val);
    });
  }
  colorSwatches.forEach(function(el) {
    el.addEventListener('click', function() { setColor(el.dataset.color); });
  });
  if (customColorInput) {
    customColorInput.addEventListener('input', function() { setColor(customColorInput.value); });
  }

  // 目标类型标签交互
  var typeTabEls = overlay.querySelectorAll('.habit-type-tab');
  var typeInput = document.getElementById('hm-targetType');
  typeTabEls.forEach(function(el) {
    el.addEventListener('click', function() {
      typeTabEls.forEach(function(t) { t.classList.remove('active'); });
      el.classList.add('active');
      typeInput.value = el.dataset.type;
    });
  });

  document.getElementById('hm-save').addEventListener('click', function() {
    var name = document.getElementById('hm-name').value.trim();
    var color = document.getElementById('hm-color').value;
    var targetType = document.getElementById('hm-targetType').value;
    var targetValue = parseInt(document.getElementById('hm-targetValue').value, 10) || 1;
    var step = parseInt(document.getElementById('hm-step').value, 10) || 1;
    var frequency = document.getElementById('hm-frequency').value;

    if (!name) {
      showToast('请输入习惯名称', 'error');
      return;
    }

    if (isEdit) {
      updateHabit(habit.id, { name: name, color: color, targetType: targetType, targetValue: targetValue, step: step, frequency: frequency });
    } else {
      createHabit({ name: name, color: color, targetType: targetType, targetValue: targetValue, step: step, frequency: frequency });
    }

    closeModal();
    renderHabitsPage(container);
  });
}

/* ---------- 入口 ---------- */

function initHabits(target) {
  syncAutoHabits();
  var newBadges = checkBadges();
  if (newBadges.length > 0) {
    newBadges.forEach(function(b) {
      showToast('获得徽章：' + b.name, 'success');
    });
  }
  renderHabitsPage(target);
}

/* ---------- 挂载 ---------- */

window.initHabits = initHabits;
window.getHabits = getHabits;
window.saveHabits = saveHabits;
window.getHabitLogs = getHabitLogs;
window.saveHabitLogs = saveHabitLogs;
window.getBadges = getBadges;
window.saveBadges = saveBadges;
window.createHabit = createHabit;
window.updateHabit = updateHabit;
window.deleteHabit = deleteHabit;
window.toggleHabitActive = toggleHabitActive;
window.logHabit = logHabit;
window.getHabitStreak = getHabitStreak;
window.getWeeklyHeatmap = getWeeklyHeatmap;
window.getMonthlyCalendar = getMonthlyCalendar;
window.syncAutoHabits = syncAutoHabits;
window.checkBadges = checkBadges;
window.getTodayLog = getTodayLog;
