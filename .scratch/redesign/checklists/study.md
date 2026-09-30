# 讀書模式（工作台）驗收清單（供 T05 逐項打勾）

基準：`git HEAD:site/index.html`（重設計前原版，5402 行）。
驗證環境：桌面瀏覽器＋媒體伺服器（8795/8796）在跑；DEV 走 8643。
每一項都是「原版使用者看得到的行為」；重設計後外觀可以不同，行為必須等價。

> 授權移除、不列驗收：!Boring 皮膚（skinToggle、feb-skin、bgWarn 警示）——T02 明文授權刪除。
> 播放器內部（控制列、思考地圖、章節軌、隨播面板細節）主戰場在 T06；本清單只驗「從工作台進入播放器」的交接路徑與進度落地。
>
> **T05 驗收紀錄（2026-08-31，桌面 Chrome @8643 DEV，媒體伺服器 8795 在線）**：
> 標 [x] 皆為本輪實測；未能單人實測者留空並附原因。
>
> **T06 驗收紀錄（2026-08-31，桌面 Chrome @8643 DEV，媒體伺服器 8795 在線）**：
> 播放器／YT 留給 T06 的 7 項本輪實測補勾（標「T06：」註記）；換皮範圍＝app.css 播放器區
> ＋10-player.js 純視覺（mermaid 調色改吃 tokens），事件佈線與狀態機零改動（ADR-0003）。
> 測試產生的 watched／playpos 殘留測畢已清（115春微方01 的 playpos 因搜尋跳播實測被更新，鍵與 shape 未動）。

> **T14 驗收紀錄（2026-09-01，桌面 Chrome @8643 DEV，媒體伺服器 8795 在線未觸）**：
> 讀書模式結構級重建（ADR-0008「脊柱為地圖，今夜是劇場」S×F 融合）。
> 母版-明細（#wmList／#wmDetail 兩欄）於衝刺視圖退役，改為：
> ① **時間脊柱**——左緣全高 2px 燃線（已燒餘燼漸層／今夜燃點交棒／未燃素引線，
> port 自 .scratch/redesign/direction2/spine.html），內容按時間吊掛：起點蓋 08·20、
> 過去週 details 摺頁（壓縮暗、✓＋SP.done 日期）、本週站牌、誠實結算列
> （照表 12 夜 × 5h ＝ 60h · 實燒 22.6h · 差 −33～−37.4h 隨勾動實測）、
> 今夜撐開、未來週摺頁、09/12 清算站、phase2 站牌摺頁、×142 夜摺疊柵
> （>366 夜依 spine.html 截斷法：遠端一律摺疊、數字誠實）、02·01 終點環。
> ② **今夜劇場**（port 自 focus.html）——站01 複習（#rvSlot 同節點搬入）→
> 站02 今日章節（主章＋本週待燒）→ 站03 錯題 → 站04 收工（戰報＋明日預告）；
> 每站出血色場（ember／學科-hi 6%／status-warn／quiet）＋24rem mono 站號水印
> 切出右緣；四站皆為 in-flow 區塊——捲動是老大，導航＝in-flow 錨點列＋
> 鍵盤 1–4＋唯一浮動「今夜」玻璃錨（↓/●/↑ 隨位置，實測公式三態）。
> 開進讀書模式即落在今夜（wipe 蓋台下 instant 跳）。
> 工具列瘦身為一條髮絲列：搜尋／目標／重排／硬碟與離線（DISK 入口保留）／
> 視圖段／新「立即同步」（ADR-0005 欠帳）。W1–W4 週次 seg 退役（脊柱取代）。
> 影片庫視圖照舊主從版面（決策 E）。#wmSpine 全出血自裁（overflow-x:clip）
> ——所有向右出血剛好停在視窗緣，documentElement.scrollWidth 實測 390==390。
> 渲染紀律未破：狀態仍在 JS/localStorage、#rvSlot／#diskPick／#spAnchor 永不重建；
> 06-state-study.js 零改動；sw.js v31→v32、index.html 17 個 ?v31→?v32、
> SHELL_FILES 不變（無新增檔案）。_febSelfCheck 通過、console 僅既有 DEV 域
> SW 註冊失敗、getAnimations 無限動畫 running=0（emberpulse 吃強度儀凍結）、
> 三模式往返＋考古題模式零改動（.st 類名衝突已改 .stage 避開 .ov .st）。
> 測試殘留全數還原（sprint/wm/target/watched/playpos/review 六鍵 byte-equal）。

## 前置

- [x] sprint.json 與 manifest 都拿不到時，整個工作台區塊隱藏（不留空殼）：關掉伺服器並清快取驗證（T05：以 SPRINT_PLAN=null＋MANIFEST=null 模擬驗證 `#wm.hidden===true`；未實際關服役伺服器——DEV 紀律不動 8795/8796）（T14：重驗——SPRINT_PLAN=null＋MANIFEST=null 模擬 `#wm.hidden===true`；空態下 #rvSlot 仍留在文件中不失聯（rvDock 先撤離再重建））

## 工具列

- [x] 倒數卡「N 天到 9/12」＝sprint.json deadline − 今天（過期夾 0）（T05：顯示改為 mono 讀數「D-12・至 9/12 筆試」，值＝12 正確；夾 0 邏輯未動）（T14・脊柱取代：倒數讀數搬進脊柱今夜段——主讀數 D-153（距筆試）＋dlab「至 09/12 第一輪 D-11」實測值正確、夾 0 邏輯未動；工具列不再有倒數卡）
- [x] 進度條＝四週章節已完成時數/總時數（phase2 軌道不計入）；時數以 0.1 取整，不出現 118.80000000000001 這類浮點尾巴（T05：22.6/118.8h 無浮點尾巴；軌改 2px 細軌，wmHours() 未動）（T14：搬進今夜段 burnout 列——「22.6/118.8h · 19% · 2px 微軌 · 脊柱 12/165 夜 · 今夜配額 5h」實測；wmHours() 未動、無浮點尾巴）
- [x] 時數字樣「done/tot h」數值真的變動時跳動一下（num-bump）；純重繪未變動時不跳（T05：兩種情況實測，bumpOnChange=true／bumpOnPlainRerender=false）（T14：#wmHrs 隨遷 burnout；勾 bjt-dc 22.6→27 實測 num-bump 觸發（比對邏輯原樣自工具列搬入 bindSpine）；測畢還原）
- [x] 目標校系鈕：未選＝ghost「目標校系：全部」、已選＝solid「目標 N 校系」；點開目標校系 modal（T05：markup 改掛 .btn ui-ghost/ui-solid hit；勾 9 校顯示「目標 9 校系」、10 校還原正確；modal 列高 44px、底部鈕收斂 .btn）（T14：鈕留在瘦身工具列；「目標 10 校系」solid 字樣＋modal 10 列開閉實測）
- [x] 逐字稿搜尋—載入：focus 搜尋框即預載 search_index.json；輸入防抖 240ms；少於 2 字不觸發（T05：邏輯零改動（10-player.js bindSearch/doSearch 未動）；focus 預載＋搜尋出結果實測）（T14：搜尋整組原樣留在工具列；focus 預載＋240ms 防抖程式未動）
- [x] 逐字稿搜尋—結果：彈窗最多 80 筆（滿了顯示「80+ 個片段」），每列＝集數代號＋時間戳＋前後文，關鍵字以 <mark> 高亮（T05：實測「拉普拉斯」80 筆＋「80+ 個片段」＋mark 高亮；列樣式收斂 token，行為未動）（T14：實測「拉普拉斯」80 筆＋「80+ 個片段」＋mark 高亮）
- [x] 逐字稿搜尋—跳播：點結果直接開播放器並跳至該秒（回退 3 秒起播，句子有頭）（T05：實測 9:52 命中 → 播放器於 ~589s 起播、2 倍速）（T14：跳播程式未動；data-srch 列 DOM 與綁定實測在——音訊禁令，本輪不實點開播）
- [x] 逐字稿搜尋—空態：無索引顯示「搜尋索引還沒建立——跑一次『補字幕與筆記.bat』」；無結果顯示「找不到『…』」（T05：無結果態實測「找不到『zzzz不存在的詞』」；無索引態未實測（索引在線），文案程式未動）（T14：文案程式未動）
- [x] 逐字稿搜尋—關閉：框內 Esc 關彈窗並失焦；點彈窗外關閉（T05：兩者實測通過）（T14：框內 Esc 關閉實測；點外關閉同一段程式未動）
- [x] 「硬碟與離線」收納選單：點鈕開合（aria-expanded 同步）、點外面或 Esc 關、點選單項目後自動收合（T05：開合／aria／點外面／Esc 實測；選單本體改掛 glass-quiet 合法浮層）（T14：開合／aria-expanded／點外關閉實測）
- [x] 收納鈕警示態：硬碟對不上／離線缺檔／媒體伺服器斷線任一發生時，外層鈕亮暖色（data-st=warn）——收起來也不漏警訊（T05：OFF gap 時實測 data-st=warn、色=--status-warn (237,203,55) 並加 mono「!」字符（不 color-alone）；警示反映在「下一次重繪」——與原版相同時序）（T14：moreWarn 判定原樣；DEV 域 OFF gap → 外層鈕亮 warn＋「!」目視（截圖））
- [x] 選單四項齊全：選整個資料夾／選影片（DISK 狀態字樣）／離線狀態燈／媒體伺服器燈（正常時整項隱藏）（T05：四項到齊，mediaBtn 正常時 hidden=true 實測）（T14：四項到齊實測（wmDiskDir／wmDisk label→diskPick／offBtn／mediaBtn 正常時 hidden））
- [ ] 媒體伺服器退化兩態：「⚠ 影片無法快轉」（黃，退回 ../media/ 無 Range）與「⚠ 連不到影片」（紅）；點擊重試連線並 toast 結果（T05 未實測：需關停服役中的 8795——DEV 紀律禁止；05-media.js 文案與狀態機零改動，樣式改吃 --status-warn/--status-bad）（T14：程式未動（05-media）；DEV 紀律仍不動服役 8795，續留空）
- [ ] 媒體伺服器自動復原：退化後每 4 秒探測，伺服器回來自動切回可拖曳來源並 toast「媒體伺服器已連上…」：關掉再開伺服器驗證（T05 未實測：同上，不動服役伺服器；mediaWatch 未動）（T14：程式未動；同上續留空）
- [x] 週次段 W1–W4：今天所在週標 now、選取週標 on；tooltip＝週名（地基／最大板塊／衝刺主峰／收攏第一輪）＋日期區間＋該週 done/tot 時數（T05：W2 tooltip「最大板塊・8/27–9/2・0/29.9h」實測；now 標記改為 mono「·今」字符；seg 收斂 tokens ui-seg）（T14・脊柱取代：W1–W4 seg 退役——週次導航由脊柱本身承擔：過去週＝已燒段摺頁（「W1 · 08/20–08/26 · 地基 · 22.6/39.7h · 4/5 章 ✓」實測）、本週站牌、未來週＝未燃段摺頁（排定時數）；原 tooltip 資訊改為站牌明文）
- [x] 點週次：切至該週衝刺視圖並清除章節選取；週次「不」持久化——重整回到今天實際所在週（T05：切 W3 後重整回 W2 實測；feb-wm-v1 無 week 欄）（T14・脊柱取代：「點週次」不存在了——本週由 wmCurWeek() 錨定、重整必回實際週；feb-wm-v1 形狀不變（實測 keys＝view/sel/libSel，week 依舊刻意不落地））
- [x] 視圖段 衝刺／影片庫：即時切換且存 feb-wm-v1（重整保留所選視圖）（T05：切至 lib 重整還原實測）（T14：視圖段留在工具列右端；切 lib→重整還原→切回 sprint 實測，#rvSlot 兩向搬運同一節點）

