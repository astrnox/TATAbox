-- ============================================================
-- TATABOX — 增量更新 SQL（直接粘贴到 Supabase SQL Editor 运行）
-- 包含：user_group 列、ebook_pdfs 表、Storage Bucket、RLS 策略、
--       community 表、daily_checkins 表、achievements 表、streak 字段
-- 健壮版：每个语句独立容错，可重复运行，不会因单点失败导致整体崩溃
-- ============================================================
-- [幂等改造] Issue #143
-- 已确认本文件幂等：CREATE EXTENSION/TABLE/INDEX 均带 IF NOT EXISTS；
-- 列增改用 DO 块 + information_schema.columns 判断 + EXCEPTION 兜底；
-- RLS 策略全部置于 DO 块 + pg_policies 判断内；CREATE OR REPLACE FUNCTION /
-- DROP TRIGGER/DROP FUNCTION IF EXISTS + CREATE TRIGGER / DELETE / UPDATE
-- 均为自然幂等。仅加注释说明，未改动任何业务逻辑。
-- ============================================================

-- 0. 启用必要扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- gen_random_uuid() 在 PG13+ 内置可用，无需扩展；
-- uuid-ossp 提供 uuid_generate_v4() 作为后备

-- ============================================================
-- 1. profiles 表添加 user_group 列
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'user_group' AND table_schema = 'public'
    ) THEN
        ALTER TABLE profiles ADD COLUMN user_group TEXT DEFAULT 'member';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 profiles.user_group: %', SQLERRM;
END $$;

-- ============================================================
-- 1b. profiles 表添加 user_key 列（教师按密钥添加学生）
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'user_key' AND table_schema = 'public'
    ) THEN
        ALTER TABLE profiles ADD COLUMN user_key CHAR(8);
        CREATE INDEX IF NOT EXISTS idx_profiles_user_key ON profiles(user_key);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 profiles.user_key: %', SQLERRM;
END $$;


-- ============================================================
-- 2. 创建 ebook_pdfs 表（管理员上传的电子书PDF元数据）
-- ============================================================
CREATE TABLE IF NOT EXISTS ebook_pdfs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT DEFAULT '',
    category TEXT DEFAULT '其他',
    file_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ebook_pdfs 索引
CREATE INDEX IF NOT EXISTS idx_ebook_pdfs_category ON ebook_pdfs(category);
CREATE INDEX IF NOT EXISTS idx_ebook_pdfs_uploaded_by ON ebook_pdfs(uploaded_by);

-- ebook_pdfs RLS 策略
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ebook_pdfs' AND table_schema = 'public') THEN
        ALTER TABLE ebook_pdfs ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ebook_pdfs_select' AND tablename = 'ebook_pdfs') THEN
            CREATE POLICY "ebook_pdfs_select" ON ebook_pdfs FOR SELECT USING (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ebook_pdfs_insert' AND tablename = 'ebook_pdfs') THEN
            CREATE POLICY "ebook_pdfs_insert" ON ebook_pdfs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ebook_pdfs_delete' AND tablename = 'ebook_pdfs') THEN
            CREATE POLICY "ebook_pdfs_delete" ON ebook_pdfs FOR DELETE USING (auth.uid() IS NOT NULL);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 ebook_pdfs RLS: %', SQLERRM;
END $$;

-- ============================================================
-- 3. 创建 community 相关表
-- ============================================================
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

CREATE TABLE IF NOT EXISTS community_post_likes (
    post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_comments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_mutes (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT DEFAULT '',
    muted_by TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- community 索引
CREATE INDEX IF NOT EXISTS idx_posts_author ON community_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON community_comments(post_id, created_at);

-- community RLS 策略（统一在一个 DO 块中，先检查表是否存在）
DO $$
BEGIN
    -- community_posts
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'community_posts' AND table_schema = 'public') THEN
        ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'posts_select' AND tablename = 'community_posts') THEN
            CREATE POLICY "posts_select" ON community_posts FOR SELECT USING (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'posts_insert' AND tablename = 'community_posts') THEN
            CREATE POLICY "posts_insert" ON community_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'posts_update' AND tablename = 'community_posts') THEN
            CREATE POLICY "posts_update" ON community_posts FOR UPDATE USING (auth.uid() = author_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'posts_delete' AND tablename = 'community_posts') THEN
            CREATE POLICY "posts_delete" ON community_posts FOR DELETE USING (auth.uid() = author_id);
        END IF;
    END IF;

    -- community_post_likes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'community_post_likes' AND table_schema = 'public') THEN
        ALTER TABLE community_post_likes ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'likes_select' AND tablename = 'community_post_likes') THEN
            CREATE POLICY "likes_select" ON community_post_likes FOR SELECT USING (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'likes_insert' AND tablename = 'community_post_likes') THEN
            CREATE POLICY "likes_insert" ON community_post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'likes_delete' AND tablename = 'community_post_likes') THEN
            CREATE POLICY "likes_delete" ON community_post_likes FOR DELETE USING (auth.uid() = user_id);
        END IF;
    END IF;

    -- community_comments
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'community_comments' AND table_schema = 'public') THEN
        ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comments_select' AND tablename = 'community_comments') THEN
            CREATE POLICY "comments_select" ON community_comments FOR SELECT USING (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comments_insert' AND tablename = 'community_comments') THEN
            CREATE POLICY "comments_insert" ON community_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comments_delete' AND tablename = 'community_comments') THEN
            CREATE POLICY "comments_delete" ON community_comments FOR DELETE USING (auth.uid() = author_id);
        END IF;
    END IF;

    -- community_mutes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'community_mutes' AND table_schema = 'public') THEN
        ALTER TABLE community_mutes ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mutes_select' AND tablename = 'community_mutes') THEN
            CREATE POLICY "mutes_select" ON community_mutes FOR SELECT USING (true);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 community RLS: %', SQLERRM;
