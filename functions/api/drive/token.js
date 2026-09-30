/* POST /api/drive/token — 主人向後端要一張 Drive 唯讀存取權杖。
 *
 * 前端 14-drive.js 拿到 {token, exp} 之後照舊：<video src="/drive/<id>"> 被
 * Service Worker 攔下，帶 Authorization: Bearer <token> 直打 googleapis.com，
 * 影片位元組 Google → 裝置直送，Cloudflare 不經手（理由見 14-drive.js 檔頭）。
 * 這支只換掉「權杖從哪裡來」：不再是 iPad 上每小時失敗一次的 GIS 靜默續期，
 * 而是後端拿服務帳戶金鑰簽的（_lib/drive-sa.mjs）。
 *
 * ── 三道門，順序固定 ─────────────────────────────────────────────────────
 *   1. Sec-Fetch-Site 存在且不是 same-origin／none → 403 cross_site。
 *      身分是 cookie 帶的（通行碼模式的 febk、Access 的 CF_Authorization），
 *      跨站頁面只要能讓瀏覽器帶 cookie 打這支 POST，就能把主人的 Drive 讀取權
 *      搬到別人的網站上。SameSite 已經是第一層；這是不靠 cookie 屬性的第二層。
 *      標頭不存在時放行——舊 Safari 不送 Fetch Metadata，不能因此把 iPad 鎖在外面。
 *   2. 不是 owner → 403 owner_only。權杖等於「一小時內讀得到整個影片備份資料夾」，
 *      訪客唯讀看板可以，Drive 不行。
 *   3. 沒設 GOOGLE_SA_KEY → 501 sa_not_configured。前端據此收起整個功能。
 *
 * ── 出去的東西 ───────────────────────────────────────────────────────────
 * 只用 json()：它已帶 Cache-Control: private, no-store——這張權杖一個 byte 都不准
 * 留在任何快取。錯誤回應只放 code 與 Google 的 HTTP 狀態碼之類的安全資訊，
 * 私鑰、assertion、access token 一律不進 body（drive-sa.mjs 的 SaError 訊息
 * 也守同一條）。 */

import { json } from '../../_lib/http.mjs';
import { saConfigured, getDriveToken, DRIVE_SCOPE } from '../../_lib/drive-sa.mjs';

/** 502 的 detail：只帶 Google 的 HTTP 狀態與白名單過的 OAuth 錯誤碼，其餘一概不帶。 */
function safeDetail(e) {
  const parts = [];
  if (e && Number.isInteger(e.status)) parts.push(`Google 回應 HTTP ${e.status}`);
  if (e && typeof e.googleError === 'string' && /^[a-z_]{1,40}$/.test(e.googleError)) parts.push(e.googleError);
  return parts.length ? parts.join('：') : undefined;
}

/* 只導出 onRequestPost：GET 由 Pages 回 405。不導出 onRequest（catch-all 會連別的方法一起吃）。 */
export async function onRequestPost(context) {
  const { request, env, data } = context;

  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return json({ error: '跨站請求', code: 'cross_site' }, 403);
  }
  if (data.role !== 'owner') {
    return json({ error: '只有主人能取得影片權杖', code: 'owner_only' }, 403);
  }
  if (!saConfigured(env)) {
    return json({ error: '尚未設定服務帳戶', code: 'sa_not_configured' }, 501);
  }

  try {
    const { token, exp } = await getDriveToken(env);
    return json({ token, exp, scope: DRIVE_SCOPE });
  } catch (e) {
    /* 金鑰壞掉是設定問題，跟 sa_not_configured 同一家族：501，前端不該重試。
       SaError 的 message 由 drive-sa.mjs 保證不含金鑰內容，可以直接當 detail。 */
    if (e && e.code === 'sa_key_invalid') {
      return json({ error: '服務帳戶金鑰格式不正確', code: 'sa_key_invalid', detail: e.message }, 501);
    }
    const body = { error: '向 Google 取得影片權杖失敗', code: (e && e.code) || 'sa_error' };
    const detail = safeDetail(e);
    if (detail) body.detail = detail;
    return json(body, 502);
  }
}
