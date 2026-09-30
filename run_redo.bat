@echo off
chcp 65001 >nul
title Feb - 重新分析（套用新細章節，沿用既有筆記本）
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
echo ============================================
echo  Feb 考題分析：重問一輪（新章節 taxonomy）
echo  沿用既有 NotebookLM 筆記本，不重建、不重傳
echo  可隨時 Ctrl+C 中斷，進度會存檔續跑
echo ============================================
python scripts\run_notebooklm_analysis.py --redo %*
echo.
echo 完成。重新整理網頁的「總覽 - 點學校 - 完整分析」即可看到新章節。
pause
