# Adder

`LongAdder` 使用一个变量和一个动态增长的数组来共同保存一个 `long` 型的 sum 值
，初始值为 0。它继承了 `Striped64`，在高并发时将线程分发到数组的不同元素做更新
，以此来降低总体的竞争。因此相比于 `AtomicLong`，在高并发下 `LongAdder` 会更高
的吞吐。不过由于将一个数值分散到多个地方，从 `LongAdder` 获取的值可能没法“立即
”可见（累加时可能被其它线程修改了）。

`LongAdder` 的主体逻辑重用了 `Striped64` 的 `accumulate` 方法，需要先了解下
`Striped64`的实现，这里只看看上层封装的内容。

## add

增加某个值时，会尝试先用 `casBase` 来更新 `base` 的值；否则会尝试用 `getProbe`
获取线程的哈希值，找到对应的数组元素（`as[getProbe() & m]`），并尝试更新元素的
值；如果都失败再调用 `Striped64` 的 `longAccumulate` 方法更新值。

```java
public void add(long x) {
    Cell[] as; long b, v; int m; Cell a;
    if ((as = cells) != null || !casBase(b = base, b + x)) {
        boolean uncontended = true;
        if (as == null || (m = as.length - 1) < 0 ||
            (a = as[getProbe() & m]) == null ||
            !(uncontended = a.cas(v = a.value, v + x)))
            longAccumulate(x, null, uncontended);
    }
}
```

代码逻辑没有特殊的地方，只是在 `if` 条件判断中会调用 CAS 操作来做修改，方法有
副作用。这种方式在日常的编码中不提倡。

## sum

`sum` 方法很直接，累加 `base` 与 `cells`：

```java
public long sum() {
    Cell[] as = cells; Cell a;
    long sum = base;
    if (as != null) {
        for (int i = 0; i < as.length; ++i) {
            if ((a = as[i]) != null)
                sum += a.value;
        }
    }
    return sum;
}
```

这里的重点是 `sum` 方法不是原子的，在 `sum` 过程中，如果有其它线程在修改值，则
`sum` 的结果可能是“老”的。

## DoubleAdder

`DoubleAdder` 和 `LongAdder` 几乎一样，只是存储是用 `long` 型，所以在存储/读取
`double` 时需要使用 `Double.doubleToRawLongBits` 和 `Double.longBitsToDouble`
做转换。
