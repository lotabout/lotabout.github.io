title: Python Generator
date: 2017-08-29 21:25:35
tags: [python, Generator]
categories: Notes
toc: true
---

Python 中的生成器 (generator) 是一个十分有用的工具，它让我们能方便地生成迭代器
(iterator)。这篇文章里，我们就来说说什么是生成器，生成器有什么作用以及如何使用。

本文需要你对 Python 基本的语法有一定的了解，并知道 iterator 是什么，且我们可以
通过 `next(iterator)` 来获取 `iterator` 的下一个值。

## iterator 简介

想象这样一个需求，我们需要从网上获取一些图片，这些图片的名字的规律是数字递增，
因此我们有类似下面的代码：

```python
def get_images(n):
    result = []
    for i in range(n):
        result.append(get_image_by_id(i))
    return result

images = get_images(n)
```

现在，假设我们需要对图片进行一些操作，但依当前图片的情况不同，我们也许不需要
后续的图片，并且， `get_image_by_id` 是一个很耗时的操作，我们希望在不需要的
情况下尽量避免调用它。

换句话说，我们希望能对 `get_image_by_id` 进行懒执行 (lazy evaluation)。这也不
难，我们可以这么做：

```python
image_id = -1
def next_image():
    global image_id
    image_id += 1
    return get_image_by_id(image_id)

image0 = next_image()
image1 = next_image()
```

这里函数 `next_image` 使用了全局的变量保存当前已获取的图片的 `id`，使用全局变
量决定了 `next_image` 无法被两个个体使用。例如两个人都想从头获取图片，这是没法
完成的，因此我们定义一个类来解决这个问题：

```python
class ImageRepository:
    def __init__(self):
        self.image_id = -1
    def next_image(self):
        self.image_id += 1
        return get_image_by_id(self.image_id)

repo = ImageRepository()
image0 = repo.next_image()
image1 = repo.next_image()
```

如果你熟悉 iterator 的话，应该知道上面这个需求是一个典型的 iterator，因此我们
可以实现 `__iter__` 及 `__next__` 方法来将它变成一个 iterator，从而充分利用
iterator 现成的一些工具：

```python
class ImageRepository:
    def __init__(self):
        self.image_id = -1
    def __iter__(self):
        return self
    def __next__(self):
        self.image_id += 1
        return get_image_by_id(self.image_id)

for image in ImageRepository():
    # some operation on each image
```

是不是也没什么难度？下面我们看看其它的一些思路。

## 从 Iterator 到 Generator

上面的 iterator 的例子有一个特点，就是它需要我们自己去管理 iterator 的状态，即
`image_id`。这种写法跟我们的思维差异较大，因此懒惰的我们希望有一些更好，更方便
的写法，这就是我们要介绍的 genrator 。

在 Python 中，只要一个函数中使用了 `yeild` 这个关键字，就代表这个函数是一个生
成器 (generator)。而 `yield` 的作用就相当于让 Python 帮我们把一个“串行”的逻辑
转换成 iterator 的形式。例如，上面的例子用 generator 的语法写就变成了：

```python
def image_repository()
    image_id = -1
    while True:
        image_id += 1
        yield get_image_by_id(image_id)

for image in image_repository():
    # do some operation
```

首先，就写法上，这种写法与我们最先开始的循环写法最为类似；其次，在功能上，调用
这个函数 `image_repository()` 返回的是一个 generator object，它实现了 iterator 的方
法，因此可以将它作为普通的 iterator 使用 （`for ... in ...`）；最后，注意到我
们所要做的，就是把平时使用的 `return` 换成 `yield` 就可以了。

再举个例子：

```python
def fibonacci():
    a, b = (0, 1)
    while True:
        yield a
        a, b = b, a+b

fibos = fibonacci()
next(fibos) #=> 0
next(fibos) #=> 1
next(fibos) #=> 1
next(fibos) #=> 2
```

通过 generator ，我们很轻松地就写出了一个无限的斐波那契数列函数。如果要手写的
话，它相当于：

```python
class Fibonacci():
    def __init__(self):
        self.a, self.b = (0, 1)
    def __iter__(self):
        return self
    def __next__(self):
        result = self.a
        self.a, self.b = self.b, self.a + self.b
        return result

fibos = Fibonacci()
next(fibos) #=> 0
next(fibos) #=> 1
next(fibos) #=> 1
next(fibos) #=> 2
```

显然 generator 的写法更为清晰，且符合我们平时书写顺序结构的习惯。

## Generator 与控制流

前面我们提到，Generator 的作用其实是实现了懒执行 (lazy evaluation) ，即在真正
需要某个值的时候才真正去计算这个值。因此，更进一步，Generator 其实是返回了控制
流。当一个 generator 执行到 yeild 语句时，它便保存当前的状态，返回所给的结果
（也可以没有），并将当前的执行流还给调用它的函数，而当再次调用它时，Generator
就从上次 yield 的位置继续执行。例如：

```python
def generator():
    print('before')
    yield            # break 1
    print('middle')
    yield            # break 2
    print('after')

x = generator()
next(x)
#=> before
next(x)
#=> middle
next(x)
#=> after
#=> exception StopIteration
```

可以看到，第一次调用 `next(x)`，程序执行到了 `break 1` 处就返回了，第二次调用
`next(x)` 时从之前 yield 的位置（即 `break 1`） 处继续执行。同理，第三次调用
`next(x)` 时从 `break 2` 恢复执行，最终退出函数时，抛出 `StopIteration` 异常，
代表 `generator` 已经退出。

