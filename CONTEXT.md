# Feb2 — 領域詞彙與現況地圖

Feb 是一套**個人備考作業系統**：目標 2027-02-01 研究所筆試（116 學年電機控制組，八校超集規劃）。
feb2 是它的重設計副本；原版在 `Desktop\claude\grad-exam-hub`，重設計期間繼續服役，兩邊互不干擾。

## 詞彙表

| 詞 | 意義 |
|---|---|
| **三模式** | `body[data-mode]` = `home`（待機時鐘）/ `exam`（考古題情報中心）/ `study`（讀書工作台）。CSS 依 mode 顯隱區塊，無 URL 路由 |
| **工作台 / WM** | 讀書模式主畫面：衝刺看板主從式版面（左欄章節、右欄該章材料），狀態存 `feb-wm-v1` |
| **衝刺 / SP** | `data/sprint.json` 定義的 24 天計畫（118.8h），完成/錯題存 `feb-sprint-v1` |
| **作戰地圖** | `site/la-map.html`（線代 7 章）與 `site/me-map.html`（工數 9 章），各 ~2MB、99% 為預渲染內容。由 `scripts/la-map/`、`scripts/me-map/` 的 build 管線產生，模板兩份 byte-identical：`scripts/la-map/la_template.html` 與 `scripts/me-map/la_template.html`（T09 統一） |
| **思考地圖** | 影片旁掛的 `.notes.json`（AI 從逐字稿重構的觀念筆記），播放器右欄渲染（marked＋KaTeX＋mermaid，vendor/ 懶載入） |
| **隨播面板** | iPad 離線時的退路：VLC 檔名一鍵複製＋章節時間戳。「影片交給 VLC，網站負責交接與教材」 |
| **L3 直連** | Drive 影片串進 Feb 自己的播放器：`/drive/<fileId>` 是同源虛擬路徑，`site/sw.js` 的 `driveServe` 攔下來、帶 Bearer 權杖去 `googleapis.com` 取，把 Range 原樣轉手、回 206。帳本 `data/drive-map.json`。權杖來源（ADR-0011）：主線是後端服務帳戶 `POST /api/drive/token`（`functions/api/drive/`，一小時自動續換）；退路才是 `data/drive-client.json` 的 `client_id`（GIS Token model，iPad 每小時要手動重連）。iPad 走 MSE（ADR-0010），取片管線並行預取（ADR-0012）。客戶端在 `site/js/14-drive.js` |
| **FEB_MODE** | 同一份 `site/` 的三種執行環境（`05-media.js`，Phase C）：`local`＝媒體伺服器發的（8795/8796/8797/8798，影片＋`/sync`＋`../data/*`）；`cloud`＝`*.pages.dev` 發的（`/data/**`＋`/api/progress`，**影片不上雲**，播放器退化成隨播面板）；`static`＝其餘（8643／`file://`／`wrangler pages dev`，不自動同步）。資料路徑一律走 `dataURL(path)`。覆寫：`?febmode=…`（只給驗證，不是安全邊界） |
| **媒體伺服器** | 家用電腦上的 `feb-media-server.vbs`，http 8795 / https 8796（自簽憑證，iOS SW 必須 https）。提供 state.json / manifest.json / search_index.json / `/sync` / `/log` |
| **離線備妥** | SW 自動預抓教材（~100MB：筆記/字幕/快照/KaTeX 字型/分析），三態狀態燈；86GB 影片永不進快取 |
| **/sync** | 跨裝置進度合併：watched/done/miss/playpos/target 逐欄位合併（聯集/取大/取新），開站 1.5s 後自動觸發 |
| **rlog** | iPad 無 devtools 的遠端診斷：錯誤與麵包屑 sendBeacon 回電腦 `/log` |
| **今日複習** | 本輪新模組：間隔重複排程數位化（+3/+14/+28、距考壓縮、失敗重設、晚了不補），卡號對 GoodNotes 頁碼，手寫練習留紙本 |
| **fading 三階** | 讀書法核心：範例手算 → 半完成題 → 考古題自解；規則見 `docs/study-rules.html`（印刷品，不動） |

