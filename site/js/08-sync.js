/* ---------- 跨裝置進度同步 ----------
   情境：電腦放在沒有網路的家裡，資料都在它身上；iPad 帶出門用。
   兩邊各自的 localStorage 不會互通，在 iPad 上勾的完成、記的錯題回不到電腦。
   解法：只要能連到電腦（家裡開手機熱點時就能），就雙向合併一次；
   連不到就安靜略過，離線照常運作，下次連上再補。 */
/* 進度端點隨模式改變，形狀不變：
     local/static ─ 媒體伺服器的 /sync（POST 上傳整份、伺服器合併、回合併結果）
     cloud        ─ Pages 的 /api/progress（POST 同一份 payload、同一套合併語意；
                    functions/_lib/merge.mjs 是 serve_media.py merge_progress() 的逐行移植，
                    tests/cloud-merge.test.js 用 Python 跑出來的黃金檔證明兩邊逐位元組相同）
   所以底下 localProgress()／applyProgress() 一個位元組都不必動——這正是移植逐行而不是
   等價重寫的理由：切換期間兩邊會同時存在，對同一組 payload 必須給同一個答案。 */
const SYNC_URL=CLOUD?'/api/progress':(SAME_ORIGIN_MEDIA?'':MEDIA_SRV.replace(/\/$/,''))+'/sync';
let syncTimer=null, syncing=false;
/* ---- 唯讀裝置（T12，ADR-0007）----
   伺服器對本裝置的 POST /sync 回 403＝這是訪客裝置：安靜停止自動同步
   （本機 localStorage 照常記錄，只是不回寫伺服器），並在 wm-more 狀態
   選單掛一條狀態列。選單由 renderStudy() 整段重建，badge 用「包一層、
   重繪後補掛」的方式注入——T12 檔案邊界：不動 09-render-study.js。 */
window.SYNC_READONLY=false;
/* 雲端模式的身分：/api/whoami 回的 role（'owner'｜'guest'）。
   null＝還沒問到，或本機模式（那邊的身分模型是「裝置」不是「人」，見 ADR-0007）。
   驗過 Access 簽章的是伺服器，這裡拿到的只是「拿來顯示」的結論——
   客戶端說自己是誰對 functions/ 那一側毫無作用（_middleware.js 不看任何客戶端宣稱）。 */
window.SYNC_ROLE=null;
/* 狀態選單的身分列。T12 的檔案邊界照舊：不動 09-render-study.js，
   選單由 renderStudy() 整段重建，所以用「包一層、重繪後補掛」注入。
   一列而不是兩列：唯讀是身分的結果，不是另一件事。 */
function markReadonlyUI(){
  const pop=document.querySelector('#wmMore .wm-more-pop');
  if(!pop) return;
  const ro=window.SYNC_READONLY, role=window.SYNC_ROLE;
  if(!ro&&role!=='owner') return;                 // 沒有話要說就不佔一列
  let d=pop.querySelector('#wmReadonly');
  if(!d){
    d=document.createElement('div');
    d.id='wmReadonly'; d.className='wm-more-item mono'; d.setAttribute('role','status');
    d.style.cursor='default';
    pop.prepend(d);
  }
  /* 狀態不 color-alone：glyph＋字，顏色只是加強 */
  const txt = ro
    ? (role==='guest'?'! 訪客身分・唯讀——變更只留在這台裝置'
                     :'! 唯讀裝置——變更不回寫伺服器')
    : (CLOUD?'☁ 雲端・主人身分（可寫入）':'✓ 主人身分（可寫入）');
  d.style.color=ro?'var(--status-warn)':'var(--status-good)';
  d.textContent=txt;
}
/* 重繪後把身分列補回去。只包一次。 */
function hookRoleUI(){
  if(typeof renderStudy!=='function'||renderStudy.__ro) return;
  const orig=renderStudy;
  window.renderStudy=function(...a){const r=orig.apply(this,a);markReadonlyUI();return r;};
  window.renderStudy.__ro=true;
}
/* 唯讀的兩句話：本機模式是「這台裝置」，雲端模式是「這個身分」。混著講會讓人
   在雲端跑去媒體伺服器的 /admin 找一個不存在的裝置。 */
const roMsg=()=>CLOUD?'訪客身分——變更只留在這台裝置，不會寫回雲端'
                    :'此裝置為唯讀——變更只留在本機，不會寫回伺服器';
