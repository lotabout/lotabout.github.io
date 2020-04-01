title: 实验：ForkJoinPool 并行度
toc: true
date: 2020-04-01 22:00:47
tags: [benchmark, java, ForkJoinPool]
categories: [Notes]
---

在调用外部接口时通过 `CompletableFuture.supplyAsync` 异步调用，该方法默认将任
务提交到全局唯一的 ForkJoinPool，而它的并行度可以受
`java.util.concurrent.ForkJoinPool.common.parallelism` 影响。

本实验的目的是探究在异步请求快响应(~= 1ms)时，并行度对整体性能的影响。

<!--more-->

## 实验设置

真实场景：

* 每次请求约调用接口 200 次
* 每次接口请求约 1ms 完成

当然由于接受并发请求，同时会接收多个请求，暂不纳入考虑。bench 代码如下：

```java
List<Future> futures = new ArrayList<>();
for(int i=0; i<N; i++) {
    final int x = i;
    futures.add(CompletableFuture.supplyAsync(() -> {
        try {
            Thread.sleep(1);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        bh.consume(x);
        return x;
    }));
}

for (Future future: futures) {
    future.get();
}
```

## 实验环境

* OS: Mac, 8C, 16G
* Java version: JDK 11.0.2, OpenJDK 64-Bit Server VM, 11.0.2+9
* Bench 框架：JMH
* JMH 调用参数：`java -jar target/benchmarks.jar -i 5 -bs 50 -f 3`


## 实验结果

实验结果如下图：

{% asset_img result.svg Benchmark Result %}

* 图中的并行度分别为 1, 2, 4, 8, 16, 32, 64, 128, 256
* 图中的 x 轴间隔是 log 过后的结果，可以看到两点的 x 轴距离相等
* 最左边的点 `parallelism = 1` 时，ForkJoinPool 会为每个提交的任务创建一个线程
* 第二个点代表 `parallelism = 2`，此时最多运行两个线程，预期的时间为
    `1 * 200 50 / 2 = 5000ms` 实际开销 `6610`，多出的猜测是线程创建和切换
* 并行度翻倍后，平均时间大概减少一半，但随着并行度的增大(>8)，减少的时间慢慢就
    小于一半了。
* 最后即使 `parallelism > 200`，也没办法达到完全并行(1ms)的状态。

大致结论：并行度越大效果越好，但 overhead 也会越来越大。

详细实验结果参见：[Gist: CompletableFuture.supplyAsync profile](https://gist.github.com/lotabout/430f96f0829cc586c773643a9883d1ec)
