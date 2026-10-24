/**
 * @jest-environment jsdom
 *
 * Issue #17 回归测试：admin.js 按功能页拆分
 * 验证：
 *   1. 核心模块暴露入口（initAdmin/renderAdminPage/_ensureAdminModule）与标签映射
 *   2. 各子模块可独立加载，渲染函数/全局动作处理器齐全
 *   3. 核心与子模块的共享依赖（ICONS/API/工具函数）跨文件可解析
 *   4. 登录页与 loadTabContent 基本渲染流程可用
 *   5. 共享工具 _ocrReadFileAsBase64 落在核心（ocr/ebook 共用，无跨模块依赖）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// 以全局脚本方式执行（等价浏览器 <script> 顺序加载语义）
function loadScript(src) {
  // eslint-disable-next-line no-eval
  (0, eval)(src);
}

const MODULES = [
  'js/admin/admin-users.js',
  'js/admin/admin-questions.js',
  'js/admin/admin-cards.js',
  'js/admin/admin-community.js',
  'js/admin/admin-ebook.js',
  'js/admin/admin-ops.js',
  'js/admin/admin-ocr.js',
  'js/admin/admin-aigen.js'
];

beforeAll(() => {
  // 与浏览器一致：utils.js（规范 escapeHtml 等共享工具）先于业务模块加载
  loadScript(read('js/core/utils.js'));
  loadScript(read('js/admin/admin.js'));
});

/** 创建（或复用）唯一的 #admin-tab-content，避免 jsdom 中重复 id */
function ensureTabContent() {
  const existing = document.getElementById('admin-tab-content');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'admin-tab-content';
  document.body.appendChild(el);
  return el;
}

describe('Issue #17：admin.js 核心模块', () => {
  test('暴露入口函数与懒加载机制', () => {
    expect(typeof window.initAdmin).toBe('function');
    expect(typeof window.renderAdminPage).toBe('function');
    expect(typeof window._ensureAdminModule).toBe('function');
    expect(typeof loadTabContent).toBe('function');
  });

  test('ADMIN_TAB_MODULES 覆盖仪表盘全部标签', () => {
    const tabs = ['questions', 'users', 'cards', 'community', 'ebook',
      'announcements', 'feedbacks', 'appeals', 'sync', 'ocr', 'aigen'];
    expect(Object.keys(ADMIN_TAB_MODULES).sort()).toEqual(tabs.slice().sort());
    // 每个标签映射到存在的子模块文件
    for (const t of tabs) {
      const file = ADMIN_TAB_MODULES[t];
      expect(file).toMatch(/^js\/admin\/admin-(users|questions|cards|community|ebook|ops|ocr|aigen)\.js$/);
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    }
  });

  test('核心保留共享 API / 图标 / 工具（子模块运行时依赖）', () => {
    ['getUsers', 'getQuestions', 'getCards', 'getCommunityPosts', 'getFeedbacks',
      'showAdminToast', 'parseSupabaseError', 'adminApiCall', 'adminFetchRest'
    ].forEach((fn) => expect(typeof globalThis[fn]).toBe('function'));
    expect(typeof ICONS).toBe('object');
    expect(typeof ICONS.inbox).toBe('string');
    expect(typeof globalThis._ocrReadFileAsBase64).toBe('function');
  });

  test('登录页渲染正常', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    window.renderAdminPage(target);
    expect(target.innerHTML).toContain('admin-login-card');
    expect(document.getElementById('admin-totp-input')).not.toBeNull();
    // 样式已注入
    expect(document.querySelector('style')).not.toBeNull();
  });
});

describe('Issue #17：admin 子模块', () => {
  beforeAll(() => {
    MODULES.forEach((m) => loadScript(read(m)));
  });

  test('各功能页渲染函数全部就绪', () => {
    ['renderUsersTab', 'renderQuestionsTab', 'renderCardsTab', 'renderCommunityTab',
      'renderEbookTab', 'renderFeedbacksTab', 'renderAppealsTab', 'renderSyncTab',
      'renderAnnouncementsTab', 'renderOcrTab', 'renderAiGenTab'
    ].forEach((fn) => expect(typeof globalThis[fn]).toBe('function'));
  });

  test('标签页内 onclick 全局动作处理器全部就绪', () => {
    ['handleChangeUserGroup', 'handleDeleteUser', 'handleAdjustUserPoints',
      'handleEditUser', 'closeUserModal', 'handleResetPassword',
      'handleEditQuestion', 'closeQuestionModal', 'handleQuestionImageUpload',
      'adminGoQuestionPage', 'addEditTag', 'removeEditTag',
      'openCardModal', 'closeCardModal', 'handleEditCard', 'handleDeleteCard', 'adminGoCardPage',
      'handleDeleteCommunityPost', 'handleDismissReport', 'handleDeleteReportedPost',
      'handleViewPostDetail', 'closePostDetailModal', 'handleEditComment', 'handleTogglePin',
      'openPostStatModal', 'closePostStatModal', 'handleManagePostComments',
      'handleDeleteComment', 'closeCommentsModal', 'handleUnmuteUser',
      'openMuteModal', 'closeMuteModal', 'adminGoCommunityPostPage',
      'adminDeletePdf', 'deleteEbookEdit', 'handleResolveAppeal'
    ].forEach((fn) => expect(typeof window[fn]).toBe('function'));
  });

  test('OCR / AI 出题子模块不重复声明共享工具（_ocrReadFileAsBase64 仅在核心）', () => {
    const ocrSrc = read('js/admin/admin-ocr.js');
    const ebookSrc = read('js/admin/admin-ebook.js');
    expect(ocrSrc).not.toMatch(/^function _ocrReadFileAsBase64/m);
    expect(ebookSrc).not.toMatch(/^function _ocrReadFileAsBase64/m);
    // ebook/ocr 引用的共享工具来自核心（核心已声明）
    expect(typeof globalThis._ocrReadFileAsBase64).toBe('function');
  });

  test('loadTabContent("users") 走懒加载并渲染用户表（stub 子模块加载）', async () => {
    const contentEl = ensureTabContent();

    // stub：子模块已注入（上文真实加载过）+ 用户数据 API
    const realEnsure = globalThis._ensureAdminModule;
    globalThis._ensureAdminModule = async () => true;
    const realGetUsers = globalThis.getUsers;
    globalThis.getUsers = async () => [{
      id: 'u1', username: 'bio_fan', display_name: '生物爱好者',
      user_group: 'member', bio_score: 88, points: 120
    }];

    try {
      await loadTabContent(document.body, 'users');
      expect(contentEl.innerHTML.length).toBeGreaterThan(0);
      expect(contentEl.innerHTML).toContain('bio_fan');
    } finally {
      globalThis._ensureAdminModule = realEnsure;
      globalThis.getUsers = realGetUsers;
    }
  });

  test('子模块加载失败时给出可重试提示（不白屏）', async () => {
    const contentEl = ensureTabContent();

    const realEnsure = globalThis._ensureAdminModule;
    globalThis._ensureAdminModule = async () => false;
    try {
      await loadTabContent(document.body, 'users');
      expect(contentEl.innerHTML).toContain('模块加载失败');
    } finally {
      globalThis._ensureAdminModule = realEnsure;
    }
  });
});
