# 如何优雅退出

上节中我们讨论了如何中断一个线程，这节我们讨论如何关闭 JVM 进程。

## 如何关闭 JVM

关闭分为正常关闭和强制关闭。

触发正常关闭的方式有：当最后一个（非守护）线程退出结束时；调用了 `System.exit`
或 `Runtime.exit` 时；以及接收到操作系统的退出信号时（如收到
`SIGINT` 信号，或按了 `Ctrl-C` 发送了 `SIGTERM` 信号等）。

强制关闭可以通过调用 `Runtime.halt` 方法或通过操作系统发送 `SIGKILL` 信号（如
通过 `kill -9 <pid>`）实现。

正常关闭与强制关闭的区别在于，正常关闭时，JVM 会调用 Shutdown Hook（关闭钩子）
，等到所有 hook 执行结束后再退出 JVM。因此在正常关闭的情况下，我们可以通过
Shutdown hook 机制在退出前做一些清理（如清理产生的临时文件，打印所有未打印的日
志等），来实现“优雅退出”。

## Shutdown Hook

Shutdown hook 需要通过 `Runtime.addShutdownHook(Thread hook)` 注册，我们把传入
的线程称作 hook，`addShutdownHook` 要求 hook 线程尚未启动，且一个线程只能注册
一次。Hook 的执行有两种情况：

* 正常情况下，需要等所有非守护线程退出，才开始执行
* 当 JVM 接到关闭信号（如 `SIGINT`）时执行，此时与非守护线程并发执行。

所有的 hook 线程在 JVM 正常退出时被一起启动，执行顺序没有保证。当所有 hook 线
程结束时，JVM 将停止运行[^finalizer]，停止时并**不会**关闭或中断任何仍然在运行
的应用程序线程。

由于 hook 线程在运行时仍然是并发的环境，要保证其中的逻辑是线程安全的。同时，
hook 线程不应该对程序是如何结束的有任何假设（如某个服务是否已经关闭），因为任
何情况都有可能发生。最后，和线程中断一样，hook 线程应该尽快退出，因为调用方预
期 JVM 尽快结束。

通常会在 hook 线程中做一些资源清理的工作，来达到“优雅退出”的目标。例如 Spring
框架中，每个 `ApplicationContext` 需要实现 `registerShutdownHook` 方法来注册清
理的逻辑，例如 `AbstractApplicationContext` 的实现如下，调用 `doClose` 来清理
相关资源：

```java
public void registerShutdownHook() {
  if (this.shutdownHook == null) {
    // No shutdown hook registered yet.
    this.shutdownHook = new Thread(SHUTDOWN_HOOK_THREAD_NAME) {
      @Override
      public void run() {
        synchronized (startupShutdownMonitor) {
          doClose();
        }
      }
    };
    Runtime.getRuntime().addShutdownHook(this.shutdownHook);
  }
}
```

建议用一个 hook 线程来做所有的关闭操作（如上面的代码），这样将所有的关闭操作串
行执行，可以减少很多由并发带来的竞争和死锁问题，例如可以防止关闭某个服务时依赖
了另一个服务，而它又被另一个 hook 线程关闭了而造成的死锁。

## 守护线程

守护线程（Daemon Thread）是在后台运行的低优先级的线程，当 JVM 正常退出时，会等
待所有**非**守护线程退出后才退出，而不管守护线程的死活。

可以调用 `Thread.isDaemon` 来判断线程是否为守护线程，可以在线程启动前调用
`Thread.setDaemon` 来设置是否为守护线程。在一个线程中创建了另一个线程，是否守
护的状态会被继承。JVM 启动时只有主线程是普通线程，其它都是守护线程，于是可以推
论，默认情况下，主线程创建的所有线程都是普通线程。

一般不建议将线程设置成守护线程，因为守护线程的潜在约定是其它线程结束后，它可以
随时被中止。而很少有线程能达到这个条件，例如线程中如果包含 I/O 操作，突然被中
止而不做清理可能导致数据没有被正确写入，临时文件没有被清理等。还记得上节中提到
语言层面不提供抢占式中断的原因吗？也同样是不建议使用守护线程的原因。

一些没有外部依赖的清理工作可以设置成守护线程，如系统 GC 线程，或是一些清除内
内存缓存的线程。

## 关闭线程池

