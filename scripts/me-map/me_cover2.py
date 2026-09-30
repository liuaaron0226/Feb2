# -*- coding: utf-8 -*-
r"""工數覆蓋實測 v2：改用「上課實際會講出口的詞」，並對照 manifest 的官方章節描述"""
import os, io, glob, re, json

ROOT = r"F:\istudy-backup\工數"
MANIFEST = r"F:\istudy-backup\manifest.json"
OUT = os.path.dirname(os.path.abspath(__file__))

# 口語詞優先：老師念式子不念術語，所以要抓解題時真的會說的字眼
TOPICS = {
    "冪級數解／Frobenius": ["級數解", "冪級數", "幂級數", "遞迴", "遞回", "收斂半徑",
                            "正則奇異", "奇異點", "指標方程", "Frobenius", "佛羅貝尼"],
    "Fourier 級數": ["傅立葉", "傅利葉", "Fourier", "週期函數", "週期延拓", "偶延拓", "奇延拓",
                     "正弦級數", "餘弦級數", "半幅"],
    "Fourier 轉換／積分": ["傅立葉轉換", "傅立葉積分", "Fourier轉換", "頻譜", "頻域"],
    "PDE：熱傳導／波動": ["熱傳導", "熱方程", "波動方程", "弦振動", "偏微分方程", "分離變數法",
                          "邊界條件", "初始條件"],
    "待定係數法": ["待定係數", "未定係數", "猜解", "特解"],
    "參數變異法": ["參數變異", "參數變換", "變異法", "Variation", "朗斯基"],
    "Wronskian": ["Wronskian", "朗斯基", "郎斯基", "隆斯基"],
    "Legendre": ["Legendre", "勒壤得", "勒讓德", "連得"],
    "複變分析": ["留數", "解析函數", "羅倫", "Laurent", "複變"],
    "向量分析": ["散度", "旋度", "Stokes", "史托克", "格林", "高斯散度"],
    "Laplace 摺積": ["摺積", "卷積", "旋積", "convolution"],
    "Bessel": ["Bessel", "貝索", "貝塞"],
}

files = sorted(glob.glob(os.path.join(ROOT, "*", "*.vtt")))
texts = {}
for f in files:
    try:
        texts[os.path.basename(f).replace(".vtt", "")] = io.open(
            f, encoding="utf-8", errors="ignore").read()
    except Exception:
        pass

L = ["# 工數覆蓋實測 v2（口語詞版）\n"]
for label, kws in TOPICS.items():
    per = []
    total = 0
    for name, s in texts.items():
        n = sum(len(re.findall(re.escape(k), s, re.I)) for k in kws)
        if n:
            per.append((n, name))
            total += n
    per.sort(reverse=True)
    mark = "OK " if total >= 80 else ("?  " if total >= 15 else "GAP")
    L.append("[%s] %-24s 合計 %5d" % (mark, label, total))
    for n, name in per[:4]:
        L.append("           %5d  %s" % (n, name))
L.append("")

# 官方章節描述（manifest 是補習班網站抓下來的，比逐字稿可信）
L.append("\n# manifest 官方課程描述（工數）\n")
try:
    man = json.load(io.open(MANIFEST, encoding="utf-8"))
    for e in man.get("episodes", []):
        if "微方" in (e.get("code", "") or "") or "微方" in (e.get("series", "") or ""):
            cells = " / ".join(x.replace("\n", " ") for x in (e.get("cells") or []) if x)
            L.append("- **%s** %s" % (e.get("code", ""), e.get("title", "")))
            if cells:
                L.append("      %s" % cells)
except Exception as ex:
    L.append("(讀不到 manifest: %s)" % ex)

io.open(os.path.join(OUT, "me_cover2.md"), "w", encoding="utf-8").write("\n".join(L))
print("\n".join(x for x in L if x.startswith("[")))
