# 代理池管理设计

## 背景

当前系统已经支持全局 `proxy-url`，也支持供应商配置和认证文件上的 `proxy-url`。这些字段能解决单点代理，但无法复用、统一检测或批量切换代理。新增“代理管理”后，用户可以集中维护 HTTP、HTTPS、SOCKS5 等代理，并将供应商或认证文件绑定到代理池条目。

## 目标

- 管理端新增“代理管理”菜单项和页面，风格与现有后台页面保持一致。
- 后端新增代理池配置模型、管理 API 和代理可用性检测 API。
- 供应商配置与认证文件新增 `proxy-id` 引用能力，并兼容现有 `proxy-url` 字段。
- 运行时出站请求优先使用绑定的 `proxy-id`，解析不到时回退到原有 `proxy-url` 和全局 `proxy-url`。

## 非目标

- 不实现自动测速排序或代理负载均衡。
- 不引入新的数据库依赖；代理池随 YAML 配置持久化。
- 不改变现有 `proxy-url` 行为，旧配置继续可用。

## 数据模型

后端配置新增 `proxy-pool`：

```yaml
proxy-pool:
  - id: hk-1
    name: 香港代理 A
    url: socks5://user:pass@127.0.0.1:1080
    enabled: true
    description: Codex 专用出口
```

供应商和认证文件新增可选 `proxy-id`。当 `proxy-id` 存在且能解析到启用代理时使用代理池 URL；否则使用当前对象的 `proxy-url`；再否则使用全局 `proxy-url`。

## API

- `GET /management/proxy-pool`：返回代理池条目，敏感信息脱敏。
- `PUT /management/proxy-pool`：替换代理池。
- `POST /management/proxy-pool/check`：检测一个代理池条目或临时 URL 是否可访问测试 URL。
- 现有供应商配置 API 和认证文件字段更新 API 接受 `proxy-id`。

检测默认访问 `https://www.gstatic.com/generate_204`，超时 8 秒。返回状态包含 `ok`、`statusCode`、`latencyMs` 和 `message`。

## 前端

新增 `src/modules/proxies/` 聚合代理管理页面、类型和小型纯函数。页面复用现有卡片、按钮、输入框、空状态、确认弹窗和 Toast 风格：

- 顶部为标题、说明、添加按钮和刷新/批量检测入口。
- 主区域为代理条目列表，展示名称、协议、脱敏地址、启用状态、最近检测状态与操作。
- 编辑弹窗包含名称、协议 URL、启用状态、说明。
- 供应商和认证文件编辑表单新增“从代理池选择”控件，同时保留手动 `proxy-url`。

## 错误处理

- URL 必须包含协议和 host，协议仅允许 `http`、`https`、`socks5`。
- `id` 由后端规范化生成或由前端提交稳定值，必须唯一。
- 删除仍被引用的代理时，前端提示影响范围；后端不阻止删除，运行时会回退到 `proxy-url` 或全局代理，避免请求硬失败。
- 检测失败只记录状态，不自动禁用代理。

## 测试

- 后端：配置序列化/规范化、管理 API CRUD、检测接口、运行时代理解析优先级、认证文件 `proxy-id` patch。
- 前端：API 序列化、代理管理页增删改查和检测交互、菜单/路由可达、供应商和认证文件表单可选择代理池。

