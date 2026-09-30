# -*- coding: utf-8 -*-
r"""第 7 章：Fourier 分析 —— 補「三角特例的操作面」，考古題 39 題

## 這一章補的是哪一半（重要）

第一次用「傅立葉／Fourier」兩種寫法檢索逐字稿只得到 5 次，據此誤判為「整塊沒教」。
實際上 Whisper 把 Fourier 音譯打散成「負力／負裂／複利／富利業／傅烈／Furrier…」等變體，
全變體合計 **136 次**（第 26 集就佔 76 次）。**理論那半課堂教得很紮實**：

- 廣義傅立葉級數 $f=\sum c_n\phi_n$、係數 $c_n=\langle f,\phi_n\rangle/\|\phi_n\|^2$ 的完整推導 → 第 6 章
- 帶權內積、完備正交集、Sturm-Liouville 保證完備性 → 第 6 章
- 收斂定理（連續點收斂到 $f$、跳躍點收斂到左右極限平均）→ 第 6 章，教得很細

**真正缺的是三角函數系這個特例的操作面**（逐字稿實測全部 0 次命中）：

| 項目 | 命中次數 |
|---|---|
| 週期延拓 | 0 |
| 半幅（正弦／餘弦）展開 | 0 |
| Parseval 等式 | 0 |
| Gibbs 現象 | 0 |
| Dirichlet 條件的正式陳述 | 只提名字 3 次 |

課堂最後一集老師親口說「下禮拜要上傅立葉，**標準的非常非常重要**」——但那是本系列最後一集，
第九章沒上到。所以本章重心放在**公式表、積分技巧、奇偶與半幅的操作**，
理論部分直接銜接第 6 章，不重複推導。

台科大 mustKnow：「Fourier 級數（含複數型與正餘弦級數展開）與 Fourier 轉換
（含卷積與性質應用）為每年穩定的高頻命題焦點。」
中央 mustKnow：「Fourier 積分與轉換：頻繁測驗連續時間訊號的傅立葉轉換、反轉換計算。」
"""

