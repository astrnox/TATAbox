-- ============================================================
-- TATABOX 数据库迁移 v23：信用指数（points）v2 存量重算
-- ------------------------------------------------------------
-- 背景（对应前端 4af9f75 的模型重构）：
--   旧实现有四个结构性问题，导致「信用分不合理」：
--     1. profiles.points 被当成累加器，每次调整都先乘一次 e^(−0.01005×天数)
--        （≈1%/天，约 30%/月），前端「读」和「写」还各衰减一次；
--     2. 评论/发帖/举报属于永久扣减，一天最多 +3.5 却可以一次 −10；
--     3. 违规与收益用同一衰减率，一次误判要 20 天满勤才能追回；
--     4. 基础分 100 恰好等于「极高信任」阈值，榜单全员并列。
--
-- v2 模型（与前端 credit-metrics.js 的 CR_V2 常量严格一致）：
--   CR = clamp( BASE + Σ 行为·e^(−0.03·age) − Σ 违规·e^(−0.099·age), 0, CAP )
--        BASE = 60，CAP = 200；行为半衰期 ≈ 23 天，违规半衰期 ≈ 7 天；
--        高影响操作只设门槛、不再扣信用（信用≠消费）。
--
-- 本迁移做四件事：
--   A. cr_logs.amount 升级为小数（否则 0.3 的日常加分记账时被四舍五入成 0）
--   B. profiles.points 允许小数，cr_base 默认 60
--   C. 用记账流水重算所有存量用户的 points（一次性纠正历史衰减/永久扣分）
--   D. 挂上「记账即重算」触发器，此后 points 由流水推导，不再做累加衰减
--
-- 幂等：全部语句可重复执行。执行前建议先跑文末的【预检查】看清影响面；
-- 回滚方式见文件末尾注释（备份表 points_backup_v23）。
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- A. cr_logs.amount → NUMERIC(8,2)
-- ------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cr_logs'
          AND column_name = 'amount' AND data_type IN ('integer', 'smallint', 'bigint')
    ) THEN
        ALTER TABLE public.cr_logs
            ALTER COLUMN amount TYPE NUMERIC(8,2) USING amount::numeric(8,2);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 cr_logs.amount 类型调整: %', SQLERRM;
END $$;

-- ------------------------------------------------------------
-- B. profiles 字段准备
--    cr_base / cr_cap 由 v9 引入，这里把默认值调整为 60 / 200
--    points 改为 NUMERIC(6,2)，以便保留 0.1 级精度（前端展示取整）
-- ------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'cr_base'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN cr_base NUMERIC DEFAULT 60;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'cr_cap'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN cr_cap NUMERIC DEFAULT 200;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 profiles.cr_base / cr_cap 补列: %', SQLERRM;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name = 'points' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.profiles
            ALTER COLUMN points TYPE NUMERIC(6,2) USING points::numeric(6,2);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '跳过 profiles.points 类型调整: %', SQLERRM;
END $$;

-- 存量行统一到新基数（v9 时期的默认值是 100）
UPDATE public.profiles SET cr_base = 60  WHERE cr_base IS NULL OR cr_base = 100;
UPDATE public.profiles SET cr_cap  = 200 WHERE cr_cap  IS NULL OR cr_cap  > 200;
UPDATE public.profiles SET points  = 60  WHERE points  IS NULL;

