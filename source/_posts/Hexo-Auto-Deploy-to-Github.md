title: Hexo 自动部署到 Github
date: 2016-01-14 12:00:19
tags: [Hexo, Github, Travis CI]
categories: [Notes]
toc: true
---

使用 [Hexo](http://hexo.io/) 写博客是十分惬意的事。唯一有点不爽的，就是每次修改
后都要重新生成并部署到 Github 上，这也是所有静态博客生成工具的通病。那么本文我们
就利用 [Travis CI](https://travis-ci.org/) 来完成自动部署，解决心中最后一处搔
痒。

本文假设你知道如何使用 Hexo 来生成和部署你的网站，并知道如何使用 git 命令和
Github 。其实不明白也没什么，只是明白了更容易理解文章里说了什么。

## 什么是 Travis CI

Continuous Integration(CI) 是持续集成的意思。

> 从技术层面上来讲，"持续集成"的含义是指开发团队中的每个成员都尽量频繁地把他们
> 所做的工作更改合入到源码库中，并且还要验证新合入的变化没有造成任何破坏

那到底什么是持续集成呢？开发软件时，不同人负责不同的模块，之后每天或是每月将
它们的工作合并，并构建一个可运行的版本，这就是集成。而持续集成就是缩短集成的
间隔，通过自动化的方式，尽量为每一个提交（commit）都生成一个可运行的版本。

当然以上只是我个人简单的观点。好处坏处什么的就不说了。

那么 [Travis CI](https://travis-ci.org/) 就是用来做这个用的。可以这样理解：当
你提交一个 commit 到 Github 时，Travis CI 会检测到你的提交，并根据你的配置文
件，为你自动运行一些命令，通常这些命令用于测试，构建等等。

那么在我们的需求下，就可以用它运行一些 `hexo deploy -g` 之类的命令用来自动生
成、部署我们的网站。

- [敏捷软件开发基础: 持续集成环境的构建](https://www.ibm.com/developerworks/cn/java/j-build/)
- [持续集成初探](http://www.cnblogs.com/helloIT/p/4923492.html)

## 配置 Travis 用于自动生成

Travis 的 [构建周期](https://docs.travis-ci.com/user/customizing-the-build/#The-Build-Lifecycle)
分为两步：

1. `install` 用于安装构建所需要的一些依赖
2. `script` 运行构建脚本

我们可以自定义这两个步骤，如在运行之前做一些配置，如果成功做一些动作，失败做一
些动作等。具体支持的步骤如下：

1. `before_install`
1. `install`
1. `before_script`
1. `script`
1. `after_success` or `after_failure`
1. `before_deploy`，可选
1. `deploy`，可选
1. `after_deploy`，可选
1. `after_script`

所以我们的配置如下：

{% codeblock .travis.yml lang:yaml %}
language: node_js

node_js:
- '6.0.0'

branches:
  only:
  - source                # 只监测 source 分支上的 commit

before_install:
- npm install -g hexo-cli # 安装 hexo

install:
- npm install             # 安装额外的插件

script:
- git submodule init      # 用于更新主题
- git submodule update
- hexo generate
{% endcodeblock %}

上面的例子中 `npm install` 安装 hexo 需要的插件，这要求 `package.json` 已经
设置好。例如，我们要使用 `hexo-deployer-git` 插件来部署，所以我们需要事先运行
下面命令：

```sh
npm install --save hexo-deployer-git
```

上述命令的作用之一是在 `package.json` 中添加相应的项。

## 使用 Travis 自动部署

首先，我们需要对 `_config.yml` 进行配置，以执行 `hexo deploy` 进行部署：

{%codeblock _config.yml lang:yaml%}
## Docs: http://hexo.io/docs/deployment.html
deploy:
  type: git
  repo: https://github.com/lotabout/lotabout.github.io
  branch: master
{% endcodeblock %}

然后我们可以在 `.travis.yml` 添加生成成功后的动作：

{%codeblock .travis.yml lang:yaml%}
after_success:
- git config --global user.name "Your Name"
- git config --global user.email "Your Email"
- hexo deploy
{% endcodeblock %}

然而在 `hexo deploy` 时，我们需要输入 Github 的用户名和密码，但这又要如何自动
化呢？

## Github OAuth

[Github
OAuth](https://github.com/blog/1270-easier-builds-and-deployments-using-git-over-https-and-oauth)
支持一种特殊的 URL 来执行 push/pull 等等操作，而不需要输入用户名密码。
但这需要事先在 Github 上创建一个 token：

{% asset_img /2016-01-14-github-token.png Github Create Token %}

1. 打开 [Personal Access Tokens](https://github.com/settings/tokens)
2. 点击 `Create new token`
3. token 的权限保持默认即可

有了这个 token 后，原先用

```
https://github.com/username/repo.git
```

进行访问，现在换成：

```
https://<token>@github.com/owner/repo.git
```

即可。切记，这个 token 的权限很大，不要把原文提交到 Github 上。

## Travis 加密 token

上面我们说了，要保护好你的 github token。所以我们在写入 travis 配置时要先对这
个 token 进行加密。

首先安装 travis 命令行工具：

```sh
gem install travis
travis login
```

之后通过如下命令在 `.travis.yml` 添加额外的配置：

```sh
travis encrypt 'GH_TOKEN=<TOKEN>' --add
```

上面命令会在 `.travis.yml` 添加如下内容：

{%codeblock .travis.yml lang:yaml%}
env:
  global:
    secure: QAH+/EIDC/Jg...
{% endcodeblock %}

上面的一长串字符串就是加密后的环境变量。之后，在 Travis 执行脚本时，我们就可能
访问环境变量 `GH_TOKEN` 来获取 github token 了。

最后，我们用 `sed` 命令动态地修改 github 的 URL，加入 token 信息：

{%codeblock .travis.yml lang:yaml%}
after_success:
- git config --global user.name "Mark Wallace"
- git config --global user.email "lotabout@gmail.com"
- sed -i'' "/^ *repo/s~github\.com~${GH_TOKEN}@github.com~" _config.yml
- hexo deploy
{% endcodeblock %}

- [Travis Encryption Keys](https://docs.travis-ci.com/user/encryption-keys/)

## 启用 Travis CI

最后一步，就是启用 Travis CI，连接 Github 后，它会列出你的所有 repo，勾上相应的 repo 即可：

{% asset_img 2016-01-14-travis.png Travis tick repo %}

## 最后

最后就是好好写博客，提交就可以了。

## 参考资料

- [Hexo 搭建 Wiki](http://www.jianshu.com/p/e7413116e9d4)
- [Deploying Hexo to Github](https://sazzer.github.io/blog/2015/05/04/Deploying-Hexo-to-Github-Pages-with-Travis/)
- [使用 Travis CI 自动部署 Hexo](https://xuanwo.org/2015/02/07/Travis-CI-Hexo-Autodeploy/)
- [本站实际使用的配置](https://github.com/lotabout/lotabout.github.io/tree/source)
