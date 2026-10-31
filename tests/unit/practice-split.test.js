/**
 * M-01：practice.js 渐进拆分回归
 * -------------------------------------------------
 * 分享/深链子模块拆到 practice-share.js，但对外全局函数名与调用方式不变。
 * 锁定：
 *   1) practice.js 不再包含分享实现；
 *   2) practice-share.js 提供原函数并显式挂载 window；
 *   3) loadModule('practice') 依赖链包含 practice-share；
 *   4) SW 预热列表包含新文件，离线首次进入练习页仍可命中缓存。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('M-01 practice.js 子模块拆分', () => {
  test('分享/拉取/筛选实现已移出 practice.js', () => {
    const src = read('js/pages/practice.js');
    expect(src).not.toContain('function handleShareCurrentQuestion');
    expect(src).not.toContain('function handleShareQuestionDeepLink');
    expect(src).not.toContain('function startSharePreviewSession');
    expect(src).not.toContain('var PULL_COOLDOWN_MS');
    expect(src).not.toContain('async function handlePullQuestions');
    expect(src).not.toContain('function renderFilterPanel');
    expect(src).not.toContain('function bindFilterEvents');
    expect(src).not.toContain('function updateAvailableCount');
    expect(src).not.toContain('function _renderQuizImpl');
    expect(src).not.toContain('function bindQuizEvents');
    expect(src).not.toContain('function showSummary');
    expect(src).not.toContain('async function loadPracticeQuestions');
    expect(src).not.toContain('function applyFilters');
    expect(src).not.toContain('function generateQuestionSet');
    expect(src).not.toContain('function _getQuestionRating');
    expect(src).not.toContain('function handleVoteQuestion');
    expect(src).not.toContain('function preparePracticeQuestion');
    expect(src).not.toContain('function calculateQuestionScore');
    expect(src).not.toContain('function handleSubmitAnswer');
    expect(src).not.toContain('function handleRedoQuestion');
    expect(src).not.toContain('function renderQuiz');
    expect(src).not.toContain('function handlePracticeKeydown');
    expect(src).not.toContain('function injectPracticeStyles');
    expect(src).not.toContain('function syncScoreToServer');
    expect(src).not.toContain('function getModuleGroupBySubject');
    expect(src).not.toContain('function bindWrongPracticeEntry');
    expect(src).not.toContain('function _showFilterPanelImpl');
    expect(src).not.toContain('function renderPracticePage');
    expect(src).not.toContain('function initPractice');
  });

  test('题库/评分/答题/重做/输入模块各自提供原函数', () => {
    const expectFn = (file, names) => {
      const src = read(file);
      names.forEach((n) => expect(src).toContain('function ' + n));
    };
    expectFn('js/pages/practice-data.js', ['loadPracticeQuestions', 'loadLeagueQuestions', 'loadLogicQuestions', 'applyFilters', 'generateQuestionSet']);
    expectFn('js/pages/practice-rating.js', ['_getQuestionRating', 'handleVoteQuestion', '_renderExamSourceTag']);
    expectFn('js/pages/practice-session.js', ['preparePracticeQuestion', 'getEffectiveSubQuestions', 'calculateQuestionScore', 'handleSubmitAnswer', 'handleNextQuestion', 'savePracticeRecord']);
    expectFn('js/pages/practice-redo.js', ['handleRedoQuestion', 'startRedoSession', 'restorePracticeUI']);
    expectFn('js/pages/practice-input.js', ['renderQuiz', 'showFilterPanel', 'handlePracticeKeydown']);
    expectFn('js/pages/practice-sync.js', ['_fetchLocalJsonWithRetry', 'syncScoreToServer', 'checkAndSyncScore', 'resetSyncCounter']);
    expectFn('js/pages/practice-styles.js', ['injectPracticeStyles']);
    expectFn('js/pages/practice-helpers.js', ['getModuleGroupBySubject', 'getDifficultyLabel', 'bindWrongPracticeEntry']);
    expectFn('js/pages/practice-page.js', ['_showFilterPanelImpl', 'renderPracticePage', 'initPractice']);
  });

  test('practice-quiz.js 提供答题渲染与成绩单入口', () => {
    const src = read('js/pages/practice-quiz.js');
    expect(src).toContain('function _renderQuizImpl');
    expect(src).toContain('function bindQuizEvents');
    expect(src).toContain('function calcAccuracyStr');
    expect(src).toContain('function showSummary');
    expect(src).toContain('window._renderQuizImpl = _renderQuizImpl;');
    expect(src).toContain('window.bindQuizEvents = bindQuizEvents;');
    expect(src).toContain('window.showSummary = showSummary;');
  });

  test('practice-filters.js 提供筛选函数并挂载全局入口', () => {
    const src = read('js/pages/practice-filters.js');
    expect(src).toContain('function renderFilterPanel');
    expect(src).toContain('function bindFilterEvents');
    expect(src).toContain('function updateAvailableCount');
    expect(src).toContain('window.renderFilterPanel = renderFilterPanel;');
    expect(src).toContain('window.bindFilterEvents = bindFilterEvents;');
    expect(src).toContain('window.updateAvailableCount = updateAvailableCount;');
  });

  test('practice-share.js 提供原函数并挂载全局入口', () => {
    const src = read('js/pages/practice-share.js');
    [
      'function handleShareCurrentQuestion',
      'function _practiceShareCopy',
      'function _practiceShareKey',
      'function findPracticeQuestionByShareKey',
      'function findPracticeQuestionById',
      'function startSharePreviewSession',
      'async function handleShareQuestionDeepLink'
    ].forEach((sig) => expect(src).toContain(sig));
    expect(src).toContain('window.handleShareCurrentQuestion = handleShareCurrentQuestion;');
    expect(src).toContain('window.handleShareQuestionDeepLink = handleShareQuestionDeepLink;');
  });

  test('拉取模块保留原函数与全局入口', () => {
    const src = read('js/pages/practice-pull.js');
    [
      'function _getPullCooldownRemaining',
      'function _updatePullButtonState',
      'function bindPullEvents',
      'async function handlePullQuestions'
    ].forEach((sig) => expect(src).toContain(sig));
    expect(src).toContain('window.bindPullEvents = bindPullEvents;');
    expect(src).toContain('window._renderPullSummary = _renderPullSummary;');
  });

  test('模块依赖与 SW 预热已接入', () => {
    // M-01：模块依赖表已拆到 app-modules.js
    const app = read('js/core/app-modules.js');
    expect(app).toMatch(/'practice':\s*\[[^\]]*'practice-share'/);
    expect(app).toMatch(/'practice':\s*\[[^\]]*'practice-pull'/);
    expect(app).toMatch(/'practice':\s*\[[^\]]*'practice-filters'/);
    expect(app).toMatch(/'practice':\s*\[[^\]]*'practice-quiz'/);
    expect(app).toMatch(/'practice':\s*\[[^\]]*'practice-data'/);
    expect(app).toMatch(/'practice':\s*\[[^\]]*'practice-rating'/);
    expect(app).toMatch(/'practice':\s*\[[^\]]*'practice-session'/);
    expect(app).toMatch(/'practice':\s*\[[^\]]*'practice-redo'/);
    expect(app).toMatch(/'practice':\s*\[[^\]]*'practice-input'/);
    ['share', 'pull', 'filters', 'quiz', 'data', 'rating', 'session', 'redo', 'input', 'sync', 'styles', 'helpers', 'page'].forEach((name) => {
      expect(read('sw.js')).toContain("'./js/pages/practice-" + name + ".js'");
    });
  });
});
