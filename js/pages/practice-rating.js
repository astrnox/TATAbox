/**
 * TATABOX — 练习页题目评分与标签（M-01 渐进拆分）
 * ------------------------------------------------------------
 * 由 loadModule('practice') 的依赖链先于 practice.js 加载；
 * 运行期依赖 practice.js 的 PracticeState、PracticeModuleGroups 等。
 * ============================================================
 */
'use strict';

function _getQuestionRating(q) {
  if (typeof getQuestionRating === 'function') {
    const r = getQuestionRating(getQuestionBioId(q));
    if (r) return r;
  }
  return { up: 0, down: 0 };
}

/**
 * 判断题目是否在回收站（低分被下架）。storage.js 未加载时直读 localStorage。
 */
function _isRecycledQuestion(q) {
  const qId = getQuestionBioId(q);
  if (typeof isQuestionRecycled === 'function') {
    return isQuestionRecycled(qId);
  }
  try {
    const list = JSON.parse(localStorage.getItem('tatabox_question_recycled') || '[]');
    return Array.isArray(list) && list.indexOf(qId) !== -1;
  } catch (e) {
    return false;
  }
}

/**
 * 读取题目点赞/点踩计数（未投票时 0/0）。
 */
function _getRatingCounts(qId) {
  if (typeof getQuestionRating === 'function') {
    const r = getQuestionRating(qId);
    if (r) return r;
  }
  return { up: 0, down: 0 };
}

/**
 * 当前用户对题目的投票（1=赞, -1=踩, 0=未投）。
 */
function _getMyVote(qId) {
  if (typeof getMyVote === 'function') {
    const v = getMyVote(qId);
    return (v === 1 || v === -1) ? v : 0;
  }
  return 0;
}

/**
 * 渲染考试来源 tag（联赛真题带 year/source，按原标签规范复用既有
 * .tag tag--outline 类目，不新增标签类别）：
 * - 有 source（如「2001 年全国中学生生物学联赛（CnBO）第 1 题 · 试卷名」）
 *   → 取「第 N 题」前的考试名短标签，完整信息放 title；
 * - 无 source 但有 competition → 显示 competition 简称；
 * - 两者皆无 → 返回空串（旧题库题不受影响）。
 */
function _renderExamSourceTag(q) {
  if (!q) return '';
  const src = typeof q.source === 'string' ? q.source.trim() : '';
  if (src) {
    const label = src.replace(/\s*第\s*\d+\s*题.*$/, '').trim() || src;
    return '<span class="tag tag--outline" title="' + escapeHtml(src) + '">' +
      escapeHtml(label.length > 40 ? label.slice(0, 40) + '…' : label) + '</span>';
  }
  if (q.competition) {
    return '<span class="tag tag--outline">' + escapeHtml(String(q.competition)) + ' 真题</span>';
  }
  return '';
}

/**
 * 渲染题目评分 tag（展示在题目标签组中）：
 * - 有票时显示平滑评分（带中性先验）映射的 1~5 星分 + 票数；
 * - 无票时显示「未评分」。
 */
function _renderRatingTag(q, qId) {
  const counts = _getRatingCounts(qId);
  const hasVotes = (counts.up + counts.down) > 0;
  const rc = (typeof window.RatingCore === 'object') ? window.RatingCore : null;
  if (!rc || !hasVotes) {
    return '<span class="tag" data-rating-tag style="background:rgba(107,114,128,0.08);color:#6b7280;font-size:0.7rem;" title="暂无评分，点赞/点踩后可查看">评分 未评价</span>';
  }
  const score01 = rc.wilsonScore(counts.up, counts.down);
  const scoreStr = rc.formatQuestionScore(score01);
  const weight = rc.ratingWeight(score01);
  const recycled = _isRecycledQuestion(q);
  const color = recycled ? '#ef4444' : (score01 >= 0.6 ? '#10b981' : (score01 >= 0.4 ? '#c4956a' : '#ef4444'));
  return `<span class="tag" data-rating-tag style="background:${color}18;color:${color};font-size:0.7rem;font-weight:600;" title="基于 ${counts.up + counts.down} 票的平滑评分（中性起步）；出现率权重 ${weight.toFixed(2)}×">评分 ${scoreStr} · ${counts.up + counts.down}票${recycled ? ' · 已回收' : ''}</span>`;
}

