# -*- coding: utf-8 -*-
"""NotebookLM 考題分析管線：每「學校×科目」一個 notebook，上傳十年考卷 PDF，
要求輸出嚴格 JSON，落地 data/analysis/ 供前端讀取。

前置：python -m notebooklm login（一次性 Google 登入）
用法：python scripts/run_notebooklm_analysis.py [--only KEY] [--dry-run]
可中斷重跑：進度存 data/analysis/_state.json，已完成的 group 會跳過。
"""
import json
import re
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMS = ROOT / "data" / "exams"
OUT = ROOT / "data" / "analysis"
STATE_PATH = OUT / "_state.json"
DRY = "--dry-run" in sys.argv
REDO = "--redo" in sys.argv  # 章節 taxonomy 改過後，用既有 notebook 以新章節重問一輪
ONLY = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None

# 章節分類依參考動畫/各科課本目錄逐章展開（越細越好，無法歸類者歸「其他」）
MATH7 = ("微積分與積分技巧、一階ODE、高階線性ODE、Laplace轉換、冪級數解(Frobenius)、"
    "Bessel方程式與函數、Legendre方程式與函數、Sturm-Liouville與邊界值問題、Fourier級數、"
    "Fourier積分與轉換、偏微分方程(波動/熱傳/Laplace)、矩陣與行列式、特徵值與對角化、"
    "向量空間與線性變換、向量分析(梯度散度旋度/Green/Stokes)、複變分析(解析函數/留數)、機率與統計")
CTRL = ("拉氏轉換與數學基礎、系統建模與轉移函數、方塊圖與訊號流程圖、穩定度(Routh-Hurwitz)、"
    "時域響應與暫態規格、穩態誤差與誤差常數、根軌跡、頻率響應(Bode/極座標圖)、頻域穩定(Nyquist)、"
    "控制器設計(PID/相位超前落後補償)、狀態空間動態方程、狀態轉移矩陣、可控制性與可觀察性、"
    "狀態回授與觀察器設計、物理系統建模、數位控制(Z轉換)、非線性系統分析")
ELEC = ("二極體與應用電路、半導體物理與PN接面、BJT特性與工作區、BJT直流偏壓、FET/MOSFET特性、"
    "FET直流偏壓、BJT小訊號放大器(各組態)、FET小訊號放大器、多級與組合放大器、電流源與IC偏壓、"
    "差動放大器、頻率響應(高頻/低頻)、運算放大器(OP)電路、回授放大器、回授穩定性(Nyquist/頻率補償)、"
    "輸出級電路(A/B/AB類)、CMOS反向器與邏輯閘、濾波器電路、振盪器與多諧振盪器")
SIGS = "LTI系統與摺積、傅立葉級數與轉換、拉氏轉換、Z轉換與離散系統、取樣定理、濾波器"
LA = ("矩陣運算與特殊矩陣、行列式及其應用、矩陣的秩與線性方程組、特徵值與特徵向量、對角化與相似轉換、"
    "Jordan標準型、Cayley-Hamilton與最小多項式、二次型與正定性、向量空間與子空間、基底與維數、"
    "線性變換與矩陣表示、內積空間與正交化(Gram-Schmidt)、正交投影與最小平方、正規/么正/自伴運算子、"
    "SVD與廣義反矩陣")

