# UI 修复：Config 源码编辑器滚动条 + 侧边栏收起展开不自然

<!-- LIVE_STATUS_BEGIN -->
状态: completed | 进度: 4/4 (100%) | 更新: 2026-02-22 20:17:26
当前: 已补齐 E2E 并完成本地验证，准备提交推送
<!-- LIVE_STATUS_END -->

## Todolist

- [x] 1. 修复 `/#/config` 源代码编辑器：消除 gutter 双滚动条；支持横向滚动
- [x] 2. 修复侧边栏收起/展开：内容不换行变形，随侧边栏滑出视口
- [x] 3. E2E：覆盖上述两项 UI 行为（Playwright）
- [x] 4. 校验：`bun run check` + `bun run test` + `bun run e2e`
