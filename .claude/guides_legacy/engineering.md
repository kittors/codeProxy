# 工程化规范（Bun + Vite + TypeScript + Tailwind v4）

本规范描述本项目的工具链与工程化约束，目标是：

- 开发体验一致（命令、目录、构建产物清晰）
- 交付质量可控（格式化/检查/构建在本地即可闭环）
- 避免“为了修一个小点”引入工程复杂度与额外依赖

## 1. 运行环境

### 1.1 包管理器与运行时

- 本项目使用 **Bun**（见 `package.json` 的 `packageManager`）
- 安装依赖：`bun install`
- 禁止随意切换到 pnpm/yarn/npm 生成新锁文件；如需切换必须先征得用户同意

建议开发者本地对齐：

- Bun 版本与 `package.json` 保持一致（避免 lock 行为差异）
- 尽量使用同一套系统字体渲染（UI 对齐时更可控）

### 1.2 开发服务器

- 使用 Vite：`bun run dev`
- 默认端口：5173（见 `vite.config.ts`）

## 2. 脚本与质量门禁（以 package.json 为准）

建议提交前最少执行：

- `bun run format`
- `bun run check`（等价于 `bun run lint && bun run build`）

脚本含义：

- `lint`：`oxlint .`（语义检查/可疑行为/性能风险）
- `format`：`oxfmt .`（统一格式化）
- `build`：`tsc --noEmit && vite build`（类型检查 + 构建）

原则：

- **格式化失败先修格式**，再讨论逻辑（减少 diff 噪声）
- **类型错误必须修复**，不要用 `any` 逃避；必要时用 `unknown + 类型守卫`
- **不要** 通过关掉规则/降低门禁来“让 CI 绿”——先解释原因，再决定是否调整规范

## 3. TypeScript 配置与约束

### 3.1 strict 模式

`tsconfig.json` 开启严格模式：你写的新代码必须：

- 不产生隐式 `any`
- 对 `unknown`/外部输入做显式校验
- 对可空值做收敛（`if (!value) return ...`、可选链、默认值）

### 3.2 路径别名

- `@/*` 映射到 `src/*`（见 `tsconfig.json` 与 `vite.config.ts`）
- import 规则：
  - 业务内部引用优先用 `@/` 绝对路径，避免深层相对路径导致重构困难

建议：

- 同一目录内的文件互相引用可以用相对路径（`./`），但跨模块请优先 `@/`
- 避免出现 `../../../../` 这种路径（通常意味着目录职责不清或抽象位置不对）

## 4. Vite 配置要点（只记录项目事实）

当前配置（见 `vite.config.ts`）：

- `@vitejs/plugin-react`
- `@tailwindcss/vite`
- alias：`@` → `src`
- dev server：`host: true`，`port: 5173`

新增 Vite 插件属于“引入新依赖/新复杂度”范畴，必须先征得用户同意。

## 5. Tailwind v4 工程约束（与样式规范配套）

- Tailwind 通过 `@tailwindcss/vite` 插件集成（见 `vite.config.ts`）
- 全局样式入口仅允许 Tailwind 指令（见 `src/styles/index.css`）
- 禁止新增原生 CSS 选择器与内联 style：详见 `.claude/guides/tailwind.md`

## 6. 依赖管理规则

### 5.1 不引入新依赖（默认）

新增依赖必须先回答三个问题，并得到用户确认：

1. 这件事不用新依赖能否做到？代价是什么？
2. 依赖体积/维护风险如何？是否会影响构建或运行时？
3. 是否引入新的范式（状态管理、表单库、CSS 方案等）导致一致性变差？

### 5.2 允许的小改动

允许在不新增依赖的前提下：

- 抽取组件/函数
- 增加类型与校验
- 增加更友好的错误提示（中文且不泄露敏感信息）

## 7. 构建产物与禁止修改项

- `dist/`：构建产物，**禁止手工编辑**
- `node_modules/`：依赖目录，**禁止手工编辑**
- `bun.lock`：锁文件，**禁止无理由改动**

如果你发现需要修改上述内容才能解决问题，说明原因并先征得用户同意。

## 8. 配置与环境变量

原则：

- 前端环境变量只允许通过 Vite 约定（通常为 `VITE_*`）
- **禁止** 将密钥写进前端环境变量（会被打包进产物）
- 本项目的“管理密钥”属于用户输入/本地存储范畴，详见 `.claude/guides/security.md`

## 9. 编辑器配置建议（可选）

说明：本节是建议，不强制落盘；若需要新增配置文件（例如 `.vscode/settings.json`），必须先征得用户同意。

建议关注点：

- 保存时格式化：交给 `oxfmt`（避免多工具互相打架）
- TypeScript 严格提示：保持开启

## 10. 排错建议（工程化层面）

当出现问题时，优先按顺序排查：

1. `bun run format` 后是否仍有 lint/tsc 报错？
2. `bun run lint` 的错误是否是新增代码引入？
3. `bun run build` 的类型错误是否是接口返回结构变化导致？
4. 是否误改了 `src/styles/index.css`（引入了禁止的 CSS 写法）？

如果问题与数据/接口相关，转到：

- `.claude/guides/http-api.md`
- `.claude/guides/error-handling.md`
