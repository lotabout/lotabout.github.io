title: 再谈闭包
date: 2016-08-27 14:20:38
tags: [closure]
categories: [Knowledge]
toc: true
---

> 在 Algol/Fortran 世界生活的人们总是不相信在未来的编程中，函数闭包对编程的效率
能有多大的帮助。之后就发生了“面向对象编程”的革命，现在几乎人人都用函数闭包进行编程，
只是他们依旧不把它叫作“函数闭包”。

[之前的文章](http://lotabout.me/2015/Closure-%E5%86%85%E6%B6%B5%E7%90%86%E8%A7%A3/)里，
我们试图说服大家：闭包与面向对象在本质上是一样的。这篇文章中，我们要仔细看看什么是闭
包；闭包与 `lambda` 的区别；将函数作为数据的优缺点；以及其它一些你可能想了解的概念。

<!--more-->

## 什么是闭包

闭包 (Closure) 有两种函义，一个是数学意义上的，一种是编程意义上的。这里我们先讨论编程
这个语境下的函义。[维基百科](https://en.wikipedia.org/wiki/Closure_%28computer_programming%29)
中如是说到：

> In programming languages, closures (also lexical closures or function closures) are
techniques for implementing *lexically scoped name binding* in languages with
*first-class functions*. Operationally, a closure is a record storing a
function together with an environment.

中文维基则是这么说的：

> 在计算机科学中，闭包，又称词法闭包（Lexical Closure）或函数闭包（function closures），
是引用了自由变量的函数。这个被引用的自由变量将和这个函数一同存在，即使已经离开
了创造它的环境也不例外。

看了这两种定义，这里出现了两个概念：什么是 **自由变量** ，为什么称为 **词法**
闭包？

## 自由变量与闭包

既然叫自由变量 (free variable)，那还有不自由的变量？还真有，它们称为 ”约束变
量“ (bound variable)。这么理解，一个函数中出现的变量中，函数的参数及函数中定义
的局部变量称为“约束变量”，而其它的则是自由 变量。用 C 语言举例：

```c
int tripple = 20;
int global = 10;

int function(int x) {
    int tripple = 0;       // tripple is bound because it is local
    tripple = global * 3;  // global is free
    return x + tripple;    // x is bound
}
```

这个函数 `function` 中，`x` 是参数，`tripple` 是局部变量，因此称为约束变量；而
`global` 不在此类， 所以称为自由变量。称为约束是因为它们的值是函数 `function`
可以掌管和控制的，而 `global` 是自由的 是因为它的值并不由函数 `function` 控
制。

那么自由变量就是全局变量？

在 C 语言中是这样的，因为 C 不允许我们在函数中定义函数，没有了函数嵌套，函数内
的自由变量当然只能 指向全局了。但在其它支持嵌套定义函数的语言中就不是这样了，
如下面的 Python 代码：

```python
shadowed_var = 10

def outer(x):
    shadowed_var = 20              #  <--+
    def inner(y):                  #     |
        tripple = 0                #     |
        tripple = shadowed_var * 3 #-----+
        return x + y + tripple
    return inner

fun = outer(10)
fun(20)
```

函数 `inner` 中的变量 `shadowed_var` 就是一个自由变量，但在运行时，它指向的是
`outer` 函数中的 `shadowed_var`， 而不是全局的。这里，我们也不经意间涉及了“环
境 (environment)”的概念。

```
+==================================
| Global envirnment
+==================================
| shadowed_var: 10
|
| > fun = outer(10)
| +============================
| | Outer environment
| +============================
| | x: 10
| | shadowed_var: 20             <-----\
| |                                    |
| | +===========================       | shadowed_var refers
| | | Inner                            | to the outer environment
| | +===========================       |
| | | y: argument                      |
| | | tripple = shadowed_var * 3  -----/ 
| | | return x + y + tripple
|
| fun(20)
```

当一个函数运行时，系统（也可能是语言的解释器）就会为它创建一个运行时的环境，函
数会把自己能“约束”的变量放到其中。例如上图中全局环境与 `outer` 函数的环境各有
一个 `shadowed_var` 变量。

而闭包的概念要求我们，如果一个函数创建时，其中的自由变量指向某个环境（`inner`
函数中的 `shadowed-var` 指向 `outter` 环境，那么即使该函数已经离开了这个环境
（即调用 `fun(20)` 时已经离开了 `outer` 环境），那么该函数中 的自由变量依旧要
指向创建时指向的环境（即调用 `fun(20)` 时，函数 `inner` 中的 `shadowed_var` 依
旧指向 `outter` 环境而不是全局的环境）。

所以，自由变量与环境的结合就是闭包技术的关键，有时也把函数本身和指向的环境共同
称为闭包。

## 作用域：静态 vs 动态

作用域是指一个变量的名与值的绑定的有效范围。例如上节中的例子中，`shadowed_var`
是个名字，它的值可以是 `10`（全局 环境中），也可以是 `20`（在 `outter` 环境
中），这个对应关系起作用的范围就是作用域。

静态作用域也称作“词法作用域 (lexical scope)“。想想闭包也被称为“词法闭包”，它们
之间有什么关系呢？其实在上节介绍自由 变量时介绍的数据绑定方法就是静态作用域。

在静态作用域下，变量绑定是由源代码的位置结构（词法结构）决定的，即在查找变量
时，依据的是函数定义/生成时所在的环境。如上节的 Python 代码中，函数 `fun` 在生
成时处在`outer` 环境，因此函数 `fun` 在运行时，仍旧需要在 `outer` 环境中去查找
变量 `x` 和变量 `shadowed_var` 的值。

```
      Lexical Scope                                    Dynamical Scope
+==================================            +==================================
| Global envirnment                            | Global envirnment
+==================================            +==================================
| shadowed_var: 10                             | shadowed_var: 10           <-----\
|                                              |                                  |
| > fun = outer(10)                            | > fun = outer(10)                |
| +============================                | +============================    |
| | Outer environment                          | | Outer environment              |
| +============================                | +============================    |
| | x: 10                     <---------\      | | x: 10                          |
| | shadowed_var: 20             <---\  |      | | shadowed_var: 20               |     
|                                    |  |      |                                  |     
| > fun(20)                          |  |      | > fun(20)                        |     
| +===========================       |  |      | +===========================     |     
| | Inner                            |  |      | | Inner                          |     
| +===========================       |  |      | +===========================     |     
| | y: 20                            |  |      | | y: 20                          |     
| | tripple = shadowed_var * 3   ----/  |      | | tripple = shadowed_var * 3   --/     
| | return x + y + tripple      --------/      | | return x + y + tripple    # x is undefined
```

相比之下，动态作用域则不论源代码的结构，所有的自由变量的值均在运行时的环境中
查找。如上右图，运行 `fun(20)` 时，`shadowed_var` 取值为 `10`，而变量 `x` 则
由于未定义而出错，因为全局的环境中并未定义 `x` 变量。

可以看到，动态作用域下无法实现闭包，因为它与闭包的定义相违背。闭包要求自由变量
与环境绑定，而动态作用域则不允许这种绑定。所以闭包也称为“词法闭包”。

### 动态作用域有什么用？

在现代的主流语方中，你几乎看不到动态作用域的身影（Emacs Lisp 用的是动态作用
域），我们不禁怀疑，这是不是一项被淘汰了的技术？

一项技术的出现一定是为了解决某个/些问题，而如果被淘汰了，则说明这个问题被其它
的方案解决了。那么动态作用域能解决什么问题呢？

现在我们要写一个函数，判断两个浮点数是否相等，因为计算机对浮点数的表示是不精确
的，因此，我们在判断时要指定好精度。用 Scheme 实现如下：

```scheme
(define TOLERANCE 0.001)
(define (float-equal? a b) (< (abs (- a b)) TOLERANCE))
(float-equal? 0.5011 0.5012)     ;=> #t
```

完美解决了问题，但现在我们需要判断两个极为重要的数据是否相等，我们需要更高的精
度。那么现在只需要改变 `TOLERANCE` 的值即可。由于 `float-equal?` 中
`TOLERANCE` 是与全局环境绑定的，因此这个修改可以改变 `float-equal?` 的行为：

```scheme
(define TOLERANCE 1e-6)
(float-equal? 0.50001 0.50002)   ;=> #f
```

Nice! 又一次体现了我们惊人的智慧！只是，这时，原先的代码的行为也发生了变化：

```scheme
(float-equal? 0.5011 0.5012)     ;=> #f
```

当然，我们使用完高精度后再把 TOLERANCE 改回原来的值，但本着代码强迫症的原则，
老板不允许如此难看的写法。于是我们灵机一动，想到可以把 TOLERANCE 作为参数传给
`float-equal?`，再生成一些临时的函数：

```scheme
(define (float-equal? a b TOLERANCE) (< (abs (- a b)) TOLERANCE))
(define (float-equal-normal? a b) (float-equal? a b 0.001))
(define (float-equal-high? a b) (float-equal? a b 1e-6))
```

这下分别用高精度和低精度的函数就可以了！只是这样做依旧会有一些问题：

1. 如果这个函数是库函数，而我们并不能修改它，则这招失败。
2. 如果变量 `TOLERANCE` 的调用关系特别深，则传递参数极其复杂、麻烦。

而这个问题在支持动态作用域的语言中根本不成问题：

```scheme
(float-equal? 0.5011 0.5012)     ;=> #t

(let ((TOLERANCE 1e-6))
  (float-equal? 0.50001 0.50002))   ;=> #f

(float-equal? 0.5011 0.5012)     ;=> #t
```

那这个问题被解决了吗？遗憾的是依旧没有，这意味着如果一个很低层的函数想提供一些
可以配置的选项给高层的函数，中间层的包裹函数也必须提供相应的接口。例如现在我们
想基于 `float-equal?` 提供一个比较函数，得到两个浮点数的大小关系，如下：

```scheme
(define (cmp a b)
  (cond ((float-equal? a b)
         'EQ)
        ((< a b)
         'LE)
        ((> a b)
         'GE)))

(define (cmp a b tolerance-of-equal)
  (cond ((float-equal? a b tolerance-of-equal)
         'EQ)
        ((less? a b)
         'LE)
        ((greater? a b)
         'GE)))
```

为了能控制精度，我们必须改写 `cmp` 为它添加一个参数，用以控制 `float-equal?`
的精度。可想而知，这是很不好的写法，而且，如果 `less?` 也支持这样的配置，那么
`cmp` 就需要增加多个参数用于子函数的配置。这个问题依旧存在于几乎所有静态作用
域的语言中。顺代一提，racket 语言中的 [parameters](https://docs.racket-lang.org/reference/parameters.html)
就是解决这个问题的一种方法。racket 是 scheme 的一种方言。

因此动态作用域并没有被淘汰，但却是鱼和熊掌不可兼得。

## 闭包不是 lambda

lambda 函数，一般也称为匿名函数，它允许我们定义一个函数，同时不为它命名。相信
用过 Javascipt 的同学们已经很熟悉了，因为它经常出现在回调函数里。

由于现今的主流语言中，lambda 与闭包经常同时出现，使得许多人将二者等同对待，但
实际情况并非如此，它们本是两个独立的概念，但现在密不可分又是情有可原。

1. 创建闭包并不需要 lambda 函数。
2. 创建了 lambda 函数并不一定生成闭包。

我们知道，闭包的生成通常需要我们能够嵌套定义函数，并且要求语言采用静态作用域。
那么在下面的 Python 代码里，我们没有用到 lambda ，却生成了闭包。

```python
def gen_adder(n):
    def adder(x):
        return n + x
    return adder

add_10 = gen_adder(10)
add_10(20) # => 30
```

调用 `gen_adder` 时生成了一个环境，而返回的 `adder` 函数中的自由变量 `n` 则与
这个环境绑定，构成了一个闭包。整个过程不没有用到匿名函数。

而创建 lambda 函数时也不一定生成闭包，例如如前一节所说，如果一门语言采用了动态
作用域，那么它根本不可能产生闭包。例如下面的 Emacs Lisp 代码：

```elisp
(defun gen-adder (n)
  (lambda (x) (+ n x)))

(defvar adder (gen-adder 10))

(let ((n 5))                   ; otherwise `n` is undefined
  (funcall adder 20))          ; => 25
```

由于 Emacs Lisp 是动态作用域语言，在调用 `adder` 时，自由变量 `n` 指向的是运行
时环境中的 `n = 5` 而不是定义时环境 `n = 10`。由此可见它并没有生成闭包。

那么 lambda 有何好处呢？我个人认为最大的好处就是方便书写，方便修改。例如回调函
数使用了 lambda 函数，就相当于直接将回调的逻辑写在了需要使用它的地方，这样当
逻辑需要修改时，就不需要首先找到函数定义的位置再去修改，更加方便。还有就是不要
想方设法命名了啊！

## 函数、数据、对象

现代的许多语言者喜欢鼓吹“函数是头等公民 (first-class function)”，以及配套的“将
函数作用数据 (function as data)”。最近在看 SICP 等二章的时候就在思考这样做的
优势在哪？

将 SICP 第二章的图像语言做一个简化。考虑我们要写一个画图的程序，首先我们定义一
个画家，画家的能力是画图，而图是由一些线段构成的，这些线段是事先给定的。一个
画家只会画这个事先定义好的图，但他可以把图画在不同的画板上，自行地进行缩放：

```
+-----------+             +------------------+
|    /\     |             |        /\        |
|   /  \    |             |      /    \      |
|  /----\   |             |    /--------\    |
| /      \  |             |  /            \  |
|/        \ |             |/                \|
+-----------+             +------------------+
```

根据上面的需求，SICP 中使用与下文类似的代码：

```scheme
(define (make-frame ...) ...)

(define (make-painter line-segments)
  (lambda (frame)                     ; define a painter as lambda
    ... ))

(define painter-A (make-painter ...))
(define small-frame (make-frame ...))

; Draw
(painter-A small-frame)
```

上述代码中，画家 A (painter-A) 由调用 `(make-painter ...)` 生成，而
`make-painter` 是返回的是一个函数，之后我们再生成一个画板 `small-frame` 就可以
直接通过调用画家函数来进行绘画：`(painter-A small-frame)`。

如果你习惯了 Scheme(Lisp) 的思维习惯，会觉得这种用函数来表示数据的方法特别地
自然，当然也特别地神奇。而这么做的好处，[SICP 视频](http://ocw.mit.edu/courses/electrical-engineering-and-computer-science/6-001-structure-and-interpretation-of-computer-programs-spring-2005/video-lectures/3a-henderson-escher-example)
里是这么说的：

> the crucial thing that's going on here is you're using the representation of
> pictures as procedures to automatically get the closure property.

Closure Property 指的是一个函数的返回值还可以做为这个函数的参数进行处理，我们
会在下小节中进行介绍。在当前语境下，可以这么理解，如果我们实现一个新的函数，它
以一个 painter 作为参数，返回一个新的 painter，那么我们还可以继续用这个函数去
处理返回的 painter。例如我们定义一个新的函数，可以将画家的画并排地放在一起。

```scheme
(define (beside painter1 painter2)
  ...)

(define painter3 (beside painter1 painter2))
(define painter4 (beside painter3 painter2))
```

可以看到 painter3 是函数 `beside` 的返回值，却可以继续作为它的参数处理。然而，
对于现代的程序员而言，用面向对象的思想完全可以实现这些性质：

```python
class Painter():
    def __init__(self, line_segments):
        self.line_segments = line_segments

    def paint(self, frame):
        # ... some painter logic
        pass
        
def beside(painter1, painter2):
    ... painter1.paint(...) ...
    ... painter2.paint(...) ...

painter3 = beside(painter1, painter2)
painter4 = beside(ainter3, painter2)
```

所以视频里说的这个特性并不能说服我，经过一番思考，得出的结论是：用函数来表示
数据的优点，是可以无缝地表示一个动作。

例如画家最主要的特性是“画”这个动作，而园丁的主要动作是“浇水”，等等。当我们使用
函数来表示这些对象时，我们不在乎它们具体是什么动作，只需要知道可以直接把它们当
作函数来调用，这里它们就会执行它们的默认动作。

然而……现代的面向对象语言仍旧可以做到这点……：

```python
class Painter():
    def __init__(self, line_segments):
        self.line_segments = line_segments

    def paint(self, frame):
        # ... some painter logic
        pass

    def __call__(self, frame):   # default action 
        self.paint(frame)

painter = Painter()
painter(frame)          # use it as a function
```

在 Python 中为一个类实现 `__call__` 函数，就可以将生成的对象作为函数进行调用。
这样就可以将它作为这个类的默认“动作”。

因此也可以看到，即使形式差异很大，这些语言解决问题的本质思想依旧是极其的相似，
甚至可以说是相同的。

## Closure Property

最后说一说 Closure Property，它其实是一个数学上的概念，我们举一个例子：考虑自
然数的集合，任意两个自然数相加，结果依旧属于自然数的集合，我们就称自然数集对加
法操作是闭合的，这就是 Closure property。而对于减法则不是如此，`1-2 = -1` 而
`-1` 不是自然数，因此自然数对减法不闭合。

在程序设计里，闭包属性则为如下定义（SICP）：

> In general, an operation for combining data objects satisfies the closure
> property if the results of combining things with that operation can
> themselves be combined using the same operation.

用通俗的话说就是上节提到的，一个函数的返回值可以作为这个函数的参数。我们可以将
闭包属性理解成一个递归属性，例如我们熟悉的树结构，如果一个操作以一棵树为参数，
返回一棵新的树，那么如果这棵新的树能继续作为这个操作的参数，生成另一棵新的树，
则这个操作对树结构是闭合的。

这种概念上的描述相当绕口，但概念本身还是相当有效且重要的。

如果一些操作对某些数据能够闭合，那么我们就能以各种各样的方式来组合这些操作，来
构建极其复杂的结构。例如 Lisp 中的 `cons`，也可以称为 `pair`。基本的结构就是
两个 `cell`：

```
+----+----+
|    |    |
|    |    |
+----+----+
```

而由于 `cons` 返回的值依旧可以作为 cons 的参数，所以我们就能用这么简单的结构
构建成极为复杂的结构，如列表，树，森林等。

因此在程序设计里，闭合的操作能够用极少的代价提供极为复杂的抽象。只是现实生活中
的许多问题，没有办法分解成一个基本的结构，因此想要将操作设计成闭合的也是十分
困难的，但可能的话收益是很高的。

## 小结

文章中通过介绍自由变量与作用域试图让读者了解闭包的概念和原理；同时对一些容易与
闭包混淆的概念作了区分；再对“函数即数据”的实际意义进行分析；最后介绍了一个与闭
包名字很像的数学概念。

本文的目的是让读者对闭包能有一个更清晰的认识，同时注意到它与面向对象间的异同
点，借此能在日常的编码中应用其中的一些思想。

最后说明一下，闭包的出现早于面向对象（根据维基的信息），所以也不必迷信优劣，
理解它们要解决的问题和解决问题的方法才是最重要的。本人水平有限，如有错误，敬请
指出，谢谢！
