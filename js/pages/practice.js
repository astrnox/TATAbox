/**
 * ============================================================
 * TATABOX — 练习模式模块
 * 支持 MTF（多重判断）题型的专项练习，含筛选、答题、计分、
 * 收藏、错题管理和数据持久化
 * ============================================================
 */

'use strict';

const PracticeModuleGroups = [
  {
    id: 'module1',
    label: '模块一',
    subjects: ['生物化学', '分子生物学', '细胞生物学']
  },
  {
    id: 'module2',
    label: '模块二',
    subjects: ['植物学', '植物生理学', '微生物学']
  },
  {
    id: 'module3',
    label: '模块三',
    subjects: ['动物学', '动物生理学', '生态学']
  },
  {
    id: 'module4',
    label: '模块四',
    subjects: ['遗传学', '进化生物学', '演化生物学', '生物信息学', '群体遗传学']
  }
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '基础' },
  { value: 'medium', label: '进阶' },
  { value: 'hard', label: '挑战' }
];

const TARGET_OPTIONS = [
  { value: 'high_school', label: '高考' },
  { value: 'competition', label: '竞赛' },
  { value: 'both', label: '共通' }
];

const QUESTION_COUNT_OPTIONS = [5, 10, 20, 50];

const PracticeState = {
  allQuestions: [],
  logicData: [],           // 逻辑推理题库
  logicLoaded: false,      // 逻辑推理题是否已加载
  leagueData: [],          // 联赛真题池（resource/all.json，2873 道）
  leagueLoaded: false,     // 联赛真题是否已加载
  filteredQuestions: [],
  currentSet: [],
  currentIndex: 0,
  userAnswers: {},
  submitted: false,
  favorites: new Set(),
  wrongMarked: new Set(),
  totalScore: 0,
  totalAnswered: 0,
  moduleStats: {},
  startTime: 0,
  started: false,
  selectedModules: ['module1', 'module2', 'module3', 'module4'],
  selectedDifficulties: ['easy', 'medium', 'hard'],
  selectedCategory: 'all',  // 'all' | 'basic' | 'logic'
  selectedTargets: ['high_school', 'competition', 'both'], // 目标群体：高考/竞赛/重叠
  questionCount: 10,
  redoMode: false,
  conceptFilter: null,      // 来自知识图谱的专项概念过滤
  kgSource: null,           // 知识图谱来源信息
  kgCategory: null          // 知识图谱来源的学科分类（如"植物学"），用于精确过滤
};

let practiceStylesInjected = false;

/**
 * 带超时与自动重试的 JSON 拉取：首次访问 CDN/静态代理冷加载常较慢甚至超时。
 * 超时后取消挂起请求、短暂退避重试一次（CDN/HTTP 缓存往往已预热），
 * 避免练习/逻辑题库首次加载失败后整页不可用。
 */
function _fetchLocalJsonWithRetry(url, attempts, timeoutMs) {
  attempts = attempts || 2;
  timeoutMs = timeoutMs || 15000;
  var lastErr = null;
  function attempt(i) {
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, timeoutMs);
    }
    return fetch(url, controller ? { signal: controller.signal } : {})
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
        return res.json();
      })
      .then(function (body) {
        clearTimeout(timer);
        return { ok: true, data: body };
      })
      .catch(function (err) {
        clearTimeout(timer);
        lastErr = (err && err.name === 'AbortError') ? new Error('加载超时') : err;
        if (i < attempts) {
          return new Promise(function (resolve) { setTimeout(resolve, 500 * i); })
            .then(function () { return attempt(i + 1); });
        }
        return { ok: false, error: lastErr };
      });
  }
  return attempt(1);
}

var PRACTICE_SYNC_DEBOUNCE_MS = 300;     // 分数同步防抖时间
var PRACTICE_PANEL_FADE_MS = 250;         // 筛选面板淡出延迟（重渲染前等待过渡完成）
var PRACTICE_PULL_TICK_MS = 1000;         // 拉取冷却倒计时刷新间隔
var PRACTICE_LAST_Q_BANNER_MS = 1200;     // 最后一题横幅展示时长

var SYNC_INTERVAL = 5; // 每答几题同步一次（可配置）
var _syncAnswerCounter = 0;
var _syncDebounceTimer = null;
var _syncPending = false;

/**
 * 将最新分数同步到服务器（带防抖，避免频繁调用）
 * @param {Object} scoreData - { bio_score, total_answered, total_correct, accuracy, practice_count }
 */
function syncScoreToServer(scoreData) {
  if (!scoreData) return;
  _syncPending = true;

  // 防抖：300ms 内多次调用只执行最后一次
  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(function() {
    _syncDebounceTimer = null;
    if (!_syncPending) return;
    _syncPending = false;

    // 优先使用 Supabase 直连同步
    if (typeof window.updateBioScore === 'function' && typeof window.getSupabase === 'function' && window.getSupabase()) {
      window.updateBioScore(scoreData.bio_score || 0, {
        practice_count: scoreData.practice_count || 0,
        total_answered: scoreData.total_answered || 0,
        total_correct: scoreData.total_correct || 0,
        accuracy: scoreData.accuracy || 0
      }).catch(function() {});
    }
  }, PRACTICE_SYNC_DEBOUNCE_MS);
}

/**
 * 检查是否需要触发同步（每 SYNC_INTERVAL 题触发一次）
 * 应在每次提交答案后调用
 */
function checkAndSyncScore() {
  _syncAnswerCounter++;
  if (_syncAnswerCounter >= SYNC_INTERVAL) {
    _syncAnswerCounter = 0;
    try {
      var stats = typeof getStats === 'function' ? getStats() : null;
      if (stats && typeof calcBioScore === 'function') {
        var bioResult = calcBioScore(stats);
        syncScoreToServer({
          bio_score: bioResult.score,
          total_answered: stats.totalAnswered || 0,
          total_correct: stats.totalCorrect || 0,
          accuracy: stats.accuracy || 0,
          practice_count: stats.totalAnswered || 0
        });
      }
    } catch(e) {}
  }
}

