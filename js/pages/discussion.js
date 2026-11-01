/**
 * ============================================================
 * TATABOX — AI 多智能体协作讨论模块
 * 三大核心功能：
 *   1. 多智能体群聊协作：自动召集 3-5 位智能体，依次发言、自主协商、综合观点
 *   2. 流水线模式：数据采集 → 撰写 → 校对 → 整合 四阶段顺序接力
 *   3. 自定义智能体 + 完整成果导出：自建角色/风格/开场白；FinalResult 导出 Word/PDF/Markdown/JSON
 * ============================================================
 */

'use strict';

var _discussionStylesInjected = false;
var _discFocusTrap = null;

function _releaseDiscModal() {
  if (_discFocusTrap) { _discFocusTrap.release(); _discFocusTrap = null; }
}

function injectDiscussionStyles() {
  if (_discussionStylesInjected) return;
  _discussionStylesInjected = true;

  var style = document.createElement('style');
  style.id = 'bioquest-discussion-styles';
  style.textContent = [
    '.discussion-page { max-width: 1000px; margin: 0 auto; padding: 14px 16px 100px; display: flex; flex-direction: column; min-height: calc(100vh - var(--header-height,64px) - 56px); box-sizing: border-box; }',

    /* 顶部模式切换 */
    '.disc-mode-bar { display:flex; gap:8px; justify-content:center; margin-bottom:12px; flex-shrink:0; }',
    '.disc-mode-btn { padding:8px 18px; border:1.5px solid var(--border-light,#ece8e1); background:var(--surface-primary,#fff); border-radius:16px; cursor:pointer; font-size:0.84rem; font-weight:600; color:var(--text-secondary,#4a4a4a); transition:all .15s; }',
    '.disc-mode-btn.active { background:var(--color-sage,#5a7d5c); color:#fff; border-color:var(--color-sage,#5a7d5c); }',

    /* 智能体选择条 */
    '.disc-agent-bar { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; align-items:center; margin-bottom:12px; flex-shrink:0; padding:10px; background:var(--surface-primary,#fff); border-radius:12px; box-shadow:var(--shadow-sm); }',
    '.disc-agent-bar-label { font-size:0.76rem; color:var(--text-muted,#8a8a8a); margin-right:4px; }',
    '.disc-agent-chip { display:inline-flex; align-items:center; gap:5px; padding:5px 12px; border-radius:12px; border:1.5px solid var(--border-light,#ece8e1); background:var(--surface-secondary,#faf7f2); font-size:0.78rem; cursor:pointer; transition:all .15s; user-select:none; }',
    '.disc-agent-chip.active { border-color:var(--color-sage,#5a7d5c); background:rgba(90,125,92,0.12); color:var(--color-sage,#3a6b4a); font-weight:600; }',
    '.disc-agent-chip:active { transform:scale(0.95); }',
    '.disc-agent-chip--add { border-style:dashed; color:var(--color-amber,#c4956a); border-color:var(--color-amber,#c4956a); }',
    '.disc-agent-count { font-size:0.72rem; color:var(--text-muted,#8a8a8a); margin-left:auto; }',

    /* 消息区 */
    '.discussion-messages { flex:1; overflow-y:auto; padding:8px 0 16px; -webkit-overflow-scrolling:touch; scroll-behavior:smooth; }',
    '.discussion-round { margin-bottom:24px; animation:discussionRoundIn .3s ease; }',
    '@keyframes discussionRoundIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }',

    /* 用户提问 */
    '.discussion-user { display:flex; justify-content:flex-end; margin-bottom:14px; }',
    '.discussion-user-bubble { background:var(--color-sage,#5a7d5c); color:#fff; padding:10px 16px; border-radius:16px 4px 16px 16px; font-size:0.9rem; line-height:1.6; max-width:80%; word-wrap:break-word; overflow-wrap:break-word; box-shadow:var(--shadow-sm); }',

    /* 群聊：智能体气泡（横向，头像+名字在左，内容在右） */
    '.disc-agent-reply { display:flex; gap:10px; margin-bottom:12px; align-items:flex-start; }',
    '.disc-agent-reply--right { flex-direction:row-reverse; }',
    '.disc-agent-avatar { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:1rem; flex-shrink:0; font-weight:700; }',
    '.disc-agent-bubble { flex:1; min-width:0; background:var(--surface-primary,#fff); border:1px solid var(--border-light,#ece8e1); border-radius:12px; padding:12px 14px; box-shadow:var(--shadow-sm); }',
    '.disc-agent-reply--right .disc-agent-bubble { background:rgba(90,125,92,0.06); border-color:rgba(90,125,92,0.2); }',
    '.disc-agent-name-row { display:flex; align-items:center; gap:6px; margin-bottom:6px; }',
    '.disc-agent-name { font-size:0.82rem; font-weight:700; color:var(--color-deep,#1a3a2a); }',
    '.disc-agent-role-tag { font-size:0.66rem; padding:1px 7px; border-radius:8px; background:rgba(0,0,0,0.05); color:var(--text-muted,#8a8a8a); }',
    '.disc-agent-body { font-size:0.88rem; line-height:1.7; color:var(--text-primary,#1a1a1a); }',
    '.disc-agent-body p { margin:0 0 8px; } .disc-agent-body p:last-child { margin-bottom:0; }',
    '.disc-agent-body code { background:rgba(0,0,0,0.06); padding:2px 6px; border-radius:4px; font-family:var(--font-mono,monospace); font-size:.85em; }',
    '.disc-agent-body pre { background:rgba(0,0,0,0.05); padding:10px; border-radius:8px; overflow-x:auto; font-size:0.8rem; }',

    /* 流水线阶段卡 */
    '.disc-stage { background:var(--surface-primary,#fff); border:1px solid var(--border-light,#ece8e1); border-radius:12px; margin-bottom:12px; overflow:hidden; box-shadow:var(--shadow-sm); }',
    '.disc-stage-head { display:flex; align-items:center; gap:10px; padding:10px 14px; background:rgba(90,125,92,0.08); border-bottom:1px solid var(--border-light,#ece8e1); }',
    '.disc-stage-icon { width:28px; height:28px; border-radius:8px; background:var(--color-sage,#5a7d5c); color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.9rem; font-weight:700; flex-shrink:0; }',
    '.disc-stage-name { font-size:0.9rem; font-weight:700; color:var(--color-deep,#1a3a2a); }',
    '.disc-stage-role { font-size:0.72rem; color:var(--text-muted,#8a8a8a); margin-left:auto; }',
    '.disc-stage-body { padding:12px 14px; font-size:0.88rem; line-height:1.7; color:var(--text-primary,#1a1a1a); min-height:48px; }',
    '.disc-stage-body p { margin:0 0 8px; } .disc-stage-body p:last-child { margin-bottom:0; }',
    '.disc-stage--pending .disc-stage-body { display:flex; align-items:center; color:var(--text-muted,#8a8a8a); font-size:0.82rem; }',
    '.disc-stage--final { border:1.5px solid rgba(232,168,48,0.4); }',
    '.disc-stage--final .disc-stage-icon { background:var(--color-amber,#c4956a); }',

    /* 综合观点 */
    '.discussion-synthesis { border-radius:12px; padding:14px 18px; background:rgba(232,168,48,0.06); border:1.5px solid rgba(232,168,48,0.25); margin-top:8px; }',
    '.discussion-synthesis-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:0.9rem; font-weight:700; color:var(--color-amber,#c4956a); font-family:var(--font-serif,"Noto Serif SC",serif); }',
    '.discussion-synthesis-body { font-size:0.88rem; line-height:1.75; color:var(--text-primary,#1a1a1a); }',
    '.discussion-synthesis-body p { margin:0 0 8px; } .discussion-synthesis-body p:last-child { margin-bottom:0; }',

    /* 流式光标与等待 */
    '.discussion-typing { display:inline-block; width:7px; height:14px; background:currentColor; margin-left:2px; vertical-align:middle; animation:discussionBlink .8s infinite; }',
    '@keyframes discussionBlink { 0%,50%{opacity:1;} 51%,100%{opacity:0;} }',
    '.discussion-dots { display:inline-flex; gap:4px; margin-left:6px; }',
    '.discussion-dots span { width:6px; height:6px; border-radius:50%; background:currentColor; opacity:.4; animation:discussionDot 1.2s infinite; }',
    '.discussion-dots span:nth-child(2){animation-delay:.2s;} .discussion-dots span:nth-child(3){animation-delay:.4s;}',
    '@keyframes discussionDot { 0%,60%,100%{opacity:.3;transform:translateY(0);} 30%{opacity:1;transform:translateY(-3px);} }',

    /* 输入区 */
    '.discussion-input-bar { display:flex; gap:8px; padding:10px 0 4px; flex-shrink:0; border-top:1px solid var(--border-light,#ece8e1); }',
    '.discussion-input { flex:1; padding:12px 16px; border:1.5px solid var(--border-default,#e0dcd5); border-radius:16px; background:var(--surface-primary,#fff); color:var(--text-primary,#1a1a1a); font-size:0.9rem; outline:none; resize:none; max-height:100px; min-height:44px; font-family:inherit; line-height:1.5; transition:border-color .2s; }',
    '.discussion-input:focus { border-color:var(--color-amber,#c4956a); }',
    '.discussion-send { width:44px; height:44px; border:none; border-radius:50%; background:var(--color-amber,#c4956a); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all .15s; }',
    '.discussion-send:active { transform:scale(.92); }',
    '.discussion-send:disabled { background:var(--border-light,#ece8e1); cursor:not-allowed; }',
    '.discussion-icon-btn { background:none; border:none; color:var(--text-muted,#8a8a8a); padding:8px; cursor:pointer; flex-shrink:0; border-radius:50%; transition:all .15s; }',
    '.discussion-icon-btn:hover { background:rgba(0,0,0,0.05); color:var(--color-sage,#5a7d5c); }',
    '.discussion-icon-btn:disabled { opacity:.4; cursor:not-allowed; }',

    /* 空状态 */
    '.discussion-welcome { text-align:center; padding:40px 20px 24px; color:var(--text-muted,#8a8a8a); }',
    '.discussion-welcome-title { font-family:var(--font-serif,"Noto Serif SC",serif); font-size:1.2rem; font-weight:700; color:var(--color-deep,#1a3a2a); margin-bottom:6px; }',
    '.discussion-welcome-desc { font-size:0.85rem; line-height:1.6; margin-bottom:16px; }',
    '.discussion-quick { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }',
    '.discussion-quick-btn { padding:6px 14px; border-radius:16px; background:var(--surface-primary,#fff); border:1px solid var(--border-light,#ece8e1); font-size:0.78rem; color:var(--text-secondary,#4a4a4a); cursor:pointer; transition:all .15s; }',
    '.discussion-quick-btn:active { transform:scale(.96); background:var(--color-amber,#c4956a); color:#fff; }',

    /* 自定义智能体模态 */
    '.disc-modal-overlay { position:fixed; inset:0; background:rgba(5,10,7,0.66); z-index:9998; display:flex; align-items:center; justify-content:center; padding:20px; }',
    '.disc-modal { background:var(--surface-primary,#fff); border-radius:16px; width:100%; max-width:460px; max-height:90vh; overflow-y:auto; padding:24px; box-shadow:var(--shadow-floating); }',
    '.disc-modal h3 { margin:0 0 16px; font-family:var(--font-serif,serif); color:var(--color-deep,#1a3a2a); font-size:1.15rem; }',
    '.disc-form-group { margin-bottom:14px; }',
    '.disc-form-group label { display:block; margin-bottom:5px; font-size:0.84rem; font-weight:600; color:var(--text-secondary,#4a4a4a); }',
    '.disc-form-group input, .disc-form-group textarea { width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid var(--border-light,#e3e0d8); border-radius:8px; font-size:0.9rem; background:var(--surface-primary,#fff); color:var(--text-primary,#1a1a1a); outline:none; font-family:inherit; }',
    '.disc-form-group textarea { min-height:70px; resize:vertical; }',
    '.disc-form-group input:focus, .disc-form-group textarea:focus { border-color:var(--color-sage,#5a7d5c); }',
    '.disc-modal-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:18px; }',
    '.disc-btn { padding:9px 18px; border:none; border-radius:8px; cursor:pointer; font-size:0.86rem; font-weight:600; }',
    '.disc-btn-primary { background:var(--color-sage,#5a7d5c); color:#fff; }',
    '.disc-btn-ghost { background:transparent; border:1px solid var(--border-light,#e3e0d8); color:var(--text-primary,#1a2f1d); }',
    '.disc-btn-danger { background:transparent; border:1px solid rgba(229,62,62,0.3); color:var(--color-error,#e53e3e); }',
    '.disc-custom-list { margin-bottom:14px; }',
    '.disc-custom-item { display:flex; align-items:center; gap:8px; padding:8px 12px; border:1px solid var(--border-light,#ece8e1); border-radius:8px; margin-bottom:6px; font-size:0.84rem; }',
    '.disc-custom-item .disc-custom-name { flex:1; font-weight:600; color:var(--color-deep,#1a3a2a); }',
    '.disc-custom-item .disc-custom-role { font-size:0.72rem; color:var(--text-muted,#8a8a8a); }',

    /* FinalResult 面板 */
    '.disc-final-panel { background:rgba(58,140,92,0.06); border:1.5px solid rgba(58,140,92,0.25); border-radius:12px; padding:18px; margin-top:12px; }',
    '.disc-final-head { display:flex; align-items:center; gap:8px; margin-bottom:10px; }',
    '.disc-final-title { font-family:var(--font-serif,serif); font-size:1.05rem; font-weight:700; color:var(--color-deep,#1a3a2a); }',
    '.disc-final-summary { font-size:0.86rem; color:var(--text-secondary,#4a4a4a); line-height:1.7; margin-bottom:12px; padding:10px 12px; background:rgba(255,255,255,0.5); border-radius:8px; }',
    '.disc-final-section { margin-bottom:12px; }',
    '.disc-final-section h4 { margin:0 0 6px; font-size:0.92rem; color:var(--color-sage,#3a6b4a); }',
    '.disc-final-section p { margin:0; font-size:0.86rem; line-height:1.7; color:var(--text-primary,#1a1a1a); white-space:pre-wrap; }',
    '.disc-export-row { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }',
    '.disc-export-btn { display:inline-flex; align-items:center; gap:5px; padding:7px 14px; border:1px solid var(--border-light,#ece8e1); border-radius:8px; background:var(--surface-primary,#fff); color:var(--color-deep,#1a3a2a); font-size:0.8rem; font-weight:600; cursor:pointer; transition:all .15s; }',
    '.disc-export-btn:active { transform:scale(.96); }',
    '.disc-export-btn:hover { border-color:var(--color-sage,#5a7d5c); color:var(--color-sage,#3a6b4a); }',

    '.disc-svg-box { margin:8px 0; padding:10px; background:var(--surface-primary,#fff); border:1px solid var(--border-light,#ece8e1); border-radius:8px; text-align:center; overflow-x:auto; }',
    '.disc-svg-box svg { max-width:100%; height:auto; }',

    '@media (max-width:768px) { .discussion-page { padding:12px 12px 90px; } .disc-agent-bar { padding:8px; } }'
  ].join('\n');
  document.head.appendChild(style);
}

