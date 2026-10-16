/**
 * ============================================================
 * TATABOX — 统一会话落盘服务（recordSession）
 * 职责：把「刷题 → 全局体系」的整条链路收敛为两个入口，
 *   BioQuestSession.question(...)  每题提交时：模块统计 / 难度自适应 /
 *                                  错题本（云端复习卡）/ 信用点 /（可选）打卡与成就
 *   BioQuestSession.finish(...)    一段刷题结束时：练习记录 saveRecord /
 *                                  bio 分六维重算与云端同步 /（可选）打卡与成就
 *
 * 消费方：practice / exam / quiz / 每日亿题（四个刷题入口共用同一口径）。
 * 依赖（运行时按需，全部 typeof 守卫）：
 *   storage.js      —— updateStats / saveRecord / getStats / getRecords
 *   sb-gamify.js    —— updateBioScore / recordDailyCheckIn / checkAchievement
 *   sb-data.js      —— recordWrongAnswer（云端 review_cards 复习卡）
 *   user.js         —— addPoints（信用指数）
 *   question-utils  —— recordQuestionAnswer（难度自适应）
 *   question-model  —— getStatModuleKey（科目 → module_1..4 唯一映射）
 *   score-engine    —— computeBioDimensions / computeBioScoreFromRaw（缺失时按需加载）
 *   event-bus       —— bq:question-submitted / bq:session-finished 广播
 * ============================================================
 */
