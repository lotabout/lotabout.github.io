title: Optional 不管用的日子
toc: true
date: 2020-12-12 18:13:05
tags: [java, Optional, Monad]
categories: [Notes]
---

Java `Optional` 类代表的是 [Monad/单子
](https://en.wikipedia.org/wiki/Monad_(functional_programming)) 的概念，在使用
时通常会写成链式调用的代码，但实际使用时会发现：有很多场景无法用链式调用表示。

## Optional 的蜜月期

`Optional` 提提供了 `map`, `filter`, `flatMap` 等方法来链式调用，例如下面代码
：

```java
Report getUsersLatestReport(long userId) {
  User user = findUserByUserId(userId);
  if (user == null) {
    return null;
  }

  String content = findReportContentById(user.getReportId());
  return JsonUtil.fromJson(content, Report.class);
}
```

如果 `findUserByUserId` 返回 `Optional<User>`，其它方法也都返回 `Optional`，则
可以用链式调用表示，代码会简洁很多：

```java
Optional<Report> getUsersLatestReport(long userId) {
  return findUserByUserId(userId)      // ①
      .map(User::getReportId)          // ②
      .flatMap(findReportContentById); // ③
      .flatMap(content -> JsonUtil::fromJson(content, Report.class)); // ④
}
```

能这么做的原因是 `map` 和 `flatMap` 隐式地处理了方法返回 `Optional::empty` 的
情况，例如当 ① 返回为 `empty` 时，`map` 会短路，跳过 ② 的执行，同理跳过 ③、④的
执行。因此 ②、③、④ 的方法调用中就不需要关心 `user` 返回为空的情形，使代码变得
简单。

P.S. 下文会把 `map` 或 `flatMap` 里的逻辑称为“模块”。

## 链式调用的“短视”

链式调用有一个局限：一个模块中只能看到模块的输入，无法感知其它模块的信息。这点
限制在写业务代码时容易成为掣肘，一个常见的需求是：输出日志时需要全局信息，例如
：

```java
Report getUsersLatestReport(long userId) {
  User user = findUserByUserId(userId);
  if (user == null) {
    return null;
  }

  long reportId = user.getReportId();
  String content = findReportContentById(reportId);
  Report report = JsonUtil.fromJson(content, Report.class);
  if (report == null) {
    log.error("Failed to deserialize report, userId: {}, reportId: {}", userId, reportId);
  }
  return report;
}
```

这里的 `log` 需要 `userId` 和 `reportId`。`userId` 是方法的入参，方便获得，但
`reportId` 是中间输出结果，用链式调用就很难写。

其中一个方法是将链式分段，这样能引用其它模块的输出：

```java
Optional<Report> getUsersLatestReport(long userId) {
  Optional<Long> oReportId = findUserByUserId(userId)
      .map(User::getReportId);

  Optional<Report> oReport = oReportId
      .flatMap(findReportContentById);
      .flatMap(content -> JsonUtil::fromJson(content, Report.class));

  if (!oReport.isPresent()) {
    log.error("Failed to deserialize report, userId: {}, reportId: {}",
        userId, oReportId.get());
  }
  return oReport;
}
```

也可以用线程安全的变量存储。还可以用包装类（如 Guava 里的 `Pair`）将结果一路传
到底，但这样中间的所有模块都需要处理这个额外的状态。

但不管是哪一类，都让代码显得不再“简洁”。

## Monad 生态隔离

一个 Monad 代表一个生态，不同生态间是不能“平滑”互通的，需要显式转换。“Monad”
这个概念对于不了解Category Theory 的同学会很陌生，这里也不想强行理论化。

举个例子，Java 中的 `Optional` 和 `Stream` 都提供了 `empty`, `map`, `flatMap`
等方法，概念上它们就是 Monad。对于 `Optional` 或 `Stream` 可以方便地链式调用，
但是一条链里没有办法同时处理 `Optional` 和 `Stream`。

例如对于下面的代码，没有用 `Optional` 和 `Stream`：

```java
Report getUsersLatestReport(long userId) {
  User user = findUserByUserId(userId);
  if (user == null) {
    return null;
  }

  List<Report> reports = findReports(user.getCategory());
  if (reports.isEmpty()) {
    return null;
  }

  reports.sort(Comparator.comparing(Report::getCreateTime).reversed());
  return reports.get(0);
}
```

而如果用 `Optional` 和 `Stream` 可以这样实现：

```java
Optional<Report> getUsersLatestReport(long userId) {
  return findUserByUserId(userId)
    .flatMap(user -> findReports(user.getCategory)
         .stream()      // ①
         .sorted(Comparator.comparing(Report::getCreateTime).reversed())
         .findFirst()); // ②
}
```

这份代码看着还是比不用链式调用简洁。但要注意两点：

1. ① 处创建了 `Stream` 并且 Stream 的链式调用实际上都在 Optional 的同一个
   `flatMap` 调用中
2. `Stream` 能与 `Optional` 互通，多亏了 ② 中的 `findFirst` 方法创建了一个
   `Optional` 对象

上面代码中的 `Stream` 生态，主动知晓了 `Optional` 生态，并提供了适配的方法（
`findFirst` 返回了 `Optional`）。生态互通依赖主动适配，意味着自建的 Monad 实际
上不容易融合到已有的生态中。

而理想的链式调用应该是“单层”：

```java
Optional<Report> getUsersLatestReport(long userId) {
  return findUserByUserId(userId)
    .getStream(user -> findReports(user.getCategory).stream())  // getStream 方法实际不存在
    .sorted(Comparator.comparing(Report::getCreateTime).reversed())
    .findFirst();
}
```

## 分支条件无法化简

如果逻辑里出现分支条件，那么即使提供链式的机制，分支也不可避免要存在于链式的模
块里。例如：

```java
Report getUsersLatestReport(long userId) {
  User user = findUserByUserId(userId);
  if (user == null) {
    return null;
  }

  return user.getAge() > 50
        ? getReportFromOldSystem(user.getReportId())
        : getReportFromNewSystem(user.getReportId())
}
```

这段代码要如何“化简”成链式调用？也许只能化简 `user == null` 的部分了：

```java
Optional<Report> getUsersLatestReport(long userId) {
  return findUserByUserId(userId)
      .flatMap(user -> user.getAge() > 50
        ? getReportFromOldSystem(user.getReportId())
        : getReportFromNewSystem(user.getReportId())
      );
}
```

而当分支条件多的时候，或者说链式调用里模块的逻辑复杂的时候，代码也不再“简洁”了。

## 小结

Java 中的 `Optional` 不仅仅是 `null` 的另一个实现，它与 `Stream` 一样在概念上
是 `Monad`，`Monad` 最直观的作用是允许我们通过 `map`, `flatMap` 等方法做链式调
用，但在一些特定的情况下却并不好用，例如：

- 某个模块依赖多个输入，而某些输入依赖其它模块的输出时
- 当你需要创建自己的 Monad，处理多个 Monad 的生态互通时
- 模块逻辑中含有分支条件时

许多“理想”的模式在实践中会有不少问题。例如笔者尝试用 WebFlux 写反应式编程，发
现很长的链式调用可读性会降低，因为很难追踪中间操作的含义；遇到需要多输入，需要
中间变量的操作时，很难组装成链式调用；在写 Rust 时发现用 `Result` 处理错误，不
同的错误类型间的转换非常繁琐……

在了解了 [Expression
Problem](https://lotabout.me/2018/Thoughts-on-Expression-Problem/) 受限于代码
的编写维度后，就在想有些困难是不是受限于一些无法解决的客观事实。例如 Rust 里的
错误处理总是让人诟病，应该是由于 Monad 生态隔离，导致需要很多手工的适配。而用
Monad 又是为了使用它的链式调用来让代码变得“简洁”。我们会觉得链式调用“简洁”，是
不是因为它是线性的代码？而人比较难理解分支的逻辑。而这是不是又受限于人的短期记
忆（比如只能记住7样事物）？毕竟很长的链式调用其实也很难理解。
