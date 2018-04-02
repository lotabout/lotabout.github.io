title: 'QQA: 为什么 java 中要写 getter/setter？'
date: 2018-04-02 19:06:30
tags: [QQA, java]
categories: [QQA]
toc:
---

java 有一个不成文的规定，如果要访问一个类的 private 字段，就需要写
getter/setter 方法。但我们在其它语言却很少见到类似的约定，为什么？

- 它是“封装”的体现，对外隐藏了具体实现，允许之后对属性的访问注入新的逻辑（如验
    证逻辑）。
- 一些语言，如 python，提供了机制允许我们更改访问属性的逻辑，因此不需要手工写
    getter/setter。

## getter/setter 是对“属性访问”的封装

假设我们写了下面这段代码，直接访问类的 public 字段：

```java
class Person {
    public String name;
}

// caller
String name = person.name;
person.name = "Java";
```

之后我们认为 `name` 属性只能是字母，不能包含其它的字符，上面这种实现中，我们就
需要更改所有 caller 调用 `person.name = ...` 的代码。换句话说，类 `Person` 暴
露了实现的细节（即字段 person）。

那么如果一开始就使用了 getter/setter，则我们不需要改变任何 caller，只需要在
`setName` 函数里增加相应的逻辑即可。

```java
class Person {
    private String name;

    public String getName() {
        return this.name;
    }

    public void setName(String name) {
        validate_name(name);  // the newly added validation logic
        this.name = name;
    }
}

// caller
String name = person.getName();
person.setName("Java");
```

所以，通过这层封装，之后如果有需要，我们甚至可以更改字段的名字，类型等等。这就
是封装的好处，而 getter/setter 这种写法能让我们为将来可能的修改做好准备。

## 其它语言里的 getter/setter

getter/setter 的作用是为“属性的访问”（即 `x.field` 与 `x.field = ...`）提供日
后修改的可能。一些“比较新”的语言就默认提供了这种能力。

Python 中提供了 [Descriptor](https://docs.python.org/3/howto/descriptor.html)
的机制。在 Python 中，可以认为当访问对象的属性时，等价于调用对象的 `__get__()`
和 `__set__()` 方法，因此我们可以覆盖这两个方法来修改访问的逻辑。

同样的，Kotlin 在定义
[properties](https://kotlinlang.org/docs/reference/properties.html) 也可以自定
义的 getter/setter 方法来修改属性访问的逻辑。

这里想说明的是，getter/setter 其实应该是默认实现，然后有需要时再覆盖，而不是每
次都手工实现。

## 社区与约定

也许你会问，封装其实叫什么名字都行，为什么非要叫 `getXXX` 及 `setXXX` 呢？这其
实是
[JavaBeans](http://download.oracle.com/otn-pub/jcp/7224-javabeans-1.01-fr-spec-oth-JSpec/beans.101.pdf?AuthParam=1522674989_0d7c790344741da888ed8c0e890ea7d5)
里约定的（7.1 节）。甚至从某种角度来说 getter/setter 的目的也不是为了封装，而
只是一个约定，使框架能识别 JavaBeans 中的 property。

在实际工作中你会发现，90% 以上的 getter/setter 在未来并不会被用来增加逻辑什么
的。所以“封装”的作用理论上是好的，但实际被使用到的频率特别低，反而增加了许多无
用的代码。

另一方面，随着使用 getter/setter 使用的增加，且由于绝大多数 getter/setter 并不
会增加额外的逻辑，使得人们开始习惯于假设 getter/setter 不会有额外逻辑。所以如
果你想在 setter 里加一些额外的逻辑时，反而要注意会不会让使用的人感到吃惊。

## 写在最后

Getter/Setter 这个话题看上去似乎很简单，它的背后却有很多可以深究和思考的内容的
。有人说 Getter 没关系，可怕的是 Setter；也有说现在lombok 这么方便，用
Getter/Setter 有利无害；也有人说尽量避免使用 Getter/Setter。这些观点背后都藏着
一些软件的设计思维。例如怎样设计类的接口，如何实现封装，这些都是后续需要学习思
考的内容。
