-- ============================================================
-- TATABOX — migration_v19：用户名登录 RPC 加固（H-02）
-- ============================================================
-- 背景：
--   v16 的 resolve_login_email(p_name) 只按用户名返回完整 email，
--   并授权给 anon。任何未登录者都能批量枚举「用户名 → 邮箱」，
--   既是账号枚举也是邮箱收集面。
--
-- 本迁移把「邮箱解析」拆成两条路径：
--   1) resolve_login_email(p_name)        —— 兼容旧前端：只返回占位邮箱
--      （<username>@bioquest.local 本身可由用户名推导，不构成秘密），
--      真实邮箱一律返回 NULL。
--   2) resolve_login_email_verified(name, password)
--      —— 新前端使用：先校验密码（bcrypt），密码正确才返回真实邮箱。
--      密码错误返回 res_ok=false 且不返回任何邮箱；失败时 sleep 0.35s
--      抬高在线枚举成本（生产环境仍建议叠加 Supabase Auth 限流/WAF）。
--
-- 兼容性：
--   * 新前端优先调用 verified；若函数未部署（旧库），回退到 1) 的
--     安全版本（不会泄露真实邮箱）。
--   * 非 bcrypt 哈希（如 OAuth-only / 未来 argon2）无法在 SQL 内校验，
--     verified 返回 res_ok=false，此类账号必须改用邮箱登录。
--
-- 执行要求：SQL 必须先于前端上线。
-- ============================================================

SET search_path TO public, auth, extensions;

-- ---------- 1. 兼容旧前端的 1-arg 版本：绝不返回真实邮箱 ----------
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_name TEXT)
RETURNS TABLE(res_email TEXT, res_username TEXT) AS $$
DECLARE
  v_name TEXT := btrim(coalesce(p_name, ''));
BEGIN
  IF v_name = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN p.email IS NULL OR lower(p.email) LIKE '%@bioquest.local' THEN p.email::TEXT
      ELSE NULL::TEXT
    END AS res_email,
    p.username::TEXT AS res_username
  FROM public.profiles p
  WHERE lower(p.username) = lower(v_name)
    -- 兼容版只用于「无真实邮箱」的占位账号；真实邮箱账号返回 0 行，
    -- 避免匿名调用把该 RPC 当成用户名存在性探测器。
    AND (p.email IS NULL OR lower(p.email) LIKE '%@bioquest.local')
  ORDER BY p.created_at NULLS LAST
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

REVOKE ALL ON FUNCTION public.resolve_login_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(TEXT) TO anon, authenticated, service_role;

-- ---------- 2. 新前端：密码校验通过后才返回真实邮箱 ----------
CREATE OR REPLACE FUNCTION public.resolve_login_email_verified(
  p_name TEXT,
  p_password TEXT
)
RETURNS TABLE(
  res_email TEXT,
  res_username TEXT,
  res_ok BOOLEAN
) AS $$
DECLARE
  v_name TEXT := btrim(coalesce(p_name, ''));
  v_email TEXT;
  v_username TEXT;
  v_hash TEXT;
  v_ok BOOLEAN := FALSE;
BEGIN
  -- 空参数直接失败，不区分「用户不存在 / 密码为空」，减少信息面。
  IF v_name = '' OR p_password IS NULL OR p_password = '' THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, FALSE;
    RETURN;
  END IF;

  SELECT
    p.email::TEXT,
    p.username::TEXT,
    u.encrypted_password::TEXT
  INTO v_email, v_username, v_hash
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(p.username) = lower(v_name)
  ORDER BY p.created_at NULLS LAST
  LIMIT 1;

  IF v_username IS NULL THEN
    PERFORM pg_sleep(0.25);
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, FALSE;
    RETURN;
  END IF;

  -- Supabase Auth 默认使用 bcrypt（$2a$ / $2b$）；OAuth-only 或无密码账号 v_hash 为空。
  IF v_hash IS NOT NULL AND v_hash LIKE '$2%' THEN
    v_ok := (crypt(p_password, v_hash) = v_hash);
  ELSE
    v_ok := FALSE;
  END IF;

  IF NOT v_ok THEN
    PERFORM pg_sleep(0.35);
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, FALSE;
    RETURN;
  END IF;

  -- 密码正确：返回该账号在 profiles 中记录的登录邮箱（可能为空/占位）。
  -- 前端拿到后仍会走 signInWithPassword，由 Supabase Auth 做最终校验。
  RETURN QUERY SELECT v_email, v_username, TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

REVOKE ALL ON FUNCTION public.resolve_login_email_verified(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_email_verified(TEXT, TEXT) TO anon, authenticated, service_role;

-- ---------- 3. 迁移记录（migration_tracker 未执行时跳过） ----------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'migration_record'
  ) THEN
    PERFORM public.migration_record(
      'migration_v19',
      '用户名登录 RPC 加固：兼容版只返回占位邮箱；verified 版校验 bcrypt 后才返回真实邮箱'
    );
  END IF;
END $$;

-- ---------- 4. 自检 ----------
-- 4.1 匿名调用 1-arg 版本：真实邮箱账号应返回 res_email = NULL
-- SELECT * FROM public.resolve_login_email('填写一个真实邮箱账号的用户名');
-- 4.2 匿名调用 verified 版本 + 错误密码：应返回 res_ok = false，且无 email
-- SELECT * FROM public.resolve_login_email_verified('填写用户名', 'wrong-password');
