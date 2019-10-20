title: Spark Window 入门介绍
toc: true
date: 2019-10-20 11:10:11
tags: [Big Data, Spark]
categories: [Knowledge]
---

对于一个数据集，`map` 是对每行进行操作，为每行得到一个结果；`reduce` 则是对多
行进行操作，得到一个结果；而 `window` 函数则是对多行进行操作，得到多个结果
（每行一个）。本文会以实例介绍 `window` 函数的基本概念和用法。

## 示例：计算成绩排名

例如大学里有许多专业，每个专业有若干个班级，每个班级又有许多学生，这次考试，每
个学生的成绩用 pyspark 表示如下：

```python
df = sqlContext.createDataFrame([
    ["Student A", 1, "Science", 10],
    ["Student B", 1, "Science", 20],
    ["Student C", 2, "Science", 30],
    ["Student D", 2, "Science", 40],
    ["Student D", 3, "Science", 50],
    ["Student E", 4, "Art", 10],
    ["Student F", 4, "Art", 20],
    ["Student G", 5, "Art", 30],
    ["Student H", 5, "Art", 40],
    ["Student I", 6, "Art", 50],
    ], ["name", "class", "subject", "score"])
```

现在我们的需求是：计算每个学生在专业里的成绩排名。

首先，我们将学生按专业分成两组：

{% asset_img window-example-step-1.svg Step 1: Partition %}

接着我们按分数从高到低进行排序：

{% asset_img window-example-step-2.svg Step 2: Sort %}

之后是执行窗口函数。对于每个学生，我们将排在它之前的所有学生取出，再计算当前学
生排在第几名：

{% asset_img window-example-step-3.svg Step 3: Window Execution %}

对应的 pyspark 代码如下：
```python
windowSpec = Window.partitionBy(df.subject)
windowSpec = windowSpec.orderBy(df.score.desc())
windowSpec = windowSpec.rowsBetween(Window.unboundedPreceding, Window.currentRow)

df.withColumn('rank', func.rank().over(windowSpec)).show()

# +---------+-------+-----+-----+----+
# |     name|subject|class|score|rank|
# +---------+-------+-----+-----+----+
# |Student B|Science|    1|   70|   1|
# |Student D|Science|    2|   60|   2|
# |Student E|Science|    3|   50|   3|
# |Student C|Science|    2|   30|   4|
# |Student A|Science|    1|   10|   5|
# |Student G|    Art|    4|   60|   1|
# |Student H|    Art|    5|   50|   2|
# |Student J|    Art|    6|   40|   3|
# |Student I|    Art|    5|   30|   4|
# |Student F|    Art|    4|   10|   5|
# +---------+-------+-----+-----+----+
```

## 如何定义窗口

一个窗口需要定义三个部分：

1. 分组，如何将行分组？在选取窗口数据时，只对组内数据生效
2. 排序，按何种方式进行排序？选取窗口数据时，会首先按指定方式排序
3. 帧(frame)选取，以当前行为基准，如何选取周围行？

### Row Frame(行帧)

行帧，即选择帧的时候通过行数指定。语法为 `rowsBetween(x, y)`，其中 `x, y` 可以
是数字，`-n`表示向前数 `n` 行，`n` 表示向后数 `n` 行。除此之外，还可以是：

* `Window.unboundedPreceding` 表示当前行之前的无限行
* `Window.currentRow` 表示当前行
* `Window.unboundedFollowing` 表示当前行之后的无限行

例如，要选择当前行的前一行和后一行，则 pyspark 的写法为 `rowsBetween(-1, 1)`，
对应 SQL 的写法为 `ROWS BETWEEN 1 PRECEEDING AND 1 FOLLOWING`，表示如下图：

{% asset_img row-frame-example.svg Row Frame example %}

### Range Frame(范围帧)

有时，我们想根据当前行列值的范围来选取窗口，语法为 `rangeBetween(x, y)`。例如
，当前的分数为 `60`，选择范围帧 `rangeBetween(-20, 20)`，则会选择所有分数落在
`[40, 80]` 范围内的行。如下图：

{% asset_img range-frame-example.svg Range Frame example %}

## 窗口函数

从通用性的角度来说，选定帧内数据后，做何种计算，需要让用户自行定义。考虑到效率
和便利性等因素，Spark SQL 不支持自定义的窗口函数[^pyspark-udf]，而是提供了一些
内置的优化过的函数，来满足日常的需求。

[^pyspark-udf]: [StackOverflow](https://stackoverflow.com/a/48160300) 看到说 pyspark >=
  2.4 后才支持窗口函数中使用 UDF，这里不深究了

Spark SQL 支持三种类型的窗口函数：排名函数(ranking function)、分析函数
(analytic functions)和聚合函数(aggregate functions)。其中聚合函数（如 `max`,
`min`, `avg` 等)常用在 `reduce` 操作中，不再介绍，其它函数如下：

<table>
    <thead>
        <tr>
            <th></th>
            <th>SQL</th>
            <th>Dataframe API</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td rowspan=5>Ranking functions</td>
            <td>rank</td>
            <td>rank</td>
        </tr>
        <tr>
            <td>dense_rank</td>
            <td>denseRank</td>
        </tr>
        <tr>
            <td>percent_rank</td>
            <td>percentRank</td>
        </tr>
        <tr>
            <td>ntile</td>
            <td>ntile</td>
        </tr>
        <tr>
            <td>row_number</td>
            <td>rowNumber</td>
        </tr>
        <tr>
            <td rowspan=5>Analytic functions</td>
            <td>cume_dist</td>
            <td>cumeDist</td>
        </tr>
        <tr>
            <td>first_value</td>
            <td>firstValue</td>
        </tr>
        <tr>
            <td>last_value</td>
            <td>lastValue</td>
        </tr>
        <tr>
            <td>lag</td>
            <td>lead</td>
        </tr>
    </tbody>
</table>

这些函数在使用时，只需要将函数应用在窗口定义上，例如
`avg(df.score).over(windowSpec)`。

## 小结

文章给出一个使用窗口函数的示例，并尝试说清如何定义一个窗口，包括帧的选择，最后
给出一些常用的窗口函数。

注意的是窗口函数在 Spark 1.4 开始支持，一些窗口函数在 Spark 1.* 中需要使用
`HiveContext` 才能运行。


## 参考

- [Introducing Window Functions in Spark SQL](https://databricks.com/blog/2015/07/15/introducing-window-functions-in-spark-sql.html)  入门必看
- https://knockdata.github.io/spark-window-function/ 也是不错的入门材料，可以
    相互佐证
- https://jaceklaskowski.gitbooks.io/mastering-spark-sql/spark-sql-functions.html 窗口函数汇总
