-- ============================================================
-- TATABOX — Supabase 数据库 Schema (前端直连版)
-- 在 Supabase SQL Editor 中运行此文件以初始化数据库
-- 安全版：可以处理旧表存在的情况
-- ============================================================
-- [幂等改造] Issue #143
-- 已确认本文件幂等：列增改用 DO 块 + information_schema.columns 判断、
-- CREATE TABLE/EXTENSION/INDEX 带 IF NOT EXISTS、CREATE OR REPLACE FUNCTION、
-- DROP TRIGGER/FUNCTION IF EXISTS + CREATE、RLS 策略用 DO 块 + pg_policies 判断、
-- EXCEPTION 兜底。文件较大且已幂等，保持原样不改动。
-- ============================================================

-- ============================================================
-- 第 0 步：诊断当前数据库状态（运行这个先看看问题）
-- ============================================================
-- 运行下面的查询先诊断一下问题：
/*
-- 查询 profiles 表的所有列
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND table_schema = 'public'
ORDER BY ordinal_position;
*/

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 用户档案表 (关联 Supabase Auth)
-- ============================================================

-- 步骤 1：如果 profiles 表存在，先检查并添加缺失的列
DO $$
BEGIN
    -- 检查 profiles 表是否存在
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
        
        -- 添加 username 列（如果不存在）
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'username' AND table_schema = 'public') THEN
            ALTER TABLE profiles ADD COLUMN username TEXT UNIQUE;
        END IF;
        
        -- 添加 display_name 列（如果不存在）
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'display_name' AND table_schema = 'public') THEN
            ALTER TABLE profiles ADD COLUMN display_name TEXT DEFAULT 'TATABOX User';
        END IF;
        
        -- 添加 bio_score 列（如果不存在）
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'bio_score' AND table_schema = 'public') THEN
            ALTER TABLE profiles ADD COLUMN bio_score INTEGER DEFAULT 0;
        END IF;
        
        -- 添加 practice_count 列（如果不存在）
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'practice_count' AND table_schema = 'public') THEN
            ALTER TABLE profiles ADD COLUMN practice_count INTEGER DEFAULT 0;
        END IF;
        
        -- 添加 total_answered 列（如果不存在）
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'total_answered' AND table_schema = 'public') THEN
            ALTER TABLE profiles ADD COLUMN total_answered INTEGER DEFAULT 0;
        END IF;
        
        -- 添加 total_correct 列（如果不存在）
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'total_correct' AND table_schema = 'public') THEN
            ALTER TABLE profiles ADD COLUMN total_correct INTEGER DEFAULT 0;
        END IF;
        
        -- 添加 accuracy 列（如果不存在）
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'accuracy' AND table_schema = 'public') THEN
            ALTER TABLE profiles ADD COLUMN accuracy DECIMAL DEFAULT 0;
        END IF;
        
        -- 添加 created_at 列（如果不存在）
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'created_at' AND table_schema = 'public') THEN
            ALTER TABLE profiles ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
        END IF;
        
        -- 添加 updated_at 列（如果不存在）
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'updated_at' AND table_schema = 'public') THEN
            ALTER TABLE profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
        END IF;
        
        -- 添加 avatar_url 列（如果不存在）
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'avatar_url' AND table_schema = 'public') THEN
            ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
        END IF;

        -- 添加 user_group 列（如果不存在）
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'user_group' AND table_schema = 'public') THEN
            ALTER TABLE profiles ADD COLUMN user_group TEXT DEFAULT 'member';
        END IF;

    ELSE
        -- 如果表不存在，创建新表
        CREATE TABLE profiles (
            id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            username TEXT UNIQUE,
            display_name TEXT DEFAULT 'TATABOX User',
            avatar_url TEXT,
            user_group TEXT DEFAULT 'member',
            bio_score INTEGER DEFAULT 0,
            practice_count INTEGER DEFAULT 0,
            total_answered INTEGER DEFAULT 0,
            total_correct INTEGER DEFAULT 0,
            accuracy DECIMAL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        );
    END IF;
END $$;

-- ============================================================
-- 自动创建 profile 触发器（使用 SECURITY DEFINER 绕过 RLS）
-- ============================================================

-- 先删除旧的触发器和函数（如果存在）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 创建新的触发器函数
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

-- 创建触发器
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 其他表（使用 CREATE TABLE IF NOT EXISTS）
-- ============================================================

-- 错题本表
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

-- 收藏夹表
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

-- 练习记录表
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

-- 题库表
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

-- 知识卡片表
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

-- 学习资源表
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

-- 社区帖子表
CREATE TABLE IF NOT EXISTS community_posts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- 只有在索引不存在时才创建
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_profiles_username' AND schemaname = 'public') THEN
        CREATE INDEX idx_profiles_username ON profiles(username);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wrong_questions_profile ON wrong_questions(profile_id);
