title: Back Propagation Note
date: 2018-03-13 21:19:45
tags:
categories:
math: true
toc:
---

Michael Nielsen 的 [深度学习
](http://neuralnetworksanddeeplearning.com/chap2.html) 文章里对 BP 算法有了相
当全面的介绍，网上也有中文翻译版本。本文是自己学习的一些笔记。

## BP 的四个基本公式

分量形式：

\begin{eqnarray} 
  \delta^L_j = \frac{\partial C}{\partial a^L_j} \sigma'(z^L_j)
\tag{BP1}\end{eqnarray}

\begin{eqnarray} 
  \delta^l_j = \sum_k w^{l+1}_{kj}  \delta^{l+1}_k \sigma'(z^l_j).
\tag{BP2}\end{eqnarray}

\begin{eqnarray}
  \frac{\partial C}{\partial b^l_j} = \delta^l_j
\tag{BP3}\end{eqnarray}

\begin{eqnarray}
  \frac{\partial C}{\partial w^l_{jk}} = a^{l-1}_k \delta^l_j.
\tag{BP4}\end{eqnarray}

矩阵形式：

\begin{eqnarray} 
  \delta^L = \nabla_a C \odot \sigma'(z^L).
\tag{BP1a}\end{eqnarray}

\begin{eqnarray} 
  \delta^l = (( w^{l+1} )^T \delta^{l+1} ) \odot \sigma'(z^l )
\tag{BP2a}\end{eqnarray}

\begin{eqnarray}
  \Delta{b^l} = \delta^l
\tag{BP3a}\end{eqnarray}

\begin{eqnarray}
  \Delta{w^l} = \delta^l a^{l-1}
\tag{BP4a}\end{eqnarray}

## 公式推导

首先说明符号的表示与含义。参考下图：

{% asset_img NN.png Decision Neural Network %}

- $b_j^l$ 表示第 $l$ 层的第 $j$ 个节点对应的偏置
- $w_{jk}^l$ 表示从第 $l-1$ 层的第 $k$ 个节点到 $l$ 层的 $j$ 个节点的连线的权
    重。
- $z_j^l$ 表示第 $l$ 层的第 $j$ 个节点的加权输入，即 $z_j^l =
    \sum_k{w_{kj}^l a_k^l}$
- $a_j^l$ 表示第 $l$ 层的第 $j$ 个节点的激活输出，即 $a_j^l = \sigma(z_j^l)$

这里涉及很多变量和下标，这是理解神经网络“最大”的门槛了吧。下面我们要证明上面提
到的四个公式，证明的过程基本是原文的翻译。

### BP1 证明

下面我们先证明公式 BP1，我们要先定义 $\delta_j^l$：

$$\delta^l_j \equiv \frac{\partial C}{\partial z^l_j}$$

根据链式法则，由于 $C$ 是 $a_1^L, a_2^L, ...$ 的函数，所以有

$$\delta^L_j = \sum_k{\frac{\partial C}{\partial a_k^L} \frac{\partial a_k^L}{\partial z_j^L}}$$

其中 $k$ 是输出层 L 的节点个数。当然，根据 $a_j^l$ 的定义我们知道，$a_j^l$ 完
全取决于 $z_j^l$ 的值。这意味着当 $j \ne k$ 时，$\partial a_k^L/\partial
z_j^L = 0$。于是上式又可以简化成：

$$\delta^L_j = \frac{\partial C}{\partial a_j^L} \frac{\partial a_j^L}{\partial z_j^L}$$

而由于 $a_j^L = \sigma(z_j^L)$，上式的第二项就可以用 $\sigma'(z_j^L)$ 替换，于
是得到公式 BP1 ：

$$\delta^L_j = \frac{\partial C}{\partial a_j^L} \sigma'(z_j^L)$$

上式中 $\frac{\partial C}{\partial a_j^L}$ 取决于损失函数 $C$ 的选择，当 $C =
\frac{1}{2}\sum_j(y_j - a_j^L )^2$ 时，有 $\partial C/\partial a_j^L = (a_j^L -
y_j)$。

### BP2 证明

类似的，我们从定义出发：

$$
\delta_j^l = \frac{\partial C}{\partial z_j^l}
$$

类似上一节，$C$ 可以认为是任意一层的所有 $z_1^l, z_2^l, ...$ 的复合函数
，因此根据链式法则：

$$
\delta_j^l
= \frac{\partial C}{\partial z_j^l}
= \sum_k{\frac{\partial C}{\partial z_k^{l+1}} \frac{\partial z_k^{l+1}}{\partial z_j^l}}
= \sum_k{\frac{\partial z_k^{l+1}}{\partial z_j^l} \delta_k^{l+1}}
$$

根据定义，我们又有：

$$
z_k^{l+1} = \sum_j{w_{kj}^{l+1} a_j^l + b_k^{l+1 }} = \sum_j{w_{kj}^{l+1} \sigma(z_j^l )+b_k^{l+1}}
$$

对 $z_j^l$ 求导，注意到只有当 $z_j$ 匹配时导数才不为零，所以有 ：

$$\frac{\partial z_k^{l+1}}{\partial z_j^l} = w_{kj}^{l+1}\sigma' (z_j^l)$$

最后代入 $\delta_j^l$ 的式子，即为公式 BP2：

$$\delta_j^l = \sum_k{w_{kj}^{l+1} \delta_k^{l+1} \sigma' (z_j^l)}$$
