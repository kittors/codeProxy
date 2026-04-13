# CliProxy Monorepo 修复计划 Checklist

说明：

- 未完成项使用 `- [ ]`，并保留 `完成时间：待填写`。
- 完成项使用 `- [x]`，并填写实际完成时间。
- 本计划来源于 `docs/monorepo-audit-report.md`。

## Phase 0：文档与基线治理

- [x] 创建根级全仓审计报告 `docs/monorepo-audit-report.md`。完成时间：2026-04-13 10:40:29 +0800
- [x] 创建根级修复计划 checklist `docs/monorepo-remediation-checklist.md`。完成时间：2026-04-13 10:40:29 +0800
- [x] 将根级审计报告、修复计划与基线文档镜像到受版本控制的 `codeProxy/docs/internal-review/` 与 `CliRelay/docs/internal-review/`，避免文档仅存在非 Git 根目录。完成时间：2026-04-13 17:35:33 +0800
- [x] 将 `codeProxy` 当前 lint warning 清零，并保证 `bun run check` 输出 0 warning、0 error。完成时间：2026-04-13 14:39:21 +0800
- [x] 建立根级质量基线说明，固定记录 `CliRelay`、`codeProxy` 的测试、构建、lint、E2E 命令。完成时间：2026-04-13 14:53:25 +0800
- [x] 建立大文件扫描命令或脚本，前端页面超过 800 行时在 CI 或检查脚本中告警。完成时间：2026-04-13 14:53:25 +0800
- [x] 建立前端 bundle 基线，记录主要 chunk 大小，并把超过预算的 chunk 纳入后续优化跟踪。完成时间：2026-04-13 14:53:25 +0800
- [x] 盘点并确认前端唯一主线网络层，明确 `src/lib/http/*` 为保留路径还是迁移目标。完成时间：2026-04-13 14:45:34 +0800
- [x] 盘点并确认前端唯一主线认证实现，明确 `AuthProvider`、`useAuthStore`、`secureStorage` 的保留/下线路线。完成时间：2026-04-13 14:45:34 +0800
- [x] 盘点并确认前端唯一 API 契约类型来源，收敛 `AuthFileItem`、`OAuthProvider` 等重复定义。完成时间：2026-04-13 14:45:34 +0800
- [x] 建立安全基线清单，固定检查 `SetTrustedProxies`、CORS allowlist、HTTP timeouts、pprof 暴露、凭据持久化。完成时间：2026-04-13 15:12:57 +0800

## Phase 1：前端结构治理

- [ ] 将 `codeProxy/src/modules/auth-files/AuthFilesPage.tsx` 拆分为路由容器、文件列表、筛选分页、Quota 概览、OAuth 流程、弹窗组件、hooks、helpers、types、constants，主页面文件降到 600 行以内。完成时间：待填写
- [ ] 为 Auth Files 拆分后的 quota 聚合、文件筛选、sessionStorage 缓存读写、OAuth 状态转换补单测。完成时间：待填写
- [ ] 将 `codeProxy/src/modules/providers/ProvidersPage.tsx` 拆分为 Provider tabs、Provider key 卡片、OpenAI provider 表单、Ampcode 配置、模型发现、状态栏 hooks，主页面文件降到 600 行以内。完成时间：待填写
- [ ] 为 Providers 拆分后的 provider draft、model discovery、usage source 归一化、API key masking 补单测。完成时间：待填写
- [ ] 将 `codeProxy/src/modules/api-keys/ApiKeysPage.tsx` 拆分为 key 表格、编辑弹窗、权限/限制选择器、日志快捷入口、配额展示 hooks，主页面文件降到 600 行以内。完成时间：待填写
- [ ] 将 `codeProxy/src/modules/config/ConfigPage.tsx` 和 `codeProxy/src/modules/config/visual/VisualConfigEditor.tsx` 拆分为 source editor、runtime panel、visual editor sections、保存流程 hooks。完成时间：待填写
- [ ] 将 `codeProxy/src/modules/apikey-lookup/ApiKeyLookupPage.tsx` 拆分为公开查询表单、KPI、图表、请求日志表、数据加载 hooks。完成时间：待填写
- [x] 将 `codeProxy/src/modules/monitor/LogContentModal.tsx` 拆分为内容加载 hook、Markdown/XML 渲染组件、复制导出组件、输入/输出 tab 状态。完成时间：2026-04-13 15:38:53 +0800
- [ ] 将 `codeProxy/src/modules/monitor/MonitorPage.tsx` 拆分为 KPI 区、模型分布图、小时序列图、API Key 分布图、查询参数 hooks。完成时间：待填写
- [ ] 将 `codeProxy/src/modules/logs/LogsPage.tsx` 拆分为日志工具栏、日志表格、下载流程、错误日志列表和 hooks。完成时间：待填写
- [ ] 将 `codeProxy/src/utils/usage.ts` 拆分为 `sanitize`、`pricing`、`aggregation`、`chart-series`、`formatters` 等独立工具模块，并补纯函数单测。完成时间：待填写
- [ ] 将 `codeProxy/src/modules/quota/quota-helpers.ts` 拆分为 provider 识别、配额映射、显示格式化和校验函数，并补单测。完成时间：待填写
- [x] 清理遗留 `useApi`、`useModelsStore`、`useConfigStore`、`useAuthStore` 与旧 `services/api` 的未使用路径，避免继续形成双轨架构。完成时间：2026-04-13 14:45:34 +0800

