/* ---------- 讀書模式：主從式（左選、右看），取代原本層層展開的長列 ---------- */
const SP_LS='feb-sprint-v1';
const WM_LS='feb-wm-v1';
const SP_WEEKS=['地基','最大板塊','衝刺主峰','收攏第一輪'];
const SP_STAT={elec:'MOSFET 31%，前 6 章 ≈ 80%',math:'線代 39%＋ODE 38%＋拉氏傅立葉 10% ≈ 87%',
  ctrl:'7 大章均勻分佈，一章不可跳'};
const SUBJ_TAG={elec:'電子',math:'工數',la:'線代',ctrl:'控制'};

/* ---------- 編輯時戳（T20）：讓「取消」也傳得出去 ----------
   舊行為：伺服器 merge_progress 對 done/watched/target 取聯集、miss 取最大值，
   於是刪除永遠傳不出去——取消勾選 → 上傳 → 伺服器把舊值聯集回來 → applyProgress
   寫回 → 重繪把勾勾補回去（使用者 2026-09-01 實遇：約 1 秒後自己勾回去）。

   修法是 per-key last-write-wins：每次 set **與** unset 都記一個 ISO 時戳，
   伺服器比兩側時戳，新的一方決定這個鍵「在不在」（不在＝刪除，聯集不得復活）。

   時戳放哪：獨立的兄弟鍵 feb-edits-v1，不塞進既有鍵。
   feb-watched-v1 是裸 map（代號→日期）、feb-target-v1 是裸陣列，兩者都被既有
   讀者整包列舉（watchMap() 取 Object.keys 當作看過的代號、TGT=new Set(陣列)），
   多一個 edits 欄位就會變成一筆假資料——連伺服器的聯集也會把它當成真的看過。
   只有 feb-sprint-v1 塞得下，但拆成兩種形狀＝兩套汰除、兩套合併、兩套相容規則。
   一個兄弟鍵＝一種形狀、一處汰除、一條合併規則，且既有鍵的 shape 一位元組不動。

   形狀：{"done:章id":ISO, "watched:代號":ISO, "miss:章id":ISO, "target:系所組":ISO}
   沒有時戳的鍵（舊裝置、或戳過期被汰除）→ 伺服器退回原本的聯集／取大。 */
const ED_LS='feb-edits-v1';
const ED_KEEP_DAYS=90;        // 超過就汰除，否則這張 map 會無限長大
function edLoad(){
  const m=readJSON(ED_LS,{});
  return (m&&typeof m==='object'&&!Array.isArray(m))?m:{};
}
/* 每次寫入順手汰除：過期的戳退回聯集行為，比留著一張爆炸的 map 安全 */
function edPrune(m){
  const cut=new Date(Date.now()-ED_KEEP_DAYS*864e5).toISOString();
  for(const k of Object.keys(m)) if(typeof m[k]!=='string'||m[k]<cut) delete m[k];
  return m;
}
function edStamp(keys){
  if(!keys||!keys.length) return;
  try{
    const m=edPrune(edLoad()), now=new Date().toISOString();
    for(const k of keys) m[k]=now;
    localStorage.setItem(ED_LS,JSON.stringify(m));
  }catch(e){ /* 記時戳失敗絕不能擋住使用者的操作：這個鍵退回舊的聯集行為 */ }
}
/* 兩個 map 的差集（新增、刪除、值變動都算）→ 要蓋戳的鍵名 */
function edDiff(prefix,cur,prev){
  const out=[], a=cur||{}, b=prev||{}, has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  for(const k of new Set([...Object.keys(a),...Object.keys(b)]))
    if(has(a,k)!==has(b,k)||String(a[k])!==String(b[k])) out.push(prefix+':'+k);
  return out;
}

let SP=readJSON(SP_LS,{done:{}});
SP.miss=SP.miss||{};          // 章節 → 累計錯題數（只記數字，不要求打字）
/* 上次落地的 done/miss 快照：spSave() 拿它比出這次改了哪些鍵才好蓋戳。
   在這裡集中比對（而不是散在各個互動點）＝將來新增的變更點自動有戳。 */
