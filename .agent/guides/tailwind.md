# Tailwind v4 样式规范（强制）

本项目只允许 Tailwind v4 的 utility class 来实现所有样式。

## 1. 禁止项（强制）

以下写法一律禁止：

- 新增/修改任何自定义 CSS 选择器（`.xxx {}`、`:root`、`@media`、`@keyframes` 等）
- CSS Modules / SCSS / LESS
- JSX 内联样式：`style={{ ... }}`
- 注入 `<style>` 标签
- 使用 CSS 变量方案做“主题切换”（`var(--xxx)`、`.dark { --xxx: ... }` 等）

如果你认为“必须用 CSS 才能实现”，先停下来：说明原因，并给出 Tailwind 替代方案或最小例外方案（需要用户同意）。

## 2. 允许的全局样式文件内容

只允许在 `src/styles/index.css` 写 Tailwind 指令，例如：

- `@import "tailwindcss";`
- `@custom-variant dark (...)`
- `@theme { ... }`

禁止写任何选择器规则。

## 3. Dark 主题规则

- 只允许通过切换 `html` 的 `dark` class 触发暗色样式
- 组件样式使用 `dark:` 变体
- 主题切换逻辑以 `src/modules/ui/ThemeProvider.tsx` 为准

## 4. 动效与可降级

- 动效默认用 `motion-safe:` 限定
- 必须尊重 `motion-reduce:`（例如禁用旋转/过渡）
- 避免过度动效（后台系统以稳定、可读为主）

## 5. 避免视觉跳动（强烈建议）

- 数值展示使用 `tabular-nums`
- 文案切换导致宽度变化时加 `min-w-*` 或固定容器

