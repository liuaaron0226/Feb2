/* Feb 備考平台 · Service Worker
   目標：離線也能讀思考地圖、看板、錯題本、看過標記。

   分三種策略：
   ① 殼層（HTML/JS/CSS/字型/圖示）→ 先快取後網路，離線一定開得起來
   ② 資料（*.json、板書快照）→ 先網路後快取，有網路時永遠是最新的，斷線退回上次
   ③ 影片（.mp4）→ **完全不碰**。一支 1GB，吃進快取會撐爆 Safari 配額，
      而且 Range 請求本來就不該經過 SW 中轉。
*/
const VER   = 'feb-v51';   // 只影響殼層；教材那份（DATA）不跟著砍。v51＝殼層快取名改由內容雜湊自動決定（見 SHELL_HASH）。v50＝L3：/drive/<fileId> 虛擬路徑（Google Drive 直連，影片仍然一個 byte 都不進快取）。v49＝Phase E：R2 移除，雲端教材改走 /data/**（靜態資產）
/* 殼層內容雜湊——**build-dist.mjs 在部署時把這一行換成真的雜湊**。
   為什麼要自動：2026-09-03 事故。改了 09-render-study.js 與 app.css、部署成功、
   用 grep 驗證線上檔案含有新字串——全部通過，但使用者的裝置**畫面完全沒變**：
   標題還是舊的、排版是舊的、影片庫是舊版，而且因為舊 index.html 沒有載入
   14-drive.js，所有影片都退回「跳去 YouTube」。
   原因是 VER 沒動 ⇒ sw.js 位元組沒變 ⇒ 瀏覽器認為沒有新 SW ⇒ 繼續發舊殼層。
   「部署時記得跳版本號」是靠人記性的紀律，而它已經失效過一次。
   改成讓快取名跟著內容跑：任何殼層檔案變動 → 雜湊變 → sw.js 變 →
   瀏覽器裝新 SW（skipWaiting + clients.claim 立刻接管）→ 舊殼層被丟掉。
   本機直接開 site/ 時保持 'dev'（本機不吃長快取，硬重整即可）。 */
const SHELL_HASH = 'dev';
const SHELL = `${VER}-${SHELL_HASH}-shell`;
// 刻意不帶版號：教材不是程式，不該因為改了一行 JS 就被整包砍掉重抓。
// （踩過：一輪內從 v2 改到 v14，使用者備妥的 443 個教材檔被砍了十幾次，
//   偏偏外接硬碟不在電腦上，補不回來，整個看板變成「全部未下載」。）
const DATA  = 'feb-data';

