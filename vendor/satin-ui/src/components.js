// Satin 组件的统一 API：每个组件 createXxx(el, options) → { update(options), destroy(), on(type, fn), off, ...方法 }。
// · el 是空的：先按 options 渲染标记（框架封装、纯 JS 新建都用这种）；el 已经有标记：直接在上面接交互（展示页、服务端渲染出来的标记）
// · 事件三种接法拿到同一份数据：选项里的 onChange 这类回调、实例上的 on("change", fn)、根元素上冒泡的 DOM 事件 sn-change
// · destroy() 撤掉挂载时加的监听、观察器、定时器；el 是空的时候渲染的标记也一并清掉
// · createXxx.html(options) 是纯字符串函数：Node / SSR 里也能调，生成和展示页一模一样的标记
// 导入本身没有副作用。
import { defineComponent, track } from "./core/lifecycle.js";
import { initSeg, injectIcons, reduced as reducedMotion } from "./core/core.js";
import { icon } from "./foundation/icons.js";
import { svg } from "./foundation/svg.js";
import { check, chevronDown, chevronLeft, chevronRight, minus, plus, x } from "./foundation/icons/index.js";
import { initSlider, mountSelect, mountOtp, otpEyeHTML, BOX, busy, succeed, copied, removeChip } from "./form/form.js";
import { mountTabs, mountPager, setStep, mountUpload, mountReorder, mountSidebar } from "./navigation/nav.js";
import { mountCollapse } from "./data/data.js";
import { mountTagInput, mountStepper, mountPassword, mountEmail, mountSearch, mountCount, mountLongText, mountComposer, cmContextHTML, cmModeHTML, cmModelsHTML, syncComposerParts } from "./form/input.js";
import { numberFlow } from "./feedback/number.js";
import { scrollArea } from "./layout/scroll.js";
import { mountProgress, toast, notify } from "./feedback/feedback.js";
import { bindPickers, pickerHTML } from "./form/picker.js";
import { mountInfiniteList } from "./data/list.js";
import { mountPlayer, mountAudio, playerHTML, audioHTML } from "./media/media.js";
import { openPopover, popoverOf, openDialog, closeDialog, openDrawer, closeDrawer, mountCmdk, openMenu, closeMenu } from "./overlay/overlay.js";
import { openLightbox, closeLightbox } from "./media/lightbox.js";
import { tableHTML, mountTable, sortRows } from "./data/table.js";
import { browserTabsHTML, mountBrowserTabs } from "./layout/browser-tabs.js";
import { headerHTML, mountHeader } from "./layout/header.js";
import { carouselHTML, mountCarousel, bindVolumetric } from "./media/carousel.js";
import { presetAvatar } from "./data/avatar-presets.js";
export { presetAvatar, avatarSvg, AVATAR_IDS } from "./data/avatar-presets.js";
import { emptyArtSvg, emptyArtHTML, EMPTY_ART_IDS } from "./feedback/empty-art.js";
export { emptyArtSvg, emptyArtHTML, EMPTY_ART_IDS, headerHTML, mountHeader };

// 给内层实例补几个方法（destroy……）：按属性描述符合并，getter（value、tags……）不会变成快照
// 合并实例：more 的同名属性盖过 base 的，只有 destroy 两边都有时先后都调（原来直接盖掉，mountXxx 自己的 destroy 就丢了）
const ext = (base, more) => {
  const o = {}; Object.defineProperties(o, Object.getOwnPropertyDescriptors(base ?? {})); Object.defineProperties(o, Object.getOwnPropertyDescriptors(more));
  if (typeof base?.destroy === "function" && typeof more.destroy === "function") o.destroy = () => { try { base.destroy(); } finally { more.destroy(); } };
  return o;
};;
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cx = (...a) => a.filter(Boolean).join(" ");
const attrs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== false).map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join("");
// 选项条目统一成 { value, label }（也接受纯字符串）
const items = (list = []) => list.map((x) => (typeof x === "object" ? { value: String(x.value ?? x.label), label: String(x.label ?? x.value), disabled: !!x.disabled } : { value: String(x), label: String(x) }));

// ———— 纯样式组件：只有标记（React / Vue 封装直接渲染同样的标记） ————
export const buttonHTML = ({ text = "", variant = "secondary", size, icon: ic, iconAfter, round, selected, disabled, busy: bz, type = "button", tip, attrs: extra = {} } = {}) =>
  `<button${attrs({ type, class: cx("sn-btn", `sn-${variant}`, size && size !== "md" && `sn-${size}`, !text && ic && "sn-ibtn", round && "sn-round", selected && "sn-selected", disabled && "sn-is-disabled", bz && "sn-busy"), "aria-disabled": disabled ? "true" : null, "data-tip": tip, "aria-label": !text && tip ? tip : null, ...extra })}>`
  + (ic ? icon(ic, !text ? (size === "sm" ? 16 : 20) : 16) : "") + esc(text) + (iconAfter ? icon(iconAfter, 16).replace('class="sn-ic"', 'class="sn-ic sn-after"') : "") + `</button>`;
export const checkHTML = ({ label = "", checked, indeterminate, disabled, name, value } = {}) =>
  `<label class="sn-check"><input type="checkbox"${attrs({ checked, disabled, name, value, "data-indeterminate": indeterminate })}>${BOX}${esc(label)}</label>`;
export const switchHTML = ({ label = "", checked, disabled, name } = {}) =>
  `<label class="sn-switch"><input type="checkbox" role="switch"${attrs({ checked, disabled, name })}><span class="sn-track"><span class="sn-knob"></span></span>${esc(label)}</label>`;
export const inputHTML = ({ value = "", placeholder = "", size, type = "text", id, name, disabled, invalid } = {}) =>
  `<input${attrs({ class: cx("sn-input", size && size !== "md" && `sn-${size}`), type, id, name, value: value || null, placeholder: placeholder || null, disabled, "aria-invalid": invalid ? "true" : null })}>`;
// 字段：标签 + 控件 + 说明 + 错误。error 不传就没有错误区；传字符串就有（空字符串 = 先占好位置，之后 setFieldError 展开）。
// name 写成 data-f，validateForm 按它找规则
export const fieldHTML = ({ label = "", control = "", help = "", error, id, name } = {}) =>
  `<div class="${cx("sn-field", error && "sn-bad")}"${attrs({ "data-f": name })}>${label ? `<label class="sn-lbl"${attrs({ for: id })}>${esc(label)}</label>` : ""}${control}${help ? `<div class="sn-help">${esc(help)}</div>` : ""}${error != null ? `<div class="sn-err"><span>${esc(error)}</span></div>` : ""}</div>`;
