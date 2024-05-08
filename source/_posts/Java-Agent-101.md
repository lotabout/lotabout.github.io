title: Java Agent 入门教程
toc: true
date: 2024-05-05 14:22:39
tags: [Java, Agent]
categories: Notes
---

Java 提供了动态修改字节码的能力，而 Java Agent 提供了外挂修改的能力，能不动已
有的 jar 包，在运行时动态修改 jar 内的字节码。

本文会从零构建一个 Java Agent，让Jar 包在运行时打印每一个调用的方法名，其中涉
及到 Java Agent 的整体结构，ASM 库的基础操作，文章较长，建议跟着走一遍。

## Java Agent 项目结构

先创建如下目录结构：

```text
.
├── pom.xml
└── src
    └── main
        ├── java
        │   └── me
        │       └── lotabout
        │           └── Launcher.java
        └── resources
            └── META-INF
                └── MANIFEST.MF
```

### premain 与 agentmain

我们知道常规 Java 程序的入口是 `main` 函数，而 Java Agent 在不同的架构模式下有
不同的入口[^ref-instrument-package-summary]：

[^ref-instrument-package-summary]: 这里的机制在 [java.lang.instrument 文档](https://docs.oracle.com/en/java/javase/21/docs/api/java.instrument/java/lang/instrument/package-summary.html) 中有详细说明

- 静态加载入口为 `premain`：如 `java -javaagent:my-agent.jar -jar app.jar`，在
  启动 Jar 包时指定要加载的 agent，权限较高。
- 动态加载入口为 `agentmain`：已经通过 `java -jar app.jar` 等方式运行的 JVM，
  可以动态 Attach 后加载 Agent，权限较低，如无法新增属性、方法等。

两个方法定义如下（定义放在哪个类中都可以，下面会在 `MANIFEST.MF` 文件中声明）：

```java Launcher.java
package me.lotabout;
public class Launcher {
    public static void premain(String agentArgs, Instrumentation inst) {}
    public static void agentmain(String agentArgs, Instrumentation inst) {}
}
```

- 参数中的 `agentArgs` 是传递给 Agent 的参数。例如这样调用 `java
    -javaagent:my-agent.jar=my-agent-args app.jar`，则 `my-agent.jar` 中的
    `premain` 函数中的 `agentArgs` 参数的值，就是字符串 `"my-agent-args"`。
- 参数中的 `Instrumentation` 是 Java 提供的修改字节码的 API. 通常 Java Agent
    作者的任务，就是利用 `Instrumentation` 定位到希望修改的类并做出修改。

另外容易踩坑的一点是，调用 `Instrumentation.addTransformer` 添加的 transformer
默认只对“ **未来加载的类** ”才会生效。而动态加载(`agentmain`)通常是在应用程序
启动后才加载，就会出现添加的 transformer 不生效的情况。对静态加载(`premain`)则
一般不会有这个问题，因为它是在 `main` 函数之前加载的，

动态加载(`agentmain`) 如果想修改 `main` 中就已经加载的类，则需要在添加
transformer 再调用`Instrumentation#retransformClasses` 对已加载的类执行转换才
能生效。

### MANIFEST

上面提到 `premain` 和 `agentmain` 可以定义在任何类中，那 JVM 怎么知道去哪找呢？我们需要在 jar
包的 `MANIFEST.MF` 文件[^ref-manifest] 中指定 agent 的入口类是什么，以及 agent
会有哪些能力：

[^ref-manifest]: manifest 的属性参考 [java.lang.instrument 文档](https://docs.oracle.com/en/java/javase/21/docs/api/java.instrument/java/lang/instrument/package-summary.html)

```text  MANIFEST.MF
Premain-Class: me.lotabout.Launcher # 静态加载(premain) Agent 时的入口类
Agent-Class: me.lotabout.Launcher   # 动态加载(agentmain) Agent 时的入口类
Can-Redefine-Classes: true          # 该 Agent 能否重新定义类
Can-Retransform-Classes: true       # 该 Agent 能否修改已有类
Can-Set-Native-Method-Prefix: true  # 是否允许修改 Native 方法的前缀
```

- Premain-Class: 静态加载(premain) Agent 时的入口类
- Agent-Class: 动态加载(agentmain) Agent 时的入口类
- Can-Redefine-Classes: 该 Agent 能否重新定义类
- Can-Retransform-Classes: 该 Agent 能否修改已有类
- Can-Set-Native-Method-Prefix: 是否允许修改 Native 方法的前缀。Native 方法不
  是字节码实现的，Agent 修改不了它的逻辑。通常修改 Native 是Proxy 的做法，把原
  有的 Native 方法重命名，新建同名的 Java 方法来调用老方法。此时需要修改
  Native 方法前缀的能力。

### pom.xml

打包本身也比较烦，比如 maven 打包时需要指定 `MANIFEST.MF` 路径，示例如下：

```xml pom.xml fold:true mark:41,20,25
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>me.lotabout</groupId>
  <artifactId>my-agent</artifactId>
  <version>1.0-SNAPSHOT</version>

  <properties>
    <maven.compiler.source>11</maven.compiler.source>
    <maven.compiler.target>11</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.ow2.asm</groupId>
      <artifactId>asm</artifactId>
      <version>9.4</version>
    </dependency>
    <dependency>
      <groupId>org.ow2.asm</groupId>
      <artifactId>asm-tree</artifactId>
      <version>9.4</version>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-assembly-plugin</artifactId>
        <version>3.6.0</version>
        <configuration>
          <descriptorRefs>
            <descriptorRef>jar-with-dependencies</descriptorRef>
          </descriptorRefs>
          <archive>
            <manifestFile>src/main/resources/META-INF/MANIFEST.MF</manifestFile>
          </archive>
        </configuration>
        <executions>
          <execution>
            <phase>package</phase>
            <goals>
              <goal>single</goal>
            </goals>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
</project>
```

我们额外引入了 `asm` 与 `asm-tree` 库，我们后面要用它们来操作字节码。

`mvn clean package` 后得到 `target/my-agent-1.0-SNAPSHOT-jar-with-dependencies.jar`，之后就可以用
`java -javaagent:target/my-agent-1.0-SNAPSHOT-jar-with-dependencies.jar -jar
app.jar` 来调用了。这个名字太长了，后面我们写命令时会简写成 `my-agent.jar`。

### 动态加载 Attach

假设我们已经执行了 `java -jar app.jar`，希望加载 `my-agent.jar`，要怎么做？需要利用 [Attach API](https://docs.oracle.com/en/java/javase/21/docs/api/jdk.attach/module-summary.html)。

1. 先得到 `app.jar` 进程的 PID，并 attach 得到 `app.jar` 的 `VirtualMachine` 实例：`
   VirtualMachine vm = VirtualMachine.attach(PID);`
2. 调用 `VirtualMachine#loadAgent("my-agent.jar")` 让 `app.jar` 进程加载 agent

为了方便上述操作，我们可以把这段逻辑写到 `Launcher` 的 `main` 函数中：

```java
public static void main(String[] args)
    throws IOException, AttachNotSupportedException, AgentLoadException, AgentInitializationException {
    String pid = args[0];
    String path = Launcher.class.getProtectionDomain().getCodeSource().getLocation().getPath();
    VirtualMachine vm = VirtualMachine.attach(pid);
    try {
        vm.loadAgent(path);
    } finally {
        vm.detach();
    }
}
```

再在 `MANIFEST.MF` 中增加一行：

```
Main-Class: me.lotabout.Launcher
```

现在就可以使用 `java -jar my-agent.jar <目标 PID>` 来动态加载 agent 了。注意此
时调用的是 agent 的 `agentmain` 方法。


## Instrumentation

上节中的内容是建立 java agent 项目结构，目标是产出一个能被 JVM 识别的Agent。接
下来的任务是找到 `app.jar` 中感兴趣的类并修改这些类的字节码。这些工作都要基于
JDK 提供的 Instrumentation API。

### Instrumentation API

[Instrumentation](https://docs.oracle.com/en/java/javase/21/docs/api/java.instrument/java/lang/instrument/Instrumentation.html)
的核心抽象是 [ClassFileTransformer](https://docs.oracle.com/en/java/javase/21/docs/api/java.instrument/java/lang/instrument/ClassFileTransformer.html)
，对字节码的修改逻辑都在这个接口中实现，而 Instrumentation 接口则是用来添加、
删除 transformer 的。Instrumentation 常见的使用流程（伪代码）为:

```java
// 对于未加载的类，addTransformer 后就能生效
instrument.addTransformer(myTransformer, true);
// 对于已经加载的类，需要调用 retransformClasses 来触发修改
for (Class clazz: instrument.getAllLoadedClasses()) {
    if (needToTransform(clazz)) {
        instrument.retransformClasses(clazz);
    }
}
```

`Instrumentation` 的一些常用接口定义如下：

- `getAllLoadedClasses()` 获取所有加载的类，得到数组后我们可以自己筛选出关心的类
- `redefineClasses(ClassDefinition... definitions)` 使用参数中的类定义重新定义类
- `retransformClasses(Class<?>... classes)` 使用添加的 transformers 修改指定的类
- `addTransformer(ClassFileTransformer transformer)` 注册 `transformer`
- `removeTransformer(ClassFileTransformer transformer)` 注销 `transformer`


### ClassFileTransformer

对字节码的修改逻辑需要定义在
[ClassFileTransformer](https://docs.oracle.com/en/java/javase/21/docs/api/java.instrument/java/lang/instrument/ClassFileTransformer.html)
的 `transform` 方法中，方法的签名如下：

```java
byte[] transform(ClassLoader loader,
                 String className,
                 Class<?> classBeingRedefined,
                 ProtectionDomain protectionDomain,
                 byte[] classfileBuffer)
    throws IllegalClassFormatException {
}
```

- 通常我们会使用各种信息来过滤掉不感兴趣的类（不想修改就直接直接返回原字节码）。
- 核心输入输出是 `class` 二进制流(`byte[]`)，即 transformer 假定字节码的修改是在二进制层面进行的。

直接修改类的二进制不是人能干的事，于是通常会使用一些库把 `byte[]` 转成一些库定
义的结构，操作后再转回 `byte[]` 返回。下面是常用的一些库：

- [asm](https://asm.ow2.io/) JDK 内部也用了它，性能好，但 API 的抽象层度很低
- [javaassist](https://www.javassist.org) API 的抽象比 ASM 更高，更适合普通用户，支持直接写 Java 源码
- [bytebuddy](https://bytebuddy.net) API 抽象度更高，例如有专门的 builder 来创建 Agent

## ASM API 简介

### ASM 核心 API 

ASM[^ref-asm-guide] 有两套 API： Event-Based 和 Tree-Based。简单来说 Event-Based 就是 visitor
模式，用户需要定义各种元素的 visitor，扫描字节码中过程中遇到什么元素就调用对应
元素的 visitor；Tree-Based 可以理解成先扫一遍字节码组装成一棵树，再对这棵树做
后续编辑、修改等操作。Event-Based API 性能更好但 Tree-Based API 更容易理解和使
用。

[^ref-asm-guide]: [ASM 官方教程](https://asm.ow2.io/asm4-guide.pdf)

ASM 的整体流程是 `byte[] -> ClassNode -> (修改) -> byte[]`，其中`ClassNode` 是
Tree-Based API 对“类”的抽象。基于 Tree-Based API 来修改字节码的 pattern 如下：

```java
ClassNode cn = new ClassNode(ASM4);                       // 定义解析后的类
ClassReader cr = new ClassReader(origin_classfile_bytes); // 创建 reader 读取原始字节码
cr.accept(cn, 0);                                         // 解析原始字节码，填充到 cn 中
...                                                       // 这里可对 cn 做修改
ClassWriter cw = new ClassWriter(0);                      // 创建 writer
cn.accept(cw);                                            // 把修改后的 cn 写回到 writer
byte[] b = cw.toByteArray();                              // 把 writer 中的字节码转成 byte[]
```

对 `ClassNode` 的操作，最常见的是遍历其中的 `cn.methods` 属性来遍历该类的所有
方法，之后通过修改 `method.instructions` 来修改字节码。

### 类型描述符(Type Descriptor)

ASM 中对于类型的描述有自己的一套规则，严格来说也不是 ASM 自创的，而是 JVM Spec
中定义的[^ref-jvm-spec-type-descriptor]，定义如下：

[^ref-jvm-spec-type-descriptor]: [JVM Spec: Field Descriptors](https://docs.oracle.com/javase/specs/jvms/se7/html/jvms-4.html#jvms-4.3.4)

| Java Type    | Type Descriptor        |
| -----------  | -----------------      |
| `boolean`    | `Z`                    |
| `byte`       | `B`                    |
| `char`       | `C`                    |
| `double`     | `D`                    |
| `float`      | `F`                    |
| `int`        | `I`                    |
| `long`       | `J`                    |
| `short`      | `S`                    |
| `Object`     | `Ljava/lang/Object;`   |
| `int[]`      | `[I`                   |
| `Object[][]` | `[[Ljava/lang/Object;` |

基本类型的描述符就是对应的大写字母（除了 `boolean` 用 `Z` 代替，因为字母冲突）；
其中类的描述符是 `L<classname>;` 的格式，数组的描述符是 `[<array_type>`，如果
多维就以此类推。

### 方法描述符(Method Descriptor)

方法描述符是一个字符串，格式为 `(<参数类型1><参数类型2>...)<返回类型>`，其中参
数类型就是上节的类型描述符，如果返回 `void` 则写 `V`，例如：

| 源文件中类的定义           | 类型描述符                |
| ----------------           | ----------                |
| `void m(int i, float f)`   | `(IF)V`                   |
| `int m(Object o)`          | `(Ljava/lang/Object;)I`   |
| `int[] m(int i, String s)` | `(ILjava/lang/String;)[I` |
| `Object m(int[] i)`        | `([I)Ljava/lang/Object;`  |

## 示例-打印每个调用的方法

由于 ASM 的 API 基本是直接添加字节码，但如果对字节码不熟悉其实很难直接写出，于
是一种方法是先用 javap 等工具把一个类的字节码反编译出来，再根据反编译的结果来写。


### println 字节码

例如我们想在方法被调用时执行如下代码：

```java
System.out.println(">> calling Method: <my_method>");
```

于是我们先写一个类，然后用 `javap -c` 来反编译：

```java
class Hello {
    public static void main(String[] args) {
        System.out.println(">> calling Method: <my_method>");
    }
}
```

执行如下命令：

```sh
$ javac Hello.java
$ javap -c Hello
Compiled from "Hello.java"
class Hello {
  Hello();
    Code:
       0: aload_0
       1: invokespecial #1                  // Method java/lang/Object."<init>":()V
       4: return

  public static void main(java.lang.String[]);
    Code:
       0: getstatic     #2                  // Field java/lang/System.out:Ljava/io/PrintStream;
       3: ldc           #3                  // String >> calling Method: <my_method>
       5: invokevirtual #4                  // Method java/io/PrintStream.println:(Ljava/lang/String;)V
       8: return
}
```

比较关键的是 `getstatic`, `ldc`, `invokevirtual` 这三个指令，分别代表先获取
`System.out`，再加载常量 `">> calling Method: <my_method>"`，最后调用
`println` 三个操作。

### 自定义 Transformer

接下来我们定义一个 `ClassFileTransformer` 来实现上述逻辑：

```java MyTransformer.java line_number:true
public class MyTransformer implements ClassFileTransformer {

  private String prefixOfclassToPrint = "";

  public MyTransformer(String prefixOfclassToPrint) {
      this.prefixOfclassToPrint = prefixOfclassToPrint.replace(".", "/");
  }

  @Override
  public byte[] transform(ClassLoader loader, String className, Class<?> classBeingRedefined,
      ProtectionDomain protectionDomain, byte[] classfileBuffer) {
    if (!className.startsWith(this.prefixOfclassToPrint)) {
      return classfileBuffer;
    }

    System.out.println("transforming class: " + className);
    ClassNode cn = new ClassNode(Opcodes.ASM4);
    ClassReader cr = new ClassReader(classfileBuffer);
    cr.accept(cn, 0);

    for (var method : cn.methods) {
      System.out.println("patching Method: " + method.name);
      var list = new InsnList();
      list.add(new FieldInsnNode(Opcodes.GETSTATIC, "java/lang/System", "out",
          "Ljava/io/PrintStream;"));
      list.add(new LdcInsnNode(">> calling Method: " + method.name));
      list.add(new MethodInsnNode(Opcodes.INVOKEVIRTUAL, "java/io/PrintStream", "println",
          "(Ljava/lang/String;)V", false));
      method.instructions.insert(list);
    }

    ClassWriter cw = new ClassWriter(ClassWriter.COMPUTE_MAXS);
    cn.accept(cw);
    return cw.toByteArray();
  }
}
```

- 第 6 行要注意在 transformer 中拿到的类，包名是以 `/` 分隔的，而
    `Instrument.getAllLoadedClasses()` 中拿到的类名是以 `.` 分隔的
    我们允许传入的参数是以 `.` 分隔的，所以需要转换一下。
- 第 12~14 行是过滤掉不感兴趣的类，不感兴趣的类直接返回原字节码。
- 第 16~19, 32~34 行是上文所说的 ASM 框架代码，反序列化二进制和序列化二进制的过程。
- 第 21 行开始遍历该类的所有方法，每个方法都插入我们的逻辑
- 第 24~28 行是插入字节码的逻辑，对应上小节说的 `getstatic`, `ldc`,
  `invokevirtual` 三个指令。其中也看到了类型描述符、方法描述符的使用。
- 第 29 行是把生成的字节码 "insert" 到方法的字节码中，"insert" 是在最前面插入


### 组装与测试

最后，我们在 `premain` 和 `agentmain` 中注册我们的 `MyTransformer`，最终 `Launcher` 类如下：

```java Launcher.java fold:true line_number:true
public class Launcher {

  public static void main(String[] args)
      throws IOException, AttachNotSupportedException,
             AgentLoadException, AgentInitializationException {
    String pid = args[0];
    String prefix = args[1];
    String path = Launcher.class.getProtectionDomain().getCodeSource().getLocation().getPath();
    VirtualMachine vm = VirtualMachine.attach(pid);
    try {
      vm.loadAgent(path, prefix);
    } finally {
      vm.detach();
    }
  }

  public static void premain(String agentArgs, Instrumentation inst)
      throws UnmodifiableClassException {
    inst.addTransformer(new MyTransformer(agentArgs), true);
    for (var clazz : inst.getAllLoadedClasses()) {
      if (inst.isModifiableClass(clazz) && clazz.getName().startsWith(agentArgs)) {
        inst.retransformClasses(clazz);
      }
    }
  }

  public static void agentmain(String agentArgs, Instrumentation inst)
      throws UnmodifiableClassException {
    premain(agentArgs, inst);
  }

  private static class MyTransformer implements ClassFileTransformer {

    private String prefixOfclassToPrint = "";

    public MyTransformer(String prefixOfclassToPrint) {
        this.prefixOfclassToPrint = prefixOfclassToPrint.replace(".", "/");
    }

    @Override
    public byte[] transform(ClassLoader loader, String className, Class<?> classBeingRedefined,
        ProtectionDomain protectionDomain, byte[] classfileBuffer) {
      if (!className.startsWith(this.prefixOfclassToPrint)) {
        return classfileBuffer;
      }

      System.out.println("transforming class: " + className);
      ClassNode cn = new ClassNode(Opcodes.ASM4);
      ClassReader cr = new ClassReader(classfileBuffer);
      cr.accept(cn, 0);

      for (var method : cn.methods) {
        System.out.println("patching Method: " + method.name);
        var list = new InsnList();
        list.add(new FieldInsnNode(Opcodes.GETSTATIC, "java/lang/System", "out",
            "Ljava/io/PrintStream;"));
        list.add(new LdcInsnNode(">> calling Method: " + method.name));
        list.add(new MethodInsnNode(Opcodes.INVOKEVIRTUAL, "java/io/PrintStream", "println",
            "(Ljava/lang/String;)V", false));
        method.instructions.insert(list);
      }

      ClassWriter cw = new ClassWriter(ClassWriter.COMPUTE_MAXS);
      cn.accept(cw);
      return cw.toByteArray();
    }
  }
}
```

之后有两种调用方式（类名前缀的包名以 `.` 分隔）：

```sh
$ java -javaagent:my-agent-1.0-SNAPSHOT-jar-with-dependencies.jar=<类名前缀> -jar app.jar
$ java -jar my-agent-1.0-SNAPSHOT-jar-with-dependencies.jar <PID> <类名前缀>
```

对于如下的示例 `Hello` 类：

```java
public class Hello {

  public static void main(String[] args) throws Exception {
    for (int i = 0; i < 2; i++) {
      outer();
    }
  }

  public static void outer() {
    test();
  }

  public static void test() {
    System.out.println("Hello world!");
  }
}
```

可以在运行时挂上 agent 来看到输出:

```text
$ javac Hello.java
$ java -javaagent:my-agent-1.0-SNAPSHOT-jar-with-dependencies.jar=Hello Hello
transforming class: Hello
patching Method: <init>
patching Method: main
patching Method: outer
patching Method: test
>> calling Method: main
>> calling Method: outer
>> calling Method: test
Hello world!
>> calling Method: outer
>> calling Method: test
Hello world!
```

可以看到我们成功的在每个方法调用时打印了一行信息。

## 小结

本文介绍了 Java Agent 的基本代码结构，简单介绍了 ASM 库来修改字节码的方法，最
后给出了示例，让 Agent 能动态修改类的方法，在方法开始处打印一行信息。

另外一些常见的字节码修改场景可以参考 ASM 的文档或使用其它字节码修改库。例如希
望打印每个方法的返回值，理论上需要遍历每个方法的字节码，找到 `return` 指令，然
后在该指令前插入打印指令，这种常见 pattern 通常都有库封装好，可以直接使用。
