/**
 * @jest-environment jsdom
 *
 * 管理员密钥认证 + 管理员重置密码 回归测试（sql/migration_v11_admin_auth.sql）
 * --------------------------------------------------------------------------
 * 背景：
 *   1. 站长本人的账号不在 admin 组（user_group 非 admin），原「/admin 路由 role 门禁」
 *      会直接拦住，需要一条安全的补票通道：登录框底部「管理员入口」→ 页内输入管理员密钥。
 *   2. P0-2 整改移除了纯客户端 SHA-256 比对，本实现把比对挪到服务端 RPC
 *      admin_login_with_key（密钥摘要存于 admin_config，客户端读不到），
 *      验证通过后由服务端把当前账号升级为 admin。
 *   3. 管理员「重置密码」原为占位实现（提示需要 Supabase Admin API），
 *      现改为 RPC admin_reset_password（服务端校验调用者 user_group）。
 *
 * 验证矩阵：
 *   - /admin 路由不再有 role 门禁（否则持口令的非 admin 账号进不来）
 *   - 管理员登录页只提供「管理员口令」表单：不渲染账号密码表单与切换入口
 *   - adminVerifyKey：成功/口令错误/RPC 未部署 三种路径
 *   - 验证成功后账号升级 + 会话 token 写入 + 管理仪表盘可进入
 *   - 账号密码路径移除护栏：adminLogin 不存在、admin 账号登录不自动解锁、
 *     个人中心不再有管理员账号密码弹窗
 *   - handleResetPassword：正常重置/密码过短/两次不一致/RPC 未部署
 *   - 前端不再出现 ADMIN_KEY_HASH 式的本地口令比对（P0-2 不回归）
 *   - 「找回密码」面板可切到邮箱重置并调用 resetPassword()
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const loadScript = (src) => { (0, eval)(src); }; // eslint-disable-line no-eval

const adminSrc = read('js/admin/admin.js');
const adminUsersSrc = read('js/admin/admin-users.js');
const appSrc = read('js/core/app.js');
const routesSrc = read('js/core/app-routes.js');
const sqlSrc = read('sql/migration_v11_admin_auth.sql');

beforeAll(() => {
  loadScript(adminSrc);
  loadScript(adminUsersSrc);
});

afterEach(() => {
  jest.restoreAllMocks();
  window._adminAuthenticated = false;
  delete window.getSupabase;
  delete window.getCurrentUser;
  try { sessionStorage.clear(); } catch (e) { /* ignore */ }
});

describe('migration_v11：SQL 迁移自身约束', () => {
  test('定义密钥登录与重置密码两个 RPC，且只存 64 位十六进制摘要（无明文密钥）', () => {
    expect(sqlSrc).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_login_with_key\(p_key TEXT\)/i);
    expect(sqlSrc).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_reset_password\(/i);
    expect(sqlSrc).toMatch(/VALUES \(1, '[0-9a-f]{64}'\)/);
    // 密钥摘要表必须禁止客户端读取
    expect(sqlSrc).toMatch(/REVOKE ALL ON public\.admin_config FROM anon, authenticated;/);
  });

  test('敏感字段保护触发器放行 SECURITY DEFINER（属主 postgres）路径', () => {
    expect(sqlSrc).toMatch(/current_user IN \('postgres', 'service_role', 'supabase_admin'\)/);
  });
});

