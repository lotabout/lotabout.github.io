title: HTML 5 Drag and Drop 入门教程
date: 2018-07-21 10:50:21
tags: [DnD, HTML5]
categories: [Knowledge]
toc: true
---

在 HTML 5 之前，想要实现 Drag and Drop（拖拽/拖放）一般需要求助于 JQuery，所幸
HTML 5 已经把 DnD 标准化，现在我们能“轻易”地为几乎任意元素实现拖放功能。只是它
的难度取决于你对 API 的理解程度，而[官方文档](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API)并不好懂。这篇文章会一步步带你了解它的 API。

最终效果如下：

{% jsfiddle lotabout/xhwsp1u6/13/ result,js,html,css%}

## 拖动事件

继续之前，有必要先了解拖动时会触发哪些事件。考虑拖动 Source Element，途中经过
Intermediate Element，最终进入 Target Element 并松开鼠标，则路径上会触发的事件
如下图所示：

{% asset_img drag-and-drop-events.svg Drag and Drop Events %}

这些事件的具体内容下面会讲到，你可以先跳过之后再回来查看，简单来说：

1. `dragstart`：当我们“拖”起元素时会触发。
2. `dragenter`：当拖动元素 A 进入另一个元素 B 时，会触发 B 的 `dragenter` 事件
   。
3. `dragleave`：与 `dragenter` 相对应，当拖动元素 A 离开元素 B 时，触发 B 的
   `dragleave` 事件。
4. `dragover`：当拖动元素 A 在另一个元素 B 中移动/停止时触发 B 的 `dragover`
   事件。文档说是每几百毫秒触发一次，Chrome 实测 1ms 左右触发；Firefox 大概是
   300ms
5. `drop`：当在拖动元素 A 到元素 B 上，释放鼠标时触发 B 的 `drop` 事件，相当于
   元素 B 接收了元素 A 。
6. `dragend`：在 `drop` 事件之后，还会触发元素 A 的 `dragend` 事件，这里可以对
   元素 A 作一些清理工作。

除了上面的事件外，还有两个一般用不到的事件：

1. `drag`：和 `dragover` 类似，当元素 A 被拖动时，每隔一段时间就会触发这个事件
   。与 `dragover` 不同，`drag` 事件是触发在源元素 A 上，而 `dragover` 是触发
   上潜在目标元素 B 上的。
2. `dragexit`：这个事件只有 Firefox 支持，和 `dragleave` 作用几乎相同，发生在
   `dragleave` 之前。

