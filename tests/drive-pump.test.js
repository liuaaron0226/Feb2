'use strict';
/* drive-pump.test.js — 14-drive.js 的 MSE 取片管線（2026-09-13 重寫版）。

   要驗的是「排程行為」，不是媒體解碼：用假的 MediaSource／SourceBuffer／<video>
   跟假的 fetch 把 driveMSEAttach() 跑起來，看它怎麼發請求、怎麼餵、怎麼取消。
   2026-09-12 以前的版本一次只發一個請求、每批 2 MB、緩衝越低抓越少、任何 waiting
   就無條件暫停到 24 秒——iPad 3 倍速因此頻繁「緩衝中」。這裡的每一條都對應一個
   當時的病灶，改壞任何一條就會紅。 */
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'site', 'js', '14-drive.js'), 'utf8');
const code = '115暑電子08';
const MiB = 1024 * 1024;

/* 固定的索引：300 片、每片 8 秒／757,760 bytes、位元組連續，跟 remux-frag.py 產的一樣。 */
const FRAG_SEC = 8, FRAG_LEN = 757760, INIT_LEN = 1284, N = 300;
function fixtureIndex(){
  const frags = [];
  let off = INIT_LEN;
  for(let i = 0; i < N; i++){ frags.push([i * FRAG_SEC, off, FRAG_LEN]); off += FRAG_LEN; }
  return {v: 1, codecs: 'video/mp4; codecs="avc1.4D401F,mp4a.40.2"', dur: N * FRAG_SEC,
          size: off + 60000, init: [0, INIT_LEN], frags};
}
const IDX = fixtureIndex();
const fragOf = off => Math.floor((off - INIT_LEN) / FRAG_LEN);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000, what = ''){
  const t0 = Date.now();
  while(!fn()){
    if(Date.now() - t0 > ms) throw new Error('等不到：' + what);
    await sleep(5);
  }
}

