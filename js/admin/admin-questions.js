/**
 * TATABOX - 管理后台 · 题目管理子模块（Issue #17 自 admin.js 拆分）
 * 由 admin.js 的 loadTabContent 在切换到「题目管理」标签时动态注入加载。
 * 依赖：js/admin/admin.js（核心）。
 */

/* ===== 题目管理标签 ===== */

// 渲染题目选项 HTML（兼容数组与对象两种格式）
function _renderQuestionOptionsHtml(options) {
  if (!options) return '';
  // 数组格式：["选项A", "选项B", ...]
  if (Array.isArray(options) && options.length > 0) {
    const visible = options.slice(0, 4);
    const rest = options.length - visible.length;
    let html = '<div class="admin-q-options">';
    visible.forEach(function (opt, i) {
      html += '<div>' + String.fromCharCode(65 + i) + '. ' + escapeHtml(String(opt)) + '</div>';
    });
    if (rest > 0) html += '<div>...还有 ' + rest + ' 个选项</div>';
    html += '</div>';
    return html;
  }
  // 对象格式：{"A": "...", "B": "..."}
  if (typeof options === 'object' && options !== null) {
    const keys = Object.keys(options).sort();
    if (keys.length === 0) return '';
    const visible = keys.slice(0, 4);
    const rest = keys.length - visible.length;
    let html = '<div class="admin-q-options">';
    visible.forEach(function (k) {
      html += '<div>' + escapeHtml(k) + '. ' + escapeHtml(String(options[k])) + '</div>';
    });
    if (rest > 0) html += '<div>...还有 ' + rest + ' 个选项</div>';
    html += '</div>';
    return html;
  }
  return '';
}

// 渲染 MTF 子题 HTML
function _renderSubQuestionsHtml(subs) {
  if (!Array.isArray(subs) || subs.length === 0) return '';
  let html = '<div class="admin-q-options" style="border-left:2px solid rgba(168,85,247,0.3);padding-left:8px;margin-top:4px;">';
  subs.slice(0, 4).forEach(function (s) {
    const label = s.label || '';
    const text = s.text || '';
    const ans = s.answer === true ? ' ✓' : (s.answer === false ? ' ✗' : '');
    html += '<div><strong>' + escapeHtml(String(label)) + '.</strong> ' + escapeHtml(String(text)) + '<span style="color:' + (s.answer === true ? '#10b981' : (s.answer === false ? '#ef4444' : '#999')) + ';">' + ans + '</span></div>';
  });
  if (subs.length > 4) html += '<div>...还有 ' + (subs.length - 4) + ' 个子题</div>';
  html += '</div>';
  return html;
}

