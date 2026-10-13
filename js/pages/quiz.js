'use strict';

let QData = [];         // 基础知识题库
let logicData = [];     // 逻辑推理题库
let currentPaper = [];
let currentPaperTitle = '';
let userAnswers = {};
let submitted = false;
let dataLoaded = false;
let logicLoaded = false;
let selectedCategory = 'basic'; // 'basic' | 'logic' | 'mixed'

// 分值常量：唯一权威在 js/core/question-model.js（QUIZ_SCORES），此处引用防漂移
const SCORE_SINGLE = QuestionModel.QUIZ_SCORES.single;
const SCORE_MULTIPLE_FULL = QuestionModel.QUIZ_SCORES.multiple;
const SCORE_MULTIPLE_PARTIAL = QuestionModel.QUIZ_SCORES.multiplePartial;
const SCORE_JUDGE = QuestionModel.QUIZ_SCORES.judge;
const COUNT_SINGLE = 20;
const COUNT_MULTIPLE = 5;
const COUNT_JUDGE = 5;
const COUNT_LOGIC = 15; // 逻辑推理模式题目数

// 试题页点赞/点踩按钮图标（与练习页同一套线性图标）
const EXAM_VOTE_UP_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/></svg>';
const EXAM_VOTE_DOWN_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z"/></svg>';

// HTML 转义 — 统一使用 window.escapeHtml（Q-01，规范实现在 js/core/utils.js）
var escapeHtml = (typeof window !== 'undefined' ? window : globalThis).escapeHtml; // 规范实现见 js/core/utils.js（Q-01 统一）

/**
 * 带超时与自动重试的 JSON 拉取（首次访问 raw.githubusercontent / CDN / 静态代理
 * 冷加载常较慢甚至超时；超时后取消挂起请求并短暂退避重试，避免页面卡在
 * 「加载题库中...」或一次网络抖动即永久失败——重试多命中预热缓存/HTTP 缓存）。
 */
async function fetchJsonWithRetry(url, attempts, timeoutMs) {
  var lastErr = null;
  for (var i = 1; i <= attempts; i++) {
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, timeoutMs);
    }
    try {
      var res = await fetch(url, controller ? { signal: controller.signal } : {});
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
      var body = await res.json();
      clearTimeout(timer);
      return { ok: true, data: body };
    } catch (err) {
      clearTimeout(timer);
      lastErr = (err && err.name === 'AbortError') ? new Error('加载超时') : err;
      if (i < attempts) {
        await new Promise(function (resolve) { setTimeout(resolve, 400 * i); });
      }
    }
  }
  return { ok: false, error: lastErr };
}

async function loadQuizData() {
  const btn = document.getElementById('quizCrawlBtn');
  const label = document.getElementById('quizLabel');

  // 两套题库都已就绪时直接使用缓存；仅加载了一部分时继续补齐其余
  if (dataLoaded && logicLoaded) {
    if (btn) btn.disabled = false;
    if (label) updateCategoryLabel();
    return;
  }

  if (btn) btn.disabled = true;
  if (label) label.textContent = '加载题库中...';

  try {
    // 并行加载两个题库（每项自带超时 + 自动重试；逻辑题库失败不影响基础知识题库）
    const [qRes, logicRes] = await Promise.all([
      fetchJsonWithRetry('data/quiz.json', 2, 15000),
      fetchJsonWithRetry('data/logic_questions.json', 2, 15000)
    ]);

    if (!qRes.ok) throw (qRes.error || new Error('quiz.json 加载失败'));

    // P0-4: 隔离过滤 → 超长知识讲义过滤 → 清洗（600字选项删；300字+截断；总分4000+删）
    var rawQ = (typeof window._filterQuarantinedQuestions === 'function')
      ? window._filterQuarantinedQuestions(qRes.data.题库 || [])
      : (qRes.data.题库 || []);
    QData = (typeof window.filterQuestionList === 'function')
      ? window.filterQuestionList(rawQ)
      : rawQ;
    QData = QData.filter(function (q) { return !_isQuizRecycled(q); });
    dataLoaded = true;

    // 逻辑题库为可选项：失败时仅禁用逻辑/混合模式，基本信息模式仍可用
    if (logicRes.ok) {
      var logicFiltered = (typeof window._filterQuarantinedQuestions === 'function')
        ? window._filterQuarantinedQuestions(logicRes.data)
        : logicRes.data;
      logicData = (typeof window.filterQuestionList === 'function')
        ? window.filterQuestionList(logicFiltered)
        : logicFiltered;
      logicData = logicData.filter(function (q) { return !_isQuizRecycled(q); });
      logicLoaded = true;
    }

    if (label) {
      const singles = QData.filter(q => q.type === 'single' || !q.type).length;
      const multiples = QData.filter(q => q.type === 'multiple').length;
      const judges = QData.filter(q => q.type === 'judge').length;
      const mtfs = QData.filter(q => q.type === 'mtf').length;
      label.textContent = `已加载 ${QData.length} 道基础知识题目（单选${singles} 多选${multiples} 判断${judges} MTF${mtfs}）`;
    }
    if (btn) btn.disabled = false;

    updateCategoryLabel();
  } catch (err) {
    console.error('加载题目数据失败', err);
    QData = [];
    // 不置 dataLoaded=true：点击「在线组卷」会走重试路径再次拉取，
    // 上一轮失败的请求可能已让 CDN/HTTP/SW 缓存预热，重试往往能成功
    if (label) label.textContent = '加载失败，请点击「在线组卷」重试';
    if (btn) btn.disabled = false;
  }
}

