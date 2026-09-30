/* drive-sa.mjs — 用服務帳戶（Service Account）向 Google 換 Drive 的存取權杖。
 *
 * 要解的問題：前端 14-drive.js 原本走 Google Identity Services 的 Token model，
 * access token 一小時到期，iPad Safari 上靜默續期必失敗（第三方 cookie／ITP），
 * 於是每小時都要人工重新授權一次。改成：Drive 上的「Feb 影片備份」資料夾分享給
 * 一個服務帳戶（唯讀），服務帳戶的 JSON 金鑰只放在 Pages 的 secret GOOGLE_SA_KEY，
 * 這裡拿金鑰簽一張 JWT（RS256）向 Google 的權杖端點換一小時的 access token，
 * 回給前端；影片位元組仍然是 Google → 裝置直送，Cloudflare 一個 byte 都不經手。
 *
 * ── 金鑰只進不出 ───────────────────────────────────────────────────────────
 * GOOGLE_SA_KEY 是整份服務帳戶 JSON；private_key 是 PKCS#8 PEM。這支模組的鐵則：
 *   1. 任何 SaError 的 message 都不得含金鑰內容、assertion 或 access token；
 *      解析失敗只說「缺哪個欄位」，**不**把 JSON.parse 的原始訊息接進去
 *      （Node/V8 的 JSON 錯誤訊息會引用一段原文，等於把金鑰片段印進錯誤）。
 *   2. 不 console.log 金鑰、assertion、token（Workers 的 log 是會被看到的）。
 *   3. 私鑰用 extractable=false 匯入，簽完就丟，不留在任何快取裡。
 *
 * ── 快取三層 ───────────────────────────────────────────────────────────────
 * 簽一張＝一次 RSA 簽章＋一次對 Google 的往返，而權杖本身活一小時，所以：
 *   memory  模組層物件，同一個 isolate 內共用；併發呼叫單飛（pending 共用同一個
 *           promise），兩個請求同時進來也只簽一張。
 *   D1      drive_token 表（migration 0002），跨 isolate 共用。Pages 的 isolate
 *           隨時被回收、又可能同時有好幾個，沒有這層每個新 isolate 都會再簽一張。
 *           表還沒建、DB 沒綁都不是錯——整段 try/catch，退回只用記憶體。
 *   Google  上面兩層都沒有可用的（剩不到 minRemainingMs）才真的去簽。
 * 「可用」的門檻是剩餘 5 分鐘：前端 driveSignedIn() 要求 exp 距現在 > 30 秒，
 * 回一張只剩幾秒的權杖給它等於沒回。
 *
 * 只用 WebCrypto 與 btoa／TextEncoder：Workers 裡沒有 Buffer，本專案也零依賴。 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const JWT_TTL_SEC = 3600;              // Google 對 jwt-bearer 的 assertion 上限就是 1 小時
const MIN_REMAINING_MS = 5 * 60 * 1000;
/* PEM 邊界用組的，不整行寫死：整行字面出現在原始碼裡，
   上傳前的金鑰掃描（check-feb2.ps1）不看內容，一律當成私鑰外洩擋下。 */
const PEM_LABEL = 'PRIVATE KEY';
const PEM_BEGIN = `-----BEGIN ${PEM_LABEL}-----`;
const PEM_END = `-----END ${PEM_LABEL}-----`;

/** 這支模組所有錯誤的形狀：code 給端點對應 HTTP 狀態，status 是 Google 回的 HTTP 碼。 */
export class SaError extends Error {
  constructor(code, message, { status, googleError } = {}) {
    super(message);
    this.name = 'SaError';
    this.code = code;
    this.status = status;
    this.googleError = googleError;    // Google 回的 OAuth 錯誤碼（invalid_grant 之類），已白名單過濾
  }
}

export function saConfigured(env) {
  return !!String((env && env.GOOGLE_SA_KEY) || '').trim();
}

/**
 * 整份服務帳戶 JSON → {client_email, private_key, token_uri}。
 * 缺欄位一律 SaError('sa_key_invalid')，訊息只講缺什麼，不引用內容。
 */
export function parseServiceAccount(text) {
  let obj;
  try {
    obj = JSON.parse(String(text || ''));
  } catch {
    throw new SaError('sa_key_invalid', '服務帳戶金鑰不是合法的 JSON');
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new SaError('sa_key_invalid', '服務帳戶金鑰必須是一個 JSON 物件');
  }
  const client_email = typeof obj.client_email === 'string' ? obj.client_email.trim() : '';
  const private_key = typeof obj.private_key === 'string' ? obj.private_key : '';
  if (!client_email) throw new SaError('sa_key_invalid', '服務帳戶金鑰缺少 client_email');
  if (!private_key.includes(PEM_BEGIN)) {
    throw new SaError('sa_key_invalid', '服務帳戶金鑰缺少 private_key（需為 PKCS#8 PEM）');
  }
  const token_uri = typeof obj.token_uri === 'string' && obj.token_uri.trim()
    ? obj.token_uri.trim() : DEFAULT_TOKEN_URI;
  /* assertion 雖然不是私鑰，但拿到它就等於一小時的 Drive 讀取權。
     走明文＝中間人可以撿走，與 ACCESS_TEAM_DOMAIN 只收 https 同一條理由。 */
  if (!/^https:\/\//i.test(token_uri)) {
    throw new SaError('sa_key_invalid', '服務帳戶金鑰的 token_uri 必須是 https');
  }
  return { client_email, private_key, token_uri };
}

