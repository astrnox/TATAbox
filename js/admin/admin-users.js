/**
 * TATABOX - 管理后台 · 用户管理子模块（Issue #17 自 admin.js 拆分）
 * 由 admin.js 的 loadTabContent 在切换到「用户管理」标签时动态注入加载。
 * 依赖：js/admin/admin.js（核心，必须已加载——提供 API/Toast/ICONS/分页状态等共享定义）。
 */

/* ===== 用户管理标签 ===== */

// CSP 便捷委托：原内联 onchange 中 `this.value` 无法由 data-on 数组直接表达，
// 收敛为最小全局函数，供 csp-events 的 __this 委托调用。
window._cspUserGroupChange = function (uid, el) {
  if (typeof window.handleChangeUserGroup === 'function') window.handleChangeUserGroup(uid, el && el.value);
};

/**
 * 重新拉取并渲染用户表（H-03：后台写操作失败时把下拉/行状态恢复到服务端真值）。
 */
async function _reloadAdminUsers() {
  try {
    if (typeof getUsers !== 'function') return;
    var users = await getUsers();
    var container = document.getElementById('admin-tab-content');
    if (users && container) renderUsersTab(container, users);
  } catch (e) { /* 刷新失败不影响主提示 */ }
}

function renderUsersTab(container, users) {
  const totalUsers = users.length;
  const totalAnswered = users.reduce((sum, u) => sum + (u.total_answered || 0), 0);
  const avgScore = totalUsers > 0 ? Math.round(users.reduce((sum, u) => sum + (u.bio_score || 0), 0) / totalUsers) : 0;

  // 用户组分布统计
  const groupCounts = { admin: 0, premium: 0, member: 0, guest: 0 };
  users.forEach(u => {
    const g = u.user_group || 'member';
    if (groupCounts[g] !== undefined) groupCounts[g]++;
    else groupCounts.member++;
  });
  const groupLabels = { admin: '管理员', premium: '高级会员', member: '普通会员', guest: '访客' };
  const groupDistText = Object.entries(groupCounts).filter(([_, v]) => v > 0).map(([k, v]) => `${groupLabels[k]}${v}`).join(' / ');

  let html = `
    <div class="admin-stats-row">
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--green">${ICONS.users}</div>
        <div>
          <div class="admin-stat-num">${totalUsers}</div>
          <div class="admin-stat-label">注册用户</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--amber">${ICONS.book}</div>
        <div>
          <div class="admin-stat-num">${totalAnswered}</div>
          <div class="admin-stat-label">总答题数</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--blue">${ICONS.shield}</div>
        <div>
          <div class="admin-stat-num">${avgScore}</div>
          <div class="admin-stat-label">平均 Bio 分</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--green">${ICONS.users}</div>
        <div>
          <div class="admin-stat-num" style="font-size:0.9rem;">${groupDistText}</div>
          <div class="admin-stat-label">用户组分布</div>
        </div>
      </div>
    </div>

    <div class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-title">
          ${ICONS.users}
          用户列表
        </div>
        <span class="admin-section-badge">${totalUsers} 人</span>
      </div>
  `;

  if (users.length === 0) {
    html += `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">暂无注册用户</div></div>`;
  } else {
    html += `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>显示名称</th>
              <th>Bio 分</th>
              <th>答题数</th>
              <th>正确数</th>
              <th>准确率</th>
              <th>信用</th>
              <th>用户组</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(user => {
              var uid = user.id || '';
              var uname = user.username || '未知用户';
              var dname = user.display_name || uname;
              // P0-3 修复：username/display_name 为用户可控字段，渲染与 onclick 均需转义。
              // onclick 内的字符串需同时处理反斜杠/单引号（JS 字符串）与双引号（HTML 属性）。
              function _jsStr(s) {
                return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;');
              }
              // _jsStrJson：供 CSP data-on（JSON 数组，单引号属性）使用的字符串转义。
              // 需保证 HTML 解析后仍是合法 JSON 字符串：\→\\、"→\"、'→&#39;。
              function _jsStrJson(s) {
                return String(s == null ? '' : s)
                  .replace(/\\/g, '\\\\')
                  .replace(/"/g, '\\"')
                  .replace(/'/g, '&#39;');
              }
              var uidJs = _jsStr(uid);
              var unameJs = _jsStr(uname);
              var dnameJs = _jsStr(dname);
              return `
              <tr data-uid="${escapeHtml(uid)}">
                <td class="admin-table-name">${escapeHtml(uname)}</td>
                <td>${escapeHtml(dname)}</td>
                <td class="admin-table-score" id="score-${uid}">${user.bio_score || 0}</td>
                <td>${user.total_answered || 0}</td>
                <td>${user.total_correct || 0}</td>
                <td>${(user.accuracy || 0)}%</td>
                <td id="points-${uid}" style="font-weight:700;color:var(--color-deep,#1a3a2a);">${typeof user.points === 'number' ? user.points : 0}</td>
                <td>
                  <select class="admin-form-select" style="padding:4px 8px;font-size:0.8rem;min-width:80px;" data-on-change='["_cspUserGroupChange","${_jsStrJson(uid)}","__this"]'>
                    <option value="admin" ${user.user_group === 'admin' ? 'selected' : ''}>管理员</option>
                    <option value="premium" ${user.user_group === 'premium' ? 'selected' : ''}>高级会员</option>
                    <option value="verified" ${user.user_group === 'verified' ? 'selected' : ''}>认证会员</option>
                    <option value="member" ${user.user_group === 'member' || !user.user_group ? 'selected' : ''}>普通会员</option>
                    <option value="guest" ${user.user_group === 'guest' ? 'selected' : ''}>访客</option>
                  </select>
                </td>
                <td>
                  <div class="admin-table-actions">
                    <button class="admin-btn admin-btn--primary" data-on='["handleEditUser","${_jsStrJson(uid)}","${_jsStrJson(uname)}","${_jsStrJson(dname)}",${user.bio_score || 0},${user.total_answered || 0},${user.total_correct || 0},${user.accuracy || 0},${typeof user.points === 'number' ? user.points : 0}]'>
                      编辑
                    </button>
                    <button class="admin-btn admin-btn--ghost" data-on='["handleAdjustUserPoints","${uid}",${typeof user.points === 'number' ? user.points : 0}]'>
                      调整信用
                    </button>
                    <button class="admin-btn admin-btn--ghost" data-on='["handleResetPassword","${uid}"]'>
                      重置密码
                    </button>
                    <button class="admin-btn admin-btn--danger" data-on='["handleDeleteUser","${uid}"]'>
                      ${ICONS.trash}
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  html += '</div>';

  // 编辑用户弹窗
  html += `
    <div class="admin-modal-overlay" id="admin-user-modal" style="display:none;">
      <div class="admin-modal">
        <div class="admin-modal-header">
          <div class="admin-modal-title">编辑用户</div>
          <button class="admin-modal-close" data-on='["closeUserModal"]'>&times;</button>
        </div>
        <form id="admin-user-edit-form" class="admin-form-grid">
          <div class="admin-form-group">
            <label class="admin-form-label">用户名</label>
            <input type="text" class="admin-form-input" id="edit-username" placeholder="输入用户名">
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">显示名称</label>
            <input type="text" class="admin-form-input" id="edit-display-name" placeholder="输入显示名称">
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">Bio 分数</label>
            <input type="number" class="admin-form-input" id="edit-bio-score" min="0" max="100">
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">信用</label>
            <input type="number" class="admin-form-input" id="edit-points" min="0">
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">总答题数</label>
            <input type="number" class="admin-form-input" id="edit-total-answered" min="0">
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">总正确数</label>
            <input type="number" class="admin-form-input" id="edit-total-correct" min="0">
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">准确率 (%)</label>
            <input type="number" class="admin-form-input" id="edit-accuracy" min="0" max="100" step="0.1">
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">新密码（留空不修改）</label>
            <input type="text" class="admin-form-input" id="edit-new-password" placeholder="输入新密码">
          </div>
          <div class="admin-form-group full">
            <button type="submit" class="admin-form-submit">保存修改</button>
          </div>
        </form>
      </div>
    </div>
  `;

  container.innerHTML = html;
}


window.handleChangeUserGroup = async function(userId, newGroup) {
  var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
  if (!sb) { showAdminToast('Supabase 未连接', 'error'); return; }
  try {
    // H-03：user_group 受 profile_protect_sensitive 触发器保护，
    // 客户端直接 PATCH 会被静默回滚（接口 200 但数据未变）。
    // 改走服务端 RPC：校验调用者为 admin，并在 postgres 身份下完成更新。
    var res = await sb.rpc('admin_set_user_group', { p_user_id: userId, p_group: newGroup });
    if (res && res.error) {
      showAdminToast('更新失败: ' + res.error.message, 'error');
      _reloadAdminUsers();
      return;
    }
    var row = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!row || !row.ok) {
      showAdminToast((row && row.error_msg) || '更新失败', 'error');
      _reloadAdminUsers();
      return;
    }
    showAdminToast('用户组已设为 ' + {admin:'管理员',premium:'高级会员',verified:'认证会员',member:'普通会员',guest:'访客'}[newGroup], 'success');
  } catch(e) {
    showAdminToast('更新出错: ' + e.message, 'error');
    _reloadAdminUsers();
  }
};

