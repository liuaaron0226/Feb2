# -*- coding: utf-8 -*-
r"""掃描並修復被 shell 吃掉的 LaTeX 跳脫序列

症狀：\rangle 的 \r 變成真的 CR 字元、\newline 的 \n 變成換行、\text 的 \t 變成 tab。
成因：含反斜線的內容經過 shell heredoc 傳遞。教訓：一律用檔案工具寫。
"""
import io, os, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))

# 控制字元 → 它原本應該是的 LaTeX 指令開頭
REPAIRS = [
    ("\r" + "angle", r"\rangle"),
    ("\r" + "ight", r"\right"),
    ("\r" + "ho", r"\rho"),
    ("\r" + "m", r"\rm"),
    ("\t" + "ext", r"\text"),
    ("\t" + "imes", r"\times"),
    ("\t" + "au", r"\tau"),
    ("\t" + "heta", r"\theta"),
    ("\t" + "frac", r"\tfrac"),
    ("\x08" + "egin", r"\begin"),      # \b
    ("\x08" + "m", r"\bm"),
    ("\x0c" + "rac", r"\frac"),        # \f
    ("\x0c" + "orall", r"\forall"),
    ("\x0b" + "ec", r"\vec"),          # \v
    ("\x07" + "lpha", r"\alpha"),      # \a
]

targets = sys.argv[1:] or glob.glob(os.path.join(HERE, "me_sup_*.py")) + \
                          glob.glob(os.path.join(HERE, "la_sup_*.py"))
total = 0
for p in targets:
    s = io.open(p, encoding="utf-8", newline="").read()
    orig = s
    hits = []
    for bad, good in REPAIRS:
        if bad in s:
            n = s.count(bad)
            s = s.replace(bad, good)
            hits.append("%s×%d" % (good, n))
    # 回報殘留的裸控制字元（排除正常的 \n 換行）
    stray = sorted({c for c in s if ord(c) < 32 and c != "\n"})
    if s != orig:
        io.open(p, "w", encoding="utf-8", newline="").write(s)
        total += sum(int(h.split("×")[1]) for h in hits)
        print("修復 %-24s %s" % (os.path.basename(p), "、".join(hits)))
    if stray:
        print("   [!] %s 仍有裸控制字元: %s" % (os.path.basename(p), [hex(ord(c)) for c in stray]))
print("共修復 %d 處" % total)
