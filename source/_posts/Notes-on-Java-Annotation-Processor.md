title: Java Annotation Processor 小记
date: 2017-12-31 20:33:19
tags: [java, annotation]
categories: [Notes]
toc: true
---

最近基于工作上的需求调研了下 Java Annotation Processor 的使用方式，开篇博客记
录下学习过程中遇到的坑。可以由于平时用到 Annotation 的场景特别少，因此能搜索到
的教程特别有限，也希望文章在某种程度上填补部分空白吧。

## 认识 Java Annotation

Java 里的 Annotation （注解）相信大家都不陌生，从内置的 `@Override` 到 junit
里的 `@Test` ，再到 lombok 里的 `@Getter`, `@Setter` 都是大家常用的注解。之所
以叫作“注解”，是因为它就像是我们对代码加上的一种“注解”一般。一般注解可以出现在
类、方法、变量、参数及包名上。在编译期或运行时，我们就能找到并使用这些“注解”，
并做一些操作。

这里我以实际的需求为例，代码可以在 Github 上找到：[transformer-playground](https://github.com/lotabout/transformer-playground)。

在开发中，我们会重复一些代码，例如写一份领域模型 BO (business object)，包括了
模型的属性及方法 (OOP)。由于这个模型的信息可能需要发送给其它的领域，而又希望领
域模型和具体的表示能隔离，因此常常会创建一份 POJO(Plain Old Java Object)，它的
字段和 BO 几乎一致。例如：

```java
public class ApplicantBo {
    private int id;
    private String name;
    private List<EducationVo> educationList;

    // don't want to go public
    private ZonedDateTime lastUpdate;

    // business logic here
}

public class ApplicantPojo {
    private int id;
    private String name;
    private List<EducationPojo> educationList;
}
```

因此经常需要写一些转换代码，把 BO 转成 Pojo 或者反过来。这时候想起 Java
的注解是能实现代码的自动生成的，于是希望能像下面这样的方式来写代码：

```java
@Transformer(to = ApplicantPojo.class)
public class ApplicantBo {
    //...
}
```

期待加了这个注解之后，能自动生成一些代码，而不用自己写转换类。这里要说明两个内
容：

1. 一般的 Annotation Processor 能生成新的类，但不能修改现有的类。像 lombok 这
   种能为类生成新方法的工具其实是直接修改 byte code 实现的。
2. Annotation Processor 的一大好处是如果原始的代码发生变化，可以防止自己忘记修
   改一些对应的类。如 lombok 的 `@Getter` 可以防止新加字段后忘记加相应的
   Getter，而上面说的 `@Transformer` 更可以防止忘记为新字段添加转换逻辑。

当然，Annotation 的好处还有很多，总的来说，Annotation 赋予了我们更强的表达能
力，使我们代码最更少，模块化更高，理解更容易（总得吹一波）。

## 项目搭建

关于 Annotation Processor ，网上已经有相当好的入门教程了，这里我推荐两个：

1. [@Eliminate("Boilerplate")](https://academy.realm.io/posts/360andev-ryan-harter-eliminate-boilerplate/)
2. [ANNOTATION PROCESSING 101](http://hannesdorfmann.com/annotation-processing/annotationprocessing101)

第一个是演讲，基本上能对 Annotation Processor 的基本工作原理能有大概的理解，第
二篇则是一个很详细的具体示例。这里我会为自己简要记录下要点。

### 目录结构
也不知道谁规定的，看到的目标一般都是分两个子模块，一个是 `annotation` 存放
annotation 的定义，另一个是 `processor`，存放具体生成代码的逻辑。如下：

```
.
├── pom.xml
├── transformer-annotations
│   ├── pom.xml
│   └── src/main/java
│               └── me.lotabout.annotation
│                   └── Transformer.java
└── transformer-processors
    ├── pom.xml
    └── src/main
            ├── java
            │   └── me.lotabout.processor
            │       └── TransformerProcessor.java
            └── resources
                └── META-INF
                    └── services
                        └── javax.annotation.processing.Processor
```

其中， `javax.annotation.processing.Processor` 这个文件的文件名是固定的，我们
需要把我们实现了的 Processor （本例中 `TransformerProcessor`）写到文件里，这样
则 javac 在编译过程中才能找到对应的 Processor。文件里每行写一个 Processor 的全
限定名。

```
$ cat javax.annotation.processing.Processor
me.lotabout.processor.TransformerProcessor
```


### pom 注意点

正常情况下，如果完成了项目的搭建，编译后会报错：
```
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.1:compile (default-compile) on project transformer-processors: Compilation failure
[ERROR] Bad service configuration file, or exception thrown while constructing Processor object: javax.annotation.processing.Processor: Provider me.lotabout.processor.TransformerProcessor not found
[ERROR] -> [Help 1]
```

这是因为 javac 在编译时，会用 `javax.annotation.processing.Processor` 里指定的
类去处理源代码，因此 javac 预期在 classpath 里能找到一个编译好的 processor，但
这显然是不可能的。要解决这个问题，我们需要显示告诉 javac 为当前项目忽略
annotation processing。如下：

```xml
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <configuration>
          <source>1.8</source>
          <target>1.8</target>
          <compilerArgument>-proc:none</compilerArgument>
        </configuration>
      </plugin>
    </plugins>
  </build>
```

注意 `-proc:none`。参考 [StackOverflow](https://stackoverflow.com/questions/36248959/bad-service-configuration-file-or-exception-thrown-while-constructing-processor)。

### 文件内容

定义新的注解：

```java
@Retention(RetentionPolicy.SOURCE)
@Target(ElementType.TYPE)
public @interface Transformer {
    Class<?>[] from() default {};
    Class<?>[] to() default {};
}
```

1. 用 `@interface` 定义注解
2. `@Target()` 来指定注解允许出现的位置，这里指定 `ElementType.TYPE` 限制能出
   现在类型定义上，如 interface, class 上。
3. `@Retention` 用于指定注解的保留情况，如 `RetentionPolicy.SOURCE` 代表这个注
   解是源代码级别的，编译之后生成 byte code 时注解就会被移除。有一些注解是可以
   保留到运行时的。

Annotation Processor 的定义：

```java
public class TransformerProcessor extends AbstractProcessor {
    @Override
    public SourceVersion getSupportedSourceVersion() {
        if (SourceVersion.latest().compareTo(SourceVersion.RELEASE_8) > 0) {
            return SourceVersion.latest();
        } else {
            return SourceVersion.RELEASE_8;
        }
    }

    @Override
    public Set<String> getSupportedAnnotationTypes() {
        return ImmutableSet.of(Transformer.class.getCanonicalName());
    }

    @Override public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
        //...
        return true;
    }
}
```

这三件套是必须的：
1. `getSupportedSourceVersion` 返回支持的版本
2. `getSupportedAnnotationTypes` 返回该 Processor 支持的所有注解。换句话说，这
   里返回的内容将作为 `process` 函数的第一个参数返回。
3. `process` 函数，在这里写代码生成的逻辑。

最后注意到 `extends AbstractProcessor`，嗯，这么做就对了。

## Model API

最头疼的莫过于 `java.lang.model` 的相关 API 了，完全找不到全面的文档。这里记录
几个用到的：

### 从 TypeElement 中获取所有字段或方法

```java
    public List<VariableElement> getAllFields(TypeElement type) {
        return ElementFilter.fieldsIn(type.getEnclosedElements())
                .stream()
                .collect(Collectors.toList());
    }

    public List<MethodEntry> getAllMethods(TypeElement type) {
        return ElementFilter.methodsIn(type.getEnclosedElements())
                .stream()
                .collect(Collectors.toList());
    }
```

### 获取字段的类型

`VariableElement` 用来表示一个字段，那么如何获取字段的类型呢？

一个字段的类型可能是基本类型如 `int`, `boolean` 之类的，也可能是类如
`String`，还可能包括一 些泛型的类如 `List<String>`。而 `TypeElement` 保存的是
类型本身的信息，例如，如是一个 `TypeElement` 表示 `List<String>`，它其实保存的
是 `List<T>` 的信息，没有办法获取 `String` 这个具体类型的。

其实 Java 是用 `TypeMirror` 来代表一个具体类型的：

1. `variable.asType()` 可以获得 `variable` 的具体类型。
2. `typeMirror.getKind()` 可以获知类型的信息，如 `int` 则是 `TypeKind.INT`，而
   所有的类者属于 `TypeKind.DECLARED`。
3. `(TypeElement)((DeclaredType)typeMirror).asElement()` 可以将 TypeMirror 转
   换为 `TypeElement`。但如果不是 `DECLARED` 类型则会出异常。
4. 如果是泛型，可以通过 `((DeclaredType)typeMirror).getTypeArguments()` 来得到
   具体的类型信息。如 `List<String>` 可以得到 `String`。
5. 如果是数组类型，想得到具体的类型信息，如 `String[]` 想得到 `String`，则需要
   通过 `((ArrayType)typeMirror).getComponentType()` 来获取。

### 获取注解中的类

例如我们定义的 Transformer 类，它的参数都是 `Class[]` 类型的。但在编译期间，我
们是得不到 `Class` 信息的，因为这个时候还只有关于源代码的信息。

```java
@Retention(RetentionPolicy.SOURCE)
@Target(ElementType.TYPE)
public @interface Transformer {
    Class<?>[] from() default {};
    Class<?>[] to() default {};
}
```

所以，正常情况下我们可能想通过下面的操作来得到 `from` 的类：

```java
    @Override public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
        for (Element e : roundEnv.getElementsAnnotatedWith(Transformer.class)) {
            Transformer transformer = e.getAnnotation(Transformer.class);
            Class[] from = transformer.from();
        }
    }
```

但会有如下错误：

```
javax.lang.model.type.MirroredTypeException: Attempt to access Class object for TypeMirror java.lang.Runnable
```

所以我们只能曲线救国：

```java
    public Optional<AnnotationMirror> getAnnotationMirror(TypeElement element, Class<?> clazz) {
        String clazzName = clazz.getName();
        for(AnnotationMirror m : element.getAnnotationMirrors()) {
            if(m.getAnnotationType().toString().equals(clazzName)) {
                return Optional.ofNullable(m);
            }
        }
        return Optional.empty();
    }

    public Optional<AnnotationValue> getAnnotationValue(AnnotationMirror annotationMirror, String key) {
        for(Map.Entry<? extends ExecutableElement, ? extends AnnotationValue> entry : annotationMirror.getElementValues().entrySet() ) {
            if(entry.getKey().getSimpleName().toString().equals(key)) {
                return Optional.ofNullable(entry.getValue());
            }
        }
        return Optional.empty();
    }

    static List<TypeMirror> getTransformerClasses(TypeElement clazz, String key) {
        return getAnnotationMirror(clazz, Transformer.class)
                .flatMap(annotation -> TypeEntry.getAnnotationValue(annotation, key))
                // ^ note that annotation value here corresponds to Class[],
                .map(annotation -> (List<AnnotationValue>)annotation.getValue())
                .map(fromClasses -> fromClasses.stream()
                        .map(fromClass -> (TypeMirror)fromClass.getValue())
                        .collect(Collectors.toList()))
                .orElse(ImmutableList.of());
    }
```

这个问题在 [这篇文章](https://area-51.blog/2009/02/13/getting-class-values-from-annotations-in-an-annotationprocessor/) 中有很详细的描述。

## 代码生成

最后一个内容是代码生成，其实 Annotation Processor 最后是生成 Java 代码，这意味
着不论采用任何形式，最终只要把一些字符（Java 源码）写入到一个文件就可以了。实
际中有两种方式，各有优缺点。

### 模板引擎

如 [velocity](http://velocity.apache.org/) 或
[Mustache](https://mustache.github.io/)。其中 velocity 也是 Intellij 的代码生
成功能使用的模板引擎。

使用模板引擎的好处是代码的结构比较可控，看模板就能大概看出生成的代码长什么样。
但一个重要缺点是需要自己导入代码中用到的包，而在 Java 文件中，导入包和实际的代
码是在两个区域，这对于生成代码来说很不方面（要是用到了就会有同感了）。另一个小
总是是空格处理麻烦，为了保证输出的源代码格式好看，通常需要小心处理模板中的空格
（velocity），导致模板很乱。

### JavaPoet

[JavaPoet](https://github.com/square/javapoet) 是各大教程中都提到的 Java 代码
生成库，它对常用的 Java 概念（如类，方法，变量等）做了建模，因此我们就能像写代
码一样一部分一部分生成 Java 代码。如：

```java
MethodSpec main = MethodSpec.methodBuilder("main")
    .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
    .returns(void.class)
    .addParameter(String[].class, "args")
    .addStatement("$T.out.println($S)", System.class, "Hello, JavaPoet!")
    .build();

TypeSpec helloWorld = TypeSpec.classBuilder("HelloWorld")
    .addModifiers(Modifier.PUBLIC, Modifier.FINAL)
    .addMethod(main)
    .build();

JavaFile javaFile = JavaFile.builder("com.example.helloworld", helloWorld)
    .build();

javaFile.writeTo(System.out);
```

会生成下面的代码：

```
package com.example.helloworld;

public final class HelloWorld {
  public static void main(String[] args) {
    System.out.println("Hello, JavaPoet!");
  }
}
```

我认为它的主要好处就是自动 import，其它我真不觉得有什么超过模板引擎的地方。但
自动 import 这个功能就足以让我在写 `@Transformer` 的时候使用它而不是 velocity。

另外注意要使用它的自动 import 功能，需要我们在生成代码时使用 `addStatement` 并
使用 `$T` 语法来提供类型信息，否则是它是没办法识别文本中的包的。

## 写在最后

我个人的背景是 C + Lisp 开始的，所以对于元编程(meta-programming) 是有一定执着
的，想比于 Lisp，Java 的 Annotation Processor 实在是太蹩脚了。但与此同时，不得
不说 Java 的源码结构比 Lisp 的无限括号还是更方便阅读的，并且我自己也很喜欢
Annotation 这样的“无入侵”的编程风格的。

另外元编程也许有点“屠龙之术”吧，不过如果现实中真的有“龙”出现的时候，不要犹豫，
祭出“屠龙宝刀”吧！
