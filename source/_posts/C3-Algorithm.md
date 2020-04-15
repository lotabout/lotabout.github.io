title: C3 算法：Python 多继承的内部原理
toc: true
date: 2020-04-15 18:56:42
tags: [python, mixin, multiple inheritance, C3]
categories: [Knowledge]
math: true
---

在 Python 中使用 Mixin 有没有遇到过 `Cannot create a consistent method
resolution` 错误？Mixin 在 Python 里只是多继承(multiple inheritance) 的一种
用法，而多继承时，Python 是如何决定父类的顺序呢？咱们就来看看 C3 算法是何方
神圣。

TLDR; 我个人觉得 C3 算法就是拓扑排序…

## Method Resolution Order(MRO)

考虑下面的多继承的代码：

```python
class A(object):
    def hello(self):
        print("hello from A")

class B(object):
    def hello(self):
        print("hello from A")

class C(A, B): pass

C().hello()
```

上面的 `C().hello()` 输出是什么呢？这里会输出 `hello from A`。

Python 的多继承符合直觉，可以认为：在查找一个方法或类时，**会从左到右查找父
类的方法或类**，找到为止。这个查找顺序叫作 Method Resolution Order，简称 MRO。
可以通过 `<class>.mro()` 查看，如：

```
>>> C.mro()
[__main__.C, __main__.A, __main__.B, object]
```

可以看出，查找方法时，会先查 A 再查 B。

## C3 算法

那么如何计算 MRO 呢？Python 里使用 C3 算法[^1]。其实就是拓扑排序，只是排序的“
图”上加了点特技。

[^1]: python 2.3 及以后

符号定义：

* 方便起见，先定义符号 $C_1C_2...C_N$ 代表一个列表 $[C_1, C_2, ..., C_N]$
* 再定义加号： $C + (C_1 C_2 ... C_N) = C C_1 C_2 ... C_N$
* 定义 $C_1C_2...C_N$ 列表中，$C_1$ 为头部，$C_2...C_N$ 为尾部

算法：

* 对于类定义 `class C(B1, B2, ..., BN)`，记它的 MRO 为 `L[C]`（L 代表 linearization）
* 所有类都会继承 `object`，定义 `L[object] = object`
* 算法定义计算步骤为 $L[C] = C + merge(L[B_1], L[B_2], ..., L[B_N], B_1B_2...B_N)$
    - 注意这里末尾的 $B_1B_2...B_N$，就是我们说的“特技”
* `merge` 方法定义为：
    1. 选取第一个列表 $B_1$
    2. 首先选取第一个列表 $B_1$ 第一个元素
    3. 如果该元素不出现在 merge 方法其它列表的尾部，则输出元素，并将该元素从其
       它列表中移除，取下一个元素
    4. 如果该元素出现在其它列表的尾部，则选取下一个列表，并重复步骤 2，直到所
       有列表为空
    5. 如果遍历过所有的列表，有列表不为空且过程中没有输出，则说明得不到有效
       MRO，报错

## 算法示例

merge 算法其实就是拓扑排序，举例如下：

```python
O = object
class F(O): pass
class E(O): pass
class D(O): pass
class C(D,F): pass
class B(E,D): pass
class A(B,C): pass
```

继承关系如下图左，而预期的 MRO 关系如下图右（A->B 表示 MRO 中 A 出现在 B 之前
）：

{% asset_img C3-example-1.svg C3 Example 1 %}

计算 MRO 相当于对上右图做拓扑排序，merge 参数的最后一项，实际定义了同层元素间
的指向。

Level 2 的 MRO 很容易计算

```
L[E] = E + merge(L[O]) = E + merge(O) = E + O = EO
L[D] = D + merge(L[O]) = D + merge(O) = D + O = DO
L[F] = F + merge(L[O]) = F + merge(O) = F + O = FO
```

Level 1 的 MRO 计算如下：

```
L[B] = B + merge(L[E], L[D], ED)
     = B + merge(EO, DO, ED)     # 检测 EO 中的元素 E
     = B + E + merge(O, DO, D)   # 检测 DO 中的元素 D
     = B + E + D ＋merge(O, O, ) # 检测元素 O
     = B + E + D ＋O
     = BEDO

L[C] = C + merge(L[D], L[F], DF)
     = B + merge(DO, FO, DF)     # 检测 DO 中的元素 D
     = B + D + merge(O, FO, F)   # 检测 FO 中的元素 F
     = B + D + F + merge(O, O, ) # 检测元素 O
     = B + D + F + O
     = BDFO
```

