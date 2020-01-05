title: '《MySQL技术内幕：InnoDB存储引擎（第2版）》'
toc: true
date: 2020-01-05 21:48:21
tags: [InnoDB, MySQL]
categories: [Reading]
---

本文是读书笔记，由 XMind 导出（[XMind 源文件](/2020/Book-Notes-InnoDB-Engine-2nd-edition/InnoDB.xmind)）。

## Ch01: MySQL 体系架构与存储引擎

### MySQL 体系结构

- MySQL 的存储引擎是基于表的，不是数据库

### MySQL 存储引擎

- InnoDB
    - 行锁、外键、非锁定读
    - MVCC + next-key 避免幻读
    - insert buffer, double write, adaptive hash index, read ahead

- MyISAM
    - 不支持事务、表锁
    - 支持全文索引

### 连接 MySQL

- TCP/IP
    - mysql -h host

- named piped, shared memory
- unix socket
    - mysql -S /tmp/mysql.sock

## Ch02: InnoDB 存储引擎

### InnoDB 体系架构

- 后台线程

    - Master Thread: 刷新内存数据到缓冲区
    - IO Thread: 使用 AIO 处理请求
    - Purge Thread: 回收已使用并分配的 undo 页

- 内存
    - 缓冲池
        - 索引页
        - 数据页
        - undo 页
        - insert buffer
        - adaptive hash index
        - lock info
        - data dictionary
    - LRU List, Free List, Flush List
        - 页大小默认 16K
        - 新页加入到 midpoint(默认 5/8)，而非 LRU 首部索引，数据扫描等操作涉及的数据并非热点数据，容易使缓冲区的页被刷出，影响效率
        - 页加入大于 innodb_old_blocks_time 后才会被认为是热点数据，加入 LRU 的热端
        - pages made young
    - redo log buffer
        - innodb_log_buffer_size (default 8M)
    - 额外的内存池

### Checkpoint

- Write Ahead Log
    - 先写 redo log，再修改页
- 解决问题
    - 缩短数据库恢复时间。宕机时只需要从 checkpoint 恢复
    - 缓冲池不够时，将脏页刷新到磁盘。LRU 不够用时溢出最近最小使用的页，若为脏页则强制 checkpoint，并刷回磁盘
    - redo log 不可用时，刷新脏页。redo log 是循环 buffer? 空间不足时需要刷回
- When
    - Sharp Checkpoint
        - 数据库关闭时刷回所有脏页
    - Fuzzy Checkpoint (default)
        - 刷新部分脏页
        - Master Thread checkpoint
            - happens every 1 or 10s
            - async
        - FLUSH_LRU_LIST checkpoint
            - LRU 需要保证约 100 个空闲页
            - Page Cleaner thread
            - 现在由 innodb_lru_scan_depth 控制保留页数
        - Async/Sync Flush checkpoint
            - 发生在 redo log 不可用时
            - checkpoint_age < async_water_mark 是不触发
            - async_water_mark < checkpoint_age < sync_water_mark 时触发  Async Flush
            - checkpoint_age > sync_water_mark 触发 Sync Flush 操作，很少发生
        - Dirty Page too much checkpoint
            - innodb_max_dirty_pages_pct (default 75)
            - 脏页超过 75% 时强制刷新

### Master Thread 工作方式

- 1.0.x 前
    - 每秒发生的操作
        - [总是] 日志缓冲刷回磁盘（即使事务未提交）
        - [可能] 合并 insert buffer
        - [可能] 刷新脏页到磁盘（最多 100 页）
        - [可能] 如果当前没有用户活动，则切到 background loop
    - 每十秒的操作
        - [可能] 刷新脏页到磁盘（最多 100 页）
        - [总是] 合并 insert buffer (最多 5 个)
        - [总是] 将日志缓冲刷回磁盘
        - [总是] 删除无用 undo 页
        - [总是] 刷新 100 个或 10 个脏页到磁盘
    - background loop
        - [总是] 删除无用的 undo 页
        - [总是] 全新 20 个 insert buffer
        - [总是] 跳回到主循环
        - [可能] 不断刷新 100 个页直到符合条件 （跳转到 flush loop 完成）
