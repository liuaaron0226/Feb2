# -*- coding: utf-8 -*-
r"""工數各章骨架圖：一律是判斷或推導，不畫名詞分類樹"""

CD = """
  classDef core fill:#6D4FC2,stroke:#5A3FA8,color:#fff
  classDef defn fill:#2F6DB3,stroke:#265A94,color:#fff
  classDef op fill:#2E8B74,stroke:#25735F,color:#fff
  classDef warn fill:#B3402F,stroke:#942F23,color:#fff
  classDef sup fill:#7A7A7A,stroke:#5E5E5E,color:#fff,stroke-dasharray: 4 3"""

CH_FLOW = {
    "ch0": ("拿到方程的第一個動作：判型", """graph TD
  A["一個微分方程"] --> B{"自變數幾個？"}
  B -->|"一個"| C["ODE 本頁前七章"]
  B -->|"兩個以上"| D["PDE 第八章"]
  C --> E{"未知函數與其導數 都是一次且不互乘？"}
  E -->|"是"| F(("線性 有系統解法"))
  E -->|"否"| G(("非線性 只有特定型可解"))
  F --> H{"係數長什麼樣？"}
  H -->|"常數"| I[["特徵方程法"]]
  H -->|"x 的冪次"| J[["Cauchy-Euler"]]
  H -->|"其他函數"| K[["級數解"]]
  G --> L["白努利 Riccati Clairaut 各有招"]
""" + CD + """
  class A,C,D defn
  class B,E,H op
  class F,G core
  class I,J,K,L op"""),

    "ch1": ("一階 ODE：先判是哪一型，再套對應解法", """graph TD
  A["一階 ODE 到手"] --> B{"能寫成 y' 加 Py 等於 Q 嗎？"}
  B -->|"能"| C[["線性 套積分因子公式"]]
  B -->|"不能"| D{"右端有 y 的 n 次方？"}
  D -->|"有"| E[["白努利 令 u 等於 y 的 1 減 n 次"]]
  D -->|"是 y 的二次式"| F[["Riccati 先猜特解"]]
  D -->|"都不是"| G{"能拆成純 x 乘純 y？"}
  G -->|"能"| H[["分離變數 兩端積分"]]
  G -->|"不能"| I{"每一項的 xy 總次數相同？"}
  I -->|"是"| J[["齊次 令 u 等於 y 除 x"]]
  I -->|"否"| K{"寫成 Mdx 加 Ndy 後 正合嗎？"}
  K -->|"正合"| L[["偏積分求位勢函數"]]
  K -->|"不正合"| M[["四個積分因子公式依序試"]]
""" + CD + """
  class A defn
  class B,D,G,I,K op
  class C,E,F,H,J,L,M op"""),

    "ch2": ("高階線性 ODE：齊次解加特解，兩條路各自走", """graph TD
  A["n 階線性 ODE"] --> B[["先解齊次部分 得 yh"]]
  B --> C{"係數是常數嗎？"}
  C -->|"是"| D[["特徵方程 解出根"]]
  C -->|"是 x 的冪次"| E["改走第三章 Cauchy-Euler"]
  D --> F{"根的型態？"}
  F -->|"相異實根"| G["各配一個 e 的 rx"]
  F -->|"重根"| H["多乘 x 的冪次"]
  F -->|"共軛複根"| I["化成 cos 與 sin"]
  A --> J{"右端 R 長什麼樣？"}
  J -->|"多項式 指數 三角"| K[["待定係數 猜形式"]]
  J -->|"其他或猜不出"| L[["參數變異法 永遠可用"]]
  K --> M{"猜的形式撞到齊次解？"}
  M -->|"是"| N[["乘 x 的 s 次方 s 等於重數"]]
  G --> O(("通解 yh 加 yp"))
  L --> O
""" + CD + """
  class A defn
  class C,F,J,M op
  class B,D,K,L,N op
  class E sup
  class G,H,I defn
  class O core"""),

    "ch3": ("變係數怎麼辦：換一個自變數就變回常係數", """graph TD
  A{"係數長什麼樣？"} -->|"x 的 n 次方配 n 階導數"| B[["Cauchy-Euler 型"]]
  B --> C[["令 x 等於 e 的 t 次方"]]
  C --> D["導數用鏈鎖律換算"]
  D --> E(("變成常係數 回第二章解法"))
  A -->|"不是標準冪次 但有結構"| F[["找適當的自變數變換"]]
  A -->|"已知一個齊次解"| G[["降階法 求第二解"]]
  B --> H{"輔助方程的根？"}
  H -->|"相異實根"| I["x 的 r 次方"]
  H -->|"重根"| J["多乘 ln x"]
  H -->|"複根"| K["cos 與 sin 的 ln x"]
""" + CD + """
  class A,H op
  class B,C,F,G op
  class D defn
  class E core
  class I,J,K defn"""),

    "ch4": ("Laplace：把微分方程變成代數方程", """graph TD
  A["初值問題"] -->|"兩邊取拉氏轉換"| B["代數方程 含 Y"]
  B --> C["初始條件在轉換時自動代入"]
  C --> D[["解出 Y 等於某個 s 的函數"]]
  D --> E{"分母與結構長什麼樣？"}
  E -->|"一次因式"| F[["遮蓋法拆部分分式"]]
  E -->|"s 平方加常數"| G[["配方後用第一平移"]]
  E -->|"含 e 的負 as"| H[["第二平移 延遲 a 秒"]]
  E -->|"兩個轉換相乘"| I[["摺積定理"]]
  E -->|"含 ln 或 arctan"| J[["先微分再除負 t"]]
  F --> K(("反轉換得 y of t"))
  G --> K
  H --> K
  I --> K
  J --> K
""" + CD + """
  class A defn
  class B,C defn
  class E op
  class D,F,G,H,I,J op
  class K core"""),

    "ch5": ("級數解：先看那個點是什麼點", """graph TD
  A["變係數二階 ODE"] --> B[["化成標準式 y'' 加 py' 加 qy 等於 0"]]
  B --> C{"在 x0 這點 p 與 q 解析嗎？"}
  C -->|"都解析"| D[["尋常點 直接用冪級數"]]
  C -->|"不解析"| E{"x 減 x0 乘 p 與其平方乘 q 解析嗎？"}
  E -->|"是"| F[["正則奇異點 用 Frobenius"]]
  E -->|"否"| G(("非正則奇異點 超出考試範圍"))
  F --> H[["代入求指標方程 得兩根"]]
  H --> I{"兩根的差是什麼？"}
  I -->|"非整數"| J["兩個獨立級數解"]
  I -->|"等於零 重根"| K["第二解必含 ln x"]
  I -->|"正整數"| L["第二解可能含 ln x 要驗"]
  J --> M(("Bessel 是最重要的實例"))
""" + CD + """
  class A defn
  class C,E,I op
  class B,D,F,H op
  class G warn
  class J,K,L defn
  class M core"""),

    "ch6": ("邊界值問題：從這裡開始一切都靠正交性", """graph TD
  A["二階 ODE 配條件"] --> B{"條件給在同一點還是兩點？"}
  B -->|"同一點 初值問題"| C(("解存在且唯一"))
  B -->|"兩點 邊界值問題"| D["可能無解 唯一 或無窮多解"]
  D --> E{"方程裡有待定參數 lambda？"}
  E -->|"有"| F[["這就是特徵值問題"]]
  F --> G{"lambda 大於零 等於零 小於零？"}
  G --> H[["逐一討論 找出給非零解的那種"]]
  H --> I["得特徵值與特徵函數"]
  I --> J{"能化成 SL 標準式嗎？"}
  J -->|"能"| K(("特徵函數必帶權正交"))
  K --> L[["任意分段光滑函數都能展開成級數"]]
  L --> M["第七章傅立葉與第八章 PDE 全靠這條"]
""" + CD + """
  class A defn
  class B,E,G,J op
  class C core
  class D,I defn
  class F,H,L op
  class K core
  class M sup"""),

    "ch7": ("Fourier：週期用級數，非週期用轉換", """graph TD
  A{"函數是週期的嗎？"} -->|"週期 2L"| B[["Fourier 級數 頻率離散"]]
  A -->|"非週期 整條實線"| C[["Fourier 積分與轉換 頻率連續"]]
  B --> D{"有奇偶性嗎？"}
  D -->|"偶函數"| E["只剩餘弦項 省一半計算"]
  D -->|"奇函數"| F["只剩正弦項 省一半計算"]
  D -->|"都不是"| G["兩組係數都要算"]
  B --> H{"只給了半個區間？"}
  H -->|"是"| I[["半幅展開 由邊界條件決定延拓"]]
  C --> J["微分變成乘 i omega"]
  J --> K(("把 PDE 變成 ODE"))
  I --> L(("接第八章 分離變數"))
""" + CD + """
  class A,D,H op
  class B,C,I,J op
  class E,F,G defn
  class K,L core"""),

    "ch8": ("PDE：先判型，再走同一套五步驟", """graph TD
  A["二階線性 PDE"] --> B{"判別式 B 平方減 4AC"}
  B -->|"等於零"| C(["拋物型 熱傳導"])
  B -->|"大於零"| D(["雙曲型 波動"])
  B -->|"小於零"| E(["橢圓型 Laplace"])
  C --> F["時間部分 指數衰減"]
  D --> G["時間部分 三角振盪"]
  E --> H["另一方向 雙曲函數"]
  F --> I{"方程與邊界都齊次嗎？"}
  G --> I
  H --> I
  I -->|"否"| J[["先拆穩態加暫態做齊次化"]]
  J --> I
  I -->|"是"| K[["分離變數五步驟"]]
  K --> L(("係數就是初始函數的傅立葉係數"))
""" + CD + """
  class A defn
  class B,I op
  class C,D,E defn
  class F,G,H defn
  class J,K op
  class L core"""),
}
