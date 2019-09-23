title: 'QQA: /tmp 目录下的 spring-boot-libs 是什么'
toc: true
date: 2019-09-23 20:15:38
tags: [QQA, Spring]
categories: [QQA]
---

最近遇到磁盘占用 100% 的问题，发现 `/tmp` 目录下多出许多类似
`my-app.jar-spring-boo-libs-xxx` 的目录。这些目录是什么，如何避免磁盘爆了？

## 这些目录是什么？

Spring boot 会将依赖的 jar 包最终打成一个大的 jar 包（称为 fat jar），同时使用
spring boot 自己的 class loader 来加载这些 jar 包。对于使用者来说是相当便利的
。

然而有些 jar 包不能用这种方式加载，jruby-complete.jar 是其中一个例子。而这次我
遇到的则是 jython-standalone.jar。于是 Spring Boot 提供了一种方式，让用户指定
在运行时，将一些 jar 包解压，用常规的加载方式加载。在 pom 中通过
[requiresUnpack](https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#howto-extract-specific-libraries-when-an-executable-jar-runs)
指定：

```xml
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
        <configuration>
          <requiresUnpack>
            <dependency>
              <groupId>org.python</groupId>
              <artifactId>jython-standalone</artifactId>
            </dependency>
          </requiresUnpack>
        </configuration>
      </plugin>
    </plugins>
  </build>
```

在运行时，Spring boot 会将指定的 jar 包解压到 `java.io.tmpdir` 指定的目录中，
默认为 `/tmp`。也就是我们在引言中提到的问题。

## 磁盘会爆吗？

其实问题是 `/tmp` 目录会被操作系统自动清理吗？不同操作系统的行为不同。这里以
CentOS 7 为例。

* CentOS 7 会将 `/tmp` 挂载为 `tmpfs`，这样在系统重启时整个 `/tmp` 都将被清理。
* CentOS 7 使用 `systemd-tmpfiles` 来清理临时文件，默认清理 `/tmp` 超过 10 天
    未被访问的文件。

所以正常情况下其实不用担心磁盘爆了。博主遇到的情况，是程序由于数据库的问题启动
失败，同时又有一个守护进程，检测到进程退出后不断重启，导致在短时间内创建了极大
量的目录，从而硬盘占用达到 100%。

## 如何避免磁盘爆了？

最好的方式是在启动程序时使用一个本地目录，在每次重启时清理该目录。

* 判断如果存在临时目录则删除
* 程序启动时通过 `-Djava.io.tmpdir` 来指定具体的临时目录

```bash
#!/bin/bash

DIR=$(cd `dirname $0`; pwd)
TMP_DIR=$DIR/tmp

if [ -d $TMP_DIR ]; then
    echo "cleaning temporary folder"
    rm -rf $TMP_DIR
fi

nohup java -Djava.io.tmpdir=$TMP_DIR -jar my-app.jar >/dev/null 2>&1 &
```

顺带一提，事实上目前无法单独设置 unpack 的目录，`java.io.tmpdir` 其实会影响所
有临时文件。例如 tomcat 会在其中创建 `tomcat.xxxx` 目录，用来存放上传的临时文
件。

## 参考

- [Spring Boot Reference Guide](https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#howto-extract-specific-libraries-when-an-executable-jar-runs) Spring Boot 官方文档对 requiresUnpack 功能的说明
- [Spring Boot Maven Plugin and requiresUnpack target
    directory](https://stackoverflow.com/a/53323151) 如何修改 requiresUnpack
    目录
- [Spring Boot requiresUnpack is not upacking at runtime](https://stackoverflow.com/questions/38900375/spring-boot-requiresunpack-is-not-upacking-at-runtime) requiresUnpack 解压目录实例
- [CentOS 7 Tmpwatch](https://centosfaq.org/centos/centos-7-tmpwatch/) 解释
    CentOS 7 为什么不包含 tmpwatch
- [How systemd-tmpfiles cleans up /tmp/ or /var/tmp (replacement of tmpwatch) in CentOS / RHEL 7](https://www.thegeekdiary.com/centos-rhel-7-how-tmpfiles-clean-up-tmp-or-var-tmp-replacement-of-tmpwatch/)
- [CentOS7的/tmp目录自动清理规则](https://blog.51cto.com/kusorz/2051877)
