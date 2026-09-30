/* GET /api/whoami — 客戶端問「我是誰、我能不能寫」。
 *
 * 走到這裡代表 _middleware 已經驗過章了：email 是簽章證明的，不是標頭宣稱的。
 * 客戶端拿 role 決定要不要顯示唯讀狀態列（08-sync.js 的 enterReadonly()），
 * 不必等到 POST 被打回 403 才知道自己是訪客。 */

import { json } from '../_lib/http.mjs';

/* 只導出 onRequestGet：其餘方法由 Pages 自動回 405（不另外導出 onRequest 攔截，
   那個 catch-all 會連 GET 一起吃掉）。 */
export function onRequestGet(context) {
  const { email, role, owner } = context.data;
  return json({
    email,
    role,                       // 'owner'：讀寫；'guest'：唯讀
    readonly: role !== 'owner',
    /* 只回「你是不是主人」，不回主人的信箱本身——訪客沒有知道它的必要，
       少一個可以拿去釣魚的個資。 */
    isOwner: email === owner,
  });
}