export const chipHTML = ({ text = "", on, removable } = {}) => `<span class="${cx("sn-chip", removable && "sn-tag", on && "sn-on")}">${esc(text)}${removable ? `<button class="sn-x" aria-label="${tt("components.14")}${esc(text)}">${svg(x, 10, "x")}</button>` : ""}</span>`;
// 进度条（value 0–1；不给 value 是双段变速不确定进度；支持 active 微光、tone 状态色、segments 分段刻度、svg 圆头数值进度环）
const num = (v) => String(+v).replace(/^0\./, ".");
export const progressHTML = ({ value, ring, svg: svgRing, size, tone, active, segments, showValue, height } = {}) => {
  const tn = tone && tone !== "run" ? `sn-${tone}` : "";
  if (segments > 0) {
    const p = Math.max(0, Math.min(1, value ?? 0)), filled = Math.floor(p * segments), partial = p > 0 && p < 1 && filled < segments;
    return `<div class="${cx("sn-pseg", tn)}"${height ? ` style="--sn-p-h:${height}px"` : ""}>${Array.from({ length: segments }, (_, i) => `<i${i < filled ? ' class="sn-done"' : i === filled && partial ? ' class="sn-cur"' : ""}></i>`).join("")}</div>`;
  }
  if (ring && (svgRing || showValue)) {
    const p = Math.max(0, Math.min(1, value ?? 0));
    return `<span class="${cx("sn-pring-svg", size && size !== "md" && `sn-${size}`, tn)}" style="--sn-p:${num(p)}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="sn-pr-tr" cx="18" cy="18" r="15.9"/><circle class="sn-pr-fg" cx="18" cy="18" r="15.9" pathLength="100"/></svg>${showValue ? `<b>${Math.round(p * 100)}%</b>` : ""}</span>`;
  }
  if (ring) return `<span class="${cx("sn-pring", size === "lg" && "sn-lg")}" style="--sn-p:${num(value ?? 0)}"></span>`;
  const st = [value == null ? "" : `--sn-p:${num(value)}`, height ? `--sn-p-h:${height}px` : ""].filter(Boolean).join(";");
  return `<div class="${cx("sn-pbar", value == null && "sn-indet", active && "sn-active", size && size !== "md" && `sn-${size}`, tn)}"${st ? ` style="${st}"` : ""}><i></i></div>`;
};
// 动感几何加载器：matrix(3×3波纹点阵) / dots(弹性三点) / arc(可变弧长旋环) / orbit(双星微环) / bars(声纹四柱) / grid(2×2接力) / radar(同心涟漪) / morph(几何呼吸)
const LD_BODY = {
  matrix: "<i></i>".repeat(9),
  dots: "<i></i>".repeat(3),
  arc: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="sn-ld-tr" cx="12" cy="12" r="9"/><circle class="sn-ld-hd" cx="12" cy="12" r="9"/></svg>',
  orbit: "<i></i><i></i>",
  bars: "<i></i>".repeat(4),
  grid: "<i></i>".repeat(4),
  radar: "<i></i><i></i><b></b>",
  morph: "<i></i>",
};
export const LOADER_VARIANTS = Object.keys(LD_BODY);
export const loaderHTML = ({ variant = "matrix", size, color, speed, label = "Loading" } = {}) => {
  const v = Object.hasOwn(LD_BODY, variant) ? variant : "matrix";
  const st = [typeof size === "number" ? `--sn-ld-size:${size}px` : "", color ? `--sn-ld-color:${color}` : "", speed != null && speed !== 1 ? `--sn-ld-speed:${speed}` : ""].filter(Boolean).join(";");
  return `<span class="${cx("sn-ld", `sn-ld-${v}`, typeof size === "string" && size !== "md" && `sn-${size}`)}" role="status"${st ? ` style="${st}"` : ""}>${LD_BODY[v]}<span class="sn-sr">${esc(label)}</span></span>`;
};
export const createLoader = /* @__PURE__ */ defineComponent({
  name: "loader",
  defaults: { variant: "matrix", label: "Loading" },
  html: loaderHTML,
  mount(el, o) {
    let opts = { ...o };
    return {
      update(next) {
        opts = { ...opts, ...next };
        const tmp = document.createElement("div");
        tmp.innerHTML = loaderHTML(opts);
        const n = tmp.firstElementChild;
        if (n) { el.className = n.className; el.setAttribute("style", n.getAttribute("style") || ""); el.innerHTML = n.innerHTML; }
      },
      destroy() {},
    };
  },
});
export const spinnerHTML = ({ size } = {}) => `<span class="${cx("sn-spinner", size === "lg" && "sn-lg")}"></span>`;

// 按钮的等待、成功、复制：在已有按钮上用
export { busy, succeed, copied, removeChip, toast, notify };

// ———— 头像 ————
// 有照片用照片（src），没给或者加载失败就按 seed / name 稳定地挑一张预设（同一个名字永远是同一张）；头像里不放文字（"+3" 这种计数照旧写 .sn-av.sn-more）。
// 旁边已经写了名字（列表、表格、评论）就传 decorative：整个头像 aria-hidden；单独出现时 role="img"，读屏念 label（没给就念 name）。
// 尺寸 16 / 20 / 24 / 32（默认）/ 40 / 64，类名 sn-2xs / sn-xs / sn-sm / — / sn-lg / sn-xl；24 及以下用简化版预设。online 在右下角画在线点
const AV_SIZE = { 16: "sn-2xs", 20: "sn-xs", 24: "sn-sm", 32: "", 40: "sn-lg", 64: "sn-xl" };
const flag = (v) => v === "" || (v != null && v !== false && v !== "false"); // 自定义元素上只写属性名（<sn-avatar decorative>）值是空字符串，也算开
export const avatarHTML = ({ src, name, seed, size = 32, label, decorative: dec, online: on } = {}) => {
  const decorative = flag(dec), online = flag(on), s = +size || 32, lab = decorative ? "" : String(label ?? name ?? ""), key = String(seed ?? name ?? "");
  return `<span${attrs({ class: cx("sn-av", AV_SIZE[s], online && "sn-online"), style: s in AV_SIZE ? null : `--sn-s:${s}px`, role: lab ? "img" : null, "aria-label": lab || null, "aria-hidden": lab ? null : "true", "data-seed": src ? key : null })}>`
    + (src ? `<img src="${esc(src)}" alt="" decoding="async">` : presetAvatar(key, s).svg) + (online ? "<i></i>" : "") + `</span>`;
};
const AV_KEYS = ["src", "name", "seed", "size", "label", "decorative", "online"];
export const createAvatar = /* @__PURE__ */ defineComponent({
  name: "avatar",
  defaults: { size: 32 },
  html: avatarHTML,
  mount(el, o) {
    let opts = o;
    // 照片加载失败（坏链接、离线）：原地换成预设；服务端渲染出来的标记也能退回（seed 记在 data-seed 上）
    const watch = () => {
      const img = el.querySelector(":scope > img"); if (!img) return;
      const fail = () => { if (!img.isConnected) return; img.insertAdjacentHTML("afterend", presetAvatar(el.dataset.seed ?? opts.seed ?? opts.name ?? "", opts.size).svg); img.remove(); };
      if (img.complete && !img.naturalWidth && img.getAttribute("src")) fail(); else img.addEventListener("error", fail, { once: true });
    };
    watch();
    return {
      // 选项真变了才重画（父组件每次重新渲染都会调 update：不比一下，正在加载的照片会被换掉重来）；使用者自己加的非 sn- 类保留
      update(n, p) {
        opts = n; if (AV_KEYS.every((k) => n[k] === p[k])) return;
        const t = el.ownerDocument.createElement("template"); t.innerHTML = avatarHTML(n); const nu = t.content.firstElementChild;
        const keep = [...el.classList].filter((c) => !c.startsWith("sn-"));
        for (const a of ["style", "role", "aria-label", "aria-hidden", "data-seed"]) { const v = nu.getAttribute(a); if (v == null) el.removeAttribute(a); else el.setAttribute(a, v); }
        el.className = cx(nu.className, ...keep); el.replaceChildren(...nu.childNodes); watch();
      },
    };
  },
});

