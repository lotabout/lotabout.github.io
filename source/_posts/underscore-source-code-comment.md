title: Underscore.js 源码阅读
date: 2017-09-24 09:27:34
tags: [underscore, javascript]
categories: [Notes]
toc: true
---

（这是两年前的笔记，现在把它搬到博客上，Underscore 版本：1.8.3）

受 [这篇文章](http://web.jobbole.com/83872/) 的启发,萌生阅读 underscore.js 源
码的念头,其中有许多不理解的地方,也是读了上述文章后才明白的.为了保持本文的完整
性,也尽量按自己的理解进行注释. 不再提及上述引用文章.

<!--more-->

## 全局定义

```js
(function(){
    ...
}())
```
underscore.js 中通过自执行函数来防止打乱已有的命令空间中的变量.这样函数中定义
的所有变量在外部都是不可见的.但是仍旧需要以某种方式来导出其中定义的变量.

```js
// Establish the root object, `window` (`self`) in the browser, `global`
// on the server, or `this` in some virtual machines. We use `self`
// instead of `window` for `WebWorker` support.
var root = typeof self == 'object' && self.self === self && self ||
        typeof global == 'object' && global.global === global && global ||
        this;
```

`root` 变量的作用是用来捕捉外部环境. 由于在自执行函数中,`this` 变量会被设置成
`Window` (浏览器中),所以我们可能通过为 `this` (即此处的`root`) 添加相应的变量
来导出函数. 如:

```js
(function() {
    this.exported_var = 10
}())

console.log(this.exported_var);
// => 10
```


```js
// Save bytes in the minified (but not gzipped) version:
var ArrayProto = Array.prototype, ObjProto = Object.prototype;
```

为了减少 JS 代码在网络传输中占用的流量,通常要对其进行压缩,以减少源代码的大
小.方法之一是替换现有的变量名.将 `Array.prototype` 赋值给新变量,就允许我们对
该变量进行重命名.例如: `ArrayProto.toString => a.toString` 而若使用诸如
`Array.prototype.toString => a.prototype.toString` 则找不到该函数.

```js
  // Create quick reference variables for speed access to core prototypes.
  var
    push = ArrayProto.push,
    slice = ArrayProto.slice,
    toString = ObjProto.toString,
    hasOwnProperty = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeIsArray = Array.isArray,
    nativeKeys = Object.keys,
    nativeCreate = Object.create;
```
以上同理.

```
  // Naked function reference for surrogate-prototype-swapping.
  var Ctor = function(){};
```

`Ctor` 函数只有一个用途,就是为了兼容老版本 JavaScript 的继承,即用来实现
`Object.create` 函数.

```
SubClass.prototype = Object.create(SuperClass.prototype)
// 等价于
var ctor = function () {}
ctor.prototype = SuperClass.prototype;
SubClass.prototype = new ctor();
```

`Ctor` 在之后的 `baseCreate` 函数中使用.

## 链式调用

因为涉及的内容较多,所以归成一节.

首先,我们要明白什么是链式调用.简单地说,链式调用是方便我们写代码的一个手段,看
下面的例子:

```
var x = obj.method_O();
var y = x.method_X();
var z = y.method_Y();
z.method_Z();
```

上述写法需要许多中间变量,由于对象 `obj` 的 `method_O` 方法正好返回一个类 `X`
的对象(这里指的是返回的变量 `x` 需要有 `method_X` 方法),所以可以直接调用 `X` 的方
法 `method_X()`. 以此类推.因此我们可以省略其中
的中间变量,写成:

```
obj.method_O().method_X().method_Y().method_Z();
```

要达到上述效果,我们便需要让 `method_O()` 方法在结束时返回一个类 `X` 的对象:

```js
function method_O() {
    ...
    var ret = new X(); // 创建一个 `X` 的对象返回
    一些逻辑处理
    ...

    return ret;
}
```

以此类推.上述方法是 Javascript 原生支持的.现在的问题在于,例如调用 `method_X`
方法返回了 `Y` 的对象,就再也无法使用类 `X` 中的方法了.例如:

```
var flattened_obj = _([[1,2]]).flatten();
flattened_obj.each(...) // 出错
```

上述代码中我们首先创建了一个 underscore.js 的对象 `_([[1,2]])` 目的是使用
underscore.js 为我们提供的丰富辅助函数.之后我们调用 underscore.js 中的
`flatten` 函数得到一个扁平化的数组: `[1,2]`. 之后我们想在其中调用
underscore.js 的 `each` 函数. 此时报错,提示没有该函数.故此时我们无法使用链式
调用:

```
_([[1,2]]).flatten().each(...) // 报错
```

故而 underscore.js 需要提供一些机制来包裹返回的对象,使之能访问 underscore.js
中的函数.

underscore.js 中通过 `_.chain(obj)` 来返回一个包裹的 `_` 对象;再对
underscore.js 中提供的所有函数做特殊的处理,使得:当调用函数的是包裹的对象时,返
回的结果也是一个 `_` 的对象,而由于 underscore.js 中的所有函数都存放在 `_`
中,所以调用链中的每一步都可以访问 underscore.js 中的函数.

例如:

```
_.chain([[1,2]]) instanceof _; // => true
_.chain([[1,2]]).flatten() instanceof _; // => true
_([[1,2]]).flatten() instanceof _; // => false
```

### 链式调用的实现

```
  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Add a "chain" function. Start chaining a wrapped Underscore object.
  _.chain = function(obj) {
    var instance = _(obj);
    instance._chain = true;
    return instance;
  };
```

从上面的函数可以看到 `_` 函数生成一个新的 `_` 对象,并将输入的 `obj` 置于
`this._wrapped` 中. 而 `_.chain` 函数则再设置 `this._chain = true` 的标志.

单凭上述两个函数并没有实际用途,因此需要一个辅助函数:

```
  // Helper function to continue chaining intermediate results.
  var chainResult = function(instance, obj) {
    return instance._chain ? _(obj).chain() : obj;
  };
```

该函数检查 `instacne` 本身是否设置了 `_chain` 标志,若是则将 `obj` 用 `chain()`
包裹,它的作用就是对调用链上函数返回的结果进行处理,如 `x.method()` 中,若
设置了 `_chain` 标志,则将 `x.method()` 的返回结果再用 `chain()` 包裹.这样调用
链中的每个函数返回的都是一个 `_` 的对象,因此也就能继续访问类 `_` 的方法了.

还有一个问题是,即使有以上函数, underscore.js 在定义新的函数时仍需手工调用
`chainResult` 函数,十分麻烦. 所以 underscore.js 又提供了另一个辅助函数,将所有
已有的函数进行包裹:

```
  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    _.each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return chainResult(this, func.apply(_, args));
      };
    });
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);
```

该函数将 `obj` 中的所有函数替换成包裹后的函数.首先取出 `_` 对象中包裹的实际
值, `push.apply(args, arguments)` 将该值与现有的函数参数结合,最后对原函数的返
回值进行处理: `chainResult(this, func.apply(_, args))`.

还有一些函数单独作了处理,如 `pop`, `push`, `reverse`, 等等,此处不再详谈.

## 接前文

```js
  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for their old module API. If we're in
  // the browser, add `_` as a global object.
  // (`nodeType` is checked to ensure that `module`
  // and `exports` are not HTML elements.)
  if (typeof exports != 'undefined' && !exports.nodeType) {
    if (typeof module != 'undefined' && !module.nodeType && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.8.3';
```

上文较好理解，判断不同的平台，导出 `_` 变量。

```js
  // Internal function that returns an efficient (for current engines) version
  // of the passed-in callback, to be repeatedly applied in other Underscore
  // functions.
  var optimizeCb = function(func, context, argCount) {
    if (context === void 0) return func;
    switch (argCount == null ? 3 : argCount) {
      case 1: return function(value) {
        return func.call(context, value);
      };
      // The 2-parameter case has been omitted only because no current consumers
      // made use of it.
      case 3: return function(value, index, collection) {
        return func.call(context, value, index, collection);
      };
      case 4: return function(accumulator, value, index, collection) {
        return func.call(context, accumulator, value, index, collection);
      };
    }
    return function() {
      return func.apply(context, arguments);
    };
  };
```

要理解 `optimizeCb` 的作用，需要先理解 underscore.js 提供的 context 切换的功
能。我们首先查看 `_.each` 的文档：

```
each: _.each(list, iteratee, [context]) Alias: forEach
```

它接收额外的参数 `context`。而它的作用是在 `iteratee` 函数中将 `this` 指向
`context`。下面的是一个
[StackOverflow](http://stackoverflow.com/questions/4946456/underscore-js-eachlist-iterator-context-what-is-context)
的例子：

```js
var someOtherArray = ["name","patrick","d","w"];

_.each([1, 2, 3], function(num) {
    // 函数内， this “等于” someOtherArray

    alert( this[num] ); // num is the value from the array being iterated
                        //    so this[num] gets the item at the "num" index of
                        //    someOtherArray.
}, someOtherArray);
```

关于 context 的具体应用可以参考 [这篇文章](https://medium.com/@jedschneider/the-secret-life-of-context-in-underscore-and-lodash-722ce3e24608#.l4kxy31d5)

为了切换 `this` 的实际值，我们需要做如下的工作：

```js
var origin = function(arg ...) {
    ...
}

var withContext = orig.call(context, arg ...);
```

即通过 `function.call(...)` 的方式来调用函数，以传入新的 `this` 值。而
`optimizeCb` 函数便是 underscore.js 内部用于完成这个转换的辅助函数。

`optimizeCb` 函数中判断了目标函数 `func` 的参数个数，返回不同的函数，如果参数
的个数不是 1～4，则采用通用的逻辑 `func.apply` 代替 `func.call`。似乎对当前的
引擎而言，`func.call` 要稍快于 `func.apply`。 [这个网页](https://jsperf.com/function-calls-direct-vs-apply-vs-call-vs-bind/6) 用于
测试各种调用方式的效率，在我本机测试下 `call` 要稍快于（7％） `apply`

```js
  // A mostly-internal function to generate callbacks that can be applied
  // to each element in a collection, returning the desired result — either
  // `identity`, an arbitrary callback, a property matcher, or a property accessor.
  var cb = function(value, context, argCount) {
    if (value == null) return _.identity;
    if (_.isFunction(value)) return optimizeCb(value, context, argCount);
    if (_.isObject(value)) return _.matcher(value);
    return _.property(value);
  };

  _.iteratee = function(value, context) {
    return cb(value, context, Infinity);
  };
```

`cb` 几乎只被内部函数使用，用途是根据 `value` 的类型生成回调函数。

```js
  // Similar to ES6's rest param (http://ariya.ofilabs.com/2013/03/es6-and-rest-parameter.html)
  // This accumulates the arguments passed into an array, after a given index.
  var restArgs = function(func, startIndex) {
    startIndex = startIndex == null ? func.length - 1 : +startIndex;
    return function() {
      var length = Math.max(arguments.length - startIndex, 0);
      var rest = Array(length);
      for (var index = 0; index < length; index++) {
        rest[index] = arguments[index + startIndex];
      }
      switch (startIndex) {
        case 0: return func.call(this, rest);
        case 1: return func.call(this, arguments[0], rest);
        case 2: return func.call(this, arguments[0], arguments[1], rest);
      }
      var args = Array(startIndex + 1);
      for (index = 0; index < startIndex; index++) {
        args[index] = arguments[index];
      }
      args[startIndex] = rest;
      return func.apply(this, args);
    };
  };
```

`restArgs` 也只在内部使用，它用来实现类似其它语言（及ES6）的 `rest` 参数。rest
参数的作用是将多余的参数以数组（Array）的方式保存为最后一个参数。

```js
function test(a, b, rest) {
    ...
}

test(1, 2) => a: 1, b: 2, rest: [],
test(1, 2, 3) => a: 1, b: 2, rest: [3],
test(1, 2, 3, 4) => a: 1, b: 2, rest: [3, 4],
```

当然，JavaScript 并不直接支持（ES6 前）这样的语法，所以 underscore.js 自己实现
了一个（JavaScript 真强大啊！）。有了 `restArgs` 我的就能写成：

```js
function orig(a, b, rest) {
    ...
}

var test = restArgs(orig, 2);

test(1, 2) => a: 1, b: 2, rest: [],
test(1, 2, 3) => a: 1, b: 2, rest: [3],
test(1, 2, 3, 4) => a: 1, b: 2, rest: [3, 4],
```

```js
  // An internal function for creating a new object that inherits from another.
  var baseCreate = function(prototype) {
    if (!_.isObject(prototype)) return {};
    if (nativeCreate) return nativeCreate(prototype);
    Ctor.prototype = prototype;
    var result = new Ctor;
    Ctor.prototype = null;
    return result;
  };
```

`baseCreate` 与 `Object.create(...)` 等价，只是老版本的 JavaScript 没有
`Object.create` 函数，因此用它来做兼容。

```js
  var property = function(key) {
    return function(obj) {
      return obj == null ? void 0 : obj[key];
    };
  };

  // Helper for collection methods to determine whether a collection
  // should be iterated as an array or as an object.
  // Related: http://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength
  // Avoids a very nasty iOS 8 JIT bug on ARM-64. #2094
  var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;
  var getLength = property('length');
  var isArrayLike = function(collection) {
    var length = getLength(collection);
    return typeof length == 'number' && length >= 0 && length <= MAX_ARRAY_INDEX;
  };
```

`isArrayLike` 用来判断一个 collection 是否是“类数组”的，那什么是“类数组”呢？
需要满足两个条件：

1. 元素可以通过编号访问
2. 元素个数通过 `length` 属性得到。

“类数组” 不要求有数组（Array）提供的函数，如 `push`, `forEach` 及 `indexOf`. 例如：

```
var arrayLikeCollection = {}
arrayLikeCollection[0] = 0
arrayLikeCollection[1] = 10;
arrayLikeCollection[2] = 20;
arrayLikeCollection[3] = 30;
arrayLikeCollection.length = 4;
```

所以，underscore.js 中定义的 `isArrayLike` 并没有真正检查条件1。条件 2 在先前
的版本中是通过 `obj.length === +obj.length` 完成的，但似乎在某些情况下有 BUG，
于是改成了当前的版本。

## Collection 函数

本节中讲的是一些 collection 的辅助函数，如 `map`, `each`, `reduce` 等等。这些
函数常用于函数式编程语言（如 Haskell）中，它们能更好地描述 collection 的一些
操作。在编程中，我们要学习利用这些函数，学会从 collection 的整体角度进行思考，
而不以 collection 中的元素作为处理对象。

```js
  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles raw objects in addition to array-likes. Treats all
  // sparse array-likes as if they were dense.
  _.each = _.forEach = function(obj, iteratee, context) {
    iteratee = optimizeCb(iteratee, context);
    var i, length;
    if (isArrayLike(obj)) {
      for (i = 0, length = obj.length; i < length; i++) {
        iteratee(obj[i], i, obj);
      }
    } else {
      var keys = _.keys(obj);
      for (i = 0, length = keys.length; i < length; i++) {
        iteratee(obj[keys[i]], keys[i], obj);
      }
    }
    return obj;
  };

  // Return the results of applying the iteratee to each element.
  _.map = _.collect = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length,
        results = Array(length);
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      results[index] = iteratee(obj[currentKey], currentKey, obj);
    }
    return results;
  };
```

`_.each` 函数是 collection 相关函数的基石，它的作用是将函数 `iteratee` 应用于
collection 中的每个元素，而 `map` 函数将 `iteratee` 每次调用的结果收集，以一个
数组返回。

注意的是 `_.each` 与 `_.map` 同时支持以 “类数组”及 collection。在
underscore.js 中，通常将 object 抽象成 “广义的数组”。广义的数组包含一个键
数组 `keys` 和一个值数组 `values`，它们一一对应，而由于它们是数组，也因此可以
通过索引进行访问。对于普通的“类数组”，键数组中包含的就是对应值的索引。

所以，在涉及到索引相关的运算时，underscore.js 通常会先获取键数组，如 `_.map`
函数中的：

```js
    // 获取键数组
    var keys = !isArrayLike(obj) && _.keys(obj),
    length = (keys || obj).length,

    // 获取键值
    var currentKey = keys ? keys[index] : index;
```

相应的，如果涉及值运算时，underscore.js 通常会先取得它的值数组：

```js
    obj = isArrayLike(obj) ? obj : _.values(obj);
```

这个模式中 underscore.js 中被多次运用。

```js
  // Create a reducing function iterating left or right.
  var createReduce = function(dir) {
    // Optimized iterator function as using arguments.length
    // in the main function will deoptimize the, see #1991.
    var reducer = function(obj, iteratee, memo, initial) {
      var keys = !isArrayLike(obj) && _.keys(obj),
          length = (keys || obj).length,
          index = dir > 0 ? 0 : length - 1;
      if (!initial) {
        memo = obj[keys ? keys[index] : index];
        index += dir;
      }
      for (; index >= 0 && index < length; index += dir) {
        var currentKey = keys ? keys[index] : index;
        memo = iteratee(memo, obj[currentKey], currentKey, obj);
      }
      return memo;
    };

    return function(obj, iteratee, memo, context) {
      var initial = arguments.length >= 3;
      return reducer(obj, optimizeCb(iteratee, context, 4), memo, initial);
    };
  };

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`.
  _.reduce = _.foldl = _.inject = createReduce(1);

  // The right-associative version of reduce, also known as `foldr`.
  _.reduceRight = _.foldr = createReduce(-1);
```

与 `_.map` 一样，`_.reduce` 也是函数式编程语言中常用的辅助函数，上面的代码较
乱，下面是一个更为简单的实现，用以演示核心的逻辑。

```js
function reduce(coll, func, init_val) {
  var i = 0;
  for (; i < coll.length; i++) {
    init_val = func(init_val, coll[i]);
  }
  return init_val;
}
var sum = reduce([1, 2, 3], function(memo, num){ return memo + num; }, 0);
// => 6
```

这里的实现使用了两个闭包，[这篇文章](http://web.jobbole.com/83872/) 认为这里
闭包的作用是持久化变量。但我认为，这里将逻辑分成两个函数的目的，如注释所说的，
是为了提高执行的效率。即使主逻辑中不包含对`arguments.length`的使用，但具体为何
能提高效率，还有待学习。

`_.find`, `_.filter`, `_.reject`, `_.every`, `_.some` 等函数中规中矩，唯一要
注意的是它们是如何同时处理 collection 和“类数组”的情况。

```js
  var group = function(behavior, partition) {
    return function(obj, iteratee, context) {
      var result = partition ? [[], []] : {};
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index) {
        var key = iteratee(value, index, obj);
        behavior(result, value, key);
      });
      return result;
    };
  };
```

`group` 函数稍微难理解一些，它只在 underscore 内部使用。函数的主要复杂性来源于
参数 `partition`，它用来标记 `group` 返回的函数返回结果的类型。我认为这是一个
不恰当的抽象，一个更直观的抽象应该是（这里不考虑 context 切换的问题）：

```js
var simpleGroup = function(behavior) {
    return function(obj, iteratee) {
        var result = {};
        _.each(obj, function(value, index) {
            var key = iteratee(value, index, obj);
            behavior(result, value, key);
        });
        return result;
    };
};
```

即对于 `obj` 中的每个元素，通过调用 `iteratee` 函数得到一个分组的依据 `key`，
再调用 `behavior` 对返回的结果进行组装。如 `_.groupBy` 函数：

```js
  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, value, key) {
    if (_.has(result, key)) result[key].push(value); else result[key] = [value];
  });
