title: 'QQA: 如何从远程运行的 Vim 中复制内容'
toc: true
date: 2019-04-25 21:24:21
tags: [tmux, vim]
categories: [QQA]
---

我们常常会用 `ssh` 登录远程机器，并在在其中 `vim` 命令编辑查看文件。一个常见的
问题是如何**无缝**把选中的内容复制到本地的剪贴板呢？

## 步骤

0. 本地需要一个支持 OSC 52 的终端
    * Linux 下的 xterm，[设置](https://github.com/tmux/tmux/wiki/FAQ#how-do-i-copy-a-selection-from-tmux-to-the-systems-clipboard) `disallowedWindowOps: 20,21,SetXprop`
    * Mac 下的 iterm2，勾选 `Applications in terminal may access clipboard`
1. 在远程机器上安装 neovim，它允许我们自定义如何复制粘贴
2. 把 [clipboard-provider](https://github.com/lotabout/dotfiles/blob/master/bin/clipboard-provider) 脚本放在 `PATH` 下。
3. 在 vimrc 中添加如下配置：
    ```vimrc
    if executable('clipboard-provider')
        let g:clipboard = {
              \ 'name': 'myClipboard',
              \     'copy': {
              \         '+': 'clipboard-provider copy',
              \         '*': 'env COPY_PROVIDERS=tmux clipboard-provider copy',
              \     },
              \     'paste': {
              \         '+': 'clipboard-provider paste',
              \         '*': 'env COPY_PROVIDERS=tmux clipboard-provider paste',
              \     },
              \ }
    endif
    ```

尝试在 ssh 中打开 neovim，通过 `"+y` 来复制内容，预期本地能直接粘贴这些内容！

## 原理


### OSC 52

OSC 52 是 `xterm` 的一个特性，许多终端也支持。它能识别命令行输出中的一些特定格
式的内容，并将其中的内容解析后设置为系统剪贴板的内容。具体来说，[这个特性
](http://invisible-island.net/xterm/ctlseqs/ctlseqs.html) 能解析的格式如下：

```
OSC 52 ; Pc ; Pd ST
```

- 前缀 OSC 是 `\e]`
- 其中的 `Pc` 用于选择使用哪个剪贴板，我们选择主剪贴板 `c`
- 其中的 `Pd` 是 base64 编码后的内容，例如 `hello` 编码为 `aGVsbG8=`
- `ST` 指的是 `\a`

我们可以通过执行命令 `echo -e '\e]52;c;aGVsbG8=\a'`，然后看粘贴的内容是否为
`hello` 来判断当前终端是否支持 OSC 52.

**注意**：这个特性有潜在的安全问题，所以理论上开启后不要执行你不信任的程序。

### clipboard-provider

clipboard-provider 脚本的作用是将输入的内容尝试“粘贴”到 tmux 的 buffer 中、系
统的剪贴板中。这个脚本可以独立于 neovim 使用。如可以尝试把远程的文件复制到剪贴
板中：`cat hello.txt | clipboard-provider copy`。

### g:clipboard

在 neovim 中输入 `:help g:clipboard` 可以看到相关的说明。简单地说，它允许我们
指定，当复制内容到 `+` 或 `*` 寄存器时，执行什么命令。上面的设置其实就是调用了
`clipboard-provider copy` 来将内容复制 tmux 及系统剪贴板中。

## 支持 tmux

我个人一般是在 SSH 中运行 tmux，再在 tmux 中运行 vim 等命令。幸运的是 tmux 也
支持 OSC 52. 只需要在 `~/.tmux.conf` 中添加：

```
set -g set-clipboard on
```

现在还缺失的一个功能是远程粘贴的时候也能打通剪贴板，这个还没研究出来，就先不说
了。
