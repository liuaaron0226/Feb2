/* ============ 讀書模式：進度追蹤器 ============ */
/* 舊進度追蹤器（feb-tracker-v1）已於 2026-08-16 移除：
   逐堂打勾的單位不對（該問的是「這章會不會寫題」），且其課程清單與 iStudy 實際集數不符。
   取而代之＝衝刺看板（章節×考古題）＋影片庫（依學科分類的全部影片）。 */
const SUBJECT_ORDER=['多益','工數','線性代數','自動控制','電子學'];

/* 種子課程：截圖擷取＝待看；被切掉者＝已看、不列入。base=起始堂號 */

/* ---------- 日期工具（本地時區） ---------- */
function todayStr(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function parseD(s){const[y,m,dd]=s.split('-').map(Number);return new Date(y,m-1,dd);}
function dayDiff(a,b){return Math.round((parseD(a)-parseD(b))/864e5);}
function weekRange(s){const d=parseD(s),wd=(d.getDay()+6)%7;const mon=new Date(d);mon.setDate(d.getDate()-wd);
  const sun=new Date(mon);sun.setDate(mon.getDate()+6);return{mon:todayStr(mon),sun:todayStr(sun),idx:wd+1};}

/* ---------- 狀態 ---------- */
/* ---------- 本機離線影片：F:\istudy-backup 經 media/ 連結對外供應 ---------- */
/* 集數代號規範化：去掉講師標記 (喻)(劉)，並拔掉補習班在最後一集加的
   「-The End」尾綴——videos.json 寫的是 115春矩陣10，實際檔名卻是
   115春矩陣10-The End，不拔掉就會誤判成「未下載」。 */
const spNorm = c => (c || '').replace(/\([^)]*\)/g, '')
  .replace(/[-\s]*The\s*End\s*$/i, '').trim();
// 媒體來源優先序：8795 媒體伺服器（支援 Range，可拖曳快轉）→ 退回 media/ 連結（不能跳轉）
/* 由媒體伺服器自己供應網站時（手機／平板走區網進來就是這條），影片與網站同源，
   用相對路徑即可——不必知道電腦的 IP，也不會有跨來源問題。 */
/* 影片伺服器同時開 8795（http，電腦自己用）與 8796（https，iPad 用）。
   原本寫死 8795，於是從 https://…:8796 開站時會判成「不同源」，
   退回 http://localhost:8795/——對 iPad 是錯的主機，而且 https 頁面
   抓 http 資源會被瀏覽器當混合內容直接擋掉，整個站等於全空。
   8797/8798 是開發用第二實例（ADR-0005：start_feb_dev.bat，不碰服役中的
   8795/8796）——不列進來的話同一個坑在真機煙霧測試（T03b）會原樣重演。 */
const SAME_ORIGIN_MEDIA = ['8795', '8796', '8797', '8798'].includes(location.port);
/* ============ FEB_MODE：同一份程式碼，三種執行環境 ============
   上一行的同源判定本來問的就是「這一頁是不是媒體伺服器自己發的」。
   Phase C 之後同一份 site/ 會從兩個地方被送出來而且**不分家**，所以把它擴成三態：

     local  ─ 家用媒體伺服器供應（8795/8796 正式、8797/8798 開發第二實例）。
              影片、/sync、../data/* 都在同一台機器上，行為與 Phase C 之前逐位元組相同。
     cloud  ─ Cloudflare Pages 供應（*.pages.dev）。資料走 /data/**（隨部署上傳的
              靜態資產）、進度走 /api/progress。兩者前面都站著同一道驗 Access 簽章的
              _middleware——Phase E 起它守的是**整個站**，靜態資產也不例外。
              **影片不上雲**（86GB，而且那是補習班教材）：播放器誠實退化成隨播面板。
     static ─ 其餘一切：8643 開發靜態站台、file://、wrangler pages dev 的 localhost。
              維持既有行為——不自動同步（00-config.js 那場事故），資料讀 ../data/*。

   判定順序是刻意的：同源媒體**優先於**主機名，因為前者是證據（這一頁真的是它發的），
   主機名只是像。wrangler pages dev 跑在 localhost 上會落進 static——本機模擬的雲端
   不該自作主張去寫任何進度，要測就用下面的覆寫旗標明講一聲。

   覆寫（只給驗證用）：網址加 ?febmode=cloud|local|static，或在載入本檔前設
   window.FEB_MODE_FORCE。這不是安全邊界也不可能是——伺服器端的身分與權限判定
   一個位元組都不看客戶端說自己是什麼模式（functions/_middleware.js）。 */
const FEB_MODE = (() => {
  let q = null;
  try { q = new URLSearchParams(location.search).get('febmode'); } catch (e) {}
  const forced = String(q || window.FEB_MODE_FORCE || '').toLowerCase();
  if (forced === 'local' || forced === 'cloud' || forced === 'static') return forced;
  if (SAME_ORIGIN_MEDIA) return 'local';
  if (/(^|\.)pages\.dev$/i.test(location.hostname)) return 'cloud';
  return 'static';
})();
const CLOUD = FEB_MODE === 'cloud';
/* 資料檔的唯一入口。呼叫端一律給「相對 data/ 的路徑」（'schools.json'、
   'exams/ncku/工科-工程數學/106.pdf'），前面不自己拼 ../data/ 也不拼 /data/。
   一個 helper 而不是散落各處的三元式：路徑規則只有一份，就只會錯一次。

   Phase E 之前雲端這條是 /api/data/**（R2 的出口）。R2 移除之後教材就是部署裡的
   靜態資產，路徑退回最單純的 /data/**——少一支 Function、少一份白名單要跟這裡對齊。
   「哪些檔案存在」不再靠執行期字串比對，而是靠 scripts/cloud/build-dist.mjs
   決定哪些檔案上得了部署：不在 dist/ 裡的東西，任何路徑都拿不到。 */
