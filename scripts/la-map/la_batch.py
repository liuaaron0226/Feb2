# -*- coding: utf-8 -*-
r"""把還沒有 deep 的概念切成批次檔，交給代理補深讀層"""
import json, os, io, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from la_structure import CHAPTERS

HERE = os.path.dirname(os.path.abspath(__file__))
EPS = json.load(io.open(os.path.join(HERE, "la_eps.json"), encoding="utf-8"))

# 已補過的 deep（重跑時不重複做）
done = {}
dp = os.path.join(HERE, "deep_merged.json")
if os.path.exists(dp):
    done = json.load(io.open(dp, encoding="utf-8"))

need = []          # [(chapter_title, key, concept_dict)]
for ch in CHAPTERS:
    for code, name in list(ch["picks"]) + list(ch.get("tail_picks") or []):
        if code == "__SEC__":
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

# 切批：同一章不跨批，每批上限 14
BATCHES, cur, curch = [], [], None
for chtitle, key, c, code in need:
    if curch != chtitle or len(cur) >= 14:
        if cur:
            BATCHES.append((curch, cur))
        cur, curch = [], chtitle
    cur.append((key, c, code))
if cur:
    BATCHES.append((curch, cur))

names = "ABCDEFGHIJKL"
man = []
for i, (chtitle, items) in enumerate(BATCHES):
    bid = names[i]
    out = {"batch": bid, "chapter": chtitle,
           "concepts": [{
               "key": k, "ep": code, "name": c.get("name", ""),
               "trap": c.get("trap", ""), "formulas": c.get("formulas") or [],
               "compare": c.get("compare"), "md": c.get("md", ""), "sup": c.get("sup", ""),
           } for k, c, code in items]}
    json.dump(out, io.open(os.path.join(HERE, "batch_%s.json" % bid), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    man.append("batch_%s.json  %-34s %d 個概念" % (bid, chtitle, len(items)))

io.open(os.path.join(HERE, "_batches.txt"), "w", encoding="utf-8").write(
    "待補深讀層 %d 個概念，切成 %d 批\n\n" % (len(need), len(BATCHES)) + "\n".join(man))
print("need=%d batches=%d" % (len(need), len(BATCHES)))
