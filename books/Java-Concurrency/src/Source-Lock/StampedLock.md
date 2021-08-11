# StampedLock

`ReentrantReadWriteLock` 在大量读锁和少量写锁的情形下，容易造成写锁饥饿。
`StampedLock` 是 JDK 1.8 增加的实现，它不依赖 AQS，极大提高了读写锁的性能，但
是它不支持“重入”，概念层面也比较难理解，还有一些顺序性相关的问题。因此设计上是
希望在库里使用，而非业务代码中。

## 使用

`StampedLock` 有三种锁模式：

- 写锁
    - `writeLock()`, `tryWriteLock()` 与 `tryWriteLock(long time, TimeUnit unit)`
    - 这些方法都会返回一个 long 型变量，代表锁的当前版本和锁模式
- 读锁
    - `readLock()`, `tryReadLock()` 与 `tryReadLock(long time, TimeUnit unit)`
- 乐观读
    - `tryOptimisticRead()` 与 `validate(long stamp)`
    - `tryOptimisticRead` 乐观读取，已有写锁返回 0, 否则返回一个版本号
    - `validate` 用于检测版本号是否合法，如果上次读取后没有加过写锁则返回 `true`
    - 该模式是 `StampedLock` 与 `ReentrantReadWriteLock` 的主要区别

它还支持锁的升级和降级：`tryConvertToWriteLock(long stamp)`、
`tryConvertToReadLock(long stamp)` 和 `tryConvertToOptimisticRead(long stamp)`


## 细节

## 锁模式

`StampedLock` 使用了 `long` 型表示版本号(stamp)和锁状态，二者的编码模式有一定区别，对
于 stamp，会计算 `stamp & 0xFF`，然后有如下状态：

- `1000_0000`(`WBIT`)代表处于写锁模式
- `0000_0000` 为 0 时代表处于乐观锁模式
- `0111_1110`(`RFULL`)代表持有读锁的线程数已满(126)
- 其它情况也是读锁模式

而对于锁状态(state)，也会先计算 `state & 0xFF`，再看状态：

- `0` 代表锁空闲
- `0111_1111`(`RBITS`) 是临时状态，代表读锁数量将要溢出


---

[^performance]: 性能测试： [Java 8 StampedLocks vs. ReadWriteLocks and Synchronized](https://blog.overops.com/java-8-stampedlocks-vs-readwritelocks-and-synchronized/)
