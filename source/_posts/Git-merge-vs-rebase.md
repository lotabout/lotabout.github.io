title: 'Git: merge vs rebase'
date: 2018-01-18 17:02:51
tags: [Git]
categories: Knowledge
toc: true
---

Merge 还是 Rebase，这是一个问题。网上有许多教程说明二者的区别，之前我写的一个
[关于 Git 的 PPT](https://docs.google.com/presentation/d/18b-ehlVjU82_PzU64lkbVwkzPsK3T2yENmjwwL7FVfM/edit)
里也说过两者的区别。这篇文章里，我们从分支图的角度，看看两种策略下产生的分支图
有什么区别。

## 理想的分支图

这里我们要说明的是， Git 是用来解决多人协作的代码管理，尽管也可以“单机”使用，
但它的一些优势或是缺点要在多人使用时才会显露出来。

现在假设我们独自开发一个产品，一个个往上加功能，那么最终的 git 分支图会像这
样：

```
│
M─┐ Merge branch 'feature-2'
│ o [feature-2] commit #3
│ o [feature-2] commit #2
│ o [feature-2] commit #1
M─┤ Merge branch 'feature-1'
│ o [feature-1] commit #4
│ o [feature-1] commit #3
│ o [feature-1] commit #2
│ o [feature-1] commit #1
I─┘ Initial commit
```

这里采用的是 [tig](https://github.com/jonas/tig) 的分支图符号。可以看到的是每
个功能都用了几个 commit，开发后合并到 `master` 分支中，再基于最新的代码继续开
发下一个功能。清晰明白。

但如果多个人一起开发，或者有多个并行开发的功能，那么事情就开始变复杂了。

## Merge

现在我们考虑多人开发多个 feature，那么最幸运的情况是像这样的：

```
M─────┐ Merge branch 'feature-2'
│     o [Feature-2] commit 2
│     o [Feature-2] commit 1
M───┐ │ Merge branch 'feature-2'
│   o │ [Feature-2] commit 2
│   o │ [Feature-2] commit 1
M─┐ │ │ Merge branch 'feature-1'
│ o │ │ [Feature-1] commit 2
│ o │ │ [Feature-1] commit 1
o─┴─┴─┘ base commit for all features
```

可以看到有多列，代表不同的 `feature` 分支，它们最终都合到 `master` 里。这就是
采用 merge 策略最常见的分支结构。一般同时开发的分支越多，列数越多。

上面这个图像是理想的并行版本，它要求所有 `feature` 基于同一个 commit，且每个
commit 的时间是线性的，所以现实中基本不可能满足这种情况。

如果每个 commit 的时间不同，分支的线就会开始交叉：

```
M─┐     Merge feature-1
M─│───┐ Merge feature-3
│ o   │ [1] Commit 2
│ │   o [3] Commit 2
M─│─┐ │ Merge feature-2
│ │ │ o [3] commit 1
│ │ o │ [2] commit 2
│ │ o │ [2] commit 1
│ o │ │ [1] commit 1
o─┴─┴─┘ base commit for all features
```

上面这个图追踪起来就比较麻烦了，如果考虑到 commit 数量多的话，情况就更糟糕了。
我们这里所有子分支是从同一个 base commit 开始的，如果各个分支的起始 commit 不
同，分支图就会变得特别乱了。

```
M─┐     merge feature-1
│ o     [1] commit 2
M─│───┐ merge feature-3
│ │   o [3] commit 2
M─│─┐ │ merge feature-2
│ │ o │ [2] commit 2
│ │ │ o [3] commit 1
│ │ o │ [2] commit 1
o─│─│─┘ base commit 2
│ o │   [1] commit 1
o─┴─┘   base commit 1
```

上面的救命图可能还相对容易看懂，这是因此 commit 数量少，分支数也少，另外各个
feature 分支上都没有 merge commit，否则会更复杂。

综上，在分支图上，merge 会导致分支图的列增多，且依据分支的初始 commit 不同及
commit 的时间不同，会使分支图有更多的交叉，导致历史难以追踪。

## rebase

其实大家使用 rebase 的一个重要特点是 rebase 能产生线性的分支历史。考虑这样一个
分支图：

```
(master)
│ (feature-1)
o │ c
│ o b
│ o a
o─┘
```

如果我们此时在 master 分支执行 `git merge feature-1`，则和之前 merge 一样，结
果会变成：

```
M─┐
o │ c
│ o b
│ o a
o─┘
```

但如果我们在 feature-1 上执行 `git rebase master`，则会产生下面的图形。注意的
是 rebase 是会产生新的 commit 的，`a` 变成了 `a'`，如果用 `git show` 看其中的
内容，可以发现虽然 commit message 相同，但 diff 已经是不同了。

```
(master)
│ (feature-1)
│ o b'
│ o a'
o─┘ c
o
```

可以看到，分支 `feature-1` 的初始 commit 变成了 `c`。这时候取决于 merge 的方
式，会有不同的效果。一是在 `master` 上执行 `git merge feature-1`，这时 git 会
判断可以 fast-forward；二是通过 gitlab 或 github 等提交 Merge/Pull request，它
们依旧会创建一个 Merge commit，如下：

```
local merge                 gitlab/github
(master, feature-1)         (master)
│                           M─┐ m
o b'                        │ o b'
o a'                        │ o a'
o c                         o─┘ c
o                           o
```

但注意到即使 gitlab 会创建新的 merge commit `m`，在 master 的 `c` 与 `m` 之间
也不会有任何“插队”的其它 commit。突出一个清晰明了。

这时考虑多个 feature 同时开发，大家在合并前都先 rebase 最新的代码，就能做成“线
性”的图形：

```
(master)           (master)           (master)              (master)
│ (feature-1)      │   (feature-2)    │ (feature-2)         │
│ │ (feature-2)    │   │              │ │                   M─┐ merge feature 2
│ │ │              │   o              │ o                   │ o
│ │ o   ====>      │   o    ====>     │ o        ====>      │ o
│ │ o              M─┐ │              M─┤                   M─┤ merge feature 1
│ o │              │ o │              │ o                   │ o
│ o │              │ o │              │ o                   │ o
o─┴─┘              o─┴─┘              o─┘                   o─┘

   (merge feature-1)   (rebase master)   (merge feature-2)
```

但在实际的团队开发中，要达到上面的要求需要“串行”提交代码，即上一个人的代码合并
之后，下一个人再 rebase 最新代码并提交新的 Merge/Pull request。这是不现实的。
经常的情况是所有人都在 deadline 临近时一起提交，是一个“并行”提交的过程。并且现
在大家一般在 merge 前都会有一些 CI 的检查，如果串行，这些检查也得串行地执行，
太耗时间了。也因此， rebase 比较合适使用在“内部”分支上。例如一个 feature 有
多个 task，那么 task 分支合并到 feature 分支时，使用 rebase 比较合适。

一些情形下，我们会发现有一些 commit 出现了多次，假设现在我们开发一个 feature，
包含两个子任务，这两个子任务是在 feature 开发了一定时间后开始的，于是出现这样
的分支图：

```
(master)
│ (feature)
│ │ (task-1)
│ │ │ (task-2)
o │ │ │ c
│ │ │ o t2
│ │ o │ t1
│ o─┴─┘ b
│ o     a
o─┘     base commit
```

现在，两个 task 前后完成了开发，于是向 master 发起了 Merge/Pull request。在发
之前，先 rebase 了 `master`，于是产生了如下的分支图：

```
(master)
│ (feature)
│ │ (task-1)
│ │ │ (task-2)
│ │ │ │
│ │ │ o t2
│ │ │ o b"
│ │ │ o a"
│ │ o │ t1
│ │ o │ b'
│ │ o │ a'
│ o │ │ b
│ o │ │ a
o─┴─┴─┘ c
o       base commit
```

可以看到，rebase 过后，`task-1` `task-2` 分别生成了自己对应的 commit `a` `b`
的复本。那么当 `task-1` `task-2` 独立被合并到 master 时，这些复本都会被保留：

```
(master)
M───┐
│   o t2
│   o b"
│   o a"
M─┐ │
│ o │ t1
│ o │ b'
│ o │ a'
o─┴─┘ c
o     base commit
```

所以，此时如果在 `master` 分支上用 `git log` 查看历史，会看到有两个 a(`a'`
`a"`) 两个 b(`b'` `b"`)。这是用 rebase 容易产生的问题之一，其它需要注意的这里
就不深入了。

综上，从分支图的角度上，使用 rebase 能使分支图更“直”，但如果使用不当，也容易出
现一个 commit 被提交了多次的情况。

## 一些建议

结合上面我们看到的情况，管理分支时，我的建议是“从哪来，回哪去”。

例如一个 `task` 分支是从 `feature` 分支出来的，那么最好合并回 `feature` 分支，
而不要直接合并到其它的分支（如 `master`）。这样能防止 commit 被提交多份。在“回
哪去”的过程中，尽量使用 `rebase`，最大程度保证分支图的“线性”结构。

当然最重要的还是明白背后的原理，这样才能灵活使用。
