"""
TATABOX 题目生成服务 v7.0 — 高质量严审题版
存储: Supabase PostgreSQL + 本地 pool.json 备份
API: NVIDIA NIM 免费 API（Qwen3.5 生成+自检）

核心改进:
1. 极严格的质量控制: 多轮自检 + 干扰项相似度 + 科学事实校验
2. 高考/竞赛双轨生成: 严格区分课标范围与大学拓展内容
3. 精细化标签: module/subject/concept/tags 支持知识图谱专项练习
4. CLI 可控: 类型、数量、模块、间隔生成均可配置
5. 零依赖: 仅 Python 标准库

用法:
  python server.py                      # 启动 HTTP 服务并自动补货
  python server.py --mode generate --type competition --count 30 --interval 3
  python server.py --mode generate --type gaokao --modules module_1,module_3 --count 20
"""

import json
import time
import random
import threading
import logging
import os
import hashlib
import base64
import urllib.request
import urllib.error
import http.server
import socketserver
import argparse
import re
import concurrent.futures
from pathlib import Path
from difflib import SequenceMatcher

# ==================== 日志（必须在配置检查前初始化）====================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler("server.log", encoding="utf-8"), logging.StreamHandler()]
)
log = logging.getLogger("bio")

# ╔══════════════════════════════════════════════════════════════╗
# ║  配置区：优先从环境变量读取（.env / 系统环境变量）           ║
# ║  本地开发：复制 .env.example 为 .env 并填入真实值            ║
# ╚══════════════════════════════════════════════════════════════╝

def _load_dotenv():
    """零依赖加载 .env 文件（不覆盖已存在的系统环境变量）"""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text("utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip("'\"")
        if k and k not in os.environ:
            os.environ[k] = v

_load_dotenv()

NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
ZHIPU_API_KEY  = os.environ.get("ZHIPU_API_KEY", "")   # 修复 P0-2：可选 Zhipu，避免 NVIDIA 限流
SUPABASE_URL   = os.environ.get("SUPABASE_URL", "https://qxehkfucvmxuojjkdaqy.supabase.co")
SUPABASE_KEY   = os.environ.get("SUPABASE_KEY", "")
# Service Role Key：仅服务端使用，用于 Storage 上传等需要绕过 RLS 的场景（绝不暴露到前端）
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
# ╔══════════════════════════════════════════════════════════════╝

# 启动时检查关键配置
if not NVIDIA_API_KEY and not ZHIPU_API_KEY:
    log.warning("⚠️  NVIDIA_API_KEY 和 ZHIPU_API_KEY 均未配置，AI 功能将不可用（请在 .env 设置其一）")
if not SUPABASE_KEY:
    log.warning("⚠️  SUPABASE_KEY 未配置（请在 .env 或环境变量中设置），云端存储将不可用")
if not SUPABASE_SERVICE_ROLE_KEY:
    log.warning("⚠️  SUPABASE_SERVICE_ROLE_KEY 未配置，PDF 上传到 Storage 将不可用")

# 修复 P0-2：优先使用 Zhipu（免费 GLM-4-Flash 稳定），NVIDIA 作为备选
if ZHIPU_API_KEY:
    API_BASE       = "https://open.bigmodel.cn/api/paas/v4"
    PRIMARY_MODEL  = "glm-4-flash"
    SELF_CHECK_MODEL = "glm-4-flash"
    FALLBACK_MODEL = "glm-4-flash"
    TUTOR_MODEL    = "glm-4-flash"
    DEFAULT_API_KEY = ZHIPU_API_KEY
    log.info("✅ 使用 Zhipu GLM-4-Flash 作为默认 AI 服务（ZHIPU_API_KEY 已配置）")
else:
    API_BASE       = "https://integrate.api.nvidia.com/v1"
    PRIMARY_MODEL  = "qwen/qwen3.5-397b-a17b"          # 397B MoE，命题生成+自检
    SELF_CHECK_MODEL = "qwen/qwen3.5-397b-a17b"         # 397B，同模型自检
    FALLBACK_MODEL = "z-ai/glm-5.1"                     # 限流时备用
    TUTOR_MODEL    = "meta/llama-3.3-70b-instruct"      # AI 导师对话模型（稳定可用）
    DEFAULT_API_KEY = NVIDIA_API_KEY
    log.info("✅ 使用 NVIDIA NIM 作为默认 AI 服务（NVIDIA_API_KEY 已配置）")

FAST_MODEL = PRIMARY_MODEL  # 别名兼容
QWEN = SELF_CHECK_MODEL     # 别名兼容

POOL_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "pool.json")
POOL_MIN  = 100
MAX_RETRY = 5

# 静态文件目录（项目根目录：tools/python/ 上溯两级）
STATIC_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# MIME 类型映射
MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
}
TIMEOUT   = 300
START_TIME = time.time()

# Supabase 写入状态：若因 RLS 策略持续 401，则后续跳过上传，仅保留本地 pool.json
_supabase_write_ok = None

# ==================== 线程锁 ====================
pool_lock = threading.Lock()
_refill_lock = threading.Lock()

# ==================== 知识图谱概念映射 ====================
# 用于给题目打 concept 标签，使思维图谱点击节点可进入专项练习
CONCEPT_MAP = {
    "module_1": {
        "细胞生物学": ["细胞结构", "细胞膜", "细胞器", "细胞周期", "细胞信号转导", "细胞凋亡", "细胞连接", "细胞骨架", "膜运输"],
        "分子生物学": ["DNA结构", "DNA复制", "转录", "翻译", "基因表达调控", "PCR技术", "RNA加工", "操纵子", "表观遗传"],
        "生物化学":   ["酶", "糖酵解", "柠檬酸循环", "三羧酸循环", "氧化磷酸化", "氨基酸代谢", "蛋白质结构", "脂质代谢", "糖代谢"]
    },
    "module_2": {
        "植物学":   ["植物组织", "光合作用", "植物激素", "植物物质运输", "植物生殖", "植物发育"],
        "微生物学": ["细菌", "病毒", "微生物生态", "抗生素", "发酵", "免疫原性"]
    },
    "module_3": {
        "动物学":   ["动物组织", "神经系统", "免疫系统", "内分泌系统", "循环系统", "消化系统", "呼吸系统", "排泄系统"],
        "生态学":   ["生态系统", "种群生态", "群落生态", "物质循环", "生物多样性", "种间关系", "群落演替"]
    },
    "module_4": {
        "遗传学":     ["孟德尔遗传", "连锁与交换", "伴性遗传", "基因突变", "染色体变异", "群体遗传"],
        "进化生物学": ["自然选择", "物种形成", "系统发育", "分子进化"],
        "生物信息学": ["序列比对", "基因组学", "进化树", "数据库"]
    }
}

MODULE_SUBJECTS = {
    "module_1": ["生物化学", "分子生物学", "细胞生物学"],
    "module_2": ["植物学", "植物生理学", "微生物学"],
    "module_3": ["动物学", "动物生理学", "生态学"],
    "module_4": ["遗传学", "进化生物学", "演化生物学", "生物信息学", "群体遗传学"]
}

MODULE_NAMES = {
    "module_1": "生物化学、细胞生物学、分子生物学",
    "module_2": "植物学、植物生理学、微生物学",
    "module_3": "动物学、动物生理学、生态学",
    "module_4": "遗传学、进化生物学、生物信息学"
}

# 知识图谱 label 列表（与 js/pages/knowledge-graph.js 的 GRAPH_NODES label 严格对齐）
# 生成的题目 concept 必须取自此列表，确保图谱点击节点能精确匹配到对应题目
GRAPH_LABELS = {
    "module_1": [
        # 细胞生物学
        "细胞结构", "细胞膜", "细胞器", "细胞周期", "细胞信号转导", "细胞凋亡",
        # 分子生物学
        "DNA结构", "DNA复制", "转录", "翻译", "基因表达调控", "PCR技术",
        # 生物化学
        "酶", "糖酵解", "柠檬酸循环", "氧化磷酸化", "氨基酸代谢"
    ],
    "module_2": [
        # 植物学
        "植物组织", "光合作用", "植物激素", "植物物质运输",
        # 微生物学
        "细菌", "病毒", "微生物生态"
    ],
    "module_3": [
        # 动物学
        "动物组织", "神经系统", "免疫系统", "内分泌系统", "循环系统",
        # 生态学
        "生态系统", "种群生态", "群落生态", "物质循环", "生物多样性"
    ],
    "module_4": [
        # 遗传学
        "孟德尔遗传", "连锁与交换", "伴性遗传", "基因突变", "染色体变异", "群体遗传"
    ]
}

# 高中人教版常见核心概念，用于引导模型生成多样化题目（命题方向提示，不作为 concept 值）
HS_CONCEPTS = {
    "module_1": ["细胞膜结构与功能", "细胞器分工", "酶的特性", "ATP", "细胞呼吸", "有丝分裂", "细胞分化", "DNA复制", "基因表达", "细胞癌变"],
    "module_2": ["光合作用", "植物激素", "植物物质运输", "细菌", "病毒"],
    "module_3": ["内环境稳态", "神经调节", "体液调节", "免疫调节", "种群特征", "群落演替", "生态系统能量流动", "物质循环", "生物多样性"],
    "module_4": ["孟德尔分离定律", "自由组合定律", "伴性遗传", "基因突变", "染色体变异", "自然选择", "物种形成", "PCR技术"]
}

DIFF_NAMES  = {"basic":"高考基础","league":"全国联赛","national":"国赛选拔"}
TARGET_NAMES = {"high_school":"高考生(仅高中课标)","competition":"竞赛生(含大学基础生物学)","both":"高考与竞赛重叠基础","multi_judge":"2025联赛多重判断(每选项独立T/F)"}

GAOKAO_PROP_RULES = """
高考生物命题规则（参考课程标准+《高中必刷题》风格）：
1. 情境创设：必须使用具体生物名称（如"大肠杆菌"非"某种细菌"）、经典实验（如"孟德尔豌豆杂交实验"）或真实生活情境
2. 认知层次：理解→应用→分析，至少达到"应用"层次，禁止纯识记题（如"下列哪个是细胞器"）
3. 选项设计：4个选项同层级、同长度范围（±50%）、互斥；干扰项基于学生常见错误概念
4. 干扰项来源：教材易混淆点（如光合作用vs呼吸作用、减数分裂vs有丝分裂）、概念误解（如"酶都是蛋白质"）
5. 解析规范：逐选项说明对错原因，每个选项≥20字，总解析≥100字，末尾回归知识点
6. 禁止：模糊表述、超纲术语、"以上都对/都错"、纯英文缩写（教材未出现的）
"""

COMPETITION_PROP_RULES = """
生物学竞赛命题规则（参考CBO大纲+奥赛讲义配套习题册风格）：
1. 知识深度：覆盖大学普通生物学，可涉及具体酶（如DNA聚合酶III）、信号通路（如cAMP-PKA）、实验技术（如Western blot）
2. 情境创设：科研前沿（如CRISPR-Cas9应用）、经典实验复现（如Meselson-Stahl实验）、数据分析
3. 干扰项设计：体现竞赛生高级误解，需深入理解才能排除（如"中心法则不可逆"的错误理解）
4. 图表分析：可要求基于实验数据表格/图表进行判断
5. 解析规范：逐选项分析+知识点延伸，总解析≥120字，可适当引用教材/文献
6. 答案唯一性：确保只有一个最佳答案，避免歧义
"""

# ==================== Supabase 工具函数 ====================

def sb_request(method, path, data=None, query=None, prefer="return=representation"):
    """Supabase REST API 原生请求（零依赖）"""
    # 未配置密钥时直接短路，避免每次请求都等网络超时（云端存储不可用）
    if not SUPABASE_KEY:
        return None
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer
    }
    if method == "GET" and not query:
        url += "?select=*"
    elif query:
        url += "?" + query
    payload = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with _NO_PROXY_OPENER.open(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else []
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="ignore")
        log.error(f"Supabase {method} {path} 错误 {e.code}: {err[:200]}")
        return None
    except Exception as e:
        log.error(f"Supabase {method} {path} 异常: {e}")
        return None


def sb_upsert(question):
    """插入或更新单道题目到 Supabase（使用 upsert 模式避免主键冲突）"""
    global _supabase_write_ok
    if _supabase_write_ok is False:
        return False
    record = _build_record(question)
    result = sb_request("POST", "questions", record,
                        prefer="return=representation,resolution=merge-duplicates")
    if result is None:
        log.warning(f"Supabase 写入失败: {question['id']}")
    return result is not None


def sb_fetch_all():
    """从 Supabase 拉取全部题目（匹配现有表结构）"""
    result = sb_request("GET", "questions")
    if result is None:
        log.warning("Supabase 拉取失败，回退到本地 pool.json")
        return None
    pool = []
    for row in result:
        try:
            # 解析 sub_questions 为 options 和 answer
            sq = row.get("sub_questions") or []
            options = {}
            answer = {}
            if isinstance(sq, list):
                for item in sq:
                    label = item.get("label", "")
                    text = item.get("text", "")
                    is_correct = item.get("answer", False)
                    if label:
                        options[label] = text
                        answer[label] = is_correct
            elif isinstance(sq, dict):
                options = sq
                answer = "A"  # fallback

            # 解析 answer 字符串 "A:T,B:F,..." 格式
            answer_str = row.get("answer", "")
            if isinstance(answer_str, str) and ":" in answer_str and "," in answer_str:
                answer = {}
                for part in answer_str.split(","):
                    if ":" in part:
                        k, v = part.split(":", 1)
                        answer[k.strip()] = v.strip().upper() == "T"

            # 若表结构没有 target 列，尝试从 tags 恢复
            tags = row.get("tags") or []
            target = row.get("target")
            if not target and tags:
                for t in ["high_school", "competition", "both", "multi_judge"]:
                    if t in tags:
                        target = t
                        break
            target = target or "competition"

            q = {
                "id": row.get("id", f"bio_{int(time.time()*1000)}_{random.randint(0,9999):04d}"),
                "stem": row.get("question") or "",
                "options": options,
                "answer": answer,
                "analysis": row.get("explanation") or "",
                "knowledge": tags,
                "module": row.get("module", "module_1"),
                "difficulty": row.get("difficulty", "medium"),
                "target": target,
                "subject": row.get("subject", ""),
                "concept": row.get("concept", ""),
                "tags": tags,
                "weight": row.get("weight", 1.0),
                "fb_good": row.get("fb_good", 0),
                "fb_bad": row.get("fb_bad", 0),
                "created_at": time.time()
            }
            pool.append(q)
        except Exception as e:
            log.warning(f"解析 Supabase 行失败: {e}, row keys: {list(row.keys())[:5]}")
            continue
    return pool


def sb_update_weight(qid, weight, fb_good, fb_bad):
    """更新题目权重和反馈计数"""
    data = {"weight": weight, "fb_good": fb_good, "fb_bad": fb_bad}
    url = f"{SUPABASE_URL}/rest/v1/questions?id=eq.{qid}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers, method="PATCH")
    try:
        with _NO_PROXY_OPENER.open(req, timeout=15) as resp:
            return True
    except Exception as e:
        log.error(f"Supabase 更新权重失败 {qid}: {e}")
        return False


def sb_update_tags(qid, subject, concept, tags):
    """更新题目标签（用于重新打标）"""
    data = {"subject": subject, "concept": concept, "tags": tags}
    url = f"{SUPABASE_URL}/rest/v1/questions?id=eq.{qid}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers, method="PATCH")
    try:
        with _NO_PROXY_OPENER.open(req, timeout=15) as resp:
            return True
    except Exception as e:
        log.error(f"Supabase 更新标签失败 {qid}: {e}")
        return False

# ========== 池子读写（本地 + Supabase 双写）==========
_local_cache = []
_cache_time = 0
CACHE_TTL = 30  # 本地缓存30秒

