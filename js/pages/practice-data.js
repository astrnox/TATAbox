/**
 * TATABOX — 练习页题库加载与筛选（M-01 渐进拆分）
 * ------------------------------------------------------------
 * 由 loadModule('practice') 的依赖链先于 practice.js 加载；
 * 运行期依赖 practice.js 的 PracticeState、_fetchLocalJsonWithRetry、shuffle 等。
 * ============================================================
 */
'use strict';

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

  // 公共筛选条件（模块 / 难度 / 目标 / 考点）
  const matchesBaseFilters = function (q) {
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
  };

  // 基础知识题（MTF 格式；GGBO 真题单独归类，避免在「基础知识」中重复出现）
  let basicQuestions = PracticeState.allQuestions.filter(
    (q) => q.category !== 'ggbo' && matchesBaseFilters(q)
  );

  // GGBO 真题（第一届 GGBO 生物学竞赛，category="ggbo"）
  let ggboQuestions = [];
  if (PracticeState.selectedCategory === 'all' || PracticeState.selectedCategory === 'ggbo') {
    ggboQuestions = PracticeState.allQuestions.filter(
      (q) => q.category === 'ggbo' && matchesBaseFilters(q)
    );
  }

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
  } else if (PracticeState.selectedCategory === 'ggbo') {
    PracticeState.filteredQuestions = ggboQuestions;
  } else {
    PracticeState.filteredQuestions = [...basicQuestions, ...logicQuestions, ...leagueQuestions, ...ggboQuestions];
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

// M-01：显式挂载对外入口
window.loadPracticeQuestions = loadPracticeQuestions;
window.loadLeagueQuestions = loadLeagueQuestions;
window.loadLogicQuestions = loadLogicQuestions;
window.applyFilters = applyFilters;
window.generateQuestionSet = generateQuestionSet;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.data = { loadPracticeQuestions: loadPracticeQuestions, loadLeagueQuestions: loadLeagueQuestions, loadLogicQuestions: loadLogicQuestions, applyFilters: applyFilters, generateQuestionSet: generateQuestionSet };
})();