## 待辦條

- [x] 來源 sprint.json todo；done 項不顯示；全部做完整條隱藏（T05：渲染來源與過濾邏輯未動；改為單行去框形態（決策 D））（T14：renderTodo 未動；單行＋「還有 4 件」目視（截圖））
- [x] 急迫排序：剩餘天數小→大，無期限排最後（T05：排序程式未動；最急「已過期 5 天」置頂實測）（T14：程式未動）
- [x] 標籤與樣式：「已過期 N 天／今天／剩 N 天／待辦」；≤7 天 urgent、≤21 天 soon 兩級強調（T05：文案邏輯未動；上色改 status token——urgent=--status-bad、soon=--status-warn，天數文字本身即訊號）（T14：程式未動）
- [x] 只露最急 1 件，其餘收進「還有 N 件」<details>（T05：單行＋「還有 4 件」實測）（T14：程式未動）
- [x] 展開狀態持久（feb-todo-open）：展開後勾一章觸發整區重繪仍保持展開；重整亦保留（T05：展開→renderStudy() 重繪仍開、鍵值 1/0 寫入實測）（T14：程式未動；feb-todo-open 鍵未動）

## 衝刺看板—左欄（章節清單）

- [x] 弱點列：錯題數最多前 3 章「章名✕N」；點擊跳至該章、必要時自動切週（跨週捷徑）（T05：點「拉氏轉換✕1」→ 自動切 W1 並選中實測）（T14・脊柱取代：弱點列升格為今夜站 03——全部 miss>0 章節依次數排序＋標號考卷連結；點章名跳回脊柱實測（laplace → 自動開 W1 摺頁＋原地展開＋捲至該列））
- [x] 區段標題「W{n}・週名」＋欄標「章節／十年考點／錯題／時數」（欄標 tooltip 正確）（T05：四欄標與 tooltip 保留；「十年考點」註記補「列底細脊」說明）（T14・脊柱取代：「W{n}・週名」成為脊柱站牌（摺頁 summary，含日期區間與時數讀數）；欄位標頭退役——錯題／時數／十年脊條由列上 tooltip 與 mono 讀數自述）
- [x] 章節列組成：完成 checkbox＋圓點＋章名（去「電子學：／線代：」前綴）＋觀看比例底線＋十年條＋錯題鈕＋時數（T05 重排（決策 A）：圓點改為左脊線＋科目眉標（mono 結構色）；前綴去除、觀看底線、錯題、時數皆在；十年條改列底考點覆蓋脊條＋% 讀數）（T14：整列語彙原樣搬上脊柱（.wm-row 重用＋掛刻度）：checkbox＋左脊線＋科目眉標＋章名＋seen 底線＋列底考點脊條＋錯題＋時數；已完成列改標「✓ MM/DD 章完」（SP.done 日期上列，決策 A））
- [x] 勾完成：存 feb-sprint-v1（記日期）、列套 done 樣式、上方進度條與時數即時更新；點 checkbox 不會同時觸發選章（T05：done['bjt-dc']='2026-08-31' 寫入、時數 22.6→27 即時跳動實測；checkbox 改安靜方框＋墨階 ✓，stopPropagation 未動；測畢已還原）（T14：實測 done[bjt-dc]=2026-09-01 寫入、burnout 22.6→27 即時、該列移入已燒段＋今夜主章自動遞補 bjt-ac、站 04 戰報同步、結算差 −37.4→−33h；checkbox stopPropagation inline handler 未動；測畢還原）（T14c・家搬了：主章的完成勾遷居三階天梯階03 終點（.ldr-done input[data-sp]，同一 data-sp 綁定）——重驗 done[bjt-dc]=2026-09-01 寫入、主章遞補 BJT 小訊號、站 04 戰報同步、過去列可反勾；其他章節列的勾原位未動；feb-sprint-v1 測畢 byte-equal）
- [x] 錯題計數：左鍵 +1、右鍵 −1（不彈瀏覽器選單）、觸控右滑 +1／左滑 −1（<24px 視為點擊）；歸零後徽章回「✕」；存 feb-sprint-v1.miss（T05：+1/+1/−1 與歸零回「✕」實測；觸控滑動路徑程式未動、未在桌面重測）（T14：實測 +1 → ✕1（同步入站 03）→ 右鍵 −1 歸零回「✕」；觸控滑動程式原樣搬入 bindSpine）（T14c・家搬了：主章的 ✕ 遷居階02 動作列（.r-act [data-miss]，同一 bindSpine 四路綁定）——重驗 +1 → ✕1 同步迴流站 03、Shift+Enter −1 歸零回「✕」＋refocus、右鍵路徑同綁；其他章節列的 ✕ 原位未動）
- [x] 十年條：106–115 十格，出題數 1／2／≥3 三級亮度；hover 或選取列時整條提亮；tooltip「十年出題分佈（亮＝該年有考）」（T05 形態改版（決策 A）：十格改為列底單一色相脊條（結構色 26/48/78% 三級 color-mix）＋尾端覆蓋 % 墨階讀數；hover/選取提亮與 tooltip 保留）（T14：yrStrip 未動；列底脊條＋% 讀數＋hover/展開提亮 CSS 保留）
- [x] 十年條只統計目標校系勾選組的卷（未勾＝八校全算）：勾選前後對照（T05：laplace 全目標 10 年/57 份 → 只勾清大丙組（電子）0 年/0 份，實測對照）（T14：spExamData／activeAnaKeys 未動；目標 modal 勾選流程實測）
- [x] 觀看比例底線：章內已離線集數的觀看比例（自動進度＋手動標記合成），title「影片已看約 N%」（T05：合成邏輯 watchOf() 未動；模板保留 .seen 底線＋title）（T14：watchOf 未動；模板保留）
- [x] 選章：點列右欄即換內容；選取存 feb-wm-v1（重整回到同一章）；選取失效（換週等）時退回清單第一列（T05：選取/重整還原/換週退回第一列皆實測）（T14・結構變更（決策 C）：選章＝原地展開（accordion，一次一份）——點列展開該章材料、再點收合；sel 存 feb-wm-v1、重整回同一章且自動打開所屬摺頁（c-freq → p2-ctrl 摺頁實測）；失效改落 null——今夜即預設落點，不再強選第一列）
- [x] phase2 獨立軌道（控制系統 9/13 起、多益每天 30 分）：以 sprint.json 的 label 各自成區段、不受週次篩選；點其章節不會被彈回當週第一項（T05：「控制系統・9/13 起」區段渲染；點 c-model 選取不彈回實測）（T14：phase2 軌道＝未燃段站牌摺頁（「控制系統・9/13 起」「多益・9/20 應考…」，label 來自 sprint.json）；章節列同一套、原地展開不影響本週；c-model「✓ 08/17 章完」目視）
- [x] 該週無章節時顯示「這週沒有排章節」（T05：以空週模擬實測訊息渲染）（T14：空週訊息保留在摺頁 body（同文案，空週才渲染））

