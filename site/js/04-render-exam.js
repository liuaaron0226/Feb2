/* =====================================================================
   04-render-exam.js — 考古題模式 render 層（T04 重設計）
   依據：ADR-0002（A×B 融合＋去框化法）、docs/render-discipline.md、
   design-system.html（pattern 來源）、dataviz skill（熱度表／長條圖）。
   資料層（DATA/INDEX/ANA fetch 與運算）不動；此檔只吃 JS 狀態、吐 HTML。
   ===================================================================== */

/* ---------- 共用：--ease 的 JS 對應 ----------
   cubic-bezier(.22,1,.36,1) 逐字展開（同 app.css keyframe 慣例，值以 tokens 為準）；
   rAF 動畫（count-up）吃不到 CSS timing-function，只能自己解曲線。 */
const febEase = (() => {
  const X1 = .22, X2 = .36;               // Y1=Y2=1
  const bx = t => 3*t*(1-t)*(1-t)*X1 + 3*t*t*(1-t)*X2 + t*t*t;
  const by = t => 3*t*(1-t)*(1-t) + 3*t*t*(1-t) + t*t*t;
  return p => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let lo = 0, hi = 1, t = p;
    for (let i = 0; i < 24; i++) {
      const x = bx(t);
      if (Math.abs(x - p) < 1e-4) break;
      x < p ? lo = t : hi = t;
      t = (lo + hi) / 2;
    }
    return by(t);
  };
})();

/* ---------- 共用 dataviz tooltip（熱度格／跨校長條）----------
   dataviz 法：一個共用的定位 tooltip 元素，狀態存 JS（TIP_CUR），不存 DOM。
   render-discipline：#vizTip 掛 body 直屬（同 #toast 慣例），永不被 innerHTML 重建。 */
let TIP = null, TIP_CUR = null;
function tipEl(){
  if (!TIP) {
    TIP = document.createElement('div');
    TIP.id = 'vizTip';
    TIP.setAttribute('role', 'status');
    TIP.hidden = true;
    document.body.appendChild(TIP);
  }
  return TIP;
}
function tipMove(e){
  const t = tipEl(), pad = 14, w = t.offsetWidth, h = t.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth - 8)  x = e.clientX - w - pad;
  if (y + h > innerHeight - 8) y = e.clientY - h - pad;
  t.style.transform = `translate(${Math.max(4,x)}px,${Math.max(4,y)}px)`;
}
function tipHide(){ if (TIP) TIP.hidden = true; TIP_CUR = null; }
addEventListener('pointerover', e => {
  const el = e.target.closest?.('[data-tip]');
  if (!el) { if (TIP_CUR) tipHide(); return; }
  if (el !== TIP_CUR) {
    const t = tipEl();
    TIP_CUR = el;
    t.textContent = el.dataset.tip;   // textContent：tooltip 內容一律當資料
    t.hidden = false;
    tipMove(e);
  }
});
addEventListener('pointermove', e => { if (TIP_CUR) tipMove(e); });
addEventListener('pointerout',  e => {
  if (TIP_CUR && !(e.relatedTarget && e.relatedTarget.closest?.('[data-tip]'))) tipHide();
});
addEventListener('scroll', () => { if (TIP_CUR) tipHide(); }, {passive:true, capture:true});

/* ---------- hero：去框化讀數（決策 A）----------
   數字直接站在 aurora 場上：IBM Plex Mono 大讀數＋mono 眉標。
   count-up 保留、改校準 token：時長 --dur×3＝960ms、曲線 --ease。 */