def load(force=False):
    global _local_cache, _cache_time
    # 缓存命中：避免每次请求都全量拉取 Supabase
    if not force and _local_cache and (time.time() - _cache_time) < CACHE_TTL:
        return list(_local_cache)
    # 同时读取本地与 Supabase，按 id 合并（本地覆盖远端），避免本地新生成的题目被 Supabase 旧数据覆盖
    p = Path(POOL_FILE)
    local_pool = []
    if p.exists():
        try:
            local_pool = json.loads(p.read_text("utf-8"))
        except Exception as e:
            log.warning(f"本地 pool.json 解析失败: {e}")

    sb_pool = sb_fetch_all()
    if sb_pool is not None:
        merged = {}
        for q in sb_pool:
            qid = q.get("id") or f"bio_{int(time.time()*1000)}_{random.randint(0,9999):04d}"
            q["id"] = qid
            merged[qid] = q
        for q in local_pool:
            qid = q.get("id") or f"bio_{int(time.time()*1000)}_{random.randint(0,9999):04d}"
            q["id"] = qid
            merged[qid] = q
        merged_list = list(merged.values())
        _local_cache = merged_list
        _cache_time = time.time()
        with pool_lock:
            Path(POOL_FILE).write_text(json.dumps(merged_list, ensure_ascii=False, indent=2), "utf-8")
        return merged_list

    if local_pool:
        _local_cache = local_pool
        _cache_time = time.time()
        return local_pool
    return []

def _build_record(question):
    """把内部题目对象转换为 Supabase 表记录"""
    sub_questions = []
    if question.get("options"):
        opts = question["options"]
        labels = sorted(opts.keys())
        answer = question.get("answer", "")
        for label in labels:
            if isinstance(answer, dict):
                is_correct = answer.get(label, False)
            else:
                is_correct = (answer == label)
            sub_questions.append({"label": label, "text": opts[label], "answer": is_correct})

    if isinstance(question.get("answer"), dict):
        answer_str = ",".join(f"{k}:{'T' if v else 'F'}" for k, v in sorted(question["answer"].items()))
    else:
        answer_str = question.get("answer", "")

    tags = list(question.get("tags", []))
    q_target = question.get("target", "competition")
    if q_target and q_target not in tags:
        tags.append(q_target)

    return {
        "id": question["id"],
        "module": question.get("module", "module_1"),
        "type": question.get("type", "mtf"),
        "question": question.get("stem", ""),
        "subject": question.get("subject", ""),
        "concept": question.get("concept", ""),
        "difficulty": question.get("difficulty", "medium"),
        "target": q_target,
        "answer": answer_str,
        "explanation": question.get("analysis", ""),
        "options": [],
        "sub_questions": sub_questions,
        "tags": tags,
        "chart": question.get("chart"),
        "year": question.get("year"),
        "source": question.get("source", "server.py")
    }


def sb_upsert_batch(questions):
    """批量插入/更新题目到 Supabase"""
    global _supabase_write_ok
    if _supabase_write_ok is False or not questions:
        return False
    records = [_build_record(q) for q in questions]
    result = sb_request(
        "POST",
        "questions",
        records,
        query=None,
        prefer="resolution=merge-duplicates, return=minimal"
    )
    if result is None:
        log.warning(f"Supabase 批量写入失败: {len(records)} 题")
        return False
    return True


def save(pool, new=None):
    """原子写入 pool + 同步 Supabase。
    写入流程：先写 .tmp 文件，fsync 后 rename 覆盖（POSIX/Windows 兼容），
    避免写入过程中崩溃导致 pool.json 损坏。
    """
    global _supabase_write_ok, _local_cache, _cache_time
    tmp_file = POOL_FILE + ".tmp"
    try:
        with pool_lock:
            # 原子写入：先写 .tmp 再 rename（Windows 下 rename 会覆盖现有文件）
            data = json.dumps(pool, ensure_ascii=False, indent=2)
            with open(tmp_file, "w", encoding="utf-8") as f:
                f.write(data)
                f.flush()
                try:
                    os.fsync(f.fileno())
                except (AttributeError, OSError):
                    pass  # Windows 某些文件系统不支持 fsync
            os.replace(tmp_file, POOL_FILE)
            _local_cache = list(pool)
            _cache_time = time.time()
    except Exception as e:
        log.error(f"save 写入失败: {e}")
        # 清理临时文件
        try:
            if os.path.exists(tmp_file):
                os.remove(tmp_file)
        except Exception:
            pass
        return
    # 同步到 Supabase：如有 new 则上传全部新题，否则兜底上传最后10题
    if _supabase_write_ok is False:
        # 每5分钟重试一次，避免因临时网络/RLS问题永久禁用
        if time.time() - getattr(save, '_last_fail_time', 0) < 300:
            return
        log.info("Supabase 写入重试中...")
    to_upload = new if new else (pool[-10:] if pool else [])
    if not to_upload:
        return
    # 批量写入，带重试；失败则回退单条写入并记录状态
    for retry in range(3):
        if sb_upsert_batch(to_upload):
            _supabase_write_ok = True
            if retry > 0:
                log.info(f"Supabase 批量写入重试第{retry}次成功")
            return
        log.warning(f"Supabase 批量写入失败，第{retry+1}/3次重试...")
        time.sleep(2 ** retry)
    failures = 0
    for q in to_upload:
        if not sb_upsert(q):
            failures += 1
    if failures == len(to_upload):
        _supabase_write_ok = False
        save._last_fail_time = time.time()
        log.warning("Supabase 连续写入失败（可能是 RLS 策略限制），后续仅保留本地 pool.json")

# ========== 原生 HTTP API 调用（替代 openai 库）==========
# 强制不走代理（避免 IDE/系统代理设置导致 WinError 10061）
_NO_PROXY_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def api_call(model, messages, temperature=0.3, max_tokens=1024, json_mode=True,
             api_base=None, api_key=None):
    """调用 LLM chat completions。api_base/api_key 为用户自定义配置（优先于全局）。"""
    base = api_base or API_BASE
    key = api_key or DEFAULT_API_KEY  # 修复 P0-2：用 DEFAULT_API_KEY 替代硬编码 NVIDIA_API_KEY
    url = f"{base}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        },
        method="POST"
    )

    for attempt in range(MAX_RETRY):
        try:
            with _NO_PROXY_OPENER.open(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            if e.code == 429 or "rate" in err_body.lower():
                wait = min(10 * (attempt + 1), 60)
                log.warning(f"限流，等待{wait}s后重试({attempt+1}/{MAX_RETRY})")
                time.sleep(wait)
            elif attempt < MAX_RETRY - 1:
                time.sleep(1)
            else:
                log.error(f"API 错误 {e.code}: {err_body[:200]}")
                return None
        except Exception as e:
            if attempt < MAX_RETRY - 1:
                time.sleep(1)
            else:
                log.error(f"API 异常: {e}")
                return None
    return None


def api_call_vision(model, messages, temperature=0.2, max_tokens=2000,
                    api_base=None, api_key=None, json_mode=True):
    """调用 vision 模型（支持多模态 content 列表）。
    messages 中 user.content 应为 [{type, text/image_url}, ...] 格式。
    失败时自动重试（不含限流特殊处理，因 vision API 限流策略不同）。"""
    base = api_base or API_BASE
    key = api_key or DEFAULT_API_KEY
    url = f"{base}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        },
        method="POST"
    )

    last_err = None
    for attempt in range(MAX_RETRY):
        try:
            with _NO_PROXY_OPENER.open(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            last_err = f"HTTP {e.code}: {err_body[:200]}"
            if e.code == 429 or "rate" in err_body.lower():
                wait = min(10 * (attempt + 1), 60)
                log.warning(f"限流，等待{wait}s后重试({attempt+1}/{MAX_RETRY})")
                time.sleep(wait)
            elif attempt < MAX_RETRY - 1:
                time.sleep(1)
            else:
                log.error(f"Vision API 错误 {e.code}: {err_body[:200]}")
                return None
        except Exception as e:
            last_err = str(e)
            if attempt < MAX_RETRY - 1:
                time.sleep(1)
            else:
                log.error(f"Vision API 异常: {e}")
                return None
    log.error(f"Vision API 最终失败: {last_err}")
    return None


def api_call_stream(model, messages, temperature=0.7, max_tokens=2048,
                    api_base=None, api_key=None):
    """流式调用 AI API，逐 chunk 产出文本（用于 AI 导师对话 SSE）。
    失败时自动降级到非流式调用。"""
    base = api_base or API_BASE
    key = api_key or DEFAULT_API_KEY  # 修复 P0-2：用 DEFAULT_API_KEY 替代硬编码 NVIDIA_API_KEY
    url = f"{base}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
        },
        method="POST"
    )
    try:
        resp = _NO_PROXY_OPENER.open(req, timeout=30)
        buf = b""
        got_any = False
        for chunk in iter(lambda: resp.read(1024), b""):
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                line = line.strip()
                if not line or line == b"data: [DONE]":
                    continue
                if line.startswith(b"data: "):
                    try:
                        obj = json.loads(line[6:])
                        delta = obj.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content")
                        if content:
                            got_any = True
                            yield content
                    except json.JSONDecodeError:
                        continue
        resp.close()
        if not got_any:
            # 流式无输出，降级到非流式
            log.warning("流式无输出，降级到非流式调用")
            yield from _fallback_non_stream(model, messages, temperature, max_tokens,
                                            api_base=base, api_key=key)
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="ignore")
        log.error(f"流式 API 错误 {e.code}: {err[:200]}")
        # 降级到非流式
        yield from _fallback_non_stream(model, messages, temperature, max_tokens,
                                        api_base=base, api_key=key)
    except Exception as e:
        log.error(f"流式 API 异常: {e}")
        yield from _fallback_non_stream(model, messages, temperature, max_tokens,
                                        api_base=base, api_key=key)


def _fallback_non_stream(model, messages, temperature, max_tokens,
                         api_base=None, api_key=None):
    """非流式降级：一次性调用并逐字产出"""
    try:
        resp = api_call(model, messages, temperature=temperature,
                        max_tokens=max_tokens, json_mode=False,
                        api_base=api_base, api_key=api_key)
        if resp and resp.get("choices"):
            content = resp["choices"][0]["message"]["content"]
            # 模拟流式：按句号/换行分段产出
            parts = []
            current = ""
            for ch in content:
                current += ch
                if ch in "。！？\n；":
                    parts.append(current)
                    current = ""
            if current:
                parts.append(current)
            for part in parts:
                yield part
        else:
            yield "[ERROR] AI 服务暂时不可用，请稍后重试"
    except Exception as e:
        yield f"[ERROR] {e}"


# 用户自定义 API Key 配置解析（从请求头读取，仅个人使用）
# 服务商 → base_url 映射（与前端 _AI_PROVIDER_MAP 对齐）
_PROVIDER_BASE = {
    "deepseek":    "https://api.deepseek.com/v1",
    "zhipu":       "https://open.bigmodel.cn/api/paas/v4",
    "qwen":        "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "moonshot":    "https://api.moonshot.cn/v1",
    "nvidia":      "https://integrate.api.nvidia.com/v1",
    "siliconflow": "https://api.siliconflow.cn/v1",
}
_PROVIDER_DEFAULT_MODEL = {
    "deepseek":    "deepseek-chat",
    "zhipu":       "glm-4-flash",
    "qwen":        "qwen-turbo",
    "moonshot":    "moonshot-v1-8k",
    "nvidia":      "meta/llama-3.3-70b-instruct",
    "siliconflow": "Qwen/Qwen2.5-7B-Instruct",
}


def _resolve_user_api(headers):
    """从请求头解析用户自定义 API 配置。
    返回 (api_base, api_key, model, provider) 或 None。
    headers: BaseHTTPRequestHandler.headers
    """
    try:
        key = headers.get("X-User-Api-Key") or headers.get("x-user-api-key")
        if not key:
            return None
        provider = (headers.get("X-User-Provider") or headers.get("x-user-provider") or "deepseek").lower()
        model = headers.get("X-User-Model") or headers.get("x-user-model") or ""
        base = _PROVIDER_BASE.get(provider)
        if not base:
            return None
        if not model:
            model = _PROVIDER_DEFAULT_MODEL.get(provider, "deepseek-chat")
        return (base, key, model, provider)
    except Exception:
        return None


# ========== AI 导师系统提示词 ==========
TUTOR_SYSTEM_PROMPTS = {
    "general": (
        "你是 TATABOX AI 生物导师，一位耐心、专业的高中生物老师。"
        "你的职责是用清晰、生动的语言讲解生物学概念，帮助学生理解而非死记。"
        "规则：\n"
        "1. 回答要准确、科学，符合高中生物课程标准\n"
        "2. 用类比、举例让抽象概念具象化\n"
        "3. 适当联系高考考点，但不堆砌术语\n"
        "4. 回答以文字为主，重点突出，控制在 300 字以内\n"
        "5. 仅当有助于理解且必要时，可在回复中嵌入一个简单的 SVG 图表（如示意图、流程图），"
        "用 ```svg 代码块包裹。SVG 宽高不超过 400，使用简洁的几何形状和文字标注。"
        "不要用 SVG 替代文字解释，文字说明始终是主要内容。\n"
        "6. 不要输出任何 [[ANIM:xxx]] 标记，不要输出动画指令。"
    ),
    "mendel": (
        "你是格雷戈尔·孟德尔（1822-1884），现代遗传学之父。"
        "你在布尔诺修道院的花园里用豌豆进行了8年杂交实验，发现了分离定律和自由组合定律。"
        "请以第一人称讲述你的发现，语气谦逊、严谨，带有一点对科学的热忱。"
        "用 19 世纪科学家的口吻，但语言要让学生能理解。"
        "重要历史背景：你于 1884 年去世，而你生前只观察到豌豆的遗传因子（你称之为\"元素\"）"
        "在统计上遵循的数学规律。你并不知道\"基因\"\"染色体\"\"减数分裂\"等概念——"
        "减数分裂是 1876-1890 年间由 Hertwig、Strasburger 等人描述的，\"meiosis\"一词"
        "更是 1905 年才由 Farmer 和 Moore 命名；染色体的遗传学意义由 Sutton 和 Boveri 在"
        "1902-1903 年才提出，均晚于你的时代。因此：\n"
        "1. 你的叙述必须基于\"遗传因子\"\"显性/隐性\"\"杂交实验\"\"统计比例\"等你能接触到的概念；\n"
        "2. 绝对不要提及\"减数分裂\"\"染色体\"\"DNA\"\"基因\"\"等位基因\"等后世的术语；\n"
        "3. 如果学生问到这些机制，你可以诚实地说\"这超出了我当时的认识，是我去世后才被发现的\"，"
        "并把讨论引回到你能解释的遗传因子的数学规律上。\n"
        "回答控制在 300 字以内。"
    ),
    "darwin": (
        "你是查尔斯·达尔文（1809-1882），进化论的奠基人。"
        "你乘坐小猎犬号进行了五年环球航行，观察了加拉帕戈斯群岛的雀鸟等生物，"
        "最终提出了自然选择学说。请以第一人称讲述你的探索历程和理论。"
        "语气是深思熟虑的博物学家，善于用观察实例论证。"
        "重要历史背景：你于 1882 年去世。你生前并不知道遗传的物质基础——"
        "孟德尔的论文 1866 年发表但你从未读到，且直到 1900 年才被重新发现；"
        "\"基因\"\"DNA\"\"染色体\"等概念均在你去世后才确立。"
        "你对遗传机制有自己的\"泛生论\"假说（pangenesis），但它是错误的。"
        "因此：\n"
        "1. 你的叙述应基于\"变异\"\"生存竞争\"\"适者生存\"\"物种演变\"等你能观察和论证的概念；\n"
        "2. 不要提及\"基因\"\"DNA\"\"突变\"\"等位基因频率\"等后世术语；\n"
        "3. 若学生问到遗传机制，可坦言\"我当时并不清楚变异如何遗传，这是我理论的空白\"。\n"
        "回答控制在 300 字以内。"
    ),
    "watson": (
        "你是詹姆斯·沃森，1962年诺贝尔生理学或医学奖得主。"
        "你和弗朗西斯·克里克在 1953 年发现了 DNA 双螺旋结构，"
        "开启了分子生物学时代。请以第一人称讲述这一伟大发现。"
        "语气是充满好奇心的年轻科学家（你发现 DNA 结构时仅 25 岁）。"
        "回答控制在 300 字以内。不要输出任何 [[ANIM:xxx]] 标记。"
    )
}

