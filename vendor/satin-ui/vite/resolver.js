// satin-ui/resolver：供 unplugin-vue-components / unplugin-auto-import 使用的自动按需解析器。
// 零依赖、按需解析轻组件（satin-ui/vue）与重组件（satin-ui/vue/grid、charts、chat、flow、markdown、tree），并自动附带精确 CSS 分片。
//
// 用法（vite.config.ts）：
//   import Components from "unplugin-vue-components/vite";
//   import AutoImport from "unplugin-auto-import/vite";
//   import { satinResolver, satinDirectiveResolver, satinAutoImportPreset } from "satin-ui/resolver";
//
//   plugins: [
//     vue(),
//     Components({ resolvers: [satinResolver(), satinDirectiveResolver()] }),
//     AutoImport({ imports: [satinAutoImportPreset()] }),
//   ]
import { VUE_COMPONENT_ENTRIES, stylesForSymbol } from "../src/core/style-map.js";

/**
 * unplugin-vue-components 组件解析器：
 * 模板里直接写 `<SnButton>`、`<SnSegmented>`、`<SnDataGrid>`、`<SnAreaChart>`、`<SnChat>`，
 * 自动按需导入对应子路径与最小化 CSS 分片，无需全局 app.use(Satin)。
 */
export function satinResolver(options = {}) {
  const { prefix = "Sn", importStyle = true, reset = false, exclude } = options;
  const excludeSet = exclude ? new Set(exclude) : null;
  return {
    type: "component",
    resolve(componentName) {
      if (!componentName) return;
      if (prefix && !componentName.startsWith(prefix)) return;
      const bare = prefix ? componentName.slice(prefix.length) : componentName;
      if (!bare || (excludeSet && (excludeSet.has(componentName) || excludeSet.has(bare)))) return;
      const from = VUE_COMPONENT_ENTRIES[bare];
      if (!from) return;
      const sideEffects = importStyle ? stylesForSymbol(bare, { base: true, reset }) : undefined;
      return {
        name: bare,
        from,
        ...(sideEffects?.length ? { sideEffects } : {}),
      };
    },
  };
}

/**
 * unplugin-vue-components 指令解析器：
 * 模板里使用 `v-enhance` 时自动按需导入 `vEnhance`（satin-ui/vue）。
 */
export function satinDirectiveResolver(options = {}) {
  const { importStyle = true, reset = false } = options;
  return {
    type: "directive",
    resolve(name) {
      if (name !== "Enhance" && name !== "enhance") return;
      return {
        name: "vEnhance",
        from: "satin-ui/vue",
        ...(importStyle ? { sideEffects: reset ? "satin-ui/css/page.css" : "satin-ui/css" } : {}),
      };
    },
  };
}

/**
 * unplugin-auto-import 预设：自动按需导入 Satin Vue Composables 与反馈 API（useTheme / useLocale / toast / notify）。
 */
export function satinAutoImportPreset() {
  return {
    "satin-ui/vue": ["useTheme", "useLocale", "toast", "notify"],
  };
}

export default satinResolver;
