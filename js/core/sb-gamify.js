

// 信用点（CR）不是经验值、不是货币，而是社区对用户信任程度的量化。
// 通过符合社区期望的行为获得信任，消费信任以做出对社区影响更大的行为；
// 信任具有时效性（自然衰减），违规则直接扣减。

var POINTS_DEFAULT = 100;


// 1. 信任自然衰减参数
// 信用指数随时间指数衰减：CR_decayed = CR * exp(-lambda * deltaDays)
// lambda = 0.01005 对应每日衰减约 1%，半衰期约 69 天
var CR_DECAY = {
  lambda: 0.01005,
  halfLifeDays: 69
};


// 2. 符合社区期望的行为 → 获得信任增量
var POINTS_EARN_RULES = {
  daily_checkin: { base: 0.3, reason: '每日打卡' },
  online_time: { base: 0.1, reason: '在线时长奖励' },
  practice_milestone: { base: 0.1, reason: '刷题奖励（每10题）' },
  suggestion_feedback: { base: 2, reason: '提交建议反馈' },
  valid_report: { base: 1, reason: '有效举报/反馈' }
};


// 3. 消费信任（高影响操作）规则（需同时满足门槛）
var POINTS_ACTION_COSTS = {
  comment: { threshold: 20, cost: 1, reason: '发表评论' },
  post: { threshold: 30, cost: 2, reason: '发布帖子' },
  report_question: { threshold: 50, cost: 2, reason: '举报题目' },
  special_permission: { threshold: 80, cost: 10, reason: '申请特殊权限' }
};


// 4. 违规惩罚规则（直接扣减，永久）
var POINTS_PENALTIES = {
  question_feedback_invalid: { amount: -5, reason: '无效题目反馈/举报' },
  uncivil_post: { amount: -15, reason: '发布不文明内容' },
  uncivil_comment: { amount: -10, reason: '评论不文明内容' },
  spam: { amount: -20, reason: '刷屏/垃圾内容' }
};


// 5. 信任等级（由当前信用指数推导；指数越高，社区信任越高）
var POINTS_LEVELS = [
  { min: 0,   label: '不受信任', title: '不受信任', color: '#c0553a' },
  { min: 10,  label: '极低信任', title: '极低信任', color: '#d47030' },
  { min: 30,  label: '有限信任', title: '有限信任', color: '#c49b30' },
  { min: 50,  label: '基本信任', title: '基本信任', color: '#5a7d5c' },
  { min: 80,  label: '高度信任', title: '高度信任', color: '#3a8c5c' },
  { min: 100, label: '极高信任', title: '极高信任', color: '#ffd700' }
];


var _UNCIVIL_WORDS = ['傻逼','脑残','nmsl','你妈','草泥马','滚','去死','废物','垃圾','贱','sb','cnm','tmd','mdzz','智障','混蛋','狗屎','屎','烂','白痴','蠢货','婊子','娘炮','死全家','杀了你','操','肏','日你妈','麻痹','特么','马勒戈壁','法克','fuck','shit','bitch'];

var BEHAVIOR_COUNT_TIMEOUT_MS = 5000;          // 行为计数查询超时

var ONLINE_TIME_DAILY_CAP = 12;                // 在线时长每日奖励上限次数

var ONLINE_TIME_INACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 在线判定空闲阈值（5 分钟）

var ONLINE_TIME_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 在线时长心跳间隔（5 分钟）

var ACHIEVE_NOTIF_DISPLAY_MS = 4000;           // 成就通知展示时长

var ACHIEVE_NOTIF_FADE_MS = 500;               // 成就通知淡出动画时长


/**
 * 更新用户分数
 */
async function updateBioScore(bioScore, stats) {
  var sb = getSupabase();
  if (!sb || !_currentUser) return;
  try {
    // 直接更新字段，不使用 rpc
    var updates = {
      bio_score: bioScore,
      practice_count: stats.practice_count || 0,
      total_answered: stats.total_answered || 0,
      total_correct: stats.total_correct || 0,
      accuracy: stats.accuracy || 0,
      updated_at: new Date().toISOString()
    };
    await sb.from('profiles').upsert({ id: _currentUser.id, ...updates, device_id: localStorage.getItem('bioquest_device_id') || 'unknown' }, { onConflict: 'id' });
    // 分数已变化：失效排行榜缓存，保证下次查询立即拿到最新值（实时更新）
    invalidateLeaderboardCache();

    // 刷题奖励：每答满10题获得信用
    try {
      var answered = stats.total_answered || 0;
      var milestone = Math.floor(answered / 10);
      var lastMilestone = 0;
      try { lastMilestone = parseInt(localStorage.getItem('bioquest_points_practice_milestone') || '0', 10); } catch (e) {}
      if (milestone > lastMilestone) {
        var rewardSteps = milestone - lastMilestone;
        for (var i = 0; i < rewardSteps; i++) {
          var delta = await calculateEarnedPoints('practice_milestone');
          if (delta > 0) {
            await adjustUserPoints(delta, POINTS_EARN_RULES.practice_milestone.reason, { source: 'practice' });
          }
        }
        localStorage.setItem('bioquest_points_practice_milestone', String(milestone));
      }
    } catch (e) { /* 静默 */ }
  } catch (e) {
    // 静默失败
  }
}