/** 重置同步计数器（新会话开始时调用） */
function resetSyncCounter() {
  _syncAnswerCounter = 0;
  _syncPending = false;
  if (_syncDebounceTimer) { clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
}

function injectPracticeStyles() {
  if (practiceStylesInjected) return;
  practiceStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'bioquest-practice-styles';
  style.textContent = `
    .practice-answer-correct {
      animation: practiceCorrectPulse 0.5s ease;
    }

    @keyframes practiceCorrectPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(58, 140, 92, 0.3); }
      50% { box-shadow: 0 0 0 8px rgba(58, 140, 92, 0); }
    }

    .practice-answer-wrong {
      animation: practiceWrongShake 0.4s ease;
    }

    @keyframes practiceWrongShake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
      20%, 40%, 60%, 80% { transform: translateX(4px); }
    }

    .practice-fade-in {
      animation: practiceFadeSlide 0.35s ease forwards;
    }

    @keyframes practiceFadeSlide {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* 类别选择器 */
    .practice-category-selector {
      display: flex;
      gap: 6px;
      background: var(--surface-secondary, #f5f3ef);
      border-radius: 8px;
      padding: 4px;
    }

    .practice-category-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      background: transparent;
      color: var(--text-secondary, #666);
    }

    .practice-category-btn:hover {
      background: rgba(90, 125, 92, 0.1);
      color: var(--color-sage, #5a7d5c);
    }

    .practice-category-btn.active {
      background: var(--color-sage, #5a7d5c);
      color: #fff;
      box-shadow: var(--shadow-md);
    }

    /* 练习模式按钮 */
    .practice-mode-selector {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .practice-mode-btn {
      padding: 8px 18px;
      border: 1.5px solid var(--border-default, #e0dcd5);
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      background: var(--surface-primary, #ffffff);
      color: var(--text-secondary, #4a4a4a);
    }
    .practice-mode-btn:hover {
      border-color: var(--color-sage, #5a7d5c);
      color: var(--color-sage, #5a7d5c);
    }
    .practice-mode-btn.active {
      background: var(--color-sage, #5a7d5c);
      border-color: var(--color-sage, #5a7d5c);
      color: #fff;
      box-shadow: var(--shadow-md);
    }
    .practice-mode-btn[data-mode="gaokao"].active {
      background: #3a7d5c;
      border-color: #3a7d5c;
      box-shadow: var(--shadow-md);
    }
    .practice-mode-btn[data-mode="competition"].active {
      background: #5a5a9c;
      border-color: #5a5a9c;
      box-shadow: var(--shadow-md);
    }

    /* 逻辑推理题选项样式 */
    .practice-logic-option {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 16px;
      border: 1.5px solid var(--border, #e0e0e0);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 8px;
    }

    .practice-logic-option:hover {
      border-color: var(--color-sage, #5a7d5c);
      background: rgba(90, 125, 92, 0.04);
    }

    .practice-logic-selected {
      border-color: var(--color-sage, #5a7d5c);
      background: rgba(90, 125, 92, 0.08);
    }

    .practice-logic-correct {
      border-color: var(--success-green, #3a8c5c);
      background: rgba(58, 140, 92, 0.08);
    }

    .practice-logic-wrong {
      border-color: var(--terracotta, #c0553a);
      background: rgba(192, 85, 58, 0.08);
    }

    .practice-logic-marker {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 2px solid var(--border, #e0e0e0);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      flex-shrink: 0;
      transition: all 0.2s;
    }

    .practice-logic-selected .practice-logic-marker {
      border-color: var(--color-sage, #5a7d5c);
      background: var(--color-sage, #5a7d5c);
      color: #fff;
    }

    .practice-logic-correct .practice-logic-marker {
      border-color: var(--success-green, #3a8c5c);
      background: var(--success-green, #3a8c5c);
      color: #fff;
    }

    .practice-logic-wrong .practice-logic-marker {
      border-color: var(--terracotta, #c0553a);
      background: var(--terracotta, #c0553a);
      color: #fff;
    }

    .practice-logic-text {
      font-size: 0.938rem;
      line-height: 1.6;
      padding-top: 2px;
    }

    .practice-shortcut-hint {
      margin-top: 14px;
      padding: 10px 14px;
      border: 1px dashed var(--border-light, #ece8e1);
      border-radius: 8px;
      background: var(--surface-secondary, rgba(0,0,0,0.02));
      font-size: 0.78rem;
      color: var(--text-muted, #8a8a8a);
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      align-items: center;
      line-height: 1.8;
    }
    .practice-shortcut-hint kbd {
      display: inline-block;
      min-width: 1.2em;
      padding: 1px 6px;
      border: 1px solid var(--border-light, #d8d4cc);
      border-bottom-width: 2px;
      border-radius: 4px;
      background: var(--surface-primary, #fff);
      color: var(--text-secondary, #555);
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 0.74rem;
      line-height: 1.4;
      text-align: center;
      white-space: nowrap;
    }
    .practice-shortcut-hint .sh-sep {
      color: var(--border-light, #d0ccc4);
    }
    @media (max-width: 640px) {
      .practice-shortcut-hint {
        font-size: 0.72rem;
        gap: 4px 10px;
      }
    }
  `;

  document.head.appendChild(style);
}

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

async function loadPracticeQuestions() {
  try {
    var filterMods = PracticeState.selectedModules.length > 0
      ? PracticeState.selectedModules
      : null;

    var moduleMap = { module1: 1, module2: 2, module3: 3, module4: 4 };
    var modNums = filterMods ? filterMods.map(function (id) { return moduleMap[id]; }) : [1, 2, 3, 4];

    if (typeof window.loadQuestions === 'function') {
      // 设置页「题库数据源=本地题库」时改走 PREFER_LOCAL，不触发 Supabase 请求
      var qSource = (typeof loadSetting === 'function') ? loadSetting('question_source', 'cloud') : 'cloud';
      var loadOpt = {
        onProgress: function (mod, count) {

        }
      };
      if (qSource === 'local') {
        loadOpt.mode = (window.LoaderMode && window.LoaderMode.PREFER_LOCAL)
          ? window.LoaderMode.PREFER_LOCAL
          : 'preferLocal';
      }
      var items = await window.loadQuestions(modNums, loadOpt);
      // 超长讲义过滤
      var itemsClean = (typeof window.filterQuestionList === 'function') ? window.filterQuestionList(items) : items;
      // 保留清洗后的全量副本，供分享深链按 ID/文本兜底定位（被回收/过滤的题仍可打开）
      PracticeState.allQuestionsRaw = itemsClean;
      PracticeState.allQuestions = itemsClean.filter(
        function (q) { return Array.isArray(q.subQuestions) && q.subQuestions.length >= 4 && !_isRecycledQuestion(q); }
      );
    } else {
      // 从 Supabase 直连获取
      try {
        var sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
        if (sb) {
          var query = sb.from('questions').select('*').eq('type', 'mtf');
          // 模块过滤：module字段值为 module_1/module_2/module_3/module_4 格式
          if (modNums && modNums.length > 0 && modNums.length < 4) {
            var moduleFilters = [];
            for (var mi = 0; mi < modNums.length; mi++) {
              var mn = modNums[mi];
              moduleFilters.push('module_' + mn);
            }
            query = query.in('module', moduleFilters);
          }
          var { data: sbData, error: sbError } = await query;
          if (!sbError && sbData && sbData.length > 0) {
            var normed = sbData.map(function(q) {
              // 容错：sub_questions 可能是 JSON 字符串或数组
              var subQ = q.sub_questions || q.subQuestions || [];
              if (typeof subQ === 'string') {
                try { subQ = JSON.parse(subQ); } catch(e) { subQ = []; }
              }
              if (!Array.isArray(subQ)) subQ = [];
              // 标准化subQuestions格式：确保有label字段，兼容answer/is_true
              var labels = ['A', 'B', 'C', 'D', 'E', 'F'];
              var normSubQ = [];
              for (var si = 0; si < subQ.length; si++) {
                var sq = subQ[si] || {};
                var ans = false;
                if (sq.answer !== undefined) ans = !!sq.answer;
                else if (sq.is_true !== undefined) ans = !!sq.is_true;
                normSubQ.push({
                  label: sq.label || labels[si],
                  text: sq.text || '',
                  answer: ans
                });
              }
              return {
                id: q.id || null,
                type: q.type, question: q.question,
                subQuestions: normSubQ,
                explanation: q.explanation || '', subject: q.subject || '',
                concept: q.concept || '', difficulty: q.difficulty || 'medium',
                chart: q.chart || null, year: q.year || null
              };
            });
            // 超长讲义过滤（cleaned 同时会把 300+ 字的选项截断）
            var fn = typeof window.filterQuestionList === 'function' ? window.filterQuestionList : function(x){return x;};
            var cleanedAll = fn(normed);
            // 保留清洗后的全量副本，供分享深链按 ID/文本兜底定位
            PracticeState.allQuestionsRaw = cleanedAll;
            PracticeState.allQuestions = cleanedAll.filter(
              function(q) { return Array.isArray(q.subQuestions) && q.subQuestions.length >= 4 && !_isRecycledQuestion(q); }
            );
            return;
          }
        }
      } catch (e) {
        console.warn('[Practice] 从 Supabase 加载失败，回退本地 JSON:', e.message);
      }
      var res = await _fetchLocalJsonWithRetry('data/quiz.json');
      if (!res.ok) throw (res.error || new Error('quiz.json 加载失败'));
      var data = res.data;
      // P0-4: 应用隔离过滤 → 超长知识讲义过滤 → 筛选符合练习格式的题目
      var rawQuestions0 = (typeof window._filterQuarantinedQuestions === 'function')
        ? window._filterQuarantinedQuestions(data.题库 || [])
        : (data.题库 || []);
      var rawQuestions = (typeof window.filterQuestionList === 'function')
        ? window.filterQuestionList(rawQuestions0)
        : rawQuestions0;
      // 保留清洗后的全量副本，供分享深链按 ID/文本兜底定位
      PracticeState.allQuestionsRaw = rawQuestions;
      PracticeState.allQuestions = rawQuestions.filter(
        function (q) { return Array.isArray(q.subQuestions) && q.subQuestions.length >= 4 && !_isRecycledQuestion(q); }
      );
    }
  } catch (err) {
    console.error('[TATABOX Practice] 加载题目数据失败:', err.message);
    PracticeState.allQuestions = [];
  }
}

/**
 * 加载联赛真题池（resource/all.json）。
 * 由 scripts/build-league-pool.js 从单题资源聚合，已含判卷格式
 * （single→options+字母、multiple/mtf→subQuestions）与 concept/年份/来源标签。
 * 加载失败只告警不阻断（联赛题为增量内容，基础题池不受影响）。
 */
async function loadLeagueQuestions() {
  if (PracticeState.leagueLoaded) return;
  try {
    const res = await _fetchLocalJsonWithRetry('resource/all.json');
    if (!res.ok || !res.data || !Array.isArray(res.data.questions)) return;
    const items = typeof window.filterQuestionList === 'function'
      ? window.filterQuestionList(res.data.questions)
      : res.data.questions;
    PracticeState.leagueData = items.filter(function (q) { return !_isRecycledQuestion(q); });
    PracticeState.leagueLoaded = true;
    applyFilters();
    updateAvailableCount();
  } catch (e) {
    console.warn('[Practice] 联赛真题池加载失败', e);
  }
}

async function loadLogicQuestions() {
  if (PracticeState.logicLoaded) return;
  try {
    const res = await _fetchLocalJsonWithRetry('data/logic_questions.json');
    if (res.ok) {
      var logicData = res.data;
      // P0-4: 应用隔离过滤 + 回收站过滤（低分下架题目用户不再刷到）
      PracticeState.logicData = (typeof window._filterQuarantinedQuestions === 'function')
        ? window._filterQuarantinedQuestions(logicData).filter(function (q) { return !_isRecycledQuestion(q); })
        : logicData.filter(function (q) { return !_isRecycledQuestion(q); });
      PracticeState.logicLoaded = true;

      // 加载完成后刷新筛选结果
      applyFilters();
      updateAvailableCount();
    }
  } catch (e) {
    console.warn('[Practice] 逻辑推理题库加载失败', e);
  }
}

/**
 * 模块匹配：优先用题目自带 module 字段（联赛真题 subject 可能是大类「生物学」
 * 无法按学科分组），无 module 时回退到学科 ∈ 已选模块的学科列表。
 * @param {Object} q
 * @param {string[]} activeSubjects 已选模块展开的学科列表
 * @param {string[]} selectedModules 已选模块 id（module1..4）
 */
function _moduleMatches(q, activeSubjects, selectedModules) {
  if (q && typeof q.module === 'string' && /^module_[1-4]$/.test(q.module)) {
    return selectedModules.indexOf('module' + q.module.slice(-1)) >= 0;
  }
  return activeSubjects.indexOf(q && q.subject) >= 0;
}

function applyFilters() {
  const activeSubjects = PracticeState.kgCategory
    ? [PracticeState.kgCategory]  // When from knowledge graph, only include the specific subject
    : PracticeModuleGroups
        .filter((g) => PracticeState.selectedModules.includes(g.id))
        .flatMap((g) => g.subjects);
  // 当所有模块都选中时，跳过 subject 过滤（包含未知/空 subject 的题目也保留）
  const allModulesSelected = PracticeState.selectedModules.length >= 4
    && PracticeModuleGroups.every((g) => PracticeState.selectedModules.includes(g.id));

  const conceptFilter = PracticeState.conceptFilter;

  // 将前端 easy/medium/hard 与服务器 basic/league/national 做统一映射
  const diffNormalize = function(d) {
    if (!d) return 'easy';
    if (typeof d === 'number') {
      if (d <= 2) return 'easy';
      if (d >= 4) return 'hard';
      return 'medium';
    }
    const s = String(d).toLowerCase();
    if (s === 'basic' || s === 'easy') return 'easy';
    if (s === 'league' || s === 'medium') return 'medium';
    if (s === 'national' || s === 'hard' || s === 'ibo') return 'hard';
    // 非标准值（如中文、未知字符串）→ 默认归为 medium，避免过滤丢失题目
    return 'medium';
  };
  const selectedDiffsNorm = PracticeState.selectedDifficulties.map(diffNormalize);
  // 当用户选了全部难度时，跳过难度过滤（避免归一化误差导致漏题）
  const allDiffsSelected = selectedDiffsNorm.length >= 3
    && selectedDiffsNorm.indexOf('easy') >= 0
    && selectedDiffsNorm.indexOf('medium') >= 0
    && selectedDiffsNorm.indexOf('hard') >= 0;

  // 目标群体：题目 target 需在已选目标中；题目没有 target 时按难度/特征推断
  const validTargets = PracticeState.selectedTargets.length > 0
    ? PracticeState.selectedTargets
    : ['high_school', 'competition', 'both'];
  // 当用户选了全部目标群体时，跳过 target 过滤（避免推断误差导致漏题）
  const allTargetsSelected = validTargets.length >= 3
    && validTargets.indexOf('high_school') >= 0
    && validTargets.indexOf('competition') >= 0
    && validTargets.indexOf('both') >= 0;

  // 根据题目信息推断目标（题目没有 target 字段时的回退策略）
  const inferTarget = function(q) {
    if (q.target) return q.target;
    const d = String(q.difficulty || '').toLowerCase();
    if (d === 'basic' || d === 'easy') return 'high_school';
    if (d === 'national' || d === 'league' || d === 'hard') return 'competition';
    return 'both';
  };

  // 基础知识题（MTF 格式）
  let basicQuestions = PracticeState.allQuestions.filter((q) => {
    const subjectMatch = allModulesSelected || _moduleMatches(q, activeSubjects, PracticeState.selectedModules);
    const qDiff = diffNormalize(q.difficulty);
    const diffMatch = allDiffsSelected || selectedDiffsNorm.includes(qDiff);
    const qTarget = inferTarget(q);
    const targetMatch = allTargetsSelected || validTargets.includes(qTarget);
    let conceptMatch = true;
    if (conceptFilter) {
      // Strict matching: exact concept field or tags
      const exactConcept = q.concept === conceptFilter;
      const inTags = q.tags && q.tags.indexOf(conceptFilter) >= 0;

      if (PracticeState.kgCategory) {
        // From knowledge graph: strict matching only (no loose inQuestion/inExplanation)
        conceptMatch = exactConcept || inTags;
      } else {
        // Regular filtering: allow loose matching
        const inQuestion = q.question && q.question.indexOf(conceptFilter) >= 0;
        const inExplanation = q.explanation && q.explanation.indexOf(conceptFilter) >= 0;
        conceptMatch = exactConcept || inTags || inQuestion || inExplanation;
      }
    }
    // 知识图谱来源时，进一步按学科分类精确筛选（避免大模块下的非专项内容）
    let kgCategoryMatch = true;
    if (PracticeState.kgCategory) {
      kgCategoryMatch = q.subject === PracticeState.kgCategory;
    }
    return subjectMatch && diffMatch && targetMatch && conceptMatch && kgCategoryMatch;
  });

  // 逻辑推理题（单选格式）
  let logicQuestions = [];
  if (PracticeState.selectedCategory === 'all' || PracticeState.selectedCategory === 'logic') {
    logicQuestions = PracticeState.logicData.filter((q) => {
      const subjectMatch = allModulesSelected || _moduleMatches(q, activeSubjects, PracticeState.selectedModules);
      const qDiff = diffNormalize(q.difficulty);
      const diffMatch = allDiffsSelected || selectedDiffsNorm.includes(qDiff);
      return subjectMatch && diffMatch;
    });
  }

  // 联赛真题（single 单选 / multiple、mtf 对错子题；difficulty=league 归 medium）
  // 仅并入「全部」类别；subject 可能为大类「生物学」，模块匹配优先用 q.module 字段
  let leagueQuestions = [];
  if (PracticeState.selectedCategory === 'all') {
    leagueQuestions = PracticeState.leagueData.filter((q) => {
      const subjectMatch = allModulesSelected || _moduleMatches(q, activeSubjects, PracticeState.selectedModules);
      const qDiff = diffNormalize(q.difficulty);
      const diffMatch = allDiffsSelected || selectedDiffsNorm.includes(qDiff);
      const qTarget = inferTarget(q);
      const targetMatch = allTargetsSelected || validTargets.includes(qTarget);
      let conceptMatch = true;
      if (conceptFilter) {
        const exactConcept = q.concept === conceptFilter;
        const inTags = q.tags && q.tags.indexOf(conceptFilter) >= 0;
        const inQuestion = q.question && q.question.indexOf(conceptFilter) >= 0;
        const inExplanation = q.explanation && q.explanation.indexOf(conceptFilter) >= 0;
        conceptMatch = exactConcept || inTags || inQuestion || inExplanation;
      }
      let kgCategoryMatch = true;
      if (PracticeState.kgCategory) {
        kgCategoryMatch = q.subject === PracticeState.kgCategory;
      }
      return subjectMatch && diffMatch && targetMatch && conceptMatch && kgCategoryMatch;
    });
  }

  // 根据类别选择组合
  if (PracticeState.selectedCategory === 'basic') {
    PracticeState.filteredQuestions = basicQuestions;
  } else if (PracticeState.selectedCategory === 'logic') {
    PracticeState.filteredQuestions = logicQuestions;
  } else {
    PracticeState.filteredQuestions = [...basicQuestions, ...logicQuestions, ...leagueQuestions];
  }
}

function generateQuestionSet() {
  applyFilters();

  if (PracticeState.filteredQuestions.length === 0) {
    return [];
  }

  const count = Math.min(
    PracticeState.questionCount,
    PracticeState.filteredQuestions.length
  );

  // 排除已移入回收站的题目（低分题，用户不再刷到）
  const pool = PracticeState.filteredQuestions.filter(function (q) {
    return !_isRecycledQuestion(q);
  });
  if (pool.length === 0) return [];

  // 基于题目平滑评分（带中性先验，评分从中位起步）做加权抽取：
  // 高分题出现率最多 1.3 倍、低分题最低 0.7 倍，浮动受限避免两级分化。
  if (typeof window.RatingCore === 'object' && window.RatingCore.weightedPick) {
    const picked = window.RatingCore.weightedPick(
      pool,
      function (q) {
        const rating = _getQuestionRating(q);
        const score01 = window.RatingCore.wilsonScore(rating.up, rating.down);
        return window.RatingCore.ratingWeight(score01);
      },
      Math.min(count, pool.length)
    );
    return picked.map(preparePracticeQuestion);
  }

  // 兜底：等概率随机
  const shuffled = shuffle(pool);
  return shuffled.slice(0, count).map(preparePracticeQuestion);
}

/**
 * 读取单题评分（点赞/点踩聚合）。storage.js 未加载时返回中性值。
 */
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
    const list = JSON.parse(localStorage.getItem('bioquest_question_recycled') || '[]');
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

function renderFilterPanel() {
  injectPracticeStyles();
  const container = document.getElementById('practice-root');
  if (!container) return;

  // 题库数据源（与设置页共享同一键）：'cloud' 云端同步 / 'local' 本地题库
  const qSource = (typeof loadSetting === 'function') ? loadSetting('question_source', 'cloud') : 'cloud';

  const moduleChecks = PracticeModuleGroups.map(
    (g) => `
    <label class="practice-filter-check">
      <input type="checkbox" value="${g.id}"
        ${PracticeState.selectedModules.includes(g.id) ? 'checked' : ''}
        data-module-check>
      <span>${g.label}</span>
      <span style="font-size:0.75rem;color:var(--text-muted);">
        ${g.subjects.join('、')}
      </span>
    </label>
  `
  ).join('');

  const difficultyChecks = DIFFICULTY_OPTIONS.map(
    (d) => `
    <label class="practice-filter-check">
      <input type="checkbox" value="${d.value}"
        ${PracticeState.selectedDifficulties.includes(d.value) ? 'checked' : ''}
        data-difficulty-check>
      <span>${d.label}</span>
    </label>
  `
  ).join('');

  const targetChecks = TARGET_OPTIONS.map(
    (t) => `
    <label class="practice-filter-check">
      <input type="checkbox" value="${t.value}"
        ${PracticeState.selectedTargets.includes(t.value) ? 'checked' : ''}
        data-target-check>
      <span>${t.label}</span>
    </label>
  `
  ).join('');

  // 题目数量：预设选项 + 「自定义」；questionCount 不在预设中时选中自定义并回显输入框
  const isPresetCount = QUESTION_COUNT_OPTIONS.indexOf(PracticeState.questionCount) >= 0;
  const countOptions = QUESTION_COUNT_OPTIONS.map(
    (n) => `<option value="${n}" ${PracticeState.questionCount === n ? 'selected' : ''}>${n} 题</option>`
  ).join('') + `<option value="custom" ${isPresetCount ? '' : 'selected'}>自定义…</option>`;

  const kgBanner = PracticeState.conceptFilter
    ? `<div class="practice-kg-banner" style="margin-bottom:16px;padding:14px 16px;background:var(--color-sage-light,rgba(90,125,92,0.1));border:1px solid var(--color-sage,rgba(90,125,92,0.3));border-radius:12px;position:relative;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;background:var(--color-sage,rgba(90,125,92,0.2));border-radius:16px;font-size:0.85rem;font-weight:600;color:var(--color-deep);">
            ${escapeHtml(PracticeState.conceptFilter)}
          </span>
          ${PracticeState.kgCategory ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:16px;font-size:0.8rem;color:#3b82f6;">${escapeHtml(PracticeState.kgCategory)}</span>` : ''}
          <button id="practice-clear-concept-btn" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;border:1px solid var(--color-sage,rgba(90,125,92,0.3));background:transparent;color:var(--text-muted);cursor:pointer;font-size:14px;line-height:1;padding:0;margin-left:auto;" title="清除专项筛选">×</button>
        </div>
        <div style="font-size:0.82rem;color:var(--text-muted);margin-top:8px;">来自知识图谱的专项练习 · 点击 × 可恢复常规筛选</div>
      </div>`
    : '';

  container.innerHTML = `
    <div class="animate-fade-in">
      <section class="section" style="padding-top:0;padding-bottom:32px;">
        <h2 class="section-title">专项练习</h2>
        <p class="section-desc">按知识点分类进行针对性练习，巩固薄弱环节。</p>
      </section>

      ${kgBanner}

      <div class="wrong-practice-entry" id="wrong-practice-entry">
        <span class="wrong-practice-icon">!</span>
        <span>错题专项练习</span>
        <span class="wrong-practice-count" id="wrong-practice-count"></span>
      </div>

      <div class="practice-filter-panel" id="practice-filter-panel">
        <div class="practice-filter-section">
          <div class="practice-filter-header">
            <h3 class="practice-filter-title">题库数据源</h3>
            <span class="practice-filter-note bq-hint--xs" id="practice-source-status" >
              ${qSource === 'local' ? '当前：本地题库' : '当前：云端同步'}
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px;">
            <select class="practice-select" id="practiceQuestionSource" style="min-width:150px;">
              <option value="cloud" ${qSource === 'cloud' ? 'selected' : ''}>云端同步</option>
              <option value="local" ${qSource === 'local' ? 'selected' : ''}>本地题库</option>
            </select>
            <span class="bq-hint--xs" id="practice-source-hint">
              ${qSource === 'local'
                ? '仅从站点内 data/ 读取题目，不发远程请求'
                : '云端优先，本地兜底（默认）'}
            </span>
          </div>
        </div>

        <div class="practice-filter-section">
          <h3 class="practice-filter-title">练习模式</h3>
          <div class="practice-mode-selector" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <button class="practice-mode-btn ${PracticeState.selectedTargets.length === 3 && PracticeState.selectedDifficulties.length === 3 ? 'active' : ''}" data-mode="all" title="全部题目，不限目标群体">
              全部
            </button>
            <button class="practice-mode-btn ${PracticeState.selectedTargets.length === 1 && PracticeState.selectedTargets[0] === 'high_school' ? 'active' : ''}" data-mode="gaokao" title="高考模式：仅高中课标题目，难度基础~进阶">
              高考模式
            </button>
            <button class="practice-mode-btn ${PracticeState.selectedTargets.length === 1 && PracticeState.selectedTargets[0] === 'competition' ? 'active' : ''}" data-mode="competition" title="竞赛模式：竞赛难度题目">
              竞赛模式
            </button>
          </div>
          <div class="bq-hint--xs">
            高考模式专为普通高中生设计，严格限定高中生物课标范围
          </div>
        </div>

        <div class="practice-filter-section">
          <h3 class="practice-filter-title">题目类别</h3>
          <div class="practice-category-selector">
            <button class="practice-category-btn ${PracticeState.selectedCategory === 'all' ? 'active' : ''}" data-category="all">全部</button>
            <button class="practice-category-btn ${PracticeState.selectedCategory === 'basic' ? 'active' : ''}" data-category="basic">基础知识</button>
            <button class="practice-category-btn ${PracticeState.selectedCategory === 'logic' ? 'active' : ''}" data-category="logic">逻辑推理</button>
          </div>
          <div class="bq-hint--xs bq-hint--mt">
            ${PracticeState.selectedCategory === 'logic' ? '逻辑推理题：基于实验数据的分析推理，每题2分' : PracticeState.selectedCategory === 'basic' ? '基础知识题：MTF多重判断题型，每题2分' : '混合模式：基础知识 + 逻辑推理'}
          </div>
        </div>

        <div class="practice-filter-section">
          <div class="practice-filter-header">
            <h3 class="practice-filter-title">选择模块</h3>
            <button class="btn btn-sm btn-secondary" id="practice-toggle-all">全选</button>
          </div>
          <div class="practice-filter-checks" id="moduleChecks">
            ${moduleChecks}
          </div>
        </div>

        <div class="practice-filter-section">
          <h3 class="practice-filter-title">选择难度</h3>
          <div class="practice-filter-checks" id="difficultyChecks">
            ${difficultyChecks}
          </div>
        </div>

        <div class="practice-filter-section">
          <h3 class="practice-filter-title">目标群体</h3>
          <div class="practice-filter-checks" id="targetChecks">
            ${targetChecks}
          </div>
          <div class="bq-hint--xs bq-hint--mt">
            高考题严格限定高中课标；竞赛题可涉及大学基础生物学；共通题为两者重叠基础
          </div>
        </div>

        <div class="practice-filter-section">
          <h3 class="practice-filter-title">题目数量</h3>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select class="practice-select" id="questionCount" style="min-width:110px;">
              ${countOptions}
            </select>
            <input type="number" id="customQuestionCount" class="practice-select" min="1" max="200" step="1"
              value="${isPresetCount ? '' : PracticeState.questionCount}"
              placeholder="输入 1-200"
              style="width:120px;${isPresetCount ? 'display:none;' : ''}" aria-label="自定义刷题数量">
          </div>
          <div class="bq-hint--xs bq-hint--mt">
            预设 5/10/20/50，或选择「自定义…」输入 1-200 道（超出可用题目时按实际数量出题）
          </div>
        </div>

        <div class="practice-filter-actions">
          <button class="btn btn-primary btn-lg" id="practice-start-btn">
            开始练习
          </button>
          ${PracticeState.filteredQuestions.length > 0
            ? `<span style="font-size:0.875rem;color:var(--text-muted);margin-left:12px;"
                     title="当前筛选条件下可练的题目数（基础知识题 + 逻辑推理题）；改动模块/难度/类别会实时变化">
              共 ${PracticeState.filteredQuestions.length} 道可用题目
            </span>`
            : ''}
        </div>

        <div class="practice-pull-section" id="practice-pull-section">
          <div class="practice-pull-header">
            <h3 class="practice-filter-title" style="margin-bottom:0;">拉取题目</h3>
            <span class="practice-pull-hint">按当前筛选从 Supabase 拉取（有冷却）</span>
          </div>
          <div class="practice-pull-summary" id="practice-pull-summary"></div>
          <div class="practice-pull-controls">
            <select class="practice-select practice-pull-select" id="practice-pull-count">
              <option value="5">5 道</option>
              <option value="10" selected>10 道</option>
              <option value="20">20 道</option>
            </select>
            <button class="btn btn-secondary" id="practice-pull-btn" style="min-width:120px;">
              拉取题目
            </button>
          </div>
          <div class="practice-pull-status" id="practice-pull-status"></div>
        </div>
      </div>
    </div>
  `;

  bindFilterEvents();
  bindWrongPracticeEntry();
}

function bindFilterEvents() {
  const rootEl = document.getElementById('practice-root');
  const toggleAllBtn = document.getElementById('practice-toggle-all');
  const moduleChecks = document.querySelectorAll('[data-module-check]');
  const difficultyChecks = document.querySelectorAll('[data-difficulty-check]');
  const categoryBtns = document.querySelectorAll('.practice-category-btn');
  const modeBtns = document.querySelectorAll('.practice-mode-btn');
  const countSelect = document.getElementById('questionCount');
  const startBtn = document.getElementById('practice-start-btn');
  const sourceSelect = document.getElementById('practiceQuestionSource');

  // 题库数据源切换：保存设置 → 重新加载题目 → 刷新统计
  if (sourceSelect) {
    sourceSelect.addEventListener('change', async () => {
      const val = sourceSelect.value;
      if (typeof saveSetting === 'function') saveSetting('question_source', val);
      const statusEl = document.getElementById('practice-source-status');
      const hintEl = document.getElementById('practice-source-hint');
      if (statusEl) statusEl.textContent = val === 'local' ? '当前：本地题库' : '当前：云端同步';
      if (hintEl) hintEl.textContent = val === 'local'
        ? '仅从站点内 data/ 读取题目，不发远程请求'
        : '云端优先，本地兜底（默认）';
showToast(val === 'local' ? '已切换为本地题库，正在重新加载题目…' : '已切换为云端同步，正在重新加载题目…');
      await loadPracticeQuestions();
      applyFilters();
      updateAvailableCount();
    });
  }

  // 练习模式快捷切换（带动画过渡）
  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      if (mode === 'gaokao') {
        PracticeState.selectedTargets = ['high_school'];
        PracticeState.selectedDifficulties = ['easy', 'medium'];
        PracticeState.selectedModules = ['module1', 'module2', 'module3', 'module4'];
        PracticeState.questionCount = 20;
      } else if (mode === 'competition') {
        PracticeState.selectedTargets = ['competition'];
        PracticeState.selectedDifficulties = ['medium', 'hard'];
        PracticeState.selectedModules = ['module1', 'module2', 'module3', 'module4'];
        PracticeState.questionCount = 20;
      } else {
        PracticeState.selectedTargets = ['high_school', 'competition', 'both'];
        PracticeState.selectedDifficulties = ['easy', 'medium', 'hard'];
        PracticeState.selectedModules = ['module1', 'module2', 'module3', 'module4'];
        PracticeState.questionCount = 10;
      }
      // 同步更新各复选框和选择器状态（带动画）
      animateFilterTransition(function() {
        renderFilterPanel();
        applyFilters();
        updateAvailableCount();
      });
    });
  });

  // 类别选择
  categoryBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      categoryBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      PracticeState.selectedCategory = btn.dataset.category;
      applyFilters();
      updateAvailableCount();
      // 更新类别描述
      const descEl = btn.closest('.practice-filter-section').querySelector('div[style*="font-size:0.78rem"]');
      if (descEl) {
        const desc = PracticeState.selectedCategory === 'logic'
          ? '逻辑推理题：基于实验数据的分析推理，每题2分'
          : PracticeState.selectedCategory === 'basic'
            ? '基础知识题：MTF多重判断题型，每题2分'
            : '混合模式：基础知识 + 逻辑推理';
        descEl.textContent = desc;
      }
    });
  });

  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', () => {
      const allChecked = [...moduleChecks].every((cb) => cb.checked);
      moduleChecks.forEach((cb) => {
        cb.checked = !allChecked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  if (moduleChecks.length > 0) {
    moduleChecks.forEach((cb) => {
      cb.addEventListener('change', () => {
        PracticeState.selectedModules = [...moduleChecks]
          .filter((c) => c.checked)
          .map((c) => c.value);
        applyFilters();
        updateAvailableCount();
      });
    });
  }

  if (difficultyChecks.length > 0) {
    difficultyChecks.forEach((cb) => {
      cb.addEventListener('change', () => {
        PracticeState.selectedDifficulties = [...difficultyChecks]
          .filter((c) => c.checked)
          .map((c) => c.value);
        applyFilters();
        updateAvailableCount();
      });
    });
  }

  const targetChecks = document.querySelectorAll('[data-target-check]');
  if (targetChecks.length > 0) {
    targetChecks.forEach((cb) => {
      cb.addEventListener('change', () => {
        PracticeState.selectedTargets = [...targetChecks]
          .filter((c) => c.checked)
          .map((c) => c.value);
        applyFilters();
        updateAvailableCount();
      });
    });
  }

  if (countSelect) {
    countSelect.addEventListener('change', () => {
      const val = countSelect.value;
      const customInput = document.getElementById('customQuestionCount');
      if (val === 'custom') {
        if (customInput) {
          customInput.style.display = '';
          customInput.focus();
        }
        let num = customInput ? parseInt(customInput.value, 10) : NaN;
        if (isNaN(num) || num < 1) num = 10;
        PracticeState.questionCount = num;
      } else {
        PracticeState.questionCount = parseInt(val, 10);
        if (customInput) customInput.style.display = 'none';
      }
    });
  }

  const customCountInput = document.getElementById('customQuestionCount');
  if (customCountInput) {
    // 输入即生效（失焦/回车/输入变化时同步）
    customCountInput.addEventListener('change', () => {
      let num = parseInt(customCountInput.value, 10);
      if (isNaN(num) || num < 1) num = 1;
      if (num > 200) num = 200;
      customCountInput.value = num;
      PracticeState.questionCount = num;
    });
    customCountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') customCountInput.blur();
    });
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (PracticeState.selectedModules.length === 0) {
        alert('请至少选择一个模块。');
        return;
      }
      if (PracticeState.selectedDifficulties.length === 0) {
        alert('请至少选择一个难度。');
        return;
      }
      if (!PracticeState.allQuestions || PracticeState.allQuestions.length === 0) {
        alert('题库为空，请先点击下方「拉取题目」加载题目。');
        return;
      }
      if (PracticeState.filteredQuestions.length === 0) {
        alert('当前筛选条件下没有可用题目，请调整筛选条件或拉取更多题目。');
        return;
      }
      initNewSession();
      if (PracticeState.currentSet.length === 0) {
        alert('无法生成题目，请调整筛选条件。');
        return;
      }
      renderQuiz();
    });
  }

  bindPullEvents();

  // 清除专项按钮：使用事件委托（根元素绑定一次，避免 clone 重复绑定）
  if (rootEl) {
    rootEl.addEventListener('click', function (e) {
      var tgt = e.target;
      if (!tgt || !tgt.matches('#practice-clear-concept-btn')) return;
      e.preventDefault();
      PracticeState.conceptFilter = null;
      PracticeState.kgSource = null;
      PracticeState.kgCategory = null;
      PracticeState.selectedModules = ['module1', 'module2', 'module3', 'module4'];
      try { sessionStorage.removeItem('bioquest_kg_practice'); } catch (err) {}
      // 清除 URL 中的 concept 参数：直接替换 URL 并显式触发一次路由
      var baseUrl = window.location.pathname + window.location.search;
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', baseUrl + '#/practice');
      }
      try { window.scrollTo(0, 0); } catch (err) {}
      renderFilterPanel();
      applyFilters();
      updateAvailableCount();
    });
  }
}

function updateAvailableCount() {
  const countEl = document.querySelector('.practice-filter-actions span');
  if (countEl) {
    countEl.textContent = `共 ${PracticeState.filteredQuestions.length} 道可用题目`;
  }
  _renderPullSummary();
}

var PULL_COOLDOWN_MS = 20 * 1000; // 20 秒冷却（用户要求）
var PULL_COOLDOWN_KEY = 'bioquest_pull_cooldown_until';
var PULL_COOLDOWN_TIMER = null;

function _getPullCooldownRemaining() {
  try {
    var until = parseInt(localStorage.getItem(PULL_COOLDOWN_KEY) || '0', 10);
    return Math.max(0, until - Date.now());
  } catch (e) {
    return 0;
  }
}

function _setPullCooldown() {
  try {
    localStorage.setItem(PULL_COOLDOWN_KEY, String(Date.now() + PULL_COOLDOWN_MS));
  } catch (e) {}
}

function _formatCountdown(ms) {
  var sec = Math.ceil(ms / 1000);
  return sec + ' 秒';
}

function _updatePullButtonState() {
  var btn = document.getElementById('practice-pull-btn');
  if (!btn) return;
  var remaining = _getPullCooldownRemaining();
  if (remaining > 0) {
    btn.disabled = true;
    btn.textContent = '冷却中 ' + _formatCountdown(remaining);
    btn.classList.add('practice-pull-btn-cooldown');
    if (PULL_COOLDOWN_TIMER) clearTimeout(PULL_COOLDOWN_TIMER);
    PULL_COOLDOWN_TIMER = setTimeout(_updatePullButtonState, PRACTICE_PULL_TICK_MS);
  } else {
    btn.disabled = false;
    btn.textContent = '拉取题目';
    btn.classList.remove('practice-pull-btn-cooldown');
  }
}

function _setPullStatus(text, type) {
  var statusEl = document.getElementById('practice-pull-status');
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = 'practice-pull-status' + (type ? ' practice-pull-status--' + type : '');
}

function _renderPullSummary() {
  var summaryEl = document.getElementById('practice-pull-summary');
  if (!summaryEl) return;

  var moduleLabels = {
    module1: '模块一', module2: '模块二', module3: '模块三', module4: '模块四'
  };
  var modules = (PracticeState.selectedModules || [])
    .map(function(id) { return moduleLabels[id] || id; })
    .join('、') || '全部';

  var diffLabels = {
    easy: '基础', medium: '进阶', hard: '挑战',
    basic: '基础', league: '进阶', national: '挑战'
  };
  var diffs = (PracticeState.selectedDifficulties || [])
    .map(function(d) { return diffLabels[d] || d; })
    .join('、') || '不限';

  var targetLabels = {
    high_school: '高考', competition: '竞赛', both: '共通'
  };
  var targets = (PracticeState.selectedTargets || [])
    .map(function(t) { return targetLabels[t] || t; })
    .join('、') || '不限';

  var concept = PracticeState.conceptFilter ? escapeHtml(PracticeState.conceptFilter) : null;

  summaryEl.innerHTML = `
    <span>模块：${modules}</span>
    <span>难度：${diffs}</span>
    <span>目标：${targets}</span>
    ${concept ? '<span>专项：' + concept + '</span>' : ''}
  `;
}

function bindPullEvents() {
  var pullBtn = document.getElementById('practice-pull-btn');
  if (!pullBtn) return;

  // 清理旧计时器
  if (PULL_COOLDOWN_TIMER) {
    clearTimeout(PULL_COOLDOWN_TIMER);
    PULL_COOLDOWN_TIMER = null;
  }

  _renderPullSummary();
  _updatePullButtonState();

  pullBtn.addEventListener('click', function() {
    var remaining = _getPullCooldownRemaining();
    if (remaining > 0) {
      _setPullStatus('冷却中，请 ' + _formatCountdown(remaining) + ' 后再试', 'info');
      return;
    }
    handlePullQuestions();
  });
}

async function handlePullQuestions() {
  var countSel = document.getElementById('practice-pull-count');
  var btn = document.getElementById('practice-pull-btn');
  var countVal = countSel ? parseInt(countSel.value, 10) : 10;
  if (countVal > 20) countVal = 20;
  if (countVal < 1) countVal = 5;

  // 按当前筛选条件组装拉取参数
  var modMap = { module1: 'module_1', module2: 'module_2', module3: 'module_3', module4: 'module_4' };
  var modules = (PracticeState.selectedModules || [])
    .map(function(id) { return modMap[id]; })
    .filter(Boolean);
  if (modules.length === 0) modules = ['module_1', 'module_2', 'module_3', 'module_4'];

  var difficulties = PracticeState.selectedDifficulties || [];
  var targets = PracticeState.selectedTargets || [];
  var concept = PracticeState.conceptFilter || null;

  var qSource = (typeof loadSetting === 'function') ? loadSetting('question_source', 'cloud') : 'cloud';
  var items = null;

  btn.disabled = true;
  btn.textContent = '拉取中...';
  _setPullStatus(qSource === 'local' ? '正在从本地题库抽取 ' + countVal + ' 道题…' : '正在从 Supabase 拉取 ' + countVal + ' 道题…', 'info');

  try {
    // 本地题库模式：直接从 data/bank 分片按筛选条件抽题，不请求 Supabase
    if (qSource === 'local') {
      if (!PracticeState.allQuestions || PracticeState.allQuestions.length === 0) {
        if (typeof window.loadQuestions !== 'function') {
          throw new Error('本地题库加载器未就绪，请刷新页面重试');
        }
        var localModNums = [];
        for (var im = 0; im < modules.length; im++) {
          var mn = parseInt(String(modules[im]).replace('module_', ''), 10);
          if (mn >= 1 && mn <= 4) localModNums.push(mn);
        }
        if (localModNums.length === 0) localModNums = [1, 2, 3, 4];
        var localItems = await window.loadQuestions(localModNums, { mode: 'preferLocal' });
        PracticeState.allQuestionsRaw = localItems || [];
        PracticeState.allQuestions = (localItems || []).filter(function (q) {
          return Array.isArray(q.subQuestions) && q.subQuestions.length >= 4;
        });
      }
      var lDiffAlias = { easy: ['easy', 'basic'], medium: ['medium', 'league'], hard: ['hard', 'national'] };
      var lAccDiffs = [];
      (difficulties || []).forEach(function (d) {
        (lDiffAlias[d] || [d]).forEach(function (v) { if (lAccDiffs.indexOf(v) < 0) lAccDiffs.push(v); });
      });
      var lAccTargets = (targets || []).filter(function (t) { return t !== 'both'; });
      items = (PracticeState.allQuestions || []).filter(function (q) {
        if (!q || !q.subQuestions || q.subQuestions.length < 4) return false;
        if (lAccDiffs.length > 0 && lAccDiffs.indexOf(q.difficulty) < 0) return false;
        if (q.target && lAccTargets.length > 0 && lAccTargets.indexOf(q.target) < 0) return false;
        if (concept) {
          var inTags = q.tags && q.tags.join(' ').indexOf(concept) >= 0;
          var inText = String(q.concept || '') === concept ||
            String(q.question || '').indexOf(concept) >= 0 ||
            String(q.explanation || '').indexOf(concept) >= 0;
          if (!inTags && !inText) return false;
        }
        return true;
      }).slice().sort(function () { return Math.random() - 0.5; }).slice(0, countVal);
    } else {
      // 云题库模式：原 Supabase 拉取流程
      // 主动确保 loader.js 已加载（解决 loader.js 未在 index.html 预加载的问题）
      if (typeof window.fetchQuestionsBatch !== 'function') {
      _setPullStatus('正在初始化题库加载器…', 'info');
      var loaderOk = false;
      // 兼容路径 A：loader.js 已在页面中且暴露了 ensureQuestionLoaderReady
      if (typeof window.ensureQuestionLoaderReady === 'function') {
        loaderOk = await window.ensureQuestionLoaderReady({ timeout: 10000, attempts: 3 });
      } else {
        // 兼容路径 B：loader.js 还未被引入到页面，手动注入（双重兜底）
        loaderOk = await new Promise(function(resolve) {
          // 检查是否已有 script 标签存在
          var existing = document.querySelector('script[src*="loader.js"]');
          function checkReady() {
            if (typeof window.fetchQuestionsBatch === 'function' && typeof window.loadQuestions === 'function') {
              resolve(true);
              return true;
            }
            return false;
          }
          if (checkReady()) return;
          if (existing) {
            // script 已存在但未就绪：等待其加载
            existing.addEventListener('load', function () {
              var deadline = Date.now() + 8000;
              (function poll() {
                if (checkReady()) return;
                if (Date.now() > deadline) { resolve(false); return; }
                setTimeout(poll, 50);
              })();
            });
            existing.addEventListener('error', function () { resolve(false); });
          } else {
            // 手动注入 loader.js
            var s = document.createElement('script');
            s.src = 'js/core/loader.js?v=' + Date.now();
            s.async = false;
            s.onload = function () {
              var deadline = Date.now() + 8000;
              (function poll() {
                if (checkReady()) return;
                if (Date.now() > deadline) { resolve(false); return; }
                setTimeout(poll, 50);
              })();
            };
            s.onerror = function () { resolve(false); };
            document.head.appendChild(s);
          }
        });
      }
      // 最终兜底：再检查一次函数
      if (!loaderOk || typeof window.fetchQuestionsBatch !== 'function') {
        // 更友好的错误提示 + 建议
        throw new Error('题库加载器初始化失败，请刷新页面重试。若持续失败请清空浏览器缓存后再次打开。');
      }
    }

    items = await window.fetchQuestionsBatch({
      modules: modules,
      difficulties: difficulties,
      targets: targets,
      concept: concept,
      count: countVal
    });
    }

    if (!items || items.length === 0) {
      throw new Error('没有符合条件的题目，请放宽筛选条件');
    }

    // 字段映射：题库格式（stem/options对象/answer字母）→ practice 格式（question/options数组/answer索引）
    items = items.map(function(q) {
      if (q.stem && !q.question) q.question = q.stem;
      return q;
    });

    // 去重合并
    var existingIds = {};
    (PracticeState.allQuestions || []).forEach(function(q) {
      if (q && q.question) existingIds[q.question] = true;
    });
    var added = 0;
    items.forEach(function(q) {
      if (q && q.subQuestions && q.subQuestions.length >= 4 && !existingIds[q.question]) {
        PracticeState.allQuestions.push(q);
        existingIds[q.question] = true;
        added++;
      }
    });

    _setPullStatus('拉取成功！新增 ' + added + ' 道题，当前共 ' + PracticeState.allQuestions.length + ' 道可用。', 'success');
    _setPullCooldown();
    _updatePullButtonState();

    applyFilters();
    updateAvailableCount();
  } catch (err) {
    console.error('[Practice] 拉取题目失败:', err);
    _setPullStatus('拉取失败：' + (err.message || '请检查网络或 Supabase 配置'), 'error');
    btn.disabled = false;
    btn.textContent = '拉取题目';
  }
}

/**
 * 绑定"错题专项练习"入口事件
 */
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

function renderQuiz() {
  injectPracticeStyles();
  const container = document.getElementById('practice-root');
  if (!container) return;

  const q = PracticeState.currentSet[PracticeState.currentIndex];
  if (!q) return;

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
            <div class="practice-option-text">${escapeHtml(sq.text)}</div>
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
      <span class="practice-score-value">${score} 分</span>
      <span class="practice-score-detail">（${correct}/${total} 正确）</span>
    </div>
    `
    : '';

  const explanationHtml = PracticeState.submitted && q.explanation
    ? `
    <div class="practice-explanation">
      <div class="practice-explanation-title">解析</div>
      <div class="practice-explanation-text">${renderExplanationWithImages(q.explanation)}</div>
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
        </div>
      </div>

      <div class="practice-question-card">
        <div class="practice-question-text">
          ${escapeHtml(q.question)}
        </div>
        ${(typeof window !== 'undefined' && window.BioQuestFigure) ? window.BioQuestFigure.render(q, { alt: '题目配图' }) : renderChart(q.chart)}

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

  const totalQuestions = PracticeState.totalAnswered;
  const totalScore = PracticeState.totalScore;
  const maxScore = PracticeState.currentSet.length * 2;
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
          <span class="practice-summary-stat">${stats.score.toFixed(1)} 分</span>
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
            <div class="practice-summary-stat-num">${totalScore.toFixed(1)}</div>
            <div class="practice-summary-stat-label">总得分 / ${maxScore}</div>
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

function showFilterPanel() {
  applyFilters();
  renderFilterPanel();

  // 修复：进入练习页时自动加载题库（本地分片 + 逻辑推理），
  // 否则所有入口（含"本地题库"）初次进入时 allQuestions 为空，
  // 必须等用户点击"拉取题目"，而该按钮在本地模式下原先仍只请求 Supabase。
  if (!PracticeState.allQuestions || PracticeState.allQuestions.length === 0) {
    Promise.all([loadPracticeQuestions(), loadLogicQuestions(), loadLeagueQuestions()]).then(function () {
      if (!document.getElementById('practice-root')) return;
      applyFilters();
      renderFilterPanel(); // 重建面板以显示"共 X 道可用题目"
    }).catch(function () {});
  } else if (!PracticeState.logicLoaded || !PracticeState.leagueLoaded) {
    Promise.all([loadLogicQuestions(), loadLeagueQuestions()]).then(function () {
      applyFilters();
      updateAvailableCount();
    }).catch(function () {});
  }
}

function renderPracticePage(target) {
  if (!target) return;

  try {
  // 检查是否为错题重做模式
  var redoData = null;
  try { redoData = sessionStorage.getItem('bioquest_redo_question'); } catch(e) {}
  if (redoData) {
    sessionStorage.removeItem('bioquest_redo_question');
  }

  // 解析知识图谱传入的专项练习参数（URL hash 优先，sessionStorage 兜底）
  var kgData = null;
  var shareKey = null;
  var shareQid = null;
  try {
    var hash = window.location.hash || '';
    var queryIdx = hash.indexOf('?');
    if (queryIdx >= 0) {
      var params = new URLSearchParams(hash.substring(queryIdx + 1));
      // P1-5：对 URL 入参做白名单式清洗（剔除控制字符、限制长度），防止参数注入污染过滤/渲染
      var conceptParam = (typeof sanitizeUrlParam === 'function')
        ? sanitizeUrlParam(params.get('concept'), 64)
        : params.get('concept');
      var moduleParam;
      if (params.get('module') != null) {
        moduleParam = (typeof sanitizeUrlParam === 'function')
          ? sanitizeUrlParam(params.get('module'), 32)
          : params.get('module');
      }
      var categoryParam;
      if (params.get('category') != null) {
        categoryParam = (typeof sanitizeUrlParam === 'function')
          ? sanitizeUrlParam(params.get('category'), 32)
          : params.get('category');
      }
      if (conceptParam) {
        kgData = { concept: decodeURIComponent(conceptParam), module: moduleParam || null, category: categoryParam || null };
      }
      // 分享本题深链：#/practice?share=<题目文本>
      // 只做一次 URL 解码 + 与生成端一致的空白折叠（_practiceShareKey），
      // 不做 sanitizeUrlParam（其会剔除 < / ` 与换行，可能破坏题干本身）；
      // 该值仅参与题目文本比对，不进入 DOM/HTML，长度上限兜底防滥用。
      var shareParam = params.get('share');
      if (shareParam != null) {
        shareKey = _practiceShareKey(shareParam);
        if (shareKey.length > 700) shareKey = null;
        if (!shareKey) shareKey = null;
      }
      // 分享深链的可选稳定 ID（优先按 ID 定位题目）
      var qidParam = params.get('qid');
      if (qidParam != null) {
        var qidClean = String(qidParam).trim().slice(0, 128);
        shareQid = qidClean || null;
      }
    }
    if (!kgData) {
      var stored = sessionStorage.getItem('bioquest_kg_practice');
      if (stored) kgData = JSON.parse(stored);
    }
  } catch (e) { kgData = null; }

  if (kgData && kgData.concept) {
    PracticeState.conceptFilter = kgData.concept;
    PracticeState.kgSource = kgData;
    // 根据模块预选中对应练习模块
    if (kgData.module) {
      var modKey = kgData.module.replace('_', ''); // module_1 -> module1
      if (['module1','module2','module3','module4'].indexOf(modKey) >= 0) {
        PracticeState.selectedModules = [modKey];
      }
    }
    // 如果有 category（学科），设置专项学科过滤，仅包含该学科
    if (kgData.category) {
      PracticeState.kgCategory = kgData.category;
    }
  }

  target.innerHTML = `<div id="practice-root"></div>`;

  // 分享本题深链：直接打开对应题目（答案预览），不再展示筛选面板
  if (shareKey || shareQid) {
    handleShareQuestionDeepLink(shareKey, shareQid);
    return;
  }

  // 按需模式：进入练习页时不自动加载全部题目，而是显示筛选面板让用户主动拉取
  showFilterPanel();

  // 如果已有缓存题目（例如返回上一页），直接复用
  if (PracticeState.allQuestions && PracticeState.allQuestions.length > 0) {
    updateAvailableCount();
  }

  // 处理错题重做参数
  handleRedoQuestion(redoData);
  } catch (err) {
    console.error('[TATABOX Practice] renderPracticePage 异常:', err);
    target.innerHTML = '<div class="bq-empty-block">' +
      '<p class="bq-error-title">练习模块加载失败</p>' +
      '<p class="bq-note">请刷新页面或稍后重试</p>' +
      '<button data-on=\'["_cspReload"]\' class="bq-btn--compact">刷新页面</button>' +
      '</div>';
  }
}

