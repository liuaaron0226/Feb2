/* ---------- 今日複習 · 排程核心（T07，ADR-0004） ----------
   純函式、無 DOM、無 Date.now——「今天」一律由呼叫端注入。
   同一支檔案給瀏覽器（window.ReviewCore）與 node --test（module.exports）用。

   律法（.scratch/redesign/issues/T07-daily-review-module.md，權威原文
   docs/reference/review-sheet-retired.html）：
   · 間隔梯 +3/+14/+28；梯尾重複（連續 pass 到頂就停在 +28）
   · 壓縮檔位以「複習當日」距考日判定：≤60 天 → +3/+7/+14；≤30 天 → +2/+5/+7
   · 失敗（A/B/C 任一）→ 重設回梯首（基本檔＝+3；壓縮檔取該檔梯首）
   · 晚了不補：過期卡只出現一次，處理後下次間隔從「處理日」起算
     （例：8/29 到期、8/31 處理、pass → 下次＝8/31+14）
   · nextDue 落在考期之後 → 畢業：不再排入 dueCards，卡仍在、仍可查
   · 新卡第一次複習＝建立日 + 梯首（基本檔＝+3）

   日期一律 'YYYY-MM-DD' 字串，運算走 UTC 天，避免時區與夏令時間坑。 */
