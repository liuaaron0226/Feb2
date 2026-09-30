# Feb — 個人研究所備考系統

Feb 是一套為單一考生打造的**備考作業系統**，目標是 2027-02 的研究所筆試
（電機控制組，八校超集規劃）。它把課程影片、字幕、AI 重構的觀念筆記、各校考古題分析、
衝刺計畫和間隔複習，收進同一個離線可用的網站；家裡電腦、外出的 iPad 都能用。

這個資料夾（feb2）是 Feb 的重設計版本，已經轉正為正式版。

> **這是公開版 repo。** 程式碼、測試、設計文件完整公開；課程影片、由影片衍生的教材
> 與個人資料**不在這裡**，詳見[公開版不含什麼](#公開版不含什麼)。

---

## 它長什麼樣

同一份 `site/` 前端有三個模式（`body[data-mode]`）：

| 模式 | 內容 |
|---|---|
| **待機** `home` | 時鐘與倒數 |
| **考古題情報** `exam` | 八校招生總覽、十年考古題連結、NotebookLM 章節熱度表 |
| **讀書工作台** `study` | 衝刺看板（左欄章節、右欄材料）、影片播放器＋字幕＋思考地圖、今日複習 |

前端是**零建置**的原生 JavaScript（ADR-0001）：沒有框架、沒有打包，
`site/js/` 的各模組由 `site/index.html` 以固定順序的 `<script>` 載入（`11-boot.js` 最後）。

同一份 `site/` 跑在三種環境（`FEB_MODE`）：

| 環境 | 由誰供應 | 能做什麼 |
|---|---|---|
| `local` | 家用電腦的媒體伺服器（8795／8796） | 影片、字幕、筆記、跨裝置進度同步 |
| `cloud` | Cloudflare Pages（`*.pages.dev`） | 教材與進度（D1）；影片走 Google Drive 直連，Cloudflare 不經手 |
| `static` | `python -m http.server`、`file://` | 只看介面，不同步 |

雲端站**全站 fail-closed**：`functions/_middleware.js` 守住每一個路徑，
沒通過 Cloudflare Access 或通行碼驗證的請求一律 403，沒有例外清單。

## 專案結構

```
site/          前端（PWA、Service Worker、vendor/ 放 KaTeX／mermaid／marked）
functions/     Cloudflare Pages Functions：全站驗證、/api/progress、/api/whoami、/api/drive/*
migrations/    D1 資料表（進度、Drive 權杖快取）
data/          招生、考古題索引、衝刺計畫、NotebookLM 考題分析
tools/         自動生成字幕、思考地圖（處理外接硬碟上的影片）
scripts/       資料管線：考題分析、Drive 上傳、作戰地圖、雲端建置、排程 bat
tests/         node:test 測試
docs/          使用與維運文件、docs/adr/ 決策紀錄（ADR-0001～0012）
.scratch/      規格與工作票
CONTEXT.md     領域詞彙表與現況地圖（先讀這份）
```

## 工具一覽

| 工具 | 做什麼 | 入口 | 說明 |
|---|---|---|---|
| **自動生成字幕** | 本機 GPU 跑 Whisper，替課程影片產生繁中 `.vtt` | `補字幕與筆記.bat` | [docs/工具/自動生成字幕.md](docs/工具/自動生成字幕.md) |
| **思考地圖** | `claude -p` 讀逐字稿，把章節重新教一次，產出 `.notes.json` | `補字幕與筆記.bat`、`scripts/補思考地圖.bat` | [docs/工具/思考地圖.md](docs/工具/思考地圖.md) |
| **考題分析** | NotebookLM 分析各校十年考古題的章節熱度 | `run_analysis.bat`、`run_redo.bat` | [docs/工具/考題分析.md](docs/工具/考題分析.md) |
| **作戰地圖** | 把整科的思考地圖重組成單頁複習地圖（線代、工數） | `python scripts/la-map/la_build.py` 等 | [scripts/la-map/README.md](scripts/la-map/README.md)、[scripts/me-map/README.md](scripts/me-map/README.md) |
| **影片上雲** | 影片備份到 Google Drive，iPad 用 MSE 串流 | `python scripts/drive-upload.py` | [docs/影片上雲.md](docs/影片上雲.md) |
| **週日教材保鮮** | 排程：字幕 → 思考地圖 → NotebookLM 筆記迴流 | `scripts/週日保鮮.bat`（工作排程器） | [docs/自動化.md](docs/自動化.md) |
| **雲端部署** | 把 `site/`＋`data/` 組成 `dist/` 部署到 Pages | `npm run deploy` | [docs/雲端上線.md](docs/雲端上線.md) |

影片下載器與家用媒體伺服器（`serve_media.py`）在另一個私人 repo `istudy-private-backup`，不在這裡。

## 金鑰與環境變數

**程式碼裡沒有任何寫死的金鑰、權杖或密碼。** 所有機密都從環境變數讀取：

| 變數 | 用途 |
|---|---|
| `ACCESS_AUD`、`ACCESS_TEAM_DOMAIN`、`FEB_OWNER` | Cloudflare Access 驗證（三個缺一就全站 403） |
| `FEB_KEY_OWNER`、`FEB_KEY_GUEST` | 通行碼驗證（Access 的替代方案；owner 可寫進度，guest 唯讀） |
| `GOOGLE_SA_KEY` | Google 服務帳戶 JSON 金鑰，後端拿它換 Drive 唯讀權杖 |

- **本機**：把 `.dev.vars.example` 複製成 `.dev.vars` 再填值。`.dev.vars` 和 `.env` 都已列在 `.gitignore`
- **正式環境**：`npx wrangler pages secret put <變數名> --project-name feb`，值只存在 Cloudflare

外部服務的登入由各自的工具管理，憑證存在使用者目錄，不進 repo：
`claude` CLI（思考地圖）、`python -m notebooklm login`（考題分析、筆記迴流）、
`gws auth login`（Drive 上傳）。字幕完全在本機跑，不需要任何金鑰。

## 開發

需要 Node.js 22 以上（測試用到內建的 `node:sqlite` 與 WebCrypto）、Python 3.11。

```
python -m http.server 8643        # 靜態模式看介面（在 feb2 資料夾裡跑）
node --test tests/drive-sa.test.js  # 跑單一測試檔
npm run build                     # 組出 dist/（只複製，不編譯）
npm run deploy                    # 組 dist/ 並部署到 Cloudflare Pages
```

測試建議**逐檔執行**。部署需要本機存在完整的教材，但公開 repo 不收教材
（見下節），所以從這個 repo clone 下來可以看程式、跑測試，無法直接部署出完整的站。

## 公開版不含什麼

照專案本身「個人教材不得匿名可讀」的規則（`CONTEXT.md`、`docs/影片上雲.md` §7），
以下內容只留在作者本機，已列在 `.gitignore`：

| 排除 | 原因 |
|---|---|
| 課程影片（`media/` → 外接硬碟，約 86 GB）與所有影片副檔名 | 補習班教材 |
| `.vtt`、`.notes.json`、板書快照 | 由課程影片衍生 |
| `site/la-map.html`、`site/me-map.html`，以及 `scripts/*-map/` 的資料檔 | 作戰地圖，內容來自課程逐字稿 |
| `data/exams/`、`data/brochures/` | 考古題與招生簡章 PDF |
| `data/drive-map.json` | Drive 檔案 id 與課程檔名 |
| `data/nblm/`、`data/notebooks.json` | 個人 NotebookLM 筆記與筆記本網址 |
| `.dev.vars`、`.env` | 機密 |

文件裡原本的帳號信箱與 Cloudflare Account ID 已換成 `you@example.com`、`<ACCOUNT_ID>`。
公開 repo 的 git 歷史從 2026-10-01 重新開始；在那之前的開發紀錄保留在作者本機。

## 延伸閱讀

- [`CONTEXT.md`](CONTEXT.md)：詞彙表、硬體環境、localStorage 契約、資料流、雲端架構
- [`docs/adr/`](docs/adr/)：12 份架構決策紀錄
- [`functions/README.md`](functions/README.md)：後端 Functions 的設計
- [`docs/render-discipline.md`](docs/render-discipline.md)：前端渲染紀律