## Phase 2：前端长期规范落地

- [x] 在根级文档或 `codeProxy/docs` 中新增前端维护规范，固化页面行数阈值、目录模板、状态分层、注释规则、测试规则。完成时间：2026-04-13 14:53:25 +0800
- [x] 为复杂页面新增目录模板：`components/`、`hooks/`、`helpers/`、`types.ts`、`constants.ts`、`__tests__/`。完成时间：2026-04-13 14:59:36 +0800
- [ ] 清理低价值翻译式注释，只保留业务规则、协议兼容、安全边界、性能取舍、历史迁移说明。完成时间：待填写
- [x] 为管理密钥、OAuth token、Provider key、日志内容等敏感字段建立前端脱敏和持久化策略文档。完成时间：2026-04-13 15:12:57 +0800
- [x] 明确“凭据类字段遮罩”和“日志/请求正文完整可见”的边界：`manage/monitor/request-logs` 与 `manage/logs` 正文不得因通用脱敏或截断而丢内容。完成时间：2026-04-13 17:35:33 +0800
- [x] 禁止新增页面直接写复杂 API 拼装逻辑，所有请求编排进入 API 层或 feature hooks。完成时间：2026-04-13 14:59:36 +0800
- [x] 建立新增依赖审查规则：超过 50 KB gzip 的依赖必须写明使用场景、替代方案和拆包策略。完成时间：2026-04-13 14:59:36 +0800
- [x] 建立前端缓存白名单规范，明确哪些字段可进入 localStorage / sessionStorage、允许保存多久、最大体积多大。完成时间：2026-04-13 14:59:36 +0800
- [x] 建立高敏下载规范，明确 auth 文件、请求日志、原始响应内容的确认、审计、脱敏和默认行为。完成时间：2026-04-13 14:59:36 +0800
- [x] 建立 URL 高敏参数禁用规范，明确 API key、management key、OAuth code 等不得进入 query/hash。完成时间：2026-04-13 14:59:36 +0800
- [x] 建立“迁移中遗留目录”规则，要求旧目录写明禁用新增依赖和下线时间。完成时间：2026-04-13 14:59:36 +0800

## Phase 3：前端安全与性能优化

