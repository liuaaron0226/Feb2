# ADR-0001 零建置 vanilla 翻新，不換框架

日期：2026-08-31　狀態：已決

## 決策
重設計維持零建置、無框架、純靜態多檔架構。318KB 單檔拆為 ES modules，
但不引入 React/Vite/任何建置步驟。

## 理由
- 主軸是視覺與 UX（ADR 全系列的前提）；設計系統是 CSS/HTML 層的事，與框架無關
- 環境獎勵無聊技術：家中無網路、iPad 除錯靠 rlog、`python -m http.server` 即後端；
  「改完重整就看到」在此除錯迴圈中價值極高
- 2900 行實戰 JS（播放器/SW/sync/硬碟交接）重寫風險遠大於收益（見 git 2026-08-23 單日 23 commits 的行動化之戰）
- 脆弱性的病根是「狀態存在 DOM＋整塊 innerHTML 重建」，以紀律治之（ADR-0003）

## 後果
- Unlumen vault（React-only）在本案僅作動效參考；React 軌寫入 /重設計 skill 供未來專案
- SW 預快取清單需隨檔案拆分更新
