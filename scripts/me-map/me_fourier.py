# -*- coding: utf-8 -*-
r"""決定性查核：傅立葉／正交展開／PDE 到底教了沒

老師講課念式子不念術語，所以除了術語，也搜「解題時一定會說出口的話」。
"""
import io, os, glob, re

ROOT = r"F:\istudy-backup\工數"
OUT = os.path.dirname(os.path.abspath(__file__))

PROBES = {
    "傅立葉（術語）": ["傅立葉", "傅利葉", "富利葉", "Fourier", "福利葉"],
    "正交展開（SL 框架）": ["正交", "展開式", "正交性", "權重函數", "加權"],
    "傅立葉係數的口語": ["負L到L", "負派到派", "負π到π", "a零", "A0", "an", "bn",
                          "正弦級數", "餘弦級數", "半幅", "偶延拓", "奇延拓", "延拓"],
    "週期函數": ["週期", "周期", "偶函數", "奇函數"],
    "PDE：分離變數解法": ["分離變數", "令U等於", "X乘以T", "XT", "兩邊除以"],
    "PDE：熱傳導/波動/Laplace方程": ["熱傳", "熱方程", "波動方程", "弦", "拉普拉斯方程", "溫度"],
    "邊界條件": ["邊界條件", "初始條件", "齊次邊界", "邊界值"],
    "Sturm-Liouville": ["SL", "Sturm", "史特姆", "斯特姆", "自伴", "正則"],
    "特殊函數": ["Legendre", "勒壤得", "Lagenda", "拉尖", "Laguerre", "Hermite", "厄米"],
}

files = sorted(glob.glob(os.path.join(ROOT, "*", "*.vtt")))
texts = {}
for f in files:
    key = os.path.basename(f).replace(".vtt", "")
    m = re.search(r"\(喻\)(\d+)", key)
    texts[m.group(1) if m else key] = io.open(f, encoding="utf-8", errors="ignore").read()

L = ["# 傅立葉／PDE 決定性查核\n", "每格是該集的命中次數，只列有命中的集數。\n"]
for label, kws in PROBES.items():
    hits = []
    for ep in sorted(texts, key=lambda x: int(x) if x.isdigit() else 99):
        n = sum(len(re.findall(re.escape(k), texts[ep], re.I)) for k in kws)
        if n:
            hits.append("%s集:%d" % (ep, n))
    tot = sum(int(h.split(":")[1]) for h in hits)
    L.append("**%s** — 合計 %d" % (label, tot))
    L.append("    " + ("、".join(hits) if hits else "（完全沒有）"))
    L.append("")
io.open(os.path.join(OUT, "me_fourier.md"), "w", encoding="utf-8").write("\n".join(L))
print(io.open(os.path.join(OUT, "me_fourier.md"), encoding="utf-8").read())