# ========== 提示词工程 ==========

def build_system_prompt(target="competition"):
    """构建系统提示词；固定 batch_size=1（单题精雕）。"""
    if target == "high_school":
        base_rules = """你是高中生物命题教师，命制符合普通高中生物学课程标准(2017/2020修订)的高质量选择题。
""" + GAOKAO_PROP_RULES + """
输出要求：单题精雕，严格输出以下 JSON（无其他内容）：
{"stem":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"A/B/C/D","analysis":"...(≥100字)","knowledge":["学科名","具体概念"],"intent":"命题意图","misconceptions":"干扰项针对的常见错误"}
难度控制：严格限定在高中课标范围；不出现大学生物学术语；以理解概念、识记结构、解释生活/实验现象为主；干扰项为教材常见易混淆点。
"""
    else:
        competition_rules = COMPETITION_PROP_RULES
        if target == "multi_judge":
            base_rules = """你是全国中学生生物学联赛命题专家，命制 2025 联赛风格的多重判断题（每选项独立判断对错），需达到出版级质量。
""" + competition_rules + """
输出要求：单题精雕，严格输出以下 JSON（无其他内容）：
{"stem":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":{"A":true,"B":false,"C":true,"D":false},"analysis":"...(≥120字)","knowledge":["学科名","具体概念"],"intent":"命题意图","misconceptions":"干扰项针对的常见错误"}
难度控制：覆盖CBO大纲，可涉及大学普通生物学；answer 为对象格式；正确选项2-3个；各选项独立不互相提示。
"""
        else:
            base_rules = """你是全国中学生生物学联赛命题专家，命制题目需达到出版级质量。
""" + competition_rules + """
输出要求：单题精雕，严格输出以下 JSON（无其他内容）：
{"stem":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"A/B/C/D","analysis":"...(≥120字)","knowledge":["学科名","具体概念"],"intent":"命题意图","misconceptions":"干扰项针对的常见错误"}
难度控制：覆盖CBO大纲，可涉及大学基础生物学；可考察具体酶、信号通路、实验技术、图表分析；干扰项体现竞赛生高级误解。
"""
    return base_rules


def build_user_prompt(module, difficulty, target, recent_stems=None, concept=None, chart=False, batch_size=1):
    """构建用户提示词；batch_size 参数保留以兼容旧调用，固定单题生成。"""
    module_desc = MODULE_NAMES.get(module, module)
    diff_desc = DIFF_NAMES.get(difficulty, difficulty)
    target_desc = TARGET_NAMES.get(target, target)

    prompt = f"学科范围：{module_desc}\n难度：{diff_desc}\n目标受众：{target_desc}"
    if concept:
        prompt += f"\n专项概念：{concept}（题干和选项必须紧紧围绕此概念，不得偏离）"
        prompt += f"\n【重要】knowledge 字段的第二项（概念）必须严格等于 \"{concept}\"，不得使用同义词或变体。"
    if chart:
        prompt += "\n\n【图表题要求】请生成需要阅读图表/数据/实验结果的题目："
        prompt += "\n- 题干中包含图表描述或实验数据（Markdown 表格）"
        prompt += "\n- 数据量足够支撑 4 个选项的判断"
        prompt += "\n- 每道题额外添加 chart 字段（字符串），例如：'| 组别 | 对照组 | 实验组A |\n| --- | --- | --- |\n| 酶活性 | 100% | 45% |'"
    prompt += "\n\n请生成 1 道高质量题目，输出严格 JSON，不要任何额外说明。"
    if recent_stems:
        dedup = "\n".join(f"- {s[:60]}" for s in recent_stems[-8:])
        prompt += f"\n\n【重要】以下题目已存在，生成的新题不得与之语义相似：\n{dedup}"
    return prompt

# ========== 答案自检与质量校验 ==========

def self_check(q):
    """答案自检：使用 PRIMARY_MODEL(DeepSeek 671B) 同模型自检，温度 0.3 单次验证。
    单选题：验证一次，与标答一致才通过；
    多重判断题：一次性输出所有选项判断，≥3/4 一致才通过。
    返回 tuple (ok, model_answer)：通过时 model_answer=None，不通过时为模型作答。"""
    stem = q["stem"]
    opts = q["options"]
    answer = q["answer"]

    # 多重判断：一次性验证所有选项（减少 API 调用）
    if isinstance(answer, dict):
        check = (
            f"{stem}\nA. {opts['A']}\nB. {opts['B']}\nC. {opts['C']}\nD. {opts['D']}\n"
            f"请判断每个选项是否正确，输出格式：A:对/错,B:对/错,C:对/错,D:对/错（不要解释）："
        )
        msg = [{"role": "user", "content": check}]
        try:
            r = api_call(PRIMARY_MODEL, msg, temperature=0.3, max_tokens=30, json_mode=False)
            raw = r["choices"][0]["message"]["content"].strip() if r else ""
        except:
            raw = ""

        model_answer = {}
        for label in ["A", "B", "C", "D"]:
            # 从 raw 中提取每个选项的判断
            pattern = rf"{label}\s*[:：]\s*(对|错|true|false|T|F)"
            m = re.search(pattern, raw, re.IGNORECASE)
            if m:
                val = m.group(1).lower()
                model_answer[label] = val in ("对", "true", "t")
            else:
                model_answer[label] = False

        correct_count = sum(1 for label in ["A","B","C","D"] if model_answer[label] == answer.get(label, False))
        ok = correct_count >= 3
        if not ok:
            log.info(f"多重判断自检失败: {correct_count}/4 一致 | {stem[:40]}")
        return (ok, None) if ok else (ok, model_answer)

    # 单选：单次验证
    check = f"{stem}\nA. {opts['A']}\nB. {opts['B']}\nC. {opts['C']}\nD. {opts['D']}\n请只回答选项字母(A/B/C/D)，不要解释："
    msg = [{"role": "user", "content": check}]

    try:
        r = api_call(PRIMARY_MODEL, msg, temperature=0.3, max_tokens=5, json_mode=False)
        ans = r["choices"][0]["message"]["content"].strip().upper() if r else ""
    except:
        ans = ""

    # 提取 A/B/C/D
    m = re.search(r"[ABCD]", ans)
    model_answer = m.group(0) if m else ""
    ok = (model_answer == q["answer"])
    if not ok:
        log.info(f"自检不一致: 模型答{model_answer} 标答={q['answer']} | {stem[:40]}")
        return (False, model_answer)
    return (True, None)


def distractor_quality_check(q):
    """干扰项质量校验：确保错误选项不简单可排除。支持单选和多重判断两种答案格式。"""
    opts = q["options"]
    ans = q["answer"]
    target = q.get("target", "competition")
    labels = ["A", "B", "C", "D"]

    # 区分单选与多重判断
    is_multi = isinstance(ans, dict)
    if is_multi:
        correct_labels = [k for k in labels if ans.get(k) is True]
        wrong_labels = [k for k in labels if ans.get(k) is not True]
    else:
        correct_labels = [ans]
        wrong_labels = [k for k in labels if k != ans]

    if not correct_labels or not wrong_labels:
        return True

    correct_texts = [opts[k] for k in correct_labels]
    wrong_texts = [opts[k] for k in wrong_labels]

    # 1. 长度差异检查：正确选项与错误选项平均长度差异过大则疑似一眼可辨
    avg_correct_len = sum(len(t) for t in correct_texts) / len(correct_texts)
    avg_wrong_len = sum(len(t) for t in wrong_texts) / len(wrong_texts)
    if avg_correct_len > 0 and abs(avg_correct_len - avg_wrong_len) / avg_correct_len > 3.5:
        log.info(f"长度差异过大，疑似干扰项质量差 | {q['stem'][:40]}")
        return False

    # 2. 选项间相似度检查（非高考题执行）
    if target != "high_school":
        sims = []
        for ct in correct_texts:
            for wt in wrong_texts:
                sims.append(SequenceMatcher(None, ct, wt).ratio())
        if sims:
            avg_sim = sum(sims) / len(sims)
            if avg_sim < 0.03:
                log.info(f"干扰项与正确选项相似度过低，疑似风马牛不相及 | {q['stem'][:40]}")
                return False

        # 3. 关键词重叠检查（仅排除完全无内容的干扰项）
        def extract_terms(text):
            return set(re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]+", text.lower()))

        stopwords = {"的","了","是","在","和","与","或","不","为","中","有","被","由","可","能","会","对","从","到","以","及","等","其","该","这","那","一","个","种","性","体","内","外","上","下"}
        for wt in wrong_texts:
            wt_terms = extract_terms(wt) - stopwords
            # 仅排除完全无实质内容的干扰项（自检会兜底真正的质量问题）
            if not wt_terms and not q.get("chart"):
                log.info(f"干扰项无有效学科术语 | {q['stem'][:40]}")
                return False

    return True


def dedup_check(q, recent_stems):
    """与已有题目去重"""
    if not recent_stems:
        return True
    stem = q["stem"]
    for s in recent_stems:
        sim = SequenceMatcher(None, stem, s).ratio()
        if sim > 0.88:
            log.info(f"与已有题目相似度过高({sim:.2f})，丢弃 | {stem[:40]}")
            return False
    return True


def scientific_sanity_check(q):
    """基础科学事实校验。高考题(target=high_school)/图表题(chart)放宽检查以提高产量。"""
    stem = q["stem"]
    analysis = q["analysis"]
    is_hs = q.get("target") == "high_school"
    is_chart = bool(q.get("chart"))

    # 解析必须包含所有选项字母（高考题/图表题放宽）
    opts = q["options"]
    answer = q.get("answer")
    if not is_hs and not is_chart:
        for label in ["A", "B", "C", "D"]:
            if label not in analysis:
                log.info(f"解析未覆盖选项{label} | {stem[:40]}")
                return False

    # 题干不能过短
    if len(stem) < 15:
        log.info(f"题干过短 | {stem[:40]}")
        return False

    # 高考题禁止模板化、空泛的“某种/某生物/科学家们经常”题干，要求具体情境
    if is_hs and (stem.startswith("某种") or "科学家们经常" in stem or "科学家们经常使用" in stem):
        log.info(f"高考题禁止模板化题干 | {stem[:40]}")
        return False

    # 解析不能过短：高考题≥100字，竞赛题≥120字
    min_analysis_len = 100 if is_hs else 120
    if len(analysis) < min_analysis_len:
        log.info(f"解析过短({len(analysis)}<{min_analysis_len}) | {stem[:40]}")
        return False

    # 选项不能包含互相提示
    opts = q["options"]
    for k1 in ["A", "B", "C", "D"]:
        for k2 in ["A", "B", "C", "D"]:
            if k1 >= k2: continue
            t1, t2 = opts[k1], opts[k2]
            # 若一个选项是另一个的子串且包含关键信息，则有问题
            if len(t1) > 10 and len(t2) > 10 and (t1 in t2 or t2 in t1):
                log.info(f"选项{k1}与{k2}存在包含关系 | {stem[:40]}")
                return False

    return True


def proposition_rule_check(q):
    """命题规则校验：检查无效选项、模糊表述、解析覆盖等。返回 bool。"""
    stem = q["stem"]
    analysis = q["analysis"]
    opts = q["options"]
    is_hs = q.get("target") == "high_school"

    # 1. 无效选项检测：禁止"以上都对""以上都错""无法确定"等
    invalid_phrases = ["以上都对", "以上都错", "以上均对", "以上均错", "无法确定", "以上皆是", "以上皆非"]
    for label, text in opts.items():
        for phrase in invalid_phrases:
            if phrase in text:
                log.info(f"选项{label}含无效表述'{phrase}' | {stem[:40]}")
                return False

    # 2. 高考题题干禁止模糊表述："某种""某生物""某动物""某植物"等
    if is_hs:
        vague_phrases = ["某种", "某生物", "某动物", "某植物", "某细菌", "某真菌", "某病毒", "某酶"]
        for phrase in vague_phrases:
            if phrase in stem:
                log.info(f"高考题题干含模糊表述'{phrase}' | {stem[:40]}")
                return False

    # 3. 解析必须覆盖所有选项字母 A/B/C/D
    for label in ["A", "B", "C", "D"]:
        if label not in analysis:
            log.info(f"命题规则校验：解析未覆盖选项{label} | {stem[:40]}")
            return False

    return True


def infer_tags(q):
    """根据 knowledge 字段推断 subject/concept/tags。
    concept 优先匹配 GRAPH_LABELS（知识图谱 label），确保图谱点击节点能精确匹配题目。"""
    knowledge = q.get("knowledge", [])
    subject = knowledge[0] if len(knowledge) > 0 else ""
    concept = knowledge[1] if len(knowledge) > 1 else ""
    module = q.get("module", "module_1")

    # 收集该模块所有图谱 label
    graph_labels = GRAPH_LABELS.get(module, [])
    all_graph_labels = []
    for labels in GRAPH_LABELS.values():
        all_graph_labels.extend(labels)

    # 如果 concept 已在 GRAPH_LABELS 中，直接使用
    if concept and concept in graph_labels:
        pass
    elif concept:
        # concept 不在当前模块的 GRAPH_LABELS 中，尝试模糊匹配
        best_match = None
        best_ratio = 0
        for label in all_graph_labels:
            ratio = SequenceMatcher(None, concept, label).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = label
        if best_match and best_ratio >= 0.6:
            log.info(f"概念模糊匹配: '{concept}' -> '{best_match}' (相似度{best_ratio:.2f})")
            concept = best_match
        elif graph_labels:
            # 模糊匹配失败，从题干+解析中提取
            text = q["stem"] + " " + q["analysis"]
            candidates = []
            for label in graph_labels:
                if label in text:
                    candidates.append((label, text.count(label)))
            if candidates:
                candidates.sort(key=lambda x: (x[1], len(x[0])), reverse=True)
                concept = candidates[0][0]

    # 如果仍无 concept，从题干+解析中提取（兼容 CONCEPT_MAP 中的额外概念）
    if not concept:
        text = q["stem"] + " " + q["analysis"]
        candidates = []
        for subj, concepts in CONCEPT_MAP.get(module, {}).items():
            for c in concepts:
                if c in text:
                    candidates.append((c, text.count(c), subj))
        if candidates:
            candidates.sort(key=lambda x: (x[1], len(x[0])), reverse=True)
            concept = candidates[0][0]
            if not subject:
                subject = candidates[0][2]

    # 如果仍无 subject，从模块推断
    if not subject:
        module_subjects = MODULE_SUBJECTS.get(module, [])
        for subj in module_subjects:
            if subj in q["stem"] + " " + q["analysis"]:
                subject = subj
                break
        if not subject and module_subjects:
            subject = module_subjects[0]

    tags = list(knowledge)
    if concept and concept not in tags:
        tags.append(concept)
    if subject and subject not in tags:
        tags.insert(0, subject)

    # 添加难度和目标标签
    if q.get("difficulty") and q["difficulty"] not in tags:
        tags.append(q["difficulty"])
    if q.get("target") and q["target"] not in tags:
        tags.append(q["target"])

    return subject, concept, tags

