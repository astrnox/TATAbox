/**
 * ============================================================
 * TATABOX — 学习分析模块
 * 能力雷达图、错题本、学习统计
 * ============================================================
 */

'use strict';

/* CSP 便捷委托：原内联 onmouseover/onmouseout 的悬浮样式收敛为最小全局函数 */
if (typeof window._cspHoverIn !== 'function') {
  window._cspHoverIn = function (el) { el.style.transform = 'translateY(-1px)'; el.style.boxShadow = '0 4px 12px rgba(90,125,92,0.3)'; };
}
if (typeof window._cspHoverOut !== 'function') {
  window._cspHoverOut = function (el) { el.style.transform = ''; el.style.boxShadow = ''; };
}

let analyticStylesInjected = false;

function injectAnalyticsStyles() {
  if (analyticStylesInjected) return;
  analyticStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'bioquest-analytics-styles';
  style.textContent = `
    .analytics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }

    .analytics-card {
      background: var(--surface-primary, #ffffff);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-lg, 12px);
      padding: 28px;
      box-shadow: var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));
    }

    .analytics-card--full {
      grid-column: 1 / -1;
    }

    .analytics-card-title {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 4px;
    }

    .analytics-card-subtitle {
      font-size: 0.82rem;
      color: var(--text-muted, #8a8a8a);
      margin-bottom: 20px;
    }

    .radar-container {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 16px 0;
    }

    .radar-svg {
      max-width: 100%;
      height: auto;
    }

    .radar-axis-label {
      font-family: var(--font-sans);
      font-size: 0.72rem;
      fill: var(--text-secondary, #4a4a4a);
      text-anchor: middle;
    }

    .radar-value-label {
      font-family: var(--font-mono, monospace);
      font-size: 0.7rem;
      font-weight: 600;
      fill: var(--color-amber, #c4956a);
      text-anchor: middle;
    }

    .radar-polygon-fill {
      fill: rgba(196, 149, 106, 0.25);
      stroke: var(--color-deep, #1a3a2a);
      stroke-width: 2;
      stroke-linejoin: round;
    }

    .radar-grid-polygon {
      fill: none;
      stroke: var(--border-light, #ece8e1);
      stroke-width: 1;
    }

    .radar-axis-line {
      stroke: var(--border-light, #ece8e1);
      stroke-width: 1;
    }

    .wrong-book-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .wrong-book-group {
      margin-bottom: 8px;
    }

    .wrong-book-group-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--color-sage, #5a7d5c);
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border-light, #ece8e1);
    }

    .wrong-book-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: var(--surface-secondary, #faf7f2);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-md, 8px);
      gap: 12px;
      flex-wrap: wrap;
    }

    .wrong-book-item-left {
      flex: 1;
      min-width: 0;
    }

    .wrong-book-stem {
      font-size: 0.88rem;
      color: var(--text-primary, #1a1a1a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }

    .wrong-book-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .wrong-book-module {
      font-size: 0.7rem;
      font-weight: 500;
      padding: 2px 10px;
      border-radius: var(--radius-full, 9999px);
      background: rgba(90, 125, 92, 0.1);
      color: var(--color-sage, #5a7d5c);
    }

    .wrong-book-count {
      font-size: 0.72rem;
      color: var(--color-error, #c0553a);
      font-weight: 600;
    }

    .wrong-book-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }

    .wrong-book-btn {
      font-size: 0.78rem;
      padding: 6px 14px;
      border-radius: var(--radius-sm, 4px);
      border: 1px solid var(--border-default, #e0dcd5);
      background: var(--surface-primary, #ffffff);
      color: var(--text-secondary, #4a4a4a);
      cursor: pointer;
      font-weight: 500;
      transition: all var(--transition-fast, 0.15s ease);
      white-space: nowrap;
    }

    .wrong-book-btn:hover {
      border-color: var(--color-amber, #c4956a);
      color: var(--color-amber, #c4956a);
    }

    .wrong-book-btn--danger:hover {
      border-color: var(--color-error, #c0553a);
      color: var(--color-error, #c0553a);
    }

    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: var(--text-muted, #8a8a8a);
    }

    .empty-state-icon {
      font-size: 2.5rem;
      margin-bottom: 12px;
    }

    .empty-state-text {
      font-size: 0.95rem;
    }

    .stats-summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .stats-summary-item {
      text-align: center;
      padding: 20px 16px;
      background: var(--surface-secondary, #faf7f2);
      border-radius: var(--radius-md, 8px);
      border: 1px solid var(--border-light, #ece8e1);
    }

    .stats-summary-num {
      font-family: var(--font-mono, monospace);
      font-size: 1.8rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 4px;
    }

    .stats-summary-label {
      font-size: 0.78rem;
      color: var(--text-muted, #8a8a8a);
    }

    .stats-accuracy-bar {
      margin-bottom: 24px;
    }

    .stats-accuracy-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .stats-accuracy-label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-secondary, #4a4a4a);
    }

    .stats-accuracy-value {
      font-family: var(--font-mono, monospace);
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--color-sage, #5a7d5c);
    }

    .stats-accuracy-track {
      height: 10px;
      background: var(--surface-tertiary, #f0ebe0);
      border-radius: 4px;
      overflow: hidden;
    }

    .stats-accuracy-fill {
      height: 100%;
      background: var(--color-sage, #5a7d5c);
      border-radius: 4px;
      transition: width 0.6s ease;
    }

    .stats-bar-chart {
      margin-bottom: 24px;
    }

    .stats-bar-chart-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-secondary, #4a4a4a);
      margin-bottom: 16px;
    }

    .stats-bar-row {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
      gap: 10px;
    }

    .stats-bar-label {
      width: 120px;
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--text-secondary, #4a4a4a);
      flex-shrink: 0;
      text-align: right;
    }

    .stats-bar-track {
      flex: 1;
      height: 24px;
      background: var(--surface-tertiary, #f0ebe0);
      border-radius: var(--radius-sm, 4px);
      overflow: hidden;
    }

    .stats-bar-fill {
      height: 100%;
      border-radius: var(--radius-sm, 4px);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 8px;
      font-size: 0.7rem;
      font-weight: 600;
      color: #fff;
      transition: width 0.6s ease;
      min-width: 0;
    }

    .stats-bar-fill--1 {
      background: var(--color-sage, #5a7d5c);
    }

    .stats-bar-fill--2 {
      background: var(--color-olive, #8ba888);
    }

    .stats-bar-fill--3 {
      background: var(--color-amber, #c4956a);
    }

    .stats-bar-fill--4 {
      background: var(--color-amber-light, #d4a574);
    }

    .stats-record-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .stats-record-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--surface-secondary, #faf7f2);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-md, 8px);
      gap: 12px;
      flex-wrap: wrap;
    }

    .stats-record-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .stats-record-date {
      font-family: var(--font-mono, monospace);
      font-size: 0.78rem;
      color: var(--text-muted, #8a8a8a);
      min-width: 80px;
    }

    .stats-record-type {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 2px 10px;
      border-radius: var(--radius-full, 9999px);
    }

    .stats-record-type--practice {
      background: rgba(90, 125, 92, 0.1);
      color: var(--color-sage, #5a7d5c);
    }

    .stats-record-type--exam {
      background: rgba(196, 149, 106, 0.1);
      color: var(--color-amber, #c4956a);
    }

    .stats-record-info {
      font-size: 0.8rem;
      color: var(--text-secondary, #4a4a4a);
    }

    .stats-record-accuracy {
      font-family: var(--font-mono, monospace);
      font-size: 0.85rem;
      font-weight: 700;
    }

    .stats-record-accuracy--good {
      color: var(--color-success, #3a8c5c);
    }

    .stats-record-accuracy--mid {
      color: var(--color-amber, #c4956a);
    }

    .stats-record-accuracy--low {
      color: var(--color-error, #c0553a);
    }

    @media (max-width: 768px) {
      .analytics-grid {
        grid-template-columns: 1fr;
      }

      .stats-summary {
        grid-template-columns: repeat(3, 1fr);
      }

      .stats-bar-label {
        width: 80px;
        font-size: 0.7rem;
      }

      .wrong-book-item {
        flex-direction: column;
        align-items: stretch;
      }

      .wrong-book-actions {
        justify-content: flex-end;
      }
    }

    @media (max-width: 480px) {
      .stats-summary {
        grid-template-columns: 1fr 1fr;
      }

      .stats-summary-item:last-child {
        grid-column: 1 / -1;
      }
    }

  `;

  document.head.appendChild(style);
}

