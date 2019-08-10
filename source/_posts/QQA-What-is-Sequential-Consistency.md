title: '什么是顺序一致性(Sequential Consistency)'
toc: true
date: 2019-08-10 10:35:46
tags: [QQA, zookeeper, sequential, consistency]
categories: [QQA]
---

分布式系统中，我们熟悉强一致性、弱一致性和最终一致性等等一致性，但 Zookeeper
又说自己是“顺序一致性”，又是什么意思呢？

我们来看看那些研究理论的大佬们是如何看待一致性的。

## 什么是一致性？

一般我们会说“A 和 B 是一致的”，在分布式系统中，一致性指的是程序员对系统的预期
和系统的实际行为是一致的。举例来说，我们首先发送写请求 `W(X, 2)`，再尝试读取该
变量`R(X)`，如果预期是 `R(X)=2`，而系统的实际上返回 `R(X)=0`，则说我们对系统的
预期和实际的行为不一致。

而当我们说 “XX 一致性” 实际上描述的系统能对我们提供的 XX 保证。例如最终一致性
保证的是对系统中的某一项数据，如果经过足够长的时间没有新的修改发生，则所有对它
的访问都将返回最后一次修改的值，而对于“不够长”的时间内的访问情况它却没有做任何
保证。

## 什么是顺序一致性？

顺序一致性最早是用来描述多核 CPU 的行为的，定义如下：

> ... the result of any execution is the same as if the operations of all the
> processors were executed in some sequential order, and the operations of
> each individual processor appear in this sequence in the order specified by
> its program.

如果可以找到一个所有 CPU 执行指令的排序，该排序中每个 CPU 要执行指令的顺序得以
保持，且实际的 CPU 执行结果与该指令排序的执行结果一致，则称该次执行达到了顺序
一致性。例如：

{% asset_img Sequential-Consistency.svg Sequential Consistency %}

图中 `W(X, 1)` 代表将 1 写入变量 X；`R(X, 1)` 代表读取变量 X，值为 1；横轴代
表时间；矩形的长短代表指令持续的时间长短，所以上图其实表示的是多核 CPU 的一次
执行结果。

我们找到了指令的一个排序，排序中各个 CPU 的指令顺序得以保持（如 `C: R(X,
1)` 在 `C: R(X, 2)` 之前），这个排序的执行结果与 CPU 分开执行的结果一致，因此
该 CPU 的执行是满足顺序一致性的。

注意到顺序一致性关心的是 CPU 内部执行指令的顺序，而不关心 CPU 之间的相对顺序。

## 更多正反例

考虑将上图的 `C:R(X, 1)` 与 `D:R(X, 2)` 替换一下呢？如下图：

{% asset_img Sequential-Consistency-swap-1.svg Sequential Consistency Swap 1 %}

可以看到我们依然可以找到一个满足要求的全局排序，所以系统依旧满足顺序一致性。那
如果我们只是将原图的 `D:R(X, 1)` 和 `D:R(X, 2)` 互换呢？如下图：

{% asset_img Sequential-Consistency-swap-2.svg Sequential Consistency Swap 2 %}

对于上图的系统，实际上是找不到一个全局的排序来满足顺序一致性的需求的。根本上，
从 C 的顺序推导出 X 的写入顺序为 `1 -> 2`，而同时由 D 推出写入顺序为 `2 -> 1`
，二者矛盾。那如果只有 A 在写入呢？

{% asset_img Sequential-Consistency-swap-3.svg Sequential Consistency Swap 3 %}

上图也不满足顺序一致性，由 C、D 推导出写入顺序为 `1 -> 2`，而由 A 推出顺序为
`2 -> 1`，矛盾。

## 顺序一致性难吗？

难，现代的多核 CPU 依然达不到顺序一致性。

我们知道 CPU 执行的主要瓶颈其实是在与内存交互，工程师为了让 CPU 能高速执行，在
CPU 内部使用了多级缓存。它的存在，使得即使 CPU 内部顺序执行指令，指令的结果也
可能不满足顺序一致性：

{% asset_img CPU-Cache.svg CPU Cache and Sequential Consistency %}

上图中 `(n)` 代表数据的读写步骤。如果 CPU 如上图执行，则得到的结果不满足顺序一
致性。

另外 CPU 执行时会乱序执行指令。例如在一些情况下 CPU 会将数据写入的指令提前执行
，因为写入内存是很耗时的。同样的，编译器在编译代码时也会重排代码中的指令的顺序
，以提升整体的性能。

难以想象，没有了顺序一致性的保证，程序居然还能正确执行。其实，现代硬件体系遵循
的其实是:

> sequential consistency for data race free programs

即如果程序没有数据竞争，则 CPU 可以保证顺序一致性，而如果遇到数据竞争，就需要
程序里手工使用一些数据同步的机制（如锁）。

工程领域总是伴随着各种权衡(trade-off)，显然保证顺序一致性对 CPU 的性能优化有太
多的阻碍，而 CPU 的高性能又是我们所追求的，两害相权取其轻。

## Zookeeper 中的顺序一致性

Zookeeper 的一致性保证第一条是：

> Sequential Consistency : Updates from a client will be applied in the order that they were sent.

顺序一致性：客户端发送的更新命令，服务端会按它们发送的顺序执行。

（其实 zookeeper 文档里描述的顺序一致性和本文描述的不太一样）

Zookeeper 的所有写操作都通过主节点进行，从节点复制修改操作，这样所有节点的更新
顺序都和主节点相同，不会出现某个节点的更新顺序与其它节点不同的情况。

但是Zookeeper 允许客户端从从节点读取数据，因此如果客户端在读取过程中连接了不同
的节点，则顺序一致性就得不到保证了。

{% asset_img Zookeeper-Inconsistency.svg Zookeeper Inconsistency %}

如上图，主节点的 `X=2` 消息还没有同步到 Follower 2，此时如果有两个客户端：

* A: 先后连接到 Follower 1 和 Follower 2，则读到 X 的值为 `2 -> 1`
* B: 先后连接到 Follower 2 和 Follower 1，则读到 X 的值为 `1 -> 2`

显然不满足顺序一致性，因此 zookeeper 又有“单一视图”的保证，保证在连接到
Follower 2 后，不会连上状态更老的 Follower 1。

## 小结

文中试图描述什么是“顺序一致性”，并给出了几个正反例；之后说明了 CPU 达不到顺序
一致性的几个原因；最后简单地说明了 zookeeper 为什么能保证顺序一致性。水平有限
，只能点到为止了。

最后感叹下，设计里一切都是 trade off 啊。

## 参考

- https://wudaijun.com/2018/09/distributed-consistency/ 清晰讲解了顺序一致性及
    线性一致性等概念
- https://www.cs.princeton.edu/courses/archive/fall16/cos418/docs/L13-strong-cap.pdf
    关于强一致性与 CAP 理论的 PPT
- https://snarfed.org/transactions_across_datacenters_io.html Google 2009 年的
    一个分享，总结了业内一致性协议的一些实践