function enterReadonly(){
  if(window.SYNC_READONLY) return;
  window.SYNC_READONLY=true;
  if(CLOUD&&!window.SYNC_ROLE) window.SYNC_ROLE='guest';   // 403＝登入的不是 FEB_OWNER
  clearTimeout(syncTimer);
  console.info('[sync] 伺服器回 403：此裝置唯讀，自動同步已停止。'+
    (CLOUD?'雲端模式＝登入的不是 FEB_OWNER（訪客讀主人的看板，但寫不回去）'
          :'在家用電腦（localhost）開媒體伺服器的 /admin 可為此裝置取名、升級 trusted 或踢除'));
  hookRoleUI();
  markReadonlyUI();
}
function localProgress(){
  /* review（T07）：鍵名寫死字串——12-review.js 載入順序在本檔之後，
     這裡不能引用它的常數；shape 原封上送，合併住在伺服器端（ADR-0004） */
  /* edits（T20）：per-key 編輯時戳，讓刪除傳得出去。伺服器沒有這個鍵時整段被
     忽略、行為與加它之前完全相同（與 review 同一條相容鐵則）。 */
  return {watched:readJSON(WATCH_LS,{}), done:SP.done||{}, miss:SP.miss||{},
          playpos:readJSON(PL_LS,{}), target:[...TGT],
          review:readJSON('feb-review-v1',{cards:[]}),
          edits:edLoad(),
          updated:new Date().toISOString()};
}
function applyProgress(p){
  if(!p||typeof p!=='object') return false;
  let changed=false;
  const put=(k,v)=>{const s=JSON.stringify(v);
    if(localStorage.getItem(k)!==s){localStorage.setItem(k,s);changed=true;}};
  if(p.watched) put(WATCH_LS,p.watched);
  if(p.playpos) put(PL_LS,p.playpos);
  if(p.done||p.miss){
    SP.done=p.done||SP.done; SP.miss=p.miss||SP.miss;
    put(SP_LS,SP);
    spSnap();                    // T20：伺服器給的內容不是本機編輯，別讓下次存檔誤蓋戳
  }
  if(Array.isArray(p.target)){ TGT=new Set(p.target); put(TGT_LS,p.target); tgtSnap(); }
  /* edits（T20）：收下伺服器合併後的時戳表。不整包覆蓋而是逐鍵取較新的一方——
     往返這 3 秒內使用者可能又動了一下，那筆本機新戳不能被回包洗掉。
     舊伺服器沒有 edits 鍵時整段跳過（向後相容）。 */
  if(p.edits&&typeof p.edits==='object'&&!Array.isArray(p.edits)){
    const loc=edLoad(), m=Object.assign({},p.edits);
    for(const k of Object.keys(loc)) if(!(k in m)||String(loc[k])>String(m[k])) m[k]=loc[k];
    put(ED_LS,m);
  }
  /* review：整包收下（合併已在伺服器端完成）；12-review 讀穿 localStorage，
     不存記憶體副本，寫回鍵就是唯一要做的事。舊伺服器回包沒有 review 鍵
     時整段跳過——向後相容 */
  if(p.review&&Array.isArray(p.review.cards)) put('feb-review-v1',p.review);
  return changed;
}
async function syncNow(quiet=true){
  if(syncing) return;
  if(window.SYNC_READONLY){
    if(!quiet) toastMsg(roMsg());
    return false;
  }
  syncing=true;
  try{
    const r=await fetch(SYNC_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(localProgress())});
    if(r.status===403){
      enterReadonly();
      if(!quiet) toastMsg(roMsg());
      return false;
    }
    if(!r.ok) throw new Error('HTTP '+r.status);
    const merged=await r.json();
    if(merged.error) throw new Error(merged.error);
    const changed=applyProgress(merged);
    if(changed){
      renderStudy();
      /* 今日複習條不在 renderStudy 的重建區（#rvSlot 獨立），要自己補繪 */
      if(typeof renderReview==='function') renderReview();
    }
    if(!quiet) toastMsg(changed?'進度已同步（有更新）':'進度已同步');
    return true;
  }catch(e){
    if(!quiet) toastMsg(CLOUD?'連不到雲端——離線紀錄照常保留，連上網路會自動同步'
                              :'連不到電腦——離線紀錄照常保留，回家連上熱點會自動同步');
    return false;
  }finally{ syncing=false; }
}
/* ---------- 開站第一次同步 ----------
   兩個模式問同一件事，走的路不同：

   local  ─ POST /sync（合併），既有行為一位元組不動。
   cloud  ─ 先 GET /api/whoami 認身分，再依身分決定：
            · owner → 走 syncNow()＝POST /api/progress（合併）。
            · guest → GET /api/progress 讀主人的看板。

   為什麼主人不是用 GET 開場（雖然 GET 便宜一半）：
   GET 回的是伺服器那份原封的文件，而 applyProgress() 是**整包覆蓋**
   （put(WATCH_LS, p.watched) 直接換掉整張表）。這台裝置離線期間記的東西
   還沒上去，先 GET 就當場被洗掉。POST 才是合併，兩邊都留得住。
   訪客反過來——他本來就不寫回去，所以 GET 是他唯一讀得到東西的路。

   訪客那條再加一道：**只有這台裝置還沒有任何進度時才套用**。
   否則每次開站都用主人的看板洗掉訪客自己在本機記的東西，
   而 functions/README.md 講好的是「訪客的進度留在他自己裝置的 localStorage」。
   說到就要做到，不然那句話下次就沒人信。 */