function updateCategoryLabel() {
  const label = document.getElementById('quizLabel');
  if (!label) return;

  const basicCount = QData.length;
  const logicCount = logicData.length;

  if (selectedCategory === 'basic') {
    label.textContent = `基础知识模式（${basicCount}题可用）`;
  } else if (selectedCategory === 'logic') {
    label.textContent = `逻辑推理模式（${logicCount}题可用）`;
  } else {
    label.textContent = `混合模式（基础${basicCount} + 推理${logicCount}题）`;
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateNewPaper() {
  if (selectedCategory === 'logic') {
    generateLogicPaper();
  } else if (selectedCategory === 'mixed') {
    generateMixedPaper();
  } else {
    generateBasicPaper();
  }
}

/**
 * Issue #10：解析题目稳定 bioID（与 practice.js getQuestionBioId 同一算法）。
 * 优先级：q.bioId > q.id（分片题库加载时已注入）> 旧 hash 复算并映射。
 * 保证本地收藏/错题引用稳定，刷新、题库增删后不漂移。
 */
function getQuestionBioId(q) {
  if (!q) return '';
  // 自愈：若 bioID 映射表尚未加载，触发后台加载（不阻塞返回）
  if (!window.bioIdMap && typeof window.loadBioIdMap === 'function') {
    try { window.loadBioIdMap(); } catch (e) {}
  }
  var raw = q.bioId || q.id;
  if (raw === undefined || raw === null || raw === '') {
    // 旧 ID 复算（自包含，避免依赖 storage.js；算法与 generate-bio-shards.js 一致）
    var hashFn = (typeof window.hashQuestionId === 'function')
      ? window.hashQuestionId
      : function (str) {
          var h = 0;
          for (var i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h = h & h;
          }
          return Math.abs(h);
        };
    raw = String(hashFn((q.question || '') + (q.concept || '')));
  }
  if (typeof window.resolveQuestionBioId === 'function') {
    return String(window.resolveQuestionBioId(raw));
  }
  return String(raw);
}

// 暴露到 window：浏览器经典脚本下本就为全局，显式暴露使 jsdom/单测能调用真实实现
window.getQuestionBioId = getQuestionBioId;

/**
 * 判断题目是否已被移入回收站（低分下架）。
 * 与 practice.js / storage.js 共享同一 localStorage 键；storage.js 未加载时直读。
 */
function _isQuizRecycled(q) {
  var qId = getQuestionBioId(q);
  if (typeof window.isQuestionRecycled === 'function') {
    return window.isQuestionRecycled(qId);
  }
  try {
    var list = JSON.parse(localStorage.getItem('bioquest_question_recycled') || '[]');
    return Array.isArray(list) && list.indexOf(qId) !== -1;
  } catch (e) {
    return false;
  }
}

function generateBasicPaper() {
  if (!dataLoaded || QData.length === 0) {
    alert('基础知识题库加载中，请稍候...');
    return;
  }

  // 每次出卷实时排除回收站题目（低分下架后不应再出现在新试卷中，
  // 与练习页 generateQuestionSet 的过滤语义保持一致）
  const active = QData.filter(q => !_isQuizRecycled(q));

  const singles = shuffle(active.filter(q => q.type === 'single' || !q.type));
  const multiples = shuffle(active.filter(q => q.type === 'multiple'));
  const judges = shuffle(active.filter(q => q.type === 'judge'));
  const mtfQuestions = shuffle(active.filter(q => q.type === 'mtf'));

  const pickedSingles = singles.slice(0, Math.min(COUNT_SINGLE, singles.length));
  const pickedMultiples = multiples.slice(0, Math.min(COUNT_MULTIPLE, multiples.length));
  const pickedJudges = judges.slice(0, Math.min(COUNT_JUDGE, judges.length));
  const pickedMtf = mtfQuestions.slice(0, Math.min(COUNT_SINGLE, mtfQuestions.length));

  if (pickedSingles.length + pickedMultiples.length + pickedJudges.length + pickedMtf.length < 5) {
    alert('基础知识题库不足，请补充题库。');
    return;
  }

  currentPaper = shuffle([...pickedSingles, ...pickedMultiples, ...pickedJudges, ...pickedMtf]);
  // 标记题目类别
  currentPaper.forEach(q => { if (!q.category) q.category = 'basic'; });
  startPaper('基础知识模拟试卷');
}

function generateLogicPaper() {
  if (!logicLoaded || logicData.length === 0) {
    alert('逻辑推理题库加载中，请稍候...');
    return;
  }

  // 实时排除回收站题目（低分下架后不应再出现在新试卷中）
  const active = logicData.filter(q => !_isQuizRecycled(q));
  const picked = shuffle(active).slice(0, Math.min(COUNT_LOGIC, active.length));

  if (picked.length < 3) {
    alert('逻辑推理题库不足，请补充题库。');
    return;
  }

  currentPaper = picked;
  startPaper('逻辑推理专项训练');
}

function generateMixedPaper() {
  if ((!dataLoaded || QData.length === 0) && (!logicLoaded || logicData.length === 0)) {
    alert('题库加载中，请稍候...');
    return;
  }

  // 基础知识题：MTF 10 + 单选0/多选3/判断3（题库当前以 MTF 为主）；
  // 每次出卷实时排除回收站题目
  const activeQ = QData.filter(q => !_isQuizRecycled(q));
  const singles = shuffle(activeQ.filter(q => q.type === 'single' || !q.type));
  const multiples = shuffle(activeQ.filter(q => q.type === 'multiple'));
  const judges = shuffle(activeQ.filter(q => q.type === 'judge'));
  const mtfQuestions = shuffle(activeQ.filter(q => q.type === 'mtf'));

  const pickedSingles = singles.slice(0, Math.min(10, singles.length));
  const pickedMultiples = multiples.slice(0, Math.min(3, multiples.length));
  const pickedJudges = judges.slice(0, Math.min(3, judges.length));
  const pickedMtf = mtfQuestions.slice(0, Math.min(10, mtfQuestions.length));

  // 逻辑推理题：10题（实时排除回收站）
  const activeLogic = logicData.filter(q => !_isQuizRecycled(q));
  const pickedLogic = shuffle(activeLogic).slice(0, Math.min(10, activeLogic.length));

  const basicQuestions = [...pickedSingles, ...pickedMultiples, ...pickedJudges, ...pickedMtf];
  basicQuestions.forEach(q => { if (!q.category) q.category = 'basic'; });
  pickedLogic.forEach(q => { q.category = 'logic'; });

  currentPaper = shuffle([...basicQuestions, ...pickedLogic]);

  if (currentPaper.length < 5) {
    alert('题库不足，请补充题库。');
    return;
  }

  startPaper('综合模拟试卷');
}

function startPaper(title) {
  userAnswers = {};
  submitted = false;

  // 管理员对本地题库的覆盖修改（题干/选项/解析等）在出卷时生效
  if (typeof applyQuestionOverride === 'function') {
    currentPaper = currentPaper.map(function (q) {
      return applyQuestionOverride(q);
    });
  }

  // 保存试卷标题供 renderPaper 使用
  currentPaperTitle = title;

  document.getElementById('quizEmpty').style.display = 'none';
  const paperEl = document.getElementById('quizPaper');
  paperEl.style.display = 'block';

  renderPaper();

  const label = document.getElementById('quizLabel');
  if (label) label.textContent = '进行中';
}

// 题型标签 / 分值 / 选项标记 —— 唯一实现在 js/core/question-model.js（薄封装）
function getTypeLabel(type) {
  return QuestionModel.getTypeLabel(type);
}

function getTypeScore(type) {
  return QuestionModel.getQuizTypeScore(type);
}

function getOptionLabels(type) {
  return QuestionModel.getOptionLabels(type);
}

/**
 * 逻辑题 MTF 化的「有效子题」—— 薄封装，唯一实现在 question-model.js
 * （原有两份实现曾漂移导致同题两页判分相反，见 PR #165 / mtf-consistency 测试）。
 */
function getEffectiveSubQuestions(q) {
  return QuestionModel.getEffectiveSubQuestions(q);
}

function getCategoryLabel(category) {
  if (category === 'logic') return '逻辑推理';
  return '基础知识';
}

function renderPaper() {
  const paperEl = document.getElementById('quizPaper');
  const answeredCount = Object.keys(userAnswers).filter(k => {
    const ans = userAnswers[k];
    if (Array.isArray(ans)) return ans.length > 0;
    if (ans && typeof ans === 'object') {
      // MTF：子题全部作答才算已答
      const q = currentPaper[parseInt(k, 10)];
      const subs = q ? getEffectiveSubQuestions(q) : [];
      if (subs.length === 0) return false;
      return subs.every((_, idx) => ans[idx] === true || ans[idx] === false);
    }
    return ans !== undefined && ans !== null;
  }).length;

  const totalQuestions = currentPaper.length;
  const paperTitle = currentPaperTitle || '生物竞赛模拟试卷';

  // 动态计算总分
  let totalScore = 0;
  currentPaper.forEach(q => { totalScore += getTypeScore(q.type || 'single'); });

  let html = `
    <div class="paper-header">
      <div>
        <div class="paper-title">${paperTitle}</div>
        <div class="paper-meta">卷号：${Date.now().toString().slice(-6)} · 共 ${totalQuestions} 题 · 满分 ${totalScore} 分</div>
      </div>
      <div class="paper-info">
        <div class="paper-info-item">
          <div class="paper-info-num">${answeredCount}</div>
          <div class="paper-info-label">已答</div>
        </div>
        <div class="paper-info-item">
          <div class="paper-info-num">${totalQuestions}</div>
          <div class="paper-info-label">总题</div>
        </div>
      </div>
    </div>

    <div class="paper-questions">
  `;

  currentPaper.forEach((q, i) => {
    const qType = q.type || 'single';
    const typeLabel = getTypeLabel(qType);
    const score = getTypeScore(qType);
    const optionLabels = getOptionLabels(qType);
    const options = q.options;
    const isMultiple = qType === 'multiple';
    const isJudge = qType === 'judge';
    const isMtf = qType === 'mtf';
    const inputType = isMultiple ? 'checkbox' : 'radio';
    const inputName = 'q-' + i;
    const categoryLabel = getCategoryLabel(q.category);

    html += `
      <div class="paper-question" id="pq-${i}">
        <div class="pq-meta">
          第 ${i + 1} 题
          <span class="pq-type-tag pq-type-${qType}">【${typeLabel}】</span>
          <span class="pq-score-badge">${score}分</span>
          ${q.category === 'logic' ? '<span class="pq-type-tag pq-type-logic">【逻辑推理】</span>' : ''}
          ${q.subject ? `<span class="pq-subject-tag">${q.subject}</span>` : ''}
          ${_examVoteHtml(i)}
        </div>
        <div class="pq-text">${escapeHtml(q.question).replace(/\n/g, '<br>')}</div>
        ${(typeof window !== 'undefined' && window.BioQuestFigure) ? window.BioQuestFigure.render(q, { alt: '第 ' + (i + 1) + ' 题配图' }) : ''}
        ${isMultiple ? '<div class="pq-multi-hint">此题为多选题，请选择所有正确答案</div>' : ''}
        ${isMtf ? '<div class="pq-multi-hint">此题为多重判断题，请对每条陈述判断「正确」或「错误」</div>' : ''}
        <div class="pq-options">
    `;

    if (isMtf) {
      const subQuestions = getEffectiveSubQuestions(q);
      const userAnsObj = (userAnswers[i] && typeof userAnswers[i] === 'object' && !Array.isArray(userAnswers[i]))
        ? userAnswers[i]
        : {};
      subQuestions.forEach((sq, idx) => {
        const ua = userAnsObj[idx];
        const isSubCorrect = submitted ? ua === sq.answer : null;
        let mtfClass = 'pq-mtf-card';
        if (submitted) {
          mtfClass += isSubCorrect ? ' correct-ans' : ' wrong-ans';
        } else if (ua === true || ua === false) {
          mtfClass += ' selected';
        }
        html += `
          <div class="${mtfClass}">
            <div class="pq-mtf-label">${escapeHtml(sq.label)}</div>
            <div class="pq-mtf-text">${escapeHtml(sq.text)}</div>
            <div class="pq-mtf-toggle">
              <button type="button" class="pq-tf-btn ${ua === true ? 'pq-tf-active pq-tf-true' : ''}"
                data-mtf-q="${i}" data-mtf-idx="${idx}" data-value="true"
                ${submitted ? 'disabled' : ''}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                正确
              </button>
              <button type="button" class="pq-tf-btn ${ua === false ? 'pq-tf-active pq-tf-false' : ''}"
                data-mtf-q="${i}" data-mtf-idx="${idx}" data-value="false"
                ${submitted ? 'disabled' : ''}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                错误
              </button>
            </div>
            ${submitted ? `
              <div class="pq-mtf-result">
                ${isSubCorrect
                  ? '<span style="color:#1a7f37;">判断正确</span>'
                  : '<span style="color:#cf222e;">判断错误，正确答案为「' + (sq.answer ? '正确' : '错误') + '」</span>'
                }
              </div>
            ` : ''}
          </div>
        `;
      });
    } else {
      options.forEach((opt, j) => {
        const userAns = userAnswers[i];
        let isSelected = false;

        if (isMultiple) {
          isSelected = Array.isArray(userAns) && userAns.includes(j);
        } else {
          isSelected = userAns === j;
        }

        const isCorrectAnswer = isMultiple
          ? (Array.isArray(q.answer) ? q.answer.includes(j) : q.answer === j)
          : q.answer === j;

        let optionClasses = 'pq-option';
        if (isMultiple) optionClasses += ' pq-option-checkbox';
        if (isSelected && !submitted) optionClasses += ' selected';
        if (submitted && isCorrectAnswer) optionClasses += ' correct-ans';
        if (submitted && isSelected && !isCorrectAnswer) optionClasses += ' wrong-ans';

        const checkedAttr = isSelected ? ' checked' : '';
        const disabledAttr = submitted ? ' disabled' : '';

        html += `
          <label class="${optionClasses}" for="opt-${i}-${j}">
            <input type="${inputType}" name="${inputName}" value="${j}" id="opt-${i}-${j}"
              class="pq-native-input"${checkedAttr}${disabledAttr}>
            <div class="pq-marker">${optionLabels[j]}</div>
            <span>${escapeHtml(opt)}</span>
          </label>
        `;
      });
    }

    html += `</div>`;

    if (submitted) {
      const scoreResult = getSingleQuestionScore(q, i);
      const isCorrect = scoreResult === 'full';
      const isPartial = scoreResult === 'partial';

      let resultHtml = '';
      if (isCorrect) {
        resultHtml = isMtf ? '正确！全部判断正确' : '正确！';
      } else if (isPartial) {
        resultHtml = '△ 部分正确！（得2分）';
      } else if (isMtf) {
        const subCount = getEffectiveSubQuestions(q).length;
        resultHtml = `错误！${subCount} 条陈述中未全部判断正确，请查看下方各条判断结果`;
      } else {
        const correctAnswerDisplay = isMultiple
          ? (Array.isArray(q.answer) ? q.answer.map(a => optionLabels[a]).join('、') : optionLabels[q.answer])
          : optionLabels[q.answer];
        resultHtml = `错误！正确答案是 ${correctAnswerDisplay}`;
      }

      // v4.0 题-图-卡-错四向联动：错题展示"查看知识图谱"+"加入错题本"按钮
      var linkageBtns = '';
      if (!isCorrect) {
        var conceptLabel = q.subject || q.category || '';
        linkageBtns = '<div class="pq-linkage" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-secondary btn-sm pq-linkage-btn" data-action="kg" data-concept="' + escapeHtml(conceptLabel) + '">查看知识图谱</button>' +
          '<button type="button" class="btn btn-secondary btn-sm pq-linkage-btn" data-action="wrongbook" data-qidx="' + i + '">加入错题本</button>' +
          '<button type="button" class="btn btn-secondary btn-sm pq-linkage-btn" data-action="card" data-concept="' + escapeHtml(conceptLabel) + '">生成卡片</button>' +
          '</div>';
      }

      html += `
        <div class="pq-exp show ${isCorrect ? 'correct' : (isPartial ? 'partial' : 'wrong')}" id="pqe-${i}">
          ${resultHtml}
          ${q.explanation ? `<div style="margin-top:8px;font-size:0.85rem;line-height:1.6;">${renderExplanationWithImages(q.explanation)}</div>` : ''}
          ${linkageBtns}
        </div>
      `;
    }

    html += `</div>`;
  });

  const scoreData = calculateScore();

  html += `
    </div>

    <div class="paper-footer">
      <div class="paper-score ${submitted ? 'show' : ''}" id="paperScore">
        ${submitted ? `
          <div class="score-breakdown">
            <div class="score-breakdown-title">成绩明细</div>
            ${scoreData.basicTotal > 0 ? `<div class="score-breakdown-row"><span>基础知识</span><span>${scoreData.basicTotal} 分</span></div>` : ''}
            ${scoreData.logicTotal > 0 ? `<div class="score-breakdown-row"><span>逻辑推理</span><span>${scoreData.logicTotal} 分</span></div>` : ''}
            <div class="score-breakdown-row">
              <span>单选题</span>
              <span>${scoreData.single} / ${scoreData.maxSingle} 分</span>
            </div>
            <div class="score-breakdown-row">
              <span>多选题</span>
              <span>${scoreData.multiple} / ${scoreData.maxMultiple} 分</span>
            </div>
            <div class="score-breakdown-row">
              <span>判断题</span>
              <span>${scoreData.judge} / ${scoreData.maxJudge} 分</span>
            </div>
            <div class="score-breakdown-row">
              <span>多重判断题</span>
              <span>${scoreData.mtf} / ${scoreData.maxMtf} 分</span>
            </div>
            <div class="score-breakdown-row score-breakdown-total">
              <span>总分</span>
              <span>${scoreData.total} / ${scoreData.maxTotal} 分</span>
            </div>
          </div>
        ` : ''}
      </div>
      <div style="display:flex;gap:12px;">
        ${!submitted ? `
          <button class="btn btn-secondary btn-sm" id="regenerateBtn">重新组卷</button>
          <button class="btn btn-success" id="submitBtn">提交试卷</button>
        ` : `
          <button class="btn btn-primary btn-sm" id="regenerateBtn">再来一套</button>
        `}
      </div>
    </div>
  `;

  paperEl.innerHTML = html;

  paperEl.querySelectorAll('.pq-native-input').forEach(input => {
    input.addEventListener('change', function () {
      if (submitted) return;
      const qId = parseInt(this.name.split('-')[1]);
      const optIdx = parseInt(this.value);
      selectAnswer(qId, optIdx);
    });
  });

  // MTF 题型：正确/错误 按钮切换（原地更新，不重建整卷）
  paperEl.querySelectorAll('.pq-tf-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      if (submitted) return;
      const qIdx = parseInt(this.getAttribute('data-mtf-q'), 10);
      const subIdx = parseInt(this.getAttribute('data-mtf-idx'), 10);
      const value = this.getAttribute('data-value') === 'true';
      setMtfAnswer(qIdx, subIdx, value);
    });
  });

  // v4.0 四向联动按钮事件
  paperEl.querySelectorAll('.pq-linkage-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      var action = this.getAttribute('data-action');
      var concept = this.getAttribute('data-concept') || '';
      var qidx = this.getAttribute('data-qidx');
      if (action === 'kg') {
        // 跳转到知识图谱，并通过 sessionStorage 传递概念
        try { sessionStorage.setItem('bioquest_kg_focus', concept); } catch (e) {}
        if (typeof navigateTo === 'function') navigateTo('/knowledge-graph');
      } else if (action === 'wrongbook') {
        var q = currentPaper[parseInt(qidx)];
        if (q) {
          // Issue #10：统一使用题目稳定 bioID，避免云端/本地错题引用漂移
          var qBio = getQuestionBioId(q);
          if (typeof window.addWrongQuestion === 'function') {
            // supabase-client 云端版签名 addWrongQuestion(question)：
            // 把 bioID 挂到 question_id，使 review_cards 引用与题库一致
            window.addWrongQuestion(Object.assign({}, q, { question_id: qBio }));
            this.textContent = '✓ 已加入';
            this.disabled = true;
          } else {
            // 兜底：直接写入 localStorage（同样以稳定 bioID 为 id，key 与 storage.js KEYS.WRONG_QUESTIONS 一致）
            try {
              var arr = JSON.parse(localStorage.getItem('bioquest_wrong_questions') || '[]');
              arr.push({ qId: qBio, questionText: q.question, subject: q.subject, timestamp: Date.now(), wrongCount: 1 });
              localStorage.setItem('bioquest_wrong_questions', JSON.stringify(arr.slice(-200)));
              this.textContent = '✓ 已加入';
              this.disabled = true;
            } catch (e) {}
          }
        }
      } else if (action === 'card') {
        // 跳转到卡片页，并通过 sessionStorage 传递概念
        try { sessionStorage.setItem('bioquest_card_focus', concept); } catch (e) {}
        if (typeof navigateTo === 'function') navigateTo('/cards');
      }
    });
  });

  const regenerateBtn = document.getElementById('regenerateBtn');
  if (regenerateBtn) {
    regenerateBtn.addEventListener('click', () => {
      generateNewPaper();
    });
  }

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', submitPaper);
  }

  const label = document.getElementById('quizLabel');
  if (label) label.textContent = submitted ? '已完成' : '进行中';
}

