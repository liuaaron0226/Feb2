# iPad 煙霧測試（T03b）

> 測試全程**不影響**正在服役的 8795/8796 與真實進度：走的是第二實例（8797/8798），
> 進度寫在獨立的 `progress-dev.json`，看完就能整包丟掉。

## 前置

1. 電腦：雙擊 feb2 資料夾裡的 `start_feb_dev.bat`。黑視窗會印出 iPad 用的完整網址（含 `?k=` 通行碼）。
2. iPad 與電腦連上**同一個 iPhone 熱點**。
3. 憑證是同一張（涵蓋 172.20.10.1–14），之前信任過就不用再裝。
4. 8798 對 iPad 是新的 origin，第一次會要通行碼——直接開黑視窗印的 `?k=` 網址最省事；
   看到輸入框就貼那組舊通行碼（在 `istudy-private-backup\data\server_key.txt`）。

## 開站

Safari 開 `https://172.20.10.<電腦IP>:8798/app/`（就是黑視窗印的那行；開根路徑會自動轉進去）。

## 打勾清單

- [ ] 頁面載入**無白屏**（＝12 支 plain scripts 全數載入 OK）
- [ ] **PWA 可加入主畫面**：分享 → 加入主畫面，從圖示開啟正常（manifest use-credentials＋通行碼 cookie 沒被擋）
- [ ] **離線備妥燈**由「補檔中」轉為「離線就緒」
- [ ] **設定面板切天氣**有反應，切換與捲動順暢（無 blur／backdrop-filter 卡頓感）
- [ ] **關掉分頁重開一次**，以上仍全部正常

## rlog 驗證（電腦端看有沒有收到 iPad 的麵包屑）

iPad 網頁每次開站（與出錯）會用 sendBeacon 把診斷 POST 到伺服器的 `/log`，
伺服器逐筆追加到 `C:\Users\User\Desktop\claude\istudy-private-backup\reports\ipad.log`，
每行長這樣：`[月-日 時:分:秒] <iPad的IP> {"tag":"boot","ver":"v22",…}`。

電腦開 PowerShell 跟著看：

```powershell
Get-Content 'C:\Users\User\Desktop\claude\istudy-private-backup\reports\ipad.log' -Tail 5 -Wait -Encoding UTF8
```

iPad 開站後幾秒內應冒出一行新紀錄：`tag` 是 `boot`、IP 是 `172.20.10.x`、`ua` 含 iPad → rlog 通。
（這個檔跟服役中的 8795/8796 共用，用時間戳和 iPad 的 ua 分辨即可。）

## 掛掉怎麼辦

任何一項失敗：iPad 畫面截圖＋電腦黑視窗最後幾行一起回報，**修完才開 T04**。


---

## 最終驗收清單（T10 擴充版，改版收尾用）

早期煙霧（上面）全綠之後，切換日前在 iPad 上逐項打勾：

- [ ] PWA：Safari 開黑視窗印的 `?k=` 網址 → 加入主畫面 → 從圖示開啟全螢幕正常
- [ ] 離線備妥：狀態燈由「補檔中」轉「🟢 離線就緒」，數字合理（約 440+）
- [ ] 斷網（關熱點）重開 App：看板、思考地圖、字幕、板書快照、考題分析全可讀
- [ ] 離線從頂欄開「線代地圖」與「工數地圖」，公式與圖都有畫出來
- [ ] 天氣：設定面板切天氣有反應，切換與捲動不卡
- [ ] 播放器→VLC 交接：點影片開隨播面板，複製檔名到 VLC 找得到、章節時間對得上
- [ ] 硬碟直讀：📁 連結硬碟選 `istudy-backup` →「未下載」變可播（尾標「硬碟」），重整後再選一次仍成功
- [ ] 今日複習：工作台 RV 條出到期卡，離線抽卡 → pass／fail 記錄成功
- [ ] 重排：工具列「重排」開得起來，離線也算得出砍章建議
- [ ] 同步回寫：外面勾的完成／錯題／複習結果，回家開 App 後出現在電腦的 progress.json（dev 測試看 progress-dev.json）
- [ ] rlog：iPad 開站後幾秒，電腦 `ipad.log` 冒出 `tag=boot` 新行
- [ ] 裝置管理：訪客裝置（或無痕視窗）登入後為唯讀（狀態選單見「唯讀裝置」），電腦 `/admin` 能取名／升級／踢除
- [ ] 殼更新：改版後 iPad 重開兩次內看到新版（SW v30），教材備妥數字不歸零
