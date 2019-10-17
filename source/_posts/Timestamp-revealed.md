title: 聊一聊时间戳
toc: true
date: 2019-10-15 20:48:19
tags: [java, timestamp]
categories: [Notes]
---

海上生明月，天涯共此时。在计算机的世界里，怎么才能“共此时”呢？

## 时间如何存储

存储的首先需要有唯一性。

你朋友说要在 `22:00` 给你打电话，结果 `21:00` 电话就来了，心里咒骂了一阵，才想
起来朋友在日本，日本 `22:00` 时北京正好是 `21:00`。虽然平时可能不太注意得到，
但是如果想让时间唯一，是需要加上时区的。用 `时间＋时区` 来存储时间似乎是一个好
选择。

存储的数据最好能方便比较。

你可能很难一眼看出 `10:00 CST` 和 `11:00 IOT` 哪个时间更早。但如果统一换算成
协调世界时(UTC)或是其它什么时区，就很容易比较了。也就是说存储的基准最好一致。

再着嘛，最好节省空间。

直接的想法是记录年月日时，但是一个标准的时间字符串 (如 `2019-10-15
20:48:19.128`) 就占用了 23 个字节，比较浪费。所以计算机中也使用一种称为 epoch
time 的存储方式，存储的是当前时间(转换为 UTC) 距离 Unix epoch (`1970-01-01
00:00:00`) 的毫秒数，例如上例可表示为 `1571172499000`。这样要表示日常生活中的
时间，通常只需要 4 个字节(32位) 或是 8 个字节(64位) 即可。当然，存储节省了，能
表示的时间范围也小了，例如 32 位的 epoch time 最多只能表示到 `2038-01-19`。

下面是列举了一些系统的时间表示方式：

* MySQL 中的 `TIMESTAMP` 类型以 `YYYY-MM-DD hh:mm:ss` 表示
    当前时间对应的UTC时间[^mysql-representation]， 占 19 个字节。
    * 5.6.4 之后的版本可通过 `TIMESTAMP(n)` 指定保留 n 位毫秒数[^mysql-mills]
* Java 中的 Date 类型内部以 `long` 型(64位)存储当前时间(UTC)距 epoch time 的毫秒数。
* 大数据格式 Parquet 以 `int96` 的类型存储当前时间(UTC)距 epoch time 的纳秒数。

[^mysql-representation]: https://dev.mysql.com/doc/refman/5.5/en/datetime.html
[^mysql-mills]: https://dev.mysql.com/doc/refman/5.5/en/datetime.html

当然后面我们会看到，为了更准确处理各种情形，也会直接用 `年月日时分秒＋时区` 的
方式存储。

## 时间如何解析

假设我们以 epoch time 作为存储格式，现在拿到 `2019-10-15 20:48:19` 这样一个时
间，要如何转换成相应的 epoch time 呢？注意，这个时间字符串是不带时区的！

原始时区信息缺失是时间处理不一致的重要根源之一，不同的系统/工具应对的方式不同
。

例如 `java.sql.Timestamp.valueOf` 会认为解析的字符串就是 UTC 时间。Java 创建
`Timestamp`类型的初衷是对标 MySQL 的 `TIMESTAMP` 类型，两者在**解析**时都认为
输入是 UTC 时间也就不足为奇了。

```java
String timeStr = "2019-10-15 10:10:10.001";
Timestamp timestamp = java.sql.Timestamp.valueOf(timeStr);
System.out.println(timestamp);
System.out.println(timestamp.getTime());

// 2019-10-15 10:10:10.001 # 北京时间下运行
// 1571105410001 # (2019-10-15 10:10:10.001 in GMT)

// 2019-10-15 10:10:10.001 # 东京时间下运行
// 1571101810001 # (2019-10-15 10:10:10.001 in GMT)
```

上例中将系统调成北京时间(CST)还是东京时间(JST)，输出的内容不变。

而 `java.util.Date` 以及对应的 `java.text.DateFormat` 都允许指定时区，默认选取
系统的时区进行解析。下面以 `SimpleDateFormat` 为例
[^simple-date-format-not-thread-safe]：

