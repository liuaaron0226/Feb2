# -*- coding: utf-8 -*-
"""把課程影片重新封裝成 fragmented MP4，並替每支建 MSE 用的片段索引。

為什麼要有這支（2026-09-04 使用者裁定「做 MSE」）：
  iPad 上 <video> 的請求不經過 Service Worker（WebKit 讓媒體載入走系統層），
  所以 /drive/<id> 直接打到 Cloudflare、拿回 index.html → 錯誤 4，Feb 自己的播放器
  在 iPad 上一律失敗、只能退到 Google 的 iframe（沒有點章節跳轉、續播、站內字幕）。
  頁面的 fetch() **會**經過 SW（帶得了 Drive 權杖），所以改用 MediaSource：
  分段 fetch 影片位元組餵給 SourceBuffer。MSE 只吃 fragmented MP4，
  而課程影片是一般 MP4（ftyp moov free mdat，零個 moof）——得先重新封裝。

輸出（放在原檔旁邊，原檔一個位元組都不動）：
  <原檔名>.frag.mp4      -c copy 重新封裝，不重編碼；實測 1.1 GB 約 7 秒、大小 −6 MB
  <原檔名>.fragidx.json  {"v":1,"codecs":…,"dur":秒,"init":[0,長度],"frags":[[秒,位移,長度],…]}
                         其中 codecs 是 MSE addSourceBuffer 要的完整 MIME 字串，逐支用 ffprobe 算，
                         不假設全庫同一套（H.264 Main@3.1 ＋ AAC-LC 只是抽樣結果）。

索引怎麼來：
  每個 moof 的 traf/tfdt 帶 baseMediaDecodeTime，除以該 track 的 mdhd timescale 就是秒；
  片段長度＝moof＋緊接的 mdat。init 段＝ftyp＋moov。2026-09-04 實測 1555 個片段、
  平均 0.7 MB、init 只有 1284 bytes，seek 用位元組 Range 就能精準落到片段邊界。

冪等：frag 與 idx 都在、而且 frag 比原檔新，就跳過。中斷後重跑接續。
用法：python scripts/remux-frag.py [--only 電子08] [--limit N] [--dry]
"""
import argparse
import json
import os
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
MEDIA = Path(os.environ.get("FEB_MEDIA") or ROOT / "media")          # junction → F:\istudy-backup
LEDGER = Path(os.environ.get("FEB_DRIVE_MAP") or ROOT / "data" / "drive-map.json")
LOG = ROOT / "reports" / "remux-frag.log"
MOVFLAGS = "frag_keyframe+empty_moov+default_base_moof"


