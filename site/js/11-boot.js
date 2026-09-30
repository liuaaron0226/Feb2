/* ---------- 動畫：主標逐字浮現（每字 120ms） ---------- */
function initHeadingReveal(){
  const h=document.querySelector('.hero h1');
  if(!h||h.dataset.split) return;
  h.dataset.split='1';
  let i=0;
  const wrap=node=>{
    [...node.childNodes].forEach(n=>{
      if(n.nodeType===3){
        const frag=document.createDocumentFragment();
        [...n.textContent].forEach(c=>{
          const s=document.createElement('span');
          s.className='ch'; s.textContent=c;
          s.style.transitionDelay=(i++*120)+'ms';
          frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else if(n.nodeType===1) wrap(n);
    });
  };
  wrap(h);
  requestAnimationFrame(()=>h.querySelectorAll('.ch').forEach(s=>s.classList.add('in')));
}

/* ---------- 動畫：捲動顯示、目錄 spy、山稜視差 ---------- */
function initReveal(){
  const io=new IntersectionObserver(es=>es.forEach(e=>{
    if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}
  }),{threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
}
function initSpy(){
  const links=[...document.querySelectorAll('#menu a.seclink')];
  const secs=links.map(a=>document.querySelector(a.getAttribute('href')));
  const io=new IntersectionObserver(es=>{
    es.forEach(e=>{
      if(e.isIntersecting){
        links.forEach(a=>a.classList.toggle('active', a.getAttribute('href')==='#'+e.target.id));
      }
    });
  },{rootMargin:'-30% 0px -60% 0px'});
  secs.forEach(s=>s&&io.observe(s));
}
function initParallax(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r1=[...document.querySelectorAll('.r1')], r2=[...document.querySelectorAll('.r2')], r3=[...document.querySelectorAll('.r3')];
  let ticking=false;
  addEventListener('scroll',()=>{
    if(ticking) return; ticking=true;
    requestAnimationFrame(()=>{
      const y=scrollY;
      r3.forEach(el=>el.style.transform=`translateY(${y*0.06}px)`);
      r2.forEach(el=>el.style.transform=`translateY(${y*0.03}px)`);
      r1.forEach(el=>el.style.transform=`translateY(${y*0.012}px)`);
      ticking=false;
    });
  },{passive:true});
}
load();

/* ---------- PWA：裝到主畫面、離線可用 ----------
   只在由伺服器供應時註冊；用 file:// 直接開檔案時 Service Worker 不被允許。 */
/* 開站先同步一次：出門前在家開，就會把電腦上的最新進度帶走；
   回家再開，iPad 上的紀錄就回到電腦。連不到就靜靜跳過。 */
/* DEV 模式不自動同步（ADR-0005）：開站 1.5s 與 online 事件都不觸發，syncNow() 仍可手動呼叫 */
/* 開場走 syncBoot()：本機是既有的 POST /sync；雲端先認身分（/api/whoami）再決定
   主人 POST 合併、訪客 GET 讀（且只在這台裝置還沒有進度時才套用）。見 08-sync.js。 */
if(syncAuto() && location.protocol.startsWith('http')) addEventListener('load',()=>setTimeout(()=>syncBoot(),1500));
addEventListener('online',()=>{ if(syncAuto()) syncNow(true); });

/* ---------- T18 開站自動迴流：NotebookLM 筆記（打開／重整就自己更新一次） ----------
   只在「網站是由媒體伺服器供應的」時候打（SAME_ORIGIN_MEDIA＝8795/8796/8797/8798）。
   從 8643 那個 python -m http.server 開站時不打——那邊沒有這個端點，
   打了只會在 console 留一排 404，而且跨來源也拿不到。

   紀律：射後不理。不 await、不擋首屏、失敗全部安靜吞掉。
   時機在「首次繪製之後」（idle callback，逾時 2 秒保底）——筆記是站03 底部的
   東西，一秒都不該跟主畫面搶。
   伺服器端有 6 小時節流（FEB_NBLM_THROTTLE_H），所以一天重整幾十次也只拉一次。 */
function nblmAutoRefresh(){
  fetch('/nblm/refresh',{cache:'no-store'})
    .then(r=>r.ok?r.json():null)
    .then(d=>{
      // 真的去拉了才排一次延遲回讀——這樣同一次開站就吃得到新筆記，
      // 不必再手動重整第二次。被節流擋掉（skipped）就什麼都不做。
      if(d&&d.started) setTimeout(nblmReload,45000);
    })
    .catch(()=>{});                 // 沒有這個端點的舊伺服器：安靜跳過
}
/* 延遲回讀：只重抓「這次開站已經抓過的科目」。還沒進站03 的科目本來就還沒抓，
   之後首抓（nblmEnsure，no-store）自然就是新版，不必在這裡湊熱鬧。
   內容沒變就不重繪——重繪會把站03 的 details 開合、捲動位置洗一次，
   使用者可能正在讀。 */
async function nblmReload(){
  if(typeof NBLM!=='object'||!NBLM) return;
  const ids=Object.keys(NBLM);
  if(!ids.length) return;
  let changed=false;
  await Promise.all(ids.map(async id=>{
    try{
      const r=await fetch(dataURL(`nblm/${id}.json`),{cache:'no-store'});
      if(!r.ok) return;
      const d=await r.json();
      if(!(d&&Array.isArray(d.notes)&&d.notes.length)) return;
      const next={state:'ok',pulled:String(d.pulled||''),notes:d.notes};
      if(JSON.stringify(NBLM[id])===JSON.stringify(next)) return;
      NBLM[id]=next; changed=true;
    }catch(e){ /* 拉到一半、檔案暫時不完整：這次跳過，下次開站再說 */ }
  }));
  if(changed&&typeof renderStudy==='function'&&document.getElementById('stn3'))
    renderStudy();                  // 站03 正在畫面上才重繪（既有 lazy 模式同款）
}
if(SAME_ORIGIN_MEDIA && location.protocol.startsWith('http'))
  addEventListener('load',()=>{
    if('requestIdleCallback' in window) requestIdleCallback(nblmAutoRefresh,{timeout:2000});
    else setTimeout(nblmAutoRefresh,2000);
  });
/* 觸控裝置的彈窗捲動鎖（2026-09-13，iPad 回報「會莫名滑動到背景」）。
   iOS Safari 不理會 body{overflow:hidden} 的觸控捲動，app.css 在觸控裝置改用
   body.modal-open{position:fixed}——但那會把頁面彈回頂端。這裡在 modal-open 加上時
   記住捲動位置、用 top 負值把畫面停在原地，關掉時再捲回去。
   用 MutationObserver 看 class，就不必去改四個開／關彈窗的地方。 */
if(typeof MutationObserver==='function' && matchMedia('(hover:none) and (pointer:coarse)').matches){
  /* 捲動位置要在 class 加上**之前**就記好：observer 是 microtask，等它跑到時
     只要有人先讀過版面（getBoundingClientRect 之類），position:fixed 已生效、scrollY 已歸零。
     所以平時就用 scroll 事件持續記，鎖的時候直接拿。 */
  let lastY=window.scrollY||0, lockY=0;
  addEventListener('scroll',()=>{ if(!document.body.classList.contains('modal-open')) lastY=window.scrollY||0; },{passive:true});
  new MutationObserver(()=>{
    const on=document.body.classList.contains('modal-open');
    if(on && document.body.style.top===''){ lockY=lastY; document.body.style.top=(-lockY)+'px'; }
    else if(!on && document.body.style.top!==''){ document.body.style.top=''; window.scrollTo(0,lockY); lastY=lockY; }
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
}
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  /* 註冊之後**主動要一次更新**，並在新 SW 接管時重載一次。

     為什麼（2026-09-03→04 事故）：改了 JS/CSS 卻沒讓 sw.js 位元組變動，
     瀏覽器就不認為有新 SW，使用者裝置卡在舊殼層——症狀是「畫面靜靜地不更新」：
     標題是舊的、排版是舊的、影片庫是舊版，而且舊 index.html 沒有載入
     14-drive.js，雲端播放整個功能都不存在。使用者被迫手動清快取，
     而那是**我們的紀律問題，不該由他承擔**。
     sw.js 的快取名現在跟殼層內容雜湊綁定（build-dist.mjs 戳的），
     這裡再補一次 update()：進站就對照一次伺服器上的 sw.js。

     reloaded 旗標用 sessionStorage：controllerchange 每次換手都會觸發，
     沒有這道閘就會重載→接管→重載，無限迴圈。一次工作階段只自動重載一次。 */
  addEventListener('load',()=>navigator.serviceWorker.register('sw.js')
    .then(reg=>{
      reg.update().catch(()=>{});          // 射後不理：離線時失敗是正常的
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        let once=false;
        try{ once=sessionStorage.getItem('feb-sw-reloaded')==='1'; }catch(e){}
        if(once) return;
        try{ sessionStorage.setItem('feb-sw-reloaded','1'); }catch(e){}
        location.reload();
      });
    })
    .catch(e=>console.warn('SW 註冊失敗',e)));
  navigator.serviceWorker.addEventListener('message',async ev=>{
    const d=ev.data||{};
    if(d.type==='audit-done'){
      const sw=await swReady(6000);
      if(!sw?.active){ offBusy=false; return; }
      if(!d.missing.length){                       // 已經齊了，什麼都不用做
        offBusy=false;
        offSet('ready',`離線就緒 ${d.have}`);
        if(OFF_MANUAL) toastMsg(`離線就緒，${d.have} 個檔案都在這台裝置上`);
        return;
      }
      // 連不到電腦就補不了——人多半已經在外面，別假裝在做事
      // 探測要用「一定在電腦上」的檔案。原本用 state.json——但那個檔在
      // 外接硬碟上，硬碟拔去接 iPad 之後回 404，於是判定成「連不到電腦」，
      // 明明連得上卻永遠不補檔，狀態燈就一直卡在「離線缺 N」。
      const live=await fetch(dataURL('videos.json'),{method:'HEAD',cache:'no-store'})
        .then(r=>r.ok).catch(()=>false);
      if(!live){
        offBusy=false;
        offSet('gap',`離線缺 ${d.missing.length}`);
        OFF_WHY=`[${APP_VER}] 連不到電腦（缺 ${d.missing.length} 個檔）。`
        +'回家連上熱點打開 App 就會自動補齊。';
      if(OFF_MANUAL) toastMsg(OFF_WHY);
        return;
      }
      offSet('work',`補檔 0/${d.missing.length}`);
      sw.active.postMessage({type:'prefetch',urls:d.missing,silent:!OFF_MANUAL});
      return;
    }
    if(d.type==='prefetch-progress'){
      offSet('work',`補檔 ${d.n}/${d.total}`);
      return;
    }
    if(d.type==='prefetch-done'){
      offBusy=false;
      // 顏色要看「缺不缺」，不是看「這次抓了幾個」。
      // 全部早就在快取裡時 ok 會是 0，但那是最好的狀態，不該亮紅燈。
      // 缺的多半是還沒產生思考地圖、或檔案在拔掉的硬碟上，不算壞掉，
      // 所以用黃燈而不是紅燈。
      offSet(d.missing?'work':'ready',
        d.missing?`離線就緒 ${OFF_TOTAL-d.missing}・缺 ${d.missing}`
                 :`離線就緒 ${OFF_TOTAL}`);
      if(!d.silent)
        toastMsg(`離線已備妥 ${d.ok} 個檔案`+
          (d.missing?`（另有 ${d.missing} 支還沒產生字幕／筆記）`:''));
    }
  });
  // 開站就自己盤點、缺什麼補什麼。放在同步之後，避免兩件事搶頻寬。
  addEventListener('load',()=>setTimeout(()=>{probeSrv();offlineAutoTopUp(false);},4000));
  /* Drive 直連（L3）：把帳本推給 Service Worker，並在「這台裝置以前連過」時
     安靜地續一張權杖。時機在 SW 接管之後——第一次造訪時 controller 還是 null，
     那一輪功能就是關的，重新整理一次才會亮起來（誠實的退化，不是 bug）。 */
  navigator.serviceWorker.ready.then(()=>setTimeout(()=>{ driveBoot?.().catch(()=>{}); },1200))
    .catch(()=>{});
}
function toastMsg(s){
  let t=document.getElementById('toast');
  if(!t){ t=document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
  t.textContent=s; t.classList.add('on');
  clearTimeout(toastMsg._h); toastMsg._h=setTimeout(()=>t.classList.remove('on'),2600);
}
/* 出門前按一下：把思考地圖、字幕、板書快照、資料檔全抓進快取（不含影片） */
/* KaTeX 的字型是 CSS 裡的 @font-face，只有真的排到那個字才會去抓。
   殼層策略是快取優先，所以線上看過的會留下——但沒看過的章節在咖啡廳就會
   變成豆腐字。公式是這個站的主體，不能碰運氣，出門前一律先抓齊。 */
const KATEX_FONTS=['AMS-Regular','Caligraphic-Bold','Caligraphic-Regular',
  'Fraktur-Bold','Fraktur-Regular','Main-Bold','Main-BoldItalic','Main-Italic',
  'Main-Regular','Math-BoldItalic','Math-Italic','SansSerif-Bold',
  'SansSerif-Italic','SansSerif-Regular','Script-Regular','Size1-Regular',
  'Size2-Regular','Size3-Regular','Size4-Regular','Typewriter-Regular']
  .map(n=>`./vendor/fonts/KaTeX_${n}.woff2`);

/* serviceWorker.ready 沒註冊成功時不會 resolve 也不會 reject——是永遠掛著。
   一定要自己加逾時，否則整條流程默默停住，狀態燈永遠是「檢查中…」。 */
const swReady=ms=>Promise.race([
  navigator.serviceWorker?.ready ?? Promise.resolve(null),
  new Promise(r=>setTimeout(()=>r(null),ms)),
]).catch(()=>null);

/* 狀態燈：ready=可以帶出門｜work=正在補｜gap=還缺東西 */
function offSet(st,txt){
  // 一定要存進變數：按鈕在 renderStudy() 的樣板裡，重繪就會被打回初始字樣，
  // 而 renderStudy() 一次操作可能被呼叫好幾次。只寫 DOM 等於白寫。
  OFF_UI.st=st; OFF_UI.txt=txt;
  const b=document.getElementById('offBtn');
  if(!b) return;                       // 還沒進讀書模式，變數留著，重繪時會用上
  b.dataset.st=st; b.textContent=txt;
}

/* 連得到電腦就自動補齊，不必人工按。
   只補快取裡缺的，所以第二次之後幾乎是瞬間完成；
   連不到電腦（人已經在外面）就什麼都不做，安靜地用既有快取。 */
let offBusy=false;
async function offlineAutoTopUp(manual){
  if(offBusy) return;
  const sw=await swReady(6000);
  if(!sw?.active){
    // 「未就緒」三個字不夠——三種原因的處置方式完全不同，直接說是哪一種
    // 順序很重要：http:// 配區網 IP 不算「安全內容」，瀏覽器會直接不提供
    // navigator.serviceWorker。先問 'serviceWorker' in navigator 的話，
    // 這種情況會被誤報成「瀏覽器不支援」——其實 Safari 支援得很好，是協定不對。
    const why = !window.isSecureContext
        ? ['離線：要用 https','http 配區網 IP 不算安全連線，瀏覽器不給離線功能。請改開 https:// 那個網址（需先在 iPad 安裝一次憑證）。']
      : !('serviceWorker' in navigator)
        ? ['離線：瀏覽器不支援','這個瀏覽器沒有離線功能。iPad 請用 Safari 開，再「加入主畫面」。']
        : ['離線：未安裝','離線元件還沒裝好。把 App 完全關掉再開一次；還是不行就是 Safari 擋掉了。'];
    offSet('gap',why[0]);
    OFF_WHY=`[${APP_VER}] `+why[1];   // 一律帶版本，才確認得了裝置上跑的是新版
    if(manual) toastMsg(why[1]);
    return;
  }
  OFF_WHY='';
  offSet('work','離線：盤點中');
  let urls;
  try{ urls=await buildOfflineList(); }
  catch(e){
    offSet('gap','離線：連不到電腦');
    OFF_WHY=`[${APP_VER}] 拿不到教材清單，多半是電腦沒開或不在同一個熱點。回家連上就會自動補。`;
    if(manual) toastMsg(OFF_WHY);
    return;
  }
  offBusy=true;
  OFF_TOTAL=urls.length;
  sw.active.postMessage({type:'audit',urls});
  OFF_MANUAL=!!manual;
}
let OFF_TOTAL=0, OFF_MANUAL=false;

async function prefetchOffline(){ return offlineAutoTopUp(true); }

const mediaURL=rel=>MEDIA_BASE+rel.split('/').map(encodeURIComponent).join('/');

async function buildOfflineList(){
  /* 教材清單本身不分模式，只有前綴換人（dataURL）：本機 ../data/*，雲端 /data/*。
     影片相關的三個端點（state/search_index/offline-manifest）住在媒體伺服器身上，
     雲端拿不到也不該列——列進去只會讓「離線缺 N」永遠掛著一個補不完的數字。 */
  /* drive-map.json／drive-client.json 也進離線清單：兩份都只有幾 KB，
     但少了它們，離線開站時「這一集在雲端硬碟上有沒有」會答不出來，
     隨播面板就退回成一句 VLC 文案。
     **影片本身永遠不在這份清單裡**——它連快取都不該碰（sw.js 開頭那條鐵則），
     Drive 的虛擬路徑 /drive/<id> 也一樣，走的是不留任何 byte 的直通。 */
  const urls=new Set(['./index.html',
                      dataURL('sprint.json'), dataURL('videos.json'),
                      dataURL('schools.json'), dataURL('exam-index.json'),
                      dataURL('analysis/index.json'),
                      dataURL('drive-map.json'), dataURL('drive-client.json'),
                      ...(CLOUD?[]:[
                        MEDIA_SRV+'state.json',          // 沒有它離線就看不到影片清單
                        MEDIA_SRV+'search_index.json',   // 逐字稿全文搜尋
                      ]),
                      ...KATEX_FONTS]);
  // 各校考古題分析：index.json 只是目錄，21 份內容檔要各自抓
  try{
    const idx=await (await fetch(dataURL('analysis/index.json'))).json();
    for(const a of idx) if(a.file) urls.add(dataURL('analysis/'+a.file));
  }catch(e){ /* 抓不到就算了，離線時退回沒有分析頁 */ }

  // T17 筆記迴流：五科 NotebookLM 筆記快照（nblm_pull.py 落地）。
  // 清單是客戶端拼的，名單就在 NOTEBOOKS——某科檔案還沒拉過就算 missing（黃燈），不是錯誤
  for(const k of Object.keys(NOTEBOOKS?.subjects||{}))
    urls.add(dataURL(`nblm/${k}.json`));

  // 思考地圖／字幕／板書快照的清單一次跟伺服器要。
  // 板書快照的檔名藏在各支 notes.json 的 snaps 陣列裡，
  // 網站自己找就得抓 101 份檔案、101 個來回，iPad 會卡在「檢查中…」很久；
  // 伺服器就在檔案旁邊，走一次目錄 34ms 就回完。
  let manifest=null;
  if(CLOUD) return [...urls];        // 雲端到此為止：影片與它的旁掛檔案都不在這裡
  try{
    manifest=await (await fetch(MEDIA_SRV+'offline-manifest.json',
                                {cache:'no-store'})).json();
  }catch(e){ /* 舊版伺服器沒這個端點，下面退回自己拼 */ }

  // root_ok=false 代表外接硬碟不在電腦上（多半是被拔去接 iPad 了）。
  // 這時清單是空的，若照單全收會變成「都備妥了」的假象，把既有快取的
  // 就緒數字洗成一個很小的值。當作拿不到清單處理，維持原狀比較安全。
  if(manifest && manifest.root_ok===false){
    OFF_WHY=`[${APP_VER}] 電腦上讀不到外接硬碟（是不是拔去接 iPad 了？），這次不更新離線清單。`;
    manifest=null;
  }
  if(manifest){
    for(const k of ['notes','vtt','snaps'])
      for(const rel of (manifest[k]||[])) urls.add(mediaURL(rel));
  }else{
    for(const code of Object.keys(LOCAL)){
      const u=LOCAL[code].url;
      urls.add(u.replace(/\.mp4($|\?)/i,'.notes.json$1'));
      urls.add(u.replace(/\.mp4($|\?)/i,'.vtt$1'));
    }
  }

  return [...urls];
}
