/* build-dist.mjs — 把 site/ 與 data/ 組成一個可以直接 `wrangler pages deploy` 的 dist/。
 *
 * ── 為什麼會有這支腳本（Phase E）────────────────────────────────────────────
 * 本來教材住在 R2，由 /api/data/** 那支 Function 代取。使用者裁定**完全不開通 R2**
 * （零計費面），於是教材改成隨部署上傳的 Pages 靜態資產。實測支撐這個決定：
 *
 *     292 個檔案／167.9 MB，單檔最大 15.1 MiB
 *     Pages 免費方案：20,000 檔／單檔 25 MiB
 *     （官方 pages/platform/limits/：「up to 20,000 files on the Free plan」、
 *       「The maximum file size for a single Cloudflare Pages site asset is 25 MiB」）
 *
 * 零建置這條原則沒有破：這裡沒有編譯、沒有打包、沒有 npm install，
 * 只是 node 內建 fs 的一次複製。dist/ 是**衍生物**，進 .gitignore，刪掉再跑一次就有。
 *
 * ── 這支腳本就是白名單本身 ─────────────────────────────────────────────────
 * 舊架構的安全性靠執行期字串比對（functions/_lib/data-path.mjs 的 keyFromPath）：
 * 桶子裡什麼都有，靠 Function 決定放不放行。靜態資產沒有這一層——
 * **在部署裡就拿得到，不在就永遠是 404**。所以「哪些檔案上得了雲」這個問題
 * 從執行期搬到建置期，答案就寫在下面的 ALLOW，而且效力更強：
 * 路徑穿越、大小寫變體、%2e%2e 這些都不必再擋，因為那些檔案根本不在部署裡。
 *
 * ── 兩條硬拒絕（不是警告，是中止）──────────────────────────────────────────
 * 1. 單檔 > 25 MiB：Pages 上限，硬闖只會在上傳到一半時失敗，不如現在就停。
 * 2. 任何影片副檔名：86GB 課程影片是補習班教材，**永不上雲**（CONTEXT.md 鐵則）。
 *    ALLOW 本來就放不進影片，這條是第二道保險——哪天有人手滑把 .mp4 放進
 *    data/exams/，白名單擋得住，但如果將來有人放寬白名單，這條還在。
 *
 * 用法：
 *   node scripts/cloud/build-dist.mjs            # 組出 dist/
 *   node scripts/cloud/build-dist.mjs --dry-run  # 只盤點，不寫任何東西
 */

import { readdirSync, statSync, lstatSync, mkdirSync, copyFileSync, rmSync, writeFileSync,
         readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SITE = join(ROOT, 'site');
const DATA = join(ROOT, 'data');
const DIST = join(ROOT, 'dist');

const MAX_BYTES = 25 * 1024 * 1024;                   // Pages 單檔上限，25 MiB
const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|avi|webm|wmv|flv|ts|mpg|mpeg|m2ts)$/i;

/* data/ 底下上得了雲的形狀。prefix=null＝data/ 第一層的檔案；
   depth＝含檔名在內的最大段數。這份表與 05-media.js 的 dataURL() 是一組：
   那裡送得出去的路徑，這裡必須收得進部署。 */
const ALLOW = [
  { prefix: null, exts: ['.json'], depth: 1 },                // schools/exam-index/sprint/videos/notebooks
  { prefix: 'analysis', exts: ['.json', '.txt'], depth: 2 },  // NotebookLM 章節熱度＋提示詞
  { prefix: 'nblm', exts: ['.json'], depth: 2 },              // 筆記迴流快照
  { prefix: 'exams', exts: ['.pdf'], depth: 5 },              // exams/<校>/<科目>/<年度>.pdf
  { prefix: 'brochures', exts: ['.pdf', '.txt'], depth: 3 },  // 招生簡章
];

/* 作業系統與編輯器的殘渣，不是內容。Pages 自己也會濾掉一部分，
   但濾在這裡才數得準——報表上的檔案數必須就是部署裡的檔案數。 */
const JUNK = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.gitkeep']);

const dryRun = process.argv.includes('--dry-run');