END $$;

-- ============================================================
-- 4. 确保 profiles 触发器存在（自动创建 profile）
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, username, display_name, user_group)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        'member'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 5. 邮箱验证触发器：用户确认邮箱后自动升级为 verified
-- ============================================================
DROP TRIGGER IF EXISTS on_email_confirmed ON auth.users;
DROP FUNCTION IF EXISTS public.handle_email_verified();

CREATE OR REPLACE FUNCTION public.handle_email_verified()
RETURNS trigger AS $$
BEGIN
    IF NEW.email NOT LIKE '%@bioquest.local' THEN
        UPDATE public.profiles
        SET user_group = CASE
            WHEN user_group IN ('member', 'guest') THEN 'verified'
            ELSE user_group
        END
        WHERE id = NEW.id AND user_group IN ('member', 'guest');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_email_confirmed
    AFTER UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW
    WHEN (NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL)
    EXECUTE FUNCTION public.handle_email_verified();

-- ============================================================
-- 6. 将已有的已验证邮箱用户升级为 verified
-- ============================================================
DO $$
BEGIN
    UPDATE public.profiles
    SET user_group = 'verified'
    WHERE id IN (
        SELECT au.id FROM auth.users au
        WHERE au.email_confirmed_at IS NOT NULL
          AND au.email NOT LIKE '%@bioquest.local'
    )
    AND user_group = 'member';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 verified 升级: %', SQLERRM;
END $$;

-- ============================================================
-- 7. 创建打卡表 daily_checkins
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_checkins (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    checkin_date DATE NOT NULL,
    streak_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, checkin_date)
);

-- 打卡表索引
CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON daily_checkins(user_id, checkin_date DESC);

-- 打卡表 RLS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_checkins' AND table_schema = 'public') THEN
        ALTER TABLE daily_checkins ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checkins_select' AND tablename = 'daily_checkins') THEN
            CREATE POLICY "checkins_select" ON daily_checkins FOR SELECT USING (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checkins_insert' AND tablename = 'daily_checkins') THEN
            CREATE POLICY "checkins_insert" ON daily_checkins FOR INSERT WITH CHECK (auth.uid() = user_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 daily_checkins RLS: %', SQLERRM;
END $$;

-- ============================================================
-- 8. profiles 表添加 streak 字段
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'current_streak' AND table_schema = 'public'
    ) THEN
        ALTER TABLE profiles ADD COLUMN current_streak INTEGER DEFAULT 0;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 profiles.current_streak: %', SQLERRM;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'longest_streak' AND table_schema = 'public'
    ) THEN
        ALTER TABLE profiles ADD COLUMN longest_streak INTEGER DEFAULT 0;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 profiles.longest_streak: %', SQLERRM;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'last_checkin' AND table_schema = 'public'
    ) THEN
        ALTER TABLE profiles ADD COLUMN last_checkin DATE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 profiles.last_checkin: %', SQLERRM;
