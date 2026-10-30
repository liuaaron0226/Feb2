/* _middleware.js — 整個站的第一道門（Phase E 起：**每一個**請求，不只 /api/*）。
 *
 * 這裡沒有例外清單、沒有「本機不驗」、沒有 DEV 旗標。設定不齊就全部 403，
 * 驗不過就 403，驗過了才把**驗過章的**身分掛到 context.data 交給下游路由。
 * 下游任何一支 Function 都不再自己判斷身分，也不准去讀
 * Cf-Access-Authenticated-User-Email——那個標頭是宣稱，這裡放行的才是證明。
 *
 * ── 為什麼從 /api/* 擴成全站 ────────────────────────────────────────────────
 * Phase E 移除了 R2（使用者裁定：不開通，零計費面）。考古題 PDF、招生簡章、
 * 章節分析、筆記快照 292 個檔案改成**隨部署上傳的 Pages 靜態資產**（/data/**）。
 * 靜態資產沒有 Function 可以站崗——除非這道門守的是整個站。
 * 「教材當靜態資產」與「middleware 守全站」是同一個決定的兩半，拆開就漏。
 *
 * 可行的依據是官方文件（workers/static-assets/migration-guides/migrate-from-pages/）：
 * 「Pages would default to serving your Pages Functions ahead of static assets」——
 * Pages 預設先跑 Functions 再送靜態資產，所以這道門攔得到靜態檔。
 * dist/_routes.json 另外把這件事寫死（include /*、exclude 空），不靠預設值。
 *
 * 殼層（index.html／css／js／字型）本來是「程式碼、沒有個人資料」所以刻意不鎖。
 * 現在一起鎖了，理由不是殼層變敏感，是**少一條要維護的例外**：只要有例外清單，
 * 就有人哪天加了一頁預渲染內容忘了加進去。全鎖沒有這個失效模式。
 * （因此 _lib/private-pages.mjs 那份 PRIVATE_PAGES 清單在本階段一併刪除——
 *   它是「只守 /api/*」時代的補丁，全站都守之後它是死碼兼維護債。）
 *
 * ⚠ 這仍然不取代 Access：正解是**整個 pages.dev 專案被同一個 Access 應用蓋住**
 *   （步驟見 docs/雲端上線.md）。這裡是第二層——Dashboard 上的設定還沒做、
 *   或日後被誰刪了的時候，一個 byte 都出不去，而不是「暫時公開」。
 */

import { authenticate, accessErrorResponse } from './_lib/access.mjs';
import { passcodeConfigured, passcodeAuthenticate } from './_lib/passcode.mjs';

/* 靜態資產的回應是 Pages 的資產層產生的，不經過 _lib/http.mjs。
   官方文件（pages/configuration/headers/）明講 _headers 不套用在 Functions 產生的
   回應上，而全站都經過本檔，所以標頭只能在這裡補。

   Cache-Control 一律 private：驗過章之後送出去的每一個 byte 都只屬於當下這個
   登入身分，任何共用快取（Cloudflare 邊緣、公司 proxy、瀏覽器的共享層）都不准留。
   PDF 是歷史檔案（考古題放上去就不再變），可以在**私有**快取裡放長；
   其餘一律 no-cache＝可以留但每次回來問，改版才不會被舊檔卡住。 */
function hardenStatic(res, pathname) {
  const out = new Response(res.body, res);
  const isPdf = /\.pdf$/i.test(pathname);
  out.headers.set('Cache-Control', isPdf
    ? 'private, max-age=31536000, immutable'
    : 'private, no-cache');
  out.headers.set('X-Content-Type-Options', 'nosniff');
  /* Referrer-Policy 不能是 no-referrer：index.html 內嵌 YouTube 播放器（控制系統那 46 支），
     YouTube 自 2025 年下半年起要求內嵌請求必須帶 Referer 來辨識嵌入的網站，收不到就給
     「影片播放器設定錯誤（錯誤 153）」。strict-origin-when-cross-origin 是瀏覽器預設值：
     跨站只送 origin（https://feb….pages.dev），路徑與查詢字串（含 ?k= 通行碼）一律不送，
     所以不會多洩漏任何東西。/api/* 的回應仍是 no-referrer（_lib/http.mjs），那邊沒有文件要嵌東西。 */
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  out.headers.set('Vary', 'Cookie, Cf-Access-Jwt-Assertion');
  return out;
}

export async function onRequest(context) {
  const { request, next, env, data } = context;
  const path = new URL(request.url).pathname;

  /* 兩種驗證擇一，順序固定：Access 設好了就走 Access（身分較強、可單獨踢人），
     否則退到通行碼。兩者都沒設 ⇒ 走 Access 分支拋 access_not_configured ⇒ 全站 403。
     升級路徑因此不必改程式：把 ACCESS_AUD/ACCESS_TEAM_DOMAIN 設上去就自動換軌。 */
  const accessReady = String(env.ACCESS_AUD || '').trim() && String(env.ACCESS_TEAM_DOMAIN || '').trim();
  if (!accessReady && passcodeConfigured(env)) {
    const out = passcodeAuthenticate(request, env);
    if (out.response) return out.response;
    data.email = out.identity.email;
    data.role = out.identity.role;
    data.owner = out.identity.owner;
    const res0 = await next();
    if (path === '/api' || path.startsWith('/api/')) return res0;
    return hardenStatic(res0, path);
  }

  try {
    const id = await authenticate(request, env);
    data.email = id.email;      // 驗過章的信箱，下游只認這個
    data.role = id.role;        // 'owner' | 'guest'
    data.owner = id.owner;      // 資料歸屬人（訪客讀的也是這個人的看板）
  } catch (err) {
    return accessErrorResponse(err);
  }

  const res = await next();
  /* /api/* 的回應自己已經帶好 private/no-store 與安全標頭（_lib/http.mjs），
     再蓋一次只會把 no-store 降級成 no-cache。只補靜態資產那半。 */
  if (path === '/api' || path.startsWith('/api/')) return res;
  return hardenStatic(res, path);
}
