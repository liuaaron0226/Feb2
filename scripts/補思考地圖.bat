@echo off
setlocal
rem ============================================================
rem  Notes fill: generate the missing thinking maps for the five
rem  scoped courses (math / linear algebra / electronics), stop by
rem  itself on quota, then push to Drive and deploy the cloud site.
rem
rem  Background: 09/04 produced 16 of 46 before the 5-hour quota hit,
rem  30 left. 09/05 user decision: run it tonight -> one-shot
rem  one-shot Task Scheduler job (Chinese name: Feb, notes-fill, once)
rem  at 22:00 runs this file.
rem  TOEIC is excluded on purpose (never in the user scope). Only
rem  videos without a .notes.json are made, so re-running is safe; a
rem  quota hit stops the batch at once (make_notes.py detects it).
rem
rem  RULE: this file is pure ASCII (log name included) and never runs
rem  chcp. On a fresh cp950 console "chcp 65001" makes cmd re-read the
rem  file at a wrong offset and eat the start of a following line -
rem  reproduced 2026-09-05: the first make_notes command line vanished.
rem  Without chcp, any Chinese byte in this file is read as cp950
rem  garbage (a Chinese log name would create a mojibake file). All
rem  Chinese (course scopes) lives in UTF-8 files read by Python:
rem  feb2\tools\notes-scope-*.txt (moved here from istudy-private-backup
rem  on 2026-10-01; feb2\tools is now the live copy of the notes tools)
rem
rem  Run by hand: double-click. Log: feb2\reports\notes-fill.log
rem ============================================================
set "FEB=C:\Users\User\Desktop\claude\feb2"
set "LOG=%FEB%\reports\notes-fill.log"
set "PYTHONIOENCODING=utf-8"
set "PY=C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe"
if not exist "%PY%" set "PY=python"

echo ===== %DATE% %TIME% START notes-fill (only missing; stops on quota) ===== >>"%LOG%"

cd /d "%FEB%"
rem order: electronics 16/19 first (the lectures the user watches next), then the five scopes
"%PY%" -u tools\make_notes.py --only-file tools\notes-scope-elec-16-19.txt >>"%LOG%" 2>&1
"%PY%" -u tools\make_notes.py --only-file tools\notes-scope-five.txt >>"%LOG%" 2>&1
echo ----- %TIME% notes exit=%ERRORLEVEL% ----- >>"%LOG%"

rem push new .notes.json / snapshots to Drive (ledger key <code>.notes.json), then deploy static sidecars
"%PY%" -u scripts\drive-upload-queue.py >>"%LOG%" 2>&1
echo ----- %TIME% upload exit=%ERRORLEVEL% ----- >>"%LOG%"
call npm run deploy >>"%LOG%" 2>&1
echo ----- %TIME% deploy exit=%ERRORLEVEL% ----- >>"%LOG%"

echo ===== %DATE% %TIME% ALL DONE ===== >>"%LOG%"