export const createEmptyArt = /* @__PURE__ */ defineComponent({
  name: "empty-art",
  defaults: { name: "projects" },
  html: emptyArtHTML,
  mount(el, o) {
    return {
      update(n, p) {
        if (n.name === p.name && n.label === p.label) return;
        const t = el.ownerDocument.createElement("template"); t.innerHTML = emptyArtHTML(n); const nu = t.content.firstElementChild;
        for (const a of ["role", "aria-label", "aria-hidden"]) { const v = nu.getAttribute(a); if (v == null) el.removeAttribute(a); else el.setAttribute(a, v); }
        el.replaceChildren(...nu.childNodes);
      },
    };
  },
});

// ———— 分段控件 ————
export const createSegmented = /* @__PURE__ */ defineComponent({
  name: "segmented",
  defaults: { items: [], size: "md" },
  // 服务端渲染的第一帧（脚本还没接上）：data-ssr + 选中项的 aria-selected，样式里让选中那格自己画成滑块的样子；接上以后换成真正的滑块，位置、样子一样
  html: (o) => { const its = items(o.items), on = Math.max(0, its.findIndex((it) => String(it.value) === String(o.value ?? its[0]?.value))); return `<div class="${cx("sn-seg", o.size === "sm" && "sn-sm")}" role="tablist" data-ssr${attrs({ "aria-label": o.label })}><span class="sn-thumb"></span>${its.map((it, i) => `<button type="button" data-v="${esc(it.value)}" role="tab" aria-selected="${i === on}" tabindex="${i === on ? 0 : -1}">${esc(it.label)}</button>`).join("")}</div>`; },
  mount(el, o, api) {
    const btns = () => [...el.querySelectorAll("button")], idxOf = (v) => Math.max(0, btns().findIndex((b) => (b.dataset.v ?? b.textContent.trim()) === String(v)));
    let value = o.value ?? (btns()[0]?.dataset.v ?? btns()[0]?.textContent.trim());
    const seg = initSeg(el, (v) => { value = String(v); api.emit("change", value); }, idxOf(value));
    // update：传进来的值换了（和上次给的比）、又和现在选中的不一样，才跟过去；只换了别的选项不动选中（不然非受控时会被打回初始值）
    return { update(n, p) { if (n.value != null && String(n.value) !== String(p.value) && String(n.value) !== String(value)) { value = String(n.value); seg.go(idxOf(value), false, true); } }, get value() { return value; }, select: (v) => { value = String(v); seg.go(idxOf(v), false, true); } };
  },
});

// ———— 滑块 ————
export const createSlider = /* @__PURE__ */ defineComponent({
  name: "slider",
  defaults: { value: 0, max: 100 },
  html: (o) => { const p = (Number(o.value) / Number(o.max || 100)) * 100; return `<div class="sn-slider" data-slider${o.max !== 100 ? ` data-max="${o.max}"` : ""} tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="${o.max}" aria-valuenow="${o.value}"${attrs({ "aria-label": o.label })}><span class="sn-rail"></span><span class="sn-fillbar" style="width: ${p}%;"></span><span class="sn-knob" style="left: ${p}%;"></span><span class="sn-bubble" style="left: ${p}%;">${esc(o.value)}</span></div>`; },
  mount(el, o, api) {
    initSlider(el);
    el.addEventListener("slide", (e) => api.emit("change", e.detail));
    return { update(n, p) { if (n.value != null && Number(n.value) !== Number(p.value) && Number(n.value) !== Number(el.getAttribute("aria-valuenow"))) el.setValue(Number(n.value)); }, get value() { return Number(el.getAttribute("aria-valuenow")); }, destroy() { delete el.setValue; } };
  },
});

// ———— 下拉选择 ————
export const createSelect = /* @__PURE__ */ defineComponent({
  name: "select",
  defaults: { items: [], placeholder: "", size: "md", up: false },
  html: (o) => {
    const list = items(o.items), cur = list.find((x) => x.value === String(o.value));
    return `<div class="${cx("sn-select", o.size && o.size !== "md" && `sn-${o.size}`, o.up && "sn-up")}" data-select><button type="button" class="sn-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false"${attrs({ "aria-label": o.label })}><span class="sn-val">${esc(cur ? cur.label : o.placeholder)}</span>${svg(chevronDown, 16, "chevron-down")}</button>`
      + `<div class="${cx("sn-menu", o.up && "sn-up")}" role="listbox" aria-hidden="true">${list.map((it) => `<div class="${cx("sn-item", cur === it && "sn-sel", it.disabled && "sn-is-off")}" role="option" aria-selected="${cur === it}" data-v="${esc(it.value)}">${esc(it.label)}<span class="sn-chk">${svg(check, 16, "check")}</span></div>`).join("")}</div></div>`;
  },
  mount(el, o, api) {
    let s = mountSelect(el, { onChange: (v) => api.emit("change", v) }), sig = JSON.stringify(items(o.items));
    // 选项变了（异步载入、筛选）：按新选项重画菜单、重新接上；选中值留着（新选项里还有的话）
    const rebuild = (opts) => { s.close(); s.dispose(); const tmp = document.createElement("div"); tmp.innerHTML = createSelect.html(opts); el.replaceChildren(...tmp.firstElementChild.childNodes); s = mountSelect(el, { onChange: (v) => api.emit("change", v) }); };
    return {
      update(n, p) { const changed = n.value != null && String(n.value) !== String(p.value), ns = JSON.stringify(items(n.items)); if (ns !== sig) { sig = ns; rebuild({ ...n, value: changed ? n.value : s.value }); return; } if (changed && n.value !== s.value) s.set(n.value); },
      get value() { return s.value; }, open: () => s.open(), close: (r) => s.close(r), destroy() { s.close(); s.dispose(); selectsRelease(s); },
    };
  },
});
import { forgetSelect as selectsRelease } from "./form/form.js";
import { scoped } from "./foundation/i18n.js";
import I18N_DEFAULTS from "./foundation/locales/zh-CN/components.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);

