# -*- coding: utf-8 -*-
r"""從指定集數的逐字稿抽三個位置的實際內容，人工判斷主題"""
import io, os, glob, re, sys

ROOT = r"F:\istudy-backup\工數"
OUT = os.path.dirname(os.path.abspath(__file__))

def load(path):
    rows, cur = [], None
    for line in io.open(path, encoding="utf-8", errors="ignore"):
        line = line.strip()
        if "-->" in line:
            hh, mm, ss = line.split("-->")[0].strip().split(":")
            cur = int(float(hh)) * 3600 + int(float(mm)) * 60 + int(float(ss))
        elif line and cur is not None and not line.startswith("WEBVTT"):
            rows.append((cur, line))
            cur = None
    return rows

TARGETS = ["24", "25", "26", "19", "23"]
L = []
for f in sorted(glob.glob(os.path.join(ROOT, "115暑微方", "*.vtt"))):
    name = os.path.basename(f).replace(".vtt", "")
    m = re.search(r"\(喻\)(\d+)", name)
    if not m or m.group(1) not in TARGETS:
        continue
    rows = load(f)
    if not rows:
        continue
    L.append("=" * 70)
    L.append("## %s   （共 %d 句，片長約 %d 分）" % (name, len(rows), rows[-1][0] // 60))
    for frac, tag in ((0.06, "開場後"), (0.35, "前段"), (0.62, "中段"), (0.88, "後段")):
        i = int(len(rows) * frac)
        seg = " ".join(t for _, t in rows[i:i + 22])
        L.append("  【%s @ %d 分】%s" % (tag, rows[i][0] // 60, seg[:420]))
    L.append("")
io.open(os.path.join(OUT, "me_sample.md"), "w", encoding="utf-8").write("\n".join(L))
print("ok")
