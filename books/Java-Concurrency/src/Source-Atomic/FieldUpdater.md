# FieldUpdater

FieldUpdater 可以对其它类的 `volatile` 变量的包装，实现 CAS 的相关操作，相比于
直接使用 `AtomicInteger`，它的主要优势是能节省内存。

我们先看一个使用示例：

```java
class MyStruct {
  public volatile int intField;
}

public static void main(String[] args) {}
  AtomicIntegerFieldUpdater<MyStruct> updater =
      AtomicIntegerFieldUpdater.newUpdater(MyStruct.class, "intField"); // ①

  MyStruct struct = new MyStruct();
  updater.compareAndSet(struct, 0, 1); // ②
  System.out.println(struct.intField); // 输出 1
}
```

上例中，我们在 ① 处创建了 FieldUpdater，可以看到创建时需要指定类和字段名。在 ②
中我们通过调用 `updater` 的 CAS 方法得到了 CAS 的能力。

注意的是，`updater` 是基于类创建的，一个 `updater` 可以用在类的多个实例上。这
也是 FieldUpdater 的一个重要使用场景，用来节省内存。例如上例中，如果将
`MyStruct` 中的 `volatile int` 用 `AtomicInteger` 代替，同时又需要创建许多的实
例，此时用 `volatile int` 加 FieldUpdater 的方式能节约不少内存（一个实例约省
16B[^ref-memory-saved]）。

此外要注意 FieldUpdater 的的访问是通过反射完成的，实现中限制了对字段的访问权限
，尽力保持与原生 Java 字段修饰符一致。如上例中如果将 `intField` 改成 `private`
，则运行时 `comapreAndSet` 方法会报错。也因此，`updater` 更常用来访问当前类或
父类的字段。

最后，FieldUpdater 对原子性的保证更弱，它只能保证 `updater` 的`compareAndSet`
、`set` 等方法的调用间能保证原子性，如果同时还有线程直接读写类中的字段，则保证
不了原子性。

## FieldUpdater 类成员

在 `AtomicIntegerFieldUpdater` 中找到它的唯一实现类：

```java
private static final class AtomicIntegerFieldUpdaterImpl<T>
    extends AtomicIntegerFieldUpdater<T> {
    private static final sun.misc.Unsafe U = sun.misc.Unsafe.getUnsafe();
    private final long offset;
    /**
     * if field is protected, the subclass constructing updater, else
     * the same as tclass
     */
    private final Class<?> cclass;
    /** class holding the field */
    private final Class<T> tclass;
```

其中的 `offset` 是常规的字段在内存中的偏移量；`cclass` 用来做访问控制；
`tclass` 是要更新的目标类。

## compareAndSet

CAS 的实现很简单，直接调用了 `Unsafe` 的相关方法，唯一不同是在调用前要做访问权
限的检查。

```java
public final boolean compareAndSet(T obj, int expect, int update) {
    accessCheck(obj);
    return U.compareAndSwapInt(obj, offset, expect, update);
}
```

## accessCheck

访问控制不是我们讲解的重点，但也有一些看点，先看 `accessCheck` 的实现：

```java
private final void accessCheck(T obj) {
    if (!cclass.isInstance(obj))
        throwAccessCheckException(obj);
}
```

只是单纯判断 `obj` 是不是类 `cclass` 的一个实例，那么 `cclass` 是什么？在构造
函数中做了赋值：

```java
 AtomicIntegerFieldUpdaterImpl(final Class<T> tclass,
                               final String fieldName,
                               final Class<?> caller) {
     // ...

     // Access to protected field members is restricted to receivers only
     // of the accessing class, or one of its subclasses, and the
     // accessing class must in turn be a subclass (or package sibling)
     // of the protected member's defining class.
     // If the updater refers to a protected field of a declaring class
     // outside the current package, the receiver argument will be
     // narrowed to the type of the accessing class.
     this.cclass = (Modifier.isProtected(modifiers) &&
                    tclass.isAssignableFrom(caller) &&
                    !isSamePackage(tclass, caller))
                   ? caller : tclass;
     // ...
 }
```

FieldUpdater 从语义上要保持跟 Java 的权限控制一致，在 Java 中，一个
`protected` 字段可以被三种情况访问：类本身、子类、同 package 的其它类。换言之
，一个 `updater` 可以访问父类、类本身、子类、及同 package 其它类的 protected
字段。但是还有一个特例：

```
.
├── packageA
│   ├── Super.java
│   └── SubclassA.java
└── packageB
    └── SubclassB.java
```

在 `SubclassB` 中构造 `Super` 的 `updater` 时，会判断 `SubclassB` 能否访问
`Super` 中的字段，显然是可以的，因为 `SubclassB` 是 `Super` 的子类。但是在运行
时，如果尝试访问 `Super` 任意子类的实例，如 `SubclassB` 的实例：

```java
Super object = new SubclassA();
updater.compareAndSet(object, expect, update);
```

从技术上来说是可行的，但从语义上变成了 `SubclassB` 能访问 `SubclassA` 的
`protected` 变量，不符合预期。因此在构造函数的代码就是判断，当 `SubclassB` 与
`Super` 不在同一个 package 时，要求 `updater` 最终只能访问 `SubclassB` 的子类
，而不是 `Super` 的任意子类。

## AtomicLongUpdater

对于 `long` 型变量，系统不一定能直接支持 CAS 操作，于是它有两种实现，一种是基
于 CAS 的，另一种是基于 `synchronized` 的。

```java
@CallerSensitive
public static <U> AtomicLongFieldUpdater<U> newUpdater(Class<U> tclass,
                                                       String fieldName) {
    Class<?> caller = Reflection.getCallerClass();
    if (AtomicLong.VM_SUPPORTS_LONG_CAS)
        return new CASUpdater<U>(tclass, fieldName, caller);
    else
        return new LockedUpdater<U>(tclass, fieldName, caller);
}
```

## AtomicReferenceUpdater

对于更新 reference 来说，它的值类型是不确定的，因此在创建 `updater` 时需要额外
指定值的类型：

```java
@CallerSensitive
public static <U,W> AtomicReferenceFieldUpdater<U,W> newUpdater(
  Class<U> tclass, Class<W> vclass, String fieldName) { // 注意这里的 vclass
    return new AtomicReferenceFieldUpdaterImpl<U,W>
        (tclass, vclass, fieldName, Reflection.getCallerClass());
}
```

在执行 CAS 前会判传递的值是否能转换成 `vclass`：

```java
public final boolean compareAndSet(T obj, V expect, V update) {
    accessCheck(obj);
    valueCheck(update);
    return U.compareAndSwapObject(obj, offset, expect, update);
}

private final void valueCheck(V v) {
    if (v != null && !(vclass.isInstance(v)))
        throwCCE();
}

static void throwCCE() {
    throw new ClassCastException();
}
```

---

[^ref-memory-saved]: 参考：[Lesser known concurrent classes - Atomic*FieldUpdater](http://normanmaurer.me/blog/2013/10/28/Lesser-known-concurrent-classes-Part-1/)
