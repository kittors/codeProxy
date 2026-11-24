// 表格（真数据用）：给列定义和数据，渲染设计稿里的 .sn-tbl 标记。交互和设计稿"完整示例"那张表是同一份代码：
// · 排序：点表头，行按新顺序移到位（300ms ease-open，相邻行错开 15ms）；树形时每一级的同级之间排
// · 多级树：data 里的行带 children 就是树。展开时下面的行滑开、下级在让出来的地方露出来；收起时下面的行滑上来把下级盖住
// · 勾选（上下级联动、半选）；筛选 filter（显示匹配的行和它的所有上级，上级自动展开）
// · 合并单元格：列上 merge（连续相同的值合成一格），或 spans(看得见的行) 规则函数（任意的 rowSpan / colSpan）；只在网格线下合并
// · 拖行（同一个上级里换位置，整棵子树一起走）、拖列、拖表头右边缘改宽（双击按内容定宽）、拖行的下边线改行高
// · 单击格子选中、方向键走格子；editable 的列双击（或回车）改
// · 空、加载中（骨架行）、出错（带重试）；斑马纹 / 紧凑 / 无外框 / 网格线；限高时表头固定、在框里滚
// 十万行这种量级用 satin-ui/grid（数据表格）；几百上千行用这个。
//   createTable(el, {
//     columns: [{ key: "name", title: "项目", sortable: true }, { key: "shots", title: "镜头", align: "right", sortable: true, format: (v) => v + " 个" }],
//     data, rowKey: "id", selectable: true, onSelect(keys) {}, onSort({ key, dir }) {}, onExpandChange({ keys }) {},
//   })
// 单元格的内容：format(值, 行) 返回文字（会转义）；html(值, 行) 返回 HTML（自己保证安全）；render(值, 行, { cell, key, index, level }) 返回 HTML 字符串、
// 节点，或者自己改好 cell 返回 undefined（React 封装让它能返回 JSX，Vue 封装让它能返回 VNode、写插槽 #cell-<key>）。
import { icon } from "./icons.js";
import { BOX, EASE, EASE_CSS, bezier, contentW, liftIn, mountSelect, tween } from "./form.js";
import { mountPager } from "./nav.js";
import { scrollArea } from "./scroll.js";
import { reduced } from "./core.js";
import { scoped } from "./i18n.js";
import I18N_DEFAULTS from "./locales/zh-CN/table.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);

// ———— 1. 小工具 ————
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cx = (...a) => a.filter(Boolean).join(" ");
const $ = (s, r) => r.querySelector(s), $$ = (s, r) => [...r.querySelectorAll(s)];
const px = (v) => (typeof v === "number" ? v + "px" : String(v));
const keyList = (v) => (v == null ? null : [].concat(v).map(String));
const sameList = (a, b) => (a == null && b == null) || (a != null && b != null && a.length === b.length && a.every((x, i) => String(x) === String(b[i])));
const sameSort = (a, b) => (a?.key ?? null) === (b?.key ?? null) && (a?.dir ?? null) === (b?.dir ?? null);
// 拖行的空位：和数据表格（grid.js 的同名函数）同一套算法。表格在主入口里，不引数据表格那个重组件，这几行抄一份
const slotShift = (y, h, before, H, G) => { const c = before ? y : y - H, s = Math.max(0, Math.min(1, (c + h - G) / h)); return before ? H * s : -H * (1 - s); };
function gapOrder() {
  let prev = null; const d = (p, q) => (p[1] > .5 && q[1] > .5 ? Math.abs(p[0] - q[0]) : 0) + Math.abs(p[1] - q[1]);
  return (pcs) => { if (prev && d(pcs[0], prev[1]) + d(pcs[1], prev[0]) < d(pcs[0], prev[0]) + d(pcs[1], prev[1])) pcs = [pcs[1], pcs[0]]; return (prev = pcs); };
}
function gapPieces(G, H, [a, h]) {
  if (!(h > 0 && G > a + .3 && G < a + h - .3)) return [[G, H], [G + H, 0]];
  const t = a + H * (a + h - G) / h;
  return [[a, t - a], [t + h, a + H - t]];
}
const gapStep = (G, tg, k, dt, h) => { if (Math.abs(tg - G) < .3) return tg; const cap = Math.max(4, h * .4) * dt / 16.7; return G + Math.max(-cap, Math.min(cap, (tg - G) * k)); };

// ———— 2. 列、树、排序、显隐、合并（纯数据：Node / 服务端渲染里也能算） ————
// 列：type "actions" 是行末的操作列（固定在最右边，不排序、不拖、不改宽，悬停这一行时按钮才变实）；其余是数据列
function colsOf(columns) {
  const all = (columns || []).filter(Boolean);
  return { data: all.filter((c) => c.type !== "actions"), acts: all.find((c) => c.type === "actions") || null };
}
// 树：每行一个节点 { key, row, lv, parent, kids }；行里的 children 是下级。没有 rowKey 字段的行按出现的先后编号
function treeOf(data, rowKey = "id") {
  const nodes = new Map(); let n = 0, tree = false;
  const walk = (list, lv, parent) => (Array.isArray(list) ? list : []).map((row, i) => {
    const key = String(typeof rowKey === "function" ? rowKey(row, i) : row?.[rowKey] ?? n); n++;
    const nd = { key, row, lv, parent, kids: [] }; nodes.set(key, nd);
    const ch = row?.children; if (Array.isArray(ch) && ch.length) { tree = true; nd.kids = walk(ch, lv + 1, nd); }
    return nd;
  });
  return { top: walk(data, 0, null), nodes, tree };
}
const walkAll = (list, f) => { for (const nd of list) { f(nd); walkAll(nd.kids, f); } };
// 默认的比较：数字按大小，文字按中文顺序（数字部分按数值）
const cmpVal = (x, y) => (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "zh-CN", { numeric: true }));
// 排序：列上可以给自定义 sort(a 行, b 行)
export function sortRows(rows, columns, sort) {
  if (!sort?.key) return rows.slice();
  const c = columns.find((x) => x.key === sort.key), d = sort.dir === "desc" ? -1 : 1;
  const cmp = c?.sort || ((a, b) => cmpVal(a[sort.key], b[sort.key]));
  return rows.map((r, i) => [r, i]).sort((A, B) => cmp(A[0], B[0]) * d || A[1] - B[1]).map((x) => x[0]);
}
// 节点的比较（每一级的同级之间排，就地排：一样大的保持现在的先后——上一次排序、拖行的结果）
const nodeCmp = (c, d) => (c?.sort ? (a, b) => c.sort(a.row, b.row) * d : (a, b) => cmpVal(a.row?.[c?.key], b.row?.[c?.key]) * d);
function sortTree(list, cmp) { list.sort(cmp); for (const nd of list) if (nd.kids.length) sortTree(nd.kids, cmp); }
// 显隐：没筛选时按每一级的展开状态；有筛选时显示匹配的节点和它的所有上级，上级默认展开（筛选期间点收起只记在 qOpen 里）
function visOf(top, open, q, qOpen) {
  const hit = new Map(), test = (nd) => { if (hit.has(nd.key)) return hit.get(nd.key); const v = !q || !!q(nd.row) || nd.kids.some(test); hit.set(nd.key, v); return v; };
  const isOpen = (nd) => (q ? qOpen.get(nd.key) ?? true : open.has(nd.key)), out = new Map();
  const walk = (nd, shown) => { const vis = shown && test(nd), op = isOpen(nd), showKids = vis && op && nd.kids.some(test); out.set(nd.key, { vis, showKids }); for (const k of nd.kids) walk(k, vis && op); };
  for (const nd of top) walk(nd, true);
  return out;
}
// 合并区域：按"现在看得见的行"算（排序、展开、筛选、拖行以后都重算），只在网格线下合并。
//   列上 merge: true（或 (a, b) => 是否算相同）：相邻两行这一列一样就合成一格
//   spans(rows)：返回 [{ row: 第几行（看得见的行里）, key: 从哪一列开始, rowSpan?, colSpan? }]，按现在的列顺序往右数 colSpan 列
// 结果 { a, b, k, cs }：行 [a, b)，从列 k 起 cs 列；重叠的、出界的丢掉
function regionsOf(rows, dcols, order, o) {
  if (o.lines !== "grid") return [];
  const out = [], taken = new Set(), at = (i, k) => i + "\u0001" + k;
  const add = (a, b, k, cs) => {
    const j = order.indexOf(k); if (j < 0 || a < 0 || b > rows.length || b - a < 1) return;
    cs = Math.max(1, Math.min(cs || 1, order.length - j)); if (b - a < 2 && cs < 2) return;
    const cells = []; for (let i = a; i < b; i++) for (let c = j; c < j + cs; c++) cells.push(at(i, order[c]));
    if (cells.some((x) => taken.has(x))) return; for (const x of cells) taken.add(x);
    out.push({ a, b, k, cs });
  };
  for (const c of dcols) if (c.merge) {
    const same = typeof c.merge === "function" ? c.merge : (x, y) => String(x?.[c.key] ?? "") === String(y?.[c.key] ?? "");
    for (let a = 0; a < rows.length;) { let b = a + 1; while (b < rows.length && same(rows[a], rows[b])) b++; if (b - a > 1) add(a, b, c.key, 1); a = b; }
  }
  if (typeof o.spans === "function") for (const s of o.spans(rows) || []) if (s && Number.isInteger(s.row)) add(s.row, s.row + Math.max(1, s.rowSpan | 0 || 1), String(s.key), s.colSpan | 0 || 1);
  return out;
}
const coversCol = (g, k, order) => { const j = order.indexOf(g.k), c = order.indexOf(k); return c >= j && c < j + g.cs; };

// ———— 3. 标记 ————
const tdClass = (c) => cx(c.align === "right" && "sn-r", (c.num ?? c.align === "right") && "sn-num", c.className);
const attrsHTML = (o) => Object.entries(o || {}).filter(([k, v]) => v != null && v !== false && !/^(class|style|hidden|data-(id|lv|parent))$/.test(k)).map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join("");
const check = (label, on, mixed) => `<label class="sn-check"><input type="checkbox" aria-label="${esc(label)}"${on ? " checked" : ""}${mixed ? " data-indeterminate" : ""}>${BOX}</label>`;
const GRIP = () => `<span class="sn-grip" aria-label="${esc(tt("table.grip"))}">${icon("grip-vertical", 16)}</span>`, RH = '<i class="sn-g-rh" aria-hidden="true"></i>', RZ = '<i class="sn-g-rz" aria-hidden="true"></i>';
// 格子里放的东西（字符串阶段：render 返回节点、React / Vue 的节点时先空着，挂上以后再画）
function cellInner(c, nd, i, wrapText) {
  const v = nd.row?.[c.key];
  if (typeof c.render === "function") { const out = c.render(v, nd.row, { cell: null, key: c.key, index: i, level: nd.lv }); return typeof out === "string" ? out : typeof out === "number" ? esc(out) : ""; }
  if (typeof c.html === "function") return String(c.html(v, nd.row) ?? "");
  const t = esc(c.format ? c.format(v, nd.row) : v);
  return wrapText ? `<span>${t}</span>` : t; // 合并的列：内容要有一个元素（过渡时它滑到合并块的正中）
}
function detailOut(o, nd, i) {
  if (typeof o.detail !== "function") return null;
  const ctx = { key: nd.key, index: i, level: nd.lv };
  if (typeof o.rowExpandable === "function" && !o.rowExpandable(nd.row, ctx)) return null;
  const out = o.detail(nd.row, ctx);
  return out == null || out === false || out === "" ? null : out;
}
function canDetailOf(o, nd, i) {
  if (typeof o.detail !== "function") return false;
  const ctx = { key: nd.key, index: i, level: nd.lv };
  if (typeof o.rowExpandable === "function") return !!o.rowExpandable(nd.row, ctx);
  const out = o.detail(nd.row, ctx);
  return out != null && out !== false && out !== "";
}

// 一张表的样子：选项 + 当前状态（顺序、展开、勾选、排序、筛选）→ 画标记要用的东西。tableHTML 和挂载以后重画都用它
function modelOf(o, st) {
  const { data: dcols0, acts } = colsOf(o.columns), byKey = new Map(dcols0.map((c) => [c.key, c]));
  const order = st.order && st.order.length === dcols0.length && st.order.every((k) => byKey.has(k)) ? st.order : dcols0.map((c) => c.key);
  const dcols = order.map((k) => byKey.get(k)), T = st.T;
  const prim = (dcols0.find((c) => c.primary) ?? dcols0[0])?.key ?? null;
  const hasCk = !!(o.draggableRows || o.resizableRows), hasPick = !!o.selectable && !hasCk;
  const hasDetail = typeof o.detail === "function", hasExp = T.tree || hasDetail;
  const pinL = new Set(dcols.filter((c) => c.fixed === "left").map((c) => c.key));
  const pinR = new Set(dcols.filter((c) => c.fixed === "right").map((c) => c.key));
  const actsPin = !!acts && (acts.fixed === "right" || ((pinL.size > 0 || pinR.size > 0) && acts.fixed !== false));
  const hasPin = pinL.size > 0 || pinR.size > 0 || actsPin;
  const leadPin = hasPin && (hasCk || hasPick) && pinL.size > 0;
  const lastPinL = pinL.size ? [...dcols].reverse().find((c) => pinL.has(c.key))?.key : (leadPin ? "__lead__" : null);
  const firstPinR = pinR.size ? dcols.find((c) => pinR.has(c.key))?.key : (actsPin ? "__acts__" : null);
  const useCols = !!o.draggableColumns || dcols0.some((c) => c.resizable) || hasPin;
  const merging = dcols0.some((c) => "merge" in c) || typeof o.spans === "function";
  const useDataC = T.tree || hasDetail || useCols || merging || !!o.cellSelect || dcols0.some((c) => c.editable);
  return { o, st, dcols, dcols0, acts, order, prim, hasCk, hasPick, hasDetail, hasExp, pinL, pinR, hasPin, leadPin, actsPin, lastPinL, firstPinR, useCols, useDataC, T, byKey, n: dcols.length + (hasCk || hasPick ? 1 : 0) + (acts ? 1 : 0) };
}
// 列宽（有 colgroup 的交互表格）：width 是数字的列固定宽度，没写的是弹性列（分剩下的宽度）；minWidth 是拖边线时最窄多少
const widthsOf = (dcols0) => { const CW = {}, MINW = {}; for (const c of dcols0) { CW[c.key] = typeof c.width === "number" ? c.width : 0; MINW[c.key] = c.minWidth ?? Math.min(64, CW[c.key] || 64); } return { CW, MINW }; };
const actsWidthOf = (acts) => (typeof acts?.width === "number" ? acts.width : 84);
// 表格最窄 = 勾选列 + 操作列 + 各固定列宽度 + 弹性列的最小宽度：容器再窄就在框里横着滚，不把弹性列挤没
const minWidthOf = (M, CW, MINW) => (M.hasCk ? 60 : M.hasPick ? 44 : 0) + (M.acts ? actsWidthOf(M.acts) : 0) + M.dcols.reduce((t, c) => t + (CW[c.key] || MINW[c.key] || 0), 0);
const pinCls = (M, k) => cx(M.pinL.has(k) && "sn-pin-l", M.lastPinL === k && "sn-pin-l-end", M.pinR.has(k) && "sn-pin-r", M.firstPinR === k && "sn-pin-r-start");
const leadPinCls = (M) => cx(M.leadPin && "sn-pin-l", M.lastPinL === "__lead__" && "sn-pin-l-end");
const actsPinCls = (M) => cx(M.actsPin && "sn-pin-r", M.firstPinR === "__acts__" && "sn-pin-r-start");
// 初始固定偏移（字符串阶段先用列宽算出来，首帧零抖动；挂上后 syncPinned 再按实际渲染宽校准）
function pinOffsets(M, CW, MINW) {
  const off = new Map();
  let lx = M.leadPin ? (M.hasCk ? 60 : 44) : 0;
  for (const c of M.dcols) if (M.pinL.has(c.key)) { off.set(c.key, lx); lx += CW[c.key] || MINW[c.key] || 120; }
  let rx = M.actsPin ? actsWidthOf(M.acts) : 0;
  for (let i = M.dcols.length - 1; i >= 0; i--) { const c = M.dcols[i]; if (M.pinR.has(c.key)) { off.set(c.key, rx); rx += CW[c.key] || MINW[c.key] || 100; } }
  return off;
}
function normPageCfg(p) {
  if (!p) return null;
  const cfg = p === true ? {} : p;
  return {
    page: Math.max(1, Number(cfg.page) || 1),
    pageSize: Math.max(1, Number(cfg.pageSize) || 10),
    total: cfg.total != null ? Math.max(0, Number(cfg.total)) : null,
    pageSizes: cfg.pageSizes === false ? null : (Array.isArray(cfg.pageSizes) ? cfg.pageSizes : [10, 20, 50]),
    local: cfg.local,
    onChange: typeof cfg.onChange === "function" ? cfg.onChange : null,
  };
}

