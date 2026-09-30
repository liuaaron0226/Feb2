# -*- coding: utf-8 -*-
r"""每章的骨架圖：一律是「判斷」或「因為所以」，不畫名詞分類樹"""

CLASSDEF = """
  classDef core fill:#6D4FC2,stroke:#5A3FA8,color:#fff
  classDef defn fill:#2F6DB3,stroke:#265A94,color:#fff
  classDef op fill:#2E8B74,stroke:#25735F,color:#fff
  classDef warn fill:#B3402F,stroke:#942F23,color:#fff
  classDef sup fill:#7A7A7A,stroke:#5E5E5E,color:#fff,stroke-dasharray: 4 3"""

CH_FLOW = {
    "ch0": ("證明題該怎麼下筆", """graph TD
  A{"題目要證什麼？"} -->|"兩個集合相等"| B[["雙向包含各證一次"]]
  A -->|"線性獨立"| C[["設組合為零 推只有全零解"]]
  A -->|"某物是子空間"| D[["先驗0在裡面 再驗封閉"]]
  A -->|"唯一性"| E[["設兩組表示 再證兩組相同"]]
  A -->|"結論反過來推"| F[["改寫成逆否命題"]]
  C --> G(("結論必寫只有二字"))
  B --> H(("缺一邊就不算證完"))
""" + CLASSDEF + """
  class A core
  class B,C,D,E,F op
  class G,H warn"""),

    "ch1": ("拿到 Ax=b 的第一刀", """graph TD
  A[["先算 rank A 與 rank A|b"]] --> B{"兩個 rank 相等？"}
  B -->|"否"| C(("無解"))
  B -->|"是"| D{"rank 等於未知數個數 n？"}
  D -->|"是"| E(("唯一解"))
  D -->|"否"| F(("無窮多解"))
  F --> G["自由度 = n 減 rank"]
  C --> H{"m 大於 n 且 A 行獨立？"}
  H -->|"是"| I[["改求最小平方解"]]
  I --> J["它是最佳近似 不是解"]
""" + CLASSDEF + """
  class A,I op
  class B,D,H op
  class C,E,F core
  class G,J defn"""),

    "ch2": ("從封閉性一路長到四大子空間", """graph TD
  A["兩個封閉性 加法與純量乘"] -->|"再加八條公設"| B(["向量空間"])
  B -->|"取子集合 只需驗 0 與封閉"| C(["子空間"])
  C -->|"問生得出來嗎"| D["span 生成"]
  C -->|"問有沒有多餘"| E["線性獨立"]
  D --> F{"兩者同時成立？"}
  E --> F
  F -->|"是"| G(("基底"))
  G -->|"數個數"| H(("維度"))
  H -->|"套到矩陣上"| I(("四大子空間"))
  I --> J["rank 加 nullity 等於 n"]
""" + CLASSDEF + """
  class B,C defn
  class D,E,J defn
  class F op
  class G,H,I core"""),

    "ch3": ("變換如何變成矩陣，基底一換矩陣就換", """graph TD
  A(["線性變換 T"]) -->|"取定定義域與對應域的基底"| B[["矩陣表示 T alpha beta"]]
  B --> C{"要判斷什麼？"}
  C -->|"一對一"| D["查 N T 是否只有零"]
  C -->|"映成"| E["查 rank 是否等於對應域維度"]
  C -->|"可逆"| F["兩者都要成立"]
  A -->|"換一組基底"| G[["前後夾兩個轉換矩陣"]]
  G --> H(("相似轉換 B = P inv A P"))
  H -->|"挑最好的那組基底"| I(("下一章：對角化"))
""" + CLASSDEF + """
  class A defn
  class B,G op
  class C op
  class D,E,F defn
  class H core
  class I sup"""),

    "ch4": ("能不能對角化，全看兩種重數是否相等", """graph TD
  A[["解 det A 減 lambda I 等於零"]] --> B["得到每個 lambda 的代數重數"]
  B --> C[["對每個 lambda 算 n 減 rank"]]
  C --> D["得到幾何重數"]
  D --> E{"每個 lambda 都相等嗎？"}
  E -->|"是"| F(("可對角化 A = S D S inv"))
  E -->|"否"| G(("改求 Jordan form"))
  G --> H["缺幾個補幾個廣義特徵向量"]
  F -->|"代進去"| I[["A 的高次方與 f A"]]
  H -->|"超對角補 f 微分項"| I
  I --> J(("解 X' = AX 與 e At"))
""" + CLASSDEF + """
  class A,C,I op
  class B,D,H defn
  class E op
  class F,G,J core"""),

    "ch5": ("裝上內積之後，才有垂直與最短距離", """graph TD
  A(["內積 三大公設"]) -->|"開根號"| B["範數 長度"]
  A -->|"內積為零"| C["正交 垂直"]
  B --> D["單位化"]
  C --> E{"手上的基底正交嗎？"}
  E -->|"否"| F[["Gram-Schmidt 正交化"]]
  E -->|"是"| G(("單範正交基底"))
  F --> G
  G -->|"順手就得到"| H["QR 分解"]
  G -->|"座標直接用內積算"| I["投影公式"]
  I --> J(("投影矩陣 P"))
  J -->|"方程組無解時"| K(("最小平方解"))
""" + CLASSDEF + """
  class A defn
  class B,C,D,H,I defn
  class E op
  class F op
  class G,J,K core"""),

    "ch6": ("二次型看正定，長方陣看 SVD", """graph TD
  A["拿到二次式"] -->|"先強制對稱化"| B["A 換成 A 加 A 轉置除以二"]
  B --> C{"要判什麼？"}
  C -->|"正定與否"| D{"用哪個判準？"}
  D -->|"算得動特徵值"| E["全部 lambda 大於零"]
  D -->|"矩陣小"| F["順序主子式全正"]
  C -->|"化標準式"| G[["轉主軸 x = S y"]]
  A -->|"矩陣不是方陣或不可逆"| H(("走 SVD"))
  H --> I["奇異值是 A 轉置 A 特徵值開根號"]
  I --> J(("偽反矩陣與最小平方"))
""" + CLASSDEF + """
  class A,B defn
  class C,D op
  class E,F,I defn
  class G op
  class H,J core"""),
}
