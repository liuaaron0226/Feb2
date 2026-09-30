# T03b iPad 早期煙霧測試

blocked-by: T03（排在 T04–T08 之前，把裝置風險前移）

## 目標
iPad/Safari/https/ES-module 這個維度不能拖到 T10 才第一次接觸 feb2。
T03 一落地就上真機驗一輪。

## 做法要求
- **不動服役中的 8795/8796**：另起第二個 serve_media 實例（8797/8798），
  HUB 指向 feb2、獨立 progress-dev.json（改法見 istudy-private-backup/tools/serve_media.py，
  以參數/環境變數帶入，改動須對原版向後相容）
- iPad 連 8798（https，自簽憑證已信任，涵蓋 172.20.10.1–14）

## 驗收（使用者真機執行，給一頁清單）
ES modules 載入無白屏；PWA 可安裝（manifest use-credentials＋通行碼 cookie 正常）；
離線備妥燈進入 work→ready；rlog 能收到 iPad 的麵包屑；
觸控無 backdrop-filter（目測流暢度）。任何一項掛掉→修完才准開 T04。

---
## 收案（2026-08-31）
使用者真機五項全過：載入無白屏／PWA 加入主畫面／離線燈轉就緒／天氣切換順暢／重開仍正常。
過程修正：start_feb_dev.bat 的 python 改絕對路徑（Explorer 雙擊環境 PATH 無 python 致閃退）；
05-media.js 同源判斷補 8797/8798（前置已 commit）。第二實例由對話 session 背景代跑過一次，
日常使用雙擊 bat 即可。
