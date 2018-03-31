title: 'QQA: 如何启用 @Autowired'
date: 2018-03-30 18:19:53
tags: [QQA, java, autowire]
categories: [QQA]
toc:
---

`@Autowired` 是 Spring 提供的一个注解，作用是自动装配 Bean 所需要的依赖。但
`@Autowired` 只是告诉 Spring 当前的 Bean 依赖了其它的 Bean，那么如何让 Spring
真正“启用”自动装配的功能呢？

（Quick Question and Answer 系列旨在对小问题做简短解答）

<!--more-->

## 错误示范

我们知道在 Spring 可以指定 Configuration Class 来提供 Bean，有时我们会看到下面
的代码：

```java
public class AServiceImpl implements AService {
    private BService bService;

    @Autowired
    AService(BService bService) {
        this.bService = bService;
    }

    ...
}
```

与此同时在 Configuration Class 里：

```java
@Configuration
public class XConfig {
    @Bean
    public BService bService() {
        return new BServiceImpl();
    }

    @Bean
    public AService aService() {
        return new AServiceImpl(bService());
    }
}
```

一方面，我们用 `@Autowired` 指定了 `AServiceImpl` 里要依赖 `BService`，别一方
面我们在 Configuration Class 里 **手工** 创建了 `AService` 的 Bean，而这个依赖
`bService` 也是我们自己指定的。因此 `@Autowired` 完全没有用……

## 正确做法

从上面例子我们可以想到，要利用 `@Autowired`，我们要让框架来创建 Bean，那怎么做
呢？

**(1) 为 Bean 加上注解 `@Component`**

```java
@Component
public class AServiceImpl implements AService {
    private BService bService;

    @Autowired
    AService(BService bService) {
        this.bService = bService;
    }

    ...
}
```

`@Component` 的意义是告诉 Spring 当前的类是一个 Bean。

**(2) 在 Configuration Class 加上注解 `@ComponentScan`**


```java
@Configuration
@ComponentScan
public class XConfig {
    // no need to define @Bean here
}
```

`@ComponentScan` 是告诉 Spring 在 `XConfig.java` 所有的 package （及子 package
）中寻找带注解 `@Component` 的类并为其创建对应的 Bean。在创建的时候，Spring 就
会查找类中是否有 `@Autowired` 注解的字段/方法/…… 并为其自动装配所需依赖。

## 只为别人的类创建 Bean

一般来说 Configuration Class 里不需要手工创建 Bean。但有一些类可能不是你自己写
的/管的，所以没有办法为它们加上 `@Autowired`，这时只得手工指定依赖并创建 Bean
了。创建过程中，如果需要用到加了 `@Component` 的类，如下例的 `AService`，可以
把它们作为参数，这样 Spring 在创建 OtherBean 时会自动装配 `AService`。

```java
@Configuration
@ComponentScan
public class XConfig {
    @Bean
    public OtherBean otherBean(AService aService) {
        return new AServiceImpl(aService);
    }
}
```
