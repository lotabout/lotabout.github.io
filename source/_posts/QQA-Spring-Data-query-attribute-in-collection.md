title: 'QQA: Spring Data 如何查询属性是否在列表中'
date: 2018-11-23 15:53:20
tags: [QQA, Spring, JPA]
categories: [QQA]
toc:
---

每篇文章有多个标签，选中多个标签，要求找出含有该标签的文章。同时如果选中标签为
空，则返回所有文章。Spring Data/JPA 如何实现？

可以使用 Spring Data Specification 动态创建查询语句，最终结果如下：

```java
public interface PostRepository extends JpaRepository<Post, Long>,
    JpaSpecificationExecutor<Post> { // ①

    default List<Post> query(List<Tag> tags) {
        return findAll((root, cq, cb) -> { // ②
            cq.distinct(true); // ③
            if (tags == null || tags.isEmpty()) {
                return cb.conjunction(); // ④
            } else {
                return root.join("tags").in(tags); // ⑤
            }
        });
    }
}
```

上面代码的注意点：

1. 实现 `JpaSpecificationExecutor` 来启用 Specification，Repository 中会增加
   `findAll(Specification<T> spec)` 等使用 Specification 的查询方法。
2. 这里使用 Java 8 的 Lambda 表达式。等价于实现一个 `Specification` 实例。
3. 返回结果为 `List`，可能会出现重复的结果，加上 `distinct` 来去重。
4. `cb.conjunction()` 等价于 `where 1=1`。
5. 重要：调用 `join` 来定位多对多的（或其它的关联）属性。


## 实体类定义

文章类，其中一篇文章可以有多个标签 `Tag`：

```java
@Entity
public class Post {
    @Id
    @GeneratedValue
    private long id;
    private String name;

    @ManyToMany(cascade = {CascadeType.PERSIST, CascadeType.MERGE, CascadeType.DETACH, CascadeType.REFRESH})
    private Set<Tag> tags = new HashSet<>();

    // ...
}
```

标签类，一个标签可以被赋给多篇文章：

```java
@Entity
public class Tag {
    @Id
    @GeneratedValue
    private int id;
    private String name;
    private String createdBy;

    @ManyToMany(mappedBy = "tags")
    private Set<Post> posts = new HashSet<>();
    // ...
}
```

## 生成的 SQL

实际查询时生成的 SQL 如下：

```sql
    select
        distinct post0_.id as id1_0_,
        post0_.name as name2_0_
    from
        post post0_
    inner join
        post_tags tags1_
            on post0_.id=tags1_.posts_id
    inner join
        tag tag2_
            on tags1_.tags_id=tag2_.id
    where
        tag2_.id in (
            ? , ?
        )
```

## 为什么用 Specification

上面介绍的 Spring Specification 看起来比较复杂，其实如果只需要查询一个属性，可
以直接定义 Spring Data 的 Query Method：

```java
public interface PostRepository extends JpaRepository<Post, Long> {
    List<Post> findDistinctByTagsIn(List<Tag> tags); // ①

    default List<Post> query(List<Tag> tags) { // ②
        if (tags == null || tags.isEmpty()) {
            return findAll();
        } else {
            return findDistinctByTagsIn(tags);
        }
    }
}

```

当然，① 处的方法不能处理 `tags` 为空时返回所有文章的需求，所以需要 ② 处的方法
进行包装。

那么 Specification 还有什么用呢？考虑多个查询条件的组合，例如文章有多名作者，
要根据作者和标签共同查询，则需要像这样实现：

```java
public interface PostRepository extends JpaRepository<Post, Long> {
    List<Post> findDistinctByTagsIn(List<Tag> tags);
    List<Post> findDistinctByAuthorsIn(List<Author> authors);
    List<Post> findDistinctByAuthorsInAndTagsIn(List<Author> authors, List<Tag> tags);

    default List<Post> query(List<Author> authors, List<Tag> tags) {
        if ((authors == null || authors.isEmpty()) && (tags == null || tags.isEmpty())) {
            return findAll();
        } else if (authors == null || authors.isEmpty()) {
            return findDistinctByTagsIn(tags);
        } else if (tags == null || tags.isEmpty()) {
            return findDistinctByAuthorsIn(authors);
        } else {
            return findDistinctByTagsIn(tags);
        }
    }
}
```

这种实现方式需要增加指数级的方法数量，因此更合适用 Specification 动态生成 Query。

## 参考资料

- [Spring Data repository with empty IN
    clause](https://rzymek.github.io/post/jpa-empty-in/) 跟本文探讨的问题相同，
    有更细致的分析。不过它处理的属性没有关联关系。
- https://www.jianshu.com/p/659e9715d01d Spring Data Specification 的一些使用
    示例。
- https://docs.oracle.com/javaee/6/tutorial/doc/gjivm.html Criteria API，说明
    挺详细，然而还是看不太懂。