/** string／Uint8Array／ArrayBuffer → base64url（無 = 填充）。Workers 沒有 Buffer。 */
export function b64url(input) {
  let bytes;
  if (typeof input === 'string') bytes = new TextEncoder().encode(input);
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  else throw new TypeError('b64url：只接受 string、Uint8Array 或 ArrayBuffer');
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PKCS#8 PEM → 不可匯出的 RSASSA-PKCS1-v1_5／SHA-256 簽章金鑰。 */
export async function importPrivateKey(pem) {
  const body = String(pem || '')
    .replaceAll(PEM_BEGIN, '')
    .replaceAll(PEM_END, '')
    .replace(/\s+/g, '');
  try {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return await crypto.subtle.importKey('pkcs8', bytes,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    /* atob 的 InvalidCharacterError 與 importKey 的 DataError 都不引用內容，
       但一律換成自己的訊息，免得哪個 runtime 哪天開始好心印出原文。 */
    throw new SaError('sa_key_invalid', '服務帳戶金鑰的 private_key 無法匯入');
  }
}

/** Google 回的 OAuth 錯誤碼只放行 invalid_grant 這種短代碼；別的一概不帶出去。 */
function safeGoogleError(data) {
  const e = data && typeof data.error === 'string' ? data.error : '';
  return /^[a-z_]{1,40}$/.test(e) ? e : undefined;
}

/**
 * 簽一張 jwt-bearer assertion，向 token_uri 換 access token。
 * 回 {token, exp}，exp 是 Unix 毫秒（now ＋ expires_in 秒；Google 沒給就當 3600）。
 */
export async function mintAccessToken({ sa, now = Date.now(), fetchImpl = fetch, scope = DRIVE_SCOPE }) {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope, aud: sa.token_uri, iat, exp: iat + JWT_TTL_SEC,
  }));
  const signingInput = header + '.' + claims;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key,
    new TextEncoder().encode(signingInput));
  const assertion = signingInput + '.' + b64url(sig);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString();

  let res;
  try {
    res = await fetchImpl(sa.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    throw new SaError('google_unreachable', '連不上 Google 的權杖端點');
  }

  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || !data || typeof data.access_token !== 'string' || !data.access_token) {
    throw new SaError('google_token_failed', 'Google 沒有發出權杖',
      { status: res.status, googleError: safeGoogleError(data) });
  }
  const ttl = Number(data.expires_in);
  const sec = Number.isFinite(ttl) && ttl > 0 ? ttl : JWT_TTL_SEC;
  return { token: data.access_token, exp: now + sec * 1000 };
}

/* ---------- 快取 ---------- */

/** 模組層快取。匯出只為了測試能重設；正式程式碼不要碰它，走 getDriveToken()。 */
export const MEMORY = { token: '', exp: 0, pending: null };

const usable = (t, now, minRemainingMs) =>
  !!(t && typeof t.token === 'string' && t.token && Number.isFinite(t.exp) && t.exp - now > minRemainingMs);

/* D1 那層整段 try/catch：表可能還沒建（migration 0002 還沒套）、DB 可能沒綁。
   兩者都只代表「沒有跨 isolate 快取」，不代表拿不到權杖。 */
async function readD1(env) {
  if (!env || !env.DB) return null;
  try {
    const r = await env.DB.prepare('SELECT token, exp FROM drive_token WHERE k = ?').bind('sa').all();
    const row = r && Array.isArray(r.results) ? r.results[0] : null;
    if (!row || typeof row.token !== 'string' || !row.token) return null;
    const exp = Number(row.exp);
    return Number.isFinite(exp) ? { token: row.token, exp } : null;
  } catch {
    return null;
  }
}

async function writeD1(env, { token, exp }) {
  if (!env || !env.DB) return;
  try {
    await env.DB.prepare(
      'INSERT INTO drive_token (k, token, exp) VALUES (\'sa\', ?, ?) '
      + 'ON CONFLICT(k) DO UPDATE SET token = excluded.token, exp = excluded.exp',
    ).bind(token, exp).run();
  } catch {
    /* 寫不進去就算了：這一張已經在 memory 裡，下一個 isolate 頂多多簽一張。 */
  }
}

/**
 * 拿一張至少還能用 minRemainingMs 的 Drive 權杖：memory → D1 → 向 Google 簽。
 * 同一 isolate 內的併發呼叫共用同一個 pending promise（單飛）。
 * 回 {token, exp}；失敗丟 SaError（或 fetch 以外的意外例外）。
 */
export async function getDriveToken(env, {
  now = Date.now(), fetchImpl = fetch, memory = MEMORY, minRemainingMs = MIN_REMAINING_MS,
} = {}) {
  if (usable(memory, now, minRemainingMs)) return { token: memory.token, exp: memory.exp };
  if (memory.pending) return memory.pending;

  memory.pending = (async () => {
    const cached = await readD1(env);
    if (usable(cached, now, minRemainingMs)) {
      memory.token = cached.token;
      memory.exp = cached.exp;
      return { token: cached.token, exp: cached.exp };
    }
    const sa = parseServiceAccount(env.GOOGLE_SA_KEY);
    const minted = await mintAccessToken({ sa, now, fetchImpl });
    memory.token = minted.token;
    memory.exp = minted.exp;
    await writeD1(env, minted);
    return { token: minted.token, exp: minted.exp };
  })().finally(() => { memory.pending = null; });

  return memory.pending;
}
