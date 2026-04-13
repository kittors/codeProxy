# Frontend Maintenance Spec

更新时间：2026-04-13

## 文件与目录

- 页面主文件目标 `400-600` 行。
- 超过 `800` 行必须新增拆分任务。
- 超过 `1200` 行禁止继续堆功能。
- 复杂模块必须采用：

```text
modules/<feature>/
  <Feature>Page.tsx
  components/
  hooks/
  helpers/
  types.ts
  constants.ts
  __tests__/
```

## 状态分层

- 纯 UI 状态留在页面或组件。
- 请求状态、缓存状态、轮询状态下沉到 feature hooks。
- 派生统计与映射放到 helpers。
- 跨页面共享才进入 store。

## API 与类型

- 运行期网络层只使用 `src/lib/http/*`。
- 后端契约类型只使用 `src/lib/http/types.ts`。
- 禁止重新引入旧 `src/services/api/*`、`useAuthStore`、`useConfigStore`、`useModelsStore`、`secureStorage`。
- 页面内禁止直接拼复杂 API 请求；请求编排必须进入 API 层或 feature hooks。
- 迁移期遗留目录必须在目录级说明“禁止新增依赖”和下线目标。

## 安全

- 管理 key、API key、OAuth code 不得进入 URL query/hash。
- 高敏数据默认不写入本地缓存。
- 本地缓存必须先定义白名单字段与最大体积，禁止整页派生对象直接落盘。
- 允许长期登录态时必须有显式过期时间和清理策略。
- auth 文件、日志原文、原始响应下载属于高敏操作，必须有确认和最小化返回策略。

## 注释

必须写：

- 协议兼容
- 安全边界
- 性能边界
- 业务规则
- 迁移兼容

禁止写：

- 只翻译函数名的注释
- 与代码不一致的注释
- 行级噪音注释

## 测试

- helper 必须单测。
- hooks 涉及缓存、定时器、权限或脱敏时必须单测。
- 大页面拆分时按功能域补测试，不允许事后补。

## 性能

- 保留路由级懒加载。
- ECharts、Markdown、CodeMirror、语法高亮按交互懒加载。
- 超大 JSON / SSE / Markdown 内容必须有阈值控制。
- 本地缓存必须有体积预算和写入频率控制。
- 新增依赖如果引入超过 `50 kB gzip` 的额外体积，必须在变更说明中写明理由、替代方案和拆包策略。
