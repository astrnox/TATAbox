


/**
 * 导出所有用户数据为 JSON 对象
 * 包含：账号密码、错题、收藏、练习记录、设置、成就、签到等全部数据
 */
function exportUserData() {
  var data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    account: {},
    settings: {},
    wrongQuestions: [],
    favorites: [],
    practiceRecords: [],
    achievements: [],
    checkInData: {},
    extraData: {}
  };

  // 账号信息（含密码 - 仅本地/游客账号）
  if (_currentUser) {
    data.account = {
      id: _currentUser.id,
      username: _currentUser.username,
      display_name: _currentUser.display_name,
      email: _currentUser.email,
      bio_score: _currentUser.bio_score,
      user_group: _currentUser.user_group,
      isGuest: _currentUser.isGuest || false
    };
    // 游客/本地账号：只导出密码哈希，绝不导出明文
    if (_currentUser.isGuest) {
      try {
        var savedHash = localStorage.getItem('bioquest_guest_pwdhash');
        if (savedHash) {
          data.account.password_hash = savedHash;
          data.account.password_note = '游客模式：仅本地哈希，明文已废弃';
        }
      } catch (e) {}
    }
  }

  // 用户设置 — 全面导出
  try {
    data.settings = {
      theme: localStorage.getItem('bioquest-theme') || 'light',
      fontSize: localStorage.getItem('bioquest-fontSize') || 'medium',
      questionCount: parseInt(localStorage.getItem('bioquest-questionCount')) || 30,
      showTimer: localStorage.getItem('bioquest-showTimer') !== 'false',
      autoSubmit: localStorage.getItem('bioquest-autoSubmit') === 'true'
    };
    // 额外设置项
    var extraKeys = ['bioquest-answerMode', 'bioquest-showExplanation', 'bioquest-soundEnabled', 'bioquest-notificationEnabled'];
    for (var i = 0; i < extraKeys.length; i++) {
      var val = localStorage.getItem(extraKeys[i]);
      if (val !== null) {
        data.settings[extraKeys[i].replace('bioquest-', '')] = val;
      }
    }
  } catch (e) { /* 静默 */ }

  // 错题数据
  try {
    var wrongRaw = localStorage.getItem('bioquest_wrong_questions');
    if (wrongRaw) {
      data.wrongQuestions = JSON.parse(wrongRaw);
      if (!Array.isArray(data.wrongQuestions)) data.wrongQuestions = [];
    }
  } catch (e) { data.wrongQuestions = []; }

  // 收藏数据
  try {
    var favRaw = localStorage.getItem('bioquest_favorites');
    if (favRaw) {
      data.favorites = JSON.parse(favRaw);
      if (!Array.isArray(data.favorites)) data.favorites = [];
    }
  } catch (e) { data.favorites = []; }

  // 练习记录
  try {
    var recRaw = localStorage.getItem('bioquest_practice_records');
    if (recRaw) {
      data.practiceRecords = JSON.parse(recRaw);
      if (!Array.isArray(data.practiceRecords)) data.practiceRecords = [];
    }
  } catch (e) { data.practiceRecords = []; }

  // 旧格式记录合并
  try {
    var recRaw2 = localStorage.getItem('bioquest_records');
    if (recRaw2) {
      var records2 = JSON.parse(recRaw2);
      if (Array.isArray(records2) && records2.length > 0) {
        data.practiceRecords = data.practiceRecords.concat(records2);
      }
    }
  } catch (e) { /* 静默 */ }

  // 成就数据
  try {
    var achRaw = localStorage.getItem('bioquest_achievements');
    if (achRaw) {
      data.achievements = JSON.parse(achRaw);
      if (!Array.isArray(data.achievements)) data.achievements = [];
    }
  } catch (e) { data.achievements = []; }

  // 签到数据
  try {
    var checkRaw = localStorage.getItem('bioquest_checkin');
    if (checkRaw) {
      data.checkInData = JSON.parse(checkRaw);
    }
  } catch (e) { data.checkInData = {}; }

  // 额外数据：考试记录、学习进度、搜索历史、反馈等
  try {
    var extraPrefixes = [
      'bioquest_exam_records', 'bioquest_study_progress', 'bioquest_search_history',
      'bioquest_feedbacks', 'bioquest_guest_session', 'bioquest_device_id',
      'bioquest_card_progress', 'bioquest_daily_streak', 'bioquest_last_practice'
    ];
    for (var j = 0; j < extraPrefixes.length; j++) {
      var key = extraPrefixes[j];
      var val = localStorage.getItem(key);
      if (val !== null) {
        try {
          data.extraData[key.replace('bioquest_', '')] = JSON.parse(val);
        } catch (e2) {
          data.extraData[key.replace('bioquest_', '')] = val;
        }
      }
    }
  } catch (e) { /* 静默 */ }

  return data;
}


