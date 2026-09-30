/* Feb · Range/SW 探針的 Service Worker（只給 site/probe/ 用，不碰正式站）
   ------------------------------------------------------------------
   這支存在的唯一理由：在真正動手做「Drive 影片串進 Feb 自己的播放器」之前，
   先證明或推翻一件事——

     iOS Safari 的 <video> 去要一個由 Service Worker 供應的虛擬路徑時，
     ① SW 看不看得到 Range 標頭？
     ② SW 自己組出來的 206（Content-Range 是我們算的，不是上游給的）
        Safari 收不收？拖曳快轉還動不動？

   歷史上這條路很脆：WebKit 184447「mp4 video element broken with service worker」
   （2019-11-05 RESOLVED FIXED）之前，媒體請求以 no-cors 送出，
   no-cors 標頭過濾會把 Range 拔掉，於是 SW 根本不知道要拿哪一段。
   修好之後 Safari 才「收得下 SW 回的 206」。但「修好」是 2019 年的桌面版說法，
   iOS 上要用真機驗過才算數——這支就是拿來在 iPad 上按一下的。

   scope 刻意是 ./（也就是 site/probe/），跟正式的 site/sw.js（scope 是站根）
   互不重疊：註冊這支不會動到教材離線快取，反之亦然。

   它什麼都不快取。一個 byte 都不留。 */

const SCOPE = self.registration.scope;          // …/site/probe/
const VPREFIX = SCOPE + 'v/';                   // …/site/probe/v/<key>

/* key → {url, size, type, headers?}。由頁面 postMessage 灌進來，
   跟正式版的 drive-map.json ＋ 存活在記憶體裡的權杖是同一個形狀。 */
let MAP = Object.create(null);
const LOG = [];
const CHUNK = 16 * 1024 * 1024;                 // 開放式 Range（bytes=N-）最多一次給這麼多

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', ev => ev.waitUntil(self.clients.claim()));

self.addEventListener('message', ev => {
  const d = ev.data || {};
  if (d.type === 'probe-map') { MAP = d.map || Object.create(null); reply(ev, { type: 'probe-map-ok', keys: Object.keys(MAP) }); }
  else if (d.type === 'probe-log') reply(ev, { type: 'probe-log', log: LOG.slice() });
  else if (d.type === 'probe-clear') { LOG.length = 0; reply(ev, { type: 'probe-log', log: [] }); }
});
function reply(ev, msg) {
  if (ev.source) ev.source.postMessage(msg);
  else self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage(msg)));
}

/* Range 標頭解析。三種合法形狀都要吃：
     bytes=0-1      明確區間（Safari 的開場探測就是這個）
     bytes=500-     開放式，從 500 到檔尾
     bytes=-500     後綴，最後 500 bytes
   回 null＝沒有 Range（整支）；回 {unsatisfiable:true}＝416。 */
function parseRange(h, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(h || '').trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === '' && b === '') return null;
  let start, end;
  if (a === '') {
    const n = parseInt(b, 10);
    if (!(n > 0)) return { unsatisfiable: true };
    start = Math.max(0, size - n); end = size - 1;
  } else {
    start = parseInt(a, 10);
    end = b === '' ? size - 1 : parseInt(b, 10);
  }
  if (!(start >= 0) || start >= size || end < start) return { unsatisfiable: true };
  if (end >= size) end = size - 1;
  return { start, end };
}

self.addEventListener('fetch', ev => {
  const href = ev.request.url.split('#')[0].split('?')[0];
  if (!href.startsWith(VPREFIX)) return;
  ev.respondWith(serve(ev.request, decodeURIComponent(href.slice(VPREFIX.length))));
});

async function serve(req, key) {
  const rec = {
    at: new Date().toISOString().slice(11, 23),
    key,
    dest: req.destination || '(空)',
    mode: req.mode,
    range: req.headers.get('range'),      // ← 整支探針的核心問題就在這一行
    status: 0, up: 0, note: '',
  };
  LOG.push(rec); if (LOG.length > 300) LOG.shift();

  const e = MAP[key];
  if (!e) { rec.status = 404; rec.note = 'key 不在 map 裡'; return txt(404, 'unknown key'); }
  const size = Number(e.size) || 0;
  if (!size) { rec.status = 500; rec.note = '沒有 size，算不出 Content-Range'; return txt(500, 'no size'); }

  const r = parseRange(rec.range, size);
  if (r && r.unsatisfiable) {
    rec.status = 416; rec.note = 'Range 超出範圍';
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const start = r ? r.start : 0;
  /* 開放式 Range 夾到 CHUNK：短回也是合法的 206，播放器會自己再要下一段。
     不夾的話一次開放式請求會把整支影片掛在一條連線上。
     明確區間（bytes=a-b）一律照要的給，不動手腳。 */
  const openEnded = !!(rec.range && /^bytes=\d+-$/.test(rec.range.trim()));
  const end = r ? (openEnded ? Math.min(r.end, start + CHUNK - 1) : r.end) : size - 1;

  const h = new Headers(e.headers || {});
  if (rec.range) h.set('Range', `bytes=${start}-${end}`);
  let up;
  try {
    up = await fetch(e.url, { headers: h, credentials: 'omit', cache: 'no-store' });
  } catch (err) {
    rec.status = 502; rec.note = '上游 fetch 失敗：' + err;
    return txt(502, 'upstream fetch failed');
  }
  rec.up = up.status;
  if (!up.ok) { rec.status = up.status; rec.note = '上游回 ' + up.status; return txt(up.status, 'upstream ' + up.status); }

  /* 上游的 Content-Range 讀不讀得到，決定整個設計成不成立。
     跨來源時它多半讀不到（CORS 安全清單沒有 Content-Range，
     googleapis.com 的 Access-Control-Expose-Headers 也沒放它進去），
     所以真正的長度來源是 Content-Length（那個在安全清單裡）＋ 帳本裡的 size。 */
  const upCR = up.headers.get('content-range');
  const upCL = up.headers.get('content-length');
  rec.note = `上游 CR=${upCR || '(讀不到)'} CL=${upCL || '(讀不到)'}`;

  const len = upCL != null ? Number(upCL) : (end - start + 1);
  const realEnd = start + len - 1;

  const out = new Headers();
  out.set('Content-Type', e.type || 'video/mp4');
  out.set('Accept-Ranges', 'bytes');
  out.set('Content-Length', String(len));
  out.set('Cache-Control', 'no-store');
  if (rec.range) {
    if (up.status !== 206) { rec.status = 502; rec.note += '｜上游忽略了 Range（回 ' + up.status + '）'; return txt(502, 'upstream ignored Range'); }
    out.set('Content-Range', `bytes ${start}-${realEnd}/${size}`);
  }
  rec.status = rec.range ? 206 : 200;
  return new Response(up.body, { status: rec.range ? 206 : 200, headers: out });
}

const txt = (s, m) => new Response(m, { status: s, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
