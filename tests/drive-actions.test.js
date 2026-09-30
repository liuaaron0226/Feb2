'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'site', 'js', '14-drive.js'), 'utf8');
const code = '115暑電子08';
const name = 'Early-Effect';

// 只驗事件入口到播放器的交接；媒體解碼、串流與 Safari 相容性不在這個測試內。
function createPage({signedIn = true} = {}) {
  const opened = [], notices = [], listeners = new Set();
  const ledger = {files: {
    [code]: {id: 'fixture-original', name: 'fixture.mp4', size: 1024},
    [code + '.frag.mp4']: {id: 'fixture-fragmented', size: 1024},
    [code + '.fragidx.json']: {id: 'fixture-index', size: 128},
  }};
  const storage = new Map();
  if (signedIn) storage.set('feb-drive-tok', JSON.stringify({
    t: 'fixture-not-a-real-credential', e: Date.now() + 3600000,
  }));
  const serviceWorker = {
    controller: {
      postMessage(message) {
        if (message.type === 'drive-ping') queueMicrotask(() => {
          for (const listener of listeners) listener({data: {type: 'drive-pong', ok: true}});
        });
      },
    },
    addEventListener(type, listener) { if (type === 'message') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'message') listeners.delete(listener); },
  };
  const context = vm.createContext({
    CLOUD: true, URL, Date, console, setTimeout, clearTimeout,
    addEventListener() {},
    navigator: {userAgent: 'iPad', platform: 'MacIntel', maxTouchPoints: 5, serviceWorker},
    window: {MediaSource: class { static isTypeSupported() { return true; } }},
    document: {baseURI: 'https://feb.example/'},
    localStorage: {getItem: key => storage.get(key) ?? null},
    sessionStorage: {getItem: () => null},
    dataURL: file => 'https://feb.example/data/' + file,
    spNorm: value => value,
    fetch: async url => {
      const fixtures = {
        'https://feb.example/data/drive-client.json': {client_id: 'fixture-client'},
        'https://feb.example/data/drive-map.json': ledger,
      };
      assert.ok(Object.hasOwn(fixtures, url), '不可呼叫未宣告的網路端點');
      return {ok: true, json: async () => fixtures[url]};
    },
    closeCompanion() {},
    openPlayer: (...args) => opened.push(args),
    toastMsg: message => notices.push(message),
  });
  vm.runInContext(source, context, {filename: '14-drive.js'});
  return {
    opened, notices,
    click: () => vm.runInContext(
      `driveCompanionClick('play', ${JSON.stringify(code)}, ${JSON.stringify(name)})`, context),
  };
}

test('已連結 Drive 的 iPad 按主播放按鈕會交接給 Feb 播放器', async () => {
  const page = createPage();
  await page.click();
  assert.deepEqual(page.opened, [['https://feb.example/drive/fixture-original', name, code]]);
  assert.deepEqual(page.notices, []);
});

test('尚未連結 Drive 時不播放，也不跳過 Google 授權', async () => {
  const page = createPage({signedIn: false});
  await page.click();
  assert.deepEqual(page.opened, []);
  assert.deepEqual(page.notices, ['串流開不起來：還沒連結 Google 帳號，或授權過期了']);
});
