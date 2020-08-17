# Unsafe

> Just because you can break the rules, doesn’t mean you should break the
> rules—unless you have a good reason. -- Ben Evans

在查阅 JUC 包的相关源码时，最终常常会用到 `Unsafe` 类中的一些方法，本章我们先
来看看 `Unsafe` 中的一些常见方法。

`sun.misc.Unsafe` 是一个底层包，它的方法几乎都是 native 方法，提供了利用底层特
性的能力，如使用 CPU 及其它硬件的特性的能力，绕过 JVM 对内存做特殊操作的能力等
。强大的能力通常意味着巨大的风险，使用 `Unsafe` 极其容易出错，一般应用程序中也
不应该使用。

由于 `Unsafe` 大多是 native 方法，所以只能看 openjdk 的 [Unsafe.cpp](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/share/vm/prims/unsafe.cpp)。


## 获取实例

在 JUC 的代码中，常常会这么获取 `Unsafe` 的实例：

```java
private static final Unsafe unsafe = Unsafe.getUnsafe();
```

如果复制这份代码尝试运行，发现会报 `SecurityException`，根本无法运行。这是因为
`Unsafe` 实在是太危险了，因此不允许在应用程序代码中使用，如果要使用，只能通过
反射的方式获得实例：

```java
Field f = Unsafe.class.getDeclaredField("theUnsafe");
f.setAccessible(true);
return (Unsafe) f.get(null);
```

