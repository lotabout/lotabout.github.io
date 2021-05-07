title: Linux sysctl 网络相关参数
toc: true
date: 2021-05-01 14:06:23
tags: [tcp, ip, sysctl]
categories: [Notes]
---

本文对
[ip-sysctl.txt](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
中关于 IP 和 TCP 部分的配置做了翻译，同时加了一些个人的理解，旨在见文知义。

（博主不是搞网络的，也不是搞内核的，如有错误请指正）

## IP 未分类

### ip_forward - BOOLEAN

- `0` 代表关闭
- 非 `0` 代表开启。

注：可以简单理解为开启了就是路由器了

### ip_default_ttl - INTEGER

向外发送的 IP 报文（非转发报文）的默认 TTL(Time to Live) 值。

- 范围为 1 到 255
- 默认值 64

注：TTL 即“跳”。当前的实现里，每过一个路由会减少一跳，TTL 为 0 时会被路由器丢
弃。

### ip_no_pmtu_disc - INTEGER

是否关闭路径 MTU 发现功能 (Path MTU Discovery)

- 0: 开启 MTU 发现（默认值 ）
- 1:，代表关闭，此时如果接收到“需要分片”的 ICMP 报文，则会将路径上的 PMTU
    设置成 `min_pmtu`。如果不希望 IP 报文被分片，则需要手工修改系统的`min_pmtu`
- 2: 接收到的路径 MTU 发现消息会被丢弃，发送帧的处理同模式 1
- 3: 为强化的 PMTU 发现模式。（具体功能比较复杂，看不懂）

注：MTU(Max Transmission Unit) 指的是每个网络包的有效载荷，是链路层的概念。以
太网的 MTU 默认是 1500B（注意不包含以太网的包头包尾），但因为它是链路层的概念
，上层的 IP 数据包头部、TCP 数据包头部的长度也要算在内，因此扣除 IP 头部的20B
，以及 TCP 头部的 20B，TCP 包的 payload 也只能是 1460B 了。

路径 MTU 指的是路径上所有 MTU 的最小值，注意 MTU 是有方向的，A -> B 的路径 MTU
不等于 B-> A 的路径 MTU。

路径 MTU 发现依赖两个要素：IP 头中的 DF 标志以及 ICMP 的“需要分片”报文。当 IP
报文设置了 DF 标志，如果某个路由的 MTU 小于报文大小，则因为设置了 DF 标志，路
由会丢弃这个 IP 包，并返回“需要分片” ICMP 报文，报文里会携带路由的 MTU，这样发
送方就可以逐步学习到路径上的最小 MTU（参考 [^path-mtu-discovery]）。

[^path-mtu-discovery]: https://packetlife.net/blog/2008/aug/18/path-mtu-discovery/ 介绍了路径 MTU 的发现方法

### min_pmtu - INTEGER

最小的路径 MTU，默认为 `522`

### ip_forward_use_pmtu - BOOLEAN

默认情况在转发报文时不信任 PMTU 的结果，因为很容易伪造，会导致不需要的分组碎
片。除非上面跑着自己的应用程序需要使用 PMTU，一般不需要。

- 0（默认） 代表不使用 PMTU
- 1 代表使用 PMTU

### fwmark_reflect - BOOLEAN

控制内核产生的 IPv4 包的 fwmark，只对不与端口绑定的包生效，如 TCP RST 报文、
ICMP echo 应答报文。如果选项设置为 `0`，则这些包的 fwmark 被设置为 0,如果选项
设置为 `1`，则这些应答报文的 fwmark 会被设置为它们应答的原报文的值。

注：fwmark 是 firewall mark 的简称。Linux（及其它操作系统）通常允许指定一些规
则（如通过 iptables），将一些符合规则的网络包打上标签，即为 fwmark。fwmark 可
以用在路由的转发规则（基于策略的路由 `ip rule`）中，达到诸如：满足某个条件的包
走哪个网卡的功能。

fwmark_reflect 解决的是这样的问题[^fwmark-reflect-problem]：假设有机器是多网卡
，正常情况下我们需要让包“从哪来到哪去”，于是会使用 fwmark 写规则。除了“从哪来
到哪去”的需求，还会有“不要回答”的需求，例如有人攻击了机器，我们不希望机器回答
如destination port unreachable 的 ICMP 报文，因为这样会透露一些机器的信息。但
是我们希望将这些报文路由到内部的审计端口中，而不是发回原始的端口，有了
fwmark_reflect 就可以方便地对 ICMP 做标记从而做更复杂的路由策略了。

[^fwmark-reflect-problem]: https://blog.csdn.net/dog250/article/details/78301259 详细介绍了 fwmark_reflect 解决的问题

### fib_multipath_use_neigh - BOOLEAN

有多路径的路由下决定下一跳时，是否考虑已经存在的邻居表的状态。如果关闭选项，则
不使用邻居表信息，数据包被定向到的下一跳有可能是不通的。需要在编译内核时开启
`CONFIG_IP_ROUTE_MULTIPATH` 选项时才可使用。

- 0: 关闭（默认）
- 1: 开启

注：与该参数相关的是 ECMP(Equal Cost Multi Path) 功能，是路由里的一项技术。简
单地说，它是一种通过一致性哈希将包发送到一组权重相同的网络设备的方式。虽然边缘
路由器通常不关心包发到哪里，但一般希望同一个 Flow （四元组：源IP/Port、目标
IP/port）的包以相同的路径经过各个设备[^modern-lb]。

注：邻居表[^neighbor-table]存储了当前主机物理连接的主机的地址信息（MAC），
Linux 通过 ARP 协议来管理、更新。

[^modern-lb]: [[译] 现代网络负载均衡与代理导论（2017）](http://arthurchiao.art/blog/intro-to-modern-lb-and-proxy-zh/)
[^neighbor-table]: https://www.cs.unh.edu/cnrg/people/gherrin/linux-net.html#tth_sEc8.2.1 邻居表结构

### fib_multipath_hash_policy - INTEGER

ECMP 使用的哈希算法，内核编译时开启了 `CONFIG_IP_ROUTE_MULTIPATH` 选项才生效。

- 0 - L3 (source and destination addresses plus flow label) 默认值
- 1 - L4  (standard 5-tuple)
- 2 - Layer 3 or inner Layer 3 if present

注：在 ECMP 中，要对一个包进行负载均衡，做哈希时会依赖多种信息[^ECMP-hash]:

- L3: 指 IP 层，会使用如下信息做哈希
  ```
  {source address, destination address}
  ```
- L4: 指 TCP/UDP 层，会使用如下信息做哈希
  ```
  {source address, destination address, protocol, source port, destination port}
  ```
- IPv6 L3: 会使用如下信息做哈希，IPv6 因为有 Flow Label，所以 L3 也可以达到 L4
    的效果
  ```
  {source address, destination address, flow label, next header (protocol)}
  ```

[^ECMP-hash]: https://lwz322.github.io/2019/11/03/ECMP.html 简单描述了 ECMP 的
  哈希方式

### fib_sync_mem - UNSIGNED INTEGER

在 synchronize_rcu 被强制触发前可用于存储 fib 条目的脏内存

- 默认值 512KB
- 最小值 64KB
- 最大值 64MB

注：RCU[^what-is-rcu] 可以理解成内核的一个读写锁机制，它将“更新”操作分解成“移
除”和“清理”两个步骤。例如一个指针 P，现在指向 A，要更新成指向 B，则会先将 P 置
为 NULL，此时不会有新的读者引用 A，再等待老的引用了 A 的读者退出，此时可以清理
A 对应的资源，再将 P 指向 B。`synchronize_rcu` 指的是该机制中等待已有读者退出
的 API。

[^what-is-rcu]: https://www.kernel.org/doc/Documentation/RCU/whatisRCU.txt 介
  绍了内核 RCU 的概念

### ip_forward_update_priority - INTEGER

转发一个 IPv4 的包后，是否要用 IP 头中的 TOS 字段来更新 SKB 优先级。新的 SKB
优先级通过 `rt_tos2priority` 映射表获得（参见 `man tc-prio`）

- 0: 不更新优先级
- 1: 更新优先级（默认）

注：SKB 指的是 socket buffer，SKB 结构中有个字段 `priority` 用来指定报文在
outgoing 队列的优先级。而 TOS[^tos-wiki] 是 IP 协议中用来指定 IP 报文优先级的
字段。因此该选项相当于是指定在转发 IP 报文时，要不要支持 TOS 功能。

[^tos-wiki]: https://en.wikipedia.org/wiki/Type_of_service

### route/max_size - INTEGER

内核中允许的最大路由条数。如果使用了大量的网卡或加了很多路由项，则考虑加大该
参数。从 3.6 开始，对 ipv4 该参数不再推荐使用，因为不再使用路由缓存。

### neigh/default/gc_thresh1 - INTEGER

最小保存条数。当邻居表中的条数小于该数值，则 GC 不会做任何清理

- 默认值 128

### neigh/default/gc_thresh2 - INTEGER

高于该阈值时，GC 会变得更激进，此时存在时间大于 5s 的条目会被清理

- 默认值 512

### neigh/default/gc_thresh3 - INTEGER

允许的最大临时条目数。当使用的网卡数很多，或直连了很多其它机器时考虑增大该参
数。

- 默认值：1024

### neigh/default/unres_qlen_bytes - INTEGER

对每个未解析的地址，所有排队报文允许占用的最大字节数。（Linux 3.3 新增）。负
值无效且返回错误。

- 默认值：`SK_WMEM_MAX`（与 `net.core.wmem_default` 相同）

  具体值随架构和内核版本有变化，一般需要能允许中等大小的 256 个报文排队

### neigh/default/unres_qlen - INTEGER

对每个未解析的地址，允许排队的最大报文数。（Linux 3.3 不推荐使用）：建议用新的
`unres_qlen_bytes` 参数，Linux 3.3 之前默认参数为 3，有时会有意料之外的包丢失
，现在的值是通过 `unres_qlen_bytes` 和真实的包大小计算得到的。

### mtu_expires - INTEGER

缓存的 PMTU 信息过期时间，秒

### min_adv_mss - INTEGER

通告 MSS（Advertised MSS）由第一跳路由的 MTU 决定，但不能小于这个值。

## IP 分片

### ipfrag_high_thresh - LONG INTEGER

重组 IP 分片时使用的最大内存

注：一旦用尽，分片处理程序会丢弃分片，直到 ipfrag_low_thresh。

### ipfrag_low_thresh - LONG INTEGER

(linux-4.17 开始弃用) 重组 IP 分片使用的内存下限，超过该值后内会通过移除不完整
的分片队列来释放资源。过程中内核依旧会接收新的分片。

### ipfrag_time - INTEGER

一个 IP 分片在内存中保留的最大时间，秒

### ipfrag_max_dist - INTEGER

该参数定义了同一个 IP 源的数据分片所允许的最大“失序程度”。IP 分片乱序到达的情
况并非不常见，但如果从某个源 IP 上已经收到了许多分片，而其中的某个分片队列的分
片还不完整，则多半该队列中的一片或多片数据已经丢失了。`ipfrag_max_dist` 为正时
，分片在加入重组队列前会做一个额外的检查：如果某个队列两次加入新分片期间，来自
某个源 IP 的分片数量超过了 `ipfrag_max_dist` ，则认为该队列的某些分片已经丢失
，现有的队列会被丢弃，被替换成了一个新队列。`ipfrag_max_dist` 为`0`时关闭该检
查。

如果该值过小，如 `1` 或 `2`，则正常的重排序现象也会引发不必要的队列丢弃，进而
导致性能下降；而过大的值，如 `50000` 则会导致不同 IP 数据报文的分片错误重组在
一起的可能性，导致数据出错。

- 默认值：64

注：TCP/IP 详解一书中提到，一般 TCP 会尽量通过设置 MSS 来使底层的 IP 报文不分片。

## INET peer 存储

注：INET peer 是 IP 层的实现概念。与本机有交互的主机就叫 IP peer。出于性能的考
虑，Linux 会为每个主机保存一些 IP 相关的信息，其中最重要的是 IP 的数据包 ID
(packet ID) [^ULNI-chap23]。

[^ULNI-chap23]: 参考书 Understading Linux Network Internal 第 23 章

### inet_peer_threshold - INTEGER

允许的最大存储的估计值。当存储大于该阈值后，系统会激进地丢弃 peer 条目。该阈值
同时也决定了 peer 条目的 TTL 以及两次 GC 的时间间隔。条目数据越多，TTL 越短，
GC 越频繁。

### inet_peer_minttl - INTEGER

条目的最小 TTL。在 IP 报文重组端，要保证大于分片的 TTL。当条目池使用的存储小
于 `inet_peer_threshold` 时，则该最小的 TTL 是系统能保证满足的，如果超过阈值
则可能被提前回收。单位为秒。

### inet_peer_maxttl - INTEGER

条目的最大 TTL。在没有内存压力的前提下，没被使用的条目超过该时间就会失效。单
位为秒。

## TCP 变量

- 参考：https://man7.org/linux/man-pages/man7/tcp.7.html

### somaxconn - INTEGER

socket API `listen` 允许设置的积压（backlog）。默认值为 `4096`（Linux 5.4 之前
为 `128`）。更多的关于 TCP socket 调参，也可以参考 `tcp_max_syn_backlog`

注[^backlog]：

- 该值是在 `listen` 中不设置 backlog 时的默认值，而 `tcp_max_syn_backlog` 是
  上限。
- 这是个常调的参数。TCP 三次握手的 server 端有两个队列，一个是 syn queue，存
  储接收到第一次握手 SYN 连接（SYN_RECV）信息，当第三次握手 ACK 到来时，会将连
  接信息从 syn queue 移到 accept queue，等待调用 `accept()` 取走连接信息，
  这里设置的是 accept queue 的大小。
- 当第三次握手 ACK 到来，在尝试将连接从 syn queue 移动到 accept queue 时，如果
  accept queue 满了，则会完全忽略该 ACK，server 一段时间认为还没收到 ACK，会重
  发SYN+ACK，client 会重发 ACK。
- 当 accept queue 满了，即使 syn queue 没满，新的 SYN 也会被忽略

在 Linux 中的术语中，SYN queue 一般称为 SYN backlog，accept queue 就称为
accept queue。为什么 `socket` 选项的参数称为 `backlog` 呢？猜想 socket API 是
BSD 风格的，而在 BSD 风格的实现中，并没有两个 queue。

[^backlog]: [How TCP backlog works in
  Linux](http://veithen.io/2014/01/01/how-tcp-backlog-works-in-linux.html) 详
  细描述了 Linux backlog 的机制

### tcp_abort_on_overflow - BOOLEAN

如果用户程序调用 accept 的速度太慢，新的连接没法被及时 accept，则重置连接（通
过发送 RST）。该值默认为 False，意味着如果瞬时涌入了大量连接，server 会等待负
载（accept 能力）慢慢恢复。**只有**在你真的确认用户程序没法更快 accept 连接的
时候才设置成 True。设置这个参数可能会损害 client（如虽然服务还在，只是负载高，
但 client 认为服务不存在）

注：这里和在 [somaxconn](#somaxconn-integer) 中提到的 accept queue 满了有关，
当接到 ACK 时队列满了，默认情况下是完全忽略该 ACK，这样 server 认为在一段时间
内没有收到 ACK，会重发 SYN+ACK，client 重发 ACK，server 接收第二个 ACK 时如果
accept queue 又有空间了，就能恢复连接。如果 `tcp_abort_on_overflow` 设置成
True 且发生接到 ACK 时 accept queue 满的情况，则会直接重置连接。

### tcp_adv_win_scale - INTEGER

指定计算缓冲 Overhead 的方式：如果 `tcp_adv_win_scale > 0` 则为
`bytes/2^tcp_adv_win_scale` 否则为`bytes - bytes/2^(-tcp_adv_win_scale)`。

- 默认值：1（低版本默认值是 2）
- 可选值：[-31, 31]

注：所谓的缓冲 overhead 指的是[^receive-cache-and-buffer]：正常一个 TCP 的报文
，除了包中的数据(payload)外，还会有 TCP 头、IP 头、以太头等；此外内核在存储报
文时，还会有 `sk_buff` 和 `skb_shared_info` 等开销。因此在 TCP 层计算通告窗口
时，需要把这部分排除在外。注意的是 `tcp_adv_win_scale` 的实际作用其实是指定数
据和额外开销的比例的，和 [tcp_app_win](#tcp-app-win-integer) 区分开。

[^receive-cache-and-buffer]: [关于Linux TCP接收缓存以及接收窗口的一个细节解析](https://zhuanlan.zhihu.com/p/299513070 ) 有对 tcp_adv_win_scale 机制的详细描述，强推

注：[man 7 tcp](https://man7.org/linux/man-pages/man7/tcp.7.html) 中提到 socket
的缓冲区分为内核部分和应用部分，其中内核部分用来维护 TCP Window，应用部分的作
用是“used to isolate the network from scheduling and application latencies”，
具体指的应该是上面说的 `skb_shared_info` 结构，对 TCP 本身没什么用，但对其它模
块有用。

### tcp_allowed_congestion_control - STRING

设置允许普通进程(non-privileged process)使用的拥塞控制算法。这个参数的值阈是
`tcp_available_congestion_control` 参数的子集。默认值为 "reno" 加上
`tcp_congestion_control` 参数设置的算法。

注：可以通过 `setsockopt` API 的 `TCP_CONGESTION` 参数为某个连接单独设置拥塞控
制算法。

### tcp_app_win - INTEGER

保留 `max(window/2^tcp_app_win, mss)` 大小的缓冲作为用户缓冲（参考
[tcp_adv_win_scale](#tcp-adv-win-scale-integer)）。当值为 `0` 时有特殊含义，代
表不保留。

- 默认值：31

注：在 TCP 初始化
([tcp_init_buffer_space](https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_input.c#L504))
缓冲时会为 application 预留一些空间，即由该值指定。与
[tcp_adv_win_scale](#tcp-adv-win-scale-integer) 不同的是，`tcp_adv_win_scale`
是用来指定 overhead 在计算时的比例的，在初始化时，在窗口增长时都会用到，但
`tcp_app_win` 只会在初始化时用到。

### tcp_autocorking - BOOLEAN

是否开遍 TCP auto corking: 当应用程序连续调用 `write()/sendmsg()` 系统调用写入
小量数据，内核会尽量将这些调用合并，减少需要发送的数据包数量。当同一个流(flow)
至少有一个之前的数据包在 Qdisc 队列或设备发送队列中等待时才会做合并。选项开启
的情况下，应用层依旧可以使用 `TCP_CORK` 选项来决定是否启用合并功能。

- 默认值：1（开启）

注：Qdisc 队列指的是 Queueing Discipling 队列，是 IP 协议栈与驱动队列之间的队
列，实现的是 Linux 内核的流量管理功能，包括流量分类、优先级排序和整流功能
[^queues-in-linux]。

[^queues-in-linux]: [Linux网络栈中的队列](http://cxd2014.github.io/2016/08/16/linux-network-stack/)

### tcp_available_congestion_control - STRING

只读选项，列出可用的拥塞控制算法。

### tcp_base_mss - INTEGER

MTU 探测中 `search_low` 的初始值，在开启 MTU 探测时，同时作为连接的初始 MSS 值
。

- 默认值：512

注：这里的 MTU 探测（PLPMTUD packetization layer Path MTU discovery，又称 MTU
Probing） 与前文的路径 MTU 发现（PMTUD）不太一样，PMTUD 发现依赖 ICMP需要分片
的报文来确认 MTU 大太，可以理解成是 IP 层的。现在出于安全性问题，很多设备会禁
用 ICMP 报文，PLPMTUD 是由 [RFC4821](https://tools.ietf.org/html/rfc4821) 引入
，尝试解决没有 ICMP 报文情况下的 MTU 发现。简单地说，在 TCP 层实现的话，依赖的
是 TCP 的超时机制来确认包丢失，在开启 SACK 机制的情况下也会利用 SACK 信息。

注：PLPMTUD 也有自己的问题[^ip-fragmentation-is-flawed]，如容易把拥塞控制相关
的丢包划分为 MTU 问题，长期运行时最终使用的 MTU 值可能较小；同时没有为 IPv6 实
现相关功能。

[^ip-fragmentation-is-flawed]: [Broken packets: IP fragmentation is flawed](https://blog.cloudflare.com/ip-fragmentation-is-broken/) 介绍了四种 PMTU 失效的情形

### tcp_mtu_probe_floor - INTEGER

开启 MTU 探测时，该参数限定允许 `search_low` 到达的最小值。

- 默认值：48

注：该参数是 Linux 5.4 由这个
[commit](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=c04b79b6cfd714144f6a2cf359603d82ee631e62)
加入。commit 中解释了如果因为丢包严重，会导致 MTU “卡” 在 `48` 上（之前的默认值
），现在加了个参数可供调整。

注：为什么之前默认值是 `48`？因为 [IPv4](https://tools.ietf.org/html/rfc791)指
出 "Every internet module must be able to forward a datagram of 68 octets
without further fragmentation"，即 IP 设备至少应该支持 68B，扣除 20B 的 TCP 头
，得到最小支持 48B MSS。

### tcp_min_snd_mss - INTEGER

TCP 的 SYN 和 SYNACK 报文通常会携带 ADVMSS 选项，来通告 MSS 信息，如果通告的
MSS 小于 `tcp_min_snd_mss`，则 Linux 会偷偷地将 MSS 提高到 `tcp_min_snd_mss`
的值。

- 默认值：48

### tcp_congestion_control - STRING

设置新连接的拥塞控制算法，保底的算法是 "reno"，总是可用，其它可选的算法得看内
核的配置。对于 passive 连接（即对 server）来说，新连接会继承 listener 通过
`setsockopt(listenfd, SOL_TCP, TCP_CONGESTION, "name" ...)` 配置的算法。

- 默认值是在内核中配置时设置的

### tcp_dsack - BOOLEAN

开启 DSACK(duplicate SACK).

- 默认值：1 开启

注：SACK 指的是 selective ACK，允许在 ACK 时通过 TCP 选项指定接收到了哪些乱序
包，这样发送方能更有针对性的重传可能丢失的包。基本的 SACK 没有指定接收到重复报
文时做何处理，DSACK 就是这基础上的扩展，它允许发送包含小于或等于累积 ACK 的
SACK 块，这样重复块的信息也可以通过 SACK 传递。当然 DSACK 也有自己的一些问题，
这里不展开。

### tcp_early_retrans - INTEGER

是否开启 TLP(Tail loss probe) 机制。注意 TLP 机制需要 RACK 机制才能正常工作（
参见下文的 [tcp_recovery](#tcp-recovery-integer)）。

- 默认值：3
- 可选值：
    - 0：关闭
    - 3 或 4：开启

注：默认情况下，TCP 在检测到 3 次重复 ACK（dupack，和 DSACK 是两个事）后触发快
速重传，即不等超时就重传某个包。当接收方在接到失序报文会对已有的包 ACK 发送重
复的 ACK（如收到 #1 发送 ACK-1，收到 #3 会发送 ACK-1，对 #1 ACK 了两次）。但是
对于尾包丢失，由于后面没有其它包，则无法触发重复 ACK，也无法触发快速重传。

注[^tlp]：TLP 会发送一个 loss probe 包，来产生足够的 SACK/FACK 的信息来触发 fast
recovery。根据 Google 的测试，TLP 能够有效的避免较长的 RTO 超时，进而提高TCP性
能。

[^tlp]: [TCP Tail Loss
  Probe(TLP)](http://perthcharles.github.io/2015/10/31/wiki-network-tcp-tlp/)
  文章对 TLP RFC 有详细解读


### tcp_ecn - INTEGER

用来控制 TCP 使用的 Explicit Congestion Notification (ECN) 机制。ECN 只有在
TCP 连接双方协商支持时才启用。这个功能允许路由在丢包之前就通知有拥塞的存在，
以此来减少因为真正拥塞导致的丢包。

- 可选值：
    - 0: 关闭 ECN，不主动开启也不被动响应
    - 1: 开启 ECN，主动开启，被动响应
    - 2: 开启 ECN，不主动开启，被动响应
- 默认值：2

注[^wiki-ecn]：ECN 需要 TCP 和 IP 的支持，TCP 连接建立时协商是否使用 ECN。如果开启，则当
中间路由遇到拥塞时，会修改 IP 头中的 TOS 字段的最右两位，置为拥塞。接收方需要
使用 TCP 头中的 ECE 标记回传这个拥塞信息。当某一方接收到 TCP 报文带有 ECE 位时
，会减少拥塞窗口，同时设置 CWR 位来确认阻塞指示。当然还有一些其它机制来保证安
全性。

[^wiki-ecn]: [Wiki: 显式拥塞通知](https://zh.wikipedia.org/wiki/显式拥塞通知)

### tcp_ecn_fallback - BOOLEAN

如果内核检测到 ECN 连接工作不正常，则会回退到非 ECN 模式。当前该选项实现了
RFC3168 第 6.1.1.1. 节中的内容，但不排除未来也会在该选项下实现其它检测算法的可
能性。如果 [tcp_ecn](#tcp-ecn-integer) 选项或单个路由的 ECN 功能关闭时该选项不
生效。

- 默认值：1 开启回退

### tcp_fack - BOOLEAN

开启 TCP FACK(Forward Acknowledgement) 支持。选项废弃了，新版内核不再生效。

注[^paper-fack]：FACK 是拥塞控制中快速恢复（Fast Recovery）阶段相关的机制，它
主要解决有多个报文丢失的情况下，通过准确估计（当前连接）还在网络中传输的报文大
小，在恢复阶段做出精确的拥塞控制。计算的方式如下：

* 记录 SACK 的最大序号数为 `snd.fack`
* 定义 awnd 代表正在网络中传输的数据：`awnd = snd.nxt - snd.fack`，这里假设了
    不存在乱序报文
* 在重传时，awnd 要加上重传的数据：`awnd = snd.nxt - snd.fack + retran_data`

于是在拥塞时，cwnd 会根据算法改变，此时为了充分利用带宽，可以使用如下方法控制
包的发送：

```
while (awnd < cwnd)
    sendsomething()
```

该方法比起 Reno 通过接收到的 dupack 数量来调整 cwnd 值更为精确。对于快速恢复的
触发也有变化：

正常 Reno 算法会在 `dupacks == 3` 时触发快速恢复，如果丢失多个包，则 ACK 数量
也随之减少，导致等待重传的时间变长，而 FACK 额外增加了一个触发条件：`(snd.fack
– snd.una) > (3*MSS)`，即假设没有乱序包的情况下，如果该条件成立，则说明网络中
丢失了 3 个包，等价于 `dupacks == 3`，可以触发重传和快速恢复。

[^paper-fack]: http://conferences.sigcomm.org/sigcomm/1996/papers/mathis.pdf
  FACK 论文

注：在 Linux 4.15[^linux-newbies-4.15] 中移除了 FACK 的支持，使用 RACK 机制替
代。

[^linux-newbies-4.15]: https://kernelnewbies.org/Linux_4.15

### tcp_fin_timeout - INTEGER

孤儿连接（orphaned connection，指不再被任何应用使用的连接）在 `FIN_WAIT_2` 状
态中等待的时间，超时后在本地会被丢弃。虽然 `FIN_WAIT_2` 完全是合法的 TCP 状态
，但如果另一端已经挂了，如果没有超时机制，则会永远等待下去。

- 默认值：60 秒

注：TCP 四次挥手包含两轮协商，分别包含双方的 FIN+ACK，本地的 FIN+ACK 结束后即
进入 FIN_WAIT_2，等待另一方的 FIN。不能永远等待另一方的 FIN。

### tcp_frto - INTEGER

开启 F-RTO (Forward RTO-Recovery) 支持。F-RTO 在 RFC5682 中定义，它是 TCP 重传超时的一
个增强算法，能更好地处理 RTT 经常波动的情况（如无线网）。F-RTO 仅需要发送端做
修改，不需要接收端的任何支持。

- 0: 关闭 F-RTO
- 1: 开启 F-RTO 的基础算法
- 2: 如果一条流使用了 SACK，则开启 SACK 增强的 F-RTO 算法。默认值。

注[^f-rto]：RTO 解决的是虚假重传的问题，由于链路的 RTT 波动太大，导致发送方还
没来得及接收 ACK 就触发了 RTO 超时重传。F-RTO 是一种发送端的无效 RTO 超时重传
检测方法。在 RTO 超时重传了第一个数据包之后，F-RTO 会检测之后收到的 ACK 报文来
判断刚刚的超时重传是否是虚假重传，然后根据判断结果决定是接着进行重传还是发送新
的未发送数据。

[^f-rto]: [TCP系列24—重传—14、F-RTO虚假重传探测
  ](https://www.cnblogs.com/lshs/p/6038603.html) 大佬的博客有很多 TCP 相关的内
  容，值得深挖，这篇讲的是 F-RTO

### tcp_fwmark_accept - BOOLEAN

开启选项时，如果连接某个 listening socket 的连接没有设置 socket mark，则会将
accepting socket 的 mark 设置成传入的 SYN 报文的 mark。这会导致该连接的后续所
有报文（从 SYNACK 开始）都会被打上对应的 fwmark。当然 listening socket 的 mark
保持不变。同时如果 listening socket 已经通过 `setsockopt(SOL_SOCKET, SO_MARK,
...)` 设置了 mark，则不受该选项影响。

- 默认值：0 不开启

注：基础知识：Server 端有两种 socket，一种是诸如 80 端口这样的监听端口
(listening socket)，客户端会连接服务端的 listening socket，当服务端 accept 时
，会在在服务端为该连接赋予一个 accepting socket，后续连接通过 accepting socket
通信。

注：fwmark 相关内容在 [fwmark_reflect](#fwmark-reflect-boolean) 中有介绍，
`tcp_fwmark_accept` 用来实现“哪来回哪去”的功能。

### tcp_invalid_ratelimit - INTEGER


限制响应无效报文的重复 ACK 的最大速率，报文无效的判定：

1. 序列号在当前窗口范围之外
2. ACK 号在当前窗口范围之外
3. PAWS（序号回绕检查：Protection Against Wrapped Sequence numbers）检查失败

这个选项有助于缓解简单的 "ack loop" 的 DoS 攻击，一些怀有恶意的中间设备会尝试
以某些方式修改 TCP 报文头，让连接的某一方认为另一方在发送错误的 TCP 报文，导致
为这些错误报文无止境地发送重复 ACK。

- 0: 关闭速率限制，其它值代表两次无效报文重复 ACK 间的间隔（毫秒）
- 默认值：500 毫秒

### tcp_keepalive_time - INTEGER

当 keepalive 开启时，等待多长时间开始发送 keepalive 消息

- 默认：7200（2 小时）

注[^tcp-ip-illustrated-chp17]：keepalive 是 TCP 的保活机制，严格来说并不是 TCP 规范中的内容。这个机制一般
是为服务器的应用程序提供，希望知道客户主机是否崩溃或离开。保活探测报文为一个空
报文段（或只包含一个字节），它的序列号等于对方主机发送的 ACK 报文的最大序号减
1, 因为这一序号的数据已经被成功接收，因此对接收方没有影响，而返回的响应可以确
定连接是否还正常工作。

[^tcp-ip-illustrated-chp17]: 参考《TCP/IP 详解卷一》的第 17 章

### tcp_keepalive_probes - INTEGER

判定连接失效前，发送的保活探测报文的数量，默认值为 9.

### tcp_keepalive_intvl - INTEGER

保活探测报文发送间隔。乘于 `tcp_keepalive_probes` 就等于探测触发到关闭连接之间
的时间。

- 默认值：75（秒），即链接会在重试约 11 分钟后被关闭

### tcp_l3mdev_accept - BOOLEAN

开启该选项允许子 socket 继承 L3 master device 的索引号。即允许有一个“全局”的
listen socket，能监听所有的 L3 master 域（即监听所有的 VRF 设备），通过该
listen socket 建立的连接会被绑定在连接创建时使用的 L3 域上。只有当内核编译时加
上 `CONFIG_NET_L3_MASTER_DEV` 选项才可用。

- 默认值：0（关闭）

注：L3 master device(L3mdev) 是内核为了支持 VRF(Virtual Routing Forwarding) 而
添加的功能，但本身是独立于 VRF 存在的。L3 指的是网络栈第 3 层：网络层。可以把
L3mdev 理解成虚拟的网卡，不过只在 L3 层生效，它有独立的路由表。

### tcp_low_latency - BOOLEAN

如果开启该选项，则 TCP 做决定时会倾向于低延时而非高吞吐。如果关闭选项，则倾向
高吞吐。Linux 4.14 开始，该选项依旧存在，但会被忽略。

### tcp_max_orphans - INTEGER

最大的孤儿连接，孤儿连接指的是不与任何用户文件描述符绑定的 TCP socket 但仍归系
统管理中。如果孤儿连接超过了该选项的值，则连接会被立马回收并打出警告信息。这个
选项的目的是防止简单的 DoS 攻击，我们不应该去依赖这个行为或者人为减小该值。反
之在默认值无法满足网络条件需要时增大它。注意每个孤儿连接会消耗约 64K 的不可
swap的内存。

默认初始值等于内核参数 `NR_FILE`，默认值会随着系统内存调整。

### tcp_max_syn_backlog - INTEGER

SYN 队列中允许的最大连接数，具体来说是处于 SYN_RECV 状态的连接，这个状态代表还
没有收到三次握手中最后一个 ACK 的连接。这个限制是针对单个 listener 的。对内存
少的机器默认值是 128, 对内存多的机器来说会对应增加。如果机器的负载比较大，可以
尝试增大该值。同时也别忘了看看 [somaxconn](#somaxconn-integer) 参数。另外一个
SYN_RECV 状态的 socket 占用大概 304B 内存。

注：如果实际连接数超过了该值，内核就会开始丢弃连接。

### tcp_max_tw_buckets - INTEGER

系统同时允许存在的处于 TIME_WAIT 状态的 socket 最大数量。如果实际数量超过了该
值，则会立即回收 TIME_WAIT socket 并打印警告信息。和
[tcp_max_orphans](#tcp-max-orphans-integer) 一样，该参数也是用于防范一些简单的
DoS 攻击，我们不应该去减少这个值，在网络需要的情况下可以适当增加该值。

注：和 TIME_WAIT 有关的还有个参数 `tcp_tw_recycle` 是用来快速回收处于
TIME_WAIT 状态的连接的，在 Linux 4.11 之后也被废弃了。


### tcp_mem - vector of 3 INTEGERs: min, pressure, max

包含 3 个值：
- min: 使用内存在 `min` 页之下时，TCP 不关心内存使用
- pressure: 当 TCP 分配的内存超出了 `pressure` 页，则会减少它的内存占用，进入
    pressure 模式，直到分配的内存小于 `min` 时退出
- max: 所有 TCP socket 队列允许使用的最大内存

默认值在启动时根据系统的内存进行推断。

### tcp_min_rtt_wlen - INTEGER

Linux 会用一个带窗口的 filter 去计算连接的最小 RTT，该参数控制窗口的大小。更小
的窗口意味着对 RTT 变化更敏感，如果最小 RTT 在变大，更小的窗口能更快应用更大的
最小 RTT。反之窗口超大，就更能抵抗短时间内的 RTT 膨胀，例如由拥塞引起的 RTT 变
大。单位是秒。

- 默认值：300 (5min)
- 可选值：0 ~ 86400 (1 day)

注：这个算法的实现可以在这个讨论中找到：[tcp: track min RTT using windowed
min-filter](https://patchwork.ozlabs.org/project/netdev/patch/1445057867-32257-3-git-send-email-ycheng@google.com/)

### tcp_moderate_rcvbuf - BOOLEAN

如果开启，则 TCP 会自动调整接收缓存的大小，在不超过 `tcp_rmem[2]` 的前提下，尽
量达到该连接满吞吐的要求。默认开启。

### tcp_mtu_probing - INTEGER

是否开启 MTU 探测功能（即 PLPMTUD Packetization-Layer Path MTU Discovery）。

- 0: 关闭（默认值）
- 1: 默认关闭，在检测到 IMCP 黑洞问题时开启
- 2: 始终开启，使用 [tcp_base_mss](#tcp-base-mss-integer) 作为初始值

注：PLPMTUD 机制在 [tcp_base_mss](#tcp-base-mss-integer) 做了简单介绍

### tcp_probe_interval - UNSIGNED INTEGER

控制开始 PLPMTUD 重新检测的时机，默认是每 10 分钟重新检测，由
[RFC4821](https://tools.ietf.org/html/rfc4821) 规定。

### tcp_probe_threshold - INTEGER

控制 PLPMTUD 何时停止探测，如果最终搜索范围的间隔小于某个数字时停止，默认值是
8 字节。

### tcp_no_metrics_save - BOOLEAN

默认情况下，当一个连接关闭时，TCP 会在 route cache 中记录一些连接相关的指标，
这些指标在随后建立的新连接中可以被当作初始条件使用。通常这种做法会提高整体的性
能，但有一些特殊情况下也可能会降低性能。如果这个开关开启，则关闭连接时**不会**
记录指标。

### tcp_no_ssthresh_metrics_save - BOOLEAN

控制 TCP 是否将 ssthresh 记录在 route cache 中，默认值是 1 代表不记录。

注：`ssthresh` 是拥塞控制中，慢启动的阈值，窗口超过阈值后进入拥塞避免。

### tcp_orphan_retries - INTEGER

该值影响的是本地已关闭但超时重传还没有被 ACK 的 TCP 连接的超时。更多信息参考
[tcp_retries2](#tcp-retries2-integer)。

默认值是 8，如果你的机器是一个高负载的 WEB 服务器，可以考虑调低该值，因为这样
的 socket 可能占用不少资源，同时参考
[tcp_max_orphans](#tcp-max-orphans-integer)

### tcp_recovery - INTEGER

这个值是一个 bitmap，用来开启一些还在实验的丢包恢复的功能

- `0x1`，（默认）为丢包重传和丢尾包的情况开启 RACK 丢包检测，对 SACK 连接来说，它已经
  包含了 [RFC6675](https://tools.ietf.org/html/rfc6675) 的恢复并且禁用相关功能
- `0x2`，使用静态的 RACK 重排序窗口，置为 (min_rtt/4)
- `0x4`，不使用 RACK 的启发式 DUPACK 阈值

注：RACK[^rfc-rack] 全称 (Recent ACK)，作用是在快速发现并重传那些曾经重传后再次丢失的数据
包，旨在替代 DUPACK 等重传机制。传统的一些重传机制依赖计算 ACK 包的数量，包括
DUPACK，FACK 等，在很多情况下这个方法不可靠。于是 RACK 使用的是基于超时的算法
（通过时间戳和 SACK 信息），RACK 会维护一个窗口，当 ACK 到来时，RACK 会将窗口
中“过期”的包标记为“丢失”，进行重传，而对于“未过期”的包，有可能丢失也有可能是乱
序，会等到超时后再处理。

[^rfc-rack]: RFC: https://tools.ietf.org/html/draft-tcpm-rack-00

### tcp_reordering - INTEGER

TCP 重排序级别的初始值，TCP 协议栈会动态地在初始值和
[tcp_max_reordering](#tcp-max-reordering-integer) 之间做调整。一般不要改默认值
。

- 默认值：3

注[^tcp-variables-reordering]：该参数的含义是告诉内核，重排序的情况有多严重，
这样内核就会假设数据包发生了重排序而不是丢了。如果 TCP 认为丢包了，则会进入慢
启动，因为它会认为包是因为链路上的拥塞而丢失的。同时如果内核在使用 FACK 算法，
也会回退到普通算法。

[^tcp-variables-reordering]: [TCP
  Variables](https://www.frozentux.net/ipsysctl-tutorial/chunkyhtml/tcpvariables.html)
  中对 tcp_reordering 的含义做了更详细的解释

### tcp_max_reordering - INTEGER

TCP 数据流中最大的重排序级别。默认值为 300，是一个比较保守的值，如果链路使用了
per packet 的负载均衡（例如 bounding rr 模式），则可以考虑增加该值的大小。

### tcp_retrans_collapse - BOOLEAN

开启后，在重传时会试图发送满大小的包。这是对一些有 BUG 的打印机的绕过方式。

- 默认：开启

### tcp_retries1 - INTEGER

该值决定了经过多少次 RTO 超时重传没被 ACK 后，TCP 向 IP 层传递“消极建议”（如重
新评估当前的 IP 路径）。参考 [tcp_retries2](#tcp-retries2-integer)。

[RFC1122](https://tools.ietf.org/html/rfc1122) 推荐至少等待 3 次重传，这也是默
认值。

### tcp_retries2 - INTEGER

该值决定了在多少次 RTO 重传仍未得到 ACK 后，TCP 将放弃该连接。给定值为 N，假设
TCP 使用的是指数回退机制，初始 RTO 为 `TCP_RTO_MIN`，则连接会重传 N 次，第
(N+1) 次 RTO 时放弃连接。

默认值是 15，按上面的逻辑，关闭前会有 924.6s 的超时，它也是合理超时的一个下界
。TCP 在超过该时间后的第一个 RTO 超时时放弃该连接。

[RFC1122](https://tools.ietf.org/html/rfc1122) 推荐至少等待 100s，对应该值至少
为 8.

注[^tcp-ip-illustrated-chp14-2]：逻辑上来说，TCP 有两个值 R1 和 R2 来决定如何
重传同一个报文。R1 表示 TCP 在向 IP 层传递“消极建议”（如重新评估当前的 IP 路径
）之前，愿意重传的次数。R2（大于 R1）指示 TCP 应该放弃当前连接的时机。R1 对应
的[tcp_retries1](#tcp-retries1-integer)，R2 对应
[tcp_retries2](#tcp-retries2-integer)。

[^tcp-ip-illustrated-chp14-2]: 参考《TCP/IP 详解卷一》的第 14.2 章

### tcp_rfc1337 - BOOLEAN

如果开启了，则 TCP 协议栈的行为会符合
[RFC1337](https://tools.ietf.org/html/rfc1337)，如果不开启，则行为不符合 RFC
的描述，但依旧会防止暗杀 TIME_WAIT 的连接。

- 默认值：0

### tcp_rmem - vector of 3 INTEGERs: min, default, max

这个选项包含 3 个值：

- min，默认 4K。代表 TCP socket 接收缓冲的最小值。即使在内存紧张的情况下也会得
    到保证
- default，默认 87380B，TCP socket 接收缓冲的初始值，该参数会覆盖其它协议设置
    的 `net.core.rmem_default` 值。在
    [tcp_adv_win_scale](#tcp-adv-win-scale-integer) 为默认值，
    [tcp_app_win](#tcp-app-win-integer) 为 0 的设置下，87380B 能对应拥有大小为
    65535B 的 TCP窗口，默认 tcp_app_win 设置(31)下则会更小一些。
- max，默认值在 87380B 到 6MB 之前，视内存而定。是系统自动调整接收缓冲的最大值
    ，这个参数**不会**覆盖 `net.core.rmem_max`。如果使用 `setsockopt()` 设置了
    `SO_RCVBUF`，则会关闭自动调整接收缓冲大小的功能，因此该值不生效。另：具体
    的默认值公式：

    `max(87380, min(4 MB, tcp_mem[1]*PAGE_SIZE/128))`

注：接收缓冲划分的逻辑在 [tcp_adv_win_scale](#tcp-adv-win-scale-integer) 和
[tcp_app_win](#tcp-app-win-integer) 有更详细的描述。

注意上面的描述说会得到 65535B 的窗口，是按 tcp_adv_win_scale = 2 来计算的，此
时 TCP 窗口的大小为 bytes - overhead = 87380 - 87380/2^2 = 87380 - 21845 =
65535。但是 `tcp_adv_win_scale` 最新的默认值已经是 `1` 了，所以实际的窗口只有
43690B。

### tcp_sack - BOOLEAN

开启 SACK（select acknowledgments）。

注：这个机制应该是比较常用的，接收方在返回 ACK 时，除了返回目前最大的累积 ACK
序号，还可以在 TCP 选项中填写提前收到的“乱序”报文。这样发送方在接收到 SACK 时
，就可以有针对性地重传缺失的包，提高传输效率。

### tcp_comp_sack_delay_ns - LONG INTEGER

TCP 会尽量减少发送 SACK 的数量，默认会等待 5% SRTT 的时间，时间的下限是该选项
的值，纳秒为单位。默认值为 1ms，与 TSO 自动调整大小的间隔相同。

注[^patch-sack-compression]：这个参数的大背景是要对 SACK 做压缩，因为 TCP 会在
收到失序报文时立即发送SACK 报文，在诸如 wifi 环境或拥塞的网络情况下这并不是好
的选择。

[^patch-sack-compression]: [tcp: implement SACK
  compression](https://www.spinics.net/lists/netdev/msg503106.html) SACK 压缩
  的 patch，其中有解释动机

### tcp_comp_sack_nr - INTEGER

允许被压缩的最大 SACK 报文数，设置为 0 代表关闭 SACK 压缩

- 默认值：44

### tcp_slow_start_after_idle - BOOLEAN

如果开启了，则会实现 [RFC2861](https://tools.ietf.org/html/rfc2861) 的行为：在
空闲超过一段时间之后，将拥塞窗口置为过期（重新慢启动过程）。“一段时间”定义为当
前的 RTO。如果关闭选项，则拥塞窗口不会随着空闲时间过期。

- 默认值：开启

### tcp_stdurg - BOOLEAN

对于 TCP 的 URG(Urgent pointer) 字段，是否使用 Host requirements 中的解释。多
数主机使用的是更老的 BSD 解释，如果开启该选项，Linux 和这些 BSD 风格的主机可能
就没法正常通信了。

注：[Host Requirement](https://tools.ietf.org/html/rfc1122) 对主机实现 TCP 规
范有许多细节上的要求。

### tcp_synack_retries - INTEGER

对于被动连接(passive connection)，允许重传 SYNACK 的最大次数。不能高于 255. 默
认值为 5, 在当前初始 RTO 为 1s 的情况下，到最后一次重传共用时 31s。这样该连接
最后一次超时发生在自尝试建立连接的 63s 之后。

注：TCP 的重传时间是每次翻倍，所以如果初始 RTO = 1s，则第 5 次重传发生在 `1＋2
＋4＋8＋16=31`，最后一次超时为 32s，因此共为 63s。

### tcp_syncookies - INTEGER

只在内核编译时加了 `CONFIG_SYN_COOKIES` 时生效。作用是当 SYN 队列(syn backlog
queue)溢出时，新连接不再存入 SYN 队列，而是直接发送 syncookies，作用是防止常见
的 SYN 泛洪攻击（SYN flood attack）。

注意 syncookies 是一个 fallback 的机制，**不应该**被高负载主机用来作用承接合法
连接流量的工具。如果在日志中收到 SYN 泛洪的警告，但是调研后发现这些连接都是佥
的，只是流量太大了，那么此时应该考虑的是调整其它的参数直到日志中的警告消失：
[tcp_max_syn_backlog](#tcp-max-syn-backlog-integer)、
[tcp_synack_retries](#tcp-synack-retries-integer)、
[tcp_abort_on_overflow](#tcp-abort-on-overflow-boolean)

syncookies 机制严重违背了 TCP 协议，它不允许使用 TCP 扩展，会导致一些其它服务
的退化（如 SMTP 中继），这些影响都不是服务端可见的，而是由客户端、中继方发现并
通知你的。你只能看到日志里的 SYN 泛洪警告，尽管你发现它们不是真正的泛洪，但你
的服务器配置其实是有问题的。

如是你想测试 syncookies 对服务的影响，可以将选项设置成 2, 这样会无条件开启
syncookies。

- 0: 关闭
- 1: 仅当 syn backlog queue 溢出时发送 syncookies，默认值
- 2: 无条件发送 syncookies（从 Linux 3.12 开始支持）

注：SYN 泛洪攻击指的是攻击者发送大量的 SYN 报文请求建立连接，服务端响应 SYNACK
，但是攻击者并不处理，不真正建立连接，于是大量 SYN_RECV 状态的连接将服务端的
SYN 队列占满，导致正常的请求无法被响应。

SYN 泛洪攻击的重点是服务端需要为 SYN_RECV 连接保存信息，syncookies 的思路是将
连接的信息编码到 SYNACK 报文中，最后一个 ACK 时再由客户端将信息带回给服务端，
这样服务就不需要为它保存任何信息，因此能正常接受连接且不需要保存任何信息。

有两个缺点[^wiki-syn-cookie]：一是服务器只能编码 8 种 MSS 值，因为有些位被占用
了，另一方面服务器必须拒绝所有 TCP 选项，例如大窗口和时间戳。

[^wiki-syn-cookie]: https://zh.wikipedia.org/wiki/SYN_cookie

### tcp_fastopen - INTEGER

开启 TCP Fast Open ([RFC7413](https://tools.ietf.org/html/rfc7413)) 功能，在
SYN 包中也能传输数据。需要客户端和服务器两端都开启支持。

客户端支持通过设置为 `0x1` 开启（默认打开）。要想在 SYN 时发送数据，客户端需要用
加上 `MSG_FASTOPEN` 选项的 `sendmsg()` 或`sendto()` 方法建立连接，而不是用
`connect()`。

服务端支持通过设置为 `0x2` 开启（默认关闭），之后要么通过另一个标志（`0x400`）
来为所有的 listeners 开启该功能，要么通过为每个 listener 单独开启
`TCP_FASTOPEN` 选项来支持。这个选项要带一个参数，代表 syn-data backlog 的长度
。

这个选项的值是 bitmap，描述如下：

- `0x1`：客户端，允许客户端在 SYN 中携带数据
- `0x2`: 服务端，开启服务端支持，允许在三次握手结束前接收数据并传递给应用程序
- `0x4`: 客户端，不管 FTO cookie 是否存在，都在 SYN 中发送数据，且不带 cookie
    选项
- `0x200`: 服务端，没有 cookie 选项时依旧接收 SYN 报文中的数据
- `0x400`: 服务端，为所有监听端口开启 FTO，不用为端口单独设置 TCP_FASTOPEN 选项
- 默认值为：`0x1`

注意后续的增强选项只有在开启了客户端或服务端支持（`0x1` 及 `0x2`）后才会生效。


注：TFO 通过在握手时传递数据，来减少三次握手对数据传输的延时影响，在诸如 HTTP
这类协议，会不断创建新的 TCP 连接，因此影响会更大。

TFO 有个概念是 TFO cookie，客户端在创建连接时可以带上 cookie 选项，服务端认证
通过时，就可以接收第一个 SYN 包中携带的数据，而不是等第三次握手的 ACK 后再接收
数据[^wiki-tfo]。

[^wiki-tfo]: https://zh.wikipedia.org/wiki/TCP快速打开

### tcp_fastopen_blackhole_timeout_sec - INTEGER

发生 TFO 防火墙黑洞（TFO firewall blackhole）情况时，关闭活跃端口快速打开功能
的持续时间（单位秒）初始值。如果快速打开功能重新启用后又遇到了黑洞问题，则关闭
时间会指数级增长，如果黑洞问题消失，关闭时间会重新被设置为初始值。

- 0: 关闭黑洞问题检测机制
- 默认为 1 小时

注：TFO 防火墙黑洞会导致 client 端长时间连不上 server 端，其中的一些情形：

- 防火墙可能会丢掉带数据的 SYN 包
- 防火墙可能会丢掉带数据的 SYNACK 包

[^tfo-blackhole]: [The enemy of firewalls: TCP Fast
  Open](https://blog.donatas.net/blog/2017/03/09/tfo/) 介绍了 TFO blackhole 的
  一些情形

### tcp_fastopen_key - list of comma separated 32-digit hexadecimal INTEGERs

该选项的值包含了一个列表，列表中包含了一个主 Key 和一个可选的备用 Key。主 Key
被用于签发新 cookie 及验证已有 cookie，而备用 key 只会被用来验证 cookie。备用
Key 是用来滚动更新 key 时轮换用的。


如果 [tcp_fastopen](#tcp-fastopen-integer) 选项设置成了 `0x400`，或者端口设置
了 `TCP_FASTOPEN` 选项，而之前并没有配置过 Key，则内核会随机生成一个 Key。如果
端口事先使用了 `setsockopt` 配置了 `TCP_FASTOPEN_KEY` 选项，则该端口会选用配置
的 Key 而不是 sysctl 设置的 Key。

Key 由 4 组数字构成，由字符 `-` 分隔，每组由 8 个 16 进制数字组成，如
`xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx`，前导的 0 可以省略。主 Key 和备用 Key 之
间用逗号分隔。如果只设置了一个 Key，则该 Key 被认为是主 Key，之前配置的备用
Key 会被移除。

### tcp_syn_retries - INTEGER

重传主动连接 SYN 报文的次数。不能高于 127。 默认值是 6, 在 RTO 为 1s 的情况下
，从开始到最后一次重传之间的时间为 63s。从开始到最终的超时之间，过了 127s。

### tcp_timestamps - INTEGER

开启 [RFC1323](https://tools.ietf.org/html/rfc1323) 中定义的时间戳功能

- 0: 关闭
- 1: （默认）开启功能并为每个连接使用随机的 offset，而不仅是使用当前时间
- 2: 开启功能并仅使用当前时间（Linux 4.10 后生效）

注：时间戳机制指的是在发送 TCP 报文时，加上时间戳选项，记录服务端的时间，接收
方在 ACK 时需要将时间戳选项原封不动返回。这样服务端一方面可以用来精确计算 RTT
，一方面可以用来防止序列号回绕（PAWS，传输大量数据时，ACK 序列溢出回绕，可能会
和之前发送的报文有重合）。

出于安全上的考虑，时间戳并不是真正记录时间，而是会使用一些随机的内容，一般还是
保证递增的。

### tcp_min_tso_segs - INTEGER

每个 TSO 帧包含的报文段数量最小值。从 Linux-3.12 开始，TCP 就不再是填充一个
64KB 的大 TSO 包，而是会根据当前的流量自动决定 TSO 帧的大小。如果有一些特殊的
需求，还是可以强迫 TCP 构造大的 TSO 帧的。当然如果可用窗口太小，TCP 层还是有可
能对大的 TSO 帧做拆分。

- 默认值 2

注：TSO(TCP segmentation offload) 机制的动机是 TCP 用户层的数据需要根据 MTU 进
行分段，这个过程很固定但是消耗 CPU，于是改进的思路是将数据整体发往网络设备，由
网络设备进行分段。这个机制能释放 CPU，但需要网络设备支持。

注[^tso-sizing]：TSO 机制有个问题是 TCP 经常会向下传递一个大包，网卡拆分后一次
性注入网络，容易造成流量峰值。TSO autosizing 的目的是根据流量自动调整帧大小，
进而将流量平稳地注入网络，“尽量每毫秒都发一个包，而不是每 100 毫秒发一个大包”
。`tcp_min_tso_segs` 指定的是这个包的最小值。

[^tso-sizing]: [TSO sizing and the FQ scheduler](https://lwn.net/Articles/564978/) 讲解了 TSO
    和 FQ 机制的一些小细节

### tcp_pacing_ss_ratio - INTEGER

TCP 会根据当前速率乘于一个比例来设置 `sk->sk_pacing_rate` 值（当前速率
`current_rate = cwnd * mss / srtt`）。如果 TCP 处于**慢启动**阶段，则会使用
`tcp_pacing_ss_ratio` 这个比例来让 TCP 以更快的速度进行探测，这里会假设每个RTT
时间里 cwnd 都可以翻倍。

- 默认值：200

注：和在 [tcp_min_tso_segs](#tcp-min-tso-segs-integer) 中的注提到的类似，
Pacing 机制的目标也是在某个 RTT 下能让窗口的包尽量“均匀”地发送，而不是在某一时
刻扎堆发送。


### tcp_pacing_ca_ratio - INTEGER

TCP 会根据当前速率乘于一个比例来设置 `sk->sk_pacing_rate` 值（当前速率
`current_rate = cwnd * mss / srtt`）。如果 TCP 处于**拥塞避免**阶段，则会使用
`tcp_pacing_ca_ratio` 这个比例来让 TCP 以保守的速度进行探测。

- 默认值：120

### tcp_tso_win_divisor - INTEGER

该选项控制一个 TSO 帧的大小能占拥塞窗口的百分比。这个参数用来在减少峰值和
构建大 TSO 帧之间做选择。

- 默认值：3

### tcp_tw_reuse - INTEGER

允许新连接复用处于 TIME_WAIT 状态的端口。需要应用层协议自己判断这样做是否安全
。

- 0: 关闭
- 1: 全局开启
- 2: 只对环回的流量开启（默认值）

除非有专家要求或建议，否则不建议修改。

注：实践中遇到 TIME_WAIT 端口太多导致端口不够用的问题，通常是因为开启了反向代
理且没有开启 keepalive 长连接。在绝大多数情况下都不需要修改内核参数，并且修改
了以后会造成很多偶发的预料之外的问题。

### tcp_window_scaling - BOOLEAN

开启由[RFC1323](https://tools.ietf.org/html/rfc1323)中定义的窗口缩放（window
scaling）功能

- 默认值：开启

注：TCP 头中窗口大小字段是 16位的，所以最多表示 64K 大小的窗口，为了使用更大的
窗口，“窗口缩放”会使用新增的 TCP 选项，指定窗口放大多少倍（实际上指定的是左移
多少位）。这个选项需要连接双方都支持。

### tcp_wmem - vector of 3 INTEGERs: min, default, max

这个选项包含 3 个值：

- min: 默认 4K。代表 TCP 发送缓存的预留大小。
- default: 默认 16K。TCP 发送缓存的初始大小，该先期覆盖其它协议设置的
  `net.core.wmem_default`，并且通常比 `wmem_default` 的值小。
- max，默认值在 4K 到 6MB 之前，视内存而定。是系统自动调整发送缓冲的最大值
    ，这个参数**不会**覆盖 `net.core.wmem_max`。如果使用 `setsockopt()` 设置了
    `SO_SNDBUF`，则会禁用自动调整发送缓冲大小的功能，因此该值不生效。另：具体
    的默认值公式：

    `max(65536, min(4 MB, tcp_mem[1]*PAGE_SIZE/128))`

### tcp_notsent_lowat - UNSIGNED INTEGER

TCP socket 通过 `TCP_NOTSENT_LOWAT` 选项可以控制它的写队列中未发送的字节数。
如果队列未满且其中的未发送数据小于每个 socket 各自设置的下限值，则
`poll()/select()/epoll()` 方法会返回 `POLLOUT` 事件。如果这个数据没有超过这个
限制，`sendmsg()` 也不会新增缓存。

这个选项是一个全局的选项，给那些没有设置 `TCP_NOTSENT_LOWAT` 选项的 socket 使
用。对这些端口来说，全局选项值的变化会即时生效。

- 默认值：UINT_MAX (0xFFFFFFFF)

注：原文的翻译可能比较怪，这个参数大意是用来控制内存使用的，当缓存队列中的未发
送数据量小于该值时，内核认为发送缓存为空，因此可以发送，大于该值时停止发送
[^tcp_notsent_lowat]。

[^tcp_notsent_lowat]: [TCP发送缓存控制tcp_notsent_lowat ](https://redwingz.blog.csdn.net/article/details/89104763)

另：这是对应选项的 [commit](https://lwn.net/Articles/560082/)。

### tcp_workaround_signed_windows - BOOLEAN

如果开启，则在没有接收到窗口缩放参数的情况下，假设对方的 TCP 实现有问题，本机
需要把对方的窗口大小字段当作是“有符号”的 16 位整数。如果关闭，则在没有接收到窗
口缩放参数时，认为对方的 TCP 实现也是正确的，把窗口大小解释成 16 位无符号整数
。

- 默认值：0

### tcp_thin_linear_timeouts - BOOLEAN

是否为 thin stream 开启线性超时重传。

如果开启了，则内核会动态检测数据流是不是 thin stream（在传的包数量小于 4），如
果发现数据流的确是 thin stream，则在使用指数回退的超时重传时，至少会先尝试 6次
线性超时重传。对于一些对依赖低延时的小流量数据流（如游戏）来说，可以减小重传的
延时。关于 thin stream，可以参数
[Documentation/networking/tcp-thin.txt](https://www.kernel.org/doc/Documentation/networking/tcp-thin.txt)

- 默认值：0（关闭）

注：tcp-thin.txt 里基本说得比较详细了

### tcp_limit_output_bytes - INTEGER

对每个 socket 控制 TCP 的 Small Queue 大小。TCP 批量发送数据时，倾向于不断发送
直到收到 TCP 丢包的通知，加上自动调整 SNDBUF 的功能，会导致在本地有大量的包在
排队（在 qdisc, CPU backlog 或设备中），会损害其它连接(flow)的性能，起码对于典
型的 pfifo_fast qdiscs 来说是这样。`tcp_limit_output_bytes` 用来限制允许存储在
qdisc 或设备中的字节数来减少 RTT/cwnd 差异导致的不公平，减少 bufferbloat。

- 默认值：1048576 (16 * 65536)

注：可以参考 [TCP small queues](https://lwn.net/Articles/507065/) 中的说明

注：bufferbloat 译为“缓冲膨胀”，指的是由于缓冲了太多数据导致延迟增高的现象。

### tcp_challenge_ack_limit - INTEGER

限制每秒钟送送的 Challenge ACK 的数量，这是 RFC 5961(Improving TCP's
Robustness to Blind In-Window Attacks) 中推荐的。

- 默认值：1000

注[^rfc-5961-challange-ack]：Challenge ACK 指的是，当接接收到 RST 报文时，如果
序列号不符合预期，但是在合理的窗口区间里 `RCV.NXT < SEG.SEQ < RCV.NXT+RCV.WND`
，则 TCP 需要返回一个 ACK，即为 Challenge ACK。

[^rfc-5961-challange-ack]: https://tools.ietf.org/html/rfc5961

注："Blind" 应该指的是第三方，因为它对真实的连接信息一无所知，"In-Window" 指的
是攻击者去猜测序列号，伪造的报文在合法的窗口内。这类攻击可能伪造 SYN、RST、或
其它报文来进行攻击。

### tcp_rx_skb_cache - BOOLEAN

开启时，会为每 SKB 维护一个 TCP socket 级别的缓存，在某些情况下会提高性能。要
注意在有很多 TCP socket 的机器上开启这个选项是非常危险的，因为它会消耗很多内存
。

- 默认值：0（关闭）

## 后记

最近在学习《TCP/IP 详解卷一》，好不容易把 TCP/IP 的部分看完了，合起书来几乎是
什么也不记得，因此才想从 Linux 相关参数入手，去联系书里的知识。实际翻译和注释
后，发现很多内容并不是书里得来的，而是网上搜索，文章、博客、RFC、邮件等。

网卡有许多讲 Linux 参数调整的，经常是只列出参数，对我这种外行来说，不知道参
数影响什么机制，因此也不知道为什么要这么设置，这篇文章里我对几乎每个参数的机制
都做了调查，并以自己的理解写了简单的注解，希望对读者有用。

最后感慨 TCP/IP 是非常复杂的，很多机制都有漏洞，对漏洞又有很多算法来修补，修补
后又有边缘的 case，可谓是无穷无尽；另一方面有许多不同算法解决不同问题，而算法
之间有可能相互影响，很难有全局的掌握；具体实现上还会需要在性能上做一些妥协。因
此虽然对 sysctl 中的选项有些了解，还是觉得自己对 TCP 一窍不通，还需要不断学习
。

## 参考

- https://flylib.com/books/en/2.783.1.50/1/ 介绍了基于 TOS 和 fwmark 的路由方案
- https://blog.csdn.net/sinat_20184565/article/details/112253946 代码层面描述了 fib_multipath_use_neigh 的作用
- https://www.ruijie.com.cn/fa/xw-hlw/82104/ ECMP 选下一跳的算法
- [Linux TCP协议使用的变量](https://www.cnblogs.com/danxi/p/6709373.html) 跟本文类似，对 TCP 变量做了翻译
- [What is an L3 Master Device](https://netdevconf.info/1.2/papers/ahern-what-is-l3mdev-paper.pdf)
  介绍了 L3 master device 的机制
- [Virtual Routing and Forwarding (VRF)](https://www.kernel.org/doc/Documentation/networking/vrf.txt)
  内核文档，介绍 VRF 机制
- [Linux VRF(Virtual Routing Forwarding)的原理和实现](https://blog.csdn.net/dog250/article/details/78069964)
  对 VRF 的使用场景、实现原理有很好的讲解
