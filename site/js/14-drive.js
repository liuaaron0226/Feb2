/* ============ L3：Google Drive 影片串進 Feb 自己的播放器 ============

   要解的問題：雲端模式（feb-6ah.pages.dev）的集數 chip 點下去只有 VLC 交接面板，
   因為 86GB 影片不上 Cloudflare。影片備份到 Drive 之後，本來可以只給一條
   「在 Drive 開這一支」的連結（L2）——但那樣就換成 Google 的播放器，
   章節時間軸、2 倍速、字幕、思考地圖、續播記憶全部不見。

   L3 的作法：讓影片回到 Feb 自己的 <video>，而且**位元組不經過我們的伺服器**。

     <video src="/drive/<fileId>">
        ↓ 同源虛擬路徑，被 Service Worker 攔下（sw.js 的 driveServe）
     fetch https://www.googleapis.com/drive/v3/files/<id>?alt=media
        ↓ 帶 Authorization: Bearer <存取權杖>、Range 原樣轉手
     Google → 裝置，直連。Cloudflare 一個請求都不算。

   為什麼不讓 Cloudflare 代理：Workers 免費方案每天 100,000 個請求
   （官方 workers/platform/limits：「Accounts on the Workers Free plan have a
   daily request limit of 100,000 requests」，而且「Requests to Pages functions
   count towards your quota」）。一支 900MB 的影片光 Range 請求就是幾十上百個，
   看兩堂課就能把整天的額度吃掉——何況記憶體上限 128 MB、CPU 10 ms，
   本來就不是搬大檔的地方。

   ── 三道自己關上的門（任一沒過就整個功能不存在，不是降級成半殘）──
     1. 沒有任何權杖來源 → 關。權杖來源有兩種（見「權杖從哪來」）：
        後端服務帳戶（/api/drive/token）或 data/drive-client.json 的 client_id。
        兩者都沒有，這個功能一個按鈕都不出現。
     2. 不是雲端模式 → 關。本機有媒體伺服器，直連硬碟比繞一圈 Google 快得多，
        也不必動用任何權杖。
     3. Service Worker 沒接管、或接管的是舊版（不認得 /drive/）→ 關。
        少了這道，<video src="/drive/…"> 會直接打到 Cloudflare，
        _middleware 驗完章之後找不到這個靜態資產 → 404 → 黑畫面。

   ── 權杖從哪來（2026-09-13 改，ADR-0011）──
   主線：**後端服務帳戶**。使用者把 Drive 的「Feb 影片備份」資料夾分享給一個
   服務帳戶（唯讀），金鑰只放 Cloudflare 的 secret；Pages Function 用它簽 JWT
   向 Google 換一小時的 access token（POST /api/drive/token → {token, exp}），
   前端到期前五分鐘自動再要一張。沒有同意畫面、沒有 popup、沒有 ITP 問題，
   iPad 再也不用每小時按「重新連結 Google」。位元組仍然 Google → 裝置直送。
   退路：後端還沒設定（501 sa_not_configured）或不是主人（403）時，退回原本的
   Google Identity Services Token model（initTokenClient，一小時到期、
   iPad 靜默續期幾乎必失敗）——那條路保留是為了部署順序：程式先上、secret 後設，
   中間不會有一刻是「兩邊都不能用」。

   ── 權杖住哪裡 ──
   記憶體為主，localStorage 為輔（鍵 feb-drive-tok，帶到期時間；過期就丟）。
   Service Worker 隨時會被 iOS 回收，醒來時記憶體是空的，所以它會反過來
   跟頁面要一張新的（drive-need-token ⇄ drive-token）。 */

const DRIVE = {
  clientId: '',
  map: null,                 // drive-map.json 全文
  byId: null,                // fileId → {code, name, size, mime}
  token: '', exp: 0,
  tokenClient: null,
  swOK: null,                // SW 認不認得 /drive/：null＝還沒問過
  loaded: false,
  /* 後端服務帳戶可不可用：null＝還沒問過（或問不到）、true＝已設定且我是主人、
     false＝沒設定／不是主人／端點不存在（舊部署）。false 才退回 GIS。 */
  backend: null,
  renewTimer: null,
  diag: null,                // 目前串流的診斷計數（driveDiagRender 用）
};
const DRIVE_TOK_SS = 'feb-drive-tok';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_API = {token: '/api/drive/token', status: '/api/drive/status'};
const DRIVE_RENEW_AHEAD_MS = 5 * 60 * 1000;   // 到期前五分鐘換張，播到一半不會撞到 401

/* 虛擬路徑一定要跟 Service Worker 的 scope 對齊，不能寫死 '/drive/'：
   雲端模式站根就是 /，但媒體伺服器把站發在 /site/ 底下，scope 也就跟著往下一層。
   用 document.baseURI 推，兩邊自然對得上。 */
const driveURL = id => new URL('drive/' + encodeURIComponent(id), document.baseURI).href;

const MIME_OF = n => /\.vtt$/i.test(n) ? 'text/vtt'
  : /\.json$/i.test(n) ? 'application/json'
  : /\.jpe?g$/i.test(n) ? 'image/jpeg'
  : 'video/mp4';

/* ---------- 載入帳本與用戶端設定 ---------- */
/* 進行中的載入。**不能用布林旗標**：旗標會在兩個 fetch 之前就翻成 true，
   於是第二個呼叫者立刻拿到 DRIVE、而那時 DRIVE.map 還是 undefined。
   2026-09-04 踩到：loadManifest() 變成第二個呼叫端之後，影片庫時有時無——
   誰最後跑完誰決定 MANIFEST，跑贏的那個看到的是空帳本。
   共用同一個 promise 才是「冪等的非同步初始化」該有的樣子。 */
let DRIVE_LOADING = null;
async function driveLoad(){
  if(DRIVE_LOADING) return DRIVE_LOADING;
  DRIVE_LOADING = driveLoadOnce();
  return DRIVE_LOADING;
}
async function driveLoadOnce(){
  DRIVE.loaded = true;
  /* 三份都是「沒有就當作沒開通」，所以失敗一律吞掉不吵。
     drive-client.json 很可能根本不存在（使用者還沒建 OAuth 用戶端）；
     /api/drive/status 在舊部署上是 404、離線時是例外——都當成「還不知道」。 */
  const [cli, map, st] = await Promise.all([
    fetch(dataURL('drive-client.json')).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(dataURL('drive-map.json')).then(r => r.ok ? r.json() : null).catch(() => null),
    CLOUD ? fetch(DRIVE_API.status, {credentials: 'same-origin', cache: 'no-store'})
      .then(r => r.ok ? r.json() : (r.status === 404 ? {configured: false} : null)).catch(() => null) : null,
  ]);
  DRIVE.clientId = String(cli?.client_id || '').trim();
  DRIVE.map = map;
  DRIVE.byId = Object.create(null);
  for(const [code, f] of Object.entries(map?.files || {}))
    if(f?.id) DRIVE.byId[f.id] = {code, name: f.name || '', size: Number(f.size) || 0, mime: MIME_OF(f.name || '')};
  if(st) DRIVE.backend = !!(st.configured && st.owner);
  driveRestoreToken();
  driveRenewSchedule();
  return DRIVE;
}
/** 這個站有沒有任何一條拿得到 Drive 權杖的路。 */
const driveEnabled = () => CLOUD && (DRIVE.backend !== false || !!DRIVE.clientId);

/* 集數代號 → 帳本裡那一筆。鍵一律過 spNorm()，跟 drive-upload.py 那一側同一把尺
   （docs/影片上雲.md §6「鍵為什麼是那個樣子」）。 */
function driveEntry(code){
  const f = DRIVE.map?.files?.[spNorm(code || '')];
  return (f && f.id && Number(f.size) > 0) ? f : null;
}
/* 旁掛檔案（字幕／思考地圖／板書快照）：帳本裡若有 <代號>.vtt 這種鍵就用它。 */
function driveSidecar(url, ext){
  const id = driveIdFromURL(url);
  if(!id) return '';
  const code = DRIVE.byId?.[id]?.code;
  if(!code) return '';
  const f = DRIVE.map?.files?.[code + ext];
  if(!f || !f.id) return '';
  /* 側車檔改走靜態路徑（2026-09-04）：build-dist.mjs 把帳本裡的每一個側車檔
     複製到 data/sidecars/<代號><副檔名>，跟其他教材一樣免權杖、SW 網路優先快取。
     **例外：任何 .mp4 結尾的側車檔（.frag.mp4，MSE 用的 fragmented 重新封裝）
     跟原影片一樣大，永不進 Cloudflare，一律走 /drive/<id>（權杖路徑）。** */
  if(/\.mp4$/i.test(ext)) return driveURL(f.id);
  return dataURL('sidecars/' + encodeURIComponent(code + ext));
}

