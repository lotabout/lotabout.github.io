title: 不要轻易使用元编程
date: 2018-01-07 12:01:55
tags: [meta-programming, macro]
categories: [Comment]
toc: true
---

元编程就像核弹，自己梦寐以求，却不希望别人拥有。

一般说元编程分为两类，一类是宏，在编译时期生成代码；另一类是运行时修改代码的行
为。而不论是哪一类，我的建议是在决定使用之前要慎重考虑。元编程能让我们扩展语言
本身，是十足的黑魔法；但用好不易，容易造成团队/社区在意见是实现上的分裂。（另
外这篇文章里主要是对元编程的一些吐糟，并不包含基础知识的介绍。）

<!--more-->

## 光明与黑暗

一上来，我们先看 Common Lisp 里的 `loop` 宏就。一方面，它体现了宏的强大；另一方
面，它展现了宏能给我们带来的复杂。

熟悉 C/Java 语言都知道循环是语言本身提供的关键字，一般是 `for`。但 Lisp 语言特
别精简，它认为循环只是递归的一个特殊形式，语言本身也不包含任何的循环关键字。于
是有人用宏实现了 `loop` ，它让我们能以近乎英语的方式在 Lisp 里写循环语句，这里
从 [这里](http://www.ai.sri.com/pkarp/loop.html) 摘抄一个例子：

```lisp
(loop for x in '(a b c d e)
      for y from 1

      if (> y 1)
      do (format t ", ~A" x)
      else do (format t "~A" x)
      )
```

你不需要了解这段代码的含义，重要的是了解像 `for .. in ..`, `if ... do ...
else ... do` 这样的语法并不是 Lisp 提供的，而是 loop 宏实现的，这些语法离开了
`loop` 也就不再合法。

我们看到 loop 宏让我们能在 Lisp 语言不支持的情况下享受到近乎现代语言中才包含的
`for ... in ...` 语法。要知道在 Java 中有两种 for 语句：

```java
for (int i=0; i < array.length; i++) {
    System.out.println("Element: " + array[i]);
}

for (String element : array) {
    System.out.println("Element: " + element);
}
```

而第二种直到 JDK 1.5 才加入。在这之前，广大的 Java 程序员即使已经认识到了第二
种写法的优越性，却也只能无奈等到语言支持才行。而 Lisp 程序员很快就能通过宏来实
现自己理想中的语法。

然而光明与黑暗共生，宏给我们带来极大自由的同时，也意味着分裂。每个程序员心中理
想的语法各不相同，这就意味着一千个程序员会有一千种语法。在 Lisp 中宏是非常容易
编写的（不代表容易正确编写），意味着真的会存在一千种语法，大家谁也不服谁，因此
造成分裂；但在 C/Java 中，没有宏的支持，虽然有一千种想法，但大家都写不出编译
器，于是只能集中讨论，统一语法了，再靠大牛们实现了。

而现实就是如此，Common Lisp 尝试标准化 Lisp，但依旧有人不认同这种理念，例如
Scheme，Common Lisp 标准化的 `loop` 宏在 Scheme 中就被抛弃了。

## 照进现实

前车之鉴，后事之师。Lisp 强大的功能，反面导致了语言的分裂，最终使 Lisp 也慢慢
退出历史舞台（主流地位），这也被称为 [The Lisp
Curse](http://www.winestockwebdesign.com/Essays/Lisp_Curse.html)。而现实中我们
也常常会被元编程的强大和便捷诱惑，我认为使用元编程之前最好考虑会不会造成更多的
分裂。最基本的就是不应该自己造语法（DSL）。

当然，我的出发点是多人团队，较大的项目，考虑的是整体的发展。如果是个人学习，或
者小团队等，元编程或许能成为你出众的秘密武器。但大的项目讲求的是合作，DSL 造成
的分裂实在是得不偿失，尤其是作者离开后，维护的工作经常后继无人。

近两年接触到的 rust 也是提供了宏的支持，虽然不像 Lisp 宏一样容易编写，但从功能
的角度上依旧特别强大，而且模板宏写起来也很容易，于是有人想写一个类似 Python 的
[dict 语法](https://gist.github.com/waynenilsen/0c7a9e42fbc8581592c2)：

```rust
let x = dict!(
    "hello" => "world"
    ,"hello2" => "world2"
);
```

但我个人并不喜欢这种语法，我认为 Clojure 似的语法更简洁 `dict!("hello":
"world")`。那在团队里引入这两个宏就会引起代码的分裂，后来人在看代码时就会很困
惑。不利于团队的建设。

最后分享在 [知乎](https://www.zhihu.com/question/19875500/answer/120828859) 上
看到的引用：

{% blockquote https://github.com/apple/swift-evolution/tree/104cdde1c374a95a7eaf4768960578db3b9971b7 %}
Hygienic Macros and Compile-Time Evaluation: A first-class macro system, or
support for compile-time code execution in general, is something we may
consider in future releases. We don't want the existence of a macro system to
be a workaround that reduces the incentive for making the core language great.
{% endblockquote %}

Swift 表示不希望用宏来解决语言本身的缺陷。

而我的理解是当我们希望用宏（或其它元编程手段）时，很可能是我们使用的语言缺少了
某些特性，例如 Java 的 lombok 提供的 `@Getter/@Setter` 等注解，就是因为 Java
没有相应的语言层面的支持，看看 Kotlin 的支持你就会明白的。

但即便有了宏（或元编程）的支持，你有信心能做出让整个团队都信服的设计吗？如果没
有，最好还是慎重为之。

## 写在最后

虽然是吐糟，但这篇之间重写了三次。想表达的内容很多，最终还是把其它的东西删去，
Lisp curse 还是我想真正表达的东西吧，其它的基础知识，有缘人自然会从其它地方学
会。

年轻人容易崇拜力量，我们也别忘了阳光还有影子。
