# functions/ — Feb 的雲端 API（Phase B，Phase E 改寫）

家用媒體伺服器（`serve_media.py`）搬上 Cloudflare Pages 的那一半：
**驗身分、合併進度**。兩支路由，一道守全站的門。

```
functions/
  _middleware.js            **每一個**請求的第一道門：驗 Access JWT 簽章（不只 /api/*）
  api/whoami.js             GET  我是誰、能不能寫
  api/progress.js           GET/POST 跨裝置進度（取代 /sync）
  _lib/access.mjs           JWT 驗章（無外部套件，WebCrypto）
  _lib/merge.mjs            merge_progress() 的逐行移植（T20）
  _lib/progress-store.mjs   文件 ⇄ D1 資料列
  _lib/http.mjs             回應樣板
```

`_lib/` 底下的 `.mjs` **不會**變成路由——`wrangler pages functions build` 產出的
路由表只有三筆（`/api/progress` ×2、`/api/whoami`）加上掛在 `/` 的 middleware。
抽成模組是為了讓 `node --test` 載得進去測。

**Phase E 少了一支路由**：`api/data/[[path]].js`（R2 的出口）與它的白名單
`_lib/data-path.mjs` 一起刪了。使用者裁定不開通 R2，教材改成隨部署上傳的
靜態資產 `/data/**`，見 §4。

---

## 1. 身分：簽章才算數

### 為什麼不看 `Cf-Access-Authenticated-User-Email`

那個標頭是 Access 在代理層加上去的，**只有請求真的經過 Access 時才可信**。
Pages 有不只一條到得了的路（`*.pages.dev` 預覽網址、直接打到 Worker），
只要有一條沒被 Access 蓋住，任何人都能自己送

```
Cf-Access-Authenticated-User-Email: 主人的信箱
```

然後拿走全部的考古題與備考進度。標頭是「宣稱」，簽章才是「證明」。
官方文件（Application token）也把話講死了：
「Validation of the header alone is not sufficient — the JWT and signature
must be confirmed to avoid identity spoofing.」

### 驗哪幾關

憑證來源：`Cf-Access-Jwt-Assertion` 標頭；沒有的話讀 Access 種在本網域的
`CF_Authorization` cookie。兩者是同一張簽過章的票，下面照樣逐關驗。

| # | 關卡 | 不過的話 `code` |
|---|---|---|
| 1 | `alg` 必須是 `RS256`（不接受 `none`、不接受 `HS*`——演算法混淆） | `bad_alg` |
| 2 | 簽章對得上 `${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs` 公布的 JWK | `bad_signature` / `unknown_kid` |
| 3 | `exp` 未過期；`iat`/`nbf` 不在未來（容許 60 秒時鐘誤差） | `expired` / `issued_in_future` |
| 4 | `iss` 等於設定裡的團隊網域（**不是** token 自己寫的那個） | `bad_issuer` |
| 5 | `aud` 含 `ACCESS_AUD`（少了它，同團隊任一應用的票都能開這裡） | `bad_audience` |
| 6 | 有 `email`（服務代幣沒有 email，這是給人用的站） | `no_email` |

公鑰在 isolate 內快取 1 小時；`kid` 對不上時重抓一次（每分鐘至多一次，
免得亂編 kid 就能逼我們一直去打 Access）。

### 守的是整個站，不只 /api/*（Phase E）

R2 移除之後，考古題 PDF、招生簡章、章節分析、筆記快照 292 個檔案是**部署裡的
靜態資產**（`/data/**`）。靜態資產沒有 Function 可以站崗——除非門守的是整個站。
所以 `_middleware.js` 不再有例外清單：**每一個路徑**都要先驗過章，
外殼（`index.html`／css／js／字型）也一樣。

殼層本來是「程式碼、沒有個人資料」所以刻意放行。全鎖的理由不是它變敏感，
而是**少一條要維護的例外**——有例外清單，就有人哪天加了一頁預渲染內容忘了加進去。
（Phase D 的 `_lib/private-pages.mjs`／`PRIVATE_PAGES` 因此一併刪除。）