const MODULE_LABELS = {
  module_1: '模块一',
  module_2: '模块二',
  module_3: '模块三',
  module_4: '模块四'
};

const MODULE_NAMES = [
  { key: 'module_1', label: '模块一', desc: '生化/分子/细胞' },
  { key: 'module_2', label: '模块二', desc: '植物/微生物' },
  { key: 'module_3', label: '模块三', desc: '动物/生态' },
  { key: 'module_4', label: '模块四', desc: '遗传/进化/信息' }
];

/**
 * 计算 Bio Score — 六维学习力综合评分。
 * M-06：唯一实现位于 js/core/score-engine.js，本函数仅保留原全局入口，
 * 供 smart-diagnosis / dashboard / practice / storage 等旧调用方使用。
 * 页面加载时 score-engine 已由 index.html 同步 defer 引入，缺失即代码错误。
 * @param {Object} stats - getStats() 返回的数据
 * @returns {Object} { score, grade, letter, components, confidence, breakdown }
 */
function calcBioScore(stats) {
  return window.ScoreEngine.calcBioScore(stats);
}

function renderRadarChart(container, stats) {
  const cx = 160;
  const cy = 160;
  const radius = 120;
  const levels = 5;
  const count = 6;  // 6 维度：B, I, O, G, C, D
  const angleStep = (Math.PI * 2) / count;
  const startAngle = -Math.PI / 2;

  const bioScore = calcBioScore(stats);
  const dims = [
    { key: 'B', label: '基础力', desc: '正确率', color: '#22c55e' },
    { key: 'I', label: '洞察力', desc: '全对率', color: '#3b82f6' },
    { key: 'O', label: '活跃度', desc: '练习量', color: '#f59e0b' },
    { key: 'G', label: '成长性', desc: '进步趋势', color: '#8b5cf6' },
    { key: 'C', label: '一致性', desc: '稳定性', color: '#06b6d4' },
    { key: 'D', label: '突破力', desc: '难度', color: '#ef4444' }
  ];

  let svg = '<svg class="radar-svg" viewBox="0 0 320 340" width="320" height="340">';

  // 网格多边形
  for (let level = 1; level <= levels; level++) {
    const r = (radius / levels) * level;
    let points = '';
    for (let i = 0; i < count; i++) {
      const angle = startAngle + angleStep * i;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      points += `${x},${y} `;
    }
    svg += `<polygon class="radar-grid-polygon" points="${points.trim()}"/>`;
  }

  // 轴线
  for (let i = 0; i < count; i++) {
    const angle = startAngle + angleStep * i;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    svg += `<line class="radar-axis-line" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;
  }

  // 数据点
  const values = dims.map(function(d) {
    return (bioScore.components[d.key] || 0) / 100;
  });

  const dataPoints = [];
  for (let i = 0; i < count; i++) {
    const val = values[i];
    const angle = startAngle + angleStep * i;
    const x = cx + radius * val * Math.cos(angle);
    const y = cy + radius * val * Math.sin(angle);
    dataPoints.push({ x, y, angle, val: Math.round(val * 100), dim: dims[i] });
  }

  // 数据区域
  let dataPolygon = '';
  dataPoints.forEach(function(p) { dataPolygon += `${p.x},${p.y} `; });
  svg += `<polygon class="radar-polygon-fill" points="${dataPolygon.trim()}"/>`;

  // 数据点圆
  dataPoints.forEach(function(p, i) {
    svg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${p.dim.color}" stroke="#fff" stroke-width="1.5"/>`;
  });

  // 标签
  for (let i = 0; i < count; i++) {
    const angle = startAngle + angleStep * i;
    const labelR = radius + 28;
    const lx = cx + labelR * Math.cos(angle);
    const ly = cy + labelR * Math.sin(angle) + 4;

    svg += `<text class="radar-axis-label" x="${lx}" y="${ly}" fill="${dims[i].color}">${dims[i].label}</text>`;
    svg += `<text class="radar-axis-label" x="${lx}" y="${ly + 14}" font-size="0.65rem" fill="var(--text-muted, #8a8a8a)">${dims[i].desc}</text>`;

    const valR = radius + 12;
    const vlx = cx + valR * Math.cos(angle);
    const vly = cy + valR * Math.sin(angle) + 20;
    svg += `<text class="radar-value-label" x="${vlx}" y="${vly}" fill="${dims[i].color}">${dataPoints[i].val}</text>`;
  }

  svg += '</svg>';
  container.innerHTML = svg;
}

