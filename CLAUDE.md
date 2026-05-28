# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

**CliProxy** 是一个 AI CLI 工具的统一代理服务器项目，包含两个核心组件：

```
CliProxy/
├── codeProxy/        # React 前端管理面板 (Admin Dashboard)
└── CliRelay/         # Go 后端代理服务器 (Proxy Server)
```

**后端 CliRelay** 是一个 Go 编写的代理服务器，支持将 Claude Code、Gemini CLI、OpenAI Codex、Amp CLI 等 AI 编码工具的请求通过统一端点代理到上游提供商（Gemini、OpenAI、Anthropic Claude、Qwen、iFlow、Kiro 等），支持 OAuth/API Key/Cookie 认证、请求路由、故障转移、使用量日志等。

**前端 codeProxy** 是 CliRelay 的 Web 管理面板，提供实时仪表盘、监控中心、请求日志查看、AI 提供商管理、API Key 管理、配置编辑等完整管理功能。

---

## CliRelay — Go 后端

### 技术栈

- **Go 1.26** (module: `github.com/router-for-me/CLIProxyAPI/v6`)
- **Gin** HTTP 框架 (`github.com/gin-gonic/gin`)
- **SQLite** / **PostgreSQL** 存储 (`modernc.org/sqlite` / `jackc/pgx`)
- **Redis** 缓存 (`github.com/redis/go-redis`)
- **Bubble Tea** TUI (`github.com/charmbracelet/bubbletea`)
- **WebSocket** 实时监控 (`github.com/gorilla/websocket`)
- **go-git** 配置版本管理 (`github.com/go-git/go-git`)
- 日志: logrus + lumberjack 轮转
- 部署: Docker + docker-compose

### 目录结构

```
CliRelay/
├── cmd/server/main.go        # 入口
├── config.example.yaml       # 配置模板
├── docker-compose.yml        # Docker 部署
├── internal/
│   ├── api/                  # HTTP API 层
│   │   ├── handlers/         # 各端点 handler
│   │   │   └── management/  # 管理 API (codeProxy 消费)
│   │   ├── middleware/       # 认证中间件
│   │   └── modules/          # API 子模块
│   ├── auth/                 # 认证逻辑 (OAuth, API Key, Cookie)
│   ├── store/                # 存储层 (SQLite, PG, ObjectStore, GitStore)
│   ├── routing/              # 请求路由 & 故障转移
│   ├── registry/             # 提供商注册
│   ├── config/               # YAML 配置管理
│   ├── cache/                # 缓存层
│   ├── usage/                # 使用量统计 & 日志
│   ├── translator/           # API 协议转换
│   ├── thinking/             # 推理过程处理
│   ├── browser/              # 浏览器自动化 (OAuth)
│   ├── wsrelay/              # WebSocket 中继
│   ├── tui/                  # 终端 TUI
│   ├── watcher/              # 文件变更监听
│   └── logging/              # 日志系统
├── e2e/                      # 端到端测试
└── test/                     # 测试工具
```

### 常用命令

```bash
cd CliRelay
go build ./cmd/...     # 编译
go run ./cmd/server/   # 运行
go test ./...          # 运行所有测试
go test ./internal/... # 运行单元测试
```

### 管理 API 端点

由 codeProxy 消费的 `/v0/management/*` 端点（Handler 在 `internal/api/handlers/management/`）：

