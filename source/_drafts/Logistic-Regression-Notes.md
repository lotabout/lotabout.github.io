title: 逻辑回归学习笔记
date: 2018-03-10 20:40:40
tags:
categories:
math: true
toc:
---

最近在看 Andrew Ng 老师的 [机器学习课程
](https://www.coursera.org/learn/machine-learning)，这篇文章记录了学习中的一些
困惑和思考。

## Sigmoid 函数的作用

在课程的引言里，给了一个二分类的任务，根据肿瘤的大小来判断它是不是恶性肿瘤。

首先，我们可以建立一个线性回归的模型 $h_\theta(X) = \theta^TX$。然后我们决定
当 $h_\theta(X) >= 0.5$ 时认为是恶性肿瘤，反之则认为不是恶性。
{% asset_img tumor-size.svg Linear Regression for Tumorsize-maglignant %}

但是这个模型是有问题的，当我们考虑更多的数据点时，线性回归模型可能就不再适用。
例如，我们增加了几个数据后重新进行线性回归，依旧选定 0.5 作为分界线，这次，数
据点 A 就被错误归类为“非恶性”。

{% asset_img tumor-size-wrong.svg Linear Regression for Tumorsize-maglignant Wrong classification %}

课程里说，在这个例子中使用线性回归的一个问题是，线性回归的结果最终会小于 `0`
或超过 `1`，而在二分类任务里，本质上期望的值只有 `0` 和 `1`。线性模型的输出会
随着输入的增大而增大，但数据的类别并不会随输入的增大而无限制增大。例如当
tumor size 不断增大时，线性回归的模型输入会最终大于 `1`，而实际上类别的取值不会
超过 `1`，因此线性模型与分类问题是不相符的。

也因此，Sigmoid 函数的作用可以认为是对“线性回归”的一个改进，使得当输入无限增大
时，模型的输出不会无限增大。最终的模型是一条曲线：

{% asset_img tumor-size-sigmoid.svg Linear Regression for Tumorsize-maglignant Sigmoid %}

由于 sigmoid 函数的在 $-\infty$ 处几乎为 0，而 $\infty$ 处几乎为 1，因此在学
习参数时两端的数据几乎不起作用。于是焦点就集中在两个类别的分界线，一个是
sigmoid 函数的位移，一个是倾斜程度，如图：

{% asset_img tumor-size-sigmoid-choices.svg Linear Regression for Tumorsize-maglignant Sigmoid Choices %}

如果我们最终决策时只关心它的输出是大于还是小于 `0.5`，其实曲线的倾斜程度也没什
么作用。

## 逻辑回归是线性模型？

首先我们来认识一下什么是决策边界。在二分类中，决策边界是数据集上的一个超平面，
用来划分两个类别。例如上节的例子中，输入是一维 "tumor size"，因此决策边界是一
个点，在线性回归模型或逻辑回归模型中，我们都可以认为是决策边界是 y 取 0.5 时对
应的 "tumor size" 的值。

虽然 Sigmoid 函数是 `S` 形，但模型是不是“线性”并不是看输出结果的。从数学的角度
看，逻辑回归的输出 $h_\theta(x) = sigmoid(\theta^Tx)$ 是全取决于输入 $x$ 的线
性组合 $\theta^Tx$ ，因此逻辑回归是线性模型。我们再来直观感受一下，下面是输入
是二维时逻辑回归的输出平面：

{% asset_img Sigmoid-decision-boundary-3D.png Sigmoid Decision Boundary 3D %}

我们可以看到模型的输出是一个曲面。但模型的决策边界是模型输出为 0.5 时对应的输
入。即上图中投影后的两个区域的边界。已经能看出这个边界是一条直线，我们将这个投
影放在平面上：

{% asset_img Sigmoid-decision-boundary-2D.svg Sigmoid Decision Boundary 2D %}

要是有兴趣可以计算一下，它对应了 $\theta^Tx = sigmoid^{-1}(0.5)$ 这个平面。

## 如何实现非线性？

上面我们知道逻辑回归模型是线性模型，这意味着，如果样本的分布是非线性的，则彩逻
辑回归的模型是没办法正确进行分类的，如下面这样的样本（数据取自
[HanXiaoyang/ML-examples](https://github.com/HanXiaoyang/ML-examples/blob/master/logistic_regression/data2.txt)
）：

{% asset_img circular-data.svg Circular Data %}

这时，模型本身的能力已经没办法提高了，于是我们需要从 **输入** 下手。我们观察数
据的分布比较接近椭圆形，因此我们手工地多加入一些数据: $x_1^2, x_1x_2, x_2^2,
x_1^3, x_1^2x_2, ... x_2^6$。通过人工地加入更多的数据，我们赋予了逻辑回归拟合
非线性数据的能力，下面是我们用这些数据进行的一次训练：

{% asset_img circular-data-boundary-2D.svg Circular Data boundary 2D %}

可以看到，两类数据被清楚地分开了，但由于引入过多的维数，也产生了过拟合的现象。
下面是 3D 版：

{% asset_img circular-data-boundary-3D.png Circular Data boundary 3D %}

因此，这里要强调的是，逻辑回归如果要处理非线性的数据， **一定需要对输入进行预
处理** 。例如加入高次项，来引入非线性的能力。换句话说，还是要做“特征工程”。

## 损失函数

为什么均方差不行？

新的损失函数

## 梯度下降

## 过拟合？

正则化？
