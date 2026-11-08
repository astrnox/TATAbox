/**
 * TATABOX — 练习页「题目分享 / 深链」子模块（M-01 渐进拆分）
 * ------------------------------------------------------------
 * 由 loadModule('practice') 的依赖链先于 practice.js 加载；
 * 运行期依赖 practice.js 的全局：PracticeState、题库加载、renderQuiz 等。
 * 函数名与调用方保持不变，practice.js 仍可直接调用这些全局函数。
 * ============================================================
 */
'use strict';

/**
 * 分享当前题目：生成 #/practice?share=<题目文本> 深链
 * 移动端优先走 Web Share API（原生分享面板），否则复制链接 + toast 反馈
 */
function handleShareCurrentQuestion() {
  var q = PracticeState.currentSet[PracticeState.currentIndex];
  if (!q || !q.question) {
    showToast('没有可分享的题目');
    return;
  }

  var shareKey = _practiceShareKey(q.question);
  var url = window.location.origin + window.location.pathname +
    '#/practice?share=' + encodeURIComponent(shareKey);
  // 附带稳定题目 ID（loader 注入的 bioID / Supabase id）：接收端优先按 ID 定位，
  // 题库修订、文本微调或题目被过滤后，纯文本匹配失效时仍可打开对应题目。
  if (q.id != null && String(q.id) !== '') {
    url += '&qid=' + encodeURIComponent(String(q.id));
  }

  // 移动端原生分享（微信等渠道打开时直接带链接）
  if (typeof navigator !== 'undefined' && navigator.share) {
    navigator.share({
      title: 'TATABOX · 好题分享',
      text: (q.question || '').slice(0, 80) + '……（来自 TATABOX 刷题）',
      url: url
    }).catch(function (e) {
      // 用户取消分享不视为错误；其余情况回退到复制链接
      if (e && e.name === 'AbortError') return;
      _practiceShareCopy(url);
    });
    return;
  }
  _practiceShareCopy(url);
}

function _practiceShareCopy(url) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () {
      showToast('链接已复制，发给好友即可查看本题');
    }).catch(function () {
      showToast('分享链接: ' + url);
    });
  } else {
    showToast('分享链接: ' + url);
  }
}

/**
 * 题目文本 → 稳定分享键：折叠空白并去首尾
 * 生成与解析两端统一使用，保证深链在题库格式变化时仍可命中
 */