function headHTML(M, PINS) {
  const { o, st } = M, nOn = M.T.top.filter((nd) => st.picked.has(nd.key)).length, nTop = M.T.top.length;
  const allBox = check(tt("table.all"), nTop > 0 && nOn === nTop, !(nTop > 0 && nOn === nTop) && st.picked.size > 0);
  const lead = M.hasCk ? `<th class="${cx("sn-ck", leadPinCls(M))}">${o.selectable ? allBox : ""}</th>` : M.hasPick ? `<th class="${cx("sn-tbl-pick", leadPinCls(M))}">${allBox}</th>` : "";
  const ths = M.dcols.map((c) => {
    const on = st.sortKey === c.key, aria = on ? ` aria-sort="${st.dir < 0 ? "descending" : "ascending"}"` : "";
    const pinStyle = PINS?.has(c.key) ? `--sn-pin-x:${PINS.get(c.key)}px;` : "";
    const wStyle = !M.useCols && c.width != null ? `width:${esc(px(c.width))};` : "";
    const style = (wStyle || pinStyle) ? ` style="${wStyle}${pinStyle}"` : "";
    const dc = M.useDataC ? ` data-c="${esc(c.key)}"${!o.draggableColumns || c.fixed ? " data-fixed" : ""}` : "";
    const cls = cx(c.align === "right" && "sn-r", pinCls(M, c.key));
    const inner = c.sortable ? `<button class="${cx("sn-sort", on && "sn-on", on && st.dir < 0 && "sn-desc")}" data-k="${esc(c.key)}">${esc(c.title ?? "")}${icon("arrow-up", 16)}</button>` : esc(c.title ?? "");
    return `<th class="${cls}"${dc}${aria}${style}>${inner}${M.useCols && c.resizable ? RZ : ""}</th>`;
  }).join("");
  const actHead = M.acts ? `<th class="${cx("sn-acts", actsPinCls(M))}">${esc(M.acts.title ?? "")}</th>` : "";
  return `<thead><tr>${lead}${ths}${actHead}</tr></thead>`;
}
function colgroupHTML(M, CW) {
  if (!M.useCols) return "";
  // 有固定列且所有数据列都给了数字宽度时：留一个中间非固定列当弹性吸收宽屏余量，避免 table-layout:fixed 把多余宽度均摊撑胖勾选列和操作列
  const hasFlex = M.dcols.some((c) => !CW[c.key]);
  const absorbKey = M.hasPin && !hasFlex ? (M.dcols.find((c) => !M.pinL.has(c.key) && !M.pinR.has(c.key))?.key ?? null) : null;
  const actCol = M.acts ? `<col class="sn-c-acts"${typeof M.acts.width === "number" ? ` style="width: ${M.acts.width}px;"` : ""}>` : "";
  return `<colgroup>${M.hasCk ? '<col class="sn-c-ck">' : M.hasPick ? '<col class="sn-c-pick">' : ""}${M.dcols.map((c) => `<col data-c="${esc(c.key)}"${CW[c.key] && c.key !== absorbKey ? ` style="width: ${CW[c.key]}px;"` : ""}>`).join("")}${actCol}</colgroup>`;
}
// 一行：树形时带层级（data-lv、data-parent、--sn-lv）；下级 sn-kid；展开着的 sn-open；勾上的 sn-sel；看不见的 hidden；支持行详情时紧跟一条全宽 .sn-tbl-detail
function rowHTML(M, nd, i, vis, merged, PINS) {
  const { o, st } = M, v = vis.get(nd.key), on = st.picked.has(nd.key), mixed = !on && nd.kids.length > 0 && (function m(x) { return x.kids.some((k) => st.picked.has(k.key) || m(k)); })(nd);
  const canDet = M.hasDetail && canDetailOf(o, nd, i);
  const detOpen = canDet && v.vis && (st.q && st.qOpen.has(nd.key) ? st.qOpen.get(nd.key) : st.open.has(nd.key));
  const canExp = nd.kids.length > 0 || canDet;
  const rowOpen = v.showKids || detOpen;
  let a = ` data-id="${esc(nd.key)}"`;
  if (M.T.tree) a += ` data-lv="${nd.lv}" data-parent="${esc(nd.parent?.key ?? "")}" style="--sn-lv:${nd.lv}"`;
  const cls = cx(nd.lv > 0 && "sn-kid", rowOpen && "sn-open", detOpen && "sn-detail-open", on && "sn-sel"); if (cls) a += ` class="${cls}"`;
  if (typeof o.rowAttrs === "function") a += attrsHTML(o.rowAttrs(nd.row, { key: nd.key, level: nd.lv, parent: nd.parent?.row ?? null }));
  if (!v.vis) a += " hidden";
  const name = String(nd.row?.[M.prim] ?? ""), box = o.selectable ? check(name ? tt("table.pickRow", { p0: name }) : tt("table.pick"), on, mixed) : "";
  const lead = M.hasCk ? `<td class="${cx("sn-ck", leadPinCls(M))}">${o.draggableRows ? GRIP() : ""}${box}${o.resizableRows ? RH : ""}</td>` : M.hasPick ? `<td class="${cx("sn-tbl-pick", leadPinCls(M))}">${box}</td>` : "";
  const tds = M.dcols.map((c) => {
    const mg = merged.get(nd.key + "\u0001" + c.key), cl = cx(tdClass(c), pinCls(M, c.key), mg?.head && "sn-mg");
    let attr = M.useDataC ? ` data-c="${esc(c.key)}"` : "";
    if (mg) attr += (mg.rs ? ` rowspan="${mg.rs}"` : "") + (mg.cs ? ` colspan="${mg.cs}"` : "");
    if (cl) attr += ` class="${cl}"`;
    if (PINS?.has(c.key)) attr += ` style="--sn-pin-x:${PINS.get(c.key)}px"`;
    if (mg?.hidden) attr += " hidden";
    let inner = cellInner(c, nd, i, "merge" in c && !c.html && !c.render);
    if (M.hasExp && c.key === M.prim) {
      const expEl = canExp
        ? `<button type="button" class="sn-disc sn-exp" aria-label="${esc(tt("table.expand"))}" aria-expanded="${rowOpen}">${icon("chevron-right", 16)}</button>`
        : `<i class="${M.T.tree ? "sn-leaf" : "sn-leaf sn-leaf-empty"}" aria-hidden="true"></i>`;
      inner = `<span class="sn-name">${expEl}${typeof c.render === "function" ? `<span class="sn-tbl-cell">${inner}</span>` : inner}</span>`;
    }
    return `<td${attr}>${inner}</td>`;
  }).join("");
  const act = M.acts ? `<td class="${cx("sn-acts", actsPinCls(M))}">${cellInner(M.acts, nd, i, false)}</td>` : "";
  let detTr = "";
  if (canDet) {
    const raw = detOpen ? detailOut(o, nd, i) : null;
    const dHtml = typeof raw === "string" ? raw : typeof raw === "number" ? esc(raw) : "";
    detTr = `<tr class="${cx("sn-tbl-detail", detOpen && "sn-open")}" data-detail-for="${esc(nd.key)}"${detOpen ? "" : " hidden"}><td colspan="${M.n}"><div class="sn-tbl-detail-bd"><div class="sn-tbl-detail-in">${dHtml}</div></div></td></tr>`;
  }
  return `<tr${a}>${lead}${tds}${act}</tr>${detTr}`;
}
// 合并（字符串阶段）：和挂上以后 applyMerge 画出来的一样（合并列的每一格都写 rowspan，块的第一格 sn-mg，被盖住的 hidden）
function mergedOf(M, visRows) {
  const out = new Map(), mk = M.dcols.filter((c) => "merge" in c).map((c) => c.key), regs = regionsOf(visRows.map((nd) => nd.row), M.dcols0, M.order, M.o);
  for (const g of regs) if (!mk.includes(g.k)) mk.push(g.k);
  const csCols = new Set(); for (const g of regs) if (g.cs > 1) for (let j = M.order.indexOf(g.k); j < M.order.indexOf(g.k) + g.cs; j++) csCols.add(M.order[j]);
  for (const k of new Set([...mk, ...csCols])) walkAll(M.T.top, (nd) => out.set(nd.key + "\u0001" + k, { rs: mk.includes(k) ? 1 : 0, cs: csCols.has(k) ? 1 : 0 }));
  for (const g of regs) {
    const head = out.get(visRows[g.a].key + "\u0001" + g.k); head.head = true; head.rs = g.b - g.a > 1 || head.rs ? g.b - g.a : 0; if (g.cs > 1) head.cs = g.cs;
    for (let i = g.a; i < g.b; i++) for (let j = M.order.indexOf(g.k); j < M.order.indexOf(g.k) + g.cs; j++) if (i !== g.a || M.order[j] !== g.k) { const e = out.get(visRows[i].key + "\u0001" + M.order[j]); if (e) e.hidden = true; }
  }
  return out;
}
const emptyInner = (o, filtered) => (typeof o.empty === "function" ? String(o.empty({ filtered }) ?? "") : esc(o.empty ?? tt("table.empty")));
function errorRow(M) {
  const msg = typeof M.o.error === "string" ? M.o.error : tt("table.errorHint");
  return `<tr class="sn-tbl-empty sn-tbl-err"><td colspan="${M.n}"><div class="sn-tbl-none" role="alert"><span class="sn-art">${icon("circle-alert", 16)}</span><b>${esc(tt("table.error"))}</b><span>${esc(msg)}</span><button type="button" class="sn-btn sn-secondary sn-sm" data-retry>${esc(tt("table.retry"))}</button></div></td></tr>`;
}
function bodyHTML(M, PINS) {
  const { o, st } = M;
  if (o.loading) {
    const sk = Math.max(1, o.skeleton ?? 5);
    return `<tbody>${Array.from({ length: sk }, (_, j) => `<tr class="sn-tbl-loading">${M.hasCk ? `<td class="${cx("sn-ck", leadPinCls(M))}"></td>` : M.hasPick ? `<td class="${cx("sn-tbl-pick", leadPinCls(M))}"></td>` : ""}${M.dcols.map((c, i) => `<td class="${cx(tdClass(c), pinCls(M, c.key))}"${PINS?.has(c.key) ? ` style="--sn-pin-x:${PINS.get(c.key)}px"` : ""}><span class="sn-sk" style="display:inline-block;height:12px;width:${c.align === "right" ? 36 : 48 + ((i * 7 + j * 13) % 4) * 8}%"></span></td>`).join("")}${M.acts ? `<td class="${cx("sn-acts", actsPinCls(M))}"></td>` : ""}</tr>`).join("")}</tbody>`;
  }
  if (o.error) return `<tbody>${errorRow(M)}</tbody>`;
  const vis = visOf(M.T.top, st.open, st.q, st.qOpen), flat = []; walkAll(M.T.top, (nd) => flat.push(nd));
  const visRows = flat.filter((nd) => vis.get(nd.key).vis), merged = mergedOf(M, visRows), none = !M.T.top.some((nd) => vis.get(nd.key).vis);
  return `<tbody>${flat.map((nd, i) => rowHTML(M, nd, i, vis, merged, PINS)).join("")}<tr class="sn-tbl-empty"${none ? "" : " hidden"}><td colspan="${M.n}">${none ? emptyInner(o, !!st.q) : ""}</td></tr></tbody>`;
}
function tableInner(M, CW, MINW) {
  const { o } = M, PINS = M.hasPin ? pinOffsets(M, CW, MINW) : null;
  return `<table class="sn-tbl"${o.cellSelect ? ' tabindex="0"' : ""}${o.label ? ` aria-label="${esc(o.label)}"` : ""}${M.useCols ? ` style="min-width: ${minWidthOf(M, CW, MINW)}px;"` : ""}${o.loading ? ' aria-busy="true"' : ""}>${colgroupHTML(M, CW)}${headHTML(M, PINS)}${bodyHTML(M, PINS)}</table>`;
}
function footHTML(cfg, totalItems, selectedCount) {
  if (!cfg) return "";
  const sizes = cfg.pageSizes
    ? `<div class="sn-select sn-tbl-ps" data-select data-tbl-ps>`
      + `<button type="button" class="sn-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(tt("table.pageSize"))}">`
      + `<span class="sn-val">${esc(tt("table.perPage", { p0: cfg.pageSize }))}</span>${icon("chevron-down", 14)}`
      + `</button>`
      + `<div class="sn-menu sn-up" role="listbox">${cfg.pageSizes.map((n) => `<div class="${cx("sn-item", n === cfg.pageSize && "sn-sel")}" role="option" aria-selected="${n === cfg.pageSize}" data-v="${n}">${esc(tt("table.perPage", { p0: n }))}<span class="sn-chk">${icon("check", 14)}</span></div>`).join("")}</div>`
      + `</div>`
    : "";
  const sel = selectedCount > 0 ? `<span class="sn-tbl-foot-sel">· ${esc(tt("table.selected", { p0: selectedCount }))}</span>` : "";
  return `<div class="sn-tbl-foot"><div class="sn-tbl-foot-l"><span data-tbl-total>${esc(tt("table.total", { p0: totalItems }))}</span>${sel}${sizes}</div><div class="sn-pager"><button type="button" class="sn-btn sn-ghost sn-sm sn-ibtn" data-pg="prev" aria-label="${esc(tt("table.prev"))}">${icon("chevron-left", 16)}</button><div class="sn-pages"></div><button type="button" class="sn-btn sn-ghost sn-sm sn-ibtn" data-pg="next" aria-label="${esc(tt("table.next"))}">${icon("chevron-right", 16)}</button></div></div>`;
}
// 初始状态（展开、勾选、排序、筛选）：tableHTML 和挂载用同一份
function stateOf(o) {
  const T = treeOf(o.data ?? o.rows ?? [], o.rowKey ?? "id"), s = o.sort ?? o.defaultSort ?? null;
  const st = { T, open: new Set(keyList(o.expandedKeys ?? o.defaultExpandedKeys) ?? []), picked: new Set(keyList(o.selected ?? o.defaultSelected) ?? []), sortKey: s?.key ?? null, dir: s?.dir === "desc" ? -1 : 1, q: typeof o.filter === "function" ? o.filter : null, qOpen: new Map(), order: null };
  if (st.sortKey && o.sortLocal !== false) sortTree(T.top, nodeCmp(colsOf(o.columns).data.find((c) => c.key === st.sortKey), st.dir));
  return st;
}
const wrapClass = (o, hasPin) => cx("sn-tbl-wrap", o.striped && "sn-striped", o.compact && "sn-compact", o.plain && "sn-plain", o.fill && "sn-tbl-fill", hasPin && "sn-has-pin", o.pagination && "sn-has-foot");
export function tableHTML(o = {}) {
  const M = modelOf(o, stateOf(o)), { CW, MINW } = widthsOf(M.dcols0), pg = normPageCfg(o.pagination);
  const total = pg ? (pg.total ?? M.T.top.length) : 0;
  return `<div class="${wrapClass(o, M.hasPin)}"${o.lines === "grid" ? ' data-lines="grid"' : ""}${o.maxHeight != null ? ` style="--sn-tbl-max:${esc(px(o.maxHeight))}"` : ""}><div class="sn-tbl-sc">${tableInner(M, CW, MINW)}</div>${footHTML(pg, total, 0)}</div>`;
}
// 列"长什么样"（不比函数本身）：React / Vue 每次渲染都传新数组，只要列没变就不整表重画（merge 另外比：变了只重新合并）
const colSig = (cols = []) => cols.map((c) => [c.key, c.title, c.type, c.align, c.width, c.minWidth, c.sortable, c.sortFirst, c.resizable, c.fixed, c.primary, c.editable, c.num, c.className, "merge" in c, !!c.format, !!c.html, !!c.render].join("\u0001")).join("\u0002");
const mergeSig = (cols = []) => cols.map((c) => (typeof c.merge === "function" ? "f" : String(c.merge))).join(",");
const FLAGS = ["selectable", "draggableRows", "draggableColumns", "resizableRows", "cellSelect", "loading", "error", "detail"];

