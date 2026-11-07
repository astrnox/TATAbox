/**
 * ============================================================
 * TATABOX — 教师协同视图（教师/家长学习监控面板）
 * 入口：输入"班级码"或"学生ID"查看学生数据
 * 简化版：用 localStorage 'tatabox_class_data' 模拟班级数据
 * ============================================================
 */

'use strict';

var _teacherStylesInjected = false;

function injectTeacherStyles() {
  if (_teacherStylesInjected) return;
  _teacherStylesInjected = true;

  var style = document.createElement('style');
  style.id = 'bioquest-teacher-styles';
  style.textContent = [
    '.teacher-page { max-width: 1100px; margin: 0 auto; padding: 24px 20px 80px; }',

    /* 顶部工具栏 */
    '.teacher-toolbar { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:20px; }',
    '.teacher-toolbar input[type="text"] {',
    '  flex:1; min-width:200px; padding:10px 14px;',
    '  border:1px solid var(--border-light,#e3e0d8); border-radius:8px;',
    '  background:var(--surface-primary,#fff); color:var(--text-primary,#1a2f1d);',
    '  font-size:0.92rem; outline:none; transition:border-color .2s;',
    '}',
    '.teacher-toolbar input[type="text"]:focus { border-color:var(--color-sage,#5a7d5c); }',
    '.teacher-btn {',
    '  padding:10px 18px; border:none; border-radius:8px; cursor:pointer;',
    '  font-size:0.9rem; font-weight:600; transition:all .2s;',
    '}',
    '.teacher-btn-primary { background:var(--color-sage,#5a7d5c); color:#fff; }',
    '.teacher-btn-primary:hover { background:var(--color-deep,#1a3a2a); }',
    '.teacher-btn-ghost { background:transparent; border:1px solid var(--border-light,#e3e0d8); color:var(--text-primary,#1a2f1d); }',
    '.teacher-btn-ghost:hover { border-color:var(--color-sage,#5a7d5c); color:var(--color-sage,#5a7d5c); }',
    '.teacher-btn-sm { padding:6px 12px; font-size:0.82rem; border-radius:8px; }',

    /* 章节标题 */
    '.teacher-section { margin-top:32px; }',
    '.teacher-section-title {',
    '  font-family:var(--font-serif,"Noto Serif SC",serif);',
    '  font-size:1.2rem; font-weight:700; color:var(--color-deep,#1a3a2a);',
    '  margin:0 0 14px;',
    '}',

    /* 班级概览统计卡 */
    '.teacher-stat-row { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:24px; }',
    '.teacher-stat-card {',
    '  flex:1; min-width:160px; padding:18px 20px;',
    '  background:var(--surface-primary,#fff); border-radius:12px;',
    '  border:1px solid var(--border-light,#ece8e1);',
    '  box-shadow:var(--shadow-sm, 0 1px 3px rgba(44, 62, 48, 0.05));',
    '}',
    '.teacher-stat-num { font-size:2rem; font-weight:700; color:var(--color-sage,#3a8c5c); line-height:1.1; }',
    '.teacher-stat-label { font-size:0.82rem; color:var(--text-muted,#8a8a8a); margin-top:4px; }',

    /* 学生卡片网格 */
    '.teacher-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; }',
    '.teacher-card {',
    '  background:var(--surface-primary,#fff); border-radius:12px;',
    '  border:1px solid var(--border-light,#ece8e1); padding:16px 18px;',
    '  cursor:pointer; transition:all .2s;',
    '}',
    '.teacher-card:hover { border-color:var(--color-sage,#5a7d5c); box-shadow:var(--shadow-lg); transform:translateY(-2px); }',
    '.teacher-card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }',
    '.teacher-card-name { font-size:1.05rem; font-weight:600; color:var(--color-deep,#1a2f1d); }',
    '.teacher-card-id { font-size:0.72rem; color:var(--text-muted,#8a8a8a); }',
    '.teacher-card-stats { display:flex; gap:14px; font-size:0.82rem; color:var(--text-secondary,#555); margin-bottom:8px; }',
    '.teacher-card-stats strong { color:var(--color-deep,#1a2f1d); font-size:0.95rem; }',
    '.teacher-card-foot { display:flex; justify-content:space-between; align-items:center; font-size:0.76rem; color:var(--text-muted,#8a8a8a); }',
    '.teacher-tag { padding:2px 8px; border-radius:8px; font-size:0.72rem; font-weight:600; }',
    '.teacher-tag-good { background:rgba(58,140,92,0.12); color:var(--color-sage,#3a8c5c); }',
    '.teacher-tag-warn { background:rgba(232,168,48,0.15); color:#b87a1f; }',
    '.teacher-tag-risk { background:rgba(229,62,62,0.12); color:var(--color-error,#e53e3e); }',

    /* 详情抽屉 */
    '.teacher-drawer-overlay {',
    '  position:fixed; inset:0; z-index:9998;',
    '  background:rgba(5,10,7,0.66);',
    '  opacity:0; pointer-events:none; transition:opacity .25s;',
    '}',
    '.teacher-drawer-overlay.visible { opacity:1; pointer-events:auto; }',
    '.teacher-drawer {',
    '  position:fixed; top:0; right:0; bottom:0; width:min(560px,92vw); z-index:9999;',
    '  background:var(--surface-primary,#fff); box-shadow:var(--shadow-floating);',
    '  transform:translateX(100%); transition:transform .3s ease;',
    '  display:flex; flex-direction:column; overflow:hidden;',
    '}',
    '.teacher-drawer.visible { transform:translateX(0); }',
    '.teacher-drawer-head { padding:18px 22px; border-bottom:1px solid var(--border-light,#ece8e1); display:flex; justify-content:space-between; align-items:center; }',
    '.teacher-drawer-title { font-size:1.15rem; font-weight:700; color:var(--color-deep,#1a2f1d); }',
    '.teacher-drawer-close { background:none; border:none; font-size:24px; cursor:pointer; color:var(--text-muted,#8a8a8a); line-height:1; }',
    '.teacher-drawer-body { flex:1; overflow-y:auto; padding:20px 22px 40px; }',

    '.teacher-detail-card { background:var(--surface-primary,#fff); border:1px solid var(--border-light,#ece8e1); border-radius:12px; padding:14px 16px; margin-bottom:14px; }',
    '.teacher-detail-card h4 { margin:0 0 10px; font-size:0.95rem; color:var(--color-deep,#1a2f1d); }',
    '.teacher-detail-row { display:flex; justify-content:space-between; font-size:0.86rem; padding:4px 0; color:var(--text-secondary,#555); }',
    '.teacher-detail-row strong { color:var(--color-deep,#1a2f1d); }',

    '.teacher-weak-item { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px dashed var(--border-light,#ece8e1); font-size:0.86rem; }',
    '.teacher-weak-item:last-child { border-bottom:none; }',
    '.teacher-weak-bar { width:80px; height:6px; background:var(--border-light,#ece8e1); border-radius:2px; overflow:hidden; }',
    '.teacher-weak-bar-fill { height:100%; background:#e53e3e; }',

    '.teacher-ai-box { background:rgba(58,140,92,0.06); border:1px solid rgba(58,140,92,0.2); border-radius:12px; padding:14px 16px; margin-bottom:14px; }',
    '.teacher-ai-loading { color:var(--text-muted,#8a8a8a); font-size:0.86rem; padding:8px 0; }',
    '.teacher-ai-suggestion { font-size:0.88rem; color:var(--text-primary,#1a2f1d); padding:6px 0; line-height:1.6; border-bottom:1px dashed rgba(58,140,92,0.15); }',
    '.teacher-ai-suggestion:last-child { border-bottom:none; }',
    '.teacher-ai-grade { display:inline-block; padding:2px 10px; border-radius:8px; background:var(--color-sage,#3a8c5c); color:#fff; font-weight:700; font-size:0.85rem; }',

    /* 空状态 */
    '.teacher-empty { text-align:center; padding:60px 20px; color:var(--text-muted,#8a8a8a); }',
    '.teacher-empty-title { font-size:1.1rem; color:var(--text-secondary,#555); margin-bottom:8px; }',

    /* SVG 图表容器 */
    '.teacher-charts { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px; }',
    '@media (max-width:720px) { .teacher-charts { grid-template-columns:1fr; } }',
    '.teacher-chart-box { background:var(--surface-primary,#fff); border:1px solid var(--border-light,#ece8e1); border-radius:12px; padding:16px; }',
    '.teacher-chart-box h4 { margin:0 0 12px; font-size:0.92rem; color:var(--color-deep,#1a2f1d); }',
    '.teacher-chart-box svg { width:100%; height:auto; display:block; }'
  ].join('\n');
  document.head.appendChild(style);
}

