title: '事务隔离级别备忘'
toc: true
date: 2020-04-17 09:27:43
tags: [Database, isolation level, consistency]
categories: [Knowledge]
---

数据库的事务有哪些隔离级别，它们解决了哪些问题？

## 并发问题

隔离级别解决的事务的并发问题。当两个事务同时发生时，数据库最终的执行结果可以等
价将事务里的各个操作排序后执行[^1]，不过不是任意排序都可以，有些排序的结果不符
合业务的预期。本节会列举其中的一些“错误”，而“隔离级别”就是一种约定，告诉我们数
据库不会出现哪些“错误”。

[^1]: 并发的一致性可以参考另一篇文章 [什么是顺序一致性](http://localhost:4000/2019/QQA-What-is-Sequential-Consistency/)

记号：`w1[x]` 代表事务 1 写入行 x，`r1[x]` 代表事务 1 读取行 x, `c1` 代表提交
事务 1, `a1` 代表回滚事务 1.

### P0: Dirty Write

问题时序P0：`w1[x]...w2[x]...(c1 or a1)`

两个事务分别写入，然后两个事务分别提交或回滚，则事务的结果无法确定。考虑下图：

{% asset_img P0-dirty-write.svg P0 Dirty Write %}

图中假设在一个事务里，满足约束 `x == y`，如果不做隔离，则事务结束后，数据库中
的值不满足约束。

当前支持事务的数据库都可以避免上述时序。例如在 MySQL 中，如果两个事务写入同一
行，后写入的事务会等待直到前一个事务结束或超时。

### P1: Dirty Read

问题时序P1：`w1[x]...r2[x]...(c1 or a1)`

即 r2 能读取未提交的事务的修改 w1。这会导致 t2 事务过程中的约束被打破，如下图
：

{% asset_img P1-dirty-read.svg P1 Dirty Read %}

该时序下，在 t2 事务内部，原本的约束 `x+y==100` 由于 t1 的写入被打破了。

隔离级别 READ COMMITTED 的目的就是阻止该时序的发生。即在 t1 未提交时，它的修改
对 t2 不可见。

### P2: Fuzzy Read | Non-repeatable Read

* 典型时序A2：`r1[x]...w2[x]...c2...r1[x]...c1`
* 问题时序P2：`r1[x]...w2[x]...(c1 or a1) ` 是 A2 的扩展

在事务 t1 读取数据后，另一个事务 t2 提交的修改对 t1 后续的读可见，则会造成不一
致，如下图(A2)：

{% asset_img A2-fuzzy-read.svg A2 Fuzzy Read %}

而 P2 是对 A2 的扩展，下例虽然不违反 A2，实际使用时也有问题：

{% asset_img P2-fuzzy-read.svg P2 Fuzzy Read %}

事务 t2 提交后的修改对 t1 可见，导致 t1 内部的约束失效。

一般数据库的隔离级别 REPEATABLE READ 能阻止 A2 的发生，但不一定能完全支持 P2。

### P3: Phantom

* 典型时序A3：`r1[P]...w2[y in P]...c2...r1[P]...c1`
* 问题时序P3：`r1[P]...w2[y in P]...(c1 or a1)`

与 Fuzzy Read 不同，Phantom（幻读）涉及的不是单个数据行，而是查询（如 `SELECT
...  WHERE P`）。

{% asset_img A3-phantom.svg A3 Phanom %}

而 P3 是对 A3 的扩展，下例(H3)虽然不违反 A3，实际使用时也有问题：

{% asset_img P3-phantom.svg P3 Phanom %}

Phantom 问题在于，查询条件隐含要求了范围数据的可重复读。需要 SERIALIZABLE 隔
离级别才能防止。

### P4: Lost Update

问题时序：`r1[x]...w2[x]...w1[x]...c1`

该时序下，事务 t1 的修改 w1 将被 t2 的修改覆盖而丢失，如下图：

{% asset_img P4-Lost-Update.svg P4 Lost Update %}

注意的是，禁用 P1 依旧会出现 P4，而禁用 P2 后就不会出现 P4，可以说 P4 是 P2 的
一个子模式。

在 MySQL 中，需要使用 `SELECT ... FOR UPDATE` 来锁住对应的行，阻止其它事务对选
中行的读写，来防止 P4 的发生。

### A5: Data Item Constraint Violation

我们隐式地对数据的两行数据有约束，下面是两种破坏约束的情形：

#### A5A: Read Skew

问题时序：`r1[x]...w2[x]...w2[y]...c2...r1[y]...(c1 or a1)`，示例：

{% asset_img A5A-Read-Skew.svg A5A Read Skew %}

#### A5B: Write Skew

问题时序：`r1[x]...r2[y]...w1[y]...w2[x]...(c1 and c2 occur)`，示例：

{% asset_img A5B-Write-Skew.svg A5B Write Skew %}

A5A 和 A5B 在 P2(Fuzzy Read) 的加强版被禁止的情况下是不会出现的，不过仅在 ANSI
版本(A2) 被禁止的情况下依然可能出现。

## 隔离级别

从原论文摘抄如下（省略了 P4C）：

（注意的是，下图假设 REPEATABLE READ 是支持了 P2 扩展的，而许多数据库的实现并
不支持）

{% asset_img Isolation.svg Isolation %}

## 小结

有时候更重要的不是解决问题的方法，而是认识到问题是什么。

文章里介绍了并发事务可能出现的多种问题。
* 主要注意 `P1: Dirty Read`、`P2: Fuzzy Read` 和 `P3: Phantom`
* `P4: Lost Update` 和 `A5: Constraint Violation` 都是 P2 的变种。
* 不过真正的实现上，P2 并没有被良好的支持，所以了解 P4、A5A、A5B 都是挺重要的

文章本来是阅读《Design Data-Intensive Applications》后想做个备忘，在给各个问题
举例时发现了论文《A Critique of ANSI SQL Isolation Levels》，结果花了很长时间
来理解论文里的各种情形。本文也算是另一种形式的备忘吧，只不过更“学术”了，不“实
用”了。

## 参考

* [A Critique of ANSI SQL Isolation Levels](https://arxiv.org/pdf/cs/0701157.pdf) 论文，本文的主要来源
* 《Design Data-Intensive Applications》第7章的小结部分，有相似的讨论，不那么
    学术，更实用
* [Understanding MySQL Isolation Levels: Repeatable-Read](https://blog.pythian.com/understanding-mysql-isolation-levels-repeatable-read/) MySQL 中的 RR 隔离级别的实际表现，包括幻读
* [A Critique of ANSI SQL Isolation Levels](https://blog.acolyer.org/2016/02/24/a-critique-of-ansi-sql-isolation-levels/) 论文的图文版博客，参考了文章里的图
* [ANSI isolation levels](http://www.adp-gmbh.ch/ora/misc/isolation_level.html) ANSI 规定的 4 种隔离级别
