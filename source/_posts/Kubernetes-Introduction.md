title: Kubernetes 快速入门
toc: true
date: 2020-05-07 21:04:05
tags: [Kubernetes, k8s, introduction]
categories: [Knowledge]
---

Kubernetes(简称 k8s[^k8s]) 是一个容器编排系统，本文会实用的角度，讲解一些基本
概念，基本操作。

[^k8s]: 首尾字母之间有 8 个字母，所以称为 k8s，类似的还有 i18n(internationalization)。

## 概述

Kubernetes 是希腊语，含义是“舵手”，容器 (container) 也有“集装箱”的含义，k8s 是
容器编排系统，就像舵手在开着一艘货轮，轮船上叠满了集装箱，可以说十分贴切。

k8s 在概念上主要分为资源对象和控制对象。资源对象包括容器、应用、配置、网络、存
储等；控制对象则是方便管理这些资源而抽象的控制层，如 ReplicaSet 管理多副本，
Deployment 管理版本的升级等。

## 容器(Container)

容器是最小的隔离单位，可以理解成一台虚拟机，一般上面只跑着一个(核心的)程序。也
可以直接理解成一个容器就是一个 docker 实例。

实际上 k8s 定义了容器需要实现的接口
([CRI](https://github.com/kubernetes/community/blob/master/contributors/devel/sig-node/container-runtime-interface.md))
，理论上可以有多种实现，如 docker, containerd, CRI-O 等[^k8s-container]，但上
手使用并不需要知道这些。

[^k8s-container]: https://kubernetes.io/docs/concepts/overview/components/

## Pod

[Pod](https://kubernetes.io/docs/concepts/workloads/pods/pod-overview/) 在 k8s
的语境下一般不翻译。它的英文含义是“豆荚”，想像一个 container 是一个豆子，一个
豆荚里有一到多个豆子，并组装成一个“豆角”。对应地，一个 pod 可以包含一个或多个
container（实际中我还没见多对应多个container 的情形）。

对于我们使用来说，对 pod 最需要了解的有两点：

1. 它是 k8s 最小的调度单位
2. 每个 pod 都有自己的 IP，且 k8s 要保证 pod 间通过这个 IP 可以互相访问

{% asset_img k8s-pod.svg Kubernetes Pod Network %}

如上图，k8s 需要保证能在 Pod 1 里直接 ping 通 `10.1.20.2` 这个 IP(Pod 3)，尽管
它们属于不同物理机。至于如何实现，与容器类似，也有[多种实现方式
](https://kubernetes.io/docs/concepts/cluster-administration/networking/)，普
通用户不需要了解。

跟 pod 相关的指令是平时用得最多的，例如：

* `kubectl get pods` 列出当前 namespace 下的所有 pod (namespace 后面讨论)
* `kubectl get pod my-pod -o yaml` 列出 `my-pod` 的配置
* `kubectl log my-pod` 列出 `my-pod` 的所有日志
* `kubectl log -f --since=10m my-pod` 列出 `my-pod` 近 10 分钟的日志并持续监控
* `kubectl describe pods my-pod` 查看 `my-pod` 的状态（如重启，上次失败原因等）
* `kubectl exec -it my-pod bash` “登录” my-pod 并执行 bash

## ReplicaSet

一般在部署(微)服务时，我们会部署多个副本，一方面水平扩展，能承受更高的压力；另
一方面可以防止单点故障影响服务整体的高可用。

[ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)(RS)
就是这种需求的一种抽象概念，一个 ReplicaSet 相当于是一个副本的集合，它是一个控
制器(controller)。例如当一个目标为 3 副本的 ReplicaSet 管理的pod 挂了，则这个
ReplicaSet 会启动新的/重启 pod 来满足副本数的需求。

一般我们不会直接和 ReplicaSet 打交道，而是通过 deployment 来做控制。

## Deployment

ReplicaSet 可以控制 pod 的副本数，在实际部署中我们还会有更新、回溯等的需求，例
如要将pod 更新到新的版本，希望能滚动升级(rolling update)，希望先停止一个旧版本
的 pod 并启动新版本的 pod，直到所有的 pod 都是新版本的。期间作为一个整体对外的
服务(service)不中断。

[Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
也是一个 controller 概念，通过 yaml 文件的配置让我们很方便控制 pod：部署、更新
、回滚、扩展、收缩等等。下面是示例配置文件：

```yaml
apiVersion: apps/v1           #
kind: Deployment              #
metadata:                     #
  name: nginx-deployment      #
  labels:                     #
    app: nginx                #
spec:                         #
  replicas: 3                 #--. 相当于 ReplicaSet 的定义
  selector:                   #  |
    matchLabels:              #  |
      app: nginx              #--'
  template:                   #--. 相当于单个 pod 的定义
    metadata:                 #  |
      labels:                 #  |
        app: nginx            #  |
    spec:                     #  |
      containers:             #  |
      - name: nginx           #  |
        image: nginx:1.14.2   #  |
        ports:                #  |
        - containerPort: 80   #--'
```

通过 `kubectl apply -f deployment.yml` 可以应用这个配置，k8s 会为我们创建一个
Deployment，一个 ReplicaSet，同时会为我们启动 3 个 pod。可以通过如下命令查看相
关状态：

* `kubectl get deploy` 获取当前 namespace 下所有 deployments
* `kubectl get deploy my-deployment -o yaml` 获取 my-deployment 的配置 yaml
* `kubectl describe deploy my-describe` 获取 my-deployment 的一些详细状态
* `kubectl get rs` 获取当前 namespace 下的所有 ReplicaSet，一般用不着

如果要更新 pod 版本，或是改变副本的数量，直接修改之前的 yaml 配置文件，再重新
执行 `kubectl apply -f deployment.yml` 即可。k8s 会自动做出调整，滚动升级或回
退。

## Service

我们知道每个 pod 有自己的 IP，在更新版本或增减副本数时，一些 pod 可能被杀死，
新的 pod 会被启动，那么其它服务如何决定连接到哪个 pod 呢？

[Service](https://kubernetes.io/docs/concepts/services-networking/service/) 就
是针对这种需求创建的抽象，对使用方屏蔽内部 pod 变化。使用方将流量发到 Service，
而 Service 需要将流量转发到底层的 pod，于是衍生出下面几个问题：

1. 使用方如何定位到 Service？
2. Service 如何找到目标的 Pod?
3. 流量如何转发？

下面是一个 Service 配置的示例：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: MyApp            # 通过标签选择目标 Pod
  ports:
    - protocol: TCP
      port: 80            # Service 暴露的端口
      targetPort: 9376    # 转发到 pod 对应的端口
```

对着配置先回答第二个问题：Service 是通过 `selector` 配置项指定标签，如果
Deployment 里的 pod 的 `labels` 字段包含了 Service 中 `selector` 的标签，则会
被选中。

流量转发方式比较多比较复杂，这里不做介绍。剩下的就是 Service 如何定位了。

### 内部访问

首先，我们注意到配置文件里有 `name` 字段，这是 Service 的名字。其次，在部署
Service 后 k8s 会为 Service 分配一个虚拟 IP[^not-in-external-name]，称作
`Cluster IP`。

在集群的 pod 里可以尝试 `telnet <service name> <port>` 或 `telnet <cluster ip>
<port>` 来访问对应的 Service。注意的是这个虚拟 IP 是 ping 不通的，因为它是 ip
tables 实现的（也有其它实现方式）。

[^not-in-external-name]: 严格来说，ExternalName 类型下不会分配

这里附上一个原理图（当然还有其它实现方式可选择），对细节没兴趣的话可直接跳过：

{% asset_img k8s-service-clusterIP.svg Kubernetes ClusterIP %}

当 Pod A 发起的网络请求会被 iptables 重定向到 kube-proxy，而它会监控集群内 Pod
的变化，并将流量转发到对应的 Pod 里，默认转发的方式是 round-robin。

### 外部访问

很明显 ClusterIP 只在集群内部有办法访问，那集群外要如何访问 Service？

对外暴露 Service 有多种方式，这里只说 NodePort 的方式：

```yaml
kind: Service
apiVersion: v1
metadata:
  name: my-service
spec:
  type: NodePort # 类型为 NodePort
  selector:
    app: MyApp
  ports:
    - protocol: TCP
      port: 80
      targetPort: 9376
      nodePort: 30336 # 指定 NodePort 端口号
```

当指定 NodePort 时，k8s 会在集群所有节点(物理机)上开相应的端口，集群外的流量通
过这个端口转发到 kube-proxy，再由 kube-proxy 转发到后台的 pod 中，如下图：

{% asset_img k8s-service-node-port.svg Kubernetes Service NodePort %}

因此在 NodePort 模式下，集群外可以通过 `<node_ip>:<node_port>` 访问服务。

### 常用命令

Service 一般我们只关心它的 NodePort，用下面的命令查询：

```
$ kubectl get svc
NAME              TYPE        CLUSTER-IP    EXTERNAL-IP   PORT(S)         AGE
my-svc            ClusterIP   10.42.51.51   <none>        80/TCP,81/TCP   10m
my-svc-external   NodePort    10.42.51.52   <none>        80:30336/TCP    10m
```

上面的 `30336` 就是 NodePort。

## ConfigMap

有了 Deployment 和 Service，部署服务已经不在话下，那么如何管理服务的配置信息呢
？

[ConfigMap](https://kubernetes.io/docs/concepts/configuration/configmap/) 就是
对配置文件的抽象，也是使用 yaml 配置，也可以类似 pod 一样部署/更新，不过
ConfigMap更新后需要重启 pod 才能应用新的配置。下面是配置示例（取自官方文档）：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: game-demo
data:
  # property-like keys; each key maps to a simple value
  player_initial_lives: 3
  ui_properties_file_name: "user-interface.properties"
  # file-like keys
  game.properties: |
    enemy.types=aliens,monsters
    player.maximum-lives=5
  user-interface.properties: |
    color.good=purple
    color.bad=yellow
    allow.textmode=true
```

注意：配置里的 "file-like" 的配置项其实只是用 yaml 的多行语法写了配置的内容，
ConfigMap 本身不区分 "property-like" 还是 "file-like"，是由使用方决定的。

通过 `kubectl apply -f configmap.yaml` 部署，部署后可通过 `kubectl get cm -o
yaml` 查看详情。

那么部署后的 ConfigMap 要如何在 Pod 里引用呢？

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: configmap-demo-pod
spec:
  containers:
    - name: demo
      image: game.example/demo-game
      env:
        # Define the environment variable
        - name: PLAYER_INITIAL_LIVES # Notice that the case is different here from the key name in the ConfigMap.
          valueFrom:
            configMapKeyRef:
              name: game-demo           # The ConfigMap this value comes from.
              key: player_initial_lives # The key to fetch.
        - name: UI_PROPERTIES_FILE_NAME
          valueFrom:
            configMapKeyRef:
              name: game-demo
              key: ui_properties_file_name
      volumeMounts:
      - name: config
        mountPath: "/config"
        readOnly: true
  volumes:
    # You set volumes at the Pod level, then mount them into containers inside that Pod
    - name: config
      configMap:
        # Provide the name of the ConfigMap you want to mount.
        name: game-demo
```

可以看到，有几种引用方式：
- 通过 `valueFrom` 和 `configMapKeyRef` 引用单个配置项
- 通过 Pod 层的 `volumes` 和 container 层的 `volumeMounts` 将每个配置项挂载成
    Pod 里一个单独的文件。

## Namespace

命名空间
([Namespace](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/))
的作用是将隔离各种资源，像虚拟机一样虚拟一个集群。一般情况下不同 namespace 间
的资源是不共享的，如 Pod 只能引用同一个 namespace 下的 ConfigMap。

在配置 Deployment、Service 及 ConfigMap 等资源时，可以通过 `namespace` 字段指
定命名空间(需要提前创建)，如下例：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  namespace: load-balance  #<-- load-balance 为提前创建好的 namespace
  labels:
    app: nginx
#...
```

常用的命令：

* `kubectl get ns` 列出所有的 namespace
* `kubectl -n <my-ns> ...` 在执行其它命令时通过 `-n` 指定作用于某个 namespace
* `kubectl --all-namespaces ...` 在执行其它命令时指定作用于所有 namespace


## 小结

文章对 k8s 的一些基本概念做了简单的讲解：

* container 可以理解成一个 docker 实例，里面跑着一个程序/服务
* pod 是 container 的抽象，有自己的 IP，不同 pod 网络互通，与 container 可以是
    一对一，也可以一对多
* ReplicaSet 是对多副本 Pod 的抽象，会自动启动、停止 Pod 来达到目标副本数，一
    般不直接使用
* Deployment 是一个控制概念，会创建、更新 ReplicaSet 从而实现 Pod 的部署、升级
    、回退、扩缩容等
* Service 屏蔽 Pod 细节，提供了统一的、稳定的接口，有自己的虚拟 IP(ClusterIP)
    和端口，外部访问需要单独暴露接口（如 NodePort）
* ConfigMap 是对配置文件的管理，实现配置项和 Pod 的解耦，配置更新后需要重启
    Pod
* namespace 是对 k8s 集群的资源做一个隔离

K8s 的概念很多、功能也很丰富，本文是从基础使用的角度做一个介绍，尽量达到“不了
解细节，但工作够用”的程度。一些其它的概念(如 volumn)因为博主接触不多，这里也不
介绍了。

最后：本人非 k8s 专业人士，文中如果有错误，请在评论里指出，我会进行修正。

## 参考

* https://kubernetes.io/docs/concepts/ 官方教程
* [Kubernetes NodePort vs LoadBalancer vs Ingress? When should I use what?](https://medium.com/google-cloud/kubernetes-nodeport-vs-loadbalancer-vs-ingress-when-should-i-use-what-922f010849e0) Service 对外暴露的方法区别
* [kubernetes从入门到放弃3--(网络原理)](https://jiayi.space/post/kubernetescong-ru-men-dao-fang-qi-3-wang-luo-yuan-li) 相对底层的网络原理
* [Learn the Kubernetes Key Concepts in 10 Minutes](http://omerio.com/2015/12/18/learn-the-kubernetes-key-concepts-in-10-minutes/) 图文并茂，推荐
