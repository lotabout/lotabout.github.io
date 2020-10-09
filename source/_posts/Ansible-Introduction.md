title: Ansible 入门介绍
toc: true
date: 2020-10-09 09:54:53
tags: [Ansible, DepOps]
categories: [Knowledge]
---

Ansible 是一个 IT 自动化工具，主要用来做自动化部署、自动化配置等。也许是因为它
发展太快，官方的文档经常看得云里雾里，不易上手，本文结合博主自身的经验，介绍一
些入门的概念。由于不是专业 DevOps ，水平有限，点到为止。

## 什么是 Ansible

如果管理一台机器，最快的操作方式是 ssh 到这台机器上直接执行命令。

如果管理几台机器，笨办法是一台台操作，不过这样容易出错。命令行高手可能会用
tmux的 `synchronize-panes` 或 SecureCrt 的 "Send chat to all tabs" 等功能来多
屏操作。

如果管理的机器有十几台或几十台，或者部署、更新操作很频繁，最好的方式就是写成脚
本，这样方便重用，同时减少出错的可能性。

当部署的操作比较复杂时，如需要部署多个模块，每个模块的配置相互关联，部署有许多
步骤时，裸写脚本会让脚本变得十分复杂。这种情形下， Ansible 提供的一些功能能方
便我们管理、定制部署的内容。

## Ansible 的基本概念

### Nodes

Ansible 允许我们在一台机器上控制多台机器，如下图：

{% asset_img Ansible-Nodes.svg Control Node and Managed Node %}

执行 Ansible 命令的机器称作控制节点（Control Node），这台机器上需要安装
ansible，其它机器称作受管节点（Managed Node），不需要安装 ansible。

Ansible 要求控制节点到受管节点之间要配置 ssh 免密登录，侧面说明 ansible 在执行
时就是 ssh 到受管节点上再执行相应的命令。也因此在执行命令时需要受管节点本身安
装好相应的命令（如解压 zip 包需要安装 unzip 命令）。

### Inventory

