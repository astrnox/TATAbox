/**
 * TATABOX — 记录 / 收藏 / 存储 / 连续打卡 / 成就面板（M-01 自 user.js 拆分）
 * ============================================================
 */
'use strict';

function renderRecordsPanel(container) {
  var records = [];
  if (typeof getRecords === 'function') {
    try {
      var raw = getRecords({ limit: 20 });
      var recData = raw && raw.data ? raw.data : raw;
      records = Array.isArray(recData) ? recData : [];
    } catch (e) {
      console.warn('[TATABOX] 获取学习记录失败:', e);
      records = [];
    }
  }

  let html = `
    <div class="user-card">
      <div class="user-card-title">学习记录</div>
      <div class="user-card-subtitle">最近 20 条练习与考试记录</div>
  `;

  if (records.length === 0) {
    // Issue #125（P3-22）：统一温暖空状态——生物主题 icon + 提示 + 行动按钮
    if (window.BioQuest && typeof window.BioQuest.emptyStateHTML === 'function') {
      html += window.BioQuest.emptyStateHTML({
        title: '暂无学习记录',
        hint: '完成一次练习或考试后，记录会自动出现在这里',
        action: { label: '去练习', onClick: function () { if (typeof navigateTo === 'function') navigateTo('/practice'); } }
      });
    } else {
      html += `
        <div class="user-empty-state">
          <p class="user-empty-state-text">暂无学习记录</p>
        </div>
      `;
    }
  } else {
    html += '<div class="user-record-list">';
    records.forEach((rec) => {
      const date = rec.date || '';
      const type = rec.module === 'exam' ? '考试' : '练习';
      const typeClass = rec.module === 'exam' ? 'user-record-type--exam' : 'user-record-type--practice';
      const totalQ = rec.totalQuestions || 0;
      const score = rec.score || 0;
      const totalScore = rec.totalScore || 0;
      const recAccuracy = totalQ > 0 ? Math.round((rec.correctCount || 0) / totalQ * 100) : 0;

      let accClass = 'user-record-accuracy--low';
      if (recAccuracy >= 80) accClass = 'user-record-accuracy--good';
      else if (recAccuracy >= 60) accClass = 'user-record-accuracy--mid';

      html += `
        <div class="user-record-item">
          <div class="user-record-left">
            <span class="user-record-date">${date}</span>
            <span class="user-record-type ${typeClass}">${type}</span>
            <span class="user-record-info">${totalQ} 题</span>
            <span class="user-record-info">${score} / ${totalScore} 分</span>
          </div>
          <span class="user-record-accuracy ${accClass}">${recAccuracy}%</span>
        </div>
      `;
    });
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function renderFavoritesPanel(container) {
  var favIds = [];
  if (typeof getFavorites === 'function') {
    try {
      var rawFav = getFavorites();
      var favData = rawFav && rawFav.data ? rawFav.data : rawFav;
      favIds = Array.isArray(favData) ? favData : [];
    } catch (e) {
      console.warn('[TATABOX] 获取收藏列表失败:', e);
      favIds = [];
    }
  }

  // 构建题目ID→题目文本的映射
  var questionMap = {};
  // 从错题本中查找
  var wrongQuestions = [];
  if (typeof getWrongQuestions === 'function') {
    try {
      var rawWrong = getWrongQuestions();
      var wrongData = rawWrong && rawWrong.data ? rawWrong.data : rawWrong;
      wrongQuestions = Array.isArray(wrongData) ? wrongData : [];
    } catch (e) {
      console.warn('[TATABOX] 获取错题列表失败:', e);
      wrongQuestions = [];
    }
  }
  wrongQuestions.forEach(function(w) {
    try {
      // 错题可能有多种结构: {qId, questionText} 或 {id, text} 或 {questionId, question}
      var qid = w.qId || w.id || w.questionId;
      var qtext = w.questionText || w.text || w.question || '';
      if (qid && qtext) {
        questionMap[String(qid)] = qtext;
      }
    } catch (e) { /* skip malformed entry */ }
  });
  // 从练习记录中查找
  var records = [];
  if (typeof getRecords === 'function') {
    try {
      var rawRec = getRecords();
      var recData = rawRec && rawRec.data ? rawRec.data : rawRec;
      records = Array.isArray(recData) ? recData : [];
    } catch (e) {
      console.warn('[TATABOX] 获取记录列表(收藏映射)失败:', e);
      records = [];
    }
  }
  records.forEach(function(r) {
    try {
      var questions = r.questions || r.questionList || [];
      if (!Array.isArray(questions)) return;
      questions.forEach(function(q) {
        if (!q || typeof q !== 'object') return;
        // 记录中的题目可能有多种结构:
        // {id, text}, {questionId, questionText}, {qId, question}, {id, question}, {question: "text"} (question 本身就是 ID)
        var qid = q.id || q.qId || q.questionId || q.question || '';
        var qtext = q.text || q.questionText || q.question || q.stem || '';
        if (qid) {
          qid = String(qid);
          // 如果 qtext 和 qid 相同，说明 question 字段就是 ID，不是文本——不存入映射
          if (qtext && qtext !== qid && !questionMap[qid]) {
            questionMap[qid] = qtext;
          }
        }
      });
    } catch (e) { /* skip malformed record */ }
  });

  let html = `
    <div class="user-card">
      <div class="user-card-title">收藏夹</div>
      <div class="user-card-subtitle">收藏的题目列表</div>
  `;

  if (favIds.length === 0) {
    // Issue #125（P3-22）：统一温暖空状态——生物主题 icon + 提示 + 行动按钮
    if (window.BioQuest && typeof window.BioQuest.emptyStateHTML === 'function') {
      html += window.BioQuest.emptyStateHTML({
        title: '暂无收藏题目',
        hint: '练习或浏览题库时点击「收藏」，题目就会出现在这里',
        action: { label: '去练习', onClick: function () { if (typeof navigateTo === 'function') navigateTo('/practice'); } }
      });
    } else {
      html += `
        <div class="user-empty-state">
          <p class="user-empty-state-text">暂无收藏题目</p>
        </div>
      `;
    }
  } else {
    html += '<div class="user-fav-list">';

    html += `
      <div class="user-fav-group">
        <div class="user-fav-group-title">全部收藏 (${favIds.length}题)</div>
    `;

    favIds.forEach(function(id) {
      var displayText = questionMap[id] || id;
      var shortText = displayText.length > 80 ? displayText.slice(0, 80) + '...' : displayText;
      html += `
        <div class="user-fav-item">
          <span class="user-fav-id" title="${escapeHtml ? escapeHtml(displayText) : displayText}">${escapeHtml ? escapeHtml(shortText) : shortText}</span>
          <button class="user-fav-go-btn" data-fav-go="${id}">去练习</button>
        </div>
      `;
    });

    html += '</div></div>';
  }

  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('[data-fav-go]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (typeof navigateTo === 'function') {
        navigateTo('/practice');
      }
    });
  });
}

