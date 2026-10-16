/**
 * 主题初始化（同步执行，必须在首帧渲染前运行，防白屏/闪烁）
 * 由 index.html / lite.html 在 <head> 中 style 之后、以同步 <script src> 方式加载。
 * 只做"读取并应用主题"这一件事，其余主题逻辑（切换、写入、强调色）留在 app.js / lite-app.js。
 * v2.1：接受 'night'（夜巡模式，lite 专属第三态）。系统偏好只映射 light/dark，
 *       不会自动进入夜巡（夜巡必须由用户显式选择）。
 */
(function () {
  try {
    var t = localStorage.getItem('bioquest-theme');
    if (t === 'dark' || t === 'light' || t === 'night') {
      document.documentElement.setAttribute('data-theme', t);
    } else {
      // 用户没设就跟随系统，避免 paint 一次再被 CSS 覆盖
      var mql = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      if (mql && mql.matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }
  } catch (e) {}
})();
