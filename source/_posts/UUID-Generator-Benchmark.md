title: UUID 生成器有多快？
toc: true
date: 2019-05-26 19:57:58
tags: [benchmark, UUID, java]
categories: [Notes]
---

在 Java 中，我们常用 `UUID.randomUUID()` 来随机生成一个 UUID。但在某些极端的情
况下，它的性能可能满足不了你的要求（虽然几乎不可能出现）。这里我们测试了 4 种
UUID 生成器的性能。

## 测试结果

最终测试的结果如下（虽然只看到 3 根线，但其实有 4 根，其中蓝线 UUID.randomUUID
与绿线 jugWithSecureRandom 几乎重合）：

{% asset_img uuid-bench.svg UUID Bench Result %}

可以看到：
* 在单线程时，jugWithRandom 远远超过其它的生成器，而 jugTime 次之。
* 随着线程的增加，各生成器的吞吐均有所下降。
    * randomUUID 中使用 SecureRandom 来获取随机数，而它是通过获取操作系统的一
        些随机噪声来生成随机数的，所以是安全的，但性能却不是很好（相对）。
    * 所有这些生成器都是线程安全的，换句话说内部会做线程同步，因此线程增加，吞
        吐会下降。
    * 其中 Random 是用 CAS 来完成同步，其余均使用 `synchronized`，理论上高并发
        下，线程数越多，Random 的性能越差，而其它则几乎不变。
* 注意 jugTime 在单线程时吞吐接近 1w/ms，这也是基于时间的 UUID 每毫秒能拥有的
    最大数值（参考[uuid-timebased 说明](https://www.famkruithof.net/guid-uuid-timebased.html)）。
* jugTime 的生成器的性能几乎总是优于 `randomUUID`。
* 不过现实中，不太能遇到有场景需要有 1k/ms 这样的吞吐需求。


## 测试设置

这里我们测试了 java 内置的 `UUID.randomUUID()`，
[java-uuid-generator](https://github.com/cowtowncoder/java-uuid-generator) 的
`TimeBasedGenerator` 和 `RandomBasedGenerator`，而其中随机数发生器分别选用
`Random` 和 `SecureRandom`。[测试代码](https://gist.github.com/lotabout/da61c34208b7c11f856afce480560b0d) 如下：


```java
@BenchmarkMode({Mode.Throughput})
@OutputTimeUnit(TimeUnit.MILLISECONDS)
@State(Scope.Benchmark)
@Warmup(iterations = 5)
public class MyBenchmark {

    private RandomBasedGenerator randomBasedGenerator;
    private RandomBasedGenerator jugRandomGenerator;
    private TimeBasedGenerator timeBasedGenerator;

    @Setup
    public void init() {
        randomBasedGenerator = Generators.randomBasedGenerator();
        timeBasedGenerator = Generators.timeBasedGenerator();
        jugRandomGenerator = Generators.randomBasedGenerator(new Random());
    }

    @Benchmark
    public void UUIDRandomUUID(Blackhole bh) {
        bh.consume(UUID.randomUUID());
    }

    @Benchmark
    public void jugWithRandom(Blackhole bh) {
        bh.consume(jugRandomGenerator.generate());
    }

    @Benchmark
    public void jugWithSecureRandom(Blackhole bh) {
        bh.consume(randomBasedGenerator.generate());
    }

    @Benchmark
    public void jugTime(Blackhole bh) {
        bh.consume(timeBasedGenerator.generate());
    }
}
```

测试框架使用 Jmh。测试使用 jdk 1.8 在 8C MacBook Pro 下完成，分别测试了
`1,2,4,8` 个线程下的吞吐。

## 写在后面

这个测试的起因是产品在压测的时候发现 UUID 生成占 Running 线程较大的部分，且
JProfiler 的线程图中有许多线程是 Blocking 的状态，因此猜测是 UUID.randomUUID中
的synchronized 导致线程同步慢，所以想找一些替代的生成器。最后发现
UUID.randomUUID 的吞吐并不是什么大的问题，但也很庆幸做了这个测试，了解了 UUID
生成器的能力，还有 Time-Based UUID 也是一个不错的选择。