function renderStorageInfo(container) {
  let usage;
  if (typeof getStorageUsage === 'function') {
    usage = getStorageUsage();
  }
  if (!usage || typeof usage !== 'object') {
    usage = { used: 0, available: 5 * 1024 * 1024 };
  }

  const usedKB = ((usage.used || 0) / 1024).toFixed(1);
  const availableKB = ((usage.available || 5 * 1024 * 1024) / 1024).toFixed(0);
  const percent = Math.min(100, ((usage.used || 0) / (usage.available || 5 * 1024 * 1024)) * 100);
  const percentStr = percent.toFixed(1);

  container.innerHTML = `
    <div class="user-card">
      <div class="user-card-title">存储用量</div>
      <div class="user-card-subtitle">本地存储空间使用情况</div>
      <div class="user-storage-info">
        <div class="user-storage-text">已用: ${usedKB} KB / 可用: ${availableKB} KB</div>
        <div class="user-storage-bar">
          <div class="user-storage-fill" style="width:${percentStr}%"></div>
        </div>
        <div class="user-storage-text">${percentStr}% 已使用</div>
      </div>
    </div>
  `;
}

function refreshAllData() {
  const recordsContainer = document.getElementById('userRecordsContainer');
  if (recordsContainer) renderRecordsPanel(recordsContainer);

  const favContainer = document.getElementById('userFavoritesContainer');
  if (favContainer) renderFavoritesPanel(favContainer);

  const storageContainer = document.getElementById('userStorageContainer');
  if (storageContainer) renderStorageInfo(storageContainer);
}

