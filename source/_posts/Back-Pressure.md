title: 背压(Back Pressure)与流量控制
toc: true
date: 2020-01-21 09:01:41
tags: ["Back Pressure", "Flow Control", "async"]
categories: [Notes]
---

春节期间，高速上动不动就堵车，这是一种“背压”的现象。背压(back pressure)，也叫“
反压”，指的是下游系统处理过慢，导致上游系统阻塞的现象。我们来聊聊背压后面的流
控吧。

## 流控策略

如上图，系统中存在三方：生产者(Producer)产生数据，通过管道(Pipeline)传输给消费
者(Consumer)。

{% asset_img Producer-Consumer.svg Producer Consumer %}

此时生产的速率(100/s)大于消费的速率(75/s)，多余的流量无处可去。于是自然地衍生
出三种策略：

1. 控制(Control)。降低生产速率，从源头减少流量
2. 缓冲(Buffer)。管道将多余的流量存储起来
3. 丢弃(Drop)。消费者将无暇处理的流量丢弃

由于“控制”策略需要将消费者的压力反馈给生产者，从而降低生产速率，与“背压”现象很
类似，因此在资料中背压也常常代指“控制”策略。

## 无限缓冲不可行

缓冲不应该是无限的(unbounded)。一方面如果生产者的速率**长期**大于消费者的速率
，那么多余的流量将无限增加，即使流量可以用某种方式存储，这些流量预期被消费的时
间也无限增加，满足不了业务需求。另一方面事实上无法实现真正的“无限”缓冲，它们最
终都将受限于物理资源（内存、硬盘等），资源耗尽时，就不仅仅是流量丢失的问题了。

如果是有限的缓冲，则当缓冲满了以后，又回到了背压和丢弃策略了。而丢弃可不可行通
常得看业务需求，于是早晚我们又得实现背压策略。

## 如何实现背压

我把它分成隐式背压（如 Callstack blocking）和显式背压（如 pull 模式）。

Callstack blocking 是指阻塞整条调用链，例如提交任务到线程池，拒绝策略是阻塞，
则线程池满了以后，整个线程会阻塞在提交的动作上，它隐式地阻塞了同一个线程上游的
生产者。如果处理流程不在同一个线程上则难以实现，如任务在多个线程上运行或跨越多
个微服务。

显式背压是指在业务逻辑中显式地实现生产者和消费者间的沟通达到流量控制的目的。例
如 TCP 协议中通过交换当前接收窗口的大小来完成流量控制。

其中拉取(pull)模式则是比较通用且重要的一种，即任务的趋动是由消费者发起的，而不
是生产者。例如 Reactive Stream 里的 API 规定是由订阅者（消费者）调用
`request(n)` 方法向生产者请求 n 个消息，生产者再调用 `onNext()` 将 n 个消息提
供给消费者。消费者可以按需要获取，生产者也可以按需生产，从而实现背压。

## 无处不在的流量控制

只在系统存在不止一方，就有流量产生，就需要流量控制。

TCP 是最经典的示例了，协议本身提供背压，内核会保存一个有限(bounded)大小的发送
缓冲，当缓冲满的时候，会阻塞 `send` 方法，即 callstack blocking 实现背压。这样
接收方的压力就可以传导到发送方的 `send` 方法了。

消息队列(如 Kafka)相当于提供了一个巨大（接近无限）的缓冲，这样它的上下游之间就
不需要有压力的传导了，多余的流量全在队列上。

在微服务架构中，通常有一个断路器(Circuit Breaker)的角色，在某个服务压力过大或
系统不可用时，不再请求而直接返回默认值，可以认为是一种丢弃策略。

但有时候，我们无法控制流量的生产者，例如用户的点击等，这时缓冲和丢弃策略就显得
很重要了。

## 背压与 async

最先是在学习 webflux 的时候接触背压的概念，当时还不太理解。后来看到讨论背压和
async 的文章，才认识到流控需求的普遍性和背压的重要性。

近几年异步编程又火了起来：Go/Rust 的协程、Python 的 asyncio、反应式编程
(Reactive Programming) 等。异步的作用是释放阻塞的线程，用来处理其它的任务，等
阻塞的资源准备就绪后再处理。这样能提高系统的吞吐，因为等待的时间减少了。

但是这相当于隐式地使用了“无限”的缓冲，用来存储处于等待状态的任务。由此带来的问
题就是：队列满了（资源用完了）怎么办？或者即使队列未满但等待时间过长了怎么办？

对于一些 cold 的内容[^cold-producer]，一些框架通过采用 poll 模式可以尽量实现背
压：如 NodeJs 里的 Stream、Rust 的 Tokio 框架、Project Reactor 及 RxJava 中的
许多 operator 等等。

而对于一些 hot 的内容，如 web 服务接收了过多的请求则无法有效控制。（了解有限，
欢迎评论）

[^cold-producer]: 一般 cold 指的是生产内容已经存在，如系统文件，而 hot 指的是
  动态生成的，如用户的点击。换言之 cold 内容的生产速率是可以控制的，而 hot 则
  无法控制。

## 小结

背压虽好，难实现；缓冲无限有危险；要用丢弃得看脸。

要意识到流量控制的必要性，对我自己而言，两点最佳实践：

1. 不要用无限的缓冲
2. 优先考虑 pull 模式

## 参考

- [Backpressure explained](https://medium.com/@jayphelps/backpressure-explained-the-flow-of-data-through-software-2350b3e77ce7)
    多示例解释了背压的概念
- [Handling Overload](https://ferd.ca/handling-overload.html) Erlang 决定不支
    持无限的 MailBox，对背压的一系列讨论，非常值得阅读
- [I'm not feeling the async pressure](https://lucumr.pocoo.org/2020/1/1/async-pressure/) 讲述了 async/await 缺少背压的现状和忧虑
- [Hacker News: I'm not feeling the async pressure](https://news.ycombinator.com/item?id=21927427)
    有许多关于 `.Net` 和缓冲相关的讨论
- [Some thoughts on asynchronous API design in a post-async/await
    world](https://vorpus.org/blog/some-thoughts-on-asynchronous-api-design-in-a-post-asyncawait-world/)
    async/await 下 API 设计的一些问题
- [Backpressuring in Streams](https://nodejs.org/es/docs/guides/backpressuring-in-streams/)
    NodeJs Stream 里的背压支持
- [RxJava Backpressure](https://github.com/ReactiveX/RxJava/wiki/Backpressure) Rxjava 如何实现背压
- [Tokio Backpressure](https://tokio.rs/docs/overview/#backpressure) Tokio 背
    压相关说明
- [Kafka Backpressure](https://docs.confluent.io/current/streams/architecture.html#backpressure)
    Kafka Stream 不需要处理背压