## 硬體與環境（設計時不可忘）

- 家用桌機**無網際網路**（只有 iPhone 熱點 172.20.10.x）；`python -m http.server` 就是全部後端
- iPad 是主要外出裝置，**只剩 ~3GB**，Safari PWA + Split View（左 VLC 右 Feb）
- 86GB 課程影片在外接硬碟（F 槽 `istudy-backup`），`media/` junction 指向它
- 離線是硬需求；觸控裝置全域關 backdrop-filter（效能）

## localStorage 鍵（/sync 與遷移的契約）

`feb-theme` `feb-bg` `feb-set` `feb-geo` `feb-sprint-v1` `feb-wm-v1` `feb-target-v1`
`feb-watched-v1` `feb-playpos-v1` `feb-disk-last` `feb-todo-open` `feb-breadcrumb`
（`feb-skin` 隨 !Boring 刪除退役；今日複習新增 `feb-review-v1`；
L3 新增 `feb-drive-ok`＝「這台裝置連過 Google 雲端硬碟」的布林旗標（只在 GIS 退路有意義）；
`feb-drive-tok`＝存取權杖 `{t, e}`，帶到期時間、最多活一小時（2026-09-04 起進 localStorage，取捨見 14-drive.js）；
`feb-drive-nosw`＝這台裝置的 `<video>` 繞過 SW（iPad 實證）；`feb-mse-debug`＝串流診斷面板開關（`?febdiag=1`）。權杖永不進網址列）

`feb-edits-v1`（T20）＝per-key 編輯時戳，一張平的表
`{"done:章id":ISO,"watched:代號":ISO,"miss:章id":ISO,"target:系所組":ISO}`。
設定與**取消**都記；隨 /sync payload 的 `edits` 欄位上下，伺服器 `merge_progress()`
比兩側時戳決定每個鍵在不在（新的一方勝，含刪除），沒戳的鍵退回原本的聯集／取大。
存在獨立的兄弟鍵而不是塞進 `feb-sprint-v1`／`feb-watched-v1`／`feb-target-v1`：
後兩者是裸 map 與裸陣列，多一個欄位會被既有讀者（`watchMap()` 的 Object.keys、
`new Set(陣列)`）與伺服器聯集當成一筆真資料。寫入時汰除 90 天前的戳。

**開發期紀律**：feb2 在 DEV 模式下自動 /sync 關閉（ADR-0005）；對真伺服器測試走第二實例 8797/8798。

## 資料流

`data/schools.json`（八校招生）→ 總覽表/詳情/反向選校；`data/exam-index.json`（216 筆）→ 考古題連結；
`data/analysis/*.json`（21 份 NotebookLM 章節熱度）→ 熱度表/十年考點；`data/sprint.json` → 看板；
`data/videos.json` → 自動控制 YT 課表；媒體伺服器 → 影片/字幕/筆記/搜尋索引。

## 雲端（Cloudflare Pages，Phase A–E）

同一份 `site/` 三種執行環境（`FEB_MODE`，見詞彙表）。雲端那一種長這樣：

| 東西 | 名字 | 裝什麼 |
|---|---|---|
| Pages 專案 | `feb` → `feb-6ah.pages.dev` | `dist/`＝`site/` 的殼 ＋ `data/` 的教材（351 檔／177.8 MiB）＋ `functions/` 的兩支路由 |
| D1 | `feb-progress`（binding `DB`） | 進度。progress.json 的關聯式化，結構見 `migrations/0001_init.sql` |
| ~~R2~~ | — | **Phase E 整個移除**（使用者裁定不開通，零計費面）。教材改成隨部署上傳的靜態資產 `/data/**` |
| 身分 | Cloudflare Access（Zero Trust） | 一人一信箱，One-time PIN，不註冊不設密碼 |