def say(msg=""):
    print(msg, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(f"{time.strftime('%H:%M:%S')} {msg}\n")


# ── ffprobe → MSE codec 字串 ────────────────────────────────────────────────
def ffprobe_json(path, stream_spec):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", stream_spec,
                        "-show_entries", "stream=codec_name,profile,level,sample_rate,channels",
                        "-of", "json", str(path)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError(f"ffprobe 失敗：{(r.stderr or '').strip()[:200]}")
    return (json.loads(r.stdout or "{}").get("streams") or [{}])[0]


def avc1_string(v):
    """H.264 → avc1.PPCCLL。profile_idc／constraint 由 profile 名稱推；level 由 ffprobe 的 level 直接給。
    抽樣是 Main@3.1 → avc1.4D401F。認不得的 profile 就退回最保守的 Baseline 表示法，
    並記一行——MSE 會用 isTypeSupported 再擋一次，不會靜靜播不出來。"""
    prof = str(v.get("profile") or "")
    idc = {"Baseline": 0x42, "Constrained Baseline": 0x42, "Main": 0x4D,
           "Extended": 0x58, "High": 0x64, "High 10": 0x6E, "High 4:2:2": 0x7A}.get(prof)
    if idc is None:
        say(f"  ⚠ 不認得的 H.264 profile「{prof}」，用 Baseline 表示法")
        idc = 0x42
    cons = 0x40 if prof in ("Constrained Baseline", "Main") else 0x00
    level = int(v.get("level") or 30)
    return f"avc1.{idc:02X}{cons:02X}{level:02X}"


def codecs_of(path):
    v = ffprobe_json(path, "v:0")
    a = ffprobe_json(path, "a:0")
    if v.get("codec_name") != "h264":
        raise RuntimeError(f"影片不是 H.264（{v.get('codec_name')}），MSE 路徑不支援")
    parts = [avc1_string(v)]
    if a:
        if a.get("codec_name") == "aac":
            parts.append("mp4a.40.2" if a.get("profile") in (None, "", "LC") else "mp4a.40.5")
        else:
            say(f"  ⚠ 音軌不是 AAC（{a.get('codec_name')}），MSE 可能拒收")
            parts.append("mp4a.40.2")
    return 'video/mp4; codecs="' + ",".join(parts) + '"'


# ── MP4 box 走訪 ────────────────────────────────────────────────────────────
def boxes(buf, start=0, end=None):
    end = len(buf) if end is None else end
    off = start
    while off + 8 <= end:
        n, t = struct.unpack(">I4s", buf[off:off + 8])
        t = t.decode("latin1"); hdr = 8
        if n == 1:
            n = struct.unpack(">Q", buf[off + 8:off + 16])[0]; hdr = 16
        elif n == 0:
            n = end - off
        if n < 8:
            return
        yield t, off, n, hdr
        off += n


def build_index(frag_path):
    """讀 frag.mp4：init 段長度、各 track 的 timescale、每個 moof 的 (秒, 位移, moof+mdat 長度)。"""
    size = frag_path.stat().st_size
    with frag_path.open("rb") as fh:
        head = fh.read(64 * 1024)                 # moov 通常不到 2 KB，64 KB 綽綽有餘
        init_len = None; tracks = {}
        for t, off, n, hdr in boxes(head):
            if t == "moov":
                init_len = off + n
                moov = head[off + hdr:off + n]
                for t2, o2, n2, h2 in boxes(moov):
                    if t2 != "trak":
                        continue
                    trak = moov[o2 + h2:o2 + n2]; tid = mts = None; hdlr = ""
                    for t3, o3, n3, h3 in boxes(trak):
                        if t3 == "tkhd":
                            ver = trak[o3 + h3]
                            tid = struct.unpack(">I", trak[o3 + h3 + (20 if ver == 1 else 12):][:4])[0]
                        elif t3 == "mdia":
                            mdia = trak[o3 + h3:o3 + n3]
                            for t4, o4, n4, h4 in boxes(mdia):
                                if t4 == "mdhd":
                                    ver = mdia[o4 + h4]
                                    mts = struct.unpack(">I", mdia[o4 + h4 + (20 if ver == 1 else 12):][:4])[0]
                                elif t4 == "hdlr":
                                    hdlr = mdia[o4 + h4 + 8:o4 + h4 + 12].decode("latin1")
                    tracks[tid] = {"ts": mts, "hdlr": hdlr}
                break
        if init_len is None or init_len > len(head):
            raise RuntimeError("找不到 moov，或 moov 大於 64 KB（不像 empty_moov 的輸出）")
        vid = next((k for k, v in tracks.items() if v["hdlr"] == "vide"), None)
        if vid is None or not tracks[vid]["ts"]:
            raise RuntimeError(f"找不到影像 track 的 timescale：{tracks}")
        vts = tracks[vid]["ts"]

        frags = []; off = init_len
        while off < size:
            fh.seek(off); h = fh.read(16)
            if len(h) < 8:
                break
            n, t = struct.unpack(">I4s", h[:8]); t = t.decode("latin1")
            if n == 1:
                n = struct.unpack(">Q", h[8:16])[0]
            elif n == 0:
                n = size - off
            if t == "moof":
                fh.seek(off); mf = fh.read(n); tfdt = None
                for t2, o2, n2, h2 in boxes(mf, 8, n):
                    if t2 != "traf":
                        continue
                    tid = None
                    for t3, o3, n3, h3 in boxes(mf, o2 + h2, o2 + n2):
                        if t3 == "tfhd":
                            tid = struct.unpack(">I", mf[o3 + h3 + 4:o3 + h3 + 8])[0]
                        elif t3 == "tfdt":
                            ver = mf[o3 + h3]
                            tfdt = (struct.unpack(">Q", mf[o3 + h3 + 4:o3 + h3 + 12])[0] if ver == 1
                                    else struct.unpack(">I", mf[o3 + h3 + 4:o3 + h3 + 8])[0])
                    if tid == vid:                 # 以影像 track 的時間為準
                        break
                fh.seek(off + n); h2 = fh.read(8)
                n2 = struct.unpack(">I", h2[:4])[0] if len(h2) == 8 and h2[4:8] == b"mdat" else 0
                if n2 == 1:
                    n2 = struct.unpack(">Q", fh.read(8))[0]
                frags.append([round((tfdt or 0) / vts, 3), off, n + n2])
            off += n
    if not frags:
        raise RuntimeError("沒有任何 moof——輸出不是 fragmented")
    return init_len, frags


def remux_one(src, dry=False):
    frag = src.with_name(src.name[:-4] + ".frag.mp4")
    idx = src.with_name(src.name[:-4] + ".fragidx.json")
    if frag.exists() and idx.exists() and frag.stat().st_mtime >= src.stat().st_mtime:
        return "skip"
    if dry:
        return "todo"
    t0 = time.time()
    tmp = frag.with_suffix(".mp4.part")
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
                        "-c", "copy", "-movflags", MOVFLAGS, "-f", "mp4", str(tmp)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"ffmpeg 失敗：{(r.stderr or '').strip()[:200]}")
    tmp.replace(frag)
    init_len, frags = build_index(frag)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "csv=p=0", str(frag)], capture_output=True, text=True,
                               encoding="utf-8").stdout.strip() or 0)
    doc = {"v": 1, "codecs": codecs_of(frag), "dur": round(dur, 3), "size": frag.stat().st_size,
           "init": [0, init_len], "frags": frags}
    tmp_idx = idx.with_suffix(".json.tmp")
    tmp_idx.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp_idx.replace(idx)
    say(f"  ✓ {time.time() - t0:.0f}s　{frag.stat().st_size / 2**30:.2f} GB　片段 {len(frags)}　"
        f"init {init_len} B　{doc['codecs']}")
    return "done"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="只處理代號／檔名含這段字的（逗號分隔多個）")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry", action="store_true", help="只列清單")
    a = ap.parse_args()
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit("找不到 ffmpeg／ffprobe")
    led = json.loads(LEDGER.read_text(encoding="utf-8"))["files"]
    # 只做帳本裡的影片（＝已上雲的 77 支）；側車檔鍵有副檔名，影片鍵沒有
    vids = [(k, v) for k, v in led.items() if "." not in k.rsplit("/", 1)[-1][3:]]
    onlys = [s.strip() for s in a.only.split(",") if s.strip()]
    todo = []
    for code, ent in vids:
        if onlys and not any(o in code or o in ent.get("name", "") for o in onlys):
            continue
        src = MEDIA / ent["series"].replace("/", os.sep) / ent["name"]
        if not src.is_file():
            say(f"  ⚠ 本機找不到：{src.name[:40]}"); continue
        todo.append((code, src))
    if a.limit:
        todo = todo[:a.limit]
    say(f"待處理 {len(todo)} 支（帳本影片 {len(vids)} 支）")
    done = skip = err = 0
    for i, (code, src) in enumerate(todo, 1):
        say(f"▶ [{i}/{len(todo)}] {code}")
        try:
            st = remux_one(src, dry=a.dry)
            if st == "skip":
                skip += 1; say("  （已有 frag 與索引，跳過）")
            elif st == "todo":
                say("  （dry：會做）")
            else:
                done += 1
        except Exception as exc:  # noqa: BLE001
            err += 1; say(f"  ✗ {exc}")
    say(f"完成 {done}、跳過 {skip}、失敗 {err}")
    return 1 if err else 0


if __name__ == "__main__":
    sys.exit(main())
