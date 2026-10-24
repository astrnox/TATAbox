-- ============================================================
-- TATABOX — Migration Tracker（迁移版本追踪）
-- GitHub Issue #143：保证 SQL migration 幂等，避免重复执行报错
--
-- 用途：
--   1) 建表 migration_log 记录「每个已成功应用的迁移版本」；
--   2) 提供幂等的记录函数 migration_record(version, description)，
--      同一 version 只记录一次，重复调用不报错、不产生重复行；
--   3) 结合 DO ... $$ ... $$ + IF NOT EXISTS 方式实现整体幂等。
-- ============================================================

-- 幂等创建版本追踪表：重复执行 CREATE 不报错（IF NOT EXISTS 保证）
CREATE TABLE IF NOT EXISTS migration_log (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT
);

-- Issue #100：迁移追踪表同样启用 RLS（仅 service_role/owner 可读写，
-- anon 无策略 → 默认拒绝），保持"所有 public 表全量受保护"的审计一致性。
ALTER TABLE public.migration_log ENABLE ROW LEVEL SECURITY;

-- 幂等记录函数：同一 version 只记录一次
-- 用法：SELECT public.migration_record('migration_v2', '补齐列、建表、种子数据');
CREATE OR REPLACE FUNCTION public.migration_record(
  p_version TEXT,
  p_description TEXT DEFAULT ''
)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.migration_log WHERE version = p_version) THEN
    INSERT INTO public.migration_log (version, description)
    VALUES (p_version, p_description);
  ELSE
    RAISE NOTICE 'migration % 已记录，跳过', p_version;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 备用幂等插入方式（等价，适合不建函数、仅需记录的场景）：
-- INSERT INTO migration_log (version, description)
-- SELECT 'migration_v2', '补齐列、建表、种子数据'
-- WHERE NOT EXISTS (SELECT 1 FROM migration_log WHERE version = 'migration_v2');

-- 查询当前已应用的最高迁移版本：
-- SELECT COALESCE(MAX(version), '0') AS current_version FROM migration_log;

-- ──────────────────────────────────────────────────────────
-- Data API 授权（2026-10-30 起新建表必须显式 GRANT，否则 Data API 401）：本文件授权块，幂等可重跑。
-- 模板取自 Supabase 官方邮件：anon 只读 / authenticated+service_role 读写；
-- 行级隔离由 RLS 策略负责，GRANT 只解决 Data API 可达性。
-- ──────────────────────────────────────────────────────────
GRANT SELECT ON public.migration_log TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.migration_log TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