async function getLeaderboard(tab, limit) {
  var cacheKey = tab === 'practice' ? 'practice' : (tab === 'checkin' ? 'checkin' : 'bio');
  var now = Date.now();
  if (_leaderboardCache[cacheKey] && (now - _leaderboardCache[cacheKey + '_ts']) < LEADERBOARD_CACHE_TTL) {
    return _leaderboardCache[cacheKey];
  }
  // 防抖：复用同 tab 在途请求，避免 SDK 并发 cancel → ERR_ABORTED
  if (_leaderboardInflight[cacheKey]) return _leaderboardInflight[cacheKey];

  var sb = getSupabase();
  if (!sb) {
    console.warn('[leaderboard] Supabase 客户端未初始化');
    return [];
  }

  // AbortController + 5s 短超时：超时/abort/网络波动 全部静默返回 []，不把红色 error 打到用户控制台
  var timer = null;
  var ctrl = null;
  if (typeof AbortController !== 'undefined') {
    ctrl = new AbortController();
    timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, LEADERBOARD_FETCH_TIMEOUT);
  }

  var onFinished = function () {
    if (timer) { clearTimeout(timer); timer = null; }
    delete _leaderboardInflight[cacheKey];
  };

  var inflightPromise = (async function () {
    try {
      var orderCol = tab === 'practice' ? 'total_answered' : (tab === 'checkin' ? 'current_streak' : 'bio_score');
      // 直接走 REST API（更稳定，不会互相 abort），带 AbortSignal 短超时
      var restParams = 'select=id,username,display_name,bio_score,practice_count,total_answered,total_correct,accuracy,current_streak' +
        '&order=' + orderCol + '.desc.nullslast' +
        '&' + orderCol + '=gt.0' +
        '&limit=' + (limit || 20);
      var fetchOpts = {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Accept': 'application/json'
        }
      };
      if (ctrl && typeof ctrl.signal !== 'undefined') fetchOpts.signal = ctrl.signal;
      var restRes = await fetch(SUPABASE_URL + '/rest/v1/profiles?' + restParams, fetchOpts);
      var data = restRes.ok ? (await restRes.json()) : null;
      // 过滤孤儿行（无 username 的注册残留），避免榜上出现一堆"匿名用户"
      if (restRes.ok && Array.isArray(data)) {
        data = data.filter(function (p) { return p && p.username; });
      }
      if (!data || data.length === 0) return [];

      var result = data.map(function(p, i) {
        var score = p.bio_score || 0;
        var grade = 'F';
        if (score >= 90) grade = 'S';
        else if (score >= 80) grade = 'A';
        else if (score >= 70) grade = 'B';
        else if (score >= 60) grade = 'C';
        else if (score >= 40) grade = 'D';
        return {
          rank: i + 1,
          id: p.id,
          username: p.username || 'user',
          display_name: p.display_name || 'User',
          bio_score: score,
          practice_count: p.practice_count || 0,
          total_answered: p.total_answered || 0,
          total_correct: p.total_correct || 0,
          accuracy: p.accuracy || 0,
          current_streak: p.current_streak || 0,
          grade: grade
        };
      });

      // 当前用户的排名（尽量查，查不到不影响）
      var myRank = null;
      if (_currentUser && _currentUser.id) {
        try {
          var myQ = 'select=' + orderCol + '&id=eq.' + encodeURIComponent(_currentUser.id);
          var myRes = await fetch(SUPABASE_URL + '/rest/v1/profiles?' + myQ, {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
              'Accept': 'application/json'
            },
            signal: (ctrl && ctrl.signal) || undefined
          });
          if (myRes.ok) {
            var myData = await myRes.json();
            if (myData && myData[0]) {
              var myValue = (tab === 'checkin') ? (myData[0].current_streak || 0) :
                ((tab === 'practice') ? (myData[0].total_answered || 0) : (myData[0].bio_score || 0));
              // 先用返回榜里找
              for (var ri = 0; ri < result.length; ri++) {
                if (result[ri].id === _currentUser.id) { myRank = result[ri].rank; break; }
              }
              if (myRank === null) {
                try {
                  var cntQ = 'select=id&' + orderCol + '=gt.' + myValue;
                  var cntRes = await fetch(SUPABASE_URL + '/rest/v1/profiles?' + cntQ, {
                    method: 'GET',
                    headers: {
                      'apikey': SUPABASE_ANON_KEY,
                      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                      'Accept': 'application/json'
                    },
                    signal: (ctrl && ctrl.signal) || undefined
                  });
                  if (cntRes.ok) {
                    var rows = await cntRes.json();
                    myRank = (rows ? rows.length : 0) + 1;
                  }
                } catch (_) { /* 排名查询失败静默跳过 */ }
              }
            }
          }
        } catch (_) { /* 查当前用户失败静默 */ }
      }

      result._myRank = myRank;
      _leaderboardCache[cacheKey] = result;
      _leaderboardCache[cacheKey + '_ts'] = Date.now();
      return result;
    } catch (err) {
      // 失败不静默：让 UI 能区分"暂无数据"与"查询失败"（倒排到前端提示）
      console.warn('[leaderboard] 查询失败, tab=' + tab + ':', err && err.message ? err.message : err);
      var errArr = [];
      errArr._error = (err && err.message) || '排行榜请求超时或网络异常';
      return errArr;
    }
  })();

  inflightPromise.then(onFinished, onFinished);
  _leaderboardInflight[cacheKey] = inflightPromise;
  return inflightPromise;
}