- 1.2.x 前
    - 可配置的 IO 写入比例
        - innodb_io_capacity (default 200)
        - 合并插入缓冲时，数量为 capacity * 0.05 (之前为 5）
        - 刷新脏页时，数量为 capacity
    - innodb_max_dirty_pages_pct (-> 75)
        - 加快了脏页的刷新频率
        - 同时兼顾了 IO 负载
    - 可配置回收 undo 页个数
        - innodb_purge_batch_size(default 20)
- 1.2.x
    - 刷新页的操作分离为单独的 page cleaner thread

### InnoDB 关键特性

- 插入缓冲 (Insert buffer)
    - Insert Buffer
        - 插入自增主键时，只需要顺序读取，不需要随机访问
          - 并非所有主键插入都是顺序的
          - 主键是 UUID 时，是随机
          - 主键是自增类型，但插入时指定了值，而非 NULL，则依旧是随机的。
        - 如果表上有 secondary index，则由于不是聚集的，依旧需要随机访问索引页
        - 插入时，如果索引页在缓冲池中，则直接插入
        - 如果不在，则先放到 Insert Buffer 中，假装插入成功
        - 定期将 Insert Buffer 和索引页进行合并
        - 使用时需要满足条件
            - 索引是辅助索引 (secondary index)
            - 索引不唯一
        - 存在问题
            - 宕机恢复时间长
            - 写密集时占用过多缓冲区
    - Change Buffer
        - Insert Buffer 的升级，可缓冲 DML 操作
    - Insert Buffer 内部实现
        - 全局的一棵 B+ 树
        - 非叶节点存放 search key。(space, marker, offset)
- 两次写 (Double Write)

  数据只有写到磁盘才安全，如果脏页未刷回，如何保证 crash safe？使用了 WAL，先
  写入 log 再刷回磁盘。由于 log 是顺序写入，性能过关，写入页的途中可能 crash，
  此时使用 double write 恢复，相当于存档

    - 作用：带来数据页的可靠性，解决在将页写入磁盘时发生宕机
    - 由两部分缓存：内在中的 buffer，和磁盘上共享表空间的连续 128 个页，大小都是 2MB
    - 先将页复制到 double write buffer，再分两次，每次 1MB 写入磁盘，后马上调用 fsync 同步磁盘
    - double write 结束后再写入表空间的文件中

- 自适应哈希索引 (Adaptive Hash Index)
    - 会自动根据对索引页的查询情况创建哈希索引
    - 要求
        - 要求对页的连续访问模式必须一样
        - 以该模式访问了 100 次
        - 页通过该模式访问了 N 次，N = 页中记录 * 1/16

- 异步 IO (Async IO)
    - 增加 IO 请求的吞吐
    - 底层实现可以进行 IO merge
- 刷新邻接页 (Flush Neighbor Page)
    - 刷新脏页时，会检测该页所在区的所有页，如果是脏页则一起刷新
    - 好处是可以合并 IO 操作

### 启动、关闭、恢复

（暂无内容）

## Ch03: 文件

### 参数文件

- 什么是参数
- 参数类型
    - 动态、静态
    - SET [global | session] system_var_name = expr
    - SET [@@global. | @@session. | @@]system_var_name = expr

### 日志文件

- 错误日志 error log
    - SHOW VARIABLES LIKE 'log_error'\G; 查看路径
- 二进制日志 bin log
- 慢查询日志 slow query log
    - SHOW VARIABLES LIKE 'long_query_time'\G;
    - SHOW VARIABLES LIKE 'slow_query_log_file'\G;
    - SHOW VARIABLES LIKE 'slow_query_log'\G;
- 查询日志 log

### socket 文件

- SHOW VARIABLES LIKE 'socket'\G;

### pid 文件

- SHOW VARIABLES LIKE 'pid_file'\G;

### 表结构定义文件

- 每个表对应一个 .frm 后缀的文件，记录表结构定义

### InnoDB 存储引擎文件

- 表空间文件
    - 数据按表空间 (tablespace) 存放
    - 默认设置下，初始为 10MB，名为 ibdata1 的文件
    - 通过 innodb_data_file_path 设置
    - 默认所有数据存放在共享的表空间中
    - 若设置了 innodb_file_per_table 则每个表会产生独立的表空间：表名.ibd
        - 它只存放表的数据、引擎、插入缓冲 BITMAP 信息，其余信息还在默认表空间中
- 重做日志文件 (redo log file)
    - ib_logfile0 & ib_logfile1
    - 两文件循环写入，0 满了写 1，1 满了写 0
    - SHOW VARIABLES LIKE 'innodb%log%'\G;
    - redo log buffer 写入磁盘时按 512 字节写入，必定成功，不需要 doublewrite

## Ch04: 表

### 索引组织表

- 表是根据主键顺序存放的，称为索引组织表（index organized table）
- 每张表都有主键，如果没有显示指定，则

    - 表中有唯一非空索引的列，则作为主键
    - 若无，则自动创建一个 6 字节大小的指针
    - 若有多个非空唯一索引，则选择第一个，根据的是定义索引的顺序而非定义列的顺序

### InnoDB 逻辑存储结构

- 所有数据都存放在表空间 (tablespace) 中
- 表空间由段 (segment)、区 (extend)、页 (page) 组成
- 表空间
    - 存储引擎逻辑的最高层
    - 如果启用 innodb_file_per_table，则每张表的表空间内只存放数据、索引和插入缓冲 Bitmap 页，其它数据，如回滚信息、插入缓冲索引页、系统事务信息、double write buffer 还在原来的表空间内
- 段 (segment)
    - 表空间有多个段组成，常见有数据段、索引段、回滚段等
    - InnoDB 是索引组织的，数据即索引，索引即数据。数据段即是 B+ 树的叶子节点
- 区(extent)
    - 由连续页组成
    - 任何情况下每个区的大小都是 1MB
    - 为了保证区中叶的连续性，一次从磁盘中申请 4～5 个区
    - 默认页大小为 16K，一个区中有 64 个连续页
    - 每个段开始时，会先用 32个页大小的碎片页(fragment page) 来存放数据，之后才是 64 个连续申请的页。目的应对小表或 undo 段，减小磁盘开销
- 页 (page)
    - InnoDB 管理磁盘的最小单位 ，默认为 16KB
    - 常见类型
        - 数据页 (B-tree Node)
        - Undo 页 (undo log page)
        - 系统页 (system page)
        - 事务数据页 (transaction system page)
        - 插入缓冲位图页 (Insert Buffer Bitmap)
        - 插入缓冲空闲页列表页 (insert buffer free list)
        - 未压缩的二进制大对象页 (Uncompressed BLOB page)
        - 压缩的二进制大对象页 (compressed BLOB page)
- 行
    - 数据是按行存储
    - 每个页最多允许存放 16KB/2 - 200 = 7992 行

### InnoDB 行记录格式

- REDUNDANT, COMPACT, DYNAMIC, COMPRESSED

    - SHOW TABLE STATUS LIKE '<table>' \G;

- COMPACT format

    - 目的是高效存储数据
    - | 变长字段长度列表 | NULL 标志位 | 记录头信息 | 列 1 数据 | ....
    - 变长字段长度列表按列的逆序放置
        - 若列小于 255 字节，用 1 字节表示
        - 如大于 255 字节，用 2 字节表示
    - NULL 标志位
        - 第 N 位表示第 N 列是否是 NULL，是则为 1
    - 记录头信息占 5B（40 bit)
    - NULL 列不占数据列的空间
    - 有两个隐藏列
        - 事务 ID 列(6B)
        - 回滚指针列(7B)
    - 若不指定主键，则会增加一个 rowid 列(6B)
    - Index 指向的应该是记录头，再向前找长度列表
