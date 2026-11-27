// satin-ui/style-map：组件与 CSS 分片依赖清单
export const CSS_ORDER: readonly string[];
export const ALL_COMPONENT_CSS: readonly string[];
export const SUBPATH_STYLES: Record<string, string[]>;
export const SVELTE_STYLES: Record<string, string[]>;
export const SYMBOL_STYLES: Record<string, string[]>;
export const VUE_COMPONENT_ENTRIES: Record<string, string>;

export interface StyleResolveOptions {
  /** 是否包含基础令牌与基础样式（tokens.css、base.css），默认 true */
  base?: boolean;
  /** 是否包含页面级轻量 reset.css，默认 false */
  reset?: boolean;
  /** 返回路径前缀，默认 "satin-ui/css/" */
  prefix?: string;
}

export function resolveImportStyles(specifier: string, names?: string[]): { files: string[]; matched: boolean };
export function resolveStyles(entries: Array<{ specifier: string; names?: string[] }>, options?: StyleResolveOptions): string[];
export function stylesForSymbol(name: string, options?: StyleResolveOptions): string[];
