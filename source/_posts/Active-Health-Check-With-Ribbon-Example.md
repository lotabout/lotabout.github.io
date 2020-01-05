title: 主动健康检查要点(Ribbon 为例)
toc: true
date: 2020-01-05 09:34:14
tags: [health check, ribbon]
categories: [Notes]
---

之前的文章 {%post_link QQA-How-does-nginx-health-check-work %} 介绍了 Nginx 如
何做被动健康检查(passive health check)，本文以
[Ribbon](https://github.com/Netflix/ribbon) 为例，介绍主动健康检查(active
health check) 有哪些注意点。

## 典型流程

典型的主动检查需要客户端至少有一个 ping thread，定期检测服务器是否健康，流程如
下图：

{% asset_img Active-Health-Check.svg Active Health Check %}

1. Ping thread 检测到两个服务器都正常工作
2. 于是客户端会将请求分发到两个服务器上
3. 此时 Server 2 宕机，发送到该机器的请求处理失败，返回错误
4. 由于新一轮的检测还没有开始，客户端没有意识到服务器已宕机，依旧将请求分发给
   Server 2
5. 新一轮 Ping 检测到 Server 2 宕机，将其标记为不可用
6. 于是客户端将所有请求分发到 Server 1
7. 此时 Server 2 恢复正常，但由于还没有被客户端检测到，不会向它分发请求
8. 新一轮 Ping 检测到 Server 2 恢复，将其标记为可用
9. 客户端重新将请求分配给 Server 2

## Ribbon 相关实现

要实现上节中的策略，Ribbon 对其中的关键节点做了相应的抽象：

1. `Server` 代表服务器，`.setAlive(boolean)` 方法可标记服务是否健康
2. `IPing.isAlive(Server server)` 用于检测服务是否健康。`DummyPing` 实现不对服
   务进行检测，`ribbon-httpclient` 包中的 `PingUrl` 实现则会请求指定 URL，根据
   返回是否符合预期来判断服务是否健康
3. `IPingStrategy` 接口定义以什么策略来 ping 多台服务器，默认是顺序 ping，ping
   完一台 ping 下一台
4. `IRule` 定义如何分发请求，默认是轮流选择（round-robin），会跳过标记为不可用
   的服务
5. `ILoadBalancer` 代表负载均衡，在创建时需要指定上述的各项元素

简单使用示例如下（代码不可直接运行）：

```java
IRule rule = new RetryRule(new RoundRobinRule(), maxRetryMills);
IPing ping = new PingUrl(false, healthUrl);
((PingUrl) ping).setPingAppendString(healthExpected.trim());

BaseLoadBalancer loadBalancer = new BaseLoadBalancer(ping, rule);
loadBalancer.addServers(endpoints.stream().map(Server::new).collect(Collectors.toList()));
loadBalancer.setPingInterval(pingIntervalSeconds);

MyLoadBalancerContext context = MyLoadBalancerContext(loadBalancer);

Server server = context.getLoadBalancer().chooseServer(null);
URI newUri = context.reconstructURIWithServer(server, originalUrl);

// do what ever you want with newUri
```

## 注意点

其实上述流程还有一些缺陷，需要在具体实现中注意：

* 在步骤 #3 中，Server 2 宕机导致请求失败时，要如何处理？（是否需要类似被动检
    查中的故障转移？）
    * 是否要重试？重试是对当前服务还是转发到其它服务？
    * 是否需要将当前服务标记为不可用？防止 #4 时继续向它发送请求？
* Ping 的时间间隔多少合适？间隔太短则会产生大量检测流量，太大则对服务变化不敏
    感。

在 Ribbon 中，有 `RetryRule` 策略，在选择 Server 时，如果发现 `server.isAlive =
false`，则会等待一段时间，期间如果 `server.isAlive` 变成 true 则继续请求，否则
则返回错误。在 PingUrl 检查机制下，其实只可能等待下次 Ping 成功 isAlive 才可能
变成 true，所以重试也没有太多实际用处。但如果 Ping 的方式是类似 eureka 这种注
册中心通知的机制，则可以发挥作用。

另外因为 Ribbon 的边界是选择服务器，因此如果是请求结果错误（如连接失败），并不
会直接反映到 Ribbon 的 Server 状态。因此如果需要的话，需要自己手工将对应的
server 的 isAlive 设置成 false 来标记为不可用。

## 参考

- [聊聊WebClient的LoadBalance支持](https://www.jianshu.com/p/f09fa02a383f) 如何用 Ribbon 为 webclient 添加负载均
    衡
- [Spring Cloud系列(四)：客户端负载均衡 Ribbon](http://www.gxitsky.com/2019/03/03/springcloud-04-client-loadbalancer-ribbon-1/) 讲解了一些 Ribbon 的使用方法
- [RetryRule.java#L86](https://github.com/Netflix/ribbon/blob/master/ribbon-loadbalancer/src/main/java/com/netflix/loadbalancer/RetryRule.java#L86) RetryRule 的具体实现
