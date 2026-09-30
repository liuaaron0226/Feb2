-- 0002_drive_token.sql — 服務帳戶（Service Account）的 Drive 存取權杖快取
--
-- 用途：functions/_lib/drive-sa.mjs 用 GOOGLE_SA_KEY 簽 JWT 向 Google 換一張
-- 1 小時的 access token，給前端播放器直打 googleapis.com 抓影片位元組。
-- 簽一次就是一趟 RSA 簽章＋一次對 Google 的往返；Pages Functions 的 isolate 隨時
-- 會被回收、又可能同時有好幾個，只靠模組層記憶體快取的話，每個新醒來的 isolate
-- 都會再去簽一張。把當前那張放進 D1，所有 isolate 共用同一張，Google 那邊
-- 一小時最多看到一次簽發。
--
-- 為什麼不塞進既有的 meta 表：progress-store.mjs 的 writeDoc() 是**整表改寫**
-- （DELETE FROM meta 之後重灌），任何借住在 meta 裡的鍵都會在下一次同步時被洗掉。
-- 權杖的生命週期跟進度文件無關，就該有自己的表。
--
--   k      固定 'sa'（目前只有一個服務帳戶；主鍵留著是為了 upsert 好寫）
--   token  Google 發的 access token 本體。這張表的內容等於「一小時內讀得到
--          影片備份資料夾」的鑰匙，D1 本身不對外，但 dump 出來時要當機密看
--   exp    到期時刻，Unix 毫秒（與 Date.now() 同單位，跟前端 DRIVE.exp 一致）
--
-- 沒有 drive_token 表時（migration 還沒套）drive-sa.mjs 會退回只用記憶體快取，
-- 不會因此拿不到權杖——這張表是加速，不是前提。

CREATE TABLE IF NOT EXISTS drive_token (
  k     TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  exp   INTEGER NOT NULL
);
