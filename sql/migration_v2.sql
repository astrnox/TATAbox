-- ============================================================
-- TATABOX — v2 迁移脚本
-- 在 Supabase SQL Editor 中运行此文件
-- 用途：补齐缺失的列、创建缺失的表、插入种子数据
-- ============================================================
-- [幂等改造] Issue #143
-- 已确认本文件幂等：ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS
-- / CREATE INDEX IF NOT EXISTS / CREATE OR REPLACE FUNCTION /
-- DROP TRIGGER IF EXISTS + CREATE TRIGGER / RLS 策略用 DO 块 + IF NOT EXISTS
-- / 种子数据用计数守卫（已有数据则跳过）。仅加注释说明，未改动任何业务逻辑。
-- ============================================================

-- ============================================================
-- 0. 注册即生效：自动确认邮箱（绕开 Supabase 邮件验证）
--    适用：Supabase 邮件服务不稳定/被屏蔽的地区（如韩国区）
--    效果：用户注册后立即登录，无需点邮件链接
--    注意：auth.users.confirmed_at 是 GENERATED 列（由 email_confirmed_at 派生）
--    关键：必须用 AFTER INSERT + UPDATE，不能用 BEFORE INSERT
--          BEFORE INSERT 改 NEW 字段会与 Supabase 内部 auth hook 冲突
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_confirm_email()
RETURNS TRIGGER AS $$
BEGIN
  -- AFTER INSERT：先让 Supabase 正常写入，再 UPDATE 确认
  UPDATE auth.users
  SET email_confirmed_at = NOW()
  WHERE id = NEW.id AND email_confirmed_at IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_auto_confirm
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_email();


-- ============================================================
-- 1. profiles 补列
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_group TEXT DEFAULT 'member';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cr INTEGER DEFAULT 50;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS device_id TEXT;

-- 如果你的 admin 账号是 pinesis@163.com，将其设为 admin
UPDATE profiles
SET user_group = 'admin'
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'pinesis@163.com'
);


-- ============================================================
-- 2. community_posts 补列（author_name）
-- ============================================================
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS author_name TEXT;


-- ============================================================
-- 3. 反馈表
-- ============================================================
CREATE TABLE IF NOT EXISTS feedbacks (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'suggestion',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  contact TEXT DEFAULT '',
  url TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
-- 所有人可提交反馈
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'feedbacks_insert') THEN
    CREATE POLICY feedbacks_insert ON feedbacks FOR INSERT WITH CHECK (true);
  END IF;
END $$;
-- 管理员可读
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'feedbacks_select_admin') THEN
    CREATE POLICY feedbacks_select_admin ON feedbacks FOR SELECT USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_group = 'admin')
    );
  END IF;
END $$;


-- ============================================================
-- 4. CR 申诉表
-- ============================================================
CREATE TABLE IF NOT EXISTS cr_appeals (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  detected_word TEXT DEFAULT '',
  amount INTEGER DEFAULT 0,
  reason TEXT DEFAULT '',
  source TEXT DEFAULT 'community',
  user_note TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  admin_note TEXT DEFAULT '',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cr_appeals ENABLE ROW LEVEL SECURITY;
-- 用户可提交申诉、查看自己的
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cr_appeals_insert') THEN
    CREATE POLICY cr_appeals_insert ON cr_appeals FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cr_appeals_select_own') THEN
    CREATE POLICY cr_appeals_select_own ON cr_appeals FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cr_appeals_select_admin') THEN
    CREATE POLICY cr_appeals_select_admin ON cr_appeals FOR SELECT USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_group = 'admin')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cr_appeals_update_admin') THEN
    CREATE POLICY cr_appeals_update_admin ON cr_appeals FOR UPDATE USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_group = 'admin')
    );
  END IF;
END $$;


-- ============================================================
-- 5. 种子数据：社区帖子（20 条，从 data/community.json 同步）
-- 如果表中已有数据则跳过
-- ============================================================
DO $$
DECLARE
  seed_author UUID;
  post_count INT;
