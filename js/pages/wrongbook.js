
(function() {
  'use strict';

  var _currentList = [];
  var _currentFiltered = [];   // 应用筛选后的列表（打印全部/勾选定位用）
  var _currentDetail = null;
  var _filter = { concept: '', errorReason: '' };
  var _sortMode = 'recent';    // 'recent' | 'due'（FSRS 到期优先）| 'wrong'
  var _fsrsCloud = {};         // 云端 review_cards 状态 { question_id: {...} }
  var _fsrsLocal = {};         // 本地 FSRS 卡（bioquest_fsrs_cards）
  var _dueTodayCount = 0;      // 今日到期（含逾期）错题数
  var _fsrsLocalRaw = null;    // 本地 FSRS 卡原始串（缓存失效校验，避免每次渲染全量 parse）
  var _wbFocusTrap = null;

  /* ============== FSRS 间隔重复（错题本展示层） ==============
   * 状态来源：云端 review_cards（登录，经 sb-data.getReviewCardStates 批量拉取）
   *           ∪ 本地 bioquest_fsrs_cards（record-session 答错/答对镜像写入）。
   * 调度本身由 ts-fsrs（vendor，MIT）计算，本文件只负责读取与展示。 */

  function _fsrsStateFor(item) {
    var key = String(item.qId || item.question_id || item.id || '');
    if (!key) return null;
    var cloud = _fsrsCloud[key];
    if (cloud) return cloud;
    var local = _fsrsLocal[key];
    if (local && (local.repetitions || 0) > 0) return local;
    return null;
  }

  function _fsrsDueInfo(item) {
    var st = _fsrsStateFor(item);
    if (!st) return null;
    var dueRaw = st.due_date || st.dueDate;
    if (!dueRaw) return null;
    var reps = st.repetitions || st.reps || 0;
    // 本地新卡（未复习过）不算到期；云端卡在建卡时已排期（reps>=1）
    if (!st.due_date && reps <= 0) return null;
    var due = new Date(dueRaw);
    if (isNaN(due.getTime())) return null;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var dueDay = new Date(due); dueDay.setHours(0, 0, 0, 0);
    var days = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
    var label, level;
    if (days < 0) { label = '逾期 ' + (-days) + ' 天'; level = 'overdue'; }
    else if (days <= 1) { label = days === 0 ? '今天到期' : '明天到期'; level = 'today'; }
    else { label = days + ' 天后到期'; level = ''; }
    return {
      due: due.getTime(), days: days, label: label, level: level,
      lapses: st.lapses || 0, stability: st.stability || 0
    };
  }

  function _fsrsBadgeHtml(item) {
    var info = _fsrsDueInfo(item);
    if (!info) return '';
    var extra = '';
    if (info.lapses > 0) extra += ' · 遗忘×' + info.lapses;
    if (info.stability >= 1) extra += ' · 强度' + (Math.round(info.stability * 10) / 10) + 'd';
    var tip = 'FSRS 间隔重复调度（ts-fsrs）：下次复习 ' +
      _formatDate(new Date(info.due).toISOString()) +
      (info.stability >= 1 ? ' | 记忆强度 ' + (Math.round(info.stability * 10) / 10) + ' 天' : '') +
      (info.lapses > 0 ? ' | 遗忘 ' + info.lapses + ' 次' : '');
    var esc = (typeof escapeHtml === 'function') ? escapeHtml : function (s) { return String(s); };
    var cls = 'wb-tag wb-tag--fsrs' + (info.level ? ' wb-tag--fsrs-' + info.level : '');
    return '<span class="' + cls + '" title="' + esc(tip) + '">FSRS · ' + info.label + extra + '</span>';
  }

  /** 加载 FSRS 状态（本地 + 云端批量）并统计今日到期数，返回 Promise */
  function _loadFsrsStates(list) {
    _fsrsCloud = {};
    _fsrsLocal = {};
    _dueTodayCount = 0;
    var ids = [];
    (list || []).forEach(function (item) {
      var id = item.qId || item.question_id || item.id;
      if (id) ids.push(String(id));
    });
    try {
      var raw = localStorage.getItem('bioquest_fsrs_cards');
      if (raw) {
        if (raw !== _fsrsLocalRaw || !_fsrsLocal) {
          var map = JSON.parse(raw);
          if (map && typeof map === 'object') {
            _fsrsLocal = map;
            _fsrsLocalRaw = raw;
          }
        }
      }
    } catch (e) { /* ignore */ }
    var cloudP = (ids.length && typeof window.getReviewCardStates === 'function')
      ? Promise.resolve(window.getReviewCardStates(ids)).catch(function () { return {}; })
      : Promise.resolve({});
    return cloudP.then(function (cloud) {
      if (cloud && typeof cloud === 'object') _fsrsCloud = cloud;
      (list || []).forEach(function (item) {
        var info = _fsrsDueInfo(item);
        if (info && info.days <= 0) _dueTodayCount++;
      });
    });
  }

  function _releaseWbModal() {
    if (_wbFocusTrap) { _wbFocusTrap.release(); _wbFocusTrap = null; }
  }

  function _addStyles() {
    if (document.getElementById('wrongbook-styles')) return;
    var style = document.createElement('style');
    style.id = 'wrongbook-styles';
    style.textContent = `
      .wb-container { max-width: 900px; margin: 0 auto; padding: 20px; }
      .wb-card { background: var(--card-bg, #fff); border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-sm); }
      .wb-card:hover { box-shadow: var(--shadow-md); }
      .wb-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
      .wb-title { font-weight: 600; color: var(--color-deep, #2c4a3b); margin: 0 0 6px; line-height: 1.4; }
      .wb-meta { font-size: 0.85rem; color: var(--text-muted, #888); }
      .wb-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
      .wb-tag { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; background: var(--color-sage, #5a7d5c); color: #fff; }
      .wb-tag--reason { background: #d97706; }
      .wb-actions { display: flex; gap: 8px; margin-top: 12px; }
      .wb-btn { padding: 6px 14px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.85rem; background: var(--color-sage, #5a7d5c); color: #fff; }
      .wb-btn--secondary { background: #e5e7eb; color: #374151; }
      .wb-btn--danger { background: #ef4444; color: #fff; }
      .wb-empty { text-align: center; padding: 60px 20px; color: var(--text-muted, #888); }
      .wb-form-group { margin-bottom: 14px; }
      .wb-form-group label { display: block; margin-bottom: 5px; font-size: 0.9rem; color: var(--text-secondary, #555); }
      .wb-form-group input, .wb-form-group textarea, .wb-form-group select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 0.95rem; background: var(--input-bg, #fff); color: var(--text-primary, #222); }
      .wb-form-group textarea { min-height: 80px; resize: vertical; }
      .wb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 20px; }
      .wb-modal { background: var(--card-bg, #fff); border-radius: 16px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; padding: 24px; }
      .wb-modal h3 { margin: 0 0 16px; color: var(--color-deep, #2c4a3b); }
      .wb-analysis-box { background: #f0fdf4; border-left: 4px solid var(--color-sage, #5a7d5c); padding: 12px 16px; border-radius: 8px; margin: 12px 0; }
      .wb-related-list { margin-top: 16px; }
      .wb-related-item { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; cursor: pointer; }
      .wb-related-item:hover { background: #f9fafb; }
      .wb-toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
      .wb-toolbar select, .wb-toolbar input { padding: 8px 12px; border-radius: 8px; border: 1px solid #ddd; }
      /* 打印功能：卡片勾选框 + 打印工具条（A4 打印走 window.PrintUtils） */
      .wb-sel { display: inline-flex; align-items: center; justify-content: center; margin-right: 10px; cursor: pointer; flex-shrink: 0; }
      .wb-sel input { width: 16px; height: 16px; accent-color: var(--color-sage, #5a7d5c); cursor: pointer; }
      .wb-print-count { display: inline-block; min-width: 22px; padding: 1px 6px; border-radius: 10px; background: rgba(255,255,255,0.28); font-size: 0.78rem; }
      .wb-toolbar .wb-btn--print { background: var(--color-deep, #1a3a2a); }
      /* FSRS 间隔重复徽标（到期状态按天数分档着色） */
      .wb-tag--due { background: rgba(217,119,6,0.13); color: #d97706; font-weight: 600; }
      .wb-tag--fsrs { background: rgba(58,140,92,0.12); color: #3a8c5c; font-weight: 600; }
      .wb-tag--fsrs-overdue { background: rgba(192,85,58,0.12); color: #c0553a; }
      .wb-tag--fsrs-today { background: rgba(217,119,6,0.13); color: #d97706; }
      @media (max-width: 640px) {
        .wb-card-header { flex-direction: column; }
        .wb-actions { flex-wrap: wrap; }
      }
    `;
    document.head.appendChild(style);
  }

  function _formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function _truncate(s, n) {
    s = s || '';
    return s.length > n ? s.substring(0, n) + '...' : s;
  }

  /** 统一转义：错题字段来自云端/用户输入，拼进 innerHTML 前必须转义 */
  function _esc(s) {
    s = (s === undefined || s === null) ? '' : String(s);
    return (typeof escapeHtml === 'function') ? escapeHtml(s) : s;
  }

  async function _loadList() {
    if (typeof window.getWrongQuestions !== 'function') return [];
    try {
      var result = await window.getWrongQuestions({ limit: 200 });
      // 防御性：确保返回数组，避免 .forEach 报错
      if (Array.isArray(result)) return result;
      if (result && Array.isArray(result.items)) return result.items;
      if (result && Array.isArray(result.data)) return result.data;
      return [];
    } catch (e) {
      console.warn('[wrongbook] 加载错题列表失败:', e);
      return [];
    }
  }

  function _renderList(container) {
    var items = _currentList.filter(function(q) {
      if (_filter.concept && q.concept !== _filter.concept) return false;
      if (_filter.errorReason && q.error_reason !== _filter.errorReason) return false;
      return true;
    });

    // 排序（FSRS 到期优先：逾期最久在前、无卡在后；错误次数：错得多在前）
    if (_sortMode === 'due') {
      items.sort(function(a, b) {
        var ia = _fsrsDueInfo(a), ib = _fsrsDueInfo(b);
        var da = ia ? ia.due : Infinity, db = ib ? ib.due : Infinity;
        if (da !== db) return da - db;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
    } else if (_sortMode === 'wrong') {
      items.sort(function(a, b) { return (b.wrongCount || 0) - (a.wrongCount || 0); });
    }
    _currentFiltered = items;

    if (items.length === 0) {
      // Issue #125：统一「温暖空状态」组件（加载失败时回退原有提示）
      if (window.BioQuest && typeof window.BioQuest.renderEmptyState === 'function') {
        window.BioQuest.renderEmptyState(container, {
          title: '暂无错题记录',
          hint: '练习时答错的题目会自动收录到这里，也可以点击右上角添加',
          action: { label: '去练习', onClick: function () { window.location.hash = '#/practice'; } }
        });
      } else {
        container.innerHTML = '<div class="wb-empty">暂无错题记录。练习时答错的题目会自动收录，也可以点击右上角添加。</div>';
      }
      _updatePrintCount();
      return;
    }

    var html = items.map(function(q) {
      var qid = _esc(q.id);
      return '<div class="wb-card" data-id="' + qid + '">' +
        '<div class="wb-card-header">' +
          '<div>' +
            '<p class="wb-title">' + _esc(_truncate(q.question_text, 120)) + '</p>' +
            '<div class="wb-meta">' + _esc(q.subject || '未分类') + ' · ' + _esc(q.concept || '未定位概念') + ' · ' + _esc(_formatDate(q.created_at)) + '</div>' +
          '</div>' +
          '<label class="wb-sel" title="勾选后可批量打印">' +
            '<input type="checkbox" class="wb-select-cb" data-id="' + qid + '" checked aria-label="选择该题用于打印">' +
          '</label>' +
        '</div>' +
        '<div class="wb-tags">' +
          (q.error_reason ? '<span class="wb-tag wb-tag--reason">' + _esc(q.error_reason) + '</span>' : '') +
          _fsrsBadgeHtml(q) +
          (q.textbook_chapter ? '<span class="wb-tag">' + _esc(q.textbook_chapter) + '</span>' : '') +
          (q.difficulty ? '<span class="wb-tag">' + _esc(q.difficulty) + '</span>' : '') +
        '</div>' +
        '<div class="wb-actions">' +
          '<button class="wb-btn wb-detail-btn" data-id="' + qid + '">查看/编辑</button>' +
          '<button class="wb-btn wb-analyze-btn" data-id="' + qid + '">AI 分析</button>' +
          '<button class="wb-btn wb-kg-btn" data-concept="' + _esc(q.concept || q.subject || '') + '">知识图谱</button>' +
          '<button class="wb-btn wb-card-btn" data-concept="' + _esc(q.concept || q.subject || '') + '">生成卡片</button>' +
          '<button class="wb-btn wb-btn--danger wb-delete-btn" data-id="' + qid + '">删除</button>' +
        '</div>' +
      '</div>';
    }).join('');

    container.innerHTML = html;

    container.querySelectorAll('.wb-detail-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { _openDetail(btn.dataset.id); });
    });
    container.querySelectorAll('.wb-analyze-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { _openAnalyze(btn.dataset.id); });
    });
    container.querySelectorAll('.wb-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { _deleteQuestion(btn.dataset.id); });
    });
    // v4.0 四向联动：错题 → 知识图谱 / 卡片
    container.querySelectorAll('.wb-kg-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var concept = btn.getAttribute('data-concept') || '';
        try { sessionStorage.setItem('bioquest_kg_focus', concept); } catch (e) {}
        if (typeof navigateTo === 'function') navigateTo('/knowledge-graph');
      });
    });
    container.querySelectorAll('.wb-card-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var concept = btn.getAttribute('data-concept') || '';
        try { sessionStorage.setItem('bioquest_card_focus', concept); } catch (e) {}
        if (typeof navigateTo === 'function') navigateTo('/cards');
      });
    });
    // 打印：勾选框变化 → 同步「打印所选」计数
    container.querySelectorAll('.wb-select-cb').forEach(function(box) {
      box.addEventListener('change', function() { _updatePrintCount(); });
    });
    _updatePrintCount();
  }

  function _renderToolbar(container) {
    var concepts = {};
    var reasons = {};
    _currentList.forEach(function(q) {
      if (q.concept) concepts[q.concept] = true;
      if (q.error_reason) reasons[q.error_reason] = true;
    });

    var conceptOpts = '<option value="">全部概念</option>' +
      Object.keys(concepts).sort().map(function(c) { return '<option value="' + _esc(c) + '" ' + (_filter.concept === c ? 'selected' : '') + '>' + _esc(c) + '</option>'; }).join('');
    var reasonOpts = '<option value="">全部错误原因</option>' +
      Object.keys(reasons).sort().map(function(r) { return '<option value="' + _esc(r) + '" ' + (_filter.errorReason === r ? 'selected' : '') + '>' + _esc(r) + '</option>'; }).join('');

    container.innerHTML = '<div class="wb-toolbar">' +
      '<select id="wb-filter-concept">' + conceptOpts + '</select>' +
      '<select id="wb-filter-reason">' + reasonOpts + '</select>' +
      '<select id="wb-sort" aria-label="排序方式">' +
        '<option value="recent">排序：最近错误</option>' +
        '<option value="due">排序：FSRS 到期优先</option>' +
        '<option value="wrong">排序：错误次数</option>' +
      '</select>' +
      '<span class="wb-tag wb-tag--due" id="wb-due-badge" title="按 FSRS 间隔重复算法统计的今日到期（含逾期）错题">' +
        '今日到期 ' + _dueTodayCount + ' 题</span>' +
      '<button class="wb-btn" id="wb-review-btn" title="按 FSRS 到期推送的每日错题复习（今日复习页）">今日复习（FSRS）</button>' +
      '<button class="wb-btn" id="wb-add-btn">+ 添加错题</button>' +
      '<button class="wb-btn" id="wb-ocr-btn">拍照/OCR</button>' +
      '<input type="file" id="wb-ocr-input" accept="image/*" capture="environment" style="display:none;">' +
      '<select id="wb-print-mode" aria-label="打印内容范围">' +
        '<option value="all">打印内容：题目+答案解析</option>' +
        '<option value="questions">打印内容：仅题目</option>' +
        '<option value="answers">打印内容：仅答案解析</option>' +
      '</select>' +
      '<button class="wb-btn wb-btn--print" id="wb-print-selected">打印所选 <span class="wb-print-count" id="wb-print-count">0</span></button>' +
      '<button class="wb-btn wb-btn--secondary" id="wb-print-all">打印全部</button>' +
    '</div>';

    document.getElementById('wb-filter-concept').addEventListener('change', function(e) {
      _filter.concept = e.target.value;
      _renderList(document.getElementById('wb-list'));
    });
    document.getElementById('wb-filter-reason').addEventListener('change', function(e) {
      _filter.errorReason = e.target.value;
      _renderList(document.getElementById('wb-list'));
    });
    var sortSel = document.getElementById('wb-sort');
    sortSel.value = _sortMode;
    sortSel.addEventListener('change', function(e) {
      _sortMode = e.target.value;
      _renderList(document.getElementById('wb-list'));
    });
    document.getElementById('wb-review-btn').addEventListener('click', function() {
      if (typeof navigateTo === 'function') navigateTo('/review');
      else window.location.hash = '#/review';
    });
    document.getElementById('wb-add-btn').addEventListener('click', function() { _openAddModal(); });
    document.getElementById('wb-ocr-btn').addEventListener('click', function() {
      // 优先尝试摄像头拍照，不支持则直接触发文件选择
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        _openCameraModal();
      } else {
        document.getElementById('wb-ocr-input').click();
      }
    });
    document.getElementById('wb-ocr-input').addEventListener('change', function(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      _ocrRecognize(file);
      e.target.value = '';
    });
    document.getElementById('wb-print-selected').addEventListener('click', function() {
      var picked = _collectChecked();
      if (picked.length === 0) {
        if (typeof showToast === 'function') showToast('请先勾选要打印的错题');
        return;
      }
      _printRecords(picked, _printMode());
    });
    document.getElementById('wb-print-all').addEventListener('click', function() {
      if (_currentFiltered.length === 0) {
        if (typeof showToast === 'function') showToast('当前没有可打印的错题');
        return;
      }
      _printRecords(_currentFiltered, _printMode());
    });
    _updatePrintCount();
  }

  /* ============== 打印（错题本） ============== */
  // 取当前勾选的错题记录（保持列表顺序）
  function _collectChecked() {
    // 先建 id → 记录索引，避免每次勾选 O(n×m) 线性查找
    var index = new Map();
    _currentFiltered.forEach(function (rec) {
      var key = String(rec.id);
      if (!index.has(key)) index.set(key, rec);
    });
    var picked = [];
    document.querySelectorAll('#wb-list .wb-select-cb').forEach(function(box) {
      if (!box.checked) return;
      var rec = index.get(box.getAttribute('data-id'));
      if (rec) picked.push(rec);
    });
    return picked;
  }

  function _updatePrintCount() {
    var el = document.getElementById('wb-print-count');
    if (el) el.textContent = String(_collectChecked().length);
  }

  // 当前打印内容范围：all（题目+答案解析）/ questions（仅题目）/ answers（仅答案解析）
  function _printMode() {
    var sel = document.getElementById('wb-print-mode');
    var v = sel ? sel.value : 'all';
    return (v === 'questions' || v === 'answers') ? v : 'all';
  }

  function _printRecords(records, mode) {
    if (!window.PrintUtils || typeof window.PrintUtils.printWrongRecords !== 'function') {
      if (typeof showToast === 'function') showToast('打印模块未加载，请刷新后重试');
      return;
    }
    var m = mode || 'all';
    var scopeText = m === 'questions' ? '仅含题目与选项'
      : m === 'answers' ? '仅含正确答案与解析' : '题干、选项、答案、解析齐全';
    window.PrintUtils.printWrongRecords(records, {
      mode: m,
      title: 'TATABOX 错题打印',
      metaText: '共 ' + records.length + ' 道错题 · ' + scopeText +
        ' · 每页页脚含 ' + window.PrintUtils.FOOTER_MARK
    });
  }

  /* ============== 摄像头拍照模态 ============== */
  function _openCameraModal() {
    _releaseWbModal();
    // 移除已有模态
    var old = document.getElementById('wb-camera-modal');
    if (old) old.remove();

    var overlay = document.createElement('div');
    overlay.id = 'wb-camera-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '拍照识别错题');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10020;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML =
      '<div style="width:100%;max-width:560px;background:#fff;border-radius:12px;overflow:hidden;">' +
        '<div style="padding:14px 18px;border-bottom:1px solid var(--border-light,#ece8e1);display:flex;justify-content:space-between;align-items:center;">' +
          '<strong style="color:var(--color-deep,#1a3a2a);">拍照识别错题</strong>' +
          '<button id="wb-cam-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted,#8a8a8a);">×</button>' +
        '</div>' +
        '<div style="padding:16px;">' +
          '<div id="wb-cam-preview" style="width:100%;background:#000;border-radius:8px;min-height:200px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:0.86rem;">正在启动摄像头...</div>' +
          '<video id="wb-cam-video" autoplay playsinline style="width:100%;border-radius:8px;display:none;"></video>' +
          '<canvas id="wb-cam-canvas" style="display:none;"></canvas>' +
          '<img id="wb-cam-shot" style="width:100%;border-radius:8px;display:none;" />' +
          '<div style="display:flex;gap:8px;margin-top:12px;justify-content:center;">' +
            '<button id="wb-cam-capture" class="wb-btn" style="background:var(--color-sage,#5a7d5c);color:#fff;">拍照</button>' +
            '<button id="wb-cam-retake" class="wb-btn" style="display:none;">重拍</button>' +
            '<button id="wb-cam-confirm" class="wb-btn" style="background:var(--color-amber,#c4956a);color:#fff;display:none;">识别</button>' +
            '<button id="wb-cam-upload" class="wb-btn">从相册选择</button>' +
          '</div>' +
          '<p style="font-size:0.76rem;color:var(--text-muted,#8a8a8a);text-align:center;margin-top:8px;">提示：拍摄清晰、光线充足的题目图片，识别效果更好</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    // 焦点陷阱：ESC 关闭、初始聚焦到关闭按钮
    if (window.BioQuestA11y && typeof window.BioQuestA11y.trapFocus === 'function') {
      _wbFocusTrap = window.BioQuestA11y.trapFocus(overlay, {
        onEscape: closeCamera,
        initialFocus: overlay.querySelector('#wb-cam-close')
      });
    }

    var video = document.getElementById('wb-cam-video');
    var canvas = document.getElementById('wb-cam-canvas');
    var shotImg = document.getElementById('wb-cam-shot');
    var preview = document.getElementById('wb-cam-preview');
    var captureBtn = document.getElementById('wb-cam-capture');
    var retakeBtn = document.getElementById('wb-cam-retake');
    var confirmBtn = document.getElementById('wb-cam-confirm');
    var uploadBtn = document.getElementById('wb-cam-upload');
    var closeBtn = document.getElementById('wb-cam-close');
    var stream = null;
    var capturedBlob = null;

    // 启动摄像头
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function(s) {
      stream = s;
      video.srcObject = s;
      video.style.display = 'block';
      preview.style.display = 'none';
    }).catch(function(err) {
      preview.textContent = '摄像头启动失败：' + errText(err) + '，请点"从相册选择"';
    });

    function closeCamera() {
      _releaseWbModal();
      if (stream) { stream.getTracks().forEach(function(t) { t.stop(); }); }
      overlay.remove();
    }
    closeBtn.addEventListener('click', closeCamera);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeCamera(); });

    captureBtn.addEventListener('click', function() {
      if (!video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      shotImg.src = dataUrl;
      shotImg.style.display = 'block';
      video.style.display = 'none';
      captureBtn.style.display = 'none';
      retakeBtn.style.display = 'inline-block';
      confirmBtn.style.display = 'inline-block';
      // 转 Blob
      canvas.toBlob(function(blob) { capturedBlob = blob; }, 'image/jpeg', 0.9);
    });

    retakeBtn.addEventListener('click', function() {
      shotImg.style.display = 'none';
      video.style.display = 'block';
      captureBtn.style.display = 'inline-block';
      retakeBtn.style.display = 'none';
      confirmBtn.style.display = 'none';
      capturedBlob = null;
    });

    confirmBtn.addEventListener('click', function() {
      if (!capturedBlob) return;
      closeCamera();
      _ocrRecognize(capturedBlob);
    });

    uploadBtn.addEventListener('click', function() {
      closeCamera();
      setTimeout(function() { document.getElementById('wb-ocr-input').click(); }, 100);
    });
  }

  /* ============== OCR 识别（多模态视觉模型优先 + Tesseract.js 兜底） ============== */
  var _tesseractLoaded = false;
  function _loadTesseract(callback) {
    if (_tesseractLoaded && typeof window.Tesseract !== 'undefined') {
      callback(null); return;
    }
    showToast('正在加载 OCR 引擎（首次约 2-5 秒）...');
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = function() { _tesseractLoaded = true; callback(null); };
    s.onerror = function() { callback(new Error('OCR 引擎加载失败，请检查网络')); };
    document.head.appendChild(s);
  }

  // 图像预处理：灰度化 + 对比度增强 + 锐化，提升 Tesseract 识别率
  function _preprocessImage(dataUrl, callback) {
    var img = new Image();
    img.onload = function() {
      // 放大 2 倍便于识别小字
      var scale = 2;
      var w = img.width * scale, h = img.height * scale;
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var imgData = ctx.getImageData(0, 0, w, h);
      var d = imgData.data;
      // 1) 灰度化
      for (var i = 0; i < d.length; i += 4) {
        var gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = gray;
      }
      // 2) 对比度增强（线性拉伸）
      var minV = 255, maxV = 0;
      for (var j = 0; j < d.length; j += 4) {
        if (d[j] < minV) minV = d[j];
        if (d[j] > maxV) maxV = d[j];
      }
      var range = Math.max(1, maxV - minV);
      for (var k = 0; k < d.length; k += 4) {
        var v = ((d[k] - minV) / range) * 255;
        d[k] = d[k + 1] = d[k + 2] = v;
      }
      // 3) 自适应阈值二值化（简化版：以 128 为界）
      for (var m = 0; m < d.length; m += 4) {
        var bv = d[m] > 140 ? 255 : 0;
        d[m] = d[m + 1] = d[m + 2] = bv;
      }
      ctx.putImageData(imgData, 0, 0);
      callback(canvas.toDataURL('image/png'));
    };
    img.onerror = function() { callback(dataUrl); };
    img.src = dataUrl;
  }

  // OCR 后处理：常见错字修正 + 多余空白清理
  function _postprocessOcrText(text) {
    if (!text) return '';
    // 常见 OCR 错字字典（中文生物题常见）
    var corrections = [
      [/[，,\s]+$/gm, ''],          // 行末多余标点
      [/[\u3000]+/g, ' '],          // 全角空格转半角
      [/\n{3,}/g, '\n\n'],          // 多余换行
      [/=\s*\n\s*=/g, '=='],        // 等号被断行
      [/\(\s+/g, '('],              // 括号内多余空格
      [/\s+\)/g, ')'],
      [/\s+\,/g, ','],              // 逗号前空格
      [/\s+\./g, '.'],              // 句号前空格
      [/\s+，/g, '，'],              // 中文逗号前空格
      [/\s+。/g, '。']               // 中文句号前空格
    ];
    for (var i = 0; i < corrections.length; i++) {
      text = text.replace(corrections[i][0], corrections[i][1]);
    }
    return text.trim();
  }

  function _ocrRecognize(file) {
    _openAddModal(); // 先打开添加窗

    // 在弹窗顶部插入图片预览 + 进度条
    var modal = document.querySelector('.wb-modal-content') || document.querySelector('.wb-modal');
    var previewWrap = document.createElement('div');
    previewWrap.id = 'wb-ocr-preview';
    previewWrap.style.cssText = 'margin-bottom:12px;padding:8px;background:rgba(90,125,92,0.06);border-radius:8px;';
    var imgEl = document.createElement('img');
    imgEl.style.cssText = 'width:100%;max-height:160px;object-fit:contain;border-radius:8px;';
    var progressEl = document.createElement('div');
    progressEl.style.cssText = 'margin-top:6px;height:4px;background:rgba(0,0,0,0.08);border-radius:2px;overflow:hidden;';
    var progressFill = document.createElement('div');
    progressFill.style.cssText = 'width:0;height:100%;background:var(--color-sage,#5a7d5c);transition:width .3s;';
    var statusEl = document.createElement('div');
    statusEl.style.cssText = 'margin-top:4px;font-size:0.76rem;color:var(--text-muted,#8a8a8a);';
    statusEl.textContent = '准备识别...';
    progressEl.appendChild(progressFill);

    // 手写开关 + 可选云端识别 key（OCR.space 免费 API）
    var optRow = document.createElement('div');
    optRow.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:0.76rem;';
    var lblHand = document.createElement('label');
    lblHand.style.cssText = 'display:inline-flex;align-items:center;gap:4px;cursor:pointer;color:var(--text-secondary,#5a6b5e);';
    lblHand.innerHTML = '<input type="checkbox" id="wb-ocr-handwriting" style="width:auto;"> 手写内容（识别手写笔记更稳）';
    var keyDetails = document.createElement('details');
    keyDetails.style.cssText = 'margin-left:auto;';
    keyDetails.innerHTML =
      '<summary style="cursor:pointer;color:var(--text-muted,#8a8a8a);user-select:none;">云端识别（免费，可选）</summary>' +
      '<div style="display:flex;gap:6px;margin-top:6px;align-items:center;">' +
        '<input id="wb-ocrspace-key" type="password" placeholder="OCR.space 免费 API Key" style="flex:1;min-width:160px;padding:5px 8px;font-size:0.76rem;border:1px solid rgba(0,0,0,0.12);border-radius:8px;">' +
      '</div>' +
      '<div style="font-size:0.7rem;color:var(--text-muted,#8a8a8a);margin-top:4px;">前往 ocr.space/ocrapi 免费申请（25k 次/月），key 保存在本机，识别效果显著提升。</div>';
    optRow.appendChild(lblHand);
    optRow.appendChild(keyDetails);

    previewWrap.appendChild(imgEl);
    previewWrap.appendChild(optRow);
    previewWrap.appendChild(progressEl);
    previewWrap.appendChild(statusEl);
    if (modal) modal.insertBefore(previewWrap, modal.firstChild);

    // 回填已保存的 OCR.space key，本地监听保存
    var ocrspaceKeyInput = document.getElementById('wb-ocrspace-key');
    if (ocrspaceKeyInput) {
      try { ocrspaceKeyInput.value = localStorage.getItem('bioquest_ocrspace_key') || ''; } catch (e) {}
      ocrspaceKeyInput.addEventListener('input', function () {
        try { localStorage.setItem('bioquest_ocrspace_key', ocrspaceKeyInput.value.trim()); } catch (e) {}
      });
    }

    var qEl = document.getElementById('wb-input-question');
    if (qEl) qEl.value = '';

    var reader = new FileReader();
    reader.onload = function(ev) {
      var imgData = ev.target.result;
      imgEl.src = imgData;
      imgEl.onload = function() { statusEl.textContent = '识别中...'; };

      var COLOR_SUCCESS = 'var(--color-sage,#3a6b4a)';
      var COLOR_WARN    = 'var(--color-amber,#c4956a)';
      var COLOR_ERROR   = 'var(--color-error,#c0553a)';

      var setStatus = function (txt, color) {
        statusEl.textContent = txt;
        statusEl.style.color = color || '';
      };
      var setProgress = function (p) { progressFill.style.width = p + '%'; };

      // =====【新路径】OcrEngine 统一多引擎降级：Vision → PaddleOCR → Tesseract → OCRad；
      // 勾选"手写内容"后走手写优化链（保留灰度预处理 + 可选 OCR.space 云端手写 API）
      if (window.OcrEngine && typeof window.OcrEngine.recognize === 'function') {
        var handCheckbox = document.getElementById('wb-ocr-handwriting');
        var ocrspaceKeyEl = document.getElementById('wb-ocrspace-key');
        var ocrOpts = { minTextLength: 3, handwriting: !!(handCheckbox && handCheckbox.checked) };
        if (ocrspaceKeyEl && ocrspaceKeyEl.value && ocrspaceKeyEl.value.trim()) {
          ocrOpts.ocrspaceApiKey = ocrspaceKeyEl.value.trim();
        }
        window.OcrEngine.recognize(imgData, ocrOpts, {
          setText: function (t, kind) {
            var c = '';
            if (kind === 'success') c = COLOR_SUCCESS;
            else if (kind === 'warn') c = COLOR_WARN;
            else if (kind === 'error') c = COLOR_ERROR;
            setStatus(t, c);
            if (kind === 'success' || kind === 'error') {
              // 只在"完成/最终失败"弹 toast，中间进度不刷屏
              showToast(t.replace(/^\[L\d\/\d\]\s*(✓|✗)?\s*/, ''));
            }
          },
          setProgress: setProgress
        }, function (result) {
          if (result && result.text) {
            if (qEl) qEl.value = result.text;
            try { sessionStorage.setItem('bioquest_ocr_last_engine', result.engine || ''); } catch (e) {}
            return;
          }
          // OcrEngine 全失败 → 最终再兜底一次 _runTesseractOcr
          console.warn('[wrongbook] OcrEngine 多级未命中，最后兜底原生 Tesseract');
          setStatus('多级引擎未识别，最终兜底识别中...', COLOR_WARN);
          _runTesseractOcr(imgData, imgEl, progressFill, statusEl, qEl);
        });
        return;
      }

      console.warn('[wrongbook] OcrEngine 未就绪，走旧版 Vision+Tesseract 双级逻辑');
      if (window.AiClient && typeof window.AiClient.visionRecognize === 'function' &&
          (typeof window.AiClient.hasVisionSupport !== 'function' || window.AiClient.hasVisionSupport())) {
        progressFill.style.width = '30%';
        statusEl.textContent = '使用视觉模型识别中（准确率最高）...';
        showToast('使用 AI 视觉模型识别中...');

        window.AiClient.visionRecognize({
          image: imgData,
          onDone: function(text) {
            text = (text || '').trim();
            if (qEl) qEl.value = text || '';
            progressFill.style.width = '100%';
            statusEl.textContent = text ? '✓ AI 视觉识别完成，请校对后保存' : '✗ 未识别到文本，正在回退到本地 OCR...';
            statusEl.style.color = text ? COLOR_SUCCESS : COLOR_WARN;
            if (text) {
              showToast('AI 视觉识别完成，请校对后保存');
              return;
            }
            _runTesseractOcr(imgData, imgEl, progressFill, statusEl, qEl);
          },
          onError: function(err) {
            console.warn('[wrongbook] 视觉 OCR 失败，回退到 Tesseract:', err && err.message);
            setStatus('视觉 OCR 失败，正在回退到本地引擎...', COLOR_WARN);
            _runTesseractOcr(imgData, imgEl, progressFill, statusEl, qEl);
          }
        }).catch(function(err) {
          console.warn('[wrongbook] 视觉 OCR 异常，回退到 Tesseract:', err);
          _runTesseractOcr(imgData, imgEl, progressFill, statusEl, qEl);
        });
      } else {
        showToast('未配置 AI API Key，使用本地 OCR（建议在「我的 → 设置」配置 API Key 以获得更好效果）');
        _runTesseractOcr(imgData, imgEl, progressFill, statusEl, qEl);
      }
    };
    reader.readAsDataURL(file);
  }

  // Tesseract OCR（带图像预处理 + PSM 调优 + 后处理）
  function _runTesseractOcr(imgData, imgEl, progressFill, statusEl, qEl) {
    _loadTesseract(function(err) {
      if (err) {
        statusEl.textContent = '✗ ' + err.message;
        statusEl.style.color = 'var(--color-error,#c0553a)';
        showToast(err.message);
        return;
      }
      statusEl.textContent = '图像预处理中...';
      progressFill.style.width = '10%';

      _preprocessImage(imgData, function(processedData) {
        imgEl.src = processedData;
        statusEl.textContent = '本地 OCR 识别中... 0%';
        showToast('本地 OCR 识别中，请稍候...');

        // PSM 6（假设为单一统一文本块）对题目这类文本效果最好
        // 若识别失败再尝试 PSM 3（全自动，默认）
        var tryRecognize = function(psm, fallback) {
          window.Tesseract.recognize(processedData, 'chi_sim+eng', {
            tessedit_pageseg_mode: psm,
            logger: function(m) {
              if (m.status === 'recognizing text') {
                var pct = Math.round(m.progress * 100);
                progressFill.style.width = (10 + pct * 0.85) + '%';
                statusEl.textContent = '本地 OCR 识别中... ' + pct + '% (PSM ' + psm + ')';
              } else if (m.status) {
                statusEl.textContent = m.status + '...';
              }
            }
          }).then(function(result) {
            var text = (result && result.data && result.data.text) || '';
            text = _postprocessOcrText(text);
            // PSM 6 结果太短或为空，尝试 PSM 3
            if (text.length < 5 && fallback) {
              statusEl.textContent = '尝试另一种识别模式...';
              tryRecognize(3, false);
              return;
            }
            if (qEl) qEl.value = text || '';
            progressFill.style.width = '100%';
            statusEl.textContent = text ? '✓ 本地识别完成，请校对后保存' : '✗ 未识别到文本，请手动输入';
            statusEl.style.color = text ? 'var(--color-sage,#3a6b4a)' : 'var(--color-error,#c0553a)';
            showToast(text ? '识别完成，请校对后保存' : '未识别到文本，请手动输入');
          }).catch(function(e) {
            if (fallback) {
              statusEl.textContent = '识别失败，重试中...';
              tryRecognize(3, false);
              return;
            }
            statusEl.textContent = '✗ OCR 失败：' + errText(e);
            statusEl.style.color = 'var(--color-error,#c0553a)';
            showToast('OCR 失败：' + errText(e));
          });
        };
        tryRecognize(6, true);
      });
    });
  }

  function _closeModal() {
    _releaseWbModal();
    var overlay = document.getElementById('wb-modal-overlay');
    if (overlay) overlay.remove();
  }

  function _openAddModal() {
    _closeModal();
    var overlay = document.createElement('div');
    overlay.id = 'wb-modal-overlay';
    overlay.className = 'wb-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '添加错题');
    overlay.innerHTML = '<div class="wb-modal">' +
      '<h3>添加错题</h3>' +
      '<div class="wb-form-group"><label>题目内容</label><textarea id="wb-input-question" placeholder="粘贴或输入题目"></textarea></div>' +
      '<div class="wb-form-group"><label>你的答案</label><input type="text" id="wb-input-user-answer" placeholder=""></div>' +
      '<div class="wb-form-group"><label>正确答案</label><input type="text" id="wb-input-correct-answer" placeholder=""></div>' +
      '<div class="wb-form-group"><label>学科细分</label><input type="text" id="wb-input-subject" placeholder="如：细胞生物学"></div>' +
      '<div class="wb-form-group"><label>核心概念</label><input type="text" id="wb-input-concept" placeholder="如：光合作用"></div>' +
      '<div class="wb-form-group"><label>难度</label><select id="wb-input-difficulty"><option value="easy">基础</option><option value="medium" selected>进阶</option><option value="hard">挑战</option></select></div>' +
      '<div class="wb-actions">' +
        '<button class="wb-btn" id="wb-save-btn">保存</button>' +
        '<button class="wb-btn wb-btn--secondary" id="wb-cancel-btn">取消</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(overlay);

    // 焦点陷阱：ESC 关闭、初始聚焦到题目输入
    if (window.BioQuestA11y && typeof window.BioQuestA11y.trapFocus === 'function') {
      _wbFocusTrap = window.BioQuestA11y.trapFocus(overlay, {
        onEscape: _closeModal,
        initialFocus: overlay.querySelector('#wb-input-question')
      });
    }

    document.getElementById('wb-cancel-btn').addEventListener('click', _closeModal);
    document.getElementById('wb-save-btn').addEventListener('click', async function() {
      var question = {
        question_text: document.getElementById('wb-input-question').value.trim(),
        user_answer: document.getElementById('wb-input-user-answer').value.trim(),
        correct_answer: document.getElementById('wb-input-correct-answer').value.trim(),
        subject: document.getElementById('wb-input-subject').value.trim(),
        concept: document.getElementById('wb-input-concept').value.trim(),
        difficulty: document.getElementById('wb-input-difficulty').value,
        source: 'manual'
      };
      if (!question.question_text) { showToast('请输入题目内容'); return; }
      var res = await window.addWrongQuestion(question);
      if (!res.ok) { showToast('保存失败：' + errText(res.error)); return; }
      showToast('已保存');
      _closeModal();
      await initWrongbook();
    });
  }

  function _openDetail(id) {
    var q = _currentList.find(function(x) { return x.id === id; });
    if (!q) return;
    _currentDetail = q;
    _closeModal();
    var overlay = document.createElement('div');
    overlay.id = 'wb-modal-overlay';
    overlay.className = 'wb-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '错题详情');
    overlay.innerHTML = '<div class="wb-modal">' +
      '<h3>错题详情</h3>' +
      '<div class="wb-form-group"><label>题目内容</label><textarea id="wb-edit-question">' + (q.question_text || '') + '</textarea></div>' +
      '<div class="wb-form-group"><label>你的答案</label><input type="text" id="wb-edit-user-answer" value="' + (q.user_answer || '') + '"></div>' +
      '<div class="wb-form-group"><label>正确答案</label><input type="text" id="wb-edit-correct-answer" value="' + (q.correct_answer || '') + '"></div>' +
      '<div class="wb-form-group"><label>核心概念</label><input type="text" id="wb-edit-concept" value="' + (q.concept || '') + '"></div>' +
      '<div class="wb-form-group"><label>错误原因</label><input type="text" id="wb-edit-error-reason" value="' + (q.error_reason || '') + '" placeholder="概念理解错误/审题错误/计算错误/记忆遗忘/混淆相似概念"></div>' +
      '<div class="wb-form-group"><label>教材章节</label><input type="text" id="wb-edit-chapter" value="' + (q.textbook_chapter || '') + '"></div>' +
      '<div class="wb-form-group"><label>解析</label><textarea id="wb-edit-analysis">' + (q.analysis || '') + '</textarea></div>' +
      '<div class="wb-actions">' +
        '<button class="wb-btn" id="wb-update-btn">更新</button>' +
        '<button class="wb-btn wb-btn--secondary" id="wb-cancel-btn">关闭</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(overlay);

    // 焦点陷阱：ESC 关闭、初始聚焦到题目输入
    if (window.BioQuestA11y && typeof window.BioQuestA11y.trapFocus === 'function') {
      _wbFocusTrap = window.BioQuestA11y.trapFocus(overlay, {
        onEscape: _closeModal,
        initialFocus: overlay.querySelector('#wb-edit-question')
      });
    }

    document.getElementById('wb-cancel-btn').addEventListener('click', _closeModal);
    document.getElementById('wb-update-btn').addEventListener('click', async function() {
      var updates = {
        question_text: document.getElementById('wb-edit-question').value.trim(),
        user_answer: document.getElementById('wb-edit-user-answer').value.trim(),
        correct_answer: document.getElementById('wb-edit-correct-answer').value.trim(),
        concept: document.getElementById('wb-edit-concept').value.trim(),
        error_reason: document.getElementById('wb-edit-error-reason').value.trim(),
        textbook_chapter: document.getElementById('wb-edit-chapter').value.trim(),
        analysis: document.getElementById('wb-edit-analysis').value.trim()
      };
      var res = await window.updateWrongQuestion(id, updates);
      if (!res.ok) { showToast('更新失败：' + errText(res.error)); return; }
      showToast('已更新');
      _closeModal();
      await initWrongbook();
    });
  }

  async function _openAnalyze(id) {
    var q = _currentList.find(function(x) { return x.id === id; });
    if (!q) return;
    _closeModal();
    var overlay = document.createElement('div');
    overlay.id = 'wb-modal-overlay';
    overlay.className = 'wb-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'AI 错题分析');
    overlay.innerHTML = '<div class="wb-modal">' +
      '<h3>AI 错题分析</h3>' +
      '<p class="bq-text-muted">正在分析中，请稍候...</p>' +
    '</div>';
    document.body.appendChild(overlay);

    // 焦点陷阱：ESC 关闭、初始聚焦到标题（内容后续会替换，动态可聚焦元素仍会被陷阱捕获）
    if (window.BioQuestA11y && typeof window.BioQuestA11y.trapFocus === 'function') {
      _wbFocusTrap = window.BioQuestA11y.trapFocus(overlay, {
        onEscape: _closeModal,
        initialFocus: overlay.querySelector('h3')
      });
    }

    var res = await window.analyzeWrongQuestionWithAI(q.question_text, q.user_answer, q.correct_answer);
    if (!res.ok) {
      overlay.querySelector('.wb-modal').innerHTML = '<h3>AI 分析失败</h3><p>' + errText(res.error) + '</p><button class="wb-btn wb-btn--secondary" data-on=\'["closeWrongbookModal"]\'>关闭</button>';
      return;
    }

    var a = res.analysis;
    overlay.querySelector('.wb-modal').innerHTML =
      '<h3>AI 错题分析</h3>' +
      '<div class="wb-analysis-box">' +
        '<p><strong>核心概念：</strong>' + (a.concept || '-') + '</p>' +
        '<p><strong>教材章节：</strong>' + (a.textbook_chapter || '-') + '</p>' +
        '<p><strong>错误原因：</strong>' + (a.error_reason || '-') + '</p>' +
        '<p><strong>解析：</strong>' + (a.analysis || '-') + '</p>' +
      '</div>' +
      '<div class="wb-form-group"><label>相关概念（用逗号分隔）</label><input type="text" id="wb-ai-nodes" value="' + (a.knowledge_graph_nodes ? a.knowledge_graph_nodes.join(', ') : '') + '"></div>' +
      '<div class="wb-actions">' +
        '<button class="wb-btn" id="wb-ai-save-btn">保存分析结果</button>' +
        '<button class="wb-btn wb-btn--secondary" id="wb-ai-related-btn">推送相关练习</button>' +
        '<button class="wb-btn wb-btn--secondary" id="wb-cancel-btn">关闭</button>' +
      '</div>' +
      '<div class="wb-related-list" id="wb-related-list"></div>';

    document.getElementById('wb-cancel-btn').addEventListener('click', _closeModal);
    document.getElementById('wb-ai-save-btn').addEventListener('click', async function() {
      var updates = {
        concept: a.concept || q.concept,
        error_reason: a.error_reason || q.error_reason,
        textbook_chapter: a.textbook_chapter || q.textbook_chapter,
        analysis: a.analysis || q.analysis,
        knowledge_graph_nodes: document.getElementById('wb-ai-nodes').value.split(',').map(function(s){return s.trim();}).filter(function(s){return s;})
      };
      var r = await window.updateWrongQuestion(id, updates);
      if (!r.ok) { showToast('保存失败：' + errText(r.error)); return; }
      showToast('已保存');
      _closeModal();
      await initWrongbook();
    });
    document.getElementById('wb-ai-related-btn').addEventListener('click', async function() {
      var nodes = document.getElementById('wb-ai-nodes').value.split(',').map(function(s){return s.trim();}).filter(function(s){return s;});
      var list = document.getElementById('wb-related-list');
      list.innerHTML = '<p class="bq-text-muted">正在查找相关练习...</p>';
      var related = await window.getRelatedPracticeQuestions(nodes, 5);
      if (!related || related.length === 0) {
        list.innerHTML = '<p class="bq-text-muted">未找到相关练习题。</p>';
        return;
      }
      list.innerHTML = '<h4 style="margin-bottom:8px;">相关练习</h4>' + related.map(function(rq) {
        return '<div class="wb-related-item" data-qid="' + (rq.id || '') + '">' +
          '<strong>' + (rq.concept || rq.subject || '练习') + '</strong>' +
          '<p style="margin:4px 0 0;color:var(--text-secondary);font-size:0.85rem;">' + _truncate(rq.question || rq.stem, 80) + '</p>' +
        '</div>';
      }).join('');
    });
  }

  async function _deleteQuestion(id) {
    // P1-21：删除前捕获该行快照，用 showUndoToast 支持撤销恢复
    var snapshot = null;
    if (Array.isArray(_currentList)) {
      for (var i = 0; i < _currentList.length; i++) {
        if (_currentList[i] && String(_currentList[i].id) === String(id)) { snapshot = _currentList[i]; break; }
      }
    }
    function doDelete() {
      return window.deleteWrongQuestion(id).then(function (res) {
        if (!res.ok) { showToast('删除失败：' + errText(res.error)); return null; }
        return snapshot;
      });
    }
    if (typeof showConfirmDialog === 'function') {
      showConfirmDialog('!', '删除错题', '确定删除这道错题？', async function() {
        var snap = await doDelete();
        if (!snap) return;
        await initWrongbook();
        if (typeof window.showUndoToast === 'function') {
          window.showUndoToast('错题已删除', async function () {
            if (typeof window.addWrongQuestion === 'function') {
              try { await window.addWrongQuestion(snap); } catch (e) { /* 撤销失败 */ }
            }
            await initWrongbook();
            showToast('已恢复');
          });
        } else {
          showToast('已删除');
        }
      });
    } else {
      var snap = await doDelete();
      if (!snap) return;
      await initWrongbook();
      if (typeof window.showUndoToast === 'function') {
        window.showUndoToast('错题已删除', async function () {
          if (typeof window.addWrongQuestion === 'function') {
            try { await window.addWrongQuestion(snap); } catch (e) { /* 撤销失败 */ }
          }
          await initWrongbook();
          showToast('已恢复');
        });
      } else {
        showToast('已删除');
      }
    }
  }

  async function initWrongbook(target) {
    _addStyles();
    var pageTarget = target || document.getElementById('page-content');
    if (!pageTarget) return;

    // 合并错题本 + 深度复盘为同一模块（顶部 Tab 切换）
    pageTarget.innerHTML = '<div class="page-header" style="padding:24px 20px;text-align:center;">' +
      '<h1 style="margin:0;font-family:var(--font-serif,serif);color:var(--color-deep);">错题与复盘</h1>' +
      '<p style="margin:8px 0 0;color:var(--text-muted);font-size:0.9rem;">错题收录 · AI 深度分析 · 同类题针对练习</p>' +
    '</div>' +
    '<div class="wb-tabs" style="max-width:900px;margin:0 auto 16px;padding:0 20px;display:flex;gap:8px;border-bottom:1px solid var(--border-light,#ece8e1);">' +
      '<button class="wb-tab active" data-wb-tab="list" style="padding:10px 18px;border:none;background:none;cursor:pointer;font-size:0.92rem;font-weight:600;color:var(--color-sage,#5a7d5c);border-bottom:2px solid var(--color-sage,#5a7d5c);">错题列表</button>' +
      '<button class="wb-tab" data-wb-tab="deep" style="padding:10px 18px;border:none;background:none;cursor:pointer;font-size:0.92rem;font-weight:600;color:var(--text-muted,#8a8a8a);border-bottom:2px solid transparent;">深度复盘</button>' +
    '</div>' +
    '<div id="wb-tab-content"></div>';

    // 默认渲染错题列表
    await _renderWrongbookTab();

    // Tab 切换
    pageTarget.querySelectorAll('.wb-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        pageTarget.querySelectorAll('.wb-tab').forEach(function(b) {
          b.classList.remove('active');
          b.style.color = 'var(--text-muted,#8a8a8a)';
          b.style.borderBottomColor = 'transparent';
        });
        btn.classList.add('active');
        btn.style.color = 'var(--color-sage,#5a7d5c)';
        btn.style.borderBottomColor = 'var(--color-sage,#5a7d5c)';
        if (btn.dataset.wbTab === 'deep') {
          _renderDeepReviewTab();
        } else {
          _renderWrongbookTab();
        }
      });
    });
  }

  // 错题列表 Tab
  async function _renderWrongbookTab() {
    var host = document.getElementById('wb-tab-content');
    if (!host) return;
    host.innerHTML = '<div class="wb-container">' +
      '<div id="wb-toolbar"></div>' +
      '<div id="wb-list"><div class="wb-empty">加载中...</div></div>' +
    '</div>';
    _currentList = await _loadList();
    await _loadFsrsStates(_currentList);
    _renderToolbar(document.getElementById('wb-toolbar'));
    _renderList(document.getElementById('wb-list'));
  }

  // 深度复盘 Tab（复用 review-deep 模块）
  function _renderDeepReviewTab() {
    var host = document.getElementById('wb-tab-content');
    if (!host) return;
    host.innerHTML = '<div id="rd-host"></div>';
    if (typeof window.initReviewDeep === 'function') {
      window.initReviewDeep(host);
    } else {
      host.innerHTML = '<div class="wb-empty">深度复盘模块加载失败，请刷新页面重试。</div>';
    }
  }

  window.initWrongbook = initWrongbook;
  window.closeWrongbookModal = _closeModal;
})();
