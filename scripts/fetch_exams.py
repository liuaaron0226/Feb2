# -*- coding: utf-8 -*-
"""抓取各校電機控制組近10年(106-115)考古題 PDF，產出 data/exam-index.json。

用法: python scripts/fetch_exams.py [--dry-run]
stdlib only。來源結構是 2026-07 探測結果，各校改版時調整對應 discover_* 函式。
"""
import json
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMS_DIR = ROOT / "data" / "exams"
INDEX_PATH = ROOT / "data" / "exam-index.json"
YEARS = list(range(106, 116))
DRY = "--dry-run" in sys.argv

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) grad-exam-hub/1.0"}


def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    ctx = ssl.create_default_context()
    try:
        resp = urllib.request.urlopen(req, timeout=60, context=ctx)
    except ssl.SSLError:
        ctx = ssl._create_unverified_context()
        resp = urllib.request.urlopen(req, timeout=60, context=ctx)
    data = resp.read()
    if binary:
        return data
    charset = resp.headers.get_content_charset() or "utf-8"
    return data.decode(charset, "replace")


def anchors(html, base):
    """回傳 [(絕對URL, 連結文字)]"""
    out = []
    for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, re.S | re.I):
        href = urllib.parse.urljoin(base, m.group(1))
        text = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        out.append((href, text))
    return out


# ---------------------------------------------------------------- discoverers
# 每個 discover_* 回傳 [{school, dept, subject, year, url}]

def discover_ust():
    """台聯大(清大電機/陽交電控/中央電機共用) — 中央大學機構典藏"""
    base = "https://rapid.lib.ncu.edu.tw/cexamn/tai.html"
    html = get(base)
    keep = ("工程數學C", "控制系統", "電子學")
    items = []
    for url, text in anchors(html, base):
        if "/tai/" not in url or not url.lower().endswith(".pdf"):
            continue
        if text not in keep:
            continue
        m = re.search(r"(1[01]\d)", url.rsplit("/", 1)[-1])
        if m and int(m.group(1)) in YEARS:
            items.append(dict(school="ust", dept="台聯大電機類聯招",
                              subject=text, year=int(m.group(1)), url=url))
    return items


def discover_ntu():
    """台大電機所 — 圖書館考古題系統(Drupal)，抓甲組(自動控制)各科"""
    term = "https://exam.lib.ntu.edu.tw/graduate/term/333%201332%2087%2086%20188"
    items = []
    for page in range(0, 8):
        url = term + (f"?page={page}" if page else "")
        html = get(url)
        rows = re.findall(
            r"views-field-field-exam-year-value[^>]*>\s*(\d+)\s*</td>.*?"
            r"views-field-tid[^>]*>\s*([^<]+?)\s*</td>.*?"
            r"views-field-title[^>]*>\s*([^<]+?)\s*</td>.*?"
            r'<a href="([^"]+\.pdf)"', html, re.S)
        for year, group, title, pdf in rows:
            year = int(year)
            if year in YEARS and "甲組" in group:
                # 各年份標題寫法不一(如「控制系統(C)(含電路系統分析)」)，去括號統一
                subject = re.sub(r"[（(].*?[）)]", "", title).strip()
                items.append(dict(school="ntu", dept="台大電機所 " + group,
                                  subject=subject, year=year, url=pdf))
        if "下一頁" not in html:
            break
        time.sleep(0.3)
    return items


def discover_nthu_pme():
    """清大動機系乙組(電機控制) — 清大圖書館，只列近5年"""
    base = "https://www.lib.nthu.edu.tw/library/department/lrs/exam/e/pme.html"
    html = get(base)
    items = []
    for url, text in anchors(html, base):
        if "pme/" in url and url.endswith(".pdf") and text == "控制系統":
            m = re.search(r"pme/(\d{3})/", url)
            if m and int(m.group(1)) in YEARS:
                items.append(dict(school="nthu-pme", dept="清大動機系乙組(電機控制)",
                                  subject="控制系統", year=int(m.group(1)), url=url))
    return items


def discover_nsysu():
    """中山電機系 — 每年一份全系合集 PDF(內含乙組工數乙+控制系統)"""
    return [dict(school="nsysu", dept="中山電機系碩士班",
                 subject="全系試題合集(含乙組工數乙+控制系統)", year=y,
                 url=f"https://www3.nsysu.edu.tw/exam/master/eng/elec/elec_{y}.pdf")
            for y in YEARS]


def _ntust(page_url, dept, keep_pat):
    html = get(page_url)
    items = []
    for url, text in anchors(html, page_url):
        if "libraryfile.lib.ntust.edu.tw" not in url or not re.search(keep_pat, text):
            continue
        m = re.search(r"/Master/(\d+)/", url)
        if m and int(m.group(1)) in YEARS:
            items.append(dict(school="ntust", dept=dept, subject=text,
                              year=int(m.group(1)), url=url))
    return items


def discover_ntust():
    ee = _ntust("https://library.ntust.edu.tw/p/404-1049-102329.php?Lang=zh-tw",
                "台科大電機系(控制組)", r"控制")
    gsac = _ntust("https://library.ntust.edu.tw/p/404-1049-102162.php?Lang=zh-tw",
                  "台科大自動化及控制研究所", r"工程數學|自動控制")
    return ee + gsac