class Emitter {
  constructor(){ this._l = new Map(); }
  addEventListener(name, fn, opts){
    if(!this._l.has(name)) this._l.set(name, new Set());
    this._l.get(name).add(fn);
    if(opts?.once){ const orig = fn; const wrap = ev => { this.removeEventListener(name, wrap); orig(ev); }; this._l.get(name).delete(fn); this._l.get(name).add(wrap); }
    opts?.signal?.addEventListener('abort', () => this.removeEventListener(name, fn), {once: true});
  }
  removeEventListener(name, fn){ this._l.get(name)?.delete(fn); }
  dispatch(name, ev = {}){ for(const fn of [...(this._l.get(name) || [])]) fn({type: name, ...ev}); }
}
class Ranges {
  constructor(list){ this.list = list; }
  get length(){ return this.list.length; }
  start(i){ return this.list[i][0]; }
  end(i){ return this.list[i][1]; }
}
function union(spans){
  const s = spans.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for(const [a, b] of s){
    const last = out[out.length - 1];
    if(last && a <= last[1] + .001) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}

/** 假 SourceBuffer：append 是非同步的（下一個 tick 才 updateend），跟真的一樣不能重入。 */
class FakeSourceBuffer extends Emitter {
  constructor(page){ super(); this.page = page; this.updating = false; this.mode = ''; this.spans = []; this.appended = []; this.bytes = 0; this.quota = Infinity; }
  get buffered(){ return new Ranges(union(this.spans)); }
  appendBuffer(buf){
    if(this.updating) throw new DOMException('busy', 'InvalidStateError');
    const meta = this.page.bufMeta.get(buf);
    if(!meta) throw new Error('append 了不是 fetch 回來的東西');
    if(meta.off !== 0 && this.bytes + buf.byteLength > this.quota) throw new DOMException('quota', 'QuotaExceededError');
    this.updating = true;
    setTimeout(() => {
      if(meta.off === 0){ /* init 段 */ }
      else{
        const first = fragOf(meta.off), last = fragOf(meta.off + meta.len - 1);
        this.spans.push([IDX.frags[first][0], IDX.frags[last][0] + FRAG_SEC]);
        this.appended.push([first, last]);
        this.bytes += buf.byteLength;
      }
      this.updating = false; this.dispatch('updateend');
    }, 0);
  }
  remove(a, b){
    if(this.updating) throw new DOMException('busy', 'InvalidStateError');
    this.updating = true;
    setTimeout(() => {
      this.spans = this.spans.flatMap(([s, e]) => {
        if(b <= s || a >= e) return [[s, e]];
        const out = []; if(a > s) out.push([s, a]); if(b < e) out.push([b, e]); return out;
      });
      this.bytes = 0;      // 簡化：清過就當作配額釋放
      this.updating = false; this.dispatch('updateend');
    }, 0);
  }
}
class FakeMediaSource extends Emitter {
  static isTypeSupported(){ return true; }
  constructor(page){ super(); this.page = page; this.readyState = 'closed'; this.duration = 0; this.sb = null; }
  open(){ this.readyState = 'open'; setTimeout(() => this.dispatch('sourceopen'), 0); }
  addSourceBuffer(){ this.sb = new FakeSourceBuffer(this.page); return this.sb; }
  endOfStream(){ this.readyState = 'ended'; }
}
class FakeManagedMediaSource extends FakeMediaSource { constructor(page){ super(page); this.streaming = false; } }

class FakeVideo extends Emitter {
  constructor(page){ super(); this.page = page; this.currentTime = 0; this.playbackRate = 2; this.paused = true; this.seeking = false; this._src = ''; this.plays = 0; }
  get buffered(){ return this.page.ms?.sb ? this.page.ms.sb.buffered : new Ranges([]); }
  set src(u){ this._src = u; if(u && this.page.ms) this.page.ms.open(); }
  get src(){ return this._src; }
  play(){ this.paused = false; this.plays++; this.dispatch('play'); return Promise.resolve(); }
  pause(){ if(!this.paused){ this.paused = true; this.dispatch('pause'); } }
  load(){} removeAttribute(){}
  closest(){ return null; }
  getBoundingClientRect(){ return {height: 100, bottom: 100, top: 0}; }
  seek(t){ this.currentTime = t; this.seeking = true; this.dispatch('seeking'); this.seeking = false; }
}

/** 假網路：/drive/<id> 回 206，可設定每個請求的延遲（函式）與失敗（函式）。 */
function createPage({managed = false, delay = () => 5, fail = () => null, quota = Infinity} = {}){
  const page = {requests: [], inflight: 0, maxInflight: 0, bufMeta: new WeakMap(), ms: null, aborted: 0};
  const ledger = {files: {
    [code]: {id: 'fixture-original', name: 'fixture.mp4', size: IDX.size},
    [code + '.frag.mp4']: {id: 'fixture-fragmented', name: 'fixture.frag.mp4', size: IDX.size},
    [code + '.fragidx.json']: {id: 'fixture-index', name: 'fixture.fragidx.json', size: 128},
  }};
  const storage = new Map([['feb-drive-tok', JSON.stringify({t: 'fixture-not-a-real-credential', e: Date.now() + 3600000})]]);
  const windowObj = new Emitter();
  windowObj.MediaSource = class extends FakeMediaSource { constructor(){ super(page); } };
  if(managed) windowObj.ManagedMediaSource = class extends FakeManagedMediaSource { constructor(){ super(page); } };
  const documentObj = new Emitter();
  documentObj.baseURI = 'https://feb.example/'; documentObj.hidden = false;
  const fetchImpl = async (url, options = {}) => {
    if(url === 'https://feb.example/data/drive-client.json') return {ok: true, status: 200, json: async () => ({client_id: 'fixture-client'}), arrayBuffer: async () => new ArrayBuffer(0)};
    if(url === 'https://feb.example/data/drive-map.json') return {ok: true, status: 200, json: async () => ledger, arrayBuffer: async () => new ArrayBuffer(0)};
    if(url === '/api/drive/status') return {ok: false, status: 404, json: async () => ({})};
    if(url === 'https://feb.example/data/sidecars/' + encodeURIComponent(code + '.fragidx.json'))
      return {ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(IDX)).buffer};
    if(url === 'https://feb.example/drive/fixture-fragmented'){
      const m = /^bytes=(\d+)-(\d+)$/.exec(options.headers?.Range || '');
      assert.ok(m, '影片請求一定帶明確 Range');
      const off = +m[1], len = +m[2] - +m[1] + 1;
      const req = {off, len, at: Date.now(), done: false, aborted: false};
      page.requests.push(req);
      page.inflight++; page.maxInflight = Math.max(page.maxInflight, page.inflight);
      const finish = () => { page.inflight--; req.done = true; };
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          finish();
          const bad = fail(req);
          if(bad){ resolve({status: bad, arrayBuffer: async () => new ArrayBuffer(0)}); return; }
          const buf = new ArrayBuffer(len);
          page.bufMeta.set(buf, {off, len});
          resolve({status: 206, arrayBuffer: async () => buf});
        }, delay(req));
        options.signal?.addEventListener('abort', () => { clearTimeout(t); if(!req.done){ finish(); req.aborted = true; page.aborted++; } reject(new DOMException('aborted', 'AbortError')); }, {once: true});
      });
    }
    throw new Error('不可呼叫未宣告的網路端點：' + url);
  };
  const context = vm.createContext({
    CLOUD: true, URL: Object.assign(class extends URL {}, {createObjectURL: () => 'blob:fixture', revokeObjectURL(){}}),
    Date, console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    AbortController, DOMException, Event, TextDecoder, TextEncoder, performance, Promise, JSON, Math, Number, String, Object, Array, Map, Set, WeakMap, Error,
    addEventListener(){}, innerHeight: 800,
    navigator: {userAgent: 'iPad', platform: 'MacIntel', maxTouchPoints: 5, onLine: true, serviceWorker: {controller: null, addEventListener(){}}},
    window: windowObj, document: documentObj,
    localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k)},
    sessionStorage: {getItem: () => null, removeItem(){}},
    dataURL: file => 'https://feb.example/data/' + file,
    spNorm: value => value,
    fetch: fetchImpl,
    toastMsg(){},
  });
  context.window.dispatchEvent = ev => windowObj.dispatch(ev.type);
  vm.runInContext(source, context, {filename: '14-drive.js'});
  const v = new FakeVideo(page);
  page.v = v; page.context = context;
  const MSClass = managed ? windowObj.ManagedMediaSource : windowObj.MediaSource;
  const origMS = MSClass;
  // driveMSEAttach 會 new MS()；攔住建構出來的實例好讓假 video 能在設 src 時開它
  context.window[managed ? 'ManagedMediaSource' : 'MediaSource'] = class extends origMS { constructor(){ super(); page.ms = this; } };
  if(quota !== Infinity) page.quotaWanted = quota;
  page.attach = async (initial = {time: 0, rate: 2, play: false}) => {
    await vm.runInContext('driveLoad()', context);
    const fn = vm.runInContext('driveMSEAttach', context);
    const p = fn(v, 'https://feb.example/drive/fixture-original', code, null, initial);
    let gaveUp = null;
    p.then(ok => { if(!ok) gaveUp = 'attach 回 false：' + vm.runInContext('DRIVE.mseWhy', context); }, e => { gaveUp = 'attach 例外：' + e; });
    await until(() => !!page.ms?.sb || gaveUp, 2000, 'SourceBuffer 建立');
    if(gaveUp) throw new Error(gaveUp);
    if(page.quotaWanted) page.ms.sb.quota = page.quotaWanted;
    return p;
  };
  page.stream = () => vm.runInContext('DRIVE_STREAMS', context).get(v);
  page.ahead = () => { const b = v.buffered; for(let i = 0; i < b.length; i++) if(v.currentTime >= b.start(i) - .1 && v.currentTime <= b.end(i)) return b.end(i) - v.currentTime; return 0; };
  page.videoRequests = () => page.requests.filter(r => r.off !== 0);
  page.dispose = () => vm.runInContext('driveMSEDetach', context)(v);
  return page;
}

