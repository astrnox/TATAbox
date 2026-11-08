/**
 * TATABOX — 练习页错题重做与界面恢复（M-01 渐进拆分）
 * ------------------------------------------------------------
 * 由 loadModule('practice') 的依赖链先于 practice.js 加载；
 * 运行期依赖 practice.js 的 PracticeState、renderQuiz、showFilterPanel 等。
 * ============================================================
 */
'use strict';

function handleRedoQuestion(redoData) {
  if (!redoData) {
    restorePracticeUI();
    return false;
  }

  // 解析 redoData：可能是 JSON 对象（新格式）或纯文本 qId（旧格式兼容）
  var redoItem = null;
  var redoQId = null;
  try {
    if (typeof redoData === 'string' && redoData.startsWith('{')) {
      redoItem = JSON.parse(redoData);
    }
  } catch (e) {}
  if (redoItem) {
    redoQId = redoItem.questionText || redoItem.qId || '';
  } else {
    redoQId = String(redoData).trim();
  }

  // 方案 A: 有完整题目对象 → 直接使用
  if (redoItem && redoItem.fullQuestion && redoItem.fullQuestion.question) {
    var targetQ = redoItem.fullQuestion;
    if (Array.isArray(targetQ.subQuestions) && targetQ.subQuestions.length >= 4) {

      startRedoSession([targetQ]);
      return true;
    }
    // subQuestions 不够4个但仍有 question，尝试补全
    if (targetQ.question) {

      targetQ = ensureMinSubQuestions(targetQ);
      startRedoSession([targetQ]);
      return true;
    }
  }

  // 方案 B: 有 questionText → 从已加载的题库中搜索
  if (redoQId && redoQId.length > 5) {

    // 搜索全局缓存中的题目
    var allQuestions = PracticeState.allQuestions;
    if (!allQuestions || allQuestions.length === 0) {
      // 尝试从 localStorage 读取错题数据来构造
      try {
        var wrongs = typeof getWrongQuestions === 'function' ? getWrongQuestions() : [];
        wrongs.forEach(function(w) {
          if (w.fullQuestion && Array.isArray(w.fullQuestion.subQuestions)) {
            allQuestions.push(w.fullQuestion);
          }
        });
      } catch(e) {}
    }

    if (allQuestions && allQuestions.length > 0) {
      for (var i = 0; i < allQuestions.length; i++) {
        var q = allQuestions[i];
        if ((q.question || '').indexOf(redoQId.substring(0, 20)) >= 0 ||
            (q.concept || '').indexOf(redoQId.substring(0, 15)) >= 0 ||
            redoQId.indexOf((q.question || '').substring(0, 20)) >= 0 ||
            q.question === redoQId) {

          startRedoSession([q]);
          return true;
        }
      }

      // 二次尝试：按关键词模糊匹配
      if (redoQId.length > 6) {
        var keywords = redoQId.replace(/[【】\[\]()]/g, '').split(/[,，。；\s]+/).filter(function(k) { return k.length > 2; });
        var bestMatch = null;
        var bestScore = 0;
        for (var j = 0; j < allQuestions.length; j++) {
          var qj = allQuestions[j];
          var score = 0;
          for (var ki = 0; ki < keywords.length; ki++) {
            if ((qj.question || '').indexOf(keywords[ki]) !== -1) score++;
          }
          if (score > bestScore) { bestScore = score; bestMatch = qj; }
        }
        if (bestScore >= 2 && bestMatch) {

          startRedoSession([bestMatch]);
          return true;
        }
      }
    }
  }

  // 方案 C: 构造一个最小可用的题目对象（基于错题文本）
  if (redoItem && redoItem.questionText) {

    var fakeQuestion = {
      question: redoItem.questionText,
      subject: redoItem.subject || 'general',
      concept: redoItem.concept || '',
      options: ['A', 'B', 'C', 'D'],
      answer: [],
      explanation: '请根据你的知识作答',
      difficulty: 1,
      module: redoItem.module || 1,
      subQuestions: [
        { text: redoItem.questionText, options: ['A', 'B', 'C', 'D'], answer: [] },
        { text: redoItem.questionText + ' (判断项2)', options: ['A', 'B', 'C', 'D'], answer: [] },
        { text: redoItem.questionText + ' (判断项3)', options: ['A', 'B', 'C', 'D'], answer: [] },
        { text: redoItem.questionText + ' (判断项4)', options: ['A', 'B', 'C', 'D'], answer: [] }
      ]
    };
    startRedoSession([fakeQuestion]);
    return true;
  }

  console.warn('[TATABOX Practice] 无法找到要重做的题目');
  alert('无法加载该题目，可能已被清除或不存在于当前题库中');
  restorePracticeUI();
  return false;
}

/**
 * 确保题目至少有 4 个 subQuestions
 */
function ensureMinSubQuestions(q) {
  // 标准单选题（options+字母答案，如联赛真题 single）走单选渲染分支，
  // 无需 subQuestions；灌入占位判断项反而会被误当作 MTF 判卷
  if (QuestionModel.isStandardChoice(q)) return q;
  if (!Array.isArray(q.subQuestions) || q.subQuestions.length < 4) {
    var existing = q.subQuestions || [];
    var baseText = q.question || '';
    while (existing.length < 4) {
      existing.push({
        label: String.fromCharCode(65 + existing.length),
        text: baseText + ' （判断项' + (existing.length + 1) + '）',
        options: ['A', 'B', 'C', 'D'],
        answer: null
      });
    }
    q.subQuestions = existing;
  }
  // 确保 label
  q.subQuestions.forEach(function(sq, idx) {
    if (!sq.label) sq.label = String.fromCharCode(65 + idx);
  });
  return q;
}

/**
 * 启动错题重做会话（支持单题或多题循环练习）
 * @param {Array} questions - 题目数组（单题重做时传入 [targetQ]，错题专项练习传入多题数组）
 */
function startRedoSession(questions) {
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    console.warn('[TATABOX Practice] startRedoSession: 无有效题目');
    restorePracticeUI();
    return;
  }

  resetSyncCounter(); // 重置同步计数器
  PracticeState.redoMode = true;
  PracticeState.currentSet = questions;
  PracticeState.currentIndex = 0;
  PracticeState.userAnswers = {};
  PracticeState._counted = {};
  PracticeState.submitted = false;
  PracticeState.wrongMarked = new Set();
  PracticeState.totalScore = 0;
  PracticeState.totalAnswered = 0;
  PracticeState.moduleStats = {};
  PracticeState.startTime = Date.now();
  PracticeState.started = true;
  PracticeState.favorites = new Set(
    typeof getFavorites === 'function' ? getFavorites() : []
  );

  renderQuiz();
}

function restorePracticeUI() {
  const root = document.getElementById('practice-root');
  if (!root) return;

  // 确保 loading 屏幕被隐藏
  var loadingScreen = document.getElementById('practiceLoadingScreen');
  if (loadingScreen) {
    loadingScreen.style.display = 'none';
  }

  if (PracticeState.started && PracticeState.currentSet.length > 0) {
    renderQuiz();
  } else {
    PracticeState.started = false;
    PracticeState.redoMode = false;
    renderFilterPanel();
  }
}

// M-01：显式挂载对外入口
window.handleRedoQuestion = handleRedoQuestion;
window.startRedoSession = startRedoSession;
window.restorePracticeUI = restorePracticeUI;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.redo = { handleRedoQuestion: handleRedoQuestion, startRedoSession: startRedoSession, restorePracticeUI: restorePracticeUI };
})();