在系统退出前，需要手工关闭线程池，否则诸如 `newFixedThreadPool` 线程池会始终保
持 N 个在运行的线程，从而阻止 JVM 正常退出。

我们知道 `ExecutorService` 有两个关闭方法，`shutdown` 会拒绝新的请求，并等待所
有（在运行的和排队中的）任务退出；`shutdownNow` 会中断正在运行的任务，并返回所
有还未运行的任务。当然，如果有任务不能正确响应中断（如在获取锁），那么没有通用
的手段能强制它们退出。

`shutdownNow` 的局限在于没有通用方法处理在运行中的任务，需要从业务角度做处理。
例如接收到中断时记录被取消的任务[^ref-tracking-executor]：

```java
static class TrackingExecutor extends AbstractExecutorService {
  private final ExecutorService inner扩展
  private final Set<Runnable> cancelledTasks = Collections.synchronizedSet(new HashSet<>());

  //...

  public List<Runnable> getCancelledTask() {
      if (!isTerminated()) throw new IllegalStateException(...);
      return new ArrayList<>(cancelledTasks);
  }

  @Override
  public void execute(Runnable command) {
      inner.execute(() -> {
        try {
          command.run();
        } finally {
          if (isShutdown() && Thread.currentThread().isInterrupted())
            cancelledTasks.add(command);
        }
      });

  }
}
```

这种方法可能有“误报”，有些任务可能运行结束，但在设置状态前，线程池被关闭了，于
是也可能被包含在被取消任务中。当然，要如何处理被取消的任务需要根据业务情况具体
分析，例如爬虫任务可能可以无脑重试（幂等），下定单任务可能要额外判断是否可重试
了。

对于无法响应中断的任务，实现时需要准备一些额外中止手段，如任务执行逻辑轮
询某个退出标志。

## 处理异常退出的线程

有些任务可能是同构的，如多个线程消费消息，处理逻辑相同；有些任务可能是异构的，
如发送消息和接收消息就是不同的逻辑。

如果由于某些原因，某个线程异常退出了（如调用下游某个 API 时抛异常，且没有被捕
获），JVM 会照常执行。如果退出的同构任务中的一个，风险还可控，如果退出的是某个
异构任务，程序的整体逻辑就会有问题，如唯一的发送消息的任务异常退出，程序的正确
性就有问题）。

最重要的解法还是要求程序正确编码。作为通用性的事后处理，一般至少要记日志，如果
严重的还要对接一些监控告警的系统。从语言层面，提供了线程异常退出的通知机制，供
用户自定义处理逻辑。

```java
public interface UncaughtExceptionHandler {
  void uncaughtException(Thread t, Throwable e);
}
```

调用 `Thread.setDefaultUncaughtExceptionHandler` 来设置线程的 Exception
Handler（异常处理程序），如果是需要为线程池中的 Handler，则需要在构造线程池时
指定自定义的工厂函数，如：

```java
ExecutorService pool = Executors.newCachedThreadPool((runnable) -> {
    Thread thread = new Thread(runnable);
    thread.setUncaughtExceptionHandler((t, e) -> System.out.println(...));
    return thread;
});
```

另外注意一个线程中创建另一个线程，Exception Handler 是不继承的。

## 小结

何为“优雅”？正确地清理使用的资源即为优雅。JVM 正常退出时提供了 Shutdown hook机
制让我们能在退出时执行自定义的清理逻辑，通常线程池的关闭逻辑我们也会放到这里。

正确关闭线程池并不容易，虽然我们有 `shutdown` 和 `shutdownNow` 两种关闭语义，
过程中还是有一些未定义的任务需要处理：关闭时正在执行的任务。`shutdownNow` 会发
送中断请求，但线程不一定能响应中断。而即使线程响应了中断，线程池也不会有额外的
处理。通常后续的处理需要看业务上的需求。

此外，如果线程因为未捕获的异常而退出，根据任务的不同，可能会有严重的影响，Java
提供了 `UncaughtExceptionHandler`，用于注册异常退出时的处理逻辑，具体逻辑通常
也依赖业务需求。

---

[^finalizer]: 严格来说如果设置了 `runFinalizersOnExit`，还会运行所有对象的
  `finalizer`，现在已经不推荐使用这项技术了。

[^ref-tracking-executor]: 例子来源《Java 并发编程实战》
