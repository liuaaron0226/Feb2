# -*- coding: utf-8 -*-
r"""組裝 me-map.html：工數 26 集 + 教科書補的 Fourier／PDE + 考古題 → 單一 HTML

沿用線代那套流程（la_*），差別：
  - picks 支援 ("__EP__", 代號) 整集插入，順序完全由 picks 控制
  - 章可掛 supplement（fourier／pde）接教科書補寫的內容
  - 多一個「與線代地圖的關係」區塊
"""
import json, os, io, re, sys, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from me_structure import CHAPTERS, EP_META
from me_sup_fourier import FOURIER_CONCEPTS
from me_sup_pde import PDE_CONCEPTS
from me_sup_meta import OPENING, EXAM_HOT, GAPS, LINK_LA
from me_sup_flow import CH_FLOW

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = r"C:\Users\User\Desktop\claude\feb2\site\me-map.html"

def _dglob(pat):
    hits = sorted(glob.glob(os.path.join(HERE, "data", pat)))
    return hits or sorted(glob.glob(os.path.join(HERE, pat)))

EPS = json.load(io.open(os.path.join(HERE, "me_eps.json"), encoding="utf-8"))

DEEP = {}
for p in _dglob("medeep_?.json"):
    try:
        DEEP.update(json.load(io.open(p, encoding="utf-8")))
    except Exception as e:
        print("!! 深讀層解析失敗 %s: %s" % (os.path.basename(p), e))

SUPS = {"fourier": FOURIER_CONCEPTS, "pde": PDE_CONCEPTS}

# ── HTML 逃脫 ────────────────────────────────────────────
def esc(s):
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

KATEX_FIX = [("psmallmatrix", "pmatrix"), ("bsmallmatrix", "bmatrix"),
             ("vsmallmatrix", "vmatrix"), ("Bsmallmatrix", "Bmatrix"),
             ("Vsmallmatrix", "Vmatrix")]

def fix_katex(s):
    s = str(s or "")
    for bad, good in KATEX_FIX:
        if bad in s:
            s = s.replace("\\begin{%s}" % bad, "\\begin{%s}" % good)
            s = s.replace("\\end{%s}" % bad, "\\end{%s}" % good)
    return s

MATH_RE = re.compile(r"(\$\$.+?\$\$|\$[^\$\n]+?\$)", re.S)

def inline(s):
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"`([^`]+?)`", r"<code>\1</code>", s)
    return s

