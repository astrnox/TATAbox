/**
 * ============================================================
 * TATABOX — 交互式生物学知识图谱模块
 * 纯 SVG + CSS 实现力导向图，展示生物学概念之间的关联关系
 * 竞品没有此功能，属于 TATABOX 创新特色
 * ============================================================
 */

(function () {
  'use strict';

  /* ============================================================
   * 常量与配置
   * ============================================================ */

  /** 力导向布局参数 */
  var REPULSION = 8000;          // 节点间斥力系数
  var SPRING_LENGTH = 120;       // 弹簧自然长度
  var SPRING_STRENGTH = 0.006;   // 弹簧刚度
  var DAMPING = 0.85;            // 速度衰减系数
  var CENTER_GRAVITY = 0.01;     // 向心力
  var MAX_VELOCITY = 8;          // 最大速度限制
  var STABLE_THRESHOLD = 0.3;    // 稳定判定阈值
  var SETTLE_FRAMES = 180;       // 约 3 秒后停止动画（60fps * 3）

  /** 学科分类配色 */
  var CATEGORY_COLORS = {
    '细胞生物学': { fill: '#5a7bc4', stroke: '#3a5ba4', bg: 'rgba(90,123,196,0.12)', text: '#3a5ba4' },
    '遗传学':     { fill: '#c47a4a', stroke: '#a45a2a', bg: 'rgba(196,122,74,0.12)', text: '#a45a2a' },
    '分子生物学': { fill: '#8a6ac4', stroke: '#6a4aa4', bg: 'rgba(138,106,196,0.12)', text: '#6a4aa4' },
    '生态学':     { fill: '#4a9c6a', stroke: '#2a7c4a', bg: 'rgba(74,156,106,0.12)', text: '#2a7c4a' },
    '动物学':     { fill: '#c45a7a', stroke: '#a43a5a', bg: 'rgba(196,90,122,0.12)', text: '#a43a5a' },
    '植物学':     { fill: '#5aaa5a', stroke: '#3a8a3a', bg: 'rgba(90,170,90,0.12)', text: '#3a8a3a' },
    '生物化学':   { fill: '#c49a4a', stroke: '#a47a2a', bg: 'rgba(196,154,74,0.12)', text: '#a47a2a' },
    '微生物学':   { fill: '#4aaac4', stroke: '#2a8aa4', bg: 'rgba(74,170,196,0.12)', text: '#2a8aa4' },
    '植物生理学': { fill: '#5a9a4a', stroke: '#3a7a2a', bg: 'rgba(90,154,74,0.12)', text: '#3a7a2a' },
    '动物生理学': { fill: '#c45a5a', stroke: '#a43a3a', bg: 'rgba(196,90,90,0.12)', text: '#a43a3a' },
    '演化生物学': { fill: '#9a4ac4', stroke: '#7a2aa4', bg: 'rgba(154,74,196,0.12)', text: '#7a2aa4' },
    '生物信息学': { fill: '#4ac4c4', stroke: '#2aa4a4', bg: 'rgba(74,196,196,0.12)', text: '#2aa4a4' },
    '生物技术':   { fill: '#c4a44a', stroke: '#a4842a', bg: 'rgba(196,164,74,0.12)', text: '#a4842a' }
  };

  /* ============================================================
   * 知识图谱数据：80 个考点节点（13 学科 / 114 条关联边），覆盖 CBO 竞赛大纲
   * 修复 P1-2：数据外移到 data/knowledge-graph.json，运行时异步加载
   * 修复 Issue #10：节点与题库分片 tag 同源（scripts/bio-topic-schema.js）
   * ============================================================ */
  var GRAPH_NODES = [];   // 将由 _loadGraphData() 异步填充
  var GRAPH_EDGES = [];
  var _graphDataLoaded = false;

  /**
   * 异步加载知识图谱数据
   * 若 fetch 失败（如本地 file:// 协议），回退到内联最小数据集避免空白
   */
  function _loadGraphData(callback) {
    if (_graphDataLoaded) { if (callback) callback(); return; }
    fetch('data/knowledge-graph.json?v=20260629a', { cache: 'no-cache' })
      .then(function (resp) { if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.json(); })
      .then(function (data) {
        if (data && data.nodes) GRAPH_NODES = data.nodes;
        if (data && data.edges) GRAPH_EDGES = data.edges;
        _graphDataLoaded = true;
        if (callback) callback();
      })
      .catch(function (err) {
        console.warn('[knowledge-graph] 加载 data/knowledge-graph.json 失败:', err.message, '—— 使用空数据集');
        _graphDataLoaded = true;
        if (callback) callback();
      });
  }

  /* ============================================================
   * 内部状态
   * ============================================================ */
  var _nodes = [];            // 运行时节点（含位置、速度）
  var _edges = [];            // 运行时边
  var _animFrameId = null;    // 动画帧 ID
  var _frameCount = 0;        // 帧计数
  var _isStable = false;      // 布局是否已稳定
  var _dragNode = null;       // 当前拖拽的节点
  var _hoverNode = null;      // 当前悬停的节点
  var _svgWidth = 0;          // SVG 宽度
  var _svgHeight = 0;         // SVG 高度
  var _activeCategories = {}; // 当前激活的分类过滤
  var _searchQuery = '';      // 搜索关键词
  var _tooltipEl = null;      // tooltip DOM 元素
  var _containerEl = null;    // 容器 DOM 元素

  function injectKnowledgeGraphStyles() {
    if (document.getElementById('kg-styles')) return;

    var style = document.createElement('style');
    style.id = 'kg-styles';
    style.textContent = [
      /* 页面容器 */
      '.kg-page {',
      '  max-width: 1200px;',
      '  margin: 0 auto;',
      '  padding: 32px 20px 60px;',
      '}',

      /* 页面标题区 */
      '.kg-header {',
      '  text-align: center;',
      '  margin-bottom: 24px;',
      '}',
      '.kg-title {',
      '  font-family: var(--font-serif, "Noto Serif SC", serif);',
      '  font-size: 2rem;',
      '  font-weight: 700;',
      '  color: var(--color-deep, #1a3a2a);',
      '  margin: 0 0 8px;',
      '}',
      '.kg-subtitle {',
      '  font-size: 0.95rem;',
      '  color: var(--text-muted, #8a8a8a);',
      '  margin: 0;',
      '}',

      /* 工具栏 */
      '.kg-toolbar {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 12px;',
      '  align-items: center;',
      '  margin-bottom: 16px;',
      '  padding: 16px 20px;',
      '  background: var(--surface-primary, #ffffff);',
      '  border: 1px solid var(--border-light, #ece8e1);',
      '  border-radius: var(--radius-md, 8px);',
      '  box-shadow: var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));',
      '}',

      /* 搜索框 */
      '.kg-search {',
      '  flex: 1;',
      '  min-width: 200px;',
      '  position: relative;',
      '}',
      '.kg-search-input {',
      '  width: 100%;',
      '  padding: 10px 14px 10px 36px;',
      '  border: 1.5px solid var(--border-default, #e0dcd5);',
      '  border-radius: var(--radius-sm, 4px);',
      '  background: var(--surface-primary, #ffffff);',
      '  color: var(--text-primary, #1a1a1a);',
      '  font-size: 0.9rem;',
      '  outline: none;',
      '  transition: border-color var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);',
      '}',
      '.kg-search-input:focus {',
      '  border-color: var(--color-sage, #5a7d5c);',
      '  box-shadow: 0 0 0 3px rgba(90,125,92,0.15);',
      '}',
      '.kg-search-input::placeholder {',
      '  color: var(--text-muted, #8a8a8a);',
      '}',
      '.kg-search-icon {',
      '  position: absolute;',
      '  left: 12px;',
      '  top: 50%;',
      '  transform: translateY(-50%);',
      '  color: var(--text-muted, #8a8a8a);',
      '  pointer-events: none;',
      '}',

      /* 分类筛选按钮组 */
      '.kg-filters {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 6px;',
      '}',
      '.kg-filter-btn {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 4px;',
      '  padding: 6px 12px;',
      '  border-radius: var(--radius-full, 9999px);',
      '  font-size: 0.78rem;',
      '  font-weight: 500;',
      '  border: 1.5px solid var(--border-default, #e0dcd5);',
      '  background: var(--surface-primary, #ffffff);',
      '  color: var(--text-secondary, #4a4a4a);',
      '  cursor: pointer;',
      '  transition: all var(--transition-fast, 0.15s ease);',
      '  user-select: none;',
      '  white-space: nowrap;',
      '}',
      '.kg-filter-btn:hover {',
      '  border-color: var(--color-sage, #5a7d5c);',
      '}',
      '.kg-filter-btn.active {',
      '  font-weight: 600;',
      '}',
      '.kg-filter-dot {',
      '  width: 8px;',
      '  height: 8px;',
      '  border-radius: 50%;',
      '  flex-shrink: 0;',
      '}',

      /* 图表容器 */
      '.kg-graph-container {',
      '  position: relative;',
      '  width: 100%;',
      '  height: 600px;',
      '  background: var(--surface-primary, #ffffff);',
      '  border: 1px solid var(--border-light, #ece8e1);',
      '  border-radius: var(--radius-md, 8px);',
      '  box-shadow: var(--shadow-md, 0 2px 8px rgba(44, 62, 48, 0.06));',
      '  overflow: hidden;',
      '}',

      /* SVG 画布 */
      '.kg-svg {',
      '  width: 100%;',
      '  height: 100%;',
      '  cursor: grab;',
      '}',
      '.kg-svg:active {',
      '  cursor: grabbing;',
      '}',

      /* SVG 节点样式 */
      '.kg-node {',
      '  cursor: pointer;',
      '  transition: opacity 0.3s ease;',
      '}',
      '.kg-node.dimmed {',
      '  opacity: 0.15;',
      '}',
      '.kg-node.highlighted {',
      '  opacity: 1;',
      '}',
      '.kg-node-circle {',
      '  stroke-width: 2;',
      '  transition: r 0.3s ease, stroke-width 0.2s ease, filter 0.2s ease;',
      '}',
      '.kg-node:hover .kg-node-circle {',
      '  stroke-width: 3;',
      '  filter: drop-shadow(0 0 6px rgba(0,0,0,0.2));',
      '}',
      '.kg-node-label {',
      '  font-family: var(--font-sans, "Noto Sans SC", sans-serif);',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  fill: var(--text-primary, #1a1a1a);',
      '  text-anchor: middle;',
      '  dominant-baseline: central;',
      '  pointer-events: none;',
      '  user-select: none;',
      '}',

      /* SVG 边样式 */
      '.kg-edge {',
      '  fill: none;',
      '  stroke: var(--border-default, #e0dcd5);',
      '  stroke-width: 1.2;',
      '  transition: opacity 0.3s ease, stroke 0.2s ease;',
      '}',
      '.kg-edge.dimmed {',
      '  opacity: 0.05;',
      '}',
      '.kg-edge.highlighted {',
      '  stroke: var(--color-sage, #5a7d5c);',
      '  stroke-width: 2;',
      '  opacity: 1;',
      '}',
      '.kg-edge-arrow {',
      '  fill: var(--border-default, #e0dcd5);',
      '  transition: opacity 0.3s ease, fill 0.2s ease;',
      '}',
      '.kg-edge-arrow.dimmed {',
      '  opacity: 0.05;',
      '}',
      '.kg-edge-arrow.highlighted {',
      '  fill: var(--color-sage, #5a7d5c);',
      '  opacity: 1;',
      '}',

      /* Tooltip */
      '.kg-tooltip {',
      '  position: absolute;',
      '  z-index: 100;',
      '  max-width: 280px;',
      '  padding: 14px 16px;',
      '  background: var(--color-deep, #1a3a2a);',
      '  color: var(--text-inverse, #ffffff);',
      '  border-radius: var(--radius-sm, 4px);',
      '  box-shadow: var(--shadow-lg, 0 4px 16px rgba(44, 62, 48, 0.07));',
      '  pointer-events: none;',
      '  opacity: 0;',
      '  transform: translateY(4px);',
      '  transition: opacity 0.2s ease, transform 0.2s ease;',
      '  font-size: 0.85rem;',
      '  line-height: 1.5;',
      '}',
      '.kg-tooltip.visible {',
      '  opacity: 1;',
      '  transform: translateY(0);',
      '}',
      '.kg-tooltip-title {',
      '  font-weight: 700;',
      '  font-size: 0.95rem;',
      '  margin-bottom: 4px;',
      '}',
      '.kg-tooltip-category {',
      '  display: inline-block;',
      '  padding: 2px 8px;',
      '  border-radius: 8px;',
      '  font-size: 0.72rem;',
      '  font-weight: 600;',
      '  margin-bottom: 6px;',
      '}',
      '.kg-tooltip-desc {',
      '  color: rgba(255,255,255,0.8);',
      '  margin-bottom: 6px;',
      '}',
      '.kg-tooltip-mastery {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  font-size: 0.78rem;',
      '  color: rgba(255,255,255,0.7);',
      '}',
      '.kg-tooltip-mastery-bar {',
      '  flex: 1;',
      '  height: 4px;',
      '  background: rgba(255,255,255,0.2);',
      '  border-radius: 2px;',
      '  overflow: hidden;',
      '}',
      '.kg-tooltip-mastery-fill {',
      '  height: 100%;',
      '  border-radius: 2px;',
      '  transition: width 0.3s ease;',
      '}',

      /* 图例 */
      '.kg-legend {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 12px;',
      '  justify-content: center;',
      '  margin-top: 16px;',
      '  padding: 12px 16px;',
      '  background: var(--surface-secondary, #faf7f2);',
      '  border-radius: var(--radius-sm, 4px);',
      '}',
      '.kg-legend-item {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  font-size: 0.78rem;',
      '  color: var(--text-secondary, #4a4a4a);',
      '}',
      '.kg-legend-dot {',
      '  width: 10px;',
      '  height: 10px;',
      '  border-radius: 50%;',
      '}',

      /* 提示信息 */
      '.kg-hint {',
      '  text-align: center;',
      '  font-size: 0.82rem;',
      '  color: var(--text-muted, #8a8a8a);',
      '  margin-top: 12px;',
      '}',

      /* 空状态 */
      '.kg-empty {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  height: 100%;',
      '  color: var(--text-muted, #8a8a8a);',
      '  font-size: 0.95rem;',
      '}',

      /* 响应式 */
      '@media (max-width: 768px) {',
      '  .kg-page { padding: 20px 12px 40px; }',
      '  .kg-title { font-size: 1.5rem; }',
      '  .kg-graph-container { height: 450px; }',
      '  .kg-toolbar { flex-direction: column; gap: 8px; }',
      '  .kg-search { min-width: 100%; }',
      '  .kg-filters { justify-content: center; }',
      '  .kg-legend { gap: 8px; }',
      '}',

      /* 深色模式适配 */
      '[data-theme="dark"] .kg-node-label { fill: var(--text-primary, #e8e6e2); }',
      '[data-theme="dark"] .kg-edge { stroke: var(--border-default, #3a403d); }',
      '[data-theme="dark"] .kg-edge-arrow { fill: var(--border-default, #3a403d); }',
      '[data-theme="dark"] .kg-edge.highlighted { stroke: var(--color-sage, #5a7d5c); }',
      '[data-theme="dark"] .kg-edge-arrow.highlighted { fill: var(--color-sage, #5a7d5c); }',

      /* v4.0 节点操作面板 */
      '.kg-action-panel {',
      '  position: fixed;',
      '  z-index: 10000;',
      '  min-width: 280px;',
      '  max-width: 320px;',
      '  padding: 14px 16px;',
      '  background: var(--surface-primary, #ffffff);',
      '  border: 1px solid var(--border-light, #ece8e1);',
      '  border-radius: var(--radius-md, 8px);',
      '  box-shadow: var(--shadow-floating);',
      '  opacity: 0;',
      '  transform: translateY(-6px);',
      '  transition: opacity 0.18s ease, transform 0.18s ease;',
      '  font-family: inherit;',
      '}',
      '.kg-action-panel.visible { opacity: 1; transform: translateY(0); }',
      '.kg-action-header {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  margin-bottom: 8px;',
      '  padding-bottom: 8px;',
      '  border-bottom: 1px solid var(--border-light, #ece8e1);',
      '}',
      '.kg-action-title {',
      '  font-family: var(--font-serif, "Noto Serif SC", serif);',
      '  font-size: 1.05rem;',
      '  font-weight: 700;',
      '  color: var(--color-deep, #1a3a2a);',
      '}',
      '.kg-action-close {',
      '  background: none;',
      '  border: none;',
      '  font-size: 1.4rem;',
      '  line-height: 1;',
      '  color: var(--text-muted, #8a8a8a);',
      '  cursor: pointer;',
      '  padding: 2px 8px;',
      '  border-radius: 4px;',
      '}',
      '.kg-action-close:hover { background: var(--surface-secondary, #f5f3ef); color: var(--color-deep, #1a3a2a); }',
      '.kg-action-desc {',
      '  font-size: 0.82rem;',
      '  line-height: 1.55;',
      '  color: var(--text-secondary, #4a4a4a);',
      '  margin-bottom: 12px;',
      '  max-height: 80px;',
      '  overflow-y: auto;',
      '}',
      '.kg-action-buttons { display: flex; flex-direction: column; gap: 6px; }',
      '.kg-action-btn {',
      '  padding: 8px 12px;',
      '  border: 1px solid var(--border-default, #e0dcd5);',
      '  border-radius: var(--radius-sm, 4px);',
      '  background: var(--surface-primary, #ffffff);',
      '  color: var(--text-primary, #1a1a1a);',
      '  font-size: 0.86rem;',
      '  font-family: inherit;',
      '  cursor: pointer;',
      '  transition: all 0.15s ease;',
      '  text-align: left;',
      '}',
      '.kg-action-btn:hover {',
      '  border-color: var(--color-sage, #5a7d5c);',
      '  background: rgba(90, 125, 92, 0.06);',
      '  transform: translateX(2px);',
      '}',
      '.kg-action-btn.kg-action-primary {',
      '  background: var(--color-sage, #5a7d5c);',
      '  border-color: var(--color-sage, #5a7d5c);',
      '  color: #fff;',
      '}',
      '.kg-action-btn.kg-action-primary:hover {',
      '  background: #4a6d4c;',
      '  color: #fff;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ============================================================
   * 数据读取：从 localStorage 获取掌握度
   * ============================================================ */

  /**
   * 获取指定模块的掌握度（0-100）
   * @param {string} relatedModule - 关联的练习模块 ID
   * @returns {number} 掌握度百分比
   */
  function getMastery(relatedModule) {
    try {
      var statsKey = 'bioquest_stats';
      var raw = localStorage.getItem(statsKey);
      if (!raw) return 0;
      var stats = JSON.parse(raw);
      if (!stats) return 0;
      // 归一化模块名：module1 → module_1（与 server.py / analytic.js 一致）
      var normalized = relatedModule && relatedModule.indexOf('_') === -1
        ? relatedModule.replace(/module(\d)/, 'module_$1')
        : relatedModule;
      // 优先从 stats.modules[normalized] 读取，兼容旧版扁平结构 stats[normalized]
      var mod = (stats.modules && stats.modules[normalized]) || stats[normalized];
      if (!mod || !mod.totalAnswered || mod.totalAnswered === 0) return 0;
      return Math.min(100, Math.round((mod.totalCorrect || 0) / mod.totalAnswered * 100));
    } catch (e) {
      return 0;
    }
  }

  /**
   * 根据掌握度计算节点半径
   * @param {number} mastery - 掌握度 0-100
   * @returns {number} 半径 18-32
   */
  function masteryToRadius(mastery) {
    return 18 + (mastery / 100) * 14;
  }

  function initNodePositions() {
    var cx = _svgWidth / 2;
    var cy = _svgHeight / 2;
    var count = _nodes.length;
    var radius = Math.min(_svgWidth, _svgHeight) * 0.35;

    _nodes.forEach(function (node, i) {
      var angle = (2 * Math.PI * i) / count;
      var jitter = (Math.random() - 0.5) * 40;
      node.x = cx + (radius + jitter) * Math.cos(angle);
      node.y = cy + (radius + jitter) * Math.sin(angle);
      node.vx = 0;
      node.vy = 0;
    });
  }

  /**
   * 执行一步力导向迭代
   */
  function simulateStep() {
    var cx = _svgWidth / 2;
    var cy = _svgHeight / 2;
    var totalKinetic = 0;

    // 节点间斥力
    for (var i = 0; i < _nodes.length; i++) {
      for (var j = i + 1; j < _nodes.length; j++) {
        var ni = _nodes[i];
        var nj = _nodes[j];
        var dx = nj.x - ni.x;
        var dy = nj.y - ni.y;
        var distSq = dx * dx + dy * dy;
        if (distSq < 1) distSq = 1;
        var dist = Math.sqrt(distSq);
        var force = REPULSION / distSq;
        var fx = (dx / dist) * force;
        var fy = (dy / dist) * force;

        if (!_dragNode || _dragNode !== ni) { ni.vx -= fx; ni.vy -= fy; }
        if (!_dragNode || _dragNode !== nj) { nj.vx += fx; nj.vy += fy; }
      }
    }

    // 边的弹簧引力
    for (var e = 0; e < _edges.length; e++) {
      var edge = _edges[e];
      var src = edge._srcNode;
      var tgt = edge._tgtNode;
      if (!src || !tgt) continue;

      var dx = tgt.x - src.x;
      var dy = tgt.y - src.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;
      var displacement = dist - SPRING_LENGTH;
      var force = SPRING_STRENGTH * displacement;
      var fx = (dx / dist) * force;
      var fy = (dy / dist) * force;

      if (!_dragNode || _dragNode !== src) { src.vx += fx; src.vy += fy; }
      if (!_dragNode || _dragNode !== tgt) { tgt.vx -= fx; tgt.vy -= fy; }
    }

    // 向心力 + 速度更新
    for (var k = 0; k < _nodes.length; k++) {
      var node = _nodes[k];
      if (_dragNode && _dragNode === node) continue;

      // 向心力
      node.vx += (cx - node.x) * CENTER_GRAVITY;
      node.vy += (cy - node.y) * CENTER_GRAVITY;

      // 阻尼
      node.vx *= DAMPING;
      node.vy *= DAMPING;

      // 限速
      var speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed > MAX_VELOCITY) {
        node.vx = (node.vx / speed) * MAX_VELOCITY;
        node.vy = (node.vy / speed) * MAX_VELOCITY;
      }

      // 更新位置
      node.x += node.vx;
      node.y += node.vy;

      // 边界约束
      var pad = 40;
      if (node.x < pad) { node.x = pad; node.vx = 0; }
      if (node.x > _svgWidth - pad) { node.x = _svgWidth - pad; node.vx = 0; }
      if (node.y < pad) { node.y = pad; node.vy = 0; }
      if (node.y > _svgHeight - pad) { node.y = _svgHeight - pad; node.vy = 0; }

      totalKinetic += node.vx * node.vx + node.vy * node.vy;
    }

    return totalKinetic;
  }

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (var key in attrs) {
        if (attrs.hasOwnProperty(key)) {
          el.setAttribute(key, attrs[key]);
        }
      }
    }
    return el;
  }

  /**
   * 加载掌握度数据：从 localStorage 读取 BKT 掌握概率
   * 返回 { "概念名": 0.0-1.0, ... } 格式
   */
  function loadMasteryData() {
    try {
      // 优先从 bioquest_skill_mastery 读取 BKT 数据
      var raw = localStorage.getItem('bioquest_skill_mastery');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    try {
      // 后备：从 BKT 引擎读取
      if (typeof window.BioQuestAI !== 'undefined' && typeof window.BioQuestAI.loadHistory === 'function') {
        var history = window.BioQuestAI.loadHistory();
        if (history && history.mastery) return history.mastery;
      }
    } catch (e) {}
    return {};
  }

  /**
   * 构建 SVG 画布及所有元素
   */
  function buildSVG(container) {
    var rect = container.getBoundingClientRect();
    _svgWidth = rect.width || 800;
    _svgHeight = rect.height || 600;

    // 初始化运行时节点
    _nodes = GRAPH_NODES.map(function (n) {
      var mastery = getMastery(n.relatedModule);
      return {
        id: n.id,
        label: n.label,
        category: n.category,
        description: n.description,
        relatedModule: n.relatedModule,
        mastery: mastery,
        radius: masteryToRadius(mastery),
        x: 0, y: 0,
        vx: 0, vy: 0
      };
    });

    // 初始化运行时边（引用节点对象）
    var nodeMap = {};
    _nodes.forEach(function (n) { nodeMap[n.id] = n; });
    _edges = GRAPH_EDGES.map(function (e) {
      return {
        source: e.source,
        target: e.target,
        _srcNode: nodeMap[e.source],
        _tgtNode: nodeMap[e.target]
      };
    }).filter(function (e) {
      return e._srcNode && e._tgtNode;
    });

    // 初始化节点位置
    initNodePositions();

    // 创建 SVG
    var svg = svgEl('svg', {
      'class': 'kg-svg',
      'viewBox': '0 0 ' + _svgWidth + ' ' + _svgHeight,
      'preserveAspectRatio': 'xMidYMid meet'
    });

    // 定义箭头标记
    var defs = svgEl('defs');
    var marker = svgEl('marker', {
      'id': 'kg-arrowhead',
      'viewBox': '0 0 10 10',
      'refX': '10',
      'refY': '5',
      'markerWidth': '6',
      'markerHeight': '6',
      'orient': 'auto-start-reverse'
    });
    var arrowPath = svgEl('path', {
      'd': 'M 0 0 L 10 5 L 0 10 z',
      'class': 'kg-edge-arrow'
    });
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    // 边组
    var edgeGroup = svgEl('g', { 'class': 'kg-edges' });
    _edges.forEach(function (edge, i) {
      var line = svgEl('line', {
        'class': 'kg-edge',
        'data-source': edge.source,
        'data-target': edge.target,
        'marker-end': 'url(#kg-arrowhead)'
      });
      edge._el = line;
      edgeGroup.appendChild(line);
    });
    svg.appendChild(edgeGroup);

    // 节点组
    var nodeGroup = svgEl('g', { 'class': 'kg-nodes' });

    // 加载掌握度数据
    var mastery = loadMasteryData();

    _nodes.forEach(function (node) {
      var g = svgEl('g', {
        'class': 'kg-node',
        'data-id': node.id
      });

      var colors = CATEGORY_COLORS[node.category] || { fill: '#888', stroke: '#666' };

      // 根据掌握度调整节点颜色和大小
      var nodeMastery = mastery[node.label] || null;
      var adjustedRadius = node.radius;
      var adjustedFill = colors.fill;
      var adjustedStroke = colors.stroke;

      if (nodeMastery !== null) {
        // 3 级掌握度颜色：绿色(>0.8) / 黄色(0.5-0.8) / 红色(<0.5)
        if (nodeMastery > 0.8) {
          adjustedFill = '#3a8c5c';
          adjustedStroke = '#2a6c4c';
          adjustedRadius = node.radius * 1.15;
        } else if (nodeMastery > 0.5) {
          adjustedFill = '#c4956a';
          adjustedStroke = '#a4754a';
          adjustedRadius = node.radius * 1.0;
        } else {
          adjustedFill = '#c0553a';
          adjustedStroke = '#a0352a';
          adjustedRadius = node.radius * 0.85;
        }
        // 存储掌握度以便 tooltip 使用
        node.mastery = Math.round(nodeMastery * 100);
      } else {
        node.mastery = null;
      }

      var circle = svgEl('circle', {
        'class': 'kg-node-circle',
        'r': adjustedRadius,
        'fill': adjustedFill,
        'stroke': adjustedStroke
      });
      node._circleEl = circle;

      var label = svgEl('text', {
        'class': 'kg-node-label',
        'dy': '0.35em'
      });
      label.textContent = node.label;
      node._labelEl = label;

      g.appendChild(circle);
      g.appendChild(label);
      node._el = g;
      nodeGroup.appendChild(g);
    });
    svg.appendChild(nodeGroup);

    container.appendChild(svg);

    return svg;
  }

  /**
   * 更新 SVG 中节点和边的位置
   */
  function updatePositions() {
    _nodes.forEach(function (node) {
      if (node._el) {
        node._el.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
      }
    });

    _edges.forEach(function (edge) {
      if (!edge._el || !edge._srcNode || !edge._tgtNode) return;
      var src = edge._srcNode;
      var tgt = edge._tgtNode;

      // 计算从源节点边缘到目标节点边缘的线段
      var dx = tgt.x - src.x;
      var dy = tgt.y - src.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;

      var srcR = src.radius + 2;
      var tgtR = tgt.radius + 8; // 为箭头留空间

      var x1 = src.x + (dx / dist) * srcR;
      var y1 = src.y + (dy / dist) * srcR;
      var x2 = tgt.x - (dx / dist) * tgtR;
      var y2 = tgt.y - (dy / dist) * tgtR;

      edge._el.setAttribute('x1', x1);
      edge._el.setAttribute('y1', y1);
      edge._el.setAttribute('x2', x2);
      edge._el.setAttribute('y2', y2);
    });
  }

  /* ============================================================
   * 动画循环
   * ============================================================ */

  function startAnimation() {
    _frameCount = 0;
    _isStable = false;

    function tick() {
      _frameCount++;
      var kinetic = simulateStep();
      updatePositions();

      // 判断是否稳定
      if (!_isStable && (_frameCount > SETTLE_FRAMES || kinetic < STABLE_THRESHOLD)) {
        _isStable = true;
      }

      // 完全稳定且无拖拽时停止动画循环
      if (_isStable && !_dragNode && kinetic < STABLE_THRESHOLD) {
        _animFrameId = null;
        return;
      }

      // 稳定后降低帧率以节省性能，但拖拽时仍需实时更新
      if (_isStable && !_dragNode) {
        _animFrameId = requestAnimationFrame(function () {
          _animFrameId = requestAnimationFrame(tick);
        });
      } else {
        _animFrameId = requestAnimationFrame(tick);
      }
    }

    _animFrameId = requestAnimationFrame(tick);
  }

  function stopAnimation() {
    if (_animFrameId) {
      cancelAnimationFrame(_animFrameId);
      _animFrameId = null;
    }
  }

  /* ============================================================
   * 交互：拖拽、悬停、点击
   * ============================================================ */

  function bindInteractions(svg, container) {
    var svgEl = svg;

    // —— 拖拽 ——
    function getNodeFromEvent(e) {
      var target = e.target;
      while (target && target !== svgEl) {
        if (target.classList && target.classList.contains('kg-node')) {
          return target.getAttribute('data-id');
        }
        target = target.parentNode;
      }
      return null;
    }

    function onPointerDown(e) {
      var nodeId = getNodeFromEvent(e);
      if (!nodeId) return;
      var node = _nodes.find(function (n) { return n.id === nodeId; });
      if (!node) return;

      _dragNode = node;
      _isStable = false; // 拖拽时重新激活动画

      // 捕获指针
      if (e.target.setPointerCapture) {
        e.target.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!_dragNode) return;

      var rect = svgEl.getBoundingClientRect();
      var scaleX = _svgWidth / rect.width;
      var scaleY = _svgHeight / rect.height;
      var mx = (e.clientX - rect.left) * scaleX;
      var my = (e.clientY - rect.top) * scaleY;

      _dragNode.x = mx;
      _dragNode.y = my;
      _dragNode.vx = 0;
      _dragNode.vy = 0;

      updatePositions();
      e.preventDefault();
    }

    function onPointerUp(e) {
      if (_dragNode) {
        _dragNode.vx = 0;
        _dragNode.vy = 0;
        _dragNode = null;
      }
    }

    svgEl.addEventListener('pointerdown', onPointerDown);
    svgEl.addEventListener('pointermove', onPointerMove);
    svgEl.addEventListener('pointerup', onPointerUp);
    svgEl.addEventListener('pointerleave', onPointerUp);

    // —— 悬停 Tooltip ——
    svgEl.addEventListener('pointerover', function (e) {
      var nodeId = getNodeFromEvent(e);
      if (!nodeId) return;
      var node = _nodes.find(function (n) { return n.id === nodeId; });
      if (!node) return;

      _hoverNode = node;
      showTooltip(node, e, container);
      highlightNode(node);
    });

    svgEl.addEventListener('pointerout', function (e) {
      if (_hoverNode) {
        hideTooltip();
        unhighlightNode();
        _hoverNode = null;
      }
    });

    // —— 点击：弹出节点操作面板 ——
    svgEl.addEventListener('click', function (e) {
      var nodeId = getNodeFromEvent(e);
      if (!nodeId) return;
      var node = _nodes.find(function (n) { return n.id === nodeId; });
      if (!node) return;
      showNodeActionPanel(node, e, container);
    });
  }

  /**
   * v4.0：节点点击操作面板（替代直接跳转 /practice）
   * 提供四个动作：开始练习 / 生成 v4 课堂 / 生成 v3 课堂 / 加入错题复习
   */
  function showNodeActionPanel(node, event, container) {
    // 移除已存在的面板
    var existing = document.getElementById('kg-action-panel');
    if (existing) existing.remove();

    // 将节点信息写入 sessionStorage，供练习模块读取并做专项过滤
    try {
      sessionStorage.setItem('bioquest_kg_practice', JSON.stringify({
        nodeId: node.id,
        label: node.label,
        category: node.category,
        module: node.relatedModule,
        concept: node.label
      }));
    } catch (e) {}

    var panel = document.createElement('div');
    panel.id = 'kg-action-panel';
    panel.className = 'kg-action-panel';
    panel.innerHTML = [
      '<div class="kg-action-header">',
      '  <span class="kg-action-title">' + escapeHtml(node.label) + '</span>',
      '  <button class="kg-action-close" aria-label="关闭">×</button>',
      '</div>',
      '<div class="kg-action-desc">' + escapeHtml(node.description || '（暂无描述）') + '</div>',
      '<div class="kg-action-buttons">',
      '  <button class="kg-action-btn kg-action-primary" data-action="practice">开始练习</button>',
      '  <button class="kg-action-btn" data-action="classroom-v4">生成 AI 课堂 v4</button>',
      '  <button class="kg-action-btn" data-action="classroom-v3">生成 AI 课堂 v3</button>',
      '  <button class="kg-action-btn" data-action="wrongbook">加入错题复习</button>',
      '</div>'
    ].join('');

    document.body.appendChild(panel);

    // 定位（基于点击位置）
    var x = event.clientX + 12;
    var y = event.clientY - 10;
    var panelRect = panel.getBoundingClientRect();
    if (x + panelRect.width > window.innerWidth - 16) x = window.innerWidth - panelRect.width - 16;
    if (y + panelRect.height > window.innerHeight - 16) y = window.innerHeight - panelRect.height - 16;
    if (y < 16) y = 16;
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.classList.add('visible');

    // 关闭按钮
    panel.querySelector('.kg-action-close').addEventListener('click', function () { panel.remove(); });

    // 点击面板外部关闭
    setTimeout(function () {
      var outsideClickHandler = function (ev) {
        if (!panel.contains(ev.target)) {
          panel.remove();
          document.removeEventListener('click', outsideClickHandler);
        }
      };
      document.addEventListener('click', outsideClickHandler);
    }, 50);

    // 按钮事件
    panel.querySelectorAll('.kg-action-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-action');
        panel.remove();
        if (action === 'practice') {
          var practiceHash = '#/practice?concept=' + encodeURIComponent(node.label);
          if (node.category) practiceHash += '&category=' + encodeURIComponent(node.category);
          if (node.relatedModule) practiceHash += '&module=' + encodeURIComponent(node.relatedModule);
          window.location.hash = practiceHash;
        } else if (action === 'classroom-v4') {
          if (window.ClassroomPlayer && window.Classroom && window.Classroom.generateOutlineV4) {
            window.ClassroomPlayer.open({ topic: node.label, kgNodeId: node.id, sourceType: 'kg-node', mode: 'v4' });
          } else {
            alert('v4.0 课堂模块未加载，请刷新页面重试');
          }
        } else if (action === 'classroom-v3') {
          if (window.ClassroomPlayer) {
            window.ClassroomPlayer.open({ topic: node.label, kgNodeId: node.id, sourceType: 'kg-node' });
          } else {
            alert('课堂模块未加载，请刷新页面重试');
          }
        } else if (action === 'wrongbook') {
          // 把节点标记为待复习，跳转到错题本
          try {
            var list = JSON.parse(localStorage.getItem('bioquest_wrongbook_concepts') || '[]');
            if (!list.some(function (c) { return c.label === node.label; })) {
              list.push({ label: node.label, nodeId: node.id, addedAt: Date.now() });
              localStorage.setItem('bioquest_wrongbook_concepts', JSON.stringify(list));
            }
          } catch (err) {}
          window.location.hash = '#/wrongbook';
        }
      });
    });
  }

  /* ============================================================
   * Tooltip 显示/隐藏
   * ============================================================ */

  function showTooltip(node, event, container) {
    if (!_tooltipEl) return;

    var colors = CATEGORY_COLORS[node.category] || { fill: '#888', bg: 'rgba(136,136,136,0.12)', text: '#666' };
    var masteryDisplay = '';
    if (node.mastery !== null && node.mastery !== undefined) {
      var masteryColor = node.mastery >= 70 ? 'var(--color-success, #3a8c5c)' :
                         node.mastery >= 40 ? 'var(--color-warning, #e8a830)' :
                         'var(--color-error, #c0553a)';
      masteryDisplay = '<div class="kg-tooltip-mastery">' +
        '<span>掌握度 ' + node.mastery + '%</span>' +
        '<div class="kg-tooltip-mastery-bar">' +
          '<div class="kg-tooltip-mastery-fill" style="width:' + node.mastery + '%;background:' + masteryColor + '"></div>' +
        '</div>' +
      '</div>';
    } else {
      masteryDisplay = '<div class="kg-tooltip-mastery" style="color:var(--text-muted,#8a8a8a);font-size:0.78rem;">暂无练习数据</div>';
    }

    _tooltipEl.innerHTML =
      '<div class="kg-tooltip-title">' + escapeHtml(node.label) + '</div>' +
      '<span class="kg-tooltip-category" style="background:' + colors.bg + ';color:' + colors.text + '">' + escapeHtml(node.category) + '</span>' +
      '<div class="kg-tooltip-desc">' + escapeHtml(node.description) + '</div>' +
      masteryDisplay;

    // 定位
    var rect = container.getBoundingClientRect();
    var x = event.clientX - rect.left + 16;
    var y = event.clientY - rect.top - 10;

    // 防止溢出右侧
    if (x + 280 > rect.width) x = event.clientX - rect.left - 296;
    // 防止溢出底部
    if (y + 160 > rect.height) y = rect.height - 170;

    _tooltipEl.style.left = x + 'px';
    _tooltipEl.style.top = y + 'px';
    _tooltipEl.classList.add('visible');
  }

  function hideTooltip() {
    if (_tooltipEl) {
      _tooltipEl.classList.remove('visible');
    }
  }

  /* ============================================================
   * 节点高亮（悬停时高亮关联节点和边）
   * ============================================================ */

  function highlightNode(node) {
    var connectedIds = {};
    connectedIds[node.id] = true;

    _edges.forEach(function (edge) {
      if (edge.source === node.id || edge.target === node.id) {
        connectedIds[edge.source] = true;
        connectedIds[edge.target] = true;
      }
    });

    _nodes.forEach(function (n) {
      if (connectedIds[n.id]) {
        n._el.classList.remove('dimmed');
        n._el.classList.add('highlighted');
      } else {
        n._el.classList.add('dimmed');
        n._el.classList.remove('highlighted');
      }
    });

    _edges.forEach(function (edge) {
      var isConn = edge.source === node.id || edge.target === node.id;
      if (isConn) {
        edge._el.classList.remove('dimmed');
        edge._el.classList.add('highlighted');
      } else {
        edge._el.classList.add('dimmed');
        edge._el.classList.remove('highlighted');
      }
    });
  }

  function unhighlightNode() {
    _nodes.forEach(function (n) {
      n._el.classList.remove('dimmed', 'highlighted');
    });
    _edges.forEach(function (edge) {
      edge._el.classList.remove('dimmed', 'highlighted');
    });
  }

  function applyFilters() {
    var query = _searchQuery.toLowerCase().trim();
    var hasCategoryFilter = Object.keys(_activeCategories).length > 0;

    _nodes.forEach(function (node) {
      var matchSearch = !query ||
        node.label.toLowerCase().indexOf(query) >= 0 ||
        node.description.toLowerCase().indexOf(query) >= 0 ||
        node.category.toLowerCase().indexOf(query) >= 0;

      var matchCategory = !hasCategoryFilter || _activeCategories[node.category];

      var visible = matchSearch && matchCategory;
      node._visible = visible;

      if (visible) {
        node._el.style.display = '';
        node._el.classList.remove('dimmed');
      } else {
        node._el.style.display = 'none';
        node._el.classList.remove('highlighted');
      }
    });

    // 更新边的可见性
    _edges.forEach(function (edge) {
      var srcVisible = edge._srcNode && edge._srcNode._visible !== false;
      var tgtVisible = edge._tgtNode && edge._tgtNode._visible !== false;
      var visible = srcVisible && tgtVisible;

      if (visible) {
        edge._el.style.display = '';
        edge._el.classList.remove('dimmed', 'highlighted');
      } else {
        edge._el.style.display = 'none';
      }
    });
  }

  /**
   * 绑定搜索框事件
   */
  function bindSearch(inputEl) {
    var debounceTimer = null;
    inputEl.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        _searchQuery = inputEl.value;
        applyFilters();
      }, 200);
    });
  }

  /**
   * 绑定分类筛选按钮事件
   */
  function bindFilters() {
    var filterBtns = _containerEl.querySelectorAll('.kg-filter-btn');
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.getAttribute('data-category');
        if (!cat) return;

        if (_activeCategories[cat]) {
          delete _activeCategories[cat];
          btn.classList.remove('active');
        } else {
          _activeCategories[cat] = true;
          btn.classList.add('active');
        }

        applyFilters();
      });
    });
  }

  /* ============================================================
   * HTML 转义
   * ============================================================ */
  var escapeHtml = window.escapeHtml;

  /* ============================================================
   * 窗口大小变化处理
   * ============================================================ */

  function handleResize() {
    if (!_containerEl) return;
    var graphContainer = _containerEl.querySelector('.kg-graph-container');
    if (!graphContainer) return;

    var rect = graphContainer.getBoundingClientRect();
    var newW = rect.width || 800;
    var newH = rect.height || 600;

    if (Math.abs(newW - _svgWidth) > 10 || Math.abs(newH - _svgHeight) > 10) {
      // 计算缩放比例
      var scaleX = newW / _svgWidth;
      var scaleY = newH / _svgHeight;

      _svgWidth = newW;
      _svgHeight = newH;

      // 重新定位节点
      _nodes.forEach(function (node) {
        node.x *= scaleX;
        node.y *= scaleY;
      });

      // 更新 SVG viewBox
      var svg = graphContainer.querySelector('.kg-svg');
      if (svg) {
        svg.setAttribute('viewBox', '0 0 ' + _svgWidth + ' ' + _svgHeight);
      }

      updatePositions();
    }
  }

  /* ============================================================
   * 构建页面 HTML
   * ============================================================ */

  function buildPageHTML() {
    // 统计各分类数量
    var catCounts = {};
    GRAPH_NODES.forEach(function (n) {
      catCounts[n.category] = (catCounts[n.category] || 0) + 1;
    });

    // 分类筛选按钮
    var filterBtns = '';
    var categories = Object.keys(CATEGORY_COLORS);
    categories.forEach(function (cat) {
      var colors = CATEGORY_COLORS[cat];
      var count = catCounts[cat] || 0;
      filterBtns += '<button class="kg-filter-btn" data-category="' + escapeHtml(cat) + '">' +
        '<span class="kg-filter-dot" style="background:' + colors.fill + '"></span>' +
        escapeHtml(cat) + ' (' + count + ')' +
        '</button>';
    });

    // 图例
    var legendItems = '';
    categories.forEach(function (cat) {
      var colors = CATEGORY_COLORS[cat];
      legendItems += '<span class="kg-legend-item">' +
        '<span class="kg-legend-dot" style="background:' + colors.fill + '"></span>' +
        escapeHtml(cat) +
        '</span>';
    });

    return '<div class="kg-page">' +
      '<div class="kg-header">' +
        '<h2 class="kg-title">生物学知识图谱</h2>' +
        '<p class="kg-subtitle">交互式概念关系图 — 拖拽节点、悬停查看详情、点击跳转练习</p>' +
      '</div>' +

      '<div class="kg-toolbar">' +
        '<div class="kg-search">' +
          '<svg class="kg-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
          '</svg>' +
          '<input type="text" class="kg-search-input" id="kg-search-input" placeholder="搜索概念，如：光合作用、DNA、遗传..." autocomplete="off" />' +
        '</div>' +
        '<div class="kg-filters">' + filterBtns + '</div>' +
      '</div>' +

      '<div class="kg-graph-container" id="kg-graph-container"></div>' +

      '<div class="kg-legend">' + legendItems + '</div>' +
      '<div class="kg-legend" style="margin-top:8px;">' +
        '<span class="kg-legend-item"><span class="kg-legend-dot" style="background:#3a8c5c;"></span>已掌握</span>' +
        '<span class="kg-legend-item"><span class="kg-legend-dot" style="background:#c4956a;"></span>初步掌握</span>' +
        '<span class="kg-legend-item"><span class="kg-legend-dot" style="background:#c0553a;"></span>薄弱</span>' +
        '<span class="kg-legend-item"><span class="kg-legend-dot" style="background:#4a4a4a;"></span>未练习</span>' +
      '</div>' +
      '<p class="kg-hint">节点颜色反映掌握程度（绿=已掌握 / 黄=初步掌握 / 红=薄弱） · 节点大小反映联系强度 · 连线表示知识依赖关系 · 点击节点跳转练习</p>' +
    '</div>';
  }

  /* ============================================================
   * 公开 API
   * ============================================================ */

  /**
   * 初始化知识图谱（挂载到指定容器）
   * 修复：先异步加载数据再渲染，避免 GRAPH_NODES 为空时画布空白
   * @param {HTMLElement} target - 目标容器元素
   */
  function initKnowledgeGraph(target) {
    if (!target) {
      console.warn('[KnowledgeGraph] 未提供目标容器');
      return;
    }

    // 注入样式
    injectKnowledgeGraphStyles();

    // 先异步加载数据，加载完成后再渲染图谱
    if (!_graphDataLoaded) {
      target.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary,#6b7f74);">正在加载知识图谱数据...</div>';
      _loadGraphData(function () {
        // 数据加载完成（无论成功失败）后重新进入渲染
        if (GRAPH_NODES.length === 0) {
          target.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary,#6b7f74);">知识图谱数据加载失败<br><span style="font-size:0.85rem;">请检查 data/knowledge-graph.json 是否存在</span></div>';
          return;
        }
        _renderKnowledgeGraphContent(target);
      });
      return;
    }

    // 数据已加载，直接渲染
    _renderKnowledgeGraphContent(target);
  }

  /**
   * 实际渲染知识图谱内容（数据已加载完毕后调用）
   */
  function _renderKnowledgeGraphContent(target) {
    if (!target) return;
    // 停止之前的动画
    stopAnimation();

    // v4.0 四向联动：读取其他模块传递的 focus 概念，自动定位/高亮节点
    var focusConcept = null;
    try {
      focusConcept = sessionStorage.getItem('bioquest_kg_focus');
      if (focusConcept) sessionStorage.removeItem('bioquest_kg_focus');
    } catch (e) {}

    // 断开之前的 ResizeObserver，避免内存泄漏
    if (_containerEl && _containerEl._resizeObserver) {
      _containerEl._resizeObserver.disconnect();
      delete _containerEl._resizeObserver;
    }

    // 重置状态
    _activeCategories = {};
    _searchQuery = '';
    _dragNode = null;
    _hoverNode = null;
    _containerEl = target;

    // 渲染页面 HTML
    target.innerHTML = buildPageHTML();

    // 获取图表容器
    var graphContainer = document.getElementById('kg-graph-container');
    if (!graphContainer) {
      console.warn('[KnowledgeGraph] 找不到图表容器');
      return;
    }

    // 创建 Tooltip
    _tooltipEl = document.createElement('div');
    _tooltipEl.className = 'kg-tooltip';
    graphContainer.appendChild(_tooltipEl);

    // 构建 SVG
    var svg = buildSVG(graphContainer);

    // 绑定交互
    bindInteractions(svg, graphContainer);

    // 绑定搜索
    var searchInput = document.getElementById('kg-search-input');
    if (searchInput) {
      bindSearch(searchInput);
    }

    // 绑定分类筛选
    bindFilters();

    // 启动动画
    startAnimation();

    // 监听窗口大小变化
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        handleResize();
      });
      ro.observe(graphContainer);
      _containerEl._resizeObserver = ro;
    } else {
      window.addEventListener('resize', handleResize);
    }

    // v4.0 四向联动：自动定位/高亮来自其他模块的概念
    if (focusConcept) {
      try {
        var matched = _nodes.find(function (n) {
          return n && (n.label === focusConcept || n.id === focusConcept ||
            (n.subject && n.subject === focusConcept));
        });
        if (matched) {
          highlightNode(matched);

        }
      } catch (e) {
        console.warn('[KnowledgeGraph] focus 失败:', e && e.message);
      }
    }
  }

  /**
   * 渲染知识图谱页面（作为独立路由页面）
   * 修复 P1-2：先异步加载数据，再初始化
   * @param {HTMLElement} target - 页面内容容器
   */
  function renderKnowledgeGraphPage(target) {
    if (!target) {
      target = document.getElementById('page-content');
    }
    if (!target) {
      console.warn('[KnowledgeGraph] 找不到页面容器');
      return;
    }

    // 显示加载中状态
    target.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary,#6b7f74);">正在加载知识图谱数据...</div>';

    _loadGraphData(function () {
      if (GRAPH_NODES.length === 0) {
        target.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary,#6b7f74);">知识图谱数据加载失败<br><span style="font-size:0.85rem;">请检查 data/knowledge-graph.json 是否存在</span></div>';
        return;
      }
      initKnowledgeGraph(target);
    });
  }

  /* ============================================================
   * 暴露到全局
   * ============================================================ */
  window.initKnowledgeGraph = initKnowledgeGraph;
  window.renderKnowledgeGraphPage = renderKnowledgeGraphPage;
  window.injectKnowledgeGraphStyles = injectKnowledgeGraphStyles;

  // v3.1: 课堂动作控制接口（T1-5）— 供 EventBus 调用
  window.KnowledgeGraphController = {
    /**
     * 按 id 点亮节点（接受单个 id 或 id 数组）
     */
    highlightNodeById: function (nodeId) {
      if (!nodeId) return false;
      var ids = Array.isArray(nodeId) ? nodeId : [nodeId];
      var found = false;
      ids.forEach(function (id) {
        var node = _nodes.find(function (n) { return n.id === id; });
        if (node) { highlightNode(node); found = true; }
      });
      return found;
    },
    /**
     * 按标签文字模糊匹配点亮
     */
    highlightNodeByLabel: function (label) {
      if (!label) return false;
      var node = _nodes.find(function (n) { return n.label.indexOf(label) >= 0 || label.indexOf(n.label) >= 0; });
      if (node) { highlightNode(node); return true; }
      return false;
    }
  };

})();
