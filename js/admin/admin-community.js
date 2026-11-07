/**
 * TATABOX - 管理后台 · 社区管理子模块（Issue #17 自 admin.js 拆分）
 * 由 admin.js 的 loadTabContent 在切换到「社区管理」标签时动态注入加载。
 * 依赖：js/admin/admin.js（核心）。
 */

/* ===== 社区管理标签 ===== */
let _adminCommunityPostPage = 1;
let _adminCommunityPostSearch = '';

// CSP-safe 包装：关闭最近的 admin-modal-overlay 弹窗（供 data-on 委托调用，this 为触发元素）
window._cspRemoveOverlay = function () {
  var overlay = this.closest('.admin-modal-overlay');
  if (overlay) overlay.remove();
};

async function renderCommunityTab(container) {
  let postsData, mutesData, reportsData, loadError = '', fallbackSource = '';
  try {
    [postsData, mutesData, reportsData] = await Promise.all([
      getCommunityPosts({ page: _adminCommunityPostPage, search: _adminCommunityPostSearch }),
      getCommunityMutes(),
      getCommunityReports()
    ]);
  } catch (e) {
    loadError = e && e.message ? e.message : '加载失败';
    console.error('[Admin] 社区数据加载异常:', e);
  }

  let posts = (postsData && postsData.posts) || [];
  let totalPosts = (postsData && postsData.total) || 0;

  // 兜底：如果通过管理员 API 路径拿不到帖子（认证状态异常等），直接用 anon REST 查询公开表
  if (posts.length === 0 && !loadError) {
    try {
      var directResult = await adminFetchRest('GET', 'community_posts', 'select=*&order=created_at.desc&limit=' + ADMIN_LIST_LIMIT, null);
      if (directResult.ok && Array.isArray(directResult.data) && directResult.data.length > 0) {
        posts = directResult.data;
        totalPosts = directResult.data.length;
        fallbackSource = 'anon-direct';

      }
    } catch (e2) {
      console.error('[Admin] anon 直连也失败:', e2);
    }
  }

  window._adminCurrentPosts = posts; // 保存当前帖子列表供详情视图使用
  var postPage = (postsData && postsData.page) || 1;
  var postPerPage = (postsData && postsData.per_page) || 20;
  var postTotalPages = Math.ceil(totalPosts / postPerPage);

  var mutes = (mutesData && mutesData.mutes) || [];
  var reports = (reportsData && reportsData.reports) || [];

  let html = `
    <div class="admin-stats-row">
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--green">${ICONS.messageCircle}</div>
        <div>
          <div class="admin-stat-num">${totalPosts}</div>
          <div class="admin-stat-label">帖子总数</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--amber">${ICONS.users}</div>
        <div>
          <div class="admin-stat-num">${mutes.length}</div>
          <div class="admin-stat-label">禁言用户</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--blue">${ICONS.shield}</div>
        <div>
          <div class="admin-stat-num">${reports.length}</div>
          <div class="admin-stat-label">待处理举报</div>
        </div>
      </div>
    </div>

    <div class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-title">
          ${ICONS.messageCircle}
          帖子管理
        </div>
        <span class="admin-section-badge">${totalPosts} 帖</span>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center;">
        <div style="flex:1;min-width:200px;position:relative;">
          <input type="text" class="admin-form-input" id="admin-community-search" placeholder="搜索帖子内容..." value="${_adminCommunityPostSearch}" style="padding-left:36px;">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);">${ICONS.search}</span>
        </div>
      </div>
  `;

  if (loadError) {
    html += `<div class="admin-empty bq-text-error"><div class="admin-empty-icon">${ICONS.shield}</div><div class="admin-empty-text">加载失败：${escapeHtml(loadError)}</div><div style="font-size:0.82rem;color:var(--text-muted);margin-top:8px;">请确认已登录 Supabase 且 user_group 设为 admin</div></div>`;
  } else if (posts.length === 0) {
    html += `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">Supabase 中暂无帖子</div><div style="font-size:0.82rem;color:var(--text-muted);margin-top:8px;">提示：所有用户帖子都从 Supabase 加载，不会再从本地 JSON 读取 AI 种子帖</div></div>`;
  } else {
    html += `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>作者</th>
              <th>内容</th>
              <th>标签</th>
              <th>点赞</th>
              <th>评论数</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${posts.map(post => {
              // P0-3 修复：所有用户可控字段渲染前必须 escapeHtml（存储型 XSS 防线）
              const rawContent = post.content || '';
              const contentPreview = rawContent.length > 60 ? rawContent.slice(0, 60) + '...' : rawContent;
              const tags = Array.isArray(post.tags) ? post.tags : [];
              const isPinned = post.pinned || post.is_pinned || false;
              const isDeleted = post.is_deleted || false;
              const likeCount = post.like_count !== undefined ? post.like_count : (post.likes || 0);
              const commentCount = post.comment_count !== undefined ? post.comment_count : (post.comments || 0);
              // P0-3 修复：onclick 内联参数一律先转义/数值化，杜绝引号逃逸注入（与 data-post-id 一致）
              const postIdJs = escapeHtml(post.id);
              const likeCountNum = Number(likeCount) || 0;
              const commentCountNum = Number(commentCount) || 0;
              const authorName = post.author_name || post.author || post.username || '';
              return `
                <tr data-post-id="${escapeHtml(post.id)}" style="${isDeleted ? 'opacity:0.5;background:rgba(192,85,58,0.04);' : ''}">
                  <td class="admin-table-name">${escapeHtml(authorName)}</td>
                  <td style="max-width:240px;color:var(--text-secondary,#4a4a4a);font-size:0.82rem;" title="${escapeHtml(rawContent)}">${escapeHtml(contentPreview)}</td>
                  <td>
                    ${tags.map(t => `<span class="admin-q-tag admin-q-tag--module" style="margin:1px;">${escapeHtml(t)}</span>`).join('')}
                    ${isPinned ? '<span class="admin-q-tag" style="background:rgba(196,149,106,0.12);color:var(--color-amber,#c4956a);margin:1px;">置顶</span>' : ''}
                    ${isDeleted ? '<span class="admin-q-tag" style="background:rgba(192,85,58,0.12);color:var(--color-error,#c0553a);margin:1px;">已删除</span>' : ''}
                  </td>
                  <td style="font-family:var(--font-mono,monospace);font-weight:600;color:var(--color-sage,#5a7d5c);cursor:pointer;" title="点击修改点赞数" data-on='["handleEditPostStat","${postIdJs}","like_count",${likeCountNum}]'>${likeCountNum}<span style="font-size:0.65rem;color:#999;margin-left:2px;">✎</span></td>
                  <td style="font-family:var(--font-mono,monospace);cursor:pointer;" title="点击修改评论数" data-on='["handleEditPostStat","${postIdJs}","comment_count",${commentCountNum}]'>${commentCountNum}<span style="font-size:0.65rem;color:#999;margin-left:2px;">✎</span></td>
                  <td style="font-size:0.78rem;color:var(--text-muted,#8a8a8a);white-space:nowrap;">${post.created_at ? new Date(post.created_at).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}</td>
                  <td>
                    <div class="admin-table-actions">
                      <button class="admin-btn admin-btn--ghost" data-on='["handleViewPostDetail","${postIdJs}"]'>
                        详情
                      </button>
                      <button class="admin-btn ${isPinned ? 'admin-btn--ghost' : 'admin-btn--primary'}" data-on='["handleTogglePin","${postIdJs}",${isPinned ? 'true' : 'false'}]'>
                        ${isPinned ? '取消置顶' : '置顶'}
                      </button>
                      <button class="admin-btn admin-btn--primary" data-on='["handleManagePostComments","${postIdJs}"]'>
                        评论
                      </button>
                      <button class="admin-btn admin-btn--danger" data-on='["handleDeleteCommunityPost","${postIdJs}"]'>
                        ${ICONS.trash}
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    if (postTotalPages > 1) {
      html += `<div style="display:flex;justify-content:center;gap:8px;margin-top:20px;align-items:center;">`;
      html += `<button class="admin-btn admin-btn--ghost" data-on='["adminGoCommunityPostPage",${postPage - 1}]' ${postPage <= 1 ? 'disabled' : ''}>上一页</button>`;
      html += `<span style="color:var(--text-muted);font-size:0.85rem;">第 ${postPage} / ${postTotalPages} 页</span>`;
      html += `<button class="admin-btn admin-btn--ghost" data-on='["adminGoCommunityPostPage",${postPage + 1}]' ${postPage >= postTotalPages ? 'disabled' : ''}>下一页</button>`;
      html += `</div>`;
    }
  }

  html += '</div>';

  // 禁言管理
  html += `
    <div class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-title">
          ${ICONS.shield}
          禁言管理
        </div>
        <button class="admin-btn admin-btn--primary" data-on='["openMuteModal"]'>
          ${ICONS.plus}
          添加禁言
        </button>
      </div>
  `;

  if (mutes.length === 0) {
    html += `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.shield}</div><div class="admin-empty-text">暂无禁言用户</div></div>`;
  } else {
    html += `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>用户</th>
              <th>原因</th>
              <th>过期时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${mutes.map(mute => {
              const expiresAt = mute.expires_at || mute.expire_at || mute.expiry || '';
              const isPermanent = expiresAt === '永久' || expiresAt === 'permanent' || mute.duration_hours === 0 || mute.is_permanent;
              // P0-3 修复：username 为用户可控字段，渲染与 onclick 均需转义
              const muteKey = escapeHtml(mute.user_id || mute.username || '');
              const muteName = escapeHtml(mute.username || mute.user_id || '');
              return `
                <tr data-mute-user-id="${muteKey}">
                  <td class="admin-table-name">${muteName}</td>
                  <td style="color:var(--text-secondary,#4a4a4a);">${escapeHtml(mute.reason || '')}</td>
                  <td style="font-size:0.82rem;color:${isPermanent ? 'var(--color-error,#c0553a)' : 'var(--text-muted,#8a8a8a)'};">
                    ${isPermanent ? '永久' : (expiresAt ? new Date(expiresAt).toLocaleString('zh-CN') : '--')}
                  </td>
                  <td>
                    <div class="admin-table-actions">
                      <button class="admin-btn admin-btn--ghost" data-on='["handleUnmuteUser","${muteKey}"]'>
                        解除禁言
                      </button>
                    </div>
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

  // 举报管理
  html += `
    <div class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-title">
          ${ICONS.shield}
          举报管理
        </div>
        <span class="admin-section-badge">${reports.length} 条举报</span>
      </div>
  `;

  if (reportsData && reportsData._missing_table) {
    html += `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.shield}</div><div class="admin-empty-text">举报数据暂时不可用</div><div style="font-size:0.82rem;color:var(--text-muted);margin-top:8px;">数据服务尚未初始化或当前账号无读取权限，请联系维护者（详情见浏览器控制台 F12）。</div></div>`;
  } else if (reports.length === 0) {
    html += `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.shield}</div><div class="admin-empty-text">暂无举报</div></div>`;
  } else {
    // 按 post_id 分组，显示每篇被举报的帖子
    var reportsByPost = {};
    reports.forEach(function(r) {
      var pid = r.post_id;
      if (!reportsByPost[pid]) reportsByPost[pid] = [];
      reportsByPost[pid].push(r);
    });

    html += `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>帖子 ID</th>
              <th>举报次数</th>
              <th>举报原因</th>
              <th>举报时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${Object.keys(reportsByPost).map(pid => {
              var postReports = reportsByPost[pid];
              var reasons = postReports.map(r => escapeHtml(r.reason || '(无)')).join('<br>');
              var times = postReports.map(r => r.created_at ? new Date(r.created_at).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '--').join('<br>');
              return `
                <tr data-post-id="${escapeHtml(pid)}">
                  <td style="font-family:var(--font-mono,monospace);font-size:0.78rem;color:var(--text-muted);">${escapeHtml(pid.substring(0, 8))}...</td>
                  <td><span class="admin-q-tag" style="background:rgba(192,85,58,0.12);color:var(--color-error);">${postReports.length}</span></td>
                  <td style="max-width:300px;color:var(--text-secondary);font-size:0.82rem;">${reasons}</td>
                  <td style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;">${times}</td>
                  <td>
                    <div class="admin-table-actions">
                      <button class="admin-btn admin-btn--ghost" data-on='["handleDismissReport","${escapeHtml(pid)}"]'>
                        驳回举报
                      </button>
                      <button class="admin-btn admin-btn--danger" data-on='["handleDeleteReportedPost","${escapeHtml(pid)}"]'>
                        ${ICONS.trash}
                        删除帖子
                      </button>
                    </div>
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

  // 禁言弹窗
  html += `
    <div class="admin-modal-overlay" id="admin-mute-modal" style="display:none;">
      <div class="admin-modal">
        <div class="admin-modal-header">
          <div class="admin-modal-title">添加禁言</div>
          <button class="admin-modal-close" data-on='["closeMuteModal"]'>&times;</button>
        </div>
        <form id="admin-mute-form" class="admin-form-grid">
          <div class="admin-form-group full">
            <label class="admin-form-label">用户 ID / 用户名</label>
            <input type="text" class="admin-form-input" id="mute-user-id" placeholder="输入用户 ID 或用户名" required>
          </div>
          <div class="admin-form-group full">
            <label class="admin-form-label">禁言原因</label>
            <input type="text" class="admin-form-input" id="mute-reason" placeholder="输入禁言原因" required>
          </div>
          <div class="admin-form-group full">
            <label class="admin-form-label">禁言时长</label>
            <select class="admin-form-select" id="mute-duration" required>
              <option value="1">1 小时</option>
              <option value="6">6 小时</option>
              <option value="24">24 小时</option>
              <option value="168">7 天</option>
              <option value="0">永久</option>
            </select>
          </div>
          <div class="admin-form-group full">
            <button type="submit" class="admin-form-submit" id="mute-submit-btn">确认禁言</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 帖子数据编辑弹窗 -->
    <div class="admin-modal-overlay" id="admin-post-stat-modal" style="display:none;">
      <div class="admin-modal" style="max-width:420px;">
        <div class="admin-modal-header">
          <div class="admin-modal-title" id="admin-post-stat-title">编辑帖子数据</div>
          <button class="admin-modal-close" data-on='["closePostStatModal"]'>&times;</button>
        </div>
        <form id="admin-post-stat-form" class="admin-form-grid">
          <div class="admin-form-group full">
            <label class="admin-form-label" id="admin-post-stat-label">数值</label>
            <input type="number" class="admin-form-input" id="admin-post-stat-value" min="0" step="1" required>
            <input type="hidden" id="admin-post-stat-post-id">
            <input type="hidden" id="admin-post-stat-field">
          </div>
          <div class="admin-form-group full">
            <button type="submit" class="admin-form-submit" id="admin-post-stat-submit">保存</button>
          </div>
        </form>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // 提示种子数据来源
  if (fallbackSource) {
    showToast(fallbackSource);
  }

  // 搜索事件
  const searchInput = document.getElementById('admin-community-search');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      _adminCommunityPostSearch = searchInput.value.trim();
      _adminCommunityPostPage = 1;
      await renderCommunityTab(container);
    }, 300);
  });

  // 禁言表单提交
  const muteForm = document.getElementById('admin-mute-form');
  muteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('mute-submit-btn');
    const userId = document.getElementById('mute-user-id').value.trim();
    const reason = document.getElementById('mute-reason').value.trim();
    const durationHours = parseInt(document.getElementById('mute-duration').value);

    if (!userId || !reason) {
      showAdminToast('请填写用户和原因', 'error');
      return;
    }

    submitBtn.textContent = '处理中...';
    submitBtn.disabled = true;

    const result = await muteCommunityUser(userId, reason, durationHours);
    if (result) {
      showAdminToast('禁言成功', 'success');
      closeMuteModal();
      await renderCommunityTab(container);
    } else {
      showAdminToast('禁言失败，请重试', 'error');
      submitBtn.textContent = '确认禁言';
      submitBtn.disabled = false;
    }
  });

  // 帖子数据编辑表单提交（先移除旧监听器避免重复绑定）
  const postStatForm = document.getElementById('admin-post-stat-form');
  if (postStatForm) {
    const newForm = postStatForm.cloneNode(true);
    postStatForm.parentNode.replaceChild(newForm, postStatForm);
    newForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('admin-post-stat-submit');
      const postId = document.getElementById('admin-post-stat-post-id').value;
      const field = document.getElementById('admin-post-stat-field').value;
      const numValue = parseInt(document.getElementById('admin-post-stat-value').value, 10);

      if (isNaN(numValue) || numValue < 0) {
        showAdminToast('请输入有效的非负整数', 'error');
        return;
      }

      submitBtn.textContent = '保存中...';
      submitBtn.disabled = true;

      var updates = {};
      updates[field] = numValue;
      var result = await updateCommunityPost(postId, updates);
      if (result) {
        showAdminToast((field === 'like_count' ? '点赞数' : '评论数') + '已更新为 ' + numValue, 'success');
        closePostStatModal();
        await renderCommunityTab(container);
      } else {
        showAdminToast('更新失败，请重试', 'error');
        submitBtn.textContent = '保存';
        submitBtn.disabled = false;
      }
    });
  }
}

/* ===== 社区管理全局操作 ===== */
window.handleDeleteCommunityPost = async function(id) {
  if (confirm('确定要删除该帖子吗？')) {
    const success = await deleteCommunityPost(id);
    if (success) {
      showAdminToast('帖子已删除', 'success');
      const container = document.getElementById('admin-tab-content');
      if (container) await renderCommunityTab(container);
    } else {
      showAdminToast('删除失败，请重试', 'error');
    }
  }
};

// 驳回指定帖子的所有举报（保留帖子，仅清除举报记录）
window.handleDismissReport = async function(postId) {
  if (!postId) return;
  if (!confirm('确定驳回此帖子的所有举报？举报记录将被清除，帖子保留。')) return;
  const ok = await dismissReportsByPostId(postId);
  if (ok) {
    showAdminToast('已驳回该帖子的所有举报', 'success');
    const container = document.getElementById('admin-tab-content');
    if (container) await renderCommunityTab(container);
  } else {
    showAdminToast('驳回失败，请重试', 'error');
  }
};

// 删除被举报的帖子（帖子删除后举报记录由 ON DELETE CASCADE 自动清除）
window.handleDeleteReportedPost = async function(postId) {
  if (!postId) return;
  if (!confirm('确定删除此被举报的帖子？此操作不可恢复。')) return;
  const success = await deleteCommunityPost(postId);
  if (success) {
    showAdminToast('帖子已删除', 'success');
    const container = document.getElementById('admin-tab-content');
    if (container) await renderCommunityTab(container);
  } else {
    showAdminToast('删除失败，请重试', 'error');
  }
};

// 查看帖子详情
window.handleViewPostDetail = async function(postId) {
  // 从当前渲染的表格行获取帖子数据
  var row = document.querySelector('tr[data-post-id="' + postId + '"]');
  var posts = window._adminCurrentPosts || [];
  var post = posts.filter(function(p) { return p.id === postId; })[0];
  if (!post) {
    showAdminToast('未找到帖子数据', 'error');
    return;
  }

  var tags = Array.isArray(post.tags) ? post.tags : [];
  var isPinned = post.pinned || post.is_pinned || false;
  var isDeleted = post.is_deleted || false;

  // 加载评论
  var comments = await getCommunityPostComments(postId);
  var commentsHtml = '';
  if (comments && comments.length > 0) {
    commentsHtml = comments.map(function(c) {
      return '<div style="padding:10px 12px;border-bottom:1px solid var(--border-light,#ece8e1);">' +
        '<div style="font-size:0.8rem;color:var(--text-primary,#1a2f1d);word-break:break-all;margin-bottom:4px;" id="comment-content-' + c.id + '">' + (window.renderMarkdown ? window.renderMarkdown(c.content || '') : escapeHtml(c.content || '')) + '</div>' +
        '<div style="font-size:0.7rem;color:var(--text-muted,#8a8a8a);margin-bottom:6px;">' + escapeHtml(c.author_id || '') + ' · ' + (c.created_at ? new Date(c.created_at).toLocaleString('zh-CN') : '') + '</div>' +
        '<div style="display:flex;gap:6px;">' +
          '<button class="admin-btn admin-btn--ghost" style="padding:3px 10px;font-size:0.72rem;" data-on=\'["handleEditComment","' + c.id + '","' + postId + '"]\'>编辑</button>' +
          '<button class="admin-btn admin-btn--danger" style="padding:3px 10px;font-size:0.72rem;" data-on=\'["handleDeleteComment","' + c.id + '","' + postId + '"]\'>删除</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } else {
    commentsHtml = '<div style="color:var(--text-muted,#8a8a8a);padding:20px;text-align:center;">暂无评论</div>';
  }

  var modalHtml = `
    <div class="admin-modal-overlay" id="admin-post-detail-modal" style="display:flex;">
      <div class="admin-modal" style="max-width:680px;max-height:85vh;overflow-y:auto;">
        <div class="admin-modal-header">
          <h3 class="admin-modal-title">帖子详情</h3>
          <button class="admin-modal-close" data-on='["closePostDetailModal"]'>×</button>
        </div>
        <div class="admin-modal-body" style="padding:20px;">
          <div class="bq-mb-16">
            <div style="font-size:0.75rem;color:var(--text-muted,#8a8a8a);margin-bottom:4px;">作者ID：${escapeHtml(post.author_id || '')}</div>
            <div style="font-size:0.75rem;color:var(--text-muted,#8a8a8a);margin-bottom:4px;">时间：${post.created_at ? new Date(post.created_at).toLocaleString('zh-CN') : ''}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
              ${tags.map(function(t) { return '<span class="admin-q-tag admin-q-tag--module">' + escapeHtml(t) + '</span>'; }).join('')}
              ${isPinned ? '<span class="admin-q-tag" style="background:rgba(196,149,106,0.12);color:var(--color-amber,#c4956a);">置顶</span>' : ''}
              ${isDeleted ? '<span class="admin-q-tag" style="background:rgba(192,85,58,0.12);color:var(--color-error,#c0553a);">已删除</span>' : ''}
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted,#8a8a8a);margin-bottom:12px;">点赞 ${post.like_count || 0} · 评论 ${post.comment_count || 0}</div>
          </div>
          <div style="background:var(--surface-secondary,#faf7f2);border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="font-size:0.82rem;font-weight:600;color:var(--color-deep,#1a3a2a);margin-bottom:8px;">帖子内容</div>
            <div style="font-size:0.85rem;line-height:1.7;color:var(--text-primary,#1a2f1d);word-break:break-word;">
              ${(window.renderMarkdown ? window.renderMarkdown(post.content || '') : escapeHtml(post.content || ''))}
            </div>
          </div>
          <div>
            <div style="font-size:0.82rem;font-weight:600;color:var(--color-deep,#1a3a2a);margin-bottom:10px;">评论列表（可编辑/删除）</div>
            ${commentsHtml}
          </div>
        </div>
      </div>
    </div>
  `;

  var old = document.getElementById('admin-post-detail-modal');
  if (old) old.remove();
  var div = document.createElement('div');
  div.innerHTML = modalHtml;
  document.body.appendChild(div.firstElementChild);
};

window.closePostDetailModal = function() {
  var modal = document.getElementById('admin-post-detail-modal');
  if (modal) modal.remove();
};

// 编辑评论内容
window.handleEditComment = async function(commentId, postId) {
  var contentEl = document.getElementById('comment-content-' + commentId);
  if (!contentEl) return;
  var oldContent = contentEl.textContent || '';

  var overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.style.display = 'flex';
  overlay.style.zIndex = '10050';
  overlay.innerHTML =
    '<div class="admin-modal" style="max-width:460px;">' +
      '<div class="admin-modal-header"><h3 class="admin-modal-title">编辑评论</h3><button class="admin-modal-close" data-on=\'["_cspRemoveOverlay"]\'>×</button></div>' +
      '<div class="admin-modal-body" style="padding:20px;">' +
        '<textarea id="edit-comment-textarea" style="width:100%;box-sizing:border-box;min-height:100px;padding:10px 14px;border:1px solid var(--border-light,#e3e0d8);border-radius:8px;font-size:0.88rem;outline:none;background:var(--surface-primary,#fff);color:var(--text-primary,#1a2f1d);resize:vertical;" placeholder="评论内容">' + escapeHtml(oldContent) + '</textarea>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">' +
          '<button class="admin-btn admin-btn--ghost" data-on=\'["_cspRemoveOverlay"]\'>取消</button>' +
          '<button class="admin-btn admin-btn--primary" id="edit-comment-save">保存</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  var ta = overlay.querySelector('#edit-comment-textarea');
  setTimeout(function() { ta.focus(); ta.select(); }, 30);

  overlay.querySelector('#edit-comment-save').addEventListener('click', async function() {
    var newContent = ta.value.trim();
    if (!newContent) { showAdminToast('评论内容不能为空', 'error'); return; }
    if (newContent === oldContent) { overlay.remove(); return; }

    // 通过 Supabase 直接更新评论内容
    var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
    if (!sb) { showAdminToast('数据服务不可用', 'error'); return; }

    try {
      var { data, error } = await sb.from('community_comments')
        .update({ content: newContent, updated_at: new Date().toISOString() })
        .eq('id', commentId);
      if (error) throw error;
      showAdminToast('评论已更新', 'success');
      overlay.remove();
      // 刷新详情弹窗中的评论
      window.handleViewPostDetail(postId);
    } catch(e) {
      showAdminToast('更新失败：' + (e.message || e), 'error');
    }
  });
};

window.handleTogglePin = async function(id, currentPinned) {
  const result = await toggleCommunityPostPin(id, !currentPinned);
  if (result) {
    showAdminToast('操作成功', 'success');
    const container = document.getElementById('admin-tab-content');
    if (container) await renderCommunityTab(container);
  } else {
    showAdminToast('操作失败，请重试', 'error');
  }
};

window.openPostStatModal = function(postId, field, currentValue) {
  var fieldLabel = field === 'like_count' ? '点赞数' : '评论数';
  var modal = document.getElementById('admin-post-stat-modal');
  var title = document.getElementById('admin-post-stat-title');
  var label = document.getElementById('admin-post-stat-label');
  var valueInput = document.getElementById('admin-post-stat-value');
  var postIdInput = document.getElementById('admin-post-stat-post-id');
  var fieldInput = document.getElementById('admin-post-stat-field');
  var submitBtn = document.getElementById('admin-post-stat-submit');
  if (!modal) return;
  if (title) title.textContent = '修改' + fieldLabel;
  if (label) label.textContent = fieldLabel + '（当前: ' + currentValue + '）';
  if (valueInput) {
    valueInput.value = currentValue;
    valueInput.focus();
  }
  if (postIdInput) postIdInput.value = postId;
  if (fieldInput) fieldInput.value = field;
  if (submitBtn) {
    submitBtn.textContent = '保存';
    submitBtn.disabled = false;
  }
  modal.style.display = 'flex';
};

window.closePostStatModal = function() {
  var modal = document.getElementById('admin-post-stat-modal');
  if (modal) modal.style.display = 'none';
};

window.handleEditPostStat = async function(postId, field, currentValue) {
  window.openPostStatModal(postId, field, currentValue);
};

window.handleManagePostComments = async function(postId) {
  var comments = await getCommunityPostComments(postId);
  if (!comments) {
    showAdminToast('无法加载评论列表', 'error');
    return;
  }

  var commentListHtml = comments.length === 0
    ? '<div style="color:var(--text-muted,#8a8a8a);padding:12px;text-align:center;">暂无评论</div>'
    : comments.map(function(c) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border-light,#ece8e1);gap:10px;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:0.8rem;color:var(--text-secondary,#4a4a4a);word-break:break-all;">' + escapeHtml((c.content || '').substring(0, 200)) + '</div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted,#8a8a8a);margin-top:4px;">' + (c.author_id || '') + ' · ' + (c.created_at ? new Date(c.created_at).toLocaleString('zh-CN') : '') + '</div>' +
          '</div>' +
          '<button class="admin-btn admin-btn--danger" style="padding:4px 10px;font-size:0.75rem;white-space:nowrap;flex-shrink:0;" data-on=\'["handleDeleteComment","' + c.id + '","' + postId + '"]\'>' + ICONS.trash + ' 删除</button>' +
        '</div>';
      }).join('');

  var modalHtml = `
    <div class="admin-modal-overlay" id="admin-comments-modal" style="display:flex;">
      <div class="admin-modal" style="max-width:560px;">
        <div class="admin-modal-header">
          <div class="admin-modal-title">帖子评论管理</div>
          <button class="admin-modal-close" data-on='["closeCommentsModal"]'>&times;</button>
        </div>
        <div style="max-height:400px;overflow-y:auto;border:1px solid var(--border-light,#ece8e1);border-radius:8px;">
          ${commentListHtml}
        </div>
        <div style="margin-top:16px;font-size:0.78rem;color:var(--text-muted,#8a8a8a);">共 ${comments.length} 条评论</div>
      </div>
    </div>
  `;

  // Remove existing modal if any
  var existing = document.getElementById('admin-comments-modal');
  if (existing) existing.remove();

  var tempDiv = document.createElement('div');
  tempDiv.innerHTML = modalHtml;
  document.body.appendChild(tempDiv.firstElementChild);
};

window.handleDeleteComment = async function(commentId, postId) {
  if (!confirm('确定要删除该评论吗？')) return;
  var success = await deleteCommunityComment(commentId);
  if (success) {
    showAdminToast('评论已删除', 'success');
    // 更新评论数
    var comments = await getCommunityPostComments(postId);
    if (comments !== null) {
      await updateCommunityPost(postId, { comment_count: comments.length });
    }
    // 关闭并重新打开评论管理弹窗
    closeCommentsModal();
    await handleManagePostComments(postId);
  } else {
    showAdminToast('删除评论失败，请重试', 'error');
  }
};

window.closeCommentsModal = function() {
  var modal = document.getElementById('admin-comments-modal');
  if (modal) modal.remove();
};

window.handleUnmuteUser = async function(userId) {
  if (confirm(`确定要解除用户 "${userId}" 的禁言吗？`)) {
    const success = await unmuteCommunityUser(userId);
    if (success) {
      showAdminToast('已解除禁言', 'success');
      const container = document.getElementById('admin-tab-content');
      if (container) await renderCommunityTab(container);
    } else {
      showAdminToast('操作失败，请重试', 'error');
    }
  }
};

window.openMuteModal = function() {
  const modal = document.getElementById('admin-mute-modal');
  if (!modal) return;
  document.getElementById('mute-user-id').value = '';
  document.getElementById('mute-reason').value = '';
  document.getElementById('mute-duration').value = '24';
  document.getElementById('mute-submit-btn').textContent = '确认禁言';
  document.getElementById('mute-submit-btn').disabled = false;
  modal.style.display = 'flex';
};

window.closeMuteModal = function() {
  const modal = document.getElementById('admin-mute-modal');
  if (modal) modal.style.display = 'none';
};

window.adminGoCommunityPostPage = async function(page) {
  if (page < 1) return;
  _adminCommunityPostPage = page;
  const container = document.getElementById('admin-tab-content');
  if (container) await renderCommunityTab(container);
};
