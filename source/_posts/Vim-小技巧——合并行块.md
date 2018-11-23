title: Vim 小技巧——合并行块
date: 2015-12-21 14:21:31
tags: [vim, FAQ]
categories: Knowledge
toc: true
---

看教程时，自己动手输入教程的例子有助于学习和理解。但有时会发现自己输入的代码
跑不通，而粘贴的代码是正确的。这时我们希望能一行行地对比自己输入的代码和原始
代码。用 Vim 怎么做到呢？

# 问题描述

如果我们有两块（block）文本，如：

```
Line 1
Line 2
Line 3
Line 4
Line 5
Line 6

Reference Line 1
Reference Line 2
Reference Line 3
Reference Line 4
Reference Line 5
Reference Line 6
```

我们想将两个块逐行合并，得到如下的结果：

```
Line 1
Reference Line 1
Line 2
Reference Line 2
Line 3
Reference Line 3
Line 4
Reference Line 4
Line 5
Reference Line 5
Line 6
Reference Line 6

```

这个需求还是会时遇到的，那么如何用 Vim 来实现这样的功能呢？

顺带一提，这也是 Vim Golf 中的一道题： [Interweave two blocks of text](http://www.vimgolf.com/challenges/4dcd7b572c8e510001000005) （需要梯子）

# 功能实现

其实这个功能用脚本实现起来并不难，难的是怎么让最终的功能方便使用。其中的核心
脚本是从 [Merge blocks by interleaving lines](http://vi.stackexchange.com/questions/4575/merge-blocks-by-interleaving-lines) 中获得。代码如下：

```vimscript
function! Interleave(start, end, where)
    if a:start < a:where
        for i in range(0, a:end - a:start)
            execute a:start . 'm' . (a:where + i)
        endfor
    else
        for i in range(a:end - a:start, 0, -1)
            execute a:end . 'm' . (a:where + i)
        endfor
    endif
endfunction
```

使用时，调用 `:call Interleave(8, 13, 1)`。前两个参数分别指定 'Reference Line'
块的首末行的行号。第三个参数指定目标行，即 'Line 1' 的行号。

上述代码中使用的是 vim 的 Ex 命令，即：`:10m2` 用于将第10行的文本移动到第2行
后。

上述代码的功能是 OK 的，只是调用的时候需要知道 3 个行号，并且要输入很多字符。
因此改进如下：

1. 通过 visual selection （`Ctrl-v`）来指定 'Reference Line' 块。
2. 可以通过行号（Line number）或标签（Mark）来指定目标行号。
3. 为选择模式添加一个相应的快捷键。

代码如下（放入 `.vimrc` 中）：

```vimscript
function! Interleave(where) range
    let l:where = a:where

    let l:pos = getpos(l:where)
    if l:where =~ "^'" && !empty(l:pos)
        let l:where = l:pos[1]
    endif

    let l:start = a:firstline
    let l:end = a:lastline

    if l:start < a:where
        for i in range(0, l:end - l:start)
            execute l:start . 'm' . (l:where + i)
        endfor
    else
        for i in range(l:end - l:start, 0, -1)
            execute l:end . 'm' . (l:where + i)
        endfor
    endif
endfunction

command! -nargs=1 -range Interleave <line1>,<line2>call Interleave("<args>")
vmap <leader>j :Interleave<space>
```

完成后的效果参见下节。

# 效果展示

首先是用行号指定目标行的情形：

![Interleave with line number](/images/2015-12-21-use-line-number.gif)

在目标行定义新的标签 `a`，之后用 `'a` 来访问。

![Interleave with mark](/images/2015-12-21-use-mark.gif)

另外绑定快捷键 `<leader>j` 是因为 vim 中默认用 `j` 来合并行。

# 后记

本文中介绍的这个功能实际出现的频率并不是特别高，大概一个月一两次。每次都想着要
不单独写个插件吧。但都忘了，这次正好一次消灭了。

另外有些同学可能不喜欢看到这么多代码。那么用宏也能实现该功能，只是几乎都需要
事先知道两个块之间隔的行数，或是在两者之间跳转的方法。如：

![Interleave with macro](/images/2015-12-21-use-macro.gif)

上图中按下的键为：`ma:16<Enter>qqdd'apjma''q12@q`。其中 `<Enter>` 为回车键。

这里使用了 `ma` 来标记目标行，用 `''` 来跳转到本次跳转前的位置。
