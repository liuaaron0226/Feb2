/* drive-sa.test.js — 服務帳戶（Service Account）換 Drive 存取權杖的整條路。
   node --test tests/*.test.js（Node 22：node:sqlite 與 WebCrypto 都是內建）。

   這支測試存在的理由：iPad Safari 上 Google Identity Services 的靜默續期必失敗，
   每小時要人工重新授權一次。改成後端拿服務帳戶金鑰簽 JWT 向 Google 換權杖之後，
   金鑰只住在 Cloudflare 的 secret 裡——**任何回應、任何錯誤訊息都不准把它帶出來**。
   所以下面除了「簽得對不對、快取有沒有命中」，還反覆問同一件事：
   「出錯的時候，私鑰或 assertion 有沒有漏到回應裡？」答案必須永遠是沒有。

   作法：在本機生一把 RSA 金鑰假裝是服務帳戶的私鑰，把 fetch 換成會用對應公鑰
   驗章的假 Google 權杖端點；D1 用 node:sqlite 記憶體庫套真的 migration 跑。 */

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const SA_EMAIL = 'feb-test@example.iam.gserviceaccount.com';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const NOW = Date.UTC(2026, 8, 12, 0, 0, 0);          // 2026-09-12T00:00:00Z

let D;                   // functions/_lib/drive-sa.mjs
let T;                   // functions/api/drive/token.js
let S;                   // functions/api/drive/status.js
let keyPair;
let pem;
let env;
let realFetch;

/* PEM 標頭自己組、不拿 drive-sa.mjs 的常數：要驗的正是模組認不認得 Google 的真實格式，
   共用同一個常數就驗不出常數本身寫錯。不整行寫死的理由同 drive-sa.mjs（上傳前金鑰掃描）。 */
const PEM_LABEL = 'PRIVATE KEY';
const pemWrap = (body) => `-----BEGIN ${PEM_LABEL}-----\n${body}\n-----END ${PEM_LABEL}-----\n`;

/** PKCS#8 DER → 服務帳戶 JSON 裡 private_key 的那種 PEM（64 字元一行）。 */
function toPem(der) {
  const b64 = Buffer.from(der).toString('base64');
  const lines = b64.match(/.{1,64}/g).join('\n');
  return pemWrap(lines);
}

before(async () => {
  D = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/drive-sa.mjs')).href);
  T = await import(pathToFileURL(path.join(ROOT, 'functions/api/drive/token.js')).href);
  S = await import(pathToFileURL(path.join(ROOT, 'functions/api/drive/status.js')).href);
  keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  pem = toPem(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  env = {
    GOOGLE_SA_KEY: JSON.stringify({
      type: 'service_account', client_email: SA_EMAIL, private_key: pem, token_uri: TOKEN_URI,
    }),
  };
  realFetch = globalThis.fetch;
});

after(() => { globalThis.fetch = realFetch; });

/* ---------- 假的 Google 權杖端點 ---------- */

const GOOD_REPLY = { access_token: 'fixture-sa-token', expires_in: 3599, token_type: 'Bearer' };

/** 只記錄與回應，不在裡面做斷言：mint 會把 fetch 丟出的例外包成 SaError，
    斷言失敗混在裡面會被吞掉。請求長得對不對交給 checkGoogleCall() 事後驗。 */
function googleFetch({ status = 200, body = GOOD_REPLY } = {}) {
  const fn = async (url, init) => {
    fn.calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    });
  };
  fn.calls = [];
  return fn;
}

/** 拆開一次呼叫：網址、方法、表單、JWT 三段，用公鑰驗章，回 claims 讓測試再看。 */
async function checkGoogleCall(call) {
  assert.equal(call.url, TOKEN_URI);
  assert.equal(call.init.method, 'POST');
  assert.match(new Headers(call.init.headers).get('content-type'), /^application\/x-www-form-urlencoded/);
  const form = new URLSearchParams(call.init.body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const assertion = form.get('assertion');
  const parts = assertion.split('.');
  assert.equal(parts.length, 3, 'assertion 必須是 header.payload.signature');
  const [h, p, s] = parts;
  const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, keyPair.publicKey,
    Buffer.from(s, 'base64url'), new TextEncoder().encode(h + '.' + p));
  assert.equal(ok, true, '簽章必須是服務帳戶私鑰簽出來的');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString('utf8')), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  assert.equal(claims.iss, SA_EMAIL);
  assert.equal(claims.scope, DRIVE_SCOPE);
  assert.equal(claims.aud, TOKEN_URI);
  assert.equal(claims.exp - claims.iat, 3600);
  return { claims, assertion };
}

