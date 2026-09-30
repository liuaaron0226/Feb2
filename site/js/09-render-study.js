/* 該章在十年裡的出題分佈：回傳 {year:count} 與可開的考卷連結 */
function spExamData(subj,ch){
  const years={}, bySch={}, seen=new Set();
  if(!INDEX||!DATA) return {years,bySch,n:0};
  const allow=activeAnaKeys();
  for(const key of (subj.anaKeys||[]).filter(k=>!allow||allow.has(k))){
    const d=ANA[key], map=ANA_MAP[key];
    if(!d||!map) continue;
    const [sid,subName]=map;
    const row=examRows(sid).get(subName);
    for(const c of (d.chapters||[])){
      if(!ch.match.some(t=>c.name.includes(t))) continue;
      for(const y in (c.years||{})){
        const v=+c.years[y]||0;
        if(!v) continue;
        years[y]=(years[y]||0)+v;
        const e=row?.years[y];
        if(!e||e.status!=='downloaded'||seen.has(e.path)) continue;
        seen.add(e.path);
        const sn=(chanById(sid)?.shortName||sid)+(subName.startsWith('工科')?'工科':'');
        // qs：該年屬於這章的大題題號（NotebookLM 分析產出，沒有就留空）
        const qs=(c.qs?.[y]||[]).filter(n=>+n>0);
        (bySch[sn]??=[]).push([+y,e.path,qs]);
      }
    }
  }
  return {years,bySch,n:seen.size};
}
/* 該章影片看了多少：從播放器存的位置回推。
   進度條算的是「章節打勾」，看影片不會讓它動——這裡補上真正的觀看進度。 */
/* ---------- 看過標記 ----------
   兩個來源：① 在這裡播放累積的進度（自動）② 手動打勾（在補習班平台或別台裝置看的）。
   手動優先——使用者說看完了就是看完了，不要被進度數字推翻。 */
const WATCH_LS='feb-watched-v1';
const DONE_PCT=90;
function watchMap(){ return readJSON(WATCH_LS,{}); }
function epState(code){
  const f=LOCAL[spNorm(code)];
  const man=watchMap()[spNorm(code)];
  const rec=f?readJSON(PL_LS,{})[f.url]:null;
  const pct=typeof rec==='number'?0:(rec?.pct||0);
  if(man) return {done:true,pct:100,manual:true,at:man};
  if(pct>=DONE_PCT) return {done:true,pct,manual:false};
  return {done:false,pct,manual:false};
}
function epToggle(code){
  const w=watchMap(), k=spNorm(code);
  if(w[k]) delete w[k]; else w[k]=todayStr();
  localStorage.setItem(WATCH_LS,JSON.stringify(w));
  edStamp(['watched:'+k]);      // T20：取消標記同樣蓋戳，否則伺服器聯集會把它復活
  syncSoon();
  renderStudy();
}
/* 播到 90% 自動記一筆，之後就算清了播放位置也還記得看過 */
function watchAutoMark(url){
  const code=Object.keys(LOCAL).find(k=>LOCAL[k].url===url);
  if(!code) return;
  const w=watchMap();
  if(!w[code]){ w[code]=todayStr(); localStorage.setItem(WATCH_LS,JSON.stringify(w));
    edStamp(['watched:'+code]); }
}
/* 標記鈕在播放鈕內部，點它一定要攔下事件否則會順便開始播放 */
function bindMarks(host){
  host.querySelectorAll('[data-mark]').forEach(el=>{
    const go=ev=>{ ev.preventDefault(); ev.stopPropagation(); epToggle(el.dataset.mark); };
    el.onclick=go;
    el.onkeydown=ev=>{ if(ev.key==='Enter'||ev.key===' ') go(ev); };
  });
}
function epMark(code){
  const s=epState(code);
  const lbl=s.done?(s.manual?'已標記看過（點一下取消）':'已看完（點一下取消）')
                  :(s.pct>2?`看到 ${s.pct}%，點一下標記看完`:'點一下標記看過');
  return `<span class="ep-mark${s.done?' on':''}" role="button" tabindex="0"
    data-mark="${esc(code)}" data-tip="${esc(lbl)}" aria-label="${esc(lbl)}"
    style="--p:${s.done?100:Math.max(0,Math.min(100,s.pct))}">${s.done?'✓':''}</span>`;
}

function watchOf(ch){
  const eps=VIDEOS?.istudy?.byChapter?.[ch.id]||[];
  if(!eps.length) return null;
  let seen=0, total=0, started=0;
  for(const e of eps){
    if(!LOCAL[spNorm(e.code)]) continue;
    total++;
    const s=epState(e.code);
    if(s.done) seen++;
    else if(s.pct>2){ seen+=s.pct/100; started++; }
  }
  if(!total) return null;
  return {frac:Math.min(1,seen/total), total, started, done:Math.round(seen)};
}

/* 考點覆蓋脊條：十格（106–115）沿用三級亮度，但收成列底的一條細脊——
   單一色相（該章學科結構色 color-mix 向透明），量值不是裝飾；
   尾端補「覆蓋 %」讀數（十年裡有考的年份數 ×10%，墨階 mono）。 */
function yrStrip(years){
  const hit=YEARS.filter(y=>+years[y]>0).length;
  return `<span class="yr" data-tip="十年出題分佈（亮＝該年有考）">${YEARS.map(y=>{
    const v=years[y]||0;
    return `<i class="${v>=3?'h3':v===2?'h2':v?'h1':''}"></i>`;}).join('')
    }<em class="mono">${hit*10}%</em></span>`;
}

/* 目前所在的週次（1–4，超出範圍就夾住） */
function wmCurWeek(){
  if(!SPRINT_PLAN) return 1;
  const d=Math.max(0,dayDiff(todayStr(),SPRINT_PLAN.start));
  return Math.min(4,Math.max(1,Math.floor(d/7)+1));
}
function wmChapters(){
  const out=[];
  for(const s of (SPRINT_PLAN?.subjects||[]))
    for(const c of s.chapters) out.push({subj:s,ch:c,phase2:!!s.phase2});
  return out;
}
function wmHours(week){
  let tot=0,done=0;
  for(const {ch,phase2} of wmChapters()){
    if(phase2||(week&&ch.week!==week)) continue;
    tot+=ch.hours; if(SP.done[ch.id]) done+=ch.hours;
  }
  // 時數是 .5 級距的小數，直接相加會冒出 118.80000000000001
  const r=x=>Math.round(x*10)/10;
  return {tot:r(tot),done:r(done)};
}

function renderWmBar(){
  const bar=document.getElementById('wmBar');
  if(!SPRINT_PLAN){bar.innerHTML='';return;}
  /* T14（ADR-0008）：W1–W4 週次 seg 退役——脊柱本身就是時間導航。
     WM.week 只留作內部沿用值（wmSave 形狀不變，week 依舊刻意不落地）。 */
  WM.week=wmCurWeek();
  /* 倒數讀數與總進度也搬進脊柱（今夜段的 dwrap／burnout），
     工具列瘦成一條髮絲列：搜尋／目標／重排／硬碟與離線／視圖／立即同步。 */
  /* 收納鈕的警示態：任一子系統出狀況就亮 status-warn＋「!」字符
     （狀態永遠配 glyph＋文字，不 color-alone——tokens 規） */
  const moreWarn=(DISK_UI.st==='gap'||OFF_UI.st==='gap'||MEDIA_UI.st==='down');
  bar.innerHTML=`
    <div class="wm-srch">
      <input id="wmQ" type="search" placeholder="搜尋所有影片逐字稿…" autocomplete="off">
      <div class="srch-pop glass" id="wmQPop" hidden></div>
    </div>
    ${/* 目標校系決定全站考點統計：維持 32px 主動作高度 */''}
    <button class="btn ${TGT.size?'ui-solid':'ui-ghost'} hit" id="wmTgt" type="button">${
      TGT.size?`目標 ${TGT.size} 校系`:'目標校系：全部'}</button>
    <!-- T08：落後重排（13-replan.js 的 glass modal 入口） -->
    ${/* 值夜 #4：工具列 tooltip 全面改走 #vizTip（data-tip）＋AT 等價
         （靜態鈕＝aria-label；動態狀態鈕＝aria-describedby 隱藏說明，
         名稱保留給即時狀態文字，offSet() 重寫 textContent 才不會被蓋住） */''}
    <button class="btn ui-ghost hit" id="wmReplan" type="button"
      data-tip="落後重排：用實測速率重算第一輪跑不跑得完，跑不完時算該砍哪幾章"
      aria-label="落後重排：用實測速率重算第一輪跑不跑得完，跑不完時算該砍哪幾章">重排</button>
    <!-- 硬碟／離線這幾件事不是每天要按的，收進一顆選單。
         狀態有異常時（找不到影片、離線缺檔、伺服器斷線）外層那顆會亮警示色，
         所以收起來也不會漏掉真正需要處理的事。
         選單本體是合法浮層（glass-quiet）；硬碟直讀 DISK 入口明文保留（ADR-0003）。 -->
    <div class="wm-more" id="wmMore">
      <button class="btn ui-ghost hit wm-more-btn" type="button" data-more
        aria-haspopup="true" aria-expanded="false"
        data-st="${moreWarn?'warn':''}"
        data-tip="硬碟與離線設定" aria-label="硬碟與離線設定">${ICO.more}<span>硬碟與離線</span>${moreWarn?'<b class="wm-warn mono">!</b>':''}</button>
      <div class="wm-more-pop glass-quiet" hidden>
        <button class="wm-more-item" id="wmDiskDir" type="button" aria-describedby="wmDiskDirD"
          data-tip="一次選整個資料夾。注意：iOS 會把選到的每個檔案複製一份進 iPad，
整包 istudy-backup 是 86GB，裝置只剩 3GB 時會失敗。"><span class="ico-lead ico-folder-open"></span>選整個資料夾</button>
        <label class="wm-more-item" id="wmDisk" for="diskPick" data-st="${DISK_UI.st}" aria-describedby="wmDiskD"
          data-tip="進硬碟找到這章的影片，一次把要看的幾支全選起來。可以分多次選，會累加。"><span class="ico-lead ico-folder"></span>${esc(DISK_UI.txt)}</label>
        <button class="wm-more-item" id="offBtn" type="button" aria-describedby="offBtnD"
          data-st="${OFF_UI.st}"
          data-tip="連得到電腦時會自動把教材抓進這台裝置，出門沒網路也能讀（不含影片）。點一下可立刻重新檢查。">${esc(OFF_UI.txt)}</button>
        <button class="wm-more-item" id="mediaBtn" type="button" ${MEDIA_UI.txt?'':'hidden'}
          data-st="${MEDIA_UI.st}" aria-describedby="mediaBtnD"
          data-tip="媒體伺服器沒連上時，影片會退回不支援 Range 的來源：不能拖曳快轉，而且每次都要從頭下載，播起來會卡。伺服器一回來就會自動切回去，也可以點一下立刻重試。">${esc(MEDIA_UI.txt)}</button>
        ${/* AT 等價說明（hidden 元素可被 aria-describedby 取文；不佔版面不進 tab 序） */''}
        <span id="wmDiskDirD" hidden>一次選整個資料夾。注意：iOS 會把選到的每個檔案複製一份進 iPad，整包 istudy-backup 是 86GB，裝置只剩 3GB 時會失敗。</span>
        <span id="wmDiskD" hidden>進硬碟找到這章的影片，一次把要看的幾支全選起來。可以分多次選，會累加。</span>
        <span id="offBtnD" hidden>連得到電腦時會自動把教材抓進這台裝置，出門沒網路也能讀（不含影片）。點一下可立刻重新檢查。</span>
        <span id="mediaBtnD" hidden>媒體伺服器沒連上時，影片會退回不支援 Range 的來源：不能拖曳快轉，而且每次都要從頭下載，播起來會卡。伺服器一回來就會自動切回去，也可以點一下立刻重試。</span>
      </div>
    </div>
    <div class="wm-right">
      <div class="ui-seg" role="group" aria-label="視圖">
        <button class="${WM.view==='sprint'?'on':''}" data-view="sprint">衝刺</button>
        <button class="${WM.view==='lib'?'on':''}" data-view="lib">影片庫</button>
      </div>
      <!-- T14：立即同步（ADR-0005 欠帳兌現）。DEV 只擋「自動」同步，
           手動 syncNow() 本來就明文允許；唯讀裝置按下去會得到誠實的 toast。 -->
      <button class="btn ui-ghost hit" id="wmSyncNow" type="button"
        data-tip="立刻與電腦互相合併一次進度（自動同步照舊；唯讀裝置只讀不寫）"
        aria-label="立即同步：立刻與電腦互相合併一次進度（自動同步照舊；唯讀裝置只讀不寫）">立即同步</button>
    </div>`;
  /* 收納選單的開關。點外面或按 Esc 關掉；選單內的項目點完也關，
     因為那幾個動作（選資料夾、重新檢查離線）都會跳出自己的回饋。 */
  const more=bar.querySelector('#wmMore');
  if(more){
    const btn=more.querySelector('[data-more]'), pop=more.querySelector('.wm-more-pop');
    const close=()=>{ pop.hidden=true; btn.setAttribute('aria-expanded','false'); };
    btn.onclick=e=>{
      // 不能用 stopPropagation：那會連帶擋掉掛在 document 上的點擊漣漪。
      // 改標記這次事件，讓「點外面就關閉」的處理跳過它即可。
      e._fromMoreBtn=true;
      const open=pop.hidden;
      pop.hidden=!open; btn.setAttribute('aria-expanded',String(open));
    };
    pop.onclick=()=>setTimeout(close,0);      // 讓項目自己的 onclick 先跑
    document.addEventListener('click',ev=>{
      if(ev._fromMoreBtn) return;                 // 那一下是開關本身，別立刻關掉
      if(!more.contains(ev.target)) close();
    });
    // Esc 掛 window：站上其他關閉行為（播放器、學校視窗）都在 window 這層，
    // 掛 document 會漏掉冒泡到 window 才處理的情況。
    addEventListener('keydown',ev=>{ if(ev.key==='Escape') close(); });
  }
  bar.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
    WM.view=b.dataset.view; wmSave(); renderStudy();});
  const sn=document.getElementById('wmSyncNow');
  if(sn) sn.onclick=()=>{
    /* 修訂三：spin-once 回饋（↻ 轉一圈；reduced-motion 由 tokens 全滅） */
    sn.classList.remove('sync-go'); void sn.offsetWidth; sn.classList.add('sync-go');
    syncNow(false);   // quiet=false：結果一律 toast 回報
  };
  const tb=document.getElementById('wmTgt');
  if(tb) tb.onclick=openTarget;
  const rp=document.getElementById('wmReplan');
  if(rp) rp.onclick=()=>openReplan();   // openReplan 住 13-replan.js（載入順序在本檔之後，執行期才解參照）
  const mb=document.getElementById('mediaBtn');
  if(mb) mb.onclick=async()=>{
    if(CLOUD) return toastMsg('雲端模式沒有影片：課程在家裡的外接硬碟，用 VLC 開；教材與進度照常同步');
    toastMsg('重新連線媒體伺服器…');
    await loadLocal();
    if(MEDIA_SEEKABLE){ renderStudy(); toastMsg('已連上，影片恢復可拖曳快轉'); }
    else toastMsg('還是連不到。確認電腦上的 feb-media-server 有在跑');
  };
  const ob=document.getElementById('offBtn');
  if(ob){
    ob.onclick=()=>{
      // 一律報版本：改了半天卻不知道裝置上跑的是不是新版，
      // 前幾輪就是這樣白費的。點一下就能確認。
      toastMsg(OFF_WHY || `[${APP_VER}] ${OFF_UI.txt}・重新檢查中…`);
      offlineAutoTopUp(true);
    };
    // 開站 4 秒那次盤點時人可能還不在讀書模式，按鈕根本不存在。
    // 第一次看到這顆按鈕就補跑一次，否則它會永遠停在「檢查中…」。
    if(!OFF_UI.st) setTimeout(()=>offlineAutoTopUp(false),300);
  }
  bindDisk();
  bindSearch();
}