- REDUNDANT format
    - | 字段长度偏移列表 | 记录头信息 | 列 1 数据 | ....
    - 记录头占 6B(48Bit)
        - n_fields(10bit) 代表列数量，所以最大列数为 1023
    - NULL 字段需要占空间
- 行溢出数据
    - 可以将记录中的某些数据（如 BLOB）存储在真正的数据页之外
    - 页大小为 16K，如何存放 > 16K 数据？
    - 行溢出时，数据存放在页类型为 Uncompress BLOB 页中
    - 数据页中只保留前 768 字节的 prefix 数据
    - | prefix 768 bytes | <ptr to blob page> | ...
    - 存放在数据页还是 uncompressed blob page，取决于一页中是否能存放两条记录，如果可以则放数据页中，否则放 blob page 中
- Compressed 和 Dynamic
    - 对存放在 BLOB 中的数据采用了完全的行溢出
    - 数据页中只存放 20 字节的指针，数据存放在 Off Page
    - Compressed 还会使用 zlib 对 BLOB, TEXT, VARCHAR 进行压缩
- CHAR 的行结构存储
    - CHR(N) 中 N 开始指的是字符长度
    - 多字节字符集下，CHAR 与 VARCHAR 的处理相同，在行的变长字段长度列表中也会记录长度

### InnoDB 数据页结构（见书）

（暂无内容）

### Named File Formats 机制

- 解决不同版本下页结构兼容性问题
- 1.0.x 之前的格式定义为 antelope, 当前版本为 Barracuda
- 新的文件格式总是包含之前的版本的页格式
- 简单地说就是新格式兼容旧格式？并重新命名？

### 约束 (constraint)

- 数据完整性
    - 实体完整性保证表中有主键
        - 通过定义 Primary Key, Unique Key 或触发器
    - 域完整性保证每列的值满足特定条件
        - 选择合适的数据类型确保数值满足特定条件
        - 外键约束
        - 编写触发器
        - 用 DEFAULT 值
    - 参照完整性保证两张表之间的关系
    - InnoDB 支持的约束
        - Primary Key, Unique Key, Foreign Key, Default, Non NULL
