'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'site', 'sw.js'), 'utf8');
test('Google 拒絕舊權杖時，要求頁面強制續期而不是再送同一張', async t => {
  const messages = [], timers = [];
  let calls = 0, context;
  context = vm.createContext({
    URL, Headers, Request, Response, console,
    self: {
      registration: {scope: 'https://fixture.invalid/'},
      addEventListener() {},
      clients: {matchAll: async () => [{postMessage(message) {
        messages.push(message);
        queueMicrotask(() => vm.runInContext("DRIVE_TOK='fixture-new'; DRIVE_ASK_RES?.()", context));
      }}]},
    },
    setTimeout(fn, ms) { const timer = setTimeout(fn, ms); timers.push(timer); return timer; },
    clearTimeout,
    fetch: async () => ++calls === 1 ? new Response('', {status: 401})
      : new Response(new Uint8Array([1, 2, 3, 4]), {status: 206, headers: {'Content-Length': '4'}}),
  });
  t.after(() => timers.forEach(clearTimeout));
  vm.runInContext(source, context);
  vm.runInContext("DRIVE_MAP.fixture={size:4,mime:'video/mp4'}; DRIVE_TOK='fixture-old'", context);
  const response = await vm.runInContext("driveServe(new Request('https://fixture.invalid/drive/fixture',{headers:{Range:'bytes=0-3'}}),'fixture')", context);
  assert.equal(response.status, 206);
  assert.equal(calls, 2);
  assert.equal(messages[0].force, true);
});
