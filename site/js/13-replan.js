/* ---------- T08 落後重排：site/replan.html 併入工作台 ----------
   演算法「原樣搬」：膨脹係數（實花÷計畫）、貪婪剝葉（每小時分數性價比）、
   依賴鏈鎖（待讀章節的先備上游不可砍）、跨科鎖（拉氏→控制 9/13）。
   compute 段逐字保留原 render() 的數學；純計算與渲染分離，
   node（tests/replan-parity.test.js）與瀏覽器共用同一份核心。

   資料（步驟 0 裁定，飄移以 sprint.json 為準）：
   · 章節結構／名稱／時數／截止日 → 執行期讀 SPRINT_PLAN（data/sprint.json），
     replan.html 的硬編碼複本已消滅；phase2 科目（控制、多益）不在第一輪重排範圍。
   · DEP／W 是 sprint.json「沒有的」兩個演算法參數（依賴邊、十年考點佔比），
     以 sprint.json 章節 id 為鍵掛在這裡——不是複本，是 sprint.json 的補充欄位。
     飄移裁定已套用：basic→circuit0；laplace 在 sprint.json 排 W1 第一順位
     （在 ode-1 之前），故原 dep:'ode-n' 取消（跨科鎖不受影響）。
   · 完成章節唯一事實來源＝SP.done（feb-sprint-v1）。feb-replan-v1 退役、
     不遷移（它是草稿工具的暫存）。 */
(function (global) {
  'use strict';

  /* 依賴邊：後續章節 → 先備章節（無先備＝null）。
     電子學為課本線性鏈；線代為單鏈；ODE 為單鏈；拉氏、傅立葉見檔頭裁定。 */
  const DEP = {
    circuit0: null, diode: 'circuit0', 'bjt-dc': 'diode', 'bjt-ac': 'bjt-dc',
    'mos-dc': 'bjt-ac', 'mos-ac': 'mos-dc', diff: 'mos-ac', freq: 'diff',
    opamp: 'freq', feedback: 'opamp',
    'la-matrix': null, 'la-space': 'la-matrix', 'la-eigen': 'la-space',
    'la-inner': 'la-eigen', 'la-svd': 'la-inner',
    laplace: null, 'ode-1': null, 'ode-n': 'ode-1', 'ode-sys': 'ode-n',
    fourier: 'laplace',
  };

  /* 佔全科分數 %：十年考古題熱力分析（工數 8 組來源 772 題、電子學 3 組 274 題），
     章節內按規劃時數比例分攤（sprint-plan.md 產物，sprint.json 無此欄位）。 */
  const W = {
    circuit0: 2, diode: 9, 'bjt-dc': 8.5, 'bjt-ac': 8.5, 'mos-dc': 13,
    'mos-ac': 18, diff: 8, freq: 8, opamp: 10, feedback: 5,
    'la-matrix': 6, 'la-space': 12, 'la-eigen': 10.5, 'la-inner': 7.5, 'la-svd': 3,
    laplace: 5.5, 'ode-1': 11.7, 'ode-n': 17.5, 'ode-sys': 8.8, fourier: 4.5,
  };

  /* 拉氏是控制系統轉移函數的先備知識，跨科鎖定（原樣） */
  const CROSS_LOCK = { 'laplace': '控制系統的轉移函數建立在拉氏上，9/13 接棒' };

  /* 某章是否為「還沒讀的章節」的先備上游 → 鎖住不可砍（原樣） */
  function isLocked(ch, pending) {
    if (CROSS_LOCK[ch.id]) return CROSS_LOCK[ch.id];
    const downstream = pending.filter(p => p.dep === ch.id && p.id !== ch.id);
    if (downstream.length) return downstream.map(d => d.name).join('、') + ' 的先備';
    return null;
  }

  /* sprint.json → 演算法章節形狀 {id,name,h,w,dep,subj,subjName}（原 allCh() 的替身） */
  function chaptersFrom(plan) {
    const out = [];
    for (const s of ((plan && plan.subjects) || [])) {
      if (s.phase2) continue;               // 控制／多益不在第一輪重排範圍
      for (const c of s.chapters)
        out.push({ id: c.id, name: c.name, h: c.hours,
                   w: (W[c.id] != null ? W[c.id] : 0),
                   dep: (DEP[c.id] != null ? DEP[c.id] : null),
                   subj: s.id, subjName: s.name });
    }
    return out;
  }

  /* 截止日 → 剩餘天數（原樣的日期算法；today 注入，見 render-discipline） */
  function daysLeftFrom(deadline, todayS) {
    const dl = new Date(deadline + 'T00:00:00');
    const today = new Date(todayS + 'T00:00:00');
    return Math.max(0, Math.round((dl - today) / 86400000));
  }

  /* 純計算——replan.html render() 的數學段原樣抽出（無 DOM）。
     回傳判定（ok/warn/bad）、膨脹係數、缺口、砍章順序、鎖鏈集合。 */
  function compute({ chapters, doneIds, daily, spent, daysLeft }) {
    const all = chapters;
    const finished = all.filter(c => doneIds.has(c.id));
    const pending  = all.filter(c => !doneIds.has(c.id));
    const plannedDone = finished.reduce((n,c) => n + c.h, 0);
    const pendingPlan = pending.reduce((n,c) => n + c.h, 0);

    /* 膨脹係數：實際花的時間 ÷ 這些章原本排的時數（原樣） */
    const infl = plannedDone > 0 ? spent / plannedDone : null;
    const need = infl ? pendingPlan * infl : pendingPlan;
    const have = daysLeft * daily;
    const gap  = need - have;

    const verdict = !finished.length ? 'warn' : (gap <= 0 ? 'ok' : 'bad');

    /* --- cut candidates: 貪婪剝除（原樣）---
       只有「沒有待讀章節依賴它」的葉節點可砍。砍掉一個之後，它的上游可能
       就變成新的葉節點，所以每一輪都要重算——不能只算一次。 */
    const remaining = pending.map(c => ({ ...c, ratio: c.w / c.h }));
    const seq = [];
    let saved = 0, cost = 0;

    while (gap > 0 && saved < gap) {
      const leaves = remaining.filter(c => !isLocked(c, remaining));
      if (!leaves.length) break;
      leaves.sort((a, b) => a.ratio - b.ratio);
      const victim = leaves[0];
      saved += victim.h * (infl || 1);
      cost  += victim.w;
      seq.push({ ...victim, saved, cost });
      remaining.splice(remaining.findIndex(c => c.id === victim.id), 1);
    }

    const shortfall = gap > 0 && saved < gap;
    const locked = remaining
      .filter(c => isLocked(c, remaining))
      .map(c => ({ id: c.id, name: c.name, why: isLocked(c, remaining),
                   cross: !!CROSS_LOCK[c.id] }));

    return { finished, pending, plannedDone, pendingPlan, infl, need, have, gap,
             verdict, seq, saved, cost, shortfall, remaining, locked };
  }

  const ReplanCore = { DEP, W, CROSS_LOCK, isLocked, chaptersFrom, daysLeftFrom, compute };
  if (typeof module !== 'undefined' && module.exports) module.exports = ReplanCore;
  else global.ReplanCore = ReplanCore;
})(typeof window !== 'undefined' ? window : globalThis);