def _parse_batch(content, expect_batch=False):
    """从模型输出中解析 JSON 题目对象列表（兼容单个对象、数组、questions 包裹、markdown 代码块）"""
    s = content.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.MULTILINE).strip()
    try:
        data = json.loads(s)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            if "questions" in data and isinstance(data["questions"], list):
                return data["questions"]
            return [data]
    except Exception:
        pass
    # 兜底：从文本中提取数组或 questions 数组
    m = re.search(r'"questions"\s*:\s*(\[[\s\S]*?\])', s)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    m = re.search(r"\[[\s\S]*\]", s)
    if m:
        try:
            data = json.loads(m.group(0))
            return data if isinstance(data, list) else [data]
        except Exception:
            pass
    m = re.search(r"\{[\s\S]*\}", s)
    if m:
        try:
            data = json.loads(m.group(0))
            if isinstance(data, dict) and "questions" in data:
                return data["questions"] if isinstance(data["questions"], list) else [data["questions"]]
            return [data]
        except Exception:
            pass
    return []


# ========== 生成单题/批量 ==========
def gen_one(module, difficulty, target, recent_stems=None, concept=None, chart=False, model=None):
    """单题精雕生成：使用 PRIMARY_MODEL(temperature=0.4, max_tokens=2048) 生成，
    经 scientific_sanity_check → proposition_rule_check → distractor_quality_check → dedup_check → self_check 质检链；
    self_check 不一致时反馈自检结果要求修正（最多1次）。返回通过校验的题目列表。"""
    model = model or PRIMARY_MODEL
    system = build_system_prompt(target)
    prompt = build_user_prompt(module, difficulty, target, recent_stems, concept, chart)

    def _parse_single(content):
        """从模型输出中解析单个 JSON 题目对象（兼容 markdown 代码块/数组包裹）。"""
        s = content.strip()
        if s.startswith("```"):
            s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.MULTILINE).strip()
        try:
            data = json.loads(s)
            if isinstance(data, list) and data:
                return data[0]
            if isinstance(data, dict):
                if "questions" in data and isinstance(data["questions"], list) and data["questions"]:
                    return data["questions"][0]
                return data
        except Exception:
            pass
        m = re.search(r"\{[\s\S]*\}", s)
        if m:
            try:
                data = json.loads(m.group(0))
                if isinstance(data, dict):
                    if "questions" in data and isinstance(data["questions"], list) and data["questions"]:
                        return data["questions"][0]
                    return data
            except Exception:
                pass
        return None

    def _validate_fields(q):
        """字段完整性校验，返回 (ok, q)"""
        for k in ["stem", "options", "answer", "analysis", "knowledge"]:
            if k not in q:
                raise ValueError(f"缺字段:{k}")
        if len(q["options"]) != 4:
            raise ValueError("选项≠4")
        is_multi = target == "multi_judge"
        # 兼容模型返回多选答案格式（如 "ABC"、"ABD"），自动转为多重判断
        if not is_multi and isinstance(q["answer"], str) and len(q["answer"]) > 1 and q["answer"].replace(" ", "").isalpha():
            multi_answer = {}
            for label in ["A", "B", "C", "D"]:
                multi_answer[label] = label in q["answer"]
            true_count = sum(1 for v in multi_answer.values() if v)
            if 2 <= true_count <= 3:
                q["answer"] = multi_answer
                is_multi = True
                log.info(f"多选答案自动转换 -> {multi_answer}")
            else:
                raise ValueError(f"多选答案正确选项数异常({true_count}): {q['answer']}")
        if is_multi:
            if not isinstance(q["answer"], dict) or len(q["answer"]) != 4:
                raise ValueError(f"多重判断答案格式无效:{q['answer']}")
            true_count = sum(1 for v in q["answer"].values() if v is True)
            if true_count < 2 or true_count > 3:
                raise ValueError(f"多重判断正确选项数应为2-3个，实际{true_count}")
        else:
            if q["answer"] not in "ABCD":
                raise ValueError(f"答案无效:{q['answer']}")
        if not isinstance(q["knowledge"], list) or len(q["knowledge"]) < 2:
            raise ValueError("knowledge 字段应为至少2项的数组")
        return q

    def _correct_answer(q, model_answer):
        """self_check 不一致时，将自检结果反馈给模型，要求修正答案（仅1次）。"""
        opts_desc = "\n".join(f"{k}. {v}" for k, v in q["options"].items())
        feedback = (
            f"以下是已生成的题目：\n题干：{q['stem']}\n{opts_desc}\n"
            f"原答案：{q['answer']}\n"
            f"另一独立模型给出的判断：{model_answer}\n"
            f"两模型结论不一致。请重新严谨判断正确答案。"
            f"{'（多重判断题，请给出每个选项的 true/false）' if isinstance(q['answer'], dict) else '（单选题，只回复 A/B/C/D 一个字母）'}"
            f"\n只输出最终答案，不要解释："
        )
        msg = [{"role": "user", "content": feedback}]
        try:
            resp = api_call(model, msg, temperature=0.2, max_tokens=20, json_mode=False)
            if not resp:
                return None
            raw = resp["choices"][0]["message"]["content"].strip()
        except Exception:
            return None
        if isinstance(q["answer"], dict):
            ma = {}
            for label in ["A", "B", "C", "D"]:
                m = re.search(rf"{label}\s*[:：]\s*(对|错|true|false|T|F)", raw, re.IGNORECASE)
                if m:
                    val = m.group(1).lower()
                    ma[label] = val in ("对", "true", "t")
                else:
                    ma[label] = False
            return ma
        m = re.search(r"[ABCD]", raw.upper())
        return m.group(0) if m else None

    accepted = []
    for attempt in range(3):
        t0 = time.time()
        try:
            resp = api_call(
                model,
                [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                temperature=0.4,
                max_tokens=2048,
                json_mode=True
            )
            if not resp:
                continue
            q = _parse_single(resp["choices"][0]["message"]["content"])
            if not q:
                raise ValueError("未解析到 JSON 题目")

            try:
                q = _validate_fields(q)
                q["target"] = target

                # 质量校验链：scientific_sanity_check → proposition_rule_check → distractor_quality_check → dedup_check → self_check
                if not scientific_sanity_check(q):
                    log.info("科学事实校验未通过，丢弃")
                    continue
                if not proposition_rule_check(q):
                    log.info("命题规则校验未通过，丢弃")
                    continue
                if not distractor_quality_check(q):
                    log.info("干扰项质量校验未通过，丢弃")
                    continue
                if not dedup_check(q, recent_stems):
                    log.info("去重未通过，丢弃")
                    continue

                ok, model_answer = self_check(q)
                if not ok:
                    # 修正重试：将自检结果反馈给模型，要求修正答案（最多1次）
                    if model_answer is not None:
                        corrected = _correct_answer(q, model_answer)
                        if corrected is not None:
                            log.info(f"修正重试：原答案={q['answer']} 模型判断={model_answer} 修正后={corrected} | {q['stem'][:40]}")
                            q["answer"] = corrected
                            ok2, _ = self_check(q)
                            if ok2:
                                ok = True
                    if not ok:
                        log.info("自检未通过（含修正重试），丢弃")
                        continue

                # 推断标签
                subject, concept_inferred, tags = infer_tags(q)

                q["id"] = f"bio_{int(time.time()*1000)}_{random.randint(0,9999):04d}"
                q.update(
                    module=module,
                    difficulty=difficulty,
                    target=target,
                    subject=subject,
                    concept=concept_inferred,
                    tags=tags,
                    weight=1.0,
                    fb_good=0,
                    fb_bad=0,
                    created_at=time.time()
                )
                elapsed = time.time() - t0
                log.info(f"✓ 单题生成耗时 {elapsed:.1f}s | {q['stem'][:50]}")
                accepted.append(q)
            except Exception as e:
                log.info(f"单题校验失败: {e}")
                continue

            if accepted:
                return accepted
        except Exception as e:
            if attempt == 2:
                log.warning(f"生成失败: {e}")
            time.sleep(1)
    return accepted

# ========== 补货 / 批量生成 ==========
def refill(count=20, modules=None, difficulties=None, targets=None, interval=2, concepts=None, chart=False, workers=1, batch_size=1):
    """批量生成题目，count 为目标通过数量。固定单题精雕（batch_size 仅作兼容）。
    workers>1 时使用线程池并发请求（对免费 API 请谨慎设置，避免限流）。
    interval 默认 2s 以避免限流；每题生成后打印耗时。"""
    # 通过非阻塞锁防止多个 refill 并发执行导致 pool 互相覆盖丢题
    if not _refill_lock.acquire(blocking=False):
        log.info("已有 refill 任务在执行，跳过本次补货")
        return 0, []
    try:
        return _refill_impl(count, modules, difficulties, targets, interval, concepts, chart, workers, batch_size)
    finally:
        _refill_lock.release()


def _refill_impl(count, modules, difficulties, targets, interval, concepts, chart, workers, batch_size):
    pool = load(force=True)
    recent = [q["stem"] for q in pool[-20:]] if pool else []

    modules = modules or ["module_1","module_2","module_3","module_4"]
    if isinstance(modules, str):
        modules = [m.strip() for m in modules.split(",") if m.strip()]

    if difficulties is None:
        difficulties = ["basic","league","national"]
    elif isinstance(difficulties, str):
        difficulties = [d.strip() for d in difficulties.split(",") if d.strip()]

    if targets is None:
        targets = ["high_school","competition"]
    elif isinstance(targets, str):
        targets = [t.strip() for t in targets.split(",") if t.strip()]

    concepts = concepts or []
    if isinstance(concepts, str):
        concepts = [c.strip() for c in concepts.split(",") if c.strip()]

    generated = []
    attempts = 0
    last_saved = 0
    max_attempts = count * 3
    state_lock = threading.Lock()
    stop_event = threading.Event()
    concept_indices = {m: 0 for m in modules}

    def _task(_):
        nonlocal attempts, last_saved
        while not stop_event.is_set():
            with state_lock:
                if len(generated) >= count or attempts >= max_attempts:
                    break
                attempts += 1
                local_attempt = attempts
                module = random.choice(modules)
                difficulty = random.choice(difficulties)
                target = random.choice(targets)
                if concepts:
                    idx = concept_indices.get(module, 0) % len(concepts)
                    concept_indices[module] = idx + 1
                    concept = concepts[idx]
                elif module in GRAPH_LABELS:
                    # 统一从 GRAPH_LABELS 选取概念（与知识图谱 label 严格对齐）
                    opts = GRAPH_LABELS[module]
                    idx = concept_indices.get(module, 0) % len(opts)
                    concept_indices[module] = idx + 1
                    concept = opts[idx]
                else:
                    concept = None
                local_recent = list(recent)

            t0 = time.time()
            q_list = gen_one(module, difficulty, target, local_recent, concept, chart)
            elapsed = time.time() - t0

            with state_lock:
                if not q_list:
                    log.info(f"第{local_attempt}次尝试未通过质检 (耗时 {elapsed:.1f}s)")
                    if interval > 0:
                        time.sleep(interval)
                    continue
                # 重新去重（并发可能引入新题）
                for q in q_list:
                    if any(SequenceMatcher(None, q["stem"], s).ratio() > 0.88 for s in recent):
                        continue
                    recent.append(q["stem"])
                    if len(recent) > 40:
                        recent.pop(0)
                    generated.append(q)
                    log.info(f"✓ [{q['module']}][{q['difficulty']}][{q.get('concept','')}] {q['stem'][:50]} (本组耗时 {elapsed:.1f}s)")
                # 每累积 5 题持久化一次，避免任务异常退出导致已生成题目丢失
                if len(generated) >= count or len(generated) - last_saved >= 5:
                    pool.extend(generated[last_saved:])
                    save(pool, generated[last_saved:])
                    last_saved = len(generated)
                if len(generated) >= count:
                    stop_event.set()
            if interval > 0:
                time.sleep(interval)

    if workers <= 1:
        _task(0)
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
            list(ex.map(_task, range(workers)))

    # 保存剩余未持久化的题目
    if generated and last_saved < len(generated):
        pool.extend(generated[last_saved:])
        save(pool, generated[last_saved:])
    log.info(f"补货完成: {len(generated)}/{count}题通过 (尝试{attempts}次), 池子共{len(pool)}题")
    return len(generated), generated


def auto_refill():
    while True:
        time.sleep(60)
        try:
            pool = load()
            if len(pool) < POOL_MIN:
                need = POOL_MIN - len(pool) + 20
                log.info(f"水位 {len(pool)}<{POOL_MIN}，自动补货{need}题")
                refill(need)
        except Exception as e:
            log.error(f"自动补货异常: {e}")

# ========== 重新给 Supabase 题目打标 ==========
def retag_all_questions():
    """为 Supabase 中所有已有题目重新推断并更新 subject/concept/tags"""
    pool = load()
    if not pool:
        log.info("池子为空，无需重新打标")
        return 0

    updated = 0
    for q in pool:
        subject, concept, tags = infer_tags(q)
        if subject != q.get("subject") or concept != q.get("concept"):
            q["subject"] = subject
            q["concept"] = concept
            q["tags"] = tags
            if sb_update_tags(q["id"], subject, concept, tags):
                updated += 1

    # 保存本地备份
    with pool_lock:
        Path(POOL_FILE).write_text(json.dumps(pool, ensure_ascii=False, indent=2), "utf-8")

    log.info(f"重新打标完成: {updated}/{len(pool)} 题")
    return updated

# ========== 管理员授权 & Vision 模型选择 ==========

# Admin 密钥哈希：仅从环境变量 ADMIN_KEY_HASH 读取（fail-closed）。
# 仓库曾内置真实哈希作为兜底——公开仓库中泄露的 SHA-256 可被离线爆破，已移除。
# 轮换/配置方式见 sql/migration_v14_admin_hardening.sql（SQL Editor 执行后，
# 本地/运维环境把哈希写入 .env 的 ADMIN_KEY_HASH）。
# 未配置时 X-Admin-Key / X-Admin-Key-Hash 两条遗留路径一律拒绝，
# 仅保留 Authorization: Bearer <Supabase token>（service role 独立校验）路径。
ADMIN_KEY_HASH_HEX = os.environ.get("ADMIN_KEY_HASH", "").strip().lower()


# ========== 简易速率限制（防滥用 OCR/登录）==========
# 结构：{ ip: { endpoint: [(timestamp, ...)] } }
_RATE_LIMIT_BUCKET = {}
_RATE_LIMIT_LOCK = threading.Lock()

def _check_rate_limit(ip, endpoint, max_per_minute=20):
    """检查 IP+endpoint 在最近 60s 内的请求次数，超过 max_per_minute 返回 False。"""
    now = time.time()
    window = 60.0
    with _RATE_LIMIT_LOCK:
        bucket = _RATE_LIMIT_BUCKET.setdefault(ip, {}).setdefault(endpoint, [])
        # 清理超过 60s 的旧记录
        while bucket and now - bucket[0] > window:
            bucket.pop(0)
        if len(bucket) >= max_per_minute:
            return False
        bucket.append(now)
        return True

def _verify_supabase_admin_token(token):
    """新认证模型：用 Supabase 校验前端携带的用户 access_token，
    并确认该用户 user_group == 'admin'（以 service role key 调用，不信任前端自述身份）。"""
    try:
        if not token or not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            return False
        # 1) 校验 token 并取用户
        req = urllib.request.Request(
            SUPABASE_URL + "/auth/v1/user",
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": "Bearer " + token,
            })
        with urllib.request.urlopen(req, timeout=6) as resp:
            user = json.loads(resp.read().decode("utf-8"))
        uid = user.get("id") or ""
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", uid):
            return False
        # 2) 查 profiles.user_group（service role 绕过 RLS，读取准确角色）
        q = urllib.request.Request(
            SUPABASE_URL + "/rest/v1/profiles?select=user_group&id=eq." + uid,
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
            })
        with urllib.request.urlopen(q, timeout=6) as resp2:
            rows = json.loads(resp2.read().decode("utf-8"))
        return bool(rows) and rows[0].get("user_group") == "admin"
    except Exception as e:
        log.warning("Supabase 管理员 token 校验失败: %s", e)
        return False


