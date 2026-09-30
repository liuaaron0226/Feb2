# T08 replan 併入工作台

blocked-by: T05　｜循序原則：與其他 UI 票不得平行

## 目標
`site/replan.html`（落後重排計算器）併入讀書模式（工具列或看板側入口），
獨立頁退役。演算法原樣搬：膨脹係數、貪婪剝葉、依賴鏈鎖、跨科鎖（拉氏→控制 9/13）。

## 做法要求
- **步驟 0：先 diff** replan.html 硬編碼章節資料 vs data/sprint.json——
  飄移以 sprint.json 為準並把差異記進 commit message；併入後消滅硬編碼複本
- feb-replan-v1 完成章節狀態與看板 SP.done 打通（單一事實來源＝SP.done）
- UI 以新 token 重做；ok/warn/bad 三態語意色接 token 系統

## 驗收
演算法級對照：**對新舊兩邊注入同一份章節資料**，2–3 組輸入下砍章順序與
鎖鏈行為完全一致（資料飄移已在步驟 0 排除，不會混淆 bug 與資料差）；
SHELL_FILES 已同步。
