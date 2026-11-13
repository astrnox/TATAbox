#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TATABOX 题库 per-id 重构终端（v1.1 存储规范落地）
====================================================
把题库由「一主题一个 JSON」重构为「一题一文件 + id大全」四件套：

  真源（手改）： data/questions/<tag>/<difficulty>/<id>.json   每道题一个文件
  产物（脚本再生）：
    data/questions/id-all.json     id大全：全库筛选索引（tag/difficulty/len/has_image/file）
    data/bank/<tag>.json           整主题合并题集（旧前端 loader 直接读取）
    data/index/<tag>.json          轻量索引（id -> {src,tags,diff,module,...}，loader 交叉核对用）
    data/manifest.json             rev 提升 + 全部文件 SHA-256 重算 + total/topics.count

用法：
  python3 tools/python/rebuild-bank-perid.py build [--from-bank|--per-id-only]
      --from-bank    以 data/bank/<tag>.json 为源，迁移生成 data/questions/ 后再生四件套
      --per-id-only  以 data/questions/** 为源，仅再生 bank/index/id-all/manifest
      （默认自动：questions 非空用 per-id-only，否则用 from-bank）
  python3 tools/python/rebuild-bank-perid.py clear
      一键清空全部题目：bank/index 置空 {}、删除 questions/、id大全 total=0（保留 80 考点空壳）
  python3 tools/python/rebuild-bank-perid.py verify
      校验四源一致性 / 字段完整性 / 解析格式(v1.1) / 答案分布 / image 文件存在性 / manifest SHA
  python3 tools/python/rebuild-bank-perid.py new --tag <考点> --difficulty <档> --id <id>
      生成单题文件骨架（v1.1 字段 + 逐项解析格式），供重写题库时脚手架式建题

依赖：仅 Python3 标准库。
"""
import argparse
import hashlib
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BANK_DIR = ROOT / "data" / "bank"
INDEX_DIR = ROOT / "data" / "index"
QUESTIONS_DIR = ROOT / "data" / "questions"
ID_ALL = QUESTIONS_DIR / "id-all.json"
MANIFEST = ROOT / "data" / "manifest.json"
ASSETS_Q = ROOT / "assets" / "questions"

VALID_DIFF = {"high_school", "league"}
PLACEHOLDER_RE = re.compile(r"正确答案\s*[：:]\s*[A-D][A-D,，、]*\s*。?\s*详细解析请参见相关教材")
REQUIRED_FIELDS = ("type", "question", "subQuestions", "explanation", "difficulty", "target", "tags")


# ---------------------------------------------------------------- 基础工具
def _json_sorted(obj):
    """确定性 JSON 序列化（保证 manifest SHA 可复现）。"""
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _read_json(path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # 固定 LF：Windows 默认会写 CRLF，而 manifest 里的 SHA-256 需要跨平台一致
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(_json_sorted(obj))


def _sha256_file(path):
    # 统一按 LF 计算摘要：兼容历史上被写成 CRLF 的文件
    data = Path(path).read_bytes().replace(b"\r\n", b"\n")
    return hashlib.sha256(data).hexdigest()


def tag_list():
    """考点清单：以 manifest.topics 为准，回退到 bank 目录现存文件。"""
    mf = _read_json(MANIFEST, {}) or {}
    topics = mf.get("topics") or []
    tags = [t["id"] for t in topics if t.get("id")]
    if not tags:
        tags = sorted(p.stem for p in BANK_DIR.glob("*.json"))
    return tags


def module_of(tags):
    for t in tags or []:
        m = re.match(r"^module[_]?(\d+)$", str(t).strip(), re.I)
        if m:
            return "module_" + m.group(1)
    return "module_1"


# ---------------------------------------------------------------- 数据源
def load_questions_from_bank():
    """从 data/bank/<tag>.json 读取全部题目：{tag: {id: question}}。"""
    out = {}
    for tag in tag_list():
        bank = _read_json(BANK_DIR / f"{tag}.json", {}) or {}
        if isinstance(bank, list):  # 兼容数组形态
            items = {}
            for i, q in enumerate(bank):
                qid = q.get("id") or f"{tag}_{i}"
                items[qid] = q
            bank = items
        if not isinstance(bank, dict):
            continue
        for qid, q in bank.items():
            if not isinstance(q, dict):
                continue
            q.setdefault("tags", [tag])
            out.setdefault(tag, {})[qid] = q
    return out


def load_questions_from_perid():
    """从 data/questions/<tag>/<difficulty>/<id>.json 读取全部题目。"""
    out = {}
    if not QUESTIONS_DIR.exists():
        return out
    for qf in sorted(QUESTIONS_DIR.glob("*/*/*.json")):
        if qf.name == "id-all.json":
            continue
        parts = qf.parts
        tag, difficulty, qid = parts[-3], parts[-2], qf.stem
        q = _read_json(qf, None)
        if not isinstance(q, dict):
            continue
        q.setdefault("difficulty", difficulty)
        q.setdefault("tags", [tag])
        out.setdefault(tag, {})[qid] = q
    return out


def normalize_question(qid, q, tag):
    """字段兜底与规范：返回 (ok, errors, question)。"""
    errors = []
    for f in REQUIRED_FIELDS:
        if f not in q or q[f] in (None, ""):
            errors.append(f"缺字段 {f}")
    if q.get("difficulty") not in VALID_DIFF:
        errors.append(f"difficulty 非法: {q.get('difficulty')}")
    sq = q.get("subQuestions")
    if not isinstance(sq, list) or len(sq) < 4:
        errors.append("subQuestions 不足 4 项")
    else:
        labels = [s.get("label") for s in sq]
        if labels != ["A", "B", "C", "D"]:
            errors.append(f"label 不连续: {labels}")
        n_true = sum(1 for s in sq if s.get("answer") in (True, "true"))
        # GGBO 真题按原卷答案导入，存在全错（0 个正确项）的题组，
        # 这类整卷录入不受「1~3 个正确项」的原创质量约束。
        if q.get("category") != "ggbo" and (n_true < 1 or n_true > 3):
            errors.append(f"正确答案数 {n_true} 越界(应为1-3)")
        for s in sq:
            if not isinstance(s.get("answer"), bool):
                errors.append(f"answer 非布尔: {s.get('label')}")
            if not s.get("text"):
                errors.append(f"选项文本为空: {s.get('label')}")
    return not bool(errors), errors, q


def id_all_entry(qid, q, tag):
    """id大全条目（轻量，仅筛选元信息）。"""
    difficulty = q.get("difficulty") if q.get("difficulty") in VALID_DIFF else "other"
    return {
        "tag": tag,
        "difficulty": difficulty,
        "target": q.get("target", ""),
        "subject": q.get("subject", ""),
        "concept": q.get("concept", ""),
        "type": q.get("type", "mtf"),
        "len": len(str(q.get("question", ""))),
        "has_image": bool(q.get("image")),
        "file": f"{tag}/{difficulty}/{qid}.json",
    }


def index_entry(qid, q, tag):
    """data/index/<tag>.json 条目（兼容旧 loader，src 字段必须存在）。"""
    difficulty = q.get("difficulty") if q.get("difficulty") in VALID_DIFF else "other"
    tags = q.get("tags") or [tag]
    return {
        "tags": tags,
        "src": tag,
        "tag": tag,
        "module": module_of(tags),
        "difficulty": difficulty,
        "diff": difficulty,
        "target": q.get("target", ""),
        "len": len(str(q.get("question", ""))),
        "year": None,
        "has_image": bool(q.get("image")),
    }


# ---------------------------------------------------------------- 产物生成
def generate_derived(questions_by_tag):
    """由 {tag: {qid: q}} 生成 bank/index/id-all/questions 四件套。"""
    id_all = {"_meta": {"generated_at": date.today().isoformat(), "total": 0, "schema_version": 1}, "questions": {}}
    total = 0

    for tag, items in questions_by_tag.items():
        items_sorted = dict(sorted(items.items()))
        for qid, q in items_sorted.items():
            difficulty = q.get("difficulty") if q.get("difficulty") in VALID_DIFF else "other"
            _write_json(QUESTIONS_DIR / tag / difficulty / f"{qid}.json", q)
        _write_json(BANK_DIR / f"{tag}.json", items_sorted)
        idx = {qid: index_entry(qid, q, tag) for qid, q in items_sorted.items()}
        _write_json(INDEX_DIR / f"{tag}.json", idx)
        for qid, q in items_sorted.items():
            id_all["questions"][qid] = id_all_entry(qid, q, tag)
        total += len(items_sorted)

    id_all["_meta"]["total"] = total
    _write_json(ID_ALL, id_all)
    return total


def update_manifest(tag_counts):
    """rev+1、updated_at、total/topics.count、files SHA-256 全量重算。"""
    mf = _read_json(MANIFEST, {}) or {}
    mf["rev"] = int(mf.get("rev", 0)) + 1
    mf["updated_at"] = date.today().isoformat()
    mf["total_questions"] = sum(tag_counts.values())

    topics = mf.get("topics") or []
    for t in topics:
        t["count"] = tag_counts.get(t.get("id"), 0)
    sources = mf.get("sources") or []
    for s in sources:
        s["count"] = tag_counts.get(s.get("tag"), 0)

    files = {}
    for tag in tag_counts:
        files[f"bank/{tag}.json"] = _sha256_file(BANK_DIR / f"{tag}.json")
        files[f"index/{tag}.json"] = _sha256_file(INDEX_DIR / f"{tag}.json")
    if ID_ALL.exists():
        files["questions/id-all.json"] = _sha256_file(ID_ALL)
    if files:
        mf["files"] = files
    _write_json(MANIFEST, mf)


# ---------------------------------------------------------------- clear
def clear_all():
    """清空全部题目，保留 80 考点空壳（空 {}），供用户全量重写。"""
    for tag in tag_list():
        for d in (BANK_DIR, INDEX_DIR):
            _write_json(d / f"{tag}.json", {})
    if QUESTIONS_DIR.exists():
        shutil.rmtree(QUESTIONS_DIR)
    _write_json(ID_ALL, {"_meta": {"generated_at": date.today().isoformat(), "total": 0, "schema_version": 1}, "questions": {}})
    update_manifest({tag: 0 for tag in tag_list()})
    return len(tag_list())


# ---------------------------------------------------------------- verify
def verify():
    errors, warns = [], []
    mf = _read_json(MANIFEST, {}) or {}
    mf_files = mf.get("files") or {}

    manifest_total = int(mf.get("total_questions", -1))
    id_all = _read_json(ID_ALL, {}) or {}
    id_all_questions = (id_all.get("questions") or {}) if isinstance(id_all.get("questions"), dict) else {}
    perid = load_questions_from_perid()
    bank = load_questions_from_bank()

    bank_ids, perid_ids = set(), set()
    for tag, items in bank.items():
        for qid, q in items.items():
            bank_ids.add(qid)
            ok, errs, _ = normalize_question(qid, q, tag)
            if not ok:
                errors.append(f"[bank:{tag}:{qid}] " + "; ".join(errs))
            expl = str(q.get("explanation", ""))
            if PLACEHOLDER_RE.search(expl) or "详细解析请参见相关教材" in expl:
                warns.append(f"[{tag}:{qid}] 占位解析（R3 关注）")
            elif len(expl) < 120:
                warns.append(f"[{tag}:{qid}] 解析 {len(expl)} 字 < 120")
            elif not re.search(r"【(对|错|正确|错误)】|【A】|A【", expl):
                warns.append(f"[{tag}:{qid}] 解析缺少逐项标记（v1.1 建议 A【对】…/B【错】…）")
            if len(str(q.get("question", ""))) < 15:
                warns.append(f"[{tag}:{qid}] 题干 {len(str(q.get('question', '')))} 字 < 15")
            img = q.get("image")
            if isinstance(img, dict) and img.get("file") and not (ROOT / img["file"]).exists():
                errors.append(f"[{tag}:{qid}] image.file 缺失: {img['file']}")

    for tag, items in perid.items():
        for qid, q in items.items():
            perid_ids.add(qid)
            ok, errs, _ = normalize_question(qid, q, tag)
            if not ok:
                errors.append(f"[perid:{tag}:{qid}] " + "; ".join(errs))
            dif = q.get("difficulty") if q.get("difficulty") in VALID_DIFF else "other"
            fpath = QUESTIONS_DIR / tag / dif / f"{qid}.json"
            if not fpath.exists():
                errors.append(f"[perid:{tag}:{qid}] 单题文件路径与 difficulty 不一致: {fpath.relative_to(ROOT)}")

    idall_ids = set(id_all_questions.keys())
    if sorted(idall_ids) != sorted(bank_ids):
        errors.append(f"id大全({len(idall_ids)}) 与 bank({len(bank_ids)}) id 集合不一致")
    if perid and sorted(perid_ids) != sorted(bank_ids):
        errors.append(f"questions 目录({len(perid_ids)}) 与 bank({len(bank_ids)}) id 集合不一致")
    if manifest_total != len(bank_ids):
        errors.append(f"manifest.total_questions({manifest_total}) 与 bank 实际({len(bank_ids)}) 不符")

    for key, exp in mf_files.items():
        p = ROOT / "data" / key
        if not p.exists():
            errors.append(f"manifest.files 指向缺失文件: {key}")
            continue
        if _sha256_file(p) != exp:
            errors.append(f"manifest SHA 不匹配: {key}")

    for w in warns:
        print("  [WARN] " + w)
    for e in errors:
        print("  [FAIL] " + e)
    print(f"verify: tags={len(bank or perid)} bank_ids={len(bank_ids)} perid={len(perid_ids)} "
          f"id大全={len(idall_ids)} total(manifest)={manifest_total}  errors={len(errors)} warns={len(warns)}")
    return 1 if errors else 0


# ---------------------------------------------------------------- new
def new_question(tag, difficulty, qid, module="module_1", subject="生物学科"):
    """生成单题文件模板（v1.1 字段骨架 + 逐项解析格式），供重写题库时脚手架式建题。"""
    tpl = {
        "type": "mtf",
        "question": "题干：15~80 字，尽量给出情境/限定（例如：在减数分裂 I 后期……）",
        "subQuestions": [
            {"label": "A", "text": "选项 A（8~60 字，正确答案数保持 1~3 个）", "answer": True},
            {"label": "B", "text": "选项 B（干扰项请基于常见误区设计）", "answer": False},
            {"label": "C", "text": "选项 C", "answer": False},
            {"label": "D", "text": "选项 D", "answer": False},
        ],
        "explanation": "A【对】依据：说明为什么对（20~60 字）。\nB【错】错因：说明为什么错。\nC【错】错因：同上。\nD【错】错因：同上。",
        "subject": subject,
        "concept": "具体考点",
        "difficulty": difficulty,
        "target": "competition" if difficulty == "league" else "high_school",
        "tags": [tag, module, subject, "考点词"],
        "references": [],
    }
    path = QUESTIONS_DIR / tag / difficulty / f"{qid}.json"
    _write_json(path, tpl)
    print(f"new: 模板已生成 {path.relative_to(ROOT)}")
    print("请填写题干/选项/答案/解析，然后执行：")
    print("  python3 tools/python/rebuild-bank-perid.py build --per-id-only")
    return 0


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="TATABOX 题库 per-id 重构终端")
    ap.add_argument("mode", choices=["build", "clear", "verify", "new"])
    ap.add_argument("--from-bank", action="store_true")
    ap.add_argument("--per-id-only", action="store_true")
    ap.add_argument("--tag", default="")
    ap.add_argument("--difficulty", default="league", choices=["high_school", "league"])
    ap.add_argument("--id", default="")
    ap.add_argument("--module", default="module_1")
    ap.add_argument("--subject", default="生物学科")
    args = ap.parse_args()

    if args.mode == "new":
        if not (args.tag and args.id):
            print("new 需要 --tag 与 --id（示例：--tag mendel --id M4-01-12345678）")
            return 1
        return new_question(args.tag, args.difficulty, args.id, args.module, args.subject)

    if args.mode == "clear":
        n = clear_all()
        print(f"clear: 已清空 {n} 个考点的全部题目（bank/index 置空、questions/ 已删、manifest total=0）")
        return 0

    if args.mode == "verify":
        return verify()

    # build
    perid_data = load_questions_from_perid()
    if args.per_id_only or (perid_data and not args.from_bank):
        src = perid_data
        print(f"build(per-id-only): 源 = data/questions/（{sum(len(v) for v in src.values())} 题）")
    else:
        src = load_questions_from_bank()
        print(f"build(from-bank): 源 = data/bank/（{sum(len(v) for v in src.values())} 题）")

    bad = 0
    for tag, items in src.items():
        for qid, q in items.items():
            ok, errs, _ = normalize_question(qid, q, tag)
            if not ok:
                bad += 1
                print(f"  [FAIL] {tag}:{qid} " + "; ".join(errs))
    if bad:
        print(f"build 中止：{bad} 道题未通过规范化（先修复或运行 clear 后重新导入）")
        return 1

    total = generate_derived(src)
    update_manifest({tag: len(v) for tag, v in src.items()})
    print(f"build 完成：四件套已再生，全库 {total} 题（id大全: data/questions/id-all.json）")
    print("建议随后执行: python3 tools/python/rebuild-bank-perid.py verify")
    return 0


if __name__ == "__main__":
    sys.exit(main())