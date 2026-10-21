


/**
 * 学习任务 / 待办
 */
async function getStudyTasks(status) {
  if (!_currentUser || _currentUser.isGuest) return [];
  var sb = getSupabase();
  if (!sb) return [];
  try {
    var query = sb.from('study_tasks')
      .select('*')
      .eq('user_id', _currentUser.id)
      .order('sort_order', { ascending: true })
      .order('due_date', { ascending: true });
    if (status) query = query.eq('status', status);
    var { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (e) {
    return [];
  }
}


async function addStudyTask(task) {
  if (!_currentUser || _currentUser.isGuest || !task || !task.title) return { ok: false, error: '未登录或标题为空' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var { data, error } = await sb.from('study_tasks')
      .insert({
        user_id: _currentUser.id,
        title: task.title,
        description: task.description || '',
        priority: task.priority || 'medium',
        status: task.status || 'todo',
        due_date: task.due_date || null,
        related_module: task.related_module || '',
        related_concepts: task.related_concepts || [],
        parent_task_id: task.parent_task_id || null,
        sort_order: task.sort_order || 0
      })
      .select()
      .single();
    if (error) throw error;
    return { ok: true, task: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


async function updateStudyTask(id, updates) {
  if (!_currentUser || _currentUser.isGuest || !id) return { ok: false, error: '参数错误' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var allowed = {};
    ['title', 'description', 'priority', 'status', 'due_date', 'related_module', 'related_concepts', 'parent_task_id', 'sort_order'].forEach(function(k) {
      if (updates.hasOwnProperty(k)) allowed[k] = updates[k];
    });
    var { data, error } = await sb.from('study_tasks')
      .update(allowed)
      .eq('id', id)
      .eq('user_id', _currentUser.id)
      .select()
      .single();
    if (error) throw error;
    return { ok: true, task: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


async function deleteStudyTask(id) {
  if (!_currentUser || _currentUser.isGuest || !id) return { ok: false, error: '参数错误' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var { error } = await sb.from('study_tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', _currentUser.id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 专注记录（番茄钟）
 */
async function getFocusSessions(days) {
  if (!_currentUser || _currentUser.isGuest) return [];
  var sb = getSupabase();
  if (!sb) return [];
  try {
    var since = new Date(Date.now() - (days || 7) * 24 * 60 * 60 * 1000).toISOString();
    var { data, error } = await sb.from('focus_sessions')
      .select('*')
      .eq('user_id', _currentUser.id)
      .gte('start_time', since)
      .order('start_time', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    return [];
  }
}


async function addFocusSession(session) {
  if (!_currentUser || _currentUser.isGuest) return { ok: false, error: '未登录' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var { data, error } = await sb.from('focus_sessions')
      .insert({
        user_id: _currentUser.id,
        task_id: session.task_id || null,
        duration: session.duration || 25,
        start_time: session.start_time || new Date().toISOString(),
        end_time: session.end_time || null,
        is_completed: session.is_completed || false,
        note: session.note || ''
      })
      .select()
      .single();
    if (error) throw error;
    return { ok: true, session: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 学习笔记
 */
async function getNotes() {
  if (!_currentUser || _currentUser.isGuest) return [];
  var sb = getSupabase();
  if (!sb) return [];
  try {
    var { data, error } = await sb.from('notes')
      .select('*')
      .eq('user_id', _currentUser.id)
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    return [];
  }
}


async function addNote(note) {
  if (!_currentUser || _currentUser.isGuest || !note || !note.title) return { ok: false, error: '未登录或标题为空' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var { data, error } = await sb.from('notes')
      .insert({
        user_id: _currentUser.id,
        title: note.title,
        content: note.content || '',
        related_concepts: note.related_concepts || [],
        related_module: note.related_module || '',
        tags: note.tags || [],
        is_pinned: note.is_pinned || false
      })
      .select()
      .single();
    if (error) throw error;
    return { ok: true, note: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


async function updateNote(id, updates) {
  if (!_currentUser || _currentUser.isGuest || !id) return { ok: false, error: '参数错误' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var allowed = {};
    ['title', 'content', 'related_concepts', 'related_module', 'tags', 'is_pinned'].forEach(function(k) {
      if (updates.hasOwnProperty(k)) allowed[k] = updates[k];
    });
    var { data, error } = await sb.from('notes')
      .update(allowed)
      .eq('id', id)
      .eq('user_id', _currentUser.id)
      .select()
      .single();
    if (error) throw error;
    return { ok: true, note: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


async function deleteNote(id) {
  if (!_currentUser || _currentUser.isGuest || !id) return { ok: false, error: '参数错误' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var { error } = await sb.from('notes')
      .delete()
      .eq('id', id)
      .eq('user_id', _currentUser.id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 课程表
 */
async function getSchedule() {
  if (!_currentUser || _currentUser.isGuest) return { ok: false, error: '未登录' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var { data: schedule, error: sErr } = await sb.from('schedules')
      .select('*')
      .eq('user_id', _currentUser.id)
      .eq('is_default', true)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!schedule) {
      var { data: newSchedule, error: nsErr } = await sb.from('schedules')
        .insert({ user_id: _currentUser.id, name: '我的课程表', is_default: true })
        .select()
        .single();
      if (nsErr) throw nsErr;
      schedule = newSchedule;
    }
    var { data: items, error: iErr } = await sb.from('schedule_items')
      .select('*')
      .eq('schedule_id', schedule.id)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });
    if (iErr) throw iErr;
    return { ok: true, schedule: schedule, items: items || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


async function saveScheduleItem(item) {
  if (!_currentUser || _currentUser.isGuest || !item) return { ok: false, error: '未登录或数据为空' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var scheduleRes = await getSchedule();
    if (!scheduleRes.ok) throw new Error(scheduleRes.error);
    var scheduleId = scheduleRes.schedule.id;
    var payload = {
      schedule_id: scheduleId,
      day_of_week: item.day_of_week,
      start_time: item.start_time,
      end_time: item.end_time,
      subject: item.subject,
      location: item.location || '',
      teacher: item.teacher || '',
      color: item.color || '#5a7d5c',
      sort_order: item.sort_order || 0
    };
    var result;
    if (item.id) {
      result = await sb.from('schedule_items')
        .update(payload)
        .eq('id', item.id)
        .select()
        .single();
    } else {
      result = await sb.from('schedule_items')
        .insert(payload)
        .select()
        .single();
    }
    if (result.error) throw result.error;
    return { ok: true, item: result.data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


async function deleteScheduleItem(id) {
  if (!_currentUser || _currentUser.isGuest || !id) return { ok: false, error: '参数错误' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var { error } = await sb.from('schedule_items')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}



/**
 * 发布悬赏
 */
async function createBounty(title, content, pointsReward, tags, expiresDays) {
  if (!_currentUser || _currentUser.isGuest) return { ok: false, error: '未登录' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };

  var reward = parseInt(pointsReward, 10);
  if (isNaN(reward) || reward < 5) return { ok: false, error: '悬赏信用不能少于 5' };

  try {
    // 检查信用并扣除
    var crInfo = await getUserPoints();
    if (crInfo.points < reward) {
      return { ok: false, error: '信用不足，无法发布悬赏' };
    }
    var costResult = await adjustUserPoints(-reward, '发布问答悬赏消耗信用：' + title, { source: 'bounty_create' });
    if (!costResult || !costResult.ok) {
      return { ok: false, error: '扣除信用失败' };
    }

    var expiresAt = null;
    if (expiresDays && expiresDays > 0) {
      expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();
    }

    var { data, error } = await sb.from('q_bounties')
      .insert({
        user_id: _currentUser.id,
        title: title,
        content: content,
        tags: tags || [],
        points_reward: reward,
        extra_points: 0,
        status: 'open',
        expires_at: expiresAt
      })
      .select()
      .single();

    if (error) throw error;
    return { ok: true, bounty: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 获取悬赏列表
 */
async function getBounties(status, limit) {
  var sb = getSupabase();
  if (!sb) return [];
  try {
    var query = sb.from('q_bounties')
      .select('*, profiles:user_id(username, display_name)')
      .order('created_at', { ascending: false })
      .limit(limit || 50);
    if (status) query = query.eq('status', status);
    var { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (e) {
    return [];
  }
}


/**
 * 获取悬赏详情（含回答）
 */
async function getBountyDetail(bountyId) {
  if (!bountyId) return null;
  var sb = getSupabase();
  if (!sb) return null;
  try {
    var { data: bounty, error: bError } = await sb.from('q_bounties')
      .select('*, profiles:user_id(username, display_name)')
      .eq('id', bountyId)
      .maybeSingle();
    if (bError) throw bError;
    if (!bounty) return null;

    var { data: answers, error: aError } = await sb.from('q_bounty_answers')
      .select('*, profiles:user_id(username, display_name)')
      .eq('bounty_id', bountyId)
      .order('created_at', { ascending: true });
    if (aError) throw aError;

    return { ...bounty, answers: answers || [] };
  } catch (e) {
    return null;
  }
}


/**
 * 回答悬赏
 */
async function createBountyAnswer(bountyId, content) {
  if (!_currentUser || _currentUser.isGuest) return { ok: false, error: '未登录' };
  if (!bountyId || !content || !content.trim()) return { ok: false, error: '参数错误' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };

  try {
    var { data: bounty, error: fError } = await sb.from('q_bounties')
      .select('id, user_id, status, answer_count')
      .eq('id', bountyId)
      .single();
    if (fError) throw fError;
    if (!bounty || bounty.status !== 'open') return { ok: false, error: '悬赏已结束或不存在' };
    if (bounty.user_id === _currentUser.id) return { ok: false, error: '不能回答自己的悬赏' };

    var { data, error } = await sb.from('q_bounty_answers')
      .insert({
        bounty_id: bountyId,
        user_id: _currentUser.id,
        content: content.trim()
      })
      .select()
      .single();
    if (error) throw error;

    // 更新回答数
    await sb.from('q_bounties')
      .update({ answer_count: (bounty.answer_count || 0) + 1 })
      .eq('id', bountyId);

    return { ok: true, answer: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 采纳悬赏回答
 */
async function acceptBountyAnswer(bountyId, answerId) {
  if (!_currentUser || _currentUser.isGuest) return { ok: false, error: '未登录' };
  if (!bountyId || !answerId) return { ok: false, error: '参数错误' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };

  try {
    var { data: bounty, error: bError } = await sb.from('q_bounties')
      .select('id, user_id, points_reward, extra_points, status')
      .eq('id', bountyId)
      .single();
    if (bError) throw bError;
    if (!bounty) return { ok: false, error: '悬赏不存在' };
    if (bounty.user_id !== _currentUser.id) return { ok: false, error: '只有悬赏发布者可以采纳' };
    if (bounty.status !== 'open') return { ok: false, error: '悬赏已结束' };

    var { data: answer, error: aError } = await sb.from('q_bounty_answers')
      .select('id, user_id, is_accepted')
      .eq('id', answerId)
      .eq('bounty_id', bountyId)
      .single();
    if (aError) throw aError;
    if (!answer) return { ok: false, error: '回答不存在' };
    if (answer.is_accepted) return { ok: false, error: '该回答已被采纳' };

    var totalReward = (bounty.points_reward || 0) + (bounty.extra_points || 0);

    // 转给回答者
    if (totalReward > 0) {
      var rewardResult = await adjustUserPoints(totalReward, '悬赏回答被采纳：' + bounty.title, { userId: answer.user_id, source: 'bounty_reward' });
      if (!rewardResult || !rewardResult.ok) {
        return { ok: false, error: '奖励发放失败' };
      }
    }

    // 更新悬赏状态
    var { error: uError } = await sb.from('q_bounties')
      .update({ status: 'answered', accepted_answer_id: answerId })
      .eq('id', bountyId);
    if (uError) throw uError;

    // 标记回答为已采纳
    await sb.from('q_bounty_answers')
      .update({ is_accepted: true })
      .eq('id', answerId);

    // 悬赏发布者和回答者都获得额外信用奖励
    var bonusDelta = await calculateEarnedPoints('valid_report');
    if (bonusDelta > 0) {
      await adjustUserPoints(bonusDelta, '成功发布悬赏', { userId: bounty.user_id, source: 'bounty_bonus' });
      await adjustUserPoints(bonusDelta, '优质悬赏回答', { userId: answer.user_id, source: 'bounty_bonus' });
    }

    return { ok: true, reward: totalReward };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 通过用户密钥查询学生资料（供教师添加学生用）
 * 前提：profiles 表需有 user_key 字段（8 位字母数字）
 * 返回 { id, username, display_name, bio_score, total_answered, accuracy, current_streak, last_active } 或 null
 */
async function getStudentByKey(userKey) {
  if (!userKey) return null;
  var sb = getSupabase();
  if (!sb) return null;
  try {
    var key = userKey.toUpperCase();
    // 走 SECURITY DEFINER RPC：profiles 表已收紧为“仅本人可读”，公开查询统一走
    // get_student_by_key（user_key 即能力凭证，函数只回公开字段）
    var { data, error } = await sb.rpc('get_student_by_key', { p_user_key: key });
    var p = Array.isArray(data) ? data[0] : data;
    if (error || !p) return null;
    return {
      id: p.id,
      username: p.username,
      display_name: p.display_name,
      total_score: p.bio_score || 0,
      total_answered: p.total_answered || 0,
      accuracy: p.accuracy || 0,
      current_streak: p.current_streak || 0,
      last_active: p.updated_at || new Date().toISOString()
    };
  } catch (e) {
    console.warn('[TATABOX] getStudentByKey 查询失败:', e);
    return null;
  }
}


/**
 * 通过学生 user_key 拉取学生的详细学习数据（含练习记录、错题）
 * 用于教师查看学生详情
 * @param {string} userKey - 8 字符 user_key
 * @returns {Promise<Object|null>} 学生详情
 */
async function getStudentDetailByKey(userKey) {
  if (!userKey) return null;
  var sb = getSupabase();
  if (!sb) return null;
  try {
    // 1. 通过 user_key 查公开资料（profiles 已收紧，改走 SECURITY DEFINER RPC）
    var { data: row, error: pErr } = await sb.rpc('get_student_by_key', { p_user_key: userKey.toUpperCase() });
    var profile = Array.isArray(row) ? row[0] : row;
    if (pErr || !profile) return null;

    // 2. 拉取该学生最近 50 条练习记录（RLS 限制：只有本人能查，这里通过 RPC 或公开视图绕过）
    // 由于 RLS，普通查询会返回空。这里返回基础资料，详细历史需要学生本人授权或通过教师密钥机制
    return {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      total_score: profile.bio_score || 0,
      total_answered: profile.total_answered || 0,
      total_correct: profile.total_correct || 0,
      accuracy: profile.accuracy || 0,
      current_streak: profile.current_streak || 0,
      last_active: profile.updated_at || new Date().toISOString(),
      history: [],   // RLS 限制：教师无法直接读学生练习记录
      wrongQuestions: []  // RLS 限制：教师无法直接读学生错题
    };
  } catch (e) {
    console.warn('[TATABOX] getStudentDetailByKey 失败:', e && e.message);
    return null;
  }
}


/**
 * 保存当前用户的 user_key 到 profiles 表（若尚未保存）
 * 在用户登录后自动调用，确保教师能通过密钥查到该学生
 */
async function saveUserKeyIfNeeded() {
  if (typeof window._getUserKey !== 'function') return;
  var key = window._getUserKey();
  var sb = getSupabase();
  if (!sb) return;
  try {
    var { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    // 先查询是否已保存 user_key
    var { data } = await sb.from('profiles')
      .select('user_key')
      .eq('id', user.id)
      .limit(1);
    if (data && data.length > 0 && data[0].user_key === key) return; // 已保存
    // 更新 user_key
    await sb.from('profiles')
      .update({ user_key: key })
      .eq('id', user.id);
  } catch (e) {
    console.warn('[TATABOX] saveUserKeyIfNeeded 失败:', e);
  }
}



/**
 * 获取公告列表
 * @param {Object} [options] - { onlyActive: true, limit: 10 }
 */
async function getAnnouncements(options) {
  var opts = options || {};
  var sb = getSupabase();
  if (!sb) {
    // 降级到 localStorage
    try {
      var raw = localStorage.getItem('bioquest_announcements');
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  try {
    var query = sb.from('announcements').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    if (opts.onlyActive !== false) {
      query = query.eq('is_active', true);
    }
    if (opts.limit) {
      query = query.limit(opts.limit);
    }
    var { data, error } = await query;
    if (error) {
      console.warn('[TATABOX] 获取公告失败:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn('[TATABOX] 获取公告异常:', e && e.message);
    return [];
  }
}


/**
 * 创建公告（管理员）
 */
async function createAnnouncement(title, content, isPinned) {
  var sb = getSupabase();
  if (!sb) return { ok: false, error: '未连接数据库' };
  try {
    var { data, error } = await sb.from('announcements').insert({
      title: title,
      content: content,
      is_pinned: !!isPinned,
      is_active: true
    }).select().single();
    if (error) return { ok: false, error: parseAnnouncementError(error) };
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 更新公告（管理员）
 */
async function updateAnnouncement(id, updates) {
  var sb = getSupabase();
  if (!sb) return { ok: false, error: '未连接数据库' };
  try {
    updates.updated_at = new Date().toISOString();
    var { data, error } = await sb.from('announcements').update(updates).eq('id', id).select().single();
    if (error) return { ok: false, error: parseAnnouncementError(error) };
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 删除公告（管理员）
 */
async function deleteAnnouncement(id) {
  var sb = getSupabase();
  if (!sb) return { ok: false, error: '未连接数据库' };
  try {
    var numericId = Number(id);
    var { error } = await sb.from('announcements').delete().eq('id', numericId);
    if (error) return { ok: false, error: parseAnnouncementError(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


function parseAnnouncementError(error) {
  var msg = errText(error);
  if (msg.includes('permission') || msg.includes('policy')) return '权限不足，仅管理员可操作';
  if (msg.includes('duplicate')) return '公告已存在';
  return msg;
}


// v4.0 AI 对话持久化（ai_conversations + ai_messages 表）

/**
 * 保存（upsert）AI 对话
 * @param {Object} conv - { id, type, title, metadata }
 * @returns {Promise<{ok:boolean, id?:string, error?:string}>}
 */
async function saveAIConversation(conv) {
  if (!_currentUser || _currentUser.isGuest || !conv) {
    return { ok: false, error: '未登录或游客模式' };
  }
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var convId = conv.id || ('conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
    var upsertData = {
      id: convId,
      user_id: _currentUser.id,
      type: conv.type || 'tutor', // tutor | classmate | classroom
      title: conv.title || '未命名对话',
      metadata: conv.metadata || {},
      updated_at: new Date().toISOString()
    };
    var result = await sb.from('ai_conversations').upsert(upsertData, { onConflict: 'id' }).select('id').single();
    if (result.error) throw result.error;
    return { ok: true, id: convId };
  } catch (e) {
    console.warn('[TATABOX] saveAIConversation 失败:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}


/**
 * 保存单条 AI 消息
 * @param {Object} msg - { conversation_id, role, content, metadata }
 */
async function saveAIMessage(msg) {
  if (!_currentUser || _currentUser.isGuest || !msg || !msg.conversation_id) {
    return { ok: false, error: '参数不完整' };
  }
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var insertData = {
      conversation_id: msg.conversation_id,
      role: msg.role || 'user', // user | assistant | system
      content: msg.content || '',
      metadata: msg.metadata || {},
      created_at: new Date().toISOString()
    };
    var result = await sb.from('ai_messages').insert(insertData);
    if (result.error) throw result.error;
    return { ok: true };
  } catch (e) {
    console.warn('[TATABOX] saveAIMessage 失败:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}


/**
 * 获取当前用户的 AI 对话列表
 * @param {string} [type] - 可选类型过滤
 * @param {number} [limit=20]
 */
async function getAIConversations(type, limit) {
  if (!_currentUser || _currentUser.isGuest) return [];
  var sb = getSupabase();
  if (!sb) return [];
  try {
    var query = sb.from('ai_conversations')
      .select('id, type, title, metadata, created_at, updated_at')
      .eq('user_id', _currentUser.id)
      .order('updated_at', { ascending: false })
      .limit(limit || 20);
    if (type) query = query.eq('type', type);
    var result = await query;
    if (result.error) throw result.error;
    return result.data || [];
  } catch (e) {
    console.warn('[TATABOX] getAIConversations 失败:', e && e.message);
    return [];
  }
}


/**
 * 获取某个对话的所有消息
 * @param {string} conversationId
 */
async function getAIMessages(conversationId) {
  if (!conversationId) return [];
  var sb = getSupabase();
  if (!sb) return [];
  try {
    var result = await sb.from('ai_messages')
      .select('id, role, content, metadata, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (result.error) throw result.error;
    return result.data || [];
  } catch (e) {
    console.warn('[TATABOX] getAIMessages 失败:', e && e.message);
    return [];
  }
}


/**
 * 删除对话（同时删除其所有消息）
 * @param {string} conversationId
 */
async function deleteAIConversation(conversationId) {
  if (!_currentUser || _currentUser.isGuest || !conversationId) {
    return { ok: false, error: '参数不完整' };
  }
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    // 先删消息，再删对话
    var r1 = await sb.from('ai_messages').delete().eq('conversation_id', conversationId);
    if (r1.error) throw r1.error;
    var r2 = await sb.from('ai_conversations').delete().eq('id', conversationId).eq('user_id', _currentUser.id);
    if (r2.error) throw r2.error;
    return { ok: true };
  } catch (e) {
    console.warn('[TATABOX] deleteAIConversation 失败:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}


// 数据表：class_memberships (teacher_id, student_id, student_key, student_name, added_at)
// 配套迁移：sql/migration_v6_class_memberships.sql

/**
 * 从 Supabase 读取当前用户（作为教师）的班级成员列表
 * @returns {Promise<Array|null>} 班级成员数组，失败返回 null
 */
async function getClassMembershipsFromSupabase() {
  if (!_currentUser || _currentUser.isGuest) return null;
  var sb = getSupabase();
  if (!sb) return null;
  try {
    var { data, error } = await sb.from('class_memberships')
      .select('id, student_id, student_key, student_name, added_at')
      .eq('teacher_id', _currentUser.id)
      .order('added_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('[TATABOX] getClassMembershipsFromSupabase 失败:', e && e.message);
    return null;
  }
}


/**
 * 添加学生到当前用户的班级（Supabase）
 * @param {Object} student - { student_id?, student_key, student_name }
 * @returns {Promise<{ok: boolean, error?: string, membership?: Object}>}
 */
async function addClassMembershipToSupabase(student) {
  if (!_currentUser || _currentUser.isGuest || !student) return { ok: false, error: '未登录或参数为空' };
  if (!student.student_id && !student.student_key) return { ok: false, error: '缺少 student_id 或 student_key' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var insertData = {
      teacher_id: _currentUser.id,
      student_id: student.student_id || null,
      student_key: student.student_key || null,
      student_name: student.student_name || ''
    };
    var { data, error } = await sb.from('class_memberships')
      .upsert(insertData, { onConflict: student.student_id ? 'teacher_id,student_id' : 'teacher_id,student_key' })
      .select()
      .single();
    if (error) throw error;
    return { ok: true, membership: data };
  } catch (e) {
    console.warn('[TATABOX] addClassMembershipToSupabase 失败:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}


/**
 * 从当前用户的班级中移除学生（Supabase）
 * @param {string} membershipId - class_memberships.id
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function removeClassMembershipFromSupabase(membershipId) {
  if (!_currentUser || _currentUser.isGuest || !membershipId) return { ok: false, error: '参数错误' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var { error } = await sb.from('class_memberships')
      .delete()
      .eq('id', membershipId)
      .eq('teacher_id', _currentUser.id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.warn('[TATABOX] removeClassMembershipFromSupabase 失败:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}

// 暴露到全局（本文件自有符号的导出，勿再集中到 supabase-client.js）
window.getStudentByKey = getStudentByKey;
window.getStudentDetailByKey = getStudentDetailByKey;
window.saveUserKeyIfNeeded = saveUserKeyIfNeeded;

window.getAnnouncements = getAnnouncements;
window.createAnnouncement = createAnnouncement;
window.updateAnnouncement = updateAnnouncement;
window.deleteAnnouncement = deleteAnnouncement;

// 问答悬赏
window.createBounty = createBounty;
window.getBounties = getBounties;
window.getBountyDetail = getBountyDetail;
window.createBountyAnswer = createBountyAnswer;
window.acceptBountyAnswer = acceptBountyAnswer;

// 学习管理工具
window.getStudyTasks = getStudyTasks;
window.addStudyTask = addStudyTask;
window.updateStudyTask = updateStudyTask;
window.deleteStudyTask = deleteStudyTask;
window.getFocusSessions = getFocusSessions;
window.addFocusSession = addFocusSession;
window.getNotes = getNotes;
window.addNote = addNote;
window.updateNote = updateNote;
window.deleteNote = deleteNote;
window.getSchedule = getSchedule;
window.saveScheduleItem = saveScheduleItem;
window.deleteScheduleItem = deleteScheduleItem;

// 班级成员（替代 teacher.js 的 localStorage 实现）
window.getClassMembershipsFromSupabase = getClassMembershipsFromSupabase;
window.addClassMembershipToSupabase = addClassMembershipToSupabase;
window.removeClassMembershipFromSupabase = removeClassMembershipFromSupabase;

// AI 对话
window.saveAIConversation = saveAIConversation;
window.saveAIMessage = saveAIMessage;
window.getAIConversations = getAIConversations;
window.getAIMessages = getAIMessages;
window.deleteAIConversation = deleteAIConversation;
