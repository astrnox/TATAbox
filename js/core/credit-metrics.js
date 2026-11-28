/**
 * ============================================================
 * TATABOX — 信用指数（CR）科学模型（共享纯函数）
 * ------------------------------------------------------------
 * 目标：替代「服务端点数衰减 / 本地线性衰减」双轨中缺乏科学依据的部分，
 * 提供可解释、有界、激励机制自洽的统一模型：
 *
 *   CR(t) = clamp( CR_BASE + Σ 行为增量·近因权重 − Σ 违规·近因权重, 0, CAP )
 *
 *   · 近因权重  w(age) = e^(−κ·ageDays)，κ=0.03（行为）→ 半衰期 ≈ 23 天；
 *     违规用 κ=0.099 → 半衰期 ≈ 7 天，改过自新的代价更合理；
 *   · CR_BASE = 60 常驻：基础信任不随时间蒸发（不惩罚「不活跃但无违规」）；
 *   · 高影响操作（评论/发帖/举报）只设门槛、不再扣信用——信用衡量信任，
 *     消费不该永久侵蚀信任（此前的 COSTS 让发 50 帖直接归零且无法恢复）；
 *   · 上限 CAP = 200，等级阈值 0/20/40/70/100/130：100 不再是天花板，
 *     活跃用户有继续上升的空间，榜单才有区分度。
 *
 * 同时提供旧模型兼容函数 legacyDecayed（仅加保底，用于存量数据结构迁移前的
 * 服务端读写的平滑改进）。
 * ============================================================
 */
