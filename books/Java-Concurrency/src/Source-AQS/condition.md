# 条件变量

如果有线程需要在某些“条件”满足后才接着后续操作，要如何实现？例如父线程需要等待
子线程结束后才继续执行（即 `join` 操作）。简单的做法是轮询一个变量，其它线程在
条件满足时置为 `true`，不过轮询的方法浪费 CPU 且不好控制。

条件变量（英文 Condition、Condition queues 或 Condition variable）提供了一种机
制，能让一个线程挂起（或称休眠、阻塞），直到某此条件满足为止。由于对状态的查询
修改通常是并发进行的，通常需要某种形式的锁来保护状态。也因此条件变量的核心特性
是在挂起线程时，会释放对应的锁；线程被唤醒返回前，一定要抢到对应的锁。

另外注意 ConditionObject 只能用在互斥锁中，如 `ReentrantLock` 和
`ReentrantReadWriteLock` 中的 `WriteLock`。

## 基本结构

条件变量本质上还是一个等待队列，AQS 中使用单向链表来实现，成员变量如下：

```java
public class ConditionObject implements Condition, java.io.Serializable {
    private static final long serialVersionUID = 1173984872572414699L;
    /** First node of condition queue. */
    private transient Node firstWaiter;
    /** Last node of condition queue. */
    private transient Node lastWaiter;
    // ...
}
```

`ConditionObject` 比较特殊的是它是 `AbstractQueuedSynchronizer` 的一个内部类，
且不是静态类，这意味着在 `ConditionObject` 内可以访问 AQS 的成员变量，侧面说明
条件变量是和“锁”绑定的。

通过 `firstWaiter` 和 `lastWaiter` 构建的队列称为等待队列，而对应 AQS 中抢锁用
的队列（用 `head` 和 `tail` 构建择业双向链表）称为同步队列。一个 Node 可以同时
加入等待队列和同步队列。

## 等待

线程等待某个变量之前，需要先抢到相应的锁，之后调用 `await` 挂起线程，`await`
需要将线程加入等待队列并释放锁，在 `await` 返回前需要再抢到锁。方法实现如下：

```java
public final void await() throws InterruptedException {
    if (Thread.interrupted())
        throw new InterruptedException(); // ① 检测到中断，抛异常
    Node node = addConditionWaiter();     // ② 将线程加入等待队列
    int savedState = fullyRelease(node);  // ③ 释放对应的锁，会返回释放前锁的状态
    int interruptMode = 0;
    while (!isOnSyncQueue(node)) {        // ④ 被意外唤醒的话需要再次挂起
        LockSupport.park(this);
        if ((interruptMode = checkInterruptWhileWaiting(node)) != 0)
            break;
    }

    // 接收到 signal，返回前需要再抢到锁
    if (acquireQueued(node, savedState) && interruptMode != THROW_IE)
        interruptMode = REINTERRUPT;
    if (node.nextWaiter != null) // clean up if cancelled
        unlinkCancelledWaiters();
    if (interruptMode != 0)
        reportInterruptAfterWait(interruptMode);
    }
}
```

`addConditionWaiter` 单纯地处理链表入队，由于约定 `await` 前已经抢到了互斥锁，
此处没有竞争：

```java
private Node addConditionWaiter() {
    Node t = lastWaiter;
    // If lastWaiter is cancelled, clean out.
    if (t != null && t.waitStatus != Node.CONDITION) {
        unlinkCancelledWaiters();
        t = lastWaiter;
    }

    // 加入链表末尾
    Node node = new Node(Thread.currentThread(), Node.CONDITION);
    if (t == null)
        firstWaiter = node;
    else
        t.nextWaiter = node;
    lastWaiter = node;
    return node;
}
```

## 唤醒

唤醒有两个方法：`signal` 和 `signalAll`，区别在于 `signalAll` 会唤醒等待队列中
的所有线程。`signal` 方法实现如下：

```java
public final void signal() {
    if (!isHeldExclusively()) // ① 必须保证持有锁
        throw new IllegalMonitorStateException();
    Node first = firstWaiter;
    if (first != null)
        doSignal(first);      // ② 唤醒队首的线程
}
```

而 `doSignal` 的实现如下，不断将队首的节点出队：

```java
private void doSignal(Node first) {
    do {
        if ( (firstWaiter = first.nextWaiter) == null) // ① 将 first 移出队列
            lastWaiter = null;
        first.nextWaiter = null;
    } while (!transferForSignal(first) &&              // ② 唤醒线程
             (first = firstWaiter) != null);
}
```

唤醒操作在 `transferForSignal` 中实现：

```java
final boolean transferForSignal(Node node) {
    // ① 节点状态不为 CONDITION，说明已经被取消了，不进行唤醒
    if (!compareAndSetWaitStatus(node, Node.CONDITION, 0))
        return false;

    Node p = enq(node); // ② 将节点加入到同步队列，返回之前的队尾节点
    int ws = p.waitStatus;
    // ③ 如果设置前驱节点的状态失败（如前驱已被取消）则直接唤醒线程
    // 唤醒后的线程会在 `await` 中执行 `acquireQueued` 直到抢锁成功
    if (ws > 0 || !compareAndSetWaitStatus(p, ws, Node.SIGNAL))
        LockSupport.unpark(node.thread);
    return true;
}
```

## 意外唤醒

`Condition` 的接口中声明，要假设 `await` 方法可能被意外唤醒，从 `await` 的视角
，被唤醒后需要确认自己是否在同步队列(sync queue)中，节点在同步队列才能在
`await` 中尝试抢锁并返回。实现如下：

```java
final boolean isOnSyncQueue(Node node) {
    // ① 进入同步队列时，waitStatus 为 0,且 prev 指向前驱节点
    // 之后节点可能被取消，状态变为 CANCELLED
    if (node.waitStatus == Node.CONDITION || node.prev == null)
        return false;
    if (node.next != null) // ② 存在后继节点，肯定在同步队列中
        return true;
    // ③ 兜底，从 tail 查找，确保 node 已经被加入同步队列
    return findNodeFromTail(node);
}
```

## 取消

发生中断或失败时，先把节点设置为 `CANCELLED` 状态，再从队列中移除。移除操作实
际分了两步，先将节点加入同步队列，这样保证 `await` 返回时能调用`acquireQueued`
抢锁，再在 `acquireQueued` 中检测中断，并在返回时调用`cancelAcquire` 将节点状
态改为 `CANCELLED`。

```java
final boolean transferAfterCancelledWait(Node node) {
    if (compareAndSetWaitStatus(node, Node.CONDITION, 0)) {
        enq(node);
        return true;
    }
    // 在 CAS 中输给了 signal，最终目标都是加入同步队列，自旋等待即可
    while (!isOnSyncQueue(node))
        Thread.yield();
    return false;
}
```

检测到中断时节点会被加入同步队列，而直到 `signal` 方法发生时节点才会被移出等
待队列，此时节点会存在于两个队列中。`unlinkCancelledWaiters` 方法能将状态为
`CANCELLED` 的节点移出等待队列，它要求调用前已经抢到锁：

```java
private void unlinkCancelledWaiters() {
    Node t = firstWaiter;
    Node trail = null;
    while (t != null) {
        Node next = t.nextWaiter;
        if (t.waitStatus != Node.CONDITION) {
            t.nextWaiter = null;
            if (trail == null)
                firstWaiter = next;
            else
                trail.nextWaiter = next;
            if (next == null)
                lastWaiter = trail;
        }
        else
            trail = t;
        t = next;
    }
}
```
