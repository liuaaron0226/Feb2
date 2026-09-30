const YEARS = [106,107,108,109,110,111,112,113,114,115];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let DATA=null, INDEX=null, SPRINT_PLAN=null, VIDEOS=null, LOCAL={};
const state = { subjects:new Set(), chapters:new Set() };

/* ============ 模式切換（液態轉場＋強度儀） ============ */
function setMode(m){
  document.body.dataset.mode = m;
  /* 模式續留（session 範疇是刻意的：新分頁＝回待機問候；同分頁重整＝回工作現場）。
     sessionStorage 不是狀態的家（渲染紀律的家是 localStorage）——這鍵只是
     「重整落點」的導航記憶，與 /sync 契約無關，故不進 localStorage 鍵清單。 */
  try{ sessionStorage.setItem('feb-mode-s',m); }catch(e){ /* 私密模式等情況：安靜跳過 */ }
  /* 強度儀（tokens.css 檔位）：home 全開、exam 收半、study 近熄。
     aurora 透明度與 ambient 凍結全由 html[data-intensity] 驅動，這裡不碰樣式 */
  document.documentElement.dataset.intensity =
    m==='home' ? 'full' : (m==='exam' ? 'mid' : 'quiet');
  /* study 進出時停/啟雨滴迴圈（rainSync 讀 data-mode；定義在 02-settings.js，
     載入順序在後，但 setMode 只在互動時被呼叫，屆時必已存在） */
  if(typeof rainSync==='function') rainSync();
  if(m!=='home') scrollTo({top:0});
}
function wipeTo(fn){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){ fn(); return; }
  const w=document.getElementById('wipe');
  w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
  /* 轉場總長＝--dur×2＋--dur-exit×2＝1056ms（見 app.css #wipe）；
     蓋台停頓落在 528–612ms，換模式要落在那個窗口內 */
  setTimeout(fn,560);
  setTimeout(()=>w.classList.remove('go'),1150);
}
function switchMode(m){ wipeTo(()=>setMode(m)); }
/* ---- 重整落點還原：上次在哪個模式，重整就直接落回去 ----
   放在 setMode 定義後、事件佈線前的頂層：script 在 body 尾端，DOM 已就緒。
   還原走 setMode（不走 wipeTo）＝瞬到、不放液態轉場；data-intensity 由
   setMode 一併對正。鍵不存在（新分頁）或值不合法＝什麼都不做，home 照舊。
   rainSync 此刻尚未定義（02-settings 在後），setMode 內的 typeof 防護已涵蓋；
   之後 02-settings 的 applySky() 會補跑一次 rainSync，天氣層照常對位。 */
(function restoreMode(){
  let m=null;
  try{ m=sessionStorage.getItem('feb-mode-s'); }catch(e){}
  if(m==='exam'||m==='study') setMode(m);
})();
document.getElementById('btnExam').onclick = ()=>switchMode('exam');
document.getElementById('btnStudy').onclick = ()=>switchMode('study');
document.getElementById('toStudy').onclick = ()=>switchMode('study');
document.getElementById('toExam').onclick = ()=>switchMode('exam');
document.getElementById('brandHome').onclick = ()=>switchMode('home');

/* ============ 收合區塊（一次只開一個）＋點擊液爆 ============ */
function openSec(sec){
  document.querySelectorAll('section.acc.open').forEach(s=>s!==sec&&s.classList.remove('open'));
  if(sec) sec.classList.add('open');
}
document.addEventListener('click',e=>{
  if(e.target.closest('[data-close]')){ closeSchool(); return; }
  const row=e.target.closest('#ovBody [data-open]');
  if(row){ openSchool(row.dataset.open); return; }
  const h=e.target.closest('[data-acc]');
  if(h){
    const sec=h.closest('section');
    sec.classList.contains('open') ? sec.classList.remove('open') : openSec(sec);
  }
  const a=e.target.closest('a.seclink, a[href^="#sc-"]');
  if(a){
    const sec=document.querySelector(a.getAttribute('href'));
    if(sec&&sec.classList.contains('acc')) openSec(sec);
  }
});

/* 點擊漣漪：從指尖擴散、蓋住按鈕就收，不外溢成畫面事件。

   原本只認 .lq，但讀書模式裡只有 1 個元素有那個 class（其餘 53 個都在
   考古題／待機模式）——等於整個工作台的按鈕都沒有點擊回饋。
   改成認所有實際可按的東西，回饋才會一致。
   排除清單項目本身（.sp-ep／.wm-row 已有自己的 hover 與 active 縮放，
   再疊漣漪會變成兩層回饋打架）。

   走 capture 階段而不是跟上面的處理器擠在一起，有兩個非它不可的理由：
   1. 週次鈕、收納選單這類按鈕按下去會整段重繪工具列，等冒泡輪到漣漪時
      按鈕已經不在 DOM 上，量到的尺寸全是 0，漣漪就消失了。
   2. 上面那個處理器有好幾條 return 早退路徑，掛在後面會被吃掉。 */
window.addEventListener('click',e=>{
  const b=e.target.closest(
    '.lq,.ui-ghost,.ui-solid,.ui-seg>button,.vic,.wm-more-btn,.wm-more-item,.chap-head');
  if(!b||matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  /* 先量再說。這一行必須發生在 app 自己的處理器重繪之前。 */
  const r=b.getBoundingClientRect();
  if(!r.width||!r.height) return;
  const burst=document.createElement('span'); burst.className='burst';
  burst.style.left=e.clientX+'px'; burst.style.top=e.clientY+'px';
  /* 顏色：優先用元件自己宣告的 --lq-color，沒有就用它的文字色。
     這樣暖色按鈕漾暖色、一般按鈕漾白，回饋跟元件本身是同一個語彙。
     文字色常常自帶 alpha（例如 rgba(255,255,255,.62)），直接拿來當漣漪
     底色會讓透明度被算兩次，特效淡到看不見——所以這裡先把 alpha 拔掉，
     濃淡統一交給 keyframes 決定。 */
  const cs=getComputedStyle(b);
  let col=cs.getPropertyValue('--lq-color').trim()||cs.color;
  const n=col.match(/-?[\d.]+/g);
  if(n&&n.length>=3){
    // color(srgb …) 的分量是 0–1，rgb() 是 0–255，換算後才不會全變黑
    const k=/^color\(/.test(col) ? 255 : 1;
    const v=n.slice(0,3).map(x=>Math.round(Math.min(255,Math.max(0,+x*k))));
    col=`rgb(${v[0]} ${v[1]} ${v[2]})`;
  }
  if(col) burst.style.setProperty('--bc',col);
  /* 尺寸貼著指標，不貼按鈕。
     先前用「到按鈕最遠角落 ×2」去蓋滿整顆按鈕，98px 的鈕會漾出 119px 的圈——
     那已經是畫面事件不是點擊回饋。現在固定 38px，只在按鈕特別小的時候
     再收一點（不超過按鈕高度的 1.4 倍），避免小鈕被圈整個吞掉。 */
  burst.style.setProperty('--r',
    Math.min(38, Math.max(22, r.height*1.4))+'px');
  document.body.appendChild(burst);
  setTimeout(()=>burst.remove(),320);
}, true);

