// satin-ui/vite
export interface SatinViteOptions {
  /** 是否把 theme-boot 内联进 index.html 的 <head> 顶部（默认 true） */
  themeBoot?: boolean;
  /**
   * 样式自动注入策略（默认 false）：
   * - `"auto"`：静态分析代码里的 satin-ui 导入，只注入实际用到的最小 CSS 分片（按需加载）
   * - `"page"`：自动注入整页样式 satin-ui/css/page.css
   * - `"full"`：自动注入无重置全量样式 satin-ui/css
   * - `false`：不自动注入样式（由项目手动引入）
   */
  css?: false | "auto" | "page" | "full";
  /** 仅 `css: "auto"` 时生效：是否包含轻量化 reset.css（默认 true） */
  reset?: boolean;
}

export interface SatinVitePlugin {
  name: string;
  enforce?: "pre" | "post";
  transformIndexHtml?: () => { tag: "script"; children: string; injectTo: "head-prepend" }[];
  transform?: (code: string, id: string) => { code: string; map: null } | null;
}

/** Vite 插件：支持首帧防闪 theme-boot 与 `css: "auto"` 自动按需 CSS 注入。用法：plugins: [react(), satin({ css: "auto" })] */
export default function satin(options?: SatinViteOptions): SatinVitePlugin;
export function parseSatinImports(code: string): Array<{ specifier: string; names: string[] }>;
export function transformSatinCss(code: string, options?: { reset?: boolean; base?: boolean }): { code: string; injected: string[] } | null;
export { satinResolver, satinDirectiveResolver, satinAutoImportPreset } from "./resolver";
export type { SatinResolverOptions, ComponentResolver, ComponentResolveResult } from "./resolver";
