title: Python 元类 (MetaClass) 小教程
date: 2018-04-06 15:43:59
tags: [python, meta-programming]
categories: Knowledge
toc: true
---

可能是 Ruby 带的头，大家喜欢把“元编程”称作魔法，其实哪有什么魔法，一切都是科学
。而 meta classes 就是 Python 里最魔法的科学，也是 99% 的人用不到的科学。只是
谁还不想学点魔法呢？

（本文使用的语法仅在 Python 3 下有效）

## 爷爷 = 元爸爸

> Meta is a prefix used in English to indicate a concept which is an
> abstraction behind another concept, used to complete or add to the latter.

根据[维基百科](https://en.wikipedia.org/wiki/Meta)，英语前缀 `meta-` 指对一
种抽象概念的抽象，得到另一种概念。比如说编程 programming 一般指编写代码来读取
、生成或转换**数据**。那么元编程 `meta-programming` 一般就指人编写代码来读取、
生成或转换**代码**。

听着很玄幻，但 meta 让我想到了一首儿歌，有句歌词：“爸爸的爸爸叫什么？爸爸的爸
爸叫爷爷”，现在有了 `meta-`，我们可以把爷爷叫作 `meta-爸爸`（元爸爸）了。

我们知道 Python 里一切都是对象，那么是对象就有对应的“类(Class)”，或称“类型(type)”。
Python 中可以用 `type(obj)` 来得到对象的“类”：

```python
type(10)
#> int
type([1,2,3])
#> list
type({'a': 1, 'b': 2})
#> dict

class DoNothing:
    pass
x = DoNothing()
type(x)
#> __main__.DoNothing
```

既然一切都是对象，一个“类(class)”也可以认为是一个对象，那么类的“类型(type)”是
什么呢？

```python
type(int), type(list), type(dict)
#> (type, type, type)

type(DoNothing)
#> type
```

可以看到，“类(class)”的类型(type) 都是 `type`。那 `type` 的类型又是什么呢？

```python
type(type)
#> type
```

抱歉，`type` 的类型还是 `type`，是一个递归的类型。

对象的类型叫作类(class)，**类的类型就称作元类 `meta-class`**。是不是很像“爸爸的爸
爸叫爷爷”？换句话说，“普通类(class)”可以用来生成实例(instance)，同样的，元类
(meta-class)也可以生成实例，生成的实例就是“普通类”了。

## 类是动态创建的

我们知道，类(class)可以有多个实例(instance)。而创建实例的方法就是调用类的构造
函数(constructor)：

```python
class Spam(object):
    def __init__(self, name):

        self.name = name

spam = Spam('name')
```

上例我们定义了一个类，并调用类的构造函数创建了该类的一个实例。我们知道类也可以
看作类 `type` 的一个实例，那么如何用 `type` 的构造函数来动态创建一个类呢？我们
先看看 [type 的构造函数](https://docs.python.org/3.6/library/functions.html#type)：

type(name, bases, dict):
- `name`: 字符串类型，存放新类的名字
- `bases`: 元组(tuple)类型，指定类的基类/父类
- `dict`: 字典类型，存放该类的所有属性(attributes)和方法(method)

例如下面的类：

```python
class Base:
    counter = 10

class Derived(Base):
    def get_counter(self):
        return self.counter

x = Derived()
x.get_counter()
#> 10
```

我们可以调用 `type(...)` 来动态创建这两个类：

```python
Base = type('Base', (), {'counter': 10})
Derived = type('Derived', (Base,), dict(get_counter=lambda self: self.counter))

x = Derived()
x.get_counter()
#> 10
```

是的，你没有猜错，Python 在遇到 `class ...` 关键字时会一步步解析类的内容，最终
调用 `type(...)` （准确说是指定的元类）的构造函数来创建类，换句话说上面两种定
义类的方式是等价的。在下节我们会具体讲解。


## 类的创建过程

要了解元类(meta-class)的作用，我们就需要了解 Python 里[类的创建过程
](https://docs.python.org/3/reference/datamodel.html#metaclasses)，如下：

{% asset_img class-creation.svg Class Creation Step in Python %}

1. 当 Python 见到 `class` 关键字时，会首先解析 `class ...` 中的内容。例如解析
   基类信息，最重要的是找到对应的元类信息（默认是 `type`)。
2. 元类找到后，Python 需要准备 namespace （也可以认为是上节中 `type` 的 `dict`
   参数）。如果元类实现了 `__prepare__` 函数，则会调用它来得到默认的 namespace
   。
3. 之后是调用 `exec` 来执行类的 body，包括属性和方法的定义，最后这些定义会被保
   存进 namespace。
4. 上述步骤结束后，就得到了创建类需要的所有信息，这时 Python 会调用元类的
   构造函数来真正创建类。

如果你想在类的创建过程中做一些定制(customization)的话，创建过程中任何用到了元
类的地方，我们都能通过覆盖元类的默认方法来实现定制。这也是元类“无所不能”的所在
，它深深地嵌入了类的创建过程。

## 元类的应用

{% blockquote Python界的领袖 Tim Peters %}
元类就是深度的魔法，99%的用户应该根本不必为此操心。如果你想搞清楚究竟是否需要
用到元类，那么你就不需要它。那些实际用到元类的人都非常清楚地知道他们需要做什么
，而且根本不需要解释为什么要用元类。
{% endblockquote %}

为了文章的完整性，以及日后查阅方便，这里还是要举两个例子的。顺带一提，下面这两
个例子在 Python 3.6 之后都可以通过覆盖基类的
[\_\_init_subclass\_\_](https://docs.python.org/3/reference/datamodel.html#object.__init_subclass__)
来实现，而不需要通过元类实现。


### 强制子类实现特定方法

假设你是一个库的作者，例如下面的代码，其中的方法 `foo` 要求子类实现方法 `bar`
：

```python
# library code
class Base(object):
    def foo(self):
        return self.bar()

# user code
class Derived(Base):
    def bar():
        return None
```


但作为库的作者，我们根本无法预测用户会写出什么样的代码，有什么方法能强制用户在
子类中实现方法 `bar` 呢？用 meta-class 可以做到。

```python
class Meta(type):
    def __new__(cls, name, bases, namespace, **kwargs):
        if name != 'Base' and 'bar' not in namespace:
            raise TypeError('bad user class')
        return super().__new__(cls, name, bases, namespace, **kwargs)

class Base(object, metaclass=Meta):
    def foo(self):
        return self.bar()
```

现在，我们尝试定义一个不包含 `bar` 方法的子类，在类的定义（或者说生成）阶段就
会报错：

```
>>> class Derived(Base):
...     pass
...
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "<stdin>", line 4, in __new__
TypeError: bad user class
```

### 注册所有子类

有时我们会希望获取继承了某个类的子类，例如，实现了基类 `Fruit`，想知道都有哪些
子类继承了它，用元类就能实现这个功能：

```python
class Meta(type):
    def __init__(cls, name, bases, namespace, **kwargs):
        super().__init__(name, bases, namespace, **kwargs)
        if not hasattr(cls, 'registory'):
            # this is the base class
            cls.registory = {}
        else:
            # this is the subclass
            cls.registory[name.lower()] = cls

class Fruit(object, metaclass=Meta):
    pass

class Apple(Fruit):
    pass

class Orange(Fruit):
    pass
```

之后，我们可以查看所有 `Fruit` 的子类：

```
>>> Fruit.registory
{'apple': <class '__main__.Apple'>, 'orange': <class '__main__.Orange'>}
```

### new vs init

上面的例子中我们分别用了 `__new__` 和 `__init__`，但其实这两个例子里用哪种方法
都是可行的。

`__new__` 用来创建一个（未初始化）实例；`__init__` 则是用来初始化一个实例。在
元类的 `__new__` 方法中，因为类实例还没有创建，所以可以更改最后生成类的各项属
性：诸如名称，基类或属性，方法等。而在 `__init__` 中由于类已经创建完成，所以无
法改变。正常情况下不需要关心它们的区别。

## 小结

- 对象的类型称为类，类的类就称为元类。
- Python 中对元类实例化的结果就是“普通类”，这个过程是动态的。
- 在定义类时可以指定元类来改变类的创建过程。

请你相信，作为平民百姓，咱们是没有机会用到魔法的。但学习本身对于了解语言的设计
是很有帮助的，何况万一有个万一呢◔_◔？

## 参考

- [A Primer on Python Metaclasses](https://jakevdp.github.io/blog/2012/12/01/a-primer-on-python-metaclasses/) 一步步教你理解 meta class
- [Understanding Python metaclasses](https://blog.ionelmc.ro/2015/02/09/understanding-python-metaclasses/) 对 Python 中的 attribute lookup 有清晰的讲解
- [Python 3 Metaprogramming](https://www.youtube.com/watch?v=sPiWg5jSoZI) 3 小
    时的视频，风趣幽默地对讲解了 Python 元编程的各个方面。