def md2html(src):
    if not src:
        return ""
    slots = []
    def stash(m):
        slots.append(m.group(1))
        return "\x00%d\x00" % (len(slots) - 1)
    src = MATH_RE.sub(stash, fix_katex(src))
    src = esc(src)
    out, st = [], {"lst": False, "tag": "ul", "tbl": False}
    def close():
        if st["lst"]:
            out.append("</%s>" % st["tag"]); st["lst"] = False
        if st["tbl"]:
            out.append("</tbody></table></div>"); st["tbl"] = False

    lines = src.split("\n")
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        i += 1
        if not s:
            close(); continue
        # markdown 表格：|---|---| 那一行代表上一行是表頭
        if s.startswith("|") and i < len(lines) + 1 and re.match(r"^\|[\s:|-]+\|$", (lines[i].strip() if i < len(lines) else "")):
            hdr = [c.strip() for c in s.strip("|").split("|")]
            i += 1
            close()
            out.append('<div class="cmp-wrap"><table class="tb"><thead><tr>%s</tr></thead><tbody>'
                       % "".join("<th>%s</th>" % inline(h) for h in hdr))
            st["tbl"] = True
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                out.append("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in cells))
                i += 1
            close()
            continue
        if re.match(r"^-{3,}$", s):
            close(); out.append("<hr>"); continue
        h = re.match(r"^(#{2,4})\s+(.*)$", s)
        if h:
            close(); lv = min(len(h.group(1)) + 1, 5)
            out.append("<h%d>%s</h%d>" % (lv, inline(h.group(2)), lv)); continue
        if s.startswith("&gt; "):
            close(); out.append("<blockquote>%s</blockquote>" % inline(s[5:])); continue
        m = re.match(r"^(\d+)\.\s+(.*)$", s)
        if m:
            if not st["lst"] or st["tag"] != "ol":
                close(); st["tag"] = "ol"; out.append("<ol>"); st["lst"] = True
            out.append("<li>%s</li>" % inline(m.group(2))); continue
        m = re.match(r"^[-*]\s+(.*)$", s)
        if m:
            if not st["lst"] or st["tag"] != "ul":
                close(); st["tag"] = "ul"; out.append("<ul>"); st["lst"] = True
            out.append("<li>%s</li>" % inline(m.group(1))); continue
        close()
        out.append("<p>%s</p>" % inline(s))
    close()
    html = "\n".join(out)
    for j, v in enumerate(slots):
        html = html.replace("\x00%d\x00" % j, esc(v))
    return html

def mtext(s):
    # 純文字＋行內數學的欄位（表格、trap、ch-why…）：粗體也要轉，
    # 但先把 $…$ / $$…$$ 抽走，避免 $Q^{**}(t)$ 這種數學被咬掉
    slots = []
    def stash(m):
        slots.append(m.group(1))
        return "\x00%d\x00" % (len(slots) - 1)
    t = MATH_RE.sub(stash, fix_katex(s))
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", esc(t))
    for j, v in enumerate(slots):
        t = t.replace("\x00%d\x00" % j, esc(v))
    return t

# ── 元件 ────────────────────────────────────────────────
def mermaid(src):
    return '<pre class="mermaid">%s</pre>' % esc(src) if (src or "").strip() else ""

def formulas(fs):
    if not fs:
        return ""
    cards = []
    for f in fs:
        hd = ""
        if f.get("name"):
            hd += "<b>%s</b>" % esc(f["name"])
        if f.get("when"):
            hd += "<span>%s</span>" % esc(f["when"])
        cards.append('<div class="fml-card"><div class="fml-hd">%s</div>'
                     '<div class="fml-body" data-tex="%s"></div></div>'
                     % (hd, esc(fix_katex(f.get("tex", "")))))
    return '<div class="fml">%s</div>' % "".join(cards)

def compare(c):
    if not c or not c.get("cols") or not c.get("rows"):
        return ""
    head = "".join("<th>%s</th>" % mtext(x) for x in c["cols"])
    body = "".join("<tr>%s</tr>" % "".join(
        ("<th>%s</th>" if i == 0 else "<td>%s</td>") % mtext(x) for i, x in enumerate(r))
        for r in c["rows"])
    return ('<div class="cmp">%s<div class="cmp-wrap"><table class="tb">'
            '<thead><tr>%s</tr></thead><tbody>%s</tbody></table></div></div>'
            % ('<div class="cmp-t">%s</div>' % esc(c["title"]) if c.get("title") else "", head, body))

def concept(c, src_label="", key=""):
    if not c.get("deep") and key and DEEP.get(key):
        c = dict(c); c["deep"] = DEEP[key]
    p = []
    if c.get("compare"):
        p.append(compare(c["compare"]))
    if c.get("mermaid"):
        p.append(mermaid(c["mermaid"]))
    if c.get("formulas"):
        p.append(formulas(c["formulas"]))
    if c.get("md"):
        p.append('<div class="md">%s</div>' % md2html(c["md"]))
    if c.get("sup"):
        p.append('<div class="sup">%s</div>' % md2html(c["sup"]))
    if c.get("trap"):
        p.append('<div class="trap">⚠ %s</div>' % mtext(c["trap"]))
    if c.get("deep"):
        p.append('<details class="deep"><summary>深讀層</summary>'
                 '<div class="md deep-body">%s</div></details>' % md2html(c["deep"]))
    tags = ""
    if c.get("gap"):
        tags += '<span class="gap-tag">%s</span>' % esc(c["gap"])
    if src_label:
        tags += '<span class="src">%s</span>' % esc(src_label)
    return ('<details class="card" open><summary>%s%s</summary>'
            '<div class="card-body">%s</div></details>'
            % (esc(c.get("name", "")), tags, "".join(p)))

def hms(t):
    t = int(t or 0)
    return "%d:%02d:%02d" % (t // 3600, t % 3600 // 60, t % 60) if t >= 3600 \
        else "%d:%02d" % (t // 60, t % 60)

def ep_label(code):
    return code.replace("(喻)", "")

def examples(exs, code):
    out = []
    for e in (exs or []):
        h = '<span class="at">%s @ %s</span>' % (esc(ep_label(code)), hms(e.get("t")))
        if e.get("tag"):
            h += '<span class="tag">%s</span>' % mtext(e["tag"])
        if e.get("trigger"):
            h += '<span class="trig">%s</span>' % mtext(e["trigger"])
        trap = '<div class="trap">⚠ %s</div>' % mtext(e["trap"]) if e.get("trap") else ""
        out.append('<div class="ex"><div class="ex-h">%s</div><div class="md">%s</div>%s</div>'
                   % (h, md2html(e.get("md", "")), trap))
    return "".join(out)

def pitfalls(ps):
    rows = []
    for p in (ps or []):
        if isinstance(p, str):
            rows.append('<div class="pit-row" style="grid-template-columns:1fr">'
                        '<div class="pit-o">%s</div></div>' % mtext(p)); continue
        why = '<div class="pit-why">%s</div>' % mtext(p["why"]) if p.get("why") else ""
        rows.append('<div><div class="pit-row"><div class="pit-x">%s</div>'
                    '<div class="pit-o">%s</div></div>%s</div>'
                    % (mtext(p.get("wrong", "")), mtext(p.get("right", "")), why))
    return '<div class="pit">%s</div>' % "".join(rows) if rows else ""

def sec(t):
    return '<div class="sec">%s</div>' % esc(t)

def find_concept(code, name):
    ep = EPS.get(code)
    if not ep:
        return None
    hit = [x for x in ep["concepts"] if x.get("name", "").strip() == name.strip()]
    return hit[0] if hit else None

# ── 組章節 ──────────────────────────────────────────────
parts = []
o = OPENING
parts.append(
    '<section class="hero" id="top" data-nav="開場：工數在幹嘛" data-grp="總覽">'
    '<h2>%s</h2><div class="lede">%s</div><ul class="tldr">%s</ul>%s'
    '<div class="howto">%s</div></section>'
    % (esc(o["title"]), esc(o["sub"]),
       "".join("<li>%s</li>" % md2html(x).replace("<p>", "").replace("</p>", "") for x in o["tldr"]),
       sec("全科骨架：誰依賴誰") + mermaid(o["flow"]), md2html(o["howto"])))

used_codes = []
for ch in CHAPTERS:
    body = []
    fl = CH_FLOW.get(ch["id"])
    if fl:
        body.append(sec(fl[0]) + mermaid(fl[1]))

    ch_codes = []
    for code, name in ch["picks"]:
        if code == "__SEC__":
            body.append(sec(name)); continue
        if code == "__EP__":                       # 整集插入
            ep = EPS.get(name)
            if not ep:
                body.append('<div class="gapbox"><h4>⏳ %s 尚未消化</h4>'
                            '<div class="idx-note">重跑 me_build.py 即會補上。</div></div>'
                            % esc(ep_label(name)))
                continue
            ch_codes.append(name)
            for c in ep["concepts"]:
                body.append(concept(c, ep_label(name), "%s||%s" % (name, c.get("name", ""))))
            continue
        c = find_concept(code, name)
        if c:
            ch_codes.append(code)
            body.append(concept(c, ep_label(code), "%s||%s" % (code, c.get("name", ""))))

    if ch.get("supplement"):
        body.append(sec("以下由標準教科書補上（影片未教）"))
        for c in SUPS[ch["supplement"]]:
            body.append(concept(c, "Kreyszig"))

    ch_codes = list(dict.fromkeys(ch_codes))
    used_codes += ch_codes
    ex_html, pb_rows, pf_html = [], [], []
    for code in ch_codes:
        ep = EPS.get(code)
        if not ep:
            continue
        if ep.get("examples"):
            ex_html.append(examples(ep["examples"], code))
        for p in (ep.get("playbook") or []):
            pb_rows.append((p.get("trigger", ""), p.get("method", ""), ep_label(code)))
        if ep.get("pitfalls"):
            pf_html.append(pitfalls(ep["pitfalls"]))
    if ex_html:
        body.append(sec("例題與解法") + "".join(ex_html))
    if pb_rows:
        body.append(sec("本章招式索引") +
                    '<div class="cmp-wrap"><table class="tb"><thead><tr>'
                    '<th>題目出現什麼</th><th>用哪招</th><th>出處</th></tr></thead><tbody>%s'
                    '</tbody></table></div>'
                    % "".join('<tr><td>%s</td><td>%s</td><td class="src-c">%s</td></tr>'
                              % (mtext(a), mtext(b), esc(c)) for a, b, c in pb_rows))
    if pf_html:
        body.append(sec("易錯對照") + "".join(pf_html))

    chips = ['<span class="chip">%s</span>' % esc(ch["sprint"])]
    chips += ['<span class="chip ep">%s</span>' % esc(ep_label(x)) for x in ch["eps"]]
    if ch.get("supplement"):
        chips.append('<span class="chip hot">影片未教 · 教科書補</span>')
    parts.append(
        '<section class="ch" id="%s" data-nav="%s" data-no="%s" data-grp="%s">'
        '<div class="ch-h"><span class="ch-no">CHAPTER %s</span><h3>%s</h3>'
        '<div class="ch-lead">%s</div><div class="ch-why">%s</div>'
        '<div class="ch-meta">%s</div></div>%s</section>'
        % (ch["id"], esc(ch["title"]), ch["no"], "九章正文" if ch["no"] == 0 else "",
           ch["no"], esc(ch["title"]), mtext(ch["lead"]), mtext(ch["why"]),
           "".join(chips), "".join(body)))

# ── 橫切索引 ────────────────────────────────────────────
def eps_sorted():
    return sorted(EPS.values(), key=lambda e: (e.get("series", ""), e["code"]))

pb_all = [(p.get("trigger", ""), p.get("method", ""), ep_label(e["code"]))
          for e in eps_sorted() for p in (e.get("playbook") or [])]
parts.append(
    '<section class="ch" id="idx-play" data-nav="招式索引（全）" data-grp="橫切索引">'
    '<div class="ch-h"><span class="ch-no">INDEX</span><h3>招式索引</h3>'
    '<div class="ch-lead">26 集的 playbook 全部集中：看到題目長什麼樣，就用哪一招。</div></div>'
    '<div class="idx-note">共 %d 條。工數的解法選擇比線代更關鍵——判錯型整題重來，先掃這一欄。</div>'
    '<div class="big-tb"><table class="tb"><thead><tr><th>題目出現什麼</th><th>用哪招</th>'
    '<th>出處</th></tr></thead><tbody>%s</tbody></table></div></section>'
    % (len(pb_all), "".join('<tr><td>%s</td><td>%s</td><td class="src-c">%s</td></tr>'
                            % (mtext(a), mtext(b), esc(c)) for a, b, c in pb_all)))

fm_all = [(f.get("name", ""), f.get("tex", ""), f.get("when", ""), ep_label(e["code"]))
          for e in eps_sorted() for c in e.get("concepts", []) for f in (c.get("formulas") or [])]
for lbl, lst in (("〔補〕Fourier", FOURIER_CONCEPTS), ("〔補〕PDE", PDE_CONCEPTS)):
    fm_all += [(f.get("name", ""), f.get("tex", ""), f.get("when", ""), lbl)
               for c in lst for f in (c.get("formulas") or [])]
parts.append(
    '<section class="ch" id="idx-fml" data-nav="公式總表" data-grp="橫切索引">'
    '<div class="ch-h"><span class="ch-no">INDEX</span><h3>公式總表</h3>'
    '<div class="ch-lead">全部必背公式一次列出，「什麼時候能用」比公式本身更常被考。</div></div>'
    '<div class="idx-note">共 %d 條。</div>'
    '<div class="big-tb"><table class="tb"><thead><tr><th>名稱</th><th>式子</th>'
    '<th>什麼時候用</th><th>出處</th></tr></thead><tbody>%s</tbody></table></div></section>'
    % (len(fm_all), "".join('<tr><th>%s</th><td><span data-tex="%s"></span></td>'
                            '<td>%s</td><td class="src-c">%s</td></tr>'
                            % (esc(n), esc(fix_katex(t)), esc(w), esc(s)) for n, t, w, s in fm_all)))

pf_all = [(p.get("wrong", ""), p.get("right", ""), p.get("why", ""), ep_label(e["code"]))
          for e in eps_sorted() for p in (e.get("pitfalls") or []) if isinstance(p, dict)]
parts.append(
    '<section class="ch" id="idx-pit" data-nav="易錯總表" data-grp="橫切索引">'
    '<div class="ch-h"><span class="ch-no">INDEX</span><h3>易錯總表</h3>'
    '<div class="ch-lead">老師真的警告過、或例題真的踩過的坑，全部集中。</div></div>'
    '<div class="idx-note">共 %d 條。考前一天掃一遍，CP 值最高。</div>'
    '<div class="big-tb"><table class="tb"><thead><tr><th>常見錯誤</th><th>正確寫法</th>'
    '<th>為什麼</th><th>出處</th></tr></thead><tbody>%s</tbody></table></div></section>'
    % (len(pf_all), "".join('<tr><td>%s</td><td>%s</td><td>%s</td><td class="src-c">%s</td></tr>'
                            % (mtext(w), mtext(r), mtext(y), esc(s)) for w, r, y, s in pf_all)))

gapbox = "".join(
    '<div class="gapbox"><h4>%s ——「%s」</h4><dl><dt>考試</dt><dd>%s</dd>'
    '<dt>證據</dt><dd>%s</dd><dt>本頁處理</dt><dd>%s</dd></dl></div>'
    % (esc(g["topic"]), esc(g["cover"]), mtext(g["exam"]), mtext(g["evidence"]), mtext(g["fix"]))
    for g in GAPS)
parts.append(
    '<section class="ch" id="idx-exam" data-nav="考古題熱區與缺口" data-grp="橫切索引">'
    '<div class="ch-h"><span class="ch-no">INDEX</span><h3>考古題熱區與影片缺口</h3>'
    '<div class="ch-lead">八校工數卷十年考什麼、考多重，以及 26 集影片沒教到哪。</div></div>'
    + sec("影片沒教但會考（逐字稿實測，非推測）") + gapbox + sec("非線代章節熱度")
    + '<div class="idx-note">%s</div><div class="big-tb"><table class="tb"><thead><tr>'
      '<th>章節</th><th>十年題數</th><th>說明</th></tr></thead><tbody>%s</tbody></table></div>'
      % (esc(EXAM_HOT["note"]),
         "".join('<tr><td>%s</td><td class="n-badge">%d</td><td>%s</td></tr>'
                 % (mtext(r["name"]), r["n"], mtext(r["detail"])) for r in EXAM_HOT["rows"]))
    + sec("各校自述的必考重點（原文）")
    + '<div class="big-tb"><table class="tb"><tbody>%s</tbody></table></div></section>'
      % "".join('<tr><th>%s</th><td>%s</td></tr>' % (esc(a), mtext(b)) for a, b in EXAM_HOT["must"]))

# 與線代地圖的關係
parts.append(
    '<section class="ch" id="idx-la" data-nav="線代在哪裡" data-grp="橫切索引">'
    '<div class="ch-h"><span class="ch-no">INDEX</span><h3>線性代數不在這頁</h3>'
    '<div class="ch-lead">%s</div></div>'
    '<div class="idx-note">另一份地圖涵蓋這些章節：%s。'
    '檔案：<code>%s</code>（同一個資料夾）。</div>'
    % (mtext(LINK_LA["note"]), esc("、".join(LINK_LA["chapters"])), esc(LINK_LA["href"]))
    + sec("兩科真正接在一起的地方")
    + '<div class="pit">%s</div></section>'
      % "".join('<div class="pit-row" style="grid-template-columns:1fr">'
                '<div class="pit-o">%s</div></div>' % mtext(x) for x in LINK_LA["cross"]))

# 集數地位表
ep2ch = {}
for ch in CHAPTERS:
    for code, name in ch["picks"]:
        c = name if code == "__EP__" else (None if code == "__SEC__" else code)
        if c:
            ep2ch.setdefault(c, [])
            if ("第%d章" % ch["no"]) not in ep2ch[c]:
                ep2ch[c].append("第%d章" % ch["no"])
rows = []
for code in sorted(EP_META, key=lambda k: (EP_META[k][0], k)):
    meta, ep = EP_META[code], EPS.get(code)
    nc = len(ep["concepts"]) if ep else 0
    src = ("逐字稿 AI 消化" if ep.get("src") == "agent" else "notes.json") if ep else "—"
    rows.append('<tr><th>%s</th><td>%s</td><td class="src-c">%d 分</td><td>%s</td>'
                '<td class="n-badge">%d</td><td class="src-c">%s</td></tr>'
                % (esc(ep_label(code)), mtext(meta[1]), meta[2] // 60,
                   esc("、".join(ep2ch.get(code, ["—"]))), nc, esc(src)))
parts.append(
    '<section class="ch" id="idx-ep" data-nav="26 集地位表" data-grp="橫切索引">'
    '<div class="ch-h"><span class="ch-no">INDEX</span><h3>26 集地位表</h3>'
    '<div class="ch-lead">每一集在地圖上的位置、片長、貢獻了幾個概念。</div></div>'
    '<div class="idx-note">片長為實際錄影長度，2 倍速看完約為一半。'
    '「逐字稿 AI 消化」＝這一集原本沒有 notes.json，內容由逐字稿重新消化而來（26 集裡有 18 集屬於這種）。</div>'
    '<div class="big-tb"><table class="tb"><thead><tr><th>集數</th><th>標題</th><th>片長</th>'
    '<th>對應章</th><th>概念數</th><th>來源</th></tr></thead><tbody>%s</tbody></table></div></section>'
    % "".join(rows))

# ── 輸出 ────────────────────────────────────────────────
tpl = io.open(os.path.join(HERE, "la_template.html"), encoding="utf-8").read()
tpl = tpl.replace("<title>線性代數 · 作戰地圖</title>", "<title>工程數學 · 作戰地圖</title>")
tpl = tpl.replace("線性代數<br>作戰地圖", "工程數學<br>作戰地圖")
tpl = tpl.replace("24 集 · 70 小時<br>打散重組成 7 章", "26 集 · 69 小時<br>打散重組成 9 章")
tpl = tpl.replace("<b>線代作戰地圖</b>", "<b>工數作戰地圖</b>")
tpl = tpl.replace("localStorage.setItem('la-lt'", "localStorage.setItem('me-lt'")
tpl = tpl.replace("localStorage.getItem('la-lt')", "localStorage.getItem('me-lt')")
# 每張地圖一色（T09）：la→--sc-la 族／me→--sc-math 族；亮色走 vellum 對應值
_acc = [("--map-accent:#7FA3C9;--map-accent-hi:#6FA8E8;", "--map-accent:#6FB5B0;--map-accent-hi:#57C7C0;"),
        ("--map-accent:#3D5E80;--map-accent-hi:#3D5E80;", "--map-accent:#2F6B66;--map-accent-hi:#0F7B72;")]
for _old, _new in _acc:
    assert _old in tpl, "map-accent 錨點不見了：" + _old
    tpl = tpl.replace(_old, _new)
html = tpl.replace("<!--{{CONTENT}}-->", "\n".join(parts))
io.open(OUT, "w", encoding="utf-8").write(html)

n_con = sum(len(e["concepts"]) for e in EPS.values()) + len(FOURIER_CONCEPTS) + len(PDE_CONCEPTS)
print("寫出 %s" % OUT)
print("  %.1f KB | 集數 %d/26 | 概念 %d | 深讀層 %d | 招式 %d | 公式 %d | 易錯 %d"
      % (len(html.encode("utf-8")) / 1024, len(EPS), n_con,
         html.count('class="deep"'), len(pb_all), len(fm_all), len(pf_all)))
