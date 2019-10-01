title: '复习：TCP 三次握手、四次挥手'
toc: true
date: 2019-09-26 07:48:50
tags: [tcp, handshake, header]
categories: [Notes]
---

最近在学习 HTTP 长连接，发现需要复习一些 TCP 连接的建立、关闭的过程，做些笔记
。

## TCP 报文头

先来看看 TCP 报文头的格式：

{% asset_img TCP-header.svg TCP Header %}

* source port/destination port 分别代表源端口和目标端口
* sequence/acknowledge number 用来标记发送和接收的字节数
* data offset 占 4 位，代表报文头中的字(32位)数，如果没有 options，则为固定值5
* Flags，共 9 位
    * NS、CWR、ECE、URG，不懂
    * ACK，设置了后表示 acknowledge 字段生效
    * PSH，要求将缓存的数据推送给接收方
    * RST，重置连接，比如接收方已经关闭连接，收到迟到的报文，则会重置报文
    * SYN，三次握手第一次，代表同步 sequence number
    * FIN，四次挥手时的结束报文
* Window size，拥塞控制中的窗口大小
* Checksum，校验码，用于传输检测过程中的错误
* Urgent pointer，不懂
* Options，一般在三次握手、四次挥手中用到。不懂

## 三次握手

三次握手过程为：

1. 客户端随机生成一个 sequence number，并发送 SYN 报文到服务端，请求连接
2. 服务端发送 SYN＋ACK，在应答请求的同时，也随机生成一个 sequence id，请求同步
3. 客户端应答，服务端收到应答后双方建立连接。

{% asset_img 3-way-handshake.svg 3-Way-Handshake %}

正如 SYN 标志的含义，三次握手的过程在建立连接的过程中完成了自身初始 sequence
number 的同步。使用随机生成的 sequence number 是为了防止在网络中滞后的报文影响
新建立的连接。

三次握手的重要问题是：为什么要三次？因为信道不可靠。考虑两次握手。假设客户端发
送的第一个 SYN 在网络中滞留了，客户端因此重发 SYN 并建立连接，使用直到释放。此
时滞留的第一个 SYN 终于到了，根据两次握手的规则，服务端直接进入 `ESTABLISHED`
状态，而此时客户端根本没有连接，不会理会服务端发送的报文，白白浪费了服务端的资
源。

事实上，只要信道不可靠，双方永远都没有办法确认对方知道自己将要进入连接状态。
例如三次握手，最后一次 ACK 如果丢失，则只有客户端进入连接状态。四次、五次、多
少次握手都有类似问题，三次其实是理论和实际的一个权衡。

## 四次挥手

要断开连接需要“四次挥手”，可以由客户端发起，也可以由服务端发起，步骤如下：

1. 发起方发送 FIN 报文，代表断开连接
2. 接收方响应 ACK 报文，并在自己发送完未处理的报文后发送 FIN 报文
3. 发起方接收 ACK 报文后等待接收方的 FIN 报文，收到后发送 ACK 报文，自己进入
   TIME_WAIT 状态，等待 2MSL 后关闭连接
4. 接收方收到 ACK 报文，关闭连接

{% asset_img 4-way-handshake.svg 4-Way-Handshake %}

为什么需要 4 次挥手？一般会说因为连接是双方的，每一方关闭连接时需要 FIN+ACK。
因此一共 4 次。而从上图来看，主要是因为接收方发送 ACK 和发送 FIN 之间可能有间
隔，接收方需要等待应用程序处理结束后发送 FIN 报文。如果 ACK+FIN 一起发送，则就
变成三次挥手了。

在做短连接做压测的时候经常会出现大量端口处理 `TIME_WAIT` 状态，导致无端口可用。
为什么需要这个状态？

1. 防止滞后的报文被后续建立的连接接收，因此结束连接前先等待 2MSL 的时间。（MSL
   是最大的报文存活时间，一来一回可以认为与上次连接相关的报文都不在网络中了）
2. 确保接收方已经正确关闭连接，考虑发起方最后一次 ACK 滞留，则接收方一直处于
   `LAST_ACK` 状态，而不会关闭连接。那么此时发送方重新建立连接 SYN，则由于序列
   号不同，处于 `LAST_ACK` 的接收方会响应 `RST` 报文。即连接未正确关闭导致后续
   连接无法建立。

## 状态转换

附一张状态转换图作为参考：

{% asset_img Tcp_state_diagram_fixed_new.svg TCP State Diagram %}

## 参考

- http://intronetworks.cs.luc.edu/current/html/tcp.html
- https://vincent.bernat.ch/en/blog/2014-tcp-time-wait-state-linux 对
    TIME_WAIT 有细致的讲解
- https://en.wikipedia.org/wiki/Transmission_Control_Protocol 维基百科，依旧是
    你最好的朋友
- http://blog.qiusuo.im/blog/2014/03/19/tcp-timeout/ TCP 中的各种超时
