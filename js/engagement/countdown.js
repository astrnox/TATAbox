/**
 * ============================================
 * 倒计时功能（全站唯一实现 + 唯一数据源）
 * ============================================
 * 目标日期只在本文件定义；首页静态渲染与 SPA 返回首页
 * （app.js 的 reinitHomeComponents）都调用 window.BioQuestCountdown.init()，
 * 不再各写一份计算逻辑、也不在多处硬编码日期。
 */
(function() {
  // 全站唯一的倒计时目标日期：下一届全国中学生生物学联赛
  const TARGET_DATE = new Date('2026-08-16T09:00:00+08:00');
  let timer = null;

  function pad(num) {
    return String(num).padStart(2, '0');
  }

  // M-13：日期文案也从 TARGET_DATE 生成，避免 index.html 再手写一份日期
  // （Issue #186：两处硬编码，改了一处忘了另一处）。
  function syncDateLabel() {
    var date = document.querySelector('.countdown-banner .countdown-date');
    if (!date) return;
    date.textContent = TARGET_DATE.getFullYear() + '年' +
      (TARGET_DATE.getMonth() + 1) + '月' + TARGET_DATE.getDate() + '日';
  }

  // 目标日期已过：归零会一直是「00天00时00分00秒」且每秒空转，
  // 这里切换为「下一届备考期」文案、隐藏数字区并停掉定时器。
  function showExpired() {
    const banner = document.querySelector('.countdown-banner');
    if (banner) {
      const label = banner.querySelector('.countdown-label');
      const date = banner.querySelector('.countdown-date');
      const digits = banner.querySelector('.countdown-digits');
      if (label) label.textContent = '下一届全国中学生生物学联赛';
      if (date) date.textContent = '备考期 · 具体日期待官方公布';
      if (digits) digits.style.display = 'none';
    }
  }

  // 渲染一帧；返回是否仍在倒计时（false 表示已过期，调用方应停掉定时器）
  function update() {
    const diff = TARGET_DATE - new Date();
    if (diff <= 0) {
      showExpired();
      return false;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    const daysEl = document.getElementById('cd-days');
    const hoursEl = document.getElementById('cd-hours');
    const minsEl = document.getElementById('cd-mins');
    const secsEl = document.getElementById('cd-secs');

    if (daysEl) daysEl.textContent = pad(days);
    if (hoursEl) hoursEl.textContent = pad(hours);
    if (minsEl) minsEl.textContent = pad(mins);
    if (secsEl) secsEl.textContent = pad(secs);
    return true;
  }

  // 幂等启动：SPA 返回首页时会重复调用，先清掉旧定时器，避免叠加多个 interval
  function init() {
    if (timer) { clearInterval(timer); timer = null; }
    syncDateLabel();
    timer = update() ? setInterval(update, 1000) : null;
  }

  window.BioQuestCountdown = { TARGET_DATE: TARGET_DATE, init: init, update: update };

  init();
})();