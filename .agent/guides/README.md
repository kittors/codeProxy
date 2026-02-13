# Code Proxy 开发规范指南索引

> 本目录包含 Code Proxy 管理后台（前端）的详细开发规范。**按需读取**，不要一次性加载全部内容。

## 📋 规范文件索引

### 工程化规范
| 文件 | 内容 | 何时读取 |
|------|------|----------|
| [engineering.md](./engineering.md) | Bun/Vite/TS/Tailwind 工具链、脚本、环境变量、构建产物 | 初始化项目、排查构建问题 |
| [feature-pr-workflow.md](./feature-pr-workflow.md) | 功能开发分支与提交组织、Code Review、自查清单 | 开发新功能/准备 PR 时 |
| [git.md](./git.md) | 提交规范、变更粒度、**Git 安全规则** | 提交代码、整理变更时 |
| [security.md](./security.md) | 管理密钥/隐私、日志与脱敏、前端安全注意事项 | 涉及密钥、OAuth、日志与导出时 |
| [logging.md](./logging.md) | 前端日志策略、脱敏、与 ApiClient 事件配合 | 需要排查问题/新增日志时 |

### 核心规范
| 文件 | 内容 | 何时读取 |
|------|------|----------|
| [workflow.md](./workflow.md) | 任务流程、Checklist、Bug 修复策略、自查清单 | 开始开发任务前 |
| [architecture.md](./architecture.md) | 目录分层、依赖方向、Provider 与事件、路由守卫 | 设计新模块、重构目录时 |
| [http-api.md](./http-api.md) | API 基址规范、apis.ts/types.ts 组织、错误与 401、版本头 | 新增/调整接口封装时 |

### 代码规范
| 文件 | 内容 | 何时读取 |
|------|------|----------|
| [naming.md](./naming.md) | 命名约定、文件命名、导出约定、反模式 | 写新文件/重命名时 |
| [patterns.md](./patterns.md) | React/Ts 设计模式、表单/列表/弹窗、性能与避免抖动 | 实现复杂交互时 |
| [error-handling.md](./error-handling.md) | 错误层次、toast/页面错误、超时/取消请求、用户文案 | 处理异常与提示时 |

### UI/UX 规范
| 文件 | 内容 | 何时读取 |
|------|------|----------|
| [tailwind.md](./tailwind.md) | Tailwind v4 使用边界、禁止原生 CSS、dark/动效、全局样式限制 | 写样式、主题相关时 |
| [ui-design.md](./ui-design.md) | 视觉一致性、组件复用、信息密度、可访问性 | 调整 UI/布局时 |

### 测试与验证
| 文件 | 内容 | 何时读取 |
|------|------|----------|
| [testing.md](./testing.md) | 当前验证策略、何时引入测试框架、手动验证清单 | 改动影响范围较大时 |

### 规范演进
| 文件 | 内容 | 何时读取 |
|------|------|----------|
| [evolution.md](./evolution.md) | 规范变更流程、兼容策略、落地方式 | 需要改规范时 |

---

## 🚀 快速开始（常见任务路径）

### 新功能开发
1. 读 [workflow.md](./workflow.md) 的“任务开发流程 + Checklist”
2. 读 [architecture.md](./architecture.md) 确定模块位置与依赖方向
3. 若涉及接口：读 [http-api.md](./http-api.md)
4. 若涉及 UI：读 [tailwind.md](./tailwind.md) 与 [ui-design.md](./ui-design.md)

### 修 Bug
1. 读 [workflow.md](./workflow.md) 的“Bug 修复流程”
2. 读 [error-handling.md](./error-handling.md) 的“用户提示与错误边界”

### 规范变更
1. 读 [evolution.md](./evolution.md)
2. 提议 → 试行 → 收敛 → 更新索引与入口（`AGENTS.md`）

---

## 📌 使用原则

1. **按需读取**：只读取与你当前任务直接相关的规范文件
2. **遵循优先级**：`AGENTS.md`（强制） > 本目录指南 > 个人习惯
3. **最小改动**：避免无关重构与格式噪声
4. **安全优先**：密钥不落盘、不出日志、不进提示

---

## 🔄 规范状态

| 文件 | 状态 | 最后更新 |
|------|------|----------|
| engineering.md | ✅ Active | 2026-02-13 |
| feature-pr-workflow.md | ✅ Active | 2026-02-13 |
| workflow.md | ✅ Active | 2026-02-13 |
| architecture.md | ✅ Active | 2026-02-13 |
| http-api.md | ✅ Active | 2026-02-13 |
| naming.md | ✅ Active | 2026-02-13 |
| patterns.md | ✅ Active | 2026-02-13 |
| error-handling.md | ✅ Active | 2026-02-13 |
| tailwind.md | ✅ Active | 2026-02-13 |
| ui-design.md | ✅ Active | 2026-02-13 |
| git.md | ✅ Active | 2026-02-13 |
| security.md | ✅ Active | 2026-02-13 |
| logging.md | ✅ Active | 2026-02-13 |
| testing.md | ✅ Active | 2026-02-13 |
| evolution.md | ✅ Active | 2026-02-13 |