const SHELL_FILES = [
  './index.html',
  // 兩張作戰地圖（T10 裁定：進殼層，共約 4MB——離線也要能從頂欄開）
  './la-map.html', './me-map.html',
  './app.webmanifest', './icon.svg',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './css/tokens.css', './css/app.css',
  './js/00-config.js', './js/01-state.js', './js/02-settings.js',
  './js/03-data.js', './js/04-render-exam.js', './js/05-media.js',
  './js/06-state-study.js', './js/07-disk.js', './js/08-sync.js',
  './js/09-render-study.js', './js/10-player.js',
  './js/review-core.js', './js/12-review.js', './js/13-replan.js',
  './js/14-drive.js', './js/11-boot.js',
  './vendor/fonts-ui/fonts.css',
  './vendor/fonts-ui/inter-var.woff2', './vendor/fonts-ui/inter-var-ext.woff2',
  './vendor/fonts-ui/geistmono-var.woff2', './vendor/fonts-ui/geistmono-var-ext.woff2',
  './vendor/katex.min.css', './vendor/katex.min.js', './vendor/auto-render.min.js',
  './vendor/marked.min.js', './vendor/mermaid.min.js',
];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // 逐檔加入：任何一支 404 都不該讓整個安裝失敗（字型檔會晚點按需補進來）
    await Promise.all(SHELL_FILES.map(f => c.add(f).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    /* 只清舊的殼層，教材那份（DATA）永遠留著。

       比對的是「等於當前殼層」而**不是** startsWith(VER)：SHELL 的名字現在帶
       內容雜湊（feb-v51-<hash>-shell），同一個 VER 下會有多份。
       2026-09-04 踩過：舊寫法讓 feb-v51-9cc546…-shell 逃過清理，
       而第 278 行那類 caches.match(req) 是**全域**比對、會掃過所有快取，
       於是舊殼層先被命中——使用者拿到的還是舊 JS（新加的 driveManifest
       在頁面上是 undefined），畫面看起來完全沒更新。
       「不是當前殼層也不是教材的一律刪」才是這個命名方式下唯一站得住的規則。 */
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== DATA && k !== SHELL)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isVideo = u => /\.(mp4|m4v|mov|mkv)$/i.test(u.pathname);
const isData  = u => /\.(json|vtt)$/i.test(u.pathname) || /\.snap_\d+\.jpg$/i.test(u.pathname);

/* ---- 雲端模式（FEB_MODE=cloud）的兩條線，快取規則完全相反 ----
   ① /data/**  ＝ 教材（頂層 JSON、分析、筆記快照、考古題 PDF）。
      Phase E 起這是隨部署上傳的靜態資產（R2 已移除），路徑從 /api/data/** 改成
      /data/**；但它跟本機的 ../data/* 仍是同一批東西，就用同一套策略：
      先網路後快取，放進不帶版號的 DATA（改一行 JS 不該把備妥的教材砍掉）。
      注意：isData() 只認得 .json/.vtt/.snap_*.jpg，考古題 PDF 不在其中，
      所以這條前綴判斷非有不可——少了它，離線時 PDF 全部打不開。
   ② /api/progress、/api/whoami ＝ 進度與身分。**永不進快取**。
      快取一份進度等於把「上次的看板」變成這次的事實，合併會拿它去推翻真的新資料；
      身分更不能留——換一個人登入還讀到上一個人的角色。這兩條直接不攔，交給瀏覽器。 */
const isCloudData = u => u.pathname.startsWith('/data/');
/* 2026-09-13 起改成整個 /api/ 前綴：多了 /api/drive/token（權杖）與 /api/drive/status，
   任何 API 回應都不該進快取——一張留在 Cache Storage 的權杖就是一把留在地上的鑰匙。 */
const isApiLive = u => u.pathname === '/api' || u.pathname.startsWith('/api/');

/* Access 的登入頁會偽裝成 200，這是快取最危險的一種回應。
   登入階段過期後，Cloudflare Access 連對非瀏覽器的請求都是回 302 導去登入頁
   （官方文件 cloudflare-one/access-controls/applications/http-apps/managed-oauth：
   非瀏覽器用戶端「receive a 302 redirect with no usable token」）。
   fetch 預設跟著跳，拿回來的就是一個 res.ok 為真的 HTML 登入頁——照收的話，
   schools.json 在快取裡會變成一份登入頁，而且會活到下次連上為止。
   兩條判準：跳過的不要（res.redirected），HTML 不要（教材只會是 json/txt/pdf）。 */
const cacheable = res => res.ok && !res.redirected &&
  !/text\/html/i.test(res.headers.get('content-type') || '');

/* ============ L3：/drive/<fileId> —— 一條只活在瀏覽器裡的虛擬路徑 ============

   目的：讓雲端模式的影片回到 Feb 自己的 <video>（章節、2 倍速、字幕、
   思考地圖、續播記憶全部照舊），而位元組**直接**從 Google 流到裝置——
   不經過 Cloudflare（Workers 免費方案一天 100,000 個請求，Pages Functions
   也算在裡面；一支 900MB 影片的 Range 請求量會直接把額度吃光），
   也不經過任何快取（86GB 進 Safari 配額是災難，這件事 sw.js 開頭就寫死了）。

   ── iOS Safari 為什麼是這裡最脆的一環 ──
   Safari 載影片的第一件事是送 `Range: bytes=0-1` 探路，**沒收到 206 就不播**
   （不是播不順，是整支不播）。所以這支 handler 的責任只有一個：
   把 Range 原樣轉給 Google，再把回應**當成 206 交回去**，
   而且 Content-Range 一定要帶總長度。

   總長度不能跟 Google 要：跨來源回應只讀得到 CORS 安全清單上的標頭，
   而 googleapis.com 的 Access-Control-Expose-Headers **沒有** Content-Range
   （2026-09-02 實測：只有 Content-Length, Date, Server, Transfer-Encoding,
   X-GUploader-UploadID, X-Google-Trace, vary）。
   所以總長度來自 data/drive-map.json 的 size 欄位，由頁面推進來。 */
const DRIVE_PREFIX = new URL('drive/', self.registration.scope).pathname;
const DRIVE_CHUNK = 16 * 1024 * 1024;   // 開放式 Range 一次最多給這麼多
let DRIVE_MAP = Object.create(null);    // fileId → {code, name, size, mime}
let DRIVE_TOK = '';                     // 只在記憶體。SW 被回收就沒了，會再跟頁面要
let DRIVE_EXP = 0;                      // 權杖到期（Unix 毫秒）；0＝不知道，只能等 Google 回 401
let DRIVE_ASK = null, DRIVE_ASK_RES = null;
/* 快到期就先跟頁面要新的，不要拿一張剩十秒的去打 Google 等 401 再換——
   那一來一回是使用者看得到的停頓。頁面那側（driveTokenAsk）會向後端或 GIS 換一張。 */
const driveTokStale = () => !DRIVE_TOK || (DRIVE_EXP && Date.now() > DRIVE_EXP - 30000);

function driveParseRange(h, size){
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(h || '').trim());
  if(!m) return null;
  const [, a, b] = m;
  if(a === '' && b === '') return null;
  let start, end;
  if(a === ''){
    const n = parseInt(b, 10);
    if(!(n > 0)) return {bad: true};
    start = Math.max(0, size - n); end = size - 1;
  }else{
    start = parseInt(a, 10);
    end = b === '' ? size - 1 : parseInt(b, 10);
  }
  if(!(start >= 0) || start >= size || end < start) return {bad: true};
  return {start, end: Math.min(end, size - 1)};
}

