# Performance Regression Checks

更新时间：2026-04-13

## 前端

- 运行 `bun run build`，记录关键 chunk：
  - `vendor-echarts`
  - `vendor-markdown`
  - `index`
  - `AuthFilesPage`
  - `ConfigPage`
- 关注 `AuthFilesPage`、`LogContentModal`、`ApiKeyLookupPage` 是否出现新的主线程大对象解析。
- 重点回归 `manage/monitor/request-logs`：确认 input/output 详情仍支持完整原文、源码/渲染切换，并且大内容不会阻塞首屏。
- 重点回归 `manage/logs`：确认日志正文没有被通用脱敏或截断，查询/滚动/下载路径不会因为前端全量缓冲而明显卡顿。
- 检查本地缓存是否重新引入大对象持久化。

## 后端

- 运行 `go test ./...`
- 检查 public lookup 限流与 `no-store` 是否仍在。
- 检查主 HTTP server timeout / pprof 保护 / multipart 限制是否仍在。
- 检查新的上游 client 是否继续使用统一 HTTP client factory。
