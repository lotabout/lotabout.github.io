title: 声明式(declarative) vs 命令式(imperative)
toc: true
date: 2020-05-06 16:38:20
tags: [Programming Paradigm, Declarative, Imperative]
categories: [Post]
---

声明式(declarative)是结果导向的，命令式(imperative)是过程导向的。它们都有自己
适用的场景和局限，于是现实中的编程语言常常都有两者的身影。

## 命令式 vs 声明式

> **Declarative programming** is a programming paradigm ... that expresses the
> logic of a computation without describing its control
> flow[^wiki-declarative]

[^wiki-declarative]: https://en.wikipedia.org/wiki/Declarative_programming

> **Imperative programming** is a programming paradigm that uses statements that
> change a program's state[^wiki-imperative]

[^wiki-imperative]: https://en.wikipedia.org/wiki/Imperative_programming

例如我们有一个用户列表，用 python 查找手机号为 `183` 开头的用户，可能会这么写
：

```python
def get_users():
    ret = []
    for user in users:
        if user['phone'].startswith('183'):
            ret.append(user)
    return ret
```

这是命令式的作法，给出通向目标的每个指令；而声明式语言则直接描述目标，如 SQL 可
能会这么写：

```sql
SELECT * FROM users where phone like '183%';
```

显然，声明式语言对用户更友好，用户可以关心更少的细节。更重要的是：它允许多种底
层实现方式，保持目标不变的同时不断优化，如上例中 SQL 的实现既可以遍历所有的用
户，也可以使用索引来加速查找。

而命令式的好处自然是它的表达能力了，图灵完备的语言可以表达任何的可计算问题。

## 声明式不是万能的

声明式语言直接描述目标，那怎么才能清晰地描述目标呢？有时候也需要命令式的帮助。

考虑下面的命令式的伪代码要如何用 SQL 实现：

```
goods = (SELECT * from goods)
for g in goods:
    #>> 注意在内层循环中可以引用外层表 goods 的字段
    evaluations = (SELECT * from evaluations e where e.good_id == g.id)
    if len(evaluations) > 3:
        print(g, len(evaluations))
```

会发现使用常规的 `JOIN` 语义，很难实现上述目标。子查询里是无法引用其它查询的字
段的，这本身是一种优势，数据库内部可以对 JOIN 的实现进行优化，但同时也限制了对
复杂 JOIN 语义的表达。

后来 SQL 里加了个关键字：`LATERAL`[^lateral-limitation]，用来表达子查询的先后
顺序，上例可以写成：

[^lateral-limitation]: 出现在 [ISO/IEC
  7095:199](https://ronsavage.github.io/SQL/sql-99.bnf.html) 标准中，Postgre、
  Flink 支持，其它本人没查全

```sql
SELECT g.*, e.num FROM goods as g
LEFT JOIN LATERAL(
    SELECT COUNT(ev.id) as num FROM  evaluation AS ev WHERE ev.goods_id=g.id
) AS e ON TRUE WHERE num > 3
```

有了 `LATERAL`，在 LATERAL 后的子查询就可以引用前面子查询的变量。那么`LATERAL`
算是声明式还是命令式？似乎变得模糊了，一方面它依旧是表达目标，是声明式；另一方
面它似乎指定了操作步骤（先查 goods，再查 evaluations）属于命令式。

**当描述的目标变复杂时，声明式语言也不可避免变得更命令式，通过描述过程来描述更
多细节**

## 命令式里的声明式

传统上的一些编程语言，如 C/C++、Java、Python 等都被认为是命令式语言。用这些语
言编写程序时的确是一条语句一条语句导向最终的目标。但这些编程语言与声明式的界限
也并非泾渭分明。

除了机器码，包括汇编在内的几乎其它所有编程语言都有“函数”的概念。通过将语句组装
成函数，无论是在使用还是阅读上，似乎都可以认为是在指定目标，是声明式的。例如要
计算 Fibonacci 数列的第 N 个数，如果已经有现成的库，我们也只需要写 `x =
fibonacci(n)`，似乎也不是“命令式”吧。

另外，编程语言的一些语法糖也加强了我们“声明目标”的能力，如 Python 的装饰器
(decorator) `@dataclass`，“声明”式地定义一个类为数据类，Java 的 lombok 库也有
`@Data` 这样的注解(annotation)实现类似的功能。

**通过适当的封装、组件化，命令式也可以变成目标导向，变得更加“声明式”**

## 小结

声明式使用方便、容易理解、易于优化，但表达能力有限，要表达更复杂的目标时，它往
往也在向命令式靠拢了。而命令式里很多重复性的工作，也可以通过适当地组件化部分变
成声明式。这样看来，一门语言是声明式还是命令式，似乎取决于我们接触的细节多少。

生活中，大老板决定路线，小老板决定方案，螺丝钉具体落实，不也类似嘛。

在我们设计语言、库时，尽可能地将接口设计得“声明式”，暴露更少的细节给用户，不仅
能让用户用得开心，也方便内部的扩展、优化。

## 参考

- https://reactjs.org/ React 的设计理念：Declarative view
- 《Design Data-Intensive Applications》第二章，说明 CSS/XSL 是声明式的语言
- [未来属于声明式编程](https://djyde.github.io/blog/declarative-programming-is-the-future/) 对声明式编程语言的思考
- [命令式和声明式，哪个才是你的菜](https://cloud.tencent.com/developer/article/1080886) 描述了声明式、命令式的一些差别
