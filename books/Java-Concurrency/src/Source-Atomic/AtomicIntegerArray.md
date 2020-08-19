# AtomicIntegerArray

这个类是对数组类型 `int[]` 的包装，提供的能力是对数据中某个元素的原子更新能力
，它的方法是基于某个元素的偏移量完成的，我们只看看元素的定位的部分：

```java
public class AtomicIntegerArray implements java.io.Serializable {
    // ...
    private static final int base = unsafe.arrayBaseOffset(int[].class);
    private static final int shift;
    private final int[] array;

    static {
        int scale = unsafe.arrayIndexScale(int[].class);
        if ((scale & (scale - 1)) != 0)
            throw new Error("data type scale not a power of two");
        shift = 31 - Integer.numberOfLeadingZeros(scale);
    }

    private static long byteOffset(int i) {
        return ((long) i << shift) + base;
    }

    // ...
```

我们看到数组的定位 `byteOffset` 等于 `base + scale * N`，我们通过
[jol](https://openjdk.java.net/projects/code-tools/jol/) 库打印

```
System.out.println(ClassLayout.parseClass(int[].class).toPrintable());
Unsafe unsafe = getUnsafe();
System.out.println(unsafe.arrayBaseOffset(int[].class));
System.out.println(unsafe.arrayIndexScale(int[].class));
```

得到结果：

```
[I object internals:
 OFFSET  SIZE   TYPE DESCRIPTION                               VALUE
      0    16        (object header)                           N/A
     16     0    int [I.<elements>                             N/A
Instance size: 16 bytes
Space losses: 0 bytes internal + 0 bytes external = 0 bytes total
16 // base = 16
4  // scale = 4
```

`base` 代表数组中第一个元素的偏移量，这里 `16` 代表了对象头信息，`scale` 代表
每个元素的大小，一个 `int` 默认是 `4` 个字节。

代码中的 `scale & (scale - 1)` 是很趣的 Hack，用来判断一个数是否为 2 的次方。

另一个细节是代码中将 `scale` 转换成了 `shift`，并用 `i << shift` 计算偏移量，
一般来说位移操作会比乘法快很多。

