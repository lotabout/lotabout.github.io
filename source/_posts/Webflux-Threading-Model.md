title: Webflux 线程模型理解
toc: true
date: 2024-06-07 21:00:00
tags: [Reactive, Streams, java]
categories: Notes
---

使用 Webflux/Reactor 编程，如果对其中的原理了解不够全面，容易掉坑里。

## 引子

一个业务系统是用 Webflux 写的，发现后台在做批量任务时，会卡住页面的访问。
排查发现是把 r2dbc 的 IO 线程给卡住了，导致页面请求时从数据库捞数据的请求
卡死。但这个批量操作本身并没有特别多的 DB 操作，为什么会卡住呢？

## Reactor Stream 简介

Java 9 引入了 `java.util.concurrent.Flow` 接口，支持[Reactive Streams 规范]
(https://www.reactive-streams.org/)。规范的核心是定义了发布者(Publisher)和订阅
者(Subscriber)的交互逻辑，规定Subscriber 必须以 PULL (拉取)的方式获取数据，以
此解决异步流式处理中的背压问题[^ref-back-pressure]。

[^ref-back-pressure]: 背压问题还有其它处理手段，可以参考我之前的文章 [背压与流量控制](https://lotabout.me/2020/Back-Pressure)

Reactive Streams 规定的交互流程如下（由于标准中有些部分留白，实际有两种常见模
式）：

{% asset_img 2024-05-27-webflux-threading-model-reactive-streams.svg Reactive Stream %}

主体流程分为这么几步：

1. Subscriber 向 Publisher 订阅。`onSubscribe` 的入参是订阅者 Subscriber。
2. Publisher 通知 Subscriber 订阅成功，并发送一个 `Subscription` 对象用于后续交互。
3. 当 Subscriber 有处理能力时，调用 Subscription 的 `request` 方法通知
   Publisher 发送 N 个数据
4. 每有一个新数据，调用 Subscriber 的 `onNext` 方法一次，直到发送了 N 个数据。

为什么需要有 `Subscription` 这个接口呢？为什么不直接把 `request` 方法定义在
Publisher 中呢？有个大前提是 Reactive Streams 规范中，一个 Publisher 可以有多
个 Subscriber，于是如果没有 `Subscription`，则 Publisher 需要在内部维护这个
Subscriber 与数据的关系，增加了复杂度。因此不管是从概念上的解耦还是减小实现复
杂性及提高性能性能方面考虑，把 Subscriber 与 Publisher 之间交互的生命周期抽象
成`Subscription`，都是一个不错的选择。

另外注意到图里有两种模式。Reactive Sterams 只规定调用了 `Subscription.request`
之后，如果有新的数据需要调用 Subscriber 的 `onNext` 方法。但是并没有规定
`onNext` 谁来调用。于是根据 Publisher 中数据是否需要共享，可以分为 Cold 和 Hot
两种模式。

Cold 模式下数据是分离的，每个 Subscriber 都有自己的数据流，例如
`Flux.range`，每个 subscriber 都会从头开始计数。于是 Publisher 可以把当前消费
的位置保存在 Subscription 中，由 Subscription 来调用 `onNext` 方法。

Hot 模式下数据是共享的，例如 `Flux.interval(..).share()`，记录了开始到现有的秒
数，每个 Subscriber 在订阅时都希望得到当前秒数，而不是从第 1s 开始。于是秒数信
息必须由 Publisher 保存，并且对 Subscriber 共享，此时 `subscription.request`
就只是个传话筒了。

## Reactor 与 Reactive Streams 规范

在流式代码中，通常只有一个数据源（例如调用某个 API），之后会对这个数据做一系列
的 `map`, `filter` 等操作，每个这样的操作符，从逻辑上都可以等价于既是一个
publisher 又是一个 subscriber。例如下面这样的代码:

```java
var myPub = Flux.range(1, 10)
                .map(x -> x * 2)
                .filter(x -> x > 10);

myPub.subscribe(System.out::println);
```

首先是构建 `publisher`，的过程，每个操作符[^ref-only-logically]都会保留它的父 publisher：

[^ref-only-logically]: 这里简化了很多实现细节，如实际上操作符并没有实现
    `Subscriber` 接口，而是在调用 `subscribe` 时才生成对应的 Subscriber。但并
    不影响整体逻辑的理解。

{% asset_img 2024-05-27-webflux-threading-model-assemble.svg Assemble Stage %}

于是当我们执行 `myPub.subscribe`[^ref-not-real-subscriber] 时，每个操作符本身作为一个 Subscriber，会不断
调用父 Publisher 的 `subscribe` 方法；而父 Publisher 在调用 `onSubscribe` 时，
每个操作符作为一个 Subscriber，会不断调用下一个操作符的 `onSubscribe` 方法:

[^ref-not-real-subscriber]: 严格来说 `System.out::println` 不是一个 Subscriber，
    实际上 `subscribe` 方法会将它包装成一个 `LambdaSubscriber`。

{% asset_img 2024-05-27-webflux-threading-model-subscribe.svg Subscribe %}

而当 Subscriber 调用 `request` 方法时，也是相同的路径[^ref-cold-hot]:

[^ref-cold-hot]: 这里只是抽象的模型，省略了 Subscription 与Publisher 的交互，
    以及 Cold Hot publisher 的区别等等。

{% asset_img 2024-05-27-webflux-threading-model-request.svg request and onNext %}

## 线程如何调度

上面我们讲解了如何组装流式代码以及它的内部执行流程，但这些代码是在哪个线程上执
行的呢？我们知道对于同步代码，代码会在同一个线程上执行，于是上面的示例中，所有
的调用都在同一个线程上：

{% asset_img 2024-05-27-webflux-threading-model-same-thread.svg Same Thread %}

图中的棕线代表线程。但是这个例子比较特殊，因为 `Flux.range` 的数据是就绪的，而
如果需要使用诸如 `WebClient` 调用 API 后做处理，则涉及到异步调用 IO，此时则会
是这样：

{% asset_img 2024-05-27-webflux-threading-model-two-thread.svg Run on Different Thread %}

上图会假设 WebClient 调用了外部服务，当外部服务返回时会在另一个线程上执行回调
函数 callback，而这个 callback 会调用 `B.onNext` 方法，以此类推后续的 `onNext`
都会在这个线程上执行。

这就有大问题了！例如底层调用使用的是 Netty，则执行 callback 的线程一般就是
Netty的 worker 线程，但现在我们必须在这个线程上执行所有的 onNext 方法，如果某
个操作符（如某个 `map`）是 CPU 密集型的，就会导致该 worker 线程被长时间阻塞，
此时 Netty 的 Worker 线程池成为瓶颈，造成其它子模块的请求没有 worker 线程能处
理而卡死，子功能之间互相耦合、干扰。

## 无奈下的 subscribeOn 与 publishOn

为了解决上面的问题，Reactor 提供了 `subscribeOn` 和 `publishOn` 两个方法，可以
分别影响 `request` 和 `onNext` 方法的执行线程。例如：

```java
var myPub = Flux.range(1, 10)
                .map(x -> x * 2)
                .subscribeOn(Schedulers.elastic())
                .filter(x -> x > 10);
myPub.subscribe(System.out::println);
```

则执行的流程如下:

{% asset_img 2024-05-27-webflux-threading-model-subscribeOn.svg subscribeOn %}

可以看到 `subscribeOn` 方法会影响 `request` 方法的执行线程，另外由于整个流程没
有另外的线程切换（如上节提到的 `WebClient`），因此 `onNext` 方法也会在同一个线
程执行。我们又知道诸如 `map(x -> x * 2)` 这样的操作是在 `onNext` 方法中执行的，
于是也会在新的线程上执行。

由于 `request` 方法调用顺序从代码的视角是由下到上的，因此一般说 `subscribeOn`
影响的是向上的调用链，直到 `publishOn` 或其它的 `subscribeOn` 方法为止。

同样的，`publishOn` 方法会影响 `onNext` 方法的执行线程，例如：

```java
var myPub = Flux.range(1, 10)
                .map(x -> x * 2)
                .publishOn(Schedulers.elastic())
                .filter(x -> x > 10);
myPub.subscribe(System.out::println);
```

{% asset_img 2024-05-27-webflux-threading-model-publishOn.svg publishOn %}

由于 `onNext` 方法调用顺序从代码的视角是由上到下的，因此一般说 `publishOn`
影响的是向下的调用链，直到其它的 `publishOn` 为止。

但要注意，如果 `subscribeOn` 和 `publishOn` 同时存在，则 `subscribeOn` 的作用
会“穿过” `publishOn`：

```java line_number:true
var myPub = Flux.range(1, 10)
                .map(x -> x * 2)
                .publishOn(Schedulers.elastic())
                .subscribeOn(Schedulers.elastic())
                .filter(x -> x > 10);
myPub.subscribe(System.out::println);
```

{% asset_img 2024-05-27-webflux-threading-model-mixed.svg publishOn %}

在这种情况下，第 2 行的 `map` 还是会被第 `4` 行的 `subscribeOn` 影响；而第 5
行的 `fitler` 最终会被 `publishOn` 影响。

## 后记

学习这个线程模型距离我开始学习 Webflux 几乎有 4 年以上的时间了，在我自认为对
Webflux 了解还算充分的时候被教育了。时至今日，我依然有两个暴论：

1. Webflux 只适用于诸如网关这样的业务简单但高并发的场景。
2. 对于绝大多数人来说，green thread 类型的异步模型才是最好的。
