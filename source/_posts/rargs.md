title: 分享创造 rargs
date: 2018-04-14 09:50:33
tags: [rargs, xargs]
categories: Project
toc: true
---

[rargs](https://github.com/lotabout/rargs) 是一个 rust 实现的命令行工具，它解
决的是 `xargs` 或 `parallel` 等批量处理工具中无法自由引用输入的痛点。`rargs`
支持用正则表达式来匹配输入中的任意内容。例如，我们想恢复一些以 `.bak` 结尾的备
份文件，用 `rargs` 可以这么做：

```sh
ls *.bak | rargs -p '(.*)\.bak' mv {0} {1}
```

<!--more-->

## 批量重命名文件

我们先创建一些文件：

```sh
$ touch {1..10}.txt  # {} 是 bash/zsh 的语法
$ ls
1.txt  2.txt  3.txt  4.txt  5.txt  6.txt  7.txt  8.txt  9.txt  10.txt
```

现在我们把这些文件添上 `.bak` 后缀来备份。

```sh
$ ls | xargs -I{} mv {} {}.bak
$ ls
1.txt.bak  2.txt.bak  3.txt.bak  4.txt.bak  5.txt.bak  6.txt.bak  7.txt.bak  8.txt.bak  9.txt.bak  10.txt.bak
```

可以看到 `xargs` 允许我们通过 `-I` 来指定占位符(placeholder)，代表输入行（具体
化的使用方法麻烦查阅手册 `man xargs`），可以方便地实现批量处理。

那么如何批量地把这些文件还原呢？使用 `rargs` 就可以轻易地实现：

```
$ ls | rargs -p '(.*).bak' mv {0} {1}
$ ls
1.txt  2.txt  3.txt  4.txt  5.txt  6.txt  7.txt  8.txt  9.txt  10.txt
```

`rargs` 会用正则表达式 `(.*).bak` 匹配输入内容，然后会记录 `(...)` 中的内容（
与正则表达式的语法一致），之后可以通过 `{1}` 来引用。

## 批量下载

例如我们有一个 CSV 文件，存放着要下载文件的 URL 和文件名，存放格式如下：

```
URL1,filename1
URL2,filename2
```

我们想用 `wget` 下载 URL 并保存成对应的文件名。用 `rargs` 可以这样实现：

```
cat download-list.csv | rargs -p '(?P<url>.*),(?P<filename>.*)' wget {url} -O {filename}
```

这里我们用了正则表达式中的 `(?P<grou_name>...)` 的语法，`rargs` 会保存
group_name 和匹配到的内容，之后可以通过 `{group_name}` 引用 。

## 替代 AWK

上面的例子用正则表达式来匹配 CSV 文件，如果字段多还是比较麻烦的。`rargs` 针对
这种情况提供了 `-d ...` 来指定分隔符，之后可以像 AWK 一样通过 `{n}` 来引用第
`n` 个字段。

不仅如此，我们经常会需要引用一些连续的字段，`rargs` 提供 `{start...end}` 的语
法来引用 。

例如我们有一些 xSV 文件，如 `/etc/passwd`:

```
nobody:*:-2:-2:Unprivileged User:/var/empty:/usr/bin/false
root:*:0:0:System Administrator:/var/root:/bin/sh
daemon:*:1:1:System Services:/var/root:/usr/bin/false
```

我们可以用 `rargs` 来处理其中的字段：

```
$ cat /etc/passwd | rargs -d: echo -e 'id: "{1}"\t name: "{5}"\t rest: "{6..::}"'
id: "nobody"     name: "Unprivileged User"       rest: "/var/empty:/usr/bin/false"
id: "root"       name: "System Administrator"    rest: "/var/root:/bin/sh"
id: "daemon"     name: "System Services"         rest: "/var/root:/usr/bin/false"
```

`-d:` 指定了 `:` 为分隔符。`{6..}` 指定了第 6 及之后的字段。`{...:sep}` 语法可
以指定 `sep`作为多个字段输出时使用的分隔符。

## 多线程

`rargs` 默认是顺序执行命令，如果需要多线程，可以通过
-  `-w <num>` 指定使用的线程数量
-  `-w 0` 指定与 CPU 数量相同的线程数。

## 最后

`rargs` 是一个简单的小工具，希望它能给你带来一些方便。
