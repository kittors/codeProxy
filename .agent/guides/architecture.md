# 架构与目录规范

本规范解释“代码放哪里、依赖怎么走、边界怎么守”，目标是：

- 页面与底层实现解耦（可维护）
- HTTP/API 统一出口（可控、可观测）
- 主题/鉴权/提示统一管理（避免重复与行为不一致）

## 1. 目录职责

```
src/
  main.tsx                 应用入口（挂载 React/Router）
  app/
    AppRouter.tsx          路由表与 Provider 组合
    guards/ProtectedRoute  鉴权守卫
  lib/
    constants.ts           全局常量（API 前缀、storage key 等）
    connection.ts          API base 规范化与计算
    http/
      client.ts            ApiClient（鉴权头、超时、错误解析、事件）
      apis.ts              业务 API 封装（页面唯一依赖入口）
      types.ts             与管理 API 对齐的类型与兼容字段
  modules/
    auth/                  认证状态与会话恢复（AuthProvider）
    layout/                后台布局（侧边栏/顶栏/Outlet）
    login/                 登录页
    monitor/               监控页与统计逻辑
    providers/             渠道/模型配置页
    config/                配置编辑与可视化
    oauth/                 OAuth 相关页
    logs/                  日志页
    quota/                 配额页
    ui/                    复用 UI 组件（Button/Input/Modal/Toast 等）
  styles/
    index.css              Tailwind 入口（仅 Tailwind 指令）
```

## 2. 依赖方向（必须遵守）

推荐依赖方向：

```
Pages（modules/*Page.tsx）
  → modules/ui（复用组件）
  → modules/*Provider（Auth/Theme/Toast 等）
  → lib/http/apis.ts（业务 API）
  → lib/http/client.ts（HTTP 机制）
  → lib/constants.ts / lib/connection.ts
```

禁止反向依赖：

- `lib/*` **禁止** import `modules/*`
- `lib/http/client.ts` **禁止** 引入页面层逻辑（只负责通用机制）

## 3. Provider 与全局事件

### 3.1 AuthProvider

职责：

- 会话恢复（localStorage snapshot）
- 设置 `apiClient` 配置（apiBase + managementKey）
- 监听 `unauthorized` 事件统一退出登录态

注意：

- 页面不要自己“遇到 401 就跳登录”——统一走事件机制
- 管理密钥属于敏感信息，不要打印/写进错误提示

登录与会话恢复的推荐心智模型：

```
AppRouter 挂载
  → AuthProvider bootstrap()
     → 读取 localStorage snapshot（若用户选择记住）
     → apiClient.setConfig(apiBase, managementKey)
     → 若有 key：请求 GET /config 验证
        - 成功：isAuthenticated = true
        - 失败：清理 snapshot，回到未登录态
```

### 3.2 ThemeProvider

职责：

- 从 localStorage / 系统主题恢复 mode
- 通过 `document.documentElement.classList.toggle("dark")` 切换主题

注意：

- 主题切换必须依赖 `dark:` 变体；不要引入 CSS 变量主题系统

额外约束：

- 主题切换的 DOM 副作用应当幂等（重复调用不产生累积效果）
- 主题切换动效必须可降级（`startViewTransition` 不可用时正常工作）

### 3.3 ToastProvider

职责：

- 统一 toast 展示与生命周期
- 页面层只负责传递用户可理解的中文消息

### 3.4 全局事件清单（约定）

目前项目使用的全局事件：

- `unauthorized`：HTTP 401 时由 `ApiClient` 派发
- `server-version-update`：响应头包含版本/构建时间时由 `ApiClient` 派发

规则：

- 事件命名使用 kebab-case
- 事件 payload（CustomEvent.detail）必须是可序列化的简单对象
- 事件监听/移除必须成对出现，且写在 `useEffect` 的清理函数中

## 4. UI 组件复用策略

优先复用 `src/modules/ui/*`：

- Button/Input/Modal/ConfirmModal/ToastProvider/Tooltip/Card 等

规则：

- 新页面先拼装已有组件，只有“确实无法表达”时才新增 UI 组件
- 新 UI 组件必须：
  - 只用 Tailwind class（禁止原生 CSS/内联 style）
  - 提供可访问性属性（至少 `aria-*` 与可聚焦行为）
  - props 尽量小而清晰（避免布尔 prop 泛滥）

建议：

- 与主题相关的组件尽量通过 `useTheme()` 获取 mode，而不是读 DOM class
- 与网络相关的组件不要自行持有 managementKey 等敏感信息；从 AuthProvider 的 state/meta 获取必要信息即可

## 5. 模块新增/调整的建议

新增一个“业务模块”时，优先：

1. 新建 `src/modules/<feature>/<Feature>Page.tsx`
2. 复用/扩展 `src/modules/ui/*`
3. 若需要接口：
   - 在 `lib/http/types.ts` 补齐类型
   - 在 `lib/http/apis.ts` 新增封装函数

不要：

- 为了一个页面引入新的全局状态库
- 在页面里实现一套新的请求封装或错误解析