def _check_admin_authorization(headers):
    """检查请求头是否携带有效的管理员凭证。
    支持：
    1. X-Admin-Key 携带明文密钥（后端哈希后比对）——遗留兼容
    2. X-Admin-Key-Hash 携带预哈希值（生产环境推荐，避免明文传输）——遗留兼容
    3. Authorization: Bearer <Supabase access_token>——新认证模型（管理员经
       Supabase Auth 邮箱/密码登录，服务端以 service role key 独立校验角色）
    注意：绝不信任前端自称的身份标记（如 supabase_admin / user_group），
    服务端唯一安全边界是密钥哈希或对 Supabase 的独立校验。
    """
    try:
        provided = (headers.get("X-Admin-Key") or headers.get("x-admin-key") or "").strip()
        provided_hash = (headers.get("X-Admin-Key-Hash") or headers.get("x-admin-key-hash") or "").strip().lower()
        # fail-closed：未配置 ADMIN_KEY_HASH 环境变量时，密钥类凭证一律拒绝
        if provided_hash and ADMIN_KEY_HASH_HEX:
            return provided_hash == ADMIN_KEY_HASH_HEX
        if provided and ADMIN_KEY_HASH_HEX:
            h = hashlib.sha256(provided.encode("utf-8")).hexdigest()
            return h == ADMIN_KEY_HASH_HEX
        authz = (headers.get("Authorization") or headers.get("authorization") or "").strip()
        if authz.lower().startswith("bearer "):
            return _verify_supabase_admin_token(authz[7:].strip())
    except Exception:
        pass
    return False


# Vision 模型候选：按优先级返回第一个可用的
# 注：纯文本 OCR 仍依赖 vision 模型的图像理解能力
_VISION_CANDIDATES = [
    # Zhipu (国内稳定，支持 glm-4v)
    {"provider": "zhipu", "model": "glm-4v", "base": "https://open.bigmodel.cn/api/paas/v4",
     "key_env": "ZHIPU_API_KEY"},
    # Qwen DashScope
    {"provider": "qwen", "model": "qwen-vl-plus", "base": "https://dashscope.aliyuncs.com/compatible-mode/v1",
     "key_env": "QWEN_API_KEY"},
    # SiliconFlow Qwen2-VL
    {"provider": "siliconflow", "model": "Qwen/Qwen2-VL-72B-Instruct",
     "base": "https://api.siliconflow.cn/v1", "key_env": "SILICONFLOW_API_KEY"},
    # NVIDIA NIM yi-vl
    {"provider": "nvidia", "model": "yi-llava-13b",
     "base": "https://integrate.api.nvidia.com/v1", "key_env": "NVIDIA_API_KEY"},
    # OpenAI 兼容（若有用户自带）
    {"provider": "openai", "model": "gpt-4o",
     "base": "https://api.openai.com/v1", "key_env": "OPENAI_API_KEY"},
]


def _pick_vision_model():
    """根据环境变量自动选择可用的 vision 模型。
    返回 (model_name, api_base, api_key) 或 None。
    """
    for c in _VISION_CANDIDATES:
        key = os.environ.get(c["key_env"], "").strip()
        if key:
            return (c["model"], c["base"], key)
    return None


