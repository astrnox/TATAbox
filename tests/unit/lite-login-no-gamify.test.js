/**
 * @jest-environment jsdom
 *
 * 极简模式（lite.html）登录回归：不加载 sb-gamify.js 时不得抛
 * "startOnlineTimeTracking is not defined"
 * ---------------------------------------------------------------
 * 背景：loginUser / restoreSession 会启动在线时长跟踪，该函数定义在
 * sb-gamify.js。极简模式为减包不加载该文件，裸调用会让登录流程直接
 * ReferenceError（表现为点击登录无反应）。
 *
 * 本用例只求值 supabase-client.js（模拟 lite 的加载集合），断言：
 *   1. loginUser 成功返回 ok=true，且没有未捕获异常；
 *   2. 未定义 startOnlineTimeTracking 时不会阻断登录。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CLIENT_SRC = fs.readFileSync(path.join(ROOT, 'js/core/supabase-client.js'), 'utf8');

function makeQuery(resolveRow) {
  const q = {};
  ['select', 'insert', 'upsert', 'delete', 'neq', 'in', 'is', 'like',
    'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range'].forEach(function (m) {
    q[m] = function () { return q; };
  });
  q.eq = function () { return q; };
  q.ilike = function () { return q; };
  q.update = function () { return q; };
  q.maybeSingle = async function () {
    return { data: resolveRow(), error: null };
  };
  q.then = function (onFulfilled, onRejected) {
    return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
  };
  q.catch = function (onRejected) {
    return Promise.resolve({ data: null, error: null }).catch(onRejected);
  };
  return q;
}

test('lite 未加载 sb-gamify.js 时 loginUser 仍可成功（不抛 startOnlineTimeTracking 未定义）', async () => {
  expect(typeof window.startOnlineTimeTracking).toBe('undefined');

  const client = {
    auth: {
      onAuthStateChange: function () {
        return { data: { subscription: { unsubscribe: function () {} } } };
      },
      getSession: async function () { return { data: { session: null } }; },
      signInWithPassword: async function (params) {
        return {
          data: {
            user: {
              id: 'uid-lite',
              email: params.email,
              email_confirmed_at: null
            },
            session: { access_token: 't' }
          },
          error: null
        };
      }
    },
    from: function () {
      return makeQuery(function () {
        return { id: 'uid-lite', username: 'liteuser', display_name: '极简用户', email: 'lite@example.com' };
      });
    },
    rpc: function (fn) {
      if (fn === 'resolve_login_email') {
        return Promise.resolve({
          data: [{ res_email: 'lite@example.com', res_username: 'liteuser' }],
          error: null
        });
      }
      return Promise.resolve({ data: null, error: { message: 'unknown rpc: ' + fn } });
    }
  };

  window.supabase = { createClient: function () { return client; } };
  window.eval(CLIENT_SRC);

  const res = await window.loginUser('liteuser', 'pw123456');

  expect(res.ok).toBe(true);
  expect(res.user.username).toBe('liteuser');

  delete window.supabase;
});
