title: 手把手教你构建 C 语言编译器（3）- 虚拟机
date: 2015-12-22 12:03:14
tags: [C, compiler]
categories: Project
toc:
---

本章是“手把手教你构建 C 语言编译器”系列的第三篇，本章我们要构建一台虚拟的电
脑，设计我们自己的指令集，运行我们的指令集，说得通俗一点就是自己实现一套汇编
语言。它们将作为我们的编译器最终输出的目标代码。

# 计算机的内部工作原理

我们关心计算机的三个基本部件：CPU、寄存器及内存。代码（汇编指令）以二进制的形
式保存在内存中，CPU 从中一条条地加载指令执行。程序运行的状态保存在寄存器中。

## 内存

我们从内存开始说起。现代的操作系统都不直接使用内存，而是使用虚拟内存。虚拟内存
可以理解为一种映射，在我们的程序眼中，我们可以使用全部的内存地址，而操作系统
需要将它映射到实际的内存上。当然，这些并不重要，重要的是一般而言，进程的内存会
被分成几个段：

1. 代码段（text）用于存放代码（指令）。
2. 数据段（data）用于存放初始化了的数据，如`int i = 10;`，就需要存放到数据段
   中。
3. 未初始化数据段（bss）用于存放未初始化的数据，如 `int i[1000];`，因为不关心
   其中的真正数值，所以单独存放可以节省空间，减少程序的体积。
4. 栈（stack）用于处理函数调用相关的数据，如调用帧（calling frame）或是函数的
   局部变量等。
5. 堆（heap）用于为程序动态分配内存。

它们在内存中的位置类似于下图：

```
+------------------+
|    stack   |     |      high address
|    ...     v     |
|                  |
|                  |
|                  |
|                  |
|    ...     ^     |
|    heap    |     |
+------------------+
| bss  segment     |
+------------------+
| data segment     |
+------------------+
| text segment     |      low address
+------------------+
```

但我们的虚拟机并不模拟完整的计算机，我们只关心三个内容：代码段、数据段以及栈。
其中的数据段我们只存放字符串，因为我们的编译器并不支持初始化变量，因此我们也不
需要未初始化数据段。理论上我们的虚拟器需要维护自己的堆用于内存分配，但实际实现
上较为复杂且与编译无关，故我们引入一个指令`MSET`，使我们能直接使用编译器（解释
器）中的内存。

综上，我们需要首先在全局添加如下代码：

```c
int *text,            // text segment
    *old_text,        // for dump text segment
    *stack;           // stack
char *data;           // data segment
```

注意这里的类型，虽然是`int`型，但理解起来应该作为无符号的整型，因为我们会在代
码段（text）中存放如指针/内存地址的数据，它们就是无符号的。其中数据段（data）
由于只存放字符串，所以是 `char *` 型的

接着，在`main`函数中加入初始化代码，真正为其分配内存：

```c
int main() {
    close(fd);
    ...

    // allocate memory for virtual machine
    if (!(text = old_text = malloc(poolsize))) {
        printf("could not malloc(%d) for text area\n", poolsize);
        return -1;
    }
    if (!(data = malloc(poolsize))) {
        printf("could not malloc(%d) for data area\n", poolsize);
        return -1;
    }
    if (!(stack = malloc(poolsize))) {
        printf("could not malloc(%d) for stack area\n", poolsize);
        return -1;
    }

    memset(text, 0, poolsize);
    memset(data, 0, poolsize);
    memset(stack, 0, poolsize);

    ...
    program();
}
```

## 寄存器

计算机中的寄存器用于存放计算机的运行状态，真正的计算机中有许多不同种类的寄存
器，但我们的虚拟机中只使用 4 个寄存器，分别如下：

1. `PC` 程序计数器，它存放的是一个内存地址，该地址中存放着 **下一条** 要执行的
   计算机指令。
2. `SP` 指针寄存器，永远指向当前的栈顶。注意的是由于栈是位于高地址并向低地址
   增长的，所以入栈时 `SP` 的值减小。
3. `BP` 基址指针。也是用于指向栈的某些位置，在调用函数时会使用到它。
4. `AX` 通用寄存器，我们的虚拟机中，它用于存放一条指令执行后的结果。

