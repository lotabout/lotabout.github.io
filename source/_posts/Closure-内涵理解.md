title: Closure 内涵理解
date: 2015-11-15 00:52:33
tags: [closure, python]
categories: Knowledge
toc: true
---

> 某人学习了许久的闭包，认为自己已掌握了其中的精髓，于是问禅师：
>  “禅师，闭包真心强大，相比对象：我觉得对象只能算是穷人的闭包！”
> 禅师微微摇头，并不说话。这人怎么也想不通，只得回去苦心钻研。
> 许久之后，这人再次找到禅师：
>  “原来闭包只是穷人的对象”
> 只见禅师轻轻一笑，点了点头。

闭包（closure）的概念，常出现在函数式编程的概念中。当今许多动态语言都包含了闭
包的概念，如 python、Javascrip、Lisp 等。甚至静态语言（如 rust）也开始支持。那
么这个神奇的闭包究竟是什么？又为什么会受到大家的热爱呢？本文将从闭包（closure）与对象（Object）的关系入手，通过实例来分析闭包背后的内涵。

<!--more-->

## 状态管理

根本上，闭包与对象都是状态管理（state management）的一种形式。

什么是状态？又为什么需要对其进行管理呢？这里不说大道理，我们且看一例。

考虑编写这样一段程序，每次调用它都会增加 1 。我们需要它来自动生成 ID，使得生成
的 ID 与现有的都不同。一段很简单的代码如下：

```c
#include <stdio.h>

int current_id = 0;
int next_id()
{
    current_id += 1;
    return current_id;
}

int main(int argc, char *argv[])
{
    printf("%d\n", next_id());  // => 1
    printf("%d\n", next_id());  // => 2
    printf("%d\n", next_id());  // => 3
    return 0;
}
```

上面的程序用一个全局变量 `current_id` 来保存状态，即当前的 ID 号，并没有用到
任何的闭包或是对象的概念。这是因为此时状态少、简单，所以不需要复杂的概念也可以
容易地进行管理。

上面的程序用 C 语言写是为了明确我们并不涉及闭包或是对象（面向对象）的概念，其
中的逻辑用 python 重写如下，后面的文章主要用 python 完成。

```python
current_id = 0
def next_id():
    global current_id
    current_id += 1
    return current_id

next_id() # => 1
next_id() # => 2
next_id() # => 3
```

现在有了新的需求，我们需要多个 ID 生成器，用于生成不同的 ID，相互之间要求互不
干扰，我们依旧可以用类似上述的方法来实现，只是现在我们额外需要一个“ID 生成器”的生
成器。下面是一个尝试（代码不看也罢，没什么意义）：

```python
cached_id = {0:0}

def next_id(generator_id):
    global cached_id
    cached_id[generator_id] += 1
    return cached_id[generator_id]

def generate_generator():
    global cached_id
    generator_id = next_id(0)
    cached_id[generator_id] = 0
    return generator_id

generator_1 = generate_generator()
generator_2 = generate_generator()

next_id(generator_1) # => 1
next_id(generator_1) # => 2

next_id(generator_2) # => 1
next_id(generator_2) # => 2
```

第一个例子中，状态通过全局的 `current_id` 保存，第二个例子通过 `cached_id` 字
典保存。随着这样的需求增长，管理这样的状态将更加困难。

另外一点这些状态只能是全局的（即无法保存在函数内部）。这对于维护大量的状态十分
困难。

下面我们就来看看闭包与对象是如何处理状态的管理的。

## 对象：状态与操作的包裹

回顾第一节的例子，我们注意到程序涉及两个内容： **程序的状态** 与 **状态的操作
** 。第一节的例子中，`current_id` 是状态，而 `next_id` 则是对状态的操作。

更通俗地说，程序涉及 **变量** 与 **函数**。

面象对象，就是试图将二者包裹在一起。在 C 语言中，`struct` 提供了将变量包裹在一
起的方法，而 C++ 中进一步将函数包裹其中，从而形成了我们熟知的 **类**。即通过将
需要管理的状态与将对状态进行处理的操作包裹在一起来对状态进行管理。

于是，我们可以通过“类”来实现第一节中的例子：

```python
class IDGenerator(object):
    def __init__(self):
        self.current_id = 0

    def next_id(self):
        self.current_id += 1
        return self.current_id

generator_1 = IDGenerator()
generator_2 = IDGenerator()

generator_1.next_id() # => 1
generator_1.next_id() # => 2

generator_2.next_id() # => 1
generator_2.next_id() # => 2
```

