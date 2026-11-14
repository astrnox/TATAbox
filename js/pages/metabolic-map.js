/**
 * ============================================================
 * TATABOX — 代谢网络专题（知识图谱子视图）
 * 以本站自绘的 SVG 通路总图为底图（细胞质 / 线粒体 / 内质网分区），
 * 标注主干代谢物、限速酶与辅因子；叠加通路热点与相关考点，
 * 支持拖拽平移、滚轮/按钮缩放，点击热点或考点进入对应练习。
 * ============================================================
 */
(function () {
  'use strict';

  var VIEW_W = 1600;
  var VIEW_H = 1100;

  /** 图上的主干通路热点（百分比坐标，相对画布） */
  var HOTSPOTS = [
    {
      key: 'glycolysis', label: '糖酵解与磷酸戊糖途径', tag: 'glycolysis',
      left: 2, top: 6.55, width: 28.75, height: 45.27,
      desc: '葡萄糖在细胞质经己糖激酶、PFK-1（限速）、丙酮酸激酶三步不可逆反应生成 2 丙酮酸，净得 2 ATP 与 2 NADH；G6P 分支的磷酸戊糖途径产生 NADPH 与核糖-5-磷酸。'
    },
    {
      key: 'tca', label: '三羧酸循环', tag: 'krebs_cycle',
      left: 32.75, top: 6.55, width: 24.5, height: 45.27,
      desc: '乙酰 CoA 与草酰乙酸缩合为柠檬酸，经异柠檬酸、α-酮戊二酸、琥珀酰 CoA、琥珀酸、延胡索酸、苹果酸回到草酰乙酸；异柠檬酸脱氢酶为限速酶，每轮产生 3 NADH、1 FADH₂、1 GTP，释放 2 CO₂。'
    },
    {
      key: 'oxphos', label: '氧化磷酸化（呼吸链）', tag: 'oxidative_phos',
      left: 32.75, top: 54.18, width: 24.5, height: 41.45,
      desc: '复合体 I、III、IV 将电子传给 O₂ 并泵出 H⁺，形成跨内膜质子梯度；ATP 合酶（复合体 V）借 H⁺ 回流合成 ATP。NADH 经复合体 I 进入，约产 2.5 ATP；FADH₂ 经复合体 II 进入，约产 1.5 ATP。'
    },
    {
      key: 'lipid', label: '脂类代谢（合成与 β 氧化）', tag: 'lipid_metab',
      left: 59.25, top: 6.55, width: 38.75, height: 45.27,
      desc: '脂肪酶水解释放脂肪酸，经脂酰 CoA 活化与肉碱穿梭进入线粒体基质；β 氧化每轮脱氢、水化、再脱氢、硫解，切下 1 乙酰 CoA 并生成 1 FADH₂ 与 1 NADH。脂肪酸合成在细胞质由 ACC（限速）与 FAS 完成，消耗 NADPH。'
    },
    {
      key: 'chol', label: '胆固醇与酮体', tag: 'lipid_metab',
      left: 59.25, top: 54.18, width: 38.75, height: 41.45,
      desc: '胆固醇以乙酰 CoA 为原料，经 HMG-CoA、甲羟戊酸（MVA）途径在内质网合成，HMG-CoA 还原酶为限速酶；18 乙酰 CoA、36 ATP、16 NADPH 合成 1 分子胆固醇。酮体在肝线粒体生成，供肝外组织利用。'
    },
    {
      key: 'aa', label: '氨基酸代谢与尿素循环', tag: 'amino_acid_metab',
      left: 2, top: 54.18, width: 28.75, height: 41.45,
      desc: '氨基酸经转氨酶（ALT/AST）把氨基交给 α-酮戊二酸生成谷氨酸，再由谷氨酸脱氢酶释放 NH₄⁺，α-酮酸进入 TCA。尿素循环在肝线粒体与细胞质协作完成，CPS-1 为限速酶，尿素的两个氮分别来自 NH₄⁺ 与天冬氨酸。'
    }
  ];

  /** 相关考点（含图外的光合、微生物代谢），点击即按 tag 进入练习 */
  var TOPICS = [
    { tag: 'enzyme', label: '酶学与酶动力学', subject: '生物化学' },
    { tag: 'bioenergetics', label: '生物能量学', subject: '生物化学' },
    { tag: 'glycolysis', label: '糖酵解与糖代谢', subject: '生物化学' },
    { tag: 'krebs_cycle', label: '三羧酸循环', subject: '生物化学' },
    { tag: 'oxidative_phos', label: '氧化磷酸化', subject: '生物化学' },
    { tag: 'lipid_metab', label: '脂类代谢', subject: '生物化学' },
    { tag: 'amino_acid_metab', label: '氨基酸与蛋白质代谢', subject: '生物化学' },
    { tag: 'photosynthesis', label: '光合作用', subject: '植物生理学' },
    { tag: 'photorespiration_c4', label: '光呼吸与 C4 途径', subject: '植物生理学' },
    { tag: 'plant_respiration', label: '植物呼吸作用', subject: '植物生理学' },
    { tag: 'microbial_metabolism', label: '微生物代谢与培养', subject: '微生物学' }
  ];

  var _counts = {};        // tag -> 题量
  var _topicsTotal = 0;    // 代谢题池总量
  var _selectedKey = 'glycolysis';
  var _scale = 1;
  var _tx = 0;
  var _ty = 0;
  var _stageEl = null;
  var _canvasEl = null;
  var _dragging = false;
  var _dragStart = null;

  function esc(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * 写入视图 HTML。
   * 全部标记由本文件静态拼接、不含任何用户输入，故用 DOMParser 解析后搬入节点，
   * 既避免 HTML 注入棘轮（不新增 innerHTML），也保留 SVG 的 marker 等属性。
   */
  function mountHTML(el, html) {
    if (!el) return;
    var doc = new DOMParser().parseFromString(html, 'text/html');
    el.textContent = '';
    var frag = document.createDocumentFragment();
    while (doc.body.firstChild) frag.appendChild(doc.body.firstChild);
    el.appendChild(frag);
  }

  function goPractice(tags) {
    if (!tags || !tags.length) return;
    window.location.hash = '#/practice?tags=' + encodeURIComponent(tags.join(','));
  }

  /* ============================================================
   * 样式
   * ============================================================ */
  function injectStyles() {
    if (document.getElementById('mm-styles')) return;
    var style = document.createElement('style');
    style.id = 'mm-styles';
    style.textContent = [
      '.mm-page { max-width: 1200px; margin: 0 auto; padding: 8px 0 40px; }',
      '.mm-head { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; justify-content: space-between; margin-bottom: 14px; }',
      '.mm-title { font-family: var(--font-serif, serif); font-size: 1.45rem; font-weight: 700; color: var(--color-deep); margin: 0 0 4px; }',
      '.mm-sub { margin: 0; font-size: 0.88rem; color: var(--text-muted); }',
      '.mm-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }',
      '.mm-zoom { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-surface); padding: 2px; }',
      '.mm-zoom button { width: 30px; height: 30px; border: 0; background: transparent; font-size: 1rem; cursor: pointer; color: var(--text-primary); border-radius: 6px; }',
      '.mm-zoom button:hover { background: var(--bg-sunken); }',
      '.mm-zoom span { min-width: 44px; text-align: center; font-size: 0.78rem; color: var(--text-secondary); }',
      '.mm-btn { border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); border-radius: 8px; padding: 7px 12px; font-size: 0.82rem; cursor: pointer; }',
      '.mm-btn:hover { background: var(--bg-sunken); }',
      '.mm-btn-primary { background: var(--color-primary); border-color: var(--color-primary); color: white; font-weight: 600; }',
      '.mm-btn-primary:hover { filter: brightness(1.06); }',
      '.mm-body { display: grid; grid-template-columns: minmax(0, 1fr) 264px; gap: 16px; align-items: start; }',
      '.mm-stage { position: relative; overflow: hidden; border: 1px solid var(--border-subtle); border-radius: 12px; background: var(--bg-sunken); cursor: grab; touch-action: none; }',
      '.mm-stage.dragging { cursor: grabbing; }',
      '.mm-canvas { position: relative; transform-origin: 0 0; }',
      '.mm-canvas svg { display: block; width: 100%; height: auto; user-select: none; }',
      '.mm-svg { font-family: var(--font-sans, system-ui, sans-serif); background: var(--bg-sunken); }',
      '.mm-svg .mm-pane { fill: var(--bg-surface); stroke: var(--border-subtle); stroke-width: 1.5; }',
      '.mm-svg .mm-pane-title { fill: var(--text-primary); font-size: 18px; font-weight: 600; letter-spacing: 0.01em; }',
      '.mm-svg .mm-pane-sub { fill: var(--text-tertiary); font-size: 11.5px; }',
      '.mm-svg .mm-group { fill: var(--text-secondary); font-size: 12px; font-weight: 700; }',
      '.mm-svg .mm-node { fill: var(--bg-page); stroke: var(--border-subtle); stroke-width: 1.2; }',
      '.mm-svg .mm-node-text { fill: var(--text-primary); font-size: 12.5px; }',
      '.mm-svg .mm-enzyme { fill: var(--text-tertiary); font-size: 9.5px; }',
      '.mm-svg .mm-cof { fill: var(--color-amber); font-size: 9.5px; font-weight: 600; }',
      '.mm-svg .mm-note-box { fill: none; stroke: var(--border-subtle); stroke-width: 1; }',
      '.mm-svg .mm-note-title { fill: var(--text-secondary); font-size: 10.5px; font-weight: 700; }',
      '.mm-svg .mm-note-text { fill: var(--text-secondary); font-size: 9.5px; }',
      '.mm-svg .mm-small { fill: var(--text-tertiary); font-size: 9.5px; }',
      '.mm-svg .mm-arrow { stroke: var(--color-primary); stroke-width: 1.6; fill: none; }',
      '.mm-svg .mm-arrow-dashed { stroke-dasharray: 5 4; }',
      '.mm-svg .mm-arrow-head { fill: var(--color-primary); }',
      '.mm-svg .mm-divider { stroke: var(--border-subtle); stroke-width: 1; stroke-dasharray: 4 5; }',
      '.mm-svg .mm-membrane { fill: var(--bg-sunken); stroke: var(--border-subtle); stroke-width: 1; }',
      '.mm-svg .mm-complex { fill: var(--bg-surface); stroke: var(--border-strong); stroke-width: 1.1; }',
      '.mm-svg .mm-complex-text { fill: var(--text-primary); font-size: 12px; font-weight: 700; }',
      '.mm-svg .mm-h { fill: var(--color-amber); font-size: 8.5px; font-weight: 600; }',
      '.mm-hotspot { position: absolute; border: 1px solid rgba(90, 125, 92, 0.16); background: transparent; border-radius: 6px; cursor: pointer; padding: 0; transition: background .15s, border-color .15s; }',
      '.mm-hotspot:hover, .mm-hotspot.active { background: rgba(90, 125, 92, 0.08); border-color: rgba(90, 125, 92, 0.55); }',
      '.mm-hint { margin: 8px 2px 0; font-size: 0.76rem; color: var(--text-muted); }',
      '.mm-side { display: flex; flex-direction: column; gap: 12px; }',
      '.mm-card { border: 1px solid var(--border-subtle); border-radius: 12px; background: var(--bg-surface); padding: 14px; }',
      '.mm-card h4 { margin: 0 0 6px; font-size: 0.98rem; color: var(--color-deep); }',
      '.mm-card p { margin: 0 0 10px; font-size: 0.8rem; line-height: 1.65; color: var(--text-secondary); }',
      '.mm-card .mm-meta { font-size: 0.76rem; color: var(--text-muted); margin-bottom: 10px; }',
      '.mm-list { list-style: none; margin: 0; padding: 0; }',
      '.mm-list li { border-top: 1px dashed var(--border-subtle); }',
      '.mm-list li:first-child { border-top: 0; }',
      '.mm-list button { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 2px; border: 0; background: transparent; cursor: pointer; text-align: left; font-size: 0.82rem; color: var(--text-primary); }',
      '.mm-list button:hover { color: var(--color-primary); }',
      '.mm-list .mm-count { flex: none; font-size: 0.72rem; color: var(--text-muted); }',
      '.mm-empty { padding: 40px 16px; text-align: center; font-size: 0.85rem; color: var(--text-muted); }',
      '@media (max-width: 820px) { .mm-body { grid-template-columns: minmax(0, 1fr); } .mm-stage { max-height: 58vh; } }'
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ============================================================
   * 自绘 SVG 底图
   * 依据现行生物化学教材的主干通路绘制：仅展示代谢物、
   * 限速酶与辅因子/能量收支，详细步骤见右侧说明。
   * ============================================================ */
  function svgNode(x, y, w, label, h) {
    h = h || 26;
    return '<rect class="mm-node" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="6"/>' +
      '<text class="mm-node-text" x="' + (x + 10) + '" y="' + (y + h / 2 + 4.5) + '">' + esc(label) + '</text>';
  }

  function svgText(x, y, text, cls) {
    return '<text class="' + cls + '" x="' + x + '" y="' + y + '">' + esc(text) + '</text>';
  }

  function svgTextEnd(x, y, text, cls) {
    return '<text class="' + cls + '" x="' + x + '" y="' + y + '" text-anchor="end">' + esc(text) + '</text>';
  }

  function svgArrow(x1, y1, x2, y2, dashed) {
    return '<line class="mm-arrow' + (dashed ? ' mm-arrow-dashed' : '') + '" x1="' + x1 + '" y1="' + y1 +
      '" x2="' + x2 + '" y2="' + y2 + '" marker-end="url(#mm-arrowhead)"/>';
  }

  function svgArrowPath(d, dashed) {
    return '<path class="mm-arrow' + (dashed ? ' mm-arrow-dashed' : '') + '" d="' + d +
      '" marker-end="url(#mm-arrowhead)"/>';
  }

  function svgNote(x, y, w, h, title, lines) {
    var s = '<rect class="mm-note-box" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8"/>';
    if (title) s += '<text class="mm-note-title" x="' + (x + 12) + '" y="' + (y + 20) + '">' + esc(title) + '</text>';
    var top = title ? y + 40 : y + 20;
    for (var i = 0; i < lines.length; i++) {
      s += '<text class="mm-note-text" x="' + (x + 12) + '" y="' + (top + i * 19) + '">' + esc(lines[i]) + '</text>';
    }
    return s;
  }

  function svgPane(x, y, w, h, title, sub) {
    return '<rect class="mm-pane" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="14"/>' +
      '<text class="mm-pane-title" x="' + (x + 24) + '" y="' + (y + 36) + '">' + esc(title) + '</text>' +
      '<text class="mm-pane-sub" x="' + (x + 24) + '" y="' + (y + 58) + '">' + esc(sub) + '</text>';
  }

  /** 糖酵解 + 磷酸戊糖途径（细胞质基质） */
  function buildGlycolysis() {
    var x = 56;
    var w = 200;
    var ys = [154, 190, 226, 262, 298, 334, 370, 406, 442, 478];
    var names = [
      '葡萄糖', '6-磷酸葡萄糖（G6P）', '6-磷酸果糖（F6P）', '1,6-二磷酸果糖',
      '3-磷酸甘油醛 ×2', '1,3-二磷酸甘油酸', '3-磷酸甘油酸', '2-磷酸甘油酸',
      '磷酸烯醇式丙酮酸', '丙酮酸 → 线粒体'
    ];
    var s = svgPane(32, 72, 460, 498, '糖酵解与磷酸戊糖途径', '细胞质基质 · 净产 2 ATP + 2 NADH');
    for (var i = 0; i < names.length; i++) {
      s += svgNode(x, ys[i], w, names[i]);
      if (i < names.length - 1) s += svgArrow(x + w / 2, ys[i] + 26, x + w / 2, ys[i + 1] - 3);
    }
    var chips = [
      [1, '己糖激酶 −ATP'],
      [3, 'PFK-1 −ATP · 限速'],
      [5, 'G3P 脱氢酶 +NADH×2'],
      [6, '磷酸甘油酸激酶 +ATP×2'],
      [9, '丙酮酸激酶 +ATP×2 · 限速']
    ];
    for (var j = 0; j < chips.length; j++) {
      s += svgText(268, ys[chips[j][0]] + 17, chips[j][1], 'mm-cof');
    }
    s += svgNote(56, 512, 412, 50, '', [
      '磷酸戊糖途径（G6P 分支）：2 NADPH + 核糖-5-磷酸',
      '糖异生：丙酮酸 → 草酰乙酸 → PEP，绕过三步不可逆反应'
    ]);
    return s;
  }

  /** 三羧酸循环（线粒体基质） */
  function buildTCA() {
    var lx = 548;
    var rx = 748;
    var left = [
      [164, '乙酰 CoA（C2）'], [214, '柠檬酸（C6）'], [264, '异柠檬酸'],
      [314, 'α-酮戊二酸'], [364, '琥珀酰 CoA']
    ];
    var right = [
      [364, '琥珀酸（C4）'], [314, '延胡索酸'], [264, '苹果酸'], [214, '草酰乙酸（C4）']
    ];
    var s = svgPane(524, 72, 392, 498, '三羧酸循环', '线粒体基质 · 每轮 3 NADH + 1 FADH₂ + 1 GTP');
    var i;
    for (i = 0; i < left.length; i++) {
      s += svgNode(lx, left[i][0], 150, left[i][1]);
      if (i < left.length - 1) s += svgArrow(lx + 75, left[i][0] + 26, lx + 75, left[i + 1][0] - 3);
    }
    for (i = 0; i < right.length; i++) {
      s += svgNode(rx, right[i][0], 144, right[i][1]);
      if (i < right.length - 1) s += svgArrow(rx + 72, right[i][0] - 3, rx + 72, right[i + 1][0] + 26);
    }
    s += svgArrow(lx + 150, 377, rx - 3, 377);
    s += svgText(702, 371, 'GTP', 'mm-cof');
    // 草酰乙酸 + 乙酰 CoA → 柠檬酸（回环）
    s += svgArrowPath('M ' + (rx + 72) + ' 214 L ' + (rx + 72) + ' 192 L 714 192 L 714 227 L 701 227', true);
    s += svgTextEnd(892, 186, '草酰乙酸 + 乙酰 CoA → 柠檬酸', 'mm-enzyme');
    s += svgText(636, 204, '柠檬酸合酶', 'mm-enzyme');
    s += svgText(636, 254, '顺乌头酸酶', 'mm-enzyme');
    s += svgText(636, 304, '异柠檬酸脱氢酶 +NADH · 限速', 'mm-enzyme');
    s += svgText(636, 354, 'α-KG 脱氢酶 +NADH', 'mm-enzyme');
    s += svgTextEnd(900, 354, '+FADH₂', 'mm-cof');
    s += svgTextEnd(900, 254, '+NADH', 'mm-cof');
    s += svgNote(548, 420, 344, 118, '回补与连接', [
      '· 丙酮酸羧化酶：丙酮酸 → 草酰乙酸',
      '· 谷氨酰胺分解补充 α-酮戊二酸',
      '· 乙酰 CoA 也来自脂肪酸 β 氧化',
      '· 天冬氨酸 ↔ 草酰乙酸（转氨）'
    ]);
    return s;
  }

  /** 氧化磷酸化（线粒体内膜） */
  function buildOxphos() {
    var s = svgPane(524, 596, 392, 456, '氧化磷酸化（呼吸链）', '线粒体内膜 · NADH ≈ 2.5 ATP，FADH₂ ≈ 1.5 ATP');
    s += svgText(548, 700, '膜间隙（H⁺ 高）', 'mm-small');
    s += svgText(548, 726, 'NADH → I → Q → III → cyt c → IV → O₂ → H₂O', 'mm-enzyme');
    s += '<rect class="mm-membrane" x="548" y="748" width="344" height="26" rx="4"/>';
    var cx = [566, 640, 714, 788, 852];
    var cw = [36, 36, 36, 36, 40];
    var letters = ['I', 'II', 'III', 'IV', 'V'];
    var labels = ['I', 'II', 'III', 'IV', 'ATP 合酶'];
    for (var i = 0; i < cx.length; i++) {
      s += '<rect class="mm-complex" x="' + cx[i] + '" y="738" width="' + cw[i] + '" height="46" rx="5"/>';
      s += '<text class="mm-complex-text" x="' + (cx[i] + cw[i] / 2) + '" y="767" text-anchor="middle">' + letters[i] + '</text>';
      if (i === 4) s += '<text class="mm-small" x="' + (cx[i] + cw[i] / 2) + '" y="796" text-anchor="middle">' + labels[i] + '</text>';
    }
    s += svgText(688, 768, 'Q', 'mm-h');
    s += svgText(756, 768, 'cyt c', 'mm-h');
    s += svgText(548, 818, 'NAD⁺', 'mm-small');
    s += svgText(646, 818, 'FAD', 'mm-small');
    s += svgText(794, 818, 'H₂O', 'mm-small');
    s += svgText(848, 818, 'ATP', 'mm-small');
    s += svgNote(548, 828, 344, 196, '每分子葡萄糖完全氧化的产能账本', [
      '糖酵解：2 ATP + 2 NADH（胞质）',
      '丙酮酸氧化：2 NADH（PDH 复合体）',
      'TCA：2 GTP + 6 NADH + 2 FADH₂',
      '合计 10 NADH + 2 FADH₂ + 4 ATP',
      '≈ 30–32 ATP（NADH 2.5 / FADH₂ 1.5）',
      '复合体 I、III、IV 泵出 H⁺ 建立梯度',
      '抑制剂：鱼藤酮(I)、抗霉素 A(III)、氰化物(IV)'
    ]);
    return s;
  }

  /** 脂类代谢：β 氧化与脂肪酸合成 */
  function buildLipid() {
    var s = svgPane(948, 72, 620, 498, '脂类代谢', '细胞质（合成）· 线粒体基质（β 氧化）');
    s += svgText(972, 160, '分解：β 氧化', 'mm-group');
    s += svgText(1290, 160, '合成：脂肪酸', 'mm-group');
    s += '<line class="mm-divider" x1="1266" y1="150" x2="1266" y2="550"/>';
    var left = [
      [176, '甘油三酯'], [212, '甘油 + 脂肪酸'], [248, '脂酰 CoA'],
      [284, '脂酰肉碱（肉碱穿梭）']
    ];
    for (var i = 0; i < left.length; i++) {
      s += svgNode(972, left[i][0], 240, left[i][1]);
      if (i < left.length - 1) s += svgArrow(1092, left[i][0] + 26, 1092, left[i + 1][0] - 3);
    }
    s += svgText(1218, 281, '限速', 'mm-cof');
    s += '<rect class="mm-note-box" x="972" y="320" width="240" height="88" rx="8"/>';
    s += svgText(984, 340, 'β 氧化（每轮）', 'mm-note-title');
    s += svgText(984, 360, '脱氢 → 水化 → 脱氢 → 硫解', 'mm-note-text');
    s += svgText(984, 379, '1 FADH₂ + 1 NADH + 1 乙酰 CoA', 'mm-note-text');
    s += svgText(984, 398, '每次缩短 2 个碳，循环至末轮', 'mm-note-text');
    s += svgNode(972, 422, 240, '乙酰 CoA → 三羧酸循环');
    s += svgArrow(1092, 408, 1092, 419);
    s += svgNote(972, 456, 240, 92, '特殊情况', [
      '· 奇数碳末轮 → 丙酰 CoA → 琥珀酰 CoA',
      '· 不饱和脂肪酸需异构酶 / 还原酶',
      '· 酮体在肝生成（见下方）'
    ]);

    var right = [
      [176, '乙酰 CoA'], [212, '丙二酸单酰 CoA'], [248, '脂酰-ACP'], [284, '脂肪酸（软脂酸 C16）']
    ];
    for (var j = 0; j < right.length; j++) {
      s += svgNode(1290, right[j][0], 254, right[j][1]);
      if (j < right.length - 1) s += svgArrow(1417, right[j][0] + 26, 1417, right[j + 1][0] - 3);
    }
    s += svgText(1430, 208, 'ACC · 限速', 'mm-cof');
    s += svgText(1417, 320, '+14 NADPH', 'mm-cof');
    s += svgNote(1290, 330, 254, 150, '软脂酸（16C）合成账本', [
      '8 乙酰 CoA + 14 NADPH + 7 ATP',
      '合成与 β 氧化对比：',
      '· 部位：胞质 vs 线粒体基质',
      '· 载体：ACP vs CoA',
      '· 还原力：NADPH vs FADH₂/NADH',
      '· 方向：还原性合成 vs 氧化性分解'
    ]);
    s += svgNote(1290, 492, 254, 62, '乙酰 CoA 的来源', [
      '柠檬酸穿梭：线粒体 → 胞质',
      '糖酵解与氨基酸分解也可供碳'
    ]);
    return s;
  }

  /** 胆固醇合成与酮体生成 */
  function buildChol() {
    var s = svgPane(948, 596, 620, 456, '胆固醇与酮体', '内质网/细胞质（胆固醇）· 肝线粒体（酮体）');
    s += svgText(972, 682, '胆固醇合成（MVA 途径）', 'mm-group');
    s += svgText(1290, 682, '酮体生成（肝线粒体）', 'mm-group');
    var left = [
      [700, '乙酰 CoA'], [736, 'HMG-CoA'], [772, '甲羟戊酸（MVA）'],
      [808, '鲨烯'], [844, '胆固醇（27C）']
    ];
    for (var i = 0; i < left.length; i++) {
      s += svgNode(972, left[i][0], 210, left[i][1]);
      if (i < left.length - 1) s += svgArrow(1077, left[i][0] + 26, 1077, left[i + 1][0] - 3);
    }
    s += svgText(1190, 765, '限速', 'mm-cof');
    s += svgNote(972, 876, 280, 156, 'MVA 途径要点', [
      '· 限速酶：HMG-CoA 还原酶',
      '· 他汀类降脂药的靶点',
      '· 1 胆固醇 ← 18 乙酰 CoA、',
      '　36 ATP、16 NADPH',
      '· 衍生物：胆汁酸、类固醇激素、',
      '　维生素 D₃'
    ]);
    var right = [
      [700, '2 乙酰 CoA'], [736, '乙酰乙酰 CoA'], [772, 'HMG-CoA'],
      [808, '乙酰乙酸'], [844, 'β-羟丁酸 / 丙酮']
    ];
    for (var j = 0; j < right.length; j++) {
      s += svgNode(1290, right[j][0], 240, right[j][1]);
      if (j < right.length - 1) s += svgArrow(1410, right[j][0] + 26, 1410, right[j + 1][0] - 3);
    }
    s += svgNote(1290, 876, 250, 156, '酮体代谢', [
      '· 限速：HMG-CoA 裂解酶',
      '· 肝外组织：琥珀酰 CoA 转硫酶',
      '· 肝脏缺乏该酶：只生成不利用',
      '· 长期饥饿 / 糖尿病 → 酮血症',
      '· 酮体是肝外组织的替代燃料'
    ]);
    return s;
  }

  /** 氨基酸代谢与尿素循环（肝） */
  function buildAminoAcid() {
    var s = svgPane(32, 596, 460, 456, '氨基酸代谢与尿素循环', '肝脏 · 线粒体基质与细胞质协作 · 尿素含 2 个氮');
    var ys = [682, 716, 750, 784, 818, 852, 886, 920];
    var names = [
      '氨基酸', '谷氨酸', 'NH₄⁺ + α-酮戊二酸', '氨甲酰磷酸',
      '瓜氨酸', '精氨酸琥珀酸', '精氨酸', '尿素'
    ];
    for (var i = 0; i < names.length; i++) {
      s += svgNode(56, ys[i], 210, names[i]);
      if (i < names.length - 1) s += svgArrow(161, ys[i] + 26, 161, ys[i + 1] - 3);
    }
    var chips = [
      '转氨酶 ALT / AST',
      '谷氨酸脱氢酶 +NAD(P)H',
      'CPS-1 · 2 ATP · 限速',
      'OTC · 鸟氨酸',
      'ASS · 天冬氨酸',
      'ASL · 释放延胡索酸',
      '精氨酸酶 · 鸟氨酸再生'
    ];
    for (var j = 0; j < chips.length; j++) {
      s += svgText(276, ys[j] + 17, chips[j], 'mm-cof');
    }
    // 鸟氨酸再生：由精氨酸酶催化的尿素生成步骤完成（见右侧标签）
    s += svgNote(56, 960, 412, 88, '', [
      '· 脱氨后的 α-酮酸进入 TCA（生糖 / 生酮氨基酸）',
      '· 尿素的两个氮：NH₄⁺ 与天冬氨酸',
      '· CPS-1 / OTC 缺陷可致高氨血症',
      '· 鸟氨酸再生后返回线粒体，推动下一轮循环'
    ]);
    return s;
  }

  function buildSVG() {
    var s = '<svg class="mm-svg" viewBox="0 0 ' + VIEW_W + ' ' + VIEW_H + '" role="img" ' +
      'aria-label="自绘代谢通路总图：糖酵解、三羧酸循环、氧化磷酸化、脂类、胆固醇与氨基酸尿素循环">';
    s += '<defs><marker id="mm-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" ' +
      'markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path class="mm-arrow-head" d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>';
    s += svgText(32, 44, '光合作用（叶绿体）：CO₂ → 葡萄糖，为糖酵解提供底物', 'mm-small');
    s += svgTextEnd(1568, 44, '微生物代谢：发酵、呼吸与固氮参与全局碳氮循环', 'mm-small');
    s += buildGlycolysis();
    s += buildTCA();
    s += buildOxphos();
    s += buildLipid();
    s += buildChol();
    s += buildAminoAcid();
    // 跨区室连接：丙酮酸进入线粒体；TCA 的还原当量进入呼吸链
    s += svgArrowPath('M 492 491 L 508 491 L 508 177 L 521 177', true);
    s += '<text class="mm-enzyme" x="516" y="340" text-anchor="middle" transform="rotate(-90 516 340)">丙酮酸</text>';
    s += svgArrow(720, 572, 720, 593);
    s += svgText(728, 588, 'NADH · FADH₂', 'mm-cof');
    s += '</svg>';
    return s;
  }

  /* ============================================================
   * 数据：从 manifest 读取题量
   * ============================================================ */
  function loadCounts(done) {
    fetch('data/manifest.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (mf) {
        var topics = (mf && mf.topics) || [];
        var map = {};
        for (var i = 0; i < topics.length; i++) map[topics[i].id] = topics[i].count || 0;
        _counts = map;
        var total = 0;
        for (var j = 0; j < TOPICS.length; j++) total += map[TOPICS[j].tag] || 0;
        _topicsTotal = total;
      })
      .catch(function () { _counts = {}; _topicsTotal = 0; })
      .then(function () { if (done) done(); });
  }

  function countOf(tag) { return _counts[tag] || 0; }

  /* ============================================================
   * 渲染
   * ============================================================ */
  function buildHTML() {
    var spots = '';
    for (var i = 0; i < HOTSPOTS.length; i++) {
      var h = HOTSPOTS[i];
      spots += '<button type="button" class="mm-hotspot' + (h.key === _selectedKey ? ' active' : '') + '"' +
        ' data-hotspot="' + esc(h.key) + '" title="' + esc(h.label) + '"' +
        ' aria-label="' + esc(h.label) + '"></button>';
    }

    var list = '';
    for (var j = 0; j < TOPICS.length; j++) {
      var t = TOPICS[j];
      list += '<li><button type="button" data-topic="' + esc(t.tag) + '">' +
        '<span>' + esc(t.label) + '</span>' +
        '<span class="mm-count">' + countOf(t.tag) + ' 题</span>' +
        '</button></li>';
    }

    return '<div class="mm-page">' +
      '<div class="mm-head">' +
        '<div>' +
          '<h3 class="mm-title">代谢网络</h3>' +
          '<p class="mm-sub">把糖、脂、氨基酸与能量代谢串成一张图 — 拖动平移、滚轮或按钮缩放，点击热点进入考点练习</p>' +
        '</div>' +
        '<div class="mm-actions">' +
          '<div class="mm-zoom">' +
            '<button type="button" data-zoom="out" aria-label="缩小">−</button>' +
            '<span id="mm-zoom-label">100%</span>' +
            '<button type="button" data-zoom="in" aria-label="放大">＋</button>' +
            '<button type="button" data-zoom="reset" aria-label="重置缩放">⌂</button>' +
          '</div>' +
          '<button type="button" class="mm-btn mm-btn-primary" data-all>' +
            '刷全部代谢题' + (_topicsTotal ? '（' + _topicsTotal + '）' : '') +
          '</button>' +
          '<button type="button" class="mm-btn" data-back>返回概念图谱</button>' +
        '</div>' +
      '</div>' +
      '<div class="mm-body">' +
        '<div>' +
          '<div class="mm-stage" id="mm-stage">' +
            '<div class="mm-canvas" id="mm-canvas">' + buildSVG() + spots + '</div>' +
          '</div>' +
          '<p class="mm-hint">底图：本站自绘 SVG，按现行生物化学教材主干通路绘制 · 图外考点见右侧列表</p>' +
        '</div>' +
        '<aside class="mm-side">' +
          '<div class="mm-card" id="mm-detail"></div>' +
          '<div class="mm-card">' +
            '<h4>相关考点</h4>' +
            '<ul class="mm-list">' + list + '</ul>' +
          '</div>' +
        '</aside>' +
      '</div>' +
    '</div>';
  }

  function renderDetail(key) {
    var detail = document.getElementById('mm-detail');
    if (!detail) return;
    var h = null;
    for (var i = 0; i < HOTSPOTS.length; i++) if (HOTSPOTS[i].key === key) h = HOTSPOTS[i];
    if (!h) {
      mountHTML(detail, '<h4>代谢网络</h4><p>点击图上的热点，或在右侧选择考点进入练习。</p>');
      return;
    }
    _selectedKey = key;
    var n = countOf(h.tag);
    mountHTML(detail, '<h4>' + esc(h.label) + '</h4>' +
      '<div class="mm-meta">' + (n ? n + ' 道相关题目' : '题目加载中') + '</div>' +
      '<p>' + esc(h.desc) + '</p>' +
      '<button type="button" class="mm-btn mm-btn-primary" data-practice="' + esc(h.tag) + '">开始练习</button>');
    var btn = detail.querySelector('[data-practice]');
    if (btn) btn.addEventListener('click', function () { goPractice([btn.getAttribute('data-practice')]); });

    // 同步热点高亮
    var all = document.querySelectorAll('.mm-hotspot');
    for (var j = 0; j < all.length; j++) {
      all[j].classList.toggle('active', all[j].getAttribute('data-hotspot') === key);
    }
  }

  /* ============================================================
   * 缩放与平移
   * ============================================================ */
  function applyTransform() {
    if (!_canvasEl) return;
    _canvasEl.style.transform = 'translate(' + _tx + 'px,' + _ty + 'px) scale(' + _scale + ')';
    var label = document.getElementById('mm-zoom-label');
    if (label) label.textContent = Math.round(_scale * 100) + '%';
  }

  function clampTransform() {
    if (!_stageEl || !_canvasEl) return;
    var sw = _stageEl.clientWidth;
    var sh = _stageEl.clientHeight;
    var iw = _canvasEl.offsetWidth * _scale;
    var ih = _canvasEl.offsetHeight * _scale;
    _tx = Math.min(0, Math.max(sw - iw, _tx));
    _ty = Math.min(0, Math.max(sh - ih, _ty));
    if (iw <= sw) _tx = (sw - iw) / 2;
    if (ih <= sh) _ty = (sh - ih) / 2;
  }

  function zoomTo(next, cx, cy) {
    next = Math.max(1, Math.min(4, next));
    if (!_stageEl) return;
    var rect = _stageEl.getBoundingClientRect();
    var px = (cx == null ? rect.width / 2 : cx - rect.left);
    var py = (cy == null ? rect.height / 2 : cy - rect.top);
    var ratio = next / _scale;
    _tx = px - (px - _tx) * ratio;
    _ty = py - (py - _ty) * ratio;
    _scale = next;
    clampTransform();
    applyTransform();
  }

  function bindStage() {
    _stageEl = document.getElementById('mm-stage');
    _canvasEl = document.getElementById('mm-canvas');
    if (!_stageEl || !_canvasEl) return;

    _stageEl.addEventListener('wheel', function (e) {
      e.preventDefault();
      var next = _scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
      zoomTo(next, e.clientX, e.clientY);
    }, { passive: false });

    _stageEl.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.mm-hotspot')) return;
      _dragging = true;
      _dragStart = { x: e.clientX, y: e.clientY, tx: _tx, ty: _ty };
      _stageEl.classList.add('dragging');
      if (_stageEl.setPointerCapture) _stageEl.setPointerCapture(e.pointerId);
    });

    _stageEl.addEventListener('pointermove', function (e) {
      if (!_dragging || !_dragStart) return;
      var dx = e.clientX - _dragStart.x;
      var dy = e.clientY - _dragStart.y;
      _tx = _dragStart.tx + dx;
      _ty = _dragStart.ty + dy;
      clampTransform();
      applyTransform();
    });

    function endDrag() {
      _dragging = false;
      _dragStart = null;
      if (_stageEl) _stageEl.classList.remove('dragging');
    }
    _stageEl.addEventListener('pointerup', endDrag);
    _stageEl.addEventListener('pointercancel', endDrag);

    var spots = _stageEl.querySelectorAll('.mm-hotspot');
    for (var i = 0; i < spots.length; i++) {
      var key = spots[i].getAttribute('data-hotspot');
      var box = null;
      for (var k = 0; k < HOTSPOTS.length; k++) if (HOTSPOTS[k].key === key) box = HOTSPOTS[k];
      if (box) {
        spots[i].style.left = box.left + '%';
        spots[i].style.top = box.top + '%';
        spots[i].style.width = box.width + '%';
        spots[i].style.height = box.height + '%';
      }
      spots[i].addEventListener('click', function (e) {
        e.stopPropagation();
        renderDetail(this.getAttribute('data-hotspot'));
      });
    }
  }

  /* ============================================================
   * 挂载
   * ============================================================ */
  function render(target) {
    if (!target) return;
    injectStyles();
    _scale = 1; _tx = 0; _ty = 0; _selectedKey = 'glycolysis';

    function paint() {
      mountHTML(target, buildHTML());
      bindStage();
      clampTransform();
      applyTransform();
      renderDetail(_selectedKey);

      var back = target.querySelector('[data-back]');
      if (back) back.addEventListener('click', function () {
        if (typeof window.initKnowledgeGraph === 'function') window.initKnowledgeGraph(target);
      });

      var all = target.querySelector('[data-all]');
      if (all) all.addEventListener('click', function () {
        goPractice(TOPICS.map(function (t) { return t.tag; }));
      });

      var zoomBtns = target.querySelectorAll('[data-zoom]');
      for (var i = 0; i < zoomBtns.length; i++) {
        zoomBtns[i].addEventListener('click', function () {
          var act = this.getAttribute('data-zoom');
          if (act === 'reset') { _scale = 1; _tx = 0; _ty = 0; clampTransform(); applyTransform(); }
          else zoomTo(_scale * (act === 'in' ? 1.25 : 1 / 1.25));
        });
      }

      var listBtns = target.querySelectorAll('[data-topic]');
      for (var j = 0; j < listBtns.length; j++) {
        listBtns[j].addEventListener('click', function () {
          goPractice([this.getAttribute('data-topic')]);
        });
      }
    }

    paint();
    loadCounts(function () {
      // 题量到达后刷新计数与详情，不重建整个视图（保留缩放状态）
      var counts = target.querySelectorAll('[data-topic] .mm-count');
      for (var i = 0; i < counts.length; i++) {
        var tag = counts[i].parentNode.getAttribute('data-topic');
        counts[i].textContent = countOf(tag) + ' 题';
      }
      var allBtn = target.querySelector('[data-all]');
      if (allBtn && _topicsTotal) allBtn.textContent = '刷全部代谢题（' + _topicsTotal + '）';
      renderDetail(_selectedKey);
    });
  }

  window.MetabolicMap = { render: render, HOTSPOTS: HOTSPOTS, TOPICS: TOPICS };
})();
