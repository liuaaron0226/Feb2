# -*- coding: utf-8 -*-
"""NotebookLM 筆記迴流管線：把五科筆記本（data/notebooks.json）裡的每一則筆記
抓回本地 data/nblm/<subj>.json，供站03「筆記迴流」離線閱讀（T17）。

前置：python -m notebooklm login（一次性 Google 登入）
用法：python scripts/nblm_pull.py [--only SUBJ]
單科失敗只記錄並繼續，結尾印總表；重跑整份覆寫（筆記量小，不做增量）。
"""
import json
import re
import sys
from datetime import date
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
NB_JSON = ROOT / "data" / "notebooks.json"
OUT = ROOT / "data" / "nblm"
ONLY = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None


def nlm(*args, timeout=300):
    r = subprocess.run([sys.executable, "-m", "notebooklm", *args],
                       capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=timeout)
    return r.returncode, r.stdout, r.stderr


def nlm_json(*args, timeout=300):
    code, out, err = nlm(*args, timeout=timeout)
    if code != 0:
        raise RuntimeError(f"notebooklm {' '.join(args[:2])} 失敗: {err.strip()[:300]}")
    # note get 會先印一行「Matched: …」再印 JSON——一律從第一個 { 起算
    i = out.find("{")
    if i < 0:
        raise RuntimeError(f"notebooklm {' '.join(args[:2])} 沒回 JSON: {out.strip()[:200]}")
    return json.loads(out[i:])


def main():
    OUT.mkdir(exist_ok=True)
    subjects = json.loads(NB_JSON.read_text(encoding="utf-8"))["subjects"]

    code, out, _ = nlm("auth", "check", "--test", "--json", timeout=120)
    ok = False
    try:
        d = json.loads(out); ok = d.get("status") == "ok" and d["checks"].get("token_fetch")
    except Exception:
        pass
    if not ok:
        print("尚未登入 NotebookLM。請先執行：python -m notebooklm login")
        sys.exit(1)

    rows = []   # (subj, name, 筆記數, bytes, 狀態)
    for subj, info in subjects.items():
        if ONLY and subj != ONLY:
            continue
        url = (info or {}).get("url") or ""
        m = re.search(r"/notebook/([0-9a-fA-F-]{36})", url)
        if not m:
            print(f"[skip] {subj}: notebooks.json 沒有 url（尚未建本）")
            rows.append((subj, info.get("name", ""), "-", "-", "無筆記本"))
            continue
        nb = m.group(1)
        print(f"\n===== {subj}: {info.get('name','')} ({nb}) =====")
        try:
            listing = nlm_json("note", "list", "--notebook", nb, "--json")
            notes = []
            for meta in listing.get("notes", []):
                got = nlm_json("note", "get", meta["id"], "--notebook", nb, "--json")
                notes.append({"id": got.get("id") or meta["id"],
                              "title": got.get("title") or meta.get("title") or "",
                              "content": got.get("content") or ""})
                print(f"[note] {notes[-1]['title']}（{len(notes[-1]['content'])} 字）")
            payload = {"pulled": str(date.today()), "notes": notes}
            f = OUT / f"{subj}.json"
            f.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
            size = f.stat().st_size
            print(f"[done] {subj} → data/nblm/{subj}.json（{len(notes)} 則、{size} bytes）")
            rows.append((subj, info.get("name", ""), len(notes), size, "OK"))
        except Exception as e:
            # 單科失敗不擋別科；舊檔（若有）保留不動，之後 --only 重跑
            print(f"[err] {subj} 拉取失敗：{e}")
            rows.append((subj, info.get("name", ""), "-", "-", f"失敗：{str(e)[:60]}"))

    print("\n" + "=" * 56)
    print(f"{'subj':8}{'科目':6}{'筆記':>4}{'bytes':>10}  狀態")
    for subj, name, n, size, st in rows:
        print(f"{subj:8}{name:6}{n!s:>4}{size!s:>10}  {st}")


if __name__ == "__main__":
    main()