```

它的 `behavior` 函数就是将 `iteratee` 调用后的结果 `value` 按 `key` 进行分组。

上面提到，`group` 由于支持 `partition` 带来了额外的复杂性，具体的调用如下：

```js
  _.partition = group(function(result, value, pass) {
    result[pass ? 0 : 1].push(value);
  }, true);
```

而其实该函数可以由 `_.groupBy` 实现：

```js
_.partition = function(obj, iteratee) {
    var result = _.groupBy(obj, iteratee);
    return [result[true], result[false]];
}
```

```js
  // Generator function to create the findIndex and findLastIndex functions
  var createPredicateIndexFinder = function(dir) {
    return function(array, predicate, context) {
      predicate = cb(predicate, context);
      var length = getLength(array);
      var index = dir > 0 ? 0 : length - 1;
      for (; index >= 0 && index < length; index += dir) {
        if (predicate(array[index], index, array)) return index;
      }
      return -1;
    };
  };

  // Returns the first index on an array-like that passes a predicate test
  _.findIndex = createPredicateIndexFinder(1);
  _.findLastIndex = createPredicateIndexFinder(-1);
```

`createPredicateIndexFinder` 根据指定的步长 `dir` 创建遍历的函数。而实际上它在
被用来创建 `_.findIndex` 和 `_.findLastIndex`，但无疑，这增加了许多阅读上的复
杂度。当一个逻辑没有被很多使用时，是否需要独立成一个单独的模块，值得思考与讨
论。

## 函数相关的函数
```js
  // Determines whether to execute a function as a constructor
  // or a normal function with the provided arguments
  var executeBound = function(sourceFunc, boundFunc, context, callingContext, args) {
    if (!(callingContext instanceof boundFunc)) return sourceFunc.apply(context, args);
    var self = baseCreate(sourceFunc.prototype);
    var result = sourceFunc.apply(self, args);
    if (_.isObject(result)) return result;
    return self;
  };

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = restArgs(function(func, context, args) {
    if (!_.isFunction(func)) throw new TypeError('Bind must be called on a function');
    var bound = restArgs(function(callArgs) {
      return executeBound(func, bound, context, this, args.concat(callArgs));
    });
    return bound;
  });
