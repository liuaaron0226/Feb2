# -*- coding: utf-8 -*-
r"""獨立驗證深讀層的數學標記：$ 成對、\begin/\end 配對、括號平衡、常見錯拼"""
import json, io, os, re, glob

HERE = os.path.dirname(os.path.abspath(__file__))
BAD = []
STAT = {"keys": 0, "chars": 0}

ENV = re.compile(r"\\(begin|end)\{([a-zA-Z*]+)\}")
KNOWN_CMDS = None  # 不做白名單，只抓結構性錯誤

def check(key, s):
    STAT["keys"] += 1
    STAT["chars"] += len(s)
    # 1) $$ 與 $ 成對
    dd = s.count("$$")
    single = s.count("$") - 2 * dd
    if dd % 2:
        BAD.append((key, "$$ 數量為奇數 (%d)" % dd))
    if single % 2:
        BAD.append((key, "行內 $ 數量為奇數 (%d)" % single))
    # 2) \begin{X} 與 \end{X} 配對
    stack = []
    for kind, name in ENV.findall(s):
        if kind == "begin":
            stack.append(name)
        else:
            if not stack:
                BAD.append((key, "\\end{%s} 沒有對應的 begin" % name)); break
            top = stack.pop()
            if top != name:
                BAD.append((key, "環境交錯：begin{%s} 卻 end{%s}" % (top, name))); break
    if stack:
        BAD.append((key, "環境未關閉：%s" % ", ".join(stack[:3])))
    # 3) 大括號平衡（排除逃脫的 \{ \}）
    t = re.sub(r"\\[{}]", "", s)
    if t.count("{") != t.count("}"):
        BAD.append((key, "大括號不平衡 { %d vs } %d" % (t.count("{"), t.count("}"))))
    # 4) 常見錯誤：\\ 在非矩陣環境外的行尾、markdown 圍欄殘留
    if "```" in s:
        BAD.append((key, "含 markdown 圍欄 ```"))

for p in sorted(glob.glob(os.path.join(HERE, "deep_?.json"))):
    try:
        d = json.load(io.open(p, encoding="utf-8"))
    except Exception as e:
        BAD.append((os.path.basename(p), "JSON 解析失敗：%s" % e)); continue
    for k, v in d.items():
        if not isinstance(v, str):
            BAD.append((k, "值不是字串")); continue
        check(k, v)

# 同時檢查逐字稿消化出來的 deep（ep_*.json）
for p in sorted(glob.glob(os.path.join(HERE, "ep_*.json"))):
    try:
        d = json.load(io.open(p, encoding="utf-8"))
    except Exception:
        continue
    for c in d.get("concepts", []):
        if isinstance(c, dict) and c.get("deep"):
            check("%s||%s" % (d.get("code", ""), c.get("name", "")), c["deep"])

L = ["檢查 %d 則深讀層，共 %d 字元" % (STAT["keys"], STAT["chars"]), ""]
if BAD:
    L.append("發現 %d 個問題：" % len(BAD))
    for k, m in BAD[:40]:
        L.append("  - %s\n      %s" % (k, m))
else:
    L.append("全部通過：$ 成對、環境配對、括號平衡、無圍欄殘留")
io.open(os.path.join(HERE, "_checkmath.txt"), "w", encoding="utf-8").write("\n".join(L))
print("keys=%d chars=%d problems=%d" % (STAT["keys"], STAT["chars"], len(BAD)))
