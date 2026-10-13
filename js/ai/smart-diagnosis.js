/**
 * ============================================================
 * TATABOX — 智能薄弱点诊断模块
 * 创新功能：自动分析练习历史，识别薄弱知识点，
 * 给出诊断报告和个性化练习建议，预估提分路径
 * ============================================================
 */

'use strict';

var diagnosisStylesInjected = false;

/* 模块元信息，与项目其他模块保持一致 */
var DIAGNOSIS_MODULES = [
  { key: 'module1', label: '模块一', desc: '生化/分子/细胞' },
  { key: 'module2', label: '模块二', desc: '植物/微生物' },
  { key: 'module3', label: '模块三', desc: '动物/生态' },
  { key: 'module4', label: '模块四', desc: '遗传/进化/信息' }
];

/* 题型标签映射 */
var QUESTION_TYPE_MAP = {
  single: '单选题',
  multiple: '多选题',
  tf: '判断题',
  mtf: '配对判断',
  logic: '逻辑推理',
  matching: '配对题'
};

/* ============================================================
 * 样式注入
 * ============================================================ */
function injectDiagnosisStyles() {
  if (diagnosisStylesInjected) return;
  diagnosisStylesInjected = true;

  var style = document.createElement('style');
  style.id = 'bioquest-diagnosis-styles';
  style.textContent = '\
    .diagnosis-page {\
      max-width: var(--content-max-width, 1200px);\
      margin: 0 auto;\
      padding: var(--content-padding, 24px);\
    }\
    \
    .diagnosis-header {\
      text-align: center;\
      margin-bottom: 32px;\
    }\
    \
    .diagnosis-header-label {\
      font-size: 0.78rem;\
      font-weight: 600;\
      letter-spacing: 2px;\
      text-transform: uppercase;\
      color: var(--color-sage, #5a7d5c);\
      margin-bottom: 6px;\
    }\
    \
    .diagnosis-header-title {\
      font-family: var(--font-serif, "Noto Serif SC", serif);\
      font-size: 1.6rem;\
      font-weight: 700;\
      color: var(--color-deep, #1a3a2a);\
      margin-bottom: 6px;\
    }\
    \
    .diagnosis-header-desc {\
      font-size: 0.9rem;\
      color: var(--text-muted, #8a8a8a);\
    }\
    \
    /* 诊断概览卡片 */\
    .diagnosis-overview {\
      display: grid;\
      grid-template-columns: 1fr 1fr 1fr;\
      gap: 16px;\
      margin-bottom: 28px;\
    }\
    \
    .diagnosis-overview-card {\
      background: var(--surface-primary, #ffffff);\
      border: 1px solid var(--border-light, #ece8e1);\
      border-radius: var(--radius-lg, 12px);\
      padding: 24px;\
      text-align: center;\
      box-shadow: var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));\
      transition: transform var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);\
    }\
    \
    .diagnosis-overview-card:hover {\
      transform: translateY(-2px);\
      box-shadow: var(--shadow-md, 0 2px 8px rgba(44, 62, 48, 0.06));\
    }\
    \
    .diagnosis-overview-icon {\
      font-size: 1.8rem;\
      margin-bottom: 8px;\
    }\
    \
    .diagnosis-overview-value {\
      font-family: var(--font-mono, monospace);\
      font-size: 1.6rem;\
      font-weight: 700;\
      color: var(--color-deep, #1a3a2a);\
      margin-bottom: 4px;\
    }\
    \
    .diagnosis-overview-label {\
      font-size: 0.8rem;\
      color: var(--text-muted, #8a8a8a);\
    }\
    \
    .diagnosis-overview-card--warn .diagnosis-overview-value {\
      color: var(--color-error, #c0553a);\
    }\
    \
    .diagnosis-overview-card--good .diagnosis-overview-value {\
      color: var(--color-success, #3a8c5c);\
    }\
    \
    .diagnosis-overview-card--amber .diagnosis-overview-value {\
      color: var(--color-amber, #c4956a);\
    }\
    \
    /* 诊断区块通用 */\
    .diagnosis-section {\
      background: var(--surface-primary, #ffffff);\
      border: 1px solid var(--border-light, #ece8e1);\
      border-radius: var(--radius-lg, 12px);\
      padding: 28px;\
      margin-bottom: 24px;\
      box-shadow: var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));\
    }\
    \
    .diagnosis-section-title {\
      font-family: var(--font-serif, "Noto Serif SC", serif);\
      font-size: 1.1rem;\
      font-weight: 700;\
      color: var(--color-deep, #1a3a2a);\
      margin-bottom: 4px;\
    }\
    \
    .diagnosis-section-subtitle {\
      font-size: 0.82rem;\
      color: var(--text-muted, #8a8a8a);\
      margin-bottom: 20px;\
    }\
    \
    /* 模块正确率排名 */\
    .diagnosis-rank-list {\
      display: flex;\
      flex-direction: column;\
      gap: 12px;\
    }\
    \
    .diagnosis-rank-item {\
      display: flex;\
      align-items: center;\
      gap: 12px;\
      padding: 12px 16px;\
      background: var(--surface-secondary, #faf7f2);\
      border: 1px solid var(--border-light, #ece8e1);\
      border-radius: var(--radius-md, 8px);\
      transition: border-color var(--transition-fast, 0.15s ease);\
    }\
    \
    .diagnosis-rank-item:hover {\
      border-color: var(--color-amber, #c4956a);\
    }\
    \
    .diagnosis-rank-num {\
      width: 28px;\
      height: 28px;\
      border-radius: 50%;\
      display: flex;\
      align-items: center;\
      justify-content: center;\
      font-family: var(--font-mono, monospace);\
      font-size: 0.78rem;\
      font-weight: 700;\
      flex-shrink: 0;\
      background: var(--surface-tertiary, #f0ebe0);\
      color: var(--text-secondary, #4a4a4a);\
    }\
    \
    .diagnosis-rank-num--1 {\
      background: var(--color-error, #c0553a);\
      color: #fff;\
    }\
    \
    .diagnosis-rank-num--2 {\
      background: var(--color-amber, #c4956a);\
      color: #fff;\
    }\
    \
    .diagnosis-rank-num--3 {\
      background: var(--color-olive, #8ba888);\
      color: #fff;\
    }\
    \
    .diagnosis-rank-info {\
      flex: 1;\
      min-width: 0;\
    }\
    \
    .diagnosis-rank-name {\
      font-size: 0.88rem;\
      font-weight: 600;\
      color: var(--text-primary, #1a1a1a);\
      margin-bottom: 2px;\
    }\
    \
    .diagnosis-rank-detail {\
      font-size: 0.75rem;\
      color: var(--text-muted, #8a8a8a);\
    }\
    \
    .diagnosis-rank-bar {\
      flex: 0 0 120px;\
      height: 8px;\
      background: var(--surface-tertiary, #f0ebe0);\
      border-radius: 4px;\
      overflow: hidden;\
    }\
    \
    .diagnosis-rank-bar-fill {\
      height: 100%;\
      border-radius: 4px;\
      transition: width 0.6s ease;\
    }\
    \
    .diagnosis-rank-pct {\
      font-family: var(--font-mono, monospace);\
      font-size: 0.88rem;\
      font-weight: 700;\
      min-width: 48px;\
      text-align: right;\
      flex-shrink: 0;\
    }\
    \
    .diagnosis-rank-tag {\
      font-size: 0.68rem;\
      font-weight: 600;\
      padding: 2px 8px;\
      border-radius: var(--radius-full, 9999px);\
      flex-shrink: 0;\
    }\
    \
    .diagnosis-rank-tag--severe {\
      background: rgba(192, 85, 58, 0.12);\
      color: var(--color-error, #c0553a);\
    }\
    \
    .diagnosis-rank-tag--weak {\
      background: rgba(196, 149, 106, 0.12);\
      color: var(--color-amber, #c4956a);\
    }\
    \
    .diagnosis-rank-tag--ok {\
      background: rgba(90, 125, 92, 0.1);\
      color: var(--color-sage, #5a7d5c);\
    }\
    \
    .diagnosis-rank-tag--good {\
      background: rgba(58, 140, 92, 0.1);\
      color: var(--color-success, #3a8c5c);\
    }\
    \
    /* 热力图 */\
    .diagnosis-heatmap-grid {\
      display: grid;\
      grid-template-columns: repeat(4, 1fr);\
      gap: 12px;\
    }\
    \
    .diagnosis-heatmap-cell {\
      border-radius: var(--radius-md, 8px);\
      padding: 20px 16px;\
      text-align: center;\
      transition: transform var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);\
      cursor: default;\
      position: relative;\
      overflow: hidden;\
    }\
    \
    .diagnosis-heatmap-cell:hover {\
      transform: translateY(-2px);\
      box-shadow: var(--shadow-md, 0 2px 8px rgba(44, 62, 48, 0.06));\
    }\
    \
    .diagnosis-heatmap-cell::before {\
      content: "";\
      position: absolute;\
      top: 0;\
      left: 0;\
      right: 0;\
      height: 4px;\
      border-radius: var(--radius-md, 8px) var(--radius-md, 8px) 0 0;\
    }\
    \
    .diagnosis-heatmap-module {\
      font-size: 0.85rem;\
      font-weight: 700;\
      margin-bottom: 4px;\
    }\
    \
    .diagnosis-heatmap-desc {\
      font-size: 0.72rem;\
      margin-bottom: 10px;\
      opacity: 0.7;\
    }\
    \
    .diagnosis-heatmap-value {\
      font-family: var(--font-mono, monospace);\
      font-size: 1.5rem;\
      font-weight: 700;\
      margin-bottom: 2px;\
    }\
    \
    .diagnosis-heatmap-label {\
      font-size: 0.7rem;\
      opacity: 0.6;\
    }\
    \
    /* 热力图颜色等级 */\
    .diagnosis-heat-0 {\
      background: rgba(192, 85, 58, 0.15);\
      color: var(--color-error, #c0553a);\
    }\
    .diagnosis-heat-0::before { background: var(--color-error, #c0553a); }\
    \
    .diagnosis-heat-1 {\
      background: rgba(196, 149, 106, 0.15);\
      color: var(--color-amber, #c4956a);\
    }\
    .diagnosis-heat-1::before { background: var(--color-amber, #c4956a); }\
    \
    .diagnosis-heat-2 {\
      background: rgba(139, 168, 136, 0.15);\
      color: var(--color-olive, #8ba888);\
    }\
    .diagnosis-heat-2::before { background: var(--color-olive, #8ba888); }\
    \
    .diagnosis-heat-3 {\
      background: rgba(90, 125, 92, 0.12);\
      color: var(--color-sage, #5a7d5c);\
    }\
    .diagnosis-heat-3::before { background: var(--color-sage, #5a7d5c); }\
    \
    .diagnosis-heat-4 {\
      background: rgba(58, 140, 92, 0.12);\
      color: var(--color-success, #3a8c5c);\
    }\
    .diagnosis-heat-4::before { background: var(--color-success, #3a8c5c); }\
    \
    /* 题型分析 */\
    .diagnosis-type-grid {\
      display: grid;\
      grid-template-columns: repeat(2, 1fr);\
      gap: 12px;\
    }\
    \
    .diagnosis-type-card {\
      display: flex;\
      align-items: center;\
      gap: 14px;\
      padding: 16px;\
      background: var(--surface-secondary, #faf7f2);\
      border: 1px solid var(--border-light, #ece8e1);\
      border-radius: var(--radius-md, 8px);\
    }\
    \
    .diagnosis-type-icon {\
      width: 42px;\
      height: 42px;\
      border-radius: var(--radius-sm, 4px);\
      display: flex;\
      align-items: center;\
      justify-content: center;\
      font-size: 1.1rem;\
      flex-shrink: 0;\
    }\
    \
    .diagnosis-type-info {\
      flex: 1;\
      min-width: 0;\
    }\
    \
    .diagnosis-type-name {\
      font-size: 0.85rem;\
      font-weight: 600;\
      color: var(--text-primary, #1a1a1a);\
      margin-bottom: 6px;\
    }\
    \
    .diagnosis-type-bar {\
      height: 6px;\
      background: var(--surface-tertiary, #f0ebe0);\
      border-radius: 2px;\
      overflow: hidden;\
    }\
    \
    .diagnosis-type-bar-fill {\
      height: 100%;\
      border-radius: 2px;\
      transition: width 0.6s ease;\
    }\
    \
    .diagnosis-type-pct {\
      font-family: var(--font-mono, monospace);\
      font-size: 0.85rem;\
      font-weight: 700;\
      flex-shrink: 0;\
    }\
    \
    /* 提分路径 */\
    .diagnosis-path-list {\
      display: flex;\
      flex-direction: column;\
      gap: 14px;\
    }\
    \
    .diagnosis-path-item {\
      display: flex;\
      align-items: center;\
      gap: 16px;\
      padding: 16px 20px;\
      background: var(--surface-secondary, #faf7f2);\
      border: 1px solid var(--border-light, #ece8e1);\
      border-radius: var(--radius-md, 8px);\
      transition: border-color var(--transition-fast, 0.15s ease);\
    }\
    \
    .diagnosis-path-item:hover {\
      border-color: var(--color-sage, #5a7d5c);\
    }\
    \
    .diagnosis-path-step {\
      width: 32px;\
      height: 32px;\
      border-radius: 50%;\
      display: flex;\
      align-items: center;\
      justify-content: center;\
      font-family: var(--font-mono, monospace);\
      font-size: 0.82rem;\
      font-weight: 700;\
      flex-shrink: 0;\
      background: var(--color-sage, #5a7d5c);\
      color: #fff;\
    }\
    \
    .diagnosis-path-content {\
      flex: 1;\
      min-width: 0;\
    }\
    \
    .diagnosis-path-action {\
      font-size: 0.88rem;\
      font-weight: 600;\
      color: var(--text-primary, #1a1a1a);\
      margin-bottom: 2px;\
    }\
    \
    .diagnosis-path-reason {\
      font-size: 0.78rem;\
      color: var(--text-muted, #8a8a8a);\
    }\
    \
    .diagnosis-path-score {\
      text-align: right;\
      flex-shrink: 0;\
    }\
    \
    .diagnosis-path-score-value {\
      font-family: var(--font-mono, monospace);\
      font-size: 1.1rem;\
      font-weight: 700;\
      color: var(--color-success, #3a8c5c);\
    }\
    \
    .diagnosis-path-score-label {\
      font-size: 0.7rem;\
      color: var(--text-muted, #8a8a8a);\
    }\
    \
    /* 错误趋势 */\
    .diagnosis-trend-chart {\
      display: flex;\
      align-items: flex-end;\
      gap: 8px;\
      height: 140px;\
      padding: 0 4px;\
      margin-bottom: 8px;\
    }\
    \
    .diagnosis-trend-bar-group {\
      flex: 1;\
      display: flex;\
      flex-direction: column;\
      align-items: center;\
      height: 100%;\
      justify-content: flex-end;\
    }\
    \
    .diagnosis-trend-bar {\
      width: 100%;\
      max-width: 48px;\
      border-radius: 4px 4px 0 0;\
      transition: height 0.6s ease;\
      position: relative;\
    }\
    \
    .diagnosis-trend-bar-label {\
      position: absolute;\
      top: -20px;\
      left: 50%;\
      transform: translateX(-50%);\
      font-family: var(--font-mono, monospace);\
      font-size: 0.68rem;\
      font-weight: 600;\
      white-space: nowrap;\
    }\
    \
    .diagnosis-trend-x-label {\
      font-size: 0.68rem;\
      color: var(--text-muted, #8a8a8a);\
      margin-top: 6px;\
      text-align: center;\
    }\
    \
    .diagnosis-trend-legend {\
      display: flex;\
      justify-content: center;\
      gap: 20px;\
      margin-top: 12px;\
    }\
    \
    .diagnosis-trend-legend-item {\
      display: flex;\
      align-items: center;\
      gap: 6px;\
      font-size: 0.78rem;\
      color: var(--text-secondary, #4a4a4a);\
    }\
    \
    .diagnosis-trend-legend-dot {\
      width: 10px;\
      height: 10px;\
      border-radius: 2px;\
    }\
    \
    .diagnosis-trend-summary {\
      text-align: center;\
      margin-top: 16px;\
      padding: 12px;\
      background: var(--surface-secondary, #faf7f2);\
      border-radius: var(--radius-sm, 4px);\
      font-size: 0.85rem;\
      color: var(--text-secondary, #4a4a4a);\
    }\
    \
    .diagnosis-trend-summary strong {\
      color: var(--color-deep, #1a3a2a);\
    }\
    \
    /* 学习建议 */\
    .diagnosis-advice-list {\
      display: flex;\
      flex-direction: column;\
      gap: 12px;\
    }\
    \
    .diagnosis-advice-item {\
      display: flex;\
      gap: 14px;\
      padding: 16px;\
      background: var(--surface-secondary, #faf7f2);\
      border: 1px solid var(--border-light, #ece8e1);\
      border-radius: var(--radius-md, 8px);\
    }\
    \
    .diagnosis-advice-priority {\
      width: 36px;\
      height: 36px;\
      border-radius: var(--radius-sm, 4px);\
      display: flex;\
      align-items: center;\
      justify-content: center;\
      font-family: var(--font-mono, monospace);\
      font-size: 0.82rem;\
      font-weight: 700;\
      flex-shrink: 0;\
    }\
    \
    .diagnosis-advice-priority--high {\
      background: rgba(192, 85, 58, 0.12);\
      color: var(--color-error, #c0553a);\
    }\
    \
    .diagnosis-advice-priority--mid {\
      background: rgba(196, 149, 106, 0.12);\
      color: var(--color-amber, #c4956a);\
    }\
    \
    .diagnosis-advice-priority--low {\
      background: rgba(90, 125, 92, 0.1);\
      color: var(--color-sage, #5a7d5c);\
    }\
    \
    .diagnosis-advice-content {\
      flex: 1;\
    }\
    \
    .diagnosis-advice-title {\
      font-size: 0.88rem;\
      font-weight: 600;\
      color: var(--text-primary, #1a1a1a);\
      margin-bottom: 4px;\
    }\
    \
    .diagnosis-advice-desc {\
      font-size: 0.8rem;\
      color: var(--text-secondary, #4a4a4a);\
      line-height: 1.6;\
    }\
    \
    .diagnosis-advice-action {\
      flex-shrink: 0;\
      align-self: center;\
    }\
    \
    .diagnosis-advice-btn {\
      font-size: 0.78rem;\
      padding: 6px 16px;\
      border-radius: var(--radius-sm, 4px);\
      border: 1px solid var(--color-sage, #5a7d5c);\
      background: transparent;\
      color: var(--color-sage, #5a7d5c);\
      cursor: pointer;\
      font-weight: 500;\
      transition: all var(--transition-fast, 0.15s ease);\
      white-space: nowrap;\
    }\
    \
    .diagnosis-advice-btn:hover {\
      background: var(--color-sage, #5a7d5c);\
      color: #fff;\
    }\
    \
    /* 空状态 */\
    .diagnosis-empty {\
      text-align: center;\
      padding: 64px 24px;\
    }\
    \
    .diagnosis-empty-icon {\
      font-size: 3rem;\
      margin-bottom: 16px;\
      opacity: 0.3;\
    }\
    \
    .diagnosis-empty-title {\
      font-family: var(--font-serif, "Noto Serif SC", serif);\
      font-size: 1.2rem;\
      font-weight: 700;\
      color: var(--text-primary, #1a1a1a);\
      margin-bottom: 8px;\
    }\
    \
    .diagnosis-empty-desc {\
      font-size: 0.9rem;\
      color: var(--text-muted, #8a8a8a);\
      margin-bottom: 24px;\
      line-height: 1.6;\
    }\
    \
    .diagnosis-empty-btn {\
      display: inline-block;\
      padding: 10px 28px;\
      background: var(--color-sage, #5a7d5c);\
      color: #fff;\
      border: none;\
      border-radius: var(--radius-full, 9999px);\
      font-size: 0.9rem;\
      font-weight: 500;\
      cursor: pointer;\
      transition: all var(--transition-fast, 0.15s ease);\
    }\
    \
    .diagnosis-empty-btn:hover {\
      transform: translateY(-1px);\
      box-shadow: var(--shadow-md);\
    }\
    \
    /* 双栏布局 */\
    .diagnosis-two-col {\
      display: grid;\
      grid-template-columns: 1fr 1fr;\
      gap: 24px;\
    }\
    \
    /* 响应式 */\
    @media (max-width: 768px) {\
      .diagnosis-overview {\
        grid-template-columns: 1fr;\
      }\
      .diagnosis-heatmap-grid {\
        grid-template-columns: repeat(2, 1fr);\
      }\
      .diagnosis-type-grid {\
        grid-template-columns: 1fr;\
      }\
      .diagnosis-two-col {\
        grid-template-columns: 1fr;\
      }\
    }\
    \
    @media (max-width: 480px) {\
      .diagnosis-heatmap-grid {\
        grid-template-columns: 1fr 1fr;\
      }\
      .diagnosis-rank-bar {\
        flex: 0 0 80px;\
      }\
    }\
  ';

  document.head.appendChild(style);
}

