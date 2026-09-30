# T10 PWA／離線／同步收尾＋iPad 驗收清單

blocked-by: T03b, T04, T05, T06, T07, T08, T09

## 目標
整合票：SW 預快取清單最終 audit（各 UI 票已各自維護，本票只查漏）、
版號策略（資料快取與程式版號分離，ADR-0003 紀律 3）、離線備妥 audit 全綠、
/sync 含 feb-review-v1 端到端、rlog 存活、**兩張地圖進 SHELL_FILES**（~4MB，決定：進）、
index ↔ 地圖雙向互連最終確認。

## 收尾工項
- **更新三份使用指南**（帶出門怎麼用／iPad 憑證安裝／咖啡廳 VLC）至 feb2 的
  新入口、新 IA 與 replan 併入後的路徑——指南是產品的一部分（切換日前置條件，ADR-0005）
- 產出 `docs/iPad驗收清單.md` 給使用者手測：PWA 安裝、https 憑證、離線備妥燈、
  Split View、VLC 交接、**外接硬碟直讀（diskPick→blob→feb-disk-last）**、
  進度同步回寫、rlog 回報、離線開兩張地圖

## 驗收
- 桌面：斷網後重整，教材全可用（思考地圖/字幕/快照/分析）＋**從頂欄開兩張地圖**
- `_febSelfCheck()` 擴充涵蓋新模組後通過
- 對 8797 第二實例完整跑一次含 review 欄位的雙向同步
