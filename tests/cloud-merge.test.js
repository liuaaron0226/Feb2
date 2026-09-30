/* cloud-merge.test.js — 證明雲端 Function 的合併與家用媒體伺服器的 Python 合併
   是同一件事。node --test tests/ 跑。

   證法不是「我再寫一次斷言看看 JS 對不對」——那只證得了 JS 做了我以為的事。
   這裡比的是 **Python 實際跑出來的輸出**：tests/fixtures/merge-golden.json 由
   tests/fixtures/gen-merge-golden.py 載入服役中的 serve_media.py 產生，
   131 組 (a, b) 逐位元組對照。合併規則哪天走樣，這裡會先叫。

   語料全部合成：真實備考進度不進 repo（個人進度永不公開，測試也不例外）。 */

'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const GOLDEN = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'merge-golden.json'), 'utf8'));

const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let M;      // functions/_lib/merge.mjs
let S;      // functions/_lib/progress-store.mjs

before(async () => {
  M = await load('functions/_lib/merge.mjs');
  S = await load('functions/_lib/progress-store.mjs');
});

/* JSON.stringify 兩邊都跑一次：把「Python 的 5.0 / JS 的 5」這種純表示法差異
   正規化掉，剩下的差異才是真的行為差異（鍵順序照樣比得出來）。 */
const norm = (v) => JSON.stringify(v);

test('合併規則與 Python merge_progress() 逐位元組相同', () => {
  const bad = [];
  let compared = 0;
  let threw = 0;
  for (const c of GOLDEN.cases) {
    if (c.raises) {
      // Python 自己丟例外的組合（型別不可比）：JS 移植版必須也在同一處炸，
      // 而不是安靜回一個看起來很合理的錯答案。
      assert.throws(() => M.mergeProgress(c.a, c.b, { now: GOLDEN.now }),
        undefined, `${c.label}：Python 丟 ${c.raises}，JS 卻沒炸`);
      threw++;
      continue;
    }
    const got = M.mergeProgress(c.a, c.b, { now: GOLDEN.now });
    if (norm(got) !== norm(c.expect)) {
      bad.push(`${c.label}\n    python: ${norm(c.expect)}\n    js    : ${norm(got)}`);
    }
    compared++;
  }
  assert.equal(bad.length, 0,
    `${bad.length}/${GOLDEN.cases.length} 組不一致：\n  ${bad.slice(0, 5).join('\n  ')}`);
  assert.ok(compared >= 120, `語料太少（只比了 ${compared} 組）`);
  assert.ok(threw >= 1, '至少要有一組驗到「Python 炸、JS 也要炸」');
});

test('90 天汰除切點的字串格式與 Python 的 strftime 相同', () => {
  assert.equal(M.editCutoff(GOLDEN.now), GOLDEN.cutoff);
});

test('字串比較走 Unicode code point（不是 UTF-16 code unit）', () => {
  // U+1D400（補充平面）在 code point 上大於 U+FF21，但 UTF-16 的頭一個 code unit
  // 是 U+D835，會被 JS 的 `<` 判成比較小。Python 不會。
  const hi = '\u{1D400}';
  const ff = 'Ａ';
  assert.equal(M.cmpStr(hi, ff) > 0, true);
  assert.equal(hi > ff, false, 'JS 原生比較的確會給出相反答案——所以才要 cmpStr');
});

test('int() 的邊界與 Python 一致', () => {
  assert.equal(M.pyInt('3'), 3);
  assert.equal(M.pyInt(3.9), 3);
  assert.equal(M.pyInt(-3.9), -3);
  assert.throws(() => M.pyInt('3.7'));     // Python: ValueError
  assert.throws(() => M.pyInt('x'));
  assert.throws(() => M.pyInt(null));      // Python: TypeError
});

/* ---------- D1 往返：文件 → 資料列 → 文件 ---------- */

/* 模擬 progress-store.mjs 裡 SQL_READ 的 ORDER BY。
   把排序條件在測試裡重寫一次是刻意的：history 的順序就是排程語意
   （尾端連續 pass 推梯級），SQL 的 ORDER BY 寫錯不會報錯，只會靜靜排錯梯級。 */
function simulateRead(rows) {
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    entries: rows.entries.slice().sort((a, b) => cmp(a.field, b.field) || cmp(a.item, b.item)),
    playpos: rows.playpos.slice().sort((a, b) => cmp(a.url, b.url)),
    cards: rows.cards.slice().sort((a, b) => cmp(a.id, b.id)),
    history: rows.history.slice().sort((a, b) =>
      cmp(a.card_id, b.card_id) || cmp(a.date, b.date)
      || ((a.result === 'pass' ? 0 : 1) - (b.result === 'pass' ? 0 : 1))
      || cmp(a.result, b.result)),
    meta: rows.meta.slice(),
  };
}

