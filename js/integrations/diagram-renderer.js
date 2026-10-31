/**
 * TATABOX — 图表渲染集成模块（Mermaid）
 * 把文本格式图表（流程图/时序图/类图等）渲染为 SVG
 * 依赖：js/vendor/mermaid.min.js -> window.mermaid
 * 注：P0 性能优化——mermaid 首屏不再预载，改为按需惰性加载；
 *     mermaid.initialize 由 vendor-init.js 在启动期调用，此处仅在尚未初始化时兜底。
 */
(function () {
  'use strict';

  var _seq = 0;
  var _pendingRenders = {};  // id -> { code, container }

  // P0 性能优化：mermaid 从首屏 defer 移除后，在这里按需惰性加载。
  // 走统一 loadScriptOnce（带去重与超时），零依赖；同名脚本重复请求会被去重。
  var _loadingMermaid = false;
  function loadMermaid() {
    if (typeof window.mermaid !== 'undefined') return Promise.resolve(true);
    if (typeof window.loadScriptOnce !== 'function') return Promise.resolve(false);
    return window.loadScriptOnce('js/vendor/mermaid.min.js?v=20260723d')
      .then(function () { return typeof window.mermaid !== 'undefined'; })
      .catch(function () { return false; });
  }

  function ensureMermaid() {
    if (typeof window.mermaid === 'undefined') {
      console.warn('[DiagramRenderer] mermaid 未加载');
      return false;
    }
    return true;
  }

  function ensureInit() {
    if (!ensureMermaid()) return false;
    // 若 vendor-init 尚未调用 initialize，这里兜底
    if (!window.mermaid._bioquestInit) {
      try {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'strict',
          fontFamily: 'inherit'
        });
        window.mermaid._bioquestInit = true;
      } catch (e) {
        console.warn('[DiagramRenderer] mermaid.initialize 失败:', e);
        return false;
      }
    }
    return true;
  }

  /**
   * 渲染单张 mermaid 图表
   * @param {string} containerId 容器元素 id
   * @param {string} code mermaid 文本
   * @param {object} opts { theme }
   * @returns {Promise<string|null>} SVG 字符串
   */
  function render(containerId, code, opts) {
    if (typeof window.mermaid === 'undefined') {
      // P0 性能优化：mermaid 尚未加载则按需下载，完成后重入渲染。
      // 避免并发重复触发（用 _loadingMermaid 去重）。
      if (typeof window.loadScriptOnce !== 'function' || _loadingMermaid) {
        return Promise.resolve(null);
      }
      _loadingMermaid = true;
      return loadMermaid().then(function (loaded) {
        _loadingMermaid = false;
        if (loaded) return render(containerId, code, opts);
        var c = document.getElementById(containerId);
        if (c) c.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px;">图表组件未加载</p>';
        return null;
      });
    }
    var container = document.getElementById(containerId);
    if (!container) {
      console.warn('[DiagramRenderer] 容器不存在:', containerId);
      return Promise.resolve(null);
    }
    if (!ensureInit()) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px;">图表组件未加载</p>';
      return Promise.resolve(null);
    }
    opts = opts || {};
    var theme = opts.theme || 'default';
    var diagramId = 'mmd-' + (++_seq);

    // 重置容器
    container.innerHTML = '';
    container.removeAttribute('data-processed');

    return new Promise(function (resolve) {
      // mermaid.parse 检查语法
      // 10.x：parse(code) 返回 Promise（成功 resolve / 失败 reject，不再同步抛错）
      // 9.x ：parse(code) 同步抛错，或返回 false 表示语法错误
      var parseResult;
      try {
        parseResult = window.mermaid.parse(code);
      } catch (parseErr) {
        // 兼容旧版 API：parse 抛错
        container.innerHTML = '<p style="color:var(--color-error);padding:12px;">Mermaid 语法错误：' + escapeHtml((parseErr && parseErr.message) || '') + '</p>';
        resolve(null);
        return;
      }

      // 真正执行渲染的逻辑（语法校验通过后调用）
      var doRender = function () {
        try {
          // mermaid.render(id, code)：10.x 返回 Promise<{svg, bindFunctions}>，9.x 同步返回 SVG 字符串
          var result = window.mermaid.render.call(window.mermaid, diagramId, code);
          if (result && typeof result.then === 'function') {
            result.then(function (out) {
              var svg = (out && (out.svg || out)) || '';
              // 插入 DOM 前必须经过 DOMPurify 消毒（mermaid 支持 foreignObject HTML 注入）
              var safe = sanitizeSvg(svg);
              container.innerHTML = safe;
              resolve(safe || null);
            }).catch(function (err) {
              container.innerHTML = '<p style="color:var(--color-error);padding:12px;">渲染失败：' + escapeHtml((err && err.message) || '') + '</p>';
              resolve(null);
            });
          } else {
            // 9.x 同步返回 SVG 字符串
            var safeSync = sanitizeSvg(result);
            container.innerHTML = safeSync;
            resolve(safeSync || null);
          }
        } catch (e) {
          container.innerHTML = '<p style="color:var(--color-error);padding:12px;">渲染异常：' + escapeHtml((e && e.message) || '') + '</p>';
          resolve(null);
        }
      };

      if (parseResult && typeof parseResult.then === 'function') {
        // 10.x：parse 返回 Promise，按 resolve / reject 处理
        parseResult.then(doRender).catch(function (parseErr) {
          container.innerHTML = '<p style="color:var(--color-error);padding:12px;">Mermaid 语法错误：' + escapeHtml((parseErr && parseErr.message) || '') + '</p>';
          resolve(null);
        });
      } else if (parseResult === false) {
        // 9.x：parse 返回 false 表示语法错误
        container.innerHTML = '<p style="color:var(--color-error);padding:12px;">Mermaid 语法错误</p>';
        resolve(null);
      } else {
        // 9.x：parse 成功（返回 undefined / true）
        doRender();
      }
    });
  }

  /**
   * 批量渲染页面内所有 <div class="mermaid"> 或 <pre data-mermaid>
   */
  function renderAll(selector) {
    selector = selector || '.mermaid, pre[data-mermaid]';
    if (typeof window.mermaid === 'undefined') {
      // P0 性能优化：mermaid 尚未加载则按需下载，完成后重入。
      if (typeof window.loadScriptOnce !== 'function') return Promise.resolve([]);
      return loadMermaid().then(function (loaded) {
        return loaded ? renderAll(selector) : [];
      });
    }
    if (!ensureInit()) return Promise.resolve([]);
    var nodes = document.querySelectorAll(selector);
    var promises = [];
    nodes.forEach(function (node, idx) {
      var id = node.id || ('mmd-auto-' + idx);
      node.id = id;
      var code = node.getAttribute('data-mermaid-code') || node.textContent || '';
      if (node.tagName === 'PRE') {
        // 替换为 div 容器
        var div = document.createElement('div');
        div.id = id;
        div.className = 'mermaid-rendered';
        node.parentNode.replaceChild(div, node);
        node = div;
      }
      promises.push(render(id, code));
    });
    return Promise.all(promises);
  }

  /**
   * 常用图表模板：DNA 复制流程、细胞分裂、生态系统能量流动等
   */
  var TEMPLATES = {
    dnaReplication: 'sequenceDiagram\n' +
      '  participant D as DNA 双螺旋\n' +
      '  participant H as 解旋酶\n' +
      '  participant P as DNA 聚合酶\n' +
      '  D->>H: 识别起始位点\n' +
      '  H->>D: 断开氢键解旋\n' +
      '  P->>D: 以母链为模板合成子链\n' +
      '  P->>D: 校对修复错配\n' +
      '  Note over D: 形成 2 个相同 DNA 分子',
    mitosis: 'stateDiagram-v2\n' +
      '  [*] --> 间期\n' +
      '  间期 --> 前期: 染色质凝缩\n' +
      '  前期 --> 中期: 染色体排列赤道板\n' +
      '  中期 --> 后期: 姐妹染色单体分离\n' +
      '  后期 --> 末期: 染色体解聚\n' +
      '  末期 --> [*]: 形成两个子细胞',
    energyFlow: 'graph LR\n' +
      '  A[太阳] -->|辐射能| B[生产者]\n' +
      '  B -->|10%| C[初级消费者]\n' +
      '  C -->|10%| D[次级消费者]\n' +
      '  D -->|10%| E[三级消费者]\n' +
      '  B -.->|呼吸| F[热散失]\n' +
      '  C -.->|呼吸| F\n' +
      '  D -.->|呼吸| F\n' +
      '  E -.->|分解| G[分解者]'
  };

  var escapeHtml = window.escapeHtml;

  /**
   * 用 DOMPurify 消毒 mermaid 输出的 SVG 字符串
   * mermaid 支持 <foreignObject> 内嵌 HTML，直接 innerHTML 会有 XSS 风险，
   * 插入 DOM 前必须经过消毒。依赖：js/vendor/purify.min.js -> window.DOMPurify
   */
  function sanitizeSvg(svg) {
    if (!svg || typeof svg !== 'string') return '';
    if (typeof window.DOMPurify !== 'undefined' && typeof window.DOMPurify.sanitize === 'function') {
      return window.DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true }
      });
    }
    // M-05：fail-closed。只剥离 <script> 挡不住 onload/foreignObject 等注入向量，
    // 因此 DOMPurify 缺失时宁可不渲染图表，也不插入未消毒 SVG。
    console.warn('[DiagramRenderer] DOMPurify 未加载，已跳过 SVG 渲染');
    return '';
  }

  /**
   * 图表渲染模块对外接口，基于 Mermaid 将文本图表渲染为 SVG，并提供模板与可用性检测。
   * @type {Object}
   */
  window.DiagramRenderer = {
    render: render,
    renderAll: renderAll,
    TEMPLATES: TEMPLATES,
    isAvailable: ensureMermaid
  };
})();
