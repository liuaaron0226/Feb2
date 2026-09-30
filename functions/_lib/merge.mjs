/* merge.mjs — serve_media.py 的 merge_progress() 逐行移植（T20 版本）
 *
 * 為什麼要「逐行」而不是「重寫一個等價的」：
 * 這個函式是跨裝置進度的唯一仲裁者，一條規則走樣就是使用者的備考紀錄被靜靜洗掉
 * （2026-09-01 實遇：取消勾選一秒後自己勾回去，就是聯集少了一條刪除規則）。
 * 家用媒體伺服器（Python）與雲端 Function（JS）在切換期間會同時存在，
 * 兩邊對同一組 payload 必須給出同一個答案，否則同步一來一回就會互相推翻。
 * 因此本檔的目標不是「寫得像 JS」，是「跑得像那支 Python」。
 * tests/cloud-merge.test.js 用 Python 實際跑出來的黃金檔逐位元組驗這件事。
 *
 * 原文：C:\Users\User\Desktop\claude\istudy-private-backup\tools\serve_media.py
 *       merge_progress() 與其上方的 T20 註解區塊。
 *
 * ── 移植時必須自己補上的 Python 語意（JS 不會自動幫你做的事）──────────────
 * 1. 字串比較：Python 比 Unicode code point，JS 的 `<` 比 UTF-16 code unit。
 *    只有在補充平面字元（U+10000 以上）與 U+E000–U+FFFF 相比時會分歧，
 *    但「只有這種情況才會錯」的東西就是將來某天一定會錯的東西 → cmpStr()。
 * 2. 型別不可比就炸：Python 的 `min("a", 7)` 丟 TypeError，JS 會安靜回一個
 *    看起來很合理的錯答案。錯答案比 500 更難查 → pyLt() 保留這個爆炸。
 * 3. int()：Python 的 int("3.7") 是 ValueError 不是 3；int(3.9) 是 3 不是 4。
 *    miss 欄位的 try/except 分支完全靠這個差異決定要不要退回舊行為 → pyInt()。
 * 4. dict 的鍵順序就是輸出順序，且 update() 不會把既有鍵搬到最後面。
 *    JS 物件在「字串鍵」上有同樣保證，所以 {...a} 與 a[k]=v 可以直接對應。
 *    唯一的例外是整數樣式的鍵（"1"、"2"）會被 JS 排到最前面——本專案的鍵是
 *    章 id／影片代號／校系組／網址，沒有純數字鍵，測試也守著這條。
 */

/* ---------- Python 語意層 ---------- */

/** Python 的字串比較：逐 code point。回 -1 / 0 / 1。 */
export function cmpStr(a, b) {
  if (a === b) return 0;
  const A = Array.from(a);
  const B = Array.from(b);
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const x = A[i].codePointAt(0);
    const y = B[i].codePointAt(0);
    if (x !== y) return x < y ? -1 : 1;
  }
  if (A.length === B.length) return 0;
  return A.length < B.length ? -1 : 1;
}

/** Python 的 str()：None→'None'、True→'True'、False→'False'，其餘照 JS。 */
export function pyStr(v) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  return String(v);
}

/** Python 的 `<`：字串比字串、數字比數字；混型別丟 TypeError（刻意保留）。 */
export function pyLt(x, y) {
  const sx = typeof x === 'string';
  const sy = typeof y === 'string';
  if (sx && sy) return cmpStr(x, y) < 0;
  if (!sx && !sy) return x < y;
  throw new TypeError(
    `'<' not supported between instances of '${sx ? 'str' : typeof x}' and '${sy ? 'str' : typeof y}'`);
}

/** Python 的 min(x, y)：y < x 才換人，否則留 x（相等時留左邊）。 */
export function pyMin(x, y) {
  return pyLt(y, x) ? y : x;
}

