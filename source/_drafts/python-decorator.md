title: Python Decorator 小结
tags: [python, decorator]
categories: Knowledge
---

decorator 翻译为：描述器/装饰器/修饰器等。python 中的 decorator 本质上是可调用
的对象，即函数或带有 `__call__` 方法的对象。它的作用是改变现有函数的行为。

本文就谈谈 python 中 decorator 的基础知识与基本应用。

<!--more-->

<!--最早知道描述器一词是在面试时被问到，当场悲剧。之后回来恶补知道个大概，后来看-->
<!--设计模式时对照起来，了解了一些基本原理。最近看一些 python 源代码时再次遇到，而-->
<!--网上的一些资料为了照顾新手，没有单刀直入。之后看了 [PEP-->
<!--0138](https://www.python.org/dev/peps/pep-0318/) 决定做个总结。-->

## decorator 的动机

我们来说说 decorator 的心路历程：有一个函数，用于播放给定的视频：

```python
def play(url):
    print('playing: ', url)
```

现在我们希望给这个播放器添加水印，即每次播放前都输出公司的名字。直接的
想法就是修改原函数，加上水印，但由于某些原因（自己找点借口）我们不能修改它。因
此我们新建了一个函数：

```python
def watermark_play(url):
    print('company name')
    play(url)
play = watermark_play
```

上面的方法在扩展性上还不够好，因为如果我们想换水印的内容，就需要直接修改
`watermark_play` 中的代码，所以我们机智地想出下面的方法：

```python
def add_watermark(play, company_name):
    def watermark_play(*args):
        print(company_name)
        play(*args)
    return watermark_play

play = add_watermark(play, 'company name')
```

这样我们只要修改调用 `add_watermark` 的参数即可。如果你心里更 geek 的话，可能
还会想出下面的方法：

```python
def watermark_generator(company_name):
    def add_watermark(play):
        def watermark_play(*args):
            print(company_name)
            play(*args)
        return watermark_play
    return add_watermark

add_watermark_youku = watermark_generator('youku')
play_avi = add_watermark_youku(play_avi)
play_mp4 = add_watermark_youku(play_mp4)

play_tudou = watermark_generator('tudou')(play_tudou)
```

上面代码的好处是可以重用生成 `add_watermark_youku`，并且把加水印的过程分成了
两步：

1. 决定水印的内容，生成一个包裹函数
2. 用包裹函数包裹播放函数

这样做的好处是解耦合，让两部分的关联性降低，利于维护。

好吧，我们说了这么多，说的其实是 “decorator pattern”（装饰器模式）的思想。

> 通过使用修饰模式，可以在运行时扩充一个类的功能。原理是：增加一个修饰类包裹原
> 来的类，包裹的方式一般是通过在将原来的对象作为修饰类的构造函数的参数。装饰类实
> 现新的功能，但是，在不需要用到新功能的地方，它可以直接调用原来的类中的方法。修
> 饰类必须和原来的类有相同的接口。

简单地说是我们先有了一个对象 O，之后想为 O 添加一些额外的功能。例如 O 是一个窗
口，我们想为它添加滚动条。一种方法是直接将功能添加到对应的类上，但这样会使原来
的类变得臃肿，因为即使一个窗口不需要滚动条，它也包含了滚动相关的代码。

因此一个更好的方法是创建一个修饰类，以该窗口对象为输入，输出一个新的包裹后的
对象。以此类推，不断地包裹对象以添加新的功能。

但是！我们可以看到：上面的代码太繁琐，python 中的 decorator 最先就是为了解决这
个问题的。

## 描述器的语法

### 带参数的描述器
### 带参数的函数

## 更多例子

## 注意事项

## 拓展阅读