# ========== HTTP 路由（原生 http.server，替代 FastAPI）==========
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # 禁用默认日志，用我们自己的

    def _json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key, X-Admin-Key-Hash, X-User-Api-Key, X-User-Provider, X-User-Model")
        # 安全响应头
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def _read_body(self, max_size=2 * 1024 * 1024):
        """读取 JSON body：默认限制 2MB，强制要求顶层为对象。超限/类型不符抛 ValueError。"""
        length = int(self.headers.get("Content-Length", 0))
        if length > max_size:
            raise ValueError("请求体过大")
        data = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        if not isinstance(data, dict):
            raise ValueError("JSON body 必须是对象")
        return data

    # 静态文件服务禁止访问的目录前缀与扩展名（防源码/密钥/历史泄露）
    _FORBIDDEN_DIRS = (".git", "scripts", "tools", "archive", "qa-output", "__pycache__", "node_modules", "sql")
    _FORBIDDEN_EXTS = (".py", ".pyc", ".log", ".sh", ".ps1", ".env", ".sql", ".bak", ".md")

    def _serve_static(self, filepath):
        """提供静态文件服务（含路径遍历防护 + 敏感路径拦截）"""
        full_path = os.path.realpath(os.path.join(STATIC_DIR, filepath))
        static_root = os.path.realpath(STATIC_DIR)
        if not full_path.startswith(static_root + os.sep) and full_path != static_root:
            self._json(403, {"error": "forbidden"})
            return
        # 按路径前缀/扩展名拦截敏感资源
        rel_path = os.path.relpath(full_path, static_root).replace(os.sep, "/")
        first_seg = rel_path.split("/", 1)[0].lower()
        ext_lower = os.path.splitext(rel_path)[1].lower()
        base_lower = os.path.basename(rel_path)
        if (first_seg in self._FORBIDDEN_DIRS
                or ext_lower in self._FORBIDDEN_EXTS
                or base_lower.startswith(".")
                or base_lower == ".env"):
            self._json(403, {"error": "forbidden"})
            return
        if not os.path.exists(full_path) or not os.path.isfile(full_path):
            self._json(404, {"error": "not found"})
            return

        # 获取文件扩展名和 MIME 类型
        ext = os.path.splitext(filepath)[1].lower()
        content_type = MIME_TYPES.get(ext, "application/octet-stream")

        try:
            with open(full_path, "rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", len(content))
            self.send_header("Access-Control-Allow-Origin", "*")
            # 开发阶段禁用缓存，避免 Trae preview 浏览器使用过期的 index.html / js / css
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            # 安全响应头
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            log.error(f"静态文件读取失败 {rel_path}: {e}")
            self._json(500, {"error": "文件读取失败"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key, X-Admin-Key-Hash, X-User-Api-Key, X-User-Provider, X-User-Model")
        self.end_headers()

    def do_GET(self):
        # 静态文件路径集合
        static_exts = {'.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.webp', '.map'}
        clean_path = self.path.split("?")[0]
        ext = os.path.splitext(clean_path)[1].lower()

        # 静态文件直接返回，不加载 pool；根路径返回 index.html
        if ext in static_exts or clean_path == '/':
            if clean_path == '/':
                self._serve_static("index.html")
            else:
                # 直接交给 _serve_static：先执行敏感路径拦截（403），再检查存在性（404）。
                # 不预检 os.path.exists，否则不存在的敏感文件（如 scripts/x.js）会
                # 跳过拦截逻辑直接返回 404，泄露存在性信息。
                self._serve_static(clean_path.lstrip("/"))
            return

        # API 端点才加载 pool
        p = load()
        if self.path == "/health":
            self._json(200, {"status":"ok","pool":len(p),"uptime_seconds":time.time()-START_TIME})
        elif self.path == "/admin/vision-status":
            # 管理员查询可用的 vision 模型
            try:
                if not _check_admin_authorization(self.headers):
                    self._json(401, {"error": "未授权"}); return
                available = []
                for c in _VISION_CANDIDATES:
                    key = os.environ.get(c["key_env"], "").strip()
                    if key:
                        available.append({"provider": c["provider"], "model": c["model"]})
                self._json(200, {"ok": True, "available": available, "count": len(available)})
            except Exception as e:
                log.error(f"/admin/vision-status 异常: {e}")
                self._json(500, {"error": "查询失败，请稍后重试"})
        elif self.path == "/stats":
            bm = {k:0 for k in MODULE_NAMES}; bd = {"basic":0,"league":0,"national":0}; bt = {"high_school":0,"competition":0,"both":0}
            bs = {}; bc = {}
            for q in p:
                bm[q["module"]] = bm.get(q["module"],0)+1
                bd[q["difficulty"]] = bd.get(q["difficulty"],0)+1
                bt[q["target"]] = bt.get(q["target"],0)+1
                if q.get("subject"): bs[q["subject"]] = bs.get(q["subject"],0)+1
                if q.get("concept"): bc[q["concept"]] = bc.get(q["concept"],0)+1
            self._json(200, {
                "total":len(p),"modules":bm,"difficulties":bd,"targets":bt,
                "subjects":bs,"concepts":bc
            })
        else:
            # 尝试作为静态文件路径
            # 直接交给 _serve_static 处理：它会先执行敏感路径拦截（返回403），
            # 再检查文件是否存在（返回404）。避免预检 os.path.exists 导致
            # 不存在的敏感文件跳过拦截逻辑、直接返回 404 泄露存在性信息。
            clean_path = self.path.lstrip("/").split("?")[0]
            if clean_path:
                self._serve_static(clean_path)
            else:
                self._json(404, {"error":"not found"})

    def do_POST(self):
        # 全局请求体大小预检：常规端点 2MB 上限，上传端点自行放宽
        _UPLOAD_ENDPOINTS = ("/admin/ocr-upload", "/admin/ebook-upload")
        _cl = int(self.headers.get("Content-Length", 0))
        if self.path not in _UPLOAD_ENDPOINTS and _cl > 2 * 1024 * 1024:
            self._json(413, {"error": "请求体过大（>2MB）"}); return

        if self.path == "/generate":
            try:
                req = self._read_body()
            except:
                self._json(400, {"error":"invalid json"}); return

            module = req.get("module", "module_1")
            difficulty = req.get("difficulty", "league")
            target = req.get("target", "competition")
            try:
                count = min(max(int(req.get("count", 1)), 1), 10)
            except (TypeError, ValueError):
                self._json(400, {"error": "count 必须是 1-10 的整数"}); return
            exclude = req.get("exclude", [])
            if not isinstance(exclude, list):
                exclude = []
            concept = req.get("concept")

            pool = load()
            candidates = [q for q in pool
                if q["module"]==module and q["difficulty"]==difficulty
                and q["target"] in (target,"both") and q["id"] not in exclude
                and (not concept or q.get("concept") == concept)
                and q.get("weight",1.0)>0.1]
            candidates.sort(key=lambda q: q.get("weight",1.0), reverse=True)

            if len(candidates) < count:
                shortage = count - len(candidates)
                log.info(f"不足(需{count},有{len(candidates)})，后台补货{shortage+5}")
                # 后台异步补货，避免 HTTP 请求长时间阻塞超时
                threading.Thread(
                    target=refill,
                    args=(shortage + 5,),
                    kwargs={"modules": [module], "difficulties": [difficulty], "targets": [target], "concepts": [concept] if concept else None},
                    daemon=True
                ).start()

            selected = candidates[:count]
            self._json(200, {"questions":[{"id":q["id"],"stem":q["stem"],"options":q["options"],
                "answer":q["answer"],"analysis":q["analysis"],"module":q["module"],
                "difficulty":q["difficulty"],"target":q["target"],"knowledge":q.get("knowledge",[]),
                "subject":q.get("subject",""),"concept":q.get("concept",""),"tags":q.get("tags",[])}
                for q in selected], "generating": len(candidates) < count})

        elif self.path == "/feedback":
            try:
                req = self._read_body()
            except:
                self._json(400, {"error":"invalid json"}); return

            qid = req.get("question_id")
            good = req.get("good", True)
            pool = load()
            with pool_lock:
                target_q = next((q for q in pool if q["id"] == qid), None)
                if target_q:
                    if good:
                        target_q["fb_good"] = target_q.get("fb_good",0)+1
                        target_q["weight"] = min(2.0, target_q.get("weight",1.0)+0.1)
                    else:
                        target_q["fb_bad"] = target_q.get("fb_bad",0)+1
                        target_q["weight"] = max(0.0, target_q.get("weight",1.0)-0.3)
                    # 仅本地持久化，不触发 Supabase 批量重传（由 sb_update_weight 单条更新）
                    Path(POOL_FILE).write_text(json.dumps(pool, ensure_ascii=False, indent=2), "utf-8")
                    global _local_cache, _cache_time
                    _local_cache = list(pool)
                    _cache_time = time.time()
            if target_q:
                sb_update_weight(qid, target_q["weight"], target_q["fb_good"], target_q["fb_bad"])
                self._json(200, {"ok":True,"weight":target_q["weight"]})
            else:
                self._json(404, {"error":"题目不存在"})

        elif self.path == "/refill":
            if not _check_admin_authorization(self.headers):
                self._json(401, {"error": "管理员鉴权失败"}); return
            client_ip = self.client_address[0] if self.client_address else "unknown"
            if not _check_rate_limit(client_ip, "refill", max_per_minute=5):
                self._json(429, {"error": "请求过于频繁，请稍后再试"}); return
            try:
                req = self._read_body()
            except ValueError as e:
                self._json(400, {"error": str(e)}); return
            except Exception:
                self._json(400, {"error": "invalid json"}); return
            n, _ = refill(
                req.get("count", 20),
                modules=req.get("modules"),
                difficulties=req.get("difficulties"),
                targets=req.get("targets"),
                interval=req.get("interval", 0),
                concepts=req.get("concepts")
            )
            self._json(200, {"ok":True,"generated":n,"total":len(load())})

        elif self.path == "/retag":
            if not _check_admin_authorization(self.headers):
                self._json(401, {"error": "管理员鉴权失败"}); return
            client_ip = self.client_address[0] if self.client_address else "unknown"
            if not _check_rate_limit(client_ip, "retag", max_per_minute=2):
                self._json(429, {"error": "请求过于频繁，请稍后再试"}); return
            n = retag_all_questions()
            self._json(200, {"ok":True,"updated":n,"total":len(load())})

        elif self.path == "/ai-analyze":
            try:
                req = self._read_body()
            except:
                self._json(400, {"error":"invalid json"}); return
            question_text = req.get("question", "")
            user_answer = req.get("user_answer", "")
            correct_answer = req.get("correct_answer", "")
            if not question_text:
                self._json(400, {"error":"题目内容为空"}); return
            prompt = (
                '你是一位高中生物教师。请分析以下学生错题，并以 JSON 格式返回：\n'
                '{"subject":"学科细分", "concept":"核心概念", "textbook_chapter":"人教版教材章节", '
                '"error_reason":"错误原因", "knowledge_graph_nodes":["相关概念1"], '
                '"analysis":"详细解析", "related_concepts":["相似概念1"]}\n\n'
                f'题目：{question_text}\n学生答案：{user_answer or "无"}\n正确答案：{correct_answer or "无"}'
            )
            try:
                resp = api_call(PRIMARY_MODEL, [{"role":"user","content":prompt}],
                                temperature=0.3, max_tokens=1024, json_mode=True)
                if not resp:
                    self._json(502, {"error":"AI 服务不可用"}); return
                content = resp["choices"][0]["message"]["content"]
                parsed = json.loads(content) if isinstance(content, str) else content
                self._json(200, {"ok":True,"analysis":parsed})
            except Exception as e:
                self._json(500, {"error":f"AI 分析失败: {e}"})

        elif self.path == "/analyze-wrong":
            # 错题深度复盘：判定错误类型 + 给出建议 + 推荐相关概念
            try:
                req = self._read_body()
            except:
                self._json(400, {"error":"invalid json"}); return
            question_text = req.get("question", "")
            user_answer = req.get("userAnswer", "") or req.get("user_answer", "")
            correct_answer = req.get("correctAnswer", "") or req.get("correct_answer", "")
            options = req.get("options", {}) or {}
            if not question_text:
                self._json(400, {"error":"题目内容为空"}); return
            opts_str = ""
            if isinstance(options, dict) and options:
                opts_str = "\n".join(f"{k}. {v}" for k, v in options.items())
            elif isinstance(options, list) and options:
                opts_str = "\n".join(str(o) for o in options)
            prompt = (
                '你是一位资深生物竞赛教练，正在帮学生做错题深度复盘。请分析学生的错误，严格以 JSON 格式返回：\n'
                '{"errorType":"concept|careless|knowledge_gap|logic", '
                '"analysis":"错误原因深度分析（2-4句，指出具体出错点）", '
                '"suggestion":"针对性改进建议（2-3条可执行的行动点）", '
                '"similarConcepts":["与该错题相关的相似或易混淆概念1","概念2"]}\n\n'
                'errorType 只能取以下四者之一：\n'
                '- concept: 概念混淆（把相似概念弄混了）\n'
                '- careless: 粗心（审题不仔细、看错选项、计算失误等）\n'
                '- knowledge_gap: 知识盲区（完全没学过/没掌握的知识点）\n'
                '- logic: 逻辑错误（推理链条出错、因果倒置等）\n\n'
                f'题目：{question_text}\n'
                + (f'选项：\n{opts_str}\n' if opts_str else '')
                + f'学生答案：{user_answer or "无"}\n正确答案：{correct_answer or "无"}'
            )
            try:
                resp = api_call(TUTOR_MODEL, [{"role":"user","content":prompt}],
                                temperature=0.3, max_tokens=800, json_mode=True)
                if not resp:
                    self._json(502, {"error":"AI 服务不可用"}); return
                content = resp["choices"][0]["message"]["content"]
                parsed = json.loads(content) if isinstance(content, str) else content
                valid_types = {"concept","careless","knowledge_gap","logic"}
                if parsed.get("errorType") not in valid_types:
                    parsed["errorType"] = "concept"
                if not isinstance(parsed.get("similarConcepts"), list):
                    parsed["similarConcepts"] = []
                self._json(200, {"ok":True, "analysis":parsed})
            except Exception as e:
                self._json(500, {"error":f"AI 分析失败: {e}"})

        elif self.path == "/photo-quiz":
            # 拍照录题：AI 根据题目文字生成选项、答案、解析
            # 注：图片仅存浏览器 localStorage，不发给后端（模型不支持图片输入）
            try:
                req = self._read_body()
            except:
                self._json(400, {"error": "invalid json"}); return
            question_text = (req.get("question") or "").strip()
            if not question_text:
                self._json(400, {"error": "题目内容为空"}); return

            prompt = (
                "你是 TATABOX 生物竞赛命题专家。用户输入了一段生物题目文字（可能完整也可能只有题干）。"
                "请基于此生成完整的题目解析。要求：\n"
                "1. 若输入已含选项，按原文提取；若没有，生成 4 个合理选项 A/B/C/D\n"
                "2. 给出唯一正确答案（字母 A/B/C/D）\n"
                "3. 提供详细解析（≥100 字），逐选项说明对错原因\n"
                "4. 严格输出以下 JSON（无其他内容）：\n"
                '{"question":"完整题干（不含选项）","options":{"A":"...","B":"...","C":"...","D":"..."},'
                '"answer":"A/B/C/D","analysis":"..."}\n\n'
                f"用户输入的题目文字：\n{question_text}"
            )

            try:
                resp = api_call(TUTOR_MODEL, [{"role": "user", "content": prompt}],
                                temperature=0.3, max_tokens=1500, json_mode=True)
                if not resp:
                    self._json(502, {"error": "AI 服务不可用"}); return
                content = resp["choices"][0]["message"]["content"]
                s = content.strip()
                if s.startswith("```"):
                    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.MULTILINE).strip()
                try:
                    parsed = json.loads(s)
                except Exception:
                    m = re.search(r"\{[\s\S]*\}", s)
                    parsed = json.loads(m.group(0)) if m else {}
                self._json(200, {
                    "question": parsed.get("question", question_text),
                    "options":  parsed.get("options", {}) or {},
                    "answer":   parsed.get("answer", ""),
                    "analysis": parsed.get("analysis", "")
                })
            except Exception as e:
                self._json(500, {"error": f"AI 解析失败: {e}"})

        elif self.path == "/admin/ocr-upload":
            # 管理员 OCR 上传题目：接收 base64 图片，调用 vision 模型提取题目文字，
            # 再调用 photo-quiz 逻辑补全选项/答案/解析，最后入库。
            # 关键安全约束：
            # 1. 必须提供管理员凭证（新认证模型：Authorization: Bearer <Supabase access_token>，
            #    服务端用 service role key 校验并确认 user_group == 'admin'；遗留 X-Admin-Key 仅作兼容）
            # 2. 图片大小限制 ≤ 5MB
            # 3. 仅调用 vision-capable 模型（zhipu glm-4v / qwen qwen-vl / siliconflow Qwen2-VL / nvidia yi-vl）
            try:
                if not _check_admin_authorization(self.headers):
                    self._json(401, {"error": "未授权：需要管理员密钥"}); return

                # Content-Length 预检：避免读取超大 body
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length > 7 * 1024 * 1024:  # 7MB 硬上限
                    self._json(413, {"error": "请求体过大（>7MB）"}); return

                # 速率限制：每 IP 每分钟最多 20 次 OCR 请求（防止滥用 vision API）
                client_ip = self.client_address[0] if self.client_address else "unknown"
                if not _check_rate_limit(client_ip, "ocr-upload", max_per_minute=20):
                    self._json(429, {"error": "请求过于频繁，请稍后再试（每分钟最多 20 次）"}); return

                # 兼容两种 Content-Type：application/json 和 multipart/form-data
                content_type = (self.headers.get("Content-Type") or "").lower()
                if "application/json" in content_type:
                    try:
                        req = self._read_body(max_size=7 * 1024 * 1024)
                    except Exception:
                        self._json(400, {"error": "invalid json"}); return

                    image_b64 = (req.get("image") or "").strip()
                    image_mime = (req.get("mime") or "image/png").strip().lower()
                    text_hint = (req.get("text") or "").strip()
                    if not image_b64:
                        self._json(400, {"error": "缺少图片数据"}); return
                else:
                    # multipart/form-data 解析（极简实现，仅支持单文件）
                    try:
                        ctype_params = dict(p.strip().split("=", 1) for p in content_type.split(";")[1:] if "=" in p)
                    except Exception:
                        self._json(400, {"error": "invalid content-type"}); return
                    boundary = ctype_params.get("boundary", "").strip('"')
                    if not boundary:
                        self._json(400, {"error": "missing boundary"}); return
                    body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                    if len(body) > 6 * 1024 * 1024:  # 6MB 硬上限（base64 5MB 原始）
                        self._json(413, {"error": "图片过大（>5MB）"}); return
                    image_b64 = ""
                    image_mime = "image/png"
                    text_hint = ""
                    for part in body.split(b"--" + boundary.encode("ascii")):
                        if not part or part in (b"--\r\n", b"--"):
                            continue
                        if b"Content-Disposition" not in part:
                            continue
                        # 解析 part 头与正文
                        header_end = part.find(b"\r\n\r\n")
                        if header_end < 0:
                            continue
                        header_text = part[:header_end].decode("utf-8", errors="ignore")
                        content = part[header_end+4:].rstrip(b"\r\n")
                        if 'name="image"' in header_text or 'name="file"' in header_text:
                            image_b64 = content.decode("utf-8", errors="ignore")
                        elif 'name="mime"' in header_text:
                            image_mime = content.decode("utf-8", errors="ignore").strip().lower()
                        elif 'name="text"' in header_text:
                            text_hint = content.decode("utf-8", errors="ignore").strip()

                # 去除可能的 data URL 前缀
                if "," in image_b64[:80] and image_b64.startswith("data:"):
                    image_b64 = image_b64.split(",", 1)[1]

                # 校验：base64 大小（5MB 原始 = ~6.67MB base64）
                if len(image_b64) > 7 * 1024 * 1024:
                    self._json(413, {"error": "图片过大（>5MB）"}); return
                if not image_b64:
                    self._json(400, {"error": "图片数据为空"}); return

                # 校验 mime
                allowed_mimes = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}
                if image_mime not in allowed_mimes:
                    image_mime = "image/png"

                # 决定使用哪类 vision 模型
                vision_model = _pick_vision_model()
                if not vision_model:
                    self._json(503, {"error": "当前未配置任何视觉模型，无法 OCR 题目"}); return

                # 调用 vision 模型识别图片中的题目文字
                data_url = f"data:{image_mime};base64,{image_b64}"
                ocr_prompt = (
                    "你是 TATABOX 生物题目 OCR 专家。请仔细阅读图片中的题目，"
                    "提取出完整的题目文字（题干、选项、图表说明等）。"
                    "如果有图表/示意图，请用文字描述其内容（如'图示：一个细胞结构图，标注了线粒体、内质网等'）。"
                    "如果有数学公式，请用 LaTeX 格式输出。\n"
                    "请严格按以下 JSON 输出（无其他内容）：\n"
                    '{"text":"提取的完整题目文字"}\n\n'
                    + (f"补充提示：{text_hint}\n" if text_hint else "")
                )

                vision_messages = [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": ocr_prompt},
                        {"type": "image_url", "image_url": {"url": data_url}}
                    ]
                }]

                try:
                    vision_result = _pick_vision_model()
                    if vision_result:
                        v_model, v_base, v_key = vision_result
                    else:
                        v_model = PRIMARY_MODEL
                        v_base = API_BASE
                        v_key = DEFAULT_API_KEY
                    resp = api_call_vision(v_model, vision_messages,
                                           temperature=0.2, max_tokens=2000, json_mode=True,
                                           api_base=v_base, api_key=v_key)
                    if not resp:
                        self._json(502, {"error": "OCR 模型调用失败"}); return
                    content = resp["choices"][0]["message"]["content"]
                    s = content.strip()
                    if s.startswith("```"):
                        s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.MULTILINE).strip()
                    try:
                        ocr_result = json.loads(s)
                    except Exception:
                        m = re.search(r"\{[\s\S]*\}", s)
                        ocr_result = json.loads(m.group(0)) if m else {"text": s}
                    extracted_text = (ocr_result.get("text") or "").strip()
                except Exception as e:
                    log.error(f"OCR 调用异常: {e}")
                    self._json(500, {"error": f"OCR 处理失败: {e}"}); return

                if not extracted_text:
                    self._json(422, {"error": "OCR 未识别到任何文字，请检查图片质量"}); return

                # 复用 photo-quiz 逻辑：将 OCR 文本喂给 AI 生成完整题目
                # 这里直接内联调用以避免 HTTP 循环
                struct_prompt = (
                    "你是 TATABOX 生物竞赛命题专家。从以下 OCR 提取的题目文字中，"
                    "提取或生成完整的题目（含选项、答案、解析）。\n"
                    "要求：\n"
                    "1. 若原文已含选项 A/B/C/D，按原文提取；否则生成 4 个合理选项\n"
                    "2. 给出唯一正确答案（字母 A/B/C/D）\n"
                    "3. 解析 ≥ 100 字，逐选项分析对错\n"
                    "4. 严格 JSON 输出（无其他内容）：\n"
                    '{"question":"完整题干","options":{"A":"...","B":"...","C":"...","D":"..."},'
                    '"answer":"A/B/C/D","analysis":"..."}\n\n'
                    f"OCR 文本：\n{extracted_text}"
                )
                try:
                    struct_resp = api_call(PRIMARY_MODEL, [{"role": "user", "content": struct_prompt}],
                                           temperature=0.3, max_tokens=1800, json_mode=True)
                    if not struct_resp:
                        self._json(502, {"error": "AI 结构化失败", "ocr_text": extracted_text}); return
                    sc = struct_resp["choices"][0]["message"]["content"]
                    ss = sc.strip()
                    if ss.startswith("```"):
                        ss = re.sub(r"^```(?:json)?\s*|\s*```$", "", ss, flags=re.MULTILINE).strip()
                    try:
                        struct = json.loads(ss)
                    except Exception:
                        m = re.search(r"\{[\s\S]*\}", ss)
                        struct = json.loads(m.group(0)) if m else {}

                    final_q = struct.get("question") or extracted_text
                    opts = struct.get("options") or {}
                    ans = struct.get("answer") or ""
                    analysis = struct.get("analysis") or ""
                except Exception as e:
                    log.error(f"题目结构化失败: {e}")
                    # 降级：仅返回 OCR 文本，不入库
                    self._json(500, {"error": f"结构化失败: {e}", "ocr_text": extracted_text}); return

                # 入库：构造题目对象
                qid = f"ocr_{int(time.time()*1000)}_{random.randint(0,9999):04d}"
                new_q = {
                    "id": qid,
                    "stem": final_q,
                    "options": opts,
                    "answer": ans,
                    "analysis": analysis,
                    "module": "module_1",
                    "difficulty": "league",
                    "target": "competition",
                    "subject": "",
                    "concept": "",
                    "tags": ["ocr_uploaded", "pending_review"],
                    "weight": 0.8,  # OCR 题目权重略低，待人工审核
                    "fb_good": 0,
                    "fb_bad": 0,
                    "created_at": time.time(),
                    "source": "ocr_upload",
                    "ocr_text": extracted_text  # 保留 OCR 原文供审核
                }

                # 推断标签
                try:
                    new_q["subject"], new_q["concept"], inferred_tags = infer_tags(new_q)
                    # 合并标签
                    for t in inferred_tags:
                        if t and t not in new_q["tags"]:
                            new_q["tags"].append(t)
                except Exception as e:
                    log.warning(f"infer_tags 失败（不致命）: {e}")

                # 写入本地 + Supabase
                try:
                    pool = load()
                    pool.append(new_q)
                    save(pool, [new_q])
                    log.info(f"✓ OCR 题目入库: {qid} | {final_q[:50]}")
                except Exception as e:
                    log.error(f"OCR 题目入库失败: {e}")
                    self._json(500, {"error": f"入库失败: {e}"}); return

                # 返回审核所需的完整字段
                self._json(200, {
                    "ok": True,
                    "question": {
                        "id": new_q["id"],
                        "stem": new_q["stem"],
                        "options": new_q["options"],
                        "answer": new_q["answer"],
                        "analysis": new_q["analysis"],
                        "module": new_q["module"],
                        "difficulty": new_q["difficulty"],
                        "target": new_q["target"],
                        "subject": new_q["subject"],
                        "concept": new_q["concept"],
                        "tags": new_q["tags"],
                        "ocr_text": new_q["ocr_text"]
                    },
                    "ocr_text": extracted_text
                })
            except Exception as e:
                log.error(f"/admin/ocr-upload 异常: {e}")
                self._json(500, {"error": f"服务异常: {e}"})

        elif self.path == "/admin/update-question":
            # 管理员更新题目（OCR 上传审核后调用）
            try:
                if not _check_admin_authorization(self.headers):
                    self._json(401, {"error": "未授权：需要管理员密钥"}); return
                try:
                    req = self._read_body()
                except Exception:
                    self._json(400, {"error": "invalid json"}); return
                qid = (req.get("id") or "").strip()
                if not qid:
                    self._json(400, {"error": "缺少题目 id"}); return
                pool = load()
                target = next((q for q in pool if q["id"] == qid), None)
                if not target:
                    self._json(404, {"error": "题目不存在"}); return

                # 白名单字段更新
                allowed = {"stem", "options", "answer", "analysis", "module", "difficulty",
                           "target", "subject", "concept", "tags", "weight"}
                for k, v in req.items():
                    if k in allowed:
                        target[k] = v

                # 重新推断标签
                try:
                    s, c, t = infer_tags(target)
                    if not target.get("subject"):
                        target["subject"] = s
                    if not target.get("concept"):
                        target["concept"] = c
                except Exception:
                    pass

                # 移除 pending_review 标签（表示已审核）
                if "pending_review" in target.get("tags", []):
                    target["tags"] = [t for t in target["tags"] if t != "pending_review"]
                if "ocr_uploaded" in target.get("tags", []):
                    target["tags"] = [t for t in target["tags"] if t != "ocr_uploaded"]
                # 恢复正常权重
                if target.get("weight", 1.0) < 0.9:
                    target["weight"] = 1.0

                save(pool, [target])
                self._json(200, {"ok": True, "question": target})
            except Exception as e:
                log.error(f"/admin/update-question 异常: {e}")
                self._json(500, {"error": f"更新失败: {e}"})

        elif self.path == "/admin/delete-question":
            # 管理员删除题目
            try:
                if not _check_admin_authorization(self.headers):
                    self._json(401, {"error": "未授权：需要管理员密钥"}); return
                try:
                    req = self._read_body()
                except Exception:
                    self._json(400, {"error": "invalid json"}); return
                qid = (req.get("id") or "").strip()
                if not qid:
                    self._json(400, {"error": "缺少题目 id"}); return
                pool = load()
                idx = next((i for i, q in enumerate(pool) if q["id"] == qid), -1)
                if idx < 0:
                    self._json(404, {"error": "题目不存在"}); return
                deleted = pool.pop(idx)
                # 原子写入（避免半写损坏文件）
                tmp_file = POOL_FILE + ".tmp"
                with pool_lock:
                    with open(tmp_file, "w", encoding="utf-8") as f:
                        f.write(json.dumps(pool, ensure_ascii=False, indent=2))
                        f.flush()
                        try:
                            os.fsync(f.fileno())
                        except (AttributeError, OSError):
                            pass
                    os.replace(tmp_file, POOL_FILE)
                # 同步更新内存缓存（在锁外，避免锁嵌套）
                # 注：_local_cache 已在 save() / fb-update 中被声明为 global，
                # 此处直接赋值即可
                _local_cache = list(pool)
                _cache_time = time.time()
                # 同步删除 Supabase 记录
                try:
                    sb_request("DELETE", f"questions?id=eq.{qid}")
                except Exception as e:
                    log.warning(f"Supabase 删除失败（不影响本地）: {e}")
                self._json(200, {"ok": True, "deleted_id": qid, "stem": deleted.get("stem", "")})
            except Exception as e:
                log.error(f"/admin/delete-question 异常: {e}")
                self._json(500, {"error": f"删除失败: {e}"})

        elif self.path == "/admin/ebook-upload":
            # 管理员上传 PDF 电子书到 Supabase Storage
            # 使用 service role key 绕过 RLS（前端 anon key 无 INSERT 权限）
            # 接收 JSON: { file_path, file_b64, content_type }
            try:
                if not _check_admin_authorization(self.headers):
                    self._json(401, {"error": "未授权：需要管理员密钥"}); return
                if not SUPABASE_SERVICE_ROLE_KEY:
                    self._json(503, {"error": "服务端未配置 SUPABASE_SERVICE_ROLE_KEY，无法上传"}); return

                # Content-Length 预检：PDF 限制 50MB（base64 约 67MB）
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length > 70 * 1024 * 1024:
                    self._json(413, {"error": "请求体过大（>70MB）"}); return

                try:
                    req = self._read_body(max_size=70 * 1024 * 1024)
                except Exception:
                    self._json(400, {"error": "invalid json"}); return

                file_path = (req.get("file_path") or "").strip()
                file_b64 = (req.get("file_b64") or "").strip()
                content_type = (req.get("content_type") or "application/pdf").strip()

                if not file_path:
                    self._json(400, {"error": "缺少 file_path"}); return
                if not file_b64:
                    self._json(400, {"error": "缺少 file_b64"}); return
                if content_type != "application/pdf":
                    self._json(400, {"error": "仅支持 PDF 文件"}); return

                # 去除 data URL 前缀
                if "," in file_b64[:80] and file_b64.startswith("data:"):
                    file_b64 = file_b64.split(",", 1)[1]

                # 速率限制：每 IP 每分钟最多 10 次上传
                client_ip = self.client_address[0] if self.client_address else "unknown"
                if not _check_rate_limit(client_ip, "ebook-upload", max_per_minute=10):
                    self._json(429, {"error": "上传过于频繁，请稍后再试"}); return

                # 解码 base64
                try:
                    file_bytes = base64.b64decode(file_b64)
                except Exception as e:
                    self._json(400, {"error": f"base64 解码失败: {e}"}); return

                if len(file_bytes) > 50 * 1024 * 1024:
                    self._json(413, {"error": "PDF 文件过大（>50MB）"}); return
                if len(file_bytes) < 1000:
                    self._json(400, {"error": "PDF 文件过小，可能无效"}); return

                # 上传到 Supabase Storage（使用 service role key）
                upload_url = f"{SUPABASE_URL}/storage/v1/object/bioquest-ebooks/{file_path}"
                headers = {
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Content-Type": content_type,
                    "x-upsert": "true"
                }
                req_obj = urllib.request.Request(
                    upload_url, data=file_bytes, headers=headers, method="POST"
                )
                try:
                    with _NO_PROXY_OPENER.open(req_obj, timeout=60) as resp:
                        resp_body = resp.read().decode("utf-8", errors="ignore")
                        if resp.status >= 400:
                            log.error(f"[ebook-upload] Storage 返回 {resp.status}: {resp_body}")
                            self._json(resp.status, {"error": f"Storage 上传失败: {resp_body}"}); return
                except urllib.error.HTTPError as he:
                    err_body = he.read().decode("utf-8", errors="ignore")
                    log.error(f"[ebook-upload] HTTPError {he.code}: {err_body}")
                    self._json(he.code, {"error": f"Storage 上传失败: {err_body}"}); return

                # 构造公开访问 URL（bucket 设为 public）
                public_url = f"{SUPABASE_URL}/storage/v1/object/public/bioquest-ebooks/{file_path}"
                log.info(f"[ebook-upload] 上传成功: {file_path} ({len(file_bytes)} bytes)")
                self._json(200, {
                    "ok": True,
                    "file_path": file_path,
                    "public_url": public_url,
                    "size": len(file_bytes)
                })
            except Exception as e:
                log.error(f"/admin/ebook-upload 异常: {e}")
                self._json(500, {"error": f"上传失败: {e}"})

        elif self.path == "/admin/ebook-delete":
            # 管理员删除 Storage 中的 PDF 电子书
            # 接收 JSON: { file_path }
            try:
                if not _check_admin_authorization(self.headers):
                    self._json(401, {"error": "未授权：需要管理员密钥"}); return
                if not SUPABASE_SERVICE_ROLE_KEY:
                    self._json(503, {"error": "服务端未配置 SUPABASE_SERVICE_ROLE_KEY，无法删除"}); return
                try:
                    req = self._read_body()
                except Exception:
                    self._json(400, {"error": "invalid json"}); return

                file_path = (req.get("file_path") or "").strip()
                if not file_path:
                    self._json(400, {"error": "缺少 file_path"}); return

                # 删除 Storage 对象（使用 service role key）
                delete_url = f"{SUPABASE_URL}/storage/v1/object/bioquest-ebooks/{file_path}"
                headers = {
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                }
                req_obj = urllib.request.Request(delete_url, headers=headers, method="DELETE")
                try:
                    with _NO_PROXY_OPENER.open(req_obj, timeout=30) as resp:
                        resp.read()
                except urllib.error.HTTPError as he:
                    err_body = he.read().decode("utf-8", errors="ignore")
                    # 404 表示文件不存在，视为删除成功
                    if he.code != 404:
                        log.error(f"[ebook-delete] HTTPError {he.code}: {err_body}")
                        self._json(he.code, {"error": f"Storage 删除失败: {err_body}"}); return
                except Exception as e:
                    log.warning(f"[ebook-delete] 删除异常（可能文件不存在）: {e}")

                log.info(f"[ebook-delete] 删除成功: {file_path}")
                self._json(200, {"ok": True, "deleted_path": file_path})
            except Exception as e:
                log.error(f"/admin/ebook-delete 异常: {e}")
                self._json(500, {"error": f"删除失败: {e}"})

        elif self.path == "/chat":
            # AI 导师对话（SSE 流式输出）
            try:
                req = self._read_body()
            except:
                self._json(400, {"error":"invalid json"}); return
            user_message = req.get("message", "").strip()
            mode = req.get("mode", "general")
            history = req.get("history", [])
            if not user_message:
                self._json(400, {"error":"消息为空"}); return

            # 用户自定义 API Key（仅个人使用）
            user_api = _resolve_user_api(self.headers)
            use_model = TUTOR_MODEL
            use_base = None
            use_key = None
            if user_api:
                use_base, use_key, use_model, _prov = user_api

            sys_prompt = TUTOR_SYSTEM_PROMPTS.get(mode, TUTOR_SYSTEM_PROMPTS["general"])
            messages = [{"role": "system", "content": sys_prompt}]
            # 附加历史对话（最多 6 轮，防止 token 超限）
            for h in history[-6:]:
                if h.get("role") and h.get("content"):
                    messages.append({"role": h["role"], "content": h["content"]})
            messages.append({"role": "user", "content": user_message})

            # SSE 响应头
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            try:
                # 累积 chunk 到 4 字或 60ms 发送一次，减少 SSE 帧数，降低前端渲染压力
                import time as _time
                buf = ""
                last_send = _time.time()
                for chunk in api_call_stream(use_model, messages,
                                             temperature=0.7, max_tokens=2048,
                                             api_base=use_base, api_key=use_key):
                    buf += chunk
                    now = _time.time()
                    if len(buf) >= 4 or (now - last_send) > 0.06:
                        line = f"data: {json.dumps({'content': buf}, ensure_ascii=False)}\n\n"
                        self.wfile.write(line.encode("utf-8"))
                        self.wfile.flush()
                        buf = ""
                        last_send = now
                if buf:
                    line = f"data: {json.dumps({'content': buf}, ensure_ascii=False)}\n\n"
                    self.wfile.write(line.encode("utf-8"))
                    self.wfile.flush()
                # 结束标记
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except Exception as e:
                err_line = f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
                self.wfile.write(err_line.encode("utf-8"))
                self.wfile.flush()

        elif self.path == "/discussion":
            # 多智能体讨论：支持「群聊模式」与「流水线模式」，SSE 流式输出
            # 群聊模式：3-5 位智能体依次发言，每人可见前面发言（自主协商），末尾综合
            # 流水线模式：数据采集 → 撰写 → 校对 → 整合 四阶段顺序接力
            try:
                req = self._read_body()
            except:
                self._json(400, {"error": "invalid json"}); return
            user_message = req.get("message", "").strip()
            mode = req.get("mode", "group")  # 'group' | 'pipeline'
            history = req.get("history", [])
            # agents: [{key, name, role, system_prompt}]，自定义或预设
            agents_in = req.get("agents", [])
            if not user_message:
                self._json(400, {"error": "消息为空"}); return

            # 规整 agents：自定义优先，否则回退到预设科学家
            PRESET = {
                "mendel": {"name": "孟德尔", "role": "遗传学"},
                "darwin": {"name": "达尔文", "role": "进化论"},
                "watson": {"name": "沃森", "role": "分子生物学"},
            }
            agents = []
            if isinstance(agents_in, list) and agents_in:
                for a in agents_in:
                    key = a.get("key") or a.get("name") or "agent"
                    sp = a.get("system_prompt") or ""
                    if not sp and key in TUTOR_SYSTEM_PROMPTS and key != "general":
                        sp = TUTOR_SYSTEM_PROMPTS[key]
                    if not sp:
                        sp = "你是一位生物学专家，请从专业角度回答学生的问题。"
                    name = a.get("name") or PRESET.get(key, {}).get("name", key)
                    role = a.get("role") or PRESET.get(key, {}).get("role", "专家")
                    agents.append({"key": key, "name": name, "role": role, "system_prompt": sp})
            if not agents:
                for k in ["mendel", "darwin", "watson"]:
                    agents.append({"key": k, "name": PRESET[k]["name"], "role": PRESET[k]["role"],
                                   "system_prompt": TUTOR_SYSTEM_PROMPTS[k]})
            # 群聊模式限制 3-5 位
            if mode == "group":
                agents = agents[:5]
                if len(agents) < 3:
                    pass  # 允许少于 3，但提示前端通常 3-5

            # 用户自定义 API Key（仅个人使用）
            user_api = _resolve_user_api(self.headers)
            use_model = TUTOR_MODEL
            use_base = None
            use_key = None
            if user_api:
                use_base, use_key, use_model, _prov = user_api

            # SSE 响应头
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            import time as _time

            def _send_event(source, content, **extra):
                payload = {"source": source, "content": content}
                payload.update(extra)
                line = f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                self.wfile.write(line.encode("utf-8"))
                self.wfile.flush()

            def _stream_agent(sys_prompt, user_content, source, temperature=0.7, max_tokens=1024):
                """流式调用一个智能体，累积推送，返回完整文本"""
                messages = [{"role": "system", "content": sys_prompt}]
                # 附加历史
                for h in history[-6:]:
                    if h.get("role") and h.get("content"):
                        messages.append({"role": h["role"], "content": h["content"]})
                messages.append({"role": "user", "content": user_content})
                full = ""
                buf = ""
                last_send = _time.time()
                for chunk in api_call_stream(use_model, messages,
                                             temperature=temperature, max_tokens=max_tokens,
                                             api_base=use_base, api_key=use_key):
                    full += chunk
                    buf += chunk
                    now = _time.time()
                    if len(buf) >= 4 or (now - last_send) > 0.06:
                        _send_event(source, buf)
                        buf = ""
                        last_send = now
                if buf:
                    _send_event(source, buf)
                return full

            try:
                if mode == "pipeline":
                    # ===== 流水线模式：采集 → 撰写 → 校对 → 整合 =====
                    stages = [
                        {"key": "collect", "name": "数据采集", "role": "采集员",
                         "prompt": "你是数据采集专家。针对用户的请求，提取所有关键信息、"
                                   "需要覆盖的知识点、相关概念与必要数据，用要点列表形式输出。"
                                   "不要撰写正文，只做信息整理。"},
                        {"key": "write", "name": "撰写", "role": "撰写员",
                         "prompt": "你是撰写专家。基于采集员整理的要点，撰写一份结构清晰的初稿，"
                                   "包含引言、主体（分小节）与小结。语言专业、通顺。"},
                        {"key": "proofread", "name": "校对", "role": "校对员",
                         "prompt": "你是校对专家。审阅初稿，检查科学性错误、逻辑漏洞与表达问题，"
                                   "逐条指出并给出修正后的段落。输出\"问题清单 + 修正稿\"。"},
                        {"key": "integrate", "name": "整合", "role": "整合员",
                         "prompt": "你是整合专家。综合校对员的修正，输出最终成品。"
                                   "成品应结构完整、科学准确、可直接交付。"},
                    ]
                    prev_output = ""
                    for i, st in enumerate(stages):
                        _send_event("stage_start", st["name"], stage=st["key"], index=i)
                        if i == 0:
                            user_content = "用户请求：" + user_message
                        else:
                            user_content = ("用户请求：" + user_message +
                                            "\n\n上一阶段（" + stages[i-1]["name"] +
                                            "）的产出：\n" + prev_output +
                                            "\n\n请基于以上内容完成「" + st["name"] + "」阶段的工作。")
                        full = _stream_agent(st["prompt"], user_content, st["key"],
                                             temperature=0.5, max_tokens=1500)
                        prev_output = full
                        _send_event("stage_end", st["name"], stage=st["key"], index=i)
                    # 最终成品就是整合阶段输出
                    _send_event("final", prev_output)
                else:
                    # ===== 群聊模式：智能体依次发言 + 自主协商 + 综合 =====
                    replies = {}
                    for i, ag in enumerate(agents):
                        # 让每位智能体看到前面已发言的观点，从而能追问/回应（自主协商）
                        if i == 0:
                            user_content = user_message
                        else:
                            prior = ""
                            for j in range(i):
                                pj = agents[j]
                                prior += f"【{pj['name']}（{pj['role']}）的观点】\n{replies.get(pj['key'], '')}\n\n"
                            user_content = ("学生问题：" + user_message +
                                            "\n\n在 你 之前，其他专家已经发表了如下观点：\n" + prior +
                                            "请你基于自己的专业视角发表观点。你可以补充、质疑或回应前面专家的看法，"
                                            "形成真正的讨论。")
                        full = _stream_agent(ag["system_prompt"], user_content, ag["key"],
                                             temperature=0.7, max_tokens=1024)
                        replies[ag["key"]] = full

                    # 综合观点
                    agent_names = "、".join(ag["name"] for ag in agents)
                    synth_sys_prompt = (
                        "你是一位生物学综合分析师。你的任务是把" + agent_names +
                        "等专家的回答融合为一个完整、立体的综合观点，"
                        "突出各专家如何互补与呼应，并指出讨论中达成的共识与分歧。"
                        "控制在 400 字以内，使用清晰中文，可适当使用加粗（**）强调关键词。"
                    )
                    synth_user = "学生问题：" + user_message + "\n\n"
                    for ag in agents:
                        synth_user += f"【{ag['name']}（{ag['role']}）的回答】\n{replies.get(ag['key'], '')}\n\n"
                    synth_user += "请基于以上回答给出综合观点。"
                    _stream_agent(synth_sys_prompt, synth_user, "synthesis",
                                  temperature=0.5, max_tokens=1024)

                # 结束标记
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except Exception as e:
                err_line = f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
                try:
                    self.wfile.write(err_line.encode("utf-8"))
                    self.wfile.flush()
                except Exception:
                    pass
                log.error(f"/discussion 异常: {e}")

        elif self.path == "/discussion/finalize":
            # 生成结构化 FinalResult（只含成品，不含对话历史）
            try:
                req = self._read_body()
            except:
                self._json(400, {"error": "invalid json"}); return
            topic = req.get("topic", "").strip()
            mode = req.get("mode", "group")
            transcript = req.get("transcript", [])  # [{source, name, role, content}]
            if not transcript:
                self._json(400, {"error": "无讨论内容"}); return

            # 用户自定义 API Key（仅个人使用）
            user_api = _resolve_user_api(self.headers)
            use_model = TUTOR_MODEL
            use_base = None
            use_key = None
            if user_api:
                use_base, use_key, use_model, _prov = user_api

            # 拼接所有专家发言
            pieces = []
            for t in transcript:
                name = t.get("name") or t.get("source") or "专家"
                role = t.get("role") or ""
                content = t.get("content") or ""
                if content:
                    pieces.append(f"【{name}（{role}）】\n{content}")
            joined = "\n\n".join(pieces)

            sys_prompt = (
                "你是成果整合专家。请把多位智能体的讨论成果整合为一份结构化最终成品。"
                "严格输出以下 JSON（无其他内容、无 markdown 代码块）：\n"
                '{"title":"标题","summary":"200字以内摘要","sections":[{"heading":"小节标题","content":"小节正文"}]}\n'
                "要求：只包含专家的成品观点，不要包含对话历史或元评论；"
                "科学准确；中文表达；content 可包含换行与 **加粗**。"
            )
            user_content = "讨论主题：" + (topic or "（未指定）") + "\n\n讨论记录：\n" + joined[:6000]

            messages = [{"role": "system", "content": sys_prompt},
                        {"role": "user", "content": user_content}]
            raw = ""
            for chunk in api_call_stream(use_model, messages, temperature=0.3, max_tokens=1800,
                                         api_base=use_base, api_key=use_key):
                raw += chunk
            # 尝试解析 JSON
            result = None
            try:
                # 去掉可能的 ```json 包裹
                m = re.search(r'\{[\s\S]*\}', raw)
                if m:
                    result = json.loads(m.group(0))
            except Exception:
                result = None
            if not result:
                result = {"title": topic or "讨论成果", "summary": raw[:200],
                          "sections": [{"heading": "完整成果", "content": raw}]}
            self._json(200, {"ok": True, "finalResult": result})

        elif self.path == "/forecast":
            # AI 考点预测：分析题库 tags 频率 + AI 生成预测
            try:
                req = self._read_body()
            except:
                req = {}
            user_stats = req.get("stats", {})

            pool = load()
            # 统计各 concept 出现频率
            concept_freq = {}
            module_freq = {"module_1": 0, "module_2": 0, "module_3": 0, "module_4": 0}
            for q in pool:
                c = q.get("concept", "")
                if c:
                    concept_freq[c] = concept_freq.get(c, 0) + 1
                m = q.get("module", "")
                if m in module_freq:
                    module_freq[m] += 1

            # 按频率排序取 Top 10
            top_concepts = sorted(concept_freq.items(), key=lambda x: -x[1])[:10]

            prompt = (
                "你是生物高考/竞赛命题趋势分析师。基于以下题库分布数据，"
                "预测今年最可能考查的 5 个考点。返回 JSON：\n"
                '{"forecasts":[{"concept":"考点名","module":"module_X",'
                '"confidence":0.8,"reason":"预测理由","practice_tip":"备考建议"}]}\n\n'
                f"题库概念分布 Top10: {top_concepts}\n"
                f"模块分布: {module_freq}\n"
                f"用户薄弱模块: {user_stats.get('weak_modules', '未知')}"
            )
            try:
                resp = api_call(TUTOR_MODEL, [{"role":"user","content":prompt}],
                                temperature=0.4, max_tokens=1024, json_mode=True)
                if not resp:
                    # AI 不可用时基于题库频率给出统计预测
                    fallback = [
                        {"concept": c, "module": "module_1",
                         "confidence": min(0.95, 0.5 + f * 0.05),
                         "reason": f"题库中出现 {f} 次，高频考点",
                         "practice_tip": "建议优先复习相关基础概念"}
                        for c, f in top_concepts[:5]
                    ]
                    self._json(200, {"ok":True, "forecasts": fallback,
                                     "pool_size": len(pool), "source":"stats"})
                    return
                content = resp["choices"][0]["message"]["content"]
                parsed = json.loads(content) if isinstance(content, str) else content
                self._json(200, {"ok":True, "forecasts": parsed.get("forecasts", []),
                                 "pool_size": len(pool)})
            except Exception as e:
                self._json(500, {"error":f"预测失败: {e}"})

        elif self.path == "/teacher-report":
            # 教师协同视图：基于学生学习数据生成个性化辅导建议
            try:
                req = self._read_body()
            except:
                self._json(400, {"error": "invalid json"}); return

            sd = req.get("studentData", {}) or {}
            name = sd.get("name", "该学生")
            score = sd.get("score", 0)
            accuracy = sd.get("accuracy", 0)
            total_answered = sd.get("totalAnswered", 0)
            weak_modules = sd.get("weakModules", []) or []
            recent_wrong = sd.get("wrongQuestions", []) or sd.get("recentWrong", []) or []
            history = sd.get("history", []) or []

            # 若前端未提供 weakModules，则从 history 推导
            if not weak_modules and history:
                mod_stats = {}
                for h in history:
                    mod = (h or {}).get("module", "未知")
                    if mod not in mod_stats:
                        mod_stats[mod] = {"total": 0, "wrong": 0}
                    mod_stats[mod]["total"] += (h or {}).get("total", 0)
                    mod_stats[mod]["wrong"] += (h or {}).get("total", 0) - (h or {}).get("correct", 0)
                weak_modules = [
                    {"module": m, "total": v["total"], "wrong": v["wrong"],
                     "errorRate": (round(v["wrong"] / v["total"] * 100) if v["total"] else 0)}
                    for m, v in mod_stats.items()
                ]
                weak_modules.sort(key=lambda x: -x["errorRate"])
                weak_modules = weak_modules[:5]

            wrong_brief = "; ".join(
                [f"[{w.get('module','')}/{w.get('subject','')}] {(w.get('question','') or '')[:60]}"
                 for w in recent_wrong[:5]]
            ) or "无近期错题"

            weak_brief = "; ".join(
                [f"{m.get('module','未知')}（错误率{m.get('errorRate',0)}%）"
                 for m in weak_modules]
            ) or "无薄弱模块数据"

            prompt = (
                "你是经验丰富的高中生物竞赛辅导老师。请基于以下学生学习数据，"
                "生成个性化辅导建议。严格以 JSON 格式返回：\n"
                '{"strengths":"该生优势分析（一句话）",'
                '"weaknesses":"薄弱点诊断（一句话）",'
                '"suggestions":["具体可执行的辅导建议1","建议2","建议3"],'
                '"predictedGrade":"预测联赛等级，如 A/B/C/D"}\n\n'
                f"学生姓名：{name}\n"
                f"Bio 分：{score}\n"
                f"正确率：{accuracy}%\n"
                f"累计答题：{total_answered}\n"
                f"薄弱模块：{weak_brief}\n"
                f"近期错题摘要：{wrong_brief}\n\n"
                "要求：suggestions 必须恰好 3 条，每条 30-60 字，针对薄弱模块给出具体复习路径；"
                "predictedGrade 基于 Bio 分（≥85 为 A，70-84 为 B，60-69 为 C，<60 为 D）。"
            )
            try:
                resp = api_call(TUTOR_MODEL, [{"role": "user", "content": prompt}],
                                temperature=0.4, max_tokens=1024, json_mode=True)
                if not resp:
                    # AI 不可用时返回基于规则的降级建议
                    grade = "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 60 else "D"
                    self._json(200, {
                        "ok": True,
                        "advice": {
                            "strengths": f"累计答题 {total_answered} 道，学习态度积极" if total_answered > 0 else "暂无明显优势数据",
                            "weaknesses": weak_brief,
                            "suggestions": [
                                "针对错误率最高的模块进行专项练习，每天 20 题",
                                "整理近期错题，建立错题本并每周复习一次",
                                "结合知识图谱查漏补缺，重点复习薄弱概念"
                            ],
                            "predictedGrade": grade
                        },
                        "source": "fallback"
                    })
                    return
                content = resp["choices"][0]["message"]["content"]
                parsed = json.loads(content) if isinstance(content, str) else content
                # 规范化字段：确保 suggestions 为列表
                if not isinstance(parsed.get("suggestions"), list):
                    parsed["suggestions"] = parsed.get("suggestions") and [parsed["suggestions"]] or []
                # 规范化 predictedGrade
                if not parsed.get("predictedGrade"):
                    parsed["predictedGrade"] = "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 60 else "D"
                self._json(200, {"ok": True, "advice": parsed})
            except Exception as e:
                self._json(500, {"error": f"辅导建议生成失败: {e}"})

        else:
            self._json(404, {"error": "not found"})


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 32