/* ============================================================
 * 诊断算法：数据采集与分析
 * ============================================================ */

/**
 * 获取所有诊断数据
 * @returns {Object} 诊断结果对象
 */
function computeDiagnosis() {
  var stats = typeof getStats === 'function' ? getStats() : {};
  var records = typeof getRecords === 'function' ? getRecords() : [];
  var wrongQuestions = typeof getWrongQuestions === 'function' ? getWrongQuestions() : [];
  var bioScore = typeof calcBioScore === 'function' ? calcBioScore(stats) : null;

  /* ---- 1. 模块正确率排名 ---- */
  var moduleRanking = computeModuleRanking(stats);

  /* ---- 2. 题型正确率分析 ---- */
  var typeAnalysis = computeTypeAnalysis(records);

  /* ---- 3. 薄弱知识点识别 ---- */
  var weakPoints = computeWeakPoints(moduleRanking);

  /* ---- 4. 提分路径预估 ---- */
  var scorePaths = computeScorePaths(stats, moduleRanking, bioScore);

  /* ---- 5. 错误趋势分析 ---- */
  var trendData = computeTrendData(records);

  /* ---- 6. 学习建议 ---- */
  var adviceList = computeAdviceList(weakPoints, typeAnalysis, wrongQuestions);

  /* ---- 7. 知识图谱依赖路径分析 ---- */
  var learningPath = computeLearningPath(weakPoints, moduleRanking);

  return {
    stats: stats,
    bioScore: bioScore,
    moduleRanking: moduleRanking,
    typeAnalysis: typeAnalysis,
    weakPoints: weakPoints,
    scorePaths: scorePaths,
    trendData: trendData,
    adviceList: adviceList,
    learningPath: learningPath,
    totalAnswered: stats.totalAnswered || 0,
    totalCorrect: stats.totalCorrect || 0,
    overallAccuracy: stats.accuracy || 0
  };
}

