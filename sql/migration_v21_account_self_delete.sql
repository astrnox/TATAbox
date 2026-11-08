-- ============================================================
-- TATABOX — migration_v21：账号自助注销闭环（M-10）
-- ============================================================
-- 背景：
--   旧版 deleteAccount() 只 DELETE profiles 及三张业务表，
--   auth.users 仍然保留——用户以为账号已注销，实际仍可登录并占用邮箱。
--
-- 本迁移提供 delete_my_account()：
--   * 仅允许已登录用户注销自己的账号（auth.uid()）；
--   * 删除 auth.users（级联 profiles 与业务表），再显式删 profiles 兜底；
--   * 最后一名管理员禁止自助注销，避免后台永久锁死。
--
-- 注意：删除 auth 用户后当前 JWT 立即失效，前端需随后 signOut 并清本地缓存。
-- 执行要求：SQL 先于前端上线。
-- ============================================================

SET search_path TO public, auth, extensions;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS TABLE(
  ok BOOLEAN,
  error_msg TEXT
) AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_group TEXT;
  v_admin_count INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT FALSE, '请先登录'::TEXT;
    RETURN;
  END IF;

  SELECT user_group INTO v_group FROM public.profiles WHERE id = v_uid;

  IF COALESCE(v_group, 'member') = 'admin' THEN
    SELECT count(*) INTO v_admin_count FROM public.profiles WHERE user_group = 'admin';
    IF v_admin_count <= 1 THEN
      RETURN QUERY SELECT FALSE, '最后一名管理员不能自助注销，请先转移管理员权限'::TEXT;
      RETURN;
    END IF;
  END IF;

  BEGIN
    DELETE FROM auth.users WHERE id = v_uid;
    DELETE FROM public.profiles WHERE id = v_uid;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, ('注销失败：' || SQLERRM)::TEXT;
    RETURN;
  END;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated, service_role;

-- 迁移记录（migration_tracker 未执行时跳过）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'migration_record'
  ) THEN
    PERFORM public.migration_record(
      'migration_v21',
      '账号自助注销：删除 auth.users（级联 profiles/业务表），保留最后一名管理员保护'
    );
  END IF;
END $$;

-- 自检：
-- SELECT * FROM public.delete_my_account();  -- 未登录应 ok=false；登录后执行会删除当前账号