BEGIN
  SELECT COUNT(*) INTO post_count FROM community_posts;
  IF post_count > 0 THEN
    RAISE NOTICE 'community_posts 已有 % 条数据，跳过种子插入', post_count;
    RETURN;
  END IF;

  -- 找一个 admin 用户作为种子帖作者
  SELECT id INTO seed_author FROM profiles WHERE user_group = 'admin' LIMIT 1;
  IF seed_author IS NULL THEN
    SELECT id INTO seed_author FROM profiles LIMIT 1;
  END IF;
  IF seed_author IS NULL THEN
    RAISE NOTICE '没有用户，无法插入种子帖';
    RETURN;
  END IF;

  INSERT INTO community_posts (id, author_id, author_name, content, tags, like_count, comment_count, is_pinned, is_deleted, created_at)
  VALUES
    ('post_seed_001', seed_author, '生物竞赛学姐',
     '去年联赛省二，今年冲国一。\n\n说几个我觉得有用的点吧：\n\n1. 细胞和分子生物学占比真的大，差不多40%的分都在这块，别在生态学上花太多时间\n2. 错题一定要反复看，我去年刷了2000多题但错题就过了一遍，血亏。今年用FSRS间隔重复，正确率从62%拉到84%\n3. 知识图谱那个功能挺好用的，联赛经常考跨模块综合，比如信号转导+神经+内分泌一起出\n\n有人也在备考吗？交流一下',
     '["经验分享", "备考"]', 28, 5, true, false, '2026-05-15 09:30:00+08'),

    ('post_seed_002', seed_author, 'DNA探索者',
     '今天终于把光合作用的光反应和暗反应搞明白了！\n\n之前一直搞混，现在理清楚了：\n- 光反应在类囊体膜，产ATP+NADH+O₂\n- 暗反应（Calvin循环）在基质，用ATP+NADH固定CO₂\n\nRubisco这个东西挺有意思的，效率其实不高但地球生命全靠它。光呼吸也是它搞出来的。\n\n推荐看看bio-animation那个光合作用动画，5步讲完，很直观。',
     '["光合作用", "学习笔记"]', 15, 3, false, false, '2026-05-20 14:12:00+08'),

    ('post_seed_003', seed_author, '细胞分裂侠',
     '救命，减数分裂前期I那五个阶段有没有什么口诀啊？\n\n细线期、偶线期、粗线期、双线期、终变期，每次都记混，做题全靠蒙。\n\n有没有大佬教教每个阶段最核心的特征是什么？',
     '["求助", "减数分裂"]', 8, 4, false, false, '2026-05-22 20:45:00+08'),

    ('post_seed_004', seed_author, '遗传学爱好者',
     '孟德尔9:3:3:1的变式总结，做题经常遇到\n\n- 9:7 互补（A_B_才显色）\n- 9:6:1 叠加（A_B_最强，A_bb和aaB_中等，aabb最弱）\n- 15:1 重复基因（只有aabb隐性）\n- 13:3 抑制（A抑制B，aaB_才显）\n- 12:3:1 显性上位（A_抑制B/b）\n\n先看总数是不是16的倍数，再拆比例，基本不会错',
     '["遗传学", "孟德尔"]', 22, 6, false, false, '2026-05-25 11:20:00+08'),

    ('post_seed_005', seed_author, '生态学小白',
     '问个问题：种群增长的S型曲线什么时候会变成J型？\n\n我知道资源无限就是J型（dN/dt=rN），资源有限是S型（dN/dt=rN(1-N/K)）。\n\n但做题遇到说"外来物种入侵初期呈J型"——是因为刚入侵还没遇到环境阻力？那后期一定会变S型吗？有没有例外？',
     '["求助", "生态学"]', 12, 4, false, false, '2026-05-28 16:30:00+08'),

    ('post_seed_006', seed_author, '生化狂魔',
     '糖酵解10步反应，分享个自编的口诀：\n\n葡萄六磷异构分，磷酸果糖激酶跟\n醛缩裂解两分子，三磷甘油醛起步\n氧化磷酸化NADH，甘油二磷变三磷\n烯醇化酶脱水成，丙酮酸激酶终成\n\n关键酶就三个：己糖激酶（第1步）、磷酸果糖激酶（第3步，限速酶）、丙酮酸激酶（第10步）\n\n净赚2 ATP + 2 NADH + 2 丙酮酸，记住这个就够了',
     '["生物化学", "糖酵解"]', 19, 3, false, false, '2026-06-01 10:15:00+08'),

    ('post_seed_007', seed_author, '联赛冲刺者',
     '24年联赛真题第35题，关于酶活性的，有没有人一起讨论？\n\n题目说某酶在pH7.4活性最高，pH5.0和9.0都降到30%，问：\nA. 最适pH一定是7.4\nB. pH5.0酶变性了\nC. pH9.0活性降低是因为活性中心氨基酸解离状态变了\nD. 胃液pH1.5会完全失活\n\n我选了C，答案给的是C和D。D为什么对？pH1.5离最适pH差太远就"完全失活"？感觉有点绝对啊',
     '["真题讨论", "求助"]', 14, 7, false, false, '2026-06-03 19:50:00+08'),

    ('post_seed_008', seed_author, '微生物控',
     '革兰氏染色老是记不住原理，今天终于理顺了\n\n别死记"紫阳红阴"，关键是酒精脱色那一步：\n- G+肽聚糖层厚（20-80nm），酒精脱水后孔径缩小，结晶紫-碘复合物卡在里面出不来\n- G-肽聚糖层薄（2-7nm），外膜被酒精破坏，复合物洗掉了\n\n然后再用番红复染，G-就变红了\n\n实操注意：脱色别超过30秒，不然G+也会被洗掉',
     '["微生物学", "实验"]', 17, 2, false, false, '2026-06-05 13:40:00+08'),

    ('post_seed_009', seed_author, '植物学爱好者',
     '五大植物激素，做题老混，整理一下：\n\n1. 生长素IAA——顶端优势、扦插生根\n2. 赤霉素GA——茎秆伸长、打破休眠\n3. 细胞分裂素CTK——分裂、延缓衰老\n4. 脱落酸ABA——关气孔、抑制生长、促休眠\n5. 乙烯ETH——催熟果实\n\n生长素和细胞分裂素的比值决定根芽分化，这个常考\n乙烯和生长素的关系要看浓度，低浓度协同高浓度拮抗',
     '["植物学", "植物激素"]', 11, 2, false, false, '2026-06-08 15:25:00+08'),

    ('post_seed_010', seed_author, '免疫学战士',
     '体液免疫和细胞免疫的区别，之前一直搞混\n\n体液免疫：B细胞→浆细胞→抗体，打细胞外的病原体\n细胞免疫：效应T细胞→穿孔素颗粒酶，打细胞内的\n\n共同点：都需要APC呈递抗原+Th细胞辅助\n\n有个坑：HIV攻击CD4+T细胞，所以两种免疫都会受损，不是只有细胞免疫！考试经常在这挖坑',
     '["免疫学", "学习笔记"]', 20, 5, false, false, '2026-06-10 09:00:00+08'),

    ('post_seed_011', seed_author, 'PCR达人',
     'PCR的几种变体，题目里经常混淆：\n\n- PCR：普通DNA扩增\n- RT-PCR：逆转录PCR，RNA→cDNA→PCR，看基因表达的\n- qPCR：实时荧光定量，看着曲线涨\n- RT-qPCR：逆转录+实时定量，新冠核酸测的就是这个\n\n注意：早期文献里RT-PCR有时也指Real-time PCR，要看上下文！别被坑了',
     '["分子生物学", "PCR"]', 16, 3, false, false, '2026-06-12 18:30:00+08'),

    ('post_seed_012', seed_author, '进化论粉丝',
     'Hardy-Weinberg平衡，公式简单但做题容易错\n\n五个条件：没突变、没选择、没迁移、无限大种群、随机交配\n\n公式：p²+2pq+q²=1\n\n举个真题：隐性病发病率q²=1/10000，求携带者频率\nq=1/100，p≈99/100，2pq≈2/100=1/50\n意思是每50个人里就有1个携带者，比例其实挺高的',
     '["遗传学", "群体遗传"]', 13, 2, false, false, '2026-06-15 10:45:00+08'),

    ('post_seed_013', seed_author, '实验小白',
     '虚拟实验室那个叶绿体色素提取分离的实验，做完终于懂了\n\n之前一直不理解为什么提取用无水乙醇、分离用层析液\n\n其实原理很简单：\n- 提取：色素溶于有机溶剂（无水乙醇）\n- 分离：纸层析，不同色素溶解度不同，扩散速度不同\n\n四条带从上到下：胡萝卜素（橙黄）、叶黄素（黄）、叶绿素a（蓝绿）、叶绿素b（黄绿）\n溶解度越大跑越快，越在上面',
     '["虚拟实验室", "光合作用"]', 9, 1, false, false, '2026-06-18 14:20:00+08'),

    ('post_seed_014', seed_author, '考前焦虑患者',
     '离联赛还有30天，正确率卡在70%上不去了，急死了\n\n学情诊断说我薄弱的是"细胞信号转导"和"基因表达调控"，但这俩模块太抽象了，看书看不进去\n\n有人用过AI导师吗？效果怎么样？或者有没有什么好的复习方法推荐？',
     '["求助", "备考"]', 7, 4, false, false, '2026-06-20 21:10:00+08'),

    ('post_seed_015', seed_author, '知识卡片收藏家',
     '用FSRS卡片复习了一个月，知识掌握度从45%涨到82%，分享一下\n\n我的节奏：每天20张新卡+100张复习卡，雷打不动\n\n关键：自评要诚实，模糊的就选"困难"，别图爽选"简单"\n\n数据：\n复习次数1247次\n平均间隔从1天涨到12天\n掌握度45%→82%\n\n间隔重复真的有用，但坚持最重要。中间断了几天就感觉退步了',
     '["FSRS", "知识卡片"]', 25, 6, false, false, '2026-06-22 08:30:00+08'),

    ('post_seed_016', seed_author, '细胞器观察员',
     '线粒体和叶绿体对比，两个半自主细胞器\n\n相同点：都有双膜、环状DNA、70S核糖体（原核型）\n\n不同：\n线粒体——内膜内折成嵴，有氧呼吸产ATP\n叶绿体——内膜平滑，有类囊体，光合作用产糖\n\n内共生学说证据就是这三点：双膜+环状DNA+70S核糖体\n说明它们都起源于被原始真核细胞吞噬的原核生物',
     '["细胞生物学", "细胞器"]', 18, 4, false, false, '2026-06-24 11:00:00+08'),

    ('post_seed_017', seed_author, '神经冲动迷',
     '动作电位的"全或无"定律，很多人理解错了\n\n不是说所有神经元动作电位幅度都一样\n而是：同一个神经元，要么不产生（没到阈值），要么产生固定幅度（到了阈值）\n\n阈下刺激只有局部电位，可以总和\n阈上刺激幅度不变，但频率增加\n\n强刺激=更多神经元被募集+单个神经元放电频率增加\n不是单个动作电位幅度变大！',
     '["神经系统", "学习笔记"]', 14, 3, false, false, '2026-06-26 15:30:00+08'),

    ('post_seed_018', seed_author, 'AI导师体验官',
     '试了下AI导师，问"为什么减数分裂要有交叉互换"，回答得挺清楚的\n\n交叉互换在前期I的粗线期，同源染色体的非姐妹染色单体交换片段\n\n生物学意义是增加遗传多样性，进化上给自然选择提供更多素材\n\n换个模式用"达尔文视角"讲，理解更深了。推荐试试',
     '["AI导师", "体验"]', 10, 2, false, false, '2026-06-27 09:15:00+08'),

    ('post_seed_019', seed_author, '生物学霸君',
     '联赛倒计时7天，分享我的冲刺计划\n\nD7-D5：错题本清零，FSRS复习所有到期错题\nD4-D3：模考2套，限时150分钟，当正式考试做\nD2：知识图谱过一遍，重点看学情诊断标红的模块\nD1：只看笔记和卡片，不刷新题，保持手感\n\n每天作息：\n早7-8错题复习\n上午9-11:30模考/专项\n下午2-4弱项突破\n晚上7-9 AI导师答疑\n\n一起加油！',
     '["备考", "计划"]', 23, 5, true, false, '2026-06-27 20:00:00+08'),

    ('post_seed_020', seed_author, '生物科普爱好者',
     '冷知识：为什么线粒体只通过母系遗传？\n\n受精的时候精子只提供细胞核（23条染色体），线粒体几乎全来自卵子的细胞质\n\n所以你的线粒体DNA是你妈的，你妈的是你外婆的……\n\n科学家顺着这个追溯出"线粒体夏娃"——所有现代人的母系共同祖先，大概20万年前在非洲\n\n不是说当时只有她一个女性，是其他女性的母系后代在演化中灭绝了\n\nY染色体反过来，只通过父系遗传，可以追溯"Y染色体亚当"',
     '["科普", "遗传学"]', 21, 4, false, false, '2026-06-28 10:00:00+08');

  -- 如需更新已有帖子内容，删除旧数据后重新运行:
  -- DELETE FROM community_posts WHERE id LIKE 'post_seed_%';
  -- 然后重新执行本 INSERT 语句
  RAISE NOTICE '已插入 20 条种子帖（自然版）';
END $$;


-- ============================================================
-- 6. 索引补充
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_feedbacks_created ON feedbacks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cr_appeals_user ON cr_appeals(user_id);
CREATE INDEX IF NOT EXISTS idx_cr_appeals_status ON cr_appeals(status);
CREATE INDEX IF NOT EXISTS idx_profiles_user_group ON profiles(user_group);

-- ──────────────────────────────────────────────────────────
-- Data API 授权（2026-10-30 起新建表必须显式 GRANT，否则 Data API 401）：本文件授权块，幂等可重跑。
-- 模板取自 Supabase 官方邮件：anon 只读 / authenticated+service_role 读写；
-- 行级隔离由 RLS 策略负责，GRANT 只解决 Data API 可达性。
-- ──────────────────────────────────────────────────────────
GRANT SELECT ON public.feedbacks TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.feedbacks TO authenticated, service_role;
GRANT SELECT ON public.cr_appeals TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.cr_appeals TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

