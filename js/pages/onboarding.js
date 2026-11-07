/**
 * ============================================================
 * TATABOX — 3步 Onboarding（首次访问引导，恢复启用）
 *
 * 背景：此前的引导因「全屏遮罩挡住下拉交互」被整体禁用（见 git 历史）。
 * 本次按《冠军冲刺PRD-v2》§3.1 恢复，但改为「非阻塞」实现：
 *   - 只在首页(#/)且从未完成过一次引导时自动弹出；
 *   - 卡片固定在页面底部居中，仅卡片自身响应点击（pointer-events:none 于蒙布），
 *     因此顶部导航下拉、滚动等页面交互完全不被遮挡；
 *   - 提供「跳过」「上一步/下一步」「完成」，且右上角新增 "?" 按钮可随时重看。
 * =
 * 全部通过 addEventListener 绑定，无内联事件，符合 CSP（无 unsafe-inline）。
 * ============================================================
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'tatabox_onboarding_done';

  // 3 步引导内容。targetSelector 为可选的「高亮锚点」（可为空）。
  var STEPS = [
    {
      title: '三步开始刷题',
      text: '刷题、错题本、记忆卡片都在这里；答完自动判分，错题自动收录。',
      targetSelector: null
    },
    {
      title: '开始第一道题',
      text: '点「开始模考」或「专项练习」就能直接开刷，答完自动判分、自动进错题本。',
      targetSelector: '.btn-primary-hero, .btn-outline-hero'
    },
    {
      title: '进度自动保存',
      text: '你的学习进度会自动保存在这个浏览器里，随时回来都能继续，也支持导出与清除。',
      targetSelector: null
    }
  ];

  var currentIndex = 0;
  var card = null;

  function isDone() {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
    catch (e) { return false; }
  }

  function markDone() {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch (e) {}
  }

  function isHomePage() {
    var h = '';
    try { h = window.location.hash || ''; } catch (e) {}
    return h === '' || h === '#' || h === '#/';
  }

  function dismiss() {
    // 清除本卡片的自动收起定时器，避免旧卡片的 30s 定时器把「新卡片」提前关掉
    // （render() 在切步骤时会先 dismiss() 再建新卡，若不清理，旧定时器会误删新卡）
    if (card && card._autoClose) { clearTimeout(card._autoClose); }
    if (card && card.parentNode) card.parentNode.removeChild(card);
    card = null;
  }

  // 高亮锚点：在对应元素上做一次轻量脉冲边框提示（非阻塞，不做遮罩）
  function flashTarget() {
    var sel = STEPS[currentIndex].targetSelector;
    if (!sel) return;
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length && i < 1; i++) {
      (function (el) {
        if (!el) return;
        var original = el.style.cssText || '';
        el.style.transition = 'box-shadow .3s ease, outline-color .3s ease';
        el.style.outline = '3px solid rgba(232,168,48,0.8)';
        el.style.outlineOffset = '3px';
        setTimeout(function () {
          el.style.cssText = original;
        }, 1800);
      })(els[i]);
    }
  }

  function render() {
    dismiss();
    var step = STEPS[currentIndex] || STEPS[0];

    card = document.createElement('div');
    card.id = 'bioquest-onboarding';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', '新手引导');
    card.style.cssText = [
      'display:block',
      'box-sizing:border-box',
      // 蒙布不拦截点击（不阻止与页面交互），只有卡片本体可点
      'pointer-events:none',
      'position:fixed',
      'left:12px',
      'right:12px',
      'bottom:14px',
      'z-index:999980',
      'display:flex',
      'justify-content:center'
    ].join(';');

    var box = document.createElement('div');
    box.style.cssText = [
      'pointer-events:auto',
      'max-width:480px',
      'width:100%',
      'background:#ffffff',
      'border:1px solid rgba(232,168,48,0.5)',
      'border-radius:12px',
      'box-shadow:var(--shadow-floating)',
      'padding:16px 18px',
      'font-family:var(--font-sans, sans-serif)',
      'color:#2c3e30'
    ].join(';');
    card.appendChild(box);

    // 步骤指示点
    var dots = document.createElement('div');
    dots.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
    for (var d = 0; d < STEPS.length; d++) {
      var dot = document.createElement('span');
      dot.style.cssText = 'width:8px;height:8px;border-radius:50%;' +
        'background:' + (d === currentIndex ? '#3a6b4a' : '#cfd8d0') + ';';
      dots.appendChild(dot);
    }
    box.appendChild(dots);

    var title = document.createElement('div');
    title.style.cssText = 'font-size:1.02rem;font-weight:700;margin-bottom:4px;';
    title.textContent = step.title;
    box.appendChild(title);

    var text = document.createElement('div');
    text.style.cssText = 'font-size:0.88rem;line-height:1.6;color:#54665c;margin-bottom:12px;';
    text.textContent = step.text;
    box.appendChild(text);

    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;align-items:center;gap:8px;';
    box.appendChild(actions);

    // 跳过 / 上一步
    if (currentIndex === 0) {
      var skip = document.createElement('button');
      skip.type = 'button';
      skip.textContent = '跳过';
      skip.style.cssText = 'border:none;background:transparent;color:#6b7c72;font-size:0.85rem;cursor:pointer;padding:6px 10px;';
      skip.addEventListener('click', function () { markDone(); dismiss(); });
      actions.appendChild(skip);
    } else {
      var prev = document.createElement('button');
      prev.type = 'button';
      prev.textContent = '上一步';
      prev.style.cssText = 'border:none;background:transparent;color:#6b7c72;font-size:0.85rem;cursor:pointer;padding:6px 10px;';
      prev.addEventListener('click', function () { if (currentIndex > 0) currentIndex--; render(); });
      actions.appendChild(prev);
    }

    var spacer = document.createElement('span');
    spacer.style.cssText = 'flex:1;';
    actions.appendChild(spacer);

    // 下一步 / 完成
    var next = document.createElement('button');
    next.type = 'button';
    if (currentIndex === STEPS.length - 1) {
      next.textContent = '完成';
      next.addEventListener('click', function () { markDone(); dismiss(); });
    } else {
      next.textContent = '下一步';
      next.addEventListener('click', function () { if (currentIndex < STEPS.length - 1) currentIndex++; render(); });
    }
    next.style.cssText = 'border:1px solid #3a6b4a;background:#3a6b4a;color:#fff;border-radius:8px;padding:6px 16px;font-size:0.85rem;font-weight:600;cursor:pointer;';
    actions.appendChild(next);

    document.body.appendChild(card);
    flashTarget();

    // 30 秒无操作后自动收起（不再次弹出，不写完成标记）
    card._autoClose = setTimeout(dismiss, 30000);
  }

  function start() {
    if (typeof document === 'undefined' || !document.body) return;
    currentIndex = 0;
    render();
  }

  // 首次访问 + 首页时自动弹出。delayInMs 让首屏动画与数据渲染先落定。
  function maybeAutoStart(delayInMs) {
    if (isDone() || !isHomePage()) return;
    if (typeof document === 'undefined' || !document.body) {
      document.addEventListener('DOMContentLoaded', function () { maybeAutoStart(delayInMs); });
      return;
    }
    setTimeout(function () {
      if (!isDone() && isHomePage()) start();
    }, delayInMs || 800);
  }

  // 钩一个右上角 "?" 按钮（若存在）用于随时重看
  function bindHelpButton() {
    var help = document.getElementById('onboarding-help');
    if (help) help.addEventListener('click', function () { start(); });
  }

  // 路由切换时收起引导卡片，避免自动弹出在首页后「残留」到其他页面
  // （设计意图是「只在首页自动弹出」，切走后应让出交互区域）
  function bindRouteDismiss() {
    window.addEventListener('hashchange', function () {
      if (card && card.parentNode) dismiss();
    });
  }

  if (typeof document !== 'undefined') {
    bindHelpButton();
    bindRouteDismiss();
    maybeAutoStart(900);
  }

  window.Onboarding = {
    start: start,
    isDone: isDone,
    markDone: markDone
  };
})();