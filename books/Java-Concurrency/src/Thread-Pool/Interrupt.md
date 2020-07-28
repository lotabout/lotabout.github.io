# 线程的中断

当一个任务在线程里执行时，要如何停止这个任务/线程？中止一个线程有涉及诸多问题
，例如：

- 如果线程里加锁了，此时突然中止线程，谁来释放锁？
- 如果线程里打开了一个文件，中止线程，谁来关闭文件？
- 如果业务上要求做两个操作，只做了一个就中止了线程，如何保证逻辑正确？

单方面中止线程，不再执行线程的后续操作是十分危险的，也因此几乎没有任何编程语言
提供了单方面中止线程的能力[^kill-thread]。显然 Java 也没有提供直接中止线程的机
制，那么我们要怎么停止任务？

## 轮询与中断

轮询和中断这两个概念会不断出现在编程世界中（甚至是现实世界中）。

* 轮询指隔段时间检查一下。好比每分钟检查下烧的水开了没
* 中断指事件发生时通知。比如在写文章的时候，水壶响了，中断了当前的工作，去
  处理烧开的水。

这里的中断蕴含了“抢占”的要求，水烧开了就必须立马响应，不能等写完文章再处理，我
们上面说过为线程提供“中断”功能是很危险的，那如果只使用“轮询”，要怎么实现关闭呢
？其实很简单：

```java
public class Searcher {
  private volatile boolean cancelled; // ①

  public List<String> searchWith(String keyword) {
    List<String> results = new ArrayList<>();
    while (!cancelled) { // ②
      String nextCandidate = getNextCandidate();
      if (match(nextCandidate, keyword)) {
        results.add(nextCandidate);
      }
    }
    return results;
  }

  public void cancel() {
    this.cancelled = true; // ③
  }
}
```

在 ① 处设置一个取消的标志位，在任务执行期间（②）不断轮询标志位的值，如果设置了
则退出，而提供的取消方法（③）只需要设置标志位即可。需要注意的是标志位需要正确
同步，比如例子中使用了 `volatile`，也可以使用 `AtomicBoolean`。

轮询很多时候只是无奈之举，它并不理想：

- 响应不及时。如果业务逻辑运行时间长（如上例的 `match` 函数），则在一次
  `match` 结束前 `searchWith` 是不会检查 `cancelled` 的状态的。
- 额外开销。一方面检查标志位有开销（虽然不大），另一方面任务必须定期检查标志位
  ，不能阻塞。例如等待 socket 的数据，必须在等待时设置超时并定期检查标志位，即
  使没有数据也不能阻塞。
- 额外的编码。处理退出的逻辑需要嵌入业务逻辑中，影响代码整洁。

所以从编码体验上来说，通常希望直接调用阻塞（blocking）方法，并在想取消时，能够
用中断的方式唤醒线程。那么 Java 是如何解决这个问题的？

## Java 中的伪中断

在很多语言中，轮询是唯一安全的取消任务的方法，但 Java 提供了伪线程“中断”机制，
让我们能够唤醒很多阻塞方法（不是全部），方便地实现任务的取消。我们先来看看
`Thread` 提供的相关方法：

```java
public class Thread implements Runnable {
    public void interrupt() {...}
    public static boolean interrupted() {...}
    public boolean isInterrupted() {...}
}
```

Java 的每个线程中都会存储一个 `boolean` 类型的变量，来标识线程是否被中断。当我
们调用了一个线程的 `interrupt` 方法时，JVM 会首先将该标志位设置成 `true`，再唤
醒线程，JDK 的一些内置方法（如 `Thread.sleep`，`ArrayBlockingQueue.take`）被唤
醒后，会检查线程是否被中断，并做出对应的操作，如抛出 `InterruptedException`异
常。

`interrupted()` 与 `isInterrupted()` 函数被调用时都会返回线程“是否中断”的信息
，不同的是 `interrupted` 函数还会清除中断标志位。一般来说，如果库函数在检测到
中断时会抛出异常，那么抛出异常前一般会**清除**中断标志，反之不抛异常则需要保留
标志让上层感知中断的发生。

