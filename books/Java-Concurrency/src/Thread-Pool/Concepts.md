# 线程池相关概念

我们希望使用线程池，将任务的提交和任务的执行解耦开来。在整体生命周期中我们会遇
到下面几类概念，Java 中抽象了相应的接口：

- 任务本身
  - `Runnable` 代表一个可执行的类，没有返回值，不可抛（受检查）异常
  - `Callable<V>` ，与 `Runnable` 类似，但有返回结果，可抛（受检查）异常
- 任务（异步）执行的结果
  - `Future`，可用来检查任务是否执行完成，完成时可获取结果，错误时可获取异常
- 任务的管理
  - `Executor`，单纯用来执行 `Runnable`
  - `ExecutorService`，继承了 `Executor`，提供了管理 API，可返回 `Future` 作为结果

以上提到的都是接口，都是抽象的概念，代表了 Java 内部是怎么看待线程池的功能的，
内置的线程池都实现了 `ExecutorService`。本节会来聊一聊这些概念。

## Runnable 与 Thread

如果我们翻阅 JDK 的文档，会发现 `Runnable` 和 `Thread` 是 JDK 1.0 就存在的，而
其它的接口/类大多是 JDK 1.5 时和 JUC 包一起引入的。这也意味着 `Runnable`才是
Java 对“任务”最初的抽象。它的定义如下：

```java
@FunctionalInterface
public interface Runnable {
    public abstract void run();
}
```

`Runnable` 的抽象概念就是“可以运行”的代码。只有一个 `run` 方法指定运行逻辑，没
有返回值，也没有抛受检查异常（Checked Exception）。

`Runnable` 设计上是与 `Thread.start` 一起使用的。当一个类实现了`Runnable` 接口
，我们就可以用它来创建一个线程，启动线程就会调用类的 `run` 方法。而 `run` 方法
里想执行什么内容都可以。

## Executor

`Runnable` 代表了任务本身，而 `Executor` 接口则定义了线程池的最简单行为：执行
任务：

```java
public interface Executor {
    void execute(Runnable command);
}
```

`Executor` 接口十分简单，它只是定义了一个新角色：执行器，它唯一职责是执行任务
。至于任务是同步执行还是异步执行，是创建新线程、用线程池还是直接在当前线程上运
行，都没有规定。

尽管简单，`Executor` 还是从概念上将任务的提交和任务的执行解耦开了。用 `new
Thread(..).start()` 方法时，任务的提交（通过 `new Thread(..)`）与任务的执行
(`Thread.start`) 是绑定的，任务只能提交给新的线程，只能由该线程执行，只能在调
用 `start` 时执行。而如果使用 `Executor` 的方式提交任务，就不会有这个问题。

## ExecutorService 与生命周期管理

`Executor` 没有规定必须用线程池来执行任务，但如果我们真的使用线程池，就会立马
发现 `Executor` 接口上的薄弱：

- 如何关闭？JVM 只有在所有（非守护）线程关闭后才会退出，我们需要关闭线程池的手段。
- 关闭时如何处理还在运行以及未运行的任务？
    * 例如是立刻杀死还在运行的任务？还是等任务运行结束？
    * 还在排队的任务是等运行结束？还是直接丢弃？还是需要返回给调用方？
- 关闭时如何处理新到来的请求？

为了满足生命周期的管理需求，`ExecutorService` 继承了 `Executor` 并扩展了如下方
法：

```java
public interface ExecutorService extends Executor {
    void shutdown();
    List<Runnable> shutdownNow();
    boolean isShutdown();
    boolean isTerminated();
    boolean awaitTermination(long timeout, TimeUnit unit) throws InterruptedException;
    //...
}
```

除了无需多言的运行中（Running）状态，`ExecutorService` 又定义了关闭（Shutdown
）、终止（Terminate）两个状态[^more-internal-state]。具体的语义在 JDK 文档中有
详细说明，这里简要说明如下：

* `shutdown` 时不接收新的请求，会等待正在运行和排队的任务完成
* `shutdownNow` 时不接收新的请求，不处理等待的任务，会中断正在运行的任务

有了这些方法，我们就能更精细地管理线程池本身的生命周期。也因此在日常使用中，我
们几乎不会直接使用 `Executor` 接口，且 JUC 中的线程池也都实现了
`ExecutorService` 接口。

## Callable 与 Future

`Runnable` 不返回结果也不能抛出受检异常，如果我们关心执行的结果，要如何获取？
简单粗暴的方法是使用共享的全局变量传递信息，如：