/**
 * 处理错题重做：根据错题数据找到对应题目，启动单题练习
 * @param {string|null} redoData - sessionStorage 中的错题数据（JSON 字符串或纯文本 qId）
 * @returns {boolean} 是否成功启动重做模式
 */
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

function initPractice(target) {
  try {
    if (!target) {
      if (typeof AppState !== 'undefined' && AppState.rootElement) {
        target = AppState.rootElement;
      } else {
        target = document.getElementById('page-content');
      }
    }
    if (!target) {
      console.error('[TATABOX Practice] initPractice 找不到目标容器');
      return;
    }
    renderPracticePage(target);
  } catch (err) {
    console.error('[TATABOX Practice] initPractice 异常:', err);
    if (target) {
      target.innerHTML = '<div class="bq-empty-block">' +
        '<p class="bq-error-title">练习模块初始化失败</p>' +
        '<p class="bq-note">请刷新页面或稍后重试</p>' +
        '<button data-on=\'["_cspReload"]\' class="bq-btn--compact">刷新页面</button>' +
        '</div>';
    }
  }
}

// 答题时自动隐藏 Header（向上滚动隐藏，向下滚动出现）
var _headerAutoHide = { lastScrollY: 0, enabled: false };

function enableHeaderAutoHide() {
  if (_headerAutoHide.enabled) return;
  _headerAutoHide.enabled = true;
  _headerAutoHide.lastScrollY = window.scrollY;
  window.addEventListener('scroll', _onPracticeScroll, { passive: true });
}

