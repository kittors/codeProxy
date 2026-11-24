// Satin：高性能树形控件（Tree）与文件管理/拟物文件夹（FileExplorer）。
// · 零依赖、Node/SSR 安全（顶层不触碰 document / window / matchMedia）
// · 全面复用 Satin 原生组件：scrollArea（悬浮细滚动条与边缘渐隐）、openMenu（右键菜单与二级子菜单）、initSeg（流体分段视图切换）、toast（撤销倒计时提示）、BOX/popCheck（三态复选框）
// · 支持 PDF / Word / PPT / Vue / TSX / TXT / Markdown / 图片小图 / 视频首帧 / 音频 / 代码 全格式微缩内容呈现，拟物文件夹夹层真实随子内容动态变化
import { icon } from "./icons.js";
import { reduced, initSeg, retip } from "./core.js";
import { scrollArea } from "./scroll.js";
import { BOX, popCheck } from "./form.js";
import { openMenu, closeMenu } from "./overlay.js";
import { toast } from "./feedback.js";
import { defineComponent, onCleanup } from "./lifecycle.js";
import { scoped } from "./i18n.js";
import I18N_DEFAULTS from "./locales/zh-CN/tree.js";

const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cssSize = (v, fallback) => (v == null ? fallback : typeof v === "number" ? v + "px" : String(v));
const cloneTree = (list) => (Array.isArray(list) ? list.map((n) => ({ ...n, ...(Array.isArray(n.children) ? { children: cloneTree(n.children) } : {}) })) : []);
let uidSeq = 0;
const nextUid = (prefix) => `${prefix}-${++uidSeq}`;

// 无外网依赖的电影级内置矢量首帧/实景缩略兜底图（若节点传了 preview URL 则优先展示真图）
const FALLBACK_STILLS = [
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 110'%3E%3Cdefs%3E%3ClinearGradient id='a' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23232934'/%3E%3Cstop offset='0.6' stop-color='%233d4654'/%3E%3Cstop offset='1' stop-color='%231b1f26'/%3E%3C/linearGradient%3E%3CradialGradient id='b' cx='0.72' cy='0.34' r='0.4'%3E%3Cstop offset='0' stop-color='%23f2d3a2' stop-opacity='0.75'/%3E%3Cstop offset='1' stop-color='%23f2d3a2' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='160' height='110' fill='url(%23a)'/%3E%3Crect width='160' height='110' fill='url(%23b)'/%3E%3Cpath d='M0 78L42 54l34 18 38-22 46 28v32H0Z' fill='%2314171d' opacity='0.88'/%3E%3Cpath d='M18 96h124' stroke='%23e8cfa6' stroke-opacity='0.35' stroke-width='1.5'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 110'%3E%3Cdefs%3E%3ClinearGradient id='a' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%232d2722'/%3E%3Cstop offset='0.55' stop-color='%236b5542'/%3E%3Cstop offset='1' stop-color='%231f1b18'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='160' height='110' fill='url(%23a)'/%3E%3Crect x='24' y='22' width='44' height='64' rx='3' fill='%23f4d8b1' opacity='0.22'/%3E%3Crect x='92' y='22' width='44' height='64' rx='3' fill='%23f4d8b1' opacity='0.14'/%3E%3Ccircle cx='114' cy='40' r='9' fill='%23f9e5c2' opacity='0.65'/%3E%3Cpath d='M0 86h160v24H0Z' fill='%23161311' opacity='0.82'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 110'%3E%3Cdefs%3E%3ClinearGradient id='a' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%231a222b'/%3E%3Cstop offset='1' stop-color='%2333414f'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='160' height='110' fill='url(%23a)'/%3E%3Ccircle cx='34' cy='34' r='4' fill='%23d8e6f2' opacity='0.85'/%3E%3Ccircle cx='66' cy='38' r='3.5' fill='%23d8e6f2' opacity='0.72'/%3E%3Ccircle cx='98' cy='42' r='3' fill='%23d8e6f2' opacity='0.58'/%3E%3Ccircle cx='128' cy='46' r='2.5' fill='%23d8e6f2' opacity='0.45'/%3E%3Cpath d='M0 72L160 58v52H0Z' fill='%2311161d' opacity='0.9'/%3E%3Cpath d='M12 92L148 70' stroke='%2399b4cc' stroke-opacity='0.35' stroke-width='1.5'/%3E%3C/svg%3E",
];