/* ---------- MSE：讓 iPad 也用 Feb 自己的播放器（2026-09-04 使用者裁定） ----------
   事實：iPad 上 <video src> 的請求不經過 Service Worker（WebKit 讓媒體載入走系統層），
   /drive/<id> 直接打到 Cloudflare 拿回 index.html → 錯誤 4，只能退到 Google 的 iframe。
   但頁面的 fetch() **會**經過 SW（帶得了權杖）。所以：用 MediaSource，自己分段 fetch
   影片位元組餵給 SourceBuffer——<video> 拿到的是 blob: 網址，不再對外請求。
   代價：MSE 只吃 fragmented MP4，課程影片得先由 scripts/remux-frag.py 重新封裝成
   <代號>.frag.mp4 並附 <代號>.fragidx.json（codec 字串、時長、init 段、每個片段的
   [秒, 位移, 長度]）。索引走靜態路徑（幾十 KB），影片位元組走 /drive/<id>。

   ── 取片管線（2026-09-13 重寫，ADR-0012）──
   舊版一次只發一個 Range、每批最多 2 MB、緩衝越低每次抓越少、任何 waiting 就暫停到
   24 秒才續播。每個請求都要付一次 Google 的來回延遲（約 0.4～1 秒），工數影片一片
   只有 4.2 秒、3 倍速只夠播 1.4 秒——數學上追不回來，使用者看到的就是「一直緩衝」。
   新版：
     · 同時最多 MSE_PAR 條 Range 在途，每條約 MSE_BATCH_BYTES（4 MiB ≈ 45 秒影片），
       起播／跳到沒緩衝的位置時第一條先抓一片（≤ 1 MiB）讓第一格快出來。
     · 下載可以亂序完成，append 一律按片段順序（ready 表＋單一 appender）。
     · 前方緩衝目標 min(MSE_AHEAD_MAX, MSE_AHEAD_SEC×倍速) 秒，3 倍＝180 秒。
     · 跳轉只丟掉「用不到」的請求：新位置已緩衝／在途的部分照用。
     · 換權杖、切回前景、網路恢復都**不**砍在途請求；ManagedMediaSource 的
       endstreaming 只停止發新請求，在途的照樣收完餵進去。
     · QuotaExceeded 先清後方再重試同一批，不重新下載。
     · ≥2.5 倍的 hold 改成真正的遲滯：前方 < 2×倍速 秒才暫停，≥ 4×倍速 秒就續播。
   三道門任一沒過就回 false，呼叫端照舊落回原本的路（桌機直接 src、iPad 預覽）：
     1. 帳本裡有 .frag.mp4 與 .fragidx.json
     2. 這台裝置有 MediaSource／ManagedMediaSource，且 isTypeSupported(codecs)
     3. 手上有 Drive 權杖（SW 端要它去 Google 拿位元組） */
const MSE_AHEAD_SEC = 60;              // 每 1 倍速緩衝到「目前時間＋這麼多秒」
const MSE_AHEAD_MAX = 180;             // 再高的倍速也不超過三分鐘（≈17 MB）
const MSE_KEEP_BEHIND_SEC = 30;        // 只保留目前時間往前 30 秒，其餘清掉
const MSE_PAR = 3;                     // 同時在途的 Range 請求數
const MSE_BATCH_BYTES = 4 * 1024 * 1024;
const MSE_FIRST_BYTES = 1024 * 1024;   // 沒有緩衝時第一條請求的上限（第一格要快）
const MSE_PENDING_BYTES = 20 * 1024 * 1024;  // 在途＋已下載未餵的總量上限（記憶體）

function driveMSEClass(){
  return window.ManagedMediaSource || window.MediaSource || null;
}
/** 不出網的前置判斷：這一集能不能走 MSE（給 drivePlay 決定要開 Feb 播放器還是預覽）。 */
function driveMSEReady(code){
  if(!CLOUD || !DRIVE.map) return false;
  const k = spNorm(code);
  const frag = DRIVE.map.files?.[k + '.frag.mp4'], idx = DRIVE.map.files?.[k + '.fragidx.json'];
  if(!frag?.id || !idx?.id) return false;
  const MS = driveMSEClass();
  return !!MS && typeof MS.isTypeSupported === 'function' && !!DRIVE.token;
}

/* attach 失敗的原因要留下來（2026-09-04）：使用者 iPad 上四道門全過、播放器打開了，
   attach 卻回 false → 退回直接 src → 錯誤 4 → toast。toast 只說「讀不到串流」，
   我完全看不到是索引抓不到、codec 被拒、靜默續期失敗、還是 sourceopen 沒來。
   每個失敗點寫一句進 DRIVE.mseWhy，橫幅與 toast 一起印出來，一張截圖定案。 */
function mseFail(why){ DRIVE.mseWhy = why; console.warn('MSE：' + why); return false; }

