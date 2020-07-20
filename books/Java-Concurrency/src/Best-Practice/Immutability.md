# 不可变（Immutability）

如果说“封闭”是通过“不共享”来解决线程问题，顾名思义“不可变”就是从可变性入手解决
线程安全问题：

> 不可变对象一定是线程安全的

不可变对象的状态在构造函数中就唯一确定了，之后不接受任何的更改，因此编译器能对
它做更可靠的优化，更容易保证它的线程安全性。

## 不可变对象的门槛

我们很容易认为，如果创建一个对象后，没有任何代码修改它，它就是“不可变”的。很可
惜这种观点是错误的，在 Java 中，不可变对象有着明确的要求[^ref-book]：

* 对象创建后其状态不能修改
* 对象所有的成员变量都是 `final` 修饰的
* 对象是正确创建的（在对象的创建期间，this 引用没有逸出）

创建后状态不能修改，例如类中有一个字段是 `private final Set<String> names`，虽
然 `names` 引用本身不能修改（有 `final` 修饰），但技术上我们却可以向 `Set` 里
增减元素。而不可变要求我们不能做这样的修改。实际上 Java 并不会做这些检测，只是
如果不遵守这个规则，则不能保证对象就是线程安全的。

成员变量都是 `final` 修饰，实际上这是 Java 真正能检测到的内容。Java 会保证
[^JSL-chap17] 只有当一个对象的所有 `final` 成员变量都正确初始化后，该对象才对
其它线程可见。

对象是正确创建的，反例是在构造函数内，将 `this` 指针传递给其它对象使用。例如在
构造函数中启动新的线程，这个新的线程中使用了 `this` 指针。为什么要求对象是“正
确创建”的呢？是因为 Java 需要保证不可变对象的可见性，但是无法在构造函数执行过
程中，做到可见性保证，因此其它对象在构造函数中通过 `this` 访问某个成员变量，得
到的值可能是有问题的。

## 基于可变对象构造不可变对象

虽然说要求“创建后状态不能修改”，但在“创建时”却可以修改，考虑如下示例[^ref-book]：

```java
public final class ThreeStooges {
  private final Set<String> stooges = new HashSet<>();

  public ThreeStooges() {
    stooges.add("Moe");
    stooges.add("Larry");
    stooges.add("Curly");
  }

  public boolean isStooge(String name) {
    return stooges.contains(name);
  }
}
```

这里 `stooges` 变量显然是可变的，并且在构建函数中做了修改，但是类
`ThreeStooges` 依旧是不可变的，因为对（`final`变量的）状态修改发生在构造函数内
。依旧符合不可变对象的定义。

往底层了说，是因为 JMM 规定，在构造函数内对 `final` 成员变量引用的对象的修改，
不能重排序到构造函数之外[^ref-infoq]，这意味着当某个线程在访问某个对象的
`final` 变量时，构造函数里对 `final` 变量的修改都一定是完成并可见的。

## 使用 volatile 发布不可变对象

“发布”（publish）这个概念之前我们一直没有提，“发布对象”指的是使对象在当前作用
域之外可访问，例如保存对象的引用；在非私有的方法里返回对象；或将引用传递到其它
类的方法中。这个概念的核心是“共享”，“发布”是一个共享的操作。当一个对象被发布后
，我们无法控制其它线程会如何使用它，因此如果对象本身不是线程安全的，那么使用方
如果不注意，就很容易出错。

如果发布的是不可变对象，由于它本身是线程安全的，我们就不用担心使用方误用。例如
《Java 并发编程实战》中的 `OneValueCache` 示例：

```java
class OneValueCache {
  private final BigInteger lastNumber;
  private final BigInteger[] lastFactors;

  public OneValueCache(BigInteger i, BigInteger[] factors) {
    lastNumber = i;
    lastFactors = Arrays.copyOf(factors, factors.length);    // ①
  }

  public BigInteger[] getFactors(BigInteger i) {
    if (lastNumber == null || !lastNumber.equals(i))
      return null;
    else
      return Arrays.copyOf(lastFactors, lastFactors.length); // ②
  }
}
```

