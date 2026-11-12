/**
 * TATABOX — 练习页「答题渲染 / 事件 / 成绩单」子模块（M-01 渐进拆分）
 * ------------------------------------------------------------
 * 由 loadModule('practice') 的依赖链先于 practice.js 加载；
 * 运行期依赖 practice.js 的全局：PracticeState、QuestionModel、injectPracticeStyles、
 * renderQuiz（包装器）、showFilterPanel、判卷与题库加载函数等。
 * 对外保留 _renderQuizImpl / bindQuizEvents / showSummary 原名。
 * ============================================================
 */
'use strict';

function _renderQuizImpl() {
  injectPracticeStyles();
  const container = document.getElementById('practice-root');
  if (!container) return;

  const q = PracticeState.currentSet[PracticeState.currentIndex];
  if (!q) return;

  // IBO 等双语题：默认英文，可切中文；中文缺失时逐字段回退原文
  const _lang = (typeof QuestionI18n !== 'undefined') ? QuestionI18n.getLang() : 'en';
  const _stemText = (typeof QuestionI18n !== 'undefined') ? QuestionI18n.stem(q, _lang) : (q.question || '');
  const _explanation = (typeof QuestionI18n !== 'undefined') ? QuestionI18n.explanation(q, _lang) : (q.explanation || '');
  const _hasZh = (typeof QuestionI18n !== 'undefined') ? QuestionI18n.hasTranslation(q) : false;

  const isLogicQuestion = QuestionModel.isLogicChoice(q);
  const isStandardChoice = QuestionModel.isStandardChoice(q);
  const userAnswers = PracticeState.userAnswers[PracticeState.currentIndex] || {};

  let subQuestionsHtml = '';
  let correct = 0, total = 0, score = 0;

  if (PracticeState.submitted) {
    const result = calculateQuestionScore(q, userAnswers);
    correct = result.correct;
    total = result.total;
    score = result.score;
  } else {
    // 未提交：只展示计分项数（MTF 按有效子题展开，含逻辑题 mtf 化的 4 条）
    total = (isLogicQuestion || isStandardChoice) ? 1 : getEffectiveSubQuestions(q).length;
  }

  const moduleGroup = getModuleGroupBySubject(q.subject);
  const moduleLabel = moduleGroup ? moduleGroup.label : '';

  const qId = getQuestionBioId(q);
  const isFav = PracticeState.favorites.has(qId);
  const isWrongMarked = PracticeState.wrongMarked.has(qId);

  if (isLogicQuestion) {
    const optionLabels = ['A', 'B', 'C', 'D', 'E'];
    const userAns = userAnswers[0];

    subQuestionsHtml = (q.options || []).map((opt, idx) => {
      const isSelected = userAns === idx;
      const isCorrectOption = q.answer === idx;
      let optClass = 'practice-logic-option';
      if (isSelected && !PracticeState.submitted) optClass += ' practice-logic-selected';
      if (PracticeState.submitted && isCorrectOption) optClass += ' practice-logic-correct';
      if (PracticeState.submitted && isSelected && !isCorrectOption) optClass += ' practice-logic-wrong';

      return `
        <div class="${optClass}" data-logic-idx="${idx}">
          <div class="practice-logic-marker">${optionLabels[idx]}</div>
          <span class="practice-logic-text">${escapeHtml(opt)}</span>
        </div>
      `;
    }).join('');

    if (PracticeState.submitted) {
      const isCorrect = userAns === q.answer;
      const optionLabels = ['A', 'B', 'C', 'D', 'E'];
      subQuestionsHtml += `
        <div class="practice-option-result bq-mt-12" >
          ${isCorrect
            ? '<span class="bq-hint--success">正确！</span>'
            : `<span class="bq-text-error">错误，正确答案是 ${optionLabels[q.answer]}</span>`
          }
        </div>
      `;
    }
  } else if (isStandardChoice) {
    const userAns = userAnswers[0];
    const optionKeys = Object.keys(q.options).sort();

    subQuestionsHtml = optionKeys.map(key => {
      const isSelected = userAns === key;
      const isCorrectOption = q.answer === key;
      let optClass = 'practice-logic-option';
      if (isSelected && !PracticeState.submitted) optClass += ' practice-logic-selected';
      if (PracticeState.submitted && isCorrectOption) optClass += ' practice-logic-correct';
      if (PracticeState.submitted && isSelected && !isCorrectOption) optClass += ' practice-logic-wrong';

      return `
        <div class="${optClass}" data-choice-key="${key}">
          <div class="practice-logic-marker">${key}</div>
          <span class="practice-logic-text">${escapeHtml(q.options[key])}</span>
        </div>
      `;
    }).join('');

    if (PracticeState.submitted) {
      const isCorrect = userAns === q.answer;
      subQuestionsHtml += `
        <div class="practice-option-result bq-mt-12" >
          ${isCorrect
            ? '<span class="bq-hint--success">正确！</span>'
            : `<span class="bq-text-error">错误，正确答案是 ${q.answer}</span>`
          }
        </div>
      `;
    }
  } else {
    const subQuestions = getEffectiveSubQuestions(q);
    subQuestionsHtml = subQuestions
      .map((sq, idx) => {
        const userAns = userAnswers[idx];
        const isCorrect = PracticeState.submitted ? userAns === sq.answer : null;
        const correctAnswer = sq.answer;

        let cardClass = 'practice-option-card';
        if (PracticeState.submitted) {
          if (isCorrect) {
            cardClass += ' practice-option-correct practice-answer-correct';
          } else {
            cardClass += ' practice-option-wrong practice-answer-wrong';
          }
        } else if (userAns !== undefined) {
          cardClass += ' practice-option-selected';
        }

        return `
          <div class="${cardClass}">
            <div class="practice-option-label">${sq.label}</div>
            <div class="practice-option-text">${escapeHtml((typeof QuestionI18n !== 'undefined') ? QuestionI18n.subText(sq, _lang) : sq.text)}</div>
            <div class="practice-option-toggle">
              <button class="practice-tf-btn ${userAns === true ? 'practice-tf-active practice-tf-true' : ''}"
                data-sub-idx="${idx}" data-value="true"
                ${PracticeState.submitted ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                正确
              </button>
              <button class="practice-tf-btn ${userAns === false ? 'practice-tf-active practice-tf-false' : ''}"
                data-sub-idx="${idx}" data-value="false"
                ${PracticeState.submitted ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                错误
              </button>
            </div>
            ${PracticeState.submitted ? `
              <div class="practice-option-result">
                ${isCorrect
                  ? '<span class="bq-hint--success">判断正确</span>'
                  : `<span class="bq-text-error">判断错误，正确答案为「${correctAnswer ? '正确' : '错误'}」</span>`
                }
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
  }

  const scoreHtml = PracticeState.submitted
    ? `
    <div class="practice-score-display">
      <span class="practice-score-label">本题得分：</span>
      <span class="practice-score-value">${score} / ${QuestionModel.getQuestionMaxScore(q, 'practice')} 分</span>
      <span class="practice-score-detail">（${correct}/${total} 正确）</span>
    </div>
    `
    : '';

  const explanationHtml = PracticeState.submitted && _explanation
    ? `
    <div class="practice-explanation">
      <div class="practice-explanation-title">解析</div>
      <div class="practice-explanation-text">${renderExplanationWithImages(_explanation)}</div>
    </div>
    `
    : '';

  container.innerHTML = `
    <div class="animate-fade-in practice-fade-in">
      ${PracticeState.redoMode && PracticeState.currentSet.length > 1
        ? `<div class="redo-progress">错题重做: <strong>${PracticeState.currentIndex + 1}</strong> / ${PracticeState.currentSet.length}</div>`
        : ''
      }
      <div class="practice-quiz-header">
        <div class="practice-progress">
          <span class="practice-progress-count">
            第 ${PracticeState.currentIndex + 1}/${PracticeState.currentSet.length} 题
          </span>
          <div class="practice-progress-bar">
            <div class="practice-progress-fill" style="width:${((PracticeState.currentIndex + 1) / PracticeState.currentSet.length) * 100}%"></div>
          </div>
        </div>

        <div class="practice-quiz-tags">
          <span class="tag" style="background:rgba(0,0,0,0.05);color:var(--text-muted,#888);font-size:0.7rem;font-family:var(--font-mono,monospace);">ID:${qId}</span>
          ${q.category === 'logic' ? '<span class="tag" style="background:rgba(99,102,241,0.12);color:#6366f1;">逻辑推理</span>' : ''}
          ${moduleLabel ? `<span class="tag tag--primary">${moduleLabel}</span>` : ''}
          ${q.subject ? '<span class="tag tag--info">' + escapeHtml(q.subject) + '</span>' : ''}
          ${typeof renderDifficultyTag === 'function' ? renderDifficultyTag(qId, q.difficulty || 3) : (q.difficulty ? '<span class="tag ' + getDifficultyClass(q.difficulty) + '">' + getDifficultyLabel(q.difficulty) + '</span>' : '')}
          ${q.concept ? '<span class="tag tag--outline">' + escapeHtml(q.concept) + '</span>' : ''}
          ${q.year ? '<span class="tag tag--outline">' + escapeHtml(String(q.year)) + ' 年</span>' : ''}
          ${_renderExamSourceTag(q)}
          ${_renderRatingTag(q, qId)}
          ${_hasZh ? `<button type="button" class="practice-lang-toggle" id="practice-lang-toggle"
            aria-label="切换题目语言" title="切换题目语言（当前：${_lang === 'zh' ? '中文' : '英文'}）">
            <span class="practice-lang-opt${_lang === 'en' ? ' is-active' : ''}">EN</span>
            <span class="practice-lang-sep">/</span>
            <span class="practice-lang-opt${_lang === 'zh' ? ' is-active' : ''}">中文</span>
          </button>` : ''}
        </div>
      </div>

      <div class="practice-question-card">
        <div class="practice-question-text">
          ${escapeHtml(_stemText)}
        </div>
        ${_renderQuestionTables((typeof QuestionI18n !== 'undefined') ? QuestionI18n.tables(q, _lang) : (q.tables || []))}
        ${(typeof window !== 'undefined' && window.BioQuestFigure) ? window.BioQuestFigure.render(q, { alt: '题目配图', lang: _lang }) : renderChart(q.chart)}

        <div class="practice-options-list">
          ${subQuestionsHtml}
        </div>
      </div>

      ${scoreHtml}

      ${explanationHtml}

      <div class="practice-actions">
        <div class="practice-actions-left">
          <div class="practice-vote-group" style="display:inline-flex;align-items:center;gap:4px;margin-right:2px;">
            <button class="btn btn-sm practice-vote-btn ${_getMyVote(qId) === 1 ? 'practice-vote-active practice-vote-up-active' : ''}"
              id="practice-vote-up-btn" title="这道题好，多刷点" data-vote="1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
              <span id="practice-vote-up-count">${_getRatingCounts(qId).up}</span>
            </button>
            <button class="btn btn-sm practice-vote-btn ${_getMyVote(qId) === -1 ? 'practice-vote-active practice-vote-down-active' : ''}"
              id="practice-vote-down-btn" title="这道题有问题，少刷点" data-vote="-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z"/>
                <path d="M7 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>
              </svg>
              <span id="practice-vote-down-count">${_getRatingCounts(qId).down}</span>
            </button>
          </div>
          <button class="btn btn-sm practice-fav-btn ${isFav ? 'practice-fav-active' : ''}"
            id="practice-fav-btn" title="${isFav ? '取消收藏' : '收藏题目'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            ${isFav ? '已收藏' : '收藏'}
          </button>
          <button class="btn btn-sm practice-wrong-btn ${isWrongMarked ? 'practice-wrong-active' : ''}"
            id="practice-wrong-btn" title="${isWrongMarked ? '取消标记' : '标记错题'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            ${isWrongMarked ? '已标记' : '错题'}
          </button>
          <button class="btn btn-sm practice-feedback-btn" id="practice-feedback-btn" title="反馈题目问题">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            反馈
          </button>
          <button class="btn btn-sm practice-share-btn" id="practice-share-btn" title="分享本题给好友">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            分享
          </button>
          <button class="btn btn-sm practice-print-btn" id="practice-print-btn" title="打印当前练习题（A4 分页，每页页脚 TATAbox.cc.cd）">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            打印
          </button>
          <button class="btn btn-sm practice-print-answers-btn" id="practice-print-answers-btn" title="打印当前练习题的正确答案与解析（与题目分开打印）">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            打印答案
          </button>
        </div>
        <div class="practice-actions-right">
          ${!PracticeState.submitted
            ? `<button class="btn btn-success" id="practice-submit-btn">提交答案</button>`
            : `<button class="btn btn-primary" id="practice-next-btn">
              ${PracticeState.currentIndex < PracticeState.currentSet.length - 1 ? '下一题 →' : '查看小结 →'}
            </button>`
          }
        </div>
      </div>

      <div class="practice-cumulative">
        <span>累计得分：<strong>${PracticeState.totalScore.toFixed(1)}</strong> 分</span>
        <span>已答：<strong>${PracticeState.totalAnswered}</strong> 题</span>
        <span>正确率：<strong>${PracticeState.totalAnswered > 0 ? calcAccuracyStr() : '--'}</strong></span>
      </div>

      <div class="practice-shortcut-hint" aria-label="键盘快捷键提示">
        ${(isLogicQuestion || isStandardChoice)
          ? '<span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> 选答案</span>'
          : ''
        }
        <span><kbd>Space</kbd>/<kbd>Enter</kbd> ${PracticeState.submitted ? '下一题' : '提交答案'}</span>
        <span><kbd>R</kbd> 重做本题</span>
        <span><kbd>Esc</kbd> 返回列表</span>
        <span class="sh-sep">·</span>
        <span><kbd>?</kbd> 全部快捷键</span>
      </div>
    </div>
  `;

  bindQuizEvents();
}

/**
 * 题目结构化表格（IBO 数据表用）：{title, head[], rows[][]} → 可横向滚动的 HTML 表。
 * 仅由转义后的文本拼接，不接收原始 HTML。
 */
function _renderQuestionTables(tables) {
  if (!Array.isArray(tables) || tables.length === 0) return '';
  return tables.map(function (t) {
    if (!t || typeof t !== 'object') return '';
    var head = (Array.isArray(t.head) ? t.head : []).map(function (h) {
      return '<th scope="col">' + escapeHtml(String(h)) + '</th>';
    }).join('');
    var body = (Array.isArray(t.rows) ? t.rows : []).map(function (row) {
      return '<tr>' + (Array.isArray(row) ? row : []).map(function (cell) {
        return '<td>' + escapeHtml(String(cell)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div class="practice-question-table-wrap">' +
      (t.title ? '<div class="practice-question-table-title">' + escapeHtml(String(t.title)) + '</div>' : '') +
      '<table class="practice-question-table">' +
      (head ? '<thead><tr>' + head + '</tr></thead>' : '') +
      '<tbody>' + body + '</tbody></table></div>';
  }).join('');
}

function calcAccuracyStr() {
  if (PracticeState.totalAnswered === 0) return '--';
  let totalSub = 0;
  let correctSub = 0;
  Object.values(PracticeState.moduleStats).forEach(function(m) {
    totalSub += (m.subTotal || 0);
    correctSub += (m.subCorrect || 0);
  });
  if (totalSub === 0) return '--';
  return Math.round((correctSub / totalSub) * 100) + '%';
}

function bindQuizEvents() {
  // 选项点击（支持逻辑推理题 data-logic-idx 和标准单选题 data-choice-key）
  const logicOptions = document.querySelectorAll('.practice-logic-option');
  logicOptions.forEach((opt) => {
    opt.addEventListener('click', () => {
      if (PracticeState.submitted) return;
      const qIdx = PracticeState.currentIndex;
      if (!PracticeState.userAnswers[qIdx]) {
        PracticeState.userAnswers[qIdx] = {};
      }
      // 标准单选题：存 'A'/'B'/'C'/'D'；逻辑推理题：存索引 0-4
      if (opt.dataset.choiceKey) {
        PracticeState.userAnswers[qIdx][0] = opt.dataset.choiceKey;
      } else {
        const idx = parseInt(opt.dataset.logicIdx, 10);
        PracticeState.userAnswers[qIdx][0] = idx;
      }
      // 原地切换选中态，避免整题重渲染（含淡入动画）被感知为页面刷新
      logicOptions.forEach((o) => o.classList.remove('practice-logic-selected'));
      opt.classList.add('practice-logic-selected');
    });
  });

  // MTF 题型按钮
  const toggleBtns = document.querySelectorAll('.practice-tf-btn:not([disabled])');
  toggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const subIdx = parseInt(btn.dataset.subIdx, 10);
      const value = btn.dataset.value === 'true';
      handleToggleAnswer(subIdx, value);
    });
  });

  const submitBtn = document.getElementById('practice-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', handleSubmitAnswer);
  }

  const nextBtn = document.getElementById('practice-next-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', handleNextQuestion);
  }

  const favBtn = document.getElementById('practice-fav-btn');
  if (favBtn) {
    favBtn.addEventListener('click', handleToggleFavorite);
  }

  // 点赞 / 点踩
  const voteUpBtn = document.getElementById('practice-vote-up-btn');
  if (voteUpBtn) {
    voteUpBtn.addEventListener('click', function() { handleVoteQuestion(1); });
  }
  const voteDownBtn = document.getElementById('practice-vote-down-btn');
  if (voteDownBtn) {
    voteDownBtn.addEventListener('click', function() { handleVoteQuestion(-1); });
  }

  const wrongBtn = document.getElementById('practice-wrong-btn');
  if (wrongBtn) {
    wrongBtn.addEventListener('click', handleMarkWrong);
  }

  // 中英文切换（仅双语题渲染该按钮）：切换后原地重渲染，保留作答状态
  const langBtn = document.getElementById('practice-lang-toggle');
  if (langBtn) {
    langBtn.addEventListener('click', function () {
      if (typeof QuestionI18n === 'undefined') return;
      QuestionI18n.toggleLang();
      _renderQuizImpl();
    });
  }

  const feedbackBtn = document.getElementById('practice-feedback-btn');
  if (feedbackBtn) {
    feedbackBtn.addEventListener('click', function() {
      if (typeof window.showQuestionFeedbackModal === 'function') {
        var q = PracticeState.currentSet[PracticeState.currentIndex];
        if (!q) return;
        var feedbackQId = getQuestionBioId(q);
        window.showQuestionFeedbackModal(feedbackQId, q.question || '');
      }
    });
  }

  const shareBtn = document.getElementById('practice-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', handleShareCurrentQuestion);
  }
  // 打印当前练习题集（A4 分页 + 每页页脚 TATAbox.cc.cd，浏览器原生打印预览）
  // 「打印」= 仅题目与选项；「打印答案」= 仅正确答案与解析（两者分开出纸）
  const printBtn = document.getElementById('practice-print-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      if (!window.PrintUtils || typeof window.PrintUtils.printQuestionSet !== 'function') {
        if (typeof showToast === 'function') showToast('打印模块未加载，请刷新后重试');
        return;
      }
      window.PrintUtils.printQuestionSet(PracticeState.currentSet, {
        mode: 'questions',
        title: 'TATABOX 练习题打印',
        metaText: '共 ' + PracticeState.currentSet.length + ' 题 · 仅含题目与选项'
      });
    });
  }
  const printAnswersBtn = document.getElementById('practice-print-answers-btn');
  if (printAnswersBtn) {
    printAnswersBtn.addEventListener('click', () => {
      if (!window.PrintUtils || typeof window.PrintUtils.printQuestionSet !== 'function') {
        if (typeof showToast === 'function') showToast('打印模块未加载，请刷新后重试');
        return;
      }
      window.PrintUtils.printQuestionSet(PracticeState.currentSet, {
        mode: 'answers',
        title: 'TATABOX 练习答案解析打印',
        metaText: '共 ' + PracticeState.currentSet.length + ' 题 · 仅含正确答案与解析'
      });
    });
  }
}