window.handleDeleteUser = async function(userId) {
  if (!confirm('确定要删除该用户吗？此操作不可恢复。')) return;
  var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
  if (!sb) { alert('Supabase 未连接'); return; }
  try {
    // H-03：只删 profiles 会留下可继续登录的 auth.users 孤儿账号。
    // 改走服务端 RPC：同时删除 auth 用户（级联清理业务数据），并阻止删自己/最后一名管理员。
    var res = await sb.rpc('admin_delete_user', { p_user_id: userId });
    if (res && res.error) { alert('删除失败: ' + res.error.message); return; }
    var row = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!row || !row.ok) { alert((row && row.error_msg) || '删除失败'); return; }
    await _reloadAdminUsers();
    showAdminToast('用户已删除', 'success');
  } catch(e) {
    alert('删除出错: ' + e.message);
  }
};

window.handleAdjustUserPoints = async function(userId, currentPoints) {
  const amountStr = prompt('调整该用户的信用\n\n当前信用：' + currentPoints + '\n输入正数增加，输入负数扣除，例如：+10 或 -5');
  if (!amountStr) return;
  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount === 0) {
    showAdminToast('请输入有效的调整数值', 'error');
    return;
  }
  const reason = prompt('调整原因（必填）：') || '管理员手动调整';
  try {
    var result;
    if (typeof window.adjustUserPoints === 'function') {
      result = await window.adjustUserPoints(amount, reason, { userId: userId, source: 'admin' });
    } else if (typeof adjustUserPoints === 'function') {
      result = await adjustUserPoints(amount, reason, { userId: userId, source: 'admin' });
    } else {
      showAdminToast('信用调整功能未加载', 'error');
      return;
    }
    if (result && result.ok) {
      const crCell = document.getElementById('points-' + userId);
      if (crCell) crCell.textContent = result.points;
      showAdminToast('已调整用户信用为 ' + result.points, 'success');
    } else {
      showAdminToast('调整失败：' + errText(result), 'error');
    }
  } catch (e) {
    showAdminToast('调整出错：' + e.message, 'error');
  }
};


