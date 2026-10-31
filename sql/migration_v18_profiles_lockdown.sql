-- ============================================================
-- TATABOX — migration_v18：profiles 表 PII 收紧（H-01）
-- ============================================================
-- 背景：
--   v3 为兼容历史查询保留了 profiles SELECT USING (true)，并在
--   profiles 上新增 email 列；schema.sql / schema_safe.sql 还显式
--   GRANT SELECT 给 anon。线上曾用 Dashboard 手工执行 REVOKE 修复，
--   但仓库内没有对应迁移——按文档新建项目会复现「匿名可读全部邮箱」。
--
-- 本迁移把「线上手工修复」固化为可重复执行的 SQL：
--   1) profiles 仅本人可读；管理员额外可读（用于后台用户管理）
--   2) anon / PUBLIC 不再拥有 profiles 任何权限
--   3) 公开资料统一走 public_profiles 视图（不含 email/user_key）
--   4) 注册可用性检查与信用排行榜改走窄 RPC，前端不再直读 profiles
--
-- 执行要求：在 Supabase SQL Editor 整文件执行（幂等），必须先于
--   本次前端代码上线（前端已不再假设 profiles 可匿名读）。
-- 已执行过 v15 的线上库：请在本文件之后重跑一次 migration_v15
--   （其 admin_login_with_totp 已加入 internal_write 标记，否则 TOTP
--   升级管理员会被本文件修正后的触发器回滚）。
-- ============================================================

SET search_path TO public, extensions;

-- ---------- 0. 管理员判定函数（幂等；schema.sql 已定义，缺失环境兜底） ----------
CREATE OR REPLACE FUNCTION public.bioquest_is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_group = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.bioquest_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bioquest_is_admin() TO authenticated, service_role;

-- ---------- 1. 清理 profiles 上的所有 SELECT 策略 ----------
-- 兼容 schema.sql 的 profiles_select_policy、v3 的 profiles_select_all、
-- 以及线上 Dashboard 手工创建的 profiles_select_own 等任意命名。
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

-- ---------- 2. 仅本人可读 + 管理员可读 ----------
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (public.bioquest_is_admin());

-- ---------- 3. 管理员可更新非敏感字段 ----------
-- profile_protect_sensitive 触发器仍会拦截 email / user_key / user_group / id / created_at，
-- 因此本策略只放行后台「编辑用户资料 / 调整信用」等普通字段写入。
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.bioquest_is_admin())
  WITH CHECK (public.bioquest_is_admin());

-- ---------- 3.1 修复敏感字段触发器：不再用 current_user 判定 ----------
-- v11 把 profile_protect_sensitive 改成 SECURITY DEFINER 并用 current_user 判定，
-- 但 SECURITY DEFINER 执行期间 current_user 恒为函数属主（postgres），
-- 等于对所有客户端放行——任何登录用户都能自行把 user_group 改成 admin。
-- 这里改为「会话 role + 显式内部写标记」：
--   * 客户端（authenticated/anon）无法设置 GUC，也拿不到标记；
--   * 服务端 RPC 在 UPDATE 前 set_config('bioquest.internal_write','1',true)；
--   * Auth 触发器（supabase_auth_admin）与 service_role 直接放行。
CREATE OR REPLACE FUNCTION public.profile_protect_sensitive()
RETURNS trigger AS $$
DECLARE
  v_role TEXT := COALESCE(current_setting('role', true), '');
  v_internal TEXT := COALESCE(current_setting('bioquest.internal_write', true), '');
BEGIN
  IF v_role IN ('service_role', 'supabase_admin', 'supabase_auth_admin', 'postgres')
     OR v_internal = '1' THEN
    RETURN NEW;
  END IF;

  -- 客户端一律不得修改 email / user_key / 主键 / 创建时间
  NEW.email := OLD.email;
  NEW.user_key := OLD.user_key;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;

  -- user_group 仅保留一个低风险自升级：member/guest → verified（邮箱验证流程）。
  -- admin / premium 等特权组必须走服务端标记路径。
  IF NEW.user_group IS DISTINCT FROM OLD.user_group THEN
    IF NOT (COALESCE(OLD.user_group, 'member') IN ('member', 'guest')
            AND NEW.user_group = 'verified') THEN
      NEW.user_group := OLD.user_group;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS profile_protect ON public.profiles;
