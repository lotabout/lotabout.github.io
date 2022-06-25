title: iptables 实用教程
toc: true
date: 2022-06-23 20:38:11
tags: [iptables, network]
categories: [Knowledge]
---

最近在搞科学上网，抄了一些 iptables 的规则不管用，干脆好好学习一番，写一写我的
理解。

## Iptables 是一门配置语言

它是一门配置语言。用来在网络处理的各个环节里加 Hook。常见的用途是做防火墙，做
流量的转发等等。

像学习其它语言一样，语言本身有语法，语法之外还需要学习库函数。iptables 的语法
大概如下：

```sh
iptables [-t table] {-I | -A | -D | -R} chain rule_specification
```

iptables 里有 `table` 和 `chain` 的概念，代表机器处理网络包的各个阶段，因此在
指定配置时需要先指定配置在哪个阶段生效。之后是配置处理的规则，规则语法如下：


```
rule-specification = [matches...] [target]

match = -m matchname [per-match-options]

target = -j targetname [per-target-options]
```

一个规则可以有多个 `match` 匹配条件，以及一个 `target` 作为目标。它表明当一个
网络包命中这些规则时，执行 `target` 目标。另外，iptables 是可（由其它模块）扩
展的，扩展会提供新的 match 和新的 target。我们先看一个典型示例：

```sh
iptables -t nat -A PREROUTING -p tcp -j REDIRECT --to-ports 7892
```

这个规则的作用是将所有的 `tcp` 流量，全部转发到 `7892` 端口。这里的 `-p tcp`
条件选中 tcp 流量是 iptables 默认支持的，但 `REDIRECT` 转发操作是扩展提供的。

## Table and Chain

要学习语言，要先了解语言背后的执行模型（类比栈、指针等），iptables 的作用是在
各个环节里增加 hook，那有哪些 hook 可以用呢？先看下图[^ref-netfilter]：

[^ref-netfilter]: https://www.netfilter.org/documentation/HOWTO/netfilter-hacking-HOWTO.txt

```text
  --->PRE------>[ROUTE]--->FWD---------->POST------>
                   |                ^
                   |                |
                   |             [ROUTE]
                   v                |
                   IN              OUT
                   |                ^
                   v                |
```

一个包从左侧进入系统，先到 `PRE` 环节。接着进入 `[ROUTE]` 阶段做路由，来决定包
的去向。如果本机是目标地址则接收，否则尝试转发，亦或者丢弃。

对于本机接收的包，触发 `IN` 环节后交给对应的应用程序；转发的包在触发 `FWD`环节
后尝试向外发包。外出的包最后还会经过 `POST` 环节，做最后的处理后发往网卡。

本机应用程序发出的包，会先经过 `OUT` 环节处理，之后经过 `[ROUTE]` 决定去向
[^route-called-first]，最终再经过 `POST` 环节后发出。

[^route-called-first]: 按文档所说，实际上路由的代码在 `OUT` 之前就被调用，用来获取源 IP 和一些其它的 IP 选项

在这些 hook 的基础上，iptables 用 "table" 的概念来组织常见的包修改需求。例如：

- Filter: 来做包过度
- Nat: 做地址转换
- Mangle: 其它的通用的包修改
- Raw: 处理一些 connection track 生效之前的修改

```text
# modified from https://www.netfilter.org/documentation/HOWTO/netfilter-hacking-HOWTO.txt

--->PRE------>[ROUTE]--->FWD---------->POST------>
    Raw          |       Mangle   ^    Mangle
    ConnTrack    |       Filter   |    NAT (Src)
    Mangle       |                |
    NAT (Dst)    |             [ROUTE]
                 v                |
                 IN Mangle       OUT Filter
                 |  NAT           ^  NAT (Dst)
                 |  Filter        |  Mangle
                 |                |  ConnTrack
                 v                |  Raw
```

具体使用时，先决定要做的修改是什么内容，决定 table 名，然后找到 hook 的时机，
决定 chain 的名字。当然 iptables 允许用户增加自己的 chain，但用户增加的 chain
并不能决定 hook 的时机。

例如下面的例子里，我们要把所有流量转发到 `7892` 端口，我们通过 `man
iptables-extensions` 查到，它只能加到 `nat` 表的 `PREROUTING` 或 `OUTPUT`
链，由于我们要转发入口流量，所以修改的是 `PREROUTING` chain。

```sh
iptables -t nat -A PREROUTING -p tcp -j REDIRECT --to-ports 7892
```

`REDIRECT` 的限制也很容易理解，转发需要支持源、目标地址的改写，因此属于 `nat`
表的范畴，而它需要在路由之前做修改（否则改了也发不出去），所以只能在
`PREROUTING` 和 `OUTPUT` hook 里处理。

