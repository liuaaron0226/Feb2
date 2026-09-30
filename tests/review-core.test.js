/* T07 今日複習 · 排程核心測試（node --test，零依賴）
   律法出處：.scratch/redesign/issues/T07-daily-review-module.md ＋ ADR-0004。
   梯：+3/+14/+28；壓縮以「複習當日」距考日判定：≤60 天→+3/+7/+14、≤30 天→+2/+5/+7；
   失敗（A/B/C）→ 重設回梯首；晚了不補（下次間隔從處理日起算）；
   nextDue 落在考期之後 → 畢業（不再排，仍可查）。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { nextDue, dueCards, applyResult, failStats } =
  require('../site/js/review-core.js');

const EXAM = '2027-02-01';               // 距 2026-09 遠大於 60 天 → 基本梯
const card = (id, over) => Object.assign(
  { id, subject: 'ctrl', page: 12, createdAt: '2026-08-26', history: [] }, over);
const H = (...pairs) => pairs.map(([date, result]) => ({ date, result }));

/* ---------- 基本梯 +3/+14/+28 ---------- */

test('新卡：第一次複習＝建立日 +3（history 空，ref 傳 createdAt）', () => {
  assert.equal(nextDue([], '2026-09-01', EXAM), '2026-09-04');
});

test('梯：連續 1 次 pass → +14', () => {
  assert.equal(nextDue(H(['2026-09-04', 'pass']), '2026-08-26', EXAM), '2026-09-18');
});

test('梯：連續 2 次 pass → +28', () => {
  assert.equal(
    nextDue(H(['2026-09-04', 'pass'], ['2026-09-18', 'pass']), '2026-08-26', EXAM),
    '2026-10-16');
});

test('梯頂：連續 4 次 pass 仍是 +28（梯尾重複，不再加長）', () => {
  const h = H(['2026-09-04', 'pass'], ['2026-09-18', 'pass'],
              ['2026-10-16', 'pass'], ['2026-11-13', 'pass']);
  assert.equal(nextDue(h, '2026-08-26', EXAM), '2026-12-11');
});

/* ---------- 失敗重設（A/B/C 任一） ---------- */

test('失敗：pass、pass 後記 B → 重設回 +3（從失敗那天起算）', () => {
  const h = H(['2026-09-04', 'pass'], ['2026-09-18', 'pass'], ['2026-10-16', 'B']);
  assert.equal(nextDue(h, '2026-08-26', EXAM), '2026-10-19');
});

test('失敗後再 pass：梯重新爬 → +14', () => {
  const h = H(['2026-10-16', 'A'], ['2026-10-19', 'pass']);
  assert.equal(nextDue(h, '2026-08-26', EXAM), '2026-11-02');
});

test('A、B、C 三碼同樣觸發重設', () => {
  for (const code of ['A', 'B', 'C']) {
    const h = H(['2026-09-04', 'pass'], ['2026-09-18', code]);
    assert.equal(nextDue(h, '2026-08-26', EXAM), '2026-09-21', code);
  }
});

/* ---------- 壓縮：以「複習當日」距考日判定檔位 ---------- */

test('壓縮 60 天檔（≤60）：streak1 → +7、streak2 → +14、失敗 → +3', () => {
  // 2026-12-10 距 2027-02-01 為 53 天 → 60 檔 [3,7,14]
  assert.equal(nextDue(H(['2026-12-10', 'pass']), '2026-08-26', EXAM), '2026-12-17');
  assert.equal(
    nextDue(H(['2026-12-03', 'pass'], ['2026-12-10', 'pass']), '2026-08-26', EXAM),
    '2026-12-24');
  assert.equal(nextDue(H(['2026-12-10', 'C']), '2026-08-26', EXAM), '2026-12-13');
});

