# T09 作戰地圖模板重設計＋重 build

blocked-by: T01（不依賴 T02–T08，可平行；「與 index 互連」不歸本票——見 T10）

## 目標
兩張 2MB 地圖換上設計系統（ADR-0006）。內容零改動。

## 步驟（順序即風險控制）
0. **改 OUT、統一模板——先於一切**：
   - `scripts/la-map/la_build.py:22` 與 `scripts/me-map/me_build.py:18` 的 OUT
     硬編碼指向**服役中的原版 repo**——先改成 feb2/site/ 路徑，全程不碰 grad-exam-hub
   - 先手動備份原版兩張地圖到 .scratch/（它們在原 repo 是 untracked，蓋掉無 git 可救）
   - 模板兩份 byte-identical（la-map/ 與 me-map/ 各一）：assert 一致後統一為單一
     事實來源（建議 la_build.py 改讀 me-map 那份），修 ADR-0006 敘述已完成
1. **原樣重跑** `la_build.py`、`me_build.py`，輸出與 feb2 內現行副本 diff
   （容忍時間戳差）——驗證管線今日仍可完整重跑（讀 F 槽 notes.json），鏽了先修管線
2. 模板改吃 tokens.css 語彙（inline 一份編譯後 token，保持單檔離線特性）；
   加回 index 的固定連結（釘死為 `../index.html`，不等 T03 的 IA）
3. 移除 marked.min.js 死載入；亮暗記憶鍵 la-lt/me-lt 保留
4. 重 build 兩張，diff 確認僅樣板層變動
5. optional（時間允許）：深讀層 markdown 表格未轉換 bug
6. 註：T03 IA 定案後**預期再跑一次 build**（成本＝重跑兩支 py，約一分鐘）——計畫內動作

## 驗收
兩張新地圖自身功能：導覽 sticky/收合/KaTeX/mermaid（含換膚）全正常；
離線單檔開啟（file://）仍可用；原版 repo 的兩張地圖 byte 未變（`git -C 原repo status` 佐證）。