**影片永不進 Cloudflare**（86GB 在外接硬碟；`build-dist.mjs` 看到影片副檔名直接中止建置）。
雲端模式的退路有兩層：備份到 **Google Drive** 的那幾集走 **L3**——`<video src="/drive/<fileId>">`
由 Service Worker 攔下、直接跟 Google 要（位元組 Google → 裝置，Cloudflare 一個請求都不算），
所以章節、2 倍速、續播記憶全部照舊；沒備份到 Drive 的仍退化成隨播面板（VLC 交接）。
開關是「有沒有任何權杖來源」（`driveEnabled()`）：後端服務帳戶設好（`GET /api/drive/status` 回 configured＋owner）
或 `data/drive-client.json` 有 `client_id`，**兩者都沒有就整個功能不存在**。詳見 `docs/影片上雲.md` §10–§12、ADR-0011、ADR-0012。

### 端點

| 端點 | 取代誰 | 行為 |
|---|---|---|
| `GET /api/whoami` | — | 回 `{email, role, readonly, isOwner}`。`role` 決定要不要進唯讀狀態列 |
| `GET/POST /api/progress` | 媒體伺服器的 `/sync` | 合併語意與 `serve_media.py` 的 `merge_progress()` 逐位元組相同（`tests/cloud-merge.test.js` 用 Python 黃金檔證明） |
| `GET /data/**` | `../data/*` | **不是路由**，是 Pages 的靜態資產（Phase E 取代 `/api/data/**` ＋ R2）。上得了雲的白名單搬到建置期，在 `scripts/cloud/build-dist.mjs` 的 `ALLOW` |

### 三條鐵則

1. **門守整個站**：`_middleware.js` 沒有例外清單——`/`、CSS、字型、`/data/**` 的每一份教材
   都要先驗過章。教材當靜態資產與 middleware 守全站是同一個決定的兩半，拆開就漏。
   `dist/_routes.json`（`include:["/*"]`、`exclude:[]`）把「先跑 Functions」寫死。
2. **簽章才算數**：`_middleware.js` 驗 Access JWT 的 RS256 簽章、`exp`/`iss`/`aud`/`email`，
   **不看** `Cf-Access-Authenticated-User-Email`（那個標頭可鍛造）。
3. **沒設定就全鎖**：`ACCESS_AUD`／`ACCESS_TEAM_DOMAIN`／`FEB_OWNER` 任一沒設 → **全站**一律 403。
   沒有 localhost 後門、沒有 DEV 旗標。

Phase D 的 `_lib/private-pages.mjs`／`PRIVATE_PAGES` 例外清單因此刪除——
全站都守之後，「新增預渲染內容要記得加進清單」這個失效模式不存在了。

### 角色

`role='owner'`（`email === FEB_OWNER`）讀寫；其餘通過 Access 的身分是 `guest`，
**唯讀**：看得到主人的同一塊看板，`POST` 一律 403，進度只留在自己裝置的 localStorage。
所以 D1 裡永遠只有一份資料列。鏡射 T12／ADR-0007 的裝置模型。

### 現況（2026-09-02，Phase E 部署完成）

D1 已建表並灌入真實進度（32 entry／34 playpos／updated 2026-09-01T16:46:29.491Z）。
**站已部署**（`https://feb-6ah.pages.dev`，351 靜態資產／177.8 MiB），
**且全站 fail-closed 403**：匿名實測根目錄、考古題 PDF、招生簡章、`/data/nblm/*.json`、
兩張作戰地圖、CSS、`/api/progress`、`/api/whoami`（含偽造 email 標頭）全部 403，
無轉址、無內容外洩；正式網址與部署別名兩種主機名皆同。
**Access 應用與三個環境變數仍待使用者在 Dashboard 設定**，設好之前連本人也進不去。
上線步驟、Dashboard 點擊路徑、回退與免費額度天花板見 `docs/雲端上線.md`。
搬遷／建置腳本在 `scripts/cloud/`（`build-dist.mjs`／`d1-import-progress.mjs`）。

## 決策紀錄

見 `docs/adr/`。規格與票見 `.scratch/redesign/`。
