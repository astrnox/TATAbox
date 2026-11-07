/**
 * ============================================================
 * TATABOX — 统一数据层
 * 自动选择：Supabase 直连 > 本地存储
 * auth 函数 (registerUser/loginUser/logoutUser) 由 supabase-client.js 提供
 * ============================================================
 */

'use strict';

var API_BASE = '';
var _authToken = null;
var _apiBaseDetected = false;
var _useSupabase = false; // 是否使用 Supabase 直连模式

// 提前检测 Supabase 客户端是否存在
// 注意：不在此处调用 getSupabase()，避免在模块加载时触发 _setupAuthListener()
// _setupAuthListener 会在 initSupabase() 流程中通过 restoreSession() → getSupabase() 触发
if (typeof window.getSupabase === 'function') {
  // 仅检查 Supabase SDK 是否可用，不初始化客户端
  if (typeof window.supabase !== 'undefined') {
    _useSupabase = true;
  }
}

/**
 * 获取当前用户（委托给 supabase-client.js 的统一版本）
 */
function getUserRef() {
  return (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
}

function getUserGroup() {
  var user = getUserRef();
  if (!user) return 'guest';
  return user.user_group || 'member';
}

/**
 * 检测可用的后端模式
 */
async function detectApiBase() {
  if (_apiBaseDetected) return;

  if (typeof window.getSupabase === 'function') {
    var sb = window.getSupabase();
    if (sb) {
      _useSupabase = true;
      _apiBaseDetected = true;
      // 注意：不再在此处调用 restoreSession()
      // restoreSession 由 initSupabase() 统一调用，避免重复
      return;
    }
  }

  _apiBaseDetected = true;
}

/**
 * 通用 API 请求（代理模式）
 * 修复 P1-7：纯前端化后此函数为死代码（无 server.py 后端），仅保留兼容性
 * 所有数据应通过 supabase-client.js 的 sbSelect/sbInsert/sbUpdate/sbDelete 访问 Supabase
 */
async function apiCall(method, path, body) {
  console.warn('[supabase.js] apiCall 已弃用（纯前端项目无后端），路径:', path, '—— 请改用 supabase-client.js 的 sb* 函数');
  var headers = { 'Content-Type': 'application/json' };
  if (_authToken) {
    headers['Authorization'] = 'Bearer ' + _authToken;
  }

  var options = { method: method, headers: headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    var resp = await fetch(API_BASE + path, options);
    var text = await resp.text();
    if (text.charAt(0) === '<' || resp.status === 404) {
      return { ok: false, status: resp.status || 0, data: null };
    }
    var data = JSON.parse(text);
    return { ok: resp.ok, status: resp.status, data: data };
  } catch (err) {
    return { ok: false, status: 0, data: null };
  }
}

/**
 * 获取当前用户 ID（内部使用）
 */
function _getCurrentUserId() {
  var user = getUserRef();
  return user ? user.id : null;
}

/**
 * 错题本
 */
async function getWrongQuestions() {
  if (_useSupabase && typeof window.sbSelect === 'function' && getUserRef()) {
    var result = await window.sbSelect('wrong_questions', {
      select: '*',
      eq: { profile_id: _getCurrentUserId() },
      order: { column: 'updated_at', ascending: false }
    });
    return { data: result.data || [] };
  }

  var result = await apiCall('GET', '/api/data/wrong_questions');
  return { data: result.ok && result.data ? result.data.data : [] };
}

async function saveWrongQuestion(qId, module, questionText, subject, wrongCount, extraData) {
  if (_useSupabase && typeof window.sbInsert === 'function' && getUserRef()) {
    await window.sbInsert('wrong_questions', {
      profile_id: _getCurrentUserId(),
      question_id: qId,
      module_num: module,
      question_text: questionText,
      subject: subject,
      wrong_count: wrongCount,
      extra_data: extraData || ''
    });
    return { ok: true };
  }

  await apiCall('POST', '/api/data/wrong_questions', {
    question_id: qId,
    module_num: module,
    question_text: questionText,
    subject: subject,
    wrong_count: wrongCount,
    extra_data: extraData
  });
  return { ok: true };
}

async function deleteWrongQuestion(qId) {
  if (_useSupabase && typeof window.sbDelete === 'function' && getUserRef()) {
    await window.sbDelete('wrong_questions', {
      profile_id: _getCurrentUserId(),
      question_id: qId
    });
    return { ok: true };
  }

  await apiCall('DELETE', '/api/data/wrong_questions/' + qId);
  return { ok: true };
}

/**
 * 收藏夹
 */
async function getFavorites() {
  if (_useSupabase && typeof window.sbSelect === 'function' && getUserRef()) {
    var result = await window.sbSelect('favorites', {
      select: '*',
      eq: { profile_id: _getCurrentUserId() }
    });
    return { data: result.data || [] };
  }

  var result = await apiCall('GET', '/api/data/favorites');
  return { data: result.ok && result.data ? result.data.data : [] };
}

async function saveFavorite(qId, module, questionText, subject) {
  if (_useSupabase && typeof window.sbInsert === 'function' && getUserRef()) {
    await window.sbInsert('favorites', {
      profile_id: _getCurrentUserId(),
      question_id: qId,
      module_num: module,
      question_text: questionText,
      subject: subject
    });
    return { ok: true };
  }

  await apiCall('POST', '/api/data/favorites', {
    question_id: qId,
    module_num: module,
    question_text: questionText,
    subject: subject
  });
  return { ok: true };
}

async function deleteFavorite(qId) {
  if (_useSupabase && typeof window.sbDelete === 'function' && getUserRef()) {
    await window.sbDelete('favorites', {
      profile_id: _getCurrentUserId(),
      question_id: qId
    });
    return { ok: true };
  }

  await apiCall('DELETE', '/api/data/favorites/' + qId);
  return { ok: true };
}

/**
 * 练习记录
 */
async function getPracticeRecords() {
  if (_useSupabase && typeof window.sbSelect === 'function' && getUserRef()) {
    var result = await window.sbSelect('practice_records', {
      select: '*',
      eq: { profile_id: _getCurrentUserId() },
      order: { column: 'created_at', ascending: false },
      limit: 200
    });
    return { data: result.data || [] };
  }

  var result = await apiCall('GET', '/api/data/practice_records');
  return { data: result.ok && result.data ? result.data.data : [] };
}

async function savePracticeRecord(rec) {
  if (_useSupabase && typeof window.sbInsert === 'function' && getUserRef()) {
    await window.sbInsert('practice_records', {
      profile_id: _getCurrentUserId(),
      question_id: rec.question_id || 0,
      module_num: rec.module_num || 1,
      subject: rec.subject || '',
      user_answers: rec.user_answers || {},
      score: rec.score || 0,
      duration: rec.duration || 0,
      is_correct: rec.is_correct || false
    });
    return;
  }

  await apiCall('POST', '/api/data/practice_records', {
    question_id: rec.question_id || 0,
    module_num: rec.module_num || 1,
    subject: rec.subject || '',
    user_answers: rec.user_answers || {},
    score: rec.score || 0,
    duration: rec.duration || 0,
    is_correct: rec.is_correct || false
  });
}

/**
 * 云同步
 */
async function syncToCloud() {
  if (_useSupabase) {
    // Supabase 模式下数据已实时同步，无需手动同步
    return { ok: true };
  }

  var localWrong = safeGetJSON('tatabox_wrong_questions', []);
  var localFavs = safeGetJSON('tatabox_favorites', []);
  var localRecords = safeGetJSON('tatabox_records', []);

  var result = await apiCall('POST', '/api/sync/upload', {
    wrong_questions: localWrong.map(function(w) {
      return {
        question_id: w.qId || 0,
        module_num: w.module || 1,
        question_text: w.questionText || '',
        subject: w.subject || '',
        wrong_count: w.wrongCount || 1
      };
    }),
    favorites: localFavs.map(function(f) {
      // Issue #10：收藏 ID 已统一为稳定 bioID 字符串，原样上传
      return { question_id: String(f) };
    }),
    records: localRecords.slice(-100)
  });

  if (result.ok) {
    // 清空本地待同步数据
    localStorage.setItem('tatabox_wrong_questions', '[]');
    localStorage.setItem('tatabox_favorites', '[]');
    localStorage.setItem('tatabox_records', '[]');
  }
  return result;
}

async function mergeCloudData() {
  // Supabase 模式下数据已实时同步
  if (_useSupabase) return;

  if (!window.isLoggedIn()) return;

  try {
    var wrong = await getWrongQuestions();
    var favs = await getFavorites();
    var records = await getPracticeRecords();

    // 合并到本地（取并集，保留本地较新数据）
    var localWrong = safeGetJSON('tatabox_wrong_questions', []);
    var localFavs = safeGetJSON('tatabox_favorites', []);
    var localRecords = safeGetJSON('tatabox_records', []);

    // 简单合并策略：云端数据覆盖本地
    if (wrong.data && wrong.data.length > 0) {
      localStorage.setItem('tatabox_wrong_questions_cloud', JSON.stringify(wrong.data));
    }
    if (favs.data && favs.data.length > 0) {
      localStorage.setItem('tatabox_favorites_cloud', JSON.stringify(favs.data));
    }
  } catch (e) {
    // 静默失败
  }
}

/**
 * 更新分数
 */
// updateBioScore 由 supabase-client.js 提供，直接写入 Supabase，不在此覆盖

/**
 * 工具函数
 */
function safeGetJSON(key, defaultValue) {
  try {
    var val = localStorage.getItem(key);
    if (val) return JSON.parse(val);
  } catch (e) {}
  return defaultValue;
}

/**
 * 获取当前用户组
 */
function getUserGroup() {
  var user = getUserRef();
  if (!user) return 'guest';
  return user.user_group || 'member';
}

/**
 * 检查当前用户是否有足够权限
 * 已简化权限系统：只有「管理员」和「普通用户」之分，所有已登录用户（非guest）可用全部功能
 *   - admin：管理员（可进入后台管理）
 *   - 其它所有组（member/premium/verified/任何非admin值）：普通用户，拥有完整前端功能权限
 *   - guest（未登录）：权限最低，但在该项目中不做硬限制（用户要求"不要有权限限制"）
 */
function hasPermission(requiredGroup) {
  // 管理员拥有一切权限
  var currentGroup = getUserGroup();
  if (currentGroup === 'admin') return true;

  // 对于任何非 admin 级别的权限要求（如 premium / verified / member），
  // 只要用户不是 guest（访客），一律放行。未登录 guest 也按用户要求宽松处理：
  // eBook 下载、AI 额度等全部开放
  if (requiredGroup === 'admin') return false; // admin 仅管理员可达
  return true; // 其它全部放行（member/premium/verified/guest 均等同用户）
}

// 暴露到全局（注意：registerUser/loginUser/logoutUser/getCurrentUser/isLoggedIn 由 supabase-client.js 提供，此处不覆盖）
window.getWrongQuestions = getWrongQuestions;
window.saveWrongQuestion = saveWrongQuestion;
window.deleteWrongQuestion = deleteWrongQuestion;
window.getFavorites = getFavorites;
window.saveFavorite = saveFavorite;
window.deleteFavorite = deleteFavorite;
window.getPracticeRecords = getPracticeRecords;
window.savePracticeRecord = savePracticeRecord;
window.syncToCloud = syncToCloud;
window.mergeCloudData = mergeCloudData;
// window.updateBioScore 由 supabase-client.js 提供
window.apiCall = apiCall;
window.detectApiBase = detectApiBase;
window.initApi = detectApiBase; // 兼容旧名称
window.getUserGroup = getUserGroup;
window.hasPermission = hasPermission;
window._setCurrentUser = function(user) {
  // 委托给 supabase-client.js 的 localStorage 存储
  if (user) {
    try { localStorage.setItem('tatabox_user', JSON.stringify(user)); } catch(e) {}
  } else {
    localStorage.removeItem('tatabox_auth_token');
    localStorage.removeItem('tatabox_user');
  }
};