function renderQuestionsTab(container, questionsData) {
  const allQuestions = questionsData.questions || [];
  // 客户端按 target 过滤（Supabase 无 target 列，从 difficulty 推断）
  const questions = _adminQuestionTarget ? allQuestions.filter(q => {
    const t = q.target || (function() {
      const d = String(q.difficulty || '').toLowerCase();
      if (d === 'basic' || d === 'easy') return 'high_school';
      if (d === 'national' || d === 'league' || d === 'hard') return 'competition';
      return 'both';
    })();
    return t === _adminQuestionTarget;
  }) : allQuestions;
  const totalQ = questionsData.total || questions.length;
  const modules = questionsData.modules || [];
  const currentPage = questionsData.page || 1;
  const perPage = questionsData.per_page || 50;
  const totalPages = Math.ceil(totalQ / perPage);

  // 收集所有标签
  const allTags = new Set();
  questions.forEach(q => {
    if (q.subject) allTags.add(q.subject);
    if (q.concept) allTags.add(q.concept);
    if (q.tags && Array.isArray(q.tags)) q.tags.forEach(t => allTags.add(t));
  });

  let html = `
    <div class="admin-stats-row">
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--green">${ICONS.book}</div>
        <div>
          <div class="admin-stat-num">${totalQ}</div>
          <div class="admin-stat-label">题目总数</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--amber">${ICONS.settings}</div>
        <div>
          <div class="admin-stat-num">${modules.length}</div>
          <div class="admin-stat-label">模块数</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--blue">${ICONS.plus}</div>
        <div>
          <div class="admin-stat-num">--</div>
          <div class="admin-stat-label">添加新题</div>
        </div>
      </div>
    </div>

    ${_LOCAL_SECTION_HTML}

    <div class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-title">
          ${ICONS.plus}
          添加新题目
        </div>
      </div>
      <form class="admin-form-grid" id="add-question-form">
        <div class="admin-form-group">
          <label class="admin-form-label">模块</label>
          <select class="admin-form-select" id="q-module" required>
            <option value="module_1">模块 1 - 生化/分子/细胞</option>
            <option value="module_2">模块 2 - 植物/微生物</option>
            <option value="module_3">模块 3 - 动物/生态</option>
            <option value="module_4">模块 4 - 遗传/进化/信息</option>
          </select>
        </div>
        <div class="admin-form-group">
          <label class="admin-form-label">科目</label>
          <input type="text" class="admin-form-input" id="q-subject" placeholder="例如：细胞生物学" required>
        </div>
        <div class="admin-form-group">
          <label class="admin-form-label">知识点</label>
          <input type="text" class="admin-form-input" id="q-concept" placeholder="例如：细胞器" required>
        </div>
        <div class="admin-form-group">
          <label class="admin-form-label">类型</label>
          <select class="admin-form-select" id="q-type">
            <option value="single">单选题</option>
            <option value="multiple">多选题</option>
            <option value="judgment">判断题</option>
            <option value="mtf">多判断题（MTF）</option>
          </select>
        </div>
        <div class="admin-form-group full">
          <label class="admin-form-label">题目内容</label>
          <textarea class="admin-form-textarea" id="q-text" placeholder="输入题目内容" required></textarea>
          <div style="font-size:0.72rem;color:var(--text-muted,#8a8a8a);margin-top:4px;line-height:1.5;">
            <strong>MTF 题干规范：</strong>不要用「下列叙述最合理的是/错误的是」等限定句，应改为
            「根据以上信息，判断以下陈述的正误。」，每个选项即为一条独立判断陈述。
          </div>
        </div>
        <div class="admin-form-group full">
          <label class="admin-form-label">选项（每行一个选项）</label>
          <textarea class="admin-form-textarea" id="q-options" placeholder="选项A&#10;选项B&#10;选项C&#10;选项D" required></textarea>
        </div>
        <div class="admin-form-group">
          <label class="admin-form-label">答案（TTFF 格式）</label>
          <input type="text" class="admin-form-input" id="q-answer" placeholder="如：TTFF（T=对，F=错）" required>
          <div style="font-size:0.72rem;color:var(--text-muted,#8a8a8a);margin-top:4px;line-height:1.5;">
            按选项顺序填 T/F。如 4 选项选 A → <code>TFFF</code>；选 AB → <code>TTFF</code>；判断题 → <code>T</code> 或 <code>F</code>
          </div>
        </div>
        <div class="admin-form-group">
          <label class="admin-form-label">难度（1-5）</label>
          <input type="number" class="admin-form-input" id="q-difficulty" min="1" max="5" value="3" required>
        </div>
        <div class="admin-form-group full">
          <label class="admin-form-label">解析</label>
          <textarea class="admin-form-textarea" id="q-explanation" placeholder="题目解析（可选）"></textarea>
        </div>
        <div class="admin-form-group full">
          <button type="submit" class="admin-form-submit">添加题目</button>
        </div>
      </form>
    </div>

    <div class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-title">
          ${ICONS.book}
          题目列表
        </div>
        <span class="admin-section-badge">${totalQ} 题</span>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center;">
        <div style="flex:1;min-width:200px;position:relative;">
          <input type="text" class="admin-form-input" id="admin-q-search" placeholder="搜索 ID、题目、科目、知识点..." value="${_adminQuestionSearch}" style="padding-left:36px;">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);">${ICONS.search}</span>
        </div>
        <button class="admin-btn admin-btn--primary" id="admin-q-search-btn" style="padding:8px 20px;font-size:0.85rem;white-space:nowrap;">搜索</button>
        <select class="admin-form-select" id="admin-q-module-filter" style="max-width:200px;">
          <option value="">全部模块</option>
          ${modules.map(m => `<option value="${m}" ${m === _adminQuestionModule ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
        <select class="admin-form-select" id="admin-q-target-filter" style="max-width:160px;">
          <option value="">全部目标</option>
          <option value="high_school" ${_adminQuestionTarget === 'high_school' ? 'selected' : ''}>高考</option>
          <option value="competition" ${_adminQuestionTarget === 'competition' ? 'selected' : ''}>竞赛</option>
          <option value="both" ${_adminQuestionTarget === 'both' ? 'selected' : ''}>共通</option>
        </select>
      </div>
  `;

  if (questions.length === 0) {
    html += `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">暂无题目，请在上方添加</div></div>`;
  } else {
    questions.forEach(q => {
      // 兼容两种字段命名：question (Supabase 默认) / stem (OCR 入库)
      const qStem = q.question || q.stem || '';
      const qText = qStem.length > 100 ? qStem.slice(0, 100) + '...' : qStem;
      const qExpl = q.explanation || q.analysis || '';
      // 选项支持数组 ["A","B"] 和对象 {"A":"...","B":"..."} 两种格式
      const optsHtml = _renderQuestionOptionsHtml(q.options);
      // 渲染 MTF 子题（sub_questions / subQuestions）
      const subsHtml = _renderSubQuestionsHtml(q.sub_questions || q.subQuestions);
      // Supabase 实时查看链接（按 id 拉取单题）
      const supaLink = q.id
        ? `<a href="https://supabase.com/dashboard/project/qxehkfucvmxuojjkdaqy/editor/2920?filter=id%3Deq%3A${encodeURIComponent(q.id)}" target="_blank" rel="noopener" class="admin-q-tag" style="background:rgba(99,102,241,0.1);color:#6366f1;text-decoration:none;font-size:0.65rem;cursor:pointer;" title="在 Supabase 中查看">Supabase</a>`
        : '';
      html += `
        <div class="admin-q-card" data-question-id="${q.id}">
          <div class="admin-q-top">
            <div class="admin-q-body">
              <div class="admin-q-text" title="${qStem.replace(/"/g, '&quot;')}">${escapeHtml(qText)}</div>
              <div class="admin-q-meta">
                <span class="admin-q-tag" style="background:rgba(59,130,246,0.1);color:#3b82f6;font-family:var(--font-mono,monospace);font-size:0.65rem;">ID: ${escapeHtml(String(q.id || ''))}</span>
                ${supaLink}
                <span class="admin-q-tag admin-q-tag--module">${escapeHtml(q.module || '')}</span>
                <span class="admin-q-tag admin-q-tag--diff">难度 ${escapeHtml(String(q.difficulty != null ? q.difficulty : 3))}</span>
                ${q.subject ? `<span class="admin-q-tag admin-q-tag--subject">${escapeHtml(q.subject)}</span>` : ''}
                ${q.concept ? `<span class="admin-q-tag" style="background:rgba(16,185,129,0.1);color:#10b981;">${escapeHtml(q.concept)}</span>` : ''}
                ${q.type ? `<span class="admin-q-tag" style="background:rgba(168,85,247,0.1);color:#a855f7;font-size:0.65rem;">${escapeHtml(q.type)}</span>` : ''}
                ${q.source === 'data' ? '<span class="admin-q-tag" style="background:rgba(107,114,128,0.1);color:#6b7280;">数据文件</span>' : ''}
              </div>
              ${optsHtml}
              ${subsHtml}
              ${qExpl ? `<div class="admin-q-explanation"><strong>解析：</strong>${qExpl.length > 80 ? qExpl.slice(0, 80) + '...' : qExpl}</div>` : ''}
            </div>
            <div class="admin-table-actions">
              <button class="admin-btn admin-btn--ghost" data-on='["handleEditQuestion",${JSON.stringify(q).replace(/'/g, "&#39;")}]'>
                编辑
              </button>
              <button class="admin-btn admin-btn--danger" data-on='["handleDeleteQuestion","${q.id}"]'>
                ${ICONS.trash}
                删除
              </button>
            </div>
          </div>
        </div>
      `;
    });

    // 分页
    if (totalPages > 1) {
      html += `<div style="display:flex;justify-content:center;gap:8px;margin-top:20px;align-items:center;">`;
      html += `<button class="admin-btn admin-btn--ghost" data-on='["adminGoQuestionPage",${currentPage - 1}]' ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>`;
      html += `<span style="color:var(--text-muted);font-size:0.85rem;">第 ${currentPage} / ${totalPages} 页</span>`;
      html += `<button class="admin-btn admin-btn--ghost" data-on='["adminGoQuestionPage",${currentPage + 1}]' ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>`;
      html += `</div>`;
    }
  }

  html += '</div>';

  // 本地题库评分与回收站：区块已作为 _LOCAL_SECTION_HTML 挂载于标签顶部（回收站入口在最上方）

  // 题目编辑弹窗
  html += `
    <div class="admin-modal-overlay" id="admin-question-modal" style="display:none;">
      <div class="admin-modal" style="max-width:680px;">
        <div class="admin-modal-header">
          <div class="admin-modal-title">编辑题目</div>
          <button class="admin-modal-close" data-on='["closeQuestionModal"]'>&times;</button>
        </div>
        <form id="admin-question-edit-form" class="admin-form-grid">
          <div class="admin-form-group">
            <label class="admin-form-label">ID</label>
            <input type="text" class="admin-form-input" id="eq-id" readonly>
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">模块</label>
            <select class="admin-form-select" id="eq-module">
              <option value="module_1">模块 1 - 生化/分子/细胞</option>
              <option value="module_2">模块 2 - 植物/微生物</option>
              <option value="module_3">模块 3 - 动物/生态</option>
              <option value="module_4">模块 4 - 遗传/进化/信息</option>
              <option value="exam">综合/考试</option>
            </select>
          </div>
          <div class="admin-form-group full">
            <label class="admin-form-label">题目内容</label>
            <textarea class="admin-form-textarea" id="eq-question" required></textarea>
          </div>
          <div class="admin-form-group full">
            <label class="admin-form-label">选项（每行一个）</label>
            <textarea class="admin-form-textarea" id="eq-options" style="min-height:80px;"></textarea>
            <div style="font-size:0.72rem;color:var(--text-muted,#8a8a8a);margin-top:4px;line-height:1.5;">
              <strong>选项格式：</strong>每行一个选项，选项数量决定答案长度。<br>
              • 单选题 / 多选题 / 判断题：直接写选项文字（如：<code>酶是蛋白质</code>）<br>
              • 多判断题（MTF）：写描述文字即可，无需标注对错（对错统一在「答案」字段用 TTFF 表示）
            </div>
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">答案（TTFF 格式，大小写均可）</label>
            <input type="text" class="admin-form-input" id="eq-answer" placeholder="如：TTFF / ttff / TfFf">
            <div style="font-size:0.72rem;color:var(--text-muted,#8a8a8a);margin-top:4px;line-height:1.6;">
              <strong>答案格式（统一 TTFF）：</strong>按选项顺序，每项用 <code>T</code> 或 <code>F</code> 表示。<br>
              • <strong>T</strong> = 该选项属于正确答案集合；<strong>F</strong> = 该选项不属于答案集合<br>
              • 单选题（4 选项）：<code>TFFF</code> 表示选 A；<code>FFTF</code> 表示选 C<br>
              • 多选题（4 选项）：<code>TTFF</code> 表示选 AB；<code>TFFT</code> 表示选 AD<br>
              • 判断题（1 选项）：<code>T</code> 表示对；<code>F</code> 表示错<br>
              • 多判断题：每项 T/F 直接对应该选项描述的真假<br>
              <strong>「问错的是？」类题目：</strong>T 表示该选项在答案视角下正确（即该选项确实是「错的」、属于答案），F 表示该选项在答案视角下错误（即该选项其实是对的、不属于答案）。<br>
              例：题目问「下列哪个错误」，答案是 A 和 B 错误 → TTFF 格式填 <code>TTFF</code>（A、B 是答案→T；C、D 不是答案→F）。
            </div>
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">类型</label>
            <select class="admin-form-select" id="eq-type">
              <option value="single">单选题</option>
              <option value="multiple">多选题</option>
              <option value="judgment">判断题</option>
              <option value="mtf">多判断题</option>
            </select>
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">科目</label>
            <input type="text" class="admin-form-input" id="eq-subject">
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">知识点</label>
            <input type="text" class="admin-form-input" id="eq-concept">
          </div>
          <div class="admin-form-group full">
            <label class="admin-form-label">解析</label>
            <textarea class="admin-form-textarea" id="eq-explanation" style="min-height:70px;"></textarea>
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">难度（1-5）</label>
            <div style="display:flex;gap:6px;align-items:center;" id="eq-difficulty-stars">
              ${[1,2,3,4,5].map(d => `<button type="button" class="admin-diff-star" data-diff="${d}" style="width:36px;height:36px;border-radius:8px;border:1.5px solid var(--border-light,#ece8e1);background:var(--surface-secondary,#faf7f2);cursor:pointer;font-size:1rem;transition:all 0.15s;">${d}</button>`).join('')}
            </div>
            <input type="hidden" id="eq-difficulty" value="3">
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">标签</label>
            <div id="eq-tags-container" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;"></div>
            <div style="display:flex;gap:6px;">
              <input type="text" class="admin-form-input" id="eq-tag-input" placeholder="输入标签后回车" class="bq-flex-1">
              <button type="button" class="admin-btn admin-btn--ghost" data-on='["addEditTag"]' style="white-space:nowrap;">添加</button>
            </div>
          </div>
          <div class="admin-form-group full">
            <label class="admin-form-label">题目图片</label>
            <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;">
              <div style="flex:1;min-width:200px;">
                <input type="file" accept="image/*" id="eq-image-file" style="font-size:0.82rem;" data-on-change='["handleQuestionImageUpload","__this"]'>
                <div style="font-size:0.72rem;color:var(--text-muted,#8a8a8a);margin-top:4px;">支持 JPG/PNG/GIF，将转为 Base64 存储</div>
              </div>
              <div id="eq-image-preview" style="max-width:120px;max-height:80px;overflow:hidden;border-radius:8px;border:1px solid var(--border-light,#ece8e1);display:none;">
                <img id="eq-image-preview-img" style="max-width:100%;max-height:80px;object-fit:contain;">
              </div>
            </div>
            <input type="hidden" id="eq-image" value="">
          </div>
          <div class="admin-form-group full">
            <button type="submit" class="admin-form-submit" id="eq-submit-btn">保存修改</button>
          </div>
        </form>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // 本地题库 · 评分与回收站（异步加载渲染）
  _renderLocalQuestionSection();

  // 搜索事件
  const searchInput = document.getElementById('admin-q-search');
  const searchBtn = document.getElementById('admin-q-search-btn');

  async function doSearch() {
    _adminQuestionSearch = searchInput.value.trim();
    _adminQuestionPage = 1;
    const data = await getQuestions({ search: _adminQuestionSearch, module: _adminQuestionModule, page: _adminQuestionPage });
    if (data) renderQuestionsTab(container, data);
  }

  // 搜索按钮点击
  if (searchBtn) {
    searchBtn.addEventListener('click', doSearch);
  }
  // 回车键触发搜索
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    }
  });

  // 模块筛选
  document.getElementById('admin-q-module-filter').addEventListener('change', async (e) => {
    _adminQuestionModule = e.target.value;
    _adminQuestionPage = 1;
    const data = await getQuestions({ search: _adminQuestionSearch, module: _adminQuestionModule, page: _adminQuestionPage });
    if (data) renderQuestionsTab(container, data);
  });

  // 目标筛选
  var targetFilter = document.getElementById('admin-q-target-filter');
  if (targetFilter) {
    targetFilter.addEventListener('change', async (e) => {
      _adminQuestionTarget = e.target.value;
      _adminQuestionPage = 1;
      const data = await getQuestions({ search: _adminQuestionSearch, module: _adminQuestionModule, page: _adminQuestionPage });
      if (data) renderQuestionsTab(container, data);
    });
  }

  // 绑定添加题目表单
  document.getElementById('add-question-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const optionsText = document.getElementById('q-options').value;
    const lines = optionsText.split('\n').map(o => o.trim()).filter(o => o);
    const qType = document.getElementById('q-type').value;
    var parsed = _parseTTFFAnswer(document.getElementById('q-answer').value, qType, lines);

    const question = {
      module: document.getElementById('q-module').value,
      question: document.getElementById('q-text').value,
      subject: document.getElementById('q-subject').value,
      concept: document.getElementById('q-concept').value,
      type: qType,
      options: lines,
      sub_questions: parsed.subQuestions,
      answer: parsed.answer,
      explanation: document.getElementById('q-explanation').value,
      difficulty: parseInt(document.getElementById('q-difficulty').value)
    };

    const result = await addQuestion(question);
    if (result) {
      const btn = e.target.querySelector('.admin-form-submit');
      btn.textContent = '添加成功！';
      btn.style.background = '#22c55e';
      setTimeout(() => {
        btn.textContent = '添加题目';
        btn.style.background = '';
      }, 1500);
      e.target.reset();
      const data = await getQuestions({ search: _adminQuestionSearch, module: _adminQuestionModule, page: _adminQuestionPage });
      if (data) renderQuestionsTab(container, data);
    } else {
      alert('题目添加失败，请重试');
    }
  });
}

window.handleDeleteQuestion = async function(id) {
  if (confirm('确定要删除这个题目吗？')) {
    const success = await deleteQuestion(id);
    if (success) {
      const data = await getQuestions({ search: _adminQuestionSearch, module: _adminQuestionModule, page: _adminQuestionPage });
      const container = document.getElementById('admin-tab-content');
      if (data && container) renderQuestionsTab(container, data);
    } else {
      alert('删除失败');
    }
  }
};

/* ============================================================
 * 本地题库 · 评分与回收站
 * 用户练习数据源为本地 JSON 全量题库（data/quiz.json + data/logic_questions.json
 * + resource/all.json 联赛真题池 + data/bank/daily_league_*.json 每日联赛），
 * 评分/回收站/覆盖数据存于 localStorage（storage.js），配合 js/core/rating.js
 * 的平滑评分算法（带中性先验）。管理员可在此查看评分、回收/恢复、重新评分、编辑题目（覆盖）。
 * ============================================================ */

/* 「本地题库 · 评分与回收站」区块模板：
 * 挂载于「题目管理」标签顶部（回收站筛选按钮在此，避免埋在页面底部找不到）。 */
const _LOCAL_SECTION_HTML = `
    <div class="admin-section" id="admin-local-questions-section" style="margin-top:0;">
      <div class="admin-section-header">
        <div class="admin-section-title">
          ${ICONS.star || ''}
          本地题库 · 评分与回收站
        </div>
        <span class="admin-section-badge" style="font-size:0.72rem;color:var(--text-muted,#8a8a8a);">数据来源：quiz + logic + 真题池(resource/all) + 每日联赛(daily_league_*)，全量约 3400 题</span>
      </div>
      <div id="admin-local-questions-body">
        <div style="padding:16px 0;color:var(--text-muted,#8a8a8a);font-size:0.85rem;">正在加载本地题库...</div>
      </div>
    </div>
  `;
window._adminLocalSectionHtml = function () { return _LOCAL_SECTION_HTML; };
/** 远端题目加载失败时的兜底挂载：保证回收站入口始终可见 */
window._mountLocalSectionFallback = function (container) {
  if (!container) return;
  container.insertAdjacentHTML('beforeend', _LOCAL_SECTION_HTML);
  _renderLocalQuestionSection();
};

let _localQuestionBankCache = null;
let _localQuestionFilter = 'all'; // 'all' | 'rated' | 'recycled'
let _localPageLimit = 100;        // 分页渲染（全量约 3400 题，一次性渲染会卡死页面）

/**
 * 加载本地全量题库（quiz + logic + 联赛真题池 + 每日联赛 6 分片），按 bioId 去重并缓存。
 */
async function _loadLocalQuestionBank(force) {
  if (_localQuestionBankCache && !force) return _localQuestionBankCache;
  const list = [];
  const DAILY_FILES = [
    'data/bank/daily_league_animal.json',
    'data/bank/daily_league_behavior_ecology.json',
    'data/bank/daily_league_biochem_microbe.json',
    'data/bank/daily_league_cellbio.json',
    'data/bank/daily_league_genetics_evolution.json',
    'data/bank/daily_league_plant.json'
  ];
  const sources = ['data/quiz.json', 'data/logic_questions.json', 'resource/all.json'].concat(DAILY_FILES);
  const results = await Promise.all(sources.map(function (url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }));
  results.forEach(function (data) {
    if (!data) return;
    // 注意：不要提前 || [] 兜底——每日联赛分片是 { DL-xx: 题目 } 字典，
    // 兜底成数组会跳过下面的字典识别分支导致读到 0 道题
    let arr = Array.isArray(data) ? data : (data['题库'] || data.questions);
    if (!Array.isArray(arr)) {
      // 每日联赛分片为 { DL-xx: 题目 } 字典形态：id 在字典 key 上，
      // 值内没有 id/bioId，须从 key 回填，否则去重会全部塌缩成同一个空 id
      const vals = Object.keys(data);
      const isQuestionDict = vals.length > 0 && vals.every(function (k) {
        const v = data[k];
        return v && typeof v === 'object' && ('question' in v || 'subQuestions' in v);
      });
      if (isQuestionDict) {
        arr = vals.map(function (k) {
          const v = data[k];
          return (!v.id && !v.bioId) ? Object.assign({ id: k }, v) : v;
        });
      }
    }
    if (!Array.isArray(arr)) return;
    const filtered = (typeof window._filterQuarantinedQuestions === 'function')
      ? window._filterQuarantinedQuestions(arr)
      : arr;
    list.push.apply(list, filtered);
  });
  // 按 bioId 去重（与练习/测验使用同一稳定 ID 算法）
  const seen = {};
  const out = [];
  list.forEach(function (q) {
    const id = _localBioId(q);
    if (!id || seen[id]) return;
    seen[id] = true;
    out.push(q);
  });
  _localQuestionBankCache = out;
  return out;
}

/**
 * 计算题目稳定 bioID（与 practice.js getQuestionBioId 同一算法）。
 */
function _localBioId(q) {
  if (!q) return '';
  if (typeof window.getQuestionBioIdSafe === 'function') return String(window.getQuestionBioIdSafe(q));
  var raw = q.bioId || q.id;
  if (raw === undefined || raw === null || raw === '') {
    var hashFn = (typeof hashQuestionId === 'function')
      ? hashQuestionId
      : function (str) {
          var h = 0;
          for (var i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h = h & h;
          }
          return Math.abs(h);
        };
    raw = String(hashFn((q.question || '') + (q.concept || '')));
  }
  return String((typeof window.resolveQuestionBioId === 'function')
    ? window.resolveQuestionBioId(raw)
    : raw);
}

function _localFindQuestion(bioId) {
  const list = _localQuestionBankCache || [];
  for (let i = 0; i < list.length; i++) {
    if (_localBioId(list[i]) === bioId) return list[i];
  }
  return null;
}

function _localRatingInfo(bioId) {
  let up = 0, down = 0;
  if (typeof getQuestionRating === 'function') {
    const r = getQuestionRating(bioId);
    if (r) { up = r.up || 0; down = r.down || 0; }
  }
  let score01 = 0.5;
  let weight = 1;
  if (typeof window.RatingCore === 'object') {
    score01 = window.RatingCore.wilsonScore(up, down);
    weight = window.RatingCore.ratingWeight(score01);
  }
  return { up: up, down: down, score01: score01, weight: weight };
}

function _localIsRecycled(bioId) {
  if (typeof isQuestionRecycled === 'function') return !!isQuestionRecycled(bioId);
  try {
    const list = JSON.parse(localStorage.getItem('bioquest_question_recycled') || '[]');
    return Array.isArray(list) && list.indexOf(bioId) !== -1;
  } catch (e) {
    return false;
  }
}

function _localHasOverride(bioId) {
  if (typeof getQuestionOverride === 'function') return !!getQuestionOverride(bioId);
  return false;
}

function _localQuestionSnippet(q) {
  const s = q.question || (q.subQuestions && q.subQuestions[0] && q.subQuestions[0].text) || '';
  return String(s).length > 90 ? String(s).slice(0, 90) + '…' : String(s);
}

const _LOCAL_TYPE_LABELS = { single: '单选', multiple: '多选', judgment: '判断', mtf: 'MTF' };

/**
 * 渲染「本地题库 · 评分与回收站」区块（工具栏 + 题目卡片列表 + 编辑弹窗）。
 */
async function _renderLocalQuestionSection() {
  const body = document.getElementById('admin-local-questions-body');
  if (!body) return;
  let list = _localQuestionBankCache;
  if (!list) {
    body.innerHTML = '<div style="padding:16px 0;color:var(--text-muted,#8a8a8a);font-size:0.85rem;">正在加载本地题库...</div>';
    try {
      list = await _loadLocalQuestionBank();
    } catch (e) {
      body.innerHTML = '<div style="padding:16px 0;color:var(--color-error,#c0553a);font-size:0.85rem;">本地题库加载失败：' + escapeHtml(e && e.message) + '</div>';
      return;
    }
  }

  // 统计 + 筛选
  let ratedCount = 0;
  let recycledCount = 0;
  const cards = [];
  list.forEach(function (q) {
    const id = _localBioId(q);
    const info = _localRatingInfo(id);
    const recycled = _localIsRecycled(id);
    if (info.up + info.down > 0) ratedCount++;
    if (recycled) recycledCount++;
    const show = (_localQuestionFilter === 'all') ||
      (_localQuestionFilter === 'rated' && info.up + info.down > 0) ||
      (_localQuestionFilter === 'recycled' && recycled);
    if (show) cards.push({ q: q, id: id, info: info, recycled: recycled });
  });

  // 回收站优先置顶，其余按评分升序（低分题优先处理）
  cards.sort(function (a, b) {
    if (a.recycled !== b.recycled) return a.recycled ? -1 : 1;
    return a.info.score01 - b.info.score01;
  });

  // 分页渲染：全量约 3400 题，首屏 100 条 + 「显示更多」按需加载，避免一次性渲染卡死
  const totalCards = cards.length;
  const visibleCards = cards.slice(0, _localPageLimit);

  const filterBtn = function (f, label, count, extraStyle) {
    return `<button class="admin-btn ${_localQuestionFilter === f ? 'admin-btn--primary' : 'admin-btn--ghost'}" data-on='["adminLocalFilter","${f}"]' style="${extraStyle || ''}">${label}（${count}）</button>`;
  };

  let html = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
      ${filterBtn('all', '全部', list.length)}
      ${filterBtn('rated', '已评分', ratedCount)}
      ${filterBtn('recycled', '回收站', recycledCount, recycledCount ? 'border-color:var(--color-error,#c0553a);color:var(--color-error,#c0553a);' : '')}
      <button class="admin-btn admin-btn--ghost" data-on='["adminLocalRefresh"]' style="margin-left:auto;">刷新</button>
    </div>
  `;

  if (totalCards === 0) {
    html += `<div class="admin-empty"><div class="admin-empty-icon">${ICONS.inbox}</div><div class="admin-empty-text">暂无符合筛选条件的题目</div></div>`;
  } else {
    visibleCards.forEach(function (item) {
      const q = item.q;
      const id = item.id;
      const info = item.info;
      const recycled = item.recycled;
      const hasOverride = _localHasOverride(id);
      const typeLabel = _LOCAL_TYPE_LABELS[q.type] || (q.type || '—');
      const scoreStr = (typeof window.RatingCore === 'object')
        ? window.RatingCore.formatQuestionScore(info.score01)
        : (1 + info.score01 * 4).toFixed(1);
      const scoreColor = info.score01 >= 0.6 ? '#10b981' : (info.score01 >= 0.4 ? '#c4956a' : '#ef4444');
      const hasVotes = info.up + info.down > 0;
      html += `
        <div class="admin-q-card" style="${recycled ? 'border-color:rgba(192,85,58,0.45);background:rgba(192,85,58,0.02);' : ''}">
          <div class="admin-q-top">
            <div class="admin-q-body">
              <div class="admin-q-text" title="${escapeHtml(String(q.question || ''))}">${escapeHtml(_localQuestionSnippet(q))}</div>
              <div class="admin-q-meta">
                <span class="admin-q-tag" style="background:rgba(168,85,247,0.1);color:#a855f7;font-size:0.65rem;">${escapeHtml(typeLabel)}</span>
                ${q.subject ? `<span class="admin-q-tag admin-q-tag--subject">${escapeHtml(q.subject)}</span>` : ''}
                ${q.concept ? `<span class="admin-q-tag" style="background:rgba(16,185,129,0.1);color:#10b981;">${escapeHtml(q.concept)}</span>` : ''}
                <span class="admin-q-tag" style="background:rgba(107,114,128,0.1);color:#6b7280;font-family:var(--font-mono,monospace);font-size:0.65rem;">${escapeHtml(id)}</span>
                ${recycled ? '<span class="admin-q-tag" style="background:rgba(192,85,58,0.12);color:#c0553a;font-weight:600;">回收站</span>' : ''}
                ${hasOverride ? '<span class="admin-q-tag" style="background:rgba(99,102,241,0.1);color:#6366f1;">已覆盖</span>' : ''}
              </div>
              <div style="margin-top:6px;font-size:0.8rem;color:var(--text-muted,#8a8a8a);">
                评分 <strong style="color:${scoreColor};">${scoreStr}</strong>
                <span style="margin:0 6px;opacity:0.5;">|</span>
                ${info.up} · ${info.down}
                <span style="margin:0 6px;opacity:0.5;">|</span>
                出现率权重 ${info.weight.toFixed(2)}×
                ${hasVotes ? '' : '<span style="margin-left:8px;font-size:0.72rem;">（暂无投票）</span>'}
              </div>
            </div>
            <div class="admin-table-actions">
              <button class="admin-btn ${recycled ? 'admin-btn--ghost' : 'admin-btn--danger'}" data-on='["adminToggleLocalRecycle","${id}"]' style="white-space:nowrap;">${recycled ? '恢复' : '回收'}</button>
              <button class="admin-btn admin-btn--ghost" data-on='["adminRescoreLocalQuestion","${id}"]' style="white-space:nowrap;">重新评分</button>
              <button class="admin-btn admin-btn--ghost" data-on='["adminEditLocalQuestion","${id}"]' style="white-space:nowrap;">编辑</button>
            </div>
          </div>
        </div>
      `;
    });
  }

  if (totalCards > visibleCards.length) {
    html += `<div style="text-align:center;margin-top:12px;"><button class="admin-btn admin-btn--ghost" data-on='["adminLocalMore"]'>显示更多（已显示 ${visibleCards.length} / ${totalCards}）</button></div>`;
  }

  body.innerHTML = html + _localEditModalHtml();
}