/* ============== 模态弹窗（替代 prompt/confirm，Trae preview 不支持原生 dialog） ============== */

/**
 * 模态输入框（替代 window.prompt）
 * @param {string} title
 * @param {string} placeholder
 * @param {string} defaultValue
 * @param {function(string|null)} callback - 返回用户输入（去空格），取消则传 null
 */
function teacherModalPrompt(title, placeholder, defaultValue, callback) {
  var overlay = document.createElement('div');
  overlay.className = 'teacher-drawer-overlay visible';
  overlay.style.zIndex = 10010;
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.innerHTML =
    '<div style="background:var(--surface-primary,#fff);border-radius:12px;padding:24px;width:min(420px,92vw);box-shadow:var(--shadow-floating);">' +
      '<div style="font-family:var(--font-serif,"Noto Serif SC",serif);font-size:1.1rem;font-weight:700;color:var(--color-deep,#1a3a2a);margin-bottom:14px;">' + escapeHtml(title || '请输入') + '</div>' +
      '<input type="text" id="teacher-modal-input" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border-light,#e3e0d8);border-radius:8px;font-size:0.92rem;outline:none;background:var(--surface-primary,#fff);color:var(--text-primary,#1a2f1d);" placeholder="' + escapeHtml(placeholder || '') + '" value="' + escapeHtml(defaultValue || '') + '">' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">' +
        '<button class="teacher-btn teacher-btn-ghost teacher-btn-sm" id="teacher-modal-cancel">取消</button>' +
        '<button class="teacher-btn teacher-btn-primary teacher-btn-sm" id="teacher-modal-ok">确定</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var input = overlay.querySelector('#teacher-modal-input');
  setTimeout(function() { input.focus(); input.select(); }, 30);

  function close(val) {
    overlay.remove();
    if (typeof callback === 'function') callback(val);
  }
  overlay.querySelector('#teacher-modal-cancel').addEventListener('click', function() { close(null); });
  overlay.querySelector('#teacher-modal-ok').addEventListener('click', function() {
    var v = input.value.trim();
    close(v);
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); var v = input.value.trim(); close(v); }
    if (e.key === 'Escape') { close(null); }
  });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(null); });
}

/**
 * 模态确认框（替代 window.confirm）
 * @param {string} message
 * @param {function(boolean)} callback
 */
function teacherModalConfirm(message, callback) {
  var overlay = document.createElement('div');
  overlay.className = 'teacher-drawer-overlay visible';
  overlay.style.zIndex = 10010;
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.innerHTML =
    '<div style="background:var(--surface-primary,#fff);border-radius:12px;padding:28px 24px 20px;width:min(420px,92vw);box-shadow:var(--shadow-floating);text-align:center;">' +
      '<div class="bq-result-icon bq-result-icon--warning">' + BQ_ICONS.alert + '</div>' +
      '<div style="font-size:0.92rem;color:var(--text-secondary,#4a4a4a);line-height:1.6;margin-bottom:20px;">' + escapeHtml(message || '确定执行此操作？') + '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
        '<button class="teacher-btn teacher-btn-ghost teacher-btn-sm" id="teacher-modal-cancel">取消</button>' +
        '<button class="teacher-btn teacher-btn-sm" id="teacher-modal-ok" style="background:var(--color-error,#e53e3e);color:#fff;">确定</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  function close(val) {
    overlay.remove();
    if (typeof callback === 'function') callback(val);
  }
  overlay.querySelector('#teacher-modal-cancel').addEventListener('click', function() { close(false); });
  overlay.querySelector('#teacher-modal-ok').addEventListener('click', function() { close(true); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(false); });
}

/* ============== 数据层 ============== */

var TEACHER_LS_KEY = 'tatabox_class_data';
var TEACHER_API_BASE = (function () {
  // 与 server.py 一致：同源 fetch
  return '';
})();

/**
 * 读取班级数据（P0-3：localStorage 作为缓存，Supabase 为权威源）
 * 同步读取，供首屏即时渲染；后台通过 teacherRefreshClassFromSupabase() 异步刷新
 * @returns {Array<{id,name,score,accuracy,lastActive,history,wrongQuestions}>}
 */
