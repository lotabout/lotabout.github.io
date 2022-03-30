title: 异步编程（async）底层实现机制
toc: true
date: 2022-03-27 21:08:35
tags: [python, async, coroutine, rust]
categories: [Notes]
---

本文主要梳理 Rust 和 Python 的 async 实现中涉及的一些通用概念和实现机制。头脑
中储备一些异步编程底层的实现原理，可以帮助我们更好地掌握异步编程。

## 协程：可暂停可恢复

正常函数调用的控制流是“单入单出”，从调用开始，正常或异常返回后结束，调用的栈帧
也随之销毁。而异步编程要求在函数执行到一半时，“暂停”控制流，在未来的某个时刻再
“恢复”。由于控制流尚未结束，因此调用链路上的栈帧还不能被销毁，这些信息需要以某
种形式保存。可暂停可恢复的控制流，加上它所保存的信息，就可以称为“协程”。


### 栈帧（Stack Frame）

函数调用过程中使用的临时变量会记录到栈上，这些信息是与某个函数的某次调用绑定的，
调用结束后就被废弃，这些数据就是栈帧。物理形态上，通常栈帧是“叠”在一起的，例如
函数 A 中调用了函数 B，而 B 又调用了 C，则在 C 运行中，栈的状态类似下图：

```
|    ...     |
| Frame of C |
+------------+
| Frame of B |
+------------+
| Frame of A |
+------------+
```

### Python 记录栈帧

Python coroutine[^python-coroutine] 的处理方式是直接保存栈帧。调用的最内层通过 `yield`
暂停控制流，中间层通过 `yield from` 或 `await`[^python-await] 将内层的
coroutine 一路往外传，需要恢复时，再使用 `send` 方法恢复执行[^python-generator-send]：

[^python-coroutine]: Python 的 coroutine 和 generator 基本是同一套实现机制，本文里有时会混用两个术语
[^python-await]: 如果用 await 则要求内层调用实现了 `__await__` 方法
[^python-generator-send]: ref: https://peps.python.org/pep-0342/#new-generator-method-send-value

```python
def inner():
    print('pause inner')
    yield
    print('resumed inner')
    return 10

def middle():
    print('pause middle')
    value = (yield from inner())
    print('resumed middle')
    return value * 2

coro = middle()   # 因为 yield from 的机制，coro 指向 inner 的状态
coro.send(None)
# pause middle
# pause inner

x.send(None)      # 可以看到是从 inner 开始恢复的
# resumed inner
# resumed middle
# ---------------------------------------------------------------------------
# StopIteration                             Traceback (most recent call last)
# <ipython-input-19-9cc02a983a52> in <module>
# ----> 1 coro.send(None)
#
# StopIteration: 20
```

注意在 coroutine 中，最终的返回值是通过 `StopIteration` 带出来的。

