/**
 * TATABOX — 练习页输入与滚动交互（M-01 渐进拆分）
 * ------------------------------------------------------------
 * 由 loadModule('practice') 的依赖链先于 practice.js 加载；
 * 运行期依赖 practice.js 的 PracticeState、_renderQuizImpl、_showFilterPanelImpl 等。
 * 对外保留 renderQuiz / showFilterPanel / handlePracticeKeydown 原名。
 * ============================================================
 */
'use strict';

var _headerAutoHide = { lastScrollY: 0, enabled: false };

function enableHeaderAutoHide() {
  if (_headerAutoHide.enabled) return;
  _headerAutoHide.enabled = true;
  _headerAutoHide.lastScrollY = window.scrollY;
  window.addEventListener('scroll', _onPracticeScroll, { passive: true });
}

function disableHeaderAutoHide() {
  _headerAutoHide.enabled = false;
  window.removeEventListener('scroll', _onPracticeScroll);
  var header = document.querySelector('.header');
  if (header) header.style.transform = '';
}

function _onPracticeScroll() {
  if (!_headerAutoHide.enabled) return;
  var header = document.querySelector('.header');
  if (!header) return;
  var currentY = window.scrollY;
  var diff = currentY - _headerAutoHide.lastScrollY;
  if (currentY < 64) {
    header.style.transform = '';
  } else if (diff > 10) {
    header.style.transform = 'translateY(-100%)';
  } else if (diff < -5) {
    header.style.transform = '';
  }
  _headerAutoHide.lastScrollY = currentY;
}

// 最后一题仪式感
function showLastQuestionEffect(callback) {
  var progressBar = document.querySelector('.practice-progress-bar-fill, .progress-fill, [class*="progress"]');
  if (progressBar) {
    progressBar.style.width = '100%';
    progressBar.style.boxShadow = '0 0 20px rgba(196,149,106,0.8), 0 0 40px rgba(196,149,106,0.4)';
    progressBar.style.transition = 'box-shadow 0.5s ease';
  }

  var banner = document.createElement('div');
  banner.className = 'last-question-banner';
  banner.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'z-index:9999',
    'background:var(--color-deep,#1a3a2a)',
    'color:#fff',
    'text-align:center',
    'padding:12px 20px',
    'font-size:1.05rem',
    'font-weight:700',
    'animation:lastQSlideDown 0.5s ease',
    'transform:translateY(0)'
  ].join(';');
  banner.textContent = '最后一题完成！';

  // 添加动画 keyframes
  if (!document.getElementById('last-q-keyframes')) {
    var style = document.createElement('style');
    style.id = 'last-q-keyframes';
    style.textContent = '@keyframes lastQSlideDown { from { transform:translateY(-100%); } to { transform:translateY(0); } }';
    document.head.appendChild(style);
  }

  document.body.appendChild(banner);

  setTimeout(function () {
    if (banner.parentNode) banner.parentNode.removeChild(banner);
    if (typeof callback === 'function') callback();
  }, PRACTICE_LAST_Q_BANNER_MS);
}

// M-02：用命名包装器替代「重新赋值函数声明」的 monkey patch
// （原写法触发 ESLint no-func-assign，也容易在模块加载顺序变化时失效）。
function renderQuiz() {
  enableHeaderAutoHide();
  _renderQuizImpl.apply(this, arguments);
}

function showFilterPanel() {
  disableHeaderAutoHide();
  _showFilterPanelImpl.apply(this, arguments);
}

// 挂载到 window 对象，供 app.js 调用（initPractice 由 practice-page.js 挂载）
window.enableHeaderAutoHide = enableHeaderAutoHide;
window.disableHeaderAutoHide = disableHeaderAutoHide;
window.showLastQuestionEffect = showLastQuestionEffect;

// 答题键盘快捷键（仅练习答题流程生效）
//   1 / 2 / 3 / 4 → 选 A / B / C / D（单选题：标准单选 & 逻辑推理）
//   Space / Enter → 提交答案，已提交则跳下一题
//   R → 重做当前题目（清空作答，可重新作答；统计仅计首次）
//   Esc → 返回筛选（题目列表）
var _practiceKbBound = false;