那么在我们的业务代码里感知到了中断，要如何做相应的处理呢？

## 如何处理中断

首先要意识到“中断”的含义是，有其它线程不希望我们的任务继续运行下去，那么从遵守
约定的角度出发，当我们检测到有中断发生时，应该尽快做好善后工作（如释放资源）并
结束运行，同时要把中断的消息告知上游调用方。

接收异常一般有两种方式，一种是调用的库函数抛出了 `InterruptedException`，另一
种是我们通过 `isInterrupted` 或 `interrupted` 检测到了有异常发生。同样的，在做
好善后工作后，我们也可以尽量以这两种方式向上游传递中断。例如可以直接传递异常：

```java
BlockingQueue<Task> queue;
...
public Task getNextTask() throws InterruptedException {  // ①
    return queue.take();
}
```

直接将 `queue.take` 的受检异常在 ① 处重新抛出。如果不想抛出异常，就要确保中断
标志被正确设置，要注意到当 JDK 库方法抛 `InterruptedException` 异常时，通常会
清除中断标志（内部调用了 `interrupted`）方法，因此我们可以再次调用
`interrupt()` 来重新设置中断标志：

```java
public Task getNextTask(BlockingQueue<Task> queue) {
  boolean interrupted = false;
  try {
    while (true) {
      try {
        return queue.take();
      } catch (InterruptedException ex) { // ①
        interrupted = true;
        // retry
      }
    }
  } finally {
    if (interrupted) {
      Thread.currentThread().interrupt();  // ②
    }
  }
}
```

上例中在 `queue.take()` 被中断时会抛出 `InterruptedException` 并清楚标志位，我
们在 ① 处捕获并重试。即使重试成功返回，我们也应该告知调用方有中断发生，因为这
意味着有其它线程希望我们尽快退出。于是我们在 ② 处调用 `interrupt` 方法重新设置
中断标志位，这样如果调用方正确检测中断标志位，就能正确响应中断。

## 不可中断的阻塞

上面我们看到，Java 中的中断其实是不是真的“中断”，本质上还是“轮询”，只是多数的
库阻塞函数，都遵守了检查中断标志的约定，能抛出异常提前返回。但并不是所有阻塞函
数都能被中断。

上面我们说过，调用 `interrupt` 方法时，底层的原理是设置中断标志，并唤醒线程，
这时一些库函数会检查中断标志，发现中断发生，清除中断标志，并抛出异常。具体来说
，有这么几类：

- 如果阻塞在 `Object.wait`、`Thread.join` 或 `Thread.sleep` 方法，则中断时会清
  除中断标志并抛出 `InterruptedException` 异常。
- 如果阻塞在 `InterruptibleChannel` 的 I/O 方法，则在中断时会设置中断标志并抛
  `ClosedByInterruptException` 异常。（多数标准 Channel 实现了该接口）
- 如果阻塞在 `Selector.select` 方法，中断时会设置中断标志并立即返回，效果类似
  于调用了 `wakeup` 方法。

不响应中断的阻塞方法有：

- Java.io 包中的同步 Socket I/O。如 `InputStream/OutputStream` 的 `read/write`
  方法不响应中断。想要中断只能关闭底层的 Socket，此时 `read/write` 方法抛出
  `SocketException`
- 获取锁。如 `synchronized` 和 JUC 中的 `Lock.lock` 都不响应中断，它们会被唤醒
  并尝试获取锁，失败后继续阻塞。有一个例外是 JUC 中的 `Lock.lockInterruptibly`
  会响应中断并抛出 `InterruptedException`，JUC 中响应中断的阻塞方法通常都是调
  用它来获取锁的。

## Future 实现取消

上面的讨论中，我们的视角是被中断方，也就是线程或者任务本身，那么从中断方来说，
我们应该调用 `interrupt` 方法吗？应该怎么调用？

