/**
 * TATABOX — 练习页「筛选面板」子模块（M-01 渐进拆分）
 * ------------------------------------------------------------
 * 由 loadModule('practice') 的依赖链先于 practice.js 加载；
 * 运行期依赖 practice.js 的全局：PracticeState、applyFilters、injectPracticeStyles、
 * bindWrongPracticeEntry、bindPullEvents、_renderPullSummary 等。
 * 对外保留 renderFilterPanel / bindFilterEvents / updateAvailableCount 原名。
 * ============================================================
 */
'use strict';

/**
 * 统计当前已加载题库（基础题 + 逻辑题 + 联赛/IBO 真题）各来源题目数。
 * 来源分类由 QuestionModel.getQuestionSourceKey 唯一实现。
 * @returns {Object} { all:number, cnbo:number, ibo:number, original:number, gaokao:number, school:number, other:number }
 */
function _practiceSourceCounts() {
  const counts = { all: 0 };
  const pools = [
    PracticeState.allQuestions || [],
    PracticeState.logicData || [],
    PracticeState.leagueData || []
  ];
  const classify = (typeof QuestionModel !== 'undefined' && QuestionModel.getQuestionSourceKey)
    ? QuestionModel.getQuestionSourceKey
    : function () { return 'original'; };
  pools.forEach(function (pool) {
    pool.forEach(function (q) {
      counts.all++;
      const key = classify(q);
      counts[key] = (counts[key] || 0) + 1;
    });
  });
  return counts;
}

/** 把来源题数写入筛选面板（题库异步加载完成后也能刷新，无需重渲染面板） */
function _updateSourceCounts() {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  const counts = _practiceSourceCounts();
  document.querySelectorAll('[data-source-count]').forEach(function (el) {
    const key = el.getAttribute('data-source-count');
    el.textContent = counts[key] || 0;
  });
}

