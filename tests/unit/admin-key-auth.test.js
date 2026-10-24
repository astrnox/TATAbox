/**
 * @jest-environment jsdom
 *
 * 管理员 TOTP 动态码认证 + 管理员重置密码 回归测试
 * （sql/migration_v15_admin_totp.sql，兼容 v11/v14 历史迁移）
 * --------------------------------------------------------------------------
 * 背景：
 *   1. 站长本人的账号不在 admin 组（user_group 非 admin），原「/admin 路由 role 门禁」
 *      会直接拦住，需要一条安全的补票通道：登录框底部「管理员入口」→ 页内输 6 位动态码。
 *   2. 认证路径演进：P0-2 移除纯客户端 SHA-256 比对（改服务端 RPC）→
 *      静态口令哈希进公开仓库可被离线爆破、128bit 口令太长 → 改为 TOTP：
 *      种子只存服务端 admin_config（REVOKE ALL，客户端读不到、不进仓库），
 *      admin_login_with_key 已 REVOKE，动态码 ±1 窗口 + 防重放 + 失败锁定。
 *   3. 管理员「重置密码」原为占位实现（提示需要 Supabase Admin API），
 *      现改为 RPC admin_reset_password（服务端校验调用者 user_group）。
 *
 * 验证矩阵：
 *   - /admin 路由不再有 role 门禁（否则持动态码的非 admin 账号进不来）
 *   - 管理员登录页只提供「TOTP 动态码」表单：不渲染账号密码/静态口令入口
 *   - adminVerifyTotp：成功/动态码错误/RPC 未部署/格式非法 四种路径
 *   - 验证成功后账号升级 + 会话 token 写入 + 管理仪表盘可进入
 *   - v15 SQL：TOTP RPC、base32 辅助、防重放、失败锁定、退役旧口令 RPC、
 *     种子不以字面量进仓库；前端不再调用 admin_login_with_key
 *   - 账号密码路径移除护栏：adminLogin 不存在、admin 账号登录不自动解锁、
 *     个人中心不再有管理员账号密码弹窗
 *   - handleResetPassword：正常重置/密码过短/两次不一致/RPC 未部署
 *   - 前端不再出现 ADMIN_KEY_HASH 式的本地口令比对（P0-2 不回归）
 *   - 「找回密码」面板可切到邮箱重置并调用 resetPassword()
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

  test('仓库文件不含真实口令哈希：v11 为固定占位值、server.py 仅读环境变量（fail-closed）', () => {
    // v11 的 INSERT 必须等于占位串的 sha256——有人把另一个（真实）哈希塞回来即失败
    const placeholder = crypto.createHash('sha256')
      .update('REPLACE_ME_RUN_MIGRATION_V14_ROTATION').digest('hex');
    const m = sqlSrc.match(/VALUES \(1, '([0-9a-f]{64})'\)/);
    expect(m).toBeTruthy();
    expect(m[1]).toBe(placeholder);

    const serverSrc = read('tools/python/server.py');
    expect(serverSrc).not.toMatch(/or "[0-9a-f]{64}"\)/); // 无硬编码兜底哈希
    expect(serverSrc).toMatch(/os\.environ\.get\("ADMIN_KEY_HASH", ""\)\.strip\(\)\.lower\(\)$/m);
    expect(serverSrc).toMatch(/if provided_hash and ADMIN_KEY_HASH_HEX:/);
    expect(serverSrc).toMatch(/if provided and ADMIN_KEY_HASH_HEX:/);
  });

  test('migration_v14：口令轮换指引 + 失败锁定（5 次锁 15 分钟）', () => {
    const v14 = read('sql/migration_v14_admin_hardening.sql');
    expect(v14).toMatch(/openssl rand/);                                   // 高熵口令生成指引
    expect(v14).toMatch(/UPDATE public\.admin_config/);                     // 轮换语句
    expect(v14).toMatch(/failed_attempts/);
    expect(v14).toMatch(/locked_until/);
    expect(v14).toMatch(/INTERVAL '15 minutes'/);
    expect(v14).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_login_with_key/);
    expect(v14).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_login_with_key\(TEXT\) TO authenticated/);
    expect(v14).not.toMatch(/VALUES \(1, '[0-9a-f]{64}'\)/);               // 自身不携带任何可爆破哈希
  });
});

describe('migration_v15：管理员 TOTP 动态码登录', () => {
  const v15Src = read('sql/migration_v15_admin_totp.sql');

  test('SQL 完整性：TOTP RPC + base32 辅助 + 防重放 + 失败锁定 + 退役旧口令 RPC', () => {
    expect(v15Src).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_login_with_totp\(p_code TEXT\)/);
    expect(v15Src).toMatch(/public\._b32_encode/);
    expect(v15Src).toMatch(/public\._b32_decode/);
    expect(v15Src).toMatch(/hmac\(/);                                    // HMAC-SHA1 TOTP
    expect(v15Src).toMatch(/totp_last_step/);                            // 防重放：记录已用时间步
    expect(v15Src).toMatch(/INTERVAL '15 minutes'/);                     // 5 次失败锁 15 分钟
    expect(v15Src).toMatch(/REVOKE EXECUTE ON FUNCTION public\.admin_login_with_key/);
    expect(v15Src).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_login_with_totp\(TEXT\) TO authenticated/);
    // 种子不以字面量形式写进仓库（只在用户 SQL Editor 里生成一次）
    expect(v15Src).not.toMatch(/totp_secret\s*=\s*'[A-Z2-7]{16,}'/);
  });

  test('前端改调 admin_login_with_totp，旧 RPC 名与旧校验函数不再出现', () => {
    expect(adminSrc).toContain('admin_login_with_totp');
    // 注释中提及「已退役的 admin_login_with_key」是允许的，禁止的是调用它
    expect(adminSrc).not.toMatch(/rpc\('admin_login_with_key'/);
    expect(adminSrc).not.toMatch(/adminVerifyKey/);
    expect(typeof window.adminVerifyTotp).toBe('function');
    expect(typeof window.adminVerifyKey).toBe('undefined');
  });
});

describe('管理员动态码登录页', () => {
  test('登录页只提供 TOTP 动态码表单（账号密码/静态口令入口已移除）', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    window.renderAdminPage(target);

    expect(target.innerHTML).toContain('admin-totp-form');
    const totpInput = document.getElementById('admin-totp-input');
    expect(totpInput).not.toBeNull();
    expect(totpInput.getAttribute('type')).toBe('password');
    expect(totpInput.getAttribute('inputmode')).toBe('numeric');
    expect(totpInput.getAttribute('maxlength')).toBe('6');
    expect(totpInput.getAttribute('placeholder')).toBe('6 位动态验证码');
    // 旧静态口令输入与账号密码表单不得存在
    expect(document.getElementById('admin-key-input')).toBeNull();
    expect(document.getElementById('admin-pwd-form')).toBeNull();
    expect(document.getElementById('admin-toggle-pwd-mode')).toBeNull();
    expect(document.getElementById('admin-email-input')).toBeNull();
    expect(document.getElementById('admin-password-input')).toBeNull();
    expect(target.innerHTML).not.toContain('改用管理员账号密码登录');
    expect(target.innerHTML).not.toContain('管理员口令');

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

  test('动态码验证成功：调用 admin_login_with_totp（去空格归一化）、账号升级、写 token、进仪表盘', async () => {
    const rpcCalls = [];
    window.getSupabase = () => ({
      rpc: async (fn, params) => {
        rpcCalls.push({ fn, params });
        return { data: [{ ok: true, user_group: 'admin', error_msg: null }], error: null };
      }
    });
    const me = { id: 'u1', user_group: 'member' };
    window.getCurrentUser = () => me;

    const res = await window.adminVerifyTotp(' 123 456 ');
    expect(res.ok).toBe(true);
    // 必须调用服务端 TOTP RPC（前端不做动态码比对），入参去空格且为 6 位数字
    expect(rpcCalls).toEqual([{ fn: 'admin_login_with_totp', params: { p_code: '123456' } }]);
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

  test('动态码错误：返回服务端错误文案且不解锁', async () => {
    window.getSupabase = () => ({
      rpc: async () => ({ data: [{ ok: false, user_group: null, error_msg: '动态验证码不正确' }], error: null })
    });
    const me = { id: 'u1', user_group: 'member' };
    window.getCurrentUser = () => me;

    const res = await window.adminVerifyTotp('000000');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('动态验证码不正确');
    expect(me.user_group).toBe('member');
    expect(sessionStorage.getItem('bioquest_admin_auth')).toBeNull();
  });

  test('服务端未部署 RPC：提示先执行 migration_v15_admin_totp.sql', async () => {
    window.getSupabase = () => ({
      rpc: async () => ({
        data: null,
        error: { message: 'Could not find the function public.admin_login_with_totp(p_code) in the schema cache' }
      })
    });
    const res = await window.adminVerifyTotp('123456');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('migration_v15_admin_totp.sql');
  });

  test('未填/非 6 位数字：直接返回校验提示，不发请求', async () => {
    let called = false;
    window.getSupabase = () => ({ rpc: async () => { called = true; return { data: [], error: null }; } });
    const r1 = await window.adminVerifyTotp('   ');
    expect(r1.ok).toBe(false);
    expect(r1.error).toContain('6 位动态验证码');
    const r2 = await window.adminVerifyTotp('12345');
    expect(r2.ok).toBe(false);
    expect(r2.error).toBe('动态验证码为 6 位数字');
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