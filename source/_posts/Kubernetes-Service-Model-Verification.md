title: Kubernetes Service iptables 网络通信验证
toc: true
date: 2022-01-24 23:01:26
tags: [k8s, iptables, kube-proxy, service]
categories: [Knowledge]
---

> Kubernetes gives Pods their own IP addresses and a single DNS name for a set
> of Pods, and can load-balance across them.

K8s [Service](https://kubernetes.io/docs/concepts/services-networking/service/)
会为每个 Pod 都设置一个它自己的 IP，并为一组 Pod 提供一个统一的 DNS 域名，还可
以提供在它们间做负载均衡的能力。这篇文章会对 kube-proxy 的 iptables 模式内部的
机制做一个验证。大体上涉及的内容如下：

{% asset_img service.svg Service with IP tables %}

## 实验配置

创建一个 Service，配置如下：

```yaml
apiVersion: v1
kind: Service
metadata:
  creationTimestamp: "2022-01-23T02:32:38Z"
  name: spring-test
  namespace: default
  resourceVersion: "94418"
  uid: cdaab6bc-a518-4235-a161-a4cae6f564cf
spec:
  clusterIP: 10.1.68.7
  clusterIPs:
  - 10.1.68.7
  externalTrafficPolicy: Cluster
  internalTrafficPolicy: Cluster
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - nodePort: 31080
    port: 8080
    protocol: TCP
    targetPort: 8080
  selector:
    app: spring-test
  sessionAffinity: None
  type: NodePort
status:
  loadBalancer: {}
```

创建后的 service 如下：

```
$ k get svc -o wide -A
NAMESPACE     NAME          TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)                  AGE     SELECTOR
default       kubernetes    ClusterIP   10.1.0.1       <none>        443/TCP                  2d22h   <none>
default       sender        NodePort    10.1.177.169   <none>        8081:31081/TCP           46h     app=sender
default       spring-test   NodePort    10.1.68.7      <none>        8080:31080/TCP           2d4h    app=spring-test
kube-system   kube-dns      ClusterIP   10.1.0.10      <none>        53/UDP,53/TCP,9153/TCP   2d22h   k8s-app=kube-dns
```

注意其中的 spring-test 和 kube-dns 两项，后面会用到。另外 service 对应的 pod
IP 如下：

```
$ k get ep
NAME          ENDPOINTS                         AGE
kubernetes    192.168.50.48:6443                2d23h
sender        10.244.1.7:8080,10.244.2.7:8080   47h
spring-test   10.244.1.3:8080,10.244.2.3:8080   2d4h
```

## DNS

K8s 会为 Service 创建一个 [DNS](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/#a-aaaa-records)
域名，格式为 `<svc>.<namespace>.svc.<cluster-domain>`，例如我们创建的
`spring-test` Service 则会有
`spring-test.default.svc.cluster.local`[^change-cluster-name] 域名。

[^change-cluster-name]: `cluster.local` 是可以改的，但是比较麻烦，参考：https://stackoverflow.com/a/66106716

我们首先进入 pod，看一下 `/etc/resolv.conf` 文件，关于域名解析的配置：

```
nameserver 10.1.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

* 这里的 `10.1.0.10` 是 kube-dns service 的 cluster IP
* 文件中配置了多个 search 域，因此我们写 `spring-test` 或
  `spring-test.default` 或 `spring-test.default.svc` 都是可以解析的，另外注意
  解析后的 IP 也不是具体哪个 POD 的地址，而是为 Service 创建的虚拟地址
  ClusterIP。

    ```
    root@spring-test-77d9d6dcb5-m9mvr:/# nslookup spring-test
    Server:         10.1.0.10
    Address:        10.1.0.10#53

    Name:   spring-test.default.svc.cluster.local
    Address: 10.1.68.7

    root@spring-test-77d9d6dcb5-m9mvr:/# nslookup spring-test.default
    Server:         10.1.0.10
    Address:        10.1.0.10#53

    Name:   spring-test.default.svc.cluster.local
    Address: 10.1.68.7

    root@spring-test-77d9d6dcb5-m9mvr:/# nslookup spring-test.default.svc
    Server:         10.1.0.10
    Address:        10.1.0.10#53

    Name:   spring-test.default.svc.cluster.local
    Address: 10.1.68.7
    ```

* `ndots:5` 指的是如果域名中的 `.` 大于等于 5 个，则不走 search 域，目
    的是减少常规域名的解析次数[^k8s-dns-search]

[^k8s-dns-search]: 参考 https://hansedong.github.io/2018/11/20/9/

## iptables 转发

DNS 里创建的记录解决了域名到 ClusterIP 的转换问题，发送到 ClusterIP 的请求，如
何转发到对应的 POD 里呢？K8s Service 有几种实现方式，这里验证的是 iptables 的
实现方式：kube-proxy 会监听 etcd 中关于 k8s 的事件，并动态地对 iptables 做配置，
最终由 iptables 来完成转发。先看看跟这个 Service 相关的规则如下：

```
0.  -A PREROUTING -j KUBE-SERVICES
1.  -A KUBE-NODEPORTS -p tcp -m tcp --dport 31080 -j KUBE-SVC-S
2.  -A KUBE-SEP-A -s 10.244.2.3/32 -j KUBE-MARK-MASQ
3.  -A KUBE-SEP-A -p tcp -m tcp -j DNAT --to-destination 10.244.2.3:8080
4.  -A KUBE-SEP-B -s 10.244.1.3/32 -j KUBE-MARK-MASQ
5.  -A KUBE-SEP-B -p tcp -m tcp -j DNAT --to-destination 10.244.1.3:8080
6.  -A KUBE-SERVICES -d 10.1.68.7/32 -p tcp -m tcp --dport 8080 -j KUBE-SVC-S
7.  -A KUBE-SVC-S ! -s 10.244.0.0/16 -d 10.1.68.7/32 -p tcp -m tcp --dport 8080 -j KUBE-MARK-MASQ
8.  -A KUBE-SVC-S -p tcp -m tcp --dport 31080 -j KUBE-MARK-MASQ
9.  -A KUBE-SVC-S -m statistic --mode random --probability 0.50000000000 -j KUBE-SEP-B
10. -A KUBE-SVC-S -j KUBE-SEP-A
```

我们先用 `iptables-save` 打印出所有的规则，筛选出和 `spring-test` service
相关的规则，删除了一些 comment，并对名字做了简化。可以看到有这么几类：

* `KUBE-NODEPORTS`，这类规则用来将发送到 NodePort 的报文转到 `KUBE-SVC-*`
* `KUBE-SERVICES`：是识别目标地址为 ClusterIP(`10.1.68.7`)，命中的报文转到
  `KUBE-SVC-*` 做处理
* `KUBE-SVC` 的作用是做负载均衡，将请求分配到 `KUBE-SEP` 中
* `KUBE-SEP` 通过 DNAT 替换目标地址为 Pod IP，转发到具体的 POD 中

另外经常看到 `-j KUBE-MARK-MASQ`，它的作用是在请求里加上 mark，在
`POSTROUTING` 规则中做 SNAT，这点后面再细说。

我们开启 iptables 的 trace 模式[^iptables-trace]，并在其中一个 pod 发送一个请
求，检查 TRACE 中规则的命中情况（由于输出特别多，这里挑选了重要的输出并做了精
简）：

[^iptables-trace]: https://www.opensourcerers.org/2016/05/27/how-to-trace-iptables-in-rhel7-centos7/

```
0:  nat:PREROUTING    IN=cni0 OUT=           SRC=10.244.1.7 DST=10.1.68.7  DPT=8080
6:  nat:KUBE-SERVICES IN=cni0 OUT=           SRC=10.244.1.7 DST=10.1.68.7  DPT=8080
10: nat:KUBE-SVC-S    IN=cni0 OUT=           SRC=10.244.1.7 DST=10.1.68.7  DPT=8080
3:  nat:KUBE-SEP-A    IN=cni0 OUT=           SRC=10.244.1.7 DST=10.1.68.7  DPT=8080
    mangle:FORWARD    IN=cni0 OUT=flannel.1  SRC=10.244.1.7 DST=10.244.2.3 DPT=8080 
```

* 在 `PREROUTING` 时，进入第 6 条进判定
* `KUBE-SERVICES` 判断目标地址为 `10.1.68.7` 且目标端口为 `8080`，于是跳
    转进入 `KUBE-SVC-S` 链的判断
* `KUBE-SVC-S` 有多条规则，从日志看最终是从第 10 条退出，进入 `KUBE-SEP-A` 链
* `KUBE-SEP-A` 最终命中第 3 条规则退出，但此时会进行 DNAT 转换目标地址
* 下一条日志显示，`DST` 目标地址已经变成 pod 地址 `10.244.2.3` 了

类似的，如果我们是通过 NodePort 来访问 Service，则 Trace 日志如下：

```
0: nat:PREROUTING:      IN=eth0 OUT=     SRC=192.168.50.135 DST=192.168.50.238 DPT=31080
6: nat:KUBE-SERVICES:   IN=eth0 OUT=     SRC=192.168.50.135 DST=192.168.50.238 DPT=31080
1: nat:KUBE-NODEPORTS:  IN=eth0 OUT=     SRC=192.168.50.135 DST=192.168.50.238 DPT=31080
9: nat:KUBE-SVC-S:      IN=eth0 OUT=     SRC=192.168.50.135 DST=192.168.50.238 DPT=31080
9: nat:KUBE-SVC-S:      IN=eth0 OUT=     SRC=192.168.50.135 DST=192.168.50.238 DPT=31080
5: nat:KUBE-SEP-A:      IN=eth0 OUT=     SRC=192.168.50.135 DST=192.168.50.238 DPT=31080
   mangle:FORWARD:      IN=eth0 OUT=cni0 SRC=192.168.50.135 DST=10.244.1.3     DPT=8080
```

## iptables 负载均衡

上一节我们比较关注 iptables 转发的内容，那么如何做负载均衡？这部分是比较纯粹的
iptables 知识[^iptables-lb]:

[^iptables-lb]: [Turning IPTables into a TCP load balancer for fun and profit](https://scalingo.com/blog/iptables)

首先：iptables 对于规则的解析是严格顺序的，所以如果只是单纯列出两个条目，则会
永远命中第一条：

```
-A KUBE-SVC-S -j KUBE-SEP-A
-A KUBE-SVC-S -j KUBE-SEP-B
```

于是，我们需要第一条规则在某些条件下不命中。这样 iptables 就有机会执行后面的规
则。iptables 提供了两种方法，第一种是有随机数，也是上一节我们看到的：

```
-A KUBE-SVC-S -m statistic --mode random --probability 0.50000000000 -j KUBE-SEP-B
```

这条规则在执行时，iptables 会随机生成一个数，并以 `probability` 的概率命中当前
规则。换句话说，第一条命中的概率是 `p`，则第二条规则就是 `1-p`。如果有 3 个副
本，则会类似下面这样的规则，大家可以计算下最后三个 Pod 是不是平均分配：

```
-A KUBE-SVC-S --mode random --probability 0.33333333349 -j KUBE-SEP-A
-A KUBE-SVC-S --mode random --probability 0.50000000000 -j KUBE-SEP-B
-A KUBE-SVC-S -j KUBE-SEP-C
```

另外一种模式是 round-robin，但是 kubernetes 的 iptables 模式不支持，这里就不细
说了。猜想 kubernetes iptables 模式下不支持的原因是虽然单机 iptables 能支持
round-robin，但多机模式下，无法做到全局的 round-robin。

## SNAT

前面我们提到 KUBE 系列的规则经常看到 `-j KUBE-MARK-MASQ`，和它相关的规则有这些：

```
-A KUBE-MARK-MASQ -j MARK --set-xmark 0x4000/0x4000
-A KUBE-POSTROUTING -m mark ! --mark 0x4000/0x4000 -j RETURN
-A KUBE-POSTROUTING -j MARK --set-xmark 0x4000/0x0
-A KUBE-POSTROUTING -m comment --comment "kubernetes service traffic requiring SNAT" -j MASQUERADE
```

首先 `KUBE-MARK-MASQ` 的作用是把报文打上 `0x4000/0x4000` 的标记，在
`KUBE-POSTROUTING` 时，如果报文中包含这个标记，会执行 `-j MASQUERADE` 操作，而
这个操作的作用就是做源地址转换（SNAT）。那 SNAT 是什么，为什么要做 SNAT 呢？

这里引用[这篇文章](https://www.asykim.com/blog/deep-dive-into-kubernetes-external-traffic-policies)里的图做说明：

{% asset_img SNAT.svg SNAT or Not %}

如果没有 SNAT，被转发到 POD 的请求返回时，会尝试把请求直接返回给 Client，我们
知道一个 TCP 连接的依据是(src_ip, src_port, dst_ip, dst_port)，现在client 在等
待 `eIP/NP` 返回的报文，等到的却是 `pod IP` 的返回，client 不认这个报文。换句
话说，经过 proxy 的流量都正常情况下都应该原路返回才能工作。

在一些情况下可能希望关闭 SNAT，K8S 提供 `externalTrafficPolicy: Local` 的配置
项，但流量的流转也会发生变化，这里不深入。

## 小结

这篇文章和上一篇[Flannel 网络通信验证](https://lotabout.me/2022/Flannel-Verification/)类似，
都是尝试搭建环境，在学习 kube-proxy 工作机制的同时，对 kube-proxy 的产出
iptables 做一些验证。文章中验证了这些内容：

1. 验证了 service ClusterIP 和 domain 的创建，及 pod 中 `/etc/resolv.conf` 中
   搜索域的设置
2. 验证了 kube-proxy 生成的 iptables 规则，并验证请求在这些规则中的流转
3. 学习了 iptables 负载均衡的工作机制
4. 了解了 SNAT 是什么，kube-proxy 需要做 SNAT 的原因

这篇文章的信息量不大，希望读者也撸起袖子，实打实地做一些验证，能让我们对
kube-proxy 涉及的 iptables 的操作有更深刻的理解。

## 参考

- [A Guide to the Kubernetes Networking Model](https://sookocheff.com/post/kubernetes/understanding-kubernetes-networking-model/) 讲解了 K8S 的网络模型，有一些（动）图描述网络包的走向
- [Deep Dive kube-proxy with iptables mode](https://serenafeng.github.io/2020/03/26/kube-proxy-in-iptables-mode/) 深挖 kube-proxy 在 iptables 模式下的工作原理，比本文更深入
- [Debug Service](https://kubernetes.io/docs/tasks/debug-application-cluster/debug-service/) K8S 官方文档，讲解 Service 不工作时常见的 Debug 方法