// ———— 验证码 ————
export const createOtp = /* @__PURE__ */ defineComponent({
  name: "otp",
  defaults: { length: 6, mask: false, reveal: undefined },
  html: (o) => {
    const masked = flag(o.mask), showEye = o.reveal !== undefined ? flag(o.reveal) : masked;
    const type = masked ? ' type="password"' : "";
    return `<div class="sn-otp${masked ? " sn-masked" : ""}" data-otp${masked ? " data-mask" : ""}${showEye ? " data-reveal" : ""}>${Array.from({ length: o.length }, (_, i) => `${i === o.length / 2 && o.length % 2 === 0 ? '<span class="sn-gap"></span>' : ""}<input${type} inputmode="numeric" maxlength="1" aria-label="${tt("components.15", { p0: i + 1 })}">`).join("")}${showEye ? otpEyeHTML(masked) : ""}</div>`;
  },
  mount(el, o, api) {
    const mask = flag(o.mask), reveal = o.reveal !== undefined ? flag(o.reveal) : mask;
    const otp = mountOtp(el, { mask, reveal, onComplete: (v) => api.emit("complete", v) });
    return {
      update(n, prev) {
        const nextMask = flag(n.mask);
        if (nextMask !== flag(prev.mask)) otp.setMask(nextMask);
      },
      get value() { return otp.value; },
      get masked() { return otp.masked; },
      setMask: otp.setMask,
      clear: otp.clear,
      destroy() { delete el._otp; },
    };
  },
});

// ———— 标签页（标签条 + 面板） ————
export const createTabs = /* @__PURE__ */ defineComponent({
  name: "tabs",
  defaults: { tabs: [], value: 0 },
  html: (o) => `<div class="sn-tabs" data-ssr><div class="sn-tab-list" role="tablist">${o.tabs.map((t, i) => `<button${i === o.value ? ' class="sn-on"' : ""} role="tab">${esc(t.label)}${t.badge != null ? ` <span class="sn-badge sn-soft">${esc(t.badge)}</span>` : ""}</button>`).join("")}<span class="sn-ink"></span></div>`
    + `<div class="sn-tab-panels">${o.tabs.map((t, i) => `<div class="sn-tab-panel"${i === o.value ? "" : " hidden"}>${t.html ?? esc(t.content ?? "")}</div>`).join("")}</div></div>`,
  mount(el, o, api) {
    const t = mountTabs(el, { onChange: (i) => api.emit("change", i) });
    return { update(n, p) { if (n.value != null && n.value !== p.value && n.value !== t.index) t.select(n.value); }, get value() { return t.index; }, select: t.select, destroy() { delete el._tabs; } };
  },
});

// ———— 分页 ————
export const createPager = /* @__PURE__ */ defineComponent({
  name: "pager",
  defaults: { total: 1, page: 1, count: null },
  html: (o) => `<div class="sn-pager">${o.count != null ? `<span class="sn-total">${tt("components.16", { p0: esc(o.count) })}</span>` : ""}<button type="button" class="sn-btn sn-ghost sn-sm sn-ibtn" data-pg="prev" aria-label="${esc(o.prevLabel ?? tt("components.0"))}">${svg(chevronLeft, 16, "chevron-left")}</button><div class="sn-pages"></div><button type="button" class="sn-btn sn-ghost sn-sm sn-ibtn" data-pg="next" aria-label="${esc(o.nextLabel ?? tt("components.1"))}">${svg(chevronRight, 16, "chevron-right")}</button></div>`,
  mount(el, o, api) {
    const p = mountPager(el, { total: o.total, page: o.page, pageLabel: o.pageLabel, onChange: (n) => api.emit("change", n) });
    const total = () => el.querySelector(".sn-total");
    return {
      update(n, prev) {
        if (n.prevLabel !== prev.prevLabel) el.querySelector('[data-pg="prev"]')?.setAttribute("aria-label", n.prevLabel ?? tt("components.0"));
        if (n.nextLabel !== prev.nextLabel) el.querySelector('[data-pg="next"]')?.setAttribute("aria-label", n.nextLabel ?? tt("components.1"));
        if (n.pageLabel !== prev.pageLabel) p.setLabels(n.pageLabel);
        if (n.total != null && n.total !== prev.total) p.setTotal(n.total);
        if (n.page != null && n.page !== prev.page && n.page !== p.page) p.go(n.page, true);
        if (n.count != null && total()) total().textContent = tt("components.16", { p0: n.count });
      },
      get page() { return p.page; }, get total() { return p.total; }, go: p.go, destroy() { delete el._pg; },
    };
  },
});

// ———— 步骤条 ————
export const stepsHTML = ({ steps = [], current = 0 } = {}) => `<div class="sn-steps">${steps.map((s, i) => (i ? `<span class="${cx("sn-ln", i <= current && "sn-done")}"><i></i></span>` : "") + `<span class="${cx("sn-st", i < current && "sn-done", i === current && "sn-cur")}"><span class="sn-n">${i + 1}</span>${esc(s)}</span>`).join("")}</div>`;
export { setStep };

// ———— 折叠面板 ————
export const createCollapse = /* @__PURE__ */ defineComponent({
  name: "collapse",
  defaults: { items: [], single: false, open: [] },
  html: (o) => `<div class="sn-acc">${o.items.map((it, i) => `<div class="${cx("sn-acc-item", o.open.includes(i) && "sn-open")}"><button class="sn-acc-hd" aria-expanded="${o.open.includes(i)}">${svg(chevronRight, 16, "chevron-right")}${esc(it.title)}</button><div class="sn-acc-bd"><div>${it.html ?? `<p>${esc(it.content ?? "")}</p>`}</div></div></div>`).join("")}</div>`,
  mount(el, o, api) {
    // toggle 给的是第几项（数字）和展开没有（mountCollapse 内部回调给的是条目元素）；
    // change 给的是现在展开的序号：一次点击可能关一项、开一项（single），攒到这一轮结束只发一次
    let queued = false;
    const a = mountCollapse(el, { single: o.single, onToggle: (it, open) => {
      api.emit("toggle", { index: [...el.querySelectorAll(":scope > .sn-acc-item")].indexOf(it), open });
      if (!queued) { queued = true; queueMicrotask(() => { queued = false; api.emit("change", a.expanded); }); }
    } });
    return {
      // 受控：传进来的 open 换了（按值比）就照它开合，不发事件
      update(n, p) { if (Array.isArray(n.open) && JSON.stringify(n.open) !== JSON.stringify(p.open)) a.sync(n.open); },
      get expanded() { return a.expanded; }, open: a.open, close: a.close, toggle: a.toggle, destroy() { delete el._acc; },
    };
  },
});