test('壓縮 30 天檔（≤30）：streak1 → +5、streak2 → +7、失敗 → +2（梯首）', () => {
  // 2027-01-10 距考 22 天 → 30 檔 [2,5,7]
  assert.equal(nextDue(H(['2027-01-10', 'pass']), '2026-08-26', EXAM), '2027-01-15');
  assert.equal(
    nextDue(H(['2027-01-03', 'pass'], ['2027-01-10', 'pass']), '2026-08-26', EXAM),
    '2027-01-17');
  assert.equal(nextDue(H(['2027-01-10', 'A']), '2026-08-26', EXAM), '2027-01-12');
});

test('檔位邊界：距考恰 60 天（2026-12-03）壓縮、61 天（12-02）不壓', () => {
  assert.equal(nextDue(H(['2026-12-03', 'pass']), '2026-08-26', EXAM), '2026-12-10'); // +7
  assert.equal(nextDue(H(['2026-12-02', 'pass']), '2026-08-26', EXAM), '2026-12-16'); // +14
});

test('檔位邊界：距考恰 30 天（2027-01-02）進 30 檔、31 天（01-01）留 60 檔', () => {
  assert.equal(nextDue(H(['2027-01-02', 'pass']), '2026-08-26', EXAM), '2027-01-07'); // +5
  assert.equal(nextDue(H(['2027-01-01', 'pass']), '2026-08-26', EXAM), '2027-01-08'); // +7
});

test('新卡建立在壓縮期內：第一次複習用該檔梯首（30 檔＝+2）', () => {
  assert.equal(nextDue([], '2027-01-10', EXAM), '2027-01-12');
});

/* ---------- 晚了不補（律法釘死的工作範例） ---------- */

test('晚了不補：卡 8/29 到期、8/31 才處理、pass → 下次＝8/31+14＝9/14', () => {
  // 建立 8/26 → 到期 8/29；8/31 才開站
  const c = card('控001');                            // createdAt 2026-08-26
  const due = dueCards([c], '2026-08-31', EXAM);
  assert.equal(due.length, 1, '過期卡出現一次（單一實例，不堆疊補課）');
  assert.equal(due[0].id, '控001');
  assert.equal(due[0].due, '2026-08-29');
  const after = applyResult(c, 'pass', '2026-08-31');  // 從處理日起算
  assert.equal(nextDue(after.history, after.createdAt, EXAM), '2026-09-14');
});

test('過期多日的舊卡也只出現一次，不因每天過期而累積', () => {
  const c = card('電001', { history: H(['2026-08-15', 'A']) }); // 到期 8/18
  const due = dueCards([c], '2026-08-31', EXAM);
  assert.equal(due.length, 1);
  assert.equal(due[0].due, '2026-08-18');
});

/* ---------- dueCards：到期篩選 ---------- */

test('dueCards：今天到期含、未來不含；照到期日排序', () => {
  const a = card('控001', { createdAt: '2026-08-28' });               // 到期 8/31（今天）
  const b = card('數001', { createdAt: '2026-08-30' });               // 到期 9/02（未來）
  const c = card('電001', { history: H(['2026-08-15', 'A']) });        // 到期 8/18（過期）
  const due = dueCards([a, b, c], '2026-08-31', EXAM);
  assert.deepEqual(due.map(x => x.id), ['電001', '控001']);
});

/* ---------- 畢業：nextDue 落在考期之後 ---------- */

test('畢業：壓縮期內 pass 到 nextDue 超過考日 → 不再排入 dueCards', () => {
  // 2027-01-28 距考 4 天（30 檔），streak 2 → +7 → 2027-02-04 > 考日
  const h = H(['2027-01-21', 'pass'], ['2027-01-28', 'pass']);
  const c = card('控002', { history: h });
  assert.equal(nextDue(h, c.createdAt, EXAM), '2027-02-04', '仍可查');
  assert.equal(dueCards([c], '2027-02-04', EXAM).length, 0, '考後也不出現');
});

