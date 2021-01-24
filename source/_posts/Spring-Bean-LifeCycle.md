title: Spring Bean 生命周期介绍
toc: true
date: 2021-01-24 14:34:06
tags: [Spring, Bean]
categories: Notes
---

Bean 是 Spring 对组件的抽象，Bean 的创建、销毁都由 Spring 控制。使用过程中我们
会希望定制创建、销毁过程中的部分逻辑，于是作为框架的 Spring 需要提供相应的机制
。我们关心 Bean 的生命周期，就在于需要了解可以定制的部分。

## Bean 创建过程

Bean 的创建过程如下，这些阶段 Spring 都提供了定制的手段：

{% asset_img Spring-Bean-Creation.svg Spring Bean 创建过程 %}

上图中需要注意下面几点：

- ① 中已经完成依赖注入。
- ②、③、④ 为代表的这些 `Aware` 接口，一般用于向 Bean 中注入 Spring 的组件。个
  人常用的是 ④，注入 `ApplicationContext` 后续用来获取 Prototype Scope 的 Bean
  。除了图中画的，还有[其它的 Aware 接口](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#aware-list)
   。
- ⑥、⑦、⑧ 可以为 Bean 指定初始化方法，当前建议只用 `@PostConstruct`。如果同时
   使用不同手段指定同一个方法作为 Bean 的初始化方法，则该方法只会被调用一次。
- 与其它阶段不同，⑤ 与 ⑨ 是 `BeanFactory` 级别的定制，其它阶段则是 Bean 级别的。

上面列出的是单个 Bean 创建时各个阶段的顺序，那不同 Bean 创建的相对顺序呢？

一个 Bean 在 Populate Properties 时就完成了依赖注入，如果 Bean X 依赖 Bean Y，
那么在 X 的依赖注入时 Y 就需要处于 Ready 状态。换句话说被依赖的 Bean Y 走完了
所有流程后Bean X 才开始创建。但如果两个 Bean 间没有依赖关系，则没有这个保证。


## Bean 的销毁过程

Bean 的销毁过程如下，推荐使用 `@PreDestroy` 的方式。另外注意：对于 Prototype
Scope 的 Bean，Spring 是不负责销毁的。

{% asset_img Spring-Bean-Destroy.svg Spring Bean 销毁过程 %}

不同 Bean 之间的销毁顺序又是怎么样的呢？[文档
](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#beans-factory-dependson)
里说，如果 Bean X 依赖 Bean Y，创建时是 Bean Y 先创建，销毁时则是反过来，Bean
X 先销毁。

## 附加题：如何等待所有 Bean 初始化完成？

有时候我们需要在所有 Bean 都初始化后做一些操作，要怎么做？上面提到的机制都是在
单个 Bean 中完成，无法顾及多个 Bean 之间的操作。这时可以利用
`ApplicationContext` 的[Event 机制
](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#context-functionality-events)
。

在 `ApplicationContext` 初始化完成或刷新时，会发送 `ContextRefreshedEvent` 事
件，我们只需要让某个 Bean 监听该事件即可。当然要注意这个事件可能会被发送多次（
因为刷新时也会再发送该事件），需要酌情忽略后续事件。监听示例代码如下：

```java
@Service
public class InitService {
    private final List<InitBean> beansToInitialize;

    @Autowired(required = false)
    public InitService(List<InitBean> beansToInitialize) {
        this.beansToInitialize = beansToInitialize;
    }

    @EventListener(ContextRefreshedEvent.class)
    public void onApplicationEvent(ContextRefreshedEvent event) {
        event.getApplicationContext().getBean(InitService.class).initialize();
    }

    private void initialize() {
        beansToInitialize.forEach(InitBean::init);
    }
}
```

## 参考

- [Customizing the Nature of a Bean](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#beans-factory-nature) Spring 参考文档，内容比较全但不直观
- [Spring bean Lifecycle Callbacks](https://jstobigdata.com/spring/spring-bean-lifecycle-callbacks/) 介绍了 Hack Bean 生命周期的几种方法，本文的图在其基础上补充完成