/* ============== 预设智能体池（以生物学科为智能体） ============== */
var DISC_PRESET_AGENTS = [
  { key: 'genetics',  name: '遗传学',   role: '遗传学',     color: '#5a7d5c',
    system_prompt: '你是遗传学专家，擅长从基因、染色体、遗传规律、分子机制等层面分析问题。' +
                   '请用专业且通俗的语言回答，结合遗传学视角，可适当引用经典实验与定律。回答控制在 300 字以内。不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块。' },
  { key: 'ecology',   name: '生态学',   role: '生态学',     color: '#3a8c5c',
    system_prompt: '你是生态学专家，擅长从种群、群落、生态系统等宏观层面分析生物学问题。' +
                   '请用专业且通俗的语言回答，结合生态学视角。回答控制在 300 字以内。不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块。' },
  { key: 'evolution', name: '进化生物学', role: '进化论',   color: '#d4974a',
    system_prompt: '你是进化生物学专家，擅长从自然选择、物种形成、适应辐射、系统发育等层面分析问题。' +
                   '请用专业且通俗的语言回答，结合进化视角。回答控制在 300 字以内。不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块。' },
  { key: 'physiology', name: '生理学',  role: '生理学',     color: '#c45a7a',
    system_prompt: '你是生理学专家，擅长从器官、系统、稳态调节、神经体液调节等层面分析生物学问题。' +
                   '请用专业且通俗的语言回答，结合生理学视角。回答控制在 300 字以内。不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块。' },
  { key: 'biochem',   name: '生物化学', role: '生物化学',   color: '#8b5cf6',
    system_prompt: '你是生物化学专家，擅长从分子反应、酶、代谢通路等微观化学层面分析生物学问题。' +
                   '请用专业且通俗的语言回答，结合生化视角。回答控制在 300 字以内。不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块。' },
  { key: 'cellbio',   name: '细胞生物学', role: '细胞生物学', color: '#4a7fc1',
    system_prompt: '你是细胞生物学专家，擅长从细胞结构、细胞器功能、细胞分裂、信号传导等层面分析问题。' +
                   '请用专业且通俗的语言回答，结合细胞生物学视角。回答控制在 300 字以内。不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块。' }
];

