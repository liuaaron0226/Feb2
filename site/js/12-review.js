/* ---------- 今日複習條（T07，ADR-0004） ----------
   工作台唯一合法浮動玻璃 overlay（ADR-0002 去框化法明文豁免）。
   排程律法全部住在 review-core.js（純函式）；這裡只做store＋DOM 輸出。

   渲染紀律（docs/render-discipline.md）：
   · 狀態活在 localStorage（feb-review-v1），DOM 是 write-only 輸出端
   · rvState() 每次讀 localStorage（watchMap 同款讀穿模式）——
     /sync applyProgress 直接寫鍵，記憶體不留副本就不會有陳舊問題
   · #rvSlot 是 T05 留下的 body 穩定佔位，不在任何 innerHTML 重建區內；
     本檔只重建 #rvSlot 自己的內容
   · renderReview() 不寫狀態；流向固定＝事件 → 改狀態 → 存鍵 → 重繪 */

/* 資料鍵（/sync 契約，shape 見 ADR-0004）：
   feb-review-v1 = {cards:[{id, subject, page, createdAt, history:[{date, result}]}]} */
const RV_LS = 'feb-review-v1';
/* 五科（tokens 學科色同一組語彙；卡號首字＝科目首字） */
const RV_SUBJ = { ctrl: '控制', elec: '電子', math: '工數', la: '線代', toeic: '多益' };
const RV_CODE_TIP = { A: 'A · 不知道用哪個原理（概念）', B: 'B · 原理對，條件判斷錯（流程）',
                      C: 'C · 方向對，算錯（粗心）' };

/* UI 暫態（非資料，不進 localStorage）：新卡表單開合 */
let RV_FORM_OPEN = false;

function rvState() {
  const s = readJSON(RV_LS, null);
  return (s && Array.isArray(s.cards)) ? s : { cards: [] };
}
function rvSaveCards(cards) {
  localStorage.setItem(RV_LS, JSON.stringify({ cards }));
  if (typeof syncSoon === 'function') syncSoon();
}
/* 考期取自既有 feb-set（02-settings.js 的 SET，預設 2027-02-01） */
function rvExam() {
  return (typeof SET === 'object' && SET && SET.exam) ? SET.exam : '2027-02-01';
}

/* 事件 → 改狀態 → 存鍵 → 重繪 */
function rvMark(id, result) {
  const st = rvState();
  const i = st.cards.findIndex(c => c && c.id === id);
  if (i < 0) return;
  const cards = st.cards.slice();
  cards[i] = ReviewCore.applyResult(cards[i], result, todayStr());
  rvSaveCards(cards);
  const due = ReviewCore.nextDue(cards[i].history, cards[i].createdAt, rvExam());
  if (typeof toastMsg === 'function')
    toastMsg(result === 'pass'
      ? `${id} pass — 下次 ${due && due <= rvExam() ? due.slice(5).replace('-', '/') : '畢業（考前不再排）'}`
      : `${id} 記 ${result} — 重設，下次 ${due ? due.slice(5).replace('-', '/') : '—'}`);
  renderReview();
  /* 站 04 收工戰報讀同一份 feb-review-v1——寫回後同步補繪，結算當下不得說謊（rp-chip 同例） */
  if (typeof renderStudy === 'function') renderStudy();
}

function rvAdd(id, subject, page) {
  id = String(id || '').trim();
  if (!id) return false;
  const st = rvState();
  if (st.cards.some(c => c && c.id === id)) {
    if (typeof toastMsg === 'function') toastMsg(`卡號 ${id} 已存在`);
    return false;
  }
  const card = { id, subject: RV_SUBJ[subject] ? subject : 'ctrl',
                 // 渲染端固定加「p.」前綴；同步或手貼進來的值若自帶 p./P. 就剝掉，免得出現 p.p.31
                 page: String(page || '').trim().replace(/^[pP]\.?\s*/, ''), createdAt: todayStr(), history: [] };
  rvSaveCards(st.cards.concat([card]));
  const due = ReviewCore.nextDue([], card.createdAt, rvExam());
  if (typeof toastMsg === 'function') toastMsg(`${id} 已加入，${due ? due.slice(5).replace('-', '/') : '—'} 到期`);
  return true;
}

