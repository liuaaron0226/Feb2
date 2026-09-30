/* passcode.mjs — 通行碼驗證（Access 的替代方案）
 *
 * 為什麼有這支：Cloudflare Access 要在 Zero Trust 後台建應用程式，而那件事
 * wrangler 的 OAuth 權杖做不到（實測 /accounts/*&#47;access/apps 回 401），只能人工點。
 * 使用者裁定「你能自己處理的就別叫我做」——通行碼是唯一一條 100% 能由部署端
 * 完成的路：secret 用 `wrangler pages secret put` 設，零後台點擊、零付款方式。
 *
 * 與家裡那台 serve_media.py 的 `?k=` 是同一個心智模型（使用者已經在用），
 * 差別是這裡有兩組碼＝兩種角色：
 *   FEB_KEY_OWNER → owner（可寫入進度）
 *   FEB_KEY_GUEST → guest（唯讀；POST /api/progress 會被 403）
 * 兩組都沒設 ⇒ fail closed，跟 Access 未設定時同樣一個 byte 都不出去。
 *
 * 安全邊界（誠實版）：通行碼＝知道就進得來，沒有個人身分、沒有 MFA。
 * 對「一個人＋偶爾一個朋友」的私人備考站，配上足夠長的隨機碼（18 bytes,
 * base64url ≈ 144 bits）與 Workers 免費方案本身的每日 10 萬次上限，暴力破解
 * 不是現實威脅。碼外流的處置是「換一次 secret」——一行指令，30 秒生效。
 * 哪天想升級成 Access，把 ACCESS_AUD/ACCESS_TEAM_DOMAIN 設上去即可，
 * _middleware.js 會自動優先走 Access，這支就自動退場（不必改任何程式）。
 */

/** 定時間比較：避免逐字元提早 return 洩漏前綴長度。 */
function safeEqual(a, b) {
  const x = String(a || ''), y = String(b || '');
  // 長度本身會洩漏，但通行碼長度是固定的實作常數、不是秘密。
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

const COOKIE = 'febk';

function cookieValue(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

/** 碼 → 角色。認不得回 null。 */
function roleOf(code, env) {
  const owner = String(env.FEB_KEY_OWNER || '');
  const guest = String(env.FEB_KEY_GUEST || '');
  if (owner && safeEqual(code, owner)) return 'owner';
  if (guest && safeEqual(code, guest)) return 'guest';
  return null;
}

export function passcodeConfigured(env) {
  return Boolean(String(env.FEB_KEY_OWNER || '').trim());
}

/* 登入頁：設計語言與站上一致（深色、mono、無框），但完全獨立——
   它必須在使用者還沒通過驗證時就能顯示，所以不能引用站內任何資產。 */
function loginPage(status, msg) {
  const body = `<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Feb</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0B0D12;
  color:#E9EDF4;font:15px/1.6 ui-sans-serif,system-ui,"Noto Sans TC",sans-serif;padding:24px}
main{width:100%;max-width:380px}
.eyebrow{font:500 11px/1 ui-monospace,"Geist Mono",monospace;letter-spacing:.16em;
  color:#75809E;text-transform:uppercase;margin:0 0 10px}
h1{margin:0 0 6px;font-size:2.5rem;letter-spacing:-.035em;font-weight:650}
p{margin:0 0 26px;color:#A3ADC2;font-size:.9375rem}
form{display:flex;gap:8px;align-items:center;border-bottom:1px solid rgba(255,255,255,.14);
  padding-bottom:8px}
input{flex:1;min-width:0;background:none;border:0;outline:0;color:#E9EDF4;
  font:400 1rem/1.4 ui-monospace,"Geist Mono",monospace;letter-spacing:.02em;padding:8px 0}
input::placeholder{color:#75809E}
button{flex:none;height:32px;padding:0 16px;border:0;border-radius:9px;cursor:pointer;
  background:#E07840;color:#0B0D12;font:600 .8125rem/1 inherit}
button:hover{filter:brightness(1.08)}
:focus-visible{outline:2px solid #E07840;outline-offset:3px}
.err{margin:16px 0 0;color:#F16A6A;font:500 .8125rem/1.5 ui-monospace,monospace}
</style></head><body><main>
<p class="eyebrow">FEB · 研究所備考平台</p>
<h1>輸入通行碼</h1>
<p>這個站是私人的。通行碼記在這台裝置上，之後不用再輸入。</p>
<form method="GET" action="/">
  <input name="k" type="password" placeholder="通行碼" autocomplete="current-password"
    autofocus required aria-label="通行碼">
  <button type="submit">進入</button>
</form>
${msg ? `<p class="err">${msg}</p>` : ''}
</main></body></html>`;
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/**
 * 回傳 { identity } 代表放行，或 { response } 代表要直接回這個回應。
 * 順序：網址帶 ?k= → 驗過就種 cookie 並轉回乾淨網址；否則看 cookie；都沒有 → 登入頁。
 */
export function passcodeAuthenticate(request, env) {
  const url = new URL(request.url);
  const owner = String(env.FEB_OWNER || 'owner').trim();

  const fromQuery = url.searchParams.get('k');
  if (fromQuery !== null) {
    const role = roleOf(fromQuery, env);
    if (!role) return { response: loginPage(401, '通行碼不對。') };
    /* 轉回同一個網址但拿掉 k：避免通行碼留在網址列、瀏覽紀錄、Referer 與書籤裡。 */
    url.searchParams.delete('k');
    const clean = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams : '') + url.hash;
    const res = new Response(null, { status: 302, headers: { Location: clean } });
    res.headers.append('Set-Cookie',
      `${COOKIE}=${encodeURIComponent(fromQuery)}; Path=/; Max-Age=31536000; `
      + 'HttpOnly; Secure; SameSite=Lax');
    res.headers.set('Cache-Control', 'private, no-store');
    return { response: res };
  }

  const role = roleOf(cookieValue(request, COOKIE), env);
  if (!role) {
    /* API 要的是機器可讀的錯誤，不是登入頁——前端才分得出「該重新登入」。 */
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return {
        response: new Response(
          JSON.stringify({ error: '需要通行碼', code: 'passcode_required' }),
          { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8',
                                    'Cache-Control': 'private, no-store' } }),
      };
    }
    return { response: loginPage(401, '') };
  }

  return {
    identity: {
      email: role === 'owner' ? owner : 'guest',
      role,
      owner,
    },
  };
}
