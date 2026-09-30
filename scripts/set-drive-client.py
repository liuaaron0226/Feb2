# -*- coding: utf-8 -*-
"""把 Google OAuth 用戶端 ID 寫進 data/drive-client.json。

為什麼要一支腳本而不是叫使用者自己開檔案改：那個 JSON 只有一個欄位，
但改壞了（少一個引號、存成 BIG5）症狀是「雲端播放按鈕整個不出現」，
而那跟「還沒設定」長得一模一樣，除錯成本遠大於寫這 30 行。

用法：python scripts/set-drive-client.py 1234567890-abcdef.apps.googleusercontent.com
"""
import json
import re
import sys
from pathlib import Path

# Windows 主控台預設 cp950，印不出 U+2713 之類的字元會直接拋 UnicodeEncodeError——
# 寫入已經成功卻回非零退出碼，看起來像失敗。先把輸出編碼釘死。
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TARGET = Path(__file__).resolve().parent.parent / "data" / "drive-client.json"
# Google 的 Web 用戶端 ID 一律長這樣。先擋一次，免得把「專案編號」或
# 「用戶端密鑰」貼進來——那兩個貼進去不會報錯，只會在瀏覽器裡靜靜失敗。
PATTERN = re.compile(r"^[0-9]+-[0-9a-z]+\.apps\.googleusercontent\.com$")


def main(argv):
    if len(argv) != 1:
        print(__doc__)
        return 2
    cid = argv[0].strip()
    if cid.startswith("GOCSPX-"):
        print("✗ 這是「用戶端密鑰」(client secret)，不是 ID。")
        print("  這個站是純前端，永遠不該持有密鑰——請貼結尾是")
        print("  .apps.googleusercontent.com 的那一串。")
        return 3
    if not PATTERN.match(cid):
        print(f"✗ 看起來不像 Web 用戶端 ID：{cid[:60]}")
        print("  正確格式：1234567890-abcdefghij.apps.googleusercontent.com")
        return 3
    TARGET.write_text(json.dumps({"client_id": cid}, ensure_ascii=False) + "\n",
                      encoding="utf-8")
    print(f"✓ 已寫入 {TARGET}")
    print("  接著重新部署雲端站台，雲端播放就會亮起來。")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
