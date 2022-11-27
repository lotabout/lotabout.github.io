title: 记一次 BUG 定位：时钟偏移引起 K8S 鉴权失败
toc: true
date: 2022-11-27 17:08:36
tags: [BUG, k8s, ServiceAccount, JWT]
categories: [Notes]
---

## 先上结论

1. K8S 中使用 ServiceAccount 时，内部本质上是用 JWT 做校验
2. JWT 中的 `nbf` 字段代表 token 的“开始时间”。开始时间不得早于“机器当前时间”，
   实际允许有 1min 偏差
3. 如果集群节点的时钟偏差(clock skew)超过 1min，可能出现 A 节点签发的 token 开
   始时间过早，导致 token 在 B节点校验失败

## 排查过程

### 显示 SA 没权限，但 SA 配置都正确

在 k8s 上启动的任务，会通过 fabric8.io java client 创建 SparkApplication 的
Custom Resource(CR)。然而某一天开始，测试环境提交的任务全都失败，报下面的错误：

```
Exception in thread "main" io.fabric8.kubernetes.client.KubernetesClientException: Failure executing: GET at: https://10.233.0.1/api/v1/namespaces/.../pods/xxx-pod. Message: Unauthorized! Configured service account doesn't have access. Service account may have been revoked. Unauthorized.
        at io.fabric8.kubernetes.client.dsl.base.OperationSupport.requestFailure(OperationSupport.java:682)
        at io.fabric8.kubernetes.client.dsl.base.OperationSupport.requestFailure(OperationSupport.java:661)
        at io.fabric8.kubernetes.client.dsl.base.OperationSupport.assertResponseCode(OperationSupport.java:610)
        at io.fabric8.kubernetes.client.dsl.base.OperationSupport.handleResponse(OperationSupport.java:555)
        at io.fabric8.kubernetes.client.dsl.base.OperationSupport.handleResponse(OperationSupport.java:518)
        at io.fabric8.kubernetes.client.dsl.base.OperationSupport.handleGet(OperationSupport.java:487)
        at io.fabric8.kubernetes.client.dsl.base.OperationSupport.handleGet(OperationSupport.java:457)
        at io.fabric8.kubernetes.client.dsl.base.BaseOperation.handleGet(BaseOperation.java:698)
        at io.fabric8.kubernetes.client.dsl.base.BaseOperation.getMandatory(BaseOperation.java:184)
        at io.fabric8.kubernetes.client.dsl.base.BaseOperation.get(BaseOperation.java:151)
        at io.fabric8.kubernetes.client.dsl.base.BaseOperation.get(BaseOperation.java:83)
        ...
```

由于近期刚做过部署操作，开始怀疑是不是 SA 配置错了。于是人肉检查 SA

- get pod 检查 `serviceAccount` 和 `serviceAccountName` 的值都是符合预期的。
- `get clusterrole` 和 `get rolebinding -n <namespace>` 检查都是正确的

### 发现跟节点有关系

SA 检查无误，于是想先抓包看看是不是网络相关的问题，在 `get pods -o wide` 时发
现所有任务都调度到 `node2` 这个节点。于是先把 `node2` 下掉，直接搜了个命令：

```
kubectl taint nodes node2 key1=value1:NoSchedule
```

新起的任务调度到 `node1` 后发现任务都 OK。因为暂时还在搞其它事情，把这个问题汇
报给 SRE 同事，就暂停了。

### sleep 40s 后能跑过

SRE 同事做了一些尝试，发现有即使在 node2 提交，偶尔也是能通过的。期间有两个怀
疑：

1. SA 是不是过期了，但搜了搜发现一般时间还是挺长的，应该不是这个问题
2. 由于任务是由 argo workflow 提交的，开始怀疑是不是 argo 的问题（命令是
   argoexec 运行的）

另外 SRE 同事试着在命令执行前增加 `sleep 40s` 发现就能提交通过。


### 修改系统时间确认相关，但解释不通

在查资料时有提到是不是有同步问题，于是灵光一闪会不会跟系统时间有关，一查，两台
节点的时间差是大约是 1min30s。于是把时间拔到 1min 内，发现提交的任务正常了。于
是确定是和系统时间相关。但是具体的机制搞不清楚。

```
sudo date $(date +%m%d%H%M%Y.%S -d '-1 minutes')
```

### 更多测试

期间已经把测试的内容把成单纯的 curl:

```
       find / -name "*.crt"
       TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
1. 401 curl -vik --header "Authorization: Bearer ${TOKEN}" -k https://node1:6443/api/v1/namespaces/.../pods/..
2. 404 curl -vik --header "Authorization: Bearer ${TOKEN}" -k https://node2:6443/api/v1/namespaces/.../pods/..
       sleep 30
3. 404 curl -vik --header "Authorization: Bearer ${TOKEN}" -k https://node1:6443/api/v1/namespaces/.../pods/..
4. 404 curl -vik --header "Authorization: Bearer ${TOKEN}" -k https://node2:6443/api/v1/namespaces/.../pods/..
       find / -name "*.crt"
```

