# T04 考古題模式重設計

blocked-by: T03　｜循序原則：與其他 UI 票不得平行

## 目標
情報中心全區換新：hero 統計、八校總覽表、學校詳情 modal（年份格/熱度表/趨勢）、
反向選校 finder、目標校系挑選 modal。

## 做法要求
- 資料層（DATA/INDEX/ANA fetch 與運算）不動，只重做 render 層
- 熱度表與跨校長條圖依 dataviz skill 原則重做（先讀該 skill）
- 表格在 iPad 直向的橫捲體驗要重新設計（現況橫向捲整表）

## 驗收
`.scratch/redesign/checklists/exam.md` 逐項勾完；
考古題連結以程式驗：render 產出的 href 與 exam-index.json 逐筆 diff 為空，
另每校抽 1 筆手點開 PDF（共 8 筆）；熱度表深淺與數字對得上 analysis JSON；
本票新增/改名檔案已同步進 SHELL_FILES。
