/**
 * TATABOX — 隐私政策页 / 首次访问提示（M-01 自 app.js 拆分）
 * ------------------------------------------------------------
 * 仅内联样式（CSP style-src 允许 'unsafe-inline'），不含内联脚本。
 * 颜色全部走语义令牌，暗色模式自动适配。
 * 由 index.html 在 app.js 之后以 defer 加载；initApp / handleRoute 运行时可直接调用。
 * ============================================================
 */
'use strict';

/**
 * 隐私政策页（静态内容，P1-19）
 * 仅内联样式（CSP style-src 允许 'unsafe-inline'），不含内联脚本，避免引入 XSS 面。
 */
function renderPrivacyPage(target) {
  if (!target) return;
  var s = {
    bg: 'var(--bg-page, #f7f5f0)',
    card: 'var(--bg-surface, #ffffff)',
    border: 'var(--border-subtle, #ece8e1)',
    text: 'var(--text-primary, #2c3840)',
    muted: 'var(--text-tertiary, #8a8a8a)',
    sage: 'var(--accent-text, #3a6b4a)',
    accent: 'var(--text-primary, #1a3a2a)'
  };
  target.innerHTML =
  '<div style="max-width:860px;margin:0 auto;padding:40px 20px 64px;font-family:var(--font-sans,\'Noto Sans SC\',sans-serif);color:' + s.text + ';line-height:1.8;">' +
    '<a href="#/" style="display:inline-flex;align-items:center;gap:6px;color:' + s.sage + ';text-decoration:none;font-size:0.88rem;margin-bottom:20px;">← 返回首页</a>' +
    '<div style="background:' + s.card + ';border:1px solid ' + s.border + ';border-radius:16px;padding:36px 40px 44px;box-shadow:var(--shadow-lg);">' +
      '<h1 style="font-family:var(--font-serif,\'Noto Serif SC\',serif);font-size:1.7rem;color:' + s.accent + ';margin:0 0 6px;">隐私政策</h1>' +
      '<p style="color:' + s.muted + ';font-size:0.82rem;margin:0 0 26px;">更新日期：2026-08-19 · 适用于 TATABOX（高中生物学习平台）</p>' +
      _privacySection('一、我们收集哪些数据', [
        '账户信息：你在登录/注册时提供的姓名、邮箱（例如通过 Supabase 账号系统）。',
        '学习数据：练习作答、错题、收藏、统计、习惯打卡、徽章与学习进度等，默认仅保存在你的浏览器本地（localStorage／IndexedDB）。',
        '设备标识：用于本地数据关联的匿名设备标识（bioquest.xxx 下）。',
        '日志：浏览器控制台与运行错误日志，仅用于排障，不含可直读的敏感凭据。'
      ]) +
      _privacySection('二、数据如何使用', [
        '用于个性化学习：错题复盘、学情分析、成绩画像、复习排程（FSRS/IRT 算法）。',
        '用于功能交互：社区、排行榜、教师协同视图、AI 助手（见第五条）。',
        '不会在未经你同意的情况下用于广告画像或出售给第三方。'
      ]) +
      _privacySection('三、数据存储与安全', [
        '默认本地优先：学习数据存于你的浏览器本地存储；你可在「用户中心 → 数据管理」导出备份或一键清除。',
        '云端数据（如已登录账号、反馈、社区内容、AI 额度的服务端部分）通过 Supabase 存储与传输。',
        'API Key 保护：AI 接口 Key 仅保存在当前页面内存（可选「会话内记住」写入 sessionStorage，关闭标签页即清除），不会持久化到你浏览器的 localStorage 或磁盘，也不会在控制台之外以明文全局属性暴露。',
        '传输加密：外发请求走 HTTPS，第三方 AI 服务商在请求中有独立的服务条款与隐私政策。'
      ]) +
      _privacySection('四、Cookie 与本地存储', [
        '本平台主要依赖浏览器 Web Storage（localStorage / sessionStorage / IndexedDB）存储功能数据，而非传统 Cookie。',
        '第三方服务（Supabase、AI 服务商、jsDelivr CDN 等）可能按其自身政策使用 Cookie／本地存储，请查阅各自隐私政策。',
        '你可随时在浏览器设置中清除站点本地数据；清除后学习数据将不可恢复（建议先导出备份）。'
      ]) +
      _privacySection('五、AI 功能与第三方处理', [
        'AI 助手（导师、诊断、文档问答等）会将你的提问与相关上下文发送到所选 AI 服务商（如 DeepSeek、智谱、通义千问、Kimi、NVIDIA、硅基流动）的接口处理。',
        '若你使用自定义 API Key，请求由你的前端携带你的 Key 直连服务商；请勿将涉及他人敏感信息的文本提交给 AI 功能。',
        'AI 调用受每日次数限制，用于防止滥用。'
      ]) +
      _privacySection('六、你的权利', [
        '访问权：在「用户中心」查看个人与学习数据。',
        '导出权：在「用户中心 → 数据管理 → 导出我的数据」获取可读明文 JSON。',
        '删除权：在「用户中心 → 数据管理 → 清除所有数据」删除本地全部业务数据；账号相关数据可在登录状态下申请。',
        '撤回同意与投诉：可通过下方邮箱联系我们对数据处理行为提出异议。'
      ]) +
      _privacySection('七、未成年人保护', [
        '本平台面向生物学科学习，若你为未成年人，建议在监护人指导下使用，并由监护人知悉本政策后使用。'
      ]) +
      _privacySection('八、政策更新与联系', [
        '我们会不时更新本政策，重大变更将在页面明显位置提示。',
        '如有隐私相关问题，可通过邮箱联系作者：astrnox@163.com（或 QQ：3930523703）。'
      ]) +
      '<div style="margin-top:8px;padding-top:18px;border-top:1px solid ' + s.border + ';font-size:0.82rem;color:' + s.muted + ';">TATABOX · 本政策以最新页面版本为准。</div>' +
    '</div>' +
  '</div>';
  try { if (typeof updatePageTitle === 'function') updatePageTitle('/privacy'); } catch (e) {}
}