## Rule 执行顺序

上面我们提到 iptables 是通过 table, chain 来组织切入点的，一个 chain 上可以配
置多条规则，用户还可以自己创建 chain 来管理规则。那么 iptables 在是如何使用这
些规则的呢？

正常情况下规则会一条条向下匹配，iptables 有一些特殊的 target 也提供了一些特殊
的操作来在规则中跳转的能力（可以类比编程语言中的 `continue`, `break`），如下图：

{% asset_img iptables-order.svg execution order %}

- JUMP(`-j <chain>`)：跳转到自定义的 chain 里
- ACCEPT：流量通过当前 table + chain，不再匹配任何规则
- RETURN：从当前 chain 跳出，回到上一个 chain 跳转的位置
- DROP：丢弃流量，不再匹配任何 table 任何 chain

此外也得注意一些扩展 target 的语义，如 `REDIRECT` 相当于 `ACCEPT`；如 `REJECT`
相当于 `DROP`，会在发送终止包后丢弃数据包。实操如果发现有问题，要注意是不是规
则顺序引起的。

## 常用的扩展

上面我们了解了 iptables 的语法和执行顺序，接下来要学习“库函数”，表面上学习库函
数就是学习“扩展”提供了哪些 match 和 target，但真正的难点是学习它们背后的网络处
理机制。这里我们简单提几个。

### fwmark

Firewall Mark(fwmark) 可以理解成一个 iptables 的扩展，它提供了 `MARK` 和
`CONNMARK` 的 target，允许我们把一个数据包或一个连接打上标记。之后在其它地方可
以使用这个标记。

典型的使用方式是让有某个标记的流量走某个特殊的路由表[^ref-clash-tproxy]，例如：

[^ref-clash-tproxy]: https://lancellc.gitbook.io/clash/start-clash/clash-udp-tproxy-support

```sh
ip rule add fwmark 1 table 100
ip route add local default dev lo table 100

iptables -t mangle -A OUTPUT -p udp -d 198.18.0.0/16 -j MARK --set-mark 1
```

其中的 `ip rule add fwmark 1 table 100` 是创建了一张名为 `100` 的路由表，并指
定当 `fwmark` 为 1 时才查这张表。而下面的规则指定了 `-p udp` 匹配 UDP 流量，且
目标地址为 `-d 198.18.0.0/16` 时执行 `-j MARK` 操作，把数据包打上 `--set-mark
1` 这个标记。

成果是目标地址为 `198.18.0.0/16` 的 UDP 流量会查 100 路由表。

### NAT: SNAT, DNAT, MASQUERADE

Network Address Translation 的变种比较多，但思路还是容易理解的。在网络隔离的情
况下，如果想两个网段里交换网络包，则需要在路由器（能同时访问两个网段）里对包做
地址转换，如下所示：

{% asset_img iptables-NAT.svg NAT %}

SNAT 是换了源 IP 字段，所以一般用于出口流量；DNAT 换了目标 IP 字段，所以一般用
于做“端口映射”来穿透内网。可以看到不论是 SNAT 还是 DNAT 都需要提供目标的 IP 地
址。而 `MASQUERADE` 可以理解成 SNAT 的变种，它可以自动填写对应网卡的 IP，不需
要手工指定了，一般用于路由器流量内外网转发。

另外从图里看到，无论是 SNAT 还是 DNAT，都需要维护一张 NAT 映射表，可以通过
`conntrack -L` 看到。如果在路由器的 SNAT 里，`--to-source` IP 不是本机会怎么样
呢？连接会建立失败，路由还是正常记录了 NAT 映射表，但 ACK 包会直接发到
`--to-source` IP 上，被丢弃。

额外的，TCP 流量只有在连接建立时会查 iptables NAT 表，同个连接后续的包会沿用建立连接时
的规则。

## 参考

- [A Deep Dive into Iptables and Netfilter Architecture](https://www.digitalocean.com/community/tutorials/a-deep-dive-into-iptables-and-netfilter-architecture) 介绍了 hook 和 table 的作用
- [Iptables Flow](https://lucid.app/lucidchart/eb1b46d7-653f-4c5a-b421-ba8c075fb278/view?page=0_0#) 一个简化但容易理解的 iptables 流程图
- [Packet flow in Netfilter and General Networking](https://upload.wikimedia.org/wikipedia/commons/3/37/Netfilter-packet-flow.svg) 一张复杂但全面的流程图
- `man iptables-extensions` 各种扩展支持的 match, target 都有说明
