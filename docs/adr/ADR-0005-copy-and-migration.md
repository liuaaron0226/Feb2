# ADR-0005 副本策略與遷移路徑

日期：2026-08-31　狀態：已決

## 決策
feb2 為獨立 repo（不背 Desktop\claude 的多 session 協調成本），
開發用 port **8643**（`start_feb.bat` 改之），與原版 8642 的 localStorage 天然隔離。

## 開發期隔離（重要）
- feb2 預設 **DEV 模式：關閉自動 /sync**（開站 1.5s 自動同步在 DEV 下不觸發，僅留手動鈕）。
  理由：progress.json 與服役原版共用，聯集式合併會把測試資料永久寫進真實備考紀錄且無法洗掉。
- 對真伺服器的整合測試一律走**第二 serve_media 實例（8797/8798，FEB_HUB 指向 feb2、獨立 progress-dev.json）**，不碰 8795/8796。
- port 8643 已於 step 0 完成（start_feb.bat）。

## 遷移
不寫遷移碼：**/sync 系統就是遷移路徑**。feb2 首次開站自動從媒體伺服器
progress.json 合併下 watched/done/playpos/target。localStorage 鍵名不變（CONTEXT.md 契約）。
切換日程序（iPad 端）：(1) 三份使用指南已更新（T10）；(2) 媒體伺服器 HUB 改指 feb2；(3) iPad 上原 PWA 同 origin 直接換底（SW 版號 v23 會自動汰換殼快取，教材快取因資料/版號分離而保留）；(4) DEV 旗標移除，自動 /sync 生效——首次同步即完成進度遷移。原版資料夾保留為回退。

## 排除
portiva/probe/review-sheet/index 備份檔不入副本；media/ 為 junction；
data/exams、brochures 在磁碟上但不入 git。

## 切換完成紀錄（2026-09-01 16:53）
使用者下令「執行切換日，讓 feb2 轉正」。已執行：
- 字型離線 vendor（v37）＋ FEB_DEV=false（commit 737a8ce）
- 開機自啟 vbs 加 FEB_HUB=C:\Users\User\Desktop\claude\feb2（回退＝刪該行重啟）
- live 8795/8796 重啟（新 PID），日誌證實供應 feb2；/admin、/sync、字型全 200
- 原版 grad-exam-hub 一位元組未動，永久保留為回退
- dev 第二實例 8797/8798 留作沙盒
iPad/桌面既有網址與 ?k= 連結全部不變（同 origin 無縫換底，教材快取保留）。
