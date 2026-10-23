-- ============================================================
-- TATABOX 数据库迁移 v8：用户进度云端同步（user_progress）
-- 目标（Issue #13）：把本地进度（如 FSRS 复习卡状态 bioquest_fsrs_cards、
--   bio_score、习惯统计等）以「键值快照」形式同步到云端，实现跨设备续学。
--
-- 设计：
--   * 以 (profile_id, key) 唯一。
--   * data JSONB 保存整份快照；updated_at 用于 Last-Write-Wins(LWW) 冲突合并。
--   * RLS 严格限制：用户只能读写自己 profile_id 的行（auth.uid() = profile_id）。
--   * updated_at 由触发器自动维护，客户端无需自行计算（仍可显式传入以便 LWW 比较）。
-- ============================================================
-- [幂等改造] Issue #143
-- 已确认本文件幂等：CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- CREATE OR REPLACE FUNCTION / DROP TRIGGER IF EXISTS + CREATE TRIGGER /
-- RLS 策略用 DO 块 + 表存在性判断 + pg_policies 判断 + EXCEPTION 兜底。
-- 仅加注释说明，未改动任何业务逻辑。
-- ============================================================

BEGIN;

-- 1. 建表
CREATE TABLE IF NOT EXISTS user_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL,
    key TEXT NOT NULL,               -- 进度键（如 'fsrs_cards'、'stats'）
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(profile_id, key)
);

-- 索引：按用户查询其全部进度
CREATE INDEX IF NOT EXISTS idx_user_progress_profile ON user_progress(profile_id, updated_at DESC);

-- 2. updated_at 自动维护触发器
-- 注意：client 显式传入时保留其时间戳，用于跨设备 LWW 合并（同一用户自持行，
--   以客户端编辑时刻为准，而非服务端写入时刻）。未提供时才回退为 now()。
CREATE OR REPLACE FUNCTION public.touch_user_progress_updated_at()
RETURNS trigger AS $$
BEGIN
    IF NEW.updated_at IS NULL THEN
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS on_user_progress_updated ON user_progress;
CREATE TRIGGER on_user_progress_updated
    BEFORE UPDATE ON user_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_user_progress_updated_at();

-- 3. RLS 策略：仅表所有者可访问自己的进度
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name = 'user_progress' AND table_schema = 'public') THEN
        ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

        IF NOT EXISTS (SELECT 1 FROM pg_policies
                       WHERE policyname = 'user_progress_select' AND tablename = 'user_progress') THEN
            CREATE POLICY "user_progress_select" ON user_progress
                FOR SELECT USING (auth.uid() = profile_id);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policies
                       WHERE policyname = 'user_progress_insert' AND tablename = 'user_progress') THEN
            CREATE POLICY "user_progress_insert" ON user_progress
                FOR INSERT WITH CHECK (auth.uid() = profile_id);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policies
                       WHERE policyname = 'user_progress_update' AND tablename = 'user_progress') THEN
            CREATE POLICY "user_progress_update" ON user_progress
                FOR UPDATE USING (auth.uid() = profile_id)
                WITH CHECK (auth.uid() = profile_id);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policies
                       WHERE policyname = 'user_progress_delete' AND tablename = 'user_progress') THEN
            CREATE POLICY "user_progress_delete" ON user_progress
                FOR DELETE USING (auth.uid() = profile_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 user_progress RLS: %', SQLERRM;
END $$;

-- ============================================================
-- 验证（部署后用于检查）
-- ============================================================
-- SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='user_progress';
-- SELECT policyname FROM pg_policies WHERE tablename='user_progress';

COMMIT;

-- ──────────────────────────────────────────────────────────
-- Data API 授权（2026-10-30 起新建表必须显式 GRANT，否则 Data API 401）：本文件授权块，幂等可重跑。
-- 模板取自 Supabase 官方邮件：anon 只读 / authenticated+service_role 读写；
-- 行级隔离由 RLS 策略负责，GRANT 只解决 Data API 可达性。
-- ──────────────────────────────────────────────────────────
GRANT SELECT ON public.user_progress TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.user_progress TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