(function () {
  'use strict';

  /* ======================= 信用点默认配置 =======================
   * practice：沿用 user.js 的默认额度（ANSWER_CORRECT / ANSWER_WRONG = 0.5 / 0.1）。
   * daily-billion：无限流刷题，额度减半（0.25 / 0.05）且每日累计封顶 5，
   *                防止刷题量大时信用指数快速膨胀。
   * exam / quiz：不给信用（与历史行为一致）。
   */
  var MODULE_POINTS = {
    practice: { correct: null, wrong: null },
    'daily-billion': { correct: 0.25, wrong: 0.05, dailyCap: 5 }
  };

  var DAILY_POINTS_KEY = 'bioquest_daily_points_v1';

  /* 挂起的信用发放：addPoints 实现在 js/pages/user.js（历史上仅 /user 路由可达）。
   * practice/每日亿题等路由下 user.js 未加载时，先挂起、按需加载后补发，
   * 保证信用点真实到账而不是静默丢失。 */
  var _pendingGrants = [];
  var _pointsModuleRequested = false;

  /* ======================= 内部工具 ======================= */

  function _emit(event, payload) {
    try {
      if (window.BioQuestEventBus && typeof window.BioQuestEventBus.emit === 'function') {
        window.BioQuestEventBus.emit(event, payload);
      }
    } catch (e) { /* 事件广播失败不影响落盘 */ }
  }

  function _qid(q) {
    if (!q) return '';
    if (q.bioId) return String(q.bioId);
    var raw = (q.id !== undefined && q.id !== null && q.id !== '') ? q.id
      : ((q.question_id !== undefined && q.question_id !== null) ? q.question_id : '');
    // 兜底：无稳定 bioID/id 的题（未注入分片的老数据）改用题干前 20 字，
    // 保持旧 practice 的口径，避免难度自适应统计静默丢失。
    if (raw === '' && typeof q.question === 'string' && q.question) {
      raw = q.question.slice(0, 20);
    }
    if (raw === '') return '';
    return (typeof window.resolveQuestionBioId === 'function')
      ? window.resolveQuestionBioId(raw) : String(raw);
  }

  function _evalAchievements(achievements, ctx) {
    if (!achievements) return [];
    if (typeof achievements === 'function') {
      try { return achievements(ctx) || []; } catch (e) { return []; }
    }
    return Array.isArray(achievements) ? achievements : [];
  }

  function _runCheckin(enabled) {
    if (!enabled) return;
    try {
      if (typeof window.recordDailyCheckIn === 'function') window.recordDailyCheckIn();
    } catch (e) { /* 静默 */ }
  }

  function _runAchievements(list) {
    list.forEach(function (a) {
      if (!a || !a.type) return;
      try {
        if (typeof window.checkAchievement === 'function') window.checkAchievement(a.type, a.value);
      } catch (e) { /* 静默 */ }
    });
  }

  /**
   * 信用发放底层（支持每日封顶）。
   * amount 为 null 时沿用 user.js 默认额度（addPoints(reason) 不传 amount）。
   */
  function _doGrant(reason, amount, cap) {
    if (typeof window.addPoints !== 'function') return 0;
    try {
      if (cap == null) {
        // 无封顶：默认额度直接走 user.js 的 REWARD 表；显式额度传 amount
        window.addPoints(reason);
        return (typeof amount === 'number') ? amount : 0.5;
      }
      // 有封顶：按日累计已发放额度
      var today = new Date().toISOString().slice(0, 10);
      var st = { date: today, granted: 0 };
      try {
        var raw = localStorage.getItem(DAILY_POINTS_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.date === today) st = parsed;
        }
      } catch (e) { /* 读取失败按当日 0 处理 */ }
      if (st.granted >= cap) return 0;
      var amt = (typeof amount === 'number') ? amount : 0;
      var grant = Math.min(amt, cap - st.granted);
      if (grant <= 0) return 0;
      window.addPoints(reason, grant);
      st.granted = Math.round((st.granted + grant) * 1000) / 1000;
      localStorage.setItem(DAILY_POINTS_KEY, JSON.stringify(st));
      return grant;
    } catch (e) { return 0; }
  }

  /** 补发挂起的信用（user.js 按需加载完成后调用；addPoints 就绪后每次发放前也会兜底触发） */
  function _flushPendingGrants() {
    if (typeof window.addPoints !== 'function' || _pendingGrants.length === 0) return;
    var queue = _pendingGrants.splice(0, _pendingGrants.length);
    queue.forEach(function (g) { _doGrant(g.reason, g.amount, g.cap); });
  }

  /** 按需加载 user.js（addPoints 所在模块），失败不重试避免反复请求 */
  function _ensurePointsModule() {
    if (_pointsModuleRequested) return;
    _pointsModuleRequested = true;
    try {
      if (typeof window.loadModule === 'function') {
        window.loadModule('user')
          .then(_flushPendingGrants)
          .catch(function () { _pointsModuleRequested = false; });
      }
    } catch (e) { _pointsModuleRequested = false; }
  }

  /**
   * 信用发放入口。
   * cfg.correct/cfg.wrong 为 null 时沿用 user.js 默认额度（addPoints(reason) 不传 amount）。
   * @returns {number} 实际发放额度（挂起/未发放为 0）
   */
  function _grantPoints(module, correct) {
    var cfg = MODULE_POINTS[module];
    if (!cfg) return 0; // 该模块不给信用

    // user.js 尚未加载：挂起本次发放并按需加载补发
    if (typeof window.addPoints !== 'function') {
      if (_pendingGrants.length < 200) {
        _pendingGrants.push({
          reason: correct ? 'ANSWER_CORRECT' : 'ANSWER_WRONG',
          amount: correct ? cfg.correct : cfg.wrong,
          cap: cfg.dailyCap
        });
      }
      _ensurePointsModule();
      return 0;
    }
    _flushPendingGrants();
    return _doGrant(
      correct ? 'ANSWER_CORRECT' : 'ANSWER_WRONG',
      correct ? cfg.correct : cfg.wrong,
      cfg.dailyCap
    );
  }

  /**
   * bio 分重算 + 云端同步（唯一实现，四页共用）。
   * score-engine 缺失时按需加载并重试一次（每日亿题路由不经过 loadModule 依赖链）。
   */
  function _syncBioScore(retry) {
    if (typeof window.getStats !== 'function') return null;
    var hasEngine = typeof window.computeBioDimensions === 'function' &&
      typeof window.computeBioScoreFromRaw === 'function';
    var hasCalc = typeof window.calcBioScore === 'function';
    if (!hasEngine && !hasCalc) {
      if (!retry && typeof window.loadModule === 'function') {
        try {
          window.loadModule('score-engine').then(function () { _syncBioScore(true); }).catch(function () {});
        } catch (e) { /* 静默 */ }
      }
      return null;
    }

    var stats = window.getStats();
    var score = null;
    try {
      if (hasEngine) {
        var records = (typeof window.getRecords === 'function') ? window.getRecords() : [];
        var dims = window.computeBioDimensions(stats, records);
        // stats 结构异常时返回 null：不能把 computeBioScoreFromRaw(null) → 0 分同步上云
        if (!dims) return null;
        score = window.computeBioScoreFromRaw(dims).score;
      } else {
        score = window.calcBioScore(stats).score;
      }
    } catch (e) { return null; }
    if (score === null || score === undefined) return null;

    try {
      if (typeof window.updateBioScore === 'function') {
        // 登录态判断在 updateBioScore 内部完成（未登录直接短路）
        var p = window.updateBioScore(score, {
          practice_count: stats.totalAnswered || 0,
          total_answered: stats.totalAnswered || 0,
          total_correct: stats.totalCorrect || 0,
          accuracy: stats.accuracy || 0
        });
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    } catch (e) { /* 静默 */ }
    return score;
  }

  /* ======================= 入口 1：每题提交 ======================= */

  /**
   * 每题提交时的全局副作用（幂等口径由调用方保证，如 practice 只在首次提交调用）
   * @param {Object} p
   * @param {string} p.module     模块名（practice / exam / quiz / daily-billion …），决定信用配置
   * @param {Object} p.q          题目对象（错题本/难度统计需要）
   * @param {boolean} p.correct   题级全对
   * @param {string} [p.moduleKey] 统计模块键，缺省按科目自动映射（QuestionModel.getStatModuleKey）
   * @param {boolean} [p.stats=true]       写 updateStats（模块统计）
   * @param {boolean} [p.difficulty=true]  写 recordQuestionAnswer（难度自适应）
   * @param {boolean} [p.wrongbook=true]   答错入错题本（云端 review_cards 复习卡）
   * @param {boolean} [p.points=true]      信用点（按模块配置）
   * @param {boolean} [p.checkin=false]    每日打卡（幂等，按日去重）
   * @param {Array|Function} [p.achievements] 成就检查项 [{type, value}] 或 (ctx) => [...]
   */
  function onQuestion(p) {
    if (!p || !p.module) return;
    var correct = !!p.correct;
    var moduleKey = p.moduleKey ||
      ((window.QuestionModel && typeof window.QuestionModel.getStatModuleKey === 'function')
        ? window.QuestionModel.getStatModuleKey(p.q || '') : 'general');

    // 1. 模块统计（bio 分 B/I/D 维数据源；题级全对才计 correct）
    if (p.stats !== false && typeof window.updateStats === 'function') {
      try { window.updateStats(moduleKey, correct); } catch (e) { /* 静默 */ }
    }

    // 2. 题目难度自适应统计
    if (p.difficulty !== false && typeof window.recordQuestionAnswer === 'function') {
      try {
        var qid = _qid(p.q);
        if (qid) window.recordQuestionAnswer(qid, correct, (p.q && p.q.difficulty) || 3);
      } catch (e) { /* 静默 */ }
    }

    // 3. 答错入错题本（云端 review_cards，FSRS 间隔重复；未登录在函数内短路）
    if (p.wrongbook !== false && !correct && typeof window.recordWrongAnswer === 'function') {
      try {
        var wp = window.recordWrongAnswer(p.q);
        if (wp && typeof wp.catch === 'function') wp.catch(function () {});
      } catch (e) { /* 静默 */ }
    }

    // 4. 信用点（按模块配置，daily-billion 有每日封顶）
    if (p.points !== false) _grantPoints(p.module, correct);

    // 5. 可选：每日打卡 / 成就（practice 与每日亿题历史上按题触发，保持口径）
    _runCheckin(p.checkin === true);
    _runAchievements(_evalAchievements(p.achievements, { module: p.module, correct: correct }));

    _emit('bq:question-submitted', { module: p.module, moduleKey: moduleKey, correct: correct });
  }

  /* ======================= 入口 2：一段刷题结束 ======================= */

  /**
   * 一段刷题结束时的全局落盘
   * @param {Object} p
   * @param {string} p.module       模块名（写入练习记录 module 字段）
   * @param {Array}  p.questions    逐题条目：
   *   { q?, questionId?, question, subject, concept?, userAnswers,
   *     score, totalScore, correctSubs?, totalSubs?, moduleKey?, correct }
   *   correct 缺省时按 correctSubs === totalSubs 且 > 0 推导。
   * @param {number} [p.duration]   本段时长（秒）
   * @param {boolean} [p.stats=true]    逐题写 updateStats（每题只调用 question() 的页面应传 false 防双计）
   * @param {boolean} [p.record=true]   saveRecord 练习记录
   * @param {boolean} [p.bio=true]      bio 分重算 + 云端同步
   * @param {boolean} [p.checkin=false] 每日打卡
   * @param {Array|Function} [p.achievements] 成就检查项（fn 收到 ctx={stats, bioScore}）
   * @returns {{correctCount:number, totalQuestions:number, score:number, totalScore:number, bioScore:number|null}}
   */
  function onFinish(p) {
    var out = { correctCount: 0, totalQuestions: 0, score: 0, totalScore: 0, bioScore: null };
    if (!p || !p.module || !Array.isArray(p.questions)) return out;

    // 逐题归一 + 汇总
    var items = p.questions.map(function (item) {
      var totalSubs = (typeof item.totalSubs === 'number') ? item.totalSubs : 0;
      var correctSubs = (typeof item.correctSubs === 'number')
        ? item.correctSubs : (typeof item.score === 'number' ? item.score : 0);
      var isCorrect = (typeof item.correct === 'boolean')
        ? item.correct : (totalSubs > 0 && correctSubs === totalSubs);
      var q = item.q || null;
      var moduleKey = item.moduleKey ||
        ((window.QuestionModel && typeof window.QuestionModel.getStatModuleKey === 'function')
          ? window.QuestionModel.getStatModuleKey(q || { subject: item.subject }) : 'general');

      if (isCorrect) out.correctCount++;
      out.score += (typeof item.score === 'number') ? item.score : correctSubs;
      out.totalScore += (typeof item.totalScore === 'number') ? item.totalScore : totalSubs;

      return {
        questionId: item.questionId || _qid(q) || '',
        qId: item.questionId || _qid(q) || '',
        question: item.question || (q && q.question) || '',
        subject: item.subject || (q && q.subject) || '',
        concept: item.concept || (q && q.concept) || '',
        userAnswers: item.userAnswers || {},
        score: (typeof item.score === 'number') ? item.score : correctSubs,
        correctSubs: correctSubs,
        totalSubs: totalSubs,
        moduleKey: moduleKey,
        _correct: isCorrect
      };
    });
    out.totalQuestions = items.length;

    // 1. 模块统计（question() 已逐题写过的页面传 stats:false 防双计）
    if (p.stats !== false && typeof window.updateStats === 'function') {
      items.forEach(function (it) {
        try { window.updateStats(it.moduleKey, it._correct); } catch (e) { /* 静默 */ }
      });
    }

    // 2. 练习记录（本地 KEYS.RECORDS + 双写云端 practice_records）
    // 空会话不落记录：0 题的空成绩单没有统计意义，还会污染记录列表
    if (p.record !== false && out.totalQuestions > 0 && typeof window.saveRecord === 'function') {
      try {
        window.saveRecord({
          totalQuestions: out.totalQuestions,
          correctCount: out.correctCount,
          score: out.score,
          totalScore: out.totalScore,
          duration: p.duration || 0,
          module: p.module,
          questions: items.map(function (it) {
            return {
              questionId: it.questionId, qId: it.qId, question: it.question,
              subject: it.subject, concept: it.concept, userAnswers: it.userAnswers,
              score: it.score, correctSubs: it.correctSubs, totalSubs: it.totalSubs
            };
          })
        });
      } catch (e) { /* 静默 */ }
    }

    // 3. bio 分重算 + 云端同步
    if (p.bio !== false) out.bioScore = _syncBioScore();

    // 4. 打卡 / 成就（ctx 附带最新统计与 bio 分，供函数型 achievements 使用）
    _runCheckin(p.checkin === true);
    _runAchievements(_evalAchievements(p.achievements, {
      stats: (typeof window.getStats === 'function') ? window.getStats() : null,
      bioScore: out.bioScore
    }));

    _emit('bq:session-finished', {
      module: p.module,
      correctCount: out.correctCount,
      totalQuestions: out.totalQuestions,
      bioScore: out.bioScore
    });

    return out;
  }

  /* ======================= 导出 ======================= */

  window.BioQuestSession = {
    question: onQuestion,
    finish: onFinish,
    // 测试/诊断用：暴露每日封顶配置
    MODULE_POINTS: MODULE_POINTS
  };
})();
