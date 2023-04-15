title: 深度学习中的矩阵运算
toc: true
date: 2023-04-15 07:46:48
tags: [Matrix, Neural Network]
categories: Notes
math: true
---

作为数学学渣，最近复习深度学习中的一些矩阵运算，做一些推导并记录如下。

<div style="display: none">
$$
\require{color}
\require{unicode}
\definecolor{blue}{rgb}{0.16, 0.32, 0.75}
\definecolor{red}{rgb}{0.9, 0.17, 0.31}
$$
</div>

## 点积(dot product)

### 向量点积

Dot product 运算仅定义在两个向量上，输出一个标量，也称为 "scalar product"。

坐标定义：假设有两个向量
$\color {red}{\mathbf {a} =[a_{1},a_{2},\cdots ,a_{n}]}$ 和
$\color {blue}{\mathbf {b} =[b_{1},b_{2},\cdots ,b_{n}]}$ [^comment-dot-product-requirement]，则 dot product 定义为：

[^comment-dot-product-requirement]: 注意这里的表示要求向量的座标是基于一对正交
  基的，另外注意这里没有定义行向量或列向量，因为这是坐标形式，不关心向量是行向
  量还是列向量

$$
\mathbf {\color {red}{a}} \cdot \mathbf {\color {blue}{b}}
= \sum_{i=1}^{n}{\color {red}{a}\_{i} \color {blue}{b}\_{i}}
={\color {red} a\_1}{\color {blue}b\_1}+{\color {red}a\_2}{\color {blue}b\_2}+\cdots +{\color {red}a\_n}{\color {blue}b\_n}
$$

还可以把 dot product 理解成是矩阵的线性变换，写成矩阵乘法，此时
$\color{red}{\mathbf{a}}$ 与 $\color{blue}{\mathbf{b}}$ 都是列向量，定义如下：

$$
\mathbf {\color {red}{a}} \cdot \mathbf {\color {blue}{b}}
= \begin{bmatrix}{\color{red} a\_1} \\\\\vdots \\\\ {\color{red}a\_n} \end{bmatrix}
  \cdot
  \begin{bmatrix}{\color{blue}b\_1} \\\\\vdots \\\\ {\color{blue}b\_n} \end{bmatrix}
= {\color {red} a\_1}{\color {blue}b\_1}+{\color {red}a\_2}{\color {blue}b\_2}+\cdots +{\color {red}a\_n}{\color {blue}b\_n}
= \begin{bmatrix}{\color{red}a\_1} &\cdots & {\color{red}a\_n}\end{bmatrix}
  \begin{bmatrix}{\color{blue}b\_1} \\\\\vdots \\\\ {\color{blue}b\_n} \end{bmatrix}
= \mathbf {\color {red}{a}} ^T \mathbf {\color {blue}{b}}
$$


### 矩阵与矩阵点积

严格来说，点积的输入只能是两个向量，不存在矩阵和矩阵，矩阵和向量的点积，但矩阵
计算方便，人们扩充了定义。先看矩阵和矩阵，可以认为矩阵就是列向量的集合，因此点
积就是列向量分别做点积[^ref-matlab-dot]。

[^ref-matlab-dot]: 此处参考 matlab dot product 定义：
    https://www.mathworks.com/help/matlab/ref/dot.html#bt9p8vi-1_1

$$
{\color{red}\mathbf {A}} \cdot {\color{blue}\mathbf {B}}
= \begin{bmatrix}{\color{red}\mathbf{a}\_1} & \cdots & {\color{red}\mathbf{a}\_n}\end{bmatrix}
  \cdot
  \begin{bmatrix}{\color{blue}\mathbf{b}\_1} &\cdots & {\color{blue}\mathbf{b}\_n}\end{bmatrix}
= \begin{bmatrix}{\color{red}\mathbf{a}\_1} \cdot {\color{blue}\mathbf{b}\_1}
                 & \cdots
                 & {\color{red}\mathbf{a}\_n} \cdot {\color{blue}\mathbf{b}\_n}\end{bmatrix}
$$

上式中的 $\mathbf{a}_i, \mathbf{b}_i$ 都是列向量。另外注意由于 $\mathbf{a}_i
\cdot \mathbf{b}_i$ 的结果是标量，所以最终的结果是一个行向量。

### 矩阵与向量点积

矩阵和向量的点积本质上是将向量扩充再当成矩阵和矩阵的点积，定义如下：