要理解这些寄存器的作用，需要去理解程序运行中会有哪些状态。而这些寄存器只是用于
保存这些状态的。

在全局中加入如下定义：

```c
int *pc, *bp, *sp, ax, cycle; // virtual machine registers
```

在 `main` 函数中加入初始化代码，注意的是`PC`在初始应指向目标代码中的`main`函
数，但我们还没有写任何编译相关的代码，因此先不处理。代码如下：

```c
    memset(stack, 0, poolsize);
    ...

    bp = sp = (int *)((int)stack + poolsize);
    ax = 0;

    ...
    program();
```

与 CPU 相关的是指令集，我们将专门作为一个小节。

# 指令集

指令集是 CPU 能识别的命令的集合，也可以说是 CPU 能理解的语言。这里我们要为我
们的虚拟机构建自己的指令集。基于 x86 的指令集，但要更为简单。

首先在全局变量中加入一个枚举类型，这是我们要支持的全部指令：

```c
// instructions
enum { LEA ,IMM ,JMP ,CALL,JZ  ,JNZ ,ENT ,ADJ ,LEV ,LI  ,LC  ,SI  ,SC  ,PUSH,
       OR  ,XOR ,AND ,EQ  ,NE  ,LT  ,GT  ,LE  ,GE  ,SHL ,SHR ,ADD ,SUB ,MUL ,DIV ,MOD ,
       OPEN,READ,CLOS,PRTF,MALC,MSET,MCMP,EXIT };
```

这些指令的顺序安排是有意的，稍后你会看到，带有参数的指令在前，没有参数的指令在
后。这种顺序的唯一作用就是在打印调试信息时更加方便。但我们讲解的顺序并不依据
它。

## MOV

`MOV` 指令用于将数据放进寄存器或内存地址，有点类似于 C 语言中的赋值语句。x86
的 `MOV` 指令有两个参数，分别是源地址和目标地址：`MOV dest, source` （Intel 风
格）。

但我们的小虚拟机只有一个寄存器，所以我们对它进行简化：

1. `IMM <num>` 将 `<num>` 放入寄存器 `ax` 中。
2. `LC` 将对应地址中的字符载入 `ax` 中，要求 `ax` 中存放地址。
3. `LI` 将对应地址中的整数载入 `ax` 中，要求 `ax` 中存放地址。
4. `SC` 将 `ax` 中的数据作为字符存放入地址中，要求栈顶存放地址。
5. `SI` 将 `ax` 中的数据作为整数存放入地址中，要求栈顶存放地址。

你可能觉得，这不是坑爹吗，一个指令变成了这么多指令。一方面呢，`MOV` 指令其实有
许多变种，根据类型的不同又有 `MOVB`, `MOVW` 等，我们这里的 `LC` 和 `LI` 就是对
两种类型分别生成一条指令。

在 `eval()` 函数中加入下列代码：

```c
void eval() {
    int op;
    while (1) {
        op = *pc++; // get next operation code
        if (op == IMM) {ax = *pc++;}                      // load immediate value to ax
        else if (op == LC) {ax = *(char *)ax;}            // load character to ax, address in ax
        else if (op == LI) {ax = *(int *)ax;}             // load integer to ax, address in ax
        else if (op == SC) {ax = *(char *)*sp++ = ax;}    // save character to address, value in ax, address on stack
        else if (op == SI) {*(int *)*sp++ = ax;}          // save integer to address, value in ax, address on stack
    }
}
```

这里要解释的一点是，为什么 `SI/SC` 指令中，地址存放在栈中，而 `LI/LC` 中，地址
存放在 `ax` 中？原因是默认计算的结果是存放在 `ax` 中的，而地址通常是需要通过
计算获得，所以执行 `LI/LC` 时直接从 `ax` 取值会更高效。另一点是我们的 `PUSH`
指令只能将 `ax` 的值放到栈上，而不能以值作为参数，详细见下文。

## PUSH

在 x86 中，`PUSH ` 的作用是将值或寄存器，而在我们的虚拟机中，一方面只有一个寄
存器，另一方面为了简化实现，因此规定它的作用是将 `ax` 的值放入栈中。代码如下：