function renderWrongBook(container) {
  const wrongQuestions = typeof getWrongQuestions === 'function' ? (getWrongQuestions() || []) : [];

  if (wrongQuestions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"></div>
        <p class="empty-state-text">暂无错题记录</p>
      </div>
    `;
    return;
  }

  const grouped = {};
  wrongQuestions.forEach((wq) => {
    const mod = wq.module || 'general';
    if (!grouped[mod]) grouped[mod] = [];
    grouped[mod].push(wq);
  });

  let html = '<div class="wrong-book-list">';

  for (const [mod, items] of Object.entries(grouped)) {
    const modLabel = MODULE_LABELS[mod] || mod;
    html += `<div class="wrong-book-group">`;
    html += `<div class="wrong-book-group-title">${modLabel} (${items.length}题)</div>`;

    items.forEach((item) => {
      const qText = item.questionText || item.qId || '';
      const stem = qText.length > 80 ? qText.slice(0, 80) + '...' : qText;
      html += `
        <div class="wrong-book-item">
          <div class="wrong-book-item-left">
            <div class="wrong-book-stem" title="${escapeHtml ? escapeHtml(qText) : qText}">${escapeHtml ? escapeHtml(stem) : stem}</div>
            <div class="wrong-book-meta">
              <span class="wrong-book-module">${modLabel}</span>
              <span class="wrong-book-count">错误 ${item.wrongCount || 1} 次</span>
            </div>
          </div>
          <div class="wrong-book-actions">
            <button class="wrong-book-btn" data-wrong-redo="${item.qId || ''}">重做此题</button>
            <button class="wrong-book-btn wrong-book-btn--danger" data-wrong-remove="${item.qId || ''}">移出错题本</button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
  }

  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('[data-wrong-redo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const qId = btn.dataset.wrongRedo;
      // 找到对应的错题数据，存入 sessionStorage 以便重做
      const wrongQuestions = typeof getWrongQuestions === 'function' ? getWrongQuestions() : [];
      const wrongItem = wrongQuestions.find(w => String(w.qId) === String(qId));
      if (wrongItem) {
        try {
          sessionStorage.setItem('bioquest_redo_question', JSON.stringify(wrongItem));
        } catch (e) {}
      }
      if (typeof navigateTo === 'function') {
        navigateTo('/practice');
      }
    });
  });

  container.querySelectorAll('[data-wrong-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const qId = btn.dataset.wrongRemove;
      if (typeof removeWrongQuestion === 'function') {
        removeWrongQuestion(qId);
      }
      renderWrongBook(container);
    });
  });
}

