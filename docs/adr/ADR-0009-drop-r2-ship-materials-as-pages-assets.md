# ADR-0009 不用 R2：教材當 Pages 靜態資產，門改守全站

日期：2026-09-02　狀態：已決（Phase E）

## 脈絡

Phase A–D 的雲端架構把教材（考古題 PDF、招生簡章、章節分析、筆記快照）放在
R2 桶 `feb-archive`，由 `/api/data/**` 那支 Function 代取，`_middleware.js` 只守 `/api/*`
（外加一份 `PRIVATE_PAGES` 例外清單補守兩張預渲染的作戰地圖）。

卡在第一步：**R2 是要訂閱才會出現的產品**（`wrangler r2 bucket list` 回 code 10042），
訂閱要同意條款、可能要綁付款方式。使用者裁定：**完全不開通 R2，零計費面。**

## 決策

1. **R2 整條路徑從程式碼刪除**，不是留著先不用：`wrangler.jsonc` 的 `r2_buckets`、
   `functions/api/data/[[path]].js`、`functions/_lib/data-path.mjs`、
   `scripts/cloud/r2-upload.mjs`、`tests/cloud-data-path.test.js` 全部移除。
2. **教材改成隨部署上傳的 Pages 靜態資產**，網址 `/data/**`。
   `scripts/cloud/build-dist.mjs` 把 `site/**` ＋ 白名單過的 `data/**` 組成 `dist/`，
   `pages_build_output_dir` 指向它。
3. **`_middleware.js` 改守整個站**，沒有例外清單——`/`、CSS、字型、每一份教材都要先驗過章。
   `dist/_routes.json`（`include:["/*"]`、`exclude:[]`）把「先跑 Functions」寫死。
   `_lib/private-pages.mjs`／`PRIVATE_PAGES` 一併刪除。
4. 客戶端 `dataURL()` 的雲端分支從 `/api/data/` 改成 `/data/`（`site/js/05-media.js`）；
   SW 的 DATA 快取跟著改路徑前綴。

### 支撐數字（實測對官方上限）

| | 我們 | Pages 免費方案 |
|---|---|---|
| 檔案數 | 351（殼 59 ＋ 教材 292） | 20,000 |
| 單檔最大 | 15.1 MiB | 25 MiB |
| 總大小 | 177.8 MiB | 頻寬／請求數不限 |

官方 `pages/platform/limits/`：「up to 20,000 files on the Free plan」、
「The maximum file size for a single Cloudflare Pages site asset is 25 MiB」。

## 為什麼 3 不是可選的

靜態資產本來會**繞過** Function 直接公開。所以「教材當靜態資產」與「middleware 守全站」
是同一個決定的兩半，拆開就漏一整包個人教材。
可行的依據是官方文件 `workers/static-assets/migration-guides/migrate-from-pages/`：
「Pages would default to serving your Pages Functions ahead of static assets」。

殼層一起鎖的理由不是它變敏感，而是**少一條要維護的例外**：
有例外清單，就有人哪天加了一頁預渲染內容忘了加進去。全鎖沒有這個失效模式。

## 代價

- 教材與程式碼綁在同一個部署：改一份 PDF 要重跑 `build-dist` ＋ `pages deploy`
  （首次 178 MB／約 4 分鐘；之後 wrangler 跳過已上傳的檔案，實測 0.51 秒）
- 每一個靜態檔都算一次 Pages Functions 請求（走 Workers Free 的每日 10 萬次額度）。
  以本專案用量差三個數量級，且超過是回 Error 1027 而不是計費。

## 換來的

- **帳號上沒有任何會計費的產品**：不必訂閱、不必綁卡。超量的失效模式一律是「壞掉等重置」。
- **路徑穿越攻擊面整片消失**：白名單從執行期（字串比對擋 `../`、`%2e%2e`、大小寫變體）
  搬到建置期——不在 `dist/` 裡的檔案，任何路徑都拿不到。
- **Access 沒設好時是全鎖而不是半開**：2026-09-02 部署後匿名實測，
  根目錄／考古題 PDF／招生簡章／`nblm` 筆記／兩張地圖／CSS／`/api/*` 全部 403，
  無轉址、無內容外洩，正式網址與部署別名皆同。

## 排除

`tests/cloud-data-path.test.js`（7 項）與 `tests/cloud-private-pages.test.js` 刪除。
這不是覆蓋率退步，是**被測的東西沒了**：前者測的白名單搬到建置期，
後者測的例外清單在「全站都守」之後整份消失。
build-dist 的白名單由它自己的 `--dry-run` 盤點報表驗（實測略過 0 個檔案）。
