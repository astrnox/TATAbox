/**
 * @jest-environment jsdom
 *
 * Issue #170 回归测试：明明是正确的用户名/密码，登录却提示"用户名/邮箱或密码错误"
 * ------------------------------------------------------------------------------
 * 背景：注册时未填邮箱的账号，其 Supabase 认证邮箱固定为
 *      <清洗后的用户名>@bioquest.local（清洗规则与 registerUser 一致）。
 *      但历史账号的 profiles.email 可能为 NULL（触发器未回填，或被数据库
 *      profile_protect_sensitive 触发器拦截），此时用户名登录无法从
 *      profiles.email 拿到真实认证邮箱，正确密码也会被误判为密码错误。
 *
 * 修复要求：
 *   1. profiles.email 为 NULL 时，按注册规则推导占位邮箱并尝试登录（正确密码必须能登录）
 *   2. 填过真实邮箱的账号优先用 profiles.email 登录，不被占位邮箱方案干扰
 *   3. profiles 查不到用户名时仍回退占位邮箱（兼容触发器缺失/大小写不一致等脏数据）
 *   4. 密码确实错误时保持"用户名/邮箱或密码错误"，不得误报成功
 *   5. 候选邮箱按序尝试：前一个"凭据错误"才尝试下一个
 */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
// P1-1 拆分后 supabase 数据层由 5 个文件组成；按浏览器加载顺序整体求值，
// 保证 registerUser/loginUser 的跨文件调用（checkAchievement/getStudentByKey 等）可解析。
const SB_LAYER = [
  'js/core/supabase-client.js',
  'js/core/sb-gamify.js',
  'js/core/sb-social.js',
  'js/core/sb-data.js',
  'js/core/sb-study.js',
].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));

/**
 * 构造 Supabase 查询链 mock：支持 .select().eq().maybeSingle() / .update().eq() 等
 * @param {(col: string, val: any) => object|null} resolveRow 按过滤条件返回数据行
 */
function makeQuery(resolveRow) {
  let mode = 'select';
  let filters = [];

  const q = {};
  ['select', 'insert', 'upsert', 'delete', 'neq', 'in', 'is', 'like',
    'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range'].forEach(function (m) {
    q[m] = function () { return q; };
  });
  q.update = function () { mode = 'update'; return q; };
  q.eq = function (c, v) { filters.push({ op: 'eq', col: c, val: v }); return q; };
  q.ilike = function (c, v) { filters.push({ op: 'ilike', col: c, val: v }); return q; };

  q.maybeSingle = async function () {
    if (mode === 'update') return { data: null, error: null };
    // 依次应用过滤条件（eq 精确 / ilike 大小写不敏感），与 PostgREST 语义对齐
    let rows = null;
    for (const f of filters) {
      rows = resolveRow(f.col, f.val, f.op);
      if (rows === undefined) rows = null;
      if (rows === null) break;
    }
    return { data: rows, error: null };
  };
  q.then = function (onFulfilled, onRejected) {
    return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
  };
  q.catch = function (onRejected) {
    return Promise.resolve({ data: null, error: null }).catch(onRejected);
  };
  return q;
}

/**
 * 装配被测试环境：注入 mock supabase 客户端并求值 supabase-client.js
 * @param {object} cfg
 * @param {Array} cfg.profiles  profiles 表中的行
 * @param {object} cfg.passwords 认证邮箱 → 正确密码
 */
function setup(cfg) {
  const signInCalls = [];

  const client = {
    auth: {
      onAuthStateChange: function () {
        return { data: { subscription: { unsubscribe: function () {} } } };
      },
      getSession: async function () { return { data: { session: null } }; },
      signInWithPassword: async function (params) {
        signInCalls.push(params);
        const email = params && params.email;
        if (cfg.passwords && Object.prototype.hasOwnProperty.call(cfg.passwords, email) &&
            cfg.passwords[email] === params.password) {
          return {
            data: {
              user: { id: 'uid-' + email, email: email, email_confirmed_at: null },
              session: { access_token: 't' }
            },
            error: null
          };
        }
        return {
          data: { user: null, session: null },
          error: { message: 'Invalid login credentials' }
        };
      }
    },
    from: function (table) {
      if (table === 'profiles') {
        return makeQuery(function (col, val, op) {
          if (col === 'id') return cfg.profiles.find(function (p) { return p.id === val; }) || null;
          if (col === 'username') {
            if (op === 'ilike') {
              const low = String(val).toLowerCase();
              return cfg.profiles.find(function (p) { return String(p.username).toLowerCase() === low; }) || null;
            }
            return cfg.profiles.find(function (p) { return p.username === val; }) || null;
          }
          return null;
        });
      }
      return makeQuery(function () { return null; });
    },
    // 用户名登录已改为窄 RPC resolve_login_email（SECURITY DEFINER，仅回 email+username；
    // 契约见 sql/migration_v16_login_contract.sql：lower(username) 命中即返回行，
    // email 可为 NULL（未绑定邮箱的历史账号），RETURNS TABLE → 数据为数组）
    rpc: function (fn, args) {
      if (fn !== 'resolve_login_email') {
        return Promise.resolve({ data: null, error: { message: 'unknown rpc: ' + fn } });
      }
      const low = args && args.p_name != null ? String(args.p_name).toLowerCase() : '';
      const hit = cfg.profiles.find(function (p) {
        return String(p.username).toLowerCase() === low;
      }) || null;
      return Promise.resolve({
        data: hit ? [{ res_email: hit.email || null, res_username: hit.username }] : [],
        error: null
      });
    }
  };

  window.supabase = { createClient: function () { return client; } };
  SB_LAYER.forEach((src) => window.eval(src));
  return { loginUser: window.loginUser, signInCalls };
}

