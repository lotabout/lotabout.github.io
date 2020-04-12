title: 低延时场景不要用 Webflux
toc: true
date: 2020-04-12 09:54:45
tags: [webflux, reactor, benchmark, java]
categories: [Notes]
---

Webflux 号称性能强悍，实际项目里却发现性能不升反降。经验上，当后端服务的响应时
间小于10ms，则异步非阻塞提升不明显，甚至效果变差。本文会将对此做验证。

（注：性能相关的结论只能作为经验结论，实际程序的表现还是需要实际 profile）

## 实验设置

数据流如下：通过 jmeter 发送 POST 请求到 TestService，转发流量到后端服务。

{% asset_img Experiment-Setup.svg Experiment Setup %}

这里发送的请求是 POST 请求，发送内容是约为 800B 的 Json 来保证一定程度上的计算
量，目的是为了模拟真实的使用场景。事实上如果只是转发 GET 而没有任何计算，则
webflux 完胜 blocking 的方式。

## 实验结果

结论：在 Backend 低延时(<10ms)的情况下，Webflux 的的彼时和吞吐都普遍不如
blocking 的方式。

{% asset_img Webflux-vs-Sync.svg Experiment Result %}

上图中，左图代表延时，右图代表吞吐，横坐标是后端 sleep 的毫秒数。横坐标是 log
坐标，用以保证 <10ms 的密集区可以较好地展示。延时只关心 99 分位和 999 分位（图
中同颜色的线，下方代表 99 分位，上方代表 999 分位），不用关心绝对值，只需要关
注蓝线和红线的相对位置。解读如下：

* 左边 4 图中，当后端 sleep < 10ms 时，99 分位的蓝线都要低于红线，代表同步延时
    要低于 webflux
* sleep < 10ms 时，999 分位的蓝线普遍低于红线，但也有例外
* 右边 4 图的吞吐，在 sleep < 10ms 时蓝线均低于红线。代表同步的吞吐更高
* 灰线代表的直接发送的方式不同情况下延时和吞吐都有波动，目前还没想明白原因
* 当压力和后端延时增加时，webflux 的优势也慢慢体现

详细实验结果参见：[Webflux vs Sync](https://docs.google.com/spreadsheets/d/1BDWcwZhEx2SczAXUteRQhYk5DIpwv3m6E5P6EU3vNp4/edit?usp=sharing)。

## 测试代码

Backend 代码：

```java
@PostMapping("/post/{ms}/{numItems}")
public Mono<Map<String, Object>> postAsync(@PathVariable long ms, @PathVariable int numItems, @RequestBody Map<String, Object> request) {
    Map<String, Object> response = new HashMap<>();

    // consume request
    long requestLength = request.entrySet().stream()
            .map(Object::toString)
            .mapToInt(String::length)
            .sum();
    response.put("total", requestLength);

    // insert random items
    for (int i=0; i<numItems; i++) {
        response.put("random_" + i, UUID.randomUUID().toString());
    }

    // sleep
    if (ms > 0) {
        return Mono.delay(Duration.ofMillis(ms)).map(it -> response);
    } else {
        return Mono.just(response);
    }
}
```

同步代码如下，注意 http client 的最大连接数设置为 300，tomcat 线程数默认为
200。

```java
@PostMapping("/post/{ms}/{numItems}")
public String post(@PathVariable long ms, @PathVariable int numItems, @RequestBody Map<String, Object> request) throws IOException {
    String url = String.format("http://%s/post/%d/%d", baseUrl, ms, numItems);
    StringEntity entity = new StringEntity(objectMapper.writeValueAsString(request), ContentType.APPLICATION_JSON);
    HttpPost httpPost = new HttpPost(url);
    httpPost.setEntity(entity);
    HttpEntity responseEntity = httpClient.execute(httpPost).getEntity();
    return EntityUtils.toString(responseEntity);
}
```

Webflux 异步发送代码如下：


```java
@PostMapping("/post/{ms}/{numItems}")
public Mono<String> post(@PathVariable long ms, @PathVariable int numItems, @RequestBody Map<String, Object> request) {
    String url = String.format("http://%s/post/%d/%d", baseUrl, ms, numItems);
    return webClient.post()
            .uri(url)
            .body(BodyInserters.fromValue(request))
            .retrieve()
            .bodyToMono(String.class);
}
```

发送的 Json 为：

```json
{
    "random1": 1, "random2": 2, "random3": 3, "random4": 4, "random5": 5,
    "random6": 6, "random7": 7, "random8": 8, "random9": 9, "random10": 10,
    "random11": 11, "random12": 12, "random13": 13, "random14": 14, "random15": 15,
    "random16": 16, "random17": 17, "random18": 18, "random19": 19, "random20": 20,
    "random21": 21, "random22": 22, "random23": 23, "random24": 24, "random25": 25,
    "random26": 26, "random27": 27, "random28": 28, "random29": 29, "random30": 30,
    "random31": 31, "random32": 32, "random33": 33, "random34": 34, "random35": 35,
    "random36": 36, "random37": 37, "random38": 38, "random39": 39, "random40": 40,
    "random41": 41, "random42": 42, "random43": 43, "random44": 44, "random45": 45,
    "random46": 46, "random47": 47, "random48": 48, "random49": 49, "random50": 50,
    "random51": 51, "random52": 52
}
```

## 详细实验设置

* 分别对 sleep 1-10, 20, 30, 40, 50ms 的 Backend 进行压测，numItems 均为 1
* 压测使用 Jmeter（尝试过 wrk，结果不准确）
* 分别用 50, 100, 200, 300 线程发送请求
* 每次实验压测 1 分钟。
* JVM 参数中 `Xmx` 和 `Xms` 均设置为 4G
* Jmeter 到 TestService 使用长连接，TestService 到 Backend 使用库的默认选项（应该都是短连接）。

## 小结

要再次强调的是：实验不代表真实使用场景。本实验也只是尝试模拟博主自己的使用场景
，而且是事后验证，先是生产遇到不升反降，再反过来验证。

结论：在 IO 延时小的情况下，webflux 的性能不如同步阻塞的方法

从原理来说，webflux 所代表的异步非阻塞的主要作用是使用少量的线程资源处理大量的
IO ，也就是**提高吞吐**，但是提交任务和 worker thread 抢占任务执行等等都有开销
，而这部分开销和同步阻塞的线程创建和切换的开销相比，究竟谁优谁劣，就需要在程序
中实际验证了。

不过从技术选型的角度，文章得出的结论是，webflux 不适用于低延时的场景。

## 参考

Webflux 文档中关于性能的描述：

> Performance has many characteristics and meanings. Reactive and non-blocking
> generally do not make applications run faster. They can, in some cases, (for
> example, if using the WebClient to execute remote calls in parallel). On the
> whole, it requires more work to do things the non-blocking way and that can
> increase slightly the required processing time.
>
> https://docs.spring.io/spring/docs/current/spring-framework-reference/web-reactive.html#webflux-performance


- [Spring Boot performance battle: blocking vs non-blocking vs reactive](https://medium.com/@filia.aleks/microservice-performance-battle-spring-mvc-vs-webflux-80d39fd81bf0) 对后端高延时的情况进行测试，结论是 webflux 均好于其它情况
- [SpringBoot 2 performance — servlet stack vs WebFlux reactive stack](https://medium.com/@the.raj.saxena/springboot-2-performance-servlet-stack-vs-webflux-reactive-stack-528ad5e9dadc) Webflux 不几乎不损失性能下能极大提高吞吐