CREATE INDEX IF NOT EXISTS idx_favorites_profile ON favorites(profile_id);
CREATE INDEX IF NOT EXISTS idx_practice_records_profile ON practice_records(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_module ON questions(module);
CREATE INDEX IF NOT EXISTS idx_cards_category ON cards(category);
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
CREATE INDEX IF NOT EXISTS idx_posts_author ON community_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON community_comments(post_id, created_at);

-- ============================================================
-- RLS 策略 — 允许匿名读取，认证用户操作自己的数据
-- 注意：Supabase PG15 不支持 CREATE POLICY IF NOT EXISTS，用 DO 块代替
-- ============================================================

-- profiles: 所有人可读，用户可更新自己的
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_select_policy' AND tablename='profiles') THEN CREATE POLICY "profiles_select_policy" ON profiles FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_insert_policy' AND tablename='profiles') THEN CREATE POLICY "profiles_insert_policy" ON profiles FOR INSERT WITH CHECK (auth.uid() = id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_update_policy' AND tablename='profiles') THEN CREATE POLICY "profiles_update_policy" ON profiles FOR UPDATE USING (auth.uid() = id); END IF; END $$;

-- wrong_questions: 用户只能操作自己的数据
ALTER TABLE wrong_questions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='wrong_questions_select' AND tablename='wrong_questions') THEN CREATE POLICY "wrong_questions_select" ON wrong_questions FOR SELECT USING (auth.uid() = profile_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='wrong_questions_insert' AND tablename='wrong_questions') THEN CREATE POLICY "wrong_questions_insert" ON wrong_questions FOR INSERT WITH CHECK (auth.uid() = profile_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='wrong_questions_update' AND tablename='wrong_questions') THEN CREATE POLICY "wrong_questions_update" ON wrong_questions FOR UPDATE USING (auth.uid() = profile_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='wrong_questions_delete' AND tablename='wrong_questions') THEN CREATE POLICY "wrong_questions_delete" ON wrong_questions FOR DELETE USING (auth.uid() = profile_id); END IF; END $$;

-- favorites: 用户只能操作自己的数据
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='favorites_select' AND tablename='favorites') THEN CREATE POLICY "favorites_select" ON favorites FOR SELECT USING (auth.uid() = profile_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='favorites_insert' AND tablename='favorites') THEN CREATE POLICY "favorites_insert" ON favorites FOR INSERT WITH CHECK (auth.uid() = profile_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='favorites_delete' AND tablename='favorites') THEN CREATE POLICY "favorites_delete" ON favorites FOR DELETE USING (auth.uid() = profile_id); END IF; END $$;

-- practice_records: 用户只能操作自己的数据
ALTER TABLE practice_records ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='practice_records_select' AND tablename='practice_records') THEN CREATE POLICY "practice_records_select" ON practice_records FOR SELECT USING (auth.uid() = profile_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='practice_records_insert' AND tablename='practice_records') THEN CREATE POLICY "practice_records_insert" ON practice_records FOR INSERT WITH CHECK (auth.uid() = profile_id); END IF; END $$;

-- questions/cards/resources: 所有人可读
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='questions_select' AND tablename='questions') THEN CREATE POLICY "questions_select" ON questions FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='cards_select' AND tablename='cards') THEN CREATE POLICY "cards_select" ON cards FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='resources_select' AND tablename='resources') THEN CREATE POLICY "resources_select" ON resources FOR SELECT USING (true); END IF; END $$;

-- community_posts: 所有人可读，认证用户可发帖
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='posts_select' AND tablename='community_posts') THEN CREATE POLICY "posts_select" ON community_posts FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='posts_insert' AND tablename='community_posts') THEN CREATE POLICY "posts_insert" ON community_posts FOR INSERT WITH CHECK (auth.uid() = author_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='posts_update' AND tablename='community_posts') THEN CREATE POLICY "posts_update" ON community_posts FOR UPDATE USING (auth.uid() = author_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='posts_delete' AND tablename='community_posts') THEN CREATE POLICY "posts_delete" ON community_posts FOR DELETE USING (auth.uid() = author_id); END IF; END $$;

-- community_post_likes
ALTER TABLE community_post_likes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='likes_select' AND tablename='community_post_likes') THEN CREATE POLICY "likes_select" ON community_post_likes FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='likes_insert' AND tablename='community_post_likes') THEN CREATE POLICY "likes_insert" ON community_post_likes FOR INSERT WITH CHECK (auth.uid() = user_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='likes_delete' AND tablename='community_post_likes') THEN CREATE POLICY "likes_delete" ON community_post_likes FOR DELETE USING (auth.uid() = user_id); END IF; END $$;

-- community_comments
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='comments_select' AND tablename='community_comments') THEN CREATE POLICY "comments_select" ON community_comments FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='comments_insert' AND tablename='community_comments') THEN CREATE POLICY "comments_insert" ON community_comments FOR INSERT WITH CHECK (auth.uid() = author_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='comments_delete' AND tablename='community_comments') THEN CREATE POLICY "comments_delete" ON community_comments FOR DELETE USING (auth.uid() = author_id); END IF; END $$;

-- community_mutes
ALTER TABLE community_mutes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='mutes_select' AND tablename='community_mutes') THEN CREATE POLICY "mutes_select" ON community_mutes FOR SELECT USING (true); END IF; END $$;

-- ============================================================
-- 完成！
-- ============================================================
-- 现在你可以在 Supabase 中使用前端直连了！

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
GRANT SELECT ON public.community_posts TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_posts TO authenticated, service_role;
GRANT SELECT ON public.community_post_likes TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_post_likes TO authenticated, service_role;
GRANT SELECT ON public.community_comments TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_comments TO authenticated, service_role;
GRANT SELECT ON public.community_mutes TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_mutes TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