async function renderStreakPanel(container) {
  container.innerHTML = '<div class="user-card"><div class="user-card-title">学习打卡</div><div class="user-card-subtitle">坚持学习，不断进步</div><div style="text-align:center;padding:20px;">加载中...</div></div>';

  var data = await (typeof getCheckInData === 'function' ? getCheckInData() : Promise.resolve({ current_streak: 0, longest_streak: 0, total_checkins: 0, calendar: [] }));

  // 统一使用本地时区日期（与 recordDailyCheckIn/getCheckInData 的 _localDateStr 一致），
  // 避免 toISOString() 的 UTC 日期导致「今日已打卡」判断与日历错位。
  var today = _localDateStrP(new Date());
  var checkedToday = data.last_checkin === today;

  // Build 30-day calendar
  var calHtml = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin:16px 0;">';
  for (var i = 29; i >= 0; i--) {
    var d = new Date(Date.now() - i * 86400000);
    var dateStr = _localDateStrP(d);
    var isChecked = data.calendar && data.calendar.some(function(c) { return c.checkin_date === dateStr; });
    var isToday = dateStr === today;
    var bg = isChecked ? 'var(--color-sage,#3a8c5c)' : 'var(--border-light,#ece8e1)';
    var border = isToday ? '2px solid var(--color-sage,#3a8c5c)' : 'none';
    calHtml += '<div title="' + dateStr + '" style="width:20px;height:20px;border-radius:4px;background:' + bg + ';border:' + border + ';"></div>';
  }
  calHtml += '</div>';

  container.innerHTML = '<div class="user-card">' +
    '<div class="user-card-title">学习打卡</div>' +
    '<div class="user-card-subtitle">坚持学习，不断进步</div>' +
    '<div style="display:flex;align-items:center;gap:24px;margin-bottom:16px;">' +
      '<div style="text-align:center;">' +
        '<div style="display:inline-flex;align-items:center;justify-content:center;width:2.5rem;height:2.5rem;border-radius:50%;background:#ff6b35;color:#fff;font-size:1rem;font-weight:700;">' + (data.current_streak || 0) + '</div>' +
        '<div style="font-size:2rem;font-weight:700;color:var(--color-deep,#1a3a2a);">' + (data.current_streak || 0) + '</div>' +
        '<div style="font-size:0.75rem;color:var(--text-muted,#8a8a8a);">天连续打卡</div>' +
      '</div>' +
      '<div class="bq-flex-1">' +
        '<div style="font-size:0.85rem;color:var(--text-secondary,#555);margin-bottom:4px;">累计打卡 <strong>' + (data.total_checkins || 0) + '</strong> 天</div>' +
        '<div style="font-size:0.85rem;color:var(--text-secondary,#555);">最长连续 <strong>' + (data.longest_streak || 0) + '</strong> 天</div>' +
      '</div>' +
    '</div>' +
    calHtml +
    (checkedToday ?
      '<div style="text-align:center;font-size:0.85rem;color:var(--color-sage,#3a8c5c);font-weight:600;">今日已打卡</div>' :
      '<button id="userCheckInBtn" style="display:block;margin:0 auto;padding:10px 32px;background:#3a8c5c;color:#fff;border:none;border-radius:16px;cursor:pointer;font-size:0.9rem;font-weight:600;">立即打卡</button>'
    ) +
  '</div>';

  var checkInBtn = document.getElementById('userCheckInBtn');
  if (checkInBtn) {
    checkInBtn.addEventListener('click', async function() {
      checkInBtn.textContent = '打卡中...';
      checkInBtn.disabled = true;
      var result = await (typeof recordDailyCheckIn === 'function' ? recordDailyCheckIn() : Promise.resolve(null));
      if (result) {
        renderStreakPanel(container);
      } else {
        // 游客没有云端账号，无法写入云端打卡表，给出友好提示
        var isGuest = false;
        try { isGuest = !!(window.getCurrentUser && window.getCurrentUser() && window.getCurrentUser().isGuest); } catch (e) {}
        checkInBtn.textContent = isGuest ? '游客暂不支持云端打卡，请注册登录后使用' : '打卡失败，重试';
        checkInBtn.disabled = false;
      }
    });
  }
}

