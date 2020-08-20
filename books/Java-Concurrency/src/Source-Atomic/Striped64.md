# Striped64

`Striped64` 是一个内部的类，用于实现 Adder 和 Accumulator。`LongAdder` 在高并
发下性能要优于 `AtomicLong`，原因是 `Striped64` 使用了类似分段锁的技术，减少了
高并发下的竞争。

`Striped64` 对外的语义是一个数字，在内部维护了一个 `base` 变量和一个 `cells`数
组，当线程尝试增减数字时，会先尝试对 `base` 进行修改，如果成功则退出，如果失败
则说明当前存在竞争，会根据线程的哈希值，对 `cells` 中的某个元素进行修改。外部
需要获取数值时，需要累加 `base` 和 `cells` 中的所有元素。

相比于 Atomic 变量中所有线程竞争同一个变量，`Striped64` 通过将线程分散，让多个
线程分别竞争数组中的某个元素，从而降低了竞争，减少了自旋的时间，最终提高了性能
。分段是十分重要的减少竞争的手段，例如在 ForkJoinPool 中也有类似思想。

## 成员变量

`Striped64` 有如下成员变量：

```java
abstract class Striped64 extends Number {
    /** Number of CPUS, to place bound on table size */
    static final int NCPU = Runtime.getRuntime().availableProcessors();

    /** Table of cells. When non-null, size is a power of 2.  */
    transient volatile Cell[] cells;

    /**
     * Base value, used mainly when there is no contention, but also as
     * a fallback during table initialization races. Updated via CAS.
     */
    transient volatile long base;

    /** Spinlock (locked via CAS) used when resizing and/or creating Cells. */
    transient volatile int cellsBusy;

    // ...
}
```

说明如下：

* `NCPU` 记录了系统 CPU 的核数，因为真正的并发数最多只能是 CPU 核数，因此
    `cells` 数组一般要大于这个数。
* `cells` 数组，大小是 2 的次方，这样将线程映射到 `cells` 元素时方便计算。
* `base`，基本数值，一般在无竞争能用上，同时在 `cells` 初始化时也会用到。
* `cellsBusy`，自旋锁，在创建或扩充 `cells` 时使用

从需求出发 `Cell` 类需要类似 `AtomicLong`，能通过 CAS 更新。实际定义如下：

```java
@sun.misc.Contended static final class Cell {
    volatile long value;
    Cell(long x) { value = x; }
    final boolean cas(long cmp, long val) {
        return UNSAFE.compareAndSwapLong(this, valueOffset, cmp, val);
    }

    // Unsafe mechanics
    private static final sun.misc.Unsafe UNSAFE;
    private static final long valueOffset;
    static {
        try {
            UNSAFE = sun.misc.Unsafe.getUnsafe();
            Class<?> ak = Cell.class;
            valueOffset = UNSAFE.objectFieldOffset
                (ak.getDeclaredField("value"));
        } catch (Exception e) {
            throw new Error(e);
        }
    }
}
```

熟悉了 `AtomicLong` 会发现，几乎就是一样的设计：volatile 变量、Unsafe 加上字段
的偏移量，再用 CAS 提供修改能力。

