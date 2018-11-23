title: Let's Build a C Compiler(0) -- Preface
date: 2016-02-06 09:37:13
tags: [C, compiler]
categories: Project
toc: true
---

*EDIT*: Note that I've include the full tutorial in the project [write-a-C-interpreter](https://github.com/lotabout/write-a-C-interpreter/tree/master/tutorial/en). Please check that instead.

In "Let's Build a C Compiler" series, we will build a compiler from scratch
for C programming language. I hope you will get some understanding of compiler
construction by the end of this tutorial. At the same time we will build a
usable compiler of C though some syntaxes are not supported.

Note that it is actually an Interpreter and can interpret itself. I use the
word "compiler" because it is more attractive, but we did more than that. Also
this series is actually written in Chinese in the first place, If you are
confused by my English, please leave some comments.

In this very first chapter there will not be any code. If you are those that
likes code instead of texts, please skip. I'll talk about the intention of
this series.

## Why Compiler Theory

What is the most important courses in computer science? I would give "Data
Structure", "Algorithm" and "Compiler Theory". In my point of view,
understanding **recursion** is the first level for programmers, and **writing
a compiler** is the next one.

(Of course, there exists a lot of excellent programmers that don't write a
compiler, but at least writing one is a big challenge)

People used to say that you can write more efficient code if you know how the
compiler works. But who cares when the modern computers have performance so
high that we can hardly imagine before? Then why bother with compiler theory?

Because it is cool!

OK, admit it, you are still reading mainly because you are curious how far
would I go with this tutorial. But be careful, it will go quite far.

No? You just want to know how to build a compiler? OK then... my mistake.

## Hard to understand, hard to implement?

I have always been in awe of compiler. So when I went to college and they taught
compiler theory, I was so enthusiastic! And then... then I quit, because I
could not understand a single part.

Normally a course about compiler will cover:

1. How to represent syntax (such as BNF, etc.)
2. Lexer, with somewhat NFA(nondeterministic finite automata),
   DFA(deterministic finite automata).
3. Parser, such as recursive descent, LL(k), LALR, etc.
4. Intermediate Languages.
5. Code generation.
6. Code optimization.

I believe that most(98%) students will not care anything beyond parser(at
least in my school). And the most important thing is: we still don't know how
to build a compiler! Even after all these theories. The main reason is that
what "Compiler Theory" try to teach is actually "how to build a parser
generator", namely a tool that consumes syntax grammar and generates compiler
(such as lex/yacc).

These theories try to taught us how to solve problems in a common way
automatically. That means once you master them, you are able to deal with all
kinds of grammars. They are indeed useful in industry. Nevertheless they are
too powerful and too complicate for students and most programmers. You will be
convinced if you read the source code of lex/yacc (or flex/bison).

The good news is, building a compiler is far simpler than you'd ever imagined.
I won't lie, it is not easy, but not that hard.

## Original intention is for self-practicing

I saw [c4](https://github.com/rswier/c4) on Github. It is a small C
interpreter which is claimed to be implemented by only 4 functions. The most
amazing part is that it is bootstrapping (that interpret itself). Also it is
done with about 500 lines!

Existing tutorials is either very simple(such as implementing a simple
calculator) or using automation tools(such as flex/bison). c4 is implemented
all on its own. The bad thing is that it try to be minimal, so the code is
quite a mess, hard to understand. So I started a new project that:

1. implement a working C compiler(interpreter actually)
2. Writing this tutorial to show how to do it.

c4 is about 500 Lines, it took 1 week for me to re-write it, resulting 1400
lines including comments. The project is hosted on Github: [Write a C Interpreter](https://github.com/lotabout/write-a-C-interpreter)

Note: Almost all logic of this project is taken from c4. So the original
author(rswier) takes credit.

## Caution

Two major problem I met when I working with this project are:

1. boring, there will be codes that are almost identical.
2. hard to debug. We don't have good test cases. On the other hand if the
   output is wrong, I could only follow the generated code all by myself to
   debug.

So I hope you'll take out enough time and patience for studying, cause I am
sure that you will feel a great sense of accomplishment just like I do.

## References

1. [Let's Build a Compiler](http://compilers.iecc.com/crenshaw/): a very good
   tutorial of building a compiler for fresh starters.
2. [Lemon Parser Generator](http://www.hwaci.com/sw/lemon/): the parser
   generator that is used in SQLite. Good to read if you won't to understand
   compiler theory in code.

In the end, I am human with a general level, there will be inevitably wrong
with the articles and codes(also my English). Feel free to correct me!

Hope you enjoy it.
