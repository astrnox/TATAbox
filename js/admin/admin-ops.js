/**
 * TATABOX - 管理后台 · 运营子模块：反馈 / 申诉 / 数据同步 / 公告（Issue #17 自 admin.js 拆分）
 * 由 admin.js 的 loadTabContent 在切换到对应标签时动态注入加载。
 * 依赖：js/admin/admin.js（核心）。
 */

window.handleResolveAppeal = async function(appealId, action) {
  if (!appealId || !action) return;
  var adminNote = prompt(action === 'approve' ? '通过申诉的备注（可选）：' : '驳回申诉的原因（可选）：') || '';
  try {
    var resolveFn = (typeof window.resolveCRAppeal === 'function') ? window.resolveCRAppeal : (typeof resolveCRAppeal === 'function' ? resolveCRAppeal : null);
    if (!resolveFn) {
      showAdminToast('申诉处理功能未加载', 'error');
      return;
    }
    var result = await resolveFn(appealId, action, adminNote);
    if (result && result.ok) {
      showAdminToast(action === 'approve' ? '申诉已通过，已恢复用户信用' : '申诉已驳回', 'success');
      // 刷新当前标签
      var contentEl = document.getElementById('admin-tab-content');
      if (contentEl) renderAppealsTab(contentEl);
    } else {
      showAdminToast('处理失败：' + errText(result), 'error');
    }
  } catch (e) {
    showAdminToast('处理出错：' + e.message, 'error');
  }
};

/* ===== 反馈管理标签 ===== */
/* ===== 题目反馈（练习页「反馈」按钮 → question_feedbacks / 本地备份） ===== */

