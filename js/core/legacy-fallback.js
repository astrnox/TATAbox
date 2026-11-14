/**
 * 旧内核浏览器降级（同步执行，纯 ES5 语法 —— 老内核浏览器必须能解析本文件）。
 *
 * 判定思路：fail-open（能用就放行），不再"预测"浏览器是否能用。
 *  1. `legacy-probe.js` 正常解析且关键 API 齐备 → 现代浏览器，直接返回；
 *  2. 其余情况先不下结论，等应用真实启动结果：
 *     - `js/core/app.js` 首行写入 window.__appBooted，说明现代语法可解析、
 *       应用已经跑起来（探针可能只是网络加载失败）→ 视为可用，不打扰用户；
 *     - 应用迟迟没起来 → 才切换只读降级模式；
 *  3. 若降级后 `bioquest:app-ready` 才到达（慢网/慢终端），自动撤销降级，
 *     恢复完整版，避免把能用的用户误判成"浏览器过旧"。
 *
 * 降级行为（只读模式）：
 *  1. 摘除首屏遮罩 —— boot-mask.js 找不到 #bq-boot-mask 会直接返回，
 *     不会再显示"进度条/加载失败重试卡"；
 *  2. 给 <html> 加 .bq-legacy 标记，隐藏依赖 JS 的交互控件（选项、提交、跳转），
 *     并直接展开 HTML 里静态渲染的「答案与解析」；
 *  3. 在页面顶部插入一条可关闭的提示，说明当前是只读模式、如何获得完整功能。
 *
 * 注意：本文件不得使用 eval / new Function（CSP 已移除 unsafe-eval），
 *      也不得使用任何现代语法/API；样式用普通 class（不用 CSS 变量，老内核不认）。
 */
