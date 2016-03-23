title: CSS flex-shrink 优先级
date: 2016-03-22 16:23:48
tags: [flex-shrink, css]
categories: [Knowledge]
toc:
---

当子元素的宽度（或高度）超过父元素时，如果父元素设置了 `display: flex`，则子
元素将按比例缩小自己的宽度（或高度），但现在我们希望子元素按一定的优先级缩小。
即：当宽度不足时，优先缩小某一个子元素，当达到该元素的最小宽度（`min-width`）
时，再开始缩小另外的元素。下面是一个示例图：

![expected](expected.gif)

可以看到，当宽度不足时，上例中优先缩小了最右的元素，当最右元素达到最小宽度
100px 时开始缩小左边的元素，依此类推。

本文我们将分析 flexbox 中的 `flex-shrink` 属性，来实现上述效果。本文假设你
熟悉 flexbox 的基本用法。

## 基本设置

话不多说，先把主要的框架搭上，参见下面的 [jsfiddle](https://jsfiddle.net/lotabout/xozxdz3z/6/)：

{% jsfiddle lotabout/xozxdz3z/6 result,html,css,js %}

在上面的例子中，只设置了父元素为 `display: flex` 及第一个元素为 `flex: none`
，即不参与 flexbox 的伸缩的计算，只占与它本身宽度相同的宽度。

如果在输入框中输入，可以看到：当宽度不足时，三个子元素一起收缩，出现 `...` 字
样。这是因为，flex 元素的子元素的默认 flex 设置为 `flex: 0 1 auto`。即收缩的比
值为 `1`。

题外话，设置 `flex` 属性相当于设置 3 个值，即 `flex: flex-grow, flex-shrink,
flex-basis`。所以官方提倡直接设置 `flex` 属性而不是分别设置三个。

## 内置的支持？

我们通过查找文档发现，`flex-shrink` 的作用是指定缩小的系数，即如果一个元素 A
的 `flex-shrink: 2` 而元素 B 为 `flex-shrink: 1`，当需要缩小 30px 才能不超出父
元素宽度时，A 与 B 按 `2:1` 收缩，即 A 元素缩小 20px 而 B 元素缩小 10px。

这样看来，`flex-shrink` 并不适合我们上面所说的任务。因为只要设置了
flex-shrink，那么元素就一定会缩小，也就达不到前文需要的效果了。

也许你从标题里也猜到了，是的，flexbox 并没有提供任何机制，来设置伸缩的优先级。
所以我们只能进一步思考，如何才能做到？

## 合适的比例？

于是我们的第一反应就是：如果把其中一个元素的 `flex-shrink` 设置得很大，而另一
个很小不就可以了？嗯，有道理！于是我们先忽略第二个子元素，将它设置为
`flex:none`，第三个元素设置为 `flex: 0 1`，第四个元素 `flex: 0 1000`，即它的
缩小的系数是第三个元素的 1000 倍！

{% jsfiddle lotabout/xozxdz3z/8 result,html,css,js %}

输上几个字符，居然就成功了！

然后如果仔细观察输入的情况，会发现输入到一定长度时，虽然最后一个元素还没有达到
`min-width`，第三个元素也发生了收缩：

![Wrong Answer](wrong.gif)

难道是缩小系数还不够大？调成 10000 试试。还真的就成功了！于是我们就要深入研究
为什么 1000/1 不够大，而 10000/1 就能正常工作；需要多大的比例还能实现一个元
素优先收缩的效果。

## flex-shrink 的算法

显然我们之前据说的计算方法是错误的，那 `flex-shrink` 真正的作用方式如何呢？

这里引述一个教程：[understanding
flexbox](http://madebymike.com.au/writing/understanding-flexbox/) 的例子。

首先，缩放的系数是由 `flex-shrink` 的值乘于 `flex-basis` 的值共同决定的，而这
么做的原因即使指定了相同的 `flex-shrink`，较大的元素（较大的 basis）也会显得
收缩了更多，也符合人的直观印象。

得到这个比例之后，再除于所有子元素的系数之和作为最终的缩小的比例，用这个
比例乘于总共需要缩小的宽度，就是该元素需要缩小的宽度了。还是看看例子吧：

![Flex Shrink Calculation](flex-shrink-calculation.png)

```
.flex-container{ width: 600px; }
.flex-item-1{ flex-basis: 100px; flex-shrink: 1; }
.flex-item-2{ flex-basis: 400px; flex-shrink: 1; }
.flex-item-3{ flex-basis: 400px; flex-shrink: 1; }
Total basis: 900px
Space remaining: -300px
Item 1 shrink factor: (1×100) / (100px + 400px + 400px) = .111 × -300px = -33.333px
Item 2 shrink factor: (1×400) / (100px + 400px + 400px) = .444 × -300px = -133.333px
Item 3 shrink factor: (1×400) / (100px + 400px + 400px) = .444 × -300px = -133.333px
```

## 宽度可以是小数？

我们知道 CSS 的最小单位是像素，即 `px`，那计算出来的小数有何作用？经过一番搜
索，又学习到了新的知识：
[getBoundingClientRect()](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)，
它可以返回一个 DOM 元素的位置和大小信息，最为重要的是，它返回信息的类型是 **浮点
型**！这意味着浏览器是需要存储小数级别的信息的！

我们打印出了一些信息：

{% jsfiddle lotabout/xozxdz3z/9 result,html,css,js %}

下面是在我本机上得到的输出结果，下面是在第三个元素缩小之前：

![Before Shrink](before-shrink.png)

下面是第三个元素缩小之后：

![After Shrink](after-shrink.png)

因此，当最后输入一个字母 `l` 时，子元素共需要缩小 5px。所以根据前面的计算公
式，第三个元素需要缩小的最为

```
(186/(186+183*1000))*5
.00507680717958795975
186 - .
185.99492319282041204025
