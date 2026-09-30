# T12 裝置管理（凍結例外，ADR-0007）

blocked-by: T08（08-sync.js 與 UI 循序）

## 目標
朋友平板可登入但傷不到真實進度；管理者（localhost）可視、可名、可升級、可踢。

## 伺服器側（serve_media.py——對服役實例向後相容，測試一律走 8797/8798）
- 通行碼驗證成功→發裝置 session cookie（token），sessions 存 `data/device-sessions.json`：
  {token, name, ua, ip, created, lastSeen, mode: readonly|trusted}
- 既有 `?k=` 一鍵連結照常可用：驗過即轉發 session（共享 key 本身不再當長期憑證）
- readonly 裝置：POST /sync 回 403（GET 照常）；rlog 照收（診斷無害）
- 管理台：GET /admin 僅 localhost 可達（其餘 404）；API：list / rename / set-mode / kick
- 管理頁為 serve_media 直出的單檔頁，inline tokens 照 design-system 語彙（去框、mono 讀數）

## Feb 側（最小）
- 08-sync.js：403 時安靜停止自動同步並在狀態選單顯示「唯讀裝置」badge（status token）
- 不做其他 UI

## 驗收（dev 實例 E2E，模擬朋友平板）
LAN IP 登入 → 管理台出現（訪客/唯讀）→ 其 POST /sync 403、寫入未入檔 →
取名「朋友平板」→ 升級 trusted → sync 200 且正確合併 → 踢除 → 該裝置下一請求 401 重登 →
localhost 開 /admin 正常、LAN 開 /admin 404。
py_compile；無 session 檔時行為同現況（向後相容）；服役 8795/8796 全程不動。
