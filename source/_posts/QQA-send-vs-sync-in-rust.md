title: 'QQA: Rust 中 Send 与 Sync 有什么区别'
date: 2018-04-01 08:32:37
tags: [QQA, rust]
categories: [QQA]
toc:
---

`Send` 与 `Sync` 是两个十分相近的 trait，它们是一起保证了 Rust 的线程安全，它
们又有什么异同点呢？

（Quick Question and Answer 系列旨在对小问题做简短解答）

<!--more-->

- `Send` 表示数据能安全地被 `move` 到另一个线程
- `Sync` 表示数据能在多个线程中被同时安全地访问

这里“安全”指不会发生数据的竞争 (race condition)。

## Send 代表没有数据共享

数据如果被 move 到另一个线程里，它还安全吗？能正常使用吗？如果可以，则说它是
`Send`。

反例： [Rc](https://doc.rust-lang.org/std/rc/struct.Rc.html)。我们知道 `Rc` 中
保存了一个 reference count，记录有多少变量引用了当前的数据，当 reference count
归 0 时才释放(drop)数据本身。现在如果我们把一个 `Rc` move 到另一个线程里，尽管
是 move，`Rc` 的实现还是决定了不同线程里的 `Rc` 会指向同一个 reference count，
这意味着不同的线程可能同时修改 reference count，而 `Rc` 内部并没有实现同步机制
，因此是不安全的。

这里有一个推论：一个结构(Struct)如果不满足 `Send`，是不是意味着它的某个内部数
据不满足`Sync` 呢？参考 `Rc` 的例子，就是内部的 reference count 不满足 Sync 。
只是目前没有找到相关的证明。

## Sync 代表同步

如果多个线程同时访问某个数据，会不会产生竞争？如果还是安全的，我们就能说它是
`Sync`。

反例：[RefCell](https://doc.rust-lang.org/std/cell/struct.RefCell.html)。它满
足 `Send`，但不满足 `Sync`。 `RefCell` 不会与本线程的其它引用共享数据，所以被
move 到其它线程是安全的。但如果有多个线程同时拥有 RefCell 的引用，并同时获取它
的可变引用(mutable reference)并尝试修改它，则会产生竞争，亦即没有满足原子性。

## marker trait

最后要说的是，`Send` 和 `Sync` 都属于 [marker
trait](https://doc.rust-lang.org/std/marker/index.html)，marker trait 的特点是
不包含任何方法，所以为某个数据结构实现 marker trait 相当于人为告诉编译器，我实
现的数据结构符合你的要求（如满足 `Send`, `Sync`），编译期间就放心吧。换句话说
，编译器并无法检查你的实现到底是不是满足 `Send` 或 `Sync`，只能选择相信程序员
的声明，如果程序员的实现有问题，只能程序员自己背锅了。

## 参考
- [线程安全](https://zhuanlan.zhihu.com/p/24142191) Rust 线程安全的讲解
- [Shared State Concurrency](https://doc.rust-lang.org/book/second-edition/ch16-03-shared-state.html) 详细
    说明了 Rc 为什么不满足 Send
- [How Rust Achieves Thread Safety](https://manishearth.github.io/blog/2015/05/30/how-rust-achieves-thread-safety/) 对 Rust 中的 Send & Sync 机制有比较详细的说明