var DISC_CUSTOM_LS_KEY = 'bioquest_custom_agents';

/* 流水线四阶段（与后端对应，用于前端展示） */
var DISC_STAGES = [
  { key: 'collect',   name: '数据采集', role: '采集员', icon: '1',
    system_prompt: '你是数据采集员，负责从用户需求中提取关键信息、列出所需资料和数据点。输出条理清晰的要点列表。不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块。',
    prompt: '请提取关键信息并列出资料清单。' },
  { key: 'write',     name: '撰写',     role: '撰写员', icon: '2',
    system_prompt: '你是撰写员，基于采集阶段的数据撰写完整内容。语言专业、结构清晰。不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块。',
    prompt: '请基于采集成果撰写完整内容，500-800 字。' },
  { key: 'proofread', name: '校对',     role: '校对员', icon: '3',
    system_prompt: '你是校对员，检查撰写的科学准确性、逻辑一致性和语言流畅度，指出问题并给出修订版本。不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块。',
    prompt: '请检查科学准确性和逻辑，输出修订后的版本。' },
  { key: 'integrate', name: '整合',     role: '整合员', icon: '4',
    system_prompt: '你是整合员，把校对后的内容整理为最终成品，结构清晰、可直接使用。不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块。',
    prompt: '请整理为最终成品，结构化输出。' }
];

var DISC_QUICK_QUESTIONS = [
  '基因、染色体和 DNA 之间是什么关系？',
  '物种是如何形成的？',
  '减数分裂为什么是遗传与进化的桥梁？',
  '光合作用与细胞呼吸有何区别与联系？'
];

/* ============== 状态 ============== */
var _discussionState = {
  mode: 'group',           // 'group' | 'pipeline'
  activeAgentKeys: ['genetics', 'ecology', 'evolution'],  // 群聊模式选中的智能体
  rounds: [],              // 群聊：[{id, userMessage, replies:{key:{name,role,avatar,color,content}}, synthesis, ...}]
  pipelineRuns: [],        // 流水线：[{id, userMessage, stages:{key:{content,name,role}}, final}]
  isStreaming: false,
  abortController: null,
  finalResult: null        // 最近一次 FinalResult
};

/* ============== 自定义智能体存取 ============== */
function _discLoadCustomAgents() {
  try {
    var arr = JSON.parse(localStorage.getItem(DISC_CUSTOM_LS_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function _discSaveCustomAgents(list) {
  try { localStorage.setItem(DISC_CUSTOM_LS_KEY, JSON.stringify(list || [])); } catch (e) {}
}

/* 取所有可选智能体（预设 + 自定义），自定义带 system_prompt */
function _discAllAgents() {
  var custom = _discLoadCustomAgents().map(function(a) {
    return {
      key: 'custom_' + a.id,
      name: a.name, role: a.role || '自定义',
      color: a.color || '#6b7f74',
      system_prompt: a.system_prompt,
      custom: true
    };
  });
  return DISC_PRESET_AGENTS.concat(custom);
}
function _discFindAgent(key) {
  return _discAllAgents().filter(function(a) { return a.key === key; })[0];
}

/* ============== Markdown 渲染 ============== */
function _discEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _discMarkdown(text) {
  if (typeof window.BioQuestMarkdown === 'function') {
    return window.BioQuestMarkdown(text);
  }
  // 降级：旧的简易实现（utils.js 没加载成功时兜底）
  if (!text) return '<p></p>';
  var html = _discEscape(text);
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '</p><p>');
  return '<p>' + html + '</p>';
}
function _discMdWithCursor(text, isStreaming) {
  var md = _discMarkdown(text);
  if (isStreaming) md = md.replace(/<\/p>\s*$/, '<span class="discussion-typing"></span></p>');
  return md;
}

/* ============== 渲染：主页面 ============== */
function renderDiscussionPage(target) {
  injectDiscussionStyles();

  var html = '<div class="discussion-page">';

  // 模式切换
  html += '<div class="disc-mode-bar">' +
    '<button class="disc-mode-btn active" data-disc-mode="group">群聊协作</button>' +
    '<button class="disc-mode-btn" data-disc-mode="pipeline">流水线模式</button>' +
  '</div>';

  // 智能体选择条（仅群聊模式显示）
  html += '<div class="disc-agent-bar" id="disc-agent-bar"></div>';

  // 消息区
  html += '<div class="discussion-messages" id="discussion-messages" role="log" aria-live="polite" aria-label="多智能体讨论"></div>';

  // 输入区 + 成果导出
  html += '<div class="discussion-input-bar">' +
    '<textarea class="discussion-input" id="discussion-input" placeholder="提出一个生物学问题，智能体将协作讨论..." rows="1"></textarea>' +
    '<button class="discussion-icon-btn" id="disc-export-chat-btn" title="导出对话记录为 Markdown">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
    '</button>' +
    '<button class="discussion-icon-btn" id="disc-finalize-btn" title="生成最终成果并导出" disabled>' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
    '</button>' +
    '<button class="discussion-send" id="discussion-send" title="发送">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
    '</button>' +
  '</div>';

  html += '</div>';

  target.innerHTML = html;

  _renderAgentBar();
  _renderMessages(document.getElementById('discussion-messages'));
  _updateFinalizeBtn();

  // 模式切换
  target.querySelectorAll('.disc-mode-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (_discussionState.isStreaming) return;
      target.querySelectorAll('.disc-mode-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      _discussionState.mode = btn.dataset.discMode;
      _renderAgentBar();
      _updateInputPlaceholder();
    });
  });

  // 发送
  var sendBtn = document.getElementById('discussion-send');
  if (sendBtn) sendBtn.addEventListener('click', function() {
    var input = document.getElementById('discussion-input');
    if (input) { _sendDiscussionMessage(input.value); input.value = ''; input.style.height = 'auto'; }
  });
  var input = document.getElementById('discussion-input');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _sendDiscussionMessage(input.value);
        input.value = '';
        input.style.height = 'auto';
      }
    });
    input.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
  }

  // 生成最终成果
  var finBtn = document.getElementById('disc-finalize-btn');
  if (finBtn) finBtn.addEventListener('click', _finalizeDiscussion);

  // 导出对话记录为 Markdown
  var exportChatBtn = document.getElementById('disc-export-chat-btn');
  if (exportChatBtn) exportChatBtn.addEventListener('click', _exportChatMarkdown);
}

