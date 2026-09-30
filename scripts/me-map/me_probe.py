# -*- coding: utf-8 -*-
r"""逐集主題探針：抽高頻數學名詞 + 三個位置的實際段落，判斷這一集到底在教什麼"""
import os, io, glob, re, collections

ROOT = r"F:\istudy-backup\工數"
OUT = os.path.dirname(os.path.abspath(__file__))

# 數學主題詞庫：命中就計數，用來替每一集畫「主題指紋」
VOCAB = [
    "正合", "積分因子", "分離變數", "白努利", "Riccati", "齊次", "非齊次",
    "特徵方程", "重根", "待定係數", "參數變異", "朗斯基", "尤拉", "柯西",
    "拉普拉斯", "拉氏", "Laplace", "反轉換", "摺積", "卷積", "步階", "脈衝",
    "級數", "遞迴", "收斂", "奇異點", "指標方程", "Bessel", "貝索", "Legendre",
    "邊界值", "特徵函數", "特徵值",
    "傅立葉", "Fourier", "週期", "延拓", "正弦", "餘弦", "係數公式",
    "偏微", "熱傳", "波動", "弦", "分離", "邊界條件", "初始條件",
    "留數", "解析", "羅倫", "散度", "旋度",
    "矩陣", "向量空間", "線性獨立",
]

L = []
for f in sorted(glob.glob(os.path.join(ROOT, "*", "*.vtt"))):
    name = os.path.basename(f).replace(".vtt", "")
    s = io.open(f, encoding="utf-8", errors="ignore").read()
    cnt = collections.Counter()
    for w in VOCAB:
        n = len(re.findall(re.escape(w), s, re.I))
        if n:
            cnt[w] = n
    top = "、".join("%s×%d" % (w, n) for w, n in cnt.most_common(8))
    L.append("## %s" % name)
    L.append("   指紋：%s" % (top or "（無命中）"))
    L.append("")
io.open(os.path.join(OUT, "me_probe.md"), "w", encoding="utf-8").write("\n".join(L))
print("done")