/* 跟頁面要一張新權杖。頁面那側是 driveTokenAsk()（14-drive.js）。
   沒有視窗在（分頁關了）就直接放棄——沒有人在看的影片不必救。 */
function driveAskToken(force = false){
  if(DRIVE_ASK) return DRIVE_ASK;
  DRIVE_ASK = (async () => {
    const cs = await self.clients.matchAll({type: 'window'});
    if(!cs.length) return;
    cs.forEach(c => c.postMessage({type: 'drive-need-token', force}));
    await new Promise(res => {
      DRIVE_ASK_RES = res;
      setTimeout(res, 8000);              // 等不到就算了，讓上層回 401
    });
  })().finally(() => { DRIVE_ASK = null; DRIVE_ASK_RES = null; });
  return DRIVE_ASK;
}

function driveFetch(id, range, signal){
  const h = new Headers({Authorization: 'Bearer ' + DRIVE_TOK});
  if(range) h.set('Range', range);
  // credentials:'omit' 是刻意的：憑證只有那張 Bearer，不要把任何 cookie 送去 Google
  return fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media',
               {headers: h, credentials: 'omit', cache: 'no-store', mode: 'cors', signal});
}

const driveErr = (s, m) => new Response(m, {status: s,
  headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}});

async function driveServe(req, id){
  const e = DRIVE_MAP[id];
  if(!e) return driveErr(404, 'drive-map 裡沒有這個 id');
  const size = Number(e.size) || 0;
  if(!size) return driveErr(500, 'drive-map 缺 size，算不出 Content-Range');

  const rh = req.headers.get('range');
  const r = rh ? driveParseRange(rh, size) : null;
  if(r && r.bad) return new Response(null, {status: 416,
    headers: {'Content-Range': `bytes */${size}`, 'Cache-Control': 'no-store'}});

  const start = r ? r.start : 0;
  /* 開放式 Range（bytes=N-）夾到 CHUNK：短回一樣是合法的 206，播放器會自己
     再要下一段。不夾的話「給我從這裡到檔尾」會把 900MB 掛在一條連線上，
     使用者一拖時間軸就整條作廢重來。明確區間（bytes=a-b）照要的給，不動手腳。 */
  const openEnded = !!(rh && /^bytes=\d+-$/.test(rh.trim()));
  const end = r ? (openEnded ? Math.min(r.end, start + DRIVE_CHUNK - 1) : r.end) : size - 1;
  const range = rh ? `bytes=${start}-${end}` : null;

  if(driveTokStale()) await driveAskToken(!DRIVE_TOK ? false : true);
  if(!DRIVE_TOK) return driveErr(401, '還沒連結 Google 雲端硬碟');

  let up;
  try{ up = await driveFetch(id, range, req.signal); }
  catch(err){ return driveErr(502, 'Google 連不上：' + err); }

  // 權杖過期（存取權杖只活一小時，播長片一定會撞到）：換一張再試一次，畫面不該中斷
  if(up.status === 401){
    DRIVE_TOK = ''; DRIVE_EXP = 0;
    await driveAskToken(true);
    if(!DRIVE_TOK) return driveErr(401, 'Google 授權過期');
    try{ up = await driveFetch(id, range, req.signal); }
    catch(err){ return driveErr(502, 'Google 連不上：' + err); }
  }
  if(!up.ok) return driveErr(up.status, 'Google 回 ' + up.status);
  if(rh && up.status !== 206) return driveErr(502, 'Google 忽略了 Range');

  /* 長度以上游的 Content-Length 為準（它在 CORS 安全清單上，讀得到），
     不用我們自己算的 end——萬一 Google 給的比要的少，Content-Length 說謊
     會讓播放器停在那裡等永遠不會來的位元組。 */
  const cl = up.headers.get('content-length');
  const len = cl != null ? Number(cl) : (end - start + 1);
  const out = new Headers({
    'Content-Type': e.mime || 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(len),
    'Cache-Control': 'no-store',          // 影片永不進快取，這條是第二道保險
    'X-Content-Type-Options': 'nosniff',
  });
  if(rh) out.set('Content-Range', `bytes ${start}-${start + len - 1}/${size}`);
  // up.body 直接轉手＝串流，不落地、不佔記憶體
  return new Response(up.body, {status: rh ? 206 : 200, headers: out});
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // 跨來源交給瀏覽器自己處理

  /* Drive 虛擬路徑要**排在 Range 早退之前**：這是全站唯一「非攔不可、
     而且非帶 Range 不可」的路徑。下一行的 `req.headers.has('range')` 早退
     是給真實影片檔用的（那些交給伺服器原生處理最好），對這裡是致命的——
     早退等於整支影片打到 Cloudflare，驗完章之後找不到資產，回 404。 */
  if (url.pathname.startsWith(DRIVE_PREFIX)) {
    ev.respondWith(driveServe(req, decodeURIComponent(url.pathname.slice(DRIVE_PREFIX.length))));
    return;
  }

  if (isVideo(url) || req.headers.has('range')) return;   // 影片與 Range 一律不攔

  if (isApiLive(url)) return;        // 進度與身分：一律直送網路，不攔也不留

  if (isData(url) || isCloudData(url)) {
    ev.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (cacheable(res)) {
          (await caches.open(DATA)).put(req, res.clone());
          return res;
        }
        // 連得上但回 404/5xx：多半是外接硬碟被拔去接 iPad，
        // 伺服器讀不到那個檔。這種情況要拿快取頂上，不能把 404 交出去——
        // 交出去的話 loadLocal() 會判定失敗、清空 LOCAL，
        // 整個看板變成「全部未下載」，即使裝置上有一份好的。
        // 雲端模式多一種同形狀的情況：登入過期被導去登入頁（見 cacheable）。
        // 手上有教材就照樣讀，重新整理才會被帶去登入——資料早就在這台裝置上了，
        // 沒有理由因為一張過期的票就把畫面清空。
        return (await caches.match(req, {ignoreSearch:true})) || res;
      } catch (e) {
        const hit = await caches.match(req, {ignoreSearch:true});
        if (hit) return hit;
        throw e;
      }
    })());
    return;
  }

  // 主文件（index.html）走「網路優先」：改版後要立刻看到，不能等下一次開才更新。
  // 先前用 cache-first 導致改了 CSS 卻怎麼重整都是舊版，排查了很久才發現是自己的快取。
  if (req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname)) {
    ev.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
        return res;
      } catch (e) {
        return (await caches.match(req, {ignoreSearch:true})) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  ev.respondWith((async () => {
    const hit = await caches.match(req, {ignoreSearch:true});
    if (hit) {
      fetch(req).then(res => {                      // 背景更新，下次開就是新的
        if (res.ok) caches.open(SHELL).then(c => c.put(req, res));
      }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok && url.pathname.startsWith('/app/')) {
        (await caches.open(SHELL)).put(req, res.clone());
      }
      return res;
    } catch (e) {
      const fallback = await caches.match('./index.html');
      if (req.mode === 'navigate' && fallback) return fallback;
      throw e;
    }
  })());
});

