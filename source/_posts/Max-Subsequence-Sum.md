title: 精秒的算法──最大子序列和
toc: true
date: 2019-07-31 20:44:02
tags: [algorithm]
categories: [Knowledge]
math: true
---

给定整数序列 A，对所有的子序列分别求和，求和能达到的最大值。例如对于 `[-2, 11,
-4, 13, -5, -2]` 这个序列，答案为 20 (选取子序列 `[11, -4, 13]`)。
这个问题十分有趣，它有至少 4 种不同的解法，每种方法的时间复杂度各不相同。

方便起见，如果所有数都是负数，则认为最大的子序列和为 0。

(本文内容可在《数据结构与算法分析》一书中找到，本文算是读书笔记)

## 解法一

看到题目先审题，我们逐个分析：

1. 什么是子序列？任选 `i`, `j` 分别作为起始和结束，取元素 $A_i, A_{i+1}, \dots A_j$ 形成子序列
2. 子序列和：即 $A_i + A_{i+1} + \dots + A_j$。

要求子序列和的最大值，只需要穷举出所有的子序列，求和并比较即可。于是代码如下：

```python
def solution1(A):
    max_sum = 0
    for i in range(len(A)):
        for j in range(i, len(A)):
            max_sum = max(max_sum, sum(A[i:j+1]))
    return max_sum

solution1([-2, 11, -4, 13, -5, -2]) # => 20
```

我们知道，`i, j` 的组合且 `i<=j` 大约有 $\frac{C_n^2}{2} = O(n^2)$ 个，且每次
计算子序列和需要 $O(n)$，算法的复杂度是 $O(n^3)$。这个复杂度很可怕，如果序列里
有 10 万个数就基本算不出结果了。

## 解法二

优化算法时需要思考的是，原算法是不是有“不必要的计算”？减少这些计算就能提高算法
的效率。对于解法一而言，在计算子序列和时，其实做了不少的重复计算，如下：

{% asset_img dup-sum-1.svg Duplicated Calculation 1 %}

计算 `i=1, j=4` 的序列和时，重复计算了 `i=1, j=3` 的序列和。我们利用
这一发现来提供算法的效率：

```python
def solution2(A):
    max_sum = 0
    for i in range(len(A)):
        this_sum = 0
        for j in range(i, len(A)):
            this_sum += A[j]                 # 只增加当前的值，减少重复计算
            max_sum = max(max_sum, this_sum)
    return max_sum

solution2([-2, 11, -4, 13, -5, -2]) # => 20
```

这个解法的时间复杂度是 $O(n^2)$，对于 10 万的数据量已经能算出结果了，虽然比较
慢。

## 解法三

上面的算法里还有不必要的计算。假设我们通过一些对比，已经知道了三个信息：

1. 所有包含 x 元素的子序列的和的最大值
2. 所有元素均在 x 之前的子序列的和的最大值
3. 所有元素均在 x 之后的子序列的和的最大值

{% asset_img dup-sum-2.svg Duplicated Calculation 2 %}

则其实我们要求的结果就是这三个值的最大值。上图中，我们不会去计算和对比子
序列 `[i, m]` 的值，因为它也包含 x 元素，所以必然小于 `[i, n]`。因此减少了一些
不必要的计算。代码如下：

```python
def solution3(A):
    # 基准情形
    if len(A) == 0:
        return 0
    elif len(A) == 1:
        return max(0, A[0])

    mid = len(A)//2
    left_part = A[:mid]
    right_part = A[mid:]

    max_left_sum = solution3(left_part)
    max_right_sum = solution3(right_part)

    # 计算包含 mid 的子序列和的最大值
    # = 以 mid 结尾的子序列的和的最大值 + 以 mid+1 开头的子序列的和的最大值

    max_left_border_sum = 0
    left_sum = 0
    for v in reversed(left_part):
        left_sum += v
        max_left_border_sum = max(left_sum, max_left_border_sum)

    max_right_border_sum = 0
    right_sum = 0
    for v in right_part:
        right_sum += v
        max_right_border_sum = max(right_sum, max_right_border_sum)

    return max(max_left_sum, max_right_sum, max_left_border_sum + max_right_border_sum)

solution3([-2, 11, -4, 13, -5, -2]) # => 20
solution3([4, -3, 5, -2, -1, 2, 6, -2]) # => 11
```

该解法的时间复杂度为 $O(n\log n)$。计算法复杂度为 $T(n)$，则依据代码我们有

$$
\begin{align}
T(1) &= 1  \\\\
T(n) &= 2T(n/2) + O(n)
\end{align}
$$

可以最终推出 $T(n) = O(n \log n)$。这个复杂度对于 10 万的数据量可以轻松得到结
果，甚至对于 100 万的数据量也能很快得到结果。

## 解法四

通常情况下，得到一个 $O(n \log n)$ 的算法已经能应付绝大多数现实情况下的问题了
。但难以置信的是，对于这个问题而言，算法还可以继续优化。代码如下：

```python
def solution4(A):
    max_sum = 0
    this_sum = 0
    for x in A:
        this_sum += x
        if this_sum > max_sum:
            max_sum = this_sum
        elif this_sum < 0:
            this_sum = 0
    return max_sum
solution4([-2, 11, -4, 13, -5, -2]) # => 20
```

这个方法比起上一个算法减少了哪些不必要的计算？考虑下面的示例：

{% asset_img dup-sum-3.svg Duplicated Calculation 3 %}

解法三在计算包含中间元素的子序列的最大值时，会向左求和，直到 `-2` 为止。但之后
在求左边元素的子序列最大值时，又要重复计算 `-2, -3` 的和，尽管我们已经知道最大
和的子序列肯定不会以 `-2` 开头。

马后炮地说，上面这个算法代码简洁，性能又高，是因为我们充分分析了问题的特点，注
意到：

1. 注意到我们只需要知道最大的子序列和，并不关心具体是哪个子序列得到了最大值。
2. 如果 `A[i]` 为负数，则最大和肯定不会以它为起点
3. 类似的，如果一个子序列的和为负数，则它不会是最大和子序列的前缀。

因此当累加和得到负数时，我们可以立马抛弃它，而不需要再考虑这个子序列与
后续子序列的组合。这个解法的时间复杂度是 $O(n)$，几乎是你能得到的最好的复杂度。

## 小结

在思考这个题目的时候，我怎么也想不出来解法三和解法四。归根结底，还是对题目的分
析不够透彻，对题目隐含的条件挖掘不够深入。而对我的启示则是：复杂度的提升根本在
于减少不必要的计算，而这依赖于问题/输入本身的约束。就像通过两两对比的排序理论
的最好复杂度是 $O(N \log N)$，而桶排序却可以通过其它的约束达到 $O(N)$。