function teacherLoadClass() {
  try {
    var raw = localStorage.getItem(TEACHER_LS_KEY);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function teacherSaveClass(list) {
  try {
    localStorage.setItem(TEACHER_LS_KEY, JSON.stringify(list || []));
  } catch (e) {
    console.warn('[Teacher] 保存班级数据失败', e);
  }
}

/**
 * P0-3: 异步从 Supabase 拉取班级成员列表并刷新本地缓存
 * - 仅登录用户触发
 * - 拉取成功后合并 profiles 表获取学生最新分数/正确率
 * - 失败静默回退到 localStorage
 * @returns {Promise<boolean>} 是否刷新成功
 */
async function teacherRefreshClassFromSupabase() {
  // P0-3: 仅当 Supabase SDK 可用且用户已登录时才走云端，否则回退 localStorage
  if (typeof window.supabase === 'undefined') return false;
  var loggedIn = false;
  try { loggedIn = (typeof window.isLoggedIn === 'function') && window.isLoggedIn(); } catch (e) {}
  if (!loggedIn) return false;
  if (typeof window.getClassMembershipsFromSupabase !== 'function') return false;

  try {
    var memberships = await window.getClassMembershipsFromSupabase();
    if (memberships === null) return false; // 拉取失败
    if (memberships.length === 0) {
      // Supabase 中没有数据：清空本地缓存（如果用户在 Supabase 删过）
      teacherSaveClass([]);
      return true;
    }

    // 保留本地缓存的 history/wrongQuestions（RLS 限制，Supabase 无法读学生详细数据）
    var localCache = {};
    teacherLoadClass().forEach(function (s) {
      var key = s.userKey || s.studentId || s.id;
      if (key) localCache[key] = s;
    });

    // 对每个成员拉取最新 profile 数据
    var newList = [];
    for (var i = 0; i < memberships.length; i++) {
      var m = memberships[i];
      var studentKey = m.student_key || '';
      var cacheKey = studentKey || m.student_id || m.id;
      var cached = localCache[cacheKey] || {};

      // 尝试拉取最新 profile
      var freshData = null;
      if (studentKey && typeof window.getStudentDetailByKey === 'function') {
        try { freshData = await window.getStudentDetailByKey(studentKey); } catch (e) {}
      }

      newList.push({
        id: cached.id || teacherGenId(),  // 保留原 id（避免 UI 状态丢失）
        membershipId: m.id,  // Supabase 记录 ID（用于删除）
        studentId: m.student_id || (freshData && freshData.id) || null,
        userKey: studentKey,
        name: (freshData && (freshData.display_name || freshData.username)) || m.student_name || cached.name || ('学生 ' + (studentKey ? studentKey.slice(0, 4) : '****')),
        score: (freshData && freshData.total_score) || cached.score || 0,
        accuracy: (freshData && freshData.accuracy) || cached.accuracy || 0,
        totalAnswered: (freshData && freshData.total_answered) || cached.totalAnswered || 0,
        lastActive: (freshData && freshData.last_active) || cached.lastActive || m.added_at || new Date().toISOString(),
        history: cached.history || [],
        wrongQuestions: cached.wrongQuestions || [],
        source: 'supabase'
      });
    }

    teacherSaveClass(newList);
    return true;
  } catch (e) {
    console.warn('[Teacher] Supabase 班级刷新失败:', e && e.message);
    return false;
  }
}

/**
 * P0-3: 同步添加学生到 Supabase
 * @param {Object} student - 本地学生对象
 * @returns {Promise<boolean>} 是否同步成功
 */
async function teacherSyncAddToSupabase(student) {
  // P0-3: 仅当 Supabase SDK 可用且用户已登录时才同步，否则仅保留本地
  if (typeof window.supabase === 'undefined') return false;
  var loggedIn = false;
  try { loggedIn = (typeof window.isLoggedIn === 'function') && window.isLoggedIn(); } catch (e) {}
  if (!loggedIn) return false;
  if (typeof window.addClassMembershipToSupabase !== 'function') return false;
  if (!student) return false;

  try {
    var result = await window.addClassMembershipToSupabase({
      student_id: student.studentId || null,
      student_key: student.userKey || null,
      student_name: student.name || ''
    });
    if (result.ok && result.membership) {
      // 把 Supabase 返回的 membership.id 回写到本地缓存
      var list = teacherLoadClass();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === student.id) {
          list[i].membershipId = result.membership.id;
          list[i].studentId = result.membership.student_id || list[i].studentId;
          break;
        }
      }
      teacherSaveClass(list);
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[Teacher] 同步添加到 Supabase 失败:', e && e.message);
    return false;
  }
}

/**
 * P0-3: 同步移除学生到 Supabase
 * @param {Object} student - 本地学生对象
 * @returns {Promise<boolean>} 是否同步成功
 */
async function teacherSyncRemoveToSupabase(student) {
  // P0-3: 仅当 Supabase SDK 可用且用户已登录时才同步，否则仅保留本地
  if (typeof window.supabase === 'undefined') return false;
  var loggedIn = false;
  try { loggedIn = (typeof window.isLoggedIn === 'function') && window.isLoggedIn(); } catch (e) {}
  if (!loggedIn) return false;
  if (typeof window.removeClassMembershipFromSupabase !== 'function') return false;
  if (!student || !student.membershipId) return false;

  try {
    var result = await window.removeClassMembershipFromSupabase(student.membershipId);
    return result.ok;
  } catch (e) {
    console.warn('[Teacher] 同步移除到 Supabase 失败:', e && e.message);
    return false;
  }
}

/**
 * 生成随机学生 ID
 */
function teacherGenId() {
  return 'S' + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).toUpperCase().slice(2, 5);
}

/**
 * 从当前用户的学习数据复制一份作为新学生的初始数据
 */
function teacherCopyCurrentUserData() {
  var history = [];
  var wrongQuestions = [];
  try {
    history = JSON.parse(localStorage.getItem('tatabox_history') || '[]');
    if (!Array.isArray(history)) history = [];
  } catch (e) { history = []; }
  try {
    wrongQuestions = JSON.parse(localStorage.getItem('tatabox_wrong_questions') || '[]');
    if (!Array.isArray(wrongQuestions)) wrongQuestions = [];
  } catch (e) { wrongQuestions = []; }

  // 从 history 推导分数与正确率
  var totalAnswered = 0;
  var totalCorrect = 0;
  history.forEach(function (h) {
    if (h && h.questions && Array.isArray(h.questions)) {
      h.questions.forEach(function (q) {
        totalAnswered++;
        if (q && q.isCorrect) totalCorrect++;
      });
    }
  });
  var accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  // Bio 分：基础 60 + 正确率 0.4 倍
  var score = Math.min(100, 60 + Math.round(accuracy * 0.4));

  return {
    history: history,
    wrongQuestions: wrongQuestions,
    score: score,
    accuracy: accuracy,
    totalAnswered: totalAnswered
  };
}

/**
 * 计算单个学生的薄弱模块（按错误率排序）
 * @returns {Array<{module, total, wrong, errorRate}>}
 */
