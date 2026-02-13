# 管理 API 规范（/v0/management）

本规范约束“如何正确地调用与封装管理 API”，目标是：

- 页面层无 `fetch`、无 URL 拼接、无重复错误处理
- API 变更时改动集中、类型可对齐、行为一致

## 1. 基址规则

### 1.1 前缀固定

- 管理 API 前缀固定为：`/v0/management`
- 常量来源：`src/lib/constants.ts` 的 `MANAGEMENT_API_PREFIX`

### 1.2 用户输入的 API 地址规范化

规范化逻辑在 `src/lib/connection.ts`：

- 允许用户输入 `localhost:8317`，会补全为 `http://localhost:8317`
- 会移除末尾重复的 `/v0/management`
- 会移除尾部多余 `/`

页面展示“连接地址”时应使用规范化后的值，避免误导用户。

## 2. API 封装的唯一入口

页面/组件调用接口的唯一入口：

- `src/lib/http/apis.ts`

HTTP 机制的唯一入口：

- `src/lib/http/client.ts`（`ApiClient`）

禁止：

- 页面直接 `fetch(...)`
- 页面直接 new `URL(...)` 拼接 query（用 `RequestOptions.params`）
- 页面自己解析错误 payload 或自己处理 401

## 3. 类型定义与兼容策略

类型文件：

- `src/lib/http/types.ts`

兼容策略（必须遵守）：

- 后端字段可能出现 `kebab-case` / `snake_case` / `camelCase` 混用
- types.ts 可以保留多个可选字段，并在 apis.ts 做归一化

原则：

- 类型用“宽入口、窄出口”：外部输入宽松，页面拿到的结构尽量稳定

## 4. ApiClient 行为约定（你必须理解）

`ApiClient` 的关键行为：

- 自动设置 `Authorization: Bearer <managementKey>`（若已配置）
- 默认超时：`REQUEST_TIMEOUT_MS`
- HTTP 401 会触发 `window.dispatchEvent(new Event("unauthorized"))`
- 会从响应头读取版本信息并触发 `server-version-update`（用于 UI 展示）
- 会尝试解析错误 body：优先提取 `error`/`message` 字段，否则回退到纯文本

页面层的责任：

- 捕获异常后，展示中文 toast/页面错误
- 不要吞错，也不要把密钥拼进错误信息

## 4.1 RequestOptions 使用规范

`ApiClient` 支持的请求选项（见 `src/lib/http/client.ts`）：

- `params`：query 参数（会过滤 `undefined/null`）
- `headers`：额外 header（谨慎使用，避免覆盖全局约定）
- `timeoutMs`：超时（默认 `REQUEST_TIMEOUT_MS`）
- `signal`：外部 AbortSignal（用于组件卸载时取消）

规则：

- query 参数必须用 `params`，不要手拼 `?a=b`
- 页面卸载后不应继续 setState：复杂场景建议用 `signal` 取消请求，或在 effect 清理中做保护

## 4.2 ResponseType 与下载/上传

常见调用：

- JSON：`apiClient.get<T>(...)`（默认）
- 文本：`apiClient.getText(...)`
- 二进制：`apiClient.getBlob(...)`
- 表单：`apiClient.postForm(...)`

规则：

- 上传/导入配置类能力优先使用 `FormData`（如服务端支持）
- 若要上传原始文本，使用 `putRawText` 并明确 `Content-Type`（由调用方决定）

## 5. 新增一个 API 的标准步骤

1. 在 `src/lib/http/types.ts` 补齐返回/请求类型
2. 在 `src/lib/http/apis.ts` 增加封装函数
3. 页面只 import `apis.ts` 的函数，不 import `apiClient`
4. UI 展示：
   - loading 与异步生命周期绑定
   - 错误提示中文且不泄露敏感信息

## 7. apis.ts 的职责边界（强制）

`src/lib/http/apis.ts` 不仅是“转发请求”，它还负责：

- **数据归一化**：后端字段命名差异（kebab/snake/camel）在此消化
- **容错**：缺失字段时给出合理默认值（例如空数组/空对象）
- **序列化规则**：把前端稳定结构转成服务端期望结构（例如 `excluded-models`）

页面层只处理“业务显示逻辑”，不要重复归一化。

## 6. 现有接口清单（以 apis.ts 为准）

说明：接口可能随服务端演进，最终以 `src/lib/http/apis.ts` 为准。

- 配置：`GET /config`
- 监控：`GET /usage`
- 渠道映射：`/openai-compatibility`、`/gemini-api-key`、`/claude-api-key`、`/codex-api-key`、`/vertex-api-key`
- 配置项更新：`PUT /debug`、`PUT /proxy-url`、`PUT /request-retry` 等
