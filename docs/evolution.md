<!-- AI-KIT:START -->

# 演进记录（Evolution）

本文件用于记录“结构性变更 / 关键决策 / 规范调整”，帮助后续追溯“为什么现在是这样”。

## 记录原则

- 只记录“会影响后续维护与协作”的变更：目录结构、依赖方向、工具链切换、关键架构决策、重大行为变更。
- 每条记录必须包含：时间、变更内容、原因（why）、影响范围、回滚要点（如适用）。

## 条目模板（可复制）

```
## YYYY-MM-DD · 标题

### 背景

### 选项（可选）
- 方案 A：
- 方案 B：

### 结论

### 影响范围

### 回滚策略（如适用）
```

<!-- AI-KIT:END -->

<!-- PROJECT-OVERRIDES:START -->

（可选）在此处追加本项目的历史演进条目（脚手架不会覆盖）。

## 2026-02-22 · 引入 CPAMC 兼容管理中心（多页面构建）

### 背景

需要将上游项目 `Cli-Proxy-API-Management-Center` 的完整功能移植到本仓库，作为兼容入口补齐仪表盘/系统信息/使用统计等能力。

### 结论

- 保留现有 Tailwind 后台（`index.html` / `src/main.tsx`）。
- 新增第二页面入口 `management.html` / `src/management.tsx`，承载 CPAMC 兼容管理中心（HashRouter + SCSS Modules）。
- `vite.config.ts` 改为多页面构建，并补齐 `__APP_VERSION__`、SCSS 预处理与 CSS Modules 配置。

### 影响范围

- 新增大量 CPAMC 相关目录：`src/pages/`、`src/components/`、`src/services/`、`src/stores/`、`src/i18n/` 等。
- `dist/` 产物新增 `management.html` 及对应静态资源。
- 依赖新增：`axios`、`zustand`、`i18next`、`react-i18next`、`@uiw/react-codemirror`、`@codemirror/*`、`chart.js`、`react-chartjs-2`、`@tanstack/react-virtual`、`gsap`、`sass` 等。

### 回滚策略（如适用）

- 删除 `management.html`、`src/management.tsx`，并从 `vite.config.ts` 移除多页面 `rollupOptions.input` 与 SCSS/CSS Modules 配置。
- 移除 CPAMC 移植目录（`src/pages/` 等）及对应新增依赖后重新 `bun install`。

## 2026-02-22 · 业务功能补齐（保持默认入口为 Tailwind 后台）

### 背景

用户要求保持现有 UI（Tailwind 后台）不变，同时对齐参考项目缺失的业务功能；并明确“不需要管理中心（兼容）”相关入口暴露。

### 结论

- 默认入口保持为 `index.html` / `src/main.tsx`（`BrowserRouter` + `AppRouter`）。
- 默认构建入口仅保留 `index.html`，不再默认产出 `dist/management.html`（历史文件仍保留在仓库中）。
- 在不改变整体 UI 风格的前提下，补齐缺失业务页面与路由：新增 `/dashboard`、`/usage`、`/system` 等入口，并对齐参考项目的 usage 快照导入/导出能力。

### 影响范围

- 生产构建产物从双入口变为单入口：仅输出 `dist/index.html` + `dist/assets/*`。
- 侧边栏不再暴露“管理中心（兼容）”外链入口（历史文件仍可保留在磁盘上，但不作为默认交付）。

### 回滚策略（如适用）

- 如需恢复双入口产物：在 `vite.config.ts` 的 `build.rollupOptions.input` 中重新加入 `management.html`。

<!-- PROJECT-OVERRIDES:END -->