- 约束的创建和查找
    - 创建
        - 建表时创建
        - ALTER TABLE 来创建
- 约束与索引的区别
    - 约束是逻辑概念，用以保证数据的完整性
    - 索引是数据结构，既有逻辑上的概念，还代表物理存储的方式
- 对错误数据的约束
    - 某些默认设置下，允许非法或不正确的数据插入或更新
    - 设置  sql_mode = 'STRICT_TRANS_TABLES' 强制约束
- ENUM 和 SET 约束
    - 通过 ENUM/SET 类型约束取值
- 触发器与约束
    - 可以通过触发器做一些高级的约束
- 外键
    - MyISAM 不支持
    - ON DELETE/ON UPDATE 指定父表进行 DELETE/UPDATE 操作时，对子表所做的操作
        - CASCADE
        - SET NULL
        - NO ACTION
        - RESTRICT

### 视图

- named virtual table，由 SQL 查询定义，可以当作表，但没有实际的物理存储
- 视图的作用
    - 作为应用层的抽象
- 物化视图
    - Oracle 支持，将视图存成实表

### 分区(partition)表

- 分区概述
    - 将一个表或索引分解成多个更小的、更可管理的部分
    - 逻辑上不变，物理上可能由多个物理分区(partition)组成
    - SHOW VARIABLES LIKE '%partition%' \G;
    - PARTITION BY ...
- 分区类型
    - RANGE 分区
        - 行根据列值是否在区间内放入分区
        - ```
          PARTITION BY RANGE(id) (
          PARTITION p0 VALUES LESS THAN (10),
          PARTITION p1 VALUES LESS THAN (20));
          ```
        - 分区后，表由多个 idb 文件组成
        - RANGE 主要用于日期列的分区
    - LIST 分区
        - 和 RANGE 类似，但面向的是离散值
        - ```
          PARTITION BY LIST(b) (
          PARTITION p0 VALUES in (1, 3, 5, 7, 9),
          PARTITION p1 VALUES in (0, 2, 4, 6, 8));
          ```
    - HASH 分区
        - 根据用户自定义的表达式返回值进行分区
        - PARTITION BY HASH(expr)
    - KEY 分区
        - 根据 MySQL 提供的哈希函数进行分区
    - COLUMNS 分区
        - 支持非整型数据
- 子分区(subpartitioning)
    - MySQL 允许在 RANGE 和 LIST 的分区上再进行 HASH/KEY 的子分区
    - 可用于特别大的表，在多个磁盘间分配数据和索引
- 子分区中的 NULL 值
    - MySQL 中将 NULL 视作小于任何一个非 NULL 值
    - 因此插入 RANGE 分区时会插入最左的分区
    - HASH 和 KEY 会将含有 NULL 值的记录返回为 0
- 分区和性能
    - 大意：OLAP 应用一般可以分区，OLTP 要小心分析
- 在表和分区间交换数据
    - ALTER TABLE ... EXCHANGE PARTITION
    - 用于交换分区或子分区的数据与另一非分区表中的数据

## Ch05: 索引与算法

### 存储索引概述

- B+ 树索引
    - B+ 树只能找到数据对应的页，而不是行
- 全文索引
- Hash 索引

### 数据结构与算法

- 二分查找法
- 二叉查找树与二叉平衡树

### B+ 树

- 所有的值都放在叶子节点上
- B+ 树的插入操作
    - Leaf Page 满
        - Index Page 满
            - 直接将记录插入叶子节点
        - Index Page 满
            1. 拆分 Leaf Page
            2. 将中间的节点放入 Index Page 中
            3. 小于中间节点的记录放左边
            4. 大于或等于中间节点的记录放右边
                                    - 1. 拆分 Leaf Page
            2. 小于中间节点的记录放左边
            3. 大于或等于中间节点的记录放右边
            4. 拆分 Index page
            5. 小于中间节点的记录放左边
            6. 大于蹭节点的记录放右边
            7. 中间节点放入上一层 Index Page
- B+ 树的删除操作
    - 叶子节点小于填充因子
        - 直接将记录从叶子节点删除，如果该节点还是 Index page 的节点，用访节点的右节点代替
        - 中间节点小于填充因子
            - 合并叶子节点和它的兄弟节点，同时更新 Index Page
            - 1. 合并叶子节点和它的兄弟节点
2. 更新 Index Page
3. 合并 Index Page 和它的兄弟节点

### B+ 树索引