const freshMemory = () => ({ token: '', exp: 0, pending: null });

/* ---------- D1 的最小替身（照 cloud-progress-d1.test.js 縮的） ---------- */

class Stmt {
  constructor(db, sql, params) { this.db = db; this.sql = sql; this.params = params || []; }
  bind(...p) { return new Stmt(this.db, this.sql, p); }
  exec() {
    const st = this.db.prepare(this.sql);
    if (/^\s*SELECT/i.test(this.sql)) return { success: true, results: st.all(...this.params) };
    const r = st.run(...this.params);
    return { success: true, results: [], meta: { changes: Number(r.changes) } };
  }
  async all() { return this.exec(); }
  async run() { return this.exec(); }
}

class FakeD1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new Stmt(this.db, sql); }
}

function freshDb(migrations) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const m of migrations) db.exec(fs.readFileSync(path.join(ROOT, 'migrations', m), 'utf8'));
  return new FakeD1(db);
}

/** node:sqlite 的列是 null-prototype 物件，strict deepEqual 會比原型；先攤平。 */
const rowsOf = (d1, sql) => d1.db.prepare(sql).all().map((r) => ({ ...r }));

/* ================= _lib/drive-sa.mjs ================= */

test('b64url：字串、Uint8Array、ArrayBuffer 都吃，輸出無填充且用 -_', () => {
  assert.equal(D.b64url('hello'), 'aGVsbG8');
  assert.equal(D.b64url(new Uint8Array([251, 255])), '-_8');
  assert.equal(D.b64url(new Uint8Array([251, 255]).buffer), '-_8');
  assert.equal(D.b64url(''), '');
});

test('saConfigured：只看 GOOGLE_SA_KEY 有沒有非空白內容', () => {
  assert.equal(D.saConfigured({}), false);
  assert.equal(D.saConfigured({ GOOGLE_SA_KEY: '   ' }), false);
  assert.equal(D.saConfigured(env), true);
});

test('parseServiceAccount：缺 client_email／private_key 就丟 sa_key_invalid，訊息不含金鑰', () => {
  const sa = D.parseServiceAccount(env.GOOGLE_SA_KEY);
  assert.equal(sa.client_email, SA_EMAIL);
  assert.equal(sa.token_uri, TOKEN_URI);
  assert.equal(sa.private_key, pem);

  const noUri = D.parseServiceAccount(JSON.stringify({ client_email: SA_EMAIL, private_key: pem }));
  assert.equal(noUri.token_uri, TOKEN_URI, 'token_uri 缺省時用 Google 的預設端點');

  const bad = [
    'not json at all',
    JSON.stringify({ client_email: SA_EMAIL }),
    JSON.stringify({ private_key: pem }),
    JSON.stringify({ client_email: SA_EMAIL, private_key: 'secret-but-not-pem' }),
    JSON.stringify({ client_email: SA_EMAIL, private_key: pem, token_uri: 'http://oauth2.googleapis.com/token' }),
  ];
  for (const text of bad) {
    assert.throws(() => D.parseServiceAccount(text), (e) => {
      assert.equal(e.code, 'sa_key_invalid');
      assert.equal(e.message.includes('BEGIN PRIVATE KEY'), false);
      assert.equal(e.message.includes('secret-but-not-pem'), false);
      assert.equal(e.message.includes('not json at all'), false);
      return true;
    });
  }
});

test('mintAccessToken：JWT 簽得對、表單長得對、回 {token, exp}', async () => {
  const f = googleFetch();
  const sa = D.parseServiceAccount(env.GOOGLE_SA_KEY);
  const out = await D.mintAccessToken({ sa, now: NOW, fetchImpl: f });
  assert.equal(f.calls.length, 1);
  const { claims } = await checkGoogleCall(f.calls[0]);
  assert.equal(claims.iat, Math.floor(NOW / 1000));
  assert.deepEqual(out, { token: 'fixture-sa-token', exp: NOW + 3599 * 1000 });
});

test('mintAccessToken：Google 沒給 expires_in 就當 3600 秒', async () => {
  const f = googleFetch({ body: { access_token: 'fixture-sa-token' } });
  const sa = D.parseServiceAccount(env.GOOGLE_SA_KEY);
  const out = await D.mintAccessToken({ sa, now: NOW, fetchImpl: f });
  assert.equal(out.exp, NOW + 3600 * 1000);
});

