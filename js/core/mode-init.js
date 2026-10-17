/**
 * TATABOX — 入口偏好记忆（设计方案 v2 §5.3，可选项，默认关闭）
 * 由 index.html 在 theme-init.js 之后以同步 <script src> 方式加载。
 * 仅当用户曾在 lite 页面显式勾选「记住入口偏好」时，localStorage 中才会
 * 出现 bioquest-entry-pref = 'lite'，此时立即重定向到极简版；
 * 新用户与未勾选者完全不受影响（也不影响 SEO —— 重定向只发生在已知老用户）。
 */
(function () {
  try {
    if (document.documentElement.getAttribute('data-ui') === 'lite') return;
    var pref = localStorage.getItem('bioquest-entry-pref');
    if (pref === 'lite' && !/lite\.html/.test(location.pathname)) {
      location.replace('lite.html' + location.hash);
    }
  } catch (e) {}
})();
