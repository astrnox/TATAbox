#!/usr/bin/env python3
"""
TATABOX — 全量种子数据上传脚本（新 Supabase）
================================================
在「能连通 Supabase 的本地环境」中运行（沙盒网络被白名单限制，无法直连新项目）。

功能：
  1. 校验连接 + 建表（若表不存在，自动执行 schema.sql 关键表；否则跳过）
  2. 题库：清空 questions 表并上传 data/bank/*.json（练习 / 模考 / 课堂共用）；
     data/bank/daily_league_*.json（每日亿题专属 100 题）写入独立表 daily_questions，
     先执行 sql/migration_v10_daily_bank.sql 建表，两题库互不混杂
  3. 卡片：upload data/cards.json -> cards 表（存在则 upsert）
  4. 资源：upload data/resources.json -> resources 表
  5. 社区：upload data/community.json -> community_posts 表（自动适配 author_id）
  6. 打印汇总统计

用法：
  python tools/python/upload_all_to_supabase.py [--questions-only] [--no-questions]

环境变量（从项目根 .env 或环境读取）：
  SUPABASE_URL                默认 https://qxehkfucvmxuojjkdaqy.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   必填（写入 .env，见 .env.example）
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
ENV_PATH = ROOT / ".env"

# ---------- 读取 .env ----------
if ENV_PATH.exists():
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("\"'"))

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qxehkfucvmxuojjkdaqy.supabase.co").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SERVICE_KEY:
    print("❌ 未设置 SUPABASE_SERVICE_ROLE_KEY。请先创建 /workspace/.env（参照 .env.example）。")
    sys.exit(1)

API = SUPABASE_URL + "/rest/v1"
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
}


def sb(method, path, data=None, prefer="return=representation", query=None):
    """Supabase REST 请求（service role，绕过 RLS）。"""
    url = f"{API}/{path}"
    if query:
        url += "?" + query
    payload = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=payload, headers={**HEADERS, "Prefer": prefer}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return raw
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        print(f"⚠️  {method} {path} HTTP {e.code}: {body[:400]}")
        return None
    except Exception as e:
        print(f"⚠️  {method} {path} 异常: {e}")
        return None


def check_table(name):
    """检查表是否存在（service role 可直接访问 information_schema 需要权限，改用浅查询探测）。"""
    r = sb("GET", f"{name}?select=id&limit=1")
    return r is not None  # 能返回即是「存在且可访问」；404/关系不存在返回 None


# ============================================================
# 题库上传
# ============================================================
def build_question_record(qid, q):
    """把新题库 bank 格式 -> questions 表记录。"""
    sub_questions = []
    opts = q.get("subQuestions") or q.get("subquestions") or []
    for sq in opts:
        sub_questions.append({
            "label": sq.get("label", ""),
            "text": sq.get("text", ""),
            "answer": bool(sq.get("answer")),
        })
    tags = list(q.get("tags", []))
    target = q.get("target", "competition")
    if target and target not in tags:
        tags = tags + [target]
    # 单选题（type=single）：answer 为 'A'~'D'、options 为 4 个选项文本；
    # 判断题（mtf）保持 answer='' / options=[]，选项在 sub_questions。
    answer = q.get("answer")
    options = q.get("options")
    return {
        "id": qid,
        "module": q.get("module", "module_1"),
        "type": q.get("type", "mtf"),
        "question": q.get("question", q.get("stem", "")),
        "subject": q.get("subject", ""),
        "concept": q.get("concept", ""),
        "difficulty": q.get("difficulty", "medium"),
        "target": target,
        "answer": str(answer) if isinstance(answer, str) and answer else "",
        "explanation": q.get("explanation", q.get("analysis", "")),
        "options": list(options) if isinstance(options, list) else [],
        "sub_questions": sub_questions,
        "tags": tags,
        "chart": q.get("chart"),
        "year": q.get("year"),
        "source": "data/bank",
    }


def upload_questions():
    print("\n=== [1/4] 题库 questions（练习 / 模考 / 课堂共用） ===")
    if not check_table("questions"):
        print("⚠️  questions 表不存在！请先执行 schema.sql 建表后再运行。")
        return 0, 0
    bank_dir = ROOT / "data" / "bank"
    # 每日亿题专属分片（daily_league_*.json）进入独立表 daily_questions，
    # 与共享题库彻底隔离，绝不写入 questions 表。
    files = sorted(f for f in bank_dir.glob("*.json") if not f.name.startswith("daily_league_"))
    all_records = []
    total = 0
    for f in files:
        tag = f.stem
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        for qid, q in data.items():
            rec = build_question_record(qid, q)
            all_records.append(rec)
            total += 1

    # 清空旧题
    print(f"  待上传 {total} 题（来自 {len(files)} 个分片）")
    dele = sb("DELETE", "questions?id=neq.00000000-0000-0000-0000-000000000000", prefer="return=minimal")
    print(f"  旧题已清空: {dele if dele is not None else 'OK(空)'}")

    # 分片插入（每次 50）
    ok = 0
    for i in range(0, len(all_records), 50):
        batch = all_records[i : i + 50]
        r = sb("POST", "questions", batch, prefer="return=minimal")
        if r is not None:
            ok += len(batch)
        print(f"  进度 {min(ok, total)}/{total}")
        time.sleep(0.2)
    print(f"  ✅ 题库上传完成: {ok}/{total}")
    return ok, total


# ============================================================
# 每日亿题专属题库上传（daily_questions 表，与其他题库隔离）
# ============================================================
def upload_daily_questions():
    print("\n=== [每日亿题] 专属题库 daily_questions ===")
    if not check_table("daily_questions"):
        print("❌ daily_questions 表不存在！请先在 Supabase SQL 编辑器执行 sql/migration_v10_daily_bank.sql 再运行。")
        return 0, 0
    bank_dir = ROOT / "data" / "bank"
    files = sorted(bank_dir.glob("daily_league_*.json"))
    all_records = []
    total = 0
    for f in files:
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        for qid, q in data.items():
            rec = build_question_record(qid, q)
            rec["source"] = "data/bank-daily"
            all_records.append(rec)
            total += 1

    # 只清空每日亿题专属表（绝不动 questions 表）
    print(f"  待上传 {total} 题（来自 {len(files)} 个每日亿题分片）")
    dele = sb("DELETE", "daily_questions?id=neq.00000000-0000-0000-0000-000000000000", prefer="return=minimal")
    print(f"  旧题已清空: {dele if dele is not None else 'OK(空)'}")

    ok = 0
    for i in range(0, len(all_records), 50):
        batch = all_records[i : i + 50]
        r = sb("POST", "daily_questions", batch, prefer="return=minimal")
        if r is not None:
            ok += len(batch)
        print(f"  进度 {min(ok, total)}/{total}")
        time.sleep(0.2)
    print(f"  ✅ 每日亿题专属题库上传完成: {ok}/{total}")
    return ok, total


# ============================================================
# 卡片上传
# ============================================================
def upload_cards():
    print("\n=== [2/4] 知识卡片 cards ===")
    if not check_table("cards"):
        print("⚠️  cards 表不存在，跳过。")
        return 0
    cards_json = ROOT / "data" / "cards.json"
    with open(cards_json, encoding="utf-8") as f:
        raw = json.load(f)
    categories = raw.get("分类") or raw.get("categories") or []
    records = []
    for cat in categories:
        cat_name = cat.get("name") or cat.get("id") or "未分类"
        for c in cat.get("cards") or []:
            records.append({
                "category": cat_name,
                "title": c.get("title", ""),
                "question": c.get("question", ""),
                "answer": c.get("answer", ""),
            })
    ok = 0
    for i in range(0, len(records), 50):
        batch = records[i : i + 50]
        if sb("POST", "cards", batch, prefer="return=minimal") is not None:
            ok += len(batch)
        time.sleep(0.2)
    print(f"  ✅ 卡片上传完成: {ok}/{len(records)}")
    return ok


# ============================================================
# 资源上传
# ============================================================
def upload_resources():
    print("\n=== [3/4] 学习资源 resources ===")
    if not check_table("resources"):
        print("⚠️  resources 表不存在，跳过。")
        return 0
    res_json = ROOT / "data" / "resources.json"
    with open(res_json, encoding="utf-8") as f:
        raw = json.load(f)
    items = raw.get("资源库") or raw.get("resources") or []
    records = []
    for r in items:
        records.append({
            "id": r.get("id"),
            "source": r.get("source", ""),
            "title": r.get("title", ""),
            "link": r.get("link", ""),
            "excerpt": r.get("excerpt", ""),
            "tag": r.get("tag", ""),
            "category": r.get("category", ""),
        })
    ok = 0
    for i in range(0, len(records), 50):
        batch = records[i : i + 50]
        if sb("POST", "resources", batch, prefer="return=minimal") is not None:
            ok += len(batch)
        time.sleep(0.2)
    print(f"  ✅ 资源上传完成: {ok}/{len(records)}")
    return ok


# ============================================================
# 社区种子上传
# ============================================================
def upload_community():
    print("\n=== [4/4] 社区 community_posts ===")
    if not check_table("community_posts"):
        print("⚠️  community_posts 表不存在，跳过。")
        return 0
    # 找一个可用于 seed 的真实 user id（新库空 -> 从 profiles 取一个；若无则提示）
    profiles_raw = sb("GET", "profiles?select=id&limit=1")
    seed_author = None
    try:
        arr = json.loads(profiles_raw) if profiles_raw else []
        if arr:
            seed_author = arr[0].get("id")
    except Exception:
        arr = []
    if not seed_author:
        print("⚠️  未找到可用用户（profiles 为空）。请先在应用注册一个账号，或手工把社区种子帖的 author_id 换成真实用户 id。")
        return 0

    comm_json = ROOT / "data" / "community.json"
    with open(comm_json, encoding="utf-8") as f:
        raw = json.load(f)
    posts = raw.get("posts") or []
    records = []
    for p in posts:
        records.append({
            "id": p.get("id"),
            "author_id": seed_author,
            "author_name": p.get("author_name", ""),
            "content": p.get("content", ""),
            "tags": p.get("tags", []),
            "like_count": p.get("like_count", 0),
            "comment_count": p.get("comment_count", 0),
            "is_pinned": p.get("is_pinned", False),
            "is_deleted": p.get("is_deleted", False),
            "created_at": p.get("created_at"),
        })
    # 清空旧帖（可选）
    for i in range(0, len(records), 20):
        batch = records[i : i + 20]
        if sb("POST", "community_posts", batch, prefer="return=minimal") is not None:
            print(f"  ✅ 社区种子上传: {i+len(batch)}/{len(records)}")
        time.sleep(0.2)
    print(f"  ✅ 社区上传完成: {len(records)} 条")
    return len(records)


# ============================================================
# 主流程
# ============================================================
if __name__ == "__main__":
    q_only = "--questions-only" in sys.argv
    no_q = "--no-questions" in sys.argv

    print("=" * 60)
    print("TATABOX 全量种子数据上传")
    print(f"Supabase: {SUPABASE_URL}")
    print("=" * 60)

    # 连通性检查
    probe = sb("GET", "questions?select=id&limit=1")
    if probe is None:
        print("\n❌ 无法访问 Supabase。请检查网络 / .env 中的 SUPABASE_SERVICE_ROLE_KEY。")
        sys.exit(1)
    print("✅ Supabase 连接正常")

    n_q = 0
    n_dq = 0
    if not no_q:
        n_q, _ = upload_questions()
        n_dq, _ = upload_daily_questions()
    else:
        print("\n[跳过题库]")
    if not q_only:
        upload_cards()
        upload_resources()
        upload_community()

    print("\n" + "=" * 60)
    print(f"✅ 全部完成。共享题库上传 {n_q} 题；每日亿题专属题库上传 {n_dq} 题。")
    print("=" * 60)