这里有一个失误，这个 curl 用的 API 即使成功也是 404, 导致在测试的过程中会有误
判，实际上测试结果 #2 几乎都是 404, 但有时候会看成是 401. 也尝试人工进入 pod
执行 curl，都是通的，想不通开始的 30s 究竟触发了什么机制导致认证失败。

401 的 curl 如下所示：

```
* ALPN, offering h2
* ALPN, offering http/1.1
* successfully set certificate verify locations:
*  CAfile: /etc/ssl/certs/ca-certificates.crt
*  CApath: /etc/ssl/certs
} [5 bytes data]
* TLSv1.3 (OUT), TLS handshake, Client hello (1):
} [512 bytes data]
* TLSv1.3 (IN), TLS handshake, Server hello (2):
{ [122 bytes data]
* TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):
{ [15 bytes data]
* TLSv1.3 (IN), TLS handshake, Request CERT (13):
{ [105 bytes data]
* TLSv1.3 (IN), TLS handshake, Certificate (11):
{ [1002 bytes data]
* TLSv1.3 (IN), TLS handshake, CERT verify (15):
{ [264 bytes data]
* TLSv1.3 (IN), TLS handshake, Finished (20):
{ [52 bytes data]
* TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):
} [1 bytes data]
* TLSv1.3 (OUT), TLS handshake, Certificate (11):
} [8 bytes data]
* TLSv1.3 (OUT), TLS handshake, Finished (20):
} [52 bytes data]
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384
* ALPN, server accepted to use h2
* Server certificate:
*  subject: CN=kube-apiserver
*  start date: Nov  7 08:38:44 2022 GMT
*  expire date: Nov  7 08:38:45 2023 GMT
*  issuer: CN=kubernetes
*  SSL certificate verify result: unable to get local issuer certificate (20), continuing anyway.
* Using HTTP2, server supports multi-use
* Connection state changed (HTTP/2 confirmed)
* Copying HTTP/2 data in stream buffer to connection buffer after upgrade: len=0
} [5 bytes data]
* Using Stream ID: 1 (easy handle 0x55975bd06560)
} [5 bytes data]
> GET /api/v1/namespaces/argo-run/pods/4622-4622-import-529855050 HTTP/2
> Host: 172.27.128.212:6443
> user-agent: curl/7.74.0
> accept: */*
> authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6ImhGdk15S3F6REdtUkdXMUprelhzRTF0RHJuT2kwdlhrQWktdnphclJSSG8ifQ.eyJhdWQiOlsiaHR0cHM6Ly9rdWJlcm5ldGVzLmRlZmF1bHQuc3ZjLmt1YmVybmV0ZXMiXSwiZXhwIjoxNzAxMDcyODQxLCJpYXQiOjE2Njk1MzY4NDEsImlzcyI6Imh0dHBzOi8va3ViZXJuZXRlcy5kZWZhdWx0LnN2Yy5rdWJlcm5ldGVzIiwia3ViZXJuZXRlcy5pbyI6eyJuYW1lc3BhY2UiOiJhcmdvLXJ1biIsInBvZCI6eyJuYW1lIjoianotMjAtNTY0My01NjQzLWltcG9ydC0zOTY2MDk2NDU0IiwidWlkIjoiOTM1NzY3M2UtNWNiMi00YjVkLTk1NDAtYTM4NDY1YTE5YWQ2In0sInNlcnZpY2VhY2NvdW50Ijp7Im5hbWUiOiJsb29mYWgiLCJ1aWQiOiI0ZTM1ZDIwZi01OGI3LTQxNWItOGZhMS01YTk5MjlkM2YyZWEifSwid2FybmFmdGVyIjoxNjY5NTQwNDQ4fSwibmJmIjoxNjY5NTM2ODQxLCJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6YXJnby1ydW46bG9vZmFoIn0.bfxySo3e2rT3mToSEmSN5Pmi4YI4X2kE4aXA_BVIPyrg8DKc9pDUFEo_kvS608pm0u5b7e7wG3A48upBUjtm2uAMwEYiDqSLning7kCdycXT1-_aXVQjeASio4dZL6w3ddi_JGyFoZA76e9cQVfaWB9PGenKlg2uJXe5xFNJA12EuCvXgTLC7rXrNZIPksI0ZR6bRBt2ENWf_aaYPLTE7H7g8TJlYfP__H5DBaBr6sRkO15q8mCKpEyIqCx-t9mf6pCWfJ3D2KOBMc01n8g55EUvlaPDFngn5eV3izfMxuJADB4QqrVt_-mIgpPbJr3j3H5wYHmzcCSvTVg_Cp32Zg
>
{ [5 bytes data]
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
{ [146 bytes data]
* Connection state changed (MAX_CONCURRENT_STREAMS == 250)!
} [5 bytes data]
< HTTP/2 401
< audit-id: 1bdd5211-54ea-4b3e-ac14-d7716730166a
< cache-control: no-cache, private
< content-type: application/json
< content-length: 165
< date: Sun, 27 Nov 2022 08:12:15 GMT
<
{ [5 bytes data]
100   165  100   165    0     0  11785      0 --:--:-- --:--:-- --:--:-- 12692
* Connection #0 to host 172.27.128.212 left intact
HTTP/2 401
audit-id: 1bdd5211-54ea-4b3e-ac14-d7716730166a
cache-control: no-cache, private
content-type: application/json
content-length: 165
date: Sun, 27 Nov 2022 08:12:15 GMT

{
  "kind": "Status",
  "apiVersion": "v1",
  "metadata": {

  },
  "status": "Failure",
  "message": "Unauthorized",
  "reason": "Unauthorized",
  "code": 401
}

```

