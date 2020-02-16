title: 理解 OAuth 2.0 认证流程
toc: true
date: 2020-02-16 11:48:15
tags: [OAuth]
categories: [Knowledge]
---

OAuth 2.0 标准的 RFC 比较难读懂，本文尽量把认证流程说明白。

## 认证方式

OAuth 2.0 共有 4 种访问模式[^how-to-choose]：

- 授权码模式(Authorization Code)，适用于一般服务器端应用
- 简化模式(Implicit)，适用于纯网页端应用，不过现在推荐使用
[PKCE](https://auth0.com/docs/flows/concepts/auth-code-pkce) 作为替代
- 密码模式(Resource owner password credentials)，不介绍
- 客户端模式(Client credentials)，不介绍

[^how-to-choose]: https://auth0.com/docs/api-auth/which-oauth-flow-to-use

另外注意 OAuth 服务本身必须是 HTTPS 的，而三方应用可以是 HTTP 的。

## Authorization Code

假设我们的网站有一个功能是同步用户在 Github 的所有仓库。对接 OAuth 流程大致分
为 5 个步骤：

1. 在 Github 的 OAuth 页面上注册网站信息。在网站发布前就要做好
2. 用户点击网站上的“同步 Github 仓库”按钮，开始 OAuth 认证流程
3. 浏览器弹出 Github 认证窗口，询问“是否允许网站 XXX 的访问”，用户点击“允许”
4. Github 得知用户点了“允许”后，生成授权码(Authorization Code)，并将用户重定向
   到我们的网站里，网站后台收到授权码后，向 Github 请求ACCESS_TOKEN
5. 网站后台从 Github 收到 ACCESS_TOKEN，接着向 Github 拉取该用户所有的仓库

具体流程如下图：

{% asset_img oauth-authorization-code.svg OAuth 2 Authorization %}

在授权码方式下，ACCESS_TOKEN 只会存在我们网站的服务器里，用户端从始至终都获取
不到这个信息，我们不必害怕用户的电脑中毒了而导致 ACCESS_TOKEN 泄露。

（更多安全相关的考虑参考最后的参考文章）

## Implicit

Implicit 是为纯网页应用设计的，与 Authorization Code 模式相比：

- Implicit 模式认证过程中，不使用 `CLIENT_SECRET`
- 用户认证后直接拿到 ACCESS_TOKEN 不再需要通过 Authorization Code 进行中转（下图的步骤 ⑥）

整体流程如下图：

{% asset_img oauth-implicit.svg OAuth 2 Implicit %}

Implicit 设计之初，由于浏览器的同源策略，不允许跨站请求，因此 Authorization
Code 不可行[^spa-pkce]。现在由于浏览器普遍支持
[CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)，且 Implicit 本
身也在安全风险，目前建议使用 PKCE[^oauth-security-09]。

[^spa-pkce]: [Secure Your SPA with Authorization Code Flow with PKCE](https://espressocoder.com/2019/10/28/secure-your-spa-with-authorization-code-flow-with-pkce/)
[^oauth-security-09]: [OAuth 2.0 Security Best Current Practice draft-ietf-oauth-security-topics-09](https://tools.ietf.org/html/draft-ietf-oauth-security-topics-09)

## 小结

OAuth 2.0 是广泛使用的授权标准，设计的本身也有许多安全性的考量。本文浅尝辄止，
只介绍 Authorization Code 与 Implicit 模式的授权过程，而这些流程背后想要解决的
问题，需要另选学习。

## 参考

- [OAuth 2.0 RFC](https://tools.ietf.org/html/rfc6749) 比较难读懂
- [OAuth 2 Simplified](https://aaronparecki.com/oauth-2-simplified/) 讲解了
    Authorization Code 和 PKCE 流程，强烈推荐阅读
- [Diagrams And Movies Of All The OAuth 2.0 Flows](https://medium.com/@darutk/diagrams-and-movies-of-all-the-oauth-2-0-flows-194f3c3ade85) OAuth 2.0 流程图
- [关于 OAuth2.0 安全性你应该要知道的一些事](https://www.chrisyue.com/security-issue-about-oauth-2-0-you-should-know.html) 一些影响 OAuth 2.0 安全的约定细节
- [Implement the OAuth 2.0 Authorization Code with PKCE Flow](https://developer.okta.com/blog/2019/08/22/okta-authjs-pkce) 有讲解为什么不要再用 Implicit 模式
- [draft-ietf-oauth-security-topics-09](https://tools.ietf.org/html/draft-ietf-oauth-security-topics-09) OAuth 2.0 关于安全的最佳实践：用 PKCE
- [乌云关于 OAuth 的安全案例回顾](https://wooyun.js.org/drops/OAuth%202.0安全案例回顾.html)
