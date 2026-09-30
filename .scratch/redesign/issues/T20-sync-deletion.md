# T20 同步刪除語意（真 bug，使用者實遇）

blocked-by: T18（同檔 serve_media.py）

## 症狀（2026-09-01 使用者回報）
取消勾選已完成章節，約 1 秒後自己勾回去。BJT 兩章因誤點站02「本章完成」而卡死。

## 根因
`merge_progress()` 對 done/watched 取**聯集**、miss 取**最大值**、target 取聯集
——**刪除永遠傳不出去**。客戶端取消 → 上傳 → 伺服器聯集回舊值 → applyProgress 寫回 → 重繪復活。
稽核期曾標記「聯集永不刪除、事後洗不掉」為測試污染風險，未升級為 bug＝架構師漏判。

## 修法：墓碑／編輯時戳（per-key last-write-wins）
1. 客戶端（06-state-study/08-sync）：每次 done/miss/watched/target 變更記
   `edits{"done:bjt-dc":ISO,...}`（feb-sprint-v1 等鍵的**可選附加欄位**，shape 相容）；
   刪除同樣記時戳。
2. 伺服器 merge_progress：對每個 key 比較兩側 edits 時戳，**新的一方勝（含刪除）**；
   無 edits 紀錄者退回現行聯集/取大（舊裝置相容）。
3. 同時修 target（陣列→帶時戳的集合差異）與 review（cards 刪除同理）。

## 驗收
四種欄位各做「A 裝置設定→B 裝置取消→兩邊都應消失」雙裝置模擬（8797 dev 實例）；
舊 payload（無 edits）行為與現行逐位元組相同；服役 8795/8796 不受影響。