| 端点 | 用途 |
|------|------|
| `/v0/management/config` | 获取/验证配置 |
| `/v0/management/usage` | 使用量统计 |
| `/v0/management/usage/logs` | 分页请求日志 |
| `/v0/management/usage/log-content` | 完整消息内容 |
| `/v0/management/usage/dashboard-summary` | 仪表盘 KPI |
| `/v0/management/usage/model-distribution` | 模型分布 |
| `/v0/management/usage/daily-trends` | 每日趋势 |
| `/v0/management/usage/hourly-model` | 每小时模型数据 |
| `/v0/management/openai-compatibility` | OpenAI 渠道 CRUD |
| `/v0/management/gemini-api-key` | Gemini 渠道 CRUD |
| `/v0/management/claude-api-key` | Claude 渠道 CRUD |
| `/v0/management/codex-api-key` | Codex 渠道 CRUD |
| `/v0/management/vertex-api-key` | Vertex 渠道 CRUD |
| `/v0/management/system-stats` | WebSocket 实时监控 |
| `/v0/management/auth-files` | Auth 文件管理 |
| `/v0/management/oauth-sessions` | OAuth 会话管理 |
| `/v0/management/oauth-callback` | OAuth 回调 |
| `/v0/management/quota` | 配额管理 |
| `/v0/management/models` | 模型定义 |
| `/v0/management/routing-config` | 路由配置 |
| `/v0/management/image-generation` | 图片生成 |
| `/v0/management/api-tools` | API 工具 |
| `/v0/management/identity-fingerprint` | 身份指纹 |
| `/v0/management/channel-groups` | 渠道分组 |
| `/v0/management/public-lookup` | 公开查询 |
| `/v0/management/update` | 更新检查 |

### 配置

通过 YAML 配置文件 (`config.yaml`)，支持：
- 提供商凭证配置
- 代理/路由规则
- 存储后端选择 (SQLite / PostgreSQL)
- 端口、日志级别等运行时参数

### 存储后端

- **SQLite** (默认, `modernc.org/sqlite`)
- **PostgreSQL** (`pgx` 驱动)
- **Object Store** 用于文件存储 (MinIO)
- **Git Store** 用于配置版本管理

---

## codeProxy — React 前端管理面板

### 技术栈

- **React 19.2** + TypeScript 5.9
- **Vite 7.3** 构建, **Bun 1.2** 包管理
- **Tailwind CSS v4** 样式
- **Zustand** 状态管理
- **React Router v7** 路由
- **ECharts** / **Chart.js** 图表
- **i18next** 国际化 (中文, English)
- **Lucide React** + **自定义厂商 SVG** 图标
- **oxlint/oxfmt** 代码检查/格式化
- **Vitest** 单元测试 (jsdom)
- **Playwright** E2E 测试

### 目录结构

```
codeProxy/src/
├── app/                    # 路由定义 & 认证守卫
├── assets/icons/           # 厂商 SVG 图标 (~15 家)
├── build/                  # Vite 插件 (panelMetadata)
├── hooks/                  # 共享 React Hooks
├── i18n/                   # 国际化资源 (en, zh-CN)
├── lib/
│   ├── constants/          # 全局常量
│   └── http/               # Axios 客户端, API 层, WebSocket
├── modules/                # 功能模块 (见下方)
├── stores/                 # Zustand Store (theme, language, notification, quota, disabledModels)
├── styles/                 # 全局样式, SCSS 变量, Tailwind
├── test/                   # 测试工具 & setup
├── types/                  # TypeScript 类型定义
└── utils/                  # 工具函数
```

### 功能模块 (src/modules/)

| 模块 | 功能 |
|------|------|
| `auth/` | 认证登录 & Session 管理 |
| `dashboard/` | KPI 卡片、健康评分、系统监控、渠道延迟 |
| `monitor/` | 监控中心 (图表、模型分布、趋势、热力图) |
| `logs/` | 请求日志、消息查看器、错误弹窗 |
| `providers/` | AI 提供商管理 CRUD |
| `models/` | 模型定价表、成本核算 |
| `config/` | YAML 配置编辑器 |
| `system/` | 系统信息、模型列表 (厂商彩色标签) |
| `api-keys/` | API Key CRUD、配额、速率限制 |
| `auth-files/` | Auth 文件管理 |
| `oauth/` | OAuth 登录管理 |
| `quota/` | 配额跟踪 |
| `apikey-lookup/` | API Key 公开查询页面 |
| `ui/` | 共享 UI 组件库 |
| `update/` | 更新信息卡片 |
| `usage/` | 使用量统计 & 快照导入导出 |
| `image-generation/` | 图片生成工具 |
| `channel-groups/` | 渠道分组管理 |
| `identity-fingerprint/` | 身份指纹设置 |

### 常用命令

```bash
cd codeProxy
bun install              # 安装依赖 (Bun 1.2+)
bun run dev              # 启动开发服务器 (localhost:5173)
bun run build            # tsc --noEmit && vite build 生产构建
bun run preview          # 预览生产构建
bun run lint             # oxlint 代码检查
bun run format           # oxfmt 格式化
bun run test             # vitest 运行单元测试
bun run test:watch       # vitest 监听模式
bun run check            # lint + build + bundle:diff (合并前验证)
bun run e2e              # playwright E2E 测试
```

