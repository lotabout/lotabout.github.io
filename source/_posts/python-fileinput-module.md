title: Python fileinput 模块：命令行工具利器
toc: true
date: 2020-03-27 10:34:33
tags: [python, fileinput]
categories: [Project]
---

命令行工具经常要处理从 `stdin` 或文件读取输入，`fileinput` 模块让我们很轻松就
能实现。

## 示例需求

在 `tail -f` 看日志的时候，如果在某一行卡了很长时间，往往我们想看到底花了多长
时间。因此希望有一个工具，能在每行日志前加上接收时的时间戳。例如：

```sh
$ tail -f xxx.log
some good thing happend
some good thing happend
some bad thing happend
```

需要一个工具，如 `timed.py`:

```sh
$ tail -f xxx.log | timed.py
[2020-03-27 10:41:13.514709] some good thing happend
[2020-03-27 10:41:13.525803] some good thing happend
[2020-03-27 10:41:13.630232] some bad thing happend
```

这样就能知道花了多长时间。

## 示例实现

有了 `fileinput` 处理标准输入，只需要 4 行：

```python
from datetime import datetime
import fileinput
for line in fileinput.input():
    print(f'[{datetime.now()}] {line}', end='')
```

## 更多特性

其实如果只是从标准输入读取，也不麻烦，上面的例子可以写成：

```python
from datetime import datetime
import sys
for line in sys.stdin:
    print(f'[{datetime.now()}] {line}', end='')
```

`fileinput` 同时还能处理参数(`sys.args`)中的文件：

```
$ timed.py <file1> <file2>
$ timed.py <file1> - # 读取文件 file1 后等待标准输入
```

对于传统的行处理程序来说，十分便利
