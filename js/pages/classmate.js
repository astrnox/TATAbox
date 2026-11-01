/**
 * ============================================================
 * TATABOX v4.0 — 苏格拉底 AI 同学（§7.2 + C.2 POC）
 *
 * 与初赛 AI 导师（师生权威）不同，AI 同学是平等的学习伙伴：
 *   - 不直接给答案，按学生选择的"提示等级"回应（L1→L4）
 *   - 检测到连续答错/低落情绪时切换为共情模式
 *   - 检测到自伤/自杀关键词时触发危机干预弹窗
 *
 * UI：右下角悬浮卡片（可拖动 / 可最小化）
 * 状态机：unanswered → answered → hinted → revealed
 *
 * 与 multi-agent.js 的 socraticGuide 函数协作：
 *   - 同学卡片调用 MultiAgentDiscussion.socraticGuide({question, level, ...})
 *   - 流式渲染回复到卡片
 * ============================================================
 */

(function () {
  'use strict';

  if (window.BioQuestClassmate) return;

  var MultiAgent = window.MultiAgentDiscussion;
  var AiClient = window.AiClient;

  var LEVELS = {
    L1: { id: 'L1', name: '提问我', hint: '用反问引导你思考，不给答案线索' },
    L2: { id: 'L2', name: '给提示', hint: '给一个关键提示，仍需自己推导' },
    L3: { id: 'L3', name: '给思路', hint: '给出推导步骤，最后一步留空' },
    L4: { id: 'L4', name: '看答案', hint: '完整答案 + 解析 + 易错点' }
  };

  var STATE_MACHINE = {
    unanswered: { canAsk: ['L1'] },
    answered:   { canAsk: ['L1', 'L2'] },
    hinted:     { canAsk: ['L1', 'L2', 'L3'] },
    revealed:   { canAsk: ['L1', 'L2', 'L3', 'L4'] }
  };

  var CRISIS_KEYWORDS = [
    '不想活了', '想死', '自杀', '自残', '了此一生', '结束一切', '结束生命',
    '活不下去', '没有意义', '想消失', '解脱', '了结', '绝望', '撑不下去',
    '伤害自己', '割腕', '跳楼', '安眠药', '崩溃'
  ];

  var EMPATHY_TRIGGERS = {
    consecutiveWrong: 5,      // 连续答错 5 题
    lowMoodToday: true,       // 今日情绪打卡为"低落"或"疲惫"
    studyMinutesNoBreak: 120  // 连续学习 2 小时未休息
  };

  var STORAGE_KEY = 'bioquest_classmate_sessions';
  var MAX_SESSIONS = 20;

  var state = {
    currentQuestion: null,
    currentState: 'unanswered',
    history: [],          // [{role:'user'|'classmate', text, level?, timestamp}]
    sessions: [],         // 持久化会话列表
    currentSessionId: null,
    empathyMode: false,
    consecutiveWrongCount: 0,  // 连续答错计数（外部模块上报）
    elements: {},
    isOpen: false,
    isMinimized: false,
    streamingEl: null,
    streamingText: ''
  };

  function _init() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state.sessions = JSON.parse(raw) || [];
    } catch (e) { state.sessions = []; }
  }

  function _persist() {
    try {
      // 只保留最近 MAX_SESSIONS 个会话
      if (state.sessions.length > MAX_SESSIONS) {
        state.sessions = state.sessions.slice(-MAX_SESSIONS);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions));
    } catch (e) {
      console.warn('[Classmate] persist failed:', e && e.message);
    }
  }

  var _stylesInjected = false;
  function _injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    var style = document.createElement('style');
    style.id = 'bioquest-classmate-styles';
    style.textContent = [
      '.bq-classmate-card {',
      '  position: fixed;',
      '  bottom: 24px;',
      '  right: 24px;',
      '  width: 360px;',
      '  max-width: calc(100vw - 32px);',
      '  max-height: 70vh;',
      '  background: var(--surface-primary, #ffffff);',
      '  border: 1px solid var(--border-light, #ece8e1);',
      '  border-radius: var(--radius-lg, 12px);',
      '  box-shadow: var(--shadow-floating);',
      '  z-index: 9998;',
      '  display: flex;',
      '  flex-direction: column;',
      '  overflow: hidden;',
      '  font-family: inherit;',
      '  transition: transform 0.25s ease, opacity 0.25s ease;',
      '}',
      '.bq-classmate-card.hidden { display: none; }',
      '.bq-classmate-card.minimized {',
      '  max-height: 56px;',
      '}',
      '.bq-classmate-card.minimized .bq-classmate-body,',
      '.bq-classmate-card.minimized .bq-classmate-buttons,',
      '.bq-classmate-card.minimized .bq-classmate-input-row { display: none; }',
      '.bq-classmate-header {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  padding: 12px 16px;',
      '  background: #5a7d5c;',
      '  color: #fff;',
      '  cursor: move;',
      '}',
      '.bq-classmate-avatar {',
      '  width: 32px;',
      '  height: 32px;',
      '  border-radius: 50%;',
      '  background: rgba(255,255,255,0.2);',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  font-size: 18px;',
      '  flex-shrink: 0;',
      '}',
      '.bq-classmate-name {',
      '  flex: 1;',
      '  font-weight: 600;',
      '  font-size: 0.95rem;',
      '}',
      '.bq-classmate-mode-badge {',
      '  font-size: 0.7rem;',
      '  padding: 2px 8px;',
      '  background: rgba(255,255,255,0.2);',
      '  border-radius: 16px;',
      '  margin-left: 4px;',
      '}',
      '.bq-classmate-mode-badge.empathy { background: rgba(196, 149, 106, 0.9); }',
      '.bq-classmate-close, .bq-classmate-minimize {',
      '  background: none;',
      '  border: none;',
      '  color: #fff;',
      '  cursor: pointer;',
      '  font-size: 1.2rem;',
      '  line-height: 1;',
      '  padding: 4px 8px;',
      '  border-radius: 4px;',
      '  opacity: 0.85;',
      '}',
      '.bq-classmate-close:hover, .bq-classmate-minimize:hover {',
      '  background: rgba(255,255,255,0.15);',
      '  opacity: 1;',
      '}',
      '.bq-classmate-body {',
      '  flex: 1;',
      '  overflow-y: auto;',
      '  padding: 12px 14px;',
      '  background: var(--surface-secondary, #faf7f2);',
      '  min-height: 200px;',
      '}',
      '.bq-classmate-msg {',
      '  margin: 8px 0;',
      '  padding: 10px 12px;',
      '  border-radius: 12px;',
      '  font-size: 0.875rem;',
      '  line-height: 1.6;',
      '  word-wrap: break-word;',
      '}',
      '.bq-classmate-msg.classmate {',
      '  background: var(--surface-primary, #fff);',
      '  border: 1px solid var(--border-light, #ece8e1);',
      '  border-top-left-radius: 4px;',
      '}',
      '.bq-classmate-msg.user {',
      '  background: rgba(90, 125, 92, 0.12);',
      '  color: var(--color-deep, #1a3a2a);',
      '  border-top-right-radius: 4px;',
      '  margin-left: 32px;',
      '}',
      '.bq-classmate-msg.system {',
      '  background: rgba(196, 149, 106, 0.1);',
      '  color: var(--color-amber, #c4956a);',
      '  font-size: 0.8rem;',
      '  text-align: center;',
      '  border-radius: 8px;',
      '}',
      '.bq-classmate-msg.empathy {',
      '  background: rgba(196, 149, 106, 0.15);',
      '  border: 1px solid rgba(196, 149, 106, 0.3);',
      '  color: var(--color-deep, #1a3a2a);',
      '}',
      '.bq-classmate-msg-role {',
      '  font-size: 0.72rem;',
      '  font-weight: 600;',
      '  color: var(--color-sage, #5a7d5c);',
      '  margin-bottom: 4px;',
      '}',
      '.bq-classmate-msg-level {',
      '  display: inline-block;',
      '  font-size: 0.68rem;',
      '  padding: 1px 6px;',
      '  background: rgba(90, 125, 92, 0.15);',
      '  color: var(--color-sage, #5a7d5c);',
      '  border-radius: 16px;',
      '  margin-left: 6px;',
      '}',
      '.bq-classmate-input-row {',
      '  display: flex;',
      '  gap: 6px;',
      '  padding: 10px 14px;',
      '  border-top: 1px solid var(--border-light, #ece8e1);',
      '  background: var(--surface-primary, #fff);',
      '}',
      '.bq-classmate-input-row input {',
      '  flex: 1;',
      '  padding: 8px 12px;',
      '  border: 1px solid var(--border-default, #e0dcd5);',
      '  border-radius: 8px;',
      '  font-size: 0.86rem;',
      '  font-family: inherit;',
      '}',
      '.bq-classmate-input-row input:focus {',
      '  outline: none;',
      '  border-color: var(--color-sage, #5a7d5c);',
      '}',
      '.bq-classmate-input-row button {',
      '  padding: 8px 14px;',
      '  background: var(--color-sage, #5a7d5c);',
      '  color: #fff;',
      '  border: none;',
      '  border-radius: 8px;',
      '  font-size: 0.86rem;',
      '  cursor: pointer;',
      '  font-family: inherit;',
      '}',
      '.bq-classmate-input-row button:hover { background: #4a6d4c; }',
      '.bq-classmate-buttons {',
      '  display: grid;',
      '  grid-template-columns: repeat(4, 1fr);',
      '  gap: 6px;',
      '  padding: 8px 14px;',
      '  background: var(--surface-primary, #fff);',
      '  border-top: 1px solid var(--border-light, #ece8e1);',
      '}',
      '.bq-classmate-level-btn {',
      '  padding: 8px 4px;',
      '  background: var(--surface-secondary, #faf7f2);',
      '  border: 1px solid var(--border-default, #e0dcd5);',
      '  border-radius: 8px;',
      '  cursor: pointer;',
      '  font-size: 0.76rem;',
      '  font-family: inherit;',
      '  text-align: center;',
      '  transition: all 0.15s ease;',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  gap: 2px;',
      '}',
      '.bq-classmate-level-btn:hover:not(:disabled) {',
      '  border-color: var(--color-sage, #5a7d5c);',
      '  background: rgba(90, 125, 92, 0.08);',
      '  transform: translateY(-1px);',
      '}',
      '.bq-classmate-level-btn:disabled {',
      '  opacity: 0.4;',
      '  cursor: not-allowed;',
      '}',
      '.bq-classmate-level-btn.active {',
      '  background: var(--color-sage, #5a7d5c);',
      '  color: #fff;',
      '  border-color: var(--color-sage, #5a7d5c);',
      '}',
      '.bq-classmate-level-icon { font-size: 1.1rem; }',
      '.bq-classmate-level-name { font-weight: 600; font-size: 0.74rem; }',
      '.bq-classmate-level-hint { font-size: 0.66rem; opacity: 0.75; line-height: 1.3; }',
      '.bq-classmate-fab {',
      '  position: fixed;',
      '  bottom: 24px;',
      '  right: 24px;',
      '  width: 56px;',
      '  height: 56px;',
      '  border-radius: 50%;',
      '  background: #5a7d5c;',
      '  color: #fff;',
      '  border: none;',
      '  cursor: pointer;',
      '  font-size: 1.6rem;',
      '  box-shadow: var(--shadow-lg);',
      '  z-index: 9997;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  transition: transform 0.2s ease;',
      '}',
      '.bq-classmate-fab:hover { transform: scale(1.08); }',
      '.bq-classmate-fab.hidden { display: none; }',
      '.bq-classmate-fab-badge {',
      '  position: absolute;',
      '  top: -4px;',
      '  right: -4px;',
      '  background: var(--color-amber, #c4956a);',
      '  color: #fff;',
      '  font-size: 0.66rem;',
      '  padding: 2px 6px;',
      '  border-radius: 16px;',
      '  font-weight: 700;',
      '}',
      '@media (max-width: 640px) {',
      '  .bq-classmate-card { width: calc(100vw - 32px); bottom: 80px; }',
      '  .bq-classmate-fab { bottom: 80px; }',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      '  .bq-classmate-card, .bq-classmate-fab, .bq-classmate-level-btn { transition: none; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function _buildCard() {
    var card = document.createElement('div');
    card.className = 'bq-classmate-card hidden';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', '苏格拉底 AI 同学');
    card.innerHTML = [
      '<div class="bq-classmate-header" id="bq-cm-header">',
      '  <div class="bq-classmate-name">苏格拉底同学<span class="bq-classmate-mode-badge" id="bq-cm-mode">L1 待提问</span></div>',
      '  <button class="bq-classmate-minimize" id="bq-cm-minimize" aria-label="最小化">—</button>',
      '  <button class="bq-classmate-close" id="bq-cm-close" aria-label="关闭">×</button>',
      '</div>',
      '<div class="bq-classmate-body" id="bq-cm-body" aria-live="polite"></div>',
      '<div class="bq-classmate-input-row">',
      '  <input type="text" id="bq-cm-input" placeholder="向同学提问，或描述你的疑惑..." maxlength="300" />',
      '  <button id="bq-cm-send">发送</button>',
      '</div>',
      '<div class="bq-classmate-buttons" id="bq-cm-buttons">',
      '  <button class="bq-classmate-level-btn" data-level="L1" disabled>',
      '    <span class="bq-classmate-level-name">L1 提问</span>',
      '    <span class="bq-classmate-level-hint">反问引导</span>',
      '  </button>',
      '  <button class="bq-classmate-level-btn" data-level="L2" disabled>',
      '    <span class="bq-classmate-level-name">L2 提示</span>',
      '    <span class="bq-classmate-level-hint">关键提示</span>',
      '  </button>',
      '  <button class="bq-classmate-level-btn" data-level="L3" disabled>',
      '    <span class="bq-classmate-level-name">L3 思路</span>',
      '    <span class="bq-classmate-level-hint">推导步骤</span>',
      '  </button>',
      '  <button class="bq-classmate-level-btn" data-level="L4" disabled>',
      '    <span class="bq-classmate-level-icon">' + BQ_ICONS.checkCircle + '</span>',
      '    <span class="bq-classmate-level-name">L4 答案</span>',
      '    <span class="bq-classmate-level-hint">完整解析</span>',
      '  </button>',
      '</div>'
    ].join('');
    document.body.appendChild(card);

    // FAB 浮动按钮
    var fab = document.createElement('button');
    fab.className = 'bq-classmate-fab hidden';
    fab.setAttribute('aria-label', '打开苏格拉底同学');
    fab.innerHTML = '<span class="bq-classmate-fab-badge" id="bq-cm-fab-badge" style="display:none;">!</span>';
    document.body.appendChild(fab);

    state.elements = {
      card: card,
      fab: fab,
      header: card.querySelector('#bq-cm-header'),
      body: card.querySelector('#bq-cm-body'),
      mode: card.querySelector('#bq-cm-mode'),
      minimize: card.querySelector('#bq-cm-minimize'),
      close: card.querySelector('#bq-cm-close'),
      input: card.querySelector('#bq-cm-input'),
      send: card.querySelector('#bq-cm-send'),
      buttons: card.querySelectorAll('.bq-classmate-level-btn'),
      fabBadge: fab.querySelector('#bq-cm-fab-badge')
    };

    _bindCardEvents();
    _makeDraggable();
  }

  function _bindCardEvents() {
    var e = state.elements;
    e.close.addEventListener('click', close);
    e.minimize.addEventListener('click', function () {
      e.card.classList.toggle('minimized');
      e.minimize.textContent = e.card.classList.contains('minimized') ? '+' : '—';
    });
    e.send.addEventListener('click', _onSendQuestion);
    e.input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') _onSendQuestion();
    });
    e.fab.addEventListener('click', function () {
      if (state.isOpen) {
        close();
      } else {
        show();
      }
    });
    e.buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var level = btn.getAttribute('data-level');
        if (!btn.disabled) ask(level);
      });
    });
  }

  // 拖动支持
  function _makeDraggable() {
    var header = state.elements.header;
    var card = state.elements.card;
    var isDragging = false;
    var startX, startY, startLeft, startTop;

    header.addEventListener('mousedown', function (e) {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      var rect = card.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      card.style.transition = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      var newLeft = Math.max(8, Math.min(window.innerWidth - card.offsetWidth - 8, startLeft + dx));
      var newTop = Math.max(8, Math.min(window.innerHeight - 80, startTop + dy));
      card.style.left = newLeft + 'px';
      card.style.top = newTop + 'px';
      card.style.right = 'auto';
      card.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', function () {
      if (isDragging) {
        isDragging = false;
        card.style.transition = '';
      }
    });
  }

  function show(question) {
    if (!state.elements.card) {
      _injectStyles();
      _buildCard();
    }
    state.isOpen = true;
    state.elements.card.classList.remove('hidden');
    state.elements.fab.classList.add('hidden');
    if (question) {
      state.elements.input.value = question;
      state.elements.input.focus();
    } else if (!state.currentQuestion) {
      _addMessage('system', '你好！我是你的苏格拉底同学。问我任何生物问题，我会按你选的等级引导你思考。');
    }
  }

  function close() {
    if (!state.elements.card) return;
    state.isOpen = false;
    state.elements.card.classList.add('hidden');
    state.elements.fab.classList.remove('hidden');
  }

  /**
   * 显示浮动按钮（在 FAB 上加红点提示）
   */
  function showFab(hasAlert) {
    if (!state.elements.card) {
      _injectStyles();
      _buildCard();
    }
    state.elements.fab.classList.remove('hidden');
    if (hasAlert && state.elements.fabBadge) {
      state.elements.fabBadge.style.display = '';
    }
  }

  function _addMessage(role, text, opts) {
    opts = opts || {};
    if (!state.elements.body) return;
    var msg = document.createElement('div');
    msg.className = 'bq-classmate-msg ' + role + (opts.empathy ? ' empathy' : '');
    if (role === 'system') {
      msg.textContent = text;
    } else {
      var roleLabel = role === 'user' ? '我' : '苏格拉底同学';
      var levelBadge = opts.level ? '<span class="bq-classmate-msg-level">' + opts.level + '</span>' : '';
      msg.innerHTML = '<div class="bq-classmate-msg-role">' + roleLabel + levelBadge + '</div><div></div>';
      msg.querySelector('div:last-child').textContent = text;
    }
    state.elements.body.appendChild(msg);
    state.elements.body.scrollTop = state.elements.body.scrollHeight;
    return msg;
  }

  /**
   * 流式追加文本到当前同学消息
   */
  function _streamClassmateMessage(level) {
    if (!state.elements.body) return null;
    var msg = document.createElement('div');
    msg.className = 'bq-classmate-msg classmate';
    var levelBadge = level ? '<span class="bq-classmate-msg-level">' + level + '</span>' : '';
    msg.innerHTML = '<div class="bq-classmate-msg-role">苏格拉底同学' + levelBadge + '</div><div class="bq-cm-stream"></div>';
    state.elements.body.appendChild(msg);
    state.elements.body.scrollTop = state.elements.body.scrollHeight;
    return msg.querySelector('.bq-cm-stream');
  }

  function _onSendQuestion() {
    var q = state.elements.input.value.trim();
    if (!q) return;
    // 危机词检测
    if (detectCrisis(q)) {
      _addMessage('user', q);
      state.elements.input.value = '';
      _triggerCrisisIntervention();
      return;
    }
    setQuestion(q);
    _addMessage('user', q);
    state.elements.input.value = '';
    // 默认立即用 L1 回答
    ask('L1');
  }

  /**
   * 设置当前问题（外部模块也可调用）
   */
  function setQuestion(question) {
    state.currentQuestion = question;
    state.currentState = 'unanswered';
    state.history = state.history.filter(function (h) { return h.role !== 'classmate' || h.text !== question; });
    state.history.push({ role: 'user', text: question, timestamp: Date.now() });
    _updateButtonStates();
    _updateModeBadge();
  }

  /**
   * 合并历史中连续相同 role 的消息（G-09）
   * 部分 LLM API 要求 user/assistant 严格交替，连续同角色会导致 400 错误。
   * 此函数仅作用于发送给 LLM 的副本，不修改 state.history 原始记录
   * （保留时间戳与 level 以便 UI 渲染与持久化）。
   * @param {Array<{role:string,content:string}>} msgs - 已映射为 LLM 格式的历史
   * @returns {Array<{role:string,content:string}>} 合并后的历史
   */
  function _mergeConsecutiveRoles(msgs) {
    if (!Array.isArray(msgs) || msgs.length === 0) return [];
    var merged = [];
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var last = merged[merged.length - 1];
      if (last && last.role === m.role) {
        // 同角色连续：拼接内容（用空行分隔，保留语义边界）
        last.content = (last.content || '') + '\n\n' + (m.content || '');
      } else {
        merged.push({ role: m.role, content: m.content || '' });
      }
    }
    return merged;
  }

  function ask(level) {
    if (!level || !LEVELS[level]) {
      console.warn('[Classmate] invalid level:', level);
      return;
    }
    if (!state.currentQuestion) {
      _addMessage('system', '请先输入你的问题');
      return;
    }
    var canAsk = (STATE_MACHINE[state.currentState] || {}).canAsk || [];
    if (canAsk.indexOf(level) < 0) {
      _addMessage('system', '当前阶段不能请求 ' + level + '，请按顺序升级提示');
      return;
    }

    if (!MultiAgent || typeof MultiAgent.socraticGuide !== 'function') {
      _addMessage('system', 'AI 模块未加载，无法回答');
      return;
    }
    if (AiClient && typeof AiClient.canUse === 'function' && !AiClient.canUse()) {
      _addMessage('system', '请先配置 AI API Key（在「我的 → 设置」中）');
      return;
    }

    // 共情模式：在 L1 提示中加上共情前缀
    var effectiveQuestion = state.currentQuestion;
    if (state.empathyMode && level === 'L1') {
      effectiveQuestion = '[共情模式] 同学刚连续答错 ' + state.consecutiveWrongCount + ' 题，可能状态不好。请先用一句话共情（"看起来这个知识点有点难，要不换个角度？"），再用反问引导。\n\n同学问题：' + state.currentQuestion;
    }

    var levelNum = parseInt(level.charAt(1), 10);
    var streamTarget = _streamClassmateMessage(level);
    var acc = '';

    var history = state.history.slice(-6).map(function (h) {
      return { role: h.role === 'user' ? 'user' : 'assistant', content: h.text };
    });
    // G-09：合并连续同角色消息，避免 LLM API 因角色不交替返回 400
    history = _mergeConsecutiveRoles(history);

    MultiAgent.socraticGuide({
      question: effectiveQuestion,
      level: levelNum,
      history: history,
      onChunk: function (chunk) {
        if (!streamTarget) return;
        acc += chunk;
        streamTarget.textContent = acc;
        state.elements.body.scrollTop = state.elements.body.scrollHeight;
      },
      onDone: function (fullText) {
        var text = fullText || acc || '（同学沉默了…）';
        if (streamTarget) streamTarget.textContent = text;
        // 记入历史
        state.history.push({ role: 'classmate', text: text, level: level, timestamp: Date.now() });
        // 状态转移
        if (level === 'L2' || level === 'L3') state.currentState = 'hinted';
        if (level === 'L4') state.currentState = 'revealed';
        _updateButtonStates();
        _updateModeBadge();
        _persistCurrentSession();
        // TTS
        if (window.BioQuestTTS && window.BioQuestTTS.isEnabled && window.BioQuestTTS.isEnabled()) {
          try { window.BioQuestTTS.speak(text, '苏格拉底同学'); } catch (e) {}
        }
      },
      onError: function (err) {
        if (streamTarget) {
          streamTarget.textContent = '（同学好像没听清，再问一次？错误：' + (err && err.message || err) + '）';
        }
      }
    });
  }

  function _updateButtonStates() {
    var canAsk = (STATE_MACHINE[state.currentState] || {}).canAsk || [];
    state.elements.buttons.forEach(function (btn) {
      var lvl = btn.getAttribute('data-level');
      btn.disabled = canAsk.indexOf(lvl) < 0;
      btn.classList.toggle('active', state.currentState !== 'unanswered' && canAsk.indexOf(lvl) >= 0);
    });
  }

  function _updateModeBadge() {
    var badge = state.elements.mode;
    if (!badge) return;
    if (state.empathyMode) {
      badge.textContent = '共情模式';
      badge.classList.add('empathy');
    } else {
      var stateLabels = { unanswered: 'L1 待提问', answered: 'L1-L2 可用', hinted: 'L1-L3 可用', revealed: 'L1-L4 可用' };
      badge.textContent = stateLabels[state.currentState] || 'L1 待提问';
      badge.classList.remove('empathy');
    }
  }

  function _persistCurrentSession() {
    if (!state.currentQuestion) return;
    var existing = state.sessions.find(function (s) { return s.id === state.currentSessionId; });
    var snapshot = {
      id: state.currentSessionId || ('cm_' + Date.now()),
      question: state.currentQuestion,
      history: state.history.slice(-20),
      state: state.currentState,
      empathyMode: state.empathyMode,
      updatedAt: Date.now()
    };
    if (existing) {
      Object.assign(existing, snapshot);
    } else {
      state.currentSessionId = snapshot.id;
      state.sessions.push(snapshot);
    }
    _persist();

    // v4.0 异步同步到 Supabase（ai_conversations + ai_messages）
    _syncClassmateSessionToSupabase(snapshot);
  }

  /**
   * v4.0 异步同步苏格拉底对话到 Supabase
   * 非阻塞，失败时静默
   */
  async function _syncClassmateSessionToSupabase(snapshot) {
    if (!window.saveAIConversation || !window.saveAIMessage) return;
    try {
      var convResult = await window.saveAIConversation({
        id: snapshot.id,
        type: 'classmate',
        title: String(snapshot.question || '').slice(0, 40),
        metadata: {
          state: snapshot.state,
          empathyMode: snapshot.empathyMode,
          messageCount: (snapshot.history || []).length
        }
      });
      if (!convResult.ok) return;
      // 仅同步最后一条消息
      var lastMsg = (snapshot.history || [])[snapshot.history.length - 1];
      if (!lastMsg) return;
      await window.saveAIMessage({
        conversation_id: snapshot.id,
        role: lastMsg.role === 'user' ? 'user' : 'assistant',
        content: lastMsg.text || lastMsg.content || '',
        metadata: { level: lastMsg.level || '', ts: lastMsg.ts || Date.now() }
      });
    } catch (e) { /* 静默 */ }
  }

  /**
   * 列出历史会话
   */
  function listSessions() {
    return state.sessions.slice().reverse();
  }

  /**
   * 加载历史会话
   */
  function loadSession(sessionId) {
    var s = state.sessions.find(function (x) { return x.id === sessionId; });
    if (!s) return false;
    state.currentSessionId = s.id;
    state.currentQuestion = s.question;
    state.currentState = s.state || 'unanswered';
    state.history = (s.history || []).slice();
    state.empathyMode = !!s.empathyMode;
    // 重渲染对话
    if (state.elements.body) {
      state.elements.body.replaceChildren();
      state.history.forEach(function (h) {
        if (h.role === 'user') {
          _addMessage('user', h.text);
        } else {
          _addMessage('classmate', h.text, { level: h.level });
        }
      });
    }
    _updateButtonStates();
    _updateModeBadge();
    return true;
  }

  /**
   * 上报一次答错
   * @param {Object} opts - { question, concept?, subject? }
   */
  function onWrongAnswer(opts) {
    opts = opts || {};
    state.consecutiveWrongCount = (state.consecutiveWrongCount || 0) + 1;
    if (state.consecutiveWrongCount >= EMPATHY_TRIGGERS.consecutiveWrong && !state.empathyMode) {
      _triggerEmpathyMode(opts);
    } else if (state.consecutiveWrongCount >= 3 && state.consecutiveWrongCount < EMPATHY_TRIGGERS.consecutiveWrong) {
      // 3 次答错时主动提示"问问同学？"
      _suggestClassmate(opts);
    }
  }

  /**
   * 上报一次答对（重置连续答错计数）
   */
  function onCorrectAnswer() {
    state.consecutiveWrongCount = 0;
    if (state.empathyMode) {
      state.empathyMode = false;
      _updateModeBadge();
      _addMessage('system', '共情模式已关闭。');
    }
  }

  function _suggestClassmate(opts) {
    if (!state.elements.fab) {
      _injectStyles();
      _buildCard();
    }
    showFab(true);
    // 不自动弹开，让用户自己决定
  }

  function _triggerEmpathyMode(opts) {
    state.empathyMode = true;
    _updateModeBadge();
    if (!state.isOpen) show();
    _addMessage('empathy',
      '看起来今天状态不太好，要不先休息 5 分钟？遗传学明天再战。我在这儿等你，不急。\n\n顺便说一句，你已经学了挺久了，番茄钟建议你起来活动一下，喝点水。',
      { empathy: true }
    );
    // 记录共情触发事件到 localStorage（供后续分析）
    try {
      var logs = JSON.parse(localStorage.getItem('bioquest_empathy_logs') || '[]');
      logs.push({ timestamp: Date.now(), trigger: 'consecutive_wrong', count: state.consecutiveWrongCount, context: opts });
      localStorage.setItem('bioquest_empathy_logs', JSON.stringify(logs.slice(-50)));
    } catch (e) {}
  }

  /**
   * 检测文本是否包含危机关键词
   */
  function detectCrisis(text) {
    if (!text || typeof text !== 'string') return false;
    var lower = text.toLowerCase();
    return CRISIS_KEYWORDS.some(function (kw) { return lower.indexOf(kw.toLowerCase()) >= 0; });
  }

  function _triggerCrisisIntervention() {
    _addMessage('empathy',
      '我听到你了，你现在一定很难受。请立即拨打心理援助热线，会有专业的人陪你聊聊。你的生命比任何生物题都重要。',
      { empathy: true }
    );
    // 弹出危机资源弹窗
    if (window.BioQuestMoodTracker && typeof window.BioQuestMoodTracker.showCrisisResource === 'function') {
      window.BioQuestMoodTracker.showCrisisResource();
    } else {
      _showFallbackCrisisModal();
    }
    // 记录危机事件
    try {
      var logs = JSON.parse(localStorage.getItem('bioquest_crisis_logs') || '[]');
      logs.push({ timestamp: Date.now(), source: 'classmate' });
      localStorage.setItem('bioquest_crisis_logs', JSON.stringify(logs.slice(-30)));
    } catch (e) {}
  }

  function _showFallbackCrisisModal() {
    var modal = document.createElement('div');
    modal.className = 'bq-crisis-modal';
    // v4.0 a11y：补全 role/aria-modal/aria-label，便于屏幕阅读器识别为对话框
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'bq-classmate-crisis-title');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = [
      '<div style="background:#fff;border-radius:16px;padding:28px;max-width:440px;width:100%;box-shadow:var(--shadow-floating);">',
      '  <h2 id="bq-classmate-crisis-title" style="margin:0 0 12px;color:#1a3a2a;font-family:serif;">你不是一个人</h2>',
      '  <p style="color:#4a4a4a;line-height:1.7;margin:12px 0;">我注意到你可能正在经历困难的时刻。请记得，寻求帮助是勇敢的表现。</p>',
      '  <div style="background:#f8f9fa;padding:14px;border-radius:8px;margin:16px 0;">',
      '    <div style="margin:6px 0;"><strong>全国心理援助热线</strong>：12320-5（24 小时）</div>',
      '    <div style="margin:6px 0;"><strong>北京心理危机研究与干预中心</strong>：010-82951332</div>',
      '    <div style="margin:6px 0;"><strong>生命热线</strong>：400-161-9995</div>',
      '  </div>',
      '  <p style="font-size:0.78rem;color:#999;margin:12px 0;">TATABOX 不是医疗机构，本卡片仅提供资源转介，不构成医学诊断或治疗建议。如遇紧急情况请立即拨打 120。</p>',
      '  <div style="display:flex;gap:8px;margin-top:16px;">',
      '    <a href="tel:12320" style="flex:1;padding:10px;background:#5a7d5c;color:#fff;text-align:center;border-radius:8px;text-decoration:none;font-weight:600;">立即拨打 12320</a>',
      '    <button class="bq-crisis-close" type="button" style="flex:1;padding:10px;background:#f5f3ef;border:1px solid #e0dcd5;border-radius:8px;cursor:pointer;font-family:inherit;">我已了解</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);

    var _focusTrap = null;
    function close() {
      if (_focusTrap) { _focusTrap.release(); _focusTrap = null; }
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    }
    modal.querySelector('.bq-crisis-close').addEventListener('click', close);
    modal.addEventListener('click', function (ev) { if (ev.target === modal) close(); });

    // v4.0 a11y：焦点陷阱 + ESC 关闭
    if (typeof window.BioQuestA11y === 'object' && window.BioQuestA11y &&
        typeof window.BioQuestA11y.trapFocus === 'function') {
      _focusTrap = window.BioQuestA11y.trapFocus(modal, {
        onEscape: close,
        initialFocus: modal.querySelector('.bq-crisis-close')
      });
    } else {
      setTimeout(function () {
        var closeBtn = modal.querySelector('.bq-crisis-close');
        if (closeBtn) closeBtn.focus();
      }, 50);
    }
  }

  function reset() {
    state.currentQuestion = null;
    state.currentState = 'unanswered';
    state.history = [];
    state.empathyMode = false;
    state.currentSessionId = null;
    if (state.elements.body) state.elements.body.replaceChildren();
    _updateButtonStates();
    _updateModeBadge();
  }

  window.BioQuestClassmate = {
    show: show,
    close: close,
    showFab: showFab,
    setQuestion: setQuestion,
    ask: ask,
    reset: reset,
    onWrongAnswer: onWrongAnswer,
    onCorrectAnswer: onCorrectAnswer,
    detectCrisis: detectCrisis,
    listSessions: listSessions,
    loadSession: loadSession,
    LEVELS: LEVELS,
    STATE_MACHINE: STATE_MACHINE,
    CRISIS_KEYWORDS: CRISIS_KEYWORDS,
    getState: function () { return { currentState: state.currentState, empathyMode: state.empathyMode, consecutiveWrongCount: state.consecutiveWrongCount, currentQuestion: state.currentQuestion }; }
  };

  _init();

  // 全局快捷键：Ctrl+Shift+C 打开同学卡片
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      if (state.isOpen) close(); else show();
    }
  });

})();
