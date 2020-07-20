# 良好并发编程习惯

最好的治疗是预防。本章会结合《Java 并发编程实战》第三、四章的内容，以及 [MIT
6.005 - Reading 20: Thread
Safety](https://web.mit.edu/6.005/www/fa15/classes/20-thread-safety/) 一文，讲
讲一些“理论”上的预防并发问题的编程习惯。

我们前面说过，线程安全问题发生的前提是：线程间存在着共享的可变的状态(Shared
Mutable State)，因为这种情况下，程序的正确性依赖了底层操作的某些特定顺序。也因
此，有几种常见的保证线程安全的方式：

- 封闭（Confinement），简单地说，就是不要在线程间共享状态
- 不可变（Immutability），可以共享，但是共享的变量“不可变”[^immutable]
- 线程安全类（Threadsafe Data Types），用已有的线程安全类来封装共享的状态，不需要自己实现同步
- 同步（Synchronization），万不得以必须自己实现共享可变状态，需要通过同步保证运行顺序

---

[^immutable]: “不可变”不单纯指“不修改”，因为还会有可见性问题，后面我们会详细说明
