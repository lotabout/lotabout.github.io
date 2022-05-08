title: Lamport 时钟与 Vector 时钟
toc: true
date: 2022-05-08 20:26:57
tags: [consistency, lamport clock, vector clock]
categories: [Notes]
---

Lamport 时钟之前一直似懂非懂，今天看了 Martin Kleppmann 的
[教学视频](https://www.youtube.com/watch?v=x-D8iFU1d-o)，觉得自己又行了。

## 因果关系与物理时钟

假设你发了朋友圈，有两个朋友评论：

- A 说：“这是在北京吧”
- B 回复 A 说：“应该不是，看着像上海”

我们人肉能识别出两句话之间的因果关系：`#A` 是因，`#B` 是果，但是计算机怎么
判断呢？

一种思路是给评论加上生成时间，比如 `#A_10:01`, `#B_10:02`，系统按时间对评论排
序，就能判断 `#B` 发生成 `#A` 之后。这个方法逻辑上没问题，但现实中没有一种可靠
的方法，能准确地同步各个机器上的时间（也称为物理时间）。于是可能出现下面的情况：

{% asset_img causal.svg Physical Clock %}

处理 `B` 评论的机器时钟慢了，导致 `B` 评论的时间戳更小，系统排序时把 `#B` 放在
了前面，因果错乱。

## Lamport 时钟

Lamport 时钟[^ref-lamport-clock]是一种逻辑上的机制，用来给各个事件打标签，保证
如果事件 `A` 发生于 `B` 之前，则 `A` 的标签 `L(A)` 一定小于 `B` 的标签 `L(B)`。

[^ref-lamport-clock]: Lamport Clock，也称为
    [Lamport Timestamp](https://en.wikipedia.org/wiki/Lamport_timestamp)，以发
    明者 Leslie Lamport 命名，Lamport 也是著名的 Paxos 的发明者。

具体要怎么做呢？每个机器各自维护一个计数器 `t`，然后：
1. 初始化时，每个机器都把 `t` 置为 `0`
2. 本机产生一个事件时，先执行 `t = t+1`，再用自增后的 `t` 来标记事件
3. 要发送一个事件时，执行 `t = t+1`，并发送 `(t, m)`，即把计数器和事件都发出去
4. 接收到一个事件 `(t', m)` 时，则需要更新本地的计数器 `t = max(t, t') + 1`，
    并把 `m` 发送到本地

于是如果使用这个算法，则上面朋友圈的例子就变成了：

{% asset_img lamport-clock.svg Lamport Clock %}

可以看到事件 `(4, 这是北京吧)` 发生在 `(6, 应该不是)`之前，它们的标签 `t` 能反
映出这一点。

### Lamport 时钟的局限

为什么 Lamport 时钟能体现事件发生的“因果”关系？如果两个事件有“因果”，它们一定
是有“同步”的操作，而 Lamport 时钟则是在“同步”时（第 #4 点），通过 `max(t, t')
`同步了二者的逻辑时间。

{% asset_img lamport-clock-sync.svg Lamport Clock %}

由于 `A-Before` 的事件满足 `t <= T`，而 `B-After` 的事件满足 `t >= T+1`，所以
能保证 `A-before <= T < T+1 <= B-after`，而 `B-after` 中的事件逻辑上是发生成
`A-before` 的事件之后的，且标签 `t` 也满足先后关系，因此保证了因果顺序。

但是在上图中，我们虽然推出 `A-before < B-after`，但其它几个区域发生的事件就没
法有确定的对比结论了。例如所有 `B-before` 中的事件，一定发生成 `A-after` 中的
事件之前吗？（`B-before < A-after`），细想一下会发现并没有办法得出这个结论。
明确可比的有这几个区域：

- `A-before < A-after`，A 机事件发生的先后决定
- `B-before < B-after`，B 机事件发生的先后决定
- `A-before < B-after`，A、B 之间的因果性决定

从另一个角度看，Lamport 时钟可以保证如果事件 `a < b`（`a` 发生在 `b` 之前），
就可以推出它们的标签满足 `L(a) < L(b)`。但反过来，如果看到两个标签 `L(a) < L(b)
`，能反推出 `a < b` 吗？其实是不行的，因为我们能判定的只有 `A-before` 和
`B-after` 两个区域的事件，但只看 `L(a)` 和 `L(b)` 我们并不知道 `a` 和 `b` 落在
哪个区域，因此无法判断 `a` 和 `b` 发生的先后。这就是 Lamport 时钟的局限性，

## Vector 时钟

vector 时钟可以解决这个问题：如果两个事件落在可比较的区域，则通过对比 vector
时钟产生的标记，可以得出对应事件发生的先后顺序，即通过 `L(a) < L(b)` 可以得出
`a < b` 的结论。那 vector 时钟是怎么做到的？

1. 假设有 N 台机器，记为 `N[1], N[2], ..N[n]`
2. 每台机器需要维护一个 N 维向量作为计数器，记为 `T = <t1, t2, ..., tn>`
3. `N[i]` 本机产生一个事件时，就把本机向量里的 `ti` 递增，即 `T[i]++`
4. 机器 `N[i]` 发送消息 `m` 时，先执行 `T[i]++`，再发送 `(T, m)`
5. 机器 `N[j]` 收到消息 `(T', m)` 时，执行 `T = max(T, T')`，再执行 `T[j]++`

这些规则看起来很复杂，但实际上它和 Lamport 时钟的“同步逻辑”一样，只是每个节点
都保存了其它所有节点，最后一次同步过的计数器。执行起来如下图[^ref-graph]：

[^ref-graph]: 注意这张图和上面 lamport 时钟的示例，算法的细节上有简化，收到信
  息时没有递增计数器

{% asset_img vector-clock.svg Vector Clock %}

Vector 时钟最后的标签有多维，如何比较呢？vector 时钟要求，如果每一维上，都有
`T[i] < T'[i]`，则认为 `T < T'`；如果每一维都有 `T[i] = T'[i]`，则认为 `T =
T'`；其它情况，都认为 `T` 和 `T'` 不可比。

条件 `a < b` 推出 `T(a) < T(b)` 的结论是比较简单的，与 Lamport 时钟类似，这里
给个图，不多说明了：

{% asset_img vector-clock-sync.svg Vector Clock Sync %}

从 `T(a) < T(b)` 反推 `a < b` 呢？其实从 `T` 的定义来看，可以理解成 `T` 代表的
是当前事件及之前发生的所有事件的集合，而 `T(a) < T(b)` 可以等价于集合的从属关系，
那么事件 `a` 一定包含在 `T(b)` 里，因此 `a < b`[^ref-proof]。

[^ref-proof]: 写到这里的时候受到知识的诅咒了，不管是从图像来看，还是从集合的视
  角来看，都太显然了，如果读者没理解的话，推荐看 Martin Kleppmann 的教程，说得
  比我明白。当然他的教程里有数学表示，更精确。

## 小结
 
Lamport 时钟解决的是分布式系统下的因果一致性问题，方式是在多机有交互时求计数器
的 `max`。它的局限是无法从计数器的大小反推事件的先后顺序。

Vector 时钟基本思路和 Lamport 时钟一样，但它在每个机器上都维护了最后看到的，其
它机器的计数器。