## 衝刺看板—右欄（章節詳情）

- [x] 標頭：科目眉標＋章名（去科目前綴）＋「Nh」tag＋勾完成後多一顆「已完成」tag（T05：眉標/主標/tag 皆在（tag 收斂 mono 註記行）；「已完成」tag 模板未動）（T14：站 02 主章帶完整標頭（眉標＋章名＋Nh tag＋新增「影片 N%」tag＋已完成 tag）；原地展開版不重複標頭——列本身就是標頭）（T14c：主章標頭改由 chLadderHTML 供應（wm-dh 同語彙：眉標＋章名＋Nh＋影片 N%＋已完成 tag），天梯在其下）
- [x] 摘要行：未選目標＝「八校合計：」、已選＝「依你勾的 N 個目標校系：」；十年裡 N 個年份考過、共 M 大題；接科目統計句（SP_STAT）；結尾「勾完成的標準是該章考古題能動筆」（T05：「依你勾的 10 個目標校系：十年裡 9 個年份考過、共 39 大題」＋SP_STAT＋標準句實測）（T14：模板未動；「依你勾的 10 個目標校系：十年裡 9 個年份考過、共 39 大題」＋標準句目視（截圖））（T14c：主章摘要只留考點統計；「勾完成的標準」律法搬家到階03（rung3 r-law＋勾 data-tip）——原地展開版摘要含標準句原樣未動）
- [x] 多益章（無考古題對應）改用 ch.why 文案＋「該回試題能自己作答」標準句，不出現「0 個年份考過」的空洞句（T05：選多益章實測 ch.why 文案、無「0 個年份」）（T14：ch.why 分支未動）
- [x] iStudy 區塊：標題「iStudy 集數 N/M 已離線」計數正確；有 courseCE 時尾端「→ 開 iStudy 課程列表」外連（T05：「5/6 已離線」＋外連（改安靜 mono 連結＋↗）實測）（T14：「5/6 已離線」＋courseCE 外連目視（截圖））（T14c・家搬了：主章的 iStudy 區塊遷居階01 範例站台（看課＝讀範例）——「6/6 已離線」＋courseCE 外連於梯上重驗；原地展開版原位未動）
- [x] 集數 chip：看過圓圈（環形進度 --p）＋代號粗體＋標題＋尾註（看過／N%／硬碟／N 分／VLC 五種之一）；備援集（alt）淡化並加「備援・」前綴（T05 形態改版（決策 B）：chip 改 pill 鈕；ep-mark 環形進度、mono 代號、尾註五態（含「硬碟」「備援・VLC」）與 alt 淡化實測）（T14：epRow 未動；「備援・VLC」「N 分」尾註與 alt 淡化目視）（T14c・家搬了：主章集數 chips 上梯（階01）——epRow 單一模板未動，data-play/data-mark 經 bindChDetail 綁定重驗（音訊禁令不實開），看過 chip 淡化＝階01 的「✓ dims」訊號）
- [x] 看過圓圈：點擊切換手動看過（Enter／Space 亦可），且不觸發播放；手動標記優先於自動進度（取消手動後退回百分比態）（T05：點擊標記/取消寫入 feb-watched-v1、未觸發播放實測；鍵盤路徑 bindMarks 未動）（T14：bindMarks 經 bindChDetail 原樣綁回；程式未動）
- [x] YouTube 區塊：「N 支」、chip＝播放三角＋講次＋標題＋片長；點開站內內嵌播放器（youtube-nocookie、autoplay），不另開分頁（T05：chip 渲染（T Video 46 支、播放三角、片長）已驗；openYT 內嵌播放本輪未實跑（openYT/10-player 未動）——留待 T06 播放器主戰場一併驗）（T06：點 01-01 chip → 同視窗內嵌 youtube-nocookie/embed/…autoplay=1 實測播放、未開新分頁；⚠ 發現既有 latent bug：同一 session 先開過並關閉原生播放器後再 openYT，modal 的 hidden 不會被解除（openPlayer 空 url 早退在 m.hidden=false 之前）——10-player 邏輯凍結未修，已列 T06 回報追蹤）（T14：模板未動；chips DOM 與 openYT 綁定實測在——音訊禁令不實開）
- [x] 考古題區塊：按學校分組（成大工科標「成大工科」）、各校年份新→舊；每校先露 5 份，其餘按「顯示較早的 N 份」一次展開（T05：台聯大/中央/成大工科分組、新→舊、「顯示較早的 4 份」實測；年份格改安靜 mono 連結列＋↗）（T14：分組／新→舊／「顯示較早的 8 份」目視（c-freq 展開材料，截圖）；ex-more 改就近作用域（同頁可多份材料））（T14c・家搬了：主章考古題區塊遷居階03 自解站台（exBlockHTML 抽出共用，chDetailHTML 同源）——bjt-dc 17 份分組＋題號 chips＋「顯示較早的 4 份」於梯上重驗；原地展開版原位未動）
- [x] 題號標注：有 qs 的年份顯示「YYYY 第 X、Y 題」＋hasq 樣式＋tooltip「這份考卷的第 … 大題屬於本章」；未標者 tooltip「尚未標出題號」；區塊標頭右側「N 份已標題號」或「近年在前」（T05：「115 第 4 題」等＋hasq 細環＋「17 份已標題號」實測；tooltip 模板未動）（T14：「第 X 題」＋hasq＋「17 份已標題號」實測（bjt-dc 17/17））
- [x] 全無題號時顯示 run_redo.bat 提示段；無考卷時依目標勾選顯示兩種空態文案（「你勾的目標校系裡…」／「這章沒有對應的已收考卷」）（T05：模板三態未動；本輪資料全有題號，空態未逐一目視）（T14：模板三態未動）
- [x] 考卷連結新分頁開 ../data/exams/<path> PDF；href 與 exam-index.json 逐筆 diff 為空（T04/T05 共用驗法）（T05：選中章 17 條 href 對 exam-index downloaded path 逐筆 diff＝0 筆不符）（T14：href 模板逐字未動（../data/exams/<path>）；本輪未重跑 diff）
- [x] 右欄依科目染色溫（data-subj：elec／math／la／ctrl／toeic）（T05：data-subj 照設；色溫改為頂端結構色場（7% color-mix），映射改走 tokens --sc-* 雙階）（T14・形態遷移：染色溫改由站 02 出血色場（data-subj → --ch 6% 場）與 .wm-exp 左脊線承擔；影片庫右欄 data-subj 色場照舊）

## 影片庫視圖

- [x] 左欄依科目分區：電子學／工程數學／線性代數／多益（來自 manifest series）＋「自動控制：T Video（YouTube）」；每列顯示「got/total 離線」或 YT 的「N 支」（T05：五區到齊；列加科目眉標；離線讀數改 status token＋✓/數字文字（決策 F）實測）（T14：影片庫視圖沿用主從版面（決策 E）；五區實測到齊）
- [x] 隱藏系列「電子學/114暑電子」不在清單出現（檔案照抓，只是不顯示）（T05：清單僅 115暑電子，實測）（T14：LIB_HIDE 未動）
- [x] 系列選取存 feb-wm-v1.libSel、重整保留；失效退回第一列（T05：選「工數/115春微方」重整還原實測；退回第一列邏輯未動）（T14：libSel 還原實測（工數/115春微方））
- [x] 右欄標頭：系列名＋科目 tag＋「N 集」tag；摘要「N/M 已離線（約 N 小時）」；媒體伺服器可用時「離線檔預設 2 倍速、可拖曳快轉」、不可用時粗體警示「媒體伺服器未啟動」（T05：科目改為眉標位（同衝刺右欄語彙）＋「14 集」tag；「14/14 已離線（約 37 小時）＋2 倍速可拖曳」實測；不可用警示文案未動）（T14：右欄標頭「115春微方」實測；其餘模板未動）
- [x] YT 系列右欄：「線上觀看，約 N 小時」；chips 開內嵌播放器（T05：摘要模板未動；chips 同模板渲染（內嵌開啟見上方 YouTube 區塊註記））（T14：模板未動）
- [x] 集數 chips 與衝刺分頁同一套模板（含看過標記、硬碟優先、data-code 完整——影片庫漏 data-code 是踩過的坑）（T05：epRow 單一模板；以 dataset.code 找到 115春微方02 chip 並確認 data-code 完整、硬碟尾註同步）（T14：epRow 單一模板未動；lib chip data-code 完整實測）

## 今日複習條（新增）