function showSummary() {
  const container = document.getElementById('practice-root');
  if (!container) return;

  // 分值可能是 0.25 / 0.75 / 1.25（IBO 官方计分），统一保留最多两位小数并去尾零
  const fmtScore = (v) => {
    const s = (Math.round(Number(v || 0) * 100) / 100).toFixed(2);
    return s.replace(/\.?0+$/, '');
  };

  const totalQuestions = PracticeState.totalAnswered;
  const totalScore = PracticeState.totalScore;
  // 满分 = 本套各题满分之和（IBO 题按官方 1.0/1.25，其余题 2.0）
  const maxScore = PracticeState.currentSet.reduce(
    (sum, q) => sum + QuestionModel.getQuestionMaxScore(q, 'practice'), 0);
  const duration = Math.floor((Date.now() - PracticeState.startTime) / 1000);

  const moduleRows = PracticeModuleGroups
    .filter((g) => PracticeState.moduleStats[g.id])
    .map((g) => {
      const stats = PracticeState.moduleStats[g.id];
      const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      const subAcc = stats.subTotal > 0 ? Math.round((stats.subCorrect / stats.subTotal) * 100) : 0;
      return `
        <div class="practice-summary-row">
          <span class="practice-summary-module">${g.label}</span>
          <span class="practice-summary-stat">${stats.total} 题</span>
          <span class="practice-summary-stat">${fmtScore(stats.score)} 分</span>
          <span class="practice-summary-stat">全对 ${acc}% · 小题 ${subAcc}%</span>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="animate-fade-in">
      <section class="section" style="padding-top:0;padding-bottom:24px;">
        <h2 class="section-title">练习小结</h2>
        <p class="section-desc">练习完成，以下是你的学习成果。</p>
      </section>

      <div class="practice-summary-card">
        <div class="practice-summary-overview">
          <div class="practice-summary-stat-item">
            <div class="practice-summary-stat-num">${totalQuestions}</div>
            <div class="practice-summary-stat-label">总题数</div>
          </div>
          <div class="practice-summary-stat-item">
            <div class="practice-summary-stat-num">${fmtScore(totalScore)}</div>
            <div class="practice-summary-stat-label">总得分 / ${fmtScore(maxScore)}</div>
          </div>
          <div class="practice-summary-stat-item">
            <div class="practice-summary-stat-num">${formatTime(duration, { showHours: false })}</div>
            <div class="practice-summary-stat-label">用时</div>
          </div>
          <div class="practice-summary-stat-item">
            <div class="practice-summary-stat-num">${calcAccuracyStr()}</div>
            <div class="practice-summary-stat-label">整体正确率</div>
          </div>
        </div>

        <div class="practice-summary-detail">
          <h3 class="practice-summary-detail-title">各模块统计</h3>
          ${moduleRows || '<p style="color:var(--text-muted);text-align:center;padding:16px;">暂无模块数据</p>'}
        </div>

        <div class="practice-summary-actions">
          <button class="btn btn-primary" id="practice-restart-btn">再来一套</button>
          <button class="btn btn-secondary" id="practice-back-btn">返回筛选</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('practice-restart-btn').addEventListener('click', () => {
    initNewSession();
    if (PracticeState.currentSet.length === 0) {
      showFilterPanel();
      return;
    }
    renderQuiz();
  });

  document.getElementById('practice-back-btn').addEventListener('click', () => {
    PracticeState.started = false;
    showFilterPanel();
  });
}

// M-01：显式挂载对外入口（practice.js 的 renderQuiz 包装器与 handleNextQuestion 仍按原名调用）
window._renderQuizImpl = _renderQuizImpl;
window.bindQuizEvents = bindQuizEvents;
window.showSummary = showSummary;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.quiz = {
    render: _renderQuizImpl,
    bindEvents: bindQuizEvents,
    showSummary: showSummary
  };
})();
