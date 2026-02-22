# CHANGELOG

## 2026-02-22

- 新增：CPAMC 兼容管理中心知识条目与多入口上下文说明。
- 更新：Tailwind 默认入口路由对齐参考项目（`HashRouter`；`/` 与 `*` 默认跳转到 `/dashboard`）。
- 更新：侧边栏折叠状态 localStorage key 对齐为 `cli-proxy-sidebar-collapsed`（兼容参考项目）。
- 新增：`src/lib/http/apis/*` 补齐 `apiKeysApi`/`modelsApi`/`versionApi` 包装层导出。
- 更新：`rules/workflow.md` 固化“复杂任务必须维护 todolist”的约定。
- 更新：移除侧边栏“用量统计”入口，`/usage` 路由重定向到 `/monitor`（避免内容重复）。
- 修复：`/auth-files` → “OAuth 排除模型/模型别名” tab 空数据不再触发无限刷新导致的持续 loading。
- 新增：Vitest 单元测试与 Playwright E2E 测试脚手架（并补齐该问题的用例）。
