/**
 * H-01 / H-02 / H-03 静态回归测试
 * ------------------------------------------------------------------
 * 由于核心修复依赖 Supabase SQL 迁移，本测试不联网、不执行 SQL，
 * 只断言「仓库内迁移与前端调用契约」保持一致，防止后续改动回退：
 *   H-01 profiles 不再对 anon 开放 SELECT，公开资料走 public_profiles
 *   H-02 用户名登录 RPC 只有密码校验通过才返回真实邮箱
 *   H-03 管理员改用户组/删用户必须走服务端 RPC（同时清理 auth.users）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('H-01 migration_v18：profiles PII 收紧', () => {
  const sql = read('sql/migration_v18_profiles_lockdown.sql');

  test('anon / PUBLIC 不再拥有 profiles 权限', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.profiles FROM anon, PUBLIC;/);
    expect(sql).not.toMatch(/GRANT SELECT ON public\.profiles TO anon/i);
  });

  test('仅本人 + 管理员可读，且不存在新的公开读策略', () => {
    expect(sql).toMatch(/CREATE POLICY profiles_select_own ON public\.profiles/);
    expect(sql).toMatch(/USING \(auth\.uid\(\) = id\)/);
    expect(sql).toMatch(/CREATE POLICY profiles_select_admin ON public\.profiles/);
    expect(sql).toMatch(/USING \(public\.bioquest_is_admin\(\)\)/);
    expect(sql).not.toMatch(/CREATE POLICY\s+profiles_select_all/i);
  });

  test('公开资料视图与两个窄 RPC 存在', () => {
    expect(sql).toMatch(/CREATE VIEW public\.public_profiles AS/);
    expect(sql).toMatch(/ALTER VIEW public\.public_profiles SET \(security_invoker = off\)/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.check_signup_availability/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_points_leaderboard/);
  });

  test('敏感字段触发器改用会话 role + 内部写标记，不再用 current_user 放行', () => {
    expect(sql).toMatch(/current_setting\('role', true\)/);
    expect(sql).toMatch(/bioquest\.internal_write/);
    expect(sql).not.toMatch(/current_user IN \('postgres'/);
    // 仅保留 member/guest → verified 的低风险自升级
    expect(sql).toMatch(/NEW\.user_group = 'verified'/);
  });
});

describe('H-02 migration_v19：用户名登录 RPC 加固', () => {
  const sql = read('sql/migration_v19_login_rpc_hardening.sql');

  test('兼容版 1-arg 只返回占位邮箱，真实邮箱返回 NULL', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_login_email\(p_name TEXT\)/);
    expect(sql).toMatch(/lower\(p\.email\) LIKE '%@bioquest\.local'/);
    expect(sql).toMatch(/ELSE NULL::TEXT/);
  });

  test('verified 版校验 bcrypt 后才返回邮箱', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_login_email_verified/);
    expect(sql).toMatch(/crypt\(p_password, v_hash\) = v_hash/);
    expect(sql).toMatch(/res_ok BOOLEAN/);
    expect(sql).toMatch(/IF NOT v_ok THEN/);
  });

  test('前端优先调用 verified，且不再直读 profiles 解析登录邮箱', () => {
    const js = read('js/core/supabase-client.js');
    expect(js).toMatch(/resolve_login_email_verified/);
    expect(js).not.toMatch(/select\('id, username, email'\)/);
  });
});

describe('H-03 migration_v20：管理员用户操作 RPC', () => {
  const sql = read('sql/migration_v20_admin_user_ops.sql');

  test('改用户组走服务端 RPC，并含自降级/最后管理员保护', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_set_user_group/);
    expect(sql).toMatch(/不能降级当前登录的管理员账号/);
    expect(sql).toMatch(/至少保留一名管理员/);
  });

  test('删用户同时删除 auth.users（避免孤儿账号）', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_delete_user/);
    expect(sql).toMatch(/DELETE FROM auth\.users WHERE id = p_user_id/);
    expect(sql).toMatch(/不能删除当前登录的账号/);
  });

  test('前端后台写链路使用 RPC 而非直接改 profiles', () => {
    const adminUsers = read('js/admin/admin-users.js');
    expect(adminUsers).toMatch(/admin_set_user_group/);
    expect(adminUsers).toMatch(/admin_delete_user/);
    expect(adminUsers).not.toMatch(/from\('profiles'\)\.update\(\{ user_group/);
    expect(adminUsers).not.toMatch(/from\('profiles'\)\.delete\(\)/);
  });
});

describe('M-10/M-04 收尾：v21 注销闭环 + v22 策略清理', () => {
  const selfDelete = read('sql/migration_v21_account_self_delete.sql');
  const cleanup = read('sql/migration_v22_profiles_policy_cleanup.sql');

  test('v21 删除 auth.users，前端注销走 RPC', () => {
    expect(selfDelete).toMatch(/CREATE OR REPLACE FUNCTION public\.delete_my_account/);
    expect(selfDelete).toMatch(/DELETE FROM auth\.users WHERE id = v_uid/);
    const client = read('js/core/supabase-client.js');
    expect(client).toMatch(/rpc\('delete_my_account'\)/);
  });

  test('v22 移除 restrictive no_elevation 与自删策略', () => {
    expect(cleanup).toMatch(/DROP POLICY IF EXISTS profiles_no_elevation/);
    expect(cleanup).toMatch(/DROP POLICY IF EXISTS profiles_delete_own/);
    expect(cleanup).toMatch(/DROP POLICY IF EXISTS "Users can update own profile"/);
  });

  test('v22 只保留 own/admin SELECT+UPDATE 与受限 self INSERT', () => {
    for (const name of [
      'profiles_select_own',
      'profiles_select_admin',
      'profiles_update_own',
      'profiles_update_admin',
      'profiles_insert_policy'
    ]) {
      expect(cleanup).toMatch(new RegExp(`CREATE POLICY ${name} ON public\\.profiles`));
    }
    // 防止缺档用户 INSERT 时自带 admin
    expect(cleanup).toMatch(/COALESCE\(user_group, 'member'\) IN \('member', 'guest'\)/);
  });

  test('v22 自带触发器重装（提权保护不能只靠 RLS）', () => {
    expect(cleanup).toMatch(/CREATE OR REPLACE FUNCTION public\.profile_protect_sensitive/);
    expect(cleanup).toMatch(/CREATE TRIGGER profile_protect/);
    expect(cleanup).toMatch(/current_setting\('role', true\)/);
    expect(cleanup).toMatch(/bioquest\.internal_write/);
  });
});

describe('H-01 前端公开读取迁移', () => {
  test('社区作者信息改读 public_profiles', () => {
    const social = read('js/core/sb-social.js');
    expect(social).toMatch(/from\('public_profiles'\)/);
    expect(social).not.toMatch(/from\('profiles'\)/);
  });

  test('信用排行榜改走 get_points_leaderboard RPC', () => {
    const gamify = read('js/core/sb-gamify.js');
    expect(gamify).toMatch(/rpc\('get_points_leaderboard'/);
  });

  test('教师查学生改走 get_student_by_key RPC', () => {
    const study = read('js/core/sb-study.js');
    expect(study).toMatch(/rpc\('get_student_by_key'/);
  });

  test('后台用户列表不再把 profiles 当作 anon 公开表', () => {
    const admin = read('js/admin/admin.js');
    const m = admin.match(/var PUBLIC_TABLES = \[(.+?)\];/);
    expect(m).toBeTruthy();
    expect(m[1]).not.toMatch(/'profiles'/);
  });
});