为什么要提到 generator 的“控制流”的特点呢？因为 genrator 表允许我们从“顺序”执
行流中暂时退出，利用这个特性我们能做一些很有意义的事。

例如，我们提供一个 API，它要求调用者首先调用 `call_this_first` 然后做一些操
作，然后再调用 `call_this_second`，再做一些操作，最后调用 `call_this_last`。也
就是说这些 API 的调用是有顺序的。但 API 的提供者并没有办法强制使用者按我们所说
的顺序去调用这几个 API。但有了 generator，我们可以用另一种形式提供 API，如下：

```python
class API:
    def call_this_first():
        pass

    def call_this_second():
        pass

    def call_this_last():
        pass

def api():
    first()
    yield
    second()
    yield
    last()
```

通过这种方式提供的 API 能有效防止使用者的误用。这也是 generator 能 “从控制流中
返回” 这个特性的一个应用。

## yield 加强版

上面我们说到 Generator 允许我们暂停控制流，并返回一些数据，之后能从暂停的位置
恢复。那我们就会有疑问，既然暂停控制流时能返回数据，那恢复控制流的时候能不能
传递数据到暂停的位置呢？ [PEP 342](https://www.python.org/dev/peps/pep-0342)
中就加入了相关的支持。这个需求说起来比较抽象，我们举个例子：

想象我们要写一个函数，计算多个数的平均值，我们称它为 `averager`。我们希望每次
调用都提供一个新的数，并返回至今为止所有提供的数的平均值。让我们先来看看用
generator 的加强版语法怎么实现：

```python
def averager():
    sum = 0
    num = 0
    while True:
        sum += (yield sum / num if num > 0 else 0)
        num += 1

x = averager()
x.send(None)
#=> 0
x.send(1)
#=> 1.0
x.send(2)
#=> 1.5
x.send(3)
#=> 2.0
```

这个加强版的语法是这么工作的： yield 之前是语句，现在是表达式，是表达式就意味
着我们能这么写 `x = yield 10`, `y = 10 + (yield)`, `foo(yield 42)`。Python 规
定，除非 yield 左边直接跟着等号（不准确），否则必须用扩号括起来。

当 Python 执行到 yield 表达式时，它首先计算 yield 右边的表达式，上例中即为
`sum / num if num > 0 else 0` 的值，暂停当前的控制流，并返回。之后，除了可以用
`next(generator)` 的方式（即 iterator  的方式）来恢复控制流之外，还可以通过
`generator.send(some_value)` 来传递一些值。例如上例中，如果我们调用
`x.send(3)` 则 Python 恢复控制流， `(yield sum/sum ...)` 的值则为我们赋予的
`3`，并接着执行 `sum += 3` 以及之后的语句。注意的是，如果这时我们用的是
`next(generator)` 则它等价为 `generator.send(None)`。

最后要注意的是，刚调用 generator 生成 generator object 时，函数并没有真正运
行，也就是说这时控制流并不在 `yield` 表达式上等待用户传递值，因此我们需要先调
用 `generate.send(None)` 或 `next(generator)` 来触发最开始的执行。

那么说到这里，用 generator 来实现这个需求明显没有其它方法好用，例如：

```python
class Averager:
    def __init__(self):
        self.sum = 0
        self.num = 0
    def avg_num(self, n):
        self.sum += n
        self.num += 1
        return self.sum / self.num
averager = Averager()
averager.avg_num(1)
#=> 1.0
averager.avg_num(2)
#=> 1.5
averager.avg_num(3)
#=> 2.0
```

这种写法比 generator 更直观，并且用户调用起来也方便，不需要额外调用一次
`x.send(None)`。显然 generator 的加强版语法并不是为了专门用来解决我们这里提到
的需求的。它要解决的真正问题是支持协程 (coroutine) 来实现异步编程的。由于这个
问题比较复杂，这里就不深入讨论了。

## yield from

考虑我们有多个 generator 并想把 generator 组合起来，如：

```python
def odds(n):
    for i in range(n):
        if i % 2 == 1:
            yield i

def evens(n):
    for i in range(n):
        if i % 2 == 0:
            yield i

def odd_even(n):
    for x in odds(n):
        yield x
    for x in evens(n):
        yield x

for x in odd_even(6):
    print(x)
#=> 1, 3, 5, 0, 2, 4
```

`for x in generator(): yield x` 这种写法不太方便，因此 [PEP
380](https://www.python.org/dev/peps/pep-0380/) 引入了 `yield from` 语法，来
替代我们前面说的这种语法，因此上面的例子可以改成：

```python
def odd_even(n):
    yield from odds(n)
    yield from evens(n)
```

是不是清晰许多？


## 小结

我们简单介绍了 iterator ；之后介绍了使用 generator 来更方便地生成 iterator；
之后举例说明了 yield 的加强版语法，最后介绍了 yield from 语法。


1. 当一个函数里使用了 yield 关键字，则该函数就被称为一个 generator （生成
   器）。
2. Generator 被调用时返回 Generator Object，它实现了 iterator 的接口。所以可以
   认为 generator 调用后返回了一个 iterator。
3. yeild 可以从控制流中暂时退出，之后可以从退出的位置恢复。通过加强版的语法还
   能在恢复时传递一些值给 generator。
4. yield from 语法可以用来方便地组合不同的 generator。

Generator 是生成 iterator 非常方便的工具，希望本文能让你对 generator 有更好的
了解，也希望 Generator 能给你今后的 Python 生涯带来更多的方便。
