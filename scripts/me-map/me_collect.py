# -*- coding: utf-8 -*-
r"""彙整工數資料 → me_eps.json；並檢查 me_structure.py 的 picks 是否都對得上"""
import json, os, glob, io, sys, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from me_structure import CHAPTERS, EP_META

ROOT = r"F:\istudy-backup\工數"
HERE = os.path.dirname(os.path.abspath(__file__))

def _dglob(pat):
    hits = sorted(glob.glob(os.path.join(HERE, "data", pat)))
    return hits or sorted(glob.glob(os.path.join(HERE, pat)))

EPS = {}

def code_of(base):
    m = re.match(r"(11\d[春暑]微方\(喻\)\d{2})", base)
    return m.group(1) if m else base

# ---------- 現成 notes.json ----------
for series in ("115春微方", "115暑微方"):
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
            "tldr": m.get("tldr") or [], "chapters": ch,
            "concepts": m.get("concepts") or [],
            "examples": m.get("examples") or [],
            "playbook": m.get("playbook") or [],
            "pitfalls": m.get("pitfalls") or [],
            "keys": d.get("keys") or [], "flow": m.get("flow") or "",
            "src": "notes",
        }

# ---------- 代理消化的 mep_*.json ----------
for p in _dglob("mep_*.json"):
    try:
        d = json.load(io.open(p, encoding="utf-8"))
    except Exception as e:
        print("!! 解析失敗 %s: %s" % (os.path.basename(p), e))
        continue
    code = code_of(d.get("code", ""))
    if not code:
        print("!! 無 code: " + os.path.basename(p)); continue
    bad = [c for c in (d.get("concepts") or []) if not isinstance(c, dict)]
    if bad:
        print("!! 尚未完成，略過 %s（含佔位符 %r）" % (os.path.basename(p), str(bad[0])[:40]))
        continue
    EPS[code] = {
        "code": code, "file": os.path.basename(p),
        "title": EP_META.get(code, ("", d.get("title", ""), 0))[1],
        "series": EP_META.get(code, ("", "", 0))[0],
        "dur": d.get("durSec", 0),
        "tldr": d.get("tldr") or [], "chapters": d.get("chapters") or [],
        "concepts": d.get("concepts") or [],
        "examples": d.get("examples") or [],
        "playbook": d.get("playbook") or [],
        "pitfalls": d.get("pitfalls") or [],
        "keys": d.get("keys") or [], "flow": "",
        "topics": d.get("topics") or [], "src": "agent",
    }

# ---------- 檢查 ----------
missing, used, ep_used = [], set(), set()
for c in CHAPTERS:
    for code, name in c["picks"]:
        if code == "__SEC__":
            continue
        if code == "__EP__":
            if name not in EPS:
                missing.append("整集尚未消化: %s" % name)
            else:
                ep_used.add(name)
            continue
        ep = EPS.get(code)
        if not ep:
            missing.append("集數不存在: %s（%s）" % (code, name)); continue
        hit = [x for x in ep["concepts"] if x.get("name", "").strip() == name.strip()]
        if not hit:
            missing.append("概念對不上: %s ▸ %s\n        該集有: %s"
                           % (code, name, " / ".join(x.get("name", "") for x in ep["concepts"])))
        else:
            used.add((code, name))

orphan = []
for code, ep in sorted(EPS.items()):
    if code in ep_used:
        continue
    for x in ep["concepts"]:
        if (code, x.get("name", "")) not in used:
            orphan.append("%s ▸ %s" % (code, x.get("name", "")))

rep = ["集數: %d/26（notes %d／agent %d）" % (
    len(EPS), sum(1 for e in EPS.values() if e["src"] == "notes"),
    sum(1 for e in EPS.values() if e["src"] == "agent"))]
rep.append("概念總數: %d" % sum(len(e["concepts"]) for e in EPS.values()))
rep.append("\n## 對不上／未消化 (%d)\n" % len(missing) + "\n".join("  - " + m for m in missing))
rep.append("\n## 未被任何章節收錄的概念 (%d)\n" % len(orphan) + "\n".join("  - " + m for m in orphan))
io.open(os.path.join(HERE, "_me_collect.txt"), "w", encoding="utf-8").write("\n".join(rep))

json.dump(EPS, io.open(os.path.join(HERE, "me_eps.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("OK  eps=%d/26  missing=%d  orphan=%d" % (len(EPS), len(missing), len(orphan)))