/**
 * 模块正确率排名（最弱优先）
 */
function computeModuleRanking(stats) {
  var modules = stats.modules || {};
  var ranking = [];

  for (var i = 0; i < DIAGNOSIS_MODULES.length; i++) {
    var mod = DIAGNOSIS_MODULES[i];
    var m = modules[mod.key] || { totalAnswered: 0, totalCorrect: 0, accuracy: 0 };
    ranking.push({
      key: mod.key,
      label: mod.label,
      desc: mod.desc,
      totalAnswered: m.totalAnswered || 0,
      totalCorrect: m.totalCorrect || 0,
      accuracy: m.accuracy || 0
    });
  }

  /* 按正确率升序排列（最弱在前） */
  ranking.sort(function(a, b) { return a.accuracy - b.accuracy; });
  return ranking;
}

/**
 * 题型正确率分析
 * 从 records 中统计各题型的正确率
 */
function computeTypeAnalysis(records) {
  var typeStats = {
    mtf: { total: 0, correct: 0, label: '配对判断(MTF)' },
    single: { total: 0, correct: 0, label: '单选题' },
    multiple: { total: 0, correct: 0, label: '多选题' },
    tf: { total: 0, correct: 0, label: '判断题' },
    logic: { total: 0, correct: 0, label: '逻辑推理' }
  };

  /* 遍历记录，统计各题型 */
  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    var questions = rec.questions || [];
    for (var j = 0; j < questions.length; j++) {
      var q = questions[j];
      /* 判断题型 —— 唯一实现在 js/core/question-model.js 的 normalizeStatType
       * （single/multiple/tf/mtf/logic 统计桶归一，未知类型默认落 MTF） */
      var qType = QuestionModel.normalizeStatType(q);

      if (typeStats[qType]) {
        typeStats[qType].total += 1;
        /* 判断是否正确：score > 0 视为正确 */
        var score = q.score || 0;
        if (score > 0) {
          typeStats[qType].correct += 1;
        }
      }
    }
  }

  /* 如果没有题型粒度数据，用模块统计推断 */
  if (isAllZero(typeStats)) {
    /* 用 records 的 correctCount/totalQuestions 做整体估算 */
    var totalQ = 0;
    var totalC = 0;
    for (var k = 0; k < records.length; k++) {
      totalQ += records[k].totalQuestions || 0;
      totalC += records[k].correctCount || 0;
    }
    if (totalQ > 0) {
      typeStats.mtf.total = totalQ;
      typeStats.mtf.correct = totalC;
    }
  }

  /* 计算正确率 */
  var result = [];
  for (var key in typeStats) {
    if (typeStats.hasOwnProperty(key)) {
      var t = typeStats[key];
      if (t.total > 0) {
        result.push({
          type: key,
          label: t.label,
          total: t.total,
          correct: t.correct,
          accuracy: Math.round((t.correct / t.total) * 100)
        });
      }
    }
  }

  /* 按正确率升序排列 */
  result.sort(function(a, b) { return a.accuracy - b.accuracy; });
  return result;
}

