// satin-ui/elements：不带 Shadow DOM 的自定义元素，放进页面就自动挂载，移出页面自动销毁
/** 注册全部 13 个内置组件元素以及 <sn-enhance>；prefix 改前缀。按需打包请使用单组件注册函数（defineSelect、defineSegmented……） */
export function defineElements(prefix?: string): void;
/** 注册单个自定义元素（可用于内置或任意 createXxx 工厂） */
export function defineElement(name: string, create: import("./components").SatinFactory<any, any>, props?: string[], prefix?: string): void;
/** 仅注册 <sn-enhance>（包住一段写在标记上的组件：放进页面自动接上交互，移出页面自动撤掉） */
export function defineEnhance(prefix?: string): void;
export function defineSegmented(prefix?: string): void;
export function defineAvatar(prefix?: string): void;
export function defineEmptyArt(prefix?: string): void;
export function defineLoader(prefix?: string): void;
export function defineSlider(prefix?: string): void;
export function defineSelect(prefix?: string): void;
export function defineOtp(prefix?: string): void;
export function defineTabs(prefix?: string): void;
export function definePager(prefix?: string): void;
export function defineCollapse(prefix?: string): void;
export function defineTagInput(prefix?: string): void;
export function defineStepper(prefix?: string): void;
export function defineNumberFlow(prefix?: string): void;

/** 自定义元素通用属性（支持 React / Preact / Solid / Svelte 等 TSX 项目零报错编写 <sn-xxx>） */
export interface SatinCustomElementProps {
  id?: string;
  class?: string;
  className?: string;
  style?: string | Record<string, string | number | undefined>;
  slot?: string;
  ref?: unknown;
  children?: unknown;
  [attr: string]: unknown;
}

export interface SatinIntrinsicElements {
  "sn-enhance": SatinCustomElementProps;
  "sn-avatar": SatinCustomElementProps & { name?: string; src?: string; size?: number | string; decorative?: boolean | string; online?: boolean | string; status?: string };
  "sn-empty-art": SatinCustomElementProps & { name?: string; label?: string };
  "sn-loader": SatinCustomElementProps & { variant?: string; size?: number | string; color?: string; speed?: number | string; label?: string };
  "sn-segmented": SatinCustomElementProps & { items?: string; value?: string; size?: "sm" | "md"; label?: string };
  "sn-slider": SatinCustomElementProps & { value?: number | string; min?: number | string; max?: number | string; step?: number | string; label?: string };
  "sn-select": SatinCustomElementProps & { items?: string; value?: string; placeholder?: string; label?: string };
  "sn-otp": SatinCustomElementProps & { length?: number | string; value?: string; mask?: boolean | string; reveal?: boolean | string };
  "sn-tabs": SatinCustomElementProps & { tabs?: string; value?: number | string };
  "sn-pager": SatinCustomElementProps & { total?: number | string; page?: number | string; count?: number | string };
  "sn-collapse": SatinCustomElementProps & { items?: string; open?: string; single?: boolean | string };
  "sn-tag-input": SatinCustomElementProps & { tags?: string; max?: number | string; placeholder?: string; hint?: string };
  "sn-stepper": SatinCustomElementProps & { value?: number | string; min?: number | string; max?: number | string; unit?: string; label?: string };
  "sn-number-flow": SatinCustomElementProps & { value?: number | string; effect?: "roll" | "blur" | "push" | "fade" };
}

declare global {
  interface HTMLElementTagNameMap {
    "sn-enhance": HTMLElement;
    "sn-avatar": HTMLElement;
    "sn-empty-art": HTMLElement;
    "sn-loader": HTMLElement;
    "sn-segmented": HTMLElement;
    "sn-slider": HTMLElement;
    "sn-select": HTMLElement;
    "sn-otp": HTMLElement;
    "sn-tabs": HTMLElement;
    "sn-pager": HTMLElement;
    "sn-collapse": HTMLElement;
    "sn-tag-input": HTMLElement;
    "sn-stepper": HTMLElement;
    "sn-number-flow": HTMLElement;
  }
}
