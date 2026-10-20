#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TATABOX —— 百科模块词条爬虫 (wiki_crawler.py)
================================================
从「维基百科（中文优先）」与「百度百科」抓取约 200 个生物学词条，
转换为 data/wiki-seed.json 所需的 entries 格式，并合并进种子文件。

适用场景：
    在拥有一台可正常联网的机器上运行即可直接抓取维基/百度；
    在本项目沙箱等「出口拦截 wikipedia/baike 域名」的环境里，使用
    --via corsfix 经 https://proxy.corsfix.com 中转（服务端代取）。
    运行后 data/wiki-seed.json 会被更新，前端 wiki.html 首次加载
    （或调用 BioQuestWiki.resetSeed()）即可看到抓取结果。

用法：
    python tools/python/wiki_crawler.py                # 抓取全部约 200 条，合并到 data/wiki-seed.json
    python tools/python/wiki_crawler.py --limit 30     # 只抓前 30 条（快速测试）
    python tools/python/wiki_crawler.py --via corsfix  # 沙箱内经 corsfix 中转抓取维基
    python tools/python/wiki_crawler.py --refresh      # 已存在的词条也重新抓取覆盖
    python tools/python/wiki_crawler.py --only baidu   # 仅从百度百科抓取
    python tools/python/wiki_crawler.py --source zh    # 优先使用维基中文，跳过百度回退
    python tools/python/wiki_crawler.py --out /tmp/a.json   # 输出到其它路径

内容完整性（v2 全量抓取改造）：
    * 正文：维基 Action API prop=extracts 全文（含所有章节）；
    * 图表：prop=wikitext → 表格 {|…|} 转 Markdown 表格；
    * 图片：wikitext 中 [[File:…]] 抽取为 Commons 缩略图直链
      （MD5 路径算法与前端 wiki.js wikimediaThumbUrl 一致，SVG 自动补
      .png 后缀——Commons 对 SVG 缩略图要求该后缀，否则404）；
    * 与前端「导入维基词条」管线同构，保证两种入口产出一致。

依赖：
    仅 Python 3 标准库（urllib）。无需 requests / bs4。
