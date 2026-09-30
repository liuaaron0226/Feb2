# ADR-0011：Drive 影片權杖改由後端以服務帳戶簽發（取代前端 GIS Token model）

- 日期：2026-09-13
- 狀態：**採納**（使用者裁定「服務帳戶」，二選一另一案是授權碼＋refresh token）
- 承接：ADR-0010（iPad 走 MSE，位元組 Google → 裝置直送）、docs/影片上雲.md §10 L3

## 問題

L3／MSE 的每一個 Range 請求都要帶 Google 的 access token。原本由前端用
Google Identity Services 的 **Token model**（`initTokenClient`）自己要：token 固定一小時到期，
**沒有 refresh token**。到期時程式試「靜默續期」（`prompt: ''`，隱藏 iframe＋Google 第三方 cookie），
iPad Safari 的 ITP 把它擋掉，於是每小時跳一次「重新連結 Google」要使用者按。
使用者實測：三小時的課要按三次，而且每次到期前後都有 8～20 秒的硬停被算進「緩衝」。

這不是 bug，是 Token model 的天花板：Google 官方文件明說需要背景續期的情境該改用
Authorization code model。

## 考慮過的路

| 路 | 結果 |
|---|---|
| 定時呼叫 `initTokenClient` 續期 | **否決**：iPad 上沒有使用者手勢的 popup／iframe 一律被擋，等於現況 |
| 授權碼模式＋後端保存 refresh token（另一位 AI 的交接指南推薦） | 可行，但：OAuth 同意畫面若仍是「測試」狀態，refresh token **7 天到期**；`drive.readonly` 是受限範圍，未經 Google 審核的正式應用會一直顯示「未驗證」警告；要做 callback／state／PKCE／加密存 refresh token／invalid_grant 處理，程式量與風險都大 |
| **服務帳戶（Service Account）** | **採納**。使用者把 Drive 的「Feb 影片備份」資料夾分享給服務帳戶（唯讀）；金鑰只放 Cloudflare secret；後端簽 JWT 向 Google 換一小時 token 回給前端。沒有同意畫面、沒有 refresh token、沒有 7 天限制、不需審核 |
| Cloudflare 代理影片位元組 | **否決**（同 ADR-0010）：影片永不進 Cloudflare |

## 設計

1. **後端**（`functions/_lib/drive-sa.mjs`、`functions/api/drive/token.js`、`functions/api/drive/status.js`）：
   `POST /api/drive/token` → `{token, exp}`（exp 為 Unix 毫秒）。三道門：`Sec-Fetch-Site` 非同源 → 403、
   非 owner → 403、`GOOGLE_SA_KEY` 未設 → 501。快取三層：isolate 記憶體（併發單飛）→ D1 `drive_token`
   表（migration 0002，跨 isolate）→ 向 Google 簽。回應 `private, no-store`。金鑰、assertion、token
   不進任何錯誤訊息或日誌。
2. **前端**（`site/js/14-drive.js`）：`driveAuth()` 先問後端；後端明確回 501／403 才退回 GIS
   （`DRIVE.backend=false`）。`driveSetTokenAt()` 記絕對到期時間；**到期前五分鐘**自動再要一張
   （`driveRenewSchedule`），切回前景時若快到期也立刻換。服務帳戶模式下集數 chip 點了就播，
   沒有「連結 Google」這一步；串流通知的按鈕文案改成「重新連線」。
3. **Service Worker**（`site/sw.js`）：記住 `exp`，快到期就先跟頁面要新的，不拿一張剩十秒的去撞 401；
   `/api/` 整個前綴永不進快取。
4. **部署順序**：程式先上（後端回 501 → 前端照舊走 GIS，行為不變）；使用者再做三步：
   Console 建服務帳戶並下載 JSON 金鑰 → Drive 資料夾分享給服務帳戶信箱 →
   `npx wrangler pages secret put GOOGLE_SA_KEY --project-name feb < 金鑰檔`。
   secret 設好的那一刻起自動切換，不必再部署。
5. **安全邊界**：這張 token 只看得到分享給服務帳戶的那個資料夾（比原本使用者整個 Drive 唯讀還小）。
   拿得到 token 的人＝通過站台通行碼的主人；訪客 403。金鑰外流的處置：Console 撤銷該金鑰、重建、
   再 `secret put`。

## 代價與風險（誠實版）

- 多一把長期憑證（服務帳戶私鑰）住在 Cloudflare secret；跟 refresh token 方案的長期憑證同一等級，
  但少了同意畫面與到期陷阱。
- 服務帳戶看得到的是「分享給它的東西」；新上傳的影片放在同一個根資料夾底下會自動繼承分享，
  放到別處就看不到。
- 通行碼 cookie 一年有效、無簽章（既有設計）；這條端點把那把碼的價值抬高了一點。
  日後若切到 Cloudflare Access，端點不用改（只看 `context.data.role`）。
- Google 對 jwt-bearer 的簽發沒有公開硬上限，但這裡一小時最多簽一次（D1 快取），遠低於任何合理額度。