// 生成"小节标题 + 列表"的静态 HTML（仅内联样式，无脚本）
function _privacySection(title, items) {
  var lis = items.map(function (it) {
    return '<li style="margin:6px 0;padding-left:2px;">' + String(it).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</li>';
  }).join('');
  return '<h2 style="font-family:var(--font-serif,\'Noto Serif SC\',serif);font-size:1.12rem;color:' + 'var(--text-primary, #1a3a2a)' + ';margin:26px 0 10px;">' + title + '</h2>' +
    '<ul style="margin:0;padding-left:20px;font-size:0.9rem;color:var(--text-primary, #2c3840);">' + lis + '</ul>';
}

/**
 * 首次访问隐私政策提示（P1-19）。
 * 一次性、可关闭；仅用内联样式 + textContent/按钮，无内联脚本（符合 CSP）。
 * 关键约束：任何分支都不抛异常、不依赖 DOM 状态，绝不影响 initApp 后续执行
 * （initApp 在 DOMContentLoaded 直接触发，无 try/catch 兜底）。
 */
function _maybeShowPrivacyNotice() {
  try {
    var seen = false;
    try { seen = localStorage.getItem('tatabox_privacy_notice_seen') === '1'; } catch (e) {}
    if (seen || typeof document === 'undefined' || !document.body) return;

    var el = document.createElement('div');
    el.id = 'privacy-notice';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;' +
      'display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:14px 16px;border-radius:12px;' +
      'background:var(--bg-surface, #ffffff);border:1px solid var(--border-subtle, #ece8e1);box-shadow:var(--shadow-lg);' +
      'font-family:var(--font-sans, sans-serif);font-size:0.85rem;color:var(--text-primary, #2c3e30);line-height:1.5;max-width:640px;margin:0 auto;';
    var txt = document.createElement('span');
    txt.style.cssText = 'flex:1 1 100%;';
    txt.textContent = '我们重视你的数据隐私：学习数据默认仅保存在本地，可随时导出或清除。';
    // P1-33：未成年人保护——首次使用需确认年龄/监护人同意。
    // 该确认仅作为最小合规门槛（不阻塞应用启动，用户也可自行访问隐私政策页后再确认）。
    var ageWrap = document.createElement('label');
    ageWrap.style.cssText = 'display:flex;align-items:flex-start;gap:8px;flex:1 1 100%;cursor:pointer;font-size:0.82rem;color:var(--text-secondary, #54665c);';
    var ageInput = document.createElement('input');
    ageInput.type = 'checkbox';
    ageInput.setAttribute('aria-label', '我已阅读并同意隐私政策；确认年满14周岁，或未成年人使用已取得监护人同意');
    ageInput.style.cssText = 'margin-top:1px;accent-color:var(--accent-text, #3a6b4a);';
    var ageText = document.createElement('span');
    ageText.textContent = '我已阅读并同意隐私政策；确认年满 14 周岁（若为未成年人，已取得监护人同意后使用本平台）。';
    ageWrap.appendChild(ageInput);
    ageWrap.appendChild(ageText);

    var link = document.createElement('a');
    link.href = '#/privacy';
    link.textContent = '查看隐私政策';
    link.style.cssText = 'color:var(--accent-text, #3a6b4a);font-weight:600;white-space:nowrap;text-decoration:none;';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '我知道了';
    closeBtn.disabled = true;
    closeBtn.style.cssText = 'border:1px solid var(--accent-text, #3a6b4a);background:var(--accent-text, #3a6b4a);color:#fff;border-radius:8px;padding:6px 14px;font-size:0.82rem;cursor:pointer;white-space:nowrap;';
    closeBtn.style.opacity = '0.5';
    closeBtn.addEventListener('click', function () {
      try { localStorage.setItem('tatabox_privacy_notice_seen', '1'); } catch (e) {}
      try { localStorage.setItem('tatabox_age_consent', '1'); } catch (e) {}
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    ageInput.addEventListener('change', function () {
      closeBtn.disabled = !ageInput.checked;
      closeBtn.style.opacity = ageInput.checked ? '1' : '0.5';
    });

    el.appendChild(txt);
    el.appendChild(ageWrap);
    el.appendChild(link);
    el.appendChild(closeBtn);
    document.body.appendChild(el);
  } catch (e) { /* 提示失败绝不能影响应用启动 */ }
}

// M-01：显式挂载原全局入口，app.js 的 initApp / handleRoute 无需改动
window.renderPrivacyPage = renderPrivacyPage;
window._maybeShowPrivacyNotice = _maybeShowPrivacyNotice;

// 注册到全站唯一命名空间（window.BioQuest，Q-03 约定；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.app = BQ.app || {};
  BQ.app.privacy = {
    renderPrivacyPage: renderPrivacyPage,
    maybeShowNotice: _maybeShowPrivacyNotice
  };
})();
