# 工程數學作戰地圖 · 產生流程

產出：`grad-exam-hub/site/me-map.html`（單一檔案，離線可開，吃同目錄的 `site/vendor/`）

線性代數另有一份：`site/la-map.html`，流程在 `scripts/la-map/`。兩份互相有指向對方的區塊。

## 資料從哪來

| 來源 | 內容 |
|---|---|
| `F:\istudy-backup\工數\**\*.notes.json` | 8 集現成的思考地圖 |
| `data/mep_*.json` | 另外 **18 集**沒有 notes.json，由逐字稿重新消化（**不可再生，勿刪**） |
| `data/medeep_?.json` | 那 8 集概念的深讀層（**不可再生，勿刪**） |
| `me_sup_fourier.py` | 第 7 章 Fourier，影片未教的三角特例操作面，取自 Kreyszig |
| `me_sup_pde.py` | 第 8 章 PDE，影片無專章，取自 Kreyszig |
| `grad-exam-hub/data/analysis/*.json` | 八校工數卷考古題章節熱度 |

## 重跑

```
python me_collect.py    # 掃 F 槽 notes.json + data/mep_*.json → me_eps.json
python me_build.py      # 組裝出 site/me-map.html
python me_verify.py     # 靜態檢查
python me_checkmath.py  # LaTeX 環境配對、括號平衡
python me_fixjson.py    # 修 JSON 裡被吃掉的反斜線（\alpha → BEL 之類）
```

`me_structure.py` 是**人工決策**：26 集打散重組成 9 章的歸屬表與順序。
picks 支援三種標記：`("__SEC__", 標題)` 插小節、`("__EP__", 集數)` 插整集、
`(集數, 概念名)` 插單一概念。

## 這一科特有的坑

- **關鍵詞檢索會被 Whisper 音譯騙過**：查「傅立葉／Fourier」只有 5 次，用全變體
  （負力／複利／富利業／傅烈／副理業…）是 136 次。判斷「有沒有教某主題」必須
  查音譯變體 ＋ 具體內容（公式名、操作步驟），不能只查術語。`me_fourier2.py` 是那次的查核腳本。
- **老師念式子不念術語**：微分方程課直接講「負的N加上二分之AN」，所以「冪級數」
  三個字整集 0 次命中卻確實在教冪級數解。
- **多集內容與標題不符**：09 教的是非齊次特解三法、10 是逆算子與特解五法定序、
  12 是降階法、22 後半是 Legendre、24–26 是 Sturm-Liouville 不是傅立葉。
  `me_probe.py` 產生的「主題指紋」是用來抓這種落差的。
- JSON 裡 LaTeX 反斜線單寫會變控制字元（`\alpha` → BEL+lpha），KaTeX 直接掛掉，
  用 `me_fixjson.py` 修（注意被吃掉的是指令的**第一個字母**）。
- `.chip` 是 nowrap 短標籤，塞長句子會把整頁撐寬（已發生過）。