这里比较特殊的是 `@sun.misc.Contended` 注解，它是 Java 8 中新增的注解，用来避
免缓存的[伪共享
](https://mechanical-sympathy.blogspot.com/2011/07/false-sharing.html)，减少
CPU 缓存级别的竞争。有兴趣的可以搜索相关资料。

## longAccumulate

`Striped64` 主要提供了 `longAccumulate` 和 `doubleAccumulate`，方法比较长，我
们先从 `long` 的这版看起。

### 计算哈希

在 `Striped64` 中，哈希值的作用是用来分发线程到某个 `cells` 元素，`Striped64`
中利用了 `Thread` 类中用来做伪随机数 `threadLocalRandomProbe`：

```java
public class Thread implements Runnable {
  /** Probe hash value; nonzero if threadLocalRandomSeed initialized */
  @sun.misc.Contended("tlr")
  int threadLocalRandomProbe;
}
```

在 `Striped64` 中复制了 `ThreadLocalRandom` 的一些方法，用 `Unsafe` 来获取和修
改字段值。

```java
/**
 * Returns the probe value for the current thread.
 * Duplicated from ThreadLocalRandom because of packaging restrictions.
 */
static final int getProbe() {
    return UNSAFE.getInt(Thread.currentThread(), PROBE);
}

/**
 * Pseudo-randomly advances and records the given probe value for the
 * given thread.
 * Duplicated from ThreadLocalRandom because of packaging restrictions.
 */
static final int advanceProbe(int probe) {
    probe ^= probe << 13;   // xorshift
    probe ^= probe >>> 17;
    probe ^= probe << 5;
    UNSAFE.putInt(Thread.currentThread(), PROBE, probe);
    return probe;
}
```

可以理解为 `getProbe` 用来获取哈希值，`advanceProbe` 用来更新哈希值。


### 加锁

因为 `Cells` 类占用比较多的空间，所以它的初始化按需进行的，开始为空，需要时先
创建两个元素，不够用时再扩展成两倍大小。在个性 `cells` 数组（如扩展）时需要加
锁，加锁方式如下：

```java
(cellsBusy == 0 && casCellsBusy())

final boolean casCellsBusy() {
   return UNSAFE.compareAndSwapInt(this, CELLSBUSY, 0, 1);
}
```

既然有 CAS 来将 `cellsBusy` 设成 `1`，那么 `cellsBusy == 0` 这个判断还有意义吗
？从逻辑上没有区别，猜测应该是为了提高性能，变量的读取比 CAS 的代价小，因此如
果 `cellsBusy` 已经是 `1` 则 CAS 大概率 失败，提前判断能提高性能。

而释放锁则直接将 `cellsBusy` 设置为 `0` 即可：

```java
cellsBusy = 0;
```

另外为了保证逻辑正确，需要使用类似 Double Checked Locking 的技术，代码里多次用
到了如下模式：

```
if (condition_met) {       // 只在必要时进入
  lock();                  // 加锁
  done = false;            // 因为外层有轮询，需要记录任务是否需要继续
  try {
    if (condition_met) {   // 前面的 if 到加锁间状态可能变化，需要重新判断
      // ...

      done = true;         // 任务完成
    }
  } finally {
    unlock();              // 确保锁释放
  }

  if (done)                // 任务完成，可以退出轮询
    break;
}
```

### Accumulate 完整代码

完整代码比较长，注释如下：

```java
final void longAccumulate(long x, LongBinaryOperator fn,
                          boolean wasUncontended) {
    // 获取线程的哈希值
    int h;
    if ((h = getProbe()) == 0) {
        ThreadLocalRandom.current(); // force initialization
        h = getProbe();
        wasUncontended = true;
    }
    boolean collide = false;                // True if last slot nonempty
    for (;;) {
        Cell[] as; Cell a; int n; long v;
        if ((as = cells) != null && (n = as.length) > 0) { // cells 已经初始化了
            if ((a = as[(n - 1) & h]) == null) { // 对应的 cell 不存在，需要新建
                if (cellsBusy == 0) {       // 只有在 cells 没上锁时才尝试新建
                    Cell r = new Cell(x);
                    if (cellsBusy == 0 && casCellsBusy()) { // 上锁
                        boolean created = false;
                        try {               // 上锁后判断 cells 对应元素是否被占用
                            Cell[] rs; int m, j;
                            if ((rs = cells) != null &&
                                (m = rs.length) > 0 &&
                                rs[j = (m - 1) & h] == null) {
                                rs[j] = r;
                                created = true;
                            }
                        } finally {
                            cellsBusy = 0;
                        }
                        if (created)        // cell 创建完毕，可以退出
                            break;
                        continue;           // 加锁后发现 cell 元素已经不再为空，轮询重试
                    }
                }
                collide = false;
            }

            // 下面这些 else 在尝试检测当前竞争度大不大，如果大则尝试扩容，如
            // 果扩容已经没用了，则尝试 rehash 来分散并发到不同的 cell 中

            else if (!wasUncontended)       // 已知 CAS 失败，说明并发度大
                wasUncontended = true;      // rehash 后重试
            else if (a.cas(v = a.value, ((fn == null) ? v + x :   // 尝试 CAS 将值更新到 cell 中
                                         fn.applyAsLong(v, x))))
                break;
            else if (n >= NCPU || cells != as) // cells 数组已经够大，rehash
                collide = false;               // At max size or stale
            else if (!collide)                 // 到此说明其它竞争已经很大，rehash
                collide = true;
            else if (cellsBusy == 0 && casCellsBusy()) { // rehash 都没用，尝试扩容
                try {
                    if (cells == as) {      // 加锁过程中可能有其它线程在扩容，需要排除该情形
                        Cell[] rs = new Cell[n << 1];
                        for (int i = 0; i < n; ++i)
                            rs[i] = as[i];
                        cells = rs;
                    }
                } finally {
                    cellsBusy = 0;
                }
                collide = false;
                continue;                   // Retry with expanded table
            }
            h = advanceProbe(h);            // rehash
        }
        else if (cellsBusy == 0 && cells == as && casCellsBusy()) { // cells 未初始化
            boolean init = false;
            try {                           // Initialize table
                if (cells == as) {
                    Cell[] rs = new Cell[2];
                    rs[h & 1] = new Cell(x);
                    cells = rs;
                    init = true;
                }
            } finally {
                cellsBusy = 0;
            }
            if (init)
                break;
        }
        else if (casBase(v = base, ((fn == null) ? v + x :
                                    fn.applyAsLong(v, x))))
            break; // 其它线程在初始化 cells 或在扩容，尝试更新 base
    }
}
```

还有一个小细节，我们发现在判断 cells 是否为 null 及长度大于 0 时，先将 `cells`
赋值给临时变量，这是因为两个判断不是原子的，中间可能 `cells` 的值发生了变化，
如再次变成了 null。

```java
if ((as = cells) != null && (n = as.length) > 0) {
```

## doubleAccumulate

`doubleAccumulate` 的整体逻辑与 `longAccumulate` 几乎一样，区别在于将 `double`
存储成 `long` 时需要转换。例如在创建 `cell` 时：

```java
Cell r = new Cell(Double.doubleToRawLongBits(x));
```

`doubleToRawLongBits` 是一个 native 方法，将 `double` 转成 `long`。在累加时需
要再转来回：

```java
else if (a.cas(v = a.value,
               ((fn == null) ?
                Double.doubleToRawLongBits
                (Double.longBitsToDouble(v) + x) : // 转回 double 做累加
                Double.doubleToRawLongBits
                (fn.applyAsDouble
                 (Double.longBitsToDouble(v), x)))))
```