- 聚集索引 (clustered index)
    - 按每张表的主键构造一棵 B+ 树
    - 同时叶子节点存放的即为整张表的行记录数据
    - 每张表只能拥有一个聚集索引
    - 聚集索引的存储是逻辑的连续而非物理上的

      即页内是连续的，但是如果在多个页中，则并不需要在物理上连续

    - 主键的排序查找和范围查找速度非常快

      主要原因是数据本身就在叶子节点上，逻辑连续，因此只需要找到头和尾就可以通过双向链表顺序读取

- 辅助索引 (secondary index)

    - 叶子节点包含键值和 bookmark

        - bookmark 指向对应的行数据
        - bookmark 即为其聚集索引的键值

    - 搜索时先遍历辅助索引，获得指向主键索引的键
    - 再通过主键索引找到完整的记录行

- B+ 树索引的分裂
- B+ 树索引的管理

    - 索引管理

        - ALTER TABLE
        - CREATE/DROP INDEX
        - SHOW INDEX FROM

            - Cardinality：尽可能接近 1
            - Sub_part: 是否只有列的部分用于索引
            - ……

    - Fast index creation

        - 创建时对表加上 S 锁，不需要重建表
        - 删除时只需更新内部视图

    - Online Schema Change

      操作比较复杂，需要复习

    - Online DDL

        - 原理是将 CUD 操作写入缓冲，完成索引创建后重新应用到表上

### Cardinality

- 什么是 Cardinality 值？

  高选择性的列适合建索引，即通过某个 key 能找到的数据越少越好

    - SHOW INDEX 中可以看到对应的值
    - 代表索引中预估的不重复记录数
    - Cardinality/n_rows_in_table 应尽可能接近 1

- Cardinality 统计

    - 通过采样完成
    - 统计信息发生在 INSERT/UPDATE 时
    - 更新 Cardinality 信息的策略为

        - 表中 1/16 的数据已经发生过变化
        - stat_modified_counter > 20 亿

    - 如何更新？

        - 默认对 8 个叶子节点（leaf page）进行采样
        - 取得 B+ 树索引的叶子节点的数量，记为 A
        - 随机取得 B+ 树索引中的 8 个叶子节点。统计每个叶不同记录的个数，记为 P1, ... P8
        - 预估值：Cardinality = (P1 + P2 + ... + P8) * A / 8

### B+ 树索引的使用

- 不同应用中 B+ 树索引的使用

    - OLTP 应用中，建立索引后，应该只通过该索引查询得到表中的少量数据
    - OLAP 中，很多字段通常会拉取全表（如姓名），则没有必要创建索引
    - OLAP 中常对时间进行筛选，因此通常会对时间字段进行索引

- 联合索引

    - 例如有 a, b 两个字段，联合索引中会先以 a, b 的顺序进行排序 (a0, b1) < (a1, b0) < (a1, b2)
    - 如果结果需要以 b 进行排序，则有了联合索引后可以省去对结果进行排序

- 覆盖索引（covering index）

    - 从辅助索引中就可以得到查询的记录，就不需要查询聚集索引中的记录。
    - 例如，select 的 key 全在索引中
    - 例如，只需要 count

- 优化器选择不使用索引的情况

    - 对于不能进行索引覆盖的情况，优化器只有在查找的数据是少量的情况下才会选择辅助索引，否则查出最后的数据也很耗时（无序磁盘读）

- 索引提示

    - 优化器可能错误选择了某个索引
    - 索引过多，选择执行计划开销大
    - SELECT * FROM t USE INDEX(xxx) ....

- Multi-range READ 优化

    - 目的：减少磁盘的随机访问
    - 适用于：range, ref, eq_ref 类型的查询
    - 好处：

        - 使访问变得有序。查询辅助索引时，得到结果根据主键排序，并依照主键顺序进行书签查找
        - 减少缓冲池中需要替换的页的次数
        - 批量处理对键的查询操作

- Index Condition Pushdown(ICP) 优化

    - 将 WHERE 的部分过滤操作放在了存储引擎层
    - 支持 range, ref, eq_ref, ref_or_null 类型

### 哈希算法

- InnoDB 中的哈希算法

    - 散列哈希+链表冲突

- 自适应哈希索引

### 全文索引

- 概述

    - B+ 树支持前缀查找：(like 'xxx%')
    - MyISAM 支持
    - InnoDB 1.2.x 支持

- 倒排索引

    - Inverted file index: (term -> docId)
    - full inverted index (term -> (docId, position))