-- ------------------------------------------------------------
-- C. v2 计算函数
--    正数 = 行为收益（半衰期 23 天），负数 = 违规（半衰期 7 天）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_points_v2(
    p_user_id UUID,
    p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS NUMERIC AS $$
DECLARE
    v_base NUMERIC := 60;
    v_cap  NUMERIC := 200;
    v_k_gain NUMERIC := 0.03;    -- 行为衰减速率/天（半衰期 ≈ 23 天）
    v_k_pen  NUMERIC := 0.099;   -- 违规衰减速率/天（半衰期 ≈ 7 天）
    v_total NUMERIC := 0;
    v_row RECORD;
    v_age NUMERIC;
BEGIN
    SELECT COALESCE(p.cr_base, 60), COALESCE(p.cr_cap, 200)
      INTO v_base, v_cap
      FROM public.profiles p
     WHERE p.id = p_user_id;

    IF v_base IS NULL THEN v_base := 60; END IF;
    IF v_cap  IS NULL THEN v_cap  := 200; END IF;

    FOR v_row IN
        SELECT l.amount, l.created_at
          FROM public.cr_logs l
         WHERE l.user_id = p_user_id
           AND l.created_at <= p_now
    LOOP
        v_age := GREATEST(0, EXTRACT(EPOCH FROM (p_now - v_row.created_at)) / 86400.0);
        v_total := v_total
                 + v_row.amount * EXP(-(CASE WHEN v_row.amount >= 0 THEN v_k_gain ELSE v_k_pen END) * v_age);
    END LOOP;

    RETURN ROUND(GREATEST(0, LEAST(v_cap, v_base + v_total)), 1);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- D. 备份 + 存量重算
--    先备份当前分数，便于对比与回滚（表已存在则保留首次备份）
-- ------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'points_backup_v23') THEN
        CREATE TABLE public.points_backup_v23 AS
        SELECT id, points AS points_before, now() AS backup_at FROM public.profiles;
        CREATE INDEX IF NOT EXISTS idx_points_backup_v23_id ON public.points_backup_v23(id);
        RAISE NOTICE '已创建备份表 points_backup_v23';
    END IF;
END $$;

UPDATE public.profiles p
   SET points = public.apply_points_v2(p.id),
       points_updated_at = now()
 WHERE COALESCE(p.user_group, 'member') <> 'admin';   -- 管理员不参与信用重算

-- ------------------------------------------------------------
-- E. 记账即重算（替换 v9 里针对 cr 字段的触发器）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_points_v2_on_log()
RETURNS trigger AS $$
BEGIN
    UPDATE public.profiles
       SET points = public.apply_points_v2(NEW.user_id),
           points_updated_at = now()
     WHERE id = NEW.user_id
       AND COALESCE(user_group, 'member') <> 'admin';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_cr_log_v2 ON public.cr_logs;
DROP TRIGGER IF EXISTS on_cr_log_points_v2 ON public.cr_logs;
CREATE TRIGGER on_cr_log_points_v2
    AFTER INSERT ON public.cr_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.recompute_points_v2_on_log();

-- ------------------------------------------------------------
-- F. 迁移记录
-- ------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'migration_record'
    ) THEN
        PERFORM public.migration_record(
            'migration_v23',
            'points v2：cr_logs.amount 支持小数、points 改 NUMERIC、按近因模型重算存量信用分、记账即重算触发器'
        );
    END IF;
END $$;

COMMIT;

-- ============================================================
-- 【预检查】执行前可先单独运行，确认影响面（不修改数据）：
--
--   -- 1) 记账流水覆盖率：没有流水的用户会回到基础分 60
--   SELECT count(*) FILTER (WHERE c.n IS NULL) AS no_ledger,
--          count(*) FILTER (WHERE c.n > 0)     AS has_ledger
--     FROM public.profiles p
--     LEFT JOIN (SELECT user_id, count(*) n FROM public.cr_logs GROUP BY user_id) c
--            ON c.user_id = p.id;
--
--   -- 2) 新旧分数对比（前 50 名）
--   SELECT p.id, p.username, p.points AS before,
--          round(public.apply_points_v2(p.id), 1) AS after_v2
--     FROM public.profiles p
--    ORDER BY p.points DESC
--    LIMIT 50;
--
--   -- 3) 行为/违规流水分布（判断是否绝大多数是旧模型的整数扣分）
--   SELECT sign(amount) AS sign, count(*), sum(amount)
--     FROM public.cr_logs GROUP BY 1 ORDER BY 1;
--
-- 【回滚】
--   UPDATE public.profiles p
--      SET points = b.points_before
--     FROM public.points_backup_v23 b
--    WHERE b.id = p.id;
--   DROP TRIGGER IF EXISTS on_cr_log_points_v2 ON public.cr_logs;
--
-- 【可选】用户组按新分档重排（默认不执行：会让一批人从 premium 掉到 verified）
--   UPDATE public.profiles SET user_group = CASE
--       WHEN points >= 130 THEN 'premium'     -- 极高信任
--       WHEN points >= 100 THEN 'verified'    -- 高度信任
--       ELSE 'member' END
--    WHERE COALESCE(user_group, 'member') <> 'admin';
-- ============================================================
