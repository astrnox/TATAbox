-- ============================================================
-- TATABOX Migration v5: 社区帖子举报功能
-- 创建 community_reports 表，允许用户举报帖子，管理员在后台查看
-- ============================================================
-- [幂等改造] Issue #143
-- 已确认本文件幂等：CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
-- / DROP POLICY IF EXISTS + CREATE POLICY。仅加注释说明，未改动任何业务逻辑。
-- ============================================================

-- 举报表
CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'pending', -- pending / dismissed / resolved
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, reporter_id) -- 每个用户对同一帖子只能举报一次
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_reports_post ON community_reports(post_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON community_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created ON community_reports(created_at DESC);

-- RLS 策略
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;

-- 认证用户可以提交举报（INSERT）
DROP POLICY IF EXISTS "reports_insert" ON community_reports;
CREATE POLICY "reports_insert" ON community_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- 用户可以查看自己的举报（SELECT）
DROP POLICY IF EXISTS "reports_select_own" ON community_reports;
CREATE POLICY "reports_select_own" ON community_reports
  FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id);

-- 管理员可以查看所有举报
DROP POLICY IF EXISTS "reports_select_admin" ON community_reports;
CREATE POLICY "reports_select_admin" ON community_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_group = 'admin'
    )
  );

-- 管理员可以更新举报状态（dismiss/resolve）
DROP POLICY IF EXISTS "reports_update_admin" ON community_reports;
CREATE POLICY "reports_update_admin" ON community_reports
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_group = 'admin'
    )
  );

-- 管理员可以删除举报
DROP POLICY IF EXISTS "reports_delete_admin" ON community_reports;
CREATE POLICY "reports_delete_admin" ON community_reports
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_group = 'admin'
    )
  );

-- ──────────────────────────────────────────────────────────
-- Data API 授权（2026-10-30 起新建表必须显式 GRANT，否则 Data API 401）：本文件授权块，幂等可重跑。
-- 模板取自 Supabase 官方邮件：anon 只读 / authenticated+service_role 读写；
-- 行级隔离由 RLS 策略负责，GRANT 只解决 Data API 可达性。
-- ──────────────────────────────────────────────────────────
GRANT SELECT ON public.community_reports TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_reports TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

