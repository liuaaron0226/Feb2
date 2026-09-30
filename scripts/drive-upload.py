# -*- coding: utf-8 -*-
"""影片上雲管線：把 media/ 底下的 86GB 課程影片（101 支 .mp4）推上 Google Drive，
並留一份 data/drive-map.json 讓播放器／隨播面板知道「這一集在雲端的哪裡」。

**影片永不進 Cloudflare**（CONTEXT.md 鐵則，build-dist.mjs 有第二道保險擋副檔名）。
上雲指的是上 Google Drive 個人空間（5TB），Feb 只保存「集數代號 → Drive 檔案 id」
這張對照表，一個位元組的影片都不經過我們的伺服器。

前置：gws 已登入（`gws auth login`；`gws auth status` 看得到 has_refresh_token）
用法：python scripts/drive-upload.py [--only 電子] [--limit 5] [--dry-run] [--verify] [--yes]

家裡的上行是手機熱點，所以**一次一個課程資料夾**跑（--only），不要一次丟 86GB。
超過 5 GiB 的批次一律要 --yes 才動手，而且開跑前會先把總位元組數印出來。

設計上的三個「為什麼」：

1. **代號怎麼算**：`disk_key()` 是 site/js/07-disk.js `diskKey()` 的逐行移植，
   內含 05-media.js 的 `spNorm()`。不是「等價重寫」——帳本的鍵必須與播放器
   `openCompanion(code)` 拿去查表的鍵逐字元相同，差一個字就等於這一集沒上雲。
   （移植時把 JS 的 `\d`/`\D` 寫成 `[0-9]`/`[^0-9]`：Python 的 `\d` 認得全形數字，
   JS 的不認得，不寫死會在某些檔名上分岔。）

2. **為什麼不做 byte-level 續傳**：gws 0.22.5 只走 multipart
   （`gws drive files create --upload --dry-run` 回 `is_multipart_upload: true`，
   沒有 uploadType=resumable 的開關）。真正的分塊續傳要自己拿 OAuth access token
   去打 resumable endpoint——那等於把使用者的權杖抓在手上，不做。
   於是續傳的粒度是**一支影片**：帳本每上傳成功一支就落地一次，
   中斷後重跑會跳過已完成的，只有斷在半路的那一支要重來。

3. **為什麼要向 Drive 對帳而不是只信帳本**：帳本掉了就重傳 86GB 太貴。
   所以每個課程資料夾開跑前會先 list 一次雲端內容，同名同大小者直接認領進帳本。
   同名但大小不同＝上次斷在半路的殘檔，本腳本**不刪雲端檔案**（刪除一律交給使用者），
   只報 `尺寸不符` 並跳過。
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# 三個環境變數只為了「能在不碰真硬碟、不碰真帳本、不出網的情況下驗完整條路徑」。
# 正式跑一個都不必設；設了會在開頭印出來，不會靜靜改行為。
MEDIA = Path(os.environ.get("FEB_MEDIA") or ROOT / "media")      # junction → F:\istudy-backup
LEDGER = Path(os.environ.get("FEB_DRIVE_MAP") or ROOT / "data" / "drive-map.json")
LOGFILE = Path(os.environ.get("FEB_DRIVE_LOG") or ROOT / "reports" / "drive-upload.log")
LOCKFILE = Path(os.environ.get("FEB_DRIVE_LOCK") or ROOT / "reports" / ".upload.lock")
_LOCK_FH = None                               # 鎖的握把，必須活到行程結束

FOLDER_MIME = "application/vnd.google-apps.folder"
GIB = 1 << 30
SAFE_BATCH = 5 * GIB                         # 超過這個量要 --yes
DEFAULT_ROOT = "Feb 影片備份"

# ── 集數代號正規化（site/js/05-media.js spNorm ＋ 07-disk.js diskKey 的移植） ──
_PAREN = re.compile(r"\([^)]*\)")
_THE_END = re.compile(r"[-\s]*The\s*End\s*$", re.IGNORECASE)
_EXT = re.compile(r"\.[^.]+$")
# JS: /^(\d{3}[春暑秋冬題]?\D*?\d{1,2}[A-Za-z]?)(?=[\s　_<（(-]|$)/
_CODE = re.compile(r"^([0-9]{3}[春暑秋冬題]?[^0-9]*?[0-9]{1,2}[A-Za-z]?)(?=[\s\u3000_<（(\-]|$)")


def sp_norm(code):
    """去掉講師標記 (喻)(劉)，拔掉補習班加在最後一集的「-The End」尾綴。"""
    return _THE_END.sub("", _PAREN.sub("", code or "")).strip()


def disk_key(name):
    """檔名 → 集數代號。順序很重要：先拔括號再抓代號，反過來做
    「115春矩陣(喻)10」會在括號處斷掉，永遠對不上。"""
    base = _PAREN.sub("", _EXT.sub("", name))
    m = _CODE.match(base)
    return sp_norm(m.group(1) if m else re.split(r"[ \u3000]", base)[0])


# ── 顯示 ────────────────────────────────────────────────────────────────────
def dw(s):
    """中日韓字在終端機佔兩格，用它算真實寬度，表格才對得齊。"""
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in str(s))


def pad(s, n, right=False):
    s = str(s)
    fill = " " * max(0, n - dw(s))
    return (fill + s) if right else (s + fill)


def gib(n):
    return f"{n / GIB:.2f} GiB"


_LOG_FH = None


def say(msg=""):
    """一律同時進終端機與 reports/drive-upload.log——事後要查得出昨晚傳到哪。"""
    print(msg, flush=True)
    global _LOG_FH
    if _LOG_FH is None:
        LOGFILE.parent.mkdir(parents=True, exist_ok=True)
        _LOG_FH = LOGFILE.open("a", encoding="utf-8")
        _LOG_FH.write(f"\n===== {datetime.now().isoformat(timespec='seconds')} "
                      f"{' '.join(sys.argv[1:]) or '(無旗標)'} =====\n")
    _LOG_FH.write(f"{datetime.now().strftime('%H:%M:%S')} {msg}\n")
    _LOG_FH.flush()


# ── gws 外殼 ────────────────────────────────────────────────────────────────
def _gws_cmd():
    """FEB_GWS 可覆寫：JSON 陣列（如 ["python","stub_gws.py"]）或單一執行檔路徑。
    測試用的 stub 從這裡進來——正式跑不必設。"""
    raw = os.environ.get("FEB_GWS", "").strip()
    if raw.startswith("["):
        return list(json.loads(raw))
    if raw:
        return [raw]
    # Windows 上 gws 是 .CMD，CreateProcess 只補 .exe，要靠 which() 認 PATHEXT
    return [shutil.which("gws") or "gws"]


_CMD_META = re.compile(r"[&<>|^%!]")


def jarg(obj):
    """物件 → 可以安全當命令列參數傳給 gws 的 JSON 字串。

    2026-09-03 事故：`115暑微方(喻)23_黑板課程&堂數錯誤_ …mp4` 上傳必定失敗，
    錯誤是 `Invalid --json body: EOF while parsing a string at line 1 column 42`，
    而 stderr 裡藏著真凶——`'堂數錯誤_' 不是內部或外部命令`，那是 **cmd.exe** 的話。

    成因鏈：Windows 上 gws 是 .CMD 批次檔 ⇒ 執行它一定經過 cmd.exe ⇒ JSON 本體
    滿是 `"`，被 subprocess 依 C 執行期慣例跳脫成 `\\"`，但 **cmd 不認這種跳脫**，
    它只數引號、於是引號狀態錯亂 ⇒ 走到 `&` 時 cmd 認為自己在引號外，把它當成
    命令分隔符。其餘 22 支中文檔名都沒事，只有帶 `&` 的這支爆掉。

    對策：讓這個參數**一個 cmd 特殊字元都不含**。
      ensure_ascii=True   中文 → \\uXXXX（順帶免疫 ANSI 字碼頁那一類問題）
      再把 & < > | ^ % !  也換成 \\uXXXX —— 仍是合法 JSON，gws 端解回原字元。
    實測：修正前 exit 1、修正後 exit 0 且 gws 回讀出完整檔名。
    """
    return _CMD_META.sub(lambda m: "\\u%04x" % ord(m.group()),
                         json.dumps(obj, ensure_ascii=True))


def gws(*args, timeout=300, cwd=None):
    r = subprocess.run([*_gws_cmd(), *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout, cwd=cwd)
    return r.returncode, r.stdout, r.stderr


def gws_json(*args, timeout=300, cwd=None):
    code, out, err = gws(*args, timeout=timeout, cwd=cwd)
    if code != 0:
        raise RuntimeError(f"gws {' '.join(args[:3])} 失敗（exit {code}）：{(err or out).strip()[:300]}")
    # gws 把「Using keyring backend: …」印在 stderr，但不保證每版都是——一律從第一個 { 起算
    i = out.find("{")
    if i < 0:
        raise RuntimeError(f"gws {' '.join(args[:3])} 沒回 JSON：{out.strip()[:200]}")
    return json.loads(out[i:])


def q_esc(s):
    """Drive 查詢字串的跳脫。課程資料夾名沒有引號，但檔名有 (喻) 之類的東西，
    將來若有人在檔名裡放單引號，沒跳脫就會生出語法錯誤的 q。"""
    return str(s).replace("\\", "\\\\").replace("'", "\\'")


def drive_list(q, fields="files(id,name,size,md5Checksum)"):
    """一路翻頁翻到底。單一課程資料夾最多 27 個檔，但翻頁不寫就是將來的 bug。"""
    out, token = [], None
    while True:
        params = {"q": q, "fields": f"nextPageToken,{fields}", "pageSize": 200,
                  "spaces": "drive"}
        if token:
            params["pageToken"] = token
        r = gws_json("drive", "files", "list", "--params", jarg(params))
        out.extend(r.get("files", []))
        token = r.get("nextPageToken")
        if not token:
            return out


def drive_find_folder(name, parent):
    q = (f"mimeType='{FOLDER_MIME}' and name='{q_esc(name)}' "
         f"and '{q_esc(parent)}' in parents and trashed=false")
    return drive_list(q, fields="files(id,name)")


def drive_create_folder(name, parent):
    body = {"name": name, "mimeType": FOLDER_MIME, "parents": [parent]}
    return gws_json("drive", "files", "create",
                    "--json", jarg(body),
                    "--params", jarg({"fields": "id,name"}))


def drive_upload(path, name, parent, timeout, mime="video/mp4"):
    """--upload 只餵裸檔名、cwd 切到影片所在資料夾。

    gws 0.22.5 會把 --upload 的路徑解析成真實路徑再檢查「有沒有跑出工作目錄」。
    media/ 是指向 F:\istudy-backup 的 junction，絕對路徑一律會被判越界：
      error[validation]: --upload '…\media\多益\…mp4' resolves to '\\?\F:\istudy-backup\…'
      which is outside the current directory
    把 cwd 挪過去、只給檔名，檢查就落在同一棵樹裡。

    另外 `name` 必須明寫進 body：省略時 Drive 會把檔案存成「Untitled」
    （2026-09-02 的計時測試就是這樣留下一支無名 318MB 檔案）。"""
    body = {"name": name, "parents": [parent]}
    return gws_json("drive", "files", "create",
                    "--upload", Path(path).name,
                    "--upload-content-type", mime,
                    "--json", jarg(body),
                    "--params", jarg({"fields": "id,name,size,md5Checksum"}),
                    timeout=timeout, cwd=str(Path(path).parent))


# ── 帳本 ────────────────────────────────────────────────────────────────────
def load_ledger():
    if LEDGER.exists():
        try:
            d = json.loads(LEDGER.read_text(encoding="utf-8"))
        except Exception as e:
            raise SystemExit(f"drive-map.json 讀不動（{e}）。先把它移開再重跑，"
                             f"不要讓腳本猜——猜錯就是重傳 86GB。")
        d.setdefault("folder", "")
        d.setdefault("folders", {})
        d.setdefault("files", {})
        return d
    return {"folder": "", "updated": "", "folders": {}, "files": {}}


def save_ledger(led):
    """每成功一支就落地一次。先寫 .tmp 再 replace：熱點斷線／使用者 Ctrl-C
    都不會留下半份 JSON（那會讓下一次重跑從零開始）。"""
    led["updated"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    tmp = LEDGER.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(led, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, LEDGER)


# ── 掃描本機 ────────────────────────────────────────────────────────────────
SIDECAR_MIME = {".vtt": "text/vtt", ".notes.json": "application/json", ".jpg": "image/jpeg",
                ".fragidx.json": "application/json", ".frag.mp4": "video/mp4"}
_SNAP = re.compile(r"\.snap_([0-9]+)\.jpg$", re.IGNORECASE)
# .frag.mp4（MSE 用的 fragmented 重新封裝，remux-frag.py 產）跟原影片一樣大，
# 77 支合計 67 GB。預設**不**當側車檔上傳——否則每段思考地圖的自動推送會被它卡住一整天。
# 要傳它得明講 --with-frag；索引 .fragidx.json 只有幾十 KB，一律跟著走。
WITH_FRAG = False


def sidecars_of(mp4, code):
    """影片旁邊的側車檔 → [(路徑, 帳本鍵, MIME)]。

    帳本鍵**必須**是 `<代號><副檔名>`：那正是 14-drive.js 的 driveSidecar() 拿去
    查表的字串（`DRIVE.map.files[code + ext]`，ext 由 10-player.js 的 sidecarOf
    產生，形狀是 '.vtt'、'.notes.json'、`.snap_${t}.jpg`）。差一個字元就等於
    這一份旁掛檔在雲端不存在。
    """
    stem = mp4.name[:-4]                      # 去掉 .mp4
    out = []
    exts = [".vtt", ".notes.json", ".fragidx.json"] + ([".frag.mp4"] if WITH_FRAG else [])
    for ext in exts:
        f = mp4.with_name(stem + ext)
        if f.is_file():
            out.append((f, code + ext, SIDECAR_MIME[ext]))
    for f in mp4.parent.iterdir():
        if not f.is_file() or not f.name.startswith(stem):
            continue
        m = _SNAP.search(f.name)
        if m and f.name == stem + ".snap_" + m.group(1) + ".jpg":
            out.append((f, code + ".snap_" + m.group(1) + ".jpg", "image/jpeg"))
    return out


def scan(only=None):
    """走 media/ 樹，收 .mp4 與它們的側車檔（.vtt / .notes.json / .snap_*.jpg）。

    側車檔本來不上雲，理由是「Service Worker 早就離線快取了」。
    2026-09-04 推翻：那個假設只對「連過家裡媒體伺服器的裝置」成立。
    使用者的 iPad 只走雲端，快取裡什麼都沒有，於是雲端播放沒有字幕、
    沒有思考地圖、沒有段落分類——連兩欄版面都不會啟用，介面整個走樣。
    53.9 MB / 578 個檔，相對於 67 GB 的影片可以忽略，該傳。

    `.part.mp4` 是 grab_istudy.py 抓到一半的殘檔——注意副檔名就是 .mp4，
    2026-09-05 修正前這裡寫成「.mp4.part，天然被排除」是錯的：下載進行中
    跑上傳，殘檔會被當成正式集數傳上去；等它下載完成，同一個代號會有兩個
    檔，整批再被「代號撞號」擋下。下面明確跳過。
    """
    if not MEDIA.is_dir():
        raise SystemExit(f"找不到 {MEDIA}（media/ 是指向 F:\\istudy-backup 的 junction，"
                         f"外接硬碟沒插就會是這個症狀）")
    items = []
    for p in sorted(MEDIA.rglob("*")):
        if not p.is_file() or p.suffix.lower() != ".mp4":
            continue
        # .frag.mp4 是 remux-frag.py 產的 MSE 重新封裝，副檔名也是 .mp4 但**不是集數**：
        # 它是原影片的側車檔（sidecars_of 會撿），當影片掃進來會跟原檔撞同一個代號、
        # 整批被「代號撞號」擋下（2026-09-04 第一支 frag 產出後 dry-run 就 exit 3）。
        if p.name.lower().endswith(".frag.mp4"):
            continue
        # .part.mp4 是 grab_istudy.py 下載中的殘檔（副檔名確實是 .mp4，擋不掉的話
        # 會傳半支影片上雲；下載完成後又會跟正式檔撞同一個代號）。
        if p.name.lower().endswith(".part.mp4"):
            continue
        rel = p.relative_to(MEDIA)
        if len(rel.parts) < 2:
            continue                              # 課程資料夾一定是 <科目>/<期別>/檔案
        series = "/".join(rel.parts[:-1])         # 例：線代/115春矩陣
        if only and only not in series and only not in p.name:
            continue
        code = disk_key(p.name)
        items.append({"path": p, "name": p.name, "series": series,
                      "code": code, "key": code, "size": p.stat().st_size,
                      "mime": "video/mp4", "kind": "video"})
        # 側車檔緊跟在自己的影片後面：斷線重跑時，補完一支影片就順手補完它的旁掛檔
        for f, key, mime in sidecars_of(p, code):
            items.append({"path": f, "name": f.name, "series": series,
                          "code": code, "key": key, "size": f.stat().st_size,
                          "mime": mime, "kind": "sidecar"})
    return items


def crosscheck_state(items):
    """診斷：把檔名算出的代號，對一次媒體伺服器 state.json 的 spNorm(code)。

    兩邊本來就會有一處不合，而且**不合的是 state 那一側**：
    115暑微方 第 23 集補習班把註記塞進 code 欄位本身（`115暑微方23<黑板課程&堂數錯誤>`），
    spNorm 只拔括號不拔角括號，所以 05-media.js 的 LOCAL 用了一個
    課表（videos.json istudy.byChapter、me-map 的集數 chip）從來不會去查的鍵。
    帳本站在**播放器要問的那一側**——disk_key 的乾淨代號，101 支對得上 96 支課表項，
    差的 5 支是課表根本沒收錄，不是鍵對不上。
    這個檢查留著是為了將來檔名規則再變時會有人看到，不是為了現在修什麼。
    """
    f = MEDIA / "state.json"
    if not f.exists():
        return
    try:
        st = json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return
    # 只比對本次掃到的課程——--only 篩掉的那些不在 items 裡，全表對比會整片誤報
    series = {i["series"] for i in items}
    gold = {sp_norm(v.get("code", "")) for v in st.values()
            if v.get("status") == "done" and v.get("path")
            and str(v.get("series", "")).replace("\\", "/") in series}
    mine = {i["code"] for i in items if i.get("kind") != "sidecar"}
    odd = sorted(gold - mine)
    if odd:
        say(f"（診斷）state.json 有 {len(odd)} 個代號與檔名側不同，帳本以檔名側為準：{'、'.join(odd[:5])}")


# ── 同時只准一個實例 ────────────────────────────────────────────────────────
def acquire_lock():
    """整台機器同時只准一個上傳行程。

    2026-09-02 事故：整批上傳跑到第 7 支時，第二個佇列被啟動，兩邊同時上傳
    同一支影片——雙倍吃掉本來就不夠用的熱點上行，而且會在 Drive 留下兩份。
    帳本的「同名同大小就認領」也救不了：兩份同名同大小，認領誰都對不了。

    用作業系統的檔案鎖，不用 PID 檔：行程被強制結束（工作管理員、當機、斷電）
    時 OS 會自動釋放，永遠不會留下一把沒人拿的鎖擋住下一次正常執行。
    檔案握把刻意存進全域，讓它活到行程結束為止——被垃圾回收就等於鎖沒了。
    """
    global _LOCK_FH
    LOCKFILE.parent.mkdir(parents=True, exist_ok=True)
    _LOCK_FH = LOCKFILE.open("a+b")
    try:
        if sys.platform == "win32":
            import msvcrt
            msvcrt.locking(_LOCK_FH.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(_LOCK_FH.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        _LOCK_FH.close()
        _LOCK_FH = None
        return False
    return True


# ── 不讓機器睡著 ────────────────────────────────────────────────────────────
def keep_awake(on=True):
    """整批上傳要跑十幾個鐘頭，中途睡眠＝斷線重來。

    刻意**不改系統電源設定**（那是使用者的機器設定，改了不會自己還原）。
    這裡用 SetThreadExecutionState 送出「我正在忙」的請求——影片播放器用的同一招：
    只在本行程存活期間有效，行程一結束（含當掉、Ctrl-C）就自動失效。
    ES_DISPLAY_REQUIRED 不加：螢幕該關就讓它關，只要系統別睡。
    """
    if sys.platform != "win32":
        return False
    try:
        import ctypes
        ES_CONTINUOUS, ES_SYSTEM_REQUIRED, ES_AWAYMODE_REQUIRED = 0x80000000, 0x00000001, 0x00000040
        flags = (ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED) if on else ES_CONTINUOUS
        return bool(ctypes.windll.kernel32.SetThreadExecutionState(flags))
    except Exception:
        return False


# ── 主流程 ──────────────────────────────────────────────────────────────────
def ensure_root(led, name, create):
    """Drive 上的根資料夾。`create=False` 時只找不建（盤點階段一律唯讀）。"""
    if led["folder"] and not led["folder"].startswith("("):
        return led["folder"]
    hit = drive_find_folder(name, "root")
    if hit:
        led["folder"] = hit[0]["id"]
        say(f"沿用 Drive 既有根資料夾「{name}」→ {led['folder']}")
    elif create:
        led["folder"] = drive_create_folder(name, "root")["id"]
        say(f"＋ 建立根資料夾「{name}」→ {led['folder']}")
        save_ledger(led)
    else:
        led["folder"] = "(待建立:根)"
        say(f"根資料夾「{name}」尚不存在（本階段唯讀，不建立）")
    return led["folder"]


def ensure_chain(parts, led, create):
    """<根>/<科目>/<期別> 逐層確保存在，結果記進帳本的 folders，下次不必再 list。

    `create=False`＝盤點階段：只查不建，查不到就回一個 `(待建立:…)` 佔位 id。
    **安全閘門（總位元組數、--yes）要在任何寫入之前跑完**，所以資料夾一律等到
    真的要上傳那一刻才建——不然「--dry-run 沒說要建」與「被閘門擋下來卻已經建了」
    這兩件事會同時發生（本腳本第一次實跑就踩到了，留這段字當紀錄）。
    """
    parent = led["folder"]
    acc = []
    for seg in parts:
        acc.append(seg)
        key = "/".join(acc)
        fid = led["folders"].get(key)
        if fid and not fid.startswith("("):
            parent = fid
            continue
        hit = drive_find_folder(seg, parent) if parent and not parent.startswith("(") else []
        if hit:
            if len(hit) > 1:
                say(f"  ⚠ Drive 上有 {len(hit)} 個同名資料夾「{key}」，採用第一個 {hit[0]['id']}")
            fid = hit[0]["id"]
        elif create:
            fid = drive_create_folder(seg, parent)["id"]
            say(f"  ＋ 建立資料夾 {key} → {fid}")
        else:
            parent = f"(待建立:{key})"
            continue                      # 佔位 id 不寫進帳本，免得下次被當成真的
        led["folders"][key] = fid
        if create:
            save_ledger(led)
        parent = fid
    return parent


def main():
    ap = argparse.ArgumentParser(
        description="把課程影片推上 Google Drive，並維護 data/drive-map.json")
    ap.add_argument("--only", metavar="子字串", help="只處理課程路徑含這段字的（如 電子、115春矩陣）")
    ap.add_argument("--skip-code", default="", metavar="代號,代號",
                    help="跳過這些集數代號（逗號分隔）。用來排除已看完的集數——"
                         "上行是手機熱點，看過的沒必要占頻寬")
    ap.add_argument("--with-frag", action="store_true",
                    help="連 .frag.mp4（MSE 用的 fragmented 重新封裝，跟原影片一樣大）一起上傳。"
                         "預設不傳：67 GB 會把每段思考地圖的自動推送卡住一整天，要傳請明講")
    ap.add_argument("--skip-file", metavar="路徑",
                    help="從 UTF-8 檔案讀跳過名單（一行一個代號，# 開頭是註解）。"
                         "代號含中文時**一律用這個**：命令列參數會被 Windows 的 ANSI "
                         "字碼頁攔一手，實測 115暑電子01 傳到腳本手上變成 115´»¹q¤l01，"
                         "於是一支都沒跳過、已看完的照傳（2026-09-02 踩過）")
    ap.add_argument("--limit", type=int, default=0, metavar="N", help="本次最多上傳幾支（0＝不限）")
    ap.add_argument("--dry-run", action="store_true", help="只盤點，一個位元組都不送、也不建資料夾")
    ap.add_argument("--verify", action="store_true", help="只對帳雲端大小，不上傳")
    ap.add_argument("--yes", action="store_true", help=f"確認送出超過 {gib(SAFE_BATCH)} 的批次")
    ap.add_argument("--root", default=DEFAULT_ROOT, metavar="名稱", help=f"Drive 上的根資料夾（預設「{DEFAULT_ROOT}」）")
    ap.add_argument("--retries", type=int, default=2, metavar="N", help="單支影片的重試次數（預設 2）")
    ap.add_argument("--min-kbps", type=int, default=200, metavar="K",
                    help="逾時的保守下限速度，用來換算單支的 timeout（預設 200 KB/s）")
    a = ap.parse_args()
    global WITH_FRAG
    WITH_FRAG = bool(a.with_frag)

    if not (a.dry_run or a.verify) and not acquire_lock():
        print("✗ 已經有另一個上傳行程在跑了（鎖：%s）。" % LOCKFILE, flush=True)
        print("  同時跑兩個會雙倍吃掉熱點上行，還會在 Drive 留下兩份同名檔案。", flush=True)
        print("  要看進度：tail -f reports/drive-upload.log", flush=True)
        return 7

    say(f"媒體根目錄：{MEDIA}")
    for var in ("FEB_MEDIA", "FEB_DRIVE_MAP", "FEB_DRIVE_LOG", "FEB_GWS"):
        if os.environ.get(var):
            say(f"⚠ 環境覆寫 {var}={os.environ[var]}（測試模式，不是正式跑）")
    items = scan(a.only)
    if not items:
        say("沒有符合的 .mp4。" + (f"（--only {a.only}）" if a.only else ""))
        return 0

    crosscheck_state(items)

    skip = {c.strip() for c in a.skip_code.split(",") if c.strip()}
    if a.skip_file:
        raw = Path(a.skip_file).read_text(encoding="utf-8")
        skip |= {ln.strip() for ln in raw.splitlines()
                 if ln.strip() and not ln.lstrip().startswith("#")}
    if skip:
        before = len(items)
        dropped = sorted({i["code"] for i in items if i["code"] in skip})
        items = [i for i in items if i["code"] not in skip]
        say(f"--skip-code：跳過 {len(dropped)} 支已看完的（{before} → {len(items)}）"
            + (f"　{'、'.join(dropped[:6])}" + ("…" if len(dropped) > 6 else "") if dropped else ""))
        miss = sorted(skip - set(dropped))
        if miss:
            # 指定了卻沒對上＝代號打錯、編碼壞掉，或不在本次 --only 範圍。
            say(f"　（其中 {len(miss)} 個代號在本次範圍內找不到：{'、'.join(miss[:6])}）")
        if not dropped:
            say("✗ 跳過名單一個都沒對上——這幾乎一定是代號在傳遞途中壞掉了"
                "（中文參數經過 shell 會被轉成 ANSI 字碼頁）。")
            say("  沒跳過就等於整批已看完的照傳，代價太大，先停。改用 --skip-file 餵 UTF-8 檔案。")
            return 6
        if not items:
            say("扣掉已看完的之後沒有東西要傳了。")
            return 0

    by_series = {}
    for it in items:
        by_series.setdefault(it["series"], []).append(it)

    # 代號撞號＝致命，因為帳本以代號當鍵，撞了會有一支永遠上不去
    seen = {}
    for it in items:
        seen.setdefault(it["key"], []).append(it["name"])
    dup = {k: v for k, v in seen.items() if len(v) > 1}
    if dup:
        say("✗ 集數代號撞號，帳本的鍵會互相覆蓋，先處理再跑：")
        for k, v in dup.items():
            say(f"   {k} ← " + "、".join(v))
        return 3

    led = load_ledger()

    # 身分與空間：先問清楚再說。gws 沒登入的話這一步就會失敗，不必等到傳一半
    try:
        about = gws_json("drive", "about", "get",
                         "--params", jarg({"fields": "user,storageQuota"}))
    except Exception as e:
        say(f"✗ gws 讀不到 Drive 帳號資訊：{e}")
        say("  先跑 `gws auth login`（本腳本不碰任何權杖或密碼）。")
        return 2
    quota = about.get("storageQuota", {})
    limit = int(quota.get("limit") or 0)
    usage = int(quota.get("usage") or 0)
    free = limit - usage if limit else None
    say(f"Drive 帳號：{about.get('user', {}).get('emailAddress', '?')}"
        + (f"　剩餘空間 {gib(free)} / {gib(limit)}" if free is not None else ""))

    # ── 盤點：每一支的去向。這整段唯讀，一個資料夾都不建 ──
    ensure_root(led, a.root, create=False)
    plan, rows = [], []
    for series in sorted(by_series):
        eps = sorted(by_series[series], key=lambda x: x["code"])
        say(f"\n── {series}（{len(eps)} 支、{gib(sum(e['size'] for e in eps))}）")
        parent = ensure_chain(series.split("/"), led, create=False)
        remote = {}
        if parent and not parent.startswith("("):
            for f in drive_list(f"'{q_esc(parent)}' in parents and trashed=false"):
                remote[f["name"]] = f
        st = {"雲端已有": 0, "待上傳": 0, "尺寸不符": 0, "bytes": 0}
        for e in eps:
            ent = led["files"].get(e["key"])
            r = remote.get(e["name"])
            if r and int(r.get("size") or 0) == e["size"]:
                # 認領：帳本掉了也不會重傳
                led["files"][e["key"]] = {
                    "id": r["id"], "name": r["name"], "size": int(r.get("size") or 0),
                    "md5": r.get("md5Checksum", ""), "series": series, "parent": parent,
                    "uploaded": (ent or {}).get("uploaded", ""),
                }
                e["state"] = "雲端已有"
            elif r:
                e["state"] = "尺寸不符"
                say(f"  ⚠ {e['code']} 雲端 {r.get('size')} ≠ 本機 {e['size']}"
                    f"（上次斷在半路？本腳本不刪雲端檔，請自行到 Drive 刪掉 {r['id']} 再重跑）")
            elif ent and int(ent.get("size") or 0) == e["size"] and parent.startswith("("):
                e["state"] = "雲端已有"           # dry-run 讀不到雲端時，退回信帳本
            else:
                e["state"] = "待上傳"
                plan.append(e)          # 目的地資料夾等閘門過了才解析（可能還不存在）
            st[e["state"]] += 1
            if e["state"] == "待上傳":
                st["bytes"] += e["size"]
        rows.append((series, len(eps), st))

    # 盤點時向 Drive 認領到的 id 要落地，否則每次重跑都得重新 list 一遍雲端
    # （--dry-run 例外：它答應過「不寫任何東西」）。
    if not a.dry_run:
        save_ledger(led)

    # ── --limit 與安全閘門 ──
    full = len(plan)
    if a.limit and full > a.limit:
        say(f"\n--limit {a.limit}：本次只處理前 {a.limit} 支（其餘留給下一輪）")
        plan = plan[:a.limit]
    todo = sum(e["size"] for e in plan)

    say("\n" + "=" * 62)
    say(f"本次要送出：{len(plan)} 支、{todo:,} bytes（{gib(todo)}）")
    if free is not None and todo > free:
        say(f"✗ Drive 剩餘空間 {gib(free)} 不夠，中止。")
        return 4

    if a.verify:
        # 反向對帳：帳本裡有、本機卻找不到的集數。硬碟沒插、或檔案被搬走都長這樣，
        # 不報出來的話帳本會慢慢變成一份沒人知道哪裡不對的名單。
        local = {i["key"] for i in items}
        orphan = [k for k, v in led["files"].items()
                  if k not in local and (not a.only or a.only in v.get("series", ""))]
        if orphan:
            say(f"\n帳本有、本機沒有的集數 {len(orphan)} 支：{'、'.join(sorted(orphan)[:10])}"
                + ("…" if len(orphan) > 10 else ""))
        return report(rows, verify=True, trimmed=(full, len(plan)))
    if a.dry_run:
        say("（--dry-run：以上全部沒有真的送出，也沒有建立任何資料夾）")
        return report(rows, dry=True, trimmed=(full, len(plan)))
    if not plan:
        say("沒有要上傳的東西——全部都已經在雲端了。")
        return report(rows)
    if todo > SAFE_BATCH and not a.yes:
        say(f"✗ 超過安全批次 {gib(SAFE_BATCH)}，需要 --yes 才動手。")
        say("  家裡是手機熱點：建議一次一個課程資料夾，例如")
        say("    python scripts/drive-upload.py --only 115春矩陣 --yes")
        return 5
    say("=" * 62 + "\n")

    # ── 這一行以後才開始寫入 Drive ──
    if keep_awake(True):
        say("已請求系統在上傳期間不進入睡眠（螢幕仍可關；本行程結束即自動解除）")
    ensure_root(led, a.root, create=True)
    ok = err = 0
    for i, e in enumerate(plan, 1):
        parent = ensure_chain(e["series"].split("/"), led, create=True)
        head = f"[{i}/{len(plan)}] {e['code']}  {gib(e['size'])}"
        say(f"{head}  ↑ {e['series']}/{e['name']}")
        timeout = 600 + e["size"] / (a.min_kbps * 1000)
        for attempt in range(a.retries + 1):
            t0 = time.time()
            try:
                r = drive_upload(e["path"], e["name"], parent,
                                 timeout=timeout, mime=e.get("mime", "video/mp4"))
                dt = max(time.time() - t0, 0.001)
                led["files"][e["key"]] = {
                    "id": r["id"], "name": r.get("name", e["name"]),
                    "size": int(r.get("size") or e["size"]),
                    "md5": r.get("md5Checksum", ""),
                    "series": e["series"], "parent": parent,
                    "uploaded": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                }
                save_ledger(led)          # 每一支都落地：下一秒斷線也不用重傳這支
                say(f"{' ' * 4}✓ {r['id']}　{dt / 60:.1f} 分　{e['size'] / dt / 1e6:.2f} MB/s")
                ok += 1
                break
            except Exception as ex:
                dt = time.time() - t0
                if attempt < a.retries:
                    wait = 15 * (attempt + 1)
                    say(f"{' ' * 4}✗ 第 {attempt + 1} 次失敗（{dt / 60:.1f} 分）：{str(ex)[:160]}")
                    say(f"{' ' * 4}  {wait} 秒後重試")
                    time.sleep(wait)
                else:
                    say(f"{' ' * 4}✗ 放棄（重試 {a.retries} 次）：{str(ex)[:200]}")
                    err += 1
    save_ledger(led)
    keep_awake(False)
    return report(rows, ok=ok, err=err, trimmed=(full, len(plan)))


def report(rows, ok=0, err=0, dry=False, verify=False, trimmed=None):
    say("\n" + "=" * 62)
    title = "對帳結果" if verify else ("盤點結果" if dry else "上傳結果")
    say(title)
    say(f"{pad('課程', 20)}{pad('支數', 6, True)}{pad('雲端已有', 10, True)}"
        f"{pad('待上傳', 8, True)}{pad('尺寸不符', 10, True)}{pad('待傳量', 12, True)}")
    tot = {"n": 0, "有": 0, "待": 0, "異": 0, "b": 0}
    for series, n, st in rows:
        say(f"{pad(series, 20)}{pad(n, 6, True)}{pad(st['雲端已有'], 10, True)}"
            f"{pad(st['待上傳'], 8, True)}{pad(st['尺寸不符'], 10, True)}{pad(gib(st['bytes']), 12, True)}")
        tot["n"] += n; tot["有"] += st["雲端已有"]; tot["待"] += st["待上傳"]
        tot["異"] += st["尺寸不符"]; tot["b"] += st["bytes"]
    say(f"{pad('合計', 20)}{pad(tot['n'], 6, True)}{pad(tot['有'], 10, True)}"
        f"{pad(tot['待'], 8, True)}{pad(tot['異'], 10, True)}{pad(gib(tot['b']), 12, True)}")
    # 表格是「整個課程的缺口」，--limit 只影響本次做多少——兩個數字不同時要講清楚，
    # 不然「待上傳 13」與「本次要送出 3」擺在同一頁會被當成 bug。
    if trimmed and trimmed[0] != trimmed[1]:
        say(f"（表格是整個課程的缺口；--limit 讓本次只處理其中 {trimmed[1]} 支）")
    if not (dry or verify):
        say(f"\n本次成功 {ok} 支、失敗 {err} 支。帳本：{LEDGER}")
    say(f"日誌：{LOGFILE}")
    return 1 if err else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        say("\n中斷。已上傳的部分都在 drive-map.json 裡，重跑會從斷點接下去。")
        sys.exit(130)