/** 32 位 FNV-1a 哈希（本地旧反馈无 id 时生成稳定处理状态键） */
function _hashKey(str) {
  var h = 2166136261;
  var s = String(str || '');
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function _qfResolvedSet() {
  try {
    var raw = localStorage.getItem('bioquest_question_feedbacks_resolved');
    var arr = raw ? JSON.parse(raw) : [];
    var set = new Set();
    if (Array.isArray(arr)) arr.forEach(function (x) { set.add(String(x)); });
    return set;
  } catch (e) {
    return new Set();
  }
}

function _qfSaveResolved(set) {
  try {
    localStorage.setItem('bioquest_question_feedbacks_resolved', JSON.stringify(Array.from(set)));
  } catch (e) { /* ignore */ }
}

/**
 * 加载并合并题目反馈：云端 question_feedbacks（跨用户需 migration_v13）
 * + 本机 localStorage 备份（同一浏览器提交必然可见）。按内容键去重。
 */
async function _loadQuestionFeedbacks() {
  var cloud = [], missing = false, restricted = false;
  try {
    var res = (typeof getQuestionFeedbacks === 'function') ? await getQuestionFeedbacks() : null;
    if (res && Array.isArray(res.items)) {
      cloud = res.items;
      missing = !!res._missing_table;
      restricted = !!res._restricted;
    }
  } catch (e) {
    console.warn('[Admin] 题目反馈云端加载失败:', e);
  }
  var local = [];
  try {
    var raw = localStorage.getItem('bioquest_question_feedbacks');
    if (raw) {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) local = arr;
    }
  } catch (e) { /* ignore */ }

  var seen = {};
  // 去重键：完整内容（描述不截断，避免同日同题的不同反馈被误合并）
  var dedupeKeyOf = function (r) {
    var t = r.created_at || r.createdAt || '';
    return [
      r.question_id || r.questionId || '',
      r.issue_type || r.issueType || '',
      String(t).slice(0, 10),
      String(r.description || '')
    ].join('|');
  };
  // 处理状态键：优先稳定 id；本地旧记录无 id 时用内容哈希（避免 String(undefined) 批量误伤）
  var uidOf = function (r, key) {
    if (r.id !== undefined && r.id !== null && r.id !== '') return String(r.id);
    return 'local:' + _hashKey(key);
  };
  var rows = [];
  cloud.forEach(function (r) {
    var key = dedupeKeyOf(r);
    seen[key] = 1;
    rows.push({
      id: r.id, uid: uidOf(r, key), src: '云端',
      question_id: r.question_id || '', question_text: r.question_text || '',
      issue_type: r.issue_type || 'other', description: r.description || '',
      created_at: r.created_at || '', user_id: r.user_id || ''
    });
  });
  local.forEach(function (r) {
    var key = dedupeKeyOf(r);
    if (seen[key]) return;
    seen[key] = 1;
    rows.push({
      id: r.id, uid: uidOf(r, key), src: '本机',
      question_id: r.questionId || '', question_text: r.questionText || '',
      issue_type: r.issueType || 'other', description: r.description || '',
      created_at: r.createdAt || '', user_id: ''
    });
  });
  rows.sort(function (a, b) {
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
  return { rows: rows, missing: missing, restricted: restricted, cloudCount: cloud.length, localCount: local.length };
}

function _questionFeedbackSectionHtml(qf, resolvedSet) {
  var typeMap = { wrong_answer: '答案有误', unclear: '题意不清', typo: '错别字', duplicate: '重复题', other: '其他' };
  var pending = qf.rows.filter(function (r) { return !resolvedSet.has(String(r.uid)); }).length;

  var badge = qf.rows.length + ' 条 · 未处理 ' + pending + '（云端 ' + qf.cloudCount + ' · 本机 ' + qf.localCount + '）';
  if (qf.missing) {
    badge += ' · 云端表未创建：请执行 sql/incremental_update.sql（本机反馈仍可见）';
  } else if (qf.restricted) {
    badge += ' · 云端读取受限：请执行 sql/migration_v13_question_feedbacks_admin.sql 开放管理员读取（本机反馈仍可见）';
  }

  var html = `
    <div class="admin-section">
      <style>
        #admin-tab-content .qf-tag{display:inline-block;padding:2px 8px;border-radius:8px;font-size:0.75rem;}
        #admin-tab-content .qf-tag--done{background:rgba(16,185,129,0.12);color:#10b981;}
        #admin-tab-content .qf-tag--pending{background:rgba(217,119,6,0.12);color:#d97706;}
        #admin-tab-content .qf-t-wrong_answer{background:rgba(192,85,58,0.12);color:#c0553a;}
        #admin-tab-content .qf-t-unclear{background:rgba(196,149,106,0.18);color:#c4956a;}
        #admin-tab-content .qf-t-typo{background:rgba(217,119,6,0.12);color:#d97706;}
        #admin-tab-content .qf-t-duplicate{background:rgba(99,102,241,0.12);color:#6366f1;}
        #admin-tab-content .qf-t-other{background:rgba(107,114,128,0.12);color:#6b7280;}
      </style>
      <div class="admin-section-header">
        <div class="admin-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          题目反馈
        </div>
        <span class="admin-section-badge">${badge}</span>
      </div>
  `;

  if (qf.rows.length === 0) {
    html += `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">暂无题目反馈</div><div class="admin-empty-hint">用户在练习页点击「反馈」提交的题目问题会显示在这里（云端 + 本机合并）。</div></div>`;
  } else {
    html += `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>状态</th>
              <th>类型</th>
              <th>题目</th>
              <th>详细描述</th>
              <th>来源</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${qf.rows.map(function (r) {
              var done = resolvedSet.has(String(r.uid));
              var tLabel = typeMap[r.issue_type] || r.issue_type || '其他';
              var tCls = typeMap[r.issue_type] ? r.issue_type : 'other';
              var stem = (r.question_text || '').slice(0, 60);
              var dateStr = r.created_at
                ? new Date(r.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '--';
              return `
                <tr>
                  <td><span class="qf-tag ${done ? 'qf-tag--done' : 'qf-tag--pending'}">${done ? '已处理' : '未处理'}</span></td>
                  <td><span class="qf-tag qf-t-${tCls}">${escapeHtml(tLabel)}</span></td>
                  <td title="${escapeHtml((r.question_text || '').slice(0, 200))}">${escapeHtml(stem || r.question_id || '--')}<br><small>${escapeHtml(r.question_id || '')}</small></td>
                  <td title="${escapeHtml(r.description || '')}">${escapeHtml((r.description || '').slice(0, 80))}${(r.description || '').length > 80 ? '…' : ''}</td>
                  <td>${r.src}</td>
                  <td>${dateStr}</td>
                  <td><button class="admin-btn admin-btn--ghost qf-toggle-btn" data-id="${escapeHtml(String(r.uid))}">${done ? '重新打开' : '标为已处理'}</button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

async function renderFeedbacksTab(container) {
  container.innerHTML = `<div class="admin-loading"><div class="admin-spinner"></div><div class="admin-loading-text">加载反馈中...</div></div>`;

  // 题目反馈先行加载（用户反馈入口放在页签最上方，避免被站点反馈淹没）
  var qf = await _loadQuestionFeedbacks();
  var qfSet = _qfResolvedSet();

  var feedbacks = [];
  var sourceLabel = '';

  // 优先从 Supabase feedbacks 表加载
  try {
    var fbData = await getFeedbacks();
    if (fbData && fbData.feedbacks && fbData.feedbacks.length > 0) {
      feedbacks = fbData.feedbacks;
      sourceLabel = '（来自 Supabase）';
    } else if (fbData && fbData._missing_table) {
      sourceLabel = '（feedbacks 表未创建，从本地加载）';
    }
  } catch (e) {
    console.warn('[Admin] 从 Supabase 加载反馈失败:', e);
  }

  // Fallback: 从 localStorage 加载
  if (feedbacks.length === 0) {
    try {
      var raw = localStorage.getItem('bioquest_feedbacks');
      if (raw) {
        var localData = JSON.parse(raw);
        if (Array.isArray(localData)) feedbacks = localData;
      }
    } catch (e) { /* ignore */ }
    if (feedbacks.length > 0 && !sourceLabel) {
      sourceLabel = '（来自本地缓存）';
    }
  }

  // 按时间倒序
  feedbacks.sort(function(a, b) {
    return new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0);
  });

  var typeMap = { bug: 'Bug 报告', feature: '功能建议', suggestion: '其他建议' };
  var typeColors = { bug: 'var(--color-error)', feature: 'var(--color-sage)', suggestion: 'var(--color-amber)' };

  var html = _questionFeedbackSectionHtml(qf, qfSet) + `
    <div class="admin-stats-row">
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--green">${ICONS.messageCircle}</div>
        <div>
          <div class="admin-stat-num">${feedbacks.length}</div>
          <div class="admin-stat-label">反馈总数</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--amber">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div>
          <div class="admin-stat-num">${feedbacks.filter(function(f) { return f.type === 'feature'; }).length}</div>
          <div class="admin-stat-label">功能建议</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--blue">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div>
          <div class="admin-stat-num">${feedbacks.filter(function(f) { return f.type === 'bug'; }).length}</div>
          <div class="admin-stat-label">Bug 报告</div>
        </div>
      </div>
    </div>

    <div class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          用户反馈
        </div>
        <span class="admin-section-badge">${feedbacks.length} 条${sourceLabel}</span>
      </div>
  `;

  if (feedbacks.length === 0) {
    html += `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">暂无用户反馈</div><div class="admin-empty-hint">用户提交的反馈会同步到 Supabase feedbacks 表，同时保留本地 localStorage 备份。</div></div>`;
  } else {
    html += `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>类型</th>
              <th>标题</th>
              <th>详细描述</th>
              <th>用户</th>
              <th>联系方式</th>
              <th>时间</th>
              <th>页面</th>
            </tr>
          </thead>
          <tbody>
            ${feedbacks.map(function(fb) {
              var tLabel = typeMap[fb.type] || fb.type;
              var tColor = typeColors[fb.type] || 'var(--text-muted)';
              var userName = fb.user ? (fb.user.username || fb.user.id || '匿名') : '访客';
              var dateStr = (fb.created_at || fb.createdAt) ? new Date(fb.created_at || fb.createdAt).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
              var urlShort = fb.url ? fb.url.replace(/^.*#/,'#') : '';
              return `
                <tr>
                  <td><span class="admin-q-tag" style="background:${tColor}15;color:${tColor};font-size:0.75rem;">${tLabel}</span></td>
                  <td style="font-weight:600;max-width:180px;" title="${escapeHtml(fb.title || '')}">${escapeHtml((fb.title || '').slice(0,30))}</td>
                  <td style="max-width:260px;color:var(--text-secondary);font-size:0.82rem;" title="${escapeHtml(fb.description || '')}">${escapeHtml((fb.description || '').slice(0,60))}${(fb.description || '').length > 60 ? '...' : ''}</td>
                  <td style="font-size:0.82rem;">${escapeHtml(userName)}</td>
                  <td style="font-size:0.82rem;color:var(--text-muted);">${escapeHtml(fb.contact || '--')}</td>
                  <td style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;">${dateStr}</td>
                  <td style="font-size:0.75rem;color:var(--text-muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(fb.url || '')}">${escapeHtml(urlShort)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;

  // 题目反馈：处理状态切换（存 localStorage，按浏览器持久）
  container.querySelectorAll('.qf-toggle-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = String(btn.getAttribute('data-id'));
      var set = _qfResolvedSet();
      if (set.has(id)) set.delete(id); else set.add(id);
      _qfSaveResolved(set);
      renderFeedbacksTab(container);
    });
  });
}

/* ===== 信用申诉管理标签 ===== */
async function renderAppealsTab(container) {
  container.innerHTML = `<div class="admin-loading"><div class="admin-spinner"></div><div class="admin-loading-text">加载申诉中...</div></div>`;

  var appeals = [];
  try {
    var fn = (typeof window.getPendingCRAppeals === 'function') ? window.getPendingCRAppeals : (typeof getPendingCRAppeals === 'function' ? getPendingCRAppeals : null);
    if (fn) appeals = await fn();
  } catch (e) {
    console.error('[Admin] 加载申诉失败:', e);
  }

  var pendingCount = appeals.filter(function(a) { return a.status === 'pending'; }).length;
  var approvedCount = appeals.filter(function(a) { return a.status === 'approved'; }).length;
  var rejectedCount = appeals.filter(function(a) { return a.status === 'rejected'; }).length;

  var html = `
    <div class="admin-stats-row">
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--amber">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div>
          <div class="admin-stat-num">${pendingCount}</div>
          <div class="admin-stat-label">待处理</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--green">${ICONS.check}</div>
        <div>
          <div class="admin-stat-num">${approvedCount}</div>
          <div class="admin-stat-label">已通过</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--red">${ICONS.x}</div>
        <div>
          <div class="admin-stat-num">${rejectedCount}</div>
          <div class="admin-stat-label">已驳回</div>
        </div>
      </div>
    </div>

    <div class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          信用申诉列表
        </div>
        <span class="admin-section-badge">${appeals.length} 条</span>
      </div>
  `;

  if (appeals.length === 0) {
    html += `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">暂无申诉记录</div><div class="admin-empty-hint">用户在被不文明检测扣分后可提交申诉，管理员复核后处理。</div></div>`;
  } else {
    html += `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>状态</th>
              <th>用户</th>
              <th>来源</th>
              <th>触发词</th>
              <th>扣分</th>
              <th>内容</th>
              <th>申诉说明</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${appeals.map(function(a) {
              var profile = a.profiles || {};
              var username = profile.username || profile.display_name || a.user_id || '未知用户';
              var statusMap = { pending: { label: '待处理', color: '#e8a830' }, approved: { label: '已通过', color: '#3a8c5c' }, rejected: { label: '已驳回', color: '#c0553a' } };
              var statusInfo = statusMap[a.status] || statusMap.pending;
              var sourceLabel = (a.source || '').indexOf('comment') !== -1 ? '评论' : '发帖';
              var dateStr = a.created_at ? new Date(a.created_at).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
              var resolvedStr = a.resolved_at ? new Date(a.resolved_at).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
              return `
                <tr data-appeal-id="${a.id}">
                  <td><span class="admin-q-tag" style="background:${statusInfo.color}15;color:${statusInfo.color};font-size:0.75rem;">${statusInfo.label}</span></td>
                  <td style="font-size:0.82rem;">${escapeHtml(username)}</td>
                  <td style="font-size:0.82rem;">${sourceLabel}</td>
                  <td style="font-size:0.82rem;color:var(--color-error);">${escapeHtml(a.detected_word || '')}</td>
                  <td style="font-size:0.82rem;font-weight:600;">${a.amount || 0}</td>
                  <td style="max-width:220px;color:var(--text-secondary);font-size:0.82rem;" title="${escapeHtml(a.content || '')}">${escapeHtml((a.content || '').slice(0,50))}${(a.content || '').length > 50 ? '...' : ''}</td>
                  <td style="max-width:180px;color:var(--text-secondary);font-size:0.82rem;" title="${escapeHtml(a.user_note || '')}">${escapeHtml((a.user_note || '').slice(0,40))}${(a.user_note || '').length > 40 ? '...' : ''}</td>
                  <td style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;">${dateStr}${resolvedStr ? '<br><span class="bq-text-muted">处理: ' + resolvedStr + '</span>' : ''}</td>
                  <td>
                    ${a.status === 'pending' ? `
                    <div class="admin-table-actions">
                      <button class="admin-btn admin-btn--primary" data-on='["handleResolveAppeal","${a.id}","approve"]'>通过</button>
                      <button class="admin-btn admin-btn--danger" data-on='["handleResolveAppeal","${a.id}","reject"]'>驳回</button>
                    </div>
                    ` : `<span style="font-size:0.78rem;color:var(--text-muted);">${a.admin_note ? escapeHtml((a.admin_note || '').slice(0,20)) : '--'}</span>`}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

/* ===== 数据同步标签 ===== */
function renderSyncTab(container) {
  container.innerHTML = `
    <div class="admin-section">
      <div class="admin-section-header">
        <h3>数据同步</h3>
        <p style="color:var(--text-secondary);font-size:14px;margin:4px 0 0;">
          将本地 JSON 数据同步到 Supabase 数据库（题目、卡片、资源）
        </p>
      </div>

      <div class="admin-stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 24px;">
        <div class="admin-stat-card">
          <div class="admin-stat-value" style="color:var(--color-sage);">自动</div>
          <div class="admin-stat-label">每30分钟自动同步</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-value" style="color:var(--color-amber);">启动时</div>
          <div class="admin-stat-label">服务器启动自动同步</div>
        </div>
      </div>

      <div style="background:var(--surface-secondary);border-radius:12px;padding:24px;margin-bottom:16px;">
        <h4 style="margin:0 0 12px;font-size:15px;">手动同步</h4>
        <p style="color:var(--text-secondary);font-size:13px;margin:0 0 16px;">
          点击按钮立即将本地数据同步到 Supabase。同步在后台执行，不会影响正常使用。
        </p>
        <button id="admin-sync-btn" class="admin-btn admin-btn-primary" style="padding:10px 24px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:6px;"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
          立即同步
        </button>
        <div id="admin-sync-status" style="margin-top:12px;font-size:13px;color:var(--text-secondary);"></div>
      </div>

      <div style="background:var(--surface-secondary);border-radius:12px;padding:24px;">
        <h4 style="margin:0 0 12px;font-size:15px;">说明</h4>
        <ul style="color:var(--text-secondary);font-size:13px;margin:0;padding-left:20px;line-height:2;">
          <li>同步会将本地 <code>data/</code> 目录下的 JSON 数据上传到 Supabase</li>
          <li>使用 <code>--force</code> 模式：先删除旧数据再插入新数据</li>
          <li>如果 Supabase 表不存在，同步会失败（需先在 Supabase SQL Editor 中执行 schema.sql）</li>
          <li>即使同步失败，网站仍可正常使用本地数据</li>
        </ul>
      </div>
    </div>
  `;

  const syncBtn = document.getElementById('admin-sync-btn');
  const syncStatus = document.getElementById('admin-sync-status');
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.textContent = '同步中...';
    syncStatus.textContent = '正在触发同步，请稍候...';
    syncStatus.style.color = 'var(--color-amber)';

    try {
      const result = await adminApiCall('POST', '/admin/sync');
      if (result.ok) {
        syncStatus.textContent = '同步已触发，后台执行中。大约需要几分钟完成。';
        syncStatus.style.color = 'var(--color-sage)';
      } else {
        syncStatus.textContent = '触发失败：' + errText(result.data.error);
        syncStatus.style.color = '#e74c3c';
      }
    } catch (e) {
      syncStatus.textContent = '网络错误：' + e.message;
      syncStatus.style.color = '#e74c3c';
    }

    syncBtn.disabled = false;
    syncBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:6px;"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>立即同步';
  });
}

/* ===== 公告管理标签 ===== */
async function renderAnnouncementsTab(container) {
  container.innerHTML = `
    <div class="admin-section-header">
      <div class="admin-section-title">公告管理</div>
      <button class="admin-section-btn" id="announcement-create-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        新建公告
      </button>
    </div>
    <div id="announcement-list">
      <div class="admin-loading"><div class="admin-spinner"></div><div class="admin-loading-text">加载中...</div></div>
    </div>
    <div id="announcement-editor" style="display:none;"></div>
  `;

  // 新建按钮
  document.getElementById('announcement-create-btn').addEventListener('click', function() {
    showAnnouncementEditor(container, null);
  });

  // 加载列表
  await refreshAnnouncementList(container);
}

async function refreshAnnouncementList(container) {
  var listEl = document.getElementById('announcement-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div><div class="admin-loading-text">加载中...</div></div>';

  try {
    var announcements = [];
    // 优先使用 adminApiCall，回退到 window.getAnnouncements
    try {
      var apiResult = await adminApiCall('GET', '/admin/announcements');
      if (apiResult.ok && apiResult.data && Array.isArray(apiResult.data.announcements)) {
        announcements = apiResult.data.announcements;
      }
    } catch (apiErr) {
      console.warn('[Admin] adminApiCall 获取公告失败，尝试 window.getAnnouncements:', apiErr);
    }
    if (announcements.length === 0 && typeof window.getAnnouncements === 'function') {
      announcements = await window.getAnnouncements({ onlyActive: false, limit: ADMIN_ANNOUNCEMENT_LIMIT });
    }

    if (!announcements || announcements.length === 0) {
      listEl.innerHTML = '<div class="admin-empty"><div class="admin-empty-icon">暂无公告</div><div class="admin-empty-text">尚未创建任何公告</div></div>';
      return;
    }

    var html = '<div style="display:flex;flex-direction:column;gap:12px;">';
    for (var i = 0; i < announcements.length; i++) {
      var a = announcements[i];
      var statusBadge = a.is_active ? '<span style="background:#3a8c5c;color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:8px;">已发布</span>' : '<span style="background:#888;color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:8px;">已下架</span>';
      var pinBadge = a.is_pinned ? '<span style="background:#e8a830;color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:8px;">置顶</span>' : '';
      var dateStr = a.created_at ? new Date(a.created_at).toLocaleString('zh-CN') : '';
      html += '<div style="background:var(--surface-secondary,#faf7f2);border:1px solid var(--border-light,#ece8e1);border-radius:12px;padding:16px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<strong style="font-size:1rem;color:var(--color-deep,#1a3a2a);">' + escapeHtml(a.title || '无标题') + '</strong>' +
            pinBadge + statusBadge +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button class="admin-announce-edit-btn" data-id="' + a.id + '" style="background:var(--color-sage,#5a7d5c);color:#fff;border:none;padding:4px 12px;border-radius:8px;cursor:pointer;font-size:0.8rem;">编辑</button>' +
            '<button class="admin-announce-delete-btn" data-id="' + a.id + '" style="background:#e53e3e;color:#fff;border:none;padding:4px 12px;border-radius:8px;cursor:pointer;font-size:0.8rem;">删除</button>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:0.85rem;color:var(--text-secondary,#6b7f74);line-height:1.6;white-space:pre-wrap;">' + escapeHtml(a.content || '').substring(0, 200) + (a.content && a.content.length > 200 ? '...' : '') + '</div>' +
        '<div style="font-size:0.75rem;color:var(--text-muted,#8a8a8a);margin-top:8px;">' + dateStr + '</div>' +
      '</div>';
    }
    html += '</div>';
    listEl.innerHTML = html;

    // 编辑按钮
    var editBtns = listEl.querySelectorAll('.admin-announce-edit-btn');
    editBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.dataset.id;
        var ann = announcements.find(function(a) { return String(a.id) === id; });
        showAnnouncementEditor(container, ann);
      });
    });

    // 删除按钮
    var deleteBtns = listEl.querySelectorAll('.admin-announce-delete-btn');
    deleteBtns.forEach(function(btn) {
      btn.addEventListener('click', async function() {
        if (!confirm('确定要删除该公告吗？此操作不可撤销。')) return;
        var id = this.dataset.id;
        var result;
        try {
          result = await adminApiCall('DELETE', '/admin/announcements/' + id);
        } catch (e) {
          result = { ok: false, error: e.message };
        }
        if (result && result.ok) {
          showToast('公告已删除');
          await refreshAnnouncementList(container);
        } else {
          showToast('删除失败：' + errText(result.error));
        }
      });
    });
  } catch (e) {
    listEl.innerHTML = '<div class="admin-empty"><div class="admin-empty-text">加载失败：' + escapeHtml(e.message || '') + '</div></div>';
  }
}

