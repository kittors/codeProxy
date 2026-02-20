<INSTRUCTIONS>
你正在为 `codeProxy` 仓库工作。本文件是 **Codex 的项目入口规范（渐进式）**：

- 本文件只包含“必须遵守的强制规则 + 快速索引”
- 详细规范按需读取 `.agent/guides/*`（单一来源），不要一次性加载全部
- `.claude/guides/*` 为兼容目录（Claude Code 习惯路径），内容仅做跳转指引

所有沟通与输出 **只允许使用中文**（包括解释、注释、文档、UI 文案与报错文案）。

# Code Proxy 前端管理后台｜开发规范（Codex 入口）

最后更新：2026-02-13

## 0. 项目概述（你需要知道的事实）

- 这是 Code Proxy 的管理控制台前端（React + Vite + Bun + Tailwind v4）
- 管理 API 前缀固定为：`/v0/management`（见 `src/lib/constants.ts`）
- 路由入口：`src/app/AppRouter.tsx`，鉴权守卫：`src/app/guards/ProtectedRoute.tsx`
- 主题切换：`src/modules/ui/ThemeProvider.tsx`（通过 `html` 的 `dark` class）
- HTTP 客户端：`src/lib/http/client.ts`，接口封装：`src/lib/http/apis.ts`

## 1. 常用命令（唯一可信来源：package.json scripts）

```bash
bun install
bun run dev        # 本地开发（Vite）
bun run lint       # 代码检查（oxlint）
bun run format     # 格式化（oxfmt）
bun run build      # tsc --noEmit + vite build
bun run check      # lint + build（建议提交前）
```

## 2. 渐进式规范索引（按需读取）

先读索引：`.agent/guides/README.md`

常见场景 → 读取文件：

| 场景                           | 读取文件                               |
| ------------------------------ | -------------------------------------- |
| 初始化开发环境 / 工具链        | `.agent/guides/engineering.md`         |
| 开发新功能 / 准备 PR（如需要） | `.agent/guides/feature-pr-workflow.md` |
| 开始开发一个任务               | `.agent/guides/workflow.md`            |
| 设计/新增模块与分层            | `.agent/guides/architecture.md`        |
| 新增/调整管理 API 封装         | `.agent/guides/http-api.md`            |
| 实现复杂交互/列表/表单         | `.agent/guides/patterns.md`            |
| 命名、文件组织、导出风格       | `.agent/guides/naming.md`              |
| 错误处理、toast、401 失效      | `.agent/guides/error-handling.md`      |
| Tailwind v4 / Dark / 动效      | `.agent/guides/tailwind.md`            |
| UI 视觉一致性与组件复用        | `.agent/guides/ui-design.md`           |
| 安全与敏感信息（管理密钥等）   | `.agent/guides/security.md`            |
| 日志与可观测性（前端）         | `.agent/guides/logging.md`             |
| 测试与验证策略                 | `.agent/guides/testing.md`             |
| 提交规范与 Git 安全规则        | `.agent/guides/git.md`                 |
| 规范需要变更/演进              | `.agent/guides/evolution.md`           |

## 3. 强制规则速查（必须遵守）

### 3.1 Git 操作安全规范（必须遵守）

- 严禁执行任何会访问或修改远程仓库的 Git 操作（包括但不限于 `git fetch/pull/push`、配置/变更 remote 等），除非用户明确同意并指定目标与期望结果。
- 严禁执行任何可能覆盖/丢弃本地未提交改动的“回滚/重置/清理”操作（包括但不限于 `git checkout -- <path>`、`git restore`、`git reset`、`git clean`、`git rebase`、`git merge --abort`、`git stash` 等），除非用户明确同意。
- 如确需执行上述 Git 操作，必须先用中文说明：将要执行的命令、影响的文件范围、是否会丢失未提交内容、以及替代方案；得到用户确认后方可执行。

### 3.2 禁止泄露敏感信息（必须遵守）

- **禁止** 在日志、toast、报错、提交信息、截图文本中包含 `MANAGEMENT_KEY` 或任何真实密钥/Token
- **禁止** 在代码里硬编码密钥/私有地址；需要示例时使用占位符（如 `sk-***`、`http://localhost:8317`）

### 3.3 API 分层（必须遵守）

- 页面/组件 **禁止** 直接散落地写 `fetch`/拼接 URL（统一走 `src/lib/http/client.ts` + `src/lib/http/apis.ts`）
- 401 失效 **禁止** 各处自行处理：由 `ApiClient` 触发 `unauthorized` 事件，`AuthProvider` 统一响应

## 4. 前端样式规范（必须遵守）

0. Git 操作安全规范（必须遵守）
   - 见上文“3.1 Git 操作安全规范”。样式相关改动同样禁止使用破坏性 Git 操作来“回滚解决”。

1. 禁止任何“原生 CSS”写法
   - 不允许新增/修改任何自定义 CSS 选择器（如 `.xxx {}`、`:root {}`、`@media`、`@keyframes`、`::view-transition-*` 等）。
   - 不允许使用 CSS 变量方案来实现“主题切换”（如 `var(--xxx)`、`.dark { --xxx: ... }`）。如需新增设计令牌，仅允许通过 `@theme` 声明，并通过 Tailwind utility 消费。
   - 不允许使用独立的 CSS Modules / SCSS / LESS。
   - 不允许使用任何内联样式（如 JSX 的 `style={{ ... }}`）或注入 `<style>` 标签。

2. 只允许使用 Tailwind CSS v4
   - 所有样式必须通过 Tailwind v4 的 utility class 在 JSX/TSX 的 `className` 中完成。
   - light / dark 主题必须使用 Tailwind v4 的 `dark:` 变体实现。
   - 主题切换仅允许通过给 `html`（或 `body`）切换 `dark` class 来驱动 `dark:` 变体（参考 `src/modules/ui/ThemeProvider.tsx`）。

3. 前端交互：最小变化原则（必须遵守）
   - UI 更新应尽量“局部更新”，避免不必要的整块重渲染/整页重排（例如：刷新数据时不要通过 `key` 强制 remount 整个列表/面板）。
   - Loading 状态必须与真实异步生命周期绑定：请求开始即进入 loading，请求结束（成功或失败）立刻退出 loading。
   - 避免视觉跳动：对数值展示使用 `tabular-nums`，必要时为按钮/数值容器设置稳定宽度（`min-w-*` 等），并避免文案切换导致布局抖动。
   - 动效必须克制且可降级：默认使用 `motion-safe:`，并尊重 `prefers-reduced-motion`（`motion-reduce:`）。

4. 全局样式文件限制
   - 项目允许保留一个 Tailwind 入口 CSS 文件（`src/styles/index.css`），其内容只允许包含 Tailwind v4 指令（例如 `@import "tailwindcss";`、`@custom-variant ...`、`@theme ...`）。
   - 该文件不得包含任何自定义选择器与原生 CSS 规则。

## 5. 交付自检清单（每次改动后）

- 运行 `bun run format`（避免格式噪声与冲突）。
- 运行 `bun run check`（至少确保 `bun run build` 通过）。
- 手动自测：登录/登出、鉴权守卫、主题切换、主要页面加载与错误提示。
  </INSTRUCTIONS>
