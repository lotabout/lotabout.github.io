title: Kafka 入门介绍
date: 2018-07-13 22:51:58
tags: [Kafka, Big Data]
categories: [Knowledge]
toc: true
---

Kafka 的大名相信大家早有耳闻，就是《变形记》的作者……咳咳……是一个著名的分布式消
息队列，据说是因为作者特别喜欢作家卡夫卡才取名 Kafka 的。开始接触 Kafka 时最头
疼的就是它的概念，什么是 group，什么是 partition …… 这里咱们从头开始理一理
Kafka 的基本概念。

## Topic

一个 Topic（主题）对应一个消息队列。Kafka 支持多生产者，多消费者，对应下图：

{% asset_img kafka-topic.svg Kafka Topic %}

多个生产者将数据发送到 Kafka 中，Kafka 将它们顺序存储，消费者的行为留到下面讨
论。我们知道 Kafka 的目标是大数据，如果将消息存在一个“中心”队列中，势必缺少可
伸缩性。无论是生产者/消费者数目的增加，还是消息数量的增加，都可能耗尽机器的性
能或存储。

因此，Kafka 在概念上将一个 Topic 分成了多个 Partition，写入 topic 的消息会被（
平均）分配到其中一个 Partition。Partition 中会为消息保存一个 Partition 内唯一
的 ID ，一般称为偏移量(offset)。这样当性能/存储不足时 Kafka 就可以通过增加
Partition 实现横向扩展。

{% asset_img kafka-partition.svg Kafka Partition %}

现在我们有了一个队列的消息，那么如何发送给消费者呢？

## 消费模型

一般有两种消费模型，不同模型下消费者的行为是不同的：

- 队列模式（也叫点对点模式）。多个消费者共同消费一个队列，每条消息只发送给一个
    消费者。
- 发布/订阅模式。多个消费者订阅主题，每个消息会发布给所有的消费者。

{% asset_img kafka-consumer-model.svg Kafka Consumer Model %}

两种方式各有优缺点：
- 队列模式中多个消费者共同消费同一个队列，效率高。
- 发布/订阅模式中，一个消息可以被多次消费，能支持冗余的消费（例如两个消费者共
    同消费一个消息，防止其中某个消费者挂了）

显然要构建一个大数据下的消息队列，两种模式都是必须的。因此 Kafka 引入了
Consumer Group（消费组）的概念，Consumer Group 是以发布/订阅模式工作的；一
个 Consumer Group 中可以有多个 Consumer（消费者），Group 内的消费者以队列模式工作
，如下图：

{% asset_img kafka-consumer-group.svg Kafka Consumer Group %}

上面提到，Kafka 中的消息是以 Partition 存储的，那么它是如何与 Consumer 对接的呢？

## Partition 与消费模型

上面提到，Kafka 中一个 topic 中的消息是被打散分配在多个 Partition(分区) 中存储的，
Consumer Group 在消费时需要从不同的 Partition 获取消息，那最终如何重建出 Topic
中消息的顺序呢？

答案是：没有办法。Kafka 只会保证在 Partition 内消息是有序的，而不管全局的情况
。

下一个问题是：Partition 中的消息可以被（不同的 Consumer Group）多次消费，那
Partition中被消费的消息是何时删除的？ Partition 又是如何知道一个 Consumer
Group 当前消费的位置呢？

1. 无论消息是否被消费，除非消息到期 Partition 从不删除消息。例如设置保留时间为
   2 天，则消息发布 2 天内任何 Group 都可以消费，2 天后，消息自动被删除。
2. Partition 会为每个 Consumer Group 保存一个偏移量，记录 Group 消费到的位置。
   如下图：

{% asset_img kafka-consumer-position.svg Kafka Consumer Position %}

上面我们提到的都是 Partition 与 Consumer Group 之间的关系，那 Group 中的
Consumer 又是如何与 Partition 对应的呢？一般来说这也是最不容易理解的部分。但其
实机制很简单：

* 同一个 Consumer Group 内，一个 Partition 只能被一个 Consumer 消费。
* 推论1：如果 Consumer 的数量大于 Partition 数量，则会有 Consumer 是空闲的。
* 推论2：如果 Consumer 的数量小于 Partition 数量，则一个 Consumer 可能消费多个
    Partition。

{% asset_img kafka-partition-consumer.svg Kafka Partition Consumer Relationship %}

左边的 Consumer Group 中的 C4 是空闲的，而右边 Group 中的 C1 则需要消费两个
Partition 。由于 C1 中消息可能来源于两个 Partition，此时如果需要确保消息的顺序
，必须先判断消息的 Partition ID。

