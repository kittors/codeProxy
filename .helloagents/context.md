# 项目上下文

## 项目名称

`code-proxy-admin`

## 技术栈

- React 19 + Vite + Bun
- Tailwind CSS v4（主后台）
- SCSS Modules（CPAMC 兼容管理中心）

## 入口与构建产物

- 主入口：`index.html` + `src/main.tsx`（当前渲染参考项目的 `App`，以业务功能对齐为准）
- 旧的多入口文件仍保留：`management.html` + `src/management.tsx`（不再作为默认构建入口）
- 构建产物：`dist/index.html` + `dist/assets/*`

## 主要目录

- 业务功能（对齐参考项目）：`src/pages/`、`src/components/`、`src/services/`、`src/stores/`、`src/i18n/`、`src/styles/*.scss`
- 新版后台（保留但当前非默认入口）：`src/app/`、`src/modules/`、`src/lib/`、`src/styles/index.css`