> **T07 驗收紀錄（2026-08-31，桌面 Chrome @8643 DEV，第二實例 8797 在線）**：
> 排程核心抽成 `site/js/review-core.js` 純函式（無 DOM、無 Date.now，today 注入），
> `node --test tests/review-core.test.js` 20/20 全綠：基本梯 +3/+14/+28、梯尾重複、
> A/B/C 任一失敗重設回梯首、壓縮兩檔位（≤60→+3/+7/+14、≤30→+2/+5/+7，
> 以「複習當日」判定，含 60/61 與 30/31 天邊界）、晚了不補（票上釘死的
> 8/29 到期 8/31 處理 → 8/31+14＝9/14 工作範例）、畢業（nextDue>考日不再排仍可查）、
> applyResult 純函式、failStats 分布。UI 住 `12-review.js`（#rvSlot 獨立重建區，
> 狀態讀穿 feb-review-v1，DOM write-only）。/sync 合併住伺服器端
> `serve_media.py merge_progress()`：cards 按 id 聯集、history 按 (date,result)
> 聯集去重、createdAt 留最早、subject/page 留 updated 較新側；對 8797 實測
> 雙裝置快照先後 POST 不互洗，舊 payload（無 review 鍵）200 且檔內 review 不掉。
> sw.js v27→v28、SHELL_FILES 補 review-core.js＋12-review.js。
> 測試殘留（DEV 域 feb-review-v1 測試卡）測畢已清；progress-dev.json 留有 E2E 結果（該檔即為此用途）。

- [x] 【新增・T05 只驗占位】工作台版面預留「今日複習」條位置並掛「即將」占位（T07 才實作：feb-review-v1、+3/+14/+28 排程、距考壓縮、失敗重設、晚了不補、卡號對 GoodNotes 頁碼）——原版無此區，不得以「基準沒有」為由略過占位（T05：#rvSlot 於主清單上方、mono 眉標「RV · 今日複習 · 即將」；feb-review-v1 鍵全站零使用（僅註解保留））（T07：占位轉正——`12-review.js` renderReview() 輸出到 #rvSlot；有到期卡＝.glass.rv-float 真浮層（sticky，工作台唯一合法浮動玻璃，ADR-0002 豁免名單），列＝mono「控001 · GoodNotes p.12」＋pass/A/B/C（44px hit、A/B/C 上 status token、focus-visible 全域）；空態＝安靜一行「今日無到期卡」；＋新卡 ghost 鈕開極簡表單（卡號/五科 select/頁碼，Tab+Enter 鍵盤可完成、Esc 關，實測）；失敗碼分布 mono「A×1 B×0 C×0」實測隨點擊即時更新；完整迴圈實測：加卡 控001/控制/p.12 → toast「09/03 到期」（+3 正確）→ 注入到期今天 → 條浮出 → 點 A → 分布更新＋下次 09-03（重設 +3 正確）→ 重整還原。零常駐動畫（getAnimations 實測空）、console 無新錯（僅既有 DEV 域 SW 註冊失敗）、_febSelfCheck 通過）（T14・站 01：#rvSlot【同一 DOM 節點】由 rvDock() 搬進今夜站 01 內（影片庫視圖搬回工具列下常駐位），永不 innerHTML 重建；注入到期卡實測——.glass.rv-float 於站 01 內浮出、pass 評分→分布更新→浮層收回，feb-review-v1 測畢 byte-equal 還原；12-review.js 零改動）
- [x] 【新增・T05】同樣為 T08（重排工具）預留版面位置（T05：工具列右端 mono 眉標「重排 · 即將」占位，無功能）（T07：未動——T07 只接手 #rvSlot，工具列「重排 · 即將」占位原樣保留給 T08）（T08：占位轉正——換成 btn ui-ghost「重排」實體入口，.wm-soon 樣式一併移除）（T14：重排入口留在瘦身工具列；另在已燒段結算列加「重排 W1–W4」第二入口（spine.html port））

## 落後重排（新增・T08）

> **T08 驗收紀錄（2026-08-31，桌面 Chrome @8643 DEV）**：
> `site/replan.html` 退役（git rm），演算法（膨脹係數＝實花÷計畫、貪婪剝葉按
> 每小時分數性價比、依賴鏈鎖、跨科鎖拉氏→控制 9/13）**原樣搬**進
> `site/js/13-replan.js`——純計算核心（ReplanCore，UMD 同 review-core 模式）
> 與 modal 渲染分離。**步驟 0 資料飄移已排除**：章節結構／名稱／時數全改讀
> SPRINT_PLAN（data/sprint.json，飄移 20 章逐一以 sprint.json 為準；
> basic→circuit0；laplace 原 dep:'ode-n' 因 sprint.json 排 W1 首位而取消，
> 跨科鎖不受影響）；dep／w 是 sprint.json 沒有的演算法參數，以 sprint id
> 為鍵掛在 13-replan.js（非複本）。演算法級對照 `node tests/replan-parity.test.js`
> 3/3 全綠（輕鬆過／要砍幾章／全砍也不夠：砍章順序、鎖住集合、判定、
> saved/cost 逐位一致；ORIG 區為 replan.html 退役前逐字存證）。
> 完成章節單一事實來源＝SP.done（feb-replan-v1 退役不遷移）：modal 內
> 點掉拉氏 → 看板時數即時 22.6→16.1h、跨科鎖「⊘ 跨科鎖 · …9/13 接棒」浮現、
> 拉氏不入砍單；還原後完成日照原值 2026-08-30 寫回。UI 過 token：
> 入口 btn ui-ghost「重排」（32px 視覺、hit 44px）；glass modal 合法浮層，
> 內部去框化（RP-01/02/03 眉標＋髮絲線、行線表格無外框、quiet 底線 mono
> 輸入、chips 結構階學科色、verdict 狀態 token＋2px 脊線＋glyph 不 color-alone、
> 鎖鏈 mono 註記 ⊘ 依賴鏈鎖／跨科鎖、「全砍也補不平」誠實態全文保留）。
> Esc 關（播放器優先層級）、focus-visible 實測 2px ember、chip hit ::after 44px、
> 輸入重繪不失焦（欄位骨架只建一次）、無限動畫 running=0（modal 開閉皆測）、
> console 僅既有 DEV 域 SW 註冊失敗、_febSelfCheck 通過。
> sw.js v28→v29、SHELL_FILES += js/13-replan.js（replan.html 原本就不在清單）。
> 測試殘留已還原（SP.done 全數照原值；RP 輸入是 UI 暫態不落地）。

- [x] 【新增・T08】工具列「重排」開 glass modal：輸入（每日可讀／累計已讀／截止日預設 sprint.deadline）→ ok/warn/bad 判定＋mono 讀數列 → 砍章表（順位／時數／佔全科／性價比／累計代價）＋保留區鎖鏈註記（實測見上方紀錄）（T14：兩個入口實測開閉（工具列＋結算列）；modal 程式未動）
- [x] 【新增・T08】演算法級對照：同一份 sprint.json 衍生資料注入新舊兩邊，3 組輸入砍章順序／鎖鏈／判定完全一致（tests/replan-parity.test.js 3/3）（T14：程式未動）
- [x] 【新增・T08】SP.done 打通：已完成章不入砍單、modal 勾章＝看板同步、feb-replan-v1 退役（T14：程式未動）

## 播放器交接路徑與進度落地

- [x] 開啟三徑：硬碟已選該集→blob 直接播；伺服器可達→串流 URL；兩者皆無→開隨播面板（VLC 檔名一鍵複製＋章節時間戳）（T05：blob 徑與串流徑實測（blob 且伺服器在線時走 blob＝硬碟優先）；隨播面板徑未實測（需雙來源皆斷），epClick 分流未動）（T14：epClick 分流未動；chips data-play／data-code DOM 實測在（音訊禁令，不實播））
- [x] 播放器標題三層：集數碼眉標＋課程名主標＋「科目 · 章節」中繼行（由 byChapter 反查 sprint 章節，查不到留空不硬湊）（T06：115暑電子11 實測三層「115暑電子11／6-3~7-4／電子學 · BJT 小訊號放大器」（中繼由 byChapter 反查成功）；YT 集 01-01 中繼查不到 → hidden=true 留空實測；樣式收斂 tokens——眉標 ember mono、主標 --w-title、中繼 mono 墨階）（T14：10-player 未動）
- [x] 載入即 2 倍速；上次位置 >1 秒且距結尾 >2 秒時自動續播（無續播提示條——已刻意移除）（T05：2 倍速實測（rate=2）；續播邏輯未動）（T14：10-player 未動）
- [x] playpos 記憶：feb-playpos-v1 以伺服器資產 URL 為鍵（blob 不當鍵）存 {t,dur,pct,at}；暫停／快轉／結束／關閉／pagehide／切分頁皆落地；關閉播放器後清單上「看到 N%」立即更新（T05：關閉播放器 → feb-playpos-v1 {t,dur,pct,at} 落地＋renderStudy 更新實測；其餘觸發點程式未動）（T14：10-player 未動）
- [x] 看到 ≥90% 自動標看過（feb-watched-v1 記日期）；之後清 playpos 仍記得看過（watchAutoMark 未動；本輪未播到 90%，未驗）（T06：嚴謹版實測——先刪 watched 鍵 → 實跳 91%/92% 觸發 plSave → feb-watched-v1['115暑電子11']='2026-08-31' 自動補回；隨後刪該支 playpos，watched 仍在；另證關閉播放器時 plSave 會再落地（關閉即存）。測畢 watched／playpos 皆已還原）（T14：watchAutoMark 未動）
- [ ] 影片載入錯誤分流：伺服器來源 code 2（網路抓不到）→ 自動關播放器改開隨播面板；硬碟 blob 失敗 → toast 對應建議（格式／硬碟被拔）（10-player 未動；需製造網路錯誤，本輪未驗）（T06：以 connection-refused 假網址實測 → Chrome 回 code 4 → toast「影片來源有問題。（錯誤 4：來源不支援／伺服器）」分流正確；code 2 分支需讓串流中途斷線＝關停服役中的 8795，DEV 紀律禁止，仍未驗；onerror 分流程式零改動）（T14：程式未動，仍未驗）
- [x] 字幕：.vtt 存在（HEAD 探測）時自動掛中文字幕且預設顯示；「更多」選單可開關、無字幕顯示停用項（T06：115暑電子11 開播自動掛軌＋預設顯示（畫面實見中文字幕）；「更多」選單點擊 showing→hidden→showing 實測；停用項「這支沒有字幕」——101 支離線集全數有 .vtt 無天然樣本，以移軌後 vmenuBuild 重建選單驗證模板分支，再用 attachSubs 原函式掛回）（T14：10-player 未動）
- [x] 播放器開啟時背景 loop 影片暫停、關閉／回待機時恢復（省 iPad 解碼）（T06：站內無影片背景資產（assets 僅 earth.jpg），以課程串流暫充 .bgvid 來源在 home 模式實測——openPlayer → bg.paused=true＋data-byModal=1；closePlayer（mode=home）→ 恢復播放＋flag 清除；bgVideoPause/Resume 程式未動，測畢背景已還原）（T14：bgVideoPause/Resume 未動）