test('mintAccessToken：Google 回非 2xx 或缺 access_token → SaError google_token_failed 帶 status', async () => {
  const sa = D.parseServiceAccount(env.GOOGLE_SA_KEY);
  await assert.rejects(
    () => D.mintAccessToken({ sa, now: NOW, fetchImpl: googleFetch({ status: 400, body: { error: 'invalid_grant' } }) }),
    (e) => e instanceof D.SaError && e.code === 'google_token_failed' && e.status === 400);
  await assert.rejects(
    () => D.mintAccessToken({ sa, now: NOW, fetchImpl: googleFetch({ status: 200, body: { token_type: 'Bearer' } }) }),
    (e) => e instanceof D.SaError && e.code === 'google_token_failed' && e.status === 200);
});

test('快取：同一個 memory 連續兩次只簽一次；剩不到 5 分鐘就重簽', async () => {
  const f = googleFetch();
  const memory = freshMemory();
  const a = await D.getDriveToken(env, { now: NOW, fetchImpl: f, memory });
  const b = await D.getDriveToken(env, { now: NOW + 60 * 1000, fetchImpl: f, memory });
  assert.equal(f.calls.length, 1, '第二次直接吃記憶體快取');
  assert.deepEqual(a, b);

  const nearEnd = NOW + 3599 * 1000 - 4 * 60 * 1000;   // 只剩 4 分鐘
  const c = await D.getDriveToken(env, { now: nearEnd, fetchImpl: f, memory });
  assert.equal(f.calls.length, 2, '剩 4 分鐘 < 5 分鐘門檻，要換一張新的');
  assert.equal(c.exp, nearEnd + 3599 * 1000);
  assert.equal(memory.exp, c.exp, '新的要寫回 memory');
});

test('併發：同一 isolate 同時兩次呼叫只簽一次（單飛）', async () => {
  const f = googleFetch();
  const memory = freshMemory();
  const [a, b] = await Promise.all([
    D.getDriveToken(env, { now: NOW, fetchImpl: f, memory }),
    D.getDriveToken(env, { now: NOW, fetchImpl: f, memory }),
  ]);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(a, b);
  assert.equal(memory.pending, null, '飛完要把 pending 放掉，否則下次過期永遠換不了');
});

test('併發：簽失敗時兩個等待者都收到同一個錯，pending 也要放掉', async () => {
  const f = googleFetch({ status: 500, body: {} });
  const memory = freshMemory();
  const results = await Promise.allSettled([
    D.getDriveToken(env, { now: NOW, fetchImpl: f, memory }),
    D.getDriveToken(env, { now: NOW, fetchImpl: f, memory }),
  ]);
  assert.equal(f.calls.length, 1);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[0].reason.code, 'google_token_failed');
  assert.equal(memory.pending, null);
  assert.equal(memory.token, '', '失敗不准留半張權杖在記憶體');
});

test('D1：第一次簽完落一列；換一個全新的 memory 再叫 → 讀 D1 命中，不打 Google', async () => {
  const d1 = freshDb(['0001_init.sql', '0002_drive_token.sql']);
  const envDb = { ...env, DB: d1 };
  const f = googleFetch();

  const a = await D.getDriveToken(envDb, { now: NOW, fetchImpl: f, memory: freshMemory() });
  assert.equal(f.calls.length, 1);
  assert.deepEqual(rowsOf(d1, 'SELECT k, token, exp FROM drive_token'),
    [{ k: 'sa', token: 'fixture-sa-token', exp: NOW + 3599 * 1000 }]);

  const memB = freshMemory();
  const b = await D.getDriveToken(envDb, { now: NOW + 1000, fetchImpl: f, memory: memB });
  assert.equal(f.calls.length, 1, '另一個 isolate 醒來要先問 D1，不是直接去簽');
  assert.deepEqual(b, a);
  assert.equal(memB.token, 'fixture-sa-token', 'D1 命中也要寫回 memory');
});

