# T02 結構拆分：單檔 → ES modules（行為零變更）

blocked-by: 無（與 T01 平行）

## 目標
`site/index.html`（318KB）拆為：index.html（骨架）＋ css/*.css ＋ js/*.js
（建議切面：boot/state/data/render-home/render-exam/render-study/player/offline/sync/disk/settings/util）。
**這張票結束時畫面與行為和原版一致**——它是純結構票。

## 做法要求（含已驗證的地雷）
- 先讀 CONTEXT.md、ADR-0001、ADR-0003（三條紀律）、docs/adr/ADR-0005（DEV 模式）
- **副檔名必須用 .js ＋ `<script type="module">`，禁用 .mjs**——已實測：
  Windows 上 `python -m http.server` 與 serve_media.py 都把 .mjs 回成 text/plain，
  瀏覽器 ES module MIME 檢查會拒載，全站白屏
- !Boring 皮膚（body[data-skin=boring] 全部選擇器、skinToggle、feb-skin 鍵）與
  swiss/portiva 殘留常數在此票一併刪除（唯一允許的行為變更，記進 commit message）
- **加 DEV 旗標**：DEV=true 時開站自動 /sync 不觸發（僅留手動）——防止測試污染
  與服役原版共用的 progress.json（ADR-0005）
- `#diskPick` file input 維持 body 直屬永不重繪（ADR-0003 紀律 2）
- sw.js SHELL_FILES 更新為拆分後清單、版號進 v23（port 8643 已在 step 0 改好）
- 「狀態不存 DOM」紀律寫成 `docs/render-discipline.md`，之後每票遵守
- **產出功能對照清單**：趁本票對原版逐區塊盤點，寫出
  `.scratch/redesign/checklists/exam.md` 與 `study.md`（T04/T05 的驗收基準）

## 驗收
桌面 smoke：三模式切換、開學校 modal、開播放器（任一離線影片）、逐字稿搜尋、
設定面板全可用；console 無新錯誤；`_febSelfCheck()` 通過；
`grep -ri "boring\|feb-skin\|portiva\|swiss" site/ --include="*.html" --include="*.js" --include="*.css"` 為空
（sw.js 與 index.html 都在範圍內；swiss 誤中字樣需白名單並註記）；
checklists 兩檔存在且涵蓋原版功能清單。

---
## 完工註記（2026-08-31）
照票完成＋一項架構師核可偏差：**plain `<script src>` × 12 依序載入，非 type="module"**——
實測 23 個 innerHTML 樣板 inline onclick 依賴全域函式，module scope 會全數斷裂；
零行為變更優先於模組化教條（render-discipline.md 第 4 條成文）。
另：自訂背景刪除時的 fallback 由死主題 portiva 改指 graph——T03 套用新背景清單時
需再改為存活清單的預設（vellum/chalk 世界的預設值，T03 驗收既有 fallback 條款涵蓋）。