def discover_ntut():
    """北科大電機系丙組(控制工程) — 圖資處考古題頁"""
    base = "https://library.ntut.edu.tw/p/405-1024-108736,c15236.php"
    html = get(base)
    items = []
    for url, text in anchors(html, base):
        if not url.lower().endswith(".pdf"):
            continue
        if "丙組" not in text or not re.search(r"工程數學|控制系統", text):
            continue
        m = re.search(r"/(\d{3})a?EE\d+\.pdf", url, re.I)
        if m and int(m.group(1)) in YEARS:
            items.append(dict(school="ntut", dept="北科大電機系丙組(控制工程)",
                              subject=re.sub(r"\(.*?\)", "", text), year=int(m.group(1)),
                              url=url))
    return items


def _ncku(dept_code, dept, keep):
    """成大圖書館考古題 exam.lib.ncku.edu.tw — 年份區塊內逐科列 PDF"""
    url = f"https://exam.lib.ncku.edu.tw/master_subject.php?department_code={dept_code}"
    html = get(url)
    items, year = [], None
    for m in re.finditer(
            r"<div class='cell'>(\d{3})學年度</div>"
            r"|<div class='cell'>([^<]+)</div><div class='cell'><a href='([^']+\.pdf)'", html):
        if m.group(1):
            year = int(m.group(1))
        elif year in YEARS and m.group(2).strip() in keep:
            items.append(dict(school="ncku", dept=dept,
                              subject=m.group(2).strip(), year=year, url=m.group(3)))
    return items


def discover_ncku():
    ee = _ncku("EC15", "成大電機系乙組(系統控制)", {"工程數學", "控制系統"})
    es = _ncku("EC03", "成大工程科學系甲組(控制與通訊)",
               {"工程數學", "線性代數", "控制系統", "訊號與系統", "電子電路"})
    # 兩系同名科目分開存
    for it in es:
        it["subject"] = "工科-" + it["subject"]
    return ee + es


DISCOVERERS = [discover_ust, discover_ntu, discover_nthu_pme,
               discover_nsysu, discover_ntust, discover_ntut, discover_ncku]

# 已知缺漏的說明(探測時確認來源就是沒有)
KNOWN_GAPS = [
    dict(school="ntu", dept="台大電機所 甲組", subject="工程數學",
         years=[111], reason="台大圖書館考古題系統未收錄111學年度電機所試題"),
    dict(school="ntu", dept="台大電機所 甲組", subject="控制系統",
         years=[111], reason="台大圖書館考古題系統未收錄111學年度電機所試題"),
    dict(school="ntu", dept="台大電機所 甲組", subject="英文",
         years=[111], reason="台大圖書館考古題系統未收錄111學年度電機所試題"),
    dict(school="ntust", dept="台科大電機系(控制組)", subject="控制系統與數位邏輯",
         years=range(111, 116),
         reason="111年起圖書館未公布控制組筆試卷(該組考科調整/以推甄為主)，請洽台科大確認"),
    dict(school="ntust", dept="台科大自動化及控制研究所", subject="自動控制系統",
         years=range(113, 116),
         reason="113年起僅公布工程數學，自動控制卷未上網，請洽台科大圖書館"),
    dict(school="nthu-pme", dept="清大動機系乙組(電機控制)", subject="控制系統",
         years=range(106, 111), reason="清大圖書館僅公開近5年(111-115)試題"),
    dict(school="ncku", dept="成大工程科學系甲組(控制與通訊)", subject="工科-線性代數",
         years=range(106, 113), reason="113學年度起才增列線性代數為選考科目"),
    dict(school="ncku", dept="成大工程科學系甲組(控制與通訊)", subject="工科-訊號與系統",
         years=[106], reason="106學年度工科系無此考科"),
]


def sanitize(name):
    return re.sub(r'[\\/:*?"<>|]', "_", name)


def main():
    found = []
    for d in DISCOVERERS:
        try:
            items = d()
            print(f"[discover] {d.__name__}: {len(items)} 份")
            found.extend(items)
        except Exception as e:
            print(f"[discover] {d.__name__} 失敗: {e}")
    # 去重(同 school+subject+year 取第一個)
    seen, uniq = set(), []
    for it in found:
        key = (it["school"], it["subject"], it["year"])
        if key not in seen:
            seen.add(key)
            uniq.append(it)

    index = []
    for it in uniq:
        rel = Path(it["school"]) / sanitize(it["subject"]) / f"{it['year']}.pdf"
        dest = EXAMS_DIR / rel
        entry = dict(it, status="downloaded", path=str(rel).replace("\\", "/"))
        if dest.exists() and dest.stat().st_size > 1000:
            entry["status"] = "downloaded"
        elif DRY:
            entry["status"] = "pending"
        else:
            try:
                data = get(it["url"], binary=True)
                if not data.startswith(b"%PDF"):
                    raise ValueError("回應不是 PDF")
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                print(f"[dl] {rel} ({len(data)//1024} KB)")
                time.sleep(0.4)
            except Exception as e:
                entry = dict(it, status="failed", reason=str(e))
                print(f"[dl] 失敗 {it['url']}: {e}")
        index.append(entry)

    for gap in KNOWN_GAPS:
        for y in gap["years"]:
            index.append(dict(school=gap["school"], dept=gap["dept"],
                              subject=gap["subject"], year=y,
                              status="missing", reason=gap["reason"]))

    index.sort(key=lambda e: (e["school"], e["subject"], e["year"]))
    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=1),
                          encoding="utf-8")
    ok = sum(1 for e in index if e["status"] == "downloaded")
    print(f"\n完成: {ok} 份已下載, "
          f"{sum(1 for e in index if e['status']=='failed')} 失敗, "
          f"{sum(1 for e in index if e['status']=='missing')} 已知缺漏")
    print(f"索引: {INDEX_PATH}")


if __name__ == "__main__":
    main()
