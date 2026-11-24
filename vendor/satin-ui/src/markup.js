// 框架封装共用的标记生成（和设计稿里的标记一模一样）：菜单、上传、侧栏。不碰 document，服务端也能调
import { icon } from "./icons.js";
import { scoped } from "./i18n.js";
import I18N_COMPONENTS from "./locales/zh-CN/components.js";
import I18N_NAV from "./locales/zh-CN/nav.js";
const tt = /* @__PURE__ */ scoped({ ...I18N_COMPONENTS, ...I18N_NAV }); // 两份词表的键不重名（components.x、nav.x）
const cx = (...a) => a.filter(Boolean).join(" ");
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ———— 浮动菜单（.sn-menu.sn-float）：根菜单 + 各层子菜单 ————
// items：[{ key, label, icon, kbd, danger, disabled, checked, children }]；分隔线 { type: "divider" }；分组标题 { type: "group", label }。
// key 不给就用 label；children 是子菜单（id 是 根菜单 id-1、-2……，库按 data-sub 找）
export function menuHTML(items, id, label, surface) {
  let n = 0; const subs = [];
  const surfCls = surface === "blur" ? " sn-blur" : surface === "solid" ? " sn-solid" : "";
  const menu = (list, mid, sub, aria) => {
    const rows = (list || []).map((it) => {
      if (it.type === "divider") return '<div class="sn-sep"></div>';
      if (it.type === "group") return `<div class="sn-head">${esc(it.label)}</div>`;
      const sid = it.children?.length ? `${id}-${++n}` : "";
      if (sid) subs.push(menu(it.children, sid, true, it.label));
      return `<div class="${cx("sn-item", it.disabled && "sn-is-off", it.danger && "sn-danger-item", it.checked && "sn-sel")}" role="menuitem" data-key="${esc(it.key ?? it.label)}"`
        + (it.disabled ? ' aria-disabled="true"' : "") + (sid ? ` data-sub="${sid}" aria-haspopup="menu"` : "") + ">"
        + (it.icon ? icon(it.icon) : "") + `<span data-tip-full>${esc(it.label)}</span>` + (it.kbd ? `<span class="sn-key sn-sc">${esc(it.kbd)}</span>` : "") /* sn-sc：是快捷键（触屏上藏起来），区别于"JPG · PNG"这种说明 */
        + (it.checked ? `<span class="sn-chk">${icon("check")}</span>` : "") + (sid ? icon("chevron-right").replace('class="sn-ic"', 'class="sn-ic sn-more"') : "") + "</div>";
    }).join("");
    return `<div class="sn-menu sn-float${sub ? " sn-sub" : ""}${surfCls}" id="${mid}" role="menu" tabindex="-1"${aria ? ` aria-label="${esc(aria)}"` : ""}>`
      + (sub ? `<div class="sn-item sn-back" role="menuitem">${icon("chevron-left")}<span></span></div>` : "") + rows + "</div>";
  };
  const root = menu(items, id, false, label);
  return root + subs.join("");
}
// 按 key 找回条目（子菜单里的也找）
export const findItem = (list, key) => { for (const it of list || []) { if (!it.type && String(it.key ?? it.label) === key) return it; const r = findItem(it.children, key); if (r) return r; } };

// ———— 上传：拖放区 + 文件列表 ————
// accept：".txt,.docx" 这种扩展名列表（也写到 <input accept>）或正则
export const acceptRe = (a) => (a instanceof RegExp ? a : a ? new RegExp("\\.(" + String(a).split(",").map((s) => s.trim().replace(/^\./, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter((s) => s && !s.includes("/")).join("|") + ")$", "i") : undefined);
export const uploadHTML = ({ title = tt("components.dropTitle"), pick = tt("components.dropPick"), hint, label, multiple = true, accept } = {}) =>
  `<div class="sn-drop" tabindex="0" role="button" aria-label="${esc(label ?? title + pick)}"><span class="sn-art">${icon("cloud-upload")}</span><b>${esc(title)} <u>${esc(pick)}</u></b>`
  + (hint ? `<span class="sn-hint">${esc(hint)}</span>` : "") + `<input type="file"${multiple ? " multiple" : ""}${typeof accept === "string" ? ` accept="${esc(accept)}"` : ""} hidden></div><div class="sn-files"></div>`;

// ———— 侧栏（.sn-app 里的 .sn-side）：顶部（标志、标题、收起按钮）、导航、底部 ————
// items / footer：[{ key, label, icon, badge, href }]，分组标题 { type: "group", label }；value 是选中的 key
const sideLink = (it, on) => it.type === "group" ? `<p>${esc(it.label)}</p>`
  : `<a${on ? ' class="sn-on"' : ""} data-key="${esc(it.key ?? it.label)}"${it.href ? ` href="${esc(it.href)}"` : ""}>${it.icon ? icon(it.icon) : ""}<span class="sn-lbl">${esc(it.label)}</span>${it.badge != null ? `<span class="sn-badge sn-soft">${esc(it.badge)}</span>` : ""}</a>`;
export const sidebarHTML = ({ items = [], footer = [], value, title = "", logo = true, collapsible = true } = {}) => {
  const on = (it) => !it.type && String(it.key ?? it.label) === String(value);
  return `<div class="sn-side-top">${logo ? '<span class="sn-logo"></span>' : ""}<b>${esc(title)}</b>`
    + (collapsible ? `<button type="button" class="sn-btn sn-ghost sn-sm sn-ibtn" data-collapse data-tip="${esc(tt("nav.10"))}" data-kbd="⌘\\" aria-label="${esc(tt("nav.10"))}">${icon("panel-left")}</button>` : "") + "</div>"
    + `<nav class="sn-side-nav"><span class="sn-hl-bar"></span><span class="sn-hl-ind"></span>${items.map((it) => sideLink(it, on(it))).join("")}</nav>`
    + (footer.length ? `<div class="sn-side-foot">${footer.map((it) => sideLink(it, on(it))).join("")}</div>` : "");
};