# (key, notebook標題, 來源資料夾, 顯示學校, 顯示科目, 章節taxonomy, 額外指示)
GROUPS = [
 ("ust-control",  "考題-台聯大-控制系統", "ust/控制系統", "台聯大", "控制系統", CTRL, ""),
 ("ntu-control",  "考題-台大-控制系統", "ntu/控制系統", "台大", "控制系統(含電路系統分析)", CTRL + "、電路系統分析", ""),
 ("nthupme-control", "考題-清大動機-控制系統", "nthu-pme/控制系統", "清大動機", "控制系統", CTRL, "此科可使用計算器，注意計算量大的題型。"),
 ("nsysu-control", "考題-中山-乙組", "nsysu/全系試題合集(含乙組工數乙+控制系統)", "中山", "控制系統", CTRL,
  "來源是中山電機全系合集，只分析『控制系統』該科的頁面，其他科目一律忽略。"),
 ("nsysu-math",   None, None, "中山", "工程數學乙", "線性代數、常微分方程",
  "來源是中山電機全系合集，只分析『工程數學（乙）』該科的頁面（範圍為常微分方程與線性代數），其他科目一律忽略。"),
 ("ntut-control", "考題-北科大-控制系統", "ntut/控制系統", "北科大", "控制系統", CTRL, ""),
 ("ncku-control", "考題-成大電機-控制系統", "ncku/控制系統", "成大電機", "控制系統(含控制工程、線性系統)", CTRL, ""),
 ("nckues-control","考題-成大工科-控制系統", "ncku/工科-控制系統", "成大工科", "控制系統", CTRL, ""),
 ("ust-math",     "考題-台聯大-工數C", "ust/工程數學C", "台聯大", "工程數學C", MATH7, ""),
 ("ntu-math",     "考題-台大-工數C", "ntu/工程數學", "台大", "工程數學C", MATH7, ""),
 ("ntust-math",   "考題-台科自控-工程數學", "ntust/工程數學", "台科大(自控所)", "工程數學", MATH7, ""),
 ("ntut-math",    "考題-北科大-工程數學", "ntut/工程數學", "北科大", "工程數學", MATH7, ""),
 ("ncku-math",    "考題-成大電機-工程數學", "ncku/工程數學", "成大電機", "工程數學", MATH7, ""),
 ("nckues-math",  "考題-成大工科-工程數學", "ncku/工科-工程數學", "成大工科", "工程數學", MATH7, ""),
 ("ust-elec",     "考題-台聯大-電子學", "ust/電子學", "台聯大", "電子學", ELEC, ""),
 # ntust-ctrl（台科自控-自動控制）113 起未再公布，已停止分析（2026-07-19 使用者指示）
 ("nckues-circ",  "考題-成大工科-電子電路", "ncku/工科-電子電路", "成大工科", "電子電路", ELEC + "、電路學基礎", ""),
 ("nckues-sig",   "考題-成大工科-訊號與系統", "ncku/工科-訊號與系統", "成大工科", "訊號與系統", SIGS, ""),
 ("nckues-la",    "考題-成大工科-線性代數", "ncku/工科-線性代數", "成大工科", "線性代數", LA, "僅113-115三年（113起新增考科）。"),
 ("ncu-math",     "考題-中央丙組-工程數學", "ncu/工程數學（不含複變）", "中央", "工程數學（不含複變）", MATH7, "此卷範圍不含複變函數，複變章節可略。"),
 ("ncu-elec",     "考題-中央丙組-電子學", "ncu/電子學", "中央", "電子學", ELEC, ""),
 ("ncu-sig",      "考題-中央丙組-信號與系統", "ncu/信號與系統", "中央", "信號與系統", SIGS, ""),
]

def nlm(*args, timeout=900):
    r = subprocess.run([sys.executable, "-m", "notebooklm", *args],
                       capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=timeout)
    return r.returncode, r.stdout, r.stderr

def nlm_json(*args, timeout=900):
    code, out, err = nlm(*args, timeout=timeout)
    if code != 0:
        raise RuntimeError(f"notebooklm {' '.join(args[:2])} 失敗: {err.strip()[:300]}")
    return json.loads(out)

