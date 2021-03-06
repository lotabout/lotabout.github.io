title: 评：30 多年的编码经验浓缩成的 10 条最佳实践
date: 2017-09-1 09:51:38
tags: [comment, programming, tips]
categories: [Comment]
toc: true
---

文章
[30 多年的编码经验浓缩成的 10 条最佳实
践](https://my.oschina.net/editorial-story/blog/1525762?p=3&temp=1504230510405)
原文出自 [10 Tips for Writting Better
Code](https://cdiggins.github.io/blog/programming-tips.html)。我认为这 10 条
原则挺有帮助，所以本文想对这些原则做一些评价，说说我的看法，可以的话顺便给一些
例子。建议看这篇文章之前先阅读原文。

> 事实上，我们可以将好的代码等同为 **可重用** 的代码

文章里说“可重用”也是文中罗列的 10 条原则的“背后驱动”。那么什么样的设计才是“可
重用”的呢？其实早有大神提出了“高内聚，低耦合”的指标。“高内聚”说的是一个模块作
为一个整体，功能要“专一”；“低耦合”说的是不同模块间的联系尽可能少。之后可以看到
原文提到的 10 条原则很大程序上与之有关。

## 遵循单一职责原则

> 函数是程序员的工具中最重要的抽象形式。它们能更多地被重复使用，你需要编写的代
> 码就越少，代码也因此变得更可靠。较小的函数遵循单一职责原则更有可能被重复使
> 用。

这条原则几乎就是“高内聚”的另一种说法，只不是“高内聚”谈论的是模块，而这里谈论的
是函数。

这里举一个 [StackOverflow 关于高内聚的一个例
子](https://stackoverflow.com/a/10830225/826907)。假设你创建一个类用来将两个数
相加，与此同时，这个类还创建了一个窗口用来显示相加的结果。这个类就是“低内
聚”的。因为做加法和创建窗口这两件事没什么相关性，创建窗口是“显示”的部分，而加
法是“逻辑”的部分。

按照“单一职责”的原则来说的话，这个类的职责是不单一的，因此我们很难去重用这个
类，因为除非我们的需求正好是要做加法，同时要将结果在一个窗口显示，否则这个类并
不能被重用。

换句话说，如果一个函数有多个职责，那只有在使用者同时需要这几个职责的时候，才能
重用这个函数。因此保持函数/类的单一职责，有利于重用。

## 尽量减少共享状态

> 你应该尽量减少函数之间的隐式共享状态，无论它是文件作用域的变量还是对象的成员
> 字段，这有利于明确要求把值作为参数。当能明确地显示函数需要什么才可以产生所需
> 的结果时，代码会变得更容易理解和重用。

> 对此的一个推论是，在一个对象中，相对于成员变量，你更应该优先选择静态的无状态
> 变量 (static stateless variables)。

首先讲讲什么是“共享状态”。这里提了两个：“文件作用域变量”及“对象的成员字
段”。分别举例如下：

```python
g_config = read_configuration('config.ini')
def log(message):
    with open(g_config['log_file'], 'w') as fp:
        fp.write(message)

def update_config(key, value):
    g_config[key] = value
```

这里，`g_config` 变量存在于整个文件里，所以称为“文件作用域变量”。并且 `log` 函数
与 `update_config` 函数之间共享了 `g_config` 这个状态。上面这种写法也可以写成类的
形式：

```python
class Logger:
    def __init__(self, config_file):
        self.g_config = read_configuration(config_file)

    def log(self, message):
        with open(self.g_config['log_file'], 'w') as fp:
            fp.write(message)

    def update_config(self, key, value):
        self.g_config[key] = value
```

这一次，由于 `g_config` 是类的“成员字段”，而 `log` 与 `update_config` 者依赖于这个
变量，所以也称他们共享了这个状态。

**为什么要减少状态共享**？共享状态增加了函数间的“耦合”，可能会引起：

1. 代码不好阅读，因为必须同时理解共享状态的各个函数。
2. 当修改了其中一个函数时，另外的函数的逻辑可能会发生改变，因此代码难以维护。
3. 不利于多线程运行。容易造成竞争。

因此，推荐尽量把函数运行需要的状态通过参数传递给函数，如：

```python
def log(config, message):
    with open(config['log_file'], 'w') as fp:
        fp.write(message)

def update_config(config, key, value):
    config[key] = value
g_config = read_configuration('config.ini')
log(g_config, "error here")
```

至于 `static stateless variables`，`static` 代表它不是“成员变量”， `stateless`
的含义应该等同于 `final` ，也就是说如果要共享状态，最好就用类变量而非成员变
量，同时，变量最好是“不可变的”。

## 将“副作用”局部化

> 理想的副作用（例如：打印到控制台、日志记录、更改全局状态、文件系统操作等）应
> 该被放置到单独的模块中，而不是散布在整个代码里面。函数中的一些“副作用”功能往
> 往违反了单一职责原则。

“副作用(side effect)”是指在某个域（如函数域）里修改了域之外的状态。

1. 副作用一般伴随着状态共享，这种代码非常难理解。
2. 有副作用的代码一般都是“线程不安全”的。

这里不深入这个话题，最好的方法就是尽量减少副作用的代码。感举的话，可以考虑参考
我之前的文章： {% post_link Side-Effects %}

## 优先使用不变的对象

> 如果一个对象的状态在其构造函数中仅被设置一次，并且从不再次更改，则调试会变得
> 更加容易，因为只要构造正确就能保持有效。这也是降低软件项目复杂性的最简单方法
> 之一。

有这样一句话：`Shared Mutable State is the root of evil`，共享的，可变的状态是
万恶之源。为什么，因为共享意味着它们之间是“耦合的”，没法单独分析/工作。可变的
意味着这个共享是会传染的，改变了共享的状态，所有依赖该状态的单元都可能发生变
化。

有一些语言干脆禁止使用可变变量（不准确），如 Haskell, Clojure 等。另一些语言则
试图阻止变量的“共享”，如 Rust。那么在如 C/C++/Java 之类的语言中，虽然语言本身
没有过多的限制，但我们还是应该自己限制自己，减少不必要的麻烦。

## 多用接口少用类

> 接收接口的函数（或 C++ 中的模板参数和概念）比在类上运行的函数更具可重用性。

我认为究其原因，主要是一般定义接口的时候不会指定成员变量，也就是说不会去限制
这些接口（方法）的实现细节，而定义类的时候往往会这么做，这就意味着接口具有更高
的可扩展性，（API 的）用户也更可能去实现某个接口而非继承某个类，因此一个接收接
口的函数更有可能被调用。

另外，java 是不允许多继承的，但可以实现多个接口，如果函数接收的是类，那么意味
着用户的类必须继承我们指定的类，那用户自己就无法构建类的继承结构了。

## 对模块应用良好的原则

> 寻找机会将软件项目分解成更小的模块（例如库和应用程序），以促进模块级别的重
> 用。对于模块，应该遵循的一些关键原则是：

> 1. 尽可能减少依赖
> 2. 每个项目应该有一个明确的职责
> 3. 不要重复自身

这里的原则其实跟上面说的其它原则有一定重复：

- “尽可能减少依赖”。其实就是减少该模块和其它模块的耦合。
- “每个项目应该有一个明确的职责” 则对应着“高内聚”
- “不要重复自身” (don't repeat yourself) 翻译有误，应该指不要自己写重复的代
  码，也就是说重复的代码要写成函数。

## 避免继承

> 在面向对象编程中，继承 —— 特别是和虚拟函数结合使用时，在可重用性方面往往是一
> 条死胡同。我很少有成功的使用或编写重载类的库的经历。

这点可能有人会质疑，但我个人是深信不疑的。在 **实践中** 我们很少能真正写出一个
能重用的类，这里的重用指的是被继承。

归要结底，（我认为）这是面向对象这种方法的缺陷，世上的事物真的能用类继承的方式
良好地表达吗？通常面向对象的教材会举两个例子，一个是“动物”，另一个是“图
形”。“图形”的例子是说各种图形都有“求面积”的方法，正方形可以继续并实现自己
的“面积”算法，“圆形”也相似。因此可以通过继承来表达，“面积”函数就是虚函数，实现
多态。“动物”的例子也类似，例如狗会叫，但不同的狗叫声不同，因此可以继承“狗”类。

有人（找不到出处了）质疑，上面的例子都是良好定义的一些关系，但现实中遇到的问题
真的能良好的表达吗？不可否认面向对象有它适合的领域，如 GUI 的各个组件等。还有
一些问题能用面向对象（继承）但不一定是最佳的方案，例如报表，及不同细节的报表。
另一些问题可能就不太能用面向对象来表达了。

这一点我建议阅读一些其它的讨论：
1. [Does OOP really model the real world](https://softwareengineering.stackexchange.com/questions/137994/does-object-oriented-programming-really-model-the-real-world)
2. [Is OOP hard because it is not natual](https://softwareengineering.stackexchange.com/questions/59387/is-oop-hard-because-it-is-not-natural)

最后，要注意的是“继承”继承的是父类的“数据+方法”，更多的时候我们关心的只是“方
法”的“继承”。

## 将测试作为设计和开发的一部分

> 我不是测试驱动开发的坚定分子，但开始编码时先编写测试代码会使得代码十分自然地
> 遵循许多指导原则。这也有助于尽早发现错误。不过要注意避免编写无用的测试，良好
> 的编码实践意味着更高级别的测试（例如单元测试中的集成测试或特征测试）在揭示缺
> 陷方面更有效。

我的测试经验不是特别丰富，同时我也不是测试驱动开发的坚定分子。

关于“编码之前先写测试”，我认为它最重要的作用是让我们对该函数/类的功能有更清晰
的认识，而不是一开始就把头扎到实现细节中，这点非常用帮助。

“避免编写无用的测试”这点也很重要。测试与开发的矛盾点在于，测试是要保证开发的
功能是没问题的，但开发（函数的内容/作用）是会随着时间变动的。因此测试的粒度是
一个十分重要的问题。目前我也在学习中。

## 优先使用标准库而不是手写的

> 我经常看到更好版本的 std::vector 或 std::string，但这几乎总是浪费时间和精
> 力。一个明显的事实是 —— 你正在为一个新的地方引入 bug，其他开发者也不太可能重
> 用你的代码，因为没有被广泛理解、支持和测试。

`+10086`。去 hack 一个标准库应该永远是你 **最后** 想到的解决方法。你永远无法
想象一个标准库需要经过多少测试，踩过多少坑才能稳定。并且，如果出现 bug，他们的
支持也是十分富贵的，我们的时间永远不够用。

## 避免编写新的代码

> 这是每个程序员都应遵循的最重要的教诲：最好的代码就是还没写的代码。你写的代码
> 越多，你将遇到的问题就越多，查找和修复错误就越困难。

> 在写一行代码之前先问一问自己，有没有一个工具、函数或者库已经实现了你所需要的
> 功能？你真的需要自己实现这个功能，而不是调用一个已经存在的功能吗？

跟上一点有点重复，但我觉得这里有两个要点：

1. 能不写尽量不要自己写。
2. 如果非要写，尽量写得短。

同上一点一样，要写出 bug free 的代码很困难，并且后续维护需要很大的精力。最后
即使是同一个功能，一般代码量小的更好，因为你需要处理（记忆/思考）的量小。

## 总结

所谓的编码原则，不是说非遵守不可，我们要去了解它背后的原理，原因然后因地制宜。
理论上，如果你是一个天才，可以处理无穷的复杂事物，那么原则毫无意义。但对于普通
人而言，如果事件变得越来越复杂，我们的处理能力是下降的，我们状态差的时候更是如
此。

所以，平时遵守一些原则能提高我们在状态差时候的处理能力。

最后，我认为“高内聚，低耦合”的内因实际上是减少我们同时需要处理/理解/记忆的代码
量，以此来提高我们的效率。希望对你有所启发。