describe('管理员密钥登录页', () => {
  test('登录页只提供管理员口令表单（账号密码入口已移除）', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    window.renderAdminPage(target);

    expect(target.innerHTML).toContain('admin-key-form');
    const keyInput = document.getElementById('admin-key-input');
    expect(keyInput).not.toBeNull();
    expect(keyInput.getAttribute('type')).toBe('password');
    expect(keyInput.getAttribute('placeholder')).toBe('管理员口令');
    // 不得出现管理员账号密码表单与切换入口
    expect(document.getElementById('admin-pwd-form')).toBeNull();
    expect(document.getElementById('admin-toggle-pwd-mode')).toBeNull();
    expect(document.getElementById('admin-email-input')).toBeNull();
    expect(document.getElementById('admin-password-input')).toBeNull();
    expect(target.innerHTML).not.toContain('改用管理员账号密码登录');

    target.remove();
  });

  test('账号密码直入路径已移除：adminLogin 不存在、admin 账号不自动解锁、个人中心无密码弹窗', () => {
    // 1) adminLogin 函数与个人中心密码弹窗均删除
    expect(adminSrc).not.toMatch(/function adminLogin\s*\(/);
    const userSrc = read('js/pages/user.js');
    expect(userSrc).not.toMatch(/adminLogin/);
    expect(userSrc).not.toContain('user-admin-pwd');
    // 2) 账号 user_group=admin 不再自动写入解锁 token（必须口令验证）
    window._adminAuthenticated = false;
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    window._onAuthUserLoaded({ id: 'u1', user_group: 'admin' });
    expect(window._adminAuthenticated).toBe(false);
    expect(sessionStorage.getItem('bioquest_admin_auth')).toBeNull();
    // 3) 非 admin 账号登录仍会清除残留解锁状态
    window._adminAuthenticated = true;
    sessionStorage.setItem('bioquest_admin_auth', '{}');
    window._onAuthUserLoaded({ id: 'u2', user_group: 'member' });
    expect(window._adminAuthenticated).toBe(false);
    expect(sessionStorage.getItem('bioquest_admin_auth')).toBeNull();
  });

  test('密钥验证成功：账号升级为 admin、写入会话 token、可进入仪表盘', async () => {
    const rpcCalls = [];
    window.getSupabase = () => ({
      rpc: async (fn, params) => {
        rpcCalls.push({ fn, params });
        return { data: [{ ok: true, user_group: 'admin', error_msg: null }], error: null };
      }
    });
    const me = { id: 'u1', user_group: 'member' };
    window.getCurrentUser = () => me;

    const res = await window.adminVerifyKey('  my-secret-key  ');
    expect(res.ok).toBe(true);
    // 必须调用服务端 RPC（前端不做密钥比对），且入参 trim
    expect(rpcCalls).toEqual([{ fn: 'admin_login_with_key', params: { p_key: 'my-secret-key' } }]);
    expect(me.user_group).toBe('admin');
    expect(sessionStorage.getItem('bioquest_admin_auth')).toBeTruthy();

    // 进入管理页应渲染仪表盘而不是登录页
    const target = document.createElement('div');
    document.body.appendChild(target);
    const realLoadTab = window.loadTabContent;
    window.loadTabContent = async () => {};
    try {
      window.renderAdminPage(target);
      expect(target.innerHTML).toContain('admin-dash');
      expect(target.innerHTML).toContain('管理面板');
    } finally {
      window.loadTabContent = realLoadTab;
      target.remove();
    }
  });

  test('密钥错误：返回服务端错误文案且不解锁', async () => {
    window.getSupabase = () => ({
      rpc: async () => ({ data: [{ ok: false, user_group: null, error_msg: '管理员密钥不正确' }], error: null })
    });
    const me = { id: 'u1', user_group: 'member' };
    window.getCurrentUser = () => me;

    const res = await window.adminVerifyKey('wrong-key');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('管理员密钥不正确');
    expect(me.user_group).toBe('member');
    expect(sessionStorage.getItem('bioquest_admin_auth')).toBeNull();
  });

  test('服务端未部署 RPC：提示先执行 migration_v11_admin_auth.sql', async () => {
    window.getSupabase = () => ({
      rpc: async () => ({
        data: null,
        error: { message: 'Could not find the function public.admin_login_with_key(p_key) in the schema cache' }
      })
    });
    const res = await window.adminVerifyKey('any');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('migration_v11_admin_auth.sql');
  });

  test('未填写密钥：直接返回校验提示，不发请求', async () => {
    let called = false;
    window.getSupabase = () => ({ rpc: async () => { called = true; return { data: [], error: null }; } });
    const res = await window.adminVerifyKey('   ');
    expect(res.ok).toBe(false);
    expect(called).toBe(false);
  });
});