这里的问题是我们想要结束是任务，但是我们的控制粒度是线程，但是线程有可能被用来
运行其它任务，例如，我们希望在当前任务运行超时时杀死任务，一个实现方式是：

```java
private static final ScheduledExecutorService cancelExec = ...

public static void timedRun(Runnable task, long timeout, TimeUnit unit) {
  final Thread taskThread = Thread.currentThread();
  cancelExec.schedule(() -> taskThread.interrupt(), timeout, unit); // ①
  task.run(); // ②
}
```

我们在 ① 中将取消的任务提交到定时的线程池 `cancelExec` 中，预期是如果超时了，②
中的任务还在运行，则 ① 的 `interrupt` 会中断当前线程。但是，如果 `interrupt`
调用时 `task.run` 已经结束了呢？线程中运行着的可能是调用方的其它任务，也可能是
线程池中提交的其它任务，不管哪种情形，此时调用 `interrupt` 都是不符合预期的。

还是那个问题，我们想停止的是任务，但是中断只能对线程使用。那么有办法针对任务进
行中断吗？如果使用的是线程池的话，答案是 `Future`：

```java
public interface Future<V> {
    boolean cancel(boolean mayInterruptIfRunning);
    boolean isCancelled();
}
```

* 如果任务未运行，调用了 `cancel` 方法后任务将不再会运行
* 如果任务在运行，则会根据参数 `mayInterruptIfRunning` 来决定是否中断任务线程
* 如果任务运行结束，或已被取消，则方法返回 `false`，无作用

所以上面的需求可以这么实现：

```java
public static void timedRun(Runnable task, long timeout, TimeUnit unit) {
  Future<?> task = taskExec.submit(task);
  try {
    task.get(timeout, unit); // ①
  } catch (TimeoutException e) {
    // do nothing, wait for finally
  } catch (ExecutionException e) {
    throw ...
  } finally {
    task.cancel(true); // ②
  }
}
```

① 中进行超时等待，并在 ② 中调用 `cancel`，且由于 `cancel` 是幂等的，即使正常返
回也不影响。

## 小结

与其它编程语言一样，Java 没有提供抢占式的中断线程的方法，它基于轮询的方式，为
常用的阻塞函数实现了“中断”的约定，一方面很多库函数会抛 `InterruptedException`
需要处理，很麻烦，另一方面它其实是一个相当灵活的中断机制。

中断的内部实现依赖了中断标志的设置与检查，业务代码在检测到中断的时应当尽快做好
善后工作并通知调用方发生了中断，通常是传递下层抛的异常，或通过调用
`Thread.interrupt` 方法重新设置中断标志。

当然还有一些阻塞方法不会响应中断，对于 IO 操作可以尝试关闭数据源，对于锁可以考
虑使用 `Lock.lockInterruptibly`，并没有通用的方法。

在使用中断时，我们发现调用 `interrupt` 来中断线程是相当危险的，如果任务是提交
到线程池里，通常通过 `Future.cancel` 来取消任务会更安全。

中断是对单个线程/任务的取消（Cancel），下节中我们来谈谈线程池及 JVM 的关闭（
Shutdown）操作。


## 参考

- 《Java 并发编程实战》第七章
- [Java线程源码解析之interrupt](https://www.jianshu.com/p/1492434f2810) 源码解
    析库函数阻塞方法如何响应中断
- [从AQS到futex(二): HotSpot的JavaThread和Parker ](http://kexianda.info/2017/08/16/并发系列-4-从AQS到futex-二-JVM的Thread和Parker/) JVM 底层的中断实现
- [jvm源码分析之interrupt()](https://www.javatt.com/p/48102) 同样是源码分析

---

[^kill-thread]: 当然 C 语言提供的操作系统 API，是有对应方法的，但从编程语言的
  支持上，没有见过，我熟悉的 Java/Python/Rust 都是没有的，包括 Go 语言也无法强
  制中止 goroutine。

