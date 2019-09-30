title: HTTP keep-alive 二三事
toc: true
date: 2019-09-29 10:48:20
tags: [tcp, keep-alive, Spring]
categories: [Notes]
---

HTTP keep-alive 也称为 HTTP 长连接。它通过重用一个 TCP 连接来发送/接收多个
HTTP请求，来减少创建/关闭多个 TCP 连接的开销。keep-alive 用不用？怎么用？

## 什么是 keep-alive?

keep-alive 是客户端和服务端的一个约定，如果开启 keep-alive，则服务端在返回
response 后不关闭 TCP 连接；同样的，在接收完响应报文后，客户端也不关闭连接，发
送下一个 HTTP 请求时会重用该连接。

在 HTTP/1.0 协议中，如果请求头中包含：

```
Connection: keep-alive
```

则代表开启 keep-alive，而服务端的返回报文头中，也会包含相同的内容。

在 HTTP/1.1 协议中，默认开启 keep-alive，除非显式地关闭它：

```
Connection: close
```

## 用还是不用，这是个问题

keep-alive 技术创建的目的，就是能在多次 HTTP 之间重用同一个 TCP 连接，从而减少
创建/关闭多个 TCP 连接的开销（包括响应时间、CPU 资源、减少拥堵等），参考如下示
意图（来源：维基百科）：

{% asset_img keep-alive-demonstration.svg Keep Alive Demonstration %}

然而天下没有免费的午餐，如果客户端在接收完所有的信息之后还没有关闭连接，则服务
端相应的资源还在被占用（尽管已经没用了）。例如 Tomcat 的 BIO 实现中，未关闭的
连接会占用对应的处理线程，如果一个长连接实际上已经处理完毕，但关闭的超时时间未
到，则该线程会一直被占用（使用 NIO 的实现没有该问题）。

显然，如果客户端和服务端的确需要进行多次通信，则开启 keep-alive 是更好的选择，
例如在微服务架构中，通常微服务的使用方和提供方会长期有交流，此时最好开启
keep-alive。

在一些 TPS/QPS 很高的 REST 服务中，如果使用的是短连接（即没有开启keep-alive）
，则很可能发生客户端端口被占满的情形。这是由于短时间内会创建大量TCP 连接，而在
TCP 四次挥手结束后，客户端的端口会处于 TIME_WAIT一段时间(2*MSL)，这期间端口不
会被释放，从而导致端口被占满。这种情况下最好使用长连接。

## 客户端如何开启？

现在我们用到的几乎所有工具都是默认开启长连接的：

* 对于浏览器而言，几乎你现在用的浏览器（包括 IE6）都默认使用 keep-alive 了。
* Java8 中的 `HttpURLConnection` 默认开启长连接，但是默认连接池中只保留 5 个长
    连接[^1]，如果同时超过 5 个线程在使用，则会创建新的连接，结束后多于 5 个的
    部分会被客户端主动关闭。
* Apache `HttpClient` 默认为每个地址保留 2 个长连接，连接池中最多共保留 20 个连接[^2]。
* Python requests 如果使用 session 则会默认开启长连接。

[^1]: https://docs.oracle.com/javase/8/docs/technotes/guides/net/http-keepalive.html
[^2]: https://hc.apache.org/httpcomponents-client-ga/tutorial/html/connmgmt.html#d5e393

下面是一些代码备忘：

<details>
<summary>Feign 使用 HttpClient 连接池示例</summary>

```java
PoolingHttpClientConnectionManager connectionManager = new PoolingHttpClientConnectionManager();
connectionManager.setMaxTotal(maxConnections);
connectionManager.setDefaultMaxPerRoute(maxConnectionsPerRoute);

CloseableHttpClient httpClient = HttpClients
    .custom()
    .setConnectionManager(connectionManager)
    .build();

return Feign.builder()
        .client(new ApacheHttpClient(httpClient))
        .options(new Options(connectTimeoutMills, readTimeoutMills))
        .retryer(new Default(retryPeriod, retryMaxPeriod, retryMaxAttempts))
        .encoder(new JacksonEncoder(JsonUtil.getObjectMapper()))
        .decoder(new JacksonDecoder(JsonUtil.getObjectMapper()))
        .decode404()
        .target(PredictorFeignService.class, endpoint);
```
</details>

## 服务端如何实现

不同的服务端对 keep-alive 的实现方式不同，就连 tomcat 不同的工作模式下，处理的
方式也不同。这里大致说下 NIO 模式(tomcat 9.0.22)下的处理逻辑：

- 在 `NioEndpoint#SocketProcessor` 类中，只会关闭内部状态为 `CLOSED` 的端口：

    ```java
    if (state == SocketState.CLOSED) {
        poller.cancelledKey(key, this.socketWrapper);
    }
    ```

- 而在 `Http11Processor#service` 方法中，如果是 keep-alive 的连接，最终的内部状态会是 `OPEN`
    ```java
    } else if (this.openSocket) {
        return this.readComplete ? SocketState.OPEN : SocketState.LONG;
    } else {
    ```
- 被保留的连接，超时时间之后，会在 `NioEndpoint#Poller#timeout` 方法中被关闭：
    ```java
    } else if (!NioEndpoint.this.processSocket(socketWrapper, SocketEvent.ERROR, true)) {
        this.cancelledKey(key, socketWrapper);
    }
    ```

另外，如果使用 spring boot，可以通过 `server.connection-timeout` 配置项来调整
keep-alive 连接的保留时间，如果不设置则为每个 server 自己的默认配置，Tomcat 默
认为 60s[^3]。

[^3]: https://github.com/apache/tomcat/blob/master/java/org/apache/coyote/http11/Constants.java#L28

## 抓包实验

抓包之下，再复杂的逻辑也将显露无疑。我们使用
[Wireshark](https://www.wireshark.org) 抓包，看到使用了 keep-alive 的请求如下：

{% asset_img wireshark-persistent-connection.jpg Wireshark keep-alive demo %}

* 第二次 Http 请求时，并没有创建的连接的过程（没有 `SYN`），而是重用之前的连接
* 在默认 60s 超时后，由服务端发送 `FIN` 报文关闭连接。

而不开启 keep-alive 的请求过程如下：

{% asset_img wireshark-two-connection.jpg Wireshark two connection %}

可以看到，与 keep-alive 不同，每次请求结束时都关闭当前连接，之后重新创建新的连
接。

## 小结

文章比较杂，可能真正有用的就是：如果使用基于 Http 的微服务，可以使用长连接来解
决一些问题。

## 参考

- [HTTP Keepalive Connections and Web
    Performance](https://www.nginx.com/blog/http-keepalives-and-web-performance)
    Nginx 谈长连接与服务器性能的关系（文章比较老）
- {% post_link TCP-connection-establish-and-termination %} 本站的文章，复
    习 TCP 连接的状态转换，尝试理解 TIME_WAIT 的影响
- https://techblog.bozho.net/caveats-of-httpurlconnection/ 使用
    HttpURLConnection 的一些坑
- [Appendix A. Common application properties](https://docs.spring.io/spring-boot/docs/current/reference/html/common-application-properties.html) Spring Boot 通用配置项
