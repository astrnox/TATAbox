#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IBO 理论试卷抽取器（PyMuPDF）
================================================
把 IBO 官方理论试卷 PDF 拆成「题干 + A-E 判断陈述 + 配图」的中间 JSON，
供人工校订与翻译。只做版面抽取，不生成最终题库。

用法：
  python tools/python/import-ibo.py --pdf "IBO 2018 Theoretical exam 1.pdf" \
      --out  extract/exam1.json --figdir extract/figs --prefix ibo2018-t1

设计要点：
  - 页眉/页脚按坐标剔除；
  - 题目头 "Q. N – Title" 切分；
  - 陈述块特征：x0 < 200 且文本以 "A."-"E." 开头，且位于 "True False"
    表头之后（避免把实验步骤 A./B./C. 误判为陈述）；
  - 陈述的换行按块内文本保留，再由人工合并；
  - 配图按 image bbox 以 200dpi 裁剪为 PNG（含叠加标注文字）。
"""
import argparse
import json
import re
from pathlib import Path

import fitz

Q_RE = re.compile(r'^Q\.\s*(\d+)\s*[–-]\s*(.+?)\s*$')
STMT_RE = re.compile(r'^([A-E])\.\s*\n?(.*)$', re.S)


def clean(text):
    text = text.replace('\u00ad', '')
    text = text.replace('\r', '')
    lines = [ln.rstrip() for ln in text.split('\n')]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return '\n'.join(lines)


def is_header_footer(text):
    t = text.strip()
    if re.match(r'^IBO 20\d\d\s*[–-]\s*Theoretical Exam', t):
        return True
    return False


def extract(pdf_path, out_path, figdir, prefix):
    doc = fitz.open(pdf_path)
    questions = []
    cur = None
    for pno in range(doc.page_count):
        page = doc[pno]
        blocks = sorted(page.get_text('blocks'), key=lambda b: (round(b[1]), b[0]))
        if not blocks:
            continue
        # 找 "True False" 表头 y（用于区分陈述块和材料步骤）
        tf_y = None
        for b in blocks:
            if re.match(r'^True\s*\n?\s*False\s*$', b[4].strip()):
                tf_y = b[1]
                break

        for b in blocks:
            x0, y0, x1, y1, text, _bno, _btype = b
            t = clean(text)
            if not t:
                continue
            if is_header_footer(t):
                continue
            m = Q_RE.match(t)
            if m:
                cur = {
                    'number': int(m.group(1)),
                    'title': m.group(2).strip(),
                    'pages': [pno + 1],
                    'stem_lines': [],
                    'statements': [],
                }
                questions.append(cur)
                continue
            if cur is None:
                continue
            if pno + 1 not in cur['pages']:
                cur['pages'].append(pno + 1)
            if re.match(r'^True\s*\n?\s*False\s*$', t):
                continue
            if t.lower().startswith('indicate if each of the following'):
                cur['instruction'] = t.strip()
                continue
            sm = STMT_RE.match(t)
            if sm and x0 < 200 and tf_y is not None and y0 >= tf_y - 6:
                cur['statements'].append({
                    'label': sm.group(1),
                    'text': clean(sm.group(2)),
                    'page': pno + 1,
                })
                continue
            # 其余全部算题干材料（含表格行、图注）
            cur['stem_lines'].append(t)

    # 配图归属：题目页范围内全部图片
    figdir = Path(figdir)
    figdir.mkdir(parents=True, exist_ok=True)
    for q in questions:
        q['figures'] = []
        for idx, pno in enumerate(q['pages']):
            page = doc[pno - 1]
            for im in page.get_images(full=True):
                try:
                    bbox = page.get_image_bbox(im)
                except Exception:
                    continue
                if not bbox or bbox.is_empty or bbox.width < 30 or bbox.height < 20:
                    continue
                pad = 4
                clip = fitz.Rect(bbox.x0 - pad, bbox.y0 - pad, bbox.x1 + pad, bbox.y1 + pad)
                clip &= page.rect
                fname = f'{prefix}-q{q["number"]:02d}-fig{len(q["figures"]) + 1}.png'
                pix = page.get_pixmap(clip=clip, dpi=200)
                pix.save(figdir / fname)
                q['figures'].append({
                    'file': str((figdir / fname)).replace('\\', '/'),
                    'bbox': [round(v, 1) for v in (clip.x0, clip.y0, clip.x1, clip.y1)],
                    'page': pno,
                })
        # 合并题干相邻块，保留换行
        q['stem'] = '\n'.join(q.pop('stem_lines'))

    out = {
        'source_pdf': str(pdf_path).replace('\\', '/'),
        'page_count': doc.page_count,
        'questions': questions,
    }
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'questions={len(questions)} figures={sum(len(q["figures"]) for q in questions)} -> {out_path}')
    for q in questions:
        missing = [chr(65 + i) for i in range(len(q['statements'])) if q['statements'][i]['label'] != chr(65 + i)]
        if missing:
            print(f'  [warn] Q{q["number"]} 陈述标签不连续: {[s["label"] for s in q["statements"]]}')
        if not q['statements']:
            print(f'  [warn] Q{q["number"]} 无陈述块')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--figdir', required=True)
    ap.add_argument('--prefix', required=True)
    args = ap.parse_args()
    extract(args.pdf, args.out, args.figdir, args.prefix)


if __name__ == '__main__':
    main()
