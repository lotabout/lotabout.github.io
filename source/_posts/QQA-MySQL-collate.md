title: 'QQA: MySQL 竟然无法区分大小写？'
toc: true
date: 2020-05-09 18:31:42
tags: [MySQL, collation, charset]
categories: [QQA]
---

MySQL 执行 `select 'a' = 'A';` 得到的结果竟然是真(`1`)？同学，`collation` 了解一下。

究其原因，是因为默认的 Collation 设置为 `utf8mb4_general_ci`（不同机器/字符编
码下不同），任何的字符串比较都会忽略大小写。解法：

* 可以在建库或表时指定其它的 collation，如 `utf8mb4_bin`，不推荐
* 也可以在 SQL 语句里指定 collation，如：
    * `select 'a' = 'A' COLLATE utf8mb4_bin;`
    * `SELECT BINARY 'a' = 'A';`[^operator-binary]

[^operator-binary]: https://dev.mysql.com/doc/refman/5.7/en/cast-functions.html#operator_binary

## 什么是 Collation

例如我们有 4 个字符 `A, B, a, b`，我们为每个字符赋一个数值，如 `A=0, B=1, a=2,
b=3`，则 `A` 是符号(symbol)；`0` 是它的编码(encoding)；符号与编码的集合就叫作
字符集(character set)[^translation-source]。

[^translation-source]: 翻译自 MySQL 文档：https://dev.mysql.com/doc/refman/8.0/en/charset-general.html

如果要比较两个字符，最简单的方式是比较它们的编码。如 `A=0`, `B=1`，由于 `0 <
1`，则认为 `A < B`。Collation（翻译为“校对”）就是如何比较字符的规则。这个例子
里，我们只用了一个简单的规则：比较字符的编码。

如果我们希望比较时忽略字符大小写呢？那我们就至少需要两个规则：

1. 将大小写字母一视同仁，`a = A`, `b = B`
2. 在此基础上再比较两个字符的编码

MySQL 会根据字符集来存储字符串，会根据 Collation 来对比字符串。

## MySQL 中的 Collation

可以通过 `show character set;` 来查看所有的字符集，通过 `show collation;` 来查
看所有 collation。

通常，字符集与 Collation 的关系是一对多。每个字符集有一个默认的 collation，每
一个 collation 只能跟一个字符集绑定。

Collation 的命名规则[^naming-convention]通常是 `<char-set>_<lang>_<case>` 例如 `gb2312_chinese_ci`
对应字符集 `gb2312`，语言是中文 `chinese`，大小写是忽略大小写 `ci`，如果是
`cs` 则是区分大小写，如果是 `bin` 则是直接使用编码，也区分大小写。

[^naming-convention]: https://dev.mysql.com/doc/refman/8.0/en/charset-collation-names.html

## Collation 可以应用在不同级别

可以在数据库级别指定默认 Collation[^db-level]:

```sql
CREATE DATABASE db_name
    [[DEFAULT] CHARACTER SET charset_name]
    [[DEFAULT] COLLATE collation_name]

CREATE DATABASE db_name CHARACTER SET latin1 COLLATE latin1_swedish_ci;
```

[^db-level]: https://dev.mysql.com/doc/refman/8.0/en/charset-database.html

可以在表级别指定默认 Collation [^table-level]：

```sql
CREATE TABLE tbl_name (column_list)
    [[DEFAULT] CHARACTER SET charset_name]
    [COLLATE collation_name]]

CREATE TABLE t1 ( ... ) CHARACTER SET latin1 COLLATE latin1_danish_ci;
```

[^table-level]: https://dev.mysql.com/doc/refman/8.0/en/charset-table.html

可以在列级别指定默认 Collation [^column-level]：

```sql
col_name {CHAR | VARCHAR | TEXT} (col_length)
    [CHARACTER SET charset_name]
    [COLLATE collation_name]

CREATE TABLE t1( col1 VARCHAR(5) CHARACTER SET latin1 COLLATE latin1_german1_ci);
```

[^column-level]: https://dev.mysql.com/doc/refman/8.0/en/charset-column.html

可以在查询的字符串中指定 Collation[^literal-level]：

```sql
[_charset_name]'string' [COLLATE collation_name]

SELECT 'abc';
SELECT _latin1'abc';
SELECT _binary'abc';
SELECT _utf8mb4'abc' COLLATE utf8mb4_danish_ci;
```

[^literal-level]: https://dev.mysql.com/doc/refman/8.0/en/charset-literal.html

## 背后的故事

数据库中有个字段是 `code`，存储了随机生成并哈希后的全局唯一 ID，但不是主键。今
天突然发现 Hibernate 在 `findByCode` 的时候说返回的结果不唯一。查了很久后怀疑
是哈希冲突，但最终发现哈希的结果并不一致，有一个字母的大小写是不同的，才发现
MySQL 在 `=`，`like` 时并不区分大小写，最终学习到了 `collation` 的知识。

该问题最终通过修改哈希生成的逻辑，只生成大写字母的 code 解决。了解它的影响很重
要。在写入主键时，也是不区分大小写的，所以如果生成的主键仅有大小写不同，是可能
写入失败的。标记为 unique 的字段也是如此。

另外稍微查了下，Oracle 应该也有类似的机制，但具体的影响没有验证过。
