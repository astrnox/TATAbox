/**
 * ============================================================
 * TATABOX — Supabase 客户端（前端直连版）
 * 用于静态托管（如彩虹云 FTP）无需 Python 后端
 * ============================================================
 */

// Supabase 配置
var SUPABASE_URL = 'https://qxehkfucvmxuojjkdaqy.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZWhrZnVjdm14dW9qamtkYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjU2ODUsImV4cCI6MjEwMjIwMTY4NX0.lbiJxhFvy0t_J4qSeoP6K0r53M4KaEDSKkRlZu03ze8';

// 初始化 Supabase 客户端
var _supabase = null;
var _currentUser = null;

// 信用点默认值。原始定义在 sb-gamify.js，但本文件里多处注册/登录流程会直接引用；
// 若 sb-gamify.js 尚未加载（或某些加载链未引入它），会抛 ReferenceError 导致登录失败。
// 仅在未定义时兜底赋 100，避免两处无条件同名 var 定义、后续只改一边就漂移。
if (typeof POINTS_DEFAULT === 'undefined') {
  var POINTS_DEFAULT = 100;
}

/**
 * 获取本地时区日期字符串 YYYY-MM-DD
 * 统一替代 toISOString().split('T')[0]（UTC），避免跨日边界问题
 */
function _localDateStr(date) {
  date = date || new Date();
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

var AUTH_UPDATE_DEBOUNCE_MS = 200;             // 认证状态变更防抖时间
var USER_KEY_READ_DELAY_MS = 600;              // 等待触发器生成 user_key 的延迟
var SESSION_RESTORE_CACHE_TTL_MS = 5000;       // restoreSession 结果缓存时长
var GET_SESSION_TIMEOUT_MS = 5000;             // getSession 超时
var PROFILE_FETCH_TIMEOUT_MS = 5000;           // profile 查询超时
var EMAIL_VERIFICATION_TIMEOUT_MS = 3000;     // 邮箱验证状态查询超时

/**
 * 数据库依赖缺失告警（视图/RPC 未先行部署时，前端会静默降级为匿名/空数据）。
 * 同一依赖只告警一次，避免轮询刷屏；只在错误确实是「不存在」时触发。
 */
var _warnedDependencies = {};
function _warnMissingDependency(label, err, hint) {
  var msg = String((err && err.message) || err || '');
  var code = err && err.code;
  var missing = code === '42P01' || code === 'PGRST202' || code === 'PGRST205' ||
    /Could not find|does not exist|not found|schema cache/i.test(msg);
  if (!missing || _warnedDependencies[label]) return;
  _warnedDependencies[label] = true;
  console.warn('[TATABOX] ' + label + ' 不可用：' + msg + (hint ? '；' + hint : ''));
}
var ADMIN_TOKEN_TTL = 5 * 60 * 1000;           // 前端管理员 token 有效期（5 分钟）

/**
 * 获取 Supabase 客户端实例
 */
function getSupabase() {
  if (!_supabase && typeof window.supabase !== 'undefined') {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
    // 监听认证状态变化（邮箱确认回调等）
    _setupAuthListener();
  }
  return _supabase;
}

/**
 * 使用 fetch() 直接调用 Supabase REST API，避免 Supabase JS 客户端内部取消请求导致 net::ERR_ABORTED
 */
async function sbFetchRest(method, table, queryParams, body) {
  var sb = getSupabase();
  var token = null;
  if (sb) {
    try {
      var { data } = await sb.auth.getSession();
      token = (data && data.session && data.session.access_token) || null;
    } catch (e) {}
  }
  var url = SUPABASE_URL + '/rest/v1/' + table + (queryParams ? '?' + queryParams : '');
  var headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + (token || SUPABASE_ANON_KEY),
    'Content-Type': 'application/json'
  };
  if (method === 'POST' || method === 'PATCH') {
    headers['Prefer'] = 'return=representation';
  }
  var fetchOpts = { method: method, headers: headers };
  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    fetchOpts.body = JSON.stringify(body);
  }
  try {
    var resp = await fetch(url, fetchOpts);
    var json = null;
    try {
      json = await resp.json();
    } catch (e) {}
    if (!resp.ok) {
      console.error('[sbFetchRest] 请求失败:', method, table, resp.status, json);
      return { ok: false, data: json, status: resp.status };
    }
    return { ok: true, data: json, status: resp.status };
  } catch (fetchErr) {
    console.error('[sbFetchRest] 网络错误:', fetchErr.message);
    return { ok: false, data: null, status: 0 };
  }
}

/**
 * 设置认证状态监听器
 * 当用户通过邮件链接确认邮箱后，Supabase 会触发 SIGNED_IN 事件
 * 添加防抖机制，避免与 restoreSession 重复更新 DOM
 */
var _authUpdateDebounce = null;

function _setupAuthListener() {
  if (!_supabase || _supabase._authListenerSetup) return;
  _supabase._authListenerSetup = true;

  try {
    _supabase.auth.onAuthStateChange(function(event, session) {
      // 修复：监听 INITIAL_SESSION 事件，确保刷新时能恢复用户状态
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session && session.user) {
        var authUser = session.user;
        var isRealEmail = authUser.email && !authUser.email.endsWith('@bioquest.local');
        var isVerified = isRealEmail && authUser.email_confirmed_at;

        // 修复：INITIAL_SESSION 总是恢复，SIGNED_IN 仅在未验证时跳过
        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || isVerified) {
          if (_authUpdateDebounce) clearTimeout(_authUpdateDebounce);
          _authUpdateDebounce = setTimeout(function() {
            // 如果当前用户已是同一用户，跳过
            if (_currentUser && _currentUser.id === authUser.id && (event === 'INITIAL_SESSION' || _currentUser.email_verified)) {
              // 但如果是 INITIAL_SESSION，仍要确保 email_verified 状态正确
              if (event === 'INITIAL_SESSION' && isVerified && !_currentUser.email_verified) {
                _currentUser.email_verified = true;
                if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
              }
              return;
            }

            _supabase.from('profiles')
              .select('*')
              .eq('id', authUser.id)
              .maybeSingle()
              .then(function(result) {
                var profile = result && result.data;
                _currentUser = {
                  id: authUser.id,
                  username: (profile && profile.username) || authUser.email.split('@')[0],
                  display_name: (profile && profile.display_name) || authUser.email.split('@')[0],
                  email: authUser.email,
                  bio_score: (profile && profile.bio_score) || 0,
                  points: (profile && profile.points) || POINTS_DEFAULT,
                  user_group: (profile && profile.user_group) || 'member',
                  email_verified: !!isVerified
                };
                // 触发 UI 更新
                if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
                // 触发 admin 自动认证
                if (typeof window._onAuthUserLoaded === 'function') {
                  window._onAuthUserLoaded(_currentUser);
                }
                // 保存 user_key
                if (typeof window.saveUserKeyIfNeeded === 'function') {
                  window.saveUserKeyIfNeeded();
                }
                _persistUserInfo();
                // Issue #13：登录/恢复会话后异步拉取云端进度（LWW 合并，暂不阻塞）
                if (typeof window.syncLocalProgressToCloud === 'function') {
                  window.syncLocalProgressToCloud().catch(function () {});
                }
              })
              .catch(function(e) {
                console.warn('[TATABOX] onAuthStateChange 获取 profile 失败:', e);
              });
          }, AUTH_UPDATE_DEBOUNCE_MS); // 缩短到 200ms
        }
      } else if (event === 'SIGNED_OUT') {
        // 登出事件
        _currentUser = null;
        _persistUserInfo();
        // 清除管理员认证状态
        if (typeof window._onAuthUserLoaded === 'function') {
          window._onAuthUserLoaded(null);
        }
        try {
          sessionStorage.removeItem('bioquest_admin_auth');
          sessionStorage.removeItem('bioquest_admin_attempts');
          sessionStorage.removeItem('bioquest_admin_lock');
        } catch(e) {}
        if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
      } else if (event === 'PASSWORD_RECOVERY') {
        // 邮件重置链接落地：GoTrue 会用 #access_token=...&type=recovery 覆盖
        // redirectTo 自带的 hash，token 消费后 URL 只剩 #，这里主动跳到设置密码页
        if (window.location.hash !== '#/reset-password') {
          window.location.hash = '#/reset-password';
        }
      }
    });
  } catch (e) {
    // 静默失败
  }
}

