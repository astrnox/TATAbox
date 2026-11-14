/**
 * 旧内核浏览器兼容探测（同步，必须在任何 defer 脚本之前加载）。
 *
 * 目的：识别无法解析现代 JS 语法的老内核 WebView（如 Android 老系统上的
 * Via / 微信内置浏览器等，Chrome < 80 不支持 ?. / ??，Chrome < 55 不支持
 * async/await）。
 *
 * 机制：本文件故意使用现代语法（?. / ?? / 展开 / async）。
 *  - 现代浏览器：文件正常解析执行 → 设置 window.__bqProbeParsed = true；
 *  - 老内核浏览器：文件整体解析失败 → 标记保持 undefined。
 *
 * 兼容性判定已改为 fail-open（能用就放行）：这里只记录能力缺失情况，
 * 不再因为某个 API 缺失就直接把用户拦在降级页；是否降级由
 * legacy-fallback.js 根据「应用是否真的启动成功」决定。
 *
 * 注意：本文件不得使用 eval / new Function（CSP 已移除 unsafe-eval），
 *      语法能力只能通过「文件能否被解析」这一事实来探测。
 */
(function () {
  // 能执行到这里，说明现代语法（?. ?? 展开 async）已可解析
  window.__bqProbeParsed = true;

  var syntaxOk = (function () {
    var o = null;
    var a = o ? o.x ?? 1 : 1;
    var s = [...[1], 2];
    var f = async function () { return 1; };
    return a === 1 && s.length === 2 && typeof f === 'function';
  })();

  // 只做诊断：缺什么记下来，能不能用交给真实启动结果判断
  var missing = [];
  function need(name, ok) {
    if (!ok) missing.push(name);
  }
  need('Promise', !!window.Promise);
  need('fetch', typeof window.fetch === 'function');
  need('AbortController', typeof window.AbortController === 'function');
  need('Map', !!window.Map);
  need('Set', !!window.Set);
  need('Symbol', !!window.Symbol);
  need('Object.assign', typeof Object.assign === 'function');
  need('String.prototype.includes', !!(String.prototype && String.prototype.includes));
  need('Array.prototype.find', !!(Array.prototype && Array.prototype.find));
  need('requestAnimationFrame', typeof window.requestAnimationFrame === 'function');

  window.__bqMissingApis = missing;
  window.__bqModern = !!(syntaxOk && missing.length === 0);
})();