END $$;

-- 更新最长连续打卡记录触发器
CREATE OR REPLACE FUNCTION public.update_longest_streak()
RETURNS trigger AS $$
BEGIN
    IF NEW.current_streak > COALESCE(OLD.current_streak, 0) THEN
        UPDATE profiles SET longest_streak = NEW.current_streak WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_streak_updated ON profiles;
DO $$
BEGIN
    CREATE TRIGGER on_streak_updated
        AFTER UPDATE OF current_streak ON profiles
        FOR EACH ROW
        WHEN (NEW.current_streak > COALESCE(OLD.current_streak, 0))
        EXECUTE FUNCTION public.update_longest_streak();
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 on_streak_updated 触发器: %', SQLERRM;
END $$;

-- ============================================================
-- 9. 创建成就表 achievements
-- ============================================================
CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    achievement_key TEXT NOT NULL,
    achievement_name TEXT NOT NULL,
    achievement_desc TEXT NOT NULL,
    achievement_icon TEXT DEFAULT '',
    achievement_tier TEXT DEFAULT 'iron',
    achievement_category TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, achievement_key)
);

-- 成就表索引
CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_tier ON achievements(user_id, achievement_tier);

-- 成就表 RLS（先检查表是否存在，再启用 RLS 和创建策略）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'achievements' AND table_schema = 'public') THEN
        ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'achievements_select' AND tablename = 'achievements') THEN
            CREATE POLICY "achievements_select" ON achievements FOR SELECT USING (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'achievements_insert' AND tablename = 'achievements') THEN
            CREATE POLICY "achievements_insert" ON achievements FOR INSERT WITH CHECK (auth.uid() = user_id);
        END IF;
    ELSE
        RAISE NOTICE 'achievements 表不存在，跳过 RLS 设置';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 achievements RLS: %', SQLERRM;
END $$;

-- ============================================================
-- 完成！接下来还需要在 Supabase 界面手动操作：
--
-- 1. 创建 Storage Bucket：
--    Dashboard → Storage → New Bucket → 名称输入 bioquest-ebooks → 关闭 Public → Create
--
-- 2. 开启邮箱确认（支持邮箱验证功能）：
--    Dashboard → Authentication → Providers → Email → 打开 "Confirm email"
--    注意：开启后，用真实邮箱注册的用户需要验证邮箱才能登录；
--    仅用用户名注册（不填邮箱）的用户不受影响。
--
-- 3. 设置自己为管理员（把下面的 YOUR_USER_ID 替换为你的用户ID）：
--    可在 Authentication → Users 中找到你的用户 UUID
--
-- 用户组体系：admin > premium > verified > member > guest
--   - admin: 管理员，后台管理权限
--   - premium: 高级会员，数据分析等高级功能
--   - verified: 认证会员，通过邮箱验证自动获得
--   - member: 普通会员，注册即可获得
--   - guest: 访客，未登录用户
-- ============================================================

-- 取消下面这行的注释并替换 YOUR_USER_ID 来设置管理员
-- UPDATE profiles SET user_group = 'admin' WHERE id = 'YOUR_USER_ID';

-- ============================================================
-- 10. 管理员 RLS 策略：允许 admin 用户组更新/删除其他用户的 profiles
-- ============================================================
DO $$
BEGIN
    -- 管理员可更新任何用户的 profile
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_admin_update' AND tablename = 'profiles') THEN
        CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE
            USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_group = 'admin'));
    END IF;

    -- 管理员可删除任何用户的 profile
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_admin_delete' AND tablename = 'profiles') THEN
        CREATE POLICY "profiles_admin_delete" ON profiles FOR DELETE
            USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_group = 'admin'));
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过管理员 RLS 策略: %', SQLERRM;
END $$;