function disableHeaderAutoHide() {
  _headerAutoHide.enabled = false;
  window.removeEventListener('scroll', _onPracticeScroll);
  var header = document.querySelector('.header');
  if (header) header.style.transform = '';
}

function _onPracticeScroll() {
  if (!_headerAutoHide.enabled) return;
  var header = document.querySelector('.header');
  if (!header) return;
  var currentY = window.scrollY;
  var diff = currentY - _headerAutoHide.lastScrollY;
  if (currentY < 64) {
    header.style.transform = '';
  } else if (diff > 10) {
    header.style.transform = 'translateY(-100%)';
  } else if (diff < -5) {
    header.style.transform = '';
  }
  _headerAutoHide.lastScrollY = currentY;
}

// 最后一题仪式感
function showLastQuestionEffect(callback) {
  var progressBar = document.querySelector('.practice-progress-bar-fill, .progress-fill, [class*="progress"]');
  if (progressBar) {
    progressBar.style.width = '100%';
    progressBar.style.boxShadow = '0 0 20px rgba(196,149,106,0.8), 0 0 40px rgba(196,149,106,0.4)';
    progressBar.style.transition = 'box-shadow 0.5s ease';
  }

  var banner = document.createElement('div');
  banner.className = 'last-question-banner';
  banner.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'z-index:9999',
    'background:var(--color-deep,#1a3a2a)',
    'color:#fff',
    'text-align:center',
    'padding:12px 20px',
    'font-size:1.05rem',
    'font-weight:700',
    'animation:lastQSlideDown 0.5s ease',
    'transform:translateY(0)'
  ].join(';');
  banner.textContent = '最后一题完成！';

  // 添加动画 keyframes
  if (!document.getElementById('last-q-keyframes')) {
    var style = document.createElement('style');
    style.id = 'last-q-keyframes';
    style.textContent = '@keyframes lastQSlideDown { from { transform:translateY(-100%); } to { transform:translateY(0); } }';
    document.head.appendChild(style);
  }

  document.body.appendChild(banner);

  setTimeout(function () {
    if (banner.parentNode) banner.parentNode.removeChild(banner);
    if (typeof callback === 'function') callback();
  }, PRACTICE_LAST_Q_BANNER_MS);
}

