title: 写一个 Mustache 模板引擎
date: 2016-01-23 10:53:35
tags: [mustache, template engine]
categories: [Project]
toc: true
---

前几天在伯乐在线上看到 [介绍 mustache.js 的文
章](http://web.jobbole.com/84906/)。[Mustache](http://mustache.github.io/) 是
一种模板语言，语法简单，功能强大，已经有各个语言下的实现。那么我们今天就用
python 来一步步实现它吧！

## 前言

{% blockquote Richard Feynman %}
What I cannot create I do not understand.
{% endblockquote %}

要理解一个事物最有效的方式就是动手创造一个，而真正动手创造的时候，你会发现，
事情并没有相像中的困难。

首先要说说什么是编译器，它就像是一个翻译，将一种语言 X 翻译成另一种语言 Y。通
常语言 X 对人类更加友好，而语言 Y 则是我们不想直接使用的。以 C 语言编译器为
例，它的输出是汇编语言，汇编语言太琐碎了，通常我们不想直接用它来写程序。而
相对而言，C 语言就容易理解、容易编写。

但是翻译后的语言 Y 也需要实际去执行，在 C 语言的例子中，它是直接由硬件去执行
的，以此得到我们需要的结果。另一些情形下，我们需要做一台“虚拟机”来执行。例如
Java 的编译器将 Java 代码转换成 Java 字节码，硬件（CPU）本身并不认识字节码，
所以 Java 提供了 Java 虚拟机来实际执行它。

> 模板引擎 = 编译器 + 虚拟机

本质上，模板引擎的工作就是将模板转换成一个内部的结构，可以是抽象语法树
（AST），也可以是 python 代码，等等。同时还需要是一个虚拟机，能够理解这种内部
结构，给出我们需要的结果。

好吧，那么模板引擎够复杂啊！不仅要写个编译器，还要写个虚拟机！放弃啦，不干啦！
莫慌，容我慢慢道来～

## Mustache 简介

[Mustache](https://mustache.github.io/mustache.5.html) 自称为 logic-less，与一
般模板不同，它不包含 `if`, `for` 这样的逻辑标签，而统一用 {%raw%}{{#prop}}{%endraw%} 之类的
标签解决。下面是一个 Mustache 模板：

```
Hello {{name}}
You have just won {{value}} dollars!
{{#in_ca}}
Well, {{taxed_value}} dollars, after taxes.
{{/in_ca}}
```

对于如下的数据，JSON 格式的数据：

```
{
  "name": "Chris",
  "value": 10000,
  "taxed_value": 10000 - (10000 * 0.4),
  "in_ca": true
}
```

将输出如下的文本：

```
Hello Chris
You have just won 10000 dollars!
Well, 6000.0 dollars, after taxes.
```

所以这里稍微总结一下 Mustache 的标签：

- {%raw%}{{ name }}{%endraw%}: 获取数据中的 `name` 替换当前文本
- {%raw%}{{# name }} ... {{/name}}{%endraw%}: 获取数据中的 `name` 字段并依据数据的类型，执行如下操作：
    - 若 `name` 为假，跳过当前块，即相当于 `if` 操作
    - 若 `name` 为真，则将 `name` 的值加入上下文并解析块中的文本
    - 若 `name` 是数组且个数大于 0，则逐个迭代其中的数据，相当于 `for`

逻辑简单，易于理解。下面就让我们来实现它吧！

## 模板引擎的结构

如前文所述，我们实现的模板引擎需要包括一个编译器，以及一个虚拟机，我们选择
抽象语法树作为中间表示。下图是一个图示：

{% asset_img template-engine-structure.png Template Engine Structure %}

学过编译原理的话，你可能知道编译器包括了词法分析器、语法分析器及目标代码的生
成。但是我们不会单独实现它们，而是一起实现原因有两个：

1. 模板引擎的语法通常要简单一些，Mustache 的语法比其它引擎比起来更是如此。
2. Mustache 支持动态修改分隔符，因此词法的分析和语法的分析必需同时进行。

下面开始 Coding 吧！

## 辅助函数

### 上下文查找

首先，Mustache 有所谓上下文栈（context stack）的概念，每进入一个
{%raw%}{{#name}}...{{/name}}{%endraw%} 块，就增加一层栈，下面是一个图示：

{% asset_img context-stack.png Context Stack %}

这个概念和 Javscript 中的原型链是一样的。只是 Python 中并没有相关的支持，因此
我们实现自己的查找函数：

```python
def lookup(var_name, contexts=()):
    for context in reversed(contexts):
        try:
            if var_name in context:
                return context[var_name]
        except TypeError as te:
            # we may put variable on the context, skip it
            continue
    return None
```

如上，每个上下文（context）可以是一个字典，也可以是数据元素（像字符串，数字等
等），而上下文栈则是一个数组，`contexts[0]` 代表栈底，`context[-1]` 代表栈顶。
其余的逻辑就很明直观了。

### 单独行判定

Mustache 中有“单独行”（standalone）的概念，即如果一个标签所在的行，除了该标
签外只有空白字符，则称为单独行。判断函数如下：


```python
spaces_not_newline = ' \t\r\b\f'
re_space = re.compile(r'[' + spaces_not_newline + r']*(\n|$)')
def is_standalone(text, start, end):
    left = False
    start -= 1
    while start >= 0 and text[start] in spaces_not_newline:
        start -= 1

    if start < 0 or text[start] == '\n':
        left = True

    right = re_space.match(text, end)
    return (start+1, right.end()) if left and right else None
```

其中，`(start, end)` 是当前标签的开始和结束位置。我们分别向前和向后匹配空白字
符。向前是一个个字符地判断，向后则偷懒用了正则表达式。右是单独行则返回单独行的
位置：`(start+1, right.end())`。

{% asset_img standalone.png Standalone Line %}

## 语法树

我们从语法树讲起，因为这是编译器的输出，先弄清输出的结构，我们能更好地理解编译
器的工作原理。

首先介绍树的节点的类型。因为语法树和 Mustache 的语法对应，所以节点的类型和
Mustache 支持的语法类型对应：

```python
class Token():
    """The node of a parse tree"""
    LITERAL   = 0
    VARIABLE  = 1
    SECTION   = 2
    INVERTED  = 3
    COMMENT   = 4
    PARTIAL   = 5
    ROOT      = 6
```

这 6 种类型中除了 `ROOT`，其余都对应了 Mustache 的一种类型，对应关系如下：

- `LITERAL`：纯文本，即最终按原样输出的部分
- `VARIABLE`：变量字段，即 {%raw%}{{ name }}{%endraw%} 类型
- `SECTION`：对应 {%raw%}{{#name}} ... {{/name}}{%endraw%}
- `INVERTED`：对应 {%raw%}{{^name}} ... {{/name}}{%endraw%}
- `COMMENT`：注释字段 {%raw%}{{! name }}{%endraw%}
- `PARTIAL`：对应 {%raw%}{{> name}}{%endraw%}

而最后的 `ROOT` 则代表整棵语法树的根节点。

{% asset_img AST.png AST %}

了解了节点的类型，我们还需要知道每个节点需要保存什么样的信息，例如对于
`Section` 类型的节点，我们需要保存它对应的子节点，另外为了支持 `lambda` 类型的
数据，我们还需要保存 `section` 段包含的文本。最终需要的字段如下：

```python
    def __init__(self, name, type=LITERAL, value=None, text='', children=None):
        self.name = name
        self.type = type
        self.value = value
        self.text = text
        self.children = children
        self.escape = False
        self.delimiter = None # used for section
        self.indent = 0 # used for partial
```

- `name` ：保存该节点的名字，例如 {%raw%}{{ header }}{%endraw%} 是变量类型，`name` 字段保存
  的就是 `header` 这个名字。
- `type`：保存前文介绍的节点的类型
- `value`：保存该节点的值，不同类型的节点保存的内容也不同，例如 `LITERAL` 类型
  保存的是字符串本身，而 `VARIABLE` 保存的是变量的名称，和 `name` 雷同。
- `text` ：只对 `SECTION` 和 `INVERTED` 有用，即保存包含的文本
- `children`：`SECTION`、`INVERTED`及`ROOT`类型使用，保存子节点
- `escape`：输出是否要转义，例如 {%raw%}{{name}}{%endraw%} 是默认转义的，而{%raw%}{{{name}}}{%endraw%}默认不
  转义
- `delimiter`：与 `lambda` 的支持有关。Mustache 要求，若 `SECTION` 的变量是一
  个函数，则先调用该函数，返回时的文本用当前的分隔符解释，但在编译期间这些文本
  是不可获取的，因此需要事先存储。
- `indent` 是 `PARTIAL` 类型使用，后面会提到。

可以看到，语法树的类型、结构和 Mustache 的语法息息相关，因此，要理解它的最好
方式就是看 [Mustache 的标准](https://github.com/mustache/spec)。 一开始写这个
引擎时并不知道需要这么多的字段，在阅读标准时，随着对 Mustache 语法的理解而慢慢
添加的。

## 虚拟机

所谓的虚拟机就是对编译器输出（我们的例子中是语法树）的解析，即给定语法树和
数据，我们能正确地输出文本。首先我们为 Token 类定义一个调度函数：

```python
class Token():
    ...
    def render(self, contexts, partials={}):
        if not isinstance(contexts, (list, tuple)): # ①
            contexts = [contexts]

        # ②
        if self.type == self.LITERAL:
            return self._render_literal(contexts, partials)
        elif self.type == self.VARIABLE:
            return self._render_variable(contexts, partials)
        elif self.type == self.SECTION:
            return self._render_section(contexts, partials)
        elif self.type == self.INVERTED:
            return self._render_inverted(contexts, partials)
        elif self.type == self.COMMENT:
            return self._render_comments(contexts, partials)
        elif self.type == self.PARTIAL:
            return self._render_partials(contexts, partials)
        elif self.type == self.ROOT:
            return self._render_children(contexts, partials)
        else:
            raise TypeError('Invalid Token Type')
```
①：我们要求上下文栈（context stack）是一个列表（或称数组），为了方便用户，我们
允许它是其它类型的。

②的逻辑很简单，就是根据当前节点的类型执行不同的函数用来渲染（render）文本。

另外每个“渲染函数”都有两个参数，即上下文栈`contexts` 和 `partials`。
`partials`是一个字典类型。它的作用是当我们在模板中遇见如 {%raw%}{{> part}}{%endraw%} 的标签
中，就从 `partials` 中查找 `part`，并用得到的文本替换当前的标签。具体的使用方
法可以参考 [Mustache 文档](http://mustache.github.io/mustache.5.html#Partials)

### 辅助渲染函数

它们是其它“子渲染函数”会用到的一些函数，首先是转义函数：

```python
from html import escape as html_escape
EMPTYSTRING = ""

class Token():
    ...
    def _escape(self, text):
        ret = EMPTYSTRING if not text else str(text)
        if self.escape:
            return html_escape(ret)
        else:
            return ret
```

作用是如果当前节点需要转义，则调用 `html_escape` 进行转义，例如将文本 `<b>`
转义成 `&lt;b&gt;`。

另一个函数是查找（lookup），在给定的上下文栈中查找对应的变量。

```python
class Token():
    ...
    def _lookup(self, dot_name, contexts):
        if dot_name == '.':
            value = contexts[-1]
        else:
            names = dot_name.split('.')
            value = lookup(names[0], contexts)
            # support {{a.b.c.d.e}} like lookup
            for name in names[1:]:
                try:
                    value = value[name]
                except:
                    # not found
                    break;
        return value
```

这里有两点特殊的地方：

1. 若变量名为 `.`，则返回当前上下文栈中栈顶的变量。这是 Mustache 的特殊语法。
2. 支持诸如以 `.` 号为分隔符的层级访问，如 {%raw%}{{a.b.c}}{%endraw%} 代表首先查找变量 `a`，
   在 `a` 的值中查找变量 `b`，以此类推。

### 字面量

即 `LITERAL` 类型的节点，在渲染时直接输出节点保存的字符串即可：

```python
    def _render_literal(self, contexts, partials):
        return self.value
```

### 子节点

子节点的渲染其实很简单，因为语法树是树状的结构，所以只要递归调用子节点的渲染
函数就可以了，代码如下：

```python
    def _render_children(self, contexts, partials):
        ret = []
        for child in self.children:
            ret.append(child.render(contexts, partials))
        return EMPTYSTRING.join(ret)
```

### 变量

即遇到诸如 {%raw%}{{name}}{%endraw%}、{%raw%}{{{name}}}{%endraw%} 或 {%raw%}{{&name}}{%endraw%} 等的标签时，从上下文栈中查
找相应的值即可：

```python
    def _render_variable(self, contexts, partials):
        value = self._lookup(self.value, contexts)

        # lambda
        if callable(value):
            value = render(str(value()), contexts, partials)

        return self._escape(value)
```

这里的唯一不同是对 `lambda` 的支持，如果变量的值是一个可执行的函数，则需要先
执行它，将返回的结果作为新的文本，重新渲染。这里的 `render` 函数后面会介绍。

例如：

```
contexts = [{ 'lambda': lambda : '{{value}}', 'value': 'world' }]

'hello {{lambda}}' => 'hello {{value}}' => 'hello world'
```

### Section

Section 的渲染是最为复杂的一个，因为我们需要根据查找后的数据的类型做不同的处理。

```python
    def _render_section(self, contexts, partials):
        val = self._lookup(self.value, contexts)
        if not val:
            # false value
            return EMPTYSTRING

        if isinstance(val, (list, tuple)):
            if len(val) <= 0:
                # empty lists
                return EMPTYSTRING

            # non-empty lists
            ret = []
            for item in val: #①
                contexts.append(item)
                ret.append(self._render_children(contexts, partials))
                contexts.pop()
            return self._escape(''.join(ret))
        elif callable(val): #②
            # lambdas
            new_template = val(self.text)
            value = render(new_template, contexts, partials, self.delimiter)
        else:
            # context ③
            contexts.append(val)
            value = self._render_children(contexts, partials)
            contexts.pop()

        return self._escape(value)
```

①：当数据的类型是列表时，我们逐个迭代，将元素入栈并渲染它的子节点。

②：当数据的类型是函数时，与处理变量时不同，Mustache 要求我们将 Section 中包含
的文本作为参数，调用该函数，再对该函数返回的结果作为新的模板进行渲染。且要求
使用当前的分隔符。

③：正常情况下，我们需要渲染 Section 包含的子节点。注意 `self.text` 与
`self.children` 的区别，前者是文本字符串，后者是编译后的语法树节点。

### Inverted

Inverted Section 起到的作用是 `if not`，即只有当数据为假时才渲染它的子节点。

```python
    def _render_inverted(self, contexts, partials):
        val = self._lookup(self.value, contexts)
        if val:
            return EMPTYSTRING
        return self._render_children(contexts, partials)
```

### 注释

直接跳过该子节点即可：

```python
    def _render_comments(self, contexts, partials):
        return EMPTYSTRING
```

### Partial

Partial 的作用相当于预先存储的模板。与其它模板语言的 `include` 类似，但还可以
递归调用。例如：

```
partials: {'strong': '<strong>{{name}}</strong>'}

'hello {{> strong}}' => 'hello <strong>{{name}}</strong>'
```

代码如下：

```python
re_insert_indent = re.compile(r'(^|\n)(?=.|\n)', re.DOTALL) #①

class Token():
    ...
    def _render_partials(self, contexts, partials):
        try:
            partial = partials[self.value]
        except KeyError as e:
            return self._escape(EMPTYSTRING)

        partial = re_insert_indent.sub(r'\1' + ' '*self.indent, partial) #②

        return render(partial, contexts, partials, self.delimiter)
```

这里唯一值得一提的就是缩进问题②。Mustache 规定，如果一个 partial 标签是一个“单
独行”，则需要将该标签的缩进添加到数据的所有行，然后再进行渲染。例如：

```
partials: {'content': '<li>\n {{name}}\n</li>\n'}

|                           |<ul>
|<ul>                       |    <li>
|    {{> content}}   =>     |     {{name}}
|</ul>                      |    </li>
|                           |</ul>
```

因此我们用正则表达式对 partial 的数据进行处理。①中的正则表达式，`(^|\n)` 用于
匹配文本的开始，或换行符之后。而由于我们不匹配最后一个换行符，所以我们用了
`(?=.|\n)`。它要求，以任意字符结尾，而由于 `.` 并不匹配换行符 `\n`，因此用了或
操作(`|`)。

### 虚拟机小结

综上，我们就完成了执行语法树的虚拟机。是不是还挺简单的。的确，一旦决定好了数据
结构，其它的实现似乎也只是按部就班。

最后额外指出一个问题，那就是编译器与解释器的问题。传统上，解释器是指一句一句
读取源代码并执行；而编译器是读取全部源码并编译，生成目标代码后一次性去执行。

在我们的模板引擎中，语法树是属于编译得到的结果，因为模板是固定的，因此能得到一
个固定的语法树，语法树可以重复执行，这也有利于提高效率。但由于 Mustache 支持
partial 及 lambda，这些机制使得用户能动态地为模板添加新的内容，所以固定的语法
树是不够的，因此我们在渲染时用到了全局 `render` 函数。它的作用就相当于解释器，
让我们能动态地渲染模板（本质上依旧是编译成语法树再执行）。

有了这个虚拟机（带执行功能的语法树），我们就能正常渲染模板了，那么接下来就是
如何把模板编译成语法树了。

## 词法分析

Mustache 的词法较为简单，并且要求能动态改变分隔符，所以我们用正则表达式来一个
个匹配。

Mustache 标签由左右分隔符包围，默认的左右分隔符分别是 `{ {`（忽略中间的空格） 和 `}}`：

```python
DEFAULT_DELIMITERS = ('{{', '}}')
```

而标签的模式是：左分隔符 + 类型字符 + 标签名 + （可选字符）+ 右分隔符，例如：
{%raw%}{{# name}}{%endraw%} 和 {%raw%}{{{name}}}{%endraw%}。其中 `#` 就代表类型，{%raw%}{{{name}}}{%endraw%} 中的`}` 就是
可选的字符。

```python
re_tag = re.compile(open_tag + r'([#^>&{/!=]?)\s*(.*?)\s*([}=]?)' + close_tag, re.DOTALL)
```

例如：
```
In [6]: re_tag = re.compile(r'{{([#^>&{/!=]?)\s*(.*?)\s*([}=]?)}}', re.DOTALL)

In [7]: re_tag.search('before {{# name }} after').groups()
Out[7]: ('#', 'name', '')
```
这样通过这个正则表达式就能得到我们需要的类型和标签名信息了。

只是，由于 Mustache 支持修改分隔符，而正则表达式的 compile 过程也是挺花时间
的，因此我们要做一些缓存的操作来提高效率。

```python
re_delimiters = {}

def delimiters_to_re(delimiters):
    # caching
    delimiters = tuple(delimiters)
    if delimiters in re_delimiters:
        re_tag = re_delimiters[delimiters]
    else:
        open_tag, close_tag = delimiters

        # escape ①
        open_tag = ''.join([c if c.isalnum() else '\\' + c for c in open_tag])
        close_tag = ''.join([c if c.isalnum() else '\\' + c for c in close_tag])

        re_tag = re.compile(open_tag + r'([#^>&{/!=]?)\s*(.*?)\s*([}=]?)' + close_tag, re.DOTALL)
        re_delimiters[delimiters] = re_tag

    return re_tag
```

①：这是比较神奇的一步，主要是有一些字符的组合在正则表达式里是有特殊含义的，为
了避免它们影响了正则表达式，我们将除了字母和数字的字符进行转义，如 `'[' => '\['`。

## 语法分析

现在的任务是把模板转换成语法树，首先来看看整个转换的框架：

```python
def compiled(template, delimiters=DEFAULT_DELIMITERS):
    re_tag = delimiters_to_re(delimiters)

    # variable to save states ①
    tokens = []
    index = 0
    sections = []
    tokens_stack = []

    m = re_tag.search(template, index)

    while m is not None:
        token = None
        last_literal = None
        strip_space = False

        if m.start() > index: #②
            last_literal = Token('str', Token.LITERAL, template[index:m.start()])
            tokens.append(last_literal)

        prefix, name, suffix = m.groups()
        # >>> TODO: convert information to AST

        if token is not None: #③
            tokens.append(token)

        index = m.end()
        if strip_space: #④
            pos = is_standalone(template, m.start(), m.end())
            if pos:
                index = pos[1]
                if last_literal: last_literal.value = last_literal.value.rstrip(spaces_not_newline)

        m = re_tag.search(template, index)

    tokens.append(Token('str', Token.LITERAL, template[index:]))
    return Token('root', Token.ROOT, children=tokens)
```

可以看到，整个步骤是由一个 while 循环构成，循环不断寻找下一个 Mustache 标签。
这意味着我的解析是线性的，但我们的目标是生成树状结构，这怎么办呢？答案是①中，
我们维护了两个栈，一个是 `sections`，另一个是 `tokens_stack`。至于怎么使用，下
文会提到。

②：由于每次 while 循环时，我们跳过了中间那些不是标签的字面最，所以我们要将它们
进行添加。这里将该节点保存在 `last_literal` 中是为了处理“单独行的情形”，详情见
下文。

③：正常情况下，在循环末我们会将生成的节点（token）添加到 `tokens` 中，而有些
情况下我们希望跳过这个逻辑，此时将 token 设置成 `None`。

④：`strip_space` 代表该标签需要考虑“单独行”的情形，此时做出相应的处理，一方面
将上一个字面量节点的末尾空格消除，另一方面将 index 后移至换行符。

### 分隔符的修改

唯一要注意的是 Mustache 规定分隔符的修改是需要考虑“单独行”的情形的。

```python
        if prefix == '=' and suffix == '=':
            # {{=| |=}} to change delimiters
            delimiters = re.split(r'\s+', name)
            if len(delimiters) != 2:
                raise SyntaxError('Invalid new delimiter definition: ' + m.group())
            re_tag = delimiters_to_re(delimiters)
            strip_space = True
```

### 变量

在解析变量时要考虑该变量是否需要转义，并做对应的设置。另外，末尾的可选字符
(suffix) 只能是 `}` 或 `=`，分别都判断过了，所以此外的情形都是语法错误。

```python
        elif prefix == '{' and suffix == '}':
            # {{{ variable }}}
            token = Token(name, Token.VARIABLE, name)

        elif prefix == '' and suffix == '':
            # {{ name }}
            token = Token(name, Token.VARIABLE, name)
            token.escape = True

        elif suffix != '' and suffix != None:
            raise SyntaxError('Invalid token: ' + m.group())

        elif prefix == '&':
            # {{& escaped variable }}
            token = Token(name, Token.VARIABLE, name)
```

### 注释

注释是需要考虑“单独行”的。

```python
        elif prefix == '!':
            # {{! comment }}
            token = Token(name, Token.COMMENT)
            if len(sections) <= 0:
                # considered as standalone only outside sections
                strip_space = True
```

### Partial

一如既往，需要考虑“单独行”，不同的是还需要保存单独行的缩进。

```python
        elif prefix == '>':
            # {{> partial}}
            token = Token(name, Token.PARTIAL, name)
            strip_space = True

            pos = is_standalone(template, m.start(), m.end())
            if pos:
                token.indent = len(template[pos[0]:m.start()])
```

### Section & Inverted

这是唯一需要使用到栈的两个标签，原理是选通过入栈记录这是 Section 或 Inverted
的开始标签，遇到结束标签时再出栈即可。

由于事先将 tokens 保存起来，因此遇到结束标签时，tokens 中保存的就是当前标签的
所有子节点。

```python
        elif prefix == '#' or prefix == '^':
            # {{# section }} or # {{^ inverted }}
            token = Token(name, Token.SECTION if prefix == '#' else Token.INVERTED, name)
            token.delimiter = delimiters
            tokens.append(token)

            # save the tokens onto stack
            token = None
            tokens_stack.append(tokens)
            tokens = []

            sections.append((name, prefix, m.end()))
            strip_space = True
```

### 结束标签

当遇到结束标签时，我们需要进行对应的出栈操作。无它。

```python
        elif prefix == '/':
            tag_name, sec_type, text_end = sections.pop()
            if tag_name != name:
                raise SyntaxError("unclosed tag: '" + name + "' Got:" + m.group())

            children = tokens
            tokens = tokens_stack.pop()

            tokens[-1].text = template[text_end:m.start()]
            tokens[-1].children = children
            strip_space = True

        else:
            raise SyntaxError('Unknown tag: ' + m.group())
```

### 语法分析小结

同样，语法分析的内容也是按部就班，也许最难的地方就在于构思这个 while 循环。所
以要传下教：思考问题的时候要先把握整体的内容，即要自上而下地思考，实际编码的
时候可以从两边同时进行。

## 最后

最后我们再实现 `render` 函数，用来实际执行模板的渲染。

```python
class SyntaxError(Exception):
    pass

def render(template, contexts, partials={}, delimiters=None):
    if not isinstance(contexts, (list, tuple)):
        contexts = [contexts]

    if not isinstance(partials, dict):
        raise TypeError('partials should be dict, but got ' + type(partials))

    delimiters = DEFAULT_DELIMITERS if delimiters is None else delimiters
    parent_token = compiled(template, delimiters)
    return parent_token.render(contexts, partials)
```

这是一个使用我们模板引擎的例子：

```
>>> render('Hellow {{name}}!', {'name': 'World'})
'Hellow World!'
```

## 总结

综上，我们完成了一个完整的 mustache 模板引擎，完整的代码可以在 [Github: pymustache](https://github.com/lotabout/pymustache/blob/master/pymustache/mustache.py) 上下载。

实际测试了一下，我们的实现比 [pystache](https://github.com/defunkt/pystache)
还更快，代码也更简单，去掉注释估计也就 300 行左右。

无论如何吧，我就想打个鸡血：如果真正去做了，有些事情并没有看起来那么
难。如果本文能对你有所启发，那就是对我最大的鼓励。
