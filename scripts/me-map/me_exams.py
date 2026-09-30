# -*- coding: utf-8 -*-
r"""抽出各校工程數學卷的全部章節分佈（含線代，以便判斷該不該收）"""
import json, os, glob, io, collections

SRC = r"C:\Users\User\Desktop\claude\feb2\data\analysis"
OUT = os.path.dirname(os.path.abspath(__file__))

rows, musts = [], []
agg = collections.Counter()
for p in sorted(glob.glob(os.path.join(SRC, "*.json"))):
    n = os.path.basename(p)
    if n.startswith("_") or n == "index.json":
        continue
    try:
        d = json.load(io.open(p, encoding="utf-8"))
    except Exception:
        continue
    sub = d.get("subject", "")
    if not any(k in sub for k in ("工程數學", "工數")):
        continue
    school = d.get("school", "")
    for c in (d.get("chapters") or []):
        yrs = c.get("years") or {}
        tot = sum(int(v) for v in yrs.values())
        rows.append((c.get("name", ""), school, sub, tot, yrs, c.get("qs") or {}))
        agg[c.get("name", "")] += tot
    for m in (d.get("mustKnow") or []):
        musts.append((school, sub, str(m)))

rows.sort(key=lambda r: -r[3])
L = ["# 各校工程數學卷：章節熱度（106–115）\n"]
for name, school, sub, tot, yrs, qs in rows:
    ys = " ".join("%s:%s" % (y, n) for y, n in sorted(yrs.items()) if n)
    L.append("- **%s**〔%s〕%d 題 ｜ %s" % (name, school, tot, ys))

L.append("\n\n# 章節名稱跨校合計（判斷共同熱區）\n")
for name, n in agg.most_common():
    L.append("- %-28s %d 題" % (name, n))

L.append("\n\n# 各校 mustKnow 原文\n")
cur = None
for school, sub, m in musts:
    if (school, sub) != cur:
        cur = (school, sub)
        L.append("\n## %s %s" % (school, sub))
    L.append("- " + m)

io.open(os.path.join(OUT, "me_exams.md"), "w", encoding="utf-8").write("\n".join(L))
print("rows=%d schools=%d" % (len(rows), len({r[1] for r in rows})))
