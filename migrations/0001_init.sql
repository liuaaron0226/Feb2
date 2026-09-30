-- 0001_init.sql — feb-progress（D1）初始結構
--
-- 這是 progress.json 的關聯式化，**語意一位元不改**。原本媒體伺服器把整份
-- 進度存成一個 JSON 檔，`merge_progress()`（tools/serve_media.py）逐欄位合併；
-- 搬到 D1 之後合併規則不變，只是換成一列一鍵存放，讓 Function 能只讀寫動到的那幾筆。
--
-- ── progress.json → 資料表對照 ──────────────────────────────────────────────
--
--   {
--     "watched": {"115暑電子04": "2026-08-24", ...}   → progress_entry field='watched'
--     "done":    {"laplace": "2026-08-30", ...}       → progress_entry field='done'
--     "miss":    {"laplace": 1, ...}                  → progress_entry field='miss'
--     "target":  ["ntu|控制組", ...]                   → progress_entry field='target'
--     "playpos": {"<url>": {t,dur,pct,at}, ...}       → playpos（一列一支影片）
--     "review":  {"cards": [{id,subject,page,
--                            createdAt,history:[...]}]}→ review_card ＋ review_history
--     "edits":   {"done:章id": ISO, ...}               → progress_entry.stamp（不另立表）
--     "updated": ISO                                   → meta k='updated'
--     其餘頂層純量                                       → meta
--   }
--
-- ── 為什麼四種欄位擠同一張 progress_entry ─────────────────────────────────
-- done / watched / miss / target 形狀一致（一個鍵 → 一個值 → 一個編輯時戳），
-- 合併時走的也是同一套 per-key last-write-wins。拆成四張表只會把
-- 「查某鍵的時戳」這件到處都要做的事複製四遍。field 進主鍵，item 在後，
-- PRIMARY KEY(field,item) 同時就是「掃某一欄全部」的索引，不必另建 index。
--
-- value 的型別刻意留 TEXT，各欄位自己解讀（SQLite 動態型別下這不吃虧）：
--   done / watched → 'YYYY-MM-DD'，完成／看完的日期。兩台裝置都有時取較早那個
--                    （先看完的那次才是事實），時戳推翻不了它
--   miss           → 錯題次數的十進位字串，例 '1'。有戳時由新戳那側的值說了算，
--                    所以 5 改 3、改 0 都傳得出去；沒戳才退回舊規則的取大值
--   target         → 只有「在不在」沒有值，一律存 '1'；刪除＝刪列
--
-- stamp 是 T20 的 feb-edits-v1 時戳（ISO 8601），對應 edits 表裡的 "field:item"。
-- 存成同一列的欄位而不是獨立的 edits 表：時戳與它管的那一鍵是一對一，
-- 分兩張表只會讓每次合併多一次 join，還要自己處理「有戳沒值」的孤兒列。
--   stamp IS NULL  → 這鍵沒戳（舊裝置，或戳超過 90 天被汰除）→ 退回聯集／取大的舊規則
--   stamp 有值     → 新戳那側決定這鍵在不在，**刪除也要傳得出去**，聯集不得復活它
-- 汰除 90 天前的戳＝把 stamp 設回 NULL，不是刪列（列還在，值還在）。
--
-- 日期一律 'YYYY-MM-DD'、時戳一律 ISO 8601 字串：字串比大小就是時間比大小，
-- 與 serve_media.py 的比較方式一致，不引進時區與夏令時間的坑。

CREATE TABLE IF NOT EXISTS progress_entry (
  field TEXT NOT NULL CHECK (field IN ('done', 'watched', 'miss', 'target')),
  item  TEXT NOT NULL,           -- done/miss＝章 id；watched＝影片代號；target＝校系組
  value TEXT NOT NULL,           -- 見上方各欄位的解讀方式
  stamp TEXT,                    -- feb-edits-v1 的 ISO 時戳；NULL＝沒戳，走舊合併規則
  PRIMARY KEY (field, item)
);

-- 影片續播點。一列一支影片，url 是 progress.json 裡那把 percent-encoded 的鍵，
-- 原樣存進來——它同時是網站與 VLC 交接時認得的識別，不做正規化以免對不上。
--   t   秒數；pct 百分比（0–100）；at 'YYYY-MM-DD' 最後觀看日
-- 合併：留 at 較新的那筆；同一天則留 pct 較大（看得比較遠）的那筆。
-- dur 不在本票給的欄位清單裡，但真實 progress.json 每一筆都有它（影片總長，
-- 用來算 pct 與顯示剩餘時間）。不存＝資料經 D1 來回一趟就掉了，
-- 那會破壞 /sync 的往返契約，所以補成可為 NULL 的欄位。
CREATE TABLE IF NOT EXISTS playpos (
  url TEXT PRIMARY KEY,
  t   REAL,
  dur REAL,
  pct REAL,
  at  TEXT
);

-- 今日複習的卡（T07，ADR-0004）。卡號對 GoodNotes 頁碼，手寫練習留紙本，
-- 這裡只數位化排程需要的那幾格。
--   id      卡號，跨裝置聯集的鍵
--   subject 科目（由卡號首字推得）
--   page    GoodNotes 頁碼；存 TEXT 不存 INTEGER，它是頁面標籤不是要拿來算術的數
--   created 對應 card.createdAt；兩側都有時留最早的那個
CREATE TABLE IF NOT EXISTS review_card (
  id      TEXT PRIMARY KEY,
  subject TEXT,
  page    TEXT,
  created TEXT
);

-- 每張卡的複習歷程。合併規則是「按 (date,result) 聯集去重」——
-- 主鍵就照這個定義下去，去重直接由資料庫保證，Function 不必自己 dedupe。
--   result: 'pass' ＝過；'A'/'B'/'C' ＝三種失敗碼（任一都重設回梯首）
-- 排程核心以「尾端連續 pass」推梯級，所以讀出來一定要按 date 排序，
-- 同日 pass 與失敗碼並存時失敗碼排後面（寧可重設多複習一次）。
-- 主鍵前綴已含 card_id，查單卡歷程不必另建索引。
-- ON DELETE CASCADE：卡刪了歷程就該一起走，不留查不到卡的孤兒列。
CREATE TABLE IF NOT EXISTS review_history (
  card_id TEXT NOT NULL REFERENCES review_card(id) ON DELETE CASCADE,
  date    TEXT NOT NULL,
  result  TEXT NOT NULL,
  PRIMARY KEY (card_id, date, result)
);

-- progress.json 的頂層純量（'updated' 等）與日後的結構版號。
-- 合併時整包走 last-writer-wins，比的就是 meta 裡的 updated。
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT
);
