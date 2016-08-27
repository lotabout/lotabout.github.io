title: 再谈闭包
tags: [closure]
---

> 在 Algol/Fortran 世界生活的人们总是不相信在未来的编程中，函数闭包对编程的效率
能有多大的帮助。之后就发生了“面向对象编程”的革命，现在几乎人人都用函数闭包进行编程，
只是他们依旧不把它叫作“函数闭包”。

之前的文章里，我们已经试图说服大家：闭包与面向对象在本质上是一样的。这篇文章中，
我们要看看闭包与 `lambda` 的区别；将函数作为数据的优缺点；以及其它一些你可能想了解
的概念。

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

## 函数、数据、对象

## Closure Property
