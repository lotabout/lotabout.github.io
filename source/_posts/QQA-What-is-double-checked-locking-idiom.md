title: 'QQA: 什么是 double checked locking'
toc: true
date: 2019-08-29 21:03:02
tags: [java, singleton, thread-safe]
categories: [QQA]
---

双重检查锁定模式(Double checked locking)是软件设计的小技巧，第一重检查跳过大多
数不需要竞争的情况，从而减少并发系统中的竞争开销。它经常被用在在“惰性初始化”
(lazy initialization) 中，例如实现一个线程安全的单例。如下示例：

```java
public class Singleton {
    private static volatile UUID uuid;

    public static UUID getInstance() {
        if (uuid == null) {
            synchronized (Singleton.class) {
                if (uuid == null) {
                    uuid = UUID.randomUUID();
                }
            }
        }
        return uuid;
    }
}
```

（注意上面的 `synchronized` 和 `volatile`）

## 版本一（单线程正确版）

一般情况下，我们如果要实现单例，会这么写：

```java
public class Singleton {
    private static UUID uuid;

    public static UUID getInstance() {
        if (uuid == null) { // ①
            uuid = UUID.randomUUID(); // ②
        }

        return uuid; // ③
    }
}
```

这个版本的问题是：如果多线程运行，则在 ① 处判断时会有多个线程为真，从而导致语
句 ② 被执行多次。

## 版本二（synchronized 正确版）

很简单的思路是在方法上加上 synchronized 来强制同步：

```java
public class Singleton {
    private static UUID uuid;

    public synchronized static UUID getInstance() {
        if (uuid == null) {
            uuid = UUID.randomUUID();
        }

        return uuid;
    }
}
```

这个版本是正确的，只是在高并发的情况下，尽管已经初始化完毕，也要竞争锁，效率低
。

## 版本三（双重检查错误版）

鉴于版本二性能不好，我们争取将锁放在 `uuid == null` 的 if 语句之内：

```java
public class Singleton {
    private static UUID uuid;

    public static UUID getInstance() {
        if (uuid == null)
            synchronized (Singleton.class) {
                if (uuid == null) {
                    uuid = UUID.randomUUID();
                }
            }
        }
        return uuid;
    }
}
```

这个版本看似无可挑剔，而且绝大多数情况下测试会通过，但它是错误的[^broken]。

这其中的理由很复杂，并且需要很强的底层知识才能完全理解（如 java 内存模型，指令
重排等等）。我们只需要记住，Java 1.5 之后，为对象加上 `volatile` 关键词即可。

[^broken]: https://www.cs.umd.edu/~pugh/java/memoryModel/DoubleCheckedLocking.html

## 使用静态类初始化

如果只是需要初始化单例，可以使用下面这种形式：

```java
public class Singleton {
    private static class Holder {
        private static UUID uuid = UUID.randomUUID();
    }

    public static UUID getInstance() {
        return Holder.uuid;
    }
}
```

内部静态类 `Holder` 只有在初次被使用时才会被加载，而只有 `getInstance` 方法才
会使用它。这种方法的正确性是由 Java 类加载器保证的，在加载类的时候只会是单线程
的。

只不过这种方法比较局限，只适合初始化单例。而 double-checked locking 使用范围更
广，事实上它在 Java 源码里还有很多使用，如 ConcurrentHashMap 的初始化就使用了
类似的技巧。

## 参考

- https://en.wikipedia.org/wiki/Double-checked_locking 维基百科
- [LCK10-J. Use a correct form of the double-checked locking idiom](https://wiki.sei.cmu.edu/confluence/display/java/LCK10-J.+Use+a+correct+form+of+the+double-checked+locking+idiom)
- [Synchronization and the Java Memory Model](http://gee.cs.oswego.edu/dl/cpj/jmm.html) Doug Lea 大神对 java 内存模型的讲解
