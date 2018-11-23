title: 加权随机采样 (Weighted Random Sampling)
date: 2018-11-13 21:27:43
tags: [Algorithm, WRS]
categories: [Knowledge]
math: true
toc: true
---

一个集合里有 `n` 个元素，每个元素有不同的权重，现在要不放回地随机抽取 `m` 个元素
，每个元素被抽中的概率为元素的权重占总权重的比例。要怎么做呢？

## 简单的解法

现在考虑只抽取一个元素，假设权重之和为 `1`。我们可以从 `[0, 1]` 中随机得到一个
权重，假设为 `0.71`，而后从第一个元素开始，不断累加它们的权重，直到有一个元素
的累加权重包含 `0.71`，则选取该元素。下面是个示意图：

{% asset_img naive-weighted-sampling.svg Naive weighted sampling %}

要选取 m 个元素，则可以按上面的方法先选取一个，将该元素从集合中去除，再反复按
上面的方法抽取剩余的元素。这种方法的复杂度是 `O(mn)`，并且将元素从集合中删除其
实不太方便实现。

当然，最重要的是这个算法需要多次遍历数据，不适合用在流处理的场景中。

## Algorithm A

Algorithm A 是论文 [Weighted Random
Sampling](https://utopia.duth.gr/~pefraimi/research/data/2007EncOfAlg.pdf) 中
提出的，步骤如下：

1. 对于集合 $V$ 中的元素 $v_i \in V$，选取均匀分布的随机数 $u_i = rand(0, 1)$
   ，计算元素的特征 $k_i = u_i^{(1/w_i)}$
2. 将集合按 $k_i$ 排序，选取前 $m$ 大的元素。

算法的正确性在作者 2006 年的论文 [Weighted random sampling with a
reservoir](http://www.sciencedirect.com/science/article/pii/S002001900500298X)
里给了详细的证明。论文中给出了算法的两个变种 A-Res 与 A-ExpJ，它们都能在一次
扫描中得到 `m` 个样本。非常适合在流处理的场合中。

### A-Res 算法

A-Res(Algorithm A With a Reservoir) 是 Algorithm 的“蓄水池”版本，即维护含有
`m` 个元素的结果集，对每个新元素尝试去替换结果集中权重最小的元素。步骤如下：

1. 将集合 $V$ 的前 $m$ 个元素放入结果集合 $R$。
2. 对于结果集里的每个元素，计算特征值 $k_i = u_i^{(1/w_i)}$，其中 $u_i = rand(0, 1)$
3. 对 $i = m+1, m+2, \dots, n$ 重复步骤 4 ~ 6
    4. 将结果集中最小的特征 $k$ 作为当前的阈值 $T$
    5. 对于元素 $v_i$，计算特征 $k_i = u_i^{(1/w_i)}$，其中 $u_i = rand(0, 1)$
    6. 如果 $k_i > T$ 则将 $R$ 中拥有最小 $k$ 值的元素替换成 $v_i$。

论文证明了如果权重 $w_i$ 是一般连续分布上的随机变量，
则上面的算法中插入 $R$ 的次数为 $O(m \log(\frac{n}{m}))$。
该算法用 Python 实现如下：

```python
import heapq
import random

def a_res(samples, m):
    """
    :samples: [(item, weight), ...]
    :k: number of selected items
    :returns: [(item, weight), ...]
    """

    heap = [] # [(new_weight, item), ...]
    for sample in samples:
        wi = sample[1]
        ui = random.uniform(0, 1)
        ki = ui ** (1/wi)

        if len(heap) < m:
            heapq.heappush(heap, (ki, sample))
        elif ki > heap[0][0]:
            heapq.heappush(heap, (ki, sample))

            if len(heap) > m:
                heapq.heappop(heap)

    return [item[1] for item in heap]
```

### A-ExpJ 算法

A-Res 需要对每个元素产生一个随机数，而生成高质量的随机数有可能会有较大的性能开
销，，所以论文中给出了 A-ExpJ 算法，能将随机数的生成量从 $O(n)$ 减少到
$O(m\log(\frac{n}{m})))$。从步骤上看，很像我们最开始提出的简单版本，设定一个阈
值并跳过一些元素。具体步骤如下：

1. 将集合 $V$ 的前 $m$ 个元素放入结果集合 $R$。
2. 对于结果集里的每个元素，计算特征值 $k_i = u_i^{(1/w_i)}$，其中 $u_i = rand(0, 1)$
3. 将 $R$ 中小最的特征值记为阈值 $T_w$
4. 对剩下的元素重复步骤 5 ~ 10
    5. 令 $r = rand(0, 1)$ 且 $X_w = \log( r )/\log(T_w)$
    6. 从当前元素 $v_c$ 开始跳过元素，直到遇到元素 $v_i$，满足
    7. $w_c + w_{c+1} + \dots + w_{i-1} \lt X_w \le w_c + w_{c+1} + \dots +
       w_{i-1} + w_{i}$
    8. 使用 $v_i$ 替换 $R$ 中特征值最小的元素。
    9. 令 $t_w = T_w^{w_i}$, $r2 = rand(t_w, 1)$, $v_i$ 的特征 $k_i =
       r_2^{(1/w_i)}$
    10. 令新的阈值 $T_w$ 为此时 $R$ 中的最小特征值。

Python 实现如下：

```python
def a_expj(samples, m):
    """
    :samples: [(item, weight), ...]
    :k: number of selected items
    :returns: [(item, weight), ...]
    """

    heap = [] # [(new_weight, item), ...]

    Xw = None
    Tw = 0
    w_acc = 0
    for sample in samples:
        if len(heap) < m:
            wi = sample[1]
            ui = random.uniform(0, 1)
            ki = ui ** (1/wi)
            heapq.heappush(heap, (ki, sample))
            continue

        if w_acc == 0:
            Tw = heap[0][0]
            r = random.uniform(0, 1)
            Xw = math.log(r)/math.log(Tw)

        wi = sample[1]
        if w_acc + wi < Xw:
            w_acc += wi
            continue
        else:
            w_acc = 0

        tw = Tw ** wi
        r2 = random.uniform(tw, 1)
        ki = r2 ** (1/wi)
        heapq.heappop(heap)
        heapq.heappush(heap, (ki, sample))

    return [item[1] for item in heap]
```

## 验证

我们用多次采样的方式来尝试验证算法的正确性。下面代码[^1]中为 `a`、`b`、`c` 等元素
赋予了不同的权重，采样 10 万次后计算被采样的次数与元素 `a` 被采样次数的比值。

[^1]: 修改自 https://blog.xingwudao.me/2017/09/26/sampling/

```python
overall = [('a', 10), ('b', 20), ('c', 50), ('d', 100), ('e', 200)]
def test_weighted_sampling(func, k):
    stat = {}
    for i in range(100000):
        sampled = func(overall, k)
        for item in sampled:
            if item[0] not in stat:
                stat[item[0]] = 0
            stat[item[0]] += 1
    total = stat['a']
    for a in stat:
        stat[a] = float(stat[a])/float(total)
    print(stat)
```

首先验证 A-Res 算法：

```python
test_weighted_sampling(a_res, 1)
test_weighted_sampling(a_res, 2)
test_weighted_sampling(a_res, 3)
test_weighted_sampling(a_res, 4)
test_weighted_sampling(a_res, 5)

# output
{'e': 19.54951600893522, 'd': 9.864110201042442, 'c': 4.842889054355919, 'a': 1.0, 'b': 1.973566641846612}
{'b': 2.0223285486443383, 'e': 12.17949833260838, 'd': 8.95287806292591, 'c': 4.843410178338408, 'a': 1.0}
{'a': 1.0, 'e': 6.166443722530097, 'd': 5.597171794381808, 'b': 1.9579591056755208, 'c': 4.387922797630423}
{'b': 1.8358898492044953, 'e': 2.5878688779880092, 'c': 2.4081341327311896, 'd': 2.549897479820395, 'a': 1.0}
{'a': 1.0, 'd': 1.0, 'c': 1.0, 'b': 1.0, 'e': 1.0}
```

看到，在采样一个元素时，`b` 被采样到的次数约为 `a` 的 `2` 倍，而 `e` 则约
为 `20` 倍，与`overall` 数组中指定的权重一致。而采样 5 个元素时，所有元素都会
被选中。

同理验证 A-ExpJ 算法：

```python
test_weighted_sampling(a_expj, 1)
test_weighted_sampling(a_expj, 2)
test_weighted_sampling(a_expj, 3)
test_weighted_sampling(a_expj, 4)
test_weighted_sampling(a_expj, 5)

# output
{'e': 19.78311444652908, 'c': 4.915572232645403, 'd': 9.840900562851782, 'a': 1.0, 'b': 1.9838649155722325}
{'e': 11.831543244771057, 'c': 4.709157716223856, 'b': 1.9720180893159978, 'd': 8.75183719615602, 'a': 1.0}
{'d': 5.496249062265567, 'c': 4.280007501875469, 'e': 6.046324081020255, 'b': 1.9321080270067517, 'a': 1.0}
{'a': 1.0, 'd': 2.5883654175335105, 'c': 2.440760540383957, 'e': 2.62591841571643, 'b': 1.8787559581808126}
{'a': 1.0, 'd': 1.0, 'c': 1.0, 'b': 1.0, 'e': 1.0}
```

与 A-Res 的结果类似。

## 小结

文章中介绍了 A-Res 与 A-ExpJ 两种算法，按照步骤用 Python 实现了一个简单的版本
，最后用采样的方式验证了算法的正确性。

加权随机采样本身不难，但如果需要在一次扫描中完成就不容易了。难以想像上面的算法
直到 2006 年才提出。算法本身如此之简单，也让不感叹数学与概率的精妙。


## 参考

- [Weighted Random Sampling (2005; Efraimidis,
   Spirakis)](https://utopia.duth.gr/~pefraimi/research/data/2007EncOfAlg.pdf) 2015 年论文，大概介绍了本文中提到的算法
- [Weighted random sampling with a reservoir](http://www.sciencedirect.com/science/article/pii/S002001900500298X) 作者于 2016 年的论文，其中有详细的数学证明
- [加权随机抽样](https://xiaochai.github.io/2018/03/12/weighted-random-sampling-paper/) 有 2005 年论文的翻译
- [概率加权的随机抽样 (Weighted Random Sampling) – A-Res 蓄水池算法](http://live.aulddays.com/tech/17/weighted-random-sampling-reservoir-algorithm.htm)
- [Metrics Core](https://metrics.dropwizard.io/4.0.0/manual/core.html) Java 的
    一个性能监控库，其中的 `ExponentiallyDecayingReservoir` 用到了 A-Res 算法。
