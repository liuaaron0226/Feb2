# T06 播放器與搜尋換皮

blocked-by: T03　｜循序原則：與其他 UI 票不得平行

## 目標
vidModal（控制列/自繪進度條/選單）、章節軌、思考地圖雙欄、逐字稿搜尋下拉——
全部套新 token。**骨架不動**（ADR-0003：vseek 邏輯、倍速、字幕、PiP、blob、YouTube 分支照舊）。

## 做法要求
- 思考地圖的 mermaid reskin() 換膚函式改吃 tokens.css 變數
- KaTeX/marked/mermaid 懶載入機制不動
- 隨播面板（cpModal）一併換皮，維持 400px 窄欄（Split View 約束）

## 驗收
離線影片與 YouTube 各播一支：快捷鍵、拖進度、章節跳轉、字幕、思考地圖時間戳跳轉、
板書快照、搜尋跳播全通；播放位置記憶與 90% 標記照舊；SHELL_FILES 已同步。