## 硬碟直讀（DISK——ADR-0003 戰功子系統，入口明文保留）

- [x] #diskPick input 直屬 body、永不因工具列重繪銷毀：開選單→選檔→工具列重繪後再選一次仍有反應（iOS 選完沒反應是踩過的坑）（T05：input 未進任何 render host；同一 session 兩次選檔（中間多次 renderStudy 重繪）change 皆有反應實測）（T14：#diskPick 仍 body 直屬（實測 parent=BODY、綁定旗標在）；工具列重繪為新版樣板，input 本體不動）
- [x] 「選影片」多選且累加（第二次選不洗掉第一次）；只收 .mp4/.m4v/.mov（T05：兩次選檔 DISK.size 1→2 累加、.txt 被過濾（沒找到影片）實測；註：OS 檔案對話框無法自動化，以 DataTransfer 注入 change 事件走同一條程式路徑）（T14：07-disk 未動）
- [x] 檔名→代號解析：先拔（喻）（劉）講師標記、再取「115暑電子03」型代號、「-The End」尾綴正規化（_febSelfCheck 有斷言）（T05：「115春微方(喻)01 P.99~…」解析為 115春微方01 對上課表；_febSelfCheck 斷言通過）（T14：07-disk 未動；_febSelfCheck 斷言通過）
- [x] 三種結果態與燈色：「硬碟：沒找到影片」（紅）／「硬碟 N 支・對不上」（紅）／「硬碟 N 支」（綠，N＝對上課表數）；toast 含「重新整理後要再選一次」（T05：「沒找到影片」紅（--status-bad 實測 rgb(241,106,106)）與「硬碟 N 支」綠（--status-good）實測；「對不上」態未觸發（同一狀態機分支）；toast「（重新整理後要再選一次）」出現）（T14：狀態機未動；燈態字樣照舊進 wm-more 選單）
- [x] 「選影片」label 點擊：有診斷時 toast 完整診斷（版號＋選到幾檔＋解析代號＋對上幾支）；無診斷時 toast feb-disk-last 上次選過的檔名清單（T05：DISK_DIAG=「[v22] 選到 1 個檔案…對上課表 1 支」生成實測；label click toast 程式未動）（T14：程式未動）
- [ ] 「選整個資料夾」切 webkitdirectory 模式並 toast iOS 逐檔複製警告；取消選檔 toast「沒有選取」（T05：點擊會開真實 OS 對話框，無法自動化走完；bindDisk 目錄模式程式未動）（T14：程式未動；續留空）
- [x] 硬碟優先：同一集同時有伺服器來源與硬碟檔時播 blob；同一支重開重用同一個 blob URL（不累積）（T05：伺服器在線＋硬碟有檔 → currentSrc=blob: 實測（播放 3 秒測片正常前進、無 error）；BLOBS 重用程式未動）（T14：videoSrc 未動）
- [x] chip 尾註同步：選到的集數尾註變「硬碟」、need 態解除（T05：115春微方02 chip 尾註「硬碟」、need class 解除實測）（T14：模板未動）

## 離線就緒燈

- [x] 三態燈色：ready 綠（「離線就緒 N」）／work 黃（「補檔 n/N」「離線：盤點中」）／gap 紅（「離線缺 N」「離線：連不到電腦」等）（T05：燈色改 status token（good/warn/bad）；DEV 域 SW 註冊失敗 → gap「離線：未安裝」紅實測；ready/work 態在此域無法出現）（T14：DEV 域 gap「離線：未安裝」紅＋外層鈕 warn 實測）
- [ ] 開站約 4 秒自動盤點補齊（audit→prefetch，含 21 份分析、notes/vtt/快照、KaTeX 20 字型、search_index）；補檔進度即時跳「補檔 n/N」；第二次開站幾乎瞬間就緒（DEV 域 SW 不可用，無法驗；11-boot 邏輯未動）（T14：DEV 域 SW 不可用，仍無法驗；11-boot 未動）
- [x] 首次進讀書模式時若燈還停在「檢查中…」會自動補跑一次盤點（按鈕出現後 300ms）（T05：renderWmBar 內 300ms 補跑邏輯保留未動；DEV 域下 OFF_UI 由「檢查中…」推進到「離線：未安裝」實測）（T14：300ms 補跑邏輯原樣搬進新工具列渲染）
- [x] 點狀態燈：toast 原因（OFF_WHY 一律帶 [版號]）並立刻重新檢查（T05：offBtn onclick 程式未動；[APP_VER] 前綴保留）（T14：程式未動）
- [x] SW 不可用三種原因分開講：要用 https／瀏覽器不支援／未安裝（順序先驗 isSecureContext）（T05：本域顯示「未安裝」分支實測；判斷程式未動）（T14：程式未動）
- [ ] 電腦讀不到外接硬碟（offline-manifest root_ok=false）時不更新離線清單、不把就緒數洗小（需拔硬碟情境，本輪未驗；邏輯未動）（T14：程式未動；續留空）

## 進度同步

- [x] 【DEV 紀律・ADR-0005】feb2 開發模式下自動 /sync 必須關閉——原版行為（開站 1.5 秒後、online 事件、任何進度異動後 3 秒防抖各觸發一次）只可對第二實例 8797/8798 驗證，DEV 下不得打到服役伺服器（T05：FEB_DEV=true；syncSoon 開頭直接 return、開站/online 觸發都掛 !window.FEB_DEV——本輪多次 spSave/tgtSave 無任何 /sync 發出）（T14：FEB_DEV=true 下全輪測試無任何自動 /sync 發出；新增「立即同步」＝手動 syncNow(false)（ADR-0005 明文允許、ADR-0005/J2-4 欠帳兌現）——以 fetch 攔截實測鈕→POST /sync→誠實 toast 全鏈路，未觸任何伺服器；唯讀裝置由 syncNow 既有前置擋＋toast）
- [ ] 同步合併套回本機：watched／done／miss／playpos／target 逐欄位合併，有變更時看板自動重繪；連不到時安靜略過、離線紀錄照常保留（08-sync applyProgress 未動；DEV 下不得實跑，未驗）（T14：applyProgress 未動；DEV 下仍不實跑）

## 鍵盤快捷鍵

- [x] 播放器開啟時：Space 播放／暫停、←／→ ∓10 秒、Shift+←／→ ∓60 秒、Home 回開頭、End 跳結尾前 5 秒、↑／↓ 沿 1→1.25→1.5→1.75→2→2.5→3 調速（端點夾住）（T06：實鍵逐鍵驗——→100→110、←回100、Shift+→ +60、↑ 2→2.5→3（端點夾住）、↓ 3→2.5、Home→0、End→dur−5 全通；Space 因自動化注入層送不出 key=' '（實測收到 key=''），改派發與實體鍵盤同形的 KeyboardEvent 驗證 → 播放↔暫停通；快捷鍵 handler（04-render-exam.js）本票零改動）（T14：04-render-exam 快捷鍵未動；新增之 1–4 站台鍵不與播放器鍵重疊，且 modal-open 時不攔）
- [x] 焦點在 input／textarea／select 時上述快捷鍵不攔截（在搜尋框打空白鍵驗證）（T05：攔截判斷程式未動；搜尋框輸入（含空白詞素）未觸發播放器行為）（T14：新 1–4 快捷鍵同守則——焦點在 input/textarea/select 或 modal-open 時不攔（實測搜尋框按「2」不觸發跳站））
- [x] Esc 層級：先關播放器→再關學校 modal；另各自關閉：硬碟與離線選單、搜尋彈窗（框內）、角落設定面板（T05：播放器 Esc、選單 Esc、搜尋框內 Esc 實測；學校 modal 屬考古題模式（T04 已驗））（T14：Esc 層級程式未動；搜尋框內 Esc 實測）
- [x] YT 內嵌時顯示提示行「k 播放暫停　j／l 退進 10 秒　<／> 調速」（YouTube 自家快捷鍵）（T06：.yt 模式下 yt-hint display:block 實測（截圖可見）；自訂控制列／中繼列同步隱藏（#vidModal.yt 選擇器照舊）；樣式收斂 tokens——按鍵字 ember mono）（T14：未動）

