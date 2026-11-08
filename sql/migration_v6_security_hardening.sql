-- ============================================================
-- TATABOX — 迁移 v6：安全加固（P0-2 / S-003 / S-004）
-- 在 Supabase SQL Editor 中运行此文件（幂等，可重复执行）
-- ============================================================
-- [幂等改造] Issue #143
-- 已确认本文件幂等：DROP POLICY IF EXISTS + DO 块 + pg_policies 判断 +
-- EXCEPTION 兜底。仅加注释说明，未改动任何业务逻辑。
-- ============================================================
-- 修复内容：
--   1. 移除 cards/questions 的「匿名可写」INSERT 策略
--      （cards_public_insert / questions_public_insert / questions_insert_anon），
--      改为仅 admin 可写。题库写入统一走 service_role（server.py / 导入脚本），
--      前端 anon key 仅保留读权限 —— 满足「匿名写敏感表返回 403/401」。
--   2. 为 profiles 增加「禁止自提权」UPDATE 检查：
--      普通用户只能保持原 user_group 或升为 verified（邮箱验证流程需要），
--      无法自行改到 admin / premium 等特权组；管理员不受限。
-- ============================================================

-- ---------- 1. cards / questions：匿名 INSERT -> admin INSERT ----------
DROP POLICY IF EXISTS cards_public_insert ON cards;
DROP POLICY IF EXISTS questions_public_insert ON questions;
DROP POLICY IF EXISTS questions_insert_anon ON questions;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cards_admin_insert' AND tablename = 'cards') THEN
        CREATE POLICY "cards_admin_insert" ON cards FOR INSERT WITH CHECK (
            EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_group = 'admin')
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'questions_admin_insert' AND tablename = 'questions') THEN
        CREATE POLICY "questions_admin_insert" ON questions FOR INSERT WITH CHECK (
            EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_group = 'admin')
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 cards/questions admin INSERT 策略: %', SQLERRM;
END $$;

-- ---------- 2. profiles：禁止普通用户自提权 ----------
-- ⚠️ 本节的 RESTRICTIVE 策略会误伤 admin/premium 的普通资料更新
--   （新行的 user_group 仍是 admin/premium，不在白名单内）。
--   v18 的 profile_protect 触发器已能阻止提权，v22 会移除本策略；
--   执行 v6 后请务必继续执行 migration_v22_profiles_policy_cleanup.sql。
-- 语义修正（M-04）：
--   1) 策略表达式不支持触发器语境里的 NEW.*，旧版 NEW.user_group 会抛语法错误，
--      被下方 EXCEPTION 静默吞掉，等同于策略从未创建；
--   2) 多条 FOR UPDATE 策略默认是 OR（permissive），旧版即使创建成功也无法收紧
--      既有 profiles_update_policy；必须显式写 AS RESTRICTIVE（AND 语义）。
-- WITH CHECK 中的裸列名即新行值：普通用户只能把 user_group 落在白名单内。
-- admin / premium 等特权组变更一律走 SECURITY DEFINER RPC（v15 TOTP、v20 管理员
-- 用户操作）或 service_role，二者绕过 RLS；更细的状态机由 v18 触发器兜底。
DO $$
BEGIN
    DROP POLICY IF EXISTS "profiles_no_elevation" ON profiles;
    CREATE POLICY "profiles_no_elevation" ON profiles
        AS RESTRICTIVE
        FOR UPDATE
        USING (true)
        WITH CHECK (user_group IN ('member', 'guest', 'verified'));
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 profiles_no_elevation 策略: %', SQLERRM;
END $$;

-- ---------- 3. 校验：输出最终策略清单供人工核对 ----------
SELECT schemaname, tablename, policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('profiles', 'cards', 'questions')
ORDER BY tablename, policyname;
