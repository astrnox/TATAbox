/**
 * ============================================================
 * TATABOX — Anki 风格间隔重复知识卡片系统
 * 基于 ts-fsrs (FSRS-5) 算法的 spaced repetition flashcards
 * ============================================================
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'anki_progress_v2'; // v2: FSRS-4.5 + BKT
  var BKT_STORAGE_KEY = 'tatabox_bkt_v1';
  var USER_CARD_KEY = 'tatabox_user_cards_v1'; // 错题本「生成卡片」写入的用户牌组
  var USER_DECK_NAME = '我的错题卡';
  var NEW_CARDS_PER_DAY = 20;
  var DEFAULT_EASE_FACTOR = 2.5;
  var MIN_EASE_FACTOR = 1.3;

  // BKT (Bayesian Knowledge Tracing) 默认参数
  var BKT_PARAMS = {
    pL0: 0.25,   // 初始掌握概率
    pT: 0.30,    // 学习概率（未掌握时通过练习掌握）
    pG: 0.20,    // 猜测概率（未掌握但猜对）
    pS: 0.10     // 失误概率（掌握但答错）
  };

  var KData = { 分类: [] };
  var currentDeckIndex = -1;       // 当前选中的牌组（分类）索引
  var sessionState = null;         // 当前学习会话状态
  var isFlipped = false;           // 卡片是否已翻转

  /**
   * @typedef {Object} CardProgress
   * @property {number} easeFactor - 难度因子 (默认 2.5)
   * @property {number} interval - 间隔天数
   * @property {number} repetitions - 重复次数
   * @property {number} dueDate - 到期时间戳 (ms)
   */

  /**
   * @typedef {Object} DeckProgress
   * @property {Object.<string, CardProgress>} cards - 卡片进度 {cardIndex: CardProgress}
   * @property {number} lastReview - 上次复习时间戳
   */

  /**
   * @typedef {Object} SessionState
   * @property {Array} reviewQueue - 待复习队列 [{cardIndex, card, isNew}]
   * @property {number} reviewedCount - 已复习数
   * @property {number} newCardsLearned - 今日新学卡片数
   * @property {number} totalDue - 总到期数
   * @property {number} totalNew - 总新卡数
   */


  /**
   * 加载所有牌组的进度数据
   * @returns {Object.<string, DeckProgress>}
   */
  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('[Anki] 加载进度失败:', e);
    }
    return {};
  }

  /**
   * 保存进度到 localStorage
   * @param {Object.<string, DeckProgress>} progress
   */
  function saveProgress(progress) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
      console.warn('[Anki] 保存进度失败:', e);
    }
  }

  /**
   * 获取或初始化某个牌组的进度
   * @param {string} deckId
   * @param {number} totalCards - 该牌组总卡片数
   * @returns {DeckProgress}
   */
  function getOrCreateDeckProgress(deckId, totalCards) {
    var allProgress = loadProgress();
    if (!allProgress[deckId]) {
      allProgress[deckId] = {
        cards: {},
        lastReview: Date.now()
      };
      saveProgress(allProgress);
    }
    return allProgress[deckId];
  }


  /**
   * 将 UI 评分映射到 FSRS 评分：again->1, good->3, easy->4
   */
  function mapRatingToFSRS(rating) {
    if (typeof window.FSRS !== 'undefined' && window.FSRS.RATING) {
      switch (rating) {
        case 'again': return window.FSRS.RATING.AGAIN;
        case 'hard': return window.FSRS.RATING.HARD;
        case 'good': return window.FSRS.RATING.GOOD;
        case 'easy': return window.FSRS.RATING.EASY;
      }
    }
    // 兜底
    return { again: 1, hard: 2, good: 3, easy: 4 }[rating] || 3;
  }

  /**
   * 应用 FSRS-4.5 算法更新卡片调度
   * @param {Object} cardProgress - 当前卡片进度
   * @param {'again'|'good'|'easy'} rating - 用户评分
   * @returns {Object} 更新后的进度
   */
  function applyFSRS(cardProgress, rating) {
    var fsrsRating = mapRatingToFSRS(rating);
    var state = {
      stability: cardProgress.stability || 0,
      difficulty: cardProgress.difficulty || 5,
      lastReview: cardProgress.lastReview || 0,
      repetitions: cardProgress.repetitions || 0,
      lapses: cardProgress.lapses || 0
    };

    // ts-fsrs 引擎在 index.html 首屏加载，window.FSRS.schedule 一定可用（P0-1 已修复）
    var newState = window.FSRS.schedule(state, fsrsRating, Date.now());
    return {
      stability: newState.stability,
      difficulty: newState.difficulty,
      retrievability: newState.retrievability,
      interval: newState.interval,
      dueDate: newState.dueDate,
      lastReview: newState.lastReview,
      repetitions: newState.repetitions,
      lapses: newState.lapses,
      easeFactor: cardProgress.easeFactor || DEFAULT_EASE_FACTOR,
      version: 'ts-fsrs'
    };
  }


  function loadBKT() {
    try {
      var raw = localStorage.getItem(BKT_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('[BKT] 加载失败:', e);
    }
    return {};
  }

  function saveBKT(state) {
    try {
      localStorage.setItem(BKT_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[BKT] 保存失败:', e);
    }
  }

  function getConceptMastery(concept) {
    var state = loadBKT();
    return state[concept] || BKT_PARAMS.pL0;
  }

  /**
   * 根据答题结果更新某概念的 BKT 掌握概率
   * @param {string} concept - 概念名
   * @param {boolean} isCorrect - 是否答对
   * @returns {number} 更新后的掌握概率
   */
  function updateBKT(concept, isCorrect) {
    if (!concept) return BKT_PARAMS.pL0;
    var state = loadBKT();
    var pL = state[concept] || BKT_PARAMS.pL0;
    var pT = BKT_PARAMS.pT;
    var pG = BKT_PARAMS.pG;
    var pS = BKT_PARAMS.pS;

    var pLC, pLGivenEvidence;
    if (isCorrect) {
      // P(L|Correct) = P(L)(1-P(S)) / [P(L)(1-P(S)) + (1-P(L))P(G)]
      pLC = pL * (1 - pS);
      pLGivenEvidence = pLC / (pLC + (1 - pL) * pG);
    } else {
      // P(L|Incorrect) = P(L)P(S) / [P(L)P(S) + (1-P(L))(1-P(G))]
      pLC = pL * pS;
      pLGivenEvidence = pLC / (pLC + (1 - pL) * (1 - pG));
    }
    // 加上学习转移概率
    var newPL = pLGivenEvidence + (1 - pLGivenEvidence) * pT;
    newPL = Math.min(Math.max(newPL, 0.01), 0.99);

    state[concept] = newPL;
    saveBKT(state);
    return newPL;
  }


  /**
   * 合并错题本生成的本地卡片为「我的错题卡」牌组。
   * 固定在数组末尾，避免插入前面的牌组导致 deck_<idx> 的复习进度错位。
   */
  function mergeUserDeck() {
    var list;
    try {
      list = JSON.parse(localStorage.getItem(USER_CARD_KEY) || '[]');
    } catch (e) {
      return;
    }
    if (!Array.isArray(list) || !list.length) return;
    var cards = list.filter(function (c) {
      return c && c.question;
    }).map(function (c) {
      return {
        question: String(c.question),
        answer: String(c.answer || ''),
        tags: Array.isArray(c.tags) ? c.tags : [],
        concept: (c.tags && c.tags[0]) || ''
      };
    });
    if (!cards.length) return;
    if (!KData.分类) KData.分类 = [];
    KData.分类.push({ name: USER_DECK_NAME, id: 'user_wrong', cards: cards });
  }

  async function loadData() {
    // 优先从 Supabase 加载卡片数据
    try {
      var sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
      if (sb) {
        var result = await sb.from('cards').select('*').limit(500);
        if (!result.error && result.data && result.data.length > 0) {
          // 将 Supabase 数据转换为前端格式
          var categories = {};
          result.data.forEach(function (card) {
            var cat = card.category || '未分类';
            if (!categories[cat]) categories[cat] = { name: cat, cards: [] };
            categories[cat].cards.push({
              question: card.question || card.front || '',
              answer: card.answer || card.back || '',
              tags: card.tags || []
            });
          });
          KData = { 分类: Object.values(categories) };
          mergeUserDeck();
          initApp();
          return;
        }
      }
    } catch (e) {
      // Supabase 不可用，回退到本地 JSON
    }
    try {
      var res = await fetch('data/cards.json');
      KData = await res.json();
      mergeUserDeck();
      initApp();
    } catch (err) {
      console.error('[Anki] 加载数据失败', err);
      showError('无法加载卡片数据，请检查网络连接');
    }
  }


  function initApp() {
    renderDeckSelector();
    // 默认选中第一个有卡片的牌组
    if (KData.分类 && KData.分类.length > 0) {
      // v4.0 四向联动：若其他模块传递了 focus 概念，匹配对应牌组
      var focusConcept = null;
      try {
        focusConcept = sessionStorage.getItem('tatabox_card_focus');
        if (focusConcept) sessionStorage.removeItem('tatabox_card_focus');
      } catch (e) {}
      var matchedIdx = -1;
      if (focusConcept) {
        KData.分类.forEach(function (cat, idx) {
          if (cat && (cat.name === focusConcept || cat.title === focusConcept ||
              (cat.subject && cat.subject === focusConcept))) {
            matchedIdx = idx;
          }
        });
      }
      selectDeck(matchedIdx >= 0 ? matchedIdx : 0);
    }
  }

  /**
   * 渲染牌组选择器（带统计信息）
   */
  function renderDeckSelector() {
    var container = document.getElementById('anki-deck-selector');
    if (!container) return;

    var now = Date.now();
    var html = '';

    KData.分类.forEach(function (category, idx) {
      var deckId = 'deck_' + idx;
      var deckProg = loadProgress()[deckId];
      var cards = category.cards || [];
      var total = cards.length;

      var dueCount = 0;
      var newCount = 0;
      var learnedCount = 0;

      cards.forEach(function (_, cardIdx) {
        var cardKey = String(cardIdx);
        if (deckProg && deckProg.cards && deckProg.cards[cardKey]) {
          var cp = deckProg.cards[cardKey];
          if (cp.dueDate <= now) {
            dueCount++;
          }
          if (cp.repetitions > 0) {
            learnedCount++;
          }
        } else {
          newCount++;
        }
      });

      html += '<button class="anki-deck-btn' +
        (idx === currentDeckIndex ? ' active' : '') +
        '" data-deck-idx="' + idx + '">' +
        '<span class="anki-deck-name">' + escapeHtml(category.name) + '</span>' +
        '<span class="anki-deck-stats">' +
        '<span class="anki-stat-due">' + dueCount + ' 待复习</span>' +
        '<span class="anki-stat-new">' + newCount + ' 新</span>' +
        '<span class="anki-stat-total">/ ' + total + '</span>' +
        '</span>' +
        '</button>';
    });

    container.innerHTML = html;

    container.querySelectorAll('.anki-deck-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectDeck(parseInt(btn.dataset.deckIdx));
      });
    });
  }

  /**
   * 选择牌组并开始学习会话
   * @param {number} deckIdx
   */
  function selectDeck(deckIdx) {
    currentDeckIndex = deckIdx;
    isFlipped = false;

    // 更新牌组按钮激活状态
    document.querySelectorAll('.anki-deck-btn').forEach(function (btn, i) {
      btn.classList.toggle('active', i === deckIdx);
    });

    buildSession(deckIdx);
  }

  /**
   * 构建学习会话队列
   * @param {number} deckIdx
   */
  function buildSession(deckIdx) {
    var category = KData.分类[deckIdx];
    if (!category || !category.cards || category.cards.length === 0) {
      showEmpty('该分类暂无卡片');
      return;
    }

    var deckId = 'deck_' + deckIdx;
    var deckProg = getOrCreateDeckProgress(deckId, category.cards.length);
    var cards = category.cards;
    var now = Date.now();

    var reviewQueue = [];  // 到期复习队列
    var newQueue = [];     // 新卡队列
    var todayNewLearned = 0; // 今日已学新卡数（从进度中计算）

    // 统计今日已学的新卡
    var todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    var todayStartMs = todayStart.getTime();

    cards.forEach(function (card, cardIdx) {
      var cardKey = String(cardIdx);
      var cp = (deckProg.cards && deckProg.cards[cardKey]) || null;

      if (cp && cp.repetitions > 0) {
        // 已学过的卡片 — 检查是否到期
        if (cp.dueDate <= now) {
          reviewQueue.push({ cardIndex: cardIdx, card: card, isNew: false });
        }
      } else {
        // 新卡片
        // 检查是否今天已经学过（dueDate 在今天范围内且 reps==0 表示今天学过但 again 了）
        if (cp && cp.dueDate > todayStartMs && cp.repetitions === 0) {
          todayNewLearned++;
        }
        newQueue.push({ cardIndex: cardIdx, card: card, isNew: true });
      }
    });

    // 计算还能学多少新卡
    var remainingNewSlots = Math.max(0, NEW_CARDS_PER_DAY - todayNewLearned);

    // 合并队列：先复习，后新学
    var finalQueue = reviewQueue.concat(newQueue.slice(0, remainingNewSlots));

    sessionState = {
      reviewQueue: finalQueue,
      queuePosition: 0,
      reviewedCount: 0,
      newCardsLearned: todayNewLearned,
      totalDue: reviewQueue.length,
      totalNew: Math.min(newQueue.length, remainingNewSlots),
      totalInSession: finalQueue.length,
      deckId: deckId,
      deckProg: deckProg
    };

    updateProgressBar();
    renderCurrentCard(true);
  }

  /**
   * 渲染当前卡片
   * @param {boolean} animate - 是否使用入场动画
   */
  function renderCurrentCard(animate) {
    if (!sessionState || sessionState.queuePosition >= sessionState.reviewQueue.length) {
      showSessionComplete();
      return;
    }

    var currentItem = sessionState.reviewQueue[sessionState.queuePosition];
    var card = currentItem.card;
    var category = KData.分类[currentDeckIndex];

    var cardEl = document.getElementById('anki-card');

    if (animate && cardEl) {
      cardEl.classList.remove('anki-card-enter');
      void cardEl.offsetWidth; // force reflow
      cardEl.classList.add('anki-card-enter');
    }

    // 正面内容
    var frontEl = document.getElementById('anki-front');
    if (frontEl) {
      frontEl.innerHTML =
        '<span class="anki-card-category">' + escapeHtml(category.name) + '</span>' +
        '<div class="anki-card-number">' + (sessionState.queuePosition + 1) + ' / ' + sessionState.totalInSession + '</div>' +
        '<div class="anki-question-text">' + escapeHtml(card.question).replace(/\n/g, '<br>') + '</div>' +
        '<button class="anki-flip-btn" id="anki-flip-btn">显示答案</button>';

      // 内联 onclick 作为备份，确保即使事件委托失败也能翻转
      var flipBtn = frontEl.querySelector('.anki-flip-btn');
      if (flipBtn) {
        flipBtn.onclick = function (e) {
          e.stopPropagation();
          e.preventDefault();
          flipCard();
          return false;
        };
      }
    }

    // 背面内容
    var backEl = document.getElementById('anki-back');
    if (backEl) {
      // BKT 掌握度可视化
      var concept = card.concept || (card.tags && card.tags[0]) || category.name;
      var mastery = getConceptMastery(concept);
      var masteryPct = Math.round(mastery * 100);
      var masteryColor = mastery >= 0.8 ? 'var(--color-success)' : (mastery >= 0.5 ? 'var(--color-warning)' : 'var(--color-error)');
      var masteryHtml = '<div class="anki-bkt-bar bq-mb-14">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.76rem;color:var(--text-muted);margin-bottom:6px;">' +
        '<span>概念掌握度 · ' + escapeHtml(concept) + '</span>' +
        '<span>' + masteryPct + '%</span>' +
        '</div>' +
        '<div style="height:6px;background:var(--border-default);border-radius:2px;overflow:hidden;">' +
        '<div style="height:100%;width:' + masteryPct + '%;background:' + masteryColor + ';border-radius:2px;transition:width 0.4s ease;"></div>' +
        '</div>' +
        '</div>';

      backEl.innerHTML =
        '<div class="anki-answer-text">' +
        escapeHtml(card.answer).replace(/\n/g, '<br>') +
        '</div>' +
        masteryHtml +
        '<div class="anki-rating-bar">' +
        '<button class="anki-rate-btn anki-rate-again" data-rate="again" data-on=\'["_ankiHandleRate","again"]\' data-stop-propagation data-prevent-default>再来一次</button>' +
        '<button class="anki-rate-btn anki-rate-hard" data-rate="hard" data-on=\'["_ankiHandleRate","hard"]\' data-stop-propagation data-prevent-default>困难</button>' +
        '<button class="anki-rate-btn anki-rate-good" data-rate="good" data-on=\'["_ankiHandleRate","good"]\' data-stop-propagation data-prevent-default>一般</button>' +
        '<button class="anki-rate-btn anki-rate-easy" data-rate="easy" data-on=\'["_ankiHandleRate","easy"]\' data-stop-propagation data-prevent-default>简单</button>' +
        '</div>';
    }

    // 重置翻转状态
    setFlipped(false);

    // 绑定事件
    bindCardEvents();
    updateProgressBar();
  }

  /**
   * 设置卡片翻转状态
   * @param {boolean} flipped
   */
  function setFlipped(flipped) {
    isFlipped = flipped;
    var card = document.getElementById('anki-card');
    if (card) {
      card.classList.toggle('anki-flipped', flipped);
    }
  }

  /**
   * 翻转卡片
   */
  function flipCard() {
    if (isFlipped) return;
    setFlipped(true);
  }

  /**
   * 绑定卡片事件（翻转、评分按钮）— 使用全局事件委托
   * 绑定在 document 上，确保 SPA 路由切换后仍能正常工作
   */
  var _cardEventsBound = false;

  function bindCardEvents() {
    if (_cardEventsBound) return;
    _cardEventsBound = true;

    document.addEventListener('click', function (e) {
      // Flip button
      if (e.target.closest('.anki-flip-btn')) {
        e.stopPropagation();
        e.preventDefault();
        flipCard();
        return;
      }
      // Rate buttons
      var rateBtn = e.target.closest('.anki-rate-btn');
      if (rateBtn) {
        e.stopPropagation();
        e.preventDefault();
        handleRate(rateBtn.dataset.rate);
        return;
      }
      // Click on card face (not on buttons)
      if (e.target.closest('.anki-card') && !isFlipped) {
        flipCard();
      }
    });
  }

  /**
   * 处理用户评分
   * @param {'again'|'good'|'easy'} rating
   */
  function handleRate(rating) {
    if (!sessionState || sessionState.queuePosition >= sessionState.reviewQueue.length) return;

    var currentItem = sessionState.reviewQueue[sessionState.queuePosition];
    var cardIdx = currentItem.cardIndex;
    var deckId = sessionState.deckId;
    var cardKey = String(cardIdx);

    // 获取当前卡片进度
    var allProgress = loadProgress();
    if (!allProgress[deckId]) {
      allProgress[deckId] = { cards: {}, lastReview: Date.now() };
    }
    if (!allProgress[deckId].cards) {
      allProgress[deckId].cards = {};
    }

    var currentCP = allProgress[deckId].cards[cardKey] || {
      easeFactor: DEFAULT_EASE_FACTOR,
      interval: 0,
      repetitions: 0,
      dueDate: 0,
      stability: 0,
      difficulty: 5
    };

    // 应用 FSRS-4.5 算法调度复习
    var newCP = applyFSRS(currentCP, rating);

    // 保存更新后的进度
    allProgress[deckId].cards[cardKey] = newCP;
    allProgress[deckId].lastReview = Date.now();
    saveProgress(allProgress);

    // 更新 BKT 知识掌握度（概念级）
    var concept = (currentItem.card && currentItem.card.concept) ||
                  (currentItem.card && currentItem.card.tags && currentItem.card.tags[0]) ||
                  'general';
    var isCorrect = rating !== 'again';
    var mastery = updateBKT(concept, isCorrect);

    // 更新会话状态
    sessionState.reviewedCount++;
    if (currentItem.isNew && rating !== 'again') {
      sessionState.newCardsLearned++;
    }

    // "Again" 的卡片放到队列末尾重新学习
    if (rating === 'again') {
      sessionState.reviewQueue.push({
        cardIndex: cardIdx,
        card: currentItem.card,
        isNew: currentItem.isNew
      });
      sessionState.totalInSession = sessionState.reviewQueue.length;
    }

    // 移动到下一张
    sessionState.queuePosition++;

    // 延迟渲染下一张（让用户看到反馈）
    setTimeout(function () {
      renderCurrentCard(true);
    }, 300);
  }

  /**
   * 更新底部进度条
   */
  function updateProgressBar() {
    var el = document.getElementById('anki-progress-bar');
    if (!el || !sessionState) return;

    var remaining = sessionState.totalInSession - sessionState.queuePosition;
    var reviewed = sessionState.reviewedCount;
    var total = sessionState.totalInSession;

    el.innerHTML =
      '<span class="anki-progress-text">' +
      '已复习 <strong>' + reviewed + '</strong> 张' +
      (remaining > 0 ? ' · 剩余 <strong>' + remaining + '</strong> 张' : '') +
      '</span>';

    // 进度条
    var pct = total > 0 ? (reviewed / total) * 100 : 0;
    el.innerHTML += '<div class="anki-progress-track"><div class="anki-progress-fill" style="width:' + pct + '%"></div></div>';
  }

  /**
   * 显示学习完成界面
   */
  function showSessionComplete() {
    var area = document.getElementById('anki-card-area');
    if (!area) return;

    var s = sessionState;
    area.innerHTML =
      '<div id="anki-complete" class="anki-complete">' +
      '<div class="anki-complete-icon">&#10003;</div>' +
      '<h3 class="anki-complete-title">本轮学习完成！</h3>' +
      '<p class="anki-complete-stats">' +
      '复习了 <strong>' + (s ? s.reviewedCount : 0) + '</strong> 张卡片' +
      '</p>' +
      '<div class="anki-complete-actions">' +
      '<button class="anki-action-btn anki-action-primary" id="anki-restart-btn">再学一轮</button>' +
      '<button class="anki-action-btn anki-action-secondary" id="anki-back-deck-btn">返回选牌组</button>' +
      '</div>' +
      '</div>';

    document.getElementById('anki-restart-btn').addEventListener('click', function () {
      // 重新构建会话
      area.innerHTML = '<div class="anki-card-container" id="anki-card-area-inner">' +
        '<div class="anki-card" id="anki-card">' +
        '<div class="anki-face anki-front-face" id="anki-front"></div>' +
        '<div class="anki-face anki-back-face" id="anki-back"></div>' +
        '</div></div>' +
        '<div class="anki-progress-bar" id="anki-progress-bar"></div>';
      buildSession(currentDeckIndex);
    });

    document.getElementById('anki-back-deck-btn').addEventListener('click', function () {
      area.innerHTML = '<div class="anki-card-container" id="anki-card-area-inner">' +
        '<div class="anki-card" id="anki-card">' +
        '<div class="anki-face anki-front-face" id="anki-front"></div>' +
        '<div class="anki-face anki-back-face" id="anki-back"></div>' +
        '</div></div>' +
        '<div class="anki-progress-bar" id="anki-progress-bar"></div>';
      renderDeckSelector();
      if (currentDeckIndex >= 0) {
        selectDeck(currentDeckIndex);
      }
    });
  }

  /**
   * 显示空状态提示
   * @param {string} message
   */
  function showEmpty(message) {
    var area = document.getElementById('anki-card-area');
    if (!area) return;
    area.innerHTML =
      '<div class="anki-empty">' +
      '<div class="anki-empty-icon">&#128218;</div>' +
      '<p class="anki-empty-text">' + escapeHtml(message) + '</p>' +
      '</div>';
  }

  /**
   * 显示错误状态
   * @param {string} message
   */
  function showError(message) {
    var area = document.getElementById('anki-card-area');
    if (!area) return;
    area.innerHTML =
      '<div class="anki-empty">' +
      '<div class="anki-empty-icon">&#9888;</div>' +
      '<p class="anki-empty-text" style="color:var(--color-error)">' + escapeHtml(message) + '</p>' +
      '</div>';
  }

  /**
   * HTML 转义
   */
  var escapeHtml = window.escapeHtml;


  function handleKeydown(e) {
    if (!sessionState) return;

    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        if (!isFlipped) flipCard();
        break;
      case '1':
        e.preventDefault();
        if (isFlipped) handleRate('again');
        break;
      case '2':
        e.preventDefault();
        if (isFlipped) handleRate('hard');
        break;
      case '3':
        e.preventDefault();
        if (isFlipped) handleRate('good');
        break;
      case '4':
        e.preventDefault();
        if (isFlipped) handleRate('easy');
        break;
    }
  }


  // 暴露 handleRate 供内联 onclick 调用（事件委托的备份）
  window._ankiHandleRate = handleRate;

  window.AnkiSystem = {
    loadData: loadData,
    selectDeck: selectDeck,
    getProgress: loadProgress,
    resetProgress: function (deckId) {
      var p = loadProgress();
      if (deckId) {
        delete p[deckId];
      } else {
        // 重置所有
        Object.keys(p).forEach(function (k) { delete p[k]; });
      }
      saveProgress(p);
      renderDeckSelector();
      if (currentDeckIndex >= 0) buildSession(currentDeckIndex);
    }
  };


  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('keydown', handleKeydown);
    loadData();
  });

  // 兼容：如果 DOM 已经 ready
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    document.addEventListener('keydown', handleKeydown);
    loadData();
  }

})();