## localStorage 持久化（/sync 契約，逐鍵重整驗證）

- [x] feb-sprint-v1：done（章→完成日期）＋miss（章→錯題數）重整不丟（T05：勾 bjt-dc＋miss=1 → 重整還原實測（測畢已還原原值）；shape {done:{},miss:{}} 未動）（T14：done＋miss 寫入／還原／重整 byte-equal 實測）
- [x] feb-wm-v1：view／sel／libSel 還原；week 刻意不存（重整回實際週次）（T05：三欄還原＋week 不存實測）（T14：view／sel／libSel 還原＋sel 原地展開重現實測；week 依舊刻意不落地（形狀未動））
- [x] feb-target-v1：目標勾選還原、工具列鈕字樣一致（T05：10 組還原、鈕字樣「目標 10 校系」一致實測）（T14：10 組還原＋「目標 10 校系」字樣實測）
- [x] feb-watched-v1：手動與自動看過標記還原（代號→日期）（T05：手動標記寫入/取消實測；shape 未動）（T14：鍵未動；重整 byte-equal 實測）
- [x] feb-playpos-v1：續播位置與清單百分比還原（T05：{t,dur,pct,at} 寫入實測；shape 未動）（T14：鍵未動；重整 byte-equal 實測）
- [x] feb-disk-last：上次選檔清單還原（權限記不住、檔名記得住）（T05：["115春微方01"] 寫入還原實測。註：本輪測試覆寫了測前既有清單值——鍵與 shape 未動，僅內容被測試更新）（T14：程式未動）
- [x] feb-todo-open：待辦展開態還原（T05：1/0 寫入＋重繪保持實測）（T14：程式未動）
- [x] feb-breadcrumb：危險動作（開選擇器／收檔）前寫入、走完清除；上次沒走完會在下次開站的 rlog boot 帶出「上次未完成」（T05：crumb/crumbClear 程式未動；選檔流程走完後鍵已清除）（T14：程式未動）
- [x] 【新增・T07】feb-review-v1：今日複習卡片狀態（T05 階段僅確認鍵名保留給 T07，不得挪用）（T05：全站 grep 僅 index.html 註解提及、程式零使用）（T07：啟用——shape＝{cards:[{id,subject,page,createdAt,history:[{date,result}]}]}（ADR-0004 權威版）；加卡＋記 A 後重整實測還原；12-review 讀穿 localStorage 不留記憶體副本（watchMap 同款），/sync applyProgress 直寫鍵即生效；localProgress() 帶 review 鍵上送（shape 原封）、舊伺服器回包無 review 鍵時整段跳過；合併在伺服器端 merge_progress()，對 8797 雙裝置 E2E 實測不互洗；測試殘留測畢已清）（T14：注入到期卡→站 01 浮層→評分→byte-equal 還原全迴圈實測；shape 未動）

## openYT latent bug 修復補驗（2026-08-31，commit 320caeb）
- [x] YouTube 集數於先開過本機片後仍可開啟（紅燈重現→修復→綠燈；誤報 toast 一併移除）（T14：程式未動）
- [x] Esc 關閉層級於 YT modal 正常（modal-open class 同步清除）（T14：程式未動）

## T12 裝置管理（2026-09-01，ADR-0007；dev 8797 全程 curl E2E，服役 8795/8796 未動）

伺服器（serve_media.py）：
- [x] 通行碼登入（?k=）發每裝置 session（febsess cookie，HttpOnly；同時清 febkey——踢除才踢得乾淨）；sessions 存進度檔旁 device-sessions.json，欄位 {token,name,ua,ip,created,lastSeen,mode}；新裝置 mode=readonly（T14：伺服器側未動）
- [x] 唯讀裝置 POST /sync 403 且寫入未入檔（毒 payload 前後 md5 相同、鍵未出現）；GET /sync 200、POST /log 200 照常（T14：伺服器側未動）
- [x] /admin 僅 localhost（200＋單檔 inline-token 管理頁）；LAN 開 /admin、/admin/list、/admin/kick、甚至帶 ?k= 一律 404；API list/rename/set-mode/kick 實測（rename 中文 UTF-8 body 驗過；git-bash curl 送 cp950 會 400——伺服器嚴格 utf-8 是對的，瀏覽器 fetch 一律 utf-8）（T14：伺服器側未動）
- [x] 升級 trusted → POST /sync 200 正確合併（新鍵入檔、舊 watched/done 無損）；踢除 → 該 token 下一請求 401 通行碼頁重登；?k= 一鍵連結照常可用（驗過即轉發新 session）（T14：伺服器側未動）
- [x] 向後相容：無 session 檔時 febkey cookie／localhost／OPTIONS 預檢行為與現況完全相同（實測 200/200/204、無 Set-Cookie、不建檔）；session 檔存在時舊 febkey cookie 驗過即轉發 session 並回收共享 key。py_compile 過。E2E 產物（session 檔、測試進度鍵）測畢已移除／還原，dev /sync 與測前快照 byte-equal（T14：伺服器側未動）

Feb 側（08-sync.js，僅此檔）：
- [x] /sync 403 → 安靜停自動同步（syncSoon 短路＋syncNow 前置擋）、window.SYNC_READONLY=true、console.info；wm-more 選單掛「! 唯讀裝置」狀態列（DOM 注入＋包 renderStudy 重繪後補掛，未動 09-render-study.js）；node --check 過（T14：syncSoon 短路未動；markReadonlyUI 注入點 `#wmMore .wm-more-pop` 於新工具列保留（DOM 實測選單在））
- [ ] 唯讀 badge 實機瀏覽器目視補驗（本輪為 curl/靜態驗證；待下次 LAN 實機用平板走一次 403 流程順手勾）（T14：續留待實機）

## T14 結構重建新增驗收（2026-09-01）

- [x] 【新增・T14】開場落點：進入讀書模式（btnStudy／toStudy）即落在 #tonight（wipe 蓋台下 640ms instant 跳；實測 tonightTop=76=scroll-margin）；resize／重繪不奪捲動
- [x] 【新增・T14】誠實結算列：照表 N 夜 × 配額 ＝ Xh · 實燒 Yh · 差 Zh（負＝status-warn、正＝status-good，字樣即訊號不 color-alone）；實測 12×5=60 · 22.6 · −37.4，勾一章後 −33 即時；列內「重排 W1–W4」開 T08 modal
- [x] 【新增・T14】今夜讀數組：D-153 主讀數＋「夜 13/165」夜序＋burnout（已燒/總量·%·微軌·脊柱夜數·今夜配額）；值全對 sprint.json＋SET.exam 推導
- [x] 【新增・T14】站 01 複習：#rvSlot 同節點入站（見上方今日複習條 T14 註）；空態安靜一行、到期浮玻璃皆於站內成立
- [x] 【新增・T14】站 02 今日章節：主章＝本週首個未完成章（計畫決定），完整材料（標頭/摘要/集數/考古題）＋「本週待燒 ×N」壓縮列；主章勾完成 → 自動遞補下一章實測；本週清空 → 接 phase2 首未完成章；全清 → 誠實空態
- [x] 【新增・T14】站 03 錯題：miss>0 章節依次數排序＋各校最近年標號考卷連結（既有資料，無新模型）；點章名跳回脊柱（開摺頁＋展開＋捲至）實測
- [x] 【新增・T14】站 04 收工：今日戰報（今日勾完成章／看課標記／複習卡（pass 計）／錯題累計）全從既有鍵讀穿；明日預告（同週續章／下週開章／過 9/12 接第二段）實測「BJT 直流偏壓 · 續」與勾完後遞補
- [x] 【新增・T14】站台導航：in-flow 錨點列（01–04）＋捲動 spy 亮所在站＋鍵盤 1–4 直達（input/modal 守則實測）；「今夜」玻璃錨＝全站唯一浮動導航（↓/●/↑ 公式三態實測；僅 study＋sprint 顯示）
- [x] 【新增・T14】原地展開 accordion：一次一份、sel 持久、摺頁自動打開、材料綁定（播放/標記/顯示更多）逐份就近作用域
- [x] 【新增・T14】「立即同步」鈕：→ syncNow(false) → 結果 toast（fetch 攔截實測全鏈路，未觸伺服器）；DEV 只擋自動、唯讀裝置誠實拒絕（既有 syncNow 前置擋）
- [x] 【新增・T14】390px 行動版：脊柱塌成貼視窗左緣 4px 邊條＋今夜記號（rail 右緣實測 x=4）；documentElement.scrollWidth==innerWidth（390==390，未較基準（394==394）退步）；站水印/巨讀數 clamp 縮級
- [x] 【新增・T14】摺疊柵與截斷：09/12→02/01 gap「×142 夜 · 摺疊 · 二輪複習＋考古循環」；脊柱逾 366 夜時 gap 標注截斷、夜序數字照實
- [x] 【新增・T14】殼層版本：sw.js VER feb-v31→feb-v32、index.html 全部 17 個資產戳 ?v31→?v32、SHELL_FILES 原封（無新檔）


