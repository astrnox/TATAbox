/**
 * 静态资源的失败重试
 *
 * 部署在带网关限流的托管环境时，首屏几十个 <script>/<link> 并发拉取偶发 429
 * （网关返回 JSON 错误体，浏览器直接放弃执行该脚本），表现为「xx 模块未加载」。
 * 这里接管资源元素的 error 事件，做有限次数的退避重试，避免单个资源失败拖垮整页。
 */
(function () {
  'use strict';

  var MAX_RETRY = 2;
  var BASE_DELAY = 400;
  var attempts = Object.create(null);

  function retry(el, url) {
    var n = attempts[url] || 0;
    if (n >= MAX_RETRY) return;
    attempts[url] = n + 1;
    setTimeout(function () {
      if (!el.parentNode) return;
      var clone = el.cloneNode(false);
      if (clone.tagName === 'SCRIPT') {
        clone.removeAttribute('integrity');
        clone.setAttribute('data-retry', String(n + 1));
        clone.src = url + (url.indexOf('?') === -1 ? '?' : '&') + 'retry=' + (n + 1);
      } else {
        clone.href = url + (url.indexOf('?') === -1 ? '?' : '&') + 'retry=' + (n + 1);
      }
      el.parentNode.replaceChild(clone, el);
    }, BASE_DELAY * (n + 1));
  }

  document.addEventListener('error', function (event) {
    var el = event.target;
    if (!el || !el.tagName) return;
    if (el.tagName !== 'SCRIPT' && el.tagName !== 'LINK') return;
    var url = el.src || el.href;
    if (!url || !/^https?:/i.test(url)) return;
    retry(el, url);
  }, true);
})();
