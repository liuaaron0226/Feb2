# -*- coding: utf-8 -*-
"""替已下載的課程影片產生繁體中文字幕（.vtt），與影片放在一起。

實測（RTX 3060 6GB、large-v3、int8_float16）：
  逐段 beam=1  → 7.7x 實時、平均 1.4 秒/句   ← 採用
  逐段 beam=5  → 7.0x 實時、平均 1.6 秒/句
  批次 batch=16→ 22.6x 但 30 秒併成一段且出現重複幻覺，當字幕不可用
Whisper 輸出簡體，統一用 OpenCC s2twp 轉臺灣正體。

用法：
  python tools/make_subs.py --limit 1        # 先做一支
  python tools/make_subs.py                  # 全部沒字幕的都做（可中斷續跑）
  python tools/make_subs.py --only 115春矩陣  # 只做代號含指定字串的
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

OUT_ROOT = Path(r"F:\istudy-backup")
STATE_FILE = OUT_ROOT / "state.json"
LOG = OUT_ROOT / "subs.log"
MODEL = "large-v3"


def setup_cuda() -> bool:
    """pip 版 CUDA 執行庫不在 PATH，要手動掛進 DLL 搜尋路徑。"""
    try:
        import nvidia
    except ImportError:
        return False
    found = False
    for root in list(nvidia.__path__):
        for sub in ("cublas", "cudnn"):
            for leaf in ("bin", os.path.join("lib", "x64")):
                p = os.path.join(root, sub, leaf)
                if os.path.isdir(p):
                    os.add_dll_directory(p)
                    os.environ["PATH"] = p + os.pathsep + os.environ["PATH"]
                    found = True
    return found


def norm(code: str) -> str:
    """去掉 (喻)(劉) 這類講師標記與最後一集的 -The End 尾綴，好讓 --only 比對得到。"""
    code = re.sub(r"\([^)]*\)", "", code)
    return re.sub(r"[-\s]*The\s*End\s*$", "", code, flags=re.I).strip()


def log(msg: str) -> None:
    line = f"[{time.strftime('%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


# 語音辨識常見的術語誤字 → 正確寫法。
# 刻意留空起步：先跑一支課看實際錯在哪，再據實補進來，不要憑空猜。
FIXES: list[tuple[str, str]] = [
    # (誤, 正) 例：(r"奈式", "奈氏"),
]

# 勘誤飛輪：make_notes.py 分析影片時找到的錯詞累積在 fixes.json，按科目分桶
# （「志工→資工」在線代裡對、在多益裡是災難）。字面替換，AI 給的字串不當 regex 用。
FILE_FIXES: dict[str, dict[str, str]] = {}


MIN_VOTES = 2   # 要有兩支以上影片各自提過，才算系統性聽錯而不是單堂課的上下文產物


def load_file_fixes() -> int:
    """fixes.json 由 make_notes.py 產生，格式 {科目: {誤: [正, 提過的影片數]}}。
    只採用得票 >= MIN_VOTES 的規則——單支影片提的可能是那堂課才成立的替換
    （踩過：「反正→反證」，但「反正」是老師口頭禪，無條件替換會毀掉字幕）。"""
    try:
        d = json.loads((OUT_ROOT / "fixes.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return 0
    total = 0
    for subj, m in d.items():
        if not isinstance(m, dict):
            continue
        keep = {}
        for bad, val in m.items():
            if isinstance(val, list) and len(val) == 2:
                good, n = val
            else:                    # 舊的扁平格式，視為單票、不生效
                good, n = val, 1
            if (isinstance(bad, str) and isinstance(good, str)
                    and len(bad) >= 2 and bad != good and n >= MIN_VOTES):
                keep[bad] = good
        FILE_FIXES[subj] = keep
        total += len(keep)
    return total


def apply_fixes(text: str, lit=()) -> str:
    for bad, good in FIXES:
        text = re.sub(bad, good, text)
    for bad, good in lit:
        text = text.replace(bad, good)
    return text


def ts(sec: float) -> str:
    h = int(sec // 3600); m = int(sec % 3600 // 60)
    s = sec % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


SR = 16000
OVERLAP_SEC = 5.0


class _Seg:
    """write_vtt 只用到 start/end/text；分段轉錄時用這個把時間偏移套回去。"""

    __slots__ = ("start", "end", "text")

    def __init__(self, start, end, text):
        self.start, self.end, self.text = start, end, text


def _audio_chunks(mp4: Path, chunk_sec: float, overlap_sec: float = OVERLAP_SEC):
    """用 ffmpeg 把音軌解成 16 kHz 單聲道 float32，一塊一塊吐出來。

    整支直接丟給 faster-whisper，Silero VAD 會對全長算一次頻譜：157 分鐘的課
    就是 (1, 766997, 400) 的 float64，需要 2.1 GiB 連續記憶體。這台機器同時在
    跑下載與思考地圖時配置不到，2026-09-06 晚上連續 9 支全失敗。切塊之後每塊
    的頻譜只有幾百 MB。相鄰兩塊重疊 overlap_sec 秒，句子才不會被切在交界處。
    """
    import subprocess

    import numpy as np

    proc = subprocess.Popen(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(mp4),
         "-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    step = int(chunk_sec * SR)
    keep = int(overlap_sec * SR)
    tail = np.empty(0, dtype=np.float32)
    start = 0                      # tail 的第一個樣本在整支音檔中的位置
    try:
        while True:
            block = proc.stdout.read(step * 4)
            if not block:
                break
            audio = np.concatenate([tail, np.frombuffer(block, dtype=np.float32)])
            yield start / SR, audio
            if audio.size > keep:
                tail = audio[-keep:].copy()
                start += audio.size - keep
            else:
                tail = audio.copy()
        err = proc.stderr.read().decode("utf-8", "replace").strip()
        rc = proc.wait()
        if rc:
            raise RuntimeError(f"ffmpeg 取音軌失敗（{rc}）：{err[:200]}")
    finally:
        for pipe in (proc.stdout, proc.stderr):
            try:
                pipe.close()
            except OSError:
                pass
        if proc.poll() is None:
            proc.kill()
            proc.wait()


def transcribe_chunked(model, mp4: Path, beam: int, chunk_sec: float):
    """逐塊轉錄，把時間軸接回整支影片的座標，重疊區重複的句子丟掉。"""
    last_end = 0.0
    for offset, audio in _audio_chunks(mp4, chunk_sec):
        segs, _info = model.transcribe(
            audio, language="zh", beam_size=beam, vad_filter=True,
            condition_on_previous_text=False,   # 避免上下文把後段帶進重複迴圈
        )
        for seg in segs:
            a, b = seg.start + offset, seg.end + offset
            if b <= last_end + 0.25:            # 重疊區，上一塊已經出過了
                continue
            yield _Seg(max(a, last_end), b, seg.text)
            last_end = b


def write_vtt(segs, dest: Path, cc, lit=()) -> int:
    lines = ["WEBVTT", ""]
    n = 0
    for s in segs:
        txt = apply_fixes(cc.convert(s.text.strip()), lit)
        if not txt:
            continue
        lines.append(f"{ts(s.start)} --> {ts(s.end)}")
        lines.append(txt)
        lines.append("")
        n += 1
    tmp = dest.with_suffix(".vtt.tmp")
    tmp.write_text("\n".join(lines), encoding="utf-8")
    tmp.replace(dest)
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", default="")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--beam", type=int, default=1)
    ap.add_argument("--chunk-min", type=float, default=10,
                    help="每塊音訊幾分鐘（預設 10）。0＝整支一次做（會吃掉數 GB 記憶體）")
    args = ap.parse_args()

    if not setup_cuda():
        log("找不到 CUDA 執行庫（pip install nvidia-cublas-cu12 nvidia-cudnn-cu12）")
    n_fix = load_file_fixes()
    if n_fix:
        log(f"勘誤飛輪：載入 fixes.json 共 {n_fix} 條")
    from faster_whisper import WhisperModel
    from opencc import OpenCC
    cc = OpenCC("s2twp")

    st = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    onlys = [s.strip() for s in args.only.split(",") if s.strip()]   # 支援逗號清單
    todo = []
    for v in st.values():
        if v.get("status") != "done" or not v.get("path"):
            continue
        mp4 = Path(v["path"])
        if not mp4.exists():
            continue
        # 代號裡夾著講師標記（115暑微方(喻)15），要拿掉才比對得到 115暑微方15
        if onlys and not any(o in v.get("code", "") or o in norm(v.get("code", ""))
                             for o in onlys):
            continue
        if mp4.with_suffix(".vtt").exists():
            continue
        todo.append((v, mp4))
    todo.sort(key=lambda x: x[0]["code"])
    if args.limit:
        todo = todo[:args.limit]
    log(f"待製字幕 {len(todo)} 支")
    if not todo:
        return 0

    t0 = time.time()
    model = WhisperModel(args.model, device="cuda", compute_type="int8_float16")
    log(f"模型載入 {time.time()-t0:.0f}s")

    for i, (v, mp4) in enumerate(todo, 1):
        dest = mp4.with_suffix(".vtt")
        log(f"▶ [{i}/{len(todo)}] {v['code']}｜{v.get('title','')[:34]}")
        t = time.time()
        try:
            if args.chunk_min > 0:
                segs = transcribe_chunked(model, mp4, args.beam,
                                          args.chunk_min * 60)
            else:
                segs, _info = model.transcribe(
                    str(mp4), language="zh", beam_size=args.beam, vad_filter=True,
                    condition_on_previous_text=False,   # 避免上下文把後段帶進重複迴圈
                )
            lit = FILE_FIXES.get(v.get("series", "").split("/")[0], {}).items()
            n = write_vtt(segs, dest, cc, lit)
            el = time.time() - t
            rate = (v.get("sec") or 0) / max(el, 1)
            log(f"  ✓ {n} 句・耗時 {el/60:.1f} 分・{rate:.1f}x 實時 → {dest.name}")
        except Exception as exc:  # noqa: BLE001
            log(f"  ✗ 失敗：{str(exc)[:200]}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