## T14c「R 灌注」新增驗收（2026-09-01，桌面 Chrome @8643 DEV）

> 授權：ADR-0008 T14c（使用者指 river.html「我以為會長這樣」→「要，做 T14c」）。
> 骨架維持脊柱×劇場，灌入 R 兩魂：三階天梯＋河道感。
> sw.js VER feb-v34→feb-v35、index.html 17 個資產戳 ?v34→?v35、SHELL_FILES 原封（無新檔）。
> 狀態鍵測畢 byte-equal（feb-sprint-v1／feb-wm-v1 全文比對；watched/review/target/playpos/set/todo-open 長度比對）。
> console 僅既有 DEV 域 SW 註冊失敗；_febSelfCheck 全過；getAnimations 無限動畫 running=0；
> 1280 與 390 皆 scrollWidth==innerWidth（390==390）。

- [x] 【新增・T14c】三階天梯：站02 主章材料＝「範例→半完成→自解」三座全寬出血站台（rung::before 200vw 出血、#wmSpine clip 裁齊；tint＝學科結構色 7%≤8%）；01/02/03 巨 mono 編號（桌面 67px／390 縮至 34px，42% 結構色）
- [x] 【新增・T14c】階01 範例：集數 chips＋iStudy 外連＋YouTube 列＋時數讀數「影片 6.8h · 2× ≈ 3.4h」（ch.watch 推導）＋觀看三態讀數（○ 未開始／▶ 已看 N%／✓ 全部看完）；看過 chip 既有淡化＝本階的 ✓ dims
- [x] 【新增・T14c】階02 半完成：無數位資料——誠實呈現規則本身（遮後半自補／卡 4 分鐘／一次只掀一步，quiet mono，取自 docs/study-rules.html），動作＝錯題計數（✕ 同一顆、同綁定）；不造假進度
- [x] 【新增・T14c】階03 自解：考古題連結（分組＋題號）＋「不看解做出 2 題＝本章完成」律法行＋完成勾終點（勾 tip＝「能動筆」使用者律法）；多益分支改「能自己作答並看懂解析」句
- [x] 【新增・T14c】解鎖視覺：階02 於階01 無動靜（watchOf frac≈0）時 dim、階03 於無 ✕ 且未完成時 dim——僅編號/站名退墨＋色場減光，操作永不被擋（dim 態下 +1 ✕ 實測即亮階03）；glyph＋文字雙訊號不 color-alone
- [x] 【新增・T14c】河道感：今夜四站左岸 1px 流線（stn1 起、stn2–4 top:-30px 補縫＝連續河道，實測四站皆 1px warm 24%）；站內容自左岸退 --rvx 縱向堆疊；站04 尾端 status-good 端點收束；站03 眉標改「迴水灣——階 02 記下的 ✕ 在這裡迴流」、空態句同步
- [x] 【新增・T14c】四文體仍分明：站01 卡佇列／站02 天梯站台（取代行線清單）／站03 標記筆記／站04 數字報表——同色盤、零新色
- [x] 【新增・T14c】能力零遺失：主章列（data-lead）收攏為眉標＋章名＋時數＋覆蓋脊條（勾與 ✕ 家在梯上）；本週待燒與所有其他章節列＋原地展開 accordion 原樣（checkbox／✕／材料逐項重驗）；#rvSlot 照舊入站01、鍵盤 1–4＋st-nav＋「今夜」錨照舊；helper 抽出（exRowsHTML／exBlockHTML／ytRowsHTML）兩處共用不漂移
- [x] 【新增・T14c】12-review.js 原生 title 清零：7 處全轉 data-tip（#vizTip 規制）——rv-code／rv-late／rv-dist span＝data-tip；A/B/C 與匯入按鈕＝data-tip＋aria-label；#rvSlot [title] 稽核＝0 實測

## 動效鬆綁（ADR-0002 修訂三 #3，2026-09-01 值夜）

> **S5 硬檢措辭修訂（依 ADR-0002 修訂三，本節起生效；先前各節的
> 「study 零無限動畫／getAnimations running=0」為當時法條下的歷史紀錄，不改寫）**：
> `study 僅允許【白名單 gentle-ambient loop】——全部吃 play-state 檔位變數
> （--gentle-play：quiet 也 running；page-hidden／modal-open 於 body 層 paused、
> reduced-motion 由 tokens 全滅），getAnimations 稽核＝「infinite 且 running」者
> 只准出現白名單成員；互動動效 60fps transform/opacity only、--dur/--ease、
> 出場 65%（--dur-exit）。觸控無 backdrop-filter 條款不變。`
> 白名單四員：①脊柱已燒段餘燼漂移 spinedrift（60s）②今夜燃點呼吸
> emberpulse（既有，2.4s）③站號水印超慢呼吸 seatbreathe（8s，opacity .85–1，
> 含書架 shelf-seat）④河道流線微流 riverflow（8s dash 漂移，1px 窄柱）。
>
> **驗收紀錄（2026-09-01 值夜，桌面 Chrome @8643 DEV；FEB_DEV 驗證期暫開、
> 測畢還原 false；/sync 以 fetch stub 攔截，未觸任何伺服器）**：
> sw.js VER feb-v40→feb-v41、index.html 18 個資產戳 ?v40→?v41、SHELL_FILES 原封。

- [x] 白名單 loop 稽核（1280 與 390 皆測）：study（quiet）下 infinite&&running＝
      {emberpulse×1, riverflow×4, seatbreathe×4, spinedrift×1}——恰為白名單；
      場景 ambient（drift-a/b/c、ink-a/b、cl×3、fogflow×2、snowfall、twinkle、zap）
      全數 paused（quiet 檔照舊凍結、aurora 維持 8%）
- [x] 省電法：body.modal-open／body.page-hidden → 白名單 running 10→0→10 實測
- [x] 章節列展開＝expIn（clip-path＋fade＋slide，height-free）＋材料 --stagger 級聯
      （wm-dh/wm-dsub/wm-blk/ladder＋三階 rung 逐座）——circuit0 展開實測 expIn+rowIn
- [x] 完成勾＝tickdraw（scale+rotate 收正）＋整列 rowsettle（一次性：TICK_FLASH 只在
      真勾上那次重繪掛 class；取消勾不演、純重繪不重播實測；bjt-dc 勾→40ms 抓到
      tickdraw+rowsettle running→取消還原，feb-sprint-v1 byte-equal）
- [x] 錯題 ✕＝misspop（+1 演、−1 不演；MISS_FLASH 同紀律）——+1 實測 pop、
      右鍵 −1 歸零還原
- [x] 天梯階解鎖＝dim→lit crossfade（rungfield）＋編號 flare（numflare）——
      LADDER_LIT 前態比對（同章且 dim→lit 才演；換章/重整不演）；階02 記 ✕ →
      階03 lit-in＋兩動畫實測
- [x] 站進場＝stageIn（st-in 整組 rise+settle；IO threshold .12、一站一次/session、
      ST_SEEN 檔重繪不重播）——IO 發火＋st-on 掛上實測（隱藏分頁無 render frame
      時 IO 不發火屬瀏覽器行為，實機捲動即發）
- [x] 摺頁開合：開＝wbody paneIn＋列 rowIn 級聯；收＝mini-tks tksin 逐夜回位
      （delay 0/.019/.038s 實測；details 重現盒即重播）
- [x] chips 捲道動量：flow-x snap（x proximity）＋overscroll contain＋mask 邊緣淡出
      ＋fade-l/r 隨捲動點亮實測；滾輪轉橫/觸控動量佈線未動
- [x] 複習評分＝卡片滑出 rvout（--dur-exit 208ms forwards＋pointer-events 鎖；
      動完才 rvMark 落帳；animationend 丟失有 280ms 保險絲；reduced-motion 直接落帳）
      ——測卡注入→pass→滑出中鍵未落帳→動完 history+1→列消失→鍵還原 byte-equal 實測
- [x] 立即同步＝spin-once（#wmSyncNow::before「↻」轉一圈；sync-go 一次性）——
      點擊實測 spinonce running＋syncNow(false) 全鏈路（fetch stub，1 次呼叫，未觸伺服器）
- [x] 平滑稽核：study css 零 layout-prop 動畫（keyframes 掃描僅 barin{width} 屬考古題
      模式跨校長條、.lq top 凝膠與 .vvol width 屬 ADR-0003 凍結件，皆非 study 新件，
      留存註記）；riverflow 為唯一 background-position 例外（1px 窄柱，重繪趨近零）；
      will-change 僅掛連續位移件（spinedrift 載體）；scroll/touchstart passive 照舊
