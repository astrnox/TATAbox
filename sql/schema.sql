-- ============================================================
-- TATABOX — Supabase 数据库 Schema (前端直连版)
-- 在 Supabase SQL Editor 中运行此文件以初始化数据库
-- ============================================================
-- [幂等改造] Issue #143
-- 已确认本文件幂等：CREATE TABLE/EXTENSION/INDEX 均带 IF NOT EXISTS、
-- CREATE OR REPLACE FUNCTION、DROP TRIGGER IF EXISTS + CREATE TRIGGER，
-- RLS 策略经 bioquest_create_policy() 存在性判断后再创建。
-- 文件较大且已幂等，保持原样不改动，以免引入回归。
-- ============================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 用户档案表 (关联 Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT DEFAULT 'TATABOX User',
  avatar_url TEXT,
  bio_score INTEGER DEFAULT 0,
  practice_count INTEGER DEFAULT 0,
  total_answered INTEGER DEFAULT 0,
  total_correct INTEGER DEFAULT 0,
  accuracy DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 自动创建 profile 触发器（使用 SECURITY DEFINER 绕过 RLS）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 错题本表
-- ============================================================
CREATE TABLE IF NOT EXISTS wrong_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  question_id INT NOT NULL,
  module_num INT NOT NULL,
  question_text TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  wrong_count INT DEFAULT 1,
  extra_data TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, question_id)
);

-- ============================================================
-- 收藏夹表
-- ============================================================
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  question_id INT NOT NULL,
  module_num INT NOT NULL,
  question_text TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, question_id)
);

-- ============================================================
-- 练习记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS practice_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  question_id INT NOT NULL,
  module_num INT NOT NULL,
  subject TEXT,
  user_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score DECIMAL NOT NULL DEFAULT 0,
  duration INT DEFAULT 0,
  is_correct BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 题库表
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
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
  source TEXT DEFAULT 'data',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 知识卡片表
