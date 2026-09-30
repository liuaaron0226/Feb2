# 考古題模式驗收清單（供 T04 逐項打勾）

基準：`git HEAD:site/index.html`（重設計前原版，5402 行）。
驗證環境：桌面瀏覽器＋專案根目錄 `python -m http.server`（或 DEV 8643）。
每一項都是「原版使用者看得到的行為」；重設計後外觀可以不同，行為必須等價。

> 授權移除、不列驗收：!Boring 皮膚（feb-skin）、portiva/swiss 背景殘留（T02 明文授權的唯一行為變更）。

> T04 勾驗紀錄（2026-08-31，DEV 8643 實機瀏覽器驗證；「外觀可不同」處以〔T04〕註記新形態）

## Hero 統計與進場

- [x] 四張統計卡依序為「N 份簡章來源／N 個目標系所組／N 份考古題已收／10 年題庫縱深」：數值分別對上 schools.json 的 channels 數、各校 programs 加總、exam-index.json 中 `status=downloaded` 筆數、常數 10 —— 實測 8／21／192／10〔T04：卡→去框化 mono 大讀數〕
- [x] 統計數字有從 0 滾動到定值的緩出動畫（約 1.1 秒）：重整進考古題模式觀察 ——〔T04：retimed 為 --dur×3＝960ms＋--ease 曲線（JS 解 bezier）；reduced-motion 直接完成態。首載實見完成；驗證面板 rAF 節流下以 febEase 取樣驗證曲線〕
- [x] 主標「八校總覽」逐字浮現、每字延遲 120ms：重整觀察字元依序淡入（initHeadingReveal 未動，實見）
- [x] eyebrow→主標→副標→統計卡由上而下錯落進場（boot d1–d4）：markup 保留 d1–d4，boot 動畫未動
- [ ] 資料載入失敗時總覽表內顯示錯誤卡：驗證面板無法開 file://（自動轉靜態快照）。程式路徑未動（03-data.js catch 分支原樣），樣式仍在——待人工用 file:// 開一次補勾

## 總覽表

- [x] 表格七欄：學校／報名／筆試／筆試科目／免筆試／題庫／分析
- [x] 八校固定順序：台大、台聯大、中央、清大（動機）、成大、中山、台科大、北科大（截圖實核）
- [x] 學校欄含「聯合招生／自辦招生」小字
- [x] 筆試科目欄聯集 chips；免筆試欄逐行；皆空顯示「—」（台大免筆試「—」實見）
- [x] 題庫欄「N 份」、分析欄「done/planned 科」；無資料「—」（29 份、2/2 科等實見）
- [x] 點擊整列任一處開 modal：以列尾最後一格 td.click() 實測開啟
- [x] 表格過寬時容器內橫捲、頁面本身不出現橫向捲軸（iPad 768 實測 scrollWidth 900 > clientWidth 697；body overflow-x:clip）〔T04：校名欄 sticky＋右髮絲線＋左右 edge-fade 提示＋touch-action pan-x〕
- [x] 表下註記（115 逐字核對、116 需再核對）存在

## 共同必考章節（跨校長條圖）

- [x] 四組彙整；無已完成分析的組整組不出現（四組皆有 docs）
- [x] 組標題含「N 份分析彙整」（7／8／3／1 實見）
- [x] 每組列前 8 章（排除「其他」），排序＝校數優先、總大題次之（工數組 7,7,7,7,6,6,6,5 實見）
- [x] 長條寬度按總大題相對組內最大值縮放，右側「N 校考 ・M 大題」；抽 2 章手算：高階線性ODE＝7 校 110 大題、向量空間與線性變換＝6 校 114 大題，與 analysis JSON 彙整逐字一致〔T04：dataviz 法——單一 ember 色相、8px 細條、資料端 4px 圓角、per-bar tooltip〕
- [x] 分析 JSON 更新後重整即反映（loadAna no-cache 未動）

## 學校詳情 modal

- [x] 開啟時面板捲動歸零、背景鎖捲動（body.modal-open 實測 true）
- [x] 三種關閉方式：右上 ✕、點背景遮罩、按 Esc（Esc 實測；✕／遮罩走同一 [data-close] delegate，01-state 未動）
- [x] 標頭：校名＋badge；招生管道全名＋「報名 … ・ 筆試 …」日程行〔T04：內部改眉標＋髮絲線分節：招生管道／系所組／十年題庫〕
- [x] 三顆連結（簡章 PDF ../data/ 相對路徑、招生網站、考古題來源）皆 target=_blank〔T04：btn ui-ghost〕
- [x] 系所組卡：系名粗體＋組別＋卷別 badges；「（擇一）」＋slot note 掛 title；無筆試暖色 badge（台聯大 modal 實見）
- [x] 「名額・審查・備註」details 預設收合；★ 開頭套 star 樣式（markup 原樣保留）
- [x] 各科題庫區塊：科目名＋出處小字；台科大「自動控制系統」掛停考 badge 且不顯示分析（程式驗：badge=「已停考・113 起未再公布・題庫僅存檔」、無 details）
- [x] 有分析的科目顯示「重點章節：前三章 ×大題數」quick 行（多份標卷名）
- [x] 十年 PDF 格 106–115：已下載可點、新分頁開 ../data/exams/<path>（title＝科目＋年份）；連結程式驗 192/192 零 diff；每校 1 份 HEAD 全 200（8/8）
- [x] 未下載年份不可點、tooltip 顯示原因〔T04：年份數字加 dash 劃線＋降暗（不靠顏色單獨表意），title 原因保留〕
- [x] 「完整分析：…」details 預設收合，展開見「NotebookLM 分析 ・ 更新日期」
- [x] 熱度表：章節×年度矩陣、最右「計」欄橫向加總、深淺與數字對上 analysis JSON（ust-math 78 格＋ntu-control 45 格逐格比對 0 誤差；最深格＝最大值格）、容器可橫捲〔T04 dataviz 法：白階→ember SEQUENTIAL ramp（單色相、亮度單調、暗地 16–82%／亮地 10–60%）；0 格由「·」改為真空格；每個非空格保留大題數數字（ink token）＋per-cell tooltip〕
- [x] 必考重點清單（冒號前粗體）與命題趨勢段如資料存在則顯示（台聯大工數C 實見）
- [x] 「開啟 NotebookLM 筆記本 → 直接追問」另開分頁（有 notebook id 才出現）〔T04：安靜 mono 連結〕
- [x] 已規劃未完成分析顯示「章節分析產生中…」（程式路徑原樣保留；現資料 21 份分析全數完成，此態不出現）
- [x] 未收考古題學校顯示 pending 文案（程式路徑原樣保留；現資料八校皆有題庫，此態不出現）

