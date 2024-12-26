title: KMP 字符串匹配算法原理详解
toc: true
date: 2024-12-25 23:21:30
tags: [Algorithm]
categories: [Knowledge]
---

KMP 算法非常精妙，代码写出来没几行，但它的原理却不容易理解。之前学习和遗忘了很
多次。正好这次也忘得差不多了，记录下重新理解的过程。

## 字符串匹配难在哪里

字符串匹配其实就是要实现字符串的 `contains` 方法，判断一个字符串 `s` 中是否包
含另一个字符串 `p`。例如 `"hello".contains("ll")` 应该返回 `true`。应该如何实
现呢？

一个很自然的想法是一个个匹配（如下图左侧）。从 `s` 的第一个字符开始，依
次和 `p` 进行匹配 ①，如果匹配失败，从 `s` 的下一个字符开始，再次尝试匹配 ②，
依此类推 ③。

![How to do String Match Naively](kmp-naive.svg)

这种方法的问题是需要的匹配次数太多。它的时间复杂度是 `O(mn)`，`m` 和 `n`
分别是 `s` 和 `p` 的长度。

## 哪里可以优化

通常在匹配过程中，待查找/匹配的字符串 `p` 是固定的，而被查找的字符串 `s` 是未
知的，这意味着我们可以充分对 `p` 进行分析，从而优化匹配过程。

![Some matches could be skipped](kmp-should-do.svg)

观察匹配过程，虽然我们并不知道 `s` 有哪些字符，但在 ① 的匹配过程中，前几个字符
和 `p` 是匹配的，因此我们能确认 `s` 的前 5 个字符一定是 `s[0:5] = "ababa"`。

那么，当我们尝试把 `s` 向后移位，去匹配 `s[1:5]` 与 `p` 时，我们其实是在浪费时
间，因此我们已经知道 `s[1] = 'b'` 而 `p[0] = 'a'`，肯定是不匹配的。这就是 ② 的
情况。

再考虑 ③ 中的匹配，同样由于已经知道了 `s[0:5] = "ababa"`，移 2 位后 `s[2:5] =
"aba"`，肯定是能和 `p` 的前三个字符 `p[0:3] = "aba"` 匹配的。没必要再匹配一遍，
可以直接从`s[5]` 和 `p[3]` 开始匹配。

换句话说，通过 ① 中的匹配得到的关于 `s` 的信息，以及对字符串 `p` 的分析，在 ①
匹配失败后，我们其实可以直接跳到 `s[5]` 和 `p[3]` 开始匹配（如上图右侧）。以此
节省许多无效的匹配。

## 跳到哪里

上面的分析中，为什么我们能判断 ① 匹配失败后，直接尝试匹配 `s[5]` 和 `p[3]` 就
可以呢？这是因为我们不断地向后移位，直到移了 `x` 位时，发现 `s[x:5]` 与`p[0:
5-x]` 匹配。在上例中，`x = 2`。于是下一次就可以从 `p[5-x]` 开始匹配。

![KMP: Shift and Match process](kmp-shift.svg)

- 这个分析其实完全不需要 `s`，因为所有 `s` 中要用到的信息（匹配的字符）都
  包含在 `p` 中了
- 移位和跳过匹配的过程，可以看作是在 `p` 中找到一个最长的前缀，使得这个
    前缀同时也是 `p` 的后缀