function _practiceOverlayOpen() {
  // 反馈弹窗（关闭即 remove，存在即打开）
  if (document.querySelector('.q-feedback-overlay')) return true;
  // 移动端导航菜单
  var mnav = document.getElementById('mobileNav');
  if (mnav && mnav.classList.contains('active')) return true;
  // 原生 <dialog open>
  if (document.querySelector('dialog[open]')) return true;
  // 任意 aria-modal 对话框：需实际可见（关闭后常残留在 DOM，靠 display/visibility 判定）
  var dialogs = document.querySelectorAll('[aria-modal="true"]');
  for (var i = 0; i < dialogs.length; i++) {
    var cs = window.getComputedStyle(dialogs[i]);
    if (cs.display !== 'none' && cs.visibility !== 'hidden') return true;
  }
  // 快捷键面板可见时也让出
  var sp = document.getElementById('bioquest-shortcut-panel');
  if (sp && window.getComputedStyle(sp).visibility === 'visible') {
    return true;
  }
  return false;
}

function _practiceIsTyping(el) {
  if (!el) return false;
  var tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!el.isContentEditable;
}

function _practiceInQuiz() {
  // 答题进行中（存在提交 / 下一题按钮），排除小结页与筛选页
  return !!(document.getElementById('practice-submit-btn') ||
            document.getElementById('practice-next-btn'));
}

function _practiceSelectChoice(numKey) {
  var q = PracticeState.currentSet[PracticeState.currentIndex];
  if (!q) return;
  var isLogic = QuestionModel.isLogicChoice(q);
  var isStd = QuestionModel.isStandardChoice(q);
  if (!isLogic && !isStd) return; // MTF 题型不适用数字键选 A/B/C/D
  var idx = parseInt(numKey, 10) - 1; // 1..4 → 0..3
  if (idx < 0) return;
  var qIdx = PracticeState.currentIndex;
  if (!PracticeState.userAnswers[qIdx]) {
    PracticeState.userAnswers[qIdx] = {};
  }
  if (isStd) {
    var keys = Object.keys(q.options).sort();
    if (idx >= keys.length) return;
    PracticeState.userAnswers[qIdx][0] = keys[idx]; // 'A'/'B'/'C'/'D'
  } else {
    if (idx >= q.options.length) return;
    PracticeState.userAnswers[qIdx][0] = idx; // 逻辑题存索引 0..4
  }
  renderQuiz();
}

function _practiceRedoCurrent() {
  var qIdx = PracticeState.currentIndex;
  PracticeState.userAnswers[qIdx] = {};
  PracticeState.submitted = false;
  // 不重置 _counted：本题已统计过的话，重做再提交不会重复计数
  renderQuiz();
}

function _practiceBackToList() {
  PracticeState.started = false;
  PracticeState.submitted = false;
  if (typeof showFilterPanel === 'function') {
    showFilterPanel();
  }
}

function handlePracticeKeydown(e) {
  // 仅练习答题流程生效
  if (!PracticeState.started) return;
  // 任意弹窗 / 面板 / 移动导航打开时全部让出
  if (_practiceOverlayOpen()) return;

  var key = e.key;
  var active = document.activeElement;
  var typing = _practiceIsTyping(active);

  // Esc → 返回筛选（题目列表）
  if (key === 'Escape') {
    if (typing) return; // 输入框内由原生处理
    e.preventDefault();
    _practiceBackToList();
    return;
  }

  // 以下快捷键仅在答题进行中生效（小结页 / 筛选页不触发）
  if (!_practiceInQuiz()) return;

  // 数字键 1-4 → 选 A/B/C/D
  if (!typing && (key === '1' || key === '2' || key === '3' || key === '4')) {
    if (PracticeState.submitted) return; // 已提交不可改答
    e.preventDefault();
    _practiceSelectChoice(key);
    return;
  }

  // R → 重做当前题
  if (!typing && (key === 'r' || key === 'R')) {
    e.preventDefault();
    _practiceRedoCurrent();
    return;
  }

  // Space / Enter → 提交答案 / 下一题
  // 统一 preventDefault：无论焦点在哪个按钮，Space/Enter 都固定走提交/下一题，
  // 避免点完收藏/错题按钮后焦点停留导致 Space 误触发该按钮
  if (!typing && (key === ' ' || key === 'Spacebar' || key === 'Enter')) {
    e.preventDefault();
    if (!PracticeState.submitted) {
      handleSubmitAnswer();
    } else {
      handleNextQuestion();
    }
    return;
  }
}

(function _bindPracticeKeyboard() {
  if (_practiceKbBound) return;
  _practiceKbBound = true;
  document.addEventListener('keydown', handlePracticeKeydown);
})();

// M-01：显式挂载对外入口
window.renderQuiz = renderQuiz;
window.showFilterPanel = showFilterPanel;
window.handlePracticeKeydown = handlePracticeKeydown;
window.enableHeaderAutoHide = enableHeaderAutoHide;
window.disableHeaderAutoHide = disableHeaderAutoHide;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.input = { renderQuiz: renderQuiz, showFilterPanel: showFilterPanel, handlePracticeKeydown: handlePracticeKeydown };
})();
