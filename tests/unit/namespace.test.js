/**
 * M-01：单一命名空间回归
 * -------------------------------------------------
 * 仓库既有 Q-03 约定是 window.BioQuest（utils.js 定义），本测试锁定：
 *   1) 拆分模块统一注册到 window.BioQuest.app / .practice，不新开 window.BQ；
 *   2) 旧 window.* 平铺别名保留，兼容既有调用方；
 *   3) utils.js 仍是命名空间的唯一初始化入口。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const SPLIT_MODULES = [
  ['js/core/app-privacy.js', 'BQ.app.privacy'],
  ['js/core/app-donation.js', 'BQ.app.donation'],
  ['js/core/app-shell.js', 'BQ.app.shell'],
  ['js/core/app-classroom.js', 'BQ.app.classroom'],
  ['js/core/app-auth.js', 'BQ.app.auth'],
  ['js/core/app-home.js', 'BQ.app.home'],
  ['js/core/app-router.js', 'BQ.app.router'],
  ['js/core/app-modules.js', 'BQ.app.modules'],
  ['js/core/app-pages.js', 'BQ.app.pages'],
  ['js/core/app-boot.js', 'BQ.app.boot'],
  ['js/core/app-feedback.js', 'BQ.app.feedback'],
  ['js/pages/practice-share.js', 'BQ.practice.share'],
  ['js/pages/practice-pull.js', 'BQ.practice.pull'],
  ['js/pages/practice-filters.js', 'BQ.practice.filters'],
  ['js/pages/practice-quiz.js', 'BQ.practice.quiz'],
  ['js/pages/practice-data.js', 'BQ.practice.data'],
  ['js/pages/practice-rating.js', 'BQ.practice.rating'],
  ['js/pages/practice-session.js', 'BQ.practice.session'],
  ['js/pages/practice-redo.js', 'BQ.practice.redo'],
  ['js/pages/practice-input.js', 'BQ.practice.input'],
  ['js/pages/practice-sync.js', 'BQ.practice.sync'],
  ['js/pages/practice-styles.js', 'BQ.practice.styles'],
  ['js/pages/practice-helpers.js', 'BQ.practice.helpers'],
  ['js/pages/practice-page.js', 'BQ.practice.page'],
  ['js/pages/user-styles.js', 'BQ.user.styles'],
  ['js/pages/user-avatar.js', 'BQ.user.avatar'],
  ['js/pages/user-profile.js', 'BQ.user.profile'],
  ['js/pages/user-ai-key.js', 'BQ.user.aiKey'],
  ['js/pages/user-points.js', 'BQ.user.points'],
  ['js/pages/user-data.js', 'BQ.user.data'],
  ['js/pages/user-panels.js', 'BQ.user.panels'],
  ['js/pages/user-page.js', 'BQ.user.page']
];

describe('M-01 单一命名空间', () => {
  test('utils.js 定义 window.BioQuest 为规范命名空间', () => {
    const src = read('js/core/utils.js');
    expect(src).toContain("window.BioQuest = TATABOX");
    expect(src).toContain('TATABOX.icons = BQ_ICONS');
  });

  test('拆分模块均注册到 window.BioQuest 的 app/practice 子树', () => {
    for (const [file, pathKey] of SPLIT_MODULES) {
      const src = read(file);
      expect(src).toContain('window.BioQuest = window.BioQuest || {}');
      expect(src).toContain(pathKey);
    }
  });

  test('不新增第二个 window.BQ 命名空间', () => {
    for (const [file] of SPLIT_MODULES) {
      expect(read(file)).not.toContain('window.BQ =');
    }
  });

  test('旧全局别名保留（兼容既有调用方）', () => {
    expect(read('js/core/app-privacy.js')).toContain('window.renderPrivacyPage = renderPrivacyPage;');
    expect(read('js/core/app-donation.js')).toContain('window.openDonation = openDonation;');
    expect(read('js/core/app-shell.js')).toContain('window.toggleTheme = toggleTheme;');
    expect(read('js/core/app-classroom.js')).toContain('window.renderClassroomPage = renderClassroomPage;');
    expect(read('js/pages/practice-share.js')).toContain('window.handleShareQuestionDeepLink = handleShareQuestionDeepLink;');
    expect(read('js/pages/practice-quiz.js')).toContain('window.showSummary = showSummary;');
  });
});
