title: 'QQA: 什么是 Servlet'
date: 2018-03-31 10:16:52
tags: [QQA, java, servlet]
categories: [QQA]
toc:
---

Servlet 没有标准的中文译名，我们会在学习 Java Web 编程（如 Spring）时遇到，你
知道它是什么吗？

（Quick Question and Answer 系列旨在对小问题做简短解答）

## 什么是 Servlet

英语里 `-let` 后缀代表“小型的”，如 "booklet" 是小册子，所以 'Servlet'可以认为是“小 Server”。

- 狭义上，Servlet 是一个接口，定义在 `javax.servlet.Servlet`。
- 广义上，任何实现了 Servlet 接口的程序都可以叫作 Servlet

## Web 应用的结构

假设我们要写一个 Web 应用，什么框架都不用，应该从何做起？一般来说，我们需要：

1. 监听 TCP 请求，并解析出 TCP 中的 HTTP 请求
2. 有了 HTTP 请求，我们需要根据 HTTP 请求找到对应的函数来执行（路由）
3. 实现函数中的 business 逻辑，例如从数据库里查询数据，做操作，生成返回的内容
   等等。
4. 将返回的内容用 HTTP 请求包裹
5. 用 TCP 将生成的 HTTP 请求返回

我们发现 1,2,4,5 这些工作不管开发什么样的应用都要实现一次，那干脆单独抽出来做
成模块。于是 1,5 就被做成了 web server ，如 tomcat；2,4就被独立成 web 框架，如
Spring。

{% asset_img servlet.svg Structure of Web Application %}

如上，Servlet 接口就是 web server 与框架间的通信协议，所以在学习 Web 框架的实
现时容易遇到它。但写具体的应用时，因为框架已经屏蔽了这些细节，所以基本也不会用
到 Servlet 的概念。

## 参考

- [Let’s Build A Web Server](https://ruslanspivak.com/lsbaws-part1/) Python 教
    程，从头写一个 Web Server，对理解 web server 的工作原理很有帮助
- [An Introduction to Tomcat Servlet Interactions](https://www.mulesoft.com/cn/tcat/tomcat-servlet) Tomcat 如何与 Servlet 进行交互
