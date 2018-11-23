title: WGAN 笔记
date: 2018-03-29 18:25:30
tags: [Machine Learning, GAN, WGAN]
categories: [Notes]
math: true
toc: true
---

Wasserstein GAN(WGAN) 解决传统 GAN 的训练难，训练过程不稳定等问题了。WGAN 的背
后有强劲的数学支撑，因此要想理解这它的原理，需要理解许多数学公式的推导。这个笔
记尽量尝试从直觉的角度来理解 WGAN 背后的原理。

## GAN 的问题

我们知道，GAN 的目的是训练一个生成器 G，使生成的数据的分布 $P_G$ 与真实数据的
分布 $P_{data}$ 尽可能接近。为了衡量接近程度，GAN 使用 [JS
Divergence](https://en.wikipedia.org/wiki/Jensen%E2%80%93Shannon_divergence)来
衡量。

从应用的角度，我们甚至不需要知道它是什么，我们只要知道，对于两个分布 $P_r$ 和
$P_g$，如果它们不重合或重合的部分可以忽略，则它们的 JS 距离 $JS(P_r, P_g) =
\log 2$ 是常数，用梯度下降时，产生的梯度会（近似）为 $0$。而在 GAN 的训练中，
两个分布不重合或重合可忽略的情况 **几乎总是出现**，因此导致 GAN 的训练中

## Wasserstein GAN

依旧地，我们甚至不需要知道 [Wasserstein
Distance](https://en.wikipedia.org/wiki/Wasserstein_metric) 是什么，只需要知道
它有着很好的性质，两个分布的差异都会反应在 Wasserstein Distance 上，因此，不会
出现梯度消失的问题。

现在的问题是怎么计算它？答曰无法计算，但在 [Wasserstein
GAN](https://arxiv.org/pdf/1701.07875.pdf) 论文里证明了如下的事实：

$$W(P_{data},P_G)=\max_{D\in \text{1-Lipschitz}}\\{E_{x\sim P_{data}}[D(x)]-E_{x\sim P_G}[D(x)]\\}$$

在接下去之前我们先说说什么是 $\text{1-Lipschitz}$。如果一个函数 $f$ 满足下面式子：

$$||f(x_1)-f(x_2)||\le K||x_1-x_2||$$

我们就称它为 $K\text{-Lipschitz}$，当 $K=1$时，就是 $\text{1-Lipschitz}$。

在图像生成的 GAN 中，上式中的 $D(x)$ 可以认为是以图像为输入，输出图像的质量（
是否接近真实图像）。那么我们可以找到两种类型的 $D$，一类变化剧烈，即赋予真实图
像很大的值，而其它图像的值就很小（下图蓝色）；另一类则变化平缓（下图绿色）。相
像一下，如果用变化剧烈的 D 作为判别器去训练生成器，则会倾向于生成和真实图像一
模一样的图片，导致多样性不高。而 $\text{1-Lipschitz}$ 的作用就是限制 D 的变化
要更平缓一些，是符合直觉的。

![Intuition for 1-Lipschitz](http://friskit-blog.qiniudn.com/c/6c/2753647abb8b644a0720a17810f30.png)

于是我们现在的目标是找到一个函数 $D$ 满足 $\text{1-Lipschitz}$ 且让上面的式子
最大。“最大化”倒是好说，我们不断用梯度上升，但怎么保证我们的判别器 D 满足
$\text{1-Lipschitz}$ 呢？还是没有办法，但我们可以做一些 workaround。

## Weight Clipping

对于神经网络中的所有权重，在更新梯度后，我们事先选中某个常数 $c$， 做下面的操作：

- 如果权重 $w > c$，则赋值 $ w \leftarrow c$
- 如果权重 $w < -c$，则赋值 $ w \leftarrow -c$

直觉上，如果神经网络的权重都限制在一定的范围内，那么网络的输出也会被限定在一定
范围内。换句话说，这个网络会属于某个 $K\text{-Lipschitz}$。当然，我们并不确定K
是多少，并且这样的函数也不一定能使 $E_{x\sim P_{data}}[D(x)]-E_{x\sim
P_G}[D(x)]$ 最大化。

不管怎么说吧，这就是原版 WGAN 的方法，对 GAN 的具大提升。

## Gradient Penalty

新版的 WGAN 提出了不用 weight clipping，而用加惩罚项的方式，我们去优化下面这个
目标：

$$W(P\_{data},P\_G)=\max\_{D}\\{E\_{x\sim P\_{data}}[D(x)]-E\_{x\sim P\_G}[D(x)]\underbrace{-\lambda\int\_x\max(0,||\nabla\_xD(x)||-1)dx\}_{\text{regularization}}\\}$$

为什么呢？因为如果 $D\in \text{1-Lipschitz}$，显然对于所有 $x$，我们有
$||\nabla\_xD(x)|| \le 1$。但同之前一样，我们无法穷举所有 $x$ 求积分，于是我们
又用期望来近似它，于是有：

$$W(P\_{data},P\_G)=\max\_{D}\\{E\_{x\sim P\_{data}}[D(x)]-E\_{x\sim P\_G}[D(x)]\underbrace{-\lambda E\_{x\sim P\_{penalty}}[\max(0,||\nabla\_xD(x)||-1)]}_{regularization}\\}$$

那这里的 $P_{penalty}$ 又是什么？它代表的是输入 $x$ 的分布，那具体如何采样呢？
新版 WGAN 是这样设计的：

1. 从真实数据 $P_{data}$ 中采样得到一个点
2. 从生成器生成的数据 $P_G$ 中采样得到一个点
3. 为这两个点连线
4. 在线上随机采样得到一个点作为 $P_{penalty}$ 的点。

![How to sample P_penalty](http://friskit-blog.qiniudn.com/2/32/1b101dceaaea8b8ccfd174b077713.png)

为什么这么采样？直觉上，我们想将 $P_G$ “拉”向 $P_{data}$，于是希望 $D$ 在它们
之间的这些数据上能更平缓地变化。而惩罚项就是为了保证 $D$ “平缓变化”的，于是正
则项中的 $P_{penalty}$ 就在这些数据点上进行采样。

最后，实际中我们其实并不是用 $\max(0,||\nabla\_xD(x)||-1)$ 这个惩罚项，而是用
$(||\nabla\_xD(x)||-1)^2$。也就是说，我们惩罚的目的不是让 $||\nabla\_xD(x)||$
尽可能小于1，而是要让它尽可能 **等于** 1。想象一个完美的判别器 $D$ 满足优化的
目标，则在 $P_{data}$ 附近它要尽可能大，而在 $P_G$ 附近要尽可能小，也就是说
$D$ 越斜越好，但由于 $||\nabla\_xD(x)|| \le 1$，那么 $||\nabla\_xD(x)||$ 只能
是 1。所以，真正的优化目标如下：

$$W(P\_{data},P\_G)=\max\_{D}\\{E\_{x\sim P\_{data}}[D(x)]-E\_{x\sim P\_G}[D(x)]-\lambda E\_{x\sim P\_{penalty}}[(||\nabla\_xD(x)||-1)^2]\\}$$

## 小结

GAN 的优化目标是 JS Divergence，它有许多缺点不利于 GAN 的训练。Wasserstein
Distance 是一个更好的距离度量，它最终可以转化为优化问题，我们需要找出一个判别
器 $D$，并要求它满足 $\text{1-Lipschitz}$。实际使用时我们并做不到这一点，于是
有两种方法来近似：weight clipping 和 gradient penalty。

## 参考

- [Improving GAN](https://www.youtube.com/watch?v=KSN4QYgAtao&lc=z13kz1nqvuqsipqfn23phthasre4evrdo) 李宏毅老师的教学视频，深入浅出
- [再读WGAN](http://friskit.me/2017/07/10/ntu-gan-wgan/) 对李宏毅老师视频的文
    字总结，本文的一些公式和图的来源。
- [令人拍案叫绝的Wasserstein GAN](https://zhuanlan.zhihu.com/p/25071913) 知乎
    神文，出色的 WGAN 总结
- [Wasserstein GAN and the Kantorovich-Rubinstein Duality](https://vincentherrmann.github.io/blog/wasserstein/) 图文并茂带你理解 Wasserstein Distance
- [Wasserstein GAN](https://arxiv.org/pdf/1701.07875.pdf) WGAN 原版论文，weight clipping 方法
- [Improved Training of Wasserstein GANs](https://arxiv.org/pdf/1704.00028.pdf) WGAN 新版论文，
    Gradient Penalty 方法