// 在 renderQuiz 中启用 header auto-hide
var _origRenderQuiz = renderQuiz;
renderQuiz = function () {
  enableHeaderAutoHide();
  _origRenderQuiz.apply(this, arguments);
};

// 在 renderFilterPanel 中禁用 header auto-hide
var _origShowFilter = renderFilterPanel || showFilterPanel;
if (typeof showFilterPanel !== 'undefined') {
  var _origShowFilterPanel = showFilterPanel;
  showFilterPanel = function () {
    disableHeaderAutoHide();
    _origShowFilterPanel.apply(this, arguments);
  };
}

// 挂载到 window 对象，供 app.js 调用
window.initPractice = initPractice;
window.enableHeaderAutoHide = enableHeaderAutoHide;
window.disableHeaderAutoHide = disableHeaderAutoHide;
window.showLastQuestionEffect = showLastQuestionEffect;

// 答题键盘快捷键（仅练习答题流程生效）
//   1 / 2 / 3 / 4 → 选 A / B / C / D（单选题：标准单选 & 逻辑推理）
//   Space / Enter → 提交答案，已提交则跳下一题
//   R → 重做当前题目（清空作答，可重新作答；统计仅计首次）
//   Esc → 返回筛选（题目列表）
var _practiceKbBound = false;

