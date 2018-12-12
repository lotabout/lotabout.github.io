title: Expression Problem 随想
toc: true
date: 2018-12-12 08:09:52
tags: [Expression Problem, FP, OOP]
categories: [Notes]
---

大家都听过 `程序 = 数据结构+算法`，从另一种意义上说 `程序 = 数据+操作`。
Expression Problem 指的是如何在不修改已有的源代码，添加新的数据或操作。它
提供了一种新的视角，来看待编程语言和程序设计。

## 什么是 Expression Problem

假设我们有两种“形状”：正方形和圆形，并且想计算它们的面积。Expression Problem的
问题是：在不修改现有代码的情况下，能不能方便地新增一个数据“三角形”，同时新增一
个操作“求周长”？我们将看到，用“数据优先”的思路，则新增操作比较困难；相反如果以
“操作优先”的思路，则新增数据会比较困难。

### 数据优先

面向对象就是典型的数据优先的思路，如果用面向对象的方式来实现如下：

```java

public interface Shape {
    double area();
}

public class Square implements Shape {
    private double side;

    @Override
    public double area() {
        return side * side;
    }
}

public class Circle implements Shape {
    private double radius;

    @Override
    public double area() {
        return 3.14 * radius * radius;
    }
}
```

如果想新增一个数据：“三角形(Triangle)”，那么只需要新建一个类，实现 `Shape` 接
口即可，不需要修改现有的任何代码。所以我们说面向对象的方式**易于**新增数据。

那么如果想新增一个操作 `perimeter` 来求周长呢？上面的实现方式就需要我们为
`Shape` 接口新增 `perimeter` 方法，同时修改 `Square` 和 `Circle` 类来增加新的
实现。这要求我们修改现有的代码，因此说面向对象的方式**不易于**新增操作。

当然，我们会说改就改呗，没什么大不了嘛。问题在于，你可能没有权限修改现有的代码
(如用的是别人的库)，而又希望能扩展它们的功能。

### 操作优先

操作优先的典型是函数式编程，这里我们依旧使用 Java 来实现，但方式是函数式编程：

```java
public class Shape {
}

public class Square extends Shape {
    public double side;
}

public class Circle extends Shape {
    public double radius;
}

public class AreaService {
    public static double area(Shape shape) {
        if (shape instanceof Square) {
            double side = ((Square) shape).side;
            return side * side;
        } else if (shape instanceof Circle) {
            double radius = ((Circle) shape).radius;
            return radius * radius;
        } else {
            throw new IllegalArgumentException("shape not recognized")
        }
    }
}
```

可以看到 `area` 函数中对 `shape` 的类型进行了判断(或称模式匹配)。如果想新增数
据“三角形(Triangle)”，则需要修改 `area` 方法，新增一个 `if` 判断才行。因此说函
数式编程**不易于**新增数据。

相反，如果想新增求周长的操作 `perimeter`，可以新增一个 `PerimeterService` 而不
需要修改现有的任何代码。所以说函数式编程**易于**新增操作。

## 问题根源