test('冷啟動只開一條小請求（≤1 MiB）讓第一格快出來；落地後才三條並行，批次隨緩衝爬到 4 MiB', async t => {
  // 第一批（off=INIT_LEN）故意慢一點：機器忙的時候 sleep 會晚醒，30ms 的第一批可能已經落地、
  // 並行都開起來了，斷言就會誤紅（2026-09-13 全套測試跑到一半時發生過一次）。
  const page = createPage({delay: r => r.off === INIT_LEN ? 150 : 30});
  t.after(() => page.dispose());   // 斷言失敗也要收掉 watchdog，否則 node --test 永遠不結束
  await page.attach();
  await sleep(40);                               // 第一批還在路上
  assert.equal(page.inflight, 1, '冷啟動期間只該有一條在途，實際 ' + page.inflight);
  await until(() => page.videoRequests().length >= 4, 3000, '前四個影片請求');
  const reqs = page.videoRequests();
  assert.ok(reqs[0].len <= MiB, '第一個請求 ' + reqs[0].len + ' bytes 超過 1 MiB');
  assert.equal(fragOf(reqs[0].off), 0);
  await until(() => page.maxInflight >= 3, 2000, '三條並行');
  assert.equal(page.maxInflight, 3, '在途上限應是 3');
  for(const r of reqs.slice(1)) assert.ok(r.len >= MiB - FRAG_LEN && r.len <= 4 * MiB, '批次大小 ' + r.len);
  await until(() => page.ahead() >= 60, 4000, '前方 60 秒');
  await until(() => page.videoRequests().some(r => r.len > 3 * MiB), 3000, '緩衝厚了之後出現 4 MiB 批次');
  // 位元組連續：下一批從上一批結尾接著抓
  for(let i = 1; i < reqs.length; i++) assert.equal(reqs[i].off, reqs[i - 1].off + reqs[i - 1].len);
});