function teacherComputeWeakModules(student) {
  var stats = {}; // module -> {total, wrong}
  (student.history || []).forEach(function (h) {
    if (!h || !h.questions) return;
    var mod = h.module || '未知模块';
    if (!stats[mod]) stats[mod] = { total: 0, wrong: 0 };
    h.questions.forEach(function (q) {
      stats[mod].total++;
      if (q && !q.isCorrect) stats[mod].wrong++;
    });
  });
  // 错题本也参与错误统计
  (student.wrongQuestions || []).forEach(function (w) {
    var mod = w.module || '未知模块';
    if (!stats[mod]) stats[mod] = { total: 0, wrong: 0 };
    stats[mod].wrong++;
    stats[mod].total++;
  });

  var result = Object.keys(stats).map(function (mod) {
    var s = stats[mod];
    var rate = s.total > 0 ? Math.round((s.wrong / s.total) * 100) : 0;
    return { module: mod, total: s.total, wrong: s.wrong, errorRate: rate };
  });
  result.sort(function (a, b) { return b.errorRate - a.errorRate; });
  return result;
}

function renderTeacherPage(target) {
  injectTeacherStyles();

  target.innerHTML =
    '<div class="teacher-page">' +
      '<div class="teacher-toolbar">' +
        '<input type="text" id="teacher-search-input" placeholder="输入学生 ID 或姓名搜索（也可输入班级码 BIO-CLASS）" autocomplete="off">' +
        '<button class="teacher-btn teacher-btn-primary" id="teacher-add-btn">+ 添加学生</button>' +
        '<button class="teacher-btn teacher-btn-ghost" id="teacher-export-all-btn">导出班级报告</button>' +
      '</div>' +
      '<div id="teacher-stats-area"></div>' +
      '<div class="teacher-section">' +
        '<h3 class="teacher-section-title">班级概览</h3>' +
        '<div id="teacher-list-area"></div>' +
      '</div>' +
      '<div class="teacher-section" id="teacher-class-stats-section">' +
        '<h3 class="teacher-section-title">班级统计</h3>' +
        '<div id="teacher-charts-area"></div>' +
      '</div>' +
    '</div>';

  // 事件绑定
  var searchInput = document.getElementById('teacher-search-input');
  searchInput.addEventListener('input', function () {
    teacherRenderList(this.value.trim());
  });
  document.getElementById('teacher-add-btn').addEventListener('click', teacherAddStudent);
  document.getElementById('teacher-export-all-btn').addEventListener('click', function () {
    teacherExportCSV(null);
  });

  teacherRenderAll();
}

/**
 * 渲染全部：统计 + 列表 + 班级图表
 */
function teacherRenderAll() {
  teacherRenderStats();
  teacherRenderList('');
  teacherRenderClassCharts();
}

/**
 * 渲染顶部统计卡（学生数、平均分、平均正确率、活跃学生数）
 */
function teacherRenderStats() {
  var list = teacherLoadClass();
  var area = document.getElementById('teacher-stats-area');
  if (!area) return;

  if (list.length === 0) {
    area.replaceChildren();
    return;
  }

  var avgScore = 0, avgAcc = 0, activeCount = 0;
  var now = Date.now();
  list.forEach(function (s) {
    avgScore += (s.score || 0);
    avgAcc += (s.accuracy || 0);
    // 7 天内活跃视为活跃
    var last = s.lastActive ? new Date(s.lastActive).getTime() : 0;
    if (now - last < 7 * 24 * 3600 * 1000) activeCount++;
  });
  avgScore = list.length ? Math.round(avgScore / list.length) : 0;
  avgAcc = list.length ? Math.round(avgAcc / list.length) : 0;

  area.innerHTML =
    '<div class="teacher-stat-row">' +
      '<div class="teacher-stat-card"><div class="teacher-stat-num">' + list.length + '</div><div class="teacher-stat-label">学生总数</div></div>' +
      '<div class="teacher-stat-card"><div class="teacher-stat-num">' + avgScore + '</div><div class="teacher-stat-label">班级平均分</div></div>' +
      '<div class="teacher-stat-card"><div class="teacher-stat-num">' + avgAcc + '%</div><div class="teacher-stat-label">平均正确率</div></div>' +
      '<div class="teacher-stat-card"><div class="teacher-stat-num">' + activeCount + '</div><div class="teacher-stat-label">本周活跃</div></div>' +
    '</div>';
}

/**
 * 根据搜索关键字渲染学生列表
 */
function teacherRenderList(keyword) {
  var list = teacherLoadClass();
  var area = document.getElementById('teacher-list-area');
  if (!area) return;

  // 班级码特殊处理：BIO-CLASS 显示全部
  var filtered = list;
  if (keyword && keyword.toUpperCase() !== 'BIO-CLASS') {
    var kw = keyword.toLowerCase();
    filtered = list.filter(function (s) {
      return (s.id || '').toLowerCase().indexOf(kw) >= 0 ||
             (s.name || '').toLowerCase().indexOf(kw) >= 0;
    });
  }

  if (list.length === 0) {
    area.innerHTML =
      '<div class="teacher-empty">' +
        '<div class="teacher-empty-title">班级暂无学生</div>' +
        '<div>点击右上角"+ 添加学生"开始建班</div>' +
      '</div>';
    return;
  }

  if (filtered.length === 0) {
    area.innerHTML =
      '<div class="teacher-empty">' +
        '<div class="teacher-empty-title">未找到匹配的学生</div>' +
      '</div>';
    return;
  }

  var html = '<div class="teacher-grid">';
  filtered.forEach(function (s) {
    var status = teacherGetStatus(s);
    html +=
      '<div class="teacher-card" data-student-id="' + escapeHtml(s.id) + '">' +
        '<div class="teacher-card-head">' +
          '<div class="teacher-card-name">' + escapeHtml(s.name || '未命名') + '</div>' +
          '<span class="teacher-tag ' + status.cls + '">' + status.label + '</span>' +
        '</div>' +
        '<div class="teacher-card-stats">' +
          '<span>Bio 分 <strong>' + (s.score || 0) + '</strong></span>' +
          '<span>正确率 <strong>' + (s.accuracy || 0) + '%</strong></span>' +
        '</div>' +
        '<div class="teacher-card-foot">' +
          '<span class="teacher-card-id">' + escapeHtml(s.id) + '</span>' +
          '<span>' + teacherFormatTime(s.lastActive) + '</span>' +
        '</div>' +
      '</div>';
  });
  html += '</div>';
  area.innerHTML = html;

  // 绑定卡片点击
  area.querySelectorAll('.teacher-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var sid = this.getAttribute('data-student-id');
      teacherOpenDrawer(sid);
    });
  });
}

/**
 * 根据分数返回状态标签
 */
function teacherGetStatus(s) {
  var score = s.score || 0;
  if (score >= 85) return { cls: 'teacher-tag-good', label: '优秀' };
  if (score >= 70) return { cls: 'teacher-tag-warn', label: '待提升' };
  return { cls: 'teacher-tag-risk', label: '需关注' };
}

