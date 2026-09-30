# -*- coding: utf-8 -*-
r"""修復 JSON 裡被吃掉的 LaTeX 跳脫

症狀：JSON 字串寫成 "\alpha" 而不是 "\\alpha"，解析後 \a 變成 BEL(U+0007)，
KaTeX 收到 BEL+"lpha" 直接渲染失敗。同類：\b \f \r \t \v。

注意：控制字元吃掉的是指令的**第一個字母**，所以要比對的是「控制字元＋剩下的後綴」。
例：\alpha → BEL + "lpha"、\begin → BS + "egin"、\frac → FF + "rac"。
"""
import json, io, os, glob, sys

HERE = os.path.dirname(os.path.abspath(__file__))

# (控制字元, 後綴, 還原成的完整指令) —— 後綴長的排前面，避免短的先吃掉
PAIRS = []
for ctrl, first, words in [
    ("\x07", "a", ["alpha", "arccos", "arcsin", "arctan", "approx", "angle", "ast", "atop"]),
    ("\x08", "b", ["begin", "bmatrix", "boxed", "binom", "bullet", "beta", "bar", "big", "bm"]),
    ("\x0c", "f", ["forall", "frac", "flat", "fbox"]),
    ("\r",   "r", ["rangle", "rightarrow", "right", "rfloor", "rceil", "rho", "rm"]),
    ("\t",   "t", ["textbf", "textit", "times", "theta", "tfrac", "text", "tau", "top", "to"]),
    ("\x0b", "v", ["varepsilon", "varphi", "vmatrix", "vdots", "varnothing", "vec"]),
]:
    for w in sorted(words, key=len, reverse=True):
        assert w.startswith(first)
        PAIRS.append((ctrl + w[1:], "\\" + w))

def fix(s):
    n = 0
    for bad, good in PAIRS:
        while bad in s:
            s = s.replace(bad, good, 1)
            n += 1
    return s, n

def walk(o):
    if isinstance(o, str):
        return fix(o)
    if isinstance(o, list):
        out, tot = [], 0
        for v in o:
            v2, n = walk(v); out.append(v2); tot += n
        return out, tot
    if isinstance(o, dict):
        out, tot = {}, 0
        for k, v in o.items():
            v2, n = walk(v); out[k] = v2; tot += n
        return out, tot
    return o, 0

targets = sys.argv[1:] or (glob.glob(os.path.join(HERE, "mep_*.json")) +
                           glob.glob(os.path.join(HERE, "ep_*.json")) +
                           glob.glob(os.path.join(HERE, "deep_?.json")) +
                           glob.glob(os.path.join(HERE, "medeep_?.json")))
total = 0
for p in sorted(targets):
    try:
        d = json.load(io.open(p, encoding="utf-8"))
    except Exception as e:
        print("跳過（解析失敗）%s: %s" % (os.path.basename(p), e)); continue
    d2, n = walk(d)
    if n:
        json.dump(d2, io.open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("修復 %-20s %d 處" % (os.path.basename(p), n))
        total += n
# 殘留檢查
left = 0
for p in sorted(targets):
    try:
        raw = io.open(p, encoding="utf-8").read()
    except Exception:
        continue
    for c in raw:
        if ord(c) < 32 and c not in "\n\t\r":
            left += 1
print("共修復 %d 處；殘留裸控制字元 %d 個" % (total, left))