$$
{\color{red}\mathbf {A}_{n \times m}} \cdot {\color{blue}\mathbf {v}}
= \begin{bmatrix}{\color{red}\mathbf{a}\_1} & \cdots & {\color{red}\mathbf{a}\_m}\end{bmatrix}
  \cdot
  \begin{bmatrix}{\color{blue}\mathbf{v}} &\cdots & {\color{blue}\mathbf{v}}\end{bmatrix}
= \begin{bmatrix}{\color{red}\mathbf{a}\_1} \cdot {\color{blue}\mathbf{v}}
                 & \cdots
                 & {\color{red}\mathbf{a}\_m} \cdot {\color{blue}\mathbf{v}}\end{bmatrix}
$$

此时结果为行向量。考虑到向量的点积也可以写成矩阵乘法的形式
${\color{red}\mathbf{a}} \cdot {\color{blue}\mathbf{b}} = {\color{red}\mathbf{a}^T} {\color{blue}\mathbf{b}}$
，因此有

$$
\begin{align}
{\color{red}\mathbf {A}\_{n \times m}} \cdot {\color{blue}\mathbf {v}}
&= \begin{bmatrix}{\color{red}\mathbf{a}\_1} \cdot {\color{blue}\mathbf{v}}
                 & \cdots
                 & {\color{red}\mathbf{a}\_m} \cdot {\color{blue}\mathbf{v}}\end{bmatrix}
= \begin{bmatrix}{\color{red}\mathbf{a}\_1^T} {\color{blue}\mathbf{v}}
                 & \cdots
                 & {\color{red}\mathbf{a}\_m^T} {\color{blue}\mathbf{v}}\end{bmatrix}
\\\\
({\color{red}\mathbf {A}} \cdot {\color{blue}\mathbf {v}})^T
&= \begin{bmatrix}{\color{red}\mathbf{a}\_1^T} {\color{blue}\mathbf{v}}
                 \\\\ \cdots
                 \\\\ {\color{red}\mathbf{a}\_m^T} {\color{blue}\mathbf{v}}\end{bmatrix}
=\begin{bmatrix}
    {\color{red}\mathbf{a}\_1^T} \\\ \vdots \\\ {\color{red}\mathbf{a}\_m^T}
  \end{bmatrix} {\color{blue}\mathbf{v}}
= {\color{red}(\mathbf{A}^T)\_{m \times n}}{\color{blue}\mathbf{v}\_{n \times 1}}
\\\\
{\color{red}\mathbf {A}} \cdot {\color{blue}\mathbf {v}}
&= \big({\color{red}\mathbf{A}^T}{\color{blue}\mathbf{v}}\big)\^T
= {\color{blue}\mathbf{v}\^T}{\color{red}\mathbf{A}}
\end{align}
$$

当然，上述式子中，我们严格按数学上的定义：向量就是“列”向量。这个假设不太方便，
因为输入 $\mathbf{x}$ 是列向量，但输出 $\mathbf{A} \cdot \mathbf{x}$ 却是行向
量。但实际上为了方便，我们也可以按“列”来排列输出结果，例如在深度学习中，单个输
出 $y_i = \mathbf{w_i} \cdot \mathbf{x} + b$，则结果列向量：

$$
\mathbf{y}_{m \times 1}
= \begin{bmatrix} y_1 \\\\ y_2 \\\\ \vdots \\\\ y_m \end{bmatrix}
= \begin{bmatrix}
    \mathbf{w_1} \cdot \mathbf{x} + b \\\\
    \mathbf{w_2} \cdot \mathbf{x} + b \\\\
    \vdots \\\\
    \mathbf{w_m} \cdot \mathbf{x} + b
  \end{bmatrix}
= \begin{bmatrix}
    \mathbf{w_1}^T \mathbf{x} + b \\\\
    \mathbf{w_2}^T \mathbf{x} + b \\\\
    \vdots \\\\
    \mathbf{w_m}^T \mathbf{x} + b
  \end{bmatrix}
= \begin{bmatrix}
    \mathbf{w_1}^T \\\\
    \mathbf{w_2}^T \\\\
    \vdots \\\\
    \mathbf{w_m}^T
  \end{bmatrix} \mathbf{x} + b
= \mathbf{W}^T \mathbf{x} + b
= (\mathbf{W}^T)\_{m \times n} \mathbf{x}\_{n \times 1} + b
$$

因此不管是按行还是按列切片，关键在于点积 dot product 可以转换成矩阵乘法的形式。

## 矩阵乘法

### 矩阵与向量相乘