在分配 Partition 时，肯定是希望不同的 Consumer 的负载大致相同，具体的分配算法
有 `Range` 的 `RoundRobin` 两种，文末会给出参考资料，这里不再赘述。

## 物理存储

上面提到的 Topic, Partition 都是抽象的概念。每个 Partition 最终都需要存储在物
理机器上，在 Kafka 中一般把这样的物理机器称为 `Broker`，可以是一台物理机，也可
以是一个集群。

在讲概念的时候我们没有考虑到物理机可能会损坏的问题，这会导致某个 Partition 失
效，上面存储的消息丢失，那还说什么高可用？所以一般需要对数据做冗余
(replication)。换言之，需要存储多份 Partition 在不同的 Broker 上，并为它们的数
据进行同步。那么从物理的视角：

{% asset_img kafka-broker.svg Kafka Partition Broker View %}

上图中，某个 Topic 分成了 3 个 Partition，每个 Partition 保存了两个副本，副本
平均分配到 3 个 Broker 上。图中即使有一个 Broker 挂了，剩余的两个 Broker 依
旧能正常工作。这也是分布式系统的常用设计。

同一个 Partition 有多个副本，并分布在不同的 Broker 上，那么 Producer 应该写入
到哪一个副本上呢？Consumer 又应该从哪个副本上读取呢？

1. Kafka 的各个 Broker 需要与 Zookeeper 进行通信，每个 Partition 的多个副本之
   间通过 Zookeeper 的 Leader 选举机制选出主副本。所有该 Partition 上的读写都
   通过这个主副本进行。
2. 其它的冗余副本会从主副本上同步新的消息。就像其它的 Consumer 一样。

## 小结

本文主要是对 Kafka 的基本概念和结构做了简要介绍，总结如下：

1. Topic 是顶级概念，对应于一个消息队列。
2. Kafka 是以 Partition 为单位存储消息的，Consumer 在消费时也是按 Partition 进
   行的。即 Kafka 会保证一个 Consumer 收到的消息中，来自同一个 Partition 的所
   有消息是有序的。而来自不同 Partition 的消息则不保证有序。
3. Partition 会为其中的消息分配 Partition 内唯一的 ID，一般称作偏移量(offset)
   。Kafka 会保留所有的消息，直到消息的保留时间（例如设置保留 2 天）结束。这样
   Consumer 可以自由决定如何读取消息，例如读取更早的消息，重新消费等。
4. Kafka 有 Consumer Group 的概念。每个 Group 独立消费某个 Topic 的消息，互
   相不干扰。事实上，Kafka 会为每个 Group 保存一个偏移量，记录消费的位置。每
   个 Group 可以包含多个 Consumer，它们共同消费这个 Topic。
5. 对于一个 Consumer Group，一个 Partition 只能由 Group 中的一个 Consumer 消费
   。具体哪个 Consumer 监听哪个 Partition 是由 Kafka 分配的。算法可以指定为
   `Range` 或 `RoundRobin`。
6. 物理上，消息是存在 Broker 上的，一般对应为一台物理机或集群。存储时，每个
   Partition 都可以有多个副本。它们会被“均匀”地存储在各个 Broker 中。
7. 对于一个 Partition，它的多个复本存储一般存储在不同 Broker 中，在同一时刻会
   由 Zookeeper 选出一个主副本来负责所有的读写操作。

另外，随着 Kafka 的发展，它的定位已经从“分布式消息队列”变成了“分布式流处理平台
”，添加了 Connector 及 Stream Processor 的概念。只是这些并不改变它的基本概念和
结构。

## 参考

- http://kafka.apache.org/documentation/ 官方文档，非常值得阅读
- http://www.ituring.com.cn/book/tupubarticle/18689 更深入的 Kafka 技术细节
- https://sookocheff.com/post/kafka/kafka-in-a-nutshell/ 图文并茂的 Kafka 教程
- https://www.iteblog.com/archives/2209.html Kafka Partition 分配策略
- https://stackoverflow.com/questions/28574054/kafka-consumer-rebalancing-algorithm/28580363#28580363 SO 上对 Partition 分配策略的讲解
- https://github.com/apache/kafka/blob/trunk/core/src/main/scala/kafka/admin/AdminUtils.scala#L64 Broker 分配策略的源码，有详细解释
- https://blog.csdn.net/dly1580854879/article/details/71023553 kafka Partition 分发策略的源码摘抄