```c
        else if (op == PUSH) {*--sp = ax;}                // push the value of ax onto the stack
```

## JMP

`JMP <addr>` 是跳转指令，无条件地将当前的 `PC` 寄存器设置为指定的 `<addr>`，实现如下：

```
        else if (op == JMP) {pc = (int *)*pc;}            // jump to the address
```

## JZ/JNZ

为了实现 `if` 语句，我们需要条件判断相关的指令。这里我们只实现两个最简单的条件
判断，即结果（`ax`）为零或不为零情况下的跳转。

实现如下：

```c
        else if (op == JZ) {pc = ax ? pc + 1 : (int *)pc;} // jump if ax is zero
        else if (op == JNZ) {pc = ax ? (int *)pc : pc + 1;} // jump if ax is zero
```

## 子函数调用

这块是汇编中最难理解的部分，所以合在一起说，要引入的命令有 `CALL`, `LEV`,
`ENT`。

首先我们介绍 `CALL <addr>` 与 `RET` 指令，它们的作用是调用存放在 `<addr>` 上的
子函数，以及从子函数中返回。

为什么不能直接用 `JMP` 指令呢？原因是当我们从子函数中返回时，程序需要从跳转前
的地方继续运行，这便需要事先将这个位置信息存储起来。反过来，子函数要返回时，就
需要获取并恢复这个信息。因此实际中我们将 `PC` 保存在栈中。如下：

```c
        else if (op == CALL) {*--sp = (int)(pc+1); pc = (int *)*pc;} // call subroutine
        else if (op == RET) {pc = (int *)*sp++;}          // return from subroutine;
```

这一切多么美好。只是实际调用函数时，还要考虑如何传递参数和如何返回结果。这里我
们约定，如果子函数有返回结果，那么就在返回时保存在 `ax` 中。那么参数的传递呢？

各种编程语言关于如何调用子函数有不同的约定，这里我们采用类似C语言的标准：

1. 由调用者将参数入栈。
2. 调用结束时，由调用者将参数出栈。
3. 参数逆序入栈。但我们是用正序入栈

