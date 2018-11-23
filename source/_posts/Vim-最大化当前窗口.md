title: Vim 最大化当前窗口
date: 2015-11-12 10:21:11
tags: [vim, FAQ]
categories: Knowledge
toc: true
---

在编辑/查看文件时，时常遇到的一个需求是：临时最大化当前窗口（vim 术语中的
window，tmux 中的 pane）。Vim 原生并不支持该操作，但我们可以利用原生的标签页
（tab page）来模拟这样的行为。

# 问题描述

在编辑/查看文件是，通常我们会将 Vim 进行分屏（split, vsplit）。有时代码太长，
我们希望最大化当前窗口，这可以通过 `:only` 实现。只是之后就复原不到原先的分屏
了。

所以我们需要一个临时最大化当前窗口，之后再还原到最大化前的分屏的功能。

# 解决方案

利用 Vim 自带的 tab page (`:h tagpage`) 功能来模拟该功能。在 `.vimrc` 中加入如
下代码：

```vimscript
function! Zoom ()
    " check if is the zoomed state (tabnumber > 1 && window == 1)
    if tabpagenr('$') > 1 && tabpagewinnr(tabpagenr(), '$') == 1
        let l:cur_winview = winsaveview()
        let l:cur_bufname = bufname('')
        tabclose

        " restore the view
        if l:cur_bufname == bufname('')
            call winrestview(cur_winview)
        endif
    else
        tab split
    endif
endfunction

nmap <leader>z :call Zoom()<CR>
```

之后可以通过 `<leader>z` 来临时最大化，当处于最大化时复原成原先的分屏。（默认
的 `<leader>` 是 `\`  键）

# 原理

`tab split` 命令会将当前窗口在新标签页中打开，形成了将当前窗口最大化的假象。

而我们如何判断当前窗口是已经最大化的呢？这里的逻辑是：`标签页数量 > 1` 且 `当
前窗口数 == 1`。

所以如果你使用了多标签，且当前标签只有一个窗口，上面的逻辑就错误地将你的标签页
关闭了。但我个人的情况一般是最大化，查看，之后就还原，所以不会出现这个情况。

代码中的 `winsaveview` 与 `winresetview` 用来将最大化时的窗口信息（光标位置等
等）应用到最大化前的窗口。

# 题外话

强烈建议把 `<leader>` 设置成空格！

```vimscript
let mapleader = "\<Space>"
```
