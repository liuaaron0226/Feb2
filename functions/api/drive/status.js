/* GET /api/drive/status — 前端一開站就問：「服務帳戶設好了嗎？我是主人嗎？」
 *
 * 兩個布林決定 Drive 播放功能要不要出現：configured 為假就整個收起（跟 14-drive.js
 * 「client_id 空就一個按鈕都不出現」同一個心智模型）；owner 為假就不去打
 * POST /api/drive/token（那支對訪客一律 403，何必先撞一次再收）。
 *
 * 訪客也回得到：內容只有兩個布林，不含權杖、不含服務帳戶的信箱，跟 /api/whoami
 * 回 role 給訪客是同一條理由——讓客戶端不必靠被打回 403 來認識自己。 */

import { json } from '../../_lib/http.mjs';
import { saConfigured } from '../../_lib/drive-sa.mjs';

/* 只導出 onRequestGet：其餘方法由 Pages 回 405，不導出 onRequest。 */
export function onRequestGet(context) {
  const { env, data } = context;
  return json({
    configured: saConfigured(env),
    owner: data.role === 'owner',
  });
}
