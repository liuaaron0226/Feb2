@echo off
chcp 65001 >nul
cd /d "%~dp0.."
title NotebookLM redo
python -u scripts\run_notebooklm_analysis.py --redo
echo.
echo ============================================================
echo  [ END ]  Press any key to close this window.
echo ============================================================
pause >nul