function selectAnswer(qIdx, optIdx) {
  if (submitted) return;
  const q = currentPaper[qIdx];
  const qType = q.type || 'single';

  if (qType === 'multiple') {
    if (!Array.isArray(userAnswers[qIdx])) {
      userAnswers[qIdx] = [];
    }
    const idx = userAnswers[qIdx].indexOf(optIdx);
    if (idx > -1) {
      userAnswers[qIdx].splice(idx, 1);
    } else {
      userAnswers[qIdx].push(optIdx);
    }
  } else {
    userAnswers[qIdx] = optIdx;
  }

  // 原地更新选中态，避免整卷重渲染（每点一个选项都重建整张试卷）被感知为页面刷新
  const qEl = document.getElementById('pq-' + qIdx);
  if (qEl) {
    qEl.querySelectorAll('.pq-native-input').forEach((input) => {
      const oIdx = parseInt(input.value, 10);
      const isSelected = qType === 'multiple'
        ? (Array.isArray(userAnswers[qIdx]) && userAnswers[qIdx].indexOf(oIdx) > -1)
        : userAnswers[qIdx] === oIdx;
      input.checked = isSelected;
      const labelEl = input.closest('label');
      if (labelEl) labelEl.classList.toggle('selected', isSelected);
    });
  }
}