/* 網站與 SW 的兩個指令：
   ① audit   — 盤點哪些檔案還沒進快取（不抓，只回報）
   ② prefetch— 把清單抓進快取，中途回報進度

   為什麼需要 audit：原本每次都要人工按「出門前備妥」，而且不管快取裡有沒有
   都整包重抓 500 個檔案。先盤點就能只補缺的那幾個，於是網站可以在背景
   自動做完，使用者不必記得按任何東西。 */
const say = async msg => {
  const cs = await self.clients.matchAll();
  cs.forEach(x => x.postMessage(msg));
};

self.addEventListener('message', ev => {
  const d = ev.data || {};

  /* Drive 那三句要放在 urls 守衛之前——它們沒有 urls。 */
  if (d.type === 'drive-ping') { ev.source?.postMessage({type: 'drive-pong', ok: true, ver: VER}); return; }
  if (d.type === 'drive-init') {
    DRIVE_MAP = d.map || Object.create(null);
    if (d.token) { DRIVE_TOK = d.token; DRIVE_EXP = Number(d.exp) || 0; DRIVE_ASK_RES?.(); }
    ev.source?.postMessage({type: 'drive-pong', ok: true, ver: VER, n: Object.keys(DRIVE_MAP).length});
    return;
  }
  if (d.type === 'drive-token') { DRIVE_TOK = d.token || ''; DRIVE_EXP = DRIVE_TOK ? (Number(d.exp) || 0) : 0; DRIVE_ASK_RES?.(); return; }

  if (!Array.isArray(d.urls)) return;

  if (d.type === 'audit') {
    ev.waitUntil((async () => {
      const c = await caches.open(DATA);
      const miss = [];
      for (const u of d.urls) if (!(await c.match(u))) miss.push(u);
      await say({ type: 'audit-done', total: d.urls.length,
                  have: d.urls.length - miss.length, missing: miss });
    })());
    return;
  }

  if (d.type === 'prefetch') {
    ev.waitUntil((async () => {
      const c = await caches.open(DATA);
      let ok = 0, missing = 0, n = 0;
      // 併發 6 條：逐檔序列抓 500 個在區網上要好幾分鐘，
      // 但也不能全開——iOS 對同時連線數有上限，開太多反而整批失敗。
      const queue = [...d.urls];
      const worker = async () => {
        for (;;) {
          const u = queue.shift();
          if (u === undefined) return;
          // 不用 c.add()：它只看 res.ok，會把 Access 的 200 登入頁當成教材收下來。
          try {
            const res = await fetch(u);
            if (!cacheable(res)) throw 0;
            await c.put(u, res);
            ok++;
          }
          catch (e) { missing++; }   // 多半是字幕／筆記還沒產生，不是錯誤
          if (++n % 25 === 0) await say({ type: 'prefetch-progress', n, total: d.urls.length });
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      await say({ type: 'prefetch-done', ok, missing, silent: !!d.silent });
    })());
  }
});