test('D1：表裡那列快過期 → 重簽並 upsert 覆蓋，永遠只有一列', async () => {
  const d1 = freshDb(['0001_init.sql', '0002_drive_token.sql']);
  const envDb = { ...env, DB: d1 };
  d1.db.prepare('INSERT INTO drive_token (k, token, exp) VALUES (?, ?, ?)')
    .run('sa', 'stale-token', NOW + 2 * 60 * 1000);      // 只剩 2 分鐘

  const f = googleFetch();
  const out = await D.getDriveToken(envDb, { now: NOW, fetchImpl: f, memory: freshMemory() });
  assert.equal(f.calls.length, 1);
  assert.equal(out.token, 'fixture-sa-token');
  assert.deepEqual(rowsOf(d1, 'SELECT k, token, exp FROM drive_token'),
    [{ k: 'sa', token: 'fixture-sa-token', exp: NOW + 3599 * 1000 }]);
});

test('D1：沒有 drive_token 表（只套 0001）→ 照樣簽得成，不拋錯', async () => {
  const d1 = freshDb(['0001_init.sql']);
  const envDb = { ...env, DB: d1 };
  const f = googleFetch();
  const memory = freshMemory();
  const out = await D.getDriveToken(envDb, { now: NOW, fetchImpl: f, memory });
  assert.equal(f.calls.length, 1);
  assert.equal(out.token, 'fixture-sa-token');
  assert.equal(memory.token, 'fixture-sa-token');
});

test('D1：DB 沒綁也不拋錯，退成只有記憶體快取', async () => {
  const f = googleFetch();
  const out = await D.getDriveToken(env, { now: NOW, fetchImpl: f, memory: freshMemory() });
  assert.equal(out.token, 'fixture-sa-token');
});

/* ================= /api/drive/token、/api/drive/status ================= */

/* 端點走的是模組層的 MEMORY 與 globalThis.fetch（沒有注入口——路由不該有測試專用參數），
   所以每個案例開始前把兩者換掉：fetch 換成假 Google，MEMORY 清空。 */
function arm(fetchImpl) {
  globalThis.fetch = fetchImpl;
  D.MEMORY.token = '';
  D.MEMORY.exp = 0;
  D.MEMORY.pending = null;
}

/** _middleware 驗完章之後交給路由的 context。data 只放它會放的三個欄位。 */
const ctx = ({ role = 'owner', headers = {}, env: e = env, method = 'POST' } = {}) => ({
  request: new Request('https://feb-6ah.pages.dev/api/drive/token', { method, headers }),
  env: e,
  data: { email: role === 'owner' ? 'owner@example.com' : 'guest', role, owner: 'owner@example.com' },
});

test('token：訪客（guest）→ 403 owner_only，而且根本沒去找 Google', async () => {
  const f = googleFetch();
  arm(f);
  const res = await T.onRequestPost(ctx({ role: 'guest' }));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.code, 'owner_only');
  assert.equal('token' in body, false);
  assert.equal(f.calls.length, 0);
});