```

这里，我们首先回顾一下 `restArgs(func, startIndex)` 默认的使用方法。当参数
`startIndex` 为空时，它默认为 `func` 参数个数减一。所以有：

```
function orig(a, b, rest) {
    ...
}

var test = restArgs(orig);

test(1, 2) => a: 1, b: 2, rest: [],
test(1, 2, 3) => a: 1, b: 2, rest: [3],
test(1, 2, 3, 4) => a: 1, b: 2, rest: [3, 4],
// 即此时 test 的多余参数都将收集成一个数组，作为 orig 调用里的 rest 参数
```

知道了这点就不难看懂 `_.bind` 与 `executeBound`
函数。还有一点需要深追的是条件判断：`(!(callingContext instanceof
boundFunc))`，它的作用是什么呢？

其实 `_.bind` 是要实现 ECMA5 中的 `Function.bind` 类似的功能，我们从 [MDN](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_objects/Function/bind) 上截取 `bind` 函数的一个使用实例：

```js
this.x = 9;
var module = {
  x: 81,
  getX: function() { return this.x; }
};

module.getX(); // 81

var retrieveX = module.getX;
retrieveX(); // 9, because in this case, "this" refers to the global object

// Create a new function with 'this' bound to module
//New programmers (like myself) might confuse the global var getX with module's property getX
var boundGetX = retrieveX.bind(module);
// var boundGetX = _.bind(retrieveX, module); // underscore.js 相应的替代方法。
boundGetX(); // 81
```

上述例子在执行时，`callingContext` 指向的是全局的 `Window`（浏览器中）。而只有
当我们创建一个新的该函数的对象时，才会出现 `callingContent instanceof
boundFunc` 的情形：

```js
var instance = new boundGetX(); // 或者
boundGetX.apply(instance);
```

这是由 `new` 操作符的特性导致的。一般来说，获取一个函数（类）的一个实例“只
能”通过 `new` 操作符来完成。`new func(...)` 执行了三个步骤：

1. 创建一个新的对象，该对象继承了 `func.prototype`；
2. 以新创建的对象为 `this` 调用构造函数 `func`；
3. 如果 `func` 有返回值则返回它，若没有，则返回第1步创建的对象。

以代码来说就是：

```js
var newObj = Object.create(func.prototype);
var result = func.apply(newObj, ...args...);
if (result instanceof object) {
    return result;
} else {
    return newObj;
}
```

因此，在上述例子中 `func.apply` 的过程中，`this` 指针必须要指向 `newObj` 而不
能指向先前绑定的 `context` 值。所以 `executeBound` 判断了这一情况，并实现了类
似 `new` 操作符的逻辑。

```js
  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder by default, allowing any combination of arguments to be
  // pre-filled. Set `_.partial.placeholder` for a custom placeholder argument.
  _.partial = restArgs(function(func, boundArgs) {
    var placeholder = _.partial.placeholder;
    var bound = function() {
      var position = 0, length = boundArgs.length;
      var args = Array(length);
      for (var i = 0; i < length; i++) {
        args[i] = boundArgs[i] === placeholder ? arguments[position++] : boundArgs[i];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return executeBound(func, bound, this, this, args);
    };
    return bound;
  });

  _.partial.placeholder = _;
```

`partial` 函数类似于科里化（curry），但功能更加强大。关键在于支持占位符。如：

```js
var subtract = function(a, b) { return b - a; };
subFrom20 = _.partial(subtract, _, 20);
subFrom20(5);
// => 15
```

并且，由于要支持占位符，所以每次执行 `_.partial` 返回的函数，它的内部都要访问
`_.partial` 定义时的参数，无形中降低了一些效率。即：

```js
args[i] = boundArgs[i] === placeholder ? arguments[position++] : boundArgs[i];
```

`_.throttle` 和 `_.debounce` 函数都比较有意思。其中 `_.throttle` 将对一个函数
进行包裹，返回一个函数，当我们迅速调用该函数时，在一个的时间范围内，至多被调用
一次。可以实验以下代码：

```js
var inc = (function() {
  var x = 0;
  return function() {
    x++;
    console.log("out>> ", x);
    return x;
  }
}());

var yyy = _.throttle(inc, 3000);

// 迅速调用 n 次
yyy(); // => out>> 1, 1
yyy(); // => 1
yyy(); // => 1
yyy(); // 3s 后 => out>> 2, 2
```

可以看到在 3s 内它只会被调用一次，且在这个时间范围内，调用直接返回前一次调用
得到的结果，而不实际执行函数。

`_.debound(func, wait)` 正好相反，如果执行了某个函数后，在 `wait` 时间内，若再
调用该函数，则不执行它，并且将等待时间置零，直到 `wait` 时间后才继续执行。

## Object 相关函数

```js
  // Keys in IE < 9 that won't be iterated by `for key in ...` and thus missed.
  var hasEnumBug = !{toString: null}.propertyIsEnumerable('toString');
  var nonEnumerableProps = ['valueOf', 'isPrototypeOf', 'toString',
                      'propertyIsEnumerable', 'hasOwnProperty', 'toLocaleString'];

  var collectNonEnumProps = function(obj, keys) {
    var nonEnumIdx = nonEnumerableProps.length;
    var constructor = obj.constructor;
    var proto = _.isFunction(constructor) && constructor.prototype || ObjProto;

    // Constructor is a special case.
    var prop = 'constructor';
    if (_.has(obj, prop) && !_.contains(keys, prop)) keys.push(prop);

    while (nonEnumIdx--) {
      prop = nonEnumerableProps[nonEnumIdx];
      if (prop in obj && obj[prop] !== proto[prop] && !_.contains(keys, prop)) {
        keys.push(prop);
      }
    }
  };
```

> In IE < 9, JScript will skip over any property in any object where there is a same-named property in the object's prototype chain that has the DontEnum attribute.

在 IE < 9 中，若 object 中的某个属性在它的原形链 (prototype chain)
上有一个同名的，具有 DontEnum 特性的属性，则在 `for key in object`
枚举时将被忽略。

上述代码就是用来处理这个情形。注意代码中是如何手工判断 `obj` 是否含有键 `prop` ：

```js
      if (prop in obj && obj[prop] !== proto[prop] && !_.contains(keys, prop)) {
        keys.push(prop);
      }
```

```js
  // An internal function for creating assigner functions.
  var createAssigner = function(keysFunc, defaults) {
    return function(obj) {
      var length = arguments.length;
      if (defaults) obj = Object(obj);
      if (length < 2 || obj == null) return obj;
      for (var index = 1; index < length; index++) {
        var source = arguments[index],
            keys = keysFunc(source),
            l = keys.length;
        for (var i = 0; i < l; i++) {
          var key = keys[i];
          if (!defaults || obj[key] === void 0) obj[key] = source[key];
        }
      }
      return obj;
    };
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = createAssigner(_.allKeys);
```

`createAssigner` 看似较为复杂，但只要了解了它如何使用，那其中的逻辑也不难理解
了。我们看 `_.extend` 的使用例子：

```js
_.extend({name: 'moe'}, {age: 50});
// => {name: 'moe', age: 50}
```

即，它以接收多个 object 作为参数，将第2个及之后的 object 的属性不断加入/覆盖到
第一个 object 中并返回。因此 `createAssigner` 的核心就是两层循环，外层对参数
进行迭代，内层对该参数的所有属性进行迭代。

```js
  // Internal pick helper function to determine if `obj` has key `key`.
  var keyInObj = function(value, key, obj) {
    return key in obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = restArgs(function(obj, keys) {
    var result = {}, iteratee = keys[0];
    if (obj == null) return result;
    if (_.isFunction(iteratee)) {
      if (keys.length > 1) iteratee = optimizeCb(iteratee, keys[1]);
      keys = _.allKeys(obj);
    } else {
      iteratee = keyInObj;
      keys = flatten(keys, false, false);
      obj = Object(obj);
    }
    for (var i = 0, length = keys.length; i < length; i++) {
      var key = keys[i];
      var value = obj[key];
      if (iteratee(value, key, obj)) result[key] = value;
    }
    return result;
  });
```

`_.pick` 的复杂性也是由于额外的支持引起的。由于它可以接受一个函数作为参数，用
作判断一个键是否选取的依据，因此它的代码中就要对参数 `keys` 是函数的情况进行
判断。如果 `keys` 只是普通的键名，则 `iteratee` 退化为 `keyInObj`。额外的一点
是，`_.pick` 除了接收函数作参数，同时还支持改变该函数的 `context`，函数中的

```js
if (keys.length > 1) iteratee = optimizeCb(iteratee, keys[1]);
```

就是起这个作用的。

```js
  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };
```

前面提到了链式调用，`_.tap(func)` 的作用是将 `func` 应用到链式调用的中间结果。
看 underscore.js 官方的例子：

```js
_.chain([1,2,3,200])
  .filter(function(num) { return num % 2 == 0; })
  .tap(alert)
  .map(function(num) { return num * num })
  .value();
=> // [2, 200] (alerted)
=> [4, 40000]
```

从 `_.tap` 的实现中我们注意到，几乎所有 underscore.js 内置的函数的第一个参数
都是 `obj`。而这样定义的函数我们又能以两种方式调用，如 `_.each` 函数：

```js
_.each([1,2,3], function (x) { console.log(x);}); // 1
_([1,2,3]).each(function (x) { console.log(x);}); // 2
// _([1,2,3]).each([3,4,5], function (x) { console.log(x);}); // 3 出错
```

而 `_.each = function(obj, iteratee, context) {...}` 包含三个参数，为什么第 2
种调用可行，而第三种调用则出错呢？

原因是：1、2 两种调用的根本就不是一个函数！

首先要注意的是 `_` 变量本身是一个函数，而在 Javascript 中，函数同时承载着
“类”的功能。因此要区分两种赋值方式：`_.attr = ...` 及 `_.prototype[attr] = ...`
第一种是为变量（对象）本身添加属性，第二种是为原型（类）添加属性。区分以下例
子：

```
var underscore = function () {}
underscore.attr = 10;
underscore.prototype['attr'] = 20;

console.log(underscore.attr); // => 10

var instance = new underscore();
console.log(instance.attr); // => 20
```

所以，当我们试图访问变量（对象）的某个属性时，它会首先寻找变量本身的属性，若不
存在，则通过原型链（prototype chain）进行查找。

回到 `_.each` 的例子上，`_.each([1,2,3], func...)` 的调用的方法是变量（对象）
`_` 的属性，而 `_([1,2,3]).each(...)` 调用的是变量（对象）`_([1,2,3])` 的属
性，而由于该变量并没有 `each` 属性，所以是调用的是 `_.prototype.each` 函数。

最后一个问题是 `_.prototype.each` 是在哪里设置的呢？答案是 `_.mixin` 函数中，
上文已有讨论。

## 相等判断

（不知道 Equality 怎么翻译）

这部分是用来学习 Javascript 内部判等机制的好材料。这里只涉及一个函数 `eq` 用来
深度判等，举例来说，两个数组相等，当且仅当包含同样个数，且每个元素都相等，由于
元素可能还是数组，所以要递归（深度）地进行判断。

先来个链接：[判等表格](https://dorey.github.io/JavaScript-Equality-Table/)

```js
  eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a === 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // `NaN`s are equivalent, but non-reflexive.
    if (a !== a) return b !== b;
    // Exhaust primitive checks
    var type = typeof a;
    if (type !== 'function' && type !== 'object' && typeof b != 'object') return false;
    return deepEq(a, b, aStack, bStack);
  };
```

可见，几乎所有的原子型数据都可以通过 `===` 进行判断。具体的判断方法参见 [ECMA6
Strict Equality
Comparison](http://www.ecma-international.org/ecma-262/6.0/index.html#sec-strict-equality-comparison)

个人觉得使用 `x === y` 有几点值得一说：

1. `===` 会首先判断 `x` 与 `y` 的类型，若不相同，则返回 `false`。
2. `===` 会判断 `x` 与 `y` 的值（原子类型），若相等，则返回 `true`，反之
`false`.
3. `NaN` 不等于任意数字，另 `-0 === +0`。
4. 对于非原子类型，当且仅当它们是指向同一个 object 时才 `===`。

接下去的 `deepEq` 函数很长，我们逐步分析。

```js

  // Internal recursive comparison function for `isEqual`.
  deepEq = function(a, b, aStack, bStack) {
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className !== toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, regular expressions, dates, and booleans are compared by value.
      case '[object RegExp]':
      // RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return '' + a === '' + b;
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive.
        // Object(NaN) is equivalent to NaN
        if (+a !== +a) return +b !== +b;
        // An `egal` comparison is performed for other numeric values.
        return +a === 0 ? 1 / +a === 1 / b : +a === +b;
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a === +b;
    }
    ...
  };
