/**
 * TATABOX — 练习页答题流程与判卷（M-01 渐进拆分）
 * ------------------------------------------------------------
 * 由 loadModule('practice') 的依赖链先于 practice.js 加载；
 * 运行期依赖 practice.js 的 PracticeState、renderQuiz、showToast、syncScoreToServer 等。
 * 判卷薄封装统一指向 QuestionModel 内核。
 * ============================================================
 */
'use strict';

function preparePracticeQuestion(q) {
  if (!q || typeof q !== 'object') return q;
  // 管理员对本地题库的覆盖修改（题干/选项/解析等）在出题时生效
  if (typeof applyQuestionOverride === 'function') {
    q = applyQuestionOverride(q);
  }
  if (!Array.isArray(q.subQuestions) || q.subQuestions.length < 2) {
    return q;
  }
  // 深拷贝每个子题，避免改动题库本体的对象
  const items = q.subQuestions.map(function (s) { return Object.assign({}, s); });
  // Fisher–Yates 洗牌：只重排顺序，不改正确性
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  // 槽位标签正序 A/B/C/D…
  const slotLabels = 'ABCDEF'.split('');
  const labelMap = {};
  for (let i = 0; i < items.length; i++) {
    const orig = items[i].label || slotLabels[i];
    labelMap[orig] = slotLabels[i];
    items[i].label = slotLabels[i];
  }
  // 解析字母注解按「原标签 → 新槽位」重映射，避免解析与随机后选项错位
  const explanation = (typeof q.explanation === 'string' && q.explanation)
    ? q.explanation.replace(/(^|\n)([A-D])(\s*【)/g, function (m, pre, L, br) {
        return pre + (labelMap[L] || L) + br;
      })
    : q.explanation;
  return Object.assign({}, q, { subQuestions: items, explanation: explanation });
}

/**
 * 逻辑题 MTF 化的「有效子题」—— 已抽至全局内核 js/core/question-model.js：
 * - 已有 subQuestions（基础知识 MTF）直接返回；
 * - 逻辑题 type==='mtf' 且为 options 数组时，以 mtfTruth（缺省按原单选语义）
 *   把每个选项转换为一条判断题陈述；转换不写入题库本体（不参与洗牌）。
 * 此处保留同名薄封装，供页面内既有调用点与回归测试使用（唯一实现在内核）。
 */
function getEffectiveSubQuestions(q) {
  return QuestionModel.getEffectiveSubQuestions(q);
}

function initNewSession() {
  resetSyncCounter(); // 重置同步计数器
  PracticeState.currentSet = generateQuestionSet();
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
  PracticeState.redoMode = false;

  PracticeState.favorites = new Set(
    typeof getFavorites === 'function' ? getFavorites() : []
  );
}

/**
 * 单题判卷（练习档 2.0 分制）—— 薄封装：
 * 唯一权威实现在 js/core/question-model.js 的 gradeQuestion(q, ua, 'practice')。
 * 返回形状 { correct, total, score, details } 与页面/records 消费方保持一致。
 */
function calculateQuestionScore(q, userAnswers) {
  const g = QuestionModel.gradeQuestion(q, userAnswers, 'practice');
  return { correct: g.correct, total: g.total, score: g.score, details: g.details };
}

function getModuleIdFromQuestion(q) {
  const group = getModuleGroupBySubject(q.subject);
  return group ? group.id : 'unknown';
}

