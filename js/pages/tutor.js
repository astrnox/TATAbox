/**
 * ============================================================
 * TATABOX — AI 生物导师对话模块（Telegram 风格）
 * 仅保留通用模式，基于秘塔知识库
 * ============================================================
 */

'use strict';

var _tutorStylesInjected = false;

function injectTutorStyles() {
  if (_tutorStylesInjected) return;
  _tutorStylesInjected = true;

  var style = document.createElement('style');
  style.id = 'bioquest-tutor-styles';
  style.textContent = [
    /* 页面容器 — 全屏聊天 */
    '.tutor-page {',
    '  max-width: 720px;',
    '  margin: 0 auto;',
    '  display: flex;',
    '  flex-direction: column;',
    '  height: calc(100vh - var(--header-height, 64px) - 56px);',
    '  background: #f0f2f5;',
    '  box-sizing: border-box;',
    '  overflow: hidden;',
    '}',

    /* 消息区域 */
    '.tutor-messages {',
    '  flex: 1;',
    '  overflow-y: auto;',
    '  padding: 8px 16px;',
    '  -webkit-overflow-scrolling: touch;',
    '  scroll-behavior: smooth;',
    '}',

    /* 消息行 */
    '.tutor-msg {',
    '  display: flex;',
    '  margin-bottom: 4px;',
    '  animation: bq-msg-enter 0.2s ease-out both;',
    '}',
    '@keyframes bq-msg-enter {',
    '  from { opacity: 0; transform: translateY(8px); }',
    '  to { opacity: 1; transform: translateY(0); }',
    '}',

    /* 用户消息 — 右对齐 */
    '.tutor-msg--user {',
    '  justify-content: flex-end;',
    '}',
    /* AI 消息 — 左对齐 */
    '.tutor-msg--ai {',
    '  justify-content: flex-start;',
    '}',

    /* 消息气泡 */
    '.tutor-msg-bubble {',
    '  max-width: 75%;',
    '  padding: 8px 14px;',
    '  font-size: 0.9rem;',
    '  line-height: 1.5;',
    '  word-wrap: break-word;',
    '  overflow-wrap: break-word;',
    '  position: relative;',
    '}',
    /* 用户气泡 — 鼠尾草绿（--bq-bubble-sent） */
    '.tutor-msg--user .tutor-msg-bubble {',
    '  background: #c8e6d0;',
    '  color: #1a2f1d;',
    '  border-radius: 16px 4px 16px 16px;',
    '  margin-right: 4px;',
    '}',
    /* AI 气泡 — 白色（--bq-bubble-received） */
    '.tutor-msg--ai .tutor-msg-bubble {',
    '  background: #ffffff;',
    '  color: #2c3e30;',
    '  border-radius: 4px 16px 16px 16px;',
    '  margin-left: 4px;',
    '  box-shadow: var(--shadow-sm);',
    '}',

    /* Markdown 内容 */
    '.tutor-msg-bubble p { margin: 0 0 6px; }',
    '.tutor-msg-bubble p:last-child { margin-bottom: 0; }',
    '.tutor-msg-bubble code {',
    '  background: rgba(0,0,0,0.06);',
    '  padding: 1px 5px;',
    '  border-radius: 4px;',
    '  font-family: var(--font-mono, monospace);',
    '  font-size: 0.85em;',
    '}',
    '.tutor-msg-bubble pre {',
    '  background: rgba(0,0,0,0.06);',
    '  padding: 8px 12px;',
    '  border-radius: 8px;',
    '  overflow-x: auto;',
    '  margin: 6px 0;',
    '}',
    '.tutor-msg-bubble pre code { background: none; padding: 0; }',

    /* 时间戳（极小） */
    '.tutor-msg-time {',
    '  font-size: 0.65rem;',
    '  color: #999;',
    '  margin-top: 2px;',
    '  padding: 0 14px;',
    '}',
    '.tutor-msg--user .tutor-msg-time { text-align: right; }',

    /* 打字光标 */
    '.tutor-typing {',
    '  display: inline-block;',
    '  width: 6px;',
    '  height: 14px;',
    '  background: #4a7c59;',
    '  margin-left: 2px;',
    '  animation: bq-cursor-blink 0.7s infinite;',
    '  vertical-align: middle;',
    '  border-radius: 1px;',
    '}',
    '@keyframes bq-cursor-blink {',
    '  0%, 50% { opacity: 1; }',
    '  51%, 100% { opacity: 0; }',
    '}',

    /* 正在输入指示器 */
    '.tutor-typing-dots {',
    '  display: flex;',
    '  gap: 4px;',
    '  padding: 12px 14px;',
    '}',
    '.tutor-typing-dots span {',
    '  width: 7px;',
    '  height: 7px;',
    '  border-radius: 50%;',
    '  background: #4a7c59;',
    '  animation: bq-typing-bounce 1.4s infinite ease-in-out;',
    '}',
    '.tutor-typing-dots span:nth-child(2) { animation-delay: 0.18s; }',
    '.tutor-typing-dots span:nth-child(3) { animation-delay: 0.36s; }',
    '@keyframes bq-typing-bounce {',
    '  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }',
    '  30% { transform: translateY(-5px); opacity: 1; }',
    '}',

    /* SVG 图表 */
    '.tutor-svg-box {',
    '  margin: 6px 0;',
    '  padding: 6px;',
    '  background: rgba(0,0,0,0.03);',
    '  border-radius: 8px;',
    '  text-align: center;',
    '  overflow-x: auto;',
    '}',
    '.tutor-svg-box svg { max-width: 100%; height: auto; }',

    /* 快捷问题 — 底部浮层 */
    '.tutor-quick {',
    '  display: flex;',
    '  gap: 6px;',
    '  flex-wrap: wrap;',
    '  padding: 6px 16px 0;',
    '  flex-shrink: 0;',
    '}',
    '.tutor-quick-btn {',
    '  padding: 6px 12px;',
    '  border-radius: 12px;',
    '  background: #fff;',
    '  border: 1px solid #e2ddd6;',
    '  font-size: 0.78rem;',
    '  color: #555;',
    '  cursor: pointer;',
    '  transition: all 0.12s;',
    '  white-space: nowrap;',
    '}',
    '.tutor-quick-btn:active {',
    '  transform: scale(0.95);',
    '  background: #c8e6d0;',
    '  border-color: #4a7c59;',
    '}',

    /* 输入栏 — Telegram 风格 */
    '.tutor-input-bar {',
    '  display: flex;',
    '  align-items: flex-end;',
    '  gap: 8px;',
    '  padding: 8px 16px 10px;',
    '  flex-shrink: 0;',
    '  background: #faf8f5;',
    '}',
    '.tutor-input-wrap {',
    '  flex: 1;',
    '  background: #fff;',
    '  border-radius: 16px;',
    '  display: flex;',
    '  align-items: flex-end;',
    '  padding: 2px 4px 2px 16px;',
    '  box-shadow: var(--shadow-sm);',
    '}',
    '.tutor-input {',
    '  flex: 1;',
    '  border: none;',
    '  background: none;',
    '  color: #1a1a1a;',
    '  font-size: 0.9rem;',
    '  outline: none;',
    '  resize: none;',
    '  max-height: 100px;',
    '  min-height: 36px;',
    '  font-family: inherit;',
    '  line-height: 1.4;',
    '  padding: 8px 0;',
    '}',
    '.tutor-send {',
    '  width: 40px;',
    '  height: 40px;',
    '  border: none;',
    '  border-radius: 50%;',
    '  background: #4a7c59;',
    '  color: #fff;',
    '  cursor: pointer;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  flex-shrink: 0;',
    '  transition: all 0.12s;',
    '}',
    '.tutor-send:active { transform: scale(0.9); }',
    '.tutor-send:disabled { background: #ccc; cursor: not-allowed; }',

    /* 导出按钮 */
    '.tutor-export {',
    '  width: 36px;',
    '  height: 36px;',
    '  background: none;',
    '  border: none;',
    '  color: #999;',
    '  cursor: pointer;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  flex-shrink: 0;',
    '}',
    '/* 流式控制按钮（暂停/停止）——默认圆形禁用灰，启用时主题色 */',
    '.tutor-ctrl {',
    '  width: 36px;',
    '  height: 36px;',
    '  border-radius: 50%;',
    '  border: 1px solid #e2ddd6;',
    '  background: #fff;',
    '  color: #bbb;',
    '  cursor: not-allowed;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  flex-shrink: 0;',
    '  transition: all 0.15s;',
    '}',
    '.tutor-ctrl:not(:disabled) {',
    '  color: #4a7c59;',
    '  border-color: #c8e6d0;',
    '  background: #f2faef;',
    '  cursor: pointer;',
    '}',
    '.tutor-ctrl:not(:disabled):hover {',
    '  background: #4a7c59;',
    '  color: #fff;',
    '  border-color: #4a7c59;',
    '  transform: translateY(-1px);',
    '}',
    '.tutor-stop:not(:disabled):hover { background: #d45a4e; border-color: #d45a4e; color:#fff; }',
    '.tutor-ctrl:active { transform: scale(0.92); }',

    /* 空状态 */
    '.tutor-welcome {',
    '  text-align: center;',
    '  padding: 60px 20px 20px;',
    '  color: #888;',
    '}',
    '.tutor-welcome-icon {',
    '  width: 64px;',
    '  height: 64px;',
    '  margin: 0 auto 14px;',
    '  border-radius: 50%;',
    '  background: #fff;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  font-size: 1.8rem;',
    '  box-shadow: var(--shadow-md);',
    '}',
    '.tutor-welcome-title {',
    '  font-size: 1.1rem;',
    '  font-weight: 600;',
    '  color: #333;',
    '  margin-bottom: 6px;',
    '}',
    '.tutor-welcome-desc {',
    '  font-size: 0.82rem;',
    '  line-height: 1.5;',
    '}',

    /* 未配置 AI Key 时的前置引导（消除「点进去是死路」） */
    '.tutor-setup {',
    '  max-width: 460px;',
    '  margin: 24px auto;',
    '  padding: 24px;',
    '  background: #fff;',
    '  border-radius: var(--radius-lg, 12px);',
    '  box-shadow: var(--shadow-md);',
    '}',
    '.tutor-setup-title { font-size: 1.05rem; font-weight: 600; color: #1a3a2a; margin-bottom: 8px; }',
    '.tutor-setup-desc { font-size: 0.84rem; color: #5a6b5f; line-height: 1.6; margin-bottom: 16px; }',
    '.tutor-setup-field { margin-bottom: 12px; }',
    '.tutor-setup-label { display: block; font-size: 0.8rem; color: #4a5a4f; margin-bottom: 6px; }',
    '.tutor-setup select, .tutor-setup input[type="password"] {',
    '  width: 100%; box-sizing: border-box; padding: 10px 12px;',
    '  border: 1px solid #dcdcd4; border-radius: 8px; font-size: 0.86rem;',
    '  background: #fff; color: #1a1a1a; font-family: inherit;',
    '}',
    '.tutor-setup-remember { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: #5a6b5f; margin-bottom: 16px; }',
    '.tutor-setup-btn {',
    '  width: 100%; padding: 11px; border: none; border-radius: 8px;',
    '  background: #4a7c59; color: #fff; font-size: 0.9rem; font-weight: 600;',
    '  cursor: pointer; font-family: inherit;',
    '}',
    '.tutor-setup-btn:hover { background: #3f6b4c; }',
    '.tutor-setup-msg { min-height: 18px; font-size: 0.78rem; color: #c45a4e; margin-top: 8px; }',
    '.tutor-setup-foot { font-size: 0.76rem; color: #8a968c; margin-top: 12px; line-height: 1.6; }',

    /* 动画可访问性 — 尊重减少动态偏好 */
    '@media (prefers-reduced-motion: reduce) {',
    '  .tutor-msg, .tutor-typing, .tutor-typing-dots span { animation: none; }',
    '  .tutor-typing { opacity: 0.6; }',
    '}',

    /* 响应式 */
    '@media (max-width: 640px) {',
    '  .tutor-msg-bubble { font-size: 0.85rem; max-width: 82%; }',
    '  .tutor-page { background: #f0f2f5; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
}

/* 模式配置 — 仅保留通用 */
var TUTOR_MODES = {
  general: { label: 'AI 导师', greeting: '有什么生物学问题尽管问我。' }
};

/* 快捷问题 */
var TUTOR_QUICK_QUESTIONS = [
  '解释减数分裂前期I的同源染色体配对',
  '光合作用光反应和暗反应的区别？',
  'DNA半保留复制是怎么回事？'
];

/* SVG 降级正则过滤（DOMPurify 未加载或异常时使用）
 * 与 discussion.js 保持一致：包括 HTML 实体解码，防止 &#106;avascript: 绕过
 */
function _fallbackSanitize(svg) {
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '');
  svg = svg.replace(/<script[^>]*>/gi, '');
  svg = svg.replace(/[\s\/"']on\w+\s*=\s*"[^"]*"/gi, '');
  svg = svg.replace(/[\s\/"']on\w+\s*=\s*'[^']*'/gi, '');
  svg = svg.replace(/[\s\/"']on\w+\s*=\s*[^\s>]+/gi, '');
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  svg = svg.replace(/\sstyle\s*=\s*"[^"]*"/gi, '')
           .replace(/\sstyle\s*=\s*'[^']*'/gi, '')
           .replace(/\sstyle\s*=\s*[^\s>]+/gi, '');
  // HTML 实体解码（防止 &#106;avascript: 等编码绕过）
  svg = svg.replace(/&#(\d+);/g, function(m, n) { return String.fromCharCode(parseInt(n, 10)); })
          .replace(/&#x([0-9a-f]+);/gi, function(m, n) { return String.fromCharCode(parseInt(n, 16)); })
          .replace(/&colon;/gi, ':');
  // 解码后过滤 javascript: / data: URI
  svg = svg.replace(/(href|xlink:href)\s*=\s*["']?\s*javascript:/gi, '$1="');
  svg = svg.replace(/(href|xlink:href)\s*=\s*["']?\s*data:/gi, '$1="');
  return svg;
}

/* 简易 Markdown 渲染（安全） */
function _tutorMarkdown(text) {
  if (typeof window.BioQuestMarkdown === 'function') {
    return window.BioQuestMarkdown(text);
  }
  // 降级：旧的简易实现（utils.js 没加载成功时兜底）
  var html = escapeHtml(text || '');
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '</p><p>');
  return '<p>' + html + '</p>';
}

/* 清理 [[ANIM:xxx]] 标记 */
function _stripAnim(text) {
  return text.replace(/\[\[ANIM:\w+\]\]/g, '').trim();
}

/* ===== 敏感信息脱敏（输入/输出双端）===== */
function _tutorRedact(text) {
  try {
    if (typeof window.redactSensitiveSecrets === 'function') {
      return window.redactSensitiveSecrets(text || '');
    }
  } catch (e) {}
  return text || '';
}

/* 状态
 *   streamPhase: 'idle' | 'streaming' | 'paused' | 'stopping'
 *   - streaming: 正常接收 chunk，按 60ms 节奏刷 DOM
 *   - paused:    继续收 chunk 并缓存到 pendingBuffer，**不** append 到 DOM，光标停住
 *   - stopping:  已调用 abortController.abort()，等待 onDone/onError 回调收尾
 *   pendingBuffer: 暂停期间累积、尚未 flush 到 DOM 的文本片段
 */
var _tutorState = {
  messages: [],
  currentMode: 'general',
  // isStreaming 保留向后兼容；真实状态以 streamPhase 为准
  get isStreaming() {
    return this.streamPhase === 'streaming' || this.streamPhase === 'paused' || this.streamPhase === 'stopping';
  },
  set isStreaming(v) { /* 不使用 setter，统一通过 _setStreamPhase 改 */ },
  streamPhase: 'idle',
  pendingBuffer: '',
  abortController: null
};

/** 统一改 streamPhase + 同步按钮可访问性状态 */
function _setStreamPhase(phase) {
  _tutorState.streamPhase = phase;
  if (phase === 'idle') _tutorState.pendingBuffer = '';
  var pauseBtn = document.getElementById('tutor-pause');
  var stopBtn = document.getElementById('tutor-stop');
  if (pauseBtn) {
    if (phase === 'streaming') {
      pauseBtn.disabled = false;
      pauseBtn.setAttribute('aria-label', '暂停输出');
      pauseBtn.title = '暂停输出';
      pauseBtn.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    } else if (phase === 'paused') {
      pauseBtn.disabled = false;
      pauseBtn.setAttribute('aria-label', '继续输出');
      pauseBtn.title = '继续输出';
      pauseBtn.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><polygon points="6,4 20,12 6,20"/></svg>';
    } else {
      pauseBtn.disabled = true;
      pauseBtn.removeAttribute('aria-label');
      pauseBtn.title = '';
      pauseBtn.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    }
  }
  if (stopBtn) {
    stopBtn.disabled = !(phase === 'streaming' || phase === 'paused');
    stopBtn.title = stopBtn.disabled ? '' : '停止输出';
  }
  var sendBtn = document.getElementById('tutor-send');
  if (sendBtn) sendBtn.disabled = (phase !== 'idle');
}

var TUTOR_STORAGE_KEY = 'bioquest_tutor_sessions';

function _loadTutorSessions() {
  try {
    var raw = localStorage.getItem(TUTOR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function _saveTutorSessions(sessions) {
  try {
    if (sessions.length > 20) sessions = sessions.slice(0, 20);
    localStorage.setItem(TUTOR_STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn('[tutor] 保存会话失败:', e.message);
  }
}

function _persistCurrentSession() {
  if (_tutorState.messages.length === 0) return;
  var sessions = _loadTutorSessions();
  var sessionId = _tutorState.sessionId || ('sess_' + Date.now());
  _tutorState.sessionId = sessionId;
  var title = _tutorState.messages[0].content.slice(0, 20) + '...';
  var existingIdx = -1;
  for (var i = 0; i < sessions.length; i++) {
    if (sessions[i].id === sessionId) { existingIdx = i; break; }
  }
  var session = {
    id: sessionId,
    title: title,
    mode: _tutorState.currentMode,
    messages: _tutorState.messages,
    updatedAt: Date.now()
  };
  if (existingIdx >= 0) sessions[existingIdx] = session;
  else sessions.unshift(session);
  _saveTutorSessions(sessions);

  // v4.0 异步同步到 Supabase（ai_conversations + ai_messages）
  _syncTutorSessionToSupabase(session);
}

/**
 * v4.0 异步同步对话到 Supabase
 * 非阻塞，失败时静默（localStorage 已是数据真相源）
 */
async function _syncTutorSessionToSupabase(session) {
  if (!window.saveAIConversation || !window.saveAIMessage) return;
  try {
    // 1. upsert 对话
    var convResult = await window.saveAIConversation({
      id: session.id,
      type: 'tutor',
      title: session.title,
      metadata: { mode: session.mode, messageCount: session.messages.length }
    });
    if (!convResult.ok) return;

    // 2. 仅同步最后一条消息（避免重复插入）
    var lastMsg = session.messages[session.messages.length - 1];
    if (!lastMsg) return;
    await window.saveAIMessage({
      conversation_id: session.id,
      role: lastMsg.role === 'user' ? 'user' : 'assistant',
      content: lastMsg.content || '',
      metadata: { mode: session.mode, ts: lastMsg.ts || Date.now() }
    });
  } catch (e) {
    /* 静默 */
  }
}

function _loadTutorSession(sessionId) {
  var sessions = _loadTutorSessions();
  for (var i = 0; i < sessions.length; i++) {
    if (sessions[i].id === sessionId) {
      _tutorState.messages = sessions[i].messages || [];
      _tutorState.currentMode = 'general';
      _tutorState.sessionId = sessionId;
      return true;
    }
  }
  return false;
}

function _newTutorSession() {
  _tutorState.messages = [];
  _tutorState.sessionId = null;
  _tutorState.currentMode = 'general';
  _setStreamPhase('idle');
}

/**
 * 渲染消息列表
 * 新增：容器为 null（切路由后回调仍在执行） 时直接 return，不再抛 Cannot set innerHTML of null
 */
function _renderTutorMessages(container) {
  if (!container) return;
  container.innerHTML = '';
  if (_tutorState.messages.length === 0) {
    var mode = TUTOR_MODES[_tutorState.currentMode];
    container.innerHTML = '<div class="tutor-welcome">' +
      '<div class="tutor-welcome-title">' + mode.label + '</div>' +
      '<div class="tutor-welcome-desc">' + mode.greeting + '</div>' +
      '</div>';
    return;
  }
  _tutorState.messages.forEach(function(msg) {
    var msgEl = document.createElement('div');
    msgEl.className = 'tutor-msg tutor-msg--' + msg.role;
    var content = msg.role === 'user' ? escapeHtml(msg.content) : _tutorMarkdown(msg.content);
    // P1-11（Issue #120）：AI 首字到达前的「思考中」三点占位
    // （CSS .tutor-typing-dots 此前已注入样式但从未被创建——本处补上）
    // 仅在「该消息正处于流式等待」时展示，收尾/出错（phase 回到 idle）即消失。
    if (msg.role === 'ai' && !msg.content &&
        _tutorState.streamPhase !== 'idle' && _tutorState.currentAiMsgId === msg.id) {
      content = '<div class="tutor-typing-dots" role="status" aria-label="AI 正在思考"><span></span><span></span><span></span></div>';
    }
    msgEl.innerHTML = '<div class="tutor-msg-bubble" id="msg-' + msg.id + '">' + content + '</div>';
    container.appendChild(msgEl);
  });
  try { container.scrollTop = container.scrollHeight; } catch (e) {}
}

/* 暂停 / 恢复 / 停止（导出到 window 便于调试和快捷键调用） */
function _tutorFlushPendingStreaming() {
  if (_tutorState && typeof _tutorState._flushPendingStreaming === 'function') {
    try { _tutorState._flushPendingStreaming(); } catch (e) {}
  }
}
function _tutorPauseOrResume() {
  var phase = _tutorState.streamPhase;
  if (phase === 'streaming') {
    _setStreamPhase('paused');
  } else if (phase === 'paused') {
    _setStreamPhase('streaming');
    // 立刻把暂停期间攒的 pendingBuffer flush 到 DOM
    _tutorFlushPendingStreaming();
  }
}
function _tutorStop() {
  var phase = _tutorState.streamPhase;
  if (phase === 'idle') return;
  _setStreamPhase('stopping');
  var ctrl = _tutorState.abortController;
  if (ctrl && typeof ctrl.abort === 'function') {
    try { ctrl.abort(); } catch (e) {}
  }
  // 兜底：1.5s 后若仍没进 idle 强制归位（onDone/onError 没触发的异常情况）
  setTimeout(function () {
    if (_tutorState.streamPhase === 'stopping') _setStreamPhase('idle');
  }, 1500);
}

/**
 * 发送消息（SSE 流式）
 *  - 输入/输出 双端脱敏（_tutorRedact），防止 JWT/密钥 被持久化或展示
 *  - scheduleRender 在 paused 时只收不刷；恢复时调用 _flushPendingStreaming 一次性补齐
 *  - bubble/messagesEl 全部做空值保护（修复控制台 Cannot set properties of null）
 */
function _sendTutorMessage(text) {
  if (_tutorState.streamPhase !== 'idle' || !text.trim()) return;

  var userRaw = text.trim();
  // 输入端先脱敏再存（防止用户把 JWT 不小心贴进对话被 localStorage 持久化）
  var userRedacted = _tutorRedact(userRaw);
  var userMsg = { id: 'msg_' + Date.now(), role: 'user', content: userRedacted };
  _tutorState.messages.push(userMsg);

  var aiMsg = { id: 'msg_' + (Date.now() + 1) + '_ai', role: 'ai', content: '' };
  _tutorState.messages.push(aiMsg);

  _setStreamPhase('streaming');

  var messagesEl = document.getElementById('tutor-messages');
  _renderTutorMessages(messagesEl);

  var input = document.getElementById('tutor-input');
  if (input) { input.value = ''; input.style.height = 'auto'; }

  var history = _tutorState.messages.slice(0, -1).map(function(m) {
    return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content };
  });

  // P1-24：开新请求前先中止上一个仍在飞的孤儿请求，避免重复占用模型连接
  if (_tutorState.abortController) {
    try { _tutorState.abortController.abort(); } catch (e) { /* 忽略 */ }
  }
  _tutorState.abortController = new AbortController();
  // 绑定到 currentAiMsg，后面停止/恢复/flush 都以这个 msgId 为准
  _tutorState.currentAiMsgId = aiMsg.id;

  // P1 修复：window.AiClient 是「对象」而非函数，原 `typeof === 'function'` 判断恒为 false，
  // 会永远走 {ok:true} 兜底而跳过 canUse 门禁 → 无 Key 时仍调 streamChat，产生未处理 Promise 拒绝。
  // 改为检测 canUse 方法是否存在，未加载时再兜底。
  var aiCheck = (window.AiClient && typeof window.AiClient.canUse === 'function')
    ? window.AiClient.canUse()
    : { ok: true, useBackend: true };
  if (!aiCheck.ok) {
    _finishTutorStream(aiMsg, aiCheck.reason || '今日 AI 调用已达上限，请明日再试。');
    return;
  }

  var sysPrompt = (typeof TUTOR_SYSTEM_PROMPTS !== 'undefined')
    ? (TUTOR_SYSTEM_PROMPTS.general || '你是一位生物学导师，请耐心解答学生的生物学问题。')
    : '你是一位生物学导师，请耐心解答学生的生物学问题。';
  sysPrompt += ' 不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块，用文字说明即可。';
  var aiMessages = [{ role: 'system', content: sysPrompt }];
  for (var i = 0; i < history.length; i++) {
    var h = history[i];
    if (h.role && h.content) aiMessages.push({ role: h.role, content: h.content });
  }
  // 发给 AI 的请求体仍用用户原始输入（保证语义不被脱敏搞坏），但展示/持久化用 userRedacted
  aiMessages.push({ role: 'user', content: userRaw });

  var fullText = '';
  var pendingRender = false;
  var lastRenderedLen = 0;

  function appendToBubble(newText, scrollToBottom) {
    var bubble = document.getElementById('msg-' + aiMsg.id);
    if (!bubble) return false;
    if (!newText) {
      // 纯刷新光标（暂停时 caller 会跳过；这里直接返回避免空 span）
      return true;
    }
    newText = newText.replace(/\[\[ANIM:\w+\]\]/g, '');
    var span = document.createElement('span');
    span.className = 'tutor-streaming-text';
    span.textContent = newText;
    // P1-11（Issue #120）：首字到达时移除「思考中」三点占位
    var oldDots = bubble.querySelector('.tutor-typing-dots');
    if (oldDots) oldDots.remove();
    var oldCursor = bubble.querySelector('.tutor-typing');
    if (oldCursor) oldCursor.remove();
    bubble.appendChild(span);
    var cursor = document.createElement('span');
    cursor.className = 'tutor-typing';
    bubble.appendChild(cursor);
    if (scrollToBottom && messagesEl) {
      try { messagesEl.scrollTop = messagesEl.scrollHeight; } catch (e) {}
    }
    return true;
  }

  // 真正把 pendingBuffer / fullText.slice(lastRenderedLen) 刷到 DOM
  _tutorState._flushPendingStreaming = function _flushPendingStreaming() {
    if (_tutorState.streamPhase !== 'streaming') return;
    if (lastRenderedLen >= fullText.length) return;
    var newText = fullText.slice(lastRenderedLen);
    lastRenderedLen = fullText.length;
    appendToBubble(newText, true);
  };
  function _flushPendingStreaming() {
    if (_tutorState._flushPendingStreaming) _tutorState._flushPendingStreaming();
  }

  function scheduleRender() {
    if (pendingRender) return;
    pendingRender = true;
    setTimeout(function() {
      pendingRender = false;
      // 容器不存在 → 说明用户切走了，直接收尾内存态即可
      if (!document.getElementById('tutor-messages') || !document.getElementById('msg-' + aiMsg.id)) {
        aiMsg.content = _stripAnim(_tutorRedact(fullText));
        _tutorState.streamPhase = 'idle';
        return;
      }
      if (_tutorState.streamPhase === 'paused') {
        // 暂停：不 append DOM，光标保持停住
        return;
      }
      if (_tutorState.streamPhase === 'streaming') {
        _tutorFlushPendingStreaming();
      }
    }, 60);
  }

  window.AiClient.streamChat({
    messages: aiMessages,
    temperature: 0.7,
    maxTokens: 2048,
    signal: _tutorState.abortController.signal,
    onChunk: function (chunk) {
      if (_tutorState.streamPhase === 'stopping' || _tutorState.streamPhase === 'idle') return;
      fullText += chunk;
      scheduleRender();
    },
    onDone: function () {
      // 停止 → 保留已经输出的部分；空内容才提示
      if (!fullText.trim() && _tutorState.streamPhase !== 'stopping') {
        _finishTutorStream(aiMsg, '（AI 未返回内容，请重试）');
      } else {
        _finishTutorStream(aiMsg, fullText, _tutorState.streamPhase === 'stopping');
      }
    },
    onError: function (err) {
      // 用户手动 abort 不弹错误
      if (err && err.name === 'AbortError') {
        _finishTutorStream(aiMsg, fullText, true);
      } else {
        _finishTutorStream(aiMsg, '注意：' + (err && err.message ? err.message : String(err || '网络异常')));
      }
    }
  });
}

/**
 * 结束一条 AI 流式消息
 *  - 参数 stopped=true：是用户主动停止的，不加错误前缀也不覆盖 content
 *  - 容器/气泡不存在时不 crash，仅收尾状态 + 持久化（内存态保留，等用户切回 #/tutor 仍可看到已生成内容）
 */
function _finishTutorStream(aiMsg, fullText, stopped) {
  var finalText = stopped ? (fullText || '') : (fullText || '');
  var redacted = _tutorRedact(_stripAnim(finalText));
  if (stopped && redacted) {
    aiMsg.content = redacted + '\n\n*（已停止输出）*';
  } else {
    aiMsg.content = redacted;
  }
  _setStreamPhase('idle');
  _tutorState.currentAiMsgId = null;
  _tutorState._flushPendingStreaming = null;

  var messagesEl = document.getElementById('tutor-messages');
  // 修复点：messagesEl / bubble 空值保护 —— 之前这里直接 _renderTutorMessages(null) 抛 Cannot set innerHTML of null
  if (messagesEl) {
    _renderTutorMessages(messagesEl);
    var bubble = document.getElementById('msg-' + aiMsg.id);
    if (bubble) {
      var tmpSpans = bubble.querySelectorAll('.tutor-streaming-text, .tutor-typing, .tutor-typing-dots');
      tmpSpans.forEach(function(s) { s.remove(); });
    }
  }
  _persistCurrentSession();
}

/* 未配置 AI Key / 额度用尽时的前置引导 —— 避免用户进入对话页后无处可去 */
function _tutorAiGate(target) {
  if (!window.AiClient || typeof window.AiClient.canUse !== 'function') return false;
  var check;
  try { check = window.AiClient.canUse(); } catch (e) { return false; }
  if (!check || check.ok) return false;

  var hasKey = false;
  try {
    hasKey = !!(window.BioQuestKeyStore && window.BioQuestKeyStore.get &&
      window.BioQuestKeyStore.get().length >= 8);
  } catch (e) { hasKey = false; }

  if (hasKey) {
    // 已配置 Key 但仍不可用（多为当日额度用尽）→ 只给提示，不再展示表单
    target.innerHTML = '<div class="tutor-page"><div class="tutor-welcome">' +
      '<div class="tutor-welcome-title">AI 暂时不可用</div>' +
      '<div class="tutor-welcome-desc">' + escapeHtml(check.reason || '请稍后再试。') + '</div>' +
      '</div></div>';
  } else {
    _renderTutorSetup(target);
  }
  return true;
}

/* 内联的 API Key 配置卡：保存后即可直接开始对话（无需登录） */
function _renderTutorSetup(target) {
  target.innerHTML = '<div class="tutor-page"><div class="tutor-setup">' +
    '<div class="tutor-setup-title">先配置一个免费的 AI Key</div>' +
    '<div class="tutor-setup-desc">AI 导师由你自己的大模型 Key 驱动，直连服务商，Key 只保存在本机、不上传服务器。智谱 GLM、DeepSeek 均有免费额度。</div>' +
    '<div class="tutor-setup-field">' +
    '<label class="tutor-setup-label" for="tutor-provider">服务商</label>' +
    '<select id="tutor-provider">' +
    '<option value="zhipu">智谱 GLM（glm-4-flash 免费）</option>' +
    '<option value="deepseek">DeepSeek</option>' +
    '<option value="qwen">通义千问</option>' +
    '<option value="moonshot">Kimi</option>' +
    '<option value="nvidia">NVIDIA NIM</option>' +
    '<option value="siliconflow">硅基流动</option>' +
    '</select></div>' +
    '<div class="tutor-setup-field">' +
    '<label class="tutor-setup-label" for="tutor-key-input">API Key</label>' +
    '<input type="password" id="tutor-key-input" placeholder="sk-..." autocomplete="off">' +
    '</div>' +
    '<label class="tutor-setup-remember">' +
    '<input type="checkbox" id="tutor-key-remember" checked> 本标签页内记住（关闭标签页即清除）</label>' +
    '<button type="button" class="tutor-setup-btn" id="tutor-key-save">保存并开始对话</button>' +
    '<div class="tutor-setup-msg" id="tutor-key-msg"></div>' +
    '<div class="tutor-setup-foot">也可以稍后在「我的 → 设置」中修改 Key。不配置 Key 时，练习、模考、错题本等核心功能仍可正常使用。</div>' +
    '</div></div>';

  var saveBtn = document.getElementById('tutor-key-save');
  if (!saveBtn) return;
  saveBtn.addEventListener('click', function () {
    var input = document.getElementById('tutor-key-input');
    var key = input ? String(input.value).trim() : '';
    var msgEl = document.getElementById('tutor-key-msg');
    if (key.length < 8) {
      if (msgEl) msgEl.textContent = '请输入有效的 API Key（至少 8 位）';
      return;
    }
    var providerEl = document.getElementById('tutor-provider');
    var provider = providerEl ? providerEl.value : 'zhipu';
    var rememberEl = document.getElementById('tutor-key-remember');
    var remember = !!(rememberEl && rememberEl.checked);
    try {
      if (window.BioQuestKeyStore && typeof window.BioQuestKeyStore.set === 'function') {
        window.BioQuestKeyStore.set(key, remember);
      }
      // provider/model 为非敏感偏好，可落 localStorage；Key 本身绝不写入
      var prev = {};
      try { var raw = localStorage.getItem('bioquest_ai_key_config'); if (raw) prev = JSON.parse(raw) || {}; } catch (e) { prev = {}; }
      prev.provider = provider;
      prev.model = prev.model || '';
      prev.apiKey = '';
      localStorage.setItem('bioquest_ai_key_config', JSON.stringify(prev));
    } catch (e) {
      if (msgEl) msgEl.textContent = '保存失败，请检查浏览器是否禁用了本地存储';
      return;
    }
    renderTutorPage(target);
  });
}

/**
 * 主渲染函数 — Telegram 风格
 */
function renderTutorPage(target) {
  injectTutorStyles();

  // 无 Key / 额度用尽时不进入对话界面，先给可操作的引导
  if (_tutorAiGate(target)) return;

  var html = '<div class="tutor-page">';

  // 消息区
  html += '<div class="tutor-messages" id="tutor-messages" role="log" aria-live="polite"></div>';

  // 快捷问题（仅首次显示）
  if (_tutorState.messages.length === 0) {
    html += '<div class="tutor-quick" id="tutor-quick">';
    TUTOR_QUICK_QUESTIONS.forEach(function(q) {
      html += '<button class="tutor-quick-btn" data-q="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>';
    });
    html += '</div>';
  }

  // 输入栏（新增：暂停/停止按钮；仅流式期间可用）
  html += '<div class="tutor-input-bar">' +
    '<button class="tutor-export" id="tutor-export" title="导出对话">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
    '</button>' +
    '<button class="tutor-ctrl tutor-pause" id="tutor-pause" disabled title="" aria-hidden="true">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' +
    '</button>' +
    '<button class="tutor-ctrl tutor-stop" id="tutor-stop" disabled title="">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>' +
    '</button>' +
    '<div class="tutor-input-wrap">' +
    '<textarea class="tutor-input" id="tutor-input" placeholder="输入消息…（Enter 发送，Shift+Enter 换行）" rows="1"></textarea>' +
    '</div>' +
    '<button class="tutor-send" id="tutor-send" title="发送 (Enter)">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
    '</button></div>';

  html += '</div>';

  target.innerHTML = html;

  var messagesEl = document.getElementById('tutor-messages');
  _renderTutorMessages(messagesEl);

  // 让按钮 disabled / label 与当前 phase 同步（用户切走又切回时不会"暂停按钮还亮着"）
  _setStreamPhase(_tutorState.streamPhase);

  // 快捷问题
  document.querySelectorAll('.tutor-quick-btn').forEach(function(el) {
    el.addEventListener('click', function() {
      var input = document.getElementById('tutor-input');
      input.value = el.dataset.q;
      _sendTutorMessage(input.value);
      var quick = document.getElementById('tutor-quick');
      if (quick) quick.remove();
    });
  });

  // 发送按钮
  var sendBtn = document.getElementById('tutor-send');
  if (sendBtn) sendBtn.addEventListener('click', function() {
    var input = document.getElementById('tutor-input');
    _sendTutorMessage(input ? input.value : '');
    var quick = document.getElementById('tutor-quick');
    if (quick) quick.remove();
  });

  // v5.0：消费知识图谱「AI 讲解」预填（sessionStorage.bioquest_tutor_prefill）
  // —— 图谱节点/百科词条点击「AI 讲解」后跳转本页并自动发出带上下文的问题
  try {
    var kgPrefill = sessionStorage.getItem('bioquest_tutor_prefill');
    if (kgPrefill) {
      sessionStorage.removeItem('bioquest_tutor_prefill');
      var pInput = document.getElementById('tutor-input');
      if (pInput) pInput.value = kgPrefill;
      setTimeout(function () { _sendTutorMessage(kgPrefill); }, 80);
    }
  } catch (e) { /* 忽略 */ }

  // 暂停/继续 按钮
  var pauseBtn = document.getElementById('tutor-pause');
  if (pauseBtn) pauseBtn.addEventListener('click', _tutorPauseOrResume);

  // 停止按钮
  var stopBtn = document.getElementById('tutor-stop');
  if (stopBtn) stopBtn.addEventListener('click', _tutorStop);

  // 输入框
  var input = document.getElementById('tutor-input');
  if (input) {
    input.addEventListener('keydown', function(e) {
      // 快捷键：流式期间 Ctrl/⌘+. → 停止；Ctrl/⌘+/ → 暂停切换
      var ctrlOrCmd = e.ctrlKey || e.metaKey;
      if (ctrlOrCmd && (e.key === '.' || e.key === 'Stop')) {
        e.preventDefault();
        _tutorStop();
        return;
      }
      if (ctrlOrCmd && (e.key === '/' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        _tutorPauseOrResume();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _sendTutorMessage(this.value);
        var quick = document.getElementById('tutor-quick');
        if (quick) quick.remove();
      }
    });
    input.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
  }

  // 导出
  var exportBtn = document.getElementById('tutor-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', function() {
      if (_tutorState.messages.length === 0) return;
      var md = '# TATABOX AI 导师对话记录\n\n';
      md += '- **时间**：' + new Date().toLocaleString('zh-CN') + '\n';
      md += '- **消息数**：' + _tutorState.messages.length + '\n\n---\n\n';
      _tutorState.messages.forEach(function(msg) {
        var role = msg.role === 'user' ? '我' : 'AI';
        md += '## ' + role + '\n\n' + msg.content + '\n\n';
      });
      var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'bioquest-tutor-' + Date.now() + '.md';
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}

/**
 * 模块入口
 */
function initTutor(target) {
  if (!target) target = document.getElementById('page-content');
  if (!target) return;
  renderTutorPage(target);
}

window.initTutor = initTutor;
window.renderTutorPage = renderTutorPage;
window._tutorPauseOrResume = _tutorPauseOrResume;
window._tutorStop = _tutorStop;
