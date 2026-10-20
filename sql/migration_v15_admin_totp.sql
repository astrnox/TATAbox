-- ============================================================
-- migration_v15：管理员登录改为 TOTP 动态验证码（替换长口令）
-- ============================================================
-- 动机：轮换生成的 128bit 口令太长；改为身份验证器 App（Google
-- Authenticator / 2FAS / Authy 等）的 6 位动态码，每 30 秒刷新。
-- 安全模型：
--   * TOTP 种子只存放在 admin_config 表（REVOKE ALL，客户端读不到），
--     不进公开仓库——仓库里没有任何可离线爆破的秘密；
--   * 旧口令 RPC（admin_login_with_key）被 REVOKE，历史泄露的
--     哈希彻底失去作用，无需再轮换口令（v14 可不执行）；
--   * 服务端校验 ±1 时间窗 + 防重放（同一步只可用一次）
--     + 连续 5 次错误锁定 15 分钟。
-- 执行：Supabase SQL Editor，整文件一次粘贴执行（幂等）。
-- 执行后见文件末尾「第 2 步」生成种子并录入身份验证器。
-- ============================================================

SET search_path TO public, extensions;

-- ---------- 1. 列（幂等） ----------
ALTER TABLE public.admin_config
  ADD COLUMN IF NOT EXISTS totp_secret TEXT,
  ADD COLUMN IF NOT EXISTS totp_last_step BIGINT NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- ---------- 2. base32 编解码辅助（种子展示 / 解码为字节） ----------
CREATE OR REPLACE FUNCTION public._b32_encode(p_data BYTEA)
RETURNS TEXT AS $$
DECLARE
  alphabet CONSTANT text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  bits INT := 0;
  val BIGINT := 0;
  out TEXT := '';
  i INT;
BEGIN
  FOR i IN 0..length(p_data) - 1 LOOP
    val := (val << 8) | get_byte(p_data, i)::bigint;
    bits := bits + 8;
    WHILE bits >= 5 LOOP
      bits := bits - 5;
      out := out || substr(alphabet, (((val >> bits) & 31) + 1)::int, 1);
      val := val & ((1::bigint << bits) - 1);
    END LOOP;
  END LOOP;
  IF bits > 0 THEN
    out := out || substr(alphabet, (((val << (5 - bits)) & 31) + 1)::int, 1);
  END IF;
  RETURN out;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public._b32_decode(p_text TEXT)
RETURNS BYTEA AS $$
DECLARE
  alphabet CONSTANT text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  v TEXT := upper(regexp_replace(coalesce(p_text, ''), '[^A-Z2-7]', '', 'g'));
  bits BIGINT := 0;
  val BIGINT := 0;
  out BYTEA := '\x'::bytea;
  i INT;
  c INT;
BEGIN
  FOR i IN 1..length(v) LOOP
    c := position(substr(v, i, 1) IN alphabet) - 1;
    IF c < 0 THEN CONTINUE; END IF;
    val := (val << 5) | c::bigint;
    bits := bits + 5;
    IF bits >= 8 THEN
      bits := bits - 8;
      out := out || decode(lpad(to_hex((val >> bits) & 255), 2, '0'), 'hex');
      val := val & ((1::bigint << bits) - 1);
    END IF;
  END LOOP;
  RETURN out;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------- 3. TOTP 登录 RPC（±1 窗口 + 防重放 + 失败锁定） ----------