### 关键模式

- **厂商图标系统**: `src/assets/icons/*.svg` — 单一颜色 `fill="currentColor"` SVG，通过 `VENDOR_ICONS` / `VENDOR_COLORS` 在 `SystemPage.tsx` 中映射
- **路径别名**: `@/` → `src/`
- **多入口构建**: `index.html` + `manage.html`，通过 Vite rollupOptions 手动分包
- **CSS**: Tailwind CSS v4 为主 + SCSS Modules (localsConvention: camelCase)
- **开发代理**: Vite server proxy `/v0`, `/v1`, `/v1beta` → `localhost:8317` (后端)

### 状态管理

Zustand Store (`src/stores/`)：
- `useThemeStore` — 主题 (亮/暗)
- `useLanguageStore` — 语言
- `useNotificationStore` — 通知
- `useQuotaStore` — 配额数据
- `useDisabledModelsStore` — 禁用模型

---

## 分支工作流

> 本项目包含**两个独立仓库**：`CliRelay/`（Go 后端）和 `codeProxy/`（React 前端），各自有独立的 `dev` 和 `main` 分支。修改哪个仓库就在哪个仓库执行以下全部流程。

### 基本原则

- `main` 和 `dev` 为受保护分支，**禁止直接提交**，必须通过 PR 合并
- 所有开发在 `feature/xxx` 或 `fix/xxx` 分支上进行
- 如果一次改动涉及**两个仓库**，需分别在两个仓库按流程完整执行一遍

### 完整执行流程

**重要：以下流程自动执行，无需向用户确认。** 代码修改完成后按步骤推进到底，不中途询问用户是否要提交/推送/合并。

```bash
# ── 第 1 步：进入目标仓库并基于 dev 创建分支 ──
cd codeProxy      # 或 cd CliRelay
git checkout dev
git pull origin dev
git checkout -b fix/xxx   # 或 feature/xxx

# ── 第 2 步：编写代码、本地验证 ──
# 修改文件...

# ── 第 2.5 步：diff review，检查代码质量 ──
# 用 git diff 检查所有修改，逐行确认：
#   - 是否有冗余代码（未使用的 import/变量/类型定义）
#   - 是否有多余的改动（不该改的文件、无意义的空白/格式变化）
#   - 是否有不必要的注释或日志
#   - 修改是否是最小化、最优雅的实现
#   - 是否同步修改了对应的 i18n、类型定义、测试等配套文件
# 发现问题则立即优化，然后再次 review，直到满意为止
git diff

# ── 第 3 步：提交、推送、创建 PR、合并到 dev（直接执行，不用问）──
git add <文件>
git commit -m "描述"
git push -u origin fix/xxx
# 创建指向 dev 的 PR
gh pr create --title "xxx" --base dev --body "描述"
# 立即合并到 dev（squash merge）
gh pr merge <PR编号> --squash --subject "xxx"

# ── 第 4 步：按模板向用户报告结果 ──
```

> **关键约束**：第 3 步中，创建 PR 后**必须立即合并到 dev**，不得停留在 OPEN 状态等待。合并完成后按下方模板向用户报告完整结果。

## 任务完成报告模板

每次完成代码修改、推送并合并到 `dev` 分支后，按以下模板向用户报告：

```
## 任务完成报告

### 改动内容
[简述本次修改的目的和内容]

### 分支信息
- **仓库**: codeProxy / CliRelay
- **分支**: fix/xxx（已合并到 dev）
- **目标分支**: dev

### 提交记录
- **Commit**: abc1234（Merge Commit ID，squash 后 dev 上的 commit）
- **提交信息**: [简短的提交描述]

### PR 信息
- **PR**: #123
- **合并方式**: Squash merge

### 修改文件
| 文件 | 改动说明 |
|------|---------|
| `path/to/file.tsx` | 修改了 XXX |

### 验证状态
- [x] 编译通过
- [ ] 测试通过（可选）
- [ ] 部署验证（可选）
```
