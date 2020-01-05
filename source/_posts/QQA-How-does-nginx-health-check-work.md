title: 'QQA: Nginx 如何做健康检查?'
toc: true
date: 2019-12-20 15:34:50
tags: [QQA, nginx, health check]
categories: [QQA]
---

开源版的 Nginx 支持被动健康检查(passive health check)，包含两个参数
`max_fails` 和 `fail_timeout`。那么它内部又是如何运行的呢？

* `max_fails`: 尝试连接时，如果失败的次数大于 `max_fails`，则暂时将
    服务标记为不可用（默认为 1）
* `fail_timeout`: 服务标记不可用后的 `fail_timeout` 时间内，不会再尝
    试连接该服务（默认为 10s）

## 示例配置

取自 [nginx 官方文档
](https://docs.nginx.com/nginx/admin-guide/load-balancer/http-health-check/)，
会尝试连接 backend2 `3` 次后才将它标记为不可用，标记不可用后 `30s` 再重试。

```
upstream backend {
    server backend1.example.com;
    server backend2.example.com max_fails=3 fail_timeout=30s;
}
```

## 内部原理

健康检查分为如下几个步骤：

1. 接收到请求时，Nginx 会以指定的方式（如 Round Robin）获取可用的服务
2. 获取可用服务时首先会尝试建立连接（推论：健康检查是在 TCP 层）。
3. 此时若连接失败，则将失败数 `fails` 加 1，并记录检查的时间 `checked`
4. 如果获取服务时发现 `fails >= max_fails` 且 `now - checked <= fail_timeout`，
   则认为该服务不可用
5. 推论：若距离 `checked` 超过了 `fail_timeout`，nginx 又会重新尝试连接
6. 若服务恢复正常，则重置失败次数 `fails = 0`

{% asset_img nginx-health-check.svg Nginx Health Check %}

如上图所示，注意下面几点：

1. 同一个请求，只会连接一个服务一次
2. 失败数会一直累加，直到服务恢复正常
3. 在 `fail_timeout` 起作用期间，认为服务不可用，不会尝试连接