/* 导出完整对话记录为 Markdown */
function _exportChatMarkdown() {
  var state = _discussionState;
  var hasGroup = state.rounds && state.rounds.length > 0;
  var hasPipeline = state.pipelineRuns && state.pipelineRuns.length > 0;
  if (!hasGroup && !hasPipeline) {
    showToast('暂无对话记录可导出');
    return;
  }

  var md = '# TATABOX AI 讨论记录\n\n';
  md += '- **模式**：' + (state.mode === 'pipeline' ? '流水线模式' : '群聊协作模式') + '\n';
  md += '- **时间**：' + new Date().toLocaleString('zh-CN') + '\n';
  md += '- **群聊轮次**：' + (state.rounds ? state.rounds.length : 0) + '\n';
  md += '- **流水线运行**：' + (state.pipelineRuns ? state.pipelineRuns.length : 0) + '\n\n';
  md += '---\n\n';

  // 群聊记录
  if (hasGroup) {
    md += '# 群聊协作记录\n\n';
    state.rounds.forEach(function(round, idx) {
      md += '## 第 ' + (idx + 1) + ' 轮\n\n';
      md += '### 用户提问\n\n' + (round.userMessage || '') + '\n\n';
      if (round.replies) {
        Object.keys(round.replies).forEach(function(key) {
          var r = round.replies[key];
          md += '### ' + (r.name || key) + '（' + (r.role || '') + '）\n\n';
          md += (r.content || '') + '\n\n';
        });
      }
      if (round.synthesis) {
        md += '### 综合观点\n\n' + (round.synthesis || '') + '\n\n';
      }
      md += '---\n\n';
    });
  }

  // 流水线记录
  if (hasPipeline) {
    md += '# 流水线模式记录\n\n';
    state.pipelineRuns.forEach(function(run, idx) {
      md += '## 第 ' + (idx + 1) + ' 次运行\n\n';
      md += '### 用户需求\n\n' + (run.userMessage || '') + '\n\n';
      if (run.stages) {
        DISC_STAGES.forEach(function(st) {
          var s = run.stages[st.key];
          if (s && s.content) {
            md += '### ' + st.icon + '. ' + (s.name || st.name) + '（' + (s.role || st.role) + '）\n\n';
            md += s.content + '\n\n';
          }
        });
      }
      if (run.final) {
        md += '### 最终成品\n\n' + (run.final.summary || '') + '\n\n';
        if (run.final.sections) {
          run.final.sections.forEach(function(sec) {
            md += '#### ' + (sec.heading || '') + '\n\n' + (sec.content || '') + '\n\n';
          });
        }
      }
      md += '---\n\n';
    });
  }

  var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'bioquest-discussion-' + Date.now() + '.md';
  a.click();
  URL.revokeObjectURL(url);
  showToast('对话记录已导出为 Markdown');
}

function _updateInputPlaceholder() {
  var input = document.getElementById('discussion-input');
  if (!input) return;
  input.placeholder = _discussionState.mode === 'pipeline'
    ? '描述要产出的报告/文档主题，四阶段流水线将接力完成...'
    : '提出一个生物学问题，智能体将协作讨论...';
}

