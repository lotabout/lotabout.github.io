# 线程安全类

学习并发编程很重要的一个思维转变是意识到并承认并发编程是十分困难的
[^read-write-lock-doc]。很多时候最聪明的方法是复用已有的成果，不要重复发明轮子
。

根据数据的映射关系是一对一、一对多还是多对多，数据结果可以分成表（List）、树（
Tree）和图（Graph）。而通常对应的底层结构有列表（List）、集合（Set）和映射（
Map）。除了像 int, long, double 这样的原始类型，几乎所有需要聚合的数据都可以划
分成这三类（甚至类也可以认为是成员变量名字到值的映射）。也因此，常见的并发需求
通常也集中在对集合（collection）类的读写上。

JDK 1.5 新增的 `java.util.concurrent`（简称JUC）包中，实现了许多线程安全的集合
类。我们日常开发中的并发需求，通常用 JUC 中的类替换相应的原始类型或集合类，就
可以达到线程安全。例如用 `ConcurrencyHashMap` 替换 `HashMap` 可以实现 `Map` 读
写的线程安全。

因此虽然我们学习了好几章并发知识，实际日常开发中通常只需要使用 JUC 里的线程安
全类就能解决绝大多数问题。


## JUC 简介

Java 只提供了 `synchronized` 和 `volatile` 两种同步原语，在性能要求高的一些场
景下，用它们来实现细粒度的同步会极大增加代码的复杂程度，性能也不好。Doug Lea大
神在 1998 年实现了
[EDU.oswego.cs.dl.util.concurrent](http://gee.cs.oswego.edu/dl/classes/EDU/oswego/cs/dl/util/concurrent/intro.html)
并发工具包来解决这些问题。这个实现的语义和性能都十分优秀，在 Java 1.5 中通过
[JSR 166](https://jcp.org/en/jsr/detail?id=166) 被合并进 JDK 中，成了现在的
`java.util.concurrent` 包。从此 Java 程序员们就拥有了其它语言开发者们艳羡的并
发工具。

JUC 的内容丰富，本节不会详细介绍，这里我们先看看整体包含的内容：

* locks 提供了粒度更细的一些锁的语义
* atomic 和 collections 提供了线程安全的类，几乎能满足日常并发下的存储需求
* executor 提供了线程池相关的工具，解决日常的并发调度需求

![JUC Overall Hierarchy](J.U.C.svg)

（上图参考 [深入浅出 Java Concurrency (1) : J.U.C的整体认识](http://www.blogjava.net/xylz/archive/2010/06/30/324915.html) 制作
，且以 Java 8 为准）

## 一些注意点

**有并发的地方就需要用线程安全类**。虽然可能显而易见，要注意的是只有包装类提供
的方法才保证是原子的，而里面存储的内容则没有。例如 `ConcurrencyHashMap<String,
HashMap<String, Card>> accounts;` 外层 `ConcurrencyHashMap` 存储的是“人”到“帐
户”的映射，内层 `HashMap` 存储的是这个人的“卡号”到“卡信息”的映射。那么如果并发
直接对内层信息进行修改，是保证不了线程安全的。

**迭代器不是原子的**。线程安全的集合类只有提供的方法是原子的（如`get()`、
`put()`等），由于并没有全局锁（也不应该有），从集合类中获得的迭代器（Iterator
）**不是**线程安全的，如：

```java
for (Map.Entry<String, Object> entry: concurrentMap) {...} // 线程不安全
```

**TOCTOU 问题依旧存在**。尽管线程安全类提供的方法本身是原子的，前面说过，基本
操作是原子的不代表复合操作是原子的，如：

```java
ConcurrencyMap<String, Object> cache = new ConcurrencyHashMap<>();
// ...
if (cache.containsKey(x)) {
  return cache.get(x);
}
```

尽管 `cache.containsKey` 与 `cache.get` 方法都是原子的，但可能在 `get` 之前，
由另一个线程执行了 `remove`，导致 `get` 失败，或执行了另一个 `put` 导致 `get`
的数据不符合预期。

幸运的是 JUC 类中提供了一些常见的原子复合操作，例如 `ConcurrencyHashMap` 中的
`putIfAbsent` 只有当key 不存在时才执行函数并插入，`computeIfPresent` 只有当
key 存在时才执行某个变换操作。

## 小结

本节内容不多，却可能是最实用的一节。日常的线程安全问题通常会落在原始（
primitive）类型和集合（Collection）类，而使用对应的线程安全类通常就能直接解决
问题。

JUC 是线程安全类的佼佼者，值得深入使用和学习。

不过即使使用线程安全的包装类，也要注意它们的“安全”边界在哪里。

---

[^read-write-lock-doc]: 大家可以看看 JDK 11 的 [ReadWriteLock](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/concurrent/locks/ReentrantReadWriteLock.html) 中的 "Sample usages" 示例，实际上是有问题的（`rwl.readLock().lock();` 应该要放在 `finally` 中）。强如官方文档，都会出错。
