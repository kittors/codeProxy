// 布局组件 · 顶栏（Header）：
// 1. headerHTML(opts)：纯字符串渲染，支持 SSR 与框架封装共用
// 2. mountHeader(el, opts)：自动监听滚动容器切换 .sn-scrolled、同步导航选中态与 --sn-header-h、卸载时干净移除全部监听
// 仅动 box-shadow / background-color / opacity，绝不制造布局跳动或滚动弹跳。

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cx = (...a) => a.filter(Boolean).join(" ");

/**
 * 生成顶栏标准标记（纯函数，可在 Node / SSR 中直接调用）
 * @param {object} [opts]
 * @param {string} [opts.brand] 品牌名
 * @param {string} [opts.sub] 副标识（如文档、控制台）
 * @param {string} [opts.href] 品牌点击链接
 * @param {Array<string|{key?:string,label:string,href?:string}>} [opts.links] 导航链接
 * @param {string} [opts.active] 当前激活项的 key 或 label
 * @param {string} [opts.actions] 右侧操作区 HTML
 * @param {"sm"|"md"|"lg"} [opts.size] 高度档位（48 / 56 / 64）
 * @param {"default"|"wide"|"fluid"} [opts.width] 内容宽度（1200 / 1360 / 撑满）
 * @param {boolean} [opts.solid] 实面纯底（无毛玻璃）
 * @param {boolean} [opts.static] 内嵌/局部吸顶模式（演示或分栏内部用）
 */
export function headerHTML({
  brand = "Satin",
  sub = "",
  href = "#",
  links = [],
  active,
  actions = "",
  size = "md",
  width = "default",
  solid = false,
  static: isStatic = false,
} = {}) {
  const norm = links.map((it) => (typeof it === "string"
    ? { key: it, label: it, href: "#" }
    : { key: String(it.key ?? it.label), label: String(it.label ?? it.key), href: it.href ?? "#" }));
  const cur = active ?? norm[0]?.key;
  const cls = cx(
    "sn-header",
    size && size !== "md" && `sn-${size}`,
    width && width !== "default" && `sn-${width}`,
    solid && "sn-solid",
    isStatic && "sn-static",
  );
  const nav = norm.length
    ? `<nav class="sn-header-nav" aria-label="主导航">${norm.map((it) => {
      const on = it.key === cur;
      return `<a href="${esc(it.href)}" data-key="${esc(it.key)}"${on ? ' class="sn-on" aria-current="page"' : ""}>${esc(it.label)}</a>`;
    }).join("")}</nav>`
    : "";
  const end = actions ? `<div class="sn-header-end">${actions}</div>` : "";
  return `<header class="${cls}"><div class="sn-header-in"><a class="sn-header-brand" href="${esc(href)}">${esc(brand)}${sub ? `<small>${esc(sub)}</small>` : ""}</a>${nav}${end}</div></header>`;
}

/**
 * 接管已有顶栏元素的滚动底线与导航切换交互
 * @param {HTMLElement} el .sn-header 元素或其容器
 * @param {object} [opts]
 * @param {Window|HTMLElement|null} [opts.scrollTarget] 滚动监听目标（默认 window；传 null 关闭滚动底线监听）
 * @param {number} [opts.threshold] 触发 .sn-scrolled 的滚动阈值（默认 4px）
 * @param {string} [opts.active] 初始激活的导航 key
 * @param {(key: string, el: HTMLElement) => void} [opts.onNavigate] 导航点击回调
 */
export function mountHeader(el, opts = {}) {
  const hdr = el.classList.contains("sn-header") ? el : el.querySelector(".sn-header") || el;
  const threshold = opts.threshold ?? 4;
  const target = "scrollTarget" in opts ? opts.scrollTarget : (typeof window !== "undefined" ? window : null);
  const cleanups = [];
  const on = (t, type, fn, opt) => {
    t.addEventListener(type, fn, opt);
    cleanups.push(() => t.removeEventListener(type, fn, opt));
  };

  const readTop = () => {
    if (!target) return 0;
    if (target === window) return window.scrollY || document.documentElement.scrollTop || 0;
    return target.scrollTop || 0;
  };
  const syncScroll = () => {
    hdr.classList.toggle("sn-scrolled", readTop() > threshold);
  };
  if (target) {
    on(target, "scroll", syncScroll, { passive: true });
    syncScroll();
  }

  const nav = hdr.querySelector(".sn-header-nav");
  let activeKey = opts.active ?? nav?.querySelector("[aria-current='page'], .sn-on")?.dataset.key ?? null;

  const setActive = (key) => {
    activeKey = key;
    if (!nav) return;
    for (const item of nav.querySelectorAll("a, button")) {
      const k = item.dataset.key || item.textContent.trim();
      const onItem = k === key;
      item.classList.toggle("sn-on", onItem);
      if (onItem) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
  };
  if (opts.active != null) setActive(opts.active);

  if (nav) {
    on(nav, "click", (e) => {
      const item = e.target.closest("a, button");
      if (!item || !nav.contains(item)) return;
      if (item.getAttribute("href") === "#") e.preventDefault();
      const key = item.dataset.key || item.textContent.trim();
      setActive(key);
      opts.onNavigate?.(key, item);
      hdr.dispatchEvent(new CustomEvent("sn-navigate", { bubbles: true, detail: { key, item } }));
    });
  }

  return {
    el: hdr,
    get active() { return activeKey; },
    setActive,
    syncScroll,
    destroy: () => { while (cleanups.length) cleanups.pop()(); },
  };
}
