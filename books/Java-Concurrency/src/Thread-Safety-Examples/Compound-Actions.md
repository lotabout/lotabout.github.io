# 复合操作

复合操作的问题本质上和 TOCTOU 是一样的，如果有多个操作（如同一变量的读写）就有
可能出现线程安全问题。

不过在本节我们要强调的是，即使每个操作本身是原子的，复合操作也不是原子的，这种
情形有时候比较难一眼就认出来。

## 示例

这里以《Java 并发编程实战》第二章的“因式分解”代码为例：

```java
@NotThreadSafe
public class UnsafeCachingFactorizer implements Servlet {
  private final AtomicReference<BigInteger> lastNumber = new AtomicReference<>();
  private final AtomicReference<BigInteger[]> lastFactors = new AtomicReference<>();

  public void service(ServletRequest req, ServletResponse res) {
    BigInteger i = extractFromRequest(req);
    if (i.equals(lastNumber.get())) {               // ①
      encodeIntoResponse(resp, lastFactors.get());  // ②
    } else {
      BigInteger[] factors = factorOf(i);
      lastNumber.set(i);                            // ③
      lastFactors.set(factors);                     // ④
      encodeIntoResponse(resp, factors);
    }
  }
}
```

这个例子中 `lastNumber` 用来记录上一次做过“因式分解”的数，`lastFactors` 存放上
次因式分解的结果。`service` 中先判断 `lastNumber` 是否与请求的数相等，如果相
等则使用存储的 `lastFactors`；反之不相等则需要重新计算因式分解，并把结果存入
`lastNumber` 与 `lastFactors` 中。

这里 `lastNumber` 与 `lastFactors` 都用了 `AtomicReference`，它们是 JUC 中的类
，可以理解为已经达到了原子性、可见性与顺序性。所以代码中的 ①②③④ 处的 `get`
`set` 都是原子的，只不过复合操作的问题是，即使每个操作都是原子的，操作整体也不
是原子的。

这个示例比较精妙的地方在于它很符合我们的编码习惯，如果不仔细思考甚至都发现不了
它存在线程安全问题。

## 问题时序

考虑线程 A 与线程 B 同时进入 else 语句，且分别需要求得 `2` 和 `3` 的因式分解，
考虑下面的时序：

```
----------- Thread A ---------------+--------- Thread B -----------------
lastNumber.set(i);         (=2)     |
                                    | lastNumber.set(i);         (=3)
                                    | lastFactors.set(factors);  (=[1,3])
lastFactors.set(factors);  (=[1,2]) |
```

则最终结束后 `lastNumber = 3`，`lastFactors = [1,2]`，则下次请求如果是分解 `3`
，则会使用 `lastFactors` 的值，得到结果 `[1,2]`，是错误的结果。

另一方面，也有可能是这样的时序：

```
----------- Thread A ---------------+--------- Thread B -----------------
lastNumber.set(i);         (=2)     |
                                    | if (i.equals(lastNumber.get()))  (= 2)
                                    |   encodeIntoResponse(resp, lastFactors.get());
lastFactors.set(factors);  (=[1,2]) |
```

这个时序里，一个线程计算了 `2` 的结果，正在写回缓存，过程中另一个线程请求因式
分解 `2`，此时 `lastNumber = 2`，因此返回了 `lastFactors` 的内容，但线程 A 关
于 `2` 的结果还未写回 `lastFactors`，线程 B 返回了一个错误的结果。

当然，也有可能是这样的时序：

```
----------- Thread A ---------------+--------- Thread B -----------------
Initial Value of lastNumber: 2      |
                                    | if (i.equals(lastNumber.get()))  (= 2)
lastNumber.set(i);         (=3)     |
lastFactors.set(factors);  (=[1,3]) |
                                    |   encodeIntoResponse(resp, lastFactors.get()); (=[1,3])
```

## 不成熟的解法：同步方法

从 TOCTOU 一节中我们知道，要解决这种竞争问题，需要把对状态的检查与使用都变成原
子的，最简单的方式就是在方法上用 `synchronized`：

```java
@ThreadSafe
public class UnsafeCachingFactorizer implements Servlet {
  // .. 省略代码

  public synchronized void service(ServletRequest req, ServletResponse res) {
    // .. 省略代码
  }
}
```

但是这个方法太极端了，所有的请求线程调用 `service` 方法都需要同步，同一时间只
能有一个线程执行该方法，完全失去了多线程的优势。

## 解法：减小粒度

给整个方法加锁十分简单，但是由于锁的粒度很粗，并发性差。而我们的真实需求其实有
两个：

1. 对 `lastNumber` 和 `lastFactors` 的赋值操作需要是原子的
2. 对 `lastNumber` 和 `lastFactors` 的读取也需要是原子的（至少读取过程中不允许赋值）

因此我们可以用 synchronized 代码块，实现如下：

```java
public class UnsafeCachingFactorizer implements Servlet {
  private BigInteger lastNumber;
  private BigInteger[] lastFactors;

  public void service(ServletRequest req, ServletResponse res) {
    BigInteger i = extractFromRequest(req);
    BigInteger[] factors = null;

    synchronized (this) {                   // ①
      if (i.equals(lastNumber.get())) {
        factors = lastFactors.clone();
      }
    }

    if (factors == null) {
      factors = factor(i);
      synchronized (this) {                 // ②
        lastNumber = i;
        lastFactors = factors;
      }
    }

    encodeIntoResponse(resp, factors);
  }
}
```

在 ① 中把读操作用 `synchronized` 代码块保证原子性，在 ② 中用同样方法保证赋值的
原子性。另一个关键点是，两个代码块需要加同一个锁，此处直接用了 `this`，是最稳
妥的选择，当然也可以锁其它的 object，只要两个块加同一个锁即可。

另外此处因为使用了 `synchronized`，对 `lastNumber` 和 `lastFactors` 不再需要使
用原子类。通常原子类(如 AtomicReference) 对单个操作的原子性保证很方便，但复合
操作本身需要加锁，这里再使用原子类就显得没必要了。

## 小结

复合操作即使操作本身是原子的，复合操作作为一个整体本身也不具备原子性。所以和
TOCTOU 问题一样，解决方法是需要加锁来保证复合操作整体的原子性。

还有一点比较特殊，是我们看到“读操作”和“写操作”一样，都是必须要加锁的。

示例中我们也看到，并发编程是在简单性与并发性中的权衡。锁的粒度粗了，使用起来简
单，但是并发性低，也许就满足不了性能要求；反之锁的粒度细了，并发性提高了，但是
复杂度也随之增加，稍有不慎就容易有线程安全问题。