test('後面的批次先回來也要照順序 append，而且不會重抓', async () => {
  // 第 2、3 批（索引 2、3）延遲 20ms，第 1 批（索引 1）延遲 120ms
  const page = createPage({delay: r => r.off === 0 ? 5 : (fragOf(r.off) === 1 ? 120 : 20)});
  await page.attach();
  await until(() => page.ms.sb.appended.length >= 4, 3000, '四批 append');
  const order = page.ms.sb.appended.map(([a]) => a);
  assert.deepEqual(order, order.slice().sort((x, y) => x - y), 'append 順序必須遞增：' + order);
  const seen = new Set();
  for(const r of page.videoRequests()){ assert.ok(!seen.has(r.off), '同一段抓了兩次'); seen.add(r.off); }
});

test('跳轉：在途請求全部取消，從新位置重抓；跳進已緩衝的範圍不重抓', async t => {
  const page = createPage({delay: () => 200});
  t.after(() => page.dispose());   // 斷言失敗也要收掉 watchdog，否則 node --test 永遠不結束
  await page.attach();
  await until(() => page.inflight >= 3, 3000, '三條在途');
  page.v.seek(1200);
  await sleep(20);
  assert.equal(page.inflight, 1, '跳到沒緩衝的地方＝冷啟動，先只開一條');
  assert.ok(page.aborted >= 3, '舊請求應被取消，實際取消 ' + page.aborted);
  const after = page.videoRequests().filter(r => !r.aborted && !r.done);
  assert.ok(after.every(r => fragOf(r.off) >= 150), '新請求要從 1200 秒附近開始');
  await until(() => page.inflight >= 3, 2000, '第一批落地後三條並行');
  await until(() => page.ahead() >= 60, 4000, '1200 秒附近緩衝 60 秒');
  const count = page.videoRequests().length;
  page.v.seek(1216);            // 還在剛剛緩衝好的範圍內
  await sleep(60);
  const fresh = page.videoRequests().slice(count).filter(r => fragOf(r.off) * FRAG_SEC < page.ahead() + 1216 - 8);
  assert.equal(fresh.length, 0, '已緩衝範圍不該重抓');
});

test('ManagedMediaSource 的 endstreaming 不砍在途請求；已下載的照樣 append，之後才停', async t => {
  const page = createPage({managed: true, delay: () => 150});
  t.after(() => page.dispose());   // 斷言失敗也要收掉 watchdog，否則 node --test 永遠不結束
  await page.attach();
  page.ms.dispatch('startstreaming');
  await until(() => page.inflight >= 3, 3000, '三條在途');
  page.ms.dispatch('endstreaming');
  await sleep(300);
  assert.equal(page.aborted, 0, 'endstreaming 不該取消在途請求');
  await until(() => page.ms.sb.appended.length >= 3, 3000, '在途三批 append 完');
  const n = page.videoRequests().length;
  await sleep(200);
  assert.equal(page.videoRequests().length, n, 'endstreaming 之後不再發新請求');
  page.ms.dispatch('startstreaming');
  await until(() => page.videoRequests().length > n, 2000, 'startstreaming 後恢復');
});

test('QuotaExceeded：清掉後方後重試同一批 append，不重新下載', async t => {
  const page = createPage({delay: () => 10, quota: 5 * MiB});
  t.after(() => page.dispose());   // 斷言失敗也要收掉 watchdog，否則 node --test 永遠不結束
  await page.attach();
  page.v.currentTime = 60;
  await until(() => page.ms.sb.appended.length >= 2, 3000, '前兩批');
  // 第三批會超過 5 MiB 配額 → QuotaExceeded；配額釋放後應把同一批補上
  await until(() => page.ms.sb.appended.length >= 3, 4000, '配額釋放後補 append');
  const seen = new Set();
  for(const r of page.videoRequests()){ assert.ok(!seen.has(r.off), '配額錯誤後重抓了同一段 ' + r.off); seen.add(r.off); }
});

