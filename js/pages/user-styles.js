/**
 * TATABOX — 个人中心样式加载（M-01 拆分 + CSS 外置）
 * ------------------------------------------------------------
 * CSS 已移至 css/user-styles.css；运行时注入 <link> 以保持原内联样式
 * 的级联顺序（最后加载，覆盖既有 user.css）。由 loadModule('user') 依赖链加载。
 * ============================================================
 */
'use strict';

let userStylesInjected = false;

function injectUserStyles() {
  if (userStylesInjected) return;
  userStylesInjected = true;
  if (document.getElementById('bioquest-user-styles')) return;

  const link = document.createElement('link');
  link.id = 'bioquest-user-styles';
  link.rel = 'stylesheet';
  link.href = 'css/user-styles.css?v=20261031a';
  document.head.appendChild(link);
}

window.injectUserStyles = injectUserStyles;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.user = BQ.user || {};
  BQ.user.styles = { injectUserStyles: injectUserStyles };
})();