function renderStatsSummary(container) {
  const records = typeof getRecords === 'function' ? (getRecords() || []) : [];
  const stats = typeof getStats === 'function' ? getStats() : { totalAnswered: 0, totalCorrect: 0, accuracy: 0, modules: {} };

  const totalPractice = records.length;
  const totalAnswered = stats.totalAnswered || 0;
  const accuracy = stats.accuracy || 0;
  // 正确率仅在答题量 >= 30 时才有统计意义
  var showAccuracy = totalAnswered >= 30;

  let html = '<div class="stats-summary">';
  html += `
    <div class="stats-summary-item">
      <div class="stats-summary-num">${totalAnswered}</div>
      <div class="stats-summary-label">总练习题数</div>
    </div>
  `;
  html += `
    <div class="stats-summary-item">
      <div class="stats-summary-num">${totalPractice}</div>
      <div class="stats-summary-label">练习场次</div>
    </div>
  `;
  html += `
    <div class="stats-summary-item">
      <div class="stats-summary-num">${showAccuracy ? accuracy + '%' : '--'}</div>
      <div class="stats-summary-label">整体正确率${showAccuracy ? '' : '(>=30题)'}</div>
    </div>
  `;
  html += '</div>';

  // Bio Score KDA 式综合评分
  const bioScore = calcBioScore(stats);
  const c = bioScore.components;

  // 维度说明表
  const dimInfo = [
    { key: 'B', name: '基础正确率', full: 'Base Accuracy', weight: '25%', formula: 'Φ((正确率-0.55)/0.25)×100', desc: '正态CDF映射：60%→50分，80%→84分。衡量知识掌握的扎实程度' },
    { key: 'I', name: '洞察力', full: 'Insight', weight: '25%', formula: '难度加权全对率×100', desc: '全对=完全理解。按模块难度加权，正确率低的模块全对价值更高' },
    { key: 'O', name: '活跃度', full: 'Output', weight: '10%', formula: 'min(100, log₂(练习次数+1)×18 + 连续奖励)', desc: '对数压缩防刷题膨胀：10次≈62，30次≈88，50次≈100' },
    { key: 'G', name: '成长性', full: 'Growth', weight: '15%', formula: '50 + Holt双指数平滑趋势×500', desc: '双指数平滑拟合进步趋势，比简单平均更精确捕捉变化' },
    { key: 'C', name: '一致性', full: 'Consistency', weight: '15%', formula: '0.6×exp(-3×CV²) + 0.4×近期波动', desc: '变异系数越小越稳定。偶尔失常不严重扣分，持续波动才会' },
    { key: 'D', name: '难度突破', full: 'Difficulty Mastery', weight: '10%', formula: 'Σ(模块正确率×难度系数)/Σ(难度系数)×100', desc: '区分"只做简单题"和"能做难题"，高难度模块表现权重更大' }
  ];

  // 低置信度标注：< 0.5 视为「样本不足，该维度为估算/中性值」
  const confLow = (k) => {
    const cf = bioScore.confidence ? bioScore.confidence[k] : 1;
    return (typeof cf === 'number' && cf < 0.5);
  };
  const confChip = (k) => confLow(k)
    ? '<span class="bioscore-conf-low" title="样本量不足，该维度为估算值/中性值，继续练习后自动转正">置信度低</span>'
    : '';

  html += `
    <div class="bioscore-card">
      <div class="bioscore-header">
        <div class="bioscore-title-row">
          <span class="bioscore-title">Bio Score</span>
          <span class="bioscore-grade bioscore-grade--${bioScore.grade.toLowerCase().replace('+','plus')}">${bioScore.grade}</span>
          <span class="bioscore-letter">${bioScore.letter}</span>
        </div>
        <div class="bioscore-score-num">${bioScore.score}<span class="bioscore-score-max">/100</span></div>
      </div>
      <div class="bioscore-metrics">
        ${dimInfo.map(function(d) { return `
        <div class="bioscore-metric" data-dim="${d.key}">
          <div class="bioscore-metric-head">
            <span class="bioscore-metric-label"><strong>${d.key}</strong> ${d.name}${confChip(d.key)}</span>
            <span class="bioscore-metric-val">${c[d.key]}</span>
          </div>
          <div class="bioscore-metric-bar"><div class="bioscore-metric-fill" style="width:${c[d.key]}%"></div></div>
          <div class="bioscore-metric-detail">
            <span class="bioscore-metric-full">${d.full} · 权重 ${d.weight}</span>
            <span class="bioscore-metric-formula">${d.formula}</span>
            <span class="bioscore-metric-desc">${d.desc}</span>
          </div>
        </div>`; }).join('')}
      </div>
      <div class="bioscore-criteria">
        <div class="bioscore-criteria-title">评级标准</div>
        ${(function() {
          // 评级表由 score-engine 的 BIO_SCORE_EXPLAIN.grades 驱动（防与实际阈值漂移）
          var grades = (window.BIO_SCORE_EXPLAIN && Array.isArray(window.BIO_SCORE_EXPLAIN.grades))
            ? window.BIO_SCORE_EXPLAIN.grades : null;
          if (!grades) {
            grades = [
              { min: 86, grade: 'S+', desc: '顶尖 · 国一稳拿' },
              { min: 81, grade: 'S', desc: '卓越 · 全国一等奖' },
              { min: 77, grade: 'A+', desc: '优秀+ · 省一头部/冲国奖' },
              { min: 70, grade: 'A', desc: '优秀 · 省一' },
              { min: 64, grade: 'B+', desc: '良好+ · 冲省一' },
              { min: 58, grade: 'B', desc: '良好 · 省级二等奖' },
              { min: 52, grade: 'C+', desc: '合格+ · 省二冲线' },
              { min: 46, grade: 'C', desc: '合格 · 省级三等奖' },
              { min: 36, grade: 'D+', desc: '待提升 · 需系统训练' },
              { min: 0, grade: 'D', desc: '需努力 · 从基础开始' }
            ];
          }
          return grades.map(function(g, i) {
            var upper = i === 0 ? 100 : grades[i - 1].min - 1;
            var range = g.min === 0 ? ('0-' + upper) : (g.min + '-' + upper);
            var cls = 'bioscore-criteria-' + g.grade.toLowerCase().replace('+', 'plus');
            return '<div class="bioscore-criteria-row"><span class="bioscore-criteria-grade ' + cls + '">' +
              g.grade + '</span><span class="bioscore-criteria-range">' + range +
              '</span><span class="bioscore-criteria-desc">' + g.desc + '</span></div>';
          }).join('');
        })()}
        <div class="bioscore-criteria-weights">
          <span>综合 = B×25% + I×25% + O×10% + G×15% + C×15% + D×10%</span>
          <span>交互修正：B≥70且I≥70 → +5，B&lt;40且I&lt;40 → -5</span>
          <span>数据不足的维度按中性值参与计算，并标注「置信度低」</span>
        </div>
      </div>
    </div>
  `;

  html += `
    <div class="stats-accuracy-bar">
      <div class="stats-accuracy-header">
        <span class="stats-accuracy-label">整体正确率${showAccuracy ? '' : ' (需累计30题以上)'}</span>
        <span class="stats-accuracy-value">${showAccuracy ? accuracy + '%' : '--'}</span>
      </div>
      <div class="stats-accuracy-track">
        <div class="stats-accuracy-fill" style="width:${showAccuracy ? accuracy : 0}%"></div>
      </div>
      ${!showAccuracy ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">已答 ' + totalAnswered + ' 题，还需 ' + Math.max(0, 30 - totalAnswered) + ' 题解锁正确率统计</div>' : ''}
    </div>
  `;

  html += '<div class="stats-bar-chart">';
  html += '<div class="stats-bar-chart-title">各模块练习量</div>';

  const modules = stats.modules || {};
  const maxAnswered = Math.max(1, ...MODULE_NAMES.map((m) => (modules[m.key] ? modules[m.key].totalAnswered : 0)));

  MODULE_NAMES.forEach((mod, idx) => {
    const modStats = modules[mod.key] || { totalAnswered: 0 };
    const count = modStats.totalAnswered || 0;
    const barWidth = maxAnswered > 0 ? (count / maxAnswered) * 100 : 0;
    html += `
      <div class="stats-bar-row">
        <div class="stats-bar-label">${mod.label} ${mod.desc}</div>
        <div class="stats-bar-track">
          <div class="stats-bar-fill stats-bar-fill--${idx + 1}" style="width:${barWidth}%">
            ${count > 0 ? count : ''}
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';

  const recentRecords = records.slice(0, 10);

  html += '<div class="stats-bar-chart-title">最近 10 次练习记录</div>';
  html += '<div class="stats-record-list">';

  if (recentRecords.length === 0) {
    html += `
      <div class="empty-state" style="padding: 24px;">
        <p class="empty-state-text">暂无练习记录</p>
      </div>
    `;
  } else {
    recentRecords.forEach((rec) => {
      const date = rec.date || '';
      const type = rec.module === 'exam' ? '考试' : '练习';
      const typeClass = rec.module === 'exam' ? 'stats-record-type--exam' : 'stats-record-type--practice';
      const totalQ = rec.totalQuestions || 0;
      const score = rec.score || 0;
      const totalScore = rec.totalScore || 0;
      const recAccuracy = totalQ > 0 ? Math.round((rec.correctCount || 0) / totalQ * 100) : 0;

      let accClass = 'stats-record-accuracy--low';
      if (recAccuracy >= 80) accClass = 'stats-record-accuracy--good';
      else if (recAccuracy >= 60) accClass = 'stats-record-accuracy--mid';

      html += `
        <div class="stats-record-item">
          <div class="stats-record-left">
            <span class="stats-record-date">${date}</span>
            <span class="stats-record-type ${typeClass}">${type}</span>
            <span class="stats-record-info">${totalQ} 题</span>
            <span class="stats-record-info">${score} / ${totalScore} 分</span>
          </div>
          <span class="stats-record-accuracy ${accClass}">${recAccuracy}%</span>
        </div>
      `;
    });
  }

  html += '</div>';

  container.innerHTML = html;
}

/**
 * 知识卡片数据 — Anri 动漫风格生物知识卡
 */
const KNOWLEDGE_CARDS = [
  {
    category: 'cell',
    catLabel: '细胞生物学',
    title: '线粒体：细胞的能量工厂',
    body: '线粒体拥有独立的DNA（mtDNA），通过内膜上的电子传递链产生ATP。一个活跃的肝细胞中约有1000-2000个线粒体，每天产生的ATP约等于体重的1/2。',
    tag: 'CBO高频考点',
    difficulty: 3
  },
  {
    category: 'gene',
    catLabel: '遗传学',
    title: '中心法则及其扩展',
    body: 'DNA→RNA→蛋白质的经典流程已被逆转录酶、RNA复制酶和朊病毒打破。表观遗传学进一步揭示：DNA甲基化、组蛋白修饰和非编码RNA共同构成基因表达的调控网络。',
    tag: '核心概念',
    difficulty: 4
  },
  {
    category: 'biochem',
    catLabel: '生物化学',
    title: '酶促反应动力学',
    body: '米氏方程 v=Vmax[S]/(Km+[S]) 描述了底物浓度与反应速率的关系。Km值越小表示酶与底物亲和力越强。竞争性抑制剂增加Km但不改变Vmax；非竞争性抑制降低Vmax但Km不变。',
    tag: '计算重点',
    difficulty: 3
  },
  {
    category: 'eco',
    catLabel: '生态学',
    title: '生态位分化与共存',
    body: '高斯竞争排斥原理指出：两个物种若生态位完全重叠，则竞争排除一方。实际中，物种通过资源分割、时间错位或空间异质性实现共存——这就是"生态位漂移"。',
    tag: '易混淆点',
    difficulty: 2
  },
  {
    category: 'evol',
    catLabel: '进化生物学',
    title: '分子钟假说',
    body: 'DNA序列的突变率在长时间尺度上相对恒定，因此分子差异可以推算分歧时间。cytochrome b基因约每100万年变化2%，常用于构建系统发育树和估算物种分化时间。',
    tag: '实验技术',
    difficulty: 4
  },
  {
    category: 'cell',
    catLabel: '细胞生物学',
    title: '细胞骨架的三重奏',
    body: '微管（α/β-tubulin二聚体）：直径25nm，构成纤毛、纺锤丝、中心粒；微丝（actin）：直径7nm，参与胞质分裂、肌肉收缩；中间纤维：提供机械强度，核纤层是其特化形式。',
    tag: '结构对比',
    difficulty: 3
  }
];

var _knowledgeShuffleSeed = Date.now();

function renderKnowledgeCards(container) {
  // 每次随机展示4张，使用简单伪随机
  var shuffled = KNOWLEDGE_CARDS.slice();
  var seed = _knowledgeShuffleSeed;
  for (var i = shuffled.length - 1; i > 0; i--) {
    seed = (seed * 16807 + 0) % 2147483647;
    var j = seed % (i + 1);
    var tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }
  var display = shuffled.slice(0, 4);

  var html = '<div class="knowledge-section">';
  html += '<div class="knowledge-header">';
  html += '<div><div class="knowledge-title">知识卡片</div><div class="knowledge-subtitle">每日精选生竞知识点，Anri风格呈现</div></div>';
  html += '<button class="knowledge-refresh-btn" id="k-refresh-btn">换一批</button>';
  html += '</div>';
  html += '<div class="knowledge-grid">';

  var catClassMap = { cell: 'k-cat-cell', gene: 'k-cat-gene', eco: 'k-cat-eco', biochem: 'k-cat-biochem', evol: 'k-cat-evol', fun: 'k-cat-fun' };

  display.forEach(function(card) {
    html += '<div class="k-card">';
    html += '<span class="k-card-category ' + (catClassMap[card.category] || 'k-cat-fun') + '">' + card.catLabel + '</span>';
    html += '<div class="k-card-title">' + card.title + '</div>';
    html += '<div class="k-card-body">' + card.body + '</div>';
    html += '<div class="k-card-footer">';
    html += '<span class="k-card-tag">' + card.tag + '</span>';
    html += '<div class="k-card-difficulty">';
    for (var d = 1; d <= 5; d++) {
      html += '<span class="k-dot' + (d <= card.difficulty ? ' active' : '') + '"></span>';
    }
    html += '</div></div>';
    html += '</div>';
  });

  html += '</div></div>';
  container.innerHTML = html;

  var refreshBtn = document.getElementById('k-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      _knowledgeShuffleSeed = Date.now();
      renderKnowledgeCards(container);
    });
  }
}

function renderAnalyticsPage(target) {
  if (!target) return;

  // 未登录时显示提示
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
    target.innerHTML = `
      <div class="animate-fade-in" style="display:flex;align-items:center;justify-content:center;min-height:60vh;">
        <div style="text-align:center;max-width:400px;padding:40px;">
          <div style="font-size:48px;margin-bottom:16px;opacity:0.3;"></div>
          <h2 style="font-size:22px;font-weight:600;margin-bottom:8px;color:var(--text-primary);">学习分析需要登录</h2>
          <p style="font-size:14px;color:var(--text-secondary);margin-bottom:24px;line-height:1.6;">登录后即可查看你的学习进度、能力雷达图和错题本</p>
          <button data-on='["_cspShowAuth"]' style="
            background:var(--color-sage);color:#fff;border:none;padding:12px 32px;border-radius:var(--radius-full);
            font-size:15px;font-weight:500;cursor:pointer;transition:all 0.2s;
          " data-on-mouseover='["_cspHoverIn","__this"]' data-on-mouseout='["_cspHoverOut","__this"]'>立即登录</button>
        </div>
      </div>
    `;
    return;
  }

  // 习惯概览数据
  var habitSummaryHtml = '';
  if (typeof getHabits === 'function') {
    var habits = getHabits().filter(function(h) { return h.active; });
    var habitLogs = typeof getHabitLogs === 'function' ? getHabitLogs() : [];
    var badges = typeof getBadges === 'function' ? getBadges() : [];
    var today = new Date().toISOString().split('T')[0];
    var maxStreak = 0;
    var todayCompleted = 0;
    for (var hi = 0; hi < habits.length; hi++) {
      var s = typeof getHabitStreak === 'function' ? getHabitStreak(habits[hi].id) : 0;
      if (s > maxStreak) maxStreak = s;
      for (var li = 0; li < habitLogs.length; li++) {
        if (habitLogs[li].habitId === habits[hi].id && habitLogs[li].date === today && habitLogs[li].completed) {
          todayCompleted++;
          break;
        }
      }
    }
    var recentBadges = badges.slice(-3).reverse();
    var badgesHtml = '';
    for (var bi = 0; bi < recentBadges.length; bi++) {
      badgesHtml += '<span style="display:inline-block;background:var(--color-clay-light);color:var(--text-primary);padding:4px 10px;border-radius:var(--radius-full);font-size:12px;margin-right:6px;">' + recentBadges[bi].name + '</span>';
    }
    habitSummaryHtml = '<div class="analytics-card analytics-card--full" style="margin-bottom:20px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">' +
      '<div style="display:flex;gap:24px;flex-wrap:wrap;">' +
      '<div><div style="font-size:24px;font-weight:700;color:var(--color-sage);">' + maxStreak + '</div><div style="font-size:12px;color:var(--text-muted);">最大连续天数</div></div>' +
      '<div><div style="font-size:24px;font-weight:700;color:var(--color-sage);">' + todayCompleted + '/' + habits.length + '</div><div style="font-size:12px;color:var(--text-muted);">今日完成</div></div>' +
      '<div><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">最近徽章</div>' + (badgesHtml || '<span style="font-size:12px;color:var(--text-muted);">暂无</span>') + '</div>' +
      '</div>' +
      '<a href="#/habits" style="background:var(--color-sage);color:#fff;padding:8px 20px;border-radius:var(--radius-full);font-size:13px;text-decoration:none;">查看详情</a>' +
      '</div>' +
      '</div>';
  }

  target.innerHTML = `
    <div class="animate-fade-in">
      ` + habitSummaryHtml + `
      <div class="analytics-grid">
        <div class="analytics-card">
          <div class="analytics-card-title">能力雷达图</div>
          <div class="analytics-card-subtitle">六大维度评估</div>
          <div class="radar-container" id="radarChart"></div>
        </div>

        <div class="analytics-card">
          <div class="analytics-card-title">错题本</div>
          <div class="analytics-card-subtitle">按模块整理错题，可重做或移除</div>
          <div id="wrongBookContainer"></div>
        </div>

        <div class="analytics-card analytics-card--full">
          <div class="analytics-card-title">学习统计</div>
          <div class="analytics-card-subtitle">练习数据概览与近期记录</div>
          <div id="statsContainer"></div>
        </div>
      </div>
    </div>
  `;

  const stats = typeof getStats === 'function' ? getStats() : { totalAnswered: 0, totalCorrect: 0, accuracy: 0, modules: {} };

  const radarContainer = document.getElementById('radarChart');
  if (radarContainer) {
    renderRadarChart(radarContainer, stats);
  }

  const wrongBookContainer = document.getElementById('wrongBookContainer');
  if (wrongBookContainer) {
    renderWrongBook(wrongBookContainer);
  }

  const statsContainer = document.getElementById('statsContainer');
  if (statsContainer) {
    renderStatsSummary(statsContainer);
  }
}

function initAnalytics(target) {
  injectAnalyticsStyles();

  if (!target) {
    if (typeof AppState !== 'undefined' && AppState.rootElement) {
      target = AppState.rootElement;
    } else {
      target = document.getElementById('page-content');
    }
  }

  renderAnalyticsPage(target);
}

// 挂载到 window 对象，供 app.js 调用
window.initAnalytics = initAnalytics;
window.renderKnowledgeCards = renderKnowledgeCards;
window.renderStatsSummary = renderStatsSummary;