const roundTrip = (doc) => S.docFromRows(simulateRead(S.rowsFromDoc(doc)));

test('D1 往返不改變文件內容（含 miss 的數字型別與 review 的卡序）', () => {
  const doc = {
    watched: { '115春電子01': '2026-09-01', '115暑電子04': '2026-08-24' },
    done: { laplace: '2026-08-30' },
    miss: { laplace: 3, 'elec-bjt-dc': 0 },
    playpos: { 'http%3A//v/1.mp4': { t: 90.5, dur: 600, pct: 15, at: '2026-08-01' } },
    target: ['ncu|智慧系統組', 'ntu|甲組'],
    review: {
      cards: [
        { id: '控001', subject: 'ctrl', page: '12', createdAt: '2026-08-01',
          history: [{ date: '2026-08-20', result: 'pass' }, { date: '2026-08-25', result: 'C' }] },
        { id: '電002', subject: 'elec', page: '7', createdAt: '2026-08-05', history: [] },
      ],
    },
    edits: { 'done:laplace': '2026-09-01T10:00:00.000Z' },
    updated: '2026-09-01T10:00:00.000Z',
  };
  const back = roundTrip(doc);
  assert.deepEqual(back, doc);
  assert.equal(typeof back.miss.laplace, 'number', 'miss 必須回來是數字：客戶端拿它做加減');
  assert.equal(typeof back.review.cards[0].page, 'string', 'page 是頁面標籤不是數字');
});

test('空進度回來時不長出 review／edits 鍵', () => {
  // applyProgress() 看到 review:{cards:[]} 會整包寫回 localStorage，
  // 把裝置上還沒同步上來的卡片洗掉。沒有就不要說話。
  const back = roundTrip({ watched: {}, done: {}, miss: {}, playpos: {}, target: [] });
  assert.equal('review' in back, false);
  assert.equal('edits' in back, false);
});

test('刪除的時戳靠墓碑列活過 D1 往返，舊裝置回灌不得復活', () => {
  const T1 = '2026-09-01T10:00:00.000Z';
  const T2 = '2026-09-01T11:00:00.000Z';
  const now = GOLDEN.now;

  // 1. A 裝置勾了 done:c1
  let srv = M.mergeProgress({}, {
    watched: {}, done: { c1: '2026-09-01' }, miss: {}, playpos: {}, target: [],
    edits: { 'done:c1': T1 }, updated: T1,
  }, { now });
  srv = roundTrip(srv);
  assert.equal(srv.done.c1, '2026-09-01');

  // 2. B 裝置取消（較新的戳）。取消後 done 裡沒有 c1，戳沒有列可掛——墓碑上場
  srv = M.mergeProgress(srv, {
    watched: {}, done: {}, miss: {}, playpos: {}, target: [],
    edits: { 'done:c1': T2 }, updated: T2,
  }, { now });
  const rows = S.rowsFromDoc(srv);
  const tomb = rows.entries.find((r) => r.field === 'done' && r.item === 'c1');
  assert.ok(tomb, '刪除的鍵必須留一列墓碑替時戳站崗');
  assert.equal(tomb.value, '', '墓碑的 value 是空字串');
  assert.equal(tomb.stamp, T2);

  srv = roundTrip(srv);
  assert.equal('c1' in srv.done, false, '墓碑不得被當成一筆進度讀回來');
  assert.equal(srv.edits['done:c1'], T2, '刪除的時戳必須活過往返');

  // 3. 舊裝置（完全沒有 edits 鍵）抱著舊值上來 → 聯集不得復活它
  const resurrected = M.mergeProgress(srv, {
    watched: {}, done: { c1: '2026-09-01' }, miss: {}, playpos: {}, target: [], updated: T1,
  }, { now });
  assert.equal('c1' in resurrected.done, false,
    '這就是 T20 要修的那個 bug：取消勾選一秒後自己勾回去');
});

test('沒有時戳的鍵照舊走聯集／取大（舊裝置照常同步）', () => {
  const now = GOLDEN.now;
  const srv = roundTrip(M.mergeProgress(
    { watched: { a1: '2026-08-05' }, miss: { c1: 5 } },
    { watched: { a2: '2026-08-06' }, miss: { c1: 3 } },
    { now }));
  assert.deepEqual(srv.watched, { a1: '2026-08-05', a2: '2026-08-06' });
  assert.equal(srv.miss.c1, 5);
  assert.equal('edits' in srv, false);
});
