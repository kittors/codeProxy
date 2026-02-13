# 命名与文件组织规范

目标：让代码“可搜索、可预测、可重构”。

## 1. 文件与目录命名

- 页面组件：`<Feature>Page.tsx`（例如 `LoginPage.tsx`）
- Provider：`<Xxx>Provider.tsx`（例如 `AuthProvider.tsx`）
- UI 复用组件：`PascalCase.tsx`（例如 `ConfirmModal.tsx`）
- 工具文件：
  - 模块内工具：`<feature>-utils.ts` 或 `xxx-utils.ts`
  - lib 层工具：优先放在 `src/lib/*`，并保持单一职责

## 2. 导出规则

- 组件优先使用 **具名导出**：`export function Xxx() {}`
- 默认导出仅用于工具配置类文件（例如 `vite.config.ts`）

## 3. 标识符命名

- 组件：`PascalCase`
- hook：`useXxx`
- 事件处理：`handleXxx`（不要写 `onClick1` 这类）
- 布尔值：`isXxx` / `hasXxx` / `canXxx`
- 常量：`UPPER_SNAKE_CASE`

## 4. 反模式（禁止/不推荐）

- 不推荐 `data` / `info` / `tmp` 这类泛化命名（除非作用域极小）
- 不推荐单字母变量（循环索引除外）
- 不推荐在多个模块里出现同名但语义不同的 `Config`/`Item`（加前缀）

## 5. 文件与函数规模建议（建议遵守）

说明：前端 UI 文件往往更长，但仍应控制复杂度。

- 单文件建议 ≤ 350 行（超过则考虑拆分子组件/抽取 hooks/抽取纯函数）
- 单函数建议 ≤ 60 行（超过则考虑拆分步骤或抽出工具函数）
- 单组件建议控制 props 数量，避免“十几个布尔开关”的组件 API
