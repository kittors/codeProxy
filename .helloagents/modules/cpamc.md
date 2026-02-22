# 参考项目业务功能（CPAMC）

## 目的

将上游 `Cli-Proxy-API-Management-Center` 的业务功能集成到本仓库，并以“页面/路由/交互尽量一致”为优先验收口径。

## 入口

- 页面入口：`index.html`
- 启动脚本：`src/main.tsx`
- 应用根组件：`src/App.tsx`（HashRouter）

## 关键依赖

- 状态管理：`zustand`
- 国际化：`i18next` + `react-i18next`
- 配置编辑：`@uiw/react-codemirror` + `@codemirror/lang-yaml`
- 图表：`chart.js` + `react-chartjs-2`
- 虚拟列表：`@tanstack/react-virtual`
- 样式：`sass`（SCSS Modules + 全局 SCSS）

## 注意事项

- 不移植任何真实 token/credential；仅保留前端交互与 API 调用逻辑。
- 样式体系以参考项目的全局 SCSS 为准；新版后台（Tailwind UI）目前保留但不作为默认入口。
