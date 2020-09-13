# ReentrantReadWriteLock

`ReentrantReadWriteLock` 与 `ReentrantLock` 一样都是可重入锁，不同的是
`ReentrantReadWriteLock` 其实是两个锁：读锁是共享锁，写锁是独占锁，也因此常在
读的吞吐高于写时使用。与 `ReentrantLock` 类似，`ReentrantReadWriteLock` 也是先
实现了自己的 `Sync`，再衍生出公平锁与非公平锁。

## Sync

我们知道 AQS 的 `state` 是 `int` 型，`ReentrantReadWriteLock` 中的 `Sync` 用低
位 16 位表示写锁，高位 16 位表示读锁，代码中定义了一些掩码用于快速计算：

```java
abstract static class Sync extends AbstractQueuedSynchronizer {
    private static final long serialVersionUID = 6317671515068378041L;

    static final int SHARED_SHIFT   = 16;
    static final int SHARED_UNIT    = (1 << SHARED_SHIFT);
    static final int MAX_COUNT      = (1 << SHARED_SHIFT) - 1;
    static final int EXCLUSIVE_MASK = (1 << SHARED_SHIFT) - 1;

    // 持有读锁的数量，取高位 16 位
    static int sharedCount(int c)    { return c >>> SHARED_SHIFT; }
    // 持有写锁的数量，取低位 16 位
    static int exclusiveCount(int c) { return c & EXCLUSIVE_MASK; }

    // ...
}
```

同时由于有多个线程可获取读锁，且每个线程都是可重入的，因此需要为每个线程记录获
取读锁的个数，如下：

```java
abstract static class Sync extends AbstractQueuedSynchronizer {
    // ...

    // 用于记录哪个线程占了多少个读锁
    static final class HoldCounter {
        int count;          // initially 0
        // Use id, not reference, to avoid garbage retention
        final long tid = LockSupport.getThreadId(Thread.currentThread());
    }

    static final class ThreadLocalHoldCounter
        extends ThreadLocal<HoldCounter> {
        public HoldCounter initialValue() {
            return new HoldCounter();
        }
    }

    // 使用 ThreadLocal 来分线程记录持有多少读锁
    private transient ThreadLocalHoldCounter readHolds;
    // 优化：保存上一个获取读锁的线程的 HoldCounter
    private transient HoldCounter cachedHoldCounter;
    // ...
}
```

### tryAcquire

`tryAcquire` 用于获取写锁，源码的注释比较清晰：

```java
@ReservedStackAccess
protected final boolean tryAcquire(int acquires) {

     // 流程如下：
     // 1. 如果读锁不为 0 或写锁不为零且持锁线程不是当前线程，失败
     // 2. 如果计数器饱和了，失败
     // 3. 否则通过 writerShouldBlock 检测公平性，看情况获取锁

    Thread current = Thread.currentThread();
    int c = getState();
    int w = exclusiveCount(c);
    if (c != 0) {
        // 说明有线程持有锁（读锁还是写锁不确定）

        // 注意如果 c != 0 且 w == 0，则读锁 != 0
        if (w == 0 || current != getExclusiveOwnerThread())
            return false;

        // 计数器饱和
        if (w + exclusiveCount(acquires) > MAX_COUNT)
            throw new Error("Maximum lock count exceeded");

        // 可重入抢锁
        setState(c + acquires);
        return true;
    }
    if (writerShouldBlock() ||        // 公平性检测
        !compareAndSetState(c, c + acquires))
        return false;
    setExclusiveOwnerThread(current); // 和 ReentrantLock 一样，设置持锁线程
    return true;
}
```

### tryRelease

`tryRelease` 用来释放写锁，与 `ReentrantLock` 中的释放锁操作几乎一样：

```java
@ReservedStackAccess
protected final boolean tryRelease(int releases) {
    if (!isHeldExclusively())
        throw new IllegalMonitorStateException();
    int nextc = getState() - releases;
    boolean free = exclusiveCount(nextc) == 0;
    if (free)
        setExclusiveOwnerThread(null);
    setState(nextc);
    return free;
}
```

### tryAcquireShared

`tryAcquireShared` 用于获取读锁，可以获取读锁的条件有：

1. 没有线程持有锁
2. 当前线程或其它线程持有读锁
3. 当前线程持有写锁

```java
@ReservedStackAccess
protected final int tryAcquireShared(int unused) {
    // 流程如下：
    // 1. 如果有其它线程持有写锁，失败
    // 2. 否则检测公平性并尝试抢锁
    // 3. 抢锁失败，使用 fullTryAcquireShared 更全面地尝试

    Thread current = Thread.currentThread();
    int c = getState();
    if (exclusiveCount(c) != 0 &&                  // 有线程持有写锁
        getExclusiveOwnerThread() != current)      // 且不是当前线程
        return -1;
    int r = sharedCount(c);
    if (!readerShouldBlock() &&                    // 公平性检测
        r < MAX_COUNT &&
        compareAndSetState(c, c + SHARED_UNIT)) {  // 尝试抢锁
        if (r == 0) { // 当前线程是第一个抢锁的线程，做记录
            firstReader = current;
            firstReaderHoldCount = 1;
        } else if (firstReader == current) {
            firstReaderHoldCount++;
        } else { // 更新线程读锁数量，过程中优先使用缓存
            HoldCounter rh = cachedHoldCounter;
            if (rh == null ||
                rh.tid != LockSupport.getThreadId(current))
                cachedHoldCounter = rh = readHolds.get();
            else if (rh.count == 0)
                readHolds.set(rh);
            rh.count++;
        }
        return 1;
    }
    // 抢锁失败，使用完整版抢锁逻辑
    return fullTryAcquireShared(current);
}
```

