# -*- coding: utf-8 -*-
"""彙整所有資料 → la_data.json；並檢查 structure.py 的 picks 是否都對得上"""
import json, os, glob, io, sys, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from la_structure import CHAPTERS, EP_META

ROOT = r"F:\istudy-backup\線代"
HERE = os.path.dirname(os.path.abspath(__file__))

# 資料可能在同層（開發時的 scratchpad）或 data/ 子目錄（匯出到專案後）
def _dglob(pat):
    import glob as _g, os as _o
    hits = sorted(_g.glob(_o.path.join(HERE, "data", pat)))
    return hits or sorted(_g.glob(_o.path.join(HERE, pat)))


# ---------- 讀 17 份 notes.json ----------
EPS = {}   # code -> {code,title,dur,tldr,chapters,concepts[],examples[],playbook[],pitfalls[],keys[],src}

def code_of(base):
    m = re.match(r"(11\d[春暑][^\s]+?\d{2})", base)
    if m:
        return m.group(1)
    m = re.match(r"(.+?\)\d{2})", base)
    return m.group(1) if m else base

for series in ("115春矩陣", "115暑線代"):
    for p in sorted(glob.glob(os.path.join(ROOT, series, "*.notes.json"))):
        d = json.load(io.open(p, encoding="utf-8"))
        base = os.path.basename(p).replace(".notes.json", "")
        code = code_of(base)
        m = d.get("map") or {}
        ch = d.get("chapters") or []
        EPS[code] = {
            "code": code, "file": base,
            "title": EP_META.get(code, ("", base, 0))[1],
            "series": EP_META.get(code, ("", "", 0))[0],
            "dur": (ch[-1]["t"] if ch else 0),
            "tldr": m.get("tldr") or [],
            "chapters": ch,
            "concepts": m.get("concepts") or [],
            "examples": m.get("examples") or [],
            "playbook": m.get("playbook") or [],
            "pitfalls": m.get("pitfalls") or [],
            "keys": d.get("keys") or [],
            "flow": m.get("flow") or "",
            "src": "notes",
        }

# ---------- 讀代理產出的 ep_*.json ----------
for p in _dglob("ep_*.json"):
    try:
        d = json.load(io.open(p, encoding="utf-8"))
    except Exception as e:
        print("!! 解析失敗 %s: %s" % (os.path.basename(p), e))
        continue
    code = d.get("code", "")
    code = code_of(code) if code else ""
    if not code:
        print("!! 無 code: " + os.path.basename(p))
        continue
    # 代理會先寫佔位符再分批回填；沒填完的檔案 concepts 裡會混進字串，這種先跳過
    bad = [c for c in (d.get("concepts") or []) if not isinstance(c, dict)]
    if bad:
        print("!! 尚未完成，略過 %s（concepts 含佔位符 %r）"
              % (os.path.basename(p), str(bad[0])[:40]))
        continue
    EPS[code] = {
        "code": code, "file": os.path.basename(p),
        "title": EP_META.get(code, ("", d.get("title", ""), 0))[1],
        "series": EP_META.get(code, ("", "", 0))[0],
        "dur": d.get("durSec", 0),
        "tldr": d.get("tldr") or [],
        "chapters": d.get("chapters") or [],
        "concepts": d.get("concepts") or [],
        "examples": d.get("examples") or [],
        "playbook": d.get("playbook") or [],
        "pitfalls": d.get("pitfalls") or [],
        "keys": d.get("keys") or [],
        "flow": "",
        "topics": d.get("topics") or [],
        "src": "agent",
    }

# ---------- 檢查 picks ----------
missing, used = [], set()
for c in CHAPTERS:
    for code, name in list(c["picks"]) + list(c.get("tail_picks") or []):
        if code == "__SEC__":
            continue
        ep = EPS.get(code)
        if not ep:
            missing.append("集數不存在: %s（%s）" % (code, name))
            continue
        hit = [x for x in ep["concepts"] if x.get("name", "").strip() == name.strip()]
        if not hit:
            near = [x.get("name", "") for x in ep["concepts"]]
            missing.append("概念對不上: %s ▸ %s\n        該集有: %s" % (code, name, " / ".join(near)))
        else:
            used.add((code, name))

# 哪些概念沒被任何章節收
orphan = []
for code, ep in sorted(EPS.items()):
    inextra = any(code in (c.get("extra_eps") or []) for c in CHAPTERS)
    if inextra:
        continue
    for x in ep["concepts"]:
        if (code, x.get("name", "")) not in used:
            orphan.append("%s ▸ %s" % (code, x.get("name", "")))

rep = ["集數: %d 集（notes %d／agent %d）" % (
    len(EPS), sum(1 for e in EPS.values() if e["src"] == "notes"),
    sum(1 for e in EPS.values() if e["src"] == "agent"))]
rep.append("概念總數: %d" % sum(len(e["concepts"]) for e in EPS.values()))
rep.append("\n## picks 對不上 (%d)\n" % len(missing) + "\n".join("  - " + m for m in missing))
rep.append("\n## 未被收錄的概念 (%d)\n" % len(orphan) + "\n".join("  - " + m for m in orphan))
io.open(os.path.join(HERE, "_collect_report.txt"), "w", encoding="utf-8").write("\n".join(rep))

json.dump(EPS, io.open(os.path.join(HERE, "la_eps.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("OK  eps=%d missing=%d orphan=%d" % (len(EPS), len(missing), len(orphan)))