function showAnnouncementEditor(container, announcement) {
  var editorEl = document.getElementById('announcement-editor');
  var listEl = document.getElementById('announcement-list');
  if (!editorEl || !listEl) return;

  var isEdit = !!announcement;
  editorEl.style.display = 'block';
  listEl.style.display = 'none';

  editorEl.innerHTML = `
    <div style="background:var(--surface-primary,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:16px;padding:24px;">
      <h3 style="font-size:1.1rem;margin-bottom:20px;color:var(--color-deep,#1a3a2a);">${isEdit ? '编辑公告' : '新建公告'}</h3>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label style="font-size:0.85rem;color:var(--text-secondary,#6b7f74);display:block;margin-bottom:6px;">标题</label>
          <input type="text" id="announce-title" class="admin-login-input" style="width:100%;box-sizing:border-box;" value="${escapeHtml(announcement?.title || '')}" placeholder="公告标题">
        </div>
        <div>
          <label style="font-size:0.85rem;color:var(--text-secondary,#6b7f74);display:block;margin-bottom:6px;">内容</label>
          <textarea id="announce-content" class="admin-login-input" style="width:100%;box-sizing:border-box;min-height:150px;resize:vertical;font-family:inherit;" placeholder="公告内容...">${escapeHtml(announcement?.content || '')}</textarea>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;cursor:pointer;">
            <input type="checkbox" id="announce-pinned" ${announcement?.is_pinned ? 'checked' : ''}>
            置顶
          </label>
          ${isEdit ? '<label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;cursor:pointer;"><input type="checkbox" id="announce-active" ' + (announcement?.is_active ? 'checked' : '') + '> 已发布</label>' : ''}
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;">
          <button id="announce-save-btn" style="background:var(--color-sage,#5a7d5c);color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:0.9rem;">${isEdit ? '保存修改' : '发布公告'}</button>
          <button id="announce-cancel-btn" style="background:transparent;border:1px solid var(--border-light,#ece8e1);padding:10px 24px;border-radius:8px;cursor:pointer;font-size:0.9rem;color:var(--text-secondary,#6b7f74);">取消</button>
        </div>
        <p id="announce-editor-error" style="color:#e53e3e;font-size:0.85rem;display:none;"></p>
      </div>
    </div>
  `;

  document.getElementById('announce-cancel-btn').addEventListener('click', function() {
    editorEl.style.display = 'none';
    listEl.style.display = 'block';
  });

  document.getElementById('announce-save-btn').addEventListener('click', async function() {
    var title = document.getElementById('announce-title').value.trim();
    var content = document.getElementById('announce-content').value.trim();
    var isPinned = document.getElementById('announce-pinned').checked;
    var errorEl = document.getElementById('announce-editor-error');

    if (!title || !content) {
      errorEl.textContent = '标题和内容不能为空';
      errorEl.style.display = 'block';
      return;
    }

    errorEl.style.display = 'none';
    var btn = document.getElementById('announce-save-btn');
    btn.disabled = true;
    btn.textContent = '保存中...';

    var result;
    if (isEdit) {
      var updates = { title: title, content: content, is_pinned: isPinned };
      var activeCb = document.getElementById('announce-active');
      if (activeCb) updates.is_active = activeCb.checked;
      result = await window.updateAnnouncement(announcement.id, updates);
    } else {
      result = await window.createAnnouncement(title, content, isPinned);
    }

    btn.disabled = false;
    btn.textContent = isEdit ? '保存修改' : '发布公告';

    if (result.ok) {
      showToast(isEdit ? '公告已更新' : '公告已发布');
      editorEl.style.display = 'none';
      listEl.style.display = 'block';
      await refreshAnnouncementList(container);
    } else {
      errorEl.textContent = result.error || '操作失败';
      errorEl.style.display = 'block';
    }
  });
}