```java
SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS");
String timeStr = "2019-10-15 10:10:10.001";
java.util.Date date = format.parse(timeStr);
System.out.println(date);
System.out.println(date.getTime());

// Tue Oct 15 10:10:10 CST 2019 # 北京时间下运行
// 1571105410001 # (2019-10-15 2:10:10.001 in GMT)

// Tue Oct 15 10:10:10 JST 2019 # 东京时间下运行
// 1571101810001 # (2019-10-15 1:10:10.001 in GMT)
```

由于使用了系统当前所在的时区，上面的代码在北京时间（CST）和东京时间（JST）下执
行，得到的毫秒数是不同的。

[^simple-date-format-not-thread-safe]: `SimpleDateFormat` 不是线程安全的，Java 8
  之后尽量使用 `java.time.DateTimeFormatter`

## 时间如何展示

展示的终极问题：要以当前的时区展示？还是以原时区展示？这是与业务相关的。

* 如果要判断一笔交易在几点进行，则可能按发生地时区展示/计算更合理（例如认为凌
    晨发生的交易是欺诈的可能性高，则境外的交易就需要按境外的时区算几点）
* 如果要展示一篇博客何时发布，以读者所在的时区展示可能更理想

正因为这个决定跟业务相关，系统的实现者只能为两种需求都提供对应的机制。显然以
epoch time 存储是不行的，因为它不带原始时区。MySQL 的存储也同样不行，虽然
以字符串存储，但依旧不包含原始时区[^mysql-datetime]。这里我们简单记录 Java 提
供的处理机制。

[^mysql-datetime]: MySQL 中的 `DATETIME` 类型不会将时间转换成 UTC，但依旧不保留
时区信息。

Java 8 的 `java.time` 包中提供了许多时间处理的类，让我们按需自取。如
`LocalDate`、`LocalTime` 和 `LocalDateTime` 内部以年月日、时分秒的形式保存了日
期和时间，不包含任何时区的信息。而 `ZonedDateTime` 则是 `DateTime` 加上时区，
用于处理与时区相关的所有操作，包括时区间的时间转换。

Java 8 中的 `ZonedDateTime` 人如其名，内部提供了额外的字段保留时区：

```java
String timeStr = "2019-10-15T10:10:10.001+02:00[Europe/Paris]";
ZonedDateTime datetime = ZonedDateTime.parse(timeStr);
System.out.println(datetime);
System.out.println(datetime.toInstant().getEpochSecond());

// 2019-10-15T10:10:10.001+02:00[Europe/Paris] # 北京时间下运行
// 1571127010 # 2019-10-15 08:10:10 GMT
```

可以看到，尽管在北京时间下运行，输出里仍然保留了原始输入的时区：巴黎时间。

而如果希望将巴黎时间展示为当前的时区，则可以如下操作：

```java
String timeStr = "2019-10-15T10:10:10.001+02:00[Europe/Paris]";
ZonedDateTime parisTime = ZonedDateTime.parse(timeStr);
ZonedDateTime shanghaiTime = parisTime.withZoneSameInstant(ZoneId.systemDefault());
System.out.println(shanghaiTime);
System.out.println(parisTime.toInstant().getEpochSecond());

// 2019-10-15T16:10:10.001+08:00[Asia/Shanghai]
// 1571127010
```

可以看到，当前时区是上海，巴黎 `10:10` 时，上海是 `16:10`。

## 小结

时间处理，尤其是在不同系统中传递时间信息，一般会涉及三个问题：

1. 数据解析，时间数据如何解析成内部格式？如何补全时区信息？
2. 数据存储，存储带不带原始时间的时区？
3. 数据展示，要展示原始时区？当前时区？还是其它时区？

考虑一下，Java 中的 LocalDateTime 是不带时区的，但是如果将对应数据存入 MySQL，
则需要转换成 epoch time，那么如何补全时区信息呢？

## 参考

- https://en.wikipedia.org/wiki/Unix_time 关于 epoch time 的更多信息
- [Java 中的时间日期 API（上）](https://juejin.im/post/5adb06cdf265da0b7b3579fb) 详细介绍了 Java 的时间 API
- [Java 中的时间日期 API（下）](https://juejin.im/post/5addc7a66fb9a07aa43bd2a0) 详细对比了 Java 8 的时间 API
- http://wrschneider.github.io/2019/09/01/timezones-parquet-redshift.html 时间处理不一致的示例