-- ============================================================
CREATE TABLE IF NOT EXISTS cards (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 学习资源表
-- ============================================================
CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  source TEXT DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  link TEXT DEFAULT '',
  excerpt TEXT DEFAULT '',
  tag TEXT DEFAULT '',
  category TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 公告表
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  is_pinned BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 社区帖子表
-- ============================================================
CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT,
  content TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 帖子点赞表
CREATE TABLE IF NOT EXISTS community_post_likes (
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- 帖子评论表
CREATE TABLE IF NOT EXISTS community_comments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 用户禁言表
CREATE TABLE IF NOT EXISTS community_mutes (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT DEFAULT '',
  muted_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_wrong_questions_profile ON wrong_questions(profile_id);
CREATE INDEX IF NOT EXISTS idx_favorites_profile ON favorites(profile_id);
CREATE INDEX IF NOT EXISTS idx_practice_records_profile ON practice_records(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_module ON questions(module);
CREATE INDEX IF NOT EXISTS idx_cards_category ON cards(category);
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
CREATE INDEX IF NOT EXISTS idx_posts_author ON community_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON community_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);

-- ============================================================
-- RLS 策略 — 允许匿名读取，认证用户操作自己的数据
-- ============================================================

-- 辅助函数：安全创建策略（仅当不存在时）
CREATE OR REPLACE FUNCTION bioquest_create_policy(
  p_table TEXT, p_name TEXT, p_op TEXT, p_using TEXT DEFAULT NULL, p_check TEXT DEFAULT NULL
) RETURNS void AS $policy_func$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = p_name AND tablename = p_table) THEN
    IF p_op = 'SELECT' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (%s)', p_name, p_table, p_using);
    ELSIF p_op = 'INSERT' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (%s)', p_name, p_table, p_check);
    ELSIF p_op = 'UPDATE' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (%s)', p_name, p_table, p_using);
    ELSIF p_op = 'DELETE' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (%s)', p_name, p_table, p_using);
    END IF;
  END IF;
END;
$policy_func$ LANGUAGE plpgsql;

-- profiles: 所有人可读，用户可更新自己的
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
SELECT bioquest_create_policy('profiles', 'profiles_select_policy', 'SELECT', 'true');
SELECT bioquest_create_policy('profiles', 'profiles_insert_policy', 'INSERT', NULL, 'auth.uid() = id');
SELECT bioquest_create_policy('profiles', 'profiles_update_policy', 'UPDATE', 'auth.uid() = id');

-- wrong_questions: 用户只能操作自己的数据
ALTER TABLE wrong_questions ENABLE ROW LEVEL SECURITY;
SELECT bioquest_create_policy('wrong_questions', 'wrong_questions_select', 'SELECT', 'auth.uid() = profile_id');
SELECT bioquest_create_policy('wrong_questions', 'wrong_questions_insert', 'INSERT', NULL, 'auth.uid() = profile_id');
SELECT bioquest_create_policy('wrong_questions', 'wrong_questions_update', 'UPDATE', 'auth.uid() = profile_id');
SELECT bioquest_create_policy('wrong_questions', 'wrong_questions_delete', 'DELETE', 'auth.uid() = profile_id');

-- favorites: 用户只能操作自己的数据
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
SELECT bioquest_create_policy('favorites', 'favorites_select', 'SELECT', 'auth.uid() = profile_id');
SELECT bioquest_create_policy('favorites', 'favorites_insert', 'INSERT', NULL, 'auth.uid() = profile_id');
SELECT bioquest_create_policy('favorites', 'favorites_delete', 'DELETE', 'auth.uid() = profile_id');

-- practice_records: 用户只能操作自己的数据
ALTER TABLE practice_records ENABLE ROW LEVEL SECURITY;
SELECT bioquest_create_policy('practice_records', 'practice_records_select', 'SELECT', 'auth.uid() = profile_id');
SELECT bioquest_create_policy('practice_records', 'practice_records_insert', 'INSERT', NULL, 'auth.uid() = profile_id');

-- questions/cards/resources: 所有人可读，管理员可增删改
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
SELECT bioquest_create_policy('questions', 'questions_select', 'SELECT', 'true');
SELECT bioquest_create_policy('cards', 'cards_select', 'SELECT', 'true');
SELECT bioquest_create_policy('resources', 'resources_select', 'SELECT', 'true');

-- Admin helper: 检查当前用户是否为管理员
-- 通过查询 profiles 表中当前用户的 user_group 是否为 'admin'
CREATE OR REPLACE FUNCTION bioquest_is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND user_group = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 题目表管理员策略
SELECT bioquest_create_policy('questions', 'questions_insert_admin', 'INSERT', NULL,
  'bioquest_is_admin()');
SELECT bioquest_create_policy('questions', 'questions_update_admin', 'UPDATE',
  'bioquest_is_admin()');
SELECT bioquest_create_policy('questions', 'questions_delete_admin', 'DELETE',
  'bioquest_is_admin()');

-- 卡片表管理员策略
SELECT bioquest_create_policy('cards', 'cards_insert_admin', 'INSERT', NULL,
  'bioquest_is_admin()');
SELECT bioquest_create_policy('cards', 'cards_update_admin', 'UPDATE',
  'bioquest_is_admin()');
SELECT bioquest_create_policy('cards', 'cards_delete_admin', 'DELETE',
  'bioquest_is_admin()');

-- 资源表管理员策略
SELECT bioquest_create_policy('resources', 'resources_insert_admin', 'INSERT', NULL,
  'bioquest_is_admin()');
SELECT bioquest_create_policy('resources', 'resources_update_admin', 'UPDATE',
  'bioquest_is_admin()');
SELECT bioquest_create_policy('resources', 'resources_delete_admin', 'DELETE',
  'bioquest_is_admin()');

-- profiles: 管理员可更新/删除任意用户
SELECT bioquest_create_policy('profiles', 'profiles_update_admin', 'UPDATE',
  'bioquest_is_admin()');
SELECT bioquest_create_policy('profiles', 'profiles_delete_admin', 'DELETE',
  'bioquest_is_admin()');

-- community_posts: 所有人可读，认证用户可发帖，管理员可管理任意帖子
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
SELECT bioquest_create_policy('community_posts', 'posts_select', 'SELECT', 'true');
SELECT bioquest_create_policy('community_posts', 'posts_insert', 'INSERT', NULL, 'auth.uid() = author_id');
SELECT bioquest_create_policy('community_posts', 'posts_update', 'UPDATE', 'auth.uid() = author_id');
SELECT bioquest_create_policy('community_posts', 'posts_delete', 'DELETE', 'auth.uid() = author_id');
-- 管理员可管理任意帖子
SELECT bioquest_create_policy('community_posts', 'posts_update_admin', 'UPDATE', 'bioquest_is_admin()');
SELECT bioquest_create_policy('community_posts', 'posts_delete_admin', 'DELETE', 'bioquest_is_admin()');

-- community_post_likes
ALTER TABLE community_post_likes ENABLE ROW LEVEL SECURITY;
SELECT bioquest_create_policy('community_post_likes', 'likes_select', 'SELECT', 'true');
SELECT bioquest_create_policy('community_post_likes', 'likes_insert', 'INSERT', NULL, 'auth.uid() = user_id');
SELECT bioquest_create_policy('community_post_likes', 'likes_delete', 'DELETE', 'auth.uid() = user_id');

-- community_comments: 所有人可读，认证用户可发评论，管理员可删除任意评论
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
SELECT bioquest_create_policy('community_comments', 'comments_select', 'SELECT', 'true');
SELECT bioquest_create_policy('community_comments', 'comments_insert', 'INSERT', NULL, 'auth.uid() = author_id');
SELECT bioquest_create_policy('community_comments', 'comments_delete', 'DELETE', 'auth.uid() = author_id');
-- 管理员可删除任意评论
SELECT bioquest_create_policy('community_comments', 'comments_delete_admin', 'DELETE', 'bioquest_is_admin()');

-- community_mutes: 所有人可读，管理员可管理禁言
ALTER TABLE community_mutes ENABLE ROW LEVEL SECURITY;
SELECT bioquest_create_policy('community_mutes', 'mutes_select', 'SELECT', 'true');
-- 管理员可添加/删除禁言
SELECT bioquest_create_policy('community_mutes', 'mutes_insert_admin', 'INSERT', NULL, 'bioquest_is_admin()');
SELECT bioquest_create_policy('community_mutes', 'mutes_delete_admin', 'DELETE', 'bioquest_is_admin()');

-- announcements: 所有人可读，管理员可增删改
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
SELECT bioquest_create_policy('announcements', 'announcements_select', 'SELECT', 'true');
SELECT bioquest_create_policy('announcements', 'announcements_insert_admin', 'INSERT', NULL, 'bioquest_is_admin()');
SELECT bioquest_create_policy('announcements', 'announcements_update_admin', 'UPDATE', 'bioquest_is_admin()');
SELECT bioquest_create_policy('announcements', 'announcements_delete_admin', 'DELETE', 'bioquest_is_admin()');

-- ──────────────────────────────────────────────────────────
-- Data API 授权（2026-10-30 起新建表必须显式 GRANT，否则 Data API 401）：本文件授权块，幂等可重跑。
-- 模板取自 Supabase 官方邮件：anon 只读 / authenticated+service_role 读写；
-- 行级隔离由 RLS 策略负责，GRANT 只解决 Data API 可达性。
-- ──────────────────────────────────────────────────────────
GRANT SELECT ON public.profiles TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated, service_role;
GRANT SELECT ON public.wrong_questions TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.wrong_questions TO authenticated, service_role;
GRANT SELECT ON public.favorites TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.favorites TO authenticated, service_role;
GRANT SELECT ON public.practice_records TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.practice_records TO authenticated, service_role;
GRANT SELECT ON public.questions TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.questions TO authenticated, service_role;
GRANT SELECT ON public.cards TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.cards TO authenticated, service_role;
GRANT SELECT ON public.resources TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.resources TO authenticated, service_role;
GRANT SELECT ON public.announcements TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.announcements TO authenticated, service_role;
GRANT SELECT ON public.community_posts TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_posts TO authenticated, service_role;
GRANT SELECT ON public.community_post_likes TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_post_likes TO authenticated, service_role;
GRANT SELECT ON public.community_comments TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_comments TO authenticated, service_role;
GRANT SELECT ON public.community_mutes TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_mutes TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

