# -*- coding: utf-8 -*-
"""替已有字幕的課程影片產生「思考地圖」筆記（.notes.json），並做四件副產品：
  ① 勘誤套回 .vtt、累積到 fixes.json（勘誤飛輪，make_subs.py 會讀）
  ② 重點時段在 .vtt 以 <c.key> 標記（網站用 ::cue(.key) 上色）
  ③ ffmpeg 抽板書快照 <影片名>.snap_<秒>.jpg
  ④ 重建全文搜尋索引 search_index.json

分析引擎是 claude -p（無頭模式），一部影片一個呼叫，逐字稿全文塞進 prompt。

用法：
  python tools/make_notes.py --limit 1 --only 115暑線代01   # 試產一支
  python tools/make_notes.py                                # 依衝刺週序補齊全部
  python tools/make_notes.py --index-only                   # 只重建搜尋索引
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

OUT_ROOT = Path(r"F:\istudy-backup")
STATE_FILE = OUT_ROOT / "state.json"
FIXES_FILE = OUT_ROOT / "fixes.json"
INDEX_FILE = OUT_ROOT / "search_index.json"
LOG = OUT_ROOT / "notes.log"
HERE = Path(__file__).resolve().parent
PROMPT_FILE = HERE / "notes_prompt.md"
# feb2 本身（videos.json／sprint.json 的來源）。原本指向前身 grad-exam-hub，
# 2026-10-01 工具搬進 feb2 成為正本時改成相對位置；兩邊這兩個檔當時逐位元組相同。
HUB = HERE.parent

SUBJ_FULL = {"電子學": "電子學", "工數": "工程數學", "線代": "線性代數",
             "多益": "多益", "控制": "自動控制"}
# 逾時要跟 prompt 長度連動：實測 84~88k 字的長逐字稿會超過 25 分鐘，
# 固定 1500 秒讓三支最長的課全部逾時失敗。改成基礎 900 秒＋每 10k 字加 250 秒。
CLAUDE_TIMEOUT_BASE = 900
CLAUDE_TIMEOUT_PER10K = 250
CLAUDE_TIMEOUT_MAX = 3600
SNAP_LIMIT = 6
# 寫死模型與思考強度，不跟著全域設定漂移：這批筆記是同一套複習素材，
# 全域若改成較弱的模型，會默默產出半套 Opus 半套別的，事後也分不出哪集是哪個做的。
# 電子學／工數的觀念錯誤，初學者看不出來，所以這裡不省。
# 2026-08-20 同一支影片同一份 prompt 實測 A/B：Fable 5 契約違規 0（Opus 1）、
# 文字量 1771 對 2296、圖 10 張對 8 張、教科書補洞 5 個對 3 個，代價是慢 62%。
# 這種要嚴守輸出規格的批次工作，選遵守度高的那個。
# 2026-09-06 改用 Opus 5：Fable 5 開始要 usage credits（API 429「requires usage
# credits」），09-05 22:00 與 09-06 10:00 兩次排程都是開跑十幾秒就整批停、0 支產出。
# 探針實測 opus-5／sonnet-5 都能呼叫；選 opus 是因為上面那組 A/B 的差距是「Fable 略好」
# 而不是「別的明顯不行」，sonnet 才是會掉品質的那一階。
# 想換回 Fable：補完 credits 後把這行改回 "claude-fable-5"，或跑時加 --model claude-fable-5。
NOTES_MODEL = "claude-opus-5"
NOTES_EFFORT = "xhigh"


def log(msg: str) -> None:
    line = f"[{time.strftime('%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def norm(code: str) -> str:
    """去講師標記，並拔掉最後一集的「-The End」尾綴——videos.json 寫 115春矩陣10，
    實際檔名是 115春矩陣10-The End，不拔掉就對不上章節、排不進衝刺週序。"""
    code = re.sub(r"\([^)]*\)", "", code)
    return re.sub(r"[-\s]*The\s*End\s*$", "", code, flags=re.I).strip()


def hms(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


# ---------- 衝刺週序：code → (章節名, 週) ----------

def chapter_week_map() -> dict[str, tuple[str, int]]:
    try:
        videos = json.loads((HUB / "data" / "videos.json").read_text(encoding="utf-8"))
        sprint = json.loads((HUB / "data" / "sprint.json").read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        log(f"讀 videos/sprint.json 失敗，不排優先序：{str(exc)[:80]}")
        return {}
    info: dict[str, tuple[str, int]] = {}
    chap: dict[str, tuple[str, int]] = {}
    for s in sprint.get("subjects", []):
        for c in s.get("chapters", []):
            chap[c["id"]] = (c.get("name", c["id"]), int(c.get("week", 9)))
    for cid, eps in videos.get("istudy", {}).get("byChapter", {}).items():
        name, week = chap.get(cid, (cid, 9))
        for e in eps:
            info[norm(e["code"])] = (name, week)
    return info


# ---------- VTT ----------

TS = re.compile(r"^(\d{2,}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2,}):(\d{2}):(\d{2})\.(\d{3})")


def vtt_cues(path: Path) -> list[tuple[float, float, str]]:
    cues: list[tuple[float, float, str]] = []
    cur: tuple[float, float] | None = None
    buf: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines() + [""]:
        m = TS.match(raw)
        if m:
            if cur and buf:
                cues.append((cur[0], cur[1], " ".join(buf)))
            g = [int(x) for x in m.groups()]
            cur = (g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000,
                   g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000)
            buf = []
        elif raw.strip() == "":
            if cur and buf:
                cues.append((cur[0], cur[1], " ".join(buf)))
            cur = None
            buf = []
        elif cur is not None:
            buf.append(re.sub(r"</?c[^>]*>", "", raw.strip()))
    return cues


# ---------- prompt 組裝與 claude -p ----------

def build_prompt(v: dict, cues, chapinfo: tuple[str, int] | None) -> str:
    tpl = PROMPT_FILE.read_text(encoding="utf-8")
    subj = SUBJ_FULL.get(v["series"].split("/")[0], v["series"].split("/")[0])
    chap = f"{chapinfo[0]}（衝刺第 {chapinfo[1]} 週）" if chapinfo else "（未對應）"
    lines = "\n".join(f"{int(a)}|{t}" for a, _b, t in cues if t)
    dur = int(v.get("sec") or (cues[-1][1] if cues else 0))
    return (tpl.replace("«SUBJECT»", subj)
               .replace("«CODE»", v["code"])
               .replace("«TITLE»", v.get("title", ""))
               .replace("«CHAPTER»", chap)
               .replace("«DUR»", hms(dur))
               .replace("«DURSEC»", str(dur))
               .replace("«TRANSCRIPT»", lines))


class ThinResult(RuntimeError):
    """模型回了合法 JSON，但內容實質是空的。

    validate() 會把缺少的欄位補成空骨架，所以這種輸出會一路通過檢查、
    被當成功寫檔——影片在看板上看起來「有思考地圖」，點進去卻什麼都沒有。
    （踩過：115春微方07 用 sonnet 跑出章節 0、重點 0、概念 0 仍存檔成功。）
    寧可不寫，下次重跑會自動再排進待產清單。"""


class QuotaExhausted(RuntimeError):
    """API 額度用完。單獨分類，好讓主迴圈直接停下來而不是把剩下每一支都跑成失敗。"""


# 額度／速率限制的字眼。寧可多認幾個：誤判只會讓整批早點停（安全方向），
# 漏認會讓它 30 秒一支把剩下的全部「試」完（2026-09-04 18:13 實際發生，30 支）。
# "429" 來自 _stream_error 對 api_error_status 的前綴，是最可靠的一個。
LIMIT_HINTS = ("reached your", "usage-credits", "rate limit", "rate_limit",
               "usage limit", "hit your", "429", "overloaded", "quota")


def _join_stream_json(stdout: str) -> str:
    """把 `claude -p --output-format stream-json --verbose` 的逐行事件接回完整回答。

    只認兩種事件：type=assistant（把 message.content 裡每個 text 區塊照順序接起來）
    與 type=result（拿 num_turns／stop_reason／is_error 做診斷）。
    整份 stdout 找不到任何 JSON 行時原樣退回——萬一 CLI 版本不支援，行為退化成
    以前的 text 模式，不會比原本更糟。
    """
    parts, meta, any_json = [], {}, False
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        any_json = True
        if ev.get("type") == "assistant":
            for c in (ev.get("message") or {}).get("content") or []:
                if c.get("type") == "text":
                    parts.append(c.get("text") or "")
        elif ev.get("type") == "result":
            meta = ev
    if not any_json:
        return stdout
    turns, stop = meta.get("num_turns"), meta.get("stop_reason")
    if (turns and turns > 1) or (stop and stop != "end_turn") or meta.get("is_error"):
        # 平常安靜；只有「多回合／非正常結束／錯誤」才留一行——那正是以前看不見的東西
        log(f"  stream-json：num_turns={turns} stop_reason={stop} "
            f"is_error={meta.get('is_error')} assistant 文字段={len(parts)}")
    if parts:
        return "".join(parts)
    return str(meta.get("result") or "")


def _stream_error(stdout: str, stderr: str) -> str:
    """非零退出時，找出**真正**的錯誤文字。

    優先順序：result 事件的 result（＋api_error_status）→ 擋住的 rate_limit_event →
    stderr → stdout 裡最後一行非 hook 的事件。絕不回傳 stdout 開頭那 200 字——
    那永遠是 hook_started，等於沒印。
    """
    result_txt, rate_txt, tail = "", "", ""
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = ev.get("type")
        if t == "result":
            result_txt = str(ev.get("result") or "").strip()
            if ev.get("api_error_status") is not None:
                result_txt = f"API {ev.get('api_error_status')}：{result_txt}"
            if ev.get("is_error") and not result_txt:
                result_txt = f"is_error（subtype={ev.get('subtype')}）"
        elif t == "rate_limit_event":
            info = ev.get("rate_limit_info") or {}
            if str(info.get("status", "")).lower() not in ("", "allowed", "allowed_warning"):
                rate_txt = f"rate limit：{info.get('status')}（{info.get('rateLimitType')}）"
        elif t not in ("system",):
            tail = line[:200]
    return result_txt or rate_txt or (stderr or "").strip() or tail or "(無輸出)"


def call_claude(prompt: str, tries: int = 2) -> str:
    exe = shutil.which("claude")
    if not exe:
        raise RuntimeError("找不到 claude CLI")
    timeout = min(CLAUDE_TIMEOUT_MAX,
                  CLAUDE_TIMEOUT_BASE + len(prompt) / 10_000 * CLAUDE_TIMEOUT_PER10K)
    last = ""
    for attempt in range(1, tries + 1):
        # 2026-09-04：改用 stream-json，並把**每一個** assistant 事件的 text 區塊照順序接起來。
        # 原本 --output-format text 只回「最後一段」assistant 文字：長筆記被 CLI 拆成多個
        # assistant 訊息時（-p 模式下 hooks 也在跑，回合會被切開），前段整個丟失——
        # 115暑電子10／16 的 _rawnotes 都是「開頭從半截 JSON 起、結尾乾淨的 }}」，
        # extract_json 在殘缺片段上找到內層物件就當整份解析，validate 再判成「空」。
        # 兩支各燒掉兩次 xhigh 呼叫，原因卻完全看不見。stream-json 不管怎麼拆都接得齊，
        # 順便把 num_turns／stop_reason 記進日誌，下次再怪就有線索。
        r = subprocess.run([exe, "-p", "--output-format", "stream-json", "--verbose",
                            "--model", NOTES_MODEL, "--effort", NOTES_EFFORT],
                           input=prompt, capture_output=True, text=True,
                           encoding="utf-8", errors="replace",
                           timeout=timeout, cwd=str(OUT_ROOT))
        if r.returncode == 0:
            out = _join_stream_json(r.stdout or "")
            # 額度用完時 claude -p 仍回退出碼 0，只是把提示當成回答吐出來。
            # 不特別認出來的話，整批會被記成「內容失敗」，但其實一支都沒真的跑。
            if len(out) < 400 and any(h in out.lower() for h in LIMIT_HINTS):
                raise QuotaExhausted(out.strip()[:160])
            return out
        # 退出碼 1 且沒有 stderr 多半是暫時性的（額度、連線），值得再試一次。
        # 但 claude -p 的錯誤訊息（如 "There's an issue with the selected model"、
        # "API Error: 400 …"）**印在 stdout 不在 stderr**——2026-09-04 兩次失敗
        # 都被記成「(無 stderr)」，真正原因整個被吞掉。stderr 空就退回 stdout。
        # stream-json 模式下 stdout 開頭是 hook 事件，截前 200 字只會看到
        # {"type":"system","subtype":"hook_started"…}——2026-09-04 18:13 起連續 30 支
        # 秒失敗，日誌裡全是這個，真正原因（5 小時額度撞滿）一個字都沒印。
        # 改成從 result 事件取錯誤文字；像額度／速率限制的就直接 QuotaExhausted，
        # 讓整批停下來，不要 30 秒一支把剩下的全部「試」完。
        last = _stream_error(r.stdout or "", r.stderr or "")
        if any(h in last.lower() for h in LIMIT_HINTS):
            raise QuotaExhausted(last[:160])
        if attempt < tries:
            log(f"  claude -p 退出碼 {r.returncode}：{last[:200] or '(無輸出)'}")
            log(f"  {20}s 後重試（{attempt}/{tries}）")
            time.sleep(20)
    raise RuntimeError(f"claude -p 退出碼非零：{last[:200] or '(無 stderr)'}")


def extract_json(text: str) -> dict:
    """模型偶爾會在 JSON 前後夾一句說明、或整包用 ``` 圍起來，
    也可能在結尾多吐一段（Extra data）。逐步退讓地解析，不要一次就放棄。"""
    text = text.strip().lstrip("﻿")
    fence = re.search(r"```(?:json)?\s*(.+?)\s*```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    a = text.find("{")
    if a < 0:
        raise ValueError("輸出裡沒有 JSON 物件")
    # 用括號配對找出第一個完整物件，避免被後面多餘的內容干擾（Extra data）
    depth, instr, esc = 0, False, False
    for i in range(a, len(text)):
        c = text[i]
        if instr:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                instr = False
            continue
        if c == '"':
            instr = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[a:i + 1], strict=False)
    # 沒配對成功就退回原本的粗略切法
    return json.loads(text[a:text.rfind("}") + 1], strict=False)


# ---------- 驗證與收斂 ----------

def clampt(t, dur: int) -> int:
    try:
        return max(0, min(int(float(t)), dur))
    except (TypeError, ValueError):
        return 0


def validate(d: dict, dur: int) -> dict:
    out: dict = {"version": 1}
    fixes = []
    for p in d.get("fixes", []):
        if (isinstance(p, (list, tuple)) and len(p) == 2
                and all(isinstance(x, str) for x in p)
                and len(p[0]) >= 2 and p[0] != p[1]):
            fixes.append([p[0], p[1]])
    out["fixes"] = fixes

    chs = sorted({clampt(c.get("t"), dur): str(c.get("title", ""))[:20]
                  for c in d.get("chapters", []) if isinstance(c, dict)}.items())
    out["chapters"] = [{"t": t, "title": ti} for t, ti in chs if ti]

    keys = []
    for k in d.get("keys", []):
        if not isinstance(k, dict):
            continue
        a, b = clampt(k.get("a"), dur), clampt(k.get("b"), dur)
        if b > a:
            keys.append({"a": a, "b": b, "why": str(k.get("why", ""))[:40]})
    keys.sort(key=lambda x: x["a"])
    merged: list[dict] = []          # 區間重疊會讓字幕上色錯亂，收斂成不重疊
    for k in keys:
        if merged and k["a"] <= merged[-1]["b"]:
            merged[-1]["b"] = max(merged[-1]["b"], k["b"])
        else:
            merged.append(k)
    keys = merged
    out["keys"] = sorted(keys, key=lambda x: x["a"])

    snaps = []
    for s in d.get("snaps", []):
        if isinstance(s, dict):
            t = clampt(s.get("t"), dur)
            if t:
                snaps.append({"t": t, "cap": str(s.get("cap", ""))[:40]})
    out["snaps"] = sorted(snaps, key=lambda x: x["t"])[:SNAP_LIMIT]

    m = d.get("map") or {}

    def clean_compare(c):
        """比較表：欄列數必須一致，否則渲染會破。不合格就丟掉而不是硬補空格。"""
        if not isinstance(c, dict):
            return None
        cols = [str(x) for x in (c.get("cols") or [])]
        rows = [[str(y) for y in r] for r in (c.get("rows") or []) if isinstance(r, list)]
        rows = [r for r in rows if len(r) == len(cols)]
        if len(cols) < 2 or not rows:
            return None
        return {"title": str(c.get("title", ""))[:40], "cols": cols, "rows": rows}

    concepts = []
    for c in m.get("concepts", []):
        if not isinstance(c, dict) or not c.get("name"):
            continue
        fs = []
        for f in (c.get("formulas") or []):
            if isinstance(f, dict) and f.get("tex"):
                fs.append({"tex": str(f["tex"]).strip("$ "),
                           "name": str(f.get("name", ""))[:24],
                           "when": str(f.get("when", ""))[:28]})
        c = {**c, "formulas": fs[:3], "compare": clean_compare(c.get("compare"))}
        concepts.append(c)

    pit = []
    for p in m.get("pitfalls", []):
        if isinstance(p, dict) and p.get("wrong") and p.get("right"):
            pit.append({"wrong": str(p["wrong"])[:70], "right": str(p["right"])[:70],
                        "why": str(p.get("why", ""))[:40]})
        elif isinstance(p, str) and p.strip():      # 舊格式相容：純文字視為提醒
            pit.append({"wrong": "", "right": p.strip()[:70], "why": ""})

    out["map"] = {
        "tldr": [str(x) for x in m.get("tldr", [])][:8],
        "concepts": concepts,
        "flow": str(m.get("flow", "")),
        "examples": [{**e, "t": clampt(e.get("t"), dur), "snap": clampt(e.get("snap"), dur),
                      "trigger": str(e.get("trigger", ""))[:40]}
                     for e in m.get("examples", []) if isinstance(e, dict)],
        "playbook": [{"trigger": str(p.get("trigger", ""))[:40], "method": str(p.get("method", ""))[:40]}
                     for p in (m.get("playbook") or []) if isinstance(p, dict) and p.get("trigger")],
        "pitfalls": pit,
    }
    return out


# ---------- 副產品 ----------

def lint_map(m: dict) -> list[str]:
    """v2 圖表契約的軟檢查：只警告不擋。累積的警告是下次改 prompt 的依據。"""
    warns: list[str] = []
    charts = [("flow", m.get("flow", ""))] + [
        (f"concepts[{i}] {c.get('name','')}", c.get("mermaid", ""))
        for i, c in enumerate(m.get("concepts", []))]
    for where, src in charts:
        if not src:
            continue
        # 只算節點宣告：識別字後面接括號的那種（A["x"] / A{"x"} / A(("x")) / A[["x"]]）。
        # 早期版本用「所有引號字串」去數，把邊標籤 -->|"是"| 也算進來，
        # 於是一張 10 節點的乾淨決策樹被誤報成 17 節點——反而會誘導我去拆好圖。
        nodes = re.findall(r'(?:^|\s)[A-Za-z_]\w*\s*[\[\{\(]+\s*"([^"]+)"', src)
        if len(nodes) > 14:
            warns.append(f"{where}: {len(nodes)} 節點超過契約 12")
        long = [x for x in nodes if len(x) > 12]
        if long:
            warns.append(f"{where}: 節點文字過長 {long[:3]}")
        if "classDef" not in src:
            warns.append(f"{where}: 缺 classDef 顏色指派")
    total = len(m.get("tldr", []) and "".join(m["tldr"]) or "")
    for c in m.get("concepts", []):
        total += sum(len(str(c.get(k, ""))) for k in ("md", "sup", "trap"))
    for e in m.get("examples", []):
        total += len(str(e.get("md", ""))) + len(str(e.get("trap", "")))
    if total > 1800:
        warns.append(f"文字總量 {total} 超過預算 1400（寬限 1800）")
    # v3 的三項新結構：沒生出來就是 prompt 沒被遵守，要看得見
    nc = len(m.get("concepts", []))
    ncmp = sum(1 for c in m.get("concepts", []) if c.get("compare"))
    nfml = sum(1 for c in m.get("concepts", []) if c.get("formulas"))
    if nc >= 4 and ncmp == 0:
        warns.append(f"{nc} 個概念但 0 張比較表（律三要求有兩者要分辨就做表）")
    if nc >= 4 and nfml == 0:
        warns.append(f"{nc} 個概念但 0 張公式卡")
    if not m.get("playbook"):
        warns.append("缺 playbook 題型對照")
    bad = [p for p in m.get("pitfalls", []) if not p.get("wrong")]
    if bad:
        warns.append(f"{len(bad)} 條 pitfalls 沒有具體的錯誤寫法（律五要求對照式）")
    return warns


def lint_keys(keys: list[dict], dur: int) -> list[str]:
    """重點時段要跟片長連動。舊版寫死 3~8 段，結果 21 支影片有 20 支剛好 8 段——
    模型在湊配額而不是在判斷，該標的塞不下（少標）、湊滿數又補邊緣內容（多標）。"""
    if not dur or not keys:
        return []
    warns = []
    want = max(3, round(dur / 60 / 9))
    if len(keys) < want * 0.5:
        warns.append(f"重點只有 {len(keys)} 段，片長 {dur//60} 分建議約 {want} 段（疑似少標）")
    cov = sum(k["b"] - k["a"] for k in keys) / dur * 100
    if cov < 25:
        warns.append(f"重點覆蓋率 {cov:.0f}%，偏低（目標 35~55%）")
    elif cov > 65:
        warns.append(f"重點覆蓋率 {cov:.0f}%，偏高（目標 35~55%）")
    return warns


def apply_to_vtt(vtt: Path, fixes: list[list[str]], keys: list[dict]) -> None:
    """勘誤字面替換＋重點時段 <c.key> 標記。可重複執行（先剝舊標記）。"""
    text = vtt.read_text(encoding="utf-8")
    text = text.replace("<c.key>", "").replace("</c>", "")
    for bad, good in fixes:
        text = text.replace(bad, good)
    lines = text.splitlines()
    out: list[str] = []
    hot = False
    for ln in lines:
        m = TS.match(ln)
        if m:
            g = [int(x) for x in m.groups()[:4]]
            start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
            hot = any(k["a"] <= start <= k["b"] for k in keys)
            out.append(ln)
        elif hot and ln.strip() and "-->" not in ln and ln != "WEBVTT":
            out.append(f"<c.key>{ln}</c>")
        else:
            out.append(ln)
    tmp = vtt.with_suffix(".vtt.tmp")
    tmp.write_text("\n".join(out) + "\n", encoding="utf-8")
    tmp.replace(vtt)


def extract_snaps(mp4: Path, snaps: list[dict]) -> int:
    n = 0
    for s in snaps:
        dest = mp4.with_name(f"{mp4.stem}.snap_{s['t']}.jpg")
        if dest.exists():
            continue
        r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error",
                            "-ss", str(s["t"]), "-i", str(mp4),
                            "-frames:v", "1", "-q:v", "3", "-y", str(dest)],
                           capture_output=True, text=True, timeout=120)
        if r.returncode == 0 and dest.exists():
            n += 1
        else:
            log(f"  快照 {s['t']}s 失敗：{(r.stderr or '')[:80]}")
    return n


def rebuild_fixes(state: dict) -> dict[str, int]:
    """從所有 notes.json 重建勘誤飛輪，格式 {科目: {誤: [正, 幾支影片提過]}}。

    分兩層防護：
    ① 按科目分桶——「志工→資工」在線代裡對，套到多益是災難。
    ② 只有「兩支以上影片各自獨立提出」的規則才會被 make_subs.py 套用。
       單支提出的留在檔案裡（n=1）但不生效：系統性的聽錯會在不同堂課重複出現，
       一次性的多半是那堂課的上下文產物。實例：線代 05 一支就吐 326 條，裡面
       混進「反正→反證」——「反正」是老師口頭禪，全庫 85 次，無條件替換會安靜
       毀掉教材而且事後查不出來。
    """
    votes: dict[str, dict[str, dict[str, int]]] = {}
    for v in state.values():
        if not v.get("path"):
            continue
        notes = Path(v["path"]).with_suffix(".notes.json")
        if not notes.exists():
            continue
        try:
            d = json.loads(notes.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        subj = v.get("series", "").split("/")[0]
        for pair in d.get("fixes", []):
            if isinstance(pair, (list, tuple)) and len(pair) == 2:
                bad, good = pair
                votes.setdefault(subj, {}).setdefault(bad, {})
                votes[subj][bad][good] = votes[subj][bad].get(good, 0) + 1
    out: dict[str, dict[str, list]] = {}
    stat: dict[str, int] = {}
    for subj, rules in votes.items():
        bucket = {}
        for bad, goods in rules.items():
            good, n = max(goods.items(), key=lambda kv: kv[1])
            bucket[bad] = [good, n]
        out[subj] = dict(sorted(bucket.items(), key=lambda kv: -kv[1][1]))
        stat[subj] = sum(1 for g, n in out[subj].values() if n >= 2)
    FIXES_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=1),
                          encoding="utf-8")
    return stat


def rebuild_index(state: dict) -> None:
    """所有 .vtt → 20 秒窗的全文索引，網站搜尋用。"""
    bypath = {v["path"]: v for v in state.values() if v.get("path")}
    vids = []
    for vtt in sorted(OUT_ROOT.rglob("*.vtt")):
        mp4 = vtt.with_suffix(".mp4")
        meta = bypath.get(str(mp4))
        if not meta:
            continue
        windows: list[list] = []
        wstart, wtxt = None, []
        for a, _b, t in vtt_cues(vtt):
            if wstart is None:
                wstart = a
            wtxt.append(t)
            if a - wstart >= 20 or sum(len(x) for x in wtxt) > 90:
                windows.append([int(wstart), " ".join(wtxt)])
                wstart, wtxt = None, []
        if wtxt:
            windows.append([int(wstart or 0), " ".join(wtxt)])
        vids.append({"code": meta["code"], "title": meta.get("title", ""),
                     "rel": mp4.relative_to(OUT_ROOT).as_posix(),
                     "cues": windows})
    INDEX_FILE.write_text(json.dumps(
        {"updated": time.strftime("%Y-%m-%d %H:%M"), "videos": vids},
        ensure_ascii=False), encoding="utf-8")
    log(f"搜尋索引重建：{len(vids)} 支影片 → {INDEX_FILE.name}"
        f"（{INDEX_FILE.stat().st_size // 1024} KB）")


# ---------- 主流程 ----------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", default="")
    ap.add_argument("--only-file", default="",
                    help="從 UTF-8 檔案讀 --only 的清單（逗號或換行分隔，# 開頭是註解）。"
                         "中文代號當命令列參數傳會被 Windows 字碼頁改寫：cp950 主控台讀 UTF-8 bat "
                         "會把「電子」的位元組讀錯，一支都對不上；.bat 又不能 chcp（切碼頁後 cmd 重讀"
                         "檔案會錯位吃字，2026-09-05 實測）。把中文放進檔案、bat 保持純 ASCII 才穩。")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--index-only", action="store_true")
    ap.add_argument("--dry", action="store_true", help="只列清單不執行")
    ap.add_argument("--model", default="", help="覆寫模型（預設 opus[1m]），用於 A/B 比較")
    ap.add_argument("--effort", default="", help="覆寫思考強度（預設 xhigh）")
    args = ap.parse_args()
    global NOTES_MODEL, NOTES_EFFORT
    if args.model:
        NOTES_MODEL = args.model
    if args.effort:
        NOTES_EFFORT = args.effort

    state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    if args.index_only:
        rebuild_index(state)
        return 0

    cwmap = chapter_week_map()
    only_src = args.only
    if args.only_file:
        with open(args.only_file, encoding="utf-8-sig") as fh:
            scope_lines = [ln.split("#", 1)[0].strip() for ln in fh]
        only_src = ",".join([only_src] + [ln for ln in scope_lines if ln])
    onlys = [s.strip() for s in only_src.split(",") if s.strip()]
    todo = []
    for v in state.values():
        if v.get("status") != "done" or not v.get("path"):
            continue
        mp4 = Path(v["path"])
        vtt = mp4.with_suffix(".vtt")
        notes = mp4.with_suffix(".notes.json")
        if not mp4.exists() or not vtt.exists():
            continue
        if onlys and not any(o in v["code"] or o in norm(v["code"]) for o in onlys):
            continue
        if notes.exists() and not args.force:
            continue
        week = cwmap.get(norm(v["code"]), ("", 9))[1]
        todo.append((week, v["code"], v, mp4, vtt, notes))
    todo.sort(key=lambda x: (x[0], x[1]))
    if args.limit:
        todo = todo[:args.limit]
    log(f"待產思考地圖 {len(todo)} 支")
    for week, _c, v, *_ in todo:
        log(f"  W{week} {v['code']}｜{v.get('title', '')[:30]}")
    if args.dry or not todo:
        return 0

    done = thin = 0
    for week, _c, v, mp4, vtt, notes in todo:
        log(f"▶ [{done + 1}/{len(todo)}] {v['code']}（W{week}）")
        t0 = time.time()
        try:
            cues = vtt_cues(vtt)
            prompt = build_prompt(v, cues, cwmap.get(norm(v["code"])))
            log(f"  逐字稿 {len(cues)} 句、prompt {len(prompt) // 1000}k 字，呼叫 claude -p …")
            raw = call_claude(prompt)
            try:
                data = extract_json(raw)
            except (ValueError, json.JSONDecodeError) as e1:
                log(f"  第一次輸出不是合法 JSON（{str(e1)[:60]}），重試一次")
                retry_hint = ("\n\n（再次強調：只輸出 JSON 物件本身，"
                              "不要 markdown 圍欄、不要任何前後說明文字）")
                raw2 = call_claude(prompt + retry_hint)
                try:
                    data = extract_json(raw2)
                except (ValueError, json.JSONDecodeError):
                    # 存下原始輸出，否則下次只看得到一行錯誤訊息，完全無從查起
                    code_n = norm(v["code"])
                    for tag, blob in (("1", raw), ("2", raw2)):
                        (OUT_ROOT / f"_rawnotes_{code_n}_{tag}.txt").write_text(
                            blob or "(空)", encoding="utf-8")
                    log(f"  原始輸出已存到 _rawnotes_{code_n}_*.txt 供查驗")
                    raise
            dur = int(v.get("sec") or (cues[-1][1] if cues else 0))
            data = validate(data, dur)
            data["code"] = v["code"]
            data["dur"] = dur
            data["by"] = f"{NOTES_MODEL}/{NOTES_EFFORT}"   # 日後品質有落差時查得出是誰做的
            data["pv"] = 3                                  # 3=比較表＋決策樹＋錯誤對照＋公式卡＋題型索引
            if not data["chapters"] and not data["keys"] and not data["map"]["concepts"]:
                (OUT_ROOT / f"_rawnotes_{norm(v['code'])}_thin.txt").write_text(
                    raw or "(空)", encoding="utf-8")
                raise ThinResult("章節、重點、概念全空")
            for w in lint_map(data["map"]) + lint_keys(data["keys"], dur):
                log(f"  ⚠ 契約：{w}")
            tmp = notes.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1),
                           encoding="utf-8")
            tmp.replace(notes)
            apply_to_vtt(vtt, data["fixes"], data["keys"])
            ns = extract_snaps(mp4, data["snaps"])
            log(f"  ✓ {time.time() - t0:.0f}s：章節 {len(data['chapters'])}"
                f"・重點 {len(data['keys'])}・例題 {len(data['map']['examples'])}"
                f"・勘誤 {len(data['fixes'])}・快照 {ns}/{len(data['snaps'])}")
            done += 1
        except QuotaExhausted as exc:
            log(f"  ✗ API 額度用完：{exc}")
            log(f"  → 停止本批（還有 {len(todo)-done} 支未做）。額度恢復後重跑即可續做。")
            break
        except ThinResult as exc:
            log(f"  ✗ 產出是空的（{exc}），不寫檔；原始輸出見 "
                f"_rawnotes_{norm(v['code'])}_thin.txt")
            log("  → 這支仍留在待產清單，下次重跑會再試一次")
            thin += 1
        except Exception as exc:  # noqa: BLE001
            log(f"  ✗ 失敗：{str(exc)[:200]}")
    rebuild_index(state)
    stat = rebuild_fixes(state)
    log(f"勘誤飛輪重建：{ {k: f'{v} 條生效' for k, v in stat.items()} }（需 2 支以上影片各自提過）")
    log(f"完成 {done}/{len(todo)}" + (f"（{thin} 支產出是空的，未寫檔）" if thin else ""))
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
