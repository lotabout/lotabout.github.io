# Double Checked Locking

双重锁定检查（Double Checked Locking，下称 DCL）是并发下实现懒加载的一个模式，
在实现单例模式时很常见，但是要正确实现 DCL，其中涉及到的细节和知识是非常琐碎的
，我们这里按照 [The "Double-Checked Locking is Broken"
Declaration](https://www.cs.umd.edu/~pugh/java/memoryModel/DoubleCheckedLocking.html)
文章的脉络，结合前几章学习的知识，尝试理解这些知识点。

（这章属于“骚操作”的内容。）

## 初次尝试

上节中说过 Lazy Initialization，我们的目标是在获取某个实例时只初始化一次，在单
线程语境中，我们会这么实现：

```java
class Foo {
  private Helper helper = null;
  public Helper getHelper() {
    if (helper == null)
        helper = new Helper();
    return helper;
  }
  // other functions and members...
}
```

但是我们知道这个版本在多线程下是有问题的，因为对 helper 和检查和赋值不是原子的
，有可能多个线程同时满足了 `if (helper == null)` 的判断，最终多个线程都执行了
`helper = new Helper` 的操作。一个简单的方法是加锁：

```java
class Foo {
  private Helper helper = null;
  public synchronized Helper getHelper() {
    if (helper == null)
        helper = new Helper();
    return helper;
  }
  // other functions and members...
}
```

注意代码里的 `synchronized`。这个代码能正确运行，但是效率低下，因为
`synchronized` 是互斥锁，后续所有 `getHelper` 调用都得加锁。于是我们希望在
`helper` 正确初始化后就不再加锁了，尝试如下实现：

```java
class Foo {
  private Helper helper = null;
  public synchronized Helper getHelper() {
    if (helper == null)             // ① 第一次检查
      synchronized(this) {        // ② 对 helper 加锁
        if (helper == null)         // ③ 同上个实现
            helper = new Helper();
      }
    return helper;
  }
  // other functions and members...
}
```

代码的初衷是：

1. 如果正确初始化后，所有的 `getHelper` ① 的条件失败，于是不需要
   `synchronized`
2. 如果未被正确初始化，则同上个实现一样，加锁进行初始化。

> Unfortunately, that code just does not work in the presence of either
> optimizing compilers or shared memory multiprocessors.

很可惜，这段代码在编译器优化或多核的环境下是“错误”的。在这章中，我们会尝试去理
解为什么它不正确，及为什么一些 bugfix 后依旧不正确。丑话说在前：

> There is no way to make it work without requiring each thread that accesses
> the helper object to perform synchronization.

用人话来说，就是如果不把 `helper` 对象设置成 `volatile` 的，这段代码就不可能正
确。

## 指令重排

第一个可能的问题是重排序[^csdn]。这行代码 `helper = new Helper();` 看上去是原子，从字
节码的角度可以理解成下面几个步骤：

```
instance = Helper.class.newInstance(); // 1. 分配内存
Helper::constructor(instance);         // 2. 调用构造函数初始化对象
helper = instance;                     // 3. 让 helper 指向新的对象
```

前面章节说过，JVM 可能会对指令做重排序，所做的保证是不影响“单线程”的执行结果，
那么可能排序成这样：

```
instance = Helper.class.newInstance(); // 1. 分配内存
helper = instance;                     // 3. 让 helper 指向新的对象
Helper::constructor(instance);         // 3. 调用构造函数初始化对象
```

那么在 #3 执行之前，helper 指向的内存地址未被初始化，是不安全的。在多线程下，
可能会变成：

```
--------------- Thread A -------------------+--------------- Thread B --------------
if (helper == null)                         |
  synchronized(this) {                      |
    if (helper == null) {                   |
      instance = Helper.class.newInstance();|
      helper = instance;                    |
                                            | if (helper == null) // false
                                            | return helper
                                            | // ... do something with helper.
      Helper::constructor(instance);        |
    }                                       |
  }                                         |
return helper;                              |
```

即由于重排，`helper` 指针已经有值了，但是还未初始化，导致此时线程 B 拿着未初始
化的 `helper` 做了其它的操作，这是有风险的。

注意的是，即使编译器不做重排序，CPU 和缓存也可能会做重排序。

## 试图挽救重排序

上面的问题，我们根本目标是要保证 `synchronized` 块结束时（初始化完成后），相应
的值才被其它线程看到，于是我们可以用下面这个 trick：

```java
class Foo {
  private Helper helper = null;
  public Helper getHelper() {
    if (helper == null) {
      Helper h;                     // ① 创建了临时变量
      synchronized(this) {
        h = helper;                 // ② 保证读取最新的 helper 值
        if (h == null)
            synchronized (this) {   // ③ 尝试用内部锁解决重排序
              h = new Helper();     // ④ 创建新的实例
            }                       // ⑤ 释放了内部的锁
        helper = h;                 // ⑥ 将新的实例赋值给 helper
        }
    }
    return helper;
  }
  // other functions and members...
}
```

这里的想法是想通过 ③ 处的锁来阻止重排序，更准确地说，是希望在 ⑤ 释放锁的地方能
提供内存屏障（memory barrier），从而保证 `h = new Helper` 一定在 `helper = h`
之前执行。

很可惜这个“希望”现实中不成立。`Happens Before` 里规定的是：

> 监视器上的 unlock 操作 Happens Before 同一个监视器的 lock 操作

换言之，为了保证 unlock Happens Before 其它的 lock 操作，JVM 需要保证在锁释放
时，`synchronized` 块**之前**的操作都已经完成并写回到内存里。但是这个规则并没
有说 `synchronized` 块**之后**的操作不能重排序到`synchronized` 块之前执行。因
此上面这种修改的“美好希望”实际上并不成立[^jmm-cookbook]。

## 此路不通

即使我们真的能保证 helper 在被赋值之前就已经正确初始化了
[^bidirectional-memory-barrier]，这种方式就能正确工作了吗？不能。

问题不仅仅在于写的一方，即使 helper 被正确初始化并赋值，由于另一个线程所在的
CPU 可能会从缓存中读取 helper 的值，如果 helper 的新值还没有被更新到缓存中，则
读取的值可能还是 `null`。

等等！不是说 `synchronized` 会保证可见性吗？是的，但它保证的是 `unlock` 操作前
的更新对同一个监视器的 lock 操作可见，但现在另一个线程根本没有进入
`synchronized` 代码块，此时 JVM 不保证可见。

## volatile

经过前面的分析，想起了前面章节提到的 `volatile` 关键字（JDK 1.5 后支持）有这么
一条 Happens Before 规则：

> **volatile 变量规则**：写入 volatile 变量 Happens Before 读取该变量

它可以提供额外的可见性保证。于是我们可以这么（正确）实现：

```java
class Foo {
  private volatile Helper helper = null; // 注意变量声明了 volatile
  public Helper getHelper() {
    if (helper == null) {
      synchronized(this) {
        if (helper == null)
          helper = new Helper();
      }
    }
    return helper;
  }
}
```

这个实现里，写入 `helper` 之前的操作，如 Helper 对象的初始化，在 `helper` 被读
取（如判断 `helper == null`）必须可见。换句话说，前文讨论的两种情况：重排序与
可见性问题都由于 `volatile` 的语义得到保证。

那么 `volatile` 是不是会降低性能？《Java 并发编程实战》第三章的注解里说

> 在当前大多数处理器架构上，读取 volatile 变量的开销只比读取非 volatile 变量的
> 开销略高一点

## 几个例外

例外不是说 volatile 方式的正确性有例外，而是对于一些特殊情形，有特殊的解法。

### static 单例

对于是 static 的单例，最好的初始化方式是利用 Java 类加载机制，如下：

```java
public class Foo {
    private static class Holder {
        private static Helper helper = new Helper();
    }

    public static Helper getInstance() {
        return Holder.helper;
    }
}
```

### 32 位 primitive

这里的知识点是 32 位的 primitive 类型变量的读写是原子的。如果初始化的方法是幂
等的，则可以这么实现：

```java
class Foo {
  private int cachedHashCode = 0;
  public int hashCode() {
    int h = cachedHashCode;
    if (h == 0)
      synchronized(this) {
        if (cachedHashCode != 0) return cachedHashCode;
        h = computeHashCode();
        cachedHashCode = h;
      }
    return h;
  }
  // other functions and members...
}
```

当然，如果方法是幂等的，甚至都不需要同步：

```java
class Foo {
  private int cachedHashCode = 0;
  public int hashCode() {
    int h = cachedHashCode;
    if (h == 0) {
      h = computeHashCode();
      cachedHashCode = h;
    }
    return h;
  }
  // other functions and members...
}
```

为什么一定需要 32 位呢？因为 64 位的操作不是原子的，于是可能造成前后 32 位不是
一起写入内存的，而另一个线程只读取先写入的 32 位，读到的结果不正确。

### final

如果前文的 `Helper` 类是不可变的(immutable)，具体地说，`Helper` 的所有属性都是
`final` 的，那么即使不加 `volatile`，DCL 也是正确的。这是因为 JVM 对 `final`
关键字有一些特殊的语义，有兴趣的可以参考 [JSL 第 17 章
](https://docs.oracle.com/javase/specs/jls/se8/html/jls-17.html#jls-17.5)

## 小结

本章中我们讲解了 [The "Double-Checked Locking is Broken"
Declaration](https://www.cs.umd.edu/~pugh/java/memoryModel/DoubleCheckedLocking.html)
文章中关于 DCL 的各个示例，并结合前面章节中学到的 Happens Before 关系的知识去
理解 DCL 成立或不成立的原因。

有时候我们会认为：写的时候加锁就行了，读操作不需要加锁。本节的例子就说明了这种
观点不成立，会有可见性和顺序性的问题。最简单的解决方式是读操作也加锁，如果性能
达不到要求，也可以像本节一样使用 volatile，但我个人不建议这么用，因为有太多细
节需要考虑，可以使用 JUC 中的 `ReadWriteLock` 来加读写锁。

可以看到，要正确地实现并发程序，难度是很大的，并且要了解很多细节。当然也不必灰
心，已经有前人为我们辅好了路，日常工作中我们只需要跟随前人的脚步，就可以满足绝
大多数需求。

---

[^csdn]: 参考 CSDN 文章 [双重检查锁定（double-checked locking）与单例模式](https://blog.csdn.net/zhangzeyuaaa/article/details/42673245)

[^jmm-cookbook]: 关于重排序和内存可见性，可以参考 Doug Lea 的 [The JSR-133 Cookbook for Compiler Writers](http://gee.cs.oswego.edu/dl/jmm/cookbook.html)

[^bidirectional-memory-barrier]: [这里](https://www.cs.umd.edu/~pugh/java/memoryModel/BidirectionalMemoryBarrier.html)介绍了一种方法，不要用在生产中