![KMP algorithm's key: Searching for same prefix and postfix](kmp-same-prefix-postfix.svg)

因此我们实际上要求的是：对于一个字符串 `p[0:n]`，找到一个最长的前缀，使得这个
前缀（长度为 `k`）同时也是 `p` 的后缀，即 `p[0:k] = p[n-k:n]`。（注意`k`与上面
的 `x` 是不同的，`x = n-k`）。

注：下文开始，我们提到“前缀”时指的都是同时既是前缀，也是后缀的字符串。

## 如何找到最长前缀

这个问题需要递归地考虑，我们记 `T[i]` 为 `p[0:i]` 的最长前缀长度（满足前缀等于
后缀）。假设我们已经知道了所有的 `T[0], ..., T[i-1]`，现在我们要求 `T[i]`。

已知 `p[0:i]` 字符串最长前缀长度为 `T[i-1]`，前缀和后缀字符串分别记为 `X` 和 `Y`，有 `X=Y`: 

![KMP longest prefix search: step 1](kmp-step-1.svg)

① 现在 `T[i]` 最好的情况是 `T[i-1] + 1`。此时需要满足 `p[i] = p[T[i-1]]`:

![KMP longest prefix search: step 2](kmp-step-2.svg)

② 如果 `p[i] != p[T[i-1]]`，则我们可以假设已经找到了 `T[i]`，看看它满足什么条件。
首先我们知道 `T[i]` 一定小于 `T[i-1]`，所以假设找到了 `T[i]` 并记前缀为 `A`，
后缀为 `B`，则有下图：

![KMP longest prefix search: step 3](kmp-step-3.svg)

由于 `X = Y`，所以一定可以在 X 中找到后缀字符串 `C`，满足 `C = B = A`。于是我
们发现，前缀 `A` 即是 `p[0:i]` 的前缀，也是 `p[0:T[i-1]]` 的前缀。因此我们可以得
出结论：`T[i] <= T[T[i-1]]`。

![KMP longest prefix search: step 4](kmp-step-4.svg)

接着可以从最大值 `T[T[i-1]]` 开始，判断 `p[i]` 和 `p[T[T[i-1]]]` 是否相等，此
时就递归加了情况 ①。

最终，如果匹配到 `p[0]` 还是不匹配，则认为不存在前缀，此时 `T[0] = 0`。

## 建表代码

建表的逻辑就是上面描述的递归过程，只是用循环来实现：

```python
def kmp_build_table(pattern):
    table = [0] * len(pattern)
    i = 0
    for j in range(1, len(pattern)):  # ①
        while i > 0 and pattern[i] != pattern[j]:
            i = table[i - 1]  # ②
        if pattern[i] == pattern[j]:
            i += 1 # ③
        table[j] = i # ④
    return table
```

这个代码的时间复杂度是 `O(n)`，其中 `n` 是 `pattern` 的长度。

外层循环 ① 从 `1` 到 `n = len(pattern)` 运行 `O(n)` 次比较容易理解。内层循环首
先注意到 ③ 中，`i` 每次循环最多只增加 `1`，而 ④ 中 `table` 赋值为 `i`，因此可
推出 `table` 中任意 `m > n` 两个元素，满足 `table[m] - table[n] <= (m-n)`。换
句话说，在 ② 中的操作使得 `i` 是不断减小的，且全局减小的次数 `< n`，于是减少的
次数是 `O(n)` 的。另一方面 `i` 每次最多增加 `1`，增加的次数也是 `O(n)` 的。因
此整体的时间复杂度是 `O(n)`。

## 字符串匹配代码

KMP 的算法就很简单了，只需要在匹配失败时，根据表中的值跳到下一个需要匹配的位置即可：

```python
def kmp_search(text, pattern):
    table = kmp_build_table(pattern)
    i = 0
    for j in range(len(text)):
        # skip the non matching part
        while i > 0 and text[j] != pattern[i]:
            i = table[i - 1] # next char in pattern to match
        if text[j] == pattern[i]:
            i += 1 # text shift to next
        if i == len(pattern):
            return j - i + 1
    return -1
```

这里的分析和建表代码一样，重点是内层循环是回退操作，且它的值不会因为 `j` 而被
重置，因此内层的总时间复杂度是 `O(m)`，`m` 是 `pattern` 的长度。因此总的搜索时
间为 `O(m+n)`。

## 总结

个人觉得理解过程中有两个关键点：

1. 为什么最后问题等价于找到一个最长的前缀，使得这个前缀同时也是后缀
2. 在建表的过程中，为什么可以递归？（即分析中 `X = Y` 的性质，使得可以找到 `C
   = B = A` 的字符串）

如果能理解这两点，KMP 其它的部分相信就不难理解了。希望这篇文章对你有帮助。

## 参考

- [前缀函数与 KMP 算法](https://oi-wiki.org/string/kmp/#第二个优化) 这里的分析
    更详细，里面学习到了分析中 `X = Y` 的性质

## 题外话

在写代码的时候 Github Copilot 给我补全了下面的错误代码。怎么看都觉得不对，但是
像这种很经典的代码它又不太应该出错，于是怀疑自己怀疑了半天。问 ChatGPT 倒是直
接指出了错误，但让它给 test case 也老是给不对。

感慨下目前 AI 写代码，还是需要很强的鉴别能力的。这个代码在很多常见 case 下和正
确代码是一样的，但它的逻辑就是错误的，如果埋在代码里得被坑死。

```python
def kmp_build_table(pattern):
    table = [0] * len(pattern)
    i = 0
    for j in range(1, len(pattern)):
        if pattern[i] == pattern[j]:
            i += 1
            table[j] = i
        else:
            i = 0
    return table
```
