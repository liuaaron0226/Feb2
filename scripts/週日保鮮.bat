@echo off
chcp 65001 >nul
setlocal
title Feb 週日教材保鮮

rem ============================================================
rem  T18 weekly refresh wrapper, run by the Sunday scheduled task.
rem  Steps: remind about the trip -> subs -> notes -> nblm pull.
rem  How to disable / change it: see feb2\docs (automation doc).
rem
rem  RULE: keep every rem line pure ASCII.
rem  cmd mis-tokenises CJK text on a rem line and executes the rest
rem  of that line. On 2026-09-01 a comment here documented the
rem  "schtasks /Delete" command and cmd actually ran it, so the task
rem  deleted itself on every run. All Chinese goes inside quotes on
rem  echo / call :log lines only.
rem ============================================================

set "FEB=C:\Users\User\Desktop\claude\feb2"
set "DISK=F:\istudy-backup"
set "LOG=%FEB%\reports\週日保鮮.log"
rem python output must be UTF-8 too, or it fights the UTF-8 we echo into the log
set "PYTHONIOENCODING=utf-8"
set "PY=C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe"
if not exist "%PY%" set "PY=python"
if not exist "%FEB%\reports" mkdir "%FEB%\reports"

call :log "============================================================"
call :log "週日教材保鮮開跑"
call :log "============================================================"

echo.
echo   ============================================================
echo     今天是星期日 —— 記得跑一趟偉文
echo.
echo     把新錄的課程影片與新講義帶回來，影片放進：
echo         %DISK%
echo     這一輪只處理「已經在硬碟上」的東西；今天拿回來的，
echo     下週日這支腳本會自己補上（也可以現在手動再跑一次）。
echo   ============================================================
echo.
<nul set /p "=  倒數 "
for /l %%s in (15,-1,1) do (
  <nul set /p "=%%s "
  ping -n 2 127.0.0.1 >nul
)
echo 開始。
echo.

rem the external disk is often unplugged (taken to the iPad). Skip steps
rem 1-2 when it is missing; step 3 does not need it and still runs.
if not exist "%DISK%\" (
  call :log "[略過] 找不到 %DISK% ——外接硬碟沒接？字幕與思考地圖這次跳過。"
  goto :nblm
)

call :log "[1/3] 字幕（whisper，GPU）：只做還沒有 .vtt 的影片"
pushd "%FEB%"
"%PY%" -u tools\make_subs.py >>"%LOG%" 2>&1
popd
call :log "[1/3] 字幕結束（回傳碼 %ERRORLEVEL%）"

call :log "[2/3] 思考地圖（claude -p）＋勘誤、板書快照、全文搜尋索引"
pushd "%FEB%"
rem 2026-09-05 user decision: notes only for math/linear-algebra/electronics,
rem TOEIC excluded forever. The scope list lives in a UTF-8 file, not on this
rem line: a Chinese --only argument gets rewritten by the cp950 console code
rem page (nothing matches), and chcp is not an option (see RULE above). The
rem 09/01 run had no --only, started at TOEIC 01A, died on the first claude -p.
"%PY%" -u tools\make_notes.py --only-file tools\notes-scope-five.txt >>"%LOG%" 2>&1
popd
call :log "[2/3] 思考地圖結束（回傳碼 %ERRORLEVEL%）"

:nblm
call :log "[3/3] NotebookLM 筆記迴流 → data\nblm\*.json"
pushd "%FEB%"
"%PY%" -u scripts\nblm_pull.py >>"%LOG%" 2>&1
popd
call :log "[3/3] 筆記迴流結束（回傳碼 %ERRORLEVEL%）"

call :log "週日教材保鮮收工。"
echo.
echo   完成。詳細過程：%LOG%
echo   這個視窗 30 秒後自動關閉。
ping -n 31 127.0.0.1 >nul
endlocal
exit /b 0

:log
set "TS=%DATE% %TIME: =0%"
echo [%TS%] %~1
>>"%LOG%" echo [%TS%] %~1
goto :eof
