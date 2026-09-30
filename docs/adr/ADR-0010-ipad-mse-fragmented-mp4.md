# ADR-0010：iPad 上的影片播放改走 MediaSource（fragmented MP4 重新封裝）

- 日期：2026-09-04
- 狀態：**採納**（使用者裁定「做 MSE：77 支重新封裝、重傳 67 GB、新寫播放路徑」）
- 承接：ADR-0009（教材隨 Pages 部署、影片永不進 Cloudflare）、docs/影片上雲.md §10 L3

## 問題

L3 的設計是 `<video src="/drive/<fileId>">`，由 Service Worker 攔下、加 Google 權杖、
把 Google 的 206 原封轉回。桌機 Chrome 驗證通過。

**iPad 上一律失敗（MEDIA_ERR_SRC_NOT_SUPPORTED，錯誤 4）。** 實證：不經過 SW 直接對
`/drive/<id>` 打請求，Cloudflare 回的是 `200 text/html`（index.html 的 SPA fallback）——
`<video>` 拿到一份 HTML。結論：**WebKit 讓媒體元素的載入走系統層，不受 Service Worker 管轄。**
這不是設定問題，改不動。

後果：iPad 只能退到 Google 的 `/preview` iframe。思考地圖與章節目錄我們用右欄補回了
（它們是我們自己的 DOM），但**點章節跳轉、倍速、續播記憶、站內字幕**要控制影片元素，
跨來源的 iframe 做不到。

## 考慮過的路

| 路 | 結果 |
|---|---|
| 接受 Google 播放器 ＋ 我們的右欄 | 可用，但上面四樣永久失去。使用者不接受。 |
| Cloudflare Worker 當代理串流 | **否決**：違反「影片永不進 Cloudflare」鐵則；67 GB 也會撞 Workers 限額 |
| Drive 檔案設「知道連結的任何人」直連 | **否決**：課程影片公開；大檔還有病毒掃描攔截頁、Range 支援不穩 |
| **MediaSource：頁面 `fetch()` 分段餵 SourceBuffer** | **採納**。頁面的 fetch **會**經過 SW（帶得了權杖）；`<video>` 拿的是 blob:，不再對外請求 |

## 設計

1. **重新封裝**（`scripts/remux-frag.py`）：MSE 只吃 fragmented MP4，課程影片是一般 MP4
   （`ftyp moov free mdat`，零個 `moof`）。用 `ffmpeg -c copy -movflags frag_keyframe+empty_moov+default_base_moof`
   產 `<原檔名>.frag.mp4`，**不重編碼**。實測 1.1 GB：7–9 秒、−6 MB、1555 個片段、平均 0.7 MB、init 段 1284 bytes。
   原檔一個位元組都不動；F 槽有 783 GB，多 67 GB 無妨。
2. **索引**（同腳本產 `<原檔名>.fragidx.json`）：從每個 `moof` 的 `traf/tfdt.baseMediaDecodeTime`
   除以影像 track 的 `mdhd` timescale 得起始秒；片段長度＝`moof`＋緊接的 `mdat`。
   格式 `{"v":1,"codecs":"video/mp4; codecs=\"avc1.4D401F,mp4a.40.2\"","dur":秒,"size":bytes,"init":[0,len],"frags":[[秒,位移,長度],…]}`。
   codec 字串逐支用 ffprobe 算，不假設全庫同一套。檔尾的 `mfra` 表不在索引內（MSE 永不抓它）。
3. **兩種側車檔、兩條路**（`driveSidecar()`）：`.fragidx.json` 幾十 KB，跟其他側車檔一樣走
   `data/sidecars/` 靜態、免權杖；`.frag.mp4` 跟原影片一樣大，**走 `/drive/<id>`**，仍是「不進 Cloudflare」。
   `build-dist.mjs` 的 `VIDEO_EXT` 本來就拒收 `.mp4`，多一道保險。
4. **上傳**（`drive-upload.py`）：`.frag.mp4` 當原影片的側車檔，帳本鍵 `<代號>.frag.mp4`；
   `scan()` 跳過 `*.frag.mp4` 免得跟原影片撞代號。**預設不傳**，要 `--with-frag` 明講——
   否則每段思考地圖的自動推送會被 67 GB 卡住一整天。
5. **播放**（`driveMSEAttach()`，14-drive.js；`10-player.js` 的 `v.src=url` 改成先試它）：
   三道門——帳本有 frag＋idx／裝置有 `MediaSource` 或 `ManagedMediaSource` 且 `isTypeSupported(codecs)`／
   手上有權杖——任一沒過回 false，呼叫端照舊（桌機直接 src、iPad 預覽）。
   餵法：init 段 → 從目前時間所在片段起逐段 `Range` fetch → 緩衝到 +40 秒就歇 → seek 時 `abort()`、
   二分找片段重來 → `QuotaExceededError` 時清掉目前時間 −30 秒以前的。
   iPadOS 17.1+ 是 `ManagedMediaSource`：設 `disableRemotePlayback`、`startstreaming` 才餵、`endstreaming` 停。
   `PL_CUR` 仍鍵在原本的 Drive 網址，續播記憶不受 blob: 影響。
6. **`drivePlay()`**：iPad（`driveMediaBypassesSW()`）且 `driveMSEReady(code)` → 開 Feb 播放器；
   否則才退到 Google 預覽。

## 代價與風險（誠實版）

- 重傳 **67 GB**，熱點 0.8 MB/s 約 **24 小時**；在思考地圖補產的掃尾結束後才啟動（共用上傳鎖）。
- **需要 Drive 權杖**才拿得到位元組——這一點沒變。側車檔已改靜態，所以權杖只影響影片本體；
  iPad 擋靜默續期，一小時後仍要按一次「連結」。
- **iPadOS < 17.1** 沒有 ManagedMediaSource，舊版桌面級 Safari 的一般 MediaSource 是否可用未實測。
- **Google 的 `/preview` 對 fMP4 是否播得好**未驗證；原檔仍在 Drive，預覽照舊用原檔，不受影響。
- 位元組全部經過頁面記憶體再進 SourceBuffer；已做 +40 秒節流與 −30 秒清理，長片（3.5 小時）要看實機。

## 驗證計畫

1. 桌機瀏覽器：帳本有 08 的 frag＋idx 後，`driveSidecar(url,'.fragidx.json')` 回靜態路徑、
   `driveSidecar(url,'.frag.mp4')` 回 `/drive/`、索引可抓、`isTypeSupported` 為真、
   `driveMSEReady` 只差權杖那道門——這些不需要使用者的授權。
2. **使用者 iPad**：點 `115暑電子08` → 應開 Feb 的播放器（非 Google 框）；點章節能跳、倍速可用、
   關掉重開有續播。這一步只有本人能做。
3. 通過後才啟動其餘 76 支的 `--with-frag` 上傳。
