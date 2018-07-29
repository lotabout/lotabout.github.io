title: 'QQA: Hibernate 为什么需要手工管理双向关联'
date: 2018-07-28 23:30:18
tags: [QQA, hibernate, JPA]
categories: [QQA]
toc:
---

Hibernate/JPA 中如果两个 Entity 之间的关联是双向的（不论是 `@ManyToMany`、
`@OneToMany` 还是 `@OneToOne`），都需要手动管理关联，为什么？

* 调用 `entityManager.persist` 保存对象时 Hibernate/JPA 不会直接执行 SQL，而会
    等到 `entityManager.flush` 或事务 `commit` 时完成。
* 同理 `entityManager.load` 也可能只会从内存中获取对象(可以认为是某种缓存)。
* 如果不手动管理双向关联，则从内存获取的对象并不会反映数据库中的映射关系。

## 什么是双向关联

双向关联的本质是告诉 Hibernate 让两个实体共用一张数据库表(或表结构)。


这里以 `@ManyToMany` 为例(参考[Hibernate User
Guide](http://docs.jboss.org/hibernate/orm/5.3/userguide/html_single/Hibernate_User_Guide.html#associations-many-to-many-bidirectional))
：有两个实体 `Person` 和 `Address`，一个 Person 可以拥有多个 Address，而一个
Address 也可以属于多个 Person。于是设计实体如下：

```java
@Entity
public static class Person {
    @Id
    @GeneratedValue
    private Long id;

    @ManyToMany
    private List<Address> addresses = new ArrayList<>();

    // ... omit all other stuff
}

@Entity
public static class Address {
    @Id
    @GeneratedValue
    private Long id;

    @ManyToMany
    private List<Person> owners = new ArrayList<>();

    // ... omit all other stuff
}
```

问题来了，我们应该创建一张关联表还是两张呢？其实取决于使用业务含义。即如果
`Person` 中 `addresses` 的含义是“人的居住地址”，而 `Address` 中的 `owners` 与
之对应，表达的是“地址上居住的人”，则它们应该是一张关联表。但如果 `Address` 的
`owners` 表达的是“地址的主人(如房东)”，则二者就不应该共用一张关联表。

如何告诉 Hibernate 需要共用一张表呢？通过 `mappedBy`：

```java
@Entity
public static class Person {
    @ManyToMany
    private List<Address> addresses = new ArrayList<>();
    // ... omit all other methods
}

@Entity
public static class Address {
    @ManyToMany(mappedBy = "addresses")
    private List<Person> owners = new ArrayList<>();

    // ... omit all other methods
}
```

`(mappedBy = "addresses")` 的含义是这个字段与 `Person` 中的
`addresses` 字段共用表结构。

这里最后重点是双向关系一定是从属关系，有一方是 owner，另一方是 follower(标记了
`mappedBy` 的一方)。只有在 owner 这方添加关联并保存时，Hibernate 才会存入关联表，反之
不会。例如我们只能通过 `person.addAddress()` 并保存 `person` 的方式来完成添加关联而
不能用 `address.addPerson()` 后保存 `address` 的方式。

## 手工管理关联是什么意思

例如我们在实现 `Person.addAddress` 时，需要这样实现：


```java
@Entity
public static class Person {
    //...omit other fields

    @ManyToMany
    private List<Address> addresses = new ArrayList<>();

    public void addAddress(Address address) {
        addresses.add( address );
        address.getOwners().add( this );
    }

    public void removeAddress(Address address) {
        addresses.remove( address );
        address.getOwners().remove( this );
    }
    // ... omit all other methods
}
```

即在为 `person` 添加 `address` 时，我们需要将当前的 person 添加到 address的
`owners` 字段中；删除时相似。“管理关联”表示需要在代码级别来管理关联双方实体的
联系。

如果从数据库的角度思考，我们知道 `Person` 与 `Address` 的关系是存储在一张关联
表里的，一个关联存入这张表后，不论哪一方读取，都应该反映出新的关联关系，而在
Hibernate 这一层，却需要我们显式地(从另一方的 `set` )中添加/删除这个关联，显得
不可思议。

另外，注意我们往 `set` 中添加 `address` 或 `person` 时，需要我们正确的实现
`Person` 和 `Address` 的 `equals` 和 `hashCode` 方法，这是另一个坑，这里就不深
入了。

## 为什么需要手工管理

终于到了“为什么”部分了，首先是如果不手工管理会发生什么。考虑下面的测试：

```java
@Test
@Transactional
public void test() {
    Person person = repository.findPersonById(1);
    Address address = repository.findAddressById(20);
    person.getAddresses.add(address);
    repository.save(person);

    System.out.println(address.getOwners().size()) // what is the result?

    Address address = repository.findAddressById(20);
    System.out.println(address.getOwners().size()) // what is the result?
}
```

答案是两个 `size` 都为 `0`。

- 调用 `save` 方法时，Hibernate/JPA 并不会直接执行 SQL 来保存，这样性能差。
- 在 `find` 时，如果内存中已经有对应的对象，Hibernate/JPA 也不会执行 SQL 去
   查询。

注意上面说的是一般的情况，什么时候执行 SQL 取决于具体的配置，一般会在事务前的
`commit`。

因此，如果在 `save` 之后还需要使用到 `address`，就不要期待它会立即反映出数据库
中的修改；反之，如果 `save` 之后就不再使用到 `address`，那即使不手工管理(同步)
关联关系也不会有多大影响。
