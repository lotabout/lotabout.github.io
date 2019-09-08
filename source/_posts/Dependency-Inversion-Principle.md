title: DIP vs IoC vs DI
date: 2018-01-03 09:51:55
tags: [SOLID, Dependency Inversion Principle, Dependency Injection, Inversion of Control]
categories: [Notes]
toc: true
---

你听过 SOLID 原则吗？了解 Spring 的控制反转（IoC）吗？知道依赖注入（Dependency
Injection）和它们有什么区别吗？虽然形式多样，它们的内核却很简单。

## TLDR;

![IoC Principle and patterns](http://www.tutorialsteacher.com/Content/images/ioc/principles-and-patterns.png)

（图片来源： http://www.tutorialsteacher.com/ioc/introduction）

> DI is about wiring, IoC is about direction, and DIP is about shape.

- DIP 是一种思想，它认为上层代码不应该依赖下层的实现，而应该提供接口让下层实现
- IoC 是一种思想，它认为代码本职之外的工作都应该由某个第三方（框架）完成
- DI 是一种技术，将依赖通过“注入”的方式提供给需要的类，是 DIP 和 IoC
    的具体实现

它们的目的都是解耦，使程序更好地模块化，也使各个模块更容易测试。

## 依赖反转原则（Dependency Inversion Principle）

它是 SOLID 原则中的“D”，根据 [维基百科](https://zh.wikipedia.org/wiki/%E4%BE%9D%E8%B5%96%E5%8F%8D%E8%BD%AC%E5%8E%9F%E5%88%99)：

> 在面向对象编程领域中，依赖反转原则（Dependency inversion principle，DIP）是
> 指一种特定的解耦（传统的依赖关系创建在高层次上，而具体的策略设置则应用在低层
> 次的模块上）形式，使得高层次的模块不依赖于低层次的模块的实现细节，依赖关系被
> 颠倒（反转），从而使得低层次模块依赖于高层次模块的需求抽象。

从上面的描述我们可以看它的**目的**是解耦，**手段**是 “高层次的模块不依赖于低层
次的模块的实现细节”。具体有两个原则：

> 1. 高层次的模块不应该依赖于低层次的模块，两者都应该依赖于抽象接口。
> 2. 抽象接口不应该依赖于具体实现。而具体实现则应该依赖于抽象接口。

例如下面的代码中，Service 的实现依赖于 DAO 的具体实现。如图：

{% asset_img DIP-dao-normal.png Dependency of Service %}

上图中， 高层的 `XXXService` 依赖于 DAO 的实现细节，如果 DAO 是对 SQL 数据库进
行操作，那也就决定了 `XXXService` 也只适用于 SQL 数据库，之后如果添加了 NOSQL
数据库，想再复用 `XXXService` 的逻辑就十分困难了。这是耦合的带来的弊端之一。

有 Java 经验的同学肯定会觉得解决方案很简单啊，不要用 `DAO` 类啊，先实现一个
`DAO` 接口，再实现一个实现类不就搞定了嘛。这个习惯似乎已经成了一种铁律，
但没错，DIP 的实践告诉我们 `XXXService` 应该创建一个 `DAO` 接口，而具体的实现类
则负责实现这个接口，如下：

{% asset_img DIP-dao-dip.png DIP of DAO %}

上面这张图有两点要注意的地方：

1. `DAO` 接口是和 `XXXService`（调用方）在同一层而不是和 `SQLDao` （实现方）
   在一层
2. `XXXService` 依赖同一层的接口，在下层的 `SQLDao` 实现了上一层的接口。

因此依赖反转， “反转”的是上下层的依赖，**由上层依赖下层的实现，反转成下层依赖
上层的接口**。

而在实现上也很容易理解：不要在一个类里显示 `new` 另一个类（当然一般来说这个类
是 Service 或 Component，而不是普通的数据类）。

## 控制反转（Inversion of Control）

那么什么是控制反转呢？[这篇文章](http://www.tutorialsteacher.com/ioc/introduction) 讲得很清晰：

> IoC is a design principle which recommends inversion of different kinds of
> controls in object oriented design to achieve loose coupling between the
> application classes. Here, the control means any additional responsibilities
> a class has other than its main responsibility, such as control over the
> flow of an application, control over the dependent object creation and
> binding

IoC 是一个 **设计原则**，它提倡我们反转面向对象设计中的各种控制，以达到各个类
之间的解耦。这里“控制”的含义是除了一个类本职之外的其它所有工作，如整个软件流程
的控制，依赖或绑定的创建等。

IoC 的各种教程里，常说控制反转和“好莱坞原则”一致："Don't call me, I'll call you."

[维基百科的例子](https://en.wikipedia.org/wiki/Inversion_of_control#Overview)
举得很好：

例如写传统的命令行程序，我们需要展示给用户一些菜单，然后根据用户的选择做相应的
操作。于是我们写了一个菜单类，这个菜单类会调用底层的“显示类”来显示菜单内容，
监听并返回用户的选择。

现在如果我们将代码移植到图形界面，对应地就要创建“GUI显示类”，此时需要我们修改
菜单类来适应之种修改。我们只是要修改显示相关的内容却要却个性菜单类，这说明菜单
类与显示类间有耦合。

控制反转认为菜单类的本职工作是提供“菜单”，如何显示，如何处理用户选择等不应该是
它的职责（单一职责原则）。因此，最好有一个框架专门管理整体流程。框架知道有的类
负责显示、有的类负责提供菜单，同时它也知道如何软件的流程，知道什么时候需要调用
菜单类得到菜单，什么时候需要调用显示类做展示。框架定好流程，各个类“填空”就行了
，菜单类提供菜单内容，显示类提供显示逻辑等等。

控制反转是把不属于类的职责抽离出来，让一个专门的“第三方”来做处理这些事。所以它
的外延其实是很广的，我们常说的 IoC 容器只是一个专门的“第三方”用来处理依赖罢
了。

## 依赖注入（Dependency Injection）

在实际使用和讨论中，大家滥用了 IoC 这个词，因此 Martin Fowler 等人在讨论后，
确定使用“依赖注入”(DI)这个词来指代其中一项具体的技术。DI 技术背后的想法是：

1. 为了保证 DIP 原则，一个类应该只依赖抽象接口。
2. 于是具体的实现需要由某种方式“注入”到这个类。
3. 那么依据控制反转的思想，最好是由第三方（容器）来完成。

“注入”又有几种方式：

1. constructor injection ，依赖通过构造函数传入
2. setter injection，依赖通过一个个 setter 传入
3. interface injection，类显示实现一个 setter interface。

对实现细节感兴趣的话可以看 [维基百
科](https://en.wikipedia.org/wiki/Dependency_injection#Three_types_of_dependency_injection)
的例子。

要明白的是依赖注入只是“注入”依赖的其中一种方式（使用最广吧），还有一些其它的方
式，例如“依赖查找”（Dependency Lookup），这里就不深入了。

注意的是依赖注入是只明确 **如何** 将依赖“注入”一个类，而由谁来做并不是 DI 处
理的问题，例如在 Python 等其它语言里，我们依旧可以贯彻 DIP，也可以用
constructor injection，但与 Java 中使用 IoC 容器来管理不同，Python 中大家很少
使用甚至听说 IoC 容器。

## 现实中的应用

这部分是看了陈浩的 [IOC/DIP其实是一种管理思
想](https://coolshell.cn/articles/9949.html) 后想到的。其实计算机中的许多概念
在现实中也是有对应的，按我的理解：

- DIP 相当于“标准化”产品
- IoC 相当于“流水线”化环节

就比如说一家餐厅用的海鲜全是某个供应商供应的，后来由于店面扩大，想换一家更大供
应商，但发现供应商能供应的种类和质量都和之前不同，因此换供应商的同时就要让改菜
单，大厨们对一些食材要特殊处理。可见餐厅和之前的供应商耦合太高。

DIP 告诉我们，餐厅不应该直接依赖某个供应商，而应该规定供应商的标准。要成为自己
的供应商，必须能提供什么种类的食材，食材要达到什么标准，这样即使想换供应商，餐
厅自己也不需要有任何变化。这时餐厅不是依赖于具体的供应商，而是依赖于制定的供应
商标准。

再比如还是这家餐厅，但它是连锁餐厅，尽管不同的供应商都满足了标准，但每家子餐厅
还是自己挑选供应商，而现在总公司决定缩减成本，选择价格更低的供应商，由于每家
子餐厅都是自己选择，要实施这个命令就很困难。

而 IoC 认为餐厅的职责应该是生产食品，而原料的供应、定单的接收乃至食物的配送都
不应该是餐厅（或者应该称为厨房）负责的。于是总公司就专门成立一个管理部门，负责
管理整个流程，它为每个步骤都创建一个具体的部分，统筹规划。采购部分负责选择供应
商，管理部门把得到的原料和定单交给餐厅，餐厅只专注生产。相当于建立了一个流水
线，每一个部分都成了流水线的一个步骤，都专注于自己的职责。另一方面，流水线的管
理也专注于流程的管理。

## 写在最后

最后还是想说所有的设计都是在做 trade-off。例如模块化能使软件更容易变化，模块之
间能替换，但实际生产中，有多少软件会换自己的数据库呢？再比如说 IoC 其实也要看
个度，如果所有的控制流都反转了，那管理起来也会过于复杂。

吐糟下似乎 Java 的开发者都特别喜欢上来先写个接口，然后写一个实现类。写起来不容
易，读起来也费劲，但你要是问起来，大家会说这样有得写单元测试，并且如果需要替换
实现类也会更方便。可是实际上，几乎 95% 以上（随便说的数字，实际中一次都没看见
过）的类都不会有两个或以上的实现，而测试其实也可以通过生成子类之类的方式来做。

因此，我想说学习的时候还是要搞懂它要解决什么问题，有什么好处和缺点，这样才能具
体问题具体分析。世上没有银弹。

## Reference

- [Inversion of Control Containers and the Dependency Injection pattern](https://www.martinfowler.com/articles/injection.html) by Martin Fowler.
- [DIP in the wild](https://martinfowler.com/articles/dipInTheWild.html) by Martin Fowler.
- [IoC Introduction](http://www.tutorialsteacher.com/ioc/introduction) 对各种
  概念简短但精辟的解释。
- [IOC/DIP其实是一种管理思想](https://coolshell.cn/articles/9949.html) 可以认
  为是这些思想在现实世界的体现
- [When is it not appropriate to use the dependency injection pattern?](https://softwareengineering.stackexchange.com/questions/135971/when-is-it-not-appropriate-to-use-the-dependency-injection-pattern)
