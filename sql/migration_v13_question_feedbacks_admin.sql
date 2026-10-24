-- ============================================================
-- migration_v13：题目反馈 · 管理员跨用户读取权限
-- ============================================================
-- 背景：
--   题目反馈两条写入路径（js/core/question-utils.js submitQuestionFeedback）：
--     1. 本机 localStorage：bioquest_question_feedbacks（永远保留）
--     2. 云端 question_feedbacks 表（登录时同步，sql/incremental_update.sql 第 15 节建表）
--   原 RLS 策略 question_feedbacks_select 仅允许读取本人提交的行
--   （USING auth.uid() = user_id），管理面板「反馈管理 → 题目反馈」
--   需要跨用户读取所有人的反馈，因此补充管理员 SELECT 策略。
--
-- 用法：在 Supabase SQL Editor 中执行本文件。
-- 执行前管理面板会显示「云端读取受限」提示，本机提交的反馈仍可见。
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'question_feedbacks_select_admin'
          AND tablename = 'question_feedbacks'
    ) THEN
        CREATE POLICY question_feedbacks_select_admin ON question_feedbacks
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid() AND user_group = 'admin'
            )
        );
    END IF;
END $$;

-- 管理面板按时间倒序取最近 500 条，补一个排序索引
CREATE INDEX IF NOT EXISTS idx_question_feedbacks_created
    ON question_feedbacks (created_at DESC);