function updateStatsForQuestion(q, userAnswers) {
  const result = calculateQuestionScore(q, userAnswers);
  const { correct, total } = result;
  const moduleId = getModuleIdFromQuestion(q);

  PracticeState.totalAnswered++;
  PracticeState.totalScore += result.score;

  if (!PracticeState.moduleStats[moduleId]) {
    PracticeState.moduleStats[moduleId] = { total: 0, correct: 0, score: 0, subTotal: 0, subCorrect: 0 };
  }
  PracticeState.moduleStats[moduleId].total++;
  PracticeState.moduleStats[moduleId].score += result.score;
  PracticeState.moduleStats[moduleId].subTotal += total;
  PracticeState.moduleStats[moduleId].subCorrect += correct;

  const isFullyCorrect = correct === total;
  if (isFullyCorrect) {
    PracticeState.moduleStats[moduleId].correct++;
  }

  // v4.0 苏格拉底同学触发：答错/答对上报（用于共情模式检测）
  if (typeof window.BioQuestClassmate === 'object' && window.BioQuestClassmate) {
    try {
      if (isFullyCorrect) {
        if (typeof window.BioQuestClassmate.onCorrectAnswer === 'function') {
          window.BioQuestClassmate.onCorrectAnswer();
        }
      } else {
        if (typeof window.BioQuestClassmate.onWrongAnswer === 'function') {
          window.BioQuestClassmate.onWrongAnswer({
            question: q.question || (q.subQuestions && q.subQuestions[0] && q.subQuestions[0].question) || '',
            concept: q.subject || '',
            subject: q.subject || '',
            source: 'practice'
          });
        }
      }
    } catch (e) { /* 静默失败，不影响练习流程 */ }
  }

  // 全局模块统计已收敛到 BioQuestSession.question（record-session.js），
  // 统计键由 QuestionModel.getStatModuleKey 统一映射，此处不再重复写入。

  // 触发分数成就检查
  if (typeof checkAchievement === 'function' && typeof getCurrentUser === 'function') {
    var user = getCurrentUser();
    if (user && user.bio_score) {
      checkAchievement('score', user.bio_score);
    }
  }
  // 触发答题数量成就检查
  if (typeof checkAchievement === 'function' && typeof getCurrentUser === 'function') {
    var user = getCurrentUser();
    if (user) {
      var totalAnswered = (user.total_answered || 0) + 1;
      checkAchievement('questions', totalAnswered);
    }
  }

  // 统一落盘入口（js/core/record-session.js）：模块统计 + 难度自适应 +
  // 错题本（云端复习卡）+ 信用点（0.5/0.1）+ 打卡 + 首次练习成就。
  // 科目→模块键由 QuestionModel.getStatModuleKey 自动映射，与考试/排行榜同构。
  if (window.BioQuestSession && typeof window.BioQuestSession.question === 'function') {
    window.BioQuestSession.question({
      module: 'practice',
      q: q,
      correct: isFullyCorrect,
      checkin: true,
      achievements: [{ type: 'practice', value: 1 }]
    });
  }
}

function handleSubmitAnswer() {
  if (PracticeState.submitted) return;

  // 每日打卡 / 首次练习成就：已收敛到 BioQuestSession.question（每题提交时触发）

  const q = PracticeState.currentSet[PracticeState.currentIndex];
  const userAnswers = PracticeState.userAnswers[PracticeState.currentIndex] || {};

  // 标准单选题（题库格式）/ 逻辑推理题 —— 题型判定统一走内核
  const isStandardChoice = QuestionModel.isStandardChoice(q);
  const isLogicQuestion = QuestionModel.isLogicChoice(q);

  if (isStandardChoice || isLogicQuestion) {
    if (userAnswers[0] === undefined || userAnswers[0] === null) {
      alert('请选择一个答案后再提交。');
      return;
    }
  } else {
    // MTF 题型：检查是否所有子问题都已回答
    const subQuestions = getEffectiveSubQuestions(q);
    const allAnswered = subQuestions.every((_, idx) => userAnswers.hasOwnProperty(idx));
    if (!allAnswered) {
      alert('请对所有选项做出判断后再提交。');
      return;
    }
  }

  PracticeState.submitted = true;
  // 统计仅在首次提交时计入：R 键重做后再次提交不会重复计数
  // （bio_score / 错题本 / 成就 / 难度统计均只触发一次）
  if (!PracticeState._counted) PracticeState._counted = {};
  if (!PracticeState._counted[PracticeState.currentIndex]) {
    PracticeState._counted[PracticeState.currentIndex] = true;
    updateStatsForQuestion(q, userAnswers);
    // 每提交一题后检查是否需要同步分数到服务器
    checkAndSyncScore();
  }
  renderQuiz();
}

function handleToggleAnswer(subIdx, value) {
  if (PracticeState.submitted) return;

  const qIdx = PracticeState.currentIndex;
  if (!PracticeState.userAnswers[qIdx]) {
    PracticeState.userAnswers[qIdx] = {};
  }

  PracticeState.userAnswers[qIdx][subIdx] = value;
  // 原地切换「正确/错误」按钮选中态，避免整题重渲染（含淡入动画）被感知为页面刷新
  const root = document.getElementById('practice-root');
  if (root) {
    root.querySelectorAll('.practice-tf-btn[data-sub-idx="' + subIdx + '"]').forEach(function (btn) {
      const on = btn.getAttribute('data-value') === String(value);
      btn.classList.toggle('practice-tf-active', on);
      btn.classList.toggle('practice-tf-true', on && value === true);
      btn.classList.toggle('practice-tf-false', on && value === false);
    });
  }
}

/**
 * Issue #10：解析题目稳定 bioID。
 * 优先级：q.bioId > q.id（分片题库加载时已注入稳定 bioID）> 旧 hash 回退。
 * 旧 hash/数字 ID 会通过 bioid-map.json（window.bioIdMap）映射为稳定 bioID，
 * 保证本地收藏/错题与题库引用一致，避免刷新后失配。
 */
function getQuestionBioId(q) {
  if (!q) return '';
  var raw = q.bioId || q.id;
  if (raw === undefined || raw === null || raw === '') {
    raw = String(hashQuestionId((q.question || '') + (q.concept || '')));
  }
  if (typeof window.resolveQuestionBioId === 'function') {
    return String(window.resolveQuestionBioId(raw));
  }
  return String(raw);
}