function isAllZero(typeStats) {
  for (var key in typeStats) {
    if (typeStats.hasOwnProperty(key) && typeStats[key].total > 0) return false;
  }
  return true;
}

/**
 * 薄弱知识点识别
 * v4.0：使用可配置的标注规则引擎（window.BioQuestDiagnosisRules 可覆盖默认规则）
 * 默认规则：
 *   - 正确率 < 40%: 严重薄弱（severe）
 *   - 正确率 < 60%: 薄弱（weak）
 *   - 正确率 >= 80%: 良好（good）
 *   - 其它: 正常（ok）
 */
function computeWeakPoints(moduleRanking) {
  var weakPoints = [];
  for (var i = 0; i < moduleRanking.length; i++) {
    var m = moduleRanking[i];
    if (m.totalAnswered === 0) continue; /* 未练习的模块不标记 */
    var ctx = { accuracy: m.accuracy, totalAnswered: m.totalAnswered, key: m.key, label: m.label };
    var matched = applyLabelRules(ctx, 'weakPoints');
    var level = matched ? matched.id : 'ok';
    weakPoints.push({
      key: m.key,
      label: m.label,
      desc: m.desc,
      accuracy: m.accuracy,
      totalAnswered: m.totalAnswered,
      level: level,
      levelLabel: matched ? matched.label : '正常',
      color: matched ? matched.color : '#888888'
    });
  }
  return weakPoints;
}

/* ============================================================
 * v4.0 标注规则引擎
 * 规则可被 window.BioQuestDiagnosisRules 覆盖（无需修改源码）
 * ============================================================ */
var DIAGNOSIS_RULES = {
  // 薄弱等级规则：按顺序匹配，第一个匹配的规则生效
  weakPoints: [
    { id: 'severe', label: '严重薄弱', color: '#c45a5a', condition: function (ctx) { return ctx.accuracy < 40; } },
    { id: 'weak', label: '薄弱', color: '#c49a4a', condition: function (ctx) { return ctx.accuracy < 60; } },
    { id: 'good', label: '良好', color: '#5a7d5c', condition: function (ctx) { return ctx.accuracy >= 80; } },
    { id: 'ok', label: '正常', color: '#888888', condition: function () { return true; } }
  ],
  // 学习行为标注规则：所有匹配的规则都会被收集
  annotations: [
    {
      id: 'low_volume', label: '练习量不足',
      condition: function (ctx) { return ctx.totalAnswered < 20; },
      suggestion: '建议增加练习量到至少 20 题，以建立基线数据'
    },
    {
      id: 'high_volume_low_acc', label: '刷题多但效果差',
      condition: function (ctx) { return ctx.totalAnswered >= 50 && ctx.accuracy < 50; },
      suggestion: '放慢节奏，加强错题复盘，关注理解而非数量'
    },
    {
      id: 'no_recent_activity', label: '近期无活动',
      condition: function (ctx) { return ctx.daysSinceLastActivity >= 7; },
      suggestion: '尽快恢复学习节奏，避免遗忘曲线下降'
    },
    {
      id: 'improving', label: '快速提升中',
      condition: function (ctx) { return ctx.trendDelta > 10; },
      suggestion: '保持当前节奏，可适当挑战更高难度'
    },
    {
      id: 'declining', label: '状态下滑',
      condition: function (ctx) { return ctx.trendDelta < -10; },
      suggestion: '回顾近期错题，调整学习方法'
    },
    {
      id: 'streak_break', label: '连续中断',
      condition: function (ctx) { return ctx.streak === 0 && ctx.totalAnswered > 0; },
      suggestion: '重新建立每日学习习惯'
    },
    {
      id: 'excellent', label: '表现优异',
      condition: function (ctx) { return ctx.accuracy >= 90 && ctx.totalAnswered >= 30; },
      suggestion: '可挑战更高难度的题目，或帮助其他同学'
    }
  ]
};

/**
 * 应用单选规则（取第一个匹配的）
 * @param {Object} ctx - 上下文 { accuracy, totalAnswered, ... }
 * @param {string} ruleType - 'weakPoints' 或其他自定义类型
 */
function applyLabelRules(ctx, ruleType) {
  var rules = (window.BioQuestDiagnosisRules && window.BioQuestDiagnosisRules[ruleType]) || DIAGNOSIS_RULES[ruleType];
  if (!rules || !rules.length) return null;
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i];
    try {
      if (r && typeof r.condition === 'function' && r.condition(ctx)) return r;
    } catch (e) { /* 静默 */ }
  }
  return null;
}

/**
 * 应用多选规则（收集所有匹配的标注）
 * @param {Object} ctx - 上下文
 * @returns {Array} 匹配的标注规则数组
 */
function applyAnnotationRules(ctx) {
  var rules = (window.BioQuestDiagnosisRules && window.BioQuestDiagnosisRules.annotations) || DIAGNOSIS_RULES.annotations;
  var matched = [];
  if (!rules || !rules.length) return matched;
  for (var i = 0; i < rules.length; i++) {
    try {
      if (rules[i] && typeof rules[i].condition === 'function' && rules[i].condition(ctx)) {
        matched.push(rules[i]);
      }
    } catch (e) { /* 静默 */ }
  }
  return matched;
}

/**
 * 为用户整体学情生成标注
 * @param {Object} stats - { totalAnswered, totalCorrect, accuracy, streak, trendDelta, daysSinceLastActivity }
 */
function generateUserAnnotations(stats) {
  stats = stats || {};
  var ctx = {
    accuracy: stats.accuracy || 0,
    totalAnswered: stats.totalAnswered || 0,
    streak: stats.streak || 0,
    trendDelta: stats.trendDelta || 0,
    daysSinceLastActivity: stats.daysSinceLastActivity != null ? stats.daysSinceLastActivity : 0
  };
  return applyAnnotationRules(ctx);
}

/**
 * 提分路径预估
 * 假设将某模块正确率提升到 70%，重新计算 Bio Score 的差值
 */
function computeScorePaths(stats, moduleRanking, currentBioScore) {
  if (!currentBioScore || !stats) return [];
  var currentScore = currentBioScore.score || 0;
  var paths = [];

  for (var i = 0; i < moduleRanking.length; i++) {
    var m = moduleRanking[i];
    if (!m || !m.totalAnswered || m.totalAnswered <= 0) continue;
    if (m.accuracy >= 70) continue; /* 已达标的模块跳过 */

    /* 模拟将该模块正确率提升到 70% */
    var simulatedStats;
    try {
      simulatedStats = JSON.parse(JSON.stringify(stats));
    } catch (e) { continue; }
    if (!simulatedStats.modules) simulatedStats.modules = {};

    /* 修改目标模块数据 */
    var targetCorrect = Math.round(m.totalAnswered * 0.7);
    simulatedStats.modules[m.key] = {
      totalAnswered: m.totalAnswered,
      totalCorrect: targetCorrect,
      accuracy: 70
    };

    /* 重新计算全局统计 */
    var newTotalCorrect = 0;
    var newTotalAnswered = 0;
    for (var mod in simulatedStats.modules) {
      if (simulatedStats.modules.hasOwnProperty(mod)) {
        var modData = simulatedStats.modules[mod];
        if (modData && typeof modData.totalAnswered === 'number') {
          newTotalAnswered += modData.totalAnswered;
          newTotalCorrect += modData.totalCorrect || 0;
        }
      }
    }
    simulatedStats.totalAnswered = newTotalAnswered;
    simulatedStats.totalCorrect = newTotalCorrect;
    simulatedStats.accuracy = newTotalAnswered > 0
      ? Math.round((newTotalCorrect / newTotalAnswered) * 100)
      : 0;

    /* 重新计算 Bio Score */
    var newBioScore = typeof calcBioScore === 'function'
      ? calcBioScore(simulatedStats)
      : null;

    var gain = (newBioScore && typeof newBioScore.score === 'number')
      ? Math.max(0, newBioScore.score - currentScore)
      : 0;

    paths.push({
      key: m.key,
      label: m.label,
      desc: m.desc,
      currentAccuracy: m.accuracy,
      targetAccuracy: 70,
      estimatedGain: gain,
      priority: gain /* 提分幅度越大优先级越高 */
    });
  }

  /* 按预估提分幅度降序排列 */
  paths.sort(function(a, b) { return b.estimatedGain - a.estimatedGain; });
  return paths;
}

