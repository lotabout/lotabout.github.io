title: 简谈 Rust 中的错误处理
date: 2017-01-07 14:17:00
tags: [rust, error-handling]
categories: [Knowledge]
toc: true
---

在学习 Rust 的过程中，错误处理是一个必需要迈过的坎。主要原因是所有的标准库都以
统一的方式处理错误，我们就来谈一谈 Rust 中是如何处理错误的吧。

[Rust Book](https://doc.rust-lang.org/book/error-handling.html) 对 rust 中的
错误处理有详细的讲解，本文对其中一些选择背后的原因进行了思考和总结。强烈建议先
看原文。

## 返回错误与异常处理

名正则言顺，我们先说说什么是“错误”，什么是“异常”：

- **错误**：运行时发生的不寻常的、 **超出预期** 的行为，这些问题只能通过修改程序
来解决。例如内存不足。
- **异常** ：运行时发生的不规则的、 **意料之内** 的行为。例如尝试读取“读保护”的
文件。

可以看到，“错误”与“异常”的区别是“意料之内”还是“之外”。因此，本文中所说的“错
误”其实都指的是异常（这也是 Java 中既存在异常 Exception 又存在 Error 的原因）。

在 C 语言中，错误处理的机制是十分简陋的，例如 Linux 的系统调用如果出错，会
将错误记录在一个全局变量 `errno` 中，`errno` 是一个整型值，操作系统事先约定好
不同值代表不同含义。

到了 C++/Java/Python 语言则采用了异常处理机制，当函数错误时，可以抛出预定义或
自定义的异常，语言本身提供了捕获这个异常/错误的语法（即 `try ... catch ...`）

异常处理相比于返回错误的好处是分离了接收和处理错误的代码。如果只用 C 语言的方
式，则函数的返回值需要有一部分用于表示错误。例如 `read` 函数 在出错时返回
`-1`；正确时返回 `0` 或以上，而函数的调用者必须自己区分正确也错误的情形。还有
一些更坏的情况，例如一个除法函数，它返回的任何值理论上都可能是“正确值”。那么当
发生除 0 错误时，它应该返回什么值来表示错误呢？

在写作本文时，我也倍受困扰，“返回错误”的方式明明一无是处，为什么 Rust 还要选择这种
方式呢？ [这篇文章](https://news.ycombinator.com/item?id=9545647) 中提出的观点
是：Rust 是一门相对底层的语言，因此在某些情况下，异常处理所需要的额外性能开销
是不可接受的。或许这就是 Rust 不包含异常的原因吧。

## Option

首先要注意到 Rust 中是没有 `null` 的概念的，我们无法像其它语言（如 C++/java）
一样创建一个变量，并赋值为 `null` 来代表变量当前没有内容。在 Rust 中，做不到！

于是 Rust 自定义了一个结构体来表示可能为空的情形，这应该是向 Haskell 的
`Maybe` 借鉴的吧。结构体长这样：

```rust
pub enum Option<T> {
    None,
    Some(T),
}
```

这样，当你想表示 `null` 时就可以用 `None` 代替。而其它的赋值则可以用
`Some(...)` 完成。带来的问题是：如何访问 `Some(...)` 里的内容呢？Rust 的答案是
pattern matching:

```rust
match opt {
    Some(value) => println!("value = {}", value),
    None => println!("Got None"),
}
```

而由于 `match` 会保证我们列出了所有可能的 `pattern`，即不允许只处理 `Some` 而
不处理 `None`，因此保证了程序员必定处理了值为 `null` 的情形。就说机不机智。

不过事实是程序员都懒啊，如果我明确知道不可能出现为 `null` 的情况，还需要写一堆
的 `match`，着实闹心，于是 rust 又为我们开了小灶，提供了 `unwrap` 函数：

```rust
impl<T> Option<T> {
    fn unwrap(self) -> T {
        match self {
            Option::Some(val) => val,
            Option::None =>
              panic!("called `Option::unwrap()` on a `None` value"),
        }
    }
}
```

注意这里的 `panic!`，它的作用是输出错误的信息并退出程序（严格地说并不一定退出
程序，rust 1.9 添加了
[catch_unwind](https://blog.rust-lang.org/2016/05/26/Rust-1.9.html) 支持）。所
以可以通过调用 `option.unwrap()` 来获取 `option` 中包裹的值。言下之意就是：你
说不可能出现 `null` 是吧，我且相信你，但如果出了问题我就不管了。

当然，使用 `Option` 的过程中还有其它一些问题，例如，程序员知道可能出现 `None`
的情况，当出现时使用一个默认的值。这种情况 rust 提供了函数
`unwrap_or(default)` 来方便书写。再例如两个函数都返回 `Option`，我们想将一个
函数的输出作为另一个函数的输入，此时可以使用 `and_then` 来减少手写 `match` 的次数。

还有一些其它的情况可以参考 [官方文
档](https://doc.rust-lang.org/book/error-handling.html#composing-optiont-values)

## Result: Option 加强版

`Option` 可以用来表示 `null` 的情形，这解决了前文提到的一个问题，如果除法函数
发生了除 0 操作，返回什么值来表示发生错误了？有了 `Option` 我们可以返回
`None`。

但如果可能发生多个错误呢？这时，`Option` 可以认为只能表示发生一个错误的情形。
于是 Rust 提出了另一个结构，用于包裹真正的结果：

```rust
enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

其实就是表示了两种可能，如果没有错误，则返回 `Ok(..)`，反之返回 `Err(..)`。而
由于 `Err` 可以带参数，所以即使发生了多个错误也能正常表示。甚至，我们可以将
`Option` 定义为：

```rust
type Option<T> = Result<T, ()>;
```

它和上节中的 `Option` 在作用上是等价的。另一方面，我们也看到，其实
rust 处理错误就是返回不同的结构体，某些表示正确，某些表示错误，我们甚至可以抛
开这些结构，直接用 `tuple` 来表示：

```rust
type Result<T, E> = (T, E);
```

这样的话，是不是和 Go 语言又很相似了呢？所以这里要强调的是，返回错误的重点在
于“返回”，也就是说，错误也是“正常值”的一种。

我们马上又要回到了 `Option` 的老路了，但这之前，我们发现 `Err(E)` 中，`E` 可以
是任意类型，也就是说我们可以将错误指定为任意类型。我们先指定为 `i32` 来模仿 C
中的 `errno` ：

```rust
fn read(...) -> Result<usize, i32> {
    if size >= 0 {
        return Ok(size);
    } else {
        return Err(errno);
    }
}
```

而如果调用者对发生的错误感兴趣，则可以继续用 pattern matching 来解构：

```rust
match read(...) {
    Ok(size) => ...
    Err(1) => ... file not found ...
    Err(2) => ... is directory ...
    ...
}
```

当然，像 `Option` 一样，如果程序员对发生的错误不感兴趣，rust 也提供了 `unwrap`
方法来避免手写 `match`。

要注意的是，无论是 `Option` 还是 `Result`，它们更像是一种约定，而不是机制。假
设你是 API 的提供者，你当然也可以按你自己喜欢的方式返回错误。而关于 `Option`
和 `Result`，重要的是标准库的所有函数都遵守这样的约定，也因此对它们的支持相比
你自定义的类型要丰富，这也是我们最好遵守这种约定的主要原因。

## 错误传递

上面说了半天，其实依旧没有提及如何表示“错误”本身。无论是 `Option` 还是
`Result` 其实都只是“包裹”错误的容器罢了。那么什么才是“错误”呢？

上节其实提到了，在 `Result` 中，“错误”其实可以是任意类型。但下文我们会提到，
rust 定义了一个 trait: `Error`。而之所以需要这个定义，是因为我们在错误传递上
遇到了问题。

想像一下，当你调用某个函数时，你不在乎它们会产生什么错误，无论错误是什么，你只
想把它们往外丢，就像异常处理里的 `throw` 一样。考虑 [下面例子](https://doc.rust-lang.org/book/error-handling.html#the-limits-of-combinators) ，

```rust
use std::fs::File;
use std::io::Read;
use std::path::Path;

fn file_double<P: AsRef<Path>>(file_path: P) -> i32 {
    let mut file = File::open(file_path).unwrap(); // error 1
    let mut contents = String::new();
    file.read_to_string(&mut contents).unwrap(); // error 2
    let n: i32 = contents.trim().parse().unwrap(); // error 3
    2 * n
}

fn main() {
    let doubled = file_double("foobar");
    println!("{}", doubled);
}
```

第一个遇到的问题就是：调用的函数会返回不同类型的错误，如果我们要抛出错误，要将
它们定义成什么类型？眉头一皱，计上心头。定义成 `String` 不就行了？于是我们将
代码改写成：


```rust
fn file_double<P: AsRef<Path>>(file_path: P) -> Result<i32, String> {
    let mut file = match File::open(file_path) {
        Ok(file) => file,
        Err(err) => return Err(err.to_string()),
    };
    let mut contents = String::new();
    if let Err(err) = file.read_to_string(&mut contents) {
        return Err(err.to_string());
    }
    let n: i32 = match contents.trim().parse() {
        Ok(n) => n,
        Err(err) => return Err(err.to_string()),
    };
    Ok(2 * n)
}
```

可以看到，我们手工地将各种错误通过 `err.to_string()` 转成 `String` 类型并返
回。回想一下我们的初衷，就是在 `file_double` 中我们不想处理调用子函数时产生的
任何错误，我们认为应该让调用者处理，可由于返回值要统一，因此我们把它转换成
`String` 类型后再返回。

第二个问题是：我们手写了许多的 `match` 语句来解构返回值，浪费时间，降低代码的
可读性，这个问题可以通过写一个宏来解决。

## try! 宏

为了解决上节的第二个问题，我们定义了一个宏，命名为 `try!`，如下：

```rust
macro_rules! try {
    ($e:expr) => (match $e {
        Ok(val) => val,
        Err(err) => return Err(err),
    });
}
```

有了它，上节的代码就可以写成：

```rust
fn file_double<P: AsRef<Path>>(file_path: P) -> Result<i32, String> {
    let mut file = try!(File::open(file_path).map_err(|e| e.to_string()));
    let mut contents = String::new();
    try!(file.read_to_string(&mut contents).map_err(|e| e.to_string()));
    let n = try!(contents.trim().parse::<i32>().map_err(|e| e.to_string()));
    Ok(2 * n)
}
```

其中的 `.map_err(|e| e.to_string())` 做的是将 `err` 转成 `String` 类型。可以看
到，代码一下简短了许多。然而我们写了许多 `.map_err(..)` 来转换类型也着实丑陋，
下面就来解决这个问题。

## Error Trait

把错误转换成 `String` 返回有一个不足，就是我们失去了错误原本的类型信息，不利于
函数的调用者再针对错误的类型做不同的处理。于是 Rust 为我们定了一个统一的类型来
表示错误：

```rust
use std::fmt::{Debug, Display};

trait Error: Debug + Display {
  /// A short description of the error.
  fn description(&self) -> &str;

  /// The lower level cause of this error, if any.
  fn cause(&self) -> Option<&Error> { None }
}
```

如果所有的错误全都实现了 `Error` trait，则我们很容易就能创建自己的错误类型，
目的则是统一函数里会发生的错误，继续上节的例子，我们首先定义自己的类型：

```rust
use std::io;
use std::num;

// We derive `Debug` because all types should probably derive `Debug`.
// This gives us a reasonable human readable description of `CliError` values.
#[derive(Debug)]
enum CliError {
    Io(io::Error),
    Parse(num::ParseIntError),
}
```

- `File::open(file_path)` 会返回 `io::Error` 类型，通过 `CliError::Io` 可以转
  换成 `CliError`
- `file.read_to_string` 与 `File::open` 类似，也返回 `io::Error` 的错误。
- `String::parse` 则返回的是 `num::ParseIntError` 类型，能通过
  `CliError::Parse` 转换成 `CliError` 类型。

当然，为了保证与其它类型的兼容性，我们也需要为 `CliError` 实现 `Error` triat：

```rust
use std::error;
use std::fmt;

impl fmt::Display for CliError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match *self {
            // Both underlying errors already impl `Display`, so we defer to
            // their implementations.
            CliError::Io(ref err) => write!(f, "IO error: {}", err),
            CliError::Parse(ref err) => write!(f, "Parse error: {}", err),
        }
    }
}

impl error::Error for CliError {
    fn description(&self) -> &str {
        // Both underlying errors already impl `Error`, so we defer to their
        // implementations.
        match *self {
            CliError::Io(ref err) => err.description(),
            CliError::Parse(ref err) => err.description(),
        }
    }

    fn cause(&self) -> Option<&error::Error> {
        match *self {
            // N.B. Both of these implicitly cast `err` from their concrete
            // types (either `&io::Error` or `&num::ParseIntError`)
            // to a trait object `&Error`. This works because both error types
            // implement `Error`.
            CliError::Io(ref err) => Some(err),
            CliError::Parse(ref err) => Some(err),
        }
    }
}
```

可见，只要每个错误类型都实现了 `Error` trait，则很容易通过建立新的自定义类型来
统一错误类型。

## From trait

`Error` trait 虽然统一了错误类型，但我们依旧要写一堆 `.map_err(...)` 来转换类
型，有没有什么更好的方法呢？rust 定义了一个通用的 triat 用于转换类型：

```rust
trait From<T> {
    fn from(T) -> Self;
}
```

再次重申，有点类型于 Java 中的 `interface`，`trait` 只是一种“约定”，而约定之所
以有用，是因为 rust 的标准库都遵守了这个约定。如 `From` 要求类型实现从其它类型
的转换函数，例如你可以做下面的操作：

```rust
let string: String = From::from("foo");
let bytes: Vec<u8> = From::from("foo");
let cow: ::std::borrow::Cow<str> = From::from("foo");
```

这是因为标准库中的 `String` 类型已经实现了 `From<&str>`，另外几个也类似。

那么为什么上节中我们自定义的错误类型要实现 `Error` trait 呢？其中一个重要原因
是标准库已经为 `Box<Error>` 实现了 `From` trait：

```rust
impl<'a, E: Error + 'a> From<E> for Box<Error + 'a>
```

也因此我们可以用 `From::from` 来进行错误类型间的转换如下：

```rust
// We have to jump through some hoops to actually get error values.
let io_err: io::Error = io::Error::last_os_error();
let parse_err: num::ParseIntError = "not a number".parse::<i32>().unwrap_err();

// OK, here are the conversions.
let err1: Box<Error> = From::from(io_err);
let err2: Box<Error> = From::from(parse_err);
```

因此，有了 `Error` 和 `From` 两个 trait 及标准库对两个 trait 的实现，`try!` 宏
的真正实现方式就进化了：

```rust
macro_rules! try {
    ($e:expr) => (match $e {
        Ok(val) => val,
        Err(err) => return Err(::std::convert::From::from(err)),
    });
}
```

有了这两个工具，我们就可以：

1. 不定义自己的类型，而直接使用 `Box<Error>` 来统一错误类型。
2. 用 `try!` 宏来传递错误。

```rust
fn file_double<P: AsRef<Path>>(file_path: P) -> Result<i32, Box<Error>> {
    let mut file = try!(File::open(file_path));
    let mut contents = String::new();
    try!(file.read_to_string(&mut contents));
    let n = try!(contents.trim().parse::<i32>());
    Ok(2 * n)
}
```

完美！并且，在 rust 1.13 中加入了 `?` 操作符，用来替代 `try!` 因此可以这么写：

```rust
fn file_double<P: AsRef<Path>>(file_path: P) -> Result<i32, Box<Error>> {
    let mut file = File::open(file_path)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    let n = contents.trim().parse::<i32>()?;
    Ok(2 * n)
}
```

## 统一自定义错误类型

最后一个大问题是自定义错误类型。有了 `From` trait 之后，我们可以轻易地将任意
实现了 `Error` trait 的错误转换成 `Box<Error>`，但如果我们要返回的不是
`Box<Error>` 而是自定义错误，那要怎么办呢？答案也很简单，为可能出现的错误实现
`From` trait。

上几节的例子中，可能出现的错误为 `io::Error` 和 `num::ParseIntError`，因此我们
需要为 `CliError` 实现 `From<io::Error>` 和 `From<num::ParseIntError>`。如下：

```rust
use std::io;
use std::num;

impl From<io::Error> for CliError {
    fn from(err: io::Error) -> CliError {
        CliError::Io(err)
    }
}

impl From<num::ParseIntError> for CliError {
    fn from(err: num::ParseIntError) -> CliError {
        CliError::Parse(err)
    }
}
```

有了上述的实现，我们就可以写出如下代码：

```rust
fn file_double<P: AsRef<Path>>(file_path: P) -> Result<i32, CliError> {
    let mut file = try!(File::open(file_path));
    let mut contents = String::new();
    try!(file.read_to_string(&mut contents));
    let n: i32 = try!(contents.trim().parse());
    Ok(2 * n)
}
```

终于搞定了！

## 如何处理错误？

综上，在 rust 语言中，处理错误有几种方式：

对于函数的作者而言，返回值可以是：

1. 正常的值，即 `i32`, `String` 等等，表明该函数不可能发生错误。
2. 返回 `Option` 表示函数可能会失败。
3. 不自定义错误。返回 `Result<..., Box<Error>>` 。
4. 返回自定义错误，如上例中的 `Result<i32, CliError>`。

而当函数 `A` 调用的子函数 `B` 返回错误时，有几种处理的方式：

1. 不处理错误。即调用 `unwrap` 来获取返回数据。
2. 在函数 `A` 内部处理。即通过 `match` 语句或 `unwrap_or` 等函数来处理返回值可能包
   含错误的情况。
3. 当函数 `A` 返回值为 `Result` 且 `B` 的返回值也为 `Result` 时，可以通过
   `try!(B())` 来获得 `B` 的返回值。而若返回值为 `Err` 时，`try!` 会自动退出
   函数 `A` 并将错误进行处理后返回。

最后，当函数的作用决定自定义错误类型（如 `CliError`）时，需要做几项操作：

1. 实现 `Error` trait。即实现 `description` 和 `cause` 函数，来提供错误的内
   容。
2. 为可能发生的错误实现 `From` trait。如上文中 `CliError` 实现了
   `From<io::Error>` 和 `From<num::ParseIntError>`。

上述两项工作完成后就可以放心地使用 `try!` 来获取子函数返回值的内容了。


## 小结

本文首先区别介绍了“返回错误”和“异常处理”的区别。Rust 选择了“返回错误”的道路，
本文也因此介绍了它面临了几个问题：

1. 如何表示返回值有错误？Rust 提供了 `Option` 与 `Result` 这两个“容器”来满足不
   同需求。
2. 调用不同子函数可能返回不同错误类型，于是使用 `Error` trait 来统一类型。
3. 解构返回值需要写大量 `match` 语句，Rust 引入宏 `try!` 来减少工作量。
4. 不同错误类型间的转换需要写很多代码，Rust 引入 `From` trait 来减少程序员的
   输入。

最后，若用户需要自定义错误类型，它需要同时实现 `Error` 与 `From` 两个 trait.

与其它语言对比，rust 的错误处理是相当地复杂。其中的重要原因是它更像是一种高层
的约定，而非语言层面的机制，换句话说，你用其它的语言也能实现类似的功能。

由于我写过的 rust 程序都不大，并且没有写过库，因此对这套错误处理方式的优点并不
是特别“感同深受”，也许它更适合大型程序的开发吧。

## Reference

- http://blog.honeypot.io/errors-and-exceptions-in-rust/ : Rust 处理错误异常的
  方式，介绍了不同语言处理异常的方式。
- https://news.ycombinator.com/item?id=9545647 : 关于 rust 为何不采用“异常处
  理”的讨论。
- http://www.infoq.com/cn/news/2012/11/go-error-handle : Go语言的错误处理机制
  引发争议。
