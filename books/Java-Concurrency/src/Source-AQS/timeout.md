# 超时

互斥锁和共享锁分别有自己的超时的方法：`tryAcquireNanos` 和
`tryAcquireSharedNanos`。相比于阻塞方法，超时方法接受新的参数：超时时间，在该
时间内如果没有抢到锁，则返回 `false` 代表失败。方法的定义如下：

```java
public final boolean tryAcquireNanos(int arg, long nanosTimeout) {...}
public final boolean tryAcquireSharedNanos(int arg, long nanosTimeout) {...}
```

支持超时的方法主要有两点不同：

- 每次被唤醒时都需要判断是否已经超时
- 在休眠时也需要通过 `LockSupport.parkNanos` 定好闹钟

这里以 `doAcquireNanos` 方法看看它和 `acquireQueued` 的异同

```java
private boolean doAcquireNanos(int arg, long nanosTimeout)
        throws InterruptedException {
    if (nanosTimeout <= 0L)
        return false;
    final long deadline = System.nanoTime() + nanosTimeout;
    final Node node = addWaiter(Node.EXCLUSIVE);
    boolean failed = true;
    try {
        for (;;) {
            final Node p = node.predecessor();
            if (p == head && tryAcquire(arg)) {
                setHead(node);
                p.next = null; // help GC
                failed = false;
                return true;
            }
            nanosTimeout = deadline - System.nanoTime();
            if (nanosTimeout <= 0L) // 休眠之前先看是否超时
                return false;
            if (shouldParkAfterFailedAcquire(p, node) &&
                // 如果超时时间短，则不休眠，因为自旋效率更高
                nanosTimeout > spinForTimeoutThreshold)
                // 休眠时要定敲钟，在 nanosTimeout 后被唤醒
                LockSupport.parkNanos(this, nanosTimeout);
            if (Thread.interrupted())
                throw new InterruptedException();
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}
```

因此我们看到，对超时的支持主要依赖了 `LockSupport.parkNanos` 的支持，它允许我
们在休眠时指定时间，过了这个时间后线程会被唤醒。这样能保证 `doAcquireNanos` 在
超时时间后可以被唤醒，检测锁状态并退出，而不是无限制地阻塞。