/**
 * MTF 题型作答：userAnswers[qIdx] 以对象存储 { 子题索引: true/false }。
 * 点击「正确/错误」按钮后原地更新两个按钮的选中态，避免整卷重渲染。
 */
function setMtfAnswer(qIdx, subIdx, value) {
  if (submitted) return;
  if (!userAnswers[qIdx] || typeof userAnswers[qIdx] !== 'object' || Array.isArray(userAnswers[qIdx])) {
    userAnswers[qIdx] = {};
  }
  userAnswers[qIdx][subIdx] = value;

  const qEl = document.getElementById('pq-' + qIdx);
  if (qEl) {
    qEl.querySelectorAll('.pq-tf-btn[data-mtf-idx="' + subIdx + '"]').forEach(btn => {
      const on = btn.getAttribute('data-value') === String(value);
      btn.classList.toggle('pq-tf-active', on);
      btn.classList.toggle('pq-tf-true', on && value === true);
      btn.classList.toggle('pq-tf-false', on && value === false);
    });
    // 同步「已答」计数显示
    const answeredCount = Object.keys(userAnswers).filter(k => {
      const ans = userAnswers[k];
      if (Array.isArray(ans)) return ans.length > 0;
      if (ans && typeof ans === 'object') {
        const subs = currentPaper[parseInt(k, 10)] ? getEffectiveSubQuestions(currentPaper[parseInt(k, 10)]) : [];
        if (subs.length === 0) return false;
        return subs.every((_, idx) => ans[idx] === true || ans[idx] === false);
      }
      return ans !== undefined && ans !== null;
    }).length;
    const infoEl = qEl.closest('.paper-question') ? document.querySelector('.paper-info-num') : null;
    if (infoEl) infoEl.textContent = answeredCount;
  }
}

