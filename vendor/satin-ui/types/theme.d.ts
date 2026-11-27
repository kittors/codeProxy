// satin-ui/theme：主色、状态色、字体、字号、圆角、线条与动效节奏；随时改，所有组件跟着变
export interface ThemeChoice {
  accent: "ink" | "blue" | "indigo" | "green" | "amber" | "rose" | string;
  custom: string;
  font: "system" | "rounded" | "humanist" | "serif" | string;
  scale: "s" | "m" | "l" | "xl" | string;
  radius: "6" | "8" | "10" | "pill" | string;
  line: "fine" | "normal" | "crisp" | string;
  motion: "normal" | "crisp" | "off" | string;
  success: string;
  warning: string;
  danger: string;
}
export const ACCENTS: { id: string; name: string; light: string | null; dark: string | null }[];
export const FONTS: { id: string; name: string; sans: string | null }[];
export const SCALES: { id: string; name: string; v: number }[];
export const RADII: { id: string; name: string }[];
export const LINES: { id: string; name: string; l?: number; c?: number; d?: number; dc?: number }[];
export const MOTIONS: { id: string; name: string; v: number }[];
export const DEFAULTS: ThemeChoice;
export function get(): ThemeChoice;
export function set(patch: Partial<ThemeChoice>): void;
export function reset(): void;
export function onChange(fn: (t: ThemeChoice) => void): () => void;
export function vars(t: ThemeChoice, dark: boolean): Record<string, string>;
/** 把一套选择写到某个元素上（默认根元素；给局部元素就是局部主题） */
export function paint(el?: HTMLElement, t?: ThemeChoice): void;
/** 局部主题：页面某一块独立使用深浅和主色（不碰根元素、不写 localStorage），返回撤销函数 */
export function applyTheme(el: HTMLElement, options?: Partial<ThemeChoice> & { mode?: "light" | "dark" }): () => void;
export function luminance(hex: string): number;
export function onColor(hex: string): "#000000" | "#ffffff";
export function load(): ThemeChoice;
export function installTheme(): void;
/** 深浅模式："auto" 跟着系统；存在 localStorage（和 theme-boot 同一个键），换的时候整页交叉淡化 */
export function setMode(mode?: "auto" | "light" | "dark", options?: { animate?: boolean; persist?: boolean }): void;
export function getMode(): "auto" | "light" | "dark";
/** 主题定制面板（主色、状态色、字体、字号）：satin-ui/theme-panel */
/** 主题定制面板：主色、状态色、字体、字号。第二个参数不用给（以前要传的 initSeg / injectIcons 仍然接受） */
export function mountThemePanel(panel: HTMLElement, o?: { initSeg?: unknown; injectIcons?: unknown }): { sync(): void; destroy(): void };
export function themePanelHTML(): string;
/** 主题定制面板（统一写法）：destroy 退订主题变化、撤掉监听、清空容器 */
export const createThemePanel: import("./components").SatinFactory<Record<string, never>, { sync(): void }>;
