/**
 * TATABOX - 管理后台 · 电子书管理子模块（Issue #17 自 admin.js 拆分）
 * 由 admin.js 的 loadTabContent 在切换到「电子书管理」标签时动态注入加载。
 * 依赖：js/admin/admin.js（核心）；笔记数据 js/pages/ebook.js 在本模块内按需动态加载。
 */

/* ===== 电子书管理标签 ===== */
async function renderEbookTab(container) {
  const PARTS = [
    { id: 'part1', name: '第1篇 细胞', chapters: 5, sections: 13 },
    { id: 'part2', name: '第2篇 动物的形态与功能', chapters: 11, sections: 23 },
    { id: 'part3', name: '第3篇 植物的形态与功能', chapters: 3, sections: 7 },
    { id: 'part4', name: '第4篇 遗传与变异', chapters: 4, sections: 9 },
    { id: 'part5', name: '第5篇 生物进化', chapters: 3, sections: 6 },
    { id: 'part6', name: '第6篇 生态学', chapters: 4, sections: 8 }
  ];

  const totalChapters = PARTS.reduce((s, p) => s + p.chapters, 0);
  const totalSections = PARTS.reduce((s, p) => s + p.sections, 0);

  // Load any saved edits
  let savedEdits = {};
  try {
    const raw = localStorage.getItem('bioquest_ebook_edits');
    if (raw) savedEdits = JSON.parse(raw);
  } catch(e) {}

  let html = `
    <div class="admin-stats-row">
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--green">${ICONS.ebook}</div>
        <div>
          <div class="admin-stat-num">${totalChapters}</div>
          <div class="admin-stat-label">章节数</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--amber">${ICONS.layers}</div>
        <div>
          <div class="admin-stat-num">${totalSections}</div>
          <div class="admin-stat-label">小节数</div>
        </div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-icon admin-stat-icon--blue">${ICONS.book}</div>
        <div>
          <div class="admin-stat-num">6</div>
          <div class="admin-stat-label">篇</div>
        </div>
      </div>
    </div>

    <div class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-title">
          ${ICONS.ebook}
          笔记结构 — 陈阅增《普通生物学》第4版
        </div>
        <div style="display:flex;gap:8px;">
          <a href="ebook.html" target="_blank" class="admin-btn admin-btn--primary" style="text-decoration:none;">
            预览电子书
          </a>
        </div>
      </div>

      <div class="admin-table-wrap" style="margin-bottom:24px;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>篇</th>
              <th>章节数</th>
              <th>小节数</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            ${PARTS.map(p => `
              <tr>
                <td class="admin-table-name">${escapeHtml(p.name)}</td>
                <td>${p.chapters}</td>
                <td>${p.sections}</td>
                <td><span class="admin-q-tag admin-q-tag--module">已发布</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-title">
          ${ICONS.settings}
          内容编辑
        </div>
        <span class="admin-section-badge">本地编辑</span>
      </div>

      <div style="background:var(--surface-secondary,#faf7f2);border-radius:12px;padding:16px;margin-bottom:20px;font-size:0.85rem;color:var(--text-secondary,#4a4a4a);line-height:1.6;">
        编辑内容保存在浏览器本地存储中。如需永久修改，请编辑 <code style="background:rgba(90,125,92,0.1);padding:2px 6px;border-radius:4px;font-family:var(--font-mono);">js/pages/ebook.js</code> 中的 BOOK_DATA。
      </div>

      <form id="admin-ebook-edit-form" class="admin-form-grid">
        <div class="admin-form-group">
          <label class="admin-form-label">选择篇</label>
          <select class="admin-form-select" id="ebook-part-select">
            ${PARTS.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="admin-form-group">
          <label class="admin-form-label">选择章</label>
          <select class="admin-form-select" id="ebook-chapter-select">
            <option>请先选择篇</option>
          </select>
        </div>
        <div class="admin-form-group full">
          <label class="admin-form-label">选择小节</label>
          <select class="admin-form-select" id="ebook-section-select">
            <option>请先选择章</option>
          </select>
        </div>
        <div class="admin-form-group full">
          <label class="admin-form-label">内容</label>
          <textarea class="admin-form-textarea" id="ebook-content-edit" style="min-height:200px;font-size:0.88rem;line-height:1.8;" placeholder="选择小节后，内容将显示在此处..."></textarea>
        </div>
        <div class="admin-form-group full">
          <button type="submit" class="admin-form-submit" id="ebook-save-btn">保存修改</button>
        </div>
      </form>

      <div style="margin-top:16px;">
        <h4 style="font-size:0.92rem;font-weight:600;margin-bottom:8px;color:var(--color-deep,#1a3a2a);">已保存的编辑</h4>
        <div id="ebook-saved-edits" style="font-size:0.85rem;color:var(--text-secondary,#4a4a4a);">
          ${Object.keys(savedEdits).length === 0 ? '<span class="bq-text-muted">暂无本地编辑</span>' :
            Object.keys(savedEdits).map(key => `<div style="padding:6px 0;border-bottom:1px solid var(--border-light,#ece8e1);display:flex;justify-content:space-between;align-items:center;"><span>${escapeHtml(key)}</span><button class="admin-btn admin-btn--danger" style="padding:4px 10px;font-size:0.75rem;" data-on='["deleteEbookEdit","${escapeHtml(key)}"]'>删除</button></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-title">
          ${ICONS.ebook}
          PDF管理
        </div>
        <span class="admin-section-badge">Supabase Storage</span>
      </div>

      <div style="background:var(--surface-secondary,#faf7f2);border-radius:12px;padding:16px;margin-bottom:20px;font-size:0.85rem;color:var(--text-secondary,#4a4a4a);line-height:1.6;">
        <strong>使用说明：</strong><br>
        1. 需要在 Supabase 中创建名为 <code style="background:rgba(90,125,92,0.1);padding:2px 6px;border-radius:4px;font-family:var(--font-mono);">bioquest-ebooks</code> 的 Storage Bucket<br>
        2. Bucket 应设置为 <strong>私有（Private）</strong>，不要设为公开<br>
        3. PDF 文件大小建议不超过 <strong>50MB</strong>
      </div>

      <div style="background:var(--surface-secondary,#faf7f2);border-radius:12px;padding:16px;margin-bottom:20px;">
        <h4 style="font-size:0.92rem;font-weight:600;margin-bottom:12px;color:var(--color-deep,#1a3a2a);">添加新书</h4>
        <form id="admin-custom-ebook-form" class="admin-form-grid" style="gap:10px;">
          <div class="admin-form-group">
            <label class="admin-form-label">书名</label>
            <input type="text" class="admin-form-input" id="custom-ebook-title" placeholder="输入书名" required />
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">作者/版本</label>
            <input type="text" class="admin-form-input" id="custom-ebook-author" placeholder="如：第3版 / 张三" />
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">分类</label>
            <select class="admin-form-select" id="custom-ebook-category">
              <option value="生物竞赛教材">生物竞赛教材</option>
              <option value="遗传学">遗传学</option>
              <option value="生态学">生态学</option>
              <option value="生物化学">生物化学</option>
              <option value="其他">其他</option>
            </select>
          </div>
          <div class="admin-form-group">
            <label class="admin-form-label">PDF文件</label>
            <input type="file" accept="application/pdf" id="custom-ebook-file" required style="font-size:0.85rem;" />
          </div>
          <div class="admin-form-group full">
            <button type="submit" class="admin-form-submit" id="custom-ebook-submit-btn">上传新书</button>
          </div>
        </form>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>书名</th>
              <th>PDF状态</th>
              <th>上传</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="admin-pdf-tbody">
          </tbody>
        </table>
      </div>

      <div id="admin-custom-ebooks-section" class="bq-mt-24">
        <h4 style="font-size:0.92rem;font-weight:600;margin-bottom:10px;color:var(--color-deep,#1a3a2a);">自定义上传的书籍</h4>
        <div id="admin-custom-ebooks-list"></div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Load BOOK_DATA from ebook.js for the cascading selects
  const partSelect = document.getElementById('ebook-part-select');
  const chapterSelect = document.getElementById('ebook-chapter-select');
  const sectionSelect = document.getElementById('ebook-section-select');
  const contentEdit = document.getElementById('ebook-content-edit');

  // 安全加载 ALL_BOOKS：优先读全局变量，无则动态加载脚本
  let bookData = null;
  try {
    if (typeof window.ALL_BOOKS !== 'undefined' && window.ALL_BOOKS) {
      // ebook.js 已加载，直接读取全局变量
      bookData = { parts: window.ALL_BOOKS };
    } else {
      // 动态加载 ebook.js 脚本，然后读取 window.ALL_BOOKS
      await new Promise(function(resolve, reject) {
        var script = document.createElement('script');
        script.src = 'js/pages/ebook.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      if (typeof window.ALL_BOOKS !== 'undefined' && window.ALL_BOOKS) {
        bookData = { parts: window.ALL_BOOKS };
      }
    }
  } catch(e) {
    console.warn('[Admin] 无法加载笔记数据:', e);
  }

  function updateChapters() {
    const partId = partSelect.value;
    chapterSelect.innerHTML = '<option>请选择章</option>';
    sectionSelect.innerHTML = '<option>请先选择章</option>';
    contentEdit.value = '';

    if (!bookData || !bookData.parts) return;
    const part = bookData.parts.find(p => p.id === partId);
    if (!part || !part.chapters) return;

    part.chapters.forEach((ch, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = ch.title || ('第' + (i+1) + '章');
      chapterSelect.appendChild(opt);
    });
  }

  function updateSections() {
    const partId = partSelect.value;
    const chIdx = parseInt(chapterSelect.value);
    sectionSelect.innerHTML = '<option>请选择小节</option>';
    contentEdit.value = '';

    if (isNaN(chIdx) || !bookData || !bookData.parts) return;
    const part = bookData.parts.find(p => p.id === partId);
    if (!part || !part.chapters || !part.chapters[chIdx]) return;

    const ch = part.chapters[chIdx];
    if (!ch.sections) return;

    ch.sections.forEach((sec, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = sec.title || ('小节 ' + (i+1));
      sectionSelect.appendChild(opt);
    });
  }

  function loadSectionContent() {
    const partId = partSelect.value;
    const chIdx = parseInt(chapterSelect.value);
    const secIdx = parseInt(sectionSelect.value);

    if (isNaN(chIdx) || isNaN(secIdx) || !bookData || !bookData.parts) return;
    const part = bookData.parts.find(p => p.id === partId);
    if (!part || !part.chapters || !part.chapters[chIdx] || !part.chapters[chIdx].sections) return;
    const sec = part.chapters[chIdx].sections[secIdx];
    if (!sec) return;

    // Check for saved edit first
    const editKey = partId + '/ch' + chIdx + '/sec' + secIdx;
    if (savedEdits[editKey]) {
      contentEdit.value = savedEdits[editKey];
    } else {
      contentEdit.value = sec.content || '';
    }
  }

  partSelect.addEventListener('change', updateChapters);
  chapterSelect.addEventListener('change', updateSections);
  sectionSelect.addEventListener('change', loadSectionContent);

  // Initialize chapters if bookData loaded
  if (bookData) {
    updateChapters();
  }

  // Save edit
  document.getElementById('admin-ebook-edit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const partId = partSelect.value;
    const chIdx = chapterSelect.value;
    const secIdx = sectionSelect.value;

    if (!partId || chIdx === '请选择章' || secIdx === '请选择小节') {
      showAdminToast('请先选择篇、章、小节', 'error');
      return;
    }

    const editKey = partId + '/ch' + chIdx + '/sec' + secIdx;
    savedEdits[editKey] = contentEdit.value;
    localStorage.setItem('bioquest_ebook_edits', JSON.stringify(savedEdits));
    showAdminToast('内容已保存到本地存储', 'success');

    // Refresh saved edits display
    const editsDiv = document.getElementById('ebook-saved-edits');
    if (editsDiv) {
      editsDiv.innerHTML = Object.keys(savedEdits).map(key =>
        `<div style="padding:6px 0;border-bottom:1px solid var(--border-light,#ece8e1);display:flex;justify-content:space-between;align-items:center;"><span>${escapeHtml(key)}</span><button class="admin-btn admin-btn--danger" style="padding:4px 10px;font-size:0.75rem;" data-on='["deleteEbookEdit","${escapeHtml(key)}"]'>删除</button></div>`
      ).join('');
    }
  });

  var PDF_BOOKS = [
    { name: '陈阅增普通生物学 (第4版)', key: 'chen_biology_4th' },
    { name: '陈祖洞遗传学', key: 'chen_genetics' },
    { name: '植物生理学', key: 'plant_physiology' },
    { name: '微生物学', key: 'microbiology' },
    { name: '王镜岩生物化学', key: 'wang_biochemistry' },
    { name: '动物生物学', key: 'animal_biology' }
  ];

  function getCustomEbooks() {
    try {
      var raw = localStorage.getItem('bioquest_custom_ebooks');
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return [];
  }

  function saveCustomEbooks(ebooks) {
    localStorage.setItem('bioquest_custom_ebooks', JSON.stringify(ebooks));
  }

  function getPdfStatus() {
    var status = {};
    try {
      var raw = localStorage.getItem('bioquest_ebook_pdf_status');
      if (raw) status = JSON.parse(raw);
    } catch(e) {}
    // Also check custom ebooks
    var customEbooks = getCustomEbooks();
    customEbooks.forEach(function(eb) {
      status[eb.id] = true;
    });
    return status;
  }

  function setPdfStatus(key, hasPdf) {
    var status = {};
    try {
      var raw = localStorage.getItem('bioquest_ebook_pdf_status');
      if (raw) status = JSON.parse(raw);
    } catch(e) {}
    status[key] = hasPdf;
    localStorage.setItem('bioquest_ebook_pdf_status', JSON.stringify(status));
  }

  function sanitizeBookName(name) {
    return name.replace(/[^a-zA-Z0-9\u4e00-\u9fff_()]/g, '_').replace(/_+/g, '_');
  }

  // data-on 数组里的 JS 字符串参数：先做 JS 字符串转义，再处理 HTML 属性边界
  function _escJsStr(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function renderPdfTable() {
    var status = getPdfStatus();
    var tbody = document.getElementById('admin-pdf-tbody');
    if (!tbody) return;

    var rows = PDF_BOOKS.map(function(book) {
      var hasPdf = !!status[book.key];
      // 注意：filePath 不应包含 bucket 名前缀，因为 .from('bioquest-ebooks') 已指定 bucket
      var filePath = sanitizeBookName(book.name) + '.pdf';
      return '<tr>' +
        '<td class="admin-table-name">' + escapeHtml(book.name) + '</td>' +
        '<td>' + (hasPdf
          ? '<span class="admin-q-tag admin-q-tag--module">已上传</span>'
          : '<span class="admin-q-tag admin-q-tag--difficulty">未上传</span>') +
        '</td>' +
        '<td>' +
          '<label class="admin-btn admin-btn--primary" style="padding:4px 12px;font-size:0.78rem;cursor:pointer;margin:0;">' +
            '选择PDF' +
            '<input type="file" accept="application/pdf" style="display:none;" data-book-key="' + escapeHtml(book.key) + '" data-book-name="' + escapeHtml(book.name) + '" data-file-path="' + escapeHtml(filePath) + '" class="admin-pdf-file-input" />' +
          '</label>' +
        '</td>' +
        '<td>' +
          (hasPdf
            ? '<button class="admin-btn admin-btn--danger admin-pdf-delete-btn" style="padding:4px 12px;font-size:0.78rem;" data-book-key="' + escapeHtml(book.key) + '" data-file-path="' + escapeHtml(filePath) + '" data-on=\'["adminDeletePdf","' + _escJsStr(book.key) + '","' + _escJsStr(filePath) + '"]\'>删除</button>'
            : '<span style="color:var(--text-muted,#8a8a8a);font-size:0.8rem;">—</span>') +
        '</td>' +
      '</tr>';
    });

    // Add custom books to the table
    var customEbooks = getCustomEbooks();
    customEbooks.forEach(function(eb) {
      var hasPdf = !!status[eb.id];
      // P0-3 修复：用户上传书籍的标题/作者/分类为用户可控字段，渲染与属性均需转义
      var ebTitle = escapeHtml(eb.title || '');
      var ebAuthor = escapeHtml(eb.author || '');
      var ebCategory = escapeHtml(eb.category || '');
      var ebIdJs = _escJsStr(eb.id);
      var ebPathJs = _escJsStr(eb.filePath);
      var ebTitleAttr = _escJsStr(eb.title);
      rows.push('<tr style="background:rgba(90,125,92,0.04);">' +
        '<td class="admin-table-name">' + ebTitle + (eb.author ? ' <span style="color:var(--text-muted,#8a8a8a);font-size:0.78rem;">(' + ebAuthor + ')</span>' : '') + ' <span class="admin-q-tag admin-q-tag--module" style="font-size:0.7rem;">' + ebCategory + '</span></td>' +
        '<td>' + (hasPdf
          ? '<span class="admin-q-tag admin-q-tag--module">已上传</span>'
          : '<span class="admin-q-tag admin-q-tag--difficulty">未上传</span>') +
        '</td>' +
        '<td>' +
          '<label class="admin-btn admin-btn--primary" style="padding:4px 12px;font-size:0.78rem;cursor:pointer;margin:0;">' +
            '选择PDF' +
            '<input type="file" accept="application/pdf" style="display:none;" data-book-key="' + ebIdJs + '" data-book-name="' + ebTitleAttr + '" data-file-path="' + ebPathJs + '" data-custom-id="' + ebIdJs + '" class="admin-pdf-file-input" />' +
          '</label>' +
        '</td>' +
        '<td>' +
          '<button class="admin-btn admin-btn--danger" style="padding:4px 12px;font-size:0.78rem;" data-on=\'["adminDeletePdf","' + ebIdJs + '","' + ebPathJs + '",true]\'>删除</button>' +
        '</td>' +
      '</tr>');
    });

    tbody.innerHTML = rows.join('');

    // Bind file input change events
    var fileInputs = tbody.querySelectorAll('.admin-pdf-file-input');
    fileInputs.forEach(function(input) {
      input.addEventListener('change', async function(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
          showAdminToast('请选择 PDF 文件', 'error');
          return;
        }
        if (file.size > ADMIN_EBOOK_MAX_BYTES) {
          showAdminToast('文件大小超过 50MB 限制', 'error');
          return;
        }

        var bookKey = this.getAttribute('data-book-key');
        var filePath = this.getAttribute('data-file-path');
        var bookName = this.getAttribute('data-book-name');

        var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
        if (!sb) {
          showAdminToast('Supabase 未连接', 'error');
          return;
        }

        try {
          showAdminToast('正在上传 ' + bookName + '...', 'info');
          // 通过 server.py 代理上传（使用 service role key 绕过 RLS）
          const fileB64 = await _ocrReadFileAsBase64(file);

          // 大文件上传带超时和重试，避免 ERR_CONNECTION_RESET
          const MAX_RETRY = 3;
          let success = false;
          for (let attempt = 0; attempt < MAX_RETRY && !success; attempt++) {
            try {
              const ctrl = new AbortController();
              const timeoutId = setTimeout(() => ctrl.abort(), ADMIN_EBOOK_UPLOAD_TIMEOUT_MS); // 5 分钟超时
              const res = await fetch('/admin/ebook-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (await window.getSupabaseSessionToken()) },
                body: JSON.stringify({ file_path: filePath, file_b64: fileB64, content_type: 'application/pdf' }),
                signal: ctrl.signal,
                keepalive: true
              });
              clearTimeout(timeoutId);
              const data = await res.json().catch(() => ({ error: '响应解析失败' }));
              if (!res.ok || !data.ok) {
                var errMsg = data.error || ('HTTP ' + res.status);
                if (errMsg.indexOf('Bucket not found') >= 0 || errMsg.indexOf('bucket') >= 0) {
                  errMsg = 'Storage bucket "bioquest-ebooks" 不存在，请在 Supabase Dashboard → Storage 中创建';
                }
                if (attempt >= MAX_RETRY - 1) {
                  showAdminToast('上传失败: ' + errMsg, 'error');
                  return;
                }
                throw new Error(errMsg);
              }
              success = true;
            } catch (chunkErr) {
              if (attempt >= MAX_RETRY - 1) {
                showAdminToast('上传失败: ' + (chunkErr.message || '网络错误'), 'error');
                return;
              }
              showAdminToast('重试上传 (' + (attempt + 1) + '/3)...', 'info');
              await new Promise(r => setTimeout(r, ADMIN_EBOOK_RETRY_BASE_DELAY_MS * (attempt + 1)));
            }
          }

          setPdfStatus(bookKey, true);
          showAdminToast(bookName + ' PDF 上传成功', 'success');
          renderPdfTable();
        } catch(err) {
          console.error('[PDF Upload] Exception:', err);
          showAdminToast('上传出错: ' + (err.message || String(err)), 'error');
        }
      });
    });
  }

  function renderCustomEbooksList() {
    var listEl = document.getElementById('admin-custom-ebooks-list');
    if (!listEl) return;

    var customEbooks = getCustomEbooks();
    if (customEbooks.length === 0) {
      listEl.innerHTML = '<span style="color:var(--text-muted,#8a8a8a);font-size:0.85rem;">暂无自定义上传的书籍</span>';
      return;
    }

    listEl.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>书名</th><th>作者/版本</th><th>分类</th><th>上传日期</th><th>操作</th>' +
      '</tr></thead><tbody>' +
      customEbooks.map(function(eb) {
        return '<tr>' +
          '<td class="admin-table-name">' + escapeHtml(eb.title || '') + '</td>' +
          '<td>' + (eb.author ? escapeHtml(eb.author) : '—') + '</td>' +
          '<td><span class="admin-q-tag admin-q-tag--module">' + escapeHtml(eb.category || '') + '</span></td>' +
          '<td style="font-size:0.82rem;">' + (eb.uploadDate ? escapeHtml(new Date(eb.uploadDate).toLocaleDateString('zh-CN')) : '—') + '</td>' +
          '<td>' +
            '<button class="admin-btn admin-btn--danger" style="padding:4px 12px;font-size:0.78rem;" data-on=\'["adminDeletePdf","' + _escJsStr(eb.id) + '","' + _escJsStr(eb.filePath) + '",true]\'>删除</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  // Bind custom ebook form
  var customForm = document.getElementById('admin-custom-ebook-form');
  if (customForm) {
    customForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      var title = document.getElementById('custom-ebook-title').value.trim();
      var author = document.getElementById('custom-ebook-author').value.trim();
      var category = document.getElementById('custom-ebook-category').value;
      var fileInput = document.getElementById('custom-ebook-file');
      var file = fileInput.files[0];

      if (!title) {
        showAdminToast('请输入书名', 'error');
        return;
      }
      if (!file) {
        showAdminToast('请选择 PDF 文件', 'error');
        return;
      }
      if (file.type !== 'application/pdf') {
        showAdminToast('请选择 PDF 文件', 'error');
        return;
      }
      if (file.size > ADMIN_EBOOK_MAX_BYTES) {
        showAdminToast('文件大小超过 50MB 限制', 'error');
        return;
      }

      var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
      if (!sb) {
        showAdminToast('Supabase 未连接', 'error');
        return;
      }

      var timestamp = Date.now();
      var sanitized = sanitizeBookName(title);
      var filePath = 'custom/' + timestamp + '_' + sanitized + '.pdf';
      var bookId = 'custom-' + timestamp;

      try {
        showAdminToast('正在上传 ' + title + '...', 'info');
        // 通过 server.py 代理上传（使用 service role key 绕过 RLS）
        const fileB64 = await _ocrReadFileAsBase64(file);

        // 大文件上传带超时和重试
        const MAX_RETRY = 3;
        let success = false;
        for (let attempt = 0; attempt < MAX_RETRY && !success; attempt++) {
          try {
            const ctrl = new AbortController();
            const timeoutId = setTimeout(() => ctrl.abort(), ADMIN_EBOOK_UPLOAD_TIMEOUT_MS);
            const result = await fetch('/admin/ebook-upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (await window.getSupabaseSessionToken()) },
              body: JSON.stringify({ file_path: filePath, file_b64: fileB64, content_type: 'application/pdf' }),
              signal: ctrl.signal,
              keepalive: true
            });
            clearTimeout(timeoutId);
            const uploadData = await result.json().catch(() => ({ error: '响应解析失败' }));
            if (!result.ok || !uploadData.ok) {
              if (attempt >= MAX_RETRY - 1) {
                showAdminToast('上传失败: ' + errText(uploadData.error), 'error');
                return;
              }
              throw new Error(uploadData.error || ('HTTP ' + result.status));
            }
            success = true;
          } catch (e) {
            if (attempt >= MAX_RETRY - 1) {
              showAdminToast('上传失败: ' + (e.message || '网络错误'), 'error');
              return;
            }
            showAdminToast('重试上传 (' + (attempt + 1) + '/3)...', 'info');
            await new Promise(r => setTimeout(r, ADMIN_EBOOK_RETRY_BASE_DELAY_MS * (attempt + 1)));
          }
        }

        // Save to localStorage
        var customEbooks = getCustomEbooks();
        customEbooks.push({
          id: bookId,
          title: title,
          author: author,
          category: category,
          filePath: filePath,
          uploadDate: new Date().toISOString()
        });
        saveCustomEbooks(customEbooks);

        // Try to insert into Supabase table
        try {
          var { data: userData } = await sb.auth.getUser();
          var uploadedBy = userData && userData.user ? userData.user.id : null;
          await sb.from('ebook_pdfs').insert([{
            id: bookId,
            title: title,
            author: author,
            category: category,
            file_path: filePath,
            uploaded_by: uploadedBy,
            created_at: new Date().toISOString()
          }]);
        } catch(tableErr) {
          // Table might not exist, just use localStorage
          console.warn('Could not insert into ebook_pdfs table:', tableErr.message);
        }

        setPdfStatus(bookId, true);
        showAdminToast(title + ' 上传成功', 'success');

        // Reset form
        customForm.reset();
        renderPdfTable();
        renderCustomEbooksList();
      } catch(err) {
        showAdminToast('上传出错: ' + err.message, 'error');
      }
    });
  }

  renderPdfTable();
  renderCustomEbooksList();
}

window.adminDeletePdf = async function(bookKey, filePath, isCustom) {
  try {
    // 通过 server.py 代理删除（使用 service role key 绕过 RLS）
    const res = await fetch('/admin/ebook-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (await window.getSupabaseSessionToken())
      },
      body: JSON.stringify({ file_path: filePath })
    });
    const data = await res.json().catch(() => ({ error: '响应解析失败' }));
    if (!res.ok || !data.ok) {
      showAdminToast('删除失败: ' + errText(data.error), 'error');
      return;
    }

    var status = {};
    try {
      var raw = localStorage.getItem('bioquest_ebook_pdf_status');
      if (raw) status = JSON.parse(raw);
    } catch(e) {}
    status[bookKey] = false;
    localStorage.setItem('bioquest_ebook_pdf_status', JSON.stringify(status));

    // If custom book, also remove from custom ebooks list
    if (isCustom) {
      var customEbooks = [];
      try {
        var rawEbooks = localStorage.getItem('bioquest_custom_ebooks');
        if (rawEbooks) customEbooks = JSON.parse(rawEbooks);
      } catch(e) {}
      customEbooks = customEbooks.filter(function(eb) { return eb.id !== bookKey; });
      localStorage.setItem('bioquest_custom_ebooks', JSON.stringify(customEbooks));
    }

    showAdminToast('PDF 已删除', 'success');

    // Refresh the tab
    var container = document.getElementById('admin-tab-content');
    if (container) renderEbookTab(container);
  } catch(err) {
    showAdminToast('删除出错: ' + err.message, 'error');
  }
};

window.deleteEbookEdit = function(key) {
  let savedEdits = {};
  try {
    const raw = localStorage.getItem('bioquest_ebook_edits');
    if (raw) savedEdits = JSON.parse(raw);
  } catch(e) {}
  delete savedEdits[key];
  localStorage.setItem('bioquest_ebook_edits', JSON.stringify(savedEdits));
  showAdminToast('编辑已删除', 'success');
  // Refresh the tab
  const container = document.getElementById('admin-tab-content');
  if (container) renderEbookTab(container);
};
