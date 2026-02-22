# Code Proxy 前端管理后台（首版）

基于 `React 19.2 + Vite + Bun + Tailwind CSS v4 + oxlint + oxfmt` 的后台项目。

当前默认入口为你自研的 Tailwind 后台（`index.html` + `src/main.tsx` + `src/app/AppRouter.tsx`）。

当前已完成（业务功能对齐进行中）：

- 登录页（支持 API 地址与管理密钥登录）
- 鉴权守卫与会话恢复
- 后台布局（侧边栏 + 顶栏）
- 仪表盘（概览 + 快捷入口）
- 监控中心（KPI + 渠道统计 + 模型统计 + usage 快照导入/导出）
- 系统信息（连接/版本信息 + `/v1/models` 模型列表）
- 与参考项目一致的管理 API 前缀：`/v0/management`

说明：

- 参考项目代码（`src/pages/`、`src/components/`、`src/services/`、`src/stores/`、`src/i18n/` 等）目前仅作为“功能对齐参考”，不会替换你现有 UI 入口。

## 启动

```bash
bun install
bun run dev
```

开发时可直接访问：

- 业务管理后台（默认入口）：`http://localhost:5173/`

## 构建与检查

```bash
bun run lint
bun run format
bun run build
```

## 目录结构

```text
src/
  app/               # 路由与守卫
  lib/               # 常量、连接处理、HTTP 客户端与 API
  modules/
    auth/            # 鉴权 Provider
    dashboard/       # 仪表盘
    layout/          # 后台布局
    login/           # 登录页
    monitor/         # 监控中心
    system/          # 系统信息
    ui/              # 复合 UI 容器
    usage/           # 用量统计（当前复用监控视图）
  styles/            # 全局样式与主题变量
  # 参考项目业务功能（上游移植代码，仅用于对齐参考）
  assets/
  components/
  features/
  hooks/
  i18n/
  pages/
  router/
  services/
  stores/
  types/
  utils/
  management.tsx     # 历史多入口脚本（默认不再构建产物）
```

## 接口对齐说明

- API 基址自动规范为：`{apiBase}/v0/management`
- 登录校验：`GET /config`
- 监控数据：`GET /usage`
- 渠道映射：
  - `GET /openai-compatibility`
  - `GET /gemini-api-key`
  - `GET /claude-api-key`
  - `GET /codex-api-key`
  - `GET /vertex-api-key`
