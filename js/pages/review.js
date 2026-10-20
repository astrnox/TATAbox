/**
 * ============================================================
 * TATABOX — 错题复习推送模块
 * 基于 FSRS 算法，每日推送到期错题
 * ============================================================
 */

(function () {
  'use strict';

  var _currentCards = [];
  var _currentIndex = 0;

  var escapeHtml = window.escapeHtml;

  function _showToast(msg) {
    var existing = document.getElementById('review-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'review-toast';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--color-deep,#1a3a2a);color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;z-index:10000;animation:fadeInUp 0.3s ease;max-width:90%;text-align:center;';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 2500);
  }

  function _renderEmpty(container, msg) {
    container.innerHTML = '<div class="bq-empty-block">' +
      '<div style="font-size:1.2rem;color:var(--color-deep,#1a3a2a);font-weight:600;margin-bottom:8px;">' + escapeHtml(msg || '今日无错题复习') + '</div>' +
      '<div class="bq-text-muted">保持每日练习，错题会自动进入复习队列。</div>' +
      '</div>';
  }

  function _advanceOrDone() {
    _currentIndex++;
    if (_currentIndex < _currentCards.length) {
      _renderCard(document.getElementById('review-container'), _currentCards[_currentIndex]);
    } else {
      _renderDone(document.getElementById('review-container'));
    }
  }

  async function _loadDueCards() {
    var fn = (typeof window.getDueReviewQuestions === 'function') ? window.getDueReviewQuestions : null;
    var cloud = [];
    try {
      if (fn) cloud = (await fn(20)) || [];
    } catch (e) {
      cloud = [];
    }
    if (cloud.length) return cloud;

    // 本地兜底（游客 / 云端无卡）：本地错题本 × 本地 FSRS 卡（bioquest_fsrs_cards）
    // 到期优先级与 fsrs-algorithm.getDueCards 同序（过期越久、遗忘越多越优先）
    try {
      if (!window.FSRS || typeof window.FSRS.getDueCards !== 'function') return [];
      if (typeof window.getWrongQuestions !== 'function') return [];
      var wrongs = window.getWrongQuestions({ limit: 500 });
      if (!Array.isArray(wrongs)) wrongs = (wrongs && (wrongs.items || wrongs.data)) || [];
      var byId = {};
      var ids = [];
      wrongs.forEach(function (w) {
        var id = w && (w.qId || w.question_id || w.id);
        if (!id) return;
        byId[String(id)] = w;
        ids.push(String(id));
      });
      if (ids.length === 0) return [];
      var due = (window.FSRS.getDueCards(ids, Date.now()).due) || [];
      return due.slice(0, 20).map(function (d) {
        var w = byId[String(d.id)] || {};
        var text = w.question_text || w.questionText || (w.fullQuestion && w.fullQuestion.question) || '';
        if (!text) return null;
        return {
          question_id: d.id,
          question_text: text,
          subject: w.subject || w.module || '',
          concept: w.concept || '',
          local: true
        };
      }).filter(Boolean);
    } catch (e) {
      console.warn('[review] 本地复习队列加载失败:', e);
      return [];
    }
  }

  function _renderCard(container, card) {
    var html = '<div class="review-card" style="max-width:720px;margin:0 auto;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<span style="font-size:0.8rem;color:var(--text-muted);">复习 ' + (_currentIndex + 1) + ' / ' + _currentCards.length + '</span>' +
        '<span style="font-size:0.75rem;color:var(--text-muted);background:var(--surface-secondary);padding:3px 10px;border-radius:16px;">' + (card.subject || '生物') + '</span>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid var(--border-light);border-radius:16px;padding:24px;margin-bottom:20px;box-shadow:var(--shadow-md);">' +
        '<div style="font-size:1.1rem;line-height:1.7;color:var(--text-primary);margin-bottom:16px;">' + escapeHtml(card.question_text || '题目内容未保存') + '</div>' +
        (card.concept ? '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">知识点：' + escapeHtml(card.concept) + '</div>' : '') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:12px;">' +
        '<button class="review-btn review-btn--again" data-rating="1">完全忘记</button>' +
        '<button class="review-btn review-btn--hard" data-rating="2">困难</button>' +
        '<button class="review-btn review-btn--good" data-rating="3">记得</button>' +
        '<button class="review-btn review-btn--easy" data-rating="4">轻松</button>' +
      '</div>' +
    '</div>';
    container.innerHTML = html;

    var buttons = container.querySelectorAll('.review-btn');
    buttons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var rating = parseInt(btn.getAttribute('data-rating'), 10);
        _handleRating(card, rating);
      });
    });
  }

  async function _handleRating(card, rating) {
    // 本地卡（游客/云端无卡）：直接推进本地 FSRS 状态
    if (card && card.local) {
      try {
        if (window.FSRS && typeof window.FSRS.reviewCard === 'function') {
          window.FSRS.reviewCard(String(card.question_id), rating);
        }
      } catch (e) { /* 静默 */ }
      _showToast('已按 FSRS 更新该错题的复习计划');
      _advanceOrDone();
      return;
    }
    var reviewFn = (typeof window.reviewQuestion === 'function') ? window.reviewQuestion : null;
    if (!reviewFn) {
      _showToast('复习功能未加载');
      return;
    }
    var result = await reviewFn(card.question_id, rating);
    if (result && result.ok) {
      _advanceOrDone();
    } else {
      _showToast('提交失败：' + (result && result.error ? result.error : '请重试'));
    }
  }

  function _renderDone(container) {
    container.innerHTML = '<div class="bq-empty-block">' +
      '<div class="bq-result-icon">' + BQ_ICONS.checkCircleLarge + '</div>' +
      '<div style="font-size:1.2rem;color:var(--color-deep,#1a3a2a);font-weight:600;margin-bottom:8px;">今日复习完成</div>' +
      '<div class="bq-text-muted">坚持复习，遗忘曲线会记得你的努力。</div>' +
      '</div>';
  }

  function _addStyles() {
    if (document.getElementById('review-module-styles')) return;
    var style = document.createElement('style');
    style.id = 'review-module-styles';
    style.textContent = '.review-btn{padding:14px 12px;border:none;border-radius:12px;font-size:0.95rem;font-weight:600;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;}' +
      '.review-btn:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);}' +
      '.review-btn--again{background:#fff0f0;color:#c0553a;border:1px solid #f0d0d0;}' +
      '.review-btn--hard{background:#fff8e8;color:#c49b30;border:1px solid #f0e0b0;}' +
      '.review-btn--good{background:#f0f8f0;color:#3a8c5c;border:1px solid #d0e8d0;}' +
      '.review-btn--easy{background:#e8f4ff;color:#3a7ac0;border:1px solid #d0e8f8;}';
    document.head.appendChild(style);
  }

  async function initReview() {
    _addStyles();
    var target = document.getElementById('page-content');
    if (!target) return;

    target.innerHTML = '<div class="page-header" style="padding:24px 20px;text-align:center;">' +
      '<h1 style="margin:0;font-family:var(--font-serif,serif);color:var(--color-deep);">今日复习</h1>' +
      '<p style="margin:8px 0 0;color:var(--text-muted);font-size:0.9rem;">基于 FSRS 间隔重复算法推送的错题</p>' +
      '</div>' +
      '<div id="review-container" style="padding:20px;">' +
        '<div class="bq-empty-block bq-text-muted">加载中...</div>' +
      '</div>';

    _currentCards = await _loadDueCards();
    _currentIndex = 0;
    var container = document.getElementById('review-container');
    if (!_currentCards || _currentCards.length === 0) {
      _renderEmpty(container, '今日无到期错题');
      return;
    }
    _renderCard(container, _currentCards[0]);
  }

  window.initReview = initReview;
})();
