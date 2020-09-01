# 中断

前文说过，Java 处理中断的方式是先唤醒进程，再由线程自己通过
`Thread.interrupted()` 检查中断状态并提前退出（不熟悉的同学可以复习下
[线程的中断](../Thread-Pool/Interrupt.md)）。抢锁的方法也实现了约定的中断处理
逻辑。

## 接口定义

AQS 中的抢锁方法有两类处理中断的方式：

- 直接返回中断状态
    - `acquireQueued`
    - `doAcquireShared`
- 检测到中断时抛 `InterruptedException`
    - `doAcquireInterruptibly`
    - `doAcquireSharedInterruptibly`
    - `doAcquireNanos`
    - `doAcquireSharedNanos`

## 实现

返回中断状态和抛异常的实现几乎没有区别，如 `acquireQueued` 对异常的处理如下：

```java
final boolean acquireQueued(final Node node, int arg) {
    // ..
        boolean interrupted = false;
        for (;;) {
            final Node p = node.predecessor();
            if (p == head && tryAcquire(arg)) {
                // ...
                return interrupted;
            }
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                interrupted = true;
        }
    // ...
}
```

核心的逻辑是通过 `parkAndCheckInterrupt` 检查状态并记录在 `interrupted`变量中
返回，而 `doAcquireInterruptibly` 类似，只是检测到中断时不是记录状态，而是直接
抛异常：

```java
private void doAcquireInterruptibly(int arg)
    throws InterruptedException {
    // ...
        for (;;) {
            // ...
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                throw new InterruptedException();
        }
    // ...
}
```

其中的 `parkAndCheckInterrupt` 方法也只是调用了 `Thread.interrupted` 来检测中
断状态：

```java
private final boolean parkAndCheckInterrupt() {
    LockSupport.park(this);
    return Thread.interrupted();
}
```

## 如何取消

当抢锁失败时，会调用 `cancelAcquire` 来取消当前节点，如下：

```java
final boolean acquireQueued(final Node node, int arg) {
    boolean failed = true;
    try {
        // ...
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}
```

取消的逻辑比较复杂，我们下节单独介绍。
