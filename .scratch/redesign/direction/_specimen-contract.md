# 方向變體共用契約（三版必守，違者不可比）

## 檔案
單一自包含 HTML（Google Fonts CDN 可用），命名 a.html / b.html / c.html。

## Token 架構（變數「名」固定，值由方向決定）
:root 必須定義且全頁只准用這些變數上色/定字/定距：
--bg --bg-raise --ink --ink-dim --ink-faint --accent --warm
--line --line-strong --glass --glass-line
--sc-elec --sc-math --sc-la --sc-ctrl --sc-toeic
--w-title:2.5rem --w-sub:1.0625rem --w-body:.9375rem --w-meta:.8125rem --w-tag:.6875rem
--ls-title:-.035em --ls-tag:.16em
--r-lg:18px --r-md:12px --r-sm:9px
--btn-h:32px --btn-h-sm:28px --btn-h-xs:24px
--dur:320ms --ease:cubic-bezier(.22,1,.36,1)
字階五級與圓角三級的「值」不准改（這是既有量化紀律）；色值與字體由方向自由發揮。
字體：body 一律含 "Noto Sans TC" 後備；數據/代號用 mono（tabular-nums）。

## Specimen 區塊（順序與內容固定，樣式自由）
1. spec-head：方向名＋一句靈魂宣言＋方向代號眉標
2. s-home 待機：時鐘 21:47（大字）、2026-08-31 週一、天氣徽章「晴 31°」、
   倒數「D-154 距 2027-02-01 筆試」、兩顆模式鈕「考古題」「讀書」
3. s-workbench 工作台：工具列（D-154 · 總進度 42% · W2 · 搜尋逐字稿）；
   左欄四章：電子學「BJT 與 FET」(sc-elec, 已完成✓, 考點條 80%)、
   工數「拉普拉斯轉換」(sc-math, 進行中, 考點條 95%)、
   線代「特徵值與對角化」(sc-la, 未開始, 60%)、
   自動控制「根軌跡」(sc-ctrl, 未開始, 70%)；
   右欄（選中拉氏）：集數 chips「ME-E07 169min」「ME-E08 142min」、
   考古題連結「台大113 第3題」「成大112 第1題」；
   今日複習條：「控001 · GoodNotes p.12」＋ pass / A / B / C 四鈕＋「數003 · p.31」
4. s-exam 情報表：三列（台大電機丙組 2/1 工數A+電子學 · 10份、
   成大電機甲組 2/3 工數+電路 · 7份、中央電機 免筆試 · 3份）＋一格熱度示例
5. s-components：ui-solid/ui-ghost/ui-seg 三型按鈕 × 三高、學科 pills 五色、
   狀態燈三態（離線就緒/補檔中/缺 3）、todo 條「多益報名 剩 4 天」
6. s-tokens：色票（含變數名標籤）＋字階梯（五級各示範一行）

## 品質底線（三版都要）
對比 4.5:1；:focus-visible 可見；prefers-reduced-motion 全動效關閉；
觸控目標 ≥44px（含 hit-area 外擴）；進場 stagger 30-50ms/項、全部走 var(--dur) var(--ease)；
無 emoji 圖示（inline SVG 或字元符號）；width 動畫禁用（只 transform/opacity）。