/**
 * 试题页（模拟卷）题目评分 tag + 点赞/点踩按钮。
 * 与练习页共享同一套 localStorage 投票/评分存储（storage.js rateQuestion 系列）：
 * - 按钮内联展示当前 up/down 计数与我的投票态；
 * - 投票后原地刷新计数与评分 tag，不重建整卷；
 * - 低分（平滑评分 < 0.35 且票数 >= 5）自动移入回收站，后续出卷不再包含。
 */
function _examVoteHtml(qIdx) {
  const q = currentPaper[qIdx];
  if (!q) return '';
  const bioId = getQuestionBioId(q);
  const r = (typeof window.getQuestionRating === 'function') ? window.getQuestionRating(bioId) : null;
  const up = r ? (r.up || 0) : 0;
  const down = r ? (r.down || 0) : 0;
  const my = (typeof window.getMyVote === 'function') ? (window.getMyVote(bioId) || 0) : 0;
  return `
    <span class="pq-vote">
      <button type="button" class="pq-vote-btn ${my === 1 ? 'pq-vote-active' : ''}" data-vote="1" data-exam-vote-q="${qIdx}"
        title="这道题好，多刷点">
        ${EXAM_VOTE_UP_SVG}<span class="pq-vote-count">${up}</span>
      </button>
      <button type="button" class="pq-vote-btn ${my === -1 ? 'pq-vote-active' : ''}" data-vote="-1" data-exam-vote-q="${qIdx}"
        title="这道题有问题，少刷点">
        ${EXAM_VOTE_DOWN_SVG}<span class="pq-vote-count">${down}</span>
      </button>
    </span>
  `;
}

