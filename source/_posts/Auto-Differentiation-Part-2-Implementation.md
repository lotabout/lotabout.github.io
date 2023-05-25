title: 自动微分（Automatic Differentiation）：实现篇
toc: true
date: 2023-04-16 08:43:25
tags: [Automatic Differentiation, Neural Network]
categories: Notes
math: true
---

前情提要：在{% post_link Auto-Differentiation-Part-1-Algorithm 算法篇%}中，我
们介绍了深度学习领域基本都是使用自动微分(Automatic Differentiation)来计算偏导
的。本篇中我们要尝试自己做一个实现。

## 目标

如果有函数 $f(x_1, \cdots, x_n)$，我们要使用链式法则计算函数 $f$ 对所有输入
$x_i$ 的偏导。我们记中间函数为 $v$，记 $\bar{v_i} = \frac{\partial f}{\partial
v_i}$，则最核心的计算公式为：

$$
\bar{v_i} = \frac{\partial f}{\partial v_i}
= \sum_{j \in next(i)}{\overline{v_{i\to j}}}
= \sum_{j \in next(i)}{\frac{\partial f}{\partial v_{j}} \frac{\partial v_{j}}{\partial v_i}
= \sum_{j \in next(i)}{\overline{v_j} \frac{\partial v_{j}}{\partial v_i}}}
$$

大家可以配合算法篇的图来理解：

{% asset_img 2023-04-AD-example-computation-graph.svg %}

## 整体思路

首先需要允许用户构建计算图，很自然地关心 3 个部分：

1. 节点。计算图中的节点代表了计算，如 `sin` 这样的函数，我们把它叫作算子
   (operator)。在 AD 的场景下，算子既要关心前向计算，也需要关心后向求导
2. 边。需要有办法找到算子的上下游，在 AD 中我们使用邻接表来表示[^ref-graph-representation]
3. 边上流转的数据。边上流转的有正向的计算数据，逆向的偏导数据，我们会统一用张
   量(Tensor)来表示

