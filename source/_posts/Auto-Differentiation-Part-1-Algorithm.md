title: 自动微分（Automatic Differentiation）：算法篇
toc: true
date: 2023-04-09 09:44:12
tags: [Automatic Differentiation, Neural Network]
categories: Notes
math: true
---

自动微分（Automatic Differentiation，下面简称 AD）是用来计算偏导的一种手段，在
深度学习框架中广泛使用（如 Pytorh, Tensorflow）。最近想学习这些框架的实现，先
从 AD 入手，框架的具体实现比较复杂，我们主要是理解 AD 的思想并做个简单的实现。

## AD 能干什么？

AD 能用来求偏导**值**的。

例如有一个 $\mathbb{R}^2 \mapsto \mathbb{R}$ 的函数
（函数有 `2` 个输入，`1` 个输出）：$f(x, y)$ ，对于 $x$、$y$ 的偏导分别计为
$\frac{\partial f}{\partial x}$ 和 $\frac{\partial f}{\partial y}$。通常我们不
关心偏导的解析式，只关心具体某个 $x_i$, $y_i$ 取值下偏导
$\frac{\partial f}{\partial x} \vert_{x=x_i,y=y_i}$ 和
$\frac{\partial f}{\partial y} \vert_{x=x_i,y=y_i}$ 的值。

另外注意在神经网络在使用“梯度下降”学习时，我们关心的是“参数 $w$”的偏导。而不是“输
入 $x$”的偏导。假设有 $f(x) = ax^2 + b$ 这样的神经网络，损失函数是 $l(f(x), y)$，
现在给了一个样本标签对$(x_0, y_0)$，我们要计算的是
$\frac{\partial l}{\partial a}\vert_{x=x_0,y=y_0,a=a_0,b=b_0}$ 和
$\frac{\partial l}{\partial b}\vert_{x=x_0,y=y_0,a=a_0,b=b_0}$。在对号入座时要牢记这点。

## 为什么用 AD？