- InnoDB 全文检索

    - 使用 full inverted index
    - 需要将 word 放在一张表中：Auxiliary Table
    - 在 InnoDB 中，为了提高并行性能，存了 6 张，并根据 word 的 Latin 编码进行分区
    - FTS Index Cache 存放于内存中，提高速度

        - 红黑树
        - 根据 （word, ilist）排序

    - 批量更新 Auxiliary Table
    - 关闭数据库时，会将 FTS Index Cache 同步到磁盘中的 Auxiliary Table
    - 索引的写入是在事务提交的时候完成
    - 删除的 DOC 不更新 Auxiliary Table，而是记录在删除表DELETED Auxiliary Table 中
    - 限制

        - 每张表只能有一个全文检索的索引
        - 由多列组合而成的全文检索的索引列必须使用相同的字符集与排序规则
        - 不支持没有 delimiter 的语言，如 CJK

- 全文检索

  讲了一些全文检索的语法

    - MATCH (col1, col2, ...) AGAINST (expr [search modifier])

## Ch06：锁

### 什么是锁

- 不同数据库、不同存储引擎的锁实现不同

### Lock 与 Latch

- Latch 一般称为闩锁（轻量级的锁），锁定的时间非常短

    - Mutex
    - Rwlock

- Lock 的对象是事物，锁表、页、行
- SHOW ENGINE INNODB MUTEX 查看 latch
- SHOW ENGINE INNODB STATUS 查看 lock

### InnoDB 存储引擎中的锁

- 锁的类型

    - 共享锁 (S Lock)，允许事务读一行数据
    - 排他锁 (X Lock)，允许事务删除或更新一行数据
    - 意向锁 (Intention Lock)，表示事务希望在更细欧亚上进行加锁

        - 对下层对象（最细粒度）上锁，需要先对上层对象（粗粒度）上意向锁
        - 其中任何一个部分导致等待，则需要等待粗粒度的锁完成
        - 意向共享锁(IS Lock)，想要获取表中某几行的共享锁
        - 意向排他锁(IX Lock)，想要获取表中某几行的排他锁
        - 用来与其它粗粒度的 S/X 竞争

- 一致性非锁定读 (Consistent Non-locking Read)

    - 通过 MVCC 读快照
    - 通过 undo 段实现，没有额外开销
    - READ COMMITTED 总是读取被锁定行的最新一份快照数据
    - REPEATABLE READ 总是读取事务开始时的行数据版本

- 一致性锁定读

    - SELECT ... FOR UPDATE

        - 对行记录加 X 锁

    - SELECT ... LOCK IN SHARE MODE

        - 对行记录加 S 锁

- 自增长与锁

    - AUTO-INC Locking
    - 不是在事务完成后释放，而是自增的插入语句完成后立即释放
    - 插入分类

        - insert-like

            - 所有插入语句

        - simple inserts

            - 插入前就能确定插入行数，包括 INSERT/REPLACE
            - 不包括 INSERT ... ON DUPLICATE KEY UPDATE 等

        - bulk insert

            - 插入前不能确定得到插入行数的语句，如 INSERT ... SELECT, REPLACE ... SELECT, LOAD DATA

        - mixed-mode insert

            - 一部分是自增长的，一部分是确定的

- 外键和锁

    - 对于外键列，如果没有显式加索引，会自动添加
    - 对外键值的插入更新时，首先用 SELECT ... LOCK IN SHARE MODE 方式锁父表的记录

### 锁的算法