/**
 * 试题页投票处理（同练习页 handleVoteQuestion 的语义）：
 * 相同方向再点 = 取消投票；低分自动回收；原地刷新计数/tag。
 */
function _examHandleVote(qIdx, vote) {
  const q = currentPaper[qIdx];
  if (!q || typeof window.rateQuestion !== 'function') return;
  const bioId = getQuestionBioId(q);
  const myVote = (typeof window.getMyVote === 'function') ? (window.getMyVote(bioId) || 0) : 0;
  const nextVote = (myVote === vote) ? 0 : vote;
  const res = window.rateQuestion(bioId, nextVote);
  if (!res) return;

  const qEl = document.getElementById('pq-' + qIdx);
  if (!qEl) return;
  // 原地更新两个按钮的计数与激活态（不重建整卷，保持作答状态）
  qEl.querySelectorAll('[data-exam-vote-q="' + qIdx + '"]').forEach(function (btn) {
    const v = parseInt(btn.getAttribute('data-vote'), 10);
    btn.classList.toggle('pq-vote-active', res.myVote === v);
    const cnt = btn.querySelector('.pq-vote-count');
    if (cnt) cnt.textContent = v === 1 ? res.up : res.down;
  });

  // 评分 tag：有票时展示平滑评分 + 票数（低分回收后标注）
  const meta = qEl.querySelector('.pq-meta');
  if (meta) {
    const oldTag = meta.querySelector('[data-exam-rating-tag]');
    if (oldTag) oldTag.remove();
    if (res.up + res.down > 0 && typeof window.RatingCore === 'object') {
      const score01 = window.RatingCore.wilsonScore(res.up, res.down);
      const scoreStr = window.RatingCore.formatQuestionScore(score01);
      const tagBtn = document.createElement('span');
      tagBtn.className = 'pq-rating-tag';
      tagBtn.setAttribute('data-exam-rating-tag', '');
      tagBtn.textContent = '评分 ' + scoreStr + ' · ' + (res.up + res.down) + '票';
      if (typeof window.recycleQuestion === 'function' &&
          window.RatingCore.shouldRecycleQuestion(res.up, res.down)) {
        window.recycleQuestion(bioId);
        tagBtn.textContent += ' · 已回收';
      }
      meta.appendChild(tagBtn);
    }
  }
}

