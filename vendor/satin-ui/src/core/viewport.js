// 手机软键盘：iOS Safari 弹出键盘时不缩小布局视口，贴底的操作栏、输入框会被键盘盖住。
// 用 visualViewport 算出键盘盖住了多高，写成根元素上的 --sn-kb（没有键盘时不写），贴底的东西用 bottom: var(--sn-kb, 0px) 让开。
// 双指放大（scale > 1）时可见区域也会变小，那不是键盘，不算。setup() 里装一次
export function installViewport() {
  const vv = typeof visualViewport !== "undefined" ? visualViewport : null; if (!vv) return;
  const root = document.documentElement;
  const upd = () => {
    const kb = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
    if (kb > 60) root.style.setProperty("--sn-kb", kb + "px"); else if (root.style.getPropertyValue("--sn-kb")) root.style.removeProperty("--sn-kb");
  };
  vv.addEventListener("resize", upd); vv.addEventListener("scroll", upd);
}
