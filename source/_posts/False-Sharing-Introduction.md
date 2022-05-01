title: 伪共享（False Sharing）简介
toc: true
date: 2022-05-01 14:22:45
tags: [false sharing, cache, MESI]
categories: Knowledge
---

如果你阅读过 Java 的 `Striped64` 源码（没看过的可以看看博主的
[这篇文章](https://lotabout.me/books/Java-Concurrency/Source-Atomic/Striped64.html)），
可能遇到过 `@Contended` 注解。如果你经常看 C 语言的代码，也可能遇到过在结构体
加 padding 的情形。它们都是为了提高缓存的性能，解决伪共享（False Sharing）的问题。

## 缓存行（cache line）

首先需要知道一个概念：cache line（缓存行）。缓存从内存加载数据时，并不是只加载
我们请求的那部分，而是会多加载一些，例如我们想访问一个 int，只有 4 字节，但缓
存会一次性加载 64 字段（不同机器不同）。缓存每次处理的这一“块”数据，就叫 cache
line。

为什么缓存要多加载数据呢？为了利用空间局部性（space locality）来提高性能
[^ref-not-word-boundary]。相当于是缓存做了猜想，后续地址的数据，通常就是接下来
马上要访问的数据，提前加载能提高性能。

## 缓存一致性与 MESI 协议

现代 CPU 体系中，一般每个核都单独配备了自己的（L1）缓存，为了保证多个
CPU 在读写缓存时保证整体数据的一致性，通常需要使用缓存一致性协议，MESI 就是其
中一种（可以参考博主的[这篇文章](https://lotabout.me/2022/MESI-Protocol-Introduction/)）。

MESI 协议可以简单理解为“踢人协议”，如果一个 CPU 写数据到缓存里，则需要“踢”掉其
它缓存里的副本。

{% asset_img MESI-invalidate.svg MESI invalidate %}

上图中，第 ⑦ 步就是“踢人”的操作。同时要注意如果 CPU 对缓存只做“读”操作，缓存
也是需要同步的，如上图的第 ⑤ 步，只是它的开销更小。

## 伪共享（False Sharing）

缓存一致性说的是一个 cache line 在不同缓存间的同步操作。那如果一个 cache line
上存了两个变量，并且两个变量分别被不同的线程写入呢？

{% asset_img MESI-false-sharing.svg MESI invalidate %}

可以看到，虽然 CPU A 和 CPU B 各自在写自己关心的变量 `x` 和 `y`，但由于它们存
在于同一个 cache line，每次写入都会造成另一个 CPU 的缓存失效。造成严重的性能问
题。


[^ref-not-word-boundary]: 注意一般 C 语言里 padding 还有另一个作用，将数据按
  “字”来对齐地址，这也有助于提高性能，但缓存的视角主要还是在局部性上

## 常见场景与解法

我们看到伪共享的发生有两个条件：

1. 两个变量在同一个缓存行里。通常是一个类/结构体的两个 field，或是同一个数组的
   相邻元素
2. 不同线程同时对两个地址读写[^ref-write-part]。因此通常发生在高并发的场景下。

[^ref-write-part]: 两个线程同时写入的情况比较明显；一写一读也有问题；两个线程
  都是读则没有问题

由于 #2 条件多线程处理一般是业务要求，解法通常是打破 #1 条件：**加 padding，让
一个cache line 里只保留一个变量**[^ref-padding-not-versatile]。例如 `int` 只占
`4` 字节，可以在后面加 15个没用的 int 变量，撑满 `64` 字节[^ref-line-size]。而
Java 专门提供了`@Contended`[^java8-java9] 来简化这种情形。

[^ref-padding-not-versatile]: 采用 padding 的方式其实不一定靠谱，因为编译器优
  化有可能会把没用的字段去掉
[^ref-line-size]: `64` 这个数字并不是固定的，有些机器会设置为 `128` 字节，
  Linux 下可以执行 `getconf LEVEL1_DCACHE_LINESIZE` 来查看 cache line 大小，
  MacOS 下执行 `sysctl hw.cachelinesize`
[^java8-java9]: Java 8 中通过 `@sun.misc.Contended` 引用，
  [Java 9 及之后](https://www.javaspecialists.eu/archive/Issue249-Contended-since-9.html)，通过
  `@jdk.internal.vm.annotation.Contended` 引用，但需要额外 export 一些包

## False Sharing 的影响有多大？

JMH 有一个测 False Sharing 的
[Benchmark](http://hg.openjdk.java.net/code-tools/jmh/file/251f914ff0c1/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_22_FalseSharing.java)
，在我的机器上（20c、Java 11）运行结果[^ref-enable-contended]如下：

[^ref-enable-contended]: 需要在启动参数上加上 `-XX:-RestrictContended`，用户代
  码里加的 `@Contended` 才能生效。

```
Benchmark                          Mode  Cnt      Score     Error   Units
BenchmarkRunner.baseline          thrpt   25  10145.377 ± 240.354  ops/us
BenchmarkRunner.baseline:reader   thrpt   25   1305.421 ± 120.908  ops/us
BenchmarkRunner.baseline:writer   thrpt   25   8839.956 ± 211.739  ops/us
BenchmarkRunner.contended         thrpt   25  11329.372 ± 105.857  ops/us
BenchmarkRunner.contended:reader  thrpt   25   2845.015 ±  48.006  ops/us
BenchmarkRunner.contended:writer  thrpt   25   8484.357 ± 112.052  ops/us
BenchmarkRunner.hierarchy         thrpt   25  11373.481 ±  39.691  ops/us
BenchmarkRunner.hierarchy:reader  thrpt   25   2885.091 ±  56.386  ops/us
BenchmarkRunner.hierarchy:writer  thrpt   25   8488.389 ±  78.959  ops/us
BenchmarkRunner.padded            thrpt   25  11338.519 ±  49.043  ops/us
BenchmarkRunner.padded:reader     thrpt   25   2868.776 ±  51.762  ops/us
BenchmarkRunner.padded:writer     thrpt   25   8469.743 ±  78.427  ops/us
BenchmarkRunner.sparse            thrpt   25   9288.740 ±  63.073  ops/us
BenchmarkRunner.sparse:reader     thrpt   25   2582.364 ±  26.045  ops/us
BenchmarkRunner.sparse:writer     thrpt   25   6706.376 ±  77.000  ops/us
```

baseline、contended 及 padded 吞吐上的差别大概 `10%`（网上一些文章差异在 2 倍、
3 倍，和我的结果出入这么大的原因还没找到）。我们再用 perf 对比 cache misses：

```
---------------------------- Baseline ------------------------------------
      1,012,415.83 msec task-clock                #   19.258 CPUs utilized
            39,279      context-switches          #    0.039 K/sec
             1,813      cpu-migrations            #    0.002 K/sec
            82,632      page-faults               #    0.082 K/sec
 4,855,609,024,017      cycles                    #    4.796 GHz                      (50.03%)
 4,682,761,843,004      instructions              #    0.96  insn per cycle           (62.52%)
   685,213,954,685      branches                  #  676.811 M/sec                    (62.53%)
       160,820,719      branch-misses             #    0.02% of all branches          (62.51%)
 2,551,078,768,362      L1-dcache-loads           # 2519.793 M/sec                    (62.47%)
    23,872,018,958      L1-dcache-load-misses     #    0.94% of all L1-dcache hits    (62.47%)
    12,410,125,606      LLC-loads                 #   12.258 M/sec                    (49.98%)
         2,810,037      LLC-load-misses           #    0.02% of all LL-cache hits     (50.01%)

---------------------------- Contended -----------------------------------
      1,011,118.07 msec task-clock                #   19.219 CPUs utilized
            38,773      context-switches          #    0.038 K/sec
             1,830      cpu-migrations            #    0.002 K/sec
            82,441      page-faults               #    0.082 K/sec
 4,849,385,107,175      cycles                    #    4.796 GHz                      (49.99%)
 6,794,835,895,672      instructions              #    1.40  insn per cycle           (62.48%)
 1,006,635,368,787      branches                  #  995.567 M/sec                    (62.49%)
       147,370,270      branch-misses             #    0.01% of all branches          (62.49%)
 3,585,031,069,557      L1-dcache-loads           # 3545.611 M/sec                    (62.50%)
       615,324,166      L1-dcache-load-misses     #    0.02% of all L1-dcache hits    (62.51%)
       167,043,519      LLC-loads                 #    0.165 M/sec                    (50.01%)
         2,434,845      LLC-load-misses           #    1.46% of all LL-cache hits     (50.01%)
```

对比其中的 `L1-dcache-load-misses`，可以看出，加了 `@Contended` 的 cache miss
只有 baseline 的 `3%`。

## 小结

缓存的加载写入以 cache line 为单位，典型的大小为 64B。为了保证多 CPU 下缓存数
据的一致性，需要使用一些缓存一致性协议，MESI 是其中的一个经典协议，写入缓存行
时会“踢掉”其它 CPU 上的缓存。如果两个变量在同一个 cache line 中，且多线程频繁
读写这两个变量，会导致多 CPU “互踢”对方的 cache line，导致性能下降。在博主的机
器上 False Sharing 实测大概慢 10%，而 cache miss 大概是正常的 33 倍。

## 参考

- [A Guide to False Sharing and @Contended](https://www.baeldung.com/java-false-sharing-contended) 
  里面基本把 False Sharing 涉及的知识都说清楚了，推荐阅读
- [@Contended (a.k.a. JEP 142)](https://shipilev.net/talks/jvmls-July2013-contended.pdf) PPT 介绍 `@Contended` 功能及实现
- [JVM series: Contend annotation and false-sharing](https://www.programmersought.net/article/343975650.html) 其中的实验显示 padding 版本的吞吐大概是没有 padding 版本的 2 倍
