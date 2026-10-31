/**
 * TATABOX — 练习页「拉取题目」子模块（M-01 渐进拆分）
 * ------------------------------------------------------------
 * 由 loadModule('practice') 的依赖链先于 practice.js 加载；
 * 运行期依赖 practice.js 的全局：PracticeState、applyFilters、showToast 等。
 * 对外保留 bindPullEvents / _renderPullSummary 原名，practice.js 直接调用。
 * ============================================================
 */
'use strict';

var PULL_COOLDOWN_MS = 20 * 1000; // 20 秒冷却（用户要求）
var PULL_COOLDOWN_KEY = 'bioquest_pull_cooldown_until';
var PULL_COOLDOWN_TIMER = null;

function _getPullCooldownRemaining() {
  try {
    var until = parseInt(localStorage.getItem(PULL_COOLDOWN_KEY) || '0', 10);
    return Math.max(0, until - Date.now());
  } catch (e) {
    return 0;
  }
}

function _setPullCooldown() {
  try {
    localStorage.setItem(PULL_COOLDOWN_KEY, String(Date.now() + PULL_COOLDOWN_MS));
  } catch (e) {}
}

function _formatCountdown(ms) {
  var sec = Math.ceil(ms / 1000);
  return sec + ' 秒';
}

function _updatePullButtonState() {
  var btn = document.getElementById('practice-pull-btn');
  if (!btn) return;
  var remaining = _getPullCooldownRemaining();
  if (remaining > 0) {
    btn.disabled = true;
    btn.textContent = '冷却中 ' + _formatCountdown(remaining);
    btn.classList.add('practice-pull-btn-cooldown');
    if (PULL_COOLDOWN_TIMER) clearTimeout(PULL_COOLDOWN_TIMER);
    PULL_COOLDOWN_TIMER = setTimeout(_updatePullButtonState, PRACTICE_PULL_TICK_MS);
  } else {
    btn.disabled = false;
    btn.textContent = '拉取题目';
    btn.classList.remove('practice-pull-btn-cooldown');
  }
}

function _setPullStatus(text, type) {
  var statusEl = document.getElementById('practice-pull-status');
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = 'practice-pull-status' + (type ? ' practice-pull-status--' + type : '');
}

function _renderPullSummary() {
  var summaryEl = document.getElementById('practice-pull-summary');
  if (!summaryEl) return;

  var moduleLabels = {
    module1: '模块一', module2: '模块二', module3: '模块三', module4: '模块四'
  };
  var modules = (PracticeState.selectedModules || [])
    .map(function(id) { return moduleLabels[id] || id; })
    .join('、') || '全部';

  var diffLabels = {
    easy: '基础', medium: '进阶', hard: '挑战',
    basic: '基础', league: '进阶', national: '挑战'
  };
  var diffs = (PracticeState.selectedDifficulties || [])
    .map(function(d) { return diffLabels[d] || d; })
    .join('、') || '不限';

  var targetLabels = {
    high_school: '高考', competition: '竞赛', both: '共通'
  };
  var targets = (PracticeState.selectedTargets || [])
    .map(function(t) { return targetLabels[t] || t; })
    .join('、') || '不限';

  var concept = PracticeState.conceptFilter ? escapeHtml(PracticeState.conceptFilter) : null;

  summaryEl.innerHTML = `
    <span>模块：${modules}</span>
    <span>难度：${diffs}</span>
    <span>目标：${targets}</span>
    ${concept ? '<span>专项：' + concept + '</span>' : ''}
  `;
}

function bindPullEvents() {
  var pullBtn = document.getElementById('practice-pull-btn');
  if (!pullBtn) return;

  // 清理旧计时器
  if (PULL_COOLDOWN_TIMER) {
    clearTimeout(PULL_COOLDOWN_TIMER);
    PULL_COOLDOWN_TIMER = null;
  }

  _renderPullSummary();
  _updatePullButtonState();

  pullBtn.addEventListener('click', function() {
    var remaining = _getPullCooldownRemaining();
    if (remaining > 0) {
      _setPullStatus('冷却中，请 ' + _formatCountdown(remaining) + ' 后再试', 'info');
      return;
    }
    handlePullQuestions();
  });
}

