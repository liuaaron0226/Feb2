# -*- coding: utf-8 -*-
r"""掃描所有內容用到的 LaTeX 環境與指令，找出 KaTeX 不支援的"""
import json, io, glob, re, collections, os

HERE = os.path.dirname(os.path.abspath(__file__))
envs = collections.Counter()
cmds = collections.Counter()

RE_ENV = re.compile(r"\\begin\{([a-zA-Z*]+)\}")
RE_CMD = re.compile(r"\\([a-zA-Z]{2,})")

def scan(s):
    if not s:
        return
    for e in RE_ENV.findall(s):
        envs[e] += 1
    for c in RE_CMD.findall(s):
        cmds[c] += 1

for p in glob.glob(os.path.join(HERE, "deep_?.json")):
    for v in json.load(io.open(p, encoding="utf-8")).values():
        scan(v)
for p in glob.glob(os.path.join(HERE, "ep_*.json")):
    try:
        d = json.load(io.open(p, encoding="utf-8"))
    except Exception:
        continue
    for c in d.get("concepts", []):
        if not isinstance(c, dict):
            continue
        for k in ("deep", "md", "sup"):
            scan(c.get(k, ""))
        for f in (c.get("formulas") or []):
            scan(f.get("tex", ""))
        cp = c.get("compare")
        if cp:
            for r in (cp.get("rows") or []):
                for x in r:
                    scan(str(x))
    for e in (d.get("examples") or []):
        scan(e.get("md", ""))

# KaTeX 0.16 支援的環境
OK = {"matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix",
      "array", "cases", "rcases", "dcases", "aligned", "align", "align*", "alignat",
      "alignedat", "gathered", "gather", "gather*", "split", "equation", "equation*",
      "subarray", "CD", "darray", "matrix*", "pmatrix*", "bmatrix*", "multline", "multline*"}
bad_env = sorted(e for e in envs if e not in OK)

# KaTeX 不支援但常被誤用的指令
SUSPECT = ["mbox", "text{}", "intertext", "shortintertext", "substack", "boldsymbol",
           "eqref", "label", "ref", "newcommand", "def", "renewcommand", "DeclareMathOperator",
           "xleftrightarrow", "sfrac", "nicefrac", "bigl", "cfrac", "prescript"]
bad_cmd = [c for c in SUSPECT if cmds.get(c)]

L = ["環境使用統計：" + ", ".join("%s×%d" % (k, v) for k, v in envs.most_common())]
L.append("")
L.append("KaTeX 不支援的環境：" + (", ".join("%s（%d 處）" % (e, envs[e]) for e in bad_env) if bad_env else "無"))
L.append("可疑指令：" + (", ".join("%s×%d" % (c, cmds[c]) for c in bad_cmd) if bad_cmd else "無"))
L.append("")
L.append("出現最多的 45 個指令：")
for c, n in cmds.most_common(45):
    L.append("  %-20s %d" % (c, n))
io.open(os.path.join(HERE, "_envscan.txt"), "w", encoding="utf-8").write("\n".join(L))
print("bad_env=%s  bad_cmd=%s" % (bad_env, bad_cmd))
