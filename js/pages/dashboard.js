/**
 * ============================================================
 * TATABOX — 仪表盘模块（不背单词风格）
 * 整合诊断、Bio Score、学习计划、趋势分析
 * 设计：大圆环进度 + 横向统计卡 + 今日计划 + 诊断摘要
 * ============================================================
 */

'use strict';

var _dashboardStylesInjected = false;

function injectDashboardStyles() {
  if (_dashboardStylesInjected) return;
  _dashboardStylesInjected = true;

  var style = document.createElement('style');
  style.id = 'bioquest-dashboard-styles';
  style.textContent = [
    /* 页面容器 */
    '.dashboard-page {',
    '  max-width: 900px;',
    '  margin: 0 auto;',
    '  padding: 24px 20px 80px;',
    '}',

    /* 头部问候 */
    '.dash-header {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  margin-bottom: 28px;',
    '}',
    '.dash-greeting {',
    '  font-family: var(--font-serif, "Noto Serif SC", serif);',
    '  font-size: 1.5rem;',
    '  font-weight: 700;',
    '  color: var(--color-deep, #1a3a2a);',
    '  margin: 0 0 4px;',
    '}',
    '.dash-date {',
    '  font-size: 0.82rem;',
    '  color: var(--text-muted, #8a8a8a);',
    '}',
    '.dash-avatar {',
    '  width: 44px;',
    '  height: 44px;',
    '  border-radius: 50%;',
    '  background: var(--color-sage, #5a7d5c);',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  color: #fff;',
    '  font-size: 1.1rem;',
    '  font-weight: 700;',
    '  flex-shrink: 0;',
    '  cursor: pointer;',
    '}',

    /* 今日目标圆环 */
    '.dash-goal-section {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 24px;',
    '  background: var(--surface-primary, #fff);',
    '  border-radius: var(--radius-lg, 12px);',
    '  padding: 28px 24px;',
    '  box-shadow: var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));',
    '  margin-bottom: 20px;',
    '}',
    '.dash-goal-ring {',
    '  position: relative;',
    '  width: 120px;',
    '  height: 120px;',
    '  flex-shrink: 0;',
    '}',
    '.dash-goal-ring svg {',
    '  transform: rotate(-90deg);',
    '}',
    '.dash-goal-center {',
    '  position: absolute;',
    '  inset: 0;',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  justify-content: center;',
    '}',
    '.dash-goal-num {',
    '  font-size: 1.8rem;',
    '  font-weight: 700;',
    '  font-family: var(--font-mono, monospace);',
    '  color: var(--color-deep, #1a3a2a);',
    '  line-height: 1;',
    '}',
    '.dash-goal-label {',
    '  font-size: 0.7rem;',
    '  color: var(--text-muted, #8a8a8a);',
    '  margin-top: 4px;',
    '}',
    '.dash-goal-info {',
    '  flex: 1;',
    '  min-width: 0;',
    '}',
    '.dash-goal-title {',
    '  font-size: 1.05rem;',
    '  font-weight: 600;',
    '  color: var(--text-primary, #1a1a1a);',
    '  margin-bottom: 6px;',
    '}',
    '.dash-goal-desc {',
    '  font-size: 0.82rem;',
    '  color: var(--text-secondary, #4a4a4a);',
    '  line-height: 1.5;',
    '  margin-bottom: 12px;',
    '}',
    '.dash-goal-btn {',
    '  display: inline-block;',
    '  padding: 8px 20px;',
    '  background: var(--color-sage, #5a7d5c);',
    '  color: #fff;',
    '  border: none;',
    '  border-radius: 16px;',
    '  font-size: 0.85rem;',
    '  font-weight: 500;',
    '  cursor: pointer;',
    '  transition: opacity 0.2s, transform 0.15s;',
    '}',
    '.dash-goal-btn:active {',
    '  transform: scale(0.96);',
    '}',
    '.dash-goal-btn--outline {',
    '  background: transparent;',
    '  color: var(--color-sage, #5a7d5c);',
    '  border: 1.5px solid var(--color-sage, #5a7d5c);',
    '}',

    /* 横向统计卡 */
    '.dash-stats-row {',
    '  display: grid;',
    '  grid-template-columns: repeat(4, 1fr);',
    '  gap: 12px;',
    '  margin-bottom: 20px;',
    '}',
    '.dash-stat-card {',
    '  background: var(--surface-primary, #fff);',
    '  border-radius: var(--radius-md, 8px);',
    '  padding: 16px 12px;',
    '  text-align: center;',
    '  box-shadow: var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));',
    '  cursor: pointer;',
    '  transition: transform 0.15s, box-shadow 0.15s;',
    '}',
    '.dash-stat-card:active {',
    '  transform: scale(0.97);',
    '}',
    '.dash-stat-num {',
    '  font-size: 1.5rem;',
    '  font-weight: 700;',
    '  font-family: var(--font-mono, monospace);',
    '  color: var(--color-deep, #1a3a2a);',
    '  line-height: 1.2;',
    '}',
    '.dash-stat-label {',
    '  font-size: 0.72rem;',
    '  color: var(--text-muted, #8a8a8a);',
    '  margin-top: 4px;',
    '}',
    '.dash-stat-card--accent .dash-stat-num {',
    '  color: var(--color-sage, #5a7d5c);',
    '}',
    '.dash-stat-card--amber .dash-stat-num {',
    '  color: var(--color-amber, #c4956a);',
    '}',

    /* 区块卡片 */
    '.dash-section {',
    '  background: var(--surface-primary, #fff);',
    '  border-radius: var(--radius-lg, 12px);',
    '  padding: 24px 20px;',
    '  box-shadow: var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));',
    '  margin-bottom: 16px;',
    '}',
    '.dash-section-header {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  margin-bottom: 16px;',
    '}',
    '.dash-section-title {',
    '  font-family: var(--font-serif, "Noto Serif SC", serif);',
    '  font-size: 1.1rem;',
    '  font-weight: 700;',
    '  color: var(--color-deep, #1a3a2a);',
    '}',
    '.dash-section-link {',
    '  font-size: 0.8rem;',
    '  color: var(--color-sage, #5a7d5c);',
    '  text-decoration: none;',
    '  cursor: pointer;',
    '}',

    /* Bio Score 卡片 */
    '.dash-bioscore {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 20px;',
    '}',
    '.dash-bioscore-grade {',
    '  width: 64px;',
    '  height: 64px;',
    '  border-radius: 50%;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  font-size: 1.6rem;',
    '  font-weight: 700;',
    '  font-family: var(--font-serif, serif);',
    '  color: #fff;',
    '  flex-shrink: 0;',
    '}',
    '.dash-bioscore-info {',
    '  flex: 1;',
    '}',
    '.dash-bioscore-score {',
    '  font-size: 2rem;',
    '  font-weight: 700;',
    '  font-family: var(--font-mono, monospace);',
    '  color: var(--color-deep, #1a3a2a);',
    '  line-height: 1;',
    '}',
    '.dash-bioscore-label {',
    '  font-size: 0.78rem;',
    '  color: var(--text-muted, #8a8a8a);',
    '  margin-top: 4px;',
    '}',
    '.dash-bioscore-bars {',
    '  display: flex;',
    '  gap: 4px;',
    '  margin-top: 8px;',
    '}',
    '.dash-bioscore-bar {',
    '  flex: 1;',
    '  height: 4px;',
    '  border-radius: 2px;',
    '  background: var(--border-light, #ece8e1);',
    '  overflow: hidden;',
    '}',
    '.dash-bioscore-bar-fill {',
    '  height: 100%;',
    '  border-radius: 2px;',
    '  transition: width 0.6s ease;',
    '}',

    /* 诊断摘要 - 薄弱模块 */
    '.dash-weak-list {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 10px;',
    '}',
    '.dash-weak-item {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 12px;',
    '  padding: 12px 14px;',
    '  background: var(--surface-secondary, #faf7f2);',
    '  border-radius: var(--radius-md, 8px);',
    '  cursor: pointer;',
    '  transition: background 0.15s;',
    '}',
    '.dash-weak-item:active {',
    '  background: var(--border-light, #ece8e1);',
    '}',
    '.dash-weak-icon {',
    '  width: 36px;',
    '  height: 36px;',
    '  border-radius: 8px;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  font-size: 1.1rem;',
    '  flex-shrink: 0;',
    '}',
    '.dash-weak-info {',
    '  flex: 1;',
    '  min-width: 0;',
    '}',
    '.dash-weak-name {',
    '  font-size: 0.88rem;',
    '  font-weight: 600;',
    '  color: var(--text-primary, #1a1a1a);',
    '}',
    '.dash-weak-desc {',
    '  font-size: 0.72rem;',
    '  color: var(--text-muted, #8a8a8a);',
    '  margin-top: 2px;',
    '}',
    '.dash-weak-acc {',
    '  font-size: 1rem;',
    '  font-weight: 700;',
    '  font-family: var(--font-mono, monospace);',
    '  flex-shrink: 0;',
    '}',

    /* 今日计划列表 */
    '.dash-plan-list {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 10px;',
    '}',
    '.dash-plan-item {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 12px;',
    '  padding: 14px 16px;',
    '  background: var(--surface-secondary, #faf7f2);',
    '  border-radius: var(--radius-md, 8px);',
    '  border-left: 3px solid var(--color-sage, #5a7d5c);',
    '  cursor: pointer;',
    '  transition: transform 0.15s;',
    '}',
    '.dash-plan-item:active {',
    '  transform: scale(0.98);',
    '}',
    '.dash-plan-icon {',
    '  font-size: 1.3rem;',
    '  flex-shrink: 0;',
    '}',
    '.dash-plan-info {',
    '  flex: 1;',
    '  min-width: 0;',
    '}',
    '.dash-plan-title {',
    '  font-size: 0.9rem;',
    '  font-weight: 600;',
    '  color: var(--text-primary, #1a1a1a);',
    '}',
    '.dash-plan-desc {',
    '  font-size: 0.75rem;',
    '  color: var(--text-muted, #8a8a8a);',
    '  margin-top: 2px;',
    '}',
    '.dash-plan-arrow {',
    '  color: var(--text-muted, #8a8a8a);',
    '  font-size: 0.9rem;',
    '}',

    /* 趋势 mini chart */
    '.dash-trend-chart {',
    '  display: flex;',
    '  align-items: flex-end;',
    '  gap: 6px;',
    '  height: 80px;',
    '  padding-top: 8px;',
    '}',
    '.dash-trend-bar {',
    '  flex: 1;',
    '  min-width: 0;',
    '  border-radius: 4px 4px 0 0;',
    '  transition: height 0.4s ease, opacity 0.2s;',
    '  position: relative;',
    '  cursor: pointer;',
    '}',
    '.dash-trend-bar:hover {',
    '  opacity: 0.8;',
    '}',
    '.dash-trend-bar-label {',
    '  position: absolute;',
    '  bottom: -20px;',
    '  left: 50%;',
    '  transform: translateX(-50%);',
    '  font-size: 0.6rem;',
    '  color: var(--text-muted, #8a8a8a);',
    '  white-space: nowrap;',
    '}',
    '.dash-trend-summary {',
    '  display: flex;',
    '  justify-content: space-between;',
    '  align-items: center;',
    '  margin-top: 28px;',
    '  padding-top: 12px;',
    '  border-top: 1px solid var(--border-light, #ece8e1);',
    '}',
    '.dash-trend-trend {',
    '  font-size: 0.85rem;',
    '  font-weight: 600;',
    '}',

    /* 空状态 */
    '.dash-empty {',
    '  text-align: center;',
    '  padding: 40px 20px;',
    '  color: var(--text-muted, #8a8a8a);',
    '}',
    '.dash-empty-icon {',
    '  font-size: 2.5rem;',
    '  margin-bottom: 12px;',
    '  opacity: 0.3;',
    '}',
    '.dash-empty-text {',
    '  font-size: 0.9rem;',
    '  margin-bottom: 16px;',
    '}',

    /* 响应式 */
    '@media (max-width: 640px) {',
    '  .dash-stats-row {',
    '    grid-template-columns: repeat(2, 1fr);',
    '  }',
    '  .dash-goal-section {',
    '    flex-direction: column;',
    '    text-align: center;',
    '    gap: 16px;',
    '  }',
    '  .dash-goal-info {',
    '    text-align: center;',
    '  }',
    '  .dash-bioscore {',
    '    flex-direction: column;',
    '    text-align: center;',
    '  }',
    '}',
    '@media (max-width: 480px) {',
    '  .dash-stats-row {',
    '    grid-template-columns: repeat(2, 1fr);',
    '    gap: 8px;',
    '  }',
    '  .dash-stat-card {',
    '    padding: 12px 8px;',
    '  }',
    '  .dash-stat-num {',
    '    font-size: 1.25rem;',
    '  }',
    '}',
    '',
    '.dash-mood-widget {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 14px;',
    '  padding: 12px 16px;',
    '  background: var(--color-bg-warm, #f5f0e8);',
    '  border-radius: 16px;',
    '  border: 1px solid var(--border-light, #ece8e1);',
    '  margin-bottom: 14px;',
    '}',
    '.dash-mood-widget-icon { font-size: 1.6rem; }',
    '.dash-mood-widget-info { flex: 1; }',
    '.dash-mood-widget-label { font-size: 0.95rem; font-weight: 600; color: var(--color-deep, #1a3a2a); }',
    '.dash-mood-widget-count { font-size: 0.78rem; color: var(--text-muted, #8a8a8a); }',
    '.dash-mood-widget-btn {',
    '  padding: 8px 16px;',
    '  background: var(--color-sage, #5a7d5c);',
    '  color: #fff;',
    '  border: none;',
    '  border-radius: 8px;',
    '  font-size: 0.85rem;',
    '  font-weight: 600;',
    '  cursor: pointer;',
    '  font-family: inherit;',
    '}',
    '.dash-mood-widget-btn:hover { background: #4a6d4c; }'
  ].join('\n');
  document.head.appendChild(style);
}