[^ref-graph-representation]: 除了邻接表外还有邻接矩阵的表示方法，参考[维基百科](https://en.wikipedia.org/wiki/Graph_theory#Tabular:_Graph_data_structures)

要注意的是为了符合用户的使用习惯，我们并不是要求用户直接给出一个“节点” List，
再给出一个“边” List。计算图是隐式构建的。因此实际上是 `数据 --(来源)--> 节点
--(输入)--> 数据` 这样的引用关系。

计算图构建好之后，需要有遍历引擎，按拓扑排序顺序，正向地、逆向地遍历所有节点，
正向计算输出，逆向计算偏导。这里的执行引擎其实有很多可以优化的空间，比如多线程
计算，多节点合并计算等，但本文里就是简单地走流程。

最终希望怎么使用呢？

```python
x1 = Tensor(np.array([0.5]), requires_grad=True)
x2 = Tensor(np.array([0.5]), requires_grad=True)
v3 = sin(x1)
v4 = mul(x1, x2)
v5 = add(v3, v4)
grad = np.array([1])
v5.backward(grad)
print(x1.grad) # expected to be 1.37758
print(x2.grad) # expected to be 0.5
```

## 框架实现

### Tensor

我们用张量 `Tensor` 来定义数据部分。代码如下：

```python
class Tensor(object):
    """tensor"""
    def __init__(self, ndarray: NDArray, requires_grad=False, grad_fn=None):
        super(Tensor, self).__init__()
        self.ndarray = ndarray            # ①
        self.requires_grad = requires_grad  # ②
        self.grad_fn = grad_fn            # ③
        self.grad = None                  # ④
        self._grad_accmulator = None

    def is_leaf(self) -> bool:
        return self.requires_grad and self.grad_fn is None

    def backward(self, output_grad):
        if self.grad_fn is None:
            raise "backward could not be called if grad_fn is None"
        execute_graph(self.grad_fn, output_grad)

    def __str__(self):
        grad_info = f' grad_fn={self.grad_fn}' if self.grad_fn is not None else ''
        return f'tensor({self.ndarray}{grad_info})'

    def __repr__(self):
        return self.__str__()
```

① 中使用 `numpy.ndarray` 保存前向数据，直接使用 numpy 来减少复杂度，毕竟我们只
关心 AD 部分

③ 的 `grad_fn` 可以理解成保存的是 `Tensor` 的来源算子。实际上当 Tensor 生成时，
对应的数据就计算完成了，记录它的来源也没有意义，但由于后续还要反向计算偏导，才
需要记录来源来反查。因此只有在 ② `requires_grad = True` 时才有记录的必要。

④ 的 `grad` 就是偏导的结果，即 $\bar{v_i}$ 的值。

### Operator

首先算子既需要管前向计算，也需要关心后向求导，于是框架性的定义如下：

```python
# 注意 Operator 里计算的都是 Tensor 内部的数据，即 NDArray
class Operator(object):
    def __init__(self):
        super(Operator, self).__init__()
        self.next_ops = [] # ①

    def forward(self, *args: Tuple[NDArray]) -> NDArray:
        raise NotImplementedError("Should be override by subclass")

    def backward(self, output_grad: Tuple[NDArray]) -> Union[NDArray, Tuple[NDArray]]:
        raise NotImplementedError("Should be override by subclass")
```

`forward` 代表前向计算，可以有多个输入。`backward` 则相反，给定输出的偏导，需
要为每个输入输出一个偏导。即如果 $op = f(x, y)$，则 `forward` 输出的是
$f(x, y)$ 的值，而 `backward` 输出为 $[\frac{\partial op}{\partial x}, \frac{\partial op}{\partial y}]$

但仅有两个计算方法是不够的，在 `forward` 计算时，算子还需要维护“边”的信息，在
后向计算偏导时使用。①中的 `next_ops` 就是用来计算边的信息的，例如样例代码中，
执行完 `v5 = add(v3, v4)` 后，内部信息如下图：

{% asset_img 2023-04-AD-Op-Graph.svg %}

但我们不希望建图的操作在每个算子中都实现一遍，因此我们在父类上实现 `__call__`
函数，在使用时用户不应该直接调用 `forward` 函数，而应该直接调用 `__call__` 函
数，实现如下：

```python
    def __call__(self, *args: Tuple[Tensor]) -> Tensor:
        grad_fn = None
        requires_grad = any((t.requires_grad for t in args)) # ①

        if requires_grad:
            # add edges
            for input in args:
                if input.is_leaf(): # ②
                    if input._grad_accmulator is None:
                        input._grad_accmulator = OpAccumulate(input)
                    self.next_ops.append(input._grad_accmulator)
                else:
                    self.next_ops.append(input.grad_fn) # ③
            grad_fn = self

        inputs = [t.ndarray for t in args]
        output = self.forward(*inputs) # ④
        return Tensor(output, requires_grad=requires_grad, grad_fn=grad_fn) # ⑤
```

其中 ① 会将输入 Tensor 的 `requires_grad` 值传染给输出，算子任意输入 Tensor 中，
只要有一个需要算梯度，则输出的 Tensor 也需要计算梯度。另外④中可以看出
`__call__` 就是 `forward` 方法的包装。注意到 `forward` 的输出是 ndarray，而因
为算子输出也需要是 Tensor，因此在 ⑤ 中做了封装。

在构造计算图时，会将 `input.grad_fn` 指向的算子，加入 `next_ops` 中，如 ③ 所示。
只有②的例外，如果输入本身就是叶子节点，则它的 `grad_fn` 没有指向任何节点，因此
这里构造了一个特殊的 `OpAccumulate` 算子来累加并设置梯度，如下所示：

```python
class OpAccumulate(Operator):
    def __init__(self, tensor):
        super(OpAccumulate, self).__init__()
        self.tensor = tensor
    def backward(self, grad):
        self.tensor.grad = Tensor(grad)
        return grad
```

### 计算图遍历

计算图是一个有向无环图（简称 DAG），DAG 遍历的重点是需要按拓扑排序遍历，在一个
算子的所有输入都被满足时才能执行该算子的 `backward` 方法。于是我们先搞个辅助函
数，按拓扑的顺序，统计每个算子依赖的输入个数。

```python
def compute_dependencies(root):
    # deps: {op: num}
    deps = {}
    q = deque()
    traversed = {root}
    q.append(root)
    while len(q) != 0:
        cur = q.pop()
        if len(cur.next_ops) == 0:
            continue
        for next in cur.next_ops:
            deps[next] = deps.get(next, 0) + 1
            if next not in traversed:
                q.append(next)
                traversed.add(next)
    return deps
```

在样例代码里，最终会以 `root = op:+` 来调用，因此它会返回类似如下信息（当然
key 会是各个实例化的算子，而不是字符串）：

```
{
  "op:+": 1,
  "op:sin": 1,
  "op:*": 1,
  "op:acc|x1": 2,
  "op:acc|x2": 1,
}
```

接下来我们会遍历整个图：

```python
def execute_graph(root, output_grad):
    deps = compute_dependencies(root)
    inputs = {root: output_grad}  # ①

    q = deque()
    q.append(root)
    while len(q) != 0:
        task = q.pop()
        input = inputs[task]
        outputs = task.backward(input)
        if not isinstance(outputs, collections.abc.Sequence):
            outputs = [outputs]

        for next_op, output in zip(task.next_ops, outputs):
            if next_op is None:
                continue

            # accumulate the "inputs" for next_op # ②
            op_input = inputs.get(next_op, 0)
            inputs[next_op] = op_input + output

            deps[next_op] -= 1
            if deps[next_op] == 0: # ③
                q.append(next_op)
```

这个遍历过程可说的内容也不多，就是将 ready 的算子一个个放进队列 `q` 中，一个个
执行它们的 `backward` 方法。其中比较关键的是，如果算子 `backward` 的输入如果有
多个，则需要在 ① 中缓存部分输入，并且在 ② 中当新的输入到来需要进行累加，这里对应
了开头公式 $\bar{v_i} = \sum_{j \in next(i)}{\overline{v_{i\to j}}}$ 的部分。
最后在 ③ 中，要确保目标算子的所有输入都计算完成，才认为目标算子 ready 了。

如此，所有“框架”层面的内容均实现完毕。

## 具体算子

有了框架还不够，还需要实现算子，而实现算子最关键的是可能需要在 `forward` 过程
中记录输入信息，在 `backward` 中用来计算偏导。例如文章开头的样例中 $\bar{v_2}
= \bar{v_4} v_1$ 就需要在 `forward` 时记录 $v_1$ 的值。下面补齐示例中需要的几
个算子

另外注意下面的代码中除了实现算子，我们还实现了诸如 `add, mul` 等函数，方便对
Tensor 构建计算图。

### 元素加法

```python
class OpEWiseAdd(Operator):
    # func: y = a + b
    # deri: y'/a' = 1
    # deri: y'/b' = 1
    def forward(self, a: NDArray, b: NDArray):
        return a + b
    def backward(self, grad: NDArray):
        ret = grad, grad
        return ret

def add(a, b):
    return OpEWiseAdd()(a, b)
```

### 元素乘法

```python
class OpEWiseMul(Operator):
    # func: y = a * b
    # deri: y'/a' = b
    # deri: y'/b' = a
    def forward(self, a: NDArray, b: NDArray):
        self.a = a
        self.b = b
        return a * b
    def backward(self, grad: NDArray):
        return self.b * grad, self.a * grad

def mul(a, b):
    return OpEWiseMul()(a, b)
```

### sin

```python
class OpSin(Operator):
    # func: y = sin(x)
    # deri: y'/x' = cos(x)
    def forward(self, x: NDArray):
        self.x = x
        return np.sin(x)
    def backward(self, grad: NDArray):
        ret = np.cos(self.x) * grad
        return ret

def sin(x):
    return OpSin()(x)
```

## 向量与实验

### 样例实跑

```
>>> x1 = Tensor(np.array([0.5]), requires_grad=True)
>>> x2 = Tensor(np.array([0.5]), requires_grad=True)
>>> v3 = sin(x1)
>>> v4 = mul(x1, x2)
>>> v5 = add(v3, v4)
>>> grad = np.array([1])
>>> v5.backward(grad)
>>> print(x1.grad)
tensor([1.37758256])
>>> print(x2.grad)
tensor([0.5])
```

大家可以算算，跟公式算出来是一样的

### 扩展到向量

如果 $x_1, x_2$ 是向量呢？这里关系到向量的求导到底要怎么算，但整体来说，咱们实
现的框架还是成立的。例如上面例子中的 `+, *, sin`，如果都只考虑是按元素的操作
（不涉及矩阵乘法），则上面的算子定义依旧适用，下面我们对应在 Pytorch 运行的结
果和我们刚实现的框架的结果：

```python
#------------------- torch -------------------------|====================== Ours ========================
>>> import torch
>>> x1 = torch.tensor([0.0140, 0.5773, 0.0469],      >>> x1 = Tensor(np.array([0.0140, 0.5773, 0.0469]),
        requires_grad=True)                                  requires_grad=True)
>>> x2 = torch.tensor([0.3232, 0.4903, 0.9395],      >>> x2 = Tensor(np.array([0.3232, 0.4903, 0.9395]),
        requires_grad=True)                                  requires_grad=True)
>>> v3 = torch.sin(x1)                               >>> v3 = sin(x1)
>>> v4 = torch.mul(x1, x2)                           >>> v4 = mul(x1, x2)
>>> v5 = torch.add(v3, v4)                           >>> v5 = add(v3, v4)
>>> grad = torch.tensor([0.4948, 0.8746, 0.7076])    >>> grad = np.array([0.4948, 0.8746, 0.7076])
>>> v5.backward(grad)                                >>> v5.backward(grad)
>>> print(x1.grad)                                   >>> print(x1.grad)
tensor([0.6547, 1.1617, 1.3716])                     tensor([0.65467087 1.16167806 1.37161212])
>>> print(x2.grad)                                   >>> print(x2.grad)
tensor([0.0069, 0.5049, 0.0332])                     tensor([0.0069272  0.50490658 0.03318644])
```

## 小结

本文中我们实现了一个自动微分（Automatic Differentiation）的框架。主要是 Tensor、
Operator 的定义，以及后向计算的引擎。

整体的实现和 PyTorch 的实现是比较类似的，但为了示例简单也做了些取舍。如
Pytorch 中 `Operator` 的第一个参数是 `ctx`，也鼓励算子把信息记录在 `ctx` 中，
但我们是直接用 `self.x` 来记录；再如 PyTorch 中在计算结束后会把计算图销毁，我
们没有做；再有 PyTorch 在 Tensor 中重载了一些基本操作（如 `+ - * /`），方便操
作，但我们直接额外定义了 `add, mul` 等函数。等等等等。

总的来说，希望通过 AD 的简单实现，让大家认识到机器学习背后的一些原理，实际上也
并没有特别复杂。当然我们也要认识到，能 Work 距离能在工业上使用，中间还隔了个太
平洋。

## 参考

- CMU 的课程 Deep Learning Systems: Algorithms and Implementation
    - [Lecture 4 - Automatic Differentiation](https://www.youtube.com/watch?v=56WUlMEeAuA) AD 算法讲解
    - [Lecture 5 - Automatic Differentiation Implementation](https://www.youtube.com/watch?v=cNADlHfHQHg) AD 算法实现，着重讲解了诸如 Tensor，Operator 部分，图遍历的部分留做作业了。
    - [5_automatic_differentiation_implementation.ipynb](https://github.com/dlsyscourse/lecture4/blob/main/5_automatic_differentiation_implementation.ipynb) Lecture 5 的部分代码
- [PyTorch源码浅析(4)：Autograd](https://www.52coding.com.cn/2019/05/05/PyTorch4/) PyTorch 源码解析，版本比较老，但整体逻辑依旧适用