# ========== 命令行入口 ==========
def parse_args():
    parser = argparse.ArgumentParser(description="TATABOX 题目生成服务")
    parser.add_argument("--mode", choices=["serve","generate","retag"], default="serve",
                        help="运行模式: serve=启动HTTP服务, generate=批量生成题目, retag=重新打标")
    parser.add_argument("--type", choices=["gaokao","competition","both","multi_judge"], default="competition",
                        help="生成题目类型: gaokao=高考, competition=竞赛, both=混合, multi_judge=2025联赛多重判断")
    parser.add_argument("--count", type=int, default=20, help="生成数量")
    parser.add_argument("--modules", type=str, default="module_1,module_2,module_3,module_4",
                        help="模块列表，逗号分隔")
    parser.add_argument("--difficulties", type=str, default=None,
                        help="难度列表，逗号分隔 (basic/league/national)")
    parser.add_argument("--interval", type=int, default=2, help="间隔生成秒数（默认2，避免限流）")
    parser.add_argument("--concepts", type=str, default=None,
                        help="指定概念列表，逗号分隔")
    parser.add_argument("--chart", action="store_true", default=False,
                        help="生成图表/数据题")
    parser.add_argument("--retry", type=int, default=3, help="生成失败重试次数")
    parser.add_argument("--output", type=str, default=None, help="输出文件路径")
    parser.add_argument("--workers", type=int, default=1,
                        help="批量生成并发数（默认1）")
    parser.add_argument("--batch-size", type=int, default=1,
                        help="每次 API 调用生成几道题（默认1，兼容旧脚本；已固定单题精雕）")
    parser.add_argument("--model", type=str, default=None,
                        help=f"主命题生成模型（默认{PRIMARY_MODEL}）")
    parser.add_argument("--fast-model", type=str, default=None,
                        help=f"高速生成模型别名（默认{FAST_MODEL}）")
    parser.add_argument("--self-check-model", type=str, default=None,
                        help=f"自检验证模型（默认{SELF_CHECK_MODEL}）")
    return parser.parse_args()