- [x] 调整 `AuthProvider` 的管理 key 持久化策略：保留长期登录态，但加入显式过期与清理逻辑，避免无限期留存在浏览器本地存储。完成时间：2026-04-13 14:53:25 +0800
- [x] 明确 `secureStorage` 只用于低敏缓存或迁移兼容，禁止用于高敏凭据，并更新相关调用点。完成时间：2026-04-13 14:45:34 +0800
- [x] 清理或下线 `useAuthStore` 对 `managementKey` 的持久化逻辑，避免遗留代码重新引入高敏落盘。完成时间：2026-04-13 14:45:34 +0800
- [x] 改造 API Key Lookup 页面，移除 `api_key` 写入 URL 的行为，禁止从 URL 自动恢复真实 key。完成时间：2026-04-13 14:23:15 +0800
- [x] 为公共查询接口增加 POST body 输入支持，并切换 `ApiKeyLookupPage` / `LogContentModal` 到 POST 调用链路。完成时间：2026-04-13 14:23:15 +0800
- [x] 改造公共查询接口协议，弃用 `api_key` query 参数，改为 POST body、一次性 token 或等价非 URL 传递方案。完成时间：2026-04-13 14:58:41 +0800
- [x] 为公共查询相关响应增加 `Cache-Control: no-store, private` 等明确缓存控制。完成时间：2026-04-13 14:23:15 +0800
- [x] 为公共查询接口增加基础按 IP 限流中间件。完成时间：2026-04-13 14:23:15 +0800
- [x] 为公共查询接口增加按 IP / 指纹的速率限制、失败审计和统一错误节奏，降低 key 枚举风险。完成时间：2026-04-13 15:29:38 +0800
- [x] 收缩 `AuthFilesPage` 的 sessionStorage 缓存，只保留必要 UI 状态和最小恢复数据，去掉整页 usage/quota 大对象落盘。完成时间：2026-04-13 14:58:10 +0800
- [x] 为 `AuthFilesPage` 缓存增加大小预算、字段白名单和节流策略，避免每次变更都触发大对象 `JSON.stringify`。完成时间：2026-04-13 14:58:10 +0800
- [ ] 对 ECharts、Markdown 渲染、CodeMirror、syntax highlighter 做按交互懒加载，减少 `vendor-echarts`、`vendor-markdown`、`index` chunk 压力。完成时间：待填写
- [x] 对 `LogContentModal` 引入异步解析、分批渲染与源码优先首屏策略；性能优化不得以截断或删除完整 input/output 内容为代价。完成时间：2026-04-13 17:06:11 +0800
- [x] 收敛 `LogContentModal` 中重复的 `JSON.parse` / `JSON.stringify` / SSE 解析逻辑，下沉到独立 parser / hook / rendering 模块。完成时间：2026-04-13 17:06:11 +0800
- [x] 为 `LogContentModal` 的大内容详情实现按 input/output 分段加载、源码/渲染切换，并保留完整内容查看能力。完成时间：2026-04-13 17:06:11 +0800
- [x] 提升 `manage/logs` 的默认查询窗口并修正 full refresh 语义：完整刷新覆盖最近日志快照而不是继续追加旧 buffer，避免系统日志查询误丢最近内容。完成时间：2026-04-13 17:35:33 +0800
- [ ] 将日志和 auth 文件下载改为优先走附件流式响应或浏览器原生下载通道，减少前端全量 Blob / text 缓冲。完成时间：待填写
- [x] 为 auth 文件下载增加高敏确认提示，提示该操作会把完整凭据带入浏览器环境。完成时间：2026-04-13 15:19:36 +0800
- [x] 收敛重复 API 契约类型，删除或迁移旧 `src/types/*` 中与 `src/lib/http/types.ts` 重叠的定义。完成时间：2026-04-13 14:45:34 +0800
- [ ] 为前端构建增加 bundle size 输出对比，超过预算时在 CI 或检查脚本中提示。完成时间：待填写
- [ ] 建立页面级 chunk 预算，并跟踪 `AuthFilesPage`、`ConfigPage`、`ProvidersPage`、`LogContentModal` 的拆分收益。完成时间：待填写

## Phase 4：后端安全与稳定性治理