test('token：Sec-Fetch-Site: cross-site → 403 cross_site（主人也一樣）', async () => {
  const f = googleFetch();
  arm(f);
  const res = await T.onRequestPost(ctx({ headers: { 'Sec-Fetch-Site': 'cross-site' } }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'cross_site');
  assert.equal(f.calls.length, 0);

  /* same-site（例如預覽別名子網域）也不是同源，一樣擋；same-origin 與 none 放行。 */
  const res2 = await T.onRequestPost(ctx({ headers: { 'Sec-Fetch-Site': 'same-site' } }));
  assert.equal(res2.status, 403);
  const res3 = await T.onRequestPost(ctx({ headers: { 'Sec-Fetch-Site': 'same-origin' } }));
  assert.equal(res3.status, 200);
  const res4 = await T.onRequestPost(ctx({ headers: { 'Sec-Fetch-Site': 'none' } }));
  assert.equal(res4.status, 200);
});

test('token：沒設 GOOGLE_SA_KEY → 501 sa_not_configured', async () => {
  const f = googleFetch();
  arm(f);
  const res = await T.onRequestPost(ctx({ env: {} }));
  assert.equal(res.status, 501);
  assert.equal((await res.json()).code, 'sa_not_configured');
  assert.equal(f.calls.length, 0);
});

test('token：主人同源 POST → 200 {token, exp, scope}，no-store，JWT 簽得對', async () => {
  const f = googleFetch();
  arm(f);
  const t0 = Date.now();
  const res = await T.onRequestPost(ctx());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Cache-Control'), /no-store/);
  assert.match(res.headers.get('Content-Type'), /application\/json/);
  const body = await res.json();
  assert.equal(body.token, 'fixture-sa-token');
  assert.equal(body.scope, DRIVE_SCOPE);
  assert.ok(Math.abs(body.exp - (t0 + 3599 * 1000)) < 5000, `exp 應在 now+3599s 附近，實際差 ${body.exp - t0}`);
  assert.equal(f.calls.length, 1);
  await checkGoogleCall(f.calls[0]);

  /* 同一個 isolate 再叫一次：吃快取，不再簽。 */
  const res2 = await T.onRequestPost(ctx());
  assert.equal(res2.status, 200);
  assert.equal((await res2.json()).token, 'fixture-sa-token');
  assert.equal(f.calls.length, 1);
});

test('token：Google 回 400 → 502 google_token_failed，回應不含私鑰也不含 assertion', async () => {
  const f = googleFetch({ status: 400, body: { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' } });
  arm(f);
  const res = await T.onRequestPost(ctx());
  assert.equal(res.status, 502);
  assert.match(res.headers.get('Cache-Control'), /no-store/);
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(body.code, 'google_token_failed');
  assert.match(body.detail, /400/);
  assert.equal(f.calls.length, 1);
  const { assertion } = await checkGoogleCall(f.calls[0]);
  assert.equal(text.includes('BEGIN PRIVATE KEY'), false);
  assert.equal(text.includes(assertion), false);
  assert.equal(text.includes(assertion.split('.')[2]), false, '連簽章那一段都不准出現');
  assert.equal(text.includes('Invalid JWT Signature'), false, 'Google 的 error_description 不轉發');
});

test('token：fetch 直接炸（連不上 Google）→ 502 google_unreachable', async () => {
  const f = async () => { throw new TypeError('fetch failed'); };
  arm(f);
  const res = await T.onRequestPost(ctx());
  assert.equal(res.status, 502);
  assert.equal((await res.json()).code, 'google_unreachable');
});

/* 決定：金鑰壞掉是「設定沒設對」，跟 sa_not_configured 同一家族 → 501，
   不用 502。502 的語意是「Google 那邊失敗、待會再試」，可是金鑰壞了再試一百次
   也不會好；前端看到 501 就該停止重試、提示主人去檢查 secret。 */
test('token：金鑰 JSON 缺 private_key → 501 sa_key_invalid，訊息不含金鑰內容', async () => {
  const f = googleFetch();
  arm(f);
  const badEnv = { GOOGLE_SA_KEY: JSON.stringify({ type: 'service_account', client_email: SA_EMAIL }) };
  const res = await T.onRequestPost(ctx({ env: badEnv }));
  assert.equal(res.status, 501);
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(body.code, 'sa_key_invalid');
  assert.equal(text.includes('BEGIN PRIVATE KEY'), false);
  assert.equal(text.includes(SA_EMAIL), false, '連 client_email 都不必回給前端');
  assert.equal(f.calls.length, 0);
});

test('token：private_key 有 header 但內容壞掉 → 501 sa_key_invalid，壞內容不外洩', async () => {
  const f = googleFetch();
  arm(f);
  const junk = 'THIS-IS-NOT-BASE64-@@@';
  const badEnv = {
    GOOGLE_SA_KEY: JSON.stringify({
      client_email: SA_EMAIL,
      private_key: pemWrap(junk),
    }),
  };
  const res = await T.onRequestPost(ctx({ env: badEnv }));
  assert.equal(res.status, 501);
  const text = await res.text();
  assert.equal(JSON.parse(text).code, 'sa_key_invalid');
  assert.equal(text.includes(junk), false);
  assert.equal(f.calls.length, 0);
});

test('status：回 {configured, owner}，訪客也看得到（只是兩個布林）', async () => {
  const res = await S.onRequestGet(ctx({ role: 'owner', method: 'GET' }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Cache-Control'), /no-store/);
  assert.deepEqual(await res.json(), { configured: true, owner: true });

  const res2 = await S.onRequestGet(ctx({ role: 'guest', method: 'GET' }));
  assert.deepEqual(await res2.json(), { configured: true, owner: false });

  const res3 = await S.onRequestGet(ctx({ role: 'owner', method: 'GET', env: {} }));
  assert.deepEqual(await res3.json(), { configured: false, owner: true });
});

test('路由只導出需要的方法：token 只有 POST、status 只有 GET，都沒有 onRequest', () => {
  assert.equal(typeof T.onRequestPost, 'function');
  assert.equal('onRequestGet' in T, false);
  assert.equal('onRequest' in T, false);
  assert.equal(typeof S.onRequestGet, 'function');
  assert.equal('onRequestPost' in S, false);
  assert.equal('onRequest' in S, false);
});