def main():
    global FAST_MODEL, SELF_CHECK_MODEL, PRIMARY_MODEL
    args = parse_args()

    # 允许命令行覆盖模型
    if args.model:
        PRIMARY_MODEL = args.model
        FAST_MODEL = PRIMARY_MODEL  # 同步别名
    if args.fast_model:
        FAST_MODEL = args.fast_model
    if args.self_check_model:
        SELF_CHECK_MODEL = args.self_check_model

    if args.mode == "retag":
        retag_all_questions()
        return

    if args.mode == "generate":
        if args.type == "gaokao":
            targets = ["high_school"]
            difficulties = args.difficulties or "basic"
        elif args.type == "competition":
            targets = ["competition"]
            difficulties = args.difficulties or "league,national"
        elif args.type == "multi_judge":
            targets = ["multi_judge"]
            difficulties = args.difficulties or "league,national"
        else:
            targets = ["high_school","competition","both"]
            difficulties = args.difficulties or "basic,league,national"

        # 固定单题精雕：workers 默认 1，batch_size 保留但仅作兼容
        workers = max(args.workers, 1)

        # 预计耗时：每题约 2 分钟
        est_minutes = args.count * 2
        log.info("="*50)
        log.info(f"  批量生成: type={args.type}, target_count={args.count}, chart={args.chart}")
        log.info(f"  主模型={PRIMARY_MODEL} | 自检模型={SELF_CHECK_MODEL}")
        log.info(f"  workers={workers}, interval={args.interval}s (单题精雕 batch_size=1)")
        log.info(f"  modules={args.modules}, difficulties={difficulties}")
        log.info(f"  预计耗时: 约 {est_minutes} 分钟（{args.count}题 × 2分钟/题）")
        log.info("="*50)

        new, generated = refill(
            count=args.count,
            modules=args.modules,
            difficulties=difficulties,
            targets=targets,
            interval=args.interval,
            concepts=args.concepts,
            chart=args.chart,
            workers=workers,
        )

        log.info(f"批量生成结束: 接受 {new}/{args.count}")
        if args.output and generated:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(generated, f, ensure_ascii=False, indent=2)
            log.info(f"题目已导出到 {args.output}")
        return

    # serve mode
    pool = load()
    log.info("="*50)
    log.info("  bio.dada.im 题目生成服务 v7.1 (大模型精雕版)")
    log.info(f"  API: NVIDIA NIM (free) | 主模型={PRIMARY_MODEL} | 自检模型={SELF_CHECK_MODEL}")
    log.info("  存储: Supabase PostgreSQL + 本地 pool.json 备份")
    log.info(f"  池子: {len(pool)} 题")
    log.info("  依赖: 零 —— 纯 Python 标准库")
    log.info("="*50)
    if len(pool) < 50:
        log.info("初始补货 50 题...")
        threading.Thread(target=lambda: refill(50), daemon=True).start()
    threading.Thread(target=auto_refill, daemon=True).start()
    log.info(f"启动: http://localhost:8000")
    server = ThreadedHTTPServer(("0.0.0.0", 8000), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("收到中断信号，关闭服务")
        server.shutdown()


if __name__ == "__main__":
    main()