/**
 * 点赞/点踩处理：更新本地聚合评分；评分过低且票数足够时自动移入回收站。
 */
function handleVoteQuestion(vote) {
  const q = PracticeState.currentSet[PracticeState.currentIndex];
  if (!q) return;
  const qId = getQuestionBioId(q);
  if (typeof rateQuestion !== 'function') return;

  // 相同方向再点一次 = 取消投票
  const myVote = _getMyVote(qId);
  const nextVote = (myVote === vote) ? 0 : vote;
  const result = rateQuestion(qId, nextVote);
  if (!result) return;

  // 低分（平滑评分 < 0.35 且票数 >= 5）自动移入回收站
  const rc = (typeof window.RatingCore === 'object') ? window.RatingCore : null;
  if (rc && typeof recycleQuestion === 'function' && rc.shouldRecycleQuestion(result.up, result.down)) {
    recycleQuestion(qId);
    // 重新生成题目集合，让回收的题从后续练习中消失
    if (PracticeState.currentIndex >= PracticeState.currentSet.length - 1) {
      PracticeState.currentSet = generateQuestionSet();
      PracticeState.currentIndex = 0;
      PracticeState.userAnswers = {};
      PracticeState.submitted = false;
      if (PracticeState.currentSet.length === 0) {
        // 题库已全部被回收/过滤：回到筛选面板而非残留旧题界面
        PracticeState.started = false;
        showFilterPanel();
        return;
      }
      // 集合已重建，必须重绘当前题（否则界面仍显示已回收的旧题，提交会答到错误的题上）
      renderQuiz();
      return;
    }
  }

  // 原地刷新评分 tag 与投票按钮（不整题重渲染）
  _refreshVoteUI(q, qId);
}

/**
 * 原地更新投票按钮计数/激活态与评分 tag。
 */
function _refreshVoteUI(q, qId) {
  const counts = _getRatingCounts(qId);
  const upCount = document.getElementById('practice-vote-up-count');
  const downCount = document.getElementById('practice-vote-down-count');
  if (upCount) upCount.textContent = String(counts.up);
  if (downCount) downCount.textContent = String(counts.down);

  const upBtn = document.getElementById('practice-vote-up-btn');
  const downBtn = document.getElementById('practice-vote-down-btn');
  const myVote = _getMyVote(qId);
  if (upBtn) upBtn.classList.toggle('practice-vote-active', myVote === 1);
  if (downBtn) downBtn.classList.toggle('practice-vote-active', myVote === -1);
  if (upBtn) upBtn.classList.toggle('practice-vote-up-active', myVote === 1);
  if (downBtn) downBtn.classList.toggle('practice-vote-down-active', myVote === -1);

  // 刷新 tag 行内的评分标签
  const tags = document.querySelector('.practice-quiz-tags');
  if (tags) {
    const oldTag = tags.querySelector('[data-rating-tag]');
    const newTagHtml = _renderRatingTag(q, qId);
    if (oldTag) oldTag.outerHTML = newTagHtml;
    else tags.insertAdjacentHTML('beforeend', newTagHtml);
  }
}

/**
 * 出题时对每个子题做「显示层重排」：
 * - 题库本体固定不动，仅把每个选项的 (text, answer) 一起洗牌到槽位。
 * - 槽位标签恒为 A/B/C/D 自上而下正序，用户所见始终按 abcd 排列。
 * - 正确/错误的判断随文本走（answer 与 text 绑定），洗牌只改顺序不改正确性。
 * - 解析按「原始标签 → 新槽位」重映射字母注解，保证对/错解析与随机后选项一致。
 */

// M-01：显式挂载对外入口
window.handleVoteQuestion = handleVoteQuestion;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.rating = { handleVoteQuestion: handleVoteQuestion, renderExamSourceTag: _renderExamSourceTag, renderRatingTag: _renderRatingTag };
})();