function renderFilterPanel() {
  injectPracticeStyles();
  const container = document.getElementById('practice-root');
  if (!container) return;

  // 题库数据源（与设置页共享同一键）：'cloud' 云端同步 / 'local' 本地题库
  const qSource = (typeof loadSetting === 'function') ? loadSetting('question_source', 'cloud') : 'cloud';

  const moduleChecks = PracticeModuleGroups.map(
    (g) => `
    <label class="practice-filter-check">
      <input type="checkbox" value="${g.id}"
        ${PracticeState.selectedModules.includes(g.id) ? 'checked' : ''}
        data-module-check>
      <span>${g.label}</span>
      <span style="font-size:0.75rem;color:var(--text-muted);">
        ${g.subjects.join('、')}
      </span>
    </label>
  `
  ).join('');

  const difficultyChecks = DIFFICULTY_OPTIONS.map(
    (d) => `
    <label class="practice-filter-check">
      <input type="checkbox" value="${d.value}"
        ${PracticeState.selectedDifficulties.includes(d.value) ? 'checked' : ''}
        data-difficulty-check>
      <span>${d.label}</span>
    </label>
  `
  ).join('');

  const targetChecks = TARGET_OPTIONS.map(
    (t) => `
    <label class="practice-filter-check">
      <input type="checkbox" value="${t.value}"
        ${PracticeState.selectedTargets.includes(t.value) ? 'checked' : ''}
        data-target-check>
      <span>${t.label}</span>
    </label>
  `
  ).join('');

  // 题目来源（多选；未勾选具体来源 = 全部）
  const selectedSources = Array.isArray(PracticeState.selectedSources) ? PracticeState.selectedSources : [];
  const sourceChecks = SOURCE_OPTIONS.map((s) => {
    const checked = s.value === 'all'
      ? selectedSources.length === 0
      : selectedSources.indexOf(s.value) >= 0;
    return `
    <label class="practice-filter-check">
      <input type="checkbox" value="${s.value}" ${checked ? 'checked' : ''} data-source-check>
      <span>${s.label}</span>
      <span style="font-size:0.75rem;color:var(--text-muted);" data-source-count="${s.value}">0</span>
    </label>
  `;
  }).join('');

  // 题目数量：预设选项 + 「自定义」；questionCount 不在预设中时选中自定义并回显输入框
  const isPresetCount = QUESTION_COUNT_OPTIONS.indexOf(PracticeState.questionCount) >= 0;
  const countOptions = QUESTION_COUNT_OPTIONS.map(
    (n) => `<option value="${n}" ${PracticeState.questionCount === n ? 'selected' : ''}>${n} 题</option>`
  ).join('') + `<option value="custom" ${isPresetCount ? '' : 'selected'}>自定义…</option>`;

  const kgBanner = PracticeState.conceptFilter
    ? `<div class="practice-kg-banner" style="margin-bottom:16px;padding:14px 16px;background:var(--color-sage-light,rgba(90,125,92,0.1));border:1px solid var(--color-sage,rgba(90,125,92,0.3));border-radius:12px;position:relative;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;background:var(--color-sage,rgba(90,125,92,0.2));border-radius:16px;font-size:0.85rem;font-weight:600;color:var(--color-deep);">
            ${escapeHtml(PracticeState.conceptFilter)}
          </span>
          ${PracticeState.kgCategory ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:16px;font-size:0.8rem;color:#3b82f6;">${escapeHtml(PracticeState.kgCategory)}</span>` : ''}
          <button id="practice-clear-concept-btn" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;border:1px solid var(--color-sage,rgba(90,125,92,0.3));background:transparent;color:var(--text-muted);cursor:pointer;font-size:14px;line-height:1;padding:0;margin-left:auto;" title="清除专项筛选">×</button>
        </div>
        <div style="font-size:0.82rem;color:var(--text-muted);margin-top:8px;">来自知识图谱的专项练习 · 点击 × 可恢复常规筛选</div>
      </div>`
    : '';

  container.innerHTML = `
    <div class="animate-fade-in">
      <section class="section" style="padding-top:0;padding-bottom:32px;">
        <h2 class="section-title">专项练习</h2>
        <p class="section-desc">按知识点分类进行针对性练习，巩固薄弱环节。</p>
      </section>

      ${kgBanner}

      <div class="wrong-practice-entry" id="wrong-practice-entry">
        <span class="wrong-practice-icon">!</span>
        <span>错题专项练习</span>
        <span class="wrong-practice-count" id="wrong-practice-count"></span>
      </div>

      <div class="practice-filter-panel" id="practice-filter-panel">
        <div class="practice-filter-section">
          <div class="practice-filter-header">
            <h3 class="practice-filter-title">题库数据源</h3>
            <span class="practice-filter-note bq-hint--xs" id="practice-source-status" >
              ${qSource === 'local' ? '当前：本地题库' : '当前：云端同步'}
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px;">
            <select class="practice-select" id="practiceQuestionSource" aria-label="题库数据源" style="min-width:150px;">
              <option value="cloud" ${qSource === 'cloud' ? 'selected' : ''}>云端同步</option>
              <option value="local" ${qSource === 'local' ? 'selected' : ''}>本地题库</option>
            </select>
            <span class="bq-hint--xs" id="practice-source-hint">
              ${qSource === 'local'
                ? '仅从站点内 data/ 读取题目，不发远程请求'
                : '云端优先，本地兜底（默认）'}
            </span>
          </div>
        </div>

        <div class="practice-filter-section">
          <h3 class="practice-filter-title">练习模式</h3>
          <div class="practice-mode-selector" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <button class="practice-mode-btn ${PracticeState.selectedTargets.length === 3 && PracticeState.selectedDifficulties.length === 3 ? 'active' : ''}" data-mode="all" title="全部题目，不限目标群体">
              全部
            </button>
            <button class="practice-mode-btn ${PracticeState.selectedTargets.length === 1 && PracticeState.selectedTargets[0] === 'high_school' ? 'active' : ''}" data-mode="gaokao" title="高考模式：仅高中课标题目，难度基础~进阶">
              高考模式
            </button>
            <button class="practice-mode-btn ${PracticeState.selectedTargets.length === 1 && PracticeState.selectedTargets[0] === 'competition' ? 'active' : ''}" data-mode="competition" title="竞赛模式：竞赛难度题目">
              竞赛模式
            </button>
          </div>
          <div class="bq-hint--xs">
            高考模式专为普通高中生设计，严格限定高中生物课标范围
          </div>
        </div>

        <div class="practice-filter-section">
          <h3 class="practice-filter-title">题目来源</h3>
          <div class="practice-filter-checks" id="sourceChecks">
            ${sourceChecks}
          </div>
          <div class="bq-hint--xs bq-hint--mt">
            可多选；不勾选任何来源，等同「全部来源」。括号内为当前题库中该来源的题目数。
          </div>
        </div>

        <div class="practice-filter-section">
          <h3 class="practice-filter-title">题目类别</h3>
          <div class="practice-category-selector">
            <button class="practice-category-btn ${PracticeState.selectedCategory === 'all' ? 'active' : ''}" data-category="all">全部</button>
            <button class="practice-category-btn ${PracticeState.selectedCategory === 'basic' ? 'active' : ''}" data-category="basic">基础知识</button>
            <button class="practice-category-btn ${PracticeState.selectedCategory === 'logic' ? 'active' : ''}" data-category="logic">逻辑推理</button>
            <button class="practice-category-btn ${PracticeState.selectedCategory === 'ggbo' ? 'active' : ''}" data-category="ggbo">其他</button>
          </div>
          <div class="bq-hint--xs bq-hint--mt">
            ${PracticeState.selectedCategory === 'logic' ? '逻辑推理题：基于实验数据的分析推理，每题2分' : PracticeState.selectedCategory === 'basic' ? '基础知识题：MTF多重判断题型，每题2分' : PracticeState.selectedCategory === 'ggbo' ? '其他题目：第一届 GGBO 生物学竞赛全部 80 题，每题 2 分' : '混合模式：基础知识 + 逻辑推理 + 其他'}
          </div>
        </div>

        <div class="practice-filter-section">
          <div class="practice-filter-header">
            <h3 class="practice-filter-title">选择模块</h3>
            <button class="btn btn-sm btn-secondary" id="practice-toggle-all">全选</button>
          </div>
          <div class="practice-filter-checks" id="moduleChecks">
            ${moduleChecks}
          </div>
        </div>

        <div class="practice-filter-section">
          <h3 class="practice-filter-title">选择难度</h3>
          <div class="practice-filter-checks" id="difficultyChecks">
            ${difficultyChecks}
          </div>
        </div>

        <div class="practice-filter-section">
          <h3 class="practice-filter-title">目标群体</h3>
          <div class="practice-filter-checks" id="targetChecks">
            ${targetChecks}
          </div>
          <div class="bq-hint--xs bq-hint--mt">
            高考题严格限定高中课标；竞赛题可涉及大学基础生物学；共通题为两者重叠基础
          </div>
        </div>

        <div class="practice-filter-section">
          <h3 class="practice-filter-title">题目数量</h3>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select class="practice-select" id="questionCount" aria-label="题目数量" style="min-width:110px;">
              ${countOptions}
            </select>
            <input type="number" id="customQuestionCount" class="practice-select" min="1" max="200" step="1"
              value="${isPresetCount ? '' : PracticeState.questionCount}"
              placeholder="输入 1-200"
              style="width:120px;${isPresetCount ? 'display:none;' : ''}" aria-label="自定义刷题数量">
          </div>
          <div class="bq-hint--xs bq-hint--mt">
            预设 5/10/20/50，或选择「自定义…」输入 1-200 道（超出可用题目时按实际数量出题）
          </div>
        </div>

        <div class="practice-filter-actions">
          <button class="btn btn-primary btn-lg" id="practice-start-btn">
            开始练习
          </button>
          ${PracticeState.filteredQuestions.length > 0
            ? `<span style="font-size:0.875rem;color:var(--text-muted);margin-left:12px;"
                     title="当前筛选条件下可练的题目数（基础知识题 + 逻辑推理题）；改动模块/难度/类别会实时变化">
              共 ${PracticeState.filteredQuestions.length} 道可用题目
            </span>`
            : ''}
        </div>

        <div class="practice-pull-section" id="practice-pull-section">
          <div class="practice-pull-header">
            <h3 class="practice-filter-title" style="margin-bottom:0;">拉取题目</h3>
            <span class="practice-pull-hint">按当前筛选从 Supabase 拉取（有冷却）</span>
          </div>
          <div class="practice-pull-summary" id="practice-pull-summary"></div>
          <div class="practice-pull-controls">
            <select class="practice-select practice-pull-select" id="practice-pull-count" aria-label="拉取题目数量">
              <option value="5">5 道</option>
              <option value="10" selected>10 道</option>
              <option value="20">20 道</option>
            </select>
            <button class="btn btn-secondary" id="practice-pull-btn" style="min-width:120px;">
              拉取题目
            </button>
          </div>
          <div class="practice-pull-status" id="practice-pull-status"></div>
        </div>
      </div>
    </div>
  `;

  bindFilterEvents();
  bindWrongPracticeEntry();
  _updateSourceCounts();
}

function bindFilterEvents() {
  const rootEl = document.getElementById('practice-root');
  const toggleAllBtn = document.getElementById('practice-toggle-all');
  const moduleChecks = document.querySelectorAll('[data-module-check]');
  const difficultyChecks = document.querySelectorAll('[data-difficulty-check]');
  const categoryBtns = document.querySelectorAll('.practice-category-btn');
  const modeBtns = document.querySelectorAll('.practice-mode-btn');
  const countSelect = document.getElementById('questionCount');
  const startBtn = document.getElementById('practice-start-btn');
  const sourceSelect = document.getElementById('practiceQuestionSource');

  // 题库数据源切换：保存设置 → 重新加载题目 → 刷新统计
  if (sourceSelect) {
    sourceSelect.addEventListener('change', async () => {
      const val = sourceSelect.value;
      if (typeof saveSetting === 'function') saveSetting('question_source', val);
      const statusEl = document.getElementById('practice-source-status');
      const hintEl = document.getElementById('practice-source-hint');
      if (statusEl) statusEl.textContent = val === 'local' ? '当前：本地题库' : '当前：云端同步';
      if (hintEl) hintEl.textContent = val === 'local'
        ? '仅从站点内 data/ 读取题目，不发远程请求'
        : '云端优先，本地兜底（默认）';
showToast(val === 'local' ? '已切换为本地题库，正在重新加载题目…' : '已切换为云端同步，正在重新加载题目…');
      await loadPracticeQuestions();
      applyFilters();
      updateAvailableCount();
    });
  }

  // 练习模式快捷切换（带动画过渡）
  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      if (mode === 'gaokao') {
        PracticeState.selectedTargets = ['high_school'];
        PracticeState.selectedDifficulties = ['easy', 'medium'];
        PracticeState.selectedModules = ['module1', 'module2', 'module3', 'module4'];
        PracticeState.questionCount = 20;
      } else if (mode === 'competition') {
        PracticeState.selectedTargets = ['competition'];
        PracticeState.selectedDifficulties = ['medium', 'hard'];
        PracticeState.selectedModules = ['module1', 'module2', 'module3', 'module4'];
        PracticeState.questionCount = 20;
      } else {
        PracticeState.selectedTargets = ['high_school', 'competition', 'both'];
        PracticeState.selectedDifficulties = ['easy', 'medium', 'hard'];
        PracticeState.selectedModules = ['module1', 'module2', 'module3', 'module4'];
        PracticeState.questionCount = 10;
      }
      // 同步更新各复选框和选择器状态（带动画）
      animateFilterTransition(function() {
        renderFilterPanel();
        applyFilters();
        updateAvailableCount();
      });
    });
  });

  // 类别选择
  categoryBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      categoryBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      PracticeState.selectedCategory = btn.dataset.category;
      applyFilters();
      updateAvailableCount();
      // 更新类别描述
      const descEl = btn.closest('.practice-filter-section').querySelector('div[style*="font-size:0.78rem"]');
      if (descEl) {
        const desc = PracticeState.selectedCategory === 'logic'
          ? '逻辑推理题：基于实验数据的分析推理，每题2分'
          : PracticeState.selectedCategory === 'basic'
            ? '基础知识题：MTF多重判断题型，每题2分'
            : PracticeState.selectedCategory === 'ggbo'
              ? '其他题目：第一届 GGBO 生物学竞赛全部 80 题，每题 2 分'
              : '混合模式：基础知识 + 逻辑推理 + 其他';
        descEl.textContent = desc;
      }
    });
  });

  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', () => {
      const allChecked = [...moduleChecks].every((cb) => cb.checked);
      moduleChecks.forEach((cb) => {
        cb.checked = !allChecked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  if (moduleChecks.length > 0) {
    moduleChecks.forEach((cb) => {
      cb.addEventListener('change', () => {
        PracticeState.selectedModules = [...moduleChecks]
          .filter((c) => c.checked)
          .map((c) => c.value);
        applyFilters();
        updateAvailableCount();
      });
    });
  }

  if (difficultyChecks.length > 0) {
    difficultyChecks.forEach((cb) => {
      cb.addEventListener('change', () => {
        PracticeState.selectedDifficulties = [...difficultyChecks]
          .filter((c) => c.checked)
          .map((c) => c.value);
        applyFilters();
        updateAvailableCount();
      });
    });
  }

  const targetChecks = document.querySelectorAll('[data-target-check]');
  if (targetChecks.length > 0) {
    targetChecks.forEach((cb) => {
      cb.addEventListener('change', () => {
        PracticeState.selectedTargets = [...targetChecks]
          .filter((c) => c.checked)
          .map((c) => c.value);
        applyFilters();
        updateAvailableCount();
      });
    });
  }

  // 题目来源多选：「全部来源」与具体来源互斥；不勾选任何具体来源 = 全部
  const sourceCheckboxes = document.querySelectorAll('[data-source-check]');
  if (sourceCheckboxes.length > 0) {
    const allBox = [...sourceCheckboxes].find((c) => c.value === 'all');
    sourceCheckboxes.forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.value === 'all') {
          if (cb.checked) {
            sourceCheckboxes.forEach((c) => { if (c !== cb) c.checked = false; });
          }
        } else if (cb.checked && allBox) {
          allBox.checked = false;
        }
        const picked = [...sourceCheckboxes]
          .filter((c) => c.checked && c.value !== 'all')
          .map((c) => c.value);
        if (picked.length === 0) {
          if (allBox) allBox.checked = true;
          PracticeState.selectedSources = [];
        } else {
          PracticeState.selectedSources = picked;
        }
        applyFilters();
        updateAvailableCount();
      });
    });
  }

  if (countSelect) {
    countSelect.addEventListener('change', () => {
      const val = countSelect.value;
      const customInput = document.getElementById('customQuestionCount');
      if (val === 'custom') {
        if (customInput) {
          customInput.style.display = '';
          customInput.focus();
        }
        let num = customInput ? parseInt(customInput.value, 10) : NaN;
        if (isNaN(num) || num < 1) num = 10;
        PracticeState.questionCount = num;
      } else {
        PracticeState.questionCount = parseInt(val, 10);
        if (customInput) customInput.style.display = 'none';
      }
    });
  }

  const customCountInput = document.getElementById('customQuestionCount');
  if (customCountInput) {
    // 输入即生效（失焦/回车/输入变化时同步）
    customCountInput.addEventListener('change', () => {
      let num = parseInt(customCountInput.value, 10);
      if (isNaN(num) || num < 1) num = 1;
      if (num > 200) num = 200;
      customCountInput.value = num;
      PracticeState.questionCount = num;
    });
    customCountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') customCountInput.blur();
    });
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (PracticeState.selectedModules.length === 0) {
        alert('请至少选择一个模块。');
        return;
      }
      if (PracticeState.selectedDifficulties.length === 0) {
        alert('请至少选择一个难度。');
        return;
      }
      if (!PracticeState.allQuestions || PracticeState.allQuestions.length === 0) {
        alert('题库为空，请先点击下方「拉取题目」加载题目。');
        return;
      }
      if (PracticeState.filteredQuestions.length === 0) {
        alert('当前筛选条件下没有可用题目，请调整筛选条件或拉取更多题目。');
        return;
      }
      initNewSession();
      if (PracticeState.currentSet.length === 0) {
        alert('无法生成题目，请调整筛选条件。');
        return;
      }
      renderQuiz();
    });
  }

  bindPullEvents();

  // 清除专项按钮：使用事件委托（根元素绑定一次，避免 clone 重复绑定）
  if (rootEl) {
    rootEl.addEventListener('click', function (e) {
      var tgt = e.target;
      if (!tgt || !tgt.matches('#practice-clear-concept-btn')) return;
      e.preventDefault();
      PracticeState.conceptFilter = null;
      PracticeState.kgSource = null;
      PracticeState.kgCategory = null;
      PracticeState.selectedModules = ['module1', 'module2', 'module3', 'module4'];
      try { sessionStorage.removeItem('tatabox_kg_practice'); } catch (err) {}
      // 清除 URL 中的 concept 参数：直接替换 URL 并显式触发一次路由
      var baseUrl = window.location.pathname + window.location.search;
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', baseUrl + '#/practice');
      }
      try { window.scrollTo(0, 0); } catch (err) {}
      renderFilterPanel();
      applyFilters();
      updateAvailableCount();
    });
  }
}

function updateAvailableCount() {
  const countEl = document.querySelector('.practice-filter-actions span');
  if (countEl) {
    countEl.textContent = `共 ${PracticeState.filteredQuestions.length} 道可用题目`;
  }
  _updateSourceCounts();
  _renderPullSummary();
}

// M-01：显式挂载对外入口（practice.js / practice-pull.js / practice-share.js 仍按原名调用）
window.renderFilterPanel = renderFilterPanel;
window.bindFilterEvents = bindFilterEvents;
window.updateAvailableCount = updateAvailableCount;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.filters = {
    renderFilterPanel: renderFilterPanel,
    bindFilterEvents: bindFilterEvents,
    updateAvailableCount: updateAvailableCount
  };
})();