const dataURL = p => (CLOUD ? '/data/' : '../data/') + String(p).replace(/^\/+/, '');
const MEDIA_SRV = SAME_ORIGIN_MEDIA ? '/' : 'http://localhost:8795/';
let MEDIA_BASE = '../media/', MEDIA_SEEKABLE = false;
/* 退化狀態要外顯，而且要能自己爬回來。

   踩過的坑：loadLocal() 全站只有 load() 裡呼叫一次，失敗就永久落在 ../media/。
   而 ../media/ 這條退路在兩個 origin 上各壞一種——
     · 從 8642 開站：/media/ 是通的，但 python -m http.server 不支援 Range，
       實測回 200 ＋ Content-Length 513245037（整支 489MB），於是不能拖曳快轉、
       每次播放都得從頭下載，播放全程卡頓；
     · 從 8795 開站：'../media/' 解析成 /media/ → 404，LOCAL 被清空，
       整個看板變「全部未下載」。
   媒體伺服器是開機自啟的，只要在它就緒前開站就會中獎，重整一次又好了——
   這就是「又開始卡卡的」那個間歇症狀的來源。修法有兩層：
     ① 伺服器回來就自動切回可拖曳的來源（下面的 mediaWatch）
     ② 退化期間講清楚，不要只在分頁裡藏一行小字 */
const MEDIA_UI = {st:'ok', txt:''};
let MEDIA_WATCH = null;
function mediaSet(st,txt){
  MEDIA_UI.st = st; MEDIA_UI.txt = txt;
  const b = document.getElementById('mediaBtn');
  if(!b) return;                        // 還沒進讀書模式，重繪時會用上（同 offSet 的作法）
  b.hidden = !txt; b.dataset.st = st; b.textContent = txt;
}
/* 退化後每 4 秒探一次；一通就重載並重繪，使用者不必知道發生過什麼 */
function mediaWatch(){
  if(MEDIA_WATCH) return;
  MEDIA_WATCH = setInterval(async ()=>{
    try{
      const r = await fetch(MEDIA_SRV+'state.json',{cache:'no-store'});
      if(!r.ok) return;
    }catch(e){ return; }
    clearInterval(MEDIA_WATCH); MEDIA_WATCH = null;
    await loadLocal();
    if(!MEDIA_SEEKABLE) return;         // 還是沒真的好，loadLocal 會再開一次 watch
    try{ await loadManifest(); }catch(e){}
    if(typeof renderStudy === 'function' && document.getElementById('offBtn')) renderStudy();
    toastMsg('媒體伺服器已連上，影片改用可拖曳快轉的來源');
  }, 4000);
}
async function loadLocal(){
  /* 雲端模式：影片不在這裡，而且**探不到也不該一直探**。
     兩條退路在 pages.dev 上都必死：http://localhost:8795 是混合內容、瀏覽器直接擋；
     ../media/ 在雲端根本不存在。照原路走下去會落進 down 分支並開啟 mediaWatch()，
     於是每 4 秒對著注定失敗的網址重試一次，永遠。誠實講一次就好。 */
  if(CLOUD){
    LOCAL = {}; MEDIA_SEEKABLE = false;
    mediaSet('slow','雲端模式・影片在家裡的硬碟');
    return;
  }
  let st = null;
  try{
    // 不用 no-store：離線時要讓 Service Worker 有機會拿快取頂上
    st = await fetch(MEDIA_SRV + 'state.json').then(r=>{if(!r.ok)throw 0;return r.json();});
    MEDIA_BASE = MEDIA_SRV; MEDIA_SEEKABLE = true;
    mediaSet('ok','');
  }catch(e){
    try{
      st = await fetch('../media/state.json', {cache:'no-store'}).then(r=>{if(!r.ok)throw 0;return r.json();});
      MEDIA_BASE = '../media/'; MEDIA_SEEKABLE = false;
      mediaSet('slow','⚠ 影片無法快轉'); mediaWatch();
    }catch(e2){
      LOCAL = {};
      mediaSet('down','⚠ 連不到影片'); mediaWatch();
      return;
    }
  }
  const map = {};
  for(const v of Object.values(st)){
    if(v.status !== 'done' || !v.path) continue;
    const rel = v.path.replace(/^[A-Za-z]:\\istudy-backup\\/, '').replace(/\\/g, '/');
    map[spNorm(v.code)] = {url: MEDIA_BASE + rel.split('/').map(encodeURIComponent).join('/'),
                           min: Math.round((v.sec||0)/60), gb: (v.bytes||0)/2**30};
  }
  LOCAL = map;
}

function initStudy(){
  _febSelfCheck();
  renderStudy();
}

