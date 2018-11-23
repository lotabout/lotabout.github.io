title: 'CSS position:sticky'
date: 2017-09-04 15:04:26
tags: [CSS, position, sticky]
categories: [Knowledge]
toc: true
---

大约两年看在看 [ECMA 2015](https://www.ecma-international.org/ecma-262/6.0/)
的时候，发现在滚动时每个章节的标题都会固定在页面的顶端，好奇的我看了下它的
CSS，发现只有简单的一行 `position: sticky`。当时只有 Firefox 实现了这个特性，
不免心生遗憾，今天恰巧注意到 Chrome 从 56 也支持这个特性了！这里我们就来介绍下
这个神奇的特性吧。

## 先暏为快

先看下面的 JsFiddle，注意滚动时左侧导航栏的行为。

{% jsfiddle lotabout/d6xv8num/2 result,html,css%}

下面这个例子是 MDN 的 demo:

{% jsfiddle lotabout/hjf99x20 result,html,css%}

只需要一行 CSS 就能实现，没有这个特性时，我们需要用 JS 监控滚动事件来实现。下
面我们看看它的工作原理吧。

## 工作原理

> Sticky positioning can be thought of as a hybrid of relative and fixed
> positioning. A stickily positioned element is treated as relatively positioned
> until it crosses a specified threshold, at which point it is treated as fixed.

可以认为 sticky 是 relative 及 fixed 两种 position 的混合。当一个元素的
position 为 sticky 时，它首先会被当成是 `position: relative`，之后，当它的位置
超出一定的阈值时，该元素就被认为是 `position: fixed`。

默认情况下，元素被当作是 `position: relative`，当用户滚动页面时，元素跟着它的
父元素一起滚动。当元素和视区（viewport，这里可以理解成浏览器窗口）的距离小于
（通过 `top: 10px` 等）指定的数值时，元素被认为是 `position: fixed`。造成的效
果是元素和 viewport 的距离保持不变，不会小于指定的距离。

例如：

```css
#one {
    position: sticky;
    top: 10px;
}
```

当滚动屏幕使得元素 `#one` 与视区的距离小于 `10px` 时，它就变成了 `position:
fixed; top: 10px`，此时继续滚动的话，`#one` 是不会移动的，因此也称为黏性
(sticky)的。

最后要注意一个注意点， `position: sticky` 的元素是不会“超出”父元素的。当滚动
时，父元素也快离开屏幕时，子元素是不会继续保持 `sticky` 的状态的，它会随着父
元素一起“滚”出屏幕。可以参考上节给出的 MDN 的例子。

因此，如果将 `position: sticky` 与 `flexbox` 一起使用，要注意 flexbox 默认会拉
伸元素。如第一个例子中，我们使用了 `align-items: flex-start;` 来保证导航栏的
高度不会和父元素一样，否则 sticky 就没作用了。

## 最后

本文只是对 `position: sticky` 做一个简单的介绍，对它的介绍也是以自己的直观理解
为主，如果遇到问题还请查阅官方文档。

- [MDN: sticky position](https://developer.mozilla.org/en/docs/Web/CSS/position#Sticky_positioning)
- [sticky 支持 webkit!](https://developers.google.com/web/updates/2012/08/Stick-your-landings-position-sticky-lands-in-WebKit)
- [sticky polyfill](https://github.com/wilddeer/stickyfill)
