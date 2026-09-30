# -*- coding: utf-8 -*-
r"""第 8 章：偏微分方程 —— 26 集影片無專章，考古題 34 題，依 Kreyszig 補寫

實測依據：熱傳／波動只在 Bessel 與邊界值的應用脈絡零星出現（21、22、23 集），
PDE 的分離變數法完整流程（令 u=XT → 分離 → 解特徵值問題 → 級數疊加 → 用初始條件定係數）
沒有專章講授。

成大工科 mustKnow：「偏微分方程：熱傳導、波動方程式之分離變數法、邊界值問題、
非齊次偏微分方程之求解是核心中的核心，配分恆定占 20% - 25%。」
台聯大 mustKnow：「PDE與分離變數法：常考分離變數法結合傅立葉級數，求解熱傳、波動或拉普拉斯方程式。」
台大 mustKnow：「掌握波動與熱傳導方程之邊界值問題。」
"""

PDE_CONCEPTS = [
    {
        "name": "分離變數法：五個步驟解掉所有標準 PDE",
        "gap": "影片未教",
        "trap": "分離常數要設成 $-\\lambda$ 並討論三種符號，只試 $\\lambda>0$ 會漏解或找錯特徵值",
        "formulas": [
            {"tex": r"u(x,t)=X(x)\,T(t)", "name": "分離假設", "when": "齊次方程＋齊次邊界"},
            {"tex": r"\frac{X''}{X}=\frac{1}{c^2}\frac{T''}{T}=-\lambda",
             "name": "分離後等式", "when": "兩邊變數不同故必為常數"},
            {"tex": r"u(x,t)=\sum_{n=1}^{\infty}c_n X_n(x)T_n(t)",
             "name": "疊加通解", "when": "線性齊次可疊加"},
        ],
        "compare": {
            "title": "分離常數三種情形（以 X''+λX=0、X(0)=X(L)=0 為例）",
            "cols": ["情形", "$\\lambda<0$", "$\\lambda=0$", "$\\lambda>0$"],
            "rows": [
                ["通解", "$X=Ae^{kx}+Be^{-kx}$", "$X=Ax+B$", "$X=A\\cos kx+B\\sin kx$"],
                ["套邊界", "$A=B=0$", "$A=B=0$", "$A=0$，$\\sin kL=0$"],
                ["結果", "只有零解，捨", "只有零解，捨", "$\\lambda_n=(n\\pi/L)^2$ ✓"],
                ["特徵函數", "無", "無", "$X_n=\\sin\\frac{n\\pi x}{L}$"],
            ],
        },
        "md": r"""- **必須三種都討論**，考卷會扣「沒討論就直接設 $\lambda=k^2$」的分
- 邊界條件決定特徵函數；初始條件決定係數。順序不能顛倒
- 係數 $c_n$ 就是初始函數的 Fourier 係數——第 7 章在這裡派上用場""",
        "mermaid": r"""graph TD
  A["拿到 PDE 邊界值問題"] --> B{"方程與邊界都齊次嗎？"}
  B -->|"否"| C[["先做齊次化 拆穩態加暫態"]]
  C --> B
  B -->|"是"| D[["令 u 等於 X 乘 T 代入"]]
  D --> E["分離成兩個 ODE 共用常數"]
  E --> F[["解含邊界條件的那個 特徵值問題"]]
  F --> G{"三種 lambda 哪個給非零解？"}
  G --> H["得特徵值與特徵函數"]
  H --> I[["解另一個 ODE 得時間部分"]]
  I --> J["疊加成級數"]
  J --> K[["用初始條件定係數 就是傅立葉係數"]]
  classDef core fill:#6D4FC2,stroke:#5A3FA8,color:#fff
  classDef op fill:#2E8B74,stroke:#25735F,color:#fff
  classDef defn fill:#2F6DB3,stroke:#265A94,color:#fff
  class A,H defn
  class B,G op
  class C,D,F,I,K op
  class E,J defn""",
        "deep": r"""### 為什麼可以假設 $u=X(x)T(t)$

這不是「所有解都長這樣」，而是：

1. 先**找出**一族形如 $X T$ 的特解（這一步是假設，不保證找得到全部）；
2. 因為方程與邊界條件都**線性齊次**，這些特解的任意線性組合仍是解（疊加原理）；
3. 級數 $\sum c_nX_nT_n$ 的係數有足夠自由度去匹配任意初始條件（由 Fourier 級數的完備性保證）。

所以最後得到的確實是通解。**第 3 步的合法性正是第 6 章 Sturm-Liouville 理論在保證的**——
特徵函數系完備，任何分段光滑的初始函數都能展開。

### 為什麼分離常數要帶負號寫成 $-\lambda$

分離後得到

$$\frac{X''(x)}{X(x)}=\frac{T'(t)}{c^2T(t)}$$

左邊只含 $x$、右邊只含 $t$，兩邊要恆等就只能都等於常數。把常數寫成 $-\lambda$ 是為了讓

$$X''+\lambda X=0$$

長成標準的 Sturm-Liouville 特徵值問題（$\lambda$ 為正時給三角函數解，正是我們要的）。
寫成 $+\lambda$ 也可以，只是後面 $\lambda$ 的正負結論要對調，容易寫錯。

### 五步驟總流程

**Step 1 分離**：令 $u=XT$ 代入，兩邊除以 $XT$，湊出「左邊只含 $x$、右邊只含 $t$」。

**Step 2 拆成兩個 ODE**：都等於 $-\lambda$。

**Step 3 解特徵值問題**：**帶邊界條件的那一個**（通常是 $X$）。三種 $\lambda$ 全部討論，
找出哪一種給非零解，得到 $\lambda_n$ 與 $X_n$。

**Step 4 解另一個 ODE**：把 $\lambda_n$ 代進去解 $T_n$。

**Step 5 疊加＋定係數**：$u=\sum c_nX_nT_n$，用初始條件求 $c_n$——這一步就是把初始函數
展開成特徵函數級數（Fourier 係數公式）。

### 常見邊界條件對應的特徵函數

| 邊界條件 | 物理意義 | 特徵值 | 特徵函數 |
|---|---|---|---|
| $X(0)=X(L)=0$ | 兩端固定／恆溫 | $\left(\frac{n\pi}{L}\right)^2$ | $\sin\frac{n\pi x}{L}$ |
| $X'(0)=X'(L)=0$ | 兩端絕熱／自由 | $\left(\frac{n\pi}{L}\right)^2$，含 $n=0$ | $\cos\frac{n\pi x}{L}$ |
| $X(0)=X'(L)=0$ | 一端固定一端自由 | $\left(\frac{(2n-1)\pi}{2L}\right)^2$ | $\sin\frac{(2n-1)\pi x}{2L}$ |

> 第三種的特徵值不是 $n\pi/L$，是考題最愛的變化型，要會自己推不能背。""",
        "sup": r"""〔補〕不是所有 PDE 都能分離變數——需要方程與邊界在該座標系下「可分離」。
圓形區域要改用極座標，分離後徑向部分變成 Bessel 方程（第 5 章派上用場）（Kreyszig §12.10）""",
    },
    {
        "name": "熱傳導方程（拋物型）",
        "gap": "影片未教",
        "trap": "時間部分是 $e^{-c^2\\lambda_n t}$ 指數衰減，寫成三角函數就是把熱傳當成波動了",
        "formulas": [
            {"tex": r"u_t=c^2u_{xx}", "name": "一維熱傳導方程", "when": "c² 為熱擴散係數"},
            {"tex": r"u(x,t)=\sum_{n=1}^{\infty}b_n\sin\frac{n\pi x}{L}\,e^{-\left(\frac{n\pi c}{L}\right)^2t}",
             "name": "兩端恆溫解", "when": "u(0,t)=u(L,t)=0"},
            {"tex": r"b_n=\frac{2}{L}\int_0^{L}f(x)\sin\frac{n\pi x}{L}\,dx",
             "name": "係數（正弦展開）", "when": "f 為初始溫度分布"},
        ],
        "compare": {
            "title": "熱傳導 vs 波動：時間部分完全不同",
            "cols": ["比較軸", "熱傳導 $u_t=c^2u_{xx}$", "波動 $u_{tt}=c^2u_{xx}$"],
            "rows": [
                ["時間 ODE", "$T'+c^2\\lambda T=0$（一階）", "$T''+c^2\\lambda T=0$（二階）"],
                ["時間解", "$e^{-c^2\\lambda_nt}$ 衰減", "$\\cos,\\sin(c\\sqrt{\\lambda_n}t)$ 振盪"],
                ["初始條件個數", "1 個（$u(x,0)$）", "2 個（$u$ 與 $u_t$）"],
                ["長時間行為", "趨於穩態（通常趨於 0）", "永遠振盪不衰減"],
                ["高頻分量", "衰減極快（$n^2$ 在指數上）", "不衰減"],
            ],
        },
        "md": r"""- 指數上的 $n^2$ 讓高頻分量衰減極快 → 熱傳導會「抹平」尖角
- 只需要 **1 個**初始條件，因為時間方向是一階
- 兩端絕熱（$u_x=0$）時改用餘弦展開，且會有 $n=0$ 的常數項（總熱量守恆）""",
        "mermaid": "",
        "deep": r"""### 完整求解：兩端恆溫的桿子

$$\text{PDE：}u_t=c^2u_{xx},\quad 0<x<L,\ t>0$$
$$\text{BC：}u(0,t)=0,\quad u(L,t)=0$$
$$\text{IC：}u(x,0)=f(x)$$

**Step 1**：令 $u=X(x)T(t)$ 代入 $u_t=c^2u_{xx}$：

$$XT'=c^2X''T\ \Longrightarrow\ \frac{T'}{c^2T}=\frac{X''}{X}=-\lambda$$

**Step 2**：得兩個 ODE

$$X''+\lambda X=0,\qquad T'+c^2\lambda T=0$$

**Step 3**：邊界條件在 $X$ 上。$u(0,t)=X(0)T(t)=0$ 對所有 $t$ 成立，
而 $T\not\equiv0$（否則 $u\equiv0$ 是廢解），故 $X(0)=0$；同理 $X(L)=0$。

現在解 $X''+\lambda X=0$，$X(0)=X(L)=0$：

- **$\lambda<0$**：令 $\lambda=-k^2$，$X=Ae^{kx}+Be^{-kx}$。
  $X(0)=A+B=0$、$X(L)=Ae^{kL}+Be^{-kL}=0$。
  由第一式 $B=-A$，代入第二式得 $A(e^{kL}-e^{-kL})=0$，即 $2A\sinh kL=0$。
  $k\ne0$ 時 $\sinh kL\ne0$，故 $A=0$，只有零解。**捨**。
- **$\lambda=0$**：$X=Ax+B$，$X(0)=B=0$、$X(L)=AL=0\Rightarrow A=0$。只有零解。**捨**。
- **$\lambda>0$**：令 $\lambda=k^2$，$X=A\cos kx+B\sin kx$。
  $X(0)=A=0$，故 $X=B\sin kx$。$X(L)=B\sin kL=0$，要非零解須 $\sin kL=0$，
  即 $kL=n\pi$：

$$\lambda_n=\left(\frac{n\pi}{L}\right)^2,\qquad X_n(x)=\sin\frac{n\pi x}{L},\quad n=1,2,3,\dots$$

**Step 4**：把 $\lambda_n$ 代入 $T'+c^2\lambda_nT=0$，這是可分離的一階 ODE：

$$T_n(t)=e^{-c^2\lambda_nt}=e^{-\left(\frac{n\pi c}{L}\right)^2t}$$

**Step 5**：疊加

$$u(x,t)=\sum_{n=1}^{\infty}b_n\sin\frac{n\pi x}{L}\,e^{-\left(\frac{n\pi c}{L}\right)^2t}$$

代 $t=0$：$u(x,0)=\sum b_n\sin\frac{n\pi x}{L}=f(x)$ ——這正是 $f$ 的**正弦半幅展開**，故

$$b_n=\frac{2}{L}\int_0^{L}f(x)\sin\frac{n\pi x}{L}dx\qquad\blacksquare$$

### 數值範例

$L=\pi$、$c=1$、$f(x)=100$（整根桿子初始 $100^\circ$，兩端突然接觸 $0^\circ$）。

$$b_n=\frac{2}{\pi}\int_0^{\pi}100\sin nx\,dx=\frac{200}{\pi}\left[\frac{-\cos nx}{n}\right]_0^{\pi}
=\frac{200}{n\pi}\left[1-(-1)^n\right]$$

即 $b_n=\frac{400}{n\pi}$（$n$ 奇）、$0$（$n$ 偶）。

$$\boxed{\;u(x,t)=\frac{400}{\pi}\sum_{k=0}^{\infty}\frac{1}{2k+1}\sin\big((2k+1)x\big)e^{-(2k+1)^2t}\;}$$

**檢查**：$t$ 稍微變大，$n=3$ 項的衰減因子是 $e^{-9t}$，比 $n=1$ 的 $e^{-t}$ 快得多——
所以溫度分布很快就變成單純的 $\sin x$ 形狀。這是熱傳導問題的典型行為。

### 兩端絕熱的版本

BC 改成 $u_x(0,t)=u_x(L,t)=0$，則 $X'(0)=X'(L)=0$，特徵函數變成 $\cos\frac{n\pi x}{L}$，
且 **$\lambda=0$ 這次給出非零解** $X_0=$ 常數：

$$u(x,t)=\frac{a_0}{2}+\sum_{n=1}^{\infty}a_n\cos\frac{n\pi x}{L}e^{-\left(\frac{n\pi c}{L}\right)^2t}$$

$t\to\infty$ 時只剩 $\frac{a_0}{2}=\frac{1}{L}\int_0^Lf$ ——**初始溫度的平均值**。
物理上完全合理：絕熱系統熱量不流失，最後均勻分布。""",
        "sup": r"""〔補〕無限長桿（$-\infty<x<\infty$）不能用分離變數＋級數，要用 **Fourier 轉換**，
解是與熱核的摺積 $u(x,t)=\frac{1}{2c\sqrt{\pi t}}\int_{-\infty}^{\infty}f(\xi)e^{-(x-\xi)^2/(4c^2t)}d\xi$
（Kreyszig §12.7）——這是第 7 章 Fourier 轉換的直接應用""",
    },
    {
        "name": "波動方程（雙曲型）與 d'Alembert 解",
        "gap": "影片未教",
        "trap": "波動方程有兩個初始條件（位移與速度），只用一個會少一半係數",
        "formulas": [
            {"tex": r"u_{tt}=c^2u_{xx}", "name": "一維波動方程", "when": "c 為波速"},
            {"tex": r"u=\sum_{n=1}^{\infty}\left(A_n\cos\frac{n\pi ct}{L}+B_n\sin\frac{n\pi ct}{L}\right)\sin\frac{n\pi x}{L}",
             "name": "兩端固定弦", "when": "u(0,t)=u(L,t)=0"},
            {"tex": r"u(x,t)=\frac{f(x+ct)+f(x-ct)}{2}+\frac{1}{2c}\int_{x-ct}^{x+ct}g(s)\,ds",
             "name": "d'Alembert 解", "when": "無限長弦"},
        ],
        "compare": {
            "title": "兩個初始條件分別決定什麼",
            "cols": ["初始條件", "物理意義", "決定哪組係數", "公式"],
            "rows": [
                ["$u(x,0)=f(x)$", "初始位移", "$A_n$", "$\\frac{2}{L}\\int_0^Lf\\sin\\frac{n\\pi x}{L}dx$"],
                ["$u_t(x,0)=g(x)$", "初始速度", "$B_n$", "$\\frac{2}{n\\pi c}\\int_0^Lg\\sin\\frac{n\\pi x}{L}dx$"],
            ],
        },
        "md": r"""- $B_n$ 的分母多了 $n\pi c/L$，因為對 $t$ 微分時會掉下來，**最常漏掉**
- 撥弦（給位移不給速度）→ 只有 $A_n$；敲弦（給速度不給位移）→ 只有 $B_n$
- $n=1$ 是基頻，$n\ge2$ 是泛音——樂器音色的數學解釋""",
        "mermaid": "",
        "deep": r"""### 分離變數解法

$$u_{tt}=c^2u_{xx},\quad u(0,t)=u(L,t)=0,\quad u(x,0)=f(x),\ u_t(x,0)=g(x)$$

**Step 1–3** 與熱傳導**完全相同**（空間部分的方程與邊界條件一樣），得

$$\lambda_n=\left(\frac{n\pi}{L}\right)^2,\qquad X_n=\sin\frac{n\pi x}{L}$$

**Step 4** 時間部分不同：$T''+c^2\lambda_nT=0$ 是**二階**，通解為

$$T_n(t)=A_n\cos\frac{n\pi ct}{L}+B_n\sin\frac{n\pi ct}{L}$$

**Step 5** 疊加：

$$u(x,t)=\sum_{n=1}^{\infty}\left(A_n\cos\frac{n\pi ct}{L}+B_n\sin\frac{n\pi ct}{L}\right)\sin\frac{n\pi x}{L}$$

用 $u(x,0)=f(x)$：$\sum A_n\sin\frac{n\pi x}{L}=f(x)$，故 $A_n=\frac{2}{L}\int_0^Lf\sin\frac{n\pi x}{L}dx$。

用 $u_t(x,0)=g(x)$：先對 $t$ 微分再代 $t=0$，

$$u_t(x,0)=\sum B_n\cdot\frac{n\pi c}{L}\sin\frac{n\pi x}{L}=g(x)$$

所以 $B_n\frac{n\pi c}{L}$ 才是 $g$ 的 Fourier 正弦係數：

$$B_n=\frac{2}{n\pi c}\int_0^{L}g(x)\sin\frac{n\pi x}{L}dx\qquad\blacksquare$$

> 那個 $\frac{n\pi c}{L}$ 因子是本題最高頻的失分點。

### 數值範例：撥弦

長 $L$ 的弦，在中點拉高 $h$ 後放開（$g\equiv0$）：

$$f(x)=\begin{cases}\dfrac{2hx}{L},&0\le x\le L/2\\[6pt] \dfrac{2h(L-x)}{L},&L/2\le x\le L\end{cases}$$

$g\equiv0\Rightarrow B_n=0$。算 $A_n$（分兩段積分，過程略去中間代數）：

$$A_n=\frac{8h}{n^2\pi^2}\sin\frac{n\pi}{2}$$

$\sin\frac{n\pi}{2}$ 在 $n$ 偶時為 0，$n=1,5,9,\dots$ 時為 $1$，$n=3,7,11,\dots$ 時為 $-1$。

$$\boxed{\;u(x,t)=\frac{8h}{\pi^2}\sum_{k=0}^{\infty}\frac{(-1)^k}{(2k+1)^2}
\sin\frac{(2k+1)\pi x}{L}\cos\frac{(2k+1)\pi ct}{L}\;}$$

**物理檢查**：偶數泛音全部消失——因為中點是所有偶數模態的節點，在節點撥弦激發不了它們。
這也是為什麼吉他在不同位置撥弦音色不同。

### d'Alembert 解（無限長弦）

對 $-\infty<x<\infty$ 沒有邊界，改用行波觀點。令 $\xi=x+ct$、$\eta=x-ct$，
波動方程變成 $u_{\xi\eta}=0$，積分兩次得

$$u=\phi(x+ct)+\psi(x-ct)$$

**左行波＋右行波**。用初始條件定 $\phi,\psi$：

$$u(x,0)=\phi(x)+\psi(x)=f(x)$$
$$u_t(x,0)=c\phi'(x)-c\psi'(x)=g(x)$$

第二式積分：$\phi(x)-\psi(x)=\frac{1}{c}\int_{x_0}^{x}g+K$。與第一式聯立解出 $\phi,\psi$，得

$$u(x,t)=\frac{f(x+ct)+f(x-ct)}{2}+\frac{1}{2c}\int_{x-ct}^{x+ct}g(s)\,ds$$

**意義**：$t$ 時刻 $x$ 點的值，只受初始資料在區間 $[x-ct,x+ct]$（**依賴域**）的影響。
訊號以速度 $c$ 傳播，這是雙曲型方程的本質特徵，與熱傳導（擾動瞬間傳到無窮遠）截然不同。""",
        "sup": r"""〔補〕有限長弦也能用 d'Alembert，方法是把 $f,g$ 做**奇延拓**成週期 $2L$ 的函數，
再套公式——邊界的反射會自動由延拓產生（Kreyszig §12.4）""",
    },
    {
        "name": "Laplace 方程（橢圓型）與非齊次邊界的處理",
        "gap": "影片未教",
        "trap": "四個邊界都非齊次時不能直接分離，要拆成四個各只有一邊非齊次的子問題疊加",
        "formulas": [
            {"tex": r"\nabla^2u=u_{xx}+u_{yy}=0", "name": "Laplace 方程", "when": "穩態、無源"},
            {"tex": r"u(x,y)=\sum_{n=1}^{\infty}A_n\sin\frac{n\pi x}{a}\sinh\frac{n\pi y}{a}",
             "name": "矩形三邊為零解", "when": "僅 y=b 邊非零"},
            {"tex": r"u=u_{\text{穩態}}(x)+v(x,t)", "name": "齊次化分解", "when": "邊界非齊次時"},
        ],
        "compare": {
            "title": "三類方程的判別與行為",
            "cols": ["類型", "拋物型", "雙曲型", "橢圓型"],
            "rows": [
                ["代表", "$u_t=c^2u_{xx}$", "$u_{tt}=c^2u_{xx}$", "$u_{xx}+u_{yy}=0$"],
                ["判別式 $B^2-4AC$", "$=0$", "$>0$", "$<0$"],
                ["物理", "擴散、熱傳", "波動、振動", "穩態、位勢"],
                ["時間部分", "指數衰減", "三角振盪", "無時間變數"],
                ["另一方向的解", "—", "—", "$\\sinh,\\cosh$（非振盪）"],
            ],
        },
        "md": r"""- Laplace 方程沒有時間，兩個方向都是空間 → 一個方向給三角、另一個給雙曲函數
- 哪個方向給三角？**齊次邊界所在的那個方向**
- 非齊次邊界是考題主要變化，處理手法是「拆解＋疊加」""",
        "mermaid": r"""graph TD
  A{"邊界條件齊次嗎？"} -->|"全部齊次"| B[["直接分離變數"]]
  A -->|"只有一邊非齊次"| C[["仍可分離 該方向用 sinh"]]
  A -->|"多邊非齊次"| D[["拆成多個子問題各留一邊"]]
  D --> C
  A -->|"方程本身非齊次 有熱源"| E[["先找穩態解扣掉"]]
  E --> F["剩下的暫態問題變齊次"]
  F --> B
  classDef core fill:#6D4FC2,stroke:#5A3FA8,color:#fff
  classDef op fill:#2E8B74,stroke:#25735F,color:#fff
  classDef warn fill:#B3402F,stroke:#942F23,color:#fff
  class A op
  class B,C,D,E op
  class F core""",
        "deep": r"""### 矩形域的 Laplace 方程

$$u_{xx}+u_{yy}=0,\quad 0<x<a,\ 0<y<b$$
$$u(0,y)=u(a,y)=0,\quad u(x,0)=0,\quad u(x,b)=f(x)$$

（三邊為零、頂邊給定——這是標準型。）

**Step 1**：令 $u=X(x)Y(y)$，得 $\frac{X''}{X}=-\frac{Y''}{Y}=-\lambda$。

**Step 2**：$X''+\lambda X=0$、$Y''-\lambda Y=0$。

**Step 3**：**齊次邊界在 $x$ 方向**（$u(0,y)=u(a,y)=0$ 給出 $X(0)=X(a)=0$），
所以特徵值問題在 $X$：

$$\lambda_n=\left(\frac{n\pi}{a}\right)^2,\qquad X_n=\sin\frac{n\pi x}{a}$$

**Step 4**：$Y''-\lambda_nY=0$ 的通解是 $Y=Ce^{n\pi y/a}+De^{-n\pi y/a}$，
寫成雙曲函數更方便套邊界：

$$Y_n=C\cosh\frac{n\pi y}{a}+D\sinh\frac{n\pi y}{a}$$

用 $u(x,0)=0\Rightarrow Y(0)=0$：$\cosh 0=1$、$\sinh 0=0$，故 $C=0$。

$$Y_n=\sinh\frac{n\pi y}{a}$$

> **關鍵**：$\lambda>0$ 時 $Y''-\lambda Y=0$（注意是**減**）給雙曲函數，不是三角函數。
> 兩個方向一個振盪一個單調，這是橢圓型的特徵。

**Step 5**：疊加

$$u(x,y)=\sum_{n=1}^{\infty}A_n\sin\frac{n\pi x}{a}\sinh\frac{n\pi y}{a}$$

用 $u(x,b)=f(x)$：

$$\sum_{n}\underbrace{A_n\sinh\frac{n\pi b}{a}}_{\text{這整包才是 Fourier 係數}}\sin\frac{n\pi x}{a}=f(x)$$

$$\Longrightarrow\ A_n=\frac{1}{\sinh\frac{n\pi b}{a}}\cdot\frac{2}{a}\int_0^{a}f(x)\sin\frac{n\pi x}{a}dx$$

那個 $\frac{1}{\sinh(n\pi b/a)}$ 是本題最常漏的因子。

### 四邊都非齊次怎麼辦

拆成四個子問題 $u=u_1+u_2+u_3+u_4$，每個只留**一邊**非齊次、其餘三邊設 0。
每個子問題都用上面的標準流程解，最後相加。合法性來自 Laplace 方程是**線性齊次**的。

### 非齊次方程／非齊次邊界的齊次化

若熱傳導問題的邊界是定值但非零，例如

$$u_t=c^2u_{xx},\quad u(0,t)=T_1,\ u(L,t)=T_2,\quad u(x,0)=f(x)$$

**不能**直接分離（$X(0)T(t)=T_1$ 推不出 $X(0)$ 是常數）。做法：

1. 先找**穩態解** $u_s(x)$：令 $\partial_t=0$，得 $u_s''=0$，即 $u_s=Ax+B$。
   套邊界得 $u_s(x)=T_1+\frac{T_2-T_1}{L}x$（線性溫度分布）。
2. 令 $v=u-u_s$。則 $v$ 滿足**齊次**邊界 $v(0,t)=v(L,t)=0$，方程仍是 $v_t=c^2v_{xx}$，
   初始條件變成 $v(x,0)=f(x)-u_s(x)$。
3. 用標準流程解 $v$，最後 $u=u_s+v$。

> 這一招（「拆穩態＋暫態」）是成大工科 mustKnow 說的「非齊次偏微分方程之求解」的主要手法。""",
        "sup": r"""〔補〕圓形域的 Laplace 方程要用極座標，分離後角度部分給 $\cos n\theta,\sin n\theta$、
徑向給 $r^n$ 與 $r^{-n}$；圓內問題要捨去 $r^{-n}$（在原點發散）——這是 Poisson 積分公式的來源
〔補〕熱傳導在圓柱域分離後徑向會得到 **Bessel 方程**，第 5 章的 $J_n$ 在這裡接上（Kreyszig §12.10）""",
    },
]