window.handleEditUser = function(userId, username, displayName, bioScore, totalAnswered, totalCorrect, accuracy, points) {
  const modal = document.getElementById('admin-user-modal');
  if (!modal) return;
  document.getElementById('edit-username').value = username || '';
  document.getElementById('edit-display-name').value = displayName || '';
  document.getElementById('edit-bio-score').value = bioScore;
  document.getElementById('edit-points').value = (typeof points === 'number') ? points : 0;
  document.getElementById('edit-total-answered').value = totalAnswered;
  document.getElementById('edit-total-correct').value = totalCorrect;
  document.getElementById('edit-accuracy').value = accuracy;
  document.getElementById('edit-new-password').value = '';
  modal.style.display = 'flex';

  // 绑定表单提交
  const form = document.getElementById('admin-user-edit-form');
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
    if (!sb) { showAdminToast('Supabase 未连接', 'error'); return; }
    const newUsername = document.getElementById('edit-username').value.trim();
    const newDisplayName = document.getElementById('edit-display-name').value.trim();
    const updates = {
      username: newUsername || undefined,
      display_name: newDisplayName || undefined,
      bio_score: parseInt(document.getElementById('edit-bio-score').value),
      points: parseInt(document.getElementById('edit-points').value),
      total_answered: parseInt(document.getElementById('edit-total-answered').value),
      total_correct: parseInt(document.getElementById('edit-total-correct').value),
      accuracy: parseFloat(document.getElementById('edit-accuracy').value)
    };
    // 移除空字符串字段，避免覆盖为空；数值字段空输入会得 NaN，必须剔除防脏数据入库
    if (!newUsername) delete updates.username;
    if (!newDisplayName) delete updates.display_name;
    if (isNaN(updates.points)) delete updates.points;
    if (isNaN(updates.bio_score)) delete updates.bio_score;
    if (isNaN(updates.total_answered)) delete updates.total_answered;
    if (isNaN(updates.total_correct)) delete updates.total_correct;
    if (isNaN(updates.accuracy)) delete updates.accuracy;
    try {
      var { error } = await sb.from('profiles').update(updates).eq('id', userId);
      if (error) { showAdminToast('更新失败: ' + parseSupabaseError(error), 'error'); return; }
      closeUserModal();
      const users = await getUsers();
      const container = document.getElementById('admin-tab-content');
      if (users && container) renderUsersTab(container, users);
      showAdminToast('用户信息已更新', 'success');
    } catch(e) {
      showAdminToast('更新出错: ' + e.message, 'error');
    }
  });
};