/**
 * 格式化时间
 */
function teacherFormatTime(t) {
  if (!t) return '未活跃';
  var d = new Date(t);
  var now = new Date();
  var diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
  return (d.getMonth() + 1) + '/' + d.getDate();
}

/* ============== 添加学生（用户名/昵称 + 密钥验证） ============== */

function teacherAddStudent() {
  // 双输入模态：学生用户名/昵称 + 学生密钥
  var overlay = document.createElement('div');
  overlay.className = 'teacher-drawer-overlay visible';
  overlay.style.zIndex = 10010;
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.innerHTML =
    '<div style="background:var(--surface-primary,#fff);border-radius:12px;padding:24px;width:min(420px,92vw);box-shadow:var(--shadow-floating);">' +
      '<div style="font-family:var(--font-serif,"Noto Serif SC",serif);font-size:1.1rem;font-weight:700;color:var(--color-deep,#1a3a2a);margin-bottom:6px;">添加学生</div>' +
      '<div style="font-size:0.82rem;color:var(--text-muted,#8a8a8a);margin-bottom:14px;">输入学生的用户名/昵称和密钥以验证身份</div>' +
      '<label style="font-size:0.8rem;color:var(--text-secondary,#4a4a4a);display:block;margin-bottom:4px;">学生用户名/昵称</label>' +
      '<input type="text" id="teacher-add-name" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border-light,#e3e0d8);border-radius:8px;font-size:0.92rem;outline:none;background:var(--surface-primary,#fff);color:var(--text-primary,#1a2f1d);margin-bottom:12px;" placeholder="学生的用户名或昵称" autocomplete="off">' +
      '<label style="font-size:0.8rem;color:var(--text-secondary,#4a4a4a);display:block;margin-bottom:4px;">学生密钥</label>' +
      '<input type="text" id="teacher-add-key" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border-light,#e3e0d8);border-radius:8px;font-size:0.92rem;outline:none;background:var(--surface-primary,#fff);color:var(--text-primary,#1a2f1d);text-transform:uppercase;" placeholder="8 位字母数字（学生本人在「我的」查看）" autocomplete="off">' +
      '<div id="teacher-add-err" style="font-size:0.78rem;color:var(--color-error,#c0553a);margin-top:8px;display:none;"></div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">' +
        '<button class="teacher-btn teacher-btn-ghost teacher-btn-sm" id="teacher-add-cancel">取消</button>' +
        '<button class="teacher-btn teacher-btn-primary teacher-btn-sm" id="teacher-add-ok">验证并添加</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  var nameInput = overlay.querySelector('#teacher-add-name');
  var keyInput = overlay.querySelector('#teacher-add-key');
  var errEl = overlay.querySelector('#teacher-add-err');
  var okBtn = overlay.querySelector('#teacher-add-ok');
  setTimeout(function() { nameInput.focus(); }, 30);

  function close() { overlay.remove(); }
  function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
  overlay.querySelector('#teacher-add-cancel').addEventListener('click', close);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

  async function submit() {
    errEl.style.display = 'none';
    var name = nameInput.value.trim();
    var key = keyInput.value.trim().toUpperCase();
    if (!name) { showErr('请输入学生用户名/昵称'); return; }
    if (!key) { showErr('请输入学生密钥'); return; }
    if (typeof window._isValidUserKey === 'function' && !window._isValidUserKey(key)) {
      showErr('密钥格式不正确（应为 8 位字母数字，不含 0/O/1/I/L）'); return;
    }
    // 检查是否已添加
    var existing = teacherLoadClass();
    var dup = existing.filter(function(s) { return s.userKey === key; })[0];
    if (dup) { showErr('该学生已在班级中：' + dup.name); return; }

    okBtn.disabled = true; okBtn.textContent = '验证中...';
    // 通过密钥查找学生数据
    _fetchStudentByKey(key, function(student) {
      okBtn.disabled = false; okBtn.textContent = '验证并添加';
      if (!student) {
        showErr('未找到密钥对应的学生，请确认密钥正确'); return;
      }
      // 验证用户名/昵称匹配
      var studentName = student.name || '';
      var studentNameLower = studentName.toLowerCase();
      var inputNameLower = name.toLowerCase();
      if (studentNameLower !== inputNameLower &&
          studentNameLower.indexOf(inputNameLower) < 0 &&
          inputNameLower.indexOf(studentNameLower) < 0) {
        showErr('用户名/昵称与密钥不匹配，请确认信息正确'); return;
      }
      var list = teacherLoadClass();
      list.push(student);
      teacherSaveClass(list);
showToast('已添加学生：' + student.name + '（密钥 ' + key + '）');
      close();
      teacherRenderAll();
      // P0-3: 异步同步到 Supabase（dual-write）
      teacherSyncAddToSupabase(student).then(function(ok) {
        if (ok) {
          // 同步成功后刷新一次，确保 membershipId 等字段就绪
          teacherRefreshClassFromSupabase().then(function() { teacherRenderAll(); });
        }
      });
    });
  }
  okBtn.addEventListener('click', submit);
  nameInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); keyInput.focus(); } });
  keyInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
}

// 通过密钥拉取学生数据：优先 Supabase，失败则本地占位
function _fetchStudentByKey(key, callback) {
  // 尝试 Supabase
  if (typeof window.supabase !== 'undefined' && typeof window.getStudentByKey === 'function') {
    window.getStudentByKey(key).then(function(data) {
      if (data) {
        callback(_buildStudentFromData(key, data));
      } else {
        callback(_buildStudentFromData(key, null));
      }
    }).catch(function() {
      callback(_buildStudentFromData(key, null));
    });
  } else {
    // 无 Supabase 时，仅以密钥创建占位记录（教师后续可手动补全姓名）
    callback(_buildStudentFromData(key, null));
  }
}

function _buildStudentFromData(key, data) {
  var seed = (typeof teacherCopyCurrentUserData === 'function') ? teacherCopyCurrentUserData() : { score: 0, accuracy: 0, totalAnswered: 0, history: [], wrongQuestions: [] };
  return {
    id: teacherGenId(),
    userKey: key,
    name: (data && (data.display_name || data.username)) || ('学生 ' + key.slice(0, 4)),
    score: (data && data.total_score) || seed.score,
    accuracy: (data && data.accuracy) || seed.accuracy,
    lastActive: (data && data.last_active) || new Date().toISOString(),
    totalAnswered: (data && data.total_answered) || seed.totalAnswered,
    history: (data && data.history) || seed.history,
    wrongQuestions: (data && data.wrong_questions) || seed.wrongQuestions
  };
}

/* ============== 详情抽屉 ============== */

var _teacherCurrentStudentId = null;

