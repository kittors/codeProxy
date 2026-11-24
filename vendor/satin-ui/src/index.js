// satin-ui 主入口：页面级 setup()、组件生命周期工具、不依赖框架的基础函数，以及全部轻组件（和 satin-ui/components 同一批）。
// 都是具名导出、没有副作用，打包时没用到的会摇掉（只引一个组件，体积就只有那一个）。重组件（Markdown、对话、流程图、数据表格、看图、音视频）走各自的子路径。
// 导入本身没有副作用（Node、SSR 里 import 不报错）。
export { setup } from "./setup.js";
export { t, setLocale, addLocale, getLocale, intlLocale, onLocaleChange } from "./i18n.js";
export { defineComponent, track, useShared } from "./lifecycle.js";
export { $, $$, reduced, TICK, injectIcons, edgeFrames, fitScroll, fitStack, initSeg, showTip, hideTip, tipTarget, resetTipLayer } from "./core.js";
export { icon } from "./icons.js";
export * from "./components.js";
