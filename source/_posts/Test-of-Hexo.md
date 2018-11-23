title: Test of Hexo
date: 2015-11-03 10:49:16
tags: test
categories:
toc: true
---

折腾许久的博客工具，反而没有实际写多少内容。遂决定“尽量”不折腾了，而是专心写些
东西。最终用 [Hexo](hexo.io) 搭的博客，选
[Maupassant](https://github.com/tufu9441/maupassant-hexo/) 作主题，几乎没有额
外的配置，准备就此开工。第一篇文章就用作测试 Hexo 的 Markdown 语法吧。

# 本博的一些设置

只有一点值得一提，代码习惯，不太喜欢一行写太长。习惯上一行保留 80/100/120 字
符。只是这个习惯在写文章时会引起一些问题：

1. Markdown 解析连续行时会添加额外空格，使中文文章中多出额外空格。
2. Maupassant 主题自动截取摘要时只认第一个换行

以下是解决方法：

1. 使用插件：[hexo-filter-fix-cjk-spacing](https://github.com/lotabout/hexo-filter-fix-cjk-spacing)
2. 修改 Maupassant 主题的 `layout/index.jade` 文件，替换原有行：

    ```
    - var br = post.content.indexOf('\n')  // 替换为
    - var br = post.content.indexOf('</p>')

    != post.content.substring(0, br)       // 替换为
    != post.content.substring(0, br + 4)
    ```

# Markdown 测试
主要参照 [这篇文章](http://hp256.com/2014/12/23/post-1/)

## 标题

```
# 大标题
## 二标题
### 三标题
#### 四标题
##### 五标题
###### 六标题
```

## 行内元素

```
* 或 - 均可，一个表斜体，两个表粗体

*斜体* _斜体_
**粗体** __粗体__
```

*斜体* _斜体_
**粗体** __粗体__

## 引用

```
> blockquote
>> nested blockquote
```

> blockquote
>> nested blockquote

## 列表

```
- Unordered Level 1
- Unordered Level 2
  1. ordered 1
     - sub list 1
     - sub list 2
  2. ordered 2
  2. ordered 3
- Unordered Level 3
  - sub unordered 1
  - sub unordered 2
    - subsub unordered 1
    - subsub unordered 2
      continue line
      
      multiple paragraph of unordered 2 with the same indent
```

- Unordered Level 1
- Unordered Level 2
  1. ordered 1
     - sub list 1
     - sub list 2
  2. ordered 2
  2. ordered 3
- Unordered Level 3
  - sub unordered 1
  - sub unordered 2
    - subsub unordered 1
    - subsub unordered 2
      continue line
      
      multiple paragraph of unordered 2 with the same indent

## 分割线

```
---
```

---

## 链接

链接中的 URL 可以是本地路径。

```
文字链接：[文字](url) 或 [文字](url tooltip)

[知乎](http://www.zhihu.com) 
[知乎](http://www.zhihu.com LaLaLa)

引用类型：
[知乎][1]

[1]: http://www.zhihu.com
```
      
[知乎](http://www.zhihu.com) 

[知乎][1]

[1]: http://www.zhihu.com

```
图片链接：![文字](url)

![Hexo](http://wwwhere.io/img/thumbs/hexo.jpg)

引用类型：
![Hexo][2]
[2]:http://wwwhere.io/img/thumbs/hexo.jpg
```
      
![Hexo](http://wwwhere.io/img/thumbs/hexo.jpg)
![Hexo][2]

[2]:http://wwwhere.io/img/thumbs/hexo.jpg

## 代码

``` js
var http = require('http');
http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World\n');
}).listen(1337, '127.0.0.1');
console.log('Server running at http://127.0.0.1:1337/');
```

Code Block:

```
{% codeblock Javascript Array Syntax lang:js http://j.mp/pPUUmW MDN Documentation %}
var arr1 = new Array(arrayLength);
var arr2 = new Array(element0, element1, ..., elementN);
{% endcodeblock %}
```

{% codeblock Javascript Array Syntax lang:js http://j.mp/pPUUmW MDN Documentation %}
var arr1 = new Array(arrayLength);
var arr2 = new Array(element0, element1, ..., elementN);
{% endcodeblock %}

Gist Tag

```
{% gist 996818 %}
```

{% gist 996818 %}

jsFiddle:

```
{% jsfiddle ccWP7 %}
```

{% jsfiddle ccWP7 %}

## 公式

该主题暂不支持

```latex
$$E=mc^2$$


The *Gamma function* satisfying $\Gamma(n) = (n-1)!\quad\forall n\in\mathbb N$
is via the Euler integral
$$\Gamma(z) = \int_0^\infty t^{z-1}e^{-t}dt\,.$$
```

$$E=mc^2$$

The *Gamma function* satisfying $\Gamma(n) = (n-1)!\quad\forall n\in\mathbb N$
is via the Euler integral
$$\Gamma(z) = \int_0^\infty t^{z-1}e^{-t}dt\,.$$
