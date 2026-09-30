/* d1-import-progress.mjs — 把家用媒體伺服器的 progress.json 灌進雲端 D1。
 *
 * 一次性的搬家工具（Phase D）。之後跨裝置同步走 POST /api/progress，不再用它。
 *
 * ── 為什麼不自己拼 SQL 的語意，而是借用 Function 的兩支函式 ──────────────────
 * 這支腳本 import 的是**線上跑的同一份程式碼**：
 *   mergeProgress()  functions/_lib/merge.mjs        （serve_media.py merge_progress 的逐行移植）
 *   rowsFromDoc()    functions/_lib/progress-store.mjs（文件 → 四張表的唯一翻譯）
 * 也就是說，這次匯入產生的資料列，與「iPad 開站後 POST 一次」產生的資料列
 * 逐位元組相同——墓碑列、edits 時戳、miss 的型別、review_history 的去重全都一致。
 * 自己寫一套 INSERT 就等於把同一個結論實作兩遍，兩邊遲早會漂移。
 *
 * mergeProgress({}, doc)＝「伺服器目前是空的，收到這份 payload」，
 * 正是 POST /api/progress 第一次被呼叫時走的那條路。
 *
 * ── 輸出 ────────────────────────────────────────────────────────────────────
 * 不直接連 D1（不想在腳本裡處理 API token），而是產生一份 .sql 給
 *   npx wrangler d1 execute feb-progress --remote --file=<out>
 * 語句順序照抄 writeDoc()：先 DELETE 五張表，再依 FK 順序 INSERT
 * （review_card 必須先於 review_history）。
 *
 * 用法：
 *   node scripts/cloud/d1-import-progress.mjs <progress.json> <out.sql>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const libDir = resolve(here, '..', '..', 'functions', '_lib');
const { mergeProgress } = await import(pathToFileURL(join(libDir, 'merge.mjs')).href);
const { rowsFromDoc } = await import(pathToFileURL(join(libDir, 'progress-store.mjs')).href);

const [, , srcArg, outArg] = process.argv;
if (!srcArg || !outArg) {
  console.error('用法：node d1-import-progress.mjs <progress.json> <out.sql>');
  process.exit(2);
}

const doc = JSON.parse(readFileSync(srcArg, 'utf8'));
/* 空的伺服器 + 這份 payload = POST /api/progress 第一次呼叫的結果 */
const merged = mergeProgress({}, doc);
const { entries, playpos, cards, history, meta } = rowsFromDoc(merged);

/* SQL 字面值。單引號加倍是 SQLite 唯一的跳脫方式；控制字元不該出現在進度資料裡，
   出現就是資料壞了，寧可停下來也不要靜靜寫進資料庫。 */
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`不是有限的數字：${v}`);
    return String(v);
  }
  const s = String(v);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) {
    throw new Error(`值裡有控制字元，拒絕匯入：${JSON.stringify(s.slice(0, 60))}`);
  }
  return "'" + s.replace(/'/g, "''") + "'";
}

const out = [];
out.push('-- 由 scripts/cloud/d1-import-progress.mjs 產生，請勿手改。');
out.push(`-- 來源：${srcArg}`);
out.push(`-- 產生時間：${new Date().toISOString()}`);
out.push('DELETE FROM review_history;');
out.push('DELETE FROM review_card;');
out.push('DELETE FROM progress_entry;');
out.push('DELETE FROM playpos;');
out.push('DELETE FROM meta;');

for (const r of entries) {
  out.push(`INSERT INTO progress_entry (field,item,value,stamp) VALUES (${lit(r.field)},${lit(r.item)},${lit(r.value)},${lit(r.stamp)});`);
}
for (const r of playpos) {
  out.push(`INSERT INTO playpos (url,t,dur,pct,at) VALUES (${lit(r.url)},${lit(r.t)},${lit(r.dur)},${lit(r.pct)},${lit(r.at)});`);
}
for (const r of cards) {
  out.push(`INSERT INTO review_card (id,subject,page,created) VALUES (${lit(r.id)},${lit(r.subject)},${lit(r.page)},${lit(r.created)});`);
}
for (const r of history) {
  out.push(`INSERT INTO review_history (card_id,date,result) VALUES (${lit(r.card_id)},${lit(r.date)},${lit(r.result)});`);
}
for (const r of meta) {
  out.push(`INSERT INTO meta (k,v) VALUES (${lit(r.k)},${lit(r.v)});`);
}

writeFileSync(outArg, out.join('\n') + '\n', 'utf8');

const n = (x) => String(x).padStart(4);
console.error(`progress_entry ${n(entries.length)}  （其中墓碑列 ${entries.filter((r) => r.value === '').length}）`);
console.error(`playpos        ${n(playpos.length)}`);
console.error(`review_card    ${n(cards.length)}`);
console.error(`review_history ${n(history.length)}`);
console.error(`meta           ${n(meta.length)}  keys=${meta.map((m) => m.k).join(',')}`);
console.error(`SQL 已寫到 ${resolve(outArg)}`);