Inventory 可以翻译成“清单”，Ansible 要管理许多机器，那这些机器的 IP 在哪里存储
、获取呢？Ansible 定义了 [inventory 格式
](https://docs.ansible.com/ansible/latest/user_guide/intro_inventory.html#inventory-basics-formats-hosts-and-groups)
，我们只需要把要管理的机器按格式保存成文件即可（一般会命名为 `hosts`）。如 ini
的格式如下：

```
mail.example.com

[webservers]
foo.example.com
bar.example.com

[dbservers]
one.example.com
two.example.com
three.example.com
```

其中的 `[webservers]` 是“组”，之后在需要填写机器的地方写的都是“组名”（当然还有
其它写法）。

如果你管理的机器很多，ansible 还支持这样一些语法，来代表范围（具体的格式可以查
阅文档）：

```
[webservers]
www[01:50].example.com

[databases]
db-[a:f].example.com
```

### Module

我们说过，ansible 的作用相当于 ssh 到目标机器上执行脚本。有些任务用脚本写起来
会比较麻烦，Ansible 就把这些任务抽象成一个方便配置的模块，就是 module，它是
Ansible 执行的最小代码单元。

例如部署时我们常需要把安装包 scp 到目标机器，再解压。压缩格式不同还需要调用不
同的解压命令，而 ansible 把这个功能抽象成 `unarchive` module，只需要简单配置就
可以实现功能。例如将控制节点上的 JDK 解压到受管节点中，只需要指定路径即可：

```yaml
- name: copy and unzip jdk
  unarchive: src={{jdk_local_file_path}} dest={{jdk_install_path}}
```

### Task & Tag

Task 即任务，如果说 module 对应于脚本中的一个命令，task 就是命令加参数，用来实
现一个具体的操作。

例如上面的解压 JDK 示例其实就是一个 task。其中的 `unarchive` 是 module，而
`src`, `dest` 是具体的参数，加上 `name` 这个额外的标记信息，整体描述了一个具体
的操作。

```yaml
- name: copy and unzip jdk
  unarchive: src={{jdk_local_file_path}} dest={{jdk_install_path}}
  tag:
  - install
```

Task 描述了具体的操作，那么如何控制操作的执行时机呢？例如解压 JDK 的操作只希望
在安装的时候执行，而后续更新服务时不希望执行。

Ansible 中提供的一种机制是 Tag（标签）。在后续执行时，可以指定一个或多个标签，
只有标签匹配的任务才会被执行。这个机制使得 ansible 比自制脚本更加灵活。

### Playbook

[Playbook](https://docs.ansible.com/ansible/latest/user_guide/playbooks_intro.html)
翻译为“剧本”，如果把 task 看作一个个动作，剧本的作用就是串联这些动作
，来实现全局的目的。一个剧本可以包含多场“戏”（Play），每场戏至少需要定义两个要
素：

- 目标机器，通过 [pattern](https://docs.ansible.com/ansible/latest/user_guide/intro_patterns.html#intro-patterns) 语法指定
- 至少一个 task

下例的第一场戏中，ansible 在 webservers 上执行任务，第二场戏中在databases上执
行任务：

```yaml
---
- name: update web servers
  hosts: webservers
  remote_user: root

  tasks:
  - name: ensure apache is at the latest version
    yum:
      name: httpd
      state: latest
  - name: write the apache config file
    template:
      src: /srv/httpd.j2
      dest: /etc/httpd.conf

- name: update db servers
  hosts: databases
  remote_user: root

  tasks:
  - name: ensure postgresql is at the latest version
    yum:
      name: postgresql
      state: latest
  - name: ensure that postgresql is started
    service:
      name: postgresql
      state: started
```

默认情况下，ansible 会按剧本里的任务一项项顺序执行，每项任务都会在指定的所有目
标机器上执行。如果有一台机器上执行失败，则这台机器将不再参与该剧本后续任务的执
行。当然，执行的策略也是可以改的，参考：
[strategies](https://docs.ansible.com/ansible/latest/user_guide/playbooks_strategies.html#playbooks-strategies)。

### Role

[Role](https://docs.ansible.com/ansible/latest/user_guide/playbooks_reuse_roles.html)
翻译成“角色”，它是 ansible 的一个组织上的概念。有时候我们可能会有许多剧本，而
不同剧本可能只是组织的顺序不同，任务本身是一样的，于是我们把它们组织成一个个“
角色”，一个剧本可以直接邀请角色，一个角色可以出演多个剧本，组织更清晰，也方便
复用。

实际上，ansible 中要完成一项任务，还会使用到许多概念，比如需要读取设置变量；定
义文件模板；自定义 module 等等。于是 ansible 要求我们按指定的目录格式来组织：

```
# playbooks
site.yml
webservers.yml
fooservers.yml
roles/
    common/
        tasks/     # main.yml 执行的 task
        handlers/  # main.yml handlers，可在本角色或角色外使用
        library/   # my_module.yml 本角色中可使用的自定义 module
        files/     # main.yml 部署的文件
        templates/ # main.yml 部署的模板
        defaults/  # main.yml 使用有默认值的变量，可以被覆盖，最低优先级
        vars/      # main.yml 的其它变量
        meta/      # main.yml meta 信息，如角色的依赖关系
    webservers/
        tasks/
        defaults/
        meta/
```

* 每个角色都要放在 `roles` 目录下，且单独成目录，如 `roles/common/`
* 每个“功能”独自成目录（如 `tasks/`），且默认生效的配置为目录下的 `main.yml`
    文件

定义了 role 后就可以在 play 中使用：

```yaml
- hosts: webservers
  roles:             # 通过 roles 指定引入的角色
    - common
    - webservers
```

还有复杂的用法：

```yaml
- hosts: webservers
  roles:
    - common
    - role: foo_app_instance
      vars:                   # 覆盖变量
        dir: '/opt/a'
        app_port: 5000
      tags: typeA             # 给 role 里的所有 task 添加 tag
```

### 其它

这里只介绍一些组织上的概念，在实际编写 ansible 时，还需要许多变量上的操作，如[
条件判断
](https://docs.ansible.com/ansible/latest/user_guide/playbooks_conditionals.html)
、[循环
](https://docs.ansible.com/ansible/latest/user_guide/playbooks_loops.html)等，
以及一些[内置的
module](https://docs.ansible.com/ansible/latest/collections/ansible/builtin/)
，麻烦读者在使用时查阅相关文档。

## 示例：部署 Spring Boot 服务

下面我们写一个简单的 ansible 工程，用于安装、部署、启停 spring boot 任务。目的
是对 ansible 的工程结构及脚本有大概的认识。这里会贴出所有的代码，比较长，不想
了解细节可以先跳过。

```txt 目录结构
.
├── hosts                   # inventory
├── roles
│   ├── jdk
│   │   └── tasks
│   │       └── main.yml    # 部署步骤
│   └── webapp
│       ├── files
│       │   └── webapp.jar  # 服务 jar 包
│       ├── tasks
│       │   └── main.yml    # 部署步骤
│       ├── templates
│       │   └── application.properties.j2  # spring boot 配置文件模板
│       └── vars
│           └── main.yml    # 部署参数
├── vars.yml                # 全局参数
└── webapp.yml              # playbook
```

在编写 ansible 脚本时，通常会这么做：

1. 编写 `hosts` 和 `vars.yaml`，存储机器信息和变量信息。环境变化时，一般只修改
   这两个文件即可
2. 将目标分解成多个角色，如例子中将 jdk 和 webapp 分开
3. 为每个角色编写脚本，一般在 task 只会增加 tag 来分组，有些 task 可以共用
4. 编写 playbook，包含一到多个角色，串连完成目标
5. 将经常执行的命令写成脚本，这点在样例中没有体现

当然 ansible 只提供机制，部署的脚本不只一种，这里描述的是博主的习惯。具体的文
件内容如下：

{% include_code lang:ini ansible-playground/hosts %}
{% include_code ansible-playground/vars.yml %}
{% include_code ansible-playground/webapp.yml %}
{% include_code roles/jdk/tasks/main.yml ansible-playground/roles/jdk/tasks/main.yml %}
{% include_code roles/webapp/tasks/main.yml ansible-playground/roles/webapp/tasks/main.yml %}
{% include_code roles/webapp/templates/application.properties.j2 ansible-playground/roles/webapp/templates/application.properties.j2 %}
{% include_code roles/webapp/vars/main.yml ansible-playground/roles/webapp/vars/main.yml %}

有了这些部署脚本后，可以通过如下命令来安装、部署：

```sh
# 安装, -K 在执行时会提示输入 sudo 密码，安装 JDK 时使用
# 由于 playbook 中包含了 jdk 与 webapp，会先后执行 jdk 与 webapp 带 install tag 的任务
ansible-playbook webapp.yml -i hosts --tags install -K

# 启动，jdk 中没有启动步骤，只会执行 webapp 中带 start tag 的任务
ansible-playbook webapp.yml -i hosts --tags start

# 关闭
ansible-playbook webapp.yml -i hosts --tags stop
```

## 小结

当你想写脚本部署服务时，可以考虑使用 Ansible 来替代。对于初次接触的同学，需要
先了解一些 ansible 的组织概念，文中介绍了主要的一些概念：

- Node：节点/机器，包括控制节点(Control Node)和受管节点(Managed Node)，通过
    SSH 免密通信
- Inventory：配置文件，记录节点信息
- Module：最小的代码单元，是 ansible 对常用命令做的抽象
- Task：单个操作，可以认为是 Module 加上具体的参数
- Tag：对 Task 做标记/分组，在执行时可以指定一个或多个 tag
- Playbook：剧本，顺序组织多个 task，来完成具体目标，可以包含多场“戏”
- Role：对 Task 的结构化组织，需要遵守特定的目录结构


了解这些概念后，我们就知道 Ansible 脚本“从何写起”了。最后我们给了一个具体的示
例，来安装，部署一个 Spring Boot 的 Web 服务。

Ansible 的功能远不止这些，本文只是抛砖引玉，更多的功能可以查阅官方文档。