下面的例子取自 [维基百科](https://en.wikipedia.org/wiki/X86_calling_conventions)：

```c
int callee(int, int, int);

int caller(void)
{
	int ret;

	ret = callee(1, 2, 3);
	ret += 5;
	return ret;
}
```

会生成如下的 x86 汇编代码：

```assembly
caller:
	; make new call frame
	push    ebp
	mov     ebp, esp
	; push call arguments
	push    3
	push    2
	push    1
	; call subroutine 'callee'
	call    callee
	; remove arguments from frame
	add     esp, 12
	; use subroutine result
	add     eax, 5
	; restore old call frame
        mov     esp, ebp
	pop     ebp
	; return
	ret
```

上面这段代码在我们自己的汇编语言里会有几个问题：

1. `push ebp`，但我们的 `PUSH` 指令并无法指定寄存器。
2. `mov ebp, esp`，我们的 `MOV` 指令同样功能不足。
3. `add esp, 12`，也是一样的问题（尽管我们还没定义）。

一方面，因此我们的指令集完成不了这些功能，另一方面，这些代码又需要经常发生，
因此我们加入这几个指令：

### ENT

`ENT <size>` 指的是 `enter`，用于实现 'make new call frame' 的功能，即保存当前的栈指
针。对应的汇编代码为：

```
	; make new call frame
	push    ebp
	mov     ebp, esp
        subl    esp, 3     ; save stack for local variables
```

实现如下：

```c
        else if (op == ENT) {*--sp = (int)bp; bp = sp; sp = sp - *pc++;}  // make new stack frame
```

### ADJ

`ADJ <size>` 用于实现 'remove arguments from frame'。在将调用子函数时压入栈中
的数据清除，本质上是因为我们的 `ADD` 指令功能有限。对应的汇编代码为：

```
	; remove arguments from frame
	add     esp, 12
```

实现如下：

```
        else if (op == ADJ) {sp = sp + *pc++;}            // add esp, <size>
```

### LEV

本质上并不需要这个指令，只是我们的指令集中并没有 `POP` 指令。并且两条指令写起
来也比较麻烦，所以用一个指令代替。对应的汇编指令为：

```
	; restore old call frame
        mov     esp, ebp
	pop     ebp
	; return
	ret
```

具体的实现如下：


```c
        else if (op == LEV) {sp = bp; bp = (int *)*sp++; pc = (int *)*sp++;}  // restore call frame and PC
```

### LEA

上面的一些指令解决了调用帧的问题，但还有一个问题是如何在子函数中获得传入的参
数。这里我们首先要了解的是当参数调用时，栈中的调用帧是什么样的。我们依旧用上面
的例子（只是参数的顺序不一样）：

```
|    ....       | high address
+---------------+
| arg: 1        |
+---------------+
| arg: 2        |
+---------------+
| arg: 3        |
+---------------+
|return address |
+---------------+
| old BP        | <- new BP
+---------------+
| local var 1   |
+---------------+
| local var 2   |
+---------------+
|    ....       |  low address
```

所以为了获取第一个参数，我们需要得到 `new_bp + 4`，但如上所述，我们的 `ADD`
指令无法实现此功能，所以我们提供一个新的指令：`LEA <offset>`

实现如下：

```c
        else if (op == LEA) {ax = (int)(bp + *pc++);}     // load address for arguments.
```

## 运算符指令

我们为 C 语言中支持的运算符都提供对应汇编指令。每个运算符都
是二元的，即有两个参数，第一个参数放在栈顶，第二个参数放在 `ax` 中。这个顺序要
特别注意。因为像 `-`, `/` 之类的运算符是与参数顺序有关的。计算后会将栈顶的参数
退栈。

实现如下：

```c
        else if (op == OR)  ax = *sp++ | ax;
        else if (op == XOR) ax = *sp++ ^ ax;
        else if (op == AND) ax = *sp++ & ax;
        else if (op == EQ)  ax = *sp++ == ax;
        else if (op == NE)  ax = *sp++ != ax;
        else if (op == LT)  ax = *sp++ < ax;
        else if (op == LE)  ax = *sp++ <= ax;
        else if (op == GT)  ax = *sp++ >  ax;
        else if (op == GE)  ax = *sp++ >= ax;
        else if (op == SHL) ax = *sp++ << ax;
        else if (op == SHR) ax = *sp++ >> ax;
        else if (op == ADD) ax = *sp++ + ax;
        else if (op == SUB) ax = *sp++ - ax;
        else if (op == MUL) ax = *sp++ * ax;
        else if (op == DIV) ax = *sp++ / ax;
        else if (op == MOD) ax = *sp++ % ax;
```

## 内置函数

正常情况下，一些函数是通过预先编译好的子函数实现的。为了方便起见，我们直接提供
相应的汇编指令来实现。这里先实现 `EXIT` 退出指令。剩下的遇到的时候再增加。

```c
        else if (op == EXIT) { printf("exit(%d)", *sp); return *sp;}
```

# 测试

在开头添加指令集的定义：

```c
// instructions
enum {IMM, LC, LI, SC, SI, PUSH, JMP, JZ, JNZ, CALL, RET, ENT, ADJ, LEV, LEA,
      OR, XOR, AND, EQ, NE, LT, LE, GT, GE, SHL, SHR, ADD, SUB, MUL, DIV, MOD,
      EXIT};
```

这样代码就使用了。

下面我们用我们的汇编写一小段程序，来计算 `10+20`，在 `main` 函数中加入下列代
码：

```
int main(int argc, char *argv[])
{
    ...
    memset(stack, 0, poolsize);

    sp = bp = stack;

    int i = 0;
    data[i++] = IMM;
    data[i++] = 10;
    data[i++] = PUSH;
    data[i++] = IMM;
    data[i++] = 20;
    data[i++] = ADD;
    data[i++] = PUSH;
    data[i++] = EXIT;

    pc = data;

    next();
    ...
}
```

编译程序 `gcc -o xc xc.c`，运行程序：`./xc`。输出

```
exit(30)
```
