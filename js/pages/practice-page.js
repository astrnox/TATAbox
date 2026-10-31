/**
 * TATABOX — 练习页入口与题库初始化（M-01 渐进拆分）
 * ============================================================
 */
'use strict';

function _showFilterPanelImpl() {
  applyFilters();
  renderFilterPanel();

  // 修复：进入练习页时自动加载题库（本地分片 + 逻辑推理），
  // 否则所有入口（含"本地题库"）初次进入时 allQuestions 为空，
  // 必须等用户点击"拉取题目"，而该按钮在本地模式下原先仍只请求 Supabase。
  if (!PracticeState.allQuestions || PracticeState.allQuestions.length === 0) {
    // H-04：先渲染基础题池（quiz + 逻辑题），4.7MB 联赛真题池在后台加载，
    // 避免首次进入练习页时白屏等待大 JSON 下载+解析。
    Promise.all([loadPracticeQuestions(), loadLogicQuestions()]).then(function () {
      if (!document.getElementById('practice-root')) return;
      applyFilters();
      renderFilterPanel(); // 重建面板以显示"共 X 道可用题目"
      loadLeagueQuestions();
    }).catch(function () {});
  } else if (!PracticeState.logicLoaded || !PracticeState.leagueLoaded) {
    Promise.all([loadLogicQuestions(), loadLeagueQuestions()]).then(function () {
      applyFilters();
      updateAvailableCount();
    }).catch(function () {});
  }
}

function renderPracticePage(target) {
  if (!target) return;

  try {
  // 检查是否为错题重做模式
  var redoData = null;
  try { redoData = sessionStorage.getItem('bioquest_redo_question'); } catch(e) {}
  if (redoData) {
    sessionStorage.removeItem('bioquest_redo_question');
  }

  // 解析知识图谱传入的专项练习参数（URL hash 优先，sessionStorage 兜底）
  var kgData = null;
  var shareKey = null;
  var shareQid = null;
  try {
    var hash = window.location.hash || '';
    var queryIdx = hash.indexOf('?');
    if (queryIdx >= 0) {
      var params = new URLSearchParams(hash.substring(queryIdx + 1));
      // P1-5：对 URL 入参做白名单式清洗（剔除控制字符、限制长度），防止参数注入污染过滤/渲染
      var conceptParam = (typeof sanitizeUrlParam === 'function')
        ? sanitizeUrlParam(params.get('concept'), 64)
        : params.get('concept');
      var moduleParam;
      if (params.get('module') != null) {
        moduleParam = (typeof sanitizeUrlParam === 'function')
          ? sanitizeUrlParam(params.get('module'), 32)
          : params.get('module');
      }
      var categoryParam;
      if (params.get('category') != null) {
        categoryParam = (typeof sanitizeUrlParam === 'function')
          ? sanitizeUrlParam(params.get('category'), 32)
          : params.get('category');
      }
      if (conceptParam) {
        kgData = { concept: decodeURIComponent(conceptParam), module: moduleParam || null, category: categoryParam || null };
      }
      // 分享本题深链：#/practice?share=<题目文本>
      // 只做一次 URL 解码 + 与生成端一致的空白折叠（_practiceShareKey），
      // 不做 sanitizeUrlParam（其会剔除 < / ` 与换行，可能破坏题干本身）；
      // 该值仅参与题目文本比对，不进入 DOM/HTML，长度上限兜底防滥用。
      var shareParam = params.get('share');
      if (shareParam != null) {
        shareKey = _practiceShareKey(shareParam);
        if (shareKey.length > 700) shareKey = null;
        if (!shareKey) shareKey = null;
      }
      // 分享深链的可选稳定 ID（优先按 ID 定位题目）
      var qidParam = params.get('qid');
      if (qidParam != null) {
        var qidClean = String(qidParam).trim().slice(0, 128);
        shareQid = qidClean || null;
      }
    }
    if (!kgData) {
      var stored = sessionStorage.getItem('bioquest_kg_practice');
      if (stored) kgData = JSON.parse(stored);
    }
  } catch (e) { kgData = null; }

  if (kgData && kgData.concept) {
    PracticeState.conceptFilter = kgData.concept;
    PracticeState.kgSource = kgData;
    // 根据模块预选中对应练习模块
    if (kgData.module) {
      var modKey = kgData.module.replace('_', ''); // module_1 -> module1
      if (['module1','module2','module3','module4'].indexOf(modKey) >= 0) {
        PracticeState.selectedModules = [modKey];
      }
    }
    // 如果有 category（学科），设置专项学科过滤，仅包含该学科
    if (kgData.category) {
      PracticeState.kgCategory = kgData.category;
    }
  }

  target.innerHTML = `<div id="practice-root"></div>`;

  // 分享本题深链：直接打开对应题目（答案预览），不再展示筛选面板
  if (shareKey || shareQid) {
    handleShareQuestionDeepLink(shareKey, shareQid);
    return;
  }

  // 按需模式：进入练习页时不自动加载全部题目，而是显示筛选面板让用户主动拉取
  showFilterPanel();

  // 如果已有缓存题目（例如返回上一页），直接复用
  if (PracticeState.allQuestions && PracticeState.allQuestions.length > 0) {
    updateAvailableCount();
  }

  // 处理错题重做参数
  handleRedoQuestion(redoData);
  } catch (err) {
    console.error('[TATABOX Practice] renderPracticePage 异常:', err);
    target.innerHTML = '<div class="bq-empty-block">' +
      '<p class="bq-error-title">练习模块加载失败</p>' +
      '<p class="bq-note">请刷新页面或稍后重试</p>' +
      '<button data-on=\'["_cspReload"]\' class="bq-btn--compact">刷新页面</button>' +
      '</div>';
  }
}

/**
 * 处理错题重做：根据错题数据找到对应题目，启动单题练习
 * @param {string|null} redoData - sessionStorage 中的错题数据（JSON 字符串或纯文本 qId）
 * @returns {boolean} 是否成功启动重做模式
 */
function initPractice(target) {
  try {
    if (!target) {
      if (typeof AppState !== 'undefined' && AppState.rootElement) {
        target = AppState.rootElement;
      } else {
        target = document.getElementById('page-content');
      }
    }
    if (!target) {
      console.error('[TATABOX Practice] initPractice 找不到目标容器');
      return;
    }
    renderPracticePage(target);
  } catch (err) {
    console.error('[TATABOX Practice] initPractice 异常:', err);
    if (target) {
      target.innerHTML = '<div class="bq-empty-block">' +
        '<p class="bq-error-title">练习模块初始化失败</p>' +
        '<p class="bq-note">请刷新页面或稍后重试</p>' +
        '<button data-on=\'["_cspReload"]\' class="bq-btn--compact">刷新页面</button>' +
        '</div>';
    }
  }
}

// 答题时自动隐藏 Header（向上滚动隐藏，向下滚动出现）

// M-01：显式挂载对外入口
window.renderPracticePage = renderPracticePage;
window.initPractice = initPractice;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.page = { renderPracticePage: renderPracticePage, initPractice: initPractice };
})();