/* 渲染智能体选择条 */
function _renderAgentBar() {
  var bar = document.getElementById('disc-agent-bar');
  if (!bar) return;
  if (_discussionState.mode !== 'group') {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  var all = _discAllAgents();
  var html = '<span class="disc-agent-bar-label">参与智能体（3-5 位）：</span>';
  all.forEach(function(a) {
    var active = _discussionState.activeAgentKeys.indexOf(a.key) !== -1;
    html += '<span class="disc-agent-chip' + (active ? ' active' : '') + '" data-agent-key="' + _discEscape(a.key) + '" title="' + _discEscape(a.role) + '">' +
      _discEscape(a.name) + '</span>';
  });
  html += '<span class="disc-agent-chip disc-agent-chip--add" id="disc-add-agent-btn">＋ 自建</span>';
  var n = _discussionState.activeAgentKeys.length;
  html += '<span class="disc-agent-count">' + n + '/5</span>';
  bar.innerHTML = html;

  // 点击切换
  bar.querySelectorAll('.disc-agent-chip[data-agent-key]').forEach(function(chip) {
    chip.addEventListener('click', function() {
      if (_discussionState.isStreaming) return;
      var key = chip.dataset.agentKey;
      var idx = _discussionState.activeAgentKeys.indexOf(key);
      if (idx !== -1) {
        if (_discussionState.activeAgentKeys.length <= 3) {
          showToast('至少需要 3 位智能体');
          return;
        }
        _discussionState.activeAgentKeys.splice(idx, 1);
      } else {
        if (_discussionState.activeAgentKeys.length >= 5) {
          showToast('最多 5 位智能体');
          return;
        }
        _discussionState.activeAgentKeys.push(key);
      }
      _renderAgentBar();
    });
  });
  var addBtn = document.getElementById('disc-add-agent-btn');
  if (addBtn) addBtn.addEventListener('click', _openCustomAgentModal);
}

/* ============== 自定义智能体模态 ============== */
function _openCustomAgentModal() {
  _releaseDiscModal();
  var overlay = document.createElement('div');
  overlay.className = 'disc-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '自定义智能体');
  var customs = _discLoadCustomAgents();
  var listHtml = '';
  if (customs.length > 0) {
    listHtml = '<div class="disc-custom-list"><div style="font-size:0.8rem;color:var(--text-muted,#8a8a8a);margin-bottom:8px;">已保存的自定义智能体：</div>';
    customs.forEach(function(a) {
      listHtml += '<div class="disc-custom-item">' +
        '<span class="disc-custom-name">' + _discEscape(a.name) + '</span>' +
        '<span class="disc-custom-role">' + _discEscape(a.role || '') + '</span>' +
        '<button class="disc-btn disc-btn-danger" data-del-id="' + _discEscape(a.id) + '" style="padding:3px 10px;font-size:0.74rem;">删除</button>' +
      '</div>';
    });
    listHtml += '</div>';
  }
  overlay.innerHTML =
    '<div class="disc-modal">' +
      '<h3>自定义智能体</h3>' +
      listHtml +
      '<div class="disc-form-group"><label>名称</label><input id="disc-ca-name" placeholder="如：微生物学家" maxlength="12"></div>' +
      '<div class="disc-form-group"><label>角色/领域</label><input id="disc-ca-role" placeholder="如：微生物学" maxlength="20"></div>' +
      '<div class="disc-form-group"><label>风格 / 开场白 / 人设</label><textarea id="disc-ca-style" placeholder="如：你是一位严谨的微生物学家，擅长从细菌、病毒角度分析问题，语气简洁专业。"></textarea></div>' +
      '<div class="disc-modal-actions">' +
        '<button class="disc-btn disc-btn-ghost" id="disc-ca-cancel">取消</button>' +
        '<button class="disc-btn disc-btn-primary" id="disc-ca-save">保存并加入</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  function close() { _releaseDiscModal(); overlay.remove(); _renderAgentBar(); }
  overlay.querySelector('#disc-ca-cancel').addEventListener('click', close);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
  overlay.querySelectorAll('[data-del-id]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id = btn.dataset.delId;
      var arr = _discLoadCustomAgents().filter(function(a) { return a.id !== id; });
      _discSaveCustomAgents(arr);
      _discussionState.activeAgentKeys = _discussionState.activeAgentKeys.filter(function(k) { return k !== 'custom_' + id; });
      _releaseDiscModal(); overlay.remove(); _openCustomAgentModal();
    });
  });

  if (window.BioQuestA11y && typeof window.BioQuestA11y.trapFocus === 'function') {
    _discFocusTrap = window.BioQuestA11y.trapFocus(overlay, {
      onEscape: close,
      initialFocus: overlay.querySelector('#disc-ca-name') || overlay.querySelector('button')
    });
  }
  overlay.querySelector('#disc-ca-save').addEventListener('click', function() {
    var name = (overlay.querySelector('#disc-ca-name').value || '').trim();
    var role = (overlay.querySelector('#disc-ca-role').value || '').trim();
    var style = (overlay.querySelector('#disc-ca-style').value || '').trim();
    if (!name) { showToast('请输入名称'); return; }
    var sysPrompt = style || ('你是' + name + '，一位' + (role || '专家') + '。请从你的专业角度回答问题，控制在 300 字以内。');
    var arr = _discLoadCustomAgents();
    var newAgent = {
      id: 'a' + Date.now().toString(36),
      name: name, role: role || '自定义',
      color: '#6b7f74',
      system_prompt: sysPrompt
    };
    arr.push(newAgent);
    _discSaveCustomAgents(arr);
    var key = 'custom_' + newAgent.id;
    if (_discussionState.activeAgentKeys.length < 5) _discussionState.activeAgentKeys.push(key);
    close();
  });
}

/* ============== 渲染消息列表 ============== */
function _renderMessages(container) {
  if (!container) return;
  container.replaceChildren();

  var hasContent = (_discussionState.mode === 'group' && _discussionState.rounds.length > 0) ||
                   (_discussionState.mode === 'pipeline' && _discussionState.pipelineRuns.length > 0);

  if (!hasContent) {
    container.innerHTML = _renderWelcome();
    container.querySelectorAll('.discussion-quick-btn').forEach(function(el) {
      el.addEventListener('click', function() {
        var input = document.getElementById('discussion-input');
        if (input) { input.value = el.dataset.q; _sendDiscussionMessage(input.value); input.value = ''; }
      });
    });
    return;
  }

  if (_discussionState.mode === 'group') {
    _discussionState.rounds.forEach(function(round) { container.appendChild(_renderGroupRound(round)); });
  } else {
    _discussionState.pipelineRuns.forEach(function(run) { container.appendChild(_renderPipelineRun(run)); });
  }

  // FinalResult 面板
  if (_discussionState.finalResult) {
    container.appendChild(_renderFinalPanel(_discussionState.finalResult));
  }

  container.scrollTop = container.scrollHeight;
}

function _renderWelcome() {
  var desc = _discussionState.mode === 'pipeline'
    ? '流水线模式：数据采集 → 撰写 → 校对 → 整合，四阶段接力产出完整文档/报告。'
    : '一次发起，自动召集 3-5 位不同角色的智能体在同一对话框内讨论、互相追问、给出方案。';
  return '<div class="discussion-welcome">' +
    '<div class="discussion-welcome-title">' + (_discussionState.mode === 'pipeline' ? '流水线协作' : '多智能体群聊协作') + '</div>' +
    '<div class="discussion-welcome-desc">' + desc + '</div>' +
    '<div class="discussion-quick">' +
      DISC_QUICK_QUESTIONS.map(function(q) {
        return '<button class="discussion-quick-btn" data-q="' + _discEscape(q) + '">' + _discEscape(q) + '</button>';
      }).join('') +
    '</div>' +
  '</div>';
}

/* 渲染一轮群聊 */
function _renderGroupRound(round) {
  var el = document.createElement('div');
  el.className = 'discussion-round';
  el.id = 'round-' + round.id;
  var html = '<div class="discussion-user"><div class="discussion-user-bubble">' + _discEscape(round.userMessage) + '</div></div>';
  el.innerHTML = html;

  // 各智能体发言（左右交替，更像群聊）
  var keys = Object.keys(round.replies);
  keys.forEach(function(key, i) {
    var r = round.replies[key];
    var isRight = i % 2 === 1;
    var pending = round.pending && !r.content && round.streamingKey !== key;
    var streaming = round.streamingKey === key;
    var body;
    if (pending) {
      body = '<span>思考中<span class="discussion-dots"><span></span><span></span><span></span></span></span>';
    } else if (r.content) {
      body = _discMdWithCursor(r.content, streaming);
    } else {
      body = '<span style="color:var(--text-muted);font-size:0.8rem;">—</span>';
    }
    var reply = document.createElement('div');
    reply.className = 'disc-agent-reply' + (isRight ? ' disc-agent-reply--right' : '');
    reply.id = 'round-' + round.id + '-reply-' + key;
    reply.innerHTML =
      '<div class="disc-agent-bubble">' +
        '<div class="disc-agent-name-row">' +
          '<span class="disc-agent-name">' + _discEscape(r.name) + '</span>' +
          '<span class="disc-agent-role-tag">' + _discEscape(r.role) + '</span>' +
        '</div>' +
        '<div class="disc-agent-body" id="round-' + round.id + '-body-' + key + '">' + body + '</div>' +
      '</div>';
    el.appendChild(reply);
  });

  // 综合观点
  if (round.synthesis || round.synthesisPending) {
    var synth = document.createElement('div');
    synth.className = 'discussion-synthesis';
    synth.id = 'round-' + round.id + '-synthesis';
    var sBody;
    if (round.synthesis) sBody = _discMdWithCursor(round.synthesis, round.synthesisStreaming);
    else sBody = '<span>综合中<span class="discussion-dots"><span></span><span></span><span></span></span></span>';
    synth.innerHTML = '<div class="discussion-synthesis-head">综合观点</div><div class="discussion-synthesis-body">' + sBody + '</div>';
    el.appendChild(synth);
  }
  return el;
}

