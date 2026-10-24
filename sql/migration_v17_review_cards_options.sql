-- ============================================================
-- migration_v17：review_cards 增加 options 列（错题跨设备打印补全）
-- ============================================================
-- 背景：
--   review_cards 此前只存题干/答案/解析，不存选项。错题打印在换设备或
--   清空 localStorage 后只能拿到云端记录，选项区会缺失（五要素退化为四要素）。
--
-- 变更：
--   * 新增 options JSONB（数组或对象，与题库 options 结构一致）；
--   * 写入侧：sb-data.recordWrongAnswer / addWrongQuestion 仅在题目带选项时写入，
--     并在该列不存在时自动去掉字段重试（迁移未执行也不会阻断错题入册）；
--   * 读取侧：getWrongQuestions 走 select('*') 自动带回，print-utils 兼容
--     JSON 字符串与数组/对象两种形态。
--
-- 部署顺序：本文件必须先于前端代码执行；未执行时错题仍可写入（自动降级），
-- 但跨设备打印仍缺选项。
-- 执行：Supabase SQL Editor 整文件粘贴（幂等，可重复执行）。
-- ============================================================

SET search_path TO public, extensions;

ALTER TABLE public.review_cards
  ADD COLUMN IF NOT EXISTS options JSONB;

SELECT public.migration_record('migration_v17', 'review_cards 新增 options JSONB（跨设备错题打印选项补全）');

-- 自检（应返回 options 列定义）：
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'review_cards' AND column_name = 'options';
