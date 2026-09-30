# -*- coding: utf-8 -*-
r"""內容錯配檢查：deep 的內容是否真的在談它掛的那個概念

背景：多個子代理在同一個 scratchpad 用同名暫存檔（d01.md 之類）互相覆蓋過，
所以不能只信各批自述的「key 數量一致」——要抽驗內容與 key 是否對得上。
做法：從概念名抽出關鍵詞，看該則深讀層裡出沒的次數；一個都沒中就標可疑。
"""
import json, io, os, re, glob

HERE = os.path.dirname(os.path.abspath(__file__))

STOP = set("的與和及或是在為之對從把用求解說明什麼怎麼如何一個兩三四五六七八九十"
           "vs VS 與其它其他等等")

def keywords(name):
    """從概念名抽關鍵詞：中文取 2 字以上詞塊，英數取整串"""
    toks = re.findall(r"[A-Za-z][A-Za-z0-9_^{}\\+*/-]*|[一-鿿]+", name)
    out = []
    for t in toks:
        if re.match(r"^[A-Za-z]", t):
            if len(t) >= 2:
                out.append(t)
        else:
            # 中文：滑動取 2 字詞
            for i in range(len(t) - 1):
                w = t[i:i + 2]
                if w not in STOP:
                    out.append(w)
    return out

rows, suspect = [], []
for p in sorted(glob.glob(os.path.join(HERE, "deep_?.json"))):
    d = json.load(io.open(p, encoding="utf-8"))
    for k, v in d.items():
        code, name = k.split("||", 1)
        kws = keywords(name)
        if not kws:
            continue
        head = v[:1200]
        hits = sum(1 for w in kws if w in head)
        total = sum(1 for w in kws if w in v)
        rows.append((os.path.basename(p), name, hits, len(kws), total))
        if total == 0:
            suspect.append((os.path.basename(p), name, "全文完全沒出現概念名的任何關鍵詞"))
        elif hits == 0 and total < 2:
            suspect.append((os.path.basename(p), name, "開頭 1200 字沒提到，全文也只出現 %d 次" % total))

L = ["比對 %d 則深讀層的內容與掛載概念" % len(rows), ""]
if suspect:
    L.append("可疑 %d 則：" % len(suspect))
    for f, n, why in suspect:
        L.append("  - [%s] %s\n      %s" % (f, n, why))
else:
    L.append("全部對得上：每則深讀層的內文都確實在談它掛載的概念")
L.append("")
L.append("命中率最低的 12 則（供人工掃一眼）：")
for f, n, h, tot, t in sorted(rows, key=lambda r: (r[4], r[2]))[:12]:
    L.append("  %-14s %-32s 開頭命中 %d/%d，全文出現 %d 次" % (f, n[:32], h, tot, t))
io.open(os.path.join(HERE, "_checkmatch.txt"), "w", encoding="utf-8").write("\n".join(L))
print("rows=%d suspect=%d" % (len(rows), len(suspect)))
