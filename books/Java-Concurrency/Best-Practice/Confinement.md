# 封闭（Confinement）

“共享可变状态”有两个要点：“共享”和“可变”。封闭的策略是：不共享就完事了。

《Java 并发编程实战》一书中列举了三种封闭的方式。

* Ad-hoc 线程封闭
* 栈封闭
* ThreadLocal 类

## Ad-hoc 封闭

"Ad-hoc" 一般指“特别的、专门的、临时的”等，在编程的语境中一般指“具体情况具体分
析”。Ad-hoc 封闭也就指由程序自己实现的封闭。

例如有个 volatile 变量，在编写代码的时候，隐含实现了这样的约定：只有一个线程会
“写”该变量，其它线程只会“读”操作。那么这种情况下这个“写线程”即使做了
"Check-then-Act" 操作也是线程安全的。

所以 Ad-hoc 封闭也只能是“具体情况具体分析”了。

## 栈封闭

局部变量（local variables）在方法调用时被分配到栈上，正常情况下当方法返回时就
被销毁（不再被引用，可以被 GC 回收），只存在于调用的线程中。这些变量由于不会被
共享，即使变量本身并不是线程安全的，也不用担心方法的线程安全性。

当然如果局部变量通过一些方式在方法调用结束后依旧被引用，则不再是“封闭”的，就会
有线程安全的问题。如变量被作为方法的返回值被返回；被方法里创建的线程引用；引用
被保存到了其它地方，如实例变量（instance variable）等。

一般如果一个方法只依赖它的输入参数和方法内创建的局部变量，不依赖其它的全局的信
息，则可以说这个方法是“无状态”的。

## ThreadLocal 类

`ThreadLocal` 也可以认为是前文所说的“线程安全类”，只不过 `ThreadLocal` 的语义
上就是“线程封闭”的。

`ThreadLocal` 的作用是为每个线程保存一个副本，每个线程在调用 `get` 或 `set` 方
法时都只会操作本线程的副本。由于每个线程只用自己的那份，不存在共享行为，因此是
线程安全的。

一般来说，如果有一些对象从作用是可以做成单例，但它本身又不是线程安全的，就可以
使用 `ThreadLocal` 为每个线程创建一个副本，就可以线程安全地把它作为单例使用了
。

例如，我们知道 `SimpleDateFormat` 不是线程安全的，但是通过 `ThreadLocal` 的包
装，就可以做到线程封闭，不在线程间共享，做到线程安全，如下示例[^not-recommend]：

```java
public class DateUtil {
  private static ThreadLocal<SimpleDateFormat> dateFormat = ThreadLocal
          .withInitial(() -> new SimpleDateFormat("yyyy-MM-dd HH:mm:ss"));

  public static String formatDate(Date date) throws ParseException {
    return dateFormat.get().format(date);
  }
}
```

要注意的是，由于需要为每个线程创建一个副本，如果初始化的代价比较高且经常性地创
建新的线程，可能会有潜在的性能问题，虽然通常情况下不会成为问题。

另外，不要把从 `ThreadLocal` 获取的引用保存到其它地方，会有潜在的线程安全问题
。

## 小结

封闭策略用人话来说就是：尽量不要用全局变量，如果全局变量是单例，考虑用
`ThreadLocal` 包装。

---

[^not-recommend]: 尽管如此，Java 8 后还是推荐使用线程安全的 `DateTimeFormatter`