/**
 * 导出用户数据为 JSON 字符串并触发下载
 */
function downloadUserData() {
  var data = exportUserData();
  var jsonStr = JSON.stringify(data, null, 2);
  var blob = new Blob([jsonStr], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'bioquest_backup_' + _localDateStr() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('数据已导出');
}


/**
 * 导入用户数据
 * @param {Object|string} jsonData - JSON 数据对象或字符串
 */
function importUserData(jsonData) {
  try {
    var data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

    if (!data || typeof data !== 'object') {
      return { ok: false, error: '数据格式无效' };
    }

    var imported = { settings: false, wrongQuestions: false, favorites: false, practiceRecords: false, achievements: false, checkIn: false, password: false, extra: false };

    // 导入账号密码（游客/本地账号）
    if (data.account && data.account.password && data.account.isGuest) {
      try {
        localStorage.setItem('bioquest_guest_password', data.account.password);
        imported.password = true;
      } catch (e) {}
    }

    // 导入设置
    if (data.settings && typeof data.settings === 'object') {
      if (data.settings.theme) localStorage.setItem('bioquest-theme', data.settings.theme);
      if (data.settings.fontSize) localStorage.setItem('bioquest-fontSize', data.settings.fontSize);
      if (data.settings.questionCount != null) localStorage.setItem('bioquest-questionCount', String(data.settings.questionCount));
      if (data.settings.showTimer != null) localStorage.setItem('bioquest-showTimer', String(data.settings.showTimer));
      if (data.settings.autoSubmit != null) localStorage.setItem('bioquest-autoSubmit', String(data.settings.autoSubmit));
      // 额外设置项
      var extraSettingKeys = ['answerMode', 'showExplanation', 'soundEnabled', 'notificationEnabled'];
      for (var si = 0; si < extraSettingKeys.length; si++) {
        var sk = extraSettingKeys[si];
        if (data.settings[sk] !== undefined) {
          localStorage.setItem('bioquest-' + sk, String(data.settings[sk]));
        }
      }
      imported.settings = true;
      if (typeof restoreSettings === 'function') restoreSettings();
    }

    // 导入错题
    if (Array.isArray(data.wrongQuestions)) {
      localStorage.setItem('bioquest_wrong_questions', JSON.stringify(data.wrongQuestions));
      imported.wrongQuestions = true;
    }

    // 导入收藏
    if (Array.isArray(data.favorites)) {
      localStorage.setItem('bioquest_favorites', JSON.stringify(data.favorites));
      imported.favorites = true;
    }

    // 导入练习记录
    if (Array.isArray(data.practiceRecords)) {
      var existing = [];
      try {
        var existingRaw = localStorage.getItem('bioquest_practice_records');
        if (existingRaw) existing = JSON.parse(existingRaw);
      } catch (e) {}
      var merged = (existing || []).concat(data.practiceRecords);
      localStorage.setItem('bioquest_practice_records', JSON.stringify(merged));
      imported.practiceRecords = true;
    }

    // 导入成就
    if (Array.isArray(data.achievements)) {
      localStorage.setItem('bioquest_achievements', JSON.stringify(data.achievements));
      imported.achievements = true;
    }

    // 导入签到数据
    if (data.checkInData && typeof data.checkInData === 'object') {
      localStorage.setItem('bioquest_checkin', JSON.stringify(data.checkInData));
      imported.checkIn = true;
    }

    // 导入额外数据
    if (data.extraData && typeof data.extraData === 'object') {
      var extraKeys = Object.keys(data.extraData);
      for (var ei = 0; ei < extraKeys.length; ei++) {
        var ek = extraKeys[ei];
        try {
          localStorage.setItem('bioquest_' + ek, typeof data.extraData[ek] === 'string' ? data.extraData[ek] : JSON.stringify(data.extraData[ek]));
        } catch (e) {}
      }
      imported.extra = extraKeys.length > 0;
    }

    var count = Object.values(imported).filter(Boolean).length;
    return { ok: true, imported: imported, count: count };
  } catch (e) {
    return { ok: false, error: '导入失败：' + (e.message || '数据格式错误') };
  }
}


/**
 * 从文件选择器导入 JSON 数据
 */
function importUserDataFromFile() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      var result = importUserData(ev.target.result);
      if (result.ok) {
showToast('成功导入 ' + result.count + ' 类数据');
      } else {
showToast('导入失败：' + errText(result.error));
      }
    };
    reader.readAsText(file);
  };
  input.click();
}



