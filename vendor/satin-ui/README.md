# satin-ui

[English](./README.md) · [简体中文](https://github.com/kittors/Satin/blob/main/packages/satin-ui/README.zh-CN.md)

A zero-dependency, framework-agnostic Web UI component & design system library with first-class **React**, **Vue**, **Svelte**, and **Web Components** wrappers, W3C DTCG design tokens, custom theming, and complete **English & Simplified Chinese** i18n.

- **Zero Runtime Dependencies & Strict Tree-Shaking**: Pure ESM named exports with full TypeScript declarations.
- **Multi-Framework First-Class Ergonomics**: React 18+ (Next.js ready), Vue 3.3+ (Nuxt ready), Svelte 5, Web Components, Angular, Solid, Preact, and vanilla HTML.
- **Enterprise Heavy Components on Subpaths**: 100K-row `DataGrid`, 1M-row `CanvasGrid`, streaming AI `Chat` & `ThreadRail`, zero-dependency Canvas charts (`AreaChart`, `BarChart`, `DonutChart`, `Chart3D`), `Flow`, and XSS-safe `Markdown`.
- **Declarative Theme & Locale**: `<SatinProvider>` / `<ThemeScope>` / `useTheme()` / `useLocale()` (React) and `app.use(Satin, options)` / `<SnThemeScope>` / `useTheme()` / `useLocale()` (Vue), plus an interactive Theme Panel with a custom HSV color picker.
- **Zero Style Leakage & SSR Safe**: All styles live inside `@layer satin`; safe to import in Node/SSR with zero top-level DOM side effects.

## Installation

```bash
pnpm add satin-ui
# or
npm install satin-ui
```

## Quick Start

### 1. Import Styles

```ts
// Full-page Satin app (minimal reset + all component styles)
import "satin-ui/css/page.css";

// Embed in an existing project (no global reset)
// import "satin-ui/css";

// Single-file minified CSS (~72.7 KB gzip)
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
    <SatinProvider mode="auto" locale="en" messages={en} theme={{ accent: "ink", radius: "pill" }}>
      <Segmented items={["Overview", "Shots", "Settings"]} defaultValue="Overview" />
      <Button variant="primary" onClick={() => toast({ text: "Saved" })}>Save changes</Button>
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
import en from "satin-ui/locales/en";
import App from "./App.vue";

createApp(App)
  .use(Satin, { mode: "auto", locale: "en", messages: en, theme: { accent: "ink", radius: "pill" } })
  .mount("#app");
```

Use `<SnButton>`, `<SnSegmented v-model="view" />`, `<SnLoader variant="matrix" />`, `<SnProgress :value="0.68" :segments="8" />`, `<SnThemeScope mode="dark">` in templates, and import heavy components on demand:

```ts
import { AreaChart, BarChart, DonutChart, Chart3D } from "satin-ui/vue/charts";
import { Chat, ThreadRail } from "satin-ui/vue/chat";
import { DataGrid } from "satin-ui/vue/grid";
```

### 4. Vanilla HTML / Web Components

```html
<sn-segmented items='["Overview","Shots"]' value="Overview"></sn-segmented>
<sn-loader variant="matrix" size="lg"></sn-loader>
<button class="sn-btn sn-primary">Save changes</button>
<script type="module">
  import { setup, enhance, setLocale } from "satin-ui";
  import en from "satin-ui/locales/en";
  import { defineElements } from "satin-ui/elements";
  setLocale("en", en);
  setup();
  defineElements();
  enhance();
</script>
```

### 5. Zero-Flash Theme Boot

- **Vite**: `import satin from "satin-ui/vite"` → `plugins: [satin()]`.
- **Next.js / Nuxt**: Inline `import themeBoot from "satin-ui/theme-boot-script"` inside `<head>`.
- **Static HTML**: Add `<script src="…/satin-ui/src/theme-boot.js"></script>` at the top of `<head>`.

## Exports Reference

| Subpath | Description |
| --- | --- |
| `satin-ui` | `setup()`, `enhance()`, lightweight component factories, markup helpers, overlays, feedback, icons, i18n |
| `satin-ui/react`, `satin-ui/vue` | React 18+ / Vue 3.3+ components, `SatinProvider` / `ThemeScope` / `useTheme` / `useLocale`, `Loader`, `Progress`, `toast`, `notify` |
| `satin-ui/react/charts`, `satin-ui/vue/charts` | `AreaChart`, `BarChart`, `DonutChart`, `Chart3D`, `Sparkline`, `Icon3D` |
| `satin-ui/react/chat`, `satin-ui/vue/chat` | `Chat`, `ThreadRail` |
| `satin-ui/react/grid`, `satin-ui/react/canvas-grid` | `DataGrid` (100K rows) & `CanvasGrid` (1M rows); Vue equivalents at `satin-ui/vue/*` |
| `satin-ui/react/flow`, `satin-ui/react/markdown` | `Flow` & `Markdown`; Vue equivalents at `satin-ui/vue/*` |
| `satin-ui/elements`, `satin-ui/svelte/*.svelte` | Light-DOM Custom Elements & Svelte 5 components |
| `satin-ui/theme`, `satin-ui/theme-panel` | Theme engine (`setMode`, `set`, `applyTheme`) & visual Theme Panel with custom color picker |
| `satin-ui/css`, `satin-ui/css/page.css`, `satin-ui/css/min`, `satin-ui/css/page.min.css` | Modular source stylesheets and single-file minified CSS bundles |
| `satin-ui/tokens/*`, `satin-ui/locales/en`, `satin-ui/locales/zh-CN` | W3C DTCG design token JSONs & bilingual locale packs |

## CLI & AI Coding Skills

Scaffold a project with `satin-ui`, anti-flash setup, page recipes, and AI agent skills in one command:

```bash
pnpm dlx satin-cli init my-app
```

## Browser Support

Chrome / Edge 117+, Safari 17.5+, Firefox 129+.

## License

[MIT](./LICENSE)
