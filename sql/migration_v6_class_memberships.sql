-- ============================================================
-- TATABOX Migration V6 — 班级成员关系表（P0-3 修复 teacher.js localStorage）
-- 解决 PRD §5.11 T-1：「班级数据全部走 Supabase（删除 teacher.js localStorage 模拟）」
-- ============================================================
-- [幂等改造] Issue #143
-- 已确认本文件幂等：CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
-- / RLS 策略用 DO 块 + 表存在性判断 + pg_policies 判断 + EXCEPTION 兜底。
-- 仅加注释说明，未改动任何业务逻辑。
-- ============================================================

-- 班级成员关系表：教师（任何登录用户）添加的学生列表
CREATE TABLE IF NOT EXISTS class_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    student_key TEXT,  -- 8 字符 user_key，便于在没有 student_id 时也能展示
    student_name TEXT, -- 冗余存储：避免每次都 JOIN profiles
    added_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(teacher_id, student_id),
    UNIQUE(teacher_id, student_key)
);

-- 索引：按教师查询
CREATE INDEX IF NOT EXISTS idx_class_memberships_teacher ON class_memberships(teacher_id, added_at DESC);

-- RLS 策略：教师只能管理自己的班级成员关系
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'class_memberships' AND table_schema = 'public') THEN
        ALTER TABLE class_memberships ENABLE ROW LEVEL SECURITY;

        -- 教师可以查看自己添加的所有学生
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'class_memberships_select' AND tablename = 'class_memberships') THEN
            CREATE POLICY "class_memberships_select" ON class_memberships
                FOR SELECT USING (auth.uid() = teacher_id);
        END IF;

        -- 教师可以添加学生到自己的班级
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'class_memberships_insert' AND tablename = 'class_memberships') THEN
            CREATE POLICY "class_memberships_insert" ON class_memberships
                FOR INSERT WITH CHECK (auth.uid() = teacher_id);
        END IF;

        -- 教师可以删除自己班级中的学生
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'class_memberships_delete' AND tablename = 'class_memberships') THEN
            CREATE POLICY "class_memberships_delete" ON class_memberships
                FOR DELETE USING (auth.uid() = teacher_id);
        END IF;

        -- 教师可以更新自己班级中的备注（如 student_name 冗余字段）
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'class_memberships_update' AND tablename = 'class_memberships') THEN
            CREATE POLICY "class_memberships_update" ON class_memberships
                FOR UPDATE USING (auth.uid() = teacher_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 class_memberships RLS: %', SQLERRM;
END $$;

-- ============================================================
-- 验证：列出已创建的表（可选，部署后用于检查）
-- ============================================================
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'class_memberships';

-- ──────────────────────────────────────────────────────────
-- Data API 授权（2026-10-30 起新建表必须显式 GRANT，否则 Data API 401）：本文件授权块，幂等可重跑。
-- 模板取自 Supabase 官方邮件：anon 只读 / authenticated+service_role 读写；
-- 行级隔离由 RLS 策略负责，GRANT 只解决 Data API 可达性。
-- ──────────────────────────────────────────────────────────
GRANT SELECT ON public.class_memberships TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.class_memberships TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