(function (g) {
  'use strict';

  var DAY = 24 * 60 * 60 * 1000;

  var CR_V2 = {
    BASE: 60,           // 新用户基础信任（常驻，不衰减）
    KAPPA: 0.03,        // 行为增量的近因衰减速率/天（半衰期 ≈ 23 天）
    KAPPA_PENALTY: 0.099, // 违规的近因衰减速率/天（半衰期 ≈ 7 天，可更快改过自新）
    CAP: 200,           // 上限
    FLOOR: 0,           // 下限
    // 符合社区期望的行为 → 单次增量（日常行为有每日上限）
    GAINS: {
      DAILY_LOGIN: 1,            // 每日打卡/登录
      PRACTICE_FULL: 0.03,       // 答题全对 1 题（PRACTICE_DAILY_CAP/天 封顶）
      PRACTICE_DAILY_CAP: 3,     // 答题奖励每日封顶
      FEEDBACK: 5,               // 有效建议反馈 / 有效举报
      POST: 4,                   // 发布优质内容
      COMMENT: 1                 // 有效评论
    },
    // 违规 → 扣减（近因淡出更快，意味可改过自新）
    PENALTIES: {
      UNCIVIL_POST: 6,
      UNCIVIL_COMMENT: 4,
      SPAM: 8,
      INVALID_REPORT: 2,
      INVALID_REPORT_REPEAT: 4
    },
    // 高影响操作只设门槛，不再永久扣信用（信用 ≠ 消费）
    COSTS: {
      COMMENT: 0,
      POST: 0,
      REPORT: 0,
      SPECIAL: 0
    },
    // 信用等级：100 不再是顶档，让活跃用户有上升空间
    LEVELS: [
      { min: 0,   label: '不受信任', title: '不受信任', color: '#c0553a' },
      { min: 20,  label: '极低信任', title: '极低信任', color: '#d47030' },
      { min: 40,  label: '有限信任', title: '有限信任', color: '#c49b30' },
      { min: 60,  label: '基本信任', title: '基本信任', color: '#5a7d5c' },
      { min: 100, label: '高度信任', title: '高度信任', color: '#3a8c5c' },
      { min: 130, label: '极高信任', title: '极高信任', color: '#ffd700' }
    ]
  };

  function ageDays(ts, now) {
    var age = now - (typeof ts === 'number' && isFinite(ts) ? ts : now);
    return Math.max(0, age / DAY);
  }

  /**
   * v2 信用模型：按流水（行为/违规/消费）计算当前信用
   * @param {Object} ledger - { actions:[{delta,ts}], penalties:[{amount,ts}], spends:number 或 [{cost,ts}], base?, kappa?, cap? }
   * @param {number} [now]
   * @returns {{score:number, level:Object, parts:{base:number,gains:number,penalties:number,spends:number}, detail:{actions:Array,penalties:Array}}}
   */
  function computeCreditScore(ledger, now) {
    ledger = ledger || {};
    now = (typeof now === 'number' && isFinite(now)) ? now : Date.now();
    var kappa = (typeof ledger.kappa === 'number' && ledger.kappa > 0) ? ledger.kappa : CR_V2.KAPPA;
    var kappaPenalty = (typeof ledger.kappaPenalty === 'number' && ledger.kappaPenalty > 0)
      ? ledger.kappaPenalty : CR_V2.KAPPA_PENALTY;
    var cap = (typeof ledger.cap === 'number' && ledger.cap > 0) ? ledger.cap : CR_V2.CAP;
    var base = (typeof ledger.base === 'number' && isFinite(ledger.base)) ? ledger.base : CR_V2.BASE;

    var gains = 0;
    var acts = Array.isArray(ledger.actions) ? ledger.actions : [];
    var detail = [];
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (!a || typeof a.delta !== 'number' || !isFinite(a.delta)) continue;
      var w = Math.exp(-kappa * ageDays(a.ts, now));
      var contrib = a.delta * w;
      gains += contrib;
      detail.push({ type: 'gain', delta: a.delta, ts: a.ts || now, weight: w, contrib: contrib });
    }

    var penalties = 0;
    var pens = Array.isArray(ledger.penalties) ? ledger.penalties : [];
    for (var j = 0; j < pens.length; j++) {
      var p = pens[j];
      if (!p || typeof p.amount !== 'number' || !isFinite(p.amount)) continue;
      var pw = Math.exp(-kappaPenalty * ageDays(p.ts, now));
      var pc = Math.abs(p.amount) * pw;
      penalties += pc;
      detail.push({ type: 'penalty', amount: Math.abs(p.amount), ts: p.ts || now, weight: pw, contrib: pc });
    }

    var spends = 0;
    if (Array.isArray(ledger.spends)) {
      for (var k = 0; k < ledger.spends.length; k++) {
        var s = ledger.spends[k];
        if (s && typeof s === 'number' && isFinite(s) && s > 0) spends += s;
        else if (s && typeof s === 'object' && typeof s.cost === 'number' && s.cost > 0) spends += s.cost;
      }
    } else if (typeof ledger.spends === 'number' && isFinite(ledger.spends) && ledger.spends > 0) {
      spends = ledger.spends;
    }

    var score = Math.max(CR_V2.FLOOR, Math.min(cap, base + gains - penalties));
    // 保留与 getPointsLevel 一致的 1 位小数对外呈现，内部用精确值判级
    score = Math.round(score * 10) / 10;
    var level = getCreditLevel(score);

    return {
      score: score,
      level: level,
      parts: {
        base: base,
        gains: Math.round(gains * 100) / 100,
        penalties: Math.round(penalties * 100) / 100,
        spends: spends
      },
      detail: detail
    };
  }

  /**
   * 由信用指数推导等级（阈值表与旧视觉一致，兼容调用方）
   */
  function getCreditLevel(scoreValue) {
    var total = (typeof scoreValue === 'number' && isFinite(scoreValue)) ? Math.max(0, scoreValue) : 0;
    var levels = CR_V2.LEVELS;
    var current = levels[0];
    var next = null;
    for (var i = 0; i < levels.length; i++) {
      var lv = levels[i];
      if (total >= lv.min) { current = lv; next = levels[i + 1] || null; }
    }
    var curMin = current.min;
    var nxtMin = next ? next.min : curMin;
    var span = Math.max(1, nxtMin - curMin);
    var progress = next ? Math.min(1, Math.max(0, (total - curMin) / span)) : 1;
    return {
      label: current.label,
      title: current.title,
      color: current.color,
      icon: current.icon,
      min: curMin,
      nextAt: next ? nxtMin : null,
      progress: Math.round(progress * 1000) / 1000
    };
  }

  /**
   * 旧模型兼容：指数衰减 + 保底（修复「信用无条件随时间归零」的缺陷）。
   * 用于存量 profiles.points 读写前的平滑改进；新账目建议直接走 computeCreditScore。
   * @param {number} current - 当前存储值
   * @param {number|string} [lastUpdatedAt] - 上次更新时间（时间戳或 ISO 字符串）
   * @param {number} [now]
   */
  function legacyDecayed(current, lastUpdatedAt, now) {
    if (typeof current !== 'number' || !isFinite(current)) return 0;
    now = (typeof now === 'number' && isFinite(now)) ? now : Date.now();
    var last = lastUpdatedAt ? (new Date(lastUpdatedAt).getTime() || 0) : 0;
    if (!last) return current;
    var deltaDays = (now - last) / DAY;
    if (deltaDays <= 0) return current;
    var value = current * Math.exp(-0.01005 * deltaDays);
    // 保底 10：历史信任不因不活跃而完全清零（违规/消费按实际扣减）
    return Math.max(10, Math.round(value * 10) / 10);
  }

  /* 模型解释元数据（透明化展示用） */
  var CR_EXPLAIN = {
    title: '信用指数 CR（0-200，基础 60）',
    formula: 'CR = clamp( 60 + Σ 行为×近因权重 − Σ 违规×近因权重, 0, 200 )；消费只设门槛，不扣信用',
    nearCause: '行为半衰期约 23 天（κ=0.03）；违规半衰期约 7 天（κ=0.099），一次违规不会长期压死信用',
    baseNote: '基础信任 60 常驻、不随时间蒸发；只有违规会扣减，且会较快淡出',
    gains: CR_V2.GAINS,
    penalties: CR_V2.PENALTIES,
    costs: CR_V2.COSTS,
    levels: CR_V2.LEVELS
  };

  g.computeCreditScore = computeCreditScore;
  g.getCreditLevel = getCreditLevel;
  g.legacyDecayed = legacyDecayed;
  g.CR_V2 = CR_V2;
  g.CR_EXPLAIN = CR_EXPLAIN;
})(typeof window !== 'undefined' ? window : globalThis);