/**
 * 错误趋势分析
 * 对比最近 5 次和之前 5 次的正确率变化
 */
function computeTrendData(records) {
  if (!records || records.length === 0) {
    return { points: [], trend: 'none', summary: '暂无数据' };
  }

  /* 按时间升序排列（旧→新） */
  var sorted = records.slice().sort(function(a, b) {
    return (a.timestamp || 0) - (b.timestamp || 0);
  });

  /* 取最近 10 条记录（不足则全部） */
  var recent = sorted.slice(-10);

  var points = [];
  for (var i = 0; i < recent.length; i++) {
    var r = recent[i];
    var total = r.totalQuestions || 0;
    var correct = r.correctCount || 0;
    // correctCount 恒钳制到题目级（≤total），防御旧考试记录中「子题正确数」>题目数
    var accuracy = total > 0 ? Math.min(100, Math.round((Math.min(correct, total) / total) * 100)) : 0;
    var date = r.date || '';
    /* 简化日期显示 */
    if (date.length > 5) date = date.slice(5); /* MM-DD */
    points.push({
      index: i + 1,
      accuracy: accuracy,
      date: date,
      total: total,
      correct: correct
    });
  }

  /* 计算趋势 */
  var trend = 'stable';
  var summary = '';

  if (points.length >= 4) {
    var mid = Math.floor(points.length / 2);
    var firstHalf = points.slice(0, mid);
    var secondHalf = points.slice(mid);

    var avgFirst = averageAccuracy(firstHalf);
    var avgSecond = averageAccuracy(secondHalf);
    var diff = avgSecond - avgFirst;

    if (diff > 8) {
      trend = 'improving';
      summary = '正确率呈上升趋势，近半段平均 ' + avgSecond + '%，较前半段提升 ' + Math.round(diff) + '%';
    } else if (diff < -8) {
      trend = 'declining';
      summary = '正确率呈下降趋势，近半段平均 ' + avgSecond + '%，较前半段下降 ' + Math.round(Math.abs(diff)) + '%';
    } else {
      trend = 'stable';
      summary = '正确率基本稳定，近期平均 ' + avgSecond + '%';
    }
  } else {
    var avgAll = averageAccuracy(points);
    summary = '数据较少，近期平均正确率 ' + avgAll + '%，继续练习可获得更准确的趋势分析';
  }

  return { points: points, trend: trend, summary: summary };
}

function averageAccuracy(points) {
  if (!points || points.length === 0) return 0;
  var sum = 0;
  for (var i = 0; i < points.length; i++) {
    sum += points[i].accuracy;
  }
  return Math.round(sum / points.length);
}

/**
 * 学习建议生成
 * 基于薄弱点和题型分析，给出个性化建议
 */
function computeAdviceList(weakPoints, typeAnalysis, wrongQuestions) {
  var adviceList = [];

  /* 1. 针对严重薄弱模块的建议 */
  for (var i = 0; i < weakPoints.length; i++) {
    var wp = weakPoints[i];
    if (wp.level === 'severe') {
      adviceList.push({
        priority: 'high',
        title: '重点补强 ' + wp.label + '（' + wp.desc + '）',
        desc: '该模块正确率仅 ' + wp.accuracy + '%，属于严重薄弱。建议先从基础题开始，系统复习核心知识点，再逐步提升难度。每次练习 10-20 题，确保理解每个判断项的逻辑。',
        module: wp.key,
        action: '去练习'
      });
    } else if (wp.level === 'weak') {
      adviceList.push({
        priority: 'mid',
        title: '巩固 ' + wp.label + '（' + wp.desc + '）',
        desc: '该模块正确率 ' + wp.accuracy + '%，仍有较大提升空间。建议针对错题进行专项练习，重点关注反复出错的判断项，强化薄弱知识点。',
        module: wp.key,
        action: '去练习'
      });
    }
  }

  /* 2. 针对薄弱题型的建议 */
  for (var j = 0; j < typeAnalysis.length; j++) {
    var ta = typeAnalysis[j];
    if (ta.accuracy < 50 && ta.total >= 5) {
      adviceList.push({
        priority: 'mid',
        title: '提升 ' + ta.label + ' 解题能力',
        desc: ta.label + '正确率仅 ' + ta.accuracy + '%（共 ' + ta.total + ' 题）。建议仔细阅读解析，理解出题逻辑和常见陷阱，培养系统性判断思维。',
        module: null,
        action: null
      });
    }
  }

  /* 3. 错题复习建议 */
  if (wrongQuestions && wrongQuestions.length >= 3) {
    adviceList.push({
      priority: 'mid',
      title: '定期复习错题（当前 ' + wrongQuestions.length + ' 题）',
      desc: '错题是提分的关键资源。建议每周至少复习一次错题本，重做反复出错的题目，直到完全掌握。间隔重复比集中突击效果更好。',
      module: null,
      action: '查看错题'
    });
  }

  /* 4. 如果没有明显薄弱点，给出进阶建议 */
  if (adviceList.length === 0) {
    adviceList.push({
      priority: 'low',
      title: '保持练习节奏，挑战更高难度',
      desc: '你的各模块正确率均较好，建议尝试更高难度的题目，或综合跨模块练习，提升综合解题能力。',
      module: null,
      action: '开始练习'
    });
  }

  return adviceList;
}

/**
 * 知识图谱依赖路径分析：为薄弱模块找到前置依赖概念
 * 利用 ai-diagnostic-engine.js 的 analyzeWeaknessChain
 */
function computeLearningPath(weakPoints, moduleRanking) {
  var learningPath = [];
  var ai = (typeof window.BioQuestAI !== 'undefined') ? window.BioQuestAI : null;
  var mastery = {};

  /* 从 localStorage 读取各知识点的 BKT 掌握概率 */
  try {
    var raw = localStorage.getItem('bioquest_skill_mastery');
    if (raw) mastery = JSON.parse(raw);
  } catch (e) { mastery = {}; }

  /* 只处理严重薄弱和薄弱的模块 */
  for (var i = 0; i < weakPoints.length; i++) {
    var wp = weakPoints[i];
    if (wp.level !== 'severe' && wp.level !== 'weak') continue;

    var step = {
      module: wp.key,
      label: wp.label,
      desc: wp.desc,
      accuracy: wp.accuracy,
      level: wp.level,
      dependencies: [],
      recommendation: ''
    };

    /* 使用 AI 引擎分析依赖链 */
    if (ai && typeof ai.analyzeWeakness === 'function') {
      try {
        var chain = ai.analyzeWeakness(mastery, 0.6);
        // chain 返回 { weakConcepts: [...], rootCauses: [...], chainDescriptions: [...] }
        if (chain && chain.rootCauses && chain.rootCauses.length > 0) {
          step.dependencies = chain.rootCauses.slice(0, 3);
        }
        if (chain && chain.chainDescriptions && chain.chainDescriptions.length > 0) {
          step.recommendation = chain.chainDescriptions.slice(0, 2).join('；');
        }
      } catch (e) { /* 静默 */ }
    }

    /* 如果 AI 引擎不可用，使用本地简单推断 */
    if (step.dependencies.length === 0) {
      step.dependencies = getSimpleDependencies(wp.key);
      step.recommendation = '建议从基础概念入手，逐步建立知识体系。';
    }

    learningPath.push(step);
  }

  return learningPath;
}

/**
 * 简单依赖映射：当 AI 引擎不可用时的后备方案
 */
