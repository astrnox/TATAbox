-- ============================================================
-- TATABOX — 管理员密钥认证 + 管理员重置密码（migration_v11）
-- 适用 Supabase SQL Editor
-- ============================================================
-- [幂等说明] 本文件可重复执行：
--   CREATE EXTENSION IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
--   INSERT ... ON CONFLICT DO NOTHING / CREATE OR REPLACE FUNCTION /
--   DROP TRIGGER IF EXISTS + CREATE TRIGGER
-- ============================================================
-- 背景：
--   P0-2 整改移除了「纯客户端 SHA-256 管理员密钥比对」（前端可绕过，不构成真实安全），
--   管理员认证只剩「Supabase 账号 user_group='admin'」一条路。但普通账号（如站长本人的
--   非 admin 账号）需要一条安全的补票通道：
--     1. 管理员密钥只在服务端比对（SHA-256 摘要存于不可读的 admin_config 表）；
--     2. 验证通过后把「当前登录账号」升级为 admin（此后数据读写仍由既有 RLS 策略强制）。
--   另补充「管理员重置任意用户密码」RPC（前端不再需要 service_role）。
-- ============================================================


-- ============================================================
-- 0. 依赖扩展（sha256 摘要）
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 1. 管理员密钥配置表（不可被 anon/authenticated 读取）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  admin_key_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;
-- 不创建任何策略 + 收回权限：客户端读不到密钥摘要，只有 SECURITY DEFINER 函数才能比对
REVOKE ALL ON public.admin_config FROM anon, authenticated;

-- 口令摘要占位值（公开仓库不存放真实哈希：SHA-256 无盐无慢化，
-- 哈希进公开仓库 = 可被离线爆破）。历史提交中的旧真实哈希无法从
-- git 历史抹除，唯一作废方式是轮换口令。
-- 本 INSERT 仅对「全新部署」生效（ON CONFLICT DO NOTHING 不覆盖线上已有值）。
-- 全新部署初始化后必须立即执行 sql/migration_v14_admin_hardening.sql 的
-- 口令轮换（高熵口令），否则占位值对应明文即为生效口令。
-- 本占位值 = sha256('REPLACE_ME_RUN_MIGRATION_V14_ROTATION')。
-- 轮换方式见 migration_v14（推荐：本地 openssl 生成哈希后 UPDATE）。
INSERT INTO public.admin_config (id, admin_key_hash)
VALUES (1, '4417197a1bb392011ea8b5cf84d59027431a4adcb58977009a02c63361c376ab')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 2. 敏感字段保护触发器升级：放行服务端 SECURITY DEFINER 路径
--    原实现只认 role GUC（service_role/supabase_admin），导致
--    「属主为 postgres 的 SECURITY DEFINER 函数」也改不动 email/user_key/user_group
--    （管理员密钥升级 user_group 就会失败）。这里同时允许 current_user 判定。
--    客户端（authenticated/anon）仍无法绕过：current_user 不可伪造。
-- ============================================================
CREATE OR REPLACE FUNCTION public.profile_protect_sensitive()
RETURNS trigger AS $$
DECLARE
  v_server_side BOOLEAN;
BEGIN
  v_server_side := COALESCE(
      current_setting('role', true) IN ('service_role', 'supabase_admin'), FALSE
    )
    OR current_user IN ('postgres', 'service_role', 'supabase_admin');

  -- email 只能由服务端设置
  IF NEW.email IS DISTINCT FROM OLD.email AND NOT v_server_side THEN
    NEW.email := OLD.email;
  END IF;

  -- user_key 只能由服务端设置
  IF NEW.user_key IS DISTINCT FROM OLD.user_key AND NOT v_server_side THEN
    NEW.user_key := OLD.user_key;
  END IF;

  -- user_group 只能由服务端/admin 流程升级
  IF NEW.user_group IS DISTINCT FROM OLD.user_group AND NOT v_server_side THEN
    NEW.user_group := OLD.user_group;
  END IF;

  -- id / created_at 永远不能改
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- 3. 管理员密钥验证 → 当前账号升级为 admin
--     - 只允许已登录用户调用（auth.uid() 非空）；
--     - 密钥错误时休眠 1 秒，抬高在线暴力枚举成本；
--     - 成功返回 ok=true，用户 group 变为 admin（幂等，可重复验证）。
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_login_with_key(p_key TEXT)
RETURNS TABLE(
  ok BOOLEAN,
  user_group TEXT,
  error_msg TEXT
) AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_hash TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, '请先登录后再验证管理员密钥'::TEXT;
    RETURN;
  END IF;

  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, '请输入管理员密钥'::TEXT;
    RETURN;
  END IF;

  SELECT admin_key_hash INTO v_hash FROM public.admin_config WHERE id = 1;

  IF v_hash IS NULL
     OR encode(digest(trim(p_key), 'sha256'), 'hex') IS DISTINCT FROM v_hash THEN
    -- 恒定时间不是重点，重点是抬高枚举成本
    PERFORM pg_sleep(1);
    RETURN QUERY SELECT FALSE, NULL::TEXT, '管理员密钥不正确'::TEXT;
    RETURN;
  END IF;

  UPDATE public.profiles
  SET user_group = 'admin'
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, '账号档案不存在，请先完成注册登录'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 'admin'::TEXT, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

GRANT EXECUTE ON FUNCTION public.admin_login_with_key(TEXT) TO authenticated;


-- ============================================================
-- 4. 管理员重置任意用户密码（替代「Supabase Admin API 暂不可用」的占位实现）
--     - 调用者必须是 admin（服务端按 profiles.user_group 校验，不看前端自述）；
--     - 复用 auth.users.encrypted_password 的 crypt/gen_salt('bf') 格式，
--       与 migration_v4 的 reset_password_by_key 保持一致。
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_reset_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS TABLE(
  ok BOOLEAN,
  error_msg TEXT
) AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT FALSE, '请先登录'::TEXT;
    RETURN;
  END IF;

  SELECT (user_group = 'admin') INTO v_is_admin
  FROM public.profiles
  WHERE id = v_uid;

  IF COALESCE(v_is_admin, FALSE) IS NOT TRUE THEN
    RETURN QUERY SELECT FALSE, '无权限：需要管理员身份'::TEXT;
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, '缺少目标用户'::TEXT;
    RETURN;
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RETURN QUERY SELECT FALSE, '新密码至少 6 位'::TEXT;
    RETURN;
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, '用户不存在'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

GRANT EXECUTE ON FUNCTION public.admin_reset_password(UUID, TEXT) TO authenticated;


-- ============================================================
-- 5. 完成后自检（可选）：
--    SELECT public.admin_login_with_key('错误的密钥');  -- 应返回 ok=false
--    注意：密钥正确时不建议在 SQL Editor 直接调用（会把 postgres 之外的
--    auth.uid() 置空，返回"请先登录"；正式验证请从网页管理员入口进行）。
-- ============================================================