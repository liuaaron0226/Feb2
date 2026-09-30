# T01 設計方向定案＋單一 token 系統

blocked-by: 無（與 T02 平行；port 8643 已於 step 0 完成，瀏覽器渲染一律走 8643）

## 目標
產出全站唯一的設計系統：`site/css/tokens.css`（語意 token）＋
`site/design-system.html`（活體規格書：色/字階/間距/圓角/按鈕三態/玻璃/動效曲線全展示）。

## 做法要求
- 先讀 CONTEXT.md、ADR-0002；萃取起點是原 index.html 既有量化紀律
  （字階 --t-*/--w-* 五級、按鈕三高 32/28/24、圓角 18/12/9、--night/--dawn/--ember、學科色五色）
- 載入 frontend-design ＋ ui-ux-pro-max skill 再動手；氛圍語系存活、強度隨模式收放
- **產出 2–3 個方向變體**（同一 token 架構、不同定調），瀏覽器實渲染＋ /watch-ui 錄動效
- **判定者是使用者，不是本 session**：變體渲染完成後停下，交使用者實際瀏覽比較拍板；
  未獲使用者明示定案前不得往下鋪 token 細節。判定結論（含使用者原話理由）補進 ADR-0002
- 交付項含**存活背景主題清單**（哪些程序化材質留、哪些退役——隨方向一併交使用者拍板）
- 品味錨點：MetalForge（metalforge.xyz）的深色克制、mono 眉標、hairline 邊；
  參考 reference-animations/index.html 的動效語彙
- 動效預設曲線：320ms cubic-bezier(0.22,1,0.36,1)（hover-play-gallery 驗證過）

## 非目標
不改 app 任何頁面；tokens 尚不接線（T03+ 才套用）。

## 驗收
design-system.html 開站可看；深淺/三模式強度規範＋存活背景主題清單成文於頁內；
**使用者已拍板方向**；ADR-0002 已補判定紀錄。
