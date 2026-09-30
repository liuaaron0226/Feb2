'use strict';
/* drive-auth.test.js — 14-drive.js 的權杖來源。

   2026-09-13 起主線是後端服務帳戶（POST /api/drive/token），GIS Token model 只剩退路。
   page({backend}) 四種情境：
     'on'    status 說已設定且我是主人 → 一律向後端要，絕不碰 GIS
     'off'   status 說沒設定 → 連 POST 都不打，退回 GIS（原本那三條測試在這個模式下跑）
     'guest' status 說我不是主人 → 不打 POST，退回 GIS 靜默續期
     'stale' status 問不到 → 實際 POST 一次，撞到 501 就記住 */
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'site', 'js', '14-drive.js'), 'utf8');

function page({backend = 'off', tokenTtlMs = 3600000} = {}) {
  const requests = [], timers = [], store = new Map(), posts = [];
  const google = {accounts: {oauth2: {initTokenClient(options) {
    return {requestAccessToken() { requests.push(options); }};
  }}}};
  let now = Date.UTC(2026, 8, 13, 0, 0, 0);
  const DateFake = new Proxy(Date, {construct: (T, args) => args.length ? new T(...args) : new T(now), get: (T, k) => k === 'now' ? () => now : T[k]});
  const context = vm.createContext({
    CLOUD: true, URL, Date: DateFake, console, Event,
    window: {google}, google,
    navigator: {serviceWorker: {controller: null, addEventListener() {}}},
    document: {baseURI: 'https://fixture.invalid/'},
    addEventListener() {},
    setTimeout(fn, ms) { const timer = {fn, ms}; timers.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.cancelled = true; },
    dataURL: name => name,
    fetch: async (name, options = {}) => {
      if (name === '/api/drive/status') {
        if (backend === 'stale') throw new Error('status 問不到（離線／端點暫時失敗）');   // 不知道後端狀態，只能實際打一次
        return {ok: true, status: 200, json: async () => ({configured: backend !== 'off', owner: backend === 'on'})};
      }
      if (name === '/api/drive/token') {
        posts.push(options);
        assert.equal(options.method, 'POST');
        assert.equal(options.credentials, 'same-origin');
        if (backend === 'off' || backend === 'stale') return {ok: false, status: 501, json: async () => ({code: 'sa_not_configured'})};
        if (backend === 'guest') return {ok: false, status: 403, json: async () => ({code: 'owner_only'})};
        return {ok: true, status: 200, json: async () => ({token: 'fixture-backend-' + posts.length, exp: now + tokenTtlMs})};
      }
      return {ok: true, json: async () => name === 'drive-client.json' ? {client_id: 'fixture'} : {files: {}}};
    },
    localStorage: {getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k)},
    sessionStorage: {getItem: () => null, removeItem() {}},
    toastMsg() {},
  });
  vm.runInContext(source, context);
  return {
    requests, posts, timers,
    auth: silent => vm.runInContext(`driveAuth(${silent !== false})`, context),
    signedIn: () => vm.runInContext('driveSignedIn()', context),
    currentToken: () => vm.runInContext('DRIVE.token', context),
    backendFlag: () => vm.runInContext('DRIVE.backend', context),
    canPlayGate: () => vm.runInContext('driveEnabled()', context),
    advance(ms) { now += ms; },
    expireWait() { timers.find(t => t.ms === 8000 && !t.cancelled).fn(); },
    fire(pred) { const t = timers.find(x => !x.cancelled && !x.fired && pred(x)); assert.ok(t, '找不到符合的計時器'); t.fired = true; return t.fn(); },
  };
}
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
const reply = token => ({access_token: token, expires_in: 3600});

/* ── 服務帳戶模式 ── */
test('後端已設定：driveAuth 向 POST /api/drive/token 要權杖，完全不碰 Google 視窗', async () => {
  const p = page({backend: 'on'});
  assert.equal(await p.auth(true), true);
  assert.equal(p.posts.length, 1);
  assert.equal(p.requests.length, 0, '不該呼叫 initTokenClient');
  assert.equal(p.signedIn(), true);
  assert.equal(p.currentToken(), 'fixture-backend-1');
  assert.equal(p.backendFlag(), true);
});