此外，外层拿到的 `coro` 其实包含了最内层 `inner` 的栈帧（需要了解
[yield from](https://peps.python.org/pep-0380/) 的机制），因此第二次调用
`coro.send(None)` 时，会从 `inner` 函数 `yield` 处恢复执行。

### Rust 编译成状态机

对于缺少 GC 的语言来说，移动、复制栈帧是个原理可行，实际几乎不可行的操作。这些
语言里手工创建的指针，可以指向栈上分配的内存，指针还可能被其它线程引用。栈帧移
动时，这些指针都需要“修复”；栈帧复制时，数据多了份引用，内存释放又成问题。

Rust 使用了“状态机”的方式来实现控制流的暂停、恢复的能力[^rust-async-await]。

[^rust-async-await]: 推荐看这篇文章：https://os.phil-opp.com/async-await/#the-async-await-pattern

首先是最内层的暂停逻辑，与 Python 不同，内层没有专门的暂停机制，只约定了接口，
如果（因为资源未就绪）要暂停，则返回一个特殊值（`Poll::Pending`），由调用方来
决定是否真的暂停和处理恢复。

```rust
pub trait Future {
    type Output;
    fn poll(self: Pin<&mut Self>, cx: &mut Context) -> Poll<Self::Output>;
}

pub enum Poll<T> {
    Ready(T),
    Pending,
}
```

Python 的中间层会通过 `yield from` 向外传递栈帧[^python-yield-from]，那 Rust
的中间层如何对外层提供暂停、恢复的能力呢？Rust 里提供了 `await` 关键词来表达等
待内层的 future[^future-manually]：

[^python-yield-from]: 这里说法不太准确，但不影响理解。`yield from` 只是把各个
  coroutine 连接在一起，不会真的返回栈帧
[^future-manually]: 在有 await 及编译器支持之前，基本是需要人肉做状态的保存和
  恢复的

```rust
fn inner1() -> impl Future<Output = u32> {
    future::ready(1) // 返回的是 Future 的一个具体实现，这里省略
}

fn inner2() -> impl Future<Output = u32> {
    future::ready(2)
}

async fn middle() -> usize {
    let x = inner1().await; // await 代表等待内层的 future
    let y = inner2().await;
    x + y
}
```

那么 `async/await` 底层发生了什么？Rust 编译器会做这么几件事：

1. 遇到 `async fn` 定义时，会把 `middle` 方法的返回改为 `Future<Output=...>`
2. 将代码逻辑以 `await` 为拆分点，拆成状态机的 N 个状态，每个状态存储下个
   await 可见的变量和 future
3. 将两个 await 之间的代码，转换成状态机的转移逻辑

上面的例子编译器会编译成类似下面的这些代码[^compiler-code-ref]：

[^compiler-code-ref]: 代码改编自 https://os.phil-opp.com/async-await/#the-async-await-pattern

```rust
// 状态存储
struct StartState {}
struct WaitingInner1State {
    inner1_future: impl Future<Output = usize>,
}
struct WaitingInner2State {
    x: usize,
    inner2_future: impl Future<Output = usize>,
}
struct EndState {}

// 状态机
enum StateMachine {
    Start(StartState),
    WaitingInner1(WaitingInner1State),
    WaitingInner2(WaitingInner2State),
    End(EndState),
}

// 转移逻辑
impl Future for StateMachine {
    type Output = usize; // return type of `middle`

    fn poll(self: Pin<&mut Self>, cx: &mut Context) -> Poll<Self::Output> {
        loop {
            match self { // TODO: handle pinning
                StateMachine::Start(state) => {         // 开始到第一个 await
                    inner1_future = inner1();
                    let state = WaitingInner1State {inner1_future};
                    *self = StateMachine::WaitingInner1(state);
                }
                StateMachine::WaitingInner1(state) => { // 第一个 await 到第二个 await
                    match state.inner1_future.poll(cx) => {
                        Poll::Pending => return Poll::Pending,
                        Poll::Ready(x) => {
                            inner2_future = inner1();
                            let state = WaitingInner2State {x, inner2_future};
                            *self = StateMachine::WaitingInner2(state);
                }}}
                StateMachine::WaitingInner2(state) => { // 第二个 await 到结束
                    match state.inner2_future.poll(cx) => {
                        Poll::Pending => return Poll::Pending,
                        Poll::Ready(y) => {
                            let ret = state.x + y;
                            *self = StateMachine::End(EndState);
                            return Poll::Ready(ret)
                }}}
                StateMachine::End(state) => {
                    panic!("poll called after Poll::Ready was returned");
                }
}}}}

// async def 编译成了返回 Future
fn middle() -> impl Future<Output = usize> {
    StateMachine::Start(StartState{})
}
```

可以看到中间层返回的 StateMachine 本身记录了内部调用的 Future 所处的状态。最外
层的调用方如果需要恢复执行，只需再调用 `middle` 返回 future 的 `poll` 方法即可，
`middle` 会根据当前状态决定去 `poll` 哪个内层 future。

## 轮询与中断/回调

异步编程的特征之一，是当资源未就绪时，先暂停当前控制流，先执行其它可推进的逻辑，
等资源就绪时，再恢复之前暂停的控制流。那什么时候才知道资源就绪呢？一般有两种方
法：轮询与中断。

### 轮询

轮询很好理解，就是外围调用方不断调用 `poll` 方法去查看当前资源的状态是否就绪：

```rust
future = middle();
loop {
    match future.poll() {
        Poll::Pending => {}
        Poll::Ready(ret_val) => {
            // 执行逻辑
}}}
```

但如果是这么做，资源未就绪前会不断执行 `future.poll`，浪费 CPU。此时空闲的 CPU
可以用来处理其它就绪的 future，于是可以把所有需要轮询的协程添加到一个队列里，
这样一个线程就可以处理 N 个协程。伪代码如下：

```rust
loop {
    future = waiting_queue.pop_front() // 队列存放所有 future
    match future.poll() {
        Poll::Pending => {
            waiting_queue.push_back(future)
        }
        Poll::Ready(ret_val) => {
            // ① 执行正常逻辑
        }}}
```

这会引申出一个问题：在 ① 中，如果 middle future 的结果就绪了，接下来需要执行哪
部分代码呢？显然需要从 future 暂停的地方接着执行（即 outer 的后续逻辑），但我
们怎么找到外层的逻辑？

一种想法是把外层逻辑也封装成一个 future[^outer-future]，队列里直接存放outer
future 而不是 middle future，恢复时只要执行 outer future 的 `poll`方法即可。这
就是**异步编程的传染性**，只要内部有一处异步，它的每个调用方都需要是异步的，一
直到顶层的 main 函数[^contagious]。

[^outer-future]: 这里的含义是 outer 方法也使用 `await` 来获取结果。
[^contagious]: 如果调用方自己不做成异步，则需要在代码里“同步”等待 future.poll
  返回 ready，或者等待统一轮询队列的就绪通知，无论如何，它所在的线程在内部的异
  步任务完成前是不会释放的，就达不到异步编程“节省线程”的目的了。

于是就像有多个线程一样，我们的队列里可以存放 N 个顶层的 future，可以类比成轮询
N 个 main 函数。这个不断从队列中获取新的协程并调用 `poll` 的角色在 Rust 里叫
executor[^executor-10x]。

[^executor-10x]: 文中只展示了简单的模型，executor 的实现可以相当复杂，参
  考 [Making the Tokio scheduler 10x faster](https://tokio.rs/blog/2019-10-scheduler)

```rust
loop {
    main_future = waiting_queue.pop_front()
    match main_future.poll() {
        Poll::Pending => {
            // ② 处理队列中的下一个
            waiting_queue.push_back(future)
        }
        Poll::Ready() => {
            // future 完成退出
        }}}
```

② 中的逻辑会不断把未就绪的 future 放入队列，这样每轮轮询时都会 poll 所有future，
这样依旧会浪费很多资源（CPU & IO），最理想的方式是每次 poll 时只poll 那些“很有
希望 ready”的 future。这就是我们下面要说的“中断”的模式，当资源就绪时，再把
future 加入队列。

### 中断与 waker

我们希望 future 只在资源就绪时才被重新放回队列[^poll-and-register]，于是
executor 需要提供如下方法（伪代码）：

[^poll-and-register]: 当 future 刚被创建时我们并不知道它是否就绪，此时也需要放
  入队列触发第一次 poll，在 poll 里如果资源未就绪，由 future 来注册后续的回调，
  因此当 future 第二次通过回调再被加入队列时，就“有信心”它依赖的资源就绪了。

```rust
let mut ready_queue = Queue::new();
let mut futures: HashMap<usize, RefCell<Future<Output=()>>> = HashMap::new();
let mut num: usize = 0;

// ① 监听 ready_queue 并对其中的元素进行 poll
fn run() {
    loop {
        let _ = ready_queue.pop_front().poll();
    }
}

// ② 提供方法监听新的 future，需要将其加入 ready_queue 进行首次 poll
fn add_future(future: RefCell<Future<Output=()>>) {
    ready_queue.push_back(future.clone())
    num += 1;
    futures.insert(num)
}

// ③ 提供机制在 future 就绪时将其加入 ready_queue 中，等待下次 poll
fn wake_up(n: usize) {
    let future = futures.remove(&n).unwrap();
    ready_queue.push_back(future);
}
```

现在的问题是：“谁”负责在“什么时候”调用 `wake_up` 方法？

先来看“谁”的问题，唤醒的条件是资源就绪，那必然是资源的拥有者来唤醒，而只有“最
内层”的协程才知道它等待的是什么资源，因此需要最内层的协程（通过注册回调函数）
来触发。但是 `wake_up` 唤醒的时候得唤醒最外层的协程，即上面伪代码的参数 `n`，
于是每次调用 poll 都需要把 `n` 一路下传到最内层：

```rust
fn run() {
    loop {
        let (future, index) = ready_queue.pop_front();
        future.poll(index);
    }
}
```

当然，伪代码里用 future 的序号 `n` 来唤醒外层 future 是一个实现细节。回过头来
看 rust `Future` 接口，它包含了一个 `Context` 的引用，`cx.waker()` 可以获得
“唤醒器”，再调用`wake` 方法即可唤醒对应的最外层的协程。与 `n` 一样，每次对
`poll` 的调用，都需要把 `cx` 一路下传到最内层。

```rust
pub trait Future {
    type Output;
    fn poll(self: Pin<&mut Self>, cx: &mut Context) -> Poll<Self::Output>;
}
```

另一个问题是“什么时候”调用，显然是“资源就绪”时。那怎么知道资源什么时候就绪？这
就需要资源的提供方来通知了。通常异步编程多是在处理 IO，对于 IO 一般是操作系统
通过 `select` 或者 `epoll` 等等机制提供了异步通知的能力。代码里需要在等待资源
时加上回调函数。整体逻辑如下图：

{% asset_img rust-async-process.svg Rust Async Process %}

其中的 reactor 会监听所有在等待的资源，如果某个资源就绪了，同步的 `poll` 会返
回就绪的资源，reactor 会调用它们的回调函数（即 `wake` 方法来唤醒）。Rust 里一
般把 executor 和 reactor 合起来称为 Runtime。

### Python 实现

前文的描述都是以 Rust 为样例，这是因为 Rust 里的角色分得相对更清楚一些。
像 executor 和 reactor 的能力，在 Python 里都囊括在
[event loop](https://github.com/python/cpython/blob/788154919c2d843a0a995994bf2aed2d074761ec/Lib/asyncio/events.py#L203)
里了，能监听什么资源，也被安排得明明白白了。

Python 里也经常用到
[Future](https://github.com/python/cpython/blob/788154919c2d843a0a995994bf2aed2d074761ec/Lib/asyncio/futures.py#L31)
，但它的概念和 Rust 里的不太一样，Python 中的 `Future` 本身是一个协程（实现了
[__await__](https://github.com/python/cpython/blob/788154919c2d843a0a995994bf2aed2d074761ec/Lib/asyncio/futures.py#L289)
方法），另外有一个 `set_result` 方法能设置最终结果，结果设置后，协
程就能正常返回了（类似Rust里返回 `Poll::Ready`）。

Python 里的一个典型协程工作流如下所示：

{% asset_img python-async-process.svg Python Async Process %}

图里包含了比较多的细节，整体逻辑和 Rust 类似，注意几点：

1. `inner` 注册监听事件时，Python 的做法是创建一个 future、注册事件，`await future`
2. 事件的注册最终都是调用 loop 的 API 来完成，也说明 Python 的 loop 包含了多个角色
3. 几乎所有的操作都是异步的，包括注册，也是通过 `loop.call_soon` 延迟执行的
4. `future.set_result` 之后，也是通过 `call_soon` 延迟唤醒协程
5. 唤醒后的协程，是直接从断点处恢复的（通过栈帧机制），与 Rust 不同
6. Event Loop 直接操作的是 `task` 而不是 `coroutine`，它是一个包装类，提供了取
   消、唤醒等功能

## 小结

异步编程的优势主要是节省线程数量（从而节省线程占用的栈等资源），也有说减少线程
切换来节省 CPU 消耗。但总的来说，异步的最大作用和目标是提高吞吐而非降低延时。

但是，异步编程的缺点也很明显，最关键的是它的“传染性”，只要有一处要异步，所有地
方都需要异步。另一个是“隔离性”，它的生态和同步的方法天然不通，一般为了支持异步，
几乎所有同步的标准库都需要重写一个异步版本的。我甚至认为如果“高吞吐”不是产品的
核心特性（如网关），就不应该使用异步框架。

本文尝试挖掘 Rust 和 Python 实现异步框架的模式，让我们对异步的底层实现建立一个
概念，希望借助这些概念，去理解、解决编程中遇到的异步相关问题。文章主要讲解了三
方面的内容：

1. 协程的核心是控制流的中断和恢复，Python 为代表的 GC 语言用的是存储栈帧的方式，
   而以 Rust 为代表的非 GC 语言使用了编译成状态机的方式。
2. 异步的优势想要体现，需要满足一个线程可以处理多个协程的能力。轮询的想法引导
   我们创建了 executor 处理协程队列的思路；中断的想法引导我们理清 reactor 的作
   用以及上下层需要传递的信息。
3. 最后是过程中列举了 Rust 和 Python 典型的协程工作流，可以从实现上相互印证两
   种具体的实现思路。但在编程的使用方来看二者的 API 又没有太大的差异。
