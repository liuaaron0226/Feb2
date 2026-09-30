# T14 讀書模式結構級重設計（使用者裁定開啟）

> 判定原話（2026-09-01）：「2我覺得只需要更改讀書模式即可。另外我希望你的網頁可以在
> 設計的更大膽，design-system.html 你這裡有很多不錯得點子，請大膽放心設計」

## 範圍
只動讀書模式的**版面結構**（畫面怎麼組織）。凍結不變：資料層、播放器、DISK、
sync、review-core/replan-core 演算法、考古題模式、home、localStorage 契約。

## 方法
三個結構變體 → 瀏覽器實渲染 → 使用者拍板 → 贏家實裝進 09-render-study.js。
變體放 .scratch/redesign/direction2/（連 site/css/tokens.css，真資料）。

## 驗收
拍板後實裝：checklists/study.md 既有功能全數重驗；de-box 法、S5 硬檢、
音訊禁令照舊；/watch-ui 或截圖交使用者過目。
