/* cloud-access.test.js — 證明 /api/* 的門真的是「驗簽章」而不是「看標頭」。
   node --test tests/*.test.js 跑。

   這支測試存在的理由只有一條：Cf-Access-Authenticated-User-Email 這個標頭是
   **可偽造的**。只要 Worker 有任何一條沒被 Access 蓋住的到達路徑（pages.dev 預覽
   網址、直接打 Worker），任何人送一個
       Cf-Access-Authenticated-User-Email: 主人的信箱
   就能拿走全部的考古題與備考進度。所以下面每一條都在問同一件事：
   「沒有一張簽得對的票，能不能進來？」答案必須永遠是不能。

   作法：在本機生一把 RSA 金鑰當作 Access 的簽章金鑰，把 globalThis.fetch 換成
   吐這把公鑰的假 JWKS 端點，然後拿真的與假的 token 各打一次。 */

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const TEAM = 'https://feb-test.cloudflareaccess.com';
const AUD = 'a'.repeat(64);
const OWNER = 'owner@example.com';

let A;                   // functions/_lib/access.mjs
let keyPair;
let publicJwk;
let realFetch;
let certFetches = 0;

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 用測試金鑰簽一張 JWT。overrides 可以蓋掉 header 或 payload 的任何欄位。 */
async function sign(payload, { header = {}, tamper = null, key = null } = {}) {
  const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'test-kid', typ: 'JWT', ...header }));
  const p = b64url(JSON.stringify(payload));
  const data = new TextEncoder().encode(h + '.' + p);
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' },
    key || keyPair.privateKey, data);
  let token = `${h}.${p}.${b64url(sig)}`;
  if (tamper) token = tamper(token, { h, p, sig: b64url(sig) });
  return token;
}

/** 攔下錯誤本體。assert.rejects 只回 undefined，攔不到 err.code —— 而
    「以哪一條理由拒絕」正是這支測試要斷言的東西（拒絕的理由錯了，
    代表擋住它的是別條規則，那條真正該擋的規則其實是壞的）。 */
async function rejects(fn, why) {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  assert.fail(why || '應該要被拒絕，卻放行了');
}

const now = Date.UTC(2026, 8, 2, 0, 0, 0);          // 2026-09-02T00:00:00Z
const goodPayload = (over = {}) => ({
  type: 'app', aud: [AUD], iss: TEAM, email: OWNER,
  iat: Math.floor(now / 1000) - 60, exp: Math.floor(now / 1000) + 3600,
  sub: 'sub-1', ...over,
});

const req = (headers = {}) => new Request('https://feb.pages.dev/api/whoami', { headers });
const env = (over = {}) => ({
  ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: TEAM, FEB_OWNER: OWNER, ...over,
});

before(async () => {
  A = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/access.mjs')).href);
  keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  publicJwk = { kid: 'test-kid', kty: 'RSA', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e };

  realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u === TEAM + '/cdn-cgi/access/certs') {
      certFetches++;
      return new Response(JSON.stringify({ keys: [publicJwk] }),
        { headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('測試中不該打這個網址：' + u);
  };
});

after(() => { globalThis.fetch = realFetch; });

/* ---------- 沒設定就全鎖 ---------- */

test('ACCESS_AUD 沒設 → 全鎖（fail closed），錯誤訊息說得出缺什麼', async () => {
  const token = await sign(goodPayload());
  const e = await rejects(
    () => A.authenticate(req({ 'Cf-Access-Jwt-Assertion': token }),
      env({ ACCESS_AUD: '' }), { now }));
  assert.equal(e.code, 'access_not_configured');
  assert.match(e.message, /ACCESS_AUD/);
  assert.match(e.message, /fail closed/);
});

test('ACCESS_TEAM_DOMAIN 或 FEB_OWNER 沒設也一樣全鎖', async () => {
  const token = await sign(goodPayload());
  for (const missing of ['ACCESS_TEAM_DOMAIN', 'FEB_OWNER']) {
    const e = await rejects(
      () => A.authenticate(req({ 'Cf-Access-Jwt-Assertion': token }),
        env({ [missing]: '' }), { now }));
    assert.equal(e.code, 'access_not_configured', missing);
    assert.match(e.message, new RegExp(missing));
  }
});

test('FEB_OWNER 沒設時不得預設成「大家都是主人」', async () => {
  // 這條看起來多餘，但它擋的是最貴的那種 bug：設定漏了一項，
  // 系統「盡量繼續運作」，於是每個登入的人都拿到寫入權。
  const token = await sign(goodPayload());
  const e = await rejects(
    () => A.authenticate(req({ 'Cf-Access-Jwt-Assertion': token }), env({ FEB_OWNER: undefined }), { now }));
  assert.equal(e.code, 'access_not_configured');
});

/* ---------- 標頭不是證明 ---------- */

test('只送 Cf-Access-Authenticated-User-Email 標頭（偽造身分）→ 拒絕', async () => {
  const e = await rejects(
    () => A.authenticate(req({ 'Cf-Access-Authenticated-User-Email': OWNER }), env(), { now }));
  assert.equal(e.code, 'no_token');
});

test('完全沒有憑證 → 拒絕', async () => {
  const e = await rejects(() => A.authenticate(req(), env(), { now }));
  assert.equal(e.code, 'no_token');
});

/* ---------- 簽章與 claim ---------- */

test('簽得對的 token → 放行，email 來自 payload 而非標頭', async () => {
  const token = await sign(goodPayload());
  const id = await A.authenticate(
    req({ 'Cf-Access-Jwt-Assertion': token,
          'Cf-Access-Authenticated-User-Email': 'attacker@example.com' }),
    env(), { now });
  assert.equal(id.email, OWNER);
  assert.equal(id.role, 'owner');
});

test('Access 種在本網域的 CF_Authorization cookie 也認（同一張簽過章的票）', async () => {
  const token = await sign(goodPayload({ email: 'guest@example.com' }));
  const id = await A.authenticate(req({ Cookie: `foo=1; CF_Authorization=${token}; bar=2` }), env(), { now });
  assert.equal(id.email, 'guest@example.com');
  assert.equal(id.role, 'guest');
});

test('改過 payload 的 token（把 email 換成主人）→ 簽章對不上，拒絕', async () => {
  const token = await sign(goodPayload({ email: 'attacker@example.com' }), {
    tamper: (t, { h, sig }) => `${h}.${b64url(JSON.stringify(goodPayload()))}.${sig}`,
  });
  const e = await rejects(() => A.authenticate(req({ 'Cf-Access-Jwt-Assertion': token }), env(), { now }));
  assert.equal(e.code, 'bad_signature');
});

test('alg=none 的 token → 拒絕（演算法混淆）', async () => {
  const h = b64url(JSON.stringify({ alg: 'none', kid: 'test-kid', typ: 'JWT' }));
  const p = b64url(JSON.stringify(goodPayload()));
  const e = await rejects(
    () => A.authenticate(req({ 'Cf-Access-Jwt-Assertion': `${h}.${p}.` }), env(), { now }));
  assert.equal(e.code, 'bad_alg');
});

test('alg=HS256（拿公鑰當共享密鑰）→ 拒絕', async () => {
  const h = b64url(JSON.stringify({ alg: 'HS256', kid: 'test-kid', typ: 'JWT' }));
  const p = b64url(JSON.stringify(goodPayload()));
  const hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(publicJwk.n),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(h + '.' + p));
  const e = await rejects(
    () => A.authenticate(req({ 'Cf-Access-Jwt-Assertion': `${h}.${p}.${b64url(sig)}` }), env(), { now }));
  assert.equal(e.code, 'bad_alg');
});

