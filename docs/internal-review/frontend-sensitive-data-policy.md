# Frontend Sensitive Data Policy

更新时间：2026-04-13

## 适用对象

- management key
- client API key
- provider API key
- OAuth code / access token / refresh token
- auth 文件原文
- 请求日志原文 / 响应原文 / 大模型输出明文

## 持久化规则

- 默认不持久化高敏值。
- 若产品需要长期登录态，必须设置显式过期时间，并允许主动清理。
- 高敏值不得写入 URL query、hash、可分享链接。
- sessionStorage / localStorage 只能存白名单字段，禁止直接写整页派生对象。

## 展示规则

- 默认脱敏展示，例如 key 只显示前后若干位。
- 错误消息、toast、调试面板、详情弹窗默认不得回显完整管理 key 或 provider key。
- 高敏原文展示必须显式操作触发，不做自动展开。
- 凭据类字段与日志/请求正文分开处理：API key、management key、token 等需要遮罩，但 `manage/monitor/request-logs` 与 `manage/logs` 的正文查看不得做通用截断、通用脱敏或内容改写。
- 请求详情需要同时支持源码与渲染模式，并保证完整 input/output 可见；性能优化应通过异步解析、分批渲染、按需加载实现，而不是删除正文。

## 下载规则

- auth 文件、日志原文、响应原文下载属于高敏操作。
- 优先使用后端附件流式响应。
- 若前端必须参与下载，优先 Blob，不把内容写回 URL。
- 高敏下载入口必须具备确认提示或足够明确的危险语义。

## 开发规则

- API 层统一使用 `src/lib/http/*`。
- 高敏数据的读取、写入、脱敏逻辑必须集中，不允许页面各自实现。
- 任何新增高敏存储行为，都必须在 PR 说明里写清用途、生命周期、清理方式和风险。
