# 修复：Auth Files → OAuth 排除模型 Tab 一直加载中

<!-- LIVE_STATUS_BEGIN -->
状态: completed | 进度: 4/4 (100%) | 更新: 2026-02-22 18:40:19
当前: 已完成
<!-- LIVE_STATUS_END -->

## Todolist

- [x] 1. 修复：OAuth 排除模型/模型别名 tab 空数据不再触发无限刷新
- [x] 2. 单测：覆盖“空响应仅请求一次 + 显示空态 + loading 结束”
- [x] 3. E2E：Playwright 覆盖该 tab（mock 管理端 API）
- [x] 4. 校验：`bun run check` + `bun run test` + `bun run e2e` 通过
