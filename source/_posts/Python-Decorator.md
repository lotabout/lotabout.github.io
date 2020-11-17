title: Python Decorator(装饰器)
date: 2017-09-29 09:23:41
tags: [python, decorator]
categories:
toc: true
---

今天来说说 Python 里的装饰器 (decorator)。它不难，但却几乎是 “精通” Python 的
路上的第一道关卡。让我们来看看它到底是什么东西，为什么我们需要它。

## 手写装饰器

现在我们要写一个函数：

```python
def add(x, y=10):
    return x + y
```

然后我们想看看运行的结果，于是写了几个 print 语句：

```python
print("add(10)",       add(10))
print("add(20, 30)",   add(20, 30))
print("add('a', 'b')", add('a', 'b'))

# Results:
# add(10) 20
# add(20, 30) 50
# add('a', 'b') ab
```

现在我们想看看测试这个函数的性能，于是我们加上这个代码：

```python
from time import time

before = time()
print("add(10)",       add(10))
after = time()
print("time taken: {}".format(after - before))

before = time()
print("add(20, 30)",   add(20, 30))
after = time()
print("time taken: {}".format(after - before))

before = time()
print("add('a', 'b')", add('a', 'b'))
after = time()
print("time taken: {}".format(after - before))

# Results
# add(10) 20
# time taken: 0.00017189979553222656
# add(20, 30) 50
# time taken: 9.751319885253906e-05
# add('a', 'b') ab
# time taken: 0.00012969970703125
```

代码马上变得很复杂。但最重要的是，我们得写一堆代码（复制粘贴），程序员是懒惰
的，所以我们就想到一些更简单的方法，与其写这么多次，我们可以只写一次代码：

```python
from time import time
def add(x, y=10):
    before = time()
    result = x + y
    after = time()
    print('elapsed: ', after - before)
    return result

print("add(10)",       add(10))
print("add(20, 30)",   add(20, 30))
print("add('a', 'b')", add('a', 'b'))

# Results
# elapsed:  1.9073486328125e-06
# add(10) 20
# elapsed:  9.5367431640625e-07
# add(20, 30) 50
# elapsed:  1.9073486328125e-06
# add('a', 'b') ab
```

不论是代码的修改量还是代码的美观程度，都比之前的版本要好！

但是，现在我们写了另一个函数：

```python
def sub(x, y=10):
    return x - y
```

我们必须再为 `sub` 函数加上和 `add` 相同的性能测试代码：

```python
def sub(x, y=10):
    before = time()
    result = x - y
    after = time()
    print('elapsed: ', after - before)
    return result
```

作为一个懒惰的程序员，我们立马就发现了，有一个 “模式” 反复出现，即执行一个函
数，并计算这个函数的执行时间。于是我们就可以把这个模式抽象出来，用函数：

```python
from time import time

def timer(func, x, y = 10):
    before = time()
    result = func(x, y)
    after = time()
    print("elapsed: ", after - before)
    return result

def add(x, y = 10):
    return x + y

def sub(x, y = 10):
    return x - y

print("add(10)", timer(add, 10))
print("add(20, 30)", timer(add, 20, 30))
```

但这样还是很麻烦，因为我们得改到所有的测试用例，把 `add(20, 30)` 改成
`timer(add, 20, 30)`。于是我们进一步改进，让 timer 返回函数：

```python
def timer(func):
    def wraper(x, y=10):
        before = time()
        result = func(x, y)
        after = time()
        print("elapsed: ", after - before)
        return result
    return wraper

def add(x, y = 10):
    return x + y
add = timer(add)

def sub(x, y = 10):
    return x - y
sub = timer(sub)

print("add(10)",       add(10))
print("add(20, 30)",   add(20, 30))
```

这里的最后一个问题是，我们的 timer 包装的函数可能有不同的参数，于是我们可以进
一步用 `*args, **kwargs` 来传递参数：

```python
def timer(func):
    def wraper(*args, **kwargs):
        before = time()
        result = func(*args, **kwargs)
        after = time()
        print("elapsed: ", after - before)
        return result
    return wraper
```

这里的 `timer` 函数就是一个 “装饰器”，它接受一个函数，并返回一个新的函数。在
装饰器的内部，对原函数进行了“包装”。

