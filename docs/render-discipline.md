# 渲染紀律：狀態不存 DOM（全站法律）

出處：ADR-0003 三條紀律（git 38ab749、9e545c1、68b598f 的教訓），在 T02 拆分時擴寫成
可執行的規則。之後每一張票、每一次重繪相關的修改都以本文為準。

## 法律本體

**狀態永遠活在 JS 變數與 localStorage 裡；DOM 只是「寫出去」的輸出端，永遠不是資料來源。**

這個站的畫面更新方式是 innerHTML 整塊重建（`renderWmBar()`、`renderStudy()`、
`renderOverview()`……都是直接換掉整段 HTML）。任何被塞進 DOM 的東西——input 的值、
class 上的旗標、dataset 裡的紀錄、file input 拿到的 File——在下一次重繪就會蒸發。
git 38ab749 就是這樣壞的。

## innerHTML 重建規則

1. **讀狀態只准讀 JS／localStorage**。要知道「哪一章被選取」看 `WM.sel`，
   不是去 DOM 找 `.on` 的元素；要知道「看過沒」看 `feb-watched-v1`，不是看勾勾。
2. **render 函式是純輸出**：吃 JS 狀態、吐 HTML 字串、綁事件，僅此而已。
   render 函式內不准寫狀態（會變成「重繪順便改資料」的隱形副作用）。
3. **使用者操作的流向固定是**：事件 → 改 JS 狀態 → 存 localStorage → 呼叫 render 重繪。
   不准反過來「先改 DOM 再想辦法把狀態撈回來」。
4. **inline onclick 依賴頂層全域函式**：innerHTML 樣板裡的 `onclick="epMark(...)"` 只解析得到
   全域 scope。拆檔後所有被樣板呼叫的函式必須維持頂層宣告（plain script，不是 module scope）。

## 永不重繪的元素（碰它們之前先讀這段）

這些元素持有「重繪即丟、且丟了救不回」的東西，**必須保持 `<body>` 直屬、
不准搬進任何會被 innerHTML 重建的容器**（ADR-0003 紀律 2，git 9e545c1）：

- **`#diskPick`**（`<input type="file">`）：持有使用者選過的外接硬碟 File handle。
  曾放進 `#wmBar`，被 `renderWmBar()` 重建掉，選好的影片全部消失。
  看板裡的 `#wmDisk` 是 `<label for="diskPick">`，重繪的是 label，input 本體不動。
- **`#toast`**：由 `toastMsg()` 動態 append 到 body，一次建立後重複使用。
- **`.scene` 背景層、`#wipe` 轉場層、`#setPanel` 設定面板**：只做 class/hidden 切換，
  從不 innerHTML 重建；新增背景效果時比照辦理。

## 資料快取與程式版號分離（ADR-0003 紀律 3）

**教材快取永遠不准跟著程式版號被砍**（git 68b598f「是我自己把使用者的教材快取砍光的」）。

- `sw.js` 分兩個 cache：殼層 `feb-vNN-shell`（HTML/CSS/JS/字型，跟版號走、改版即汰換）
  與教材 `feb-data`（筆記/字幕/快照/分析，**刻意不帶版號**）。
- 改版只 bump `VER`（本次拆分：v23）；`DATA` 這個名字永遠不動。
- 新增快取一律先問：這是「程式」還是「教材」？教材進 `feb-data`，程式進殼層。
  拿不準就當教材——重抓殼層便宜，重抓 100MB 教材在外面沒網路時是災難。

## localStorage 是狀態的家

鍵清單見 CONTEXT.md（`feb-wm-v1`、`feb-sprint-v1`、`feb-watched-v1`……），
它們是 /sync 與遷移的契約：改 shape 要同時想過合併函式（`applyProgress()`）怎麼辦。