// ———— 4. 挂载 ————
// wrap 是 .sn-tbl-wrap：里面是空的（设计稿的 #tbl、只给了外框）就先画进去，已经有标记（tableHTML / 服务端渲染出来的）就直接接。
// emit(type, detail) 发事件（createTable 传进来；直接用 mountTable 时找选项里的 onXxx）。返回实例：update(next, prev)、读数、方法、destroy
export function mountTable(wrap, o0 = {}, emit) {
  let o = { rowKey: "id", ...o0 };
  const fire = emit || ((t, d) => o["on" + t[0].toUpperCase() + t.slice(1)]?.(d));
  const st = stateOf(o);
  let T = st.T, picked = st.picked, sortKey = st.sortKey, dir = st.dir, q = st.q;
  const open = st.open, qOpen = st.qOpen, order = [];
  const cur = () => ({ T, open, picked, sortKey, dir, q, qOpen, order });
  let M = modelOf(o, cur()); order.push(...M.order);
  let { CW, MINW } = widthsOf(M.dcols0), FLEX = new Set(M.dcols0.filter((c) => !CW[c.key]).map((c) => c.key));
  if (!wrap.querySelector("table.sn-tbl")) {
    wrap.innerHTML = `<div class="sn-tbl-sc">${tableInner(M, CW, MINW)}</div>`;
    for (const k of ["sn-striped", "sn-compact", "sn-plain"]) if (o[k.slice(3)]) wrap.classList.add(k);
    if (o.lines) wrap.dataset.lines = o.lines;
  }
  wrap.classList.toggle("sn-tbl-fill", !!o.fill);
  wrap.classList.toggle("sn-has-pin", M.hasPin);
  if (o.maxHeight != null) { const v = px(o.maxHeight); if (wrap.style.getPropertyValue("--sn-tbl-max") !== v) wrap.style.setProperty("--sn-tbl-max", v); }
  // 表格内置封装 Satin 滚动区域：隐藏丑陋原生滚动条、启用细腻悬浮细条；横向锁死不回弹且不误触浏览器左右滑动返回；竖向滚到头停住不拉扯 sticky 表头；不加边缘渐隐免得表头和固定列被淡掉
  const scEl = $(".sn-tbl-sc", wrap);
  const saInst = scEl ? scrollArea(scEl, { fade: "none", overscroll: "auto" }) : null;
  let pgCfg = normPageCfg(o.pagination), pgPage = pgCfg?.page ?? 1, pgSize = pgCfg?.pageSize ?? 10, pgInst = null, psInst = null, footEl = $(":scope > .sn-tbl-foot", wrap), pgTotalItems = 0;
  let table, thead, tbody, emptyRow, all, TR = new Map(), DTR = new Map();
  const detTimers = new Map(), detPainted = new Set();
  const clearDetTimers = () => { for (const tid of detTimers.values()) clearTimeout(tid); detTimers.clear(); };
  const refs = () => {
    table ??= $("table.sn-tbl", wrap); thead = $(":scope > thead", table); tbody = $(":scope > tbody", table);
    emptyRow = $(":scope > tr.sn-tbl-empty:not(.sn-tbl-err)", tbody); all = $(".sn-check input", thead); TR = new Map(); DTR = new Map(); detPainted.clear();
    for (const tr of tbody.children) {
      if (tr.dataset.id != null && T.nodes.has(tr.dataset.id)) TR.set(tr.dataset.id, tr);
      else if (tr.dataset.detailFor != null && T.nodes.has(tr.dataset.detailFor)) {
        DTR.set(tr.dataset.detailFor, tr);
        const box = $(".sn-tbl-detail-in", tr);
        if (box && box.childNodes.length) detPainted.add(tr.dataset.detailFor);
      }
    }
  };
  refs();
  const fixMixed = () => { for (const i of $$("input[data-indeterminate]", table)) { i.indeterminate = true; i.removeAttribute("data-indeterminate"); } };
  fixMixed();
  // 树的几个小工具：节点 ↔ 行；看得见的行；一列的格子
  const nodeOf = (tr) => T.nodes.get(tr.dataset.id), rowsOf = () => [...tbody.children];
  const descTrs = (tr) => { const out = []; walkAll(nodeOf(tr).kids, (k) => { const r = TR.get(k.key); if (r) out.push(r); const d = DTR.get(k.key); if (d) out.push(d); }); return out; };
  const visRows = () => rowsOf().filter((r) => !r.hidden && r !== emptyRow && !r.classList.contains("sn-tbl-empty") && !r.classList.contains("sn-tbl-detail"));
  const cellOf = (tr, k) => $(`td[data-c="${CSS.escape(k)}"]`, tr), colOf = (k) => M.byKey.get(k);
  // 可合并的列：列上写了 merge 的（开关关着也算：从合并过渡回不合并时内容要滑回去），和 spans 用到过的
  const MK = []; const addMK = (k) => { if (!MK.includes(k)) MK.push(k); };
  for (const c of M.dcols0) if ("merge" in c) addMK(c.key);
  const CSK = new Set(); // 用过 colSpan 的列（被横着盖住的格子要重置）
  const isOpen = (nd) => (q ? qOpen.get(nd.key) ?? true : open.has(nd.key));
  const isDetailOpen = (nd) => DTR.has(nd.key) && (q && qOpen.has(nd.key) ? qOpen.get(nd.key) : open.has(nd.key));
  const paintDetail = (nd, force = false) => {
    const dtr = DTR.get(nd.key); if (!dtr || (!force && detPainted.has(nd.key))) return;
    const box = $(".sn-tbl-detail-in", dtr); if (!box) return;
    const out = detailOut(o, nd, indexOf(nd));
    detPainted.add(nd.key);
    if (typeof out === "string" || typeof out === "number") { const h = typeof out === "number" ? esc(out) : out; if (box.innerHTML !== h) box.innerHTML = h; }
    else if (out && typeof out === "object" && "nodeType" in out) box.replaceChildren(out);
    else box.replaceChildren();
  };
  const syncDetailRow = (nd, want, animate) => {
    const dtr = DTR.get(nd.key), tr = TR.get(nd.key);
    if (!dtr) return;
    clearTimeout(detTimers.get(nd.key)); detTimers.delete(nd.key);
    tr?.classList.toggle("sn-detail-open", !!want);
    if (want) {
      paintDetail(nd);
      if (!animate || reduced()) {
        dtr.hidden = false; dtr.classList.add("sn-open");
      } else {
        const wasHidden = dtr.hidden;
        dtr.hidden = false;
        if (wasHidden) { dtr.classList.remove("sn-open"); void dtr.offsetHeight; }
        dtr.classList.add("sn-open");
      }
    } else if (!animate || reduced() || dtr.hidden) {
      dtr.classList.remove("sn-open"); dtr.hidden = true;
    } else {
      dtr.classList.remove("sn-open");
      detTimers.set(nd.key, setTimeout(() => { detTimers.delete(nd.key); if (!dtr.classList.contains("sn-open")) dtr.hidden = true; }, 260));
    }
  };
  // render 返回节点 / React、Vue 的节点：挂上以后画进格子（字符串阶段先空着）
  const paintCell = (td, c, nd, i) => {
    const box = M.hasExp && c.key === M.prim ? $(":scope > .sn-name > .sn-tbl-cell", td) : td; if (!box) return;
    const out = c.render(nd.row?.[c.key], nd.row, { cell: box, key: c.key, index: i, level: nd.lv });
    if (typeof out === "string" || typeof out === "number") { const h = typeof out === "number" ? esc(out) : out; if (box.innerHTML !== h) box.innerHTML = h; }
    else if (out && typeof out === "object" && "nodeType" in out) box.replaceChildren(out);
  };
  const paintRenders = () => {
    const rc = M.dcols.filter((c) => typeof c.render === "function"); if (!rc.length && typeof M.acts?.render !== "function") return;
    let i = 0; walkAll(T.top, (nd) => { const tr = TR.get(nd.key); if (tr) { for (const c of rc) { const td = cellOf(tr, c.key); if (td) paintCell(td, c, nd, i); } if (typeof M.acts?.render === "function") { const td = $(":scope > td.sn-acts", tr); if (td) paintCell(td, M.acts, nd, i); } } i++; });
  };
  paintRenders();
  // 每一行"画出来是什么"（字符串部分）：换数据时按它认出哪几行变了——Vue 里就地改了行里的字段、React 里换了新对象都认得出来
  const sigOf = (nd, i) => M.dcols.map((c) => (typeof c.render === "function" ? "" : cellInner(c, nd, i, "merge" in c && !c.html))).join("\u0001") + "\u0002" + (M.acts && typeof M.acts.render !== "function" ? cellInner(M.acts, nd, i, false) : "") + "\u0002" + String(nd.row?.[M.prim] ?? "");
  const SIG = new Map(), remember = () => { SIG.clear(); let i = 0; walkAll(T.top, (nd) => SIG.set(nd.key, sigOf(nd, i++))); };
  remember();

  // ———— 行的位置变化都走 relayout（排序、筛选、展开收起、拖行松手、合并开关）————
  // 先量现在看到的样子（包括还在过渡中的偏移、只露出一截的行），再改，再从看到的样子过渡到新样子——中途再改也接着走，不会跳：
  //  · 留下来的行从原来的位置滑到新位置；合计行（tfoot 里的行，有就跟着）跟着滑，表格外框的高度跟着变（页面下面的内容也是滑过去，不是一下跳）；
  //  · 新出现的行就在最后的位置上，被下面滑开的行"推开"一点点露出来；要藏起来的行原地不动，被下面滑上来的行"合上"盖住，盖完才真正藏起来
  //    （不先淡出、中间不空一块、不和别的行叠字）；每一格都有不透明的底，排序时行和行交叉，一行盖住另一行；
  //  · 有合并的格子时，过渡期间各格先各自显示（合并块里不画行线、底色和合并后一样），块的第一格内容滑到整块正中
  //    （这一行压在别的行上面，内容不会被下面的行盖住）、多出来的几份淡出；过渡结束才真正合并（rowspan），这一下画面不变。
  const easeOut = (t) => 1 - (1 - t) ** 4, easeOpen = bezier(.32, .72, 0, 1); /* 推开 / 合上和侧栏开合同一条曲线（--ease-open）：起步快，不会先空一下 */
  let lay = null, dragNow = null, colLand = null, foot = null, selTd = null, editing = null, lastRegs = [];
  const footOf = () => $(":scope > tfoot > tr", table);
  // 限高/填满且在 .sn-tbl-sc 内竖向滚动时，thead/tfoot 靠原生 position:sticky 吸附，绝不对 tfoot tr 做 translate（否则叠加 sticky 飞到表中央或掉出底部）
  const isScrollY = () => !!scEl && (o.maxHeight != null || !!o.fill || scEl.scrollHeight > scEl.clientHeight + 1) && /(auto|scroll)/.test(getComputedStyle(scEl).overflowY);
  const isFootSticky = (f) => !!f?.firstElementChild && isScrollY() && getComputedStyle(f.firstElementChild).position === "sticky";
  function regions(vs) { const regs = regionsOf(vs.map((r) => nodeOf(r).row), M.dcols0, order, o); for (const g of regs) { addMK(g.k); if (g.cs > 1) for (let j = order.indexOf(g.k); j < order.indexOf(g.k) + g.cs; j++) CSK.add(order[j]); } return regs; }
  function applyMerge(vs, regs) {
    for (const k of MK) for (const td of $$(`td[data-c="${CSS.escape(k)}"]`, tbody)) { td.rowSpan = 1; td.hidden = false; td.classList.remove("sn-mg", "sn-mg-x", "sn-mg-y", "sn-mg-o"); }
    for (const k of CSK) for (const td of $$(`td[data-c="${CSS.escape(k)}"]`, tbody)) { td.colSpan = 1; if (!MK.includes(k)) td.hidden = false; }
    for (const g of regs) {
      const td = cellOf(vs[g.a], g.k); td.rowSpan = g.b - g.a; if (g.cs > 1) td.colSpan = g.cs; td.classList.add("sn-mg");
      for (let i = g.a; i < g.b; i++) for (let j = order.indexOf(g.k); j < order.indexOf(g.k) + g.cs; j++) if (i !== g.a || order[j] !== g.k) cellOf(vs[i], order[j]).hidden = true;
    }
    lastRegs = regs;
    if (selTd?.hidden) { const on = wrap.classList.contains("sn-sel-on"), i = vs.indexOf(selTd.closest("tr")), g = regs.find((x) => i >= x.a && i < x.b && coversCol(x, selTd.dataset.c, order)); selectTd(g ? cellOf(vs[g.a], g.k) : null); wrap.classList.toggle("sn-sel-on", on && !!selTd); } /* 选中的格子被并进去了：选合并后的那一格（选中框原来收着就还收着） */
  }
  // 合并块第一格的内容要往下挪多少才在整块正中（每帧按当前行高算；限高滚动表同时与 CSS position:sticky 区间对齐，避免撞进表头腰斩或结束跳变）
  const spanOff = (vs, g, stk) => {
    let s = 0; for (let k = g.a; k < g.b; k++) s += vs[k].offsetHeight;
    const h0 = vs[g.a].offsetHeight, mid = (s - h0) / 2;
    if (!stk) return mid;
    const topY = stk.top, rel1 = stk.rel1;
    let y = topY + rel1 + mid;
    if (y < stk.minY) y = Math.min(topY + s - h0 + rel1, stk.minY);
    if (y > stk.maxY) y = Math.max(topY + rel1, stk.maxY);
    return y - (topY + rel1);
  };
  const rowContentOp = (r) => {
    const v = parseFloat(r.style.getPropertyValue("--sn-row-op"));
    return Number.isFinite(v) ? v : +getComputedStyle(r).opacity;
  };
  function measure() {
    const m = new Map();
    for (const r of rowsOf()) {
      if (r.hidden || r.classList.contains("leaving")) continue; /* 正在被盖住的行不算"原来就在"：中途又要它出来，就接着现在露出来的那一截再推开 */
      const e = { y: r.getBoundingClientRect().top, op: rowContentOp(r), mc: null };
      if (r !== emptyRow && MK.length) { e.mc = {}; for (const k of MK) { const td = cellOf(r, k), c = !td || td.hidden ? null : td.firstElementChild; e.mc[k] = { cy: c ? c.getBoundingClientRect().top : null, cop: c ? +getComputedStyle(c).opacity : 0, reg: !!td && (td.hidden || td.rowSpan > 1 || td.classList.contains("sn-mg-x")) }; } }
      m.set(r, e);
    }
    foot = footOf(); m.foot = foot ? foot.getBoundingClientRect().top : 0; m.h = wrap.getBoundingClientRect().height; m.scH = scEl ? scEl.getBoundingClientRect().height : 0;
    m.leaving = new Map($$(":scope > tr.leaving", tbody).map((r) => [r, rowContentOp(r)])); /* 正在被盖住的行：再出来时接着现在的透明度，不闪爆 */
    return m;
  }
  const clearLay = (l) => {
    cancelAnimationFrame(l.raf);
    for (const it of l.items) { it.el.style.translate = ""; it.el.style.opacity = ""; }
    for (const c of l.clips) { c.r.style.clipPath = ""; c.r.style.translate = ""; c.r.style.opacity = ""; c.r.style.removeProperty("--sn-row-op"); c.r.classList.remove("adding", "leaving"); }
    for (const r of l.movers) r.classList.remove("sn-moving");
    for (const r of l.tops) r.classList.remove("sn-mg-top");
    if (l.hAnim) { wrap.style.height = ""; if (l.hAnim.sc) scEl.style.height = ""; }
  };
  function stopLay() { // 停在终点：清掉偏移和裁切；被盖住的行真正藏起来；该合并的合并
    const l = lay; if (!l) return; lay = null; clearLay(l); for (const r of l.gone) r.hidden = true; applyMerge(l.vs, l.regs);
  }
  function relayout(change = () => {}, op = {}) { if (o.loading || o.error) return; colLand?.(); const m = measure(); stopLay(); run(m, change, op); } /* 拖完的列还在落位：先落好 */
  function run(m, change, op) {
    change();
    const vs = visRows(), regs = op.split ? [] : regions(vs);
    fire("layout", { rows: vs.map((r) => nodeOf(r).row) }); // 看得见的行定了（合计行这类跟着它算）
    if (selTd && selTd.closest("tr").hidden) { let nd = nodeOf(selTd.closest("tr")).parent; while (nd && TR.get(nd.key).hidden) nd = nd.parent; selectTd(nd ? cellOf(TR.get(nd.key), selTd.dataset.c) : null); } /* 选中的那一行被收起：选最近的看得见的上级那一行 */
    if (reduced() || op.instant) { applyMerge(vs, regs); return; }
    applyMerge(vs, regs.filter((g) => g.b - g.a < 2)); // 过渡期间只留横着的合并（同一行里，跟着这一行走）；竖着的先拆开，到位再合
    const regK = new Map(); for (const g of regs) if (g.b - g.a > 1) { if (!regK.has(g.k)) regK.set(g.k, new Map()); for (let k = g.a; k < g.b; k++) regK.get(g.k).set(k, g); }
    // 先把过渡态合并类（sn-mg-x / sn-mg-y / sn-mg-o）打好，再做任何 getBoundingClientRect() 布局读取，彻底消除合并格在强制重排瞬间触发 hover/kid 闪灰过渡
    const gonePre = op.rows !== false ? [...m.keys()].filter((r) => r.hidden) : [];
    for (const r of gonePre) for (const k of MK) { const td = cellOf(r, k), wc = m.get(r)?.mc?.[k]; if (!td || !wc?.reg) continue; td.classList.add("sn-mg-x", "sn-mg-y"); if (td.firstElementChild && (wc.cy == null || wc.cop < .5)) td.firstElementChild.style.opacity = "0"; }
    vs.forEach((r, i) => {
      const was = m.get(r);
      for (const k of MK) {
        const td = cellOf(r, k); if (!td) continue;
        const g = regK.get(k)?.get(i), wc = was?.mc?.[k];
        if (g) { td.classList.add("sn-mg-x"); if (i < g.b - 1) td.classList.add("sn-mg-y"); if (g.a !== i && td.firstElementChild && !wc?.cy) td.firstElementChild.style.opacity = "0"; }
        // 大合并块收拢成单行时：过渡期内容正从下方滑回本行，先隐藏本格底线并与下方收拢区统一底色，避免底线横穿正在上滑的头像/文字
        else if (wc?.reg && wc.cy != null && wc.cy - was.y > 22 && gonePre.length) td.classList.add("sn-mg-x", "sn-mg-y");
        if (wc?.reg) td.classList.add("sn-mg-o");
      }
    });
    const items = [], clips = [], tops = [], movers = [], DUR = 300; let gone = [], hAnim = null, mv = null, fy = null;
    const scrollY = isScrollY(), footSticky = isFootSticky(foot);
    const all = rowsOf(), shown = all.filter((r) => !r.hidden);
    if (op.rows !== false) {
      // 最后的样子：每一行、合计行在哪，外框与滚动区多高
      fy = new Map(shown.map((r) => [r, r.getBoundingClientRect().top]));
      const ffoot = foot && !footSticky ? foot.getBoundingClientRect().top : 0, h1 = wrap.getBoundingClientRect().height, scH1 = scEl ? scEl.getBoundingClientRect().height : 0;
      // 原来看得见、现在要藏起来的行：先留在原处占着位置，等下面的行滑上来盖住再藏
      gone = gonePre; for (const r of gone) { r.hidden = false; r.classList.add("leaving"); }
      const live = all.filter((r) => !r.hidden), ly = new Map(live.map((r) => [r, r.getBoundingClientRect().top])), lfoot = foot && !footSticky ? foot.getBoundingClientRect().top : 0; /* 过渡期间的排版（要藏的行还占着位置）：位移都相对它算 */
      mv = new Map(); let k = 0;
      for (const r of live) {
        const was = m.get(r), L = ly.get(r);
        if (r.classList.contains("leaving")) mv.set(r, { y0: was.y - L, y1: was.y - L, kind: "gone" });
        else if (was) mv.set(r, { y0: was.y - L, y1: fy.get(r) - L, kind: "stay" });
        else mv.set(r, { y0: fy.get(r) - L, y1: fy.get(r) - L, kind: "add" });
      }
      if (foot && !footSticky) mv.set(foot, { y0: m.foot - lfoot, y1: ffoot - lfoot, kind: "stay" });
      // 留下来的行（非吸底时含合计行）：从看到的位置滑到最后的位置；滑动的行压在新出现 / 要藏的行上面
      for (const [r, v] of mv) {
        if (v.kind !== "stay" || (Math.abs(v.y0) < .5 && Math.abs(v.y1) < .5)) continue;
        const d = op.stagger && Math.abs(v.y1 - v.y0) > .5 ? Math.min(k++ * op.stagger, 120) : 0;
        items.push({ el: r, y0: v.y0, y1: v.y1, op0: 1, op1: 1, d, dur: DUR, e: easeOpen, row: true });
        if (r !== foot) { r.classList.add("sn-moving"); movers.push(r); }
      }
      // 新出现的、要藏起来的行：挂在它上面最近的那一行"留下来的"行下面一起走（不和上面的行拉开、也不叠上去），
      // 被它下面最近的那一行"留下来的"行（非吸底时或合计行）盖住多少就裁掉多少；可推合的只淡化单元格内容（保留连续网格线，彻底消除半截残影与断线白洞）
      const below = new Map(); let ref = footSticky ? null : foot;
      for (let i = live.length - 1; i >= 0; i--) { const r = live[i]; below.set(r, ref); if (mv.get(r).kind === "stay") ref = r; }
      let anchor = null, addSeq = 0;
      for (const r of live) {
        const v = mv.get(r); if (v.kind === "stay") { anchor = r; addSeq = 0; continue; }
        const rf = below.get(r), av = anchor ? mv.get(anchor) : null, base = v.kind === "add" ? v.y1 : v.y0, aRef = av ? (v.kind === "add" ? av.y1 : av.y0) : 0;
        const c = { r, ref: rf, anchor, base, aRef, kind: v.kind, top: ly.get(r), h: r.getBoundingClientRect().height, refTop: rf ? (rf === foot ? lfoot : ly.get(rf)) : 0, op0: 1, op1: 1, d: 0, contentOnly: false };
        const at = (aY, rY) => Math.max(0, Math.min(c.h, c.refTop + rY - (c.top + base + (av ? aY - aRef : 0))));
        const rv = rf ? mv.get(rf) : null;
        const swapped = !rv || (v.kind === "gone" ? at(av?.y1 ?? 0, rv.y1) > 1 : at(av?.y0 ?? 0, rv.y0) > 1); // 盖不住 / 推不开的（比如筛选时一行换成另一行，下面那一行不动）
        c.contentOnly = !swapped;
        if (v.kind === "gone") { c.op0 = m.get(r)?.op ?? 1; c.op1 = 0; }
        if (v.kind === "add") {
          const prevOp = m.leaving.get(r);
          c.op0 = prevOp != null ? prevOp : 0;
          c.op1 = 1;
          c.d = prevOp != null ? 0 : (swapped ? 100 : Math.min(addSeq++ * 16, 64));
        }
        r.classList.add(v.kind === "add" ? "adding" : "leaving"); clips.push(c);
      }
      if (Math.abs(h1 - m.h) > .5) hAnim = { h0: m.h, h1, sc: scEl && Math.abs(scH1 - m.scH) > .5 ? { h0: m.scH, h1: scH1 } : null };
      mv.forEach((v) => (v.cur = v.y0));
    }
    // 合并块的内容（限高滚动表同步计算与 CSS position:sticky 一致的视口夹紧目标，确保动画与落位 0 跳变、不撞表头腰斩）
    const scRect = scrollY ? scEl.getBoundingClientRect() : null;
    const headH = scrollY ? (thead?.getBoundingClientRect().height || 40) : 0;
    const footH = scrollY && footSticky ? (foot.firstElementChild.getBoundingClientRect().height || 44) : 0;
    vs.forEach((r, i) => {
      const was = m.get(r); let d = 0;
      if (op.rows === false && was) { // 拖的这一组的行由调用方（拖行）接着管：这里只接着做完下级相对它的那一点偏移；这一组以外还在过渡的行，从看到的位置接着滑到位
        const dy = was.y - r.getBoundingClientRect().top;
        if (op.managed && !op.managed.has(r)) { if (Math.abs(dy) > .5) items.push({ el: r, y0: dy, y1: 0, op0: 1, op1: 1, d: 0, dur: DUR, e: easeOpen, row: true }); }
        else { const f = op.head?.(r) ?? r, wf = m.get(f), res = dy - (wf ? wf.y - f.getBoundingClientRect().top : 0); if (Math.abs(res) > .5) items.push({ el: r, y0: res, y1: 0, op0: 1, op1: 1, d: 0, dur: 220, e: easeOut, row: true }); }
      }
      for (const k of MK) {
        const td = cellOf(r, k), c = td && !td.hidden ? td.firstElementChild : null; if (!c) continue;
        const g = regK.get(k)?.get(i), keep = !g || g.a === i, wc = was?.mc?.[k], seen = !!wc && wc.cy != null;
        const cr = c.getBoundingClientRect(), rr = r.getBoundingClientRect(), rel1 = cr.top - rr.top; /* 内容在这一行里的位置（相对行，和行自己的位移无关） */
        let stk = null;
        if (keep && g && scrollY && scRect) {
          const finTop = (fy?.get(r) ?? rr.top) - scRect.top, ch = cr.height || 20, pad = Math.max(8, rel1);
          stk = { top: finTop, rel1, ch, minY: headH + pad, maxY: scRect.height - footH - pad - ch };
        }
        const it = { el: c, g: keep ? g : null, stk, y0: 0, op0: seen ? wc.cop : 0, op1: keep ? 1 : 0, d, dur: DUR, e: easeOpen, unmgTd: !g && td.classList.contains("sn-mg-y") ? td : null };
        const tg = it.g ? spanOff(vs, it.g, it.stk) : 0; it.y0 = seen ? (wc.cy - was.y) - rel1 : tg;
        if (it.unmgTd && it.y0 <= 4) { it.unmgTd.classList.remove("sn-mg-y"); it.unmgTd = null; }
        if (Math.abs(it.y0) > .05 || Math.abs(tg) > .05 || it.op0 < 1 || it.op1 < 1) items.push(it);
        // 只要内容在起点或终点伸出本行范围（含大合并块收成单行），所在行必须压在合并块其他行上方，防止被下方的 leaving 行横劈腰斩
        if (((it.g && it.g.b - it.g.a > 1) || Math.abs(it.y0) > .5 || Math.abs(tg) > .5) && !tops.includes(r)) { r.classList.add("sn-mg-top"); tops.push(r); }
      }
    });
    for (const r of gone) for (const k of MK) { const td = cellOf(r, k), wc = m.get(r)?.mc?.[k]; if (!td || !wc?.reg) continue; const c = td.firstElementChild; if (c && (wc.cy == null || wc.cop < .5)) items.push({ el: c, g: null, y0: 0, op0: 0, op1: 0, d: 0, dur: DUR, e: easeOpen }); } /* 要藏的行原来在合并块里：过渡中不显示自己的那一份 */
    if (!items.length && !clips.length && !hAnim) { for (const r of gone) { r.hidden = true; r.classList.remove("leaving"); } applyMerge(vs, regs); return; }
    lay = { items, clips, tops, movers, gone, mv, hAnim, vs, regs, t0: performance.now(), raf: 0 };
    if (hAnim) { wrap.style.height = hAnim.h0 + "px"; if (hAnim.sc) scEl.style.height = hAnim.sc.h0 + "px"; }
    paintLay(lay, lay.t0); lay.raf = requestAnimationFrame(tickLay); // 起点这一帧就画好
  }
  function paintLay(l, now) {
    const tg = l.items.map((it) => (it.g ? spanOff(l.vs, it.g, it.stk) : 0)); let busy = false; // 先读（行高），再写
    l.items.forEach((it, j) => {
      const p = Math.max(0, Math.min(1, (now - l.t0 - it.d) / it.dur)); if (p < 1) busy = true;
      const e = it.e(p), y = it.row ? it.y0 + (it.y1 - it.y0) * e : it.y0 + (tg[j] - it.y0) * e, op = it.op0 + (it.op1 - it.op0) * (it.op1 < it.op0 ? Math.min(1, p / .6) : e);
      if (it.row && l.mv?.has(it.el)) l.mv.get(it.el).cur = y;
      if (it.unmgTd && y <= 4) { it.unmgTd.classList.remove("sn-mg-y"); it.unmgTd = null; }
      it.el.style.translate = Math.abs(y) < .05 ? "" : `0 ${y}px`; it.el.style.opacity = op >= .999 ? "" : op.toFixed(3);
    });
    // 新出现 / 要藏的行：跟着上面那一行走；下面那一行（或非吸底合计行）这一帧的顶 - 这一行这一帧的顶 = 还露在外面的高度
    for (const c of l.clips) {
      const y = c.base + (c.anchor ? l.mv.get(c.anchor).cur - c.aRef : 0), top = c.top + y, edge = c.ref ? c.refTop + (l.mv.get(c.ref)?.cur ?? 0) : Infinity, vis = Math.max(0, Math.min(c.h, edge - top));
      c.r.style.translate = Math.abs(y) < .05 ? "" : `0 ${y}px`;
      c.r.style.clipPath = vis >= c.h - .25 ? "" : `inset(0 0 ${(c.h - vis).toFixed(2)}px 0)`;
      if (c.op0 !== c.op1) {
        const out = c.op1 < c.op0, dur = out ? 95 : 185, p = Math.max(0, Math.min(1, (now - l.t0 - c.d) / dur));
        if (p < 1) busy = true;
        const op = out ? c.op0 * (1 - p) * (1 - p) : c.op0 + (c.op1 - c.op0) * easeOut(p);
        if (c.contentOnly) { c.r.style.opacity = ""; if (op >= .999) c.r.style.removeProperty("--sn-row-op"); else c.r.style.setProperty("--sn-row-op", op.toFixed(3)); }
        else { c.r.style.removeProperty("--sn-row-op"); c.r.style.opacity = op >= .999 ? "" : op.toFixed(3); }
      }
    }
    if (l.hAnim) {
      const p = Math.max(0, Math.min(1, (now - l.t0) / 300)); if (p < 1) busy = true;
      const e = easeOpen(p);
      wrap.style.height = (l.hAnim.h0 + (l.hAnim.h1 - l.hAnim.h0) * e).toFixed(2) + "px";
      if (l.hAnim.sc) scEl.style.height = (l.hAnim.sc.h0 + (l.hAnim.sc.h1 - l.hAnim.sc.h0) * e).toFixed(2) + "px";
    }
    return busy;
  }
  function tickLay(now) {
    const l = lay; if (!l) return; l.raf = 0;
    // 动画用自己的钟，每帧最多走 25ms：哪一帧卡了（一下展开几十行、筛选重排），画面照样一小步一小步走，不会一下跳一大截（总时长略长一点）
    const dt = Math.max(0, Math.min(25, now - (l.last ?? l.t0))); l.last = now; l.clock = (l.clock ?? 0) + dt;
    if (paintLay(l, l.t0 + l.clock)) { l.raf = requestAnimationFrame(tickLay); return; }
    // 到位：清掉偏移和裁切、被盖住的行藏起来、真正合并（这一帧画面不变）
    stopLay();
  }
  // 显隐：没筛选时按每一级的展开状态；筛选时显示匹配的节点和它的所有上级，上级默认展开；开启本地分页时只展示当前页范围的顶级行
  const isLocalPage = () => !!pgCfg && pgCfg.local !== false && !(pgCfg.total != null && pgCfg.total > T.top.length);
  function applyVis() {
    const hit = new Map(), test = (nd) => { if (hit.has(nd.key)) return hit.get(nd.key); const v = !q || !!q(nd.row) || nd.kids.some(test); hit.set(nd.key, v); return v; };
    const matchedTop = T.top.filter((nd) => test(nd));
    pgTotalItems = pgCfg ? (isLocalPage() ? matchedTop.length : (pgCfg.total ?? matchedTop.length)) : matchedTop.length;
    let pageTop = null;
    if (isLocalPage()) {
      const pages = Math.max(1, Math.ceil(pgTotalItems / pgSize));
      if (pgPage > pages) pgPage = pages;
      const start = (pgPage - 1) * pgSize;
      pageTop = new Set(matchedTop.slice(start, start + pgSize).map((nd) => nd.key));
    }
    // 精准树形引导线：anc 记录祖先 0..lv-2 后面是否仍有兄弟，直接父层 lv-1 在末项收口于行中 50%，绝不戳穿撞上后面的同级箭头或无关行
    const setTreeGuides = (tr, lv, anc, isLast) => {
      if (!M.T.tree || !M.prim) return;
      const td = cellOf(tr, M.prim); if (!td) return;
      if (lv <= 0) { td.style.removeProperty("--sn-tbg"); return; }
      const segs = [];
      for (let d = 0; d < lv; d++) {
        const x = 3.5 + d * 24;
        if (d === lv - 1) segs.push(`linear-gradient(var(--sn-tree-line),var(--sn-tree-line)) ${x}px 0/1px ${isLast ? "50%" : "100%"} no-repeat`);
        else if (anc[d]) segs.push(`linear-gradient(var(--sn-tree-line),var(--sn-tree-line)) ${x}px 0/1px 100% no-repeat`);
      }
      const bg = segs.length ? segs.join(",") : "none";
      if (td.style.getPropertyValue("--sn-tbg") !== bg) td.style.setProperty("--sn-tbg", bg);
    };
    const walk = (nd, shown, anc, isLast) => {
      const tr = TR.get(nd.key), inPage = !pageTop || nd.lv > 0 || pageTop.has(nd.key), vis = shown && test(nd) && inPage, op = isOpen(nd), kids = nd.kids; tr.hidden = !vis;
      const visKids = vis && op ? kids.filter(test) : [];
      const showKids = visKids.length > 0, detOpen = vis && isDetailOpen(nd), rowOpen = showKids || detOpen;
      tr.classList.toggle("sn-open", rowOpen); tr.classList.toggle("sn-detail-open", detOpen);
      $(".sn-exp", tr)?.setAttribute("aria-expanded", String(rowOpen));
      if (DTR.has(nd.key)) syncDetailRow(nd, detOpen, false);
      if (vis) setTreeGuides(tr, nd.lv, anc, isLast);
      const nextAnc = nd.lv === 0 ? [] : [...anc, !isLast];
      const lastVis = visKids.at(-1);
      for (const k of kids) walk(k, vis && op, nextAnc, k === lastVis);
    };
    const visTop = T.top.filter((nd) => (!pageTop || pageTop.has(nd.key)) && test(nd));
    const lastTop = visTop.at(-1);
    for (const nd of T.top) walk(nd, true, [], nd === lastTop);
    syncFooter();
  }
  // ———— 固定列位置与离边投影 ————
  const syncPinScroll = () => {
    if (!M.hasPin || !scEl) { wrap.classList.remove("sn-pin-scrolled-l", "sn-pin-scrolled-r"); return; }
    const sl = scEl.scrollLeft, max = scEl.scrollWidth - scEl.clientWidth;
    wrap.classList.toggle("sn-pin-scrolled-l", sl > 1);
    wrap.classList.toggle("sn-pin-scrolled-r", max > 1 && sl < max - 1);
  };
  const syncPinned = () => {
    wrap.classList.toggle("sn-has-pin", M.hasPin);
    if (!M.hasPin) { syncPinScroll(); return; }
    const thRow = $(":scope > tr", thead); if (!thRow) return;
    if (thRow.offsetWidth === 0) return; // 隐藏容器里不覆写初始有效偏移，等显露时由 ResizeObserver 精准校准
    const widths = new Map();
    const leadTh = M.hasCk ? $(":scope > th.sn-ck", thRow) : M.hasPick ? $(":scope > th.sn-tbl-pick", thRow) : null;
    const actTh = M.acts ? $(":scope > th.sn-acts", thRow) : null;
    let lx = M.leadPin ? (leadTh?.offsetWidth || (M.hasCk ? 60 : 44)) : 0;
    for (const c of M.dcols) if (M.pinL.has(c.key)) {
      widths.set(c.key, lx);
      const th = $(`th[data-c="${CSS.escape(c.key)}"]`, thRow);
      lx += th?.offsetWidth || CW[c.key] || MINW[c.key] || 120;
    }
    let rx = M.actsPin ? (actTh?.offsetWidth || actsWidthOf(M.acts)) : 0;
    for (let i = M.dcols.length - 1; i >= 0; i--) {
      const c = M.dcols[i]; if (!M.pinR.has(c.key)) continue;
      widths.set(c.key, rx);
      const th = $(`th[data-c="${CSS.escape(c.key)}"]`, thRow);
      rx += th?.offsetWidth || CW[c.key] || MINW[c.key] || 100;
    }
    for (const [k, pxv] of widths) {
      for (const el of $$(`th[data-c="${CSS.escape(k)}"], td[data-c="${CSS.escape(k)}"]`, table)) el.style.setProperty("--sn-pin-x", pxv + "px");
    }
    syncPinScroll();
  };
  // ———— 贴底分页栏（.sn-tbl-foot） ————
  const syncFooter = () => {
    wrap.classList.toggle("sn-has-foot", !!pgCfg);
    if (!pgCfg) { psInst?.dispose(); psInst = null; if (footEl) { footEl.remove(); footEl = null; pgInst = null; } return; }
    const total = pgTotalItems, pages = Math.max(1, Math.ceil(total / pgSize));
    if (pgPage > pages) pgPage = pages;
    if (!footEl) {
      const tmp = document.createElement("div");
      tmp.innerHTML = footHTML({ ...pgCfg, pageSize: pgSize }, total, picked.size);
      footEl = tmp.firstElementChild;
      wrap.append(footEl);
    }
    if (!pgInst) {
      const pagerEl = $(".sn-pager", footEl);
      pgInst = mountPager(pagerEl, {
        total: pages, page: pgPage,
        onChange: (p) => {
          pgPage = p;
          if (isLocalPage()) { relayout(() => { applyVis(); syncEmpty(); }, { instant: true }); syncSel(); if (scEl) scEl.scrollTop = 0; }
          pgCfg.onChange?.({ page: pgPage, pageSize: pgSize });
          fire("pageChange", { page: pgPage, pageSize: pgSize });
        },
      });
      const psEl = $("[data-tbl-ps]", footEl);
      if (psEl) {
        psInst = mountSelect(psEl, {
          onChange: (val) => {
            pgSize = Math.max(1, Number(val) || 10);
            pgPage = 1;
            if (isLocalPage()) { relayout(() => { applyVis(); syncEmpty(); }, { instant: true }); syncSel(); if (scEl) scEl.scrollTop = 0; }
            pgCfg.onChange?.({ page: pgPage, pageSize: pgSize });
            fire("pageChange", { page: pgPage, pageSize: pgSize });
          },
        });
      }
    }
    const tEl = $("[data-tbl-total]", footEl);
    if (tEl) tEl.textContent = tt("table.total", { p0: total });
    let selEl = $(".sn-tbl-foot-sel", footEl);
    if (picked.size > 0) {
      if (!selEl) { selEl = document.createElement("span"); selEl.className = "sn-tbl-foot-sel"; tEl?.after(selEl); }
      selEl.textContent = "· " + tt("table.selected", { p0: picked.size });
    } else selEl?.remove();
    if (psInst && Number(psInst.value) !== pgSize) psInst.set(String(pgSize));
    if (pgInst) { pgInst.setTotal(pages); if (pgInst.page !== pgPage) pgInst.go(pgPage, true); }
  };
  // 空：第一级一行都看不见时显示空状态那一行（筛选的结果也在同一次变化里：外框高度一起过渡）
  const syncEmpty = () => { if (!emptyRow) return; const none = T.top.every((nd) => TR.get(nd.key).hidden); emptyRow.hidden = !none; if (none) emptyRow.firstElementChild.innerHTML = emptyInner(o, !!q); };
  // 按树的顺序（同级按现在的顺序）重新摆每一行（行详情紧贴在所属行正下方）
  const placeTree = () => walkAll(T.top, (nd) => {
    const tr = TR.get(nd.key); if (!tr) return;
    tbody.insertBefore(tr, emptyRow);
    const dtr = DTR.get(nd.key); if (dtr) tbody.insertBefore(dtr, emptyRow);
  });
  const block = (r) => [r, ...(DTR.has(r.dataset.id) ? [DTR.get(r.dataset.id)] : []), ...descTrs(r)];

  // ———— 排序：点表头；同一列再点换方向，第一次按列的 sortFirst（默认升序） ————
  const sortHead = (b) => {
    $$(".sn-sort", thead).forEach((x) => x.classList.toggle("sn-on", x === b)); b.classList.toggle("sn-desc", dir < 0);
    b.closest("th").setAttribute("aria-sort", dir > 0 ? "ascending" : "descending");
  };
  // 程序里改排序（受控的 sort）：表头只标当前这一列
  const headSync = () => { for (const b of $$(".sn-sort", thead)) { const on = sortKey === b.dataset.k, th = b.closest("th"); b.classList.toggle("sn-on", on); b.classList.toggle("sn-desc", on && dir < 0); if (on) th.setAttribute("aria-sort", dir > 0 ? "ascending" : "descending"); else th.removeAttribute("aria-sort"); } };
  const sortNow = () => { if (!sortKey || o.sortLocal === false) return; sortTree(T.top, nodeCmp(colOf(sortKey), dir)); relayout(() => { placeTree(); if (isLocalPage()) applyVis(); }, { stagger: 15 }); };
  const onHeadClick = (e) => {
    const b = e.target.closest(".sn-sort"); if (!b || !thead.contains(b)) return;
    dragNow?.flush(); const k = b.dataset.k; dir = sortKey === k ? -dir : (colOf(k)?.sortFirst === "desc" ? -1 : 1); sortKey = k;
    sortHead(b); fire("sort", { key: k, dir: dir > 0 ? "asc" : "desc" }); sortNow();
  };

  // ———— 展开收起（多级树 / 行详情）：树形走 relayout 推合动画；纯行详情走顺滑 Grid 展开收起，连点不断档 ————
  const isRowExpanded = (nd) => !!nd && ((nd.kids.length > 0 && isOpen(nd)) || isDetailOpen(nd));
  function setOpen(list, want, user) {
    list = list.filter((r) => {
      if (!r) return false;
      const nd = nodeOf(r);
      return !!nd && (nd.kids.length > 0 || DTR.has(nd.key)) && isRowExpanded(nd) !== want;
    });
    if (!list.length) return;
    dragNow?.flush();
    let needTree = false;
    for (const r of list) {
      const nd = nodeOf(r);
      if (q) qOpen.set(nd.key, want); else if (want) open.add(nd.key); else open.delete(nd.key);
      r.classList.toggle("sn-open", want); $(".sn-exp", r)?.setAttribute("aria-expanded", String(want));
      if (nd.kids.length) needTree = true;
      else if (DTR.has(nd.key)) syncDetailRow(nd, want, true);
    }
    if (needTree) relayout(applyVis); /* 展开：下面的行滑开，下级被"推开"露出来；收起：下面的行滑上来把下级盖住，盖完再藏 */
    else saInst?.refresh();
    if (user) fire("expandChange", { keys: [...open], key: nodeOf(list[0]).key, expanded: want });
  }
  const parents = () => [...T.nodes.values()].filter((nd) => nd.kids.length || DTR.has(nd.key));

  // ———— 勾选：上下级联动——勾一个节点 = 它下面所有级一起勾；上级的状态由下级算：全勾了是勾、勾了一部分是半选 ————
  function pick(nd, on) { walkAll([nd], (x) => (on ? picked.add(x.key) : picked.delete(x.key))); for (let p = nd.parent; p; p = p.parent) { if (p.kids.every((k) => picked.has(k.key))) picked.add(p.key); else picked.delete(p.key); } }
  const mixed = (nd) => !picked.has(nd.key) && nd.kids.some((k) => picked.has(k.key) || mixed(k));
  function syncSel() {
    for (const [id, tr] of TR) { const nd = T.nodes.get(id), inp = $("input", tr), on = picked.has(id); if (inp?.type === "checkbox") { inp.checked = on; inp.indeterminate = mixed(nd); } tr.classList.toggle("sn-sel", on); }
    if (all) { const tops = T.top.filter((nd) => !TR.get(nd.key)?.hidden); all.checked = tops.length > 0 && tops.every((nd) => picked.has(nd.key)); all.indeterminate = !all.checked && (picked.size > 0); }
    if (pgCfg) syncFooter();
  }
  const onChange = (e) => {
    const i = e.target; if (i?.tagName !== "INPUT" || i.type !== "checkbox" || !table.contains(i)) return;
    if (i === all) { for (const nd of T.top) { const r = TR.get(nd.key); if (r && !r.hidden) pick(nd, all.checked); } } else { const tr = i.closest("tr"); if (tr?.dataset.id && T.nodes.has(tr.dataset.id)) pick(nodeOf(tr), i.checked); else return; }
    syncSel(); fire("select", [...picked]);
  };

  // ———— 选中、改名、键盘（cellSelect）：单格修改框选只出现在可文字编辑（editable）单元格上；选择器与只读格不画框选（键盘巡航时仅铺极淡中性定位底色）；点表头、把手、勾选框、展开、内部控件收起 ————
  const isTextEdTd = (td) => Boolean(td && colOf(td.dataset.c)?.editable);
  const INTERACTIVE = "a,button,input,textarea,select,label,[role=button],[role=combobox],[role=switch],[role=checkbox],[contenteditable],.sn-select,.sn-switch,.sn-check,.sn-radio,.sn-btn,.sn-link";
  let kbdNav = false;
  const syncTdBox = (on, kbd = false) => {
    const ed = !!on && isTextEdTd(selTd);
    wrap.classList.toggle("sn-sel-on", ed);
    wrap.classList.toggle("sn-kbd-on", !!on && kbd && !!selTd && !ed);
  };
  const selectTd = (td, kbd = false) => {
    kbdNav = !!td && kbd;
    if (selTd !== td) { selTd?.classList.remove("sn-on"); selTd = td; td?.classList.add("sn-on"); }
    syncTdBox(!!td, kbdNav);
  };
  const dataTd = (t) => { const td = t.closest("td"); return td && td.dataset.c ? td : null; };
  const hideSel = () => { kbdNav = false; if (o.cellSelect) { wrap.classList.remove("sn-sel-on", "sn-kbd-on"); } }; /* 点表头、把手、勾选框、展开箭头、操作：只收起提示态，选中的格子还记着（方向键从它接着走） */
  const onBodyDown = (e) => {
    if (e.button !== 0 || (editing && e.target === editing)) return; // 点在改名的输入框里：只是挪光标
    if (editing) editing.blur(); // 先把正在改的存下来——这一下照样拖得起来、选得中，不用多点一次
    dragNow?.flush(); const tr = e.target.closest("tr"); if (!tr || tr.classList.contains("sn-tbl-empty") || !tr.dataset.id) return;
    if (o.resizableRows && e.target.closest(".sn-g-rh")) { hideSel(); startRowResize(tr, e); return; }
    if (o.draggableRows && e.target.closest(".sn-grip")) { hideSel(); startRowDrag(tr, e); return; }
    if (e.target.closest(".sn-exp")) { e.preventDefault(); hideSel(); setOpen([tr], !isRowExpanded(nodeOf(tr)), true); return; }
    if (e.target.closest(INTERACTIVE)) { hideSel(); return; } // 单元格内嵌选择器、按钮、开关、链接：绝不拦截也不画框选
    if (!o.cellSelect) return;
    const td = dataTd(e.target); if (!td) { hideSel(); return; }
    e.preventDefault(); table.focus({ preventScroll: true }); selectTd(td, false);
  };
  const onBodyClick = (e) => { const b = e.target.closest(".sn-exp"); if (b && e.detail === 0) { const tr = b.closest("tr"); setOpen([tr], !isRowExpanded(nodeOf(tr)), true); } }; /* 键盘（Enter、空格）按展开 */
  const onBodyDbl = (e) => {
    const rh = e.target.closest(".sn-g-rh"); if (rh && o.resizableRows) { const tr = rh.closest("tr"); tr.style.removeProperty("--sn-rh"); fire("rowResize", { key: tr.dataset.id, height: null }); return; }
    if (e.target.closest(INTERACTIVE)) return;
    const td = dataTd(e.target); if (td && colOf(td.dataset.c)?.editable && td.closest("tr[data-id]") && !e.target.closest(".sn-exp")) { if (o.cellSelect) selectTd(td, false); rename(td); }
  };
  // 一格的内容重新画一遍（改完以后、这一行的数据换了）：树形主列只换展开箭头后面的部分；正在改的输入框留着
  const indexOf = (nd) => { let i = 0, at = -1; walkAll(T.top, (x) => { if (x === nd) at = i; i++; }); return at; };
  // 一段标记换成新的：结构一样就只改变了的文字和属性（不重建节点：选中、焦点、过渡都留着；改名时和原来一样只换那一段字），不一样才整段换。
  // skip：前面留着不动的几个（树形那一列的展开箭头）；正在改的输入框一直留着
  function morph(box, html, skip = 0) {
    const tmp = document.createElement("div"); tmp.innerHTML = html;
    const own = (n) => !(n.nodeType === 1 && n.classList.contains("sn-cell-ed")), all = [...box.childNodes];
    const cur = all.slice(skip).filter(own), nxt = [...tmp.childNodes];
    const same = (a, b) => a.length === b.length && a.every((n, i) => n.nodeType === b[i].nodeType && (n.nodeType !== 1 || (n.tagName === b[i].tagName && same([...n.childNodes], [...b[i].childNodes]))));
    if (!same(cur, nxt)) { box.replaceChildren(...all.slice(0, skip), ...nxt, ...all.filter((n) => !own(n))); return; }
    const patch = (a, b) => {
      if (a.nodeType === 3) { if (a.data !== b.data) a.replaceWith(document.createTextNode(b.data)); return; }
      if (a.nodeType !== 1) return;
      for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
      for (const at of [...b.attributes]) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
      const bc = [...b.childNodes]; [...a.childNodes].forEach((n, i) => patch(n, bc[i]));
    };
    cur.forEach((n, i) => patch(n, nxt[i]));
  }
  function fillCell(td, c, nd, i = indexOf(nd)) {
    if (typeof c.render === "function") { paintCell(td, c, nd, i); return; }
    const h = cellInner(c, nd, i, "merge" in c && !c.html);
    if (M.hasExp && c.key === M.prim) morph($(":scope > .sn-name", td), h, 1); else morph(td, h);
  }
  function refreshRow(tr, nd, i) {
    const lead = M.hasCk || M.hasPick ? 1 : 0;
    M.dcols.forEach((c, j) => { const td = M.useDataC ? cellOf(tr, c.key) : tr.children[lead + j]; if (td) fillCell(td, c, nd, i); });
    if (M.acts) { const td = $(":scope > td.sn-acts", tr); if (td) fillCell(td, M.acts, nd, i); }
    const inp = $(".sn-check input", tr), name = String(nd.row?.[M.prim] ?? ""), l = name ? tt("table.pickRow", { p0: name }) : tt("table.pick");
    if (inp && inp.getAttribute("aria-label") !== l) inp.setAttribute("aria-label", l);
  }
  function rename(td) {
    const r = td.closest("tr"), nd = nodeOf(r), k = td.dataset.c, inp = document.createElement("input"); inp.className = "sn-cell-ed"; inp.value = String(nd.row?.[k] ?? ""); inp.spellcheck = false; td.append(inp); td.classList.add("sn-editing"); wrap.classList.remove("sn-sel-on", "sn-kbd-on"); inp.focus(); inp.select(); editing = inp;
    const end = (save, refocus = true) => {
      if (editing !== inp) return; editing = null; const v = inp.value.trim(), old = nd.row?.[k];
      if (save && v && v !== String(old ?? "")) { const val = typeof old === "number" && !isNaN(+v) ? +v : v; if (nd.row) nd.row[k] = val; fillCell(td, colOf(k), nd); SIG.set(nd.key, sigOf(nd, indexOf(nd))); fire("cellEdit", { row: nd.row, key: k, value: val, oldValue: old }); }
      inp.remove(); td.classList.remove("sn-editing");
      if (refocus) { table.focus({ preventScroll: true }); if (o.cellSelect) syncTdBox(true, kbdNav); }
    };
    inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); end(true, true); } else if (e.key === "Escape") { e.preventDefault(); end(false, true); } });
    inp.addEventListener("blur", () => end(true, false));
  }
  const onKey = (e) => {
    if (editing) return;
    if (!selTd) { if (/^Arrow|^Enter$/.test(e.key)) { const r = visRows()[0]; if (r) { e.preventDefault(); selectTd(cellOf(r, M.prim), true); } } return; } /* 用 Tab 进来还没选中格子：方向键先选中第一格 */ const vs = visRows(), tr = selTd.closest("tr"), ri = vs.indexOf(tr), keys = order, ci = keys.indexOf(selTd.dataset.c);
    const at = (i, k) => { const row = vs[Math.max(0, Math.min(vs.length - 1, i))]; let td = cellOf(row, k); if (td?.hidden) { for (let j = vs.indexOf(row) - 1; j >= 0 && td.hidden; j--) td = cellOf(vs[j], k); } return td; }; // 落在被合并藏起来的格子上，就选合并的那一格
    const go = (td) => { if (td) { e.preventDefault(); selectTd(td, true); } };
    if (M.hasExp && selTd.dataset.c === M.prim && tr.dataset.id && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const nd = nodeOf(tr), has = nd.kids.length > 0 || DTR.has(nd.key), op = has && isRowExpanded(nd);
      if (e.key === "ArrowRight" && has && !op) { e.preventDefault(); setOpen([tr], true, true); return; }
      if (e.key === "ArrowLeft" && op) { e.preventDefault(); setOpen([tr], false, true); return; }
      if (e.key === "ArrowLeft" && nd.parent) { go(cellOf(TR.get(nd.parent.key), M.prim)); return; }
    }
    if (e.key === "ArrowDown") go(at(ri + (selTd.rowSpan || 1), keys[ci])); else if (e.key === "ArrowUp") go(at(ri - 1, keys[ci]));
    else if (e.key === "ArrowRight") go(at(ri, keys[Math.min(keys.length - 1, ci + 1)])); else if (e.key === "ArrowLeft") go(at(ri, keys[Math.max(0, ci - 1)]));
    else if (e.key === "Enter" && colOf(selTd.dataset.c)?.editable && tr.dataset.id) { e.preventDefault(); rename(selTd); }
    else if (e.key === "Escape") { e.preventDefault(); selectTd(null, false); }
  };
  const onFocusOut = (e) => { if (!table.contains(e.relatedTarget)) { kbdNav = false; wrap.classList.remove("sn-sel-on", "sn-kbd-on"); } };
  const onFocusIn = () => { if (selTd && !editing) syncTdBox(true, kbdNav); };

  // ———— 拖行换位置（跟手）：被拖的行连同展开的下级浮起来（一层投影），一比一跟着指针上下走；其他行逐帧缓动让开，让出来的空位就是落点 ————
  // 松手：从指针那里缓动落进空位，投影同时淡掉，再真正换顺序；拖到表格外 40px 以外 = 拿出去了（变淡、其他行回原位、空位回到原处），松手就回原处；Esc、失焦也回原处。
  // 指针靠近窗口上下边时页面跟着滚，拖着时滚页面落点也跟着算；松手后还在落位时又去点别的，先把这一次落好
  function startRowDrag(pr, e) {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, grip = e.target.closest(".sn-grip");
    let on = false, done = false, out = false, to = 0, px = sx, py = sy, raf = 0, gap = null, gap2 = null, box = null, blocks = [], idx = 0, H = 0, total = 0, top0 = 0, lt = 0, was = false, tb0 = 0, g0 = 0, ended = false, gapY = 0, lift = 0, tDone = 0, fo = 0;
    const off = new Map(), onScroll = () => { if (on && !ended && !raf) raf = requestAnimationFrame(frame); };
    // 这一组兄弟的上级可能还在过渡里滑（排序、展开刚开始就拿起）：整组按"相对上级"的位置算，画的时候加上上级这一帧的位移 fo，整组跟着上级走，不会一下跳到最后的位置
    const par = nodeOf(pr).parent ? TR.get(nodeOf(pr).parent.key) : null, parFo = () => (par ? par.getBoundingClientRect().top - table.getBoundingClientRect().top - par.offsetTop : 0);
    const place = (b, c) => { const y = c + fo; for (const t of b.trs) t.style.transform = Math.abs(y) > .01 ? `translateY(${y}px)` : ""; };
    // 被拖的块现在的顶部（按表格自己的坐标）：拿起的位置 + 指针移动 + 页面滚动；夹在这一组兄弟的首尾之内（不盖到表头上、不跑出这一组）
    const follow = (tb) => Math.max(top0, Math.min(top0 + total - H, g0 + (py - tb.top) - (sy - tb0) - fo)); /* 相对上级：上级还在滑时，跟手的位置减掉上级这一帧的位移 */
    const begin = () => {
      on = true; table.focus({ preventScroll: true }); // 焦点回到表格：拖着时打字不会去改别的输入框
      if (sortKey) { sortKey = null; $$(".sn-sort", thead).forEach((x) => x.classList.remove("sn-on", "sn-desc")); $$("th[aria-sort]", thead).forEach((x) => x.removeAttribute("aria-sort")); fire("sort", null); } // 拖了就是手动顺序
      const vis = new Map(rowsOf().filter((r) => !r.hidden).map((r) => [r, r.getBoundingClientRect().top]));
      const sibs = (nodeOf(pr).parent ? nodeOf(pr).parent.kids : T.top).map((nd) => TR.get(nd.key)).filter((r) => !r.hidden), heads = new Map(); /* 同一个上级下面的兄弟：每个连同看得见的下级是一块 */
      for (const r of sibs) for (const t of block(r)) heads.set(t, r);
      relayout(() => {}, { split: true, rows: false, managed: heads, head: (r) => heads.get(r) ?? r }); // 拖的时候先不合并（各格各自显示，内容滑回自己那一行），松手再合；这一组以外还在过渡的行接着滑，不跳
      const tb = tbody.getBoundingClientRect(); tb0 = tb.top; fo = parFo();
      blocks = sibs.map((r) => { const trs = block(r).filter((x) => !x.hidden), a = trs[0].getBoundingClientRect(), z = trs.at(-1).getBoundingClientRect(); return { r, trs, top: a.top - tb.top, h: z.bottom - a.top, v: (vis.get(trs[0]) ?? a.top) - a.top - fo }; }); /* v：除去上级的位移以后，这一块离它最后的位置还差多少 */
      blocks.forEach((b, j) => { if (Math.abs(b.v) > .3) { off.set(j, b.v); place(b, b.v); } }); // 刚排过序、刚展开：从现在看到的位置接着走（off 是这点剩下的位移，逐帧缓动到 0；让位另外按空位摆）
      idx = blocks.findIndex((b) => b.r === pr); H = blocks[idx].h; total = blocks.reduce((t, b) => t + b.h, 0); top0 = blocks[0].top; to = idx; lift = off.get(idx) ?? 0; g0 = blocks[idx].top + lift + fo; gapY = g0 - fo; /* 拿起时它在哪（行可能还在滑）；空位也从看得见的位置开始；top0：这一组兄弟从哪开始 */
      hull = [[gapY, H], [gapY + H, 0]];
      gap = document.createElement("i"); gap.className = "sn-tbl-gap"; gap2 = document.createElement("i"); gap2.className = "sn-tbl-gap"; wrap.prepend(gap, gap2); // 放在表格前面：滑过的行盖在空位上面；第二截只在有一块正越过空位时有高度
      box = document.createElement("i"); box.className = "sn-tbl-lift"; wrap.append(box);
      wrap.classList.add("rowdrag"); blocks[idx].trs.forEach((t) => t.classList.add("sn-lift"));
      dragNow = { flush: () => { if (!done) fin(true); finish(); } };
      addEventListener("scroll", onScroll, { passive: true, capture: true });
      paint(tb, wrap.getBoundingClientRect()); raf = requestAnimationFrame(frame);
    };
    // 落点：被拖的块放进哪个空位时，它的顶部离现在最近（和两张数据表格同一个算法；各块高度不一样也对）；离现在的落点差不到 4px 不换，停在两个空位正中间时不来回跳
    const target = (top) => { let y = top0, k = 0, best = 0, bd = Math.abs(top - y), cur = Infinity; if (to === 0) cur = bd; for (let j = 0; j < blocks.length; j++) { if (j === idx) continue; y += blocks[j].h; k++; const d = Math.abs(top - y); if (k === to) cur = d; if (d < bd) { bd = d; best = k; } } return best !== to && bd > cur - 4 ? to : best; };
    const slotTop = (t) => { let y = top0, k = 0; for (let j = 0; j < blocks.length && k < t; j++) { if (j === idx) continue; y += blocks[j].h; k++; } return y; };
    // 空位这会儿正越过哪一块（按去掉被拖那块以后的排法）：它的高度决定空位这一帧最多走多远
    const rangeAt = (G) => { let y = top0, last = [top0, H]; for (let j = 0; j < blocks.length; j++) { if (j === idx) continue; last = [y, blocks[j].h]; if (G < y + blocks[j].h) return last; y += blocks[j].h; } return last; };
    const hAt = (G) => rangeAt(G)[1];
    let hull = [[0, 0], [0, 0]]; const gOrder = gapOrder(); /* 这一帧空位画成的一截或两截（gapPieces），按上一帧分给两个元素 */
    function paint(tb, w) {
      const b = blocks[idx], y0 = tb.top - w.top; place(b, lift);
      // 缩没了的那截藏起来、停在原处（看不见的元素不来回挪）。快拖时一截刚被盖没、另一处又露出一截新的，是两回事：照常画
      [gap, gap2].forEach((el, i) => { const [t, hh] = hull[i]; if (hh <= .5) { el.style.visibility = "hidden"; return; } el.style.top = y0 + t + fo + "px"; el.style.height = hh + "px"; el.style.visibility = ""; });
      box.style.top = y0 + b.top + lift + fo + "px"; box.style.height = H + "px";
      const fade = out && !done; box.classList.toggle("sn-out", fade); for (const t of b.trs) t.classList.toggle("sn-out", fade);
    }
    function frame(now) {
      raf = 0; if (!on || ended) return; const dt = was ? Math.min(34, now - lt) : 16.7; lt = now; was = false; const k = 1 - Math.exp(-dt / 40);
      const w = wrap.getBoundingClientRect(), tb = tbody.getBoundingClientRect(); out = px < w.left - 40 || px > w.right + 40 || py < w.top - 40 || py > w.bottom + 40;
      if (!done && !out) { const E = 56, sp = py < E ? -(E - py) / 2.5 : py > innerHeight - E ? (py - innerHeight + E) / 2.5 : 0; if ((sp < 0 && w.top < 0) || (sp > 0 && w.bottom > innerHeight)) scrollBy({ top: Math.max(-24, Math.min(24, sp)), behavior: "instant" }); } // 靠近窗口上下边：页面跟着滚
      const back = out || done === "cancel", ease = (c, tg) => { c += (tg - c) * k; if (Math.abs(tg - c) < .3) return tg; was = true; return c; };
      fo = parFo(); if (Math.abs(fo) > .3) was = true; /* 上级还在滑：接着画下一帧 */
      if (!done) to = out ? idx : target(follow(tb)); // 按表格自己的位置算：拖着时页面滚了也对
      // 只有空位一个值在走（每帧有上限：越过一块至少 2.5 帧），别的块都按空位摆（slotShift）：块和块之间永远是挨着的，快拖时不会露出空白条
      const gt = back ? blocks[idx].top : slotTop(to), g1 = gapStep(gapY, gt, k, dt, hAt(gapY)); if (g1 !== gt) was = true; gapY = g1;
      blocks.forEach((b, j) => { if (j === idx) return; const r = ease(off.get(j) ?? 0, 0); off.set(j, r); place(b, slotShift(b.top, b.h, j < idx, H, gapY) + r); });
      // 空位画多大：有一块正从空位上越过时，空位被它分成上下两截——两截连同它画成一个框（它压在框上面），不露出没有底色的空白条
      hull = gOrder(gapPieces(gapY, H, rangeAt(gapY)));
      lift = done ? ease(lift, back ? 0 : slotTop(to) - blocks[idx].top) : follow(tb) - blocks[idx].top; // 跟手；松手后缓动落进空位
      paint(tb, w);
      if (done && !was && now - tDone >= 160) return finish(); raf = requestAnimationFrame(frame); // 投影淡掉（160ms）以后再真正换顺序
    }
    function finish() {
      if (ended) return; ended = true; cancelAnimationFrame(raf); raf = 0; dragNow = null; removeEventListener("scroll", onScroll, true);
      const b = blocks[idx]; b.trs.forEach((t) => t.classList.remove("sn-lift", "sn-out")); gap.remove(); gap2.remove(); box.remove(); wrap.classList.remove("rowdrag");
      let moved = null;
      fo = 0; relayout(() => { for (const x of blocks) place(x, 0); /* 先量好现在看到的位置（含上级的位移），再把位移全清掉，由过渡接着走 */ if (to !== idx && done !== "cancel") { const nd = nodeOf(b.r), list = nd.parent ? nd.parent.kids : T.top, others = blocks.filter((_, j) => j !== idx).map((x) => nodeOf(x.r)), from = list.indexOf(nd); list.splice(from, 1); if (to < others.length) list.splice(list.indexOf(others[to]), 0, nd); else list.splice(list.indexOf(others.at(-1)) + 1, 0, nd); placeTree(); moved = { key: nd.key, parentKey: nd.parent?.key ?? null, from, to: list.indexOf(nd), keys: list.map((x) => x.key) }; } }); /* 松手：改树里的顺序，再按树摆好每一行；从现在的样子接着过渡（合并块内容滑回正中） */
      if (moved) fire("rowReorder", moved);
    }
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fin(true); } }, onBlur = () => fin(true);
    const evs = [["pointermove", (ev) => { px = ev.clientX; py = ev.clientY; if (!on) { if (Math.hypot(px - sx, py - sy) < 4) return; begin(); } if (!raf) raf = requestAnimationFrame(frame); }], ["pointerup", () => fin(false)], ["pointercancel", () => fin(true)], ["lostpointercapture", () => fin(true)]];
    try { grip.setPointerCapture(e.pointerId); } catch {}
    for (const [t, f] of evs) grip.addEventListener(t, f); document.addEventListener("keydown", onKey, true); addEventListener("blur", onBlur);
    function fin(cancel) {
      if (done) return; for (const [t, f] of evs) grip.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", onBlur);
      if (!on) { done = true; return; } done = cancel || out ? "cancel" : "drop"; if (done === "cancel") to = idx; tDone = performance.now(); box.classList.add("sn-settle");
      if (reduced()) { finish(); return; } if (!raf) raf = requestAnimationFrame(frame);
    }
  }

  // ———— 列：改宽、换位置（和数据表格同一套手感）：拖表头右边缘改宽（一条竖的参考线 + "列宽 N"，Esc 恢复，双击按内容定宽）；
  // 按住表头移动 4px 拖列（表头影子跟着指针、空位标出放下的位置、拖到表格外 40px 松手取消），只点一下就是排序。
  const applyW = () => { for (const c of $$(":scope > colgroup > col[data-c]", table)) c.style.width = CW[c.dataset.c] ? CW[c.dataset.c] + "px" : ""; table.style.minWidth = minWidthOf(M, CW, MINW) + "px"; };
  const thOf = (k) => $(`:scope > tr > th[data-c="${CSS.escape(k)}"]`, thead), cellsOf = (k) => $$(`th[data-c="${CSS.escape(k)}"], td[data-c="${CSS.escape(k)}"]`, table);
  function applyOrder() { // 每一行（表头、各行、合计）的格子按 order 重新摆，列宽跟着
    for (const tr of table.querySelectorAll("tr")) { if (tr.classList.contains("sn-tbl-empty") || tr.classList.contains("sn-tbl-detail")) continue; const end = M.acts ? tr.lastElementChild : null; for (const k of order) { const c = tr.querySelector(`:scope > [data-c="${CSS.escape(k)}"]`); if (c) tr.insertBefore(c, end); } }
    const cg = $(":scope > colgroup", table); if (cg) { const end = M.acts ? cg.lastElementChild : null; for (const k of order) { const c = $(`col[data-c="${CSS.escape(k)}"]`, cg); if (c) cg.insertBefore(c, end); } }
  }
  if (M.useCols) applyW();
  // 宽度不跟着指针变的时候（Esc 恢复、双击按内容定宽）：从现在的宽度滑过去；又按下表头就停在当前宽度
  let stopCW = null;
  const glideCW = (to, done) => { stopCW?.(); stopCW = null; const from = {}; for (const k in to) from[k] = CW[k]; if (reduced()) { Object.assign(CW, to); applyW(); done?.(); return; } stopCW = tween(from, to, (cur, end) => { for (const k in cur) CW[k] = Math.round(cur[k]); applyW(); if (end) { stopCW = null; done?.(); } }); };
  const resized = (k) => fire("columnResize", { key: k, width: CW[k] || Math.round(thOf(k).getBoundingClientRect().width), widths: Object.fromEntries(Object.entries(CW).filter(([, w]) => w)) });
  function startColResize(th, e) {
    e.preventDefault(); e.stopPropagation();
    const A = th.dataset.c, B = order[order.indexOf(A) + 1]; if (!B) return;
    const w0 = { ...CW }, aw0 = th.getBoundingClientRect().width, bw0 = thOf(B).getBoundingClientRect().width, x0 = e.clientX, el = e.target, line = document.createElement("i"); line.className = "sn-g-rzline"; wrap.append(line); wrap.classList.add("sn-resizing"); let done = false, moved = false;
    const place = () => { const w = wrap.getBoundingClientRect(), r = thOf(A).getBoundingClientRect(); line.style.left = r.right - w.left - 1 + "px"; line.style.height = table.offsetHeight + "px"; line.dataset.w = tt("table.colWidth", { p0: Math.round(r.width) }); line.classList.toggle("sn-flip", r.right > w.right - 120); };
    // 拖边线 = 把这条边线挪过去：左边那列宽多少，右边那列就窄多少（弹性列自己补）；两边都不小于最窄
    const set = (d) => { d = Math.max(-(aw0 - MINW[A]), Math.min(bw0 - MINW[B], d)); if (!FLEX.has(A)) CW[A] = Math.round(aw0 + d); if (!FLEX.has(B)) CW[B] = Math.round(bw0 - d); applyW(); place(); };
    place(); try { el.setPointerCapture(e.pointerId); } catch {}
    const mv = (ev) => { moved = true; set(ev.clientX - x0); };
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); moved = false; fin(); glideCW(w0); } }; /* 参考线收起，宽度滑回原来的 */
    const fin = () => { if (done) return; done = true; for (const [t, f] of evs) el.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", fin); line.remove(); wrap.classList.remove("sn-resizing"); if (moved) resized(A); };
    const evs = [["pointermove", mv], ["pointerup", fin], ["pointercancel", fin], ["lostpointercapture", fin]];
    for (const [t, f] of evs) el.addEventListener(t, f); document.addEventListener("keydown", onKey, true); addEventListener("blur", fin);
  }
  // 双击表头右边缘：按这一列的内容定宽（表头和看得见的每一格里，内容本来要多宽 + 左右内边距，取最宽的那个；能变宽也能变窄）
  function autoFit(th) {
    const A = th.dataset.c, B = order[order.indexOf(A) + 1]; if (!B || FLEX.has(A)) return;
    let need = 0; for (const c of cellsOf(A)) { if (c.hidden || c.closest("tr").hidden) continue; const s = getComputedStyle(c); need = Math.max(need, contentW(c.firstElementChild ?? c) + parseFloat(s.paddingLeft) + parseFloat(s.paddingRight)); }
    const aw0 = th.getBoundingClientRect().width, bw0 = thOf(B).getBoundingClientRect().width, d = Math.max(-(aw0 - MINW[A]), Math.min(bw0 - MINW[B], Math.ceil(need) - aw0)); const to = {}; if (!FLEX.has(A)) to[A] = Math.round(aw0 + d); if (!FLEX.has(B)) to[B] = Math.round(bw0 - d); glideCW(to, () => resized(A));
  }
  // 换列的顺序：格子直接换到新位置；colOff 记着每一列"从看到的位置滑回 0"还剩多少，被拖那一列留下的空位按它摆。
  // （格子本身不加位移：和改造前一样——原来写进样式表的格子位移用的选择器 #tbl>.sn-tbl 没对上过，格子从来是直接换位的）
  const colOff = new Map(), lx = new Map(); /* colOff：列 → 从 x0 滑回 0；lx：列现在排版上的左边（相对外框） */
  let slotPaint = null, colRaf = 0;
  const COL_DUR = 220, offNow = (c, now) => { const v = colOff.get(c); return v ? v.x0 * (1 - EASE.outStrong(Math.min(1, (now - v.t0) / COL_DUR))) : 0; };
  function colPaint() {
    colRaf = 0; const now = performance.now(); let more = false;
    for (const [c, v] of colOff) { if (now - v.t0 >= COL_DUR) { colOff.delete(c); continue; } more = true; }
    slotPaint?.(now);
    if (more) colRaf = requestAnimationFrame(colPaint);
  }
  const colPaintNow = () => { cancelAnimationFrame(colRaf); colPaint(); }; /* 状态一变当场写好：同一帧里先画的旧位移不会配上新顺序 */
  function moveCols(next) {
    if (next.join() === order.join()) return;
    const now = performance.now(), l0 = new Map(order.map((c) => [c, thOf(c).offsetLeft]));
    order.splice(0, order.length, ...next); applyOrder(); M = modelOf(o, cur()); for (const c of order) lx.set(c, thOf(c).offsetLeft);
    if (reduced()) colOff.clear(); else for (const c of order) { const d = offNow(c, now) + l0.get(c) - lx.get(c); if (Math.abs(d) < .5) colOff.delete(c); else colOff.set(c, { x0: d, t0: now }); }
    colPaintNow();
  }
  // 拖列（和拖行一个手感）：这一整列（表头、每一行、合计）浮起来跟着指针走；它原来的地方是空位（浅底，和拖行的空位一样），
  // 别的列实时换位。拖到表格外 40px 以外 = 拿出去了：各列回原位、浮起的列变淡，松手取消；Esc、窗口失焦也取消。
  // 松手：浮起的列滑进它最后的位置，落定了浮起的那份淡掉
  function colDrag(th, e) {
    stopLay(); colLand?.(); /* 行还在过渡：先到位，按到位后的样子克隆 */
    const k = th.dataset.c, r0 = th.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), bx = wrap.clientLeft, by = wrap.clientTop, home = [...order], before = home.join(), rest = home.filter((c) => c !== k), ck = $(":scope > tr > th:first-child", thead); let px = e.clientX, py = e.clientY, raf = 0, out = false;
    for (const c of order) lx.set(c, thOf(c).offsetLeft);
    // 浮起来的整列：克隆整张表，只留这一列（行高按现在的，藏着的行照样藏着），压在表格上面
    const ghost = document.createElement("div"), gt = table.cloneNode(true); ghost.className = "sn-tbl-colghost"; gt.removeAttribute("tabindex");
    for (const c of [...gt.querySelectorAll("col")]) if (c.dataset.c !== k) c.remove();
    const src = [...table.rows]; [...gt.rows].forEach((tr, i) => { for (const c of [...tr.children]) if (c.dataset.c !== k) c.remove(); tr.removeAttribute("style"); tr.classList.remove("sn-moving", "adding", "leaving", "sn-lift", "sn-mg-top", "sn-sel"); if (!src[i].hidden) tr.style.height = src[i].getBoundingClientRect().height + "px"; });
    gt.style.width = r0.width + "px"; ghost.append(gt);
    const tTop = table.getBoundingClientRect().top - wr.top - by, L0 = r0.left - wr.left - bx;
    Object.assign(ghost.style, { left: L0 + "px", top: tTop + "px", width: r0.width + "px" }); wrap.append(ghost); liftIn(ghost);
    // 空位：放在表格后面（格子有底，盖住它），跟着这一列的位置走
    const slot = document.createElement("i"); slot.className = "sn-tbl-gap sn-tbl-colgap"; wrap.prepend(slot);
    Object.assign(slot.style, { top: tTop + "px", height: table.offsetHeight + "px", width: r0.width + "px" });
    slotPaint = (now) => { slot.style.translate = `${(lx.get(k) + offNow(k, now)).toFixed(2)}px 0`; };
    wrap.classList.add("sn-coldrag"); colPaintNow();
    // 放在哪：其余各列按原来的先后排好，这一列插在第 t 个前面时它左边在哪；浮起的列左边离哪个最近就放哪。只看位置，来回拖不会抖
    const target = () => { const gl = r0.left + (px - e.clientX); let x = ck ? (ck.dataset.c ? ck.getBoundingClientRect().left : ck.getBoundingClientRect().right) : table.getBoundingClientRect().left, best = 0, bd = Infinity; for (let t = 0; t <= rest.length; t++) { const d = Math.abs(gl - x); if (d < bd) { bd = d; best = t; } if (t < rest.length) x += thOf(rest[t]).getBoundingClientRect().width; } return best; };
    const tick = () => {
      const w = wrap.getBoundingClientRect(); out = px < w.left - 40 || px > w.right + 40 || py < w.top - 40 || py > w.bottom + 40;
      ghost.style.translate = `${px - e.clientX}px 0`; ghost.classList.toggle("sn-away", out);
      const t = target(); moveCols(out ? home : [...rest.slice(0, t), k, ...rest.slice(t)]); raf = requestAnimationFrame(tick);
    };
    tick();
    return {
      move(x, y) { px = x; py = y; },
      drop(cancel) {
        cancelAnimationFrame(raf); wrap.classList.remove("sn-coldrag");
        if (cancel || out) moveCols(home);
        if (order.join() !== before) fire("columnReorder", { keys: [...order] });
        let anim = null;
        const land = () => { colLand = null; anim?.cancel(); slotPaint = null; slot.remove(); colPaintNow(); if (reduced()) { ghost.remove(); return; } ghost.style.translate = `${lx.get(k) - L0}px 0`; ghost.animate([{ opacity: getComputedStyle(ghost).opacity }, { opacity: 0 }], { duration: 120, easing: EASE_CSS.out, fill: "forwards" }).onfinish = () => ghost.remove(); };
        if (reduced()) { land(); return; }
        // 浮起的列滑进它最后的位置，落定了再淡掉
        anim = ghost.animate([{ translate: ghost.style.translate, opacity: getComputedStyle(ghost).opacity }, { translate: `${lx.get(k) - L0}px 0`, opacity: 1 }], { duration: COL_DUR, easing: EASE_CSS.outStrong, fill: "forwards" });
        anim.onfinish = land; colLand = land;
      },
    };
  }
  let eatClick = false;
  const onHeadDown = (e) => {
    if (e.button !== 0) return; const th = e.target.closest("th[data-c]"); if (!th || !thead.contains(th)) return;
    const rz = e.target.closest(".sn-g-rz"), drag = o.draggableColumns && !colOf(th.dataset.c)?.fixed;
    if (!rz && !drag) return; // 这一列不能拖：只是点表头（排序走 click）
    e.preventDefault(); if (editing) editing.blur(); dragNow?.flush(); colLand?.(); hideSel(); stopCW?.(); stopCW = null; /* 不起文字选区；点一下照样排序；宽度还在滑就停在当前宽度；上一列还在落位就先落好 */
    if (rz) { startColResize(th, e); return; }
    const sx = e.clientX, sy = e.clientY, el = thead; let d = null; eatClick = false; /* 指针捕获放在表头整行上：拖的时候各列的格子会换位置（移走的元素会丢捕获），表头整行不动；松手那一下 click 落在表头上，照样被吃掉 */
    const mv = (ev) => { if (!d) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; d = colDrag(th, e); eatClick = true; try { el.setPointerCapture(ev.pointerId); } catch {} } d.move(ev.clientX, ev.clientY); };
    const end = (cancel) => { for (const [t, f] of evs) el.removeEventListener(t, f); removeEventListener("pointermove", mv, true); removeEventListener("pointerup", up, true); document.removeEventListener("keydown", onEsc, true); removeEventListener("blur", onBlur); d?.drop(cancel); };
    const up = () => end(false), onEsc = (ev) => { if (ev.key === "Escape" && d) { ev.preventDefault(); ev.stopPropagation(); end(true); } }, onBlur = () => end(true);
    const evs = [["pointercancel", () => end(true)], ["lostpointercapture", () => d && end(true)]];
    for (const [t, f] of evs) el.addEventListener(t, f); addEventListener("pointermove", mv, true); addEventListener("pointerup", up, true); document.addEventListener("keydown", onEsc, true); addEventListener("blur", onBlur);
  };
  const onHeadCapture = (e) => { if (eatClick) { eatClick = false; e.preventDefault(); e.stopPropagation(); } }; /* 拖完列松手时那一下 click 不算排序 */
  const onHeadDbl = (e) => { const rz = e.target.closest(".sn-g-rz"); if (rz) autoFit(rz.closest("th")); };

  // ———— 拖行高：任何一行的下边线都能拖（每行左边那一格里放一条和表格一样宽的手柄），一条横线和高度数字跟着；双击恢复 ————
  // 拖的时候行高紧跟指针（关掉格子高度的过渡）；Esc 平滑回到原来的高度；窗口失焦就停在当前高度
  function startRowResize(tr, e) {
    e.preventDefault(); const h0 = tr.getBoundingClientRect().height, prev = tr.style.getPropertyValue("--sn-rh"), y0 = e.clientY, el = e.target, line = document.createElement("i"); line.className = "sn-g-rhline"; line.style.width = "100%"; wrap.append(line); wrap.classList.add("sn-rowsizing"); let done = false, moved = false;
    const place = () => { const w = wrap.getBoundingClientRect(), r = tr.getBoundingClientRect(); line.style.top = r.bottom - w.top - 1 + "px"; line.dataset.h = tt("table.rowHeight", { p0: Math.round(r.height) }); };
    place(); try { el.setPointerCapture(e.pointerId); } catch {}
    const mv = (ev) => { moved = true; tr.style.setProperty("--sn-rh", Math.max(32, Math.min(120, Math.round(h0 + ev.clientY - y0))) + "px"); place(); };
    const onEsc = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); moved = false; fin(); if (prev) tr.style.setProperty("--sn-rh", prev); else tr.style.removeProperty("--sn-rh"); } };
    const fin = () => { if (done) return; done = true; for (const [t, f] of evs) el.removeEventListener(t, f); document.removeEventListener("keydown", onEsc, true); removeEventListener("blur", fin); line.remove(); wrap.classList.remove("sn-rowsizing"); if (moved) fire("rowResize", { key: tr.dataset.id, height: parseFloat(tr.style.getPropertyValue("--sn-rh")) || null }); };
    const evs = [["pointermove", mv], ["pointerup", fin], ["pointercancel", fin], ["lostpointercapture", fin]];
    for (const [t, f] of evs) el.addEventListener(t, f); document.addEventListener("keydown", onEsc, true); addEventListener("blur", fin);
  }

  // ———— 行点击、出错重试 ————
  const onWrapClick = (e) => {
    const rb = e.target.closest("[data-retry]"); if (rb && table.contains(rb)) { fire("retry"); return; }
    if (e.target.closest(".sn-tbl-pick, .sn-ck, .sn-acts, .sn-tbl-detail, a, button, input, label, select, textarea")) return;
    const tr = e.target.closest("tr[data-id]"); if (!tr || tr.parentNode !== tbody || !T.nodes.has(tr.dataset.id)) return;
    if (o.expandOnRowClick && !window.getSelection?.()?.toString()) {
      const nd = nodeOf(tr);
      if (nd && (nd.kids.length || DTR.has(nd.key))) setOpen([tr], !isRowExpanded(nd), true);
    }
    fire("rowClick", nodeOf(tr).row);
  };

  // ———— 接上监听：每个元素上的先后和设计稿一样（排序 → 勾选 → 表体 → 键盘 → 表头） ————
  const on = [];
  const listen = (el, t, f, opt) => { el.addEventListener(t, f, opt); on.push([el, t, f, opt]); };
  const bind = () => {
    listen(thead, "click", onHeadClick); listen(wrap, "change", onChange);
    listen(tbody, "pointerdown", onBodyDown); listen(tbody, "click", onBodyClick); listen(tbody, "dblclick", onBodyDbl);
    if (o.cellSelect) { listen(table, "keydown", onKey); listen(table, "focusout", onFocusOut); listen(table, "focusin", onFocusIn); }
    listen(thead, "pointerdown", onHeadDown); listen(thead, "click", onHeadCapture, true); listen(thead, "dblclick", onHeadDbl);
    listen(wrap, "click", onWrapClick);
    if (scEl && M.hasPin) listen(scEl, "scroll", syncPinScroll, { passive: true });
  };
  const unbind = () => { for (const [el, t, f, opt] of on.splice(0)) el.removeEventListener(t, f, opt); };
  bind();
  let ro = null;
  if (o.resizableRows || M.hasPin) { ro = new ResizeObserver(() => { if (o.resizableRows) wrap.style.setProperty("--sn-tw", table.offsetWidth + "px"); if (M.hasPin) syncPinned(); }); ro.observe(table); if (scEl && M.hasPin) ro.observe(scEl); }
  if (!o.loading && !o.error) relayout(applyVis, { instant: true }); else syncFooter();
  if (M.hasPin) syncPinned();

  // ———— 整表重画：列换了、加载中 / 出错切换、数据换了一批。表格元素本身留着（监听、滚动区域、合计行都还在） ————
  function render() {
    clearDetTimers();
    if (lay) stopLay(); dragNow?.flush(); colLand?.(); selTd = null; editing = null;
    M = modelOf(o, cur()); const tmp = document.createElement("div"); tmp.innerHTML = tableInner(M, CW, MINW); const nt = tmp.firstElementChild;
    for (const a of ["tabindex", "aria-label", "aria-busy", "style"]) { if (nt.hasAttribute(a)) { if (table.getAttribute(a) !== nt.getAttribute(a)) table.setAttribute(a, nt.getAttribute(a)); } else table.removeAttribute(a); }
    const tf = $(":scope > tfoot", table); unbind();
    table.replaceChildren(...nt.childNodes, ...(tf ? [tf] : []));
    refs(); fixMixed(); bind(); paintRenders(); remember();
    if (!o.loading && !o.error) relayout(applyVis, { instant: true }); else syncFooter();
    if (M.hasPin) syncPinned();
    saInst?.refresh();
  }
  // 数据换了：同一批节点（键和上级都一样）就只换数据变了的行的格子、行移到新位置；否则整表重画（展开、勾选按 rowKey 带过去）
  function setData(list) {
    const T2 = treeOf(list, o.rowKey);
    const same = T2.tree === T.tree && T2.nodes.size === T.nodes.size && [...T2.nodes].every(([k, nd]) => { const a = T.nodes.get(k); return !!a && (a.parent?.key ?? null) === (nd.parent?.key ?? null); });
    if (sortKey && o.sortLocal !== false) sortTree(T2.top, nodeCmp(colOf(sortKey), dir));
    T = T2; for (const k of [...open]) if (!T.nodes.has(k)) open.delete(k); for (const k of [...picked]) if (!T.nodes.has(k)) picked.delete(k);
    M = modelOf(o, cur());
    if (!same || o.loading || o.error) { render(); return; }
    refreshAll();
    relayout(() => { placeTree(); applyVis(); syncEmpty(); });
    syncSel();
  }
  // 每一行按签名比一遍：内容变了的格子换掉（只换变了的文字）；render 的列都重画一次（React 的根、Vue 的 render 自己比，没变就不动）
  function refreshAll() {
    const live = M.dcols.some((c) => typeof c.render === "function") || typeof M.acts?.render === "function";
    let i = 0; walkAll(T.top, (nd) => { const tr = TR.get(nd.key), sg = sigOf(nd, i); if (tr && (live || SIG.get(nd.key) !== sg)) refreshRow(tr, nd, i); if (DTR.has(nd.key)) { detPainted.delete(nd.key); if (isDetailOpen(nd)) paintDetail(nd, true); } SIG.set(nd.key, sg); i++; });
  }

  return {
    get selected() { return [...picked]; },
    get sort() { return sortKey ? { key: sortKey, dir: dir < 0 ? "desc" : "asc" } : null; },
    get expanded() { return [...open]; },
    get columnOrder() { return [...order]; },
    isExpanded(key) { const nd = T.nodes.get(String(key)); return isRowExpanded(nd); },
    expand(keys, want = true) { setOpen((keyList(keys) ?? []).map((k) => TR.get(k)).filter(Boolean), !!want, false); },
    expandAll(want = true) { setOpen(parents().map((nd) => TR.get(nd.key)), !!want, false); },
    select(keys) { picked = new Set(keyList(keys) ?? []); syncSel(); },
    // 数据在外面就地改了、筛选函数读的外部变量变了：按现在的样子重新排一遍（从看到的样子过渡过去）
    refresh() { dragNow?.flush(); relayout(() => { applyVis(); syncEmpty(); }); },
    edit(key, colKey) { const tr = TR.get(String(key)), c = colKey ?? M.dcols.find((x) => x.editable)?.key, td = tr && c ? cellOf(tr, c) : null; if (!td) return; if (editing) editing.blur(); if (o.cellSelect) selectTd(td); rename(td); },
    // next 是合并以后的整份选项，prev 是上一份（createTable 给的）。受控的值（sort、selected、expandedKeys）"传进来的值换了（和上次给的比）"才跟过去：
    // 非受控时 React 封装不带这些值，表格自己的状态不会被打回初始值
    update(next, prev) {
      prev = prev ?? o; o = { ...o, ...next };
      const colsChanged = colSig(prev.columns) !== colSig(o.columns);
      const flags = FLAGS.some((k) => !!prev[k] !== !!o[k]) || (!!o.error && prev.error !== o.error);
      const dataNext = o.data ?? o.rows ?? [], dataChanged = dataNext !== (prev.data ?? prev.rows ?? []);
      let sortChanged = false, selChanged = false, reopen = false;
      const curSort = sortKey ? { key: sortKey, dir: dir < 0 ? "desc" : "asc" } : null;
      if ("sort" in next && !sameSort(next.sort, prev.sort) && !sameSort(next.sort, curSort)) { sortKey = next.sort?.key ?? null; dir = next.sort?.dir === "desc" ? -1 : 1; sortChanged = true; }
      if (next.selected && !sameList(next.selected, prev.selected)) { picked = new Set(keyList(next.selected)); selChanged = true; }
      if (next.expandedKeys && !sameList(next.expandedKeys, prev.expandedKeys)) { const want = keyList(next.expandedKeys); if (want.length !== open.size || want.some((k) => !open.has(k))) { open.clear(); for (const k of want) open.add(k); reopen = true; } }
      const fq = next.filter !== undefined && next.filter !== prev.filter, setQ = () => { q = typeof o.filter === "function" ? o.filter : null; if (!q) qOpen.clear(); };
      // 列变了（加列、删列、标题、宽度……）、加载中 / 出错切换：整表重画
      if (colsChanged) {
        const keys = colsOf(o.columns).data.map((c) => c.key); if (keys.slice().sort().join() !== order.slice().sort().join()) order.splice(0, order.length, ...keys);
        M = modelOf(o, cur()); ({ CW, MINW } = widthsOf(M.dcols0)); FLEX = new Set(M.dcols0.filter((c) => !CW[c.key]).map((c) => c.key));
        for (const c of M.dcols0) if ("merge" in c) addMK(c.key);
      }
      if (colsChanged || flags) {
        if (fq) setQ();
        if (dataChanged) { T = treeOf(dataNext, o.rowKey); for (const k of [...open]) if (!T.nodes.has(k)) open.delete(k); for (const k of [...picked]) if (!T.nodes.has(k)) picked.delete(k); }
        if ((dataChanged || sortChanged) && sortKey && o.sortLocal !== false) sortTree(T.top, nodeCmp(colOf(sortKey), dir));
        if (!!prev.compact !== !!o.compact) wrap.classList.toggle("sn-compact", !!o.compact);
        if ((prev.lines ?? "row") !== (o.lines ?? "row")) wrap.dataset.lines = o.lines || "row";
        render(); return;
      }
      M = modelOf(o, cur());
      if (dataChanged) { if (fq) { dragNow?.flush(); setQ(); } setData(dataNext); } // 数据和筛选一起换：一次过渡
      else if (next.columns !== prev.columns && !o.loading && !o.error) refreshAll(); // 列数组换了、长相没变（React / Vue 每次渲染新建的列，format / html / render 可能读着外面的状态）
      else if (sortChanged) { headSync(); sortNow(); }
      if (selChanged) syncSel();
      // 外观：只切类名、属性，不重画
      if (!!prev.compact !== !!o.compact) { dragNow?.flush(); wrap.classList.toggle("sn-compact", !!o.compact); }
      if (!!prev.striped !== !!o.striped) wrap.classList.toggle("sn-striped", !!o.striped);
      if (!!prev.plain !== !!o.plain) wrap.classList.toggle("sn-plain", !!o.plain);
      if (!!prev.fill !== !!o.fill) wrap.classList.toggle("sn-tbl-fill", !!o.fill);
      if (prev.maxHeight !== o.maxHeight) { if (o.maxHeight != null) wrap.style.setProperty("--sn-tbl-max", px(o.maxHeight)); else wrap.style.removeProperty("--sn-tbl-max"); }
      if (prev.label !== o.label) { if (o.label) table.setAttribute("aria-label", o.label); else table.removeAttribute("aria-label"); }
      if (prev.empty !== o.empty && emptyRow && !emptyRow.hidden) emptyRow.firstElementChild.innerHTML = emptyInner(o, !!q);
      // 分页配置变更
      const pgChanged = "pagination" in next && next.pagination !== prev.pagination;
      if (pgChanged) {
        pgCfg = normPageCfg(o.pagination);
        if (pgCfg) {
          if (next.pagination && typeof next.pagination === "object" && next.pagination.page != null) pgPage = pgCfg.page;
          if (next.pagination && typeof next.pagination === "object" && next.pagination.pageSize != null) pgSize = pgCfg.pageSize;
        }
        if (!o.loading && !o.error) { relayout(() => { applyVis(); syncEmpty(); }, { instant: true }); syncSel(); }
        else syncFooter();
      }
      // 筛选、网格线、合并规则、展开：都走一次 relayout（从现在看到的样子过渡过去）
      const lines = (prev.lines ?? "row") !== (o.lines ?? "row");
      let mg = mergeSig(prev.columns) !== mergeSig(o.columns);
      if (!mg && next.spans !== prev.spans && !dataChanged) mg = JSON.stringify(regionsOf(visRows().map((r) => nodeOf(r).row), M.dcols0, order, o)) !== JSON.stringify(lastRegs);
      if ((fq && !dataChanged) || lines || mg || reopen) {
        dragNow?.flush(); // 先把还在拖的落好（按原来的筛选、线），再换
        if (fq) { setQ(); if (isLocalPage()) pgPage = 1; }
        if (lines) wrap.dataset.lines = o.lines || "row";
        relayout(fq || reopen ? () => { applyVis(); if (fq) syncEmpty(); } : undefined);
      }
      if (M.hasPin) syncPinned();
      saInst?.refresh();
    },
    destroy() {
      clearDetTimers();
      psInst?.dispose(); psInst = null;
      saInst?.destroy();
      if (lay) { clearLay(lay); lay = null; } dragNow?.flush(); colLand?.(); stopCW?.(); cancelAnimationFrame(colRaf); ro?.disconnect(); unbind();
    },
  };
}