function _practiceOverlayOpen() {
  // 反馈弹窗（关闭即 remove，存在即打开）
  if (document.querySelector('.q-feedback-overlay')) return true;
  // 移动端导航菜单
  var mnav = document.getElementById('mobileNav');
  if (mnav && mnav.classList.contains('active')) return true;
  // 原生 <dialog open>
  if (document.querySelector('dialog[open]')) return true;
  // 任意 aria-modal 对话框：需实际可见（关闭后常残留在 DOM，靠 display/visibility 判定）
  var dialogs = document.querySelectorAll('[aria-modal="true"]');
  for (var i = 0; i < dialogs.length; i++) {
    var cs = window.getComputedStyle(dialogs[i]);
    if (cs.display !== 'none' && cs.visibility !== 'hidden') return true;
  }
  // 快捷键面板可见时也让出
  var sp = document.getElementById('bioquest-shortcut-panel');
  if (sp && window.getComputedStyle(sp).visibility === 'visible') {
    return true;
  }
  return false;
}

function _practiceIsTyping(el) {
  if (!el) return false;
  var tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!el.isContentEditable;
}

function _practiceInQuiz() {
  // 答题进行中（存在提交 / 下一题按钮），排除小结页与筛选页
  return !!(document.getElementById('practice-submit-btn') ||
            document.getElementById('practice-next-btn'));
}

