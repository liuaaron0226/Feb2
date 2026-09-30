/* cloud-progress-d1.test.js — 把 progress-store.mjs 的 SQL 真的餵給 SQLite 跑一遍。
   node --test tests/*.test.js（Node 22 的 node:sqlite，會有 experimental 警告）。

   為什麼不只測純函式：rowsFromDoc/docFromRows 對不對，跟「那幾條 SQL 是不是
   合法的、ORDER BY 有沒有排對、外鍵順序會不會炸」是兩回事。後者寫錯不會在
   單元測試裡出現，只會在雲端第一次同步時整批交易失敗——或更糟，安靜排錯
   複習梯級（history 的順序就是排程語意）。所以這裡開一顆記憶體 SQLite，
   套上 migrations/0001_init.sql，用一個最小的 D1 介面替身把真的 SQL 跑掉。 */

'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
let S;
let M;

before(async () => {
  S = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/progress-store.mjs')).href);
  M = await import(pathToFileURL(path.join(ROOT, 'functions/_lib/merge.mjs')).href);
});

/* D1 介面的最小替身。batch() 依官方文件是一個 SQL transaction——
   依序執行、任一條失敗整批回滾——這裡用 BEGIN/COMMIT/ROLLBACK 照做，
   才測得出「半套寫入」有沒有被擋住。 */
class Stmt {
  constructor(db, sql, params) { this.db = db; this.sql = sql; this.params = params || []; }
  bind(...p) { return new Stmt(this.db, this.sql, p); }
  exec() {
    const st = this.db.prepare(this.sql);
    if (/^\s*SELECT/i.test(this.sql)) return { success: true, results: st.all(...this.params) };
    const r = st.run(...this.params);
    return { success: true, results: [], meta: { changes: Number(r.changes) } };
  }
  async all() { return this.exec(); }
  async run() { return this.exec(); }
}

class FakeD1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try {
      const out = stmts.map((s) => s.exec());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');       // D1 預設開，這裡跟著開才驗得到插入順序
  db.exec(fs.readFileSync(path.join(ROOT, 'migrations', '0001_init.sql'), 'utf8'));
  return new FakeD1(db);
}

