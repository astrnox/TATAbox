-- ============================================================
-- migration_v12_leaderboard_privacy.sql
-- TATABOX lite 排行榜（设计方案 v2 §5.4 / §9）
--   1) profiles 增加隐私两布尔位 + 本周真值列（wk_*）
--   2) weekly_leaderboard 视图：服务端脱敏周榜（昵称 / 匿名代号）
--   3) leader_my_label RPC：本人匿名代号（周内稳定、跨周更换）
-- ============================================================
-- 幂等：全部 IF NOT EXISTS / DO $$ 条件判断；可重复执行。
-- 运行位置：Supabase SQL Editor。

-- ---------- 1. profiles 扩展 ----------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS leader_anon boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS leader_optout boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wk_key text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wk_practice integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wk_review integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_profiles_wk ON public.profiles(wk_key, wk_practice DESC);

-- 隐私列自改：用户只能改自己的两布尔位（wk_* 由 Lite 端写本周真值，同样限定本人）
DROP POLICY IF EXISTS profiles_privacy_update ON public.profiles;
CREATE POLICY profiles_privacy_update ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ---------- 2. 匿名代号盐（服务端保存，客户端不可得） ----------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.lb_salt (
  id smallint PRIMARY KEY DEFAULT 1,
  salt text NOT NULL,
  created_at timestamptz DEFAULT now()
);
INSERT INTO public.lb_salt (id, salt)
VALUES (1, md5(random()::text || clock_timestamp()::text))
ON CONFLICT (id) DO NOTHING;
REVOKE ALL ON public.lb_salt FROM anon, authenticated, public;
-- RLS 全锁：不建任何 POLICY，anon/authenticated 一律读不到盐值；
-- 表属主(视图/函数的定义者)不受 RLS 约束，故 weekly_leaderboard 仍可正常取盐。
ALTER TABLE public.lb_salt ENABLE ROW LEVEL SECURITY;

-- 周键：Asia/Shanghai 自然周（周一 00:00），格式 YYYY-MM-DD
CREATE OR REPLACE FUNCTION public.lb_week_key()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char(date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD');
$$;

-- 匿名代号：同学 #XXXX（同一用户 + 同一周 → 稳定；跨周更换；
-- 含盐哈希单向，不可反推 user_id；不下发任何用户标识）
CREATE OR REPLACE FUNCTION public.lb_pseudonym(p_user_id uuid, p_week_key text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT '同学 #' || upper(substring(
    encode(sha256((p_user_id::text || '|' || p_week_key || '|' || s.salt)::bytea), 'hex')
    from 1 for 4))
  FROM public.lb_salt s WHERE s.id = 1;
$$;

-- ---------- 3. 周榜视图（服务端脱敏） ----------
-- 语义：leader_optout = 退出榜（不出现）；leader_anon = 匿名代号；
--       wk_key 必须等于当前周，过期行自然失效（"每周一重置"）。
DROP VIEW IF EXISTS public.weekly_leaderboard;
CREATE VIEW public.weekly_leaderboard AS
SELECT
  CASE WHEN p.leader_anon THEN public.lb_pseudonym(p.id, public.lb_week_key())
       ELSE coalesce(nullif(p.display_name, ''), p.username, '同学') END AS label,
  p.leader_anon AS anon,
  p.wk_practice,
  p.wk_review,
  -- 仅供客户端定位"哪一行是我"：布尔值不含任何可反推信息，
  -- 未登录（auth.uid() 为空）时恒 false；服务端不做任何行级信任
  (p.id = auth.uid()) AS is_me
FROM public.profiles p
WHERE p.leader_optout = false
  AND p.wk_key = public.lb_week_key()
  AND (p.wk_practice > 0 OR p.wk_review > 0);

GRANT SELECT ON public.weekly_leaderboard TO anon, authenticated;

-- ---------- 4. 本人匿名代号 RPC ----------
-- SECURITY INVOKER：只能取自己的代号；无跨用户信息面。
CREATE OR REPLACE FUNCTION public.leader_my_label()
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT public.lb_pseudonym(auth.uid(), public.lb_week_key())
  WHERE auth.uid() IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION public.leader_my_label() TO authenticated;

-- ---------- 5. 迁移记录（若 migration_log 存在） ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'migration_log' AND table_schema = 'public') THEN
    INSERT INTO public.migration_log (version, description)
    VALUES ('v12', 'leaderboard privacy: anon/optout + weekly view + my label RPC')
    ON CONFLICT DO NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '跳过 migration_log 记录: %', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────
-- Data API 授权（2026-10-30 起新建表必须显式 GRANT，否则 Data API 401）：本文件授权块，幂等可重跑。
-- 模板取自 Supabase 官方邮件：anon 只读 / authenticated+service_role 读写；
-- 行级隔离由 RLS 策略负责，GRANT 只解决 Data API 可达性。
-- ──────────────────────────────────────────────────────────
GRANT SELECT ON public.lb_salt TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.lb_salt TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