describe('管理员重置密码（admin-users.js）', () => {
  test('两次输入一致：调用 admin_reset_password RPC 并提示成功', async () => {
    const calls = [];
    window.getSupabase = () => ({
      rpc: async (fn, params) => {
        calls.push({ fn, params });
        return { data: [{ ok: true, error_msg: null }], error: null };
      }
    });
    const promptMock = jest.fn()
      .mockReturnValueOnce('newpass123')
      .mockReturnValueOnce('newpass123');
    const realPrompt = window.prompt;
    window.prompt = promptMock;
    const toastMock = jest.fn();
    const realToast = window.showAdminToast;
    window.showAdminToast = toastMock;

    try {
      await window.handleResetPassword('user-42');
      expect(calls).toEqual([{
        fn: 'admin_reset_password',
        params: { p_user_id: 'user-42', p_new_password: 'newpass123' }
      }]);
      expect(toastMock).toHaveBeenCalledWith(expect.stringContaining('密码已重置'), 'success');
    } finally {
      window.prompt = realPrompt;
      window.showAdminToast = realToast;
    }
  });

  test('新密码过短 / 两次不一致：不调用 RPC', async () => {
    let called = false;
    window.getSupabase = () => ({ rpc: async () => { called = true; return { data: [], error: null }; } });
    const toastMock = jest.fn();
    const realToast = window.showAdminToast;
    window.showAdminToast = toastMock;
    const realPrompt = window.prompt;

    try {
      // 过短
      window.prompt = jest.fn().mockReturnValueOnce('123').mockReturnValueOnce('123');
      await window.handleResetPassword('user-42');
      expect(toastMock).toHaveBeenCalledWith('新密码至少 6 位', 'error');

      // 两次不一致
      window.prompt = jest.fn().mockReturnValueOnce('newpass123').mockReturnValueOnce('newpass124');
      await window.handleResetPassword('user-42');
      expect(toastMock).toHaveBeenCalledWith('两次输入的密码不一致', 'error');

      expect(called).toBe(false);
    } finally {
      window.prompt = realPrompt;
      window.showAdminToast = realToast;
    }
  });

  test('服务端未部署 RPC：提示先执行 migration_v11_admin_auth.sql', async () => {
    window.getSupabase = () => ({
      rpc: async () => ({
        data: null,
        error: { message: 'Could not find the function public.admin_reset_password(p_user_id, p_new_password) in the schema cache' }
      })
    });
    const toastMock = jest.fn();
    const realToast = window.showAdminToast;
    window.showAdminToast = toastMock;
    const realPrompt = window.prompt;
    window.prompt = jest.fn().mockReturnValueOnce('newpass123').mockReturnValueOnce('newpass123');

    try {
      await window.handleResetPassword('user-42');
      expect(toastMock).toHaveBeenCalledWith(expect.stringContaining('migration_v11_admin_auth.sql'), 'error');
    } finally {
      window.prompt = realPrompt;
      window.showAdminToast = realToast;
    }
  });
});

describe('实现约束（回归护栏）', () => {
  test('P0-2 不回归：前端不再存在本地管理员密钥摘要比对', () => {
    expect(adminSrc).not.toMatch(/ADMIN_KEY_HASH/);
    expect(adminSrc).not.toMatch(/sha256\s*\(/i);
  });

  test('/admin 路由登录即可进入（页内再做管理员验证）', () => {
    const adminRouteBlock = routesSrc
      .match(/'\/admin': \{[\s\S]*?\n  \},/)[0]
      .replace(/\/\/.*$/gm, ''); // 去掉注释，只检查真实配置项
    expect(adminRouteBlock).toMatch(/auth: true/);
    expect(adminRouteBlock).not.toMatch(/role:/);
  });

  test('「找回密码」面板已接入邮箱重置入口并复用 resetPassword()（行为断言）', async () => {
    // P1-1：改为行为断言 —— 真实渲染找回面板，切到邮箱模式提交，
    // 断言 resetPassword 收到输入的邮箱值（而非源码包含某字符串）。
    loadScript(read('js/core/utils.js'));
    loadScript(read('js/core/auth-ui.js'));
    document.body.innerHTML = '';
    window.showAuthModal('login');
    window.authSwitchToForgot();

    // 面板含邮箱重置入口（forgot-mode-email 区块 + 邮箱输入框）
    expect(document.getElementById('forgot-mode-email')).toBeTruthy();
    const emailInput = document.getElementById('auth-forgot-email');
    expect(emailInput).toBeTruthy();

    // 切到「邮箱重置」模式并填写邮箱
    const emailRadio = document.querySelector('input[name="forgot-mode"][value="email"]');
    emailRadio.checked = true;
    emailInput.value = 'reset@example.com';

    // stub resetPassword，捕获实参
    const resetCalls = [];
    window.resetPassword = async (v) => { resetCalls.push(v); return { ok: true, message: 'sent' }; };

    await window.handleForgotPassword();
    expect(resetCalls).toEqual(['reset@example.com']);
    expect(document.getElementById('auth-forgot-success').textContent).toContain('重置邮件已发送');
  });
});