-- ============================================================
-- migration_v16：用户名登录 RPC resolve_login_email（契约固化）
-- ============================================================
-- 背景：
--   profiles 表收紧为「仅本人可读」后，用户名登录改走 SECURITY DEFINER 的
--   窄 RPC resolve_login_email。v5.2.11 时该函数只在 Supabase Dashboard
--   手工创建过，仓库里没有定义——部署顺序一旦颠倒，登录会退化为
--   「用户名不存在」或丢掉「未绑定邮箱」引导。
--
-- 契约（与 js/core/supabase-client.js 一致）：
--   * 入参 p_name 按 lower(username) 大小写不敏感精确匹配；
--   * 命中用户名即返回一行，res_email 可为 NULL（注册未填邮箱的历史账号）；
--     ——前端据此生成 @bioquest.local 占位邮箱候选并给出引导文案；
--   * 未命中返回 0 行；
--   * 只回 res_email / res_username 两列，不回吐其他字段。
--
-- 部署顺序：本文件（及 v17）必须先于前端代码执行。
-- 执行：Supabase SQL Editor 整文件粘贴（幂等，可重复执行）。
-- ============================================================

SET search_path TO public, extensions;

CREATE OR REPLACE FUNCTION public.resolve_login_email(p_name TEXT)
RETURNS TABLE(res_email TEXT, res_username TEXT) AS $$
DECLARE
  v_name TEXT := btrim(coalesce(p_name, ''));
BEGIN
  IF v_name = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.email::TEXT, p.username::TEXT
  FROM public.profiles p
  WHERE lower(p.username) = lower(v_name)
  ORDER BY p.created_at NULLS LAST
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 登录发生在认证之前，anon 必须可执行；收回 PUBLIC 默认授权
REVOKE ALL ON FUNCTION public.resolve_login_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(TEXT) TO anon, authenticated, service_role;

SELECT public.migration_record('migration_v16', '用户名登录 RPC resolve_login_email 契约固化（email 可为 NULL）');

-- 自检（应返回 1 行，email 可为空；无此用户名时 0 行）：
-- SELECT * FROM public.resolve_login_email('填写一个已存在用户名');
