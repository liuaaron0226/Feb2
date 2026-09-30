# -*- coding: utf-8 -*-
r"""靜態檢查產出的 HTML：markdown 是否有殘留、$ 是否成對、深讀層是否掛上"""
import io, re, os, json, glob, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = r"C:\Users\User\Desktop\claude\feb2\site\la-map.html"
html = io.open(OUT, encoding="utf-8").read()
L = []

def chk(name, cond, detail=""):
    L.append("%s %s%s" % ("PASS" if cond else "FAIL", name, ("  → " + detail) if detail else ""))

# 1) 基本結構
chk("有 7 章 + 開場", html.count('class="ch"') >= 12, "section.ch = %d" % html.count('class="ch"'))
chk("深讀層數量", html.count('class="deep"') > 0, "%d 則" % html.count('class="deep"'))
chk("公式卡", html.count('class="fml-body"') > 0, "%d 張" % html.count('class="fml-body"'))
chk("mermaid 區塊", html.count('class="mermaid"') > 0, "%d 張" % html.count('class="mermaid"'))

# 2) markdown 殘留：正文裡不該還有行首的 ### 或 **粗體** 標記
body = html.split("<!--", 1)[0]
stray_h = re.findall(r">\s*#{2,4}\s+\S", html)
chk("無殘留 ### 標題", len(stray_h) == 0, "%d 處 %s" % (len(stray_h), stray_h[:3]))
stray_b = re.findall(r"\*\*[^*<>\n]{1,40}\*\*", html)
# 允許出現在 mermaid / data-tex（KaTeX 不用 **），實際上不該有
chk("無殘留 **粗體** 標記", len(stray_b) == 0, "%d 處 %s" % (len(stray_b), stray_b[:3]))

# 3) $ 成對（KaTeX 分隔符）——單數代表有公式沒收尾，會整段吃掉版面
# 只看 .md 區塊裡的文字，排除 data-tex 屬性（那裡本來就不帶 $）
md_blocks = re.findall(r'<div class="md[^"]*">(.*?)</div>', html, re.S)
odd = 0
for b in md_blocks:
    n = b.count("$") - 2 * b.count("$$")
    if (b.count("$") % 2) != 0:
        odd += 1
chk("$ 分隔符成對", odd == 0, "%d 個 .md 區塊的 $ 數為奇數" % odd)

# 4) 深讀層 key 是否都對上（batch 要的 vs deep_*.json 給的）
want, got = set(), set()
for p in glob.glob(os.path.join(HERE, "batch_*.json")):
    d = json.load(io.open(p, encoding="utf-8"))
    for c in d["concepts"]:
        want.add(c["key"])
for p in glob.glob(os.path.join(HERE, "deep_*.json")):
    if p.endswith("deep_merged.json"):
        continue
    try:
        got |= set(json.load(io.open(p, encoding="utf-8")).keys())
    except Exception as e:
        L.append("FAIL 深讀層檔解析 %s → %s" % (os.path.basename(p), e))
chk("深讀層 key 全部對得上 batch", got <= want,
    "多出 %d 個對不上的 key: %s" % (len(got - want), list(got - want)[:3]))
L.append("---- 深讀層進度：batch 需要 %d 個，已收到 %d 個，還缺 %d 個"
         % (len(want), len(got & want), len(want - got)))
miss_b = sorted({k.split("||")[0] for k in (want - got)})
if miss_b:
    L.append("     未完成的集數: " + "、".join(miss_b))

# 5) 危險殘留：未逃脫的 < script
chk("內容區無注入風險字串", "<script>alert" not in html)

# 6) 檔案大小
kb = len(html.encode("utf-8")) / 1024
chk("檔案大小合理（< 8 MB）", kb < 8192, "%.1f KB" % kb)

io.open(os.path.join(HERE, "_verify.txt"), "w", encoding="utf-8").write("\n".join(L))
print("\n".join(x for x in L if x.startswith("FAIL") or x.startswith("----") or x.startswith("     ")) or "全部 PASS")
print("(完整結果見 _verify.txt)")
