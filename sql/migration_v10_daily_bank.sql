-- ============================================================
-- migration_v10_daily_bank.sql — 每日亿题专属题库表
-- ------------------------------------------------------------
-- 需求：每日亿题的题库必须是一个「单独的题库」，不能与其他题库
-- （练习 / 模考 / 课堂共用的 questions 表）串在一起。
-- 本迁移新建独立表 daily_questions（结构对齐 questions），
-- 上传脚本将 data/bank/daily_league_*.json 只写入该表，
-- 前端每日亿题只从该表取题，练习 / 模考等继续只读 questions。
-- 幂等：IF NOT EXISTS / 策略仅当不存在时创建。
-- ============================================================

-- 1) 专属题库表
CREATE TABLE IF NOT EXISTS daily_questions (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'mtf',
  question TEXT NOT NULL DEFAULT '',
  subject TEXT DEFAULT '',
  concept TEXT DEFAULT '',
  difficulty TEXT DEFAULT 'medium',
  answer TEXT DEFAULT '',
  explanation TEXT DEFAULT '',
  options JSONB DEFAULT '[]'::jsonb,
  sub_questions JSONB DEFAULT '[]'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  chart TEXT DEFAULT '',
  year INT DEFAULT NULL,
  source TEXT DEFAULT 'data/bank-daily',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2) 索引
CREATE INDEX IF NOT EXISTS idx_daily_questions_module ON daily_questions(module);

-- 3) RLS：所有人可读，管理员可增删改（与 questions 一致）
ALTER TABLE daily_questions ENABLE ROW LEVEL SECURITY;
SELECT bioquest_create_policy('daily_questions', 'daily_questions_select', 'SELECT', 'true');
SELECT bioquest_create_policy('daily_questions', 'daily_questions_insert_admin', 'INSERT', NULL,
  'bioquest_is_admin()');
SELECT bioquest_create_policy('daily_questions', 'daily_questions_update_admin', 'UPDATE',
  'bioquest_is_admin()');
SELECT bioquest_create_policy('daily_questions', 'daily_questions_delete_admin', 'DELETE',
  'bioquest_is_admin()');

-- ──────────────────────────────────────────────────────────
-- Data API 授权（2026-10-30 起新建表必须显式 GRANT，否则 Data API 401）：本文件授权块，幂等可重跑。
-- 模板取自 Supabase 官方邮件：anon 只读 / authenticated+service_role 读写；
-- 行级隔离由 RLS 策略负责，GRANT 只解决 Data API 可达性。
-- ──────────────────────────────────────────────────────────
GRANT SELECT ON public.daily_questions TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.daily_questions TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

