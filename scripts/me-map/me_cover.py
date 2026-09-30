# -*- coding: utf-8 -*-
r"""實測工數 26 集逐字稿對各考點的覆蓋（不是用集數標題推測）"""
import os, io, glob, re, collections

ROOT = r"F:\istudy-backup\工數"
OUT = os.path.dirname(os.path.abspath(__file__))

TOPICS = {
    "一階ODE：正合／積分因子": ["正合", "積分因子"],
    "一階ODE：分離變數": ["分離變數"],
    "一階ODE：白努利/Riccati": ["白努利", "伯努利", "Bernoulli", "Riccati", "瑞卡", "里卡"],
    "高階：待定係數": ["待定係數"],
    "高階：參數變異法": ["參數變異", "參數變換", "變異法", "Variation"],
    "高階：Cauchy-Euler": ["尤拉", "歐拉", "Euler", "柯西", "Cauchy"],
    "Wronskian": ["Wronskian", "朗斯基", "郎斯基"],
    "Laplace 轉換": ["拉普拉斯", "拉氏", "Laplace"],
    "Laplace：摺積/卷積": ["摺積", "卷積", "convolution", "旋積"],
    "Laplace：單位步階/Delta": ["步階", "Heaviside", "脈衝", "delta", "Delta"],
    "冪級數解／Frobenius": ["冪級數", "幂級數", "Frobenius", "佛羅", "弗羅"],
    "Bessel": ["Bessel", "貝索", "貝塞"],
    "Legendre": ["Legendre", "勒壤得", "勒讓德"],
    "Sturm-Liouville／邊界值": ["邊界值", "Sturm", "史特姆", "特徵函數"],
    "Fourier 級數": ["傅立葉", "傅利葉", "Fourier"],
    "Fourier 轉換／積分": ["傅立葉轉換", "傅立葉積分", "Fourier transform"],
    "PDE：分離變數": ["偏微分", "分離變數法", "熱傳", "波動方程"],
    "PDE：熱傳導": ["熱傳導", "熱方程"],
    "PDE：波動方程": ["波動方程", "弦振動"],
    "複變：解析函數／留數": ["留數", "解析函數", "Cauchy積分", "羅倫", "Laurent"],
    "向量分析：散度/旋度/Green/Stokes": ["散度", "旋度", "Stokes", "史托克", "Green定理", "格林"],
    "矩陣／線代（已另有地圖）": ["特徵值", "矩陣"],
}

files = sorted(glob.glob(os.path.join(ROOT, "*", "*.vtt")))
res = {}
for label, kws in TOPICS.items():
    per = []
    total = 0
    for f in files:
        try:
            s = io.open(f, encoding="utf-8", errors="ignore").read()
        except Exception:
            continue
        n = sum(len(re.findall(re.escape(k), s, re.I)) for k in kws)
        if n:
            per.append((n, os.path.basename(f).replace(".vtt", "")))
            total += n
    per.sort(reverse=True)
    res[label] = (total, per[:4])

L = ["# 工數 26 集逐字稿：考點覆蓋實測\n",
     "命中數＝該關鍵詞在逐字稿出現次數。數字低（<10）多半只是順帶提及，不是專講。\n"]
for label, (total, per) in sorted(res.items(), key=lambda x: -x[1][0]):
    mark = "✅" if total >= 60 else ("⚠️" if total >= 10 else "❌")
    L.append("%s **%s** — 全系列共 %d 次" % (mark, label, total))
    for n, name in per:
        L.append("      %4d  %s" % (n, name))
    L.append("")
io.open(os.path.join(OUT, "me_cover.md"), "w", encoding="utf-8").write("\n".join(L))
print("掃描 %d 個 vtt" % len(files))
for label, (total, _) in sorted(res.items(), key=lambda x: -x[1][0]):
    print("%6d  %s" % (total, label))
