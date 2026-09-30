# -*- coding: utf-8 -*-
"""產生 merge-golden.json：用**正在服役的 Python merge_progress()** 跑出黃金答案，
給 tests/cloud-merge.test.js 逐位元組比對雲端 JS 移植版。

為什麼要黃金檔而不是在 JS 裡重寫一份斷言：
自己寫的斷言只能證明「JS 做了我以為它該做的事」，證不了「JS 和 Python 做同一件事」。
把 Python 的實際輸出釘成檔案，兩邊的分歧才會自己跳出來。

時間凍結：merge_progress() 汰除 90 天前的時戳時會讀 time.time()，
不凍住的話黃金檔每天都會變。這裡把它釘在 NOW，JS 那側用同一個毫秒數。

**資料紀律**：語料全部是合成的。不讀 data/progress.json——真實備考進度不進 repo，
那是「個人進度永遠不公開」這條鐵則的一部分，測試也不例外。

用法（只在合併規則改動時才需要重跑）：
    python tests/fixtures/gen-merge-golden.py
"""
import importlib.util
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "merge-golden.json"
# 服役中的媒體伺服器，含 T20 的 merge_progress()
SERVE_MEDIA = Path(r"C:\Users\User\Desktop\claude\istudy-private-backup\tools\serve_media.py")

# 2026-09-02T00:00:00Z。汰除切點＝這天往回 90 天＝2026-06-04T00:00:00
NOW_MS = 1788307200000
time.time = lambda: NOW_MS / 1000.0        # 凍結（merge_progress 只用它算切點）


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


SM = load("sm_after", SERVE_MEDIA)

CASES = []


def rec(label, a, b):
    """跑一次合併並記錄。Python 自己炸掉的組合（型別不可比）也要記——
    JS 移植版必須在同一個地方以同一個理由炸，那也是行為的一部分。"""
    entry = {"label": label, "a": a, "b": b}
    try:
        entry["expect"] = SM.merge_progress(a, b)
    except Exception as e:                       # noqa: BLE001
        entry["raises"] = type(e).__name__
    CASES.append(entry)
    return entry.get("expect")


# ---------------------------------------------------------------- A) 舊 payload 相容
# 合成語料（對照 t20/test_merge.py 的 synth，去掉會讀真實進度檔的那幾筆）
LEGACY = {
    "空": {},
    "只有 updated": {"updated": "2026-08-01T00:00:00.000Z"},
    "無 review": {"watched": {"a1": "2026-08-01"}, "done": {"c1": "2026-08-02"},
                  "miss": {"c1": 3}, "target": ["ntu|甲組"],
                  "playpos": {"u": {"t": 5, "pct": 10, "at": "2026-08-01"}},
                  "updated": "2026-08-03T00:00:00.000Z"},
    "值型別怪": {"watched": {"a1": 7, "a2": "2026-08-09"}, "done": {},
                 "miss": {"c1": "x", "c2": 2}, "target": ["z", "a"],
                 "updated": "2026-08-05T00:00:00.000Z"},
    "有 review": {"done": {"c1": "2026-07-30"}, "miss": {"c1": 1},
                  "review": {"cards": [{"id": "控001", "subject": "ctrl", "page": "12",
                                        "createdAt": "2026-08-01",
                                        "history": [{"date": "2026-08-20", "result": "pass"}]}]},
                  "updated": "2026-08-21T00:00:00.000Z"},
    "缺鍵": {"done": {"c9": "2026-08-11"}},
    "playpos 同日不同 pct": {"playpos": {"u": {"t": 90, "dur": 600, "pct": 15, "at": "2026-08-01"}},
                             "updated": "2026-08-02T00:00:00.000Z"},
    "review 兩張卡": {"review": {"cards": [
        {"id": "電002", "subject": "elec", "page": "7", "createdAt": "2026-08-05",
         "history": [{"date": "2026-08-08", "result": "A"},
                     {"date": "2026-08-08", "result": "pass"}]},
        {"id": "控001", "subject": "ctrl", "page": "99", "createdAt": "2026-07-01",
         "history": [{"date": "2026-08-20", "result": "pass"},
                     {"date": "2026-08-25", "result": "C"}]}]},
        "updated": "2026-08-26T00:00:00.000Z"},
}
for na, a in LEGACY.items():
    for nb, b in LEGACY.items():
        rec(f"A/{na} × {nb}", a, b)

# ---------------------------------------------------------------- B) 四欄位雙裝置模擬
T1 = "2026-09-01T10:00:00.000Z"     # A 裝置設定
T2 = "2026-09-01T11:00:00.000Z"     # B 裝置取消（較新）
T3 = "2026-09-01T12:00:00.000Z"

FIELDS = [
    ("done", "elec-bjt-dc", "2026-09-01"),
    ("watched", "115春電子01", "2026-09-01"),
    ("miss", "math-laplace", 4),
    ("target", "ntu|甲組", None),
]


