# 日志与可观测性（前端）

目标：

- 排错时能定位问题（对开发者有用）
- 不泄露敏感信息（对用户安全）
- 不污染控制台（对维护友好）

## 1. 默认策略：少打日志

原则：

- 没有明确排错需求时，不新增 `console.*`
- 需要日志时，优先在“开发阶段临时使用”，在交付前移除

## 2. 禁止打印敏感信息（强制）

以下内容禁止出现在控制台输出中：

- 管理密钥、provider key、cookie、OAuth code/state
- 可能包含密钥的 header（尤其是 Authorization）
- 用户粘贴的完整配置文本（可能含密钥）

## 3. 推荐的替代方式

当需要让用户“看到发生了什么”时：

- 用页面内状态或 toast 提示（中文、可行动）
- 错误细节如需展示，做截断/脱敏（见 `security.md` 与 `error-handling.md`）

## 4. 与 ApiClient 的可观测性配合

`ApiClient` 已内建：

- 401 事件：`unauthorized`
- 版本信息事件：`server-version-update`

页面与 Provider 应优先基于这些事件更新 UI，而不是靠控制台调试输出。

