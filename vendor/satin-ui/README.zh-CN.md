# satin-ui

[English](./README.md) · [简体中文](./README.zh-CN.md)

零运行时依赖、框架无关的现代 Web UI 组件与设计规范库：提供 **React**、**Vue**、**Svelte**、**Web Components** 一等公民封装、W3C DTCG 设计令牌、声明式主题定制，以及完整 **中 / 英双语国际化**。

- **零强制运行时依赖、极致 Tree-Shaking**：纯 ESM 具名导出，完整 TypeScript 类型声明。
- **全框架开箱即用**：React 18+（支持 Next.js App Router）、Vue 3.3+（支持 Nuxt）、Svelte 5、无 Shadow DOM 自定义元素、Angular、Solid、Preact 与纯 HTML 均有一致体验。
- **企业级重组件按需子路径**：十万行 `DataGrid`、百万行 `CanvasGrid`、AI 流式对话 `Chat` 与 `ThreadRail`、零依赖高分屏 Canvas 图表（`AreaChart` / `BarChart` / `DonutChart` / `Chart3D`）、流程图 `Flow`、XSS 安全 `Markdown`。
- **声明式主题与多语言**：React 提供 `<SatinProvider>` / `<ThemeScope>` / `useTheme()` / `useLocale()`，Vue 提供 `app.use(Satin, options)` / `<SnThemeScope>` / `useTheme()` / `useLocale()`，内置带自定义 HSV 取色器的可视化主题面板。
- **SSR 安全 + 零样式污染**：全部样式位于 `@layer satin`，模块导入无副作用。

## 安装

```bash
pnpm add satin-ui
# 或 npm install satin-ui
```

## 快速上手

### 1. 引入样式

```ts
// 整页使用 Satin（包含轻量化 reset 与全部组件样式）
import "satin-ui/css/page.css";

// 嵌入已有项目（不含全局 reset，不干扰现有页面）
// import "satin-ui/css";

// 单文件压缩版（约 72.7 KB gzip，适合 CDN 或静态页直引）
// import "satin-ui/css/page.min.css";
```

### 2. React / Next.js

```tsx
import "satin-ui/css/page.css";
import en from "satin-ui/locales/en";
import { SatinProvider, Button, Segmented, Loader, Progress, toast } from "satin-ui/react";
import { AreaChart } from "satin-ui/react/charts";
import { Chat } from "satin-ui/react/chat";
import { DataGrid } from "satin-ui/react/grid";

export default function App() {
  return (
    <SatinProvider mode="auto" locale="zh-CN" theme={{ accent: "ink", radius: "pill" }}>
      <Segmented items={["概览", "分镜", "设置"]} defaultValue="概览" />
      <Button variant="primary" onClick={() => toast({ text: "已保存" })}>保存修改</Button>
      <Loader variant="matrix" size="md" />
      <Progress value={0.68} segments={8} tone="ok" />
    </SatinProvider>
  );
}
```

### 3. Vue 3 / Nuxt

```ts
import { createApp } from "vue";
import "satin-ui/css/page.css";
import Satin from "satin-ui/vue";
import App from "./App.vue";

createApp(App)
  .use(Satin, { mode: "auto", locale: "zh-CN", theme: { accent: "ink", radius: "pill" } })
  .mount("#app");
```

模板中直接使用 `<SnButton>`、`<SnSegmented v-model="view" />`、`<SnLoader variant="matrix" />`、`<SnProgress :value="0.68" :segments="8" />`、`<SnThemeScope mode="dark">`；重组件按需引入：

```ts
import { AreaChart, BarChart, DonutChart, Chart3D } from "satin-ui/vue/charts";
import { Chat, ThreadRail } from "satin-ui/vue/chat";
import { DataGrid } from "satin-ui/vue/grid";
```

### 4. 纯 HTML / Web Components

```html
<sn-segmented items='["概览","分镜"]' value="概览"></sn-segmented>
<sn-loader variant="matrix" size="lg"></sn-loader>
<button class="sn-btn sn-primary">保存修改</button>
<script type="module">
  import { setup, enhance, setLocale } from "satin-ui";
  import { defineElements } from "satin-ui/elements";
  setup();
  defineElements();
  enhance();
</script>
```

### 5. 首帧防闪深浅主题

- **Vite**：在 `vite.config.ts` 加入 `import satin from "satin-ui/vite"; plugins: [satin()]`。
- **Next.js / Nuxt**：导入 `import themeBoot from "satin-ui/theme-boot-script"` 并内联进 `<head>`。
- **纯 HTML**：在 `<head>` 顶部引入 `<script src="…/satin-ui/src/theme-boot.js"></script>`。

## 多语言（中 / 英）

```ts
import { setLocale } from "satin-ui";
import en from "satin-ui/locales/en";

setLocale("en", en);    // 一步切换到英文
setLocale("zh-CN");     // 切回简体中文
```

## 脚手架与 AI 编码技能

```bash
pnpm dlx satin-cli init my-app
```

## 浏览器支持

Chrome / Edge 117+、Safari 17.5+、Firefox 129+。

## License

[MIT](./LICENSE)