def dev(field, key, val, present, stamp, updated):
    p = {"watched": {}, "done": {}, "miss": {}, "playpos": {}, "target": [],
         "edits": {}, "updated": updated}
    if present:
        if field == "target":
            p["target"] = [key]
        else:
            p[field][key] = val
    if stamp:
        p["edits"][field + ":" + key] = stamp
    return p


for field, key, val in FIELDS:
    # B) 設定 → 取消（較新戳）→ 舊值回灌 → 再同步
    srv = rec(f"B/{field}/1 設定", {}, dev(field, key, val, True, T1, T1))
    srv = rec(f"B/{field}/2 取消", srv, dev(field, key, val, False, T2, T2))
    srv3 = rec(f"B/{field}/3 A 舊值回灌", srv, dev(field, key, val, True, T1, T1))
    rec(f"B/{field}/4 再同步", srv3, dev(field, key, val, False, T2, T2))

    # B2) 反序：先刪，之後在另一台重新加入（更新的戳）
    s = rec(f"B2/{field}/1", {}, dev(field, key, val, True, T1, T1))
    s = rec(f"B2/{field}/2 刪", s, dev(field, key, val, False, T2, T2))
    s = rec(f"B2/{field}/3 重加", s, dev(field, key, val, True, T3, T3))
    rec(f"B2/{field}/4 舊刪除戳回灌", s, dev(field, key, val, False, T2, T2))

    # B3) 舊裝置（完全無 edits 鍵）抱著舊值回灌
    s = rec(f"B3/{field}/1", {}, dev(field, key, val, True, T1, T1))
    s = rec(f"B3/{field}/2 刪", s, dev(field, key, val, False, T2, T2))
    legacy = dev(field, key, val, True, None, T1)
    del legacy["edits"]
    rec(f"B3/{field}/3 舊裝置回灌", s, legacy)

# B4) 值的語意
rec("B4/done 兩側都在留較早日期",
    {"done": {"c1": "2026-08-01"}, "edits": {"done:c1": T1}},
    {"done": {"c1": "2026-09-01"}, "edits": {"done:c1": T2}})
rec("B4/miss 下修 5→3",
    {"miss": {"c1": 5}, "edits": {"miss:c1": T1}},
    {"miss": {"c1": 3}, "edits": {"miss:c1": T2}})
rec("B4/miss 無戳照舊取大", {"miss": {"c1": 5}}, {"miss": {"c1": 3}})
rec("B4/miss 無戳字串值", {"miss": {"c1": "5"}}, {"miss": {"c1": "3"}})
rec("B4/miss 歸零（新戳側刪掉）",
    {"miss": {"c1": 5}, "edits": {"miss:c1": T1}},
    {"miss": {}, "edits": {"miss:c1": T2}})

# B5) 汰除與壞資料
OLD = "2026-01-01T00:00:00.000Z"     # 遠早於 90 天
rec("B5/90 天前的戳被汰除",
    {"done": {"c1": "2026-01-01"}, "edits": {"done:c1": OLD}},
    {"done": {}, "edits": {"done:c1": OLD}})
rec("B5/亂字串當作沒戳",
    {"done": {"c1": "2026-08-01"}, "edits": {"done:c1": "zzz"}},
    {"done": {}, "edits": {}})
rec("B5/edits 不是 dict",
    {"done": {"c1": "2026-08-01"}, "edits": "壞掉"},
    {"done": {}, "edits": None})
rec("B5/edits 值不是字串",
    {"done": {"c1": "2026-08-01"}, "edits": {"done:c1": 12345}},
    {"done": {}, "edits": {}})

# B6) 同一次操作多鍵與跨欄位混合
s = rec("B6/全選三個目標", {},
        {"target": ["a", "b", "c"],
         "edits": {"target:a": T1, "target:b": T1, "target:c": T1}, "updated": T1})
rec("B6/取消其中兩個", s,
    {"target": ["b"],
     "edits": {"target:a": T2, "target:b": T1, "target:c": T2}, "updated": T2})
rec("B6/跨欄位混合",
    {"done": {"c1": "2026-08-01", "c2": "2026-08-02"}, "watched": {"v1": "2026-08-01"},
     "miss": {"c1": 2}, "target": ["ntu|甲組", "ncu|智慧系統組"],
     "playpos": {"u1": {"t": 10, "dur": 100, "pct": 10, "at": "2026-08-01"}},
     "review": {"cards": [{"id": "控001", "subject": "ctrl", "page": "3",
                           "createdAt": "2026-08-01",
                           "history": [{"date": "2026-08-10", "result": "pass"}]}]},
     "edits": {"done:c1": T1, "target:ntu|甲組": T1},
     "updated": T1},
    {"done": {"c2": "2026-07-30", "c3": "2026-08-09"}, "watched": {"v1": "2026-07-28", "v2": "2026-08-11"},
     "miss": {"c1": 5, "c4": 1}, "target": ["ncu|智慧系統組"],
     "playpos": {"u1": {"t": 90, "dur": 100, "pct": 90, "at": "2026-08-03"},
                 "u2": {"t": 5, "dur": 50, "pct": 10, "at": "2026-08-02"}},
     "review": {"cards": [{"id": "控001", "subject": "ctrl", "page": "4",
                           "createdAt": "2026-07-20",
                           "history": [{"date": "2026-08-10", "result": "pass"},
                                       {"date": "2026-08-13", "result": "B"}]},
                          {"id": "數007", "subject": "math", "page": "20",
                           "createdAt": "2026-08-12", "history": []}]},
     "edits": {"done:c1": T2, "target:ntu|甲組": T2},
     "updated": T2})

