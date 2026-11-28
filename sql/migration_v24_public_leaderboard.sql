-- ============================================================
-- TATABOX — migration_v24：公开排行榜统计列
-- ------------------------------------------------------------
-- 背景：
--   v18 收紧 profiles 权限后，匿名/普通用户不能再直读 profiles，
--   主站排行榜仍在查 profiles → 线上返回 401，榜单空白。
--   同时 public_profiles 只含 bio_score，缺少「练习量 / 签到」两个
--   榜单需要的 total_answered / current_streak。
--
-- 本迁移只做一件事：把排行榜需要的公开统计列补进 public_profiles。
--   · 仍然不含 email / user_key / device_id 等敏感字段；
--   · 视图使用 owner 权限读取 profiles（security_invoker = off），
--     anon / authenticated 只通过该视图读取公开字段；
--   · 幂等，可重复执行。
--
-- 执行后请刷新一次前端（或等待 PostgREST schema cache 自动重载）。
-- 未执行时前端仍可用 public_profiles 的 bio_score 渲染 Bio 分榜，
-- 「练习量 / 签到」会显示友好升级提示，不会白屏。
-- ============================================================

SET search_path TO public, extensions;

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
  id,
  username,
  display_name,
  avatar_url,
  bio_score,
  user_group,
  cr,
  created_at,
  -- 排行榜公开统计：与 bio_score 一样属于公开学习数据
  practice_count,
  total_answered,
  total_correct,
  accuracy,
  current_streak
FROM public.profiles;

ALTER VIEW public.public_profiles SET (security_invoker = off);
GRANT SELECT ON public.public_profiles TO anon, authenticated, service_role;

-- 让 PostgREST 立即感知视图列变化（否则需等待自动重载）
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'migration_record'
  ) THEN
    PERFORM public.migration_record(
      'migration_v24',
      'public_profiles 补充排行榜公开统计列（练习量/签到），修复 v18 后主站排行榜无法读取的问题'
    );
  END IF;
END $$;
