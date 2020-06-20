# 理想的并发世界

并发问题，或者说线程安全问题的根本原因是我们对编写代码的运行逻辑有某种预期，而
这种预期 JVM 或机器无法满足。那么我们的预期是什么呢？

## 单线程的执行顺序

我们对代码运行逻辑的预期主要有两个：

1. 写在代码里的操作/语句，按先后顺序执行
2. 前面操作的结果对后面的操作可见

例如 Java 代码：

```
// 初始条件 x = 0; y = 0;
1. x = 1;
2. if (x > 0)
3.    y = 2;
```

我们很自然地预期执行的顺序是 `1 > 2 > 3`，写在前面的先执行。同时在 #1 执行后，
我们预期 #2 就能看到结果，于是 #2 的 `if` 判断结果为 `true`。

这是单线程的情况，代码的顺序就是我们预期的执行顺序，那么多线程下呢？我们会有什
么预期？

## Sequential Consistency

在多线程语境下，什么执行顺序才是合理的预期呢？Leslie Lamport 提出了 [Sequential
Consistency](https://www.microsoft.com/en-us/research/uploads/prod/2016/12/How-to-Make-a-Multiprocessor-Computer-That-Correctly-Executes-Multiprocess-Programs.pdf)
（顺序一致性）来更精确地定义我们的合理预期：

> ... the result of any execution is the same as if the operations of all the
> processors were executed in some sequential order, and the operations of
> each individual processor appear in this sequence in the order specified by
> its program.[^sequential-consistency]

原文考虑的是 CPU 多个核的执行顺序，说多核的执行结果，相当于把每个核要执行的操
作排个序，在这个顺序里，要求每个核的操作依旧保持在单核内的相对顺序。例如，下图
中有两个线程 `A` 和 `B`，它们各自要执行两个操作，则符合 Sequential Consistency
的顺序如下所示：

![Sequential Consistent Execution Orders](Sequential-Consistency.svg)

可以看到，这些顺序里，`A1` 永远在 `A2` 之前，`B1` 永远在 `B2` 之前，而 `A` 和
`B` 的相对顺序是没有指定的。换句话说，我们会希望，在并发的情况下，程序在单线程
下执行的顺序依旧保持不变，而在没有人工指定多线程操作的相对顺序（同步）时，我们
对多线程的相对顺序没有预期。

可以理解为 Sequential Consistency 就是将多个线程要执行的代码交错(interleave)排
成一个新的序列。

注意的是，Sequential Consistency 其实有一个很强的隐藏假设：每一个操作都要是原
子的，且操作对下一个操作可见[^visibility]。这个假设很符合直觉，后面我们会说明
，其实底层却很难做到。

## 线程同步

Sequential Consistency 很好地描述了我们对多线程代码执行逻辑的合理预期，但
Sequential Consistency 对线程之间的操作先后并没有规定。例如我们希望先执行线程
A 的某些操作，之后才允许执行线程 B 的某些操作。

我们可以先考虑临界区(critical section)问题：希望其中的代码（一般包含多个操作）
“同时”只有一个线程在执行。从微观层面，即希望这些代码所代表的操作整体上“原子地”
执行，这些操作进行时不被其它线程的操作插队。下面是 [Dekker 算法
](https://en.wikipedia.org/wiki/Dekker%27s_algorithm)（该算法不理解也没关系，
实际上用不到）：

```
----------- Thread A --------+--------- Thread B -----------
1. a = 1;                    | 1. b = 1;
2. turn = 1;                 | 2. turn = 2;
3. if (b == 1)               | 3. if (a == 1)
4.    if (turn == 1)         | 4.    if (turn == 2)
5.        goto #3            | 5.        goto #3
6. <critical section>        | 6. <critical section>
7. a = 0                     | 7. b = 0
```

显然，如果程序的执行满足 Sequential Consistency，则可以得出结论，任意时刻，线
程 A/B 中只能有一个进入了临界区。下面会尝试证明（但其实并不重要）。

不考虑一方先执行到 #7 的情况，因为此时无冲突。假设线程 A 先进入临界区，先考虑
A3 不成立，则可以确定 `A3 > B1`，由于`A1 > A3`, `B1 > B2 > B3`，可以确认`A1 >
A2 > B2 > B3`，则此时 B3, B4 肯定成立，线程 B 进入不了临界区 B6；考虑 A4 不成
立，由于考虑的是 A 先进入临界区，则有 `A4 > B4`，由于 A4 不成立，则有 `B1 >
A3`保证 A3 成立，同时 `B2 > A2` 使 A4 不成立，则推出 `A1 | B2 > A2 > A4 > B4`
，可以确定 B3 B4 都是成立的，线程 B 无法进入临界区。同理，任意一方的 #3 或#4条
件不满足，先进入了临界区，则另一方肯定进不了临界区。

我们看到，如果系统提供了 Sequential Consistency，则我们可以通过一些（不容易想
到的）算法来达到线程间的同步，即人为地对多个线程间的相对执行顺序做约束。

## 只要看上去如此

事实上，机器真的会按上面所说的顺序执行代码吗？或者说，我们关心吗？

这也是理解并发编程的一个思维转变，我们其实不关心机器到底是如何执行的，我们只关
心最终的结果是否符合预期。我们需要和机器有个约定，这样当结果不符合预期时，我们
好分辩是代码写错了，还是机器执行错了。

这样能允许底层实现做一些优化，例如，如果线程之间没有任何的共享变量，机器可以
并行地执行这些线程，最终的结果仍然满足 Sequential Consistency。

## 小结

本章中，我们主要探讨了对于多线程的代码在运行时，什么才是合理的预期结果。

Sequential Consistency 是一个符合直觉的合理预期，它没有对线程间的相对顺序做任
何约束，不过我们依旧可以用一些算法来实现线程间的同步。

下一章中，我们会看到 Sequential Consistency 模型的约束太强了，编译器、CPU、内
存几乎没办法做任何优化，也因此目前没有任何 CPU、JVM 能实现 Sequential
Consistency。

但至少，我们知道了理想的世界应该是什么样的。

---

[^sequential-consistency]: https://en.wikipedia.org/wiki/Sequential_consistency
[^visibility]: [维基百科](https://en.wikipedia.org/wiki/Consistency_model#Sequential_consistency) 里说：Sequential Consistency 中一个写入一个变量不需要被“立即”看到。与我们文中说的“操作对下一个操作可见”似乎有冲突。我翻了很多资料，最终的理解是：“写入不需要被立即看到”的语境是排序前，如果有一写两读，`W(2)`, `R1, R2`，最终如果排序成 `R1, W(2), R2` 则代表了 `W(2)` 被延时感知了。但是排序后的操作仍旧必须对下一个操作可见。
