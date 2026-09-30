# -*- coding: utf-8 -*-
"""整批上雲的排程器：把 drive-upload.py 依「衝刺順序」一個課程一個課程叫起來。

為什麼要有這一層，而不是直接 `drive-upload.py --yes` 一次全傳：

1. **順序是有意義的**。66 GiB 在手機熱點上要跑二十幾個鐘頭，中途一定會有
   斷線、重開機、硬碟被拔的可能。排序讓「萬一只傳得完一半」時，傳完的是
   這兩週真的會打開的那一半——所以 `115暑`（本季正在上的）在前，
   `115春`（前一季）在中，`114暑`（去年那套）墊底。

2. **已看完的不傳**。上行頻寬是最稀缺的資源，看過的集數占著只是浪費。
   跳過名單由 progress.json 的 watched 反推，但**不是機械照抄**：
   `115暑微方15` 被標成已看、02–14 卻全沒有，這種孤島式的勾八成是拖進度條
   觸發 90% 自動標記留下的假陽性，寧可多傳 0.8 GiB 也不要考前才發現少一集。

3. **一個課程一個 process**。drive-upload.py 每傳成功一支就把帳本落地，
   粒度已經夠細；拆成多個 process 額外換到的是「某個課程整包爛掉時，後面的
   課程照跑」——熱點環境下這比省下幾秒啟動時間值錢得多。

4. **跳過名單走檔案、不走命令列**。中文代號當參數傳會被 Windows 的 ANSI
   字碼頁改寫（實測 `115暑電子01` → `115´»¹q¤l01`），於是一支都沒跳過、
   已看完的照傳。2026-09-02 踩過一次，改用 UTF-8 檔案餵。
"""
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LF = chr(10)  # 刻意不寫成跳脫字元：這支檔案曾被 shell heredoc 吃掉反斜線

# (課程資料夾, 要跳過的集數代號)　── 順序即優先序
QUEUE = [
    ("115暑電子", ["115暑電子%02d" % i for i in range(1, 8)]),   # 看到第 7 部
    ("115暑微方", []),                                          # 15 的孤島勾當假陽性，照傳
    ("115暑線代", ["115暑線代01"]),
    ("115春微方", ["115春微方01"]),
    ("115春矩陣", ["115春矩陣01", "115春矩陣02"]),
    ("114暑電子", []),                                          # 去年那套，墊底
]


def main():
    t0 = time.time()
    print("===== 佇列開跑 %s =====" % datetime.now().strftime("%Y-%m-%d %H:%M:%S"), flush=True)
    print("共 %d 個課程資料夾，依衝刺順序執行%s" % (len(QUEUE), LF), flush=True)
    results = []
    for n, (series, skip) in enumerate(QUEUE, 1):
        print("%s# [%d/%d] %s%s　（累計 %s）%s" % (
            LF + "#" * 66 + LF, n, len(QUEUE), series,
            ("　跳過 %d 支已看" % len(skip)) if skip else "",
            timedelta(seconds=int(time.time() - t0)), LF + "#" * 66), flush=True)
        cmd = [sys.executable, str(ROOT / "scripts" / "drive-upload.py"),
               "--only", series, "--yes"]
        if skip:
            f = ROOT / "reports" / ("skip-%s.txt" % series)
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(LF.join(sorted(skip)) + LF, encoding="utf-8")
            cmd += ["--skip-file", str(f)]
        rc = subprocess.run(cmd, cwd=str(ROOT)).returncode
        results.append((series, rc))
        if rc != 0:
            # 不中止整條佇列：某一科掛掉不該連累後面的科目。
            print("%s⚠ %s 以 exit %d 收場，繼續下一個課程。" % (LF, series, rc), flush=True)

    print("%s%s佇列結束　總耗時 %s" % (LF * 2, "=" * 66 + LF,
                                      timedelta(seconds=int(time.time() - t0))), flush=True)
    for series, rc in results:
        print("  %s %s　exit %d" % ("✓" if rc == 0 else "✗", series, rc), flush=True)
    return 0 if all(rc == 0 for _, rc in results) else 1


if __name__ == "__main__":
    sys.exit(main())
