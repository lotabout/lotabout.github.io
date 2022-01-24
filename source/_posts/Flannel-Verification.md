title: Flannel 网络通信验证
toc: true
date: 2022-01-23 15:21:47
tags: [k8s, network, flannel]
categories: [Knowledge]
---

本文对 Kubernetes 使用 Flannel + vxlan 的网络通信做一个验证，并尝试说明其中使
用的一些机制。整体的流程如下图：

{% asset_img Flannel-Overall.svg Flannel overall %}

Kubernetes 规定了网络模型，要求[^3-rules]如下，flannel 只是其中一种实现。

1. 任意两个 pod 之间其实是可以直接通信的，无需经过显式地使用 NAT 来接收数据和地址的转换；
2. node 与 pod 之间是可以直接通信的，无需使用明显的地址转换；
3. pod 看到自己的 IP 跟别人看见它所用的 IP 是一样的，中间不能经过转换。

[^3-rules]: [从零开始入门 K8s：Kubernetes 网络概念及策略控制](https://www.infoq.cn/article/ERuLek5gPfUxdHC5cMTO)

## 实验配置

使用 3 个虚拟机搭建的 Kubernetes 1.23 集群，其中 Flannel 版本为 0.16.1. 上面起
了两个服务，分别为两副本。Pod 信息如下：

```
$ k get pods -o wide
NAME                           READY   STATUS    RESTARTS   AGE     IP           NODE       NOMINATED NODE   READINESS GATES
sender-779db554f9-d796q        1/1     Running   0          83s     10.244.2.7   centos73   <none>           <none>
sender-779db554f9-kr69b        1/1     Running   0          84s     10.244.1.7   centos72   <none>           <none>
spring-test-77d9d6dcb5-2cgs5   1/1     Running   0          5h28m   10.244.1.3   centos72   <none>           <none>
spring-test-77d9d6dcb5-m9mvr   1/1     Running   0          5h28m   10.244.2.3   centos73   <none>           <none>
```

实验里会尝试说明 `sender-779db554f9-kr69b`(`10.244.1.7`) 到
`spring-test-77d9d6dcb5-m9mvr`(`10.244.2.3`)之间的网络通信。

## Pod 与虚拟网卡

首先要说明的是 Pod 里看到的网卡，在宿主机上是如何实现的，这部分知识强烈推荐这
篇文章：[How Do Kubernetes and Docker Create IP Addresses?!](https://dustinspecker.com/posts/how-do-kubernetes-and-docker-create-ip-addresses/)。具体来说，是要确认下面这部分内容：

{% asset_img pod-interface-bridge.svg Pod and VTEP %}

### Pod 的网卡在哪？

首先，我们进入 `sender-779db554f9-kr69b` 所在 pod，看到网卡信息如下（省略了
loopback）：

```
root@sender-779db554f9-kr69b:/# ifconfig
eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1450
        inet 10.244.1.7  netmask 255.255.255.0  broadcast 10.244.1.255
        ether 22:5e:27:43:63:fa  txqueuelen 0  (Ethernet)
...
```

注意 pod 的 IP 地址和 MAC 地址，之后我们在 centos71 机器上列出所有网卡信息：

```
[jinzhouz@centos72 ~]$ ip link
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP mode DEFAULT group default qlen 1000
    link/ether 52:54:00:a0:f0:57 brd ff:ff:ff:ff:ff:ff
3: docker0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN mode DEFAULT group default
    link/ether 02:42:19:9e:c1:e1 brd ff:ff:ff:ff:ff:ff
4: flannel.1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UNKNOWN mode DEFAULT group default
    link/ether f2:17:d1:67:5c:94 brd ff:ff:ff:ff:ff:ff
5: cni0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UP mode DEFAULT group default qlen 1000
    link/ether 0a:07:55:0f:84:7f brd ff:ff:ff:ff:ff:ff
7: veth45885375@if3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue master cni0 state UP mode DEFAULT group default
    link/ether a6:f6:90:57:ea:33 brd ff:ff:ff:ff:ff:ff link-netnsid 1
11: veth8360c992@if3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue master cni0 state UP mode DEFAULT group default
    link/ether 26:73:c7:95:d2:0f brd ff:ff:ff:ff:ff:ff link-netnsid 2
```

并没有发现 Pod 里使用的这张虚拟网卡（MAC 地址没有匹配上的）。发现不了的原因是
Kubernetes/Docker 等虚拟化方案，本质上是用 namespace/cgroups 对资源进行隔离，
Pod 里使用的虚拟网卡，其实在另一个网络 namespace 下，那么如何确认这一点呢？[参
考这里](https://stackoverflow.com/a/62193064) 需要如下步骤：

1. 查找 pod 对应的 docker container id（这里找的是 k8s 起的 pause container）:

    ```
    $ sudo docker ps --format '{{.ID}} {{.Names}} {{.Image}}'
    7f780a596b66 k8s_app_sender-779db554f9-kr69b_default_f8c7cac8-680a-45ad-a091-2b8ada73d289_0 baobao:5000/jz/sender
    d7226b120121 k8s_POD_sender-779db554f9-kr69b_default_f8c7cac8-680a-45ad-a091-2b8ada73d289_0 registry.aliyuncs.com/google_containers/pause:3.6
    ...
    ```

2. 这里我们要找的是 `k8s_POD` 开头的镜像，然后查找它的 pid:

    ```
    $ sudo docker inspect --format '{{.State.Pid}}' d7226b120121
    513
    ```

3. 查询 PID=513 进程对应的 veth 网卡

    ```
    [jinzhouz@centos72 ~]$ sudo nsenter -t 513 -n ip link
    ...
    3: eth0@if11: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UP mode DEFAULT group default
        link/ether 22:5e:27:43:63:fa brd ff:ff:ff:ff:ff:ff link-netnsid 0
    ```

可以看到它的 MAC 地址和 POD 里看到的 MAC 地址是一样的。说明 POD 里使用的网卡就
是这一张。

### VET 虚拟网卡

上文提到每个 POD 的网卡是在自己的 namespace 下的，既然 namespace 是用来做网络
隔离的，不同 namespace 下的网络自然是不通的。但是 k8s 又要求“node 与 pod 之间
是可以直接通信”，于是我们需要打通两个 namespace，让宿主机和 POD 能直接通信。

这里使用的技术是 Virtual Ethernet([VETH](https://man7.org/linux/man-pages/man4/veth.4.html))，
VETH 是成对出现的，可以理解成创建了一条隧道，两端各是一张网卡，可以分别位于两
个 namespace 之中，发往其中一端的包等价于发给另一端，这样就可以打通两个
namespace。我们看 pod namespace 下的网卡：

```
[jinzhouz@centos72 ~]$ sudo nsenter -t 513 -n ip link
...
3: eth0@if11: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UP mode DEFAULT group default
    link/ether 22:5e:27:43:63:fa brd ff:ff:ff:ff:ff:ff link-netnsid 0
```

注意到网卡中的 `@if11` 字样，另一个关键信息是 `link-netnsid 0`，说明它关联的是
ID 为 `0` 的 namespace 下的 ID 为 `11` 的网卡。我们首先确定
namespace[^netns-id]：

```
$ sudo ls /var/run/netns # docker 创建的 namespace 需要软链后才能查到
$ sudo ip netns list
c9e7f13179fa (id: 2)
5cc5ba76a35a (id: 1)
default
```

[^netns-id]: https://openterprise.it/2020/09/working-with-kernel-network-namespaces-created-by-docker/

虽然没有直接展示，但 `0` 对应的是默认的 namespace，也就是宿主机的 namespace。再结合之前的输出：

```
11: veth8360c992@if3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue master cni0 state UP mode DEFAULT group default
    link/ether 26:73:c7:95:d2:0f brd ff:ff:ff:ff:ff:ff link-netnsid 2
```

可以确认它关联的是 `veth8360c992@if3` 这个网卡。同理也可以反推 `veth8360c992`
关联的是 `netnsid = 2` 的 `id = 3` 的网卡，也是符合预期的。


### 虚拟网卡与桥接

如果我们尝试通过 `ip addr` 查看 `veth` 网卡的 IP 地址，会发现它们是没有 IP 的：

```
[jinzhouz@centos72 ~]$ ip addr
5: cni0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UP group default qlen 1000
    link/ether 0a:07:55:0f:84:7f brd ff:ff:ff:ff:ff:ff
    inet 10.244.1.1/24 brd 10.244.1.255 scope global cni0
       valid_lft forever preferred_lft forever
7: veth45885375@if3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue master cni0 state UP group default
    link/ether a6:f6:90:57:ea:33 brd ff:ff:ff:ff:ff:ff link-netnsid 1
11: veth8360c992@if3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue master cni0 state UP group default
    link/ether 26:73:c7:95:d2:0f brd ff:ff:ff:ff:ff:ff link-netnsid 2
```

这是因为对于每个 POD，宿主机上都会创建 `veth` 虚拟网卡，而为了更方便这些卡的管
理，k8s 会创建一张桥接的网卡 `cni0`。可以通过下面的命令查看：

```
[jinzhouz@centos72 ~]$ brctl show cni0
bridge name     bridge id               STP enabled     interfaces
cni0            8000.0a07550f847f       no              veth45885375
                                                        veth8360c992
```

桥接(bridge)网卡可以认为是一个 2 层的交换机，当它收到一个报文时，会根据自己维
护的 MAC 地址映射表将报文从不同的端口发出，如果没有找到 MAC 地址则会往所有端口
都发一份。它的 MAC 映射表如下：

```
[jinzhouz@centos72 ~]$ brctl showmacs cni0
port no mac addr                is local?       ageing timer
  3     26:73:c7:95:d2:0f       yes                0.00
  3     26:73:c7:95:d2:0f       yes                0.00
  2     a6:f6:90:57:ea:33       yes                0.00
  2     a6:f6:90:57:ea:33       yes                0.00
```

对数据敏感一些会发现出现的两个 MAC 地址分别对应 `veth45885375` 和
`veth8360c992`。


## 发送方

那么当 Pod 中向另一个宿主机上的 Pod 发请求时，会发生什么呢？整体流程如下：

{% asset_img Sender.svg Sender %}

1. 首先请求发到 Pod 内的 eth0 网卡，通过我们上面说的 VETH 的机制，相当于发送到
   `cni0` 网卡
2. 此时内核需要查路由表，决定发送到哪个网卡：

    ```
    [jinzhouz@centos72 ~]$ route
    Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
    default         RT-AC86U-D830   0.0.0.0         UG    0      0        0 eth0
    10.244.0.0      10.244.0.0      255.255.255.0   UG    0      0        0 flannel.1
    10.244.2.0      10.244.2.0      255.255.255.0   UG    0      0        0 flannel.1
    ```

   我们发现目标地址 `10.244.2.3` 命中 `10.244.2.0` 网段，于是发往 `flannel.1` 网卡

3. 接下去需要由 `flannel.1` 将报文通过 `eth0` 端口发到 `centos73` 机器上，这里
   涉及 vxlan 的工作机制，下面详细说。

### vxlan

vxlan 可以这么理解：如果有一个 2 层的包，源地址是：MAC-A，目标地址是：MAC-B，
但 MAC-B 可能在一个遥远的机器上，通过链路层无法直接到达。vxlan 的想法是把这个
二层的包封装成一个 3 层的UDP，将 UDP 包发送到目标机器上，目标机器再把 2 层的包
拆出来，发送到 MAC-B 所在的网卡。

Flannel 创建的 `flannel.1` 网卡就配置了 vxlan：

```
[jinzhouz@centos72 ~]$ ip -d link show
4: flannel.1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UNKNOWN mode DEFAULT group default
    link/ether f2:17:d1:67:5c:94 brd ff:ff:ff:ff:ff:ff promiscuity 0
    vxlan id 1 local 192.168.50.238 dev eth0 srcport 0 0 dstport 8472 nolearning ageing 300 noudpcsum noudp6zerocsumtx noudp6zerocsumrx addrgenmode eui64 numtxqueues 1 numrxqueues 1 gso_max_size 65536 gso_max_segs 65535
```

可以看到输出里有 `vxlan` 字样，代表它的类型是 vxlan。那么 vxlan 具体如何工作呢？

1. `flannel.1` 收到请求，查找目标的 MAC 地址。请求包需要发往 `10.244.2.0`，
   `flannel.1` 需要决定，转发给哪个 MAC 地址才有可能到最终的目的地，这里和传统
   的转发没有区别，需要查找 ARP 表：

   ```
    [jinzhouz@centos72 ~]$ arp
    Address                  HWtype  HWaddress           Flags Mask            Iface
    10.244.2.0               ether   16:c7:83:3b:52:63   CM                    flannel.1
   ```

2. `flannel.1` 决定将包发往 `16:c7:83:3b:52:63` 地址，此时 vxlan 机制介入，将
   这个包封装成 UDP 包，但是它需要知道，`16:c7:83:3b:52:63` 物理地址对应的包，
   需要发到哪台机器上，此时需要查找转发表 fdb:

   ```
    [jinzhouz@centos72 ~]$ bridge fdb show
    16:c7:83:3b:52:63 dev flannel.1 dst 192.168.50.145 self permanent
   ```

3. 根据 fdb 表中的 `dst 192.168.50.145`，`flannel.1` 知道需要将 UDP 包发往
   `192.168.50.145` 这台机器。但真正发送又需要查找路由表：

   ```
    [jinzhouz@centos72 ~]$ route
    Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
    192.168.50.0    0.0.0.0         255.255.255.0   U     0      0        0 eth0
   ```

4. 于是 UDP 包从 `eth0` 网卡发出，当然过程中也需要查找 ARP，这些常规操作不再赘
   述。

## 接收方

接收方主要处理 vxlan 报文进行解包，同时要在网桥处需要转发到正确发送方，整体流
程如下：

{% asset_img Receiver.svg Receiver %}

1. 接收方 centos73 机器的 `eth0` 网卡接到 vxlan 的 UDP 包，将包解开发现是一个
   2 层的包，需要发往 `16:c7:83:3b:52:63`，即 centos73 上的 `flannel.1` 网卡
2. `flannel.1` 接收到包，发现是 3 层的发往 `10.244.2.3` 的包，查找路由表决定转
   发给 `cni0`：

    ```
    [jinzhouz@centos73 ~]$ route
    Kernel IP routing table
    Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
    10.244.2.0      0.0.0.0         255.255.255.0   U     0      0        0 cni0
    ```

3. `cni0` 接收到报文，需要决定发给哪个 MAC 地址，此时需要查 ARP 表：

    ```
    [jinzhouz@centos73 ~]$ arp
    Address                  HWtype  HWaddress           Flags Mask            Iface
    10.244.2.3               ether   ee:28:c4:70:20:89   C                     cni0
    ```

4. 于是 `cni0` 需要将包发给 `ee:28:c4:70:20:89`，但是 `cni0` 本身是个网桥
   (bridge)，相当于一个交换机连接了两根网线，现在要往哪个口发呢？先看 MAC 表

   ```
    [jinzhouz@centos73 ~]$ brctl showmacs cni0
    port no mac addr                is local?       ageing timer
      3     26:89:75:90:a4:6f       yes                0.00
      3     26:89:75:90:a4:6f       yes                0.00
      2     f2:7f:88:e2:e9:b6       yes                0.00
      2     f2:7f:88:e2:e9:b6       yes                0.00
   ```

5. 由于 MAC 表里没有 `ee:28:c4:70:20:89` 的条目，于是 `cni0` 会先将请求广播，
   两个口都发包，等待请求，当然最终会由 `vethc3fdc583` 网卡响应，也可以看到
   MAC 表的更新：

   ```
    [jinzhouz@centos73 ~]$ brctl showmacs cni0
    port no mac addr                is local?       ageing timer
      3     26:89:75:90:a4:6f       yes                0.00
      3     26:89:75:90:a4:6f       yes                0.00
      2     ee:28:c4:70:20:89       no                 3.13      # 新条目
      2     f2:7f:88:e2:e9:b6       yes                0.00
      2     f2:7f:88:e2:e9:b6       yes                0.00
   ```

6. 于是，请求发往 `vethc3fdc583` 网卡，并由于 VETH 的作用，相当于发到了 pod
   `spring-test-77d9d6dcb5-m9mvr` 对应的网卡上，到达目的地。

## Flannel 的作用

上面提到的内容里，除了 `flannel.1` 网卡的名字，其它内容似乎看不到 Flannel 的身
影，那么 flannel 做了哪些事呢[^flannel-job]？

1. flanneld 在宿主机启动时会为宿主机注册子网，如 `10.244.1.0`；添加到其它宿主
   机的路由条目；同时为 `flannel.1` 配置 vxlan 模式（当然也支持其它模式）

   ```
    [jinzhouz@centos72 ~]$ route
    Kernel IP routing table
    Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
    10.244.0.0      10.244.0.0      255.255.255.0   UG    0      0        0 flannel.1
    10.244.1.0      0.0.0.0         255.255.255.0   U     0      0        0 cni0
    10.244.2.0      10.244.2.0      255.255.255.0   UG    0      0        0 flannel.1
   ```

2. 配置宿主机 ARP 条目，将其它宿主机的子网，如 `10.244.2.0` 指向 `flannel.1`
   网卡，且目标地址是对方宿主机上 `flannel.1` 的 MAC，如 `16:c7:83:3b:52:63`

   ```
    [jinzhouz@centos72 ~]$ arp
    Address                  HWtype  HWaddress           Flags Mask            Iface
    10.244.0.0               ether   86:e4:96:71:0a:45   CM                    flannel.1
    10.244.2.0               ether   16:c7:83:3b:52:63   CM                    flannel.1
   ```

3. 配置 FDB 表，将发送给 `16:c7:83:3b:52:63` 的请求，通过 `192.168.50.145` 发
   送

   ```
    [jinzhouz@centos72 ~]$ bridge fdb show
    16:c7:83:3b:52:63 dev flannel.1 dst 192.168.50.145 self permanent
    86:e4:96:71:0a:45 dev flannel.1 dst 192.168.50.48 self permanent
   ```

可以看到 flannel 的主要作用就是自动创建资源，然后（监听 etcd 中关于节点变动的
消息）动态对 ARP、FDB 表做维护。

[^flannel-job]: [容器网络 flannel 主要 backend 基本原理和验证](http://yangjunsss.github.io/2018-07-21/容器网络-Flannel-主要-Backend-基本原理和验证/)

## 小结

本文是博主自己在学习 Flannel 过程中，结合现有的环境做的一些“验证”，尝试去理解
Flannel 中各个环节的机制，具体来说有：

- namespace 隔离和 veth 机制打通 namespace
- bridge 的工作原理，可以类比交换机
- vxlan 的工作机制，以及 fdb 表的工作机制
- 复习了 2 层、3 层网络知识，复习路由表、ARP 表的作用

另外在实验过程中尝试过用 tcpdump 抓包验证，的确可以验证一些关键信息，如发送接
收了 UDP 封装的 vxlan 包，包的 MAC 地址在流转中变化等。但具体流经哪张网卡，以
及其中的查表机在tcpdump中无法体现，因此这里也没有做记录。

当然，计算机网络是非常复杂的，博主也并非网工专业人士，如有理解不到位之处，请评
论区指出。

## 参考

- [How Do Kubernetes and Docker Create IP Addresses?!](https://dustinspecker.com/posts/how-do-kubernetes-and-docker-create-ip-addresses/) 详细介绍了宿主机和 pod/container 的网络机制
- [深入理解kubernetes（k8s）网络原理之五-flannel原理](https://cloud.tencent.com/developer/article/1871939) 对 flannel 运行过程讲解得比较详细
- [In k8s, how the bridge cni0 know which veth to go for a packet](https://github.com/containernetworking/cni/issues/702) 解释 cni0 的工作原理，但感觉不是特别明确，需要有额外的知识才能理解