/* 目標校系挑選：勾了哪幾組，十年考點就只算那幾組的考卷 */
function openTarget(){
  let m=document.getElementById('tgtModal');
  if(!m){
    m=document.createElement('div'); m.id='tgtModal'; m.className='modal';
    m.innerHTML=`<div class="modal-back" data-tclose></div>
      <div class="modal-panel glass tgt-panel">
        <button class="modal-x lq" type="button" data-tclose aria-label="關閉">✕</button>
        <h3>目標校系</h3>
        <p class="tgt-note">勾選你要報考的組別，章節旁的<b>十年考點</b>與右欄考卷就只算這些組的考題。
          全部不勾＝八校都算。無筆試的組別（陽交甲組、台科電機丙組、成大機械戊組）不影響考點統計，故未列出。</p>
        <div class="tgt-list" id="tgtList"></div>
        <div class="tgt-foot">
          <button class="btn ui-ghost hit" type="button" data-tall>全選</button>
          <button class="btn ui-ghost hit" type="button" data-tnone>全部取消</button>
          <button class="btn ui-solid hit" type="button" data-tclose>完成</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click',ev=>{
      if(ev.target.closest('[data-tclose]')){ m.hidden=true;
        document.body.classList.remove('modal-open'); renderStudy(); return; }
      if(ev.target.closest('[data-tall]')){ TGT=new Set(Object.keys(PROG_ANA)); tgtSave(); fillTarget(); return; }
      if(ev.target.closest('[data-tnone]')){ TGT.clear(); tgtSave(); fillTarget(); }
    });
    /* Esc 收合：站方慣例掛 window（與 rpModal／播放器同層），走 data-tclose 同一條收合路徑 */
    addEventListener('keydown',ev=>{
      if(ev.key!=='Escape') return;
      const md=document.getElementById('tgtModal');
      if(!md||md.hidden) return;
      if(typeof playing!=='undefined'&&playing) return;   // 先讓播放器關
      md.hidden=true; document.body.classList.remove('modal-open'); renderStudy();
    });
  }
  fillTarget();
  m.hidden=false; document.body.classList.add('modal-open');
}
function fillTarget(){
  const host=document.getElementById('tgtList');
  if(!host||!DATA) return;
  const bySchool={};
  for(const k of Object.keys(PROG_ANA)) (bySchool[k.split('|')[0]] ??= []).push(k);
  host.innerHTML=SCHOOL_ORDER.filter(sid=>bySchool[sid]).map(sid=>{
    const c=chanById(sid);
    return `<div class="tgt-grp"><h4>${esc(c?.shortName||sid)}</h4>${
      bySchool[sid].map(k=>{
        const subs=(PROG_ANA[k]||[]).map(a=>ANA_MAP[a]?.[1]).filter(Boolean);
        return `<label class="tgt-row ${TGT.has(k)?'on':''}">
          <input type="checkbox" data-prog="${esc(k)}" ${TGT.has(k)?'checked':''}>
          <span class="t1">${esc(PROG_LABEL[k].replace(/^\S+\s/,''))}</span>
          <span class="t2">${esc([...new Set(subs)].join('・')||'—')}</span></label>`;
      }).join('')}</div>`;
  }).join('');
  host.querySelectorAll('input[data-prog]').forEach(cb=>cb.onchange=()=>{
    cb.checked?TGT.add(cb.dataset.prog):TGT.delete(cb.dataset.prog);
    tgtSave(); fillTarget();
  });
}

/* =====================================================================
   T14 時間脊柱 × 席次（ADR-0008「脊柱為地圖，今夜是劇場」）
   ---------------------------------------------------------------------
   脊柱＝地圖（.scratch/redesign/direction2/spine.html port）：
   左緣全高燃線，一夜一格；已燒段餘燼、今夜段燃點、未燃段素引線；
   週摺頁＝原生 details；超過 366 夜的區間以 .sp-gap 摺疊表示（截斷法）。
   今夜＝劇場（focus.html port）：站01 複習（#rvSlot 原節點搬入）→
   站02 今日章節 → 站03 錯題 → 站04 收工；站是普通 in-flow 區塊，
   捲動永遠是老大，導航只有 in-flow 錨點列＋鍵盤 1–4＋唯一浮動「今夜」錨。
   母版-明細退役：點任何章節列＝原地展開集數／考古題（一次一個）。
   渲染紀律照舊：狀態在 JS/localStorage，DOM write-only；#rvSlot 永不重建，
   只由 rvDock() 在站01（衝刺）與工具列下常駐位（影片庫）之間搬動同一節點。
   ===================================================================== */
let RV_NODE=null;               // #rvSlot 唯一真身（12-review.js 契約：不准 innerHTML 蓋它）
const SPINE_OPEN=new Set();     // 展開中的摺頁 key（UI 暫態：要活過重繪，但刻意不落地）
const RUNG_SHUT=new Set();      // 三階天梯**被收起來的**階（不是被打開的）：預設全開，
                                // 空集合就該全開；記「開」的話新章節會莫名闔上。同樣不落地
let NB_OPEN=null;               // T17 筆記迴流開合帳（同上，session 暫態）；null＝沒動過→吃預設（錯題本預開）
let EP_HINT_SEEN=false;         // 「⟵ 滑動 ⟶」首用提示：第一次真的滑過就退場（UI 暫態，不落地）
let DEBT_OPEN=false;            // 結算列欠帳分解的開合（UI 暫態，同上：活過重繪、不落地）
/* ---- 修訂三 #3 動效鬆綁：一次性互動回饋的暫態旗標（重繪不重播——
   num-bump 同紀律：只有「真變動」那次重繪才掛 class，純重繪不演）。 ---- */
let TICK_FLASH=null;            // 剛勾完成的章 id → 勾掛 .tick-in、列掛 .settle-in
let MISS_FLASH=null;            // 剛 +1 的章 id → ✕ 掛 .miss-pop（減一不演）
/* 天梯階解鎖 crossfade 的前態。T19 起同一次重繪會出現多座天梯（一科一座），
   單一物件會被最後一座蓋掉、誰都演不到——改成 ch.id → {a1,a2} 的帳本。
   語意不變：同一章、上次還 dim、這次亮了才演；重整（帳本空）不演。 */
const LADDER_LIT=new Map();
const ST_SEEN=new Set();        // 本 session 已進場過的站（站進場動效一站一次）
const STAGE_IO=new IntersectionObserver(es=>{
  for(const e of es){
    if(!e.isIntersecting) continue;
    STAGE_IO.unobserve(e.target);
    if(ST_SEEN.has(e.target.id)) continue;
    ST_SEEN.add(e.target.id);
    e.target.classList.add('st-on');
  }
},{threshold:.12});
const rnd1=x=>Math.round(x*10)/10;

/* ---------- T14b ①有意義互動：讀數與刻度的 tooltip 內容 ----------
   全部走 04-render-exam 的 #vizTip 共用件（data-tip 屬性、狀態在 JS）。
   每一句都在回答一個真問題：這夜是哪天？這數字怎麼算的？ */
const WD_TC='日一二三四五六';
function spinePer(){ return SPRINT_PLAN?.budget?.perDayNeeded||5; }
/* 章節列刻度：這一格在時間軸上是哪一段（週次＋日期帶＋約當幾夜） */
function tkTip(ch){
  const per=spinePer();
  if(ch.week){
    const s=weekSpan(ch.week);
    return `W${ch.week} ${SP_WEEKS[ch.week-1]||''} · ${s.a}→${s.b} · 本章 ${ch.hours}h ≈ ${
      Math.max(1,Math.ceil(ch.hours/per))} 夜（配額 ${per}h/夜）`;
  }
  const dl=SPRINT_PLAN?.deadline||'';
  return `第二段軌道 · ${dl.slice(5).replace('-','/')} 之後 · 本章 ${ch.hours}h`;
}
/* 章節時數讀數：hours 是怎麼組出來的（sprint.json 的 watch＝2 倍速影片時數） */
function hrsTip(ch){
  if(ch.watch) return `${ch.hours}h ＝ 影片 ${ch.watch}h（2 倍速實看）＋ 練題 ${rnd1(ch.hours-ch.watch)}h`;
  return `${ch.hours}h · ${String(ch.why||'計畫排定時數').slice(0,60)}`;
}
/* 摺頁的壓縮夜叢：一格＝一夜，逐夜給日期＋夜序＋該週計畫 */
function miniTksHTML(w){
  if(!SPRINT_PLAN) return '';
  const s=weekSpan(w), h=wmHours(w);
  const nCh=wmChapters().filter(x=>!x.phase2&&x.ch.week===w).length;
  const a=parseD(SPRINT_PLAN.start); a.setDate(a.getDate()+(w-1)*7);
  let out='';
  for(let i=0;i<Math.min(s.nights,7);i++){
    const d=new Date(a); d.setDate(a.getDate()+i);
    const ds=todayStr(d), nn=dayDiff(ds,SPRINT_PLAN.start)+1;
    out+=`<i data-tip="${esc(`${ds.slice(5).replace('-','/')} 週${WD_TC[d.getDay()]} · 夜 ${nn} · W${w} ${SP_WEEKS[w-1]||''} · 本週 ${nCh} 章 ${h.tot}h`)}"></i>`;
  }
  return out;
}
/* 週時數 Σ 來源（摺頁與站牌上的 done/tot 讀數） */
function weekSumTip(w){
  const hs=wmChapters().filter(x=>!x.phase2&&x.ch.week===w).map(x=>x.ch.hours);
  if(!hs.length) return '這週沒有排章節';
  return `Σ 本週 ${hs.length} 章：${hs.join('+')}＝${rnd1(hs.reduce((a,b)=>a+b,0))}h`;
}
/* 實燒 Σ 來源（已勾完成章節的計畫時數逐項相加） */
function doneSumTip(){
  const hs=wmChapters().filter(x=>!x.phase2&&SP.done[x.ch.id]).map(x=>x.ch.hours);
  if(!hs.length) return '實燒＝Σ 已勾完成章節的計畫時數（目前 0 章）';
  const head=hs.slice(0,10);
  return `實燒＝Σ 已勾章節：${head.join('+')}${hs.length>10?'+…':''}＝${rnd1(hs.reduce((a,b)=>a+b,0))}h（${hs.length} 章）`;
}
/* 集數 chip 的章節座標：這一支屬於哪章、章內第幾集（衝刺與影片庫共用） */
let EP_POS=null;
function epPos(code){
  if(!EP_POS){
    EP_POS={};
    const bc=VIDEOS?.istudy?.byChapter||{};
    const nameOf=id=>{
      const h=wmChapters().find(x=>x.ch.id===id);
      return h?stripSubj(h.ch.name,h.subj.name):id;
    };
    for(const id in bc){
      const arr=bc[id]||[];
      arr.forEach((e,i)=>{ EP_POS[spNorm(e.code)]={ch:nameOf(id),i:i+1,n:arr.length}; });
    }
  }
  return EP_POS[spNorm(code)]||null;
}
function rvDock(intoSpine){
  const rv=RV_NODE||(RV_NODE=document.getElementById('rvSlot'));
  if(!rv) return;
  if(intoSpine){
    const a=document.getElementById('rvAnchor');
    if(a&&rv.parentElement!==a) a.appendChild(rv);
  }else{
    const wm=document.getElementById('wm'), sp=document.getElementById('wmSpine');
    if(wm&&sp&&rv.parentElement!==wm) wm.insertBefore(rv,sp);
  }
}
function spineExam(){ return (typeof SET==='object'&&SET&&SET.exam)||'2027-02-01'; }
function weekSpan(w){
  const a=parseD(SPRINT_PLAN.start); a.setDate(a.getDate()+(w-1)*7);
  let b=new Date(a); b.setDate(a.getDate()+6);
  const dl=parseD(SPRINT_PLAN.deadline); if(b>dl)b=dl;
  const f=d=>`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  return {a:f(a),b:f(b),nights:Math.max(1,Math.round((b-a)/864e5)+1)};
}
/* 一列＝一章：科目眉標（mono 結構色）＋章名＋錯題／時數 mono 讀數
   ＋列底考點覆蓋脊條＋掛在脊柱上的刻度。已完成＝✓＋SP.done 日期（壓縮暗）。
   o.lead＝今夜主章（常開、不折疊；T14c 完成勾與錯題計數「不」在這一列——
   它們的家搬進三階天梯：勾＝階03 終點、✕＝階02 動作，資料鍵與 shape 原封）；
   o.zone==='past' 讓刻度走餘燼色。 */
function wmRowHTML({subj,ch},i,o={}){
  const dn=!!SP.done[ch.id], ex=spExamData(subj,ch);
  const w=watchOf(ch);
  const open=!o.lead&&!o.thr&&ch.id===WM.sel;
  const doneAt=dn?String(SP.done[ch.id]).slice(5).replace('-','/'):'';
  return `<button class="wm-row sp-row ${dn?'done':''} ${open||o.lead?'on':''}${o.thr?' thr':''}"
    data-ch="${esc(ch.id)}" data-subj="${esc(subj.id)}"${o.lead?' data-lead="1"':''}${
      o.thr?' data-thr="1" data-tip="今夜主章在站 02 開演——點列直達劇場"':''}
    style="--i:${Math.min(i||0,8)}"${o.thr?'':` aria-expanded="${open||!!o.lead}"`}>
    <span class="sp-tk${o.zone==='past'?'':' f'}" aria-hidden="true" data-tip="${esc(tkTip(ch))}"></span>
    ${o.lead?'':`<input type="checkbox" data-sp="${esc(ch.id)}" ${dn?'checked':''} onclick="event.stopPropagation()"
      aria-label="標記本章完成（標準：該章考古題能動筆）" data-tip="勾完成的標準：該章考古題能動筆">`}
    <span class="ch-sub mono">${esc(SUBJ_TAG[subj.id]||subj.name||subj.id)}${
      dn?`<u class="ok">✓ ${esc(doneAt)} 章完</u>`:''}${
      o.thr?'<u class="thr-lab">↓ 今夜劇場</u>':''}</span>
    <span class="nm">${esc(ch.name.replace(/^(電子學|線代)：/,''))}${
      w&&w.frac>0.01?`<i class="seen" data-tip="影片已看約 ${Math.round(w.frac*100)}%"
        aria-label="影片已看約 ${Math.round(w.frac*100)}%" style="--w:${w.frac}"></i>`:''}</span>
    ${o.lead?'':`<span class="miss mono ${SP.miss[ch.id]?'has':''}" data-miss="${esc(ch.id)}"
      role="button" tabindex="0" aria-label="錯題 ${SP.miss[ch.id]||0} 題（Enter 加一、Shift+Enter 減一）"
      data-tip="寫考古題錯幾題就點幾下（右鍵減一；鍵盤 Enter 加一、Shift+Enter 減一）">${SP.miss[ch.id]?'✕'+SP.miss[ch.id]:'✕'}</span>`}
    <span class="hrs mono" data-tip="${esc(hrsTip(ch))}">${ch.hours}h</span>
    ${yrStrip(ex.years)}</button>
    ${open?`<div class="wm-exp" data-subj="${esc(subj.id)}">${chDetailHTML({subj,ch})}</div>`:''}`;
}
function renderSpine(){
  const host=document.getElementById('wmSpine');
  if(!host) return;
  rvDock(false);                 // 先把 #rvSlot 挪到安全位，再重建脊柱
  if(!SPRINT_PLAN){ host.innerHTML='<div class="wm-empty">還沒有衝刺計畫（sprint.json）</div>'; return; }
  const today=todayStr(), start=SPRINT_PLAN.start, dl=SPRINT_PLAN.deadline, exam=spineExam();
  const cur=wmCurWeek();
  const all=wmHours(0), frac=all.tot?all.done/all.tot:0, pct=Math.round(frac*100);
  const per=SPRINT_PLAN.budget?.perDayNeeded||5;
  // 夜序（1-based）；脊柱總長＝點火日→筆試日。>366 夜依 spine.html 摺疊法截斷：
  // 逐夜格子只存在於摺頁的 mini-tks 與已排程段，遠端一律 .sp-gap 摺疊，數字誠實。
  const nightsTotal=Math.max(1,dayDiff(exam,start));
  const nightNo=Math.min(nightsTotal,Math.max(1,dayDiff(today,start)+1));
  const trunc=nightsTotal>366;
  const p1Nights=Math.max(1,dayDiff(dl,start)+1);
  // 誠實赤字：照表＝已過完的夜 × 每夜配額；實燒＝已勾完成章節的計畫時數
  const nBurn=Math.min(p1Nights,Math.max(0,dayDiff(today,start)));
  const sched=rnd1(nBurn*per), diff=rnd1(all.done-sched);
  const chAll=wmChapters();
  // 選取合法性：查無此章 → null（今夜就是預設落點，不再強選第一列）
  if(WM.sel&&!chAll.some(x=>x.ch.id===WM.sel)) WM.sel=null;
  // 選中章若躲在摺起的週／軌道裡，替它把摺頁打開（重整回同一章的約定）
  const selHit=chAll.find(x=>x.ch.id===WM.sel);
  if(selHit) SPINE_OPEN.add(selHit.phase2?'p2-'+selHit.subj.id:(selHit.ch.week===cur?'wcur':'w'+selHit.ch.week));
  const rowsOf=w=>chAll.filter(x=>!x.phase2&&x.ch.week===w);
  /* 今夜章節（T19 多科天梯）：本週未完成者依科分堆——**每一科各出一座天梯**，
     該科的 lead＝它本週第一個未完成章節（電子 2h＋工數 2h＋0.5h 錯題的雙軌讀書法，
     docs/sprint-plan.md；T14 只演單一主章讓它永遠停在電子學＝設計失誤）。
     科目優先序＝sprint.json subjects 的宣告順序（電子→工數→線代→控制→多益），
     不寫死清單：計畫改了順序，天梯就跟著改。其餘（每科第 2 個以後）＝本週待燒。 */
  const tonightRows=rowsOf(cur).filter(x=>!SP.done[x.ch.id]);
  const subjOrder=(SPRINT_PLAN.subjects||[]).map(s=>s.id);
  const subjRank=id=>{ const i=subjOrder.indexOf(id); return i<0?99:i; };
  const leadBySubj=new Map();
  for(const x of tonightRows) if(!leadBySubj.has(x.subj.id)) leadBySubj.set(x.subj.id,x);

  /* 電子學的主章跟著**影片順序**走，不跟章節宣告順序走。

     使用者判例（講過兩次）：「電子學就還是按照她影片的順序觀看」。
     原本這裡一律取「本週第一個未完成的章節」——對電子學而言那是 MOSFET
     （進度 80%、沒被勾完成），可是課程影片早就播到第 24 集的 OP／回授了。
     於是站 02 的標題寫 MOSFET、底下「接著看」卻列出 OP 的集數，兩邊互相打臉。

     改成：看課序裡第一支還沒看的集數屬於哪一章，那一章就是今夜主章。

     **刻意不限制那一章要落在本週名單裡**（2026-09-04 使用者裁定）。
     第一版加了「只有在本週待燒名單裡才改」這道保險，結果正好把要的效果擋掉：
     課序下一支是 115暑電子08、屬於「BJT 直流偏壓」，而那一章使用者已經勾了
     完成（站台律法：勾完成＝該章考古題能動筆，**不是**影片看完），於是它不在
     待燒名單裡，主章就退回 MOSFET——標題寫 MOSFET、底下列 BJT 的集數。
     使用者的選擇是「下一支未看影片在哪章就演那章」，接受「那章可能已勾完成、
     天梯 03 自解顯示已完成」這個副作用。所以這裡在 chAll 裡找，不在 tonightRows。

     只排除 phase2（第二段軌道）：那是另一條時間線，混進來會讓脊柱錯亂。
     找不到（課表沒收錄、或整科影片都看完）就維持原本的選法，不硬湊。 */
  for(const subjId of ['elec']){
    if(!leadBySubj.has(subjId)) continue;
    const nextUp=courseOrderEps(subjId).find(x=>x.ch&&!epState(x.e.code).done);
    if(!nextUp) continue;
    const row=chAll.find(x=>!x.phase2&&x.ch.id===nextUp.ch.id);
    if(row) leadBySubj.set(subjId,row);
  }
  let tonightLeads=[...leadBySubj.values()].sort((a,b)=>subjRank(a.subj.id)-subjRank(b.subj.id));
  let leadIds=new Set(tonightLeads.map(x=>x.ch.id));
  let tonightRest=tonightRows.filter(x=>!leadIds.has(x.ch.id));
  let primary=tonightLeads[0]||null;   // 首席科目：站燈色、明日預告、脊柱路標的代表
  if(!primary){                  // 第一段燒完（或已過 9/12）：接第二段軌道
    primary=chAll.find(x=>x.phase2&&!SP.done[x.ch.id])||null;
    tonightLeads=primary?[primary]:[]; leadIds=new Set(tonightLeads.map(x=>x.ch.id));
    tonightRest=[];
  }

  /* ---------- 已燒段 THE BURNED ---------- */
  /* T14b：mini-tks 一格一夜、逐夜給 tooltip（tks＝已生成的 HTML 字串） */
  const wfold=(key,stHTML,tks,bodyHTML,tip)=>`
    <details class="wfold" data-fold="${key}"${SPINE_OPEN.has(key)?' open':''}>
      <summary><div class="station">
        <span class="sp-tk st" aria-hidden="true"${tip?` data-tip="${esc(tip)}"`:''}></span>
        <span class="car" aria-hidden="true">▸</span>
        <span class="st-t">${stHTML}</span>
        <span class="mini-tks" aria-hidden="true">${tks}</span>
        <span class="ln" aria-hidden="true"></span>
      </div></summary>
      <div class="wbody">${bodyHTML}</div>
    </details>`;
  let past=`<div class="origin"><span class="cap" aria-hidden="true"></span>
    <span class="ot mono"><b>${esc(start.slice(5).replace('-','·'))}</b> · 衝刺點火 · 第一段 ${p1Nights} 夜 · ${all.tot}h</span></div>`;
  for(let w=1;w<cur;w++){
    const s=weekSpan(w), h=wmHours(w), rws=rowsOf(w);
    const dnN=rws.filter(x=>SP.done[x.ch.id]).length;
    past+=wfold('w'+w,
      `<b>W${w}</b> · <span class="nwu">${s.a}→${s.b}</span> · ${esc(SP_WEEKS[w-1])} · <span data-tip="${esc(weekSumTip(w))}" class="nwu">${h.done}/${h.tot}h</span> · <span class="nwu">${dnN}/${rws.length} 章 ✓</span>`,
      miniTksHTML(w),
      rws.map((x,i)=>wmRowHTML(x,i,{zone:'past'})).join('')||'<div class="wm-empty">這週沒有排章節</div>');
  }
  const curS=weekSpan(cur), curDone=rowsOf(cur).filter(x=>SP.done[x.ch.id]);
  /* T14b ①：欠帳分解——結算差額可點，原地攤開逐週「照表／實燒／差」
     （行線分列、無框；開合狀態在 JS 的 DEBT_OPEN，不落 DOM 也不落地） */
  const dxRows=()=>{
    let out='';
    for(let w=1;w<=cur;w++){
      const s=weekSpan(w);
      const nP=Math.min(s.nights,Math.max(0,nBurn-(w-1)*7));   // 該週已過完幾夜
      const wSched=rnd1(nP*per), wDone=wmHours(w).done, wDiff=rnd1(wDone-wSched);
      out+=`<div class="dx-row"><span class="dx-w">W${w} ${esc(SP_WEEKS[w-1]||'')}</span>
        <span data-tip="${esc(`照表＝該週已過完 ${nP} 夜 × 配額 ${per}h`)}">照表 ${wSched}h</span>
        <span data-tip="${esc(weekSumTip(w))}">實燒 ${wDone}h</span>
        <b class="${wDiff<0?'neg':'pos'}">差 ${wDiff>0?'+':''}${wDiff}h</b></div>`;
    }
    return out+`<div class="dx-note">照表只計已過完的夜（今夜不算）；實燒＝該週已勾完成章節的計畫時數</div>`;
  };
  /* 本週＝可展開摺頁（使用者判例：「為何我不能去點開w2」）——與過去／未來週
     同一套 wfold；展開＝本週整份章節列（含已完成），今夜主章不重複天梯，
     改掛「↓ 今夜劇場」路標直達站 02。key='wcur'（跨重繪由 SPINE_OPEN 記帳）。 */
  const curRows=rowsOf(cur);
  past+=wfold('wcur',
    `<b>W${cur}</b> · <span class="nwu">${curS.a}→${curS.b}</span> · ${esc(SP_WEEKS[cur-1]||'')} · 本週 <span data-tip="${esc(weekSumTip(cur))}" class="nwu">${wmHours(cur).done}/${wmHours(cur).tot}h</span> · <span class="nwu">${curDone.length}/${curRows.length} 章 ✓</span>`,
    miniTksHTML(cur),
    curRows.map((x,i)=>(!x.phase2&&leadIds.has(x.ch.id))
      ?wmRowHTML(x,i,{thr:true})
      :wmRowHTML(x,i,SP.done[x.ch.id]?{zone:'past'}:{})).join('')||'<div class="wm-empty">這週沒有排章節</div>',
    `本週 · ${curS.a}→${curS.b} · ${SP_WEEKS[cur-1]||''}`);
  past+=`<div class="debt" role="status" aria-label="結算讀數">
      <span data-tip="${esc(`照表＝已過完 ${nBurn} 夜 × 每夜配額 ${per}h（sprint.json budget）`)}">結算 · 照表 ${nBurn} 夜 × ${per}h ＝ ${sched}h</span>
      <span data-tip="${esc(doneSumTip())}">實燒 ${all.done}h</span>
      <button type="button" class="debt-diff mono hit ${diff<0?'neg':'pos'}" data-debt
        aria-expanded="${DEBT_OPEN}" data-tip="點開逐週欠帳分解"
        aria-label="差 ${diff>0?'+':''}${diff}h，點開逐週欠帳分解">差 ${diff>0?'+':''}${diff}h</button>
      <button type="button" class="btn ui-ghost hit" data-replan style="margin-left:auto">重排 W1–W4</button>
    </div>
    ${DEBT_OPEN?`<div class="debt-x" aria-label="逐週欠帳分解">${dxRows()}</div>`:''}`;

  /* ---------- 今夜 TONIGHT ---------- */
  const dExam=Math.max(0,dayDiff(exam,today));
  const dP1=Math.max(0,dayDiff(dl,today));
  const wd='日一二三四五六'[parseD(today).getDay()];
  const chN=chAll.filter(x=>!x.phase2).length;
  const bud=SPRINT_PLAN.budget||{};
  const tonightHead=`
    <div class="now-head"><span class="sp-tk now" aria-hidden="true"
        data-tip="${esc(`今夜 · ${today.slice(5).replace('-','/')} 週${wd} · 夜 ${nightNo}/${nightsTotal} · 配額 ${per}h`)}"></span>
      <span class="st-t">今夜 TONIGHT · 夜 ${nightNo}/${nightsTotal}${trunc?'+':''}</span>
      <span class="ln" aria-hidden="true"></span></div>
    <div class="dwrap">
      <span class="dnum" aria-label="距筆試 ${dExam} 天（${esc(exam)}）" data-tip="距 ${esc(exam)} 筆試">D-${dExam}</span>
      <span class="dlab mono">${esc(today.slice(5).replace('-','·'))} 週${wd} · W${cur} ${esc(SP_WEEKS[cur-1]||'')}<br>
        <span class="faint">距 ${esc(exam)} 筆試 · 至 ${esc(dl.slice(5).replace('-','/'))} 第一輪 D-${dP1}</span></span>
    </div>
    <div class="burnout" role="status" aria-label="燃燒讀數">
      <span class="hot"><span id="wmHrs" data-tip="${esc(`${doneSumTip()} ・ 總量＝Σ 第一輪 ${chN} 章＝${all.tot}h`)}">${all.done}/${all.tot}h</span></span>
      <span class="sep" aria-hidden="true"></span><span data-tip="${esc(`${pct}%＝實燒 ${all.done}h ÷ 總量 ${all.tot}h`)}">${pct}%</span>
      <span class="tk-bar" role="img" aria-label="第一輪總進度"><i style="transform:scaleX(${frac})"></i></span>
      <span class="sep" aria-hidden="true"></span><span data-tip="${esc(`脊柱＝點火 ${start} → 筆試 ${exam}，全長 ${nightsTotal} 夜；已燒完 ${nightNo-1} 夜`)}">脊柱 ${nightNo-1}/${nightsTotal} 夜</span>
      <span class="sep" aria-hidden="true"></span><span data-tip="${esc(`配額＝第一輪 ${bud.needed||all.tot}h ÷ ${bud.days||p1Nights} 夜 ＝ ${per}h/夜（sprint.json budget）`)}">今夜配額 ${per}h</span>
    </div>
    <nav class="st-nav mono" aria-label="今夜四站錨點">
      ${[['1','複習'],['2','章節'],['3','錯題'],['4','收工']].map(([n,t])=>
        `<button type="button" class="hit" data-st-go="${n}">0${n} ${t}</button>`).join('')}
      <span class="st-hint eyebrow">鍵盤 1–4 直達 · 捲動即導航</span>
    </nav>`;
  const st1=`<section class="stage st-review" id="stn1" aria-label="站 01 · 複習">
    <span class="seat" aria-hidden="true" data-seat="1" data-tip="跳到站 01 複習（鍵盤 1）">01</span>
    <div class="st-in">
      <p class="st-eyebrow eyebrow"><span><b class="st-no">站 01</b> · 複習 REVIEW DUE · 到期就是今晚</span></p>
      <div id="rvAnchor"></div>
    </div></section>`;
  let st2body;
  if(tonightLeads.length){
    /* T14c R 灌注：主章材料＝三階天梯（範例→半完成→自解；勾與 ✕ 的家在梯上）。
       T19：一科一座——每座＝科目眉標＋主章列（data-lead）＋自己的天梯，
       河道流線（.stage::after）本來就貫穿整站，站與站之間不斷流，
       科目起點在流線上點一顆結構色節點（.subj-blk::before）。
       水印仍是一站一顆（.seat 掛在 .stage，不隨科目增生）。
       本週待燒與其他章的原地展開 accordion 照舊（chDetailHTML 未動）。 */
    const blocks=tonightLeads.map(hit=>{
      /* 眉標讀數：第一段＝該科「本週」的章帳；第二段軌道沒有週次，
         用該科整段的章帳（不能套「本週」口徑，會變成「本週 0/0 章」的誤導句） */
      const p2=!!hit.phase2;
      const sw=p2?(hit.subj.chapters||[]).map(c=>({subj:hit.subj,ch:c}))
                :rowsOf(cur).filter(x=>x.subj.id===hit.subj.id);
      const swDn=sw.filter(x=>SP.done[x.ch.id]).length;
      const swLeft=sw.length-swDn, scope=p2?'第二段':'本週';
      return `<div class="subj-blk" id="ldr-${esc(hit.subj.id)}" data-subj="${esc(hit.subj.id)}"
        aria-label="${esc((hit.subj.name||hit.subj.id)+' 天梯')}">
        <p class="sb-eyebrow eyebrow"><b>${esc(hit.subj.label||hit.subj.name||SUBJ_TAG[hit.subj.id]||hit.subj.id)}</b>
          <span class="sb-n mono" data-tip="${esc(`${p2?'第二段軌道':'W'+cur} 本科排 ${sw.length} 章（${
            sw.map(x=>x.ch.hours).join('+')}＝${rnd1(sw.reduce((a,x)=>a+(+x.ch.hours||0),0))}h）· 已完成 ${swDn} 章`)
          }">${scope} ${swDn}/${sw.length} 章 ✓ · 待燒 ${swLeft}</span></p>
        ${wmRowHTML(hit,0,{lead:true})}
        <div class="wm-exp lead ldr-wrap" data-subj="${esc(hit.subj.id)}">${chLadderHTML(hit)}</div>
      </div>`;
    }).join('');
    /* 科目跳道（>1 科才出現）：mono 一行「電子 · 工數 · 線代」——回答
       「今夜有哪幾科、我現在在哪一科」，捲動時所在科自己亮起（同 st-nav 判例）。
       鍵盤 1–4 的站導航不動，這條只在站 02 內部換科。 */
    const jump=tonightLeads.length>1
      ?`<nav class="subj-jump mono" aria-label="今夜科目天梯跳道">
        ${tonightLeads.map(h=>`<button type="button" class="hit" data-subj-go="${esc(h.subj.id)}"
          data-tip="${esc(`捲到 ${h.subj.name||h.subj.id} 的天梯`)}">${esc(SUBJ_TAG[h.subj.id]||h.subj.name||h.subj.id)}</button>`)
          .join('<span class="sj-sep" aria-hidden="true">·</span>')}
        <span class="sj-hint eyebrow">今夜 ${tonightLeads.length} 科 · 捲動即換科</span>
      </nav>`:'';
    st2body=jump+blocks
      +(tonightRest.length?`<p class="st-sub eyebrow">本週待燒 ×${tonightRest.length} · 各科第 2 章起 · 點列原地展開</p>`
        +tonightRest.map((x,i)=>wmRowHTML(x,i)).join(''):'');
  }else{
    st2body='<div class="wm-empty">計畫章節都燒完了——去站 03 清錯題，或用工具列「重排」規劃下一段</div>';
  }
  const st2=`<section class="stage st-chapter" id="stn2"${primary?` data-subj="${esc(primary.subj.id)}"`:''}
    aria-label="站 02 · 今日章節">
    <span class="seat" aria-hidden="true" data-seat="2" data-tip="跳到站 02 今日章節（鍵盤 2）">02</span>
    <div class="st-in">
      <p class="st-eyebrow eyebrow"><span><b class="st-no">站 02</b> · 今日章節 TODAY'S CHAPTER · 計畫決定，你只要坐下</span></p>
      ${st2body}
    </div></section>`;
  // 站 03：錯題＝正在燒的考點。既有資料（SP.miss＋spExamData），不添新模型
  const missES=Object.entries(SP.miss||{}).sort((a,b)=>b[1]-a[1]);
  const st3rows=missES.map(([id,n],i)=>{
    const c=chAll.find(x=>x.ch.id===id);
    if(!c) return '';
    const ex=spExamData(c.subj,c.ch), links=[];
    for(const [sn,arr] of Object.entries(ex.bySch)){
      arr.sort((a,b)=>b[0]-a[0]);
      for(const [y,p,qs] of arr.slice(0,2))
        links.push(`<a class="${qs?.length?'hasq':''}" href="${esc(dataURL('exams/'+p))}"
          target="_blank" rel="noopener">${esc(sn)} ${y}${qs?.length?`<em>第 ${qs.join('、')} 題</em>`:''}</a>`);
    }
    return `<div class="mrow" data-subj="${esc(c.subj.id)}" style="--i:${Math.min(i,8)}">
      <button type="button" class="m-name hit" data-jump="${esc(id)}" data-tip="跳到脊柱上的這一章"
        aria-label="跳到脊柱上的這一章：${esc(stripSubj(c.ch.name,c.subj.name))}">
        <span class="ch-sub mono">${esc(SUBJ_TAG[c.subj.id]||c.subj.name||'')}</span>
        <span class="nm">${esc(stripSubj(c.ch.name,c.subj.name))}</span></button>
      <span class="m-n mono" data-tip="累計錯題數" aria-label="累計錯題 ${n} 題">✕${n}</span>
      <span class="m-links sp-sch">${links.slice(0,4).join('')||'<i class="m-none">無已收考卷</i>'}</span>
    </div>`;
  }).join('');
  /* T17 筆記迴流：今夜科目的 NotebookLM 筆記快照（lazy——首次渲染該科才抓；
     檔案不在／還在載＝整段安靜不現身）。markdown 由 nblmFill() 重繪後補繪。
     T19：今夜是三科，✕ 也會來自三科——一科一組，順序同天梯（不只首席科，
     否則工數／線代的錯題本在站03 消失＝能力遺失）。 */
  for(const h of tonightLeads) nblmEnsure(h.subj.id);
  const st3=`<section class="stage st-wrong" id="stn3" aria-label="站 03 · 錯題">
    <span class="seat" aria-hidden="true" data-seat="3" data-tip="跳到站 03 錯題（鍵盤 3）">03</span>
    <div class="st-in">
      <p class="st-eyebrow eyebrow"><span><b class="st-no">站 03</b> · 錯題 REDO · 迴水灣——階 02 記下的 ✕ 在這裡迴流</span></p>
      ${missES.length?st3rows:'<div class="wm-empty">還沒有記錯題——寫題錯了就在階 02（或任何章節列）點 ✕</div>'}
      ${tonightLeads.map(h=>nblmHTML(h.subj)).join('')}
    </div></section>`;
  // 站 04：今日戰報（全部從既有 localStorage 讀穿，不添新鍵）
  const wt=watchMap();
  const seenToday=Object.keys(wt).filter(k=>wt[k]===today);
  const pp=readJSON(PL_LS,{});
  const playedToday=Object.values(pp).filter(r=>r&&typeof r==='object'&&r.at===today).length;
  const doneToday=chAll.filter(x=>SP.done[x.ch.id]===today);
  const rvSt=readJSON('feb-review-v1',{cards:[]});
  let rvToday=0,rvPass=0;
  for(const c of (rvSt.cards||[])) for(const h of (c&&c.history||[]))
    if(h&&h.date===today){ rvToday++; if(h.result==='pass') rvPass++; }
  const missTotal=Object.values(SP.miss||{}).reduce((a,b)=>a+(+b||0),0);
  // 明日預告：照計畫推——同週續章／下週開章／過 9/12 接第二段
  const td=parseD(today); td.setDate(td.getDate()+1); const tmr=todayStr(td);
  let tmrTxt, tmrSubj='';   // tmrSubj：明日科目 id → .tomorrow 左脊取該科結構色（無排程留空＝--ink-dim）
  if(dayDiff(tmr,dl)>0){
    const p2=chAll.find(x=>x.phase2&&!SP.done[x.ch.id]);
    if(p2) tmrSubj=p2.subj.id;
    tmrTxt=p2?`第二段 · ${esc(p2.subj.label||p2.subj.name||'')} · ${esc(stripSubj(p2.ch.name,p2.subj.name))}`
             :'第二段軌道也清空了';
  }else{
    const wT=Math.min(4,Math.max(1,Math.floor(dayDiff(tmr,start)/7)+1));
    const c=rowsOf(wT).filter(x=>!SP.done[x.ch.id])[0]
          ||rowsOf(Math.min(4,wT+1)).filter(x=>!SP.done[x.ch.id])[0];
    if(c) tmrSubj=c.subj.id;
    tmrTxt=c?`${esc(c.subj.name||'')} · ${esc(stripSubj(c.ch.name,c.subj.name))}${
      leadIds.has(c.ch.id)?' · 續':' · 開章'}`:'照表無排程';
  }
  /* T14b ③四文體：站 04＝數字報表體——右端入帳欄（tabular）＋
     會計式雙細線合計列；合計數字 hover 給 Σ 算式來源。 */
  const hrsToday=rnd1(doneToday.reduce((a,x)=>a+(+x.ch.hours||0),0));
  const sumTip=doneToday.length
    ?`今日入帳＝Σ 今日勾完成章節：${doneToday.map(x=>x.ch.hours).join('+')}＝${hrsToday}h`
    :'今日入帳＝Σ 今日勾完成章節的計畫時數（目前 0 章）';
  const st4=`<section class="stage st-done" id="stn4" aria-label="站 04 · 收工">
    <span class="seat" aria-hidden="true" data-seat="4" data-tip="跳到站 04 收工（鍵盤 4）">04</span>
    <div class="st-in">
      <p class="st-eyebrow eyebrow"><span><b class="st-no">站 04</b> · 收工 WRAP · 今日戰報</span></p>
      <div class="report">
        <div class="rrow"><span class="r-key">章節</span><span class="mono r-desc">${
          doneToday.length?`✓ ${doneToday.length} 章 · ${esc(doneToday.map(x=>stripSubj(x.ch.name,x.subj.name)).join('、'))}`
          :'今日尚未勾完成'}</span><b class="r-val mono">${doneToday.length?`+${hrsToday}h`:'0h'}</b></div>
        <div class="rrow"><span class="r-key">看課</span><span class="mono r-desc">${
          seenToday.length?`${seenToday.length} 集標看完`:''}${
          seenToday.length&&playedToday?' · ':''}${
          playedToday?`${playedToday} 支進度更新`:''}${
          !seenToday.length&&!playedToday?'今日未看課':''}</span><b class="r-val mono">${seenToday.length+playedToday} 支</b></div>
        <div class="rrow"><span class="r-key">複習卡</span><span class="mono r-desc">${
          rvToday?`${rvToday} 張（pass ${rvPass}）`:'今日未複習'}</span><b class="r-val mono">${rvToday} 張</b></div>
        <div class="rrow"><span class="r-key">錯題</span><span class="mono r-desc">累計分佈見站 03</span><b class="r-val mono">✕${missTotal}</b></div>
        <div class="rrow sum"><span class="r-key">合計</span><span class="mono r-desc">今日入帳（勾完成章節之計畫時數）</span>
          <b class="r-val mono" data-tip="${esc(sumTip)}">${hrsToday}h</b></div>
      </div>
      ${/* 學科色＝導航資訊：左脊照 wm-row 的 --c 慣例由明日科目供色（tokens 結構階；-hi 只給進行中） */''}
      <div class="tomorrow"${tmrSubj?` style="--tmr-c:var(--sc-${esc(tmrSubj)})"`:''}>
        <p class="t-lead">明日預告 · ${esc(tmr.slice(5).replace('-','/'))} · 配額 ${per}h</p>
        <p class="t-main">${tmrTxt}</p>
      </div>
    </div></section>`;

  /* ---------- 未燃段 THE UNBURNED ---------- */
  let fut='';
  for(let w=cur+1;w<=4;w++){
    const s=weekSpan(w), h=wmHours(w), rws=rowsOf(w);
    fut+=wfold('w'+w,
      `<b>W${w}</b> · <span class="nwu">${s.a}→${s.b}</span> · ${esc(SP_WEEKS[w-1])} · <span data-tip="${esc(weekSumTip(w))}">排定 ${h.tot}h</span>`,
      miniTksHTML(w),
      rws.map((x,i)=>wmRowHTML(x,i)).join('')||'<div class="wm-empty">這週沒有排章節</div>');
  }
  fut+=`<div class="station">
    <span class="sp-tk st" aria-hidden="true" data-tip="${esc(`第一段終點 · ${dl} · ${all.tot}h 清算`)}"></span>
    <span class="st-t"><b>${esc(dl.slice(5).replace('-','/'))}</b> · 第一段終點 · ${all.tot}h 清算</span>
    <span class="ln" aria-hidden="true"></span></div>`;
  for(const s of (SPRINT_PLAN.subjects||[]).filter(x=>x.phase2)){
    const key='p2-'+s.id;
    const tot=rnd1(s.chapters.reduce((a,c)=>a+(+c.hours||0),0));
    const dnN=s.chapters.filter(c=>SP.done[c.id]).length;
    fut+=wfold(key,
      `<b>${esc(s.label||s.name)}</b> · <span data-tip="${esc(`Σ ${s.chapters.length} 章：${s.chapters.map(c=>c.hours).join('+')}＝${tot}h`)}" class="nwu">${tot}h</span> · <span class="nwu">${dnN}/${s.chapters.length} 章 ✓</span>`,
      s.chapters.slice(0,7).map(c=>`<i data-tip="${esc(`${stripSubj(c.name,s.name)} · ${c.hours}h`)}"></i>`).join(''),
      s.chapters.map((ch,i)=>wmRowHTML({subj:s,ch},i)).join(''));
  }
  const gapN=Math.max(0,dayDiff(exam,dl)-1);
  if(gapN>0) fut+=`<div class="sp-gap" aria-label="摺疊 ${gapN} 夜">
    <p class="g-lab eyebrow">×${gapN} 夜 · ${esc(dl)} → ${esc(exam)} · 摺疊 · 二輪複習＋考古循環${
      trunc?'（脊柱逾 366 夜，遠端截斷顯示）':''}</p></div>`;
  fut+=`<div class="terminus">
    <span class="term-node" aria-hidden="true"></span>
    <span class="tt mono">${esc(exam.slice(5).replace('-','·'))}</span>
    <span class="tm mono">筆試 · D-0 · 脊柱在此燒盡</span></div>`;

  host.innerHTML=`
    <section class="zone z-past" aria-label="已燒的夜"><div class="sp-feed">${past}</div></section>
    <section class="zone z-today" id="tonight" aria-label="今夜"${primary?` data-subj="${esc(primary.subj.id)}"`:''}><div class="sp-feed">${tonightHead}${st1}${st2}${st3}${st4}</div></section>
    <section class="zone z-future" aria-label="未燃的夜"><div class="sp-feed">${fut}</div></section>`;
  rvDock(true);                  // 同一個 #rvSlot 節點搬進站 01（12-review 續用，零改動）
  nblmFill();                    // T17：筆記迴流 markdown 補繪（async，libs 到了就換上）
  bindSpine(host);
}
function bindSpine(host){
  // 章節列＝原地展開（accordion，一次一個）；今夜主章常開不折
  host.querySelectorAll('.wm-row[data-ch]').forEach(b=>b.onclick=()=>{
    if(b.dataset.lead) return;
    if(b.dataset.thr){ spineGoStation(2); return; }   // 路標列：去站 02 看天梯，不開 accordion
    const id=b.dataset.ch;
    WM.sel=(WM.sel===id)?null:id;
    wmSave(); renderStudy();
  });
  host.querySelectorAll('input[data-sp]').forEach(cb=>cb.onchange=()=>{
    const id=cb.dataset.sp;
    if(cb.checked)SP.done[id]=todayStr(); else delete SP.done[id];
    TICK_FLASH=cb.checked?id:null;   // 修訂三：真勾上的那顆才演打勾（取消勾不演）
    spSave(); renderStudy();});
  // 錯題計數：左鍵 +1、右鍵 −1，觸控右滑 +1／左滑 −1（原樣保留）
  host.querySelectorAll('[data-miss]').forEach(el=>{
    const bump=(d,ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      const id=el.dataset.miss;
      SP.miss[id]=Math.max(0,(SP.miss[id]||0)+d);
      if(!SP.miss[id]) delete SP.miss[id];
      if(d>0) MISS_FLASH=id;   // 修訂三：記一筆＝✕ pop 一下
      spSave(); renderStudy();
    };
    el.onclick=e=>bump(1,e);
    el.oncontextmenu=e=>bump(-1,e);
    /* 鍵盤等價入口（ep-mark 同例：button 內的 role=button span 走 keydown）。
       bump 會重繪殺掉焦點，補一發 refocus 讓連按可行 */
    el.onkeydown=e=>{
      if(e.key!=='Enter'&&e.key!==' ') return;
      bump(e.shiftKey?-1:1,e);
      const nx=document.querySelector(`[data-miss="${CSS.escape(el.dataset.miss)}"]`);
      if(nx) nx.focus();
    };
    let x0=null;
    el.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true});
    el.addEventListener('touchend',e=>{
      if(x0===null) return;
      const dx=e.changedTouches[0].clientX-x0; x0=null;
      if(Math.abs(dx)<24) return;
      bump(dx>0?1:-1,e);
    });
  });
  // 摺頁開合活過重繪（details 是原生的，只記帳不重繪）
  host.querySelectorAll('details.wfold').forEach(d=>d.addEventListener('toggle',()=>{
    if(d.open) SPINE_OPEN.add(d.dataset.fold); else SPINE_OPEN.delete(d.dataset.fold);
  }));
  // 三階天梯：記帳方向相反（預設開，所以記的是被收起來的那些）
  host.querySelectorAll('details.r-fold').forEach(d=>d.addEventListener('toggle',()=>{
    if(d.open) RUNG_SHUT.delete(d.dataset.rfold); else RUNG_SHUT.add(d.dataset.rfold);
  }));
  // T17 筆記迴流同款記帳：首次動到才起帳（以預設狀態＝錯題本預開為底）
  host.querySelectorAll('details.nb-note').forEach(d=>d.addEventListener('toggle',()=>{
    if(!NB_OPEN){
      NB_OPEN=new Set();
      for(const s of Object.values(NBLM)) if(s.state==='ok')
        for(const n of s.notes)
          if(String(n.title||'').includes('錯題本')&&String(n.content||'').trim()) NB_OPEN.add(n.id);
    }
    if(d.open) NB_OPEN.add(d.dataset.nbNote); else NB_OPEN.delete(d.dataset.nbNote);
  }));
  host.querySelectorAll('[data-replan]').forEach(b=>b.onclick=()=>openReplan());
  /* T14b：結算差額 → 逐週欠帳分解（開合記在 JS 的 DEBT_OPEN） */
  host.querySelectorAll('[data-debt]').forEach(b=>b.onclick=()=>{
    DEBT_OPEN=!DEBT_OPEN; renderStudy();
  });
  /* T14b：站號水印可點＝跳站（鍵盤 1–4 照舊；水印維持 aria-hidden，
     可聚焦的等價入口是 st-nav 的四顆錨點鈕，不重複佔 tab 序） */
  host.querySelectorAll('.seat[data-seat]').forEach(s=>s.onclick=()=>spineGoStation(+s.dataset.seat));
  /* T14b：重繪後補發一次 scroll，讓捲動敘事（站燈 data-station、脊柱亮段）
     與「今夜」錨立即對位，不必等下一次真捲動 */
  requestAnimationFrame(()=>dispatchEvent(new Event('scroll')));
  // 站 03 → 脊柱上的那一章（開摺頁、展開、捲過去）
  host.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.jump;
    const hit=wmChapters().find(x=>x.ch.id===id);
    if(!hit) return;
    SPINE_OPEN.add(hit.phase2?'p2-'+hit.subj.id:(hit.ch.week===wmCurWeek()?'wcur':'w'+hit.ch.week));
    WM.sel=id; wmSave(); renderStudy();
    const row=document.querySelector(`.wm-row[data-ch="${CSS.escape(id)}"]`);
    if(row) row.scrollIntoView({block:'center'});
  });
  host.querySelectorAll('[data-st-go]').forEach(b=>b.onclick=()=>spineGoStation(+b.dataset.stGo));
  /* T19 科目跳道：站 02 內部換科（站導航仍是鍵盤 1–4；這條不搶 1–4） */
  host.querySelectorAll('[data-subj-go]').forEach(b=>b.onclick=()=>spineGoSubject(b.dataset.subjGo));
  // 展開中的材料（集數／考古題）綁播放、標記、顯示更多
  host.querySelectorAll('.wm-exp').forEach(x=>bindChDetail(x));
  bindFlowX(host);   // 集數 chip 捲道（>8 顆的 .ep-flow 轉橫向滑覽）
  /* 已讀時數變動時讓數字跳一下（自工具列搬進 burnout；真變動才跳） */
  const hrs=document.getElementById('wmHrs');
  if(hrs){
    const now=hrs.textContent;
    if(WM._lastHrs && WM._lastHrs!==now){
      hrs.classList.remove('num-bump');
      void hrs.offsetWidth;
      hrs.classList.add('num-bump');
    }
    WM._lastHrs=now;
  }
  /* ---- 修訂三 #3：一次性互動回饋——旗標在事件裡立、在「那一次」重繪消耗 ---- */
  if(TICK_FLASH){
    const cb=host.querySelector(`input[data-sp="${CSS.escape(TICK_FLASH)}"]:checked`);
    if(cb){
      cb.classList.add('tick-in');
      const row=cb.closest('.wm-row,.ldr-done');
      if(row) row.classList.add('settle-in');
    }
    TICK_FLASH=null;
  }
  if(MISS_FLASH){
    host.querySelectorAll(`[data-miss="${CSS.escape(MISS_FLASH)}"]`)
      .forEach(m=>m.classList.add('miss-pop'));
    MISS_FLASH=null;
  }
  /* 站進場 rise+settle：IO 一站一次（本 session）；重繪先清舊觀察免累積 */
  STAGE_IO.disconnect();
  host.querySelectorAll('.stage[id]').forEach(st=>{
    if(!ST_SEEN.has(st.id)) STAGE_IO.observe(st);
  });
}
function spineGoStation(n){
  const el=document.getElementById('stn'+n);
  if(el) el.scrollIntoView({block:'start',
    behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
/* T19：捲到某一科的天梯（站 02 內部；block:'start' 與 spineGoStation 同一把尺） */
function spineGoSubject(id){
  const el=document.getElementById('ldr-'+id);
  if(el) el.scrollIntoView({block:'start',
    behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
function spineJumpTonight(){
  // 開場落點要「瞬到」：這一跳發生在液態轉場蓋台底下，
  // html 的 scroll-behavior:smooth 會讓它掀幕時還在半路——明寫 instant。
  const t=document.getElementById('tonight');
  if(t) t.scrollIntoView({block:'start',behavior:'instant'});
}

/* ---------- NotebookLM 科目筆記本連結（data/notebooks.json） ----------
   有科目脈絡的三個吊點共用：階03 站名列（「錯題追問」）、章節原地展開的
   分析摘要段、書架頭。url 留空＝該科尚未建本，安靜不現身（不佔位、不提示）。 */
function nbLink(subjId,label){
  const u=NOTEBOOKS?.subjects?.[subjId]?.url;
  if(!u) return '';
  return ` <a class="nb-link mono" href="${esc(u)}" target="_blank" rel="noopener"
    data-tip="開 ${esc(NOTEBOOKS.subjects[subjId].name||subjId)} 的 NotebookLM 筆記本追問">${esc(label||'NotebookLM')} ↗</a>`;
}

/* ---------- T17 筆記迴流（站03）：NotebookLM 筆記快照 ----------
   資料與狀態在 NBLM（03-data.js，nblm_pull.py 落地的 data/nblm/<subj>.json）；
   這裡是純輸出——去框化 details、髮絲線分隔、mono 眉標＝筆記標題；
   錯題本排最前、有內容就預開。markdown 補繪走 nblmFill()
   （ensureLibs→marked→sanitize，與思考地圖同一條路）。 */
function nblmHTML(subj){
  const d=NBLM[subj.id];
  if(!d||d.state!=='ok') return '';
  const isMiss=n=>String(n.title||'').includes('錯題本');
  const notes=[...d.notes].sort((a,b)=>isMiss(b)-isMiss(a));
  const rows=notes.map(n=>{
    // 開合帳在 NB_OPEN（JS 暫態，活過重繪）；沒動過＝預設：錯題本有內容就預開
    const open=NB_OPEN?NB_OPEN.has(n.id)
      :(isMiss(n)&&!!String(n.content||'').trim());
    return `<details class="nb-note" data-nb-note="${esc(n.id)}"${open?' open':''}>
      <summary class="hit"><span class="nb-t">${esc(n.title||'未命名筆記')}</span></summary>
      <div class="nb-body" data-nb-subj="${esc(subj.id)}" data-nb-id="${esc(n.id)}">${esc(n.content||'')}</div>
    </details>`;}).join('');
  /* T19：站03 一科一組（今夜三科的錯題本都要在），眉標帶科名才分得開；
     data-subj 讓 ▸ 記號吃該科結構色，三組不會糊成一團 */
  return `<div class="nb-flow" data-subj="${esc(subj.id)}">
    <p class="st-sub eyebrow"><span>筆記迴流 · ${esc(subj.name||SUBJ_TAG[subj.id]||subj.id)} · NotebookLM${
      d.pulled?` · 更新於 ${esc(d.pulled)}`:''}</span>${nbLink(subj.id,'錯題追問')}</p>
    ${rows}</div>`;
}
/* 補繪：重繪後跑一次，把 .nb-body 原文（pre-wrap 純文字保底）換成
   sanitize(marked) 輸出；內容帶 $ 才啟 KaTeX（renderMap 同款參數）。
   await 期間若又重繪，重查一次 DOM 填的就是新節點，不會填到死節點。 */
async function nblmFill(){
  if(!document.querySelector('.nb-body:not(.md)')) return;
  try{ await ensureLibs(); }catch(e){ console.warn('筆記迴流函式庫載入失敗',e); return; }
  document.querySelectorAll('.nb-body:not(.md)').forEach(el=>{
    const d=NBLM[el.dataset.nbSubj];
    const n=d&&d.state==='ok'&&(d.notes||[]).find(x=>x.id===el.dataset.nbId);
    if(!n) return;
    const src=String(n.content||'');
    el.innerHTML=sanitize(marked.parse(src));
    el.classList.add('md','map-md');
    if(src.includes('$')){
      try{ renderMathInElement(el,{delimiters:[
        {left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],
        throwOnError:false}); }catch(e){ /* KaTeX 缺席不擋文字 */ }
    }
  });
}

/* 集數列只留這一份模板。衝刺分頁與影片庫分頁本來各寫一份，
   結果影片庫那份漏了 data-code，硬碟永遠對不上、還會卡在選檔迴圈。 */
/* 章節名有時已含「電子學：」這種科目前綴。科目在版面上已另外標出來了
   （右欄的眉標、播放器的中繼行），留著就變成「電子學 · 電子學：基本電路學」。
   兩處都會用到，抽成一支。 */
function stripSubj(name,subjName){
  if(!name||!subjName) return name||'';
  const esc=String(subjName).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return String(name).replace(new RegExp('^'+esc+'\\s*[：:]\\s*'),'');
}
/* 集數＝pill 鈕：mono 代號＋標題＋分鐘尾註；看過者淡化＋✓（ep-mark）。
   .map(epRow) 的第二參數 i 餵給 38ms stagger（cap 8，超過整批進）。
   e._chTag（僅「接著看」課序清單掛）＝章節小籤：不改簽名——.map(epRow) 的
   第三參數是整個陣列，加位置參數會被它撞到。 */
function epRow(e,i){
  const k=spNorm(e.code), f=LOCAL[k], onDisk=DISK.has(k);
  const alt=e.alt?' alt':'';          // 114暑重複段：淡化，不是要看的正課
  const s=epState(e.code);
  const tail=s.done?'看過':(s.pct>2?`${s.pct}%`
    :(onDisk?'硬碟':(f?`${f.min} 分`:'VLC')));
  /* T14b：chip 的章節座標 tooltip——回答「這支在章節路徑的哪裡」
     （衝刺展開與影片庫共用；影片庫尤其需要，那裡看不到章節脈絡） */
  const pos=epPos(e.code);
  const tip=pos?`${pos.ch} · 第 ${pos.i}/${pos.n} 集${f?` · ${f.min} 分`:''}${s.done?' · 已看':(s.pct>2?` · 看到 ${s.pct}%`:'')}`:'';
  return `<button class="sp-ep have${alt}${s.done?' seen':''}${!f&&!onDisk?' need':''}"
      type="button"${!f&&!onDisk?' data-need="1"':''} style="--i:${Math.min(i||0,8)}"
      data-play="${esc(f?f.url:'')}" data-code="${esc(e.code)}"${tip?` data-tip="${esc(tip)}"`:''}
      data-name="${esc(e.code+' '+e.title)}">
      ${epMark(e.code)}<b>${esc(e.code)}</b>${e._chTag?`<span class="ep-ch">${esc(e._chTag)}</span>`:''}<span class="tt">${esc(e.title)}</span><i>${e.alt?'備援・':''}${tail}</i></button>`;
}

/* 考古題連結列（校別分組、新→舊、先露 5 份）：chDetailHTML（原地展開）與
   chLadderHTML（階03）共用同一份模板——epRow 單一模板的同一教訓，不准漂移。 */
function exRowsHTML(ex){
  // 年份多的時候只先給最近 5 年，其餘收在「顯示全部」後面
  let hidden=0, withQ=0;
  const html=Object.entries(ex.bySch).map(([sn,arr])=>{
    arr.sort((a,b)=>b[0]-a[0]);
    return `<span class="sp-sch"><b>${esc(sn)}</b>${arr.map(([y,p,qs],i)=>{
      if(i>=5) hidden++;
      if(qs?.length) withQ++;
      // 有題號就標出來，點開考卷直接翻那幾題，不必整份掃
      const label=qs?.length?`${y}<em>第 ${qs.join('、')} 題</em>`:`${y}`;
      const tip=qs?.length?`這份考卷的第 ${qs.join('、')} 大題屬於本章`:'尚未標出題號';
      return `<a class="${i>=5?'old':''} ${qs?.length?'hasq':''}" href="${esc(dataURL('exams/'+p))}"
        target="_blank" rel="noopener"
        data-tip="${esc(tip)}" aria-label="${esc(`${y} 年考卷 · ${tip}`)}">${label}</a>`;
      }).join('')}</span>`;
  }).join('');
  return {html,hidden,withQ};
}
/* 考古題整塊（標頭計數＋題號註＋「顯示較早」）：兩處吊掛共用 */
function exBlockHTML(ex){
  if(!ex.n) return `<div class="wm-blk"><h4>考古題</h4><span class="wm-dsub">${
    TGT.size?'你勾的目標校系裡，這章沒有已收的考卷':'這章沒有對應的已收考卷'}</span></div>`;
  const r=exRowsHTML(ex);
  return `<div class="wm-blk"><h4>考古題 <em>${ex.n} 份</em><span class="h4-end">${
      r.withQ?`${r.withQ} 份已標題號`:'近年在前'}</span></h4>${r.html}
    ${r.withQ?'':'<p class="q-note">年份旁還沒有題號——跑一次 <b>run_redo.bat</b> 讓 NotebookLM 補上「這章是第幾題」，之後點開考卷就能直接翻到那幾題。</p>'}
    ${r.hidden?`<button class="ex-more" type="button" data-exmore>顯示較早的 ${r.hidden} 份</button>`:''}</div>`;
}
/* YouTube 集數列（章節座標 tooltip）：同上，兩處共用 */
function ytRowsHTML(yt,ch,subj){
  return yt.map((v,i)=>`<button class="sp-ep have" type="button" data-yt="${esc(v.id)}"
    style="--i:${Math.min(i,8)}" data-name="${esc(v.lec+' '+v.title)}"
    data-tip="${esc(`${stripSubj(ch.name,subj.name)} · YouTube 第 ${i+1}/${yt.length} 支 · ${v.min} 分`)}">
    <span class="pl">${ICO.tiny}</span><b>${esc(v.lec)}</b><span class="tt">${esc(v.title)}</span><i>${v.min} 分</i></button>`).join('');
}

/* 章節材料（T14）：原 renderWmDetail 的內容邏輯原樣抽成純字串輸出——
   脊柱上任何章節列的原地展開（不帶標頭，列本身就是標頭）。
   T14c：今夜主章不再走這裡（lead 分支退役），改走 chLadderHTML 三階天梯。 */
function chDetailHTML(hit){
  const {subj,ch}=hit, ex=spExamData(subj,ch);
  const eps=VIDEOS?.istudy?.byChapter?.[ch.id]||[];
  const yt=VIDEOS?.byChapter?.[ch.id]||[];
  const ce=VIDEOS?.istudy?.courseCE?.[ch.id];
  const got=eps.filter(e=>LOCAL[spNorm(e.code)]).length;
  const hot=Object.values(ex.years).reduce((a,b)=>a+b,0);
  const yrsHit=Object.keys(ex.years).length;

  return `
    ${(ch.match||[]).length?`<p class="wm-dsub">${TGT.size?`依你勾的 <b>${TGT.size} 個目標校系</b>：`:'八校合計：'}十年裡
      <b>${yrsHit} 個年份</b>考過、共 <b>${hot}</b> 大題。${
      /* 判例 11：SP_STAT 是全卷池寫死常數，不隨目標勾選變——與動態句拆開、
         另起「全科」口徑短句，不准讓「依你勾的」框住它 */
      SP_STAT[subj.id]?`全科：${esc(SP_STAT[subj.id])}。`:''}
      <br>勾完成的標準是<b>該章考古題能動筆</b>，不是影片看完。${nbLink(subj.id)}</p>`
      /* 多益沒有校系考古題，套熱度敘述會變成「0 個年份考過」的無意義句子 */
      :`<p class="wm-dsub">${esc(ch.why||'')}<br>勾完成的標準是<b>該回試題能自己作答並看懂解析</b>，不是影片看完。${nbLink(subj.id)}</p>`}
    ${/* 標題與天梯階01 用同一個詞（「本章集數」）：這裡沒有第二塊要區別，
          但兩處講同一件事卻叫不同名字，讀的人得多做一次對照。
          來源是 iStudy 這件事由底下的「開 iStudy 課程列表 ↗」講就夠了。 */''}
    ${eps.length?`<div class="wm-blk"><h4>本章集數 <em>${got}/${eps.length} 已離線</em></h4>
      <div class="ep-flow">${eps.map(epRow).join('')}</div>
      ${ce?`<a class="sp-open" href="https://istudy.way-to-win.com/cloud/video_main.php?ce=${encodeURIComponent(ce)}"
        target="_blank" rel="noopener">開 iStudy 課程列表 ↗</a>`:''}</div>`:''}
    ${yt.length?`<div class="wm-blk"><h4>YouTube <em>${yt.length} 支</em></h4><div class="ep-flow">${ytRowsHTML(yt,ch,subj)}</div></div>`:''}
    ${exBlockHTML(ex)}`;
}

/* ---------- T14c R 灌注：三階天梯（ADR-0008 T14c；river.html port） ----------
   站02 主章的材料改鑄「範例→半完成→自解」三座全寬出血巨編號站台——
   讀書法（docs/study-rules.html 的 fading 三階）即頁面地形：
   階01 集數掛此（看課＝讀範例，看過的 chip 自己暗下去）＋時數讀數；
   階02 沒有數位資料——誠實呈現規則本身（遮後半自補／卡 4 分鐘／一次只掀
   一步），動作＝錯題計數（寫題之處就是錯題發生之處），不造假進度；
   階03 考古題連結＋「不看解做出 2 題＝完成」＋完成勾（使用者律法：
   勾完成的標準是能動筆——所以終點站在自解）。
   解鎖只是視覺（前一階有動靜才點亮下一階），永不阻擋任何操作。
   狀態照舊全在 JS/localStorage：勾＝input[data-sp]、✕＝[data-miss]，
   與章節列同一組 bindSpine 綁定，feb-sprint-v1 shape 一位元組不動。 */
/* 電子學使用者裁決（2026-09-01）：「就還是按照她影片的順序觀看」——
   階01 的集數不照衝刺章節分組，照老師課程的集數代號順序跨章連看。
   課序與影片庫同源（MANIFEST 系列清單、LIB_HIDE 同樣尊重），再以
   byChapter 對回衝刺章節——備援旗標、標題、章節座標才會跟著走；
   沒有 manifest（離線退化）就退回 byChapter 聯集：只留非備援、取主課程
   前綴（集數最多者），不讓 114 備援集插隊到課序前頭。
   排序＝代號自然序（同課程前綴＝數字尾自然序，與影片庫同一把尺）。 */
function courseOrderEps(subjId){
  const byCode=new Map();               // spNorm code → {e,ch}（衝刺章序首見優先；115暑電子10 跨兩章取 mos-dc）
  for(const {subj,ch} of wmChapters()){
    if(subj.id!==subjId) continue;
    for(const e of (VIDEOS?.istudy?.byChapter?.[ch.id]||[])){
      const k=spNorm(e.code);
      if(!byCode.has(k)) byCode.set(k,{e,ch});
    }
  }
  const pre=LIB_SUBJ.find(s=>s.id===subjId)?.pre;
  let list=pre?(MANIFEST||[]).filter(m=>m.series.startsWith(pre)&&!LIB_HIDE.has(m.series))
    .map(m=>byCode.get(spNorm(m.code))||{e:m,ch:null}):[];
  if(!list.length){
    const main=[...byCode.values()].filter(x=>!x.e.alt);
    const cnt={}; let top='';
    for(const x of main){
      const p=spNorm(x.e.code).replace(/\d+[A-Za-z]*$/,'');
      cnt[p]=(cnt[p]||0)+1; if(cnt[p]>(cnt[top]||0)) top=p;
    }
    list=main.filter(x=>spNorm(x.e.code).replace(/\d+[A-Za-z]*$/,'')===top);
  }
  return list.sort((a,b)=>spNorm(a.e.code).localeCompare(spNorm(b.e.code),'zh-Hant',{numeric:true}));
}
function chLadderHTML(hit){
  const {subj,ch}=hit, ex=spExamData(subj,ch);
  const eps=VIDEOS?.istudy?.byChapter?.[ch.id]||[];
  const yt=VIDEOS?.byChapter?.[ch.id]||[];
  const ce=VIDEOS?.istudy?.courseCE?.[ch.id];
  const got=eps.filter(e=>LOCAL[spNorm(e.code)]).length;
  const w=watchOf(ch);
  const dn=!!SP.done[ch.id], miss=SP.miss[ch.id]||0;
  const hasMatch=(ch.match||[]).length>0;
  const doneAt=dn?String(SP.done[ch.id]).slice(5).replace('-','/'):'';
  /* 解鎖視覺：階01 有動靜（看過任何一點）亮階02；階02 有動靜（記過 ✕
     或章已完成）亮階03——glyph＋文字讀數雙訊號，不 color-alone */
  const act1=dn||!!(w&&w.frac>0.005);
  const act2=dn||miss>0;
  /* 修訂三：階解鎖 crossfade——同一章、上次渲染還 dim、這次亮了才演 flare
     （換章或重整不演；前態是 UI 暫態，不落地） */
  const prevLit=LADDER_LIT.get(ch.id);
  const lit2=!!prevLit&&act1&&!prevLit.a1;
  const lit3=!!prevLit&&act2&&!prevLit.a2;
  LADDER_LIT.set(ch.id,{a1:act1,a2:act2});
  const w1st=w?(w.frac>=0.995?'✓ 全部看完':(w.frac>0.005?`▶ 已看 ${Math.round(w.frac*100)}%`:'○ 未開始')):'';
  const w1hr=ch.watch?`影片 ${rnd1(ch.watch*2)}h · 2× ≈ ${ch.watch}h`:`${ch.hours}h`;
  const hot=Object.values(ex.years).reduce((a,b)=>a+b,0);
  const yrsHit=Object.keys(ex.years).length;

  const head=`<div class="wm-dh">
      <span class="d-sup">${esc(subj.name||SUBJ_TAG[subj.id]||subj.id)}</span>
      <h3>${esc(stripSubj(ch.name,subj.name))}</h3>
      <span class="tag">${ch.hours}h</span>
      ${w?`<span class="tag">影片 ${Math.round(w.frac*100)}%</span>`:''}
      ${dn?'<span class="tag">已完成</span>':''}</div>`;
  /* 摘要只留考點統計；「勾完成的標準」那一句搬家到階03——律法住在它的站台上 */
  const dsub=hasMatch?`<p class="wm-dsub">${TGT.size?`依你勾的 <b>${TGT.size} 個目標校系</b>：`:'八校合計：'}十年裡
      <b>${yrsHit} 個年份</b>考過、共 <b>${hot}</b> 大題。${
      SP_STAT[subj.id]?`全科：${esc(SP_STAT[subj.id])}。`:''}</p>`
    :`<p class="wm-dsub">${esc(ch.why||'')}</p>`;

  /* 階01 集數塊＝**兩塊**，各回答一個不同的問題：
       「本章集數」  這一章真正對應的集數 → 這章要看哪幾支
       「接著看」    全科課序裡還沒看的   → 接下來該播哪一支
     為什麼要拆（使用者判例 2026-09-03）：舊版對電子學把整塊換成全科課序，
     於是標題寫「MOSFET 特性與偏壓 · 80%」的卡片底下列出電子24～27（OP、回授）
     ——「讀起來就像在說這些是 MOSFET 的影片，而它們不是」。課序本身是使用者
     要的（「就還是按照她影片的順序觀看」），錯的是把它冒充成本章內容。

     兩塊互斥：接著看扣掉本章已列出的代號。不扣的話，正在讀的那一章會上下
     出現兩排一模一樣的 chip，看起來就像壞掉。
     也不再只給電子學——線代一樣有課序，兩科行為不一致本身就是 bug。 */
  const chCodes=new Set(eps.map(e=>spNorm(e.code)));
  const openList=ce?`<a class="sp-open" href="https://istudy.way-to-win.com/cloud/video_main.php?ce=${encodeURIComponent(ce)}"
      target="_blank" rel="noopener">開 iStudy 課程列表 ↗</a>`:'';
  const blks=[];
  if(eps.length) blks.push(`<div class="wm-blk"><h4>本章集數 <em>${got}/${eps.length} 已離線</em></h4>
        <div class="ep-flow">${eps.map(epRow).join('')}</div></div>`);
  const seq=courseOrderEps(subj.id)
    .filter(x=>!epState(x.e.code).done&&!chCodes.has(spNorm(x.e.code)));
  if(seq.length){
    const rows=seq.map((x,i)=>epRow(x.ch?{...x.e,_chTag:stripSubj(x.ch.name,subj.name)}:x.e,i));
    /* >8 支＝bindFlowX 會轉橫向捲道：全列進同一條、「顯示更多」退場
       （捲動即瀏覽）；≤8 支照舊 6＋顯示更多 直排換行 */
    const one=rows.length>8;
    const rest=one?[]:rows.slice(6);
    blks.push(`<div class="wm-blk"><h4>接著看 <em>全科課序 · 不限本章</em><span class="h4-end">未看 ${seq.length} 集</span></h4>
        <div class="ep-flow">${(one?rows:rows.slice(0,6)).join('')}</div>
        ${rest.length?`<div class="ep-flow" data-epmore-rest hidden>${rest.join('')}</div>
        <button class="ex-more" type="button" data-epmore>顯示更多 ${rest.length} 集</button>`:''}</div>`);
  }
  /* iStudy 課程列表連結只出現一次，掛在最後一塊的尾巴（它是「這一科的入口」，
     不屬於任何一塊；獨立成塊會多一個沒有標題的空殼） */
  if(blks.length&&openList) blks[blks.length-1]=blks[blks.length-1].replace(/<\/div>$/,openList+'</div>');
  const epBlk=blks.join('');
  /* 三階可收合（使用者判例 2026-09-03：「為什麼我截圖的部分都不能收納起來」）。
     摺頁做在 .r-body **內側**，不是把 .rung 換成 <details>：階序號與本體是
     .rung 這個 grid 的兩欄，換掉外殼等於連版面一起重排，風險遠大於收益。
     階名（範例／半完成／自解）本身就是 summary——它已經是這一階的標題，
     再加一條「收合」控制項只是多一個要解釋的東西。
     記的是**被收起來的**而不是被打開的：空集合＝全開，新章節不會莫名闔上。 */
  const rung=(num,label,key,nameHTML,bodyHTML,cls='')=>`
    <section class="rung${cls}" aria-label="${label}">
      <span class="r-num" aria-hidden="true">${num}</span>
      <div class="r-body">
        <details class="r-fold" data-rfold="${esc(key)}"${RUNG_SHUT.has(key)?'':' open'}>
          <summary class="r-name">${nameHTML}</summary>
          ${bodyHTML}
        </details>
      </div></section>`;
  const rung1=rung('01','階 01 範例','r1-'+ch.id,
    `範例<span class="en">EXAMPLE</span><span class="r-read mono">${
      w1st?esc(w1st)+' · ':''}${esc(w1hr)}</span>`,
    `<p class="r-law">跟著影片算一遍，<b>手要動</b>。播到例題先暫停自己做；推導段 2× 不停。
        過關：整題能重寫一次（卡住 3 分鐘＝放行看下一步）。</p>
      ${epBlk}
      ${yt.length?`<div class="wm-blk"><h4>YouTube <em>${yt.length} 支</em></h4><div class="ep-flow">${ytRowsHTML(yt,ch,subj)}</div></div>`:''}
      ${!epBlk&&!yt.length?'<p class="r-law">這章沒有對應影片——直接跟講義範例動手抄一遍。</p>':''}`);
  const rung2=rung('02','階 02 半完成','r2-'+ch.id,
    `半完成<span class="en">HALF-FADED</span><span class="r-read mono">${
      miss?`✕${miss} 已記`:'紙上作業 · 無數位資料'}</span>`,
    `<p class="r-law">找同型題，<b>遮住後半段</b>自己補完；或把例題數字換掉重算。
        過關：後半段不看解能補完。</p>
      <p class="r-law">卡住 4 分鐘才看下一步 · 解答<b>一次只掀一步</b>，看完蓋回去自己往下推。</p>
      <div class="r-act">
        <span class="miss mono ${miss?'has':''}" data-miss="${esc(ch.id)}"
          role="button" tabindex="0" aria-label="錯題 ${miss} 題（Enter 加一、Shift+Enter 減一）"
          data-tip="寫題錯幾題就點幾下（右鍵減一；鍵盤 Enter 加一、Shift+Enter 減一）">${miss?'✕'+miss:'✕'}</span>
        <span class="r-hint mono">寫題之處＝錯題發生之處——錯了就點 ✕，它會迴流到站 03</span>
      </div>`,
    act1?(lit2?' lit-in':''):' dim');
  const rung3=rung('03','階 03 自解','r3-'+ch.id,
    `自解<span class="en">SOLO</span>${nbLink(subj.id,'錯題追問')}<span class="r-read mono">${
      dn?`✓ ${esc(doneAt)} 章完`:'○ 未完成'}</span>`,
    `<p class="r-law">${hasMatch
        ?'白紙重解考古題，從讀題到答案。過關：<b>不看解做出 2 題</b>＝本章完成（卡住 5 分鐘只看第一步）。'
        :'過關：<b>該回試題能自己作答並看懂解析</b>＝本章完成，不是影片看完。'}</p>
      ${exBlockHTML(ex)}
      <label class="ldr-done hit${dn?' on':''}">
        <input type="checkbox" data-sp="${esc(ch.id)}" ${dn?'checked':''}
          aria-label="標記本章完成（標準：該章考古題能動筆）"
          data-tip="勾完成的標準：該章考古題能動筆，不是影片看完">
        <span>本章完成${dn?` · ${esc(doneAt)}`:''}</span>
      </label>`,
    act2?(lit3?' lit-in':''):' dim');

  return head+dsub
    +`<div class="ladder" role="group" aria-label="三階天梯：範例、半完成、自解">${rung1}${rung2}${rung3}</div>`
    +'<p class="ldr-law mono">天梯是地形不是進度條：亮起只代表上一階有動靜，路永遠是通的。</p>';
}
/* 集數 chip 橫向滑覽（使用者判例：「畫面寬度不夠時希望能很好滑動去閱覽」）：
   同一條 .ep-flow 超過 8 顆＝從換行改成單列捲道——scroll-snap 靠站、
   動量捲、藏捲軸＋兩端 edge-fade（ov-shell 考卷表同款訊號，改用 mask
   做在捲道本體，色場上也不穿幫）；桌機垂直滾輪懸停轉橫向（到頭放行，
   不劫持頁面捲動）；chip 本來就可聚焦——focus 進來自動捲入視野。
   ≤8 顆照舊 wrap 換行（過去章 accordion 的小清單不受影響）。 */
function bindFlowX(scope){
  scope.querySelectorAll('.ep-flow').forEach(fl=>{
    /* data-rail=1（T16 書架）＝無論幾顆都走捲道；其餘照舊 >8 顆才轉 */
    if(fl.dataset.rail!=='1'&&fl.querySelectorAll('.sp-ep').length<=8) return;
    fl.classList.add('flow-x');
    const upd=()=>{
      const maxX=fl.scrollWidth-fl.clientWidth;
      fl.classList.toggle('fade-r',maxX>1&&fl.scrollLeft<maxX-1);
      fl.classList.toggle('fade-l',fl.scrollLeft>1);
    };
    fl.addEventListener('scroll',()=>{
      upd();
      if(!EP_HINT_SEEN&&fl.scrollLeft>4){   // 第一次真的滑動＝提示退場（全頁一起）
        EP_HINT_SEEN=true;
        document.querySelectorAll('.fx-hint').forEach(h=>h.remove());
      }
    },{passive:true});
    upd();
    fl.addEventListener('wheel',e=>{
      if(!e.deltaY||e.deltaX) return;                 // 觸控板橫掃交給原生
      const maxX=fl.scrollWidth-fl.clientWidth;
      if(maxX<=1) return;
      if((e.deltaY<0&&fl.scrollLeft<=0)||(e.deltaY>0&&fl.scrollLeft>=maxX-1)) return;
      e.preventDefault();
      fl.scrollLeft+=e.deltaY;
    },{passive:false});
    fl.addEventListener('focusin',e=>{
      const t=e.target.closest('.sp-ep');
      if(t) t.scrollIntoView({block:'nearest',inline:'nearest'});
    });
    const hint=()=>{
      if(EP_HINT_SEEN) return;
      const nx=fl.nextElementSibling;
      if(nx&&nx.classList.contains('fx-hint')) return;
      if(fl.scrollWidth>fl.clientWidth+8)
        fl.insertAdjacentHTML('afterend','<span class="fx-hint mono" aria-hidden="true">⟵ 滑動 ⟶</span>');
    };
    /* bind 當下捲道可能藏在還沒顯示的視圖／摺頁裡（clientWidth 0）——
       fade 與提示的初算交給 ResizeObserver：一露面（進 study、開摺頁、
       視窗改寬）就補算；節點隨重繪丟棄，observer 一起被回收 */
    hint();   // bind 當下就可見的常態路徑：不等 RO（隱藏分頁的 RO 會延後到重新可見）
    new ResizeObserver(()=>{ upd(); hint(); }).observe(fl);
  });
}
function bindChDetail(host){
  host.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>
    epClick(b));
  bindMarks(host);
  host.querySelectorAll('[data-yt]').forEach(b=>b.onclick=()=>openYT(b.dataset.yt,b.dataset.name));
  const more=host.querySelector('[data-exmore]');
  if(more) more.onclick=()=>{
    // 只展開這一份材料裡收起的年份——頁上可能同時有多份展開材料
    host.querySelectorAll('.sp-sch').forEach(s=>s.classList.add('all'));
    more.remove();
  };
  /* 「接著看」課序的顯示更多：掀開收起的後段（與 ex-more 同款靜默展開；
     重繪即收回——與考卷年份展開同一套 UI 暫態語意，不落地） */
  const em=host.querySelector('[data-epmore]');
  if(em) em.onclick=()=>{
    const rest=host.querySelector('[data-epmore-rest]');
    if(rest) rest.hidden=false;
    em.remove();
  };
}

/* ---------- 影片庫（同一套主從版面） ---------- */
const LIB_SUBJ=[
  {id:'elec', name:'電子學',   pre:'電子學/'},
  {id:'math', name:'工程數學', pre:'工數/'},
  {id:'la',   name:'線性代數', pre:'線代/'},
  {id:'toeic',name:'多益',     pre:'多益/'},
];
// 使用者 2026-08-17 指定不在側欄列出的系列（檔案照抓，只是不顯示）
const LIB_HIDE=new Set(['電子學/114暑電子']);
let MANIFEST=null;
async function loadManifest(){
  /* manifest.json 住在媒體伺服器的根目錄（不在 data/ 底下，也就不在雲端部署裡）。
     雲端模式直接收攤：影片庫那一段少掉離線系列，只留 YouTube 那組（VIDEOS 來自
     /data/videos.json，雲端讀得到），而不是對兩個必死的網址各打一次。 */
  /* 雲端模式改讀 Drive 帳本（driveManifest，14-drive.js）。
     舊寫法是 `MANIFEST=[]; return;`——直接收攤，於是 libGroups() 只剩
     VIDEOS.byChapter 那組 YouTube，而只有自動控制有 YouTube 影片。
     使用者 2026-09-04 回報「影片庫就只有控制的，且影片一樣只會跳轉到 yt」，
     就是這一行造成的：影片明明已經有 45 支在 Drive 上，庫裡卻看不到。
     帳本讀不到（還沒上雲、或 client 未設定）就照舊空手，不假裝有東西。 */
  if(CLOUD){
    MANIFEST = typeof driveManifest==='function'
      ? await driveManifest().catch(()=>[]) : [];
    return;
  }
  for(const base of [MEDIA_BASE,'../media/']){
    try{
      const m=await fetch(base+'manifest.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw 0;return r.json();});
      MANIFEST=m.episodes||[]; return;
    }catch(e){}
  }
  MANIFEST=[];
}
function libGroups(){
  const out=[];
  for(const s of LIB_SUBJ){
    const eps=(MANIFEST||[]).filter(e=>e.series.startsWith(s.pre));
    if(!eps.length) continue;
    const bySer={};
    for(const e of eps)(bySer[e.series]??=[]).push(e);
    for(const [ser,list] of Object.entries(bySer)){
      if(LIB_HIDE.has(ser)) continue;
      list.sort((a,b)=>a.code.localeCompare(b.code,'zh-Hant',{numeric:true}));
      out.push({key:ser,subj:s.name,label:ser.split('/')[1],eps:list,
        got:list.filter(e=>LOCAL[spNorm(e.code)]).length});
    }
  }
  const yt=VIDEOS?.byChapter;
  if(yt){
    const seen=new Set(),list=[];
    for(const arr of Object.values(yt))for(const v of arr)
      if(!seen.has(v.id)){seen.add(v.id);list.push(v);}
    list.sort((a,b)=>a.lec.localeCompare(b.lec,'en',{numeric:true}));
    out.push({key:'yt-ctrl',subj:'自動控制',label:'T Video（YouTube）',yt:list,got:0,eps:list});
  }
  return out;
}
const LIB_SUBJ_ID={'電子學':'elec','工程數學':'math','線性代數':'la','多益':'toeic','自動控制':'ctrl'};
/* ---------- T16 課程書牆（使用者裁決 2026-09-01：「為什麼我的影片庫沒有
   大膽的設計」——T05 決策 E 的母版-明細豁免撤銷）----------
   資料與行為原封：libGroups／WM.libSel 續留／epRow 播放路徑／bindMarks
   一位元組不動，只重鑄呈現。書脊＝直書系列名＋科目短籤眉標＋左緣
   離線量尺（結構色）與已看燒線（ember，衝刺脊柱燃線同宗）；
   點書脊＝集數在下方全寬書架以 T15 chip 捲道（.flow-x）攤開，
   書脊序號沉為站號尺度水印。 */
/* 一支系列看了多少：手動標記優先、播放進度補位（epState 同一把尺）。
   YouTube 系列無 epState 資料，誠實回 0（不畫燒線，不造假）。 */
function libWatch(g){
  if(g.yt||!g.eps.length) return 0;
  let s=0;
  for(const e of g.eps){ const st=epState(e.code); s+=st.done?1:(st.pct>2?st.pct/100:0); }
  return Math.min(1,s/g.eps.length);
}
function renderLibList(host){
  const gs=libGroups();
  if(!gs.length){host.innerHTML=`<div class="wm-empty">${
    CLOUD?'雲端模式沒有影片庫——課程檔案留在家裡的外接硬碟':'還沒有影片資料'}</div>`;return;}
  if(!WM.libSel||!gs.some(g=>g.key===WM.libSel)) WM.libSel=gs[0].key;
  /* 書脊讀數紀律照舊：離線狀態走 status token＋glyph＋「離線」文字，
     不 color-alone；量尺 --off／--burn 是量值（0–1），不是裝飾 */
  host.innerHTML=gs.map((g,i)=>{
    const subjId=g.yt?'ctrl':(LIB_SUBJ_ID[g.subj]||'');
    const full=!g.yt&&g.got===g.eps.length, none=!g.yt&&!g.got;
    const off=g.yt?0:(g.eps.length?g.got/g.eps.length:0);
    const w=libWatch(g);
    const tip=`${g.subj} · ${g.label} · ${g.eps.length} 集`
      +(g.yt?' · 線上觀看':` · 已離線 ${g.got}/${g.eps.length}`)
      +(w>0.005?` · 已看 ${Math.round(w*100)}%`:'');
    return `<button class="lib-spine${g.key===WM.libSel?' on':''}" type="button"
      data-lib="${esc(g.key)}" data-subj="${esc(subjId)}"
      style="--i:${Math.min(i,8)};--off:${off.toFixed(3)};--burn:${w.toFixed(3)}"
      data-tip="${esc(tip)}" aria-label="${esc(tip)}。點開集數書架">
      <span class="gauge" aria-hidden="true"><i class="g-off"></i><i class="g-burn"></i></span>
      <span class="sub mono">${esc(SUBJ_TAG[subjId]||g.subj)}</span>
      <span class="nm2">${esc(g.label)}</span>
      <span class="lib-st ${g.yt?'':(full?'good':none?'none':'part')}">${
        g.yt?`${g.eps.length} 支`:`${full?'✓ ':''}${g.got}/${g.eps.length}`}<u>${g.yt?'線上':'離線'}</u></span>
    </button>`;
  }).join('');
  host.querySelectorAll('[data-lib]').forEach(b=>b.onclick=()=>{
    WM.libSel=b.dataset.lib; wmSave(); renderStudy();});
}
function renderLibDetail(host){
  const gs=libGroups();
  const g=gs.find(x=>x.key===WM.libSel);
  if(!g){host.innerHTML='<div class="wm-empty">書牆上點一支書脊</div>';return;}
  const no=String(gs.indexOf(g)+1).padStart(2,'0');
  const subjId=g.yt?'ctrl':(LIB_SUBJ_ID[g.subj]||'');
  const mins=g.yt?g.eps.reduce((s,v)=>s+(v.min||0),0)
                 :g.eps.reduce((s,e)=>s+(LOCAL[spNorm(e.code)]?.min||0),0);
  const w=libWatch(g);
  const rows=g.yt
    ? g.eps.map((v,i)=>`<button class="sp-ep have" type="button" data-yt="${esc(v.id)}"
        style="--i:${Math.min(i,8)}" data-name="${esc(v.lec+' '+v.title)}">
        <span class="pl">${ICO.tiny}</span><b>${esc(v.lec)}</b><span class="tt">${esc(v.title)}</span><i>${v.min} 分</i></button>`).join('')
    : g.eps.map(epRow).join('');
  host.dataset.subj=subjId;
  host.innerHTML=`
    <span class="shelf-seat" aria-hidden="true">${no}</span>
    <div class="wm-dh">
      <span class="d-sup">${esc(g.subj)} · 書脊 ${no}/${String(gs.length).padStart(2,'0')}</span>
      <h3>${esc(g.label)}</h3>
      <span class="tag">${g.eps.length} 集</span>
      ${w>0.005?`<span class="tag">已看 ${Math.round(w*100)}%</span>`:''}</div>
    <p class="wm-dsub">${g.yt?`線上觀看，約 ${Math.round(mins/60)} 小時。`
      :`<b>${g.got}/${g.eps.length}</b> 已離線${mins?`（約 ${Math.round(mins/60)} 小時）`:''}。
        ${MEDIA_SEEKABLE?'離線檔預設 2 倍速、可拖曳快轉。'
          :(CLOUD?'雲端模式的影片走 VLC：點集數會開隨播面板給檔名與章節時間。'
                 :'<b>媒體伺服器未啟動</b>，離線檔無法拖曳。')}`}${nbLink(subjId)}</p>
    <div class="wm-blk"><div class="ep-flow" data-rail="1">${rows}</div></div>`;
  host.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>
    epClick(b));
  /* T Video chip 的播放入口：與原地展開同一把 openYT——
     可點的東西必須有回饋（判例 7），書架上的 YT chip 不能是死鈕 */
  host.querySelectorAll('[data-yt]').forEach(b=>b.onclick=()=>openYT(b.dataset.yt,b.dataset.name));
  bindMarks(host);
  bindFlowX(host);   // data-rail=1：書架一律走 T15 捲道（snap＋edge-fade＋滾輪轉橫）
}


/* ============ 隨播面板（影片在 VLC，教材在這裡） ============
   iOS 的 Safari 播不了外接硬碟的大檔——file input 一定會實體複製進裝置
   （WebKit WKFileUploadPanel.mm，Import 與 Open 兩種模式都複製），
   3GB 的可用空間裝不下 86GB 的課程。原生播放器有安全範圍存取權，
   直接讀硬碟不複製，所以影片交給 VLC，這個面板負責交接與教材。 */
function tsText(s){
  s=Math.max(0,Math.round(s||0));
  const h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60;
  return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(x).padStart(2,'0');
}
async function copyText(s,okMsg){
  try{ await navigator.clipboard.writeText(s); toastMsg(okMsg||'已複製'); }
  catch(e){
    // iOS 在非使用者手勢或無權限時會擋，退回選取讓人自己長按複製
    const ta=document.createElement('textarea');
    ta.value=s; ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta);
    ta.select();
    try{ document.execCommand('copy'); toastMsg(okMsg||'已複製'); }
    catch(e2){ toastMsg('複製失敗，請長按選取'); }
    ta.remove();
  }
}
function openCompanion(code,name){
  const k=spNorm(code);
  let m=document.getElementById('cpModal');
  if(!m){
    m=document.createElement('div'); m.id='cpModal'; m.className='modal';
    document.body.appendChild(m);
    m.addEventListener('click',ev=>{
      if(ev.target.closest('[data-cpclose]')) return closeCompanion();
      const dv=ev.target.closest('[data-drive]');
      if(dv) return void driveCompanionClick(dv.dataset.drive,dv.dataset.code,dv.dataset.name);
      const cp=ev.target.closest('[data-copy]');
      if(cp) return copyText(cp.dataset.copy,cp.dataset.msg||'已複製');
    });
  }
  /* 檔名從快取的 state.json 反推（diskHintFor）。雲端模式沒有那份快取，
     退回集數代號——VLC 的搜尋框吃得下它，而且那正是檔名裡的那一段。
     不留「（電腦上沒有這一支的紀錄）」當可複製內容：按下去複製一句廢話比沒有按鈕還糟。 */
  const hint=diskHintFor(code), file=hint||spNorm(code)||code;
  const fileLb=hint?'在 VLC 開這個檔案':'在 VLC 搜尋這個代號';
  m.innerHTML=`<div class="modal-back" data-cpclose></div>
    <div class="modal-panel glass cp-panel">
      <button class="modal-x lq" type="button" data-cpclose aria-label="關閉">✕</button>
      <h3 class="cp-h">${esc(name||code)}</h3>
      <div class="cp-file">
        <span class="cp-lb">${esc(fileLb)}</span>
        <code>${esc(file)}</code>
        <button class="lq gold sm" type="button" data-copy="${esc(file)}"
          data-msg="已複製，到 VLC 貼上搜尋">${hint?'複製檔名':'複製代號'}</button>
      </div>
      ${CLOUD?(driveCompanionHTML(code,name)||`<p class="cp-none">雲端模式不供應影片——課程留在家裡的外接硬碟。
        用 VLC 從硬碟開這一支，這裡負責交接與教材。</p>`):''}
      <div id="cpChap"></div>
      <div id="vidMap" hidden></div>
    </div>`;
  m.classList.add('on');
  document.body.classList.add('modal-open');
  notesReset();
  const asset=LOCAL[k]?.url||'';
  if(asset) loadNotes(asset).then(()=>renderCpChapters(code));
  else renderCpChapters(code);
}
function closeCompanion(){
  const m=document.getElementById('cpModal');
  if(!m) return;
  m.classList.remove('on'); m.innerHTML='';
  document.body.classList.remove('modal-open');
  notesReset();
}
/* 章節與重點：VLC 不知道我們的章節，所以時間要能一眼看到、一點就複製 */
function renderCpChapters(code){
  const box=document.getElementById('cpChap');
  if(!box) return;
  const ch=NOTES?.chapters||[], keys=NOTES?.keys||[];
  if(!ch.length&&!keys.length){
    /* 思考地圖是影片旁邊的 .notes.json，跟著影片留在硬碟上——雲端讀不到不是「還沒產生」。
       兩件事給同一句話，下次就會有人去找根本不存在的那個檔。 */
    box.innerHTML=`<p class="cp-none">${CLOUD
      ?'雲端讀不到思考地圖——它跟影片放在一起，在家裡的硬碟上。'
      :'這一支還沒有思考地圖。'}</p>`;
    return;
  }
  const rows=ch.map(c=>`<button class="cp-row" type="button"
      data-copy="${esc(tsText(c.t))}" data-msg="時間 ${esc(tsText(c.t))} 已複製">
      <span class="cp-t">${esc(tsText(c.t))}</span>
      <span class="cp-n">${esc(c.title||'')}</span></button>`).join('');
  const hot=keys.slice(0,40).map(x=>`<button class="cp-row key" type="button"
      data-copy="${esc(tsText(x.a))}" data-msg="時間 ${esc(tsText(x.a))} 已複製">
      <span class="cp-t">${esc(tsText(x.a))}</span>
      <span class="cp-n">${esc(x.why||'')}</span></button>`).join('');
  box.innerHTML=(ch.length?`<h4 class="cp-sh">章節（點一下複製時間）</h4>
      <div class="cp-list">${rows}</div>`:'')
    +(hot.length?`<h4 class="cp-sh">重點段落</h4>
      <div class="cp-list">${hot}</div>`:'');
}

/* 有期限的事情自己跳出來——多益報名這種錯過就沒了的，不能靠記得 */
function renderTodo(){
  const box=document.getElementById('wmTodo');
  if(!box) return;
  // 做完的不再佔位置；沒期限的排最後，其餘照剩餘天數由急到緩
  const list=((SPRINT_PLAN?.todo)||[]).filter(t=>!t.done).map(t=>({
    ...t, left:t.by?dayDiff(t.by,todayStr()):null,
  })).sort((a,b)=>(a.left??9999)-(b.left??9999));
  if(!list.length){ box.hidden=true; return; }

  /* 急迫度＝status token 上色＋文字（「剩 N 天」本身就是文字訊號，永不 color-alone） */
  const cw=t=>({cls:t.left===null?'':(t.left<=7?'urgent':t.left<=21?'soon':''),
    when:t.left===null?'待辦'
      :(t.left<0?`已過期 ${-t.left} 天`:t.left===0?'今天':`剩 ${t.left} 天`)});
  const row=t=>{
    const {cls,when}=cw(t);
    return `<li class="${cls}"><span class="d mono">${esc(when)}</span>
      <span class="tt"><b>${esc(t.title)}</b><span>${esc(t.why||'')}${
        t.how?`　→ ${esc(t.how)}`:''}</span></span></li>`;
  };

  const HEAD=1;                       // 只露最急的一件，其餘收起（去框化：一條線，不是一張卡）
  const top=list[0], rest=list.slice(HEAD);
  const open=localStorage.getItem(TODO_LS)==='1';
  const {cls,when}=cw(top);
  box.innerHTML=`<div class="todo-line">
      <span class="eyebrow" data-tip="要你動手的事；其餘我這邊會自己跑">TD · 待辦</span>
      <b class="t-title">${esc(top.title)}</b>
      <span class="t-why">${esc(top.why||'')}${top.how?`　→ ${esc(top.how)}`:''}</span>
      <span class="t-due mono ${cls}">${esc(when)}</span>
    </div>`
    + (rest.length?`<details class="todo-more"${open?' open':''}>
        <summary>還有 ${rest.length} 件</summary>
        <ul>${rest.map(row).join('')}</ul>
      </details>`:'');
  // <details> 自己會開合，但 renderStudy() 重繪會把狀態沖掉，所以記起來
  const d=box.querySelector('details');
  if(d) d.addEventListener('toggle',()=>localStorage.setItem(TODO_LS,d.open?'1':'0'));
  box.hidden=false;
}
const TODO_LS='feb-todo-open';
/* 判例 11＋9：hero 敘事隨 WM.view 換稿——影片庫底下沒有脊柱四站、鍵盤 1–4 也不動作，
   衝刺句只在衝刺視圖出現。衝刺原句取自 index.html（單一事實來源，開站時抄一份）。 */
let NOTE_SPRINT=null;
const NOTE_LIB='影片庫＝課程書牆：一系列一支書脊，脊上細線是<b>已離線量</b>、'
  +'餘燼線是<b>已看進度</b>；點書脊，集數在下方書架攤開、點集數即播；'
  +'工具列可<b>搜尋所有影片逐字稿</b>。切回<b>衝刺</b>回到今夜四站。';
function renderStudy(){
  const wm=document.getElementById('wm');
  if(!wm) return;
  wm.hidden=!SPRINT_PLAN&&!MANIFEST;
  const note=document.getElementById('studyNote');
  if(note){
    if(NOTE_SPRINT===null) NOTE_SPRINT=note.innerHTML;
    note.innerHTML=WM.view==='lib'?NOTE_LIB:NOTE_SPRINT;
  }
  renderTodo(); renderWmBar();
  const spine=document.getElementById('wmSpine'), body=document.getElementById('wmBody');
  const anchor=document.getElementById('spAnchor');
  if(WM.view==='lib'){
    /* 影片庫（決策 E）：沿用主從版面；#rvSlot 搬回工具列下的常駐位 */
    rvDock(false);
    if(spine) spine.hidden=true;
    if(body) body.hidden=false;
    renderLibList(document.getElementById('wmList'));
    renderLibDetail(document.getElementById('wmDetail'));
  }else{
    if(body) body.hidden=true;
    if(spine) spine.hidden=false;
    renderSpine();               // 內部完成 rvDock(true)＋事件綁定
  }
  if(anchor) anchor.hidden=WM.view!=='sprint';   // 模式層面的顯隱交給 CSS data-mode
}

/* ---- T14 導航（一次性佈線）：唯一浮動「今夜」錨＋捲動 spy＋鍵盤 1–4 ----
   scripts 在 body 尾端，DOM 已就緒；錨鈕是 body 直屬靜態節點（渲染紀律）。 */
(function spineNavInit(){
  const rm=matchMedia('(prefers-reduced-motion: reduce)');
  const btn=document.getElementById('spAnchor');
  if(!btn) return;
  const ar=btn.querySelector('.ar');
  let raf=null;
  function place(){
    raf=null;
    if(document.body.dataset.mode!=='study'||WM.view!=='sprint') return;
    const t=document.getElementById('tonight');
    if(!t) return;
    const r=t.getBoundingClientRect(), vh=innerHeight;
    const s=r.top>vh*.7?'↓':(r.bottom<vh*.3?'↑':'●');
    ar.textContent=s;
    btn.classList.toggle('at',s==='●');
    btn.setAttribute('aria-label',s==='●'?'你在今夜':'回到今夜');
    /* 站別讀數（in-flow 的 st-nav 亮起所在站——捲動即導航，讀數不浮） */
    const mid=vh*.45;
    let on=0;
    for(let n=1;n<=4;n++){
      const st=document.getElementById('stn'+n);
      if(st){ const b=st.getBoundingClientRect(); if(b.top<=mid&&b.bottom>=mid) on=n; }
    }
    document.querySelectorAll('.st-nav [data-st-go]').forEach(b=>
      b.classList.toggle('on',+b.dataset.stGo===on));
    /* T19 科目跳道同款讀數：站 02 裡正在讀的那一科亮起（「捲動即換科」） */
    const sj=document.querySelectorAll('.subj-jump [data-subj-go]');
    if(sj.length){
      let onS='';
      document.querySelectorAll('.subj-blk[id]').forEach(k=>{
        const b=k.getBoundingClientRect();
        if(b.top<=mid&&b.bottom>=mid) onS=k.id.slice(4);
      });
      sj.forEach(b=>b.classList.toggle('on',b.dataset.subjGo===onS));
    }
    /* T14b ②捲動敘事：今夜區的燈色跟著所在站漸變（data-station 只是
       捲動位置的即時投影，非狀態——真狀態照舊全在 JS/localStorage）。
       320ms 漸變在 CSS 吃 @property --zt；reduced-motion 由 CSS 整段停用。 */
    if(on&&t.dataset.station!==String(on)) t.dataset.station=String(on);
    /* 脊柱亮段：視口正在讀的那一段 zone 燃線提亮一級 */
    document.querySelectorAll('#wmSpine .zone').forEach(z=>{
      const b=z.getBoundingClientRect();
      z.classList.toggle('lit',b.top<vh*.55&&b.bottom>vh*.45);
    });
  }
  addEventListener('scroll',()=>{ if(!raf) raf=requestAnimationFrame(place); },{passive:true});
  btn.addEventListener('click',()=>{
    const t=document.getElementById('tonight');
    if(t) t.scrollIntoView({block:'start',behavior:rm.matches?'auto':'smooth'});
  });
  /* 鍵盤 1–4 直達四站：只在讀書模式＋衝刺視圖；輸入框與 modal 開啟時不攔 */
  addEventListener('keydown',e=>{
    if(e.altKey||e.ctrlKey||e.metaKey) return;
    if(document.body.dataset.mode!=='study'||WM.view!=='sprint') return;
    if(document.body.classList.contains('modal-open')) return;
    const tag=(e.target&&e.target.tagName)||'';
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
    if(e.key>='1'&&e.key<='4'){ spineGoStation(+e.key); e.preventDefault(); }
  });
  /* 開進讀書模式即落在今夜（wipe 於 560ms 換模式，640ms 已在新模式下） */
  ['btnStudy','toStudy'].forEach(id=>{
    const b=document.getElementById(id);
    if(b) b.addEventListener('click',()=>setTimeout(()=>{
      if(document.body.dataset.mode==='study'&&WM.view==='sprint') spineJumpTonight();
    },640));
  });
})();

/* 點一列集數：手上有來源就直接播；沒有就開檔案選擇器，選完自動接著播。
   PENDING_PICK 記住「選完要播哪一支」，因為 change 事件是非同步回來的。 */
let PENDING_PICK=null;
/* 伺服器到底通不通。null=還不知道。
   不能用 MEDIA_SEEKABLE 代替：那是靠「state.json 抓不抓得到」判斷的，
   而 state.json 已經被 SW 快取，離線照樣抓得到，永遠是 true。 */
let SRV_LIVE=null;
async function probeSrv(){
  /* 「連不連得到後端」——本機是媒體伺服器，雲端是 Pages 的 /data/**。
     兩邊問的都是同一句話：現在補得到教材嗎。
     注意雲端模式下這句為真**不代表影片可播**（影片不上雲），
     所以 epClick 另外看 CLOUD，不拿 SRV_LIVE 當播放許可。 */
  SRV_LIVE=await fetch(dataURL('videos.json'),{method:'HEAD',cache:'no-store'})
    .then(r=>r.ok).catch(()=>false);
  return SRV_LIVE;
}
addEventListener('online',()=>{probeSrv();});
addEventListener('offline',()=>{SRV_LIVE=false;});
function epClick(b){
  const code=b.dataset.code||'', k=spNorm(code);
  // 已經選過的檔案照舊站內播——那份副本 iOS 已經複製進來了，不用浪費。
  // 雲端模式也留著這條：它播的是使用者自己在這次工作階段挑進來的檔案，
  // 跟「雲端有沒有影片」無關，能播就不該假裝不能。
  if(DISK.has(k)) return openPlayer(videoSrc(code,''),b.dataset.name,code);
  /* 雲端模式沒有影片可串流：86GB 不上 Cloudflare，data-play 也是空的（LOCAL 是空的）。
     這裡不靠 SRV_LIVE 判斷——雲端連得上代表教材抓得到，不代表影片播得了，
     拿它當播放許可只會開出一個永遠轉圈的播放器。

     L3（14-drive.js）之後多一條路：影片備份在 Google Drive、而且已經連結過的話，
     drivePlay() 會用 Feb 自己的播放器直接串（位元組 Google → 裝置，不經過我們）。
     它三道門任一沒過就回 false，照舊落回隨播面板——面板裡有連結按鈕與 Drive 預覽。
     用 .then 而不是 await：epClick 是點擊處理器，讓它同步回去，別把點擊卡住。 */
  if(CLOUD){
    const fall = () => openCompanion(code,b.dataset.name);
    drivePlay(code,b.dataset.name).then(ok=>{ if(!ok) fall(); }).catch(fall);
    return;
  }
  // 連得到電腦就串流，畫質原檔、不佔裝置空間
  const live = SRV_LIVE===null ? navigator.onLine : SRV_LIVE;
  if(live && b.dataset.play) return openPlayer(b.dataset.play,b.dataset.name,code);
  /* SRV_LIVE 被 offline 事件打成 false 之後，只能靠 online 事件翻回來——而 iOS 的
     online 事件不保證會送到（切 App、鎖屏、熱點閃斷之後常常就沒了）。症狀是：
     網路其實早就回來、伺服器一切正常，但每一集都開隨播面板叫人複製檔名，
     而且重整頁面之前不會好。2026-09-09 使用者在 iPad 上踩到，查了一輪才確定
     伺服器端全綠、桌機同一個網址也全綠，卡的只有這個沒人清的旗標。
     落回面板之前先再探一次：一次 HEAD 而已，探到了就照常串流。 */
  if(!live && b.dataset.play){
    const fall=()=>openCompanion(code,b.dataset.name);
    probeSrv().then(ok=>{ ok ? openPlayer(b.dataset.play,b.dataset.name,code) : fall(); })
              .catch(fall);
    return;
  }
  // 連不到電腦：不再叫人去選檔案。iOS 的 file input 一定會把整支影片
  // 複製進裝置（WebKit WKFileUploadPanel.mm，Import 與 Open 兩種模式皆然），
  // 3GB 的可用空間裝不下 1GB 的課程影片，選了也是白選。
  // 改成開隨播面板：影片用 VLC 直接讀硬碟（原生 App 有安全範圍存取權，不複製），
  // 這裡給檔名與章節時間。
  openCompanion(code,b.dataset.name);
}
let DIR_MODE=false;
function askDisk(code,name){
  const inp=document.getElementById('diskPick');
  if(inp && DIR_MODE){                   // 從資料夾模式切回單檔模式
    inp.webkitdirectory=false;
    inp.setAttribute('accept','video/*');
    DIR_MODE=false;
  }
  PENDING_PICK={code,name};
  const want=diskHintFor(code);
  toastMsg(want?`在硬碟裡點這個檔案：\n${want}`:'在硬碟裡找這一支的影片檔');
  document.getElementById('diskPick')?.click();
}
/* 從快取的 state.json 反推硬碟上的實際檔名，讓人知道要在檔案 App 裡點哪個 */
function diskHintFor(code){
  const u=LOCAL[spNorm(code)]?.url;
  if(!u) return '';
  try{ return decodeURIComponent(u.split('/').pop()); }catch(e){ return ''; }
}

/* 播放器圖示組。

   原本混用彩色 emoji（🔊🧠📁）與文字符號（▶↺↻⛶⋮）：emoji 由作業系統字型畫，
   在 Windows 與 iPad 上長相不同、帶自己的配色，跟待機畫面那套「無彩色圖示、
   只靠字重與留白」的語彙互相打架；文字符號則會隨系統字型改變粗細與基線，
   跟旁邊的 SVG 對不齊。全部改成同一份 24×24 網格、線寬 1.7、圓端點的細線 SVG，
   顏色一律 currentColor，六套主題與淺色模式都自動跟著走。 */
/* 圖示組。2026-08-25 重畫：原本 19px／線寬 1.7，而且 back10/fwd10 在圓弧裡
   塞 7.4px 的「10」文字、map 是兩條各含七八段曲線的腦——那個尺寸下必糊。
   現在 22px／線寬 2，幾何一律簡化到「三筆以內畫得完」：
   小尺寸下線條越少越清楚，細節多只會糊成一團。 */
const ICO=(()=>{
  const w=(d,extra='')=>`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round">${d}</svg>`.replace(/\s+/g,' ');
  return {
    // 播放／暫停：實心三角與粗豎線，主要動作用實心最好認
    play:w('<path d="M8 5.2v13.6l11-6.8z" fill="currentColor" stroke-linejoin="round"/>'),
    pause:w('<path d="M9 5.5v13M15 5.5v13" stroke-width="2.4"/>'),
    /* 退／進 10 秒：拿掉圓弧。
       「圓弧＋弧心塞數字」是 YouTube 的做法，但那是在 36px 以上才成立——
       22px 內圓弧把可用面積擠到只剩中間一小塊，數字必糊，而且弧的方向
       比箭頭難辨。改成上方一支實心三角箭頭、下方一個放大的 10，
       兩個元素各自佔滿寬度，方向與秒數都是一眼的事。 */
    back10:w('<path d="M11.4 3.4 5.6 7.6l5.8 4.2z" fill="currentColor" stroke="none"/>'
      +'<path d="M6.4 7.6h6.2a5.4 5.4 0 0 1 5.4 5.4v.6" stroke-width="2"/>'
      +'<text x="12" y="22" text-anchor="middle" font-size="9.6" font-weight="700"'
      +' fill="currentColor" stroke="none"'
      +' font-family="Geist Mono, monospace">10</text>'),
    fwd10:w('<path d="M12.6 3.4 18.4 7.6l-5.8 4.2z" fill="currentColor" stroke="none"/>'
      +'<path d="M17.6 7.6h-6.2A5.4 5.4 0 0 0 6 13v.6" stroke-width="2"/>'
      +'<text x="12" y="22" text-anchor="middle" font-size="9.6" font-weight="700"'
      +' fill="currentColor" stroke="none"'
      +' font-family="Geist Mono, monospace">10</text>'),
    // 音量：喇叭改實心（小尺寸下線框喇叭的內部細節會糊），弧線留一道就夠
    vol:w('<path d="M4 9.5v5h3.4L12 18.4V5.6L7.4 9.5z" fill="currentColor" stroke-linejoin="round"/>'
      +'<path d="M15.4 9.2a4 4 0 0 1 0 5.6"/><path d="M18.4 6.4a8 8 0 0 1 0 11.2"/>'),
    mute:w('<path d="M4 9.5v5h3.4L12 18.4V5.6L7.4 9.5z" fill="currentColor" stroke-linejoin="round"/>'
      +'<path d="M15.6 9.6l5 4.8M20.6 9.6l-5 4.8"/>'),
    /* 思考地圖：從「一顆腦」改成節點圖——三個節點兩條連線。
       這才是它實際的內容（觀念依賴關係），而且 22px 下三個圓點加兩條線
       絕對清楚，原本那顆腦光單邊就有八段貝茲曲線。 */
    map:w('<circle cx="6" cy="6.6" r="2.6"/><circle cx="18" cy="6.6" r="2.6"/>'
      +'<circle cx="12" cy="17.6" r="2.6"/>'
      +'<path d="M7.4 8.9 10.6 15.3M16.6 8.9 13.4 15.3"/>'),
    more:w('<circle cx="12" cy="5" r="1.7" fill="currentColor" stroke="none"/>'
      +'<circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>'
      +'<circle cx="12" cy="19" r="1.7" fill="currentColor" stroke="none"/>'),
    full:w('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
    close:w('<path d="M6 6l12 12M18 6L6 18"/>'),
    // 行內小三角：影片清單與思考地圖的時間戳前綴，跟文字同高
    tiny:`<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true" class="ico-tiny"><path d="M8 5.2v13.6l11-6.8z" fill="currentColor"/></svg>`,
  };
})();
/* 工具列上的功能鈕（選影片／選整個資料夾／設定／主題）走 CSS 遮罩版圖示，
   定義在 .ico-lead 那組。原因：那幾個標籤的文字經過 esc() 逃脫才輸出，
   直接塞 SVG 字串會被當成純文字顯示出原始碼。 */

