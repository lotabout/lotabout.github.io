# ReentrantLock

`ReentrantLock` 中的 `Reentrant` 代表“可重入”，持有锁的线程在调用 `lock` 时依
旧可以成功，这样能防止持有锁的线程调用需要抢锁的函数导致的死锁问题。

`ReentrantLock` 通过内部的 `Sync` 类来完成锁的功能，`Sync` 类扩展了 `AQS`，重
用AQS 的各项同步功能。`ReentrantLock` 再扩展了 `Sync` 实现了 `FairSync` 和
`NonFairSync` 分别用于公平锁和非公平锁。

## Sync

`Sync` 在 `AQS` 的基础上增加了一些辅助方法，主要讲解 `nonfairTryAcquire`
与 `trtryRelease`。

### nonfairTryAcquire

实现了非公平的抢锁操作，同时处理了“可重入”的功能，代码如下：

```java
@ReservedStackAccess // ①
final boolean nonfairTryAcquire(int acquires) {
    final Thread current = Thread.currentThread();
    int c = getState();
    if (c == 0) { // 在 ReentrantLock 中，state = 0 代表锁没有被占用
        if (compareAndSetState(0, acquires)) { // 尝试抢锁
            // 抢锁成功，将拥有锁的线程标记为当前线程
            setExclusiveOwnerThread(current);
            return true;
        }
    }
    else if (current == getExclusiveOwnerThread()) { // ② 拥有锁的线程为当前线程时“可重入”
        int nextc = c + acquires; // 锁被使用的次数加 acquires
        if (nextc < 0) // overflow
            throw new Error("Maximum lock count exceeded");
        setState(nextc);
        return true;
    }
    return false;
}
```

其中 ① 中是 [JEP 270](https://openjdk.java.net/jeps/270) 新增的一个注解，为当
前方法分配新的栈空间，防止因为 `StackOverflowError` 导致方法提前退出，从而引发
锁状态不一致的问题。

“非公平”体现在只要检测到锁可用（`c == 0`）则尝试抢锁，而不管当前队列中是否有其
它等待锁的线程。

### tryRelease

`tryRelease` 用于释放当前锁，由于释放锁的前提是线程已经拥有锁，因此逻辑是单线
程操作，没有什么特殊的。

```java
protected final boolean tryRelease(int releases) {
    int c = getState() - releases;
    if (Thread.currentThread() != getExclusiveOwnerThread()) // ③
        throw new IllegalMonitorStateException(); // 确保当前线程拥有锁
    boolean free = false;
    if (c == 0) {
        // 由于可重入，释放锁不代表锁就可用了，还需要确保 c == 0
        free = true;
        setExclusiveOwnerThread(null); // ④
    }
    setState(c);
    return free;
}
```

这里延伸的一个有趣的点是保存持锁线程的变量的可见性问题，
`getExclusiveOwnerThread` 定义如下：

```java
public abstract class AbstractOwnableSynchronizer
    implements java.io.Serializable {

    private transient Thread exclusiveOwnerThread;

    protected final void setExclusiveOwnerThread(Thread thread) {
        exclusiveOwnerThread = thread;
    }

    protected final Thread getExclusiveOwnerThread() {
        return exclusiveOwnerThread;
    }

    // ...
}
```

可以看到 `exclusiveOwnerThread`（以下简称 `owner`）并没有用 `volatile` 定义，
那在 ② 和 ③ 中如何保证 `getExclusiveOwnerThread` 得到的就是最新的值？

事实上无法保证其它线程看到的就是最新的值，只是不影响正确性[^visibility]，注意到：

- 首先同一个线程是能看到最新的变量值的，这使得同线程中 ② 能正确进入。
- `tryRelease` 中 ④ 设置为 `null` 后有 `setState` 操作，因此能保证 `owner
  = null` 能被其它线程中的 `nonfairTryAcquire` 与 `tryRelease` 感知
- ② 中其它线程无论看到最新的 `null` 还是旧的 `owner` 值，条件都不成立，不影响
  正确性
- 同样 `tryRelease` 中的 ③ 无论看到最新的 `null` 还是旧的 `owner`，条件都
  不成立，不影响正确性

## 非公平锁: NonfairSync

非公平锁的组件都已经就位，只需要用 `nonfairTryAcquire` 实现 `tryAcquire` 即可
：

```java
static final class NonfairSync extends Sync {
    private static final long serialVersionUID = 7316153563782823691L;
    protected final boolean tryAcquire(int acquires) {
        return nonfairTryAcquire(acquires);
    }
}
```

## 公平锁: FairSync

公平体现在：新到的线程要抢锁时，需要先看看等待队列中是否有其它的线程，有则需要
排队：

```java
@ReservedStackAccess
protected final boolean tryAcquire(int acquires) {
    final Thread current = Thread.currentThread();
    int c = getState();
    if (c == 0) {
        if (!hasQueuedPredecessors() && // 唯一区别：检查当前是否有其它线程在等待
            compareAndSetState(0, acquires)) {
            setExclusiveOwnerThread(current);
            return true;
        }
    }
    else if (current == getExclusiveOwnerThread()) {
        int nextc = c + acquires;
        if (nextc < 0)
            throw new Error("Maximum lock count exceeded");
        setState(nextc);
        return true;
    }
    return false;
}
```

`hasQueuedPredecessors` 方法在 AQS 中实现，需要检查队列是否有其它等待的节点：

```java
public final boolean hasQueuedPredecessors() {
    Node h, s;
    if ((h = head) != null) {
        if ((s = h.next) == null || s.waitStatus > 0) {
            s = null; // next 为 null 时有可能是中间状态，从后往前遍历
            for (Node p = tail; p != h && p != null; p = p.prev) {
                if (p.waitStatus <= 0)
                    s = p;
            }
        }
        if (s != null && s.thread != Thread.currentThread())
            return true;
    }
    return false;
}
```

## 小结

JUC 中的锁都建立在 AQS 之上，在 AQS 之上，`ReentrantLock` 主要是通过
`exclusiveOwnerThread` 来实现可重入，通过 `state` 来实现独占锁，最后通过
`hasQueuedPredecessors` 来实现抢占公平。

我们也看到即使是简单的逻辑中也暗藏玄机：可见性，在看 JUC 代码时我们要保持警惕
，很多看着理所当然的代码实际上是精心优化的结果。

---

[^visibility]: 参考 SO 讨论：[How does the piggybacking of current thread variable in ReentrantLock.Sync work?](https://stackoverflow.com/questions/18732088/how-does-the-piggybacking-of-current-thread-variable-in-reentrantlock-sync-work)