要解决问题，要先弄清问题的根源，这里引用 [StackOverflow 的这个回答
](https://stackoverflow.com/a/22180495/826907) 来尝试说明：

“数据”和“操作”是程序的两个维度，它们之间存在映射关系（数据可以应用在多个操作上
，操作可以接受多个数据）。但源代码的表示是一维的，从上到下，从左到右。于是这种
映射关系要么以数据为主来组织（面向对象编程中，类的方法需要写在类中），要么以操
作为主来组织（函数式编程中，对不同数据的处理需要写在同一个代码块中）。

{% asset_img data-operation.svg Data vs Operation %}

如上图，以数据为主看到两类数据：`Square` 和 `Circle`，它们有各自的方法；以操作
为主看到两个方法：`area` 和 `perimeter`，它们分别能接受各自的数据作为参数。

如果以数据为主，写成代码类似下面的结构：

```
# Data-Centric
((square area)
 (circle area))
```

于是增加新的数据只需要增加对应的行，如增加三角形：

```
((square area)
 (circle area)
 (triangle area)) # 新增
```

而如果要新增一个方法，则需要为每一行增加新的列，即需要修改现有的代码：

```
((square area perimeter)
 (circle area perimeter))
              # 新增列
```

以操作为优先也类似。因此归根结底，Expression Problem 的矛盾在于二维的程序（数
据与操作的关联）无法在一维的源代码上有效地组织。

## 解决方案？

[维基百科](https://en.wikipedia.org/wiki/Expression_problem) 上给了很多相应的
解决方案。我觉得具体的方案对“开眼界”不是特别重要，这里简要说说：

1. OOP 理论上是以数据为中心，但用 Visitor Pattern 可以让我们切换成以操作为中心
   。它解决不了 Expression Problem，但让我们有了选择的机会
2. Python 和 Ruby 等语言可以对已有的类添加新的方法，算是 "Open Class" 的方案，
   也称 "Monkey Patching"
3. Common Lisp、Clojure 等语言采用了 Multi-Method 的方案，让数据与操作的关联不需
   要一次性指定，因此不限制必须从某个维度去组织
4. 还有一些基于 Visitor Pattern 和泛型的方案，太复杂没看懂

## 一些思考

下面是博主自己的一些思考，欢迎讨论。

### Expression Problem 真的是需要解决的问题吗？

换句话说，强制以某个维度组织程序真的不好吗？。自由与强大通常会带来无序与混乱。
不同人会有不同的选择。例如 Monkey Patching 允许我们使用一个库，并在基础上加自
己的功能而不需要修改原来的库，功能强大；但现在你在引用两个库的时候就需要担心，
会不会其中一个库 patch 了另一个库的方法，而与你的预期不符呢？

从代码的管理上，如果用 OOP 的思路，一个类的方法都在这个类中，是很容易找到它的
边界的；反观 Monkey Patching 甚至没法知道一个对象都有哪些方法。牺牲扩展性带来
的确定性值得吗？

### 扩展数据 vs 扩展方法

现在看到许多许多 Java 代码，在写类的时候加上 getter/setter，然后把处理类的方法
写在一个 Service 类中。这种写法其实并不 OOP，它其实是函数式编程，设计模式上也
称为“贫血模型”，因为类中没有业务逻辑。

Expression Problem 也许能从某种角度上解释为什么越来越多这样的代码。虽然 OOP 的
特点是“继承”、“封装”、“多态”，但起码从“继承”的角度来说，除了 GUI 编程，现实中
的业务逻辑没有多少能用到的，甚至现在越来越多“用组合不用继承”的声音。这种趋势隐
含的意义是：现实中没有太多的“扩展数据”的需求。

也因此 OOP 从扩展性而言似乎并没有多少实用性，而业务上经常需要添加修改方法，也
许正是如此更习惯从“操作”的角度组织程序吧。

### 模块的边界

我们经常说写程序要“高内聚、低耦合”，那么内外的边界在哪呢？那么在 Expression
Problem 上，允许在不修改现有模块的基础上进行扩展，算不算是破坏了这个原则呢？
换个角度说，模块的扩展是否应该由模块的维护者在模块的内部完成呢？

我们说 OOP 能提供“封装”，因为隐藏了具体的实现，我的理解是它维护了一个类内部的“
约定”，而 FP 由于暴露了数据结构，则较难控制模块外部构建出非法的结构。

从这种角度来说，OOP 是用类来维护了数据的边界。也算是从一个极细粒度上的“高内聚”吧。

## 小结

Expression Problem 是指如何在不修改现有代码的前提下新增数据和操作。我们指出它
的矛盾在于程序是二维的，而源代码是一维的，在表达程序时分主次维度就会造成次维度
难以修改。

此外我们简单提了几个解决方案，然后表达了对 Monkey Patching 的纠结态度，以及对
在 Java 里不写 OOP 的吐嘈。最后推荐大家看看《领域驱动设计》。

## 参考

- https://eli.thegreenplace.net/2016/the-expression-problem-and-its-solutions/
    一篇关于 Expression 的博文，讨论了如何扩展 visitor pattern 来解决，以及在
    Clojure、Python/Ruby 语言中的解决方案
- http://ropas.snu.ac.kr/~bruno/papers/ecoop2012.pdf 用 Algebra Types 来解决
    Expression Problem
- http://www.kframework.org/images/3/3f/ExpProblem.pdf 用泛型解决 Expression
    Problem
- https://stackoverflow.com/a/22180495/826907 文中提到的 StackOverflow 回答，角度新奇
- http://www.winestockwebdesign.com/Essays/Lisp_Curse.html 对 Lisp 强大能力带
    来负面影响的吐嘈
- https://en.wikipedia.org/wiki/Expression_problem 维基百科，有许多解决方案的
    论文链接