/* 渲染一次流水线 */
function _renderPipelineRun(run) {
  var el = document.createElement('div');
  el.className = 'discussion-round';
  el.id = 'run-' + run.id;
  el.innerHTML = '<div class="discussion-user"><div class="discussion-user-bubble">' + _discEscape(run.userMessage) + '</div></div>';

  DISC_STAGES.forEach(function(st) {
    var s = run.stages[st.key] || { content: '' };
    var pending = run.pending && !s.content && run.currentStage !== st.key;
    var streaming = run.currentStage === st.key;
    var isFinal = st.key === 'integrate';
    var card = document.createElement('div');
    card.className = 'disc-stage' + (pending ? ' disc-stage--pending' : '') + (isFinal ? ' disc-stage--final' : '');
    card.id = 'run-' + run.id + '-stage-' + st.key;
    var body;
    if (pending) body = '<span>等待中<span class="discussion-dots"><span></span><span></span><span></span></span></span>';
    else if (s.content) body = _discMdWithCursor(s.content, streaming);
    else if (streaming) body = '<span>进行中<span class="discussion-dots"><span></span><span></span><span></span></span></span>';
    else body = '<span style="color:var(--text-muted);font-size:0.8rem;">—</span>';
    card.innerHTML =
      '<div class="disc-stage-head">' +
        '<div class="disc-stage-icon">' + st.icon + '</div>' +
        '<div class="disc-stage-name">' + st.name + (isFinal ? '（最终成品）' : '') + '</div>' +
        '<div class="disc-stage-role">' + st.role + '</div>' +
      '</div>' +
      '<div class="disc-stage-body" id="run-' + run.id + '-body-' + st.key + '">' + body + '</div>';
    el.appendChild(card);
  });

  return el;
}

/* 更新单个智能体气泡内容 */
function _updateAgentBody(roundId, key, text, isStreaming) {
  var body = document.getElementById('round-' + roundId + '-body-' + key);
  if (!body) return;
  body.innerHTML = _discMdWithCursor(text, isStreaming);
  _scrollMessages();
}
function _updateStageBody(runId, key, text, isStreaming) {
  var body = document.getElementById('run-' + runId + '-body-' + key);
  if (!body) return;
  body.innerHTML = _discMdWithCursor(text, isStreaming);
  _scrollMessages();
}
function _updateSynthesisBody(roundId, text, isStreaming) {
  var synth = document.getElementById('round-' + roundId + '-synthesis');
  if (!synth) return;
  var body = synth.querySelector('.discussion-synthesis-body');
  if (!body) return;
  body.innerHTML = _discMdWithCursor(text, isStreaming);
  _scrollMessages();
}
function _scrollMessages() {
  var m = document.getElementById('discussion-messages');
  if (m) m.scrollTop = m.scrollHeight;
}

/* ============== 发送消息 ============== */
function _sendDiscussionMessage(text) {
  if (_discussionState.isStreaming || !text || !text.trim()) return;
  text = text.trim();

  if (_discussionState.mode === 'pipeline') {
    _sendPipeline(text);
  } else {
    _sendGroup(text);
  }
}

/* 群聊模式 */
function _sendGroup(userMessage) {
  var keys = _discussionState.activeAgentKeys.slice();
  if (keys.length < 3) {
    showToast('群聊模式至少需要 3 位智能体');
    return;
  }
  // 准备 agent 元信息 + 发给后端的 agents 配置
  var agentsConfig = keys.map(function(k) {
    var a = _discFindAgent(k);
    return { key: k, name: a.name, role: a.role, system_prompt: a.system_prompt || undefined };
  });
  var repliesInit = {};
  keys.forEach(function(k) {
    var a = _discFindAgent(k);
    repliesInit[k] = { name: a.name, role: a.role, color: a.color, content: '' };
  });
  var round = {
    id: 'r_' + Date.now(),
    userMessage: userMessage,
    replies: repliesInit,
    synthesis: '',
    pending: true,
    streamingKey: null,
    synthesisPending: false,
    synthesisStreaming: false,
    agentKeys: keys
  };
  _discussionState.rounds.push(round);
  _discussionState.finalResult = null;
  _discussionState.isStreaming = true;
  _renderMessages(document.getElementById('discussion-messages'));
  _setSendDisabled(true);
  _updateFinalizeBtn();

  // 历史
  var history = [];
  _discussionState.rounds.slice(-5, -1).forEach(function(r) {
    history.push({ role: 'user', content: r.userMessage });
    if (r.synthesis) history.push({ role: 'assistant', content: '[综合观点] ' + r.synthesis });
  });

  // P1-24：开新讨论轮前先中止上一个仍在飞的请求，避免重复占用模型连接
  if (_discussionState.abortController) {
    try { _discussionState.abortController.abort(); } catch (e) { /* 忽略 */ }
  }
  _discussionState.abortController = new AbortController();

  // 检查 AI 用量
  // P1 修复：window.AiClient 是对象而非函数，原 `typeof === 'function'` 恒为 false 会跳过 canUse 门禁
  var aiCheck = (window.AiClient && typeof window.AiClient.canUse === 'function')
    ? window.AiClient.canUse()
    : { ok: true, useBackend: true };
  if (!aiCheck.ok) {
    round.error = aiCheck.reason || '今日 AI 调用已达上限';
    _renderMessages(document.getElementById('discussion-messages'));
    _setSendDisabled(false);
    return;
  }

  // 前端编排：串行调用每位智能体，自主协商（每位可见前面发言）
  _runGroupAgents(round, agentsConfig, history, function (err) {
    if (err) {
      if (err.name === 'AbortError') { _finishGroupStream(round); return; }
      round.error = err.message || '讨论失败';
      showToast('讨论失败：' + (err.message || err));
    }
    _finishGroupStream(round);
  });
}

// 前端群聊编排：依次调用每位智能体，最后生成综合观点
function _runGroupAgents(round, agentsConfig, history, done) {
  var keys = Object.keys(round.replies);
  var idx = 0;
  var allReplies = []; // 已完成的所有发言，供后续智能体参考

  function nextAgent() {
    if (idx >= keys.length) {
      // 所有智能体发言完毕，生成综合观点
      round.synthesisPending = true;
      _updateSynthesisBody(round.id, '', true);
      _generateSynthesis(round, allReplies, done);
      return;
    }
    var key = keys[idx++];
    var agent = round.replies[key];
    round.streamingKey = key;
    _updateAgentBody(round.id, key, '', true);

    // 构造上下文：用户问题 + 前面所有智能体的发言
    var contextParts = ['讨论主题：' + round.userMessage];
    if (allReplies.length > 0) {
      contextParts.push('');
      contextParts.push('其他专家的观点（你可以补充、质疑或综合）：');
      allReplies.forEach(function (r) {
        contextParts.push('【' + r.name + '（' + r.role + '）】' + r.content);
      });
      contextParts.push('');
      contextParts.push('请基于你的专业视角，对上述讨论补充观点（可质疑或延伸），200-400 字。');
    } else {
      contextParts.push('请从你的专业视角回答，200-400 字。');
    }
    var userContent = contextParts.join('\n');

    var messages = [
      { role: 'system', content: (agent.system_prompt || ('你是' + agent.name + '，一位' + agent.role + '专家。')) + ' 不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块。' },
      { role: 'user', content: userContent }
    ];

    window.AiClient.streamChat({
      messages: messages,
      temperature: 0.7,
      maxTokens: 800,
      signal: _discussionState.abortController.signal,
      onChunk: function (chunk) {
        agent.content = (agent.content || '') + chunk;
        _updateAgentBody(round.id, key, agent.content, true);
      },
      onDone: function () {
        allReplies.push({ name: agent.name, role: agent.role, content: agent.content });
        round.streamingKey = null;
        nextAgent();
      },
      onError: function (err) { done(err); }
    });
  }
  nextAgent();
}