-- ============================================================
-- 11. cards / questions 表的 INSERT/UPDATE/DELETE 策略（允许管理员操作）
-- ============================================================
DO $$
BEGIN
    -- cards 表：允许任何人插入（初始数据导入用，后续可收紧）
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cards_public_insert' AND tablename = 'cards') THEN
        CREATE POLICY "cards_public_insert" ON cards FOR INSERT WITH CHECK (true);
    END IF;

    -- cards 表：管理员可更新
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cards_admin_update' AND tablename = 'cards') THEN
        CREATE POLICY "cards_admin_update" ON cards FOR UPDATE USING (
            EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_group = 'admin')
        );
    END IF;

    -- cards 表：管理员可删除
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cards_admin_delete' AND tablename = 'cards') THEN
        CREATE POLICY "cards_admin_delete" ON cards FOR DELETE USING (
            EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_group = 'admin')
        );
    END IF;

    -- questions 表：允许任何人插入（初始数据导入用，后续可收紧）
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'questions_public_insert' AND tablename = 'questions') THEN
        CREATE POLICY "questions_public_insert" ON questions FOR INSERT WITH CHECK (true);
    END IF;

    -- questions 表：管理员可更新
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'questions_admin_update' AND tablename = 'questions') THEN
        CREATE POLICY "questions_admin_update" ON questions FOR UPDATE USING (
            EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_group = 'admin')
        );
    END IF;

    -- questions 表：管理员可删除
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'questions_admin_delete' AND tablename = 'questions') THEN
        CREATE POLICY "questions_admin_delete" ON questions FOR DELETE USING (
            EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_group = 'admin')
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 cards/questions RLS 策略: %', SQLERRM;
END $$;

-- ============================================================
-- 12. 清理测试数据和重复数据
-- ============================================================

-- 删除测试题目
DELETE FROM questions WHERE id IN ('q_test999', 'q_batch_a', 'q_batch_b', 'q_000NaN');

-- 删除重复的卡片（保留 ID 最小的 200 条，删除多余的）
-- 容错：cards 表可能尚未创建，跳过而非中断整个脚本
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cards' AND table_schema = 'public') THEN
        DELETE FROM cards WHERE id NOT IN (
            SELECT id FROM cards ORDER BY id ASC LIMIT 200
        );
        RAISE NOTICE 'cards 表去重完成';
    ELSE
        RAISE NOTICE '跳过 cards 去重：cards 表不存在（请先运行 schema_safe.sql）';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 cards 去重: %', SQLERRM;
END $$;

-- ============================================================
-- 13. 修复注册失败：profiles 表 device_id 列允许 NULL + 添加 email 列
-- ============================================================

-- 将 device_id 从 NOT NULL 改为允许 NULL，否则注册时触发器会因缺少 device_id 而失败
ALTER TABLE profiles ALTER COLUMN device_id DROP NOT NULL;

-- 添加 email 列（用于用户名登录时查找邮箱）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email' AND table_schema = 'public') THEN
    ALTER TABLE profiles ADD COLUMN email TEXT;
  END IF;
END $$;

-- 同时更新触发器，确保新用户注册时保存 email 和 device_id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, email, device_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'device_id', NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 删除刚才的测试用户
DELETE FROM profiles WHERE username = 'testuser_debug';
DELETE FROM auth.users WHERE email = 'testuser_debug@bioquest.local';

-- ============================================================
-- 14. 用户信用系统（CR）字段与日志表
-- ============================================================

-- profiles 表添加 cr 与 cr_updated_at 字段
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'cr' AND table_schema = 'public'
    ) THEN
        ALTER TABLE profiles ADD COLUMN cr INTEGER DEFAULT 50;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'cr_updated_at' AND table_schema = 'public'
    ) THEN
        ALTER TABLE profiles ADD COLUMN cr_updated_at TIMESTAMPTZ DEFAULT now();
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 profiles.cr 字段: %', SQLERRM;
END $$;

-- 初始化现有用户的 cr 为 50（如果为空）
UPDATE profiles SET cr = 50 WHERE cr IS NULL;

-- 创建 CR 日志表（审计用途）
CREATE TABLE IF NOT EXISTS cr_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cr_logs_user ON cr_logs(user_id, created_at DESC);

-- cr_logs RLS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cr_logs' AND table_schema = 'public') THEN
        ALTER TABLE cr_logs ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cr_logs_select_own' AND tablename = 'cr_logs') THEN
            CREATE POLICY "cr_logs_select_own" ON cr_logs FOR SELECT USING (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cr_logs_select_admin' AND tablename = 'cr_logs') THEN
            CREATE POLICY "cr_logs_select_admin" ON cr_logs FOR SELECT USING (
                EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_group = 'admin')
            );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cr_logs_insert' AND tablename = 'cr_logs') THEN
            CREATE POLICY "cr_logs_insert" ON cr_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 cr_logs RLS: %', SQLERRM;