- [x] reduced-motion：tokens 全滅規則凌駕（以等價全滅樣式注入實測「靜止即完成態」
      ——dnum/列/水印全可見、無內容藏在 0% 幀）；.sp-tk.now::after 靜態 fallback 照舊
- [x] 390 硬檢：documentElement.scrollWidth==innerWidth（390==390）；spinedrift 隨脊柱
      塌成的邊條走（left:-64px、寬 44px、#wmSpine clip 收左溢）；白名單稽核同 1280
- [x] 認可配色組合實截：描圖紙×餘燼（1280＋390）、夜湖×松青（1280＋390）——
      調色重繫全光路（dnum glow／燃線／燃點／debt 讀數）皆隨組合正確換色
- [x] console 僅既有 DEV 域 SW 註冊失敗，零新錯誤；localStorage 全 13 鍵測畢
      byte-equal 還原；quiet 檔仍凍結場景 ambient（驗收條款「quiet dial still
      freezes ambient」實測）

## T19 多科天梯（ADR-0008 §T19，2026-09-02 值夜；dev 8797，服役 8795/8796 未動）

> 問題（使用者裁定）：站02 只演「本週第一個未完成章節」，科目宣告序讓它永遠停在
> 電子學——與每日雙軌讀書法（電子 2h＋工數 2h＋0.5h 錯題，docs/sprint-plan.md:80）
> 不符，是 T14 的設計失誤。修法：**本週還有未完成章節的每一科各出一座三階天梯**，
> 依 sprint.json `subjects` 宣告序排列（電子→工數→線代→控制→多益，不寫死清單）。
>
> 驗收環境：桌面 Chrome，主頁 2048 CSS px；1280／390 以同源 iframe 量測
> （`<base>` 灌注、量 documentElement.scrollWidth/clientWidth）。互動測試期間
> `window.FEB_DEV=true` 擋掉 syncSoon，未觸服役伺服器。

- [x] 【新增・T19】一科一座天梯：W2（elec×2／math×1／la×1）實測 **3 座**
      （ldr-elec/bjt-dc、ldr-math/ode-1、ldr-la/la-eigen），各科 lead＝該科本週
      第一個未完成章節；科目序由 `SPRINT_PLAN.subjects` 宣告序推導，非硬編碼
- [x] 【新增・T19】科目區塊＝科目眉標（科名＋「本週 n/N 章 ✓ · 待燒 k」，
      tooltip 給該科本週章時數 Σ 算式）＋主章列（data-lead 原樣）＋自己的 chLadderHTML
- [x] 【新增・T19】chLadderHTML 未改輸出：電子仍走「接著看 · 照影片順序」課序階01、
      工數／線代走章節分組 iStudy 集數（實測 math「ISTUDY 集數 6/6 已離線」）
- [x] 【新增・T19】河道不斷流：流線仍是 `.z-today .stage::after` 一條貫穿整站；
      科目之間**不加框、不加第二條線**，只在流線上點一顆結構色節點
      （`.subj-blk::before`，量測 node 中心 276.5px＝流線 276–277px，正中）
      ＋留白 clamp(34px,6vh,64px)（實測 elec 底 493 → math 頂 545，gap 52px）
- [x] 【新增・T19】水印仍是一站一顆：`#stn2 .seat` 實測 count=1（3 座天梯不增生）
- [x] 【新增・T19】本週待燒不再與 lead 重複：W2 實測只剩 `bjt-ac`（各科第 2 章起）；
      眉標改「本週待燒 ×1 · 各科第 2 章起 · 點列原地展開」；accordion 開合原樣
      （點開 → wm-exp 出現、WM.sel 落地；再點 → 收起、sel 回 null）
- [x] 【新增・T19】脊柱 W2 摺頁：三個 lead 全部改掛「↓ 今夜劇場」路標列（data-thr），
      點列直達站02（原本只有首席科目是路標）——實測 bjt-dc／ode-1／la-eigen 皆 thr
- [x] 【新增・T19】各梯控制件互不干擾：勾 elec 階03 → 只有 bjt-dc 落 done、
      elec 的 lead 換成 bjt-ac，math／la 的 lead 不動；math ✕+1、la ✕+2 各自獨立
      （`feb-sprint-v1.miss = {ode-1:1, la-eigen:2}`），站03 兩列迴流正確
- [x] 【修正・T19】`LADDER_LIT` 單一物件 → `Map(ch.id→{a1,a2})`：三座同時渲染時
      單一前態會被最後一座蓋掉、階解鎖 crossfade 永遠不演。實測 la 階03
      dim → 記 ✕ → `rung lit-in`（elec／math 同批渲染不干擾）
- [x] 【新增・T19】科目跳道（>1 科才出現）：`電子 · 工數 · 線代` mono 髮絲列，
      點擊 → `#ldr-<subj>` scrollIntoView({block:'start',behavior:'smooth'})（spy 實測）；
      捲動時所在科自己亮起（同 st-nav `.on` 判例，實測 math→elec→la 正確換亮）；
      `.hit` 44px 命中、hover/active/focus-visible 三態齊備
- [x] 【不動・T19】鍵盤 1–4 站導航原樣：dispatch '1'..'4' → stn1/stn2/stn3/stn4（spy 實測）
- [x] 【決策・T19】站03 筆記迴流＝**一科一組**（不是只留首席科）：今夜三科，✕ 三科都會
      發生，只留電子學等於工數／線代的錯題本在站03 消失＝能力遺失（判例 12）。
      成本只有 `tonightLeads.map(nblmHTML)`＋`for…nblmEnsure`；眉標加科名區分
      （`筆記迴流 · 工程數學 · NOTEBOOKLM · 更新於 …`），`.nb-flow[data-subj]` 讓 ▸
      吃該科結構色。實測 3 組 6 篇、三本「錯題本」各自預開、6 篇 markdown 補繪成功
- [x] 【不變・T19】今夜配額讀數維持原樣：`sprint.json.budget` 只有 `perDayNeeded:5.0`
      與 `byWeek.days`，**沒有** per-subject 拆分（2h/2h/0.5h 只寫在 docs/sprint-plan.md:80
      這份人讀文件）。依票面「資料不支援就別編數字」原則不動；科目眉標改用
      sprint.json 真有的數（該科本週章數／已完成數／時數 Σ）補上分科讀數
- [x] 【邊界・T19】本週全清空 → 退回第二段軌道：四章全勾後實測 1 座 ctrl 天梯、
      跳道消失（1 科不出現）、本週待燒段消失、站03 只留 ctrl 一組筆記迴流
- [x] 【S5・T19】白名單 loop 稽核（study、vellum）：infinite&&running＝
      {emberpulse×1, riverflow×4, seatbreathe×4, spinedrift×1}——恰為白名單四員，
      T19 零新增無限動畫；場景 ambient（cl×3／drift-a,b,c／fogflow×2／ink-bloom／
      snowfall／twinkle）全 paused。新件無 backdrop-filter
- [x] 【S5・T19】390 硬檢：`documentElement.scrollWidth == clientWidth`（382==382），
      三座天梯＋跳道＋科目眉標皆無橫向溢出；1280 同測（1272==1272）
- [x] 【S5・T19】`_febSelfCheck()` 全過（攔截 console.assert，失敗數＝0）；
      console 零應用層錯誤（僅 chrome-extension content_script 對合成 scroll 事件
      的 `e.target.contains` 例外，非本站程式）
- [x] 【S5・T19】兩配色實截：描圖紙 vellum（1280／390）與夜湖 aurora（1280）——
      科目節點／左脊／天梯站台 tint／巨編號全部隨該科結構色換色，零新色
- [x] 【契約・T19】狀態契約未動：`feb-sprint-v1`／`feb-wm-v1`／`feb-edits-v1` shape
      一位元組不變；新增的只有 DOM 輸出與兩支 UI 暫態（`LADDER_LIT` Map、
      `#ldr-<subj>` 錨點 id），全不落地。測畢 localStorage 10 鍵全還原
      （`feb-edits-v1` 與 `feb-wm-v1` 見下方偏差註記）

> **偏差註記（T19 值夜，誠實記錄）**：測試中途為驗第二段軌道 fallback 而
> `location.reload()`，把存在 `window.__LS0` 的 localStorage 快照沖掉了。其餘 8 鍵
> 全程未被寫入；兩個被寫過的鍵以獨立證據回復：
> ①`feb-edits-v1` → `{}`：dev 伺服器 `progress-dev.json` 在還原後的那次自動 /sync
> 收到並寫下 `edits: {}`，而 `merge_progress()` 對 edits 取兩側聯集（新戳勝），
> 輸出空表 ⇒ 當時本機也是空表。
> ②`feb-wm-v1.sel` → `"bjt-ac"`：1280 iframe 內對本週待燒列的第一次點擊
> （`WM.sel=(WM.sel===id)?null:id`）落地成 `null`，反推點擊前即為 `bjt-ac`。
> 兩者都是 UI 層資料（編輯時戳表、展開中的章節），還原後重整驗證穩定、
> 自動 /sync 未再改動。下次值夜請把快照存進 `sessionStorage` 而非 `window`。