```java
ExecutorService executorService = Executors.newFixedThreadPool(10);

AtomicInteger result = new AtomicInteger(0);
executorService.execute(() -> {
    // with some complex calculation
    result.set(10);
});
```

这里我们用 Java 8 的 Lambda 语法构造了一个 Runnable 对象，在执行结束时将计算的
结果设置到共享的变量 `result` 中，以此来获取任务的结果信息。

不过这样做太绕了，于是 JDK 1.5 中又新增了 `Callable` 来表示一个会返回结果的任
务，用 `Future` 接口表表示返回的结果。我们先来看 `Callable`：

```java
@FunctionalInterface
public interface Callable<V> {
    V call() throws Exception;
}
```

与 `Runnable` 不同的是 `call` 方法能返回结果，结果用泛型定义，并且抛出了受检查
异常。

仅仅有任务的接口还不够，还需要有执行器的相关接口，在 `ExecutorService` 中定义
了如下方法：

```java
public interface ExecutorService extends Executor {
    <T> Future<T> submit(Callable<T> task);
    <T> Future<T> submit(Runnable task, T result);
    Future<?> submit(Runnable task);

    <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks) throws InterruptedException;
    <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks, long timeout, TimeUnit unit) throws InterruptedException;
    <T> T invokeAny(Collection<? extends Callable<T>> tasks) throws InterruptedException, ExecutionException;
    <T> T invokeAny(Collection<? extends Callable<T>> tasks, long timeout, TimeUnit unit) throws InterruptedException, ExecutionException, TimeoutException;
}
```

方法分成两组， `submit` 用来处理单个任务，`invoke` 用来处理多个任务。注意到
`submit` 方法接收 `Callable<T>`，并返回 `Future<T>`，当我们需要提交一个任务，
并关心任务的返回结果时，就应该使用这个方法。于是刚才的需求就可以这么写：

```java
ExecutorService executorService = Executors.newFixedThreadPool(10);
Future<Integer> result = executorService.submit(() -> {
    // with some complex calculation
    return 10;
});
```

那么这里返回的 `Future` 是什么呢？当我们提交一个任务时，并不会在 `submit` 等待
，直到结果返回，而是 `submit` 后先执行后续的操作，由线程池慢慢执行任务。换句话
说，任务的执行是异步的。

于是，在 `submit` 方法返回时，其实任务的结果还未就绪，接口 `Future` 要表达的就
是这样的概念。`Future` 里最终会有结果（成功有值，失败有异常），但不一定现在就
有，它的方法如下：

```java
public interface Future<V> {
    boolean isDone();
    V get() throws InterruptedException, ExecutionException;
    V get(long timeout, TimeUnit unit) throws InterruptedException, ExecutionException, TimeoutException;

    boolean cancel(boolean mayInterruptIfRunning);
    boolean isCancelled();
}
```

结果并不是马上就绪，因此提供了（非阻塞的） `isDone` 方法来检查任务是否结束（不
管成功还是失败），两个 `get` 方法则是阻塞地等待任务结束，并返回结果（可能是正
常结果，也可能是异常）。

`cancel` 方法则与任务的取消和关闭有关，后续章节会介绍。

有了 `Callable`、`Future` 以及 `submit` 方法，我们也能方便地表达提交任务到线程
池，并期待任务返回结果的需求了。

## 小结

想要融入环境先要学会它们的语言，而 Java 中语言通常由接口描述。

本节中我们看到使用 `Runnable` 和 `Callable` 分别表示无返回和有返回的任务，由
`Future` 代表的异步返回结果，由`Executor` 代表的抽象执行器，由
`ExecutorService` 代表的带有生命周期管理的执行器。

Java 中的线程池使用围绕这些概念构建，最后我们也大概了解了一些 JDK 里自带的线程
池实现，不同实现的主要区别是线程池内部管理策略的不同。

从这些接口的演变我们也可以窥探 Java 的蓬勃发展，JDK 1.0 中只有 `Runnable` 和线
程的简单抽象，到 JDK 1.5 中对 `ExecutorService` 的解耦和抽象，再到 JDK 1.8 中
实现 `ForkJoinPool` 来满足更高并发的需求。可以看到 Java 的应用场景和问题规模都
在不断变大。

本节中我们主要讲解了线程池的概念，下节中我们会回到任务本身，关注如何取消或关闭
一个任务。

---

[^more-internal-state]: 如 `ThreadPoolExecutor` 内部还有更多的状态：`RUNNING`,
  `SHUTDOWN`, `STOP`, `TIDYING`, `TERMINATED`，只是从接口层面只有 `shutdown`
  和 `terminated` 两种