門攔得到靜態檔的依據是官方文件
（`workers/static-assets/migration-guides/migrate-from-pages/`）：
「Pages would default to serving your Pages Functions ahead of static assets」。
`dist/_routes.json`（`include: ["/*"]`、`exclude: []`）把這件事寫死，不靠預設值。

### 沒設定就全鎖（fail closed）

`ACCESS_AUD`、`ACCESS_TEAM_DOMAIN`、`FEB_OWNER` **任一沒設 → 全站一律 403**，
`code: "access_not_configured"`，訊息用繁體中文說出缺哪幾個。
（2026-09-02 對 `https://feb-6ah.pages.dev` 實測：根目錄、考古題 PDF、`/data/nblm/*.json`、
`/api/progress`、`/api/whoami` 全部 403，沒有轉址、沒有一個 byte 出去。見 `docs/雲端上線.md` §7。）
不預設、不猜、不「先開著等設定好」。

`FEB_OWNER` 沒設也全鎖是刻意的：漏設一項就把每個登入者都當主人，是最貴的那種 bug。

### 沒有 localhost／DEV 後門

`_middleware.js` 與 `_lib/access.mjs` 不看 hostname、不看 `request.cf`、
不看任何 DEV 旗標。後門的問題不是它會不會被用，是它一定會有一天忘了關。

### 環境變數

| 變數 | 哪裡拿 |
|---|---|
| `ACCESS_AUD` | Zero Trust > Access > Applications > feb > Overview 的 **Application Audience (AUD) Tag**（64 位十六進位） |
| `ACCESS_TEAM_DOMAIN` | `https://<your-team-name>.cloudflareaccess.com`（只收 https——公鑰走明文取得等於把整套身分交給中間人） |
| `FEB_OWNER` | 擁有者信箱。只有這個身分能 `POST /api/progress` |

本機開發放 `.dev.vars`（已在 `.gitignore`，範本見 `.dev.vars.example`）；
正式環境設在 Pages 專案的 **Settings > Variables and Secrets**，不要進 repo。

### 角色

驗過章之後，`context.data` 帶著 `email` / `role` / `owner` 交給下游路由。
下游**不再自己判斷身分**，也不准去讀那個 email 標頭。

- `role = 'owner'`：`email === FEB_OWNER`（不分大小寫）。讀寫真實資料。
- `role = 'guest'`：其他任何通過 Access 的身分。**唯讀**——`GET` 讀的是
  **主人的同一塊看板**，`POST` 一律 403。訪客的進度留在他自己裝置的
  localStorage，一個位元組都不入庫。

這是 T12／ADR-0007 裝置模型的鏡射：內容權限不分級（訪客看得到頁面內容），
只隔離寫入。因此 D1 裡永遠只有一份「主人的」資料列——不是省事，是這個模型下
不可能有第二份。將來若真要一人一塊看板，那是 migration 0002 加 `owner` 欄位的事，
不是現在先擺一個永遠等於 `FEB_OWNER` 的欄位假裝有分身。

---

## 2. 端點契約

