title: 'Deprecated. Java 并发（零）- 原子性'
toc: true
date: 2020-06-14 10:24:05
tags: [Java Concurrency]
categories: Project
---

Deprecated. 这篇文章写得太仓促了，急切地想表达原子性的重要性，但内容组织得不太
好，感觉文章比较乱，另一方面也不是一个好的系列开篇。不建议阅读。不过为了完整性
还是保留，有兴趣的也可以看看写得有多烂哈。

并发问题主要有三个根源：原子性、可见性及有序性。作为 Java 并发系列的开篇，我们
先来谈谈原子性，以及引发原子性问题的 Shared Mutable State(共享可变状态)。

## 多个线程多十倍烦恼

没有多线程就不存在并发问题[^concurrency-is-not-parallelism]，一旦有多个线程，
情况就复杂了起来。下例中我们起了两个线程，分别尝试对全局变量 `counter` 做`++`
操作，最终输出的结果会是多少呢？

[^concurrency-is-not-parallelism]: 并发的含义比较广，像协程这种一个线程处理多
  个任务的模式也会产生并发问题。并发的核心是**逻辑**时间上的重叠。Java 中我们
  简单地认为并发等于多线程。

```java
public class AtomicTest {
  private static int counter = 0;

  public static void main(String[] args) throws InterruptedException {
    Thread th1 = new Thread(AtomicTest::increase);
    Thread th2 = new Thread(AtomicTest::increase);
    th1.start();
    th2.start();
    th1.join();
    th2.join();
    System.out.println(counter);
  }

  public static void increase() {
    for (int i = 0; i < 10000; i++) {
      counter++;
    }
  }
}
```

我们预期它永远输出 `20000`，但实际运行可能输出任意值。仅仅两个线程就让简单的
`++` 操作不再正确。

当代码逻辑在多线程环境下运行结果不符合预期时，我们会称代码是不是“线程安全”的，
有时候也说“有并发问题”。上例中的 `increase` 函数就不是“线程安全”，也可以说是“
线程不安全的”。为了达到线程安全，我们需要原子操作。

## 原子是不可分割的

物理上“原子”是“不可分割的粒子”。编程中借用了这个概念，我们说一个操作是“原子的”
代表这个操作在执行的过程中是不可分割的。一个操作在真正执行时可能需要执行底层的
粒度更细的多个指令，如果这些指令的执行结果表现成一个整体，则认为操作是原子的。

例如上面的 `counter++` 操作是 Java 层面的，在执行时需要多个底层的 Java 字节码
指令来完成，可以理解成下面的伪代码：

```
reg0 = counter
reg0 = reg0 + 1
counter = reg0
```

当有两个线程同时执行 `counter++` 时，JVM 可能会交替执行两个线程的指令
[^not-ordering]，实际执行的顺序可能会是（序号代表实际执行顺序）：

[^not-ordering]: 虽然还没讲到，但这里不涉及“顺序性”问题。另外这里也可以隐含着
  并发问题本身不需要多线程参与，只要出现了交替执行（如协程）就有可能出问题。

```
------- Thread 1 ------+------ Thread 2 --------
1. reg0 = counter (0)  |
                       | 2. reg1 = counter (0)
3. reg0 = reg0 + 1 (1) |
                       | 4. reg1 = reg1 + 1; (1)
5. counter = reg0 (1)  |
                       | 6. counter = reg1 (1)
```

我们预期结果 `counter = 2`，但实际结果为 `counter = 1`，这是由于 `++` 操作的底
层指令在执行时并不是一个整体，而是被另一个线程的指令“分割”了。换言之，`++` 操
作不是“原子的”。

## 原子能力最终依赖于底层

实现原子性，意味着多个操作在执行时作为一个不可分割的整体。通常情况下，编程语言
会提供一些原子的能力让我们实现原子性，将多个操作作为整体执行。Java 中常见的有
`synchronized` 代表的锁、`ReentrantLock`代表的显示锁及 `AtomicInteger` 代表的
原子类等。