/* ================= UI（瀏覽器端；渲染紀律：狀態在 JS，DOM write-only） =================
   modal 是合法玻璃浮層（去框化法豁免）；內部去框化——eyebrow＋髮絲線分節、
   行線表格、無子框。完成章節讀寫 SP.done（勾章＝看板同一份資料，雙向即時）。 */

/* 輸入是 UI 暫態（非資料，不進 localStorage）：每次都該從紙本記錄卡抄最新值。
   deadline 預設取 SPRINT_PLAN.deadline（2026-09-12）。 */
const RP = { daily: 4, spent: 16, deadline: null };

function rpClose() {
  const m = document.getElementById('rpModal');
  if (!m || m.hidden) return;
  m.hidden = true;
  document.body.classList.remove('modal-open');
}

function openReplan() {
  if (!SPRINT_PLAN) { if (typeof toastMsg === 'function') toastMsg('衝刺計畫還沒載入'); return; }
  if (!RP.deadline) RP.deadline = SPRINT_PLAN.deadline || '2026-09-12';

  let m = document.getElementById('rpModal');
  if (!m) {
    m = document.createElement('div'); m.id = 'rpModal'; m.className = 'modal';
    m.innerHTML = `<div class="modal-back" data-rpclose></div>
      <div class="modal-panel glass rp-panel" role="dialog" aria-modal="true" aria-label="落後重排">
        <button class="modal-x lq" type="button" data-rpclose aria-label="關閉">✕</button>
        <h3>落後重排</h3>
        <p class="rp-note">用<b>實測速率</b>重算第一輪（至 ${esc(SPRINT_PLAN.deadline)}）跑不跑得完。
          跑不完時，按「每小時能守住多少分」決定砍哪一章——<b>依賴鏈上游不准砍</b>。</p>

        <p class="eyebrow rp-mark"><span>RP-01 · 你的實測</span><i>從紙本規則卡下半的每日記錄抄過來</i></p>
        <div class="rp-fields">
          <label class="rp-f"><span>每天實際可讀</span>
            <input id="rpDaily" class="mono" type="number" min="0.5" max="12" step="0.5">
            <small>小時</small></label>
          <label class="rp-f"><span>目前累計已讀</span>
            <input id="rpSpent" class="mono" type="number" min="0" step="0.5">
            <small>小時（記錄表加總）</small></label>
          <label class="rp-f"><span>第一輪截止</span>
            <input id="rpDeadline" class="mono" type="date">
            <small id="rpDays" class="mono"></small></label>
        </div>
        <div id="rpChips"></div>

        <p class="eyebrow rp-mark"><span>RP-02 · 跑不跑得完</span></p>
        <div id="rpVerdict"></div>

        <p class="eyebrow rp-mark"><span>RP-03 · 要砍就從這裡砍</span><i>已排除依賴鏈上游</i></p>
        <div id="rpCuts"></div>
        <p class="rp-note2"><b>佔比</b>來自十年考古題熱力分析（工數 8 組來源 772 題、電子學 3 組 274 題），
          章節內按時數比例分攤。<b>性價比</b>＝該章佔全科分數 ÷ 計畫時數，數字越低代表每小時買到的分數越少。
          <b>鎖住的章不列入</b>——它們是後續章節的先備知識，砍了會連帶讓下游整片失效。</p>
      </div>`;
    document.body.appendChild(m);

    m.addEventListener('click', ev => {
      if (ev.target.closest('[data-rpclose]')) rpClose();
    });
    /* Esc 層級：播放器優先（掛 window，與站上其他關閉行為同層） */
    addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      const md = document.getElementById('rpModal');
      if (!md || md.hidden) return;
      if (typeof playing !== 'undefined' && playing) return;   // 先讓播放器關
      rpClose();
    });
    /* 事件 → 改 JS 狀態（RP）→ 重繪。欄位骨架只建一次，重繪不碰它（保住焦點）。 */
    m.querySelector('#rpDaily').addEventListener('input', e => { RP.daily = +e.target.value || 0; rpRender(); });
    m.querySelector('#rpSpent').addEventListener('input', e => { RP.spent = +e.target.value || 0; rpRender(); });
    m.querySelector('#rpDeadline').addEventListener('input', e => {
      if (e.target.value) RP.deadline = e.target.value; rpRender(); });
  }

  m.querySelector('#rpDaily').value = RP.daily;
  m.querySelector('#rpSpent').value = RP.spent;
  m.querySelector('#rpDeadline').value = RP.deadline;
  rpRender();
  m.hidden = false; document.body.classList.add('modal-open');
  const first = m.querySelector('#rpDaily'); if (first) first.focus();
}

