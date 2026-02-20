# Code Proxy 项目开发指南（Claude Code 入口）

> Code Proxy 前端管理后台：React 19 + Vite + Bun + Tailwind CSS v4

## 项目概述

本项目是 Code Proxy 的管理控制台前端，包含：

- 登录（API 地址 + 管理密钥）
- 鉴权守卫与会话恢复
- 后台布局（侧边栏 + 顶栏）
- 监控中心（KPI、渠道统计、模型统计、请求日志等）
- 与管理 API 对齐的前缀：`/v0/management`

## 技术栈

- React 19.2 + React Router DOM
- TypeScript（strict）
- Vite
- Bun
- Tailwind CSS v4（`@tailwindcss/vite`）
- oxlint / oxfmt
- ECharts

## 常用命令

```bash
bun install
bun run dev
bun run lint
bun run format
bun run build
bun run check
```

## ⚠️ 重要安全规则（必须遵守）

### Git 操作限制

- 禁止任何会访问或修改远程仓库的 Git 操作（`fetch/pull/push`、改 remote 等），除非用户明确同意并指定目标。
- 禁止任何可能覆盖/丢弃本地未提交改动的操作（`reset/clean/restore/stash/rebase` 等），除非用户明确同意。

### 敏感信息限制

- 禁止在日志、toast、报错、提交信息中输出任何真实密钥/Token（包含管理密钥与 provider key）。

## 样式与主题（强制）

- 禁止原生 CSS / CSS Modules / 内联 style
- 只允许 Tailwind v4 utility class
- dark 主题仅允许通过切换 `html` 的 `dark` class 驱动 `dark:` 变体

## 渐进式规范（按需读取）

本仓库的详细开发规范是“按需阅读”的，单一来源位于：

- `.agent/guides/README.md`

常见场景 → 读取文件：

| 场景                      | 读取文件                          |
| ------------------------- | --------------------------------- |
| 初始化开发环境 / 工具链   | `.agent/guides/engineering.md`    |
| 开始开发一个任务          | `.agent/guides/workflow.md`       |
| 设计/新增模块与分层       | `.agent/guides/architecture.md`   |
| 新增/调整管理 API 封装    | `.agent/guides/http-api.md`       |
| 错误处理、toast、401 失效 | `.agent/guides/error-handling.md` |
| Tailwind v4 / Dark / 动效 | `.agent/guides/tailwind.md`       |
| 安全与脱敏                | `.agent/guides/security.md`       |
| 提交规范与 Git 安全规则   | `.agent/guides/git.md`            |