/**
 * 编辑弹窗（管理员覆盖）：题干 / 选项 / TTFF 答案 / 解析。
 */
function _localEditModalHtml() {
  return `
    <div class="admin-modal-overlay" id="admin-local-edit-modal" style="display:none;">
      <div class="admin-modal" style="max-width:640px;">
        <div class="admin-modal-header">
          <div class="admin-modal-title">编辑本地题目（保存为管理员覆盖）</div>
          <button class="admin-modal-close" data-on='["adminCloseLocalEditModal"]'>&times;</button>
        </div>
        <form id="admin-local-edit-form" class="admin-form-grid">
          <input type="hidden" id="local-eq-bioid">
          <div class="admin-form-group full">
            <label class="admin-form-label">题目内容</label>
            <textarea class="admin-form-textarea" id="local-eq-question" required></textarea>
          </div>
          <div class="admin-form-group full">
            <label class="admin-form-label">选项 / 陈述（每行一个）</label>
            <textarea class="admin-form-textarea" id="local-eq-options" style="min-height:80px;"></textarea>
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">答案（TTFF）</label>
            <input type="text" class="admin-form-input" id="local-eq-answer" placeholder="如：TTFF">
            <div style="font-size:0.72rem;color:var(--text-muted,#8a8a8a);margin-top:4px;">MTF 每项 T/F 对应该陈述真假；单选 TFFF=选A，多选 TTFF=选AB</div>
          </div>
          <div class="admin-form-group full">
            <label class="admin-form-label">解析</label>
            <textarea class="admin-form-textarea" id="local-eq-explanation" style="min-height:60px;"></textarea>
          </div>
          <div class="admin-form-group full" id="local-eq-override-row" style="display:none;">
            <span style="font-size:0.75rem;color:#6366f1;">已存在管理员覆盖，保存将替换；可点击「清除覆盖」还原题库原题。</span>
          </div>
          <div class="admin-form-group full" style="display:flex;gap:8px;justify-content:flex-end;">
            <button type="button" class="admin-btn admin-btn--ghost" id="local-eq-clear-override" data-on='["adminClearLocalOverride"]' style="display:none;">清除覆盖</button>
            <button type="submit" class="admin-form-submit">保存覆盖</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

window.adminLocalFilter = function(f) {
  _localQuestionFilter = (f === 'rated' || f === 'recycled') ? f : 'all';
  _localPageLimit = 100;
  _renderLocalQuestionSection();
};

window.adminLocalMore = function() {
  _localPageLimit += 200;
  _renderLocalQuestionSection();
};

window.adminLocalRefresh = function() {
  _localPageLimit = 100;
  _loadLocalQuestionBank(true).then(function () {
    _renderLocalQuestionSection();
  }).catch(function () {
    _renderLocalQuestionSection();
  });
};

window.adminToggleLocalRecycle = function(bioId) {
  const recycled = _localIsRecycled(bioId);
  if (recycled) {
    if (typeof unrecycleQuestion === 'function') unrecycleQuestion(bioId);
  } else {
    if (typeof recycleQuestion === 'function') recycleQuestion(bioId);
  }
  showAdminToast(recycled ? '已从回收站恢复' : '已移入回收站', 'success');
  _renderLocalQuestionSection();
};

window.adminRescoreLocalQuestion = function(bioId) {
  if (typeof adminSetQuestionRating !== 'function') { showAdminToast('存储模块未就绪', 'error'); return; }
  const cur = (typeof getQuestionRating === 'function' ? getQuestionRating(bioId) : null) || { up: 0, down: 0 };
  const upStr = prompt('设置「点赞数」（当前 ' + cur.up + '）：', String(cur.up));
  if (upStr === null) return;
  const downStr = prompt('设置「点踩数」（当前 ' + cur.down + '）：', String(cur.down));
  if (downStr === null) return;
  const up = parseInt(upStr, 10);
  const down = parseInt(downStr, 10);
  if (isNaN(up) || isNaN(down) || up < 0 || down < 0) {
    showAdminToast('请输入非负整数', 'error');
    return;
  }
  adminSetQuestionRating(bioId, up, down);
  // 评分与回收状态联动：评分过低自动回收，评分提升后自动恢复
  if (typeof window.RatingCore === 'object' && window.RatingCore.shouldRecycleQuestion(up, down)) {
    if (typeof recycleQuestion === 'function') recycleQuestion(bioId);
  } else if (typeof unrecycleQuestion === 'function') {
    unrecycleQuestion(bioId);
  }
  showAdminToast('评分已更新', 'success');
  _renderLocalQuestionSection();
};

window.adminEditLocalQuestion = function(bioId) {
  const q = _localFindQuestion(bioId);
  const modal = document.getElementById('admin-local-edit-modal');
  if (!modal || !q) { showAdminToast('未找到该题目', 'error'); return; }
  const patch = (typeof getQuestionOverride === 'function') ? getQuestionOverride(bioId) : null;
  const eff = patch ? Object.assign({}, q, patch) : q;
  document.getElementById('local-eq-bioid').value = bioId;
  document.getElementById('local-eq-question').value = eff.question || '';
  const subs = eff.subQuestions;
  let lines = [];
  if (Array.isArray(eff.options)) lines = eff.options.map(String);
  else if (Array.isArray(subs)) lines = subs.map(function (s) { return s.text || ''; });
  document.getElementById('local-eq-options').value = lines.join('\n');
  document.getElementById('local-eq-answer').value = _answerToTTFF(eff.answer, eff.type || 'single', lines.length, subs);
  document.getElementById('local-eq-explanation').value = eff.explanation || '';
  document.getElementById('local-eq-override-row').style.display = patch ? '' : 'none';
  document.getElementById('local-eq-clear-override').style.display = patch ? '' : 'none';
  modal.style.display = 'flex';
  // 重新绑定提交（避免重复监听）
  const form = document.getElementById('admin-local-edit-form');
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  newForm.addEventListener('submit', function (e) {
    e.preventDefault();
    adminSaveLocalOverride();
  });
};

window.adminCloseLocalEditModal = function() {
  const modal = document.getElementById('admin-local-edit-modal');
  if (modal) modal.style.display = 'none';
};

window.adminSaveLocalOverride = function() {
  if (typeof setQuestionOverride !== 'function') { showAdminToast('存储模块未就绪', 'error'); return; }
  const bioId = document.getElementById('local-eq-bioid').value;
  const q = _localFindQuestion(bioId);
  if (!bioId || !q) { showAdminToast('未找到该题目', 'error'); return; }
  const type = q.type || 'single';
  const question = document.getElementById('local-eq-question').value.trim();
  if (!question) { showAdminToast('题干不能为空', 'error'); return; }
  const lines = document.getElementById('local-eq-options').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  const ttff = document.getElementById('local-eq-answer').value;
  const explanation = document.getElementById('local-eq-explanation').value;
  const parsed = _parseTTFFAnswer(ttff, type, lines);
  const patch = { question: question, explanation: explanation };
  if (QuestionModel.isMtf(type)) {
    // MTF（mtf/multi_judge 别名归一，见 question-model.js）：patch 使用 subQuestions（与本地题库/练习/测验读取一致）
    patch.subQuestions = (parsed.subQuestions && parsed.subQuestions.length)
      ? parsed.subQuestions
      : lines.map(function (t, i) { return { label: String.fromCharCode(65 + i), text: t, answer: null }; });
    patch.answer = '';
  } else {
    patch.options = lines;
    patch.answer = parsed.answer;
  }
  setQuestionOverride(bioId, patch);
  showAdminToast('已保存管理员覆盖', 'success');
  adminCloseLocalEditModal();
  _renderLocalQuestionSection();
};

window.adminClearLocalOverride = function() {
  const bioId = document.getElementById('local-eq-bioid').value;
  if (!bioId) return;
  if (typeof clearQuestionOverride === 'function') clearQuestionOverride(bioId);
  showAdminToast('已清除覆盖', 'success');
  adminCloseLocalEditModal();
  _renderLocalQuestionSection();
};

/* ===== 题目编辑相关 ===== */
let _editQuestionTags = [];

/**
 * 将存储格式的答案转换为 TTFF 格式（用于编辑表单显示）
 * 支持的存储格式：
 *   - 单选/多选：answer = "A" / "AB" / "ACD"（字母组合）
 *   - 判断题：answer = "T" / "F"
 *   - MTF：sub_questions = [{answer: true/false}, ...]
 *   - 对象格式：answer = {"A": true, "B": false, ...}
 * @returns {string} TTFF 字符串（如 "TTFF"）
 */
function _answerToTTFF(answer, qType, optionCount, subQuestions) {
  // MTF：从 sub_questions 转换
  if (Array.isArray(subQuestions) && subQuestions.length > 0) {
    return subQuestions.map(function (s) {
      return s.answer === true ? 'T' : 'F';
    }).join('');
  }
  // 对象格式：{"A": true, "B": false, ...}
  if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
    var keys = Object.keys(answer).sort();
    return keys.map(function (k) {
      return answer[k] === true ? 'T' : 'F';
    }).join('');
  }
  // 数字索引格式（逻辑推理题：answer = 正确选项索引 0/1/2/...）：转换为 TFFF 格式
  if (typeof answer === 'number' && isFinite(answer)) {
    var nn = optionCount || 4;
    var indexArr = new Array(nn).fill('F');
    if (answer >= 0 && answer < nn) indexArr[answer] = 'T';
    return indexArr.join('');
  }
  var ans = String(answer || '').toUpperCase().trim();
  if (!ans) return '';
  // 判断题：T/F 直接返回
  if (qType === 'judgment' || (ans.length === 1 && (ans === 'T' || ans === 'F'))) {
    return ans;
  }
  // 已经是 TTFF 格式（纯 T/F 组成）
  if (/^[TF]+$/i.test(ans)) {
    return ans.toUpperCase();
  }
  // 字母格式：A/B/C/D → TTFF
  if (/^[A-Z]+$/.test(ans)) {
    var n = optionCount || ans.length;
    var arr = new Array(n).fill('F');
    for (var i = 0; i < ans.length; i++) {
      var idx = ans.charCodeAt(i) - 65; // A=0, B=1, ...
      if (idx >= 0 && idx < n) arr[idx] = 'T';
    }
    return arr.join('');
  }
  // 逗号分隔格式：A:T,B:F → TTFF
  if (ans.indexOf(':') >= 0 || ans.indexOf('，') >= 0 || ans.indexOf(',') >= 0) {
    var parts = ans.split(/[,，]/);
    var map = {};
    parts.forEach(function (p) {
      var m = p.match(/([A-Z])\s*[:：]\s*([TF])/i);
      if (m) map[m[1].toUpperCase()] = m[2].toUpperCase();
    });
    var keys2 = Object.keys(map).sort();
    return keys2.map(function (k) { return map[k] || 'F'; }).join('');
  }
  return ans;
}

/**
 * 将 TTFF 格式的答案输入转换为存储格式
 * @returns {{answer: string, subQuestions: Array|undefined}}
 */
function _parseTTFFAnswer(ttff, qType, optionLines) {
  var raw = String(ttff || '').toUpperCase().trim();
  var n = optionLines.length;
  var result = { answer: '', subQuestions: undefined };

  if (!raw) return result;

  // 确保只含 T/F
  var clean = raw.replace(/[^TF]/gi, '').toUpperCase();
  if (!clean) return result;

  // 判断题：直接存 T/F
  if (qType === 'judgment' || n === 1) {
    result.answer = clean.charAt(0);
    return result;
  }

  // MTF（mtf/multi_judge 别名归一，见 question-model.js）：转换为 sub_questions
  if (QuestionModel.isMtf(qType)) {
    var subs = [];
    for (var i = 0; i < n && i < clean.length; i++) {
      subs.push({
        label: String.fromCharCode(65 + i),
        text: optionLines[i] || '',
        answer: clean.charAt(i) === 'T'
      });
    }
    result.subQuestions = subs;
    result.answer = ''; // MTF 不用 answer 字段
    return result;
  }

  // 单选/多选：TTFF → 字母组合
  var letters = '';
  for (var j = 0; j < n && j < clean.length; j++) {
    if (clean.charAt(j) === 'T') {
      letters += String.fromCharCode(65 + j);
    }
  }
  result.answer = letters;
  return result;
}

window.handleEditQuestion = function(qData) {
  const modal = document.getElementById('admin-question-modal');
  if (!modal) return;

  document.getElementById('eq-id').value = qData.id || '';
  document.getElementById('eq-module').value = qData.module || 'module_1';
  document.getElementById('eq-question').value = qData.question || qData.stem || '';
  document.getElementById('eq-type').value = qData.type || 'single';
  document.getElementById('eq-subject').value = qData.subject || '';
  document.getElementById('eq-concept').value = qData.concept || '';
  document.getElementById('eq-explanation').value = qData.explanation || qData.analysis || '';

  // 选项（兼容数组、对象、sub_questions 三种格式）
  const options = qData.options;
  const subQuestions = qData.sub_questions || qData.subQuestions;
  let optionsText = '';
  let optionCount = 0;
  if (Array.isArray(options) && options.length > 0) {
    optionsText = options.join('\n');
    optionCount = options.length;
  } else if (options && typeof options === 'object' && !Array.isArray(options) && Object.keys(options).length > 0) {
    var sortedKeys = Object.keys(options).sort();
    optionsText = sortedKeys.map(function (k) { return options[k]; }).join('\n');
    optionCount = sortedKeys.length;
  } else if (Array.isArray(subQuestions) && subQuestions.length > 0) {
    // MTF：只回填选项文字，对错统一在答案字段用 TTFF 表示
    optionsText = subQuestions.map(function (s) { return (s.text || ''); }).join('\n');
    optionCount = subQuestions.length;
  }
  document.getElementById('eq-options').value = optionsText;

  // 答案：将存储格式转换为 TTFF 格式显示
  document.getElementById('eq-answer').value = _answerToTTFF(qData.answer, qData.type, optionCount, subQuestions);

  // 难度
  const diff = qData.difficulty || 3;
  document.getElementById('eq-difficulty').value = diff;
  updateDifficultyStars(diff);

  // 标签
  _editQuestionTags = Array.isArray(qData.tags) ? [...qData.tags] : [];
  renderEditTags();

  // 图片
  const imgVal = qData.image || '';
  document.getElementById('eq-image').value = imgVal;
  const preview = document.getElementById('eq-image-preview');
  const previewImg = document.getElementById('eq-image-preview-img');
  if (imgVal) {
    previewImg.src = imgVal;
    preview.style.display = '';
  } else {
    preview.style.display = 'none';
    previewImg.src = '';
  }
  document.getElementById('eq-image-file').value = '';

  modal.style.display = 'flex';

  // 绑定难度星标点击
  document.querySelectorAll('#eq-difficulty-stars .admin-diff-star').forEach(btn => {
    btn.onclick = function() {
      const d = parseInt(this.dataset.diff);
      document.getElementById('eq-difficulty').value = d;
      updateDifficultyStars(d);
    };
  });

  // 标签输入回车
  const tagInput = document.getElementById('eq-tag-input');
  tagInput.onkeydown = function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addEditTag();
    }
  };

  // 绑定表单提交
  const form = document.getElementById('admin-question-edit-form');
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('eq-submit-btn');
    const qid = document.getElementById('eq-id').value;
    const optionsText = document.getElementById('eq-options').value;
    const qType = document.getElementById('eq-type').value;
    
    // 解析选项文本 + TTFF 答案
    const lines = optionsText.split('\n').map(o => o.trim()).filter(o => o);
    let options = [];
    let subQuestions = [];
    var ttffInput = document.getElementById('eq-answer').value;
    var parsed = _parseTTFFAnswer(ttffInput, qType, lines);

    if (QuestionModel.isMtf(qType)) {
      // MTF（mtf/multi_judge 别名归一，见 question-model.js）：选项为纯文字数组，答案在 sub_questions
      subQuestions = parsed.subQuestions || lines.map(function(line, i) {
        return { label: String.fromCharCode(65 + i), text: line, answer: null };
      });
      options = [];
    } else {
      // 单选/判断/多选：选项为数组，答案为字母组合或 T/F
      options = lines;
    }

    const updateData = {
      module: document.getElementById('eq-module').value,
      question: document.getElementById('eq-question').value,
      subject: document.getElementById('eq-subject').value,
      concept: document.getElementById('eq-concept').value,
      type: qType,
      options: options,
      sub_questions: subQuestions.length > 0 ? subQuestions : undefined,
      answer: parsed.answer,
      explanation: document.getElementById('eq-explanation').value,
      difficulty: parseInt(document.getElementById('eq-difficulty').value),
      tags: _editQuestionTags,
      image: document.getElementById('eq-image').value || undefined,
    };

    submitBtn.textContent = '保存中...';
    submitBtn.disabled = true;

    const result = await updateQuestion(qid, updateData);
    if (result) {
      showAdminToast('题目更新成功！', 'success');
      closeQuestionModal();
      const data = await getQuestions({ search: _adminQuestionSearch, module: _adminQuestionModule, page: _adminQuestionPage });
      const container = document.getElementById('admin-tab-content');
      if (data && container) renderQuestionsTab(container, data);
    } else {
      showAdminToast('更新失败，请重试', 'error');
      submitBtn.textContent = '保存修改';
      submitBtn.disabled = false;
    }
  });
};

function updateDifficultyStars(diff) {
  document.querySelectorAll('#eq-difficulty-stars .admin-diff-star').forEach(btn => {
    const d = parseInt(btn.dataset.diff);
    if (d <= diff) {
      btn.style.background = 'var(--color-amber, #c4956a)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'var(--color-amber, #c4956a)';
    } else {
      btn.style.background = 'var(--surface-secondary, #faf7f2)';
      btn.style.color = '';
      btn.style.borderColor = 'var(--border-light, #ece8e1)';
    }
  });
}

function renderEditTags() {
  const container = document.getElementById('eq-tags-container');
  if (!container) return;
  container.innerHTML = _editQuestionTags.map((tag, i) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(90,125,92,0.1);color:var(--color-sage,#5a7d5c);border-radius:8px;font-size:0.78rem;font-weight:500;">
      ${tag}
      <button type="button" data-on='["removeEditTag",${i}]' style="background:none;border:none;cursor:pointer;color:var(--color-error,#c0553a);font-size:0.85rem;padding:0 2px;">&times;</button>
    </span>`
  ).join('');
}

