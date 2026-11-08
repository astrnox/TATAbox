/**
 * ============================================================
 * TATABOX v3.1 — IRT 自适应学习引擎（T0-5/T0-6）
 * 项目反应理论（Item Response Theory）三参数逻辑斯谛模型
 * 实时 θ 估计 + 自适应抽题 + 模考分数预测
 * 纯前端零依赖，与现有 BKT 引擎互补
 * ============================================================
 *
 * 三参数模型（3PL）：
 *   P(答对|θ) = c + (1 - c) * 1 / (1 + exp(-a * (θ - b)))
 *   a: 区分度 (0.3-2.5)   参考 Hambleton et al. 建议典型区间 0.5-2.5
 *   b: 难度   (-3 to 3)
 *   c: 猜测率 (0-0.5)     典型上界 0.35（MetricGate）
 *   θ: 受测者能力 (-3 to 3)
 *
 * 参考：Lord (1980) "Applications of Item Response Theory to Practical Testing Problems"
 *       Hambleton & Swaminathan (1985) "Item Response Theory: Principles and Applications"
 *       MetricGate 关于 3PL 猜测参数 c 典型值 0-0.35 的讨论
 */

(function () {
  'use strict';

  if (window.IrtEngine) return;

  var STORAGE_KEY = 'tatabox_irt_state';
  var PARAMS_KEY = 'tatabox_irt_params';  // 题库参数缓存


  // 字符串难度 → 数值（0-1）。题库历史数据混用 easy/medium/hard、中文标签
  // 与数字字符串；不归一化会让这些题全部落到 b=0（M-08）。
  var STRING_DIFFICULTY = {
    easy: 0.25, simple: 0.25, '简单': 0.25, '基础': 0.25, '容易': 0.25,
    normal: 0.5, medium: 0.5, '中等': 0.5, '普通': 0.5, '进阶': 0.5,
    hard: 0.75, difficult: 0.75, '困难': 0.75, '难': 0.75,
    league: 0.75, '联赛': 0.75, '竞赛': 0.8, '省一': 0.8
  };

  /**
   * 把 difficulty 归一为 [0,1] 数值；无法识别返回 null（由题型兜底）。
   * @param {*} value
   * @returns {number|null}
   */
  function normalizeDifficulty(value) {
    if (typeof value === 'number') {
      return isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
    }
    if (typeof value !== 'string') return null;
    var s = value.trim().toLowerCase();
    if (!s) return null;
    var n = Number(s);
    if (isFinite(n)) return Math.max(0, Math.min(1, n));
    return Object.prototype.hasOwnProperty.call(STRING_DIFFICULTY, s) ? STRING_DIFFICULTY[s] : null;
  }

  /**
   * 从题库推断 IRT 参数（启发式估计，无需人工标注）
   * 实际生产建议用 EM 算法标定，这里用题库元数据启发式
   * @param {Object} question - 题目对象 { difficulty?, type?, options? }
   * @returns {{a: number, b: number, c: number}}
   */
  function inferParams(question) {
    // 难度 b：题库的 difficulty (0-1) 映射到 (-2.5, 2.5)
    var diff = normalizeDifficulty(question.difficulty);
    if (diff === null) {
      // 无标注/无法识别时按题型推断
      if (question.type === 'mcq') diff = 0.4;
      else if (question.type === 'fill') diff = 0.55;
      else if (question.type === 'essay' || question.type === 'experiment') diff = 0.7;
      else diff = 0.5;
    }
    var b = (diff - 0.5) * 5;  // 0→-2.5, 0.5→0, 1→2.5

    // 区分度 a：选项数越多、题干越长，区分度越高
    var a = 1.0;
    if (question.options && question.options.length >= 4) a = 1.2;
    if (question.type === 'essay') a = 1.5;
    if (question.type === 'mcq' && question.options && question.options.length === 2) a = 0.6;
    // 区分度典型区间 0.5–2.5（Hambleton 等）；保留下限 0.3 以容纳弱区分项
    a = Math.min(2.5, Math.max(0.3, a));

    // 猜测率 c：选择题按 1/选项数，非选择题为 0
    // 下限典型值为 0.35（MetricGate）——4 选项理论 0.25 在范围内
    var c = 0;
    if (question.type === 'mcq' && question.options) {
      c = 1 / question.options.length;
      c = Math.min(0.35, c);
    } else if (question.type === 'judgment') {
      c = 0.5; // 2 选项判断题的理论猜测下限
    }

    return { a: a, b: b, c: c };
  }

  /**
   * 批量计算题库的 IRT 参数，缓存到 localStorage
   * @param {Array} questions
   */
  function buildParamsCache(questions) {
    var cache = {};
    questions.forEach(function (q) {
      cache[q.id] = inferParams(q);
    });
    try { localStorage.setItem(PARAMS_KEY, JSON.stringify(cache)); } catch (e) {}
    return cache;
  }

  function loadParamsCache() {
    try {
      var raw = localStorage.getItem(PARAMS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function getParam(questionId, cache) {
    cache = cache || loadParamsCache();
    return cache[questionId] || { a: 1.0, b: 0, c: 0.25 };
  }


  /**
   * 三参数逻辑斯谛模型的答对概率
   */
  function probCorrect(theta, params) {
    var a = params.a, b = params.b, c = params.c;
    var z = a * (theta - b);
    var p = c + (1 - c) / (1 + Math.exp(-z));
    return Math.min(0.999, Math.max(0.001, p));
  }

  /**
   * 单项信息函数 I(θ)（3PL）：
   *   I(θ) = a² · (P-c)²/(1-c)² · (1-P)/P
   * θ 处信息量越大，对能力估计越精确。参考 Lord (1980)。
   * @param {number} theta - 能力值
   * @param {Object} params - {a, b, c}
   * @returns {number} 信息量（≥0）
   */
  function itemInfo(theta, params) {
    var a = params.a || 0;
    var c = params.c || 0;
    var p = probCorrect(theta, params);
    var omc = 1 - c;           // 1-c，p 已钳制在 (c, 1)，故 won't 除零
    var pc = p - c;
    if (pc <= 0 || omc <= 0) return 0;
    return a * a * (pc * pc / (omc * omc)) * ((1 - p) / p);
  }

  /**
   * 加载用户 θ 状态
   * @returns {{theta: number, totalAnswered: number, byModule: Object, history: Array}}
   */
  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { theta: 0, totalAnswered: 0, byModule: {}, history: [] };
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /**
   * 用一道题的答题结果贝叶斯更新 θ
   * 先验 N(θ_prior, 1)（在线学习锚定在更新前的 θ），似然为 3PL，
   * 后验众数通过 [-3,3] 网格（步长 0.05）的最大后验估计（MAP）求得。
   * 注意：本实现是 MAP（众数）而非 EAP（期望积分）；对学情诊断两种口径均可接受，
   * 但 θ 贴近 ±3 边界时网格截断会略低估后验众数——除了限制单步更新，还应注意
   * 先验本质是「惩罚远离 θ_prior」，因此长期收敛到网格中间区域，边界影响有限。
   *
   * @param {number} thetaPrior - 更新前的 θ
   * @param {boolean} correct - 是否答对
   * @param {Object} params - 题目 IRT 参数 {a, b, c}
   * @param {number} [stepSize=0.5] - 单步更新幅度上限（避免单题震荡过大）
   * @returns {number} 更新后的 θ
   */
  function updateTheta(thetaPrior, correct, params, stepSize) {
    stepSize = (typeof stepSize === 'number' && isFinite(stepSize) && stepSize > 0) ? stepSize : 0.5;
    stepSize = Math.min(stepSize, 3);
    // 似然：P(response|θ) = P^correct * (1-P)^(1-correct)
    var logLik = function (theta) {
      var p = probCorrect(theta, params);
      return correct ? Math.log(p) : Math.log(1 - p);
    };
    // 先验：标准正态 log N(0, 1)，但锚定到 thetaPrior 而非 0（在线学习）
    var logPrior = function (theta) {
      var d = theta - thetaPrior;
      return -0.5 * d * d;
    };

    // 网格搜索后验众数（MAP）
    var best = thetaPrior, bestLog = -Infinity;
    for (var t = -3; t <= 3; t += 0.05) {
      var l = logLik(t) + logPrior(t);
      if (l > bestLog) { bestLog = l; best = t; }
    }

    // 限制单步更新幅度（在线学习稳定性）
    var delta = best - thetaPrior;
    if (Math.abs(delta) > stepSize) {
      best = thetaPrior + Math.sign(delta) * stepSize;
    }
    return Math.max(-3, Math.min(3, best));
  }

  /**
   * 记录一次答题并更新全局 θ 与模块 θ
   * @param {string} questionId
   * @param {boolean} correct
   * @param {Object} question - 题目对象（用于推断参数和模块）
   * @param {string} [module] - 模块名（如 'genetics'）
   */
  function recordAnswer(questionId, correct, question, module) {
    var state = loadState();
    var cache = loadParamsCache();
    if (!cache[questionId] && question) {
      cache[questionId] = inferParams(question);
      try { localStorage.setItem(PARAMS_KEY, JSON.stringify(cache)); } catch (e) {}
    }
    var params = getParam(questionId, cache);

    state.theta = updateTheta(state.theta, correct, params);
    state.totalAnswered++;

    if (module) {
      if (!state.byModule[module]) state.byModule[module] = { theta: 0, answered: 0 };
      var m = state.byModule[module];
      m.theta = updateTheta(m.theta, correct, params);
      m.answered++;
    }

    state.history.push({
      ts: Date.now(),
      questionId: questionId,
      correct: correct,
      thetaAfter: state.theta
    });
    // 只保留最近 200 条
    if (state.history.length > 200) state.history = state.history.slice(-200);

    saveState(state);
    return state;
  }


  /**
   * 按最大信息量原则选题（最简单实现：从候选题中选信息函数最大的）
   * 信息函数 I(θ) = a^2 * (1-p) / (1-c)^2 * (p - c)^2 / p
   *
   * @param {Array} candidates - 候选题 [{id, ...}]
   * @param {number} theta - 当前能力值
   * @param {Object} [options] - { excludeIds?: [], targetDifficulty?: 'easy'|'normal'|'hard' }
   * @returns {Object|null} 选中的题目
   */
  function selectNext(candidates, theta, options) {
    options = options || {};
    var exclude = {};
    (options.excludeIds || []).forEach(function (id) { exclude[id] = true; });
    var cache = loadParamsCache();

    var scored = candidates
      .filter(function (q) { return !exclude[q.id]; })
      .map(function (q) {
        var params = getParam(q.id, cache) || inferParams(q);
        var info = itemInfo(theta, params);
        // 难度过滤：easy→θ-1, normal→θ, hard→θ+1
        var targetB = theta;
        if (options.targetDifficulty === 'easy') targetB = theta - 1;
        if (options.targetDifficulty === 'hard') targetB = theta + 1;
        var distancePenalty = Math.abs(params.b - targetB);
        return { q: q, info: info, score: info - 0.3 * distancePenalty };
      })
      .filter(function (x) { return x.info > 0; })
      .sort(function (a, b) { return b.score - a.score; });

    // 从前 3 名中随机选 1（增加多样性，避免总是同一题）
    var top = scored.slice(0, Math.min(3, scored.length));
    if (!top.length) return candidates[0] || null;
    return top[Math.floor(Math.random() * top.length)].q;
  }

  /**
   * 生成一组自适应题（5-10 题）
   * @param {Array} pool - 题库
   * @param {number} count - 题数
   * @param {Object} [options]
   * @returns {Array} 选中的题目数组
   */
  function buildAdaptiveSet(pool, count, options) {
    options = options || {};
    var state = loadState();
    var theta = state.theta;
    var selected = [];
    var excludeIds = (options.excludeIds || []).slice();
    // 前 2 题中等难度，根据答题动态调整
    var simTheta = theta;
    for (var i = 0; i < count; i++) {
      var targetDifficulty = i < 2 ? 'normal' : null;  // 后续按信息量
      var q = selectNext(pool, simTheta, {
        excludeIds: excludeIds.concat(selected.map(function (x) { return x.id; })),
        targetDifficulty: targetDifficulty
      });
      if (!q) break;
      selected.push(q);
      // 模拟假设答对（实际生产用真实答题后再抽下一题）
      var params = getParam(q.id) || inferParams(q);
      simTheta = updateTheta(simTheta, true, params, 0.3);
    }
    return selected;
  }


  /**
   * θ → 百分位（标准正态 CDF）。θ 被建模为 N(0,1) 的受测者能力，
   * 百分位表示「比多少比例的参赛者强」。一致用于 describeAbility 与 predictScore。
   * @param {number} theta
   * @returns {number} 0-100
   */
  function thetaToPercentile(theta) {
    // Abramowitz & Stegun 近似 erf，配合标准正态 CDF
    var x = Math.abs(theta) / Math.SQRT2;
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    var cdf = 0.5 * (1 + (theta >= 0 ? y : -y));
    return Math.round(cdf * 1000) / 10; // 0.1 精度
  }

  /**
   * 预测联赛得分的百分位分（百分制）
   * score = Φ(θ)×100（即 θ 对应的参赛者百分位）。θ 与 score 单调，θ=0→50。
   */
  function thetaToScore(theta) {
    return thetaToPercentile(theta);
  }

  /**
   * 有效测验信息量 ΣI_j(θ)：
   * 优先累加已答题目（history）的真实信息函数；history 无参数可用时，
   * 退化为「平均题量 × 单题典型信息」，保证早期与测试环境也有合理口径。
   * @param {Object} state
   * @param {number} theta
   * @returns {number} 总信息量
   */
  function effectiveTestInfo(state, theta) {
    var hist = state.history || [];
    var sum = 0, used = 0;
    for (var i = 0; i < hist.length; i++) {
      var p = getParam(hist[i].questionId);
      if (p && typeof p.a === 'number' && typeof p.c === 'number') {
        sum += itemInfo(theta, p);
        used++;
      }
    }
    if (used > 0) return sum;
    var n = state.totalAnswered || 0;
    if (n <= 0) return 0;
    // 退化口径：典型题 a=1.1、c=0.25，在 θ 处（b=θ 最大化信息）的信息量
    return n * itemInfo(theta, { a: 1.1, b: theta, c: 0.25 });
  }

  /**
   * 预测联赛得分（基于 IRT 测验信息函数，而非简单题量）
   *
   * 设计依据：
   *   - 能力估计标准差（SE）：SE(θ) = 1/√ΣI_j(θ)（标准误随信息量增大而减小）。
   *   - 95% 置信区间：θ ± 1.96·SE，再各自映射到百分位分 → score CI。
   *   - 置信度展示：information → confidence 的单调映射，样本(信息量)越多越可信。
   *
   * @returns {{theta, score, low, high, se, info, confidence}}
   */
  function predictScore() {
    var state = loadState();
    var theta = state.theta;

    var info = effectiveTestInfo(state, theta);
    var se = info > 0 ? (1 / Math.sqrt(info)) : 3; // 无信息时给满幅 SE（极宽区间）
    var score = thetaToScore(theta);
    var low = thetaToScore(theta - 1.96 * se);
    var high = thetaToScore(theta + 1.96 * se);

    // 置信度：0 信息→0%，信息饱和→趋近 100%。exp(-info/8) 在 info=8 时约 37%。
    var confidence = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.exp(-info / 8)))));

    return {
      theta: Math.round(theta * 100) / 100,
      score: Math.max(0, Math.min(100, Math.round(score))),
      low: Math.max(0, Math.min(100, Math.round(low))),
      high: Math.max(0, Math.min(100, Math.round(high))),
      se: Math.round(se * 100) / 100,
      info: Math.round(info * 100) / 100,
      confidence: confidence
    };
  }

  /**
   * 生成能力等级描述
   * @param {number} theta
   * @returns {{level: string, percentile: number, desc: string}}
   */
  function describeAbility(theta) {
    var percentile = thetaToPercentile(theta);

    var level, desc;
    if (theta < -1.5) { level = '入门'; desc = '建议从基础概念开始，多看动画和卡片'; }
    else if (theta < -0.5) { level = '基础'; desc = '掌握主干知识，重点补薄弱模块'; }
    else if (theta < 0.5) { level = '进阶'; desc = '稳定中游，可挑战中等难度题'; }
    else if (theta < 1.5) { level = '熟练'; desc = '可冲击高分，注意细节与综合题'; }
    else { level = '精通'; desc = '已达优秀水平，重点训练竞赛压轴题'; }

    return { level: level, percentile: percentile, desc: desc };
  }

  window.IrtEngine = {
    inferParams: inferParams,
    buildParamsCache: buildParamsCache,
    loadParamsCache: loadParamsCache,
    probCorrect: probCorrect,
    loadState: loadState,
    saveState: saveState,
    recordAnswer: recordAnswer,
    selectNext: selectNext,
    buildAdaptiveSet: buildAdaptiveSet,
    predictScore: predictScore,
    describeAbility: describeAbility
  };

})();