而 Java 类库和 JVM 在实现这些机制时，需要依赖操作系统提供的原子能力。如
`synchronized` 通常是利用操作系统的`mutex` 机制实现的，而操作系统的 `mutex` 实
现又依赖 CPU 提供的原子指令，如 x86 提供的
[CMPXCHG](https://c9x.me/x86/html/file_module_x86_id_41.html) 指令[^cas-later]
。

[^cas-later]: CMPXCHG 指令代表的是 CAS(compare and swap) 机制，AtomicInteger
  和 ReentrantLock 等的实现依赖了 CAS 机制，后续章节会介绍。

那么如果 CPU 不提供 CAS 的原子，JVM 有办法实现锁机制吗？答案是有，但依旧需要依
赖其它的原子能力。例如早期的一些互斥锁(Mutual exclusion)算法[^mutex-algo]不依
赖 CAS 指令，但要求对某个变量(寄存器/内存)的读写是原子的（通常情况下也是成立的
）。

[^mutex-algo]: https://en.wikipedia.org/wiki/Mutual_exclusion#Software_solutions

## 万恶之源：Shared Mutable State

前文提到了原子性是逻辑作为一个整体被执行，不被分割。那么什么情况下才可能出现被
分割呢？要有多线程。多线程就一定破坏原子性吗？只有在它们 **Shared Mutable
State**(共享可变状态) 的时候。

这个概念非常重要，也是后续文章中会经常出现的概念。一共三个词：

* State(状态)，存储下来的都是“状态”，比如存在寄存器、内存的变量；存在文件、数
    据库的内容等。
* Shared(共享)，有多个参与者，“同时”访问某个状态。如多个线程访问同一个变量，
    多个进程访问同一个数据库等。
* Mutable(可变)，访问分为“读”和“写”，可变指的是写。至少有一个参与者想要写入新
    的状态。

只有同时满足 "Shared" 和 "Mutable" 才造成并发问题。如果没有共享，也就不存在操
作被分割的问题，原子性是成立的。如果“不可变”，则虽然实际操作可能被分割，但由于
操作不改变状态，操作的结果最终“看起来”[^fake-atomicity]也是原子性的。

[^fake-atomicity]: 其实我们并不关心是不是真的作为一个整体执行，我们关心的是执
  行的结果是不是等价于作为整体执行，换句话说，是不是符合原子性的预期。

在一些语言中，为了保证线程安全，会尝试打破其中一个。例如 Clojure 中所有的对象
都是 Immutable（不可变）的；Java 中其实也鼓励多用不可变的对象；Rust 中则是尝试
阻止 Share，一个对象只能两种情况：要么只有一个引用，它可以是可变的，要么可以有
多个引用，但所有引用都是不可变的。

Java 中的“锁”也可以认为是阻止 Share 的机制。

## 小结

本章探讨了原子性，原子性指的是操作的执行作为一个整体不可分割，它（通常）是我们
编码时预期的行为。在多线程的环境下，代码的执行通常不具备原子性，从而导致了并发
问题。

编程语言层面提供了一些机制来让我们实现原子性，从而避免并发问题，达到线程安全。
这些机制的实现又依赖更底层提供的原子能力。

而从编码的角度，并发问题的产生，是由于代码里有共享的可变的状态，为了达到线程安
全，我们需要合理地使用原子机制（如锁）来阻止状态的共享。

## 参考

- "Java Concurrency in Practice"，中译《Java 并发编程实战》，学习并发一定要看的书
- [还在疑惑并发和并行？](https://laike9m.com/blog/huan-zai-yi-huo-bing-fa-he-bing-xing,61/) 并发不等于并行，本文可以作为了解的开始，讨论也挺深
- [A Gentle Introduction to Java Concurrency](https://nofluffjuststuff.com/magazine/2016/07/a_gentle_introduction_to_java_concurrency) Java 并发的概念的细致讲解，包括原子性、可见性、顺序等
- [Operating Systems: Three Easy Pieces](http://pages.cs.wisc.edu/~remzi/OSTEP/threads-sema.pdf) 第 31 章，操作系统关于信号量(Semaphore)的实现
- [Atomic vs. Non-Atomic Operations](https://preshing.com/20130618/atomic-vs-non-atomic-operations/) 讲解了一些 CPU 读写指令的原子性