window.closeUserModal = function() {
  const modal = document.getElementById('admin-user-modal');
  if (modal) modal.style.display = 'none';
};

window.handleResetPassword = async function(userId) {
  if (!userId) return;

  const newPwd = prompt('重置该用户的密码，请输入新密码（至少 6 位）：', '');
  if (newPwd === null) return; // 用户取消
  if (!newPwd || newPwd.length < 6) {
    showAdminToast('新密码至少 6 位', 'error');
    return;
  }
  const confirmPwd = prompt('请再次输入新密码以确认：', '');
  if (confirmPwd === null) return;
  if (confirmPwd !== newPwd) {
    showAdminToast('两次输入的密码不一致', 'error');
    return;
  }

  const sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
  if (!sb) {
    showAdminToast('系统未初始化，请刷新页面后重试', 'error');
    return;
  }

  try {
    // 权限由服务端校验（调用者 profiles.user_group='admin'），见 sql/migration_v11_admin_auth.sql
    const { data, error } = await sb.rpc('admin_reset_password', {
      p_user_id: userId,
      p_new_password: newPwd
    });
    if (error) {
      const msg = error.message || String(error);
      const missingRpc = (typeof window._isMissingRpcError === 'function')
        ? window._isMissingRpcError(msg)
        : (msg.indexOf('Could not find') >= 0 || msg.indexOf('not found') >= 0 || msg.indexOf('does not exist') >= 0);
      showAdminToast(
        missingRpc
          ? '服务端尚未部署重置功能，请先执行 sql/migration_v11_admin_auth.sql'
          : '重置失败：' + msg,
        'error'
      );
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.ok) {
      showAdminToast('密码已重置，请通知该用户使用新密码登录', 'success');
    } else {
      showAdminToast((row && row.error_msg) || '重置失败', 'error');
    }
  } catch (e) {
    showAdminToast('重置异常：' + ((e && e.message) || e), 'error');
  }
};
