-- ============================================================
-- TATABOX — migration_v20：管理员用户操作 RPC（H-03）
-- ============================================================
-- 背景：
--   1) 用户组修改：前端直接 PATCH profiles.user_group，会被
--      profile_protect_sensitive 触发器回滚——接口 200 成功、数据未变，
--      后台却提示成功（静默失败）。
--   2) 删除用户：前端只 DELETE profiles，auth.users 仍保留，
--      形成可继续登录/占用邮箱的孤儿账号。
--   3) 用户列表：前端曾用 anon key select=*，与 v18「profiles 收紧」冲突。
--      本迁移后列表改由管理员会话（authenticated + profiles_select_admin）
--      读取；本文件只补齐必须走服务端的写操作。
--
-- 两个 RPC 均为 SECURITY DEFINER（属主 postgres）：
--   * 调用者身份由 auth.uid() + profiles.user_group 校验，不信任前端自述；
--   * 写 user_group 时 current_user = postgres，触发器会放行；
--   * 删除 auth.users 依赖 Supabase 的级联 FK，同时显式删 profiles 兜底。
--
-- 执行要求：SQL 必须先于前端上线。
-- ============================================================

SET search_path TO public, auth, extensions;

-- ---------- 0. 内部辅助：当前调用者是否管理员 ----------
CREATE OR REPLACE FUNCTION public._admin_guard()
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_group = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public._admin_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._admin_guard() TO authenticated, service_role;

-- ---------- 1. 修改用户组 ----------
CREATE OR REPLACE FUNCTION public.admin_set_user_group(
  p_user_id UUID,
  p_group TEXT
)
RETURNS TABLE(
  ok BOOLEAN,
  error_msg TEXT
) AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_old_group TEXT;
  v_admin_count INT;
BEGIN
  IF NOT public._admin_guard() THEN
    RETURN QUERY SELECT FALSE, '无权限：需要管理员身份'::TEXT;
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, '缺少目标用户'::TEXT;
    RETURN;
  END IF;

  IF p_group IS NULL OR p_group NOT IN ('admin', 'premium', 'verified', 'member', 'guest') THEN
    RETURN QUERY SELECT FALSE, '无效的用户组'::TEXT;
    RETURN;
  END IF;

  SELECT user_group INTO v_old_group FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, '用户不存在'::TEXT;
    RETURN;
  END IF;

  -- 防止管理员把自己降级后失去后台入口
  IF p_user_id = v_uid AND p_group <> 'admin' THEN
    RETURN QUERY SELECT FALSE, '不能降级当前登录的管理员账号'::TEXT;
    RETURN;
  END IF;

  -- 防止把最后一名管理员降级，导致后台永久不可用
  IF COALESCE(v_old_group, 'member') = 'admin' AND p_group <> 'admin' THEN
    SELECT count(*) INTO v_admin_count FROM public.profiles WHERE user_group = 'admin';
    IF v_admin_count <= 1 THEN
      RETURN QUERY SELECT FALSE, '至少保留一名管理员'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- v18 起 profile_protect_sensitive 只放行「会话 role=service_role」或
  -- 显式内部写标记；本函数是 SECURITY DEFINER，但会话 role 仍是 authenticated，
  -- 因此必须先打标记，否则 user_group 会被触发器回滚。
  PERFORM set_config('bioquest.internal_write', '1', true);
  UPDATE public.profiles SET user_group = p_group WHERE id = p_user_id;
  PERFORM set_config('bioquest.internal_write', '', true);

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

REVOKE ALL ON FUNCTION public.admin_set_user_group(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_group(UUID, TEXT) TO authenticated, service_role;

-- ---------- 2. 删除用户（auth.users + profiles + 业务级联） ----------
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS TABLE(
  ok BOOLEAN,
  error_msg TEXT
) AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_target_group TEXT;
  v_admin_count INT;
BEGIN
  IF NOT public._admin_guard() THEN
    RETURN QUERY SELECT FALSE, '无权限：需要管理员身份'::TEXT;
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, '缺少目标用户'::TEXT;
    RETURN;
  END IF;

  IF p_user_id = v_uid THEN
    RETURN QUERY SELECT FALSE, '不能删除当前登录的账号'::TEXT;
    RETURN;
  END IF;

  SELECT user_group INTO v_target_group FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, '用户不存在'::TEXT;
    RETURN;
  END IF;

  IF COALESCE(v_target_group, 'member') = 'admin' THEN
    SELECT count(*) INTO v_admin_count FROM public.profiles WHERE user_group = 'admin';
    IF v_admin_count <= 1 THEN
      RETURN QUERY SELECT FALSE, '至少保留一名管理员'::TEXT;
      RETURN;
    END IF;
  END IF;

  BEGIN
    -- auth.users 删除会通过 FK 级联清理 profiles 及挂在其下的业务表；
    -- 若线上缺少级联 FK，下面的显式 DELETE 作为兜底。
    DELETE FROM auth.users WHERE id = p_user_id;
    DELETE FROM public.profiles WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, ('删除失败：' || SQLERRM)::TEXT;
    RETURN;
  END;

  -- auth 记录本就不存在（历史孤儿档案）：显式 DELETE profiles 已完成清理，
  -- 视为成功，避免后台反复提示「用户不存在」。
  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated, service_role;

-- ---------- 3. 迁移记录（migration_tracker 未执行时跳过） ----------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'migration_record'
  ) THEN
    PERFORM public.migration_record(
      'migration_v20',
      '管理员用户操作 RPC：改用户组 / 删除 auth 用户，含自降级与最后管理员保护'
    );
  END IF;
END $$;

-- ---------- 4. 自检 ----------
-- SELECT * FROM public.admin_set_user_group('<uuid>', 'member');  -- 非 admin 调用应 ok=false
-- SELECT * FROM public.admin_delete_user('<uuid>');              -- 非 admin 调用应 ok=false
