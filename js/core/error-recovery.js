/**
 * ============================================================
 * TATABOX — PRD §5-49：全局错误恢复机制
 * 捕获 JS 运行时错误，记录日志，尝试恢复页面状态。
 *
 * 错误提示原则：
 * - 不再用 3 秒自动消失的 toast 提示「操作遇到问题」；
 * - 改为右下角常驻错误卡片，直到用户主动关闭，方便阅读/复制/反馈；
 * - 同一会话多次错误在卡片内累计次数，不刷屏。
 * ============================================================
 */
(function () {
  'use strict';

  var MAX_ERRORS = 5;
  var ERROR_WINDOW_MS = 10000; // 10秒内超过5个错误触发恢复
  var errorTimestamps = [];
  var errorLog = [];
  var _errorBanner = null;
  var _errorBannerCount = 0;

  function pruneOldErrors() {
    var now = Date.now();
    errorTimestamps = errorTimestamps.filter(function (t) { return now - t < ERROR_WINDOW_MS; });
  }

  function logError(message, source, lineno, colno, error) {
    errorLog.push({
      time: new Date().toISOString(),
      message: message,
      source: source,
      lineno: lineno,
      colno: colno,
      stack: error && error.stack ? error.stack : ''
    });
    // 只保留最近20条
    if (errorLog.length > 20) errorLog.shift();
    try {
      localStorage.setItem('tatabox_error_log', JSON.stringify(errorLog.slice(-10)));
    } catch (e) {}
  }

  function attemptRecovery() {
    try {
      // 检查页面主要内容是否为空
      var root = document.getElementById('page-content');
      if (root && root.innerHTML.trim() === '') {
        root.innerHTML =
          '<div style="text-align:center;padding:80px 24px;max-width:600px;margin:0 auto;">' +
          '<p style="font-size:1.1rem;color:var(--text-primary);margin-bottom:8px;">页面遇到了一些问题</p>' +
          '<p style="font-size:0.9rem;color:var(--text-muted);margin-bottom:24px;">别担心，你的数据已保存在本地</p>' +
          '<button data-on=\'["_cspReload"]\' style="padding:10px 28px;background:var(--color-sage,#5a7d5c);color:#fff;border:none;border-radius:16px;cursor:pointer;font-size:0.95rem;">刷新页面</button>' +
          '</div>';
      }
    } catch (e2) {}
  }

  /* ======================= 常驻错误卡片 ======================= */

  function _fmtTime(ts) {
    try {
      var d = new Date(ts);
      var hh = ('0' + d.getHours()).slice(-2);
      var mm = ('0' + d.getMinutes()).slice(-2);
      var ss = ('0' + d.getSeconds()).slice(-2);
      return hh + ':' + mm + ':' + ss;
    } catch (e) { return ''; }
  }

  function _copyText(text, btn) {
    function done(ok) {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = ok ? '已复制' : '复制失败';
      setTimeout(function () { btn.textContent = old; }, 1600);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { _fallbackCopy(text, done); });
      } else {
        _fallbackCopy(text, done);
      }
    } catch (e) { _fallbackCopy(text, done); }
  }

  function _fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      done(!!ok);
    } catch (e) { done(false); }
  }

  function _errorDetailText(title, message, error) {
    var lines = [
      '[TATABOX 错误]',
      '时间：' + new Date().toLocaleString('zh-CN'),
      '页面：' + (location.href || ''),
      '标题：' + (title || '操作遇到问题'),
      '信息：' + (message || '未知错误')
    ];
    if (error && error.stack) lines.push('', '堆栈：', error.stack);
    return lines.join('\n');
  }

  function _ensureErrorBanner() {
    if (_errorBanner && document.body && document.body.contains(_errorBanner)) return _errorBanner;
    var el = document.createElement('div');
    el.id = 'bq-error-banner';
    el.setAttribute('role', 'alert');
    el.innerHTML =
      '<div class="bq-error-head">' +
        '<span class="bq-error-dot" aria-hidden="true"></span>' +
        '<span class="bq-error-title">操作遇到问题</span>' +
        '<button type="button" class="bq-error-close" aria-label="关闭错误提示">×</button>' +
      '</div>' +
      '<div class="bq-error-message"></div>' +
      '<div class="bq-error-meta">' +
        '<span class="bq-error-time"></span>' +
        '<span class="bq-error-count"></span>' +
      '</div>' +
      '<div class="bq-error-actions">' +
        '<button type="button" class="bq-error-copy">复制错误信息</button>' +
        '<button type="button" class="bq-error-detail-toggle">查看详情</button>' +
      '</div>' +
      '<pre class="bq-error-detail" hidden></pre>';

    var close = el.querySelector('.bq-error-close');
    if (close) {
      close.addEventListener('click', function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        _errorBanner = null;
      });
    }
    var copyBtn = el.querySelector('.bq-error-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        _copyText(el._bqErrorText || '', copyBtn);
      });
    }
    var toggle = el.querySelector('.bq-error-detail-toggle');
    var detail = el.querySelector('.bq-error-detail');
    if (toggle && detail) {
      toggle.addEventListener('click', function () {
        detail.hidden = !detail.hidden;
        toggle.textContent = detail.hidden ? '查看详情' : '收起详情';
      });
    }
    document.body.appendChild(el);
    _errorBanner = el;
    return el;
  }

  /**
   * 显示常驻错误卡片（不自动消失）。
   * @param {string} title
   * @param {string} message
   * @param {Error|Object} [error]
   */
  function showErrorBanner(title, message, error) {
    if (!document.body) {
      setTimeout(function () { showErrorBanner(title, message, error); }, 300);
      return;
    }
    var el = _ensureErrorBanner();
    _errorBannerCount++;
    var titleEl = el.querySelector('.bq-error-title');
    var msgEl = el.querySelector('.bq-error-message');
    var timeEl = el.querySelector('.bq-error-time');
    var countEl = el.querySelector('.bq-error-count');
    var detailEl = el.querySelector('.bq-error-detail');
    var toggleEl = el.querySelector('.bq-error-detail-toggle');
    if (titleEl) titleEl.textContent = title || '操作遇到问题';
    if (msgEl) msgEl.textContent = message || '未知错误';
    if (timeEl) timeEl.textContent = _fmtTime(Date.now());
    if (countEl) countEl.textContent = _errorBannerCount > 1 ? '本次会话第 ' + _errorBannerCount + ' 次' : '';
    var detailText = _errorDetailText(title, message, error);
    el._bqErrorText = detailText;
    if (detailEl) {
      detailEl.textContent = detailText;
      detailEl.hidden = true;
    }
    if (toggleEl) toggleEl.textContent = '查看详情';
    el.classList.add('is-visible');
  }

  window.showErrorBanner = showErrorBanner;
  window.BioQuestErrorBanner = { show: showErrorBanner };

  /* ======================= 全局捕获 ======================= */

  // 全局错误捕获
  window.addEventListener('error', function (event) {
    pruneOldErrors();
    errorTimestamps.push(Date.now());
    logError(event.message, event.filename, event.lineno, event.colno, event.error);
    if (errorTimestamps.length >= MAX_ERRORS) {
      attemptRecovery();
    }
    // 资源加载失败（img/script）message 为空，不弹业务错误卡片；运行时错误常驻展示
    if (event.message && event.message !== 'Script error.' && event.error) {
      showErrorBanner('页面遇到问题', event.message, event.error);
    }
  });

  // 未处理的 Promise 拒绝：记录日志 + 常驻错误卡片
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var msg = reason && reason.message ? reason.message : String(reason);
    logError('[UnhandledRejection] ' + msg, '', 0, 0, reason);
    console.warn('[TATABOX] 未处理的 Promise 拒绝:', msg);
    // 用户主动取消（AbortError）属正常流程，不打扰用户
    if (reason && reason.name === 'AbortError') return;
    showErrorBanner('操作遇到问题', msg, reason);
  });

  console.log('[TATABOX] 全局错误恢复机制已启动');
})();