/** Python 的 int()：不能轉就丟，交給呼叫端的 try/except 決定退路。 */
export function pyInt(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new TypeError('cannot convert non-finite float to integer');
    return Math.trunc(v);
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!/^[+-]?\d+$/.test(s)) throw new Error(`invalid literal for int(): ${JSON.stringify(v)}`);
    return parseInt(s, 10);
  }
  throw new TypeError(`int() argument must be a string or a number, not '${v === null ? 'NoneType' : typeof v}'`);
}

/** dict 判定：Python 的 isinstance(x, dict)。陣列與 null 都不是 dict。 */
export function isDict(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Python 的 d.get(k, default)：鍵不存在才給 default（值是 null 就回 null）。 */
function getd(d, k, dflt) {
  return (isDict(d) && Object.prototype.hasOwnProperty.call(d, k)) ? d[k] : dflt;
}

/** Python 的 dict(x or {})：拿一份淺拷貝；不是 dict 或 falsy 就給空的。 */
function asDict(v) {
  return isDict(v) ? { ...v } : {};
}

/** Python 的 list(x or [])。 */
function asList(v) {
  return Array.isArray(v) ? v.slice() : [];
}

/** Python 的 `x or y`（只處理本檔用得到的 dict／None）。 */
function dictTruthy(v) {
  return isDict(v) && Object.keys(v).length > 0;
}

/* ---------- T20 編輯時戳 ---------- */

export const EDIT_KEEP_DAYS = 90;
/* 只認長得像 ISO 8601 的戳：亂字串（例如 "zzz"）在字串比較裡會贏過任何數字，
   一個壞掉的裝置就能靠它永遠壓過別人。與 Python 的 EDIT_TS_RE 同一條。 */
const EDIT_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** 取出一側的時戳表；壞資料一律當作沒有（退回聯集至少不會弄丟東西）。 */
export function editsOf(d) {
  const e = getd(d, 'edits', undefined);
  if (!isDict(e)) return {};
  const out = {};
  for (const [k, v] of Object.entries(e)) {
    if (typeof v === 'string' && EDIT_TS_RE.test(v)) out[pyStr(k)] = v;
  }
  return out;
}

/** 哪一側的時戳較新：'a' / 'b' / null。null＝沒有新資訊，交回舊規則。 */
function editOwner(sa, sb) {
  const A = sa === undefined ? null : sa;
  const B = sb === undefined ? null : sb;
  if (A === null && B === null) return null;
  if (A === null) return 'b';
  if (B === null) return 'a';
  const c = cmpStr(B, A);
  if (c > 0) return 'b';
  if (c < 0) return 'a';
  return null;
}

/** a 的鍵照 a 的順序在前、b 獨有的鍵照 b 的順序附後（沒有刪除時輸出與舊寫法同序）。 */
function mergedKeys(am, bm) {
  const out = Object.keys(am);
  for (const k of Object.keys(bm)) if (!(k in am)) out.push(k);
  return out;
}

/** 90 天前的切點，格式與 Python 的 time.strftime("%Y-%m-%dT%H:%M:%S", gmtime(...)) 一致。 */
export function editCutoff(nowMs) {
  return new Date(nowMs - EDIT_KEEP_DAYS * 86400000).toISOString().slice(0, 19);
}

/* ---------- 合併本體 ---------- */

const SCALAR_EXCLUDE = new Set(['watched', 'done', 'miss', 'playpos', 'target', 'review', 'edits']);

/**
 * 合併兩台裝置的進度。a＝伺服器現況，b＝這次上傳的 payload。
 *
 *   watched / done  {代號: 日期}      有戳的鍵由新戳那側決定在不在（含刪除）；
 *                                      沒戳照舊取聯集。兩側都在時日期留較早的
 *   miss            {章節: 錯題次數}  有戳＝新戳那側的值說了算（下修、歸零都傳得出去）；
 *                                      沒戳＝照舊取較大值
 *   playpos         {網址: {t,pct,at}} 留 at 較新的那筆；同日則留看得比較遠的
 *   target          [校系...]          有戳＝新戳那側決定在不在；沒戳＝取聯集
 *   edits           {"欄位:鍵": ISO}   逐鍵取較新的一方，寫入時汰除 90 天前的戳
 *   review          {cards:[...]}      卡按 id 聯集；history 按 (date,result) 聯集去重；
 *                                      createdAt 留最早；subject/page 留 updated 較新那側
 *   其餘純量                            留 updated 較新的那邊
 *
 * 相容鐵則（T07 立、T20 沿用）：任一側沒有 review／edits 鍵時，輸出與加那條規則
 * 之前逐位元組相同——舊裝置照常同步，回包也不會多長出鍵來。
 *
 * @param {object} a 伺服器側文件
 * @param {object} b 客戶端 payload
 * @param {{now?: number}} [opts] now＝汰除時戳用的「現在」（毫秒），測試可注入
 */
export function mergeProgress(a, b, opts = {}) {
  const now = opts.now === undefined ? Date.now() : opts.now;
  const ea = editsOf(a);
  const eb = editsOf(b);
  const hasEdits = isDict(getd(a, 'edits', undefined)) || isDict(getd(b, 'edits', undefined));
  const out = { ...a };

  /* ---- watched / done ---- */
  for (const key of ['watched', 'done']) {
    const am = asDict(getd(a, key, undefined));
    const bm = asDict(getd(b, key, undefined));
    const m = {};
    for (const k of mergedKeys(am, bm)) {
      const own = editOwner(ea[key + ':' + k], eb[key + ':' + k]);
      if (own === 'a' && !(k in am)) continue;   // a 側較新且已刪 → 刪除勝，聯集不得復活
      if (own === 'b' && !(k in bm)) continue;
      if (k in am && k in bm) {
        const v = bm[k];
        m[k] = (typeof v === 'string') ? pyMin(am[k], v) : am[k];
      } else {
        m[k] = (k in am) ? am[k] : bm[k];
      }
    }
    out[key] = m;
  }

  /* ---- miss ---- */
  {
    const am = asDict(getd(a, 'miss', undefined));
    const bm = asDict(getd(b, 'miss', undefined));
    const m = {};
    for (const k of mergedKeys(am, bm)) {
      const own = editOwner(ea['miss:' + k], eb['miss:' + k]);
      if (own !== null) {
        const src = own === 'a' ? am : bm;
        if (k in src) m[k] = src[k];   // 新戳那側說了算：5 改成 3 就是 3，0 就是刪掉
        continue;
      }
      if (k in bm) {                   // 沒戳＝舊行為：取較大值
        try {
          m[k] = Math.max(pyInt(k in am ? am[k] : 0), pyInt(bm[k]));
        } catch {
          m[k] = bm[k];
        }
      } else {
        m[k] = am[k];
      }
    }
    out.miss = m;
  }

  /* ---- playpos ---- */
  {
    const m = asDict(getd(a, 'playpos', undefined));
    for (const [k, v] of Object.entries(asDict(getd(b, 'playpos', undefined)))) {
      const old = m[k];
      if (!isDict(old) || !isDict(v)) { m[k] = v; continue; }
      const ao = pyStr(getd(old, 'at', ''));
      const bo = pyStr(getd(v, 'at', ''));
      const bp = v.pct || 0;
      const ap = old.pct || 0;
      if (cmpStr(bo, ao) > 0 || (bo === ao && pyLt(ap, bp))) m[k] = v;
    }
    out.playpos = m;
  }

  /* ---- target ---- */
  {
    const ta = new Set(asList(getd(a, 'target', undefined)));
    const tb = new Set(asList(getd(b, 'target', undefined)));
    const keep = [];
    for (const k of new Set([...ta, ...tb])) {
      const own = editOwner(ea['target:' + pyStr(k)], eb['target:' + pyStr(k)]);
      if (own === 'a' && !ta.has(k)) continue;
      if (own === 'b' && !tb.has(k)) continue;
      keep.push(k);                    // 沒戳／同戳＝舊行為：聯集
    }
    keep.sort((x, y) => (pyLt(x, y) ? -1 : (pyLt(y, x) ? 1 : 0)));
    out.target = keep;
  }

  /* ---- review（T07）：不能走下面的整包 last-writer-wins，會互洗跨裝置紀錄 ---- */
  {
    const ra = isDict(getd(a, 'review', undefined)) ? a.review : null;
    const rb = isDict(getd(b, 'review', undefined)) ? b.review : null;
    if (ra !== null || rb !== null) {
      const bNewer = cmpStr(pyStr(getd(b, 'updated', '')), pyStr(getd(a, 'updated', ''))) > 0;

      const cards = (r) => {
        const cs = getd(r || {}, 'cards', undefined);
        return Array.isArray(cs) ? cs.filter((c) => isDict(c) && c.id) : [];
      };

      const mergeCard = (ca, cb) => {
        /* 聯集去重鍵＝(date,result)；照日期排回時間序——排程核心以「尾端連續 pass」
           推梯級，順序就是語意。同日 pass 與失敗碼並存時失敗碼排後面：
           寧可重設多複習一次。 */
        const seen = new Set();
        const hist = [];
        for (const rec of [...asList(getd(ca, 'history', undefined)),
                           ...asList(getd(cb, 'history', undefined))]) {
          if (!isDict(rec)) continue;
          const d = pyStr(getd(rec, 'date', ''));
          const r = pyStr(getd(rec, 'result', ''));
          const key = d + '\u0000' + r;
          if (seen.has(key)) continue;
          seen.add(key);
          hist.push({ date: d, result: r });
        }
        hist.sort((x, y) =>
          cmpStr(x.date, y.date)
          || ((x.result === 'pass' ? 0 : 1) - (y.result === 'pass' ? 0 : 1))
          || cmpStr(x.result, y.result));
        const newer = bNewer ? cb : ca;
        const older = bNewer ? ca : cb;
        const merged = { ...older, ...newer };   // subject / page 留 updated 較新那側
        const created = [ca, cb].filter((c) => c.createdAt)
          .map((c) => pyStr(c.createdAt || ''))
          .sort((x, y) => cmpStr(x, y));
        if (created.length) merged.createdAt = created[0];   // 留最早
        merged.history = hist;
        return merged;
      };

      const byId = {};
      const order = [];                 // 卡按 id 聯集；a 側順序在前、b 側新卡附後
      for (const c of [...cards(ra), ...cards(rb)]) {
        const cid = pyStr(c.id);
        if (cid in byId) byId[cid] = mergeCard(byId[cid], c);
        else { byId[cid] = c; order.push(cid); }
      }
      const primary = bNewer ? rb : ra;
      const fallback = ra !== null ? ra : rb;
      const shellSrc = dictTruthy(primary) ? primary : (dictTruthy(fallback) ? fallback : {});
      const shell = { ...shellSrc };
      shell.cards = order.map((cid) => byId[cid]);
      out.review = shell;
    }
    /* 兩側都沒有 review 鍵 → 不產生它：舊 payload 行為一絲不變 */
  }

  /* ---- edits（T20）：逐鍵取較新的一方，寫入時順手汰除 90 天前的戳 ---- */
  if (hasEdits) {
    const em = { ...ea };
    for (const [k, v] of Object.entries(eb)) {
      if (!(k in em) || cmpStr(v, em[k]) > 0) em[k] = v;
    }
    const cut = editCutoff(now);
    const kept = {};
    for (const [k, v] of Object.entries(em)) if (cmpStr(v, cut) >= 0) kept[k] = v;
    out.edits = kept;
  }

  /* ---- 其餘純量 ---- */
  if (cmpStr(pyStr(getd(b, 'updated', '')), pyStr(getd(a, 'updated', ''))) > 0) {
    for (const [k, v] of Object.entries(b)) if (!SCALAR_EXCLUDE.has(k)) out[k] = v;
  } else {
    for (const [k, v] of Object.entries(b)) if (!(k in out) && k !== 'edits') out[k] = v;
  }
  return out;
}
