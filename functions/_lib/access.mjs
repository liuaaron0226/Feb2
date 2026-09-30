/* access.mjs — Cloudflare Access 的 JWT 驗章。
 *
 * ── 為什麼不看 Cf-Access-Authenticated-User-Email ─────────────────────────────
 * 那個標頭是 Access 在代理層加上去的，只有「請求真的經過 Access」時才可信。
 * Pages / Workers 有不只一條到得了的路（*.pages.dev 預覽網址、直接打到 Worker），
 * 只要有一條沒被 Access 蓋住，任何人都能自己送一個
 *     Cf-Access-Authenticated-User-Email: 主人的信箱
 * 進來，然後拿到全部的考古題與進度。標頭是「宣稱」，簽章才是「證明」。
 * 官方文件（cloudflare-one/.../authorization-cookie/application-token/）也明講：
 * 「Validation of the header alone is not sufficient — the JWT and signature
 *   must be confirmed to avoid identity spoofing.」
 *
 * ── 驗什麼 ───────────────────────────────────────────────────────────────────
 * 1. alg 必須是 RS256（不接受 none、不接受 HS*——避免演算法混淆）
 * 2. 簽章對得上團隊網域公布的公鑰（${TEAM_DOMAIN}/cdn-cgi/access/certs 的 JWK）
 * 3. exp 未過期、iat/nbf 不在未來（容許 60 秒時鐘誤差）
 * 4. iss 等於設定裡的團隊網域（**不是** token 自己寫的那個——那是攻擊者可控欄位）
 * 5. aud 含 ACCESS_AUD（哪一個 Access 應用簽的。少了這一條，同一個團隊底下
 *    任何一個應用的 token 都能拿來開這裡）
 * 6. 有 email（服務代幣沒有 email，這是給人用的站）
 *
 * ── 沒設定就全鎖 ─────────────────────────────────────────────────────────────
 * ACCESS_AUD / ACCESS_TEAM_DOMAIN / FEB_OWNER 任一沒設 → 一律 403。
 * 不預設、不猜、不放行。這裡放的是使用者的考古題與備考進度，
 * 「還沒設定好」的正確行為是誰都進不來，不是暫時開著。
 *
 * ── 沒有 localhost／DEV 後門 ─────────────────────────────────────────────────
 * 本檔不看 hostname、不看 request.cf、不看任何 DEV 旗標。
 * 後門的問題不是它會不會被用，是它一定會有一天忘了關。
 * 本機要試 API，就在 Access 底下用真的身分試。
 */

const CERT_TTL_MS = 3600_000;      // 公鑰快取一小時
const CERT_MISS_COOLDOWN_MS = 60_000;   // kid 對不上時最多每分鐘重抓一次
const CLOCK_SKEW_S = 60;

/* isolate 層級的公鑰快取。Worker isolate 可能隨時被回收，快取沒了就重抓，
   沒有正確性問題，只是多一次 fetch。 */
const certCache = new Map();       // teamDomain -> {keys, fetchedAt, lastMissAt}

export class AccessError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

function b64urlBytes(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}

/** 團隊網域正規化：吃 `feb.cloudflareaccess.com` 或 `https://feb.cloudflareaccess.com/`，
    一律吐 `https://feb.cloudflareaccess.com`（iss 比對要逐字相同）。 */