// 本地时区日期字符串 YYYY-MM-DD（与 supabase-client 的 _localDateStr 一致）
function _localDateStrP(date) {
  date = date || new Date();
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

async function renderAchievementsPanel(container) {
  container.innerHTML = '<div class="user-card"><div class="user-card-title">成就徽章</div><div class="user-card-subtitle">收集徽章，记录成长</div><div style="text-align:center;padding:20px;">加载中...</div></div>';

  var earned = await (typeof getUserAchievements === 'function' ? getUserAchievements() : Promise.resolve([]));
  var all = typeof getAllAchievements === 'function' ? getAllAchievements() : {};
  var tiers = typeof getAchievementTiers === 'function' ? getAchievementTiers() : {};
  var categories = typeof getAchievementCategories === 'function' ? getAchievementCategories() : {};

  var earnedKeys = {};
  (earned || []).forEach(function(e) { earnedKeys[e.achievement_key] = e; });

  var earnedCount = Object.keys(earnedKeys).length;
  var totalCount = Object.keys(all).length;

  // 按段位统计
  var tierStats = {};
  for (var tierKey in tiers) { tierStats[tierKey] = 0; }
  for (var k in all) {
    var a = all[k];
    var tier = a.tier || 'iron';
    if (earnedKeys[k]) tierStats[tier] = (tierStats[tier] || 0) + 1;
  }

  // 段位进度条
  var tierBarHtml = '<div style="display:flex;gap:4px;margin-bottom:16px;">';
  var tierOrder = ['iron','bronze','silver','gold','platinum','diamond','master','challenger'];
  tierOrder.forEach(function(tk) {
    var t = tiers[tk];
    if (!t) return;
    var hasAny = tierStats[tk] > 0;
    tierBarHtml += '<div title="' + t.label + '" style="flex:1;height:6px;border-radius:2px;background:' + (hasAny ? t.color : 'var(--border-light,#ece8e1)') + ';transition:background 0.3s;"></div>';
  });
  tierBarHtml += '</div>';

  // 按分类展示
  var html = '<div class="user-card">' +
    '<div class="user-card-title">成就徽章</div>' +
    '<div class="user-card-subtitle">已获得 ' + earnedCount + '/' + totalCount + '</div>' +
    tierBarHtml;

  // 遍历每个分类
  var catOrder = ['journey','persistence','mastery','conquest','precision','community','exam'];
  catOrder.forEach(function(catKey) {
    var cat = categories[catKey];
    if (!cat) return;

    // 收集该分类下的成就
    var catAchievements = [];
    for (var ak in all) {
      if (all[ak].category === catKey) {
        catAchievements.push({ key: ak, ...all[ak] });
      }
    }
    if (catAchievements.length === 0) return;

    // 按段位排序
    catAchievements.sort(function(a, b) {
      var oa = tiers[a.tier] ? tiers[a.tier].order : 0;
      var ob = tiers[b.tier] ? tiers[b.tier].order : 0;
      return oa - ob;
    });

    html += '<div style="margin-top:16px;margin-bottom:8px;font-size:0.85rem;font-weight:600;color:var(--text-secondary,#555);">' +
      cat.icon + ' ' + cat.name + '</div>';

    html += '<div style="display:flex;flex-wrap:wrap;gap:10px;">';
    catAchievements.forEach(function(ach) {
      var isEarned = !!earnedKeys[ach.key];
      var tierInfo = tiers[ach.tier] || tiers.iron;
      var borderColor = isEarned ? tierInfo.color : 'transparent';
      var earnedDate = isEarned ? new Date(earnedKeys[ach.key].created_at).toLocaleDateString('zh-CN') : '';

      // 手绘徽章（badge-motifs.js）：SVG 内部已区分已获得/未解锁配色，
      // 未加载时兜底为原文字 icon + 外层灰度滤镜
      var badgeInner = null;
      if (typeof window.renderBadgeSvg === 'function') {
        try { badgeInner = window.renderBadgeSvg(ach.key, { size: 34, earned: isEarned }); } catch (e) { badgeInner = null; }
      }
      var useSvg = (badgeInner !== null);
      var opacity = useSvg ? '1' : (isEarned ? '1' : '0.25');
      var iconCell = useSvg
        ? '<div style="line-height:1;border:2px solid ' + borderColor + ';border-radius:8px;padding:4px;background:' + (isEarned ? 'rgba(255,255,255,0.05)' : 'transparent') + ';">' + badgeInner + '</div>'
        : '<div style="font-size:1.6rem;line-height:1;border:2px solid ' + borderColor + ';border-radius:8px;padding:4px;background:' + (isEarned ? 'rgba(255,255,255,0.05)' : 'transparent') + ';">' + ach.icon + '</div>';

      html += '<div title="' + (isEarned ?
        ach.name + ' · ' + tierInfo.label + ' · ' + ach.desc + ' · ' + earnedDate :
        ach.name + ' · ' + tierInfo.label + ' · ' + ach.desc + ' · 未解锁') + '" style="display:flex;flex-direction:column;align-items:center;width:60px;opacity:' + opacity + ';transition:all 0.2s;cursor:default;' +
        ((isEarned || useSvg) ? '' : 'filter:grayscale(1);') + '">' +
        iconCell +
        '<div style="font-size:0.6rem;text-align:center;margin-top:3px;color:' + (isEarned ? tierInfo.color : 'var(--text-muted,#8a8a8a)') + ';line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:56px;font-weight:' + (isEarned ? '600' : '400') + ';">' + ach.name + '</div>' +
      '</div>';
    });
    html += '</div>';
  });

  html += '</div>';
  container.innerHTML = html;
}

window.renderRecordsPanel = renderRecordsPanel;
window.renderFavoritesPanel = renderFavoritesPanel;
window.renderStorageInfo = renderStorageInfo;
window.refreshAllData = refreshAllData;
window.renderAchievementsPanel = renderAchievementsPanel;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.user = BQ.user || {};
  BQ.user.panels = { renderRecordsPanel: renderRecordsPanel, renderFavoritesPanel: renderFavoritesPanel, renderStorageInfo: renderStorageInfo, refreshAllData: refreshAllData, renderAchievementsPanel: renderAchievementsPanel };
})();
