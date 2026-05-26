---
name: frontend
summary: 前端样式与组件一致性（无前端则忽略）
---

<!-- AI-KIT:START -->

# 前端规范（Frontend Rules）

## Purpose

- 保持 UI 风格一致，并让布局/交互稳定可维护。

## When to Read

- 修改布局、组件样式、主题、或出现交互/性能问题时。

## Rules（通用）

- 组件优先复用设计系统/组件库，避免重复造轮子。
- 样式尽量“可组合、可复用、可搜索”，避免散落的私有样式与不可维护的魔法数。
- 对用户可见的 UI 改动，必须说明“做了什么 + 为什么”，并提供最小验证闭环：
  - Lint：`bun run lint`
  - 格式化：`bun run format`
  - 格式化检查：`bunx oxfmt . --check`
  - 构建：`bun run build`
  - （可选）测试：暂无（当前仓库未配置测试脚本/用例）
- 对用户可见的 UI 改动，真实界面验收是交付门槛，细则见 `rules/workflow.md`；默认依赖 `chrome:Chrome` 做真实 Chrome 页面检查，`computer-use` 或 Playwright 只在用户明确要求，或 Chrome 插件不可用/不可达时才作为替代。
  <!-- AI-KIT:END -->

<!-- PROJECT-OVERRIDES:START -->

（可选）在此处追加本项目的前端技术栈约束（例如：Tailwind/shadcn/ui/设计规范/无 CSS 文件等）。

<!-- PROJECT-OVERRIDES:END -->
