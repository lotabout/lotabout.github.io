title: Wireshark tcptrace 图解读
toc: true
date: 2025-11-22 15:40
tags: [WireShark, tcptrace]
categories: [Notes]
---

tcptrace 一般用来排查长肥管道的吞吐问题，之前一直看不懂，最近完整学习并着手做
了些验证，整理如下。

建议对照着 laixintao 老师的 [这篇文章](https://www.kawabangga.com/posts/4794) 来补齐一些概念

## tcptrace 图中的基本元素

{% asset_img tcptrace-elements.svg tcptrace elements %}

上面的 tcptrace 示例中（关注其中的元素，其它的时序不真实）：

- 横轴是时间，纵轴是 Sequence Number，可以理解为包的字节数
- 其中每 **发送** 一个数据包，就会画一条蓝色的 `I` 型竖线段，长度表示数据量
- 上方的绿色阶梯线代表接收方的窗口大小（Receive Window），即最多能发多少数据
- 下方的棕黄色阶梯线代表已经被 ACK 的数据量，即接收方实际收到的数据
- 红色的线段代表选择确认（SACK），即接收方收到的数据中间有缺失，红线代表收到了哪些数据
- 棕黄线下方的小竖线代表重复 ACK（dup ACK），通常代表接收方收到了乱序的包

所以这个图也只是把发的包和收到包的信息以图形化的方式展现出来，方便我们分析。

## tcptrace 图中的“距离”信息

除了直接标记出来的元素，还可以通过图中的一些“距离”，得知其它一些概念

{% asset_img tcptrace-distance-meaning.jpg tcptrace meaning %}

- Bytes in Flight: 发送方已经发出去但还没有被 ACK 的数据量，某时刻蓝色线和棕黄色线的垂直距离
- Window Room（窗口余量）： 接收方还能接收的数据量，某时刻绿色线和棕黄色线的垂直距离
- RTT（往返时间）: 数据发送到确认接收所需的时间，图中蓝色线和棕黄色线的水平距离

还有就是整体的斜率，代表吞吐量（Throughput），斜率越大，吞吐量越高。

## 发送方与接收方抓的包有差异

发送方作为最初发包和接收 ACK 的一方，可以看到整体的 RTT 及链路信息，如下图中可
以看到蓝线和 ACK 线的距离(代表 RTT)：

{% asset_img tcptrace-sender.jpg tcptrace sender %}

而接收方中中的蓝线和 ACK 线的距离，则代表的是本机接收到包后本机发 ACK 的距离，
并不能代表 RTT。但是接收方额外地可以看到发送方的一些乱序包，而发送方是看不到的。

{% asset_img tcptrace-receiver.png tcptrace receiver %}

结论是两方的抓包有各自无法替代的信息，如果可能尽量两方同时抓包，如果只有一方，
尽量是发送方。

## 常见网络问题下 tcptrace 图的表现

### 丢包

{% asset_img tcptrace-packet-loss.jpg tcptrace packet loss %}

1. 看到红色的 SACK 线，说明接收方有包没收到
2. 看到不断有递增的红色 SACK 线，说明后续的包都收到了，但是丢失的包依旧没收到
3. 丢包期间，接收方的 buffer 不能释放，导致窗口没有增长
4. 终于收到丢失的包后，综色的 ACK 线跳跃式上升，且绿色窗口线也上升，说明接收方
   释放了 buffer
5. 由于接收方窗口增大，发送方马上利用了新增的窗口，蓝色线也跟着上升

额外注意这个图里可以看到发送方重传了没有收到数据。

{% asset_img tcptrace-retransmit.jpg tcptrace retransmit %}

### 吞吐受到接收方窗口限制

{% asset_img tcptrace-rx-window-limit.jpg tcptrace rx window limit %}

1. 蓝线和距离绿线非常接近，说明发送方一直发送，接近了接收方窗口的上限
2. 绿线一上升，蓝线也跟着上升，说明发送方马上利用了接收方新增的窗口

结合起来看，说明接收方窗口太小，限制了发送方的吞吐。

### 吞吐受到发送方窗口限制

发送方能发多少数据除了受接收方窗口限制外，还受两个因素影响，一个是发送窗口（代
码里使用 `SO_SNDBUF` 指定，内核里通过 `net.ipv4.tcp_wmem` 指定），另一个是拥塞
窗口(`cwnd`)。例如下面的示例（构造时把 `net.ipv4.tcp_wmem` 设置成了 `4096 4096
4096`）[^delay-send]:

[^delay-send]: 思考题：这张图里，为什么不是一收到 ACK 后就立马发送新的包？

{% asset_img tcptrace-buf-limit-4k.png tcptrace Buf limit 4K %}

上图中蓝线不断上升，但远不到绿线的位置就停止了，直到有 ACK 一定数据后才继续发
送。说明是发送方做了限制。但是究竟是 `send_buffer` 的限制还是 `cwnd` 的限制？
这就需要使用 "Window Scaling"：

{% asset_img tcptrace-buf-limit-4k-window.png tcptrace Buf limit 4K Window Scaling%}

简单理解 Windown Scaling 里计算的是每个包对应的 "Bytes In Flight" 的数据，也就
是“发出但未被 ACK”的数据，通常这个信息可以认为约等于发送方的 `cwnd`。但是上图
中这个窗口信息很“平”，而一般 `cwnd` 是会波动的，因此可以认为不是 `cwnd` 引起的，
那么就只能是发送窗口了。作为对比，我们看一个不显式设置 send buffer 的示例：


{% asset_img tcptrace-buf-auto-window.png tcptrace window scaling reflecting cwnd %}

可以看到上图中随着一些丢包的发生，窗口也在不断变化，这与 `cwnd` 随着 RTT 和丢
包不断变化相匹配。

### 特例：零窗口

上面提到速率可能跟发送方窗口有关，还有一种特例是因为各种原因（如消费的速度太慢）
导致发送方窗口为 0, 此时 wireshark 会特地标记为 `x`：

{% asset_img tcptrace-zero-window.png tcptrace zero window %}

### 网络状况很差

模拟 5% 的丢包与 10% 的乱序得到如下示例，一眼看就是很“不均匀”，有红色的丢包，
棕色线有坑坑挖挖的乱序，整体的上升趋势（斜率）一会高一会低：

{% asset_img tcptrace-bad-net.png tcptrace bad network %}

我们再放大看一些特征：

{% asset_img tcptrace-bad-net-detail.png tcptrace bad network detail %}

## 完美的连接

完美的情况下，会是一个非常干净的图，笔直的线，没有 SACK、乱序等复杂元素，也能
达到网络的带宽：

{% asset_img tcptrace-perfect.png tcptrace perfect %}

## 附：模拟网络条件用到的一些命令

上面的实验是在 Mac 上用 podman 的两个 container 完成的，使用以下方式模拟网络条件:

1. 先 `podman machine ssh` 进入 podman 虚拟机
2. 这个虚拟机缺少 `sch_netem` 内核模块，通过 `rpm-ostree install  kernel-modules-extra` 安装
3. 重启 podman 的虚拟机
4. 通过 `podman machine ssh` 进入虚拟机执行 `modprobe sch_netem`
5. 视情况执行如下 `tc` 命令来设置网络条件

```
tc qdisc del dev veth0 root
tc qdisc del dev veth1 root
tc qdisc add dev veth0 root handle 1: netem delay 30ms loss 5% reorder 10%
tc qdisc add dev veth0 parent 1:1 handle 10: tbf rate 10mbit burst 500kbit limit 1m
tc qdisc add dev veth1 root handle 1: netem delay 30ms loss 5% reorder 10%
tc qdisc add dev veth1 parent 1:1 handle 10: tbf rate 10mbit burst 500kbit limit 1m
```

其中 `veth0`, `veth1` 这两个网卡，是在虚拟机中通过如下命令定位
1. `podman ps` 获取 container id
2. `podman inspect <container id> | grep Pid` 获取 Pid
3. `nsenter -t <pid> -n ip link` 看到 container 网卡对应的 id 为 `eth0@if5`，
   注意这里的 `5`
4. `ip link` 找到编号为 `5` 的网卡 `5: veth1@if2`，因此为 `veth1`


## pcap 文件

- {% asset_link iperf-bad-net.pcap %}
- {% asset_link iperf-client-1mb.pcap %}
- {% asset_link iperf-client-buf-4k.pcap %}
- {% asset_link iperf-client-buf-auto-with-loss.pcap %}
- {% asset_link iperf-client-buf-auto.pcap %}
- [tcptrace-client-defaultwindow.pcapng](https://www.cloudshark.org/captures/f5eb7c033728)
- [tcptrace-client-loss.pcapng](https://www.cloudshark.org/captures/c967765aef38)
- [Lab1-GreerBombal_ItsNotTheNetwork.pcapng](https://github.com/packetpioneer/youtube/blob/main/Lab1-GreerBombal_ItsNotTheNetwork.pcapng)


## 参考

- [用 Wireshark 分析 TCP 吞吐瓶颈](https://www.kawabangga.com/posts/4794)
    laixintao 老师的博客，看了之后才第一次真正读懂了 tcptrace 图的含义
- [Wireshark TCP Trace Graph Tutorial](https://www.packetsafari.com/blog/2021/10/31/wireshark-tcp-graphs/) 细致地介绍了一些常见网络问题下 tcptrace 图的表现，可以作为 laixintao 老师博客的补充
- [在Wireshark的tcptrace图中看清TCP拥塞控制算法的细节(CUBIC/BBR算法为例)](https://blog.csdn.net/dog250/article/details/53227203) 逻辑性地分析不同拥塞算法下 tcptrace 图的表现，但我本身对算法不熟悉，只能浅尝则止

