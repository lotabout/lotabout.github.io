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

# 线程与线程池

- [Amdahl 定律](Amdahl-Law/index.md)
- [线程的代价](Cost-of-Thread/index.md)
- [线程池](Thread-Pool/index.md)
    - [线程池相关概念](Thread-Pool/Concepts.md)
    - [线程池使用](Thread-Pool/Usage.md)
    - [线程的中断](Thread-Pool/Interrupt.md)
    - [如何优雅退出](Thread-Pool/Shutdown.md)