window.addEditTag = function() {
  const input = document.getElementById('eq-tag-input');
  const tag = input.value.trim();
  if (tag && !_editQuestionTags.includes(tag)) {
    _editQuestionTags.push(tag);
    renderEditTags();
  }
  input.value = '';
  input.focus();
};

window.removeEditTag = function(index) {
  _editQuestionTags.splice(index, 1);
  renderEditTags();
};

window.closeQuestionModal = function() {
  const modal = document.getElementById('admin-question-modal');
  if (modal) modal.style.display = 'none';
};

window.handleQuestionImageUpload = function(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > ADMIN_IMAGE_MAX_BYTES) {
    showAdminToast('图片大小不能超过 2MB', 'error');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    document.getElementById('eq-image').value = base64;
    const preview = document.getElementById('eq-image-preview');
    const previewImg = document.getElementById('eq-image-preview-img');
    previewImg.src = base64;
    preview.style.display = '';
  };
  reader.readAsDataURL(file);
};

window.adminGoQuestionPage = async function(page) {
  if (page < 1) return;
  _adminQuestionPage = page;
  const data = await getQuestions({ search: _adminQuestionSearch, module: _adminQuestionModule, page: _adminQuestionPage });
  const container = document.getElementById('admin-tab-content');
  if (data && container) renderQuestionsTab(container, data);
};
