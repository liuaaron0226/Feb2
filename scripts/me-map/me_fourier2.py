# -*- coding: utf-8 -*-
r"""驗證「Fourier 被 Whisper 音譯打散」這個說法，並重測真實覆蓋

教訓：用單一術語寫法做全文檢索，會被語音辨識的音譯變體騙過去。
"""
import io, os, glob, re

ROOT = r"F:\istudy-backup\工數"
OUT = os.path.dirname(os.path.abspath(__file__))

# Fourier 的可能音譯（代理回報的 + 我自己補的）
FOURIER_VARIANTS = ["傅立葉", "傅利葉", "富利葉", "傅葉", "傅烈", "富利業", "複利葉",
                    "負力", "負裂", "負劣", "複利", "複列", "福利葉", "Fourier", "Furrier",
                    "佛立葉", "付立葉", "傅氏"]

# 標準三角傅立葉級數的具體內容（這些才是「有沒有真的教」的判準）
CONCRETE = {
    "係數公式 a0/an/bn": ["a0", "A0", "an", "bn", "係數公式"],
    "週期延拓": ["延拓", "週期延拓", "拓展成週期"],
    "半幅展開": ["半幅", "半波", "正弦級數", "餘弦級數", "sine series", "cosine series"],
    "Parseval": ["Parseval", "帕塞瓦", "帕賽瓦", "能量等式"],
    "Gibbs": ["Gibbs", "吉布斯", "吉伯斯"],
    "Dirichlet 條件": ["Dirichlet", "迪尼克雷", "狄利克雷", "分段單調"],
}

# PDE 也做一次同樣的檢查，避免重蹈覆轍
PDE_VARIANTS = ["偏微分", "偏微方", "PDE", "P.D.E", "偏導", "偏微"]
PDE_CONCRETE = {
    "分離變數法（PDE 版）": ["分離變數法", "令U等於", "X乘T", "XT", "u等於XT"],
    "熱傳導方程": ["熱傳導", "熱方程", "溫度分布"],
    "波動方程": ["波動方程", "弦振動", "振動的弦"],
    "Laplace 方程（穩態）": ["拉普拉斯方程", "穩態", "調和函數"],
}

texts = {}
for f in sorted(glob.glob(os.path.join(ROOT, "*", "*.vtt"))):
    m = re.search(r"\(喻\)(\d+)", os.path.basename(f))
    texts[m.group(1) if m else os.path.basename(f)] = io.open(
        f, encoding="utf-8", errors="ignore").read()

def scan(label, kws):
    hits, tot = [], 0
    for ep in sorted(texts, key=lambda x: int(x) if x.isdigit() else 99):
        n = sum(len(re.findall(re.escape(k), texts[ep], re.I)) for k in kws)
        if n:
            hits.append((ep, n)); tot += n
    return tot, hits

L = ["# Fourier／PDE 覆蓋重測（含音譯變體）\n"]

tot, hits = scan("Fourier 全變體", FOURIER_VARIANTS)
L.append("## Fourier 的所有音譯變體合計：**%d 次**" % tot)
L.append("   " + "、".join("%s集:%d" % (e, n) for e, n in hits))
L.append("   → 對照：只搜「傅立葉/Fourier」兩種寫法時只有 5 次。**單一寫法檢索會嚴重低估**。")
L.append("")
L.append("## 但「有沒有真的教標準三角傅立葉」要看具體內容：")
for label, kws in CONCRETE.items():
    t, h = scan(label, kws)
    mark = "有" if t >= 15 else ("零星" if t >= 3 else "沒有")
    L.append("   [%s] %-22s %4d 次   %s" % (mark, label, t,
             "、".join("%s集:%d" % (e, n) for e, n in h[:5])))
L.append("")
tot2, hits2 = scan("PDE 全變體", PDE_VARIANTS)
L.append("## PDE 的所有變體合計：**%d 次**" % tot2)
L.append("   " + "、".join("%s集:%d" % (e, n) for e, n in hits2))
L.append("")
L.append("## PDE 的具體內容：")
for label, kws in PDE_CONCRETE.items():
    t, h = scan(label, kws)
    mark = "有" if t >= 15 else ("零星" if t >= 3 else "沒有")
    L.append("   [%s] %-22s %4d 次   %s" % (mark, label, t,
             "、".join("%s集:%d" % (e, n) for e, n in h[:5])))

io.open(os.path.join(OUT, "_me_fourier2.txt"), "w", encoding="utf-8").write("\n".join(L))
print("\n".join(L))
