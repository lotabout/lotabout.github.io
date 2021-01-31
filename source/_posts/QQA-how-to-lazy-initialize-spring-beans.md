title: 'QQA: Spring Bean 如何开启懒加载'
toc: true
date: 2021-01-31 21:28:39
tags: [QQA, java, spring]
categories: [QQA]
---

有些 Bean 依赖外部环境，如 Repository 通常依赖数据库连接。一些单元测试中用不到
它们，因此希望在测试中不初始化这些 Bean。除此之外，在测试中开启懒加载/延迟初始
化(lazy-init)，由于跳过了不用的 Bean，还能加快测试运行的速度。

## Spring 2.2 之后

在 Spring 2.2 之后，最直接的方式是在 `test/resources/application.yml` 配置文件
中加入如下参数：

```yaml
spring.main.lazy-initialization: true
```

内部原理是在 `SpringApplication` 中，如果检测到该参数为真，则会创建一个
BeanFactoryPostProcessor，用于将“所有” BeanDefinition 的 lazyInit 属性置为真。

```java
if (this.lazyInitialization) {
    context.addBeanFactoryPostProcessor(new LazyInitializationBeanFactoryPostProcessor());
}
```

## Spring 2.2 之前

参考[这篇文章
](https://www.jhipster.tech/tips/027_tip_lazy_init_test_beans.html)，本质上与
Spring 2.2 的方法一样，需要在测试包中自定义 BeanFactoryPostProcessor，用于
将“所有” BeanDefinition 的 lazyInit 属性置为真：

```java
@Component
@Profile("!" + TestLazyBeanInitConfiguration.EAGER_BEAN_INIT)
public class TestLazyBeanInitConfiguration implements BeanFactoryPostProcessor {
    public static final String EAGER_BEAN_INIT = "eager-bean-init";

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
        Arrays.stream(beanFactory.getBeanDefinitionNames())
            .map(beanFactory::getBeanDefinition)
            .forEach(beanDefinition -> beanDefinition.setLazyInit(true));
    }
}
```

如果某个测试不需要懒加载，则通过注解 `@ActiveProfiles(TestLazyBeanInitConfiguration.EAGER_BEAN_INIT)` 关闭。

## @ComponentScan(lazyInit = true) 有坑

通常我会在测试包中创建一个 `TestApplication` 类，并注解为
`@SpringBootApplication` 来完成 Bean 的自动扫描。尝试过下面的方式：

```java
@SpringBootApplication
@ComponentScan(lazyInit = true)
public class TestApplication {
}
```

这种方法对于自动创建的 Bean（即标记为 `@Component`, `@Service` 等的类）是有效
的。但对于 `Configuration` 类中通过 `@Bean` 方式创建的 Bean 无效。毕竟
`@ComponentScan` 本身控制的就是扫描 Bean 的行为。