def prompt_for(school, subject, taxonomy, extra):
    return f"""你是研究所入學考題分析專家。這個筆記本的每一個來源是一份「{school} {subject}」歷年入學考試題 PDF，來源標題中的三位數字即民國學年度（例如 115 代表 115 學年度）。
{extra}
請完成：
1) 逐份考卷，把每一大題（含子題視為同一大題）歸類到下列章節之一：{taxonomy}。無法歸類者歸入「其他」。
2) 統計「章節 × 學年度」的大題出現次數。
3) **記下每個章節在每個學年度實際對應的大題題號**，例如該年第 2、5 大題屬於某章節就記 [2,5]。
   題號用考卷上的大題編號（一、二、三 或 1. 2. 3. 都換算成阿拉伯數字）。無法確認題號時給空陣列。
4) 歸納 3 至 6 條必考重點，每條格式為「主題：一句話說明常見考法」。
5) 用兩三句話描述近年命題趨勢（題型變化、難度、偏好章節）。
只輸出下列格式的 JSON，不要 markdown 圍欄、不要任何其他文字。
qs 的鍵是學年度、值是該年屬於這個章節的大題題號陣列：
{{"years":[106,107],"chapters":[{{"name":"章節名","years":{{"106":2,"107":1}},"qs":{{"106":[2,5],"107":[3]}}}}],"mustKnow":["主題：說明"],"trend":"…"}}"""

def _expand_range(m):
    a, b = int(m.group(1)), int(m.group(2))
    if b < a or b - a > 30:
        return m.group(0)
    return ",".join(str(i) for i in range(a, b + 1))