/* 純輸出：吃狀態、吐 HTML、綁事件 */
function renderReview() {
  const host = document.getElementById('rvSlot');
  if (!host) return;
  const today = todayStr(), exam = rvExam();
  const cards = rvState().cards;
  const due = ReviewCore.dueCards(cards, today, exam);
  const fs = ReviewCore.failStats(cards);
  const float = due.length > 0;

  /* 玻璃只在真的有東西浮出時上身；空態＝安靜一行（去框化法） */
  host.classList.toggle('glass', float);
  host.classList.toggle('rv-float', float);

  const rows = float
    ? `<div class="rv-rows">${due.map(c => `
        <div class="rv-row">
          <span class="rv-code mono" data-tip="${esc(RV_SUBJ[c.subject] || c.subject || '')}">${esc(c.id)}</span>
          <span class="rv-src mono">GoodNotes p.${esc(c.page)}</span>
          ${c.due < today ? `<span class="rv-late mono" data-tip="過期卡只出現一次；下次間隔從今天起算（晚了不補）">過期 ${esc(c.due.slice(5).replace('-', '/'))}</span>` : ''}
          <span class="rv-btns">
            <button type="button" class="btn ui-ghost hit" data-rv="${esc(c.id)}" data-res="pass">pass</button>
            <button type="button" class="btn ui-ghost hit rv-A" data-rv="${esc(c.id)}" data-res="A" data-tip="${RV_CODE_TIP.A}" aria-label="${RV_CODE_TIP.A}">A</button>
            <button type="button" class="btn ui-ghost hit rv-B" data-rv="${esc(c.id)}" data-res="B" data-tip="${RV_CODE_TIP.B}" aria-label="${RV_CODE_TIP.B}">B</button>
            <button type="button" class="btn ui-ghost hit rv-C" data-rv="${esc(c.id)}" data-res="C" data-tip="${RV_CODE_TIP.C}" aria-label="${RV_CODE_TIP.C}">C</button>
          </span>
        </div>`).join('')}
      </div>`
    : `<span class="rv-empty mono">今日無到期卡</span>`;

  host.innerHTML = `
    <div class="rv-head">
      <span class="eyebrow">RV · 今日複習</span>
      ${float ? '' : rows}
      ${/* T14c：本檔原生 title 屬性全面改走 #vizTip（data-tip）——與值夜 #4 工具列同一規制；
           按鈕補 aria-label AT 等價，純讀數 span 走 data-tip（可視文字本身已是訊號） */''}
      <span class="rv-dist mono" data-tip="失敗碼分布：A 概念 · B 條件 · C 粗心（C 多＝熟練度問題，A/B 多＝判斷問題）">A×${fs.A} B×${fs.B} C×${fs.C}</span>
      <button type="button" class="btn ui-ghost hit rv-addbtn" id="rvAddBtn"
        aria-expanded="${RV_FORM_OPEN}">＋新卡</button>
      <button type="button" class="btn ui-ghost hit rv-addbtn" id="rvImpBtn"
        data-tip="紙本排程表的卡整批貼進來（含歷史，排程接著算）"
        aria-label="匯入：紙本排程表的卡整批貼進來（含歷史，排程接著算）">匯入</button>
    </div>
    ${float ? rows : ''}
    <form class="rv-form" id="rvForm" ${RV_FORM_OPEN ? '' : 'hidden'}>
      <input class="rv-in mono" name="id" placeholder="卡號（控001）" required
        autocomplete="off" aria-label="卡號">
      <select class="rv-in" name="subject" aria-label="科目">
        ${Object.entries(RV_SUBJ).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <input class="rv-in mono" name="page" type="number" min="1" inputmode="numeric"
        placeholder="GoodNotes 頁" required aria-label="GoodNotes 頁碼">
      <button type="submit" class="btn ui-solid hit">加入</button>
      <button type="button" class="btn ui-ghost hit" id="rvCancel">取消</button>
    </form>`;

  /* 綁事件（重繪即重綁；不用 inline onclick） */
  host.querySelectorAll('[data-rv]').forEach(b => {
    b.addEventListener('click', () => {
      /* 修訂三 #3（ADR-0002）：評分＝卡片滑出（--dur-exit＝進場 65%），
         動完才落帳重繪；滑出中整列鎖點防重複落帳。reduced-motion（tokens
         全滅）走原路直接落帳；animationend 丟失有 setTimeout 保險絲。 */
      const row = b.closest('.rv-row');
      if (row && row.classList.contains('rv-out')) return;   // 已在滑出＝已落帳排程
      if (!row || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        rvMark(b.dataset.rv, b.dataset.res); return;
      }
      row.classList.add('rv-out');
      let done = false;
      const go = () => { if (done) return; done = true; rvMark(b.dataset.rv, b.dataset.res); };
      row.addEventListener('animationend', e => { if (e.animationName === 'rvout') go(); });
      setTimeout(go, 280);
    });
  });
  const form = host.querySelector('#rvForm');
  host.querySelector('#rvAddBtn').addEventListener('click', () => {
    RV_FORM_OPEN = !RV_FORM_OPEN;
    renderReview();
    if (RV_FORM_OPEN) {
      const el = document.querySelector('#rvForm input[name=id]');
      if (el) el.focus();
    }
  });
  host.querySelector('#rvCancel').addEventListener('click', () => {
    RV_FORM_OPEN = false; renderReview();
  });
  host.querySelector('#rvImpBtn').addEventListener('click', rvImpOpen);
  /* Esc 關表單（stopPropagation：別讓全域 Esc 層級誤關別的東西） */
  form.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); RV_FORM_OPEN = false; renderReview(); }
  });
  /* 鍵盤可完成：input → Tab → select → Tab → input → Enter 送出 */
  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form);
    if (rvAdd(f.get('id'), f.get('subject'), f.get('page'))) {
      RV_FORM_OPEN = false; renderReview();
    }
  });
}