const fallbackStill = (node) => {
  const s = String(node?.id || node?.name || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return FALLBACK_STILLS[h % FALLBACK_STILLS.length];
};

const KIND_ICON = {
  folder: "folder",
  pdf: "file-text",
  word: "file-text",
  ppt: "layers",
  vue: "code-xml",
  tsx: "code-xml",
  txt: "file-text",
  doc: "file-text",
  image: "image",
  video: "film",
  audio: "file-music",
  code: "code-xml",
  file: "file",
};

const KIND_LABEL_KEY = {
  folder: "tree.28",
  pdf: "tree.69",
  word: "tree.70",
  ppt: "tree.71",
  vue: "tree.72",
  tsx: "tree.73",
  txt: "tree.74",
  doc: "tree.29",
  image: "tree.30",
  video: "tree.31",
  audio: "tree.32",
  code: "tree.33",
  file: "tree.34",
};

const KIND_DEFAULT_EXT = {
  pdf: "PDF",
  word: "DOCX",
  ppt: "PPTX",
  vue: "VUE",
  tsx: "TSX",
  txt: "TXT",
  doc: "MD",
  image: "PNG",
  video: "MOV",
  audio: "WAV",
  code: "TS",
  file: "FILE",
};

const TONE_KINDS = new Set(["pdf", "word", "ppt", "vue", "tsx"]);
const toneCls = (k) => (TONE_KINDS.has(k) ? ` sn-fex-t-${k}` : "");

// 拟物文件夹内置克制高级质感色板（也支持任意合法 CSS 色值，如 #5b8ec9 / hsl(...)）
const FOLDER_COLOR_PRESETS = [
  { id: "default", hex: "", labelKey: "tree.85", swatch: "#c8cad0" },
  { id: "blue", hex: "#5b8ec9", labelKey: "tree.86", swatch: "#5b8ec9" },
  { id: "amber", hex: "#c89452", labelKey: "tree.87", swatch: "#c89452" },
  { id: "sage", hex: "#589378", labelKey: "tree.88", swatch: "#589378" },
  { id: "violet", hex: "#8470b8", labelKey: "tree.89", swatch: "#8470b8" },
  { id: "rose", hex: "#be6b74", labelKey: "tree.90", swatch: "#be6b74" },
];
const FOLDER_COLOR_MAP = Object.fromEntries(FOLDER_COLOR_PRESETS.map((p) => [p.id, p.hex]));

function resolveFolderColor(raw) {
  if (!raw || raw === "default") return "";
  const s = String(raw).trim();
  if (s in FOLDER_COLOR_MAP) return FOLDER_COLOR_MAP[s];
  // 校验安全 CSS 颜色字面量，防止样式注入
  if (/^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\([^;{}<>"]+\)|[a-zA-Z]{3,20})$/.test(s)) return s;
  return "";
}

const extOf = (name, kind) => {
  const s = String(name || "");
  const dot = s.lastIndexOf(".");
  if (dot > 0 && dot < s.length - 1) return s.slice(dot + 1, dot + 6).toUpperCase();
  return KIND_DEFAULT_EXT[kind] || "FILE";
};

// 智能识别文件类型：显式 kind 优先，否则自动按扩展名推断 pdf / word / ppt / vue / tsx / txt / image / video / audio / code
const kindOf = (node) => {
  if (node?.kind) return node.kind;
  if (Array.isArray(node?.children) || node?.hasChildren) return "folder";
  const name = String(node?.name || "").toLowerCase();
  if (/\.pdf$/.test(name)) return "pdf";
  if (/\.docx?$/.test(name)) return "word";
  if (/\.pptx?$/.test(name)) return "ppt";
  if (/\.vue$/.test(name)) return "vue";
  if (/\.[jt]sx$/.test(name)) return "tsx";
  if (/\.txt$/.test(name)) return "txt";
  if (/\.(md|markdown)$/.test(name)) return "doc";
  if (/\.(png|jpe?g|webp|gif|avif|exr|svg)$/.test(name)) return "image";
  if (/\.(mp4|mov|webm|mkv|avi)$/.test(name)) return "video";
  if (/\.(wav|mp3|flac|aac|ogg|m4a)$/.test(name)) return "audio";
  if (/\.(ts|js|mjs|css|json|py|rs|go|html)$/.test(name)) return "code";
  return "file";
};

const isFolderNode = (node) => kindOf(node) === "folder";

const defaultExcerpt = (node, k) => {
  if (node.excerpt) return node.excerpt;
  if (k === "vue") return "<template>\n  <FileGrid :items />\n</template>\n<script setup>\nconst v = ref(1)\n</scr" + "ipt>";
  if (k === "tsx") return "export function App() {\n  return (\n    <Tree virtual />\n  );\n}";
  if (k === "code") return "export const cfg = {\n  fps: 60,\n  virtual: true\n};";
  if (k === "pdf") return "第三集实景布光与冷暖色温控制手册。室外 5200K 冷雨与候车厅 3400K 顶灯自然衔接。";
  if (k === "word") return "一、拍摄日程与机位排期\n站前广场夜戏需在 21:00 前完成灯光预置，保证雨幕反光层次。";
  if (k === "txt") return "场记备忘：第 04 镜慢摇过七盏站台灯，车灯切入后停 12 帧再叠化雨声。";
  return "# 雨夜车站 · 终稿\n第一场 站前广场 雨夜\n长椅扶手反光接住暖黄余晖。";
};

const highlightText = (text, q) => {
  const s = String(text ?? "");
  if (!q) return esc(s);
  const lo = s.toLowerCase(), idx = lo.indexOf(q);
  if (idx < 0) return esc(s);
  return esc(s.slice(0, idx)) + "<mark>" + esc(s.slice(idx, idx + q.length)) + "</mark>" + esc(s.slice(idx + q.length));
};

function applyActiveStyle(el, style, prefix) {
  el.removeAttribute("data-active-style");
  el.style.removeProperty(`--sn-${prefix}-active-bg`);
  el.style.removeProperty(`--sn-${prefix}-active-color`);
  el.style.removeProperty(`--sn-${prefix}-active-ring`);
  el.style.removeProperty(`--sn-${prefix}-active-bar`);
  el.style.removeProperty(`--sn-${prefix}-hover-bg`);
  if (!style || style === "subtle") return;
  if (typeof style === "string") {
    el.setAttribute("data-active-style", style);
    return;
  }
  if (typeof style === "object") {
    if (style.bg) el.style.setProperty(`--sn-${prefix}-active-bg`, String(style.bg));
    if (style.color) el.style.setProperty(`--sn-${prefix}-active-color`, String(style.color));
    if (style.ring) el.style.setProperty(`--sn-${prefix}-active-ring`, String(style.ring));
    if (style.bar) el.style.setProperty(`--sn-${prefix}-active-bar`, String(style.bar));
    if (style.hoverBg) el.style.setProperty(`--sn-${prefix}-hover-bg`, String(style.hoverBg));
  }
}

// 通用树索引器：O(1) 节点查找、父链判断、防循环引用
function buildIndex(roots) {
  const map = new Map();
  let total = 0;
  const walk = (list, parent, depth) => {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (!node || node.id == null) continue;
      const id = String(node.id);
      total++;
      map.set(id, { id, node, parent, list, index: i, depth });
      if (Array.isArray(node.children) && node.children.length) walk(node.children, node, depth + 1);
    }
  };
  walk(roots, null, 0);
  return { map, total };
}

function isDescendant(indexMap, ancestorId, maybeChildId) {
  let cur = indexMap.get(String(maybeChildId));
  while (cur && cur.parent) {
    if (String(cur.parent.id) === String(ancestorId)) return true;
    cur = indexMap.get(String(cur.parent.id));
  }
  return false;
}

function formatSize(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function parseSizeBytes(v) {
  if (typeof v === "number") return v;
  const m = String(v || "").match(/^([\d.]+)\s*(B|KB|MB|GB)?$/i);
  if (!m) return -1;
  const mul = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[(m[2] || "B").toUpperCase()] || 1;
  return parseFloat(m[1]) * mul;
}

// 拟物文件夹内部微缩纸张内容渲染（与卡片视图完全统一：真实图片小图 / 视频首帧 / TXT小字 / PDF / Word / PPT / Vue / TSX）
function renderMiniSheet(child, idx, isNew, staggerIdx = 0) {
  const k = kindOf(child);
  let inner = "";
  if (k === "image" || k === "video") {
    const src = child.preview || fallbackStill(child);
    inner = `<div class="sn-fdr-sh-img"><img src="${esc(src)}" alt="" draggable="false" loading="lazy" decoding="async">`
      + (k === "video" ? `<span class="sn-fdr-sh-play">${icon("play", 8)}</span>` : "")
      + `</div>`;
  } else if (k === "audio") {
    inner = `<div class="sn-fdr-sh-wave"><i style="height:35%"></i><i style="height:78%"></i><i style="height:50%"></i><i style="height:92%"></i><i style="height:44%"></i><i style="height:70%"></i></div>`;
  } else if (k === "folder") {
    inner = `<div class="sn-fdr-sh-fdr">${icon("folder", 14)}</div>`;
  } else if (k === "ppt") {
    inner = `<span class="sn-fdr-sh-bar sn-fex-t-ppt"></span><div class="sn-fcard-ppt-body"><div class="sn-fcard-ppt-chart"><i style="height:45%"></i><i style="height:82%"></i><i style="height:60%"></i></div><div class="sn-fcard-ppt-lines"><i></i><i></i></div></div>`;
  } else {
    const isCode = k === "vue" || k === "tsx" || k === "code";
    const bar = TONE_KINDS.has(k) ? `<span class="sn-fdr-sh-bar${toneCls(k)}"></span>` : "";
    inner = `${bar}<div class="sn-fdr-sh-txt${isCode ? " sn-fdr-sh-code" : ""}">${esc(defaultExcerpt(child, k))}</div>`;
  }
  const st = isNew ? ` style="--sn-stagger:${staggerIdx}"` : "";
  return `<div class="sn-fdr-sheet${isNew ? " sn-fdr-sheet-new" : ""}" data-idx="${idx}" data-child-kind="${esc(k)}"${st}>${inner}</div>`;
}

// 拟物折叠文件夹外壳（含动态夹层微缩内容纸叠 + 计数角标 + 自定义高级配色）
// 最新放入的文件排在最前排最高 z-index 正中显眼位置，原有纸片柔和向左右后排扇开
function renderSkeuoFolder(node, freshIds) {
  const children = Array.isArray(node.children) ? node.children : [];
  const count = children.length;
  const previewItems = children.slice(0, 3).reverse();
  let freshSeq = 0;
  const sheetsHtml = previewItems
    .map((c, i) => {
      const isNew = !!freshIds?.has(String(c.id));
      return renderMiniSheet(c, i, isNew, isNew ? freshSeq++ : 0);
    })
    .join("");
  const badgeHtml = count > 0
    ? `<span class="sn-fdr-cnt${freshIds?.size ? " sn-fdr-cnt-bump" : ""}">${count}</span>`
    : node.hasChildren ? `<span class="sn-fdr-cnt">…</span>` : "";
  const tint = resolveFolderColor(node.color);
  const tintCls = tint ? " sn-fdr-tinted" : "";
  const tintStyle = tint ? ` style="--sn-fdr-tint:${esc(tint)}"` : "";
  return `<div class="sn-fdr${tintCls}" data-count="${count}"${tintStyle}>`
    + `<div class="sn-fdr-back"></div>`
    + `<div class="sn-fdr-well"></div>`
    + `<div class="sn-fdr-sheets" data-n="${previewItems.length}">${sheetsHtml}</div>`
    + `<div class="sn-fdr-front">${badgeHtml}</div>`
    + `</div>`;
}

// 独立文件卡片缩略外观（视频首帧 + 图片小图 + TXT/MD/PDF/Word/Vue/TSX 真实微缩小字 + PPT 幻灯片 + 音频声波）
function renderFileCardVisual(node) {
  const k = kindOf(node);
  const ext = extOf(node.name, k);
  const tc = toneCls(k);

  if (k === "image" || k === "video") {
    const src = node.preview || fallbackStill(node);
    const play = k === "video" ? `<span class="sn-fcard-play">${icon("play", 10)}</span>` : "";
    const dur = k === "video" && node.duration ? `<span class="sn-fcard-dur">${esc(node.duration)}</span>` : "";
    return `<div class="sn-fcard-stage"><div class="sn-fcard sn-fcard-frame" data-kind="${esc(k)}"><img src="${esc(src)}" alt="" draggable="false" loading="lazy" decoding="async">${play}${dur}</div></div>`;
  }

  if (k === "ppt") {
    const title = String(node.name || "").replace(/\.[^.]+$/, "");
    const pg = node.pages ? `<span class="sn-fcard-pg">${node.pages}P</span>` : "";
    return `<div class="sn-fcard-stage"><div class="sn-fcard sn-fcard-slide" data-kind="ppt">`
      + `<div class="sn-fcard-ppt-top"><span class="sn-fcard-ppt-title">${esc(title)}</span></div>`
      + `<div class="sn-fcard-ppt-body"><div class="sn-fcard-ppt-chart"><i style="height:46%"></i><i style="height:86%"></i><i style="height:64%"></i><i style="height:95%"></i></div><div class="sn-fcard-ppt-lines"><i></i><i></i><i></i></div></div>`
      + `<div class="sn-fcard-ft"><span class="sn-fcard-ext sn-fex-t-ppt">${esc(ext)}</span>${pg}</div>`
      + `</div></div>`;
  }

  if (k === "audio") {
    return `<div class="sn-fcard-stage"><div class="sn-fcard" data-kind="audio">`
      + `<div class="sn-fcard-wave"><i style="height:36%"></i><i style="height:78%"></i><i style="height:54%"></i><i style="height:96%"></i><i style="height:48%"></i><i style="height:72%"></i><i style="height:34%"></i></div>`
      + `<div class="sn-fcard-ft"><span class="sn-fcard-ext">${esc(ext)}</span></div>`
      + `</div></div>`;
  }

  const isCode = k === "vue" || k === "tsx" || k === "code";
  const headBar = TONE_KINDS.has(k) ? `<span class="sn-fcard-headbar${tc}"></span>` : "";
  const excerpt = defaultExcerpt(node, k);
  const pg = node.pages ? `<span class="sn-fcard-pg">${node.pages}P</span>` : "";
  return `<div class="sn-fcard-stage"><div class="sn-fcard" data-kind="${esc(k)}">`
    + headBar
    + `<div class="sn-fcard-excerpt${isCode ? " sn-fcard-code" : ""}">${esc(excerpt)}</div>`
    + `<div class="sn-fcard-ft"><span class="sn-fcard-ext${tc}">${esc(ext)}</span>${pg}</div>`
    + `</div></div>`;
}

// 列表与树形行左侧微缩图标：图片/视频展示迷你真缩略图，PDF/Word/PPT/Vue/TSX 展示紧凑语义字标，文件夹柔和呼应自定义色调
function renderRowIcon(node, isExp = false) {
  const k = kindOf(node);
  if (k === "folder") {
    const tint = resolveFolderColor(node.color);
    const st = tint ? ` style="--sn-fdr-tint:${esc(tint)}"` : "";
    return `<span class="sn-fex-row-ico${tint ? " sn-fdr-tinted" : ""}"${st}>${icon(isExp ? "folder-open" : "folder", 14)}</span>`;
  }
  if (k === "image" || k === "video") {
    const src = node.preview || fallbackStill(node);
    return `<span class="sn-fex-row-ico"><img src="${esc(src)}" alt="" draggable="false" loading="lazy" decoding="async"></span>`;
  }
  const tagMap = { pdf: "PDF", word: "W", ppt: "P", vue: "V", tsx: "TX" };
  if (tagMap[k]) return `<span class="sn-fex-row-ico${toneCls(k)}">${tagMap[k]}</span>`;
  return `<span class="sn-fex-row-ico">${icon(KIND_ICON[k] || "file", 14)}</span>`;
}

// ————————————————————————————————————————————————————————————————
// 1. 树形控件（Tree）：treeHTML + createTree（复用 ScrollArea 悬浮滚动条）
// ————————————————————————————————————————————————————————————————
export function treeHTML(o = {}) {
  const h = cssSize(o.height, "360px");
  const label = esc(o.label || tt("tree.0"));
  const searchable = !!o.searchable;
  const bar = searchable
    ? `<div class="sn-tree-bar">`
      + `<div class="sn-ib sn-has-pre sn-has-post sn-tree-q">`
      + `<span class="sn-pre">${icon("search", 15)}</span>`
      + `<input class="sn-input sn-sm" type="text" data-tr-q placeholder="${esc(tt("tree.1"))}" aria-label="${esc(tt("tree.1"))}">`
      + `<span class="sn-post"><button type="button" class="sn-clear" data-tr-clr aria-label="${esc(tt("tree.2"))}">${icon("x", 13)}</button></span>`
      + `</div>`
      + `<span class="sn-tree-stat" data-tr-stat></span>`
      + `<div class="sn-tree-acts">`
      + `<button type="button" class="sn-btn sn-ghost sn-sm sn-ibtn" data-tr-exp="0" data-tip="${esc(tt("tree.3"))}" aria-label="${esc(tt("tree.3"))}" aria-pressed="false">${icon("chevrons-up-down", 15)}</button>`
      + `</div>`
      + `</div>`
    : "";
  return `<div class="sn-tree" style="height:${esc(h)}">${bar}<div class="sn-tree-vp" data-tr-host aria-label="${label}"${o.checkable ? ' data-checkable="1"' : ""}><div class="sn-tree-space"><div class="sn-tree-rows"></div></div></div></div>`;
}

export const createTree = /* @__PURE__ */ defineComponent({
  name: "Tree",
  html: treeHTML,
  defaults: {
    items: [],
    checkable: false,
    searchable: false,
    draggable: false,
    virtual: false,
    rowHeight: 32,
    height: 360,
  },
  mount(root, initialOpts, { emit }) {
    let opts = { ...initialOpts };
    let data = cloneTree(opts.items);
    let idx = buildIndex(data);
    const expanded = new Set((opts.expanded ?? opts.defaultExpanded ?? []).map(String));
    const checked = new Set((opts.checked ?? opts.defaultChecked ?? []).map(String));
    const loadingIds = new Set();
    const errorIds = new Map();
    // 只有显式开启 selectable 或传入 selected/defaultSelected/activeStyle 时才呈现持续激活态；
    // 否则（如复选树、纯目录浏览树）仅保留柔和 hover，不留无意义的持续灰底
    const isSelectable = () => (opts.selectable !== undefined
      ? !!opts.selectable
      : (opts.selected !== undefined || opts.defaultSelected != null || opts.activeStyle !== undefined));
    let selectedId = isSelectable()
      ? (opts.selected != null ? String(opts.selected) : opts.defaultSelected != null ? String(opts.defaultSelected) : null)
      : null;
    let focusId = selectedId;
    let query = "";
    let flat = [];
    let isVirt = false;
    let lastWin = [-1, -1];
    let renderedCount = 0;
    let dragState = null;

    const vpHost = root.querySelector(".sn-tree-vp");
    // 复用 Satin ScrollArea：原生滚动 + 悬浮细滚动条 + 边缘渐隐 + sa-jump 虚拟列表同步
    const sa = scrollArea(vpHost, { fade: "y", size: 20, bar: "auto", overscroll: "contain", inner: true });
    const vp = sa.vp;
    vp.setAttribute("role", "tree");
    vp.tabIndex = 0;
    vp.setAttribute("aria-label", opts.label || tt("tree.0"));
    if (opts.checkable) vp.setAttribute("aria-multiselectable", "true");

    const space = vp.querySelector(".sn-tree-space");
    const rowsEl = vp.querySelector(".sn-tree-rows");
    const qInput = root.querySelector("[data-tr-q]");
    const qWrap = root.querySelector(".sn-tree-q");
    const clrBtn = root.querySelector("[data-tr-clr]");
    const statEl = root.querySelector("[data-tr-stat]");
    const expBtn = root.querySelector("[data-tr-exp]");

    const rowH = () => Math.max(24, Number(opts.rowHeight) || 32);
    root.style.setProperty("--sn-tr-h", rowH() + "px");
    applyActiveStyle(root, opts.activeStyle, "tr");
    let collapseTimer = 0;

    // 勾选状态计算（父子三态联动：checked / mixed / none）
    const checkStateCache = new Map();
    function recomputeCheckStates() {
      checkStateCache.clear();
      if (!opts.checkable) return;
      const visit = (node) => {
        const id = String(node.id);
        const ch = Array.isArray(node.children) ? node.children : null;
        if (!ch || !ch.length) {
          const st = checked.has(id) ? 2 : 0;
          checkStateCache.set(id, st);
          return st;
        }
        let all = true, any = false, usable = 0;
        for (const c of ch) {
          const cst = visit(c);
          if (c.disabled) continue;
          usable++;
          if (cst === 2) any = true;
          else if (cst === 1) { any = true; all = false; }
          else all = false;
        }
        const st = usable === 0 ? (checked.has(id) ? 2 : 0) : all ? 2 : any ? 1 : 0;
        checkStateCache.set(id, st);
        return st;
      };
      for (const n of data) visit(n);
    }

    function toggleCheck(id, boxEl) {
      const rec = idx.map.get(id);
      if (!rec || rec.node.disabled) return;
      const cur = checkStateCache.get(id) || 0;
      const nextOn = cur !== 2;
      const applyDown = (node) => {
        if (node.disabled) return;
        const nid = String(node.id);
        if (nextOn) checked.add(nid); else checked.delete(nid);
        if (Array.isArray(node.children)) node.children.forEach(applyDown);
      };
      applyDown(rec.node);
      recomputeCheckStates();
      for (const [nid, st] of checkStateCache) {
        if (st === 2) checked.add(nid); else checked.delete(nid);
      }
      renderWindow(true);
      if (boxEl) {
        const freshBox = rowsEl.querySelector(`.sn-tr[data-id="${CSS.escape(id)}"] .sn-box`);
        if (freshBox && nextOn) popCheck(freshBox);
      }
      emit("check", { ids: [...checked], id, checked: nextOn, node: rec.node });
    }

    function rebuildFlat() {
      idx = buildIndex(data);
      recomputeCheckStates();
      const q = query.trim().toLowerCase();
      const out = [];
      let matchCount = 0;

      if (!q) {
        const walk = (list, depth, guides) => {
          for (let i = 0; i < list.length; i++) {
            const node = list[i];
            if (!node || node.id == null) continue;
            const id = String(node.id);
            const hasCh = (Array.isArray(node.children) && node.children.length > 0) || !!node.hasChildren;
            const isExp = hasCh && expanded.has(id);
            const isLast = i === list.length - 1;
            out.push({ id, node, depth, hasCh, expanded: isExp, loading: loadingIds.has(id), err: errorIds.get(id) || null, guides });
            if (isExp && Array.isArray(node.children) && node.children.length) {
              walk(node.children, depth + 1, [...guides, !isLast]);
            }
          }
        };
        walk(data, 0, []);
      } else {
        const keep = new Set();
        const mark = (node) => {
          const id = String(node.id);
          const selfHit = String(node.label ?? "").toLowerCase().includes(q) || String(node.meta ?? "").toLowerCase().includes(q);
          let childHit = false;
          if (Array.isArray(node.children)) {
            for (const c of node.children) if (mark(c)) childHit = true;
          }
          if (selfHit) matchCount++;
          if (selfHit || childHit) { keep.add(id); return true; }
          return false;
        };
        for (const n of data) mark(n);
        const walk = (list, depth, guides) => {
          const vis = list.filter((n) => n && keep.has(String(n.id)));
          for (let i = 0; i < vis.length; i++) {
            const node = vis[i];
            const id = String(node.id);
            const hasCh = Array.isArray(node.children) && node.children.some((c) => keep.has(String(c.id)));
            const isLast = i === vis.length - 1;
            out.push({ id, node, depth, hasCh, expanded: hasCh, loading: false, err: null, guides });
            if (hasCh) walk(node.children, depth + 1, [...guides, !isLast]);
          }
        };
        walk(data, 0, []);
      }

      flat = out;
      isVirt = !!opts.virtual || flat.length > 120;
      root.classList.toggle("sn-tree-virt", isVirt);
      if (statEl) {
        statEl.textContent = q
          ? tt("tree.6", { p0: matchCount, p1: idx.total })
          : tt("tree.5", { p0: idx.total });
      }
      if (qWrap) qWrap.classList.toggle("sn-filled", !!query);
      syncExpandAllBtn();
      lastWin = [-1, -1];
      renderWindow(true);
      sa.refresh();
    }

    function syncExpandAllBtn(overrideAllOpen) {
      if (!expBtn) return;
      let expandableCount = 0;
      let expandedCount = 0;
      for (const [id, rec] of idx.map) {
        if (Array.isArray(rec.node.children) && rec.node.children.length > 0) {
          expandableCount++;
          if (expanded.has(id)) expandedCount++;
        }
      }
      expBtn.hidden = expandableCount === 0;
      const allOpen = overrideAllOpen !== undefined
        ? !!overrideAllOpen
        : (expandableCount > 0 && expandedCount >= expandableCount);
      const nextState = allOpen ? "1" : "0";
      const nextTip = allOpen ? tt("tree.4") : tt("tree.3");
      expBtn.dataset.trExp = nextState;
      expBtn.dataset.tip = nextTip;
      expBtn.setAttribute("aria-label", nextTip);
      expBtn.setAttribute("aria-pressed", String(allOpen));
      retip(expBtn);
    }

    function rowMarkup(item, index) {
      const { id, node, depth, hasCh, expanded: isExp, loading, err, guides } = item;
      const q = query.trim().toLowerCase();
      const rh = rowH();
      const guidesHtml = depth > 0
        ? `<span class="sn-tr-guides">${guides.map((hasLine) => `<span class="sn-tr-g${hasLine ? " sn-tr-g-line" : ""}"></span>`).join("")}</span>`
        : "";
      const twHtml = loading
        ? `<span class="sn-tr-tw" aria-hidden="true"><span class="sn-tr-spin"></span></span>`
        : `<button type="button" class="sn-tr-tw${hasCh ? "" : " sn-tr-leaf"}" data-tr-tw="${esc(id)}" tabindex="-1" aria-label="${esc(isExp ? tt("tree.13") : tt("tree.12"))}">${icon("chevron-right", 13)}</button>`;
      const st = checkStateCache.get(id) || 0;
      const chkHtml = opts.checkable
        ? `<span class="sn-tr-chk"><span class="sn-check${st === 2 ? " sn-on" : st === 1 ? " sn-mixed" : ""}" data-tr-chk="${esc(id)}">${BOX}</span></span>`
        : "";
      const icoName = node.icon || (hasCh ? (isExp ? "folder-open" : "folder") : "file-text");
      const icoHtml = `<span class="sn-tr-ico">${icon(icoName, 15)}</span>`;
      const metaHtml = node.meta ? `<span class="sn-tr-meta">${esc(node.meta)}</span>` : "";
      const badgeHtml = node.badge != null && node.badge !== "" ? `<span class="sn-tr-badge">${esc(node.badge)}</span>` : "";
      const errHtml = err
        ? `<span class="sn-tr-err">${esc(tt("tree.8"))}<button type="button" class="sn-tr-retry" data-tr-retry="${esc(id)}">${esc(tt("tree.9"))}</button></span>`
        : "";
      const cls = [
        "sn-tr",
        isExp ? "sn-open" : "",
        selectedId === id ? "sn-sel" : "",
        focusId === id ? "sn-tr-focus" : "",
        node.disabled ? "sn-is-disabled" : "",
      ].filter(Boolean).join(" ");
      const posStyle = isVirt ? ` style="transform:translate3d(0,${index * rh}px,0);--sn-tr-depth:${depth}"` : ` style="--sn-tr-depth:${depth}"`;
      return `<div class="${cls}" role="treeitem" data-id="${esc(id)}" data-depth="${depth}" aria-level="${depth + 1}"${hasCh ? ` aria-expanded="${isExp}"` : ""} aria-selected="${selectedId === id}"${node.disabled ? ' aria-disabled="true"' : ""}${posStyle}>`
        + guidesHtml + twHtml + chkHtml + icoHtml
        + `<span class="sn-tr-lbl" data-tip-full>${highlightText(node.label, q)}</span>`
        + errHtml + metaHtml + badgeHtml
        + `</div>`;
    }

    function renderWindow(force = false) {
      const rh = rowH();
      if (!flat.length) {
        space.style.height = "";
        renderedCount = 0;
        rowsEl.innerHTML = `<div class="sn-tree-empty">${icon(query ? "search" : "inbox", 22)}<span>${esc(query ? tt("tree.10") : tt("tree.11"))}</span></div>`;
        return;
      }
      if (!isVirt) {
        space.style.height = "";
        rowsEl.innerHTML = flat.map((it, i) => rowMarkup(it, i)).join("");
        renderedCount = flat.length;
        return;
      }
      const totalH = flat.length * rh;
      space.style.height = totalH + "px";
      const vh = vp.clientHeight || Number(opts.height) || 360;
      const overscan = 6;
      const start = Math.max(0, Math.floor(vp.scrollTop / rh) - overscan);
      const end = Math.min(flat.length, Math.ceil((vp.scrollTop + vh) / rh) + overscan);
      if (!force && start === lastWin[0] && end === lastWin[1]) return;
      lastWin = [start, end];
      let html = "";
      for (let i = start; i < end; i++) html += rowMarkup(flat[i], i);
      rowsEl.innerHTML = html;
      renderedCount = end - start;
    }

    function animateTreeExpand(parentId, prevIds, beforeRects, pushedOutClones = null) {
      if (reduced()) return;
      const rows = [...rowsEl.querySelectorAll(".sn-tr")];
      const nextIds = new Set(rows.map((el) => el.dataset.id));
      // 虚拟树大展开（如展开 100 项）时，把被瞬间顶出视口外的原下方兄弟行做柔和下推淡出，视觉上真切感受到空间被推开
      if (pushedOutClones && pushedOutClones.length) {
        const ghostWrap = document.createElement("div");
        ghostWrap.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:0;";
        let kept = 0;
        for (const item of pushedOutClones) {
          if (nextIds.has(item.id)) continue;
          kept++;
          const g = item.clone;
          ghostWrap.append(g);
          const base = item.base;
          g.animate(
            [
              { opacity: 1, transform: base || "none" },
              { opacity: 0, transform: base ? `${base} translate3d(0,40px,0)` : "translate3d(0,40px,0)" },
            ],
            { duration: 190, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" }
          );
        }
        if (kept) {
          space.append(ghostWrap);
          setTimeout(() => ghostWrap.remove(), 210);
        }
      }
      let addedSeq = 0;
      for (const el of rows) {
        const id = el.dataset.id;
        if (id === parentId) {
          el.querySelector(".sn-tr-tw .sn-ic")?.animate([{ rotate: "0deg" }, { rotate: "90deg" }], { duration: 195, easing: "cubic-bezier(.22, 1, .36, 1)" });
          continue;
        }
        const base = isVirt ? (el.style.transform || "") : "";
        if (!prevIds.has(id)) {
          const delay = Math.min(addedSeq++, 9) * 16;
          el.animate(
            [
              { opacity: 0, transform: base ? `${base} translate3d(0,-14px,0)` : "translate3d(0,-14px,0)" },
              { opacity: 1, transform: base || "none" },
            ],
            { duration: 220, delay, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "backwards" }
          );
        } else if (beforeRects.has(id)) {
          const dy = beforeRects.get(id) - el.getBoundingClientRect().top;
          if (Math.abs(dy) > 0.5) {
            el.animate(
              [
                { transform: base ? `${base} translate3d(0,${dy}px,0)` : `translate3d(0,${dy}px,0)` },
                { transform: base || "none" },
              ],
              { duration: 240, easing: "cubic-bezier(.22, 1, .36, 1)" }
            );
          }
        }
      }
    }

    function animateTreeCollapse(parentId, commit) {
      if (reduced()) { commit(); return; }
      const rows = [...rowsEl.querySelectorAll(".sn-tr")];
      const pi = rows.findIndex((el) => el.dataset.id === parentId);
      if (pi < 0) { commit(); return; }
      const parentEl = rows[pi];
      const pDepth = Number(parentEl.dataset.depth || 0);
      const closing = [];
      let i = pi + 1;
      for (; i < rows.length; i++) {
        if (Number(rows[i].dataset.depth || 0) <= pDepth) break;
        closing.push(rows[i]);
      }
      if (!closing.length) { commit(); return; }
      const beforeIds = new Set(rows.map((el) => el.dataset.id));
      const below = rows.slice(i);
      const collapseH = Math.min(closing.length * rowH(), (vp.clientHeight || 360) + rowH() * 2);
      parentEl.classList.remove("sn-open");
      parentEl.setAttribute("aria-expanded", "false");
      for (const el of closing) {
        const base = isVirt ? (el.style.transform || "") : "";
        el.animate(
          [
            { opacity: 1, transform: base || "none" },
            { opacity: 0, transform: base ? `${base} translate3d(0,-10px,0)` : "translate3d(0,-10px,0)" },
          ],
          { duration: 165, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" }
        );
      }
      for (const el of below) {
        const base = isVirt ? (el.style.transform || "") : "";
        el.animate(
          [
            { transform: base || "none" },
            { transform: base ? `${base} translate3d(0,${-collapseH}px,0)` : `translate3d(0,${-collapseH}px,0)` },
          ],
          { duration: 175, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" }
        );
      }
      clearTimeout(collapseTimer);
      collapseTimer = setTimeout(() => {
        commit();
        // 虚拟树收起大量子节点后，新顶入视口的下方兄弟行顺滑上浮补位（不再瞬间硬闪现）
        if (!reduced()) {
          let seq = 0;
          for (const el of rowsEl.querySelectorAll(".sn-tr")) {
            if (beforeIds.has(el.dataset.id)) continue;
            const base = isVirt ? (el.style.transform || "") : "";
            el.animate(
              [
                { opacity: 0, transform: base ? `${base} translate3d(0,18px,0)` : "translate3d(0,18px,0)" },
                { opacity: 1, transform: base || "none" },
              ],
              { duration: 210, delay: Math.min(seq++, 8) * 12, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "backwards" }
            );
          }
        }
      }, 170);
    }

    async function toggleExpand(id, wantOpen) {
      const rec = idx.map.get(id);
      if (!rec) return;
      const node = rec.node;
      const hasCh = (Array.isArray(node.children) && node.children.length > 0) || !!node.hasChildren;
      if (!hasCh) return;
      const next = wantOpen === undefined ? !expanded.has(id) : !!wantOpen;
      if (!next) {
        animateTreeCollapse(id, () => {
          expanded.delete(id);
          rebuildFlat();
          emit("expand", { id, expanded: false, node, expandedIds: [...expanded] });
        });
        return;
      }
      const captureBefore = () => {
        const prevIds = new Set();
        const beforeRects = new Map();
        const pushedOutClones = [];
        const domRows = [...rowsEl.querySelectorAll(".sn-tr")];
        const pi = domRows.findIndex((el) => el.dataset.id === id);
        for (let k = 0; k < domRows.length; k++) {
          const el = domRows[k];
          prevIds.add(el.dataset.id);
          beforeRects.set(el.dataset.id, el.getBoundingClientRect().top);
          if (isVirt && pi >= 0 && k > pi && pushedOutClones.length < 12) {
            pushedOutClones.push({ id: el.dataset.id, clone: el.cloneNode(true), base: el.style.transform || "" });
          }
        }
        return { prevIds, beforeRects, pushedOutClones };
      };
      if ((!Array.isArray(node.children) || !node.children.length) && node.hasChildren && typeof opts.loadChildren === "function") {
        if (loadingIds.has(id)) return;
        errorIds.delete(id);
        loadingIds.add(id);
        rebuildFlat();
        try {
          const loaded = await opts.loadChildren(node);
          loadingIds.delete(id);
          const before = captureBefore();
          node.children = Array.isArray(loaded) ? cloneTree(loaded) : [];
          node.hasChildren = node.children.length > 0;
          expanded.add(id);
          rebuildFlat();
          animateTreeExpand(id, before.prevIds, before.beforeRects, before.pushedOutClones);
          emit("expand", { id, expanded: true, node, expandedIds: [...expanded] });
        } catch (e) {
          loadingIds.delete(id);
          errorIds.set(id, String(e?.message || tt("tree.8")));
          rebuildFlat();
        }
        return;
      }
      const before = captureBefore();
      expanded.add(id);
      rebuildFlat();
      animateTreeExpand(id, before.prevIds, before.beforeRects, before.pushedOutClones);
      emit("expand", { id, expanded: true, node, expandedIds: [...expanded] });
    }

    function syncRowSelectionClasses() {
      const canSel = isSelectable();
      for (const el of rowsEl.querySelectorAll(".sn-tr")) {
        const rid = el.dataset.id;
        const isSel = canSel && selectedId === rid;
        el.classList.toggle("sn-sel", isSel);
        el.classList.toggle("sn-tr-focus", focusId === rid);
        el.setAttribute("aria-selected", String(isSel));
      }
    }

    function setSelect(id, focus = false, forceVisual = false) {
      const rec = id != null ? idx.map.get(String(id)) : null;
      if (rec?.node?.disabled) return;
      if (isSelectable() || forceVisual) {
        selectedId = rec ? rec.id : null;
      } else {
        selectedId = null;
      }
      if (focus || rec) focusId = rec ? rec.id : null;
      syncRowSelectionClasses();
      if (rec) emit("select", { id: rec.id, node: rec.node });
    }

    function scrollIndexIntoView(i) {
      if (i < 0) return;
      const rh = rowH(), top = i * rh, bot = top + rh;
      if (top < vp.scrollTop) vp.scrollTop = top;
      else if (bot > vp.scrollTop + vp.clientHeight) vp.scrollTop = Math.max(0, bot - vp.clientHeight);
    }

    // 实体行拖拽排序与移入父节点（Pointer Events + 真实节点行克隆浮空跟手 + 原位隐身空槽）
    let ghostEl = null;
    const clearDropMarks = () => {
      for (const el of rowsEl.querySelectorAll(".sn-tr-drop-in, .sn-tr-drop-before, .sn-tr-drop-after, .sn-tr-dragging, .sn-tr-slot")) {
        el.classList.remove("sn-tr-drop-in", "sn-tr-drop-before", "sn-tr-drop-after", "sn-tr-dragging", "sn-tr-slot");
      }
    };
    const cleanupDrag = (flyToEl = null) => {
      root.classList.remove("sn-is-dragging");
      const pEl = ghostEl;
      ghostEl = null;
      if (pEl) {
        if (flyToEl && !reduced() && flyToEl.isConnected) {
          const to = flyToEl.getBoundingClientRect();
          const cur = pEl.getBoundingClientRect();
          pEl.classList.add("sn-proxy-settling");
          const anim = pEl.animate(
            [
              { transform: pEl.style.transform, opacity: 1 },
              { transform: `translate3d(${Math.round(to.left)}px,${Math.round(to.top)}px,0)`, opacity: 0.96 },
            ],
            { duration: 170, easing: "cubic-bezier(.22, 1, .36, 1)" }
          );
          const slotEl = flyToEl;
          anim.onfinish = () => {
            pEl.remove();
            slotEl.classList.remove("sn-tr-slot", "sn-tr-dragging");
          };
          for (const el of rowsEl.querySelectorAll(".sn-tr-drop-in, .sn-tr-drop-before, .sn-tr-drop-after")) {
            el.classList.remove("sn-tr-drop-in", "sn-tr-drop-before", "sn-tr-drop-after");
          }
          dragState = null;
          return;
        }
        pEl.remove();
      }
      clearDropMarks();
      dragState = null;
    };

    function moveNode(dragId, targetId, position) {
      if (!dragId || !targetId || dragId === targetId) return false;
      if (isDescendant(idx.map, dragId, targetId)) return false;
      const src = idx.map.get(dragId);
      const dst = idx.map.get(targetId);
      if (!src || !dst) return false;
      const beforeRects = new Map();
      if (!reduced() && !isVirt) {
        for (const el of rowsEl.querySelectorAll(".sn-tr")) beforeRects.set(el.dataset.id, el.getBoundingClientRect().top);
      }
      const [moved] = src.list.splice(src.index, 1);
      idx = buildIndex(data);
      const dst2 = idx.map.get(targetId);
      if (!dst2) return false;
      if (position === "inside") {
        if (!Array.isArray(dst2.node.children)) dst2.node.children = [];
        dst2.node.children.push(moved);
        dst2.node.hasChildren = true;
        expanded.add(targetId);
      } else {
        const at = position === "before" ? dst2.index : dst2.index + 1;
        dst2.list.splice(at, 0, moved);
      }
      rebuildFlat();
      if (beforeRects.size) {
        for (const el of rowsEl.querySelectorAll(".sn-tr")) {
          const oldTop = beforeRects.get(el.dataset.id);
          if (oldTop == null) continue;
          const dy = oldTop - el.getBoundingClientRect().top;
          if (Math.abs(dy) > 0.5) {
            el.animate([{ transform: `translate3d(0,${dy}px,0)` }, { transform: "none" }], { duration: 200, easing: "cubic-bezier(.22, 1, .36, 1)" });
          }
        }
      }
      emit("move", { dragId, targetId, position, node: moved, items: cloneTree(data) });
      return true;
    }

    vp.addEventListener("scroll", () => { if (isVirt) renderWindow(false); }, { passive: true });
    vp.addEventListener("sa-jump", () => { if (isVirt) renderWindow(true); });
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => { if (isVirt) renderWindow(true); });
      ro.observe(vp);
    }

    rowsEl.addEventListener("pointerdown", () => { root.classList.remove("sn-tree-kb"); });

    rowsEl.addEventListener("click", (e) => {
      root.classList.remove("sn-tree-kb");
      const retry = e.target.closest("[data-tr-retry]");
      if (retry) { e.stopPropagation(); toggleExpand(retry.dataset.trRetry, true); return; }
      const tw = e.target.closest("[data-tr-tw]");
      if (tw) { e.stopPropagation(); toggleExpand(tw.dataset.trTw); return; }
      const chk = e.target.closest("[data-tr-chk]");
      if (chk) { e.stopPropagation(); toggleCheck(chk.dataset.trChk, chk.querySelector(".sn-box")); return; }
      const row = e.target.closest(".sn-tr");
      if (!row) return;
      const rid = row.dataset.id;
      const rec = idx.map.get(rid);
      if (!isSelectable() && rec && !rec.node.disabled) {
        const hasCh = (Array.isArray(rec.node.children) && rec.node.children.length > 0) || !!rec.node.hasChildren;
        if (hasCh) toggleExpand(rid);
      }
      setSelect(rid, true);
      vp.focus({ preventScroll: true });
    });

    rowsEl.addEventListener("dblclick", (e) => {
      const row = e.target.closest(".sn-tr");
      if (row) toggleExpand(row.dataset.id);
    });

    rowsEl.addEventListener("pointerdown", (e) => {
      if (!opts.draggable || e.button !== 0 || e.target.closest("button, [data-tr-chk]")) return;
      const row = e.target.closest(".sn-tr");
      if (!row) return;
      const id = row.dataset.id;
      const rec = idx.map.get(id);
      if (!rec || rec.node.disabled) return;
      const r = row.getBoundingClientRect();
      dragState = {
        id,
        node: rec.node,
        rowEl: row,
        sx: e.clientX,
        sy: e.clientY,
        grabX: e.clientX - r.left,
        grabY: e.clientY - r.top,
        width: r.width,
        active: false,
        targetId: null,
        pos: null,
      };
    });

    const onWinMove = (e) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.sx, dy = e.clientY - dragState.sy;
      if (!dragState.active) {
        if (Math.hypot(dx, dy) < 5) return;
        dragState.active = true;
        root.classList.add("sn-is-dragging");
        ghostEl = document.createElement("div");
        ghostEl.className = "sn-tr-proxy";
        ghostEl.style.width = Math.round(dragState.width) + "px";
        const inner = document.createElement("div");
        inner.className = "sn-tr-proxy-inner";
        const clone = dragState.rowEl.cloneNode(true);
        clone.removeAttribute("data-id");
        clone.classList.remove("sn-sel", "sn-tr-focus");
        inner.append(clone);
        ghostEl.append(inner);
        document.body.append(ghostEl);
        rowsEl.querySelector(`.sn-tr[data-id="${CSS.escape(dragState.id)}"]`)?.classList.add("sn-tr-slot");
      }
      ghostEl.style.transform = `translate3d(${Math.round(e.clientX - dragState.grabX)}px,${Math.round(e.clientY - dragState.grabY)}px,0)`;
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".sn-tr");
      clearDropMarks();
      rowsEl.querySelector(`.sn-tr[data-id="${CSS.escape(dragState.id)}"]`)?.classList.add("sn-tr-slot");
      dragState.targetId = null;
      dragState.pos = null;
      ghostEl.classList.remove("sn-proxy-aim");
      if (hit && rowsEl.contains(hit)) {
        const tid = hit.dataset.id;
        if (tid && tid !== dragState.id && !isDescendant(idx.map, dragState.id, tid)) {
          const r = hit.getBoundingClientRect();
          const ratio = (e.clientY - r.top) / Math.max(1, r.height);
          const pos = ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "inside";
          dragState.targetId = tid;
          dragState.pos = pos;
          hit.classList.add(pos === "inside" ? "sn-tr-drop-in" : pos === "before" ? "sn-tr-drop-before" : "sn-tr-drop-after");
          if (pos === "inside") ghostEl.classList.add("sn-proxy-aim");
        }
      }
    };

    const onWinUp = () => {
      if (!dragState) return;
      const st = dragState;
      if (st.active && st.targetId && st.pos) {
        cleanupDrag(null);
        moveNode(st.id, st.targetId, st.pos);
      } else {
        const backEl = st.active ? rowsEl.querySelector(`.sn-tr[data-id="${CSS.escape(st.id)}"]`) : null;
        cleanupDrag(backEl);
      }
    };

    document.addEventListener("pointermove", onWinMove);
    document.addEventListener("pointerup", onWinUp);
    document.addEventListener("pointercancel", onWinUp);

    vp.addEventListener("keydown", (e) => {
      if (!flat.length) return;
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) root.classList.add("sn-tree-kb");
      const curIdx = flat.findIndex((it) => it.id === (focusId ?? selectedId));
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const ni = curIdx < 0 ? 0 : Math.min(flat.length - 1, curIdx + 1);
        focusId = flat[ni].id;
        scrollIndexIntoView(ni);
        renderWindow(true);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const ni = curIdx < 0 ? flat.length - 1 : Math.max(0, curIdx - 1);
        focusId = flat[ni].id;
        scrollIndexIntoView(ni);
        renderWindow(true);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusId = flat[0].id;
        scrollIndexIntoView(0);
        renderWindow(true);
      } else if (e.key === "End") {
        e.preventDefault();
        focusId = flat[flat.length - 1].id;
        scrollIndexIntoView(flat.length - 1);
        renderWindow(true);
      } else if (e.key === "ArrowRight" && curIdx >= 0) {
        e.preventDefault();
        const it = flat[curIdx];
        if (it.hasCh && !it.expanded) toggleExpand(it.id, true);
        else if (it.hasCh && it.expanded && flat[curIdx + 1]) { focusId = flat[curIdx + 1].id; scrollIndexIntoView(curIdx + 1); renderWindow(true); }
      } else if (e.key === "ArrowLeft" && curIdx >= 0) {
        e.preventDefault();
        const it = flat[curIdx];
        if (it.hasCh && it.expanded) toggleExpand(it.id, false);
        else {
          const rec = idx.map.get(it.id);
          if (rec?.parent) {
            focusId = String(rec.parent.id);
            const pi = flat.findIndex((x) => x.id === focusId);
            scrollIndexIntoView(pi);
            renderWindow(true);
          }
        }
      } else if (e.key === "Enter" && curIdx >= 0) {
        e.preventDefault();
        setSelect(flat[curIdx].id, true);
      } else if (e.key === " " && curIdx >= 0 && opts.checkable) {
        e.preventDefault();
        toggleCheck(flat[curIdx].id, true);
      } else if (e.key === "Escape" && dragState) {
        cleanupDrag();
      }
    });

    if (qInput) qInput.addEventListener("input", () => { query = qInput.value; vp.scrollTop = 0; rebuildFlat(); });
    if (clrBtn) clrBtn.addEventListener("click", () => { query = ""; if (qInput) { qInput.value = ""; qInput.focus(); } vp.scrollTop = 0; rebuildFlat(); });
    if (expBtn) {
      expBtn.addEventListener("click", () => {
        const allOpen = expBtn.dataset.trExp === "1";
        api.expandAll(!allOpen);
      });
    }

    onCleanup(() => { clearTimeout(collapseTimer); cleanupDrag(); });

    const api = {
      expand(id, open) { return toggleExpand(String(id), open); },
      expandAll(open = true) {
        clearTimeout(collapseTimer);
        if (!open) {
          const domRows = [...rowsEl.querySelectorAll(".sn-tr")];
          const closing = domRows.filter((el) => Number(el.dataset.depth || 0) > 0);
          const beforeIds = new Set(domRows.map((el) => el.dataset.id));
          const commitCollapse = () => {
            expanded.clear();
            rebuildFlat();
            if (!reduced()) {
              let seq = 0;
              for (const el of rowsEl.querySelectorAll(".sn-tr")) {
                if (beforeIds.has(el.dataset.id)) continue;
                const base = isVirt ? (el.style.transform || "") : "";
                el.animate(
                  [
                    { opacity: 0, transform: base ? `${base} translate3d(0,14px,0)` : "translate3d(0,14px,0)" },
                    { opacity: 1, transform: base || "none" },
                  ],
                  { duration: 205, delay: Math.min(seq++, 8) * 12, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "backwards" }
                );
              }
            }
          };
          if (reduced() || !closing.length) {
            commitCollapse();
            return;
          }
          // 先即刻同步按钮图标形变与 Tooltip 文字，再优雅播放全部收起微动效
          syncExpandAllBtn(false);
          let seenClosing = 0;
          for (const el of domRows) {
            const depth = Number(el.dataset.depth || 0);
            const base = isVirt ? (el.style.transform || "") : "";
            if (depth > 0) {
              seenClosing++;
              el.animate(
                [
                  { opacity: 1, transform: base || "none" },
                  { opacity: 0, transform: base ? `${base} translate3d(0,-10px,0)` : "translate3d(0,-10px,0)" },
                ],
                { duration: 155, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" }
              );
            } else {
              if (el.classList.contains("sn-open")) {
                el.classList.remove("sn-open");
                el.setAttribute("aria-expanded", "false");
              }
              if (seenClosing > 0) {
                const shift = Math.min(seenClosing * rowH(), (vp.clientHeight || 360) + rowH());
                el.animate(
                  [
                    { transform: base || "none" },
                    { transform: base ? `${base} translate3d(0,${-shift}px,0)` : `translate3d(0,${-shift}px,0)` },
                  ],
                  { duration: 165, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" }
                );
              }
            }
          }
          collapseTimer = setTimeout(commitCollapse, 160);
          return;
        }

        const prevOpenIds = new Set(expanded);
        const prevIds = new Set();
        const beforeRects = new Map();
        const pushedOutClones = [];
        const domRows = [...rowsEl.querySelectorAll(".sn-tr")];
        for (let k = 0; k < domRows.length; k++) {
          const el = domRows[k];
          prevIds.add(el.dataset.id);
          beforeRects.set(el.dataset.id, el.getBoundingClientRect().top);
          if (isVirt && k > 0 && pushedOutClones.length < 12) {
            pushedOutClones.push({ id: el.dataset.id, clone: el.cloneNode(true), base: el.style.transform || "" });
          }
        }
        expanded.clear();
        for (const [id, rec] of idx.map) {
          if (Array.isArray(rec.node.children) && rec.node.children.length) expanded.add(id);
        }
        rebuildFlat();
        if (!reduced()) {
          const nextRows = [...rowsEl.querySelectorAll(".sn-tr")];
          const nextIds = new Set(nextRows.map((el) => el.dataset.id));
          if (pushedOutClones.length) {
            const ghostWrap = document.createElement("div");
            ghostWrap.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:0;";
            let kept = 0;
            for (const item of pushedOutClones) {
              if (nextIds.has(item.id)) continue;
              kept++;
              const g = item.clone;
              ghostWrap.append(g);
              const base = item.base;
              g.animate(
                [
                  { opacity: 1, transform: base || "none" },
                  { opacity: 0, transform: base ? `${base} translate3d(0,36px,0)` : "translate3d(0,36px,0)" },
                ],
                { duration: 185, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" }
              );
            }
            if (kept) {
              space.append(ghostWrap);
              setTimeout(() => ghostWrap.remove(), 205);
            }
          }
          let seq = 0;
          for (const el of nextRows) {
            const id = el.dataset.id;
            const base = isVirt ? (el.style.transform || "") : "";
            if (el.classList.contains("sn-open") && !prevOpenIds.has(id)) {
              el.querySelector(".sn-tr-tw .sn-ic")?.animate([{ rotate: "0deg" }, { rotate: "90deg" }], { duration: 195, easing: "cubic-bezier(.22, 1, .36, 1)" });
            }
            if (!prevIds.has(id)) {
              el.animate(
                [
                  { opacity: 0, transform: base ? `${base} translate3d(0,-12px,0)` : "translate3d(0,-12px,0)" },
                  { opacity: 1, transform: base || "none" },
                ],
                { duration: 215, delay: Math.min(seq++, 9) * 15, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "backwards" }
              );
            } else if (beforeRects.has(id)) {
              const dy = beforeRects.get(id) - el.getBoundingClientRect().top;
              if (Math.abs(dy) > 0.5) {
                el.animate(
                  [
                    { transform: base ? `${base} translate3d(0,${dy}px,0)` : `translate3d(0,${dy}px,0)` },
                    { transform: base || "none" },
                  ],
                  { duration: 230, easing: "cubic-bezier(.22, 1, .36, 1)" }
                );
              }
            }
          }
        }
      },
      filter(q) {
        query = String(q ?? "");
        if (qInput) qInput.value = query;
        vp.scrollTop = 0;
        rebuildFlat();
      },
      select(id) { setSelect(id, false, true); },
      setItems(nextItems) { data = cloneTree(nextItems); rebuildFlat(); },
      getVisibleCount() { return flat.length; },
      getRenderedCount() { return renderedCount; },
      update(next, prev) {
        opts = { ...opts, ...next };
        if (next.height !== prev?.height) root.style.height = cssSize(next.height, "360px");
        if (next.rowHeight !== prev?.rowHeight) root.style.setProperty("--sn-tr-h", rowH() + "px");
        if (next.activeStyle !== prev?.activeStyle) applyActiveStyle(root, next.activeStyle, "tr");
        if (next.expanded && next.expanded !== prev?.expanded) {
          expanded.clear();
          for (const id of next.expanded) expanded.add(String(id));
        }
        if (next.checked && next.checked !== prev?.checked) {
          checked.clear();
          for (const id of next.checked) checked.add(String(id));
        }
        if (next.selected !== undefined && next.selected !== prev?.selected) {
          selectedId = next.selected != null ? String(next.selected) : null;
        }
        if (next.items && next.items !== prev?.items) data = cloneTree(next.items);
        rebuildFlat();
      },
      destroy() { clearTimeout(collapseTimer); cleanupDrag(); },
    };

    rebuildFlat();
    return api;
  },
});

// ————————————————————————————————————————————————————————————————
// 2. 文件管理器与高度拟物文件夹（FileExplorer）：fileExplorerHTML + createFileExplorer
// ————————————————————————————————————————————————————————————————
export function fileExplorerHTML(o = {}) {
  const h = cssSize(o.height, "460px");
  const label = esc(o.label || tt("tree.15"));
  const v = o.view || "card";
  const searchable = o.searchable !== false;
  return `<div class="sn-fex" tabindex="0" role="region" aria-label="${label}" style="height:${esc(h)}">`
    + `<div class="sn-fex-bar">`
    + `<div class="sn-fex-nav">`
    + `<button type="button" class="sn-btn sn-ghost sn-sm sn-ibtn sn-fex-up" data-fx-up disabled data-tip="${esc(tt("tree.17"))}" aria-label="${esc(tt("tree.17"))}">${icon("arrow-left", 15)}</button>`
    + `<nav class="sn-fex-crumbs" data-fx-crumbs aria-label="${esc(tt("tree.16"))}"></nav>`
    + `</div>`
    + `<div class="sn-fex-tools">`
    + (searchable
      ? `<div class="sn-ib sn-has-pre sn-has-post sn-fex-search">`
        + `<span class="sn-pre">${icon("search", 14)}</span>`
        + `<input class="sn-input sn-sm" type="text" data-fx-q placeholder="${esc(tt("tree.18"))}" aria-label="${esc(tt("tree.18"))}">`
        + `<span class="sn-post"><button type="button" class="sn-clear" data-fx-clr aria-label="${esc(tt("tree.2"))}">${icon("x", 13)}</button></span>`
        + `</div>`
      : "")
    + `<button type="button" class="sn-btn sn-secondary sn-sm" data-fx-new aria-haspopup="menu" aria-expanded="false">${icon("plus", 14)}<span>${esc(tt("tree.19"))}</span></button>`
    + `<div class="sn-seg sn-sm sn-fex-view-seg" data-fx-seg role="tablist" aria-label="${esc(tt("tree.23"))}">`
    + `<span class="sn-thumb"></span>`
    + `<button type="button" data-v="card" aria-selected="${v === "card"}">${icon("layout-grid", 14)}<span>${esc(tt("tree.20"))}</span></button>`
    + `<button type="button" data-v="list" aria-selected="${v === "list"}">${icon("list", 14)}<span>${esc(tt("tree.21"))}</span></button>`
    + `<button type="button" data-v="tree" aria-selected="${v === "tree"}">${icon("git-branch", 14)}<span>${esc(tt("tree.22"))}</span></button>`
    + `</div>`
    + `</div>`
    + `</div>`
    + `<div class="sn-fex-body" data-fx-body><div class="sn-fex-stage" data-fx-stage></div></div>`
    + `<div class="sn-fex-batch" data-fx-batch role="toolbar" aria-label="${esc(tt("tree.15"))}">`
    + `<span class="sn-fex-batch-cnt"><span class="sn-fex-batch-num" data-fx-bnum>0</span><span data-fx-btxt></span></span>`
    + `<button type="button" class="sn-fex-batch-btn" data-fx-bact="all">${icon("check", 13)}<span data-fx-ball-lbl>${esc(tt("tree.77"))}</span></button>`
    + `<button type="button" class="sn-fex-batch-btn" data-fx-bact="move" aria-haspopup="menu" aria-expanded="false">${icon("folder", 13)}<span>${esc(tt("tree.79"))}</span></button>`
    + `<button type="button" class="sn-fex-batch-btn" data-fx-bact="dup">${icon("copy", 13)}<span>${esc(tt("tree.82"))}</span></button>`
    + `<button type="button" class="sn-fex-batch-btn sn-danger" data-fx-bact="del">${icon("trash-2", 13)}<span>${esc(tt("tree.44"))}</span></button>`
    + `<button type="button" class="sn-fex-batch-btn sn-fex-batch-x" data-fx-bact="clear" aria-label="${esc(tt("tree.78"))}">${icon("x", 13)}</button>`
    + `</div>`
    + `<div class="sn-fex-foot"><span data-fx-stat></span><span class="sn-fex-foot-hint" data-fx-hint>${esc(tt("tree.67"))}</span></div>`
    + `</div>`;
}

export const createFileExplorer = /* @__PURE__ */ defineComponent({
  name: "FileExplorer",
  html: fileExplorerHTML,
  defaults: {
    items: [],
    view: "card",
    height: 460,
    searchable: true,
    rootName: "",
    menuSurface: "blur",
  },
  mount(root, initialOpts, { emit }) {
    let opts = { ...initialOpts };
    let data = cloneTree(opts.items);
    let idx = buildIndex(data);
    let view = ["card", "list", "tree"].includes(opts.view) ? opts.view : "card";
    let pathIds = Array.isArray(opts.path) ? opts.path.map(String) : [];
    const selected = new Set();
    let multiMode = false;
    let lastAnchorId = null;
    const treeExpanded = new Set();
    const loadingIds = new Set();
    let query = "";
    let sortKey = "name";
    let sortDir = 1;
    let renamingId = null;
    let droppedFolderId = null;
    let droppedFreshIds = new Set();
    let droppedTimer = 0;
    let freshIds = new Set();
    let freshTimer = 0;
    let deleteTimer = 0;
    let moveTimer = 0;
    let deleting = false;
    let suppressNextClick = false;
    let canceledByEsc = false;
    let lastNavAt = 0;
    let ctxTargetId = null;
    const undoStack = [];

    for (const n of data.slice(0, 2)) {
      if (isFolderNode(n) && Array.isArray(n.children) && n.children.length) treeExpanded.add(String(n.id));
    }

    const upBtn = root.querySelector("[data-fx-up]");
    const crumbsEl = root.querySelector("[data-fx-crumbs]");
    const qInput = root.querySelector("[data-fx-q]");
    const qWrap = root.querySelector(".sn-fex-search");
    const clrBtn = root.querySelector("[data-fx-clr]");
    const newBtn = root.querySelector("[data-fx-new]");
    const segEl = root.querySelector("[data-fx-seg]");
    const bodyHost = root.querySelector("[data-fx-body]");
    // 复用 Satin ScrollArea：隐藏系统原生滚动条，呈现优雅悬浮细滚动条 + 边缘渐隐 + sa-jump 虚拟树同步
    const bodySa = scrollArea(bodyHost, { fade: "y", size: 20, bar: "auto", overscroll: "contain", inner: true });
    const bodyEl = bodySa.vp;
    const stageEl = bodyEl.querySelector("[data-fx-stage]");
    const batchEl = root.querySelector("[data-fx-batch]");
    const batchNumEl = root.querySelector("[data-fx-bnum]");
    const batchTxtEl = root.querySelector("[data-fx-btxt]");
    const batchAllLbl = root.querySelector("[data-fx-ball-lbl]");
    const batchMoveBtn = root.querySelector('[data-fx-bact="move"]');
    const statEl = root.querySelector("[data-fx-stat]");
    const hintEl = root.querySelector("[data-fx-hint]");
    let lastBatchCount = 0;
    let fxCollapseTimer = 0;
    applyActiveStyle(root, opts.activeStyle, "fex");

    const rootTitle = () => opts.rootName || tt("tree.16");
    const viewIndex = (v) => Math.max(0, ["card", "list", "tree"].indexOf(v));
    const segCtl = segEl ? initSeg(segEl, (v) => setView(v, true), viewIndex(view)) : null;

    // 专属浮动菜单池（复用 Satin openMenu，销毁时由 onCleanup 彻底移除）
    const menuUid = nextUid("sn-fexm");
    const mainMenu = document.createElement("div");
    mainMenu.className = "sn-menu sn-float";
    mainMenu.id = menuUid;
    mainMenu.setAttribute("role", "menu");
    mainMenu.tabIndex = -1;
    const subMoveMenu = document.createElement("div");
    subMoveMenu.className = "sn-menu sn-float sn-sub";
    subMoveMenu.id = `${menuUid}-move`;
    subMoveMenu.setAttribute("role", "menu");
    subMoveMenu.tabIndex = -1;
    const subViewMenu = document.createElement("div");
    subViewMenu.className = "sn-menu sn-float sn-sub";
    subViewMenu.id = `${menuUid}-view`;
    subViewMenu.setAttribute("role", "menu");
    subViewMenu.tabIndex = -1;
    document.body.append(mainMenu, subMoveMenu, subViewMenu);

    function captureRects() {
      const m = new Map();
      if (reduced() || (view === "tree" && treeVirt)) return m;
      const sr = stageEl.getBoundingClientRect();
      for (const el of stageEl.querySelectorAll("[data-fx-id]")) {
        const r = el.getBoundingClientRect();
        m.set(el.dataset.fxId, { left: r.left - sr.left, top: r.top - sr.top, width: r.width, height: r.height });
      }
      return m;
    }

    function playFlip(beforeRects, skipId = null) {
      if (!beforeRects || !beforeRects.size || reduced() || (view === "tree" && treeVirt)) return;
      const sr = stageEl.getBoundingClientRect();
      for (const el of stageEl.querySelectorAll("[data-fx-id]")) {
        if (skipId && el.dataset.fxId === skipId) continue;
        const old = beforeRects.get(el.dataset.fxId);
        if (!old || el.classList.contains("sn-fex-fresh")) continue;
        const r = el.getBoundingClientRect();
        const dx = old.left - (r.left - sr.left), dy = old.top - (r.top - sr.top);
        if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5) continue;
        // 卡片视图跨行折返补位（从下一行左侧折回上一行最右列）：柔和从右侧淡滑入位，避免对角线斜穿屏幕盖住其他卡片
        if (view === "card" && Math.abs(dy) > 24 && Math.abs(dx) > old.width * 1.4) {
          const sign = dx < 0 ? 1 : -1;
          el.animate(
            [
              { opacity: 0.25, transform: `translate3d(${sign * 16}px,0,0) scale(.97)` },
              { opacity: 1, transform: "none" },
            ],
            { duration: 230, easing: "cubic-bezier(.22, 1, .36, 1)" }
          );
          continue;
        }
        el.animate(
          [{ transform: `translate3d(${dx}px,${dy}px,0)` }, { transform: "none" }],
          { duration: 250, easing: "cubic-bezier(.22, 1, .36, 1)" }
        );
      }
    }

    function markFresh(ids) {
      clearTimeout(freshTimer);
      freshIds = new Set(ids.map(String));
      if (!freshIds.size) return;
      freshTimer = setTimeout(() => {
        freshIds = new Set();
        stageEl.querySelectorAll(".sn-fex-fresh").forEach((el) => el.classList.remove("sn-fex-fresh"));
      }, 360);
    }

    function visibleItemIds() {
      if (view === "tree") return treeFlat.map((it) => it.id);
      const { list } = resolveFolder();
      return sortedItems(list).map((n) => String(n.id));
    }

    function pushUndo() {
      undoStack.push({ data: cloneTree(data), pathIds: [...pathIds], selected: [...selected] });
      if (undoStack.length > 30) undoStack.shift();
    }

    function undo(quiet = false) {
      const snap = undoStack.pop();
      if (!snap) return false;
      const beforeRects = captureRects();
      const prevIds = new Set(visibleItemIds());
      data = snap.data;
      pathIds = snap.pathIds;
      selected.clear();
      snap.selected.forEach((id) => selected.add(id));
      if (selected.size < 2) multiMode = false;
      idx = buildIndex(data);
      const nextVis = visibleItemIds();
      const restored = nextVis.filter((id) => !prevIds.has(id));
      if (restored.length) markFresh(restored);
      render(false);
      playFlip(beforeRects);
      emit("change", { items: cloneTree(data), action: "undo" });
      if (!quiet) toast({ text: tt("tree.57"), tone: "ok" });
      return true;
    }

    function showUndoToast(text) {
      toast({
        kind: "action",
        text,
        action: {
          label: tt("tree.49"),
          run: (t) => {
            if (undo(true)) t.update({ kind: "status", text: tt("tree.57"), tone: "ok", done: true });
          },
        },
      });
    }

    function resolveFolder() {
      idx = buildIndex(data);
      const validPath = [];
      let list = data;
      let folder = null;
      for (const id of pathIds) {
        const found = list.find((n) => String(n.id) === id && isFolderNode(n));
        if (!found) break;
        validPath.push(id);
        folder = found;
        if (!Array.isArray(found.children)) found.children = [];
        list = found.children;
      }
      pathIds = validPath;
      return { folder, list };
    }

    function sortedItems(list) {
      const q = query.trim().toLowerCase();
      let arr = q
        ? list.filter((n) => String(n.name || "").toLowerCase().includes(q) || String(tt(KIND_LABEL_KEY[kindOf(n)] || "tree.34")).toLowerCase().includes(q))
        : list.slice();
      if (sortKey === "manual") return arr;
      arr.sort((a, b) => {
        const fa = isFolderNode(a) ? 0 : 1, fb = isFolderNode(b) ? 0 : 1;
        if (sortKey === "name" && fa !== fb) return fa - fb;
        let cmp = 0;
        if (sortKey === "name") cmp = String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
        else if (sortKey === "kind") cmp = String(kindOf(a)).localeCompare(String(kindOf(b)));
        else if (sortKey === "size") cmp = parseSizeBytes(a.size) - parseSizeBytes(b.size);
        else if (sortKey === "updated") cmp = String(a.updated || "").localeCompare(String(b.updated || ""));
        return cmp * sortDir;
      });
      return arr;
    }

    const TREE_ROW_H = 36;
    let treeFlat = [];
    let treeVirt = false;
    let treeLastWin = [-1, -1];

    function buildTreeFlat() {
      idx = buildIndex(data);
      const q = query.trim().toLowerCase();
      const out = [];
      const { list: scopeList } = resolveFolder();
      if (!q) {
        const walk = (list, depth, guides) => {
          const ordered = list.slice().sort((a, b) => (isFolderNode(a) ? 0 : 1) - (isFolderNode(b) ? 0 : 1));
          for (let i = 0; i < ordered.length; i++) {
            const node = ordered[i];
            const id = String(node.id);
            const fdr = isFolderNode(node);
            const hasCh = fdr && ((Array.isArray(node.children) && node.children.length > 0) || !!node.hasChildren);
            const isExp = fdr && treeExpanded.has(id);
            const isLast = i === ordered.length - 1;
            out.push({ id, node, depth, fdr, hasCh, expanded: isExp, loading: loadingIds.has(id), guides });
            if (isExp && Array.isArray(node.children) && node.children.length) {
              walk(node.children, depth + 1, [...guides, !isLast]);
            }
          }
        };
        walk(scopeList, 0, []);
      } else {
        const keep = new Set();
        const mark = (n) => {
          const id = String(n.id);
          const hit = String(n.name || "").toLowerCase().includes(q);
          let chHit = false;
          if (Array.isArray(n.children)) for (const c of n.children) if (mark(c)) chHit = true;
          if (hit || chHit) { keep.add(id); return true; }
          return false;
        };
        scopeList.forEach(mark);
        const walk = (list, depth, guides) => {
          const vis = list.filter((n) => keep.has(String(n.id)));
          for (let i = 0; i < vis.length; i++) {
            const node = vis[i];
            const id = String(node.id);
            const fdr = isFolderNode(node);
            const hasCh = fdr && Array.isArray(node.children) && node.children.some((c) => keep.has(String(c.id)));
            out.push({ id, node, depth, fdr, hasCh, expanded: hasCh, loading: false, guides });
            if (hasCh) walk(node.children, depth + 1, [...guides, i < vis.length - 1]);
          }
        };
        walk(scopeList, 0, []);
      }
      treeFlat = out;
      treeVirt = treeFlat.length > 80;
      treeLastWin = [-1, -1];
    }

    let collapsedCrumbs = [];
    function renderCrumbs() {
      upBtn.disabled = pathIds.length === 0;
      const parts = [{ id: "", name: rootTitle() }];
      let list = data;
      for (const pid of pathIds) {
        const f = list.find((n) => String(n.id) === pid);
        if (!f) break;
        parts.push({ id: pid, name: f.name });
        list = f.children || [];
      }
      const crumbBtn = (p, i, isLast, extraCls = "") =>
        `<button type="button" class="sn-fex-crumb${extraCls}" data-crumb-id="${esc(p.id)}" data-crumb-idx="${i}"${isLast ? ' aria-current="page"' : ""}>${i === 0 ? icon("folder", 13) : ""}<span class="sn-fex-crumb-txt" data-tip-full>${esc(p.name)}</span></button>`;
      if (parts.length <= 2) {
        collapsedCrumbs = [];
        crumbsEl.innerHTML = parts
          .map((p, i) => (i > 0 ? `<span class="sn-fex-csep">${icon("chevron-right", 12)}</span>` : "")
            + crumbBtn(p, i, i === parts.length - 1, i === 0 ? " sn-fex-crumb-root" : ""))
          .join("");
      } else {
        // 3 级及以上路径优雅折叠中间祖先为「…」（点开复用 Satin openMenu 直达任意层级），彻底避免挤扁切半字
        collapsedCrumbs = parts.slice(1, -1);
        const last = parts[parts.length - 1];
        crumbsEl.innerHTML =
          crumbBtn(parts[0], 0, false, " sn-fex-crumb-root")
          + `<span class="sn-fex-csep">${icon("chevron-right", 12)}</span>`
          + `<button type="button" class="sn-fex-crumb sn-fex-crumb-more" data-crumb-more aria-haspopup="menu" aria-label="${esc(tt("tree.16"))}" data-tip="${esc(collapsedCrumbs.map((x) => x.name).join(" / "))}">…</button>`
          + `<span class="sn-fex-csep">${icon("chevron-right", 12)}</span>`
          + crumbBtn(last, parts.length - 1, true);
      }
    }

    let lastVisibleCount = 0;
    // 唯一统一的选中模型：凡已选中（selected.size > 0）必与复选框打勾、柔选底、底栏计数及悬浮批量操作胶囊四位一体 100% 同步，
    // 平时常规态 0 持续灰底，仅保留柔和 hover，彻底消灭“无勾假灰底”的认知割裂
    function syncSelectionUI() {
      const visIds = visibleItemIds();
      const selCount = selected.size;
      const showChecks = selCount > 0;
      multiMode = showChecks;
      root.classList.toggle("sn-selecting", showChecks);
      root.classList.toggle("sn-has-batch", showChecks);

      for (const el of stageEl.querySelectorAll("[data-fx-id]")) {
        const isSel = selected.has(el.dataset.fxId);
        el.classList.toggle("sn-sel", isSel);
        const chk = el.querySelector("[data-fx-chk]");
        if (chk) {
          chk.classList.toggle("sn-on", isSel);
          chk.setAttribute("aria-pressed", String(isSel));
        }
      }

      const allChk = stageEl.querySelector("[data-fx-chk-all]");
      const visSelCount = showChecks ? visIds.filter((id) => selected.has(id)).length : 0;
      if (allChk) {
        const allOn = showChecks && visIds.length > 0 && visSelCount === visIds.length;
        const mixed = showChecks && visSelCount > 0 && visSelCount < visIds.length;
        allChk.classList.toggle("sn-on", allOn);
        allChk.classList.toggle("sn-mixed", mixed);
        allChk.setAttribute("aria-pressed", allOn ? "true" : mixed ? "mixed" : "false");
      }

      if (batchEl) {
        batchEl.classList.toggle("sn-open", showChecks);
        if (batchNumEl && selCount !== lastBatchCount) {
          batchNumEl.textContent = String(selCount);
          if (showChecks && !reduced()) {
            batchNumEl.classList.remove("sn-bump");
            void batchNumEl.offsetWidth;
            batchNumEl.classList.add("sn-bump");
          }
          lastBatchCount = selCount;
        }
        if (batchTxtEl) batchTxtEl.textContent = tt("tree.93");
        if (batchAllLbl) batchAllLbl.textContent = visIds.length > 0 && visSelCount === visIds.length ? tt("tree.81") : tt("tree.77");
      }

      renderFooter(lastVisibleCount);
    }

    function renderFooter(visibleCount) {
      lastVisibleCount = visibleCount;
      if (selected.size > 0) {
        statEl.textContent = `${tt("tree.5", { p0: visibleCount })} · ${tt("tree.59", { p0: selected.size })}`;
      } else {
        statEl.textContent = tt("tree.5", { p0: visibleCount });
      }
      if (qWrap) qWrap.classList.toggle("sn-filled", !!query);
      if (hintEl) hintEl.textContent = selected.size > 0 ? tt("tree.83") : tt("tree.67");
    }

    function tableHeaderHTML() {
      const arrow = (k) => (sortKey === k ? icon(sortDir > 0 ? "arrow-up" : "arrow-down", 12) : "");
      return `<div class="sn-fex-tbl-hd">`
        + `<div class="sn-fex-hd-main">`
        + `<button type="button" class="sn-check sn-fex-all-chk" data-fx-chk-all aria-pressed="false" aria-label="${esc(tt("tree.77"))}">${BOX}</button>`
        + `<button type="button" class="sn-fex-th${sortKey === "name" ? " sn-on" : ""}" data-fx-sort="name">${esc(tt("tree.24"))}${arrow("name")}</button>`
        + `</div>`
        + `<button type="button" class="sn-fex-th${sortKey === "kind" ? " sn-on" : ""}" data-fx-sort="kind">${esc(tt("tree.25"))}${arrow("kind")}</button>`
        + `<button type="button" class="sn-fex-th sn-fex-num${sortKey === "size" ? " sn-on" : ""}" data-fx-sort="size">${esc(tt("tree.26"))}${arrow("size")}</button>`
        + `<button type="button" class="sn-fex-th${sortKey === "updated" ? " sn-on" : ""}" data-fx-sort="updated">${esc(tt("tree.27"))}${arrow("updated")}</button>`
        + `</div>`;
    }

    function nameOrRenameHTML(node, isCard) {
      const id = String(node.id);
      if (renamingId === id) {
        return `<input type="text" class="sn-fex-rename" data-fx-rename-input="${esc(id)}" value="${esc(node.name)}" aria-label="${esc(tt("tree.41"))}">`;
      }
      const q = query.trim().toLowerCase();
      return `<span class="${isCard ? "sn-fex-name" : "sn-fex-row-name"}" data-tip-full>${highlightText(node.name, q)}</span>`;
    }

    function renderTreeRowHTML(it, index) {
      const { id, node, depth, fdr, hasCh, expanded: isExp, loading, guides } = it;
      const k = kindOf(node);
      const isSel = selected.has(id);
      const isChk = isSel;
      const isFresh = freshIds.has(id);
      const cnt = fdr ? (Array.isArray(node.children) ? node.children.length : 0) : 0;
      const guidesHtml = depth > 0
        ? `<span class="sn-tr-guides">${guides.map((l) => `<span class="sn-tr-g${l ? " sn-tr-g-line" : ""}"></span>`).join("")}</span>`
        : "";
      const twHtml = loading
        ? `<span class="sn-tr-tw" aria-hidden="true"><span class="sn-tr-spin"></span></span>`
        : `<button type="button" class="sn-tr-tw${fdr && hasCh ? "" : " sn-tr-leaf"}" data-fx-tw="${esc(id)}" tabindex="-1" aria-label="${esc(isExp ? tt("tree.13") : tt("tree.12"))}">${icon("chevron-right", 13)}</button>`;
      const chkHtml = `<button type="button" class="sn-check sn-fex-row-chk${isChk ? " sn-on" : ""}" data-fx-chk="${esc(id)}" tabindex="-1" aria-pressed="${isChk}" aria-label="${esc(tt("tree.80", { p0: node.name }))}">${BOX}</button>`;
      const posStyle = treeVirt ? ` style="transform:translate3d(0,${index * TREE_ROW_H}px,0)"` : "";
      const cls = ["sn-fex-row", isSel ? "sn-sel" : "", isExp ? "sn-open" : "", isFresh ? "sn-fex-fresh" : ""].filter(Boolean).join(" ");
      return `<div class="${cls}" role="treeitem" data-fx-id="${esc(id)}" data-folder="${fdr ? "1" : "0"}" data-depth="${depth}"${fdr ? ` aria-expanded="${isExp}"` : ""}${posStyle}>`
        + `<div class="sn-fex-row-main">${chkHtml}${guidesHtml}${twHtml}${renderRowIcon(node, isExp)}${nameOrRenameHTML(node, false)}${fdr ? `<span class="sn-fex-row-cnt">${cnt > 0 ? tt("tree.35", { p0: cnt }) : node.hasChildren ? "…" : tt("tree.36")}</span>` : ""}</div>`
        + `<span class="sn-fex-cell">${esc(tt(KIND_LABEL_KEY[k] || "tree.34"))}</span>`
        + `<span class="sn-fex-cell sn-fex-num">${esc(fdr ? (cnt ? tt("tree.35", { p0: cnt }) : tt("tree.36")) : formatSize(node.size))}</span>`
        + `<span class="sn-fex-cell">${esc(node.updated || "—")}</span>`
        + `</div>`;
    }

    function paintTreeWindow(force = false) {
      const space = stageEl.querySelector(".sn-fex-tree-space");
      const rows = stageEl.querySelector(".sn-fex-tree-rows");
      if (!space || !rows) return;
      if (!treeVirt) {
        space.style.height = "";
        rows.innerHTML = treeFlat.map((it, i) => renderTreeRowHTML(it, i)).join("");
        return;
      }
      space.style.height = (treeFlat.length * TREE_ROW_H + 8) + "px";
      const vh = bodyEl.clientHeight || 360;
      const top = Math.max(0, bodyEl.scrollTop - 32);
      const overscan = 6;
      const start = Math.max(0, Math.floor(top / TREE_ROW_H) - overscan);
      const end = Math.min(treeFlat.length, Math.ceil((top + vh) / TREE_ROW_H) + overscan);
      if (!force && start === treeLastWin[0] && end === treeLastWin[1]) return;
      treeLastWin = [start, end];
      let html = "";
      for (let i = start; i < end; i++) html += renderTreeRowHTML(treeFlat[i], i);
      rows.innerHTML = html;
    }

    function render(animateStage = false) {
      const { list } = resolveFolder();
      renderCrumbs();

      stageEl.classList.remove("sn-fex-enter", "sn-fex-enter-in", "sn-fex-enter-out");
      if (animateStage && !reduced()) {
        void stageEl.offsetWidth;
        if (animateStage === "in") stageEl.classList.add("sn-fex-enter-in");
        else if (animateStage === "out") stageEl.classList.add("sn-fex-enter-out");
        else stageEl.classList.add("sn-fex-enter");
      }

      if (view === "tree") {
        buildTreeFlat();
        renderFooter(treeFlat.length);
        if (!treeFlat.length) {
          stageEl.innerHTML = `<div class="sn-fex-empty">${icon(query ? "search" : "folder-open", 26)}<b>${esc(query ? tt("tree.10") : tt("tree.37"))}</b><span>${esc(query ? "" : tt("tree.38"))}</span></div>`;
          syncSelectionUI();
          bodySa.refresh();
          return;
        }
        stageEl.innerHTML = `${tableHeaderHTML()}<div class="sn-fex-tree${treeVirt ? " sn-fex-tree-virt" : ""}" role="tree"><div class="sn-fex-tree-space"><div class="sn-fex-tree-rows"></div></div></div>`;
        paintTreeWindow(true);
        syncSelectionUI();
        bodySa.refresh();
        focusRenameInput();
        return;
      }

      const items = sortedItems(list);
      renderFooter(items.length);

      if (!items.length) {
        stageEl.innerHTML = `<div class="sn-fex-empty">${icon(query ? "search" : "folder-open", 26)}<b>${esc(query ? tt("tree.10") : tt("tree.37"))}</b><span>${esc(query ? "" : tt("tree.38"))}</span></div>`;
        syncSelectionUI();
        bodySa.refresh();
        return;
      }

      let freshSeq = 0;
      const enterStagger = animateStage === "in" || animateStage === "out";
      if (view === "card") {
        stageEl.innerHTML = `<div class="sn-fex-grid">${items.map((node, itemIdx) => {
          const id = String(node.id);
          const fdr = isFolderNode(node);
          const isSel = selected.has(id);
          const isFresh = freshIds.has(id);
          const cnt = fdr && Array.isArray(node.children) ? node.children.length : 0;
          const isDropped = droppedFolderId === id;
          const subText = fdr
            ? (cnt > 0 ? tt("tree.35", { p0: cnt }) : node.hasChildren ? "…" : tt("tree.36"))
            : (() => {
                const sz = formatSize(node.size);
                const k = kindOf(node);
                if (k === "audio" && node.duration) return sz !== "—" ? `${sz} · ${node.duration}` : node.duration;
                return sz !== "—" ? sz : tt(KIND_LABEL_KEY[k] || "tree.34");
              })();
          const tint = fdr ? resolveFolderColor(node.color) : "";
          const cls = ["sn-fex-tile", isSel ? "sn-sel" : "", tint ? "sn-fex-tinted" : "", isDropped ? "sn-fdr-dropped" : "", isFresh ? "sn-fex-fresh" : ""].filter(Boolean).join(" ");
          const isChk = isSel;
          const stVal = isFresh ? freshSeq++ : enterStagger ? Math.min(itemIdx, 9) : -1;
          const styleParts = [];
          if (stVal >= 0) styleParts.push(`--sn-stagger:${stVal}`);
          if (tint) styleParts.push(`--sn-fdr-tint:${esc(tint)}`);
          const st = styleParts.length ? ` style="${styleParts.join(";")}"` : "";
          const chkHtml = `<button type="button" class="sn-check sn-fex-chk${isChk ? " sn-on" : ""}" data-fx-chk="${esc(id)}" tabindex="-1" aria-pressed="${isChk}" aria-label="${esc(tt("tree.80", { p0: node.name }))}">${BOX}</button>`;
          return `<div class="${cls}" tabindex="0" data-fx-id="${esc(id)}" data-folder="${fdr ? "1" : "0"}" data-kind="${esc(kindOf(node))}"${st}>`
            + chkHtml
            + (fdr ? renderSkeuoFolder(node, isDropped ? droppedFreshIds : null) : renderFileCardVisual(node))
            + `<div class="sn-fex-meta-box">${nameOrRenameHTML(node, true)}<span class="sn-fex-sub">${esc(subText)}</span></div>`
            + `</div>`;
        }).join("")}</div>`;
      } else {
        stageEl.innerHTML = `${tableHeaderHTML()}<div class="sn-fex-list-rows">${items.map((node, itemIdx) => {
          const id = String(node.id);
          const fdr = isFolderNode(node);
          const k = kindOf(node);
          const isSel = selected.has(id);
          const isFresh = freshIds.has(id);
          const cnt = fdr && Array.isArray(node.children) ? node.children.length : 0;
          const cls = ["sn-fex-row", isSel ? "sn-sel" : "", isFresh ? "sn-fex-fresh" : ""].filter(Boolean).join(" ");
          const isChk = isSel;
          const stVal = isFresh ? freshSeq++ : enterStagger ? Math.min(itemIdx, 9) : -1;
          const st = stVal >= 0 ? ` style="--sn-stagger:${stVal}"` : "";
          const chkHtml = `<button type="button" class="sn-check sn-fex-row-chk${isChk ? " sn-on" : ""}" data-fx-chk="${esc(id)}" tabindex="-1" aria-pressed="${isChk}" aria-label="${esc(tt("tree.80", { p0: node.name }))}">${BOX}</button>`;
          return `<div class="${cls}" data-fx-id="${esc(id)}" data-folder="${fdr ? "1" : "0"}" data-kind="${esc(k)}"${st}>`
            + `<div class="sn-fex-row-main">${chkHtml}${renderRowIcon(node, false)}${nameOrRenameHTML(node, false)}${fdr ? `<span class="sn-fex-row-cnt">${cnt > 0 ? tt("tree.35", { p0: cnt }) : node.hasChildren ? "…" : tt("tree.36")}</span>` : ""}</div>`
            + `<span class="sn-fex-cell">${esc(tt(KIND_LABEL_KEY[k] || "tree.34"))}</span>`
            + `<span class="sn-fex-cell sn-fex-num">${esc(fdr ? (cnt ? tt("tree.35", { p0: cnt }) : tt("tree.36")) : formatSize(node.size))}</span>`
            + `<span class="sn-fex-cell">${esc(node.updated || "—")}</span>`
            + `</div>`;
        }).join("")}</div>`;
      }
      syncSelectionUI();
      bodySa.refresh();
      focusRenameInput();
    }

    function focusRenameInput() {
      if (!renamingId) return;
      const inp = stageEl.querySelector("[data-fx-rename-input]");
      if (!inp) return;
      inp.focus({ preventScroll: true });
      const val = inp.value;
      const dot = val.lastIndexOf(".");
      inp.setSelectionRange(0, dot > 0 ? dot : val.length);
    }

    function commitRename(id, nextName) {
      const rec = idx.map.get(String(id));
      renamingId = null;
      const clean = String(nextName || "").trim();
      if (!rec || !clean || clean === rec.node.name) {
        render(false);
        return;
      }
      pushUndo();
      const oldName = rec.node.name;
      rec.node.name = clean;
      rec.node.updated = tt("tree.68");
      render(false);
      emit("rename", { id: rec.id, name: clean, oldName, node: rec.node });
      emit("change", { items: cloneTree(data), action: "rename" });
      showUndoToast(tt("tree.54", { p0: clean }));
    }

    async function ensureLoaded(node) {
      const id = String(node.id);
      if (isFolderNode(node) && (!Array.isArray(node.children) || !node.children.length) && node.hasChildren && typeof opts.loadChildren === "function") {
        if (loadingIds.has(id)) return false;
        loadingIds.add(id);
        render(false);
        try {
          const loaded = await opts.loadChildren(node);
          loadingIds.delete(id);
          node.children = Array.isArray(loaded) ? cloneTree(loaded) : [];
          node.hasChildren = node.children.length > 0;
          idx = buildIndex(data);
          return true;
        } catch {
          loadingIds.delete(id);
          render(false);
          return false;
        }
      }
      return true;
    }

    async function toggleTreeFolder(id) {
      const rec = idx.map.get(String(id));
      if (!rec || !isFolderNode(rec.node)) return;
      if (treeExpanded.has(rec.id)) {
        const rows = [...stageEl.querySelectorAll(".sn-fex-tree-rows .sn-fex-row")];
        const pi = rows.findIndex((el) => el.dataset.fxId === rec.id);
        if (!reduced() && pi >= 0) {
          const parentEl = rows[pi];
          const pDepth = Number(parentEl.dataset.depth || 0);
          const closing = [];
          let i = pi + 1;
          for (; i < rows.length; i++) {
            if (Number(rows[i].dataset.depth || 0) <= pDepth) break;
            closing.push(rows[i]);
          }
          if (closing.length) {
            const beforeIds = new Set(rows.map((el) => el.dataset.fxId));
            const below = rows.slice(i);
            const collapseH = Math.min(closing.length * TREE_ROW_H, (bodyEl.clientHeight || 360) + TREE_ROW_H * 2);
            parentEl.classList.remove("sn-open");
            parentEl.setAttribute("aria-expanded", "false");
            for (const el of closing) {
              const base = treeVirt ? (el.style.transform || "") : "";
              el.animate(
                [{ opacity: 1, transform: base || "none" }, { opacity: 0, transform: base ? `${base} translate3d(0,-10px,0)` : "translate3d(0,-10px,0)" }],
                { duration: 165, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" }
              );
            }
            for (const el of below) {
              const base = treeVirt ? (el.style.transform || "") : "";
              el.animate(
                [{ transform: base || "none" }, { transform: base ? `${base} translate3d(0,${-collapseH}px,0)` : `translate3d(0,${-collapseH}px,0)` }],
                { duration: 175, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" }
              );
            }
            clearTimeout(fxCollapseTimer);
            fxCollapseTimer = setTimeout(() => {
              treeExpanded.delete(rec.id);
              render(false);
              if (!reduced()) {
                let seq = 0;
                for (const el of stageEl.querySelectorAll(".sn-fex-tree-rows .sn-fex-row")) {
                  if (beforeIds.has(el.dataset.fxId)) continue;
                  const base = treeVirt ? (el.style.transform || "") : "";
                  el.animate(
                    [{ opacity: 0, transform: base ? `${base} translate3d(0,16px,0)` : "translate3d(0,16px,0)" }, { opacity: 1, transform: base || "none" }],
                    { duration: 200, delay: Math.min(seq++, 8) * 12, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "backwards" }
                  );
                }
              }
            }, 170);
            return;
          }
        }
        treeExpanded.delete(rec.id);
        render(false);
        return;
      }
      const prevIds = new Set();
      const beforeRects = new Map();
      for (const el of stageEl.querySelectorAll(".sn-fex-tree-rows .sn-fex-row")) {
        prevIds.add(el.dataset.fxId);
        beforeRects.set(el.dataset.fxId, el.getBoundingClientRect().top);
      }
      const ok = await ensureLoaded(rec.node);
      if (ok) {
        treeExpanded.add(rec.id);
        render(false);
        if (!reduced()) {
          let seq = 0;
          for (const el of stageEl.querySelectorAll(".sn-fex-tree-rows .sn-fex-row")) {
            const eid = el.dataset.fxId;
            if (eid === rec.id) {
              el.querySelector(".sn-tr-tw .sn-ic")?.animate([{ rotate: "0deg" }, { rotate: "90deg" }], { duration: 190, easing: "cubic-bezier(.22, 1, .36, 1)" });
              continue;
            }
            if (!prevIds.has(eid)) {
              const delay = Math.min(seq++, 8) * 16;
              const base = treeVirt ? (el.style.transform || "") : "";
              el.animate(
                [{ opacity: 0, transform: base ? `${base} translate3d(0,-12px,0)` : "translate3d(0,-12px,0)" }, { opacity: 1, transform: base || "none" }],
                { duration: 220, delay, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "backwards" }
              );
            } else if (beforeRects.has(eid)) {
              const dy = beforeRects.get(eid) - el.getBoundingClientRect().top;
              if (Math.abs(dy) > 0.5) {
                const base = treeVirt ? (el.style.transform || "") : "";
                el.animate(
                  [{ transform: base ? `${base} translate3d(0,${dy}px,0)` : `translate3d(0,${dy}px,0)` }, { transform: base || "none" }],
                  { duration: 230, easing: "cubic-bezier(.22, 1, .36, 1)" }
                );
              }
            }
          }
        }
      }
    }

    async function openFolder(id) {
      const prevDepth = pathIds.length;
      lastNavAt = performance.now();
      if (!id) {
        pathIds = [];
        selected.clear();
        multiMode = false;
        bodyEl.scrollTop = 0;
        render(prevDepth > 0 ? "out" : true);
        emit("navigate", { path: [], folder: null });
        return;
      }
      idx = buildIndex(data);
      const rec = idx.map.get(String(id));
      if (!rec || !isFolderNode(rec.node)) return;
      await ensureLoaded(rec.node);
      const chain = [];
      let cur = idx.map.get(String(id));
      while (cur) {
        chain.unshift(cur.id);
        cur = cur.parent ? idx.map.get(String(cur.parent.id)) : null;
      }
      pathIds = chain;
      selected.clear();
      multiMode = false;
      bodyEl.scrollTop = 0;
      render(chain.length < prevDepth ? "out" : "in");
      emit("navigate", { path: [...pathIds], folder: rec.node });
    }

    function goUp() {
      if (!pathIds.length) return;
      lastNavAt = performance.now();
      pathIds = pathIds.slice(0, -1);
      selected.clear();
      multiMode = false;
      bodyEl.scrollTop = 0;
      render("out");
      const { folder } = resolveFolder();
      emit("navigate", { path: [...pathIds], folder });
    }

    function setView(nextView, animate = true) {
      if (!["card", "list", "tree"].includes(nextView) || nextView === view) return;
      view = nextView;
      segCtl?.go(viewIndex(view), false, true);
      bodyEl.scrollTop = 0;
      render(animate);
      emit("viewChange", { view });
    }

    function uniqueName(list, base) {
      const names = new Set((list || []).map((x) => x.name));
      if (!names.has(base)) return base;
      const dot = base.lastIndexOf(".");
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot) : "";
      for (let i = 2; i < 999; i++) {
        const cand = `${stem} ${i}${ext}`;
        if (!names.has(cand)) return cand;
      }
      return `${stem}-${Date.now()}${ext}`;
    }

    function createItem(kind = "folder", parentId = null, startRename = true) {
      idx = buildIndex(data);
      let targetList = null;
      if (parentId === "") {
        targetList = data;
      } else if (parentId != null) {
        const rec = idx.map.get(String(parentId));
        if (rec && isFolderNode(rec.node)) {
          if (!Array.isArray(rec.node.children)) rec.node.children = [];
          targetList = rec.node.children;
          treeExpanded.add(rec.id);
        }
      }
      if (!targetList) {
        const { list } = resolveFolder();
        targetList = list;
      }
      const beforeRects = captureRects();
      pushUndo();
      const defaults = {
        folder: { name: tt("tree.60"), kind: "folder", children: [], updated: tt("tree.68") },
        txt: { name: tt("tree.61"), kind: "txt", size: "1.8 KB", updated: tt("tree.68") },
        ppt: { name: tt("tree.76"), kind: "ppt", size: "6.2 MB", pages: 12, updated: tt("tree.68") },
        vue: { name: tt("tree.62"), kind: "vue", size: "3.4 KB", updated: tt("tree.68") },
        doc: { name: tt("tree.61"), kind: "txt", size: "1.8 KB", updated: tt("tree.68") },
      };
      const tpl = defaults[kind] || { name: tt("tree.61"), kind, size: "1.8 KB", updated: tt("tree.68") };
      const node = { ...tpl, id: nextUid("fxn"), name: uniqueName(targetList, tpl.name) };
      targetList.unshift(node);
      idx = buildIndex(data);
      selected.clear();
      multiMode = false;
      renamingId = startRename ? node.id : null;
      markFresh([node.id]);
      render(false);
      playFlip(beforeRects);
      emit("create", { node, parentId: parentId ?? (pathIds.at(-1) || null) });
      emit("change", { items: cloneTree(data), action: "create" });
      showUndoToast(tt("tree.55", { p0: node.name }));
      return node;
    }

    function setFolderColor(ids, color) {
      idx = buildIndex(data);
      const list = (Array.isArray(ids) ? ids : [ids]).map(String);
      const recs = list.map((id) => idx.map.get(id)).filter((r) => r && isFolderNode(r.node));
      if (!recs.length) return false;
      const clean = color && color !== "default" ? String(color).trim() : "";
      if (clean && !resolveFolderColor(clean)) return false;
      pushUndo();
      for (const r of recs) {
        if (clean) r.node.color = clean;
        else delete r.node.color;
      }
      render(false);
      emit("colorChange", { ids: recs.map((r) => r.id), color: clean || "default" });
      emit("change", { items: cloneTree(data), action: "color" });
      showUndoToast(tt("tree.92"));
      return true;
    }

    function duplicateItems(ids) {
      idx = buildIndex(data);
      const recs = ids.map((id) => idx.map.get(String(id))).filter(Boolean);
      if (!recs.length) return;
      const beforeRects = captureRects();
      pushUndo();
      const created = [];
      const cloneWithNewIds = (n) => {
        const copy = { ...n, id: nextUid("fxn") };
        if (Array.isArray(n.children)) copy.children = n.children.map(cloneWithNewIds);
        return copy;
      };
      for (const r of recs) {
        const dup = cloneWithNewIds(r.node);
        const dot = r.node.name.lastIndexOf(".");
        const base = dot > 0 && !isFolderNode(r.node)
          ? `${r.node.name.slice(0, dot)} ${tt("tree.63")}${r.node.name.slice(dot)}`
          : `${r.node.name} ${tt("tree.63")}`;
        dup.name = uniqueName(r.list, base);
        dup.updated = tt("tree.68");
        r.list.splice(r.index + 1, 0, dup);
        created.push(dup);
      }
      idx = buildIndex(data);
      selected.clear();
      multiMode = false;
      markFresh(created.map((n) => n.id));
      render(false);
      playFlip(beforeRects);
      emit("change", { items: cloneTree(data), action: "duplicate" });
      showUndoToast(tt("tree.56", { p0: created[0].name }));
    }

    function deleteItems(ids, immediate = false) {
      if (deleting) return false;
      idx = buildIndex(data);
      const idSet = new Set(ids.map(String));
      const rootsToRemove = [...idSet].filter((id) => {
        let cur = idx.map.get(id);
        while (cur?.parent) {
          if (idSet.has(String(cur.parent.id))) return false;
          cur = idx.map.get(String(cur.parent.id));
        }
        return idx.map.has(id);
      });
      if (!rootsToRemove.length) return false;

      const commitDelete = () => {
        deleting = false;
        const beforeRects = captureRects();
        pushUndo();
        const removed = [];
        for (const id of rootsToRemove) {
          idx = buildIndex(data);
          const r = idx.map.get(id);
          if (!r) continue;
          const [item] = r.list.splice(r.index, 1);
          removed.push(item);
          selected.delete(id);
        }
        if (selected.size === 0) multiMode = false;
        idx = buildIndex(data);
        render(false);
        playFlip(beforeRects);
        emit("delete", { ids: rootsToRemove, nodes: removed });
        emit("change", { items: cloneTree(data), action: "delete" });
        showUndoToast(removed.length > 1 ? tt("tree.52", { p0: removed.length }) : tt("tree.53", { p0: removed[0].name }));
      };

      const visibleTargets = rootsToRemove
        .map((id) => stageEl.querySelector(`[data-fx-id="${CSS.escape(id)}"]`))
        .filter(Boolean);
      if (immediate || reduced() || !visibleTargets.length) {
        commitDelete();
        return true;
      }
      deleting = true;
      for (const el of visibleTargets) el.classList.add("sn-fex-removing");
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(commitDelete, 175);
      return true;
    }

    function moveItems(ids, targetFolderId, immediate = false) {
      idx = buildIndex(data);
      const targetId = targetFolderId ? String(targetFolderId) : "";
      const targetRec = targetId ? idx.map.get(targetId) : null;
      if (targetId && (!targetRec || !isFolderNode(targetRec.node))) return false;

      const idSet = new Set(ids.map(String));
      const cleanIds = [...idSet].filter((id) => {
        if (!idx.map.has(id)) return false;
        if (targetId && (id === targetId || isDescendant(idx.map, id, targetId))) return false;
        let cur = idx.map.get(id);
        while (cur?.parent) {
          if (idSet.has(String(cur.parent.id))) return false;
          cur = idx.map.get(String(cur.parent.id));
        }
        return true;
      });

      if (!cleanIds.length) {
        if (targetId && [...idSet].some((id) => id === targetId || isDescendant(idx.map, id, targetId))) {
          toast({ text: tt("tree.58"), icon: "circle-alert", tone: "danger" });
        }
        return false;
      }

      const effectiveIds = cleanIds.filter((id) => {
        const rec = idx.map.get(id);
        const curParentId = rec?.parent ? String(rec.parent.id) : "";
        return curParentId !== targetId;
      });
      if (!effectiveIds.length) return false;

      const commitMove = () => {
        const beforeRects = captureRects();
        pushUndo();
        const movedNodes = [];
        for (const id of effectiveIds) {
          idx = buildIndex(data);
          const rec = idx.map.get(id);
          if (!rec) continue;
          const [item] = rec.list.splice(rec.index, 1);
          movedNodes.push(item);
        }

        idx = buildIndex(data);
        const destList = targetId
          ? (() => {
              const tr = idx.map.get(targetId);
              if (!Array.isArray(tr.node.children)) tr.node.children = [];
              return tr.node.children;
            })()
          : data;

        for (let i = movedNodes.length - 1; i >= 0; i--) destList.unshift(movedNodes[i]);

        selected.clear();
        multiMode = false;
        if (targetId) {
          droppedFolderId = targetId;
          droppedFreshIds = new Set(movedNodes.map((n) => String(n.id)));
          clearTimeout(droppedTimer);
          droppedTimer = setTimeout(() => {
            droppedFolderId = null;
            droppedFreshIds = new Set();
            stageEl.querySelectorAll(".sn-fdr-dropped, .sn-fdr-dropped-menu").forEach((el) => {
              el.classList.remove("sn-fdr-dropped", "sn-fdr-dropped-menu");
            });
          }, 580);
        }

        idx = buildIndex(data);
        // 卡片视图原地差量更新：保留目标 .sn-fdr 与 .sn-fdr-front 原 DOM 实例（前盖从 -28deg 无缝平滑合拢到 0deg，零重建断帧），
        // 仅更新夹层微缩纸叠与计数角标，并移除已移走的卡片做平滑 FLIP 补位
        const targetTileEl = view === "card" && targetId && !query.trim()
          ? stageEl.querySelector(`.sn-fex-tile[data-fx-id="${CSS.escape(targetId)}"]`)
          : null;
        const targetNodeRec = targetId ? idx.map.get(targetId) : null;
        if (targetTileEl && targetNodeRec) {
          for (const id of effectiveIds) {
            stageEl.querySelector(`.sn-fex-tile[data-fx-id="${CSS.escape(id)}"]`)?.remove();
          }
          const fdrEl = targetTileEl.querySelector(".sn-fdr");
          const newChildren = Array.isArray(targetNodeRec.node.children) ? targetNodeRec.node.children : [];
          const newCnt = newChildren.length;
          if (fdrEl) {
            fdrEl.dataset.count = String(newCnt);
            const sheetsEl = fdrEl.querySelector(".sn-fdr-sheets");
            if (sheetsEl) {
              const previewItems = newChildren.slice(0, 3).reverse();
              let freshSeq = 0;
              sheetsEl.dataset.n = String(previewItems.length);
              sheetsEl.innerHTML = previewItems
                .map((c, i) => {
                  const isNew = !!droppedFreshIds?.has(String(c.id));
                  return renderMiniSheet(c, i, isNew, isNew ? freshSeq++ : 0);
                })
                .join("");
            }
            const frontEl = fdrEl.querySelector(".sn-fdr-front");
            if (frontEl) {
              let cntEl = frontEl.querySelector(".sn-fdr-cnt");
              if (newCnt > 0) {
                if (!cntEl) {
                  cntEl = document.createElement("span");
                  cntEl.className = "sn-fdr-cnt";
                  frontEl.append(cntEl);
                }
                cntEl.textContent = String(newCnt);
                cntEl.classList.remove("sn-fdr-cnt-bump");
                void cntEl.offsetWidth;
                cntEl.classList.add("sn-fdr-cnt-bump");
              } else if (cntEl) {
                cntEl.remove();
              }
            }
          }
          const subEl = targetTileEl.querySelector(".sn-fex-sub");
          if (subEl) subEl.textContent = newCnt > 0 ? tt("tree.35", { p0: newCnt }) : tt("tree.36");
          targetTileEl.classList.remove("sn-fdr-dropped", "sn-fdr-dropped-menu");
          void targetTileEl.offsetWidth;
          targetTileEl.classList.add("sn-fdr-dropped");
          if (!immediate) targetTileEl.classList.add("sn-fdr-dropped-menu");
          const { list: curVisList } = resolveFolder();
          lastVisibleCount = sortedItems(curVisList).length;
          syncSelectionUI();
          bodySa.refresh();
          playFlip(beforeRects, targetId);
        } else {
          render(false);
          playFlip(beforeRects, targetId || null);
        }

        const targetName = targetId ? idx.map.get(targetId)?.node?.name || "" : rootTitle();
        emit("move", { ids: effectiveIds, nodes: movedNodes, targetId: targetId || null });
        emit("change", { items: cloneTree(data), action: "move" });
        showUndoToast(
          movedNodes.length > 1
            ? tt("tree.50", { p0: movedNodes.length, p1: targetName })
            : tt("tree.51", { p0: movedNodes[0].name, p1: targetName })
        );
      };

      // 通过右键菜单或批量胶囊触发移动时：当前视口中待移出的卡片/行先朝目标文件夹柔和缩小飞离消失，再触发文件夹入纸合盖与周边 FLIP 补位
      const visibleMoving = effectiveIds
        .map((id) => stageEl.querySelector(`[data-fx-id="${CSS.escape(id)}"]`))
        .filter((el) => el && !el.hidden);
      if (immediate || reduced() || !visibleMoving.length) {
        commitMove();
        return true;
      }
      const targetEl = targetId ? stageEl.querySelector(`[data-fx-id="${CSS.escape(targetId)}"]`) : null;
      const tr = targetEl ? targetEl.getBoundingClientRect() : null;
      if (targetEl) targetEl.classList.add("sn-drop-target");
      for (const el of visibleMoving) {
        if (tr) {
          const er = el.getBoundingClientRect();
          const vx = (tr.left + tr.width / 2 - (er.left + er.width / 2)) * 0.52;
          const vy = (tr.top + tr.height / 2 - (er.top + er.height / 2)) * 0.52;
          el.style.setProperty("--sn-vx", `${Math.round(vx)}px`);
          el.style.setProperty("--sn-vy", `${Math.round(vy)}px`);
        }
        el.classList.add("sn-fex-vanish");
      }
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        if (targetEl) targetEl.classList.remove("sn-drop-target");
        commitMove();
      }, 185);
      return true;
    }

    function listTargetFolders(excludeIds) {
      const out = [{ id: "", name: rootTitle(), depth: 0 }];
      const walk = (list, depth) => {
        for (const n of list) {
          if (!isFolderNode(n)) continue;
          const id = String(n.id);
          const blocked = excludeIds.some((eid) => eid === id || isDescendant(idx.map, eid, id));
          if (!blocked) {
            out.push({ id, name: n.name, depth });
            if (Array.isArray(n.children)) walk(n.children, depth + 1);
          }
        }
      };
      walk(data, 1);
      return out;
    }

    // 复用 Satin openMenu（减少多余分隔线，文件夹右键内置实时色卡选择器）
    function openMovePickerMenu(ids, anchorEl) {
      idx = buildIndex(data);
      const folders = listTargetFolders(ids);
      mainMenu.innerHTML = folders.map((f) =>
        `<div class="sn-item" role="menuitem" data-act="move" data-target="${esc(f.id)}" style="padding-left:${8 + Math.min(f.depth, 4) * 12}px">${icon("folder", 14)}<span data-tip-full>${esc(f.name)}</span></div>`
      ).join("");
      openMenu(mainMenu, {
        anchor: anchorEl,
        trigger: anchorEl,
        align: "center",
        bound: root,
        surface: opts.menuSurface || "blur",
        onSelect: ({ item }) => {
          if (item.dataset.act === "move") moveItems(ids, item.dataset.target || "");
        },
      });
    }

    function clearCtxMark() {
      ctxTargetId = null;
      stageEl.querySelectorAll(".sn-ctx-open").forEach((el) => el.classList.remove("sn-ctx-open"));
    }

    function openContextMenu(targetId, coords, anchorEl) {
      idx = buildIndex(data);
      clearCtxMark();
      if (targetId) {
        const rec = idx.map.get(String(targetId));
        if (!rec) return;
        ctxTargetId = rec.id;
        stageEl.querySelector(`[data-fx-id="${CSS.escape(rec.id)}"]`)?.classList.add("sn-ctx-open");
        const fdr = isFolderNode(rec.node);
        const ids = selected.has(rec.id) ? [...selected] : [rec.id];
        const folderIds = ids.filter((id) => { const r = idx.map.get(id); return r && isFolderNode(r.node); });
        const folders = listTargetFolders(ids);
        subMoveMenu.innerHTML = folders.map((f) =>
          `<div class="sn-item" role="menuitem" data-act="move" data-target="${esc(f.id)}" style="padding-left:${8 + Math.min(f.depth, 4) * 12}px">${icon("folder", 14)}<span data-tip-full>${esc(f.name)}</span></div>`
        ).join("");
        let colorRowHtml = "";
        if (folderIds.length > 0 && folderIds.length === ids.length) {
          const curRaw = rec.node.color || "default";
          const curHex = resolveFolderColor(curRaw) || "#5b8ec9";
          const swHtml = FOLDER_COLOR_PRESETS.map((p) => {
            const on = (p.id === "default" && !rec.node.color) || curRaw === p.id || (p.hex && curRaw.toLowerCase() === p.hex);
            return `<button type="button" class="sn-fex-sw${on ? " sn-on" : ""}" data-fx-color="${esc(p.id)}" style="--sn-sw:${esc(p.swatch)}" title="${esc(tt(p.labelKey))}" aria-label="${esc(tt(p.labelKey))}"></button>`;
          }).join("")
            + `<label class="sn-fex-sw sn-fex-sw-custom" title="${esc(tt("tree.91"))}" aria-label="${esc(tt("tree.91"))}"><input type="color" data-fx-color-pick value="${esc(curHex.startsWith("#") ? curHex : "#5b8ec9")}"></label>`;
          colorRowHtml = `<div class="sn-fex-color-row" role="group" aria-label="${esc(tt("tree.84"))}"><div class="sn-fex-swatches">${swHtml}</div></div>`;
        }
        mainMenu.innerHTML =
          `<div class="sn-item" role="menuitem" data-act="open">${icon(fdr ? "folder-open" : "external-link", 15)}${esc(fdr ? tt("tree.40") : tt("tree.39"))}</div>`
          + (ids.length === 1 ? `<div class="sn-item" role="menuitem" data-act="rename">${icon("pencil", 15)}${esc(tt("tree.41"))}<span class="sn-key">F2</span></div>` : "")
          + `<div class="sn-item" role="menuitem" data-act="dup">${icon("copy", 15)}${esc(tt("tree.42"))}</div>`
          + `<div class="sn-item" role="menuitem" data-sub="${esc(subMoveMenu.id)}" aria-haspopup="menu" aria-expanded="false">${icon("folder", 15)}${esc(tt("tree.43"))}${icon("chevron-right", 14).replace('class="sn-ic"', 'class="sn-ic sn-more"')}</div>`
          + colorRowHtml
          + `<div class="sn-item sn-danger-item" role="menuitem" data-act="del">${icon("trash-2", 15)}${esc(tt("tree.44"))}<span class="sn-key">⌫</span></div>`;
        mainMenu.querySelectorAll("[data-fx-color]").forEach((btn) => {
          btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            closeMenu(false);
            setFolderColor(folderIds, btn.dataset.fxColor);
          });
        });
        const picker = mainMenu.querySelector("[data-fx-color-pick]");
        if (picker) {
          picker.addEventListener("click", (ev) => ev.stopPropagation());
          picker.addEventListener("change", (ev) => {
            ev.stopPropagation();
            closeMenu(false);
            setFolderColor(folderIds, picker.value);
          });
        }
        openMenu(mainMenu, {
          ...(anchorEl ? { anchor: anchorEl, trigger: anchorEl, align: "end" } : { x: coords.x, y: coords.y, trigger: root }),
          bound: root,
          surface: opts.menuSurface || "blur",
          onClose: clearCtxMark,
          onSelect: ({ item }) => {
            const act = item.dataset.act;
            if (act === "open") {
              if (fdr) openFolder(rec.id);
              else { emit("open", { id: rec.id, node: rec.node }); toast({ text: tt("tree.64", { p0: rec.node.name }), icon: KIND_ICON[kindOf(rec.node)] || "file" }); }
            } else if (act === "rename") {
              renamingId = rec.id;
              render(false);
            } else if (act === "dup") {
              duplicateItems(ids);
            } else if (act === "move") {
              moveItems(ids, item.dataset.target || "");
            } else if (act === "del") {
              deleteItems(ids);
            }
          },
        });
      } else {
        subViewMenu.innerHTML = [
          ["card", "layout-grid", tt("tree.20")],
          ["list", "list", tt("tree.21")],
          ["tree", "git-branch", tt("tree.22")],
        ].map(([v, ic, lbl]) =>
          `<div class="sn-item${view === v ? " sn-sel" : ""}" role="menuitem" data-act="view" data-v="${v}">${icon(ic, 14)}${esc(lbl)}<span class="sn-chk">${icon("check", 14)}</span></div>`
        ).join("");
        mainMenu.innerHTML =
          `<div class="sn-item" role="menuitem" data-act="new-folder">${icon("folder", 15)}${esc(tt("tree.45"))}</div>`
          + `<div class="sn-item" role="menuitem" data-act="new-txt">${icon("file-text", 15)}${esc(tt("tree.46"))}</div>`
          + `<div class="sn-item" role="menuitem" data-act="new-ppt">${icon("layers", 15)}${esc(tt("tree.75"))}</div>`
          + `<div class="sn-item" role="menuitem" data-act="new-vue">${icon("code-xml", 15)}${esc(tt("tree.47"))}</div>`
          + (anchorEl ? "" : `<div class="sn-item" role="menuitem" data-sub="${esc(subViewMenu.id)}" aria-haspopup="menu" aria-expanded="false">${icon("layers", 15)}${esc(tt("tree.65"))}${icon("chevron-right", 14).replace('class="sn-ic"', 'class="sn-ic sn-more"')}</div>`
            + `<div class="sn-item" role="menuitem" data-act="refresh">${icon("refresh-cw", 15)}${esc(tt("tree.48"))}</div>`);
        openMenu(mainMenu, {
          ...(anchorEl ? { anchor: anchorEl, trigger: anchorEl, align: "end" } : { x: coords.x, y: coords.y, trigger: root }),
          bound: root,
          surface: opts.menuSurface || "blur",
          onSelect: ({ item }) => {
            const act = item.dataset.act;
            if (act === "new-folder") createItem("folder");
            else if (act === "new-txt") createItem("txt");
            else if (act === "new-ppt") createItem("ppt");
            else if (act === "new-vue") createItem("vue");
            else if (act === "view" && item.dataset.v) setView(item.dataset.v, true);
            else if (act === "refresh") { render(true); toast({ text: tt("tree.66"), icon: "refresh-cw" }); }
          },
        });
      }
    }

    // 实体 60fps 物理拖拽 + 10 场景完备橡胶框选引擎：
    // 1. 卡片视图完全通透无白壳，直接拎起真实缩略图/拟物文件夹本体（共享 --sn-fex-* 全色板），随横向移动速度自然轻摆，停手即回正；
    // 2. 原位干净无框空槽，多选拖拽其余项先从流中收拢并在主缩略图后真实叠牌；
    // 3. 差量维护落点高亮 + 8px 施密特迟滞，彻底根治文件夹悬停/放入抖动；悬停面包屑时侧移微缩不挡字；
    // 4. 橡胶框选：卡片四周空白边距/缝隙/底部空白/列表右侧空白均可拉起，支持四向任意拉框、内容坐标系精准碰撞、边缘自动滚动、虚拟树全量框选、单选即入勾选态、Cmd/Shift 累加、Esc 恢复原选择与 blur 防幽灵框；
    let drag = null;
    let proxyEl = null;
    let dragRaf = 0;
    let tiltRaf = 0;
    let activeDropEl = null;
    let activeDropCls = "";
    let marquee = null;
    let marqueeEl = null;
    let marqueeRaf = 0;
    let marqueeScrollRaf = 0;

    function setActiveDrop(el, cls) {
      if (activeDropEl === el && activeDropCls === cls) return;
      if (activeDropEl && activeDropCls) activeDropEl.classList.remove(activeDropCls);
      activeDropEl = el || null;
      activeDropCls = cls || "";
      if (activeDropEl && activeDropCls) activeDropEl.classList.add(activeDropCls);
    }

    function clearDropTargets() {
      setActiveDrop(null, "");
      root.querySelectorAll(".sn-drop-target, .sn-crumb-drop, .sn-fex-slot").forEach((el) => {
        el.classList.remove("sn-drop-target", "sn-crumb-drop", "sn-fex-slot");
      });
    }

    function restoreHiddenExtras(cur, insertAfterLead = false) {
      if (!cur || !cur.extraEls || !cur.extraEls.length) return;
      const beforeRects = captureRects();
      const parent = cur.leadEl?.parentElement;
      if (insertAfterLead && parent) {
        let anchor = cur.leadEl.nextSibling;
        for (const el of cur.extraEls) {
          el.hidden = false;
          parent.insertBefore(el, anchor);
        }
      } else {
        for (const entry of cur.extraOrigin || []) {
          entry.el.hidden = false;
          if (entry.parent && entry.parent.isConnected) {
            if (entry.next && entry.next.parentElement === entry.parent) entry.parent.insertBefore(entry.el, entry.next);
            else entry.parent.append(entry.el);
          }
        }
      }
      playFlip(beforeRects);
    }

    function endDrag(flyToEl = null, absorbTargetEl = null, onAbsorbDone = null) {
      cancelAnimationFrame(dragRaf);
      cancelAnimationFrame(tiltRaf);
      dragRaf = 0;
      tiltRaf = 0;
      const pEl = proxyEl;
      proxyEl = null;
      const cur = drag;
      drag = null;

      if (pEl && absorbTargetEl && !reduced() && absorbTargetEl.isConnected) {
        // 零跳动双层精准射线吸入：
        // 1. 先在任何类名变更前捕获当前实时计算矩阵 startTransform、透明度与缩略图屏幕几何中心；
        // 2. 立即挂上 .sn-proxy-absorbing 禁用一切 CSS transition/animation，锁定起点不暴涨、不卡帧；
        // 3. inner 已在起手时将 transform-origin 精准锁在缩略图布局中心，右乘 scale(0.42) 严格绕缩略图自身中心纯缩小（卡片/文件夹/面包屑全场景 0 漂移），
        //    外层 pEl 使用浮点精确位移直线送进文件夹开口，彻底杜绝松手瞬跳！
        const visualTarget = absorbTargetEl.querySelector(".sn-fdr, .sn-fex-row-ico") || absorbTargetEl;
        const tr = visualTarget.getBoundingClientRect();
        const pVis = pEl.querySelector(".sn-fcard, .sn-fdr") || pEl;
        const vr = pVis.getBoundingClientRect();
        const inner = pEl.querySelector(".sn-fex-proxy-inner");
        const startTransform = inner ? getComputedStyle(inner).transform : "none";
        const startOpacity = inner ? (parseFloat(getComputedStyle(inner).opacity) || 0.92) : 0.92;
        if (inner && typeof inner.getAnimations === "function") {
          for (const a of inner.getAnimations()) a.cancel();
        }
        const targetCx = tr.left + tr.width / 2;
        const targetCy = tr.top + tr.height * 0.42;
        const dx = targetCx - (vr.left + vr.width / 2);
        const dy = targetCy - (vr.top + vr.height / 2);
        const pr = pEl.getBoundingClientRect();
        const fromX = pr.left;
        const fromY = pr.top;
        pEl.classList.add("sn-proxy-absorbing");
        if (inner) {
          const baseT = startTransform && startTransform !== "none" ? startTransform : "scale(1)";
          const endT = `${baseT} scale(0.42)`;
          inner.style.transform = baseT;
          inner.style.opacity = String(startOpacity);
          inner.animate(
            [
              { transform: baseT, opacity: startOpacity },
              { transform: endT, opacity: 0 },
            ],
            { duration: 155, easing: "cubic-bezier(.32, 0, .67, 0)", fill: "forwards" }
          );
        }
        const anim = pEl.animate(
          [
            { transform: `translate3d(${fromX}px,${fromY}px,0)` },
            { transform: `translate3d(${fromX + dx}px,${fromY + dy}px,0)` },
          ],
          { duration: 155, easing: "cubic-bezier(.32, 0, .67, 0)", fill: "forwards" }
        );
        anim.onfinish = () => {
          pEl.remove();
          root.classList.remove("sn-is-dragging");
          // 先同帧触发原地更新（挂上 .sn-fdr-dropped），再移除 .sn-drop-target 让前盖从 -28deg 丝滑无缝合拢到 0deg
          onAbsorbDone?.();
          clearDropTargets();
        };
        return;
      }

      if (pEl && flyToEl && !reduced() && flyToEl.isConnected) {
        const to = flyToEl.getBoundingClientRect();
        const pr = pEl.getBoundingClientRect();
        const fromX = pr.left;
        const fromY = pr.top;
        const inner = pEl.querySelector(".sn-fex-proxy-inner");
        const startTransform = inner ? getComputedStyle(inner).transform : "none";
        if (inner && typeof inner.getAnimations === "function") {
          for (const a of inner.getAnimations()) a.cancel();
        }
        pEl.classList.remove("sn-proxy-tilting", "sn-proxy-aim", "sn-proxy-crumb-aim");
        pEl.classList.add("sn-proxy-settling", "sn-proxy-absorbing");
        if (inner) {
          inner.style.setProperty("--sn-drag-tilt", "0deg");
          inner.style.setProperty("--sn-drag-scale", "1");
          inner.animate(
            [
              { transform: startTransform && startTransform !== "none" ? startTransform : "scale(1)" },
              { transform: "scale(1) rotate(0deg)" },
            ],
            { duration: 190, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "forwards" }
          );
        }
        const anim = pEl.animate(
          [
            { transform: `translate3d(${fromX}px,${fromY}px,0)` },
            { transform: `translate3d(${to.left}px,${to.top}px,0)` },
          ],
          { duration: 190, easing: "cubic-bezier(.22, 1, .36, 1)" }
        );
        const slotEl = flyToEl;
        anim.onfinish = () => {
          pEl.remove();
          root.classList.remove("sn-is-dragging");
          slotEl.classList.remove("sn-fex-slot");
        };
        setActiveDrop(null, "");
        return;
      }

      root.classList.remove("sn-is-dragging");
      if (pEl) pEl.remove();
      if (cur && cur.extraEls?.length && !onAbsorbDone) restoreHiddenExtras(cur, false);
      clearDropTargets();
      if (onAbsorbDone) onAbsorbDone();
    }

    function endMarquee(restoreBase = false) {
      cancelAnimationFrame(marqueeRaf);
      cancelAnimationFrame(marqueeScrollRaf);
      marqueeRaf = 0;
      marqueeScrollRaf = 0;
      root.classList.remove("sn-is-marquee");
      if (restoreBase && marquee) {
        selected.clear();
        marquee.base.forEach((id) => selected.add(id));
        syncSelectionUI();
      }
      if (marqueeEl) {
        const el = marqueeEl;
        marqueeEl = null;
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 130);
      }
      marquee = null;
    }

    function updateMarqueeSelection() {
      if (!marquee || !marquee.active || !marqueeEl) return;
      const sr = stageEl.getBoundingClientRect();
      const maxW = Math.max(stageEl.clientWidth, bodyEl.clientWidth);
      const maxH = Math.max(stageEl.scrollHeight, bodyEl.clientHeight);
      const cx = Math.max(0, Math.min(maxW, marquee.x - sr.left));
      const cy = Math.max(0, Math.min(maxH, marquee.y - sr.top));
      const l = Math.min(marquee.ox, cx);
      const t = Math.min(marquee.oy, cy);
      const r = Math.max(marquee.ox, cx);
      const b = Math.max(marquee.oy, cy);
      marqueeEl.style.transform = `translate3d(${Math.round(l)}px,${Math.round(t)}px,0)`;
      marqueeEl.style.width = Math.max(1, Math.round(r - l)) + "px";
      marqueeEl.style.height = Math.max(1, Math.round(b - t)) + "px";

      const hits = new Set();
      if (view === "tree" && treeVirt) {
        // 虚拟树全量内容坐标系精准框选（包括滚出可视窗外的行）
        const hdrH = stageEl.querySelector(".sn-fex-tbl-hd")?.offsetHeight || 32;
        for (let i = 0; i < treeFlat.length; i++) {
          const rowTop = hdrH + i * TREE_ROW_H;
          const rowBot = rowTop + TREE_ROW_H;
          if (rowBot >= t && rowTop <= b && r >= 6 && l <= maxW - 6) hits.add(treeFlat[i].id);
        }
      } else {
        for (const el of stageEl.querySelectorAll("[data-fx-id]")) {
          if (el.hidden) continue;
          let il, it, ir, ib;
          if (view === "card") {
            // 卡片视图以真实视觉主体（缩略图/文件夹 + 真实文件名文字）并集为碰撞盒，选框碰到实体才亮起勾选，零虚空误选
            const vis = el.querySelector(".sn-fdr, .sn-fcard");
            const meta = el.querySelector(".sn-fex-name");
            if (vis && meta) {
              const vr = vis.getBoundingClientRect();
              const mr = meta.getBoundingClientRect();
              il = Math.min(vr.left, mr.left) - sr.left;
              it = Math.min(vr.top, mr.top) - sr.top;
              ir = Math.max(vr.right, mr.right) - sr.left;
              ib = Math.max(vr.bottom, mr.bottom) - sr.top;
            } else {
              const er = el.getBoundingClientRect();
              il = er.left - sr.left; it = er.top - sr.top; ir = er.right - sr.left; ib = er.bottom - sr.top;
            }
          } else {
            const er = el.getBoundingClientRect();
            il = er.left - sr.left; it = er.top - sr.top; ir = er.right - sr.left; ib = er.bottom - sr.top;
          }
          if (ir >= l && il <= r && ib >= t && it <= b) hits.add(el.dataset.fxId);
        }
      }

      const next = new Set();
      if (marquee.toggle) {
        marquee.base.forEach((id) => next.add(id));
        for (const id of hits) {
          if (marquee.base.has(id)) next.delete(id);
          else next.add(id);
        }
      } else if (marquee.additive) {
        marquee.base.forEach((id) => next.add(id));
        hits.forEach((id) => next.add(id));
      } else {
        hits.forEach((id) => next.add(id));
      }

      let changed = next.size !== selected.size;
      if (!changed) for (const id of next) if (!selected.has(id)) { changed = true; break; }
      if (changed) {
        selected.clear();
        next.forEach((id) => selected.add(id));
        syncSelectionUI();
      }
    }

    function runMarqueeAutoScroll() {
      marqueeScrollRaf = 0;
      if (!marquee || !marquee.active) return;
      const br = bodyEl.getBoundingClientRect();
      const edge = 32;
      let delta = 0;
      if (marquee.y < br.top + edge && bodyEl.scrollTop > 0) {
        delta = -Math.max(4, Math.min(18, Math.round((br.top + edge - marquee.y) * 0.35)));
      } else if (marquee.y > br.bottom - edge && bodyEl.scrollTop + bodyEl.clientHeight < bodyEl.scrollHeight) {
        delta = Math.max(4, Math.min(18, Math.round((marquee.y - (br.bottom - edge)) * 0.35)));
      }
      if (delta !== 0) {
        bodyEl.scrollTop = Math.max(0, Math.min(bodyEl.scrollHeight - bodyEl.clientHeight, bodyEl.scrollTop + delta));
        if (view === "tree" && treeVirt) paintTreeWindow(false);
        updateMarqueeSelection();
        marqueeScrollRaf = requestAnimationFrame(runMarqueeAutoScroll);
      }
    }

    function canDropInto(dragIds, targetFolderId) {
      if (!targetFolderId) return true;
      return !dragIds.some((id) => id === targetFolderId || isDescendant(idx.map, id, targetFolderId));
    }

    function measureStaticSlots(container) {
      if (!container) return [];
      const sr = stageEl.getBoundingClientRect();
      const children = [...container.querySelectorAll(":scope > [data-fx-id]")].filter((el) => !el.hidden);
      return children.map((el) => {
        const anims = typeof el.getAnimations === "function" ? el.getAnimations() : [];
        const saved = [];
        for (const a of anims) {
          if (a.playState === "running") { saved.push(a); a.pause(); }
        }
        const r = el.getBoundingClientRect();
        let left = 0, top = 0, node = el;
        while (node && node !== stageEl) {
          left += node.offsetLeft;
          top += node.offsetTop;
          node = node.offsetParent;
        }
        const w = el.offsetWidth || r.width;
        const h = el.offsetHeight || r.height;
        for (const a of saved) a.play();
        return { left, top, right: left + w, bottom: top + h, width: w, height: h, cx: left + w / 2, cy: top + h / 2, srLeft: sr.left, srTop: sr.top };
      });
    }

    function playInterruptibleFlip(beforeVisualRects, skipEl) {
      if (!beforeVisualRects || !beforeVisualRects.size || reduced() || (view === "tree" && treeVirt)) return;
      const sr = stageEl.getBoundingClientRect();
      for (const el of stageEl.querySelectorAll("[data-fx-id]")) {
        if (el === skipEl || el.hidden) continue;
        const old = beforeVisualRects.get(el.dataset.fxId);
        if (!old) continue;
        if (typeof el.getAnimations === "function") {
          for (const a of el.getAnimations()) a.cancel();
        }
        const cur = el.getBoundingClientRect();
        const dx = old.left - (cur.left - sr.left), dy = old.top - (cur.top - sr.top);
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.animate(
            [{ transform: `translate3d(${dx}px,${dy}px,0)` }, { transform: "none" }],
            { duration: 220, easing: "cubic-bezier(.22, 1, .36, 1)" }
          );
        }
      }
    }

    function reorderCurrentListByDom() {
      const container = stageEl.querySelector(".sn-fex-grid, .sn-fex-list-rows");
      if (!container) return false;
      const domOrder = [...container.querySelectorAll(":scope > [data-fx-id]")].map((el) => el.dataset.fxId);
      if (!domOrder.length) return false;
      const { list } = resolveFolder();
      const byId = new Map(list.map((n) => [String(n.id), n]));
      const next = [];
      const seen = new Set();
      for (const id of domOrder) {
        const n = byId.get(id);
        if (n && !seen.has(id)) { next.push(n); seen.add(id); }
      }
      for (const n of list) {
        const id = String(n.id);
        if (!seen.has(id)) { next.push(n); seen.add(id); }
      }
      let changed = next.length === list.length && next.some((n, i) => n !== list[i]);
      if (!changed) return false;
      pushUndo();
      list.splice(0, list.length, ...next);
      sortKey = "manual";
      idx = buildIndex(data);
      emit("change", { items: cloneTree(data), action: "reorder" });
      return true;
    }

    // 禁止原生 <img> 拖拽劫持，确保图片小图、视频首帧等 100% 丝滑拖拽
    bodyEl.addEventListener("dragstart", (e) => { e.preventDefault(); });

    bodyEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || renamingId || deleting) return;
      if (e.target.closest("button, input, .sn-fex-tbl-hd")) return;
      const itemEl = e.target.closest("[data-fx-id]");
      // 智能判定「框选起点」vs「实体拖拽起点」：
      // 1. 空白画布 / 卡片缝隙 / 底部留白 / 按住 Alt → 橡胶框选
      // 2. 卡片视图点在缩略图/文件夹/文件名以外的透明外侧空白边距 → 橡胶框选（像 Finder 桌面一样任意空白都能拉出选框！）
      // 3. 列表/树形视图点在图标/名称区以外的右侧大片空白列 → 橡胶框选
      const hitEntity = itemEl && !e.altKey && (
        view === "card"
          ? !!e.target.closest(".sn-fdr, .sn-fcard, .sn-fex-meta-box")
          : !!e.target.closest(".sn-fex-row-ico, .sn-fex-row-name, .sn-fex-row-cnt")
      );
      if (!hitEntity) {
        const sr = stageEl.getBoundingClientRect();
        const maxW = Math.max(stageEl.clientWidth, bodyEl.clientWidth);
        const maxH = Math.max(stageEl.scrollHeight, bodyEl.clientHeight);
        marquee = {
          sx: e.clientX,
          sy: e.clientY,
          x: e.clientX,
          y: e.clientY,
          ox: Math.max(0, Math.min(maxW, e.clientX - sr.left)),
          oy: Math.max(0, Math.min(maxH, e.clientY - sr.top)),
          toggle: e.metaKey || e.ctrlKey,
          additive: e.shiftKey,
          base: new Set(selected),
          active: false,
        };
        return;
      }
      const id = itemEl.dataset.fxId;
      const rec = idx.map.get(id);
      if (!rec) return;
      const inSel = selected.has(id);
      const ids = inSel ? [...selected] : [id];
      const r = itemEl.getBoundingClientRect();
      drag = {
        ids,
        inSel,
        leadId: id,
        leadEl: itemEl,
        leadNode: rec.node,
        hasFolder: ids.some((x) => { const rr = idx.map.get(x); return rr && isFolderNode(rr.node); }),
        sx: e.clientX,
        sy: e.clientY,
        x: e.clientX,
        y: e.clientY,
        prevX: e.clientX,
        lastPx: r.left,
        lastPy: r.top,
        tilt: 0,
        grabX: e.clientX - r.left,
        grabY: e.clientY - r.top,
        width: r.width,
        height: r.height,
        active: false,
        reordered: false,
        container: null,
        slots: [],
        slotIndex: -1,
        extraEls: [],
        extraOrigin: [],
        dropTargetId: null,
        dropTargetEl: null,
        isCrumb: false,
      };
    });

    function runTiltDecay() {
      tiltRaf = 0;
      if (!drag || !drag.active || !proxyEl || view !== "card") return;
      drag.tilt *= 0.78;
      const inner = proxyEl.querySelector(".sn-fex-proxy-inner");
      if (Math.abs(drag.tilt) < 0.08) {
        drag.tilt = 0;
        if (inner) inner.style.setProperty("--sn-drag-tilt", "0deg");
        proxyEl.classList.remove("sn-proxy-tilting");
        return;
      }
      if (inner) inner.style.setProperty("--sn-drag-tilt", `${drag.tilt.toFixed(2)}deg`);
      tiltRaf = requestAnimationFrame(runTiltDecay);
    }

    const onDocMove = (e) => {
      if (marquee) {
        marquee.x = e.clientX;
        marquee.y = e.clientY;
        if (!marquee.active) {
          if (Math.hypot(e.clientX - marquee.sx, e.clientY - marquee.sy) < 5) return;
          marquee.active = true;
          root.classList.add("sn-is-marquee");
          marqueeEl = document.createElement("div");
          marqueeEl.className = "sn-fex-marquee";
          stageEl.append(marqueeEl);
        }
        if (!marqueeRaf) {
          marqueeRaf = requestAnimationFrame(() => {
            marqueeRaf = 0;
            updateMarqueeSelection();
          });
        }
        if (!marqueeScrollRaf) {
          const br = bodyEl.getBoundingClientRect();
          if (marquee.y < br.top + 32 || marquee.y > br.bottom - 32) {
            marqueeScrollRaf = requestAnimationFrame(runMarqueeAutoScroll);
          }
        }
        return;
      }
      if (!drag) return;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
        drag.active = true;
        // 若拖起的是未勾选的单项，清空此前多选（退出多选态），绝不给当前项偷偷留下持续灰底
        if (!drag.inSel && selected.size > 0) {
          selected.clear();
          syncSelectionUI();
        }
        root.classList.add("sn-is-dragging");
        const isRow = view !== "card";
        proxyEl = document.createElement("div");
        proxyEl.className = "sn-fex-proxy" + (isRow ? " sn-proxy-row" : "") + (drag.ids.length > 1 ? " sn-proxy-multi" : "");
        proxyEl.style.width = Math.round(drag.width) + "px";
        drag.lastPx = drag.x - drag.grabX;
        drag.lastPy = drag.y - drag.grabY;
        proxyEl.style.transform = `translate3d(${Math.round(drag.lastPx)}px,${Math.round(drag.lastPy)}px,0)`;
        const inner = document.createElement("div");
        inner.className = "sn-fex-proxy-inner";
        const clone = drag.leadEl.cloneNode(true);
        clone.removeAttribute("data-fx-id");
        clone.classList.remove("sn-sel", "sn-ctx-open", "sn-fex-fresh", "sn-fdr-dropped");

        const extraIds = drag.ids.filter((id) => id !== drag.leadId);
        const extraEls = extraIds.map((id) => stageEl.querySelector(`[data-fx-id="${CSS.escape(id)}"]`)).filter(Boolean);
        drag.extraEls = extraEls;
        drag.extraOrigin = extraEls.map((el) => ({ el, parent: el.parentElement, next: el.nextSibling }));

        if (!isRow) {
          const vis = clone.querySelector(".sn-fcard-stage, .sn-fdr");
          if (vis) {
            const visWrap = document.createElement("div");
            visWrap.className = "sn-fex-proxy-vis";
            vis.replaceWith(visWrap);
            visWrap.append(vis);
            if (extraEls.length > 0) {
              extraEls.slice(0, 2).forEach((exEl, i) => {
                const exVis = exEl.querySelector(".sn-fcard-stage, .sn-fdr");
                if (!exVis) return;
                const holder = document.createElement("div");
                holder.className = `sn-fex-proxy-stack sn-fex-proxy-stack-${i + 1}`;
                holder.append(exVis.cloneNode(true));
                visWrap.append(holder);
              });
              const cnt = document.createElement("span");
              cnt.className = "sn-fex-proxy-cnt";
              cnt.textContent = String(drag.ids.length);
              visWrap.append(cnt);
            }
          }
        } else if (drag.ids.length > 1) {
          const cnt = document.createElement("span");
          cnt.className = "sn-fex-proxy-cnt";
          cnt.textContent = String(drag.ids.length);
          inner.append(cnt);
        }
        inner.append(clone);
        proxyEl.append(inner);
        document.body.append(proxyEl);

        // 将 transform-origin 永久精准锚定在真实缩略图/文件夹的布局几何中心（彻底避免缩放/吸入/面包屑偏置时任何像素漂移）
        if (!isRow) {
          const visBody = inner.querySelector(".sn-fcard, .sn-fdr");
          if (visBody) {
            let ox = 0, oy = 0, curNode = visBody;
            while (curNode && curNode !== inner) {
              ox += curNode.offsetLeft;
              oy += curNode.offsetTop;
              curNode = curNode.offsetParent;
            }
            const localCx = ox + (visBody.offsetWidth || 54) / 2;
            const localCy = oy + (visBody.offsetHeight || 54) / 2;
            inner.style.transformOrigin = `${localCx}px ${localCy}px`;
          }
          // 一次性起手轻浮微动效（绝不用会在切换类名时重播跳变的 CSS animation）
          if (!reduced()) {
            inner.animate(
              [{ transform: "scale(1) rotate(0deg)" }, { transform: "scale(1.06) rotate(0deg)" }],
              { duration: 145, easing: "cubic-bezier(.22, 1, .36, 1)" }
            );
          }
        }

        const beforeCollapse = extraEls.length ? captureRects() : null;
        drag.leadEl.classList.add("sn-fex-slot");
        for (const el of extraEls) el.hidden = true;
        if (beforeCollapse) playInterruptibleFlip(beforeCollapse, drag.leadEl);

        drag.container = stageEl.querySelector(".sn-fex-grid, .sn-fex-list-rows");
        if (drag.container && view !== "tree") {
          drag.slots = measureStaticSlots(drag.container);
          const visChildren = [...drag.container.querySelectorAll(":scope > [data-fx-id]")].filter((el) => !el.hidden);
          drag.slotIndex = visChildren.indexOf(drag.leadEl);
        }
      }

      if (!dragRaf) {
        dragRaf = requestAnimationFrame(() => {
          dragRaf = 0;
          if (!drag || !drag.active || !proxyEl) return;
          const px = drag.x - drag.grabX;
          const py = drag.y - drag.grabY;
          drag.lastPx = px;
          drag.lastPy = py;
          proxyEl.style.transform = `translate3d(${Math.round(px)}px,${Math.round(py)}px,0)`;

          // 卡片视图速度惯性轻摆
          if (view === "card" && !reduced()) {
            const vx = drag.x - drag.prevX;
            drag.prevX = drag.x;
            const targetTilt = Math.max(-4, Math.min(4, vx * 0.24));
            drag.tilt = drag.tilt * 0.62 + targetTilt * 0.38;
            const inner = proxyEl.querySelector(".sn-fex-proxy-inner");
            if (inner && !proxyEl.classList.contains("sn-proxy-aim") && !proxyEl.classList.contains("sn-proxy-crumb-aim")) {
              proxyEl.classList.add("sn-proxy-tilting");
              inner.style.setProperty("--sn-drag-tilt", `${drag.tilt.toFixed(2)}deg`);
            }
            if (!tiltRaf && Math.abs(drag.tilt) > 0.08) tiltRaf = requestAnimationFrame(runTiltDecay);
          } else {
            drag.prevX = drag.x;
          }

          // 边缘自动滚动
          const br = bodyEl.getBoundingClientRect();
          if (drag.y > br.top && drag.y < br.top + 36 && bodyEl.scrollTop > 0) {
            bodyEl.scrollTop = Math.max(0, bodyEl.scrollTop - 8);
          } else if (drag.y < br.bottom && drag.y > br.bottom - 36 && bodyEl.scrollTop + bodyEl.clientHeight < bodyEl.scrollHeight) {
            bodyEl.scrollTop += 8;
          }

          const prevTargetId = drag.dropTargetId;
          let nextTargetId = null;
          let nextTargetEl = null;
          let nextDropCls = "";
          let nextIsCrumb = false;

          // 1. 优先命中面包屑祖先目录（拖回上级）
          const under = document.elementFromPoint(drag.x, drag.y);
          const crumb = under?.closest?.(".sn-fex-crumb[data-crumb-id]");
          if (crumb && crumbsEl.contains(crumb) && !crumb.hasAttribute("aria-current")) {
            const cid = crumb.dataset.crumbId;
            if (canDropInto(drag.ids, cid)) {
              nextTargetId = cid;
              nextTargetEl = crumb;
              nextDropCls = "sn-crumb-drop";
              nextIsCrumb = true;
            }
          }

          // 2. 树形视图直接走元素命中移入文件夹
          if (!nextTargetEl && (view === "tree" || !drag.container || !drag.slots.length)) {
            const overEl = under?.closest?.("[data-fx-id]");
            if (overEl && stageEl.contains(overEl) && !overEl.classList.contains("sn-fex-slot") && overEl.dataset.folder === "1") {
              const oid = overEl.dataset.fxId;
              if (canDropInto(drag.ids, oid)) {
                nextTargetId = oid;
                nextTargetEl = overEl;
                nextDropCls = "sn-drop-target";
              }
            }
          }

          // 3. 卡片 / 列表视图：基于静态槽位网格坐标 + 8px 施密特离区迟滞精准判定（彻底防抖动）
          let ctrIdx = -1;
          let visChildren = null;
          let cardCx = 0, cardCy = 0;
          if (!nextTargetEl && view !== "tree" && drag.container && drag.slots.length) {
            const sr = stageEl.getBoundingClientRect();
            cardCx = px + drag.width / 2 - sr.left;
            cardCy = py + drag.height / 2 - sr.top;
            const ptrX = drag.x - sr.left;
            const ptrY = drag.y - sr.top;
            visChildren = [...drag.container.querySelectorAll(":scope > [data-fx-id]")].filter((el) => !el.hidden);
            if (visChildren.length !== drag.slots.length) {
              drag.slots = measureStaticSlots(drag.container);
              drag.slotIndex = visChildren.indexOf(drag.leadEl);
            }

            const findSlotAt = (x, y, padX = 4, padY = 5) => {
              for (let i = 0; i < drag.slots.length; i++) {
                const b = drag.slots[i];
                if (x >= b.left - padX && x <= b.right + padX && y >= b.top - padY && y <= b.bottom + padY) return i;
              }
              return -1;
            };

            const ptrIdx = findSlotAt(ptrX, ptrY, 0, 0);
            ctrIdx = findSlotAt(cardCx, cardCy, 4, 5);
            const matchFolderSlot = (idxCandidate, testX, testY) => {
              if (idxCandidate < 0 || idxCandidate >= visChildren.length) return false;
              const el = visChildren[idxCandidate];
              if (!el || el === drag.leadEl || el.dataset.folder !== "1") return false;
              const oid = el.dataset.fxId;
              if (!canDropInto(drag.ids, oid)) return false;
              const b = drag.slots[idxCandidate];
              // 若已锁定在本文件夹，向外放宽 8px 施密特迟滞，彻底消灭边缘微移闪烁抖动
              const locked = prevTargetId === oid;
              const ix = locked ? -8 : (!drag.hasFolder ? b.width * 0.06 : (view === "card" ? b.width * 0.22 : 0));
              const iy = locked ? -8 : (!drag.hasFolder ? b.height * 0.06 : (view === "card" ? b.height * 0.16 : b.height * 0.22));
              if (testX >= b.left + ix && testX <= b.right - ix && testY >= b.top + iy && testY <= b.bottom - iy) {
                nextTargetId = oid;
                nextTargetEl = el;
                nextDropCls = "sn-drop-target";
                return true;
              }
              return false;
            };

            matchFolderSlot(ptrIdx, ptrX, ptrY) || matchFolderSlot(ctrIdx, cardCx, cardCy);
          }

          // 差量更新落点类，零每帧反复 remove/add 抽搐
          setActiveDrop(nextTargetEl, nextDropCls);
          drag.dropTargetId = nextTargetId;
          drag.dropTargetEl = nextTargetEl;
          drag.isCrumb = nextIsCrumb;
          proxyEl.classList.toggle("sn-proxy-aim", !!nextTargetEl && !nextIsCrumb);
          proxyEl.classList.toggle("sn-proxy-crumb-aim", !!nextTargetEl && nextIsCrumb);
          if (nextTargetEl) return;

          // 4. 同级网格 / 列表 FLIP 实时避让重排
          if (view !== "tree" && visChildren && !query.trim() && ctrIdx >= 0 && ctrIdx !== drag.slotIndex) {
            const targetEl = visChildren[ctrIdx];
            if (!drag.hasFolder && targetEl && targetEl.dataset.folder === "1") return;
            const b = drag.slots[ctrIdx];
            const hyst = 4;
            const entered = view === "card"
              ? (cardCx >= b.left + hyst && cardCx <= b.right - hyst && cardCy >= b.top + hyst && cardCy <= b.bottom - hyst)
              : (cardCy >= b.top + hyst && cardCy <= b.bottom - hyst);
            if (entered && targetEl && targetEl !== drag.leadEl) {
              const beforeVisual = captureRects();
              const refNode = ctrIdx > drag.slotIndex ? targetEl.nextSibling : targetEl;
              if (refNode !== drag.leadEl && refNode !== drag.leadEl.nextSibling) {
                drag.container.insertBefore(drag.leadEl, refNode);
                playInterruptibleFlip(beforeVisual, drag.leadEl);
                drag.slotIndex = ctrIdx;
                drag.reordered = true;
              }
            }
          }
        });
      }
    };

    const onDocUp = () => {
      if (canceledByEsc) {
        canceledByEsc = false;
        suppressNextClick = true;
        setTimeout(() => { suppressNextClick = false; }, 80);
        return;
      }
      if (marquee) {
        const wasActive = marquee.active;
        endMarquee(false);
        if (wasActive) {
          suppressNextClick = true;
          setTimeout(() => { suppressNextClick = false; }, 60);
          emit("select", { ids: [...selected] });
        }
        return;
      }
      if (!drag) return;
      const cur = drag;
      if (cur.active) {
        suppressNextClick = true;
        setTimeout(() => { suppressNextClick = false; }, 60);
      }
      if (cur.active && cur.dropTargetId !== null) {
        const targetId = cur.dropTargetId;
        const targetEl = cur.dropTargetEl;
        const ids = cur.ids;
        endDrag(null, targetEl, () => {
          moveItems(ids, targetId, true);
        });
      } else if (cur.active && cur.reordered) {
        if (cur.extraEls?.length) restoreHiddenExtras(cur, true);
        reorderCurrentListByDom();
        endDrag(cur.leadEl);
      } else {
        if (cur.active && cur.extraEls?.length) restoreHiddenExtras(cur, false);
        endDrag(cur.active ? cur.leadEl : null);
      }
    };

    const onWinBlur = () => {
      if (marquee) endMarquee(false);
      if (drag) endDrag(null);
    };

    const onDocKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (marquee) {
        e.preventDefault();
        canceledByEsc = true;
        suppressNextClick = true;
        endMarquee(true);
      } else if (drag && drag.active) {
        e.preventDefault();
        canceledByEsc = true;
        suppressNextClick = true;
        endDrag(drag.leadEl);
      }
    };

    document.addEventListener("pointermove", onDocMove);
    document.addEventListener("pointerup", onDocUp);
    document.addEventListener("pointercancel", onDocUp);
    document.addEventListener("keydown", onDocKeyDown);
    window.addEventListener("blur", onWinBlur);

    function toggleSelectAll() {
      const visIds = visibleItemIds();
      if (!visIds.length) return;
      const allOn = visIds.every((id) => selected.has(id));
      selected.clear();
      if (!allOn) {
        visIds.forEach((id) => selected.add(id));
      }
      syncSelectionUI();
      const box = stageEl.querySelector("[data-fx-chk-all] .sn-box");
      if (box && !allOn) popCheck(box);
      emit("select", { ids: [...selected] });
    }

    function openItemAction(id) {
      const rec = idx.map.get(String(id));
      if (!rec) return;
      if (isFolderNode(rec.node)) {
        if (view === "tree") toggleTreeFolder(rec.id);
        else openFolder(rec.id);
      } else {
        emit("open", { id: rec.id, node: rec.node });
        toast({ text: tt("tree.64", { p0: rec.node.name }), icon: KIND_ICON[kindOf(rec.node)] || "file" });
      }
    }

    stageEl.addEventListener("click", (e) => {
      if (suppressNextClick) { suppressNextClick = false; return; }
      if (e.target.closest("[data-fx-rename-input]")) return;
      const allBtn = e.target.closest("[data-fx-chk-all]");
      if (allBtn) { e.stopPropagation(); toggleSelectAll(); return; }
      const chkBtn = e.target.closest("[data-fx-chk]");
      if (chkBtn) {
        e.stopPropagation();
        const id = chkBtn.dataset.fxChk;
        const alreadyChecked = selected.has(id);
        if (alreadyChecked) selected.delete(id);
        else selected.add(id);
        lastAnchorId = id;
        syncSelectionUI();
        if (!alreadyChecked) popCheck(chkBtn.querySelector(".sn-box"));
        emit("select", { ids: [...selected] });
        return;
      }
      const tw = e.target.closest("[data-fx-tw]");
      if (tw) { e.stopPropagation(); toggleTreeFolder(tw.dataset.fxTw); return; }
      const sortBtn = e.target.closest("[data-fx-sort]");
      if (sortBtn) {
        const k = sortBtn.dataset.fxSort;
        if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
        render(false);
        return;
      }
      const itemEl = e.target.closest("[data-fx-id]");
      if (!itemEl) {
        if (selected.size) { selected.clear(); syncSelectionUI(); emit("select", { ids: [] }); }
        return;
      }
      const id = itemEl.dataset.fxId;
      if (e.metaKey || e.ctrlKey) {
        const on = !selected.has(id);
        if (on) selected.add(id); else selected.delete(id);
        lastAnchorId = id;
        syncSelectionUI();
        if (on) popCheck(itemEl.querySelector("[data-fx-chk] .sn-box"));
        emit("select", { ids: [...selected] });
      } else if (e.shiftKey && lastAnchorId) {
        const allIds = visibleItemIds();
        const a = allIds.indexOf(lastAnchorId), b = allIds.indexOf(id);
        if (a >= 0 && b >= 0) {
          selected.clear();
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) selected.add(allIds[i]);
        }
        syncSelectionUI();
        emit("select", { ids: [...selected] });
      } else if (selected.size > 0) {
        // 已处于勾选多选态：轻点卡片顺手切换勾选（不误打开文件夹打断批量挑选）
        const on = !selected.has(id);
        if (on) selected.add(id); else selected.delete(id);
        lastAnchorId = id;
        syncSelectionUI();
        if (on) popCheck(itemEl.querySelector("[data-fx-chk] .sn-box"));
        emit("select", { ids: [...selected] });
      } else {
        // 常规纯净浏览态（0 勾选）：不留无意义持续灰底；轻点文件夹直接平滑进入（或树形展开/收起），轻点文件直接触发打开
        if (performance.now() - lastNavAt < 280) return;
        openItemAction(id);
      }
    });

    if (batchEl) {
      batchEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-fx-bact]");
        if (!btn) return;
        const act = btn.dataset.fxBact;
        if (act === "all") toggleSelectAll();
        else if (act === "move" && selected.size > 0) openMovePickerMenu([...selected], batchMoveBtn || btn);
        else if (act === "dup" && selected.size > 0) duplicateItems([...selected]);
        else if (act === "del" && selected.size > 0) deleteItems([...selected]);
        else if (act === "clear") { selected.clear(); syncSelectionUI(); emit("select", { ids: [] }); }
      });
    }

    stageEl.addEventListener("dblclick", (e) => {
      if (e.target.closest("button, input")) return;
      // 单击已经进入文件夹时（320ms 内）拦截第二次点击，防止双击穿透误点新目录中的卡片
      if (performance.now() - lastNavAt < 320) return;
      const itemEl = e.target.closest("[data-fx-id]");
      if (!itemEl) return;
      openItemAction(itemEl.dataset.fxId);
    });

    stageEl.addEventListener("keydown", (e) => {
      const inp = e.target.closest("[data-fx-rename-input]");
      if (!inp) return;
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); commitRename(inp.dataset.fxRenameInput, inp.value); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); renamingId = null; render(false); }
    });
    stageEl.addEventListener("focusout", (e) => {
      const inp = e.target.closest("[data-fx-rename-input]");
      if (inp && renamingId === inp.dataset.fxRenameInput) commitRename(inp.dataset.fxRenameInput, inp.value);
    });

    bodyEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (renamingId) return;
      const itemEl = e.target.closest("[data-fx-id]");
      if (itemEl) {
        const id = itemEl.dataset.fxId;
        // 右键仅对该项标记临时上下文态 .sn-ctx-open（菜单关闭立即清除），绝不污染勾选选中态
        openContextMenu(id, { x: e.clientX, y: e.clientY });
      } else {
        openContextMenu(null, { x: e.clientX, y: e.clientY });
      }
    });

    crumbsEl.addEventListener("click", (e) => {
      const moreBtn = e.target.closest("[data-crumb-more]");
      if (moreBtn && collapsedCrumbs.length) {
        mainMenu.innerHTML = collapsedCrumbs.map((p) =>
          `<div class="sn-item" role="menuitem" data-act="crumb" data-target="${esc(p.id)}">${icon("folder", 14)}<span data-tip-full>${esc(p.name)}</span></div>`
        ).join("");
        openMenu(mainMenu, {
          anchor: moreBtn,
          trigger: moreBtn,
          align: "start",
          bound: root,
          surface: opts.menuSurface || "blur",
          onSelect: ({ item }) => {
            if (item.dataset.act === "crumb") openFolder(item.dataset.target || "");
          },
        });
        return;
      }
      const btn = e.target.closest("[data-crumb-id]");
      if (!btn || btn.hasAttribute("aria-current")) return;
      openFolder(btn.dataset.crumbId || "");
    });
    upBtn.addEventListener("click", () => goUp());
    newBtn.addEventListener("click", () => openContextMenu(null, null, newBtn));

    if (qInput) qInput.addEventListener("input", () => { query = qInput.value; bodyEl.scrollTop = 0; render(false); });
    if (clrBtn) clrBtn.addEventListener("click", () => { query = ""; if (qInput) { qInput.value = ""; qInput.focus(); } bodyEl.scrollTop = 0; render(false); });

    bodyEl.addEventListener("scroll", () => { if (view === "tree" && treeVirt) paintTreeWindow(false); }, { passive: true });
    bodyEl.addEventListener("sa-jump", () => { if (view === "tree" && treeVirt) paintTreeWindow(true); });

    root.addEventListener("keydown", (e) => {
      if (e.target.closest("input, textarea")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        toggleSelectAll();
      } else if (e.key === "F2" && selected.size === 1) {
        e.preventDefault();
        renamingId = [...selected][0];
        render(false);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.size > 0) {
        e.preventDefault();
        deleteItems([...selected]);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (e.key === "Escape") {
        if (marquee) endMarquee(true);
        else if (drag) endDrag();
        else if (selected.size) { selected.clear(); syncSelectionUI(); emit("select", { ids: [] }); }
      }
    });

    onCleanup(() => {
      clearTimeout(droppedTimer);
      clearTimeout(freshTimer);
      clearTimeout(deleteTimer);
      clearTimeout(moveTimer);
      clearTimeout(fxCollapseTimer);
      document.removeEventListener("pointermove", onDocMove);
      document.removeEventListener("pointerup", onDocUp);
      document.removeEventListener("pointercancel", onDocUp);
      document.removeEventListener("keydown", onDocKeyDown);
      window.removeEventListener("blur", onWinBlur);
      endDrag();
      endMarquee(false);
      clearCtxMark();
      closeMenu(false);
      mainMenu.remove();
      subMoveMenu.remove();
      subViewMenu.remove();
    });

    render(false);

    return {
      setView(v) { setView(v, true); },
      openFolder(id) { return openFolder(id); },
      goUp() { goUp(); },
      createItem(kind, parentId) { return createItem(kind, parentId, false); },
      renameItem(id, name) {
        idx = buildIndex(data);
        const rec = idx.map.get(String(id));
        if (!rec || !String(name || "").trim()) return false;
        commitRename(id, name);
        return true;
      },
      setFolderColor(ids, color) { return setFolderColor(ids, color); },
      moveItems(ids, targetFolderId) { return moveItems(ids, targetFolderId, true); },
      deleteItems(ids) { return deleteItems(ids, true); },
      undo() { return undo(); },
      getItems() { return cloneTree(data); },
      getView() { return view; },
      getPath() { return [...pathIds]; },
      update(next, prev) {
        opts = { ...opts, ...next };
        if (next.height !== prev?.height) root.style.height = cssSize(next.height, "460px");
        if (next.activeStyle !== prev?.activeStyle) applyActiveStyle(root, next.activeStyle, "fex");
        if (next.items && next.items !== prev?.items) {
          data = cloneTree(next.items);
          idx = buildIndex(data);
        }
        if (next.view && next.view !== prev?.view && ["card", "list", "tree"].includes(next.view)) {
          view = next.view;
          segCtl?.go(viewIndex(view), false, true);
        }
        if (Array.isArray(next.path) && next.path !== prev?.path) pathIds = next.path.map(String);
        render(false);
      },
      destroy() {
        clearTimeout(droppedTimer);
        clearTimeout(freshTimer);
        clearTimeout(deleteTimer);
        clearTimeout(moveTimer);
        endDrag();
        endMarquee();
      },
    };
  },
});