- 行锁的三种算法

    - Record Lock 单个行上的锁

        - 如果没有索引，会使用隐式的主键进行锁定

    - Gap Lock 间隙锁，锁范围，但不包含记录本身

        - 行查询时使用的算法
        - 为了解决 Phantom Problem

    - Next-Key Lock: Gap Lock + Record Lock
    - 当 SELECT ... FOR UPDATE 时，会对上一个范围增加 next-key lock，然后对下一个范围 加 gap lock

        - create table z (a INT, b INT, primary key(a), key(b)
        - 假设有 (1,1) (3,1) (5,3) (7,6) (10,8) 数据
        - select * from z where b = 3 for update
        - 会锁住 b 列的 (1,3], (3, 6)
        - 插入 (4,2) 或 (6,5) 都会被阻塞

- 解决 Phantom Problem

    - 指：在同一事务下，连续执行两次同样的 SQL 语句可能导致不同的指标，第二次 SQL 语句可能返回之前不存在的行
    - 有了 next-key lock，则 WHERE a > 2 FOR UPDATE 会为范围 (2, +inf) 增加 X 锁

### 锁问题

- 脏读 (Dirty Read)

    - 指可以读到未提交事务的数据
    - 在 READ UNCOMMITTED 下发生
    - 违反了 Isolation

- 不可重复读

    - 即会有幻读，同一 SQL 执行两次结果可能不同
    - 设置为 REPEATABLE READ 隔离级别解决

- 丢失更新

    - 一个事务的更新会被另一个事务的更新覆盖
    - 一般是由于业务逻辑上的非原子性修改导致的
    - 需要通过悲观锁行来解决

### 阻塞

- innodb_lock_wait_timeout 控制等待锁的时间
- innodb_rollback_on_timeout 设定是否回超时事务（默认 OFF 不回滚）

    - why default OFF?

### 死锁

- 超时机制
- wait-for graph（等待图）检测死锁
- 默认不回滚大部分错误异常，死锁除外

### 锁升级 (Lock Escalation)

- 例如将 1k 个行锁升级成页锁
- InnoDB 中不存在锁升级的问题

## Ch07: 事务

### 认识事务

- 分类

    - 扁平事务 (flat transactions)

        - begin 开始，commit/rollback 结束
        - 要么全提交，要么全回滚
        - 一般数据库都支持，太常用了

    - 带保存点的扁平事务 (flat transactions with savepoints)

        - 允许回滚到同一事务之前较早的状态
        - SAVE WORK 函数建立保存点
        - 保存点在事务内是递增的，rollback 后计数继续增加
        - 需要多次 rollback 才能完全回滚事务
        - 但是 save point 不是持久的，系统崩溃后依旧要重新开始

    - 链事务 (chained transactions)

        - 提交事务时，释放不需要的对象，将必要的上下文隐式地传给下一个要开始的事务
        - 即提交事务与下一个事务的操作将合并成原子操作
        - 仅限回滚当前事务

    - 嵌套事务 (nested transactions)

        - 是一棵树，子树可以是嵌套事务，也可以是扁平事务
        - 叶节点的事务是扁平事务，但树高可以不同
        - 根节点的事务称为顶层事务，其它称为子事务
        - 子事务可以提交也可以回滚，但不马上生效，除非父事务已提交。推论：顶层提交后才真正提交
        - 树中任意事务回滚会引起所有子事务一起回滚

    - 分布式事务 (distributed transactions)

        - 分布式环境下运行的扁平事务

- InnoDB 不支持嵌套事务，其它都支持

### 事务的实现

- redo

    - 基本概念

        - 实现持久性，即 ACID 中的 D
        - 包含两部分

            - redo log buffer 内存中的，易失
            - redo log file 磁盘中的，持久

        - 持久性通过 Force Log at Commit 实现

            - 在事务提交时，必须将该事务的所有日志写到 redo log & undo log 文件中才算完成
            - redo log 保证事务的持久性，基本是顺序写
            - undo log 帮助事务回滚及 MVCC，需要随机读写
            - 写入 redo log file 后要显示调用 fsync 确保真正刷回磁盘

              innodb_flush_log_at_trx_commit 可以控制刷新策略
              默认为 1，代表写入文件且调用 fsync
              0 表示不进行写入操作，仅由 master thread  每 1 秒进行 fsync
              2 表示写入文件，但不强制 fsync

        - bin log

            - redo log 是存储引擎层，而 bin log 是数据库层, redo log 是 InnoDB 产生，bin log 对所有引擎适用
            - bin log 是逻辑日志，记录 SQL，redo log 是物理日志，记录对页的修改
            - bin log 只在事务提交后进行一次写入，redo log 在事务中不断被写入
            - redo log 中一个事务可能对应多个条目，写入是并发的

    - log block

        - redo log 以 512B 存储，称为 log block
        - log block 与磁盘的扇区大小一致，可以保证写入原子性，不需要 double write 技术
        - block header 占 12B & block tailer 共占用 8B
        - block header

            - LOG_BLOCK_HDR_NO(4)

                - 标记 log buffer 中的位置，递增循环使用

            - LOG_BLOCK_HDR_DATA_LEN(2)

                - log block 所占用的大小

            - LOG_BLOCK_FIRST_REC_GROUP(2)

                - 表示 block 中第一个日志的偏移量

            - LOG_BLOCK_CHECKPOINT_NO(4)

                - 写入时 checkpoint 第 4 字节的值

    - log group

        - 逻辑概念，由多个 redo log file 组成
        - redo log file 存储的就是 log buffer 中保存的 log block
        - 刷回磁盘的策略

            - 事务提交时
            - log buffer 中有一半空间已经被使用时
            - log checkpoint 时

        - log block 会 append 在 redo log file 的末尾
        - log file 写满时，会写入下一个 log file (round-robin)
        - 每个 log file 的前 2KB 用于保存其它信息

    - redo log 格式

        - 存储管理是基于页的，因此 redo log 也基于页
        - | redo_log_type | space | page_no | redo log body |

    - LSN

        - 日志序列号，8B，单调递增
        - 含义

            - redo log 写入的总量
            - checkpoint 的位置
            - 页的版本

                - 如每个页上在保留着最后刷新数据对应的 LSN

    - 恢复

        - 由于 checkpoint 表示刷回磁盘页上的 LSN，仅需要从 checkpoint 后的日志开始恢复

- undo

    - 基本概念

        - 用于回滚事务、MVCC
        - 存放在缓冲区中的特殊段(undo segment)，undo 段位于共享表空间
        - undo 是逻辑日志，只是做反向的修改，如 INSERT 操作写入一个 DELETE 作为 undo
        - undo log 也会产生 redo log，用于持久化

    - undo 存储管理

        - 有专门的 rollback segment，每个段记录 1024 个 undo segment，在 undo log segment 中申请 undo 页
        - 事务提交时

            - 将 undo log 放入列表 中，供之后 purge 操作
            - 判断 undo log 所在页是否可重用，若可以则分配给下个事务使用

        - 事务提交后不能立马删除 undo log 及所在页，因为可能有其它事务在使用(MVCC)
        - 会对 undo 页进行重用，事务提交时，先将它放入链表，若空间小于 3/4，则可以重用，新的 undo log 写在当前 undo log 之后

    - undo log 格式

      具体格式要看书，不过可能过于细节，正常做业务不需要理解

        - insert undo log

            - INSERT 只对事务本身可见，对其它不可见（隔离性要求），因此事务提交后可以直接删除

        - update undo log

            - 可能被 MVCC 用到，只能等 purge 删除

    - 查看 undo 信息

        - SELECT segment_id, space, page_no FROM INNODB_TRX_ROLLBACK_SEGMENT;

- purge

    - purge 用于最终完成 delete/update 操作（由于 MVCC，并不能立即应用这些更改）
    - 内部有个 history list，会按照事务提交的顺序组织 undo log，先提交的事务总在末尾
    - purge 时，先找到每一个可以被清理的记录
    - 清理后会在 undo 页中先查看是否有其它可以清理的记录
    - 若没有，则再回 history list 查找

- group commit

    - group commit 来减少 fsync 的调用次数

### 事务控制语句

- START TRANSACTION | BEGIN

    - 显示开启事务

- COMMIT

    - 提交事务

- ROLLBACK

    - 回滚，结束事务并撤销未提交的更改

- SAVEPOINT identifier

    - 创建 save point，事务中可以有多个

- RELEASE SAVEPOINT identifier

    - 删除事务 checkpoint，不存在时抛异常

- ROLLBACK TO [SAVEPOINT] identifier

    - 回滚到标记点

- SET TRANSACTION

    - 设置隔离级别

        - READ UNCOMMITED
        - READ COMMITTED
        - REPEATABLE READ
        - SERIALIZABLE

### 隐式提交的 SQL 语句

- DDL 语句

    - [CREATE|DROP|ALTER] [DATABASE|EVENT|INDEX|PROCEDURE|TABLE|TRIGGER|VIEW]
    - UPGRADE DATA DIRECTORY NAME
    - [RENAME|TRUNCATE] TABLE

- 隐式修改 MySQL 架构的操作

    - CREATE USER, DROP USER, GRANT, RENAME USER, REVOKE, SET PASSWORD

- 管理语句

    - ANALYZE TABLE, CACHE INDEX, CHECK TABLE, LOAD INDEX INTO CACHE, OPTIMIZE TABLE, REPAIR TABLE

### 对于事务操作的统计

- TPS: (com_commit + com_rollback)/time
- SHOW GLOBAL STATUS LIKE '...' \G;

### 事务的隔离级别

### 分布式事务 (XA)

- MySQL 数据库分布式事务

    - 隔离级别必须为 SERIALIZABLE
    - 1~N Resource Manager

        - 提供访问事务资源的方法，通常数据库就是

    - Transaction Manager

        - 协调参与全局事务中的各个事务，需要和所有 resource manager 通信

    - Application Program

        - 定义事务的边界

    - 使用 2PC，需要先 PREPARE 再 COMMIT|ROLLBACK
    - 语法

        - XA {START|BEGIN} xid [JOIN|RESUME]
        - XA END xid [SUSPEND [FOR MIGRATE]]
        - XA PREPARE xid
        - XA COMMIT xid [ONE PHASE]
        - XA ROLLBACK xid
        - XA RECOVER

- 内部 XA 事务

    - 在存储引擎与插件间的分布式事务
    - 如 bin log 与 InnoDB 间

### 不好的事务习惯

- 在循环中提交事务

    - 写 redo log 和 fsync 次数太多

- 使用自动提交
- 使用自动回滚

    - 应当交由程序端控制，需要知道具体出了什么错

### 长事务

- 执行时间太长的事务
- 回滚的代价太大
- 常常可以转换成 mini-batch 来提交

## Ch08: 备份与恢复

（暂无内容）

## Ch09: 性能调优

（暂无内容）