function teacherOpenDrawer(studentId) {
  var list = teacherLoadClass();
  var student = list.filter(function (s) { return s.id === studentId; })[0];
  if (!student) return;

  _teacherCurrentStudentId = studentId;

  // 移除已有抽屉
  teacherCloseDrawer(true);

  var overlay = document.createElement('div');
  overlay.id = 'teacher-drawer-overlay';
  overlay.className = 'teacher-drawer-overlay';
  overlay.innerHTML =
    '<div class="teacher-drawer" id="teacher-drawer">' +
      '<div class="teacher-drawer-head">' +
        '<div class="teacher-drawer-title">' + escapeHtml(student.name) + ' · 详情' +
          (student.userKey ? '<span style="font-size:0.74rem;color:var(--text-muted,#8a8a8a);font-weight:400;margin-left:8px;">' + escapeHtml(student.userKey) + '</span>' : '') +
        '</div>' +
        '<button class="teacher-drawer-close" id="teacher-drawer-close" aria-label="关闭">&times;</button>' +
      '</div>' +
      '<div class="teacher-drawer-body" id="teacher-drawer-body"></div>' +
    '</div>';
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) teacherCloseDrawer();
  });
  document.getElementById('teacher-drawer-close').addEventListener('click', teacherCloseDrawer);

  setTimeout(function () {
    overlay.classList.add('visible');
    document.getElementById('teacher-drawer').classList.add('visible');
  }, 10);

  teacherRenderDrawerBody(student);
}

function teacherCloseDrawer(skipTransition) {
  var overlay = document.getElementById('teacher-drawer-overlay');
  if (!overlay) return;
  if (skipTransition) {
    overlay.remove();
  } else {
    overlay.classList.remove('visible');
    var drawer = document.getElementById('teacher-drawer');
    if (drawer) drawer.classList.remove('visible');
    setTimeout(function () { overlay.remove(); }, 300);
  }
  _teacherCurrentStudentId = null;
}

/**
 * 渲染抽屉内容：基础数据 + 薄弱模块 + AI 建议 + 导出按钮
 */
function teacherRenderDrawerBody(student) {
  var body = document.getElementById('teacher-drawer-body');
  if (!body) return;

  var weakModules = teacherComputeWeakModules(student);
  var recentWrong = (student.wrongQuestions || []).slice(-5).reverse();

  var html = '';

  // 基础数据卡
  html +=
    '<div class="teacher-detail-card">' +
      '<h4>基础数据</h4>' +
      '<div class="teacher-detail-row"><span>学生 ID</span><strong>' + escapeHtml(student.id) + '</strong></div>' +
      '<div class="teacher-detail-row"><span>Bio 分</span><strong>' + (student.score || 0) + '</strong></div>' +
      '<div class="teacher-detail-row"><span>正确率</span><strong>' + (student.accuracy || 0) + '%</strong></div>' +
      '<div class="teacher-detail-row"><span>累计答题</span><strong>' + (student.totalAnswered || 0) + '</strong></div>' +
      '<div class="teacher-detail-row"><span>最后活跃</span><strong>' + teacherFormatTime(student.lastActive) + '</strong></div>' +
    '</div>';

  // 薄弱模块列表
  html += '<div class="teacher-detail-card"><h4>薄弱模块（按错误率排序）</h4>';
  if (weakModules.length === 0) {
    html += '<div style="font-size:0.85rem;color:var(--text-muted,#8a8a8a);">暂无学习数据</div>';
  } else {
    weakModules.forEach(function (m) {
      html +=
        '<div class="teacher-weak-item">' +
          '<span>' + escapeHtml(m.module) + ' <small class="bq-text-muted">(' + m.wrong + '/' + m.total + ')</small></span>' +
          '<span style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-weight:600;color:' + (m.errorRate >= 50 ? 'var(--color-error,#e53e3e)' : '#b87a1f') + ';">' + m.errorRate + '%</span>' +
            '<span class="teacher-weak-bar"><span class="teacher-weak-bar-fill" style="width:' + m.errorRate + '%;"></span></span>' +
          '</span>' +
        '</div>';
    });
  }
  html += '</div>';

  // 最近错题
  html += '<div class="teacher-detail-card"><h4>最近错题（最多 5 道）</h4>';
  if (recentWrong.length === 0) {
    html += '<div style="font-size:0.85rem;color:var(--text-muted,#8a8a8a);">暂无错题记录</div>';
  } else {
    recentWrong.forEach(function (w) {
      var stem = (w.questionText || w.question || '').slice(0, 80);
      html +=
        '<div class="teacher-weak-item">' +
          '<span class="bq-flex-1">' + escapeHtml(stem) + (stem.length >= 80 ? '…' : '') + '</span>' +
          '<span style="font-size:0.74rem;color:var(--text-muted,#8a8a8a);">' + escapeHtml(w.subject || w.module || '') + '</span>' +
        '</div>';
    });
  }
  html += '</div>';

  // AI 辅导建议区
  html +=
    '<div class="teacher-ai-box">' +
      '<h4 style="margin:0 0 10px;font-size:0.95rem;color:var(--color-deep,#1a2f1d);">AI 辅导建议</h4>' +
      '<div id="teacher-ai-area"><div class="teacher-ai-loading">正在生成个性化辅导方案…</div></div>' +
    '</div>';

  // 操作按钮
  html +=
    '<div style="display:flex;gap:10px;margin-top:8px;">' +
      '<button class="teacher-btn teacher-btn-ghost teacher-btn-sm" id="teacher-export-one-btn">导出该生报告</button>' +
      '<button class="teacher-btn teacher-btn-ghost teacher-btn-sm" id="teacher-remove-btn" style="margin-left:auto;color:var(--color-error,#e53e3e);border-color:rgba(229,62,62,0.3);">移出班级</button>' +
    '</div>';

  body.innerHTML = html;

  // 绑定按钮
  document.getElementById('teacher-export-one-btn').addEventListener('click', function () {
    teacherExportCSV(student);
  });
  document.getElementById('teacher-remove-btn').addEventListener('click', function () {
    teacherModalConfirm('确定将 ' + student.name + ' 移出班级？此操作不可撤销。', function(ok) {
      if (ok) teacherRemoveStudent(student.id);
    });
  });

  // 异步请求 AI 建议
  teacherRequestAIAdvice(student);
}

/**
 * 移除学生
 */
function teacherRemoveStudent(studentId) {
  var list = teacherLoadClass();
  var removed = list.filter(function (s) { return s.id === studentId; })[0];
  list = list.filter(function (s) { return s.id !== studentId; });
  teacherSaveClass(list);
  teacherCloseDrawer();
  teacherRenderAll();
  showToast('已移出班级');
  // P0-3: 异步同步到 Supabase（dual-delete）
  if (removed) {
    teacherSyncRemoveToSupabase(removed).then(function() {});
  }
}

