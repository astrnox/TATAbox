/**
 * TATABOX — 练习页筛选辅助与错题入口（M-01 渐进拆分）
 * ============================================================
 */
'use strict';

function getModuleGroupBySubject(subject) {
  // 唯一权威映射：QuestionModel.getStatModuleKey（module_1..4，practice/exam/quiz/
  // 每日亿题共用）。练习页分组 id 为 module1..4，由权威键派生，两边口径永不漂移。
  if (typeof QuestionModel !== 'undefined' && typeof QuestionModel.getStatModuleKey === 'function') {
    var key = QuestionModel.getStatModuleKey(subject);
    if (/^module_[1-4]$/.test(key)) {
      var id = 'module' + key.slice(-1);
      var hit = PracticeModuleGroups.find((g) => g.id === id);
      if (hit) return hit;
    }
  }
  return PracticeModuleGroups.find((g) => g.subjects.includes(subject));
}

function getDifficultyLabel(difficulty) {
  // 支持数字难度（1-5）→ 5 级中文标签
  if (typeof difficulty === 'number') {
    if (difficulty === 1) return '简单';
    if (difficulty === 2) return '较易';
    if (difficulty === 3) return '中等';
    if (difficulty === 4) return '较难';
    if (difficulty >= 5) return '困难';
  }
  // 兼容字符串数字
  var num = parseInt(difficulty);
  if (!isNaN(num) && num >= 1 && num <= 5) {
    if (num === 1) return '简单';
    if (num === 2) return '较易';
    if (num === 3) return '中等';
    if (num === 4) return '较难';
    return '困难';
  }
  // 兼容服务器端 basic / league / national
  if (difficulty === 'basic' || difficulty === 'easy') return '简单';
  if (difficulty === 'league') return '中等';
  if (difficulty === 'national' || difficulty === 'hard' || difficulty === 'ibo') return '困难';
  if (difficulty === 'medium') return '中等';
  const opt = DIFFICULTY_OPTIONS.find((d) => d.value === difficulty);
  return opt ? opt.label : difficulty;
}

function getDifficultyClass(difficulty) {
  // 支持数字难度（1-5）
  if (typeof difficulty === 'number') {
    if (difficulty <= 1) return 'tag--success';
    if (difficulty === 2) return 'tag--success';
    if (difficulty === 3) return 'tag--warning';
    if (difficulty === 4) return 'tag--danger';
    return 'tag--danger';
  }
  var num = parseInt(difficulty);
  if (!isNaN(num) && num >= 1 && num <= 5) {
    if (num <= 2) return 'tag--success';
    if (num === 3) return 'tag--warning';
    return 'tag--danger';
  }
  if (difficulty === 'easy' || difficulty === 'basic') return 'tag--success';
  if (difficulty === 'medium' || difficulty === 'league') return 'tag--warning';
  if (difficulty === 'hard' || difficulty === 'national') return 'tag--danger';
  return 'tag--default';
}

/**
 * 筛选面板过渡动画
 * 先淡出再执行回调再淡入
 */
function animateFilterTransition(callback) {
  var panel = document.getElementById('practice-filter-panel');
  if (!panel) {
    callback();
    return;
  }
  panel.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
  panel.style.opacity = '0';
  panel.style.transform = 'translateY(8px)';
  setTimeout(function() {
    callback();
    // 回调后重新获取面板（因为 renderFilterPanel 会重建 DOM）
    var newPanel = document.getElementById('practice-filter-panel');
    if (newPanel) {
      newPanel.style.opacity = '0';
      newPanel.style.transform = 'translateY(8px)';
      // 强制重排以触发过渡
      void newPanel.offsetWidth;
      newPanel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      newPanel.style.opacity = '1';
      newPanel.style.transform = 'translateY(0)';
    }
  }, PRACTICE_PANEL_FADE_MS);
}

function bindWrongPracticeEntry() {
  var wrongEntry = document.getElementById('wrong-practice-entry');
  if (!wrongEntry) return;

  // 显示错题数量
  try {
    var wrongs = typeof getWrongQuestions === 'function' ? getWrongQuestions() : [];
    var countEl = document.getElementById('wrong-practice-count');
    if (countEl) {
      countEl.textContent = wrongs.length > 0 ? wrongs.length + ' 题' : '';
    }
  } catch(e) {}

  wrongEntry.addEventListener('click', function() {
    try {
      var wrongs = typeof getWrongQuestions === 'function' ? getWrongQuestions() : [];
    } catch(e) { wrongs = []; }

    if (wrongs.length === 0) {
      alert('暂无错题，先去练习吧！');
      return;
    }

    // 找出有完整题目数据的错题
    var redoable = [];
    for (var i = 0; i < wrongs.length; i++) {
      var w = wrongs[i];
      if (w.fullQuestion && w.fullQuestion.question) {
        // 确保有足够的 subQuestions
        var q = ensureMinSubQuestions(Object.assign({}, w.fullQuestion));
        redoable.push(q);
      }
    }

    if (redoable.length > 0) {
      // 进入错题循环练习模式
      PracticeState.redoMode = true;
      PracticeState.currentSet = redoable;
      PracticeState.currentIndex = 0;
      PracticeState.totalAnswered = 0;
      PracticeState.totalScore = 0;
      PracticeState.userAnswers = {};
      PracticeState._counted = {};
      PracticeState.submitted = false;
      PracticeState.wrongMarked = new Set();
      PracticeState.moduleStats = {};
      PracticeState.startTime = Date.now();
      PracticeState.started = true;
      PracticeState.favorites = new Set(
        typeof getFavorites === 'function' ? getFavorites() : []
      );

      renderQuiz();
    } else {
      // 没有完整题目数据，尝试逐个重做第一道错题
      if (wrongs.length > 0) {
        var firstWrong = wrongs[0];
        try {
          sessionStorage.setItem('bioquest_redo_question', JSON.stringify(firstWrong));
        } catch(e) {}
        handleRedoQuestion(JSON.stringify(firstWrong));
      } else {
        alert('暂无可重做的错题');
      }
    }
  });
}

// M-01：显式挂载对外入口
window.bindWrongPracticeEntry = bindWrongPracticeEntry;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.helpers = { getModuleGroupBySubject: getModuleGroupBySubject, getDifficultyLabel: getDifficultyLabel, getDifficultyClass: getDifficultyClass, animateFilterTransition: animateFilterTransition, bindWrongPracticeEntry: bindWrongPracticeEntry };
})();