let SP_PREV={done:{},miss:{}};
function spSnap(){ SP_PREV={done:{...(SP.done||{})},miss:{...(SP.miss||{})}}; }
spSnap();
const spSave=()=>{
  edStamp([...edDiff('done',SP.done,SP_PREV.done),...edDiff('miss',SP.miss,SP_PREV.miss)]);
  spSnap();
  localStorage.setItem(SP_LS,JSON.stringify(SP));syncSoon();};
const WM=Object.assign({view:'sprint',week:0,sel:null,libSel:null},readJSON(WM_LS,{}));
const wmSave=()=>localStorage.setItem(WM_LS,JSON.stringify({view:WM.view,sel:WM.sel,libSel:WM.libSel}));

/* ---------- 目標校系：只把想考的學校算進熱區 ---------- */
const TGT_LS='feb-target-v1';
/* 系所組 → 該組筆試會用到的分析卷。成大電機乙組(ncku-*)與工科甲組(nckues-*)是不同考卷，
   不能只用學校 id 對應，所以逐組列明。無筆試的組別不貢獻任何考卷。 */
const PROG_ANA={
  'ntu|甲組':['ntu-math','ntu-control'],
  'ust|乙A組':['ust-control','ust-math'],
  'ust|清大丙組':['ust-elec'],
  'ncu|智慧系統組':['ncu-math','ncu-elec'],
  'nthu-pme|乙組':['nthupme-control'],
  'nsysu|乙組':['nsysu-math','nsysu-control'],
  'ntust|自控所':['ntust-math'],
  'ncku|電機乙組':['ncku-math','ncku-control'],
  'ncku|工科甲組':['nckues-math','nckues-la','nckues-control','nckues-sig','nckues-circ'],
  'ntut|丙組':['ntut-math','ntut-control'],
};
const PROG_LABEL={
  'ntu|甲組':'台大 電機所 甲組（自動控制）',
  'ust|乙A組':'陽交 電控所 乙A組（筆試入學）',
  'ust|清大丙組':'清大 電機 丙組（電子學）',
  'ncu|智慧系統組':'中央 電機 智慧系統組',
  'nthu-pme|乙組':'清大 動機 乙組（電機控制）',
  'nsysu|乙組':'中山 電機 乙組（控制組）',
  'ntust|自控所':'台科 自動化及控制所',
  'ncku|電機乙組':'成大 電機 乙組（系統控制）',
  'ncku|工科甲組':'成大 工科 甲組（控制與通訊）',
  'ntut|丙組':'北科 電機 丙組（控制工程）',
};
let TGT=new Set(readJSON(TGT_LS,[]));
/* 上次落地的目標集合快照（T20）：tgtSave() 比出勾掉／取消勾了哪幾組才好蓋戳。
   applyProgress() 從伺服器整包收下 TGT 之後也要跟著對正（tgtSnap()），
   否則下一次存檔會把伺服器給的內容誤判成本機剛做的編輯。 */
let TGT_PREV=new Set(TGT);
function tgtSnap(){ TGT_PREV=new Set(TGT); }
const tgtSave=()=>{
  const ks=[];
  for(const p of new Set([...TGT_PREV,...TGT])) if(TGT.has(p)!==TGT_PREV.has(p)) ks.push('target:'+p);
  edStamp(ks); tgtSnap();
  localStorage.setItem(TGT_LS,JSON.stringify([...TGT]));syncSoon();};

/* ---------- 外接硬碟直讀（iPad／手機用） ----------
   2026-08-23 修正：webkitdirectory 在 iPad 上不能用。它會遞迴列舉整棵目錄樹
   並為每個項目建立 File 物件，681 檔／86 GB 的外接硬碟撐不住，選擇器開著
   56 秒後整個分頁被系統殺掉（遠端 log 的麵包屑停在「開啟檔案選擇器」，
   連 change 事件都沒發生）。改用一般 multiple 選取，只處理實際點選的檔案。

   以下是最初的實測紀錄，保留供對照：<input webkitdirectory> 可以一次選整個資料夾，
   拿得到相對路徑；選到的影片能播、能拖曳快轉。所以不需要原生 App。
   限制：File 物件只在這次頁面存活，重新整理要再選一次（一次點擊，可接受）。
   注意 navigator.storage 在 iOS Safari 不存在，所以不能把影片存進快取，只能現選現播。 */
