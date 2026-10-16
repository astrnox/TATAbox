/**
 * ============================================================
 * TATABOX — 评分引擎（共享纯函数）
 * ------------------------------------------------------------
 * 提供「可解释、可推演」的核心评分计算：
 *   1) computeBioScoreFromRaw：由六维属性（B/I/O/G/C/D，0-100）合成 Bio Score
 *      —— 与 js/pages/analytic.js calcBioScore 的合成规则完全一致，
 *         供「数据实验室」计算器与页面展示复用，避免双实现漂移；
 *   2) BIO_SCORE_EXPLAIN：公式/权重/评级的中文说明元数据（透明化）；
 *   3) calcBioScore：全局统一入口（stats → 六维 → 合成），任何页面
 *      （仪表盘/练习/诊断/数据导出）无需加载 analytic.js 即可计算 Bio 分。
 * ============================================================
 */
(function (g) {
  'use strict';

  /* Bio Score 合成权重（教育测量学 CBO 联赛标准 + 正态映射） */
  var BIO_WEIGHTS = {
    B: 0.25,  // 基础正确率：正确率经正态 CDF 映射（μ=0.55，σ=0.25）
    I: 0.25,  // 洞察力：难度加权「题级全对率」
    O: 0.10,  // 活跃度：log2(练习次数+1)×18 + 连续性奖励
    G: 0.15,  // 成长性：时间升序下双指数平滑(Holt)趋势×500
    C: 0.15,  // 一致性：变异系数指数衰减 100·e^(−3·CV²)
    D: 0.10   // 难度突破力：模块正确率×难度系数的加权均值
  };

  /**
   * 由六维属性合成 Bio Score（六维均参与，数据不足维度保持中性 50，
   * 置信度由 computeBioDimensions 输出并交由 UI 标注，不改变分数结构）。
   * @param {Object} comp - { B, I, O, G, C, D } 均为 0-100
   * @returns {{score:number, grade:string, letter:string, raw:number}}
   */
  function computeBioScoreFromRaw(comp) {
    if (!comp || typeof comp !== 'object') return { score: 0, grade: 'D', letter: '需努力', raw: 0 };
    var clamp = function (v) {
      v = Number(v);
      if (!isFinite(v)) return 0;
      return Math.max(0, Math.min(100, v));
    };
    var B = clamp(comp.B), I = clamp(comp.I), O = clamp(comp.O);
    var G = clamp(comp.G), C = clamp(comp.C), D = clamp(comp.D);

    var raw = Math.round(
      B * BIO_WEIGHTS.B + I * BIO_WEIGHTS.I + O * BIO_WEIGHTS.O +
      G * BIO_WEIGHTS.G + C * BIO_WEIGHTS.C + D * BIO_WEIGHTS.D
    );
    // 交互修正：B 与 I 的协同（两强 +5，两弱 -5）
    if (B >= 70 && I >= 70) raw += 5;
    if (B < 40 && I < 40) raw -= 5;
    var score = Math.max(0, Math.min(100, raw));

    var grade = 'D', letter = '需努力';
    // 阈值经画像标定：省一（正确率≈75-80%）≈ 70-76 → A，
    // 省二 ≈ 58-63 → B/B+，省三 ≈ 46-51 → C/C+，新手 ≈ 40-50 → C/D+
    if (score >= 86) { grade = 'S+'; letter = '顶尖'; }
    else if (score >= 81) { grade = 'S'; letter = '卓越'; }
    else if (score >= 77) { grade = 'A+'; letter = '优秀+'; }
    else if (score >= 70) { grade = 'A'; letter = '优秀'; }
    else if (score >= 64) { grade = 'B+'; letter = '良好+'; }
    else if (score >= 58) { grade = 'B'; letter = '良好'; }
    else if (score >= 52) { grade = 'C+'; letter = '合格+'; }
    else if (score >= 46) { grade = 'C'; letter = '合格'; }
    else if (score >= 36) { grade = 'D+'; letter = '待提升'; }
    return { score: score, grade: grade, letter: letter, raw: raw };
  }

  /* 评级说明（透明化展示用） */
  var BIO_SCORE_EXPLAIN = {
    title: 'Bio Score 生物学习力评分（0-100）',
    formula: 'Bio Score = B×25% + I×25% + O×10% + G×15% + C×15% + D×10%（另含 B/I 协同修正 ±5）',
    weights: BIO_WEIGHTS,
    dims: [
      { key: 'B', name: '基础正确率', weight: '25%', desc: '把「正确率」经标准正态累积分布映射：55% → 50 分，67.5% → 69 分，80% → 84 分，40% → 27 分（避免线性映射两端失真）' },
      { key: 'I', name: '洞察力', weight: '25%', desc: '难度加权的「题级全对率」：优先统计每次练习/考试记录中每题 100% 判对的真实数据；无明细时以 正确率² 估算（回退值会标注低置信度）' },
      { key: 'O', name: '活跃度', weight: '10%', desc: 'O = log2(练习场次+1)×18 + 最近 7 天连续练习奖励（每活跃一天 +3，封顶 +15）：10 场 ≈ 62 分，30 场 ≈ 88 分' },
      { key: 'G', name: '成长性', weight: '15%', desc: '按时间升序对每次记录的得分率做双指数平滑(Holt)，提取趋势斜率：每次提升 1% ≈ +5 分（进步加分、退步减分，中性为 50；记录<4 场时置信度低）' },
      { key: 'C', name: '一致性', weight: '15%', desc: 'C = 0.6×C_cv + 0.4×C_recent，其中 C_cv = 100·e^(−3·CV²)，变异系数越小越稳定；偶尔失常惩罚轻、持续波动惩罚重（记录<3 场时置信度低）' },
      { key: 'D', name: '难度突破力', weight: '10%', desc: 'D = Σ(模块正确率×模块难度系数)/Σ(难度系数)×100，区分「只做简单题」与「攻克难题」' }
    ],
    grades: [
      { min: 86, grade: 'S+', desc: '顶尖（全国前 1%）' },
      { min: 81, grade: 'S', desc: '卓越（国一水准）' },
      { min: 77, grade: 'A+', desc: '优秀+（省一头部/冲国奖）' },
      { min: 70, grade: 'A', desc: '优秀（省一）' },
      { min: 64, grade: 'B+', desc: '良好+（冲省一）' },
      { min: 58, grade: 'B', desc: '良好（省二）' },
      { min: 52, grade: 'C+', desc: '合格+（省二冲线）' },
      { min: 46, grade: 'C', desc: '合格（省三）' },
      { min: 36, grade: 'D+', desc: '待提升' },
      { min: 0, grade: 'D', desc: '需努力' }
    ],
    gradeNote: '阈值经画像标定：正确率≈75-80% 的省一选手落在 70-76 分（A），省二 ≈ 58-63（B/B+），省三 ≈ 46-51（C/C+）。低置信度维度（数据不足时显示「置信度低」标注）仍按中性值参与计算，攒够数据后自动转正。'
  };

  /* ============================================================
   * computeBioDimensions(stats, records) — 由真实统计数据计算六维
   * 与 js/pages/analytic.js calcBioScore 的维度算法 1:1 一致
   * （同一输入下两处输出应完全相等，tests/unit/score-audit 中对拍守护）
   * ============================================================ */
  function clamp01(v) {
    v = Number(v);
    if (!v || !isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
  }
  function localDateStr(d) {
    var dt = (d === undefined || d === null) ? new Date() : (d instanceof Date ? d : new Date(d));
    if (isNaN(dt.getTime())) return '';
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }
  function normCDF(x) {
    var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    var a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    var sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.SQRT2;
    var t = 1.0 / (1.0 + p * x);
    var y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  }
  var MODULE_DIFFICULTY = {
    module1: 0.6, module_1: 0.6, '细胞生物学': 0.6, '生物化学': 0.6, '分子生物学': 0.6, '细胞结构': 0.6, '细胞代谢': 0.6,
    module2: 0.7, module_2: 0.7, '植物生理学': 0.7, '植物学': 0.7, '微生物学': 0.7, '植物生理': 0.7,
    module3: 0.75, module_3: 0.75, '动物生理学': 0.75, '动物学': 0.75, '动物生理': 0.75,
    module4: 0.85, module_4: 0.85, '遗传学': 0.85, '遗传': 0.85,
    module5: 0.9, '进化': 0.9, '进化生物学': 0.9,
    module6: 0.8, '生态学': 0.8,
    module7: 0.65,
    module8: 0.95
  };
  var MODULE_DIFF_PRESET = [0.6, 0.7, 0.75, 0.85, 0.9, 0.8, 0.65, 0.95];
  function diffOf(key) {
    if (!key) return 0.7;
    if (typeof MODULE_DIFFICULTY[key] === 'number') return MODULE_DIFFICULTY[key];
    var m = /^module[_-]([1-8])$/i.exec(String(key));
    if (m) return MODULE_DIFF_PRESET[parseInt(m[1], 10) - 1];
    return 0.7;
  }
  function rateOf(r) {
    var tot = Math.max(1, r.totalQuestions || 1);
    return clamp01((r.correctCount || 0) / tot);
  }

  /**
   * 由 stats（getStats() 结构）与 records（getRecords() 结构）计算六维分量。
   * 同时输出 confidence（各维置信度 0-1）：数据量不足的维度保持中性值参与
   * 合成（见 computeBioScoreFromRaw），但置信度偏低，交由 UI 标注
   * 「置信度低」，避免用户误读为真实水平。
   * @param {Object} stats
   * @param {Array} records
   * @returns {{B:number,I:number,O:number,G:number,C:number,D:number,confidence:Object}|null}
   */
  function computeBioDimensions(stats, records) {
    if (!stats || typeof stats !== 'object') return null;
    records = Array.isArray(records) ? records : [];
    var recordsAsc = records.slice().sort(function (a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });

    var totalAns = stats.totalAnswered || 0;
    var totalCorr = stats.totalCorrect || 0;
    var rawAccuracy = totalAns > 0 ? clamp01(totalCorr / totalAns) : 0;

    /* 置信度辅助：样本量 0→0 线性升到阈值→1（封顶） */
    var confOf = function (n, threshold) {
      if (!(threshold > 0)) return n > 0 ? 1 : 0;
      return Math.max(0, Math.min(1, n / threshold));
    };

    /* B — 基础正确率（正态 CDF 映射，μ=0.55，σ=0.25） */
    var B = Math.round(normCDF((rawAccuracy - 0.55) / 0.25) * 100);

    /* I — 洞察力（真实题级全对率，难度加权；无明细回退 正确率²） */
    var weightedFull = 0, weightTotal = 0, hasReal = false;
    recordsAsc.forEach(function (r) {
      var qs = Array.isArray(r.questions) ? r.questions : null;
      if (!qs || qs.length === 0) return;
      qs.forEach(function (qi) {
        if (!qi || typeof qi !== 'object') return;
        var isFull = null;
        if (typeof qi.correctSubs === 'number' && typeof qi.totalSubs === 'number') {
          isFull = qi.totalSubs > 0 && qi.correctSubs === qi.totalSubs;
        } else if (typeof qi.score === 'number' && isFinite(qi.score)) {
          isFull = qi.score >= 2 - 1e-6;
        }
        if (isFull === null) return;
        hasReal = true;
        var w = diffOf(qi.subject);
        weightTotal += w;
        if (isFull) weightedFull += w;
      });
    });
    var I;
    if (hasReal && weightTotal > 0) {
      I = Math.round((weightedFull / weightTotal) * 100);
    } else if (totalAns > 0) {
      // 回退：正确率² 估算（历史⁴幂次过狠，78% 正确率的省一被压到 37 分；
      // ² 拟合「单题多小题时全对率 ≈ 正确率²」的独立性假设上界）
      I = Math.round(Math.pow(rawAccuracy, 2) * 100);
    } else {
      I = 0;
    }

    /* O — 活跃度（log2 压缩 + 最近 7 天连续性奖励） */
    var baseO = Math.min(100, Math.round(Math.log2(records.length + 1) * 18));
    var recentDays = {};
    var cutoff = Date.now() - 7 * 86400000;
    records.forEach(function (r) {
      var d = r.timestamp ? new Date(r.timestamp) : null;
      if (d && !isNaN(d.getTime()) && d.getTime() >= cutoff) recentDays[localDateStr(d)] = true;
    });
    var streakBonus = Math.min(15, Object.keys(recentDays).length * 3);
    var O = Math.min(100, baseO + streakBonus);

    /* G — 成长性（升序 Holt 双指数平滑） */
    var scoreRates = recordsAsc.map(rateOf);
    var G = 50;
    if (scoreRates.length >= 4) {
      var alpha_h = 0.4, beta_h = 0.3;
      var level = scoreRates[0];
      var trend = scoreRates.length > 1 ? scoreRates[1] - scoreRates[0] : 0;
      for (var i = 1; i < scoreRates.length; i++) {
        var nl = alpha_h * scoreRates[i] + (1 - alpha_h) * (level + trend);
        var nt = beta_h * (nl - level) + (1 - beta_h) * trend;
        level = nl; trend = nt;
      }
      G = Math.max(0, Math.min(100, Math.round(50 + trend * 500)));
    } else if (scoreRates.length >= 2) {
      var fh = scoreRates.slice(0, Math.ceil(scoreRates.length / 2));
      var sh = scoreRates.slice(Math.ceil(scoreRates.length / 2));
      if (fh.length > 0 && sh.length > 0) {
        var a1 = fh.reduce(function (s, v) { return s + v; }, 0) / fh.length;
        var a2 = sh.reduce(function (s, v) { return s + v; }, 0) / sh.length;
        G = Math.max(0, Math.min(100, Math.round(50 + (a2 - a1) * 200)));
      }
    }

    /* C — 一致性（变异系数指数衰减） */
    var C = 50;
    if (records.length >= 3) {
      var rates = records.map(rateOf);
      var mean = rates.reduce(function (s, v) { return s + v; }, 0) / rates.length;
      var variance = rates.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / rates.length;
      var cv = Math.sqrt(variance) / (mean > 0.01 ? mean : 1);
      var C_cv = Math.round(100 * Math.exp(-3 * cv * cv));
      var rr = rates.slice(-5);
      var rm = rr.reduce(function (s, v) { return s + v; }, 0) / rr.length;
      var rv = rr.reduce(function (s, v) { return s + (v - rm) * (v - rm); }, 0) / rr.length;
      var rc = Math.sqrt(rv) / (rm > 0.01 ? rm : 1);
      var C_recent = Math.round(100 * Math.exp(-3 * rc * rc));
      C = Math.max(0, Math.min(100, Math.round(0.6 * C_cv + 0.4 * C_recent)));
    }

    /* D — 难度突破力（模块难度加权正确率） */
    var D = 50, hasModuleData = false;
    if (stats.modules) {
      var wAcc = 0, wDiff = 0;
      for (var mkey in stats.modules) {
        if (!stats.modules.hasOwnProperty(mkey)) continue;
        var m = stats.modules[mkey];
        if (m && m.totalAnswered > 0) {
          hasModuleData = true;
          var acc = clamp01((m.totalCorrect || 0) / m.totalAnswered);
          var df = diffOf(mkey);
          wAcc += acc * df;
          wDiff += df;
        }
      }
      if (wDiff > 0) D = Math.round((wAcc / wDiff) * 100);
    }

    /* 各维置信度（0-1）：样本量达到阈值视为充分，不足按比例折算。
     * I 走回退估算时额外打 0.6 折（估算值天然弱于真实题级统计）。
     * 阈值口径与 UI「正确率需 30 题」一致；O/G/C 按场次数，D 按有无模块数据。 */
    var confidence = {
      B: confOf(totalAns, 30),
      I: hasReal ? confOf(weightTotal, 30) : confOf(totalAns, 30) * 0.6,
      O: confOf(records.length, 5),
      G: confOf(records.length, 4),
      C: confOf(records.length, 3),
      D: hasModuleData ? 1 : 0
    };

    return { B: B, I: I, O: O, G: G, C: C, D: D, confidence: confidence };
  }

  /**
   * 全局统一 Bio 分入口：stats（getStats() 结构）→ 六维 → 合成分。
   * 返回 shape 与 js/pages/analytic.js calcBioScore 完全一致
   * （score/grade/letter/components/confidence/breakdown），由 score-audit
   * 对拍测试锁定。记录数据经 getRecords() 取（storage.js 全局函数）。
   * stats 结构异常返回 null（调用方自行判空，不可把 0 分当真实分数）。
   * @param {Object} stats
   * @returns {{score:number,grade:string,letter:string,components:Object,confidence:Object,breakdown:Object}|null}
   */
  function calcBioScore(stats) {
    var dims = computeBioDimensions(stats, (typeof g.getRecords === 'function') ? (g.getRecords() || []) : []);
    if (!dims) return null;
    var out = computeBioScoreFromRaw(dims);
    var comps = { B: dims.B, I: dims.I, O: dims.O, G: dims.G, C: dims.C, D: dims.D };
    return {
      score: out.score,
      grade: out.grade,
      letter: out.letter,
      components: comps,
      confidence: dims.confidence,
      breakdown: {
        '基础正确率(B)': dims.B,
        '洞察力(I)': dims.I,
        '活跃度(O)': dims.O,
        '成长性(G)': dims.G,
        '一致性(C)': dims.C,
        '难度突破(D)': dims.D
      }
    };
  }

  g.computeBioScoreFromRaw = computeBioScoreFromRaw;
  g.computeBioDimensions = computeBioDimensions;
  g.calcBioScore = calcBioScore;
  g.BIO_SCORE_EXPLAIN = BIO_SCORE_EXPLAIN;
  g.BIO_WEIGHTS = BIO_WEIGHTS;
})(typeof window !== 'undefined' ? window : globalThis);