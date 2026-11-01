/**
 * ============================================================
 * TATABOX — 社区模块增强集成（quikchat）
 *
 * quikchat (BSD-2)：轻量实时聊天 UI（5KB gzip）
 *   - 纯 vanilla JS，UMD 加载，全局变量 window.quikchat（构造函数）
 *   - 实际 API（已核对源码）：
 *       构造： new quikchat(selector, options)
 *              options = { theme, titleArea:{title,show,align}, messagesArea,
 *                          inputArea, userID, trackHistory, showTimestamps, ... }
 *              theme 默认 "quikchat-theme-light"（CSS class 名，非 "light"）
 *       添加消息： instance.messageAddFull({content, userString, align, role})
 *       清空历史： instance.historyClear()
 *       导出历史： instance.historyExport()
 *       导入历史： instance.historyImport(historyJson)
 *       发送回调： instance.setCallbackOnSend(fn)  // 非构造选项
 *       Markdown： instance.setMessageFormatter(fn) // 非构造选项
 *       主题切换： instance.changeTheme(themeName)
 *       注：无 destroy() 方法，销毁需手动清 DOM
 *
 * 设计：
 *   - quikchat 用于实时讨论区（社区页）
 *   - 懒加载，不阻塞首屏
 *   - 与现有 community.js 协同（不覆盖其功能，提供增强 API）
 *
 * 注：giscus 已移除（与 quikchat 功能重复，且依赖 GitHub 账号）
 * ============================================================
 */