/** 遞迴列出一棵樹底下的檔案（相對路徑，POSIX 斜線）。
    不跟 symlink／junction 走：media/ 是指向外接硬碟的 junction，
    跟過去會把 86GB 影片拉進部署。 */
function walk(root, rel = '') {
  const out = [];
  const here = rel ? join(root, rel) : root;
  for (const e of readdirSync(here, { withFileTypes: true })) {
    const childRel = rel ? rel + '/' + e.name : e.name;
    if (JUNK.has(e.name)) continue;
    const abs = join(root, childRel);
    if (lstatSync(abs).isSymbolicLink()) {
      throw new Error(`拒絕跟隨連結：${abs}（junction／symlink 可能指向外接硬碟的影片）`);
    }
    if (e.isDirectory()) out.push(...walk(root, childRel));
    else if (e.isFile()) out.push(childRel);
  }
  return out;
}

/** data/ 底下這個相對路徑上不上得了雲。回 null＝不在白名單。 */
function allowed(relPath) {
  const segs = relPath.split('/');
  const name = segs[segs.length - 1];
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;                    // 沒有副檔名，或 .env 這種隱藏檔
  const ext = name.slice(dot).toLowerCase();
  const rule = ALLOW.find((r) => (r.prefix === null ? segs.length === 1 : segs[0] === r.prefix));
  if (!rule) return null;
  if (segs.length > rule.depth) return null;
  if (!rule.exts.includes(ext)) return null;
  return ext;
}

const mib = (n) => (n / 1048576).toFixed(1) + ' MiB';
const pad = (n, w = 5) => String(n).padStart(w);

/* ── 盤點 ──────────────────────────────────────────────────────────────────── */
const plan = [];        // {from, to, size}
const skipped = [];     // {rel, why}
const refused = [];     // 硬拒絕：中止建置的理由

function consider(srcRoot, relPath, destRel) {
  const abs = join(srcRoot, relPath);
  const size = statSync(abs).size;
  if (VIDEO_EXT.test(relPath)) {
    refused.push(`影片永不上雲：${destRel}`);
    return;
  }
  if (size > MAX_BYTES) {
    refused.push(`超過 Pages 單檔上限 25 MiB（${mib(size)}）：${destRel}`);
    return;
  }
  plan.push({ from: abs, to: destRel, size });
}

for (const rel of walk(SITE)) consider(SITE, rel, rel);

const byBucket = new Map();
for (const rel of walk(DATA)) {
  if (!allowed(rel)) { skipped.push({ rel, why: '不在 ALLOW 白名單' }); continue; }
  consider(DATA, rel, 'data/' + rel);
  const bucket = rel.includes('/') ? rel.split('/')[0] + '/**' : 'data/*.json';
  byBucket.set(bucket, (byBucket.get(bucket) || 0) + 1);
}

if (refused.length) {
  console.error('建置中止——以下檔案不可上雲：');
  for (const r of refused) console.error('  ✗ ' + r);
  process.exit(1);
}

/* ── 寫出 ──────────────────────────────────────────────────────────────────── */
/* _routes.json：把「每一個請求都先跑 Functions」寫死，不靠 Pages 的預設值。
   這是整個安全模型的地基——functions/_middleware.js 守全站的前提是它真的
   被叫到。include 全站、exclude 空，沒有任何路徑繞得過驗章。 */
const ROUTES = {
  version: 1,
  include: ['/*'],
  exclude: [],
};