/* ============== AI 辅导建议 ============== */

/**
 * 调用 /teacher-report 生成个性化辅导建议
 */
function teacherRequestAIAdvice(student) {
  var aiArea = document.getElementById('teacher-ai-area');
  if (!aiArea) return;

  // 构造精简数据，避免请求体过大
  var weakModules = teacherComputeWeakModules(student).slice(0, 5);
  var recentWrong = (student.wrongQuestions || []).slice(-5).map(function (w) {
    return {
      question: (w.questionText || w.question || '').slice(0, 120),
      subject: w.subject || '',
      module: w.module || '',
      concept: w.concept || ''
    };
  });

  var payload = {
    studentData: {
      name: student.name,
      score: student.score,
      accuracy: student.accuracy,
      totalAnswered: student.totalAnswered,
      weakModules: weakModules,
      recentWrong: recentWrong,
      history: (student.history || []).slice(-10).map(function (h) {
        return {
          module: h.module,
          date: h.date || h.timestamp || '',
          total: (h.questions || []).length,
          correct: (h.questions || []).filter(function (q) { return q.isCorrect; }).length
        };
      }),
      wrongQuestions: recentWrong
    }
  };

  fetch('/teacher-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function (resp) {
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.json();
  }).then(function (data) {
    teacherRenderAIAdvice(data);
  }).catch(function (err) {
    console.warn('[Teacher] AI 建议请求失败', err);
    aiArea.innerHTML =
      '<div class="teacher-ai-loading" style="color:var(--color-error,#e53e3e);">' +
        'AI 建议生成失败：' + escapeHtml(err.message || '服务不可用') +
        '<br><span style="font-size:0.78rem;color:var(--text-muted,#8a8a8a);">请确保 server.py 已启动并暴露 /teacher-report 端点</span>' +
      '</div>';
  });
}

function teacherRenderAIAdvice(data) {
  var aiArea = document.getElementById('teacher-ai-area');
  if (!aiArea) return;

  if (!data || !data.ok) {
    aiArea.innerHTML = '<div class="teacher-ai-loading" style="color:var(--color-error,#e53e3e);">' + escapeHtml((data && data.error) || 'AI 建议生成失败') + '</div>';
    return;
  }

  var a = data.advice || data;
  var html = '';

  if (a.predictedGrade) {
    html += '<div style="margin-bottom:10px;">预测等级：<span class="teacher-ai-grade">' + escapeHtml(a.predictedGrade) + '</span></div>';
  }

  if (a.strengths) {
    html += '<div class="teacher-ai-suggestion"><strong>优势：</strong>' + escapeHtml(a.strengths) + '</div>';
  }
  if (a.weaknesses) {
    html += '<div class="teacher-ai-suggestion"><strong>薄弱点：</strong>' + escapeHtml(a.weaknesses) + '</div>';
  }

  var suggestions = a.suggestions || [];
  if (Array.isArray(suggestions) && suggestions.length > 0) {
    suggestions.forEach(function (s, i) {
      var text = typeof s === 'string' ? s : (s.text || s.suggestion || JSON.stringify(s));
      html += '<div class="teacher-ai-suggestion"><strong>建议 ' + (i + 1) + '：</strong>' + escapeHtml(text) + '</div>';
    });
  }

  if (!html) {
    html = '<div class="teacher-ai-loading">AI 未返回有效建议</div>';
  }

  aiArea.innerHTML = html;
}

/* ============== CSV 导出 ============== */

/**
 * 导出 CSV：传入 student 仅导出该生，传 null 导出全班
 */