# B7) playpos 的三條規則
rec("B7/playpos at 較新者勝",
    {"playpos": {"u": {"t": 10, "dur": 100, "pct": 10, "at": "2026-08-01"}}},
    {"playpos": {"u": {"t": 90, "dur": 100, "pct": 90, "at": "2026-08-05"}}})
rec("B7/playpos 同日取 pct 大",
    {"playpos": {"u": {"t": 10, "dur": 100, "pct": 10, "at": "2026-08-01"}}},
    {"playpos": {"u": {"t": 90, "dur": 100, "pct": 90, "at": "2026-08-01"}}})
rec("B7/playpos 同日 pct 較小不動",
    {"playpos": {"u": {"t": 90, "dur": 100, "pct": 90, "at": "2026-08-01"}}},
    {"playpos": {"u": {"t": 10, "dur": 100, "pct": 10, "at": "2026-08-01"}}})
rec("B7/playpos 舊的 at 較舊不動",
    {"playpos": {"u": {"t": 90, "dur": 100, "pct": 90, "at": "2026-08-09"}}},
    {"playpos": {"u": {"t": 10, "dur": 100, "pct": 10, "at": "2026-08-01"}}})

# B8) review 的合併細節
rec("B8/review history 聯集去重＋同日失敗碼排後",
    {"review": {"cards": [{"id": "控001", "subject": "ctrl", "page": "1",
                           "createdAt": "2026-08-01",
                           "history": [{"date": "2026-08-10", "result": "pass"},
                                       {"date": "2026-08-20", "result": "pass"}]}]},
     "updated": "2026-08-21T00:00:00.000Z"},
    {"review": {"cards": [{"id": "控001", "subject": "ctrl", "page": "2",
                           "createdAt": "2026-07-15",
                           "history": [{"date": "2026-08-20", "result": "A"},
                                       {"date": "2026-08-10", "result": "pass"}]}]},
     "updated": "2026-08-25T00:00:00.000Z"})
rec("B8/review a 較新時 page 留 a",
    {"review": {"cards": [{"id": "控001", "subject": "ctrl", "page": "1",
                           "createdAt": "2026-08-01", "history": []}]},
     "updated": "2026-08-30T00:00:00.000Z"},
    {"review": {"cards": [{"id": "控001", "subject": "ctrl", "page": "2",
                           "createdAt": "2026-08-01", "history": []}]},
     "updated": "2026-08-25T00:00:00.000Z"})
rec("B8/review 只有 b 有（舊伺服器不得洗掉新卡）",
    {"done": {"c1": "2026-08-01"}, "updated": "2026-08-01T00:00:00.000Z"},
    {"review": {"cards": [{"id": "數007", "subject": "math", "page": "20",
                           "createdAt": "2026-08-12", "history": []}]},
     "updated": "2026-08-13T00:00:00.000Z"})
rec("B8/review 只有 a 有（沒帶 review 的舊 payload 不得洗掉）",
    {"review": {"cards": [{"id": "數007", "subject": "math", "page": "20",
                           "createdAt": "2026-08-12", "history": []}]},
     "updated": "2026-08-13T00:00:00.000Z"},
    {"done": {"c1": "2026-08-01"}, "updated": "2026-08-20T00:00:00.000Z"})
rec("B8/review 壞卡（無 id／非 dict）被濾掉",
    {"review": {"cards": [{"id": "控001", "page": "1", "createdAt": "2026-08-01", "history": []},
                          {"page": "2"}, "壞掉", None]},
     "updated": "2026-08-13T00:00:00.000Z"},
    {"review": {"cards": []}, "updated": "2026-08-01T00:00:00.000Z"})

# B9) 頂層純量的 last-writer-wins
rec("B9/b 較新 → b 的純量覆蓋",
    {"updated": "2026-08-01T00:00:00.000Z", "note": "舊", "onlyA": 1},
    {"updated": "2026-08-09T00:00:00.000Z", "note": "新", "onlyB": 2})
rec("B9/a 較新 → 只補 b 獨有的鍵",
    {"updated": "2026-08-09T00:00:00.000Z", "note": "新", "onlyA": 1},
    {"updated": "2026-08-01T00:00:00.000Z", "note": "舊", "onlyB": 2})

payload = {"now": NOW_MS, "cutoff": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(NOW_MS / 1000.0 - 90 * 86400)),
           "source": str(SERVE_MEDIA), "cases": CASES}
OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
raises = sum(1 for c in CASES if "raises" in c)
print(f"{len(CASES)} 組（其中 {raises} 組 Python 自己丟例外）→ {OUT}")
