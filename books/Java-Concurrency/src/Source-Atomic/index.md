# Atomic

JDK 1.8 的
[java.util.concurrent.atomic](https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/package-summary.html)
包下，定义了 17 个 Atomic（原子类），它们扩展了 `volatile` 的语义，保证了单个
变量的原子性、有序性与可见性。相比于 `synchronized`，原子类底层使用 CAS 实现了
lock-free 的算法，性能更高。

原子类的实现基本是基于 `Unsafe` 包里的更底层的能力，我们会以 `AtomicInteger`
为例，分析原子类的实现，同时分析其它原子类实现中的一些亮点。我们假设你已经了解
了 `Unsafe` 类中各方法的语义，不了解的也可以看本书前面的
[Unsafe](../Source-Unsafe/index.md) 一章。
