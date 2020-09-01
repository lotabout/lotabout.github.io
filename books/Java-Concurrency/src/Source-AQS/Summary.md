# 小结

AbstractQueuedSynchronizer(AQS) 本身的想法很朴素：一个共同抢占的状态加上一个等
待队列。但由于涵盖了许多的功能（如超时、中断、取消等），它的代码实现显得很复杂。

个人觉得看代码过程中可以注意几个点：

- AQS 的整体结构，为什么它能成为阻塞锁实现的基本框架
- 如何用 CAS 操作实现无锁的队列（入队、出队等）
- 如何维护 Java 关于中断处理的约定
- 欣赏如何用一个 Node 结构实现抢锁和条件变量
- 学习一些实现上的细节（如 PROPAGATE 状态的作用，help GC 的原因）

还有一些深层次原理上的东西可能在文章中没有体现（例如 AQS 基于 CLH 队列，有一些
缓存上的优点），如果有兴趣可以查阅相关的论文。
[The java.util.concurrent Synchronizer
Framework](http://gee.cs.oswego.edu/dl/papers/aqs.pdf) 是 AQS 作者 Doug Lee 关
于 AQS 的介绍，可以作为一个起点。
