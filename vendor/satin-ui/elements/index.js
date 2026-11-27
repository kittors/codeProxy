// satin-ui/elements：不带 Shadow DOM 的自定义元素。放进页面就自动挂载、移出页面自动销毁，属性变了自动 update。
// 纯 HTML、Angular、Svelte、Solid、任何能写 HTML 的地方都能用：
//   <sn-segmented items='["网格","列表"]' value="网格"></sn-segmented>
//   el.addEventListener("sn-change", (e) => e.detail)
// · 按需注册（推荐，彻底 Tree-Shake 掉未用组件）：
//   import { defineSelect, defineSegmented } from "satin-ui/elements";
//   defineSelect(); defineSegmented();
// · 一次性注册全部内置元素：
//   import { defineElements } from "satin-ui/elements";
//   defineElements();
// 属性：JSON 能解析的按 JSON（数组、数字、true/false），否则按字符串；横线名转驼峰（default-value → defaultValue）
// <sn-enhance>…</sn-enhance>：包住写在标记上的一段组件，放进页面自动接上交互、移出页面自动撤掉
// 导入本身没有副作用：调 defineXxx() / defineElements() 才注册（Node / SSR 里调也不会报错，只是什么都不做）
import * as S from "../src/components.js";
import { setup } from "../src/setup.js";

const parse = (v) => { if (v == null) return undefined; try { return JSON.parse(v); } catch { return v; } };
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** 注册单个 Satin 自定义元素（可用于任意内置或自定义 createXxx 组件，支持 Tree-Shaking） */
export function defineElement(name, create, props = [], prefix = "sn") {
  if (typeof customElements === "undefined") return;
  const tag = name.includes("-") && !prefix ? name : `${prefix}-${name}`;
  if (customElements.get(tag)) return;
  const attrs = props.map((p) => p.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()));
  customElements.define(tag, class extends HTMLElement {
    static observedAttributes = attrs;
    opts() {
      const o = {};
      for (const a of attrs) if (this.hasAttribute(a)) o[camel(a)] = parse(this.getAttribute(a));
      // 自定义元素用 status="online" 表达在线点，避开 Svelte 5 / Angular / Solid 把 on* 属性当事件监听
      if (name === "avatar" && o.status === "online") { o.online = true; delete o.status; }
      return o;
    }
    // 插进页面后等这一轮同步代码跑完再创建：Angular 这类框架先插元素、同一轮里再设 [attr.xxx]，马上创建拿到的是空选项。
    // 微任务在下一帧画出来之前就跑完，纯 HTML 页面看不出差别
    connectedCallback() {
      if (this.inst || this.pending) return; this.style.display ||= "contents"; this.pending = true;
      queueMicrotask(() => { this.pending = false; if (!this.isConnected || this.inst) return; this.unsetup = setup(); this.inst = create(this, this.opts()); });
    }
    disconnectedCallback() { if (this.pending) return; this.inst?.destroy(); this.inst = null; this.unsetup?.(); this.unsetup = null; }
    attributeChangedCallback() { this.inst?.update(this.opts()); }
    get instance() { return this.inst; }
  });
}

/** 仅注册 <sn-enhance>：包住一段照设计稿写好的标记，放进页面自动 setup() + enhance()，移出页面自动撤掉 */
export function defineEnhance(prefix = "sn") {
  if (typeof customElements === "undefined") return;
  const tag = `${prefix}-enhance`;
  if (customElements.get(tag)) return;
  customElements.define(tag, class extends HTMLElement {
    connectedCallback() {
      if (this.off || this.pending) return; this.pending = true;
      const go = () => { this.pending = false; if (!this.isConnected || this.off) return; const unsetup = setup(), done = S.enhance(this); this.off = () => { done(); unsetup(); }; };
      // 页面还在解析（元素先定义、标记后到）：等子元素都解析完再接；否则等这一轮同步代码跑完（框架先插元素再填内容）
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true }); else queueMicrotask(go);
    }
    disconnectedCallback() { if (this.pending) return; const f = this.off; this.off = null; f?.(); }
  });
}

// ———— 按需单组件注册函数（纯函数调用，只 import 用到的那几个，未用到的组件会被打包器完整摇掉） ————
export const defineSegmented = (prefix = "sn") => defineElement("segmented", S.createSegmented, ["items", "value", "size", "label"], prefix);
export const defineAvatar = (prefix = "sn") => defineElement("avatar", S.createAvatar, ["src", "name", "seed", "size", "label", "decorative", "status", "online"], prefix);
export const defineEmptyArt = (prefix = "sn") => defineElement("empty-art", S.createEmptyArt, ["name", "label"], prefix);
export const defineLoader = (prefix = "sn") => defineElement("loader", S.createLoader, ["variant", "size", "color", "speed", "label"], prefix);
export const defineSlider = (prefix = "sn") => defineElement("slider", S.createSlider, ["value", "max", "label"], prefix);
export const defineSelect = (prefix = "sn") => defineElement("select", S.createSelect, ["items", "value", "placeholder", "label"], prefix);
export const defineOtp = (prefix = "sn") => defineElement("otp", S.createOtp, ["length", "mask", "reveal"], prefix);
export const defineTabs = (prefix = "sn") => defineElement("tabs", S.createTabs, ["tabs", "value"], prefix);
export const definePager = (prefix = "sn") => defineElement("pager", S.createPager, ["total", "page", "count"], prefix);
export const defineCollapse = (prefix = "sn") => defineElement("collapse", S.createCollapse, ["items", "single", "open"], prefix);
export const defineTagInput = (prefix = "sn") => defineElement("tag-input", S.createTagInput, ["tags", "max", "placeholder", "hint"], prefix);
export const defineStepper = (prefix = "sn") => defineElement("stepper", S.createStepper, ["value", "min", "max", "unit", "label"], prefix);
export const defineNumberFlow = (prefix = "sn") => defineElement("number-flow", S.createNumberFlow, ["value", "effect"], prefix);

const COMPONENTS = {
  segmented: [S.createSegmented, ["items", "value", "size", "label"]],
  avatar: [S.createAvatar, ["src", "name", "seed", "size", "label", "decorative", "status", "online"]],
  "empty-art": [S.createEmptyArt, ["name", "label"]],
  loader: [S.createLoader, ["variant", "size", "color", "speed", "label"]],
  slider: [S.createSlider, ["value", "max", "label"]],
  select: [S.createSelect, ["items", "value", "placeholder", "label"]],
  otp: [S.createOtp, ["length", "mask", "reveal"]],
  tabs: [S.createTabs, ["tabs", "value"]],
  pager: [S.createPager, ["total", "page", "count"]],
  collapse: [S.createCollapse, ["items", "single", "open"]],
  "tag-input": [S.createTagInput, ["tags", "max", "placeholder", "hint"]],
  stepper: [S.createStepper, ["value", "min", "max", "unit", "label"]],
  "number-flow": [S.createNumberFlow, ["value", "effect"]], // 不观察 style：那是写 CSS 的属性
};

export function defineElements(prefix = "sn") {
  if (typeof customElements === "undefined") return;
  for (const [name, [create, props]] of Object.entries(COMPONENTS)) defineElement(name, create, props, prefix);
  defineEnhance(prefix);
}
