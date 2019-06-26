title: 'QQA: jstat gcutil 的输出是什么意思'
date: 2018-11-11 20:17:42
tags: [QQA, JVM, java]
categories: [QQA]
toc:
---

当 Java 程序有性能问题时，尤其是响应时间有突然变化时，最好第一时间查看 GC 的状
态。一般用 `jstat -gcutil <pid> 1s` 来查看，那么它的输出又是什么含义呢？

## 输出样例

一般会用两种方式调用 `jstat`，一种看百分比，一种看具体数值(KB)。

例如 `jstat -gcutil <pid> 1s` 会每隔一秒输出内存相关信息，示例输出如下：

```
S0     S1     E      O      M     CCS    YGC     YGCT    FGC    FGCT     GCT
0.00   0.00  34.47  44.29  93.05  83.49     10    0.036     2    0.117    0.153
0.00   0.00  45.70  44.29  93.05  83.49     10    0.036     2    0.117    0.153
0.00   0.00  58.12  44.29  93.05  83.49     10    0.036     2    0.117    0.153
```

而 `jstat -gc <pid> 1s` 会输出具体占用的数值，如下（比较长）：

```
S0C    S1C    S0U    S1U      EC       EU        OC         OU       MC     MU      YGC     YGCT    FGC    FGCT     GCT
4608.0 6656.0  0.0    0.0   62464.0  48011.4   30720.0    13605.8   35456.0 32991.3 10    0.036   2      0.117    0.153
4608.0 6656.0  0.0    0.0   62464.0  49261.5   30720.0    13605.8   35456.0 32991.3 10    0.036   2      0.117    0.153
4608.0 6656.0  0.0    0.0   62464.0  49261.5   30720.0    13605.8   35456.0 32991.3 10    0.036   2      0.117    0.153
```

要理解上面输出的具体含义，需要了解 Java 的内存与 GC 的过程。

## GC 过程简要梳理

下图是 GC 过程的概要（图片来源 plumbr.io）：

![how-java-garbage-collection-works](https://plumbr.io/wp-content/uploads/2015/05/how-java-garbage-collection-works.png)

如上图，JVM 中的内存中的各个区域和作用如下（这里只是概述，细节麻烦查阅相关材料）：

- `Eden`（伊甸园）：创建新对象时会从中分配内存。内存不足时，触发 Young
GC。不再被引用的对象将被抛弃，还被引用的对象会被复制到 Survivor 区。
- `Survivor`（幸存者）：有两个 Survivor 区，GC 时会来回地把内存从其中一个区复
制到另一个，交替进行。这里存储的是一些“年轻”的对象，多次 GC （默认 15 次
）后这些对象还停留在 Survivor 区，则认为它们会被长期引用，Survivor 空间不
足时会将它们移动到“老生代”中。来回复制的过程中除了释放内存，还起到整理内存
碎片的作用。
- `Tenured`（终生代）、也称 `Old Generation`（老生代）：保留那些“长期”被引用的对象。因
此该区域只在 Full GC 的时候才会被整理。
- `PermGen`/`MetaSpace`，Java 8 前是 PermGen，Java 8 后改成 MetaSpace。用来存储诸如
加载的类、字符串常量等元信息，与 GC 无关。

另外：`Eden` 与 `Survivor` 统称“年轻代”，它们引发的 GC 也称 "Young GC"。Young
GC 通常比 Full GC 快很多，如果系统有卡顿，一般需要关注 Full GC。

## jstat 输出含义

了解了 GC 的过程，其实 `jstat` 的输出通过查文档 `man jstat` 就可以找到。这里权
且作个翻译：

`-gcutil` 的输出如下

| Column  | Description                                 |
| ------- | ------------------------------------------- |
| S0      | 第 0 个 survivor（幸存区）使用的百分比      |
| S1      | 第 1 个 survivor（幸存区）使用的百分比      |
| E       | `Eden` 区使用内存的百分比                   |
| O       | 老生代内存使用的百分比                      |
| P/M     | `PermGen`/`MetaSpace` 的内存使用百分比      |
| YGC     | 程序启动以来 Young GC 发生的次数            |
| YGCT    | 程序启动以来 Young GC 共消耗的时间(s)       |
| FGC     | 程序启动以来 Full GC 发生的次数             |
| FGCT    | 程序启动以来 Full GC 共消耗的时间(s)       |
| GCT     | 程序启动以来 GC 的总用时(s)                 |

`-gc` 的输出如下

| Column  | Description                                 |
| ------- | ------------------------------------------- |
| SOC     | 第 0 个 Survivor 区的总空间 (KB).           |
| S1C     | 第 1 个 Survivor 区的总空间 (KB).           |
| S0U     | 第 0 个 Survivor 区已使用的空间 (KB).       |
| S1U     | 第 1 个 Survivor 区已使用的空间 (KB).       |
| EC      | Eden 区的总空间 (KB).                       |
| EU      | Eden 区已使用的空间 (KB).                   |
| OC      | OldGen 的总空间 (KB).                       |
| OU      | OldGen 已使用的空间 (KB).                   |
| PC/MC   | `PermGen`/`MetaSpace` 的总空间 (KB).        |
| PU/MU   | `PermGen`/`MetaSpace` 使用的空间 (KB).      |
| YGC     | 程序启动以来 Young GC 发生的次数            |
| YGCT    | 程序启动以来 Young GC 共消耗的时间(s)       |
| FGC     | 程序启动以来 Full GC 发生的次数             |
| FGCT    | 程序启动以来 Full GC 共消耗的时间(s)       |
| GCT     | 程序启动以来 GC 的总用时(s)                 |

## 参考

- [Garbage Collection in Java](https://plumbr.io/handbook/garbage-collection-in-java) Plumbr 的 GC 教程，深入浅出。
- [Java Platform, Standard Edition HotSpot Virtual Machine Garbage Collection Tuning Guide](https://docs.oracle.com/javase/8/docs/technotes/guides/vm/gctuning/index.html) 官方 GC 教程，据说你需要知道的都在里面。

最后是一张 GC 流程图（来源：https://blog.csdn.net/u012102536/article/details/58587090 ）

![GC 流程](https://img-blog.csdn.net/20170228112452691)
