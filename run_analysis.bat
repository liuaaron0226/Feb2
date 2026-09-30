@echo off
chcp 65001 >nul
title Feb - NotebookLM 考題分析（本機直連 Google，不耗 AI token）
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
echo ============================================
echo  Feb 考題分析管線
echo  可隨時 Ctrl+C 中斷，重跑會自動接續進度
echo ============================================
python scripts\run_notebooklm_analysis.py %*
echo.
echo 完成。重新整理網頁的「考題分析」區即可看到結果。
pause
