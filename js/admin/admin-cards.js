/**
 * TATABOX - 管理后台 · 知识卡片子模块（Issue #17 自 admin.js 拆分）
 * 由 admin.js 的 loadTabContent 在切换到「知识卡片」标签时动态注入加载。
 * 依赖：js/admin/admin.js（核心）。
 */

function renderCardsTab(container, cardsData) {
  const cards = cardsData.cards || [];
  const totalC = cardsData.total || cards.length;
  const categories = cardsData.categories || [];
  const currentPage = cardsData.page || 1;
  const perPage = cardsData.per_page || 20;
  const totalPages = Math.ceil(totalC / perPage);

  let html = `
    <div class="admin-stats-row">
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--green">${ICONS.layers}</div>
        <div>
          <div class="admin-stat-num">${totalC}</div>
          <div class="admin-stat-label">卡片总数</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--amber">${ICONS.book}</div>
        <div>
          <div class="admin-stat-num">${categories.length}</div>
          <div class="admin-stat-label">分类数</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--blue">${ICONS.plus}</div>
        <div>
          <div class="admin-stat-num">--</div>
          <div class="admin-stat-label">添加卡片</div>
        </div>
      </div>
    </div>

    <div class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-title">
          ${ICONS.layers}
          知识卡片管理
        </div>
        <button class="admin-btn admin-btn--primary" data-on='["openCardModal"]'>
          ${ICONS.plus}
          添加卡片
        </button>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center;">
        <div style="flex:1;min-width:200px;position:relative;">
          <input type="text" class="admin-form-input" id="admin-card-search" placeholder="搜索 ID、标题、问题、答案..." value="${_adminCardSearch}" style="padding-left:36px;">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);">${ICONS.search}</span>
        </div>
        <select class="admin-form-select" id="admin-card-category-filter" style="max-width:220px;">
          <option value="">全部分类</option>
          ${categories.map(c => `<option value="${c}" ${c === _adminCardCategory ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
  `;

  if (cards.length === 0) {
    if (cardsData._missing_table) {
      html += `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.alertCircle}</div><div class="admin-empty-text">知识卡片数据暂时不可用</div><div class="admin-empty-hint">请确认已登录且具备管理员权限，然后刷新重试。<br>若持续失败，请打开浏览器控制台（F12）查看详细错误。</div></div>`;
    } else {
      html += `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.layers}</div><div class="admin-empty-text">暂无知识卡片，请点击上方「添加卡片」</div></div>`;
    }
  } else {
    html += `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>分类</th>
              <th>标题</th>
              <th>问题预览</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${cards.map(card => {
              const qPreview = (card.question || '').length > 60 ? (card.question || '').slice(0, 60) + '...' : (card.question || '');
              return `
                <tr data-card-id="${card.id}">
                  <td style="font-family:var(--font-mono,monospace);font-size:0.75rem;color:var(--color-sage,#5a7d5c);">${String(card.id).slice(0, 12)}${String(card.id).length > 12 ? '...' : ''}</td>
                  <td><span class="admin-q-tag admin-q-tag--module">${escapeHtml(card.category || '')}</span></td>
                  <td class="admin-table-name">${escapeHtml(card.title || '')}</td>
                  <td style="color:var(--text-muted,#8a8a8a);font-size:0.82rem;max-width:300px;" title="${escapeHtml(card.question || '')}">${escapeHtml(qPreview)}</td>
                  <td>
                    <div class="admin-table-actions">
                      <button class="admin-btn admin-btn--ghost" data-on='["handleEditCard",${JSON.stringify(card).replace(/'/g, "&#39;")}]'>
                        编辑
                      </button>
                      <button class="admin-btn admin-btn--danger" data-on='["handleDeleteCard","${card.id}"]'>
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

    // 分页
    if (totalPages > 1) {
      html += `<div style="display:flex;justify-content:center;gap:8px;margin-top:20px;align-items:center;">`;
      html += `<button class="admin-btn admin-btn--ghost" data-on='["adminGoCardPage",${currentPage - 1}]' ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>`;
      html += `<span style="color:var(--text-muted);font-size:0.85rem;">第 ${currentPage} / ${totalPages} 页</span>`;
      html += `<button class="admin-btn admin-btn--ghost" data-on='["adminGoCardPage",${currentPage + 1}]' ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>`;
      html += `</div>`;
    }
  }

  html += '</div>';

  // 卡片弹窗（添加/编辑共用）
  html += `
    <div class="admin-modal-overlay" id="admin-card-modal" style="display:none;">
      <div class="admin-modal" style="max-width:600px;">
        <div class="admin-modal-header">
          <div class="admin-modal-title" id="admin-card-modal-title">添加卡片</div>
          <button class="admin-modal-close" data-on='["closeCardModal"]'>&times;</button>
        </div>
        <form id="admin-card-form" class="admin-form-grid">
          <div class="admin-form-group full">
            <label class="admin-form-label">分类</label>
            <select class="admin-form-select" id="card-category" required>
              ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
              <option value="__new__">+ 新建分类</option>
            </select>
          </div>
          <div class="admin-form-group full" id="new-category-group" style="display:none;">
            <label class="admin-form-label">新分类名称</label>
            <input type="text" class="admin-form-input" id="card-new-category" placeholder="输入新的分类名称">
          </div>
          <div class="admin-form-group full">
            <label class="admin-form-label">标题</label>
            <input type="text" class="admin-form-input" id="card-title" placeholder="例如：细胞膜" required>
          </div>
          <div class="admin-form-group full">
            <label class="admin-form-label">问题</label>
            <textarea class="admin-form-textarea" id="card-question" placeholder="输入问题内容" required style="min-height:80px;"></textarea>
          </div>
          <div class="admin-form-group full">
            <label class="admin-form-label">答案</label>
            <textarea class="admin-form-textarea" id="card-answer" placeholder="输入答案内容" style="min-height:100px;"></textarea>
          </div>
          <input type="hidden" id="card-edit-id" value="">
          <div class="admin-form-group full">
            <button type="submit" class="admin-form-submit" id="card-submit-btn">保存卡片</button>
          </div>
        </form>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // 搜索事件
  const searchInput = document.getElementById('admin-card-search');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      _adminCardSearch = searchInput.value.trim();
      _adminCardPage = 1;
      const data = await getCards({ search: _adminCardSearch, category: _adminCardCategory, page: _adminCardPage });
      if (data) renderCardsTab(container, data);
    }, 300);
  });

  // 分类筛选
  document.getElementById('admin-card-category-filter').addEventListener('change', async (e) => {
    _adminCardCategory = e.target.value;
    _adminCardPage = 1;
    const data = await getCards({ search: _adminCardSearch, category: _adminCardCategory, page: _adminCardPage });
    if (data) renderCardsTab(container, data);
  });

  // 新建分类切换
  const catSelect = document.getElementById('card-category');
  const newCatGroup = document.getElementById('new-category-group');
  catSelect.addEventListener('change', () => {
    newCatGroup.style.display = catSelect.value === '__new__' ? '' : 'none';
  });

  // 绑定表单提交
  const form = document.getElementById('admin-card-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('card-submit-btn');
    let category = catSelect.value;
    if (category === '__new__') {
      category = document.getElementById('card-new-category').value.trim();
      if (!category) {
        showAdminToast('请输入新分类名称', 'error');
        return;
      }
    }
    if (!category) {
      showAdminToast('请选择或输入分类', 'error');
      return;
    }

    const cardData = {
      category,
      title: document.getElementById('card-title').value.trim(),
      question: document.getElementById('card-question').value.trim(),
      answer: document.getElementById('card-answer').value.trim(),
    };

    if (!cardData.title || !cardData.question) {
      showAdminToast('标题和问题不能为空', 'error');
      return;
    }

    const editId = document.getElementById('card-edit-id').value;
    submitBtn.textContent = '保存中...';
    submitBtn.disabled = true;

    let result;
    if (editId) {
      result = await updateCard(editId, cardData);
    } else {
      result = await addCard(cardData);
    }

    if (result) {
      showAdminToast(editId ? '卡片更新成功！' : '卡片添加成功！', 'success');
      closeCardModal();
      const data = await getCards({ search: _adminCardSearch, category: _adminCardCategory, page: _adminCardPage });
      if (data) renderCardsTab(container, data);
    } else {
      showAdminToast('操作失败，请重试', 'error');
      submitBtn.textContent = '保存卡片';
      submitBtn.disabled = false;
    }
  });
}