// ———— 标签输入、数字步进、密码、邮箱、搜索、字数 ————
export const createTagInput = /* @__PURE__ */ defineComponent({
  name: "taginput",
  defaults: { tags: [], max: 8, get placeholder() { return tt("components.2"); } },
  // 两个并排的元素：输入框和下面的计数行（计数行在输入框的下一个兄弟元素里找）
  html: (o) => `<div class="sn-box-in sn-tagin" data-tagin data-max="${o.max}"><input placeholder="${esc(o.placeholder)}" aria-label="${tt("components.3")}"></div><div class="sn-tagin-foot"><span>${esc(o.hint ?? tt("components.13"))}</span><span class="sn-num"><span class="sn-roll"><span>0</span></span> / ${o.max}</span></div>`,
  mount(el, o, api) {
    const t = mountTagInput(el, { initial: o.tags, onChange: (tags) => api.emit("change", tags) });
    return {
      // 受控：传进来的 tags 换了（按值比）就照它显示，不发 change
      update(n, p) { if (Array.isArray(n.tags) && JSON.stringify(n.tags) !== JSON.stringify(p.tags)) t.set(n.tags); },
      get tags() { return t.tags; }, add: t.add, clear: t.clear, set: t.set, destroy() { delete el._tags; },
    };
  },
});
export const createStepper = /* @__PURE__ */ defineComponent({
  name: "stepper",
  defaults: { value: 0, min: 0, max: 100 },
  html: (o) => `<div class="sn-stepper" data-stepper data-min="${o.min}" data-max="${o.max}" data-value="${o.value}"><button class="sn-st-btn" data-d="-1" aria-label="${tt("components.4")}">${svg(minus, 16, "minus")}</button><span class="sn-st-val" tabindex="0" role="spinbutton"${attrs({ "aria-label": o.label })}><span class="sn-roll"><span>${o.value}</span></span></span>${o.unit ? `<span class="sn-st-unit">${esc(o.unit)}</span>` : ""}<button class="sn-st-btn" data-d="1" aria-label="${tt("components.5")}">${svg(plus, 16, "plus")}</button></div>`,
  mount(el, o, api) {
    const s = mountStepper(el, { onChange: (v) => api.emit("change", v) });
    return { update(n, p) { if (n.value != null && n.value !== p.value && n.value !== s.value) s.set(n.value, true); }, get value() { return s.value; }, set: (v) => s.set(v), destroy() { delete el._step; } };
  },
});
// 下面这几个是在已有的输入框标记上加强（标记见展示页"特殊输入框""字数统计"）
// ———— 密码、邮箱、搜索、计数输入框：给空容器就按选项渲染（和设计稿一样的标记），给已有标记就接交互 ————
// 渲染出来的是整个字段（标签、输入框、强度条 / 大写提示、错误区）；按钮（显示密码、清除）挂载时一起接上
const fieldWrap = (o, inner) => `<div class="sn-field"${attrs({ "data-f": o.name })}>${o.label ? `<label class="sn-lbl"${attrs({ for: o.id })}>${esc(o.label)}</label>` : ""}${inner}${o.help ? `<div class="sn-help">${esc(o.help)}</div>` : ""}<div class="sn-err"><span></span></div></div>`;
export const passwordHTML = (o = {}) => fieldWrap(o, `<span class="sn-ib sn-has-post"><input class="${cx("sn-input", o.size && "sn-" + o.size)}" type="password"${attrs({ id: o.id, name: o.name, placeholder: o.placeholder, autocomplete: o.autocomplete ?? (o.meter ? "new-password" : "current-password") })} data-pw><span class="sn-post"><button type="button" class="sn-eye" data-eye aria-label="${esc(tt("components.17"))}"><span class="sn-swap"><span class="sn-a" data-i="eye"></span><span class="sn-b" data-i="eye-off"></span></span></button></span></span>` +
  (o.meter ? `<div class="sn-pw-meter" data-level="0" aria-live="polite"><i></i><i></i><i></i><i></i><span class="sn-pw-label"><span class="sn-roll"><span> </span></span></span></div>` : "") +
  `<div class="sn-caps"><span><span data-i="triangle-alert"></span>${esc(tt("components.18"))}</span></div>`);
export const emailHTML = (o = {}) => fieldWrap(o, `<span class="sn-ib sn-has-post"><input class="${cx("sn-input", o.size && "sn-" + o.size)}" type="email"${attrs({ id: o.id, name: o.name, placeholder: o.placeholder ?? "name@example.com", autocomplete: o.autocomplete ?? "email" })} data-email><span class="sn-post"><svg class="sn-ok-mark" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg></span></span>`);
export const searchHTML = (o = {}) => `<span class="sn-ib sn-has-pre sn-has-post sn-search" data-clearable data-search><span class="sn-pre"><span class="sn-swap"><span class="sn-a" data-i="search"></span><span class="sn-b"><span class="sn-spin-ic"></span></span></span></span><input class="${cx("sn-input", o.size && "sn-" + o.size)}"${attrs({ id: o.id, name: o.name, placeholder: o.placeholder, "aria-label": o.label ?? o.placeholder })}><span class="sn-post"><span class="sn-res-count"></span>${o.kbd === false ? "" : `<span class="sn-kbd">${esc(o.kbd ?? "/")}</span>`}<button type="button" class="sn-clear" aria-label="${esc(tt("components.19"))}" data-i="x"></button></span></span>`;
export const countHTML = (o = {}) => `<span class="sn-ib sn-has-post sn-has-count"><input class="${cx("sn-input", o.size && "sn-" + o.size)}"${attrs({ id: o.id, name: o.name, placeholder: o.placeholder, maxlength: o.max ?? 20, value: o.value })} data-count><span class="sn-post"><span class="sn-counter"><span class="sn-roll"><span>0</span></span><span>/${+(o.max ?? 20)}</span></span></span></span>`;
const inputOf = (el, sel) => (el.matches?.(sel) ? el : el.querySelector(sel));
export const createPassword = /* @__PURE__ */ defineComponent({ name: "password", html: passwordHTML, mount(el, o, api) { injectIcons(el); const input = inputOf(el, "input[data-pw], input[type=password]"); if (o.value != null) input.value = o.value; mountPassword(input); _bindForms(input.closest(".sn-field") || el); input.addEventListener("input", () => api.emit("change", input.value)); return { get value() { return input.value; }, update(n) { if (n.value != null && n.value !== input.value) input.value = n.value; }, focus: () => input.focus() }; } });
export const createEmail = /* @__PURE__ */ defineComponent({ name: "email", html: emailHTML, mount(el, o, api) { const input = inputOf(el, "input[data-email], input[type=email]"); if (o.value != null) input.value = o.value; mountEmail(input); input.addEventListener("input", () => api.emit("change", input.value)); return { get value() { return input.value; }, update(n) { if (n.value != null && n.value !== input.value) input.value = n.value; }, focus: () => input.focus() }; } });
export const createSearch = /* @__PURE__ */ defineComponent({ name: "search", html: searchHTML, mount(el, o, api) { injectIcons(el); _bindForms(el); mountSearch(el.matches(".sn-ib") ? el : el.querySelector(".sn-ib") || el, { search: (q) => (api.emit("search", q), o.search?.(q) ?? 0), debounce: o.debounce ?? 150 }); return { destroy() { for (const x of [el, ...el.querySelectorAll("*")]) { delete x._fw; delete x._sr; } } }; } });
// 受控同步（update 里写进新值）时也要让计数、长高跟着变：派一次 input，但不当成用户的输入发 change
const quietInput = (field, v, flag) => { flag.on = true; field.value = v; field.dispatchEvent(new Event("input", { bubbles: true })); flag.on = false; };
export const createCount = /* @__PURE__ */ defineComponent({ name: "count", html: countHTML, mount(el, o, api) {
  const input = inputOf(el, "input[data-count], input"), quiet = { on: false }; mountCount(input);
  input.addEventListener("input", () => { if (!quiet.on) api.emit("change", input.value); });
  return { update(n, p) { if (n.value != null && n.value !== p.value && n.value !== input.value) quietInput(input, n.value, quiet); }, get value() { return input.value; }, focus: () => input.focus(), destroy() { delete input._cnt; } };
} });
// 长文本：输入框随内容长高、右下角用量环、⌘↵ 提交。给空容器就按选项渲染（和设计稿一样的标记）
export const longTextHTML = (o = {}) => { const max = +(o.max ?? 120);
  return `<div class="sn-box-in" data-ta data-max="${max}" data-max-lines="${+(o.maxLines ?? 7)}"><textarea${attrs({ id: o.id, name: o.name, rows: o.rows ?? 3, placeholder: o.placeholder, "aria-label": o.label })}>${esc(o.value ?? "")}</textarea>`
    + `<div class="sn-ta-foot"><span class="sn-hint">${esc(o.hint ?? tt("components.longHint"))}</span><span class="sn-ta-count"><svg class="sn-uring" viewBox="0 0 16 16"><circle class="sn-bg" cx="8" cy="8" r="6"/><circle class="sn-fg" cx="8" cy="8" r="6"/></svg><span class="sn-txt"><span class="sn-roll"><span>0</span></span> / ${max}</span></span></div></div>`; };