export function normalizeTeamDomain(raw) {
  let d = String(raw || '').trim();
  if (!d) return '';
  if (!/^https?:\/\//i.test(d)) d = 'https://' + d;
  try {
    const u = new URL(d);
    if (u.protocol !== 'https:') return '';
    return 'https://' + u.host;
  } catch {
    return '';
  }
}

async function fetchCerts(teamDomain) {
  const res = await fetch(teamDomain + '/cdn-cgi/access/certs', {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new AccessError('certs_unavailable', '取不到 Access 公鑰', 'HTTP ' + res.status);
  const body = await res.json();
  const keys = Array.isArray(body && body.keys) ? body.keys : [];
  if (!keys.length) throw new AccessError('certs_empty', 'Access 公鑰清單是空的');
  return keys;
}

async function keyForKid(teamDomain, kid) {
  const now = Date.now();
  let slot = certCache.get(teamDomain);
  if (!slot || now - slot.fetchedAt > CERT_TTL_MS) {
    slot = { keys: await fetchCerts(teamDomain), fetchedAt: now, lastMissAt: 0 };
    certCache.set(teamDomain, slot);
  }
  let jwk = slot.keys.find((k) => k && k.kid === kid);
  /* kid 對不上＝可能剛輪替過公鑰。重抓一次，但設冷卻時間：
     否則隨便一個亂編 kid 的請求都能逼我們去打一次 Access。 */
  if (!jwk && now - slot.lastMissAt > CERT_MISS_COOLDOWN_MS) {
    slot.lastMissAt = now;
    slot.keys = await fetchCerts(teamDomain);
    slot.fetchedAt = now;
    jwk = slot.keys.find((k) => k && k.kid === kid);
  }
  if (!jwk) throw new AccessError('unknown_kid', 'JWT 的簽章金鑰不在 Access 公鑰清單裡');
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

/** 從請求裡取出 Access 的 JWT。標頭優先，其次是 Access 在本網域種的 cookie。
    兩者都是同一把簽過章的 token——下面照樣驗章，取哪一把都不影響安全性。 */
export function tokenFromRequest(request) {
  const h = request.headers.get('Cf-Access-Jwt-Assertion');
  if (h) return h.trim();
  const cookie = request.headers.get('Cookie') || '';
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m ? decodeURIComponent(m[1]).trim() : '';
}

/**
 * 驗一張 Access JWT，回 payload。任何一關過不了都丟 AccessError。
 * @param {string} token
 * @param {{teamDomain: string, aud: string, now?: number}} cfg
 */
export async function verifyAccessJwt(token, cfg) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new AccessError('malformed', 'JWT 格式不正確');

  let header;
  let payload;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch {
    throw new AccessError('malformed', 'JWT 解不開');
  }
  if (!header || header.alg !== 'RS256') {
    throw new AccessError('bad_alg', 'JWT 的簽章演算法不是 RS256', String(header && header.alg));
  }
  if (!header.kid) throw new AccessError('no_kid', 'JWT 沒有 kid，找不到該用哪把公鑰');

  const key = await keyForKid(cfg.teamDomain, header.kid);
  const ok = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    b64urlBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1]),
  );
  if (!ok) throw new AccessError('bad_signature', 'JWT 簽章驗證失敗');

  const nowS = Math.floor((cfg.now === undefined ? Date.now() : cfg.now) / 1000);
  if (typeof payload.exp !== 'number') throw new AccessError('no_exp', 'JWT 沒有 exp');
  if (nowS >= payload.exp) throw new AccessError('expired', 'JWT 已過期');
  if (typeof payload.nbf === 'number' && nowS + CLOCK_SKEW_S < payload.nbf) {
    throw new AccessError('not_yet_valid', 'JWT 還沒生效');
  }
  if (typeof payload.iat === 'number' && nowS + CLOCK_SKEW_S < payload.iat) {
    throw new AccessError('issued_in_future', 'JWT 的簽發時間在未來');
  }
  if (payload.iss !== cfg.teamDomain) {
    throw new AccessError('bad_issuer', 'JWT 的簽發者不是本站設定的 Access 團隊網域');
  }
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(cfg.aud)) {
    throw new AccessError('bad_audience', 'JWT 不是簽給本應用的（aud 不符）');
  }
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) throw new AccessError('no_email', 'JWT 裡沒有 email（服務代幣不得用於本站）');

  return { payload, email };
}

/**
 * 一次做完「設定齊全嗎 → 有 token 嗎 → 驗得過嗎 → 是不是主人」。
 * 回 {email, role, owner, payload}；任何一關不過就丟 AccessError。
 *
 * role：'owner' 讀寫真實資料；'guest' 唯讀，讀的是**主人的**同一塊看板
 *       （鏡射 T12／ADR-0007 的裝置模型：訪客看得到同一個畫面，只隔離寫入）。
 */
export async function authenticate(request, env, opts = {}) {
  const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  const aud = String(env.ACCESS_AUD || '').trim();
  const owner = String(env.FEB_OWNER || '').trim().toLowerCase();

  const missing = [];
  if (!aud) missing.push('ACCESS_AUD');
  if (!teamDomain) missing.push('ACCESS_TEAM_DOMAIN');
  if (!owner) missing.push('FEB_OWNER');
  if (missing.length) {
    throw new AccessError(
      'access_not_configured',
      'Cloudflare Access 尚未設定完成，本 API 全面拒絕存取（fail closed）。'
      + '在 Zero Trust 建好 Access 應用、拿到 AUD 之後，把下列環境變數設進 Pages 專案再試：'
      + missing.join('、'),
      missing.join(','),
    );
  }

  const token = tokenFromRequest(request);
  if (!token) {
    throw new AccessError(
      'no_token',
      '這個請求沒有帶 Cloudflare Access 的身分憑證，可能是繞過了 Access 直接打到 API。',
    );
  }

  const { payload, email } = await verifyAccessJwt(token, { teamDomain, aud, now: opts.now });
  return { email, role: email === owner ? 'owner' : 'guest', owner, payload };
}

/** AccessError → 回應。一律 403：不揭露「是沒設定還是驗不過」以外的細節。 */
export function accessErrorResponse(err) {
  const code = err instanceof AccessError ? err.code : 'auth_failed';
  const message = err instanceof AccessError ? err.message : '身分驗證失敗';
  const body = { error: message, code };
  if (err instanceof AccessError && err.detail) body.detail = err.detail;
  return new Response(JSON.stringify(body), {
    status: 403,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      Vary: 'Cookie, Cf-Access-Jwt-Assertion',
    },
  });
}