```

虽然在 `eq` 函数中判断了原子型数据，但由于我们可能创建了 underscore.js 的对
象，如 `_(1)` 或 `_("abc")`，它们并不是原子型数据，所以上面的代码相当于自己实
现了 `===` 的逻辑。根据 `a` `b`的类型进行相应的判断。

```js
    var areArrays = className === '[object Array]';
```

判断一个对象是否是 'Array' 的正确方法。

```js
    if (!areArrays) {
      if (typeof a != 'object' || typeof b != 'object') return false; // 1

      // Objects with different constructors are not equivalent, but `Object`s or `Array`s
      // from different frames are.
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(_.isFunction(aCtor) && aCtor instanceof aCtor &&
                               _.isFunction(bCtor) && bCtor instanceof bCtor)
                          && ('constructor' in a && 'constructor' in b)) {
        return false;
      }
    }
```

上文代码应是有些 Bug，因为函数并非数组，所以会进入该 `if` 语句，但由于它们的
类型并非 `object` 所以直接返回 `false`，即所有函数都不相等。考虑下面的测试用
例：

```js
var tmp = function () {}

_.isEqual(tmp, tmp); // => false, 似乎有些版本的 underscore.js 返回 true

var x = _(tmp);
var y = _(tmp);

_.isEqual(x, y); // => false
```

所以结果是所有的函数都不相等。

接下来重要的是下面这个代码：

```js
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.

    // Initializing stack of traversed objects.
    // It's done here since we only need them for objects and arrays comparison.
    aStack = aStack || [];
    bStack = bStack || [];
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] === a) return bStack[length] === b;
    }