/* 純輸出：吃 RP＋SP.done，重繪 chips／verdict／cut list 三個 host */
function rpRender() {
  const m = document.getElementById('rpModal');
  if (!m) return;
  const chapters = ReplanCore.chaptersFrom(SPRINT_PLAN);
  const doneIds = new Set(Object.keys(SP.done));
  const daysLeft = ReplanCore.daysLeftFrom(RP.deadline, todayStr());
  document.getElementById('rpDays').textContent = `還有 ${daysLeft} 天`;

  const r = ReplanCore.compute({ chapters, doneIds, daily: RP.daily, spent: RP.spent, daysLeft });

  /* --- chips：科別分組，結構階學科色；點掉＝寫 SP.done（看板同一份資料） --- */
  const bySubj = new Map();
  for (const c of chapters) {
    if (!bySubj.has(c.subj)) bySubj.set(c.subj, { name: c.subjName, list: [] });
    bySubj.get(c.subj).list.push(c);
  }
  document.getElementById('rpChips').innerHTML = [...bySubj.entries()].map(([sid, g]) => `
    <div class="rp-subj" style="--c:var(--sc-${esc(sid)})">
      <span class="rp-sname mono">${esc(g.name)}</span>
      <span class="rp-shint">點掉已完成的章節（判準：不看解做出 2 題考古題）</span>
      <div class="rp-chiprow">${g.list.map(c => `
        <button type="button" class="rp-chip hit ${doneIds.has(c.id) ? 'on' : ''}" data-rpch="${esc(c.id)}">
          ${doneIds.has(c.id) ? '<b aria-hidden="true">✓</b>' : ''}${esc(c.name)} <i class="mono">${c.h}h</i>
        </button>`).join('')}</div>
    </div>`).join('');
  m.querySelectorAll('[data-rpch]').forEach(el => el.onclick = () => {
    const id = el.dataset.rpch;
    if (SP.done[id]) delete SP.done[id]; else SP.done[id] = todayStr();
    spSave();
    rpRender();
    if (typeof renderStudy === 'function') renderStudy();   // 看板即時跟上（單一事實來源）
  });

  /* --- verdict：狀態 token＋glyph＋文字（不 color-alone），左脊線去框化 --- */
  let glyph, head, why;
  if (r.verdict === 'warn') {
    glyph = '!';
    head = '先點掉至少一個已完成的章節';
    why = '沒有完成紀錄就算不出你的實際速率，下面的建議會失去依據。判準是「不看解答做出該章 2 題考古題」——只看完影片不算。';
  } else if (r.verdict === 'ok') {
    glyph = '✓';
    head = `照這個速度跑得完，還多 ${Math.abs(r.gap).toFixed(1)} 小時`;
    /* 判例 11：infl＝實花÷計畫＝時間膨脹係數，不是速率——<1 代表比計畫快，
       不准寫成「速率 0.71 倍」讓人讀成慢了三成 */
    why = `每計畫 1 小時你實花 <b>${r.infl.toFixed(2)} 小時</b>。剩下 ${r.pending.length} 章、預估需要 ${r.need.toFixed(1)} 小時，而你有 ${r.have.toFixed(1)} 小時。不用砍章，但別鬆——這個估計假設後面的章節跟前面一樣難。`;
  } else {
    glyph = '✕';
    head = `缺 ${r.gap.toFixed(1)} 小時，跑不完`;
    why = `每計畫 1 小時你實花 <b>${r.infl.toFixed(2)} 小時</b>（計畫 ${r.plannedDone.toFixed(1)}h 的量，你花了 ${RP.spent}h）。剩下 ${r.pending.length} 章按這個時間比要 <b>${r.need.toFixed(1)} 小時</b>，但到截止只剩 <b>${r.have.toFixed(1)} 小時</b>。下面按性價比排序，從最上面開始砍到缺口補平為止。`;
  }
  document.getElementById('rpVerdict').innerHTML = `
    <div class="rp-verdict s-${r.verdict}">
      <div class="rp-vhead"><span class="vg mono" aria-hidden="true">${glyph}</span><span>${head}</span></div>
      <div class="rp-vwhy">${why}</div>
      <div class="rp-nums mono">
        <div><b>${r.infl ? r.infl.toFixed(2) + '×' : '—'}</b><span>實花／計畫 時間比</span></div>
        <div><b>${r.pending.length}</b><span>剩餘章節</span></div>
        <div class="hi"><b>${r.need.toFixed(1)}h</b><span>預估還需要</span></div>
        <div class="${r.gap > 0 ? 'dn' : ''}"><b>${r.have.toFixed(1)}h</b><span>到截止可用</span></div>
      </div>
    </div>`;

  /* --- cut list：行線分隔列（表格用行線不用外框——去框化法）＋鎖鏈 mono 註記 --- */
  const rows = r.seq.map((c, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td class="n">${esc(c.name)}<div>${esc(c.subjName)}</div></td>
      <td class="c">${c.h}h</td>
      <td class="c">${c.w}%</td>
      <td class="c">${c.ratio.toFixed(2)}</td>
      <td class="cost"><b>−${c.cost.toFixed(1)}%</b><div>省 ${c.saved.toFixed(1)}h</div></td>
    </tr>`).join('');

  document.getElementById('rpCuts').innerHTML = !r.finished.length
    ? `<div class="rp-empty">先在上面點掉已完成的章節。</div>`
    : r.gap <= 0
      ? `<div class="rp-empty">目前不需要砍任何章節。</div>`
      : `<div class="rp-scroll"><table>
          <thead><tr><th>順位</th><th>章節</th><th>時數</th><th>佔全科</th><th>性價比</th><th>累計代價</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="rp-cutnote">
          砍掉這 <b>${r.seq.length}</b> 章可省約 <b class="sv mono">${r.saved.toFixed(1)} 小時</b>，
          代價是放掉約 <b class="ct mono">${r.cost.toFixed(1)}%</b> 的分數。
          順位是<b>從依賴鏈尾端往回剝</b>——砍掉尾巴後，前一章才會變成可砍的葉節點。
          這些章不是永久放棄，是<b>移到 10 月補洞期</b>。
        </div>
        ${r.shortfall ? `<div class="rp-cutnote bad">
          <b>全砍也補不平，還差 ${(r.gap - r.saved).toFixed(1)} 小時。</b>
          代表這不是砍章能解決的——只剩三條路：把每日時數往上調（但那是你排不出來才落後的）、
          把第一輪截止往後推（會壓縮控制系統的 9/13 起跑），或接受第一輪帶著洞進入 10 月。
          這三個都是真實的取捨，工具不會幫你選。
        </div>` : ''}
        ${r.remaining.length ? `<div class="rp-keep">
          <b>保留 ${r.remaining.length} 章</b>，其中鎖住不可砍的：
          ${r.locked.map(c =>
            `${esc(c.name)} <span class="rp-lock">⊘ ${c.cross ? '跨科鎖' : '依賴鏈鎖'} · ${esc(c.why)}</span>`
          ).join('　') || '無'}
        </div>` : ''}`;
}
