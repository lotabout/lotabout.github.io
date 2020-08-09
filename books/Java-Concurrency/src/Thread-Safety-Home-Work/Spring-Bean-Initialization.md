# Spring Bean 初始化如何保证线程安全

Spring Bean 中的参数通常有几种初始化方法：

通过构造函数注入：

```java
@Service
public void MyService {
  private MyData myData;

  public MyService(MyData myData) {
    this.myData = myData;
  }
}
```

通过 setter 注入：


```java
@Service
public void MyService {
  @Autowired
  private MyData myData;
}
```

也有可能在 `PostConstruct` 中指定初始化逻辑：


```java
@Service
public void MyService {
  private MyData myData;

  @PostConstruct
  public void init() {
    this.myData = new MyData();
  }
}
```

我们知道 Spring 默认创建的 Bean 是单例的，那么 Bean 中的字段需要声明成
`volatile` 吗？

## 可能有问题

由于是单例，意味着 `MyService` 可能被多个线程并发使用，使用典型的使用场景：

```java
@Controller
public class MyController {
  @Autowired private MyService myService;

  @GetMapping("/data/{id}")
  public Response fetchData(@PathVariable long id) {
    return myService.fetchData(id);
  }
}
```

由于 `MyController` 中的 API 可能会被并发访问，于是 myService 也会在多线程中并
发调用。

问题是：**在某个线程中访问 myData 时，myData 被正确初始化了吗**？

## 构造函数、重排序与可见性

其实我们之前在 Double Checked Locking 中提过这个现象，考虑这样的语句：

```
MyData myData = new MyService(); |
                                 | this.myData = myData;
                                 | this.myData.someFunc();
```

有可能因为重排序和可见性的原因，变成：

```
MyData myData = MyData.class.newInstance(); |
                                            | this.myData = myData;
                                            | this.myData.someFunc();
MyData::constructor(myData);                |
```

也就是说在 `myService.fetchData` 被调用时，`myService` 中看到的 `myData` 可能
还未正确初始化。

## Plain Java 的解法

你可能二话不说，直接把 `myData` 申明成 `volatile`：


```java
@Service
public void MyService {
  private volatile MyData myData;
}
```

当然没有问题，如果你对性能要求更高，并且还记得 `final` 的特殊语义，那么会这么
干：

```java
@Service
public void MyService {
  private final MyData myData;

  public MyService(MyData myData) {
    this.myData = myData;
  }
}
```

`final` 能保证当 `MyService` 构造函数返回时，`myData` 已经被正确初始化了，但是
代价是不再能用 setter 注入和 PostConstruct 的初始化方式。

那么在 Spring 里呢？我们并没有加 `volatile` 的习惯，那是在作死吗？

## Spring 如何保证线程安全

事实上 Spring Bean 中的字段，并不需要显式指定为 `volatile`，原因如下：

1. Spring 的 Bean 会存储在一个 map 中（`DefaultSingletonBeanRegistry.singletonObjects`）
2. 每次存储或获取某个 Bean，都会显示在这个 map 上加内置锁（synchronized）
3. 由于 JMM 的“监视器锁规则”，lock 能看到同一个监视器的 unlock 前的变化

于是，我们只要注入了某个 Bean，那么这个 Bean 的初始化的内容就是可见的，上例中
，在 `MyService` 中看到了 `myData` 这个 Bean，就可以保证 `myData` 已经被正确初
始化了。并且这里的初始化不仅仅指构造函数中的内容，而是 Spring 语境下的初始化，
还包括setter 注入，PostConstruct 初始化等。

但是要注意，这个机制要求 Bean 的初始化和获取都是通过 Spring 完成的。如果 Bean
初始化后又做了修改，或者 Bean 不是通过 ApplicationContext 或 Autowired 获取的
，则没有这个可见性保证。

## 小结

在 Spring Bean 的初始化中，我们通常不需要显式地指定某个字段是 volatile，是因为
Spring 有相关机制做了保证。这个机制依赖了 `synchronized` 关键字与 `监视器锁规
则`。

## 参考

- https://stackoverflow.com/a/23992532/826907 SO 的回答，基本涵盖了上面所说的内容
- [Spring and visibility problems](https://web.archive.org/web/20080226065034/http://blog.xebia.com/2007/03/01/spring-and-visibility-problems/) 一篇提到上述机制的博文
- [DefaultSingletonBeanRegistry.java](https://github.com/spring-projects/spring-framework/tree/master/spring-beans/src/main/java/org/springframework/beans/factory/support) Spring 源码，管理单例 Bean 的相关功能