/* ===== 卡片全局操作 ===== */
window.openCardModal = function(cardData) {
  const modal = document.getElementById('admin-card-modal');
  if (!modal) return;

  document.getElementById('admin-card-modal-title').textContent = cardData ? '编辑卡片' : '添加卡片';
  document.getElementById('card-edit-id').value = cardData ? (cardData.id || '') : '';
  document.getElementById('card-category').value = cardData ? (cardData.category || '') : '';
  document.getElementById('card-new-category').value = '';
  document.getElementById('new-category-group').style.display = 'none';
  document.getElementById('card-title').value = cardData ? (cardData.title || '') : '';
  document.getElementById('card-question').value = cardData ? (cardData.question || '') : '';
  document.getElementById('card-answer').value = cardData ? (cardData.answer || '') : '';
  document.getElementById('card-submit-btn').textContent = '保存卡片';
  document.getElementById('card-submit-btn').disabled = false;
  modal.style.display = 'flex';
};

window.closeCardModal = function() {
  const modal = document.getElementById('admin-card-modal');
  if (modal) modal.style.display = 'none';
};

window.handleEditCard = function(cardData) {
  openCardModal(cardData);
};

window.handleDeleteCard = async function(id) {
  if (confirm(`确定要删除该知识卡片吗？（ID: ${id.slice(0, 12)}...）此操作不可恢复。`)) {
    const success = await deleteCard(id);
    if (success) {
      showAdminToast('卡片已删除', 'success');
      const data = await getCards({ search: _adminCardSearch, category: _adminCardCategory, page: _adminCardPage });
      const container = document.getElementById('admin-tab-content');
      if (data && container) renderCardsTab(container, data);
    } else {
      showAdminToast('删除失败，请重试', 'error');
    }
  }
};

window.adminGoCardPage = async function(page) {
  if (page < 1) return;
  _adminCardPage = page;
  const data = await getCards({ search: _adminCardSearch, category: _adminCardCategory, page: _adminCardPage });
  const container = document.getElementById('admin-tab-content');
  if (data && container) renderCardsTab(container, data);
};