```

上面的代码是用来检测环形数据结构的，什么意思呢？就是对象中直接或间接地引用了
自己本身，如：

```js
// 直接引用
var a = [];
a[0] = a;

// 间接引用
var x = [];
var y = [x];
x[0] = y;
```

上述检测环形数据的原理是：只要是环形数据，意味着在递归获取子结构时，在某个时
候，得到的子结构会与之前访问过的某一结构完全一致。如：

```
1 -> 2 -> 3 -> 4 -> 5
          ^         |
          |         v
          8 <- 7 <- 6
```

在第一次访问 3 时，`aStack` 中保存了整个环（3 -> 4 -> 5 -> 6 -> 7 -> 8 ->
...），所以第二次访问 3 时，仍然得到这个环（3 -> 4 -> 5 -> 6 -> 7 -> 8 ->
...），此时，条件 `if(aStack[length] === a)` 就会通过，从而检测出该环。

## 类型判断

接下去是一些类型判断的函数如 `isArray`，`isObject` 等。主要的判断依据是
`toString` 函数。

根据 [ELS6](http://ecma262-5.com/ELS5_HTML.htm#Section_15.2.4.2)，
`Object.prototype.toString` 会输出调用时 `this` 所指对象的内部 `[[Class]]` 属
性。输出 `"[object" + [[Class]] + "]"`。

例如，在创建数组对象时，对象的 `[[Class]]` 属性会被设置为 `Array`，故对数组调
用 `toString` 时将输出 `[object Array]`。

这里要注意的是 `toString` 的调用方法：`toString.call(obj)` 而非
`toString(obj)`。这就涉及到函数调用 `toString(obj)` 时 `this` 的值究竟是什
么？它的规则如下：

函数是否由 `new` 调用？

1. 是 -> `this` 指向新建的对象
2. 否 -> 函数是否由 `dot(.)` 进行调用？
    1. 是 -> `this` 指向 dot 之前的对象
    2. 否 -> `this` 指向全局对象 window

请参见 [图解 Javascript this 指向什么](http://web.jobbole.com/84046/)

测试下面代码的结果：

```js
toString("abc");      // => "[object Undefined]"
toString.call("abc"); // => "[object String]"
```

## template

模板函数是 underscore.js 中个人觉得最有趣的函数。

```js
  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  // NB: `oldSettings` only exists for backwards compatibility.
  _.template = function(text, settings, oldSettings) {
    if (!settings && oldSettings) settings = oldSettings;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset).replace(escapeRegExp, escapeChar);
      index = offset + match.length;

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      } else if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      } else if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }

      // Adobe VMs need the match returned to produce the correct offset.
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + 'return __p;\n';

    var render;
    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled source as a convenience for precompilation.
    var argument = settings.variable || 'obj';
    template.source = 'function(' + argument + '){\n' + source + '}';

    return template;
  };