// 生成综合观点
function _generateSynthesis(round, allReplies, done) {
  var contextParts = ['讨论主题：' + round.userMessage, ''];
  contextParts.push('各专家发言：');
  allReplies.forEach(function (r) {
    contextParts.push('【' + r.name + '（' + r.role + '）】' + r.content);
  });
  contextParts.push('');
  contextParts.push('请综合所有专家的观点，给出一份结构化的总结（300-500 字），指出共识、分歧与可落地的结论。');

  var messages = [
    { role: 'system', content: '你是讨论成果整合专家，请客观综合各方观点，输出结构化总结。' },
    { role: 'user', content: contextParts.join('\n') }
  ];

  round.synthesisStreaming = true;
  window.AiClient.streamChat({
    messages: messages,
    temperature: 0.5,
    maxTokens: 1000,
    signal: _discussionState.abortController.signal,
    onChunk: function (chunk) {
      round.synthesis = (round.synthesis || '') + chunk;
      _updateSynthesisBody(round.id, round.synthesis, true);
    },
    onDone: function () { done(null); },
    onError: function (err) { done(err); }
  });
}

function _finishGroupStream(round) {
  round.pending = false;
  round.streamingKey = null;
  round.synthesisStreaming = false;
  round.synthesisPending = false;
  _discussionState.isStreaming = false;
  _setSendDisabled(false);
  _updateFinalizeBtn();
  _renderMessages(document.getElementById('discussion-messages'));
}

/* 流水线模式 */
function _sendPipeline(userMessage) {
  var stagesInit = {};
  DISC_STAGES.forEach(function(st) { stagesInit[st.key] = { content: '', name: st.name, role: st.role }; });
  var run = {
    id: 'p_' + Date.now(),
    userMessage: userMessage,
    stages: stagesInit,
    currentStage: null,
    pending: true,
    final: ''
  };
  _discussionState.pipelineRuns.push(run);
  _discussionState.finalResult = null;
  _discussionState.isStreaming = true;
  _renderMessages(document.getElementById('discussion-messages'));
  _setSendDisabled(true);
  _updateFinalizeBtn();

  // P1-24：开新讨论轮前先中止上一个仍在飞的请求，避免重复占用模型连接
  if (_discussionState.abortController) {
    try { _discussionState.abortController.abort(); } catch (e) { /* 忽略 */ }
  }
  _discussionState.abortController = new AbortController();

  // 检查 AI 用量
  // P1 修复：window.AiClient 是对象而非函数，原 `typeof === 'function'` 恒为 false 会跳过 canUse 门禁
  var aiCheck = (window.AiClient && typeof window.AiClient.canUse === 'function')
    ? window.AiClient.canUse()
    : { ok: true, useBackend: true };
  if (!aiCheck.ok) {
    run.error = aiCheck.reason || '今日 AI 调用已达上限';
    _renderMessages(document.getElementById('discussion-messages'));
    _setSendDisabled(false);
    return;
  }

  // 前端编排：四阶段顺序接力
  _runPipelineStages(run, function (err) {
    if (err) {
      if (err.name === 'AbortError') { _finishPipelineStream(run); return; }
      run.error = err.message || '流水线失败';
      showToast('流水线失败：' + (err.message || err));
    }
    _finishPipelineStream(run);
  });
}

// 前端流水线编排：collect → write → proofread → integrate 四阶段接力
function _runPipelineStages(run, done) {
  var stageIdx = 0;
  var prevOutput = '';

  function runStage() {
    if (stageIdx >= DISC_STAGES.length) { done(null); return; }
    var stage = DISC_STAGES[stageIdx];
    var stageKey = stage.key;
    run.currentStage = stageKey;
    _updateStageBody(run.id, stageKey, '', true);

    // 构造输入：用户问题 + 上一阶段产出
    var userContent = '';
    if (stageIdx === 0) {
      userContent = '用户需求：' + run.userMessage + '\n\n请完成"' + stage.name + '"阶段的工作，输出该阶段的成果（500-800 字）。';
    } else {
      var prevStage = DISC_STAGES[stageIdx - 1];
      userContent = '用户原始需求：' + run.userMessage + '\n\n' +
        '上一阶段（' + prevStage.name + '）的产出：\n' + prevOutput + '\n\n' +
        '请基于以上内容完成"' + stage.name + '"阶段的工作。' + stage.prompt;
    }

    var messages = [
      { role: 'system', content: (stage.system_prompt || ('你是' + stage.role + '，负责' + stage.name + '阶段。')) + ' 不要输出 [[ANIM:xxx]] 标记，不要生成 SVG 代码块。' },
      { role: 'user', content: userContent }
    ];

    var stageContent = '';
    window.AiClient.streamChat({
      messages: messages,
      temperature: stage.temperature || 0.5,
      maxTokens: stage.maxTokens || 1000,
      signal: _discussionState.abortController.signal,
      onChunk: function (chunk) {
        stageContent += chunk;
        run.stages[stageKey].content = stageContent;
        _updateStageBody(run.id, stageKey, stageContent, true);
      },
      onDone: function () {
        prevOutput = stageContent;
        run.stages[stageKey].content = stageContent;
        if (stageKey === 'integrate') run.final = stageContent;
        stageIdx++;
        runStage();
      },
      onError: function (err) { done(err); }
    });
  }
  runStage();
}

function _finishPipelineStream(run) {
  run.pending = false;
  run.currentStage = null;
  _discussionState.isStreaming = false;
  _setSendDisabled(false);
  _updateFinalizeBtn();
  _renderMessages(document.getElementById('discussion-messages'));
}

