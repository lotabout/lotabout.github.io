title: Reactive Streams JVM Specification 翻译
toc: true
date: 2019-12-23 21:02:02
tags: [Reactive, Streams, java]
categories: [Translation]
---

原文：[Reactive
Streams](https://github.com/reactive-streams/reactive-streams-jvm#specification)。
文章只翻译 Specification 部分，用于自己理解。

## 1. Publisher

```java
public interface Publisher<T> {
    public void subscribe(Subscriber<? super T> s);
}
```

| ID  | 规则                                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Publisher` 发送给 `Subscriber` 的 `onNext` 信号数**必须**小于或等于 `Subscriber` 通过 `Subscription` 发送的请求数                                                                                                                                                                                                                                          |
| 💡  | 该规则是为了说明 Publisher 发送的元素不能超过 Subscribers 的请求。这里有一个隐含但重要的结论：由于发送请求与响应请求存在 happens-before 的关系，所以这里其实要求 `Subscriber` 发送请求在先，接收响应在后                                                                                                                                                    |
| 2   | `Publisher` 发送的元素数**可能**小于 `Subscriber` 的请求数，并以 `onComplete` 或 `onError` 结束                                                                                                                                                                                                                                                             |
| 💡  | 该规则是为了说明 Publisher 无法保证收到多少请求就发送多少元素；有可能就是没办法生成这么多元素；有可能过程中出错了；也有可能提前退出了。                                                                                                                                                                                                                     |
| 3   | 发送给 `Subscriber` 的 `onSubscribe`、`onNext`、`onError` 及 `onComplete` 信号必须有序                                                                                                                                                                                                                                                                      |
| 💡  | 该规则的用意是：当且仅当每个信号的建立存在 happens-before 的关系时，才允许（包括从多线程中）信号的触发                                                                                                                                                                                                                                                      |
| 4   | 如果 `Publisher` 失败了，**必须**发送 `onError` 信号                                                                                                                                                                                                                                                                                                        |
| 💡  | 该规则的用意是指出当 Publisher 检测到它无法继续执行时，Publisher 有职责通知 Subscriber，这样 Subscriber 才有机会去处理错误，或清理资源                                                                                                                                                                                                                     |
| 5   | 如果 `Publisher` 成功结束（Stream 元素有限），则**必须**发送 `onComplete` 信号                                                                                                                                                                                                                                                                              |
| 💡  | 该规则的用意是指出 Publisher 到达终止状态时，有职责通知 Subscriber，让它们能做相应的处理，清理资源等                                                                                                                                                                                                                                                        |
| 6   | 如果 `Publisher` 向 `Subscriber` 发送了 `onError` 或 `onComplete` 信号，则**必须**认为 `Subscriber` 的 `Subscription` 被取消了                                                                                                                                                                                                                              |
| 💡  | 该规则的用意是确保不管 `Subscription` 是自己取消了，还是 `Publisher` 发送了 `onError` 或 `onComplete` 的信号，这个 Subscription 都会有同样的行为                                                                                                                                                                                                           |
| 7   | 一旦 Publisher 到达了终止状态 (`onError`, `onComplete`)，则**要求**没有后续的信号发出                                                                                                                                                                                                                                                                       |
| 💡  | 该规则的是要确保 onError 和 onComplete 是 Publisher 与 Subscriber 间交互的最终状态                                                                                                                                                                                                                                                                          |
| 8   | 如果 `Subscription` 被取消了，则最终(eventually) **必须**停止向它的 `Subscriber`  发送信号                                                                                                                                                                                                                                                                  |
| 💡  | 该规则是要确保 Subscriber 尊重调用 Subscription.cancel() 方法取消的 Subscriber。之所以是 **最终** 停止，是因为可能由于异步处理导致信号的传播有延迟                                                                                                                                                                                                         |
| 9   | `Publisher` 在向 `Subscriber` 发送其它所有信号前**必须**先调用它的 `onSubscribe` 方法，并**必须**正常返回，除非 `Subscriber` 是 `null`，这时**必须**向调用方抛出 `java.lang.NullPointerException`，其它任何情况下的出错（或被 `Subscriber` 拒绝）都只能通过调用 `onError` 方法（当然要在调用 `onSubscribe` 之后）                                           |
| 💡  | 该规则要确保 `onSubscribe` 总是先于其它信号被发送，这样能保证 `Subscriber` 在处理其它信号前能执行初始化逻辑。同时`onSubscribe` **不能**调用多次。如果 `Subscriber` 参数为 `null`，则这个错误除了调用方外无处汇报，于是只能抛出 `java.lang.NullPointerException`。可能的情形：一个有状态的 `Publisher` 可能底层依赖的资源有限，或用光了，或已经处在终止状态 |
| 10  | `Publisher.subscribe` **可以**被多次调用，前提是参数**必须**是不同的 `Subscriber`                                                                                                                                                                                                                                                                           |
| 💡  | 本规则是让 `subscribe` 方法的调用方认识到，不应该假设一个通用的 `Publisher` 和 `Subscriber` 支持重复注册 `Subscriber`。此外，它还要求无论调用 `subscribe` 多少次，它的语义都应保持不变                                                                                                                                                                      |
| 11  | `Publisher` **可以**支持多个 `Subscriber` 并决定每个 `Subscription` 是单播还是多播                                                                                                                                                                                                                                                                          |
| 💡  | 本规则的目的是使 Publisher 的实现可以灵活地决定他们要支持多少个 Subscriber（如果有的话），以及如何分配元素。                                                                                                                                                                                                                                                |

## 2. Subscriber

```java
public interface Subscriber<T> {
    public void onSubscribe(Subscription s);
    public void onNext(T t);
    public void onError(Throwable t);
    public void onComplete();
}
```

| ID   | Rule                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `Subscriber` **必须**通过 `Subscription.request(long n)` 发送请求，接收 `onNext` 信号                                                                                                                                                                                                                                                                                              |
| 💡   | 该规则确认 `Subscriber` 需要负责决定何时接收请求，接收多少请求。为了避免由于重入 Subscription 方法导致的信号重排，**强烈建议** 同步的 Subscriber 实现在信号处理方法的末尾调用 `Subscription` 方法。同时**强烈建议** Subscriber 一次性请求它能处理的信号数目上限，一次只请求一个元素会导致本质上底效的 `stop-and-wait` 协议                                                        |
| 2    | 如果 `Subscriber` 可能对其 `Publisher` 的响应能力产生负面影响，则**强烈建议**异步分发信号                                                                                                                                                                                                                                                                                          |
| 💡   | 从执行的角度上，Subscriber 不应该阻碍 Publisher 的执行。换句话说，Subscriber 不应该把 Publisher 的 CPU 抢光                                                                                                                                                                                                                                                                        |
| 3    | `Subscriber.onComplete()` 和 `Subscriber.onError(Throwable t)` 方法**不能**调用 `Subscription` 或 `Publisher` 的其它任何方法                                                                                                                                                                                                                                                       |
| 💡   | 该规则是为了防止在处理结束信号时，在 Publisher、Subscription 和 Subscriber 间出现环、竞争                                                                                                                                                                                                                                                                                          |
| 4    | `Subscriber.onComplete()` 和 `Subscriber.onError(Throwable t)` 在接收到对应信号时**必须**认为 Subscription 已经被取消了                                                                                                                                                                                                                                                            |
| 💡   | 该规则是为了确保 `Subscriber` 尊重 Publisher 的终止信号。概念上在接收到 onComplete 或 onError 信号时，Subscription 就已经无效了                                                                                                                                                                                                                                                    |
| 5    | 如果一个 `Subscriber` 已经有了活跃的 `Subscription`，则对于新的 `Subscription`，在接收到 `onSubscribe` 信号后需要调用 `Subscription.cancel()`                                                                                                                                                                                                                                      |
| 💡   | 该规则防止两个或多个 Publisher 尝试与同一个 Subscriber 交互。通过强制这个规则，由于多余的 `Subscription` 会被取消，所以可以防止资源泄露。如果无法遵守这个规则，则可能会违反 Publisher 的规则 1 等其它规则。此类违规行为可能导致难以发现的 bug                                                                                                                                      |
| 6    | 如果 `Subscription` 已经没用了，则 `Subscriber` **必须**调用 `Subscription.cancel()`                                                                                                                                                                                                                                                                                               |
| 💡   | 该规则强调 Subscribers 不能在 Subscription 没有时随意丢弃它们，而必须调用 `cancel` 方法，这样 Subscription 的资源才能安全地、及时地被回收。示例：一个 Subscriber 只关心某个元素，之后会取消它的 Subscription 来向 Publisher 表示结束                                                                                                                                               |
| 7    | Subscriber **必须**保证所有对 Subscription 的请求和取消方法的调用都是顺序执行的                                                                                                                                                                                                                                                                                                    |
| 💡   | 该规则的目的是，当且仅当每个调用之间建立 happens-before 的关系时，才允许调用请求和取消的方法（包括从多线程中调用）                                                                                                                                                                                                                                                                 |
| 8    | `Subscriber` 在调用 `Subscription.cancel` 方法后，如果还有其它未完成的元素请求，则**必须**准备好接收一个或多个 `onNext` 信号。`Subscription.cancel()` 方法无法保证立即处理底层的清理操作                                                                                                                                                                                           |
| 💡   | 该规则强调在调用 `cancel` 方法和 `Publisher` 觉察之间可能存在时间差                                                                                                                                                                                                                                                                                                                |
| 9    | 无论前面还有没有 `Subscription.request(long n)` 的调用，`Subscriber` 都**必须**准备好接收 `onComplete` 信号                                                                                                                                                                                                                                                                        |
| 💡   | 该规则确定请求与完成之间没有关联，完全有可能流提前结束了。同时也消除了为了等待完成而进行轮询的需求。                                                                                                                                                                                                                                                                               |
| 10   | 无论前面还有没有 `Subscription.request(long n)` 的调用，`Subscriber` 都**必须**准备好接收 `onError` 信号                                                                                                                                                                                                                                                                           |
| 💡   | 该规则确定 Publisher 是否失败与请求是否发送之间毫无关联。这意味着 Subscriber 不需要通过轮询来看 Publisher 是不是无法响应它的请求                                                                                                                                                                                                                                                   |
| 11   | `Subscriber` **必须**保证所有对其信号方法的调用都发生在处理这些信号之前(happens-before)。亦即 Subscriber 需要妥善地将信号发布给相应的处理逻辑                                                                                                                                                                                                                                      |
| 💡   | 该方法的目的是确定 Subscriber 的实现有职责保证对信号的处理是线程安全的，参考 [JMM definition of Happens-Before in section 17.4.5](https://docs.oracle.com/javase/specs/jls/se8/html/jls-17.html#jls-17.4.5)                                                                                                                                                                        |
| 12   | 对于给定的 `Subscriber`(object equality)，`Subscriber.onSubscribe` 只能被调用最多一次                                                                                                                                                                                                                                                                                              |
| 💡   | 该规则强调需要假设同一个 Subscriber 最多只能 subscribe 最多一次。注：`object equality` 指 `a.equals(b)`                                                                                                                                                                                                                                                                            |
| 13   | 调用 `onSubscribe`、`onNext`、`onError` 或 `onComplete` 方法时**必须**正常返回，除非参数是 `null`，这时必须抛 `java.lang.NullPointerException` 给调用方。其它所有情况下，如果 `Subscriber` 要表达出错了，只能取消它的 `Subscription`。如果违反了该规则，**必须**认为所有与该 `Subscriber` 关联的 `Subscription` 都是取消了的，且调用方**必须**以某种适合于运行环境的方式抛出错误。 |
| 💡   | 该规则想要厘清 Subscriber 方法的语义及违反该规则时 `Publisher` 应有的行为。 “以某种适合于运行环境的方式抛出错误”可能意味着打日志，或者让某人或某样事物意味到这个错误，毕竟这个错误没办法通知到出错的 Subscriber                                                                                                                                                                   |

## 3. Subscription

```java
public interface Subscription {
    public void request(long n);
    public void cancel();
}
```

| ID | Rule                                                                                                                                                                                                                                   |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | `Subscription.request` 和 `Subscription.cancel` 方法**只能**在 `Subscriber` 中调用                                                                                                                                                     |
| 💡 | 该规则的用意是指出 Subscription 代表的是 Subscriber 和 Publisher 的唯一关联。Subscriber 决定着何时请求新的元素，何时不再需要新的元素（译注：即 pull 模式）                                                                            |
| 2  | 在 `onNext` 或 `onSubscribe` 方法中，`Subscription` **必须**允许 `Subscriber` 同步调用 `Subscription.request`                                                                                                                          |
| 💡 | 该规则旨在厘清 `request` 方法的具体实现必须是可重入的，防止在 `request` 和 `onNext`（以及最后的 `onComplete` / `onError` 方法) 的互相调用中导致栈溢出。这也暗示了 Publisher 可以是“同步的”，即在调用 `request` 的线程中调用 `onNext`。 |
| 3  | `Subscription.request` 方法**必须**指定 `Publisher` 与 `Subscriber` 同步递归调用的上限                                                                                                                                                 |
| 💡 | 该规则是上一条规则的补充，为递归的层数做了限制。**建议**具体的实现将这个上限定为 `1`，用以节省堆栈空间。一个不应该的无限递归示例：Subscriber.onNext -> Subscription.request -> Subscriber.onNext -> …, 不加限制的话会使线程堆栈崩溃    |
| 4  | `Subscription.request` **应该**及时返回，以保证调用方能及时响应其它情况                                                                                                                                                                |
| 💡 | 该规则的用意是指出 `request` 方法的本意是非阻塞(non-obstructing)的，它应该在调用线程中尽可能快地运行，尽可能避免做一些重 CPU 的操作，导致调用线程的停滞                                                                                |
| 5  | `Subscription.cancel` **必须**及时返回以尊重调用方的响应能力，**必须**保持幂等，**必须**保证线程安全                                                                                                                                   |
| 💡 | 该规则的用意是指出 `cancel` 方法的本意是非阻塞(non-obstructing)的，它应该在调用线程中尽可能快地运行，尽可能避免做一些重 CPU 的操作，导致调用线程的停滞。另外同样重要的是，要可以多次调用它而不产生不利影响                            |
| 6  | 在 `Subscription` 被取消后，后续的 `Subscription.request(long n)` **必须**什么都不做(NOP)                                                                                                                                              |
| 💡 | 该规则的目的是强调取消 subscription 和后续 request 表现为 No-op 之间存在因果关系                                                                                                                                                       |
| 7  | 在 `Subscription` 被取消后，后续的 `Subscription.cancel()` **必须**什么都不做(NOP)                                                                                                                                                     |
| 💡 | 该规则已被 3.5 取代                                                                                                                                                                                                                    |
| 8  | 在 `Subscription` 未被取消前，`Subscription.request(long n)` **必须**向对应的 subscriber 发出指定数量的请求                                                                                                                            |
| 💡 | 该规则的是要确保“请求”是一个可以累加的操作，同时保证对元素的请求被传达到 Publisher                                                                                                                                                     |
| 9  | 在 `Subscription` 未被取消前，如果调用 `Subscription.request(long n)` 方法时参数是 `<=0`，则**必须**发送 `onError` 信号抛出 `java.lang.IllegalArgumentException`，异常的错误信息**应当**描述请求的数量小于等于 0 是非法的              |
| 💡 | 该规则的目的是防止错误的实现不抛出异常，直接处理请求。由于请求的操作是可累加的，请求负数或 0 个元素很可能代表了 Subscriber 计算错误                                                                                                    |
| 10 | 在 `Subscription` 未被取消前，`Subscription.request(long n)` 方法**可以**同步地调用该 subscriber(或其它 subscriber) 的 `onNext` 方法                                                                                                   |
| 💡 | 该规则的目的是强调可以创建同步的 Publisher，它们可以在调用自己的线程上执行自己的逻辑                                                                                                                                                   |
| 11 | 在 `Subscription` 未被取消前，`Subscription.request(long n)` 方法**可以**同步地调用该 subscriber(或其它 subscriber) 的 `onError` 或 `onComplete` 方法                                                                                  |
| 💡 | 该规则的目的是强调可以创建同步的 Publisher，它们可以在调用自己的线程上执行自己的逻辑                                                                                                                                                   |
| 12 | 在 `Subscription` 未被取消前，`Subscription.cancel` **必须**保证调用后会通知 `Publisher`，让其最终(eventually)停止向自己发送信号。当然**不要求**立马生效                                                                              |
| 💡 | 该规则的目的是强调 Publisher 最终要尊重 subscription 想要取消的意愿，同时也承认可能需要花上一定的时间才能真正停止信号的发送                                                                                                            |
| 13 | 在 `Subscription` 未被取消前，调用 `Subscription.cancel` 方法**必须**向 `Publisher` 发送请求，让其最终(eventually)释放对相应的 Subscriber 的引用                                                                                       |
| 💡 | 该规则的用意是保证在 Subscription 失效后，相应的 Subscriber 被正确地 GC。虽然规范不推荐用同一个 Subscriber 重新注册（见 2.12），但规范中没有说不允许，否则的话就需要把历史注册过的 Subscriber 都存起来                                |
| 14 | 在 `Subscription` 未被取消前，如果 `Publisher` 是有状态的，且当前没有其它 `Subscription` 存在，则调用 `Subscription.cancel` **可能**导致它进入 `shut-down` 状态（参考 1.9）                                                           |
| 💡 | 该规则的目的是允许 Publisher 在发送 `onSubscribe` 之后向新的 Subscriber 发送 `onComplete` 或 `onError` 信号，以响应现有 Subscriber 的取消信号                                                                                          |
| 15 | 调用 `Subscription.cancel` **必须**正常返回                                                                                                                                                                                            |
| 💡 | 该规则不允许具体实现在调用 `cancel` 方法时抛出异常                                                                                                                                                                                     |
| 16 | 调用 `Subscription.request` **必须**正常返回                                                                                                                                                                                           |
| 💡 | 该规则不允许具体实现在调用 `request` 方法时抛出异常                                                                                                                                                                                    |
| 17 | `Subscription` **必须**支持调用 `request` 无数次，且**至少**支持到 2^63-1 (`java.lang.Long.MAX_VALUE`) 次。等于或超过2^63-1 (`java.lang.Long.MAX_VALUE`) 的请求，`Publisher` 可以认为是“实际上无限的”                                  |
| 💡 | 该规则是为了说明 Subscriber 可以在任意次数的请求中请求大于 0（见 3.9）的无上限的元素个数。由于在当前及可见的硬件资源下，不太可能产生超过 2^63 - 1 个元素（每纳秒产生一个元素需要 292 年），因此允许 Publisher 只处理到这个上限        |

`Subscription` 只会被一个 `Publisher` 和一个 `Subscriber` 共享，用于它们间的数
据交换。这也是为什么 `subscribe()` 方法不会返回创建的 `Subscription` 而是返回
`void`。`Subscription` 只会通过 `onSubscribe` 回调方法传递给 `Subscriber`。

## 4.Processor

```java
public interface Processor<T, R> extends Subscriber<T>, Publisher<R> {
}
```

| ID | Rule                                                                                                                                                                              |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | `Processor` 代表一个处理阶段，它即是 `Subscriber` 也是 `Publisher`，当然也必须遵守二者的规则                                                                                      |
| 💡 | 该规则指是创建 Processor 的行为，并且遵守 Publisher 和 Subscriber 的规则                                                                                                          |
| 2  | `Processor` **可以**选择在接到 `onError` 信号后恢复执行。如何它这么做了，则**必须**认为 `Subscription` 被取消了，不然地话，它**必须**立即将 `onError` 信号传递给它的 Subscriber。 |
| 💡 | 该规则的目的是说明具体的实现可以不仅仅实现简单的数据变换                                                                                                                          |

虽然不是强制要求，通常在最后一个 `Subscriber` 取消它的 `Subscription` 后，最好
能取消 `Processor` 上游的 `Subscription`，以此将取消的信号传递给上游。

## 异步处理 vs 同步处理

Reactive Streams API 规定所有对元素的处理(`onNext`)或结束信号(`onError`,
`onComplete`) **不可以**阻塞 `Publisher`。然而具体的 `on*` 处理程序可以同步或
异步地处理事件。

考虑以下示例：

```
nioSelectorThreadOrigin map(f) filter(p) consumeTo(toNioSelectorOutput)
```

它的源头和目标都是异步的。我们假设源头的目标都是 event loop 的 selector。则
`Subscription.request(n)` 必须从目标一路链接到源头。每个具体的实现可以选择如何
完成该操作。

下面示例中的 `|` 字符代表发送一个异步的信号（加入队列并等待执行），`R#` 代表资
源（可能是线程）。

```
nioSelectorThreadOrigin | map(f) | filter(p) | consumeTo(toNioSelectorOutput)
-------------- R1 ----  | - R2 - | -- R3 --- | ---------- R4 ----------------
```

这个例子中，三个消费者 `map`, `filter`, `consumeTo` 中的每一个都是异步进行调度
。这些任务可能通过同一个 event loop(trampoline)，在不同的线程上处理等，总之想
怎么搞就怎么搞。

```
nioSelectorThreadOrigin map(f) filter(p) | consumeTo(toNioSelectorOutput)
------------------- R1 ----------------- | ---------- R2 ---------------
```

这个例子里只有最后一步是异步调度的，将工作提交到 NioSelectorOutput event loop
中，而 `map` 和 `filter` 则是在原来的线程上执行的。

当然其它的实现也可以把这些操作融合到最终的消费者上：

```
nioSelectorThreadOrigin | map(f) filter(p) consumeTo(toNioSelectorOutput)
--------- R1 ---------- | ------------------ R2 -------------------------
```

所有这些变种都可以认为是“异步流”。每一种都有自己的用途，也都有自己在包括性能和
实现难度上的各种权衡。

Reactive Streams 协议赋予了实现去灵活管理资源、调度、混用异步同步的自由。底线
是它得是一个非阻塞的、异步的、动态 push-pull 的流。

为了保证所有 `Publisher`/`Subscription`/`Subscriber`/`Processor` 的这些 API 都
能被实现成真正的异步，所有方法的返回值都定义成了 `void`。