```

当然在使用之前要明白它的 [使用方法](http://underscorejs.org/#template)。简单来
说就是预先定义好模板，之后就可以用它来生成字符串。

模板中支持三种替换类型：值替换（interpolate）`<%= ... %>`；执行替换
（evaluate） `<% ... %>` 及转义替换（escape） `<%- ... %>`。

下面的例子取自官网：

```
 var compiled = _.template("hello: <%= name %>");
 compiled({name: 'moe'});
 => "hello: moe"

 var template = _.template("<b><%- value %></b>");
 template({value: '<script>'});
 => "<b>&lt;script&gt;</b>"

 var compiled = _.template("<% print('Hello ' + epithet); %>");
 compiled({epithet: "stooge"});
 => "Hello stooge"
```

在试图看懂这段代码之前，我们先来了解 Javascript 中的
[eval](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval)
函数。它的作用是将输入的字符串作为代码执行。举个“看似”有用的例子：

```
function gen_getter_setter(obj, field) {
    var field_path = obj + '.' + field;

    return 'function get_' + field + '() {\n'
        + 'return ' + field_path + ';\n'
        + '}\n'
        + 'function set_' + field + '(val) {\n'
        + field_path + '= val;\n'
        + '}';
}

var object = {a: 10};

eval(gen_getter_setter('object', 'a'));

