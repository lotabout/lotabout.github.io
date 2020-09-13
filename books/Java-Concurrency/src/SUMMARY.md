# Summary

[Java 并发知识](README.md)

# 理解线程安全

- [理想的并发世界](Ideal-World/index.md)
- [残酷的现实](Cruel-World/index.md)
- [Happens Before](Happens-Before/index.md)
- [常见线程安全问题](Thread-Safety-Examples/index.md)
    - [TOCTOU](Thread-Safety-Examples/TOCTOU.md)
    - [Double Checked Locking](Thread-Safety-Examples/Double-Checked-Locking.md)
    - [复合操作](Thread-Safety-Examples/Compound-Actions.md)
    - [小结](Thread-Safety-Examples/Summary.md)
- [良好的并发编程习惯](Best-Practice/index.md)
    - [封闭](Best-Practice/Confinement.md)
    - [不可变](Best-Practice/Immutability.md)
    - [利用线程安全类](Best-Practice/Threadsafe-Data-Types.md)
- [思考题](Thread-Safety-Home-Work/index.md)
    - [Spring Bean 初始化如何线程安全](Thread-Safety-Home-Work/Spring-Bean-Initialization.md)

# 线程与线程池

- [Amdahl 定律](Amdahl-Law/index.md)
- [线程的代价](Cost-of-Thread/index.md)
- [线程池](Thread-Pool/index.md)
    - [线程池相关概念](Thread-Pool/Concepts.md)
    - [预定义的线程池](Thread-Pool/Predefined.md)
    - [线程池使用](Thread-Pool/Usage.md)
    - [线程的中断](Thread-Pool/Interrupt.md)
    - [如何优雅退出](Thread-Pool/Shutdown.md)
- [线程调度]()

# 源码分析

- [Unsafe](Source-Unsafe/index.md)
- [Atomic](Source-Atomic/index.md)
    - [AtomicInteger](Source-Atomic/AtomicInteger.md)
    - [AtomicIntegerArray](Source-Atomic/AtomicIntegerArray.md)
    - [Striped64](Source-Atomic/Striped64.md)
    - [Adder](Source-Atomic/Adder.md)
    - [FieldUpdater](Source-Atomic/FieldUpdater.md)
    - [StampedReference](Source-Atomic/StampedReference.md)
- [AbstractQueuedSynchronizer](Source-AQS/AQS.md)
    - [互斥锁](Source-AQS/blocking-exclusive.md)
    - [共享锁](Source-AQS/blocking-shared.md)
    - [超时](Source-AQS/timeout.md)
    - [中断](Source-AQS/interrupt.md)
    - [取消](Source-AQS/cancellation.md)
    - [条件变量](Source-AQS/condition.md)
    - [小结](Source-AQS/Summary.md)
- [Lock](Source-Lock/Lock.md)
    - [ReentrantLock](Source-Lock/ReentrantLock.md)
    - [ReentrantReadWriteLock](Source-Lock/ReentrantReadWriteLock.md)