export const createLongText = /* @__PURE__ */ defineComponent({ name: "longtext", html: longTextHTML, mount(el, o, api) {
  const box = el.matches("[data-ta]") ? el : el.querySelector("[data-ta]") || el, ta = box.querySelector("textarea"), quiet = { on: false };
  mountLongText(box, { onSubmit: (v) => api.emit("submit", v) });
  ta.addEventListener("input", () => { if (!quiet.on) api.emit("change", ta.value); });
  return { update(n, p) { if (n.value != null && n.value !== p.value && n.value !== ta.value) quietInput(ta, n.value, quiet); }, get value() { return ta.value; }, focus: () => ta.focus() };
} });
// 提示词输入框的标记（和设计稿一样）：顶上可选双层上下文托盘、独立纯净大圆角主输入卡（附件区、自动长高输入框、模式/权限、模型双色阶选择、用量环、语音输入、发送 / 停止按钮）。
// external：发送由外面接管（对话框里用），不在这里清空。图标是 data-i，挂载时换成 SVG
// 新对话那一套（可选，不给时标记依然干净）：context 顶上的上下文托盘、mode 模式 / 权限、models / model 模型选择、voice 语音输入（默认开启）；
// 用了其中任何一样（或 fresh：对话里的新对话）输入框带 sn-cm-new——没写内容时提示原因、点附件缩略图看大图、发送按钮的图标随可发状态放大
export const composerHTML = ({ placeholder = "", max = 500, maxLines = 5, attach = true, voice = true, send = tt("components.12"), submitKey = "enter", external, context, mode, models, model, fresh } = {}) =>
  `<div class="sn-box-in sn-composer${fresh || context?.length || mode || models?.length ? " sn-cm-new" : ""}${context?.length ? " sn-has-ctx" : ""}" data-composer${external ? " data-external" : ""}${voice === false ? ' data-voice="off"' : ""}${submitKey === "mod-enter" ? ' data-submit-key="mod-enter"' : ""} data-max="${+max}" data-max-lines="${+maxLines}">${cmContextHTML(context)}<div class="sn-cm-card"><div class="sn-cm-files"></div><textarea rows="1" placeholder="${esc(placeholder)}"></textarea><div class="sn-cm-bar">` +
  (attach ? `<div class="sn-select sn-inline-menu sn-up"><button type="button" class="sn-btn sn-ghost sn-sm sn-ibtn sn-cm-add" data-menubtn data-cm-attach data-tip="${esc(tt("components.6"))}" aria-label="${esc(tt("components.7"))}" data-i="plus"></button><div class="sn-menu" role="menu" style="min-width:208px"><div class="sn-item" data-add="img" data-i="image:before">${esc(tt("components.8"))}<span class="sn-key">JPG · PNG</span></div><div class="sn-item" data-add="vid" data-i="film:before">${esc(tt("components.9"))}<span class="sn-key">MP4 · MOV</span></div><div class="sn-item" data-add="aud" data-i="audio-lines:before">${esc(tt("components.10"))}<span class="sn-key">MP3 · WAV</span></div><div class="sn-item" data-add="doc" data-i="file-text:before">${esc(tt("components.11"))}<span class="sn-key">PDF · DOCX</span></div></div></div>` : "") +
  cmModeHTML(mode) + `<span class="sn-grow"></span>${cmModelsHTML(models, model)}<span class="sn-ta-count"><svg class="sn-uring" viewBox="0 0 16 16"><circle class="sn-bg" cx="8" cy="8" r="6"/><circle class="sn-fg" cx="8" cy="8" r="6"/></svg></span>` +
  (voice !== false ? `<button type="button" class="sn-btn sn-ghost sn-sm sn-ibtn sn-cm-mic" data-cm-voice data-tip="${esc(tt("components.voice"))}" aria-label="${esc(tt("components.voice"))}" aria-pressed="false"><span class="sn-swap"><span class="sn-a" data-i="mic"></span><span class="sn-b"><span class="sn-cm-vw" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span></span></button>` : "") +
  `<button type="button" class="sn-cm-send" aria-label="${esc(send)}" data-tip="${esc(send)}" data-kbd="${submitKey === "mod-enter" ? "⌘↵" : "↵"}"><span class="sn-swap"><span class="sn-a" data-i="arrow-up"></span><span class="sn-b"><span class="sn-stop"></span></span></span></button></div></div></div>`;