- [x] 盘点 `CliRelay/internal` 与 `CliRelay/sdk` 中所有非测试 `io.ReadAll`，按请求体、上游响应体、本地文件、对象存储、压缩内容分类。完成时间：2026-04-13 15:19:36 +0800
- [ ] 将 HTTP 请求体读取统一迁移到 `bodyutil.ReadRequestBody`、`LimitBodyMiddleware` 或等价限流封装。完成时间：待填写
- [x] 为 multipart auth 文件上传增加服务端大小限制，确保与 raw JSON 上传和 Vertex 导入的限制策略一致。完成时间：2026-04-13 14:23:15 +0800
- [x] 为 auth 文件下载路径评估流式响应替代方案，减少 `os.ReadFile + c.Data` 的整文件读入模式。完成时间：2026-04-13 15:03:48 +0800
- [ ] 为上游响应体和错误响应体定义 provider-specific 最大读取限制，避免大响应导致内存压力。完成时间：待填写
- [ ] 将请求 handler 路径中的 `context.Background()` 改为 `c.Request.Context()` 或请求派生 context。完成时间：待填写
- [x] 为 `gin.Engine` 显式配置 `SetTrustedProxies(nil)` 或受控代理白名单，禁止依赖 Gin 默认行为。完成时间：2026-04-13 14:23:15 +0800
- [x] 增加管理接口安全回归测试，验证伪造 `X-Forwarded-For` 不能把远程请求伪装成本地请求。完成时间：2026-04-13 14:50:29 +0800
- [x] 收紧默认 CORS 策略，将 `Access-Control-Allow-Origin: *` 改为可配置 allowlist，并为 SSE/流式 handler 统一实现。完成时间：2026-04-13 14:50:29 +0800
- [x] 为跨域策略增加回归测试，覆盖允许 origin、拒绝 origin、OPTIONS 预检和流式响应路径。完成时间：2026-04-13 14:50:29 +0800
- [x] 为公共 API Key Lookup 相关接口增加 no-store 响应头，并验证代码路径与回归测试覆盖查询结果不被正常缓存。完成时间：2026-04-13 15:16:50 +0800
- [x] 为公共查询接口增加限流或节流中间件，防止 key 存在性被批量探测。完成时间：2026-04-13 14:23:15 +0800
- [x] 建立统一 HTTP client factory，集中配置 timeout、dialer、TLS handshake、response header、idle conn、keepalive。完成时间：2026-04-13 15:12:57 +0800
- [x] 将散落的 bare `http.Client` / bare `http.Transport` 迁移到统一 factory，优先覆盖代理、OAuth、executor、管理工具调用。完成时间：2026-04-13 15:12:57 +0800
- [ ] 为确实需要脱离请求生命周期的后台任务添加注释，说明 owner、取消条件、超时和清理策略。完成时间：待填写
- [ ] 为 OAuth 回调、WebSocket session、model registry hook、service watcher 等 goroutine 引入统一生命周期管理或 errgroup。完成时间：待填写
- [ ] 为主 `http.Server` 增加 `ReadHeaderTimeout`、`ReadTimeout`、`WriteTimeout`、`IdleTimeout`，并为 SSE/WebSocket 路径设计例外策略。完成时间：待填写
- [x] 为主 `http.Server` 增加 `ReadHeaderTimeout`、`ReadTimeout`、`IdleTimeout` 与 `MaxHeaderBytes` 基线配置。完成时间：2026-04-13 14:23:15 +0800
- [x] 为 pprof 增加明确的非本地暴露保护策略，至少要求本地绑定默认不变、远程暴露需要显式额外开关或警告。完成时间：2026-04-13 15:05:40 +0800
- [x] 盘点高敏操作审计日志，覆盖 auth 文件下载、auth 文件删除、OAuth 回调成功/失败、管理配置关键项变更。完成时间：2026-04-13 15:19:36 +0800

## Phase 5：验证与守护

- [ ] 后端每个安全治理批次完成后运行 `go test ./...`，并记录失败修复过程。完成时间：待填写
- [x] 为 public lookup 中间件和 multipart 上传大小限制补充 Go 回归测试，并确认 `CliRelay` 全量 `go test ./...` 通过。完成时间：2026-04-13 14:23:15 +0800
- [ ] 前端每个拆分批次完成后运行 `bun run lint`、`bun run build`、相关 `bun run test`，并记录 bundle 差异。完成时间：待填写
- [x] 完成前端安全基线与 lint 清理批次后运行 `bun run check`，确认 lint 0 warning 且构建通过。完成时间：2026-04-13 14:39:21 +0800
- [ ] 为拆分后的高风险模块补组件测试，覆盖 Auth Files、Providers、API Keys、Config、Log Content Modal 的关键交互。完成时间：待填写
- [ ] 为登录、管理 key 生命周期、配置保存、OAuth 回调、请求日志详情新增或补齐 E2E 场景。完成时间：待填写
- [x] 增加安全回归用例，覆盖 trusted proxies、CORS allowlist、multipart 文件大小限制、pprof 默认不可远程暴露。完成时间：2026-04-13 15:19:36 +0800
- [ ] 增加公共查询安全回归用例，覆盖“不再通过 URL 暴露 key”、`no-store`、查询限流、失败节奏一致性。完成时间：待填写
- [x] 增加性能回归检查，覆盖页面 chunk 大小、首次加载关键依赖、超大日志详情渲染和大文件下载内存路径。完成时间：2026-04-13 15:19:36 +0800
- [x] 将大文件扫描、lint warning、bundle size、Go tests 纳入发布前检查清单。完成时间：2026-04-13 15:19:36 +0800
- [ ] 每完成一个 Phase，更新本 checklist 的勾选状态和实际完成时间。完成时间：待填写
