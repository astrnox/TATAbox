/**
 * ============================================================
 * TATABOX — PRD §5-49：全局错误恢复机制
 * 捕获 JS 运行时错误，记录日志，尝试恢复页面状态
 * ============================================================
 */
(function () {
  'use strict';

  var MAX_ERRORS = 5;
  var ERROR_WINDOW_MS = 10000; // 10秒内超过5个错误触发恢复
  var errorTimestamps = [];
  var errorLog = [];

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

  // 全局错误捕获
  window.addEventListener('error', function (event) {
    pruneOldErrors();
    errorTimestamps.push(Date.now());
    logError(event.message, event.filename, event.lineno, event.colno, event.error);
    if (errorTimestamps.length >= MAX_ERRORS) {
      attemptRecovery();
    }
  });

  // 未处理的 Promise 拒绝（#121：除记录日志外对用户可见）
  var _lastRejectionToastAt = 0;
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var msg = reason && reason.message ? reason.message : String(reason);
    logError('[UnhandledRejection] ' + msg, '', 0, 0, reason);
    console.warn('[TATABOX] 未处理的 Promise 拒绝:', msg);
    // 用户主动取消（AbortError）属正常流程，不打扰用户
    if (reason && reason.name === 'AbortError') return;
    // 节流：5 秒内最多提示一次，避免连续失败触发 toast 风暴
    var now = Date.now();
    if (now - _lastRejectionToastAt < 5000) return;
    _lastRejectionToastAt = now;
    if (typeof window.showToast === 'function') {
      var brief = errText(msg);
      if (brief.length > 80) brief = brief.slice(0, 80) + '…';
      window.showToast('操作遇到问题：' + brief, 'error');
    }
  });

  console.log('[TATABOX] 全局错误恢复机制已启动');
})();