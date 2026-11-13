/**
 * ============================================================
 * TATABOX — 代谢网络专题（知识图谱子视图）
 * 以一张代谢通路总图为底图，叠加通路热点与相关考点，
 * 支持拖拽平移、滚轮/按钮缩放，点击热点或考点进入对应练习。
 * ============================================================
 */
(function () {
  'use strict';

  var MAP_SRC = 'assets/metabolic/map.webp';

  /** 图上的主干通路热点（百分比坐标，相对底图） */
  var HOTSPOTS = [
    {
      key: 'glycolysis', label: '糖酵解与磷酸戊糖途径', tag: 'glycolysis',
      left: 20, top: 4, width: 30, height: 33,
      desc: '葡萄糖经己糖激酶、磷酸果糖激酶-1、丙酮酸激酶三步限速反应生成丙酮酸；磷酸戊糖途径以 6-磷酸葡萄糖为起点，生成 NADPH 与核糖-5-磷酸。'
    },
    {
      key: 'tca', label: '三羧酸循环', tag: 'krebs_cycle',
      left: 42, top: 46, width: 26, height: 52,
      desc: '乙酰 CoA 与草酰乙酸缩合生成柠檬酸，经异柠檬酸、α-酮戊二酸、琥珀酰 CoA、琥珀酸、延胡索酸、苹果酸脱氢脱羧，每轮生成 3 NADH、1 FADH₂、1 GTP。'
    },
    {
      key: 'oxphos', label: '氧化磷酸化（呼吸链）', tag: 'oxidative_phos',
      left: 76, top: 47, width: 23, height: 13,
      desc: '复合体 I–IV 将 NADH/FADH₂ 的电子逐级传递并泵出质子，形成跨内膜电化学梯度；ATP 合酶借质子回流合成 ATP。'
    },
    {
      key: 'lipid', label: '脂类代谢（合成与 β 氧化）', tag: 'lipid_metab',
      left: 55, top: 18, width: 45, height: 28,
      desc: '脂肪酸合成在细胞质以乙酰 CoA 为原料、经丙二酸单酰 CoA 与 ACP 重复缩合；β 氧化在线粒体基质每轮切下 2 个碳，生成乙酰 CoA 与还原当量。'
    },
    {
      key: 'chol', label: '胆固醇与酮体', tag: 'lipid_metab',
      left: 64, top: 64, width: 36, height: 36,
      desc: '胆固醇以乙酰 CoA 为原料经 HMG-CoA、甲羟戊酸（MVA）途径合成，并衍生胆汁酸与类固醇激素；酮体在肝脏由乙酰 CoA 生成，供肝外组织氧化利用。'
    },
    {
      key: 'aa', label: '氨基酸代谢与尿素循环', tag: 'amino_acid_metab',
      left: 2, top: 54, width: 30, height: 46,
      desc: '氨基酸经转氨、脱氨生成 α-酮酸进入 TCA；有毒的氨经氨甲酰磷酸、瓜氨酸、精氨酸等步骤在尿素循环中转为尿素排出。'
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
      '.mm-zoom { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--border-color); border-radius: 8px; background: white; padding: 2px; }',
      '.mm-zoom button { width: 30px; height: 30px; border: 0; background: transparent; font-size: 1rem; cursor: pointer; color: var(--text-primary); border-radius: 6px; }',
      '.mm-zoom button:hover { background: var(--bg-soft); }',
      '.mm-zoom span { min-width: 44px; text-align: center; font-size: 0.78rem; color: var(--text-secondary); }',
      '.mm-btn { border: 1px solid var(--border-color); background: white; color: var(--text-primary); border-radius: 8px; padding: 7px 12px; font-size: 0.82rem; cursor: pointer; }',
      '.mm-btn:hover { background: var(--bg-soft); }',
      '.mm-btn-primary { background: var(--color-primary); border-color: var(--color-primary); color: white; font-weight: 600; }',
      '.mm-btn-primary:hover { filter: brightness(1.06); }',
      '.mm-body { display: grid; grid-template-columns: minmax(0, 1fr) 264px; gap: 16px; align-items: start; }',
      '.mm-stage { position: relative; overflow: hidden; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-soft); cursor: grab; touch-action: none; }',
      '.mm-stage.dragging { cursor: grabbing; }',
      '.mm-canvas { position: relative; transform-origin: 0 0; will-change: transform; }',
      '.mm-canvas img { display: block; width: 100%; height: auto; user-select: none; -webkit-user-drag: none; }',
      '.mm-hotspot { position: absolute; border: 2px dashed rgba(196, 154, 74, 0.55); background: rgba(255, 244, 214, 0.10); border-radius: 8px; cursor: pointer; padding: 0; transition: background .15s, border-color .15s, box-shadow .15s; }',
      '.mm-hotspot:hover, .mm-hotspot.active { background: rgba(255, 226, 150, 0.22); border-color: rgba(180, 128, 32, 0.9); box-shadow: 0 0 0 2px rgba(196, 154, 74, 0.18); }',
      '.mm-hotspot span { position: absolute; top: 4px; left: 4px; max-width: calc(100% - 8px); padding: 2px 7px; border-radius: 999px; background: rgba(255, 255, 255, 0.92); border: 1px solid rgba(196, 154, 74, 0.7); color: var(--color-amber); font-size: 0.72rem; line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.mm-hint { margin: 8px 2px 0; font-size: 0.76rem; color: var(--text-muted); }',
      '.mm-side { display: flex; flex-direction: column; gap: 12px; }',
      '.mm-card { border: 1px solid var(--border-color); border-radius: 12px; background: white; padding: 14px; }',
      '.mm-card h4 { margin: 0 0 6px; font-size: 0.98rem; color: var(--color-deep); }',
      '.mm-card p { margin: 0 0 10px; font-size: 0.8rem; line-height: 1.65; color: var(--text-secondary); }',
      '.mm-card .mm-meta { font-size: 0.76rem; color: var(--text-muted); margin-bottom: 10px; }',
      '.mm-list { list-style: none; margin: 0; padding: 0; }',
      '.mm-list li { border-top: 1px dashed var(--border-color); }',
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
        ' data-hotspot="' + esc(h.key) + '"' +
        ' aria-label="' + esc(h.label) + '"><span>' + esc(h.label) + '</span></button>';
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
            '<div class="mm-canvas" id="mm-canvas">' +
              '<img src="' + MAP_SRC + '" alt="代谢通路总图" draggable="false">' +
              spots +
            '</div>' +
          '</div>' +
          '<p class="mm-hint">底图：用户提供的代谢通路挂图（2014）· 热点仅覆盖原图主干通路，图外考点见右侧列表</p>' +
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
      detail.innerHTML = '<h4>代谢网络</h4><p>点击图上的热点，或在右侧选择考点进入练习。</p>';
      return;
    }
    _selectedKey = key;
    var n = countOf(h.tag);
    detail.innerHTML = '<h4>' + esc(h.label) + '</h4>' +
      '<div class="mm-meta">' + (n ? n + ' 道相关题目' : '题目加载中') + '</div>' +
      '<p>' + esc(h.desc) + '</p>' +
      '<button type="button" class="mm-btn mm-btn-primary" data-practice="' + esc(h.tag) + '">开始练习</button>';
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

    // 等图片加载后按容器高度限制舞台
    var img = _canvasEl.querySelector('img');
    if (img) {
      img.addEventListener('error', function () {
        _stageEl.innerHTML = '<div class="mm-empty">代谢图加载失败，请刷新页面重试</div>';
      });
    }

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
      target.innerHTML = buildHTML();
      bindStage();
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
