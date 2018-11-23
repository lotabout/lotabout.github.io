title: CSS 子元素依次收缩的实现
tags:
  - flex-shrink
  - css
categories:
  - Knowledge
date: 2017-09-29 21:27:49
toc: true
---


当子元素的宽度（或高度）超过父元素时，如果父元素设置了 `display: flex`，则子
元素将按比例缩小自己的宽度（或高度），但现在我们希望子元素按一定的优先级缩小。
即：当宽度不足时，优先缩小某一个子元素，当达到该元素的最小宽度（`min-width`）
时，再开始缩小另外的元素。下面是一个示例图：

{% asset_img expected.gif Expected Behavior%}

可以看到，当宽度不足时，上例中优先缩小了最右的元素，当最右元素达到最小宽度
100px 时开始缩小左边的元素，依此类推。

<!--more-->

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

{% asset_img wrong.gif Wrong Answer %}

难道是缩小系数还不够大？调成 10000 试试。还真的就成功了！但为什么 1000/1 不够
大，而 10000/1 就能正常工作；需要多大的比例还能实现一个元素优先收缩的效果？

## flex-shrink 如何计算？

显然我们之前据说的计算方法是错误的，那 `flex-shrink` 真正的作用方式如何呢？

这里引述一个教程：[understanding
flexbox](http://madebymike.com.au/writing/understanding-flexbox/) 的例子。

首先，缩放的系数是由 `flex-shrink` 的值乘于 `flex-basis` 的值共同决定的，而这
么做的原因即使指定了相同的 `flex-shrink`，较大的元素（较大的 basis）也会显得
收缩了更多，也符合人的直观印象。

得到这个比例之后，再除于所有子元素的系数之和作为最终的缩小的比例，用这个
比例乘于总共需要缩小的宽度，就是该元素需要缩小的宽度了。还是看看例子吧：

{% asset_img flex-shrink.png Flex Shrink Calculation %}


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

{% jsfiddle lotabout/xozxdz3z/10 result,html,css,js %}

下面是在我本机上得到的输出结果，下面是在第三个元素缩小之前：

{% asset_img before-shrink.png Before Shrink %}

下面是第三个元素缩小之后：

{% asset_img after-shrink.png After Shrink %}

上面这两张图只能对比第三个元素的信息，这里直接说下，在第四个元素收缩之前，它的
大小是 `191px`。在第三个元素收缩时（即变成 `...`）时：

```
总宽度: 600px (去掉父元素的 border 2px)
总缩小宽度：600-60-176-186-191 = -13px
第3个元素的 shrink factor: (1×186)    / (186px + 1000×191px)
                           = 0.00094674680015273484 × -13px = -0.01230770840198555292px
第4个元素的 shrink factor: (1000×191) / (186px + 1000×191px)
                           = 0.99905325319984726515 * -13px = -12.98769229159801444695px
```

因此，计算后第 3 个元素的宽度为 `186 - 0.01230770840198555292 =
185.98769229159801444708` 并不等于图片中的结果 `185.98333740234375`。恭喜，发
现了一个很深的坑。

问题其实在于，浏览器会保留多少精度。这是一个没有标准定义的内容，叫作 "subpixel
rendering"。一个简单的例子就是指定 3 个 `width: 33.33333%` 的 div 时，由于精度问
题，浏览器可能并不会占满 100%。

那精度到底是多少呢？这个精度叫作
[LayoutUnit](http://trac.webkit.org/wiki/LayoutUnit)，Chrome 是 `1/64px`，而
Firefox 是 `1/60px`。

我们这里取整：

```
185.98769229159801444708 * 60
=> 11159.26153749588086682480
11159 / 60
=> 185.98333333333333333333
```

当然，由于 `1/60` 的精度是无限的，还是会有精度丢失，这里看到 `185.98 < 186`
因此导致元素 3 发生了 overflow。

最后，如果你愿意计算，这个 flex-shrink 的大小是跟各个元素的宽度相关的，在这个
特定的例子里，假设元素 3 宽度为 `a`，元素 4 宽度为 `b`，元素 4 的 `min-width`
为 `c`，则要使元素 3 保持正常，则要满足 `a/(a + bx) * (b-c) < 1/60`，即使 a
元素缩小的量小于一个 LayoutUnit，即 `x > (60*a*(b-c) -a)/b`，算得约 5316。

当然，由于我们输入的字符并不是 1px 的，所以可能相差几倍也不太重要。

## 小结

1. 想让子元素按优先级收缩，可以通过设置大倍率的 flex-shrink 完成。
2. flex-shrink 的算法与 flex-grow 不同，需要先与 flex-basis 相乘得到 shrink
   factor。
3. 浏览器的 pixel 最小单位称为 LayoutUnit，Chrome 为 `1/64px`，Firefox 为
   `1/60px`。

## 扩展阅读

1. [MDN: flex-shrink](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-shrink)
2. [Understanding Flexbox](http://madebymike.com.au/writing/understanding-flexbox/)
3. [Browser Rounding and Fractional Pixels](http://cruft.io/posts/percentage-calculations-in-ie/)
4. [LayoutUnit](http://trac.webkit.org/wiki/LayoutUnit)
