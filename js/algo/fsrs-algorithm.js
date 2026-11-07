/**
 * ============================================================
 * TATABOX - FSRS 间隔重复算法模块 (v2.0)
 *
 * 基于 ts-fsrs (MIT License, Copyright (c) 2026 Open Spaced Repetition)
 * Source: https://github.com/open-spaced-repetition/ts-fsrs
 *
 * 本文件是 ts-fsrs 的兼容包装层，维持 TATABOX 原有 window.FSRS API
 * 不再包含自研算法实现，也不包含 SM-2 回退分支
 * ============================================================
 */

(function () {
  'use strict';

  // ts-fsrs UMD 加载后会设置 window.FSRS = { Rating, State, fsrs, createEmptyCard, ... }
  // 本包装层在此基础上追加 TATABOX 专用 API
  var TS = window.FSRS;
  if (!TS || typeof TS.fsrs !== 'function') {
    console.error('[FSRS] ts-fsrs UMD 未加载！请检查 index.html 是否引入 js/vendor/ts-fsrs.umd.min.js');
    // 不再回退到 SM-2 — 宁可报错也不使用虚假的间隔重复
    return;
  }


  // TATABOX 原有 RATING 常量（与 ts-fsrs Rating 值一致：1=Again, 2=Hard, 3=Good, 4=Easy）
  var RATING = {
    AGAIN: TS.Rating.Again,
    HARD: TS.Rating.Hard,
    GOOD: TS.Rating.Good,
    EASY: TS.Rating.Easy
  };

  // 默认参数（从 ts-fsrs 默认配置派生）
  var DEFAULT_PARAMS = {
    requestRetention: 0.9,
    maximumInterval: 36500,
    easyBonus: 1.3
  };

  var FSRS_MIN_STABILITY = 0.1;               // 卡片稳定性下限，避免极小值导致调度异常
  var FSRS_DEFAULT_DIFFICULTY = 5;            // 新卡/缺失难度默认值（ts-fsrs 难度中点）
  var FSRS_DEFAULT_FORECAST_DAYS = 30;         // 默认预测复习曲线天数
  var FSRS_DUE_PRIORITY_OVERDUE_WEIGHT = 10;  // 到期优先级：过期天数权重
  var FSRS_DUE_PRIORITY_LAPSE_WEIGHT = 5;     // 到期优先级：遗忘次数权重


  var _scheduler = null;

  function getScheduler() {
    if (!_scheduler) {
      _scheduler = TS.fsrs({
        request_retention: DEFAULT_PARAMS.requestRetention,
        maximum_interval: DEFAULT_PARAMS.maximumInterval,
        enable_fuzz: true
      });
    }
    return _scheduler;
  }


  /**
   * 将 TATABOX 旧格式卡片状态转换为 ts-fsrs Card 对象
   * @param {Object} state - TATABOX 格式 { stability, difficulty, lastReview, repetitions, lapses, dueDate }
   * @returns {Object} ts-fsrs Card
   */
  function toTsCard(state) {
    if (!state) return TS.createEmptyCard();

    var reps = state.repetitions || 0;
    var now = new Date();

    // 判断卡片状态：New(0) / Learning(1) / Review(2) / Relearning(3)
    var cardState;
    if (reps === 0) {
      cardState = TS.State.New;
    } else if (state.state !== undefined) {
      cardState = state.state;
    } else {
      cardState = TS.State.Review;
    }

    return {
      due: state.dueDate ? new Date(state.dueDate) : now,
      stability: Math.max(state.stability || 0, FSRS_MIN_STABILITY),
      difficulty: state.difficulty || 0,
      elapsed_days: 0,
      scheduled_days: state.interval || 0,
      reps: reps,
      lapses: state.lapses || 0,
      state: cardState,
      last_review: state.lastReview ? new Date(state.lastReview) : null
    };
  }

  /**
   * 将 ts-fsrs Card + log 转换回 TATABOX 格式
   * @param {Object} tsCard - ts-fsrs Card 对象
   * @param {Object} log - ts-fsrs log 对象（可选）
   * @returns {Object} TATABOX 格式
   */
  function fromTsCard(tsCard, log) {
    var scheduler = getScheduler();
    var now = new Date();
    var retrievability = 0;

    try {
      var r = scheduler.get_retrievability(tsCard, now, false);
      retrievability = typeof r === 'number' ? r : parseFloat(r) || 0;
    } catch (e) {
      retrievability = 0;
    }

    return {
      stability: tsCard.stability || 0,
      difficulty: tsCard.difficulty != null ? tsCard.difficulty : FSRS_DEFAULT_DIFFICULTY,
      retrievability: retrievability,
      interval: tsCard.scheduled_days || 0,
      dueDate: tsCard.due ? tsCard.due.getTime() : now.getTime(),
      lastReview: tsCard.last_review ? tsCard.last_review.getTime() : now.getTime(),
      repetitions: tsCard.reps || 0,
      lapses: tsCard.lapses || 0,
      state: tsCard.state,
      version: 'ts-fsrs'
    };
  }


  /**
   * 主调度函数：根据当前卡片状态和用户评分，计算下次复习时间
   * @param {Object} cardState - TATABOX 格式卡片状态
   * @param {number} rating - 评分 (1=Again, 2=Hard, 3=Good, 4=Easy)
   * @param {number} nowTimestamp - 当前时间戳 (ms)
   * @returns {Object} 更新后的卡片状态（TATABOX 格式）
   */
  function fsrsSchedule(cardState, rating, nowTimestamp) {
    var scheduler = getScheduler();
    var now = new Date(nowTimestamp || Date.now());

    // 转换为 ts-fsrs 卡片
    var tsCard = toTsCard(cardState);

    // 如果是首次复习（reps=0），需要先初始化卡片
    if (tsCard.reps === 0 && tsCard.state === TS.State.New) {
      // 使用 repeat 获取所有可能的预览，然后取用户选择的评分
      var preview = scheduler.repeat(tsCard, now);
      var result = preview[rating] || preview[TS.Rating.Good];
      return fromTsCard(result.card, result.log);
    }

    // 非首次复习：使用 next 直接调度
    var result = scheduler.next(tsCard, now, rating);
    return fromTsCard(result.card, result.log);
  }


  var STORAGE_KEY = 'tatabox_fsrs_cards';

  function loadCardStates() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[FSRS] 加载失败:', e);
      return {};
    }
  }

  function saveCardStates(states) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
    } catch (e) {
      console.warn('[FSRS] 保存失败:', e);
    }
    // Issue #13：异步把复习进度纳入本地进度快照 + 防抖云端同步（非阻塞，缺省跳过）
    if (typeof window.saveProgress === 'function') {
      try { window.saveProgress('fsrs_cards', states); } catch (e) {}
    }
  }

  function getCardState(cardId) {
    var states = loadCardStates();
    return states[cardId] || {
      stability: 0,
      difficulty: FSRS_DEFAULT_DIFFICULTY,
      lastReview: 0,
      repetitions: 0,
      lapses: 0,
      dueDate: Date.now()
    };
  }

  function reviewCard(cardId, rating) {
    var states = loadCardStates();
    var current = states[cardId] || {
      stability: 0,
      difficulty: FSRS_DEFAULT_DIFFICULTY,
      lastReview: 0,
      repetitions: 0,
      lapses: 0,
      dueDate: Date.now()
    };

    var newState = fsrsSchedule(current, rating, Date.now());
    states[cardId] = newState;
    saveCardStates(states);
    return newState;
  }


  function getDueCards(cardIds, nowTimestamp) {
    var now = nowTimestamp || Date.now();
    var states = loadCardStates();
    var due = [];
    var newCards = [];

    cardIds.forEach(function (cardId) {
      var state = states[cardId];
      if (!state || state.repetitions === 0) {
        newCards.push(cardId);
      } else if (state.dueDate <= now) {
        var overdueDays = Math.floor((now - state.dueDate) / (24 * 60 * 60 * 1000));
        due.push({
          id: cardId,
          state: state,
          overdueDays: overdueDays,
          priority: overdueDays * FSRS_DUE_PRIORITY_OVERDUE_WEIGHT + (state.lapses || 0) * FSRS_DUE_PRIORITY_LAPSE_WEIGHT
        });
      }
    });

    // 按优先级排序（过期越久、遗忘次数越多越优先）
    due.sort(function (a, b) { return b.priority - a.priority; });

    return {
      due: due,
      newCards: newCards
    };
  }


  function getStatistics(cardIds) {
    var states = loadCardStates();
    var total = cardIds.length;
    var learned = 0;
    var dueToday = 0;
    var totalStability = 0;
    var totalDifficulty = 0;
    var now = Date.now();

    cardIds.forEach(function (id) {
      var s = states[id];
      if (s && s.repetitions > 0) {
        learned++;
        totalStability += s.stability || 0;
        totalDifficulty += s.difficulty || 0;
        if (s.dueDate <= now) dueToday++;
      }
    });

    return {
      total: total,
      learned: learned,
      learning: total - learned,
      dueToday: dueToday,
      // 保持数值类型（调用方可能参与运算；toFixed 会返回字符串导致拼接错误）
      avgStability: learned > 0 ? Math.round((totalStability / learned) * 10) / 10 : 0,
      avgDifficulty: learned > 0 ? Math.round((totalDifficulty / learned) * 10) / 10 : 0,
      retentionRate: Math.round(DEFAULT_PARAMS.requestRetention * 100)
    };
  }


  function generateForecast(cardIds, daysAhead) {
    daysAhead = daysAhead || FSRS_DEFAULT_FORECAST_DAYS;
    var states = loadCardStates();
    var forecast = [];

    for (var d = 1; d <= daysAhead; d++) {
      var count = 0;

      cardIds.forEach(function (id) {
        var s = states[id];
        if (!s || !s.stability) return;

        // 按「本地日初」对齐到期日与今天，避免毫秒级精度把「明天到期且不足 24h」
        // 的卡误判为今天（原实现用裸毫秒差，存在浮点边界 bug）。
        var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        var dueStart = new Date(s.dueDate); dueStart.setHours(0, 0, 0, 0);
        var daySpan = Math.round((dueStart.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));
        // 今天到期（0）或已过期（负）统一归入第 1 天复习桶；明天到期入第 2 桶…
        var bucket = daySpan <= 0 ? 1 : daySpan + 1;
        if (bucket === d) count++;
      });

      forecast.push({ day: d, count: count });
    }

    return forecast;
  }


  // 保留 ts-fsrs 原始导出（Rating, State, fsrs, createEmptyCard 等）
  // 追加 TATABOX 兼容 API
  TS.RATING = RATING;
  TS.params = DEFAULT_PARAMS;
  TS.schedule = fsrsSchedule;
  TS.reviewCard = reviewCard;
  TS.getCardState = getCardState;
  TS.getDueCards = getDueCards;
  TS.getStatistics = getStatistics;
  TS.generateForecast = generateForecast;

  // SM-2 兼容接口（供旧代码调用，内部已完全使用 ts-fsrs）
  TS.calculateNextReview = function (easeFactor, interval, performanceRating) {
    var rating;
    if (performanceRating < 2) rating = RATING.AGAIN;
    else if (performanceRating < 3) rating = RATING.HARD;
    else if (performanceRating < 4) rating = RATING.GOOD;
    else rating = RATING.EASY;

    var state = {
      stability: interval / 2 || 1,
      difficulty: 10 - easeFactor * 2,
      lastReview: Date.now(),
      repetitions: 1
    };

    var newState = fsrsSchedule(state, rating, Date.now());
    return {
      nextInterval: newState.interval,
      easeFactor: (10 - newState.difficulty) / 2,
      dueDate: newState.dueDate
    };
  };

  // 标记加载成功
  TS._loaded = true;
  TS._engine = 'ts-fsrs';

  console.log('[FSRS] ts-fsrs 引擎已就绪 (window.FSRS._loaded = true)');

})();
