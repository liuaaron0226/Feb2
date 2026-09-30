@echo off
chcp 65001 >nul
title Feb2 開發媒體伺服器（8797/8798）
cd /d "%~dp0"
set "FEB_HUB=%~dp0"
set "FEB_HTTP_PORT=8797"
set "FEB_HTTPS_PORT=8798"
set "FEB_PROGRESS=C:\Users\User\Desktop\claude\istudy-private-backup\data\progress-dev.json"
echo ============================================================
echo  Feb2 開發媒體伺服器（第二實例，關掉這個視窗就停）
echo    電腦本機：  http://localhost:8797/app/
echo    iPad 熱點： https://172.20.10.^<電腦IP^>:8798/app/
echo    （實際 IP 與帶通行碼的完整網址，看下面伺服器自己印的 https:// 那行）
echo  ※ 服役中的 8795/8796 完全不受影響；測試進度寫進 progress-dev.json，
echo     不會碰真實備考紀錄
echo ============================================================
"C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe" "C:\Users\User\Desktop\claude\istudy-private-backup\tools\serve_media.py" --lan
pause