如果想实际验证一下这些事件是何时触发的，可以看看[这个
jsfiddle](https://jsfiddle.net/lotabout/gq52cn3w/)，console 里会输出拖放的元素
及对应的事件。下面我们开始一起实现咱们的拖放示例吧。

## 让元素可拖放

一般在 HTML 里，元素默认是不可以作为源元素的（除了 `<a>`，`<img>`），例如一个`div`
，我们是“拖不动”它的。这时只需要为它加上 `draggable="true"` 属性它就能“拖”了。
下面是我们的 DOM 结构：

```html
<div id="drag-container">
  <div class="dropzone">
    <div id="draggable" draggable="true">
      Drag Me
    </div>
  </div>
  <div class="dropzone"></div>
  <div class="dropzone"></div>
</div>
```

`draggable` 元素上加了 `draggable="true"`，这样我们就能拖动它了，起码在 Chrome
里可以，在 Firefox 里我们还需要在 `dragstart` 里为 `dataTransfer` 设置一些数据，
因此需要加上下面的代码。具体的作用我们之后会说。

```javascript
  let draggable = document.getElementById('draggable');
  draggable.addEventListener('dragstart', (ev) => {
    ev.dataTransfer.setData('text/plain', null);
  });
```

于是效果如下（CSS 没有贴出）：

{% jsfiddle lotabout/xhwsp1u6/2/ result,js,html,css%}

这样红色的 `Drag Me` 元素就可以拖动了。下面我们增加一些拖动时的反馈，让交互更
真实。

## 添加拖动特效

首先，我们想在拖起元素让原始的元素变成半透明，这样当我们拖动时就会知道它是“真
的可以拖动的”，而不是浏览器的什么奇怪行为。为此，我们可以监听 `dragstart` 事件
：

```javascript
draggable.addEventListener("dragstart", (ev) => {
 ev.target.style.opacity = ".5";
});
```

{% jsfiddle lotabout/xhwsp1u6/5/ result,js,html,css%}

这样一来我们开始拖动元素，它就变得透明了，然而我们松开鼠标，它依旧保持透明！这
可不是我们想要的结果，因此我们需要监听 `dragend` 在拖动结束后还原透明度：

```javascript
  draggable.addEventListener("dragend", (ev) => {
    ev.target.style.opacity = "";
  });
```

{% jsfiddle lotabout/xhwsp1u6/6/ result,js,html,css%}

下面，我们希望拖着元素 A 进入目标 B 时让 B 的边框变成虚线，以示意我们可以放入
元素。

```javascript
  let dropzones = document.querySelectorAll('.dropzone');
  dropzones.forEach((dropzone) => {

    dropzone.addEventListener('dragenter', (ev) => {
      ev.preventDefault();
      dropzone.style.borderStyle = 'dashed';
      return false;
    });

    dropzone.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      return false;
    });

    dropzone.addEventListener('dragleave', (ev) => {
      dropzone.style.borderStyle = 'solid';
    });
  });
```

我们为所有的 `dropzone` 都监听了 `dragenter` 及 `dragleave` 事件，当拖动元素进
入它们时，边框会变成虚线，离开时变回实线。这里有几个注意点：

- 在 `dragenter` 与 `dragover` 里我们调用了 `ev.preventDefault()`，事实上几乎
    所有元素默认都是不允许 drop 发生的，这里调用`ev.preventDefault()` 可以阻
    止默认行为。
- 在 `dragenter` 中我们通过 `dropzone` 变量来修改样式而不是 `ev.target`，你可
    能觉得 `ev.target` 指向的是目标 B 元素，然而它指向的是源元素 A。
- 我们在 `dragenter` 而不是 `dragover` 中修改样式，是因为 `dragover` 会触发太频
    繁了。

{% jsfiddle lotabout/xhwsp1u6/12/ result,js,html,css%}

我们完成了“拖”的操作，最后需要完成“放”的操作了。

## 数据传输 DataTransfer

拖动是最终目的是为了对源和目标元素做一些操作。为了完成操作，需要在源和目标传输
数据，我们可以通过设置/读取全局变量来完成，这并不是一个好习惯。在 HTML 5 中，
我们通过
[DataTransfer](https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer)
完成。

我们在 `dragstart` 时设置需要传输的数据，在 drop 中获取需要的数据。
`event.dataTransfer` 提供了两个主要函数：

- `setData(format, data)`：用于添加数据，一般 format 对应于 MIME 类型字符串，
    常见的有 `text/plain`、`text/html` 及 `text/uri-list`等，但同时也可以是任
    意自定义的类型；不幸的是 data 只能是 `string` 或 `file`。
- `getData(format)`：用于获取数据。

我们要实现将 `Drag Me` 放到其它蓝色元素中，需要传输它的 ID ，通过下面的代码实
现：

```javascript
draggable.addEventListener('dragstart', (ev) => {
  ev.target.style.opacity = ".5";

  // 设置 ID
  ev.dataTransfer.setData('text/plain', ev.target.id);
});

dropzones.forEach((dropzone) => {
  dropzone.addEventListener('drop', (ev) => {
    ev.preventDefault()
    ev.target.style.borderStyle = 'solid';

    // 获取 ID
    const sourceId = ev.dataTransfer.getData('text/plain')
    ev.target.appendChild(document.getElementById(sourceId))
  })
});
```

- 在 `dragstart` 时通过 `setData` 将 ID 放入 `DataTransfer` 中
- 在 `drop` 事件中，通过 `getData` 获取元素 ID 并通过 `appendChild` 加入到蓝色
    元素中。

{% jsfiddle lotabout/xhwsp1u6/13/ result,js,html,css%}

至此我们的简单示例就结束了，为了实现这么一个简单的示例，我们用到了全部的 6 个
事件。因此从入门的角度来说 DnD API 并不容易，但换句话说这也就是它的几乎全部内
容了，而你现在已经掌握了！恭喜！

## 其它用法

定制拖放的行为时，还会有一些其它的需求，如拖放时的图标，到目标元素时鼠标的指针
样式等，这里简单介绍一些。

当我们拖动元素时，浏览器默认生成了元素的缩略图，你可能需要自己设置，这时可
以使用 `DataTransfer` 的 `setDragImage(image, xOffset, yOffset);` 函数。参考
[MDN 上的例子](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations#dragfeedback)。

`event.dataTransfer.dropEffect` 和 `event.effectAllowed` 共同决定了浏览器在执
行拖动时的鼠标指针的行为，还有一些其它的用途。只是我实际测试时发现并不起作用，
[StackOverflow 的这个问题
](https://stackoverflow.com/questions/20471273/html5-drag-and-drop-effectallowed-and-dropeffect)
说了一些自己的理解。

HTML5 还支持从操作系统中拖拽文件到浏览器中，或者从浏览器到操作系统中。如果从操
作系统中获取文件，则可以访问 `event.dataTransfer.files` 字段，包含了操作系统中
的文件内容。反之，在 `dragstart` 时正确设置 `event.dataTransfer.files` 则允许
从浏览器中拖拽文件到操作系统中。

## 一些坑

- `dataTransfer` 的内容只在 `drop` 里可读，所以如果你想在 `dragEnter` 或
    `dragOver` 中通过 `dataTransfer.getData()` 返回的内容来决定一个目标元素是
    否允许放置是不可行的。其它的事件里只能通过一个个检查 `dataTransfer.items`
    里的 type 来获取已经设置的 `format` 而无法获取 `data`。
- `drop` 与 `dragend` 事件是顺序触发的，但在 `dragend` 里没有办法知道 `drop`
    事件是否已经触发。

如果你遇到过其它的坑，也请在评论区留言～

## 参考

- [Native HTML5 Drag and Drop](https://www.html5rocks.com/en/tutorials/dnd/basics/) 经典的入门教程，一步步带你入门
- [Working with HTML5 Drag-and-Drop](http://apress.jensimmons.com/v5/pro-html5-programming/ch9.html) 相对更完
    整的介绍
- [Drag and drop](https://www.w3.org/TR/2011/WD-html5-20110113/dnd.html) W3C
    DnD 标准
- [HTML 5 drag and drop API](http://mereskin.github.io/dnd/) DnD 一些常见的坑
