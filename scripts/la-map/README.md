# 線代作戰地圖 · 產生流程

產出：`grad-exam-hub/site/la-map.html`（單一檔案，離線可開，吃同目錄的 `site/vendor/`）

## 資料從哪來

| 來源 | 內容 |
|---|---|
| `F:\istudy-backup\線代\**\*.notes.json` | 17 集現成的思考地圖（make_notes.py 產生） |
| `data/ep_*.json` | 另外 7 集沒有 notes.json，由逐字稿重新消化（**不可再生，勿刪**） |
| `data/deep_?.json` | 113 則深讀層：完整定義／定理／證明骨架／逐步例題（**不可再生，勿刪**） |
| `la_sup_svd.py` | SVD／偽反矩陣等影片未教的段落，取自 Strang／Friedberg |
| `grad-exam-hub/data/analysis/*.json` | 各校考古題章節熱度 |

## 重跑

```
python la_collect.py    # 掃 F 槽 notes.json + data/ep_*.json → la_eps.json
python la_build.py      # 組裝出 site/la-map.html
python la_verify.py     # 靜態檢查：markdown 殘留、$ 成對、深讀層進度
python la_checkmath.py  # LaTeX 環境配對、括號平衡
```

`la_structure.py` 是**人工決策**的部分：24 集打散重組成 7 章的歸屬表與順序。
要調整章節編排就改這個檔，其餘都是機械轉換。

## 踩過的坑

- **子代理會在共用暫存目錄留下 `build.py`、`p1.py` 之類的通用檔名，把你的腳本蓋掉。**
  所以這裡的檔案一律 `la_` 前綴。
- LaTeX 內容不要走 shell heredoc／sed，反斜線會被靜默吃掉；一律用檔案寫入。
- KaTeX 只實作 LaTeX 子集，`psmallmatrix` 之類會渲染失敗，`la_build.py` 的
  `fix_katex()` 負責降級。
- mermaid 在 `display:none` 的容器裡量到的寬度是 0，會畫出空圖：一定要先顯示再 run。
- 深讀層合計近兩萬條公式，開頁全渲染會卡好幾秒；`la_template.html` 讓
  `.deep-body` 延後到展開才渲染。