def extract_json(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("回答中找不到 JSON")
    s = m.group(0)
    # NotebookLM 會在回答內自動插入 [1][2] 引用標記，污染 JSON。學年度是三位數不會誤傷，
    # 但 qs 的題號是一到二位數，"106":[3] 這種單題陣列會被整個吃掉（舊版分析的題號就是
    # 這樣默默清空的）→ 只剝「前面不是冒號」的，值位置的陣列一律保留
    s = re.sub(r"(:\s*)?\[\d{1,2}(?:-\d{1,2})?\]",
               lambda mm: mm.group(0) if mm.group(1) else "", s)
    # 題號範圍會寫成裸 token「[10, 13-16]」不合法 → 展開成 13,14,15,16
    s = re.sub(r"(?<=[\[,\s])(\d{1,2})\s*-\s*(\d{1,2})(?=[,\]\s])", _expand_range, s)
    # 常漏值就直接接逗號或收括號（"years":, / "113":, / "115":}）→ 補成空陣列。
    # 只認「引號後的冒號緊接 , } ]」，故不會誤傷正常值
    s = re.sub(r'("\s*:)\s*(?=[,}\]])', r"\1[]", s)
    # 回答偶爾講到一半截斷再整份重講，前截是破的、後截才完整，而貪婪比對會把兩者一起吞。
    # 逐個 {"years" 起點試，取第一個解得開且有 chapters 的
    # strict=False：容忍字串值裡的原始換行（NotebookLM 常直接換行不跳脫）
    starts = sorted({0} | {mm.start() for mm in re.finditer(r'\{\s*"years"', s)})
    err = None
    for i in starts:
        try:
            d = json.loads(s[i:], strict=False)
        except Exception as e:
            err = e
            continue
        if d.get("chapters"):
            if not d.get("years"):
                yrs = {int(y) for ch in d["chapters"] for y in ch.get("years", {})}
                d["years"] = sorted(yrs)
            return d
    raise err or ValueError("回答中找不到可用的 JSON")

def rebuild_index():
    docs = []
    for f in sorted(OUT.glob("*.json")):
        if f.name.startswith("_") or f.name == "index.json":
            continue
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            docs.append({"file": f.name, "school": d.get("school"), "subject": d.get("subject")})
        except Exception:
            pass
    (OUT / "index.json").write_text(json.dumps(docs, ensure_ascii=False, indent=1), encoding="utf-8")

def main():
    OUT.mkdir(exist_ok=True)
    state = json.loads(STATE_PATH.read_text(encoding="utf-8")) if STATE_PATH.exists() else {}

    if REDO:
        # 清 done 旗標並從既有分析 JSON 回填 notebook id，讓重跑沿用舊筆記本（不重建、不重傳），只用新章節重問
        n = 0
        for key, title, folder, *_ in GROUPS:
            st = state.setdefault(key, {})
            jf = OUT / f"{key}.json"
            if jf.exists():
                try:
                    nb = json.loads(jf.read_text(encoding="utf-8")).get("notebook")
                    if nb:
                        st["notebook"] = nb
                        if title is not None:  # 中山 math 共用 control 的 notebook，sources 不獨立
                            st["sources_ready"] = True
                except Exception:
                    pass
            st["done"] = False
            n += 1
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"[redo] 已清 {n} 組 done 旗標並回填 notebook id；本輪將用新章節重問既有筆記本")

    if DRY:
        for key, title, folder, school, subject, *_ in GROUPS:
            pdfs = sorted((EXAMS / folder).glob("*.pdf")) if folder else []
            print(f"[dry] {key}: {school} {subject} → {title or '(共用 nsysu notebook)'} pdfs={len(pdfs)}")
        return

    code, out, _ = nlm("auth", "check", "--test", "--json", timeout=120)
    ok = False
    try:
        d = json.loads(out); ok = d.get("status") == "ok" and d["checks"].get("token_fetch")
    except Exception:
        pass
    if not ok:
        print("尚未登入 NotebookLM。請先執行：python -m notebooklm login")
        sys.exit(1)

    for key, title, folder, school, subject, taxonomy, extra in GROUPS:
        if ONLY and key != ONLY:
            continue
        st = state.setdefault(key, {})
        if st.get("done"):
            print(f"[skip] {key} 已完成"); continue
        print(f"\n===== {key}: {school} {subject} =====")

        # 中山兩個分析共用同一個 notebook
        if title is None:
            nb = state.get("nsysu-control", {}).get("notebook")
            if not nb:
                print("[err] 需先完成 nsysu-control 才能跑 nsysu-math"); continue
            st["notebook"] = nb; st["sources_ready"] = True
        if DRY:
            pdfs = sorted((EXAMS / folder).glob("*.pdf")) if folder else []
            print(f"[dry] notebook={title} pdfs={len(pdfs)}"); continue

        if not st.get("notebook"):
            nb = nlm_json("create", title, "--json")["notebook"]["id"]
            st["notebook"] = nb
            STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"[create] {nb}")
        nb = st["notebook"]

        if not st.get("sources_ready"):
            pdfs = sorted((EXAMS / folder).glob("*.pdf"))
            added = st.setdefault("added", [])
            for p in pdfs:
                if p.name in added:
                    continue
                try:
                    nlm_json("source", "add", str(p), "--notebook", nb, "--json", timeout=600)
                    added.append(p.name)
                    print(f"[src] {p.parent.name}/{p.name}")
                except Exception as e:
                    print(f"[src] 失敗 {p.name}: {e}")
                STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
                time.sleep(2)
            # 等全部 ready
            for _ in range(60):
                srcs = nlm_json("source", "list", "--notebook", nb, "--json")["sources"]
                bad = [s for s in srcs if s["status"] != "ready"]
                if not bad:
                    break
                print(f"[wait] {len(bad)} 份處理中…"); time.sleep(30)
            st["sources_ready"] = True
            STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")

        pf = OUT / f"_prompt_{key}.txt"
        pf.write_text(prompt_for(school, subject, taxonomy, extra), encoding="utf-8")
        ans = None
        for attempt in (1, 2):
            try:
                code, out, err = nlm("ask", "--prompt-file", str(pf), "--notebook", nb, "--json", timeout=900)
                if code != 0:
                    raise RuntimeError(err.strip()[:300])
                answer = json.loads(out).get("answer") or ""
                ans = extract_json(answer)
                break
            except Exception as e:
                print(f"[ask] 第{attempt}次失敗: {e}")
                (OUT / f"_raw_{key}_{attempt}.txt").write_text(out or "", encoding="utf-8")
                time.sleep(120)
        if ans is None:
            print(f"[err] {key} 分析失敗，之後可用 --only {key} 重跑"); continue

        ans.update(school=school, subject=subject, updated=str(date.today()),
                   notebook=nb, engine="NotebookLM")
        (OUT / f"{key}.json").write_text(json.dumps(ans, ensure_ascii=False, indent=1), encoding="utf-8")
        st["done"] = True
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
        rebuild_index()
        print(f"[done] {key} → data/analysis/{key}.json")

    rebuild_index()
    print("\n全部處理完畢。")

if __name__ == "__main__":
    main()
