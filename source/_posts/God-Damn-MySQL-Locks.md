title: MySQL 加锁机制验证记录
toc: true
date: 2020-12-13 09:46:28
tags: [MySQL, isolation level, lock]
categories: [Knowledge]
---

MySQL [官方文档
](https://dev.mysql.com/doc/refman/8.0/en/innodb-locks-set.html)给出了不同类型
语句的加锁情形，但我觉得[这个总结](https://www.jianshu.com/p/13f5777966dd)更到
位，因此想结合文章的几种情形，结合 InnoDB Monitor Output 做分析。

文章是验证过程的记录，全文比较长，建议结合目录查看感兴趣的部分。

## 开启 InnoDB Monitor

参考：[官方文档](https://dev.mysql.com/doc/refman/5.6/en/innodb-enabling-monitors.html)

```sql
SET GLOBAL innodb_status_output=ON; -- 开启输出
SET GLOBAL innodb_status_output_locks=ON; -- 开启锁信息输出
```

注意这些选项在 mysql 重启后会恢复默认值。接下来使用命令查看信息：

```sql
SHOW ENGINE INNODB STATUS\G
```

样例输出，我们只关心锁相关的内容：

```
---TRANSACTION 929632, ACTIVE 27 sec
2 lock struct(s), heap size 1136, 1 row lock(s), undo log entries 1
MySQL thread id 1309, OS thread handle 123145430310912, query id 9179 localhost root
TABLE LOCK table `test`.`id_pk_rc` trx id 929632 lock mode IX
RECORD LOCKS space id 1813 page no 3 n bits 72 index PRIMARY of table `test`.`id_pk_rc` trx id 929632 lock_mode X locks rec but not gap
Record lock, heap no 4 PHYSICAL RECORD: n_fields 4; compact format; info bits 32
 0: len 4; hex 80000005; asc     ;;
 1: len 6; hex 0000000e2f60; asc     /`;;
 2: len 7; hex 4c000002222e83; asc L   ". ;;
 3: len 1; hex 63; asc c;;
```

- "page no 3 n bits 72" 代表在第 3 页的记录上，lock bitmap 共 72 位
- "index PRIMARY of ..." 代表锁在某个索引上，PRIMARY 代表锁在主键上
- "lock_mode X" 锁模式，X 代表互斥，锁模式可以参数官方文档 [InnoDB
  Locking](https://dev.mysql.com/doc/refman/5.6/en/innodb-locking.html)
- "locks rec but not gap" 代表记录锁，"locks gap before rec" 代表间隙锁，没有
  说明则代表 Next Key Lock
- "heap no 4" 代表记录的序号，0 代表 infimum 记录、1 代表 supremum 记录，
  用户记录从 2 开始
- PHYSICAL RECORD 后面的内容是索引记录的内存结构，通常没办法直接阅读

这个记录里没法直接看出锁住了哪些记录。一种方法是通过 `select * from
information_schema.innodb_locks \G;` 查看抢锁没抢到的信息，为了查看记录，在测
试时可以另开一个会话，用诸如 `SELECT * FROM ...  WHERE ... FOR UPDATE` 来抢锁
，这样就可以看出锁在哪个记录上了。样例输出：

```
lock_id     | 929771:1817:4:4
lock_trx_id | 929771
lock_mode   | X
lock_type   | RECORD
lock_table  | `test`.`id_si_rc`
lock_index  | id_si
lock_space  | 1817
lock_page   | 4
lock_rec    | 4
lock_data   | 5, 3 -- 注意这里是数据标识
```

还有一个工具好用的工具
[innodb_ruby](https://github.com/jeremycole/innodb_ruby) 可以用来解析 MySQL 的
静态文件。Monitor 日志里我们知道是哪个页的哪条记录，可以使用innodb_ruby 来找到
对应的记录。（不过不建议在生产上使用）

## 不同情形下加锁验证

我们会考查 `DELETE FROM t1 WHERE id = 5` 语句在不同情形下的加锁情况，通过构造
数据、执行语句、查看 Monitor 日志来验证加锁的机制。

### 主键 + RC

结论：只对 ID = 5 这条记录加 Record Lock

{% asset_img id_pk_rc.svg 主键加锁 %}

首先建表准备数据：

```sql
-- 建表
CREATE TABLE id_pk_rc(id int primary key, name varchar(32));

-- 准备数据
INSERT INTO id_pk_rc values(1, 'a');
INSERT INTO id_pk_rc values(3, 'b');
INSERT INTO id_pk_rc values(5, 'c');
INSERT INTO id_pk_rc values(7, 'c');
INSERT INTO id_pk_rc values(9, 'b');
```

执行语句

```sql
-- 设置为 RC 隔离级别
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
BEGIN; -- 开启事务
DELETE FROM id_pk_rc WHERE id = 5;
-- 先不结束事务，验证 Monitor Output 再用 ROLLBACK; 回滚
```

Monitor 输出日志：

```
---TRANSACTION 929632, ACTIVE 27 sec
2 lock struct(s), heap size 1136, 1 row lock(s), undo log entries 1
MySQL thread id 1309, OS thread handle 123145430310912, query id 9179 localhost root
TABLE LOCK table `test`.`id_pk_rc` trx id 929632 lock mode IX
RECORD LOCKS space id 1813 page no 3 n bits 72 index PRIMARY of table `test`.`id_pk_rc` trx id 929632 lock_mode X locks rec but not gap
Record lock, heap no 4 PHYSICAL RECORD: n_fields 4; compact format; info bits 32
 0: len 4; hex 80000005; asc     ;;
 1: len 6; hex 0000000e2f60; asc     /`;;
 2: len 7; hex 4c000002222e83; asc L   ". ;;
 3: len 1; hex 63; asc c;;
```

看到输出里有 `lock_mode X locks rec but not gap`，可以确定持有的是记录锁。

### 唯一索引 + RC

结论：索引和聚簇索引/主键中都对 ID = 5 加 Record Lock

{% asset_img id_ui_rc.svg 唯一索引会对索引与主键加锁 %}

首先建表准备数据：

```sql
-- 建表
CREATE TABLE id_ui_rc(pk int primary key, id int, name varchar(32));
CREATE UNIQUE INDEX id_ui ON id_ui_rc(id);

-- 准备数据
INSERT INTO id_ui_rc values(1, 1, 'a');
INSERT INTO id_ui_rc values(2, 3, 'b');
INSERT INTO id_ui_rc values(3, 5, 'c');
INSERT INTO id_ui_rc values(4, 7, 'c');
INSERT INTO id_ui_rc values(5, 9, 'b');
```

执行语句：

```sql
-- 设置为 RC 隔离级别
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
BEGIN; -- 开启事务
DELETE FROM id_ui_rc WHERE id = 5;
-- 先不结束事务，验证 Monitor Output 再用 ROLLBACK; 回滚
```

Monitor 输出日志：

```
---TRANSACTION 929694, ACTIVE 6 sec
3 lock struct(s), heap size 1136, 2 row lock(s), undo log entries 1
MySQL thread id 1309, OS thread handle 123145430310912, query id 9241 localhost root
TABLE LOCK table `test`.`id_ui_rc` trx id 929694 lock mode IX
RECORD LOCKS space id 1815 page no 4 n bits 72 index id_ui of table `test`.`id_ui_rc` trx id 929694 lock_mode X locks rec but not gap
Record lock, heap no 4 PHYSICAL RECORD: n_fields 2; compact format; info bits 32
 0: len 4; hex 80000005; asc     ;;
 1: len 4; hex 80000003; asc     ;;

RECORD LOCKS space id 1815 page no 3 n bits 72 index PRIMARY of table `test`.`id_ui_rc` trx id 929694 lock_mode X locks rec but not gap
Record lock, heap no 4 PHYSICAL RECORD: n_fields 5; compact format; info bits 32
 0: len 4; hex 80000003; asc     ;;
 1: len 6; hex 0000000e2f9e; asc     / ;;
 2: len 7; hex 7a0000059525c9; asc z    % ;;
 3: len 4; hex 80000005; asc     ;;
 4: len 1; hex 63; asc c;;
```

可以看到分别对 `index id_ui` 和 `index PRIMARY` 加了 Record Lock。

### 非唯一索引 + RC

结论：会对所有 ID = 5 的索引记录加 Record Lock，同时对主键加 Record Lock。

{% asset_img id_si_rc.svg 非唯一索引会对多条记录加锁 %}

首先建表准备数据：

```sql
-- 建表
CREATE TABLE id_si_rc(pk int primary key, id int, name varchar(32));
CREATE INDEX id_si ON id_si_rc(id);

-- 准备数据
INSERT INTO id_si_rc values(1, 1, 'a');
INSERT INTO id_si_rc values(2, 3, 'b');
INSERT INTO id_si_rc values(3, 5, 'c');
INSERT INTO id_si_rc values(4, 7, 'c');
INSERT INTO id_si_rc values(5, 5, 'b');
```

执行语句：

```sql
-- 设置为 RC 隔离级别
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
BEGIN; -- 开启事务
DELETE FROM id_si_rc WHERE id = 5;
-- 先不结束事务，验证 Monitor Output 再用 ROLLBACK; 回滚
```

Monitor 输出日志（省略了 PHYSICAL RECORD 的内容）：

```
---TRANSACTION 929779, ACTIVE 3 sec
3 lock struct(s), heap size 1136, 4 row lock(s), undo log entries 2
MySQL thread id 1309, OS thread handle 123145430310912, query id 9325 localhost root
TABLE LOCK table `test`.`id_si_rc` trx id 929779 lock mode IX
RECORD LOCKS space id 1817 page no 4 n bits 72 index id_si of table `test`.`id_si_rc` trx id 929779 lock_mode X locks rec but not gap
Record lock, heap no 4 PHYSICAL RECORD: n_fields 2; compact format; info bits 32
 ...
Record lock, heap no 6 PHYSICAL RECORD: n_fields 2; compact format; info bits 32
 ...

RECORD LOCKS space id 1817 page no 3 n bits 72 index PRIMARY of table `test`.`id_si_rc` trx id 929779 lock_mode X locks rec but not gap
Record lock, heap no 4 PHYSICAL RECORD: n_fields 5; compact format; info bits 32
 ...
Record lock, heap no 6 PHYSICAL RECORD: n_fields 5; compact format; info bits 32
 ...
```

可以看到一共有 4 条记录，首先可以看到索引 `id_si` 和 `PRIMARY` 分别锁住了两条
记录，加的锁都是 X Record Lock No Gap，也就是记录锁。我们通过 `select * from
information_schema.innodb_locks \G;` 查看是锁住了 `3, 5` 这两条记录。

```
lock_id     | 929779:1817:4:4
lock_trx_id | 929779
lock_mode   | X
lock_type   | RECORD
lock_table  | `test`.`id_si_rc`
lock_index  | id_si
lock_space  | 1817
lock_page   | 4
lock_rec    | 4
lock_data   | 5, 3  <- 注意这里
```

### 无索引 + RC

结论：对所有记录加 Record Lock 再释放不匹配的记录锁

{% asset_img id_ni_rc.svg 无索引会对所有记录加 Record Lock %}

这个情形比较特殊，涉及两个[知识点
](https://dev.mysql.com/doc/refman/8.0/en/innodb-locks-set.html)

1. MySQL 加锁时是对处理过程中“扫描”到的记录加锁，不管这条记录最终是不是通过
  WHERE 语句剔除了
2. 对于 READ COMMITTED，MySQL 在扫描结束后，会违反 #1，释放 WHERE 条件不满足的记录锁

首先建表准备数据：

```sql
-- 建表
CREATE TABLE id_ni_rc(pk int primary key, id int, name varchar(32));

-- 准备数据
INSERT INTO id_ni_rc values(1, 1, 'a');
INSERT INTO id_ni_rc values(2, 3, 'b');
INSERT INTO id_ni_rc values(3, 5, 'c');
INSERT INTO id_ni_rc values(4, 7, 'c');
INSERT INTO id_ni_rc values(5, 5, 'b');
```

执行语句：

```sql
-- 设置为 RC 隔离级别
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
BEGIN; -- 开启事务
DELETE FROM id_ni_rc WHERE id = 5;
-- 先不结束事务，验证 Monitor Output 再用 ROLLBACK; 回滚
```

Monitor 输出日志（省略了 PHYSICAL RECORD 的内容）：

```
---TRANSACTION 1446, ACTIVE 17 sec
2 lock struct(s), heap size 1136, 2 row lock(s), undo log entries 2
MySQL thread id 7, OS thread handle 123145446559744, query id 267 localhost root
TABLE LOCK table `test`.`id_ni_rc` trx id 1446 lock mode IX
RECORD LOCKS space id 27 page no 3 n bits 72 index PRIMARY of table `test`.`id_ni_rc` trx id 1446 lock_mode X locks rec but not gap
Record lock, heap no 4 PHYSICAL RECORD: n_fields 5; compact format; info bits 32
 ...
Record lock, heap no 6 PHYSICAL RECORD: n_fields 5; compact format; info bits 32
 ...
```

看到 TABLE LOCK 的状态是 `IX` 说明没有加表锁。同时看到最终锁住的只有heap_no =
4 和 6 的两条记录。

### 主键 + RR

当 ID 为主键时，在 RR 隔离级别下，加锁情况与 [主键 + RC](#主键-rc) 一致，都是
对主键记录加 Record Lock。

### 唯一索引 + RR

当 ID 为唯一索引时，在 RR 隔离级别下，加锁情况与 [唯一索引 + RC](#唯一索引-rc)
一致，都是对索引记录和聚簇索引/主键 Record Lock。

### 非唯一索引 + RR

结论：对索引记录 Next Key Lock，末尾加 Gap Lock，同时对主键加 Record Lock

{% asset_img id_si_rr.svg 对索引记录 Next Key Lock，末尾加 Gap Lock，同时对主键加 Record Lock %}

Repeatable Read 和 Read Committed 隔离级别的主要区别是 RR 要防止幻读。幻读指的
是执行同一个 SQL 两次得到的结果不同。考虑下面的场景：

1. 事务 A 执行 `SELECT count(*) FROM t WHERE id = 5 FOR UPDATE` 返回 2 个元素
2. 事务 B 插入一条 `id = 5` 的记录
3. 事务 A 再次执行 `SELECT count(*) FROM t WHERE id = 5 FOR UPDATE` 返回 3 个元素

为了要避免这种情况，在 RR 隔离级别下，在 #1 执行时不仅要锁住现有的 ID=5 的索引
，还需要阻止 ID = 5 的记录插入（即 #2）。而 Gap Lock 就是实现这个目的的一种手
段。

考虑到索引是有序的，因此如果索引里有 `[3, 5, 5, 7]` 这几个元素，则可以通过锁住
`(3, 5)`、`(5, 7)` 这几个区间，加上 `[5]` 这几个已经存在的元素，就可以阻止 ID
= 5 的记录插入。Gap Lock（间隙锁）的含义是锁住区间，而如果加上右边的闭区间，如
`(3, 5]` 就称为记录 5 的 Next-Key Lock。

InnoDB 在扫描行时会为扫到的行加上 Next-Key Lock，对于上面的数据，扫到记录 5 时
，会加上 `(3, 5]` 锁，同时，还会对下一个记录加上 Gap Lock，即 `(5, 7)`，造成
`(3, 7)` 都无法插入的现象，验证 MySQL 实现如下：

首先建表准备数据：

```sql
-- 建表
CREATE TABLE id_si_rr(pk int primary key, id int, name varchar(32));
CREATE INDEX id_si ON id_si_rr(id);


-- 准备数据
INSERT INTO id_si_rr values(1, 1, 'a');
INSERT INTO id_si_rr values(2, 3, 'b');
INSERT INTO id_si_rr values(3, 5, 'c');
INSERT INTO id_si_rr values(4, 7, 'c');
INSERT INTO id_si_rr values(5, 5, 'b');
```

执行语句：

```sql
-- 设置为 RC 隔离级别
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
BEGIN; -- 开启事务
DELETE FROM id_si_rr WHERE id = 5;
-- 先不结束事务，验证 Monitor Output 再用 ROLLBACK; 回滚
```

Monitor 输出日志（省略 PHYSICAL RECORD 的内容）：

```
---TRANSACTION 929891, ACTIVE 6 sec
4 lock struct(s), heap size 1136, 5 row lock(s), undo log entries 2
MySQL thread id 1309, OS thread handle 123145430310912, query id 9442 localhost root
TABLE LOCK table `test`.`id_si_rr` trx id 929891 lock mode IX
RECORD LOCKS space id 1820 page no 4 n bits 72 index id_si of table `test`.`id_si_rr` trx id 929891 lock_mode X
Record lock, heap no 4 PHYSICAL RECORD: n_fields 2; compact format; info bits 32
 ...
Record lock, heap no 6 PHYSICAL RECORD: n_fields 2; compact format; info bits 32
 ...

RECORD LOCKS space id 1820 page no 3 n bits 72 index PRIMARY of table `test`.`id_si_rr` trx id 929891 lock_mode X locks rec but not gap
Record lock, heap no 4 PHYSICAL RECORD: n_fields 5; compact format; info bits 32
 ...
Record lock, heap no 6 PHYSICAL RECORD: n_fields 5; compact format; info bits 32
 ...

RECORD LOCKS space id 1820 page no 4 n bits 72 index id_si of table `test`.`id_si_rr` trx id 929891 lock_mode X locks gap before rec
Record lock, heap no 5 PHYSICAL RECORD: n_fields 2; compact format; info bits 0
 ...
```

首先我们看到：
- 对索引 `id_si` 有两条 Next-Key Lock 记录
- 对主键有两条 Record Lock 记录
- 最后对索引 `id_si` 还有一条 Gap Lock (heap_no = 5 对应 pk = 4 这条记录)

为什么唯一索引 + RR 就不需要 Gap Lock 呢？是因为我们的核心目的是不让其它事务插
入 `ID = 5` 的记录，如果 ID 是唯一索引，锁住记录本身就能够满足要求了，不再需要
Gap Lock。

### 无索引 + RR

结论：对所有行都加记录锁，且索引前后都要加 Gap Lock

{% asset_img id_ni_rr.svg 对所有行都加记录锁，且索引前后都要加 Gap Lock %}

首先建表准备数据：

```sql
-- 建表
CREATE TABLE id_ni_rr(pk int primary key, id int, name varchar(32));

-- 准备数据
INSERT INTO id_ni_rr values(1, 1, 'a');
INSERT INTO id_ni_rr values(2, 3, 'b');
INSERT INTO id_ni_rr values(3, 5, 'c');
INSERT INTO id_ni_rr values(4, 7, 'c');
INSERT INTO id_ni_rr values(5, 5, 'b');
```

执行语句：

```sql
-- 设置为 RC 隔离级别
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
BEGIN; -- 开启事务
DELETE FROM id_ni_rr WHERE id = 5;
-- 先不结束事务，验证 Monitor Output 再用 ROLLBACK; 回滚
```

Monitor 输出日志（省略了部分信息）：

```
---TRANSACTION 929980, ACTIVE 5 sec
2 lock struct(s), heap size 1136, 6 row lock(s), undo log entries 2
MySQL thread id 1309, OS thread handle 123145430310912, query id 9529 localhost root
TABLE LOCK table `test`.`id_ni_rr` trx id 929980 lock mode IX
RECORD LOCKS space id 1822 page no 3 n bits 72 index PRIMARY of table `test`.`id_ni_rr` trx id 929980 lock_mode X
Record lock, heap no 1 PHYSICAL RECORD: n_fields 1; compact format; info bits 0
 0: len 8; hex 73757072656d756d; asc supremum;;

Record lock, heap no 2 PHYSICAL RECORD: n_fields 5; compact format; info bits 0
 ...
Record lock, heap no 3 PHYSICAL RECORD: n_fields 5; compact format; info bits 0
 ...
Record lock, heap no 4 PHYSICAL RECORD: n_fields 5; compact format; info bits 32
 ...
Record lock, heap no 5 PHYSICAL RECORD: n_fields 5; compact format; info bits 0
 ...
Record lock, heap no 6 PHYSICAL RECORD: n_fields 5; compact format; info bits 32
 ...
```

首先看到 TABLE LOCK 的状态是 `IX` 说明没有加表锁。同时看到锁住了 heap no 2~6的
记录，对应数据库中的 5 条记录。另外这里的锁是 Next Key Lock，加上 heap no 为 1
的 "supremum" 记录的 gap lock，锁住了所有已经存在和不存在的行。因此如果执行
`SELECT * FROM id_ni_rc WHERE id = 0 FOR UPDATE` 也会阻塞，尽管 `0` 记录不在数
据库中。

## 死锁验证

死锁与获取锁的顺序有关，一条语句（如 INSERT、DELETE）中对不同行、不同索引的加
锁存在先后，因此不同事务内的语句执行时，有可能产生死锁。常见死锁原因（摘自
[MySQL InnoDB锁和死锁](https://tanquan.me/2016/05/31/MySQL-InnoDB-Lock/)）：

* 同一索引上，两个session相反的顺序加锁多行记录
* UPDATE/DELETE 通过不同的二级索引更新多条记录，可能造成在 Primary key 上不同的加锁顺序
* Primary key 和 Secondary index，通过 primary key 找到记录，更新 Secondary
  index 字段与通过 Secondary index 更新记录

样例情形：

{% asset_img id_si_rc_deadlock.svg 死锁 %}

首先建表准备数据：

```sql
CREATE TABLE deadlock(id int primary key, name varchar(32), reg int);
CREATE INDEX deadlock_name ON deadlock(name);
CREATE INDEX deadlock_reg ON deadlock(reg);

-- 准备数据
INSERT INTO deadlock values(1, 'x', 5);
INSERT INTO deadlock values(2, 'b', 4);
INSERT INTO deadlock values(3, 'x', 3);
INSERT INTO deadlock values(4, 'd', 2);
INSERT INTO deadlock values(5, 'e', 1);
```

两个事务分别“同时”执行：

```
-- Transaction A                       | -- Transaction B
DELETE FROM deadlock WHERE name = 'x'; | DELETE FROM deadlock WHERE reg >= 2;
```

其中一个事务可能会检测到死锁而出错。Monitor 日志里找到 "LATEST DETECTED
DEADLOCK" 可以看到记录的死锁原因（这个示例复现出的问题与上图不直接一致）：

```
------------------------
LATEST DETECTED DEADLOCK
------------------------
2020-12-13 15:59:40 0x700007a56000
*** (1) TRANSACTION:
TRANSACTION 930064, ACTIVE 0 sec starting index read
mysql tables in use 1, locked 1
LOCK WAIT 3 lock struct(s), heap size 1136, 2 row lock(s)
MySQL thread id 1309, OS thread handle 123145430310912, query id 9616 localhost root updating
DELETE FROM deadlock WHERE name = 'x'
*** (1) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 1825 page no 3 n bits 72 index PRIMARY of table `test`.`deadlock` trx id 930064 lock_mode X locks rec but not gap waiting
Record lock, heap no 2 PHYSICAL RECORD: n_fields 5; compact format; info bits 32
 ...

*** (2) TRANSACTION:
TRANSACTION 930063, ACTIVE 0 sec updating or deleting
mysql tables in use 1, locked 1
3 lock struct(s), heap size 1136, 2 row lock(s), undo log entries 1
MySQL thread id 1308, OS thread handle 123145430589440, query id 9615 localhost root updating
DELETE FROM deadlock WHERE reg >= 2
*** (2) HOLDS THE LOCK(S):
RECORD LOCKS space id 1825 page no 3 n bits 72 index PRIMARY of table `test`.`deadlock` trx id 930063 lock_mode X
Record lock, heap no 2 PHYSICAL RECORD: n_fields 5; compact format; info bits 32
 ...

*** (2) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 1825 page no 4 n bits 72 index deadlock_name of table `test`.`deadlock` trx id 930063 lock_mode X locks rec but not gap waiting
Record lock, heap no 2 PHYSICAL RECORD: n_fields 2; compact format; info bits 0
 ...

*** WE ROLL BACK TRANSACTION (1)
```

我们看到：

1. 第一个事务在等待 PRIMARY 索引上 heap_no = 2 的记录的 Record Lock
2. 第二个事务已经取得 PRIMARY 索引上 heap_no = 2 的 Next Key Lock
3. 同时第二个事务在等待 deadlock_name 索引上 heap_no = 2 的 Record Lock
4. MySQL 选择回滚第一个事务

更新操作如 UPDATE/DELETE 加锁的顺序为：`查询索引 > 主键索引 > 其它二级索引`。
如上例中，第二个事务已经锁住了主键索引，准备锁住另一个二级索引 `deadlock_name`
，而第一个已经锁住了 `deadlock_name`，准备锁主键索引，造成死锁。

## 参考

- [mysql 索引加锁分析](https://www.jianshu.com/p/13f5777966dd) 本文内容的主要
    参考对象，详细分析了各种情形下的加锁原理
- [Locks Set by Different SQL Statements in
  InnoDB](https://dev.mysql.com/doc/refman/8.0/en/innodb-locks-set.html) 官方
  文档，介绍了不同语句的加锁方式
- [InnoDB
  Locking](https://dev.mysql.com/doc/refman/5.6/en/innodb-locking.html) 官方文
  档，介绍了 InnoDB 的不同类型的锁
- [Understanding innodb locks and
  deadlocks](https://www.slideshare.net/valeriikravchuk1/understanding-innodb-locks-and-deadlocks)
  PPT 解释了 InnoDB 内部的一些数据结构
- [mysql之show engine innodb status解读
  ](https://www.cnblogs.com/xiaoboluo768/p/5171425.html) 详细介绍了 SHOW
  ENGINE INNODB STATUS 输出的内容，也是在这篇文章里认识到人肉看 PHYSICAL
  RECORD 的内容不太可能
- [innodb_ruby](https://github.com/jeremycole/innodb_ruby) InnoDB 文件探查工具
    ，学习 InnoDB 利器，会用它来确认 heap_no 对应的记录
