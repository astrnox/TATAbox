/**
 * TATABOX — 3D 分子查看器集成模块（3Dmol.js）
 */
(function () {
  'use strict';

  var PDB_PRESETS = {
    '1BNA': 'DNA 双螺旋（B 型）',
    '1MBN': '肌红蛋白（Myoglobin）',
    '1HHO': '血红蛋白（Hemoglobin）',
    '1CRN': '膜蛋白（Crambin）',
    '6LU7': '新冠病毒主蛋白酶',
    '1AKE': '腺苷酸激酶（Adenylate Kinase）',
    '2DN2': 'DNA 结合蛋白',
    '1IGT': '抗体（IgG）'
  };

  var _currentViewer = null;
  var _currentPdbId = null;

  // P0 性能优化：three.min.js / 3Dmol-min.js 不再于首屏预载，改为点击预览时按需加载。
  // 走统一 loadScriptOnce（带去重与超时），零依赖；保持与首屏 boot 一致的加载顺序（THREE 先于 3Dmol）。
  var _loading3Dmol = false;
  function load3Dmol() {
    if (typeof window.$3Dmol !== 'undefined') return Promise.resolve(true);
    if (typeof window.loadScriptOnce !== 'function') return Promise.resolve(false);
    return window.loadScriptOnce('js/vendor/three.min.js?v=20260723d')
      .then(function () { return window.loadScriptOnce('js/vendor/3Dmol-min.js?v=20260723d'); })
      .then(function () { return typeof window.$3Dmol !== 'undefined'; })
      .catch(function () { return false; });
  }

  function destroyViewer(container) {
    if (!container) return;
    var v = container._bioquestViewer;
    if (v) {
      try { if (typeof v.clear === 'function') v.clear(); } catch (e) {}
      // 主动释放 WebGL context，防止多次进出页面耗尽 GPU 资源
      try {
        var canvas = container.querySelector('canvas');
        if (canvas) {
          var gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          if (gl) {
            var loseExt = gl.getExtension('WEBGL_lose_context');
            if (loseExt && typeof loseExt.loseContext === 'function') loseExt.loseContext();
          }
        }
      } catch (e) {}
      container._bioquestViewer = null;
    }
    container.replaceChildren();
  }

  function render(containerId, pdbData, opts) {
    if (typeof window.$3Dmol === 'undefined') {
      console.warn('[MoleculeViewer] 3Dmol.js 未加载');
      var el = document.getElementById(containerId);
      if (el) el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">3D 分子查看器未加载</p>';
      return null;
    }
    var container = document.getElementById(containerId);
    if (!container) return null;

    opts = opts || {};
    var style = opts.style || 'cartoon';
    var bgColor = opts.bgColor || '#faf7f2';

    destroyViewer(container); // 防止重复挂载到同一容器：先清理旧 viewer 及 WebGL context
    container.style.position = 'relative';

    try {
      var viewer = window.$3Dmol.createViewer(container, {
        backgroundColor: bgColor,
        antialias: true
      });
      container._bioquestViewer = viewer;

      var isPdbId = typeof pdbData === 'string' && /^[1-9][A-Za-z0-9]{3}$/.test(pdbData);

      if (isPdbId) {
        viewer.addModel('', 'pdb');
        var loaded = false;
        var timeoutId = setTimeout(function () {
          if (!loaded) {
            destroyViewer(container);
            container.innerHTML = '<p style="color:var(--color-error);text-align:center;padding:40px;">加载超时：PDB ' + pdbData + '</p>';
          }
        }, 15000);

        window.$3Dmol.download('pdb:' + pdbData, viewer, {}, function () {
          if (loaded) return;
          clearTimeout(timeoutId);
          var hasAtoms = false;
          try {
            var m = viewer.getModel();
            // 3Dmol API：模型数据存在 m.atoms 数组（无 numAtoms() 方法）
            if (m) {
              if (Array.isArray(m.atoms)) hasAtoms = m.atoms.length > 0;
              else if (typeof m.selectedAtoms === 'function') {
                hasAtoms = m.selectedAtoms({}).length > 0;
              }
            }
          } catch (e) {}

          if (!hasAtoms) {
            destroyViewer(container);
            container.innerHTML = '<p style="color:var(--color-error);text-align:center;padding:40px;">加载失败：PDB ' + pdbData + '</p>';
            return;
          }
          loaded = true;
          applyStyle(viewer, style);
          viewer.zoomTo();
          viewer.render();
        });
      } else {
        viewer.addModel(pdbData, 'pdb');
        applyStyle(viewer, style);
        viewer.zoomTo();
        viewer.render();
      }

      return viewer;
    } catch (e) {
      console.error('[MoleculeViewer] 渲染失败:', e);
      container.innerHTML = '<p style="color:var(--color-error);text-align:center;padding:40px;">分子结构加载失败</p>';
      return null;
    }
  }

  function applyStyle(viewer, style) {
    switch (style) {
      case 'cartoon':
        viewer.setStyle({}, { cartoon: { color: 'spectrum' } });
        break;
      case 'stick':
        viewer.setStyle({}, { stick: {} });
        break;
      case 'sphere':
        viewer.setStyle({}, { sphere: { scale: 0.25 } });
        break;
      case 'line':
        viewer.setStyle({}, { line: {} });
        break;
      default:
        viewer.setStyle({}, { cartoon: { color: 'spectrum' }, stick: { radius: 0.1 } });
    }
  }

  function getPresets() {
    return Object.keys(PDB_PRESETS).map(function (id) {
      return { id: id, name: PDB_PRESETS[id] };
    });
  }

  /**
   * 3D 分子查看器模块对外接口，基于 3Dmol.js 渲染 PDB 预设分子结构并提供预设列表。
   * @type {Object}
   */
  window.MoleculeViewer = {
    render: render,
    getPresets: getPresets,
    PRESETS: PDB_PRESETS
  };

  function renderMoleculesPage(target) {
    if (!target) return;
    var presets = getPresets();
    var cardsHtml = presets.map(function (p) {
      return '<div class="molecule-card" data-pdb="' + p.id + '" style="background:var(--surface-primary,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:var(--radius-lg, 12px);padding:20px;cursor:pointer;">' +
        '<div style="font-family:var(--font-mono,monospace);font-size:0.78rem;color:var(--color-amber,#c4956a);font-weight:700;">' + p.id + '</div>' +
        '<div style="font-family:var(--font-serif,serif);font-size:1rem;font-weight:600;color:var(--color-deep,#1a3a2a);margin:6px 0;">' + p.name + '</div>' +
        '<div style="font-size:0.78rem;color:var(--text-muted,#8a8a8a);">点击查看 3D 结构</div>' +
        '</div>';
    }).join('');

    target.innerHTML =
      '<div style="max-width:900px;margin:0 auto;padding:24px 20px 80px;">' +
      '<h1 style="font-family:var(--font-serif,serif);font-size:1.8rem;color:var(--color-deep,#1a3a2a);margin-bottom:8px;">3D 分子查看器</h1>' +
      '<p style="color:var(--text-muted,#8a8a8a);font-size:0.9rem;margin-bottom:24px;">基于 3Dmol.js（BSD-3-Clause）渲染蛋白质/DNA 3D 结构</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:32px;">' + cardsHtml + '</div>' +
      '<div id="molecule-viewer-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;align-items:center;justify-content:center;">' +
        '<div style="background:#fff;border-radius:16px;padding:16px;width:90%;max-width:700px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<h3 id="molecule-modal-title" style="font-family:var(--font-serif,serif);font-size:1.2rem;color:var(--color-deep,#1a3a2a);"></h3>' +
            '<button id="molecule-close-btn" style="background:none;border:none;font-size:1.5rem;cursor:pointer;">×</button>' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">' +
            '<button class="mol-style-btn" data-style="cartoon" style="padding:6px 12px;border:1px solid var(--border-light,#ece8e1);background:var(--surface-primary,#fff);border-radius:8px;cursor:pointer;font-size:0.85rem;">卡通</button>' +
            '<button class="mol-style-btn" data-style="stick" style="padding:6px 12px;border:1px solid var(--border-light,#ece8e1);background:var(--surface-primary,#fff);border-radius:8px;cursor:pointer;font-size:0.85rem;">球棍</button>' +
            '<button class="mol-style-btn" data-style="line" style="padding:6px 12px;border:1px solid var(--border-light,#ece8e1);background:var(--surface-primary,#fff);border-radius:8px;cursor:pointer;font-size:0.85rem;">线框</button>' +
            '<button class="mol-style-btn" data-style="sphere" style="padding:6px 12px;border:1px solid var(--border-light,#ece8e1);background:var(--surface-primary,#fff);border-radius:8px;cursor:pointer;font-size:0.85rem;">空间填充</button>' +
          '</div>' +
          '<div id="molecule-3d-container" style="width:100%;height:500px;background:#faf7f2;border-radius:8px;"></div>' +
        '</div>' +
      '</div>' +
      '</div>';

    var cards = document.querySelectorAll('.molecule-card');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        var pdbId = card.getAttribute('data-pdb');
        var nameEl = card.querySelector('div:nth-child(2)');
        var name = nameEl ? nameEl.textContent : (PDB_PRESETS[pdbId] || pdbId);
        openMoleculeModal(pdbId, name);
      });
    });

    var closeBtn = document.getElementById('molecule-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeMoleculeModal);

    var modal = document.getElementById('molecule-viewer-modal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeMoleculeModal();
      });
    }

    var styleBtns = document.querySelectorAll('.mol-style-btn');
    styleBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!_currentViewer) return;
        var style = btn.getAttribute('data-style');
        try {
          applyStyle(_currentViewer, style);
          _currentViewer.zoomTo();
          _currentViewer.render();
        } catch (e) {}
      });
    });
  }

  function openMoleculeModal(pdbId, name) {
    var modal = document.getElementById('molecule-viewer-modal');
    var title = document.getElementById('molecule-modal-title');
    if (!modal) return;
    modal.style.display = 'flex';
    if (title) title.textContent = name + ' (' + pdbId + ')';
    _currentPdbId = pdbId;

    var container = document.getElementById('molecule-3d-container');
    var showPlaceholder = function () {
      if (container) container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">3D 分子查看器未加载</p>';
    };

    if (typeof window.$3Dmol === 'undefined') {
      // P0 性能优化：点击预览时才按需加载 three/3Dmol，加载完成后重入渲染
      if (typeof window.loadScriptOnce !== 'function' || _loading3Dmol) return showPlaceholder();
      _loading3Dmol = true;
      load3Dmol().then(function (ok) {
        _loading3Dmol = false;
        if (!ok) { showPlaceholder(); return; }
        // 防止用户期间切换了分子
        if (_currentPdbId !== pdbId) return;
        try { _currentViewer = render('molecule-3d-container', pdbId, { style: 'cartoon' }); }
        catch (e) { showPlaceholder(); }
      });
      return;
    }
    _currentViewer = render('molecule-3d-container', pdbId, { style: 'cartoon' });
  }

  function closeMoleculeModal() {
    var modal = document.getElementById('molecule-viewer-modal');
    if (modal) modal.style.display = 'none';
    var container = document.getElementById('molecule-3d-container');
    if (container) destroyViewer(container);
    _currentViewer = null;
    _currentPdbId = null;
  }

  /**
   * 渲染 3D 分子查看器页面入口，构建预设分子卡片列表与查看器容器。
   * @function
   * @param {HTMLElement} target - 挂载容器
   * @returns {void}
   */
  window.renderMoleculesPage = renderMoleculesPage;
  /**
   * 哈希路由入口：根据路由与容器初始化 3D 分子查看器页面。
   * @function
   * @param {string} route - 哈希路由
   * @param {HTMLElement} target - 挂载容器
   * @returns {void}
   */
  window.initMolecules = function (route, target) {
    renderMoleculesPage(target);
  };
})();