const DOC = {
  watched: { '115春電子01': '2026-09-01', '115暑電子04': '2026-08-24' },
  done: { laplace: '2026-08-30', 'elec-bjt-dc': '2026-08-28' },
  miss: { laplace: 3 },
  playpos: {
    'media%2Fctrl%2F01.mp4': { t: 90.5, dur: 600, pct: 15, at: '2026-08-01' },
    'media%2Fctrl%2F02.mp4': { t: 0, dur: 1200, pct: 0, at: '2026-08-02' },
  },
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

test('真的 SQL 跑得動：寫進 D1 再讀回來，文件一模一樣', async () => {
  const db = freshDb();
  await S.writeDoc(db, DOC);
  const back = await S.readDoc(db);
  assert.deepEqual(back, DOC);
});

test('整表改寫：第二次寫入不會留下第一次的殘骸', async () => {
  const db = freshDb();
  await S.writeDoc(db, DOC);
  await S.writeDoc(db, {
    watched: {}, done: { laplace: '2026-08-30' }, miss: {}, playpos: {}, target: [],
    updated: '2026-09-02T00:00:00.000Z',
  });
  const back = await S.readDoc(db);
  assert.deepEqual(back.watched, {});
  assert.deepEqual(back.done, { laplace: '2026-08-30' });
  assert.equal('review' in back, false, '卡片刪光之後 review 鍵也要跟著消失');
  assert.equal(back.updated, '2026-09-02T00:00:00.000Z');
});

test('review_history 讀回來就是排程要的順序（同日 pass 在前、失敗碼在後）', async () => {
  const db = freshDb();
  await S.writeDoc(db, {
    watched: {}, done: {}, miss: {}, playpos: {}, target: [],
    review: { cards: [{ id: 'X', subject: 's', page: '1', createdAt: '2026-08-01',
      history: [
        { date: '2026-08-25', result: 'C' },
        { date: '2026-08-10', result: 'pass' },
        { date: '2026-08-25', result: 'pass' },
        { date: '2026-08-20', result: 'B' },
      ] }] },
    updated: '2026-09-01T00:00:00.000Z',
  });
  const back = await S.readDoc(db);
  assert.deepEqual(back.review.cards[0].history, [
    { date: '2026-08-10', result: 'pass' },
    { date: '2026-08-20', result: 'B' },
    { date: '2026-08-25', result: 'pass' },   // 同日：pass 在前
    { date: '2026-08-25', result: 'C' },      // 失敗碼在後 → 尾端連續 pass 歸零，寧可多複習一次
  ]);
});

test('外鍵開著也寫得進去（review_card 必須先於 review_history）', async () => {
  const db = freshDb();
  await S.writeDoc(db, {
    watched: {}, done: {}, miss: {}, playpos: {}, target: [],
    review: { cards: [{ id: 'A', subject: 's', page: '1', createdAt: '2026-08-01',
      history: [{ date: '2026-08-10', result: 'pass' }] }] },
  });
  const rows = db.db.prepare('SELECT COUNT(*) AS n FROM review_history').all();
  assert.equal(rows[0].n, 1);
});

test('繫結參數分塊：兩百多筆也一次寫得完', async () => {
  const db = freshDb();
  const watched = {};
  const playpos = {};
  for (let i = 0; i < 240; i++) {
    watched['v' + String(i).padStart(4, '0')] = '2026-08-01';
    playpos['u' + String(i).padStart(4, '0')] = { t: i, dur: 100, pct: i % 100, at: '2026-08-01' };
  }
  await S.writeDoc(db, { watched, done: {}, miss: {}, playpos, target: [] });
  const back = await S.readDoc(db);
  assert.equal(Object.keys(back.watched).length, 240);
  assert.equal(Object.keys(back.playpos).length, 240);
});

test('一整趟 T20：勾 → 取消 → 舊裝置回灌，經過真的 D1 之後仍然不復活', async () => {
  const db = freshDb();
  const T1 = '2026-09-01T10:00:00.000Z';
  const T2 = '2026-09-01T11:00:00.000Z';
  const now = Date.UTC(2026, 8, 2);
  const post = async (payload) => {
    const merged = M.mergeProgress(await S.readDoc(db), payload, { now });
    await S.writeDoc(db, merged);
    return S.readDoc(db);
  };

  let doc = await post({ watched: {}, done: { c1: '2026-09-01' }, miss: {}, playpos: {},
    target: [], edits: { 'done:c1': T1 }, updated: T1 });
  assert.equal(doc.done.c1, '2026-09-01');

  doc = await post({ watched: {}, done: {}, miss: {}, playpos: {}, target: [],
    edits: { 'done:c1': T2 }, updated: T2 });
  assert.equal('c1' in doc.done, false);
  assert.equal(doc.edits['done:c1'], T2, '刪除的戳靠墓碑列活在 D1 裡');

  // 墓碑在資料庫裡真的長那樣（value='' 且帶戳）
  const tomb = db.db.prepare(
    "SELECT value, stamp FROM progress_entry WHERE field='done' AND item='c1'").all();
  assert.equal(tomb.length, 1);
  assert.equal(tomb[0].value, '');
  assert.equal(tomb[0].stamp, T2);

  doc = await post({ watched: {}, done: { c1: '2026-09-01' }, miss: {}, playpos: {},
    target: [], updated: T1 });      // 舊裝置：完全沒有 edits 鍵
  assert.equal('c1' in doc.done, false, '取消勾選一秒後自己勾回去——就是這個 bug');
});

test('batch 是一個交易：中間爆掉不留半套資料', async () => {
  const db = freshDb();
  await S.writeDoc(db, DOC);
  const before = await S.readDoc(db);
  await assert.rejects(() => db.batch([
    db.prepare('DELETE FROM progress_entry'),
    db.prepare('DELETE FROM playpos'),
    db.prepare('INSERT INTO progress_entry (field,item,value,stamp) VALUES (?,?,?,?)')
      .bind('不合法的欄位', 'x', '1', null),      // CHECK 條款會擋下這一條
  ]));
  assert.deepEqual(await S.readDoc(db), before, '整批回滾，一個位元組都不該少');
});
