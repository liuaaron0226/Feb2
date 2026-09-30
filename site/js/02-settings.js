/* ============ 地面＋即時天氣（Open-Meteo，免金鑰） ============ */
/* T03（ADR-0002 背景清單裁定）：graph／terrazzo／blueprint／onyx 退役刪除。
   aurora 氛圍場＝預設地面（所有模式的基底）；vellum 亮（驅動 body.lt）；
   chalk 暗；自訂上傳機制照舊。
   T15 design-expansion（使用者：「新增兩款桌布，請大膽設計，不過整體畫面
   要協調」）：類比自習材質家族補兩席——墨水 ink（暗，硯池藍黑＋墨暈慢漂）、
   牛皮紙 kraft（亮，纖維紋＋鉛筆頁界線，與 vellum 同走 body.lt）。
   地面樣式在 app.css GROUND 段；kraft 的 token 重繫在 app.css 亮地段。
   修訂三 #1（ADR-0002，2026-09-01 晚）：15 組合僅「描圖紙×餘燼」「夜湖×松青」
   獲認可——調色改為「每地面 curated 出廠配對」：切地面自動帶入定製燈色
   （PAL_OF_GROUND），之後手動點調色才成為覆蓋並持久化（feb-set.pal 存實名；
   'auto'＝隨地面）。 */
const BUILTIN_BG=[['aurora','夜湖 aurora'],['vellum','描圖紙'],['chalk','黑板'],['ink','墨水'],['kraft','牛皮紙']];
const VALID_BG=new Set(BUILTIN_BG.map(b=>b[0]));
const LIGHT_BG=new Set(['vellum','kraft']);   // 亮地：翻成深色文字（body.lt）
const readJSON=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const customBgs=()=>readJSON('feb-bg',[]);
/* 舊值遷移防護：feb-theme 存到退役主題（graph／terrazzo／blueprint／onyx，
   含更早的 mountain／ocean／forest）或已刪除的自訂 id 時，
   一律安靜 fallback 到 aurora 預設，不噴錯。 */