test('別把金鑰簽的 token → 拒絕', async () => {
  const other = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const token = await sign(goodPayload(), { key: other.privateKey });
  const e = await rejects(() => A.authenticate(req({ 'Cf-Access-Jwt-Assertion': token }), env(), { now }));
  assert.equal(e.code, 'bad_signature');
});

test('過期的 token → 拒絕', async () => {
  const token = await sign(goodPayload({ exp: Math.floor(now / 1000) - 1 }));
  const e = await rejects(() => A.authenticate(req({ 'Cf-Access-Jwt-Assertion': token }), env(), { now }));
  assert.equal(e.code, 'expired');
});

test('aud 不是本應用 → 拒絕（同團隊的其他應用不得共用這張票）', async () => {
  const token = await sign(goodPayload({ aud: ['b'.repeat(64)] }));
  const e = await rejects(() => A.authenticate(req({ 'Cf-Access-Jwt-Assertion': token }), env(), { now }));
  assert.equal(e.code, 'bad_audience');
});

test('iss 是 token 自己寫的別的團隊 → 拒絕（iss 只認設定檔那個）', async () => {
  const token = await sign(goodPayload({ iss: 'https://evil.cloudflareaccess.com' }));
  const e = await rejects(() => A.authenticate(req({ 'Cf-Access-Jwt-Assertion': token }), env(), { now }));
  assert.equal(e.code, 'bad_issuer');
});

test('沒有 email 的服務代幣 → 拒絕（這是給人用的站）', async () => {
  const token = await sign(goodPayload({ email: undefined, sub: '', common_name: 'x.access' }));
  const e = await rejects(() => A.authenticate(req({ 'Cf-Access-Jwt-Assertion': token }), env(), { now }));
  assert.equal(e.code, 'no_email');
});

test('kid 不在公鑰清單裡 → 拒絕（不會自己相信 token 附的金鑰）', async () => {
  const token = await sign(goodPayload(), { header: { kid: 'not-in-jwks' } });
  const e = await rejects(() => A.authenticate(req({ 'Cf-Access-Jwt-Assertion': token }), env(), { now }));
  assert.equal(e.code, 'unknown_kid');
});

/* ---------- 角色 ---------- */

test('主人／訪客的判定不分大小寫，訪客不是主人', async () => {
  const upper = await sign(goodPayload({ email: OWNER.toUpperCase() }));
  assert.equal((await A.authenticate(req({ 'Cf-Access-Jwt-Assertion': upper }), env(), { now })).role, 'owner');
  const guest = await sign(goodPayload({ email: 'friend@example.com' }));
  assert.equal((await A.authenticate(req({ 'Cf-Access-Jwt-Assertion': guest }), env(), { now })).role, 'guest');
});

/* ---------- 團隊網域正規化 ---------- */

test('團隊網域正規化：吃裸網域、去尾斜線、拒絕 http', () => {
  assert.equal(A.normalizeTeamDomain('feb.cloudflareaccess.com'), 'https://feb.cloudflareaccess.com');
  assert.equal(A.normalizeTeamDomain('https://feb.cloudflareaccess.com/'), 'https://feb.cloudflareaccess.com');
  assert.equal(A.normalizeTeamDomain('http://feb.cloudflareaccess.com'), '',
    '公鑰不准走明文取得——中間人換掉公鑰就等於換掉整套身分');
  assert.equal(A.normalizeTeamDomain(''), '');
});

test('公鑰有快取，不是每一個請求都去打 Access', async () => {
  const before = certFetches;
  const token = await sign(goodPayload());
  for (let i = 0; i < 3; i++) {
    await A.authenticate(req({ 'Cf-Access-Jwt-Assertion': token }), env(), { now });
  }
  assert.equal(certFetches, before, '同一個團隊網域在 TTL 內不該重抓公鑰');
});