export const createComposer = /* @__PURE__ */ defineComponent({ name: "composer", html: (o) => composerHTML(o), mount(el, o, api) {
  injectIcons(el);
  const c = mountComposer(el, { onSend: (m) => api.emit("send", m), onStop: () => api.emit("stop"), upload: o.upload, voice: o.voice, submitKey: o.submitKey,
    onModelChange: (v) => api.emit("modelChange", v), onModeChange: (v) => api.emit("modeChange", v),
    onContextChange: (e) => api.emit("contextChange", { ...e, item: api.options.context?.[e.index] }), onContextClick: (index) => api.emit("contextClick", { index, item: api.options.context?.[index] }) });
  return ext(c, {
    fill: (text) => el._cm.fill(text),
    update(n, p) { syncComposerParts(el._cm, n, p); if (n.submitKey !== p.submitKey) el._cm?.setSubmitKey?.(n.submitKey); },
    destroy() { el._cm?.stopVoice?.(true); for (const h of el.querySelectorAll(".sn-select")) h._select?.dispose?.(); delete el._cm; },
  });
} });

// ———— 数字滚动 ————
// effect：变化的样子（roll 滚动 / blur 模糊 / push 推入 / fade 淡入）。旧名 style 也认——但在 React、Vue、自定义元素里 style 是写 CSS 的，所以框架封装只用 effect
const effectOf = (o) => o.effect ?? o.style;
export const createNumberFlow = /* @__PURE__ */ defineComponent({
  name: "numberflow",
  defaults: { value: 0, style: "roll" },
  html: () => `<span class="sn-nf"></span>`,
  mount(el, o) {
    // reduced 默认跟系统的"减少动态效果"（和页面上的开关）：打开时直接换数字
    const f = numberFlow(el, { value: o.value, format: o.format, style: effectOf(o), reduced: o.reduced ?? reducedMotion });
    return { update(n, p) { if (n.value != null && n.value !== p.value && n.value !== f.get()) f.set(n.value); const e = effectOf(n); if (e && e !== effectOf(p)) f.setStyle(e); }, get value() { return f.get(); }, set: f.set, get: f.get, setStyle: f.setStyle };
  },
});

// ———— 滚动区域 ————
export const createScrollArea = /* @__PURE__ */ defineComponent({
  name: "scrollarea",
  mount(el, o) { const s = scrollArea(el, o); return ext(s, { el: s.el ?? el }); },
});

// ———— 进度（带取消、打开的进度卡片） ————
export const createProgressCard = /* @__PURE__ */ defineComponent({
  name: "progresscard",
  mount(el, o, api) { const p = mountProgress(el, { onCancel: () => api.emit("cancel"), onOpen: () => api.emit("open") }); return ext(p, { destroy() { delete el._pc; } }); },
});

// ———— 日期、时间、定时、地址选择器（标记见展示页"选择器"） ————
export const createPicker = /* @__PURE__ */ defineComponent({
  name: "picker",
  // 给空容器：按 kind（date | range | time | datetime | region）、placeholder、label 渲染和设计稿一样的标记（React、Vue、Svelte 的 DatePicker 用它）
  html: (o) => pickerHTML(o),
  // 选择器选好了值会在元素上发 pick（detail.text 是显示的文字），转成 onChange / sn-change
  // 只接 el 这一个（原来按父元素找，会把旁边的选择器也接上）；destroy 时撤掉标记，同一个元素可以再接一次
  mount(el, o, api) { bindPickers(el, { today: o.today, now: o.now }); el.addEventListener("pick", (e) => api.emit("change", e.detail)); return { destroy() { for (const h of [el, ...el.querySelectorAll("[data-pk]")]) delete h._pk; } }; },
});

// ———— 上传、拖动排序、侧边栏、无限列表 ————
export const createUpload = /* @__PURE__ */ defineComponent({ name: "upload", mount(el, o, api) { const u = mountUpload(el, { ...o, upload: o.upload }); return ext(u, { destroy() { delete el._upl; } }); } });
export const createReorder = /* @__PURE__ */ defineComponent({ name: "reorder", mount(el, o, api) { const r = mountReorder(el, { onReorder: (from, to, row) => api.emit("reorder", { from, to, row }), row: o.row }); return ext(r, { destroy() { delete el._ro; } }); } });
export const createSidebar = /* @__PURE__ */ defineComponent({ name: "sidebar", mount(el, o, api) { const s = mountSidebar(el, { onNavigate: (a) => api.emit("navigate", a), collapseBelow: o.collapseBelow }); return ext(s, { destroy() { delete el._side; } }); } });
export const createInfiniteList = /* @__PURE__ */ defineComponent({ name: "infinitelist", mount(el, o, api) { const l = mountInfiniteList(el, { ...o, onCount: (n) => api.emit("count", n) }); return ext(l, { destroy() { delete el._vl; } }); } });

// ———— 视频、音频 ————
export const createPlayer = /* @__PURE__ */ defineComponent({ name: "player", html: (o) => playerHTML(o), mount(el, o, api) { const p = mountPlayer(el, { onError: (e) => api.emit("error", e) }); return ext(p, { destroy() { delete el._player; } }); } });
export const createAudio = /* @__PURE__ */ defineComponent({ name: "audio", html: (o) => audioHTML(o), mount(el, o, api) { const a = mountAudio(el, { onError: (e) => api.emit("error", e) }); return ext(a, { destroy() { delete el._audio; } }); } });

// ———— 浮层：Popover、对话框、抽屉、命令面板、右键菜单、看图 ————
// Popover：el 是浮层面板（.sn-pop），trigger 是按钮
export function openPopoverAt(pop, trigger, options) { return openPopover(pop, trigger, options); }
export { popoverOf, openDialog, closeDialog, openDrawer, closeDrawer, openMenu, closeMenu, openLightbox, closeLightbox };
// 命令面板：和 mountCmdk 一样，多一个 destroy()——撤掉这次加的行、⌘K 监听（面板是这次建的就连面板一起去掉）。组件卸载时调它
export function createCommandPalette(groups, o) {
  const had = !!document.getElementById("cmdk-panel"), before = had ? new Set(document.getElementById("cmdkList").children) : null;
  const [api, dispose] = track(() => mountCmdk(groups, o));
  const panel = document.getElementById("cmdk-panel"), scrim = document.getElementById("cmdkScrim"), added = [...document.getElementById("cmdkList").children].filter((c) => !before?.has(c));
  let alive = true;
  return Object.assign(api, { destroy() { if (!alive) return; alive = false; if (panel.classList.contains("sn-open")) api.close(); dispose(); for (const c of added) c.remove(); if (!had) { panel.remove(); scrim?.remove(); } } });
}
export { wireDialog } from "./overlay/overlay.js";
export { icon } from "./foundation/icons.js";

