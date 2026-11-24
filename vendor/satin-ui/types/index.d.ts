// satin-ui 主入口
import type { SatinInstance } from "./components";
export * from "./components";
/** 整页调一次：Tooltip、表单、浮层栈、看图键盘、主题这些页面级行为。重复调用没影响；返回撤销函数（引用计数） */
export function setup(): () => void;
/** 多语言取词（配合 setLocale / addLocale 使用） */
export function t(key: string, params?: Record<string, string | number>): string;
/** 注册一套语言包（例如 addLocale("en", en) 或自定义语言） */
export function addLocale(name: string, messages: Record<string, string>): void;
/** 切换语言或覆盖局部文案：支持 setLocale("en", en) 一步注册并切换，或 setLocale("zh-CN")，或传消息表局部覆写 */
export function setLocale(nameOrMessages: string | Record<string, string>, messages?: Record<string, string>): void;
/** 读取当前生效的语言代码（默认 "zh-CN"） */
export function getLocale(): string;
/** 返回适合 Intl.DateTimeFormat / Number.prototype.toLocaleString 的 BCP 47 语言代码 */
export function intlLocale(): string;
/** 订阅语言变更事件，返回退订函数 */
export function onLocaleChange(fn: (locale: string) => void): () => void;
export function defineComponent<O, I = {}>(def: { name: string; defaults?: Partial<O>; html?(o: O): string; mount(el: HTMLElement, o: O, api: { emit(type: string, detail?: unknown): void; readonly options: O }): (I & { update?(next: O, prev: O): void; destroy?(): void }) | void }): ((el: HTMLElement, options?: O) => SatinInstance<O> & I) & { html?(o?: O): string; componentName: string };
export function track<T>(fn: () => T): [T, () => void];
export function useShared(key: string, install: () => void): () => void;
export function reduced(): boolean;
export function injectIcons(scope?: ParentNode): void;
export function initSeg(seg: HTMLElement, onChange?: (value: string, index: number, anim: Animation | null) => void, start?: number): { go(index: number, focus?: boolean, instant?: boolean): void };
export function showTip(el: HTMLElement, text: string): void;
export function hideTip(): void;
export function fitScroll(el: HTMLElement, o?: { bar?: "none" | "hover" | "always" }): () => void;
export function fitStack(el: HTMLElement): () => void;
export function edgeFrames(from: [number, number], to: [number, number], toTransform: (edges: [number, number], squash: number) => string, k?: number): { frames: Keyframe[]; duration: number };
export const TICK: string;
export function $(sel: string, root?: ParentNode): HTMLElement | null;
export function $$(sel: string, root?: ParentNode): HTMLElement[];
