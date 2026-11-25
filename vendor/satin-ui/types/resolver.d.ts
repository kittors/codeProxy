// satin-ui/resolver：供 unplugin-vue-components / unplugin-auto-import 使用
export interface SatinResolverOptions {
  /** 模板里的组件前缀，默认 "Sn"（如 <SnButton>、<SnDataGrid>）；传 "" 可无前缀直接使用 */
  prefix?: string;
  /** 是否自动注入对应组件的最小 CSS 分片，默认 true */
  importStyle?: boolean;
  /** 是否在注入的 CSS 中包含轻量化 reset.css，默认 false */
  reset?: boolean;
  /** 排除不自动解析的组件名列表 */
  exclude?: string[];
}

export interface ComponentResolveResult {
  name: string;
  from: string;
  sideEffects?: string | string[];
}

export interface ComponentResolver {
  type: "component" | "directive";
  resolve(name: string): ComponentResolveResult | undefined;
}

/** unplugin-vue-components 组件按需解析器（支持轻组件与所有重组件子路径 + 自动最小 CSS） */
export function satinResolver(options?: SatinResolverOptions): ComponentResolver;
/** unplugin-vue-components 指令按需解析器（自动解析 v-enhance） */
export function satinDirectiveResolver(options?: Pick<SatinResolverOptions, "importStyle" | "reset">): ComponentResolver;
/** unplugin-auto-import 预设（自动导入 useTheme / useLocale / toast / notify） */
export function satinAutoImportPreset(): Record<string, string[]>;
export default satinResolver;