/**
 * 答错时记录错题卡片
 */
async function recordWrongAnswer(question) {
  if (!_currentUser || _currentUser.isGuest || !question) return { ok: false };
  var qid = question.id || question.question_id;
  if (!qid) return { ok: false, error: '题目 ID 缺失' };

  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };

  try {
    // ts-fsrs 引擎已加载，直接调用 window.FSRS.schedule（P0-1 已修复）
    var fsrsState = { stability: 0, difficulty: 5, lastReview: 0, repetitions: 0, lapses: 0 };
    fsrsState = window.FSRS.schedule(fsrsState, window.FSRS.RATING.AGAIN, Date.now());

    var { error } = await sb.from('review_cards')
      .upsert({
        user_id: _currentUser.id,
        question_id: String(qid),
        question_text: (question.question_text || question.question || '').substring(0, 300),
        subject: question.subject || '',
        concept: question.concept || '',
        difficulty: question.difficulty || 'medium',
        stability: fsrsState.stability || 0,
        fsrs_difficulty: fsrsState.difficulty || 5,
        last_review: fsrsState.lastReview ? new Date(fsrsState.lastReview).toISOString() : null,
        repetitions: fsrsState.repetitions || 0,
        lapses: fsrsState.lapses || 0,
        due_date: fsrsState.dueDate ? new Date(fsrsState.dueDate).toISOString() : new Date().toISOString()
      }, { onConflict: 'user_id,question_id' });

    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 获取今日到期的复习题目
 */
async function getDueReviewQuestions(limit) {
  if (!_currentUser || _currentUser.isGuest) return [];
  var sb = getSupabase();
  if (!sb) return [];
  try {
    var { data, error } = await sb.from('review_cards')
      .select('*')
      .eq('user_id', _currentUser.id)
      .lte('due_date', new Date().toISOString())
      .order('due_date', { ascending: true })
      .limit(limit || 20);
    if (error) throw error;
    return data || [];
  } catch (e) {
    return [];
  }
}


/**
 * 完成一道复习题，更新 FSRS 状态
 * rating: 1=again, 2=hard, 3=good, 4=easy
 */
async function reviewQuestion(questionId, rating) {
  if (!_currentUser || _currentUser.isGuest || !questionId) return { ok: false, error: '参数错误' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };

  try {
    var { data: card, error: fetchError } = await sb.from('review_cards')
      .select('*')
      .eq('user_id', _currentUser.id)
      .eq('question_id', String(questionId))
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!card) return { ok: false, error: '未找到该错题记录' };

    var currentState = {
      stability: card.stability || 0,
      difficulty: card.fsrs_difficulty || 5,
      lastReview: card.last_review ? new Date(card.last_review).getTime() : 0,
      repetitions: card.repetitions || 0,
      lapses: card.lapses || 0
    };

    // ts-fsrs 引擎已加载，直接调用 window.FSRS.schedule（P0-1 已修复）
    var newState = window.FSRS.schedule(currentState, rating, Date.now());

    var { error } = await sb.from('review_cards')
      .update({
        stability: newState.stability,
        fsrs_difficulty: newState.difficulty,
        last_review: newState.lastReview ? new Date(newState.lastReview).toISOString() : new Date().toISOString(),
        repetitions: newState.repetitions,
        lapses: newState.lapses,
        due_date: newState.dueDate ? new Date(newState.dueDate).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', card.id);

    if (error) throw error;

    // 复习成功奖励少量信用
    var delta = await calculateEarnedPoints('practice_milestone');
    if (delta > 0) {
      await adjustUserPoints(delta, '完成错题复习', { source: 'review' });
    }

    return { ok: true, nextDue: newState.dueDate };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}



/**
 * 获取错题本列表
 */
async function getWrongQuestions(options) {
  options = options || {};
  if (!_currentUser || _currentUser.isGuest) return [];
  var sb = getSupabase();
  if (!sb) return [];
  try {
    var query = sb.from('review_cards')
      .select('*')
      .eq('user_id', _currentUser.id)
      .order('created_at', { ascending: false });
    if (options.concept) query = query.eq('concept', options.concept);
    if (options.errorReason) query = query.eq('error_reason', options.errorReason);
    if (options.limit) query = query.limit(options.limit);
    var { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (e) {
    return [];
  }
}


/**
 * 手动添加错题
 */
async function addWrongQuestion(question) {
  if (!_currentUser || _currentUser.isGuest || !question) return { ok: false, error: '未登录或数据为空' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var fsrsState = { stability: 0, difficulty: 5, lastReview: 0, repetitions: 0, lapses: 0 };
    fsrsState = window.FSRS.schedule(fsrsState, window.FSRS.RATING.AGAIN, Date.now());
    var { data, error } = await sb.from('review_cards')
      .insert({
        user_id: _currentUser.id,
        question_id: question.question_id || 'manual_' + Date.now(),
        question_text: (question.question_text || question.question || '').substring(0, 1000),
        subject: question.subject || '',
        concept: question.concept || '',
        difficulty: question.difficulty || 'medium',
        user_answer: question.user_answer || '',
        correct_answer: question.correct_answer || '',
        analysis: question.analysis || '',
        error_reason: question.error_reason || '',
        textbook_chapter: question.textbook_chapter || '',
        knowledge_graph_nodes: question.knowledge_graph_nodes || [],
        image_url: question.image_url || '',
        source: question.source || 'manual',
        stability: fsrsState.stability || 0,
        fsrs_difficulty: fsrsState.difficulty || 5,
        due_date: fsrsState.dueDate ? new Date(fsrsState.dueDate).toISOString() : new Date().toISOString()
      })
      .select()
      .single();
    if (error) throw error;
    return { ok: true, wrongQuestion: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 更新错题（主要是错误原因、分析、图片等）
 */
async function updateWrongQuestion(id, updates) {
  if (!_currentUser || _currentUser.isGuest || !id) return { ok: false, error: '参数错误' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var allowed = {};
    ['question_text', 'subject', 'concept', 'difficulty', 'user_answer', 'correct_answer',
     'analysis', 'error_reason', 'textbook_chapter', 'knowledge_graph_nodes', 'image_url'].forEach(function(k) {
      if (updates.hasOwnProperty(k)) allowed[k] = updates[k];
    });
    var { error } = await sb.from('review_cards')
      .update(allowed)
      .eq('id', id)
      .eq('user_id', _currentUser.id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 删除错题
 */
async function deleteWrongQuestion(id) {
  if (!_currentUser || _currentUser.isGuest || !id) return { ok: false, error: '参数错误' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var { error } = await sb.from('review_cards')
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
 * AI 分析错题：识别知识点、章节、错误原因、关联知识图谱
 */
async function analyzeWrongQuestionWithAI(questionText, userAnswer, correctAnswer) {
  if (!questionText) return { ok: false, error: '题目内容为空' };
  try {
    // 通过后端代理调用 AI，避免在前端暴露 API Key
    var response = await fetch('/ai-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: questionText,
        user_answer: userAnswer || '',
        correct_answer: correctAnswer || ''
      })
    });
    if (!response.ok) {
      var errBody = await response.json().catch(function() { return {}; });
      throw new Error(errBody.error || ('AI 请求失败: ' + response.status));
    }
    var result = await response.json();
    return { ok: true, analysis: result.analysis };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/**
 * 根据知识点从题库推送相关练习题
 */
async function getRelatedPracticeQuestions(concepts, limit) {
  if (!concepts || concepts.length === 0) return [];
  var sb = getSupabase();
  if (!sb) return [];
  try {
    var { data, error } = await sb.from('questions')
      .select('*')
      .or(concepts.map(function(c) { return 'concept.ilike.%' + c + '%'; }).join(','))
      .limit(limit || 5);
    if (error) throw error;
    return data || [];
  } catch (e) {
    return [];
  }
}


// 修复 dashboard.js / teacher.js 直接读取 localStorage 的问题：
// 当用户已登录时，所有统计数据优先从 Supabase 读取；未登录或离线时回退到 localStorage。

/**
 * 从 Supabase 读取用户聚合统计（dashboard._getUserStats 的远端实现）
 * 数据源：practice_records（按 module_num 聚合）+ daily_checkins（连续打卡）
 * @returns {Promise<Object|null>} 与 localStorage 'bioquest_stats' 同构的对象，失败返回 null
 */
async function getUserStatsFromSupabase() {
  if (!_currentUser || _currentUser.isGuest) return null;
  var sb = getSupabase();
  if (!sb) return null;
  try {
    // 1. 拉取近 1000 条练习记录做聚合（足够覆盖学期量级）
    var { data: records, error: rErr } = await sb.from('practice_records')
      .select('module_num, user_answers, created_at')
      .eq('profile_id', _currentUser.id)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (rErr) throw rErr;
    records = records || [];

    // 统计口径与本地 getStats 对齐：totalAnswered/correct 均为「题目级」而非「场次级」。
    // user_answers 中每项对应一道题，correct=该题全对（storage.js 统一写入）。
    var totalAnswered = 0;
    var totalCorrect = 0;
    var modules = {};
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var modKey = 'module_' + (r.module_num || 1);
      if (!modules[modKey]) modules[modKey] = { totalAnswered: 0, totalCorrect: 0 };
      var ansArr = Array.isArray(r.user_answers) ? r.user_answers : [];
      totalAnswered += ansArr.length;
      modules[modKey].totalAnswered += ansArr.length;
      for (var k = 0; k < ansArr.length; k++) {
        if (ansArr[k] && ansArr[k].correct) {
          totalCorrect++;
          modules[modKey].totalCorrect++;
        }
      }
    }

    // 2. 读取连续打卡天数（daily_checkins 按 checkin_date 倒序）
    var streak = 0;
    try {
      var { data: checkins, error: cErr } = await sb.from('daily_checkins')
        .select('checkin_date, streak_count')
        .eq('user_id', _currentUser.id)
        .order('checkin_date', { ascending: false })
        .limit(400);
      if (!cErr && checkins && checkins.length > 0) {
        // 用 streak_count 字段（取最近一条），无字段则按连续日期计算
        if (typeof checkins[0].streak_count === 'number') {
          streak = checkins[0].streak_count;
        } else {
          // 退化：按日期集合计算
          var dateSet = {};
          checkins.forEach(function (c) { dateSet[c.checkin_date] = true; });
          var today = new Date();
          today.setHours(0, 0, 0, 0);
          for (var d = 0; d < 365; d++) {
            var dt = new Date(today);
            dt.setDate(dt.getDate() - d);
            var key = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
            if (dateSet[key]) streak++;
            else if (d > 0) break;
          }
        }
      }
    } catch (e) { /* 静默 */ }

    // 3. bio_score 来自 profiles
    var bioScore = (typeof _currentUser.bio_score === 'number') ? _currentUser.bio_score : 0;

    var stats = {
      totalAnswered: totalAnswered,
      totalCorrect: totalCorrect,
      modules: modules,
      streak: streak,
      practiceCount: totalAnswered,
      bioScore: bioScore,
      source: 'supabase',
      syncedAt: Date.now()
    };

    // 写入 localStorage 缓存，便于离线/快速首屏
    try {
      localStorage.setItem('bioquest_stats', JSON.stringify(stats));
    } catch (e) {}

    return stats;
  } catch (e) {
    console.warn('[TATABOX] getUserStatsFromSupabase 失败，回退 localStorage:', e && e.message);
    return null;
  }
}


/**
 * 从 Supabase 读取练习历史（dashboard._loadPracticeHistory 的远端实现）
 * @param {number} [limit=200] - 最大返回条数
 * @returns {Promise<Array|null>} 历史记录数组（与 localStorage 格式兼容），失败返回 null
 */
async function getPracticeHistoryFromSupabase(limit) {
  if (!_currentUser || _currentUser.isGuest) return null;
  var sb = getSupabase();
  if (!sb) return null;
  limit = limit || 200;
  try {
    var { data, error } = await sb.from('practice_records')
      .select('*')
      .eq('profile_id', _currentUser.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    if (!data || data.length === 0) return [];

    // 转换为 dashboard 兼容格式（correct = 全对题数，与本地 practice 记录口径一致）
    return data.map(function (r) {
      var answers = Array.isArray(r.user_answers) ? r.user_answers : [];
      var correct = 0;
      answers.forEach(function (a) { if (a && a.correct) correct++; });
      return {
        date: r.created_at ? r.created_at.slice(0, 10) : null,
        timestamp: r.created_at ? new Date(r.created_at).getTime() : 0,
        correct: correct,
        total: answers.length || 1,
        totalQuestions: answers.length || 1,
        correctCount: correct,
        answers: answers,
        module_num: r.module_num,
        subject: r.subject,
        source: 'supabase'
      };
    });
  } catch (e) {
    console.warn('[TATABOX] getPracticeHistoryFromSupabase 失败:', e && e.message);
    return null;
  }
}


/**
 * 从 Supabase 读取打卡日志（dashboard._getStreak 的远端实现）
 * @returns {Promise<Array|null>} 打卡记录数组，失败返回 null
 */
async function getHabitLogsFromSupabase() {
  if (!_currentUser || _currentUser.isGuest) return null;
  var sb = getSupabase();
  if (!sb) return null;
  try {
    var { data, error } = await sb.from('daily_checkins')
      .select('checkin_date, streak_count, created_at')
      .eq('user_id', _currentUser.id)
      .order('checkin_date', { ascending: false })
      .limit(400);
    if (error) throw error;
    if (!data) return [];
    // 转换为 bioquest_habit_logs 兼容格式
    return data.map(function (c) {
      return {
        date: c.checkin_date,
        completed: true,
        streak: c.streak_count || 1,
        timestamp: c.created_at ? new Date(c.created_at).getTime() : 0,
        source: 'supabase'
      };
    });
  } catch (e) {
    console.warn('[TATABOX] getHabitLogsFromSupabase 失败:', e && e.message);
    return null;
  }
}


/**
 * 同步单条练习记录到 Supabase（dual-write：刷题完成时调用）
 * @param {Object} record - 练习记录
 * @param {Array} record.answers - 答题数组
 * @param {number} record.module_num - 模块号 1-4
 * @param {string} [record.subject] - 学科
 * @param {number} [record.score] - 得分
 * @param {number} [record.duration] - 用时（秒）
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function syncPracticeRecordToSupabase(record) {
  if (!_currentUser || _currentUser.isGuest || !record) return { ok: false, error: '未登录或数据为空' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var answers = Array.isArray(record.answers) ? record.answers : [];
    var correctCount = 0;
    answers.forEach(function (a) { if (a && a.correct) correctCount++; });
    var insertData = {
      profile_id: _currentUser.id,
      question_id: record.question_id || (answers[0] && answers[0].question_id) || 0,
      module_num: record.module_num || 1,
      subject: record.subject || '',
      user_answers: answers,
      score: typeof record.score === 'number' ? record.score : correctCount,
      duration: record.duration || 0,
      is_correct: answers.length > 0 ? (correctCount === answers.length) : (record.is_correct || false)
    };
    var { error } = await sb.from('practice_records').insert(insertData);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.warn('[TATABOX] syncPracticeRecordToSupabase 失败:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}


/**
 * 同步打卡记录到 Supabase（dual-write：习惯完成时调用）
 * 使用 upsert 处理 user_id + checkin_date 唯一约束
 * @param {string} dateStr - 日期 YYYY-MM-DD
 * @param {number} [streakCount] - 连续天数
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function syncHabitLogToSupabase(dateStr, streakCount) {
  if (!_currentUser || _currentUser.isGuest || !dateStr) return { ok: false, error: '未登录或日期为空' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var { error } = await sb.from('daily_checkins')
      .upsert({
        user_id: _currentUser.id,
        checkin_date: dateStr,
        streak_count: streakCount || 1
      }, { onConflict: 'user_id,checkin_date' });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.warn('[TATABOX] syncHabitLogToSupabase 失败:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}


// 数据表：user_progress (profile_id, key, data JSONB, updated_at)
// 配套迁移：sql/migration_v8_user_progress.sql
// 键值快照（如 'fsrs_cards'）整体存储，updated_at 做 Last-Write-Wins 冲突合并。

/**
 * 把单个进度键推送/合并到 Supabase（LWW）。
 * 服务端已存在且 updated_at 更新 → 跳过（远端为准）；否则插入或覆盖。
 * @param {string} key - 进度键（如 'fsrs_cards'、'stats'）
 * @param {*} data - 进度快照（JSON 可序列化）
 * @param {number} [updatedAt] - 本地更新时间戳（ms）；缺省用 now()
 * @returns {Promise<{ok: boolean, applied?: boolean, created?: boolean, error?: string}>}
 */
async function pushUserProgressToSupabase(key, data, updatedAt) {
  if (!_currentUser || _currentUser.isGuest) return { ok: false, error: '未登录' };
  if (!key) return { ok: false, error: '缺少进度键' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  var ts = typeof updatedAt === 'number' && updatedAt > 0 ? new Date(updatedAt).toISOString() : new Date().toISOString();
  try {
    // 1) 读当前远端记录（仅比较 updated_at，避免拉全量大 JSON）
    var existing = null;
    try {
      var q = sb.from('user_progress')
        .select('updated_at')
        .eq('profile_id', _currentUser.id)
        .eq('key', key)
        .maybeSingle();
      var r = await q;
      if (r.error) throw r.error;
      existing = r.data || null;
    } catch (e) {
      // maybeSingle 需要新版 supabase-js；失败静默，回退为插桩写入
    }

    var payload = { profile_id: _currentUser.id, key: key, data: data, updated_at: ts };

    if (existing) {
      var remoteMs = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      if (new Date(ts).getTime() < remoteMs) {
        // 远端更新，丢弃本地旧快照（服务端为准）
        return { ok: true, applied: false };
      }
      var up = await sb.from('user_progress')
        .update({ data: data, updated_at: ts })
        .eq('profile_id', _currentUser.id)
        .eq('key', key);
      if (up.error) throw up.error;
      return { ok: true, applied: true };
    }

    var ins = await sb.from('user_progress').insert(payload);
    if (ins.error) throw ins.error;
    return { ok: true, applied: true, created: true };
  } catch (e) {
    if (e && /duplicate|unique|already exists/i.test(e.message || '')) {
      // 并发插入撞唯一键：改为条件更新（远端较新则跳过）
      try {
        var up2 = await sb.from('user_progress')
          .update({ data: data, updated_at: ts })
          .eq('profile_id', _currentUser.id)
          .eq('key', key);
        if (up2.error) throw up2.error;
        return { ok: true, applied: true };
      } catch (e2) {
        return { ok: false, error: e2.message };
      }
    }
    console.warn('[TATABOX] pushUserProgressToSupabase 失败:', key, e && e.message);
    return { ok: false, error: e && e.message };
  }
}


/**
 * 拉取当前用户全部进度快照（或指定 key）。
 * @param {string} [key] - 可选，仅拉取该进度键
 * @returns {Promise<Array<{key:string, data:any, updated_at:number, serverUpdatedAt:string}>|null>}
 *   updated_at 为 ms 时间戳，便于与本地 LWW 比较；失败返回 null。
 */
async function pullUserProgressFromSupabase(key) {
  if (!_currentUser || _currentUser.isGuest) return null;
  var sb = getSupabase();
  if (!sb) return null;
  try {
    var query = sb.from('user_progress')
      .select('key, data, updated_at')
      .eq('profile_id', _currentUser.id);
    if (key) query = query.eq('key', key);
    var { data, error } = await query;
    if (error) throw error;
    return (data || []).map(function (row) {
      var ms = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      return { key: row.key, data: row.data, updated_at: ms, serverUpdatedAt: row.updated_at };
    });
  } catch (e) {
    console.warn('[TATABOX] pullUserProgressFromSupabase 失败:', e && e.message);
    return null;
  }
}


/**
 * 删除某个进度键（用于「重置进度」等功能）。
 */
async function deleteUserProgressFromSupabase(key) {
  if (!_currentUser || _currentUser.isGuest || !key) return { ok: false, error: '参数错误' };
  var sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase 未初始化' };
  try {
    var del = await sb.from('user_progress')
      .delete()
      .eq('profile_id', _currentUser.id)
      .eq('key', key);
    if (del.error) throw del.error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

window.exportUserData = exportUserData;

window.downloadUserData = downloadUserData;

window.importUserData = importUserData;

window.importUserDataFromFile = importUserDataFromFile;

window.pushUserProgressToSupabase = pushUserProgressToSupabase;

window.pullUserProgressFromSupabase = pullUserProgressFromSupabase;

window.deleteUserProgressFromSupabase = deleteUserProgressFromSupabase;

// 复习推送
window.recordWrongAnswer = recordWrongAnswer;
window.getDueReviewQuestions = getDueReviewQuestions;
window.reviewQuestion = reviewQuestion;

// 智能错题管理
window.getWrongQuestions = getWrongQuestions;
window.addWrongQuestion = addWrongQuestion;
window.updateWrongQuestion = updateWrongQuestion;
window.deleteWrongQuestion = deleteWrongQuestion;
window.analyzeWrongQuestionWithAI = analyzeWrongQuestionWithAI;
window.getRelatedPracticeQuestions = getRelatedPracticeQuestions;

// 用户学习数据（Supabase 优先 + localStorage 兜底）
window.getUserStatsFromSupabase = getUserStatsFromSupabase;
window.getPracticeHistoryFromSupabase = getPracticeHistoryFromSupabase;
window.getHabitLogsFromSupabase = getHabitLogsFromSupabase;
window.syncPracticeRecordToSupabase = syncPracticeRecordToSupabase;
window.syncHabitLogToSupabase = syncHabitLogToSupabase;
