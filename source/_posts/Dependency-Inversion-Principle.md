title: DIP vs IoC vs DI
date: 2018-01-03 09:51:55
tags: [SOLID, Dependency Inversion Principle, Dependency Injection, Inversion of Control]
categories: [Notes]
toc:
---

你听过 SOLID 设计原则吗？你了解 Spring 里的控制反转（IoC）吗？你知道依赖注入
（Dependency Injection）和它们有什么区别吗？虽然它们的形式多样，但内核却是简单
的概念。我们就来看看它们到底是什么。

## TLDR;

![IoC Principle and patterns](http://www.tutorialsteacher.com/Content/images/ioc/principles-and-patterns.png)

（图片来源： http://www.tutorialsteacher.com/ioc/introduction）

- DIP 是一种思想，上层依赖接口而不是下层的具体实现，下层依赖并实现上层的接口。
- IoC 也是一种思想，它认为代码本职之外的所有职责都应该由其它人（框架）完成。
- DI 是一种技术，是 DIP 和 IoC 的一种具体实现模式。

> DI is about wiring, IoC is about direction, and DIP is about shape.

这些思想的背后都是解耦，让程序更好地模块化，同时也使各个模块更容易测试。

## 依赖反转原则（Dependency Inversion Principle）

根据 [维基百科](https://zh.wikipedia.org/wiki/%E4%BE%9D%E8%B5%96%E5%8F%8D%E8%BD%AC%E5%8E%9F%E5%88%99)：

> 在面向对象编程领域中，依赖反转原则（Dependency inversion principle，DIP）是
> 指一种特定的解耦（传统的依赖关系创建在高层次上，而具体的策略设置则应用在低层
> 次的模块上）形式，使得高层次的模块不依赖于低层次的模块的实现细节，依赖关系被
> 颠倒（反转），从而使得低层次模块依赖于高层次模块的需求抽象。

从上面的描述我们可以看它的目的是 *解耦* ，而手段是 “高层次的模块不依赖于低层次
的模块的实现细节”。具体有两个原则：

> 1. 高层次的模块不应该依赖于低层次的模块，两者都应该依赖于抽象接口。
> 2. 抽象接口不应该依赖于具体实现。而具体实现则应该依赖于抽象接口。

这里我要详细说一下到底这个原则是什么含义，因为可以说其它的概念如 IoC, DI 都是
DIP 的具体实现。

例如我们常见的 "DTO / DAO / Service" 这样的代码写作风格里，其实是 Service 的实
现依赖于 DAO 的实现。如图：

{% asset_img DIP-dao-normal.png Dependency of Service %}

从上图可以看到， 高层的 XXXService 依赖于 DAO 的实现细节，如 DAO 是对 SQL 数
据库进行操作，就决定了 XXXService 也只适用到 SQL 数据库，之后如果添加了 NOSQL
数据库，想再复用 XXXService 的逻辑就十分困难了。这是耦合的带来的弊端之一。

有 Java 经验的同学肯定会觉得解决方案很简单啊，不要用 `DAO` 类啊，先实现一个
`DAO` 接口，再实现一个实现类不就搞定了嘛。是的，这个习惯似乎已经成了一种铁律，
但没错，DIP 的实践就是这样：

{% asset_img DIP-dao-dip.png DIP of DAO %}

上面这张图有两点要注意的地方：

1. `DAO` 接口的位置是和 `XXXService` （调用方）在同一层而不是和 `SQLDao` （实
   现方）在一层的，这是大家容易忽略的点。
2. `XXXService` 依赖同一层的接口，在下层的 `SQLDao` 实现了上一层的接口。

所以说依赖反转， *“反转”的就是上下层的依赖，由之前的上层依赖下层的实现，反转成下
层依赖上层的接口*。

## 控制反转（Inversion of Control）

那么什么是控制反转呢？我认为 [这篇文
章](http://www.tutorialsteacher.com/ioc/introduction) 讲得特别清晰：

> IoC is a design principle which recommends inversion of different kinds of
> controls in object oriented design to achieve loose coupling between the
> application classes. Here, the control means any additional responsibilities
> a class has other than its main responsibility, such as control over the
> flow of an application, control over the dependent object creation and
> binding

IoC 是一个 *设计原则*，它提倡我们反转面向对象设计中的各种控制，以达到各个类之
前的解耦合。这里“控制”的含义是除了一个类本职工作之外的其它所有职责，如控制整个
软件的流程，各种依赖、绑定的创建等。

我在学习 IoC 的时候，经常看到的材料里说到“好莱坞原则”：

> Don't call me, I'll call you.

但一般举的和依赖注入相关的例子我认为并不贴切，这里我认为 [维基百
科](https://en.wikipedia.org/wiki/Inversion_of_control#Overview) 的例子更为一
般化：

例如写传统的命令行程序，我们需要展示给用户一些菜单，然后根据用户的选择做相应的
操作，于是我们写了一个菜单类，这个菜单类会调用底层的“显示类”把各种菜单显示，并
监听用户的选择，最终把选择返回。菜单类的本职工作是提供“菜单”，如何显示，用户选
择等本不该是它的职责（单一职责原则），考虑到之后如果我们换成 GUI 来“显示”菜单
时，之前的耦合就会妨碍这种变化。

那么控制反转认为，这些流程的控制应该交给“专业人士”，一般是有一个“框架”，这个框
架对我们要实现的流程十分了解，而我们写的类只要“填空”就可以了。例如菜单类只需要
提供菜单的内容就可以了，而显示或监听用户选择的工作交给框架就可以了。

所以，控制反转认为不是你写代码来控制流程，而是流程来调用你的代码。可以看
到，“控制反转”的外延是很广的，不应该局限于解决依赖上。

上面讲 DIP 的最后，我们看到 `XXXService` 转而依赖接口，那么我们如何把具体的实
现传递给 `XXXService` 呢？当然，如果让 `XXXService` 自己获取，但么又回到耦合的
老路了，因此我们需要让“第三方”来组织提供它所需要的依赖，这也是控制反转的一个具
体实例。

## 依赖注入（Dependency Injection）

依赖注入是在解决依赖问题上，使用控制反转原则的一个实现。了解了它的原则之后，具
体实现理解起来就相对容易了。

由于在实际使用和讨论中，大家滥用 IoC 这个词，因此 Martin Fowler 等人在讨论后确
定使用“依赖注入”这个词来代码其中一项具体的技术。

1. 首先，为了保证 DIP 原则，一个类应该只依赖抽象接口。
2. 于是具体的实现需要由某种方式“注入”到这个类。
3. 那么依据控制反转的思想，最好是由第三方（框架/容器）来完成。

而具体又有几种方式：
1. constructor injection ，依赖通过构造函数传入
2. setter injection，依赖通过一个个 setter 传入
3. interface injection，类显示实现一个 setter interface。

对实现细节感兴趣的话可以看 [维基百
科](https://en.wikipedia.org/wiki/Dependency_injection#Three_types_of_dependency_injection)
的例子。

要注意的是除了依赖注入外，还有一些其它控制反转原则下的其它实现，例如“依赖查
找”（Dependency Lookup），这里就不深入了。

## 现实中的应用
这部分是看了陈浩的 [IOC/DIP其实是一种管理思想](https://coolshell.cn/articles/9949.html) 后想到的。

- DIP 相当于“标准化”产品
- IoC 相当于“流水线”化环节

就比如说一家餐厅用的海鲜全是某个供应商供应的，后来由于店面扩大，想换一家更大供
应商，但发现供应商能供应的种类和质量都和之前不同，因此换供应商的同时就要让改菜
单，大厨们对一些食材要特殊处理。这就是和之前的供应商耦合太高。

那么如何应用 DIP？标准化。餐厅规定要成为自己的供应商，必须能提供什么种类的食
材，食材要达到什么标准，这样换供应商之后，餐厅自己也不需要有任何变化。这时餐厅
不是依赖于具体的供应商，而是依赖于制定的标准。

再比如还是这家餐厅，但是家连锁餐厅，现在每家子餐厅都自己挑选供应商，而现在总公
司决定缩减成本，选择价格更低的供应商，由于每家子餐厅都是自己选择，要实施这个命
令就很困难。而 IoC 认为餐厅的本质是生产，原料就应该由专门的团队来处理，于是有
专门的团队来处理整个流程，比如供应原料，分发定单，配送定单（变成外卖公司了
-_-）。相当于“流水线”化。

## Reference

- [Inversion of Control Containers and the Dependency Injection pattern](https://www.martinfowler.com/articles/injection.html) by Martin Fowler.
- [DIP in the wild](https://martinfowler.com/articles/dipInTheWild.html) by Martin Fowler.
- [IoC Introduction](http://www.tutorialsteacher.com/ioc/introduction) 对各种
  概念简短但精辟的解释。
- [IOC/DIP其实是一种管理思想](https://coolshell.cn/articles/9949.html) 可以认
  为是这些思想在现实世界的体现
- [When is it not appropriate to use the dependency injection pattern?](https://softwareengineering.stackexchange.com/questions/135971/when-is-it-not-appropriate-to-use-the-dependency-injection-pattern)
