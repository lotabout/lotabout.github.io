title: 在面向对象语言中写纯函数！
date: 2017-04-30 11:21:10
tags: ['FP']
categories:
toc: true
---

通常我们说函数式编程时，提到的都是 lambda 表达式，也即函数式编程中的“函数是头等
公民”的特点，然而函数式的另一个重要特点： **无副作用** ，在我看来更为重要。它可
以在任何语言中实际应用。今天，我们来谈一谈面向对象中的“副作用”。

## 什么是副作用

> In computer science, a function or expression is said to have a side effect if
> it modifies some state outside its scope or has an observable interaction with
> its calling functions or the outside world.

根据维基百科，在计算机中，当一个函数或表达式修改了自己的域之外的状态或是与函数外
的东西有可见的交互，我们就称该函数或表达式有副作用（side effect）。

说得更直白一些，如果调用一个函数，该函数可以（一个或多个）返回值，除此之外，如果
函数还修改了参数、全局变量，或是做了 I/O 操作，都说这个函数有副作用。没有副作用
的函数被称为 **纯函数**。

为什么要去讨论一个函数有没有“副作用”呢？这是因为，如果一个函数没有副作用，那么可
以推出这个函数的结果只依赖于它的参数，这个特性可以给我们带来一些好处，例如：

- 易于并行，同时多线程执行一个纯函数肯定是不会产生竞争的。因为函数需要的资源全都
  由参数提供。 
- 容易对它做缓存，因为函数的结果只与参数有关，因此可以容易对它做缓存。
- 易于 debug 及单元测试。只需要给定参数，检查结果即可。
- 如果一个纯函数的结果没有被使用，则删掉这个函数（及对它的调用）对程序的结果不影响。

## 一些非纯函数

Java 中的各种 setter **不是** 纯函数，因为它修改了函数的参数。

```java
class Account {
    private int balance;

    public setBalance(int newBalance) {
        this.balance = newBalance;
    }
}

Account account = new Account();
account.setBalance(100); // equals to setBalance(account, 100);
```

在上例中，执行完 `setBalance(account, 100)` 后， `account` 的值发生了变化，因此
不是纯函数。推而广之，任何类的方法，只要修改了类的属性，则该函数不是纯函数。

```python
last = 1
def nextRand():
    global last
    last = last * 13 % 7
    return last
```

上例中， `nextRand()` 函数读取并写入全局变量，因此 **不是** 纯函数。要注意的是只要
读入 **或** 写入全局变量都属于副作用。

```
def func(x):
    print "x is ", x
```

上述函数做了 I/O 操作，也不是纯函数。

结合上面的例子，其实有一个特别简单的判断，如果用相同的参数调用一个函数任意多次，
它们返回的结果是一样的，则这个函数就是 **纯函数**，反之则不是。

## 副作用的危害

单看上面的例子，我们看不出“副作用”的巨大危害，但 **避免副作用** 的思想一定要有！这
里举一个在工作上被副作用坑害的例子，用以警告大家去避免函数的副作用。

这个例子是真实场景下出现的一个问题，只是这里简化了其中的逻辑与需求。

需求是检查两个帐号的信息，判断它们是否雷同/相似，并给出相同的字段。于是有了类似
下面的代码：

```java
class AccountComparator {
    private Map sameFields = new HashMap();
    private Map diffFields = new HashMap();

    public Map compare(Account a, Account b) {
        bool sameName = a.getName().equal(b.getName());
        bool sameEmail = a.getEmail().equal(b.getEmail());
        bool sameBirthday = a.getBirthday().equal(b.getBirthday());

        saveField("name", sameName, a.getName());
        saveField("email", sameEmail, a.getEmail());
        saveField("birthday", sameEmail, b.getBirthday());

        return gatherResult();
    }

    private void saveField(String fieldName, bool isSame, String value) {
        if (isSame) {
            sameFields.put(fieldName, value);
        } else {
            diffFields.put(fieldName, value);
        }
    }

    private Result gatherResult() {
        Result ret = new Result();
        sameFields.forEach((k, v) -> ret.addSameField(k, v));
        diffFields.forEach((k, v) -> ret.addDiffField(k, v));
        return ret;
    }
}

AccountComparator comparator = new AccountComparator();
Result result = comparator.compare(a, b);
```