(function () {
  'use strict';

  var V = '20260723d';
  var _quikchatLoaded = false;
  var _quikchatInstance = null;
  var _quikchatContainer = null; // 记录挂载容器，便于销毁时清空


  /**
   * 懒加载 quikchat.js
   */
  function loadQuikchat() {
    if (_quikchatLoaded && typeof window.quikchat === 'function') {
      return Promise.resolve();
    }
    return window.loadScriptOnce('js/vendor/quikchat.umd.min.js?v=' + V, {
      verify: function () { return typeof window.quikchat === 'function'; }
    }).then(function () {
      _quikchatLoaded = true;
    });
  }

  /**
   * 极简 Markdown 渲染（避免引入额外 marked 依赖；quikchat 需要一个 formatter 函数）
   * 仅做必要的子集：粗体、斜体、行内代码、链接、换行。
   * 用户消息内容来源可控，但仍经过 _escapeHtml 防注入。
   */
  var _escapeHtml = window.escapeHtml;
  function _miniMarkdown(text) {
    var html = _escapeHtml(text);
    // 行内代码 `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 粗体 **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 斜体 *text*（避免与粗体冲突，要求 * 后无空白）
    html = html.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
    // 链接 [text](url)（url 仅允许 http(s)/mailto）
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // 换行
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  /**
   * 在指定容器挂载 quikchat 聊天 UI
   * @param {string} containerId - 容器 ID
   * @param {Object} opts - {
   *     title: '聊天室标题',
   *     userName: '当前用户名（映射到 userID）',
   *     storageKey: 'localStorage 键名（持久化历史）',
   *     onSend: function(text) { ... } // 发送消息回调
   *   }
   * @returns {Promise<Object>} 控制器 { sendMessage, clearHistory, destroy, getInstance }
   */
  function mountChat(containerId, opts) {
    var container = document.getElementById(containerId);
    if (!container) return Promise.reject(new Error('容器不存在: ' + containerId));

    opts = opts || {};
    // 先销毁已有实例
    unmountChat();

    return loadQuikchat().then(function () {
      var chat;
      try {
        // 构造参数（已核对 vendor 源码：theme 是 CSS class 名）
        chat = new window.quikchat('#' + containerId, {
          theme: 'quikchat-theme-light',
          titleArea: {
            title: opts.title || '讨论区',
            show: true,
            align: 'left'
          },
          messagesArea: {
            alternating: true
          },
          inputArea: {
            show: true,
            placeholder: '输入消息后回车发送…'
          },
          userID: opts.userName || '匿名用户',
          trackHistory: true,
          showTimestamps: true
        });
      } catch (e) {
        throw new Error('quikchat 构造失败: ' + e.message);
      }

      _quikchatInstance = chat;
      _quikchatContainer = container;

      // 注册发送回调（vendor 用 setCallbackOnSend，非构造选项）
      if (typeof opts.onSend === 'function') {
        try { chat.setCallbackOnSend(opts.onSend); } catch (e) {
          console.warn('[CommunityEnhanced] setCallbackOnSend 失败:', e);
        }
      }

      // 注册 Markdown 渲染器（vendor 用 setMessageFormatter）
      try { chat.setMessageFormatter(_miniMarkdown); } catch (e) {
        console.warn('[CommunityEnhanced] setMessageFormatter 失败:', e);
      }

      // 恢复历史（quikchat 自带 historyExport/historyImport，配合 storageKey 持久化）
      if (opts.storageKey) {
        try {
          var saved = localStorage.getItem(opts.storageKey);
          if (saved) {
            var hist = JSON.parse(saved);
            if (hist && typeof hist === 'object') {
              chat.historyImport(hist);
            }
          }
        } catch (e) {
          console.warn('[CommunityEnhanced] 历史恢复失败:', e);
        }
        // 注册发送后保存历史（onSend 之后还要存）
        var prevOnSend = opts.onSend;
        var storageKey = opts.storageKey;
        try {
          chat.setCallbackOnSend(function (text) {
            if (typeof prevOnSend === 'function') {
              try { prevOnSend(text); } catch (e) {}
            }
            try {
              localStorage.setItem(storageKey, JSON.stringify(chat.historyExport()));
            } catch (e) {}
          });
        } catch (e) {}
      }

      // 返回控制器
      return {
        chat: chat,
        getInstance: function () { return chat; },
        /**
         * 发送一条消息到聊天区
         * @param {string} text - 消息内容
         * @param {string} [fromUser] - 发送者名字（默认 'system'，对齐方向 'left'）
         */
        sendMessage: function (text, fromUser) {
          if (!chat) return;
          try {
            var user = fromUser || 'system';
            // align: 'right' 表示气泡靠右（自己发的），'left' 表示靠左（系统/他人）
            // role: 'user' | 'assistant' | 'system'（影响样式）
            var align = fromUser ? 'left' : 'left';
            var role = fromUser ? 'user' : 'assistant';
            chat.messageAddFull({
              content: String(text == null ? '' : text),
              userString: user,
              align: align,
              role: role
            });
            // 持久化（如果有 storageKey）
            if (opts.storageKey) {
              try {
                localStorage.setItem(opts.storageKey, JSON.stringify(chat.historyExport()));
              } catch (e) {}
            }
          } catch (e) {
            console.warn('[CommunityEnhanced] 发送消息失败:', e);
          }
        },
        clearHistory: function () {
          if (!chat) return;
          try {
            chat.historyClear();
            if (opts.storageKey) {
              localStorage.removeItem(opts.storageKey);
            }
          } catch (e) {
            console.warn('[CommunityEnhanced] clearHistory 失败:', e);
          }
        },
        destroy: function () {
          unmountChat();
        }
      };
    }).catch(function (err) {
      console.error('[CommunityEnhanced] quikchat 挂载失败:', err);
      if (container) {
        container.innerHTML = '<p style="color:var(--color-error,#e53935);text-align:center;padding:40px;">' +
          '聊天室加载失败<br><small class="bq-text-muted">' +
          _escapeHtml(err.message || String(err)) + '</small></p>';
      }
      throw err;
    });
  }

  /**
   * 卸载 quikchat 实例（quikchat 无 destroy 方法，手动清 DOM + 释放引用）
   */
  function unmountChat() {
    // quikchat 没有 destroy()，但内部可能注册了 resize 监听器
    if (_quikchatInstance) {
      try {
        // 尝试常见清理方法（即使 vendor 没有也无害）
        if (typeof _quikchatInstance.setCallbackOnSend === 'function') {
          _quikchatInstance.setCallbackOnSend(function () {});
        }
      } catch (e) {}
      _quikchatInstance = null;
    }
    if (_quikchatContainer) {
      // 清空容器 DOM 即可解除所有内部事件监听（quikchat 把事件绑在容器内 DOM 上）
      _quikchatContainer.replaceChildren();
      _quikchatContainer = null;
    }
  }


  /**
   * 渲染增强版社区页（quikchat 聊天）
   * 现有 community.js 的 renderCommunityPage 仍可用，本方法提供增强版
   */
  function renderCommunityEnhancedPage(target) {
    if (!target) return;
    target.innerHTML =
      '<div style="max-width:1000px;margin:0 auto;padding:24px 20px 80px;">' +
      '<h1 style="font-family:var(--font-serif,serif);font-size:1.8rem;color:var(--color-deep,#1a3a2a);margin-bottom:8px;">学习社区</h1>' +
      '<p style="color:var(--text-muted,#8a8a8a);font-size:0.9rem;margin-bottom:24px;">基于 quikchat（BSD-2）的实时讨论</p>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">' +
        // 左侧：实时聊天
        '<div style="background:var(--surface-primary,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:var(--radius-lg, 12px);padding:20px;">' +
          '<h3 style="font-family:var(--font-serif,serif);font-size:1.1rem;color:var(--color-deep,#1a3a2a);margin-bottom:12px;">实时讨论室</h3>' +
          '<div id="community-chat" style="height:400px;background:#faf7f2;border-radius:8px;overflow:hidden;"></div>' +
        '</div>' +
        // 右侧：说明
        '<div style="background:var(--surface-primary,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:var(--radius-lg, 12px);padding:20px;">' +
          '<h3 style="font-family:var(--font-serif,serif);font-size:1.1rem;color:var(--color-deep,#1a3a2a);margin-bottom:12px;">使用说明</h3>' +
          '<ul style="margin:0;padding-left:20px;color:var(--text-secondary,#4a4a4a);font-size:0.85rem;line-height:1.8;">' +
            '<li>左侧实时讨论室基于 quikchat，消息保存在本地浏览器</li>' +
            '<li>支持 Markdown 格式（粗体、斜体、行内代码、链接）</li>' +
            '<li>历史记录自动持久化，下次访问可恢复</li>' +
            '<li>清空历史可在聊天室内操作</li>' +
          '</ul>' +
        '</div>' +
      '</div>' +
      '</div>';

    // 挂载 quikchat
    mountChat('community-chat', {
      title: 'TATABOX 讨论室',
      userName: '学习者',
      storageKey: 'bioquest_community_chat'
    }).catch(function () {});
  }

  // 暴露到全局
  /**
   * 社区模块增强接口，基于 quikchat 提供实时讨论区的挂载/卸载、加载状态查询与页面渲染能力。
   * @type {Object}
   */
  window.CommunityEnhanced = {
    mountChat: mountChat,
    unmountChat: unmountChat,
    isQuikchatLoaded: function () { return _quikchatLoaded; },
    renderCommunityEnhancedPage: renderCommunityEnhancedPage
  };

  // 页面入口（可选，community.js 也可调用 window.CommunityEnhanced 增强现有页面）
  /**
   * 哈希路由入口：根据路由与容器初始化社区增强页面。
   * @function
   * @param {string} route - 哈希路由
   * @param {HTMLElement} target - 挂载容器
   * @returns {void}
   */
  window.initCommunityEnhanced = function (route, target) {
    renderCommunityEnhancedPage(target);
  };
})();