function getSimpleDependencies(moduleKey) {
  var map = {
    'module_1': ['细胞膜结构', 'DNA复制', '酶'],
    'module_2': ['光合作用', '植物组织', '微生物分类'],
    'module_3': ['遗传定律', '减数分裂', '基因表达'],
    'module_4': ['种群特征', '生态系统', '进化论']
  };
  return map[moduleKey] || ['基础知识'];
}

/* ============================================================
 * 渲染函数
 * ============================================================ */

/**
 * 获取正确率对应的颜色等级（热力图用）
 * @param {number} accuracy - 正确率 0-100
 * @returns {string} 热力图等级 class
 */
function getHeatLevel(accuracy) {
  if (accuracy < 30) return '0';
  if (accuracy < 50) return '1';
  if (accuracy < 65) return '2';
  if (accuracy < 80) return '3';
  return '4';
}

/**
 * 获取正确率对应的颜色
 * @param {number} accuracy
 * @returns {string} CSS 颜色值
 */
function getAccuracyColor(accuracy) {
  if (accuracy < 40) return 'var(--color-error, #c0553a)';
  if (accuracy < 60) return 'var(--color-amber, #c4956a)';
  if (accuracy < 80) return 'var(--color-olive, #8ba888)';
  return 'var(--color-success, #3a8c5c)';
}

/**
 * 获取薄弱等级标签
 */
function getWeakLabel(level) {
  if (level === 'severe') return '<span class="diagnosis-rank-tag diagnosis-rank-tag--severe">严重薄弱</span>';
  if (level === 'weak') return '<span class="diagnosis-rank-tag diagnosis-rank-tag--weak">薄弱</span>';
  if (level === 'good') return '<span class="diagnosis-rank-tag diagnosis-rank-tag--good">优秀</span>';
  return '<span class="diagnosis-rank-tag diagnosis-rank-tag--ok">正常</span>';
}

/**
 * 渲染诊断概览
 */
function renderDiagnosisOverview(data) {
  var weakest = (data.weakPoints && data.weakPoints.length > 0) ? data.weakPoints[0] : null;
  var weakestLabel = weakest ? (weakest.label || '未知') + '（' + (weakest.accuracy || 0) + '%）' : '暂无';
  var weakCount = 0;
  for (var i = 0; i < data.weakPoints.length; i++) {
    if (data.weakPoints[i].level === 'severe' || data.weakPoints[i].level === 'weak') {
      weakCount++;
    }
  }

  var bioScoreValue = data.bioScore ? data.bioScore.score : '--';
  var bioScoreGrade = data.bioScore ? data.bioScore.grade + ' ' + data.bioScore.letter : '--';

  var html = '';
  html += '<div class="diagnosis-overview">';

  /* 总评 */
  html += '<div class="diagnosis-overview-card diagnosis-overview-card--amber">';
  html += '<div class="diagnosis-overview-icon">BG</div>';
  html += '<div class="diagnosis-overview-value">' + bioScoreValue + '</div>';
  html += '<div class="diagnosis-overview-label">Bio Score ' + bioScoreGrade + '</div>';
  html += '</div>';

  /* 最薄弱模块 */
  html += '<div class="diagnosis-overview-card diagnosis-overview-card--warn">';
  html += '<div class="diagnosis-overview-icon">WK</div>';
  html += '<div class="diagnosis-overview-value">' + weakestLabel + '</div>';
  html += '<div class="diagnosis-overview-label">最薄弱模块</div>';
  html += '</div>';

  /* 薄弱点数 */
  html += '<div class="diagnosis-overview-card' + (weakCount > 0 ? ' diagnosis-overview-card--warn' : ' diagnosis-overview-card--good') + '">';
  html += '<div class="diagnosis-overview-icon">DA</div>';
  html += '<div class="diagnosis-overview-value">' + weakCount + '</div>';
  html += '<div class="diagnosis-overview-label">薄弱知识点数</div>';
  html += '</div>';

  html += '</div>';
  return html;
}

/**
 * 渲染模块正确率排名
 */
function renderModuleRanking(ranking) {
  var html = '';
  html += '<div class="diagnosis-section">';
  html += '<div class="diagnosis-section-title">模块正确率排名</div>';
  html += '<div class="diagnosis-section-subtitle">最弱模块优先，精准定位薄弱环节</div>';
  html += '<div class="diagnosis-rank-list">';

  for (var i = 0; i < ranking.length; i++) {
    var m = ranking[i];
    var numClass = i < 3 ? ' diagnosis-rank-num--' + (i + 1) : '';
    var barColor = getAccuracyColor(m.accuracy);
    var barWidth = m.totalAnswered > 0 ? m.accuracy : 0;
    var pctColor = getAccuracyColor(m.accuracy);
    var level = 'ok';
    if (m.totalAnswered === 0) level = 'none';
    else if (m.accuracy < 40) level = 'severe';
    else if (m.accuracy < 60) level = 'weak';
    else if (m.accuracy >= 80) level = 'good';

    html += '<div class="diagnosis-rank-item">';
    html += '<div class="diagnosis-rank-num' + numClass + '">' + (i + 1) + '</div>';
    html += '<div class="diagnosis-rank-info">';
    html += '<div class="diagnosis-rank-name">' + m.label + ' ' + m.desc + '</div>';
    html += '<div class="diagnosis-rank-detail">已答 ' + m.totalAnswered + ' 题，正确 ' + m.totalCorrect + ' 题</div>';
    html += '</div>';
    html += '<div class="diagnosis-rank-bar">';
    html += '<div class="diagnosis-rank-bar-fill" style="width:' + barWidth + '%;background:' + barColor + ';"></div>';
    html += '</div>';
    html += '<div class="diagnosis-rank-pct" style="color:' + pctColor + ';">' + (m.totalAnswered > 0 ? m.accuracy + '%' : '--') + '</div>';
    if (m.totalAnswered > 0) {
      html += getWeakLabel(level);
    }
    html += '</div>';
  }

  html += '</div>';
  html += '</div>';
  return html;
}

/**
 * 渲染知识点掌握度热力图
 */
function renderHeatmap(weakPoints) {
  var html = '';
  html += '<div class="diagnosis-section">';
  html += '<div class="diagnosis-section-title">知识点掌握度热力图</div>';
  html += '<div class="diagnosis-section-subtitle">颜色越深表示掌握越好，红色区域需重点关注</div>';
  html += '<div class="diagnosis-heatmap-grid">';

  for (var i = 0; i < DIAGNOSIS_MODULES.length; i++) {
    var mod = DIAGNOSIS_MODULES[i];
    /* 从 weakPoints 中找对应数据 */
    var wp = null;
    for (var j = 0; j < weakPoints.length; j++) {
      if (weakPoints[j].key === mod.key) {
        wp = weakPoints[j];
        break;
      }
    }

    var accuracy = wp ? wp.accuracy : 0;
    var answered = wp ? wp.totalAnswered : 0;
    var heatLevel = answered > 0 ? getHeatLevel(accuracy) : '0';
    var displayAcc = answered > 0 ? accuracy + '%' : '未练习';

    html += '<div class="diagnosis-heatmap-cell diagnosis-heat-' + heatLevel + '">';
    html += '<div class="diagnosis-heatmap-module">' + mod.label + '</div>';
    html += '<div class="diagnosis-heatmap-desc">' + mod.desc + '</div>';
    html += '<div class="diagnosis-heatmap-value">' + displayAcc + '</div>';
    html += '<div class="diagnosis-heatmap-label">掌握度</div>';
    html += '</div>';
  }

  html += '</div>';

  /* 热力图图例 */
  html += '<div style="display:flex;justify-content:center;gap:12px;margin-top:16px;flex-wrap:wrap;">';
  html += '<div style="display:flex;align-items:center;gap:4px;font-size:0.72rem;color:var(--text-muted);"><span style="width:14px;height:14px;border-radius:2px;background:rgba(192,85,58,0.4);"></span>严重薄弱(&lt;30%)</div>';
  html += '<div style="display:flex;align-items:center;gap:4px;font-size:0.72rem;color:var(--text-muted);"><span style="width:14px;height:14px;border-radius:2px;background:rgba(196,149,106,0.4);"></span>薄弱(30-49%)</div>';
  html += '<div style="display:flex;align-items:center;gap:4px;font-size:0.72rem;color:var(--text-muted);"><span style="width:14px;height:14px;border-radius:2px;background:rgba(139,168,136,0.4);"></span>一般(50-64%)</div>';
  html += '<div style="display:flex;align-items:center;gap:4px;font-size:0.72rem;color:var(--text-muted);"><span style="width:14px;height:14px;border-radius:2px;background:rgba(90,125,92,0.35);"></span>良好(65-79%)</div>';
  html += '<div style="display:flex;align-items:center;gap:4px;font-size:0.72rem;color:var(--text-muted);"><span style="width:14px;height:14px;border-radius:2px;background:rgba(58,140,92,0.35);"></span>优秀(≥80%)</div>';
  html += '</div>';

  html += '</div>';
  return html;
}