/* ── 側車檔（字幕／思考地圖／板書快照）當靜態教材部署 ─────────────────────
   2026-09-04 使用者判例。原本它們跟影片一樣走 Google Drive、要權杖才讀得到；
   權杖一小時過期、iPad 又擋靜默續期，於是每小時思考地圖就「讀不到」一次。
   「影片永不進 Cloudflare」是為 67 GB 的影片訂的鐵則，不是為 0.9 MB 的筆記——
   這些是文字與縮圖，跟 data/ 底下其他教材一模一樣，該走同一條路：
   靜態、免權杖、SW 的 DATA 快取網路優先。
   來源以帳本為準（同一份 drive-map.json）：鍵 <代號><副檔名> 正是播放器查表用的字串，
   直接當成 data/sidecars/ 底下的檔名，driveSidecar() 那側就零轉換。
   硬碟沒插時整段安靜跳過並報數，不讓部署失敗——影片帳本照舊上得去。 */
{
  const MEDIA = join(ROOT, 'media');
  let led = null;
  try { led = JSON.parse(readFileSync(join(DATA, 'drive-map.json'), 'utf8')); } catch { led = null; }
  const files = (led && led.files) || {};
  let n = 0, missing = 0;
  for (const [key, f] of Object.entries(files)) {
    if (!/\.(vtt|json|jpe?g)$/i.test(key)) continue;           // 只收側車檔；影片鍵沒有副檔名
    if (!f || !f.series || !f.name) { missing++; continue; }
    const rel = join(String(f.series).split('/').join(sep), f.name);
    try { statSync(join(MEDIA, rel)); } catch { missing++; continue; }
    consider(MEDIA, rel, 'data/sidecars/' + key);
    n++;
  }
  console.log(`  側車檔           ${pad(n)} 檔 → data/sidecars/`
    + (missing ? `（${missing} 檔本機找不到，跳過——硬碟沒插？）` : ''));
}

if (!dryRun) {
  rmSync(DIST, { recursive: true, force: true });     // 冪等：每次都從乾淨的 dist/ 重來
  for (const f of plan) {
    const dest = join(DIST, f.to.split('/').join(sep));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(f.from, dest);
  }
  writeFileSync(join(DIST, '_routes.json'), JSON.stringify(ROUTES, null, 2) + '\n', 'utf8');
  stampShellHash();
  buildMapsPage();
}

/* 把 dist/sw.js 的 SHELL_HASH 換成「殼層實際內容」的雜湊。

   為什麼這一步不能省（2026-09-03 事故）：改了 JS/CSS、部署成功、grep 線上檔案
   也確認有新字串——但使用者裝置的畫面完全沒變。因為 sw.js 本身位元組沒動，
   瀏覽器就不認為有新 SW，於是繼續從 feb-v50-shell 發舊檔；而舊 index.html 沒有
   載入 14-drive.js，連 Drive 播放整個功能都消失，所有影片退回「跳去 YouTube」。
   靠「部署時記得手動跳 VER」是紀律，紀律會忘；讓快取名跟著內容跑就不會忘。

   雜湊只算殼層（sw.js 自己除外，否則自我參照）。教材 data/** 不算進去：
   它們走的是另一個不帶版號的快取（DATA），本來就不該因為換了一版 JS 被砍掉。 */
function stampShellHash() {
  const swPath = join(DIST, 'sw.js');
  let sw;
  try { sw = readFileSync(swPath, 'utf8'); }
  catch { throw new Error('dist/sw.js 不存在，殼層快取無法失效，部署中止'); }

  const h = createHash('sha256');
  const shell = plan.filter((x) => x.to !== 'sw.js' && !x.to.startsWith('data/'))
                    .sort((a, b) => a.to.localeCompare(b.to));
  for (const f of shell) {
    h.update(f.to);                    // 檔名也算：改名／新增檔案同樣該讓快取失效
    h.update(readFileSync(f.from));
  }
  const hash = h.digest('hex').slice(0, 12);

  const marker = "const SHELL_HASH = 'dev';";
  if (!sw.includes(marker)) {
    // 硬失敗而不是警告：戳不進去就等於整條防線不存在，而它的症狀是
    // 「畫面靜靜地不更新」——最難察覺的壞法，寧可現在就讓部署停下來。
    throw new Error('sw.js 找不到 SHELL_HASH 佔位（應為 ' + marker + '）'
                    + '——殼層快取將不會失效，部署中止');
  }
  writeFileSync(swPath, sw.replace(marker, "const SHELL_HASH = '" + hash + "';"), 'utf8');
  console.log('  殼層雜湊        ' + hash + '（' + shell.length
              + ' 個殼層檔案；任何一個變動都會讓舊快取失效）');
}