/**
 * 获取用户问候语
 */
function _getGreeting() {
  var h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/**
 * 从 localStorage 读取用户统计数据
 */
function _getUserStats() {
  try {
    var raw = localStorage.getItem('tatabox_stats');
    if (!raw) return { totalAnswered: 0, totalCorrect: 0, modules: {} };
    var stats = JSON.parse(raw);
    return {
      totalAnswered: stats.totalAnswered || 0,
      totalCorrect: stats.totalCorrect || 0,
      modules: stats.modules || {},
      streak: stats.streak || 0,
      practiceCount: stats.practiceCount || 0
    };
  } catch (e) {
    return { totalAnswered: 0, totalCorrect: 0, modules: {} };
  }
}

/**
 * 读取练习历史（兼容 bioquest_history 和 bioquest_practice_history 两个 key）
 */
function _loadPracticeHistory() {
  var sources = ['tatabox_history', 'tatabox_practice_history', 'tatabox_records'];
  for (var s = 0; s < sources.length; s++) {
    try {
      var raw = localStorage.getItem(sources[s]);
      if (!raw) continue;
      var arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch (e) {}
  }
  return [];
}

/**
 * 归一化一条历史记录，返回 { date:'YYYY-MM-DD', correct, total } 或 null
 */
function _normalizeHistoryEntry(item) {
  if (!item) return null;
  // 解析日期：优先显式 date；缺失时用【本地时区】从 timestamp 推导
  // （避免 toISOString() UTC 在正时区把「今天」归到昨天）
  var dateStr = item.date || (item.timestamp ? localDateStr(item.timestamp) : null);
  if (!dateStr) return null;
  if (dateStr.length > 10) dateStr = dateStr.slice(0, 10);
  // 解析正确数/总数
  var correct = 0, total = 0;
  if (typeof item.correct === 'number' && typeof item.total === 'number') {
    correct = item.correct; total = item.total;
  } else if (typeof item.totalQuestions === 'number' || typeof item.correctCount === 'number') {
    total = item.totalQuestions || 0;
    correct = item.correctCount || 0;
    // 防御旧考试记录：correctCount 曾为「子题正确数」，可能 > 题目数
    if (total > 0 && correct > total) correct = total;
  } else if (Array.isArray(item.answers) && item.answers.length > 0) {
    total = item.answers.length;
    for (var a = 0; a < item.answers.length; a++) {
      if (item.answers[a] && item.answers[a].correct) correct++;
    }
  } else if (typeof item.isCorrect === 'boolean') {
    total = 1;
    correct = item.isCorrect ? 1 : 0;
  } else {
    total = 1; // 至少算作一条练习记录
  }
  return { date: dateStr, correct: correct, total: total };
}

/**
 * 获取今日练习数
 */
function _getTodayCount() {
  try {
    var history = _loadPracticeHistory();
    // 本地时区「今天」，与历史记录的本地日期对齐（避免 UTC 错位漏计）
    var todayStr = localTodayStr();
    var count = 0;
    for (var i = 0; i < history.length; i++) {
      var norm = _normalizeHistoryEntry(history[i]);
      if (norm && norm.date === todayStr) {
        count += norm.total || 1;
      }
    }
    return count;
  } catch (e) {
    return 0;
  }
}

/**
 * 获取最近 N 天的练习趋势
 */
function _getTrendData(days) {
  try {
    var history = _loadPracticeHistory();
    // 按日期聚合
    var dayMap = {};
    for (var i = 0; i < history.length; i++) {
      var norm = _normalizeHistoryEntry(history[i]);
      if (!norm) continue;
      if (!dayMap[norm.date]) dayMap[norm.date] = { count: 0, correct: 0 };
      dayMap[norm.date].count += norm.total;
      dayMap[norm.date].correct += norm.correct;
    }
    var now = new Date();
    var result = [];
    for (var d = days - 1; d >= 0; d--) {
      var dt = new Date(now);
      dt.setDate(dt.getDate() - d);
      var dStr = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
      var info = dayMap[dStr] || { count: 0, correct: 0 };
      result.push({
        date: dt,
        count: info.count,
        accuracy: info.count > 0 ? Math.round(info.correct / info.count * 100) : 0
      });
    }
    return result;
  } catch (e) {
    return [];
  }
}

/**
 * 获取连续打卡天数（从 bioquest_habit_logs 统计，只要有任意习惯完成即算）
 */
function _getStreak() {
  try {
    var raw = localStorage.getItem('tatabox_habit_logs');
    if (!raw) return 0;
    var logs = JSON.parse(raw);
    if (!Array.isArray(logs)) return 0;
    // 收集所有完成打卡的日期集合
    var completedDates = {};
    for (var i = 0; i < logs.length; i++) {
      if (logs[i].completed && logs[i].date) {
        completedDates[logs[i].date] = true;
      }
    }
    var streak = 0;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    for (var d = 0; d < 365; d++) {
      var dt = new Date(today);
      dt.setDate(dt.getDate() - d);
      var key = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
      if (completedDates[key]) {
        streak++;
      } else if (d > 0) {
        break;
      }
    }
    return streak;
  } catch (e) {
    return 0;
  }
}

/**
 * 构建 Bio Score 等级颜色
 */
function _getGradeColor(grade) {
  var colors = {
    'S+': '#9d2933', 'S': '#c49a4a', 'A+': '#5a7d5c', 'A': '#5a7bc4',
    'B+': '#6a8ac4', 'B': '#7a9ac4', 'C+': '#8aaac4', 'C': '#9abac4',
    'D+': '#aaa', 'D': '#bbb'
  };
  return colors[grade] || '#5a7d5c';
}

/**
 * 渲染今日目标圆环 SVG
 */
function _renderGoalRing(progress, color) {
  var r = 52;
  var c = 2 * Math.PI * r;
  var offset = c * (1 - progress / 100);
  return '<svg width="120" height="120" viewBox="0 0 120 120">' +
    '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="var(--border-light, #ece8e1)" stroke-width="8"/>' +
    '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" ' +
    'stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + offset + '" ' +
    'style="transition:stroke-dashoffset 0.8s ease;"/>' +
    '</svg>';
}

/**
 * 渲染 Bio Score 维度条
 */
function _renderBioScoreBars(components) {
  if (!components) return '';
  var dims = [
    { key: 'B', label: '基础', color: '#5a7d5c' },
    { key: 'I', label: '洞察', color: '#c49a4a' },
    { key: 'O', label: '活跃', color: '#5a7bc4' },
    { key: 'G', label: '成长', color: '#c47a4a' },
    { key: 'C', label: '一致', color: '#8a6ac4' },
    { key: 'D', label: '难度', color: '#4a9c6a' }
  ];
  return dims.map(function(d) {
    var val = Math.round(components[d.key] || 0);
    return '<div class="dash-bioscore-bar" title="' + d.label + ': ' + val + '">' +
      '<div class="dash-bioscore-bar-fill" style="width:' + val + '%;background:' + d.color + ';"></div>' +
      '</div>';
  }).join('');
}

/**
 * 主渲染函数
 */
function renderDashboardPage(target) {
  injectDashboardStyles();

  var stats = _getUserStats();
  var todayCount = _getTodayCount();
  var streak = _getStreak();
  var trend = _getTrendData(7);
  var dailyGoal = 20; // 每日目标 20 题
  var goalProgress = Math.min(100, Math.round(todayCount / dailyGoal * 100));

  // 用户名
  var userName = '同学';
  try {
    var user = window.getCurrentUser ? window.getCurrentUser() : null;
    if (user && user.display_name) userName = user.display_name;
  } catch (e) {}

  // Bio Score
  var bioScore = null;
  try {
    if (typeof calcBioScore === 'function') {
      bioScore = calcBioScore(stats);
    }
  } catch (e) {}

  // 模块掌握度排名
  var moduleLabels = {
    'module_1': { name: '生化与细胞', color: '#5a7bc4' },
    'module_2': { name: '植物与微生物', color: '#5aaa5a' },
    'module_3': { name: '动物与生态', color: '#c45a7a' },
    'module_4': { name: '遗传与进化', color: '#c47a4a' }
  };
  var weakModules = [];
  Object.keys(moduleLabels).forEach(function(key) {
    var m = stats.modules[key] || {};
    var total = m.totalAnswered || 0;
    var correct = m.totalCorrect || 0;
    var acc = total > 0 ? Math.round(correct / total * 100) : -1;
    if (acc >= 0 && acc < 70) {
      weakModules.push({ key: key, name: moduleLabels[key].name, color: moduleLabels[key].color, acc: acc, total: total });
    }
  });
  weakModules.sort(function(a, b) { return a.acc - b.acc; });
  var topWeak = weakModules.slice(0, 3);

  // 趋势数据
  var hasTrend = trend.some(function(t) { return t.count > 0; });
  var trendMax = Math.max.apply(null, trend.map(function(t) { return t.count; }).concat([1]));
  var recentAcc = 0, recentCount = 0;
  trend.forEach(function(t) { recentAcc += t.accuracy * t.count; recentCount += t.count; });
  var avgAcc = recentCount > 0 ? Math.round(recentAcc / recentCount) : 0;
  var trendDirection = 'stable';
  if (trend.length >= 4) {
    // 通用等分（前 ceil(n/2) 天 vs 后 n - ceil(n/2) 天），按答题数加权，
    // 避免「未练习的天（count=0）」压低段内均值造成趋势误判
    function _wAvg(seg) {
      var wc = 0, wn = 0;
      for (var s = 0; s < seg.length; s++) {
        wc += seg[s].accuracy * seg[s].count;
        wn += seg[s].count;
      }
      return wn > 0 ? wc / wn : 0;
    }
    var mid = Math.ceil(trend.length / 2);
    var firstHalf = _wAvg(trend.slice(0, mid));
    var secondHalf = _wAvg(trend.slice(mid));
    if (secondHalf > firstHalf + 5) trendDirection = 'up';
    else if (secondHalf < firstHalf - 5) trendDirection = 'down';
  }

  // 构建 HTML
  var html = '<div class="dashboard-page">';

  // 头部（头像：优先 getAvatarUrl()，无头像用首字母兜底）
  var _avatarUrl = (typeof getAvatarUrl === 'function') ? getAvatarUrl() : null;
  var _avatarInner = _avatarUrl
    ? '<img src="' + _avatarUrl + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">'
    : escapeHtml(userName.charAt(0));
  html += '<div class="dash-header">' +
    '<div><h2 class="dash-greeting">' + _getGreeting() + '，' + escapeHtml(userName) + '</h2>' +
    '<p class="dash-date">' + new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) + '</p></div>' +
    '<div class="dash-avatar" data-on=\'["navigateTo","/user"]\' style="' + (_avatarUrl ? 'background:none;' : '') + 'overflow:hidden;">' + _avatarInner + '</div>' +
    '</div>';

  // v4.0 今日情绪卡片（常驻）
  html += '<div id="dash-mood-widget"></div>';

  // 今日目标圆环
  var goalColor = goalProgress >= 100 ? '#5a7d5c' : goalProgress >= 50 ? '#c49a4a' : '#c4a4a4';
  html += '<div class="dash-goal-section">' +
    '<div class="dash-goal-ring">' +
    _renderGoalRing(goalProgress, goalColor) +
    '<div class="dash-goal-center">' +
    '<span class="dash-goal-num">' + todayCount + '/' + dailyGoal + '</span>' +
    '<span class="dash-goal-label">今日目标</span>' +
    '</div></div>' +
    '<div class="dash-goal-info">' +
    '<div class="dash-goal-title">' + (goalProgress >= 100 ? '今日目标已完成' : '继续努力，完成今日目标') + '</div>' +
    '<div class="dash-goal-desc">每日练习 ' + dailyGoal + ' 题，巩固知识点，稳步提升</div>' +
    (goalProgress >= 100 ?
      '<button class="dash-goal-btn dash-goal-btn--outline" data-on=\'["navigateTo","/practice"]\'>再来一组</button>' :
      '<button class="dash-goal-btn" data-on=\'["navigateTo","/practice"]\'>开始练习</button>') +
    '</div></div>';

  // 横向统计卡
  var accuracy = stats.totalAnswered > 0 ? Math.round(stats.totalCorrect / stats.totalAnswered * 100) : 0;
  html += '<div class="dash-stats-row">' +
    '<div class="dash-stat-card dash-stat-card--accent" data-on=\'["navigateTo","/habits"]\'>' +
    '<div class="dash-stat-num">' + streak + '</div><div class="dash-stat-label">连续打卡</div></div>' +
    '<div class="dash-stat-card" data-on=\'["navigateTo","/analytics"]\'>' +
    '<div class="dash-stat-num">' + stats.totalAnswered + '</div><div class="dash-stat-label">总答题数</div></div>' +
    '<div class="dash-stat-card dash-stat-card--amber" data-on=\'["navigateTo","/analytics"]\'>' +
    '<div class="dash-stat-num">' + accuracy + '%</div><div class="dash-stat-label">正确率</div></div>' +
    '<div class="dash-stat-card" data-on=\'["navigateTo","/analytics"]\'>' +
    '<div class="dash-stat-num">' + (bioScore ? bioScore.score : '--') + '</div><div class="dash-stat-label">Bio Score</div></div>' +
    '</div>';

  // Bio Score 详情
  if (bioScore) {
    html += '<div class="dash-section">' +
      '<div class="dash-section-header">' +
      '<span class="dash-section-title">Bio Score 生物素养</span>' +
      '<span class="dash-section-link" data-on=\'["navigateTo","/analytics"]\'>详情 ›</span>' +
      '</div>' +
      '<div class="dash-bioscore">' +
      '<div class="dash-bioscore-grade" style="background:' + _getGradeColor(bioScore.grade) + ';">' + escapeHtml(bioScore.grade) + '</div>' +
      '<div class="dash-bioscore-info">' +
      '<div class="dash-bioscore-score">' + bioScore.score + '</div>' +
      '<div class="dash-bioscore-label">' + escapeHtml(bioScore.letter || '') + ' · 六维综合评分</div>' +
      '<div class="dash-bioscore-bars">' + _renderBioScoreBars(bioScore.components) + '</div>' +
      '</div></div></div>';
  }

  // 诊断摘要 - 薄弱模块
  if (topWeak.length > 0) {
    html += '<div class="dash-section">' +
      '<div class="dash-section-header">' +
      '<span class="dash-section-title">薄弱模块诊断</span>' +
      '<span class="dash-section-link" data-on=\'["navigateTo","/diagnosis"]\'>完整诊断 ›</span>' +
      '</div>' +
      '<div class="dash-weak-list">';
    topWeak.forEach(function(m) {
      var accColor = m.acc < 40 ? '#c45a5a' : m.acc < 60 ? '#c49a4a' : '#5a7d5c';
      html += '<div class="dash-weak-item" data-on=\'["navigateTo","/practice"]\'>' +
        '<div class="dash-weak-info"><div class="dash-weak-name">' + escapeHtml(m.name) + '</div>' +
        '<div class="dash-weak-desc">' + m.total + '题已练 · 建议加强</div></div>' +
        '<div class="dash-weak-acc" style="color:' + accColor + ';">' + m.acc + '%</div>' +
        '</div>';
    });
    html += '</div></div>';
  }

  // 今日计划
  html += '<div class="dash-section">' +
    '<div class="dash-section-header">' +
    '<span class="dash-section-title">今日计划</span>' +
    '</div>' +
    '<div class="dash-plan-list">' +
    '<div class="dash-plan-item" data-on=\'["navigateTo","/practice"]\'>' +
    '<div class="dash-plan-info"><div class="dash-plan-title">每日练习</div>' +
    '<div class="dash-plan-desc">完成 ' + Math.max(0, dailyGoal - todayCount) + ' 题达到今日目标</div></div>' +
    '<span class="dash-plan-arrow">›</span></div>' +
    '<div class="dash-plan-item" data-on=\'["navigateTo","/review"]\'>' +
    '<div class="dash-plan-info"><div class="dash-plan-title">复习错题</div>' +
    '<div class="dash-plan-desc">基于遗忘曲线的复习安排</div></div>' +
    '<span class="dash-plan-arrow">›</span></div>';
  if (topWeak.length > 0) {
    html += '<div class="dash-plan-item" data-on=\'["navigateTo","/practice"]\' style="border-left-color:#c45a5a;">' +
      '<div class="dash-plan-info"><div class="dash-plan-title">专项突破</div>' +
      '<div class="dash-plan-desc">针对「' + escapeHtml(topWeak[0].name) + '」进行强化训练</div></div>' +
      '<span class="dash-plan-arrow">›</span></div>';
  }
  html += '</div></div>';

  // 7天趋势
  if (hasTrend) {
    html += '<div class="dash-section">' +
      '<div class="dash-section-header">' +
      '<span class="dash-section-title">近 7 天趋势</span>' +
      '<span class="dash-section-link" data-on=\'["navigateTo","/analytics"]\'>详情 ›</span>' +
      '</div>' +
      '<div class="dash-trend-chart">';
    trend.forEach(function(t) {
      var h = t.count > 0 ? Math.max(8, Math.round(t.count / trendMax * 72)) : 2;
      var color = t.accuracy >= 70 ? '#5a7d5c' : t.accuracy >= 50 ? '#c49a4a' : '#c4a4a4';
      if (t.count === 0) color = 'var(--border-light, #ece8e1)';
      var label = t.date.toLocaleDateString('zh-CN', { weekday: 'short' }).slice(1);
      html += '<div class="dash-trend-bar" style="height:' + h + 'px;background:' + color + ';" ' +
        'title="' + label + ': ' + t.count + '题, 正确率' + t.accuracy + '%">' +
        '<span class="dash-trend-bar-label">' + label + '</span></div>';
    });
    html += '</div>' +
      '<div class="dash-trend-summary">' +
      '<span style="font-size:0.82rem;color:var(--text-muted);">平均正确率 <strong style="color:var(--color-deep);">' + avgAcc + '%</strong></span>' +
      '<span class="dash-trend-trend" style="color:' + (trendDirection === 'up' ? '#5a7d5c' : trendDirection === 'down' ? '#c45a5a' : 'var(--text-muted)') + ';">' +
      (trendDirection === 'up' ? '上升中' : trendDirection === 'down' ? '需加油' : '→ 稳定') + '</span>' +
      '</div></div>';
  } else {
    html += '<div class="dash-section">' +
      '<div class="dash-empty">' +
      '<div class="dash-empty-text">开始练习后，这里会展示你的学习趋势</div>' +
      '<button class="dash-goal-btn" data-on=\'["navigateTo","/practice"]\'>立即开始</button>' +
      '</div></div>';
  }

  html += '</div>'; // .dashboard-page
  target.innerHTML = html;

  // 渲染今日情绪卡片
  _renderMoodWidget();
}

/**
 * v4.0 渲染情绪卡片
 */
function _renderMoodWidget() {
  var container = document.getElementById('dash-mood-widget');
  if (!container) return;
  if (!window.BioQuestMoodTracker || typeof window.BioQuestMoodTracker.renderMoodWidget !== 'function') {
    container.replaceChildren();
    return;
  }
  try {
    window.BioQuestMoodTracker.renderMoodWidget(container);
  } catch (e) {
    container.replaceChildren();
  }
}

/**
 * 模块入口
 */
function initDashboard(target) {
  if (!target) target = document.getElementById('page-content');
  if (!target) return;
  // P0-3: 先用 localStorage 即时渲染（首屏体验），再异步从 Supabase 刷新
  renderDashboardPage(target);
  _refreshDashboardFromSupabase(target);
}

/**
 * P0-3: 异步从 Supabase 拉取最新统计并刷新仪表盘
 * - 仅当用户已登录（非游客）时触发
 * - 拉取失败静默回退（首屏已用 localStorage 渲染）
 * - 拉取成功后更新 localStorage 缓存并重新渲染
 */
async function _refreshDashboardFromSupabase(target) {
  if (!target) return;
  // P0-3: 仅当 Supabase SDK 可用且用户已登录时才走云端，否则回退 localStorage
  if (typeof window.supabase === 'undefined') return;
  var loggedIn = false;
  try { loggedIn = typeof window.isLoggedIn === 'function' && window.isLoggedIn(); } catch (e) {}
  if (!loggedIn) return;
  if (typeof window.getUserStatsFromSupabase !== 'function') return;

  try {
    // 并行拉取三项数据
    var tasks = [
      window.getUserStatsFromSupabase(),
      (typeof window.getPracticeHistoryFromSupabase === 'function')
        ? window.getPracticeHistoryFromSupabase(200) : Promise.resolve(null),
      (typeof window.getHabitLogsFromSupabase === 'function')
        ? window.getHabitLogsFromSupabase() : Promise.resolve(null)
    ];
    var results = await Promise.all(tasks);
    var stats = results[0];
    var history = results[1];
    var habitLogs = results[2];

    // 如果 Supabase 没有任何数据（新用户/未迁移），保留 localStorage 不覆盖
    if (stats === null && history === null && habitLogs === null) return;

    // 把 Supabase 历史写入 localStorage 缓存（供 _loadPracticeHistory 读取）
    if (history && history.length > 0) {
      try { localStorage.setItem('tatabox_history', JSON.stringify(history)); } catch (e) {}
    }
    // 把 Supabase 打卡日志写入 localStorage 缓存（供 _getStreak 读取）
    if (habitLogs && habitLogs.length > 0) {
      try { localStorage.setItem('tatabox_habit_logs', JSON.stringify(habitLogs)); } catch (e) {}
    }

    // 重新渲染（getUserStatsFromSupabase 已写入 localStorage 'tatabox_stats'）
    // 仅当目标元素仍是当前仪表盘时才刷新，避免路由切换后误刷
    var hash = window.location.hash || '';
    var currentPage = hash.replace(/^#/, '').split('?')[0] || '/';
    if (currentPage === '/dashboard' || currentPage === '/') {
      renderDashboardPage(target);
    }
  } catch (e) {
    console.warn('[dashboard] Supabase 刷新失败，使用本地数据:', e && e.message);
  }
}

// 暴露到全局
window.initDashboard = initDashboard;
window.renderDashboardPage = renderDashboardPage;