/* stats（可選）：{headersMs, totalMs} 寫回呼叫端，診斷面板用來分「來回延遲」與「傳輸」。 */
async function driveRead(url, {timeoutMs = 30000, signal, stats, ...options} = {}){
  if(signal?.aborted) throw signal.reason;
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', cancel, {once: true});
  const cancelled = new Promise((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {once: true});
  });
  const timer = setTimeout(() => controller.abort(new DOMException('分段下載逾時', 'TimeoutError')), timeoutMs);
  try{
    const work = (async () => {
      const t0 = Date.now();
      const response = await fetch(url, {...options, signal: controller.signal});
      if(stats) stats.headersMs = Date.now() - t0;
      const body = await response.arrayBuffer();
      if(stats) stats.totalMs = Date.now() - t0;
      return {status: response.status, body};
    })();
    return await Promise.race([work, cancelled]);
  }finally{
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

const DRIVE_STREAMS = new WeakMap();
function driveMSEDetach(v){ DRIVE_STREAMS.get(v)?.dispose(); }
function driveMSERestoring(v){ return !!DRIVE_STREAMS.get(v)?.restoring; }
function driveMSEBuffering(v){ return !!DRIVE_STREAMS.get(v)?.buffering; }
function driveMSEToggle(v){
  const stream = DRIVE_STREAMS.get(v);
  if(!stream?.buffering) return false;
  stream.cancelBuffer();
  return true;
}
function driveMSERecover(v){
  const stream = DRIVE_STREAMS.get(v);
  if(!stream) return false;
  stream.recover();
  return true;
}

function driveStreamNotice(v, text, reconnect = false){
  const panel = v.closest('.vid-panel');
  if(!panel) return;
  let box = panel.querySelector('.drive-stream-status');
  if(!text){ box?.remove(); return; }
  if(!box){
    box = document.createElement('div'); box.className = 'drive-stream-status';
    box.innerHTML = '<span role="status" aria-live="polite"></span><button type="button" class="lq sm"></button>';
    (panel.querySelector('.vid-meta') || v).after(box);
  }
  box.querySelector('span').textContent = text;
  const button = box.querySelector('button');
  /* 服務帳戶模式下沒有「Google 視窗」可開——按鈕做的是向後端再要一張，文案照實寫。 */
  button.textContent = reconnect && DRIVE.backend !== true ? '重新連結 Google' : '重新連線';
  button.onclick = async () => {
    const stream = DRIVE_STREAMS.get(v);
    button.disabled = true;
    try{
      if(reconnect && !await driveAuth(false)) return;
      if(DRIVE_STREAMS.get(v) === stream) stream?.recover(true);
    }finally{ button.disabled = false; }
  };
}

/* ---------- 診斷面板（iPad 沒有 devtools，數字要寫在畫面上） ----------
   開法：網址加 ?febdiag=1 一次（記進 localStorage feb-mse-debug），?febdiag=0 關。
   顯示的是這一支串流的即時讀數：前方緩衝秒數、在途請求數、平均來回延遲、有效速率、
   停頓次數與累計秒數、hold 次數、權杖剩餘分鐘。「複製診斷」把最近的事件紀錄
   放進剪貼簿，貼給我就能定案，不必猜。 */
function driveDiagEnabled(){
  try{ return localStorage.getItem('feb-mse-debug') === '1'; }catch(e){ return false; }
}
try{
  const q = new URLSearchParams(location.search).get('febdiag');
  if(q === '1') localStorage.setItem('feb-mse-debug', '1');
  else if(q === '0') localStorage.removeItem('feb-mse-debug');
}catch(e){}
function driveDiagNew(){
  return {since: Date.now(), req: 0, fail: 0, bytes: 0, dlMs: 0, busyMs: 0, busySince: 0, ttfbMs: 0, ttfbN: 0,
          stalls: 0, stallMs: 0, stallAt: 0, holds: 0, quota: 0, aborted: 0, retries: 0, auth: 0,
          log: []};
}
function driveDiagLog(diag, line){
  if(!diag) return;
  const t = ((Date.now() - diag.since) / 1000).toFixed(1).padStart(7);
  diag.log.push(t + 's ' + line);
  if(diag.log.length > 160) diag.log.splice(0, diag.log.length - 160);
}
function driveDiagText(diag, v, extra){
  const mb = n => (n / 1048576).toFixed(1) + ' MB';
  /* 有效速率＝總位元組 ÷「至少有一條在途」的牆鐘時間；三條並行時各自的耗時會重疊，不能相加。 */
  const busy = diag.busyMs + (diag.busySince ? Date.now() - diag.busySince : 0);
  const rate = busy ? (diag.bytes / 1048576) / (busy / 1000) : 0;
  const ttfb = diag.ttfbN ? diag.ttfbMs / diag.ttfbN / 1000 : 0;
  const tokMin = DRIVE.exp ? Math.max(0, Math.round((DRIVE.exp - Date.now()) / 60000)) : 0;
  return [
    `倍速 ${v.playbackRate}×｜前方緩衝 ${extra.ahead.toFixed(1)} 秒（目標 ${extra.horizon} 秒）`,
    `在途 ${extra.inflight} 條｜已下載待餵 ${extra.ready} 批｜streaming=${extra.streaming ? 1 : 0}${extra.holding ? '｜hold 中' : ''}`,
    `請求 ${diag.req} 次（失敗 ${diag.fail}、重試 ${diag.retries}、取消 ${diag.aborted}）｜共 ${mb(diag.bytes)}`,
    `平均來回延遲 ${ttfb.toFixed(2)} 秒｜有效速率 ${rate.toFixed(2)} MB/s（需要 ${(extra.need / 1048576).toFixed(2)} MB/s）`,
    `停頓 ${diag.stalls} 次／累計 ${(diag.stallMs / 1000).toFixed(1)} 秒｜hold ${diag.holds} 次｜配額 ${diag.quota}｜換權杖 ${diag.auth}`,
    `權杖來源 ${DRIVE.backend === true ? '後端服務帳戶' : 'Google 視窗'}｜剩 ${tokMin} 分｜${extra.engine}`,
  ].join('\n');
}
function driveDiagRender(v, diag, extra){
  const panel = v.closest?.('.vid-panel');
  if(!panel) return;
  let box = panel.querySelector('.drive-diag');
  if(!driveDiagEnabled()){ box?.remove(); return; }
  if(!box){
    box = document.createElement('div'); box.className = 'drive-diag';
    box.innerHTML = '<pre></pre><button type="button" class="lq sm">複製診斷</button>';
    box.querySelector('button').onclick = async () => {
      const text = driveDiagText(diag, v, extra) + '\n\n' + diag.log.join('\n');
      try{ await navigator.clipboard.writeText(text); toastMsg('診斷已複製，貼給我就好。'); }
      catch(e){ toastMsg('複製失敗，請截圖。'); }
    };
    (panel.querySelector('.drive-stream-status') || panel.querySelector('.vid-meta') || v).after(box);
  }
  box.querySelector('pre').textContent = driveDiagText(diag, v, extra);
}

/** 回 true 表示串流已接管，暫時斷線不應降級成 Google 預覽。 */
async function driveMSEAttach(v, url, code, resume = null, initial = null){
  DRIVE.mseWhy = '';
  if(!CLOUD || !v || !driveMediaBypassesSW()) return false;
  const id = driveIdFromURL(url);
  const k = DRIVE.byId?.[id]?.code || (code && spNorm(code));
  const fragEnt = DRIVE.map?.files?.[k + '.frag.mp4'];
  const idxUrl = driveSidecar(url, '.fragidx.json');
  const MS = driveMSEClass();
  if(!id || !fragEnt?.id || !idxUrl || !MS) return false;
  driveMSEDetach(v);
  const life = new AbortController();
  const diag = driveDiagNew(); DRIVE.diag = diag;
  let stopped = false, ms, sb, objectURL = '', timer, watchdog;
  let idx, gen = 0, ended = false, appendCur = 0;
  let initialized = false, setupFailed = false, streaming = true, failures = 0, authNeeded = false;
  let lastTime = v.currentTime, lastAdvance = Date.now(), lastFrame = Date.now();
  let frameHandle = null, holding = false, bufferPauses = 0, draining = false, drainAgain = false;
  /* 起手位置：loadedmetadata 之前 currentTime 還是 0，但我們早就知道要從哪裡播
     （resume.time 或播放器記錄的 initial.time）。不看這個就會先抓片頭 0.35 MB 再跳走——
     2026-09-13 本機日誌每次 recover 都多付一次延遲。第一次 seeking 之後就以 currentTime 為準。 */
  let pendingStart = null;
  const posNow = () => (pendingStart != null && v.currentTime < 1) ? pendingStart : v.currentTime;
  /* inflight：first → {first, next, off, len, ctrl, tries}；ready：first → {first, next, bytes}。
     兩張表都以「片段序號」為鍵，append 只看 appendCur 落在哪一批裡。 */
  const inflight = new Map(), ready = new Map();
  const state = {
    restoring: !!resume,
    get buffering(){ return holding; },
    cancelBuffer(){ holding = false; notice(''); if(typeof vctlSync === 'function') vctlSync(); },
    dispose(){
      stopped = true; gen++; life.abort(); abortAll();
      clearTimeout(timer); clearInterval(watchdog);
      if(frameHandle !== null) v.cancelVideoFrameCallback?.(frameHandle);
      if(objectURL) URL.revokeObjectURL(objectURL);
      if(DRIVE.diag === diag) DRIVE.diag = null;
      if(DRIVE_STREAMS.get(v) === state){ DRIVE_STREAMS.delete(v); driveStreamNotice(v, ''); v.closest?.('.vid-panel')?.querySelector('.drive-diag')?.remove(); }
    },
    recover(manual = false){
      if(stopped) return;
      const attempts = resume?.attempts || [];
      const recent = attempts.filter(t => Date.now() - t < 60000);
      if(!manual && recent.length >= 2){
        driveStreamNotice(v, '串流尚未恢復，請按重新連線。', authNeeded); return;
      }
      const position = state.restoring ? resume : (!initialized && initial ? initial :
        {time: v.currentTime, rate: v.playbackRate, play: !v.paused || holding});
      const saved = {...position, attempts: manual ? [] : [...recent, Date.now()]};
      driveDiagLog(diag, 'recover manual=' + manual);
      void driveMSEAttach(v, url, code, saved, initial);
    },
  };
  DRIVE_STREAMS.set(v, state);
  const listen = (target, name, fn) => target.addEventListener(name, fn, {signal: life.signal});
  const notice = (text, auth = false) => { if(!stopped) driveStreamNotice(v, text, auth); };
  let resetPause = !!resume && !v.paused;
  listen(v, 'pause', () => {
    if(resetPause){ resetPause = false; return; }
    if(bufferPauses){ bufferPauses--; return; }
    holding = false;
    if(state.restoring) resume.play = false;
    else if(!initialized && initial) initial.play = false;
  });
  if(resume){ v.pause(); v.removeAttribute('src'); v.load(); }
  notice(resume ? '正在恢復原播放位置…' : '正在準備串流…');

  const findFrag = t => {
    let lo = 0, hi = idx.frags.length - 1;
    while(lo < hi){ const mid = (lo + hi + 1) >> 1; if(idx.frags[mid][0] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const aheadOf = () => {
    for(let i = 0; i < v.buffered.length; i++)
      if(v.currentTime >= v.buffered.start(i) - .1 && v.currentTime <= v.buffered.end(i))
        return v.buffered.end(i) - v.currentTime;
    return 0;
  };
  const rateOf = () => Math.max(1, v.playbackRate || 1);
  const horizon = () => Math.min(MSE_AHEAD_MAX, MSE_AHEAD_SEC * rateOf());
  /* hold 的兩道門檻（媒體秒）：進 < 2×倍速、出 ≥ 4×倍速。3 倍＝進 6 秒／出 12 秒（4 秒牆鐘）。
     舊版是進 12／出 24，加上任何 waiting 無條件進，等於把每次短暫追不上放大成好幾秒。 */
  const holdEnter = () => 2 * rateOf();
  const reserve = () => Math.max(0, Math.min(4 * rateOf(), idx.dur - v.currentTime - .15));
  function hold(){
    if(!streaming){ notice('等待系統緩衝下一段…', authNeeded); return; }
    if(!holding){ diag.holds++; driveDiagLog(diag, 'hold ahead=' + aheadOf().toFixed(1)); }
    holding = true;
    if(!v.paused){ bufferPauses++; v.pause(); }
    notice('正在預先緩衝 ' + v.playbackRate + ' 倍速播放，位置已保留…', authNeeded);
    if(typeof vctlSync === 'function') vctlSync();
    pump();
  }
  function releaseBuffer(){
    if(!holding || aheadOf() < reserve()) return;
    holding = false; notice('');
    driveDiagLog(diag, 'release ahead=' + aheadOf().toFixed(1));
    void v.play().catch(() => notice('緩衝已備妥，請按播放繼續。'));
  }
  const stallBegin = () => { if(!diag.stallAt){ diag.stallAt = Date.now(); diag.stalls++; driveDiagLog(diag, 'waiting t=' + v.currentTime.toFixed(1) + ' ahead=' + aheadOf().toFixed(1)); } };
  const stallEnd = () => { if(diag.stallAt){ diag.stallMs += Date.now() - diag.stallAt; diag.stallAt = 0; } };

  /* 事件：一律只「催」管線（pump），不砍在途請求——砍掉的位元組要重付一次延遲。 */
  function wake(){
    if(stopped || document.hidden) return;
    if(!initialized){ if(setupFailed) state.recover(); return; }
    if(ms?.readyState === 'closed'){ state.recover(); return; }
    pump(); drain();
  }
  listen(window, 'online', () => { retryNow(); wake(); });
  listen(window, 'offline', () => notice('網路已中斷，連線恢復後會重試。'));
  listen(document, 'visibilitychange', () => { if(!document.hidden) wake(); });
  listen(window, 'feb-drive-authorized', () => { authNeeded = false; failures = 0; diag.auth++; retryNow(); wake(); });
  listen(v, 'play', () => {
    if(state.restoring) resume.play = true;
    else if(!initialized && initial) initial.play = true;
    lastAdvance = lastFrame = Date.now();
    if(initialized && v.playbackRate >= 2.5 && aheadOf() < holdEnter()) hold();
    wake();
  });
  listen(v, 'ratechange', () => {
    if(initialized && !v.paused && v.playbackRate >= 2.5 && aheadOf() < holdEnter()) hold();
    pump();
  });
  listen(v, 'waiting', () => {
    stallBegin();
    /* 只有前方真的乾了才 hold。play()／seek 之後瀏覽器常會先發一個過渡性的 waiting
       （資料在緩衝裡但還沒解碼），前方明明還有幾十秒；那時 hold 會變成
       「續播→waiting→暫停→補一批→續播→waiting→暫停」的振盪（2026-09-13 本機實測 5 連發）。 */
    if(initialized && !v.paused && v.playbackRate >= 2.5 && aheadOf() < holdEnter()) hold();
    else if(aheadOf() < 1) notice('正在緩衝，播放位置已保留…', authNeeded);
    pump(); drain();
  });
  listen(v, 'playing', () => {
    stallEnd();
    lastAdvance = Date.now();
    if(initialized && v.playbackRate >= 2.5 && aheadOf() < holdEnter()) hold();
    else if(!authNeeded) notice('');
  });

  const update = operation => new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(limit); sb.removeEventListener('updateend', ok); sb.removeEventListener('error', bad);
      life.signal.removeEventListener('abort', cancel);
      error ? reject(error) : resolve();
    };
    const ok = () => finish(), bad = () => finish(new Error('SourceBuffer error'));
    const cancel = () => finish(new DOMException('串流已取消', 'AbortError'));
    const limit = setTimeout(() => finish(new Error('SourceBuffer timeout')), 10000);
    sb.addEventListener('updateend', ok, {once: true}); sb.addEventListener('error', bad, {once: true});
    life.signal.addEventListener('abort', cancel, {once: true});
    try{ operation(); }catch(e){ finish(e); }
  });
  async function range(off, len, signal, stats){
    if(!driveSignedIn() && !await driveAuth(true)){
      authNeeded = true; throw new Error('auth');
    }
    if(signal.aborted) throw signal.reason;
    const options = {headers: {Range: `bytes=${off}-${off + len - 1}`}, cache: 'no-store', signal, stats,
                     timeoutMs: Math.min(90000, Math.max(30000, len / 32768 * 1000))};
    let result = await driveRead(driveURL(fragEnt.id), options);
    if(result.status === 401){
      if(!await driveAuth(true)){ authNeeded = true; throw new Error('auth'); }
      result = await driveRead(driveURL(fragEnt.id), options);
    }
    if(result.status !== 206 || result.body.byteLength !== len) throw new Error('分段回應不完整：' + result.status);
    authNeeded = false;
    return result.body;
  }

  /* ── 排程 ── */
  const pendingBytes = () => {
    let n = 0;
    for(const e of inflight.values()) n += e.len;
    for(const e of ready.values()) n += e.bytes.byteLength;
    return n;
  };
  /* 序號 i 若已被某一批（在途或已下載）涵蓋，回那一批的下一個序號；否則回 i。 */
  function coveredUntil(i){
    for(const t of [inflight, ready]) for(const e of t.values()) if(e.first <= i && i < e.next) return e.next;
    return i;
  }
  /* 從序號 i 起算，下一批最多能延伸到哪（不能撞上已存在的批）。 */
  function nextTaken(i){
    let m = idx.frags.length;
    for(const t of [inflight, ready]) for(const e of t.values()) if(e.first > i && e.first < m) m = e.first;
    return m;
  }
  /* 目前位置之後第一個還沒緩衝的片段：跳進已緩衝的範圍時從緩衝尾巴接著抓，不重抓。 */
  function firstUnbuffered(){
    const t = v.currentTime;
    for(let i = 0; i < v.buffered.length; i++)
      if(t >= v.buffered.start(i) - .1 && t <= v.buffered.end(i)) return Math.min(idx.frags.length, findFrag(v.buffered.end(i) - .05) + 1);
    return findFrag(t);
  }
  const retryTimers = new Map();   // timer → 待重試的批次
  function abortAll(){
    for(const e of inflight.values()){ e.ctrl.abort(new DOMException('串流已取消', 'AbortError')); diag.aborted++; }
    inflight.clear(); ready.clear();
    for(const t of retryTimers.keys()) clearTimeout(t);
    retryTimers.clear();
  }
  function retryNow(){
    const again = [...retryTimers.values()];
    for(const t of retryTimers.keys()) clearTimeout(t);
    retryTimers.clear();
    for(const b of again) launch(b);
  }
  function retryLater(batch, delay){
    if(stopped) return;
    const t = setTimeout(() => { retryTimers.delete(t); if(!stopped && batch.gen === gen) launch(batch); }, delay);
    retryTimers.set(t, batch);
  }
  function pump(){
    if(stopped || !initialized || !streaming || ended || navigator.onLine === false) return;
    if(!ms || ms.readyState !== 'open') return;
    const h = horizon();
    while(inflight.size < MSE_PAR){
      // 從下一個要餵的片段起算，跳過已在途／已下載的，先補洞再往前
      let i = appendCur;
      for(;;){ const j = coveredUntil(i); if(j === i) break; i = j; }
      if(i >= idx.frags.length) break;
      if(idx.frags[i][0] - posNow() > h) break;
      if(pendingBytes() >= MSE_PENDING_BYTES) break;
      const ahead = aheadOf();
      /* 冷啟動（起播、跳到沒緩衝的地方）：第一條小一點、而且**只開一條**，落地了才並行。
         2026-09-13 本機以 320 KB/s 共用頻寬實測：三條同時開，第一格要等 9.7 秒——
         小批次跟兩條 4 MiB 搶同一條線。先讓第一格出來，再談吞吐。 */
      if(ahead < 1 && i !== appendCur) break;
      const limit = nextTaken(i);
      /* 批次大小隨前方緩衝爬升（像 TCP 慢啟動）：緩衝薄時用小批次讓資料早點餵進去、
         hold 早點解除；緩衝厚了才用 4 MiB 把來回延遲攤平。跟舊版「緩衝越低抓越少（一片）」
         的差別：這裡最少 1 MiB、而且始終三條並行，延遲永遠是攤的不是疊的。 */
      const budget = ahead < 1 ? MSE_FIRST_BYTES : ahead < 15 ? 1024 * 1024 : ahead < 45 ? 2 * 1024 * 1024 : MSE_BATCH_BYTES;
      let next = i + 1, off = idx.frags[i][1], len = idx.frags[i][2];
      while(next < limit){
        const [, start, size] = idx.frags[next];
        if(start !== off + len || len + size > budget) break;
        len += size; next++;
      }
      launch({first: i, next, off, len, gen, tries: 0});
    }
  }
  function launch(batch){
    if(stopped || batch.gen !== gen) return;
    if(inflight.has(batch.first)) return;
    const ctrl = new AbortController();
    const entry = {...batch, ctrl};
    if(!inflight.size) diag.busySince = Date.now();
    inflight.set(entry.first, entry);
    diag.req++;
    const stats = {};
    const started = Date.now();
    const settle = () => {
      if(inflight.get(entry.first) === entry) inflight.delete(entry.first);
      if(!inflight.size && diag.busySince){ diag.busyMs += Date.now() - diag.busySince; diag.busySince = 0; }
    };
    range(entry.off, entry.len, ctrl.signal, stats).then(bytes => {
      settle();
      if(stopped || entry.gen !== gen) return;
      diag.bytes += bytes.byteLength; diag.dlMs += Date.now() - started;
      if(stats.headersMs != null){ diag.ttfbMs += stats.headersMs; diag.ttfbN++; }
      driveDiagLog(diag, `got #${entry.first}-${entry.next - 1} ${(bytes.byteLength / 1048576).toFixed(2)}MB ttfb=${stats.headersMs}ms total=${stats.totalMs}ms ahead=${aheadOf().toFixed(1)}`);
      ready.set(entry.first, {first: entry.first, next: entry.next, bytes});
      failures = 0;
      drain(); pump();
    }, e => {
      settle();
      if(stopped || entry.gen !== gen) return;
      if(e?.name === 'AbortError'){ pump(); return; }
      failures++; diag.fail++;
      driveDiagLog(diag, `fail #${entry.first} ${e?.message || e}`);
      notice(authNeeded ? '播放授權需要更新，位置已保留。' : '連線暫時停住，正在重新取得片段…', authNeeded);
      diag.retries++;
      retryLater({first: entry.first, next: entry.next, off: entry.off, len: entry.len, gen: entry.gen, tries: entry.tries + 1},
                 authNeeded ? 10000 : Math.min(5000, 1000 * (entry.tries + 1)));
    });
  }
  /* 清掉用不到的緩衝：目前時間往前 behind 秒以前的、往後 ahead 秒以後的。
     每個 remove 各自 try/catch：區間不合法（例如 t<5 時的 [0,0)）會丟 TypeError，不能讓它打斷餵片。 */
  async function evict(behind, ahead){
    const t = v.currentTime;
    try{
      if(sb.buffered.length && t - behind > sb.buffered.start(0) + .5)
        await update(() => sb.remove(0, t - behind));
    }catch(_){}
    for(let i = sb.buffered.length - 1; i >= 0; i--){
      try{
        if(sb.buffered.start(i) > t + ahead)
          await update(() => sb.remove(sb.buffered.start(i), sb.buffered.end(i)));
      }catch(_){}
    }
  }
  /* 單一 appender：按 appendCur 找已下載的那一批餵進去；配額不足就清後方再試同一批。 */
  async function drain(){
    if(draining){ drainAgain = true; return; }
    draining = true;
    try{
      for(;;){
        drainAgain = false;
        if(stopped || !initialized || !ms || ms.readyState !== 'open') return;
        if(appendCur >= idx.frags.length){
          if(!ended && inflight.size === 0 && ready.size === 0){ ended = true; try{ ms.endOfStream(); }catch(e){} }
          return;
        }
        let hit = null;
        for(const e of ready.values()) if(e.first <= appendCur && appendCur < e.next){ hit = e; break; }
        if(!hit){
          // 已下載的批次都在後面（前面那批還沒回來或被丟掉）→ 等；但要確認前面的洞有人在補
          pump();
          return;
        }
        const my = gen;
        try{
          if(sb.buffered.length && sb.buffered.start(0) < v.currentTime - MSE_KEEP_BEHIND_SEC - 5)
            await evict(MSE_KEEP_BEHIND_SEC, horizon() + 60);
          if(stopped || my !== gen) return;
          await update(() => sb.appendBuffer(hit.bytes));
          if(stopped || my !== gen) return;
          ready.delete(hit.first);
          appendCur = hit.next;
          releaseBuffer();
          if(!holding && aheadOf() >= holdEnter()) notice('');
          pump();
        }catch(e){
          if(stopped || my !== gen) return;
          if(e.name === 'AbortError') return;
          if(e.name === 'QuotaExceededError'){
            diag.quota++; driveDiagLog(diag, 'quota ahead=' + aheadOf().toFixed(1));
            await evict(5, 60);
            if(stopped || my !== gen) return;
            /* 清完還是塞不下＝瀏覽器現在不收（MMS 沒在 streaming 也會這樣）：等下一次催。 */
            timer = setTimeout(drain, 500);
            return;
          }
          if(String(e.message).startsWith('SourceBuffer')){ state.recover(); return; }
          driveDiagLog(diag, 'append error ' + (e?.message || e));
          timer = setTimeout(drain, 1000);
          return;
        }
      }
    }finally{
      draining = false;
      if(drainAgain && !stopped){ drainAgain = false; queueMicrotask(drain); }
    }
  }
  function reseek(){
    gen++;
    const start = firstUnbuffered();
    /* 只丟「用不到」的：整批在新位置之前、或超出目標範圍的。跨過新位置的那批留著。 */
    for(const [k, e] of inflight){
      if(e.next <= start || idx.frags[e.first][0] - v.currentTime > horizon() + 10){
        e.ctrl.abort(new DOMException('串流已取消', 'AbortError')); diag.aborted++; inflight.delete(k);
      }else e.gen = gen;
    }
    for(const [k, e] of ready) if(e.next <= start || idx.frags[e.first][0] - v.currentTime > horizon() + 10) ready.delete(k);
    for(const t of retryTimers.keys()) clearTimeout(t);
    retryTimers.clear();
    appendCur = start; ended = false; pendingStart = null;
    driveDiagLog(diag, 'seek t=' + v.currentTime.toFixed(1) + ' start#' + start + ' keep=' + inflight.size);
  }

  try{
    const result = await driveRead(idxUrl, {signal: life.signal});
    if(stopped) return true;
    if(result.status !== 200) throw new Error('索引 HTTP ' + result.status);
    idx = JSON.parse(new TextDecoder().decode(result.body));
    if(idx.v !== 1 || !idx.frags?.length || !idx.init || idx.size !== Number(fragEnt.size)) throw new Error('索引與影片不一致');
    if(!MS.isTypeSupported(idx.codecs)) throw new Error('裝置不支援影片編碼');
    if(resume) pendingStart = Math.max(0, Math.min(idx.dur - .1, resume.time));
    else if(initial && initial.time > 1 && initial.time < idx.dur - 2) pendingStart = initial.time;   // 跟 10-player.js 的續播規則一致
    ms = new MS();
    const managed = !!window.ManagedMediaSource && ms instanceof window.ManagedMediaSource;
    streaming = !managed;
    if(managed){
      v.disableRemotePlayback = true;
      listen(ms, 'startstreaming', () => { streaming = true; driveDiagLog(diag, 'startstreaming ahead=' + aheadOf().toFixed(1)); pump(); drain(); });
      listen(ms, 'endstreaming', () => {
        /* 只停止發新請求。在途的收完照樣餵（收得下就收），砍掉等於白付一次延遲。 */
        streaming = false; driveDiagLog(diag, 'endstreaming ahead=' + aheadOf().toFixed(1));
        // MMS 決定可緩衝多少；不能暫停等待一個它不允許達到的門檻。
        if(holding){ holding = false; notice(''); void v.play().catch(() => {}); }
      });
    }
    listen(ms, 'sourceclose', () => { if(initialized && !stopped) state.recover(); });
    listen(v, 'loadedmetadata', () => {
      if(resume && state.restoring){
        v.currentTime = Math.max(0, Math.min(idx.dur - .1, resume.time));
        v.playbackRate = resume.rate;
        state.restoring = false;
        if(resume.play) void v.play().catch(() => notice('位置已恢復，請按播放繼續。'));
      }
    });
    const opened = new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(limit); ms.removeEventListener('sourceopen', ok); life.signal.removeEventListener('abort', cancel);
        error ? reject(error) : resolve();
      };
      const ok = () => finish(), cancel = () => finish(new DOMException('串流已取消', 'AbortError'));
      const limit = setTimeout(() => finish(new Error('播放引擎啟動逾時')), 10000);
      ms.addEventListener('sourceopen', ok, {once: true}); life.signal.addEventListener('abort', cancel, {once: true});
    });
    objectURL = URL.createObjectURL(ms); v.src = objectURL;
    await opened;
    ms.duration = idx.dur; sb = ms.addSourceBuffer(idx.codecs); sb.mode = 'segments';
    const init = await range(idx.init[0], idx.init[1], life.signal);
    if(stopped) return true;
    await update(() => sb.appendBuffer(init));
    if(stopped) return true;
    initialized = true; appendCur = findFrag(posNow());
    listen(v, 'seeking', () => {
      if(ms.readyState === 'ended'){ state.recover(true); return; }
      reseek(); pump(); drain();
    });
    if(v.requestVideoFrameCallback){
      const frame = () => { lastFrame = Date.now(); if(!stopped) frameHandle = v.requestVideoFrameCallback(frame); };
      frameHandle = v.requestVideoFrameCallback(frame);
    }
    const engine = managed ? 'ManagedMediaSource' : 'MediaSource';
    watchdog = setInterval(() => {
      if(stopped || document.hidden) return;
      if(v.paused){ lastAdvance = lastFrame = Date.now(); }
      if(v.currentTime !== lastTime){ lastTime = v.currentTime; lastAdvance = Date.now(); }
      const rect = v.getBoundingClientRect();
      const visible = rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
      /* 只看「時間軸 20 秒沒前進」。原本另一條「20 秒沒有新畫格」在畫面被遮住／分割視窗／
         內嵌瀏覽器隱藏時會誤判（rVFC 不會來但影片其實在播），2026-09-13 本機每 50 秒就被它重啟一次。 */
      if(!v.paused && !v.seeking && aheadOf() > 3 && visible && document.visibilityState !== 'hidden' &&
          Date.now() - lastAdvance > 20000)
        state.recover();
      else{ pump(); drain(); }
      if(driveDiagEnabled()) driveDiagRender(v, diag, {
        ahead: aheadOf(), horizon: horizon(), inflight: inflight.size, ready: ready.size, streaming, holding,
        need: (idx.size / idx.dur) * rateOf(), engine,
      });
    }, 1000);
    pump(); drain();
  }catch(e){
    if(!stopped){
      setupFailed = true; DRIVE.mseWhy = e.message;
      notice(authNeeded ? '播放授權需要更新，位置已保留。' : '串流準備失敗，請重新連線。', authNeeded);
    }
  }
  return true;
}
function driveIdFromURL(u){
  const s = String(u || '');
  const base = new URL('drive/', document.baseURI).href;
  return s.startsWith(base) ? decodeURIComponent(s.slice(base.length).split(/[?#]/)[0]) : '';
}

/* ---------- Service Worker 握手 ---------- */
async function driveSWok(){
  if(DRIVE.swOK !== null) return DRIVE.swOK;
  const c = navigator.serviceWorker?.controller;
  if(!c){ DRIVE.swOK = false; return false; }
  DRIVE.swOK = await new Promise(res => {
    const t = setTimeout(() => { navigator.serviceWorker.removeEventListener('message', on); res(false); }, 2500);
    function on(ev){
      if((ev.data || {}).type !== 'drive-pong') return;
      clearTimeout(t); navigator.serviceWorker.removeEventListener('message', on); res(!!ev.data.ok);
    }
    navigator.serviceWorker.addEventListener('message', on);
    c.postMessage({type: 'drive-ping'});
  });
  return DRIVE.swOK;
}
/* 帳本與權杖推給 SW。SW 被回收之後記憶體是空的，所以這件事會做很多次，
   而且必須便宜——帳本只有一百來筆，整包丟過去比讓 SW 自己去抓省事。 */
function drivePush(){
  const c = navigator.serviceWorker?.controller;
  if(!c || !DRIVE.byId) return;
  c.postMessage({type: 'drive-init', map: DRIVE.byId, token: DRIVE.token, exp: DRIVE.exp});
}

/* ---------- 權杖 ---------- */
function driveRestoreToken(){
  try{
    // 先讀新位置；sessionStorage 是舊位置，只為了讓改版當下已開著的分頁不掉權杖
    const d = JSON.parse(localStorage.getItem(DRIVE_TOK_SS)
                      || sessionStorage.getItem(DRIVE_TOK_SS) || 'null');
    if(d && d.t && d.e > Date.now() + 60000){ DRIVE.token = d.t; DRIVE.exp = d.e; }
  }catch(e){}
}
/* 權杖存 localStorage（2026-09-04 改，原本是 sessionStorage）。

   使用者回報：「滑掉重新登入網頁 google 又要重新連結」。
   成因是兩件事疊起來：
     1. sessionStorage 在分頁關掉時清空 → 權杖沒了
     2. 靜默續期（prompt:''）走隱藏 iframe ＋ Google 第三方 cookie，
        iPad Safari 的 ITP 擋掉 → 補不回來 → 只能再按一次「連結」
   於是每一次關分頁都要重連，而不是每小時一次。

   取捨（推翻原本「權杖永不進 localStorage」的決定）：
     · 存活期**沒有變長**——寫入時就記下 exp，讀取時 driveRestoreToken() 會
       把過期的丟掉，所以它最多還是活一小時
     · 權限只有 Drive 唯讀，站台本身有通行碼擋在前面
     · localStorage 與 sessionStorage 一樣是同源 JS 可讀，真被 XSS 打穿時
       兩者沒有實質差別；差別只在「關分頁會不會清掉」
   換到的是：一小時內關掉再開回來不必重連。這是使用者實際在痛的點。 */
function driveSetToken(t, sec){
  driveSetTokenAt(t, t ? Date.now() + (Number(sec) || 3600) * 1000 : 0);
}
function driveSetTokenAt(t, expMs){
  DRIVE.token = t || '';
  DRIVE.exp = t ? Number(expMs) || 0 : 0;
  try{
    if(t) localStorage.setItem(DRIVE_TOK_SS, JSON.stringify({t: DRIVE.token, e: DRIVE.exp}));
    else localStorage.removeItem(DRIVE_TOK_SS);
    sessionStorage.removeItem(DRIVE_TOK_SS);   // 舊位置：留著只會有兩份真相
  }catch(e){ /* 無痕模式會丟，權杖留在記憶體裡照樣能用 */ }
  drivePush();
  driveRenewSchedule();
  if(t){
    DRIVE.authWarned = false;
    window.dispatchEvent?.(new Event('feb-drive-authorized'));
  }
}
const driveSignedIn = () => !!DRIVE.token && DRIVE.exp > Date.now() + 30000;

/* 到期前五分鐘自動向後端再要一張（只在服務帳戶模式）。播到一半不會撞到 401、
   也不會有 8 秒的靜默續期等待。失敗就一分鐘後再試，直到成功或串流關掉。 */
function driveRenewSchedule(){
  clearTimeout(DRIVE.renewTimer); DRIVE.renewTimer = null;
  if(!CLOUD || DRIVE.backend !== true || !DRIVE.token) return;
  const wait = Math.max(10000, DRIVE.exp - Date.now() - DRIVE_RENEW_AHEAD_MS);
  DRIVE.renewTimer = setTimeout(async () => {
    DRIVE.renewTimer = null;
    if(!await driveTokenFromBackend()){
      DRIVE.renewTimer = setTimeout(() => { DRIVE.renewTimer = null; driveRenewSchedule(); }, 60000);
      DRIVE.exp = Math.max(DRIVE.exp, Date.now() + DRIVE_RENEW_AHEAD_MS + 61000);  // 讓下一次排程落在一分鐘後
    }
  }, wait);
}
/* 向後端要一張服務帳戶簽的權杖。單飛：同時多個呼叫共用同一次請求。
   回 false 的同時把 DRIVE.backend 標好，呼叫端才知道要不要退回 GIS。 */
async function driveTokenFromBackend(){
  if(!CLOUD || DRIVE.backend === false) return false;
  if(DRIVE.backendPending) return DRIVE.backendPending;
  DRIVE.backendPending = (async () => {
    try{
      const r = await fetch(DRIVE_API.token, {method: 'POST', credentials: 'same-origin', cache: 'no-store',
                                              headers: {'Content-Type': 'application/json'}, body: '{}'});
      if(r.status === 404 || r.status === 501 || r.status === 405){ DRIVE.backend = false; return false; }
      if(r.status === 403){ DRIVE.backend = false; return false; }   // 不是主人：這台裝置走不了服務帳戶
      if(!r.ok) return false;                                         // 401（通行碼過期）、5xx：暫時性
      const j = await r.json();
      if(!j?.token || !(Number(j.exp) > Date.now())) return false;
      DRIVE.backend = true;
      driveSetTokenAt(j.token, Number(j.exp));
      return true;
    }catch(e){ return false; }
    finally{ DRIVE.backendPending = null; }
  })();
  return DRIVE.backendPending;
}

/* Google Identity Services。刻意**按需載入**：沒按「連結 Google 雲端硬碟」
   之前，這個站不會去 accounts.google.com 要任何東西，也不會多一個外部相依。 */
function driveGIS(){
  if(window.google?.accounts?.oauth2) return Promise.resolve(true);
  if(driveGIS._p) return driveGIS._p;
  driveGIS._p = new Promise(res => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => res(!!window.google?.accounts?.oauth2);
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
  return driveGIS._p;
}

/* 取得權杖的唯一入口。先問後端（服務帳戶，沒有任何視窗）；後端明確說「沒設定／不是主人」
   才退回 GIS。silent=true 走 GIS 的靜默續期（prompt:''）：Google 那邊還有登入階段、
   而且這個用戶端已經被同意過，就不會跳任何視窗。 */
async function driveAuth(silent){
  await driveLoad();
  if(DRIVE.backend !== false){
    if(await driveTokenFromBackend()) return true;
    if(DRIVE.backend === true) return false;    // 已知可用、這次只是暫時失敗（網路／通行碼）：不開 Google 視窗
  }
  if(!DRIVE.clientId) return false;
  if(!await driveGIS()){
    if(!silent) toastMsg('連不到 Google 的登入元件（要有網路）。');
    return false;
  }
  if(DRIVE.authPending) return DRIVE.authPending;
  const seq = DRIVE.authSeq = (DRIVE.authSeq || 0) + 1;
  let settle, done = false;
  const pending = new Promise(resolve => { settle = resolve; });
  DRIVE.authPending = pending;
  const finish = ok => {
    if(done) return;
    done = true;
    clearTimeout(timer);
    if(DRIVE.authPending === pending) DRIVE.authPending = null;
    settle(ok);
  };
  const timer = setTimeout(() => finish(false), silent ? 8000 : 120000);
  DRIVE.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE.clientId,
    scope: DRIVE_SCOPE,
    callback: r => {
      if(seq !== DRIVE.authSeq) return;
      // 等待逾時不代表 Google 的請求已取消；晚到的有效權杖仍需收下。
      if(r && r.access_token){
        driveSetToken(r.access_token, r.expires_in);
        try{ localStorage.setItem('feb-drive-ok', '1'); }catch(e){}
        finish(true);
      }else finish(false);
    },
    error_callback: () => finish(false),
  });
  try{ DRIVE.tokenClient.requestAccessToken(silent ? {prompt: ''} : {}); }
  catch(e){ finish(false); }
  return pending;
}
/* ⚠ GIS 的靜默續期（prompt:''）走的是隱藏 iframe＋Google 的第三方 cookie。
   Safari 預設擋跨站追蹤（ITP），所以**在 iPad 上它很可能一次都不會成功**。
   這正是 2026-09-13 改走服務帳戶的原因；這條只剩退路的角色。 */

/* 這台裝置的 <video> 會不會繞過 Service Worker？

   2026-09-04 實證：iPad 上 /drive/<id> 直接打到 Cloudflare、拿回 index.html，
   <video> 回 MEDIA_ERR_SRC_NOT_SUPPORTED（錯誤 4）。WebKit 讓媒體載入走系統層，
   不受 SW 管轄——這不是設定問題，改不動。
   兩道判斷：
     1. UA：iPhone／iPad（iPadOS 會偽裝成 Mac，靠 maxTouchPoints 抓）
     2. 學習旗標 feb-drive-nosw：任何平台只要在 Drive 網址上撞過一次錯誤 4，
        就記下來，下次不再重試一條註定失敗的路、不再噴一次錯誤給使用者看。
   回 true ＝ 直接走 Google 的預覽播放器（思考地圖與章節仍由我們的右欄供應）。 */
function driveMediaBypassesSW(){
  try{ if(localStorage.getItem('feb-drive-nosw') === '1') return true; }catch(e){}
  const ua = navigator.userAgent || '';
  if(/iP(hone|ad|od)/.test(ua)) return true;
  if(navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) return true;  // iPadOS 桌面模式
  return false;
}

/* 這一集現在能不能用 Feb 自己的播放器播？三道門全過才算。
   服務帳戶模式：沒權杖就安靜地跟後端要一張（沒有任何視窗，點一下就播）。
   GIS 模式：刻意**不**在這裡做互動式登入，沒連過就讓路給隨播面板那顆「連結」。 */
async function driveCanPlay(code){
  await driveLoad();
  if(!driveEnabled()) return false;
  if(!driveEntry(code)) return false;
  if(!await driveSWok()) return false;
  if(!driveSignedIn()){
    if(DRIVE.backend !== false && await driveTokenFromBackend()){ /* 後端給了一張 */ }
    else if(!DRIVE.token) return false;             // GIS 模式且從沒連過：讓路給「連結」，不彈任何東西
    else if(!await driveAuth(true)) return false;   // 有舊權杖但過期：靜默換一張
  }
  drivePush();
  return true;
}

/* 開站時安靜地把權杖續上。服務帳戶模式直接向後端要（主人的裝置一開站就能播）；
   GIS 模式只在「這台裝置以前成功連過」（feb-drive-ok 旗標）才做。 */
async function driveBoot(){
  await driveLoad();
  if(!driveEnabled()) return;
  if(!await driveSWok()) return;
  if(driveSignedIn()){ drivePush(); return; }
  if(DRIVE.backend !== false && await driveTokenFromBackend()) return;
  try{ if(localStorage.getItem('feb-drive-ok') !== '1') return; }catch(e){ return; }
  await driveAuth(true);
}

/* 集數 chip 的雲端分支。回 true＝已經接手，呼叫端不要再開隨播面板。 */
async function drivePlay(code, name){
  if(!await driveCanPlay(code)) return false;
  const e = driveEntry(code);
  /* <video> 繞過 SW 的裝置（iPad）：有 fragmented 重新封裝＋索引、且裝置支援 MSE，
     就照樣開 Feb 自己的播放器——位元組由 driveMSEAttach() 用 fetch 餵，不靠 <video src>。
     沒有（還沒重新封裝、或 iPadOS 太舊）才退到 Google 的預覽。 */
  if(driveMediaBypassesSW() && !driveMSEReady(code)) return driveOpenPreview(code, name);
  closeCompanion?.();                      // 面板可能開著，播放器要蓋在它上面
  openPlayer(driveURL(e.id), name, code);
  return true;
}

/* L2 退路：Drive 自己的預覽播放器，塞進播放器 modal 既有的 iframe。
   誠實講清楚它換掉了什麼——這是 Google 的播放器，不是 Feb 的：
   沒有章節時間軸、沒有 2 倍速鍵、沒有續播記憶。 */
function driveOpenPreview(code, name){
  const e = driveEntry(code);
  if(!e) return false;
  closeCompanion?.();
  openPlayer('', name, undefined, true);
  const m = document.getElementById('vidModal');
  const v = m.querySelector('#vidEl'), fr = m.querySelector('#vidFrame');
  PL_CUR = null;
  v.pause(); v.removeAttribute('src'); v.load(); v.hidden = true;
  fr.hidden = false;
  fr.src = `https://drive.google.com/file/d/${encodeURIComponent(e.id)}/preview`;
  m.classList.add('yt', 'drive-preview');
  /* 掛一條「你現在不在 Feb 的播放器裡」的橫幅，並給一鍵回去的出口。

     2026-09-04 使用者回報：「整體介面都不是以前的設計，思考地圖跟段落分類全都不見」，
     附的截圖就是這個模式——Google 自己的播放器。他沒有做錯任何事：兩顆按鈕長得
     幾乎一樣，而且串流失敗時還會**靜默**把人丟進來。畫面上唯一的說明文字還是
     「YouTube 播放器控制」，跟 Drive 一點關係都沒有。
     不能靠使用者自己看出「我掉到降級模式了」——降級必須自己說話。 */
  const host = m.querySelector('.vid-panel') || m.querySelector('.modal-panel') || m;
  let bar = m.querySelector('.dv-bar');
  if(!bar){
    bar = document.createElement('div');
    bar.className = 'dv-bar';
    host.insertBefore(bar, host.firstChild);
  }
  bar.innerHTML = `<b>Google 的播放器</b>　思考地圖與章節目錄照常，但<b>點時間戳跳轉</b>、
    倍速、續播記憶不能用——影片在 Google 的框裡，我們控制不了。
    <button type="button" class="dv-back">改用 Feb 的播放器</button>`;
  const back = bar.querySelector('.dv-back');
  if(driveMediaBypassesSW()){
    back.remove();
  }else{
    back.onclick = async () => {
      if(await drivePlay(code, name)) return;
      toastMsg('串流還是開不起來——先留在 Google 的播放器。');
    };
  }
  m.hidden = false; document.body.classList.add('modal-open');
  bgVideoPause();

  /* MSE 沒啟動時，把**每一道門**的結果寫在橫幅上（2026-09-04）。 */
  try{
    const k = spNorm(code), files = DRIVE.map?.files || {};
    const MS = (typeof driveMSEClass === 'function') ? driveMSEClass() : null;
    const msName = MS ? (window.ManagedMediaSource && MS === window.ManagedMediaSource ? 'ManagedMediaSource' : 'MediaSource') : '無';
    const gates = [
      ['frag',   !!files[k + '.frag.mp4']?.id],
      ['索引',   !!files[k + '.fragidx.json']?.id],
      ['引擎',   !!MS && typeof MS.isTypeSupported === 'function'],
      ['權杖',   !!DRIVE.token],
      ['繞過SW', (typeof driveMediaBypassesSW === 'function') && driveMediaBypassesSW()],
    ];
    const ua = navigator.userAgent.match(/(?:iPhone|CPU) OS (\d+_\d+)/) || navigator.userAgent.match(/Version\/(\d+\.\d+)/);
    const dg = document.createElement('span');
    dg.className = 'dv-notes dv-mse';
    dg.textContent = 'MSE：' + gates.map(([n, ok]) => n + (ok ? ' ✓' : ' ✗')).join('　')
      + '　引擎=' + msName + '　OS=' + (ua ? ua[1].replace('_', '.') : '?')
      + (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 ? '（iPadOS 桌面模式）' : '')
      + (DRIVE.mseWhy ? '　上次失敗=' + DRIVE.mseWhy : '');
    bar.appendChild(dg);
  }catch(e){ /* 診斷行本身不能把畫面弄壞 */ }

  /* 思考地圖的載入狀態要**寫在畫面上**。 */
  const st = document.createElement('span');
  st.className = 'dv-notes';
  st.textContent = '思考地圖：載入中…';
  bar.appendChild(st);
  const vurl = driveURL(e.id);
  const hasNotes = !!driveSidecar(vurl, '.notes.json');
  if(!hasNotes){
    st.textContent = '思考地圖：這一集還沒產生（本機也沒有）';
  }else if(typeof loadNotes === 'function'){
    loadNotes(vurl).then(() => {
      typeof syncTwoCol === 'function' && syncTwoCol();
      const ok = !!(NOTES && NOTES_URL === vurl);
      st.textContent = ok ? '思考地圖：已載入 ✓'
        : '思考地圖：讀不到——請確認有網路，或重新整理一次';
    }).catch(() => { st.textContent = '思考地圖：讀取失敗（網路）'; });
  }
  return true;
}

/* ---------- 隨播面板裡的 Drive 區塊 ---------- */
/* 回空字串＝這一集在 Drive 上沒有備份，面板維持原本那句 VLC 交接文案。
   有備份時給的兩個出口，差別要講到讓人一眼選得下去：
     · 主動作：Feb 自己的播放器（章節、2 倍速、字幕、續播記憶都在）
     · 次動作：Drive 預覽（Google 的播放器，上面那些一個都沒有）
   GIS 模式還沒連結 Google 的時候主動作變成「連結」——不預先彈視窗，
   授權這種事一定要由一次明確的點擊帶出來。服務帳戶模式沒有這一步。 */
function driveCompanionHTML(code, name){
  const e = driveEntry(code);
  if(!e || !driveEnabled()) return '';
  const gb = Number(e.size) ? (Number(e.size) / 2 ** 30).toFixed(2) + ' GB' : '';
  const at = ` data-code="${esc(code)}" data-name="${esc(name || code)}"`;
  const ready = driveSignedIn() || DRIVE.backend !== false;
  const primary = ready
    ? `<button class="lq gold sm" type="button" data-drive="play"${at}>用 Feb 的播放器串流</button>`
    : `<button class="lq mist2 sm" type="button" data-drive="link"${at}>連結 Google 雲端硬碟</button>`;
  return `<div class="cp-drive">
      <span class="cp-sh">Google 雲端硬碟</span>
      <p class="cp-none">這一支在雲端硬碟上有備份${gb ? `（${esc(gb)}）` : ''}。
        影片直接從 Google 流到這台裝置，不經過 Feb 的伺服器${ready ? '' : '；先連結一次帳號才看得到'}。</p>
      <div class="cp-btns">${primary}
        <button class="dv-alt" type="button" data-drive="preview"${at}
          title="Google 的播放器：沒有思考地圖、章節時間軸、續播記憶與倍速"
          >改用 Google 的播放器（會少掉思考地圖與章節）</button></div>
      <p class="cp-warn">⚠ 用行動網路看要花掉整支影片的流量${gb ? `（約 ${esc(gb)}）` : ''}。</p>
    </div>`;
}

async function driveCompanionClick(act, code, name){
  if(act === 'preview') return void driveOpenPreview(code, name);
  if(act === 'link'){
    toastMsg('開 Google 授權視窗…');
    if(!await driveAuth(false)) return void toastMsg('沒有完成授權。');
    if(!await driveSWok()){
      toastMsg('已連結，但離線元件還沒接管這一頁——重新整理一次再點。');
      return;
    }
    drivePush();
    if(!await drivePlay(code, name)) toastMsg('已連結，但這一支還播不起來。可以先用 Drive 預覽。');
    return;
  }
  /* 串流開不起來時**不再靜默退到 Drive 預覽**（2026-09-04）：講清楚是哪一道門沒過。 */
  if(act === 'play' && await drivePlay(code, name)) return;
  const why = await driveWhyNotPlay(code);
  toastMsg(why ? `串流開不起來：${why}` : '串流開不起來。');
}

/* 哪一道門擋住了？只用來給人看，不影響流程。 */
async function driveWhyNotPlay(code){
  if(!CLOUD) return '這不是雲端模式';
  if(!driveEnabled()) return '還沒設定 Google 用戶端或服務帳戶';
  if(!driveEntry(code)) return '這一集不在雲端帳本裡';
  if(!await driveSWok()) return '離線元件還沒接管這一頁，重新整理一次';
  if(!driveSignedIn()) return DRIVE.backend === true ? '向後端取得影片權杖失敗（網路或通行碼）' : '還沒連結 Google 帳號，或授權過期了';
  return '';
}

/* SW 的權杖沒了（它被回收過，或這一張過期）→ 補一張給它。
   服務帳戶模式：靜默向後端要，一定拿得到（除非離線）。GIS 模式：靜默拿不到就不硬彈視窗，
   正在播的那一段會停，使用者按一次連結鈕就好。 */
async function driveTokenAsk(force = false){
  if(!force && driveSignedIn()){ drivePush(); return; }
  if(await driveAuth(true)) return;
  navigator.serviceWorker?.controller?.postMessage({type: 'drive-token', token: '', exp: 0});
  if(!DRIVE.authWarned){
    DRIVE.authWarned = true;
    toastMsg(DRIVE.backend === true
      ? '影片權杖暫時拿不到（網路？），播放器會自動重試。'
      : '播放授權需要更新，可在播放器按「重新連結 Google」，不必關閉頁面。');
  }
}
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', ev => {
    if((ev.data || {}).type === 'drive-need-token') driveTokenAsk(!!ev.data.force);
  });
}
/* 切回前景時權杖若快到期，立刻換；iPad 鎖屏期間計時器不跑，靠這條補。 */
if(typeof document !== 'undefined' && document.addEventListener){
  document.addEventListener('visibilitychange', () => {
    if(document.hidden || !CLOUD || DRIVE.backend !== true) return;
    if(DRIVE.exp - Date.now() < DRIVE_RENEW_AHEAD_MS) void driveTokenFromBackend();
  });
}

