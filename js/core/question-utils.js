/* ============================================================
   TATABOX — 题目工具模块
   功能：题目难度自动调整 + 题目反馈（每日限额）
   ============================================================ */

(function() {
  'use strict';


  var DIFFICULTY_LABELS = ['', '简单', '较易', '中等', '较难', '困难'];
  var DIFFICULTY_COLORS = ['', '#3a8c5c', '#5a8c3a', '#c49b30', '#d47030', '#c43838'];
  var MIN_ANSWERS_FOR_ADJUST = 5; // 至少5次答题才调整难度
  var ACCURACY_THRESHOLDS = [0, 0.85, 0.7, 0.5, 0.3, 0]; // 正确率阈值：>=85%→1级, >=70%→2级, >=50%→3级, >=30%→4级, <30%→5级

  /**
   * 获取题目难度统计
   * 返回 { total: 总答题次数, correct: 正确次数, accuracy: 正确率, baseDifficulty: 原始难度, adjustedDifficulty: 调整后难度 }
   */
  function getQuestionDifficultyStats(questionId) {
    var stats = { total: 0, correct: 0, accuracy: 0, baseDifficulty: 3, adjustedDifficulty: 3 };
    try {
      var raw = localStorage.getItem('bioquest_question_stats');
      var allStats = raw ? JSON.parse(raw) : {};
      var key = String(questionId);
      if (allStats[key]) {
        stats.total = allStats[key].total || 0;
        stats.correct = allStats[key].correct || 0;
        stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
        stats.baseDifficulty = allStats[key].baseDifficulty || 3;
        stats.adjustedDifficulty = allStats[key].adjustedDifficulty || stats.baseDifficulty;
      }
    } catch (e) { /* 静默 */ }
    return stats;
  }

  /**
   * 记录一次答题结果并重新计算难度
   * @param {string|number} questionId - 题目ID
   * @param {boolean} isCorrect - 是否答对
   * @param {number} [baseDifficulty=3] - 题目原始难度（1-5）
   */
  function recordQuestionAnswer(questionId, isCorrect, baseDifficulty) {
    if (!questionId) return;
    var key = String(questionId);
    var baseDiff = (baseDifficulty >= 1 && baseDifficulty <= 5) ? baseDifficulty : 3;
    try {
      var raw = localStorage.getItem('bioquest_question_stats');
      var allStats = raw ? JSON.parse(raw) : {};

      if (!allStats[key]) {
        allStats[key] = { total: 0, correct: 0, baseDifficulty: baseDiff, adjustedDifficulty: baseDiff };
      }

      allStats[key].total += 1;
      if (isCorrect) {
        allStats[key].correct += 1;
      }
      allStats[key].baseDifficulty = baseDiff;

      // 重新计算调整后的难度
      var total = allStats[key].total;
      var correct = allStats[key].correct;
      if (total >= MIN_ANSWERS_FOR_ADJUST) {
        var accuracy = correct / total;
        var newDiff = 3; // 默认中等
        // 正确率越高，难度越低（因为题目对用户来说简单）
        if (accuracy >= 0.85) newDiff = Math.max(1, baseDiff - 2);
        else if (accuracy >= 0.70) newDiff = Math.max(1, baseDiff - 1);
        else if (accuracy >= 0.50) newDiff = baseDiff;
        else if (accuracy >= 0.30) newDiff = Math.min(5, baseDiff + 1);
        else newDiff = Math.min(5, baseDiff + 2);
        allStats[key].adjustedDifficulty = newDiff;
      }

      localStorage.setItem('bioquest_question_stats', JSON.stringify(allStats));
    } catch (e) { /* 静默 */ }
  }

  /**
   * 获取题目的显示难度标签
   * @returns {Object} { label, color, level, isAdjusted }
   */
  function getQuestionDifficultyLabel(questionId, baseDifficulty) {
    var stats = getQuestionDifficultyStats(questionId);
    var baseDiff = baseDifficulty || stats.baseDifficulty || 3;
    var adjustedDiff = stats.adjustedDifficulty || baseDiff;
    var isAdjusted = stats.total >= MIN_ANSWERS_FOR_ADJUST && adjustedDiff !== baseDiff;

    return {
      label: DIFFICULTY_LABELS[adjustedDiff] || '中等',
      color: DIFFICULTY_COLORS[adjustedDiff] || '#c49b30',
      level: adjustedDiff,
      baseLevel: baseDiff,
      isAdjusted: isAdjusted,
      total: stats.total,
      accuracy: stats.accuracy
    };
  }

  /**
   * 渲染难度标签HTML
   */
  function renderDifficultyTag(questionId, baseDifficulty) {
    var info = getQuestionDifficultyLabel(questionId, baseDifficulty);
    var arrow = info.isAdjusted
      ? (info.level > info.baseLevel ? ' <span style="font-size:0.65rem;">&#9650;</span>' : ' <span style="font-size:0.65rem;">&#9660;</span>')
      : '';
    var tooltip = info.total >= MIN_ANSWERS_FOR_ADJUST
      ? ('正确率 ' + Math.round(info.accuracy * 100) + '% | ' + info.total + '次答题')
      : ('答题不足' + MIN_ANSWERS_FOR_ADJUST + '次，显示原始难度');

    return '<span class="q-diff-tag" style="background:' + info.color + ';color:#fff;font-size:0.68rem;padding:2px 8px;border-radius:8px;display:inline-flex;align-items:center;gap:2px;cursor:help;" title="' + tooltip + '">'
      + info.label + arrow + '</span>'
      + (info.isAdjusted ? '<span class="q-diff-adjusted" style="font-size:0.6rem;color:var(--text-muted,#8a8a8a);margin-left:2px;" title="已根据正确率自动调整">&#9881;</span>' : '');
  }


  var MAX_FEEDBACKS_PER_DAY = 5;

  /**
   * 获取今日反馈次数
   */
  function getTodayFeedbackCount() {
    try {
      var today = new Date().toISOString().slice(0, 10);
      var raw = localStorage.getItem('bioquest_question_feedbacks');
      var all = raw ? JSON.parse(raw) : [];
      var todayCount = 0;
      for (var i = 0; i < all.length; i++) {
        if (all[i].createdAt && all[i].createdAt.slice(0, 10) === today) {
          todayCount++;
        }
      }
      return todayCount;
    } catch (e) { return 0; }
  }

  /**
   * 获取剩余反馈次数
   */
  function getRemainingFeedbacks() {
    return Math.max(0, MAX_FEEDBACKS_PER_DAY - getTodayFeedbackCount());
  }

  /**
   * 提交题目反馈
   * @param {string|number} questionId - 题目ID
   * @param {string} questionText - 题目内容（截取前100字）
   * @param {string} issueType - 问题类型：wrong_answer, unclear, typo, duplicate, other
   * @param {string} description - 详细描述
   */
  async function submitQuestionFeedback(questionId, questionText, issueType, description) {
    var remaining = getRemainingFeedbacks();
    if (remaining <= 0) {
      return { ok: false, error: '今日反馈次数已用完（每日' + MAX_FEEDBACKS_PER_DAY + '次），请明天再反馈' };
    }

    // 举报/反馈题目需要消耗信用并满足门槛
    if (typeof window.isLoggedIn === 'function' && window.isLoggedIn()) {
      var crCheck = { ok: true };
      try {
        var getCR = (typeof window.getUserPoints === 'function') ? window.getUserPoints : null;
        var adjustCR = (typeof window.adjustUserPoints === 'function') ? window.adjustUserPoints : null;
        var canAct = (typeof window.canPerformAction === 'function') ? window.canPerformAction : null;
        if (getCR && adjustCR && canAct) {
          var crInfo = await getCR();
          crCheck = canAct(crInfo.points, 'report_question');
          if (!crCheck.ok) {
            return { ok: false, error: crCheck.error };
          }
          var costResult = await adjustCR(-crCheck.cost, '举报/反馈题目', { source: 'report_question_cost' });
          if (!costResult || !costResult.ok) {
            return { ok: false, error: '信用扣费失败，请稍后重试' };
          }
        }
      } catch (e) {
        return { ok: false, error: '信用检查失败：' + errText(e) };
      }
    }

    var feedback = {
      id: 'qf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      questionId: String(questionId),
      questionText: (questionText || '').substring(0, 200),
      issueType: issueType || 'other',
      description: (description || '').substring(0, 500),
      createdAt: new Date().toISOString(),
      resolved: false
    };

    try {
      var raw = localStorage.getItem('bioquest_question_feedbacks');
      var all = raw ? JSON.parse(raw) : [];
      all.push(feedback);
      // 只保留最近200条
      if (all.length > 200) {
        all = all.slice(-200);
      }
      localStorage.setItem('bioquest_question_feedbacks', JSON.stringify(all));

      // 同步到云端（如果有登录）；失败时保留本地并告警（管理面板「反馈管理 → 题目反馈」读取）
      if (typeof window.isLoggedIn === 'function' && window.isLoggedIn()) {
        try {
          var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
          if (sb) {
            sb.from('question_feedbacks').insert({
              question_id: String(questionId),
              question_text: feedback.questionText,
              issue_type: issueType,
              description: description || '',
              user_id: window.getCurrentUser() ? window.getCurrentUser().id : null
            }).then(function (res) {
              if (res && res.error) {
                console.warn('[question-feedback] 云端同步失败（本地已保存）:', res.error.message || res.error);
              }
            }).catch(function (e) {
              console.warn('[question-feedback] 云端同步异常（本地已保存）:', e);
            });
          }
        } catch (e) { console.warn('[question-feedback] 云端同步异常（本地已保存）:', e); }
      }

      return { ok: true, remaining: getRemainingFeedbacks(), feedback: feedback };
    } catch (e) {
      return { ok: false, error: '保存失败：' + (e.message || '存储错误') };
    }
  }

  /**
   * 获取题目反馈列表
   */
  function getQuestionFeedbacks(questionId) {
    try {
      var raw = localStorage.getItem('bioquest_question_feedbacks');
      var all = raw ? JSON.parse(raw) : [];
      if (questionId) {
        return all.filter(function(f) { return String(f.questionId) === String(questionId); });
      }
      return all;
    } catch (e) { return []; }
  }

  /**
   * 显示题目反馈弹窗
   */
  function showQuestionFeedbackModal(questionId, questionText) {
    var remaining = getRemainingFeedbacks();
    var issueTypes = [
      { value: 'wrong_answer', label: '答案错误' },
      { value: 'unclear', label: '题目表述不清' },
      { value: 'typo', label: '错别字/格式问题' },
      { value: 'duplicate', label: '题目重复' },
      { value: 'other', label: '其他问题' }
    ];

    var html = '<div class="q-feedback-overlay" id="qFeedbackOverlay">' +
      '<div class="q-feedback-modal">' +
        '<div class="q-feedback-header">' +
          '<h3 style="font-size:1.05rem;color:var(--color-deep,#1a3a2a);margin:0;">题目反馈</h3>' +
          '<button class="q-feedback-close" id="qFeedbackClose">&times;</button>' +
        '</div>' +
        '<div class="q-feedback-body">' +
          '<div class="q-feedback-question" style="background:var(--surface-secondary,#faf7f2);padding:10px 14px;border-radius:8px;font-size:0.85rem;color:var(--text-secondary,#6b7f74);margin-bottom:16px;max-height:80px;overflow:hidden;text-overflow:ellipsis;">' +
            escapeHtml((questionText || '').substring(0, 150)) +
          '</div>' +
          '<div class="bq-mb-12">' +
            '<label style="font-size:0.82rem;color:var(--text-secondary,#6b7f74);display:block;margin-bottom:6px;">问题类型</label>' +
            '<div class="q-feedback-types" style="display:flex;flex-wrap:wrap;gap:8px;">';

    for (var i = 0; i < issueTypes.length; i++) {
      html += '<label class="q-feedback-type-label" style="display:flex;align-items:center;gap:4px;font-size:0.8rem;cursor:pointer;padding:6px 12px;border:1px solid var(--border-light,#ece8e1);border-radius:8px;transition:all 0.15s;">' +
        '<input type="radio" name="qFeedbackType" value="' + issueTypes[i].value + '" ' + (i === 0 ? 'checked' : '') + ' style="accent-color:var(--color-sage,#5a7d5c);">' +
        issueTypes[i].label +
      '</label>';
    }

    html += '</div></div>' +
          '<div class="bq-mb-12">' +
            '<label style="font-size:0.82rem;color:var(--text-secondary,#6b7f74);display:block;margin-bottom:6px;">详细说明（可选）</label>' +
            '<textarea id="qFeedbackDesc" style="width:100%;box-sizing:border-box;min-height:80px;border:1px solid var(--border-light,#ece8e1);border-radius:8px;padding:10px;font-size:0.85rem;font-family:inherit;resize:vertical;" placeholder="请描述具体问题..."></textarea>' +
          '</div>' +
          '<div style="font-size:0.75rem;color:var(--text-muted,#8a8a8a);margin-bottom:16px;">今日剩余反馈次数：<strong style="color:' + (remaining > 0 ? 'var(--color-sage,#5a7d5c)' : '#e53e3e') + ';">' + remaining + '</strong> / ' + MAX_FEEDBACKS_PER_DAY + '</div>' +
          '<button id="qFeedbackSubmit" class="q-feedback-submit-btn" style="width:100%;background:var(--color-sage,#5a7d5c);color:#fff;border:none;padding:12px;border-radius:8px;font-size:0.9rem;cursor:pointer;transition:all 0.15s;' + (remaining <= 0 ? 'opacity:0.5;cursor:not-allowed;' : '') + '"' + (remaining <= 0 ? ' disabled' : '') + '>提交反馈</button>' +
          '<p id="qFeedbackError" style="color:#e53e3e;font-size:0.8rem;margin-top:8px;display:none;"></p>' +
        '</div>' +
      '</div>' +
    '</div>';

    // 移除已有弹窗
    var existing = document.getElementById('qFeedbackOverlay');
    if (existing) existing.remove();

    // 插入DOM
    var container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container.firstElementChild);

    // 绑定事件
    document.getElementById('qFeedbackClose').addEventListener('click', closeQuestionFeedbackModal);
    document.getElementById('qFeedbackOverlay').addEventListener('click', function(e) {
      if (e.target === this) closeQuestionFeedbackModal();
    });

    document.getElementById('qFeedbackSubmit').addEventListener('click', async function() {
      var type = document.querySelector('input[name="qFeedbackType"]:checked');
      var issueType = type ? type.value : 'other';
      var desc = document.getElementById('qFeedbackDesc').value.trim();
      var errorEl = document.getElementById('qFeedbackError');

      var result = await submitQuestionFeedback(questionId, questionText, issueType, desc);
      if (result.ok) {
        // 显示成功
        var btn = document.getElementById('qFeedbackSubmit');
        btn.textContent = '反馈成功！';
        btn.style.background = '#3a8c5c';
        if (typeof window.showToast === 'function') {
          window.showToast('反馈已提交，感谢！剩余' + result.remaining + '次');
        }
        setTimeout(function() { closeQuestionFeedbackModal(); }, 1200);
      } else {
        errorEl.textContent = result.error;
        errorEl.style.display = 'block';
      }
    });

    // 添加CSS动画样式
    var style = document.createElement('style');
    style.textContent = '.q-feedback-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;}.q-feedback-modal{background:var(--surface-primary,#fff);border-radius:16px;width:90%;max-width:420px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow-floating);animation:slideUp 0.3s ease;}.q-feedback-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border-light,#ece8e1);}.q-feedback-close{background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-muted,#8a8a8a);padding:0;line-height:1;}.q-feedback-body{padding:16px 20px 20px;}.q-feedback-type-label:hover{border-color:var(--color-sage,#5a7d5c);background:rgba(90,125,92,0.05);}.q-feedback-type-label input[type="radio"]:checked + span{color:var(--color-sage,#5a7d5c);}.q-feedback-submit-btn:hover:not(:disabled){background:var(--color-deep,#1a3a2a);}.q-feedback-submit-btn:disabled{opacity:0.5;cursor:not-allowed;}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(style);
  }

  function closeQuestionFeedbackModal() {
    var overlay = document.getElementById('qFeedbackOverlay');
    if (overlay) overlay.remove();
  }

  var escapeHtml = window.escapeHtml;

  // 导出到全局
  window.getQuestionDifficultyStats = getQuestionDifficultyStats;
  window.recordQuestionAnswer = recordQuestionAnswer;
  window.getQuestionDifficultyLabel = getQuestionDifficultyLabel;
  window.renderDifficultyTag = renderDifficultyTag;
  window.getTodayFeedbackCount = getTodayFeedbackCount;
  window.getRemainingFeedbacks = getRemainingFeedbacks;
  window.submitQuestionFeedback = submitQuestionFeedback;
  window.getQuestionFeedbacks = getQuestionFeedbacks;
  window.showQuestionFeedbackModal = showQuestionFeedbackModal;
  window.closeQuestionFeedbackModal = closeQuestionFeedbackModal;

})();