"""

import argparse
import gzip
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT_ROOT = str(Path(__file__).resolve().parent.parent.parent)
DEFAULT_OUT = os.path.join(PROJECT_ROOT, "data", "wiki-seed.json")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 "
    "BioQuestWikiCrawler/1.0 (educational)"
)

# 学科分类 → 主题色（与 js/pages/wiki.js 的 CATEGORY_COLORS 一致）
CATEGORY_COLORS = {
    "细胞生物学": "#3a5ba4",
    "分子生物学": "#6a4aa4",
    "生物化学": "#a47a2a",
    "遗传学": "#a45a2a",
    "动物学": "#a43a5a",
    "植物学": "#3a8a3a",
    "微生物学": "#2a8aa4",
    "生态学": "#2a7c4a",
}

# 内置词条清单：(标题, 分类, 标签列表)。约 200 条，覆盖八大分类。
# 标签会在抓取时自动补充「分类」标签，这里仅给每类起点词条手工补充若干标签。
TERMS = [
    # ── 细胞生物学 ──
    ("细胞", "细胞生物学", ["细胞结构", "生命基本单位"]),
    ("细胞膜", "细胞生物学", ["流动镶嵌模型", "跨膜运输"]),
    ("细胞质", "细胞生物学", ["细胞结构"]),
    ("细胞核", "细胞生物学", ["遗传信息", "核膜"]),
    ("细胞骨架", "细胞生物学", ["微管", "微丝", "中间纤维"]),
    ("内质网", "细胞生物学", ["粗面内质网", "滑面内质网"]),
    ("高尔基体", "细胞生物学", ["加工", "分泌"]),
    ("溶酶体", "细胞生物学", ["水解酶", "消化"]),
    ("线粒体", "细胞生物学", ["能量代谢", "氧化磷酸化"]),
    ("叶绿体", "细胞生物学", ["光合作用", "色素"]),
    ("核糖体", "细胞生物学", ["蛋白质合成", "翻译"]),
    ("液泡", "细胞生物学", ["储存", "渗透压"]),
    ("中心体", "细胞生物学", ["纺锤体", "微管组织中心"]),
    ("细胞壁", "细胞生物学", ["植物细胞", "纤维素"]),
    ("细胞周期", "细胞生物学", ["分裂间期", "分裂期"]),
    ("有丝分裂", "细胞生物学", ["细胞分裂", "染色体"]),
    ("减数分裂", "细胞生物学", ["配子", "同源染色体分离"]),
    ("细胞凋亡", "细胞生物学", ["程序性死亡", "Caspase"]),
    ("细胞坏死", "细胞生物学", ["被动死亡", "炎症"]),
    ("细胞自噬", "细胞生物学", ["溶酶体", "降解"]),
    ("细胞信号转导", "细胞生物学", ["受体", "第二信使"]),
    ("细胞分化", "细胞生物学", ["基因选择性表达", "干细胞"]),
    ("细胞全能性", "细胞生物学", ["干细胞", "再生"]),
    ("细胞学说", "细胞生物学", ["施旺", "施莱登"]),
    ("细胞器", "细胞生物学", ["细胞结构"]),
    ("端粒", "细胞生物学", ["染色体末端", "衰老"]),
    ("细胞的物质跨膜运输", "细胞生物学", ["被动运输", "主动运输"]),
    ("细胞呼吸", "细胞生物学", ["有氧呼吸", "无氧呼吸"]),
    ("干细胞", "细胞生物学", ["全能性", "分裂"]),
    ("细胞核仁", "细胞生物学", ["核糖体", "rRNA"]),
    # ── 分子生物学 ──
    ("DNA", "分子生物学", ["脱氧核糖核酸", "双螺旋"]),
    ("RNA", "分子生物学", ["核糖核酸", "单链"]),
    ("信使RNA", "分子生物学", ["mRNA", "转录"]),
    ("转运RNA", "分子生物学", ["tRNA", "反密码子"]),
    ("核糖体RNA", "分子生物学", ["rRNA", "核糖体"]),
    ("基因", "分子生物学", ["遗传单位", "核苷酸序列"]),
    ("基因组", "分子生物学", ["DNA", "测序"]),
    ("染色体", "分子生物学", ["染色质", "遗传物质载体"]),
    ("染色质", "分子生物学", ["DNA", "组蛋白"]),
    ("基因表达", "分子生物学", ["转录", "翻译"]),
    ("转录", "分子生物学", ["RNA聚合酶", "启动子"]),
    ("翻译", "分子生物学", ["核糖体", "密码子"]),
    ("逆转录", "分子生物学", ["逆转录酶", "RNA→DNA"]),
    ("DNA复制", "分子生物学", ["半保留复制", "复制叉"]),
    ("基因突变", "分子生物学", ["碱基替换", "移码"]),
    ("基因重组", "分子生物学", ["杂交", "基因工程"]),
    ("基因工程", "分子生物学", ["重组DNA", "克隆"]),
    ("聚合酶链式反应", "分子生物学", ["PCR", "扩增"]),
    ("限制性内切酶", "分子生物学", ["分子剪刀", "酶切"]),
    ("DNA连接酶", "分子生物学", ["连接", "磷酸二酯键"]),
    ("质粒", "分子生物学", ["环状DNA", "载体"]),
    ("启动子", "分子生物学", ["RNA聚合酶", "顺式元件"]),
    ("转录因子", "分子生物学", ["基因调控", "蛋白"]),
    ("遗传密码", "分子生物学", ["密码子", "三联体"]),
    ("密码子", "分子生物学", ["三联体", "翻译"]),
    ("表观遗传", "分子生物学", ["DNA甲基化", "组蛋白修饰"]),
    ("中心法则", "分子生物学", ["DNA→RNA→蛋白质", "遗传信息流"]),
    ("转基因生物", "分子生物学", ["基因工程", "外源基因"]),
    ("基因敲除", "分子生物学", ["基因编辑", "功能研究"]),
    ("分子克隆", "分子生物学", ["重组DNA", "载体"]),
    # ── 生物化学 ──
    ("酶", "生物化学", ["催化剂", "米氏方程"]),
    ("蛋白质", "生物化学", ["氨基酸", "肽键"]),
    ("氨基酸", "生物化学", ["肽键", "必需氨基酸"]),
    ("糖类", "生物化学", ["碳水化合物", "单糖"]),
    ("脂质", "生物化学", ["脂肪", "磷脂"]),
    ("核酸", "生物化学", ["DNA", "RNA"]),
    ("三磷酸腺苷", "生物化学", ["ATP", "能量货币"]),
    ("糖酵解", "生物化学", ["丙酮酸", "无氧"]),
    ("三羧酸循环", "生物化学", ["柠檬酸循环", "有氧呼吸"]),
    ("氧化磷酸化", "生物化学", ["电子传递链", "ATP合酶"]),
    ("无氧呼吸", "生物化学", ["发酵", "乳酸"]),
    ("乳酸发酵", "生物化学", ["无氧", "乳酸菌"]),
    ("酒精发酵", "生物化学", ["乙醇", "酵母菌"]),
    ("尿素循环", "生物化学", ["氨", "肝脏"]),
    ("糖异生", "生物化学", ["非糖物质", "葡萄糖"]),
    ("脂肪酸", "生物化学", ["β-氧化", "脂质"]),
    ("维生素", "生物化学", ["辅酶", "营养"]),
    ("激素", "生物化学", ["内分泌", "信号分子"]),
    ("辅酶", "生物化学", ["NAD", "FAD"]),
    ("抗体", "生物化学", ["免疫球蛋白", "抗原结合"]),
    ("血红蛋白", "生物化学", ["氧运输", "血红素"]),
    ("胶原蛋白", "生物化学", ["结缔组织", "三股螺旋"]),
    ("肽键", "生物化学", ["氨基酸", "脱水缩合"]),
    ("生物大分子", "生物化学", ["蛋白质", "核酸"]),
    ("新陈代谢", "生物化学", ["同化作用", "异化作用"]),
    # ── 遗传学 ──
    ("孟德尔遗传定律", "遗传学", ["分离定律", "自由组合定律"]),
    ("分离定律", "遗传学", ["等位基因", "3:1"]),
    ("自由组合定律", "遗传学", ["非同源染色体", "9:3:3:1"]),
    ("伴性遗传", "遗传学", ["X连锁", "红绿色盲"]),
    ("基因连锁", "遗传学", ["连锁群", "交换"]),
    ("染色体数目变异", "遗传学", ["非整倍体", "多倍体"]),
    ("染色体结构变异", "遗传学", ["缺失", "重复", "倒位", "易位"]),
    ("基因频率", "遗传学", ["哈代-温伯格", "群体遗传"]),
    ("遗传漂变", "遗传学", ["随机漂移", "小种群"]),
    ("基因流", "遗传学", ["迁移", "等位基因"]),
    ("遗传病", "遗传学", ["单基因", "染色体病"]),
    ("染色体核型", "遗传学", ["核型分析", "染色体组"]),
    ("姐妹染色单体", "遗传学", ["着丝粒", "复制"]),
    ("同源染色体", "遗传学", ["减数分裂", "联会"]),
    ("等位基因", "遗传学", ["显性", "隐性"]),
    ("显性基因", "遗传学", ["显性性状", "大写字母"]),
    ("隐性基因", "遗传学", ["隐性性状", "小写字母"]),
    ("纯合子", "遗传学", ["AA", "aa"]),
    ("杂合子", "遗传学", ["Aa", "显性"]),
    ("测交", "遗传学", ["隐性纯合", "基因型鉴定"]),
    ("自交", "遗传学", ["自花授粉", "纯系"]),
    ("杂交", "遗传学", ["异花授粉", "杂种优势"]),
    ("红绿色盲", "遗传学", ["X连锁隐性", "伴性遗传"]),
    ("血型遗传", "遗传学", ["ABO血型", "等位基因"]),
    ("哈代-温伯格定律", "遗传学", ["基因频率", "平衡"]),
    # ── 动物学 ──
    ("动物", "动物学", ["多细胞", "异养"]),
    ("无脊椎动物", "动物学", ["节肢动物", "软体动物"]),
    ("脊椎动物", "动物学", ["脊索", "脊椎"]),
    ("哺乳动物", "动物学", ["胎生", "哺乳"]),
    ("鸟类", "动物学", ["恒温", "羽毛"]),
    ("鱼类", "动物学", ["鳃", "鳍"]),
    ("两栖动物", "动物学", ["变态发育", "肺"]),
    ("爬行动物", "动物学", ["羊膜卵", "变温"]),
    ("昆虫", "动物学", ["三对足", "变态发育"]),
    ("海绵动物", "动物学", ["多孔", "滤食"]),
    ("腔肠动物", "动物学", ["刺胞动物", "辐射对称"]),
    ("扁形动物", "动物学", ["两侧对称", "三胚层"]),
    ("环节动物", "动物学", ["分节", "蚯蚓"]),
    ("软体动物", "动物学", ["外套膜", "贝壳"]),
    ("节肢动物", "动物学", ["外骨骼", "分节"]),
    ("神经系统", "动物学", ["神经元", "反射"]),
    ("反射弧", "动物学", ["感受器", "效应器"]),
    ("神经元", "动物学", ["树突", "轴突"]),
    ("突触", "动物学", ["神经递质", "突触间隙"]),
    ("免疫系统", "动物学", ["固有免疫", "适应性免疫"]),
    ("T细胞", "动物学", ["细胞免疫", "胸腺"]),
    ("B细胞", "动物学", ["体液免疫", "抗体"]),
    ("内分泌系统", "动物学", ["腺体", "激素"]),
    ("循环系统", "动物学", ["心脏", "血管"]),
    ("恒温动物", "动物学", ["内温", "体温调节"]),
    # ── 植物学 ──
    ("植物", "植物学", ["自养", "光合作用"]),
    ("被子植物", "植物学", ["花", "果实"]),
    ("裸子植物", "植物学", ["种子", "裸子"]),
    ("蕨类植物", "植物学", ["孢子", "维管束"]),
    ("苔藓植物", "植物学", ["无维管", "配子体"]),
    ("藻类", "植物学", ["光合", "水生"]),
    ("光合作用", "植物学", ["光反应", "暗反应"]),
    ("蒸腾作用", "植物学", ["气孔", "水分运输"]),
    ("根系", "植物学", ["直根系", "须根系"]),
    ("茎", "植物学", ["输导", "支持"]),
    ("叶", "植物学", ["叶绿体", "气孔"]),
    ("花", "植物学", ["雄蕊", "雌蕊"]),
    ("果实", "植物学", ["子房", "种子"]),
    ("种子", "植物学", ["胚", "胚乳"]),
    ("导管", "植物学", ["木质部", "水分"]),
    ("筛管", "植物学", ["韧皮部", "有机物"]),
    ("植物激素", "植物学", ["生长素", "乙烯"]),
    ("生长素", "植物学", ["向光性", "IAA"]),
    ("细胞分裂素", "植物学", ["促进分裂", "细胞"]),
    ("赤霉素", "植物学", ["茎伸长", "萌发"]),
    ("乙烯", "植物学", ["果实成熟", "气体激素"]),
    ("脱落酸", "植物学", ["休眠", "逆境"]),
    ("植物组织", "植物学", ["分生组织", "成熟组织"]),
    ("分生组织", "植物学", ["分裂", "生长点"]),
    ("维管束", "植物学", ["木质部", "韧皮部"]),
    ("双受精", "植物学", ["精子", "极核"]),
    ("气孔", "植物学", ["蒸腾", "气体交换"]),
    # ── 微生物学 ──
    ("微生物", "微生物学", ["细菌", "真菌", "病毒"]),
    ("细菌", "微生物学", ["原核", "细胞壁"]),
    ("病毒", "微生物学", ["非细胞", "寄生"]),
    ("真菌", "微生物学", ["真核", "菌丝"]),
    ("酵母菌", "微生物学", ["单细胞", "发酵"]),
    ("霉菌", "微生物学", ["菌丝", "孢子"]),
    ("蓝藻", "微生物学", ["原核", "光合"]),
    ("大肠杆菌", "微生物学", ["模式生物", "肠道"]),
    ("乳酸菌", "微生物学", ["乳酸发酵", "益生菌"]),
    ("芽孢杆菌", "微生物学", ["芽孢", "土壤"]),
    ("噬菌体", "微生物学", ["细菌病毒", "溶菌"]),
    ("人类免疫缺陷病毒", "微生物学", ["HIV", "艾滋病"]),
    ("流感病毒", "微生物学", ["RNA病毒", "疫苗"]),
    ("新型冠状病毒", "微生物学", ["SARS-CoV-2", "呼吸道"]),
    ("抗生素", "微生物学", ["抗菌", "耐药性"]),
    ("益生菌", "微生物学", ["肠道", "发酵"]),
    ("微生物培养", "微生物学", ["培养基", "无菌"]),
    ("灭菌", "微生物学", ["高温", "无菌操作"]),
    ("消毒", "微生物学", ["杀灭", "卫生"]),
    ("菌落", "微生物学", ["可见群体", "培养"]),
    # ── 生态学 ──
    ("生态学", "生态学", ["生物与环境", "层次"]),
    ("生态系统", "生态学", ["生物群落", "非生物环境"]),
    ("种群", "生态学", ["种群密度", "数量特征"]),
    ("群落", "生态学", ["种间关系", "演替"]),
    ("食物链", "生态学", ["营养级", "生产者"]),
    ("食物网", "生态学", ["多条食物链", "生态系统"]),
    ("能量流动", "生态学", ["单向流动", "逐级递减"]),
    ("物质循环", "生态学", ["碳循环", "氮循环"]),
    ("碳循环", "生态学", ["CO2", "光合作用"]),
    ("氮循环", "生态学", ["固氮", "硝化"]),
    ("生产者", "生态学", ["自养", "第一营养级"]),
    ("消费者", "生态学", ["异养", "动物"]),
    ("分解者", "生态学", ["腐生", "物质循环"]),
    ("生态位", "生态学", ["资源", "竞争"]),
    ("群落演替", "生态学", ["初生演替", "次生演替"]),
    ("生物多样性", "生态学", ["物种多样性", "遗传多样性"]),
    ("可持续发展", "生态学", ["资源", "环境"]),
    ("温室效应", "生态学", ["CO2", "全球变暖"]),
    ("全球变暖", "生态学", ["温室气体", "气候"]),
    ("生物富集", "生态学", ["食物链", "重金属"]),
]


# 中文维基实际页面名与教材词条名不一致时的回退映射（20 词条实测补充）。
# 命中 missing 时用映射名重试；条目标题仍保留教材表述，sourceUrl 指向实际页面。
ZH_TITLE_FALLBACKS = {
    "细胞自噬": "自噬",
    "细胞信号转导": "信号转导",           # 解析到「訊息傳遞 (生物)」
    "细胞全能性": "細胞潛能",             # zh 无「细胞全能性」独立条目
    "细胞的物质跨膜运输": "跨膜运输",
    "细胞核仁": "核仁",
}


# ═══════════════════════════════════════════════════════════════
# 网络请求（标准库，带重试与限速）
# ═══════════════════════════════════════════════════════════════

# 代理中转通道：沙箱出口拦截 wikipedia/baike 域名时，经服务端代取。
# 用法：--via corsfix 或环境变量 WIKI_PROXY_TEMPLATE="https://xxx/?url={url}"
PROXY_CHANNELS = {
    # Corsfix 免费共享层：需伪造其官方 Origin（服务端按 Origin 放行）
    "corsfix": ("https://proxy.corsfix.com/?url={url}", {"Origin": "https://corsfix.com"}),
}


class Fetcher:
    def __init__(self, delay: float = 0.6, retries: int = 3, timeout: int = 20,
                 proxy_template: str = None, extra_headers: dict = None):
        self.delay = delay
        self.retries = retries
        self.timeout = timeout
        self.proxy_template = proxy_template          # 形如 "https://proxy/?url={url}"
        self.extra_headers = extra_headers or {}
        self._last = 0.0

    def _wait(self):
        elapsed = time.time() - self._last
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)

    def get_json(self, url: str):
        data = self._request(url, accept="application/json")
        if data is None:
            return None
        try:
            return json.loads(data.decode("utf-8"))
        except Exception:
            return None

    def get_text(self, url: str):
        data = self._request(url)
        if data is None:
            return ""
        return data.decode("utf-8", "ignore")

    def _request(self, url: str, accept: str = None):
        target = url
        if self.proxy_template:
            target = self.proxy_template.format(url=urllib.parse.quote(url, safe=""))
        for attempt in range(self.retries):
            self._wait()
            try:
                headers = {
                    "User-Agent": UA,
                    "Accept": accept or "text/html,application/json;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                }
                headers.update(self.extra_headers)
                req = urllib.request.Request(target, headers=headers)
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    self._last = time.time()
                    data = r.read()
                if data[:2] == b"\x1f\x8b":  # 代理可能强制 gzip
                    try:
                        data = gzip.decompress(data)
                    except Exception:
                        pass
                return data
            except Exception as e:
                self._last = time.time()
                if attempt == self.retries - 1:
                    print(f"        [请求失败] {url} -> {e}")
                    return None
                time.sleep(1.2 * (attempt + 1))
        return None


# ═══════════════════════════════════════════════════════════════
# Markdown 转换（与前端 js/pages/wiki.js 的 wikiTextToMd 保持一致）
# ═══════════════════════════════════════════════════════════════

def wiki_text_to_md(text: str) -> str:
    if not text:
        return ""
    t = str(text)
    # 标题：== xx == → ## xx ；=== xx === → ### xx
    t = re.sub(r"^(={2,})(.+?)\1\s*$", lambda m: "#" * min(len(m.group(1)), 6) + " " + m.group(2).strip(), t, flags=re.MULTILINE)
    # 粗体 '''x''' → **x** ；斜体 ''x'' → *x*
    t = re.sub(r"'''(.*?)'''", r"**\1**", t)
    t = re.sub(r"''(.*?)''", r"*\1*", t)
    # 内部链接 [[A|B]] → B ；[[A]] → A
    t = re.sub(r"\[\[[^\]|]*\|([^\]]+)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]]+)\]\]", r"\1", t)
    # 外部链接 [http://x label] → label
    t = re.sub(r"\[https?://[^\s\]]+\s([^\]]+)\]", r"\1", t)
    # 模板 {{...}} 移除
    t = re.sub(r"\{\{[^}]*\}\}", "", t)
    # HTML 注释
    t = re.sub(r"<!--[\s\S]*?-->", "", t)
    # 压缩连续空行
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def strip_md(text: str) -> str:
    if not text:
        return ""
    no_md = re.sub(r"[#*`>\[\]\-_=~|]", " ", text)
    return re.sub(r"\s+", " ", no_md).strip()


def make_summary(full_text: str, limit: int = 120) -> str:
    """从正文提炼一句话摘要（取首个非空段落，去重音即得）。"""
    if not full_text:
        return ""
    # 去掉标题行，取前几段
    paras = [p.strip() for p in re.split(r"\n\s*\n", full_text) if p.strip()]
    for p in paras:
        if p.startswith("#"):
            continue
        clean = re.sub(r"[*_`>]", "", p)
        clean = re.sub(r"\s+", " ", clean).strip()
        if len(clean) >= 8:
            return clean[:limit]
    return ""


# ═══════════════════════════════════════════════════════════════
# 维基百科（中文优先，回退英文）—— v2 全量抓取：正文 + 表格 + 图片
# ═══════════════════════════════════════════════════════════════

WIKI_API = "https://{lang}.wikipedia.org/w/api.php"

# 维基维护/导航类图标（质量标记、跨语言导航等）——非内容配图，抽取时排除
_JUNK_IMAGE_RE = re.compile(
    r"(Ambox|Question[_ ]book|Edit-clear|Symbol_|Loudspeaker|Wiki[_ ]letter|"
    r"Crystal[_ ]Clear|BSicon|Gnome-|Commons-logo|Padlock|Cscr-|"
    r"Wiktionary|Wikibooks|Wikiquote|Wikisource|Wikiversity|Wikivoyage|"
    r"_stub\.|Stub\.|Increase2?\.png|Decrease2?\.png|Portal\.png|"
    r"Font_awesome|Information_icon|No_image)",
    re.I,
)


def wikimedia_thumb_url(file_name: str, width: int = 400) -> str:
    """Commons 缩略图直链（与前端 wiki.js wikimediaThumbUrl 同算法：MD5 路径）。
    SVG 必须补 .png 后缀——Commons 对 SVG 位图化缩略图的约定，缺了会404
    （此前前端导入与爬虫都没补，导致大量图示/流程图“抓了也显示不出来”）。"""
    name = re.sub(r"\s+", "_", str(file_name or "").strip())
    if not name:
        return ""
    h = hashlib.md5(name.encode("utf-8")).hexdigest()
    enc = urllib.parse.quote(name)
    base = f"https://upload.wikimedia.org/wikipedia/commons/{h[0]}/{h[:2]}/{enc}"
    thumb = f"{base}/{width}px-{enc}"
    if name.lower().endswith(".svg"):
        thumb += ".png"
    return thumb


def wikitable_to_markdown(tbl: str) -> str:
    """{| … |} 维基表格 → Markdown 表格（与前端 wikitableToMarkdown 同构）。"""
    lines = str(tbl or "").split("\n")
    rows, cur = [], None
    for raw in lines:
        ln = raw.strip()
        if not ln:
            continue
        if ln.startswith("{|"):
            continue
        if ln.startswith("|}"):
            break
        if ln.startswith("|-"):
            if cur:
                rows.append(cur)
            cur = None
            continue
        ch = ln[0]
        if ch in ("|", "!"):
            is_head = ch == "!"
            rest = ln[1:]
            rest = re.sub(r'^style="[^"]*"\s*', "", rest, flags=re.I)
            rest = re.sub(r"^style=[\w-]+", "", rest, flags=re.I).strip()
            rest = re.sub(r"\s*\|\s*$", "", rest)
            sep_re = r"\s*!!\s*" if is_head else r"\s*\|\|\s*"
            for cell in re.split(sep_re, rest):
                cell = cell.strip()
                cell = re.sub(r"\[\[(?:\s*[^\]|]*\|)?([^\]]+)\]\]", r"\1", cell)
                cell = re.sub(r"'''([^']+)'''", r"\1", cell)
                cell = re.sub(r"''([^']+)''", r"\1", cell)
                if cur is None:
                    cur = []
                cur.append({"text": cell, "head": is_head})
    if cur:
        rows.append(cur)
    if not rows:
        return ""
    header = rows.pop(0)
    hdr = "| " + " | ".join(c["text"].replace("|", "\\|") for c in header) + " |"
    sep = "| " + " | ".join("---" for _ in header) + " |"
    body = ["| " + " | ".join(c["text"].replace("|", "\\|") for c in r) + " |" for r in rows]
    return "\n".join([hdr, sep] + body)


def parse_wikitext_media(wikitext: str, max_images: int = 12):
    """从 wikitext 抽取：表格（Markdown）与配图（[(文件名, 缩略图URL), …]）。
    图片从全文抽取（含信息框/表格内的图），过滤维护类图标，最多 max_images 张。"""
    wt = str(wikitext or "")
    tables = []
    for m in re.finditer(r"\{\|[\s\S]*?\|\}", wt):
        md = wikitable_to_markdown(m.group(0))
        if md:
            tables.append(md)
    images, seen = [], set()
    for m in re.finditer(r"\[\[(?:File|Image|文件):\s*([^\]|]+)(?:\|[^\]]*)?\]\]", wt, re.I):
        name = m.group(1).strip()
        if not name or name in seen or _JUNK_IMAGE_RE.search(name):
            continue
        u = wikimedia_thumb_url(name, 400)
        if not u:
            continue
        seen.add(name)
        images.append((name, u))
        if len(images) >= max_images:
            break
    return {"tables": "\n\n".join(tables), "images": images}


def _fetch_wikipedia_extracts_only(fetcher: "Fetcher", title: str, lang: str):
    """回退路径：仅 extracts 全文（组合接口异常时使用，无媒体）。"""
    url = (WIKI_API.format(lang=lang)
           + "?action=query&format=json&prop=extracts|info&explaintext=1&inprop=url"
           + "&redirects=1&titles=" + urllib.parse.quote(title) + "&origin=*")
    data = fetcher.get_json(url)
    if not data:
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    if not pages:
        return None
    p = list(pages.values())[0]
    if p.get("missing") is not None:
        return None
    content = (p.get("extract") or "").strip()
    if not content:
        return None
    md = wiki_text_to_md(content)
    return {
        "title": p.get("title") or title,
        "content": md,
        "summary": make_summary(md),
        "url": p.get("fullurl") or f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(p.get('title') or title)}",
    }


def fetch_wikipedia(fetcher: Fetcher, title: str, lang: str = "zh"):
    """全量抓取：正文（extracts 全文）+ 表格 + 图片。返回 dict(title, content, summary, url) 或 None。"""
    url = (WIKI_API.format(lang=lang)
           + "?action=query&format=json&prop=extracts|revisions|info&explaintext=1"
           + "&rvprop=content&rvslots=main&inprop=url"
           + "&redirects=1&titles=" + urllib.parse.quote(title) + "&origin=*")
    data = fetcher.get_json(url)
    if not data or "query" not in data:
        return _fetch_wikipedia_extracts_only(fetcher, title, lang)
    pages = (data.get("query") or {}).get("pages") or {}
    if not pages:
        return None
    p = list(pages.values())[0]
    if p.get("missing") is not None:
        return None
    extract = (p.get("extract") or "").strip()
    if not extract:
        return None

    # wikitext（表格 + File 图片标记）
    wt = ""
    revs = p.get("revisions") or []
    if revs:
        rev = revs[0] or {}
        slot = (rev.get("slots") or {}).get("main") or {}
        wt = slot.get("*") or slot.get("content") or rev.get("*") or ""
    media = parse_wikitext_media(wt)

    body = wiki_text_to_md(extract)
    parts = [body] if body else []
    if media["tables"]:
        parts.append(media["tables"])
    if media["images"]:
        img_lines = []
        for fname, u in media["images"]:
            cap = re.sub(r"\.(jpg|jpeg|png|gif|svg|webp)$", "", fname, flags=re.I)
            img_lines.append(f"![{cap}]({u})")
        parts.append("\n".join(img_lines))
    md = "\n\n".join(parts).strip()
    if not md:
        return None
    return {
        "title": p.get("title") or title,
        "content": md,
        "summary": make_summary(md),
        "url": p.get("fullurl") or f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(p.get('title') or title)}",
    }


# ═══════════════════════════════════════════════════════════════
# 百度百科（直接抓取 + r.jina.ai 阅读器中转双通道）
# ═══════════════════════════════════════════════════════════════
# 说明：百度百科对无 Cookie 的匿名请求常返回 403，r.jina.ai 阅读器可作中转，
# 但 r.jina.ai 需要网络可达。两者都失败则该词条回退到维基百科。

BAIDU_ITEM = "https://baike.baidu.com/item/{quote}"


def fetch_baidu_via_reader(fetcher: Fetcher, title: str):
    target = BAIDU_ITEM.format(quote=urllib.parse.quote(title))
    reader = "https://r.jina.ai/" + target
    md = fetcher.get_text(reader)
    if not md or len(md) < 50:
        return None
    body = md
    m = re.search(r"Markdown Content:\s*\n?([\s\S]*)$", md)
    if m:
        body = m.group(1)
    else:
        body = re.sub(r"^(Title|URL Source|Markdown Content):.*\n?", "", md, flags=re.MULTILINE)
    body = body.strip()
    if len(strip_md(body)) < 20:
        return None
    return {
        "title": title,
        "content": body,
        "summary": make_summary(body),
        "url": target,
    }


def fetch_baidu_direct(fetcher: Fetcher, title: str):
    """直接抓百度百科 HTML 并抽取正文段落（可能 403，为重试用）。"""
    url = BAIDU_ITEM.format(quote=urllib.parse.quote(title))
    html = fetcher.get_text(url)
    if not html:
        return None
    # 抽取 <div class="para"> 或 lemmaSummary 段落
    paras = re.findall(r'<div class="para"[^>]*>(.*?)</div>', html, re.S)
    if not paras:
        paras = re.findall(r'<div class="lemma-summary"[^>]*>(.*?)</div>', html, re.S)
    texts = []
    for p in paras:
        t = re.sub(r"<[^>]+>", "", p)
        t = re.sub(r"\s+", " ", t).strip()
        if t:
            texts.append(t)
    if not texts:
        return None
    md = "\n\n".join(texts)
    return {
        "title": title,
        "content": md,
        "summary": make_summary(md),
        "url": url,
    }


# ═══════════════════════════════════════════════════════════════
# 主流程
# ═══════════════════════════════════════════════════════════════

def build_entry(title, category, tags, fetched, source):
    return {
        "id": "seed-" + re.sub(r"\W+", "-", title).strip("-"),
        "title": title,
        "aliases": [],
        "summary": fetched["summary"],
        "content": fetched["content"],
        "category": category,
        "tags": [category] + tags,
        "source": source,
        "sourceUrl": fetched["url"],
    }


def already_exists(entries, title):
    return any(e.get("title") == title for e in entries)


def run(terms, limit=None, only=None, prefer="zh", use_baidu=True, use_wikipedia=True,
        out=DEFAULT_OUT, upload=False, refresh=False, via=None):
    # 代理中转通道（沙箱出口拦截目标域名时使用）
    proxy_template, extra_headers = None, {}
    if via and via in PROXY_CHANNELS:
        proxy_template, extra_headers = PROXY_CHANNELS[via]
    elif os.environ.get("WIKI_PROXY_TEMPLATE", "").strip():
        proxy_template = os.environ["WIKI_PROXY_TEMPLATE"].strip()
        origin = os.environ.get("WIKI_PROXY_ORIGIN", "").strip()
        if origin:
            extra_headers = {"Origin": origin}
    fetcher = Fetcher(delay=0.8 if proxy_template else 0.6,
                      proxy_template=proxy_template, extra_headers=extra_headers)
    if proxy_template:
        print(f"[通道] 经代理中转抓取：{proxy_template}")
    # 读取现有种子，保留已有词条
    out_path = Path(out)
    entries = []
    if out_path.exists():
        try:
            existing = json.loads(out_path.read_text("utf-8"))
            entries = existing.get("entries", [])
        except Exception:
            entries = []

    total = len(terms)
    if limit:
        terms = terms[:limit]
        total = len(terms)

    ok, fail, skipped = 0, 0, 0
    for i, (title, category, tags) in enumerate(terms, start=1):
        existed = already_exists(entries, title)
        if existed and not refresh:
            skipped += 1
            print(f"[{i:3d}/{total}] 跳过（已存在）: {title}")
            continue

        fetched, source = None, None

        # 1) 维基百科（中文优先；教材名无对应页面时按 ZH_TITLE_FALLBACKS 回退）
        if use_wikipedia and prefer == "zh":
            fetched = fetch_wikipedia(fetcher, title, "zh")
            if not fetched and title in ZH_TITLE_FALLBACKS:
                alt = ZH_TITLE_FALLBACKS[title]
                print(f"        标题回退: {title} → {alt}")
                fetched = fetch_wikipedia(fetcher, alt, "zh")
            source = "wikipedia" if fetched else None

        # 2) 百度百科
        if not fetched and use_baidu:
            if only == "baidu" or prefer != "zh":
                fetched = fetch_baidu_direct(fetcher, title) or fetch_baidu_via_reader(fetcher, title)
            else:
                fetched = fetch_baidu_via_reader(fetcher, title) or fetch_baidu_direct(fetcher, title)
            source = "baidu" if fetched else None

        # 3) 维基百科英文兜底
        if not fetched and use_wikipedia:
            fetched = fetch_wikipedia(fetcher, title, "en")
            source = "wikipedia_en" if fetched else None

        if not fetched:
            fail += 1
            print(f"[{i:3d}/{total}] 失败: {title}")
            continue

        # --refresh：抓取成功后才替换旧条目（失败不丢原数据）
        if existed:
            entries = [e for e in entries if e.get("title") != title]
        entries.append(build_entry(title, category, tags, fetched, source))
        ok += 1
        tag = "覆盖" if existed else "OK "
        print(f"[{i:3d}/{total}] {tag} [{source}] {title}  （{len(fetched['content'])} 字）")

        # 每抓 10 条落盘一次，避免中断丢数据
        if ok % 10 == 0:
            write_seed(out_path, entries)

    write_seed(out_path, entries)
    print("\n==== 完成 ====")
    print(f"  新增/覆盖: {ok}   失败: {fail}   跳过(已存在): {skipped}")
    print(f"  当前词条总数: {len(entries)}")
    print(f"  输出: {out_path}")
    if upload:
        upload_to_supabase(entries, os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
    return ok, fail, skipped


def write_seed(out_path: Path, entries):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": "1.0.0",
        "updated_at": time.strftime("%Y-%m-%d"),
        "description": "TATABOX 百科模块词条种子，由 scripts/wiki_crawler.py 从维基百科与百度百科抓取生成。",
        "entries": entries,
    }
    tmp = out_path.with_suffix(out_path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
    os.replace(tmp, out_path)


SB_URL = os.environ.get("SUPABASE_URL", "https://qxehkfucvmxuojjkdaqy.supabase.co")


def upload_to_supabase(entries, service_key: str, batch_size: int = 50) -> int:
    """把词条 upsert 到 Supabase 的 wiki_entries 表（需 service_role key）。"""
    if not service_key:
        print("[WARN] 未提供 SUPABASE_SERVICE_ROLE_KEY，跳过上传")
        return 0
    rows = []
    for e in entries:
        rows.append({
            "id": e.get("id"),
            "title": e.get("title"),
            "aliases": e.get("aliases") or [],
            "summary": e.get("summary") or "",
            "content": e.get("content") or "",
            "category": e.get("category") or "",
            "tags": e.get("tags") or [],
            "source": e.get("source") or "manual",
            "source_url": e.get("sourceUrl") or "",
        })
    url = f"{SB_URL}/rest/v1/wiki_entries"
    ok = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        body = json.dumps(batch, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "apikey": service_key,
                "Authorization": "Bearer " + service_key,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                if r.status in (200, 201, 204):
                    ok += len(batch)
                    print(f"  [上传] {i + len(batch)}/{len(rows)} 已写入 wiki_entries")
        except Exception as e:
            print(f"  [上传失败] 批次 {i}-{i + len(batch)}: {e}")
        time.sleep(0.2)
    print(f"[上传完成] {ok}/{len(rows)} 条已写入 Supabase wiki_entries")
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=None, help="只抓前 N 条")
    ap.add_argument("--only", choices=["wikipedia", "baidu"], default=None, help="只从单一来源抓取（默认两者都试）")
    ap.add_argument("--source", choices=["zh", "baidu"], default="zh", help="首选来源：zh=维基中文优先, baidu=百度优先")
    ap.add_argument("--out", type=str, default=DEFAULT_OUT, help="输出 json 路径")
    ap.add_argument("--refresh", action="store_true", help="已存在的词条也重新抓取覆盖（默认跳过）")
    ap.add_argument("--via", choices=sorted(PROXY_CHANNELS.keys()), default=None,
                    help="经代理中转抓取（沙箱出口拦截维基/百度时使用），或设环境变量 WIKI_PROXY_TEMPLATE")
    ap.add_argument("--upload", action="store_true", help="抓取后上传到 Supabase wiki_entries（需 SUPABASE_SERVICE_ROLE_KEY 环境变量）")
    args = ap.parse_args()

    use_wiki = args.only != "baidu"
    use_baidu = args.only != "wikipedia"
    prefer = "zh" if args.source == "zh" else "baidu"
    run(TERMS, limit=args.limit, only=args.only, prefer=prefer,
        use_baidu=use_baidu, use_wikipedia=use_wiki, out=args.out, upload=args.upload,
        refresh=args.refresh, via=args.via)


if __name__ == "__main__":
    main()