## 反向選校

- [x] 收合區行為：點標題列開合、箭頭旋轉；.acc 一次只開一個（openSec 未動；實測展開）〔T04：玻璃箱→髮絲線標題列〕
- [x] 導覽列「反向選校」捲達並自動展開（01-state seclink delegate 未動）
- [x] 強項科目 pills 由 subjectCatalog 產生；「工程數學」與其他科目樣式有別〔T04：mist2/gold 之別改為學科色雙階 pills——工數＝--sc-math 青瓷、控制／電子／線代／英文各掛學科色、無學科色科目中性環〕
- [x] 工數章節 pills 由 mathChapters 產生，勾「工程數學」後可細選
- [x] pill 點擊切換 .on 且 verdict 即時重算重排（實測 on/off＋重排）
- [x] 判定—工數卷：需勾工數且所需章節全勾（chapters=null＝全部）；勾一半實測：台大顯示「缺 3 科」（★ 就地修一個原版就有的 crash：schools.json 有 3 個工數卷缺 chapters 欄，原版 `===null` 會 TypeError——改 `==null` 視同全章）
- [x] 判定—線性代數卷：科目或章節任一滿足（optionOK 邏輯未動）
- [x] verdict 涵蓋全部校×系所組；三態 ✓／doc／no（no 卡變暗＋列缺科）〔T04：卡片格→去框化列：2px 狀態脊線＋glyph ✓◇✕＋狀態字，狀態色用新 --status-* token〕
- [x] 全未勾時有筆試的組顯示「請先勾選強項」（實測 17 組）；排序固定 ok→doc→no
- [x] 需求行格式：卷名斜體＋〔範圍〕、「或」「＋」串接、slot 備註帶 tooltip、併採列、免筆試 nonWritten（台大／北科大列實見）
- [x] 底部 ⚠ disclaimer 存在

## 目標校系 modal（入口在讀書工具列，statistics 影響跨兩模式）

- [x] 開啟入口：讀書工具列「目標校系」鈕，字樣隨選數變化（實測「目標 10 校系」↔「目標 1 校系」；鈕本體屬 09 檔未動）
- [x] 清單按校分組（8 校 10 組，依 SCHOOL_ORDER），每列＝checkbox＋組別名（去校名）＋分析卷科目〔T04：列高 ≥44px、髮絲線分組、玻璃浮層保留〕
- [x] 勾選即存 feb-target-v1、該列亮 .on；「全選」10 組／「全部取消」0／「完成」關閉（程式實測 0→1→10，localStorage 同步）
- [x] 說明文指出無筆試組別不列出（實見）
- [x] 關閉後看板立即重繪、只統計勾選組（完成→renderStudy 實測觸發、鈕字樣即時更新；右欄「考古題 N 份」數字對照需先選章——TGT 過濾統計機制在 09 檔、本票未動）

## 錨點與捲動

- [x] 導覽「總覽／反向選校」錨點跳至對應區塊（anchor＋scroll-margin 機制未動）
- [x] scroll-spy：目前區塊導覽亮 active（截圖實見「總覽」active）
- [x] 區塊首次進入視窗 .reveal 淡入一次性（initReveal 未動；桌面實見）
- [ ] 背景山稜／海岸三層視差：N/A——T01/T03 依 ADR-0002 裁定以 aurora 氛圍場取代山稜圖層，.r1/.r2/.r3 元素已不存在（initParallax 保留空轉）。屬 T03 範圍的既定變更，非本票回歸
- [x] 模式切換走液態 wipe 轉場；reduced-motion 直接切換（wipeTo 未動；實見）

## 鍵盤與收尾

- [x] Esc 關閉學校 modal；播放器開著時 Esc 先關播放器（keydown 層級判斷逐字保留；Esc 關 modal 實測）
- [x] Esc 亦關閉角落設定面板（02-settings 未動）
- [x] footer「資料更新：…・簡章基準：…・…」（實測輸出 schools.json updated/baseAcademicYear/note）

## localStorage（考古題模式相關）

- [x] feb-target-v1：目標勾選重整後保留，鈕字樣與 modal 勾選一致（寫入／讀回實測；06-state-study 未動）