/**
 * 渲染题型分析
 */
function renderTypeAnalysis(typeAnalysis) {
  var html = '';
  html += '<div class="diagnosis-section">';
  html += '<div class="diagnosis-section-title">题型正确率分析</div>';
  html += '<div class="diagnosis-section-subtitle">识别反复出错的题型，针对性突破</div>';

  if (typeAnalysis.length === 0) {
    html += '<div class="diagnosis-empty" style="padding:32px;">';
    html += '<p style="color:var(--text-muted);font-size:0.88rem;">暂无题型数据，完成更多练习后可查看分析</p>';
    html += '</div>';
  } else {
    html += '<div class="diagnosis-type-grid">';

    /* 题型图标映射 */
    var typeIcons = {
      mtf: 'MTF',
      single: 'SC',
      multiple: 'MC',
      tf: 'TF',
      logic: 'LG'
    };

    for (var i = 0; i < typeAnalysis.length; i++) {
      var ta = typeAnalysis[i];
      var icon = typeIcons[ta.type] || 'NA';
      var barColor = getAccuracyColor(ta.accuracy);
      var pctColor = getAccuracyColor(ta.accuracy);
      var iconBg = ta.accuracy < 50
        ? 'rgba(192,85,58,0.1)'
        : ta.accuracy < 70
          ? 'rgba(196,149,106,0.1)'
          : 'rgba(90,125,92,0.1)';

      html += '<div class="diagnosis-type-card">';
      html += '<div class="diagnosis-type-icon" style="background:' + iconBg + ';">' + icon + '</div>';
      html += '<div class="diagnosis-type-info">';
      html += '<div class="diagnosis-type-name">' + ta.label + ' <span style="font-size:0.72rem;color:var(--text-muted);font-weight:400;">(' + ta.total + '题)</span></div>';
      html += '<div class="diagnosis-type-bar">';
      html += '<div class="diagnosis-type-bar-fill" style="width:' + ta.accuracy + '%;background:' + barColor + ';"></div>';
      html += '</div>';
      html += '</div>';
      html += '<div class="diagnosis-type-pct" style="color:' + pctColor + ';">' + ta.accuracy + '%</div>';
      html += '</div>';
    }

    html += '</div>';
  }

  html += '</div>';
  return html;
}

/**
 * 渲染提分路径
 */