这里只对比了其中的三项信息，调用 `saveField` 把该项结果保存起来，最后调用
`gatherResult` 得到结果。在谈如何改进之前，这个类有什么问题？

相信你已经发现了，问题在于这个 `compare` 函数并不是纯函数！那会有什么问题呢？考
虑下面的代码。

```
Account a = new Account("nameA", "emailA", "BirthdayA");
Account b = new Account("nameA", "emailB", "BirthdayB");
Account duplication_a = new Account("nameA", "emailA", "BirthdayA");

AccountComparator comparator = new AccountComparator();
Result result1 = comparator.compare(a, b);
Result result2 = comparator.compare(a, duplication_a);
```

那么 `result2` 中的 `diffFields` 包含什么值？我们的预期是空，因为 `a` 与
`duplication_a` 是完全一样的，但实际返回时它却包含了 `email, birthday`。这些字段
是调用 `compare(a, b)` 时留下的！

上例的 bug 是非常难发现的，因为做单元测试时如果没有测连续的调用，或都连续调用的
参数设置不好，都是触发不了这个 bug 的。一般也不会特意想到这种例子，否则看代码就
能发现 bug 了。

下面是其中的一种改法：

```java
class AccountComparator {
    public static Map compare(Account a, Account b) {
        Map sameFields = new HashMap();
        Map diffFields = new HashMap();

        bool sameName = a.getName().equal(b.getName());
        bool sameEmail = a.getEmail().equal(b.getEmail());
        bool sameBirthday = a.getBirthday().equal(b.getBirthday());

        saveField("name", sameName, a.getName());
        saveField("email", sameEmail, a.getEmail());
        saveField("birthday", sameEmail, b.getBirthday());

        return gatherResult();
    }

    public static void saveField(Map sameFields, Map diffFields,
                                 String fieldName, bool isSame, String value) {
        if (isSame) {
            sameFields.put(fieldName, value);
        } else {
            diffFields.put(fieldName, value);
        }
    }

    public static Result gatherResult(Map sameFields, Map diffFields) {
        Result ret = new Result();
        sameFields.forEach((k, v) -> ret.addSameField(k, v));
        diffFields.forEach((k, v) -> ret.addDiffField(k, v));
        return ret;
    }
}
```

要注意的是这里的 `saveField` 函数依旧不是纯函数，因为它修改了函数的参数
`sameFields` 与 `diffFields`。但这里这么做是因为 Java 里对不可变数据结构
(immutable datastructure) 的支持较差。

这样一来，函数 `compare` 就变成了一个纯函数，因为它所需要的状态全部存在于函数内
（包括参数）。就样多次调用该函数也不会有问题的。

## 纯函数的“副作用”

如果写的函数都是纯函数会怎么样呢？

首先是没办法与外界交流，因为不能用任意的 I/O操作，这在实际的编程中是绝不可能的。
也因此，我们所能做的是尽量将“副作用”缩小到几个函数内，而大部分函数依旧是纯函数。

另一个问题就是效率。就像上面看到的，任意类的 setter 方法都不是纯函数，那么如果非
要把类的各种方法都变成纯函数，则每个方法都应该返回一个新的类，例如：

```java
class Account {
    private int balance;

    public Account setBalance(int newBalance) {
        return new Account(newBalance);
    }
}

Account account = new Account(10);
account = account.setBalance(100);
```

这样就会造成一些效率上的问题。那么是不是使用纯函数就是一个平衡的问题。这又涉及面
向对象风格与函数式风格的对比。这里不想过多讨论这种问题，但即使是面向对象的语言，
也可以尽量写成纯函数。

## 小结

函数式编程的思想包含很多内容，本文介绍了其中的“无副作用”概念，并给出一个实例，试
图说明副作用的坏处，并给出一个“无副作用”的实现。最后说明了纯函数的一些弱点。

想要表达的内容其实很简单：即使在面向对象语言中，我们也应该尽量写出无副作用的函数。

希望大家在平时的工作学习中，能够应用得上。