afterEach(function () {
  try {
    if (window._onlineTracker && window._onlineTracker.heartbeatTimer) {
      clearInterval(window._onlineTracker.heartbeatTimer);
    }
  } catch (e) { /* ignore */ }
  delete window.supabase;
  delete window.loginUser;
});

describe('Issue #170 用户名登录（profiles.email 为 NULL 的历史账号）', function () {
  test('profiles.email 为 NULL 时按注册规则推导占位邮箱，正确密码可登录', async function () {
    const env = setup({
      profiles: [{ id: 'u-qiqi', username: 'Qiqi', email: null }],
      passwords: { 'qiqi@bioquest.local': 'pw123456' }
    });

    const res = await env.loginUser('Qiqi', 'pw123456');

    expect(res.ok).toBe(true);
    expect(env.signInCalls.map(function (c) { return c.email; })).toEqual(['qiqi@bioquest.local']);
    expect(res.user.username).toBe('Qiqi');
  });

  test('填过真实邮箱的账号优先用 profiles.email，登录只尝试一次', async function () {
    const env = setup({
      profiles: [{ id: 'u-fxt', username: 'fxt', email: 'fxt@example.com' }],
      passwords: { 'fxt@example.com': 'pw123456' }
    });

    const res = await env.loginUser('fxt', 'pw123456');

    expect(res.ok).toBe(true);
    expect(env.signInCalls.map(function (c) { return c.email; })).toEqual(['fxt@example.com']);
  });

  test('profiles.email 是旧值时，凭据错误后自动尝试占位邮箱候选', async function () {
    const env = setup({
      profiles: [{ id: 'u-chen', username: 'chen', email: 'stale@163.com' }],
      passwords: { 'chen@bioquest.local': 'pw123456' }
    });

    const res = await env.loginUser('chen', 'pw123456');

    expect(res.ok).toBe(true);
    expect(env.signInCalls.map(function (c) { return c.email; }))
      .toEqual(['stale@163.com', 'chen@bioquest.local']);
  });

  test('profiles 查不到用户名时仍回退占位邮箱（含下划线/大小写清洗）', async function () {
    const env = setup({
      profiles: [],
      passwords: { 'to9a4tr@bioquest.local': 'pw123456' }
    });

    const res = await env.loginUser('T_o9a4tr', 'pw123456');

    expect(res.ok).toBe(true);
    expect(env.signInCalls.map(function (c) { return c.email; })).toEqual(['to9a4tr@bioquest.local']);
  });

  test('用户名大小写不敏感：输入 qiqi 可命中注册名 Qiqi 并用真实邮箱登录', async function () {
    const env = setup({
      profiles: [{ id: 'uid-2934166389@qq.com', username: 'Qiqi', email: '2934166389@qq.com' }],
      passwords: { '2934166389@qq.com': '123456' }
    });

    const res = await env.loginUser('qiqi', '123456');

    expect(res.ok).toBe(true);
    expect(env.signInCalls.map(function (c) { return c.email; })).toEqual(['2934166389@qq.com']);
    expect(res.user.username).toBe('Qiqi');
  });

  test('密码确实错误时提示失败并给出未绑定邮箱引导，不误报成功', async function () {
    const env = setup({
      profiles: [{ id: 'u-qiqi', username: 'Qiqi', email: null }],
      passwords: { 'qiqi@bioquest.local': 'correct-password' }
    });

    const res = await env.loginUser('Qiqi', 'wrong-password');

    expect(res.ok).toBe(false);
    expect(res.error).toBe('用户名或密码错误；该账号未绑定邮箱，若注册时填写过邮箱，请改用注册邮箱登录');
    // 占位邮箱候选被尝试过（profiles.email 为 NULL，只有占位邮箱一个候选）
    expect(env.signInCalls.map(function (c) { return c.email; })).toEqual(['qiqi@bioquest.local']);
  });

  test('绑定过邮箱的账号密码错误时保持标准文案，不展示未绑定邮箱引导', async function () {
    const env = setup({
      profiles: [{ id: 'u-fxt', username: 'fxt', email: 'fxt@example.com' }],
      passwords: { 'fxt@example.com': 'correct-password' }
    });

    const res = await env.loginUser('fxt', 'wrong-password');

    expect(res.ok).toBe(false);
    expect(res.error).toBe('用户名/邮箱或密码错误');
  });
});