function renderScorePaths(scorePaths) {
  var html = '';
  html += '<div class="diagnosis-section">';
  html += '<div class="diagnosis-section-title">预估提分路径</div>';
  html += '<div class="diagnosis-section-subtitle">假设将薄弱模块正确率提升至 70%，预估 Bio Score 提升幅度</div>';

  if (scorePaths.length === 0) {
    html += '<div class="diagnosis-empty" style="padding:32px;">';
    html += '<p style="color:var(--text-muted);font-size:0.88rem;">各模块均已达标</p>';
    html += '</div>';
  } else {
    html += '<div class="diagnosis-path-list">';

    for (var i = 0; i < scorePaths.length; i++) {
      var sp = scorePaths[i];
      html += '<div class="diagnosis-path-item">';
      html += '<div class="diagnosis-path-step">' + (i + 1) + '</div>';
      html += '<div class="diagnosis-path-content">';
      html += '<div class="diagnosis-path-action">补强 ' + sp.label + '（' + sp.desc + '）</div>';
      html += '<div class="diagnosis-path-reason">当前正确率 ' + sp.currentAccuracy + '% → 目标 70%</div>';
      html += '</div>';
      html += '<div class="diagnosis-path-score">';
      html += '<div class="diagnosis-path-score-value">+' + sp.estimatedGain + '</div>';
      html += '<div class="diagnosis-path-score-label">Bio Score</div>';
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';
  }

  html += '</div>';
  return html;
}

/**
 * 渲染错误趋势图
 */
function renderTrendChart(trendData) {
  var html = '';
  html += '<div class="diagnosis-section">';
  html += '<div class="diagnosis-section-title">错误趋势分析</div>';
  html += '<div class="diagnosis-section-subtitle">最近练习正确率走势，洞察学习进步轨迹</div>';

  if (trendData.points.length === 0) {
    html += '<div class="diagnosis-empty" style="padding:32px;">';
    html += '<p style="color:var(--text-muted);font-size:0.88rem;">暂无练习记录，完成练习后可查看趋势</p>';
    html += '</div>';
  } else {
    /* CSS 柱状图 */
    var maxAcc = 100;
    html += '<div class="diagnosis-trend-chart">';

    for (var i = 0; i < trendData.points.length; i++) {
      var p = trendData.points[i];
      var height = Math.max(4, (p.accuracy / maxAcc) * 100); /* 最低 4% 高度 */
      var barColor = getAccuracyColor(p.accuracy);
      var labelColor = getAccuracyColor(p.accuracy);

      html += '<div class="diagnosis-trend-bar-group">';
      html += '<div class="diagnosis-trend-bar" style="height:' + height + '%;background:' + barColor + ';">';
      html += '<div class="diagnosis-trend-bar-label" style="color:' + labelColor + ';">' + p.accuracy + '%</div>';
      html += '</div>';
      html += '<div class="diagnosis-trend-x-label">' + p.date + '</div>';
      html += '</div>';
    }

    html += '</div>';

    /* 图例 */
    html += '<div class="diagnosis-trend-legend">';
    html += '<div class="diagnosis-trend-legend-item"><span class="diagnosis-trend-legend-dot" style="background:var(--color-error, #c0553a);"></span>&lt;40%</div>';
    html += '<div class="diagnosis-trend-legend-item"><span class="diagnosis-trend-legend-dot" style="background:var(--color-amber, #c4956a);"></span>40-59%</div>';
    html += '<div class="diagnosis-trend-legend-item"><span class="diagnosis-trend-legend-dot" style="background:var(--color-olive, #8ba888);"></span>60-79%</div>';
    html += '<div class="diagnosis-trend-legend-item"><span class="diagnosis-trend-legend-dot" style="background:var(--color-success, #3a8c5c);"></span>≥80%</div>';
    html += '</div>';

    /* 趋势总结 */
    var trendIcon = trendData.trend === 'improving' ? '/\\'
      : trendData.trend === 'declining' ? '\\/'
      : '->';
    html += '<div class="diagnosis-trend-summary">';
    html += trendIcon + ' ' + trendData.summary;
    html += '</div>';
  }

  html += '</div>';
  return html;
}

/**
 * 渲染学习建议
 */
function renderAdviceList(adviceList) {
  var html = '';
  html += '<div class="diagnosis-section">';
  html += '<div class="diagnosis-section-title">个性化学习建议</div>';
  html += '<div class="diagnosis-section-subtitle">基于你的薄弱点，推荐最优练习策略</div>';

  html += '<div class="diagnosis-advice-list">';

  for (var i = 0; i < adviceList.length; i++) {
    var adv = adviceList[i];
    var priorityClass = adv.priority === 'high' ? '--high'
      : adv.priority === 'mid' ? '--mid'
      : '--low';
    var priorityLabel = adv.priority === 'high' ? '高'
      : adv.priority === 'mid' ? '中'
      : '低';

    html += '<div class="diagnosis-advice-item">';
    html += '<div class="diagnosis-advice-priority diagnosis-advice-priority' + priorityClass + '">' + priorityLabel + '</div>';
    html += '<div class="diagnosis-advice-content">';
    html += '<div class="diagnosis-advice-title">' + adv.title + '</div>';
    html += '<div class="diagnosis-advice-desc">' + adv.desc + '</div>';
    html += '</div>';

    if (adv.action) {
      html += '<div class="diagnosis-advice-action">';
      html += '<button class="diagnosis-advice-btn" data-diagnosis-action="' + (adv.module || '') + '" data-diagnosis-type="' + (adv.action === '查看错题' ? 'wrong' : 'practice') + '">' + adv.action + '</button>';
      html += '</div>';
    }

    html += '</div>';
  }

  html += '</div>';
  html += '</div>';
  return html;
}

/**
 * 渲染知识图谱学习路径
 * 展示薄弱模块的前置依赖概念和推荐学习顺序
 */
function renderLearningPath(learningPath) {
  var html = '';
  html += '<div class="diagnosis-section">';
  html += '<div class="diagnosis-section-title">知识图谱推荐学习路径</div>';
  html += '<div class="diagnosis-section-subtitle">基于知识依赖关系，推荐从基础概念到高级概念的渐进学习顺序</div>';

  html += '<div class="diagnosis-learning-path">';

  for (var i = 0; i < learningPath.length; i++) {
    var step = learningPath[i];
    var levelColor = step.level === 'severe' ? '#c0553a' : '#c4956a';
    var levelLabel = step.level === 'severe' ? '严重薄弱' : '薄弱';

    html += '<div class="diagnosis-path-step" style="margin-bottom:20px;padding:16px;background:var(--surface-secondary,#faf7f2);border-radius:12px;border-left:4px solid ' + levelColor + ';">';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
    html += '<span style="font-weight:700;font-size:1.05rem;color:var(--color-deep,#1a3a2a);">' + (i + 1) + '. ' + step.label + '</span>';
    html += '<span style="font-size:0.75rem;padding:2px 8px;background:' + levelColor + ';color:#fff;border-radius:8px;">' + levelLabel + ' (' + step.accuracy + '%)</span>';
    html += '</div>';
    html += '<div style="font-size:0.85rem;color:var(--text-secondary,#4a4a4a);">' + step.desc + '</div>';

    if (step.dependencies && step.dependencies.length > 0) {
      html += '<div style="margin-top:10px;font-size:0.82rem;">';
      html += '<span class="bq-text-muted">前置依赖：</span>';
      for (var d = 0; d < step.dependencies.length; d++) {
        html += '<span style="display:inline-block;margin-right:6px;padding:2px 8px;background:rgba(90,125,92,0.1);color:var(--color-sage,#5a7d5c);border-radius:8px;font-size:0.78rem;">' + step.dependencies[d] + '</span>';
        if (d < step.dependencies.length - 1) html += '<span style="color:var(--text-muted,#8a8a8a);margin:0 2px;">→</span>';
      }
      html += '</div>';
    }

    if (step.recommendation) {
      html += '<div style="margin-top:8px;font-size:0.82rem;color:var(--color-sage,#5a7d5c);">';
      html += step.recommendation;
      html += '</div>';
    }

    html += '<div style="margin-top:10px;">';
    html += '<button class="diagnosis-advice-btn" data-diagnosis-action="' + step.module + '" data-diagnosis-type="practice" style="font-size:0.8rem;padding:6px 14px;">开始专项练习</button>';
    html += '</div>';

    html += '</div>';
  }

  html += '</div>';
  html += '</div>';
  return html;
}

/* ============================================================
 * 页面渲染主函数
 * ============================================================ */

/**
 * 渲染学情诊断页面
 * 修复 P1-3：原"AI 智能诊断"更名为"学情诊断"，明确标注基于规则引擎 + BKT
 * @param {HTMLElement} target - 页面容器
 */
function renderSmartDiagnosisPage(target) {
  if (!target) return;

  /* 采集并分析数据 */
  var data = computeDiagnosis();

  /* 数据不足时显示空状态 */
  var totalAnswered = data.totalAnswered || 0;
  if (typeof totalAnswered !== 'number' || isNaN(totalAnswered)) totalAnswered = 0;
  if (totalAnswered < 10) {
    target.innerHTML = '\
      <div class="diagnosis-page animate-fade-in">\
        <div class="diagnosis-empty">\
          <div class="diagnosis-empty-icon">--</div>\
          <div class="diagnosis-empty-title">数据不足，暂无法诊断</div>\
          <div class="diagnosis-empty-desc">学情诊断需要至少 10 道题的练习数据。<br>当前已答 ' + totalAnswered + ' 题，还需 ' + Math.max(0, 10 - totalAnswered) + ' 题。</div>\
          <button class="diagnosis-empty-btn" data-on=\'["_cspGoDiagnosisPractice"]\'>去练习</button>\
        </div>\
      </div>\
    ';
    return;
  }

  /* 组装页面 */
  var html = '';
  html += '<div class="diagnosis-page animate-fade-in">';

  /* 顶部：诊断概览 */
  html += '<div class="diagnosis-header">';
  html += '<div class="diagnosis-header-label">LEARNING DIAGNOSIS</div>';
  html += '<div class="diagnosis-header-title">学情诊断</div>';
  html += '<div class="diagnosis-header-desc">基于 ' + data.totalAnswered + ' 道练习数据的学情分析报告</div>';
  // 修复 P1-3：诚实标注诊断方法，避免"AI 诊断"误导
  html += '<div class="diagnosis-header-method" style="margin-top:8px;font-size:0.78rem;color:var(--text-secondary,#6b7f74);background:var(--color-cream,#faf7f2);padding:6px 12px;border-radius:var(--radius-sm, 4px);display:inline-block;">诊断方法：规则引擎 + BKT 贝叶斯知识追踪（纯本地计算，无需 AI 调用）</div>';
  html += '</div>';

  html += renderDiagnosisOverview(data);

  /* 中部：热力图 + 题型分析（双栏） */
  html += '<div class="diagnosis-two-col">';
  html += renderHeatmap(data.weakPoints);
  html += renderTypeAnalysis(data.typeAnalysis);
  html += '</div>';

  /* 模块正确率排名 */
  html += renderModuleRanking(data.moduleRanking);

  /* 底部：提分路径 + 错误趋势（双栏） */
  html += '<div class="diagnosis-two-col">';
  html += renderScorePaths(data.scorePaths);
  html += renderTrendChart(data.trendData);
  html += '</div>';

  /* 学习建议 */
  html += renderAdviceList(data.adviceList);

  /* 知识图谱学习路径 */
  if (data.learningPath && data.learningPath.length > 0) {
    html += renderLearningPath(data.learningPath);
  }

  html += '</div>';

  target.innerHTML = html;

  /* 绑定建议按钮事件 */
  bindDiagnosisActions();
}

/**
 * 绑定诊断页面的交互事件
 */
function bindDiagnosisActions() {
  var btns = document.querySelectorAll('[data-diagnosis-action]');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var actionType = btn.getAttribute('data-diagnosis-type') || '';
      var module = btn.getAttribute('data-diagnosis-action') || '';

      if (actionType === 'wrong') {
        /* 跳转到学习分析页（错题本） */
        if (typeof navigateTo === 'function') {
          navigateTo('/analytics');
        } else {
          window.location.hash = '#/analytics';
        }
      } else if (actionType === 'practice' && module) {
        /* 跳转到练习页，预选对应模块 */
        try {
          if (typeof PracticeState !== 'undefined') {
            PracticeState.selectedModules = [module];
          }
        } catch (e) {}
        if (typeof navigateTo === 'function') {
          navigateTo('/practice');
        } else {
          window.location.hash = '#/practice';
        }
      } else {
        /* 默认跳转练习页 */
        if (typeof navigateTo === 'function') {
          navigateTo('/practice');
        } else {
          window.location.hash = '#/practice';
        }
      }
    });
  });
}

/* ============================================================
 * 初始化函数
 * ============================================================ */

/**
 * 初始化智能诊断模块
 * @param {HTMLElement} target - 页面容器（可选，默认取 AppState.rootElement 或 #page-content）
 */
function initSmartDiagnosis(target) {
  injectDiagnosisStyles();

  if (!target) {
    if (typeof AppState !== 'undefined' && AppState.rootElement) {
      target = AppState.rootElement;
    } else {
      target = document.getElementById('page-content');
    }
  }

  renderSmartDiagnosisPage(target);
}

/* 挂载到 window 对象，供 app.js 调用 */
window.initSmartDiagnosis = initSmartDiagnosis;
window.renderSmartDiagnosisPage = renderSmartDiagnosisPage;

/* v4.0 标注规则引擎对外暴露（可被 window.BioQuestDiagnosisRules 覆盖） */
window.DIAGNOSIS_RULES = DIAGNOSIS_RULES;
window.applyLabelRules = applyLabelRules;
window.applyAnnotationRules = applyAnnotationRules;
window.generateUserAnnotations = generateUserAnnotations;
window.computeWeakPoints = computeWeakPoints;