(function () {
  var parsed = !!window.__bqProbeParsed;
  var modern = !!window.__bqModern;

  // 现代浏览器：探针正常解析且关键 API 齐备 → 交给完整应用，不做任何事。
  if (parsed && modern) return;

  var docEl = document.documentElement;
  var applied = false; // 是否已切入只读降级
  var timer = null;

  /** 应用脚本是否真的跑起来了（app.js 首行写入） */
  function appBooted() {
    return !!window.__appBooted;
  }

  function injectStyle() {
    if (!document.head || document.getElementById('bq-legacy-style')) return;
    var style = document.createElement('style');
    style.id = 'bq-legacy-style';
    style.type = 'text/css';
    // style-src 保留 'unsafe-inline'，此处注入内联样式合法且不触犯 CSP。
    style.textContent =
      '.bq-legacy .countdown-banner,' +
      '.bq-legacy .announcement-banner,' +
      '.bq-legacy .daily-question-section{display:none !important;}' +
      '.bq-legacy .hq-toggle,' +
      '.bq-legacy .hq-submit-row,' +
      '.bq-legacy .hq-skip{display:none !important;}' +
      '.bq-legacy .hq-nojs{display:block !important;}' +
      '.bq-legacy .hq-question{max-width:720px;margin:0 auto 18px;padding:18px 20px;' +
      'border:1px solid #dbe3d8;border-radius:12px;background:#fff;color:#2c3e30;' +
      'font-size:16px;line-height:1.75;}' +
      '.bq-legacy .hq-stem{font-size:17px;font-weight:600;margin:10px 0 14px;}' +
      '.bq-legacy .hq-nojs summary{cursor:pointer;font-weight:600;color:#3a6b4a;}' +
      '.bq-legacy .hq-nojs li{margin:8px 0;font-size:15px;line-height:1.7;}' +
      '#bq-legacy-notice{box-sizing:border-box;position:relative;z-index:9999;display:flex;' +
      'flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px;' +
      'margin:0;padding:12px 16px;background:#f6f8f4;border-bottom:1px solid #dbe3d8;' +
      'color:#2c3e30;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;' +
      'font-size:14px;line-height:1.65;}' +
      '#bq-legacy-notice .bq-legacy-body{flex:1 1 320px;min-width:240px;}' +
      '#bq-legacy-notice strong{display:block;font-size:15px;margin-bottom:2px;}' +
      '#bq-legacy-notice .bq-legacy-text{display:block;color:#4a5c4f;}' +
      '#bq-legacy-notice .bq-legacy-actions{flex:0 0 auto;display:flex;align-items:center;gap:8px;}' +
      '#bq-legacy-notice .bq-legacy-btn{border:1px solid #dbe3d8;background:#fff;color:#2c3e30;' +
      'border-radius:12px;padding:6px 14px;font-size:13px;cursor:pointer;font-family:inherit;}' +
      '#bq-legacy-notice .bq-legacy-btn-primary{border-color:#3a6b4a;background:#3a6b4a;color:#fff;}';
    document.head.appendChild(style);
  }

  function makeButton(label, primary) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className = 'bq-legacy-btn' + (primary ? ' bq-legacy-btn-primary' : '');
    return btn;
  }

  function showNotice(kind) {
    if (applied) return;
    applied = true;

    injectStyle();
    if (docEl && docEl.className.indexOf('bq-legacy') === -1) {
      docEl.className = (docEl.className + ' bq-legacy').replace(/^\s+/, '');
    }

    // ① 摘除首屏遮罩，露出静态内容
    var mask = document.getElementById('bq-boot-mask');
    if (mask && mask.parentNode) mask.parentNode.removeChild(mask);

    // ② 只读模式：直接展开答案与解析（老内核可能不支持 <details> 交互）
    try {
      var detailsList = document.querySelectorAll('.hq-nojs');
      for (var i = 0; i < detailsList.length; i++) {
        detailsList[i].open = true;
      }
    } catch (e) { /* ignore */ }

    // ③ 顶部提示条
    if (!document.body) return;
    var isBoot = kind === 'boot';

    var notice = document.createElement('div');
    notice.id = 'bq-legacy-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('data-reason', kind);

    var body = document.createElement('div');
    body.className = 'bq-legacy-body';

    var title = document.createElement('strong');
    title.textContent = isBoot ? '页面没有加载完整' : '当前是只读模式';

    var text = document.createElement('span');
    text.className = 'bq-legacy-text';
    text.textContent = isBoot
      ? '可能是网络不稳定，或者脚本被拦截了。刷新一下通常就能恢复；如果反复出现，请换一个浏览器打开。'
      : '浏览器版本偏旧，在线答题、错题本、云端同步暂时用不了；题目、答案和解析可以正常阅读。想看完整功能，请用 Chrome、Edge 或 Safari 打开这个网址。';

    body.appendChild(title);
    body.appendChild(text);

    var actions = document.createElement('div');
    actions.className = 'bq-legacy-actions';

    if (isBoot) {
      var reload = makeButton('刷新页面', true);
      reload.addEventListener('click', function () {
        try { window.location.reload(); } catch (e) { /* ignore */ }
      });
      actions.appendChild(reload);
    }

    var close = makeButton(isBoot ? '先看看' : '知道了', !isBoot);
    close.addEventListener('click', function () {
      if (notice.parentNode) notice.parentNode.removeChild(notice);
    });
    actions.appendChild(close);

    notice.appendChild(body);
    notice.appendChild(actions);
    document.body.insertBefore(notice, document.body.firstChild);
  }

  // 应用其实起来了 → 撤销可能的误判（慢网/探针文件加载失败都会走到这里）
  document.addEventListener('bioquest:app-ready', function () {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!applied) return;
    applied = false;

    if (docEl && docEl.className.indexOf('bq-legacy') !== -1) {
      docEl.className = docEl.className
        .replace(/(^|\s)bq-legacy(?=\s|$)/g, ' ')
        .replace(/^\s+|\s+$/g, '');
    }
    var notice = document.getElementById('bq-legacy-notice');
    if (notice && notice.parentNode) notice.parentNode.removeChild(notice);
    var style = document.getElementById('bq-legacy-style');
    if (style && style.parentNode) style.parentNode.removeChild(style);
  });

  function decide() {
    timer = null;
    // 应用已启动：说明现代语法没问题，探针缺失只是资源加载问题 → 放行
    if (appBooted()) return;
    showNotice(parsed ? 'api' : 'legacy');
  }

  // 探针能解析（只是缺个别 API）时给 800ms 观察窗；探针没解析时多等一会，
  // 避免把"探针文件恰好加载失败、应用稍后才启动"的现代浏览器误判成老内核。
  var GRACE = parsed ? 800 : 3000;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      timer = setTimeout(decide, GRACE);
    });
  } else {
    timer = setTimeout(decide, GRACE);
  }
})();
