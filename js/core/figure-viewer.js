/**
 * TATABOX — 题目配图统一渲染 + 图片查看器（全站唯一图片展示入口）
 *
 * 解决的三个问题：
 * 1) 各页面图片展示不统一（quiz.js 不渲染、practice/exam 各写各的）→ 提供
 *    window.BioQuestFigure.render(q) 统一产出题图 HTML。
 * 2) 图片加载不稳定 → 捕获阶段接管全部题目图片 error：自动重试一次，
 *    仍失败则显示可点击重试的占位块。
 * 3) 图片不能放大/标注/下载 → 点击图片打开 Viewer.js 查看器（缩放/平移/
 *    旋转/全屏），叠加自研标注层（画笔/箭头/矩形/椭圆），可下载原图或
 *    标注合成图。
 *
 * 标注数据只存在于前端内存与 canvas，导出时才与原图合成，
 * 绝不写回、不覆盖 assets/ 下的原始图片文件。
 *
 * 依赖：js/vendor/viewer.min.js + viewer.css（首次打开查看器时懒加载）
 * 配套样式：css/figure-viewer.css
 */
(function () {
  'use strict';

  var V = '20261012a';
  var VIEWER_JS = 'js/vendor/viewer.min.js?v=' + V;
  var VIEWER_CSS = 'js/vendor/viewer.css?v=' + V;

  var _esc = function (s) {
    if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function') {
      return window.escapeHtml(String(s == null ? '' : s));
    }
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  var _isChartImageSrc = function (s) {
    if (typeof window !== 'undefined' && typeof window.isChartImageSrc === 'function') {
      try { return window.isChartImageSrc(s); } catch (e) { /* fallthrough */ }
    }
    if (typeof s !== 'string' || !s) return false;
    var t = s.trim();
    if (t.indexOf('data:image') === 0) return true;
    if (/^https?:\/\//.test(t)) return true;
    return /\.(png|jpe?g|webp|gif|svg)([?#][^\s"']*)?$/i.test(t);
  };

  /* ============================================================
   * 1. 配图路径提取（各数据源字段不统一，这里统一归一）
   * ============================================================ */

  /**
   * 从题目对象提取图片路径；非图片型 chart（表格/文本）返回空串。
   * 支持的字段来源：
   *   - q.chart            本地分片/归一化后的图路径或 data URI
   *   - q.image.file       联赛真题与 per-id 题库的图片元数据
   *   - q.image (string)   简写形式
   *   - q.image_url        Supabase questions.image_url 列
   * @param {Object} q
   * @returns {string}
   */
  function figureSrcOf(q) {
    if (!q || typeof q !== 'object') return '';
    var c = q.chart;
    if (typeof c === 'string' && c.trim()) {
      var t = c.trim();
      if (_isChartImageSrc(t)) return t.split(/\s+/)[0];
    }
    var im = q.image;
    if (im && typeof im === 'object' && typeof im.file === 'string' && im.file) return im.file;
    if (typeof im === 'string' && im) return im;
    if (typeof q.image_url === 'string' && q.image_url) return q.image_url;
    if (typeof q.imageUrl === 'string' && q.imageUrl) return q.imageUrl;
    return '';
  }

  /**
   * 统一题图 HTML（含点击查看放大、失败占位接管标记）
   * @param {string} src 图片路径
   * @param {string} [alt]
   * @returns {string}
   */
  function figureHTML(src, alt) {
    if (!src) return '';
    return '<figure class="bq-figure">' +
      '<img class="bq-figure-img" data-bq-zoom="1" src="' + _esc(src) + '" alt="' +
      _esc(alt || '题目配图') + '" loading="lazy" decoding="async">' +
      '</figure>';
  }

  /**
   * 统一渲染：优先取配图；无配图但 chart 是表格/文本时回落 renderChart。
   * @param {Object} q 题目对象
   * @param {Object} [opts] {alt:string}
   * @returns {string} HTML
   */
  function renderFigure(q, opts) {
    opts = opts || {};
    var src = figureSrcOf(q);
    if (src) return figureHTML(src, opts.alt || ((q && q.subject) ? q.subject + '图' : '题目配图'));
    if (q && q.chart && typeof window !== 'undefined' && typeof window.renderChart === 'function') {
      return window.renderChart(q.chart);
    }
    return '';
  }

  /**
   * 统一渲染 chart 字段：图片走统一图块（可点击放大），其余沿用 renderChart
   * @param {*} chart
   * @returns {string}
   */
  function renderChartUnified(chart) {
    if (typeof chart === 'string' && chart.trim() && _isChartImageSrc(chart.trim())) {
      return figureHTML(chart.trim().split(/\s+/)[0], '题目图表');
    }
    if (typeof window !== 'undefined' && typeof window.renderChart === 'function') {
      return window.renderChart(chart);
    }
    return '';
  }

  /* ============================================================
   * 2. 图片加载稳定性：自动重试一次 + 可点击重试的失败占位
   * ============================================================ */

  var RETRY_ATTR = 'data-bq-retry';

  function _clearRetryQuery(src) {
    return String(src || '').replace(/([?&])bqretry=\d+/, function (m, sep) {
      return sep === '?' ? '' : '&';
    }).replace(/\?$/, '');
  }

  function _showFailed(img) {
    if (!img || !img.parentNode) return;
    var src = _clearRetryQuery(img.getAttribute('src'));
    // 幂等：真实网络 error 与手动触发可能叠加，已有占位就不再堆第二个
    var exist = img.parentNode.querySelector ?
      img.parentNode.querySelectorAll('[data-bq-retry-box]') : [];
    for (var i = 1; exist && i < exist.length; i++) {
      exist[i].parentNode.removeChild(exist[i]);
    }
    if (exist && exist[0]) {
      exist[0].setAttribute('data-bq-retry-box', src);
      img.style.display = 'none';
      return;
    }
    var box = document.createElement('div');
    box.className = 'bq-figure-failed';
    box.setAttribute('data-bq-retry-box', src);
    var icon = (typeof window !== 'undefined' && window.BQ_ICONS && window.BQ_ICONS.alert) ?
      window.BQ_ICONS.alert : '';
    box.innerHTML = '<span class="bq-figure-failed-icon" aria-hidden="true">' + icon + '</span>' +
      '<span>图片加载失败</span>' +
      '<span class="bq-figure-failed-hint">点击重试</span>';
    img.style.display = 'none';
    img.parentNode.appendChild(box);
  }

  function retryImg(img) {
    if (!img) return;
    var box = img.parentNode && img.parentNode.querySelector ?
      img.parentNode.querySelector('[data-bq-retry-box]') : null;
    if (box) box.parentNode.removeChild(box);
    delete img.dataset.bqRetry;
    img.style.display = '';
    img.removeAttribute(RETRY_ATTR);
    // 恢复原始路径并强制重新加载
    var src = img.getAttribute('data-bq-orig-src') || img.getAttribute('src');
    if (src) {
      img.setAttribute('data-bq-orig-src', src);
      img.setAttribute('src', _clearRetryQuery(src) + (String(src).indexOf('?') >= 0 ? '&' : '?') + 'bqretry=' + Date.now());
    }
  }

  function _handleImgError(img) {
    if (!img.getAttribute('data-bq-orig-src')) {
      img.setAttribute('data-bq-orig-src', _clearRetryQuery(img.getAttribute('src')));
    }
    if (img.dataset && img.dataset.bqRetry === '1') {
      _showFailed(img);
      return;
    }
    if (img.dataset) img.dataset.bqRetry = '1';
    var src = _clearRetryQuery(img.getAttribute('src'));
    if (!src) { _showFailed(img); return; }
    // 第一次失败：加缓存穿透参数重试一次（应对边缘缓存里残留的 404/坏文件）
    img.setAttribute('src', src + (src.indexOf('?') >= 0 ? '&' : '?') + 'bqretry=' + Date.now());
  }

  function _bindImagePipeline() {
    if (typeof document === 'undefined' || !document.addEventListener) return;

    // 捕获阶段拦截所有题目图片的 error（utils.js 的 data-chart-fallback
    // 兜底遇到 data-bq-zoom 会跳过，见 utils.js 中的判断）
    document.addEventListener('error', function (e) {
      var t = e && e.target;
      if (!t || t.tagName !== 'IMG') return;
      if (t.getAttribute('data-bq-zoom') !== '1') return;
      _handleImgError(t);
    }, true);

    // 点击图片 → 打开查看器；点击失败占位 → 重试
    document.addEventListener('click', function (e) {
      var el = e.target;
      if (!el) return;

      var box = el.closest ? el.closest('[data-bq-retry-box]') : null;
      if (box) {
        var host = box.parentNode;
        var img = host ? host.querySelector('img[data-bq-zoom]') : null;
        if (img) { retryImg(img); return; }
      }

      var img2 = el.closest ? el.closest('img[data-bq-zoom]') : null;
      if (!img2) return;
      if (img2.dataset && img2.dataset.bqRetry === '1') return; // 已失败，等占位
      if (img2.getAttribute('data-bq-nozoom') === '1') return;
      if (!img2.getAttribute('src')) return;
      e.preventDefault();
      openViewer(img2.getAttribute('data-bq-orig-src') || img2.currentSrc || img2.src, img2.alt || '');
    });
  }

  /* ============================================================
   * 3. 查看器：Viewer.js（缩放/平移/旋转/全屏） + 自研工具条
   * ============================================================ */

  var _viewerCssLoaded = false;
  function _ensureViewerCss() {
    if (_viewerCssLoaded) return;
    _viewerCssLoaded = true;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = VIEWER_CSS;
    document.head.appendChild(link);
  }

  var _viewerLoading = null;
  function _ensureViewerLib() {
    if (typeof window.Viewer !== 'undefined') return Promise.resolve();
    _ensureViewerCss();
    if (_viewerLoading) return _viewerLoading;
    if (typeof window.loadScriptOnce !== 'function') {
      return Promise.reject(new Error('loadScriptOnce 不可用'));
    }
    _viewerLoading = window.loadScriptOnce(VIEWER_JS, {
      verify: function () { return typeof window.Viewer !== 'undefined'; }
    }).catch(function (err) {
      _viewerLoading = null;
      throw err;
    });
    return _viewerLoading;
  }

  var _active = null; // 当前查看器状态 {holder, viewer, container, toolbar, src, annot}

  function _download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  }

  function _basename(src) {
    var s = String(src || '').split(/[?#]/)[0];
    var parts = s.split('/');
    return parts[parts.length - 1] || 'image.png';
  }

  function _downloadOriginal(src) {
    var name = _basename(src);
    // 同源优先走 fetch→blob，保证带 download 文件名；跨域失败则回退
    if (/^https?:\/\//i.test(src) && typeof location !== 'undefined' &&
        src.indexOf(location.origin) !== 0) {
      window.open(src, '_blank', 'noopener');
      return;
    }
    if (typeof fetch === 'function') {
      fetch(src, { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
        .then(function (b) { _download(b, name); })
        .catch(function () {
          var a = document.createElement('a');
          a.href = src; a.download = name;
          document.body.appendChild(a); a.click();
          setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 1500);
        });
    } else {
      // fetch 不可用：优先用同源 a[download]，再退回新标签打开
      try {
        var a2 = document.createElement('a');
        a2.href = src;
        a2.download = name;
        a2.rel = 'noopener';
        document.body.appendChild(a2);
        a2.click();
        setTimeout(function () { if (a2.parentNode) a2.parentNode.removeChild(a2); }, 1500);
      } catch (e) {
        window.open(src, '_blank', 'noopener');
      }
    }
  }

  function _closeActive() {
    if (!_active) return;
    var a = _active;
    _active = null;
    try { if (a.viewer) a.viewer.destroy(); } catch (e) {}
    if (a.holder && a.holder.parentNode) a.holder.parentNode.removeChild(a.holder);
    var stashed = document.querySelector('.viewer-container');
    if (stashed && stashed.parentNode) stashed.parentNode.removeChild(stashed);
    document.body.style.overflow = '';
  }

  /**
   * 请求关闭：优先走 Viewer.js 的隐藏动画；transitionend 未必触发
   * （后台标签页 / prefers-reduced-motion / 非常规环境），500ms 后强制关闭，
   * 保证遮罩一定消失、页面滚动一定恢复。
   */
  function _requestClose() {
    if (!_active) return;
    var snap = _active;
    try { if (snap.viewer) snap.viewer.hide(); } catch (e) { _closeActive(); return; }
    setTimeout(function () { if (_active === snap) _closeActive(); }, 500);
  }

  function _btn(label, title, onClick, opts) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'bq-iv-btn';
    b.textContent = label;
    if (title) b.title = title;
    if (onClick) b.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      onClick();
    });
    if (opts && opts.active) b.classList.add('bq-iv-btn-active');
    if (opts && opts.dataset) {
      for (var k in opts.dataset) b.setAttribute(k, opts.dataset[k]);
    }
    return b;
  }

  function _sep() {
    var s = document.createElement('span');
    s.className = 'bq-iv-sep';
    return s;
  }

  /**
   * 打开图片查看器
   * @param {string} src 图片路径
   * @param {string} [alt]
   */
  function openViewer(src, alt) {
    if (!src || typeof document === 'undefined') return;
    if (_active) _closeActive();

    _ensureViewerLib().then(function () {
      _show(src, alt);
    }).catch(function (err) {
      if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast('图片查看器加载失败：' + (err && err.message ? err.message : err));
      } else {
        window.open(src, '_blank', 'noopener');
      }
    });
  }

  function _show(src, alt) {
    var holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;';
    var img = document.createElement('img');
    img.src = src;
    img.alt = alt || '';
    holder.appendChild(img);
    document.body.appendChild(holder);

    var viewer = new window.Viewer(img, {
      inline: false,
      navbar: false,
      title: false,
      toolbar: false,
      rotatable: true,
      zoomable: true,
      movable: true,
      scalable: true,
      transition: true,
      fullscreen: true,
      keyboard: true,
      zIndex: 20210,
      hidden: function () {
        _closeActive();
      }
    });

    // Viewer.js 只有在 show() 之后才把 .viewer-container 挂到 body，
    // 且容器不在 holder 内 → 先 show 再从 document 中取（同一时刻只开一个查看器）
    _active = {
      holder: holder,
      viewer: viewer,
      container: null,
      src: src,
      alt: alt || '',
      annot: null,
      strokes: [],
      tool: 'pen',
      color: '', // 由 _buildAnnotateToolbar 从全局 token 取首个色板色
      thick: false
    };

    viewer.show();

    var container = document.querySelector('.viewer-container') ||
      holder.querySelector('.viewer-container') ||
      (img.closest ? img.closest('.viewer-container') : null);
    if (!container) {
      _active = null;
      try { viewer.destroy(); } catch (e) {}
      if (holder.parentNode) holder.parentNode.removeChild(holder);
      if (typeof window.showToast === 'function') window.showToast('图片查看器初始化失败');
      return;
    }
    container.style.position = container.style.position || 'absolute';
    _active.container = container;

    document.body.style.overflow = 'hidden';
    _buildToolbar();
  }

  /* ---------- 3.1 工具条 ---------- */

  function _buildToolbar() {
    if (!_active) return;
    var bar = document.createElement('div');
    bar.className = 'bq-iv-toolbar';
    _active.toolbar = bar;

    var v = _active.viewer;

    bar.appendChild(_btn('−', '缩小', function () { try { v.zoom(-0.1); } catch (e) {} }));
    bar.appendChild(_btn('＋', '放大', function () { try { v.zoom(0.1); } catch (e) {} }));
    bar.appendChild(_btn('⤢', '实际大小', function () { try { v.zoomTo(1); } catch (e) {} }));
    bar.appendChild(_btn('↺', '旋转', function () { try { v.rotate(-90); } catch (e) {} }));
    bar.appendChild(_btn('↻', '旋转', function () { try { v.rotate(90); } catch (e) {} }));
    bar.appendChild(_btn('⤡', '复位', function () { try { v.reset(); } catch (e) {} }));
    bar.appendChild(_sep());

    var annotBtn = _btn('✎ 标注', '在图片上标注（只影响本机显示，不修改原图）', function () {
      if (_active && _active.annot) _exitAnnotate();
      else _enterAnnotate();
    });
    annotBtn.setAttribute('data-bq-annot-toggle', '1');
    bar.appendChild(annotBtn);

    bar.appendChild(_sep());
    bar.appendChild(_btn('⤓ 原图', '下载原始图片', function () {
      if (_active) _downloadOriginal(_active.src);
    }));
    bar.appendChild(_btn('⤓ 标注', '下载带标注的图片（合成仅在本机完成）', function () {
      _exportAnnotated();
    }));
    bar.appendChild(_sep());

    var title = document.createElement('span');
    title.className = 'bq-iv-title';
    title.textContent = _active.alt || _basename(_active.src);
    bar.appendChild(title);

    bar.appendChild(_btn('✕ 关闭', '关闭（Esc）', function () {
      _requestClose();
    }));

    _active.container.appendChild(bar);
  }

  /* ---------- 3.2 标注层 ---------- */

  function _enterAnnotate() {
    if (!_active || _active.annot) return;
    var c = _active.container;

    var stage = document.createElement('div');
    stage.className = 'bq-annot-stage';

    var hint = document.createElement('div');
    hint.className = 'bq-annot-hint';
    hint.textContent = '标注仅用于本机展示与导出，不会修改原始图片';

    var frame = document.createElement('div');
    frame.className = 'bq-annot-frame';

    var aimg = document.createElement('img');
    aimg.className = 'bq-annot-img';
    aimg.src = _active.src;
    aimg.alt = _active.alt || '';
    aimg.setAttribute('data-bq-nozoom', '1');

    var canvas = document.createElement('canvas');
    canvas.className = 'bq-annot-canvas';

    frame.appendChild(aimg);
    frame.appendChild(canvas);
    stage.appendChild(hint);
    stage.appendChild(frame);
    c.appendChild(stage);

    // 隐藏 Viewer 的画布，避免两层图片叠在一起
    var vCanvas = c.querySelector('.viewer-canvas');
    if (vCanvas) vCanvas.style.display = 'none';
    var vNavbar = c.querySelector('.viewer-navbar');
    if (vNavbar) vNavbar.style.display = 'none';

    var annot = {
      stage: stage, frame: frame, img: aimg, canvas: canvas,
      ctx: canvas.getContext('2d'),
      dpr: Math.max(1, Math.min(3, window.devicePixelRatio || 1)),
      drawing: false, current: null, viewW: 0, viewH: 0,
      onResize: null
    };
    _active.annot = annot;
    _active.strokes = [];

    function layout() {
      if (!_active || !_active.annot) return;
      var rect = aimg.getBoundingClientRect();
      var frameRect = frame.getBoundingClientRect();
      var w = Math.round(rect.width) || Math.round(frameRect.width);
      var h = Math.round(rect.height) || Math.round(frameRect.height);
      if (!w || !h) return;
      annot.viewW = w;
      annot.viewH = h;
      canvas.width = Math.round(w * annot.dpr);
      canvas.height = Math.round(h * annot.dpr);
      _redraw();
    }

    annot.onResize = layout;
    if (aimg.complete && aimg.naturalWidth) {
      setTimeout(layout, 0);
    } else {
      aimg.addEventListener('load', layout);
    }
    window.addEventListener('resize', layout);

    _bindAnnotateDrawing();
    _buildAnnotateToolbar();
    _syncAnnotToggle(true);
  }

  function _exitAnnotate() {
    if (!_active || !_active.annot) return;
    var annot = _active.annot;
    window.removeEventListener('resize', annot.onResize);
    if (annot.stage && annot.stage.parentNode) annot.stage.parentNode.removeChild(annot.stage);
    var c = _active.container;
    var vCanvas = c.querySelector('.viewer-canvas');
    if (vCanvas) vCanvas.style.display = '';
    var vNavbar = c.querySelector('.viewer-navbar');
    if (vNavbar) vNavbar.style.display = '';
    var bar = c.querySelector('.bq-annot-toolbar');
    if (bar) bar.parentNode.removeChild(bar);
    _active.annot = null;
    _active.strokes = [];
    _syncAnnotToggle(false);
  }

  function _syncAnnotToggle(on) {
    var btn = document.querySelector('[data-bq-annot-toggle]');
    if (!btn) return;
    btn.textContent = on ? '✎ 完成标注' : '✎ 标注';
    if (on) btn.classList.add('bq-iv-btn-active');
    else btn.classList.remove('bq-iv-btn-active');
  }

  var ANNOT_TOOLS = [
    { key: 'pen', label: '✎ 画笔', title: '自由画笔' },
    { key: 'arrow', label: '➜ 箭头', title: '箭头' },
    { key: 'rect', label: '▭ 矩形', title: '矩形框' },
    { key: 'ellipse', label: '◯ 椭圆', title: '椭圆圈选' }
  ];
  // 标注色板取自 css/figure-viewer.css 中的全局 token（--bq-annot-*），
  // JS 内不出现硬编码色值；token 缺失时退回 canvas 命名色
  var ANNOT_COLOR_TOKENS = [
    '--bq-annot-red', '--bq-annot-yellow', '--bq-annot-green',
    '--bq-annot-blue', '--bq-annot-white'
  ];
  var ANNOT_COLOR_FALLBACK = ['red', 'gold', 'limegreen', 'dodgerblue', 'white'];

  function _annotColors() {
    var out = [];
    try {
      var cs = window.getComputedStyle(document.documentElement);
      ANNOT_COLOR_TOKENS.forEach(function (t) {
        var v = cs.getPropertyValue(t);
        if (v && v.trim()) out.push(v.trim());
      });
    } catch (e) { /* 样式未就绪 */ }
    return out.length ? out : ANNOT_COLOR_FALLBACK.slice();
  }

  function _buildAnnotateToolbar() {
    if (!_active) return;
    var bar = document.createElement('div');
    bar.className = 'bq-annot-toolbar';

    ANNOT_TOOLS.forEach(function (t) {
      var b = _btn(t.label, t.title, function () {
        _active.tool = t.key;
        var all = bar.querySelectorAll('[data-bq-tool]');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('bq-iv-btn-active');
        b.classList.add('bq-iv-btn-active');
      }, { dataset: { 'data-bq-tool': t.key } });
      if (t.key === _active.tool) b.classList.add('bq-iv-btn-active');
      bar.appendChild(b);
    });

    bar.appendChild(_sep());

    var sw = document.createElement('div');
    sw.className = 'bq-annot-swatches';
    var palette = _annotColors();
    if (!_active.color) _active.color = palette[0];
    palette.forEach(function (col, i) {
      var s = document.createElement('button');
      s.type = 'button';
      s.className = 'bq-annot-swatch' + ((col === _active.color) ? ' bq-annot-swatch-active' : '');
      s.style.background = col;
      s.title = '颜色';
      s.setAttribute('data-bq-color', col);
      s.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!_active) return;
        _active.color = col;
        var all = sw.querySelectorAll('.bq-annot-swatch');
        for (var k = 0; k < all.length; k++) all[k].classList.remove('bq-annot-swatch-active');
        s.classList.add('bq-annot-swatch-active');
      });
      sw.appendChild(s);
    });
    bar.appendChild(sw);

    bar.appendChild(_sep());
    bar.appendChild(_btn('细', '细线', function () {
      if (_active) _active.thick = false;
    }));
    bar.appendChild(_btn('粗', '粗线', function () {
      if (_active) _active.thick = true;
    }));

    bar.appendChild(_sep());
    bar.appendChild(_btn('↶ 撤销', '撤销上一笔', function () {
      if (!_active || !_active.strokes.length) return;
      _active.strokes.pop();
      _redraw();
    }));
    bar.appendChild(_btn('✕ 清空', '清除全部标注', function () {
      if (!_active) return;
      _active.strokes = [];
      _redraw();
    }));

    bar.appendChild(_sep());
    bar.appendChild(_btn('⤓ 下载标注图', '导出标注合成图（原图不受影响）', function () {
      _exportAnnotated();
    }));
    bar.appendChild(_btn('完成', '退出标注模式', function () {
      _exitAnnotate();
    }));

    _active.container.appendChild(bar);
  }

  function _strokeWidth(annot) {
    var base = Math.max(annot.viewW || 600, 300);
    return _active.thick ? Math.max(5, base / 150) : Math.max(2.5, base / 320);
  }

  function _pos(e) {
    var annot = _active.annot;
    var rect = annot.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * annot.viewW,
      y: ((e.clientY - rect.top) / rect.height) * annot.viewH
    };
  }

  function _drawStroke(ctx, s, scale) {
    scale = scale || 1;
    var pts = s.pts || [];
    if (!pts.length) return;
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (s.tool === 'pen') {
      ctx.beginPath();
      ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * scale, pts[i].y * scale);
      ctx.stroke();
    } else if (s.tool === 'rect') {
      if (pts.length < 2) { ctx.restore(); return; }
      ctx.strokeRect(pts[0].x * scale, pts[0].y * scale,
        (pts[1].x - pts[0].x) * scale, (pts[1].y - pts[0].y) * scale);
    } else if (s.tool === 'ellipse') {
      if (pts.length < 2) { ctx.restore(); return; }
      var cx = (pts[0].x + pts[1].x) / 2 * scale;
      var cy = (pts[0].y + pts[1].y) / 2 * scale;
      var rx = Math.abs(pts[1].x - pts[0].x) / 2 * scale;
      var ry = Math.abs(pts[1].y - pts[0].y) / 2 * scale;
      ctx.beginPath();
      if (typeof ctx.ellipse === 'function') {
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      } else {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(rx || 1, ry || 1);
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.restore();
      }
      ctx.stroke();
    } else if (s.tool === 'arrow') {
      if (pts.length < 2) { ctx.restore(); return; }
      var x1 = pts[0].x * scale, y1 = pts[0].y * scale;
      var x2 = pts[1].x * scale, y2 = pts[1].y * scale;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      var ang = Math.atan2(y2 - y1, x2 - x1);
      var head = (s.width * scale) * 3;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 7), y2 - head * Math.sin(ang - Math.PI / 7));
      ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 7), y2 - head * Math.sin(ang + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function _redraw() {
    if (!_active || !_active.annot) return;
    var a = _active.annot;
    var ctx = a.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, a.canvas.width, a.canvas.height);
    ctx.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
    _active.strokes.forEach(function (s) { _drawStroke(ctx, s, 1); });
  }

  function _bindAnnotateDrawing() {
    var annot = _active.annot;
    var canvas = annot.canvas;

    function down(e) {
      if (!e.isPrimary) return;
      e.preventDefault();
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      annot.drawing = true;
      annot.current = {
        tool: _active.tool,
        color: _active.color,
        width: _strokeWidth(annot),
        pts: [_pos(e)]
      };
      annot.ctx.setTransform(annot.dpr, 0, 0, annot.dpr, 0, 0);
    }

    function move(e) {
      if (!annot.drawing || !annot.current) return;
      e.preventDefault();
      var p = _pos(e);
      var cur = annot.current;
      if (cur.tool === 'pen') cur.pts.push(p);
      else cur.pts[1] = p;
      _redraw();
      _drawStroke(annot.ctx, cur, 1);
    }

    function up(e) {
      if (!annot.drawing) return;
      annot.drawing = false;
      var cur = annot.current;
      annot.current = null;
      if (!cur) return;
      if (cur.tool !== 'pen' && cur.pts.length < 2) { _redraw(); return; }
      if (cur.tool === 'pen' && cur.pts.length < 2) { _redraw(); return; }
      _active.strokes.push(cur);
      _redraw();
      try { canvas.releasePointerCapture && canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    }

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', function (e) {
      if (annot.drawing) up(e);
    });
  }

  /**
   * 导出标注合成图：原图 + 标注层在本机 canvas 合成后下载。
   * 原图文件不会被读取之外的任何方式处理，绝不回写。
   */
  function _exportAnnotated() {
    if (!_active) return;
    var src = _active.src;
    var strokes = (_active.strokes || []).slice();

    if (!_active.annot || !strokes.length) {
      _downloadOriginal(src);
      if (typeof window.showToast === 'function') {
        window.showToast(_active.annot ? '还没有标注内容，已下载原图' : '已进入标注后再导出可得到标注图');
      }
      return;
    }

    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var W = img.naturalWidth || img.width;
      var H = img.naturalHeight || img.height;
      var out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      var ctx = out.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);

      // 标注层按比例铺满原图尺寸
      var a = _active.annot;
      var scale = W / (a.viewW || W);
      strokes.forEach(function (s) { _drawStroke(ctx, s, scale); });

      var name = _basename(src).replace(/\.[a-z0-9]+$/i, '') + '-标注.png';
      if (out.toBlob) {
        out.toBlob(function (blob) {
          if (blob) _download(blob, name);
          else _downloadOriginal(src);
        }, 'image/png');
      } else {
        try {
          var data = out.toDataURL('image/png');
          var bin = atob(data.split(',')[1]);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          _download(new Blob([arr], { type: 'image/png' }), name);
        } catch (e) {
          _downloadOriginal(src);
        }
      }
    };
    img.onerror = function () {
      if (typeof window.showToast === 'function') window.showToast('原图加载失败，无法导出标注图');
      _downloadOriginal(src);
    };
    img.src = src;
  }

  /* ============================================================
   * 4. 全局挂载
   * ============================================================ */

  var api = {
    of: figureSrcOf,
    render: renderFigure,
    renderChart: renderChartUnified,
    html: figureHTML,
    open: openViewer,
    retry: retryImg
  };

  if (typeof window !== 'undefined') {
    window.BioQuestFigure = api;
    if (window.TATABOX) window.TATABOX.figureViewer = api;
  }

  _bindImagePipeline();

  // Esc：标注模式下先退出标注；否则由统一的 _requestClose 关闭（带兜底）
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!_active) return;
      if (_active.annot) {
        e.stopImmediatePropagation();
        _exitAnnotate();
      } else {
        e.stopImmediatePropagation();
        _requestClose();
      }
    }, true);
  }
})();