/**
 * 单题判定（'full' | 'partial' | 'none'）—— 薄封装：
 * 唯一实现在 question-model.js 的 gradeQuestion(q, ua, 'quiz').verdict
 * （含「MTF 未全部作答按零分」「多选半对」等口径）。
 */
function getSingleQuestionScore(q, i) {
  return QuestionModel.gradeQuestion(q, userAnswers[i], 'quiz').verdict;
}

function calculateScore() {
  let singleScore = 0;
  let multipleScore = 0;
  let judgeScore = 0;
  let mtfScore = 0;
  let basicTotal = 0;
  let logicTotal = 0;
  let maxSingle = 0;
  let maxMultiple = 0;
  let maxJudge = 0;
  let maxMtf = 0;

  currentPaper.forEach((q, i) => {
    const qType = q.type || 'single';
    const result = getSingleQuestionScore(q, i);
    const score = getTypeScore(qType);
    const isLogic = q.category === 'logic';

    if (qType === 'single') {
      maxSingle += score;
      if (result === 'full') {
        singleScore += score;
        if (isLogic) logicTotal += score; else basicTotal += score;
      }
    } else if (qType === 'multiple') {
      maxMultiple += SCORE_MULTIPLE_FULL;
      if (result === 'full') {
        multipleScore += SCORE_MULTIPLE_FULL;
        if (isLogic) logicTotal += SCORE_MULTIPLE_FULL; else basicTotal += SCORE_MULTIPLE_FULL;
      } else if (result === 'partial') {
        multipleScore += SCORE_MULTIPLE_PARTIAL;
        if (isLogic) logicTotal += SCORE_MULTIPLE_PARTIAL; else basicTotal += SCORE_MULTIPLE_PARTIAL;
      }
    } else if (qType === 'judge') {
      maxJudge += score;
      if (result === 'full') {
        judgeScore += score;
        if (isLogic) logicTotal += score; else basicTotal += score;
      }
    } else if (qType === 'mtf') {
      maxMtf += SCORE_SINGLE;
      if (result === 'full') {
        mtfScore += SCORE_SINGLE;
        if (isLogic) logicTotal += SCORE_SINGLE; else basicTotal += SCORE_SINGLE;
      } else if (result === 'partial') {
        mtfScore += SCORE_MULTIPLE_PARTIAL;
        if (isLogic) logicTotal += SCORE_MULTIPLE_PARTIAL; else basicTotal += SCORE_MULTIPLE_PARTIAL;
      }
    }
  });

  return {
    single: singleScore,
    multiple: multipleScore,
    judge: judgeScore,
    mtf: mtfScore,
    total: singleScore + multipleScore + judgeScore + mtfScore,
    maxSingle,
    maxMultiple,
    maxJudge,
    maxMtf,
    maxTotal: maxSingle + maxMultiple + maxJudge + maxMtf,
    basicTotal,
    logicTotal
  };
}