test('換到新權杖（feb-drive-authorized）不砍正在下載的請求', async t => {
  const page = createPage({delay: () => 200});
  t.after(() => page.dispose());   // 斷言失敗也要收掉 watchdog，否則 node --test 永遠不結束
  await page.attach();
  await until(() => page.inflight >= 3, 3000, '三條在途');
  page.context.window.dispatchEvent(new Event('feb-drive-authorized'));
  await sleep(30);
  assert.equal(page.aborted, 0);
});

test('3 倍速的 hold 有遲滯：前方不足 2×倍速 秒才暫停，補到 4×倍速 秒就續播', async t => {
  const page = createPage({delay: () => 40});
  t.after(() => page.dispose());   // 斷言失敗也要收掉 watchdog，否則 node --test 永遠不結束
  await page.attach({time: 0, rate: 3, play: false});
  page.v.playbackRate = 3;
  await until(() => page.ms.sb.appended.length >= 1, 3000, '第一批');
  page.v.currentTime = 0;
  // 前方只有 8 秒（< 6？不，8 ≥ 6）：模擬乾掉——把時間推到緩衝尾巴附近
  page.v.currentTime = page.ahead() - 1;
  await page.v.play();                        // ahead ≈ 1 秒 < 2×3=6 → 應 hold
  assert.equal(page.stream().buffering, true, '前方 1 秒應進入 hold');
  assert.equal(page.v.paused, true);
  await until(() => page.v.paused === false, 4000, '補滿 12 秒後自動續播');
  assert.ok(page.ahead() >= 12 - .5, '續播時前方至少 12 秒，實際 ' + page.ahead());
});

test('3 倍速：前方緩衝充足時的過渡性 waiting 不會觸發 hold（不再續播／暫停振盪）', async t => {
  const page = createPage({delay: () => 20});
  t.after(() => page.dispose());   // 斷言失敗也要收掉 watchdog，否則 node --test 永遠不結束
  await page.attach({time: 0, rate: 3, play: false});
  page.v.playbackRate = 3;
  await until(() => page.ahead() >= 40, 3000, '前方 40 秒');
  await page.v.play();
  assert.equal(page.stream().buffering, false, '前方 40 秒不該 hold');
  page.v.dispatch('waiting');           // 瀏覽器在 play() 後常發的過渡性 waiting
  assert.equal(page.stream().buffering, false, '緩衝充足的 waiting 不該 hold');
  assert.equal(page.v.paused, false);
  page.v.currentTime = page.ahead() - .5; // 真的追到尾巴
  page.v.dispatch('waiting');
  assert.equal(page.stream().buffering, true, '前方 0.5 秒的 waiting 才 hold');
});

test('續播：起手就從記錄的位置抓，不先抓片頭再跳', async t => {
  const page = createPage({delay: () => 20});
  t.after(() => page.dispose());
  await page.attach({time: 1200, rate: 2, play: false});   // 播放器會在 loadedmetadata 才把 currentTime 設成 1200
  await until(() => page.videoRequests().length >= 1, 2000, '第一個影片請求');
  assert.equal(fragOf(page.videoRequests()[0].off), 150, '第一個請求應是 1200 秒所在的片段');
});

test('某一批失敗只重試那一批，其他批照常；重試不會插隊亂序', async t => {
  let failed = false;
  const page = createPage({delay: () => 20, fail: r => { if(!failed && fragOf(r.off) === 1){ failed = true; return 500; } return null; }});
  t.after(() => page.dispose());   // 斷言失敗也要收掉 watchdog，否則 node --test 永遠不結束
  await page.attach();
  await until(() => page.ms.sb.appended.length >= 4, 5000, '含重試在內四批');
  const order = page.ms.sb.appended.map(([a]) => a);
  assert.deepEqual(order, order.slice().sort((x, y) => x - y), 'append 順序：' + order);
  const retried = page.videoRequests().filter(r => fragOf(r.off) === 1);
  assert.equal(retried.length, 2, '失敗的那批應重試一次');
});