/* ── /maps/：所有思考地圖收成一頁 ──────────────────────────────────────────
   2026-09-08 使用者要一個「手機打得開、不必連家裡電腦、可以加到主畫面」的
   永久網址。掛在本專案底下最省事：functions/_middleware.js 守全站，這頁
   不必自己設防就已經在通行碼後面。

   資料直接讀 media/ 樹，**不走 data/drive-map.json 帳本**。帳本只認上過
   Drive 的檔，09-06/07 新產的 36 份還不在裡面（使用者暫緩了 17.6 GiB 的
   Drive 補傳），靠帳本會少一截；而這頁只有文字，沒有走 Drive 的理由。

   產物是單一檔：版面與程式約 21 KB、資料約 0.7 MB，遠低於 Pages 的 25 MiB
   單檔上限。硬碟沒插就整段跳過並報數——與側車檔那段同一個原則，不讓部署失敗。 */
function buildMapsPage() {
  const MEDIA = join(ROOT, 'media');
  let tpl;
  try { tpl = readFileSync(join(HERE, 'maps-template.html'), 'utf8'); }
  catch { console.log('  思考地圖頁      跳過（找不到 maps-template.html）'); return; }

  /* 排除的是最上層的「講義」資料夾（PDF 講義，沒有思考地圖），只能比對第一段路徑。
     用 includes('講義') 會連檔名提到講義的課程一起濾掉——115暑電子01 與 114暑電子01
     的檔名裡有「(補充講義，未上面授課請先去官網下載)」，第一版就是這樣靜靜少了兩堂。 */
  let rels = [];
  try { rels = walk(MEDIA).filter((r) => r.endsWith('.notes.json') && !r.startsWith('講義/')); }
  catch { /* media/ 整棵樹讀不到 */ }
  if (!rels.length) {
    console.log('  思考地圖頁      跳過（media/ 找不到 .notes.json——硬碟沒插？）');
    return;
  }

  /* 課名以 state.json 為準（下載器寫的，最乾淨）；讀不到就退回檔名去掉代號 */
  const titleOf = {};
  try {
    const st = JSON.parse(readFileSync(join(MEDIA, 'state.json'), 'utf8'));
    for (const v of Object.values(st)) if (v && v.code) titleOf[v.code] = v.title || '';
  } catch { /* 沒有就用檔名 */ }

  const SUBJ = { 電子學: 0, 工數: 1, 線代: 2, 多益: 3 };
  const items = [];
  for (const rel of rels) {
    let d;
    try { d = JSON.parse(readFileSync(join(MEDIA, rel.split('/').join(sep)), 'utf8')); }
    catch { continue; }                 // 壞掉的單一檔案不該讓整個部署停下來
    const m = d.map || {};
    const seg = rel.split('/');
    const base = seg[seg.length - 1].replace(/\.notes\.json$/, '');
    const code = d.code || base;
    items.push({
      code,
      title: titleOf[code] || base.replace(code, '').trim(),
      subject: seg[0] || '',
      series: seg.length > 1 ? seg[1] : (seg[0] || ''),
      dur: Number(d.dur) || 0,
      chapters: (d.chapters || []).map((c) => ({ t: c.t || 0, title: c.title || '' })),
      tldr: (m.tldr || []).filter(Boolean),
      concepts: (m.concepts || []).filter((c) => c && c.mermaid)
        .map((c) => ({ name: c.name || '', mermaid: c.mermaid })),
      flow: m.flow || '',
      examples: (m.examples || []).map((e) => ({
        t: e.t || 0, tag: e.tag || '', trigger: e.trigger || '',
        md: e.md || '', trap: e.trap || '' })),
      playbook: (m.playbook || []).map((p) => ({ trigger: p.trigger || '', method: p.method || '' })),
      pitfalls: (m.pitfalls || []).map((p) => ({
        wrong: p.wrong || '', right: p.right || '', why: p.why || '' })),
    });
  }

  /* 代號裡的數字要當數字比，否則 115暑電子9 會排到 115暑電子10 後面 */
  const nums = (s) => (s.match(/\d+/g) || []).map(Number);
  const cmpCode = (a, b) => {
    const x = nums(a), y = nums(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] ?? -1) - (y[i] ?? -1);
      if (d) return d;
    }
    return a.localeCompare(b);
  };
  items.sort((a, b) => (SUBJ[a.subject] ?? 9) - (SUBJ[b.subject] ?? 9)
    || a.series.localeCompare(b.series) || cmpCode(a.code, b.code));

  /* 資料放進 <script type="application/json">。任何 "</script" 都會提早關掉標籤；
     JSON 允許 \u 逃脫，所以把 < 一律逃掉最省事，也不影響 JSON.parse。 */
  const json = JSON.stringify(items).replace(/</g, '\\u003c');
  const anchor = '<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/';
  if (!tpl.includes(anchor)) {
    throw new Error('maps-template.html 找不到 mermaid 錨點，思考地圖頁無處注入資料，部署中止');
  }
  const html = tpl.replace(anchor,
    '<script type="application/json" id="mapdata">' + json + '</script>\n' + anchor);

  const dest = join(DIST, 'maps', 'index.html');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html, 'utf8');
  const dia = items.reduce((n, x) => n + x.concepts.length, 0);
  console.log(`  思考地圖頁      ${pad(items.length)} 堂 → maps/index.html`
    + `（觀念圖 ${dia} 張，${mib(Buffer.byteLength(html))}）`);
}

