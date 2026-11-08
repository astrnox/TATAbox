/**
 * TATABOX — Excalidraw 手绘白板集成模块
 * 依赖顺序：React → ReactDOM → jsx-runtime polyfill → Excalidraw
 * 全部懒加载，仅在用户首次访问手绘页时按顺序注入
 */
(function () {
  'use strict';

  var VENDOR_BASE = 'js/vendor/';
  var V = '20260723d';
  var LOADED = { react: false, jsx: false, reactDom: false, excalidraw: false };
  var LOADING_PROMISE = null;
  var _mountedRoot = null;

  function loadScript(src) {
    return window.loadScriptOnce(src);
  }

  function ensureLoaded() {
    if (LOADED.react && LOADED.jsx && LOADED.reactDom && LOADED.excalidraw) {
      return Promise.resolve();
    }
    if (LOADING_PROMISE) return LOADING_PROMISE;

    LOADING_PROMISE = (function () {
      // 顺序加载，避免 React 未就绪时 Excalidraw 注册失败
      // polyfill 必须在 react 与 react-dom 之后加载
      var chain = Promise.resolve();
      if (!LOADED.react) {
        chain = chain.then(function () {
          return loadScript(VENDOR_BASE + 'react.production.min.js?v=' + V);
        }).then(function () {
          if (typeof window.React === 'undefined') throw new Error('React 未挂载到 window');
          LOADED.react = true;
        });
      }
      if (!LOADED.reactDom) {
        chain = chain.then(function () {
          return loadScript(VENDOR_BASE + 'react-dom.production.min.js?v=' + V);
        }).then(function () {
          if (typeof window.ReactDOM === 'undefined') throw new Error('ReactDOM 未挂载');
          LOADED.reactDom = true;
        });
      }
      if (!LOADED.jsx) {
        chain = chain.then(function () {
          return loadScript(VENDOR_BASE + 'react-jsx-runtime-polyfill.js?v=' + V);
        }).then(function () {
          if (typeof window.ReactJSXRuntime === 'undefined') throw new Error('jsx-runtime polyfill 未挂载');
          LOADED.jsx = true;
        });
      }
      if (!LOADED.excalidraw) {
        chain = chain.then(function () {
          return loadScript(VENDOR_BASE + 'excalidraw.production.min.js?v=' + V);
        }).then(function () {
          // Excalidraw UMD 挂载到 window.ExcalidrawLib
          if (typeof window.ExcalidrawLib === 'undefined') throw new Error('ExcalidrawLib 未挂载');
          LOADED.excalidraw = true;
        });
      }
      return chain;
    })();

    LOADING_PROMISE.catch(function (e) {
      console.error('[SketchPad] 依赖加载失败:', e.message);
      LOADING_PROMISE = null; // 允许下次重试
    });
    return LOADING_PROMISE;
  }

  /**
   * 在指定容器内挂载 Excalidraw
   * @param {string} containerId 容器元素 id
   * @param {object} opts { initialData, onChange }
   * @returns {Promise<object>} { setTheme, exportPng, destroy }
   */
  function mount(containerId, opts) {
    opts = opts || {};
    var container = document.getElementById(containerId);
    if (!container) {
      console.warn('[SketchPad] 容器不存在:', containerId);
      return Promise.resolve(null);
    }

    return ensureLoaded().then(function () {
      unmount(container); // 清理旧实例

      var React = window.React;
      var ReactDOM = window.ReactDOM;
      var ExcalidrawLib = window.ExcalidrawLib;
      var Excalidraw = ExcalidrawLib.Excalidraw;

      // 包裹一层 div 用于 React root
      var inner = document.createElement('div');
      inner.style.width = '100%';
      inner.style.height = '100%';
      inner.style.minHeight = '500px';
      container.appendChild(inner);

      var currentData = opts.initialData || null;
      var currentTheme = 'light';

      // Excalidraw 不接收 ref，需通过 excalidrawAPI 回调拿到命令式 API
      var excalidrawApi = null;
      var handleChange = function (elements, appState, files) {
        currentData = { elements: elements, appState: appState, files: files };
        if (typeof opts.onChange === 'function') {
          try { opts.onChange(currentData); } catch (e) {}
        }
      };

      var initialProps = {
        initialData: opts.initialData || undefined,
        onChange: handleChange,
        excalidrawAPI: function (api) { excalidrawApi = api; },
        // UIOptions.canvasActions.* 在 Excalidraw 中需要对象形式：
        //   { saveFileToDisk: boolean } 或 { saveToActiveFile: boolean }
        // 不能直接传 boolean（旧版本接受 boolean，新版会报
        //   "Cannot create property 'saveFileToDisk' on boolean 'true'"）
        // 这里直接省略 UIOptions，使用 Excalidraw 默认配置（导出/保存均启用）
      };

      var element = React.createElement(Excalidraw, initialProps, null);
      // React 18 推荐使用 createRoot
      var root;
      try {
        root = ReactDOM.createRoot(inner);
        root.render(element);
      } catch (e) {
        // 兼容 React 17 旧 API
        ReactDOM.render(element, inner);
        root = { _legacy: true };
      }
      _mountedRoot = { root: root, container: inner, parent: container };

      return {
        setTheme: function (theme) {
          currentTheme = theme === 'dark' ? 'dark' : 'light';
          // Excalidraw 通过 updateScene 切换 appState 主题
          try {
            if (excalidrawApi && typeof excalidrawApi.updateScene === 'function') {
              excalidrawApi.updateScene({ appState: { theme: currentTheme } });
            }
          } catch (e) {}
        },
        clear: function () {
          // 通过 Excalidraw API 清空画布元素，无需重新挂载
          try {
            if (excalidrawApi && typeof excalidrawApi.updateScene === 'function') {
              excalidrawApi.updateScene({ elements: [] });
            }
          } catch (e) {}
        },
        getData: function () { return currentData; },
        exportPng: function () {
          if (!window.ExcalidrawLib || !window.ExcalidrawLib.exportToBlob) return Promise.resolve(null);
          var exportOpts = {
            elements: currentData ? currentData.elements : [],
            appState: { exportBackground: true },
            files: currentData ? currentData.files : null
          };
          return window.ExcalidrawLib.exportToBlob(exportOpts).then(function (blob) {
            return URL.createObjectURL(blob);
          }).catch(function (e) {
            console.warn('[SketchPad] PNG 导出失败:', e);
            return null;
          });
        },
        destroy: function () { unmount(container); }
      };
    }).catch(function (e) {
      container.innerHTML = '<p style="color:var(--color-error,#c0392b);text-align:center;padding:40px;">手绘白板加载失败：' + errText(e) + '</p>';
      return null;
    });
  }

  function unmount(container) {
    if (!container) return;
    // _mountedRoot 为模块级单例：无论目标容器是否一致，都先释放旧 root，避免多次挂载泄漏
    if (_mountedRoot) {
      try {
        if (_mountedRoot.root && typeof _mountedRoot.root.unmount === 'function') {
          _mountedRoot.root.unmount();
        } else if (!_mountedRoot.root || _mountedRoot.root._legacy) {
          // React 17：直接清空容器
          try { window.ReactDOM && window.ReactDOM.unmountComponentAtNode(_mountedRoot.container); } catch (e) {}
        }
      } catch (e) {}
      // 若旧 root 挂在别的容器上，一并清空其 DOM
      if (_mountedRoot.parent && _mountedRoot.parent !== container) {
        try { _mountedRoot.parent.replaceChildren(); } catch (e) {}
      }
      _mountedRoot = null;
    }
    container.replaceChildren();
  }

  function renderSketchPadPage(pageEl) {
    if (!pageEl) return;
    pageEl.innerHTML =
      '<div class="container" style="padding:24px 16px 60px;">' +
      '  <h2 style="margin:0 0 8px;font-size:1.6rem;color:var(--color-deep,#1a2f1d);">手绘白板</h2>' +
      '  <p style="margin:0 0 16px;color:var(--text-muted,#6b7280);font-size:.95rem;">使用 Excalidraw 绘制生物结构草图（细胞、器官、DNA 等），支持导出 PNG。</p>' +
      '  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
      '    <button class="btn-primary" id="sketch-export-btn" style="padding:8px 16px;">导出 PNG</button>' +
      '    <button id="sketch-clear-btn" style="padding:8px 16px;background:rgba(26,58,42,0.07);color:var(--color-deep,#1a3a2a);border:1.5px solid var(--border-light,#d6d3cb);border-radius:8px;cursor:pointer;font-size:0.9rem;">清空画板</button>' +
      '    <button id="sketch-theme-btn" style="padding:8px 16px;background:rgba(26,58,42,0.07);color:var(--color-deep,#1a3a2a);border:1.5px solid var(--border-light,#d6d3cb);border-radius:8px;cursor:pointer;font-size:0.9rem;">切换主题</button>' +
      '  </div>' +
      '  <div id="sketch-pad-container" style="width:100%;height:600px;border:1px solid var(--border-light,#e5e7eb);border-radius:8px;overflow:hidden;background:#fff;"></div>' +
      '</div>';

    var instance = null;
    mount('sketch-pad-container', {
      onChange: function () {}
    }).then(function (inst) {
      instance = inst;
    });

    var exportBtn = pageEl.querySelector('#sketch-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        if (!instance) return;
        instance.exportPng().then(function (url) {
          if (!url) { alert('导出失败'); return; }
          var a = document.createElement('a');
          a.href = url;
          a.download = 'bioquest-sketch-' + Date.now() + '.png';
          a.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        });
      });
    }
    var clearBtn = pageEl.querySelector('#sketch-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (instance && typeof instance.clear === 'function') {
          // 通过 Excalidraw API 清空画布，避免重新挂载
          instance.clear();
        }
      });
    }
    var themeBtn = pageEl.querySelector('#sketch-theme-btn');
    var themeState = 'light';
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        themeState = themeState === 'light' ? 'dark' : 'light';
        if (instance) instance.setTheme(themeState);
      });
    }
  }

  /**
   * Excalidraw 手绘白板模块的对外接口，提供依赖懒加载、挂载/卸载及页面渲染能力。
   * @type {Object}
   */
  window.SketchPad = {
    mount: mount,
    unmount: unmount,
    ensureLoaded: ensureLoaded,
    renderSketchPadPage: renderSketchPadPage
  };
  /**
   * 渲染手绘白板页面入口，在目标容器内构建 Excalidraw 编辑器及其工具栏。
   * @function
   * @param {HTMLElement} target - 挂载容器
   * @returns {void}
   */
  window.renderSketchPadPage = renderSketchPadPage;
})();
