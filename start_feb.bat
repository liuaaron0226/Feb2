@echo off
setlocal
title Feb - open the production site (8795/app/)
rem ============================================================
rem  2026-09-05: opens http://localhost:8795/app/ (the production site),
rem  no longer the 8643 dev port.
rem
rem  8643 is the ADR-0005 dev-only static port (python -m http.server):
rem  no /sync, no /nblm/refresh, no Range requests. The user kept landing
rem  on 8643 because the old bat opened it -> progress never synced, the
rem  NotebookLM snapshot stuck at 09/01, no seeking while 8795 was down.
rem
rem  8795 is started at boot by feb-media-server.vbs. This script only
rem  starts it the same way (FEB_HUB=feb2, pythonw, --lan) when it does
rem  not answer, then opens the browser.
rem  Dev use of 8643: python -m http.server 8643 (inside the feb2 folder).
rem
rem  RULE: this file is pure ASCII and never runs chcp. On a fresh cp950
rem  console, "chcp 65001" makes cmd re-read the file at a wrong offset
rem  and eat the start of a following line (reproduced 2026-09-05 in the
rem  notes-fill bat: one whole command line vanished). Chinese text is not
rem  needed here - the site itself is Chinese.
rem  Probe uses PowerShell (curl.exe may be missing from a double-click
rem  PATH); the wait loop uses goto, no delayed expansion; waits use
rem  "ping -n" instead of timeout.exe, which errors when stdin is not a
rem  console and can be shadowed by Git's GNU timeout on a foreign PATH.
rem ============================================================
set "FEB=C:\Users\User\Desktop\claude\feb2"
set "SERVE=C:\Users\User\Desktop\claude\istudy-private-backup\tools\serve_media.py"
set "PYW=C:\Users\User\AppData\Local\Programs\Python\Python311\pythonw.exe"
if not exist "%PYW%" set "PYW=pythonw.exe"
set "URL=http://localhost:8795/app/"

echo ============================================
echo  Feb production site: %URL%
echo ============================================

call :probe
if "%CODE%"=="200" goto :open

echo  8795 not answering - starting the media server the way the boot vbs does...
set "FEB_HUB=%FEB%"
start "" "%PYW%" "%SERVE%" --lan
set /a TRIES=0
:wait
ping -n 3 127.0.0.1 >nul
set /a TRIES+=1
call :probe
if "%CODE%"=="200" goto :open
if %TRIES% lss 10 goto :wait
echo  WARNING: 8795 still down after 20 s. Check Task Manager for pythonw.exe,
echo  or run it by hand:
echo     "%PYW%" "%SERVE%" --lan
pause
exit /b 1

:open
echo  8795 is up - opening the browser...
start "" "%URL%"
ping -n 4 127.0.0.1 >nul
exit /b 0

:probe
rem 200 = media server alive (only it serves state.json); 0 = no connection
for /f "usebackq delims=" %%c in (`powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://localhost:8795/state.json).StatusCode}catch{0}"`) do set "CODE=%%c"
exit /b 0
