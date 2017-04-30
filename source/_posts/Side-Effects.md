title: 在 Java < 8 里使用函数式编程
date: 2017-04-30 11:21:10
tags: ['FP']
categories:
toc:
---

你知道吗？ Java 8 支持函数式编程哦？可是公司不允许使用 Java 8, 没有关系，在任意
的 Java 版本里都有办法使用函数式编程！我们来看看怎么做。

## 当我们在说函数式时，我们在说什么？

名正才能言顺，我们先看看什么是“函数式编程”。

> In computer science, functional programming is a programming paradigm—a style
> of building the structure and elements of computer programs—that treats
> computation as the evaluation of mathematical functions and avoids
> changing-state and mutable data.

维基百科中说道：在计算机科学中，函数式编程是一种编程范式──它是一种构建计算机程序的
结构与元素的风格，这种风格把“计算”当成是数学上的函数求值，避免了状态及数据的改变。

这里要强调的两点是“函数求值”及“无状态改变”。对应地，引出了函数式编程的两个概念：

1. 函数是“一等公民”。简单的理解是一个函数可以作为另一个函数的参数。
2. “纯”函数，即没有附作用（内存或 I/O 的修改）的函数，我们稍后介绍。

严格来说，Java 8 新增的 Lambda 表达式的支持就是让函数成为“一等公民”。有了 Lambda
表达式及高阶函数（如 `map`），一些传统 Java 的写法能更加简洁。

所以本文的标题有一定的挂羊头卖狗肉的嫌疑，因为我们不想讨论 Lambda 的使用，而是想
讨论“无附作用”的重要性以及如何在 Java 中实践。

## 什么是附作用

由于这个概念是由数学领域发展出来的，所以我们先看看数学里的“函数”是什么。高中（还
是初中）我们就该学过，函数是一个映射，将输入（定义域）映射到相应的输出（值域）。
要注意数学的映射是没有时间概念的，这意味着如果一个函数定义好之后，它就是确定的。

换名话说，对于一个（数学上的）函数，只要输入相同，输出一定是相同的。也就是说一个
函数的输出只依赖于该函数的输入。例如加法 `+` ，只要输入 `a` `b` 确定，则结果一定
是 `a+b`。

而计算机中的函数却不一样，它可能：

1. 读取了函数外部的变量，如全局变量，及读入文件。
2. 将内部的状态写到了外部，如写入全局变量或写入文件。

> In computer science, a function or expression is said to have a side effect if
> it modifies some state outside its scope or has an observable interaction with
> its calling functions or the outside world.

附作用
([Side Effect](https://en.wikipedia.org/wiki/Side_effect_(computer_science))) 指
的是函数或表达式改变了它所在的域之外的状态或是与调用它的函数或外部世界有能观察到
的交互。

例如，Java 中最