`/api/*` 的回應都帶 `Cache-Control: private, no-store`（靜態資產另計，見 §4）、
`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、
`Vary: Cookie, Cf-Access-Jwt-Assertion`。
錯誤一律 `{"error": "訊息", "code"?: "…", "detail"?: "…"}`。

### `GET /api/whoami`

```json
{ "email": "you@example.com", "role": "owner", "readonly": false, "isOwner": true }
```

`role` 讓客戶端一開站就知道自己是不是訪客，不必等 `POST` 被打回 403
（08-sync.js 的 `enterReadonly()`）。**不回主人的信箱本身**——訪客沒有知道它的
必要，少一個可以拿去釣魚的個資。

### `GET /api/progress`

回目前這份進度文件，**不合併**（對應 Python 的 `GET /sync`）。
形狀就是 `applyProgress()` 吃的那個：

```json
{
  "watched": { "115春電子01": "2026-09-01" },
  "done":    { "laplace": "2026-08-30" },
  "miss":    { "laplace": 3 },
  "playpos": { "<url>": { "t": 90.5, "dur": 600, "pct": 15, "at": "2026-08-01" } },
  "target":  ["ntu|甲組"],
  "review":  { "cards": [ { "id": "控001", "subject": "ctrl", "page": "12",
                            "createdAt": "2026-08-01",
                            "history": [ { "date": "2026-08-20", "result": "pass" } ] } ] },
  "edits":   { "done:laplace": "2026-09-01T10:00:00.000Z" },
  "updated": "2026-09-01T10:00:00.000Z"
}
```

對應的 localStorage 鍵：`feb-watched-v1` / `feb-sprint-v1`（done＋miss）/
`feb-playpos-v1` / `feb-target-v1` / `feb-review-v1` / `feb-edits-v1`。

型別上有兩處非守不可：

- `miss` 的值**是數字**。客戶端拿它做算術（`SP.miss[id]=Math.max(0,(SP.miss[id]||0)+d)`），
  回字串的話按一下錯題就會變成 `"11"`。D1 存 TEXT，讀回來時還原成數字。
- `review` 卡的 `page` **是字串**。它是 GoodNotes 的頁面標籤，不是拿來算術的數。

`review` 與 `edits` 兩個鍵**沒有內容就不出現**（相容鐵則，T07 立 T20 沿用）。
這不是潔癖：`applyProgress()` 看到 `review:{cards:[]}` 會整包寫回 localStorage，
把裝置上還沒同步上來的卡片洗掉。沒有就不要說話。

### `POST /api/progress`

Body＝`localProgress()` 的 payload（同上形狀）。回**合併後**的完整文件。

| 情況 | 回應 |
|---|---|
| `role = 'guest'` | `403 {"error":"唯讀身分：此裝置的變更不會寫回伺服器","readonly":true}` |
| body 不是 JSON 物件 | `400 {"error":"讀取失敗：…"}` |
| D1 沒綁 | `503` |
| 成功 | `200` 合併後的文件 |

403 的形狀與 Python 版一致，08-sync.js 看到就進唯讀模式、本機照常記錄。
body 先讀完再擋唯讀（keep-alive 的框界不能留半截，與 Python 版同一條理由）。

### 教材沒有端點

Phase E 之後 `/api/data/**` 不存在了。教材是靜態資產 `/data/**`，
由 Pages 的資產層供應，前面站著同一道 `_middleware`。細節見 §4。

---

## 3. 合併語意（T20）與 parity 證據

`_lib/merge.mjs` 是 `serve_media.py` 的 `merge_progress()` **逐行移植**，
不是「等價重寫」。理由：切換期間家用伺服器（Python）與雲端（JS）會同時存在，
兩邊對同一組 payload 必須給同一個答案，否則同步一來一回就互相推翻。

| 欄位 | 有編輯時戳 | 沒有時戳（舊裝置／戳過 90 天） |
|---|---|---|
| `done` / `watched` | 新戳那側決定這鍵**在不在**（含刪除） | 取聯集 |
| `done` / `watched` 的**值** | 兩側都在時仍留**較早**的日期 | 同左 |
| `miss` | 新戳那側的值說了算（5→3、歸零都傳得出去） | 取較大值 |
| `target` | 新戳那側決定在不在 | 取聯集 |
| `playpos` | — | `at` 較新者勝；同日取 `pct` 較大 |
| `review` | — | 卡按 id 聯集；history 按 `(date,result)` 聯集去重、排回時間序；`createdAt` 留最早；`subject`/`page` 留 `updated` 較新那側 |
| `edits` | 逐鍵取較新的一方，寫入時汰除 90 天前的戳 | — |
| 其餘頂層純量 | — | 留 `updated` 較新那邊 |

時戳記的是「什麼時候按下勾勾」，不是「什麼時候讀完這章」——所以它推翻得了
「這鍵在不在」，推翻不了「先看完的那次才是事實」。

移植時另外補上四件 JS 不會自動幫忙的 Python 語意（都在 `merge.mjs` 有測試）：
字串比 code point（不是 UTF-16 code unit）、型別不可比就丟 TypeError、
`int()` 的邊界（`int("3.7")` 是 ValueError 不是 3）、dict 鍵順序即輸出順序。

**證據**：`tests/cloud-merge.test.js` 拿
`tests/fixtures/merge-golden.json`（由 `tests/fixtures/gen-merge-golden.py`
載入服役中的 `serve_media.py` 實跑產生，131 組 a×b）逐位元組比對，
含 1 組「Python 自己丟例外、JS 也必須在同一處丟」。語料全部合成——
真實備考進度不進 repo，個人進度永不公開這條鐵則對測試也一樣。

---

## 4. 資料落地

### D1（`feb-progress`，binding `DB`）

表結構與每欄語意見 `migrations/0001_init.sql`（Phase A 定，本階段沒改結構）。

**墓碑列（tombstone）——schema 沒明講、但 T20 非有不可的一條約定**：
時戳掛在 `progress_entry.stamp` 上（一鍵一列）。但**刪除**的戳沒有列可掛：
取消勾選之後 `done` 裡沒有那個鍵了，那個「我在 11:00 取消的」時戳卻必須活下去，
否則下一次舊裝置抱著舊值上來，聯集就把勾勾復活了（正是 T20 要修的 bug）。

解法是留一列 `value = ''` 的墓碑替時戳站崗：

- `value = ''` → 這鍵已刪除，本列不算一筆進度
- `value ≠ ''` → 正常的一筆

空字串在四個欄位裡都不是合法值（`done`/`watched` 是日期、`miss` 是十進位數字、
`target` 恆為 `'1'`），撞不到真資料。戳過 90 天被合併汰除之後，這列就沒有存在的
理由，下一次整表改寫時自然不再寫出來。

寫入是**整表改寫**，包在一個 `db.batch()` 裡。官方文件明講 batch 就是一個 SQL
transaction——依序執行、任一條失敗整批回滾。半套寫入會讓進度停在「勾勾還在、
錯題已清空」這種說謊的狀態，那比整批失敗糟得多。逐列 diff 只是把同一個結論算兩遍。
繫結參數保守抓每條 statement 100 個，多列 INSERT 依欄位數分塊。

`review_history` 的 `ORDER BY` 必須與合併裡的 `hist.sort()` 一字不差
（`date` → `pass` 在前 → `result`）：排程核心以「尾端連續 pass」推梯級，
**順序就是語意**，排錯不會報錯，只會靜靜排錯複習梯級。

### 教材：Pages 的靜態資產 `/data/**`（Phase E，取代 R2）

使用者裁定**完全不開通 R2**（零計費面：R2 要訂閱、可能要綁卡）。
於是教材改成**隨部署上傳的靜態資產**，路徑就是最單純的 `/data/**`。
支撐這個決定的是實測數字對上官方上限：

| | 我們 | Pages 免費方案上限 |
|---|---|---|
| 檔案數 | **351**（殼層 59 ＋ 教材 292） | 20,000 |
| 單檔最大 | **15.1 MiB**（`data/exams/nsysu/…/115.pdf`） | 25 MiB |
| 總大小 | 177.8 MiB | 頻寬與請求數不限 |

（官方 `pages/platform/limits/`：「up to 20,000 files on the Free plan」、
「The maximum file size for a single Cloudflare Pages site asset is 25 MiB」。）

dist/ 由 `scripts/cloud/build-dist.mjs` 組出來（site/** ＋ 白名單過的 data/**），
冪等、會報檔案數與位元組數，**單檔超過 25 MiB 或出現任何影片副檔名就中止建置**。

#### 白名單搬家了：從執行期搬到建置期

舊架構靠 `keyFromPath()` 在每個請求上做字串比對（桶子裡什麼都有，靠 Function
決定放不放行），所以要擋 `../`、`%2e%2e`、反斜線、大小寫變體、超深路徑。
現在**不在 dist/ 裡的檔案，任何路徑都拿不到**——那些攻擊面整片消失。
剩下的問題只有「哪些檔案上得了雲」，答案寫在 `build-dist.mjs` 的 `ALLOW`：

| 形狀 | 允許副檔名 | 最大段數 |
|---|---|---|
| `data/<name>.json` | `.json` | 1 |
| `data/analysis/…` | `.json` `.txt` | 2 |
| `data/nblm/…` | `.json` | 2 |
| `data/exams/…` | `.pdf` | 5 |
| `data/brochures/…` | `.pdf` `.txt` | 3 |

實測 292/292 全部在白名單內，略過 0 個。

#### 那安全性靠什麼

靠 `_middleware.js` 守全站（§1）。這是這個決定成立的**唯一**前提：
靜態資產本來會繞過驗章直接公開，所以「教材當靜態資產」與「middleware 守全站」
是同一個決定的兩半，拆開就漏。

標頭也只能在 middleware 補——官方文件（`pages/configuration/headers/`）明講
`_headers` **不套用**在 Functions 產生的回應上，而全站都經過 middleware。
補的是：

- `Cache-Control`：PDF `private, max-age=31536000, immutable`（考古題是歷史檔案，
  放上去就不再變）；其餘 `private, no-cache`。
  **兩者都必須 `private`**——這些 byte 只屬於當下這個登入身分。
- `X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、
  `X-Robots-Tag: noindex, nofollow`、`Vary: Cookie, Cf-Access-Jwt-Assertion`

Range／ETag／`304` 交給 Pages 的資產層原生處理，不再自己算 `Content-Range`。
`Content-Type` 也由資產層依副檔名決定——副檔名已經被 `ALLOW` 框死。

---

## 5. 本機怎麼驗

```bash
# 1. 本機 D1 建表（Pages 的本機開發需要 wrangler.jsonc 裡的 preview_database_id）
npx wrangler d1 migrations apply feb-progress --local

# 2. 組出 dist/（site/ ＋ data/ 的複製，冪等；--dry-run 只盤點）
node scripts/cloud/build-dist.mjs

# 3. 起站。--compatibility-date 是暫時的：wrangler 4.127.1 內附的 workerd
#    還不吃 wrangler.jsonc 裡的 2026-09-02，本機跑才需要往前推，設定檔不要改
npx wrangler pages dev --port 8792 --compatibility-date=2026-08-01

# 4. 測試（73 項）
node --test "tests/*.test.js"
```

雲端測試三支：
`cloud-merge.test.js`（與 Python 的 parity）、
`cloud-access.test.js`（本機生 RSA 金鑰＋假 JWKS，驗 19 種偽造與設定缺漏）、
`cloud-progress-d1.test.js`（`node:sqlite` 跑真的 SQL，驗交易與 ORDER BY）。

Phase E 刪掉兩支（`cloud-data-path.test.js`、`cloud-private-pages.test.js`，共 7 項）。
**這不是覆蓋率退步，是被測的東西沒了**：前者測的白名單搬到建置期
（不在 dist/ 就不存在，沒有路徑穿越可談），後者測的 `PRIVATE_PAGES` 例外清單
在「全站都守」之後整份消失。build-dist 的白名單由它自己的盤點報表驗
（`--dry-run` 會印出略過了哪些檔案，實測略過 0 個）。

**Access 模擬不了**（本機沒有真的 Access 代理），所以本機能驗的是
「沒有簽得對的票進不來」這一半；「有票的人進得來」由 `cloud-access.test.js`
用本機金鑰在 node 裡驗完。實測結果見專案回報。

---

## 6. 未竟事項

1. ~~**⚠ 靜態站台目前是公開的。**~~ ~~Phase D 補的 `PRIVATE_PAGES` 第二層。~~
   **Phase E 起沒有例外清單了（2026-09-02）**：`_middleware.js` 守**每一個**路徑，
   殼層也一起鎖（理由見 §1「守的是整個站」），`_lib/private-pages.mjs` 已刪除。
   2026-09-02 部署後對線上網址匿名實測：根目錄、`index.html`、考古題 PDF、招生簡章、
   `/data/nblm/*.json`、兩張作戰地圖、`/css/*`、`/api/progress`、`/api/whoami`
   （含偽造 `Cf-Access-Authenticated-User-Email`）全部 403，無轉址、無內容外洩；
   正式網址與部署別名兩種主機名皆同。逐項紀錄見 `docs/雲端上線.md` §6。

   **這不取代 Access。**正解仍是**整個 pages.dev 專案被同一個 Access 應用蓋住**
   （Zero Trust > Access controls > Applications，Self-hosted，網域填
   `feb-6ah.pages.dev` 與 `*.feb-6ah.pages.dev`；步驟見 `docs/雲端上線.md`）。
   兩層的分工：Access 擋在邊緣、請求根本到不了我們的程式碼；middleware 是 repo 裡的後盾，
   Dashboard 設定還沒做、或日後被誰刪掉時，全站立刻回到「誰都不給」。
2. ~~**R2 桶 `feb-archive` 還沒建**~~ **Phase E 已整個移除 R2（2026-09-02）**：
   使用者裁定不開通 R2。`wrangler.jsonc` 的 `r2_buckets` 拿掉了，
   `api/data/[[path]].js`、`_lib/data-path.mjs`、`scripts/cloud/r2-upload.mjs` 都刪了。
   教材改走 `/data/**`（見 §4），部署因此不再依賴任何帳號層級的訂閱。
   **代價要講清楚**：教材與程式碼綁在同一個部署裡，改一份 PDF 就要重跑
   `build-dist` ＋ `pages deploy`（178 MB，實測上傳約 4.3 分鐘；
   wrangler 會跳過已上傳過的檔案，只補新的）。
3. ~~客戶端還沒改線。~~ **Phase C 已改線（2026-09-02）**：`site/js/05-media.js`
   把既有的 `SAME_ORIGIN_MEDIA` 擴成 `FEB_MODE = local | cloud | static`，
   資料一律走 `dataURL(path)`（本機 `../data/*`／雲端 `/api/data/*`），
   進度走 `SYNC_URL`（`/sync`／`/api/progress`），身分列讀 `/api/whoami`。
   同一份 `site/` 不分家，兩邊都跑得起來。

   雲端模式的誠實退化：**影片不上雲**，所以 `loadLocal()` 直接收攤（不探測、
   不開那個每 4 秒重試的 `mediaWatch`），集數 chip 照樣列出來，點下去開的是
   隨播面板（VLC 交接）而不是播放器。

   Service Worker 這邊多守一條：`/api/data/**` 進 DATA 快取（與 `../data/*` 同一批教材、
   同一套策略），`/api/progress` 與 `/api/whoami` **永不進快取**。
   而且收進快取前要過 `cacheable()`——登入階段過期時 Access 會回 302 導去登入頁
   （官方文件 `cloudflare-one/access-controls/applications/http-apps/managed-oauth`：
   非瀏覽器用戶端「receive a `302` redirect with no usable token」），
   `fetch` 跟著跳完拿回來的是一個 `res.ok` 為真的 HTML 登入頁。
   照收的話 `schools.json` 在離線快取裡會變成一份登入頁，活到下次連上為止。
   判準：`res.redirected` 為真不收、`content-type` 是 HTML 不收；
   `prefetch` 也因此不能再用 `cache.add()`（它只看 `res.ok`）。
4. **並行寫入是 last-write-wins。**讀→合併→寫不是一個原子操作
   （寫入本身是單一 transaction，但讀在它之前）。兩台裝置同一瞬間 POST，
   後到的會蓋掉前一次的合併結果。這與現行 Python 伺服器完全相同
   （`do_POST` 也沒有跨請求的鎖），而且會自癒：客戶端每次都上傳整份
   localStorage，下一次同步就把掉的那筆帶回來。真要修的話正解是 D1 的條件更新。
5. **`compatibility_date` 是未來日期。**`wrangler.jsonc` 寫 `2026-09-02`，
   wrangler 4.127.1 內附的 workerd 不吃，本機跑要用 `--compatibility-date` 覆蓋。
   雲端沒有這個問題（Cloudflare 的 runtime 認得），設定檔照 Phase A 留著。

---

## 7. Drive 影片權杖（服務帳戶）

雲端模式的影片住在 Google Drive 的「Feb 影片備份」資料夾，前端 `site/js/14-drive.js`
讓影片回到 Feb 自己的 `<video>`：Service Worker 攔下 `/drive/<fileId>`，帶
`Authorization: Bearer <token>` 直打 `googleapis.com`，**位元組 Google → 裝置直送，
Cloudflare 一個請求都不算**（理由見 14-drive.js 檔頭）。這一節只換掉「token 從哪裡來」。

### 為什麼從 GIS 換成服務帳戶

原本前端用 Google Identity Services 的 Token model 自己要 access token，一小時到期。
iPad Safari 的靜默續期**必失敗**（ITP 擋第三方 cookie），於是每小時都要人工重新授權一次，
看兩堂課就要被打斷兩次。改法：把那個資料夾分享給一個**服務帳戶**（唯讀），
服務帳戶的 JSON 金鑰只放 Pages 的 secret `GOOGLE_SA_KEY`；後端拿金鑰簽 JWT（RS256）
向 Google 換一小時的 access token 回給前端。使用者不再需要任何 Google 登入畫面。

```
functions/
  api/drive/token.js        POST 主人取權杖
  api/drive/status.js       GET  設好了嗎、我是主人嗎
  _lib/drive-sa.mjs         解析金鑰、簽 JWT、換 token、三層快取（記憶體 → D1 → Google）
migrations/0002_drive_token.sql   跨 isolate 共用的 token 快取表
```

### 端點契約（與 14-drive.js 的協定）

**`POST /api/drive/token`** → `200 { "token": "ya29.…", "exp": 1789000000000, "scope": "https://www.googleapis.com/auth/drive.readonly" }`

`exp` 是 Unix **毫秒**，與 `DRIVE.exp`／`Date.now()` 同單位。三道門依序：

| 情況 | 回應 |
|---|---|
| `Sec-Fetch-Site` 存在且不是 `same-origin`／`none` | `403 {"error":"跨站請求","code":"cross_site"}` |
| `role ≠ 'owner'` | `403 {"error":"只有主人能取得影片權杖","code":"owner_only"}` |
| `GOOGLE_SA_KEY` 沒設 | `501 {"error":"尚未設定服務帳戶","code":"sa_not_configured"}` |
| 金鑰 JSON 缺欄位／PEM 壞掉 | `501 {"error":"服務帳戶金鑰格式不正確","code":"sa_key_invalid","detail":"缺什麼"}` |
| Google 拒發／連不上 | `502 {"error":"向 Google 取得影片權杖失敗","code":"google_token_failed" \| "google_unreachable","detail":"Google 回應 HTTP 400：invalid_grant"}` |

501 與 502 的分野是給前端決定**要不要重試**：501 是設定問題，重試一百次也不會好，
該提示主人去檢查 secret；502 是 Google 那邊暫時失敗，稍後再試。

**`GET /api/drive/status`** → `200 { "configured": true, "owner": true }`

訪客也拿得到（只有兩個布林，不含 token、不含服務帳戶信箱）——跟 `/api/whoami` 回 `role`
同一條理由：讓客戶端一開站就知道要不要顯示 Drive 功能，不必靠被打回 403 來認識自己。
`configured` 為假就整個收起（跟 14-drive.js「client_id 空就一個按鈕都不出現」同一個心智模型）。

### 為什麼 owner-only、為什麼 no-store

這張 token 等於「一小時內讀得到整個影片備份資料夾」的鑰匙。訪客可以看唯讀看板，
但 Drive 的內容不在 T12／ADR-0007「內容權限不分級」的範圍——那是使用者自己的雲端硬碟。
`Sec-Fetch-Site` 那道門擋的是跨站頁面借瀏覽器的 cookie 打這支 POST 把鑰匙搬走；
cookie 的 `SameSite` 是第一層，這是不靠 cookie 屬性的第二層（標頭不存在時放行，
舊 Safari 不送 Fetch Metadata，不能因此把 iPad 鎖在外面）。

回應只用 `_lib/http.mjs` 的 `json()`，它已帶 `Cache-Control: private, no-store`：
token 一個 byte 都不准留在任何快取。錯誤回應只放 `code` 與 Google 的 HTTP 狀態碼、
白名單過的 OAuth 錯誤碼；私鑰、assertion、access token 一律不進 body，
`drive-sa.mjs` 的 `SaError` 訊息也守同一條（解析失敗只說缺哪個欄位，
**不**把 `JSON.parse` 的原始訊息接進去——V8 的 JSON 錯誤訊息會引用一段原文）。

### 快取三層與 migration 0002

簽一張＝一次 RSA 簽章＋一次對 Google 的往返，而 token 活一小時，所以：

1. **記憶體**（模組層，同一 isolate）：併發呼叫單飛，兩個請求同時進來也只簽一張。
2. **D1 `drive_token`**（跨 isolate）：Pages 的 isolate 隨時被回收、又可能同時有好幾個，
   沒有這層每個新醒來的 isolate 都會再簽一張。**不能借住 `meta` 表**——
   `progress-store.mjs` 的 `writeDoc()` 是整表改寫（`DELETE FROM meta`），
   任何借住的鍵都會在下一次同步時被洗掉。表還沒建、DB 沒綁都不是錯，退回只用記憶體。
3. **Google**：上面兩層都剩不到 5 分鐘才真的去簽（前端 `driveSignedIn()` 要求
   `exp` 距現在 > 30 秒，回一張只剩幾秒的等於沒回）。

### 設定步驟（值絕不進 repo）

```bash
# 1. Google Cloud Console：建服務帳戶 → 建 JSON 金鑰下載；
#    Drive 上把「Feb 影片備份」資料夾分享給該服務帳戶的信箱（檢視者即可）。

# 2. 整份 JSON 餵進 Pages 的 secret（本機 .dev.vars 也是放整份 JSON 字串）
npx wrangler pages secret put GOOGLE_SA_KEY --project-name feb < 金鑰檔路徑

# 3. 套 D1 migration（表不存在時功能照常，只是每個 isolate 各簽各的）
npx wrangler d1 migrations apply feb-progress --remote     # 本機：--local
```

金鑰檔下載後放進 secret 就可以刪掉本機副本；`.dev.vars` 已在 `.gitignore`。
金鑰外流的處置是到 Cloud Console 撤銷那把金鑰、重建一把、再 `secret put` 一次。

測試：`tests/drive-sa.test.js`（23 項）本機生 RSA 金鑰假裝服務帳戶、假 Google 端點用
對應公鑰驗章、`node:sqlite` 套 0001＋0002 跑真的 SQL，並反覆斷言錯誤回應不含私鑰與 assertion。

---

## 8. 查證過的官方文件

- **Access JWT 驗證**：header `Cf-Access-Jwt-Assertion`、公鑰在
  `${TEAM_DOMAIN}/cdn-cgi/access/certs`、`POLICY_AUD`/AUD tag 的用法
  — `changelog/post/2025-10-03-one-click-access-for-workers/`
- **JWT 結構與「光驗標頭不夠」**：`alg: RS256`、`kid`、payload 的
  `aud`/`email`/`exp`/`iat`/`iss`/`type`
  — `cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/`
- **用 self-hosted application 保護某個主機名／路徑**
  — `workers/configuration/cloudflare-access/`
- **D1 `batch()` 是 SQL transaction，任一條失敗整批回滾**
  — `d1/worker-api/d1-database/#batch`
- **Pages 的 D1／R2 binding 與本機開發需要 `preview_database_id`**
  — `pages/functions/bindings/`、`d1/best-practices/local-development/`
- **R2 `get(key, {range, onlyIf})`、`httpEtag`、`R2Range`**
  — `r2/api/workers/workers-api-usage/`、`r2/api/workers/workers-api-reference/`

（實作沒有用 `jose`：本專案零建置、零依賴，RS256 驗章直接走 WebCrypto 的
`crypto.subtle.importKey('jwk', …)` ＋ `verify`，`wrangler pages dev` 不必先 npm install。）
