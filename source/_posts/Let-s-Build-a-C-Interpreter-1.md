title: "Let's Build a C Compiler (1) -- Design"
date: 2016-02-06 10:56:31
tags: [C, compiler]
categories: Project
toc: true
---

This is the second chapter of series "Let's Build a C Compiler", In this
chapter we will have an overview of the structures of our compiler.

Previous Chapters:

1. [Let's Build a C Compiler (0) -- Preface](http://lotabout.me/2016/Let-s-Build-a-C-Interpreter-0/)

As we said in previous chapter, we promise a "Compiler", but it is actually an
"Interpreter". That means we can run a C source file just like a script, we
did this mainly for two reasons:

1. Interpreter is different with Compiler only in code generation phase. They
   are the same in lexical analysis and parsing.
2. We will build our own virtual machine and assembly instructions, that would
   help us better understanding the how computer works.

## Phases of Compiler Construction

Normally, there are three phases of compiler parsing a source file:

1. lexical analysis: that converts source strings into internal token stream.
2. parsing: that consumes token stream and constructs a syntax tree.
3. code generation: walk through the synatx tree and convert it to target
   code.

Compiler Construction had been so mature that part 1 & 2 can be done by
automation tools. For example, flex can be used for lexical analysis, bison is
for parsing. They are powerful but do thousands of things behind the scene. In
order to fully understand how to build a compiler, we are going to build all
of them from scratch.

1. Build our own virtual machine and instruction set. This is the target code
   that will be using in our code generation phase.
2. Build our own lexer for C compiler.
3. Write a recusion descent parser on our own.

## Overall Structure of our Compiler

Taken from c4, our compiler includes 4 main functions:

1. `next()` for lexical analysis; get the next token; will ignore spaces tabs etc.
2. `program()` entry for parser.
3. `expression(level)` parse expression; `level` will be explained in later
   chapter.
4. `eval()` the entry of our virtual machine; used to interpret target
   instructions.

Why would `expression` exist when we have `program` for parser? It is because
the parser for expressions is relatively independent and complex, so we put it
into a single mmodule(function).

Then our code looks like:

```c
#include <stdio.h>
#include <stdlib.h>
#include <memory.h>
#include <string.h>

int token;            // current token
char *src, *old_src;  // pointer to source code string;
int poolsize;         // default size of text/data/stack
int line;             // line number

void next() {
    token = *src++;
    return;
}

void expression(int level) {
    // do nothing
}

void program() {
    next();                  // get next token
    while (token > 0) {
        printf("token is: %c\n", token);
        next();
    }
}


int eval() { // do nothing yet
    return 0;
}

int main(int argc, char **argv)
{
    int i, fd;

    argc--;
    argv++;

    poolsize = 256 * 1024; // arbitrary size
    line = 1;

    if ((fd = open(*argv, 0)) < 0) {
        printf("could not open(%s)\n", *argv);
        return -1;
    }

    if (!(src = old_src = malloc(poolsize))) {
        printf("could not malloc(%d) for source area\n", poolsize);
        return -1;
    }

    // read the source file
    if ((i = read(fd, src, poolsize-1)) <= 0) {
        printf("read() returned %d\n", i);
        return -1;
    }
    src[i] = 0; // add EOF character
    close(fd);

    program();
    return eval();
}
```

The code might seems to be a lot for the very first chapter. But if you are
familiar with C, you'll find it simple enough. The code above reads a source
file, character by character, and output them.

The most important thing here is to understand the meaning of these functions,
they represents the whole framework of a interpreter. We'll implement all of
them step by step in the following chapters and finally a whole compiler.

## Code

The code for this chapter can be downloaded from
[Github](https://github.com/lotabout/write-a-C-interpreter/tree/step-0), or
clone by:

```
git clone -b step-0 https://github.com/lotabout/write-a-C-interpreter
```

Note that I might fix bugs later, and if there is any incosistance between the
artical and the code branches, follow the article. I would only update code in
the `master` branch.

## Summary

With simple coding, we have the simplest compiler: a do-nothing compiler. In
[next chapter](http://lotabout.me/2016/Let-s-Build-a-C-Interpreter-2/), we
will implement the `eval` function, i.e. our own virtual machine
