# -*- coding: utf-8 -*-
r"""把還沒有 deep 的工數概念切成批次檔，交給代理補深讀層

只有 8 集現成 notes.json 的概念需要補（__EP__ 整集插入的 18 集由代理消化，已自帶 deep）。
"""
import json, os, io, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from me_structure import CHAPTERS

HERE = os.path.dirname(os.path.abspath(__file__))
EPS = json.load(io.open(os.path.join(HERE, "me_eps.json"), encoding="utf-8"))

done = {}
for f in ("medeep_merged.json",):
    p = os.path.join(HERE, f)
    if os.path.exists(p):
        done.update(json.load(io.open(p, encoding="utf-8")))

need = []
for ch in CHAPTERS:
    for code, name in ch["picks"]:
        if code in ("__SEC__", "__EP__"):
            continue
        ep = EPS.get(code)
        if not ep:
            continue
        hit = [x for x in ep["concepts"] if x.get("name", "").strip() == name.strip()]
        if not hit:
            continue
        c = hit[0]
        key = "%s||%s" % (code, c.get("name", ""))
        if c.get("deep") or key in done:
            continue
        need.append(("第%d章 %s" % (ch["no"], ch["title"]), key, c, code))

BATCHES, cur, curch = [], [], None
for chtitle, key, c, code in need:
    if curch != chtitle or len(cur) >= 13:
        if cur:
            BATCHES.append((curch, cur))
        cur, curch = [], chtitle
    cur.append((key, c, code))
if cur:
    BATCHES.append((curch, cur))

names = "PQRSTUVWXYZ"
man = []
for i, (chtitle, items) in enumerate(BATCHES):
    bid = names[i]
    out = {"batch": bid, "chapter": chtitle,
           "concepts": [{"key": k, "ep": code, "name": c.get("name", ""),
                         "trap": c.get("trap", ""), "formulas": c.get("formulas") or [],
                         "compare": c.get("compare"), "md": c.get("md", ""),
                         "sup": c.get("sup", "")} for k, c, code in items]}
    json.dump(out, io.open(os.path.join(HERE, "mbatch_%s.json" % bid), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    man.append("mbatch_%s.json  %-30s %d 個概念" % (bid, chtitle, len(items)))

io.open(os.path.join(HERE, "_me_batches.txt"), "w", encoding="utf-8").write(
    "待補深讀層 %d 個概念，切成 %d 批\n\n" % (len(need), len(BATCHES)) + "\n".join(man))
print("need=%d batches=%d" % (len(need), len(BATCHES)))