/* 帳本先暖起來。不暖的話，雲端模式第一次點集數 chip 會卡在兩個 fetch 上
   （面板慢半拍才開）——那兩個檔各只有幾 KB，開站時順手抓完最省事。 */
if(CLOUD) addEventListener('load', () => { driveLoad().catch(() => {}); });

/* ---------- 雲端影片庫的資料來源（2026-09-04 使用者判例） ----------
   使用者回報：「影片庫就只有控制的，且影片一樣只會跳轉到 yt」。

   成因不是快取，是真的沒接：loadManifest() 在雲端模式直接 `MANIFEST=[]` 收攤
   （manifest.json 住在家裡的媒體伺服器根目錄，不在雲端部署裡），於是 libGroups()
   只剩 VIDEOS.byChapter 那一組 YouTube——而只有自動控制有 YouTube 影片，
   所以整個影片庫看起來就只有控制，點下去也只能跳 YouTube。

   帳本其實已經帶著足夠的資訊（每一筆都有 series 與檔名），而且 series 的寫法
   跟 LIB_SUBJ 的 pre 前綴逐字相同（電子學/、工數/、線代/、多益/）——那不是巧合：
   drive-upload.py 的資料夾結構就是照 media/<科目>/<期別> 原樣搬上去的。
   所以這裡把帳本轉成 manifest 形狀，影片庫就活了，點集數也會走
   epClick → drivePlay → 隨播面板 的正常路徑，不再只有 YouTube 一條路。 */