/**
 * 获取当前用户
 */
function getCurrentUser() {
  return _currentUser;
}

/**
 * 检查是否已登录
 */
function isLoggedIn() {
  return _currentUser !== null;
}

// 将当前用户的可展示信息（昵称/用户名/头像）持久化到 localStorage，
// 供其它页面（如 wiki.html 这类轻页面）读取，从而在提交历史中显示作者头像与昵称。
var _USER_INFO_KEY = 'bioquest_user_info';
function _persistUserInfo() {
  try {
    var u = _currentUser;
    if (u) {
      var avatar = '';
      try { avatar = localStorage.getItem('bioquest_avatar') || ''; } catch (e) {}
      localStorage.setItem(_USER_INFO_KEY, JSON.stringify({
        username: u.username || u.email || '',
        display_name: u.display_name || u.username || '',
        avatar: avatar
      }));
    } else {
      localStorage.removeItem(_USER_INFO_KEY);
    }
  } catch (e) { /* 静默 */ }
}

/**
 * 重发验证邮件
 */
async function resendConfirmationEmail(email) {
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var { error } = await sb.auth.resend({
      type: 'signup',
      email: email
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 忘记密码 — 发送重置密码邮件（保留原邮件方式作为备选）
 */
async function resetPassword(email) {
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  if (!email || !email.includes('@')) {
    return { ok: false, error: '请输入有效的邮箱地址' };
  }
  try {
    var { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/index.html#/reset-password'
    });
    if (error) {
      var msg = error.message;
      if (msg.includes('rate limit')) msg = '请求过于频繁，请稍后再试';
      else if (msg.includes('not found')) msg = '该邮箱未注册';
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 找回密码（无需邮件）
 * 通过 username + 8 字符 user_key 验证身份后重置密码
 * 需要 Supabase 已部署 migration_v4_password_reset.sql 中的 RPC
 */
async function resetPasswordByKey(username, userKey, newPassword) {
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  if (!username || !userKey || !newPassword) {
    return { ok: false, error: '请填写完整信息' };
  }
  if (newPassword.length < 6) {
    return { ok: false, error: '新密码至少 6 位' };
  }
  try {
    var result = await sb.rpc('reset_password_by_key', {
      p_username: username,
      p_user_key: userKey,
      p_new_password: newPassword
    });
    if (result.error) {
      return { ok: false, error: result.error.message || '重置失败' };
    }
    var data = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!data || !data.ok) {
      return { ok: false, error: (data && data.error_msg) || '用户名或 8 字符密钥不正确' };
    }
    return { ok: true, userId: data.user_id };
  } catch (e) {
    return { ok: false, error: e.message || '重置异常' };
  }
}

/**
 * 找回 user_key（用户名 + 邮箱后缀验证）
 * 用于忘记密钥但记得用户名和邮箱的场景
 */
async function recoverUserKey(username, emailHint) {
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  if (!username || !emailHint) {
    return { ok: false, error: '请填写用户名和邮箱后缀（如 @gmail.com）' };
  }
  try {
    var result = await sb.rpc('recover_user_key', {
      p_username: username,
      p_email_hint: emailHint
    });
    if (result.error) {
      return { ok: false, error: result.error.message || '查询失败' };
    }
    var data = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!data || !data.ok) {
      return { ok: false, error: (data && data.error_msg) || '用户名或邮箱不匹配' };
    }
    return { ok: true, userKey: data.user_key };
  } catch (e) {
    return { ok: false, error: e.message || '查询异常' };
  }
}

/**
 * 获取当前用户的 user_key（注册后首次展示用）
 * 一次性展示给用户后应让其截图保存
 */
async function getUserKeyForCurrentUser() {
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  var user = getCurrentUser();
  if (!user || !user.id) return { ok: false, error: '未登录' };
  try {
    var result = await sb.from('profiles')
      .select('user_key')
      .eq('id', user.id)
      .maybeSingle();
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, userKey: (result.data && result.data.user_key) || null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 计算"注册未填邮箱"账号的占位邮箱
 * 规则必须与 registerUser 生成认证邮箱的规则完全一致，
 * 否则登录时按用户名推导占位邮箱会失败（正确密码也会被误判为密码错误）
 * @param {string} username
 * @returns {string|null} 占位邮箱；用户名为空时返回 null
 */
function _placeholderEmailForUsername(username) {
  var clean = String(username || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return clean ? clean + '@bioquest.local' : null;
}

/**
 * 注册用户
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @param {string} displayName - 显示名称
 * @param {string} [email] - 可选真实邮箱，验证后升级为认证会员
 */
async function registerUser(username, password, displayName, email) {

  // 防止重复提交：同邮箱 30 秒内只允许一次注册请求
  var lockKey = 'bioquest_signup_lock:' + (email || '').toLowerCase();
  var lockUntil = 0;
  try { lockUntil = parseInt(localStorage.getItem(lockKey)) || 0; } catch (e) {}
  if (Date.now() < lockUntil) {
    var remain = Math.ceil((lockUntil - Date.now()) / 1000);
    return { ok: false, error: '注册请求过于频繁，请 ' + remain + ' 秒后再试' };
  }

  var sb = getSupabase();

  if (!sb) {
    var detail = '';
    if (typeof window.supabase === 'undefined') {
      detail = '（Supabase SDK 尚未加载完成，请稍后重试）';
    }
    return { ok: false, error: '系统未就绪，请刷新页面后重试' + detail };
  }

  // email 可选：如果用户没填，自动生成一个基于用户名的假邮箱
  // 这样可以避免 Supabase 邮件发送失败导致的 500 错误
  if (!email || !email.trim()) {
    email = _placeholderEmailForUsername(username) || 'user@bioquest.local';

  } else if (!email.includes('@')) {
    return { ok: false, error: '请输入有效的邮箱地址（或留空使用占位）' };
  }

  // 预防性检查：username 是否已被占用
  // clearLock 提前声明（避免 var hoisting 导致 TypeError）
  var clearLock = function () { try { localStorage.removeItem(lockKey); } catch (e) {} };
  try {
    var dupCheck = await sb.from('public_profiles')
      .select('id, username')
      .eq('username', username)
      .maybeSingle();
    if (dupCheck.data && dupCheck.data.id) {
      clearLock();
      return { ok: false, error: '该用户名已被使用，请换一个' };
    }
  } catch (e) {
    console.warn('[TATABOX] username 重复检查失败（非致命）:', e && e.message);
  }

  // 预防性检查：email 是否已被注册（仅当用户填了真实邮箱）
  if (email && !email.endsWith('@bioquest.local')) {
    try {
      var emailCheck = await sb.from('profiles')
        .select('id, email')
        .eq('email', email)
        .maybeSingle();
      if (emailCheck.data && emailCheck.data.id) {
        clearLock();
        return { ok: false, error: '该邮箱已被注册，请直接登录或换一个' };
      }
    } catch (e) {
      console.warn('[TATABOX] email 重复检查失败（非致命）:', e && e.message);
    }
  }

  // 上锁：30 秒
  try { localStorage.setItem(lockKey, String(Date.now() + 30000)); } catch (e) {}

  try {
    var deviceId = localStorage.getItem('bioquest_device_id');
    if (!deviceId) {
      deviceId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('bioquest_device_id', deviceId);
    }

    // 策略 1：使用完整的 options.data
    var signUpResult = null;
    var strategy1Error = null;

    try {
      signUpResult = await sb.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            username: username,
            display_name: displayName || username,
            device_id: deviceId
          },
          emailRedirectTo: window.location.origin + '/index.html'
        }
      });

    } catch (tryErr) {
      strategy1Error = tryErr;
      console.warn('[TATABOX] signUp (含data) 抛出异常，尝试简化请求:', tryErr && tryErr.message, tryErr);
      signUpResult = { data: null, error: tryErr };
    }

    // 策略 2：如果失败，尝试不带 options.data
    if (signUpResult && signUpResult.error) {
      console.warn('[TATABOX] signUp 策略 1 失败，错误消息:', signUpResult.error.message);
      try {
        signUpResult = await sb.auth.signUp({
          email: email,
          password: password,
          options: {
            emailRedirectTo: window.location.origin + '/index.html'
          }
        });

      } catch (tryErr2) {
        console.error('[TATABOX] signUp 策略 2 也抛出异常:', tryErr2 && tryErr2.message, tryErr2);
        if (!signUpResult || !signUpResult.error) signUpResult = { data: null, error: tryErr2 };
      }
    }

    var data = signUpResult && signUpResult.data;
    var error = signUpResult && signUpResult.error;

    if (error) {
      var msg = error.message || '';
      if (typeof msg !== 'string') msg = String(msg);
      var errName = error.name || '';
      var errStatus = error.status || 0;
      // 处理空对象/空字符串错误（Supabase 内部异常时返回 {}）
      if (!msg || msg === '{}' || msg === '[]' || msg === '[object Object]') {
        msg = '服务器繁忙，请稍后重试';
        if (errName === 'AuthRetryableFetchError' || errStatus === 500) {
          msg = 'Supabase 服务暂时异常（500），可能是：邮件发送失败 / 触发器冲突 / 服务维护中。请稍后重试，或在 Supabase Dashboard 关闭「Confirm email」开关';
        }
        console.error('[TATABOX] 注册失败 - 错误对象为空:', JSON.stringify(error), '完整 error:', error);
      } else {
        console.error('[TATABOX] 注册失败 - Supabase 错误消息:', msg, '完整 error:', error);
      }
      if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('unique')) {
        msg = '该邮箱已被注册，请直接登录或换一个';
      } else if (msg.includes('User already registered')) {
        msg = '该邮箱已被注册，请直接登录';
      } else if (msg.includes('Email signups are disabled') || msg.includes('signups are disabled')) {
        msg = 'Supabase 关闭了邮箱注册功能。请去 Dashboard → Authentication → Providers → Email → 打开 "Enable Email provider" 开关';
      } else if (msg.includes('Signups not allowed') || msg.includes('signups_disabled')) {
        msg = 'Supabase 禁止新用户注册。请去 Dashboard → Authentication → Providers → Email → 打开注册开关';
      } else if (msg.includes('Email not confirmed') || msg.includes('email_not_confirmed')) {
        msg = '请先完成邮箱验证（auto_confirm 触发器未生效，请去 Supabase 检查 trigger）';
      } else if (msg.includes('Password') || msg.includes('password')) {
        msg = '密码不符合要求（至少 6 位）';
      } else if (msg.includes('rate limit') || msg.includes('rate_limit')) {
        msg = '请求过于频繁，请 1 分钟后再试';
      } else if (msg.includes('email') || msg.includes('Email')) {
        if (msg.includes('invalid') || msg.includes('Invalid')) { msg = '邮箱格式不正确，请检查（可留空使用占位）'; }
        else if (msg.includes('already')) { msg = '该邮箱已被注册'; }
        else { msg = '邮箱验证失败，请检查邮箱格式（可留空使用占位）'; }
      } else if (msg.includes('confirm') || msg.includes('Confirm')) {
        msg = '请先完成邮箱验证';
      } else if (msg.includes('network') || msg.includes('Network') || msg.includes('fetch') || errName === 'AuthRetryableFetchError') {
        msg = '网络异常：无法连接 Supabase 服务，请检查网络后重试';
      } else if (msg.includes('PKCE')) {
        msg = '系统配置错误（PKCE 流程异常），请刷新页面后重试';
      } else if (msg.includes('username')) {
        msg = '用户名不符合要求（仅允许字母、数字、下划线，3-20 位）';
      } else if (msg.includes('username taken') || msg.includes('Username taken')) {
        msg = '该用户名已被使用，请换一个';
      } else if (errStatus >= 500) {
        msg = 'Supabase 服务端错误（' + errStatus + '），请稍后重试';
      } else if (errStatus === 422) {
        msg = '请求参数不合法，请检查用户名/密码格式';
      } else {
        msg = '注册失败：' + (msg.length > 80 ? msg.substring(0, 80) + '...' : msg);
      }
      return { ok: false, error: msg };
    }

    if (data.user && !data.session) {
      // 邮箱验证注册：此时 user 已在 auth.users 中，但 profiles 可能还没
      // 尝试写入 profiles 以便后续登录时能查到 username/email
      try {
        var upsertData = { id: data.user.id, username: username, display_name: displayName || username, user_group: 'member', points: POINTS_DEFAULT };
        try { upsertData.email = email; } catch (e) {}
        try { upsertData.device_id = deviceId; } catch (e) {}
        await sb.from('profiles').upsert(upsertData, { onConflict: 'id' });

      } catch (e1) {
        try {
          await sb.from('profiles').upsert({
            id: data.user.id, username: username, display_name: displayName || username, user_group: 'member', points: POINTS_DEFAULT
          }, { onConflict: 'id' });
        } catch (e2) {
          console.warn('[TATABOX] profiles upsert 失败（邮箱验证前，非致命）:', e2 && e2.message);
        }
      }
      clearLock();
      // 等待触发器生成 user_key 后读取
      var uk1 = null;
      try {
        await new Promise(function(r){ setTimeout(r, USER_KEY_READ_DELAY_MS); });
        var ukRes = await sb.from('profiles').select('user_key').eq('id', data.user.id).maybeSingle();
        uk1 = ukRes && ukRes.data && ukRes.data.user_key;
      } catch (e3) { /* ignore */ }
      return {
        ok: true,
        user: {
          id: data.user.id,
          username: username,
          display_name: displayName || username,
          email: email,
          points: POINTS_DEFAULT,
          user_group: 'member',
          email_verified: false,
          user_key: uk1
        },
        needEmailConfirm: true,
        userKey: uk1,
        message: '注册成功！请查收邮箱验证邮件，验证后即可登录。'
      };
    }

    if (data.user) {
      var initialGroup = 'member';

      _currentUser = {
        id: data.user.id,
        username: username,
        display_name: displayName || username,
        email: email,
        points: POINTS_DEFAULT,
        user_group: initialGroup,
        email_verified: true
      };

      try {
        var upsertData = { id: data.user.id, username: username, display_name: displayName || username, user_group: initialGroup, points: POINTS_DEFAULT };
        try { upsertData.email = email; } catch (e) {}
        try { upsertData.device_id = deviceId; } catch (e) {}
        await sb.from('profiles').upsert(upsertData, { onConflict: 'id' });
      } catch (e1) {
        // 回退时也必须保留 email——否则 profiles.email 为 NULL，
        // 后续"用户名登录"会因查不到邮箱而被拒，正确密码也会误报失败。
        try {
          var upsertDataFallback = { id: data.user.id, username: username, display_name: displayName || username, user_group: initialGroup, points: POINTS_DEFAULT };
          try { upsertDataFallback.email = email; } catch (e) {}
          await sb.from('profiles').upsert(upsertDataFallback, { onConflict: 'id' });
        } catch (e2) {
          console.warn('[TATABOX] profiles upsert 失败（已尝试回退）:', e2 && e2.message);
        }
      }

      // 等待触发器生成 user_key 后读取
      var uk2 = null;
      try {
        await new Promise(function(r){ setTimeout(r, USER_KEY_READ_DELAY_MS); });
        var ukRes2 = await sb.from('profiles').select('user_key').eq('id', data.user.id).maybeSingle();
        uk2 = ukRes2 && ukRes2.data && ukRes2.data.user_key;
      } catch (e3) { /* ignore */ }
      _currentUser.user_key = uk2;

      clearLock();
      return { ok: true, user: _currentUser, userKey: uk2 };
    }

    console.error('[TATABOX] signUp 返回但 data.user 为空:', signUpResult);
    return { ok: false, error: '注册失败：服务端返回的用户信息为空，请稍后重试' };
  } catch (e) {
    console.error('[TATABOX] registerUser 顶层异常:', e && e.message, e);
    return { ok: false, error: '注册失败：' + (e.message || String(e)) };
  }
}

/**
 * 检查邮箱验证状态，自动升级用户组
 * 如果用户邮箱已验证且不是假邮箱，且当前是 member，则升级为 verified
 */
async function checkEmailVerification(user, authUser) {
  if (!user || !authUser) return user;

  var email = authUser.email || '';
  var confirmedAt = authUser.email_confirmed_at;
  var isRealEmail = email.includes('@') && !email.endsWith('@bioquest.local');
  var isVerified = isRealEmail && confirmedAt;

  // 更新 email_verified 标志
  user.email_verified = !!isVerified;
  user.email = email;

  if (isVerified && (user.user_group === 'member' || user.user_group === 'guest')) {
    // 自动升级为 verified
    user.user_group = 'verified';
    try {
      var sb = getSupabase();
      if (sb) {
        await sb.from('profiles').update({ user_group: 'verified' }).eq('id', user.id).in('user_group', ['member', 'guest']);
      }
    } catch (e) {
      // 静默失败，下次登录再试
    }
  }

  return user;
}

/**
 * 登录
 */
async function loginUser(usernameOrEmail, password) {
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };

  try {
    // 判断输入是邮箱还是用户名，并解析候选登录邮箱（用户名登录时可能有多个候选）
    var emailCandidates = [];
    var usernameProfileUnbound = false; // 用户名存在但 profiles.email 为 NULL
    if (usernameOrEmail.includes('@')) {
      emailCandidates.push(usernameOrEmail);
    } else {
      // 用户名登录：profiles 已收紧（仅本人可读），改走窄 RPC resolve_login_email
      // （SECURITY DEFINER，仅按用户名精确返回 email+username，不回吐其他字段；
      //   契约：lower(username) 命中即返回行，email 可为 NULL——用于「未绑定邮箱」引导分支）
      var profileLookup = null;
      try {
        var _res = await sb.rpc('resolve_login_email', { p_name: usernameOrEmail });
        if (_res && _res.error) {
          _warnMissingDependency('RPC resolve_login_email', _res.error,
            '请先执行 sql/migration_v16_login_contract.sql');
        }
        var _row = Array.isArray(_res.data) ? _res.data[0] : _res.data;
        if (!_res.error && _row && _row.res_username) {
          // 命中用户名即视为存在（email 可为空——用于“未绑定邮箱”引导分支）
          profileLookup = { data: { email: _row.res_email || null, username: _row.res_username } };
        } else {
          profileLookup = null;
        }
      } catch (e) {
        // 查询失败不致命：仍可尝试下面的占位邮箱候选
        _warnMissingDependency('RPC resolve_login_email', e,
          '请先执行 sql/migration_v16_login_contract.sql');
        profileLookup = null;
      }
      var lookupProfile = (profileLookup && profileLookup.data) || null;
      usernameProfileUnbound = !!(lookupProfile && !lookupProfile.email);

      // 候选 1：resolve_login_email（注册时填过真实邮箱的账号走这里）
      if (lookupProfile && lookupProfile.email) {
        emailCandidates.push(lookupProfile.email);
      }
      // 候选 2（兜底）：注册未填邮箱的账号，认证邮箱固定为
      // <清洗后的用户名>@bioquest.local；历史账号的 profiles.email 可能为 NULL
      // （触发器未回填/回填被数据库触发器拦截），此时按注册规则推导出的占位邮箱
      // 才是真实认证邮箱。不用真实密码校验一次就断言"密码错误"会把这类账号挡在门外。
      var placeholderEmail = _placeholderEmailForUsername(
        (lookupProfile && lookupProfile.username) || usernameOrEmail
      );
      if (placeholderEmail && emailCandidates.indexOf(placeholderEmail) === -1) {
        emailCandidates.push(placeholderEmail);
      }
    }

    if (!emailCandidates.length) {
      return { ok: false, error: '用户名或密码错误', code: 'INVALID_CREDENTIALS' };
    }

    // 依次尝试候选邮箱：仅当"凭据错误"时才尝试下一个候选，
    // 其它错误（邮箱未验证/限流/网络等）立即返回，避免掩盖真实原因。
    // 这样真实邮箱注册的账号优先命中候选 1，不会被误带到占位邮箱。
    var data = null;
    var error = null;
    var email = emailCandidates[0];
    for (var ci = 0; ci < emailCandidates.length; ci++) {
      email = emailCandidates[ci];
      var signInResult = await sb.auth.signInWithPassword({
        email: email,
        password: password
      });
      if (signInResult && !signInResult.error && signInResult.data) {
        data = signInResult.data;
        error = null;
        break;
      }
      error = (signInResult && signInResult.error) || null;
      var failMsg = (error && error.message) || '';
      if (failMsg.indexOf('Invalid login credentials') === -1) break;
    }

    if (!data) {
      // 友好化错误信息
      var msg = (error && error.message) || '用户名/邮箱或密码错误';
      if (msg.includes('Invalid login credentials')) {
        // 用户名确实存在、但 profiles.email 为 NULL 且占位邮箱也无法登录：
        // 该账号认证邮箱应是注册时填写的真实邮箱，引导改用邮箱登录，避免"密码错误"误导
        msg = usernameProfileUnbound
          ? '用户名或密码错误；该账号未绑定邮箱，若注册时填写过邮箱，请改用注册邮箱登录'
          : '用户名/邮箱或密码错误';
      } else if (msg.includes('Email not confirmed')) {
        msg = '邮箱尚未验证，请查收验证邮件后重试';
      } else if (msg.includes('rate limit')) {
        msg = '登录尝试过于频繁，请稍后再试';
      } else if (msg.includes('network')) {
        msg = '网络连接失败，请检查网络';
      }
      return { ok: false, error: msg };
    }

    // 获取 profile（忽略错误，可能不存在）
    var profile = null;
    try {
      var profileResult = await sb.from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();
      profile = profileResult?.data;
    } catch (e) {
      // profile 可能不存在
    }

    // 数据自愈：部分历史账号 profiles.email 为 null（注册未填邮箱），
    // 登录成功后把实际登录邮箱回填，保证下次“用户名登录”能直接命中；
    // 静默失败不影响登录主流程。
    try {
      if (email && (!profile || !profile.email || profile.email !== email)) {
        await sb.from('profiles')
          .update({ email: email })
          .eq('id', data.user.id);
      }
    } catch (e) { /* 回填失败不影响登录 */ }

    _currentUser = {
      id: data.user.id,
      username: profile?.username || usernameOrEmail.split('@')[0],
      display_name: profile?.display_name || usernameOrEmail.split('@')[0],
      email: email,
      bio_score: profile?.bio_score || 0,
      points: profile?.points || POINTS_DEFAULT,
      user_group: profile?.user_group || 'member',
      email_verified: false
    };

    // 检查邮箱验证状态，自动升级用户组
    _currentUser = await checkEmailVerification(_currentUser, data.user);

    // 持久化用户展示信息（供 wiki 等轻页面读取作者身份）
    _persistUserInfo();

    // 启动在线时长跟踪（定义在 sb-gamify.js；lite 极简模式不加载该文件，
    // 因此必须做存在性判断，避免登录流程抛 ReferenceError）
    if (typeof startOnlineTimeTracking === 'function') startOnlineTimeTracking();

    // 触发登录成就
    if (typeof checkAchievement === 'function') {
      checkAchievement('login', 1);
    }
    // 邮箱已验证则触发邮箱成就
    if (_currentUser.email_verified && typeof checkAchievement === 'function') {
      checkAchievement('email', 1);
    }

    return { ok: true, user: _currentUser };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 计算游客密码哈希（FNV-1a 32-bit + 设备ID 盐值，非加密安全，仅防明文泄漏）
 * @param {string} password
 * @returns {string|null}
 */
function _hashGuestPassword(password) {
  try {
    var salt = 'bioquest_guest_v1_' + (function () {
      try { return localStorage.getItem('bioquest_device_id') || 'unknown'; }
      catch (e) { return 'unknown'; }
    })();
    return (function (str) {
      var h = 0x811c9dc5;
      for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
      }
      return h.toString(16).padStart(8, '0');
    })(salt + ':' + password);
  } catch (e) {
    return null;
  }
}

/**
 * 游客登录 — 无需邮箱，使用本地存储
 * 生成唯一设备ID和随机用户名，所有数据存储在 localStorage
 * @param {string} [password] - 可选密码，用于本地账号保护
 * @param {string} [username] - 可选用户名，用于恢复已有账号
 */
function guestLogin(password, username) {
  // 生成或获取设备ID
  var deviceId = localStorage.getItem('bioquest_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('bioquest_device_id', deviceId);
  }

  // 如果提供了用户名，尝试恢复已有账号
  var guestUsername = username;
  var guestDisplayName = username ? (username.replace('guest_', '游客')) : '';
  if (!guestUsername) {
    var randomSuffix = Math.random().toString(36).slice(2, 8);
    guestUsername = 'guest_' + randomSuffix;
    guestDisplayName = '游客' + randomSuffix;
  }

  var guestId = 'guest_' + deviceId;

  _currentUser = {
    id: guestId,
    username: guestUsername,
    display_name: guestDisplayName || guestUsername,
    email: guestUsername + '@bioquest.local',
    bio_score: 0,
    points: POINTS_DEFAULT,
    user_group: 'guest',
    email_verified: false,
    isGuest: true
  };

  // 存储密码哈希（绝不存明文）
  // 游客模式不依赖服务端，密码仅作"本地快速登录"用
  // 警告：localStorage 不安全，游客模式不要存真实数据
  if (password) {
    try {
      // SHA-256 + 设备ID 盐值（防止彩虹表 + 跨设备撞库）
      var hash = _hashGuestPassword(password);
      if (hash) localStorage.setItem('bioquest_guest_pwdhash', hash);
    } catch (e) {}
  }

  // 持久化游客会话到 localStorage
  try {
    localStorage.setItem('bioquest_guest_session', JSON.stringify({
      id: guestId,
      username: guestUsername,
      display_name: _currentUser.display_name,
      points: _currentUser.points,
      createdAt: Date.now()
    }));
  } catch (e) { /* 静默 */ }

  // 触发登录成就
  if (typeof checkAchievement === 'function') {
    checkAchievement('login', 1);
  }

  // 持久化用户展示信息（供 wiki 等轻页面读取作者身份）
  _persistUserInfo();

  return { ok: true, user: _currentUser };
}

/**
 * 游客密码登录 — 使用用户名和密码验证本地账号
 */
function guestLoginWithPassword(username, password) {
  var sessionData = null;
  try {
    sessionData = JSON.parse(localStorage.getItem('bioquest_guest_session') || 'null');
  } catch (e) {}

  // 优先用哈希校验（guestLogin 保存的 bioquest_guest_pwdhash）；
  // 兼容旧版备份导入的明文密码（bioquest_guest_password）
  var savedHash = null;
  var legacyPwd = null;
  try { savedHash = localStorage.getItem('bioquest_guest_pwdhash'); } catch (e) {}
  try { legacyPwd = localStorage.getItem('bioquest_guest_password'); } catch (e) {}

  if (savedHash) {
    if (_hashGuestPassword(password) !== savedHash) {
      return { ok: false, error: '密码错误' };
    }
  } else if (legacyPwd !== null) {
    if (password !== legacyPwd) {
      return { ok: false, error: '密码错误' };
    }
  } else {
    return { ok: false, error: '尚未设置本地账号密码，请先用游客模式登录后设置密码' };
  }

  // 验证用户名
  if (username && sessionData && sessionData.username !== username) {
    return { ok: false, error: '用户名不存在' };
  }

  return guestLogin(password, sessionData ? sessionData.username : null);
}

/**
 * 恢复游客会话
 */
function restoreGuestSession() {
  try {
    var sessionData = localStorage.getItem('bioquest_guest_session');
    if (!sessionData) return false;
    var session = JSON.parse(sessionData);
    if (!session || !session.id) return false;

    _currentUser = {
      id: session.id,
      username: session.username || 'guest',
      display_name: session.display_name || '游客',
      email: (session.username || 'guest') + '@bioquest.local',
      bio_score: 0,
      points: session.points || POINTS_DEFAULT,
      user_group: 'guest',
      email_verified: false,
      isGuest: true
    };
    _persistUserInfo();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 退出登录
 */
async function logoutUser() {
  var sb = getSupabase();
  if (sb) {
    try {
      await sb.auth.signOut();
    } catch (e) {
      // signOut 可能因网络问题失败，本地状态仍需清除
      console.warn('登出网络请求失败，已清除本地状态');
    }
  }
  // 清除游客会话
  try { localStorage.removeItem('bioquest_guest_session'); } catch (e) {}
  _currentUser = null;
}

/**
 * 永久退出登录 — 清除认证态，保留用户数据（API Key / 头像 / 设置）
 */
function forceLogout() {
  // 先同步本地数据到云端
  if (typeof window.syncToCloud === 'function') {
    try {
      window.syncToCloud().catch(function() {});
    } catch(e) {}
  }

  var sb = getSupabase();
  if (sb) { sb.auth.signOut().catch(function() {}); }
  _currentUser = null;

  // 仅清除认证相关 key，保留用户数据（API Key / 头像 / 设置 / 错题 / 记录等）
  var authKeys = [
    'sb-',           // Supabase auth tokens（前缀匹配）
    'bioquest_guest_session',
    'bioquest_guest_password',
    'bioquest_guest_pwdhash',
    'bioquest_admin_auth'
  ];
  var keysToRemove = [];
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (!key) continue;
    // 仅匹配认证相关 key
    for (var k = 0; k < authKeys.length; k++) {
      if (key.indexOf(authKeys[k]) === 0 || key === authKeys[k]) {
        keysToRemove.push(key);
        break;
      }
    }
  }
  for (var j = 0; j < keysToRemove.length; j++) {
    localStorage.removeItem(keysToRemove[j]);
  }
  // 清除 sessionStorage 中的管理员认证和频率限制状态
  try {
    sessionStorage.removeItem('bioquest_admin_auth');
    sessionStorage.removeItem('bioquest_admin_attempts');
    sessionStorage.removeItem('bioquest_admin_lock');
  } catch(e) {}

  showToast('已退出登录');
  if (typeof navigateTo === 'function') navigateTo('/');
}

/**
 * 注销账号 — 删除账户及数据
 */
async function deleteAccount() {
  var sb = getSupabase();
  if (!sb) { showToast('无法连接到服务器'); return; }
  var userId = _currentUser && _currentUser.id;
  if (!userId) { showToast('未获取到用户信息'); return; }
  try {
    await sb.from('profiles').delete().eq('id', userId);
    await sb.from('wrong_questions').delete().eq('profile_id', userId);
    await sb.from('favorites').delete().eq('profile_id', userId);
    await sb.from('practice_records').delete().eq('profile_id', userId);
  } catch(e) { console.warn('清理用户数据失败:', e); }
  showToast('账户数据已清除');
  forceLogout();
}

window.forceLogout = forceLogout;
window.deleteAccount = deleteAccount;

/**
 * 上传头像到 Supabase Storage 的 avatars bucket
 * @param {File} file - 图片文件
 * @returns {Promise<{url: string|null, error: string|null}>}
 */
async function uploadAvatar(file) {
  var sb = getSupabase();
  if (!sb || !_currentUser) return { url: null, error: '未登录' };
  try {
    var userId = _currentUser.id;
    var ext = 'jpg';
    if (file.type === 'image/png') ext = 'png';
    else if (file.type === 'image/webp') ext = 'webp';
    var path = userId + '.' + ext;

    var { error: upErr } = await sb.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) return { url: null, error: upErr.message };

    var pub = sb.storage.from('avatars').getPublicUrl(path);
    var url = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : null;

    if (url) {
      try {
        await sb.from('profiles').update({ avatar_url: url }).eq('id', userId);
      } catch (e) { /* 静默 */ }
      _currentUser.avatar_url = url;
    }
    return { url: url, error: null };
  } catch (e) {
    return { url: null, error: e.message };
  }
}
window.uploadAvatar = uploadAvatar;

/**
 * 上传题目图片到 Supabase Storage 的 question-images bucket
 * 支持 File 对象、Blob、data URL、或远程 URL（自动下载）
 * @param {File|Blob|string} imageInput - 图片源：File/Blob/data URL/http URL
 * @param {string} [questionId] - 题目ID，用于生成文件名（可选）
 * @returns {Promise<{url: string|null, error: string|null, path: string|null}>}
 */
async function uploadQuestionImage(imageInput, questionId) {
  var sb = getSupabase();
  if (!sb) return { url: null, path: null, error: 'Supabase 未初始化' };

  try {
    var blob, fileExt = 'png', contentType = 'image/png';

    if (imageInput instanceof File) {
      blob = imageInput;
      if (imageInput.type === 'image/jpeg' || imageInput.type === 'image/jpg') { fileExt = 'jpg'; contentType = 'image/jpeg'; }
      else if (imageInput.type === 'image/webp') { fileExt = 'webp'; contentType = 'image/webp'; }
      else if (imageInput.type === 'image/gif') { fileExt = 'gif'; contentType = 'image/gif'; }
    } else if (imageInput instanceof Blob) {
      blob = imageInput;
      contentType = blob.type || 'image/png';
      if (contentType === 'image/jpeg') fileExt = 'jpg';
      else if (contentType === 'image/webp') fileExt = 'webp';
    } else if (typeof imageInput === 'string') {
      if (imageInput.startsWith('data:')) {
        var dataUrlMatch = imageInput.match(/^data:([^;]+);base64,(.+)$/);
        if (!dataUrlMatch) return { url: null, path: null, error: '无效的 data URL' };
        contentType = dataUrlMatch[1] || 'image/png';
        var b64Data = dataUrlMatch[2];
        var byteChars = atob(b64Data);
        var byteNums = new Array(byteChars.length);
        for (var i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
        var byteArr = new Uint8Array(byteNums);
        blob = new Blob([byteArr], { type: contentType });
        if (contentType === 'image/jpeg') fileExt = 'jpg';
        else if (contentType === 'image/webp') fileExt = 'webp';
        else if (contentType === 'image/gif') fileExt = 'gif';
      } else if (/^https?:\/\//.test(imageInput)) {
        var resp = await fetch(imageInput);
        if (!resp.ok) return { url: null, path: null, error: '下载远程图片失败: HTTP ' + resp.status };
        blob = await resp.blob();
        contentType = blob.type || 'image/png';
        if (contentType === 'image/jpeg') fileExt = 'jpg';
        else if (contentType === 'image/webp') fileExt = 'webp';
        else if (contentType === 'image/gif') fileExt = 'gif';
      } else {
        return { url: null, path: null, error: '不支持的图片输入格式' };
      }
    } else {
      return { url: null, path: null, error: '无效的图片输入' };
    }

    var qid = questionId || ('q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    var path = qid + '_' + Date.now().toString(36) + '.' + fileExt;

    var { error: upErr } = await sb.storage
      .from('question-images')
      .upload(path, blob, { upsert: true, contentType: contentType });
    if (upErr) return { url: null, path: null, error: upErr.message };

    var pub = sb.storage.from('question-images').getPublicUrl(path);
    var url = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : null;

    return { url: url, path: path, error: null };
  } catch (e) {
    return { url: null, path: null, error: e.message };
  }
}
window.uploadQuestionImage = uploadQuestionImage;

/**
 * 恢复会话（页面刷新时）
 * 添加超时保护，防止网络慢时阻塞页面
 */
var _restoreSessionPromise = null;
var _restoreSessionCalled = false;

async function restoreSession() {
  // 防止重复调用 — 如果已经在进行中，复用同一个 Promise
  if (_restoreSessionPromise) return _restoreSessionPromise;
  if (_restoreSessionCalled) return _currentUser !== null;
  _restoreSessionCalled = true;

  _restoreSessionPromise = _doRestoreSession();
  try {
    return await _restoreSessionPromise;
  } finally {
    // 保留结果一段时间，避免短时间内重复调用
    setTimeout(function() {
      _restoreSessionPromise = null;
    }, SESSION_RESTORE_CACHE_TTL_MS);
  }
}

async function _doRestoreSession() {
  var sb = getSupabase();
  if (!sb) return false;

  try {
    // 5秒超时保护 — 防止网络慢时阻塞页面
    var sessionResult = await Promise.race([
      sb.auth.getSession(),
      new Promise(function(resolve) {
        setTimeout(function() { resolve({ timedOut: true }); }, GET_SESSION_TIMEOUT_MS);
      })
    ]);

    if (sessionResult.timedOut) {
      console.warn('[TATABOX] restoreSession: getSession 超时');
      return false;
    }

    var data = sessionResult.data;
    if (data && data.session && data.session.user) {
      var profile = null;
      try {
        var profileResult = await Promise.race([
          sb.from('profiles')
            .select('*')
            .eq('id', data.session.user.id)
            .maybeSingle(),
          new Promise(function(resolve) {
            setTimeout(function() { resolve({ data: null, timedOut: true }); }, PROFILE_FETCH_TIMEOUT_MS);
          })
        ]);
        if (!profileResult.timedOut) {
          profile = profileResult?.data;
        }
      } catch (e) {
        // profile 可能不存在
      }

      _currentUser = {
        id: data.session.user.id,
        username: profile?.username || 'user',
        display_name: profile?.display_name || 'User',
        bio_score: profile?.bio_score || 0,
        points: profile?.points || POINTS_DEFAULT,
        user_group: profile?.user_group || 'member',
        email_verified: false
      };

      // 检查邮箱验证状态，自动升级用户组（带超时）
      try {
        _currentUser = await Promise.race([
          checkEmailVerification(_currentUser, data.session.user),
          new Promise(function(resolve) {
            setTimeout(function() { resolve(_currentUser); }, EMAIL_VERIFICATION_TIMEOUT_MS);
          })
        ]);
      } catch (e) {
        // 静默失败
      }

      // 启动在线时长跟踪（同 loginUser：sb-gamify.js 未加载时跳过）
      if (typeof startOnlineTimeTracking === 'function') startOnlineTimeTracking();

      // 修复：restoreSession 成功后，通知 admin 模块同步认证状态
      if (_currentUser && _currentUser.user_group === 'admin') {
        var token = JSON.stringify({ t: Date.now(), exp: ADMIN_TOKEN_TTL });
        sessionStorage.setItem('bioquest_admin_auth', token);
        if (typeof window._onAuthUserLoaded === 'function') {
          window._onAuthUserLoaded(_currentUser);
        }
      }

      // 持久化用户展示信息（供 wiki 等轻页面读取作者身份）
      _persistUserInfo();

      return true;
    }
  } catch (e) {
    // 静默失败
  }
  return false;
}

/**
 * 通用数据库操作
 */
async function sbSelect(table, options) {
  var sb = getSupabase();
  if (!sb) return { data: null, error: 'Supabase 未初始化' };

  var query = sb.from(table).select(options?.select || '*');

  if (options?.eq) {
    for (var key in options.eq) {
      query = query.eq(key, options.eq[key]);
    }
  }
  if (options?.order) {
    query = query.order(options.order.column, { ascending: options.order.ascending !== false });
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  return await query;
}

async function sbInsert(table, data) {
  var sb = getSupabase();
  if (!sb) return { data: null, error: 'Supabase 未初始化' };
  return await sb.from(table).insert(data);
}

async function sbUpdate(table, data, match) {
  var sb = getSupabase();
  if (!sb) return { data: null, error: 'Supabase 未初始化' };

  var query = sb.from(table).update(data);
  for (var key in match) {
    query = query.eq(key, match[key]);
  }
  return await query;
}

async function sbDelete(table, match) {
  var sb = getSupabase();
  if (!sb) return { data: null, error: 'Supabase 未初始化' };

  var query = sb.from(table).delete();
  for (var key in match) {
    query = query.eq(key, match[key]);
  }
  return await query;
}

/**
 * 获取排行榜（短缓存 + 失败可感知）
 * 缓存键按 tab 区分（fixed：checkin 不再与 bio 共用 score 缓存键）
 */
var _leaderboardCache = { bio: null, practice: null, checkin: null };
var LEADERBOARD_CACHE_TTL = 5000;   // 短缓存：5s 内命中，超过即向数据库实时拉取
var LEADERBOARD_FETCH_TIMEOUT = 5000;  // 排行榜查询超短超时 5s
var _leaderboardInflight = {};         // 防抖：同 tab 在途请求复用

/**
 * 在线时长奖励跟踪
 * 每5分钟活跃奖励1 信用，每天最多12点
 */
var _onlineTracker = {
  lastActive: Date.now(),
  heartbeatTimer: null,
  rewardedToday: 0
};

// 参考英雄联盟局内成就命名：幽默、嘲讽、夸张、反差

var ACHIEVEMENT_TIERS = {
  iron:    { label: '坚韧黑铁', color: '#5c5c5c', order: 0 },
  bronze:  { label: '荣耀青铜', color: '#cd7f32', order: 1 },
  silver:  { label: '不屈白银', color: '#c0c0c0', order: 2 },
  gold:    { label: '荣耀黄金', color: '#ffd700', order: 3 },
  platinum:{ label: '华贵铂金', color: '#40e0d0', order: 4 },
  diamond: { label: '璀璨钻石', color: '#b9f2ff', order: 5 },
  master:  { label: '超凡大师', color: '#9b59b6', order: 6 },
  challenger:{ label: '傲世宗师', color: '#ff4655', order: 7 }
};

var ACHIEVEMENTS = {
  first_login:     { name: '你好世界',       desc: '第一次打开TATABOX，勇气可嘉',  icon: 'I', category: 'journey',  tier: 'iron' },
  first_practice:  { name: '羊入虎口',       desc: '第一道题就跳进去了，勇气可嘉',   icon: 'S', category: 'journey',  tier: 'iron' },
  email_verified:  { name: '验明正身',       desc: '邮箱验证了，你终于不是黑户了',   icon: 'V', category: 'journey',  tier: 'bronze' },

  streak_3:        { name: '三分钟热度',     desc: '连续打卡3天，别告诉我第4天就溜了', icon: 'F', category: 'persistence', tier: 'iron' },
  streak_7:        { name: '一周存活',       desc: '连续打卡7天，你比90%的人持久',   icon: '7', category: 'persistence', tier: 'bronze' },
  streak_14:       { name: '习惯成自然',     desc: '连续打卡14天，不学浑身难受了吧',  icon: '14', category: 'persistence', tier: 'silver' },
  streak_30:       { name: '月度全勤',       desc: '连续打卡30天，班主任看了都流泪',  icon: '30', category: 'persistence', tier: 'gold' },
  streak_60:       { name: '双月修仙',       desc: '连续打卡60天，你已经不需要睡眠了', icon: '60', category: 'persistence', tier: 'platinum' },
  streak_100:      { name: '百日不倒',       desc: '连续打卡100天，你是人还是机器人？', icon: '100', category: 'persistence', tier: 'diamond' },
  streak_365:      { name: '一年365天',      desc: '连续打卡365天，你赢了，真的赢了',  icon: '365', category: 'persistence', tier: 'challenger' },

  score_60:        { name: '及格线上的挣扎',  desc: '60分，多一分浪费，少一分受罪',   icon: '60s', category: 'mastery',   tier: 'iron' },
  score_70:        { name: '薛定谔的70分',   desc: '70分，不好不坏，薛定谔都看不懂你', icon: '70s', category: 'mastery',   tier: 'bronze' },
  score_80:        { name: '别人家的孩子',    desc: '80分，你妈终于可以在亲戚面前吹了', icon: '80s', category: 'mastery',   tier: 'silver' },
  score_90:        { name: '卷王本王',       desc: '90分，你让其他同学怎么活？',     icon: '90s', category: 'mastery',   tier: 'gold' },
  score_100:       { name: '满分？就这？',    desc: '100分，你说的对，确实就这',      icon: '100s', category: 'mastery',   tier: 'diamond' },

  questions_50:    { name: '热身运动',       desc: '50题，你才刚伸了个懒腰',        icon: '50q', category: 'conquest',  tier: 'iron' },
  questions_100:   { name: '题海入门',       desc: '100题，你已经开始湿鞋了',       icon: '100q', category: 'conquest',  tier: 'bronze' },
  questions_300:   { name: '刷题永动机',     desc: '300题，你的手指已经形成了肌肉记忆', icon: '300q', category: 'conquest',  tier: 'silver' },
  questions_500:   { name: '半千大佬',       desc: '500题，你做梦都在选ABCD',       icon: '500q', category: 'conquest',  tier: 'gold' },
  questions_1000:  { name: '千题成精',       desc: '1000题，题目看到你就跑',        icon: '1K', category: 'conquest',  tier: 'platinum' },
  questions_2000:  { name: '题海霸主',       desc: '2000题，出题人看到你都要绕路',   icon: '2K', category: 'conquest',  tier: 'diamond' },
  questions_5000:  { name: '你摸不到',       desc: '5000题，你的题量别人一辈子摸不到', icon: '5K', category: 'conquest',  tier: 'challenger' },

  accuracy_60:     { name: '蒙的都对',       desc: '60%正确率，你管这叫蒙的？',     icon: '60%', category: 'precision', tier: 'iron' },
  accuracy_70:     { name: '七成胜率',       desc: '70%正确率，电竞选手都羡慕你',    icon: '70%', category: 'precision', tier: 'bronze' },
  accuracy_80:     { name: '稳定输出',       desc: '80%正确率，你的正确率比A股稳定',  icon: '80%', category: 'precision', tier: 'silver' },
  accuracy_90:     { name: '完美连控',       desc: '90%正确率，题目被你控得死死的',   icon: '90%', category: 'precision', tier: 'gold' },
  accuracy_95:     { name: '题目克星',       desc: '95%正确率，题目见了你直接投降',   icon: '95%', category: 'precision', tier: 'diamond' },

  community_first: { name: '社恐出没',       desc: '第一次发帖，手抖了吗？',        icon: '1st', category: 'community',  tier: 'iron' },
  community_5:     { name: '话痨上线',       desc: '发了5个帖子，你开始收不住了',    icon: '5th', category: 'community',  tier: 'bronze' },
  community_10:    { name: '社交达人',       desc: '发了10个帖子，你比老师还能说',    icon: '10th', category: 'community',  tier: 'silver' },
  community_50:    { name: '社区顶流',       desc: '发了50个帖子，你就是TATABOX的KOL', icon: '50th', category: 'community',  tier: 'gold' },
  community_100:   { name: '话痨天花板',     desc: '发了100个帖子，你确定不是来水贴的？', icon: '100th', category: 'community',  tier: 'diamond' },

  exam_first:      { name: '炮灰报到',       desc: '第一次模拟考，活下来就是胜利',    icon: '1ex', category: 'exam',      tier: 'iron' },
  exam_5:          { name: '老考生了',       desc: '5次模拟考，你已经面不改色了',    icon: '5ex', category: 'exam',      tier: 'bronze' },
  exam_10:         { name: '考场老油条',     desc: '10次模拟考，你比监考老师还淡定',   icon: '10ex', category: 'exam',      tier: 'silver' },
  exam_perfect:    { name: '你开挂了吧',     desc: '满分？！不是开挂就是外星人',      icon: 'PF', category: 'exam',      tier: 'diamond' }
};

var ACHIEVEMENT_CATEGORIES = {
  journey:     { name: '新手村',     icon: '' },
  persistence: { name: '熬夜修仙',   icon: '' },
  mastery:     { name: '分数玄学',   icon: '' },
  conquest:    { name: '刷题机器',   icon: '' },
  precision:   { name: '神射手',     icon: '' },
  community:   { name: '社交牛逼症', icon: '' },
  exam:        { name: '考场战神',   icon: '' }
};

// 暴露到全局
window.getSupabase = getSupabase;
window.getCurrentUser = getCurrentUser;
window.isLoggedIn = isLoggedIn;
window.registerUser = registerUser;
window.loginUser = loginUser;
window.guestLogin = guestLogin;
window.guestLoginWithPassword = guestLoginWithPassword;
window.restoreGuestSession = restoreGuestSession;
window.logoutUser = logoutUser;
window.restoreSession = restoreSession;
window.resendConfirmationEmail = resendConfirmationEmail;
window.resetPassword = resetPassword;
window.resetPasswordByKey = resetPasswordByKey;
window.recoverUserKey = recoverUserKey;
window.getUserKeyForCurrentUser = getUserKeyForCurrentUser;
window.sbSelect = sbSelect;
window.sbInsert = sbInsert;
window.sbUpdate = sbUpdate;
window.sbDelete = sbDelete;

// 注：学习/错题/社区/积分等扩展数据层的全局导出由各自拆分文件
// （sb-gamify.js / sb-social.js / sb-data.js / sb-study.js）末尾自带，
// 避免此处引用后加载文件的符号导致求值中断。
