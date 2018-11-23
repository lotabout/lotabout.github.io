title: 最高楼层问题
date: 2018-10-04 10:21:23
tags: [Data Structure, skip list]
categories: [Knowledge]
math: true
toc: true
---

一个人爬楼梯，每爬一层前先抛个硬币，如果是正面则继续向上，如果是反面则停下结束
，问平均能爬到的最高层数是多少（期望）？

这个问题是不是太简单了？那么考虑 N 个人各自爬楼梯，都依照上面的规则，只统计它
们中爬得最高的楼层，问楼层数的期望是多少？

<!--more-->

## 单人问题

单人的问题可以套用统计学中的 [几何分布](https://zh.wikipedia.org/wiki/几何分布
)，得到期望为 $\frac{1}{1-p} - 1$，在抛硬币的情况下就是平均 $1$ 层。自己算的话
如下式：

$$
\begin{align}
E(x) &= 0p^0(1-p) + 1p^1(1-p) + 2p^2(1-p) + \dots \\\\
     &= (1-p)(p + 2p^2 + 3p^3 \dots) \\\\
     &= (1-p)\frac{p}{(1-p)^2} = \frac{p}{1-p} = \frac{1}{1-p} - 1
\end{align}
$$

和几何分布的结果是一致的。不过要提醒的是几何分布关心的是成功概率和次数，而我们
关心的是失败的。

## 多人问题

很直接地，我们想一开始有 $n$ 个人，它们中有 50% 的人会掷到正面，因此第 1 层会
有 $\frac{n}{2}$ 个人，第 2 层有 $\frac{n}{4}$ 个人。进一步，第 $k$ 层有
$\frac{n}{2^k}$ 人。所以当最后一层只剩一个人的时候，即 $\frac{n}{2^k} = 1$ 时
，即到了最高层，于是最高能到的层数为 $k = \log_2n$。

上面的分析好像没什么大问题，那么如果问 `1024` 个人最高能爬到多少层，你回答层数
的期望是 `10` 层，对不对呢？不知道，也算不出来，但很可能是错的。事实上满足几何
分布的独立同分布变量，它们的最大值的期望并没有一个良好的解析式可以表示（数学好
的话可以看看[这个答案](https://math.stackexchange.com/a/26214/538993)）。

但是当 n 足够大的时候，我们能确定它“大概”就是 $\log_2n$ 层。下面是一些证明，不
感兴趣的就跳过吧。

## 期望上界的证明

其实这个问题是计算数据结构跳表 (skiplist) 的高度的另一种说法。这里这里跟据 [一
个讲义](http://web.cs.ucdavis.edu/~amenta/w04/maxlevel.pdf) 讲解一下如何推导得
到期望的上界（建议看看原文）。

我们知道，一个人爬到至少第 $k$ 层的概率是 $p^k$，$n$ 个人中 **至少有一个人**
达到 $k$ 层及以上的概率不太于 $np^k$（即所有人都到达 $k$ 层及以上的概率）。
设 $M$ 为任意一人达到的最高层数，则 $M \ge k$ 的概率 $Pr[M \ge k] \le np^k$。
现在我们要求 $M$ 的期望 $E[M]$ 的上界，我们把期望的计算拆成两部分：

$$
E[M] \le \sum_{k=0}^{L-1}{kPr[M=k]} + \sum_{k=L}^{\infty}{kPr[M=k]}
$$

拆成两部分的原因是我们知道随着 $k$ 的增长，后面的部分增长会越来越慢，这样我们
选取适当的 $L$ 并对 $k$ 比较大的部分应用缩放，然后再单独处理 $k$ 小的部分，就
可以得到一个小的上界。为此，我们要找到一个 $L$，满足：

$$
knp^k = O(1/k^2), \forall k \ge L
$$

为什么要选 $1/k^2$ 呢？因为我们知道下面这个和（[巴塞尔问题](https://zh.wikipedia.org/wiki/巴塞尔问题)）：

$$
\sum_{i=0}^{\infty}{ \frac{1}{i^2} } = \frac{\pi^2}{2} \le 2
$$

那么就有：

$$
\sum_{k=L}^{\infty}{ knp^k } \le \sum_{k=L}^{\infty}{ O(\frac{1}{k^2}) } = O(1)
$$

现在的问题是 $L$ 到底是多少呢？我们希望当 $n$ 足够大时，$L$ 满足：$Lnp^L \le
L^2 $，换言之，我们希望得到 $L^3 n p^L = O(1/n)$。这东西不是人能解出来的，但我
们只需要找到一个合适的值就行了。我们选的值是：

$$
L = 2\log_{1/p}{n}
$$

下一小节我们会验证这个值的正确性，这里我们先考虑式子剩余的部分：

$$
\sum_{k=0}^{L-1}{kPr[M=k]} \le \sum_{k=0}^{L-1}{LPr[M=k]} = L \sum_{k=0}^{L-1}{Pr[M=k]} = L Pr[M < L] \le L
$$

于是，我们的期望的上界为：

$$
E[M] \le \sum_{k=0}^{L-1}{kPr[M=k]} + \sum_{k=L}^{\infty}{kPr[M=k]} \le L + 0 = O (\log n)
$$

### 证明 L 是合适的

即我们要证明当 $n$ 足够大时，$L = 2\log_{1/p}{n}$ 满足 $Lnp^L \le 1/L^2$，亦即
$L^{3} np^L \le 1$。

代入 $L = 2\log_{1/p}{n}$ 的值：

$$
f(n) = L^{3} np^L = \frac{8\log_{1/p}(n)^3}{n}
$$

上面的式子在 $n \to \infty$ 时趋近于 0 （参考[Orders Of Growth Corollary 2.2](http://www.math.uconn.edu/~kconrad/blurbs/analysis/growth.pdf)），得证。


## With High Probability

[With High Probability](https://en.wikipedia.org/wiki/With_high_probability)
是另一种说明可能性的方式。它表示如果某个依赖参数 $n$ 的事件，发生的概率是
$p_n$ 且 $\lim_{n \to \infty} p_n = 1$，则说这个事件是“大概率”发生的。

我们说多人爬楼梯的最高层数“大概率”是 $O(\log n)$ 的。考虑 $c \log_{1/p} n$ 层
，上文提到，最高层数大于等于 $k$ 的概率为：

$$
Pr[M \ge k] \le np^k = n p^{c \log_{1/p} n} = n \frac{1}{n^c} = \frac{1}{n^{c-1} }
$$

那么 $M < k$ 的概率为 $1 - \frac{1}{n^{c-1} }$，当 $n \to \infty$ 时，概率趋近
于 $1$。那么“大概率”告诉我们什么信息呢？它告诉我们，当 $n$ 很大时，最高层数几
乎不可能大于 $c \log_{1/p} n$ （因为概率太小了）。并且根据常数 $c$ 的不同，我
们能预测它的概率。

“大概率”与上面证明的最大区别是“大概率”并不能保证没有反例出现，而严格的上界证明
可以。不过对于一些概率算法来说，“大概率”就已经足够保证算法的性能了。

## 参考

- [Maximum Level in a Skip List](http://web.cs.ucdavis.edu/~amenta/w04/maxlevel.pdf) 本文证明的主要参考资料
- [Order of Growth](http://www.math.uconn.edu/~kconrad/blurbs/analysis/growth.pdf) 讲解各类函数的增长速度
- https://courses.csail.mit.edu/6.046/spring04/handouts/skiplists.pdf MIT 关于
    skip list 的讲义，包含了 With High Probability 的一些说明。
