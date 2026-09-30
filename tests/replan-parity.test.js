/* T08 演算法級對照（驗收 1）：
   (a) ORIG＝site/replan.html <script> 的演算法，於退役前逐字抄錄於下方 ORIG 區
   (b) PORT＝site/js/13-replan.js 的 ReplanCore（移植版）
   對兩邊注入「同一份章節資料」（sprint.json 衍生，資料飄移已於步驟 0 排除），
   三組輸入（輕鬆過／要砍幾章／全砍也不夠）下：
   砍章順序、鎖住集合、判定（ok/warn/bad）、省時／代價數字必須完全一致。
   跑法：node tests/replan-parity.test.js（全綠 exit 0；任何不一致 exit 1） */
'use strict';
const assert = require('node:assert');
const path = require('node:path');
const ReplanCore = require(path.join(__dirname, '..', 'site', 'js', '13-replan.js'));
const SPRINT = require(path.join(__dirname, '..', 'data', 'sprint.json'));

/* ================= ORIG：逐字抄自 site/replan.html（2026-08-31 退役存證） ================= */
const CROSS_LOCK = { 'laplace': '控制系統的轉移函數建立在拉氏上，9/13 接棒' };

/* 某章是否為「還沒讀的章節」的先備上游 → 鎖住不可砍 */
function isLocked(ch, pending) {
  if (CROSS_LOCK[ch.id]) return CROSS_LOCK[ch.id];
  const downstream = pending.filter(p => p.dep === ch.id && p.id !== ch.id);
  if (downstream.length) return downstream.map(d => d.name).join('、') + ' 的先備';
  return null;
}

/* render() 的數學段（DOM 輸出剝除，計算逐字保留；done 集合與 daysLeft 注入） */
function origCompute(all, done, daily, spent, daysLeft) {
  const finished = all.filter(c => done.has(c.id));
  const pending  = all.filter(c => !done.has(c.id));
  const plannedDone = finished.reduce((n,c) => n + c.h, 0);
  const pendingPlan = pending.reduce((n,c) => n + c.h, 0);

  /* 膨脹係數：實際花的時間 ÷ 這些章原本排的時數 */
  const infl = plannedDone > 0 ? spent / plannedDone : null;
  const need = infl ? pendingPlan * infl : pendingPlan;
  const have = daysLeft * daily;
  const gap  = need - have;

  let cls;
  if (!finished.length) cls = 'warn';
  else if (gap <= 0)    cls = 'ok';
  else                  cls = 'bad';

  /* --- cut candidates: 貪婪剝除 --- */
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
  return { cls, gap, seq, saved, cost, shortfall,
           locked: remaining.filter(c => isLocked(c, remaining)).map(c => c.id) };
}
/* ================= ORIG 區結束 ================= */

/* 同一份章節資料：sprint.json 衍生（兩邊都吃這份） */
const chapters = ReplanCore.chaptersFrom(SPRINT);
assert.strictEqual(chapters.length, 20, '第一輪章節應為 20 章（elec 10＋math 5＋la 5）');

const CASES = [
  { tag: '輕鬆過',
    done: ['circuit0', 'diode', 'la-matrix', 'la-space', 'laplace'],
    daily: 7, spent: 38, daysLeft: 12, expect: 'ok' },
  { tag: '要砍幾章',
    done: ['circuit0', 'diode', 'bjt-dc', 'bjt-ac', 'la-matrix', 'la-space', 'laplace', 'ode-1'],
    daily: 4, spent: 68, daysLeft: 12, expect: 'bad' },
  { tag: '全砍也不夠',
    done: ['circuit0'],
    daily: 2, spent: 9, daysLeft: 5, expect: 'bad' },
];

let fail = 0;
const table = [];
for (const c of CASES) {
  const done = new Set(c.done);
  const o = origCompute(chapters, done, c.daily, c.spent, c.daysLeft);
  const p = ReplanCore.compute({ chapters, doneIds: done,
                                 daily: c.daily, spent: c.spent, daysLeft: c.daysLeft });
  const row = { case: c.tag, verdict: `${o.cls}/${p.verdict}`, ok: true };
  try {
    assert.strictEqual(p.verdict, o.cls, 'verdict 不一致');
    assert.strictEqual(p.verdict, c.expect, `verdict 應為 ${c.expect}`);
    assert.deepStrictEqual(p.seq.map(x => x.id), o.seq.map(x => x.id), '砍章順序不一致');
    assert.deepStrictEqual(p.locked.map(x => x.id).sort(), o.locked.slice().sort(), '鎖住集合不一致');
    assert.strictEqual(p.saved, o.saved, 'saved 不一致');
    assert.strictEqual(p.cost, o.cost, 'cost 不一致');
    assert.strictEqual(p.shortfall, o.shortfall, 'shortfall 不一致');
    /* done 章絕不出現在砍單（SP.done 排除驗證的演算法面） */
    for (const v of p.seq) assert.ok(!done.has(v.id), `已完成章 ${v.id} 被列入砍單`);
  } catch (e) { row.ok = false; row.err = e.message; fail++; }
  row.cuts   = o.seq.map(x => x.id).join(' → ') || '（無）';
  row.locked = o.locked.join('、') || '（無）';
  row.saved  = o.saved.toFixed(1) + 'h';
  row.cost   = o.cost.toFixed(1) + '%';
  row.gap    = o.gap.toFixed(1) + 'h';
  row.shortfall = o.shortfall ? '是' : '否';
  table.push(row);
}

for (const r of table) {
  console.log(`\n[${r.ok ? 'PASS' : 'FAIL'}] ${r.case}  verdict(orig/port)=${r.verdict}  gap=${r.gap}`);
  console.log(`  砍章順序：${r.cuts}`);
  console.log(`  鎖住不可砍：${r.locked}`);
  console.log(`  省 ${r.saved}／代價 ${r.cost}／全砍也補不平：${r.shortfall}`);
  if (r.err) console.log(`  !! ${r.err}`);
}
console.log(`\n${fail === 0 ? '3/3 全一致 — 演算法級對照通過' : fail + ' 組不一致'}`);
process.exit(fail === 0 ? 0 : 1);