/* ── 報表：數的是 dist/ 裡真的有的東西，不是計畫 ──────────────────────────── */
const verified = dryRun ? plan.map((f) => ({ to: f.to, size: f.size }))
  : walk(DIST).map((rel) => ({ to: rel, size: statSync(join(DIST, rel)).size }));

/* _routes.json 是給 Pages 讀的設定，**不會**被當成靜態資產送出去，
   所以它不算進「幾個檔案上雲」那個數字（官方 pages/functions/routing/）。
   報表分三欄而不是把它塞進殼層：數字要對得起它代表的東西。 */
const isConfig = (f) => f.to === '_routes.json';
const total = verified.reduce((s, f) => s + f.size, 0);
const dataFiles = verified.filter((f) => f.to.startsWith('data/'));
const siteFiles = verified.filter((f) => !f.to.startsWith('data/') && !isConfig(f));
const assets = siteFiles.length + dataFiles.length;
const biggest = verified.slice().sort((a, b) => b.size - a.size)[0];

console.log(dryRun ? '【--dry-run，沒有寫任何東西】' : `已組出 ${relative(ROOT, DIST) || 'dist'}/`);
console.log(`  殼層 site/**      ${pad(siteFiles.length)} 檔  ${mib(siteFiles.reduce((s, f) => s + f.size, 0))}`);
console.log(`  教材 data/**      ${pad(dataFiles.length)} 檔  ${mib(dataFiles.reduce((s, f) => s + f.size, 0))}`);
for (const [k, v] of [...byBucket].sort()) console.log(`       ${k.padEnd(14)} ${pad(v)} 檔`);
/* dry-run 時 _routes.json 還沒寫出來，所以它不在 total 裡——標籤跟著實際數字走，
   不要印一句對不上的話。 */
console.log(`  ── 靜態資產合計   ${pad(assets)} 檔  ${mib(total)}（${total} bytes${dryRun ? '，未含尚未寫出的 _routes.json' : '，含 _routes.json'}）`);
console.log(`  最大單檔          ${mib(biggest.size)}  ${biggest.to}`);
console.log(`  Pages 免費上限    20,000 檔／單檔 25 MiB → 用掉 ${(assets / 20000 * 100).toFixed(1)}%／${(biggest.size / MAX_BYTES * 100).toFixed(0)}%`);
if (skipped.length) {
  console.log(`  白名單外略過      ${pad(skipped.length)} 檔`);
  for (const s of skipped.slice(0, 20)) console.log(`       - ${s.rel}（${s.why}）`);
  if (skipped.length > 20) console.log(`       …還有 ${skipped.length - 20} 個`);
}