function progressEmpty(){
  try{
    return !Object.keys(readJSON(WATCH_LS,{})).length
        && !Object.keys((typeof SP==='object'&&SP&&SP.done)||{}).length
        && !(typeof TGT!=='undefined'&&TGT.size)
        && !((readJSON('feb-review-v1',{cards:[]}).cards||[]).length);
  }catch(e){ return false; }          // 判不出來就當「有東西」，寧可少讀不可誤刪
}
/* 唯讀身分的讀取路徑：GET /api/progress，伺服器端不合併（契約見 functions/README.md §2）。 */
async function syncPull(){
  try{
    const r=await fetch(SYNC_URL,{cache:'no-store'});
    if(!r.ok) return false;
    const doc=await r.json();
    if(!doc||doc.error) return false;
    if(applyProgress(doc)){
      if(typeof renderStudy==='function') renderStudy();
      if(typeof renderReview==='function') renderReview();
    }
    return true;
  }catch(e){ return false; }
}
async function syncBoot(){
  if(!syncAuto()) return false;
  if(!CLOUD) return syncNow(true);
  let role=null;
  try{
    const r=await fetch('/api/whoami',{cache:'no-store'});
    if(r.ok){ const w=await r.json(); role=(w&&w.role)||null; }
  }catch(e){ /* 問不到身分不是錯：下面照走，POST 真的被 403 一樣進得了唯讀 */ }
  window.SYNC_ROLE=role;
  hookRoleUI(); markReadonlyUI();
  if(role&&role!=='owner'){
    enterReadonly();
    return progressEmpty() ? syncPull() : false;
  }
  return syncNow(true);
}
/* 有異動就排一次；集中成 3 秒一次，避免連點錯題計數時狂打伺服器 */
/* DEV 模式不自動同步（ADR-0005）：syncNow() 仍可手動呼叫 */
/* 自動同步的守門：這一頁必須是「有後端的那兩種環境」發的——
   local（媒體伺服器自己發，SAME_ORIGIN_MEDIA）或 cloud（pages.dev，進度走 /api/progress）。
   static（8643 靜態站台）依舊不自動同步：那裡的 MEDIA_SRV 會回退到 localhost:8795＝
   正式伺服器，2026-09-02 的測試污染就是走這條路（見 00-config.js）。 */
function syncAuto(){ return !window.FEB_DEV && !window.SYNC_READONLY
  && ((typeof SAME_ORIGIN_MEDIA!=='undefined' && SAME_ORIGIN_MEDIA)
      || (typeof CLOUD!=='undefined' && CLOUD)); }
function syncSoon(){ if(!syncAuto()) return; clearTimeout(syncTimer); syncTimer=setTimeout(()=>syncNow(true),3000); }
/* 目前生效的分析卷；沒選目標＝全部 8 校都算 */
function activeAnaKeys(){
  if(!TGT.size) return null;
  const s=new Set();
  for(const p of TGT) (PROG_ANA[p]||[]).forEach(k=>s.add(k));
  return s;
}

