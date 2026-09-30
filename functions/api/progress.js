/* /api/progress — 跨裝置進度。媒體伺服器 GET/POST /sync 的雲端替身。
 *
 * GET  回目前這份進度文件（不合併），形狀就是 08-sync.js 的 applyProgress() 吃的那個。
 * POST 收 localProgress() 的 payload，與伺服器現況合併後整份寫回，回傳合併結果。
 *      合併語意逐條移植自 serve_media.py 的 merge_progress()（見 _lib/merge.mjs），
 *      tests/cloud-merge.test.js 用 Python 跑出來的黃金檔證明兩邊逐位元組相同。
 *
 * ── 分身（scoping）────────────────────────────────────────────────────────────
 * 資料歸屬人由 _middleware 驗過章的 email 決定：
 *   FEB_OWNER 本人  → role='owner'，讀寫真實資料
 *   其他任何身分    → role='guest'，**唯讀**：GET 讀的是主人的同一塊看板，
 *                      POST 一律 403。訪客的進度留在他自己裝置的 localStorage，
 *                      一個位元組都不入庫（鏡射 T12／ADR-0007 的裝置模型）。
 * 因此 D1 裡永遠只有一份「主人的」資料列——不是省事，是這個模型下不可能有第二份。
 * 將來若真的要一人一塊看板，那是 migration 0002 加 owner 欄位的事，
 * 不是在這裡先擺一個永遠等於 FEB_OWNER 的欄位假裝有分身。
 *
 * ── 已知限制：並行寫入是 last-write-wins ─────────────────────────────────────
 * 讀→合併→寫不是一個原子操作（寫入本身是 D1 batch＝單一 transaction，但讀在它之前）。
 * 兩台裝置同一瞬間 POST，後到的那次會蓋掉前一次的合併結果。
 * 這與現行 Python 伺服器完全相同（do_POST 也沒有跨請求的鎖），而且會自癒：
 * 客戶端每次都上傳整份 localStorage，下一次同步就把掉的那筆帶回來。
 * 真正需要修時，正解是 D1 的條件更新，不是在這裡加一把假鎖。
 */

import { json, fail } from '../_lib/http.mjs';
import { mergeProgress } from '../_lib/merge.mjs';
import { readDoc, writeDoc } from '../_lib/progress-store.mjs';

function noDb() {
  return fail(503, '進度資料庫尚未綁定（D1 binding DB 不存在）');
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return noDb();
  try {
    return json(await readDoc(env.DB));
  } catch (e) {
    return fail(500, `讀取失敗：${e && e.name ? e.name : 'Error'}`);
  }
}

export async function onRequestPost(context) {
  const { request, env, data } = context;
  if (!env.DB) return noDb();

  /* body 先讀完再擋唯讀：keep-alive 的框界不能留半截（Python 版同一條理由）。 */
  let incoming;
  try {
    const raw = await request.text();
    incoming = raw ? JSON.parse(raw) : {};
  } catch (e) {
    return fail(400, `讀取失敗：${e && e.name ? e.name : 'Error'}`);
  }
  if (typeof incoming !== 'object' || incoming === null || Array.isArray(incoming)) {
    return fail(400, '讀取失敗：payload 必須是一個物件');
  }

  if (data.role !== 'owner') {
    /* 形狀與 Python 版一致：08-sync.js 看到 403 就進唯讀模式，本機照常記錄。 */
    return json({ error: '唯讀身分：此裝置的變更不會寫回伺服器', readonly: true }, 403);
  }

  try {
    const current = await readDoc(env.DB);
    const merged = mergeProgress(current, incoming);
    await writeDoc(env.DB, merged);
    return json(merged);
  } catch (e) {
    return fail(500, `寫入失敗：${e && e.name ? e.name : 'Error'}`);
  }
}
