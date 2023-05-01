title: 'TIL: 使用 einsum 进行复杂的矩阵计算'
toc: true
date: 2023-05-01 09:58:04
tags: [TIL, einsum, numpy, torch]
categories: [TIL]
math: true
---

很多复杂的矩阵计算可以使用 einsum 来表示，方便 PoC，性能也还过得去。

## Einstein notation

你没有看错，[Einstein notation](https://en.wikipedia.org/wiki/Einstein_notation) 
是那位著名的爱因斯坦发明的，用来对线性代数中求和的表示做的约定。我们还是看个例子[^wiki-upper]：

[^wiki-upper]: wiki 中 $x_i$ 表示成 $x^i$，我们这里还是以普通人视角来看


$$
y = \sum\_{i=1}^{3}{c\_i x\_i} = c\_1 x\_1 + c\_2 x\_2 + c\_3 x\_3
$$

如果一个下标（如 $i$）在公式中出现两次，则隐式地认为需要遍历它的所有可能性。上
面公式可以简化成：

$$
y = c\_i x\_i
$$

于是矩阵乘法中，每个输出元素可以这样表示：

$$
c_{ij} = \sum_{k}{a_{ik} b_{kj}} \implies c_{ik} = a_{ik} b_{kj}
$$

## Einsum

在 [Numpy](https://numpy.org/doc/stable/reference/generated/numpy.einsum.html)
和 [Pytorch](https://pytorch.org/docs/stable/generated/torch.einsum.html) 中都
实现了类似的机制。`einsum` 函数的第一个参数就是把上节公式中的各个下标按
`a,b->c` 的格式写下来：

{% asset_img 2023-05-einsum.svg Einsum subscript illustration %}

代码实例如下：

```python
In [6]: a = np.asarray(range(1,9)).reshape(2,4)

In [7]: a
Out[7]:
array([[1, 2, 3, 4],
       [5, 6, 7, 8]])

In [8]: b = np.asarray(range(1,9)).reshape(4,2)

In [9]: b
Out[9]:
array([[1, 2],
       [3, 4],
       [5, 6],
       [7, 8]])

In [10]: a @ b
Out[10]:
array([[ 50,  60],
       [114, 140]])

In [11]: np.einsum('ik,kj->ij', a, b)
Out[11]:
array([[ 50,  60],
       [114, 140]])
```

## 复杂应用

例如在 CNN 求卷积时，输入是 `(n, c, ih, iw)` 的矩阵，卷积权重是 `(C, c, h, w)
`（这里大写字母代表输出维度）。可以把原图像按卷积大小的各个子图求出，得到 `(n,
c, H, W, h, w)` 的输入矩阵，于是可以使用 einsum 直接求结果：

```python
def conv2d(x, weight, stride=(1,1), padding=(0,0)):
    # x is a 4d matrix (n, c, ih, iw), where n is batchsize, c is input channel
    # weight is a 4d matrix (oc, c, h, w), where o_c is output channel
    # out is (n, oc, h, w)
    if padding != (0,0):
        p_h, p_w = padding
        x_padded = np.pad(x, ((0,0), (0,0), (p_h,p_h), (p_w, p_w)))
    else
        x_padded = x

    i_n, i_c, i_h, i_w = x_padded.shape
    s_h, s_w = stride
    wo_c, wi_c, w_h, w_w = weight.shape

    o_n = i_n
    o_c = wo_c
    o_h = (i_h - w_h) // s_h + 1
    o_w = (i_w - w_w) // s_w + 1

    view_shape = (i_n, i_c, o_h, o_w, w_h, w_w)
    view_strides = np.array([(i_c*i_h*i_w), (i_h*i_w) , s_h*i_w, s_w, i_w, 1]) * x_padded.itemsize
    submatrix = np.lib.stride_tricks.as_strided(x_padded, view_shape, view_strides)
    return np.einsum('ncHWhw,Cchw->nCHW', submatrix, weight, optimize=True)
```

看到 `ncHWhw,Cchw->nCHW` 的输入中，`c, h, w` 下标是重复的，按约定要遍历所有三
个下标的元素相乘，要是裸写代码的话，类似下面这样：

```python
n,c,H,W,h,w = submatrix.shape
C,c,h,w = weight.shape

result = 0
for cc in range(c):
    for hh in range(h):
        for ww in range(w):
            result += a[n, cc, H, W, hh, ww] * b[C, cc, hh, ww]
out[n, C, H, W] = result
```

## 性能

一般比裸写 for 循环是要快不少的（比如上面的卷积，比我自己裸写的快 3x~5x）。但
比专门优化的肯定还是不能比的（pytorch 的 conv2d 是用 C++ 专门优化的，比相同的
einsum 快 10x）。

另外 [这篇文章](https://zhuanlan.zhihu.com/p/71639781) 建议无脑开 Numpy 中的
`optimize` 参数。