DROP TRIGGER IF EXISTS profile_protect_sensitive_trigger ON public.profiles;
CREATE TRIGGER profile_protect
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profile_protect_sensitive();

-- ---------- 4. 收回 anon 与 PUBLIC 的 profiles 权限 ----------
-- 注意：必须同时收回 PUBLIC，避免 Supabase 默认授权经由 PUBLIC 继承给 anon。
REVOKE ALL ON public.profiles FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- ---------- 5. 公开资料视图（只暴露非敏感列） ----------
-- 视图使用 owner 权限读取 profiles（security_invoker=off），
-- 但列清单物理上不包含 email / user_key / device_id。
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles AS
SELECT
  id,
  username,
  display_name,
  avatar_url,
  bio_score,
  user_group,
  cr,
  created_at
FROM public.profiles;

ALTER VIEW public.public_profiles SET (security_invoker = off);
GRANT SELECT ON public.public_profiles TO anon, authenticated, service_role;

-- ---------- 6. 注册可用性检查（替代前端 anon 直读 profiles） ----------
CREATE OR REPLACE FUNCTION public.check_signup_availability(
  p_username TEXT,
  p_email TEXT DEFAULT NULL
)
RETURNS TABLE(
  username_taken BOOLEAN,
  email_taken BOOLEAN
) AS $$
DECLARE
  v_name TEXT := btrim(coalesce(p_username, ''));
  v_email TEXT := btrim(coalesce(p_email, ''));
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN v_name = '' THEN FALSE
         ELSE EXISTS (SELECT 1 FROM public.profiles p
                      WHERE lower(p.username) = lower(v_name))
    END,
    CASE WHEN v_email = '' OR lower(v_email) LIKE '%@bioquest.local' THEN FALSE
         ELSE EXISTS (SELECT 1 FROM public.profiles p2
                      WHERE lower(p2.email) = lower(v_email))
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

REVOKE ALL ON FUNCTION public.check_signup_availability(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_signup_availability(TEXT, TEXT) TO anon, authenticated, service_role;

-- ---------- 7. 信用排行榜窄 RPC（替代 anon 直读 profiles.points） ----------
CREATE OR REPLACE FUNCTION public.get_points_leaderboard(p_limit INT DEFAULT 50)
RETURNS TABLE(
  id UUID,
  username TEXT,
  display_name TEXT,
  points INT,
  user_group TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.username::TEXT,
    p.display_name::TEXT,
    COALESCE(p.points, 0)::INT,
    COALESCE(p.user_group, 'member')::TEXT
  FROM public.profiles p
  ORDER BY COALESCE(p.points, 0) DESC NULLS LAST, p.created_at ASC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

REVOKE ALL ON FUNCTION public.get_points_leaderboard(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_points_leaderboard(INT) TO anon, authenticated, service_role;

-- ---------- 8. 迁移记录（migration_tracker 未执行时跳过，避免本文件失败） ----------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'migration_record'
  ) THEN
    PERFORM public.migration_record(
      'migration_v18',
      'profiles 收紧为本人/管理员可读；anon 权限收回；公开资料走 public_profiles；注册与排行榜改窄 RPC'
    );
  END IF;
END $$;

-- ---------- 9. 自检（应全部返回 0 行 / false） ----------
-- 9.1 anon 不应再拥有 profiles 任何权限：
-- SELECT has_table_privilege('anon', 'public.profiles', 'SELECT');  -- 期望 false
-- 9.2 profiles 上不应存在给 anon 的 SELECT 策略：
-- SELECT policyname, roles, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='profiles' AND cmd='SELECT';
-- 9.3 公开视图仍可读：
-- SELECT count(*) FROM public.public_profiles;