/** 檔名 → 顯示用標題：拔掉開頭的集數代號與副檔名，剩下的就是章節描述。
    例：「115暑電子08 P.56~P.65 Early-Effect.mp4」→「P.56~P.65 Early-Effect」 */
function driveTitleOf(name, code) {
  let t = String(name || '').replace(/\.[^.]+$/, '');
  /* 刻意用字串比對而不是動態 RegExp：代號含 () 之類的正則元字元
     （115春矩陣(喻)10），組 RegExp 得逐一逃脫，一寫錯就是靜靜比不到。 */
  const c = String(code || '');
  if (c && t.slice(0, c.length).toLowerCase() === c.toLowerCase()) t = t.slice(c.length);
  // 檔名版的代號可能帶講師標記（115暑線代(喻)02），跟帳本的乾淨代號對不上，再剝一次
  t = t.replace(/^[0-9]{3}[春暑秋冬題]?[^0-9]*[0-9]{1,2}[A-Za-z]?/, '');
  return t.trim() || c;
}

/** 帳本 → manifest 形狀（{series, code, title, drive, size}）。
    libGroups() 只需要 series 與 code；epRow() 另外會讀 title。
    driveLoad() 是冪等的，重複呼叫不會多打網路。 */
async function driveManifest() {
  if (!CLOUD) return [];
  const d = await driveLoad().catch(() => null);
  const files = d && d.map && d.map.files ? d.map.files : {};
  const out = [];
  for (const [code, f] of Object.entries(files)) {
    if (!f || !f.id || !f.series) continue;      // 缺 series 的舊帳本筆位：歸不了類，跳過
    /* 側車檔（.vtt / .notes.json / .snap_*.jpg）不是集數，不能進影片清單。
       2026-09-04 事故：側車檔上雲之後，帳本從 77 筆變成 442 筆，而這裡照單全收，
       於是「接著看」冒出 `115暑電子08.notes.json`、`…snap_1200.jpg` 這種東西，
       未看集數從 18 暴增成 85。帳本是「檔案對照表」，不是「集數表」——
       兩者在加入側車檔的那一刻就分家了，這裡必須自己把界線畫回來。 */
    if (/\.(vtt|json|jpe?g|mp4)$/i.test(code)) continue;   // .frag.mp4 也是側車檔，不是集數
    out.push({
      // 帳本是 Windows 那側寫的，路徑分隔可能是反斜線；split/join 免掉逃脫字元
      series: String(f.series).split(String.fromCharCode(92)).join('/'),
      code,
      title: driveTitleOf(f.name, code),
      drive: f.id,
      size: Number(f.size) || 0,
    });
  }
  return out;
}
