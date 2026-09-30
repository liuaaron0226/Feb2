# -*- coding: utf-8 -*-
r"""工數地圖前置：(1) 盤點現成 notes.json (2) 把缺 notes 的 vtt 轉成 秒數|文字

檔名一律 me_ 前綴（math-engineering）：子代理會在同一個 scratchpad 留下
build.py／p1.py 之類的通用檔名，做線代時已經被覆蓋過一次。
"""
import json, os, re, glob, io

ROOT = r"F:\istudy-backup\工數"
OUT = os.path.dirname(os.path.abspath(__file__))

def secs(ts):
    h, m, s = ts.split(":")
    return int(float(h)) * 3600 + int(float(m)) * 60 + int(float(s.replace(",", ".")))

def vtt_cues(path):
    out, cur = [], None
    for line in io.open(path, encoding="utf-8", errors="ignore"):
        line = line.rstrip("\r\n")
        if "-->" in line:
            cur = secs(line.split("-->")[0].strip())
        elif line.strip() and cur is not None and not line.startswith("WEBVTT"):
            out.append((cur, line.strip()))
            cur = None
    return out

def pack(cues, width=70):
    rows, buf, t0 = [], "", None
    for t, txt in cues:
        if t0 is None:
            t0 = t
        buf = (buf + " " + txt).strip()
        if len(buf) >= width:
            rows.append((t0, buf))
            buf, t0 = "", None
    if buf:
        rows.append((t0 or 0, buf))
    return rows

def code_of(base):
    m = re.match(r"(11\d[春暑]微方\(喻\)\d{2})", base)
    return m.group(1) if m else base

# ---------- 盤點現成 notes.json ----------
def fmt_notes(path):
    d = json.load(io.open(path, encoding="utf-8"))
    base = os.path.basename(path).replace(".notes.json", "")
    L = ["\n\n" + "=" * 76, "## " + base]
    m = d.get("map") or {}
    for s in (m.get("tldr") or []):
        L.append("TLDR: " + s)
    ch = d.get("chapters") or []
    if ch:
        L.append("章節: " + " / ".join("%d:%s" % (c.get("t", 0), c.get("title", "")) for c in ch))
    for c in (m.get("concepts") or []):
        L.append("\n### 概念：%s%s" % (c.get("name", ""),
                 ("  ⚠%s" % c["trap"]) if c.get("trap") else ""))
        for f in (c.get("formulas") or []):
            L.append("   $ %s = %s 〔%s〕" % (f.get("name", ""), f.get("tex", ""), f.get("when", "")))
        cp = c.get("compare")
        if cp:
            L.append("   ▦ %s：%s" % (cp.get("title", ""),
                     " vs ".join(str(x) for x in (cp.get("cols") or [])[1:])))
        if c.get("md"):
            L.append("   md: " + c["md"].replace("\n", " "))
        if c.get("sup"):
            L.append("   sup: " + c["sup"].replace("\n", " "))
    for p in (m.get("playbook") or []):
        L.append("   ➜ 「%s」→ %s" % (p.get("trigger", ""), p.get("method", "")))
    for p in (m.get("pitfalls") or []):
        if isinstance(p, dict):
            L.append("   ✗%s → ✓%s（%s）" % (p.get("wrong", ""), p.get("right", ""), p.get("why", "")))
    return "\n".join(L)

digest, have, miss = [], [], []
for series in ("115春微方", "115暑微方"):
    d = os.path.join(ROOT, series)
    for mp4 in sorted(glob.glob(os.path.join(d, "*.mp4"))):
        base = mp4[:-4]
        if os.path.exists(base + ".notes.json"):
            have.append(base)
            digest.append(fmt_notes(base + ".notes.json"))
        else:
            miss.append(base)

io.open(os.path.join(OUT, "me_digest.md"), "w", encoding="utf-8").write("\n".join(digest))

# ---------- 缺 notes 的 vtt → 秒數|文字 ----------
report, meta = [], {}
for base in miss:
    v = base + ".vtt"
    name = os.path.basename(base)
    code = code_of(name)
    if not os.path.exists(v):
        report.append("NO VTT: " + name)
        continue
    rows = pack(vtt_cues(v))
    safe = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "_", code)
    outp = os.path.join(OUT, "mtx_%s.txt" % safe)
    io.open(outp, "w", encoding="utf-8").write("\n".join("%d|%s" % (t, s) for t, s in rows))
    dur = rows[-1][0] if rows else 0
    meta[code] = {"title": name[len(code):].strip(), "dur": dur, "rows": len(rows),
                  "file": os.path.basename(outp)}
    report.append("%-22s %4d 行  約 %3d 分  → %s" % (code, len(rows), dur // 60, os.path.basename(outp)))

json.dump(meta, io.open(os.path.join(OUT, "me_todo.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
io.open(os.path.join(OUT, "_me_prep.txt"), "w", encoding="utf-8").write(
    "現成 notes: %d 集\n缺 notes: %d 集\n\n" % (len(have), len(miss)) + "\n".join(report)
    + "\n\ndigest 字數: %d" % sum(len(x) for x in digest))
print("have=%d miss=%d digest=%d字" % (len(have), len(miss), sum(len(x) for x in digest)))