test('未畢業邊界：nextDue 恰落在考日當天 → 仍排', () => {
  // 2027-01-30 失敗 +2 → 2027-02-01 ＝ 考日當天，還排（考前最後回鍋）
  const c = card('控003', { history: H(['2027-01-30', 'B']) });
  const due = dueCards([c], '2027-02-01', EXAM);
  assert.equal(due.length, 1);
  assert.equal(due[0].due, '2027-02-01');
});

/* ---------- applyResult：純函式 ---------- */

test('applyResult：回新物件、原卡不變、附上 {date,result}', () => {
  const c = card('控001', { history: H(['2026-08-29', 'pass']) });
  const out = applyResult(c, 'A', '2026-09-12');
  assert.notEqual(out, c);
  assert.equal(c.history.length, 1, '原卡 history 不可被改動');
  assert.deepEqual(out.history[out.history.length - 1],
                   { date: '2026-09-12', result: 'A' });
  assert.equal(out.id, c.id);
});

/* ---------- failStats：失敗碼分布（檢討迴圈讀數） ---------- */

test('failStats：跨卡合計 A×3 B×1 C×0，pass 不計', () => {
  const c1 = card('控001', { history: H(['2026-08-29', 'A'], ['2026-09-01', 'A'],
                                        ['2026-09-04', 'pass']) });
  const c2 = card('數001', { history: H(['2026-08-30', 'B'], ['2026-09-02', 'A']) });
  assert.deepEqual(failStats([c1, c2]), { A: 3, B: 1, C: 0 });
});

test('failStats：空卡組 → 全零', () => {
  assert.deepEqual(failStats([]), { A: 0, B: 0, C: 0 });
});

/* ---------- T07b parseImport：紙本 14 天 → 數位匯入（ADR-0004/0005） ----------
   一行一卡：卡號 頁碼 [日期 結果]…；寬容格式（p.12／8/28／08-28／過／o／v）。
   科目由卡號首字推斷（控電數線多）；日期以「今天」摺年（月份 > 今月+6 → 前一年）；
   history 依日期排序；貼文內重複卡號＝錯誤行；已在牌組＝conflict 另列。 */
const { parseImport } = require('../site/js/review-core.js');
const P = (text, today = '2026-09-01', ids) => parseImport(text, today, ids);

test('parseImport：最小行「控001 12」→ ctrl 新卡、無歷史、createdAt＝今天', () => {
  const r = P('控001 12');
  assert.equal(r.errors.length, 0);
  assert.equal(r.conflicts.length, 0);
  assert.deepEqual(r.cards, [{ id: '控001', subject: 'ctrl', page: '12',
                               createdAt: '2026-09-01', history: [] }]);
});

test('parseImport：「控001 p.12」→ 頁碼剝掉 p. 前綴', () => {
  const r = P('控001 p.12');
  assert.equal(r.cards[0].page, '12');
});

test('parseImport：「電003 31 8/28 pass」→ elec、一筆歷史、createdAt＝首筆日', () => {
  const r = P('電003 31 8/28 pass');
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.cards[0], { id: '電003', subject: 'elec', page: '31',
    createdAt: '2026-08-28', history: [{ date: '2026-08-28', result: 'pass' }] });
});

test('parseImport：「數001 p.5 8/20 pass 8/23 A 8/26 pass」→ 三筆歷史照日期', () => {
  const r = P('數001 p.5 8/20 pass 8/23 A 8/26 pass');
  assert.equal(r.errors.length, 0);
  assert.equal(r.cards[0].subject, 'math');
  assert.deepEqual(r.cards[0].history, [
    { date: '2026-08-20', result: 'pass' },
    { date: '2026-08-23', result: 'A' },
    { date: '2026-08-26', result: 'pass' }]);
});

test('parseImport：「控002 12 08-28 過」→ MM-DD 日期、過＝pass', () => {
  const r = P('控002 12 08-28 過');
  assert.deepEqual(r.cards[0].history, [{ date: '2026-08-28', result: 'pass' }]);
});