function submitPaper() {
  submitted = true;
  // v4.0 苏格拉底同学触发：上报每题对错（用于共情模式检测）
  if (typeof window.BioQuestClassmate === 'object' && window.BioQuestClassmate) {
    try {
      currentPaper.forEach(function (q, i) {
        var result = getSingleQuestionScore(q, i);
        if (result === 'full') {
          if (typeof window.BioQuestClassmate.onCorrectAnswer === 'function') {
            window.BioQuestClassmate.onCorrectAnswer();
          }
        } else {
          if (typeof window.BioQuestClassmate.onWrongAnswer === 'function') {
            window.BioQuestClassmate.onWrongAnswer({
              question: q.question || '',
              concept: q.subject || '',
              subject: q.subject || '',
              source: 'quiz'
            });
          }
        }
      });
    } catch (e) { /* 静默失败 */ }
  }
  renderPaper();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadQuizData();

  // Issue #10：确保 bioID 映射表已加载（本页未预加载分片，需手动触发）。
  // 使错题本/收藏里的旧 hash ID 能解析为稳定 bioID（data/bioid-map.json 体积小、毫秒级加载）。
  if (typeof window.loadBioIdMap === 'function' && !window.bioIdMap) {
    try { window.loadBioIdMap(); } catch (e) {}
  }

  const btn = document.getElementById('quizCrawlBtn');
  if (btn) {
    btn.addEventListener('click', function () {
      // 首次加载失败/部分失败时，「在线组卷」同时充当重试入口：
      // 当前模式所需的题库未就绪则先补加载（自动重试），成功后再出卷。
      const needData = selectedCategory !== 'logic';
      const needLogic = selectedCategory !== 'basic';
      if ((needData && !dataLoaded) || (needLogic && !logicLoaded)) {
        loadQuizData().then(function () { generateNewPaper(); });
        return;
      }
      generateNewPaper();
    });
  }

  // 试题页点赞/点踩（事件委托：renderPaper 重建 DOM 后仍有效）
  document.addEventListener('click', function (e) {
    const voteBtn = e.target && e.target.closest ? e.target.closest('.pq-vote-btn') : null;
    if (!voteBtn) return;
    const qIdx = parseInt(voteBtn.getAttribute('data-exam-vote-q'), 10);
    const vote = parseInt(voteBtn.getAttribute('data-vote'), 10);
    if (!isNaN(qIdx) && (vote === 1 || vote === -1)) {
      _examHandleVote(qIdx, vote);
    }
  });

  // 绑定类别选择按钮
  document.querySelectorAll('.quiz-category-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.quiz-category-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      selectedCategory = this.dataset.category;
      updateCategoryLabel();
    });
  });
});
