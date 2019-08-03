title: 'QQA: 为什么 Prometheus increase 不返回整数？'
toc: true
date: 2019-08-03 11:25:00
tags: [QQA, prometheus, increase, ]
categories: [QQA]
---

用 Prometheus 作业务监控，需要统计“今日请求量”，很自然想到用 `increase` 函数
。实际效果是它不返回整数，甚至在突然的压力下“请求量”还会减少。为什么会发生这些
现象呢？

原因是 `increase`/`rate` 函数对区间的统计信息做了“线性外插”，是一个估算值。

## Prometheus 怎么做线性外插

如下图：我们每隔 5s 采样一次，问在 `[3s, 23s]` 的区间内增长了多少？这里的问题
在于查询区间的时间与采样时间不重合，因此并没法得到准确的数值。

{% asset_img extrapolated.svg Extrapolated %}

Prometheus 的策略是拿到样本的端点 `{5s: 10}` 与 `{20s: 30}`，并计算它们的区间
为`20 - 5 = 15s`，期间请求量增长了 `30 - 10 = 10` 次。因此推算每秒增长了
`20/15`次，按增长率估算在`[3s, 23]` 这 20s 期间，增长了 `20 * (20/15) = 26.67`
次。

线性插值是假设数据线性增长进行推测，而“外插”则表示推测的数据范围数据 `[3s,
23s]` 在样本点定义域 `[5s, 20s]` 之**外**。

当然 Prometheus 还考虑了其它一些极端情况，如样本点太少，数据归零等情形，这里不
作说明。

## 为什么请求量会减少？

在突然的高压力下，数据就不再是“线性”分布，此时线性外插就会失真。如下图：

{% asset_img decreased.svg Decreased %}

考虑 `[5s, 10s]` 区间时，增长率为每秒 8 次，而在考虑 `[5s, 15s]` 时只有每秒
4.2 次，只有之前的近一半。从而导致外插后的请求量反而减少了。

## 参考

- [Prometheus extrapolatedRate](https://github.com/prometheus/prometheus/blob/9e47bb8b46dbd364d4c47634823760053846efb1/promql/functions.go#L65) 外插逻辑的源代码
- https://ihac.xyz/2018/12/11/Prometheus-Extrapolation原理解析 讲解了外插的原理及动机