test('後端模式：互動式呼叫（按鈕）也走後端，同樣沒有 Google 視窗', async () => {
  const p = page({backend: 'on'});
  assert.equal(await p.auth(false), true);
  assert.equal(p.requests.length, 0);
  assert.equal(p.posts.length, 1);
});

test('後端模式：同時多個續期請求共用一次 POST', async () => {
  const p = page({backend: 'on'});
  const results = await Promise.all([p.auth(true), p.auth(true), p.auth(true)]);
  assert.deepEqual(results, [true, true, true]);
  assert.equal(p.posts.length, 1);
});

test('後端模式：到期前五分鐘自動換一張，不必等 401 也不用人按', async () => {
  const p = page({backend: 'on', tokenTtlMs: 3600000});
  await p.auth(true);
  const renew = p.timers.find(t => !t.cancelled && Math.abs(t.ms - (3600000 - 5 * 60000)) < 1000);
  assert.ok(renew, '應排一個「到期前五分鐘」的計時器，實際有：' + p.timers.map(t => t.ms).join(','));
  p.advance(3600000 - 5 * 60000);
  await renew.fn(); await flush();
  assert.equal(p.posts.length, 2, '計時器到了就再向後端要一張');
  assert.equal(p.currentToken(), 'fixture-backend-2');
  assert.equal(p.signedIn(), true);
});

test('status 說我不是主人：連 POST 都不打，退回 GIS 靜默續期（訪客只看得到自己的 Drive）', async () => {
  const p = page({backend: 'guest'});
  const pending = p.auth(true);
  await flush();
  assert.equal(p.posts.length, 0, 'status 已說 owner=false，不必再撞一次 403');
  assert.equal(p.backendFlag(), false);
  assert.equal(p.requests.length, 1, '退回 GIS 的靜默續期');
  p.expireWait();
  assert.equal(await pending, false);
});

/* ── GIS 退路（後端回 501 尚未設定） ── */
test('status 說尚未設定：退回 GIS，續期等待逾時後晚到的有效授權仍可恢復播放資格', async () => {
  const p = page();
  const pending = p.auth(true);
  await flush();
  assert.equal(p.posts.length, 0, 'status 已說 configured=false，不打 POST');
  assert.equal(p.backendFlag(), false);
  p.expireWait();
  assert.equal(await pending, false);
  p.requests[0].callback(reply('fixture-late'));
  assert.equal(p.signedIn(), true);
});

test('GIS 退路：同時需要續期的播放請求共用一次 Google 授權', async () => {
  const p = page();
  const first = p.auth(true), second = p.auth(true);
  await flush();
  assert.equal(p.requests.length, 1);
  p.requests[0].callback(reply('fixture-shared'));
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
});

test('GIS 退路：重新授權成功後，較舊請求的晚到回覆不得覆蓋新權杖', async () => {
  const p = page();
  const first = p.auth(true);
  await flush();
  p.expireWait();
  await first;
  const second = p.auth(true);
  await flush();
  p.requests[1].callback(reply('fixture-new'));
  assert.equal(await second, true);
  p.requests[0].callback(reply('fixture-old'));
  assert.equal(p.currentToken(), 'fixture-new');
});

test('status 問不到：先打一次 POST 撞到 501 就記住，之後不再重複打', async () => {
  const p = page({backend: 'stale'});
  const first = p.auth(true); await flush();
  assert.equal(p.posts.length, 1, 'status 問不到時只能實際打一次才知道');
  assert.equal(p.backendFlag(), false);
  p.expireWait(); await first;
  const second = p.auth(true); await flush(); p.expireWait(); await second;
  assert.equal(p.posts.length, 1, '501 之後應記住，不重複打');
});
