#!/usr/bin/env python3
"""构建 LXGW WenKai 子集字体（H-04 首屏减重）。

默认字体约 7.7MB。本脚本从站点内容（HTML/JS/CSS/题库/百科/真题池）
中提取实际使用到的字符，再用 fontTools 生成 woff2 子集：
  - 覆盖全部 UI 文案与题目/解析中的汉字；
  - 保留 ASCII、常用标点、CJK 标点与全角符号；
  - 用户临时输入/AI 生成的新字若不在子集内，由系统字体回退。

用法：
  python scripts/build-font-subset.py --dry-run   # 只统计字符数
  python scripts/build-font-subset.py             # 生成 fonts/lxgw-wenkai-subset.woff2

依赖：fonttools（含 brotli）。
"""
from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_FONT = ROOT / "fonts" / "lxgw-wenkai.woff2"
OUT_FONT = ROOT / "fonts" / "lxgw-wenkai-subset.woff2"

# 需要覆盖的语料：站点所有可能渲染到字体的文本来源。
CORPUS_GLOBS = [
    "*.html",
    "js/**/*.js",
    "css/**/*.css",
    "data/**/*.json",
    "resource/all.json",
    "README.md",
    "README-en.md",
]
EXCLUDE_PARTS = ("vendor", "node_modules", ".git", "archive", "docs")


def _corpus_files() -> list[pathlib.Path]:
    files: list[pathlib.Path] = []
    for pattern in CORPUS_GLOBS:
        for path in ROOT.glob(pattern):
            if not path.is_file():
                continue
            if any(part in path.parts for part in EXCLUDE_PARTS):
                continue
            files.append(path)
    return files


def collect_chars() -> set[str]:
    chars: set[str] = set()
    for path in _corpus_files():
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        chars.update(text)

    # 基础字符范围：ASCII、Latin-1、常用标点、CJK 标点、全角符号。
    for start, end in (
        (0x20, 0x7E),
        (0xA0, 0x100),
        (0x2000, 0x2070),
        (0x3000, 0x3040),
        (0xFF00, 0xFFF0),
    ):
        chars.update(chr(code) for code in range(start, end))
    return chars


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="只统计字符数，不生成字体")
    parser.add_argument("--source", default=str(SRC_FONT), help="源字体路径")
    parser.add_argument("--output", default=str(OUT_FONT), help="输出子集字体路径")
    args = parser.parse_args()

    source = pathlib.Path(args.source)
    output = pathlib.Path(args.output)
    if not source.exists():
        print(f"[font-subset] 源字体不存在：{source}", file=sys.stderr)
        return 1

    files = _corpus_files()
    chars = collect_chars()
    print(f"[font-subset] 语料文件 {len(files)} 个，唯一字符 {len(chars)} 个")

    if args.dry_run:
        return 0

    # pyftsubset 的 --text-file 需要 UTF-8 文本；按码点排序保证可复现。
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", suffix=".txt", delete=False
    ) as tmp:
        tmp.write("".join(sorted(chars)))
        chars_file = pathlib.Path(tmp.name)

    cmd = [
        sys.executable,
        "-m",
        "fontTools.subset",
        str(source),
        f"--text-file={chars_file}",
        "--unicodes=U+0020-007E,U+00A0-00FF,U+2000-206F,U+3000-303F,U+FF00-FFEF",
        "--layout-features=*",
        "--flavor=woff2",
        "--output-file=" + str(output),
    ]
    print("[font-subset] 执行:", " ".join(cmd[:3]), "...")
    try:
        subprocess.run(cmd, check=True)
    finally:
        chars_file.unlink(missing_ok=True)

    src_kb = source.stat().st_size / 1024
    out_kb = output.stat().st_size / 1024
    print(
        f"[font-subset] 完成：{src_kb:.0f} KB → {out_kb:.0f} KB"
        f"（-{100 - out_kb / src_kb * 100:.1f}%）"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