接下来走了个弯路，因为看到日志时的 `HTTP/2 401`，扫了一眼看到是中间 Debug 日志
输出，就以为是 TLS 握手的过程中出的错。中途 Debug 了很久 TLS 相关的内容。后来
看 k8s apiserver 的日志才恍然大悟这个 401 是 apiserver 给出来的。

```
E1123 11:53:33.385964       1 claims.go:126] unexpected validation error: *errors.errorString
E1123 11:53:33.386042       1 authentication.go:63] "Unable to authenticate the request" err="[invalid bearer token, Token could not be validated.]"
```

### JWT 有 1min 差异，但时间是在哪定义的？

找到是 K8S 的问题，就去找 k8s 的日志，找了很长时间找到了

- [错误位置](https://github.com/kubernetes/kubernetes/blob/release-1.21/pkg/serviceaccount/claims.go#L126) 显示它是在校验 JWT 的 public claims 里的时间字段，和当前字段是否一致
- 在[校验时](https://github.com/kubernetes/kubernetes/blob/release-1.21/vendor/gopkg.in/square/go-jose.v2/jwt/validation.go#L97) 默认会有 1min 的余地

并且看代码它会对比 JWT 里的 `NotBeforeTime` 字段。于是通过 `get secrets` 拿到
token，并在 [jwt.io](https://jwt.io/) 里解析，奇怪的是并没有看到时间相关的字段

```
k -n <ns> get secret <SA-secret-name> -o jsonpath='{.data.token}' | base64 --decode
```

payload 如下

```json
{
  "iss": "kubernetes/serviceaccount",
  "kubernetes.io/serviceaccount/namespace": "...",
  "kubernetes.io/serviceaccount/secret.name": "...",
  "kubernetes.io/serviceaccount/service-account.name": "...",
  "kubernetes.io/serviceaccount/service-account.uid": "4e35d20f-58b7-415b-8fa1-5a9929d3f2ea",
  "sub": "system:serviceaccount:argo-run:loofah"
}
```

这里其实又有个失误，其实很早之前就已经在 pod 里打印出 pod 里读到的 token，但一
直以为 pod 里拿到的 token 和 `get secrets` 的结果是一样的。对比了半天才发现它
们不一样，终于找到时间字段：

```json
{
  "aud": [
    "https://kubernetes.default.svc.kubernetes"
  ],
  "exp": 1701074189,
  "iat": 1669538189,
  "iss": "https://kubernetes.default.svc.kubernetes",
  "kubernetes.io": {
    "namespace": "argo-run",
    "pod": {
      "name": "...",
      "uid": "d7f59189-7050-4922-804f-075e5411b950"
    },
    "serviceaccount": {
      "name": "...",
      "uid": "4e35d20f-58b7-415b-8fa1-5a9929d3f2ea"
    },
    "warnafter": 1669541796
  },
  "nbf": 1669538189,
  "sub": "system:serviceaccount:..."
}
```

通过查 JWT 的说明知道 `nbf` 字段就是 `NotBefore` 的时间。对比实际的值也发现和
`node2` 运行任务的时间非常接近。终于破案。

## 情况复盘

1. B 节点的时间比 A 节点快 1min30s
2. 任务被调度到 B 节点，B 节点的 kubelet 为 Pod 生成 SA token，token 的 `nbf`
   时间为 B 节点的当前时间。（这里应该是创建 token 的请求会发往 B 的 apiserver，
   目前没找到方法验证）
3. B 节点里需要访问 apiserver，会访问 `kubernetes.default`，请求被路由到节点 A
4. A 节点在校验 JWT 时发现 token 的 `nbf` 在 A 节点当前时间+ 1min 之后，拒绝请求

## 小结

这个问题从断断续续排查了近一周，中间还是有不少失误

1. 构造测试用例，结果的判断最好清晰明确，这次排查依赖看结果是 401 还是 404, 看
   错了好几次，影响判断
2. 有条件的话，一些现象要相互印证。中途跑去怀疑 TLS 握手浪费了不少时间
3. 数据和信息要贴源，因为没有识别出 `get secrets` 和 pod 里 token 的区别，又浪
   费了半天时间
4. 底层机制是会咬人的，从方案和运维的视角，要会机制上防止出现相关问题，太难查了