FOURIER_CONCEPTS = [
    {
        "name": "Fourier 級數：把週期函數拆成正弦與餘弦",
        "gap": "課堂只教廣義版",
        "trap": "係數公式的積分區間必須是「一個完整週期」，不是隨便從 0 積到 L",
        "formulas": [
            {"tex": r"f(x)=\frac{a_0}{2}+\sum_{n=1}^{\infty}\left(a_n\cos\frac{n\pi x}{L}+b_n\sin\frac{n\pi x}{L}\right)",
             "name": "Fourier 級數", "when": "週期 2L 的週期函數"},
            {"tex": r"a_n=\frac{1}{L}\int_{-L}^{L}f(x)\cos\frac{n\pi x}{L}\,dx",
             "name": "餘弦係數", "when": "n=0,1,2,…"},
            {"tex": r"b_n=\frac{1}{L}\int_{-L}^{L}f(x)\sin\frac{n\pi x}{L}\,dx",
             "name": "正弦係數", "when": "n=1,2,3,…"},
        ],
        "compare": {
            "title": "為什麼常數項寫成 a₀/2 而不是 a₀",
            "cols": ["寫法", "a₀/2 派（主流）", "單獨寫 c₀ 派"],
            "rows": [
                ["常數項", "$a_0/2$", "$c_0$"],
                ["係數公式", "$a_n$ 一條公式涵蓋 n=0", "$c_0$ 要另寫一條"],
                ["$a_0$ 的意義", "$\\frac{1}{L}\\int_{-L}^{L}f$＝兩倍平均值", "平均值本身"],
                ["考卷慣例", "Kreyszig、台灣課本主流", "少數工程書"],
            ],
        },
        "md": r"""- $a_0/2$ 的除以 2 是為了讓 $a_n$ 只需要一條公式
- 係數本質是「$f$ 在每個基底方向上的投影」，跟線代的座標完全同一件事
- 積分區間可換成任何長度 $2L$ 的區間（例如 $0$ 到 $2L$），週期函數積分值相同""",
        "mermaid": "",
        "deep": r"""> **與課堂的銜接**：第 6 章已經教過廣義傅立葉級數 $f=\sum c_n\phi_n$ 與
> $c_n=\langle f,\phi_n\rangle/\|\phi_n\|^2$ 的完整推導。這裡做的是把 $\{\phi_n\}$
> **換成三角函數系**這個最重要的特例，寫出考卷上直接要用的具體公式。

### 定義

設 $f$ 的週期為 $2L$。它的 **Fourier 級數**是

$$f(x)\sim\frac{a_0}{2}+\sum_{n=1}^{\infty}\left(a_n\cos\frac{n\pi x}{L}+b_n\sin\frac{n\pi x}{L}\right)$$

（先寫 $\sim$ 而不是 $=$，因為要等收斂定理才知道何時真的相等。）

### 係數公式怎麼來的——這就是第 6 章正交展開的特例

三角函數系
$$\left\{1,\ \cos\frac{\pi x}{L},\ \sin\frac{\pi x}{L},\ \cos\frac{2\pi x}{L},\ \sin\frac{2\pi x}{L},\ \dots\right\}$$
在 $[-L,L]$ 上**兩兩正交**（權重 $w=1$）：

$$\int_{-L}^{L}\cos\frac{m\pi x}{L}\cos\frac{n\pi x}{L}\,dx=\begin{cases}0,&m\neq n\\ L,&m=n\neq0\\ 2L,&m=n=0\end{cases}$$

$$\int_{-L}^{L}\sin\frac{m\pi x}{L}\sin\frac{n\pi x}{L}\,dx=\begin{cases}0,&m\neq n\\ L,&m=n\end{cases}
\qquad
\int_{-L}^{L}\cos\frac{m\pi x}{L}\sin\frac{n\pi x}{L}\,dx=0\ \ \forall m,n$$

（最後一條對所有 $m,n$ 都成立，因為 cos 是偶、sin 是奇，乘積是奇函數，對稱區間積分為 0。）

**推導係數**：把展開式兩邊同乘 $\cos\frac{m\pi x}{L}$ 再從 $-L$ 積到 $L$。右邊除了 $n=m$ 那一項，其餘全被正交性殺光：

$$\int_{-L}^{L}f(x)\cos\frac{m\pi x}{L}dx=a_m\int_{-L}^{L}\cos^2\frac{m\pi x}{L}dx=a_m\cdot L$$

故 $a_m=\frac{1}{L}\int_{-L}^{L}f\cos\frac{m\pi x}{L}dx$。$b_m$ 同理。$\blacksquare$

> **一句話**：Fourier 係數＝$f$ 對第 $n$ 個基底的內積除以該基底的範數平方。
> 這和第 6 章的 $c_n=\frac{\langle f,\phi_n\rangle}{\|\phi_n\|^2}$ 是同一條式子。

### 完整手算範例

求 $f(x)=x$ 在 $-\pi<x<\pi$（週期 $2\pi$，即 $L=\pi$）的 Fourier 級數。

**第 1 步**：$f(x)=x$ 是**奇函數** → 所有 $a_n=0$（省下一半計算，見下一則）。

**第 2 步**：算 $b_n$。

$$b_n=\frac{1}{\pi}\int_{-\pi}^{\pi}x\sin nx\,dx=\frac{2}{\pi}\int_{0}^{\pi}x\sin nx\,dx$$

分部積分，取 $u=x$、$dv=\sin nx\,dx$，則 $du=dx$、$v=-\frac{\cos nx}{n}$：

$$\int_{0}^{\pi}x\sin nx\,dx=\left[-\frac{x\cos nx}{n}\right]_0^{\pi}+\frac{1}{n}\int_0^{\pi}\cos nx\,dx
=-\frac{\pi\cos n\pi}{n}+\frac{1}{n}\underbrace{\left[\frac{\sin nx}{n}\right]_0^{\pi}}_{=0}$$

因為 $\cos n\pi=(-1)^n$：

$$b_n=\frac{2}{\pi}\cdot\left(-\frac{\pi(-1)^n}{n}\right)=\frac{2(-1)^{n+1}}{n}$$

**第 3 步**：寫出級數。

$$\boxed{\;x=2\sum_{n=1}^{\infty}\frac{(-1)^{n+1}}{n}\sin nx
=2\left(\sin x-\frac{\sin 2x}{2}+\frac{\sin 3x}{3}-\cdots\right),\quad -\pi<x<\pi\;}$$

**第 4 步（驗算，也是考點）**：代 $x=\pi/2$：左邊 $=\pi/2$，右邊 $=2(1-0-\frac13+0+\frac15-\cdots)$，
得到 $\frac{\pi}{4}=1-\frac13+\frac15-\cdots$ ——這正是著名的 Leibniz 級數。
考題常反過來問「用 Fourier 級數求某個數項級數的和」，用的就是這一手。""",
        "sup": r"""〔補〕在 $x=\pm\pi$ 這兩個端點，級數收斂到 $\frac{f(\pi^-)+f(-\pi^+)}{2}=\frac{\pi+(-\pi)}{2}=0$，
不等於 $f(\pi)=\pi$——這是下一則收斂定理的直接體現，考卷很愛在端點設陷阱""",
    },
    {
        "name": "奇偶性與半幅展開（考場省一半時間）",
        "gap": "影片未教",
        "trap": "半幅展開是「自己選要延拓成奇還是偶」，同一個 f 有兩種合法答案",
        "formulas": [
            {"tex": r"f\ \text{偶}\Rightarrow b_n=0,\quad a_n=\frac{2}{L}\int_0^{L}f\cos\frac{n\pi x}{L}dx",
             "name": "偶函數：餘弦級數", "when": "f(-x)=f(x)"},
            {"tex": r"f\ \text{奇}\Rightarrow a_n=0,\quad b_n=\frac{2}{L}\int_0^{L}f\sin\frac{n\pi x}{L}dx",
             "name": "奇函數：正弦級數", "when": "f(-x)=-f(x)"},
        ],
        "compare": {
            "title": "半幅展開：同一個 f 的兩種延拓",
            "cols": ["比較軸", "偶延拓（餘弦級數）", "奇延拓（正弦級數）"],
            "rows": [
                ["延拓方式", "$f(-x):=f(x)$，鏡射", "$f(-x):=-f(x)$，點對稱"],
                ["得到的級數", "只有 $\\cos$ 項與常數", "只有 $\\sin$ 項"],
                ["端點 $x=0$", "自動滿足 $f'(0)=0$", "自動滿足 $f(0)=0$"],
                ["用在 PDE", "配 Neumann 邊界（絕熱）", "配 Dirichlet 邊界（固定端）"],
                ["收斂速度", "通常較快（無跳躍）", "端點常有跳躍，收斂較慢"],
            ],
        },
        "md": r"""- 奇偶判斷先做，可以直接砍掉一半的積分
- 「半幅」＝只給 $0<x<L$ 的 $f$，由你決定延拓成奇或偶
- PDE 題目的邊界條件會**替你決定**要用哪一種——這是它真正的用途""",
        "mermaid": r"""graph TD
  A{"f 定義在哪個區間？"} -->|"對稱區間 −L 到 L"| B{"f 有奇偶性嗎？"}
  A -->|"只給 0 到 L"| C[["半幅展開 自己選延拓"]]
  B -->|"偶函數"| D[["只算 an 餘弦級數"]]
  B -->|"奇函數"| E[["只算 bn 正弦級數"]]
  B -->|"都不是"| F[["an bn 都要算"]]
  C --> G{"邊界條件是什麼？"}
  G -->|"兩端固定為零"| E
  G -->|"兩端絕熱或自由"| D
  classDef core fill:#6D4FC2,stroke:#5A3FA8,color:#fff
  classDef op fill:#2E8B74,stroke:#25735F,color:#fff
  classDef sup fill:#7A7A7A,stroke:#5E5E5E,color:#fff,stroke-dasharray: 4 3
  class A,B,G op
  class C,D,E,F op
  class A core""",
        "deep": r"""### 為什麼奇偶性能砍掉一半

若 $f$ 是**偶函數**，則 $f(x)\sin\frac{n\pi x}{L}$ 是「偶×奇＝奇」，
在對稱區間 $[-L,L]$ 上積分必為 0，所以 $b_n=0$。
同時 $f(x)\cos\frac{n\pi x}{L}$ 是「偶×偶＝偶」，積分可折半再乘 2：

$$a_n=\frac{1}{L}\int_{-L}^{L}f\cos\frac{n\pi x}{L}dx=\frac{2}{L}\int_{0}^{L}f\cos\frac{n\pi x}{L}dx$$

奇函數同理，結論對調。

### 半幅展開（half-range expansion）

考題常只給 $f$ 在 $0<x<L$ 上的定義（例如「一根長 $L$ 的桿子，初始溫度分布 $f(x)$」），
這時 $f$ 在負半邊根本沒定義——**由你補**：

- 補成偶函數 → 得到**餘弦級數**（cosine half-range expansion）
- 補成奇函數 → 得到**正弦級數**（sine half-range expansion）

兩者在 $0<x<L$ 上都收斂到同一個 $f$，都是正確答案。
題目若沒指定，通常會說「展開成正弦級數」或「展開成餘弦級數」。

### 完整手算範例

把 $f(x)=x$（$0<x<L$）展開成**餘弦**級數。

**第 1 步**：偶延拓後 $b_n=0$，只算 $a_n$。

$$a_0=\frac{2}{L}\int_0^L x\,dx=\frac{2}{L}\cdot\frac{L^2}{2}=L$$

**第 2 步**：$n\ge1$ 時分部積分（$u=x$、$dv=\cos\frac{n\pi x}{L}dx$）：

$$a_n=\frac{2}{L}\int_0^{L}x\cos\frac{n\pi x}{L}dx
=\frac{2}{L}\left\{\left[\frac{Lx}{n\pi}\sin\frac{n\pi x}{L}\right]_0^L-\frac{L}{n\pi}\int_0^L\sin\frac{n\pi x}{L}dx\right\}$$

第一項在 $x=L$ 時 $\sin n\pi=0$、在 $x=0$ 時也是 0，整項消失。第二項：

$$-\frac{2}{n\pi}\int_0^L\sin\frac{n\pi x}{L}dx
=-\frac{2}{n\pi}\left[-\frac{L}{n\pi}\cos\frac{n\pi x}{L}\right]_0^L
=\frac{2L}{n^2\pi^2}\left[(-1)^n-1\right]$$

所以 $a_n=0$（$n$ 偶）、$a_n=-\frac{4L}{n^2\pi^2}$（$n$ 奇）。

**第 3 步**：

$$\boxed{\;x=\frac{L}{2}-\frac{4L}{\pi^2}\sum_{k=0}^{\infty}\frac{1}{(2k+1)^2}\cos\frac{(2k+1)\pi x}{L},\quad 0<x<L\;}$$

**驗算**：代 $x=0$，左邊 0，右邊 $\frac{L}{2}-\frac{4L}{\pi^2}\sum\frac{1}{(2k+1)^2}$。
已知 $\sum_{k\ge0}\frac{1}{(2k+1)^2}=\frac{\pi^2}{8}$，右邊 $=\frac{L}{2}-\frac{4L}{\pi^2}\cdot\frac{\pi^2}{8}=0$ ✓""",
        "sup": r"""〔補〕同一個 $f(x)=x$ 展開成正弦級數會得到完全不同的係數
$b_n=\frac{2L(-1)^{n+1}}{n\pi}$——兩個都對，差別在延拓方式
〔補〕餘弦級數在 $x=0,L$ 沒有跳躍，係數以 $1/n^2$ 衰減；正弦級數在端點有跳躍，只以 $1/n$ 衰減""",
    },
    {
        "name": "收斂定理：級數到底等不等於 f",
        "gap": "課堂教了結論 缺條件與 Parseval",
        "trap": "在跳躍點級數收斂到左右極限的平均，不等於函數值本身",
        "formulas": [
            {"tex": r"S(x_0)=\frac{f(x_0^-)+f(x_0^+)}{2}",
             "name": "跳躍點收斂值", "when": "x₀ 是第一類不連續點"},
        ],
        "compare": {
            "title": "級數在不同位置收斂到什麼",
            "cols": ["位置", "收斂值", "備註"],
            "rows": [
                ["連續點", "$f(x_0)$", "級數＝函數，可放心用"],
                ["跳躍點", "$\\frac{f(x_0^-)+f(x_0^+)}{2}$", "考卷最愛問這裡"],
                ["區間端點", "$\\frac{f(-L^+)+f(L^-)}{2}$", "週期延拓後端點也是跳躍點"],
            ],
        },
        "md": r"""- Dirichlet 條件是**充分**條件，不滿足不代表不收斂
- 工程上遇到的函數（分段光滑）幾乎都滿足
- 跳躍點的「平均值」現象叫 Gibbs 現象的近親，考選擇題常出""",
        "mermaid": "",
        "deep": r"""> **與課堂的銜接**：第 6 章已經把「連續點收斂到 $f$、跳躍點收斂到左右極限平均」
> 講得很細（老師還教了端點直接代回級數的操作）。這裡補的是**課堂沒給的三樣**：
> Dirichlet 條件的正式陳述、Parseval 等式、Gibbs 現象——逐字稿實測命中皆為 0。

### Dirichlet 收斂定理

設 $f$ 是週期 $2L$ 的函數，且在一個週期內

1. **分段連續**（至多有限個第一類不連續點），
2. **分段單調**（或分段光滑：$f'$ 分段連續），

則 $f$ 的 Fourier 級數在每一點 $x_0$ 都收斂，且

$$S(x_0)=\frac{f(x_0^-)+f(x_0^+)}{2}$$

在 $f$ 連續的點，$f(x_0^-)=f(x_0^+)=f(x_0)$，級數就收斂到 $f(x_0)$ 本身。

### 為什麼是「平均」——直覺

Fourier 部分和 $S_N$ 可以寫成 $f$ 與 Dirichlet 核的摺積：

$$S_N(x_0)=\frac{1}{2L}\int_{-L}^{L}f(t)\,D_N(x_0-t)\,dt$$

$D_N$ 是一個在原點有高峰、兩側對稱振盪的核。當 $N\to\infty$ 時它趨近 $\delta$，
但因為**左右對稱**，它從左邊取一半、從右邊取一半，於是在跳躍點自然給出兩側平均。

### 範例：方波

$$f(x)=\begin{cases}-1,&-\pi<x<0\\ \ \ 1,&0<x<\pi\end{cases}$$

$f$ 是奇函數，$a_n=0$。

$$b_n=\frac{2}{\pi}\int_0^{\pi}\sin nx\,dx=\frac{2}{\pi}\left[\frac{-\cos nx}{n}\right]_0^{\pi}
=\frac{2}{n\pi}\left[1-(-1)^n\right]$$

即 $b_n=\frac{4}{n\pi}$（$n$ 奇）、$0$（$n$ 偶）：

$$f(x)=\frac{4}{\pi}\left(\sin x+\frac{\sin 3x}{3}+\frac{\sin 5x}{5}+\cdots\right)$$

**在 $x=0$**：右邊每一項都是 0，級數值 $=0$。
而 $f(0^-)=-1$、$f(0^+)=1$，平均 $=\frac{-1+1}{2}=0$ ✓ 定理成立。

**在 $x=\pi/2$**：$f=1$，級數 $=\frac{4}{\pi}(1-\frac13+\frac15-\cdots)=\frac{4}{\pi}\cdot\frac{\pi}{4}=1$ ✓

### Parseval 等式（能量守恆）

$$\frac{1}{L}\int_{-L}^{L}|f(x)|^2dx=\frac{a_0^2}{2}+\sum_{n=1}^{\infty}\left(a_n^2+b_n^2\right)$$

考題用它「求某個平方倒數級數的和」。以上面的方波為例，左邊 $=\frac{1}{\pi}\int_{-\pi}^{\pi}1\,dx=2$，
右邊 $=\sum_{n\ \text{奇}}\left(\frac{4}{n\pi}\right)^2=\frac{16}{\pi^2}\sum_{k\ge0}\frac{1}{(2k+1)^2}$，
解得 $\sum_{k\ge0}\frac{1}{(2k+1)^2}=\frac{\pi^2}{8}$。""",
        "sup": r"""〔補〕Gibbs 現象：在跳躍點附近，部分和會「衝過頭」約 9%，且 $N$ 再大都不會消失，
只是振盪區間變窄——這是選擇題考點（Kreyszig §11.2）""",
    },
    {
        "name": "複數型 Fourier 級數",
        "gap": "影片未教",
        "trap": "$c_n$ 的指數是 $e^{-in\pi x/L}$（負號），展開式裡才是正號",
        "formulas": [
            {"tex": r"f(x)=\sum_{n=-\infty}^{\infty}c_n e^{in\pi x/L}",
             "name": "複數型級數", "when": "n 從負無窮到正無窮"},
            {"tex": r"c_n=\frac{1}{2L}\int_{-L}^{L}f(x)e^{-in\pi x/L}\,dx",
             "name": "複數係數", "when": "指數帶負號"},
            {"tex": r"c_0=\frac{a_0}{2},\quad c_n=\frac{a_n-ib_n}{2},\quad c_{-n}=\overline{c_n}",
             "name": "與實數型的換算", "when": "f 為實函數時"},
        ],
        "compare": {
            "title": "實數型 vs 複數型",
            "cols": ["比較軸", "實數型（a_n, b_n）", "複數型（c_n）"],
            "rows": [
                ["求和範圍", "$n=1$ 到 $\\infty$", "$n=-\\infty$ 到 $\\infty$"],
                ["係數個數", "兩組", "一組"],
                ["計算量", "兩個積分", "一個積分"],
                ["適合", "手算、實函數", "訊號系統、推導轉換"],
            ],
        },
        "md": r"""- 台科大 mustKnow 明列「含複數型」，不能只會實數型
- 複數型只要算**一個**積分，實務上更快
- $f$ 為實函數時 $c_{-n}=\overline{c_n}$，這是共軛對稱性""",
        "mermaid": "",
        "deep": r"""### 從 Euler 公式導出

把 $\cos\theta=\frac{e^{i\theta}+e^{-i\theta}}{2}$、$\sin\theta=\frac{e^{i\theta}-e^{-i\theta}}{2i}$
代入實數型級數，令 $\omega_n=\frac{n\pi}{L}$：

$$a_n\cos\omega_n x+b_n\sin\omega_n x
=a_n\frac{e^{i\omega_n x}+e^{-i\omega_n x}}{2}+b_n\frac{e^{i\omega_n x}-e^{-i\omega_n x}}{2i}$$

整理（用 $\frac{1}{i}=-i$）：

$$=\underbrace{\frac{a_n-ib_n}{2}}_{c_n}e^{i\omega_n x}+\underbrace{\frac{a_n+ib_n}{2}}_{c_{-n}}e^{-i\omega_n x}$$

把所有 $n$ 加起來，並令 $c_0=\frac{a_0}{2}$，就得到

$$f(x)=\sum_{n=-\infty}^{\infty}c_ne^{in\pi x/L}$$

### 係數公式的正交性根據

複指數系 $\{e^{in\pi x/L}\}$ 在 $[-L,L]$ 上帶共軛內積正交：

$$\int_{-L}^{L}e^{im\pi x/L}\overline{e^{in\pi x/L}}\,dx=\int_{-L}^{L}e^{i(m-n)\pi x/L}dx=\begin{cases}2L,&m=n\\0,&m\neq n\end{cases}$$

（$m\ne n$ 時積分出來是 $\frac{L}{i(m-n)\pi}\left[e^{i(m-n)\pi}-e^{-i(m-n)\pi}\right]$，
而 $e^{ik\pi}=e^{-ik\pi}=(-1)^k$ 對整數 $k$ 成立，故為 0。）

兩邊同乘 $\overline{e^{in\pi x/L}}=e^{-in\pi x/L}$ 再積分，即得

$$c_n=\frac{1}{2L}\int_{-L}^{L}f(x)e^{-in\pi x/L}dx\qquad\blacksquare$$

### 完整手算範例

求 $f(x)=e^{x}$ 在 $-\pi<x<\pi$（$L=\pi$）的複數型 Fourier 級數。

$$c_n=\frac{1}{2\pi}\int_{-\pi}^{\pi}e^{x}e^{-inx}dx=\frac{1}{2\pi}\int_{-\pi}^{\pi}e^{(1-in)x}dx
=\frac{1}{2\pi}\left[\frac{e^{(1-in)x}}{1-in}\right]_{-\pi}^{\pi}$$

$$=\frac{e^{(1-in)\pi}-e^{-(1-in)\pi}}{2\pi(1-in)}
=\frac{e^{\pi}e^{-in\pi}-e^{-\pi}e^{in\pi}}{2\pi(1-in)}$$

因為 $e^{\pm in\pi}=(-1)^n$：

$$c_n=\frac{(-1)^n(e^{\pi}-e^{-\pi})}{2\pi(1-in)}=\frac{(-1)^n\sinh\pi}{\pi(1-in)}$$

$$\boxed{\;e^{x}=\frac{\sinh\pi}{\pi}\sum_{n=-\infty}^{\infty}\frac{(-1)^n}{1-in}e^{inx},\quad -\pi<x<\pi\;}$$

**驗算**：$c_{-n}=\frac{(-1)^n\sinh\pi}{\pi(1+in)}=\overline{c_n}$ ✓（$f$ 是實函數，符合共軛對稱）""",
        "sup": r"""〔補〕$|c_n|$ 對 $n$ 作圖就是**振幅頻譜**，$\arg c_n$ 是**相位頻譜**——
訊號與系統整科都建立在這個觀點上（Kreyszig §11.4）""",
    },
    {
        "name": "Fourier 積分與 Fourier 轉換",
        "gap": "影片未教",
        "trap": "轉換與反轉換的 $\\frac{1}{2\\pi}$ 放哪一邊各書不同，考卷會給定義，照抄它的",
        "formulas": [
            {"tex": r"\mathcal{F}\{f\}=\hat{f}(\omega)=\int_{-\infty}^{\infty}f(x)e^{-i\omega x}\,dx",
             "name": "Fourier 轉換", "when": "f 絕對可積"},
            {"tex": r"f(x)=\frac{1}{2\pi}\int_{-\infty}^{\infty}\hat{f}(\omega)e^{i\omega x}\,d\omega",
             "name": "反轉換", "when": "1/2π 在反轉換這邊"},
            {"tex": r"\mathcal{F}\{f*g\}=\hat{f}(\omega)\,\hat{g}(\omega)",
             "name": "摺積定理", "when": "時域摺積＝頻域相乘"},
            {"tex": r"\mathcal{F}\{f'\}=i\omega\,\hat{f}(\omega)",
             "name": "微分性質", "when": "解 PDE 的關鍵"},
        ],
        "compare": {
            "title": "Fourier 級數 vs Fourier 轉換 vs Laplace 轉換",
            "cols": ["比較軸", "Fourier 級數", "Fourier 轉換", "Laplace 轉換"],
            "rows": [
                ["對象", "週期函數", "非週期、整條實線", "$t\\ge0$ 的函數"],
                ["頻率", "離散 $n\\pi/L$", "連續 $\\omega$", "複數 $s=\\sigma+i\\omega$"],
                ["結果", "係數數列 $c_n$", "函數 $\\hat{f}(\\omega)$", "函數 $F(s)$"],
                ["存在條件", "分段光滑", "絕對可積", "指數階"],
                ["典型用途", "有界區域 PDE", "無界區域 PDE", "初值問題 ODE"],
            ],
        },
        "md": r"""- 週期 $2L\to\infty$ 時，離散頻率 $\frac{n\pi}{L}$ 變密集，求和變積分——這就是 Fourier 積分
- 中央 mustKnow 明列「利用卷積定理、頻率微分等重要性質進行證明或求值」
- 拉氏處理 $t\ge0$ 的初值問題；Fourier 處理整條線上的邊界問題，分工不同""",
        "mermaid": r"""graph TD
  A{"問題定義在哪個區域？"} -->|"有限區間且週期"| B[["Fourier 級數 離散頻率"]]
  A -->|"無限或半無限"| C[["Fourier 積分與轉換"]]
  A -->|"時間 t 大於等於 0 的初值問題"| D[["Laplace 轉換"]]
  C --> E{"函數有奇偶性嗎？"}
  E -->|"偶函數"| F[["餘弦轉換"]]
  E -->|"奇函數"| G[["正弦轉換"]]
  E -->|"都不是"| H[["完整複數轉換"]]
  classDef core fill:#6D4FC2,stroke:#5A3FA8,color:#fff
  classDef op fill:#2E8B74,stroke:#25735F,color:#fff
  classDef sup fill:#7A7A7A,stroke:#5E5E5E,color:#fff,stroke-dasharray: 4 3
  class A,E op
  class B,D op
  class C,F,G,H sup""",
        "deep": r"""### 從級數過渡到積分

週期 $2L$ 的複數型級數是 $f(x)=\sum_n c_ne^{i\omega_n x}$，其中 $\omega_n=\frac{n\pi}{L}$，
相鄰頻率間距 $\Delta\omega=\frac{\pi}{L}$。代入 $c_n$：

$$f(x)=\sum_{n=-\infty}^{\infty}\left[\frac{1}{2L}\int_{-L}^{L}f(t)e^{-i\omega_n t}dt\right]e^{i\omega_n x}
=\frac{1}{2\pi}\sum_{n}\left[\int_{-L}^{L}f(t)e^{-i\omega_n t}dt\right]e^{i\omega_n x}\Delta\omega$$

（用了 $\frac{1}{2L}=\frac{\Delta\omega}{2\pi}$。）

當 $L\to\infty$，$\Delta\omega\to0$，右邊的 Riemann 和變成積分：

$$f(x)=\frac{1}{2\pi}\int_{-\infty}^{\infty}\left[\int_{-\infty}^{\infty}f(t)e^{-i\omega t}dt\right]e^{i\omega x}d\omega$$

中括號就是 $\hat{f}(\omega)$。$\blacksquare$

> **這段推導本身就是考點**：問「Fourier 轉換如何由 Fourier 級數導出」時照這條寫。

### 常用轉換對（必背）

| $f(x)$ | $\hat{f}(\omega)$ |
|---|---|
| $e^{-a\|x\|}$，$a>0$ | $\dfrac{2a}{a^2+\omega^2}$ |
| $e^{-ax^2}$，$a>0$ | $\sqrt{\dfrac{\pi}{a}}\,e^{-\omega^2/(4a)}$ |
| 矩形脈衝 $\mathbb{1}_{[-a,a]}$ | $\dfrac{2\sin a\omega}{\omega}$ |
| $\delta(x)$ | $1$ |

### 性質整理（考題直接用）

$$\mathcal{F}\{f(x-a)\}=e^{-ia\omega}\hat{f}(\omega)\qquad\text{（時移）}$$
$$\mathcal{F}\{e^{iax}f(x)\}=\hat{f}(\omega-a)\qquad\text{（頻移）}$$
$$\mathcal{F}\{f^{(n)}\}=(i\omega)^n\hat{f}(\omega)\qquad\text{（微分變乘法——解 PDE 的核心）}$$
$$\mathcal{F}\{xf(x)\}=i\frac{d\hat{f}}{d\omega}\qquad\text{（頻率微分）}$$

### 完整手算範例

求 $f(x)=e^{-a|x|}$（$a>0$）的 Fourier 轉換。

$$\hat{f}(\omega)=\int_{-\infty}^{\infty}e^{-a|x|}e^{-i\omega x}dx
=\int_{-\infty}^{0}e^{ax}e^{-i\omega x}dx+\int_{0}^{\infty}e^{-ax}e^{-i\omega x}dx$$

第二個積分：

$$\int_0^{\infty}e^{-(a+i\omega)x}dx=\left[\frac{e^{-(a+i\omega)x}}{-(a+i\omega)}\right]_0^{\infty}=\frac{1}{a+i\omega}$$

（上限收斂因為 $a>0$。）第一個積分令 $x\to-x$ 後同理得 $\frac{1}{a-i\omega}$。相加：

$$\hat{f}(\omega)=\frac{1}{a-i\omega}+\frac{1}{a+i\omega}=\frac{(a+i\omega)+(a-i\omega)}{a^2+\omega^2}=\boxed{\frac{2a}{a^2+\omega^2}}$$

**驗算**：$\hat{f}$ 是實偶函數 ✓（因為 $f$ 是實偶函數，理論上必然如此）。

**延伸考點**：把這個結果代進反轉換，可以得到
$\int_0^{\infty}\frac{\cos\omega x}{a^2+\omega^2}d\omega=\frac{\pi}{2a}e^{-a|x|}$——
用 Fourier 轉換算出一個原本很難的瑕積分，這是常見的考法。""",
        "sup": r"""〔補〕Parseval（Plancherel）定理：$\int|f|^2dx=\frac{1}{2\pi}\int|\hat f|^2d\omega$，
物理意義是時域能量＝頻域能量
〔補〕定義的 $\frac{1}{2\pi}$ 有三種放法（全放反轉換／全放正轉換／各放 $\frac{1}{\sqrt{2\pi}}$），
Kreyszig 用對稱版 $\frac{1}{\sqrt{2\pi}}$。**考卷一定會給定義，照它的寫**""",
    },
]
