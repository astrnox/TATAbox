/**
 * TATABOX — Trusted Types 默认策略（M-05）
 * ------------------------------------------------------------
 * 目标：即使切换为强制模式，存量 innerHTML 字符串也不会裸写。
 * 所有 string → HTML 的赋值都会先经过默认策略：
 *   - window.safeHtml 可用 → DOMPurify 消毒（缺失/异常则全量转义）
 *   - 否则 → 内联转义兜底（fail-closed）
 *
 * 当前 CSP 仍为 Report-Only；本文件只负责把强制模式的安全底座准备好。
 * 由 index.html 在 utils.js 之后、业务脚本之前加载。
 * ============================================================
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (!window.trustedTypes || typeof window.trustedTypes.createPolicy !== 'function') return;

  function escapeFallback(html) {
    return String(html == null ? '' : html)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  try {
    window.trustedTypes.createPolicy('default', {
      createHTML: function (html) {
        if (typeof window.safeHtml === 'function') return window.safeHtml(html);
        return escapeFallback(html);
      },
      createScript: function () {
        throw new Error('Trusted Types: script 注入已阻止');
      },
      createScriptURL: function () {
        throw new Error('Trusted Types: script URL 注入已阻止');
      }
    });
  } catch (e) {
    console.warn('[TrustedTypes] 默认策略创建失败:', e);
  }
})();
