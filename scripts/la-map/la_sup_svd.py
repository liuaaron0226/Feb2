# -*- coding: utf-8 -*-
r"""影片未教、考試必考的補充章節（標準教科書：Strang / Friedberg）

全部用 raw string，KaTeX 的反斜線原樣保留。
每個概念的欄位與 notes.json 的 concepts 一致，另加 deep（深讀層）與 gap（缺口標記）。
"""

SVD_CONCEPTS = [
    {
        "name": "SVD 是什麼：任何矩陣都能拆成「轉、拉、轉」",
        "gap": "影片未教",
        "trap": "以為 SVD 要方陣或要可對角化——SVD 對任何 m×n 矩陣都存在，這正是它的價值",
        "formulas": [
            {"tex": r"A = U\Sigma V^{T}", "name": "奇異值分解", "when": "任何 m×n 實矩陣"},
            {"tex": r"\sigma_i = \sqrt{\lambda_i(A^{T}A)}", "name": "奇異值", "when": "λ 由大到小排"},
            {"tex": r"A = \sum_{i=1}^{r}\sigma_i\,u_i v_i^{T}", "name": "外積展開式", "when": "r=rank A，低秩近似用"},
        ],
        "compare": {
            "title": "特徵分解 vs 奇異值分解",
            "cols": ["比較軸", "特徵分解 A=SDS⁻¹", "奇異值分解 A=UΣVᵀ"],
            "rows": [
                ["適用矩陣", "只有方陣，且要可對角化", "任何 m×n，永遠存在"],
                ["兩側矩陣", "S 與 S⁻¹，一般不正交", "U、V 都是正交矩陣"],
                ["中間對角元", "λ 可為負、可為複數", "σ 一律 ≥ 0 且遞減排列"],
                ["幾何意義", "沿特徵方向伸縮", "轉 → 沿軸拉 → 再轉"],
                ["唯一性", "S 不唯一（可縮放）", "σ 唯一；U、V 在重根時不唯一"],
            ],
        },
        "md": r"""- 幾何：$Vᵀ$ 先把座標轉正，$\Sigma$ 沿軸拉伸，$U$ 再轉到輸出空間
- 單位球 $\|x\|=1$ 經過 $A$ 一定變成橢圓，半軸長就是 $\sigma_i$
- $\sigma_1=\max_{\|x\|=1}\|Ax\|$＝矩陣的「最大放大率」""",
        "mermaid": r"""graph TD
  A{"矩陣長什麼樣？"} -->|"方陣且AM=GM"| B[["特徵分解 SDS⁻¹"]]
  A -->|"方陣但重根不足"| C[["Jordan form"]]
  A -->|"長方陣或不可逆"| D[["SVD 一律可用"]]
  A -->|"對稱實矩陣"| E[["正交對角化 QDQᵀ"]]
  E -->|"再取絕對值"| D
  classDef core fill:#6D4FC2,stroke:#5A3FA8,color:#fff
  classDef op fill:#2E8B74,stroke:#25735F,color:#fff
  classDef sup fill:#7A7A7A,stroke:#5E5E5E,color:#fff,stroke-dasharray: 4 3
  class A core
  class B,C,E op
  class D sup""",
        "deep": r"""### 定理（奇異值分解，Strang §7.2）

設 $A\in\mathbb{R}^{m\times n}$，$\operatorname{rank}A=r$。則存在正交矩陣
$U\in\mathbb{R}^{m\times m}$、$V\in\mathbb{R}^{n\times n}$ 與
$\Sigma\in\mathbb{R}^{m\times n}$（僅對角線前 $r$ 個為正、其餘為 0），使

$$A = U\Sigma V^{T},\qquad \sigma_1\ge\sigma_2\ge\cdots\ge\sigma_r>0.$$

### 為什麼一定存在（證明骨架）

關鍵在 $A^{T}A$ 這個「補救方陣」：

1. $A^{T}A$ 是 $n\times n$ **實對稱**矩陣 → 由譜定理必可**正交對角化**，
   得單範正交特徵向量 $v_1,\dots,v_n$。
2. $A^{T}A$ **半正定**：對任意 $x$，$x^{T}A^{T}Ax=\|Ax\|^{2}\ge0$，
   故所有特徵值 $\lambda_i\ge0$，可定義 $\sigma_i=\sqrt{\lambda_i}$。
3. 對 $\sigma_i>0$ 者令 $u_i=\dfrac{Av_i}{\sigma_i}$。驗證這組 $u_i$ 也是單範正交：
   $$u_i^{T}u_j=\frac{v_i^{T}A^{T}Av_j}{\sigma_i\sigma_j}
     =\frac{\lambda_j\,v_i^{T}v_j}{\sigma_i\sigma_j}=\delta_{ij}.$$
4. 把 $u_1,\dots,u_r$ 擴充成 $\mathbb{R}^m$ 的單範正交基底，即得 $U$。
   由 $Av_i=\sigma_i u_i$ 逐行寫開就是 $AV=U\Sigma$，兩邊右乘 $V^{T}$ 得證。∎

**這個證明就是計算流程本身**——考試要你算 SVD，照著 1→4 做即可。

### 標準計算流程（成大工科年年考這題）

> 計算量鐵則：**取 $A^{T}A$ 與 $AA^{T}$ 中維度較小的那個**去解特徵值。
> $2\times3$ 矩陣就算 $AA^{T}$（2×2），千萬別去解 3×3。

1. 算 $A^{T}A$（或 $AA^{T}$），解特徵值 $\lambda_i$，**由大到小排**。
2. $\sigma_i=\sqrt{\lambda_i}$，寫出 $\Sigma$（大小同 $A$，不是方陣）。
3. 求對應的單範正交特徵向量 → 得 $V$（若算的是 $AA^{T}$ 則先得 $U$）。
4. 用 $u_i=\dfrac{Av_i}{\sigma_i}$（或 $v_i=\dfrac{A^{T}u_i}{\sigma_i}$）補出另一邊。
5. 若 $r<\min(m,n)$，缺的行用 $N(A)$ 或 $N(A^{T})$ 的單範正交基底補滿。
6. 驗算：$U^{T}U=I$、$V^{T}V=I$，且 $A v_i=\sigma_i u_i$。

### 完整手算範例

求 $A=\begin{bmatrix}3&2&2\\2&3&-2\end{bmatrix}$ 的 SVD。

**第 1 步**：$A$ 是 $2\times3$，取較小的 $AA^{T}$：

$$AA^{T}=\begin{bmatrix}3&2&2\\2&3&-2\end{bmatrix}
\begin{bmatrix}3&2\\2&3\\2&-2\end{bmatrix}
=\begin{bmatrix}17&8\\8&17\end{bmatrix}.$$

**第 2 步**：這是「對角同、其餘同」型，直接秒殺（見第 4 章 n×n 題型庫）：
$\lambda=17\pm8$，即 $\lambda_1=25,\ \lambda_2=9$。故

$$\sigma_1=5,\quad \sigma_2=3,\qquad
\Sigma=\begin{bmatrix}5&0&0\\0&3&0\end{bmatrix}\ (2\times3).$$

**第 3 步**：$\lambda_1=25$ 對應 $u_1=\frac{1}{\sqrt2}(1,1)^{T}$；
$\lambda_2=9$ 對應 $u_2=\frac{1}{\sqrt2}(1,-1)^{T}$。故
$U=\frac{1}{\sqrt2}\begin{bmatrix}1&1\\1&-1\end{bmatrix}$。

**第 4 步**：用 $v_i=\dfrac{A^{T}u_i}{\sigma_i}$ 補出 $V$ 的前兩行：

$$v_1=\frac{1}{5}A^{T}\!\cdot\!\frac{1}{\sqrt2}\begin{pmatrix}1\\1\end{pmatrix}
=\frac{1}{5\sqrt2}\begin{pmatrix}5\\5\\0\end{pmatrix}
=\frac{1}{\sqrt2}\begin{pmatrix}1\\1\\0\end{pmatrix},$$

$$v_2=\frac{1}{3}A^{T}\!\cdot\!\frac{1}{\sqrt2}\begin{pmatrix}1\\-1\end{pmatrix}
=\frac{1}{3\sqrt2}\begin{pmatrix}1\\-1\\4\end{pmatrix}.$$

**第 5 步**：$r=2<n=3$，還缺第三行。$v_3$ 取 $N(A)$ 的單範正交基底——
三維時直接用外積最快：

$$(1,1,0)\times(1,-1,4)=(4,-4,-2)\ \Rightarrow\ v_3=\frac{1}{3}(2,-2,-1)^{T}.$$

**第 6 步**：驗算 $Av_3=\frac13(6-4-2,\;4-6+2)^{T}=(0,0)^{T}$ ✓（確實落在零空間）。

$$\boxed{\;A=\frac{1}{\sqrt2}\begin{bmatrix}1&1\\1&-1\end{bmatrix}
\begin{bmatrix}5&0&0\\0&3&0\end{bmatrix}
\begin{bmatrix}
\tfrac{1}{\sqrt2}&\tfrac{1}{\sqrt2}&0\\[2pt]
\tfrac{1}{3\sqrt2}&-\tfrac{1}{3\sqrt2}&\tfrac{4}{3\sqrt2}\\[2pt]
\tfrac{2}{3}&-\tfrac{2}{3}&-\tfrac13
\end{bmatrix}\;}$$

注意最後寫的是 $V^{T}$（$v_i$ 是**列**），這是最常見的失分點。""",
        "sup": r"""〔補〕$\sigma_i^2$ 是 $A^{T}A$ 與 $AA^{T}$ 的**共同**非零特徵值，故兩邊算出來的 $\sigma$ 一致（Strang）
〔補〕$\|A\|_2=\sigma_1$、$\|A\|_F^2=\sum\sigma_i^2$、$\operatorname{rank}A=$ 非零 $\sigma$ 的個數""",
    },
    {
        "name": "SVD 與四大子空間：一次拿到四組正交基底",
        "gap": "影片未教",
        "trap": "把 U 的全部行都當成行空間基底——只有前 r 行是，後面 m−r 行是左零空間",
        "formulas": [
            {"tex": r"C(A)=\operatorname{span}\{u_1,\dots,u_r\}", "name": "行空間基底", "when": "U 的前 r 行"},
            {"tex": r"N(A^{T})=\operatorname{span}\{u_{r+1},\dots,u_m\}", "name": "左零空間", "when": "U 的後 m−r 行"},
            {"tex": r"C(A^{T})=\operatorname{span}\{v_1,\dots,v_r\}", "name": "列空間基底", "when": "V 的前 r 行"},
            {"tex": r"N(A)=\operatorname{span}\{v_{r+1},\dots,v_n\}", "name": "零空間基底", "when": "V 的後 n−r 行"},
        ],
        "compare": {
            "title": "四大子空間：列運算法 vs SVD 法",
            "cols": ["比較軸", "化列梯形（第 2 章）", "SVD（本章）"],
            "rows": [
                ["基底正交嗎", "不正交，只保證獨立", "四組都是單範正交"],
                ["計算成本", "低，手算首選", "高，要解特徵值"],
                ["零空間", "令自由變數求", "直接讀 V 的後幾行"],
                ["適合題型", "問基底、問維度", "問正交基底、投影、最小平方"],
            ],
        },
        "md": r"""- SVD 把 Strang 大圖的四個子空間**一次全給**，而且都正交
- $A v_i=\sigma_i u_i$：$V$ 的前 r 行被送進 $C(A)$，後 n−r 行被壓成 0
- 考題問「求 $C(A)$ 的單範正交基底」時，SVD 比 Gram-Schmidt 更直接""",
        "mermaid": "",
        "deep": r"""### 為什麼 SVD 一口氣給出四組正交基底

回到 $Av_i=\sigma_i u_i$ 這條核心關係：

- 當 $i\le r$（$\sigma_i>0$）：$u_i=\frac{1}{\sigma_i}Av_i$ 顯然屬於 $C(A)$。
  這 $r$ 個 $u_i$ 單範正交，個數又等於 $\dim C(A)=r$，故**恰好**是 $C(A)$ 的單範正交基底。
- 當 $i>r$（$\sigma_i=0$）：$Av_i=0$，即 $v_i\in N(A)$。
  這 $n-r$ 個 $v_i$ 單範正交，個數等於 $\dim N(A)=n-r$，故是 $N(A)$ 的單範正交基底。
- $V$ 是正交矩陣，前 $r$ 行與後 $n-r$ 行互相垂直
  → 這就是第 2 章那句 $C(A^{T})\perp N(A)$ 的**具體實現**。
- 對 $A^{T}=V\Sigma^{T}U^{T}$ 重跑一次，得到 $U$ 的前 $r$ 行張成 $C(A)$、
  後 $m-r$ 行張成 $N(A^{T})$。

### 一句話總結

> 化列梯形給你**能用的**基底；SVD 給你**最好用的**基底——正交、單位長、還按重要性排序。

考場判準：題目只問「基底、維度」就化列梯形（快）；
題目出現「**單範正交**基底、投影矩陣、最小平方、最佳近似」就往 SVD 想。""",
        "sup": r"""〔補〕投影到 $C(A)$ 的矩陣可直接寫成 $P=U_rU_r^{T}$（$U_r$＝前 r 行），
比第 5 章的 $A(A^{T}A)^{-1}A^{T}$ 更穩——後者在 $A$ 行不獨立時根本不能用""",
    },
    {
        "name": "偽反矩陣 A⁺：不可逆矩陣的「反矩陣」",
        "gap": "影片僅提及 3 次",
        "trap": "行不獨立時仍套 (AᵀA)⁻¹Aᵀ——那個逆根本不存在，只有 SVD 版永遠有效",
        "formulas": [
            {"tex": r"A^{+}=V\Sigma^{+}U^{T}", "name": "偽反矩陣", "when": "任何矩陣皆可"},
            {"tex": r"\Sigma^{+}=\operatorname{diag}(1/\sigma_1,\dots,1/\sigma_r,0,\dots,0)^{T}", "name": "Σ⁺ 作法", "when": "非零 σ 取倒數再轉置"},
            {"tex": r"A^{+}=(A^{T}A)^{-1}A^{T}", "name": "行獨立特例", "when": "rank A = n 時"},
            {"tex": r"A^{+}=A^{T}(AA^{T})^{-1}", "name": "列獨立特例", "when": "rank A = m 時"},
        ],
        "compare": {
            "title": "三種「反矩陣」的適用範圍",
            "cols": ["比較軸", "A⁻¹", "(AᵀA)⁻¹Aᵀ", "A⁺（SVD 版）"],
            "rows": [
                ["適用", "方陣且 det≠0", "行獨立 rank=n", "任何矩陣"],
                ["AA⁻¹", "= I", "≠ I（只是投影）", "≠ I（是投影）"],
                ["解 Ax=b", "唯一解", "最小平方解", "最小平方＋最小範數解"],
                ["失效時機", "det=0 就沒有", "行相依就沒有", "永不失效"],
            ],
        },
        "md": r"""- $\Sigma^{+}$ 的作法：**非零** σ 取倒數，0 保持 0，然後整個矩陣轉置
- $A^{+}b$ 在所有最小平方解裡，挑的是**範數最小**的那一個
- 考卷寫 $A^{\dagger}$、$A^{+}$、pseudo-inverse、廣義反矩陣，都是同一個東西""",
        "mermaid": r"""graph TD
  A{"A 是什麼形狀？"} -->|"方陣 det≠0"| B[["A⁻¹ 直接求"]]
  A -->|"m>n 且行獨立"| C[["AAAᵀ 正規方程"]]
  A -->|"m<n 且列獨立"| D[["Aᵀ AAᵀ 逆"]]
  A -->|"秩虧損或不確定"| E[["SVD 求 A⁺"]]
  C --> F(("最小平方解"))
  D --> G(("最小範數解"))
  E --> H(("兩者兼得"))
  classDef core fill:#6D4FC2,stroke:#5A3FA8,color:#fff
  classDef op fill:#2E8B74,stroke:#25735F,color:#fff
  classDef sup fill:#7A7A7A,stroke:#5E5E5E,color:#fff,stroke-dasharray: 4 3
  class A core
  class B,C,D op
  class E sup
  class F,G,H core""",
        "deep": r"""### 定義與 Moore–Penrose 四條件

$A^{+}$ 是唯一滿足下列四條的矩陣（Penrose 條件）：

$$AA^{+}A=A,\qquad A^{+}AA^{+}=A^{+},\qquad
(AA^{+})^{T}=AA^{+},\qquad (A^{+}A)^{T}=A^{+}A.$$

用 SVD 建構最直接：若 $A=U\Sigma V^{T}$，則

$$A^{+}=V\Sigma^{+}U^{T},\qquad
\Sigma^{+}_{ii}=\begin{cases}1/\sigma_i,&\sigma_i>0\\[2pt]0,&\sigma_i=0\end{cases}$$

（$\Sigma$ 是 $m\times n$，$\Sigma^{+}$ 是 $n\times m$。）

### 為什麼它是「最小平方＋最小範數」解

把 $\min\|Ax-b\|$ 代入 $A=U\Sigma V^{T}$，令 $y=V^{T}x$、$c=U^{T}b$
（正交變換不改變範數）：

$$\|Ax-b\|=\|U\Sigma V^{T}x-b\|=\|\Sigma y-c\|.$$

展開後前 $r$ 項是 $(\sigma_i y_i-c_i)^2$，可以取 $y_i=c_i/\sigma_i$ 歸零；
後面 $(m-r)$ 項是 $c_i^2$，與 $y$ 無關，**動不了**——這就是殘差的下界。

而 $y_{r+1},\dots,y_n$ 完全不影響誤差，是自由的；
要讓 $\|x\|=\|y\|$ 最小，就把它們全設為 0。這正好給出 $y=\Sigma^{+}c$，即

$$\hat{x}=V\Sigma^{+}U^{T}b=A^{+}b.\qquad\blacksquare$$

### 承接上例

前例 $\sigma_1=5,\ \sigma_2=3$，故

$$\Sigma^{+}=\begin{bmatrix}1/5&0\\0&1/3\\0&0\end{bmatrix}\ (3\times2),
\qquad A^{+}=V\Sigma^{+}U^{T}.$$

注意 $\Sigma^{+}$ 是 $3\times2$——**形狀要轉過來**，這裡最常寫錯。""",
        "sup": r"""〔補〕$A$ 可逆時 $A^{+}=A^{-1}$，故偽反是反矩陣的真正推廣（Strang §7.4）
〔補〕$AA^{+}$＝投影到 $C(A)$ 的矩陣；$A^{+}A$＝投影到 $C(A^{T})$ 的矩陣——
    這解釋了為何 $AA^{+}\ne I$：它只是投影，不是還原""",
    },
    {
        "name": "低秩近似與條件數",
        "gap": "影片未教",
        "trap": "誤以為要逐項比較才知道最佳近似——Eckart–Young 保證「砍掉小 σ」就是最佳",
        "formulas": [
            {"tex": r"A_k=\sum_{i=1}^{k}\sigma_i u_i v_i^{T}", "name": "最佳 k 秩近似", "when": "壓縮、去雜訊"},
            {"tex": r"\|A-A_k\|_2=\sigma_{k+1}", "name": "近似誤差", "when": "Eckart–Young 定理"},
            {"tex": r"\kappa(A)=\sigma_1/\sigma_n", "name": "條件數", "when": "判斷數值穩定性"},
        ],
        "compare": None,
        "md": r"""- 影像壓縮、PCA、推薦系統的數學核心都是這條
- $\kappa$ 很大＝病態矩陣，解 $Ax=b$ 時輸入的小誤差會被放大 $\kappa$ 倍
- $\sigma_n=0$ ⟺ 不可逆 ⟺ $\kappa=\infty$""",
        "mermaid": "",
        "deep": r"""### Eckart–Young 定理

在所有秩不超過 $k$ 的矩陣中，$A_k=\sum_{i=1}^{k}\sigma_iu_iv_i^{T}$
是離 $A$ 最近的一個（2-範數與 Frobenius 範數下皆然）：

$$\min_{\operatorname{rank}B\le k}\|A-B\|_2=\|A-A_k\|_2=\sigma_{k+1}.$$

直觀：SVD 把 $A$ 拆成 $r$ 個「秩 1 的圖層」，$\sigma_i$ 就是每層的權重。
要用 $k$ 層畫出最像的圖，當然是留權重最大的前 $k$ 層。

### 條件數與數值穩定

$$\kappa(A)=\frac{\sigma_{\max}}{\sigma_{\min}}$$

解 $Ax=b$ 時，$b$ 的相對誤差會被放大最多 $\kappa$ 倍傳到 $x$。
$\kappa\approx1$ 是良態；$\kappa\gg1$（如 $10^{6}$）代表答案不可信。

這也是為什麼數值上**不該**用 $(A^{T}A)^{-1}A^{T}$ 解最小平方——
$\kappa(A^{T}A)=\kappa(A)^2$，條件數直接被平方，誤差爆增。
實務一律走 QR 或 SVD。""",
        "sup": r"""〔補〕中央工數 mustKnow 明列「近年新增奇異值分解(SVD)」，台大工數C mustKnow 也列了 SVD——
    這不只是成大工科線代的考點，工數卷同樣會出""",
    },
]