### fullTryAcquireShared

`fullTryAcquireShared` 看起来很冗长，它与 `tryAcquireShared` 的逻辑几乎没啥区
别，只是一个自旋版本。

```java
final int fullTryAcquireShared(Thread current) {
    HoldCounter rh = null;
    for (;;) {
        int c = getState();

        // 先检测是否有资格抢锁
        if (exclusiveCount(c) != 0) {
            if (getExclusiveOwnerThread() != current)
                return -1;
            // 否则当前线程持有写锁，有资格抢写锁
        } else if (readerShouldBlock()) { // 公平性原因要求当前线程阻塞，说明当前线程需要进入队列等待
            // 只有当前抢锁操作为可重入操作，才认为抢锁失败
            // 换句话说，可重入优先于公平性，否则容易造成死锁
            if (firstReader == current) {
                // assert firstReaderHoldCount > 0;
            } else {
                if (rh == null) {
                    rh = cachedHoldCounter;
                    if (rh == null ||
                        rh.tid != LockSupport.getThreadId(current)) {
                        rh = readHolds.get();
                        if (rh.count == 0)
                            readHolds.remove();
                    }
                }
                if (rh.count == 0)
                    return -1;
            }
        }
        if (sharedCount(c) == MAX_COUNT) // 计数器饱和
            throw new Error("Maximum lock count exceeded");
        if (compareAndSetState(c, c + SHARED_UNIT)) { // 抢锁成功则更新状态
            if (sharedCount(c) == 0) {
                firstReader = current;
                firstReaderHoldCount = 1;
            } else if (firstReader == current) {
                firstReaderHoldCount++;
            } else {
                if (rh == null)
                    rh = cachedHoldCounter;
                if (rh == null ||
                    rh.tid != LockSupport.getThreadId(current))
                    rh = readHolds.get();
                else if (rh.count == 0)
                    readHolds.set(rh);
                rh.count++;
                cachedHoldCounter = rh; // cache for release
            }
            return 1;
        }
    }
}
```

### tryReleaseShared

`tryReleaseShared` 用于释放读锁，主要功能是修改线程的读锁计数，完成后需要自旋
调用 CAS 完成对 `state` 的修改：

```java
@ReservedStackAccess
protected final boolean tryReleaseShared(int unused) {
    Thread current = Thread.currentThread();
    if (firstReader == current) {
        // assert firstReaderHoldCount > 0;
        if (firstReaderHoldCount == 1)
            firstReader = null;
        else
            firstReaderHoldCount--;
    } else {
        HoldCounter rh = cachedHoldCounter;
        if (rh == null ||
            rh.tid != LockSupport.getThreadId(current))
            rh = readHolds.get();
        int count = rh.count;
        if (count <= 1) {
            readHolds.remove();
            if (count <= 0) // 释放了过多的锁，属于代码逻辑错误
                throw unmatchedUnlockException();
        }
        --rh.count;
    }
    for (;;) {
        int c = getState();
        int nextc = c - SHARED_UNIT;
        if (compareAndSetState(c, nextc))
            // Releasing the read lock has no effect on readers,
            // but it may allow waiting writers to proceed if
            // both read and write locks are now free.
            return nextc == 0;
    }
}
```

## 非公平锁：NonfairSync

对于非公平锁来说，写锁永远都不需要阻塞（因为不公平，不需要等待）。理论上读锁也
一样，但是为了防止大最线程抢读锁，导致写锁饥饿死锁，于是使用保护机制：如果等待
队列的队首在等待写锁，则当前抢读锁的线程选择退让。实现如下：

```java
static final class NonfairSync extends Sync {
    final boolean writerShouldBlock() {
        return false; // writers can always barge
    }
    final boolean readerShouldBlock() {
        return apparentlyFirstQueuedIsExclusive();
    }
}
```

`apparentlyFirstQueuedIsExclusive` 实现如下：

```java
final boolean apparentlyFirstQueuedIsExclusive() {
    Node h, s;
    return (h = head) != null &&
        (s = h.next)  != null &&
        !s.isShared()         &&
        s.thread != null;
}
```

## 公平锁：FairSync

抢锁时需要先检查是否有其它线程等待，与 `ReentrantLock` 一样使用
`hasQueuedPredecessors` 判断：

```java
static final class FairSync extends Sync {
    final boolean writerShouldBlock() {
        return hasQueuedPredecessors();
    }
    final boolean readerShouldBlock() {
        return hasQueuedPredecessors();
    }
}
```

## 小结

`ReentrantReadWriteLock` 是 JUC 中最复杂的锁实现，好在有 AQS 的帮助，整体的逻
辑不复杂。

代码中的亮点有：

- 使用 int 的高低位分别表示读写锁，变向帮助了锁降级功能的实现
- 一些性能的优化，如 `firstReader`, `cachedHoldCounter`，低并发度时能减少很多
  访问次数
- 避免写锁饿死，采取的启发式的“公平”逻辑
