// satin-ui/vite：Vite 插件，只做一件事——把 theme-boot 内联进 index.html 的 <head> 最前面（第一帧之前写好深浅主题、圆角，刷新不闪）。
//   import satin from "satin-ui/vite";
//   export default defineConfig({ plugins: [react(), satin()] });
// 不用 Vite 的项目：Next.js、Nuxt 见各自的示例（examples/next、examples/nuxt），纯 HTML 用 <script src="…/theme-boot.js"></script>
import boot from "../src/theme-boot-script.js";
export default function satin() {
  return { name: "satin-ui", transformIndexHtml: () => [{ tag: "script", children: boot, injectTo: "head-prepend" }] };
}