`OneValueCache` 是一个不可变类，代码中 ① ② 处分别用了 `Arrays.copyOf` 来复制输
入的 `factors` 数组和输出的 `factors`。如果这两处不复制，`OneValueCache` 就不
再是严格意义上的不可变了，因为我们无法控制 `OneValueCache` 类之外对构造函数输
入的 `factors` 引用做什么修改，也无法控制对 `getFactors` 返回的 `lastFactors`
引用做修改。

当然，如果你说你不需要那么强的要求，直接在文档写了“不要修改 factors”并假设没有
人会修改，这样不用 `copyOf` 行吗？当然没问题，这就是“约定” vs “机制”的问题了，
约定技术上是可能被打破的，机制不会但代价高。

有了 `OneValueCache` 我们就可以发布它：

```java
public class VolatileCachedFactorizer implements Servlet {
  private volatile OneValueCache cache = new OneValueCache(null, null);

  public void service(ServletRequest req, ServletResponse resp) {
    BigInteger i = extractFromRequest(req);
    BigInteger[] factors = cache.getFactors(i);
    if (factors == null) {
      factors = factor(i);
      cache = new OneValueCache(i, factors);
    }
    encodeIntoResponse(resp, factors);
  }
}
```

在“复合操作”一节中我们说过这个例子，说的是即使 `lastNumber` 与 `lastFactors`
本身都是原子的，整体操作也不是原子的。

现在我们通过不可变类 `OneValueCache` 将两个状态合二为一，这样从“可见性”的角度
上，它就是原子的了，即如果我看到 `lastNumber` 的值，那么 `lastFactors` 一定是
和它对应的结果。

当然，这个例子依旧会有 TOCTOU 的问题，可能有两个线程同时进入 `factor(i)` 的计
算，但由于这个例子的业务上是用 `cache` 来做缓存，所以最终无论谁的值进缓存都不
会影响正确性。

最后，成员变量标为 `final` 的不可变类 `OneValueCache` 起到什么作用？

这个问题书里没有回答，通过看一些文章和逻辑上的分析，我得出的结论是这样的：

1. 这个例子里要解决两个问题：
    1. 对 cache 的读写操作需要是原子的，因为只涉及一个引用的读写，已经满足
    2. 要保证可见性和有序性，保证其它线程看到 cache 时，`OneValueCache` 已经是正确初始化了
2. 本例中使用了 `final` 和 `volatile`，二者都可以满足 1.ii 的需求
3. 因此本例中其实 `final` 和 `volatile` 只需要一个就可以了
4. 不过如果不加 `final` 只用 `volatile`，则拿到 `cache` 引用的线程还可能做修改
   ，只能做到“约定”上的线程安全。

## 小结

“不可变对象”解决了“共享可变状态”中的“可变”问题。

我把“不可变”分成了“约定上”的和“机制上”的不可变。不可变对象在 Java 中主要需要解
决的是“可见性”和“有序性”的问题，要保证线程看到对象时，对象已经是正确初始化的，
而约定上的不可变并没有这个保证。

在 Java 中，机制上的不可变最核心的是要给类的成员变量加上 `final` 修饰，因为
Java 会对 `final` 修饰的字段做可见性和顺序性的保证。但如果 `final` 字段本身引
用了另一个对象，Java 并没有机制能保证这个对象的线程安全。

细节上，如果只是在对象的构造函数中修改 `final` 成员变量引用的对象，Java 也会保
证这些修改的可见性，我们给了一个例子说明如何基于可变对象构造不可变对象。

理论上真正的不可变对象，还要求对象创建后其中的状态就不再修改，如果对象不提供任
何修改内部状态的手段，我们就能百分百确定对象发布后是线程安全的。只是 Java 并没
有提供相关的机制来强制这个行为。

从编码的习惯上，不可变（Immutability）是很值得提倡的，不论对并发编程还是单线程
编程，它能极大地减少程序可能的状态，更容易 Debug，更不容易出错。

---

[^ref-book]: 摘抄自《Java 并发编程实战》

[^JSL-chap17]: [JSL 第 17 章](https://docs.oracle.com/javase/specs/jls/se8/html/jls-17.html#jls-17.5) 有关于 final 语义的详细介绍

[^ref-infoq]: [深入理解 Java 内存模型（六）——final](https://www.infoq.cn/article/java-memory-model-6)

