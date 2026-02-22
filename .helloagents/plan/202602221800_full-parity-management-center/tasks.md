# 全量对齐：Cli-Proxy-API-Management-Center → CodeProxy（Tailwind 入口）

<!-- LIVE_STATUS_BEGIN -->
状态: completed | 进度: 6/6 (100%) | 更新: 2026-02-22 17:17:30
当前: 已完成
<!-- LIVE_STATUS_END -->

## 范围

- 对齐目标：参考项目 `/Users/kittors/Documents/projects/OpenCode/Cli-Proxy-API-Management-Center`
- 交付对象：本仓库默认入口（`index.html` + `src/main.tsx` + `src/app/AppRouter.tsx` + `src/modules/*` + `src/lib/*`）
- 非目标：完全迁移参考项目的 UI/样式体系；仅保证“业务能力可用、入口可达、接口可用”

## Todolist（执行中会持续更新）

- [x] 1. 路由默认首页对齐：`/` → 仪表盘（参考项目行为）
- [x] 2. 路由模式对齐：评估并切换为 `HashRouter`（参考项目使用 HashRouter，适配纯静态托管）
- [x] 3. 侧边栏折叠状态兼容：localStorage key 对齐为 `cli-proxy-sidebar-collapsed`
- [x] 4. 管理 API 能力补齐：为 `src/lib/http/apis/*` 补齐参考项目已有但当前缺失的 API 包装（`api-keys`/`models`/`version` 等）
- [x] 5. 校验闭环：`bun run check`（lint/format/build）通过
- [x] 6. 规范固化：把“实现过程中必须持续更新 todolist”的要求写入项目规范（`rules/workflow.md` 覆盖区）

## 记录

- 参考项目的页面/服务实现（`src/pages/*` 等）在本仓库已存在，但**不作为默认入口**；本清单以 Tailwind 入口为准。