function handleToggleFavorite() {
  const q = PracticeState.currentSet[PracticeState.currentIndex];
  if (!q) return;

  const qId = getQuestionBioId(q);

  if (typeof toggleFavorite === 'function') {
    const isFav = toggleFavorite(qId);
    if (isFav) {
      PracticeState.favorites.add(qId);
    } else {
      PracticeState.favorites.delete(qId);
    }
  }
  // 原地更新收藏按钮状态，避免整题重渲染（含淡入动画）被感知为页面刷新
  const favBtn = document.getElementById('practice-fav-btn');
  if (favBtn) {
    const isFav = PracticeState.favorites.has(qId);
    favBtn.classList.toggle('practice-fav-active', isFav);
    favBtn.setAttribute('title', isFav ? '取消收藏' : '收藏题目');
    const svgPath = favBtn.querySelector('polygon');
    if (svgPath) svgPath.setAttribute('fill', isFav ? 'currentColor' : 'none');
    if (favBtn.lastChild && favBtn.lastChild.nodeType === 3) {
      favBtn.lastChild.textContent = isFav ? '已收藏' : '收藏';
    }
  }
}

function handleMarkWrong() {
  const q = PracticeState.currentSet[PracticeState.currentIndex];
  if (!q) return;

  const qId = getQuestionBioId(q);

  if (PracticeState.wrongMarked.has(qId)) {
    PracticeState.wrongMarked.delete(qId);
    if (typeof removeWrongQuestion === 'function') {
      removeWrongQuestion(qId);
    }
  } else {
    PracticeState.wrongMarked.add(qId);
    if (typeof addWrongQuestion === 'function') {
      addWrongQuestion(qId, q.subject || 'general', q.question || '', q);
    }
  }
  // 原地更新错题标记按钮状态，避免整题重渲染（含淡入动画）被感知为页面刷新
  const wrongBtn = document.getElementById('practice-wrong-btn');
  if (wrongBtn) {
    const isWrong = PracticeState.wrongMarked.has(qId);
    wrongBtn.classList.toggle('practice-wrong-active', isWrong);
    wrongBtn.setAttribute('title', isWrong ? '取消标记' : '标记错题');
    if (wrongBtn.lastChild && wrongBtn.lastChild.nodeType === 3) {
      wrongBtn.lastChild.textContent = isWrong ? '已标记' : '错题';
    }
  }
}

function handleNextQuestion() {
  if (PracticeState.currentIndex < PracticeState.currentSet.length - 1) {
    PracticeState.currentIndex++;
    PracticeState.submitted = false;
    renderQuiz();
  } else {
    savePracticeRecord();
    showSummary();
  }
}

function savePracticeRecord() {
  const duration = Math.floor((Date.now() - PracticeState.startTime) / 1000);

  // 统一落盘入口（js/core/record-session.js）：练习记录 saveRecord + bio 分
  // 六维重算与云端同步。模块统计/打卡/成就/错题/信用已由每题的
  // BioQuestSession.question 写入，此处 stats/checkin 关闭防双计。
  if (!window.BioQuestSession || typeof window.BioQuestSession.finish !== 'function') return;
  window.BioQuestSession.finish({
    module: 'practice',
    duration,
    questions: PracticeState.currentSet.map((q, i) => {
      const ua = PracticeState.userAnswers[i] || {};
      const result = calculateQuestionScore(q, ua);
      return {
        q,
        questionId: getQuestionBioId(q),
        userAnswers: ua,
        score: result.score,
        // 满分口径：练习总账「满分 = 题数 × 单题满分 2.0」（result.total 是计分项数，
        // 不是分值——混用会让记录页显示「20 / 10 分」这类错乱比值）
        totalScore: QuestionModel.PRACTICE_FULL_SCORE,
        correctSubs: result.correct,
        totalSubs: result.total,
        // MTF 题型：全部子题正确才算对；逻辑推理题：correct === total 即对
        correct: result.correct === result.total
      };
    }),
    stats: false,
    checkin: false
  });
}

// M-01：显式挂载对外入口
window.preparePracticeQuestion = preparePracticeQuestion;
window.getEffectiveSubQuestions = getEffectiveSubQuestions;
window.calculateQuestionScore = calculateQuestionScore;
window.handleSubmitAnswer = handleSubmitAnswer;
window.handleNextQuestion = handleNextQuestion;
window.savePracticeRecord = savePracticeRecord;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.session = { preparePracticeQuestion: preparePracticeQuestion, getEffectiveSubQuestions: getEffectiveSubQuestions, calculateQuestionScore: calculateQuestionScore, handleSubmitAnswer: handleSubmitAnswer, handleNextQuestion: handleNextQuestion, savePracticeRecord: savePracticeRecord };
})();
