title: Percona 线程池行为验证
toc: true
date: 2023-05-26 15:56:15
tags: [case study, mysql, percona, thread pool]
categories: [Notes]
---

## 背景

看到 plantegg 大佬的文章 [MySQL线程池导致的延时卡顿排查](https://plantegg.github.io/2020/11/17/MySQL线程池导致的延时卡顿排查/)
中提到 MySQL 线程池中 oversubscribe 的行为。
也看到有小伙伴[wych42](https://github.com/wych42)在[尝试复现](https://gist.github.com/wych42/87df731da394a14d926c87f51fa9469d)文章里提到的现象。

自己也尝试复现（基于 Percona 8.0.29-21），但现象和 wych42 的结果有细节上的差异，
引申发现自己对 Percona 线程池模型的理解有问题，记录一下。

## 假想的 oversubscribe 模型

我们知道 oversubscribe 是用来限制 thread group 内同时运行的线程数量的，于是猜
想工作原理（类比 Java 中的 `ThreadPoolExecutor`，oversubscribe 类比
`corePoolSize`）：

1. 由 thread group 中的 listener 线程将任务从网络连接挪到 thread group 中的队列
2. 在需要时创建若干个 worker 来消费队列，此时如果数量超过 oversubscribe 则停止创建
3. worker 在空闲若干时间后退出

## 差异一：耗时不稳定

仿照在 wych42 的 [执行方案一](https://gist.github.com/wych42/87df731da394a14d926c87f51fa9469d#执行方案-1)中，设置如下：

```
| thread_handling                         | pool-of-threads |
| thread_pool_high_prio_mode              | transactions    |
| thread_pool_high_prio_tickets           | 4294967295      |
| thread_pool_idle_timeout                | 60              |
| thread_pool_max_threads                 | 100000          |
| thread_pool_oversubscribe               | 1               |
| thread_pool_size                        | 1               |
| thread_pool_stall_limit                 | 500             |
```

- 执行SQL `select sleep(2)`
- 执行并发：`8`

按前一节的假想模型，预期 thread group 每次有 2 个线程执行(1+oversubscribe)，结
果是每批次 2 个 SQL 输出，耗时分别是 2s, 4s, 6s, 8s。

实测发现并不总是符合预期，各种情况都有，比如会有两批次就跑完的(4 个SQL 2s 加上
2 个 SQL 4s）：

```text fold:true
16:05:08.765+08:00: thread 0 iteration 1 start
16:05:08.765+08:00: thread 7 iteration 1 start
16:05:08.765+08:00: thread 3 iteration 1 start
16:05:08.765+08:00: thread 4 iteration 1 start
16:05:08.765+08:00: thread 1 iteration 1 start
16:05:08.765+08:00: thread 5 iteration 1 start
16:05:08.766+08:00: thread 2 iteration 1 start
16:05:08.766+08:00: thread 6 iteration 1 start
16:05:10.985+08:00: thread 4 iteration 1 took 2220 ms
16:05:10.985+08:00: thread 0 iteration 1 took 2220 ms
16:05:10.985+08:00: thread 3 iteration 1 took 2220 ms
16:05:11.029+08:00: thread 5 iteration 1 took 2264 ms
16:05:11.029+08:00: thread 7 iteration 1 took 2264 ms
16:05:13.080+08:00: thread 6 iteration 1 took 4313 ms
16:05:13.080+08:00: thread 1 iteration 1 took 4314 ms
16:05:13.085+08:00: thread 2 iteration 1 took 4320 ms
16:05:13.086+08:00: thread 2 iteration 2 start
16:05:13.086+08:00: thread 6 iteration 2 start
16:05:13.086+08:00: thread 5 iteration 2 start
16:05:13.086+08:00: thread 3 iteration 2 start
16:05:13.086+08:00: thread 1 iteration 2 start
16:05:13.086+08:00: thread 4 iteration 2 start
16:05:13.086+08:00: thread 0 iteration 2 start
16:05:13.086+08:00: thread 7 iteration 2 start
16:05:15.167+08:00: thread 6 iteration 2 took 2081 ms
16:05:15.167+08:00: thread 1 iteration 2 took 2081 ms
16:05:17.165+08:00: thread 2 iteration 2 took 4080 ms
16:05:17.165+08:00: thread 3 iteration 2 took 4079 ms
16:05:19.170+08:00: thread 5 iteration 2 took 6084 ms
16:05:19.170+08:00: thread 4 iteration 2 took 6084 ms
16:05:21.164+08:00: thread 0 iteration 2 took 8078 ms
16:05:21.164+08:00: thread 7 iteration 2 took 8078 ms
16:05:21.165+08:00: thread 1 iteration 3 start
16:05:21.165+08:00: thread 4 iteration 3 start
16:05:21.165+08:00: thread 7 iteration 3 start
16:05:21.165+08:00: thread 2 iteration 3 start
16:05:21.165+08:00: thread 3 iteration 3 start
16:05:21.165+08:00: thread 6 iteration 3 start
16:05:21.165+08:00: thread 5 iteration 3 start
16:05:21.165+08:00: thread 0 iteration 3 start
16:05:23.252+08:00: thread 6 iteration 3 took 2087 ms
16:05:23.252+08:00: thread 7 iteration 3 took 2087 ms
16:05:25.271+08:00: thread 2 iteration 3 took 4106 ms
16:05:25.271+08:00: thread 4 iteration 3 took 4106 ms
16:05:27.252+08:00: thread 3 iteration 3 took 6087 ms
16:05:27.251+08:00: thread 1 iteration 3 took 6086 ms
16:05:29.243+08:00: thread 0 iteration 3 took 8078 ms
16:05:29.243+08:00: thread 5 iteration 3 took 8078 ms
16:05:29.244+08:00: thread 5 iteration 4 start
16:05:29.244+08:00: thread 2 iteration 4 start
16:05:29.244+08:00: thread 6 iteration 4 start
16:05:29.244+08:00: thread 7 iteration 4 start
16:05:29.244+08:00: thread 4 iteration 4 start
16:05:29.244+08:00: thread 1 iteration 4 start
16:05:29.244+08:00: thread 3 iteration 4 start
16:05:29.244+08:00: thread 0 iteration 4 start
16:05:31.342+08:00: thread 7 iteration 4 took 2098 ms
16:05:31.343+08:00: thread 5 iteration 4 took 2099 ms
16:05:33.324+08:00: thread 2 iteration 4 took 4080 ms
16:05:33.324+08:00: thread 1 iteration 4 took 4080 ms
16:05:33.411+08:00: thread 3 iteration 4 took 4167 ms
16:05:33.417+08:00: thread 6 iteration 4 took 4173 ms
16:05:35.424+08:00: thread 0 iteration 4 took 6180 ms
16:05:35.424+08:00: thread 4 iteration 4 took 6180 ms
```

这说明要么是我们的假想模型有问题，要么是 Percona 实现有 BUG。那实际情况是怎么
样的呢？拉代码看半天也看不出所以然，只能自行编译并加了很多 debug 日志，大概是
明白了。

## Percona thread group 模型

这里只说明 thread group 内的机制（不考虑全局的限制）。

1. 线程有两种状态：active & waiting，执行 SQL 过程中阻塞则记为 waiting，如等锁
   或 SLEEP
2. 线程的角色分成 listener 和 worker。listener 将网络上的请求挪到队列中，
   worker 从队列中获取任务来执行。一些情况下 listener 会自己变成worker 执行任
   务，worker 发现没有 listener 时也会变成 listener
3. 每个 group 内部有两个队列，高优队列和低优队列。如默认模式下，处于 XA 事务、
   持有表锁等情形下会被认为高优[^ref-high-prio]
4. thread_pool_oversubscribe 用来限制同时运行的线程数量，它是通过限制从队列获
   取任务来达到目的：
    1. active 线程数 >= 1 + oversubscribe 时 worker 不取任务，直接休眠，取任务
       时额外考虑下面规则
    2. active + waiting 线程数 > 1 + oversubscribe 时 worker 不取任务，但只限
       制低优队列中的任务
5. 为了防止各种假死的情况，会有专门的定时线程，检测两次执行间是否有进展，如果
   没有进展则会创建新的 worker（且此时规则 4.1 失效）。如 listener 变成 worker
   后创建新的线程承担工作
6. worker 线程在空闲一段时间(`thread_pool_idle_timeout`)后会退出

[^ref-high-prio]: 参考 [connection_is_high_prio](https://github.com/percona/percona-server/blob/8.0/sql/threadpool_unix.cc#L390)
  中定义了各种条件。除了要满足条件，Percona 会给每个 connection 发放 N 个高优
  的 ticket，只有ticket 有剩余，其中的 SQL 才会认为是高优。另外除了默认的
  transactions 模式，还有 statement 模式，则每个 statement 都认为是高优。

有几个推论：
1. thread group 的线程数可能大于 1+oversubscribe。没有机制限制线程的生成
2. 同时运行的任务可能会大于 1+oversubscribe。一方面 listener 变成 worker 时接
   任务不通过队列，因此不受限制；另一方面 waiting 的任务不参与计算规则 4.1；再
   者高优任务不参与计算规则 4.2.
3. 即使允许执行，任务的开始时间也可能会有延迟。如当前 listener 在干活，新任务
   只能等定时任务生成新的 worker 来执行，运气差的，延时可能会接近
   `2*thread_pool_stall_limit`。

## 差异一解释

结合更新后的模型以及实际的 debug 日志，差异一解释如下：

1. `SELECT SLEEP` 语句在执行时，线程会变成 waiting 状态 
2. 由于 active 线程为 0, 很多代码位置上会尝试创建新的线程
3. 新的 worker 线程由于规则 4.2 的限制会取不到任务，进入休眠
4. 但由于某些时刻所有线程都在做任务，没有 listener，此时 worker 不休眠，而进入
   listener 模式
5. 进入 listener 模式的的线程在一些情况（发现有新任务且已有的队列为空）下会决定自己执行任务
6. 当 listener 决定自己执行任务，它会直接从网络连接中获取任务而不经过任务队列，
   因此不受限制
7. listener 开始执行任务时变成 worker 角色，有可能重新触发情况 #4

## 差异一补充 case：高优队列不受规则 4.2 限制

已知锁表能让事务成为高优，我们把负载改成两句 SQL：

```
LOCK TABLES t? READ ; 这里每个线程锁不同的表
SELECT SLEEP(2)
```

测试的结果如下，可以看到在第一个迭代中创建了 N 个 worker，第二个迭代中每个
worker 都实际执行了任务，因此结果只有一个批次，都是 2s 左右。

```text fold:true
11:47:36.251+08:00: thread 0 iteration 0 start
11:47:36.251+08:00: thread 7 iteration 0 start
11:47:36.251+08:00: thread 5 iteration 0 start
11:47:36.251+08:00: thread 2 iteration 0 start
11:47:36.251+08:00: thread 1 iteration 0 start
11:47:36.251+08:00: thread 6 iteration 0 start
11:47:36.251+08:00: thread 4 iteration 0 start
11:47:36.251+08:00: thread 3 iteration 0 start
11:47:39.059+08:00: thread 0 iteration 0 took 2808 ms
11:47:39.162+08:00: thread 5 iteration 0 took 2911 ms
11:47:39.425+08:00: thread 7 iteration 0 took 3174 ms
11:47:41.282+08:00: thread 1 iteration 0 took 5031 ms
11:47:41.352+08:00: thread 6 iteration 0 took 5101 ms
11:47:41.463+08:00: thread 2 iteration 0 took 5212 ms
11:47:41.613+08:00: thread 4 iteration 0 took 5362 ms
11:47:43.532+08:00: thread 3 iteration 0 took 7281 ms
11:47:43.533+08:00: thread 3 iteration 1 start
11:47:43.533+08:00: thread 5 iteration 1 start
11:47:43.533+08:00: thread 7 iteration 1 start
11:47:43.533+08:00: thread 0 iteration 1 start
11:47:43.533+08:00: thread 2 iteration 1 start
11:47:43.533+08:00: thread 4 iteration 1 start
11:47:43.533+08:00: thread 1 iteration 1 start
11:47:43.533+08:00: thread 6 iteration 1 start
11:47:45.727+08:00: thread 3 iteration 1 took 2194 ms
11:47:45.751+08:00: thread 7 iteration 1 took 2218 ms
11:47:45.751+08:00: thread 2 iteration 1 took 2218 ms
11:47:45.751+08:00: thread 4 iteration 1 took 2218 ms
11:47:45.755+08:00: thread 5 iteration 1 took 2222 ms
11:47:45.756+08:00: thread 1 iteration 1 took 2223 ms
11:47:45.760+08:00: thread 0 iteration 1 took 2227 ms
11:47:45.765+08:00: thread 6 iteration 1 took 2232 ms
```

## 差异二：SELECT SLEEP 可能不是好负载

通过源码我们知道执行 SLEEP 的线程是 waiting 状态，会绕过某些 oversubscribe 的
限制。我们尝试使用下面的负载：

```
MySQL> select benchmark(9999999, md5('when will it end?'));
1 row in set
Time: 2.079s
```

测试的结果就更看不出“批次”的模式了。当然由于多个任务并行执行，实际的耗时也增加
了（3.8s）。

```
16:58:01.905+08:00: thread 2 iteration 0 start
16:58:01.905+08:00: thread 6 iteration 0 start
16:58:01.905+08:00: thread 1 iteration 0 start
16:58:01.905+08:00: thread 4 iteration 0 start
16:58:01.905+08:00: thread 7 iteration 0 start
16:58:01.905+08:00: thread 5 iteration 0 start
16:58:01.905+08:00: thread 3 iteration 0 start
16:58:01.905+08:00: thread 0 iteration 0 start
16:58:05.757+08:00: thread 0 iteration 0 took 3852 ms
16:58:06.679+08:00: thread 5 iteration 0 took 4774 ms
16:58:08.376+08:00: thread 1 iteration 0 took 6471 ms
16:58:10.425+08:00: thread 2 iteration 0 took 8520 ms
16:58:11.620+08:00: thread 6 iteration 0 took 9715 ms
16:58:13.604+08:00: thread 4 iteration 0 took 11699 ms
16:58:14.413+08:00: thread 3 iteration 0 took 12508 ms
16:58:16.843+08:00: thread 7 iteration 0 took 14938 ms
```

但是，我们预期仍是一个批次执行两个 SQL，为什么第二个请求 `4774ms` 才返回？下面
我们看看在 Percona 中增加的 debug 信息，来了解内部工作的机制

```
   time         thread id       message
   16:58:02.197 123145417097216 command: 3: select benchmark(9999999, md5('when will it end?'));
   16:58:02.206 4863544832 add connection(active: 1, waiting: 0, stalled: 0)
① 16:58:02.899 123145390891008 check_stall #1> wake_or_create(active: 1, waiting: 0, stalled: 0)
   16:58:02.899 123145390891008 wake or create thread
   16:58:02.899 123145390891008 thread waked (active: 1, waiting: 0, stalled: 0)
   16:58:02.899 123145418162176 get_event > after wakeup(active: 2, waiting: 0, stalled: 0)
② 16:58:02.899 123145418162176 get_event poll (active: 2, waiting: 0, stalled: 0, oversubscribed: 1)
   16:58:02.899 123145418162176 get_event current listener(0)
③ 16:58:02.899 123145418162176 get_event become listener(active: 1, waiting: 0, stalled: 0)
   16:58:02.899 123145418162176 get_event become listener get lock(active: 1, waiting: 0, stalled: 0)
   16:58:02.899 123145418162176 listener #0(active: 1, waiting: 0, stalled: 0)
④ 16:58:03.402 123145390891008 check_stall #2> wake_or_create(active: 1, waiting: 0, stalled: 1)
   16:58:03.402 123145390891008 wake or create thread
   16:58:03.402 123145390891008 waked failed (active: 1, waiting: 0, stalled: 1)
   16:58:03.402 123145390891008 throttle create worker #2(active: 1, waiting: 0, stalled: 1)
   16:58:03.402 123145390891008 create worker called(active: 1, waiting: 0, stalled: 1)
   16:58:03.402 123145419227136 worker main start (active: 2, waiting: 0, stalled: 1)
   16:58:03.402 123145419227136 get_event start (active: 2, waiting: 0, stalled: 1)
   16:58:03.402 123145419227136 get_event poll (active: 2, waiting: 0, stalled: 1, oversubscribed: 0)
⑤ 16:58:03.402 123145419227136 queue_get #0 (active: 2, waiting: 0, stalled: 1, toomany: 0)
   16:58:03.402 123145419227136 queue_get #2 (active: 2, waiting: 0, stalled: 1)
   16:58:03.402 123145419227136 get_event connection = 8c148620(active: 2, waiting: 0, stalled: 1, oversubscribed: 0)
   16:58:03.402 123145419227136 get_event end (active: 2, waiting: 0, stalled: 1)
⑥ 16:58:03.402 123145419227136 command: 3: select benchmark(9999999, md5('when will it end?'));
```

- 由于第一个 listener 线程执行了第一个任务，① 处 check stall 线程触发，尝试创建
  一个新的 worker。
- 在 ② 处，该 worker 尝试获取任务，但因为此时 active 为 2 (`>=
  1+oversubscribed=2`），触发了限制，因此从队列中获取不到任务。
- 接着 ③ 中，worker 发现当前没有 listener，于是自己成为 listener，但此时网络上没
  有数据，进入休眠。
- ④ 中 check stall 第二次唤醒，发现有 listener，但队列不为空，于是尝试唤醒或新建
  线程。此时没有 waiting 中的线程，于是创建新的线程。
- ⑤ 中新建的线程从队列中获取任务，虽然当前 oversubscribed，但由于状态是 stalled，
  于是不受规则 4.1 限制，而此时 (`active+waiting = 2 <= 1+oversubscribed=2`)，
  也不受规则 4.2 限制，于是获取任务并执行。看到 ⑥ 中执行命令，此时距离接受到命
  令过去了 1s+，也因此整个请求是 4s+。

这个例子给出两个信息：
1. waiting 和 active 的负载对 thread group 调度来说是有差异的
2. 由于创建线程的滞后性（由 check stall 定时线程），任务执行会有延迟，且延迟不低

## 能不能简化？

Percona 实际的线程模型显然没有我们假想模型简单，那能不能简化呢？

例如为什么不用全职 listener，listener 完成不参与执行任务？这是因为直接让
listener 处理任务效率更高，listener 刚从等待网络中被唤醒，不需要从再唤醒一个
worker，减少线程切换。但 listener 擅离职守会造成后续任务的延时，因此 listener
一方面只在当前任务队列为空时才转为 worker，另一方面有定时的check_stall 线程来
保底。但如差异二中看到的，还是会造成任务执行的延时[^ref-listener]。

[^ref-listener]: 参考原代码的注释 https://github.com/percona/percona-server/blob/8.0/sql/threadpool_unix.cc#L656

再例如能不能只用一个 queue？早期的实现其实就没有区分高优低优队列，Percona 后来
实现优先队列是为了缩短服务端内部的 XA 事务[^ref-priority-queue]。对表锁的高优
操作也是后来才添加的。

[^ref-priority-queue]: [这个 commit](https://github.com/percona/percona-server/commit/5be2144799ced62217f252b0cb0dd9917784e868)
  提到目标是 "minimize the number of open transactions in the server"，结合代
  码看到 open transactions 指的是 XA 的事务。

还有为什么不在创建线程时就限制总数不能超过 oversubscribed？（以下是猜想）
oversubscribe 从设计来看**不应该**是一个硬限制，它要达到的目的是在全局限制线程
数的前提下，防止某个 thread group 疯狂创建吃掉所有限额，造成其它 group 创建不
了线程的情况。但是适当允许某个 group 创建超过 oversubscribe 的线程数是有助于提
高整体效率的。而且绝对限死线程数也更可能造成 group 内的死锁，保持弹性能应对更
多异常的情况。

## 参考

- [Percona thread pool](https://docs.percona.com/percona-server/8.0/performance/threadpool.html) 对 threadpool 的行为有一些说明，但并不是很全面
- 添加 debug 信息的源码文件，有兴趣的可以自己编译验证
    - {% asset_link threadpool_unix.cc %} 
    - {% asset_link sql_parse.cc %} 
- [MySQL 线程组实现文档](https://mariadb.com/kb/en/thread-groups-in-the-unix-implementation-of-the-thread-pool/) oversubscribed 实现不同，但其它的如线程创建方面可以参考

另外关于 Percona 线程机制的描述一搜一大把，可以结合本文案例理解。