考虑一个矩阵 $\mathbf{A} \in \mathbb{R}^{m \times n}$ 和向量 $\mathbf{x} \in \mathbb{R}^n$，矩阵和向量的乘法定义为[^ref-matrix-mul]：

[^ref-matrix-mul]: 参考：https://mbernste.github.io/posts/matrix_vector_mult/

$$
\mathbf{A}\mathbf{x} = x\_1 \mathbf{a}\_{\*,1} + x\_2 \mathbf{a}\_{\*,2} + \cdots + x\_n \mathbf{a}\_{\*,n}
$$

其中 $\mathbf{a}_{*, i}$ 代表矩阵 $\mathbf{A}$ 的第 $i$ 个列向量。

矩阵乘法有几种不同的理解方式，其中一种理解方式是“线性变换”[^ref-3b1b-matmul]，
即向量 $\mathbf{x}$ 所在空间的基坐标，分别经过变换后，$\mathbf{x}$ 所在的坐标。因此，跟上述的定义基本一致：

[^ref-3b1b-matmul]: 关于线性变换，强推 3blue1brown 的线性代数系列视频，其中[第
  三章](https://www.youtube.com/watch?v=kYB8IZa5AuE) 关于线性变换，
  [第四章](https://www.youtube.com/watch?v=XkY2DOUCWMU) 关于矩阵乘法

$$
\mathbf{A}{\color{brown}\mathbf{x}} =
  \begin{bmatrix}
   {\color {red} a\_{11}} & {\color {blue} a\_{12}} & \cdots & {\color {green}a\_{1n}} \\\\
   {\color {red} a\_{21}} & {\color {blue} a\_{22}} & \cdots & {\color {green}a\_{2n}} \\\\
   \vdots & \vdots & \ddots & \vdots \\\\
   {\color {red} a\_{m1}} & {\color {blue} a\_{m2}} & \cdots & {\color {green}a\_{mn}}
  \end{bmatrix}
  \begin{bmatrix}
   {\color {brown} x\_1} \\\\ {\color {brown} x\_2} \\\\ \vdots \\\\ {\color {brown} x\_n}
  \end{bmatrix}
= {\color{brown} x\_1} \begin{bmatrix}
   {\color {red} a\_{11}} \\\\
   {\color {red} a\_{21}} \\\\
   \vdots \\\\
   {\color {red} a\_{m1}}
  \end{bmatrix} +
  {\color{brown} x\_2} \begin{bmatrix}
   {\color {blue} a\_{12}} \\\\
   {\color {blue} a\_{22}} \\\\
   \vdots \\\\
   {\color {blue} a\_{m2}}
  \end{bmatrix} + \cdots +
  {\color{brown} x\_n} \begin{bmatrix}
   {\color {green} a\_{1n}} \\\\
   {\color {green} a\_{2n}} \\\\
   \vdots \\\\
   {\color {green} a\_{mn}}
  \end{bmatrix}
= 
  \begin{bmatrix}
  {\color{brown}x_1}{\color {red} a\_{11}} + {\color{brown}x_2}{\color {blue} a\_{12}} + \cdots + {\color{brown}x_n}{\color {green}a\_{1n}} \\\\
  {\color{brown}x_1}{\color {red} a\_{21}} + {\color{brown}x_2}{\color {blue} a\_{22}} + \cdots + {\color{brown}x_n}{\color {green}a\_{2n}} \\\\
  \vdots \\\\
  {\color{brown}x_1}{\color {red} a\_{m1}} + {\color{brown}x_2}{\color {blue} a\_{m2}} + \cdots + {\color{brown}x_n}{\color {green}a\_{mn}}
  \end{bmatrix}
$$

还有一种理解和上面的“点积”类似，把矩阵看作是 $m$ 个行向量，每个向量都和 $x$ 作
点积。如下：

$$
\mathbf{A}{\color{brown}\mathbf{x}} =
  \begin{bmatrix}
   {\color {red} a\_{11}} & {\color {red} a\_{12}} & \cdots & {\color {red}a\_{1n}} \\\\
   {\color {blue} a\_{21}} & {\color {blue} a\_{22}} & \cdots & {\color {blue}a\_{2n}} \\\\
   \vdots & \vdots & \ddots & \vdots \\\\
   {\color {green} a\_{m1}} & {\color {green} a\_{m2}} & \cdots & {\color {green}a\_{mn}}
  \end{bmatrix}
  \begin{bmatrix}
   {\color {brown} x\_1} \\\\ {\color {brown} x\_2} \\\\ \vdots \\\\ {\color {brown} x\_n}
  \end{bmatrix}
= \begin{bmatrix}
   {\color {red} \mathbf{a}\_{1,\*}} \cdot {\color{brown}\mathbf{x}} \\\\
   {\color {blue} \mathbf{a}\_{2,\*}} \cdot {\color{brown}\mathbf{x}} \\\\
   \vdots \\\\
   {\color {green} \mathbf{a}\_{m,\*}} \cdot {\color{brown}\mathbf{x}}
  \end{bmatrix}
$$

### 矩阵与矩阵乘法

延续线性变换的观点，矩阵和矩阵的相乘，可以看作变换的组合。矩阵 $\mathbf{B}$ 的
每个列可以认为是变换后的基向量，而 $\mathbf{A} \mathbf{B}$ 可以认为是把每个基
向量再做一次线性变换 $\mathbf{A}$。如下：

$$
\mathbf{A}\mathbf{B}
= \mathbf{A} \begin{bmatrix}
    {\color{red}\mathbf{b}\_{\*,1}} & {\color{blue}\mathbf{b}\_{\*,2}} & \cdots & {\color{green}\mathbf{b}\_{\*,n}}
  \end{bmatrix}
= \begin{bmatrix}
    \mathbf{A} {\color{red}\mathbf{b}\_{\*,1}}
    & \mathbf{A} {\color{blue}\mathbf{b}\_{\*,2}}
    & \cdots
    & \mathbf{A} {\color{green}\mathbf{b}\_{\*,n}}
  \end{bmatrix}
$$

如果再用上面的“点积”观点展开，则会是这样：

$$
\mathbf{A}\mathbf{B}
= \mathbf{A} \begin{bmatrix}
    \mathbf{b}\_{\*,1} & \mathbf{b}\_{\*,2} & \cdots & \mathbf{b}\_{\*,n}
  \end{bmatrix}
= \begin{bmatrix}
    \begin{bmatrix}
        \mathbf{a}\_{1,\*} \\\\
        \mathbf{a}\_{2,\*} \\\\
        \vdots \\\\
        \mathbf{a}\_{m,\*}
    \end{bmatrix}
    \mathbf{b}\_{\*,1}
    & 
    \begin{bmatrix}
        \mathbf{a}\_{1,\*} \\\\
        \mathbf{a}\_{2,\*} \\\\
        \vdots \\\\
        \mathbf{a}\_{m,\*}
    \end{bmatrix}
    \mathbf{b}\_{\*,2}
    & \cdots
    & 
    \begin{bmatrix}
        \mathbf{a}\_{1,\*} \\\\
        \mathbf{a}\_{2,\*} \\\\
        \vdots \\\\
        \mathbf{a}\_{m,\*}
    \end{bmatrix}
    \mathbf{b}\_{\*,n}
  \end{bmatrix}
= \begin{bmatrix}
    \mathbf{a}\_{1,\*} \cdot \mathbf{b}\_{\*,1} & \mathbf{a}\_{1,\*} \cdot \mathbf{b}\_{\*,2} & \cdots & \mathbf{a}\_{1,\*} \cdot \mathbf{b}\_{\*,n} \\\\
    \mathbf{a}\_{2,\*} \cdot \mathbf{b}\_{\*,1} & \mathbf{a}\_{2,\*} \cdot \mathbf{b}\_{\*,2} & \cdots & \mathbf{a}\_{2,\*} \cdot \mathbf{b}\_{\*,n} \\\\
    \vdots & \vdots & \ddots & \vdots \\\\
    \mathbf{a}\_{m,\*} \cdot \mathbf{b}\_{\*,1} & \mathbf{a}\_{m,\*} \cdot \mathbf{b}\_{\*,2} & \cdots & \mathbf{a}\_{m,\*} \cdot \mathbf{b}\_{\*,n}
  \end{bmatrix}
$$

这个也就是我们熟悉的，每个元素等于行乘列的形式：

$$
(\mathbf{A}\mathbf{B})\_{ij}
= {\color{red}\mathbf{a}\_{i,\*}} \cdot {\color{blue}\mathbf{b}\_{\*,j}}
= \begin{bmatrix}
    \cdots & \cdots & \cdots & \cdots \\\\
    {\color{red}a\_{i1}} & {\color{red}a\_{i2}} & \cdots & {\color{red}a\_{in}} \\\\
    \cdots & \cdots & \cdots & \cdots
  \end{bmatrix}
  \begin{bmatrix}
    \vdots & {\color{blue}b\_{1,j}} & \vdots \\\\
    \vdots & {\color{blue}b\_{2,j}} & \vdots \\\\
    \vdots & \vdots & \vdots \\\\
    \vdots & {\color{blue}b\_{n,j}} & \vdots 
  \end{bmatrix}
$$

## 按元素操作

即将两个矩阵对应位置上的元素做相应的操作。也称为 element-wise operation.

### 按元素乘法

按元素乘法有个特殊的名字，叫 [Hadamard product](https://en.wikipedia.org/wiki/Hadamard_product_(matrices))
，一般记作 $A \circ B$ 或 $A \odot B$，即将相同位置的元素相乘

$$
\begin{bmatrix}
    a\_{11} & a\_{12} & \cdots & a\_{1n} \\\\
    a\_{21} & {\color{red}a\_{22}} & \cdots & a\_{2n} \\\\
    \vdots & \vdots & \ddots & \vdots \\\\
    a\_{m1} & a\_{m2} & \cdots & a\_{mn}
  \end{bmatrix}
  \circ
  \begin{bmatrix}
    b\_{11} & b\_{12} & \cdots & b\_{1n} \\\\
    b\_{21} & {\color{blue}b\_{22}} & \cdots & b\_{2n} \\\\
    \vdots & \vdots & \ddots & \vdots \\\\
    b\_{m1} & b\_{m2} & \cdots & b\_{mn}
  \end{bmatrix}
= \begin{bmatrix}
    a\_{11}b\_{11}  & a\_{12}b\_{12}  & \cdots & a\_{1n}b\_{1n}  \\\\
    a\_{21}b\_{21}  & {\color{red}a\_{22}}{\color{blue}b\_{22}}  & \cdots & a\_{2n}b\_{2n}  \\\\
    \vdots & \vdots & \ddots & \vdots \\\\
    a\_{m1}b\_{m1}  & a\_{m2}b\_{m2}  & \cdots & a\_{mn}b\_{mn}
  \end{bmatrix}
$$

其它操作也类似，如加法减法等

### 广播 broadcast

数学上，按元素操作只在矩阵的形状相同时才有效。但在实际应用中，可以尝试把“低维”
的元素复制 N 份做填充，这就是 broadcast 机制。其实在介绍矩阵和向量的点积是已经
用过这个操作了。示例如下：

$$
\mathbf{A} \circ \mathbf{v}
= \mathbf{A} \circ \begin{bmatrix}\mathbf{v} & \cdots & \mathbf{v} \end{bmatrix}
$$

另外注意，这里依旧是以“列”为第一维，“行”为第二维。而在 numpy 中，第 `0` 维是行：

```
>>> w = np.array([[1,2,3],[4,5,6],[7,8,9]])
>>> w
array([[1, 2, 3],
       [4, 5, 6],
       [7, 8, 9]])
>>> x = np.array([1,2,3])
>>> x
array([1, 2, 3])
>>> w * x
array([[ 1,  4,  9],
       [ 4, 10, 18],
       [ 7, 16, 27]])
```

这个特性可以一直往高维推广，具体机制参考 [numpy broadcast](https://numpy.org/doc/stable/user/basics.broadcasting.html)。

## 求导

深度学习中最重要的数学知识就是对矩阵求导了，[The Matrix Calculus You Need For Deep Learning](https://arxiv.org/abs/1802.01528)
这篇论文针对性地做了综述。下面的知识算是摘录其中一些部分加深记忆[^ref-chain-rule]。矩阵求导更复杂的内容，
参考 wiki: [Matrix calculus](https://en.wikipedia.org/wiki/Matrix_calculus)

[^ref-chain-rule]: 这里就不谈链式法则相关的内容了，感兴趣的可以参考我的前一篇
  文章 [自动微分（Automatic Differentiation）：算法篇](http://lotabout.me/2023/Auto-Differentiation-Part-1-Algorithm/)

### 向量点积求导

考虑 $y = \mathbf{w} \cdot \mathbf{x}$，因为有多个输入，于是导数为偏导向量，这
里我们用行向量表示：

$$
\frac{\partial y}{\partial \mathbf{x}}
= \begin{bmatrix}
    \frac{\partial y}{\partial x_1} &
    \cdots &
    \frac{\partial y}{\partial x_n}
  \end{bmatrix}
= \begin{bmatrix}
    \frac{\partial (w_1 x_1 + \cdots + w_n x_n)}{\partial x_1} &
    \cdots &
    \frac{\partial (w_1 x_1 + \cdots + w_n x_n)}{\partial x_n}
  \end{bmatrix}
= \begin{bmatrix} w_1 & \cdots & w_n \end{bmatrix}
= \mathbf{w}^T
$$

同理对 $\mathbf{w}$ 求导的值为：

$$
\frac{\partial y}{\partial \mathbf{w}}
= \mathbf{x}^T
$$



### Jacobian Matrix

我们知道“导数”要求的是“变化”，即如果输入 $x$ 有微小的变化 $\Delta x$ 时，输入
$y$ 的变化 $\Delta y$。那么如果有多个输入 $x_1, \cdots, x_n$ 和多个输出 $y_1 =
f_1(\mathbf{x}), \cdots, y_m = f_m(\mathbf{x})$，则任意输入 $x_i$ 有变化，任意
输出 $y_j$ 就有可能有变化。于是它们间的偏导关系是一个矩阵，记做：

$$
\mathbf {J}
=\begin{bmatrix}\frac{\partial y_1}{\partial \mathbf{x}} \\\\ \vdots \\\\ \frac{\partial y_m}{\partial \mathbf{x}} \end{bmatrix}
=\begin{bmatrix}{\dfrac {\partial f_{1}}{\partial x_{1}}}&\cdots &{\dfrac {\partial f_{1}}{\partial x_{n}}}\\\\\vdots &\ddots &\vdots \\\\{\dfrac {\partial f_{m}}{\partial x_{1}}}&\cdots &{\dfrac {\partial f_{m}}{\partial x_{n}}}\end{bmatrix}
$$

### 矩阵与向量点积求导

如果有 $m$ 个输出，$y_j = \mathbf{w_j} \cdot \mathbf{x}$（注意 $\mathbf{w_j}$
本身是 $n$ 维的向量，向量个数是 $m$）。对 $\mathbf{x}$ 的求导比较直观：

$$
\frac{\partial \mathbf{y}}{\partial \mathbf{x}}
= \begin{bmatrix}
    \frac{\partial y_1}{\partial \mathbf{x}} \\\\
    \frac{\partial y_2}{\partial \mathbf{x}} \\\\
    \vdots \\\\
    \frac{\partial y_m}{\partial \mathbf{x}}
  \end{bmatrix}
= \begin{bmatrix}
    \mathbf{w}_1^T \\\\
    \mathbf{w}_2^T \\\\
    \vdots \\\\
    \mathbf{w}_m^T
  \end{bmatrix}
$$

但是，如果对 $\mathbf{w}$ 求导，$\mathbf{w}$ 有 $m \times n$ 个元素，因此求导
的结果是一个 $m \times (m \times n)$ 的 Jacobian 矩阵。特别复杂。所幸，在深度
学习中，求导的目的是为了做梯度下降，所以为 `0` 的导数实际上也没用。而通过
$y_j$ 的定义，我们知道如果 $i \ne j$ 则 $\frac{\partial y_i}{\partial \mathbf{w}_j} = 0$。
于是我们去除这些为 $0$ 的项，保留：

$$
\frac{\partial \mathbf{y}}{\partial \mathbf{w}}
= \begin{bmatrix}
    \frac{\partial y_1}{\partial \mathbf{w}_1} \\\\
    \frac{\partial y_2}{\partial \mathbf{w}_2} \\\\
    \vdots \\\\
    \frac{\partial y_m}{\partial \mathbf{w}_m}
  \end{bmatrix}
= \begin{bmatrix}
    \mathbf{x}^T \\\\
    \mathbf{x}^T \\\\
    \vdots \\\\
    \mathbf{x}^T
  \end{bmatrix}
$$

如果我们把 $\mathbf{w}$ 写成矩阵形式 $\mathbf{W} = [\mathbf{w}_1 \cdots,
\mathbf{w}_m]$，此时 $\mathbf{y} = \mathbf{W} \cdot \mathbf{x} = \mathbf{W}^T \mathbf{x}$，则上面的结论可以写成：

$$
\begin{eqnarray}
\frac{\partial \mathbf{y}}{\partial \mathbf{x}} = \mathbf{W}^T
\end{eqnarray}
$$

$$
\begin{eqnarray}
\frac{\partial \mathbf{y}}{\partial \mathbf{W}}
= \begin{bmatrix}
    \mathbf{x}^T \\\\
    \mathbf{x}^T \\\\
    \vdots \\\\
    \mathbf{x}^T
  \end{bmatrix}
= \begin{bmatrix}\mathbf{x} \cdots \mathbf{x} \end{bmatrix}^T
\end{eqnarray}
$$

### 矩阵与向量乘法求导

其实上一节的矩阵与向量点积的求导已经得出结论了。当 $\mathbf{y} = \mathbf{A} \mathbf{x}$ 时，有

$$
\begin{align}
\frac{\partial \mathbf{y}}{\partial \mathbf{x}} &= \mathbf{A} \\\\
\frac{\partial \mathbf{y}}{\partial \mathbf{A}} &= \begin{bmatrix}\mathbf{x} \cdots \mathbf{x} \end{bmatrix} ^T
\end{align}
$$

这里我们再从数值的角度分析一下，已知 $y_i = \sum_{j}{a_{ik}x_j}$，则有：

$$
\frac{\partial y_i}{\partial x_j}
= \frac{a_{i1}x_1+\cdots+a_{mn}{x_n}}{\partial x_j} = a_{ij}
$$

再次

$$
\frac{\partial y_i}{\partial w_{ij}}
= \frac{a_{i1}x_1+\cdots+a_{mn}{x_n}}{\partial w_{ij}} = x_j
$$

写成矩阵形式就是结论部分。

### 矩阵与矩阵乘法求导

这部分过于复杂，且符号也没有统一，后续如果有用到再进行补充。

### 按元素(element-wise)操作

将按元素操作记为 $\unicode{x2D54}$，考虑 $\mathbf{y} = \mathbf{f(u)} \unicode{x2D54} \mathbf{g(v)}$，
且向量 $\mathbf{u}, \mathbf{v}, \mathbf{y}$ 有相同的维度。写成如下形式：

$$
\begin{bmatrix}
y_1 \\\\ y_2 \\\\ \vdots \\\\ y_n
\end{bmatrix}
= \begin{bmatrix}
    f_1(\mathbf{u}) \unicode{x2D54} g_1(\mathbf{v}) \\\\
    f_2(\mathbf{u}) \unicode{x2D54} g_2(\mathbf{v}) \\\\
    \vdots \\\\
    f_n(\mathbf{u}) \unicode{x2D54} g_n(\mathbf{v})
  \end{bmatrix}
$$

于是偏导则变成了 Jacobian 矩阵的形式：

$$
\mathbf{J_u}
= \frac{\partial \mathbf{y}}{\partial \mathbf{u}}
= \begin{bmatrix}
    \frac{\partial y_1}{\partial \mathbf{u}} \\\\
    \frac{\partial y_2}{\partial \mathbf{u}} \\\\
    \vdots \\\\
    \frac{\partial y_n}{\partial \mathbf{u}} \\\\
\end{bmatrix}
= \begin{bmatrix}
    \frac{\partial}{\partial u_1} f_1(\mathbf{u}) \unicode{x2D54} g_1(\mathbf{v}) 
    & \frac{\partial}{\partial u_2} f_1(\mathbf{u}) \unicode{x2D54} g_1(\mathbf{v})
    & \cdots
    & \frac{\partial}{\partial u_n} f_1(\mathbf{u}) \unicode{x2D54} g_1(\mathbf{v})
    \\\\
    \frac{\partial}{\partial u_1} f_2(\mathbf{u}) \unicode{x2D54} g_2(\mathbf{v}) 
    & \frac{\partial}{\partial u_2} f_2(\mathbf{u}) \unicode{x2D54} g_2(\mathbf{v})
    & \cdots
    & \frac{\partial}{\partial u_n} f_2(\mathbf{u}) \unicode{x2D54} g_2(\mathbf{v})
    \\\\
    \vdots & \vdots & \ddots & \vdots
    \\\\
    \frac{\partial}{\partial u_1} f_n(\mathbf{u}) \unicode{x2D54} g_n(\mathbf{v}) 
    & \frac{\partial}{\partial u_2} f_n(\mathbf{u}) \unicode{x2D54} g_n(\mathbf{v})
    & \cdots
    & \frac{\partial}{\partial u_n} f_n(\mathbf{u}) \unicode{x2D54} g_n(\mathbf{v})
  \end{bmatrix}
$$

但是注意到 $\unicode{x2D54}$ 是 element-wise 操作，于是 $y_i$ 只跟
$f_i(\mathbf{u})$ 和 $g_i(\mathbf{v})$ 相关，换句话说，对于 $i \ne j$ 的情况，
有 $\frac{\partial y_i}{\partial u_j} = 0$。更进一步，element-wise 操作代表
着 $f_i(\mathbf{u})$ 可以退化成 $f_i(u_i)$，而跟其它所有 $u_k (k \ne i)$ 无关。

$$
\mathbf{J_u}
= \begin{bmatrix}
    \frac{\partial}{\partial u_1} (f_1(u_1) \unicode{x2D54} g_1(v_1))
    & 0
    & \cdots
    & 0
    \\\\
    0
    & \frac{\partial}{\partial u_2} (f_2(u_2) \unicode{x2D54} g_2(v_2))
    & \cdots
    & 0
    \\\\
    \vdots & \vdots & \ddots & \vdots
    \\\\
    0
    & 0
    & \cdots
    & \frac{\partial}{\partial u_n} (f_n(u_n) \unicode{x2D54} g_n(v_n))
  \end{bmatrix}
$$

注意到只有对象元素有值，是对角矩阵，于是写成下式：

$$
\frac{\partial \mathbf{y}}{\partial \mathbf{u}} = \mathbf{J_u}
= diag \left(
    \frac{\partial}{\partial u_1} \left(f_1(u_1) \unicode{x2D54} g_1(v_1)\right),
    \cdots,
    \frac{\partial}{\partial u_n} \left(f_n(u_n) \unicode{x2D54} g_n(v_n)\right)
    \right)
$$

再进一步，深度学习中一般 $f(u_i) = u_i$ 和 $g(v_i) = v_i$，所以还能简化：

$$
\frac{\partial \mathbf{y}}{\partial \mathbf{u}} = \mathbf{J_u}
= diag \left(
    \frac{\partial}{\partial u_1} \left(u_1 \unicode{x2D54} v_1\right),
    \cdots,
    \frac{\partial}{\partial u_n} \left(u_n \unicode{x2D54} v_n\right)
    \right)
$$

于是常见的 element-wise 操作及其导数如下

| Op        | 对 $u$ 导数                                                                                                                                                                   |
| ----      | ------                                                                                                                                                                        |
| +         | $\frac{\partial (\mathbf{u}+\mathbf{v})}{\partial \mathbf{u}} = diag(\mathbf{1}) = \mathbf{I} $                                                                               |
| -         | $\frac{\partial (\mathbf{u}-\mathbf{v})}{\partial \mathbf{u}} = diag(\mathbf{1}) = \mathbf{I} $                                                                               |
| $\otimes$ | $\frac{\partial (\mathbf{u}\otimes\mathbf{v})}{\partial \mathbf{u}} = diag(\cdots, \frac{\partial (u_i\times v_i)}{\partial u_i}, \cdots) = diag(\mathbf{v}) $                |
| $\oslash$ | $\frac{\partial (\mathbf{u}\oslash\mathbf{v})}{\partial \mathbf{u}} = diag(\cdots, \frac{\partial (u_i / v_i)}{\partial u_i}, \cdots) = diag(\cdots, \frac{1}{v_i}, \cdots) = \frac{1}{\mathbf{v}}$ |

| Op        | 对 $v$ 导数                                                                                                                                                                        |
| ----      | ------                                                                                                                                                                             |
| +         | $\frac{\partial (\mathbf{u}+\mathbf{v})}{\partial \mathbf{v}} = diag(-\mathbf{1}) = -\mathbf{I} $                                                                                  |
| -         | $\frac{\partial (\mathbf{u}-\mathbf{v})}{\partial \mathbf{v}} = diag(-\mathbf{1}) = -\mathbf{I} $                                                                                  |
| $\otimes$ | $\frac{\partial (\mathbf{u}\otimes\mathbf{v})}{\partial \mathbf{v}} = diag(\cdots, \frac{\partial (u_i\times v_i)}{\partial v_i}, \cdots) = diag(\mathbf{u}) $                     |
| $\oslash$ | $\frac{\partial (\mathbf{u}\oslash\mathbf{v})}{\partial \mathbf{v}} = diag(\cdots, \frac{\partial (u_i / v_i)}{\partial v_i}, \cdots) = diag(\cdots, \frac{-u_i}{v_i^2}, \cdots) = -\frac{\mathbf{u}}{\mathbf{v}^2}$ |

由于一般拿导数是用来更新向量的，对角矩阵经常也直接当成向量来使用。

## 小结

主要回顾了 dot product、矩阵乘法与 element-wise 乘法的关系，以及这些操作求偏导
的矩阵形式。
