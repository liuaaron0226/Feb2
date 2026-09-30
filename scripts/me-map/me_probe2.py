# -*- coding: utf-8 -*-
r"""補查：相平面／平衡點／非線性系統線性化、以及聯立 ODE 的覆蓋"""
import io, os, glob, re

ROOT = r"F:\istudy-backup\工數"
OUT = os.path.dirname(os.path.abspath(__file__))

PROBES = {
    "相平面／平衡點／穩定性": ["相平面", "相位平面", "平衡點", "臨界點", "穩定性", "鞍點",
                                "節點", "焦點", "phase plane", "線性化"],
    "聯立 ODE 系統": ["聯立", "系統方程", "state", "狀態方程", "克拉瑪", "克拉默"],
    "數值解法（Euler/RK）": ["尤拉法", "歐拉法", "Runge", "龍格", "數值解", "步長"],
    "全微分／隱函數": ["全微分", "隱函數"],
}

files = sorted(glob.glob(os.path.join(ROOT, "*", "*.vtt")))
L = ["# 補查覆蓋\n"]
for label, kws in PROBES.items():
    hits, tot = [], 0
    for f in files:
        s = io.open(f, encoding="utf-8", errors="ignore").read()
        n = sum(len(re.findall(re.escape(k), s, re.I)) for k in kws)
        if n:
            m = re.search(r"\(喻\)(\d+)", os.path.basename(f))
            hits.append((n, m.group(1) if m else "?"))
            tot += n
    hits.sort(reverse=True)
    mark = "OK " if tot >= 40 else ("?  " if tot >= 10 else "GAP")
    L.append("[%s] %-24s 合計 %4d   %s" % (
        mark, label, tot, "、".join("%s集:%d" % (e, n) for n, e in hits[:6]) or "（完全沒有）"))
io.open(os.path.join(OUT, "_me_probe2.txt"), "w", encoding="utf-8").write("\n".join(L))
print("\n".join(L))
