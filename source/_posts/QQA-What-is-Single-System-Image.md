title: 'QQA: Zookeeper 如何保证单一视图'
toc: true
date: 2019-07-20 17:05:48
tags: [zookeeper]
categories: [QQA]
---

Zookeeper 集群由多个节点构成，写入数据时只要多数节点确认就算成功，那些没有确认
的节点此时存放的就是老数据。Zookeeper 的“单一视图(single system image)”保证说
的是客户端如果读到了新数据，则再也不会读到老数据。如果重新连接连上了老的节点，
怎么能保证不会读到老的数据？

[真相](https://github.com/apache/zookeeper/pull/931#issuecomment-489963241)很
直接很残酷：老的节点会拒绝新客户端的连接。

## zxid

Zookeeper 会为每个消息打上递增的 `zxid`(zookeeper transactioin id)，客户端会维
护一个 `lastZxid`，存放最后一次读取数据对应的 `zxid`，当客户端连接时，节点会判
断 `lastZxid` 是不是比自己的 `zxid` 更大，如果是，说明节点的数据比客户端老，拒
绝连接。

## 参考

- http://zookeeper-user.578899.n2.nabble.com/Consistency-in-zookeeper-td7578531.html
    zookeeper consistency 的讨论，开始了解到单一视图概念的地方
- https://github.com/apache/zookeeper/pull/931#issuecomment-489963241 Github
    的 MR，里面的 comment 回答了单一视图的概念是实现方式
- https://www.cnblogs.com/ucarinc/p/8068409.html 大佬的源码分析，代码层面印证
    上面说的机制