(function (global) {
  'use strict';

  const DAY = 864e5;
  /* 梯（間隔天數）：基本／距考 ≤60 天／距考 ≤30 天 */
  const LADDER_BASE = [3, 14, 28];
  const LADDER_D60  = [3, 7, 14];
  const LADDER_D30  = [2, 5, 7];

  const toUTC = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const fromUTC = (t) => new Date(t).toISOString().slice(0, 10);
  const addDays = (s, n) => fromUTC(toUTC(s) + n * DAY);
  /* a − b，以天計（a、b 都是日期字串） */
  const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / DAY);

  /* 壓縮檔位：以「複習當日」（day）距考日判定 */
  function ladderOf(day, examDate) {
    if (!examDate) return LADDER_BASE;
    const left = diffDays(examDate, day);
    if (left <= 30) return LADDER_D30;
    if (left <= 60) return LADDER_D60;
    return LADDER_BASE;
  }

  /* 尾端連續 pass 數＝目前爬到的梯級；一個失敗就歸零 */
  function tailStreak(history) {
    let n = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i] && history[i].result === 'pass') n++;
      else break;
    }
    return n;
  }

  /* 下次到期日。
     history 空（新卡）時以第二參數為起算日——呼叫端傳 card.createdAt；
     有紀錄時起算日＝最後一筆的處理日（晚了不補的機械保證：
     過期幾天都一樣，間隔永遠從實際處理那天往後量）。 */
  function nextDue(history, today, examDate) {
    const h = Array.isArray(history) ? history : [];
    const last = h.length ? h[h.length - 1] : null;
    const ref = last ? last.date : today;
    if (!ref) return null;
    const ladder = ladderOf(ref, examDate);
    const idx = Math.min(tailStreak(h), ladder.length - 1);
    return addDays(ref, ladder[idx]);
  }

  /* 今日到期清單：到期（含過期，單一實例）且未畢業；照到期日、卡號排序。
     回傳淺拷貝並附 due 欄，原卡不動。 */
  function dueCards(cards, today, examDate) {
    const out = [];
    for (const c of (cards || [])) {
      if (!c) continue;
      const due = nextDue(c.history, c.createdAt, examDate);
      if (!due) continue;
      if (examDate && due > examDate) continue;   // 畢業：不再排，仍可查
      if (due > today) continue;                  // 未到期
      out.push(Object.assign({}, c, { due }));
    }
    out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 :
                        String(a.id) < String(b.id) ? -1 : 1));
    return out;
  }

  /* 記一筆結果（'pass' | 'A' | 'B' | 'C'）。純函式：回新卡，原卡不變。 */
  function applyResult(card, result, today) {
    const h = Array.isArray(card.history) ? card.history : [];
    return Object.assign({}, card, {
      history: h.concat([{ date: today, result }]),
    });
  }

  /* ---------- T07b 匯入解析（紙本 14 天 → 數位；ADR-0004/0005） ----------
     一行一卡：卡號 頁碼 [日期 結果]…（寬容：p.12／8/28／08-28／過／o／v／✓）
     · 科目由卡號首字推斷（控電數線多；認不得＝錯誤行）
     · 日期 M/D 或 MM-DD → ISO；摺年：月份 > 今月+6 → 前一年
       （1 月貼 12/20 是去年 12 月，不是 11 個月後——紙本歷史必在過去）
     · history 依日期排序；createdAt＝首筆歷史日（無歷史＝今天）
     · 貼文內重複卡號＝錯誤行（第一行留下）；已在牌組＝conflicts 另列，
       匯不匯（覆蓋／略過）是 UI 的事，解析器只分類 */
  const IMP_PREFIX = { '控': 'ctrl', '電': 'elec', '數': 'math',
                       '線': 'la', '多': 'toeic' };
  const IMP_RESULT = { pass: 'pass', '過': 'pass', o: 'pass', v: 'pass',
                       '✓': 'pass', '✔': 'pass', a: 'A', b: 'B', c: 'C' };

  function impDate(tok, year, month) {
    const m = /^(\d{1,2})[\/\-](\d{1,2})$/.exec(tok);
    if (!m) return null;
    const mo = +m[1], d = +m[2];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const y = (month && mo > month + 6) ? year - 1 : year;
    const t = Date.UTC(y, mo - 1, d);
    const back = new Date(t);                        // 2/30 這種假日期會滾月
    if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return fromUTC(t);
  }

  /* parseImport(text, today, existingIds?) → {cards, errors:[{line,reason}], conflicts}
     today 傳 'YYYY-MM-DD'（呼叫端注入，同 nextDue 紀律）；也容忍純年份數字
     （此時無今月可參照，不摺年）。existingIds＝牌組現有卡號（Set 或陣列）。 */
  function parseImport(text, today, existingIds) {
    let year, month, todayISO;
    if (typeof today === 'string' && today.indexOf('-') > 0) {
      const p = today.split('-').map(Number);
      year = p[0]; month = p[1]; todayISO = today;
    } else {
      year = Number(today) || new Date().getUTCFullYear();
      month = 0; todayISO = year + '-01-01';
    }
    const exist = existingIds instanceof Set ? existingIds
                : new Set(Array.isArray(existingIds) ? existingIds : []);
    const cards = [], errors = [], conflicts = [], seen = new Set();
    const lines = String(text || '').split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = i + 1;
      const raw = lines[i].trim();
      if (!raw) continue;
      const toks = raw.split(/[\s　,，、]+/).filter(Boolean);

      const id = toks[0];
      const subject = IMP_PREFIX[id.charAt(0)];
      if (!subject) {
        errors.push({ line, reason: `卡號「${id}」科目字首認不得（控／電／數／線／多）` });
        continue;
      }
      if (!/^\d+$/.test(id.slice(1))) {
        errors.push({ line, reason: `卡號「${id}」格式不對（科目字＋流水號，如 控001）` });
        continue;
      }
      if (toks.length < 2) { errors.push({ line, reason: '缺頁碼' }); continue; }
      const page = toks[1].replace(/^[pP]\.?\s*/, '');
      if (!/^\d+$/.test(page)) {
        errors.push({ line, reason: `頁碼「${toks[1]}」認不得` });
        continue;
      }

      const rest = toks.slice(2);
      if (rest.length % 2) {
        errors.push({ line, reason: '日期與結果要成對（最後一個日期沒跟結果）' });
        continue;
      }
      const history = [];
      let bad = null;
      for (let k = 0; k < rest.length; k += 2) {
        const d = impDate(rest[k], year, month);
        if (!d) { bad = `日期「${rest[k]}」認不得（M/D 或 MM-DD）`; break; }
        const r = IMP_RESULT[rest[k + 1].toLowerCase()];
        if (!r) { bad = `結果「${rest[k + 1]}」認不得（pass／過／o／v 或 A／B／C）`; break; }
        history.push({ date: d, result: r });
      }
      if (bad) { errors.push({ line, reason: bad }); continue; }
      history.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      if (seen.has(id)) {
        errors.push({ line, reason: `卡號 ${id} 在貼文內重複（第一次出現的留下）` });
        continue;
      }
      seen.add(id);
      const card = { id, subject, page,
                     createdAt: history.length ? history[0].date : todayISO,
                     history };
      (exist.has(id) ? conflicts : cards).push(card);
    }
    return { cards, errors, conflicts };
  }

  /* 失敗碼分布（檢討迴圈讀數：C 多＝熟練度、A/B 多＝判斷問題） */
  function failStats(cards) {
    const s = { A: 0, B: 0, C: 0 };
    for (const c of (cards || []))
      for (const r of (c && c.history || []))
        if (r && Object.prototype.hasOwnProperty.call(s, r.result)) s[r.result]++;
    return s;
  }

  const ReviewCore = { nextDue, dueCards, applyResult, failStats, parseImport };
  if (typeof module !== 'undefined' && module.exports) module.exports = ReviewCore;
  else global.ReviewCore = ReviewCore;
})(typeof window !== 'undefined' ? window : globalThis);
