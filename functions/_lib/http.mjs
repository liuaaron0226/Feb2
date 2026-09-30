/* http.mjs — 每個路由都會用到的回應樣板。
   個人資料的回應一律 `Cache-Control: private`＋`Vary: Cookie`：這些 byte 只屬於
   當下這個登入身分，任何共用快取（CDN、公司 proxy、瀏覽器的共享層）都不准留一份。 */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  Vary: 'Cookie, Cf-Access-Jwt-Assertion',
};

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      ...SECURITY_HEADERS,
      ...extra,
    },
  });
}

/** 錯誤一律同一個形狀：{error, detail?}。客戶端 syncNow() 認得 `error` 這個鍵。 */
export function fail(status, error, detail) {
  const body = { error };
  if (detail) body.detail = detail;
  return json(body, status);
}

export { SECURITY_HEADERS };
