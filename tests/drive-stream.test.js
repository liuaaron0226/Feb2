'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'site', 'js', '14-drive.js'), 'utf8');
function network(fetch) {
  const context = vm.createContext({
    CLOUD: false, URL, Date, console, AbortController, DOMException, Event,
    setTimeout, clearTimeout, window: {}, navigator: {}, document: {},
    fetch, addEventListener() {},
  });
  vm.runInContext(source, context);
  return vm.runInContext('driveRead', context);
}

test('影片已收到標頭但內容一直不回來時，逾時會取消整個請求', async () => {
  let signal;
  const read = network(async (_, options) => {
    signal = options.signal;
    return {status: 206, arrayBuffer: () => new Promise(() => {})};
  });
  await assert.rejects(read('https://fixture.invalid/drive/video', {timeoutMs: 15}),
    error => error.name === 'TimeoutError');
  assert.equal(signal.aborted, true);
});

test('跳轉或關閉播放器時可立即取消未完成的下載', async () => {
  let signal;
  const read = network(async (_, options) => {
    signal = options.signal;
    return {status: 206, arrayBuffer: () => new Promise(() => {})};
  });
  const parent = new AbortController();
  const pending = read('https://fixture.invalid/drive/video', {signal: parent.signal, timeoutMs: 30});
  parent.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(signal.aborted, true);
});
