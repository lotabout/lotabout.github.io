# Time-Of-Check to Time-Of-Use

Time-Of-Check to Time-of-Use[^wiki] 简称为 TOCTOU 或 TOCTTOU，是指在检查某个状
态到使用某个状态之间存在时间间隔，而在这段间隔中，状态被其它人修改了，从而导致
软件Bug 或系统漏洞。在《Java 并发编程实战》里，也称为“先检查后执行”
(Check-then-Act)模式。

不管是写系统脚本、Java 程序、与数据库打交道，TOCTOU 都是常见的问题。我们先来看
看“延迟初始化”(Lazy Initialization)问题[^dubbo]，它是一个典型的 TOCTOU 问题，
也是几乎所有并发书籍会讨论的问题。

## 延迟初始化

延迟初始化的初衷是有一些初始化操作代价比较大，因此希望：

1. 在调用时才真正执行初始化，不影响程序启动
2. 初始化后，后续再调用方法，则使用的是初始化的结果

延迟初始化有多种表现形式，我们以“单例”（Singleton）的实现为例：


```java
public static class LazyInitialization {
  private static ExpensiveObject instance;

  public static ExpensiveObject getInstance() {
    if (instance == null) {
      instance = new ExpensiveObject();
    }
    return instance;
  }
}
```

开始时先判断 `instance` 是否为空，如果为空则执行初始化操作（new 一个
`ExpensiveObject` 对象），最后返回初始化完成的对象。这是一个典型的 TOCTOU 的操
作。

问题在于，如果有两个线程同时执行这段代码，可能执行顺序如下：


```
--------------- Thread A ----------------+--------------- Thread B --------------
if (instance == null) {                  |
                                         | if (instance == null) { // ①
                                         |     instance = new ExpensiveObject();
  instance = new ExpensiveObject(); // ② |
return instance;  // ③                   |
                                         | return instance; // ④
```

* ① 中，虽然线程 A 已经判断，准备初始化，但是由于初始化未完成，因此线程 B 的条
    件依旧满足，也会进行初始化
* 语句 ② 的执行，其实依赖 instance 为空，但实际执行时，这个条件已经被破坏了
* 于是在 ③ 和 ④ 中，线程 A 和线程 B 得到了不同的 instance，无法达到“单例”的效果。

### 解法：保证原子性

我们可以看到，TOCTOU 的主要问题在于状态的检查和状态的使用整体上不是原子的，而
前面的章节中我们知道 Java 中最简单的实现原子性的方式是使用内置锁（intrinsic
lock），即 `synchronized` 关键字：

```java
public static class LazyInitialization {
  private static ExpensiveObject instance;

  public synchronized static ExpensiveObject getInstance() {
    if (instance == null) {
      instance = new ExpensiveObject();
    }
    return instance;
  }
}
```

在 `getInstance` 方法前加上 `synchronized` 关键词，可以保证在同一时刻，只可能
有一个线程在执行 `getInstance` 内的逻辑。这样保证了只会有一个线程在检查
instance 是否为空，且在状态使用之前，instance 不会被其它线程更改。换句话说，在
状态的使用时，检查时得到的条件依旧成立。

当然，`synchronized` 是互斥锁，意味着即使初始化正确完成后，依然只有一个线程能
执行代码，于是在高并发下性能不好，之后的章节中会介绍如何优化。

## Java 外的 TOCTOU

Java 中的并发问题从形式上和使用数据库时遇到的并发问题很像，TOCTOU 问题也常见于
数据库的使用中，例如使用数据库记录 API 的调用次数，则流程上，相当于一个事务中
需要处理如下逻辑：

```
SELECT api_count FROM table WHERE name = '...';
(in Java: new_api_count = api_count + 1;)
UPDATE table SET api_count = <new_api_count> WHERE name = '...';
```

考虑有两个线程或进程同时执行这段逻辑，则同样的，可能出现：

```
------------- Process A -----------------+------------ Process B ----------------
SELECT api_count FROM ...     (=10)      |
                                         | SELECT api_count FROM ...     (=10)
                                         | new_api_count = api_count + 1 (= 11)
new_api_count = api_count + 1 (= 11)     |
UPDATE table SET ...          (= 11)     |
                                         | UPDATE table SET ...          (= 11)
```

于是预期是累加了两次，最终结果为 `12`，但由于并发问题导致了写丢失(Lost update)。

同上，要解决这个问题要想办法保证原子性，在 MySQL 里有两种方法：

1. 使用 `SELECT ... FOR UPDATE` 加上悲观锁，保证后续操作的原子性
2. 将 java 中实现的累加操作换成 MySQL 提供的原子操作： `UPDATE table SET
   api_count = api_count + 1 WHERE name = '...'`

## 小结

TOCTOU 问题的根源是使用状态时，其实依赖了之前的状态检查结果，而在检查到使用的
这段时间里，状态被其它线程/进程修改了，于是依赖的条件被打破，使得对状态的使用
不再正确。

**解法**是：将状态的检查和使用作为整体用锁保护起来，保证整体的原子性。Java 里
最方便的是`synchronized`关键词，当然也可以用如 `ReentrantLock` 等机制。

其实线程安全问题，就是因为由代码顺序带来的逻辑预期被破坏了。如上例中，在执行初
始化时经过了 `if (instance == null)` 的判断，`instance == null` 是初始化的大前
提，但在执行时大前提被破坏了，此时再执行初始化本身就是错误的行为。

---

[^wiki]: https://en.wikipedia.org/wiki/Time-of-check_to_time-of-use

[^dubbo]: 例如知名 RPC 框架 dubbo 中的 [NetUtils](https://github.com/apache/dubbo/blob/master/dubbo-common/src/main/java/org/apache/dubbo/common/utils/NetUtils.java#L198) 使用了延迟初始化来获取本机 IP