/* ============ 遠端診斷：iPad 沒有開發者工具，錯誤自己寄回電腦 ============
   白屏是分頁被系統殺掉，當下攔不到任何事件——所以不能只靠 window.onerror。
   改成留麵包屑：做危險動作前先寫進 localStorage，順利走完就清掉；
   下次開站發現那筆還在，就知道上次死在哪一步。 */
const LOG_LS='feb-breadcrumb';
function rlog(tag,data){
  /* /log 是媒體伺服器的端點，雲端那側沒有對應路由（functions/ 只有三支）。
     從 https 的 pages.dev 送 beacon 到 http://localhost:8795 是混合內容，
     一定被擋——安靜地不做，比每次錯誤都再製造一個錯誤好。
     麵包屑（crumb，寫 localStorage）不受影響，照常留著。 */
  if(typeof CLOUD!=='undefined'&&CLOUD) return;
  try{
    const body=JSON.stringify({tag,ver:APP_VER,...data});
    const url=(SAME_ORIGIN_MEDIA?'':MEDIA_SRV.replace(/\/$/,''))+'/log';
    // sendBeacon 在分頁被殺掉時仍有機會送出，一般 fetch 會被中斷
    if(navigator.sendBeacon) navigator.sendBeacon(url,new Blob([body],{type:'text/plain'}));
    else fetch(url,{method:'POST',body,keepalive:true}).catch(()=>{});
  }catch(e){ /* 診斷失敗絕不能影響使用者 */ }
}
function crumb(step,extra){
  try{ localStorage.setItem(LOG_LS,JSON.stringify({step,t:Date.now(),...extra})); }catch(e){}
}
function crumbClear(){ try{ localStorage.removeItem(LOG_LS); }catch(e){} }

addEventListener('error',e=>rlog('js-error',{
  msg:String(e.message||''),src:String(e.filename||'').slice(-60),line:e.lineno}));
addEventListener('unhandledrejection',e=>rlog('promise-reject',{
  msg:String(e.reason&&e.reason.message||e.reason||'').slice(0,200)}));

addEventListener('load',()=>setTimeout(async()=>{
  let last=null;
  try{ last=JSON.parse(localStorage.getItem(LOG_LS)||'null'); }catch(e){}
  // 裝置資訊：判斷是記憶體還是檔案數的問題，這些是關鍵線索
  let quota=null;
  try{ const s=await navigator.storage?.estimate?.(); if(s) quota=Math.round(s.quota/2**20); }catch(e){}
  rlog('boot',{
    上次未完成:last,                       // 有值＝上次白屏死在這一步
    ua:navigator.userAgent.slice(0,110),
    記憶體GB:navigator.deviceMemory??'未提供',
    核心數:navigator.hardwareConcurrency??'未提供',
    可用配額MB:quota??'未提供',
    螢幕:`${innerWidth}x${innerHeight}@${devicePixelRatio}`,
    離線:OFF_UI.txt, 硬碟:DISK_UI.txt,
  });
  if(last) crumbClear();
},2500));

var OFF_UI={st:'',txt:'離線：檢查中…'};   // 離線狀態燈的唯一真相，樣板讀這個
var DISK_UI={st:'',txt:'選影片'};    // 同理：toast 會消失，狀態要留得住
var DISK_DIAG='';                        // 選完的細節，出事時要問得出來
const DISK_LS='feb-disk-last';           // 上次選了哪幾支，下次照著點
const APP_VER='v22';                     // 診斷要看得到跑的是哪一版，否則改了半天不知道裝置上有沒有生效
var OFF_WHY='';                          // 紅燈時點一下要說得出原因