get_a(); // => 10
set_a(20);
object.a; // => 20
```

例子中 `gen_getter_setter('object', 'a')` 生成的字符串如下：

```
"function get_a() {
return object.a;
}
function set_a(val) {
object.a= val;
}"
```

也即我们生成了一个字符串，但字符串的内容完全符合 Javascript 的语法，因此
`eval` 可以根据 Javascript 的语法来解析该字符串。可以参考 Lisp 中的 Macro
（宏）。

说了这么多，可是代码里根本没有 `eval` 啊？好吧，是的，只是代码里通过 `new
Function(...)` 创建新的函数对象时，也是传递字符串作为函数的函数体（函数的正
文）。所以要明确的就是我们可以构建字符串，将字符串作为代码来执行。

因此，`_.template` 函数的大部分功能就是在构造 `render` 函数的函数体。我们先撇
开对 `source` 的构建，先看 `render` 的框架部分（重新调整了格式）：

```js
function (obj, _) {
  var __t,
      __p = '',
      __j = Array.prototype.join,
      print = function () {
        __p += __j.call(arguments, '');
      };

  with(obj || {}) {
      ...
      the content of source
      ...
  }

  return __p;
}
```

从上面的代码可以看出，生成的代码根据参数 `obj` 进行操作（具体操作未知），最终
将代码存放在变量 `__p` 中返回。

所以具体的操作就要看 `source` 中的内容，而它又是根据模板字符串 `text` 生成的。
下面再贴出主要逻辑的代码，以便于查看：

```js
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset).replace(escapeRegExp, escapeChar);
      index = offset + match.length;

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      } else if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      } else if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }

      // Adobe VMs need the match returned to produce the correct offset.
      return match;
    });
    source += "';\n";
```

这段代码将匹配 `_.template` 支持的三种模式，即 `<%= ... %>`、`<% .. %>`及`<%-
.. %>` 并将其替换成相应的代码。

例如：对于模板字符串 `"<b><%- value %></b>"`，则会进入 `escape` 分支（注意会调用不止一次），生成相应的代码放在之前的上下文中如下：


```js
function (obj, _) {
  var __t,
      __p = '',
      __j = Array.prototype.join,
      print = function () {
        __p += __j.call(arguments, '');
      };

  // the content of source

  with(obj || {}) {
      __p += '<b>'
        + ((__t = (value)) == null ? '' : _.escape(__t))
        + ''
        + '</b>';
  }

  return __p;
}
```

理解 `_.template` 代码要注意区分生成字符串的代码与生成的字符串。相信跟着例子
调试几次就能够完全理解它了。

## 写在后面

阅读 underscore.js 的代码花费了许多时间，但受益颇丰。通过深究其中的许多细节，
让我对 Javascript 的原理有了更深的理解和掌握。相信只要读者静下心来，仔细钻研
其中的细节，定有收获。

文章写得匆忙，也只是作为个人的笔记，若有错误不足之处，敬请批评指正。