可以看到，通过类来对状态与操作进行包裹，可以让代码变得特别简洁。当系统变大时更
是如此，我想，这也是近几十年编程语言几乎是面向对象的原因之一吧。

## 闭包：放入状态的操作

标题中依旧使用‘状态’与‘操作’的术语，但我们依旧可以理解为‘变量’与‘函数’。

闭包不容易理解，也不容易讲解。主要是因为它的概念不如面向对象清晰。这里强调理解
闭包的几个要点：

1. 闭包的本意是一种手段，用于通过 [头等函
   数](https://zh.wikipedia.org/wiki/%E5%A4%B4%E7%AD%89%E5%87%BD%E6%95%B0)
   （first class function）实现静态作用域（ [lexical
   scope](https://en.wikipedia.org/wiki/Scope_%28computer_science%29#Lexical_scoping) ）。
   但一般指的是与函数绑定的那个作用域。当然，一般说返回闭包，在代码上看是返回
   了一个函数，只是该函数绑定了某个作用域，因此也统称为返回闭包。
2. 一般而言（目前没见过反例），闭包要求函数是头等的。即函数可以作为别的函数的
   参数，函数的返回值，赋值组变量或存储在数据结构中。除了我们常见的动态语
   言如 python 外，C 语言其实也支持头等函数，通过函数指针。

因此理解闭包的关键在于了解这样的事实：闭包的关键在于为函数绑定作用域，也就
是“将状态放入操作”。而头等函数的作用在于我们可以为同一个操作绑定不同的作用域，
从而将它们赋值给不同的变量。

道理可以事后懂，我们先看看例子：即用闭包实现第一节中的例子。

```python
# use python 3
def generate_generator():
    current_id = 0
    def next_id():
        nonlocal current_id
        current_id += 1
        return current_id
    return next_id

generator_1 = generate_generator()
generator_2 = generate_generator()

generator_1()
generator_1()
generator_2()
generator_2()
```

上述例子需要 python 3 运行，因为用到了 `nolocal` 关键字。

上例中，`generate_generator` 返回了函数 `next_id`，而 `next_id` 虽然代码相同，
但它访问了外部（`generate_generator` 内）的变量 `current_id`，python 会为它创
建并绑定额外的作用域，因此当 `next_id` 返回并赋值给了 `generator_1` 时，它依旧
可以访问 **自己的** `current_id`。

也就是，每次 `generate_generator` 被调用时，它都会创建一个新的作用域，其中包含
了 `current_id`。`generate_generator`将该作用域与 `next_id` 绑定在一起返回。这
就是我们通常所说的闭包。

通过解释闭包，我们也看到，它与对象相同之处在于同样包含了状态和操作。不同之处是
对于对象，从外部看，状态和操作都不见了，看到的是一个新的物体，称为对象；而对于
闭包，从外部看，它就是一个头等函数，状态被隐藏到了操作中。

对象看着是对象，闭包看着像函数。

## 禅师之惑

文章开头引用的禅师的故事是很早之前看到的，现在已经找不到出处了。当时没有多想，
现在也无法真正地理解，这是 [Stackoverflow 上的一个解
答](http://stackoverflow.com/questions/2497801/closures-are-poor-mans-objects-and-vice-versa-what-does-this-mean)。
这里说说我自己的看法。

从上面的讨论中我们应该可以看出，对象与闭包并无根本的区别。它们都是对状态的管
理，只是使用的方法不同。

我理解提问者的看法“对象是穷人的闭包”，因为闭包提供的绑定作用域的功能是很强大
的，配合上头等函数可以实现很多的功能。例如，通过闭包可以实现面向对象的很多功
能。而面向对象通常是语言本身提供的支持，没有语言支持的话实现不了闭包。因此提问
者认为 `对象 < 闭包`。

而禅师认为的 `对象 > 闭包`。我的理解是，这里的对象是广义的对象，就是状态与操作
的总称，因此闭包只是实现它的一种方式，所以才说“闭包是穷人的对象”。

## 后记

文章里用 python 是因为它同时支持对象和闭包，但个人认为 python 对闭包的支持并不
好，所以本来是想用 Javscript 写的，只是它并没有类的功能，没法做对比。

另，真的不要纠结于工具，用它们解决问题才是最关键的。
