/* ============ 資料載入 ============ */
/* 科目 → NotebookLM 筆記本對照（notebooks.json）。url 留空＝該科尚未建本，
   吊點（nbLink，09-render-study.js）安靜不現身；檔案整份不存在也一樣安靜。 */
let NOTEBOOKS=null;
/* T17 筆記迴流：科目 → NotebookLM 筆記快照（data/nblm/<subj>.json，
   scripts/nblm_pull.py 產）。狀態活在這裡（渲染紀律：DOM 只是輸出端）；
   站03 首次渲染該科時才抓（lazy），檔案不存在＝該科安靜沒有這段。 */
const NBLM={};                 // subjId → {state:'loading'|'ok'|'none', pulled, notes:[{id,title,content}]}
function nblmEnsure(subjId){
  if(!subjId||NBLM[subjId]) return;    // 只抓一次；失敗也記 none，不重試不迴圈
  NBLM[subjId]={state:'loading'};
  fetch(dataURL(`nblm/${subjId}.json`),{cache:'no-store'})
    .then(r=>r.ok?r.json():null).catch(()=>null)
    .then(d=>{
      NBLM[subjId]=(d&&Array.isArray(d.notes)&&d.notes.length)
        ?{state:'ok',pulled:String(d.pulled||''),notes:d.notes}
        :{state:'none'};
      // 資料到了而站03還在畫面上→重繪一次補上這段（既有 lazy 模式：mediaWatch 同款）
      if(NBLM[subjId].state==='ok'&&typeof renderStudy==='function'
         &&document.getElementById('stn3')) renderStudy();
    });
}
async function load(){
  try{
    /* 路徑一律走 dataURL()（05-media.js）：本機是 ../data/*，雲端是 /data/*。
       檔名不變，換的只有前綴——雲端把 data/ 底下同一棵樹原樣放進部署的靜態資產。 */
    [DATA, INDEX, SPRINT_PLAN, VIDEOS, NOTEBOOKS] = await Promise.all([
      fetch(dataURL('schools.json')).then(r=>r.json()),
      fetch(dataURL('exam-index.json')).then(r=>r.json()),
      // 這幾份會隨進度／手動編輯更新，不能吃快取，否則改了資料畫面不會變
      fetch(dataURL('sprint.json'),{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch(dataURL('videos.json'),{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch(dataURL('notebooks.json'),{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)
    ]);
    await loadLocal();
    await loadManifest();
    await loadAna();
    renderStats(); renderOverview(); renderAgg();
    renderFinderControls(); renderVerdicts();
    initStudy();
    document.getElementById('foot').innerHTML =
      `資料更新：${esc(DATA.updated)} ・ 簡章基準：${esc(DATA.baseAcademicYear)} 學年度 ・ ${esc(DATA.note)}`;
    initHeadingReveal(); initReveal(); initSpy(); initParallax();
  }catch(e){
    /* 「讀不到資料」在兩個模式下是兩件不同的事，給的下一步也不同：
       本機是伺服器沒起來；雲端是 Access 這一關掉了（登入過期會被導去登入頁，
       那個回應解不成 JSON），或這份檔案沒被 build-dist 收進部署。 */
    document.getElementById('ovBody').innerHTML =
      `<tr><td colspan="7"><div class="glass err">讀不到資料（${esc(e.message)}）。${
        CLOUD ? '雲端模式讀不到教材，多半是登入階段過期了——重新整理一次會被帶去登入頁。'
              : '請從專案根目錄啟動：<code>python -m http.server</code>，再開 <code>http://localhost:8000/site/</code>'}</div></td></tr>`;
    initStudy();
  }
}