function _practiceShareKey(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/**
 * 依据分享键查找题目（练习题库 + 逻辑推理题库双源检索）
 * 优先精确匹配；其次前缀匹配（题库轻微修订后分享链接仍可用）
 * 先查全量原始副本（含被回收/过滤的题），再查过滤后的常用池。
 */
function findPracticeQuestionByShareKey(shareKey) {
  if (!shareKey) return null;
  var norm = _practiceShareKey(shareKey);
  if (!norm) return null;
  var prefix = norm.slice(0, 40);

  var pools = [];
  if (Array.isArray(PracticeState.allQuestionsRaw) && PracticeState.allQuestionsRaw.length > 0) {
    pools.push(PracticeState.allQuestionsRaw);
  }
  if (Array.isArray(PracticeState.allQuestions) && PracticeState.allQuestions.length > 0) {
    pools.push(PracticeState.allQuestions);
  }
  if (Array.isArray(PracticeState.leagueData) && PracticeState.leagueData.length > 0) {
    pools.push(PracticeState.leagueData);
  }
  if (Array.isArray(PracticeState.logicData) && PracticeState.logicData.length > 0) {
    pools.push(PracticeState.logicData);
  }

  for (var pi = 0; pi < pools.length; pi++) {
    var pool = pools[pi];
    // 精确匹配
    for (var i = 0; i < pool.length; i++) {
      if (_practiceShareKey(pool[i].question) === norm) return pool[i];
    }
    // 前缀兜底
    for (var j = 0; j < pool.length; j++) {
      var qn = _practiceShareKey(pool[j].question);
      if ((prefix && (qn.slice(0, 40) === prefix || norm.slice(0, 40) === qn.slice(0, 40)))) return pool[j];
    }
  }
  return null;
}

/**
 * 依据题目 ID（bioID / Supabase id）查找题目，优先于文本匹配：
 * 题库修订、文本微调或题目被过滤后，分享链接仍可打开。
 * @param {string|null} qid
 * @returns {*} 命中的题目对象，未命中返回 null
 */
function findPracticeQuestionById(qid) {
  if (qid == null || String(qid) === '') return null;
  var target = String(qid);
  var pools = [];
  if (Array.isArray(PracticeState.allQuestionsRaw) && PracticeState.allQuestionsRaw.length > 0) {
    pools.push(PracticeState.allQuestionsRaw);
  }
  if (Array.isArray(PracticeState.allQuestions) && PracticeState.allQuestions.length > 0) {
    pools.push(PracticeState.allQuestions);
  }
  if (Array.isArray(PracticeState.leagueData) && PracticeState.leagueData.length > 0) {
    pools.push(PracticeState.leagueData);
  }
  if (Array.isArray(PracticeState.logicData) && PracticeState.logicData.length > 0) {
    pools.push(PracticeState.logicData);
  }
  for (var pi = 0; pi < pools.length; pi++) {
    var pool = pools[pi];
    for (var i = 0; i < pool.length; i++) {
      if (pool[i] && String(pool[i].id) === target) return pool[i];
    }
  }
  return null;
}

/**
 * 分享预览会话：单题 + 自动提交满分答案
 * 打开分享链接的人直接看到正确答案与解析，无需先作答
 */
function startSharePreviewSession(q) {
  if (!q) return;
  q = ensureMinSubQuestions(q);

  resetSyncCounter();
  PracticeState.redoMode = false;
  PracticeState.currentSet = [q];
  PracticeState.currentIndex = 0;
  PracticeState.started = true;
  PracticeState.submitted = true;
  PracticeState.wrongMarked = new Set();
  PracticeState.moduleStats = {};
  PracticeState.startTime = Date.now();
  PracticeState.favorites = new Set(
    typeof getFavorites === 'function' ? getFavorites() : []
  );

  // 自动填入正确答案，使渲染直接呈现"已作答满分"状态 + 解析
  var isLogic = QuestionModel.isLogicChoice(q);
  var isStd = QuestionModel.isStandardChoice(q);
  var y = {};
  if (isLogic || isStd) {
    y[0] = q.answer;
  } else {
    (getEffectiveSubQuestions(q) || []).forEach(function (sq, idx) {
      y[idx] = !!sq.answer;
    });
  }
  PracticeState.userAnswers = { 0: y };
  PracticeState._counted = {};
  PracticeState.totalAnswered = 0;
  PracticeState.totalScore = 0;

  var res = calculateQuestionScore(q, y);
  PracticeState.totalScore = res.score || 0;
  PracticeState.totalAnswered = res.total || 0;

  renderQuiz();
}

/**
 * 处理 #/practice?share=<key> 深链：
 * 确保题库加载完成 → 优先按 qid 定位，其次按文本匹配 → 以"答案预览"方式打开
 */
async function handleShareQuestionDeepLink(shareKey, shareQid) {
  var root = document.getElementById('practice-root');
  if (!root || (!shareKey && !shareQid)) return false;

  function showSpinner() {
    root.innerHTML =
      '<div style="text-align:center;padding:64px 20px;">' +
        '<div style="width:34px;height:34px;margin:0 auto 16px;border:3px solid rgba(90,125,92,0.15);border-top-color:var(--color-sage,#5a7d5c);border-radius:50%;animation:spin 0.8s linear infinite;"></div>' +
        '<p style="color:var(--text-muted, #8a8a8a);font-size:0.9rem;">正在打开分享的题目…</p>' +
      '</div>';
  }
  showSpinner();

  // 题库未加载时先拉取（与正常练习同源，覆盖 MTF 题库 + 逻辑推理 + 联赛真题）
  if (!PracticeState.allQuestions || PracticeState.allQuestions.length === 0 || !PracticeState.logicLoaded) {
    try {
      await Promise.all([loadPracticeQuestions(), loadLogicQuestions(), loadLeagueQuestions()]);
    } catch (e) {}
  }

  // 优先按稳定 ID 定位；无 ID 或未命中时回退文本匹配（含全量原始副本）
  var found = shareQid ? findPracticeQuestionById(shareQid) : null;
  if (!found && shareKey) found = findPracticeQuestionByShareKey(shareKey);
  if (!found) {
    root.innerHTML =
      '<div style="text-align:center;padding:64px 20px;">' +
        '<p style="color:var(--text-secondary, #5a6b5e);margin-bottom:6px;">没有找到这道题目</p>' +
        '<p style="color:var(--text-muted, #8a9a8e);font-size:0.85rem;margin-bottom:20px;">题目可能已下架或题库已更新，可尝试重新加载题库</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
          '<button id="practice-share-retry-btn" style="padding:8px 22px;background:var(--color-sage,#5a7d5c);color:#fff;border:none;border-radius:16px;font-size:0.85rem;cursor:pointer;">重新加载并重试</button>' +
          '<button id="practice-share-notfound-btn" style="padding:8px 22px;background:transparent;color:var(--color-sage,#5a7d5c);border:1px solid var(--color-sage,#5a7d5c);border-radius:16px;font-size:0.85rem;cursor:pointer;">去练习</button>' +
        '</div>' +
      '</div>';
    var retryBtn = document.getElementById('practice-share-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        // 清空已缓存题库后重试，处理冷启动/网络抖动导致的首次加载不完整
        PracticeState.allQuestions = null;
        PracticeState.allQuestionsRaw = null;
        PracticeState.logicLoaded = false;
        handleShareQuestionDeepLink(shareKey, shareQid);
      });
    }
    var notfoundBtn = document.getElementById('practice-share-notfound-btn');
    if (notfoundBtn) {
      notfoundBtn.addEventListener('click', function () {
        PracticeState.started = false;
        PracticeState.redoMode = false;
        renderFilterPanel();
      });
    }
    return false;
  }

  startSharePreviewSession(found);
  return true;
}

// M-01：显式挂载对外入口（practice.js / bindQuizEvents 仍按全局名调用）
window.handleShareCurrentQuestion = handleShareCurrentQuestion;
window.handleShareQuestionDeepLink = handleShareQuestionDeepLink;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.share = {
    handleShareCurrentQuestion: handleShareCurrentQuestion,
    handleShareQuestionDeepLink: handleShareQuestionDeepLink
  };
})();