/**
 * 失效排行榜缓存（分数更新、手动刷新时调用；下次查询必拉最新数据）
 */
function invalidateLeaderboardCache() {
  _leaderboardCache = { bio: null, practice: null, checkin: null };
}



/**
 * 获取信用等级信息（由当前信用指数阈值推导）
 */
function getPointsLevel(points) {
  var score = typeof points === 'number' ? points : POINTS_DEFAULT;
  var current = POINTS_LEVELS[0];
  var next = null;
  for (var i = 0; i < POINTS_LEVELS.length; i++) {
    var lv = POINTS_LEVELS[i];
    if (score >= lv.min) { current = lv; next = POINTS_LEVELS[i + 1] || null; }
  }
  var curMin = current.min;
  var nxtMin = next ? next.min : curMin;
  var span = Math.max(1, nxtMin - curMin);
  var progress = next ? Math.min(1, Math.max(0, (score - curMin) / span)) : 1;
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
 * 计算自然衰减后的信用指数（存量数据读写前的平滑改进）
 * 优先委托 js/core/credit-metrics.js 的 legacyDecayed（指数衰减 + 保底 10，
 * 修复「信任无条件随时间归零」）；未加载时内联等值兜底。
 */
function calculateDecayedPoints(currentPoints, lastUpdatedAt) {
  if (typeof currentPoints !== 'number' || !isFinite(currentPoints) || currentPoints <= 0) return 0;
  if (typeof window.legacyDecayed === 'function') {
    return window.legacyDecayed(currentPoints, lastUpdatedAt);
  }
  if (!lastUpdatedAt) return currentPoints;
  var now = Date.now();
  var last = new Date(lastUpdatedAt).getTime();
  var deltaDays = (now - last) / (24 * 60 * 60 * 1000);
  if (deltaDays <= 0) return currentPoints;
  var value = currentPoints * Math.exp(-CR_DECAY.lambda * deltaDays);
  // 保底 10：历史信任不因不活跃而完全清零（违规/消费按实际扣减）
  return Math.max(10, value);
}


/**
 * 检测文本是否包含不文明用语
 * 注意：会先剥离 base64 图片数据、URL、代码块，避免误判
 */
function isUncivilContent(text) {
  if (!text) return { uncivil: false };
  var cleaned = String(text)
    // 剥离 base64 data URI（图片等）
    .replace(/data:[a-z]+\/[a-z]+;base64,[A-Za-z0-9+/=]+/gi, '[图片]')
    // 剥离 markdown 图片语法
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
    // 剥离 HTML img 标签
    .replace(/<img[^>]*>/gi, '[图片]')
    // 剥离 URL
    .replace(/https?:\/\/[^\s)]+/g, '[链接]')
    // 剥离代码块
    .replace(/```[\s\S]*?```/g, '[代码]')
    .replace(/`[^`]+`/g, '[代码]');
  var lowered = cleaned.toLowerCase();
  for (var i = 0; i < _UNCIVIL_WORDS.length; i++) {
    if (lowered.indexOf(_UNCIVIL_WORDS[i]) !== -1) {
      return { uncivil: true, word: _UNCIVIL_WORDS[i] };
    }
  }
  return { uncivil: false };
}


/**
 * 查询某用户最近 windowDays 天内某类行为的次数
 * 静默失败：所有异常（表不存在/RLS拒绝/网络中断/超时）返回 0，不冒泡到控制台
 */
async function getBehaviorCount(userId, source, windowDays) {
  var sb = getSupabase();
  if (!sb || !userId) return 0;
  try {
    var since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    // 5 秒超时控制：避免页面切换时未完成的请求在控制台抛 ERR_ABORTED
    var ac = new AbortController();
    var timer = setTimeout(function () { ac.abort(); }, BEHAVIOR_COUNT_TIMEOUT_MS);
    var result = await sb.from('cr_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source', source)
      .gte('created_at', since)
      .abortSignal(ac.signal);
    clearTimeout(timer);
    if (result && result.error) return 0;
    return (result && result.count) || 0;
  } catch (e) {
    // 静默：cr_logs 表可能不存在（未运行 schema），不影响主功能
    return 0;
  }
}


/**
 * 计算积极行为获得的信用增量（会随时间衰减）
 */
async function calculateEarnedPoints(ruleKey, userId) {
  var rule = POINTS_EARN_RULES[ruleKey];
  if (!rule) return 0;
  var uid = userId || (_currentUser ? _currentUser.id : null);
  if (!uid) return 0;
  return rule.base;
}


/**
 * 检查用户是否有足够信用执行某高影响操作
 */
function canPerformAction(points, actionKey) {
  var action = POINTS_ACTION_COSTS[actionKey];
  if (!action) return { ok: false, error: '未知操作' };
  if (typeof points !== 'number' || points < action.threshold) {
    return { ok: false, error: '信用不足（需要 ' + action.threshold + '，当前 ' + (points || 0) + '）' };
  }
  return { ok: true, cost: action.cost };
}


/**
 * 创建信用申诉记录
 * @param {Object} params - { content, detected_word, amount, reason, source, user_note }
 */
async function createCRAppeal(params) {
  var sb = getSupabase();
  if (!sb || !_currentUser) return null;
  try {
    var { data, error } = await sb.from('cr_appeals')
      .insert({
        user_id: _currentUser.id,
        content: params.content || '',
        detected_word: params.detected_word || '',
        amount: params.amount || 0,
        reason: params.reason || '',
        source: params.source || 'community',
        user_note: params.user_note || ''
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    // 表不存在时静默降级（cr_appeals 表未创建），仅 console.warn
    if (e.message && e.message.indexOf('schema cache') >= 0) {
      console.warn('[信用] cr_appeals 表未创建，申诉功能降级');
    } else {
      console.error('[信用] 创建申诉失败:', e.message);
    }
    return null;
  }
}


/**
 * 更新当前用户 pending 申诉的说明
 */
async function updateCRAppeal(appealId, userNote) {
  var sb = getSupabase();
  if (!sb || !_currentUser || !appealId) return { ok: false, error: '参数错误' };
  try {
    var { error } = await sb.from('cr_appeals')
      .update({ user_note: userNote || '' })
      .eq('id', appealId)
      .eq('user_id', _currentUser.id)
      .eq('status', 'pending');
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 获取当前用户的申诉记录
 */
async function getUserPointsAppeals() {
  var sb = getSupabase();
  if (!sb || !_currentUser) return [];
  try {
    var { data, error } = await sb.from('cr_appeals')
      .select('*')
      .eq('user_id', _currentUser.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    return [];
  }
}


/**
 * 获取待处理的申诉记录（管理员用）
 */
async function getPendingCRAppeals() {
  var sb = getSupabase();
  if (!sb || !_currentUser) return [];
  try {
    var { data, error } = await sb.from('cr_appeals')
      .select('*, profiles:user_id(username, display_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    return [];
  }
}


/**
 * 处理信用申诉（管理员用）
 * @param {string} appealId
 * @param {string} action - 'approve' 或 'reject'
 * @param {string} adminNote
 */
async function resolveCRAppeal(appealId, action, adminNote) {
  var sb = getSupabase();
  if (!sb || !_currentUser) return { ok: false, error: '未登录' };
  try {
    var { data: appeal, error: fetchError } = await sb.from('cr_appeals')
      .select('*')
      .eq('id', appealId)
      .single();
    if (fetchError) throw fetchError;
    if (!appeal) return { ok: false, error: '申诉不存在' };
    if (appeal.status !== 'pending') return { ok: false, error: '该申诉已处理' };

    // 如果批准，恢复被扣除的信用
    if (action === 'approve') {
      await adjustUserPoints(Math.abs(appeal.amount), '申诉通过：恢复信用', { userId: appeal.user_id, source: 'appeal' });
    }

    var { error } = await sb.from('cr_appeals')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        admin_note: adminNote || '',
        resolved_at: new Date().toISOString()
      })
      .eq('id', appealId);
    if (error) throw error;

    return { ok: true, status: action === 'approve' ? 'approved' : 'rejected' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 获取用户当前信用指数（含自然衰减）
 */
async function getUserPoints(userId) {
  var sb = getSupabase();
  var uid = userId || (_currentUser ? _currentUser.id : null);
  if (!sb || !uid) {
    return { points: (_currentUser && typeof _currentUser.points === 'number') ? _currentUser.points : POINTS_DEFAULT, level: getPointsLevel(_currentUser && _currentUser.points) };
  }
  try {
    var { data, error } = await sb.from('profiles')
      .select('points, points_updated_at, user_group')
      .eq('id', uid)
      .maybeSingle();
    if (error) throw error;
    var raw = (data && typeof data.points === 'number') ? data.points : POINTS_DEFAULT;
    // 应用自然衰减：信用指数随时间衰减
    var points = calculateDecayedPoints(raw, data && data.points_updated_at ? data.points_updated_at : null);
    return { points: Math.round(points * 10) / 10, level: getPointsLevel(points), user_group: data ? data.user_group : 'member' };
  } catch (e) {
    return { points: (_currentUser && typeof _currentUser.points === 'number') ? _currentUser.points : POINTS_DEFAULT, level: getPointsLevel(_currentUser && _currentUser.points) };
  }
}


/**
 * 调整用户信用指数（普通用户仅能通过任务/违规被动调整；管理员可主动修改他人）
 * @param {number} amount - 变化量（正为增加，负为扣除）
 * @param {string} reason - 原因
 * @param {Object} [options] - { userId, source }
 */
async function adjustUserPoints(amount, reason, options) {
  options = options || {};
  var sb = getSupabase();
  var userId = options.userId || (_currentUser ? _currentUser.id : null);
  if (!sb || !userId) return { ok: false, error: '未登录或未初始化' };

  try {
    var { data: profile, error: fetchError } = await sb.from('profiles')
      .select('points, points_updated_at, user_group')
      .eq('id', userId)
      .maybeSingle();
    if (fetchError) throw fetchError;

    var rawPoints = (profile && typeof profile.points === 'number') ? profile.points : POINTS_DEFAULT;
    // 先应用自然衰减，再应用本次调整（profiles.points 字段为 numeric，保留 1 位小数，下限 0）
    var decayedPoints = calculateDecayedPoints(rawPoints, profile && profile.points_updated_at ? profile.points_updated_at : null);
    var newPoints = Math.max(0, Math.round((decayedPoints + amount) * 10) / 10);

    var { error: updateError } = await sb.from('profiles')
      .update({ points: newPoints, points_updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (updateError) throw updateError;

    // 记录审计日志（表可能不存在，忽略错误）
    try {
      await sb.from('cr_logs').insert({
        user_id: userId,
        amount: Math.round(amount),
        reason: reason || '手动调整',
        source: options.source || 'manual'
      });
    } catch (logErr) { /* 静默忽略 */ }

    // 重新读取，获取触发器可能更新的 user_group
    var { data: updated } = await sb.from('profiles')
      .select('points, user_group')
      .eq('id', userId)
      .maybeSingle();
    var finalPoints = (updated && typeof updated.points === 'number') ? updated.points : newPoints;
    var finalGroup = (updated && updated.user_group) ? updated.user_group : (profile && profile.user_group) || 'member';

    if (_currentUser && _currentUser.id === userId) {
      _currentUser.points = finalPoints;
      _currentUser.user_group = finalGroup;
    }

    return { ok: true, points: finalPoints, user_group: finalGroup };
  } catch (e) {
    console.error('[Points] 调整失败:', e.message);
    return { ok: false, error: e.message };
  }
}


/**
 * 将本地信用同步到云端（登录状态下回写，取本地与云端较高者）
 * @param {number} points - 本地最新信用指数
 */
async function syncPointsToCloud(points) {
  var sb = getSupabase();
  if (!sb || !_currentUser || _currentUser.isGuest) return { ok: false, error: '未登录' };
  var val = (typeof points === 'number' && isFinite(points)) ? Math.max(0, Math.round(points)) : 0;
  try {
    var { data } = await sb.from('profiles')
      .select('points')
      .eq('id', _currentUser.id)
      .maybeSingle();
    var cloudPoints = (data && typeof data.points === 'number') ? data.points : 0;
    var target = Math.max(cloudPoints, val);
    if (target !== cloudPoints) {
      var { error } = await sb.from('profiles')
        .update({ points: target, points_updated_at: new Date().toISOString() })
        .eq('id', _currentUser.id);
      if (error) throw error;
    }
    _currentUser.points = target;
    return { ok: true, points: target };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 获取信用排行榜（按 profiles.points 降序）
 * @param {number} [limit] - 返回条数，默认 50
 */
async function getPointsLeaderboard(limit) {
  var sb = getSupabase();
  var n = limit || 50;
  if (!sb) return [];
  try {
    // 积分排行榜走公开视图（profiles 表已收紧为仅本人可读）
    var { data, error } = await sb.from('public_profiles')
      .select('id, username, display_name, points, user_group')
      .order('points', { ascending: false })
      .limit(n);
    if (error) {
      _warnMissingDependency('视图 public_profiles', error,
        '积分榜将为空；请先执行 sql/migration_v3_security.sql');
      throw error;
    }
    return (data || []).map(function(p) {
      return {
        id: p.id,
        username: p.username,
        display_name: p.display_name,
        points: (typeof p.points === 'number') ? Math.max(0, p.points) : 0,
        user_group: p.user_group || 'member',
        level: getPointsLevel(p.points)
      };
    });
  } catch (e) {
    return [];
  }
}


function startOnlineTimeTracking() {
  if (_onlineTracker.heartbeatTimer || !_currentUser || _currentUser.isGuest) return;
  _onlineTracker.lastActive = Date.now();

  var keys = { date: 'bioquest_points_online_date', count: 'bioquest_points_online_count' };
  try {
    var today = _localDateStr();
    var savedDate = localStorage.getItem(keys.date);
    _onlineTracker.rewardedToday = savedDate === today ? parseInt(localStorage.getItem(keys.count) || '0', 10) : 0;
  } catch (e) { _onlineTracker.rewardedToday = 0; }

  function onActivity() { _onlineTracker.lastActive = Date.now(); }
  document.addEventListener('mousemove', onActivity, { passive: true });
  document.addEventListener('keydown', onActivity, { passive: true });
  document.addEventListener('touchstart', onActivity, { passive: true });

  _onlineTracker.heartbeatTimer = setInterval(async function() {
    if (!_currentUser || _currentUser.isGuest || _onlineTracker.rewardedToday >= ONLINE_TIME_DAILY_CAP) return;
    var inactive = Date.now() - _onlineTracker.lastActive;
    if (inactive > ONLINE_TIME_INACTIVE_THRESHOLD_MS) return;
    var delta = await calculateEarnedPoints('online_time');
    if (delta <= 0) return;
    adjustUserPoints(delta, POINTS_EARN_RULES.online_time.reason, { source: 'online_time' }).then(function(result) {
      if (result.ok) {
        _onlineTracker.rewardedToday++;
        try {
          var today = _localDateStr();
          localStorage.setItem(keys.date, today);
          localStorage.setItem(keys.count, String(_onlineTracker.rewardedToday));
        } catch (e) {}
      }
    });
  }, ONLINE_TIME_HEARTBEAT_INTERVAL_MS);
}


/**
 * 检查并授予成就
 * @param {string} type - 成就类型: streak, score, questions, email, community, login, practice, exam, accuracy
 * @param {number} value - 对应的值
 */
async function checkAchievement(type, value) {
  var sb = getSupabase();
  if (!sb || !_currentUser) return [];

  var newAchievements = [];
  var checks = [];

  switch (type) {
    case 'streak':
      if (value >= 3) checks.push('streak_3');
      if (value >= 7) checks.push('streak_7');
      if (value >= 14) checks.push('streak_14');
      if (value >= 30) checks.push('streak_30');
      if (value >= 60) checks.push('streak_60');
      if (value >= 100) checks.push('streak_100');
      if (value >= 365) checks.push('streak_365');
      break;
    case 'score':
      if (value >= 60) checks.push('score_60');
      if (value >= 70) checks.push('score_70');
      if (value >= 80) checks.push('score_80');
      if (value >= 90) checks.push('score_90');
      if (value >= 100) checks.push('score_100');
      break;
    case 'questions':
      if (value >= 50) checks.push('questions_50');
      if (value >= 100) checks.push('questions_100');
      if (value >= 300) checks.push('questions_300');
      if (value >= 500) checks.push('questions_500');
      if (value >= 1000) checks.push('questions_1000');
      if (value >= 2000) checks.push('questions_2000');
      if (value >= 5000) checks.push('questions_5000');
      break;
    case 'accuracy':
      if (value >= 60) checks.push('accuracy_60');
      if (value >= 70) checks.push('accuracy_70');
      if (value >= 80) checks.push('accuracy_80');
      if (value >= 90) checks.push('accuracy_90');
      if (value >= 95) checks.push('accuracy_95');
      break;
    case 'email':
      checks.push('email_verified');
      break;
    case 'community':
      if (value >= 1) checks.push('community_first');
      if (value >= 5) checks.push('community_5');
      if (value >= 10) checks.push('community_10');
      if (value >= 50) checks.push('community_50');
      if (value >= 100) checks.push('community_100');
      break;
    case 'login':
      checks.push('first_login');
      break;
    case 'practice':
      checks.push('first_practice');
      break;
    case 'exam':
      if (value >= 1) checks.push('exam_first');
      if (value >= 5) checks.push('exam_5');
      if (value >= 10) checks.push('exam_10');
      break;
    case 'exam_perfect':
      checks.push('exam_perfect');
      break;
  }

  for (var i = 0; i < checks.length; i++) {
    var key = checks[i];
    try {
      // 检查是否已有此成就
      var { data: existing, error: queryError } = await sb.from('achievements')
        .select('id')
        .eq('user_id', _currentUser.id)
        .eq('achievement_key', key)
        .maybeSingle();

      // 如果 achievements 表不存在，静默跳过
      if (queryError) continue;

      if (!existing) {
        var ach = ACHIEVEMENTS[key];
        if (ach) {
          var tierInfo = ACHIEVEMENT_TIERS[ach.tier] || ACHIEVEMENT_TIERS.iron;
          var { error: insertError } = await sb.from('achievements').insert({
            user_id: _currentUser.id,
            achievement_key: key,
            achievement_name: ach.name,
            achievement_desc: ach.desc,
            achievement_icon: ach.icon,
            achievement_tier: ach.tier,
            achievement_category: ach.category || ''
          });

          // 插入成功才记录
          if (!insertError) {
            newAchievements.push({ key: key, tier: ach.tier, tierLabel: tierInfo.label, tierColor: tierInfo.color, ...ach });

            // 触发成就解锁通知
            _showAchievementNotification(ach, tierInfo);
          }
        }
      }
    } catch (e) {
      // achievements 表可能不存在，静默跳过
      continue;
    }
  }

  return newAchievements;
}


/**
 * 成就解锁通知（屏幕右上角弹出）
 */
function _showAchievementNotification(ach, tierInfo) {
  try {
    if (!document.getElementById('achieve-notif-style')) {
      var st = document.createElement('style');
      st.id = 'achieve-notif-style';
      st.textContent = [
        '.ach-notif{position:fixed;top:20px;right:20px;z-index:10000;display:flex;align-items:center;gap:14px;max-width:340px;padding:14px 18px 14px 14px;border-radius:16px;overflow:hidden;color:var(--color-text,#2c3e30);background:var(--color-surface,#fff);border:1px solid rgba(196,149,106,.35);box-shadow:0 14px 44px rgba(20,30,20,.18),0 2px 8px rgba(0,0,0,.06),inset 0 1px 0 rgba(255,255,255,.7);font-family:var(--font-sans,system-ui,sans-serif);animation:achIn .55s cubic-bezier(.22,1,.36,1)}',
        '.ach-notif.out{animation:achOut .45s ease forwards}',
        '.ach-notif-icon{flex-shrink:0;width:54px;height:54px;display:flex;align-items:center;justify-content:center;border-radius:16px;background:var(--color-bg-warm,#f5f0e8);box-shadow:inset 0 0 0 1px rgba(196,149,106,.35),0 4px 14px rgba(0,0,0,.08)}',
        '.ach-notif-body{min-width:0}',
        '.ach-notif-tier{font-size:.6rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;margin-bottom:3px}',
        '.ach-notif-name{font-family:var(--font-serif,\'Noto Serif SC\',serif);font-size:1.05rem;font-weight:700;line-height:1.3;color:var(--color-deep,#1a2f1d)}',
        '.ach-notif-desc{font-size:.78rem;color:var(--color-text-muted,#8a8578);margin-top:3px;line-height:1.45}',
        '.ach-notif-shine{position:absolute;top:0;left:0;right:0;height:2px;background:none}',
        '@keyframes achIn{from{transform:translateX(120%) scale(.96);opacity:0}to{transform:translateX(0) scale(1);opacity:1}}',
        '@keyframes achOut{to{transform:translateX(120%) scale(.96);opacity:0}}',
        '@media(prefers-reduced-motion:reduce){.ach-notif{animation:none}}'
      ].join('\n');
      document.head.appendChild(st);
    }

    var tierColor = (tierInfo && tierInfo.color) || '#c4956a';
    var tierLabel = (tierInfo && tierInfo.label) || '成就';
    var badge = '';
    if (typeof window.renderBadgeSvg === 'function') {
      try { badge = window.renderBadgeSvg(ach.key, { size: 46, earned: true }); } catch (e) { badge = ''; }
    }

    var notif = document.createElement('div');
    notif.className = 'ach-notif';
    notif.setAttribute('role', 'status');
    notif.innerHTML =
      '<div class="ach-notif-icon">' +
        (badge || '<span class="ach-notif-fallback">' + (ach.name ? ach.name.charAt(0) : '') + '</span>') +
      '</div>' +
      '<div class="ach-notif-body">' +
        '<div class="ach-notif-tier" style="color:' + tierColor + '">' + tierLabel + ' · 解锁成就</div>' +
        '<div class="ach-notif-name">' + ach.name + '</div>' +
        '<div class="ach-notif-desc">' + ach.desc + '</div>' +
      '</div>' +
      '<div class="ach-notif-shine"></div>';
    document.body.appendChild(notif);

    setTimeout(function () {
      notif.classList.add('out');
      setTimeout(function () {
        if (notif.parentNode) notif.parentNode.removeChild(notif);
      }, ACHIEVE_NOTIF_FADE_MS);
    }, ACHIEVE_NOTIF_DISPLAY_MS);
  } catch (e) {
    // 静默失败
  }
}


/**
 * 获取用户所有成就
 */
async function getUserAchievements() {
  var sb = getSupabase();
  if (!sb || !_currentUser) return [];
  try {
    var { data } = await sb.from('achievements')
      .select('*')
      .eq('user_id', _currentUser.id)
      .order('created_at', { ascending: true });
    return data || [];
  } catch (e) {
    return [];
  }
}


/**
 * 获取所有可用成就定义
 */
function getAllAchievements() {
  return ACHIEVEMENTS;
}


/**
 * 获取成就段位定义
 */
function getAchievementTiers() {
  return ACHIEVEMENT_TIERS;
}


/**
 * 获取成就分类定义
 */
function getAchievementCategories() {
  return ACHIEVEMENT_CATEGORIES;
}



/**
 * 记录今日打卡
 * 每天首次练习/考试/阅读时自动调用
 */
async function recordDailyCheckIn() {
  if (!_currentUser) return null;
  try {
    var today = _localDateStr(); // YYYY-MM-DD（本地时区）
    var userId = _currentUser.id;

    // 检查今天是否已打卡
    var existResult = await sbFetchRest('GET', 'daily_checkins',
      'user_id=eq.' + encodeURIComponent(userId) + '&checkin_date=eq.' + encodeURIComponent(today) + '&select=id');
    if (!existResult.ok) return null;
    var existing = Array.isArray(existResult.data) ? existResult.data : [];
    if (existing.length > 0) return { already: true, date: today };

    // 获取昨天日期
    var yesterday = _localDateStr(new Date(Date.now() - 86400000));
    // 查询昨天是否打卡
    var ydResult = await sbFetchRest('GET', 'daily_checkins',
      'user_id=eq.' + encodeURIComponent(userId) + '&checkin_date=eq.' + encodeURIComponent(yesterday) + '&select=streak_count');
    var yesterdayCheckin = (ydResult.ok && Array.isArray(ydResult.data) && ydResult.data.length > 0)
      ? ydResult.data[0] : null;

    var streakCount = yesterdayCheckin ? (yesterdayCheckin.streak_count + 1) : 1;

    // 插入今日打卡记录
    var insertResult = await sbFetchRest('POST', 'daily_checkins', null, {
      user_id: userId,
      checkin_date: today,
      streak_count: streakCount
    });

    if (!insertResult.ok) return null;

    // 更新 profiles 表的 streak 信息（同时维护最长连续打卡，避免「最长连续」恒为 0）
    var longestStreak = streakCount;
    try {
      var longestRes = await sbFetchRest('GET', 'profiles',
        'id=eq.' + encodeURIComponent(userId) + '&select=longest_streak');
      var longestData = (longestRes.ok && Array.isArray(longestRes.data) && longestRes.data.length > 0)
        ? longestRes.data[0] : null;
      if (longestData && typeof longestData.longest_streak === 'number' && longestData.longest_streak > longestStreak) {
        longestStreak = longestData.longest_streak;
      }
    } catch (e) { /* 静默 */ }

    var patchResult = await sbFetchRest('PATCH', 'profiles', 'id=eq.' + encodeURIComponent(userId), {
      current_streak: streakCount,
      longest_streak: longestStreak,
      last_checkin: today
    });
    if (!patchResult.ok) {
      // profiles 更新失败不应阻断打卡本身，仅记录
      console.warn('[TATABOX] 打卡后更新 profiles 失败:', patchResult.status);
    }

    // 打卡加信用
    try {
      var delta = await calculateEarnedPoints('daily_checkin');
      if (delta > 0) {
        await adjustUserPoints(delta, POINTS_EARN_RULES.daily_checkin.reason, { source: 'checkin' });
      }
    } catch (e) { /* 静默 */ }

    // 检查是否获得成就
    if (typeof window.checkAchievement === 'function') {
      window.checkAchievement('streak', streakCount);
    }

    return { already: false, date: today, streak: streakCount };
  } catch (e) {
    return null;
  }
}


/**
 * 获取打卡数据
 */
async function getCheckInData() {
  if (!_currentUser) return { current_streak: 0, longest_streak: 0, total_checkins: 0, calendar: [] };
  try {
    var userId = _currentUser.id;

    // 获取 profile 中的 streak 数据
    var profileResult = await sbFetchRest('GET', 'profiles',
      'id=eq.' + encodeURIComponent(userId) + '&select=current_streak,longest_streak,last_checkin');
    var profile = (profileResult.ok && Array.isArray(profileResult.data) && profileResult.data.length > 0)
      ? profileResult.data[0] : null;

    // 获取最近30天打卡日历
    var thirtyDaysAgo = _localDateStr(new Date(Date.now() - 30 * 86400000));
    var calResult = await sbFetchRest('GET', 'daily_checkins',
      'user_id=eq.' + encodeURIComponent(userId) + '&checkin_date=gte.' + encodeURIComponent(thirtyDaysAgo) + '&order=checkin_date.desc&select=checkin_date,streak_count');
    var calendar = (calResult.ok && Array.isArray(calResult.data)) ? calResult.data : [];

    // 获取总打卡天数
    var countResult = await sbFetchRest('GET', 'daily_checkins',
      'user_id=eq.' + encodeURIComponent(userId) + '&select=id');
    var totalCheckins = (countResult.ok && Array.isArray(countResult.data)) ? countResult.data.length : 0;

    return {
      current_streak: (profile && profile.current_streak) || 0,
      longest_streak: (profile && profile.longest_streak) || 0,
      total_checkins: totalCheckins,
      last_checkin: (profile && profile.last_checkin) || null,
      calendar: calendar
    };
  } catch (e) {
    return { current_streak: 0, longest_streak: 0, total_checkins: 0, calendar: [] };
  }
}

window.invalidateLeaderboardCache = invalidateLeaderboardCache;

window.checkAchievement = checkAchievement;

window.getUserAchievements = getUserAchievements;

window.getAllAchievements = getAllAchievements;

window.getAchievementTiers = getAchievementTiers;

window.getAchievementCategories = getAchievementCategories;

window.recordDailyCheckIn = recordDailyCheckIn;

window.getCheckInData = getCheckInData;

window.getUserPoints = getUserPoints;

window.adjustUserPoints = adjustUserPoints;

window.getPointsLevel = getPointsLevel;

window.isUncivilContent = isUncivilContent;

window.getBehaviorCount = getBehaviorCount;

window.calculateEarnedPoints = calculateEarnedPoints;

window.canPerformAction = canPerformAction;

window.syncPointsToCloud = syncPointsToCloud;

window.getPointsLeaderboard = getPointsLeaderboard;

window.createCRAppeal = createCRAppeal;

window.updateCRAppeal = updateCRAppeal;

window.getUserPointsAppeals = getUserPointsAppeals;

window.getPendingCRAppeals = getPendingCRAppeals;

window.resolveCRAppeal = resolveCRAppeal;

window.startOnlineTimeTracking = startOnlineTimeTracking;

window.updateBioScore = updateBioScore;

window.getLeaderboard = getLeaderboard;
