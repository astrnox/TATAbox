-- ============================================================
-- TATABOX — migration_v22：profiles 策略清单清理（M-04 收尾）
-- ============================================================
-- 背景：
--   v3 / schema.sql / incremental_update / v12 多次创建 profiles 策略，
--   最终 pg_policies 里同时存在多组同义或冲突策略。执行 v6 后实测可见：
--     - profiles_no_elevation 是 RESTRICTIVE UPDATE，WITH CHECK 只允许
--       member / guest / verified；admin / premium 用户改昵称/头像/积分时，
--       新行 user_group 仍是 admin / premium，会被这条策略拒绝（功能性 bug）；
--     - "Admins can update any profile" / profiles_admin_update / profiles_update_policy
--       等重复策略语义相同，审计时无法判断哪条真正生效；
--     - profiles_delete_own 允许客户端直接 DELETE profiles，会绕过 v21
--       的自助注销 RPC，留下 auth.users 孤儿账号；
--     - "Users can insert own profile" 仅校验 auth.uid()=id，档案缺失时
--       可 INSERT 一条 user_group='admin' 的记录。
--
-- 本迁移把策略收敛为唯一清单（幂等，可重复执行）：
--   SELECT  : profiles_select_own + profiles_select_admin
--   UPDATE  : profiles_update_own + profiles_update_admin
--   INSERT  : profiles_insert_policy（仅本人，且只能是 member/guest）
--   DELETE  : 不开放；删除走 v20 admin_delete_user / v21 delete_my_account
--   提权保护: 由 profile_protect 触发器负责（RLS 无法比较 OLD/NEW）
--
-- 本文件自带触发器与管理员函数定义，即使 v18 只执行了一部分也能独立收尾。
-- 建议顺序：v18 → v19 → v20 → v21 → v22。
-- ============================================================

SET search_path TO public, extensions;

-- ---------- 0. 幂等基础：管理员函数 + 提权触发器 + RLS 开关 ----------
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

CREATE OR REPLACE FUNCTION public.profile_protect_sensitive()
RETURNS trigger AS $$
DECLARE
  v_role TEXT := COALESCE(current_setting('role', true), '');
  v_internal TEXT := COALESCE(current_setting('bioquest.internal_write', true), '');
BEGIN
  -- 服务端路径：service_role / Auth 触发器 / SQL 编辑器 / 显式内部写标记
  IF v_role IN ('service_role', 'supabase_admin', 'supabase_auth_admin', 'postgres')
     OR v_internal = '1' THEN
    RETURN NEW;
  END IF;

  -- 客户端不得修改 email / user_key / 主键 / 创建时间
  NEW.email := OLD.email;
  NEW.user_key := OLD.user_key;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;

  -- user_group 仅允许 member/guest → verified 的低风险自升级；
  -- admin/premium 变更必须走 SECURITY DEFINER RPC（v15 / v20）。
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

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- ---------- 1. 删除历史/重复/冲突策略 ----------
-- 显式列出已知策略名（便于审计），随后再动态清扫未知重复。
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS profiles_privacy_update ON public.profiles;
DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_delete ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
DROP POLICY IF EXISTS profiles_no_elevation ON public.profiles;

-- ---------- 1.1 动态清扫其余非规范策略（含带空格的历史策略名） ----------
DO $$
DECLARE
  r RECORD;
  canonical TEXT[] := ARRAY[
    'profiles_select_own',
    'profiles_select_admin',
    'profiles_update_own',
    'profiles_update_admin',
    'profiles_insert_policy'
  ];
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    IF NOT (r.policyname = ANY (canonical)) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
    END IF;
  END LOOP;
END $$;

-- ---------- 2. 重建唯一的一组策略 ----------
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_policy ON public.profiles;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (public.bioquest_is_admin());

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.bioquest_is_admin())
  WITH CHECK (public.bioquest_is_admin());

-- 仅允许本人补建档案，且新行只能是会员/访客组，防止 INSERT 时自带 admin。
CREATE POLICY profiles_insert_policy ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND COALESCE(user_group, 'member') IN ('member', 'guest')
  );

-- ---------- 3. 迁移记录 ----------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'migration_record'
  ) THEN
    PERFORM public.migration_record(
      'migration_v22',
      'profiles 策略清理 + 触发器重装：最终仅保留 own/admin SELECT+UPDATE 与受限 self INSERT'
    );
  END IF;
END $$;

-- ---------- 4. 自检（执行整文件后取消注释再运行） ----------
-- SELECT has_table_privilege('anon', 'public.profiles', 'SELECT');  -- 期望 false
-- SELECT policyname, permissive, cmd, qual, with_check
-- FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
-- ORDER BY cmd, policyname;  -- 期望恰好 5 条