test('parseImport：結果別名 o／V／✓ 都是 pass；a/b/c 小寫升大寫', () => {
  const r = P(['控001 1 8/20 o', '控002 1 8/20 V', '控003 1 8/20 ✓',
               '控004 1 8/20 a', '控005 1 8/20 b', '控006 1 8/20 c'].join('\n'));
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.cards.map(c => c.history[0].result),
                   ['pass', 'pass', 'pass', 'A', 'B', 'C']);
});

test('parseImport：未知科目字首（英001）→ 錯誤行，不產卡', () => {
  const r = P('英001 12');
  assert.equal(r.cards.length, 0);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].line, 1);
  assert.match(r.errors[0].reason, /科目/);
});

test('parseImport：貼文內重複卡號 → 第二行錯誤、第一行留下', () => {
  const r = P('控001 12\n控001 13');
  assert.equal(r.cards.length, 1);
  assert.equal(r.cards[0].page, '12');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].line, 2);
  assert.match(r.errors[0].reason, /重複/);
});

test('parseImport：卡號已在牌組 → 進 conflicts 不進 cards（UI 預設略過）', () => {
  const r = P('控001 12 8/28 pass\n電001 3', '2026-09-01', ['控001']);
  assert.equal(r.cards.length, 1);
  assert.equal(r.cards[0].id, '電001');
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].id, '控001');
  assert.equal(r.conflicts[0].history.length, 1, 'conflict 卡帶完整解析結果（覆蓋要用）');
});

test('parseImport：摺年——2 月貼 12/20 → 去年；同月不摺', () => {
  const r = P('控001 12 12/20 pass', '2026-02-01');
  assert.equal(r.cards[0].history[0].date, '2025-12-20');
  const r2 = P('控001 12 8/28 pass', '2026-09-01');
  assert.equal(r2.cards[0].history[0].date, '2026-08-28');
});

test('parseImport：歷史亂序輸入 → 依日期排序後回傳', () => {
  const r = P('控001 12 8/26 pass 8/20 A');
  assert.deepEqual(r.cards[0].history.map(h => h.date),
                   ['2026-08-20', '2026-08-26']);
  assert.equal(r.cards[0].createdAt, '2026-08-20');
});

test('parseImport：日期落單（沒結果）→ 錯誤行', () => {
  const r = P('控001 12 8/28');
  assert.equal(r.cards.length, 0);
  assert.equal(r.errors.length, 1);
});

test('parseImport：認不得的結果 → 錯誤行', () => {
  const r = P('控001 12 8/28 嗯');
  assert.equal(r.cards.length, 0);
  assert.match(r.errors[0].reason, /結果/);
});

test('parseImport：不存在的日期（13/40、2/30）→ 錯誤行', () => {
  assert.equal(P('控001 12 13/40 pass').errors.length, 1);
  assert.equal(P('控001 12 2/30 pass', '2026-03-01').errors.length, 1);
});

test('parseImport：缺頁碼／頁碼非數字 → 錯誤行', () => {
  assert.equal(P('控001').errors.length, 1);
  assert.equal(P('控001 abc').errors.length, 1);
});

test('parseImport：空行跳過、行號照原文（含 CRLF）', () => {
  const r = P('控001 12\r\n\r\n英001 3');
  assert.equal(r.cards.length, 1);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].line, 3);
});

test('parseImport：全形空白／逗號分隔也吃', () => {
  const r = P('控001　12，8/28 pass');
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.cards[0].history, [{ date: '2026-08-28', result: 'pass' }]);
});

test('parseImport → nextDue 接力：紙本歷史直接決定下次到期（匯入的意義）', () => {
  const r = P('電003 31 8/28 pass');
  const c = r.cards[0];
  assert.equal(nextDue(c.history, c.createdAt, EXAM), '2026-09-11');  // 8/28 +14
  const r2 = P('數001 p.5 8/20 pass 8/23 pass 8/26 A');
  const c2 = r2.cards[0];
  assert.equal(nextDue(c2.history, c2.createdAt, EXAM), '2026-08-29'); // 失敗重設 +3，已過期
});