function teacherExportCSV(student) {
  var list = teacherLoadClass();
  var rows = [];
  var filename;

  if (student) {
    filename = 'tatabox_report_' + (student.name || student.id) + '.csv';
    var weakModules = teacherComputeWeakModules(student);
    rows.push(['学生报告', '', '', '']);
    rows.push(['姓名', 'ID', 'Bio分', '正确率', '累计答题', '最后活跃']);
    rows.push([
      student.name || '',
      student.id || '',
      student.score || 0,
      (student.accuracy || 0) + '%',
      student.totalAnswered || 0,
      student.lastActive ? new Date(student.lastActive).toLocaleString('zh-CN') : ''
    ]);
    rows.push([]);
    rows.push(['薄弱模块', '总题数', '错题数', '错误率']);
    weakModules.forEach(function (m) {
      rows.push([m.module, m.total, m.wrong, m.errorRate + '%']);
    });
    rows.push([]);
    rows.push(['最近错题']);
    (student.wrongQuestions || []).slice(-5).reverse().forEach(function (w) {
      rows.push([(w.questionText || w.question || '').replace(/[\n,]/g, ' ').slice(0, 200), w.subject || '', w.module || '']);
    });
  } else {
    filename = 'bioquest_class_report.csv';
    if (list.length === 0) {
      showToast('班级暂无学生，无法导出');
      return;
    }
    rows.push(['TATABOX 班级报告', '', '', '', '', '']);
    rows.push(['导出时间', new Date().toLocaleString('zh-CN')]);
    rows.push([]);
    rows.push(['姓名', '学生ID', 'Bio分', '正确率', '累计答题', '最后活跃', '状态']);
    list.forEach(function (s) {
      var status = teacherGetStatus(s);
      rows.push([
        s.name || '',
        s.id || '',
        s.score || 0,
        (s.accuracy || 0) + '%',
        s.totalAnswered || 0,
        s.lastActive ? new Date(s.lastActive).toLocaleString('zh-CN') : '',
        status.label
      ]);
    });
    rows.push([]);
    // 班级统计
    var avgScore = 0, avgAcc = 0;
    list.forEach(function (s) {
      avgScore += (s.score || 0);
      avgAcc += (s.accuracy || 0);
    });
    avgScore = list.length ? Math.round(avgScore / list.length) : 0;
    avgAcc = list.length ? Math.round(avgAcc / list.length) : 0;
    rows.push(['班级统计']);
    rows.push(['学生总数', list.length]);
    rows.push(['平均分', avgScore]);
    rows.push(['平均正确率', avgAcc + '%']);
  }

  // 生成 CSV 字符串（含 BOM 以兼容 Excel 中文）
  var csv = '\ufeff' + rows.map(function (r) {
    return r.map(function (cell) {
      var s = String(cell == null ? '' : cell);
      if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\n');

  // Blob 下载
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 200);

  showToast('已导出：' + filename);
}

/* ============== 班级统计图表（SVG） ============== */

function teacherRenderClassCharts() {
  var area = document.getElementById('teacher-charts-area');
  if (!area) return;

  var list = teacherLoadClass();
  if (list.length === 0) {
    area.innerHTML = '<div class="teacher-empty"><div class="teacher-empty-title">添加学生后即可查看班级统计</div></div>';
    return;
  }

  // 分数分布：0-60 / 60-70 / 70-80 / 80-90 / 90-100
  var buckets = [
    { label: '0-60', min: 0, max: 60, count: 0 },
    { label: '60-70', min: 60, max: 70, count: 0 },
    { label: '70-80', min: 70, max: 80, count: 0 },
    { label: '80-90', min: 80, max: 90, count: 0 },
    { label: '90-100', min: 90, max: 101, count: 0 }
  ];
  list.forEach(function (s) {
    var sc = s.score || 0;
    for (var i = 0; i < buckets.length; i++) {
      if (sc >= buckets[i].min && sc < buckets[i].max) {
        buckets[i].count++;
        break;
      }
    }
  });

  // 模块掌握度：聚合所有学生的薄弱模块
  var moduleStats = {};
  list.forEach(function (s) {
    var weak = teacherComputeWeakModules(s);
    weak.forEach(function (m) {
      if (!moduleStats[m.module]) moduleStats[m.module] = { total: 0, wrong: 0 };
      moduleStats[m.module].total += m.total;
      moduleStats[m.module].wrong += m.wrong;
    });
  });
  var moduleList = Object.keys(moduleStats).map(function (mod) {
    var s = moduleStats[mod];
    var mastery = s.total > 0 ? Math.round(((s.total - s.wrong) / s.total) * 100) : 0;
    return { module: mod, mastery: mastery };
  });

  area.innerHTML =
    '<div class="teacher-charts">' +
      '<div class="teacher-chart-box">' +
        '<h4>分数分布</h4>' +
        teacherBarChartSVG(buckets) +
      '</div>' +
      '<div class="teacher-chart-box">' +
        '<h4>模块掌握度</h4>' +
        teacherRadarChartSVG(moduleList) +
      '</div>' +
    '</div>';
}

/**
 * SVG 柱状图（分数分布）
 */
function teacherBarChartSVG(buckets) {
  var W = 320, H = 180, padding = 30;
  var maxCount = Math.max.apply(null, buckets.map(function (b) { return b.count; }).concat([1]));
  var barW = (W - padding * 2) / buckets.length * 0.6;
  var gap = (W - padding * 2) / buckets.length;

  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
  // Y 轴线
  svg += '<line x1="' + padding + '" y1="' + (H - padding) + '" x2="' + (W - padding) + '" y2="' + (H - padding) + '" stroke="#ccc" stroke-width="1"/>';
  svg += '<line x1="' + padding + '" y1="' + padding + '" x2="' + padding + '" y2="' + (H - padding) + '" stroke="#ccc" stroke-width="1"/>';

  buckets.forEach(function (b, i) {
    var h = maxCount > 0 ? (b.count / maxCount) * (H - padding * 2) : 0;
    var x = padding + i * gap + (gap - barW) / 2;
    var y = H - padding - h;
    svg += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="3" fill="#5a7d5c"/>';
    if (b.count > 0) {
      svg += '<text x="' + (x + barW / 2) + '" y="' + (y - 4) + '" text-anchor="middle" font-size="10" fill="#1a3a2a">' + b.count + '</text>';
    }
    svg += '<text x="' + (x + barW / 2) + '" y="' + (H - padding + 14) + '" text-anchor="middle" font-size="10" fill="#8a8a8a">' + b.label + '</text>';
  });
  svg += '</svg>';
  return svg;
}

/**
 * SVG 雷达图（模块掌握度）
 */
function teacherRadarChartSVG(moduleList) {
  var W = 280, H = 220, cx = W / 2, cy = H / 2, R = 80;
  var n = moduleList.length;

  if (n < 3) {
    return '<div style="font-size:0.82rem;color:var(--text-muted,#8a8a8a);text-align:center;padding:30px 0;">模块数不足 3 个，无法绘制雷达图</div>';
  }

  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';

  // 同心圆网格（4 层）
  for (var g = 1; g <= 4; g++) {
    var r = R * g / 4;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var angle = -Math.PI / 2 + i * 2 * Math.PI / n;
      pts.push((cx + r * Math.cos(angle)) + ',' + (cy + r * Math.sin(angle)));
    }
    svg += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="#ece8e1" stroke-width="1"/>';
  }

  // 轴线
  for (var j = 0; j < n; j++) {
    var ang = -Math.PI / 2 + j * 2 * Math.PI / n;
    svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R * Math.cos(ang)) + '" y2="' + (cy + R * Math.sin(ang)) + '" stroke="#ece8e1" stroke-width="1"/>';
  }

  // 数据多边形
  var dataPts = [];
  for (var k = 0; k < n; k++) {
    var a = -Math.PI / 2 + k * 2 * Math.PI / n;
    var val = (moduleList[k].mastery || 0) / 100;
    dataPts.push((cx + R * val * Math.cos(a)) + ',' + (cy + R * val * Math.sin(a)));
  }
  svg += '<polygon points="' + dataPts.join(' ') + '" fill="rgba(90,125,92,0.25)" stroke="#5a7d5c" stroke-width="2"/>';

  // 数据点 + 标签
  for (var m = 0; m < n; m++) {
    var a2 = -Math.PI / 2 + m * 2 * Math.PI / n;
    var val2 = (moduleList[m].mastery || 0) / 100;
    var dx = cx + R * val2 * Math.cos(a2);
    var dy = cy + R * val2 * Math.sin(a2);
    svg += '<circle cx="' + dx + '" cy="' + dy + '" r="3" fill="#3a8c5c"/>';

    var lx = cx + (R + 14) * Math.cos(a2);
    var ly = cy + (R + 14) * Math.sin(a2);
    var label = moduleList[m].module.replace('module_', 'M');
    svg += '<text x="' + lx + '" y="' + ly + '" text-anchor="middle" font-size="10" fill="#1a3a2a">' + escapeHtml(label) + '</text>';
    svg += '<text x="' + lx + '" y="' + (ly + 11) + '" text-anchor="middle" font-size="9" fill="#5a7d5c">' + moduleList[m].mastery + '%</text>';
  }

  svg += '</svg>';
  return svg;
}

/* ============== 模块入口 ============== */

function initTeacher(target) {
  if (!target) target = document.getElementById('page-content');
  if (!target) return;
  // P0-3: 先用 localStorage 即时渲染（首屏体验），再异步从 Supabase 刷新
  renderTeacherPage(target);
  // 异步刷新班级数据（仅登录用户触发）
  teacherRefreshClassFromSupabase().then(function(ok) {
    if (ok) teacherRenderAll();
  });
}

// 暴露到全局
window.initTeacher = initTeacher;
window.renderTeacherPage = renderTeacherPage;
window.teacherRefreshClassFromSupabase = teacherRefreshClassFromSupabase;