function renderStats(){
  const got = INDEX.filter(e=>e.status==='downloaded').length;
  const progs = DATA.channels.reduce((n,c)=>n+c.programs.length,0);
  const defs = [[DATA.channels.length,'份簡章來源'],[progs,'個目標系所組'],[got,'份考古題已收'],[YEARS.length,'年題庫縱深']];
  document.getElementById('stats').innerHTML =
    defs.map(([n,l])=>`<div class="stat"><b class="cnt mono" data-n="${n}">0</b><i class="eyebrow">${l}</i></div>`).join('');
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur')) || 320) * 3;
  document.querySelectorAll('#stats .cnt').forEach(el=>{
    const target = +el.dataset.n;
    if (rm) { el.textContent = target; return; }   // reduced-motion：直接完成態
    const t0 = performance.now();
    (function tick(t){
      const p = Math.min(1, (t-t0)/dur);
      el.textContent = Math.round(target * febEase(p));
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  });
}

/* ---------- 招生管道 ---------- */
function writtenBadges(p){
  if(!p.written.length) return `<span class="hot">無筆試：${esc(p.nonWritten.join('＋')||'審查')}</span>`;
  return p.written.map(slot=>{
    const names = slot.options.map(o=>o.paper||o.subject);
    const s = names.join(' / ');
    return `<span${slot.note?` data-tip="${esc(slot.note)}"`:''}>${esc(s)}${slot.options.length>1?'（擇一）':''}</span>`;
  }).join('');
}

/* ---------- 學校為軸：總覽表＋作戰卡 ---------- */
const SCHOOL_ORDER = ['ntu','ust','ncu','nthu-pme','ncku','nsysu','ntust','ntut'];
// 分析檔 key → [題庫學校id, 題庫科目名]（nsysu 兩份分析共掛同一份合集）
const ANA_MAP = {
 'ust-control':['ust','控制系統'], 'ust-math':['ust','工程數學C'], 'ust-elec':['ust','電子學'],
 'ntu-control':['ntu','控制系統'], 'ntu-math':['ntu','工程數學'],
 'nthupme-control':['nthu-pme','控制系統'],
 'ncku-control':['ncku','控制系統'], 'ncku-math':['ncku','工程數學'],
 'nckues-control':['ncku','工科-控制系統'], 'nckues-math':['ncku','工科-工程數學'],
 'nckues-circ':['ncku','工科-電子電路'], 'nckues-sig':['ncku','工科-訊號與系統'], 'nckues-la':['ncku','工科-線性代數'],
 'nsysu-control':['nsysu','全系試題合集(含乙組工數乙+控制系統)'],
 'nsysu-math':['nsysu','全系試題合集(含乙組工數乙+控制系統)'],
 'ntust-math':['ntust','工程數學'],
 'ntut-control':['ntut','控制系統'], 'ntut-math':['ntut','工程數學'],
 'ncu-math':['ncu','工程數學（不含複變）'], 'ncu-elec':['ncu','電子學'], 'ncu-sig':['ncu','信號與系統'],
};
// 已停考科目：保留題庫存檔、不做分析
const DISCONTINUED = {ntust:{'自動控制系統':'113 起未再公布'}};
let ANA = {};
async function loadAna(){
  try{
    // 分析結果會被 NotebookLM 重跑覆蓋，一定要繞過快取，否則補了題號也看不到
    const NC={cache:'no-cache'};
    const list = await fetch(dataURL('analysis/index.json'),NC).then(r=>{if(!r.ok)throw 0;return r.json();});
    const docs = await Promise.all(list.map(m=>
      fetch(dataURL('analysis/'+m.file),NC).then(r=>r.json()).then(d=>[m.file.replace(/\.json$/,''),d])));
    ANA = Object.fromEntries(docs);
  }catch(e){ ANA = {}; }
}
const chanById = id => DATA.channels.find(c=>c.id===id);
function examRows(sid){
  const rows=new Map();
  for(const e of INDEX){
    if(e.school!==sid) continue;
    if(!rows.has(e.subject)) rows.set(e.subject,{dept:e.dept,years:{}});
    rows.get(e.subject).years[e.year]=e;
  }
  return rows;
}
const anaOf=(sid,subject)=>Object.entries(ANA)
  .filter(([k])=>ANA_MAP[k]&&ANA_MAP[k][0]===sid&&ANA_MAP[k][1]===subject).map(([,d])=>d);
const chapTotals=d=>(d.chapters||[])
  .map(ch=>[ch.name,(d.years||[]).reduce((s,y)=>s+(+ch.years?.[y]||0),0)])
  .filter(([,t])=>t>0).sort((a,b)=>b[1]-a[1]);

/* ---------- 共同必考章節：跨校長條（決策 E，dataviz 法）----------
   單一色相（結構 ember），細條、資料端 4px 圓角貼齊基線、2px 間距；
   數值標籤用文字 token 直接標在條尾；per-bar 共用 tooltip。 */
function renderAgg(){
  const groups=[
    ['控制系統', k=>k.includes('control')],
    ['工程數學', k=>k.includes('math')],
    ['電子學',   k=>k.includes('elec')||k.includes('circ')],
    ['線性代數', k=>k.includes('la')],
  ];
  document.getElementById('aggArea').innerHTML = groups.map(([title,match])=>{
    const docs=Object.entries(ANA).filter(([k])=>match(k)).map(([,d])=>d);
    if(!docs.length) return '';
    const agg={};
    docs.forEach(d=>chapTotals(d).forEach(([name,t])=>{
      (agg[name]??={n:0,total:0}); agg[name].n++; agg[name].total+=t;
    }));
    const rows=Object.entries(agg).filter(([n])=>n!=='其他')
      .sort((a,b)=>b[1].n-a[1].n||b[1].total-a[1].total).slice(0,8);
    if(!rows.length) return '';
    const max=Math.max(...rows.map(([,v])=>v.total));
    return `<div class="agg-grp">
      <div class="agg-gh"><h3>${esc(title)}</h3><span class="gh-n mono">${docs.length} 份分析彙整</span></div>
      <div class="bars">${rows.map(([name,v],i)=>`
        <div class="bar-row" data-tip="${esc(name)} · ${v.n} 校考 · 共 ${v.total} 大題">
          <span class="nm">${esc(name)}</span>
          <span class="tk"><i style="width:${Math.max(4,Math.round(v.total/max*100))}%;--i:${i}"></i></span>
          <span class="val mono"><b>${v.n} 校考</b> ・${v.total} 大題</span></div>`).join('')}
      </div></div>`;
  }).join('');
}

/* ---------- 章節×年度熱度表（決策 D，dataviz 法）----------
   量值＝SEQUENTIAL：單一色相 ember，從近地表燒向 --warm，亮度單調遞增；
   混色頂在 82%（--warm 82% over --bg → vs --ink 4.9:1，全格 ink 過 4.5:1），
   每個非空格的「大題數」數字都在（絕不 color-alone）；空格真空。 */
function heatTable(d){
  const ys=d.years||[];
  if(!d.chapters?.length) return '';
  const max=Math.max(1,...d.chapters.map(ch=>Math.max(0,...ys.map(y=>+ch.years?.[y]||0))));
  return `<table class="heatt"><thead><tr><th class="n"></th>${
      ys.map(y=>`<th class="mono">${esc(y)}</th>`).join('')}<th class="tot mono">計</th></tr></thead><tbody>`+
    d.chapters.map(ch=>{
      const tot=ys.reduce((s,y)=>s+(+ch.years?.[y]||0),0);
      return `<tr><td class="n">${esc(ch.name)}</td>${ys.map(y=>{
        const v=+ch.years?.[y]||0;
        if(!v) return `<td class="hc h0"></td>`;
        const r=v/max, mix=Math.round(16+r*66);   // 暗地 16..82%：單調、頂格 ink 仍 4.9:1
        return `<td class="hc mono" style="--h:${r.toFixed(3)};background:color-mix(in srgb,var(--warm) ${mix}%,var(--bg))" data-tip="${esc(ch.name)} · ${y} 年 · ${v} 大題">${v}</td>`;
      }).join('')}<td class="tot mono">${tot}</td></tr>`;
    }).join('')+`</tbody></table>`;
}

function anaHTML(d){
  const tbl=heatTable(d);
  return `<details class="more"><summary>完整分析：${esc(d.subject)}（章節×年度熱度・必考重點・命題趨勢）</summary>
    <div class="ana">
      <div class="upd mono">NotebookLM 分析 ・ ${esc(d.updated||'')}</div>
      ${tbl?`<div class="msec eyebrow"><span>章節熱度 HEATMAP</span></div>
      <div class="ana-scroll">${tbl}</div>`:''}
      ${d.mustKnow?.length?`<div class="msec eyebrow"><span>必考重點 MUST-KNOW</span></div>
      <ul class="mk">${d.mustKnow.map(m=>`<li><b>${esc(m.split('：')[0])}</b>${esc(m.includes('：')?'：'+m.split('：').slice(1).join('：'):'')}</li>`).join('')}</ul>`:''}
      ${d.trend?`<div class="msec eyebrow"><span>命題趨勢 TREND</span></div>
      <div class="trend">${esc(d.trend)}</div>`:''}
      ${d.notebook?`<a class="nb-link mono" href="https://notebooklm.google.com/notebook/${esc(d.notebook)}" target="_blank" rel="noopener">開啟 NotebookLM 筆記本 → 直接追問</a>`:''}
    </div></details>`;
}

/* ---------- 總覽表（決策 B）----------
   無外框、只有行線；表頭走 mono 眉標；數值欄靠右 tabular；整列可點。
   iPad 直向：校名欄 sticky＋右髮絲線，其餘橫捲，ov-shell 出 edge-fade 提示。 */
function renderOverview(){
  document.getElementById('ovBody').innerHTML = SCHOOL_ORDER.map(sid=>{
    const c=chanById(sid); if(!c) return '';
    const joint=c.channel.includes('聯合');
    const er=examRows(sid);
    const subjSet=new Set(), free=[];
    for(const p of c.programs){
      if(!p.written.length){ free.push(`${p.dept}${p.group}`); continue; }
      for(const slot of p.written) for(const o of slot.options) subjSet.add(o.paper||o.subject);
    }
    const got=[...er.values()].reduce((n,r)=>n+Object.values(r.years).filter(e=>e.status==='downloaded').length,0);
    const planned=Object.keys(ANA_MAP).filter(k=>ANA_MAP[k][0]===sid);
    const done=planned.filter(k=>ANA[k]).length;
    return `<tr data-open="${esc(sid)}">
      <td class="ov-sch"><button class="sch" type="button">${esc(c.shortName)}<small>${joint?'聯合招生':'自辦招生'}</small></button></td>
      <td class="dt mono">${esc(c.schedule.apply)}</td>
      <td class="dt mono">${esc(c.schedule.writtenExam)}</td>
      <td>${[...subjSet].map(s=>`<span class="subj-chip mono">${esc(s)}</span>`).join('')||'—'}</td>
      <td class="free">${free.length?free.map(esc).join('<br>'):'—'}</td>
      <td class="st num mono">${got?`<b>${got}</b> 份`:'—'}</td>
      <td class="st num mono">${planned.length?`<b>${done}</b>/${planned.length} 科`:'—'}</td>
    </tr>`;
  }).join('');
  initOvScroll();
}

/* 橫捲提示：捲不到底→右緣 fade、捲離起點→左緣 fade。
   fade 是捲動位置的即時渲染（視覺提示），資料狀態不在此。 */
let OV_BOUND=false;
function initOvScroll(){
  const wrap=document.querySelector('.ov-wrap'), shell=document.querySelector('.ov-shell');
  if(!wrap||!shell) return;
  const sync=()=>{
    const maxX=wrap.scrollWidth-wrap.clientWidth;
    shell.classList.toggle('fade-r', maxX>1 && wrap.scrollLeft<maxX-1);
    shell.classList.toggle('fade-l', wrap.scrollLeft>1);
  };
  if(!OV_BOUND){
    OV_BOUND=true;
    wrap.addEventListener('scroll',sync,{passive:true});
    addEventListener('resize',sync);
    /* 從 home（display:none、寬 0）切進 exam 時才第一次有尺寸：
       ResizeObserver 補上這一刻的 sync，fade 提示才不會等到第一次捲動 */
    if('ResizeObserver' in window) new ResizeObserver(sync).observe(wrap);
  }
  sync();
}

/* ---------- 學校詳情（決策 C）----------
   全螢幕玻璃浮層（合法浮層）。內部去框化：section＝mono 眉標＋一條髮絲線
   （招生管道／系所組／十年題庫／章節熱度／必考重點／命題趨勢）。 */
function schoolDetailHTML(sid){
  const c=chanById(sid); if(!c) return '';
  const joint=c.channel.includes('聯合');
  const er=examRows(sid), dead=DISCONTINUED[sid]||{};
  const msec=t=>`<div class="msec eyebrow"><span>${t}</span></div>`;
  const progs=c.programs.map(p=>`
    <div class="prog">
      <b>${esc(p.dept)}</b> <span class="grp">${esc(p.group)}</span>
      <div class="subj">${writtenBadges(p)}</div>
      <details class="more"><summary>名額・審查・備註</summary>
        <div class="quota mono">${esc(p.quota?.exam||'')}${p.quota?.recommend?'｜'+esc(p.quota.recommend):''}</div>
        ${p.nonWritten.length&&p.written.length?`<div class="note">併採：${esc(p.nonWritten.join('、'))}</div>`:''}
        ${p.recommend?`<div class="note">推甄：${esc(p.recommend)}</div>`:''}
        <div class="note ${p.notes&&p.notes.startsWith('★')?'star':''}">${esc(p.notes||'')}</div>
      </details>
    </div>`).join('');
  let subj='';
  for(const [name,r] of er){
    const deadNote=dead[name];
    const anas=deadNote?[]:anaOf(sid,name);
    const quick=anas.map(d=>{
      const top=chapTotals(d).filter(([n])=>n!=='其他').slice(0,3);
      return top.length?`<div class="quick">重點章節${anas.length>1?`（${esc(d.subject)}）`:''}：${
        top.map(([n,t])=>`<b>${esc(n)}</b> ×${t}`).join('　')}</div>`:'';
    }).join('');
    /* 年份格：已下載＝可點連結；缺年＝dash 劃線＋降暗（不靠顏色單獨表意），
       tooltip 給原因（原生 title，checklist 契約） */
    const years=YEARS.map(y=>{
      const e=r.years[y];
      if(e&&e.status==='downloaded')
        return `<a class="yc mono hit" href="${esc(dataURL('exams/'+e.path))}" target="_blank" rel="noopener" data-tip="${esc(name)} ${y}年" aria-label="${esc(name)} ${y} 年考卷">${y}</a>`;
      const why=e?(e.reason||e.status):'該年份不在來源清單（可能未招生或未公開）';
      return `<span class="yc miss mono" title="${esc(why)}"><s>${y}</s></span>`;
    }).join('');
    subj+=`<div class="sb">
      <div class="sbh"><h4>${esc(name)}<small>${esc(r.dept)}</small></h4>
        ${deadNote?`<span class="badge dead">已停考・${esc(deadNote)}・題庫僅存檔</span>`:''}</div>
      ${quick}
      <div class="yrow">${years}</div>
      ${anas.length?anas.map(anaHTML).join('')
        :(!deadNote&&Object.values(ANA_MAP).some(([s,n])=>s===sid&&n===name)
          ?`<div class="pending">章節分析產生中——完成後自動出現（run_analysis.bat 可續跑）。</div>`:'')}
    </div>`;
  }
  if(!er.size) subj=`<div class="sb"><div class="pending">此校未收考古題（未公開或走台聯大共同筆試）；筆試科目見上方系所組。</div></div>`;
  return `
    <div class="dhead"><h2>${esc(c.shortName)}</h2>
      <span class="badge ${joint?'joint':''}">${joint?'聯合招生':'自辦招生'}</span></div>
    ${msec('招生管道 CHANNEL')}
    <div class="chow">${esc(c.channel)}</div>
    <div class="sched mono">報名 ${esc(c.schedule.apply)} ・ 筆試 ${esc(c.schedule.writtenExam)}</div>
    <div class="links">
      <a class="btn ui-ghost hit" href="${esc(dataURL(c.brochure))}" target="_blank" rel="noopener">簡章 PDF</a>
      <a class="btn ui-ghost hit" href="${esc(c.admissionUrl)}" target="_blank" rel="noopener">招生網站</a>
      <a class="btn ui-ghost hit" href="${esc(c.pastExamsSource)}" target="_blank" rel="noopener">考古題來源</a>
    </div>
    ${msec('系所組 PROGRAMS')}
    <div class="progs">${progs}</div>
    ${msec('十年題庫 ARCHIVE 106–115')}
    ${subj}`;
}
function openSchool(sid){
  const m=document.getElementById('schoolModal');
  document.getElementById('modalBody').innerHTML = schoolDetailHTML(sid);
  m.querySelector('.modal-panel').scrollTop=0;
  m.hidden=false; document.body.classList.add('modal-open');
}
function closeSchool(){
  document.getElementById('schoolModal').hidden=true;
  document.body.classList.remove('modal-open');
}
addEventListener('keydown',e=>{
  const vm=document.getElementById('vidModal');
  const playing=vm&&!vm.hidden;
  if(playing&&!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)){
    const v=vidEl();
    const jump=e.shiftKey?60:10;
    if(e.key==='ArrowLeft'){ e.preventDefault(); return vidSeek(-jump); }
    if(e.key==='ArrowRight'){ e.preventDefault(); return vidSeek(jump); }
    if(e.key===' '){ e.preventDefault(); return vidToggle(); }
    // 取代已移除的「從頭播放」按鈕：不佔版面，功能還在
    if(e.key==='Home'){ e.preventDefault(); if(v){ v.currentTime=0; plSave(v); vidLeft(); } return; }
    if(e.key==='End'){ e.preventDefault(); if(v&&isFinite(v.duration)){ v.currentTime=Math.max(0,v.duration-5); vidLeft(); } return; }
    if(e.key==='ArrowUp'||e.key==='ArrowDown'){
      e.preventDefault();
      const i=RATES.indexOf(v?.playbackRate);
      const j=Math.min(RATES.length-1,Math.max(0,(i<0?4:i)+(e.key==='ArrowUp'?1:-1)));
      return vidRate(RATES[j]);
    }
  }
  if(e.key!=='Escape') return;
  if(playing) return closePlayer();
  if(!document.getElementById('schoolModal').hidden) closeSchool();
});

/* ---------- 反向選校（決策 F）----------
   科目 pills＝類別識別：rest 結構階 --sc-*、選中 -hi＋柔光（design-system
   pill pattern 移植）。五學科以外的科目走中性 pill（identity 由文字承載，
   不硬湊第六個色相——categorical 法：不夠色就不上色）。 */
const SUBJ_SC={'控制系統':'ctrl','電子學':'elec','線性代數':'la','工程數學':'math','英文':'toeic'};
function renderFinderControls(){
  const sp=document.getElementById('subjPills');
  sp.innerHTML = DATA.subjectCatalog.map(s=>{
    const sc=SUBJ_SC[s];
    const st=sc?` style="--c:var(--sc-${sc});--ch:var(--sc-${sc}-hi)"`:'';
    return `<button class="pill hit" type="button"${st} data-s="${esc(s)}">${esc(s)}</button>`;
  }).join('');
  const cp=document.getElementById('chapPills');
  cp.innerHTML = DATA.mathChapters.map(c=>
    `<button class="pill chap hit" type="button" style="--c:var(--sc-math);--ch:var(--sc-math-hi)" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  sp.addEventListener('click',e=>{
    const b=e.target.closest('[data-s]'); if(!b) return;
    toggle(state.subjects,b.dataset.s,b); renderVerdicts();
  });
  cp.addEventListener('click',e=>{
    const b=e.target.closest('[data-c]'); if(!b) return;
    toggle(state.chapters,b.dataset.c,b); renderVerdicts();
  });
}
function toggle(set,v,btn){ set.has(v)?set.delete(v):set.add(v); btn.classList.toggle('on'); }

function optionOK(o){
  if(o.subject==='工程數學'){
    if(!state.subjects.has('工程數學')) return false;
    /* chapters 缺 key 與 null 同義＝全部章節（schools.json 有 3 個工數卷沒帶
       chapters 欄；原版 ===null 會 crash renderVerdicts——T04 就地修正） */
    const need = o.chapters==null ? DATA.mathChapters : o.chapters;
    return need.every(ch=>state.chapters.has(ch));
  }
  if(o.subject==='線性代數')
    return state.subjects.has('線性代數') || state.chapters.has('線性代數');
  return state.subjects.has(o.subject);
}
function verdictOf(p){
  if(!p.written.length) return {cls:'doc',label:'無筆試門檻',detail:'審查／口試取才，不受筆試科目限制'};
  const missing=[];
  for(const slot of p.written){
    if(!slot.options.some(optionOK)){
      missing.push(slot.options.map(o=>o.paper||o.subject).join('或'));
    }
  }
  if(!missing.length) return {cls:'ok',label:'筆試全對口',detail:''};
  return {cls:'no',label:'缺 '+missing.length+' 科',detail:missing.join('、')};
}
function reqText(p){
  if(!p.written.length) return esc(p.nonWritten.join('＋'));
  return p.written.map(slot=>{
    const parts = slot.options.map(o=>{
      const nm = o.paper||o.subject;
      const scope = o.scope?`〔${o.scope}〕`:'';
      return `<em>${esc(nm)}</em>${esc(scope)}`;
    }).join(' 或 ');
    return parts + (slot.note?`<s title="規則">（${esc(slot.note)}）</s>`:'');
  }).join('　＋　');
}
/* verdict＝去框化「列」：左 2px 狀態脊線＋狀態 glyph＋文字（狀態色 reserved-
   for-state token，永不 color-alone——glyph 與標籤文字一路都在）。 */
const V_GLYPH={ok:'✓',doc:'◇',no:'✕'};
function renderVerdicts(){
  const nothing = !state.subjects.size && !state.chapters.size;
  const cards=[];
  for(const c of DATA.channels){
    for(const p of c.programs){
      const v = nothing && p.written.length ? {cls:'no',label:'請先勾選強項',detail:''} : verdictOf(p);
      cards.push({c,p,v});
    }
  }
  cards.sort((a,b)=>({ok:0,doc:1,no:2}[a.v.cls]-{ok:0,doc:1,no:2}[b.v.cls]));
  document.getElementById('verdicts').innerHTML = cards.map(({c,p,v})=>`
    <div class="verdict s-${v.cls} ${v.cls==='no'?'dim':''}">
      <span class="vglyph mono" aria-hidden="true">${V_GLYPH[v.cls]}</span>
      <div class="vbody">
        <div class="vh"><b>${esc(c.shortName)}｜${esc(p.dept)} ${esc(p.group)}</b>
          <span class="vtag mono">${esc(v.label)}</span></div>
        <div class="req">${reqText(p)}</div>
        ${v.detail?`<div class="req">→ ${esc(v.detail)}</div>`:''}
        ${p.nonWritten.length&&p.written.length?`<div class="req">併採：${esc(p.nonWritten.join('、'))}</div>`:''}
      </div>
    </div>`).join('');
}