求偏导有很多做法，例如 [symbolic differentiation](https://en.wikipedia.org/wiki/Symbolic_differentiation) 
使用“符号计算” 得到准确的偏导解析式，但对于复杂的函数，偏导解析式会特别复杂，
占用大量内存且计算慢，并且通常应用也不需要解析式；再比如
[numerical differentiation](https://en.wikipedia.org/wiki/Numerical_differentiation) 
通过引入很小的位移 $h$，计算 $\frac{f(x+h) - f(h)}{h}$ 得到偏导，这种方法编码
容易，但受 float 误差影响大，且计算慢（有几个输入就要算几次 $f$）。

AD 认为所有的计算最终都可以拆解成基础操作（如加减乘除，`exp`, `log`, `sin`,
`cos` 等基本函数）的组合。然后通过[链式法则](https://en.wikipedia.org/wiki/Chain_rule)
逐步计算偏导。这样使用方只需要正常组合基础操作，就能自动计算偏导，且不受 float
误差的影响，还可以复用一些中间结果来减少计算量（等价于动态规划）。

## 链式法则回顾

AD 的数学基础就是[链式法则(chain rule)](https://en.wikipedia.org/wiki/Chain_rule)：

对于函数 $z = h(x)$，如果有子函数 $y = f(x)$，满足 $z = h(x) = g(y) = g(f(x))$，
则求偏导有如下关系：


$$
h'(x) = g'(f(x))f'(x)
\iff
\frac{\partial z}{\partial x} \bigg\vert_{x_0} = \frac{\partial z}{\partial y}
\bigg\vert_{y=f(x_0)} \frac{\partial y}{\partial x} \bigg\vert_{x_0}
$$

上述两种写法是一致的。另外如果涉及多个变量，例如 $z = f(x, y)$，而 $x = g(t),
y = h(t)$，则有：

$$
\frac{\partial z}{\partial t} = \frac{\partial z}{\partial x}\frac{\partial x}{\partial t} + 
\frac{\partial z}{\partial y}\frac{\partial y}{\partial t}
$$

这里之所以成立，应该是因为 $x, y$ 是独立的（没有深究）。

## AD 具体是怎么做的？

AD 其实就是链式法则的具体实现。它有两种模式：前向模式(Forward accumulation)和
反向模式(Reverse accumulation)，我们只考虑反向模式。那么具体是怎么工作的呢？考
虑下面的复杂函数[^ref-wiki]

[^ref-wiki]: 例子取自[维基百科](https://en.wikipedia.org/wiki/Automatic_differentiation#Forward_accumulation)，修改了其中的符号

$$
\begin{aligned}
y &= f(x_{1},x_{2})
  \\\\&= \sin x_{1} + x_{1}x_{2}
  \\\\&= \sin v_{1} + v_{1}v_{2}
  \\\\&= v_{3}+v_{4}
  \\\\&= v_{5}
\end{aligned}
$$

上述公式中，我们用了一些子函数来简化整个函数，画成图如下左图：

{% asset_img 2023-04-AD-example-computation-graph.svg %}

于是为了求偏导 $\frac{\partial f}{\partial x_1}$ 与 $\frac{\partial f}{\partial x_2}$
的值，我们可以先定义中间值 $\bar{v_i} = \frac{\partial f}{\partial v_i}$，
根据链式法则，有

$$
\bar{v_i} = \frac{\partial f}{\partial v_i} = \frac{\partial f}{\partial v_{i+1}} \frac{\partial v_{i+1}}{\partial v_i} = \bar{v_{i+1}} \frac{\partial v_{i+1}}{\partial v_i}
$$

于是计算时需要先“前向”计算一次，得到 $v_1, v_2, \cdots, v_5$ 的值，之后再“后向”
计算 $\bar{v_5}, \bar{v_4}, \cdots, \bar{v_1}$ 的值（参考上右图），最终得到的
$\bar{v_1}, \bar{v_2}$ 就是我们要计算的结果。而需要先“前向”计算一次，是因为后
向计算时会用到前向的值，例如 $\bar{v_2} = \bar{v_4} v_1$ 就需要用到前向的$v_1$。

注意图里 $\bar{v_1}$ 的计算依赖了链式法则中多变量的情况，等于它所
有后继节点偏导（即图中的 $\bar{v_1^a}, \bar{v_1^b}$）的和。

## 多输出情形

多输出的情况偏理论，跳过也影响不大。神经网络的输出，在训练时最终都会接入损失函
数，得到 `loss` 值，一般都是一个标量，可以认为神经网络的学习总是单输出的。

在多输出的情况下，链式法则依然生效。

刚才都假设函数是 $\mathbb{R}^n \mapsto \mathbb{R}$，即 `n` 个输入，`1` 个输出。
考虑 `m` 个输出，即 $\mathbb{R}^n \mapsto \mathbb{R}^m$ 的情况。假设输入是
$x_1, x_2, \cdots, x_n$，而输出是
$f_1(x_1, \cdots, x_n), f_2(x_1, \cdots, x_n), \cdots, f_m(x_1, \cdots, x_n)$。
此时我们要计算的偏导就不是 `n` 个值了，而是一个 `m×n` 的矩阵[^ref-matrix]，每
个元素 $J_{ij} = \frac{\partial f_i}{\partial x_j}$。这个矩阵一般称为
[Jacobian Matrix](https://en.wikipedia.org/wiki/Jacobian_matrix_and_determinant)：

$$
\mathbf {J_{m\times n}} =
\begin{bmatrix}{\dfrac {\partial \mathbf {f} }{\partial x_{1}}}&\cdots &{\dfrac {\partial \mathbf {f} }{\partial x_{n}}}\end{bmatrix}
=\begin{bmatrix}\nabla ^{\mathrm {T} }f_{1}\\\\\vdots \\\\\nabla ^{\mathrm {T} }f_{m}\end{bmatrix}
=\begin{bmatrix}{\dfrac {\partial f_{1}}{\partial x_{1}}}&\cdots &{\dfrac {\partial f_{1}}{\partial x_{n}}}\\\\\vdots &\ddots &\vdots \\\\{\dfrac {\partial f_{m}}{\partial x_{1}}}&\cdots &{\dfrac {\partial f_{m}}{\partial x_{n}}}\end{bmatrix}
$$

[^ref-matrix]: `m×n` 还是 `n×m` 取决于是行矩阵还是列矩阵，其实关系不大。

其中 $\nabla^{\mathrm{T}}f_i$ 代表 $f_i$ 对于所有输入的偏导（行向量）的转置。

考虑函数 $g: \mathbb{R}^n \mapsto
\mathbb{R}^k$，$h: \mathbb{R}^k \mapsto \mathbb{R}^m$，而函数 $f$ 是二者的组合：
$f(x) = h \circ g(x) = h(g(x))$，则有

$$
J = J_{h \circ g} = J_h(g(x)) \cdot J_g(x)
$$

此时 $\mathbf{J}$ 中的每个元素：

$$
J_{ij} = \frac{\partial f_i}{\partial x_j}
= \sum_{l = 1}^{k}{\frac{\partial h_i}{\partial g_l} \frac{\partial g_l}{\partial x_j}}
= \begin{bmatrix}{\dfrac {\partial h_i}{\partial g_{1}}}&\cdots &{\dfrac {\partial h_i }{\partial g_{k}}}\end{bmatrix}
  \begin{bmatrix}{\dfrac {\partial g_1}{\partial x_{j}}} \\\\ \vdots \\\\ {\dfrac {\partial g_k }{\partial x_{j}}}\end{bmatrix}
$$

可以看到和 $J_h \cdot J_g$ 的结果是一致的。不过这些性质其实都是链式法则的内容，
这里也只是扩充视野。

## 小结

AD 把复杂的函数看成是许多小函数的组合，再利用链式法则来计算偏导。它有不同的模
式，其中“后向模式”在计算偏导时先“前向”计算得到一些中间结果，之后再“反向”计算偏
导。从工程的视角看，由于中间的偏导可以重复利用，能减少许多计算量。深度学习的反
向传播算法（BP）是 AD 的一种特例。

所以回过头来，什么是 AD？AD 就是利用链式法则算偏导的一种实现。

## 参考

- [A Review of automatic differentiation and its efficient implementation](https://arxiv.org/abs/1811.05031) 一篇综述，对 AD “是什么”、“为什么”的描述比较清晰
- [What is Automatic Differentiation?](https://www.youtube.com/watch?v=wG_nF1awSSY) Youtube 视频，回过头来看它介绍了 AD 的各个方面，但第一次直接看还是比较懵的，视频也有对应的综述论文，也是比较好的补充材料
- [Lecture 4 - Automatic Differentiation](https://www.youtube.com/watch?v=56WUlMEeAuA) 一个 DL 的课程，前面的内容和其它材料差不多，最后通过扩展计算图来计算 AD 的方式对理解一些框架的具体实现很有帮助