/* SSE 泵 */
function _pumpStream(response, onData, onDone) {
  var reader = response.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';
  function pump() {
    return reader.read().then(function(result) {
      if (result.done) { onDone(); return; }
      buffer += decoder.decode(result.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(function(line) {
        if (!line.startsWith('data: ')) return;
        var data = line.slice(6);
        if (data === '[DONE]') return;
        try { onData(JSON.parse(data)); } catch (e) {}
      });
      return pump();
    });
  }
  return pump();
}

function _setSendDisabled(disabled) {
  var btn = document.getElementById('discussion-send');
  if (btn) btn.disabled = disabled;
  var input = document.getElementById('discussion-input');
  if (input) input.disabled = disabled;
}

/* ============== FinalResult 生成与导出 ============== */
function _updateFinalizeBtn() {
  var btn = document.getElementById('disc-finalize-btn');
  if (!btn) return;
  var hasContent = (_discussionState.mode === 'group' && _discussionState.rounds.length > 0) ||
                   (_discussionState.mode === 'pipeline' && _discussionState.pipelineRuns.length > 0);
  btn.disabled = _discussionState.isStreaming || !hasContent;
}

function _buildTranscript() {
  var list = [];
  if (_discussionState.mode === 'group') {
    var lastRound = _discussionState.rounds[_discussionState.rounds.length - 1];
    if (!lastRound) return { topic: '', transcript: [] };
    Object.keys(lastRound.replies).forEach(function(key) {
      var r = lastRound.replies[key];
      list.push({ source: key, name: r.name, role: r.role, content: r.content });
    });
    if (lastRound.synthesis) {
      list.push({ source: 'synthesis', name: '综合观点', role: '综合', content: lastRound.synthesis });
    }
    return { topic: lastRound.userMessage, transcript: list };
  } else {
    var lastRun = _discussionState.pipelineRuns[_discussionState.pipelineRuns.length - 1];
    if (!lastRun) return { topic: '', transcript: [] };
    DISC_STAGES.forEach(function(st) {
      var s = lastRun.stages[st.key];
      if (s && s.content) list.push({ source: st.key, name: st.name, role: st.role, content: s.content });
    });
    return { topic: lastRun.userMessage, transcript: list };
  }
}

function _finalizeDiscussion() {
  var btn = document.getElementById('disc-finalize-btn');
  if (btn) btn.disabled = true;
  showToast('正在整合最终成果...');

  var data = _buildTranscript();
  if (!data.transcript.length) {
    if (btn) btn.disabled = false;
    showToast('无讨论内容可整合');
    return;
  }

  // 构造整合 prompt
  var pieces = [];
  data.transcript.forEach(function (t) {
    pieces.push('【' + t.name + '（' + t.role + '）】\n' + t.content);
  });
  var joined = pieces.join('\n\n');
  var sysPrompt = '你是成果整合专家。请把多位智能体的讨论成果整合为一份结构化最终成品。' +
    '严格输出以下 JSON（无其他内容、无 markdown 代码块）：\n' +
    '{"title":"标题","summary":"200字以内摘要","sections":[{"heading":"小节标题","content":"小节正文"}]}\n' +
    '要求：只包含专家的成品观点，不要包含对话历史或元评论；科学准确；中文表达；content 可包含换行与 **加粗**。';
  var userContent = '讨论主题：' + (data.topic || '（未指定）') + '\n\n讨论记录：\n' + joined.slice(0, 6000);

  var messages = [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: userContent }
  ];

  var rawText = '';
  window.AiClient.streamChat({
    messages: messages,
    temperature: 0.3,
    maxTokens: 1800,
    signal: _discussionState.abortController ? _discussionState.abortController.signal : undefined,
    onChunk: function (chunk) { rawText += chunk; },
    onDone: function () {
      if (btn) btn.disabled = false;
      // 尝试解析 JSON
      var result = null;
      try {
        var m = rawText.match(/\{[\s\S]*\}/);
        if (m) result = JSON.parse(m[0]);
      } catch (e) {}
      if (!result) {
        result = { title: data.topic || '讨论成果', summary: rawText.slice(0, 200),
                   sections: [{ heading: '完整成果', content: rawText }] };
      }
      _discussionState.finalResult = result;
      _discussionState.finalResult._topic = data.topic;
      _discussionState.finalResult._mode = _discussionState.mode;
      _renderMessages(document.getElementById('discussion-messages'));
      showToast('最终成果已生成，可导出');
    },
    onError: function (err) {
      if (btn) btn.disabled = false;
      showToast('整合失败：' + (err.message || err));
    }
  });
}

function _renderFinalPanel(fr) {
  var el = document.createElement('div');
  el.className = 'discussion-round';
  var html = '<div class="disc-final-panel">' +
    '<div class="disc-final-head"><span class="disc-final-title">最终成果</span></div>';
  if (fr.title) html += '<div class="disc-final-title" style="font-size:1.1rem;margin-bottom:8px;">' + _discEscape(fr.title) + '</div>';
  if (fr.summary) html += '<div class="disc-final-summary">' + _discMarkdown(fr.summary) + '</div>';
  if (Array.isArray(fr.sections)) {
    fr.sections.forEach(function(sec) {
      html += '<div class="disc-final-section"><h4>' + _discEscape(sec.heading || '') + '</h4><p>' + _discMarkdown(sec.content || '') + '</p></div>';
    });
  }
  html += '<div class="disc-export-row">' +
    '<button class="disc-export-btn" data-export="md">Markdown</button>' +
    '<button class="disc-export-btn" data-export="json">JSON</button>' +
  '</div></div>';
  el.innerHTML = html;
  el.querySelectorAll('[data-export]').forEach(function(btn) {
    btn.addEventListener('click', function() { _exportFinal(btn.dataset.export); });
  });
  return el;
}

function _exportFinal(fmt) {
  var fr = _discussionState.finalResult;
  if (!fr) return;
  var topic = fr._topic || '讨论成果';
  var stamp = new Date().toLocaleString('zh-CN');

  if (fmt === 'json') {
    var json = JSON.stringify({
      title: fr.title, summary: fr.summary, sections: fr.sections,
      meta: { topic: topic, mode: fr._mode, generatedAt: stamp }
    }, null, 2);
    _downloadBlob(new Blob([json], { type: 'application/json;charset=utf-8' }), 'bioquest-final-' + Date.now() + '.json');
    return;
  }

  // 构建纯文本 Markdown
  var md = '# ' + (fr.title || topic) + '\n\n';
  md += '> 生成时间：' + stamp + '  \n> 模式：' + (fr._mode === 'pipeline' ? '流水线' : '群聊协作') + '\n\n';
  if (fr.summary) md += '## 摘要\n\n' + fr.summary + '\n\n';
  if (Array.isArray(fr.sections)) {
    fr.sections.forEach(function(sec) {
      md += '## ' + (sec.heading || '') + '\n\n' + (sec.content || '') + '\n\n';
    });
  }

  if (fmt === 'md') {
    _downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), 'bioquest-final-' + Date.now() + '.md');
    return;
  }

  // Word / PDF 共用 HTML
  var bodyHtml = '<h1 style="font-family:serif;">' + _discEscape(fr.title || topic) + '</h1>';
  bodyHtml += '<p style="color:#888;font-size:0.85em;">生成时间：' + stamp + ' · 模式：' + (fr._mode === 'pipeline' ? '流水线' : '群聊协作') + '</p>';
  if (fr.summary) bodyHtml += '<h2>摘要</h2><p>' + _mdToHtml(fr.summary) + '</p>';
  if (Array.isArray(fr.sections)) {
    fr.sections.forEach(function(sec) {
      bodyHtml += '<h2>' + _discEscape(sec.heading || '') + '</h2><div>' + _mdToHtml(sec.content || '') + '</div>';
    });
  }
  var fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + _discEscape(fr.title || topic) + '</title>' +
    '<style>body{font-family:"Noto Serif SC",serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.8;}h1{color:#1a3a2a;}h2{color:#3a6b4a;border-bottom:1px solid #eee;padding-bottom:4px;}code{background:#f4f4f4;padding:2px 6px;border-radius:2px;}</style>' +
    '</head><body>' + bodyHtml + '</body></html>';

  if (fmt === 'word') {
    _downloadBlob(new Blob(['\ufeff', fullHtml], { type: 'application/msword;charset=utf-8' }), 'bioquest-final-' + Date.now() + '.doc');
    return;
  }

  if (fmt === 'pdf') {
    var w = window.open('', '_blank');
    if (!w) { showToast('请允许弹窗以导出 PDF'); return; }
    w.document.write(fullHtml);
    w.document.close();
    setTimeout(function() { w.focus(); w.print(); }, 400);
  }
}

/* 简易 Markdown → HTML（用于 Word/PDF） */
function _mdToHtml(text) {
  if (!text) return '';
  var html = _discEscape(text);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function _downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { URL.revokeObjectURL(url); a.remove(); }, 100);
}

/* ============== 模块入口 ============== */
function initDiscussion(target) {
  if (!target) target = document.getElementById('page-content');
  if (!target) return;
  renderDiscussionPage(target);
}

window.initDiscussion = initDiscussion;
window.renderDiscussionPage = renderDiscussionPage;