// ———— 其余公开函数（设计稿和文档里用到的，原来只在各模块里导出）————
// 表单校验：validateForm(form) 逐个查 required / pattern / 自定义校验，把错误写到字段下面；setFieldError / clearFieldError 单独设、清
export { validateForm, setFieldError, clearFieldError, prepBusy, initSlider, mountSelect, bindSelects } from "./form/form.js";
// 列表增删的动画（FLIP）、乐观更新（先改界面、失败再退回）
export { insertWithFlip, removeWithFlip, flipSnapshot, optimistic } from "./navigation/nav.js";
// 骨架屏占位到真内容的过渡；Toast 的位置（右下、顶部居中……）
export { loadWithSkeleton, setToastPos, mountProgress } from "./feedback/feedback.js";
// 在任意位置开浮层（右键菜单、表格单元格里的编辑器）；在一段已有标记里把浮层的触发器接上
export { openPopover, bindOverlays } from "./overlay/overlay.js";
// 在一段已有标记里接上折叠面板、输入框（密码、邮箱、搜索、计数、长文本）、日期选择器
export { bindCollapses } from "./data/data.js";
export { bindInputs } from "./form/input.js";
export { bindPickers } from "./form/picker.js";

// ———— Chrome 浏览器式平滑弧形页标签（工作台顶栏） ————
export const createBrowserTabs = /* @__PURE__ */ defineComponent({
  name: "browsertabs",
  defaults: { tabs: [], addable: true },
  html: (o) => browserTabsHTML(o),
  mount: (el, o, api) => mountBrowserTabs(el, o, api.emit),
});
export { browserTabsHTML, mountBrowserTabs };

// ———— 设计感轮播图（arc 3D 弧形 / focus 体积焦点 / peek 探索画廊 / deck 立体叠牌）+ 体积感追光绑定 ————
export const createCarousel = /* @__PURE__ */ defineComponent({
  name: "carousel",
  defaults: { items: [], variant: "arc", index: 0, loop: true, arrows: true, dots: "pill", autoplay: 0 },
  html: (o) => carouselHTML(o),
  mount: (el, o, api) => mountCarousel(el, o, api.emit),
});
export { carouselHTML, mountCarousel, bindVolumetric };

// ———— 表格（真数据）：列定义 + 数据 → 设计稿里的 .sn-tbl；排序（行移到位）、勾选、多级展开、合并、拖行拖列、改列宽行高、固定列、占满剩余高度、贴底分页、空 / 加载 / 出错 ————
// 事件：sort、select、rowClick、expandChange、rowReorder、columnReorder、columnResize、rowResize、cellEdit、retry、layout（看得见的行定了）
export const createTable = /* @__PURE__ */ defineComponent({
  name: "table",
  defaults: { columns: [], rowKey: "id" },
  html: (o) => tableHTML(o),
  mount: (el, o, api) => mountTable(el, o, api.emit),
});
export { tableHTML, sortRows };
export { bindForms } from "./form/form.js";
export { bindBanners, closeBanner } from "./feedback/feedback.js";
export { autoGrow, longCount } from "./form/input.js";

// 一行接上整段标记：照设计稿写好的标记（下拉、复制按钮、筛选芯片、清除按钮、显示密码、自动长高、滑块、验证码、
// 搜索 / 密码 / 邮箱 / 计数输入框、折叠面板、日期选择器、浮层触发器、横幅的关闭），在 root 里一次全部接上交互，并把 data-i 换成图标。
// 纯 HTML 页面：setup(); enhance();   之后再插进来的标记：enhance(那一段)
// 返回撤销函数：撤掉接线时加的监听、观察器、定时器，拆掉包上去的滚动区域，去掉"已接过"的标记——同一段标记再接一次照样能用
// （React 的 useEffect 直接 return 它；StrictMode 开发时会接、撤、再接一遍）。
// wire(root)：可选，自己的接线（createXxx、addEventListener……）放在同一个作用域里跑，撤销时一起撤：
//   useEffect(() => enhance(ref.current, (root) => { createSegmented(root.querySelector(".sn-seg")); }), []);
import { bindForms as _bindForms } from "./form/form.js";
import { bindInputs as _bindInputs } from "./form/input.js";
import { bindCollapses as _bindCollapses } from "./data/data.js";
import { bindOverlays as _bindOverlays } from "./overlay/overlay.js";
import { bindBanners as _bindBanners } from "./feedback/feedback.js";
export const createHeader = /* @__PURE__ */ defineComponent({
  name: "header",
  defaults: { brand: "Satin", links: [], size: "md", width: "default", solid: false, static: false },
  html: (o) => headerHTML(o),
  mount: (el, o, api) => mountHeader(el, { ...o, onNavigate: (key, item) => { o.onNavigate?.(key, item); api.emit("navigate", { key, item }); } }),
});

export function enhance(root = typeof document !== "undefined" ? document : null, wire) {
  if (!root) return () => {};
  const scope = root.nodeType === 9 ? root.documentElement : root;
  // 接线前每个元素上已有的 _xxx（实例、"已接过"标记）；浮层触发器指向的面板可能在 root 外面，一起记
  const els = () => {
    const out = new Set([scope, ...scope.querySelectorAll("*")]), doc = scope.ownerDocument || document;
    for (const t of scope.querySelectorAll("[data-pop], [data-fmenu], [data-ctx], [data-dlg], [data-drawer]")) {
      const target = doc.getElementById(t.dataset.pop || t.dataset.fmenu || t.dataset.ctx || t.dataset.dlg || t.dataset.drawer);
      if (target) for (const n of [target, ...target.querySelectorAll("*")]) out.add(n);
    }
    return out;
  };
  const keys = (n) => Object.keys(n).filter((k) => k[0] === "_");
  const before = new Map([...els()].map((n) => [n, new Set(keys(n))]));
  const [, dispose] = track(() => {
    injectIcons(root);
    for (const art of root.querySelectorAll("[data-art]")) { const k = art.dataset.art; art.removeAttribute("data-art"); art.innerHTML = emptyArtSvg(k); }
    _bindForms(root); _bindInputs(root); _bindCollapses(root); bindPickers(root); _bindOverlays(root); _bindBanners(root); bindVolumetric(root);
    // 布局组件 · 顶栏：为非静态顶栏自动同步滚动底线与导航选中态
    for (const hdr of [...(root.matches?.(".sn-header") ? [root] : []), ...root.querySelectorAll(".sn-header:not(.sn-static)")]) mountHeader(hdr);
    // 侧栏布局：接上选中滑块、收起按钮、⌘\；窄于 720（手机、竖着的平板）自动收成图标栏（data-collapse-below 可改，0 不收）
    for (const app of [...(root.matches?.(".sn-app") ? [root] : []), ...root.querySelectorAll(".sn-app")]) if (app.querySelector(".sn-side-nav")) mountSidebar(app, { collapseBelow: +(app.dataset.collapseBelow ?? 720) });
    wire?.(root);
  });
  let done = false;
  return () => {
    if (done) return; done = true; dispose();
    for (const n of els()) { const had = before.get(n); for (const k of keys(n)) if (!had?.has(k)) delete n[k]; }
  };
}