于是 A 的 MRO 为：

```
L[A] = A + merge(L[B], L[C], BC)
     = A + merge(BEDO, BDFO, BC)              # 检测 BEDO 中的 B
     = A + B + merge(EDO, DFO, C)             # 检测 EDO 中的 E
     = A + B + E + merge(DO, DFO, C)          # 检测 DO 中的 D
     = A + B + E + D + merge(O, FO, C)        # 检测 O 中的 O，出现在 FO 尾部
     = A + B + E + D + merge(O, FO, C)        # 检测 C 中的 C
     = A + B + E + D + C + merge(O, FO, )     # 检测 O 中的 O，出现在 FO 尾部
     = A + B + E + D + C + merge(O, FO, )     # 检测 FO 中的 F
     = A + B + E + D + C + F ＋merge(O, O, )  # 检测 O
     = A + B + E + D + C + F ＋O
     = ABEDCFO
```

最后注意根据拓扑图，元素 E 和 C 的顺序先后其实无关紧要。

## 反例

对于下面的类定义，算法就会报错。因为 A 要求 X 在 Y 左边，而 B 的要求正好相反，
二者矛盾。

```python
O = object
class X(O): pass
class Y(O): pass
class A(X,Y): pass
class B(Y,X): pass
class T(A,B): pass
```

拓扑图如下，我们发现它存在循环引用：

{% asset_img Cyclic.svg Cyclic Example %}

算法计算过程如下：

```
L[X] = XO
L[Y] = YO
L[A] = A + merge(L[X], L[Y], XY)
     = A + merge(XO, YO, XY)
     = AXYO
L[B] = B + merge(L[Y], L[X], XY)
     = B + merge(YO, XO, YX)
     = BYXO
L[T] = T + merge(L[A], L[B], AB)
     = T + merge(AXYO, BYXO, AB)        # 检测 AXYO 中的 A
     = T + A + merge(XYO, BYXO, B)      # 检测 XYO 中的 X，出现在 BYXO 的尾部，跳过
     = T + A + merge(XYO, BYXO, B)      # 检测 BYXO 中的 B
     = T + A + B + merge(XYO, YXO, )    # 检测 YXO 中的 Y，出现在 XYO 的尾部
     # 此处无法再化简，报错
```

## Python 2.3 之前的问题

C3 算法是在 Python 2.3 后引入的，在这之前，考虑下面的示例：

```python
F=type('Food',(),{'remember2buy':'spam'})
E=type('Eggs',(F,),{'remember2buy':'eggs'})
G=type('GoodFood',(F,E),{}) # works before Python 2.3
```

用 C3 的方式画出拓扑图如下，虽然代码里不明显，图里可以看到存在循环引用：

{% asset_img Before-2.3.svg Bad Example Before Python 2.3 %}

而 Python 2.3 之前的 MRO 算法在调用 `G.remember2buy` 属性时，预期输出 `spam`（
因为 `G(F, E)`，预期先查找 F 的方法），而实际会输出 `eggs`（E 的方法），不符合
预期。Python 2.3 及以后就会报错。

因此如果在实现 Mixin 的时候，如果搞错顺序可能就无法运行，例如：

```python
class Base(object): pass
class MixinA(Base): pass
class MixinB(Base): pass
class Y(MixinA, MixinB, Base): pass
class X(Base, MixinA, MixinB): pass # error
```

简单的结论是越具体的实现位置越靠前。

## 小结

写到最后发现：C3 算法似乎和拓扑排序没有任何区别？只是在标记拓扑图上做一些工夫
，保证类定义的先后顺序反映在 MRO 中：即 `A(B, C)` 最后的 MRO 中 B 一定在 C 之
前。

这个知识也许在使用 mixin 出错的时候能帮上忙，剩余时候感觉也没什么用。

## 参考

算法、示例取自 [The Python 2.3 Method Resolution Order](https://www.python.org/download/releases/2.3/mro/)，建议看原文。
