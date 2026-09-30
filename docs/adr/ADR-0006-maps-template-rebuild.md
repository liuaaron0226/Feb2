# ADR-0006 作戰地圖只換模板重 build，內容不動

日期：2026-08-31　狀態：已決

## 決策
la-map/me-map 的 4MB 預渲染內容零改動；觸點是模板層。**事實更正**：模板有兩份
byte-identical 實體——`scripts/la-map/la_template.html`（la_build.py 讀）與
`scripts/me-map/la_template.html`（me_build.py 讀）。T09 第一步先統一為單一事實來源
（改 la_build.py 讀 me-map 份＋assert），再動模板、重跑兩個 build 全換膚。

## 順手修
- marked.min.js 兩頁死載入 → 移除
- 深讀層 markdown 表格未轉換 bug（`<p>| … |</p>`）→ optional，時間允許才修
- 兩頁互連與 index 入口（現況三頁互不連結）→ 進 IA 範圍

## 風險
- build 管線讀 F 槽 notes.json——動模板前先驗證管線今日仍可完整重跑
- **兩支 build 的 OUT 硬編碼指向服役中的原版 repo**（la_build.py:22、me_build.py:18），
  且原版兩張地圖 untracked 無 git 保護——T09 step 0 必須先改 OUT 指向 feb2 並備份原版兩檔