async function handlePullQuestions() {
  var countSel = document.getElementById('practice-pull-count');
  var btn = document.getElementById('practice-pull-btn');
  var countVal = countSel ? parseInt(countSel.value, 10) : 10;
  if (countVal > 20) countVal = 20;
  if (countVal < 1) countVal = 5;

  // 按当前筛选条件组装拉取参数
  var modMap = { module1: 'module_1', module2: 'module_2', module3: 'module_3', module4: 'module_4' };
  var modules = (PracticeState.selectedModules || [])
    .map(function(id) { return modMap[id]; })
    .filter(Boolean);
  if (modules.length === 0) modules = ['module_1', 'module_2', 'module_3', 'module_4'];

  var difficulties = PracticeState.selectedDifficulties || [];
  var targets = PracticeState.selectedTargets || [];
  var concept = PracticeState.conceptFilter || null;

  var qSource = (typeof loadSetting === 'function') ? loadSetting('question_source', 'cloud') : 'cloud';
  var items = null;

  btn.disabled = true;
  btn.textContent = '拉取中...';
  _setPullStatus(qSource === 'local' ? '正在从本地题库抽取 ' + countVal + ' 道题…' : '正在从 Supabase 拉取 ' + countVal + ' 道题…', 'info');

  try {
    // 本地题库模式：直接从 data/bank 分片按筛选条件抽题，不请求 Supabase
    if (qSource === 'local') {
      if (!PracticeState.allQuestions || PracticeState.allQuestions.length === 0) {
        if (typeof window.loadQuestions !== 'function') {
          throw new Error('本地题库加载器未就绪，请刷新页面重试');
        }
        var localModNums = [];
        for (var im = 0; im < modules.length; im++) {
          var mn = parseInt(String(modules[im]).replace('module_', ''), 10);
          if (mn >= 1 && mn <= 4) localModNums.push(mn);
        }
        if (localModNums.length === 0) localModNums = [1, 2, 3, 4];
        var localItems = await window.loadQuestions(localModNums, { mode: 'preferLocal' });
        PracticeState.allQuestionsRaw = localItems || [];
        PracticeState.allQuestions = (localItems || []).filter(function (q) {
          return Array.isArray(q.subQuestions) && q.subQuestions.length >= 4;
        });
      }
      var lDiffAlias = { easy: ['easy', 'basic'], medium: ['medium', 'league'], hard: ['hard', 'national'] };
      var lAccDiffs = [];
      (difficulties || []).forEach(function (d) {
        (lDiffAlias[d] || [d]).forEach(function (v) { if (lAccDiffs.indexOf(v) < 0) lAccDiffs.push(v); });
      });
      var lAccTargets = (targets || []).filter(function (t) { return t !== 'both'; });
      items = (PracticeState.allQuestions || []).filter(function (q) {
        if (!q || !q.subQuestions || q.subQuestions.length < 4) return false;
        if (lAccDiffs.length > 0 && lAccDiffs.indexOf(q.difficulty) < 0) return false;
        if (q.target && lAccTargets.length > 0 && lAccTargets.indexOf(q.target) < 0) return false;
        if (concept) {
          var inTags = q.tags && q.tags.join(' ').indexOf(concept) >= 0;
          var inText = String(q.concept || '') === concept ||
            String(q.question || '').indexOf(concept) >= 0 ||
            String(q.explanation || '').indexOf(concept) >= 0;
          if (!inTags && !inText) return false;
        }
        return true;
      }).slice().sort(function () { return Math.random() - 0.5; }).slice(0, countVal);
    } else {
      // 云题库模式：原 Supabase 拉取流程
      // 主动确保 loader.js 已加载（解决 loader.js 未在 index.html 预加载的问题）
      if (typeof window.fetchQuestionsBatch !== 'function') {
      _setPullStatus('正在初始化题库加载器…', 'info');
      var loaderOk = false;
      // 兼容路径 A：loader.js 已在页面中且暴露了 ensureQuestionLoaderReady
      if (typeof window.ensureQuestionLoaderReady === 'function') {
        loaderOk = await window.ensureQuestionLoaderReady({ timeout: 10000, attempts: 3 });
      } else {
        // 兼容路径 B：loader.js 还未被引入到页面，手动注入（双重兜底）
        loaderOk = await new Promise(function(resolve) {
          // 检查是否已有 script 标签存在
          var existing = document.querySelector('script[src*="loader.js"]');
          function checkReady() {
            if (typeof window.fetchQuestionsBatch === 'function' && typeof window.loadQuestions === 'function') {
              resolve(true);
              return true;
            }
            return false;
          }
          if (checkReady()) return;
          if (existing) {
            // script 已存在但未就绪：等待其加载
            existing.addEventListener('load', function () {
              var deadline = Date.now() + 8000;
              (function poll() {
                if (checkReady()) return;
                if (Date.now() > deadline) { resolve(false); return; }
                setTimeout(poll, 50);
              })();
            });
            existing.addEventListener('error', function () { resolve(false); });
          } else {
            // 手动注入 loader.js
            var s = document.createElement('script');
            s.src = 'js/core/loader.js?v=' + Date.now();
            s.async = false;
            s.onload = function () {
              var deadline = Date.now() + 8000;
              (function poll() {
                if (checkReady()) return;
                if (Date.now() > deadline) { resolve(false); return; }
                setTimeout(poll, 50);
              })();
            };
            s.onerror = function () { resolve(false); };
            document.head.appendChild(s);
          }
        });
      }
      // 最终兜底：再检查一次函数
      if (!loaderOk || typeof window.fetchQuestionsBatch !== 'function') {
        // 更友好的错误提示 + 建议
        throw new Error('题库加载器初始化失败，请刷新页面重试。若持续失败请清空浏览器缓存后再次打开。');
      }
    }

    items = await window.fetchQuestionsBatch({
      modules: modules,
      difficulties: difficulties,
      targets: targets,
      concept: concept,
      count: countVal
    });
    }

    if (!items || items.length === 0) {
      throw new Error('没有符合条件的题目，请放宽筛选条件');
    }

    // 字段映射：题库格式（stem/options对象/answer字母）→ practice 格式（question/options数组/answer索引）
    items = items.map(function(q) {
      if (q.stem && !q.question) q.question = q.stem;
      return q;
    });

    // 去重合并
    var existingIds = {};
    (PracticeState.allQuestions || []).forEach(function(q) {
      if (q && q.question) existingIds[q.question] = true;
    });
    var added = 0;
    items.forEach(function(q) {
      if (q && q.subQuestions && q.subQuestions.length >= 4 && !existingIds[q.question]) {
        PracticeState.allQuestions.push(q);
        existingIds[q.question] = true;
        added++;
      }
    });

    _setPullStatus('拉取成功！新增 ' + added + ' 道题，当前共 ' + PracticeState.allQuestions.length + ' 道可用。', 'success');
    _setPullCooldown();
    _updatePullButtonState();

    applyFilters();
    updateAvailableCount();
  } catch (err) {
    console.error('[Practice] 拉取题目失败:', err);
    _setPullStatus('拉取失败：' + (err.message || '请检查网络或 Supabase 配置'), 'error');
    btn.disabled = false;
    btn.textContent = '拉取题目';
  }
}

/**
 * 绑定"错题专项练习"入口事件
 */

// M-01：显式挂载对外入口（practice.js 的筛选面板绑定与摘要刷新仍按原名调用）
window.bindPullEvents = bindPullEvents;
window._renderPullSummary = _renderPullSummary;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.pull = {
    bindPullEvents: bindPullEvents,
    renderSummary: _renderPullSummary,
    handlePullQuestions: handlePullQuestions
  };
})();
