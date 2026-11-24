// 页面级的全局行为，整页调一次 setup()：
//   Tooltip（悬停 / 聚焦带 data-tip 的元素出提示）、表单（复选框勾上弹一下、下拉在外面点一下收起、字段改了清错、
//   带 aria-disabled 的按钮点了不触发）、浮层栈（Esc 关最上面那层、点外面关）、右键菜单、看图键盘、输入框计数抖动、主题（深浅切换后重新上色）、手机软键盘让位（--sn-kb）。
// 导入这些模块本身没有副作用（Node、SSR 里 import 不报错）；这些行为要在浏览器里调 setup() 才装上。React / Vue 封装在第一次挂载组件时自动调。
// 重复调用没有影响；返回撤销函数（引用计数，最后一个调用者撤销时才真正撤掉）。
import { installTooltips } from "./core.js";
import { installForms } from "./form.js";
import { installOverlays } from "./overlay.js";
import { installLightbox } from "./lightbox.js";
import { installInputs } from "./input.js";
import { installTheme, setMode, getMode } from "./theme.js";
import { installViewport } from "./viewport.js";
import { useShared } from "./lifecycle.js";

export function setup() {
  if (typeof document === "undefined") return () => {};
  // 顺序和改造前各模块被导入时的先后一致（监听注册的先后会影响同一事件上几个处理函数谁先跑）
  return useShared("satin:setup", () => { installTooltips(); installForms(); installOverlays(); installLightbox(); installInputs(); installTheme(); installViewport();
    // 页面没引 theme-boot（根元素上没有 data-theme）：照 theme-boot 的规矩补上——存过的选择，没存过就跟着系统的深浅，系统换了也跟着换（不写 localStorage）
    if (!document.documentElement.dataset.theme) setMode(getMode(), { animate: false, persist: false });
  });
}