注：上面的例子取自 [What Does it Take to Be an Expert At Python](https://youtu.be/7lmCu8wz8ro?t=45m25s)。

## @ 语法糖

上一节是一个懒惰的程序员用原生的 Python 写的装饰器，但在装饰器的使用上，用的是
这个代码：

```python
def add(x, y = 10):
    return x + y
add = timer(add)        # <- notice this

def sub(x, y = 10):
    return x - y
sub = timer(sub)
```

上面这个语句里，我们把 `add` 的名字重复了 3 次，如果函数改了名字，我们就得改 3
处。懒惰的程序员就想了一个更“好”的方法，提供了一个语法来替换上面的内容：

```python
@timer
def add(x, y=10):
    return x + y
```

这就是我们最常见的装饰器的形式了，这两种写法完全等价，只是 `@` 写法更简洁一
些。

## 带参数的装饰器

我们知道下面两种代码是等价的：

```python
@dec
def func(...):
    ...

func = dec(func)
```

我们可以把它当成是纯文本的替换，于是可以是这样的：

```python
@dec(arg)
def func(...):
    ...

func = dec(arg)(func)
```

这也就是我们看到的“带参数”的装饰器。可见，只要 `dec(arg)` 的返回值满足 “装饰
器” 的定义即可。（接受一个函数，并返回一个新的函数）

这里举一个例子（[来源](https://foofish.net/python-decorator.html)）：

```python
def use_logging(level):
    def decorator(func):
        def wrapper(*args, **kwargs):
            if level == "warn":
                logging.warn("%s is running" % func.__name__)
            elif level == "info":
                logging.info("%s is running" % func.__name__)
            return func(*args)
        return wrapper

    return decorator

@use_logging(level="warn")
def foo(name='foo'):
    print("i am %s" % name)
```

先不管 `use_logging` 长什么样，先关心它的返回值 `decorator`，看到 `decorator`
本身是一个函数，并且参数是函数，返回值是函数，于是确认 `decorator` 是一个 “装
饰器”。于是上面这种“带参数的装饰器”的作用也就很直接了。

## 我是谁？

上面介绍的方法让我们能正确地写出一个装饰器，但是实际使用时还有一个问题：函数信
息的丢失：我们可以通过 `.__name__` 来查看函数的名称，用 `help(func)` 来查看
`func` 的 docstring：

```
>>> add.__name__
wrapper
>>> help(add)
Help on function wraper in module __main__:

wraper(*args, **kwargs)
```

可以看到被装饰的函数，名称变成了装饰器返回的函数名 `wraper`，这对于函数的使用
者来说很不方便。于是我们需要修改装饰器，保留原函数的名称：

```python
def timer(func):
    def wraper(*args, **kwargs):
        before = time()
        result = func(*args, **kwargs)
        after = time()
        print("elapsed: ", after - before)
        return result
    wraper.__name__ = func.__name__  # <- 保留原函数信息
    wraper.__doc__ = func.__doc__    # <- 保留原函数信息
    return wraper

@timer
def add(x, y=10):
    """Add two numbers"""
    return x + y
```

此时再查看函数的信息：

```
>>> add.__name__
add
>>> help(add)
Help on function add in module __main__:

add(*args, **kwargs)
    Add two numbers
```

当然，函数的信息除了 `__name__` 与 `__doc__` 外，还有 `__module__`,
`__qualname__` 等，每次都手写很浪费时间。Python 提供了内置的装饰器 `wraps` 来
装饰返回的函数：

```python
from functools import wraps
def timer(func):
    @wraps(func) # <- 用于保留原函数信息
    def wraper(*args, **kwargs):
        before = time()
        result = func(*args, **kwargs)
        after = time()
        print("elapsed: ", after - before)
        return result
    return wraper
```

这样一个完整的装饰器就新鲜出炉了。

## 类作为装饰器

如果说 Python 里一切都是对象的话，那函数怎么表示成对象呢？其实只需要一个类实现
`__call__` 方法即可。

```python
class Timer:
    def __init__(self, func):
        self._func = func
    def __call__(self, *args, **kwargs):
        before = time()
        result = self._func(*args, **kwargs)
        after = time()
        print("elapsed: ", after - before)
        return result

@Timer
def add(x, y=10):
    """Add two numbers"""
    return x + y
```

也就是说把类的构造函数当成了一个装饰器，它接受一个函数作为参数，并返回了一个
对象，而由于对象实现了 `__call__` 方法，因此返回的对象相当于返回了一个函数。
因此该类的构造函数就是一个装饰器。

## 小结

装饰器中还有一些其它的话题，例如装饰器中元信息的丢失，如何在类及类的方法上使用
装饰器等。但本文里我们主要目的是简单介绍装饰器的原因及一般的使用方法，能用上的
地方就大胆地用上吧！

## 扩展阅读

- [PEP 0318 -- Decorators for Functions and Methods](PEP 0318 -- Decorators for Functions and Methods)
- [Python Decorator in Detail](http://python-3-patterns-idioms-test.readthedocs.io/en/latest/PythonDecorators.html)
- [What Does it Take to Be an Expert At Python](https://youtu.be/7lmCu8wz8ro?t=45m25s)
- [理解 Python 装饰器看这一篇就够了](https://foofish.net/python-decorator.html)
- [How you implemented your Python decorator is wrong](http://blog.dscpl.com.au/2014/01/how-you-implemented-your-python.html)
