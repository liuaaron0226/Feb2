/* 離線影片播放器：預設 2 倍速、記住上次播放位置 */
const PL_LS='feb-playpos-v1';
let PLAYER_LOAD = 0;
function openPlayer(url,name,code,quiet){
  const load = ++PLAYER_LOAD;
  // 字幕與思考地圖一律從伺服器路徑推導，不看影片是不是走 blob。
  // 走硬碟時 url 是 blob:...，.mp4→.vtt 的替換換不出東西，
  // 兩者會靜靜跳過，變成有影片沒字幕也沒思考地圖。
  const ASSET=(code&&LOCAL[spNorm(code)]?.url)||url;
  let m=document.getElementById('vidModal');
  if(!m){
    m=document.createElement('div'); m.id='vidModal'; m.className='modal';
    m.innerHTML=`<div class="modal-back" data-vclose></div>
      <div class="modal-panel glass vid-panel">
        <button class="modal-x lq" type="button" data-vclose aria-label="關閉">✕</button>
        <div class="vid-head">
          <span class="vh-code" id="vidCode"></span>
          <h3 id="vidName"></h3>
          <span class="vh-meta" id="vidMeta"></span>
        </div>
        <div class="vid-main">
        <div class="vstage" id="vstage">
          <video id="vidEl" preload="metadata" crossorigin="anonymous" playsinline></video>
          <div class="vctl" id="vctl">
            <div class="vseek" id="vseek" title="拖曳或點擊跳轉">
              <div class="vseek-track"><div class="vseek-buf"></div><div class="vseek-play"></div></div>
              <div class="vseek-marks" id="vseekMarks"></div>
              <div class="vseek-knob"></div>
            </div>
            <div class="vrow">
              <button type="button" class="vic" data-toggle title="播放／暫停" aria-label="播放">${ICO.play}</button>
              <button type="button" class="vic" data-seek="-10" title="倒轉 10 秒" aria-label="倒轉 10 秒">${ICO.back10}</button>
              <button type="button" class="vic" data-seek="10" title="快轉 10 秒" aria-label="快轉 10 秒">${ICO.fwd10}</button>
              <span class="vtime" id="vtime">0:00 / 0:00</span>
              <span class="vspring"></span>
              <span class="vvol">
                <button type="button" class="vic" data-mute title="靜音" aria-label="靜音">${ICO.vol}</button>
                <input type="range" id="vvolr" min="0" max="1" step="0.05" value="1" title="音量">
              </span>
              <button type="button" class="vic brain" id="vidMapBtn" data-map title="思考地圖"
                aria-label="思考地圖" hidden>${ICO.map}</button>
              <span class="vmenu-wrap">
                <button type="button" class="vic" data-menu title="更多" aria-label="更多">${ICO.more}</button>
                <div class="vmenu" id="vmenu" hidden></div>
              </span>
              <button type="button" class="vic" data-fs title="全螢幕（思考地圖留在右側）"
                aria-label="全螢幕">${ICO.full}</button>
            </div>
          </div>
        </div>
        <iframe id="vidFrame" hidden allow="autoplay; encrypted-media; fullscreen"
          allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
        <div id="vidChap" hidden></div>
        <div class="vid-meta">
          <span class="vid-left" id="vidLeft"></span>
        </div>
        <p class="yt-hint">YouTube 播放器控制：<b>k</b> 播放暫停　<b>j</b>／<b>l</b> 退進 10 秒　<b>&lt;</b>／<b>&gt;</b> 調速</p>
        </div>
        <div id="vidMap" hidden></div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click',ev=>{
      if(ev.target.closest('[data-vclose]')) return closePlayer();
      const v=document.getElementById('vidEl');
      const s=ev.target.closest('[data-seek]');
      if(s){ vidSeek(+s.dataset.seek); return; }
      if(ev.target.closest('[data-toggle]')) return vidToggle();
      if(ev.target.closest('[data-mute]')) return vidMute();
      if(ev.target.closest('[data-menu]')) return vmenuToggle();
      const rt=ev.target.closest('[data-rate]');
      if(rt){ vidRate(+rt.dataset.rate); vmenuBuild(); return; }
      if(ev.target.closest('[data-subs]')){ vidSubs(); vmenuBuild(); return; }
      if(ev.target.closest('[data-pip]')) return vidPip();
      if(!ev.target.closest('.vmenu-wrap')) vmenuClose();
      const tj=ev.target.closest('[data-t]');
      if(tj){ vidSeekTo(+tj.dataset.t); return; }
      if(ev.target.closest('[data-map]')){
        const p=document.getElementById('vidMap');
        if(p&&p.innerHTML){ p.hidden=!p.hidden; syncTwoCol();
          document.getElementById('vidMapBtn')?.classList.toggle('on',!p.hidden);
          if(!p.hidden&&!m.querySelector('.vid-panel.two-col'))
            p.scrollIntoView({behavior:'smooth',block:'nearest'}); }
        return;
      }
      if(ev.target.closest('[data-fs]')){ panelFs(); return; }
      if(ev.target.closest('[data-chlist]')){
        const l=m.querySelector('.chap-list');
        if(l){ l.hidden=!l.hidden; m.querySelector('.chap-rail')?.classList.toggle('open',!l.hidden); }
        return;
      }
    });
  }
  const v=m.querySelector('#vidEl');
  const fr=m.querySelector('#vidFrame');
  if(PL_CUR) plSave(v);
  if(typeof driveMSEDetach === 'function') driveMSEDetach(v);
  v.pause(); v.removeAttribute('src'); v.load();
  /* 標題拆三層：集數碼當眉標、課程名當主標、科目與章節當中繼。
     原本三者黏成一行 .95rem 小字，等於整個播放器沒有標題。
     name 的格式是「115暑電子01 基本電路學、重疊」或搜尋來的「碼｜標題」。 */
  {
    const raw=String(name||'');
    const mm=raw.match(/^(\S+)\s*[｜|]\s*(.+)$/) || raw.match(/^(\S+)\s+(.+)$/);
    const codeTxt=mm?mm[1]:(code||'');
    const titleTxt=mm?mm[2]:raw;
    m.querySelector('#vidCode').textContent=codeTxt;
    m.querySelector('#vidName').textContent=titleTxt;
    /* 中繼：科目・章節。由集數碼反查 byChapter（欄位是 code 不是 lec），
       再到 sprint 的 subjects[].chapters[] 取名字。查不到就留空，不硬湊。 */
    let meta='';
    const bc=VIDEOS?.istudy?.byChapter||{};
    const want=(typeof spNorm==='function'?spNorm(code||''):code)||'';
    let chId=null;
    if(want) for(const [id,arr] of Object.entries(bc)){
      if((arr||[]).some(x=>spNorm(x.code||'')===want)){ chId=id; break; }
    }
    if(chId&&SPRINT_PLAN?.subjects) for(const s of SPRINT_PLAN.subjects){
      const c=(s.chapters||[]).find(x=>x.id===chId);
      if(c){ meta=`${s.name} · ${stripSubj(c.name,s.name)}`; break; }
    }
    const el=m.querySelector('#vidMeta');
    el.textContent=meta; el.hidden=!meta;
  }
  // 本機檔：用原生 video，帶自訂快轉／記憶進度
  m.classList.remove('yt');
  fr.removeAttribute('src'); fr.hidden=true; v.hidden=false;
  PL_CUR=ASSET;
  notesReset();
  if(!url){
    // quiet：openYT 借用本函式做初始化，YT 沒有「未下載」問題，這句 toast 對它是誤報
    if(!quiet) toastMsg('這支還沒下載，也沒在硬碟裡找到。先按「選影片」挑 istudy-backup 資料夾。');
    return;
  }
  // 離線又沒連硬碟時，網址指向連不上的電腦，<video> 只會安靜失敗。
  // 給一片黑畫面等於讓人猜，所以明講是哪一種情況、下一步做什麼。
  v.onerror=()=>{
    if(typeof driveMSERecover === 'function' && driveMSERecover(v)) return;
    // MediaError：1=中止 2=網路抓不到 3=解碼失敗 4=來源不支援。
    // 沒有這個代碼就只能猜——2 是連不到伺服器，4 是 blob／格式的問題，
    // 兩者處置完全不同。
    const c=v.error?.code, 走硬碟=url.startsWith('blob:');
    const 名稱={1:'中止',2:'網路抓不到',3:'解碼失敗',4:'來源不支援'}[c]||'未知';
    /* Drive 直連壞掉時不要只丟一句錯誤——這條路本來就是有風險的那一條
       （iOS Safari 對「Service Worker 自己組的 206」歷來很挑），
       所以立刻換到 Drive 自己的預覽播放器，讓人至少看得成這一堂。 */
    const dvId=typeof driveIdFromURL==='function'&&driveIdFromURL(url);
    if(dvId){
      /* 錯誤 4 在 Drive 網址上＝這台裝置的 <video> 繞過了 Service Worker（iPad 實證）。
         記下來：下次 drivePlay() 直接走 Google 播放器，不再讓使用者每次先看一句錯誤。 */
      if(c===4){ try{ localStorage.setItem('feb-drive-nosw','1'); }catch(e){} }
      // MSE 若試過而失敗，把它留下的原因一起說——不然使用者只看到「讀不到串流」，我也只能猜
      const why=(typeof DRIVE!=='undefined'&&DRIVE.mseWhy)?`（MSE：${DRIVE.mseWhy}）`:'';
      toastMsg(c===4
        ? `這台裝置的影片元件讀不到 Drive 串流${why}，改用 Google 的播放器（思考地圖在右欄）。`
        : `Drive 串流播不起來（錯誤 ${c}：${名稱}）${why}，改用 Google 的播放器。`);
      const dvCode=DRIVE?.byId?.[dvId]?.code||code;
      closePlayer?.();
      if(dvCode&&driveOpenPreview(dvCode,name)) return;
      if(code) return openCompanion(code,name);
      return;
    }
    if(!走硬碟 && c===2){
      // 伺服器抓不到＝電腦不在身邊。別讓人自己去想下一步，直接問要哪個檔案。
      SRV_LIVE=false;
      closePlayer?.();
      if(code) return openCompanion(code,name);
    }
    const 建議 = 走硬碟
      ? (c===4?'這支影片的格式 Safari 播不動，或 blob 來源被拒。'
             :'硬碟檔案讀不到，可能硬碟被拔掉了，重新接一次。')
      : '影片來源有問題。';
    toastMsg(`${建議}（錯誤 ${c}：${名稱}／${走硬碟?'硬碟':'伺服器'}）`);
  };
  /* 2026-09-04 MSE：Drive 影片先試 driveMSEAttach()（14-drive.js）——它會自己把 src 設成
     blob: 並用 fetch 分段餵位元組，<video> 不再對外請求，iPad 上也能走 Feb 的播放器。
     任何一道門沒過（沒重新封裝、裝置不支援、沒權杖）就回 false，這裡照舊直接設 src。
     用 .then 不 await：openPlayer 是同步的點擊處理器，別把它變 async 卡住呼叫端。 */
  const saved=readJSON(PL_LS,{})[ASSET];
  const pos=typeof saved==='number'?saved:(saved?.t||0);
  const initial = {time: PENDING_SEEK ?? pos, rate: 2, play: PENDING_SEEK != null};
  const mseTry=(typeof driveMSEAttach==='function')?driveMSEAttach(v,url,code,null,initial):Promise.resolve(false);
  mseTry.then(ok=>{ if(load === PLAYER_LOAD && !ok) v.src=url; })
    .catch(()=>{ if(load === PLAYER_LOAD) v.src=url; });
  attachSubs(v,ASSET);
  loadNotes(ASSET);
  // 進度用 ASSET 當鍵：blob 網址每次選資料夾都不一樣，
  // 拿它當鍵等於每次都從頭開始。
  v.onloadedmetadata=()=>{
    if(!(typeof driveMSERestoring === 'function' && driveMSERestoring(v))){
      vidRate(2);
      if(PENDING_SEEK!=null){ v.currentTime=PENDING_SEEK; PENDING_SEEK=null; v.play().catch(()=>{}); }
      else if(pos>1&&pos<v.duration-2) v.currentTime=pos;
    }
    if(PENDING_SEEK === initial.time) PENDING_SEEK = null;
    vidLeft(); vidResumeBar(pos); renderChapters(); vseekMarks(); vctlSync();
  };
  bindSeek();
  let tick=0;
  v.ontimeupdate=()=>{ chapTick(v); vctlSync();
    if(++tick%4===0) plSave(v); if(tick%8===0) vidLeft(); };
  v.onprogress=v.onvolumechange=v.onratechange=vctlSync;
  v.onseeked=v.onended=()=>{ plSave(v); vctlSync(); };
  v.onplay=v.onpause=()=>{ plSave(v); vctlSync(); };
  m.hidden=false; document.body.classList.add('modal-open');
  /* 播放器蓋住整個畫面 → 背景那支 loop 影片一格都看不到，停掉。
     它 preload="auto" 又循環，在 iPad 上等於整堂課都在解碼一支隱形影片。 */
  bgVideoPause();
}
/* 背景影片開關。CSS 的 animation-play-state 管不到 <video> 的解碼，
   必須用 JS 明確 pause()。 */
function bgVideoPause(){
  const bg=document.querySelector('.bgvid');
  if(bg&&!bg.paused){ bg.pause(); bg.dataset.byModal='1'; }
}
function bgVideoResume(){
  const bg=document.querySelector('.bgvid');
  if(!bg) return;
  if(bg.dataset.byModal==='1'&&document.body.dataset.mode==='home'&&bg.currentSrc){
    bg.play().catch(()=>{});
  }
  delete bg.dataset.byModal;
}
const RATES=[1,1.25,1.5,1.75,2,2.5,3];
let PL_CUR=null;
/* 字幕：make_subs.py 產生的 .vtt 就放在 mp4 旁邊，同一台媒體伺服器供應。
   先探測檔案在不在，有才掛字幕軌，避免播放器出現空的字幕選項。 */
let SUB_TOK=0;
async function attachSubs(v,url){
  const tok=++SUB_TOK;              // 兩次呼叫各自 await 完再 append，會掛出兩條軌＝字幕重複顯示
  v.querySelectorAll('track').forEach(t=>t.remove());
  const vtt=sidecarOf(url,'.vtt');
  if(!vtt||vtt===url) return;
  try{
    const r=await fetch(vtt,{method:'HEAD'});
    if(!r.ok) return;
  }catch(e){ return; }
  if(tok!==SUB_TOK) return;         // 期間又開了別支影片，這次結果作廢
  v.querySelectorAll('track').forEach(t=>t.remove());   // await 後再清一次才保險
  const tr=document.createElement('track');
  tr.kind='subtitles'; tr.label='中文'; tr.srclang='zh-TW'; tr.src=vtt; tr.default=true;
  v.appendChild(tr);
  v.textTracks[0] && (v.textTracks[0].mode='showing');
}
function vidEl(){ return document.getElementById('vidEl'); }
const hms=s=>{s=Math.max(0,Math.round(s));
  const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;
  return (h?h+':':'')+String(m).padStart(h?2:1,'0')+':'+String(x).padStart(2,'0');};
/* 存進度：記時間點、片長、看到幾成與更新時間，換裝置或重開都還原得回來 */
function plSave(v){
  if(!PL_CUR||!v||!isFinite(v.duration)) return;
  if(typeof driveMSERestoring === 'function' && driveMSERestoring(v)) return;
  const s=readJSON(PL_LS,{});
  const pct=Math.round(v.currentTime/v.duration*100);
  s[PL_CUR]={t:v.currentTime,dur:v.duration,pct,at:todayStr()};
  localStorage.setItem(PL_LS,JSON.stringify(s));
  if(pct>=DONE_PCT) watchAutoMark(PL_CUR);   // 看到 90% 就落地，之後清進度也還記得
}
function vidResumeBar(pos){
  const box=document.getElementById('vidResume');
  if(!box) return;
  // 續播提示與「從頭播放」按鈕已移除（使用者回饋：畫面上多餘）。
  // 續播本身照舊生效，只是不再佔版面說明它——要從頭看就按 Home，
  // 或把進度條拖到最左，都不需要一顆常駐按鈕。
  box.innerHTML='';
}
function vidSeek(sec){
  const v=vidEl(); if(!v||!isFinite(v.duration)) return;
  v.currentTime=Math.min(v.duration-1,Math.max(0,v.currentTime+sec));
  vidLeft();
}
function vidRate(r){
  const v=vidEl(); if(!v) return;
  v.playbackRate=r;
  vidLeft();
}
function vidSubs(){
  const v=vidEl(); if(!v||!v.textTracks.length) return;
  const t=v.textTracks[0];
  t.mode=t.mode==='showing'?'hidden':'showing';
}
function vidMute(){
  const v=vidEl(); if(!v) return;
  v.muted=!v.muted;
  vctlSync();
}
async function vidPip(){
  const v=vidEl(); if(!v) return;
  try{
    if(document.pictureInPictureElement) await document.exitPictureInPicture();
    else await v.requestPictureInPicture();
  }catch(e){ console.warn('子母畫面',e); }
  vmenuClose();
}
function vmenuToggle(){
  const m=document.getElementById('vmenu'); if(!m) return;
  if(m.hidden){ vmenuBuild(); m.hidden=false; } else m.hidden=true;
}
function vmenuClose(){ const m=document.getElementById('vmenu'); if(m) m.hidden=true; }
function vmenuBuild(){
  const m=document.getElementById('vmenu'), v=vidEl();
  if(!m||!v) return;
  const tt=v.textTracks[0];
  const subOn=tt&&tt.mode==='showing';
  const pip=document.pictureInPictureEnabled&&!v.disablePictureInPicture;
  m.innerHTML=`
    <h5>播放速度</h5>
    <div class="rates">${RATES.map(r=>`<button type="button" data-rate="${r}"
      class="${Math.abs(v.playbackRate-r)<.01?'on':''}">${r}×</button>`).join('')}</div>
    <hr>
    ${tt?`<button type="button" data-subs class="${subOn?'on':''}">中文字幕</button>`:
         `<button type="button" disabled style="opacity:.45">這支沒有字幕</button>`}
    ${pip?'<button type="button" data-pip>子母畫面</button>':''}
    <button type="button" data-fs>全螢幕（思考地圖留在右側）</button>`;
}
/* 全螢幕：優先對「面板」要求，兩欄版面（左影片右思考地圖）才保得住。
   影片自己那顆原生全螢幕只會放大影片，旁邊什麼都留不下。

   ⚠ iPad Safari 的 <div> 沒有 requestFullscreen（只有 <video> 有
   webkitEnterFullscreen）。原本寫成
     (p.requestFullscreen?.(...) || Promise.reject()).catch(()=>{})
   在 iPad 上 requestFullscreen 是 undefined → 整個運算式變成
   Promise.reject() 被 catch 靜靜吃掉，按了完全沒反應。
   所以要逐層退：面板全螢幕 → 影片原生全螢幕 → 面板放到滿版（自製）。 */
function panelFs(){
  const p=document.querySelector('#vidModal .vid-panel');
  if(!p) return;
  // 已在全螢幕（任一種）就退出
  if(document.fullscreenElement||document.webkitFullscreenElement){
    (document.exitFullscreen||document.webkitExitFullscreen)?.call(document); return;
  }
  const v=document.getElementById('vidEl');
  if(v&&v.webkitDisplayingFullscreen){ v.webkitExitFullscreen?.(); return; }
  if(p.classList.contains('fs-fallback')){ p.classList.remove('fs-fallback'); return; }

  const req=p.requestFullscreen||p.webkitRequestFullscreen;
  if(req){ Promise.resolve(req.call(p,{navigationUI:'hide'})).catch(()=>fsFallback(p,v)); return; }
  fsFallback(p,v);
}
/* iPad 的退路。先試影片原生全螢幕（真的能填滿螢幕、也能轉橫向），
   它不支援才用 CSS 把面板撐到滿版——後者至少比「按了沒反應」好。 */
function fsFallback(p,v){
  if(v&&typeof v.webkitEnterFullscreen==='function'&&v.readyState>0){
    try{ v.webkitEnterFullscreen(); return; }catch(_){}
  }
  p.classList.add('fs-fallback');
}
addEventListener('fullscreenchange',()=>{
  const fs=!!document.fullscreenElement;
  const b=document.getElementById('vidFsBtn');
  if(b) b.innerHTML=`${ICO.full}<span>${fs?'離開全螢幕':'全螢幕'}</span>`;
  if(fs) requestAnimationFrame(()=>{           // 版面換了，mermaid 量到的寬度要重算
    const box=document.getElementById('vidMap');
    if(box&&!box.hidden) box.scrollTop=box.scrollTop;
  });
});
function vidToggle(){
  const v=vidEl(); if(!v) return;
  if(typeof driveMSEToggle === 'function' && driveMSEToggle(v)) return;
  v.paused?v.play().catch(()=>{}):v.pause();
}
/* 控制列與影片狀態同步：播放鍵、靜音鍵、時間、進度條

   每次寫入前先比對現值。timeupdate 每秒觸發約 4 次，無條件寫 textContent 會讓
   瀏覽器把那顆按鈕整個換掉——實測 44 秒內播放鍵被改寫 344 次、時間文字 172 次。
   桌機看不出來，iPad 上就是播放時整體卡頓，連點按鈕都會落空（元素在指下被抽換）。
   時間與進度條真正會變的只有秒數與百分比，所以各自記住上次的值，沒變就不碰 DOM。 */
const VCTL_LAST={time:'',pct:'',buf:'',toggle:'',mute:''};
function vctlSync(){
  const v=vidEl(); if(!v) return;
  const q=s=>document.querySelector('#vidModal '+s);
  const stage=document.getElementById('vstage');
  const playing = !v.paused || (typeof driveMSEBuffering === 'function' && driveMSEBuffering(v));
  if(stage) stage.classList.toggle('paused',!playing);
  const pb=q('[data-toggle]'), pbKey=playing?'pause':'play';
  if(pb&&VCTL_LAST.toggle!==pbKey){
    pb.innerHTML=ICO[pbKey]; pb.setAttribute('aria-label',playing?'暫停':'播放');
    VCTL_LAST.toggle=pbKey;
  }
  const mb=q('[data-mute]'), mbKey=v.muted||!v.volume?'mute':'vol';
  if(mb&&VCTL_LAST.mute!==mbKey){
    mb.innerHTML=ICO[mbKey]; mb.setAttribute('aria-label',mbKey==='mute'?'取消靜音':'靜音');
    VCTL_LAST.mute=mbKey;
  }
  const vr=document.getElementById('vvolr');
  if(vr&&document.activeElement!==vr) vr.value=v.muted?0:v.volume;
  const t=document.getElementById('vtime');
  if(t&&isFinite(v.duration)){
    /* 目前時刻用主色、總長淡化——兩個等亮的數字夾一條斜線時，
       每次都要重新分辨哪個是「現在」。用 innerHTML 而非 textContent
       才吃得到 .tot；比對字串仍在，不會多寫 DOM（卡頓修法的前提）。 */
    const txt=`${hms(v.currentTime)}<span class="tot"> / ${hms(v.duration)}</span>`;
    if(VCTL_LAST.time!==txt){ t.innerHTML=txt; VCTL_LAST.time=txt; }
  }
  if(!isFinite(v.duration)) return;
  const pct=(v.currentTime/v.duration*100).toFixed(3)+'%';
  if(VCTL_LAST.pct!==pct){
    const play=q('.vseek-play'); if(play) play.style.width=pct;
    const knob=q('.vseek-knob'); if(knob) knob.style.left=pct;
    VCTL_LAST.pct=pct;
  }
  if(v.buffered.length){
    const bw=(v.buffered.end(v.buffered.length-1)/v.duration*100).toFixed(2)+'%';
    if(VCTL_LAST.buf!==bw){
      const buf=q('.vseek-buf'); if(buf) buf.style.width=bw;
      VCTL_LAST.buf=bw;
    }
  }
}
/* 章節界線與重點時段畫在進度條上——原本要抬頭去看下面那條軌，現在就在手邊 */
function vseekMarks(){
  const box=document.getElementById('vseekMarks'), v=vidEl();
  if(!box||!v) return;
  const dur=NOTES?.dur||(isFinite(v.duration)?v.duration:0);
  if(!dur||!NOTES){ box.innerHTML=''; return; }
  const p=x=>(x/dur*100).toFixed(2)+'%';
  box.innerHTML=(NOTES.keys||[]).map(k=>
      `<i style="left:${p(k.a)};width:${p(k.b-k.a)}" title="${esc(k.why||'重點')}"></i>`).join('')
    +(NOTES.chapters||[]).slice(1).map(c=>
      `<u style="left:${p(c.t)}" title="${esc(c.title)}"></u>`).join('');
}
/* 進度條拖曳／點擊 */
function bindSeek(){
  const bar=document.getElementById('vseek'); if(!bar||bar.dataset.on) return;
  bar.dataset.on='1';
  const at=ev=>{
    const v=vidEl(); if(!v||!isFinite(v.duration)) return;
    const r=bar.getBoundingClientRect();
    const x=Math.min(Math.max((ev.clientX-r.left)/r.width,0),1);
    v.currentTime=x*v.duration; vctlSync();
  };
  bar.addEventListener('pointerdown',ev=>{
    bar.setPointerCapture(ev.pointerId); at(ev);
    const mv=e=>at(e);
    const up=()=>{ bar.removeEventListener('pointermove',mv);
                   bar.removeEventListener('pointerup',up); };
    bar.addEventListener('pointermove',mv); bar.addEventListener('pointerup',up);
  });
  const vr=document.getElementById('vvolr');
  if(vr) vr.oninput=()=>{ const v=vidEl(); if(!v) return;
    v.volume=+vr.value; v.muted=+vr.value===0; vctlSync(); };
}
/* 以目前倍速估還要坐多久——排讀書時段時比「片長」有用 */
function vidLeft(){
  const v=vidEl(), el=document.getElementById('vidLeft');
  if(!v||!el||!isFinite(v.duration)) return;
  const wall=(v.duration-v.currentTime)/(v.playbackRate||1);
  el.textContent=`剩 ${Math.round(wall/60)} 分（${v.playbackRate}x）`;
}
/* ---------- 思考地圖：影片旁的 .notes.json（make_notes.py 產生） ----------
   章節時間軸＋重點時段＋邏輯重構筆記＋板書快照，時間戳一律可點跳轉。 */
let NOTES=null,NOTES_URL='',NOTES_TOK=0,PENDING_SEEK=null,LIBS_P=null;
function ensureLibs(){
  if(LIBS_P) return LIBS_P;
  const css=document.createElement('link');
  css.rel='stylesheet'; css.href='vendor/katex.min.css';
  document.head.appendChild(css);
  const load=src=>new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src=src; s.onload=res; s.onerror=()=>rej(new Error(src));
    document.head.appendChild(s);});
  LIBS_P=load('vendor/marked.min.js')
    .then(()=>load('vendor/katex.min.js'))
    .then(()=>load('vendor/auto-render.min.js'))
    .then(()=>load('vendor/mermaid.min.js'));
  return LIBS_P;
}
/* marked 的輸出再過一道：拔掉 script 類節點與 on* 屬性才上 DOM */
function sanitize(html){
  const t=document.createElement('template'); t.innerHTML=html;
  t.content.querySelectorAll('script,iframe,object,embed,link,style').forEach(n=>n.remove());
  t.content.querySelectorAll('*').forEach(el=>{
    [...el.attributes].forEach(a=>{
      if(/^on/i.test(a.name)||(/^(href|src|xlink:href)$/i.test(a.name)&&/^\s*javascript:/i.test(a.value)))
        el.removeAttribute(a.name);
    });
  });
  return t.innerHTML;
}
/* 分欄與否只看「地圖現在有沒有在顯示」；實際要不要並排交給媒體查詢決定 */
function syncTwoCol(){
  const panel=document.querySelector('#vidModal .vid-panel');
  const map=document.getElementById('vidMap');
  if(panel) panel.classList.toggle('two-col',!!map&&!map.hidden&&!!map.innerHTML);
}
function notesReset(){
  NOTES=null; NOTES_URL='';
  for(const id of ['vidChap','vidMap']){
    const el=document.getElementById(id);
    if(el){ el.hidden=true; el.innerHTML=''; }
  }
  const b=document.getElementById('vidMapBtn'); if(b) b.hidden=true;
  // 換片一定要清掉「上次畫了什麼」的快取。
  // 那些快取是為了避免 timeupdate 每秒重寫 DOM 而存在的，但它們記的是
  // 上一支影片的狀態——新片剛好算出同一個章節序號時，會判定「沒變、不用更新」，
  // 於是章節標題永遠空白。DOM 已經整個換掉了，快取沒跟著失效就會對不上。
  // 用 typeof 擋住暫時性死區：notesReset 會在這兩個宣告之前就被呼叫到。
  if(typeof CHAP_LAST!=='undefined'){ CHAP_LAST.cur=-1; CHAP_LAST.why=' '; }
  if(typeof VCTL_LAST!=='undefined')
    VCTL_LAST.time=VCTL_LAST.pct=VCTL_LAST.buf=VCTL_LAST.toggle=VCTL_LAST.mute='';
  syncTwoCol();
}
async function loadNotes(url){
  const tok=++NOTES_TOK;
  const nu=url&&sidecarOf(url,'.notes.json');
  if(!nu||nu===url) return;
  let d=null;
  try{
    // 不能用 no-store：那會繞過 Service Worker 快取，離線就讀不到思考地圖。
    // 伺服器對 .json 已經送 no-cache，有連線時本來就會回來驗證，不必再加。
    const r=await fetch(nu);
    if(r.ok) d=await r.json();
  }catch(e){ /* 沒筆記就維持原樣 */ }
  if(!d||tok!==NOTES_TOK) return;
  NOTES=d; NOTES_URL=url;
  renderChapters(); renderMap();
}
const snapUrl=(url,t)=>sidecarOf(url,`.snap_${t}.jpg`);
/* 旁掛檔案（字幕／思考地圖／板書快照）的唯一入口。
   影片走硬碟或媒體伺服器時，它們就躺在 .mp4 旁邊，換個副檔名即是。
   影片走 Drive 虛擬路徑（/drive/<fileId>）時網址裡根本沒有 .mp4 可換，
   得回頭問帳本——所以路徑規則收在這一個 helper 裡，只會錯一次。 */
function sidecarOf(url,ext){
  const u=String(url||'');
  if(typeof driveSidecar==='function'){
    const d=driveSidecar(u,ext);
    if(d) return d;
    if(typeof driveIdFromURL==='function'&&driveIdFromURL(u)) return '';   // Drive 上沒有這份旁掛檔
  }
  return u.replace(/\.mp4($|\?)/i,ext+'$1');
}
function vidSeekTo(t){
  const v=vidEl(); if(!v||!isFinite(v.duration)) return;
  v.currentTime=Math.max(0,Math.min(v.duration-1,t));
  if(v.paused) v.play();
  vidLeft();
}
function renderChapters(){
  const box=document.getElementById('vidChap'), v=vidEl();
  if(!box||!NOTES) return;
  /* Drive 預覽模式：影片在跨來源 iframe 裡，時間戳點了跳不動——
     不講的話使用者只會覺得「點了沒反應」，那比沒有目錄更糟。 */
  const dvOnly=document.getElementById('vidModal')?.classList.contains('drive-preview');
  const dur=NOTES.dur||((v&&isFinite(v.duration))?v.duration:0);
  const ch=NOTES.chapters||[];
  if(!dur||ch.length<2) return;
  const pct=t=>(t/dur*100).toFixed(2)+'%';
  const segs=ch.map((c,i)=>{
    const end=i+1<ch.length?ch[i+1].t:dur;
    return `<div class="seg" style="left:${pct(c.t)};width:${pct(end-c.t)}"
      title="${esc(hms(c.t)+'　'+c.title)}"></div>`;}).join('');
  const hots=(NOTES.keys||[]).map(k=>
    `<div class="hot" style="left:${pct(k.a)};width:${pct(k.b-k.a)}" title="${esc(k.why||'')}"></div>`).join('');
  box.innerHTML=`
    <div class="chap-rail">
      <div class="chap-strip">${segs}${hots}<div class="ph" style="left:0"></div></div>
      <button class="chap-head" type="button" data-chlist>
        <b id="chapCur"></b><span class="why" id="chapWhy"></span>
        <span class="caret">▾</span></button>
      <div class="chap-list" hidden>${dvOnly
        ? `<p class="chap-note">Google 的播放器控制不了跳轉——時間戳請自己拖。</p>` : ''}${ch.map(c=>
        `<button type="button" data-t="${c.t}"${dvOnly?' disabled':''}><b>${hms(c.t)}</b>${esc(c.title)}</button>`).join('')}</div>
    </div>`;
  box.hidden=false;
  // 預覽模式下整條時間軸也不該假裝可以點
  if(!dvOnly) box.querySelector('.chap-strip').onclick=ev=>{
    const r=ev.currentTarget.getBoundingClientRect();
    vidSeekTo((ev.clientX-r.left)/r.width*dur);
  };
  chapTick(v);
}
/* 章節游標與目前章節名。同樣每秒跑好幾次，但章節通常好幾分鐘才換一次，
   所以只在「章節序號真的變了」時才動 class 與文字——原本每次都重寫，
   兩小時的影片等於白改上萬次。游標位置例外，它本來就該逐秒移動。 */
let CHAP_LAST={cur:-1,why:''};
function chapTick(v){
  if(!NOTES||!v||!isFinite(v.duration)) return;
  const box=document.getElementById('vidChap');
  if(!box||box.hidden) return;
  const dur=NOTES.dur||v.duration, t=v.currentTime;
  const ph=box.querySelector('.ph');
  if(ph) ph.style.left=(t/dur*100).toFixed(2)+'%';
  const ch=NOTES.chapters||[];
  let cur=0;
  for(let i=0;i<ch.length;i++) if(t>=ch[i].t) cur=i;
  if(CHAP_LAST.cur!==cur){
    box.querySelectorAll('.seg').forEach((s,i)=>s.classList.toggle('cur',i===cur));
    box.querySelectorAll('.chap-list button').forEach((b,i)=>b.classList.toggle('cur',i===cur));
    const lb=document.getElementById('chapCur');
    if(lb) lb.textContent=ch[cur]?.title||'';
    CHAP_LAST.cur=cur;
  }
  const hot=(NOTES.keys||[]).find(k=>t>=k.a&&t<=k.b);
  const whyTxt=hot?`★ ${hot.why||'重點時段'}`:'';
  if(CHAP_LAST.why!==whyTxt){
    const why=document.getElementById('chapWhy');
    if(why) why.textContent=whyTxt;
    CHAP_LAST.why=whyTxt;
  }
}
/* 流程圖換膚。

   AI 產生筆記時把配色寫死在 mermaid 的 classDef 裡（紫 #6D4FC2、藍 #2F6DB3、
   紅 #B3402F…），那是它自己的預設調色盤，跟本站低彩度的語彙互相打架，
   而且 themeVariables 蓋不過 classDef。這裡在渲染前就地換掉色值——
   保留原本的語義分類（core 核心／defn 判斷／op 操作／warn 陷阱／sup 補充），
   只把顏色重新對應到灰階層級＋單一暖色重點，深淺色模式各一套。
   在網站端做，不必為了配色重跑 101 支影片的 AI 筆記。 */
function reskin(src){
  /* T06：調色盤改吃 tokens.css——語義分類（core/defn/op/warn/sup）不變，
     色值從 computed token 導出，body.lt 重繫 token 後亮暗兩地自動成立。
     ⚠ 一律用 hex，**不可以用 rgba()**：mermaid 的 classDef 以逗號分隔屬性，
     `fill:rgba(...)` 裡的逗號會把整張圖變成「Syntax error in text」炸彈——
     所以這裡讀 hex token 自行混色，絕不輸出 rgba()/color-mix()。
     token 讀不到（極端環境）就退回原本的固定深色盤。 */
  const cs=getComputedStyle(document.body);
  const tk=n=>cs.getPropertyValue(n).trim();
  const okHex=x=>/^#[0-9a-fA-F]{6}$/.test(x);
  const mixhex=(a,b,t)=>{const A=parseInt(a.slice(1),16),B=parseInt(b.slice(1),16);
    return '#'+[16,8,0].map(i=>Math.round((A>>i&255)*(1-t)+(B>>i&255)*t)
      .toString(16).padStart(2,'0')).join('');};
  const BG=tk('--bg'),INK=tk('--ink'),DIM=tk('--ink-dim'),FNT=tk('--ink-faint'),
        WARM=tk('--warm'),ACC=tk('--accent');
  const P=[BG,INK,DIM,FNT,WARM,ACC].every(okHex)?{
    core:[INK,INK,BG],                                   // 核心：墨面反白，最搶眼
    defn:[mixhex(BG,INK,.12),FNT,INK],                   // 判斷：中灰
    op  :[mixhex(BG,INK,.07),mixhex(BG,INK,.30),INK],    // 操作：暗灰
    warn:[WARM,ACC,'#FFFFFF'],                           // 陷阱：全站唯一的暖色重點
    sup :[mixhex(BG,INK,.04),mixhex(BG,INK,.20),DIM],    // 補充：最淡
  }:{
    core:['#EDEEF0','#EDEEF0','#12151A'],
    defn:['#2A2F38','#6B7280','#F2F4F7'],
    op  :['#20242B','#454B55','#E6E9EE'],
    warn:['#C25E2E','#E08A5B','#FFFFFF'],
    sup :['#181C22','#343A44','#9BA2AD'],
  };
  return String(src).replace(
    /^(\s*classDef\s+(\w+)\s+).*$/gm,
    (line,head,name)=>{
      const c=P[name];
      if(!c) return line;                    // 不認得的分類就原樣留著，不亂猜
      const dash=/stroke-dasharray/.test(line)?',stroke-dasharray: 4 3':'';
      // 防呆：色值含逗號（rgba/hsl）會拆散 classDef 的屬性分隔，整張圖直接語法錯誤。
      // 寧可跳過換膚保留原色，也不要產出一張炸彈圖。
      if(c.some(x=>String(x).includes(','))){
        console.warn('reskin: classDef 色值不可含逗號，已跳過',name,c);
        return line;
      }
      return `${head}fill:${c[0]},stroke:${c[1]},color:${c[2]}${dash}`;
    })
    /* 修 AI 產生筆記時寫錯的語法：`class A H core` 用空白分隔多個節點，
       但 mermaid 要求逗號（`class A,H core`）。整張圖會因此變成
       「Syntax error in text」的炸彈圖示——一個逗號不該讓整份觀念圖消失。
       只動節點清單那一段，最後一個 token 是類別名要留著。 */
    .replace(/^(\s*class\s+)([^\n]+)$/gm,(line,head,rest)=>{
      const parts=rest.trim().split(/\s+/);
      if(parts.length<3) return line;               // 已經是 `class A core` 的正常寫法
      const cls=parts.pop();
      return `${head}${parts.join(',').replace(/,+/g,',')} ${cls}`;
    });
}
async function renderMap(){
  const box=document.getElementById('vidMap'); if(!box) return;
  const n=NOTES, m=n?.map;
  if(!m||!((m.tldr||[]).length||(m.concepts||[]).length||(m.examples||[]).length)) return;
  try{ await ensureLibs(); }catch(e){ console.warn('思考地圖函式庫載入失敗',e); return; }
  if(NOTES!==n) return;                       // 載入期間換了片就丟棄這次結果
  const md=s=>sanitize(marked.parse(String(s||'')));
  const mm=s=>s?`<pre class="mermaid">${esc(reskin(s))}</pre>`:'';
  const parts=[`<div class="map-head"><h4>${ICO.map}<span>思考地圖</span></h4>
    <span>AI 讀逐字稿重構的觀念筆記${
      document.getElementById('vidModal')?.classList.contains('drive-preview')
        ? '——這個模式下時間戳點不動，影片在 Google 的框裡'
        : '——時間戳都能點，直接跳回影片'}</span></div>`];
  if((m.tldr||[]).length) parts.push(`<div class="map-sec">本集速覽</div>
    <ul class="map-tldr">${m.tldr.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`);
  if(m.flow) parts.push(`<div class="map-sec">概念脈絡</div>${mm(m.flow)}`);
  /* 公式卡：tex 直接交給 KaTeX，不走 markdown（避免 \\ 被當跳脫吃掉） */
  const fml=fs=>!(fs||[]).length?'':`<div class="fml">${fs.map(f=>
    `<div class="fml-card"><div class="fml-hd">${f.name?`<b>${esc(f.name)}</b>`:''}${
      f.when?`<span>${esc(f.when)}</span>`:''}</div>
      <div class="fml-body" data-tex="${esc(f.tex)}"></div></div>`).join('')}</div>`;
  const cmp=c=>!c?'':`<div class="cmp">${c.title?`<div class="cmp-t">${esc(c.title)}</div>`:''}
    <div class="cmp-wrap"><table class="cmp-tb"><thead><tr>${
      c.cols.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${
      c.rows.map(r=>`<tr>${r.map((x,i)=>i?`<td>${esc(x)}</td>`:`<th>${esc(x)}</th>`).join('')}</tr>`).join('')
    }</tbody></table></div></div>`;
  if((m.concepts||[]).length) parts.push(`<div class="map-sec">觀念重構</div>`+
    m.concepts.map(c=>`<details class="map-card" open><summary>${esc(c.name)}</summary>
      ${cmp(c.compare)}${mm(c.mermaid)}${c.svg?`<div class="map-svg">${sanitize(c.svg)}</div>`:''}
      ${fml(c.formulas)}
      ${c.md?`<div class="map-md">${md(c.md)}</div>`:''}
      ${c.sup?`<div class="map-sup">${md(c.sup)}</div>`:''}
      ${c.trap?`<div class="map-trap">⚠ ${esc(c.trap)}</div>`:''}</details>`).join(''));
  if((m.playbook||[]).length) parts.push(`<div class="map-sec">題型索引</div>
    <div class="cmp pbk"><div class="cmp-wrap"><table class="cmp-tb">
      <thead><tr><th>題目出現什麼</th><th>用哪招</th></tr></thead><tbody>${
      m.playbook.map(p=>`<tr><td>${esc(p.trigger)}</td><td>${esc(p.method)}</td></tr>`).join('')
    }</tbody></table></div></div>`);
  if((m.examples||[]).length) parts.push(`<div class="map-sec">例題消化</div>`+
    m.examples.map(e=>{
      // snapUrl 回空＝這份快照在目前的來源上不存在（例如影片走 Drive、快照沒上雲）。
      // 空的 src 會被解析成頁面自己的網址，畫出一張破圖，寧可整個 figure 不畫。
      const su=e.snap?snapUrl(NOTES_URL,e.snap):'';
      const img=su?`<figure class="map-snap">
          <img loading="lazy" src="${su}" alt="板書快照"
            onerror="this.parentNode.hidden=true">
          <figcaption>板書快照</figcaption></figure>`:'';
      return `<div class="map-card"><div class="map-ex-h">
          <button type="button" class="t-jump" data-t="${e.t}">${ICO.tiny}${hms(e.t)}</button>
          ${e.tag?`<span class="map-tag">${esc(e.tag)}</span>`:''}
          ${e.trigger?`<span class="ex-trig">${esc(e.trigger)}</span>`:''}</div>
        <div class="map-md">${md(e.md)}</div>
        ${e.trap?`<div class="map-trap">⚠ ${esc(e.trap)}</div>`:''}${img}</div>`;}).join(''));
  const extra=(n.snaps||[]).filter(s=>!(m.examples||[]).some(e=>e.snap===s.t))
    .map(s=>({...s,u:snapUrl(NOTES_URL,s.t)})).filter(s=>s.u);
  if(extra.length) parts.push(`<div class="map-sec">板書快照</div><div class="snap-grid">`+
    extra.map(s=>`<figure class="map-snap">
      <img loading="lazy" src="${s.u}" alt="" onerror="this.parentNode.hidden=true">
      <figcaption><button type="button" class="t-jump" data-t="${s.t}">${ICO.tiny}${hms(s.t)}</button>
        ${esc(s.cap||'')}</figcaption></figure>`).join('')+`</div>`);
  if((m.pitfalls||[]).length) parts.push(`<div class="map-sec">老師提醒的坑</div>
    <div class="pit">${m.pitfalls.map(p=>{
      const q=typeof p==='string'?{wrong:'',right:p,why:''}:p;   // 舊格式相容
      if(!q.wrong) return `<div class="pit-row" style="grid-template-columns:1fr">
        <div class="pit-o">${esc(q.right)}</div></div>`;
      return `<div><div class="pit-row"><div class="pit-x">${esc(q.wrong)}</div>
        <div class="pit-o">${esc(q.right)}</div></div>
        ${q.why?`<div class="pit-why">${esc(q.why)}</div>`:''}</div>`;
    }).join('')}</div>`);
  // 標題留在外層固定不動，其餘內容包一層 .map-scroll 自己捲。
  // 分欄樣式靠這個結構讓標題 sticky；窄畫面時 .map-scroll 只是普通容器，不影響。
  box.innerHTML=parts[0]+`<div class="map-scroll">${parts.slice(1).join('')}</div>`;
  try{
    renderMathInElement(box,{delimiters:[
      {left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],
      throwOnError:false});
    // 公式卡的 tex 是純內容不帶 $，直接餵 KaTeX 才不會被 markdown 的跳脫規則咬到
    box.querySelectorAll('[data-tex]').forEach(el=>{
      try{ katex.render(el.dataset.tex,el,{displayMode:true,throwOnError:false}); }
      catch(e){ el.textContent=el.dataset.tex; }
    });
  }catch(e){ console.warn('KaTeX',e); }
  box.hidden=false;                 // 必須先顯示：mermaid 在 hidden 容器裡量字寬全是 0，會畫出空圖
  syncTwoCol();                     // 先切成分欄再畫圖，讓 mermaid 量到的是分欄後的實際寬度
  try{
    // 字級與間距調大：預設值是給整頁寬度設計的，塞進 590px 的側欄會小到看不清
    // 配色不用 mermaid 內建主題——它的預設是飽和的藍紫紅綠，跟本站
    // 低彩度＋單一暖色重點的語彙互相打架，看起來像貼了一張別人的圖表。
    // 改成中性灰階節點＋只用 --ember 一個重點色，跟站上其餘部分同一套。
    /* T06：themeVariables 改吃 tokens（port 自 la-map mmTheme 的讀法）——
       中性墨階＋透明度分層，body.lt 重繫 token 後亮暗兩地自動成立。 */
    const csT=getComputedStyle(document.body);
    const inkRaw=csT.getPropertyValue('--ink').trim();
    const inkT=/^#[0-9a-fA-F]{6}$/.test(inkRaw)?inkRaw:'#E9EDF4';
    const inkN=parseInt(inkT.slice(1),16);
    const rgbaT=a=>'rgba('+(inkN>>16&255)+','+(inkN>>8&255)+','+(inkN&255)+','+a+')';
    const line=rgbaT(.34);
    const txt=inkT;
    const fill=rgbaT(.07);
    const fill2=rgbaT(.13);
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',
      theme:'base',
      themeVariables:{
        background:'transparent',
        primaryColor:fill, primaryBorderColor:line, primaryTextColor:txt,
        secondaryColor:fill2, secondaryBorderColor:line, secondaryTextColor:txt,
        tertiaryColor:fill2, tertiaryBorderColor:line, tertiaryTextColor:txt,
        mainBkg:fill, nodeBorder:line, nodeTextColor:txt,
        lineColor:line, edgeLabelBackground:'transparent', textColor:txt,
        clusterBkg:'transparent', clusterBorder:line,
        titleColor:txt, fontFamily:'Inter,"Noto Sans TC",sans-serif'
      },
      fontFamily:'Inter,"Noto Sans TC",sans-serif',fontSize:16,
      flowchart:{nodeSpacing:34,rankSpacing:44,padding:12,curve:'basis',useMaxWidth:true}});
    await mermaid.run({nodes:box.querySelectorAll('.mermaid')});
  }catch(e){ console.warn('Mermaid',e); }
  /* 保險：真的渲染失敗時，把那張「炸彈＋Syntax error」的圖收掉。
     一張看不懂的錯誤圖對讀者沒有任何價值，不如讓那一區空著。 */
  box.querySelectorAll('.mermaid').forEach(el=>{
    if(el.querySelector('.error-text')) el.remove();
  });
  const b=document.getElementById('vidMapBtn');
  if(b){ b.hidden=false; b.classList.add('on'); }
  vseekMarks();                    // 地圖載好才有章節與重點，這時才畫得出進度條標記
}

/* ---------- 逐字稿全文搜尋：search_index.json（make_notes.py 產生） ---------- */
let SIDX=null,SIDX_P=null,SRCH_T=0;
function loadSIdx(){
  if(SIDX_P) return SIDX_P;
  /* 逐字稿索引是媒體伺服器旁邊的檔案（跟著影片走），雲端沒有也不該有。
     不打那一槍：在 pages.dev 上它是混合內容，被瀏覽器擋掉之後還是走到同一個
     null，只是多一行紅字。下面的 doSearch 會說出為什麼。 */
  if(CLOUD) return Promise.resolve(null);
  SIDX_P=fetch(MEDIA_SRV+'search_index.json',{cache:'no-store'})
    .then(r=>{ if(!r.ok) throw 0; return r.json(); })
    .then(j=>SIDX=j)
    .catch(()=>{ SIDX_P=null; return null; });
  return SIDX_P;
}
function bindSearch(){
  const q=document.getElementById('wmQ'), pop=document.getElementById('wmQPop');
  if(!q||!pop) return;
  q.onfocus=()=>loadSIdx();
  q.oninput=()=>{ clearTimeout(SRCH_T); SRCH_T=setTimeout(doSearch,240); };
  q.onkeydown=ev=>{ if(ev.key==='Escape'){ pop.hidden=true; q.blur(); } };
  if(!document.body.dataset.srchDoc){
    document.body.dataset.srchDoc='1';
    document.addEventListener('click',ev=>{
      const p=document.getElementById('wmQPop');
      if(p&&!ev.target.closest('.wm-srch')) p.hidden=true;
    });
  }
}
async function doSearch(){
  const q=document.getElementById('wmQ'), pop=document.getElementById('wmQPop');
  if(!q||!pop) return;
  const term=q.value.trim();
  if(term.length<2){ pop.hidden=true; return; }
  await loadSIdx();
  if(!SIDX){
    pop.innerHTML=`<div class="srch-hd">${CLOUD
      ?'雲端沒有逐字稿搜尋——索引跟影片一起留在家裡的硬碟上'
      :'搜尋索引還沒建立——跑一次「補字幕與筆記.bat」就有了'}</div>`;
    pop.hidden=false; return;
  }
  const lo=term.toLowerCase(), hits=[];
  outer:
  for(const vd of SIDX.videos){
    for(const c of vd.cues){
      const i=c[1].toLowerCase().indexOf(lo);
      if(i>=0){ hits.push([vd,c[0],c[1],i]); if(hits.length>=80) break outer; }
    }
  }
  if(!hits.length){
    pop.innerHTML=`<div class="srch-hd">找不到「${esc(term)}」</div>`;
    pop.hidden=false; return;
  }
  const rows=hits.map(([vd,t,txt,i],n)=>{
    const a=Math.max(0,i-14);
    return `<button type="button" class="srch-row" data-srch="${n}">
      <b>${esc(spNorm(vd.code))}</b><i>${hms(t)}</i>
      <span>${a>0?'…':''}${esc(txt.slice(a,i))}<mark>${esc(txt.substr(i,term.length))}</mark>${
        esc(txt.slice(i+term.length,i+term.length+38))}</span></button>`;
  }).join('');
  pop.innerHTML=`<div class="srch-hd">${hits.length>=80?'80+':hits.length} 個片段（點了直接跳播）</div>`+rows;
  pop.hidden=false;
  pop.querySelectorAll('[data-srch]').forEach(b=>b.onclick=()=>{
    const [vd,t]=hits[+b.dataset.srch];
    const u=MEDIA_BASE+vd.rel.split('/').map(encodeURIComponent).join('/');
    pop.hidden=true;
    PENDING_SEEK=Math.max(0,t-3);        // 回退 3 秒讓句子有頭
    openPlayer(u, spNorm(vd.code)+'｜'+(vd.title||''), vd.code||'');
  });
}

/* 控制系統走 YouTube：內嵌在同一個播放視窗，不另開分頁。
   倍速與快轉交給 YouTube 自己的播放器（它的鍵盤快捷鍵也能用）。 */
function openYT(id,name){
  openPlayer('',name,undefined,true);
  const m=document.getElementById('vidModal');
  const v=m.querySelector('#vidEl'), fr=m.querySelector('#vidFrame');
  PL_CUR=null;
  v.pause(); v.removeAttribute('src'); v.load(); v.hidden=true;
  fr.hidden=false;
  fr.src=`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`
        +`?autoplay=1&rel=0&modestbranding=1&cc_load_policy=0`;
  m.classList.add('yt');
  // openPlayer 的空 url 分支在「顯示 modal」之前就早退（那是本機檔的防呆），
  // 所以 YT 路徑要自己把 modal 亮起來——否則同 session 先開過本機片再關閉後，
  // 這裡的 m.hidden 永遠是 true：iframe 有 src、.yt 有掛，畫面卻不出現。
  m.hidden=false; document.body.classList.add('modal-open');
  bgVideoPause();
  const box=document.getElementById('vidResume');
  if(box) box.innerHTML='';
}

function closePlayer(){
  PLAYER_LOAD++;
  const m=document.getElementById('vidModal'); if(!m) return;
  const v=m.querySelector('#vidEl'), fr=m.querySelector('#vidFrame');
  plSave(v);                       // 關閉前先落地，否則最後幾秒會遺失
  if(typeof driveMSEDetach === 'function') driveMSEDetach(v);
  v.pause(); v.removeAttribute('src'); v.load();
  if(fr){ fr.removeAttribute('src'); fr.hidden=true; }  // 移掉 iframe 才會真的停止播放
  v.hidden=false; m.classList.remove('yt','drive-preview');
  m.querySelector('.dv-bar')?.remove();   // 降級橫幅不該留到下一支影片
  PL_CUR=null;
  m.hidden=true; document.body.classList.remove('modal-open');
  bgVideoResume();
  renderStudy();                   // 讓清單上的「看到幾成」立刻更新
}
// 關分頁、切到別的視窗、電腦睡著都可能來不及存，這裡補一道
addEventListener('pagehide',()=>plSave(vidEl()));
/* 切到別的 App／鎖屏時：存進度，並把背景影片停掉。
   iPad 上 Safari 不一定會替你暫停背景那支 loop 影片——它 preload="auto"
   又一直循環，等於整段時間都在解碼一支看不到的影片。 */
addEventListener('visibilitychange',()=>{
  if(document.hidden){
    plSave(vidEl());
    const bg=document.querySelector('.bgvid');
    if(bg&&!bg.paused){ bg.pause(); bg.dataset.wasPlaying='1'; }
  }else{
    const bg=document.querySelector('.bgvid');
    // 只有原本在播、而且畫面確實看得到（待機模式）才恢復
    if(bg&&bg.dataset.wasPlaying==='1'&&document.body.dataset.mode==='home'){
      bg.play().catch(()=>{});
    }
    if(bg) delete bg.dataset.wasPlaying;
  }
});

function _febSelfCheck(){
  console.assert(dayDiff('2026-09-01','2026-07-24')===39,'dayDiff 39');
  console.assert(dayDiff('2026-09-01','2026-09-01')===0,'same day 0');
  console.assert(spNorm('115春矩陣(喻)01')==='115春矩陣01','spNorm 去講師標記');
  console.assert(bgTypeOf('assets/a.mp4')==='video'&&bgTypeOf('https://x/y.MP4?t=1')==='video','bgType video');
  console.assert(bgTypeOf('assets/a.jpg')==='image'&&bgTypeOf('https://x/pic')==='image','bgType image');
  console.assert(bgUrlOk('assets/a.mp4')&&bgUrlOk('https://x/y.jpg')&&bgUrlOk('data:image/png;base64,AA'),'url ok');
  console.assert(!bgUrlOk('javascript:alert(1)')&&!bgUrlOk('file:///c:/a.mp4'),'url rejected');
  // T03：內建背景收斂為 3（aurora/vellum/chalk，ADR-0002），自訂另計
  console.assert(document.querySelectorAll('#bgPills [data-theme]').length>=3,'bg pills rendered');
  // T10：新模組整合自檢（T07 複習排程、T08 重排、T05 佔位、tokens 契約）
  console.assert(typeof ReviewCore==='object'&&typeof ReviewCore.nextDue==='function','ReviewCore 存在');
  console.assert(ReviewCore.nextDue([],'2026-08-01','2026-12-01')==='2026-08-04','nextDue 新卡＝建立日+3');
  console.assert(ReviewCore.nextDue([{date:'2026-08-31',result:'pass'}],'2026-08-01','2026-12-01')==='2026-09-14','nextDue 連1 pass＝處理日+14');
  // T07b：匯入解析器（律法在 tests/review-core.test.js，這裡只驗整合有掛上）
  console.assert(ReviewCore.parseImport('控001 12 8/28 pass','2026-09-01').cards[0].history[0].date==='2026-08-28','parseImport 基本行');
  console.assert(typeof ReplanCore==='object'&&typeof ReplanCore.compute==='function','ReplanCore 存在');
  console.assert(ReplanCore.compute({chapters:[{id:'x',name:'x',h:2,w:1,dep:null}],doneIds:new Set(),daily:1,spent:0,daysLeft:4}).gap===-2,'ReplanCore 缺口算術');
  console.assert(!!document.getElementById('rvSlot'),'#rvSlot 佔位存在');
  console.assert(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()!=='','tokens.css 已載入');
  console.assert(document.documentElement.hasAttribute('data-intensity'),'html[data-intensity] 契約在');
  /* T20 編輯時戳：差集抓不到「刪除」就等於沒修——取消勾選會被伺服器聯集復活 */
  console.assert(edDiff('done',{a:'1'},{}).join()==='done:a','edDiff 抓到新增');
  console.assert(edDiff('done',{},{a:'1'}).join()==='done:a','edDiff 抓到刪除');
  console.assert(edDiff('miss',{a:2},{a:3}).join()==='miss:a','edDiff 抓到值變動');
  console.assert(edDiff('done',{a:'1'},{a:'1'}).length===0,'edDiff 沒變動就不蓋戳');
  console.assert(Object.keys(edPrune({o:'2000-01-01T00:00:00.000Z',
    n:new Date().toISOString()})).join()==='n','edPrune 汰除 90 天前的戳');
  console.assert(localProgress().edits&&typeof localProgress().edits==='object',
    '/sync payload 帶 edits');
  /* L3 Drive：三件會靜靜壞掉的事。
     ① 虛擬路徑與 sw.js 的 scope 對不上 → <video> 直接打到 Cloudflare 拿 404
     ② driveEntry 沒過 spNorm → 帳本明明有這一集卻查不到
     ③ 沒設 client_id 時功能必須是「完全不存在」，不是半殘 */
  console.assert(driveURL('X').startsWith(new URL('./',document.baseURI).href+'drive/'),
    'driveURL 與 SW scope 同一層');
  console.assert(driveIdFromURL(driveURL('a b'))==='a b','driveURL ⇄ driveIdFromURL 對得起來');
  console.assert(!DRIVE.clientId ? driveCompanionHTML('115春矩陣01','x')==='' : true,
    '沒有 client_id 就一個按鈕都不出現');
}