function _practiceSelectChoice(numKey) {
  var q = PracticeState.currentSet[PracticeState.currentIndex];
  if (!q) return;
  var isLogic = QuestionModel.isLogicChoice(q);
  var isStd = QuestionModel.isStandardChoice(q);
  if (!isLogic && !isStd) return; // MTF 题型不适用数字键选 A/B/C/D
  var idx = parseInt(numKey, 10) - 1; // 1..4 → 0..3
  if (idx < 0) return;
  var qIdx = PracticeState.currentIndex;
  if (!PracticeState.userAnswers[qIdx]) {
    PracticeState.userAnswers[qIdx] = {};
  }
  if (isStd) {
    var keys = Object.keys(q.options).sort();
    if (idx >= keys.length) return;
    PracticeState.userAnswers[qIdx][0] = keys[idx]; // 'A'/'B'/'C'/'D'
  } else {
    if (idx >= q.options.length) return;
    PracticeState.userAnswers[qIdx][0] = idx; // 逻辑题存索引 0..4
  }
  renderQuiz();
}

function _practiceRedoCurrent() {
  var qIdx = PracticeState.currentIndex;
  PracticeState.userAnswers[qIdx] = {};
  PracticeState.submitted = false;
  // 不重置 _counted：本题已统计过的话，重做再提交不会重复计数
  renderQuiz();
}

