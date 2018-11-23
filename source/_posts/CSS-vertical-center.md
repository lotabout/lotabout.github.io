title: CSS 垂直居中
date: 2016-03-17 12:03:29
tags: [CSS, align]
categories: [Knowledge]
toc: true
---

简单一句 `margin: 0 auto` 我们便能搞定水平居中，而正当我们开心地写出 `margin:
auto 0` 时，浏览器却没却无情地拒绝了我们，那我们来看看如何用 CSS 实现垂直
居中吧。

要完全理解本文，我们假设你已经对 CSS 较为熟悉，包括 CSS 盒模型(box model)，
position 的常用方法，伪元素的使用等等。但若只是工作需要，照抄就是！

本文示例用 [Jsfiddle](http://jsfiddle.net/) 编辑，可能载入较慢，请耐心等待。

## 垂直居个中，怎么就这么难

正如前言所说，水平居中，通常只需要一句：`margin: 0 auto` 即可解决。而同样的方
法对于垂直居中却没用，下例为证：

{% jsfiddle lotabout/jcvo1p9r/1 result,html,css%}

原因何在？我们查一下 [CSS 2 的标
准](https://www.w3.org/TR/CSS2/visudet.html#normal-block)：计算高度时如果
`margin-top` 或 `margin-bottom` 的值为 `auto`，则它们的 'used value' 为
`0`。也就是在计算高度时，margin 根本就没有 `auto` 的概念。

好吧，那让我们静下来想想，既然 `auto` 不能用，那我们自己设置不就行了吗？当然这
就需要事先知道需要居中的元素的高度，再用 `calc` 指定 `margin-top` 就能搞定了。

{% jsfiddle lotabout/jcvo1p9r/2 css,html,result%}

诶？怎么跟说好的不一样？说好的这回就能居中呢？上网一查，CSS 果然是坑啊。
[W3school](http://www.w3schools.com/cssref/pr_margin-top.asp) 就写得明明白白：
如果使用百分比作为 `margin-top` 的值，则百分比的基准是父元素的 **宽度** 。
好吧，三观都粉碎了。但再仔细一查，`margin-top` 是按父元素的宽度算，但
`top/bottom` 是按父元素的高度算啊！于是我们想到了用 `position: relative` +
`top: calc(50% - height/2)` 的手段：

{% jsfiddle lotabout/jcvo1p9r/13 result,html,css%}

皇天不负苦心人，终于被我们给拿下了！这时身后的设计表示：你再帮我在居中的元素里加
点东西吧。WTF？居中元素的高度不准变啊，混蛋！

于是我们下面要处理的就是未知父元素高度，未知子元素高度情况下的垂直居中问题（图
来源为 [CSS-trick](https://css-tricks.com/centering-in-the-unknown/)）：

![Unknown Child](https://css-tricks.com/wp-content/uploads/2011/10/unknown.png)

## vertical-align + table

尽管垂直居中问题困扰着我们，更让人困扰的是 CSS 里居然有一个属性名为
[vertical-align](https://developer.mozilla.org/en/docs/Web/CSS/vertical-align)，
而且它有个值是 `vertical-align: middle`！但是用它根本不能垂直居中啊！谁设计
的，老实站出来 -_-

好吧，既然不明白为什么，那就继续好好看文档吧：`vertical-align` 是用来指定内嵌
元素(inline element) 和 table-cell 的垂直对齐方式。我们先将 元素转换成 `table`
来试试对齐。首先为父元素加上 `display: table`，为子元素加上 `display:
table-cell` 来将它们变成表格的样式，再为子元素加上 `vertical-align: middle`
即可。如下例所示。

{% jsfiddle lotabout/jcvo1p9r/14 result,html,css%}

嗯，居中是居中了，而且也跟子元素的实际高度无关，但怎么感觉有点奇怪？嗯，是的，
奇怪是因为父元素的宽度变小了，不像原来是 100% 的宽度。原因是 `table` 本
质上也是 inline 元素，因此现在变成 inline 的父元素，它的宽度将与子元素的
宽度相同。当然，我们也可以为父元素加上 `width: 100%` 来强制指定它的宽度。

另一个问题是子元素的高度变得和父元素一样高了。这对读者而言也许是问题，也许不
是，就要自己考虑了。

## 伪元素的救赎

前面说到 `vertical-align` 可以用于垂直对齐，但它只能用于 inline 元素。比起
`table`，更为直接 的想法就是把子元素改成 `display: inline-block`，并加上
`vertical-align: middle`。只是可惜的是这样并不成功。

原因是 `vertical-align` 指的是当前 inline 元素自己，与其它 inline 元素如何对
齐。而我们现在的情况是，只有一个 inline 元素，那自己跟自己，怎么对齐嘛。

但如果你用过 `:before` 或 `:after` 伪元素的话，这就不是一个问题了。我们可以添
加伪元素，让它的高度与父元素相同，这样子元素垂直对齐时就能居中了。如下图（来源
为[CSS-trick](https://css-tricks.com/centering-in-the-unknown/)）

![Ghost element](https://css-tricks.com/wp-content/uploads/2011/10/ghost.png)

这里要注意的是，为一个元素添加为元素，相当于为当前元素添加了子元素，因此为了
生成一个 100% 高度的伪元素，我们需要对父元素添加伪元素。如下例：

{% jsfiddle lotabout/jcvo1p9r/7 css,html,result%}

嗯，看起来好像很不错了吧！只是不是特别喜欢这种方法，因为如果我们需要使用父元素
的伪元素做一些其它的事情，同时又需要居中，那我们就无能为力了。不过 CSS 是在不
断发展的，在 CSS3 中，我们又多了一些选择。下面我们介绍两种。

## transform 的神力

之前我们想到了用 `position: relative` + `top: calc(50% - height/2)` 的方法，但
这种方法需要知道子元素的高度，但有了
[transform](https://developer.mozilla.org/en-US/docs/Web/CSS/transform)，我们
就可以用 `translateY(-50%)` 来达到 `- height/2` 的目的，而不需要知道居中元素的
高度。

{% jsfiddle lotabout/jcvo1p9r/15 css,html,result%}

只需要简单的三步：

```css
.center-container {
  position: relative;
  top: 50%;
  transform: translateY(-50%);
}
```

## 富人的思虑

现在已经有了许多的方法来实现垂直居中，尽管方法的效果不一，难度各异，可总的来说
还是够用了。但一旦拥有的选择多了，反而无从下手了。那么不必着急，让我们看看它们
的最后一个痛点：

```html
<div class="container">
  <div class="vertical">
    <p id="p1"> A paragraph 1 </p>
    <p id="p2"> A paragraph 2 </p>
  </div>
</div>
```

如上 HTML 文件，我们为了居中 `p1` 和 `p2`，而为它们加了一个层包裹层
`.vertical`。虽然也不是什么难事，但在某些情形下，我们是不能修改文档的结构的，
其中一种可能是文档的内容是动态生成的。也就是，我们希望在现有的文档结构下，让某
些内容垂直居中，这也许是最后一个痛点了。

那么下面我们就来看看最终的杀器：flexbox。

## 终结者 flexbox

[flexbox](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Flexible_Box_Layout/Using_CSS_flexible_boxes)
是 CSS3 为我们带来的瑞士军刀，几乎一切布局相关的问题都能用 flexbox 解决。这里
我们先用实例来解决垂直居中的问题。如下：

{% jsfiddle lotabout/jcvo1p9r/12 css,html,result%}

可以看到，也是简单的3行：

```css
.container {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
```

需要注意的是 CSS3 的支持问题。例如 IE 需要 IE11 才能支持。

关于 flexbox 如何使用，可以参考 [A Complete Guide to Flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)。

## 结语

可以说，整篇文章就是一句 `margin: 0 auto` 所引发的血案。而通过一步步地深入，我
们也一步步接近关于 CSS 的丑陋真相。以及旧社会（CSS2）下的人们水深火热的生活，
但好在社会是在不断发展进步的。我们最终还是迎来的美好的新时代。

由于本人水平有限，难免会有错误，还请不吝赐教。