END $$;

-- ============================================================
-- 15. 题目反馈表与用户建议反馈表
-- ============================================================

CREATE TABLE IF NOT EXISTS question_feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id TEXT,
    question_text TEXT,
    issue_type TEXT,
    description TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_feedbacks_user ON question_feedbacks(user_id, created_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'question_feedbacks' AND table_schema = 'public') THEN
        ALTER TABLE question_feedbacks ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'question_feedbacks_select' AND tablename = 'question_feedbacks') THEN
            CREATE POLICY "question_feedbacks_select" ON question_feedbacks FOR SELECT USING (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'question_feedbacks_insert' AND tablename = 'question_feedbacks') THEN
            CREATE POLICY "question_feedbacks_insert" ON question_feedbacks FOR INSERT WITH CHECK (auth.uid() = user_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 question_feedbacks RLS: %', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT,
    content TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedbacks_user ON feedbacks(user_id, created_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feedbacks' AND table_schema = 'public') THEN
        ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'feedbacks_select' AND tablename = 'feedbacks') THEN
            CREATE POLICY "feedbacks_select" ON feedbacks FOR SELECT USING (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'feedbacks_insert' AND tablename = 'feedbacks') THEN
            CREATE POLICY "feedbacks_insert" ON feedbacks FOR INSERT WITH CHECK (auth.uid() = user_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 feedbacks RLS: %', SQLERRM;
END $$;

-- ============================================================
-- 16. 自动调整 CR 的触发器（科学化信用体系）
--   - 建议反馈（feedbacks）按边际递减加分
--   - 题目举报/反馈不再自动扣分，改由前端消费 CR 并后续复核
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_cr_decay_and_adjust(
    p_user_id UUID,
    p_delta INTEGER,
    p_reason TEXT DEFAULT '自动调整'
)
RETURNS void AS $$
DECLARE
    v_current_cr INTEGER;
    v_last_update TIMESTAMPTZ;
    v_decayed_cr NUMERIC;
    v_lambda NUMERIC := 0.01005; -- 每日衰减约 1%
    v_new_cr INTEGER;
BEGIN
    SELECT cr, cr_updated_at INTO v_current_cr, v_last_update
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_current_cr IS NULL THEN
        v_current_cr := 50;
    END IF;

    -- 应用自然衰减
    IF v_last_update IS NOT NULL THEN
        v_decayed_cr := v_current_cr * EXP(-v_lambda * EXTRACT(EPOCH FROM (now() - v_last_update)) / 86400.0);
    ELSE
        v_decayed_cr := v_current_cr;
    END IF;

    v_new_cr := GREATEST(0, ROUND(v_decayed_cr + p_delta));

    UPDATE public.profiles
    SET cr = v_new_cr,
        cr_updated_at = now()
    WHERE id = p_user_id;

    -- 记录审计日志
    BEGIN
        INSERT INTO public.cr_logs (user_id, amount, reason, source)
        VALUES (p_user_id, p_delta, p_reason, 'trigger');
    EXCEPTION WHEN OTHERS THEN
        -- 忽略日志表不存在的情况
        NULL;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 建议反馈触发器：边际递减加分
-- delta = base / (1 + beta * n^gamma)
CREATE OR REPLACE FUNCTION public.adjust_cr_on_feedback()
RETURNS trigger AS $$
DECLARE
    v_base INTEGER := 10;
    v_beta NUMERIC := 0.30;
    v_gamma NUMERIC := 1;
    v_window_days INTEGER := 30;
    v_count INTEGER;
    v_delta NUMERIC;
BEGIN
    IF TG_TABLE_NAME = 'feedbacks' THEN
        SELECT COUNT(*) INTO v_count
        FROM public.feedbacks
        WHERE user_id = NEW.user_id
          AND created_at >= now() - (v_window_days || ' days')::interval;

        v_delta := v_base / (1 + v_beta * POWER(v_count, v_gamma));
        PERFORM public.apply_cr_decay_and_adjust(NEW.user_id, ROUND(v_delta), '提交建议反馈');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_question_feedback_created ON question_feedbacks;
-- 题目举报不再通过触发器自动扣分，改为前端消费 CR 机制

DROP TRIGGER IF EXISTS on_feedback_created ON feedbacks;
CREATE TRIGGER on_feedback_created
    AFTER INSERT ON feedbacks
    FOR EACH ROW EXECUTE FUNCTION public.adjust_cr_on_feedback();

-- ============================================================
-- 17. 基于 CR 自动升级用户组（仅 member/verified/premium 之间升降）
--   - CR >= 100 自动升级为 premium
--   - CR >= 50  自动升级为 verified
--   - CR < 50   降级为 member（admin 不受影响）
-- ============================================================

CREATE OR REPLACE FUNCTION public.upgrade_user_group_by_cr()
RETURNS trigger AS $$
BEGIN
    IF NEW.user_group = 'admin' THEN
        RETURN NEW;
    END IF;

    IF NEW.cr >= 100 AND NEW.user_group IN ('member', 'verified', 'guest') THEN
        NEW.user_group := 'premium';
    ELSIF NEW.cr >= 50 AND NEW.user_group IN ('member', 'guest') THEN
        NEW.user_group := 'verified';
    ELSIF NEW.cr < 50 AND NEW.user_group IN ('verified', 'premium') THEN
        NEW.user_group := 'member';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_cr_updated ON profiles;
CREATE TRIGGER on_cr_updated
    BEFORE UPDATE OF cr ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.upgrade_user_group_by_cr();

-- 初次运行：根据现有 CR 校正用户组
DO $$
BEGIN
    UPDATE profiles
    SET user_group = CASE
        WHEN cr >= 100 AND user_group != 'admin' THEN 'premium'
        WHEN cr >= 50 AND user_group NOT IN ('admin', 'premium') THEN 'verified'
        WHEN cr < 50 AND user_group NOT IN ('admin') THEN 'member'
        ELSE user_group
    END
    WHERE cr IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过用户组校正: %', SQLERRM;
END $$;

-- ============================================================
-- 18. CR 申诉表：用户可对不文明检测扣分发起申诉
-- ============================================================

CREATE TABLE IF NOT EXISTS cr_appeals (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    detected_word TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    source TEXT DEFAULT 'community',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    user_note TEXT DEFAULT '',
    admin_note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cr_appeals_user ON cr_appeals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cr_appeals_status ON cr_appeals(status, created_at DESC);

-- cr_appeals RLS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cr_appeals' AND table_schema = 'public') THEN
        ALTER TABLE cr_appeals ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cr_appeals_select_own' AND tablename = 'cr_appeals') THEN
            CREATE POLICY "cr_appeals_select_own" ON cr_appeals FOR SELECT USING (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cr_appeals_select_admin' AND tablename = 'cr_appeals') THEN
            CREATE POLICY "cr_appeals_select_admin" ON cr_appeals FOR SELECT USING (
                EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_group = 'admin')
            );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cr_appeals_insert' AND tablename = 'cr_appeals') THEN
            CREATE POLICY "cr_appeals_insert" ON cr_appeals FOR INSERT WITH CHECK (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cr_appeals_update_admin' AND tablename = 'cr_appeals') THEN
            CREATE POLICY "cr_appeals_update_admin" ON cr_appeals FOR UPDATE USING (
                EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_group = 'admin')
            );
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 cr_appeals RLS: %', SQLERRM;
END $$;

-- ============================================================
-- 19. 复习推送：错题复习卡片（FSRS 状态云端同步）
-- ============================================================

CREATE TABLE IF NOT EXISTS review_cards (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    question_text TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    concept TEXT DEFAULT '',
    difficulty TEXT DEFAULT 'medium',
    stability NUMERIC DEFAULT 0,
    fsrs_difficulty NUMERIC DEFAULT 5,
    last_review TIMESTAMPTZ,
    repetitions INTEGER DEFAULT 0,
    lapses INTEGER DEFAULT 0,
    due_date TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_review_cards_due ON review_cards(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_review_cards_question ON review_cards(question_id);

-- review_cards RLS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'review_cards' AND table_schema = 'public') THEN
        ALTER TABLE review_cards ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'review_cards_select_own' AND tablename = 'review_cards') THEN
            CREATE POLICY "review_cards_select_own" ON review_cards FOR SELECT USING (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'review_cards_insert_own' AND tablename = 'review_cards') THEN
            CREATE POLICY "review_cards_insert_own" ON review_cards FOR INSERT WITH CHECK (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'review_cards_update_own' AND tablename = 'review_cards') THEN
            CREATE POLICY "review_cards_update_own" ON review_cards FOR UPDATE USING (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'review_cards_delete_own' AND tablename = 'review_cards') THEN
            CREATE POLICY "review_cards_delete_own" ON review_cards FOR DELETE USING (auth.uid() = user_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 review_cards RLS: %', SQLERRM;
END $$;

-- ============================================================
-- 20. 问答悬赏
-- ============================================================

CREATE TABLE IF NOT EXISTS q_bounties (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    cr_reward INTEGER NOT NULL CHECK (cr_reward > 0),
    extra_reward INTEGER DEFAULT 0,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'answered', 'expired', 'closed')),
    accepted_answer_id TEXT,
    answer_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS q_bounty_answers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    bounty_id TEXT NOT NULL REFERENCES q_bounties(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_accepted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_q_bounties_status ON q_bounties(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_q_bounties_user ON q_bounties(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_q_bounty_answers_bounty ON q_bounty_answers(bounty_id, created_at);

-- q_bounties RLS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'q_bounties' AND table_schema = 'public') THEN
        ALTER TABLE q_bounties ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'q_bounties_select_all' AND tablename = 'q_bounties') THEN
            CREATE POLICY "q_bounties_select_all" ON q_bounties FOR SELECT USING (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'q_bounties_insert_own' AND tablename = 'q_bounties') THEN
            CREATE POLICY "q_bounties_insert_own" ON q_bounties FOR INSERT WITH CHECK (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'q_bounties_update_own' AND tablename = 'q_bounties') THEN
            CREATE POLICY "q_bounties_update_own" ON q_bounties FOR UPDATE USING (auth.uid() = user_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 q_bounties RLS: %', SQLERRM;
END $$;

-- q_bounty_answers RLS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'q_bounty_answers' AND table_schema = 'public') THEN
        ALTER TABLE q_bounty_answers ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'q_bounty_answers_select_all' AND tablename = 'q_bounty_answers') THEN
            CREATE POLICY "q_bounty_answers_select_all" ON q_bounty_answers FOR SELECT USING (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'q_bounty_answers_insert_own' AND tablename = 'q_bounty_answers') THEN
            CREATE POLICY "q_bounty_answers_insert_own" ON q_bounty_answers FOR INSERT WITH CHECK (auth.uid() = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'q_bounty_answers_update_bounty_owner' AND tablename = 'q_bounty_answers') THEN
            CREATE POLICY "q_bounty_answers_update_bounty_owner" ON q_bounty_answers FOR UPDATE USING (
                EXISTS (SELECT 1 FROM q_bounties WHERE q_bounties.id = q_bounty_answers.bounty_id AND q_bounties.user_id = auth.uid())
            );
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 q_bounty_answers RLS: %', SQLERRM;
END $$;

-- ============================================================
-- 22. 智能错题管理 + 学习管理工具（阶段一）
-- ============================================================

-- 扩展 review_cards：增加错题管理所需字段
ALTER TABLE review_cards
    ADD COLUMN IF NOT EXISTS user_answer TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS correct_answer TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS analysis TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS error_reason TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS textbook_chapter TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS knowledge_graph_nodes TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'practice';

CREATE INDEX IF NOT EXISTS idx_review_cards_concept ON review_cards(user_id, concept);
CREATE INDEX IF NOT EXISTS idx_review_cards_error_reason ON review_cards(user_id, error_reason);

-- 学习任务 / 待办清单
CREATE TABLE IF NOT EXISTS study_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'archived')),
    due_date TIMESTAMPTZ,
    related_module TEXT DEFAULT '',
    related_concepts TEXT[] DEFAULT '{}',
    parent_task_id UUID REFERENCES study_tasks(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_tasks_user_status ON study_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_study_tasks_due ON study_tasks(user_id, due_date);

-- 专注记录（番茄钟）
CREATE TABLE IF NOT EXISTS focus_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES study_tasks(id) ON DELETE SET NULL,
    duration INTEGER NOT NULL CHECK (duration > 0),
    start_time TIMESTAMPTZ DEFAULT now(),
    end_time TIMESTAMPTZ,
    is_completed BOOLEAN DEFAULT false,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_user ON focus_sessions(user_id, start_time);

-- 学习笔记
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    related_concepts TEXT[] DEFAULT '{}',
    related_module TEXT DEFAULT '',
    tags TEXT[] DEFAULT '{}',
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, updated_at DESC);

-- 课程表
CREATE TABLE IF NOT EXISTS schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT DEFAULT '我的课程表',
    is_default BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 课程表条目
CREATE TABLE IF NOT EXISTS schedule_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subject TEXT NOT NULL,
    location TEXT DEFAULT '',
    teacher TEXT DEFAULT '',
    color TEXT DEFAULT '#5a7d5c',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule ON schedule_items(schedule_id, day_of_week, start_time);

-- RLS：study_tasks
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'study_tasks' AND table_schema = 'public') THEN
        ALTER TABLE study_tasks ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'study_tasks_own' AND tablename = 'study_tasks') THEN
            CREATE POLICY "study_tasks_own" ON study_tasks FOR ALL USING (auth.uid() = user_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 study_tasks RLS: %', SQLERRM;
END $$;

-- RLS：focus_sessions
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'focus_sessions' AND table_schema = 'public') THEN
        ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'focus_sessions_own' AND tablename = 'focus_sessions') THEN
            CREATE POLICY "focus_sessions_own" ON focus_sessions FOR ALL USING (auth.uid() = user_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 focus_sessions RLS: %', SQLERRM;
END $$;

-- RLS：notes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notes' AND table_schema = 'public') THEN
        ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notes_own' AND tablename = 'notes') THEN
            CREATE POLICY "notes_own" ON notes FOR ALL USING (auth.uid() = user_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 notes RLS: %', SQLERRM;
END $$;

-- RLS：schedules / schedule_items
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schedules' AND table_schema = 'public') THEN
        ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'schedules_own' AND tablename = 'schedules') THEN
            CREATE POLICY "schedules_own" ON schedules FOR ALL USING (auth.uid() = user_id);
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schedule_items' AND table_schema = 'public') THEN
        ALTER TABLE schedule_items ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'schedule_items_own' AND tablename = 'schedule_items') THEN
            CREATE POLICY "schedule_items_own" ON schedule_items FOR ALL USING (
                EXISTS (SELECT 1 FROM schedules WHERE schedules.id = schedule_items.schedule_id AND schedules.user_id = auth.uid())
            );
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 schedules RLS: %', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────
-- Data API 授权（2026-10-30 起新建表必须显式 GRANT，否则 Data API 401）：本文件授权块，幂等可重跑。
-- 模板取自 Supabase 官方邮件：anon 只读 / authenticated+service_role 读写；
-- 行级隔离由 RLS 策略负责，GRANT 只解决 Data API 可达性。
-- ──────────────────────────────────────────────────────────
GRANT SELECT ON public.ebook_pdfs TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.ebook_pdfs TO authenticated, service_role;
GRANT SELECT ON public.community_posts TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_posts TO authenticated, service_role;
GRANT SELECT ON public.community_post_likes TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_post_likes TO authenticated, service_role;
GRANT SELECT ON public.community_comments TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_comments TO authenticated, service_role;
GRANT SELECT ON public.community_mutes TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.community_mutes TO authenticated, service_role;
GRANT SELECT ON public.daily_checkins TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.daily_checkins TO authenticated, service_role;
GRANT SELECT ON public.achievements TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.achievements TO authenticated, service_role;
GRANT SELECT ON public.cr_logs TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.cr_logs TO authenticated, service_role;
GRANT SELECT ON public.question_feedbacks TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.question_feedbacks TO authenticated, service_role;
GRANT SELECT ON public.feedbacks TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.feedbacks TO authenticated, service_role;
GRANT SELECT ON public.cr_appeals TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.cr_appeals TO authenticated, service_role;
GRANT SELECT ON public.review_cards TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.review_cards TO authenticated, service_role;
GRANT SELECT ON public.q_bounties TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.q_bounties TO authenticated, service_role;
GRANT SELECT ON public.q_bounty_answers TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.q_bounty_answers TO authenticated, service_role;
GRANT SELECT ON public.study_tasks TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.study_tasks TO authenticated, service_role;
GRANT SELECT ON public.focus_sessions TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.focus_sessions TO authenticated, service_role;
GRANT SELECT ON public.notes TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.notes TO authenticated, service_role;
GRANT SELECT ON public.schedules TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.schedules TO authenticated, service_role;
GRANT SELECT ON public.schedule_items TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.schedule_items TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