const curBg=()=>{
  const t=localStorage.getItem('feb-theme');
  if(!t) return 'aurora';
  if(VALID_BG.has(t)||customBgs().some(b=>b.id===t)) return t;
  return 'aurora';
};
/* 副檔名判型；認不出來就當圖片 */
const bgTypeOf=u=>/\.(mp4|webm|ogv|mov|m4v)(\?|#|$)/i.test(u)?'video':'image';
/* 只收得進 <video src> 或 CSS url() 的來源：站內相對路徑、http(s)、data:image */
const bgUrlOk=u=>/^(https?:\/\/|data:image\/|[.\w][^:]*$)/i.test(u.trim());

function applyTheme(t){
  const bg=customBgs().find(b=>b.id===t);
  const isVid=!!(bg&&bg.type==='video');
  const isImg=!!(bg&&bg.type==='image');
  document.body.dataset.theme=bg?'custom':t;
  document.body.classList.toggle('lt',LIGHT_BG.has(t));
  document.body.classList.toggle('media',isVid||isImg);
  document.body.classList.toggle('vid-on',isVid);
  document.body.classList.toggle('img-on',isImg);
  const v=document.querySelector('.bgvid'), c=document.querySelector('.cbg');
  c.style.backgroundImage=isImg?`url("${bg.url.replace(/"/g,'%22')}")`:'';
  if(!isVid){ v.pause(); v.removeAttribute('src'); v.load(); return; }
  const src=bg.url;
  if(v.getAttribute('src')!==src){ v.setAttribute('src',src); v.load(); }
  // 使用者要求減少動態時定格在第一幀
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) v.pause();
  else v.play().catch(()=>{});
}
function bgPills(del){
  const list=[...BUILTIN_BG.map(([id,name])=>({id,name,builtin:1})),...customBgs()], cur=curBg();
  return list.map(b=>`<button class="pill hit${b.id===cur?' on':''}" data-theme="${esc(b.id)}">`
    +esc(b.name)+(del&&!b.builtin?`<i data-del="${esc(b.id)}" data-tip="刪除" aria-label="刪除 ${esc(b.name)}">✕</i>`:'')+'</button>').join('');
}
function renderBgs(){
  /* T03 起背景膠囊只住在設定面板（#themePills 已隨待機畫面去框化移除） */
  const b=document.getElementById('bgPills');
  if(b) b.innerHTML=bgPills(true);
}
function selectBg(id){
  localStorage.setItem('feb-theme',id);
  /* 修訂三 #1：切地面＝回到該地面的 curated 出廠配對，先前的手動覆蓋作廢。
     覆蓋只在「切完地面之後再點調色」時重新成立並持久化（saveSet 在 pal 點擊處）。 */
  if(SET.pal!=='auto'){ SET.pal='auto'; saveSet(); }
  applyTheme(id); applyPal(); renderBgs(); syncSetPills();
}
function initTheme(){ applyTheme(curBg()); renderBgs(); }
/* 背景膠囊只在這兩個容器裡認（body 自己也有 data-theme，全域 closest 會誤中） */
document.addEventListener('click',e=>{
  const d=e.target.closest('#bgPills [data-del]');
  if(d){
    e.stopPropagation();
    const id=d.dataset.del;
    localStorage.setItem('feb-bg',JSON.stringify(customBgs().filter(b=>b.id!==id)));
    /* 讀原始鍵值而非 curBg()：清單剛被過濾，curBg() 已經 fallback，
       比對會失準，畫面會停在已刪除的背景上 */
    if(localStorage.getItem('feb-theme')===id) selectBg('aurora'); else renderBgs();
    return;
  }
  const p=e.target.closest('#bgPills [data-theme]');
  if(p) selectBg(p.dataset.theme);
});
function wxOf(c){
  if(c<=1) return ['clear','晴'];
  if(c<=3) return ['cloud',c===2?'多雲':'陰'];
  if(c===45||c===48) return ['fog','霧'];
  if((c>=51&&c<=67)||(c>=80&&c<=82)) return ['rain','雨'];
  if((c>=71&&c<=77)||c===85||c===86) return ['snow','雪'];
  if(c>=95) return ['storm','雷雨'];
  return ['cloud','多雲'];
}
/* ============ 綿綿細雨：canvas 逐滴，落點隨機、依遠近分層 ============ */
function initRain(){
  const cv=document.getElementById('rainCv');
  if(!cv||!cv.getContext) return ()=>{};
  const ctx=cv.getContext('2d');
  let W=0,H=0,drops=[],raf=0,running=false,storm=false,last=0;
  function resize(){
    const dpr=Math.min(devicePixelRatio||1,2);   // 依實際像素密度繪製，2K 下雨絲才不會糊
    W=cv.clientWidth||innerWidth; H=cv.clientHeight||innerHeight;
    cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  /* z：0 遠 → 1 近。遠的短、慢、淡、細，近的長、快、亮、粗，疊起來才有景深 */
  const mk=()=>{ const z=Math.random()**1.5; return {
    x:Math.random()*W, y:Math.random()*H,
    len:4+z*7+(storm?z*18:0),
    v:70+z*130+(storm?z*430:0),
    a:.07+z*.16+(storm?.14:0),
    w:.5+z*.45+(storm?.3:0),
    ph:Math.random()*6.28 };
  };
  function build(){
    const n=Math.round((storm?460:260)*Math.max(.6,Math.min(W*H/2e6,2.4)));
    drops=Array.from({length:n},mk);
  }
  function frame(t){
    if(!running) return;
    const dt=Math.min((t-last)/1000||0,.05); last=t;
    ctx.clearRect(0,0,W,H);
    ctx.lineCap='round';
    const tilt=storm?.3:.14;
    for(const d of drops){
      d.y+=d.v*dt; d.ph+=dt*1.1;
      // 細雨會被風輕輕吹歪，每滴擺動相位不同
      const dx=d.len*tilt+(storm?0:Math.sin(d.ph)*.7);
      ctx.strokeStyle=`rgba(198,226,255,${d.a})`;
      ctx.lineWidth=d.w;
      ctx.beginPath(); ctx.moveTo(d.x,d.y); ctx.lineTo(d.x-dx,d.y-d.len); ctx.stroke();
      if(d.y-d.len>H){ d.y=-Math.random()*60; d.x=Math.random()*W; }  // 落點每輪重抽
    }
    raf=requestAnimationFrame(frame);
  }
  addEventListener('resize',()=>{ if(running){ resize(); build(); } });
  return function sync(){
    const wx=document.body.dataset.wx;
    /* study：天氣層整組隱藏（安靜化），雨滴迴圈不該在看不見時燒 GPU */
    const want=(wx==='rain'||wx==='storm')
      &&document.body.dataset.mode!=='study'
      &&!matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wasStorm=storm; storm=wx==='storm';
    if(want&&running){ if(wasStorm!==storm) build(); return; }
    running=want;
    if(!want){ cancelAnimationFrame(raf); if(W) ctx.clearRect(0,0,W,H); return; }
    resize(); build(); last=performance.now(); raf=requestAnimationFrame(frame);
  };
}
const rainSync=initRain();

/* API 的實測值；設定裡改成手動時只是不套用，值仍持續更新 */
const live={wx:'clear',day:true,label:''};
function applySky(){
  document.body.dataset.wx = SET.wx==='auto'?live.wx:SET.wx;
  document.body.classList.toggle('day', SET.day==='auto'?live.day:SET.day==='day');
  rainSync();
}
async function fetchWx(){
  const geo = readJSON('feb-geo',null) || {lat:25.04,lon:121.56};
  try{
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=weather_code,is_day,temperature_2m`);
    const c=(await r.json()).current;
    const [wx,label]=wxOf(c.weather_code);
    live.wx=wx; live.day=c.is_day===1;
    live.label=`${label} ${Math.round(c.temperature_2m)}°C`;
    applySky();
    /* 天氣「徽章讀數」全模式可見：home 用 #wxBadge，exam/study 用頂欄 #wxTop */
    document.getElementById('wxBadge').textContent=live.label;
    const wt=document.getElementById('wxTop'); if(wt) wt.textContent=live.label;
  }catch(e){ /* 離線時保持上次狀態 */ }
}
function initWeather(){
  if(!localStorage.getItem('feb-geo') && navigator.geolocation){
    navigator.geolocation.getCurrentPosition(p=>{
      localStorage.setItem('feb-geo',JSON.stringify({lat:+p.coords.latitude.toFixed(3),lon:+p.coords.longitude.toFixed(3)}));
      fetchWx();
    },()=>{},{timeout:8000,maximumAge:36e5});
  }
  fetchWx();
  setInterval(fetchWx,30*60*1000);
}
/* ============ 角落設定：背景、調色、晝夜、天氣、筆試日 ============ */
/* T15：feb-set 擴一個可選欄位 pal（shape-compatible：舊檔沒有此鍵＝隨地面）。
   修訂三 #1：pal 語意升級——'auto'（新預設）＝隨地面 curated 配對；
   實名（ember/indigo/pine）＝手動覆蓋。另加 palX 遷移標記（shape-compatible：
   舊碼讀到多一鍵不影響；舊碼讀到 pal:'auto' 走原 fallback → ember，安全降級）。 */
const RAW_SET=readJSON('feb-set',{});
const SET=Object.assign({day:'auto',wx:'auto',exam:'2027-02-01',pal:'auto'},RAW_SET);
/* 遷移：palX 之前的 pal 是「三盤直選」時代寫進去的（預設 ember 也會被整包
   寫檔，無從分辨手選或預設），而使用者已裁定 15 組合僅兩組存活——舊值一律
   視為未覆蓋，回歸 curated 配對。之後只有調色膠囊的點擊會寫入實名 pal。 */
if(!RAW_SET.palX) SET.pal='auto';
SET.palX=1;
const saveSet=()=>localStorage.setItem('feb-set',JSON.stringify(SET));
/* ---- 調色 palettes（T15）：只重繫 ember 雙階（tokens.css body[data-pal]）。
   學科色／狀態色是 reserved semantics，調色永不碰。
   curated 出廠配對（修訂三 #1）：夜湖→松青、描圖紙→餘燼（使用者認可的
   兩組錨點）、黑板→松青粉綠步、墨水→靛夜墨藍步、牛皮紙→餘燼深褐步
   （app.css kraft 重繫）；自訂上傳→餘燼（媒體蓋景，燈色回預設雙階）。
   legacy 防護：pal 存到未知值 → 視同 'auto' 隨地面。 */
const VALID_PAL=new Set(['ember','indigo','pine']);
const PAL_OF_GROUND={aurora:'pine',vellum:'ember',chalk:'pine',ink:'indigo',kraft:'ember'};
const PAL_NAME={ember:'餘燼',indigo:'靛夜',pine:'松青'};
const curPal=()=>VALID_PAL.has(SET.pal)?SET.pal:(PAL_OF_GROUND[curBg()]||'ember');
function applyPal(){
  const p=curPal();
  if(p==='ember') delete document.body.dataset.pal;   // 預設＝無屬性（現況雙階）
  else document.body.dataset.pal=p;
}
function setMsg(t){ const el=document.getElementById('bgMsg'); if(el) el.textContent=t||''; }
function addBg(name,url,type){
  const list=customBgs();
  list.push({id:'c'+Date.now().toString(36),name:(name||'自訂').slice(0,12),url,type});
  try{ localStorage.setItem('feb-bg',JSON.stringify(list)); }
  catch(e){ setMsg('瀏覽器儲存空間滿了，先刪掉幾個自訂背景'); return false; }
  renderBgs(); selectBg(list[list.length-1].id); setMsg(''); return true;
}
function syncSetPills(){
  const mark=(sel,attr,val)=>document.querySelectorAll(sel).forEach(b=>b.classList.toggle('on',b.dataset[attr]===val));
  mark('#dayPills [data-day]','day',SET.day);
  mark('#wxPills [data-wxset]','wxset',SET.wx);
  /* 調色（修訂三 #1）：auto＝「隨地面」膠囊亮起並讀出當前地面的出廠燈色；
     實名＝該覆蓋膠囊亮起。膠囊文字是讀數（回答「現在是哪盞燈、誰決定的」）。 */
  mark('#palPills [data-pal]','pal',VALID_PAL.has(SET.pal)?SET.pal:'auto');
  /* 標籤讀「這片地面的出廠燈色」而非 curPal()：覆蓋生效時 curPal() 是覆蓋值，
     但「隨地面」膠囊要回答的是「點我會變哪盞」。 */
  const au=document.querySelector('#palPills [data-pal="auto"]');
  if(au) au.textContent=`隨地面 · ${PAL_NAME[PAL_OF_GROUND[curBg()]||'ember']}`;
}
function initSettings(){
  const btn=document.getElementById('setBtn'), panel=document.getElementById('setPanel');
  const open=v=>{ panel.hidden=!v; btn.setAttribute('aria-expanded',v); if(v) syncSetPills(); };
  btn.onclick=e=>{ e.stopPropagation(); open(panel.hidden); };
  document.addEventListener('click',e=>{
    /* 背景膠囊點選後 renderBgs() 會整排重繪，點到的節點已脫離 DOM，
       panel.contains() 判不到，面板會被誤判為「點外面」而關掉——
       補認 .pill／[data-del] 自身（脫離的節點 closest 自己仍成立） */
    if(!panel.hidden && !panel.contains(e.target) && e.target!==btn
       && !e.target.closest('.pill,[data-del]')) open(false);
  });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') open(false); });

  document.getElementById('bgAdd').onclick=()=>{
    const url=document.getElementById('bgUrl').value.trim();
    const name=document.getElementById('bgName').value.trim();
    if(!url) return setMsg('先填網址');
    if(!bgUrlOk(url)) return setMsg('只收 http(s) 網址或站內相對路徑');
    if(addBg(name||url.split('/').pop().slice(0,12),url,bgTypeOf(url))){
      document.getElementById('bgUrl').value=''; document.getElementById('bgName').value='';
    }
  };
  document.getElementById('bgFile').onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    /* 檔名讀數：值夜 #3 的 label 化讓原生「已選檔案」字樣消失，這裡補回。
       顯示「最後挑的那個檔」；超限被拒時檔名照留，錯誤訊息走 setMsg。 */
    const nm=document.getElementById('bgFileName');
    if(nm) nm.textContent=f.name;
    if(f.size>1.5*1024*1024) return setMsg('超過 1.5MB，請先縮圖或改用網址');
    const r=new FileReader();
    r.onload=()=>addBg(f.name.replace(/\.[^.]+$/,''),r.result,'image');
    r.readAsDataURL(f);
    e.target.value='';
  };
  panel.addEventListener('click',e=>{
    const d=e.target.closest('[data-day]'), w=e.target.closest('[data-wxset]'),
          pl=e.target.closest('[data-pal]');
    if(d){ SET.day=d.dataset.day; saveSet(); applySky(); }
    if(w){ SET.wx=w.dataset.wxset; saveSet(); applySky(); }
    if(pl){ SET.pal=pl.dataset.pal; saveSet(); applyPal(); }
    if(d||w||pl) syncSetPills();
  });
  const ed=document.getElementById('examDate');
  ed.value=SET.exam;
  ed.onchange=()=>{ if(ed.value){ SET.exam=ed.value; saveSet(); tickClock(); renderRail(); } };
}
/* 分頁不可見時凍結場景動畫（CSS body.page-hidden 接手；省電機制 T03） */
document.addEventListener('visibilitychange',()=>{
  document.body.classList.toggle('page-hidden',document.hidden);
});
initTheme(); applyPal(); initWeather(); applySky(); initSettings();

/* ============ 待機時鐘＋倒數＋簽名件倒數尺 ============ */
// 116 筆試估約 2027/2 上旬，簡章公告後可在角落設定裡改
const examDay=()=>{ const d=new Date(SET.exam+'T08:00:00+08:00'); return isNaN(d)?new Date('2027-02-01T08:00:00+08:00'):d; };

/* D-n 倒數尺（T15 擴建：出發夜 → 筆試，燒過的夜留在尺上）：
   自衝刺出發夜（sprint.json start；fetch 前用同值常數）至筆試日（feb-set），
   一格一夜、全寬出血。已燒之夜＝餘燼殘火段（--warm 低透明＋~90s 一道微光），
   今夜＝燃點慢脈動，未來越遠越淡；跨月首夜掛月份標；里程夜掛菱形標
   （出發火點／9·12 第一輪完食／9·13 控制接棒／終點前夜）。
   互動（hover 講夜、點擊讀出、鍵盤巡夜）在下方 rail-life 段。
   開機掃描一次即熄（reduced-motion 由 tokens.css 全滅，靜止即完成態）。 */
const SPRINT_START='2026-08-20';   // data/sprint.json start 的同值常數：首繪在 fetch 之前
const RAIL={N:0,total:0,today:0,sel:null,hov:null,miles:{},ticks:[]};
const railEpoch=()=>{
  const s=(SPRINT_PLAN&&SPRINT_PLAN.start)||SPRINT_START;
  const d=new Date(s+'T00:00:00');
  return isNaN(d)?new Date(SPRINT_START+'T00:00:00'):d;
};
function renderRail(){
  const rail=document.getElementById('homeRail');
  const months=document.getElementById('homeRailMonths');
  if(!rail||!months) return;
  const now=new Date(); now.setHours(0,0,0,0);
  renderRail._d=now.getDate();
  const p2=x=>String(x).padStart(2,'0');
  const ep=railEpoch();
  const ex=new Date(SET.exam+'T00:00:00');
  const end=isNaN(ex)?new Date('2027-02-01T00:00:00'):ex;
  /* 夜的算術：total＝出發夜起算到筆試前夜的夜數（8/20→2/1＝165 夜；
     筆試晨不是夜）。今夜 idx＝已燒夜數（0-based）。 */
  const total=Math.max(2,Math.round((end-ep)/864e5));
  const N=Math.min(total,366);   // 尺最多畫一年份的格；「夜 n/total」讀數不受此限
  const ti=Math.min(N-1,Math.max(0,Math.round((now-ep)/864e5)));
  /* 里程夜（衝刺資料未到時用同值常數；週章回等 hover 時再讀，屆時必已載入） */
  const sp=SPRINT_PLAN||{};
  const idxOf=ds=>{ if(!ds) return -1; const d=new Date(ds+'T00:00:00'); return isNaN(d)?-1:Math.round((d-ep)/864e5); };
  const miles={};
  const iS=idxOf(sp.start||SPRINT_START);
  if(iS>=0&&iS<N) miles[iS]={cls:'mk-start',tip:'衝刺出發 · 24 天完食第一輪'};
  const iD=idxOf(sp.deadline||'2026-09-12');
  if(iD>0&&iD<N) miles[iD]={cls:'mk-turn',tip:'第一輪完食夜 · 衝刺最終夜'};
  if(iD>=0&&iD+1<N&&iD+1!==N-1) miles[iD+1]={cls:'mk-turn',tip:'控制接棒 · 第二棒開跑'};
  if(N===total) miles[N-1]={cls:'mk-end',tip:'終點前夜 · 睡醒即筆試'};
  RAIL.N=N; RAIL.total=total; RAIL.today=ti; RAIL.sel=null; RAIL.hov=null; RAIL.miles=miles;
  rail.innerHTML=''; months.innerHTML='';
  const frag=document.createDocumentFragment();
  for(let i=0;i<N;i++){
    const d=new Date(ep.getFullYear(),ep.getMonth(),ep.getDate()+i);
    const t=document.createElement('i');
    t.className='tick';
    let o;
    if(i===ti){ t.classList.add('today'); o=1; }                 // 今夜＝燃點
    else if(i<ti){ t.classList.add('gone'); o=1; }               // 已燒之夜（透明度在 CSS 餘燼段）
    else{ o=Math.max(.24,.9-((i-ti)/Math.max(1,N-ti))*.62); }    // 未來越遠越淡
    if(i>0&&d.getDate()===1){
      t.classList.add('m1'); if(i>ti) o=Math.min(1,o+.2);
      /* 距首尾兩端 6% 以內的月份標會撞到「出發／筆試」端標，跳過不掛 */
      const pos=i/(N-1);
      if(pos>.06&&pos<.94){
        const s=document.createElement('span');
        s.className='mlabel';
        s.style.left=(pos*100)+'%';
        s.textContent=p2(d.getMonth()+1);
        months.appendChild(s);
      }
    }
    if(miles[i]) t.classList.add('mile',miles[i].cls);
    t.style.setProperty('--o',o);
    t.style.setProperty('--i',i);
    frag.appendChild(t);
  }
  rail.appendChild(frag);
  /* 餘燼微光：只罩住已燒段（寬度＝已燒佔比），~92s 一道掃過（CSS railglint） */
  const glint=document.createElement('span');
  glint.className='rail-glint';
  glint.setAttribute('aria-hidden','true');
  glint.style.setProperty('--burn',(ti/(N-1)*100).toFixed(2)+'%');
  glint.appendChild(document.createElement('i'));
  rail.appendChild(glint);
  RAIL.ticks=Array.from(rail.querySelectorAll('.tick'));
  const s0=document.createElement('span');
  s0.className='mlabel start';
  s0.textContent=`${p2(ep.getMonth()+1)}·${p2(ep.getDate())} 出發`;
  const s1=document.createElement('span');
  s1.className='mlabel end';
  s1.textContent=`${p2(end.getMonth()+1)}·${p2(end.getDate())} 筆試`;
  months.append(s0,s1);
  /* 端標防撞（T15：epoch 起算後首月標可能落在「出發」端標身上，390 尤甚）：
     量測後撞到端標的月份標直接摘掉——月份資訊在 hover/巡夜讀數裡都有。 */
  const r0=s0.getBoundingClientRect(), r1=s1.getBoundingClientRect();
  if(r0.width>0){   // display:none（exam/study 落點還原）時量不到，全數保留
    months.querySelectorAll('.mlabel:not(.start):not(.end)').forEach(m=>{
      const r=m.getBoundingClientRect();
      if(r.left<r0.right+8||r.right>r1.left-8) m.remove();
    });
  }
  rail.setAttribute('aria-label',
    `倒數尺：自 ${ep.getFullYear()}-${p2(ep.getMonth()+1)}-${p2(ep.getDate())} 出發夜至 `
    +`${end.getFullYear()}-${p2(end.getMonth()+1)}-${p2(end.getDate())} 筆試共 ${total} 夜，`
    +`一格一夜；已燒 ${ti} 夜，今夜第 ${ti+1} 夜。左右鍵逐夜、上下鍵逐週巡夜，Enter 開讀出`);
  rail.setAttribute('aria-valuemin','1');
  rail.setAttribute('aria-valuemax',String(N));
  railAriaNow(ti);
  /* 「今夜 ●」讀數＋倒數算術 tooltip（點一下也吐同一份——觸控沒有 hover） */
  const tn=document.getElementById('railTonight');
  if(tn){
    tn.innerHTML=`今夜 <b aria-hidden="true">●</b> 夜 ${ti+1}/${total}`;
    tn.dataset.tip=`${p2(ep.getMonth()+1)}·${p2(ep.getDate())} 出發 → ${p2(end.getMonth()+1)}·${p2(end.getDate())} 筆試＝${total} 夜\n`
      +`已燒 ${ti} 夜 · 今夜第 ${ti+1} 夜 · 今夜之後還剩 ${total-ti-1} 夜`;
  }
  const live=document.getElementById('railLive');
  if(live){ live.hidden=true; live.innerHTML=''; }
  rail.classList.add('scan');
  clearTimeout(renderRail._t);
  renderRail._t=setTimeout(()=>rail.classList.remove('scan'),N*7+400);
}

/* ---- rail-life（T15：每個互動回答一個真問題）----
   hover 一夜 → #vizTip：這夜是哪天／第幾夜／該週在讀哪些科（sprint.json）；
   點一夜 → 尺下安靜讀出（去框化：ember 脊線＋縮排，不是浮層）：
   該週章回＋「進入讀書模式」ghost 鈕；
   鍵盤：尺可聚焦（slider 語意），←→ 逐夜、↑↓ 逐週、Home/End 兩端、
   Enter/Space 開合讀出、Esc 關。tooltip 一律走 #vizTip 共用件
   （tipEl/tipMove 定義在 04-render-exam，互動時必已載入，typeof 防護）。 */
const NIGHT_WD='日一二三四五六';
function railDate(i){ const ep=railEpoch(); return new Date(ep.getFullYear(),ep.getMonth(),ep.getDate()+i); }
function railWeekOf(i){
  const sp=SPRINT_PLAN;
  if(!sp||!sp.deadline) return 0;
  const last=Math.round((new Date(sp.deadline+'T00:00:00')-railEpoch())/864e5);
  if(isNaN(last)||i<0||i>last) return 0;   // 衝刺窗之外＝無週次
  return Math.floor(i/7)+1;
}
function railWeekSubs(w){
  const sp=SPRINT_PLAN;
  if(!w||!sp||!Array.isArray(sp.subjects)) return [];
  return sp.subjects
    .map(s=>({name:s.name,ch:(s.chapters||[]).filter(c=>c.week===w)}))
    .filter(s=>s.ch.length);
}
function railNightLine(i){
  const ti=RAIL.today;
  if(i===ti) return '就是今夜';
  return i<ti?`${ti-i} 夜前 · 已燒`:`還有 ${i-ti} 夜`;
}
function railTipText(i){
  const p2=x=>String(x).padStart(2,'0');
  const d=railDate(i);
  const lines=[`${p2(d.getMonth()+1)}·${p2(d.getDate())} 週${NIGHT_WD[d.getDay()]} · 夜 ${i+1}/${RAIL.total} · ${railNightLine(i)}`];
  const w=railWeekOf(i);
  if(w){
    const subs=railWeekSubs(w);
    lines.push(subs.length?`衝刺 W${w} · ${subs.map(s=>s.name).join('、')}`:`衝刺 W${w}`);
  }
  if(RAIL.miles[i]) lines.push(`◆ ${RAIL.miles[i].tip}`);
  return lines.join('\n');
}
function railPlanHTML(i){
  const p2=x=>String(x).padStart(2,'0');
  const d=railDate(i);
  const w=railWeekOf(i);
  const mk=RAIL.miles[i];
  const head=`${p2(d.getMonth()+1)}·${p2(d.getDate())} 週${NIGHT_WD[d.getDay()]} · 夜 ${i+1}/${RAIL.total}`
    +(w?` · W${w}`:'')+(mk?` · ◆ ${esc(mk.tip)}`:'');
  const sp=SPRINT_PLAN;
  let plan;
  if(!sp) plan='衝刺資料載入中…';
  else if(w){
    const subs=railWeekSubs(w);
    plan=subs.length
      ?subs.map(s=>`${esc(s.name)}：${s.ch.map(c=>esc(c.name)+' '+c.hours+'h').join('、')}`).join('　')
      :`衝刺 W${w}`;
  }else plan='第一輪衝刺之後 · 這夜的章回由讀書模式的重排接手';
  return `<span class="rl-date">${head}</span>`
    +`<button class="btn ui-ghost hit" type="button" data-rl-go>進入讀書模式</button>`
    +`<button class="rl-x hit" type="button" data-rl-x aria-label="關閉讀出">✕</button>`
    +`<span class="rl-plan">${plan}</span>`;
}
function railAriaNow(i){
  const rail=document.getElementById('homeRail');
  if(!rail) return;
  rail.setAttribute('aria-valuenow',String(i+1));
  rail.setAttribute('aria-valuetext',railTipText(i).replace(/\n/g,'，'));
}
function railPaintSel(){ RAIL.ticks.forEach((t,j)=>t.classList.toggle('sel',j===RAIL.sel)); }
function railHov(i){
  if(RAIL.hov===i) return;
  RAIL.hov=i;
  RAIL.ticks.forEach((t,j)=>t.classList.toggle('hov',j===i));
}
function selectNight(i,toggle){
  const live=document.getElementById('railLive');
  if(!live||RAIL.N<2) return;
  i=Math.max(0,Math.min(RAIL.N-1,i));
  if(toggle&&RAIL.sel===i){
    RAIL.sel=null; live.hidden=true; live.innerHTML=''; railPaintSel(); return;
  }
  RAIL.sel=i;
  live.innerHTML=railPlanHTML(i);
  live.hidden=false;
  railPaintSel(); railAriaNow(i);
  const go=live.querySelector('[data-rl-go]');
  if(go) go.onclick=()=>switchMode('study');
  const x=live.querySelector('[data-rl-x]');
  if(x) x.onclick=()=>selectNight(RAIL.sel,true);
}
function initRailLife(){
  const zone=document.querySelector('.rail-bleed');
  const rail=document.getElementById('homeRail');
  if(!zone||!rail) return;
  const idxAt=e=>{
    const r=rail.getBoundingClientRect();
    if(r.width<2||RAIL.N<2) return 0;
    const p=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));
    return Math.round(p*(RAIL.N-1));
  };
  zone.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch') return;   // 觸控走點擊讀出，不搶捲動
    const i=idxAt(e); railHov(i);
    if(typeof tipEl!=='function') return;
    const t=tipEl(); t.textContent=railTipText(i); t.hidden=false; tipMove(e);
  });
  zone.addEventListener('pointerleave',()=>{
    railHov(null);
    /* 只收自己亮的 tip：TIP_CUR 有主（data-tip 元素）就不越權 */
    if(typeof tipHide==='function'&&!TIP_CUR) tipHide();
  });
  zone.addEventListener('click',e=>selectNight(idxAt(e),true));
  rail.addEventListener('keydown',e=>{
    const cur=RAIL.sel==null?RAIL.today:RAIL.sel;
    let n=null;
    if(e.key==='ArrowRight') n=cur+1;
    else if(e.key==='ArrowLeft') n=cur-1;
    else if(e.key==='ArrowUp') n=cur+7;
    else if(e.key==='ArrowDown') n=cur-7;
    else if(e.key==='Home') n=0;
    else if(e.key==='End') n=RAIL.N-1;
    else if(e.key==='Enter'||e.key===' ') n=cur;
    else if(e.key==='Escape'&&RAIL.sel!=null){ e.preventDefault(); selectNight(RAIL.sel,true); return; }
    if(n==null) return;
    e.preventDefault();
    selectNight(n,e.key==='Enter'||e.key===' ');
  });
  const tn=document.getElementById('railTonight');
  if(tn) tn.onclick=e=>{
    if(typeof tipEl!=='function') return;
    const t=tipEl(); t.textContent=tn.dataset.tip||''; t.hidden=false; tipMove(e);
    clearTimeout(initRailLife._tt);
    initRailLife._tt=setTimeout(()=>{ if(typeof tipHide==='function'&&!TIP_CUR) tipHide(); },2600);
  };
}
initRailLife();

function tickClock(){
  const n=new Date();
  document.getElementById('clock').innerHTML =
    `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}<small>${String(n.getSeconds()).padStart(2,'0')}</small>`;
  document.getElementById('homeDate').textContent =
    `${n.getFullYear()}.${String(n.getMonth()+1).padStart(2,'0')}.${String(n.getDate()).padStart(2,'0')} 週${'日一二三四五六'[n.getDay()]}`;
  const d=Math.ceil((examDay()-n)/864e5);
  const hc=document.getElementById('homeCount');
  const html=d>0?`<b class="mono">D-${d}</b>距 ${esc(SET.exam)} 筆試 · 一格一夜`:'筆試季';
  if(hc.innerHTML!==html) hc.innerHTML=html;
  /* 跨夜（或首次呼叫）就重畫倒數尺：昨夜的格今晨自動熄掉 */
  if(renderRail._d!==n.getDate()) renderRail();
}
tickClock(); setInterval(tickClock,1000);

/* ── 值夜 stamp 2026-09-01（v42）：feb-set.pal 語意升級 'auto'＝隨地面
   curated 配對（PAL_OF_GROUND）；palX 一次性遷移；切地面清覆蓋、
   點實名盤才持久化覆蓋（ADR-0002 修訂三 #1）。 ── */