CREATE OR REPLACE FUNCTION public.admin_login_with_totp(p_code TEXT)
RETURNS TABLE(
  ok BOOLEAN,
  user_group TEXT,
  error_msg TEXT
) AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_secret TEXT;
  v_last_step BIGINT;
  v_attempts INT;
  v_locked_until TIMESTAMPTZ;
  v_code TEXT := regexp_replace(coalesce(p_code, ''), '\s', '', 'g');
  v_secret_bytes BYTEA;
  v_base BIGINT;
  v_step BIGINT;
  v_i INT;
  v_mac BYTEA;
  v_off INT;
  v_bin BIGINT;
  v_expected TEXT;
  v_found BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, '请先登录后再验证动态码'::TEXT;
    RETURN;
  END IF;

  SELECT totp_secret, totp_last_step, failed_attempts, locked_until
    INTO v_secret, v_last_step, v_attempts, v_locked_until
  FROM public.admin_config
  WHERE id = 1;

  -- 锁定期内直接拒绝
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT,
      ('尝试次数过多，请 ' ||
       to_char(v_locked_until AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') ||
       ' UTC 后再试')::TEXT;
    RETURN;
  END IF;

  IF v_secret IS NULL OR length(public._b32_decode(v_secret)) < 20 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT,
      '动态码未配置：请先在 SQL Editor 执行本文件末尾「第 2 步」生成种子'::TEXT;
    RETURN;
  END IF;

  IF v_code !~ '^[0-9]{6}$' THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, '请输入 6 位动态验证码'::TEXT;
    RETURN;
  END IF;

  v_secret_bytes := public._b32_decode(v_secret);
  v_base := (floor(extract(epoch FROM now()) / 30))::bigint;

  -- 检查当前及前后各 1 个时间窗（±30 秒容差）
  FOR v_i IN 0..2 LOOP
    v_step := v_base + v_i - 1;
    v_mac := hmac(decode(lpad(to_hex(v_step), 16, '0'), 'hex'), v_secret_bytes, 'sha1');
    v_off := get_byte(v_mac, 19) & 15;
    v_bin := ((get_byte(v_mac, v_off) & 127)::bigint << 24)
           | ((get_byte(v_mac, v_off + 1))::bigint << 16)
           | ((get_byte(v_mac, v_off + 2))::bigint << 8)
           |  (get_byte(v_mac, v_off + 3))::bigint;
    v_expected := lpad((v_bin % 1000000)::text, 6, '0');

    IF v_expected = v_code THEN
      -- 防重放：同一步及其之前的时间步只可用一次
      IF v_step <= COALESCE(v_last_step, -1) THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, '该动态码已使用过，请等待下一个'::TEXT;
        RETURN;
      END IF;
      v_found := TRUE;
      v_last_step := v_step;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_found THEN
    PERFORM pg_sleep(1);
    IF v_locked_until IS NOT NULL AND v_locked_until <= NOW() THEN
      v_attempts := 1;
    ELSE
      v_attempts := COALESCE(v_attempts, 0) + 1;
    END IF;
    IF v_attempts >= 5 THEN
      UPDATE public.admin_config
      SET failed_attempts = 0, locked_until = NOW() + INTERVAL '15 minutes';
    ELSE
      UPDATE public.admin_config
      SET failed_attempts = v_attempts, locked_until = NULL;
    END IF;
    RETURN QUERY SELECT FALSE, NULL::TEXT, '动态验证码不正确'::TEXT;
    RETURN;
  END IF;

  -- 成功：清零锁定 + 记录已用时间步（防重放）+ 升级当前账号
  UPDATE public.admin_config
  SET failed_attempts = 0, locked_until = NULL, totp_last_step = v_last_step
  WHERE id = 1;

  UPDATE public.profiles SET user_group = 'admin' WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, '账号档案不存在，请先完成注册登录'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 'admin'::TEXT, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

-- ---------- 4. 旧口令登录退役（历史泄露哈希自此失效） ----------
REVOKE EXECUTE ON FUNCTION public.admin_login_with_key(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_login_with_totp(TEXT) TO authenticated;

-- ============================================================
-- 第 2 步（生成种子；幂等，重复执行不会换种子）：
-- 执行后结果面板会显示两列，把「密钥」录入身份验证器 App
-- （App 内选「手动输入密钥」粘贴即可；URI 列供支持导入的应用使用）。
-- 种子只显示在结果面板、不写入任何查询文本，也不会进公开仓库。
-- ============================================================
WITH upd AS (
  UPDATE public.admin_config
  SET totp_secret = COALESCE(totp_secret, public._b32_encode(gen_random_bytes(20))),
      updated_at = NOW()
  WHERE id = 1
  RETURNING totp_secret
)
SELECT totp_secret AS "身份验证器密钥（32位base32，只在此显示）",
       'otpauth://totp/TATABOX:admin?secret=' || totp_secret || '&issuer=TATABOX' AS "otpauth URI（可选）"
FROM upd;

-- 执行自检（应返回 1 行；执行第 2 步后 secret 非空）：
-- SELECT left(coalesce(totp_secret,'（未生成）'),8) AS secret_prefix,
--        totp_last_step, failed_attempts, locked_until
-- FROM public.admin_config WHERE id = 1;