function _practiceBackToList() {
  PracticeState.started = false;
  PracticeState.submitted = false;
  if (typeof showFilterPanel === 'function') {
    showFilterPanel();
  }
}

function handlePracticeKeydown(e) {
  // 仅练习答题流程生效
  if (!PracticeState.started) return;
  // 任意弹窗 / 面板 / 移动导航打开时全部让出
  if (_practiceOverlayOpen()) return;

  var key = e.key;
  var active = document.activeElement;
  var typing = _practiceIsTyping(active);

  // Esc → 返回筛选（题目列表）
  if (key === 'Escape') {
    if (typing) return; // 输入框内由原生处理
    e.preventDefault();
    _practiceBackToList();
    return;
  }

  // 以下快捷键仅在答题进行中生效（小结页 / 筛选页不触发）
  if (!_practiceInQuiz()) return;

  // 数字键 1-4 → 选 A/B/C/D
  if (!typing && (key === '1' || key === '2' || key === '3' || key === '4')) {
    if (PracticeState.submitted) return; // 已提交不可改答
    e.preventDefault();
    _practiceSelectChoice(key);
    return;
  }

  // R → 重做当前题
  if (!typing && (key === 'r' || key === 'R')) {
    e.preventDefault();
    _practiceRedoCurrent();
    return;
  }

  // Space / Enter → 提交答案 / 下一题
  // 统一 preventDefault：无论焦点在哪个按钮，Space/Enter 都固定走提交/下一题，
  // 避免点完收藏/错题按钮后焦点停留导致 Space 误触发该按钮
  if (!typing && (key === ' ' || key === 'Spacebar' || key === 'Enter')) {
    e.preventDefault();
    if (!PracticeState.submitted) {
      handleSubmitAnswer();
    } else {
      handleNextQuestion();
    }
    return;
  }
}

(function _bindPracticeKeyboard() {
  if (_practiceKbBound) return;
  _practiceKbBound = true;
  document.addEventListener('keydown', handlePracticeKeydown);
})();
