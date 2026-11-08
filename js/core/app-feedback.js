/**
 * TATABOX — 用户反馈弹窗（M-01 自 app.js 拆分）
 * ------------------------------------------------------------
 * 由 index.html 在 app.js 之后加载；window.showFeedbackModal 入口保持不变。
 * ============================================================
 */
'use strict';

function showFeedbackModal() {
  var existing = document.getElementById('feedback-modal');
  if (existing) {
    existing.classList.add('visible');
    return;
  }

  var overlay = document.createElement('div');
  overlay.id = 'feedback-modal';
  overlay.className = 'auth-modal-overlay';
  overlay.innerHTML = `
    <div class="auth-container" style="max-width:500px;">
      <button class="auth-close-btn" data-on='["closeFeedbackModal"]' title="关闭">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <div style="padding:24px 20px;">
        <h2 class="auth-form-title" style="margin-bottom:4px;">用户反馈</h2>
        <p class="auth-form-sub" style="margin-bottom:20px;">告诉我们你的想法，帮助我们改进 TATABOX</p>

        <div class="auth-field bq-mb-14">
          <label class="bq-hint--block-sm">反馈类型</label>
          <select id="feedback-type" style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:var(--text-primary,#e0e0e0);font-size:0.9rem;outline:none;">
            <option value="bug">Bug 报告</option>
            <option value="feature">功能建议</option>
            <option value="question_error">题目/内容纠错</option>
            <option value="suggestion">其他建议</option>
          </select>
        </div>

        <div class="auth-field bq-mb-14">
          <label class="bq-hint--block-sm">标题</label>
          <input type="text" id="feedback-title" class="auth-input" placeholder="简要描述你的反馈" style="width:100%;box-sizing:border-box;">
        </div>

        <div class="auth-field bq-mb-14">
          <label class="bq-hint--block-sm">详细描述</label>
          <textarea id="feedback-description" class="auth-input" placeholder="请详细描述问题或建议..." style="width:100%;box-sizing:border-box;min-height:100px;resize:vertical;font-family:inherit;" rows="4"></textarea>
        </div>

        <div class="auth-field bq-mb-14">
          <label class="bq-hint--block-sm">联系方式（选填）</label>
          <input type="text" id="feedback-contact" class="auth-input" placeholder="QQ/微信/邮箱，方便我们回复" style="width:100%;box-sizing:border-box;">
        </div>

        <div style="margin-bottom:14px;padding:10px 12px;background:rgba(58,140,92,0.08);border:1px solid rgba(58,140,92,0.25);border-radius:8px;font-size:0.82rem;color:var(--text-secondary,#9aa5a0);line-height:1.6;">
          想得到更快的回复，建议直接去 GitHub 提 Issue（有模板，填起来很快）：
          <br>
          <button type="button" data-stop-propagation data-on='["_cspOpenGitHub"]' style="margin-top:8px;padding:6px 14px;border-radius:8px;background:rgba(58,140,92,0.15);border:1px solid rgba(58,140,92,0.4);color:#7fd0a3;font-size:0.82rem;cursor:pointer;">前往 GitHub 提 Issue →</button>
        </div>

        <button type="button" class="auth-btn" data-on='["handleFeedbackSubmit"]' data-prevent-default style="width:100%;">提交反馈</button>
        <p class="auth-error" id="feedback-error" style="margin-top:8px;"></p>
        <p style="margin-top:14px;text-align:center;font-size:0.78rem;color:rgba(255,255,255,0.35);">作者（高中生）较忙，回复可能偏慢，见谅 · 作者 astrnox · astrnox@163.com · QQ 3930523703</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeFeedbackModal();
  });

  setTimeout(function() { overlay.classList.add('visible'); }, 10);
}

/**
 * 关闭反馈弹窗
 */
function closeFeedbackModal() {
  var modal = document.getElementById('feedback-modal');
  if (modal) modal.classList.remove('visible');
}

/**
 * 提交反馈
 */
function handleFeedbackSubmit() {
  var type = document.getElementById('feedback-type').value;
  var title = document.getElementById('feedback-title').value.trim();
  var description = document.getElementById('feedback-description').value.trim();
  var contact = document.getElementById('feedback-contact').value.trim();
  var errorEl = document.getElementById('feedback-error');

  if (!title) {
    if (errorEl) errorEl.textContent = '请填写标题';
    return;
  }
  if (!description) {
    if (errorEl) errorEl.textContent = '请填写详细描述';
    return;
  }

  var currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  var feedback = {
    id: 'fb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: type,
    title: title,
    description: description,
    contact: contact || '',
    user: currentUser ? { id: currentUser.id, username: currentUser.username } : null,
    createdAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  // 存储到 localStorage
  try {
    var existing = [];
    var raw = localStorage.getItem('tatabox_feedbacks');
    if (raw) existing = JSON.parse(raw);
    if (!Array.isArray(existing)) existing = [];
    existing.push(feedback);
    localStorage.setItem('tatabox_feedbacks', JSON.stringify(existing));
  } catch (e) {
    if (errorEl) {
      errorEl.textContent = '存储失败：' + errText(e);
      return;
    }
  }

  // 尝试发送到 Supabase（如果已登录）
  if (currentUser && !currentUser.isGuest) {
    try {
      var sb = (typeof getSupabase === 'function') ? getSupabase() : null;
      if (sb) {
        sb.from('feedbacks').insert({
          type: type,
          title: title,
          description: description,
          contact: contact || '',
          user_id: currentUser.id,
          user_agent: navigator.userAgent
        }).then(function() { /* 静默 */ }).catch(function() { /* 静默 */ });
      }
    } catch (e) { /* 静默 */ }
  }

  closeFeedbackModal();
  showToast('感谢你的反馈！我们会认真查看每一条建议');
}

/**
 * P1-21：带“撤销”按钮的操作反馈条，用于删除等可逆操作。
 * 自动经过 options.duration 后消失（不触发撤销）；点“撤销”则执行 onUndo 并收起。
 * 返回 { dismiss }，调用方可主动收起（例如已重新恢复场景）。
 * 仅用 DOM API + addEventListener，无内联脚本（符合 CSP）。
 * @param {string} message - 提示文本
 * @param {Function} onUndo - 点撤销时执行的回调
 * @param {Object} [options] - { duration, label }
 * @returns {{ dismiss: Function }}
 */

// M-01：反馈弹窗入口随实现一起挂载，避免 app.js 引用未定义函数
window.showFeedbackModal = showFeedbackModal;
window.closeFeedbackModal = closeFeedbackModal;
window.handleFeedbackSubmit = handleFeedbackSubmit;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.app = BQ.app || {};
  BQ.app.feedback = { showFeedbackModal: showFeedbackModal, closeFeedbackModal: closeFeedbackModal, handleFeedbackSubmit: handleFeedbackSubmit };
})();
