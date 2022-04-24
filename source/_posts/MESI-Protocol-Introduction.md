title: MESI 协议学习笔记
toc: true
date: 2022-04-24 20:31:09
tags: [MESI, Cache Coherence, Consistency]
categories: [Notes]
---

MESI 是一个（CPU 级别的）缓存一致性协议。看过 N 次 MESI 的 wiki 页面，一起看不
进去，网上搜的一些文章，经常会介绍 MESI 的状态机和各种状态，也看得云里雾里。最
近硬着头皮啃完了 wiki，感觉理解 MESI 协议的核心其实在 wiki 的第一句：

> The MESI protocol is an **Invalidate-based** cache coherence protocol, and
> is one of the most common protocols that support write-back caches.

发现其实只要能理解什么是 "Invalidate-based"，MESI 协议就很容易理解了。在这之前
先补充些相关知识。

## Write-Back Cache 写回

当一份内存的数据存储在缓存时，我们有必要保证两者是一致的。假设我们修改了缓存上
的数据，这份数据要如何同步回内存呢？常见的有两种方法[^ref-write-back]：

[^ref-write-back]: https://en.wikipedia.org/wiki/Cache_(computing)#Writing_policies

1. Write-Though（直写），每次修改都同步更新到缓存和内存中
2. Write-Back（写回），修改先更新到缓存上，缓存快失效时才更新回内存中

它们的核心区别在于更新操作是“同步”还是“异步”。显然异步的写入性能更高。

## Cache-Coherence 缓存一致性

“一致性”这个词的含义深挖的话还挺深奥的，类似的内容可以参考博主的
另一篇文章：[什么是顺序一致性](https://lotabout.me/2019/QQA-What-is-Sequential-Consistency/)。
这里举一个可能容易理解但不太准确的例子：

假设没有缓存，多个 CPU 对同一个内存地址做读写，逻辑上，我们会认为这些操作是原
子的，有顺序的。假设当前内存的值是 `0`，CPU1 先发出写操作 `W(1)`, CPU2 再发出读
操作 `R`，则逻辑上我们理解 CPU2 一定要读到 `1` 这个值。

现在假设两个 CPU 都有自己的缓存，CPU1 先发出 `W(1)` 写到自己的缓存，因为使用了
Write-Back 技术，还没有更新到内存，此时 CPU2 发出 `R`，读到的是自己的缓存（或
者缓存不存在从内存加载），读到的还是 `0`，和我们上面说的预期不一致。

缓存一致性是指：通过在缓存之间做同步，达到仿佛系统不存在缓存时的行为。一般有
[如下要求](https://en.wikipedia.org/wiki/Cache_coherence#Overview)：

- Write Propagation（写传播）：即写入一个缓存要让其它缓存能看到
- Transaction Serialization（事务顺序化）：即不同 CPU 对同一个地址发出读写指令，
  不管这些指令最终的先后顺序如何，不同 CPU 看到的顺序要一样。

这也对应我们一般说的可见性和顺序性。

## Invalidate-Based 基于缓存失效

一份数据，缓存 A 有副本，缓存 B 也有副本，这时如果对 A 有修改，那 A、B 就不
一致了，怎么办？Invalidate-based 的思路是，对 A 有修改，就想办法让其它副本都失
效，只剩下 A 这么一个副本，不就没有“不一致”的情况了？

那其它缓存要再读数据时怎么办？简单，让剩下的那个副本把数据写回到内存，再从内
存里把最新的数据捞到缓存即可。

MESI 就是用 4 个状态实现了状态机，实现了这个逻辑，我喜欢把它叫作“踢人”逻辑。

## MESI 逻辑简述

MESI 的状态机包含了 4 个状态，也是名字的由来：
- (M)odified: 单副本 + 脏数据（即缓存改变，未写回内存）
- (E)xclusive: 单副本 + 干净数据
- (S)hared: 多副本 + 干净数据
- (I)nvalid: 数据未加载或缓存已失效

CPU 会有读写操作，记为 `PrRd` 和 `PrWr`，缓存接收到操作后需要与其它缓存同步并
更新状态，同步的信息通过总线传递，同步信号有 5 种：`BusRd`, `BusRdX`,
`BusUpgr`, `Flush`, `FlushOpt`，不用记具体的含义，我们只需要知道，这些信号的作
用和目的，就是为了在自己接收到写入操作时，把其它缓存踢掉。

考虑缓存 A 和缓存 B 都有一个副本，都处于 Shared 状态，此时 A 接收到写入操作
`PrRd`，则有如下变化：

1. A 会向总线发出 `BusUpgr`，代表自己要更新缓存上的数据
2. A 发出信号后，状态变为 Modified（单副本＋脏数据），这就需要 B 的配合了
3. B 处于 Shared 状态，在接收到总线上的 `BusUpgr` 信号后，主动把状态变为 `Invalid`
4. 于是只剩下 A 一个副本了

## MESI 与内存屏障

MESI 如果简单粗暴地实现，会有两个很明显的性能问题：
1. 当尝试写入一个 Invalid 缓存行时，需要等待从其它处理器或主存中读
   取最新数据，有较长的延时
2. 将 cache line 置为 Invalid 状态也很慢

因此 CPU 在实现时一般会通过 Store Buffer 和 Invalidate Queue 机制来做优化。

### Store buffer

在写入 Invalid 状态的缓存时，CPU 会先发出 read-invalid（这样其它 CPU 的缓存行
会写入更改并变成 Invalid 的状态），然后把要写入的内容先放在 Store buffer 上，
等收到其它 CPU 或内存发送过来的缓存行，做合并后才真正完成写入操作。

这会导致虽然 CPU 以为某个修改写入缓存了，但其实还在 Store buffer 里。此时如果
要读数据，则需要先扫描 Store buffer，此外，其它 CPU 在数据真正写入缓存之前是看
不到这次写入的。

### Invalidate Queue

当收到 Invalidate 申请时（如 Shared 状态收到 BusUpgr），CPU 会将申请记录到内部
的Invalidate Queue，并立马返回/响应。缓存会尽快处理这些请求，但不保证“立马完
成”。此时 CPU 可能以为缓存已经失效，但真的尝试读取时，缓存还没有置为 Invalid
状态，于是读到旧的数据。

### 内存屏障

这些优化的存在，要求我们在代码里使用内存屏障，插入 store barrier 会强制将
store buffer 的数据写到缓存中，这样保证数据写到了所有的缓存里；插入 read
barrier 会保证 invalidate queue 的请求都已经被处理，这样其它 CPU 的修改都已经
对当前 CPU可见。

## MESI 与 MSI 的区别

不做相关工作也不用太深入。大概就是如果 CPU 要读的数据在其它 CPU 中都不存在，则
对于 MSI 来说需要通过 2 个总线事务才能捞到数据，但 MESI 只需要一次。

## 小结

本文所有内容均来源于 [MESI 的 wiki](https://en.wikipedia.org/wiki/MESI_protocol)。
文章的核心想是指出要理解 MESI 协议，关键在于理解它是一个“基于缓存失效”的协议，理解
了这点，就能理解 MESI 的状态机为什么要这么做。

另外简单讨论了 MESI 之下为什么还需要内存屏障，以及 MESI 和同类 MSI 的区别。

博主做的是上层的应用开发，点到为止已经够用了。
