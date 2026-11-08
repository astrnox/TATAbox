/**
 * ============================================================
 * TATABOX — AI 对话增强集成（marked）
 *
 * marked (MIT)：UMD markdown 解析器，用于流式渲染 LLM 响应
 *
 * 与现有 tutor.js 协同：
 *   - tutor.js 负责对话管理、API 调用、历史存储
 *   - 本模块提供更高质量的 markdown 渲染
 *   - 流式渲染：增量解析，避免全量重渲染闪烁
 *
 * 设计要点：
 *   - 懒加载：首次 renderMarkdown() 才注入 vendor 脚本
 *   - 增量渲染：累积 buffer，防抖解析（100ms），避免高频重绘
 *   - 安全：marked 默认禁用 HTML，输出经 DOMPurify 消毒
 *   - 兼容：tutor.js 可选择性调用 window.AIChatEnhanced API
 *
 * 注：highlight.js 已移除（生物竞赛场景代码块极少，
 *     marked 的 fenced code 渲染足够，不需要语法高亮）
 * ============================================================
 */
(function () {
  'use strict';

  var _markedLoaded = false;
  var _loadingPromise = null;

  /**
   * 懒加载 marked
   */
  function ensureLoaded() {
    if (_markedLoaded) return Promise.resolve();
    if (_loadingPromise) return _loadingPromise;
    _loadingPromise = _loadScript('js/vendor/marked.umd.js?v=20260723d', function () {
      return typeof window.marked === 'object' && typeof window.marked.parse === 'function';
    }).then(function () {
      _markedLoaded = true;
      // 配置 marked：开启 gfm（支持任务列表）、breaks
      if (window.marked && typeof window.marked.setOptions === 'function') {
        window.marked.setOptions({
          breaks: true,
          gfm: true
        });
      }
    }).catch(function (err) {
      _loadingPromise = null; // 失败后允许重试
      throw err;
    });
    return _loadingPromise;
  }

  function _loadScript(src, verifyFn) {
    return window.loadScriptOnce(src, { verify: verifyFn });
  }


  /**
   * 创建流式 markdown 渲染器
   * @param {string|HTMLElement} container - 容器 ID 或 DOM 元素
   * @param {Object} opts - { debounceMs: 防抖毫秒数(默认100), sanitize: 是否消毒(默认true) }
   * @returns {Object} { append(chunk), flush(), finish(), clear() }
   */
  function createStreamRenderer(container, opts) {
    var el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) throw new Error('容器不存在');

    opts = opts || {};
    var debounceMs = opts.debounceMs !== undefined ? opts.debounceMs : 100;
    var buffer = '';
    var renderTimer = null;
    var isFinished = false;

    function doRender() {
      ensureLoaded().then(function () {
        try {
          var html = window.marked.parse(buffer);
          // M-05：清洗必须是硬约束。DOMPurify 缺失时 fail-closed，
          // 直接按纯文本展示，绝不把 marked 输出原样 innerHTML。
          if (opts.sanitize !== false) {
            if (typeof window.safeHtml !== 'function') {
              // M-05：统一清洗入口缺失时 fail-closed，绝不插入 marked 原始输出
              console.warn('[AIChatEnhanced] safeHtml 未加载，已降级为纯文本渲染');
              el.textContent = buffer;
              return;
            }
            html = window.safeHtml(html, {
              // input 标签用于 GFM 任务列表（- [ ] xxx），必须允许 type/disabled/checked
              ALLOWED_TAGS: ['p','br','strong','em','u','s','sup','sub','ul','ol','li',
                'table','thead','tbody','tr','td','th','img','a','h1','h2','h3','h4','h5','h6',
                'blockquote','pre','code','span','div','hr','del','ins','mark','input'],
              ALLOWED_ATTR: ['href','src','alt','title','class','target','rel',
                'type','disabled','checked']
            });
          }
          // 判断是否跟随滚动（用户上滚阅读时暂停，滚回底部后自动恢复）
          var shouldAutoScroll = _isNearBottom(el);
          el.innerHTML = html;
          // 自动滚动到底部
          if (shouldAutoScroll) {
            el.scrollTop = el.scrollHeight;
          }
        } catch (e) {
          console.warn('[AIChatEnhanced] markdown 渲染失败:', e);
          // 失败时直接显示纯文本
          el.textContent = buffer;
        }
      }).catch(function (err) {
        console.error('[AIChatEnhanced] 加载失败:', err);
        el.innerHTML = '<p class="bq-text-error">渲染引擎加载失败，显示纯文本</p><pre>' +
          _escapeHtml(buffer) + '</pre>';
      });
    }

    function scheduleRender() {
      if (isFinished) return;
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(doRender, debounceMs);
    }

    return {
      /**
       * 追加流式 chunk（如 SSE token）
       */
      append: function (chunk) {
        if (isFinished) return;
        buffer += chunk;
        scheduleRender();
      },
      /**
       * 立即渲染当前 buffer（不等防抖）
       */
      flush: function () {
        if (renderTimer) clearTimeout(renderTimer);
        doRender();
      },
      /**
       * 标记流结束，执行最后一次渲染
       */
      finish: function () {
        isFinished = true;
        if (renderTimer) clearTimeout(renderTimer);
        doRender();
      },
      /**
       * 清空内容
       */
      clear: function () {
        buffer = '';
        isFinished = false;
        if (renderTimer) clearTimeout(renderTimer);
        el.replaceChildren();
      },
      /**
       * 获取当前 buffer
       */
      getBuffer: function () { return buffer; },
      /**
       * 销毁
       */
      destroy: function () {
        if (renderTimer) clearTimeout(renderTimer);
        buffer = '';
      }
    };
  }


  /**
   * 单次渲染 markdown（非流式）
   * @param {string|HTMLElement} container
   * @param {string} markdown
   * @param {Object} opts
   * @returns {Promise<boolean>}
   */
  function renderMarkdown(container, markdown, opts) {
    var el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return Promise.reject(new Error('容器不存在'));

    return ensureLoaded().then(function () {
      try {
        var html = window.marked.parse(markdown);
        if (!opts || opts.sanitize !== false) {
          if (typeof window.safeHtml !== 'function') {
            // M-05：统一清洗入口缺失时 fail-closed
            console.warn('[AIChatEnhanced] safeHtml 未加载，已降级为纯文本渲染');
            el.textContent = markdown;
            return true;
          }
          html = window.safeHtml(html, {
            // input 标签用于 GFM 任务列表（- [ ] xxx），必须允许 type/disabled/checked
            ALLOWED_TAGS: ['p','br','strong','em','u','s','sup','sub','ul','ol','li',
              'table','thead','tbody','tr','td','th','img','a','h1','h2','h3','h4','h5','h6',
              'blockquote','pre','code','span','div','hr','del','ins','mark','input'],
            ALLOWED_ATTR: ['href','src','alt','title','class','target','rel',
              'type','disabled','checked']
          });
        }
        el.innerHTML = html;
        return true;
      } catch (e) {
        console.error('[AIChatEnhanced] 渲染失败:', e);
        el.textContent = markdown;
        return false;
      }
    }).catch(function (err) {
      console.error('[AIChatEnhanced] 引擎加载失败:', err);
      el.textContent = markdown;
      return false;
    });
  }

  /**
   * 判断容器是否贴近底部（用于决定是否自动跟随滚动）
   * 阈值 150px：用户上滚阅读时停止自动滚动，滚回底部后自动恢复跟随
   */
  function _isNearBottom(el) {
    var distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance < 150;
  }

  var _escapeHtml = window.escapeHtml;

  // 暴露到全局
  /**
   * AI 对话增强模块对外接口，基于 marked 提供懒加载、Markdown 渲染与流式增量渲染能力，供 tutor.js 等协同调用。
   * @type {Object}
   */
  window.AIChatEnhanced = {
    ensureLoaded: ensureLoaded,
    isLoaded: function () { return _markedLoaded; },
    createStreamRenderer: createStreamRenderer,
    renderMarkdown: renderMarkdown
  };
})();
