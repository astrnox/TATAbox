-- ============================================================
-- migration_v14：管理员口令加固 —— 口令轮换 + 失败锁定
-- ============================================================
-- 背景（公开仓库威胁模型）：
--   1) 仓库曾把真实口令的 SHA-256 哈希写进 sql/migration_v11 与
--      tools/python/server.py。哈希虽不是明文，但 SHA-256 无盐无慢化，
--      公开仓库中的哈希可被离线无限速爆破（GPU 每秒数十亿次）。
--      git 历史中的旧哈希无法抹除，唯一作废方式 = 轮换口令。
--   2) 线上 RPC 原先只有 pg_sleep(1)（限在线枚举约 8.6 万次/天），
--      没有失败锁定。
-- 本迁移：
--   A. 轮换为高熵口令（做完 A，历史里的旧哈希即作废）
--   B. 连续 5 次失败锁定 15 分钟（比对成功清零）
-- 执行位置：Supabase SQL Editor。整文件幂等，可重复执行。
-- ============================================================


-- ============================================================
-- A. 轮换管理员口令（执行下面 A1 即可；A2 为备选）
-- ============================================================

-- ---------- A1（推荐，一条语句）：SQL Editor 内生成 128bit 口令并轮换 ----------
-- 口令明文只出现在结果面板（不写入任何已保存的查询文本）。
-- 执行后结果列 new_admin_key 即为新口令：立即复制存入密码管理器，
-- 只显示这一次。旧口令同时作废（git 历史中的旧哈希随之失效）。
SET search_path TO public, extensions;

WITH k AS (
  SELECT encode(gen_random_bytes(16), 'hex') AS new_key
)
UPDATE public.admin_config
SET admin_key_hash = encode(digest((SELECT new_key FROM k), 'sha256'), 'hex'),
    updated_at = NOW()
WHERE id = 1
RETURNING (SELECT new_key FROM k) AS new_admin_key;

-- ---------- A2（备选）：自选口令 ----------
--   本地生成（Mac/Linux）：KEY=$(openssl rand -hex 16)
--                          printf '%s' "$KEY" | sha256sum
--   然后执行：
--     UPDATE public.admin_config
--     SET admin_key_hash = '<本地算出的64位哈希>', updated_at = NOW()
--     WHERE id = 1;
--   或一步到位（口令明文会进入本账号的 SQL Editor 历史）：
--     UPDATE public.admin_config
--     SET admin_key_hash = encode(digest('自选高熵口令', 'sha256'), 'hex'),
--         updated_at = NOW()
--     WHERE id = 1;
-- 轮换后如需给 tools/python/server.py 配置：把下面返回的哈希写入 .env：
--     SELECT admin_key_hash FROM public.admin_config WHERE id = 1;
-- 注意：全新部署执行 v11 后得到的是「占位哈希」，必须紧接着执行 A1。


-- ============================================================
-- B. 失败锁定：连续 5 次口令错误 → 锁定 15 分钟
-- ============================================================

ALTER TABLE public.admin_config
  ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- 与 migration_v11 同签名替换（保持 SECURITY DEFINER / search_path / 授权），
-- 新增：锁定期内直接拒绝；失败计数；第 5 次失败锁定 15 分钟；成功清零。
CREATE OR REPLACE FUNCTION public.admin_login_with_key(p_key TEXT)
RETURNS TABLE(
  ok BOOLEAN,
  user_group TEXT,
  error_msg TEXT
) AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_hash TEXT;
  v_attempts INT;
  v_locked_until TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, '请先登录后再验证管理员密钥'::TEXT;
    RETURN;
  END IF;

  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, '请输入管理员密钥'::TEXT;
    RETURN;
  END IF;

  SELECT admin_key_hash, failed_attempts, locked_until
    INTO v_hash, v_attempts, v_locked_until
  FROM public.admin_config
  WHERE id = 1;

  -- 锁定期内直接拒绝（不比对、不泄露剩余尝试次数）
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT,
      ('尝试次数过多，请 ' ||
       to_char(v_locked_until AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') ||
       ' UTC 后再试')::TEXT;
    RETURN;
  END IF;

  IF v_hash IS NULL
     OR encode(digest(trim(p_key), 'sha256'), 'hex') IS DISTINCT FROM v_hash THEN
    -- 恒定延迟：抬高在线枚举成本
    PERFORM pg_sleep(1);
    -- 锁定已过期则从 1 重新计数，否则累加
    IF v_locked_until IS NOT NULL AND v_locked_until <= NOW() THEN
      v_attempts := 1;
    ELSE
      v_attempts := COALESCE(v_attempts, 0) + 1;
    END IF;

    IF v_attempts >= 5 THEN
      UPDATE public.admin_config
      SET failed_attempts = 0,
          locked_until = NOW() + INTERVAL '15 minutes';
    ELSE
      UPDATE public.admin_config
      SET failed_attempts = v_attempts,
          locked_until = NULL;
    END IF;

    RETURN QUERY SELECT FALSE, NULL::TEXT, '管理员密钥不正确'::TEXT;
    RETURN;
  END IF;

  -- 验证通过：清零计数与锁定
  UPDATE public.admin_config
  SET failed_attempts = 0, locked_until = NULL
  WHERE id = 1;

  UPDATE public.profiles
  SET user_group = 'admin'
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, '账号档案不存在，请先完成注册登录'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 'admin'::TEXT, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

GRANT EXECUTE ON FUNCTION public.admin_login_with_key(TEXT) TO authenticated;

-- 执行自检（应返回 1 行，且 hash 为 64 位十六进制）：
-- SELECT id, left(admin_key_hash, 16) AS hash_prefix, failed_attempts, locked_until
-- FROM public.admin_config WHERE id = 1;