（另：JDK 1.9 中 `Unsafe` 类被移到 `jdk.unsupported` 模块，显然是不希望开发者
继续使用，一些重要的功能通过 [Variable
Handles](http://openjdk.java.net/jeps/193) 提供。）

## Field Offset

第一个重要的概念是 Field Offset，即一个类中某个字段的偏移量，可以看到 `Unsafe`
中的方法在操作类中某个字段时，几乎都是直接操作字段在内存中的偏移量。

### 内存布局

类在内存中的结构 JVM 规范中并没有定义，这里以 HotSpot JVM 为例，它使用了
[Ordinary Object
Pointers(OOPS)](https://github.com/openjdk/jdk/tree/jdk8-b120/hotspot/src/share/vm/oops)
的数据结构[^memory-layout]，我们不关心细节，只是有个大概的印象。

对于下面这个类：

```
public class SuperClass {
    private int id;
    private ZonedDateTime createTime;
}

public class SubClass extends SuperClass {
    private boolean deleted;
    private String content;
}
```

使用 `jol-core` 打印出类的内存布局（`jol` 只支持 HotSpot）：

```
SubClass object internals:
 OFFSET  SIZE                      TYPE DESCRIPTION                               VALUE
      0    12                           (object header)                           N/A
     12     4                       int SuperClass.id                             N/A
     16     4   java.time.ZonedDateTime SuperClass.createTime                     N/A
     20     1                   boolean SubClass.deleted                          N/A
     21     1                   boolean SubClass.valid                            N/A
     22     2                           (alignment/padding gap)
     24     4          java.lang.String SubClass.content                          N/A
     28     4                           (loss due to the next object alignment)
Instance size: 32 bytes
Space losses: 2 bytes internal + 4 bytes external = 6 bytes total
```

我们大概需要知道：
* 包括父类继承的字段，都存放在同一片内存区域中
* Java object 有固定大小的 object header
* 字段为了对齐会加上 padding，这是 CPU 的限制，CPU 为了速度，取数时会对齐到
  word 上。如上例 `valid` 只占 1 个字节，后面有 2B 的 padding
* 如果有多个小字段，为了减少对齐浪费的空间，会移动字段，如 `valid` 被移到了
    `deleted` 之后。

当然 JVM 还有其它一些机制，如压缩对象等会影响对象的内存结构，这里不细说。

### objectFieldOffset

[Unsafe.objectFieldOffset](https://github.com/openjdk/jdk/blob/jdk8-b120/jdk/src/share/classes/sun/misc/Unsafe.java#L670)
可以用来获取字段的偏移量，不过文档里说明，获取的 offset 并不保证代表了字段的实
际偏移量，而只是偏移量的代号。不过在 HotSpot 的[实现
](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/share/vm/prims/unsafe.cpp#L722)
中，我们看它实际上返回的就是偏移量的字节，我们可以验证一下：

```java
Unsafe unsafe = getUnsafe();
System.out.println(unsafe.objectFieldOffset(SubClass.class.getDeclaredField("valid")));

// 21
```

看到 `21` 就是之前内存结构中 `SubClass.valid` 所在的偏移量。不过既然文档说了不
保证 `objectFieldOffset` 返回的是偏移量，我们也不应该做这个假设。

## 字段的访问操作

大概有这么几类：

```java
// 获取字段的值，类似的还有 getInt，getDouble，getLong，getChar 等
public native Object getObject(Object o, long offset);
// 设置字段的值，类似的还有 putInt，putDouble，putLong，putChar 等
public native void putObject(Object o, long offset, Object x);

// 获取字段的值，使用 volatile 语义，有 Int, Double, Long, Char 等变种
public native Object getObjectVolatile(Object o, long offset);
// 设置字段的值，使用 volatile 语义，有 Int, Double, Long, Char 等变种
public native void putObjectVolatile(Object o, long offset, Object x);

// putObjectVolatile 的变种，设置的值不保证被其他线程立即看到。
// 只有在 field 被 volatile 修饰符修饰时有效
public native void putOrderedObject(Object o, long offset, Object x);
```

其中 `getXXX/putXXX` 与 `getXXXVolatile/setXXXVolatile` 与 Java 中的赋值/取值
的语义相同，唯一的不同是 `Unsafe` 中的方法直接操作内存，可以无视 Java 中的访问
控制，即无视 `private`，`protected` 等修饰符。

### putOrdered

`putOrderedXXX` 需要特殊说明，它是 JUC 中常用的方法，通常用来实现惰性赋值。例
如需要将某个变量设置成 `NULL` 允许 GC 释放对应的内存。

`putOrderedXXX` 会保证同线程多次写入之间是有序的，但不保证写入的值**立即**对其
它线程可见。这一区别使得它的性能比 `putXXXVolatile` 方法要高出不少。

更底层来看，`putOrderedXXX` 只需要使用 `StoreStore` 屏障来保证有序即可，这在多
数的体系结构下不需要额外的操作或代价很低，而 `volatile` 写则需要 `StoreLoad`
屏障，而这个操作通常代价很高[^jdk-lazy-set]。

开始看代码找到
[unsafe.cpp](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/share/vm/prims/unsafe.cpp#L432)
，却发现 `putOrderedObject` 的实现与 `putObjectVolatile` 一模一样。后来才发现
内存屏障的区别是 JIT 期间优化的，在
[LibraryCallKit::inline_unsafe_ordered_store](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/share/vm/opto/library_call.cpp#L3042)
方法中实现，可以对比 volatile 变量写入的逻辑
[LibraryCallKit::inline_unsafe_access](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/share/vm/opto/library_call.cpp#L2504)
：

```cpp
bool LibraryCallKit::inline_unsafe_ordered_store(BasicType type) {
  // ...
  insert_mem_bar(Op_MemBarRelease);
  insert_mem_bar(Op_MemBarCPUOrder);
  // Ensure that the store is atomic for longs:
  const bool require_atomic_access = true;
  Node* store;
  if (type == T_OBJECT) // reference stores need a store barrier.
    store = store_oop_to_unknown(control(), base, adr, adr_type, val, type);
  else {
    store = store_to_memory(control(), adr, val, type, adr_type, require_atomic_access);
  }
  insert_mem_bar(Op_MemBarCPUOrder);
  return true;
}
---------------------------------------------------------------------------------------------------------
bool LibraryCallKit::inline_unsafe_access(bool is_native_ptr, bool is_store, BasicType type, bool is_volatile) {
  // ....
  if (is_volatile) {
    if (!is_store)
      insert_mem_bar(Op_MemBarAcquire);
    else
      insert_mem_bar(Op_MemBarVolatile); // ①
  }
  if (need_mem_bar) insert_mem_bar(Op_MemBarCPUOrder);
  return true;
}
```

注意 ① 处多出的一个 `Volatile` 屏障，可以在
[x86_64.ad](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/cpu/x86/vm/x86_64.ad#L6381)
文件中确认它是一个 `StoreLoad` 屏障。而 `putOrderedXXX` 则没有这个屏障。

## CAS

`Unsafe` 中主要提供了如下方法：

```java
// native 方法实现，有 Int、Long 变种
public final native boolean compareAndSwapObject(Object o, long offset, Object expected, Object x);

// 在 compareAndSwapObject 基础上的封装，不断执行 CAS 直到成功
public final Object getAndSetObject(Object o, long offset, Object newValue) {
    Object v;
    do {
        v = getObjectVolatile(o, offset);
    } while (!compareAndSwapObject(o, offset, v, newValue));
    return v;
}
```

### CAS 语义

Compare And Swap(CAS) 是 lock-free 算法中最基础的模块，通常由 CPU 指令直接支持
。函数通常有两个参数：`oldValue` 与 `newValue`，内部逻辑的伪代码如下：

```java
currentValue = readValue();
if (currentValue == oldValue) {
  setValue(newValue);
  return true;
} else {
  return false;
}
```

CAS 机制要能正确工作，需要保证原子性和可见性。原子性的要求显而易见，在 CAS 过
程中不能执行其它指令改变现有的值。同时至少要保证 `readValue` 读取的是最新的值
，但 `setValue` 的值是否对其它线程可见，似乎没有保证，不过一方面一般会对
`volatile` 变量执行 CAS 操作，另一方面 x86 架构下使用 `LOCK CMPXCHG` 指令时会
保证写入结果对其它线程可见。

### CAS 实现

`compareAndSwapObject` 方法的实现可以在
[unsafe.cpp](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/share/vm/prims/unsafe.cpp#L1178)
找到，一路追踪最终发现会调用
[atomic.hpp:cmpxchg](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/share/vm/runtime/atomic.hpp#L86)
。

```cpp
// Performs atomic compare of *dest and compare_value, and exchanges *dest with exchange_value
// if the comparison succeeded.  Returns prior value of *dest.  Guarantees a two-way memory
// barrier across the cmpxchg.  I.e., it's really a 'fence_cmpxchg_acquire'.
       static jbyte    cmpxchg    (jbyte    exchange_value, volatile jbyte*    dest, jbyte    compare_value);
inline static jint     cmpxchg    (jint     exchange_value, volatile jint*     dest, jint     compare_value);
// See comment above about using jlong atomics on 32-bit platforms
inline static jlong    cmpxchg    (jlong    exchange_value, volatile jlong*    dest, jlong    compare_value);

       static unsigned int cmpxchg(unsigned int exchange_value,
                                   volatile unsigned int* dest,
                                   unsigned int compare_value);

inline static intptr_t cmpxchg_ptr(intptr_t exchange_value, volatile intptr_t* dest, intptr_t compare_value);
inline static void*    cmpxchg_ptr(void*    exchange_value, volatile void*     dest, void*    compare_value);
```

这里的注释很重要，说明了至少会保证在 CAS 前加上 `fence`，在后面加上`acquire`屏
障。这些内联方法在不同平台上有不同的实现，如 Linux(x86) 的实现在文件
[atomic_linux_x86.inline.hpp](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/os_cpu/linux_x86/vm/atomic_linux_x86.inline.hpp#L144-L151)
中：

```cpp
inline jlong    Atomic::cmpxchg    (jlong    exchange_value, volatile jlong*    dest, jlong    compare_value) {
  bool mp = os::is_MP();
  __asm__ __volatile__ (LOCK_IF_MP(%4) "cmpxchgq %1,(%3)"
                        : "=a" (exchange_value)
                        : "r" (exchange_value), "a" (compare_value), "r" (dest), "r" (mp)
                        : "cc", "memory");
  return exchange_value;
}
```

不同的数据类型有不同的实现，这里列出的是 `long` 型数据的实现，可以看到用的是
`cmpxchgq` 指令，且在多核条件下会加 `LOCK` 前缀。`cmpxchg` 系列指令就是 x86 提
供的 CAS 指令。不过我们看到代码里并没有手工加内存屏障，这是因为在 x86 架构中，
`LOCK` 前缀本身会实现类似 `StoreLoad` 屏障的功能，因此不需要额外插入屏障。

## park/unpark

处理并发不可避免要处理线程的阻塞与唤醒，在 `Unsafe` 包中提供了下面两个函数：

```java
public native void unpark(Object thread);

public native void park(boolean isAbsolute, long time);
```

这两个方法的语义在它们的[注释
](https://github.com/openjdk/jdk/blob/jdk8-b120/jdk/src/share/classes/sun/misc/Unsafe.java#L995)
中有比较详细的说明，这里简要翻译如下：

`park` 方法会阻塞当前线程，方法会在下列情况下返回（线程被唤醒）：

- 有线程调用了 `unpark` 方法，或在 `park` 前已经有线程调用了 `unpark` 方法
- 线程被中断了（`Thread::interrupt`）
- `isAbsolute` 为 `false`，`time > 0` 且已经过去了 `time` 纳秒
- `isAbsolute` 为 `true`，且自 epoch 以来已经过了 `time` 秒
- 其它未知原因出错，直接返回

与 `park` 对应，`unpark` 方法用来唤醒 `park`。要注意 `unpark` 唤醒的机制是设置
一个标志位：

- 调用 `park` 时检测到标志位会清除标志并直接返回已经阻塞在 `park` 的线程在
- `unpark` 调用时会被唤醒，同样消除标志并返回

因此，`unpark` 调用的时机并不重要，它能保证至少“唤醒”一次 `unpark`。

### 实现

首先我们

[Parker](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/share/vm/runtime/park.hpp#L56)
中使用了 `_counter` 作为标识，它虽然是个 `int`，实际上只会取值 `0` 和 `1`。

```cpp
class Parker : public os::PlatformParker {
private:
  volatile int _counter ;
  Parker * FreeNext ;
  JavaThread * AssociatedWith ; // Current association
  // ...
}
```

然后注意 `park` 如果需要阻塞，是通过（Linux）系统的
[pthread_cond_wait](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/os/linux/vm/os_linux.cpp#L5932)
方法，等待条件变量进入阻塞：

```cpp
 assert(_cur_index == -1, "invariant");
  if (time == 0) {
    _cur_index = REL_INDEX; // arbitrary choice when not timed
    status = pthread_cond_wait (&_cond[_cur_index], _mutex) ;  // 阻塞
  } else {
    _cur_index = isAbsolute ? ABS_INDEX : REL_INDEX;
    status = os::Linux::safe_cond_timedwait (&_cond[_cur_index], _mutex, &absTime) ;
    if (status != 0 && WorkAroundNPTLTimedWaitHang) {
      pthread_cond_destroy (&_cond[_cur_index]) ;
      pthread_cond_init    (&_cond[_cur_index], isAbsolute ? NULL : os::Linux::condAttr());
    }
  }
  // ...

  _counter = 0 ;  // 清除标志
```

同时在被唤醒后继续执行，将 `_counter` 设置为 `0`。同理，`unpark` 方法通过
[pthread_cond_signal](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/os/linux/vm/os_linux.cpp#L5974)
方法唤醒等待条件变量的线程，当然，在唤醒前会将 `_counter` 置为 `1`：

```cpp
void Parker::unpark() {
  int s, status ;
  status = pthread_mutex_lock(_mutex);
  assert (status == 0, "invariant") ;
  s = _counter;
  _counter = 1; // 设置标志
  if (s < 1) {
    // thread might be parked
    if (_cur_index != -1) {
      // thread is definitely parked
      if (WorkAroundNPTLTimedWaitHang) {
        status = pthread_cond_signal (&_cond[_cur_index]); // 唤醒线程
        assert (status == 0, "invariant");
        status = pthread_mutex_unlock(_mutex);
        assert (status == 0, "invariant");
      }
   // ...
}
```

顺带一提，我们看到 `Thead::interrupt` 最终调用的 native 方法
[os::interrupt](https://github.com/openjdk/jdk/blob/jdk8-b120/hotspot/src/os/linux/vm/os_linux.cpp#L4220)
最终也会调用 `Parker::unpark` 来唤醒线程。

## 小结

本章大致从源码层面讲解了 `Unsafe` 提供的部分能力，这些能力是 JUC 并发类的基石
，这些 `unsafe` 方法都是 native 方法，用来绕开 java 封装的语义，提供更底层的操
作能力，而增加这么多复杂性的目的，就是提高程序的性能。

我们先简单介绍了 Java 对象的内存布局，以及获取字段偏移量的方法，偏移量是其它方
法的先决条件。

之后介绍了 `getXXX/putXXX` 和 `getXXXVolatile/putXXXVolatile`，
它们分别代表了 Java 中普通变量和 volatile 变量的读写能力，不同的是它们可以绕开
修饰符的限制。另外还单独讲解了 `putOrderedXXX`，它能高效的实现延迟设置的功能。

之后介绍了 CAS，它是 lock-free 算法的基石，在 JUC 的实现中无孔不入，CAS 底层直
接对应了 CPU 的指令，并保证 `fence_cmpxchg_acquire` 的语义，可以简单理解成保证
了原子性、有序性、可见性。

最后介绍了 `park`/`unpark` 语义，用来阻塞和唤醒线程。唤醒的机制是设置与清除“标
志”，因此可以多次，甚至提前唤醒。阻塞与唤醒使用了操作系统的条件变量（condition
variable）。

如果不关心底层细节只需要了解相关的语义即可，如果关心实现细节，需要理解很多内存
屏障以及背后的重排序、可见性相关的内容，感兴趣的读者可以阅读相关资料，一定会有
更大的收获。


## 参考

- [The JSR-133 Cookbook for Compiler Writers](http://gee.cs.oswego.edu/dl/jmm/cookbook.html) 详细解释了 Java 中的内存屏障
- [Java魔法类：Unsafe应用解析](https://tech.meituan.com/2019/02/14/talk-about-java-magic-class-unsafe.html) 分析了 `Unsafe` 包含的方方面面和使用示例
- [JUC中Atomic class之lazySet的一点疑惑](https://www.ktanx.com/blog/p/3100) 源
    码角度分析了 lazySet 及 putOrderedXXX 的实现原理
- [JAX London 2012: Locks? We Don't Need No Stinkin'
  Locks!](https://youtu.be/VBnLW9mKMh4) distruptor 对一些高级特性的使用，其中
  包括 `lazySet` 的讲解

---

[^memory-layout]: 参考 [Memory Layout of Objects in Java](https://www.baeldung.com/java-memory-layout)

[^jdk-lazy-set]: 参考 [JDK-6275329 : Add lazySet methods to atomic classes](https://bugs.java.com/bugdatabase/view_bug.do?bug_id=6275329) 中的描述。
