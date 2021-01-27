title: 如何理解 Explicit is Better than Implicit?
toc: true
date: 2021-01-25 22:24:00
tags: [Python, Zen]
categories: [Notes]
---

"Explicit is better than implicit" 是 [The Zen of
Python](https://www.python.org/dev/peps/pep-0020/) 中的一句格言。长久以来都觉
得挺在理，直到有天有人用这句话为基础，提出了一个我不甚赞同的观点，才发现从来就
没有真正理解过它。

神奇的是在搜索过程中，发现讨论这句格言的并没有多少，不同的讨论中对 "explicit"
含义的理解差别也很大，最终发现最好的讨论来自 Elixer 社区：[On ‘Explicit is
better than Implicit’
](https://elixirforum.com/t/on-explicit-is-better-than-implicit/22076/17)。本
文尝试列举见过的一些观点，以及自己的理解。

## Explicit 是什么含义？

Explicit 这个单词释义为：

> stated clearly and in detail, leaving no room for confusion or doubt

“清楚详细地陈述，不容混淆或怀疑”。翻译成中文有“显式的”、“精密”、“不含糊”、“明
确的”等多种翻译。在代码的语境下，什么样的代码才能称得上是 "explicit" 呢？网上
看到了不同角度的观点。

## 一些观点

### 把代码显式写出来

显式地写出代码，也可以有多种理解方式，[Making Games with Python and
Pygame](https://eng.libretexts.org/Bookshelves/Computer_Science/Book%3A_Making_Games_with_Python_and_Pygame_(Sweigart)/06%3A_Simulate/6.21%3A_Explicit_is_Better_Than_Implicit)
中举了一个示例：

```python
def getButtonClicked(x, y):
    if YELLOWRECT.collidepoint( (x, y) ):
        return YELLOW
    elif BLUERECT.collidepoint( (x, y) ):
        return BLUE
    elif REDRECT.collidepoint( (x, y) ):
        return RED
    elif GREENRECT.collidepoint( (x, y) ):
        return GREEN
    return None # 这里显式地返回了 None
```

书中提到最后一行显式写 `return None` 能让读者更直接理解代码的用途。

思考：这个样例容易理解，也很赞同，但是如何推而广之呢？Explicit 在上面的例子中
体现在哪呢？

我理解它的重点在于，当所有的 `if` 语句都不命中时，默认的行为是未知的，而显示写
出的 `return None` 则清楚地描述了默认的情形，即使 Python 的默认行为发生变化，
该方法的行为也不会发生变化。

### 要具体、要特化

[这篇文章
](https://miguelgfierro.com/blog/2018/python-pro-tips-understanding-explicit-is-better-than-implicit/)
明确表达了自己对“Explicit is Better than Implicit”的理解：

> Being explicit means being concrete and specific instead of abstract and
> general. It also means not to hide the behavior of a function.

Explicit 意味着要具体、特化，不要抽象、通用。同时不要隐藏函数的行为。

对于要具体、特化，文章中举例如下：

```python
# Explicit                               |  # Implicit
import requests                          |  from requests import *
r = requests.get("https://lotabout.me")  |  r = get("https://lotabout.me")
```

对这个例子也是比较认同的。但我认为重点不在于 `requests.get` 怎么好，而在于
`import *` 不好。因为这样的话 `get` 方法的来源就不明确了，容易混淆，需要靠猜。
相对的，下面的代码我认为也是好的：

```python
from requests import get
r = get("https://lotabout.me")
```

这里我的理解是，代码执行的逻辑，从溯源的角度上没有二义。如果用了 `import *`，
同时两个模块中都有 `get` 方法，则容易混淆，不知道真正执行的是哪个方法。


### 不要隐藏函数行为

同样来自[上面提到的文章
](https://miguelgfierro.com/blog/2018/python-pro-tips-understanding-explicit-is-better-than-implicit/)
，示例如下：

```python
#Explicit
def read_csv(filename):
    # code for reading a csv

def read_json(filename):
    # code for reading a json

#Implicit
def read(filename):
    # code for reading a csv or json
    # depending on the file extension
```

这个示例我不认同。从观念上，它与 OOP 中提到的封装的思想；从使用上，文件类型的
判断的要求并没有消失，只是丢给用户自己实现了；进而从结果上，只要有多种文件类型
存在，在某个层级上一定会有一个 `read` 方法的。

举例说，如果说不要隐藏函数的行为，那么我们在写 Web 服务的时候，在我们访问 DB
时，我们会希望直接处理 TCP 连接吗？Spring 框架选择隐藏这些行为，可以说是错误吗
？

关键在于“预期”，与预期相符就是“Explicit”的，正如[Elixer 社区的讨论
](https://elixirforum.com/t/on-explicit-is-better-than-implicit/22076/14)：
"Don't surprise me"。于是 Explicit 的要求演变成如何给用户正确的预期？我的回答
是：良好命名，遵循 common sense，除此之外需要教育。

### No Magic

Django 的 [Design
philosophies](https://docs.djangoproject.com/en/3.1/misc/design-philosophies/#explicit-is-better-than-implicit)
中有如下描述：

> Magic shouldn’t happen unless there’s a really good reason for it. Magic is
> worth using only if it creates a huge convenience unattainable in other
> ways, and it isn’t implemented in a way that confuses developers who are
> trying to learn how to use the feature.

这里指的是不要用复杂的语言特性（大家常把元编程称作 Magic）。

这个观点的持保留意见，我认为重点还是在于知识、背景是否匹配。例如当我熟悉
Decorator 时，就会觉得用 decorator 来指定一个 REST API 的路由很直观，很容易理
解。但对于不熟悉的人可能就完全不能理解数据的路径(data path)，不知道为什么一个
注解是怎么真正完成 URL 到函数的绑定的。

### 含义更直接

还有一些讨论会指向同一段逻辑的不同写法，例如[SO 上的讨论
](https://stackoverflow.com/q/64070128) 举的例子：

```python
a = []

# ① my understanding is that this is implicit
if not a:
   print("list is empty")

# ② my understanding is that this is explicit
if len(a) == 0:
   print("list is empty")
```

这是一个“矛盾”的讨论，题主认为 ② 是 explicit，下面的回答则指出写成 ① 的方式
能应对更多的情形，如 `a` 不是列表的情形。我能理解 ① 的作用，但同时也赞同题
主的观点，从阅读的角度来说 ② 是更直接的。

还有 [Elixer 社区的讨论
](https://elixirforum.com/t/on-explicit-is-better-than-implicit/22076/17)，例
子一方面说明什么是语义上的“直接”，也间接反驳“不要隐藏函数行为”的观点：

```javascript
if (person.sex === 1 and person.children.length > 0) { ...do something... }

if (person.isFemale() and person.hasChildren()) { ...do something... }

if (person.isFemaleParent()) { ...do something... }
```

从阅读代码的角度，明显上最后一种最容易阅读，更符合语言习惯，不容易有歧义。

## 我所理解的 Explicit

上面我们看到，“Explicit is Better than Implicit”这句话本身就是 implicit 的，有
很多歧义的理解。

我自己的总结是：**Minimal Knowledge, No Surprise**。

对于阅读者/使用者而言，需要最少的知识去理解它，在我们隐藏复杂度的过程中，要保
证函数/API/…行为符合预期，没有意外。

例如对于函数最后加上 `return None` 比不加要好，因为加上后，我们就不需要了解
Python 函数的默认返回值是什么。类似的，显式引用会更好：`from requests import
get`，因为读者不需要去找 `get` 方法的来源，以及有重名时是哪个函数生效。

对于“不要隐藏函数行为”的做法，就有一定的反对意见。例如 `read_csv` 和
`read_json` 是否优于 `read` 方法？我认为此时 No Surprise 很重要。对于 csv,
json 等文件格式我认为 `read` 更优，因为根据扩展名判断类型是一个共识，并不会有
surprise 发生。而如果读取的是 HDFS 上的文件，由于很多文件保存时并不会按扩展名
保存，我认为此时 `read` 就容易有 Surprise，因此是不合适的。

对于 Magic，如果做法不是 common sense，则需要我们额外学习 Magic 的含义，就是属
于"Implicit" 的，此时用来是不用，就要看它能给我们带来多大的好处了。同样的还有
语言中的语法糖，经常需要额外学习知识才能看懂/自己使用。

最后对于“含义更直接”，认为在 No Surprise 的前提下，越接近“共识”越好，因为需要
更少的知识。

## 小结

关于 "Explicit is Better than Implicit?" 的理解，文章罗列了网上搜索的一些观点
：

- 把代码显式写出来，如显式加上 `return None`
- 要具体、要特化，如显式 import：`from requests import get`
- 不要隐藏函数行为，如实现 `read_csv` 与 `read_json` 要好于只实现 `read`
- No Magic，如非必要，不要使用元编程
- 含义更直接，如用 `len(a) == 0` 判断列表为空而不是 `not a`

最后总结并说明了自己对 "explicit" 含义的理解：**Minimal Knowledge, No Surprise**

当然，我们会发现 Minimal Knowledge 或者说“共识”对于不同的群体，在不同上下文之
下是不同的。这也是我们需要经验去理解，需要花时间去沟通的内容了。
