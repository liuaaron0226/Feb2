const DISK=new Map();          // 正規化集數代號 → File
function diskKey(name){
  // 檔名長這樣：115暑電子03 P.16-1~P.18-4 CH1二極體(Diode).mp4
  // 代號是開頭那段「年份＋季別＋科目＋兩位數字」，後面接標題。
  // 不能單純用空格切——「115春多益12-The End」會被切成「115春多益12-The」；
  // 也不能只拔括號——exFAT 上的檔名把 <> 換成了底線。
  // 順序很重要：先拔掉 (喻)(劉) 這類卡在數字前的講師標記，再抓代號。
  // 反過來做的話「115春矩陣(喻)10」會在括號處斷掉，永遠對不上。
  const base=name.replace(/\.[^.]+$/,'').replace(/\([^)]*\)/g,'');
  const m=base.match(/^(\d{3}[春暑秋冬題]?\D*?\d{1,2}[A-Za-z]?)(?=[\s　_<（(-]|$)/);
  return spNorm(m?m[1]:base.split(/[ 　]/)[0]);
}
function bindDisk(){
  // input 現在在 body 底下、不會被重繪，所以只需要綁一次
  const inp=document.getElementById('diskPick');
  if(inp&&!inp.dataset.on){ inp.dataset.on='1';
    inp.addEventListener('change',()=>{
      crumb('收到檔案',{檔案數:inp.files.length});
      toastMsg(`讀取 ${inp.files.length} 個檔案…`);   // 大檔要等 iOS 交付，先給回饋
      takeDisk(inp);
    });
    inp.addEventListener('click',()=>{
      crumb('開啟檔案選擇器');       // 連 change 都沒跑到就死的話，會停在這一步
      rlog('picker-open',{});
    });
    inp.addEventListener('cancel',()=>{ crumbClear(); PENDING_PICK=null; toastMsg('沒有選取'); });
  }
  const dir=document.getElementById('wmDiskDir');
  if(dir && !dir.dataset.on){
    dir.dataset.on='1';
    dir.onclick=()=>{
      const inp=document.getElementById('diskPick');
      if(!inp) return;
      // 同一顆 input 動態切換模式，不要開兩顆各自綁事件的 input
      inp.webkitdirectory=true;
      inp.removeAttribute('accept');     // 目錄模式下 accept 沒有意義
      PENDING_PICK=null;
      DIR_MODE=true;
      toastMsg('選整個資料夾：iOS 會逐檔複製進 iPad，大資料夾可能失敗');
      inp.click();
    };
  }
  const lab=document.getElementById('wmDisk');
  if(lab && !lab.dataset.on){
    lab.dataset.on='1';
    lab.addEventListener('click',()=>{
      if(DISK_DIAG) return toastMsg(DISK_DIAG);
      // 檔案權限記不住（安全限制），但檔名記得住——照著上次的點就好
      let last=[];
      try{ last=JSON.parse(localStorage.getItem(DISK_LS)||'[]'); }catch(e){}
      if(last.length) toastMsg(`上次選了 ${last.length} 支：`
        +last.slice(0,6).join('、')+(last.length>6?' …':''));
    });
  }
}
function takeDisk(inp){
  {
    // 這一步最容易讓 iPad 被系統殺掉，先留下麵包屑再動手
    crumb('取得檔案清單',{檔案數:inp.files.length});
    rlog('pick-start',{檔案數:inp.files.length});
    const files=[...inp.files].filter(f=>/\.(mp4|m4v|mov)$/i.test(f.name));
    crumb('已篩出影片',{檔案數:inp.files.length,影片數:files.length});
    // 累加而不是清空：一次只選一個課程資料夾才不會把 iPad 撐爆，
    // 所以選第二個資料夾時不能把第一個的洗掉。
    for(const f of files) DISK.set(diskKey(f.name),f);
    // 回報「對得上課表的支數」而不是總支數——硬碟裡有些集數還沒排進章節，
    // 只報總數會讓人以為全都能在看板上點開。
    const bc=VIDEOS?.istudy?.byChapter||{};
    const known=new Set(Object.values(bc).flat().map(e=>spNorm(e.code)));
    const hits=[...DISK.keys()].filter(k=>known.has(k));
    const miss=[...DISK.keys()].filter(k=>!known.has(k)).slice(0,3);
    // 診斷留著：出事時才問得出「選到幾個檔、解析成什麼、對上幾支」
    DISK_DIAG=`[${APP_VER}] 選到 ${inp.files.length} 個檔案，其中影片 ${files.length} 支，`
      +`解析出 ${DISK.size} 個代號，對上課表 ${hits.length} 支。`
      +(files[0]?`\n第一個檔名：${files[0].name}`:'')
      +(files[0]?`\n解析成代號：${diskKey(files[0].name)}`:'')
      +(miss.length?`\n對不上的代號：${miss.join('、')}`:'');
    if(!DISK.size){
      DISK_UI={st:'gap',txt:'硬碟：沒找到影片'};
      toastMsg('沒有選到影片檔。請進到課程資料夾裡，直接點選 .mp4 檔案。');
    }else if(!hits.length){
      DISK_UI={st:'gap',txt:`硬碟 ${DISK.size} 支・對不上`};
      toastMsg('影片有讀到，但檔名對不上課表。點這個標籤看細節。');
    }else{
      DISK_UI={st:'ready',txt:`硬碟 ${hits.length} 支`};
      toastMsg(`已連結 ${DISK.size} 支・對上課表 ${hits.length} 支`
        +'（重新整理後要再選一次）');
    }
    // 瀏覽器不能記住硬碟權限（安全限制），但可以記住「你上次選了哪幾支」，
    // 下次照著點就好，不必重新回想。
    try{ localStorage.setItem(DISK_LS,JSON.stringify([...DISK.keys()])); }catch(e){}
    rlog('pick-done',{影片數:DISK.size,資料夾模式:DIR_MODE,
      診斷:DISK_DIAG.replace(/\n/g,' / ')});
    DIR_MODE=false;
    crumbClear();                       // 走完了，這一輪沒當掉
    renderStudy();
    // 剛才點的那一支如果選到了，直接播——不要讓人再點一次
    if(PENDING_PICK){
      const {code,name}=PENDING_PICK; PENDING_PICK=null;
      const src=videoSrc(code,'');
      if(src) openPlayer(src,name,code);
      else toastMsg('選到的檔案裡沒有這一支，檔名要以集數代號開頭');
    }
  }
}
/* 播放來源：手上有硬碟檔案就一律用它。

   原本是「能連到電腦就優先用電腦」，判斷依據是 state.json 抓不抓得到。
   但 state.json 被 SW 快取之後，離線也抓得到，於是離線時仍然判成
   「伺服器可用」，回傳一個連不上的網址——人已經在咖啡廳、硬碟就插在手上，
   卻播不出來（實測踩到）。
   blob URL 本來就能拖曳快轉、也不會複製檔案，所以優先用硬碟沒有代價。 */
const BLOBS=new Map();         // 代號 → blob URL，同一支重開時重用
function diskURL(code,f){
  let u=BLOBS.get(code);
  if(!u){ u=URL.createObjectURL(f); BLOBS.set(code,u); }   // 不重複建，否則來回切集數會一直累積
  return u;
}
function videoSrc(code,url){
  const k=spNorm(code), f=DISK.get(k);
  if(f) return diskURL(k,f);          // 硬碟優先，不再看伺服器臉色
  return url||'';
}