/* ================= T07b 匯入（紙本 14 天 → 數位；ADR-0004/0005） =================
   解析律法全部在 review-core.parseImport（純函式、node 測過）；這裡只做
   overlay＋預覽＋套用。modal 是合法玻璃浮層（去框化法豁免，同 rpModal 語彙）。
   重點：匯入卡帶著紙本歷史，nextDue 直接從紙上狀態接著算——
   已存在的卡號預設略過，勾「覆蓋既有」才蓋掉。 */

const RV_IMP_PH = ['控001 12', '電003 31 8/28 pass',
                   '數001 p.5 8/20 pass 8/23 A 8/26 pass',
                   '控002 12 08-28 過'].join('\n');

function rvImpClose() {
  const m = document.getElementById('rvImpModal');
  if (!m || m.hidden) return;
  m.hidden = true;
  document.body.classList.remove('modal-open');
}

function rvImpOpen() {
  let m = document.getElementById('rvImpModal');
  if (!m) {
    m = document.createElement('div'); m.id = 'rvImpModal'; m.className = 'modal';
    m.innerHTML = `<div class="modal-back" data-rvimpclose></div>
      <div class="modal-panel glass rp-panel rvi-panel" role="dialog" aria-modal="true"
        aria-label="匯入複習卡">
        <button class="modal-x lq" type="button" data-rvimpclose aria-label="關閉">✕</button>
        <h3>匯入複習卡</h3>
        <p class="rp-note">紙本排程表上的卡整批貼進來——<b>歷史一起帶</b>，
          下次到期日直接從紙上狀態接著算。一行一張卡：
          <b class="mono">卡號 頁碼 [日期 結果]…</b>；還沒複習過的卡只要卡號＋頁碼。
          結果吃 pass／過／o／v 與 A／B／C，日期吃 8/28 或 08-28。</p>
        <textarea id="rvImpText" class="rvi-ta mono" rows="8" spellcheck="false"
          autocomplete="off" aria-label="貼上紙本卡，一行一張"></textarea>
        <label class="rvi-over hit"><input type="checkbox" id="rvImpOver">
          覆蓋既有卡（不勾＝已存在的卡號一律略過）</label>
        <div id="rvImpPrev" class="rvi-prev" aria-live="polite"></div>
        <div class="rvi-act">
          <button type="button" class="btn ui-solid hit" id="rvImpGo" disabled>匯入</button>
          <button type="button" class="btn ui-ghost hit" data-rvimpclose>取消</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('#rvImpText').placeholder = RV_IMP_PH;

    m.addEventListener('click', ev => {
      if (ev.target.closest('[data-rvimpclose]')) rvImpClose();
    });
    /* Esc 層級：播放器優先（掛 window，同 rpModal 語彙） */
    addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      const md = document.getElementById('rvImpModal');
      if (!md || md.hidden) return;
      if (typeof playing !== 'undefined' && playing) return;   // 先讓播放器關
      rvImpClose();
    });
    /* 事件 → 重算預覽（狀態＝textarea 本身，不留副本） */
    m.querySelector('#rvImpText').addEventListener('input', rvImpPreview);
    m.querySelector('#rvImpOver').addEventListener('change', rvImpPreview);
    m.querySelector('#rvImpGo').addEventListener('click', rvImpApply);
  }
  m.hidden = false; document.body.classList.add('modal-open');
  rvImpPreview();
  m.querySelector('#rvImpText').focus();
}

/* 解析一次、到處用：existingIds 每次現讀牌組（讀穿模式，不留陳舊副本） */
function rvImpParse(m) {
  return ReviewCore.parseImport(m.querySelector('#rvImpText').value, todayStr(),
                                rvState().cards.map(c => c && c.id));
}

/* 純輸出：吃 textarea → 吐預覽（N 張可匯入／衝突／錯誤行＋每張的下次到期） */
function rvImpPreview() {
  const m = document.getElementById('rvImpModal');
  if (!m) return;
  const host = m.querySelector('#rvImpPrev');
  const go = m.querySelector('#rvImpGo');
  if (!m.querySelector('#rvImpText').value.trim()) {
    host.innerHTML = ''; go.disabled = true; return;
  }
  const today = todayStr(), exam = rvExam();
  const r = rvImpParse(m);
  const over = m.querySelector('#rvImpOver').checked;
  go.disabled = (r.cards.length + (over ? r.conflicts.length : 0)) === 0;

  const dueTxt = c => {
    const d = ReviewCore.nextDue(c.history, c.createdAt, exam);
    if (!d) return '—';
    if (exam && d > exam) return '畢業（考前不再排）';
    const md = d.slice(5).replace('-', '/');
    return d <= today ? `已到期 ${md}` : `下次 ${md}`;
  };
  const row = (c, tag) => `<div class="rvi-row">
      <span class="rvi-id mono">${esc(c.id)}</span>
      <span class="rvi-meta mono">p.${esc(c.page)} · ${c.history.length ? c.history.length + ' 筆歷史' : '新卡'}</span>
      ${tag || ''}
      <span class="rvi-due mono">${dueTxt(c)}</span>
    </div>`;

  host.innerHTML = `
    <p class="eyebrow rvi-sum"><span>${r.cards.length + (over ? r.conflicts.length : 0)} 張可匯入</span>
      ${r.conflicts.length ? `<i>${r.conflicts.length} 張已存在（${over ? '將覆蓋' : '略過'}）</i>` : ''}
      ${r.errors.length ? `<i class="rvi-errn">${r.errors.length} 行有誤</i>` : ''}</p>
    ${r.cards.map(c => row(c)).join('')}
    ${r.conflicts.map(c => row(c, `<span class="rvi-tag mono">${over ? '覆蓋' : '略過'}</span>`)).join('')}
    ${r.errors.map(e => `<div class="rvi-row rvi-err mono">行 ${e.line} · ${esc(e.reason)}</div>`).join('')}`;
}

/* 事件 → 改狀態 → 存鍵 → 重繪（同 rvMark 流向） */
function rvImpApply() {
  const m = document.getElementById('rvImpModal');
  if (!m) return;
  const r = rvImpParse(m);
  const over = m.querySelector('#rvImpOver').checked;
  const st = rvState();
  let cards = st.cards.slice(), replaced = 0;
  if (over) for (const c of r.conflicts) {
    const i = cards.findIndex(x => x && x.id === c.id);
    if (i >= 0) { cards[i] = c; replaced++; }
  }
  cards = cards.concat(r.cards);
  const n = r.cards.length + replaced;
  if (!n) return;
  rvSaveCards(cards);
  m.querySelector('#rvImpText').value = '';
  rvImpClose();
  renderReview();
  /* 匯入帶歷史，站 04「今日複習」計數可能立刻變——同步補繪（同 rvMark） */
  if (typeof renderStudy === 'function') renderStudy();
  if (typeof toastMsg === 'function') {
    const skip = r.conflicts.length - replaced;
    toastMsg(`匯入 ${n} 張` + (replaced ? `（覆蓋 ${replaced}）` : '') +
             (skip ? `，略過 ${skip} 張已存在` : '') +
             (r.errors.length ? `，${r.errors.length} 行有誤未匯入` : ''));
  }
}

/* 開站即渲染（scripts 在 body 尾端，DOM 已就緒；#wm 未解除 hidden 前不可見）。
   之後的重繪點：rvMark／rvAdd／rvImpApply（本檔）、/sync 合併有更新（08-sync）。 */
renderReview();
