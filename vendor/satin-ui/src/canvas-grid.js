// 数据表格 · Canvas 版（一百万行）。功能和 DOM 版一样：懒加载、筛选、排序、拖列、改宽、固定列、拖行、编辑、勾选、键盘。
// - 表头仍是 DOM（只有十来格，复用 DOM 版的表头：排序、筛选、拖列、改宽，读屏也读得到列名）；表体画在一块画布上；
// - 滚动用原生滚动条：滚动容器里放一块和全部行一样高的垫片，画布 sticky 贴在视口里不动，滚到哪画哪（一帧只画看得见的十几行）；
// - 一百万行 × 32px = 3200 万 px，在浏览器元素高度上限（约 3355 万）以内；
// - 命中判断按行高和列的 x 算；悬停、勾选、拖行让位（每帧按 45ms 时间常数逼近）、编辑后闪一下、数据到了淡入、换列位置时列从旧位置滑过去，都在画布上画；
// - 编辑：在格子的位置盖一个输入框（选项列弹出选项），滚动就先提交；读屏：当前格子的内容写进一个看不见的 aria-live 区域。
import { $, injectIcons, initSeg, reduced } from "./core.js";
import { normCols, optionOf, optionValue, textOf, parseEdit, editText, ownerSeed } from "./table-data.js";
import { presetAvatar, avatarSvg } from "./avatar-presets.js";
import { createSource } from "./table-source.js";
import { backendOf } from "./table-backends.js";
import { closeGridPops, esc, heightCSS, setGridHeight, mountGridState, primaryTitle, gridBarHTML, gridShadesHTML, colStops, columnModel, createMerges, createMergeFx, mergeSegs, treeGuides, createRowMotion, createTreeSel, dragClamp, gapPieces, gapStep, mountHead, mountMergeBar, mountToolbar, openEnum, shades, slotShift, treeCols, treeDrag } from "./grid.js";
import { gridBars } from "./grid-bars.js";
import { elastic } from "./scroll.js";
import { ICONS } from "./icons.js";
import { toast } from "./feedback.js";
import { CHECK, EASE, popScale } from "./form.js";
import { scoped } from "./i18n.js";
import { defineComponent } from "./lifecycle.js";
import I18N_DEFAULTS from "./locales/zh-CN/canvas-grid.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
// mountCanvasGrid(.sn-grid, { columns, data | dataSource, rowKey, … })：Canvas 版数据表格——整张表画在一块画布上（百万行照样流畅），交互、选项、事件和 DOM 版一致（见 grid.js 的 mountDataGrid）；
// render 只在 DOM 版有效（画布上画不了任意 HTML，用 format 给文字），行详情给 detail.draw(上下文)（上下文里有画布 g、行、位置、颜色、字体和画字的工具）。
//   数据来源和 DOM 版一样（table-source.js + table-backends.js；设计稿的一百万行在 demo/grid-backend.js）
export function mountCanvasGrid(root, o = {}) {
  if (!root || root._grid) return root?._grid;
  const opt = o, canDrag = !!(o.rowDraggable || o.dataSource?.move); // 选项（下面好几个函数的参数也叫 o：那是列的位置）；能不能拖行（不能就不画把手）
  const emit = (type, detail) => (o.emit ? o.emit(type, detail) : o["on" + type[0].toUpperCase() + type.slice(1)]?.(detail));
  if (o.height != null) setGridHeight(root, o.height);
  root.classList.add("sn-cg");
  const vp = $(".sn-g-vp", root), head = $(".sn-g-head", root), cv = $(".sn-cg-cv", root), sizer = $(".sn-cg-sizer", root), frame = $(".sn-g-frame", root), sr = $(".sn-cg-sr", root);
  const g = cv.getContext("2d"), RH = 32, HEAD = 40;
  const cols0 = normCols(o.columns || []), selMode = o.selection ?? (cols0.some((c) => c.type === "sel") ? "multiple" : "none");
  if (selMode !== "none" && !cols0.some((c) => c.type === "sel")) cols0.unshift(...normCols([{ key: "sel", type: "sel", width: o.rowDraggable ? 64 : 44, pinned: "left" }]));
  const model = columnModel(cols0), NAME = model.primary, isT = (k, t) => model.byKey[k]?.type === t, styleEl = document.createElement("style"), motionEl = document.createElement("style"); document.head.append(styleEl, motionEl); /* motionEl：表头的列位移、透明度，每帧和表身一起画 */
  let W = 0, Hc = 0, dpr = 1, raf = 0, more = false, lastDraw = performance.now(), dt = 16;
  let active = { p: 0, c: NAME, id: 0 }, hoverP = -1, selAll = false, selSet = new Set(), anchorP = -1, editing = null, drag = null, fnow = 0; /* fnow：这一帧的时间（画格子时取列的位移、透明度用同一个时间） */
  let lastAppendN = 0;
  const flashes = [], fades = new Map(), wasSk = new Set(); let drawn = [];
  // 拖行松手后还在等落位时又去点别的：先把这一次落好（不然新的拖动会把它冲掉，这一次的换位就丢了）
  const flushDrop = () => { if (drag?.done) { const d = drag; drag = null; commitDrag(d); schedule(); } };
  const keyOf = (r) => { const it = src.row(r) ?? src.allRows?.()?.[r]; return it == null ? r : typeof o.rowKey === "function" ? o.rowKey(it) : it[o.rowKey ?? "id"] ?? r; };
  const src = createSource({ backend: backendOf({ data: o.data, dataSource: o.dataSource, columns: model.cols, rowKey: o.rowKey, primary: NAME }), primary: NAME, block: 200, rowH: RH, query: (o.sort ?? o.defaultSort) ? { sort: o.sort ?? o.defaultSort } : undefined, onChange: (w) => { if (w === "view") { if (drag?.tree) { drag.abort(); drag = null; } mo.reset(); mergeFx.reset(); syncTree(); active.p = Math.min(active.p, Math.max(0, src.shown - 1)); active.id = src.idAt(active.p); if (!drag && !keepScroll) vp.scrollTop = 0; keepScroll = false; rg = null; anchorP = -1; showSel(false); applyKeys(); } if (w === "block") keysOnBlock(); sizeBody(); paintBar(); headUI.paint(); schedule(); paintState(); queryChanged(); } });
  let lastSort = JSON.stringify(src.query.sort || null), lastFilter = JSON.stringify({ q: src.query.q || "", filters: src.query.filters || {} });
  function queryChanged() {
    const s1 = JSON.stringify(src.query.sort || null), f1 = JSON.stringify({ q: src.query.q || "", filters: src.query.filters || {} });
    if (s1 !== lastSort) { lastSort = s1; emit("sortChange", src.query.sort || null); }
    if (f1 !== lastFilter) { lastFilter = f1; emit("filterChange", { q: src.query.q || "", filters: src.query.filters || {} }); }
  }
  const paintState = mountGridState(root, vp, src, o, emit); // 空、加载、出错（和 DOM 版同一层，盖在画布上面）
  // 滚动条：和 DOM 版同一套（常驻占位 / 自动悬浮），一百万行时滑块最短 24px，拖滑块一下能跨几十万行
  const SK_MORE = 3;
  const tailH = () => (src.mode !== "append" ? 0 : src.hasMore ? SK_MORE * RH : src.total > 0 ? RH : 0);
  const bars = gridBars(frame, vp, { head: HEAD, rowH: RH, rowsH: () => src.rowsH() + tailH(), colsW: () => model.width(), pinL: () => model.leftW(), pinR: () => model.rightW(), stops: () => colStops(model), reduced });
  const DETAIL = 96, EXPD = { flat: new Map(), tree: new Map() }, expAnim = new Map(), expTo = new Map(); // expAnim / expTo：正在展开收起的行这一次的记号、要去的状态
  let expd = EXPD.flat; // 展开了详情的行；平铺、树形各记各的
  const merges = createMerges(src, model, (p) => { const r = src.rowAt(p); return r >= 0 && expd.has(r); });
  const mergeFx = createMergeFx(), mgIds = new WeakMap();
  let mgSeq = 0, hovMerge = null, selMerge = null, splitHover = false, lastRgKey = "";
  const mgId = (m) => { let id = mgIds.get(m); if (!id) mgIds.set(m, (id = ++mgSeq)); return id; };
  const expOpen = (r) => expTo.get(r) ?? expd.has(r); // 展开的行：行号 → 收起时（格子部分）的高度
  let selShown = false, activeSelected = false, kbdNav = false, rg = null; // selShown：可文字编辑单格修改框选；activeSelected：是否聚焦某数据格/合并块；kbdNav：键盘巡航态；rg：多格范围框选 { ap, ac, fp, fc }

  // ———— 颜色：从 CSS 令牌里解析成画布认得的颜色（换主题时重读） ————
  const probe = document.createElement("i"); probe.style.display = "none"; root.append(probe);
  const col = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
  let C = {};
  // 预设头像：SVG 里的 --sn-av-* 换成当前主题的颜色，画成图片按主题缓存；没加载好先画圆底，加载好整表重画；换主题时新的一张没好之前先用上一张（不闪成空圆）
  const AVK = ["bg", "ink", "face", "black", "brown", "gray", "blue", "green", "pink", "violet", "beard"], avIds = new Map(), avPics = new Map(), avLast = new Map();
  let AV = {}, avTheme = "";
  const readAv = () => { AV = {}; for (const k of AVK) { const v = col(`var(--sn-av-${k}, transparent)`); if (v !== "rgba(0, 0, 0, 0)") AV[k] = v; } avTheme = JSON.stringify(AV); };
  const avPic = (seed) => {
    let id = avIds.get(seed); if (!id) avIds.set(seed, (id = presetAvatar(seed).id));
    const key = avTheme + id; let e = avPics.get(key);
    if (!e) {
      const svg = avatarSvg(id, 20).replace(/var\(--sn-av-([a-z]+),([^)]+)\)/g, (_, k, fb) => AV[k] ?? fb).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" ');
      const img = new Image(); e = { img, ok: false }; avPics.set(key, e);
      img.onload = () => { e.ok = true; avLast.set(id, e); schedule(); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }
    return e.ok ? e : avLast.get(id);
  };
  const readColors = () => { readShape(); readFont(); readAv(); C = { field: col("var(--sn-field)"), onPrimary: col("var(--sn-on-primary)"), ghostHover: col("var(--sn-b-ghost-hover)"), fillHover: col("var(--sn-fill-hover)"), bg: col("var(--sn-g-bg)"), hover: col("var(--sn-g-hover)"), sel: col("var(--sn-g-selbg)"), selHover: col("var(--sn-g-selhover)"), line: col("var(--sn-g-rowline)"), lineC: col("var(--sn-line-control)"), label: col("var(--sn-label)"), label2: col("var(--sn-label2)"), label3: col("var(--sn-label3)"), fillS: col("var(--sn-fill-subtle)"), fillA: col("var(--sn-fill-active)"), raised: col("var(--sn-raised)"), accent: col("var(--sn-accent)"), success: col("var(--sn-success)"), warning: col("var(--sn-warning)"), focus: col("var(--sn-focus)"), ring: col("var(--sn-ring)"), flash: col("var(--sn-g-flash)"), selLine: col("var(--sn-sel-ring)"), gapBg: col("color-mix(in srgb, var(--sn-label) 5%, var(--sn-g-bg))"), gapLine: col("color-mix(in srgb, var(--sn-label) 12%, transparent)"), tree: col("var(--sn-tree-line)"), selFill: col("color-mix(in srgb, var(--sn-accent) 4%, transparent)"), selGlow: col("color-mix(in srgb, var(--sn-accent) 6%, transparent)"), mgSel: col("color-mix(in srgb, var(--sn-label) 4%, transparent)"), kbdFill: col("color-mix(in srgb, var(--sn-label) 5%, transparent)"), rgFill: col("color-mix(in srgb, var(--sn-accent) 6.5%, transparent)"), rgLine: col("var(--sn-range-line)"), dtBg: col("color-mix(in srgb, var(--sn-label) 2%, var(--sn-g-bg))"), dark: document.documentElement.dataset.theme === "dark" }; tw.clear(); schedule(); };
  // 圆角：复选框用 --r-xs；图标按钮、展开箭头的悬停底照着组件库按钮的实际圆角（顶栏切"圆角"时跟着变）
  const shapeProbe = document.createElement("button"); shapeProbe.className = "sn-btn sn-ghost sn-sm sn-ibtn"; shapeProbe.style.cssText = "position:absolute;top:0;left:0;visibility:hidden;pointer-events:none"; shapeProbe.tabIndex = -1; root.append(shapeProbe);
  let rXS = 4, rBtn = 6, rSM = 6, icDuo = .48; function readShape() { const cs = getComputedStyle(document.documentElement); rXS = parseFloat(cs.getPropertyValue("--sn-r-xs")) || 4; rSM = parseFloat(cs.getPropertyValue("--sn-r-sm")) || 6; rBtn = Math.min(14, parseFloat(getComputedStyle(shapeProbe).borderTopLeftRadius) || 6); const d = parseFloat(cs.getPropertyValue("--sn-ic-duo")); icDuo = Number.isFinite(d) ? Math.max(0, Math.min(1, d)) : .48; }
  // 深浅、圆角、主题定制（主色 / 状态色 / 字体 / 字号都写在根元素的 style 上）变了：颜色、形状、字体重新读，重画
  new MutationObserver(() => { readColors(); schedule(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-radius", "style"] });

  // ———— 小动效：和 DOM 版、组件库同一套时长和曲线 ————
  // 行悬停换底色 100ms、勾选换底色 100ms；复选框：底色 140ms、勾 180ms（晚 40ms 起笔）、勾上弹一下 260ms、悬停描边 140ms；展开箭头转 90° 200ms；把手、图标按钮悬停出底 120ms。
  // 每个键一个数，朝目标走，走完就删；画的时候 tv(键, 现在该是多少) 取当前值（没在动就直接是目标值）
  const TW = new Map(), LIN = (t) => t;
  const curOf = (s, now) => { const t = (now - s.t0) / s.dur; return t <= 0 ? s.from : t >= 1 ? s.to : s.from + (s.to - s.from) * s.ease(t); };
  function fx(key, from, to, dur, ease = EASE.out, delay = 0) { if (reduced()) { TW.delete(key); return; } const now = performance.now(), s = TW.get(key); TW.set(key, { from: s ? curOf(s, now) : from, to, t0: now + delay, dur, ease }); schedule(); }
  function tv(key, def) { const s = TW.get(key); if (!s) return def; const now = performance.now(); if (now - s.t0 >= s.dur) { TW.delete(key); return s.to; } more = true; return curOf(s, now); }
  // 勾选状态变了（点、Shift 连选、空格、全选）：看得见的那几行播过渡；点的那一行勾上时弹一下
  // 树形的半选（下级勾了一部分）：底色和勾上一样，中间一道横条（160ms 从中间长出来，和 .check.mixed 一样）
  const selCode = (r) => (isSel(r) ? 1 : src.tree && tsel.mixed(r) ? 2 : 0);
  function checkFx(prev, popR) {
    for (const [r, was] of prev) { const now = selCode(r); if (now === was) continue; const f0 = was ? 1 : 0, f1 = now ? 1 : 0, k0 = was === 1 ? 1 : 0, k1 = now === 1 ? 1 : 0, b0 = was === 2 ? 1 : 0, b1 = now === 2 ? 1 : 0;
      if (f0 !== f1) fx("cf" + r, f0, f1, CHECK.fill); if (k0 !== k1) { fx("ck" + r, k0, k1, CHECK.tick, EASE.out, CHECK.tickDelay); fx("s" + r, k0, k1, 100); } if (b0 !== b1) fx("cb" + r, b0, b1, CHECK.bar, EASE.outStrong); }
    if (popR != null && isSel(popR)) fx("cp" + popR, 0, 1, CHECK.pop, LIN);
  }
  const visibleSel = () => { const st = vp.scrollTop, out = new Map(); for (let p = Math.max(0, src.rowAtY(st) - 1); p < Math.min(src.shown, src.rowAtY(st + Hc) + 2); p++) { const r = src.rowAt(p); if (r >= 0) out.set(r, selCode(r)); } return out; };
  // 悬停：哪一行、指着哪个小控件（把手 grip、复选框 ck、展开 exp、编辑 ae、更多 am）
  let hz = "", lastPt = null, hoverDirty = false;
  function setHover(p, z, fade = true, mg = null) {
    if (p !== hoverP) { const r0 = src.rowAt(hoverP), r1 = src.rowAt(p); if (fade) { if (r0 >= 0) fx("h" + r0, 1, 0, 100); if (r1 >= 0) fx("h" + r1, 0, 1, 100); } else { TW.delete("h" + r0); TW.delete("h" + r1); } hoverP = p; schedule(); }
    if (mg !== hovMerge) { if (fade) { if (hovMerge) fx("mgh" + mgId(hovMerge), 1, 0, 110); if (mg) fx("mgh" + mgId(mg), 0, 1, 110); } else { if (hovMerge) TW.delete("mgh" + mgId(hovMerge)); if (mg) TW.delete("mgh" + mgId(mg)); } hovMerge = mg; schedule(); }
    if (z !== hz) { if (hz) fx("z" + hz, 1, 0, 120); if (z) fx("z" + z, 0, 1, 120); hz = z; }
  }
  function syncSelMerge() {
    const am = activeSelected && !rgRect() && !selShown ? merges.at(active.p, active.c)?.m ?? null : null;
    if (am === selMerge) return;
    if (selMerge) fx("mgs" + mgId(selMerge), 1, 0, 120);
    if (am) fx("mgs" + mgId(am), 0, 1, 120);
    selMerge = am; schedule();
  }
  // 线性图标（Solar Icons line-duotone）：可以转、可以在两个颜色之间过渡（两遍描边按比例叠，次要笔画乘 --sn-ic-duo）
  function icon2(name, x, y, size, c0, c1, v, rot = 0) {
    g.save(); g.translate(x + size / 2, y + size / 2); if (rot) g.rotate(rot); g.translate(-size / 2, -size / 2); g.scale(size / 24, size / 24); g.lineWidth = 1.5; g.lineCap = "round"; g.lineJoin = "round";
    const a0 = g.globalAlpha, parts = iconOf(name);
    if (v < 1) { g.strokeStyle = c0; for (const { p, duo } of parts) { g.globalAlpha = a0 * (1 - v) * (duo ? icDuo : 1); g.stroke(p); } }
    if (v > 0) { g.strokeStyle = c1; for (const { p, duo } of parts) { g.globalAlpha = a0 * v * (duo ? icDuo : 1); g.stroke(p); } }
    g.restore();
  }
  // 复选框：和组件库的 .check 一样——16px、--r-xs 圆角、--field 底、1px 描边（悬停变深），勾上变 --accent、勾从起笔处画出来，勾上那一下缩到 88% 再弹回
  function drawCheck(bx, by, r) {
    const on = isSel(r), mx = !on && src.tree && tsel.mixed(r), f = tv("cf" + r, on || mx ? 1 : 0), k = tv("ck" + r, on ? 1 : 0), bv = tv("cb" + r, mx ? 1 : 0), pv = tv("cp" + r, 1), hb = tv("zck:" + r, hz === "ck:" + r ? 1 : 0), sc = pv >= 1 ? 1 : popScale(pv);
    g.save(); if (sc !== 1) { g.translate(bx + 8, by + 8); g.scale(sc, sc); g.translate(-bx - 8, -by - 8); }
    const a0 = g.globalAlpha; g.beginPath(); g.roundRect(bx, by, 16, 16, rXS); g.fillStyle = C.field; g.fill();
    if (f > 0) { g.globalAlpha = a0 * f; g.fillStyle = C.accent; g.fill(); g.globalAlpha = a0; }
    if (f < 1) { g.beginPath(); g.roundRect(bx + .5, by + .5, 15, 15, Math.max(0, rXS - .5)); g.lineWidth = 1; g.globalAlpha = a0 * (1 - f); g.strokeStyle = C.label3; g.stroke(); if (hb > 0) { g.globalAlpha = a0 * (1 - f) * hb; g.strokeStyle = C.label2; g.stroke(); } g.globalAlpha = a0; }
    if (k > 0) { const [[x1, y1], [x2, y2], [x3, y3]] = CHECK.pts; g.beginPath(); g.moveTo(bx + 2 + x1, by + 2 + y1); g.lineTo(bx + 2 + x2, by + 2 + y2); g.lineTo(bx + 2 + x3, by + 2 + y3); g.setLineDash([CHECK.dash, CHECK.dash]); g.lineDashOffset = CHECK.dash * (1 - k); g.lineWidth = CHECK.stroke; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = C.onPrimary; g.stroke(); g.setLineDash([]); g.lineDashOffset = 0; }
    if (bv > 0) { const w = 8 * bv; g.fillStyle = C.onPrimary; g.beginPath(); g.roundRect(bx + 8 - w / 2, by + 7.25, w, 1.5, .75); g.fill(); }
    g.restore();
  }

  // ———— 图标：把 icons.js 里的 Solar Icons（含 line-duotone 次要笔画）转成 Path2D ————
  const ICON = {};
  const iconOf = (name) => (ICON[name] ??= [...(ICONS[name] || "").replace(/<g[^>]*\bsn-ic-d\b[^>]*>([\s\S]*?)<\/g>/g, (_, inner) => inner.replace(/\/>/g, ' class="sn-ic-d"/>')).matchAll(/<(path|circle|rect|ellipse|line)\s([^>]*)\/>/g)].map(([, tag, attrs]) => {
    const a = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const duo = /\bsn-ic-d\b/.test(a.class || "");
    if (tag === "path") return { p: new Path2D(a.d), duo };
    const p = new Path2D();
    if (tag === "circle") p.arc(+a.cx, +a.cy, +a.r, 0, Math.PI * 2);
    else if (tag === "ellipse") p.ellipse(+a.cx, +a.cy, +a.rx, +a.ry, 0, 0, Math.PI * 2);
    else if (tag === "line") { p.moveTo(+a.x1, +a.y1); p.lineTo(+a.x2, +a.y2); }
    else p.roundRect(+a.x, +a.y, +a.width, +a.height, +(a.rx || 0));
    return { p, duo };
  }));
  function icon(name, x, y, size, color) { g.save(); g.translate(x, y); g.scale(size / 24, size / 24); g.strokeStyle = color; g.lineWidth = 1.5; g.lineCap = "round"; g.lineJoin = "round"; const a0 = g.globalAlpha; for (const { p, duo } of iconOf(name)) { g.globalAlpha = duo ? a0 * icDuo : a0; g.stroke(p); } g.restore(); }

  // ———— 文字：字体切换少做；量过的宽度缓存起来；放不下就截断加省略号 ————
  // 画布上的字：字体、字号跟主题定制走（和 DOM 里的字一样乘 --font-scale）；行高不变，最大 1.14 倍在 40px 的行里放得下
  const F = {};
  function readFont() {
    const cs = getComputedStyle(document.documentElement), fam = cs.getPropertyValue("--sn-sans").trim() || "-apple-system, 'PingFang SC', sans-serif", k = Math.min(1.14, parseFloat(cs.getPropertyValue("--sn-font-scale")) || 1);
    Object.assign(F, { t: `400 ${13 * k}px ${fam}`, s: `400 ${12 * k}px ${fam}` }); font = "";
  }
  let font = ""; const setFont = (f) => { if (font !== f) { g.font = f; font = f; } };
  const tw = new Map();
  const width = (s, f) => { const k = f + "\u0000" + s; let w = tw.get(k); if (w == null) { setFont(f); w = g.measureText(s).width; if (tw.size > 6000) tw.clear(); tw.set(k, w); } return w; };
  const trunc = (s, max, f) => { if (width(s, f) <= max) return s; let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (width(s.slice(0, m) + "…", f) <= max) lo = m; else hi = m - 1; } return s.slice(0, lo) + "…"; };
  function text(s, x, y, f, color, align = "left") { setFont(f); g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); }

  // ———— 列的位置：固定列贴边，中间列跟着横向滚动；换位置时中间列从看到的位置滑到新位置 ————
  function layout() {
    const sl = vp.scrollLeft, gw = model.width(), sticky = gw > W, out = []; let x = 0;
    for (const c of model.display()) { out.push({ c, x0: x, x: x - sl, zone: c.pin === "left" ? "L" : c.pin === "right" ? "R" : "M" }); x += c.w; }
    let lx = 0, rx = W - model.rightW();
    for (const o of out) { if (o.zone === "L") { o.x = lx; lx += o.c.w; } else if (o.zone === "R" && sticky) { o.x = rx; rx += o.c.w; } }
    for (const o of out) if (o.zone === "M") o.x += headUI.offNow(o.c.key, fnow); /* 换位置：中间列从看到的位置滑到新位置（和表头同一个时间、同一条曲线） */
    const lw = model.leftW(), rw = model.rightW();
    return { cols: out, lw, rw: sticky ? rw : 0, rx0: sticky ? W - rw : Math.max(lw, gw - rw), rx1: sticky ? W : Math.min(W, gw) };
  }

  // ———— 画 ————
  // 勾选：平铺是"全选 + 例外"（一百万行也是 O(1)）；树形是上下级联动（tsel，两版共用）
  const tsel = createTreeSel(src);
  const isSel = (r) => (src.tree ? tsel.has(r) : selAll ? !selSet.has(r) : selSet.has(r));
  const selCount = () => (src.tree ? tsel.count() : selAll ? src.total - selSet.size : selSet.size);
  function rowOffset(p, dt) { // 让开的行：按空位摆（slotShift，和 DOM 版同一份）；拿起时还在动的行，剩下的那点位移缓动掉。被拖的行 / 块另外画，跟手
    if (!drag || drag.hides(p)) return 0;
    let r = drag.off.get(p); if (r) { r *= Math.exp(-dt / 45); if (Math.abs(r) < .3) { drag.off.delete(p); r = 0; } else { drag.off.set(p, r); more = true; drag.anim = true; } }
    return drag.shift(p) + (r || 0);
  }
  function cell(o, y, r, p, hov, h = RH) {
    const c = o.c, col = c, x = o.x, w = c.w, m = y + h / 2, k = c.key;
    if (k === NAME && c.type !== "sel" && c.type !== "act") { // 主列：树形的缩进、引导线、箭头、下级数量；平铺时有行详情才画名字前面的展开箭头（和组件库的 .disc 一样，展开时转 90°，指着时出底、变深）
      const name = textOf(c, src.val(r, k), src.row(r));
      if (src.tree) { const tx = treeHead(x, y, h, m, p), lv = src.lvAt(p), cnt = src.hasKids(r) && opt.treeCount ? opt.treeCount(src.kidsN(r), lv) || "" : "", cw = cnt ? width(cnt, F.s) + 8 : 0, sn = trunc(name, Math.max(0, x + w - 12 - tx - cw), F.t); text(sn, tx, m, F.t, C.label); if (cnt) text(cnt, tx + width(sn, F.t) + 8, m, F.s, C.label3); return; }
      if (!opt.detail) return text(trunc(name, w - 24, F.t), x + 12, m, F.t, C.label);
      const ev = tv("ex" + r, expOpen(r) ? 1 : 0), ez = tv("zexp:" + r, hz === "exp:" + r ? 1 : 0);
      if (ez > 0) { const a0 = g.globalAlpha; g.globalAlpha = a0 * ez; g.fillStyle = C.fillHover; g.beginPath(); g.roundRect(x + 5, m - 10, 20, 20, rSM); g.fill(); g.globalAlpha = a0; }
      icon2("chevron-right", x + 8, m - 7, 14, C.label3, C.label, ez, ev * Math.PI / 2); return text(trunc(name, w - 44, F.t), x + 30, m, F.t, C.label);
    }
    switch (c.type) {
      case "sel": {
        // 把手：跟着行悬停淡入（被拖的行一直在）；指着把手本身时出底、变深——和组件库的 .grip 一样
        const gv = drag?.p0 === p ? 1 : tv("h" + r, hov ? 1 : 0), gz = tv("zgrip:" + r, hz === "grip:" + r ? 1 : 0);
        if (gv > 0 && canDrag) { const a0 = g.globalAlpha; g.globalAlpha = a0 * gv; if (gz > 0) { g.globalAlpha = a0 * gv * gz; g.fillStyle = C.ghostHover; g.beginPath(); g.roundRect(x + 6, m - 12, 18, 24, rXS); g.fill(); g.globalAlpha = a0 * gv; } icon2("grip-vertical", x + 8, m - 7, 14, C.label3, C.label, drag?.p0 === p ? 1 : gz); g.globalAlpha = a0; }
        drawCheck(x + 30, m - 8, r);
        return;
      }
      case "status": { const v = src.val(r, k), op = optionOf(col, v), tone = op ? op.tone : v; g.beginPath(); g.arc(x + 15, m, 3, 0, Math.PI * 2); if (tone === 4) { g.strokeStyle = C.label3; g.lineWidth = 1.5; g.stroke(); } else { g.fillStyle = [C.label3, C.accent, C.warning, C.success][tone] ?? C.label3; g.fill(); } return text(textOf(col, v, src.row(r)), x + 24, m, F.t, C.label); }
      case "owner": { const v = src.val(r, k), t = textOf(col, v, src.row(r)), pic = avPic(ownerSeed(col, v, t)); g.beginPath(); g.arc(x + 22, m, 10, 0, Math.PI * 2); g.fillStyle = AV.bg ?? C.fillA; g.fill(); if (pic) { g.save(); g.clip(); g.drawImage(pic.img, x + 12, m - 10, 20, 20); g.restore(); } return text(t, x + 38, m, F.t, C.label); }
      case "tag": { const s = textOf(col, src.val(r, k), src.row(r)), tw2 = width(s, F.s) + 16; g.beginPath(); g.roundRect(x + 12, m - 10, tw2, 20, 10); g.fillStyle = C.fillS; g.fill(); return text(s, x + 20, m, F.s, C.label2); }
      case "time": return text(textOf(col, src.val(r, k), src.row(r)), x + 12, m, F.t, C.label2);
      case "prog": { const v = +src.val(r, k) || 0, bw = w - 24 - 42; g.fillStyle = C.fillA; g.beginPath(); g.roundRect(x + 12, m - 2, bw, 4, 2); g.fill(); if (v) { g.fillStyle = v === 100 ? C.success : C.label2; g.beginPath(); g.roundRect(x + 12, m - 2, Math.max(4, bw * v / 100), 4, 2); g.fill(); } return text(col.format ? textOf(col, v, src.row(r)) : v + "%", x + w - 12, m, F.s, C.label2, "right"); }
      case "act": { // 和 DOM 版的 .btn.ghost.sm.ibtn 一样：平时半透明、行悬停变实（120ms）；指着哪个按钮，哪个出底、图标变深。树形多一个"详情"（展开时转 180°）
        const a0 = g.globalAlpha, av = .5 + .5 * tv("h" + r, hov ? 1 : 0); g.globalAlpha = a0 * av;
        for (const [name, bx, z] of [...(src.tree && opt.detail ? [["chevron-down", x + w - 112, "ad:" + r]] : []), ["pencil", x + w - 76, "ae:" + r], ["ellipsis", x + w - 40, "am:" + r]]) { const zv = tv("z" + z, hz === z ? 1 : 0); if (zv > 0) { g.globalAlpha = a0 * av * zv; g.fillStyle = C.ghostHover; g.beginPath(); g.roundRect(bx, m - 14, 28, 28, rBtn); g.fill(); g.globalAlpha = a0 * av; } icon2(name, bx + 6, m - 8, 16, C.label2, C.label, zv, name === "chevron-down" ? tv("ex" + r, expOpen(r) ? 1 : 0) * Math.PI : 0); }
        g.globalAlpha = a0; return; }
      default: { const t = textOf(c, src.val(r, k), src.row(r)); return c.align === "right" ? text(t, x + w - 12, m, F.t, C.label, "right") : text(trunc(t, w - 24, F.t), x + 12, m, F.t, C.label); }
    }
  }
  const SK_NAME = [.64, .48, .72], SK_TXT = [.54, .42, .62], SK_NUM = [.38, .48, .32], SK_ST = [40, 48, 36], SK_OW = [36, 46, 40], SK_TAG = [46, 56, 40];
  function skel(o, y, h = RH, p = -1, seed = 0) {
    const c = o.c; if (c.type === "sel" || c.type === "act") return;
    const v = (((p >= 0 ? p : seed) % 3) + 3) % 3, m = y + h / 2, x = o.x, w = c.w;
    g.fillStyle = C.fillS;
    if (c.key === NAME && c.type !== "sel" && c.type !== "act") {
      let bx = x + 12;
      if (src.tree && p >= 0) bx = treeHead(x, y, h, m, p);
      else if (opt.detail && !src.tree) bx = x + 30;
      const bw = Math.max(24, (x + w - 12 - bx) * SK_NAME[v]);
      g.beginPath(); g.roundRect(bx, m - 4, bw, 8, 4); g.fill();
      return;
    }
    switch (c.type) {
      case "status": {
        g.beginPath(); g.arc(x + 15, m, 3, 0, Math.PI * 2); g.fill();
        const bw = Math.min(SK_ST[v], Math.max(16, w - 36));
        g.beginPath(); g.roundRect(x + 24, m - 4, bw, 8, 4); g.fill();
        return;
      }
      case "owner": {
        g.beginPath(); g.arc(x + 22, m, 10, 0, Math.PI * 2); g.fill();
        const bw = Math.min(SK_OW[v], Math.max(16, w - 50));
        g.beginPath(); g.roundRect(x + 38, m - 4, bw, 8, 4); g.fill();
        return;
      }
      case "tag": {
        const bw = Math.min(SK_TAG[v], Math.max(24, w - 24));
        g.beginPath(); g.roundRect(x + 12, m - 10, bw, 20, 10); g.fill();
        return;
      }
      case "prog": {
        const bw = Math.max(24, w - 24 - 42);
        g.beginPath(); g.roundRect(x + 12, m - 2, bw, 4, 2); g.fill();
        g.beginPath(); g.roundRect(x + w - 12 - 28, m - 4, 28, 8, 4); g.fill();
        return;
      }
      default: {
        const bw = Math.max(20, (w - 24) * (c.align === "right" ? SK_NUM[v] : SK_TXT[v]));
        const bx = c.align === "right" ? x + w - 12 - bw : x + 12;
        g.beginPath(); g.roundRect(bx, m - 4, bw, 8, 4); g.fill();
      }
    }
  }
  // 树形的名称格前半截：每深一级缩进 24px，左边一条条竖的引导线（压在每一级箭头的中线上），展开着的从箭头下面往下引一条；
  // 有下级的是展开箭头（和 .disc 一样：按"该是什么状态"转 90°，200ms；指着时出底、变深），没有的是小圆点。返回名字从哪开始
  function treeHead(x, y, h, m, p) {
    const id = src.idAt(p), lv = src.lvAt(p), ix = x + lv * 24, a0 = g.globalAlpha; g.fillStyle = C.tree;
    if (lv > 0) {
      const gd = treeGuides(src, p);
      for (let j = 0; j < lv; j++) {
        if (j === lv - 1) g.fillRect(x + 15.5 + j * 24, y, 1, gd.last ? h / 2 : h);
        else if (gd.anc[j]) g.fillRect(x + 15.5 + j * 24, y, 1, h);
      }
    }
    if (src.hasKids(id)) {
      const op = src.isOpen(id), ev = tv("tx" + id, op ? 1 : 0), ez = tv("ztx:" + id, hz === "tx:" + id ? 1 : 0);
      if (ev > .01) { g.globalAlpha = a0 * ev; g.fillRect(ix + 15.5, m + 12, 1, Math.max(0, y + h - m - 12) * ev); g.globalAlpha = a0; }
      if (ez > 0) { g.globalAlpha = a0 * ez; g.fillStyle = C.fillHover; g.beginPath(); g.roundRect(ix + 6, m - 10, 20, 20, rSM); g.fill(); g.globalAlpha = a0; }
      icon2("chevron-right", ix + 9, m - 7, 14, C.label3, C.label, ez, ev * Math.PI / 2);
    } else { g.fillStyle = C.lineC; g.beginPath(); g.arc(ix + 16, m, 2.5, 0, Math.PI * 2); g.fill(); }
    return ix + 30;
  }
  function rowBg(r, p, x0, x1, y, hov, h, ra = 1) { // 悬停、勾选换底色都过渡 100ms（和 DOM 版 .g-cell 一样）
    const hv = r >= 0 ? tv("h" + r, hov ? 1 : 0) : 0, sv = r >= 0 ? tv("s" + r, isSel(r) ? 1 : 0) : 0;
    g.globalAlpha = ra; g.fillStyle = C.bg; g.fillRect(x0, y, x1 - x0, h);
    if (hv > 0) { g.globalAlpha = ra * hv; g.fillStyle = C.hover; g.fillRect(x0, y, x1 - x0, h); }
    if (sv > 0) { g.globalAlpha = ra * sv; g.fillStyle = C.sel; g.fillRect(x0, y, x1 - x0, h); if (hv > 0) { g.globalAlpha = ra * sv * hv; g.fillStyle = C.selHover; g.fillRect(x0, y, x1 - x0, h); } }
    g.globalAlpha = ra;
  }
  // ra：整行的透明度（树形展开收起时淡入淡出）；数据刚到的淡入（120ms，40% → 100%）乘在上面。平铺按位置记、树形按行号记（展开收起后位置会变）
  function drawRow(L, zone, p, r, y, hov, x0, x1, ra = 1) {
    if (ra <= .002) return; const H = src.rowH(p), h = r >= 0 && expd.has(r) ? Math.min(H, expd.get(r)) : H; rowBg(r, p, x0, x1, y, hov, h, ra);
    if (drag && drag.hides(p)) { g.fillStyle = C.raised; g.fillRect(x0, y, x1 - x0, h); } // 被拖的行：浮起来的那一块，底色是面板色
    const fk = src.tree ? src.idAt(p) : p, fade = fades.get(fk), a = fade != null ? Math.min(1, (performance.now() - fade) / 120) : 1;
    if (a < 1) { g.globalAlpha = ra * (.4 + .6 * a); more = true; } else if (fade != null) fades.delete(fk);
    for (const o of L.cols) { if (o.zone !== zone || o.x + o.c.w <= x0 || o.x >= x1) continue; const da = headUI.dimNow(o.c.key, fnow); if (da < 1) g.globalAlpha *= da; if (r < 0) skel(o, y, h, p); else cell(o, y, r, p, hov, h); if (da < 1) g.globalAlpha /= da; }
    // 主行底线精准画在 y + h - 1（展开详情时清晰分隔主行与详情面板），网格竖线只画 h - 1 避开底线交点不叠色、绝不戳进详情区
    g.globalAlpha = ra; g.fillStyle = C.line; g.fillRect(x0, y + h - 1, x1 - x0, 1);
    if (root.dataset.lines === "grid") for (const o of L.cols) { if (o.zone !== zone || o.c.type === "act") continue; const rx = o.x + o.c.w - 1; if (rx >= x0 && rx < x1) g.fillRect(rx, y, 1, Math.max(0, h - 1)); } /* 网格：每一格右边一条线 */
    g.globalAlpha = 1;
  }
  function draw() {
    if (raf) cancelAnimationFrame(raf); raf = 0; more = false; /* 直接调 draw()（展开、改行高的每一步）时，把已经排上的那一帧取消——不然一帧里会画好几遍，越积越多 */ const now = performance.now(); dt = Math.min(64, now - lastDraw); lastDraw = now; fnow = now;
    if (headUI.moving(now)) more = true; const mcss = headUI.motionCss("#" + root.id, false, now); if (motionEl.textContent !== "@layer satin{" + mcss + "}") motionEl.textContent = "@layer satin{" + mcss + "}"; /* 表头的位移和表身这一帧一起画 */
    const tr = src.tree; if (tr && mo.tick(now)) more = true; /* 树的过渡：先走钟（收起的下级淡完了就真正收起，结构和滚动位置可能跟着变），再按新的样子画 */
    if (hoverDirty) { hoverDirty = false; if (lastPt && !drag) { const h = hit(lastPt[0], lastPt[1]), mg = h && !h.edge && !h.detail ? merges.at(h.p, h.key)?.m ?? null : null; setHover(h ? h.p : -1, "", false, mg); } } /* 结构变了：指针下面换了一行，悬停跟着换（直接到位） */
    const st = vp.scrollTop, n = src.shown, first = Math.max(0, src.rowAtY(st) - 1), last = Math.min(n, src.rowAtY(st + Hc) + 2);
    src.ensure(first, last); if (src.mode === "append" && last >= n - 4) src.more();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.textBaseline = "middle"; g.fillStyle = C.bg; g.fillRect(0, 0, W, Hc);
    const L = layout(), zones = [["M", L.lw, W - L.rw], ["L", 0, L.lw], ["R", L.rx0, L.rx1]]; drawn = []; // drawn：这一帧画出来的行（行号、y、高），逐帧检查用
    const ddt = drag ? (drag.anim ? Math.min(34, now - drag.lt) : 16.7) : 0; if (drag) { drag.lt = now; drag.anim = false; } // 让位缓动的时间间隔由拖拽自己记：上一帧没在动（拿起前隔几帧才画一次），这一步按一帧算，不会一下走两帧的量
    // 拖行：空位（落点）先走——只有它一个值缓动，别的行按空位摆（rowOffset）；被拖的行跟手，松手后缓动落进空位（取消就回原处）
    if (drag) {
      const k = 1 - Math.exp(-ddt / 45), back = drag.out || drag.cancel, gt = back ? src.rowY(drag.p0) : drag.slot(drag.to);
      drag.gapY = gapStep(drag.gapY, gt, k, ddt, drag.hAt(drag.gapY)); if (drag.gapY !== gt) { more = true; drag.anim = true; } /* 空位每帧有上限：越过一行至少 2.5 帧 */
      if (!drag.done) drag.lift = drag.follow() - src.rowY(drag.p0);
      else { const lt = back ? 0 : drag.slot(drag.to) - src.rowY(drag.p0); drag.lift += (lt - drag.lift) * k; if (Math.abs(lt - drag.lift) < .3) drag.lift = lt; else { more = true; drag.anim = true; } }
    }
    if (src.mode === "append") {
      if (n > lastAppendN && lastAppendN > 0 && !reduced()) { for (let q = lastAppendN; q < Math.min(n, lastAppendN + 6); q++) fades.set(tr ? src.idAt(q) : q, now); }
      lastAppendN = n;
    } else lastAppendN = 0;
    const offs = []; for (let p = first; p < last; p++) { const r = src.rowAt(p), fk = tr ? src.idAt(p) : p; if (r < 0) wasSk.add(fk); else if (wasSk.delete(fk) && !reduced()) fades.set(fk, now); offs.push(rowOffset(p, ddt)); } // 占位变成数据：淡入；拖行时让位每帧按空位算一次
    if (drag) {
      for (const [hy, hh] of gapPieces(drag.gapY, drag.h0, drag.rangeAt(drag.gapY))) { if (hh <= .5) continue; g.fillStyle = C.gapBg; g.fillRect(0, hy - st, W, hh); } // 贴边的一条空行，不圆角不描边
    }
    const xs = tr && mo.busy ? mo.extras(first, last) : []; // 树的过渡里跑出渲染范围、这一帧还看得见的行（滑出去的、原地淡出的）：先画，压在别的行下面
    const ty = (p) => (tr ? mo.y(src.idAt(p)) : 0), ta = (p) => (tr ? mo.op(src.idAt(p)) : 1);
    for (const [zone, x0, x1] of zones) {
      if (x1 <= x0) continue; g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, Hc); g.clip();
      for (const p of xs) { const r = src.rowAt(p), y = src.rowY(p) - st + ty(p), a = ta(p); drawRow(L, zone, p, r, y, false, x0, x1, a); if (zone === "M") drawn.push([r, y, src.rowH(p), a, src.idAt(p)]); }
      for (let p = first; p < last; p++) { if (drag && drag.hides(p)) continue; const r = src.rowAt(p), y = src.rowY(p) - st + offs[p - first] + ty(p), a = ta(p); drawRow(L, zone, p, r, y, p === hoverP && !drag, x0, x1, a); if (zone === "M") drawn.push([r, y, src.rowH(p), a, src.idAt(p)]); }
      g.restore(); font = ""; // restore 会把字体一起恢复，字体缓存跟着作废；不然下一个区域（固定列）会用画布默认的 10px 字
    }
    // 被拖的行：最后画，压在所有行上面；一层投影（拿起时 160ms 淡入，松手后 160ms 淡掉），拿出去了变淡
    if (drag) { // 树形：被拖的那一块（连同展开着的下级），这一帧看得见的那几行
      const p0 = drag.p0, y = src.rowY(p0) - st + drag.lift, h = drag.h0, tIn = Math.min(1, (now - drag.t0) / 160), tOut = drag.done ? Math.min(1, (now - drag.done) / 160) : 0, sh = tIn * (1 - tOut), fade = drag.out && !drag.done ? .55 : 1, ps = drag.lifted(st);
      if (tIn < 1 || (drag.done && tOut < 1)) more = true;
      g.save(); g.globalAlpha = fade; if (sh > 0) { g.shadowColor = `rgba(0,0,0,${(.26 * sh).toFixed(3)})`; g.shadowBlur = 28; g.shadowOffsetY = 10; g.fillStyle = C.raised; g.fillRect(0, y, W, h); } g.restore();
      for (const [zone, x0, x1] of zones) { if (x1 <= x0) continue; g.save(); g.globalAlpha = fade; g.beginPath(); g.rect(x0, 0, x1 - x0, Hc); g.clip(); for (const p of ps) drawRow(L, zone, p, src.rowAt(p), src.rowY(p) - st + drag.lift, false, x0, x1, fade); g.restore(); font = ""; }
      g.save(); g.globalAlpha = fade * (.4 + .6 * sh); g.strokeStyle = C.lineC; g.lineWidth = 1; g.strokeRect(.5, y + .5, W - 1, h - 1); g.restore();
      for (const p of ps) drawn.push([src.rowAt(p), src.rowY(p) - st + drag.lift, src.rowH(p), 1, src.idAt(p)]);
    }
    // 合并单元格：支持 260ms 聚合进场 / 240ms 溶解退场（含手动合并、拆分、撤销、切换行线/网格、展开/收起详情挂起复原）、整块柔和悬停、选中柔底与「拆分」按钮悬停虚线网格预览
    const cellH = (p) => { const rr = src.rowAt(p), hh = src.rowH(p); return rr >= 0 && expd.has(rr) ? Math.min(hh, expd.get(rr)) : hh; };
    const live = merges.active();
    const snapMerge = (x) => ({ m: x.m, zone: merges.zoneOf(x.key0), ids: [...x.m.ids], keys: [...x.keys], key0: x.key0, p0: x.p0, p1: x.p1, r0: src.rowAt(x.p0) });
    mergeFx.diff(live, now, snapMerge);
    const leaves = mergeFx.leaves(now), activeM = activeSelected && !rgRect() ? merges.at(active.p, active.c)?.m ?? null : null, spv = tv("mgsp", splitHover ? 1 : 0);
    if (live.length || leaves.length) for (const [zone, x0, x1] of zones) {
      if (x1 <= x0) continue; g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, Hc); g.clip();
      // 1. 正在拆分 / 挂起溶解的旧合并块：仅内区底色平滑褪去露出独立网格（不重画外框线、不突出 border），旧居中内容轻柔淡出零重影
      for (const lv of leaves) {
        const s0 = lv.snap; if (s0.zone !== zone) continue;
        more = true;
        const o = L.cols.find((c) => c.c.key === s0.key0); if (!o) continue;
        const p0 = src.posOf(s0.ids[0]), p1 = src.posOf(s0.ids.at(-1));
        if (p0 < 0 || p1 < p0 || p1 < first || p0 >= last) continue;
        const w = s0.keys.reduce((t, k) => t + (model.byKey[k]?.w || 0), 0);
        const sy0 = src.rowY(p0), sy = sy0 - st + (offs[Math.max(0, p0 - first)] ?? 0) + ty(p0), segH = src.rowY(p1) + cellH(p1) - sy0;
        if (sy + segH <= 0 || sy >= Hc || w <= 1 || segH <= 1) continue;
        const inv = 1 - lv.q, ra = ta(p0), iw = Math.max(0, w - 1), ih = Math.max(0, segH - 1);
        g.globalAlpha = ra * inv; g.fillStyle = C.bg; g.fillRect(o.x, sy, iw, ih);
        const r0 = src.rowAt(p0);
        if (r0 >= 0) {
          const h0 = cellH(p0), h1 = cellH(p1);
          let cyM = sy + segH / 2;
          const lo = Math.max(sy + h0 / 2, h0 / 2), hi = Math.min(sy + segH - h1 / 2, Hc - h1 / 2);
          if (hi >= lo) cyM = Math.max(lo, Math.min(hi, cyM));
          const cy = cyM + (sy + h0 / 2 - cyM) * lv.q * .65;
          const textA = Math.max(0, 1 - lv.t * 1.9);
          if (textA > .01) {
            g.save(); g.beginPath(); g.rect(o.x, sy, iw, ih); g.clip();
            g.globalAlpha = ra * textA * textA;
            cell({ ...o, c: { ...o.c, w } }, cy - h0 / 2, r0, p0, false, h0);
            g.restore(); font = "";
          }
        }
        g.globalAlpha = 1;
      }
      // 2. 当前活跃合并块：精准覆盖内区（w-1 × segH-1），外圈完全沿用表格单遍 1px 网格线（绝不叠色变粗、进场无突出 border）
      for (const x of live) {
        if (merges.zoneOf(x.key0) !== zone || x.p1 < first || x.p0 >= last) continue;
        const o = L.cols.find((c) => c.c.key === x.key0); if (!o) continue;
        const w = x.keys.reduce((t, k) => t + model.byKey[k].w, 0), r0 = src.rowAt(x.p0), segs = mergeSegs(src, x, cellH);
        const ep = mergeFx.enterP(x.m, now), id = mgId(x.m);
        if (ep < 1) more = true;
        const mhv = tv("mgh" + id, hovMerge === x.m ? 1 : 0), msv = tv("mgs" + id, selMerge === x.m ? 1 : 0);
        let sumAll = 0; if (segs.length > 1) for (let q = x.p0; q <= x.p1; q++) sumAll += cellH(q);
        for (let si = 0; si < segs.length; si++) {
          const s = segs[si];
          if (s.p1 < first || s.p0 >= last) continue;
          const sy0 = src.rowY(s.p0), sy = sy0 - st + (offs[Math.max(0, s.p0 - first)] ?? 0) + ty(s.p0), segH = src.rowY(s.p1) + cellH(s.p1) - sy0;
          if (sy + segH <= 0 || sy >= Hc) continue;
          const ra = ta(s.p0), bgA = Math.min(1, ep * 1.18), iw = Math.max(0, w - 1), ih = Math.max(0, segH - 1);
          // 融合底色仅盖住内部网格线与次要单元格，严丝合缝让出右/底 1px 线由原行单遍绘制
          g.globalAlpha = ra * bgA; g.fillStyle = C.bg; g.fillRect(o.x, sy, iw, ih);
          if (ep < 1) { g.globalAlpha = ra; g.fillStyle = C.bg; g.fillRect(o.x, sy, Math.max(0, o.c.w - 1), Math.max(0, cellH(s.p0) - 1)); } // 首格不重影
          if (msv > .005) { g.globalAlpha = ra * bgA * msv; g.fillStyle = C.mgSel; g.fillRect(o.x, sy, iw, ih); }
          if (mhv > .005) { g.globalAlpha = ra * bgA * mhv; g.fillStyle = C.hover; g.fillRect(o.x, sy, iw, ih); }
          // 悬停工具条「拆分」按钮时，在内容层下方柔和淡入即将切开的虚线网格预览（绝不劈穿标签与文字）
          if (spv > .01 && activeM === x.m) {
            g.save(); g.globalAlpha = ra * spv * .65; g.strokeStyle = C.rgLine; g.lineWidth = 1; g.setLineDash([3, 3]);
            g.beginPath();
            for (let q = s.p0; q < s.p1; q++) { const ly = src.rowY(q) + cellH(q) - sy0 + sy - .5; g.moveTo(o.x + 2, ly); g.lineTo(o.x + iw - 1, ly); }
            let cx = o.x;
            for (let ki = 0; ki < x.keys.length - 1; ki++) { cx += model.byKey[x.keys[ki]].w; g.moveTo(cx - .5, sy + 2); g.lineTo(cx - .5, sy + ih - 1); }
            g.stroke(); g.restore();
          }
          if (r0 >= 0) {
            // 段内内容垂直居中：进场时从第 1 行原位优雅滑落到合并块居中位置；长段滚出表头/视口底时优雅夹在可见区间内绝不被表头腰斩
            const h0 = cellH(s.p0), h1 = cellH(s.p1);
            let midH = segH;
            if (segs.length > 1 && si === 0 && s.dhAfter > 0) midH = sumAll + (segH - sumAll) * Math.min(1, s.dhAfter / Math.min(DETAIL, 48));
            let cy = sy + midH / 2;
            const lo = Math.max(sy + h0 / 2, h0 / 2), hi = Math.min(sy + segH - h1 / 2, Hc - h1 / 2);
            if (hi >= lo) cy = Math.max(lo, Math.min(hi, cy));
            if (ep < 1) cy = (sy + h0 / 2) + (cy - (sy + h0 / 2)) * ep;
            const ca = s.dhBefore > 0 ? Math.min(1, s.dhBefore / Math.min(DETAIL, 48)) : 1;
            if (ca > .005) {
              g.save(); g.beginPath(); g.rect(o.x, sy, iw, ih); g.clip();
              g.globalAlpha = ra * ca;
              cell({ ...o, c: { ...o.c, w } }, cy - h0 / 2, r0, x.p0, false, h0);
              g.restore(); font = "";
            }
          }
          g.globalAlpha = 1;
        }
      }
      g.restore(); font = "";
    }
    // 滚到底再加载：有更多数据时在末尾渲染 3 行列对齐同构渐隐骨架（彻底去文字加载）；全部加载到底时居中克制收尾
    if (src.mode === "append") {
      const y0 = src.rowY(n) - st;
      if (y0 < Hc) {
        if (src.hasMore) {
          const STEP_A = [.92, .58, .28], breath = src.appending && !reduced();
          if (breath) more = true;
          for (const [zone, x0, x1] of zones) {
            if (x1 <= x0) continue;
            g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, Hc); g.clip();
            for (let j = 0; j < SK_MORE; j++) {
              const y = y0 + j * RH;
              if (y >= Hc || y + RH <= 0) continue;
              const sa = STEP_A[j], pa = breath ? .82 + .18 * Math.sin(now / 260 - j * .7) : 1;
              g.globalAlpha = 1; g.fillStyle = C.bg; g.fillRect(x0, y, x1 - x0, RH);
              g.globalAlpha = sa * pa;
              for (const o of L.cols) { if (o.zone !== zone || o.x + o.c.w <= x0 || o.x >= x1) continue; skel(o, y, RH, -1, n + j); }
              g.globalAlpha = sa * .9; g.fillStyle = C.line; g.fillRect(x0, y + RH - 1, x1 - x0, 1);
              if (root.dataset.lines === "grid") for (const o of L.cols) { if (o.zone !== zone || o.c.type === "act") continue; const rx = o.x + o.c.w - 1; if (rx >= x0 && rx < x1) g.fillRect(rx, y, 1, Math.max(0, RH - 1)); }
            }
            g.restore(); font = "";
          }
          g.globalAlpha = 1;
        } else if (src.total > 0) {
          const label = tt("canvas-grid.1", { p0: src.total.toLocaleString("zh-CN") }), tw0 = width(label, F.s), cy = y0 + RH / 2, cx = W / 2;
          g.fillStyle = C.line;
          g.fillRect(Math.round(cx - tw0 / 2 - 34), Math.round(cy), 24, 1);
          g.fillRect(Math.round(cx + tw0 / 2 + 10), Math.round(cy), 24, 1);
          text(label, cx, cy, F.s, C.label3, "center");
        }
      }
    }
    // 表体固定列分隔线：画在普通行、合并格与末尾骨架之上、通栏详情面板之下——与表头 40px .sn-g-shade 无缝对接，且绝不劈穿展开的详情面板或到底收尾行
    {
      const sh = Math.min(Hc, src.rowsH() + (src.mode === "append" && src.hasMore ? SK_MORE * RH : 0) - st);
      if (sh > 0) {
        g.fillStyle = C.line;
        if (vp.scrollLeft > 0 && L.lw > 0) g.fillRect(L.lw - 1, 0, 1, sh);
        if (vp.scrollLeft + W < model.width() - 1 && L.rw > 0) g.fillRect(L.rx0 - 1, 0, 1, sh);
      }
    }
    // 多格范围框选：柔和淡底 + 1.5px 微圆角细框，首次拉出柔和淡入（画在通栏详情下面，跨详情时被详情面板自然盖住，绝不劈穿）
    const R2 = rgRect(), rgK = R2 ? "on" : "";
    if (rgK !== lastRgKey) { lastRgKey = rgK; if (rgK) fx("rga", 0, 1, 130); else TW.delete("rga"); }
    if (R2) {
      const rgA = tv("rga", 1), y = src.rowY(R2.p0) - st, hh = src.rowY(R2.p1) + cellH(R2.p1) - src.rowY(R2.p0);
      for (const [zone, x0, x1] of zones) {
        if (x1 <= x0) continue; const cs = L.cols.filter((o) => o.zone === zone && R2.keys.includes(o.c.key)); if (!cs.length) continue;
        const a = Math.min(...cs.map((o) => o.x)), b = Math.max(...cs.map((o) => o.x + o.c.w));
        const bx = a > 0 ? a - 1 : 0, by = y > 0 ? y - 1 : 0, bw = b - bx, bh = y + hh - by;
        g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, Hc); g.clip(); g.globalAlpha = rgA;
        g.fillStyle = C.rgFill; g.beginPath(); g.roundRect(bx + .75, by + .75, Math.max(0, bw - 1.5), Math.max(0, bh - 1.5), 2); g.fill();
        g.strokeStyle = C.rgLine; g.lineWidth = 1.5; g.stroke();
        g.restore();
      }
    }
    // 当前格子聚焦态（同样画在通栏详情下面，跨详情的合并块绝不劈穿详情面板）：
    // · 可文字内容编辑格（selShown && activeEditable()）：1.5px 柔和细框 + 微圆角 + 极淡底色与内柔晕；
    // · 键盘落在选择器 / 只读格（kbdNav && activeSelected）：仅铺极淡中性定位底色（无边框），绝不出现修改框选；
    // · 鼠标点击选择器 / 只读格：什么都不画。
    const ao = L.cols.find((o) => o.c.key === active.c);
    if (ao && !editing && !drag && document.activeElement === vp && !R2 && (selShown || (kbdNav && activeSelected))) {
      const am = merges.at(active.p, active.c), rp0 = am ? am.p0 : active.p, rp1 = am ? am.p1 : active.p, w = am ? am.keys.reduce((t, k) => t + model.byKey[k].w, 0) : ao.c.w;
      if (rp1 >= first && rp0 < last) {
        const ry = src.rowY(rp0) - st + ty(rp0), ah = src.rowY(rp1) + cellH(rp1) - src.rowY(rp0);
        if (ah >= 4 && ry + ah > 0 && ry < Hc) {
          const bx = ao.x > 0 ? ao.x - 1 : 0, by = ry > 0 ? ry - 1 : 0, bw = ao.x + w - bx, bh = ry + ah - by;
          g.save(); g.beginPath(); const [cx0, cx1] = ao.zone === "M" ? [L.lw, W - L.rw] : [0, W]; g.rect(cx0, 0, cx1 - cx0, Hc); g.clip();
          if (selShown && activeEditable()) {
            g.fillStyle = C.selFill; g.beginPath(); g.roundRect(bx + .75, by + .75, Math.max(0, bw - 1.5), Math.max(0, bh - 1.5), 2); g.fill();
            if (bw > 6 && bh > 6) { g.strokeStyle = C.selGlow; g.lineWidth = 1.5; g.beginPath(); g.roundRect(bx + 2.25, by + 2.25, bw - 4.5, bh - 4.5, 1.5); g.stroke(); }
            g.strokeStyle = C.selLine; g.lineWidth = 1.5; g.beginPath(); g.roundRect(bx + .75, by + .75, Math.max(0, bw - 1.5), Math.max(0, bh - 1.5), 2); g.stroke();
          } else {
            g.fillStyle = C.kbdFill; g.fillRect(ao.x, ry, w, Math.max(0, ah - 1));
          }
          g.restore();
        }
      }
    }
    // 行详情：展开的行下面那一截，贴着视口左边（横滚时不跑）；画在合并单元格、固定列线与框选上面，保证整条详情完整通栏不被劈穿
    for (let p = first; p < last; p++) { const r = src.rowAt(p); if (r >= 0 && expd.has(r) && !(drag && drag.hides(p))) { const a = ta(p); if (a <= .002) continue; g.globalAlpha = a; drawDetail(r, src.rowY(p) - st + offs[p - first] + ty(p) + Math.min(src.rowH(p), expd.get(r)), src.rowH(p) - Math.min(src.rowH(p), expd.get(r))); g.globalAlpha = 1; } }
    // 固定列边上的阴影：不在画布上画，外框上有两条贯通表头和表体的阴影条（.g-shade），和 DOM 版一样
    // 编辑后闪一下（700ms 淡掉）
    for (let k = flashes.length - 1; k >= 0; k--) { const f = flashes[k], t = (now - f.t0) / 700; if (t >= 1) { flashes.splice(k, 1); continue; } more = true; const o = L.cols.find((o) => o.c.key === f.key), p = f.p; if (!o) continue; g.globalAlpha = 1 - t; g.fillStyle = C.flash; g.fillRect(o.x, src.rowY(p) - st + ty(p), o.c.w, src.rowH(p) - 1); g.globalAlpha = 1; }
    // 拖列：被拖那一列的地方画成空位，和表头里那一截（DOM）接上：上沿画到画布外面，看不到圆角；随这一列淡出同步淡入
    const sk = headUI.slotKey();
    if (sk) {
      const o = L.cols.find((c) => c.c.key === sk);
      if (o) {
        const a = 1 - headUI.dimNow(sk, now), bot = Math.min(Hc, rowsH() - st) - 3, [cx0, cx1] = o.zone === "M" ? [L.lw, W - L.rw] : [0, W];
        g.save(); g.beginPath(); g.rect(cx0, 0, cx1 - cx0, Hc); g.clip(); g.globalAlpha = a; g.fillStyle = C.bg; g.fillRect(o.x, 0, o.c.w, Hc);
        if (bot > -3) { g.fillStyle = C.gapBg; g.fillRect(o.x, 0, o.c.w, bot + 3); } // 贴边的一条空列
        g.restore();
      }
    }
    // 松手：等被拖的行落进空位、让开的行回位、投影淡掉（至少 160ms），再真正换顺序——画面不跳
    if (drag?.done) { const t = now - drag.done; if (reduced() || (!drag.anim && t >= 160) || t > 800) { const d = drag; drag = null; commitDrag(d); } else more = true; }
    if (more) schedule();
    root._grid?.onFrame?.(now); /* 逐帧检查用：每画完一帧调一次 */
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

  // ———— 尺寸、列、表头、工具条 ————
  const rowsH = () => src.rowsH() + tailH();
  function sizeBody() { sizer.style.height = Math.max(0, rowsH() - Hc) + "px"; shade(); }
  function shade() { bars.refresh(); shades(root, vp, model, rowsH()); }
  function resize() { dpr = Math.min(2, devicePixelRatio || 1); W = vp.clientWidth; Hc = Math.max(0, vp.clientHeight - HEAD); cv.style.width = W + "px"; cv.style.height = Hc + "px"; cv.width = Math.round(W * dpr); cv.height = Math.round(Hc * dpr); font = ""; sizeBody(); schedule(); }
  function apply() {
    const disp = model.display(), id = "#" + root.id; root.style.setProperty("--sn-gcols", disp.map((c) => c.w + "px").join(" ")); root.style.setProperty("--sn-gw", model.width() + "px");
    let css = "", left = 0, right = 0; disp.forEach((c, k) => { css += `${id} [data-c="${c.key}"]{order:${k}}`; });
    for (const k of model.left) { css += `${id} [data-c="${k}"]{position:sticky;left:${left}px;z-index:2}`; left += model.byKey[k].w; }
    for (const k of [...model.right].reverse()) { css += `${id} [data-c="${k}"]{position:sticky;right:${right}px;z-index:2}`; right += model.byKey[k].w; }
    if (styleEl.textContent !== "@layer satin{" + css + "}") styleEl.textContent = "@layer satin{" + css + "}"; /* 没变就不写：改写样式表有开销，还会打断刚开始的 CSS 动画 */ edges(); shade(); schedule();
  }
  const edges = () => { root.classList.toggle("sn-sx", vp.scrollLeft > 0); root.classList.toggle("sn-ex", vp.scrollLeft + vp.clientWidth < vp.scrollWidth - 1); };
  const autosize = (key) => {
    const c = model.byKey[key], st = vp.scrollTop; let w = width(c.title, F.s) + 56;
    for (let p = src.rowAtY(st); p < Math.min(src.shown, src.rowAtY(st + Hc) + 1); p++) { const r = src.rowAt(p); if (r < 0) continue; const s = textOf(c, src.val(r, key), src.row(r)), lv = src.tree ? src.lvAt(p) : 0, cs = key === NAME && src.tree && src.hasKids(r) && opt.treeCount ? opt.treeCount(src.kidsN(r), lv) || "" : "", cnt = cs ? width(cs, F.s) + 8 : 0; w = Math.max(w, width(s, F.t) + (key === NAME ? 44 + lv * 24 + cnt : c.type === "owner" ? 52 : c.type === "status" ? 40 : 28)); } // 名称：前面箭头那一截 30、右边留 12，树形再加缩进和下级数量
    return Math.max(64, Math.min(480, Math.ceil(w))); /* 只算宽度，由表头滑过去 */
  };
  const selState = () => (src.tree ? tsel.state() : selAll ? (selSet.size ? "some" : "all") : selSet.size ? (src.total > 0 && selSet.size >= src.total ? "all" : "some") : "none"); // 一行一行勾满了也算全选
  // 拖列：浮起的整列里表身那一段——从画布上把这一列现在的样子拷下来（拿起的那一刻，这一列还没开始淡）
  const colGhost = (key) => {
    const o = layout().cols.find((c) => c.c.key === key); if (!o) return null;
    const h = Math.max(0, Math.min(Hc, rowsH() - vp.scrollTop)), c = document.createElement("canvas");
    c.width = Math.round(o.c.w * dpr); c.height = Math.round(h * dpr); c.style.cssText = `display:block;width:${o.c.w}px;height:${h}px`;
    if (h > 0) c.getContext("2d").drawImage(cv, Math.round(o.x * dpr), 0, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  };
  const headUI = mountHead(head, model, { root, vp, src, injectIcons, apply, motion: () => draw(), autosize, reduced, selState, colGhost, onResize: (key, width) => emit("columnResize", { key, width }), onReorder: (keys) => emit("columnReorder", { keys: [...model.left, ...keys, ...model.right] }), onSelAll: () => { if (selMode === "single") return; const prev = visibleSel(); if (src.tree) tsel.setAll(selState() !== "all"); else if (selState() === "all") { selAll = false; selSet.clear(); } else { selAll = true; selSet.clear(); } checkFx(prev); paintBar(); headUI.paint(); schedule(); } });
  // 行数给读屏：aria-rowcount（表头一行 + 现在这一版数据的行数；树形是展开着的行），读屏名里不再写"一百万行"
  const rowCount = () => { const t = src.tree ? src.shown : src.total; if (!Number.isFinite(t)) return; const n = String(t + 1); if (vp.getAttribute("aria-rowcount") !== n) vp.setAttribute("aria-rowcount", n); };
  const paintBar = () => { bar.paint(); rowCount(); selChanged(); };
  const bar = mountToolbar(root, src, model, { $, initSeg, seg: "cgmode", treeSeg: "cgtree", selCount, onMode: () => { vp.scrollTop = 0; sizeBody(); }, onTree: (on) => setTreeMode(on), onExpandAll: () => expandAll(), ...(opt.treeCount && { rootsText: (n) => opt.treeCount(n, -1) }) });
  const sbSeg = $('[data-seg="cgsb"]', root), lnSeg = $('[data-seg="cglines"]', root); // 设计稿的演示才有这两个开关
  if (sbSeg) initSeg(sbSeg, (v) => { bars.mode(v); shade(); schedule(); }, 0);
  root.dataset.lines = o.lines ?? "grid"; merges.enabled = root.dataset.lines === "grid";
  if (lnSeg) initSeg(lnSeg, (v) => { root.dataset.lines = v; merges.enabled = v === "grid"; if (!merges.enabled) rg = null; syncMergeBar(); schedule(); }, 1); /* 表头是 DOM：网格线由 CSS 画，表体在 drawRow 里画；合并单元格只在网格下出现，默认网格 */
  new ResizeObserver(() => { resize(); shade(); }).observe(vp);
  // 表格不回弹：一次滚动在表格里开始，滚到头就停住、不带着页面滚；开始时已经到头，交给页面接着滚（见 kit-scroll.js 的 elastic）
  elastic(vp, () => ({ overscroll: "auto" }), () => { vp.style.overscrollBehaviorY = ""; });
  vp.addEventListener("scroll", () => { edges(); if (editing?.input) editing.end(true, 0, true); if (lastPt && !drag) { const h = hit(lastPt[0], lastPt[1]), mg = h && !h.edge && !h.detail ? merges.at(h.p, h.key)?.m ?? null : null; if ((h ? h.p : -1) !== hoverP || mg !== hovMerge) setHover(h ? h.p : -1, "", false, mg); } schedule(); }, { passive: true }); // 编辑中滚动：能提交就提交，不合法就取消
  vp.addEventListener("focus", schedule); vp.addEventListener("blur", () => { kbdNav = false; schedule(); });

  // ———— 命中判断 ————
  function hit(cx, cy) {
    const r = cv.getBoundingClientRect(), x = cx - r.left, y = cy - r.top; if (x < 0 || y < 0 || x >= W || y >= Hc) return null;
    const yy = y + vp.scrollTop; if (yy >= src.rowsH()) return null; const p = src.rowAtY(yy); if (p < 0 || p >= src.shown) return null; const L = layout(), edge = src.rowY(p) + src.rowH(p) - yy <= 5; // edge：贴着这一行的下边线（拖行高）
    const o = L.cols.find((o) => o.zone === "L" && x >= o.x && x < o.x + o.c.w) || L.cols.find((o) => o.zone === "R" && x >= o.x && x < o.x + o.c.w) || L.cols.find((o) => o.zone === "M" && x >= Math.max(o.x, L.lw) && x < Math.min(o.x + o.c.w, W - L.rw));
    if (!o) return null; const rr = src.rowAt(p), ch = rr >= 0 && expd.has(rr) ? Math.min(src.rowH(p), expd.get(rr)) : src.rowH(p), detail = yy - src.rowY(p) > ch && !edge, mg = merges.at(p, o.c.key), id = src.idAt(p), ax = x - o.x - (src.tree ? src.lvAt(p) * 24 : 0);
    return { p, id, key: o.c.key, col: o.c, x: x - o.x, ox: o.x, edge, detail, exp: o.c.key === NAME && !detail && !mg && ax >= 4 && ax < 28 && (src.tree ? src.hasKids(id) : !!opt.detail), dt: src.tree && !!opt.detail && o.c.type === "act" && x - o.x >= o.c.w - 112 && x - o.x < o.c.w - 84, mp: mg ? mg.p0 : p, mk: mg ? mg.key0 : o.c.key };
  }
  const cellRect = (p, key) => { const L = layout(), o = L.cols.find((o) => o.c.key === key), r = cv.getBoundingClientRect(), y = src.rowY(p) - vp.scrollTop, x = merges.at(p, key), rr = src.rowAt(p), chOf = (q) => { const r2 = src.rowAt(q), hh = src.rowH(q); return r2 >= 0 && expd.has(r2) ? Math.min(hh, expd.get(r2)) : hh; }, w = x ? x.keys.reduce((t, k) => t + model.byKey[k].w, 0) : o.c.w, h = x ? src.rowY(x.p1) + chOf(x.p1) - src.rowY(x.p0) : rr >= 0 && expd.has(rr) ? Math.min(src.rowH(p), expd.get(rr)) : src.rowH(p); return { x: o.x, y, w, left: r.left + o.x, top: r.top + y, right: r.left + o.x + w, bottom: r.top + y + h, width: w, height: h }; };
  cv.addEventListener("pointermove", (e) => {
    lastPt = [e.clientX, e.clientY]; if (e.buttons || drag) return; const h = hit(e.clientX, e.clientY), p = h ? h.p : -1, r = h ? src.rowAt(h.p) : -1;
    const z = !h || h.edge || h.detail ? "" : src.tree && h.exp ? "tx:" + h.id : r < 0 ? "" : h.col.type === "sel" ? (canDrag && h.x < 26 ? "grip:" + r : h.x >= 28 && h.x < 50 ? "ck:" + r : "") : h.col.type === "act" ? (h.dt ? "ad:" + r : h.x >= h.col.w - 76 && h.x < h.col.w - 48 ? "ae:" + r : h.x >= h.col.w - 40 && h.x < h.col.w - 12 ? "am:" + r : "") : h.exp ? "exp:" + r : "";
    const mg = h && !h.edge && !h.detail ? merges.at(h.p, h.key)?.m ?? null : null;
    setHover(p, z, true, mg);
    cv.style.cursor = !h ? "" : h.edge ? "row-resize" : h.col.type === "sel" ? (canDrag && h.x < 26 ? "grab" : h.x >= 28 && h.x < 50 ? "pointer" : "") : h.col.type === "act" || h.exp ? "pointer" : "";
  });
  cv.addEventListener("pointerleave", () => { lastPt = null; if (!drag) setHover(-1, "", true, null); });
  // 表格里任何地方按下、打字：先把还在等落位的拖行落好；正在编辑时点了别处，先把编辑存下来（不合法就停在编辑框里，这一下不生效）
  root.addEventListener("pointerdown", (e) => { flushDrop(); if (editing?.input && e.target !== editing.input) { const inp = editing.input; editing.end(true, 0, false, false); if (editing?.input === inp) { e.preventDefault(); e.stopPropagation(); } } }, true);
  root.addEventListener("keydown", () => flushDrop(), true);
  cv.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; const h = hit(e.clientX, e.clientY); if (!h) return;
    if (src.tree && h.exp) { e.preventDefault(); rg = null; showSel(false); toggleTree(h.p); return; } // 树形：展开下级（值还没到的行也能展开，结构是知道的）
    const r = src.rowAt(h.p); if (r < 0) return;
    if (h.edge) { rg = null; showSel(false); startRowResize(h.p, e); return; }
    if (h.detail) { rg = null; showSel(false); return; }
    if (h.col.type === "sel") {
      rg = null; showSel(false);
      if (canDrag && h.x < 26) { (src.tree ? startTreeDrag : startRowDrag)(h.p, e); return; }
      if (h.x >= 28 && h.x < 50) { e.preventDefault(); const prev = visibleSel(); if (e.shiftKey && anchorP >= 0) { const on = !isSel(r); for (let q = Math.min(anchorP, h.p); q <= Math.max(anchorP, h.p); q++) { const rr = src.tree ? src.idAt(q) : src.rowAt(q); if (rr >= 0) toggleSel(rr, on); } } else toggleSel(r); anchorP = h.p; checkFx(prev, r); paintBar(); headUI.paint(); schedule(); } // 树形：勾上一级 = 勾上它下面所有的
      return;
    }
    if (h.col.type === "act") { e.preventDefault(); rg = null; showSel(false); if (h.dt) { toggleExpand(h.p); return; } if (h.x >= h.col.w - 76 && h.x < h.col.w - 46) { setActive(h.p, NAME, false); showSel(true, false); vp.focus({ preventScroll: true }); startEdit(); } else if (h.x >= h.col.w - 40) emit("rowAction", { action: "more", row: src.row(r), rowKey: keyOf(r), index: h.p }); return; }
    if (h.exp) { e.preventDefault(); rg = null; showSel(false); toggleExpand(h.p); return; }
    e.preventDefault(); vp.focus({ preventScroll: true });
    if (e.shiftKey && activeSelected && merges.enabled) {
      kbdNav = false;
      const ap = rg?.ap ?? active.p, ac = rg?.ac ?? active.c;
      const [a0, k0] = anchorOf(ap, ac), [b0, k1] = anchorOf(h.p, h.key);
      rg = a0 === b0 && k0 === k1 ? null : { ap, ac, fp: h.p, fc: h.key };
      syncMergeBar(); schedule(); return;
    }
    rg = null; setActive(h.p, h.key, false); showSel(true, false);
    if (merges.enabled) startRangeDrag(e, active.p, active.c);
  });
  // 按住格子拖：框选一块（仅在网格模式下启用合并框选）。先动 4px 才算；拖回起点格时清掉范围选区；拖到边上自动滚；指针出了表格就停在边上那一格
  function startRangeDrag(e, ap, ac) {
    let px = e.clientX, py = e.clientY, raf3 = 0, done = false, moved = false;
    const at = (x, y) => { const vr = vp.getBoundingClientRect(); const h = hit(Math.max(vr.left + 2, Math.min(vr.left + W - 2, x)), Math.max(vr.top + HEAD + 2, Math.min(vr.top + HEAD + Hc - 2, y))); return h && h.col.type !== "sel" && h.col.type !== "act" ? [h.p, h.key] : null; };
    const applyPt = (h) => {
      if (!h) return;
      const [bp, bk] = anchorOf(h[0], h[1]);
      if (bp === ap && bk === ac) { if (rg) { rg = null; syncMergeBar(); schedule(); } return; }
      if (!rg || rg.fp !== h[0] || rg.fc !== h[1]) { rg = { ap, ac, fp: h[0], fc: h[1] }; syncMergeBar(); schedule(); }
    };
    const tick = () => {
      raf3 = 0; if (done) return; const vr = vp.getBoundingClientRect(), top = vr.top + HEAD + 24, bot = vr.top + HEAD + Hc - 24, lf = vr.left + model.leftW() + 24, rt = vr.left + W - model.rightW() - 24;
      const dy = py < top ? -(top - py) / 3 : py > bot ? (py - bot) / 3 : 0, dx = px < lf ? -(lf - px) / 3 : px > rt ? (px - rt) / 3 : 0;
      if (dy) vp.scrollTop += Math.max(-24, Math.min(24, dy)); if (dx) vp.scrollLeft += Math.max(-24, Math.min(24, dx));
      applyPt(at(px, py));
      if (dx || dy) raf3 = requestAnimationFrame(tick);
    };
    const mv = (ev) => { px = ev.clientX; py = ev.clientY; if (!moved) { if (Math.hypot(px - e.clientX, py - e.clientY) < 4) return; moved = true; try { cv.setPointerCapture(ev.pointerId); } catch {} } if (!raf3) raf3 = requestAnimationFrame(tick); };
    const fin = () => { if (done) return; done = true; if (moved && raf3) { cancelAnimationFrame(raf3); raf3 = 0; applyPt(at(px, py)); } cancelAnimationFrame(raf3); for (const [t, f] of evs) cv.removeEventListener(t, f); removeEventListener("pointerup", fin); };
    const evs = [["pointermove", mv], ["pointerup", fin], ["pointercancel", fin], ["lostpointercapture", fin]];
    for (const [t, f] of evs) cv.addEventListener(t, f); addEventListener("pointerup", fin);
  }
  cv.addEventListener("click", (e) => { const h = hit(e.clientX, e.clientY); if (!h || h.edge || h.detail || h.exp || h.col.type === "sel" || h.col.type === "act") return; const r = src.rowAt(h.p); if (r >= 0) emit("rowClick", { row: src.row(r), rowKey: keyOf(r), key: h.key, index: h.p }); });
  let atEnd = false; vp.addEventListener("scroll", () => { const end = vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 2; if (end && !atEnd && src.shown > 0) emit("scrollEnd"); atEnd = end; }, { passive: true });
  cv.addEventListener("dblclick", (e) => { const h = hit(e.clientX, e.clientY); if (h?.edge) { resetRowH(h.p); return; } if (!h || h.col.type === "sel" || h.col.type === "act" || h.exp || h.detail) return; rg = null; setActive(h.p, h.key, false); showSel(true, false); startEdit(); });
  function toggleSel(r, on = !isSel(r)) { if (selMode === "single") { selAll = false; selSet.clear(); if (on) selSet.add(r); return; } if (src.tree) tsel.pick(r, on); else if (selAll) on ? selSet.delete(r) : selSet.add(r); else on ? selSet.add(r) : selSet.delete(r); }
  let lastSel = "s"; // 一开始的勾选（平铺、什么都没勾）：挂上时不发 selectionChange
  const sigSel = () => (src.tree ? "t" + tsel.ver : (selAll ? "a" : "s") + [...selSet].join(","));
  // 勾选的 rowKey：树形里是所有勾上的节点（先序）；平铺全选时数组数据照样列全（视图里的全部行去掉 except），按块加载的数据不知道全部的行，是 null
  const selKeys = () => { if (src.tree) return tsel.ids().map(keyOf); if (!selAll) return [...selSet].map(keyOf); const ids = src.viewIds?.(); return ids ? Array.from(ids).filter((id) => !selSet.has(id)).map(keyOf) : null; };
  function selChanged() {
    const sig = sigSel(); if (sig === lastSel) return; lastSel = sig; wantKeys = null; // 用户自己改了勾选：之后按用户的来（受控时父组件会把新的 selectedKeys 传回来）
    emit("selectionChange", !src.tree && selAll ? { keys: selKeys(), all: true, except: [...selSet].map(keyOf) } : { keys: selKeys(), all: false, except: [] });
  }
  // 换数据（data / dataSource 换了）：滚动位置留着；没受控时勾选按 rowKey 带到新数据上（行号会变）
  let keepScroll = false;
  function swapData(n) {
    if (n.selectedKeys == null) { const k = selKeys(); if (k?.length) wantKeys = k; }
    selSet = new Set(); selAll = false; tsel.reset(); lastSel = sigSel(); keepScroll = true;
    src.reset(backendOf({ data: n.data, dataSource: n.dataSource, columns: model.cols, rowKey: n.rowKey, primary: NAME }));
  }
  // 受控的 selectedKeys（或一开始的 defaultSelectedKeys）：按 rowKey 找到行号再勾上（数组数据全都认得；按块加载的只认已经到了的行）
  let wantKeys = o.selectedKeys ?? o.defaultSelectedKeys ?? null;
  function applyKeys() {
    if (!wantKeys) return; const want = new Set(wantKeys), ids = new Set(), all = src.allRows?.();
    if (all) { all.forEach((it, id) => { const k = typeof o.rowKey === "function" ? o.rowKey(it) : it[o.rowKey ?? "id"] ?? id; if (want.has(k)) ids.add(id); }); }
    else for (let p = 0; p < src.shown; p++) { const r = src.rowAt(p); if (r >= 0 && want.has(keyOf(r))) ids.add(r); }
    if (src.tree) { tsel.clear(); for (const id of ids) tsel.pick(id, true); } else { selAll = false; selSet = ids; }
    lastSel = sigSel(); if (o.selectedKeys == null && (all || ids.size >= want.size)) wantKeys = null; schedule(); paintBar(); headUI.paint();
  }
  // 按块加载的数据：要勾的行还没到时，每到一块再对一次（找全了、或者用户自己改了勾选就不再对）
  function keysOnBlock() { if (wantKeys && !src.allRows?.()) applyKeys();
  }

  // ———— 键盘、当前格子 ————
  // 单格修改框选只允许出现在可文字内容编辑的单元格（edit 且非 enum 选择器、非 sel/act 功能列）上；选择器与只读格绝不出现修改框选。
  const isTextEditable = (col) => Boolean(col && col.edit && col.edit !== "enum" && col.type !== "sel" && col.type !== "act");
  const activeEditable = () => { const am = merges.at(active.p, active.c); return isTextEditable(model.byKey[am ? am.key0 : active.c]); };
  function showSel(on, kbd = false) {
    const nextSel = !!on, nextKbd = nextSel && !!kbd, nextShow = nextSel && activeEditable();
    if (activeSelected !== nextSel || kbdNav !== nextKbd || selShown !== nextShow) {
      activeSelected = nextSel; kbdNav = nextKbd; selShown = nextShow;
      syncSelMerge(); schedule(); syncMergeBar();
    }
  }
  const anchorOf = (p, c) => { const x = merges.at(p, c); return x ? [x.p0, x.key0] : [p, c]; };
  function rgRect() {
    if (!rg || !merges.enabled) return null; const disp = model.display().map((c) => c.key);
    const aci = disp.indexOf(rg.ac), fci = disp.indexOf(rg.fc); if (aci < 0 || fci < 0) return null;
    const z = merges.zoneOf(rg.ac), okIdx = disp.map((k, i) => (merges.zoneOf(k) === z && model.byKey[k].type !== "sel" && model.byKey[k].type !== "act" ? i : -1)).filter((i) => i >= 0);
    if (!okIdx.length) return null;
    const clampI = (i) => Math.max(okIdx[0], Math.min(okIdx.at(-1), i));
    let p0 = Math.min(rg.ap, rg.fp), p1 = Math.max(rg.ap, rg.fp), c0 = clampI(Math.min(aci, fci)), c1 = clampI(Math.max(aci, fci));
    for (let more2 = true, n = 0; more2 && n < 8; n++) { more2 = false; for (const x of merges.active()) { if (x.p1 < p0 || x.p0 > p1 || x.c1 < c0 || x.c0 > c1) continue; if (x.p0 < p0) { p0 = x.p0; more2 = true; } if (x.p1 > p1) { p1 = x.p1; more2 = true; } if (x.c0 < c0) { c0 = x.c0; more2 = true; } if (x.c1 > c1) { c1 = x.c1; more2 = true; } } }
    const keys = disp.slice(c0, c1 + 1);
    if (p0 === p1 && c0 === c1) return null;
    const am = merges.at(p0, keys[0]);
    if (am && am.p0 === p0 && am.p1 === p1 && am.c0 === c0 && am.c1 === c1) return null;
    return { p0, p1, c0, c1, keys };
  }
  function setActive(p, c, reveal = true) {
    [p, c] = anchorOf(Math.max(0, Math.min(src.shown - 1, p)), c); active = { p, c, id: src.idAt(p) };
    if (activeSelected) selShown = activeEditable();
    syncSelMerge();
    if (reveal) revealActive(); schedule(); syncMergeBar();
    const r = src.rowAt(active.p), col = model.byKey[c], lv = src.tree ? tt("canvas-grid.3", { p0: src.lvAt(active.p) + 1, p1: src.hasKids(r) ? (src.isOpen(r) ? tt("canvas-grid.25") : tt("canvas-grid.26")) : "" }) : ""; if (r >= 0) sr.textContent = tt("canvas-grid.4", { p0: active.p + 1, p1: lv, p2: col.title || tt("canvas-grid.27"), p3: textOf(col, src.val(r, c), src.row(r)) });
  }
  function revealActive() {
    const top = src.rowY(active.p), rh = src.rowH(active.p); if (top < vp.scrollTop) vp.scrollTop = top; else if (top + rh > vp.scrollTop + Hc) vp.scrollTop = top + rh - Hc;
    const c = model.byKey[active.c]; if (c.pin) return; const x = model.xOf(active.c), lo = vp.scrollLeft + model.leftW(), hi = vp.scrollLeft + W - model.rightW();
    if (x < lo) vp.scrollLeft = x - model.leftW(); else if (x + c.w > hi) vp.scrollLeft = x + c.w - W + model.rightW();
  }
  const navCols = () => model.display().filter((c) => c.type !== "sel" && c.type !== "act").map((c) => c.key);
  const moveActive = (step) => { const d = navCols(), i = d.indexOf(active.c); setActive(active.p, d[Math.max(0, Math.min(d.length - 1, i + step))]); };
  vp.addEventListener("keydown", (e) => {
    if (editing) return; const d = navCols(), ci = d.indexOf(active.c), page = Math.max(1, Math.floor(Hc / RH) - 1);
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); moveByKey(e.key === "ArrowUp" ? -1 : 1); return; }
    if (e.key === "Escape") { if (rg || selShown || activeSelected) { e.preventDefault(); rg = null; showSel(false); schedule(); } return; }
    const nav = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }[e.key];
    if (nav && e.shiftKey && merges.enabled) {
      e.preventDefault(); showSel(true, true);
      const b = rg || { ap: active.p, ac: active.c, fp: active.p, fc: active.c };
      const fp = Math.max(0, Math.min(src.shown - 1, b.fp + nav[0])), fc = d[Math.max(0, Math.min(d.length - 1, d.indexOf(b.fc) + nav[1]))];
      const [a0, k0] = anchorOf(b.ap, b.ac), [f0, fk] = anchorOf(fp, fc);
      rg = a0 === f0 && k0 === fk ? null : { ...b, fp, fc };
      syncMergeBar(); schedule(); return;
    }
    const go = (p, c) => { e.preventDefault(); rg = null; setActive(p, c ?? active.c); showSel(true, true); };
    const am = merges.at(active.p, active.c), cEnd = am ? d.indexOf(am.keys.at(-1)) : ci; // 从合并块出来时越过整块
    // 树形，在名称格上：右键展开（已经展开或没有下级时往右走一格），左键收起、再按走到上级（和简单表格一样）
    if (src.tree && active.c === NAME && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const id = src.idAt(active.p), has = src.hasKids(id), op = has && src.isOpen(id); showSel(true, true);
      if (e.key === "ArrowRight" && has && !op) { e.preventDefault(); toggleTree(active.p, true); setActive(active.p, NAME, false); return; }
      if (e.key === "ArrowLeft" && op) { e.preventDefault(); toggleTree(active.p, false); setActive(active.p, NAME, false); return; }
      if (e.key === "ArrowLeft" && src.parentOf(id) >= 0) { const pp = src.findPos(src.parentOf(id)); if (pp >= 0) return go(pp, NAME); }
    }
    switch (e.key) {
      case "ArrowDown": return go((am ? am.p1 : active.p) + 1); case "ArrowUp": return go(active.p - 1);
      case "ArrowRight": return go(active.p, d[Math.min(d.length - 1, cEnd + 1)]); case "ArrowLeft": return go(active.p, d[Math.max(0, ci - 1)]);
      case "Tab": return go(active.p, d[Math.max(0, Math.min(d.length - 1, e.shiftKey ? ci - 1 : cEnd + 1))]);
      case "PageDown": return go(active.p + page); case "PageUp": return go(active.p - page);
      case "Home": return e.ctrlKey || e.metaKey ? go(0) : go(active.p, d[0]); case "End": return e.ctrlKey || e.metaKey ? go(src.shown - 1) : go(active.p, d.at(-1));
      case "Enter": case "F2": e.preventDefault(); showSel(true, true); startEdit(); return;
      case " ": { e.preventDefault(); const r = src.rowAt(active.p); if (r >= 0) { const prev = visibleSel(); toggleSel(r); checkFx(prev, r); paintBar(); headUI.paint(); schedule(); } return; }
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { const c = model.byKey[active.c]; if (isTextEditable(c)) { e.preventDefault(); showSel(true, true); startEdit(e.key); } }
  });
  head.addEventListener("pointerdown", () => { rg = null; showSel(false); }); // 点表头
  frame.addEventListener("pointerdown", (e) => { if (e.target.closest(".sn-g-sb")) { rg = null; showSel(false); } }); // 点滚动条

  // ———— 编辑：在格子位置盖一个输入框；选项列弹出选项 ————
  let errEl = null;
  const hideErr = () => { errEl?.remove(); errEl = null; if (editing?.input) editing.input.classList.remove("sn-bad"); };
  function startEdit(initial) {
    const c = model.byKey[active.c], r = src.rowAt(active.p); if (!c.edit || r < 0) return;
    revealActive(); draw(); const rc = cellRect(active.p, c.key), cur = src.val(r, c.key), p = active.p;
    const done = (changed, v, refocus = true) => { if (changed) { const row = src.row(r); src.edit(r, c.key, v); flashes.push({ p, key: c.key, t0: performance.now() }); emit("cellEdit", { row, rowKey: keyOf(r), key: c.key, value: v, oldValue: cur }); } editing = null; if (refocus) vp.focus({ preventScroll: true }); schedule(); };
    if (c.edit === "enum") {
      const wasKbd = kbdNav;
      editing = { input: null }; showSel(false); schedule();
      openEnum(rc, c, optionOf(c, cur)?.i ?? -1, (k, step) => {
        const nv = optionValue(c, k, cur);
        done(nv !== cur, nv, Boolean(step || wasKbd));
        if (step) { moveActive(step); showSel(true, true); } else if (wasKbd) showSel(true, true);
      }, () => {
        done(false, undefined, wasKbd);
        if (wasKbd) showSel(true, true);
      });
      return;
    }
    const input = document.createElement("input"); input.className = "sn-cell-ed sn-cg-ed" + (c.align === "right" ? " sn-r" : ""); input.value = initial ?? editText(c, cur); input.spellcheck = false;
    const ih = Math.min(rc.height, Math.max(RH, src.rowH(p))) - 6; Object.assign(input.style, { left: rc.x + 4 + "px", top: HEAD + rc.y + (rc.height - ih) / 2 + "px", width: rc.width - 8 + "px", height: ih + "px" }); frame.append(input); input.focus({ preventScroll: true }); if (initial == null) input.select();
    const end = (commit, step = 0, soft = false, refocus = true) => {
      if (!editing || editing.input !== input) return;
      if (commit && soft && parseEdit(c, input.value).error) commit = false;
      if (commit) { const res = parseEdit(c, input.value); if (res.error) { hideErr(); input.classList.add("sn-bad"); errEl = document.createElement("div"); errEl.className = "sn-g-err"; errEl.textContent = res.error; document.body.append(errEl); const b = input.getBoundingClientRect(); errEl.style.left = b.left + "px"; errEl.style.top = b.bottom + 6 + "px"; input.focus({ preventScroll: true }); return; } hideErr(); input.remove(); done(res.value !== cur, res.value, refocus); }
      else { hideErr(); input.remove(); done(false, undefined, refocus); }
      if (step === "down") { const am = merges.at(active.p, active.c); setActive((am ? am.p1 : active.p) + 1, active.c); showSel(true, true); }
      else if (step) { moveActive(step); showSel(true, true); }
    };
    editing = { input, end };
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); end(true, "down"); } else if (e.key === "Escape") { e.preventDefault(); end(false); } else if (e.key === "Tab") { e.preventDefault(); end(true, e.shiftKey ? -1 : 1); } });
    input.addEventListener("input", hideErr);
    input.addEventListener("blur", () => setTimeout(() => { if (editing?.input === input) end(true, 0, false, false); }, 0));
  }

  // ———— 拖行换位置 ————
  // 按住把手移动 4px 才算拿起。被拖的行直接画在它要落下的位置（落点框 + 一点阴影），其他行实时让开；指针旁边跟一个小标签（"→ 第 N 行"），不挡表格。
  // 靠近上下边缘自动滚；拖到表格外 40px 以外 = 拿出去了（行回原位、标签写"松手取消"），松手就取消；Esc、窗口失焦、指针被系统收走也取消。合并块里的行不能单独拖，落点不插进合并块中间
  function commitDrag(d) {
    if (d.tree) { if (!d.cancel && d.D.commit(d.to)) { afterTree(); headUI.paint(); } } // 树形：在兄弟里换位置（排序时拖了：排好的顺序就当成手动顺序）
    else if (d.to !== d.p0) { src.move(d.p0, d.to); if (active.p === d.p0) active.p = d.to; else if (d.p0 < d.to && active.p > d.p0 && active.p <= d.to) active.p--; else if (d.p0 > d.to && active.p >= d.to && active.p < d.p0) active.p++; active.id = src.idAt(active.p); }
    sizeBody(); syncMergeBar(); more = true;
  }
  function startRowDrag(p0, e) {
    e.preventDefault(); flushDrop();
    if (!src.canMove()) { toast({ icon: "info", tone: "info", text: tt("canvas-grid.5") }); return; }
    if (merges.active().some((x) => x.p1 > x.p0 && p0 >= x.p0 && p0 <= x.p1)) { toast({ icon: "info", tone: "info", text: tt("canvas-grid.6") }); return; }
    const n = src.shown, y0 = src.rowY(p0), sx = e.clientX, sy = e.clientY, s0 = vp.scrollTop; let py = sy, px = sx, raf2 = 0, done = false, on = false, lastTop = s0; // 拿起的位置固定下来；被拖的行高度按实时的算
    const slot = (t) => (t <= p0 ? src.rowY(t) : src.rowY(t + 1) - src.rowH(p0));
    const nearest = (y) => { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (slot(m) <= y) lo = m; else hi = m - 1; } return lo + 1 < n && Math.abs(slot(lo + 1) - y) < Math.abs(y - slot(lo)) ? lo + 1 : lo; };
    const snap = (t) => { for (const x of merges.active()) { if (x.p1 === x.p0) continue; if (x.p0 > p0 && t >= x.p0 && t <= x.p1 - 1) return t - (x.p0 - 1) <= x.p1 - t ? x.p0 - 1 : x.p1; if (x.p1 < p0 && t >= x.p0 + 1 && t <= x.p1) return t - x.p0 <= x.p1 + 1 - t ? x.p0 : x.p1 + 1; } return t; };
    const upd = () => {
      const b = frame.getBoundingClientRect(); drag.out = px < b.left - 40 || px > b.right + 40 || py < b.top - 40 || py > b.bottom + 40;
      drag.to = drag.out ? p0 : snap(nearest(Math.max(0, Math.min(slot(n - 1), drag.follow())))); schedule();
    };
    const tick = () => { if (on && vp.scrollTop !== lastTop) { lastTop = vp.scrollTop; upd(); } if (on && !drag.out && !drag.done) { const vr = vp.getBoundingClientRect(), top = vr.top + HEAD + 32, bot = vr.top + vp.clientHeight - 32, sp = py < top ? -(top - py) / 2.5 : py > bot ? (py - bot) / 2.5 : 0; if (sp) { vp.scrollTop += Math.max(-28, Math.min(28, sp)); upd(); } } raf2 = requestAnimationFrame(tick); };
    raf2 = requestAnimationFrame(tick);
    try { cv.setPointerCapture(e.pointerId); } catch {}
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fin(true); } }, onBlur = () => fin(true);
    const evs = [["pointermove", (ev) => { px = ev.clientX; py = ev.clientY; if (!on) { if (Math.hypot(px - sx, py - sy) < 4) return; on = true; drag = { p0, get h0() { return src.rowH(p0); }, slot, to: p0, off: new Map(), out: false, cancel: false, done: 0, t0: performance.now(), lift: 0, gapY: y0, follow: () => dragClamp(y0 + py - sy + vp.scrollTop - s0, 0, slot(n - 1), vp.scrollTop, Hc, src.rowH(p0)),
          hides: (p) => p === p0, shift: (p) => slotShift(src.rowY(p), src.rowH(p), p < p0, drag.h0, drag.gapY), hAt: (G) => src.rowH(G < src.rowY(p0) ? src.rowAtY(G) : src.rowAtY(G + drag.h0)), rangeAt: (G) => { const b = G < src.rowY(p0), r = src.rowAtY(b ? G : G + drag.h0); return [src.rowY(r) - (b ? 0 : drag.h0), src.rowH(r)]; }, lifted: () => [p0] }; cv.style.cursor = "grabbing"; } /* follow：被拖的行顶部 = 拿起的位置 + 指针移动 + 拖着时滚动（夹在首尾之间、看得见的那一段里）；shift：按空位摆 */ upd(); }], ["pointerup", () => fin(false)], ["pointercancel", () => fin(true)], ["lostpointercapture", () => fin(true)]];
    for (const [t, f] of evs) cv.addEventListener(t, f); document.addEventListener("keydown", onKey, true); addEventListener("blur", onBlur);
    function fin(cancel) {
      if (done) return; done = true; cancelAnimationFrame(raf2); for (const [t, f] of evs) cv.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", onBlur); cv.style.cursor = "";
      if (!on) return; if (cancel || drag.out) { drag.cancel = true; drag.to = p0; } drag.done = performance.now(); schedule();
    }
  }
  // ———— 树形拖行：只在同一组兄弟里换位置，连同展开着的下级一起走（treeDrag 算兄弟、落点、让位，和 DOM 版共用） ————
  // 拿起时展开收起的过渡还在走：收起马上做完，每一行从现在看到的位置接着走；排序时也能拖（松手后排好的顺序就当成手动顺序）
  function startTreeDrag(p, e) {
    e.preventDefault(); flushDrop();
    if (!src.canMove()) { toast({ icon: "info", tone: "info", text: tt("canvas-grid.7") }); return; }
    if (merges.active().some((x) => x.p1 > x.p0 && p >= x.p0 && p <= x.p1)) { toast({ icon: "info", tone: "info", text: tt("canvas-grid.6") }); return; }
    const id0 = src.idAt(p), sx = e.clientX; let sy = e.clientY, py = sy, px = sx, raf2 = 0, done = false, on = false, lastTop = 0, D = null, y0 = 0, s0 = 0, wait = false; if (id0 < 0) return;
    const begin = () => {
      const seed = mo.release(), p0 = src.findPos(id0); if (p0 < 0) return false;
      D = treeDrag(src, merges, p0); const lift = seed.get(p0) ?? 0; y0 = src.rowY(p0) + lift; s0 = vp.scrollTop; lastTop = s0; on = true; cv.style.cursor = "grabbing";
      const off = new Map(); for (const [q, v] of seed) if (!D.inMe(q)) off.set(q, v);
      drag = { tree: true, D, p0, get h0() { return D.H(); }, slot: D.slotTop, to: D.idx, off, out: false, cancel: false, done: 0, t0: performance.now(), lift, gapY: y0,
        follow: () => dragClamp(y0 + py - sy + vp.scrollTop - s0, D.lo(), D.hi(), vp.scrollTop, Hc, D.H()), // 被拖的块顶部：拿起时看到的位置 + 指针移动 + 拖着时滚动（夹在这一组兄弟的首尾之内、看得见的那一段里）
        hides: D.inMe, shift: (q) => D.shift(q, drag.gapY), hAt: (G) => D.hAt(G), rangeAt: (G) => D.rangeAt(G), abort: () => { done = true; cancelAnimationFrame(raf2); for (const [t, f] of evs) cv.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", onBlur); cv.style.cursor = ""; }, // 视图换了：马上放回去（不换顺序）
        lifted(st) { const out = []; for (let q = Math.max(D.me.p, src.rowAtY(st - drag.lift) - 1), z = Math.min(D.me.e, src.rowAtY(st + Hc - drag.lift) + 2); q < z; q++) out.push(q); return out; } }; // 这一块里这一帧看得见的那几行（块可能比视口还高）
      return true;
    };
    const upd = () => { const b = frame.getBoundingClientRect(); drag.out = px < b.left - 40 || px > b.right + 40 || py < b.top - 40 || py > b.bottom + 40; drag.to = drag.out ? D.idx : D.target(drag.follow()); schedule(); };
    // 收起的下级还在淡出（结构上还在）：先不拿起，等淡完（不到 120ms）再从看到的位置拿起——按住的那一点从这时候算，不会一下跳到指针下面
    const go = () => { wait = false; if (mo.fading()) { wait = true; return; } if (!begin()) { fin(true); return; } upd(); };
    const tick = () => { if (wait && !mo.fading()) { sy = py; go(); } if (on && vp.scrollTop !== lastTop) { lastTop = vp.scrollTop; upd(); } if (on && !drag.out && !drag.done) { const vr = vp.getBoundingClientRect(), top = vr.top + HEAD + 32, bot = vr.top + vp.clientHeight - 32, st = vp.scrollTop; let sp = py < top ? -(top - py) / 2.5 : py > bot ? (py - bot) / 2.5 : 0; if ((sp > 0 && D.top0() + D.total() <= st + Hc + .5) || (sp < 0 && D.top0() >= st - .5)) sp = 0; /* 只在这一组兄弟的范围里自动滚 */ if (sp) { vp.scrollTop += Math.max(-28, Math.min(28, sp)); upd(); } } if (!done) raf2 = requestAnimationFrame(tick); };
    raf2 = requestAnimationFrame(tick);
    try { cv.setPointerCapture(e.pointerId); } catch {}
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fin(true); } }, onBlur = () => fin(true);
    const evs = [["pointermove", (ev) => { px = ev.clientX; py = ev.clientY; if (!on) { if (wait || Math.hypot(px - sx, py - sy) < 4) return; go(); return; } upd(); }], ["pointerup", () => fin(false)], ["pointercancel", () => fin(true)], ["lostpointercapture", () => fin(true)]];
    for (const [t, f] of evs) cv.addEventListener(t, f); document.addEventListener("keydown", onKey, true); addEventListener("blur", onBlur);
    function fin(cancel) {
      if (done) return; done = true; cancelAnimationFrame(raf2); for (const [t, f] of evs) cv.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", onBlur); cv.style.cursor = "";
      if (!on) return; if (cancel || drag.out) { drag.cancel = true; drag.to = D.idx; } drag.done = performance.now(); schedule();
    }
  }
  // ———— 树形：展开收起（名称前的箭头、名称格上的左右键、全部展开 / 收起），过渡由 createRowMotion 管（和 DOM 版共用） ————
  const mo = createRowMotion(src, { reduced, view: () => ({ st: vp.scrollTop, vh: Hc }), scrollTo: (y) => { vp.scrollTop = y; }, sync: () => sizeBody(), after: afterTree });
  // 箭头转（200ms，和 .disc 一样）：看得见的那几行，状态变了的
  const visIds = () => { const st = vp.scrollTop, out = []; for (let p = Math.max(0, src.rowAtY(st) - 1); p < Math.min(src.shown, src.rowAtY(st + Hc) + 2); p++) { const id = src.idAt(p); if (src.hasKids(id)) out.push([id, src.isOpen(id)]); } return out; };
  const arrowFx = (before) => { for (const [id, was] of before) { const now = src.isOpen(id); if (now !== was) fx("tx" + id, was ? 1 : 0, now ? 1 : 0, 200); } };
  function toggleTree(p, open) {
    flushDrop(); const id = src.idAt(p); if (id < 0 || !src.hasKids(id) || mo.exiting(id) || (drag && !drag.done)) return; // 正在淡出的行（上级刚收起）点了不算
    if (open == null) open = !src.isOpen(id); if (open === src.isOpen(id)) return;
    const before = visIds(); mo.toggle([id], open); arrowFx(before); paintBar(); schedule(); /* 起点那一帧由同一帧里的 draw 画（改完结构钟的起点挪到了现在，这一帧不走钟） */
  }
  function expandAll() { flushDrop(); if (!src.tree || src.busy || (drag && !drag.done)) return; const before = visIds(); mo.toggle(null, !src.allOpen()); arrowFx(before); paintBar(); schedule(); } // 所有级一起展开 / 收起
  // 结构变了（展开收起、换位置）：当前格子跟着它那一行走；那一行被收起了，就到最近的看得见的上级
  function afterTree() {
    let id = active.id ?? -1, p = id >= 0 ? src.findPos(id) : -1; while (p < 0 && id >= 0) { id = src.parentOf(id); p = id >= 0 ? src.findPos(id) : -1; }
    if (p >= 0) active = { ...active, p, id }; else { active.p = Math.min(active.p, Math.max(0, src.shown - 1)); active.id = src.idAt(active.p); }
    rg = null; anchorP = -1; hoverDirty = true; syncMergeBar(); paintBar(); schedule(); /* 指着的那一行在下一帧画的时候再找（这里量会多一次强制排版） */
  }
  // 平铺 / 树形：两套视图（名字、行高、合并、详情、展开状态各记各的）；先把手上的事（落位、编辑、过渡）做完
  function setTreeMode(on) { flushDrop(); if (editing?.end) editing.end(true, 0, true); mo.reset(); hAnim.clear(); expAnim.clear(); expTo.clear(); src.setTree(on); }
  let shownTree = false;
  function syncTree() { // 新视图到了：换成这一套的外观（操作列多一个"详情"按钮、名称列宽一些放得下缩进）
    const t = src.tree; if (t === shownTree) return; shownTree = t; expd = EXPD[t ? "tree" : "flat"]; merges.invalidate(); mergeFx.reset(); hovMerge = null; selMerge = null; wasSk.clear(); fades.clear(); TW.clear(); hoverP = -1; hz = "";
    treeCols(model, t); apply(); active = { p: 0, c: NAME, id: src.idAt(0) };
  }
  // ———— 拖行高：在最左边那一列拖某一行的下边线（底边 5px，光标变上下箭头）；双击恢复默认；全选时所有行一起改（被拖那一行在视口里不动） ————
  // 一条横的参考线和高度数字跟着；往下拖出表格底边会自动往下滚、行接着变高；Esc 恢复原来的高度
  const MINH = 24, MAXH = 160;
  // 行高平滑变到 h1（Esc 回到原来的高度、双击下边线恢复默认）：160ms 缓出，按行号改；展开着的行连同详情一起算
  const hAnim = new Map();
  function easeRowH(p, h1) {
    const r = src.rowAt(p); if (r < 0) return; src.track(r, p); const h0 = src.rowH(p), tok = {}, dur = reduced() ? 0 : 160; let t0 = 0; hAnim.set(r, tok);
    const step = (now) => { if (hAnim.get(r) !== tok) return; if (!t0) t0 = now - 16.7; const k = dur ? Math.max(0, Math.min(1, (now - t0) / dur)) : 1, h = k < 1 ? h0 + (h1 - h0) * (1 - (1 - k) ** 3) : h1; if (expd.has(r)) expd.set(r, Math.max(MINH, h - DETAIL)); src.setIdH(r, h); sizeBody(); draw(); if (k < 1) requestAnimationFrame(step); else hAnim.delete(r); };
    requestAnimationFrame(step);
  }
  function startRowResize(p, e) {
    flushDrop(); hAnim.delete(src.rowAt(p)); // 上一次的平滑恢复还没走完：停在现在的高度，从这里接着拖
    e.preventDefault();
    const h0 = src.rowH(p), all = selState() === "all", y0 = e.clientY, line = document.createElement("i"); line.className = "sn-g-rhline"; frame.append(line); root.classList.add("sn-rowsizing");
    let py = y0, cur = h0, scrolled = 0, raf3 = 0, done = false;
    const set = (h) => { if (h === cur) return; cur = h; const er = src.rowAt(p); if (!all && expd.has(er)) expd.set(er, Math.max(MINH, h - DETAIL)); if (all) { const a = src.rowY(p) - vp.scrollTop; src.setBaseH(h); sizeBody(); vp.scrollTop = src.rowY(p) - a; } else { src.setRowH(p, h); sizeBody(); } schedule(); };
    const step = () => {
      raf3 = 0; const yb = vp.getBoundingClientRect().top + vp.clientHeight - 2; set(Math.max(MINH, Math.min(MAXH, Math.round(h0 + Math.min(py, yb) - y0 + scrolled)))); // 边线最远到表格底边，超出的距离只决定往下滚多快
      line.style.top = HEAD + src.rowY(p) + cur - vp.scrollTop - 1 + "px"; line.style.width = vp.clientWidth + "px"; line.dataset.h = all ? tt("canvas-grid.8", { p0: cur }) : tt("canvas-grid.9", { p0: cur });
      const over = py - (vp.getBoundingClientRect().top + vp.clientHeight - 16);
      if (over > 0 && cur < MAXH) { const s = vp.scrollTop; vp.scrollTop = s + Math.min(24, over / 2.5); scrolled += vp.scrollTop - s; raf3 = requestAnimationFrame(step); }
    };
    step();
    try { cv.setPointerCapture(e.pointerId); } catch {} cv.style.cursor = "row-resize";
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fin(); if (all) { src.setBaseH(h0); sizeBody(); schedule(); } else easeRowH(p, h0); } }; // Esc：平滑回到原来的高度
    const evs = [["pointermove", (ev) => { py = ev.clientY; if (!raf3) raf3 = requestAnimationFrame(step); }], ["pointerup", () => fin()], ["pointercancel", () => fin()], ["lostpointercapture", () => fin()]];
    for (const [t, f] of evs) cv.addEventListener(t, f); document.addEventListener("keydown", onKey, true); addEventListener("blur", fin);
    function fin() { if (done) return; done = true; cancelAnimationFrame(raf3); for (const [t, f] of evs) cv.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", fin); line.remove(); root.classList.remove("sn-rowsizing"); cv.style.cursor = ""; schedule(); }
  }
  function resetRowH(p) { const r = src.rowAt(p); if (selState() === "all") { src.setBaseH(RH); sizeBody(); schedule(); } else easeRowH(p, RH + (r >= 0 && expd.has(r) ? DETAIL : 0)); } // 双击下边线：平滑恢复默认（展开着的行连同详情）
  function moveByKey(d) {
    if (src.tree) return moveTreeByKey(d);
    if (!src.canMove()) { toast({ icon: "info", tone: "info", text: tt("canvas-grid.5") }); return; }
    const p = active.p, to = p + d; if (to < 0 || to >= src.shown || src.rowAt(p) < 0 || src.rowAt(to) < 0) return;
    src.move(p, to); active.p = to; revealActive(); schedule();
  }
  // 树形：和上一个 / 下一个兄弟换位置（连同展开着的下级），行滑过去；排序时先把排好的顺序当成手动顺序
  function moveTreeByKey(d) {
    if (!src.canMove()) { toast({ icon: "info", tone: "info", text: tt("canvas-grid.10") }); return; }
    if (mo.fading()) { mo.later(() => moveTreeByKey(d)); return; } // 收起的下级还在淡出：淡完再挪
    flushDrop(); const id = src.idAt(active.p); if (id < 0 || drag) return; mo.release();
    const p = src.findPos(id), { list } = src.siblings(p), i = list.findIndex((b) => b.id === id), j = i + d; if (j < 0 || j >= list.length) return;
    mo.relayout(() => { src.adoptSort(); if (d < 0) src.moveNode(id, list[j].id); else src.moveNode(id, -1, list[j].id); });
    active = { ...active, p: src.findPos(id), id }; revealActive(); schedule(); headUI.paint();
  }

  readColors(); apply(); paintBar(); headUI.paint(); resize();
  // ———— 行详情（画在展开的行下面那一截，贴着视口左边）：底色、底边完整分隔线由表格画（裁剪区含完整高度 h），展开/收起时内容柔和淡入淡出 ————
  function drawDetail(r, y, h) {
    if (h <= 1 || y > Hc || y + h < 0) return;
    const a0 = g.globalAlpha, ca = Math.min(1, Math.max(0, (h - 6) / 36));
    g.save(); g.beginPath(); g.rect(0, y, W, h); g.clip();
    g.fillStyle = C.dtBg; g.fillRect(0, y, W, h);
    if (ca > .01) { g.globalAlpha = a0 * ca; opt.detail?.draw?.({ g, row: src.row(r), r, y, w: W, h, C, F, text, trunc, width }); g.globalAlpha = a0; }
    g.fillStyle = C.line; g.fillRect(0, y + h - 1, W, 1);
    g.restore(); font = "";
  }

  // ———— 行展开收起：名称前面的小三角；220ms 缓缓长高，下面的行跟着往下走 ————
  // 连点：只让最新的那次动，从现在的高度接着走；动的过程中排序、筛选、拖行换了位置，按行号接着改，不会卡在半高
  function toggleExpand(p) {
    flushDrop(); const r = src.rowAt(p); if (r < 0) return; const open = !expOpen(r); expTo.set(r, open);
    const h0 = expd.get(r) ?? src.rowH(p), from = src.rowH(p), to = open ? h0 + DETAIL : h0;
    if (open && !expd.has(r)) expd.set(r, h0); merges.invalidate(); syncMergeBar(); src.track(r, p); fx("ex" + r, open ? 0 : 1, open ? 1 : 0, 200);
    let t0 = 0; const dur = reduced() ? 0 : 220, tok = {}; expAnim.set(r, tok); // t0 在第一步定：第一步就按走了一帧算，点下去下一帧就动
    const step = (now) => { if (expAnim.get(r) !== tok) return; if (!t0) t0 = now - 16.7; const k = dur ? Math.max(0, Math.min(1, (now - t0) / dur)) : 1, q = 1 - (1 - k) ** 3; src.setIdH(r, from + (to - from) * q); sizeBody(); draw(); if (k < 1) { requestAnimationFrame(step); return; } expAnim.delete(r); expTo.delete(r); if (!open) { expd.delete(r); merges.invalidate(); syncMergeBar(); src.setIdH(r, h0); sizeBody(); draw(); } };
    requestAnimationFrame(step);
  }
  // ———— 合并、拆分 ————
  const mb = mountMergeBar(root, injectIcons);
  mb.onSplitHover((on) => {
    if (splitHover === on) return;
    splitHover = on; fx("mgsp", on ? 0 : 1, on ? 1 : 0, 140); schedule();
  });
  function syncMergeBar() {
    const r = rgRect(), cells = r ? (r.p1 - r.p0 + 1) * r.keys.length : 0, zones = r ? new Set(r.keys.map(merges.zoneOf)) : new Set();
    const sib = !r || merges.siblings(r.p0, r.p1);
    const canMerge = merges.enabled && cells > 1 && zones.size === 1 && r.p1 - r.p0 < 200 && sib;
    const mergeTip = !merges.enabled ? tt("canvas-grid.12") : cells > 1 && zones.size > 1 ? tt("canvas-grid.13") : cells > 1 && !sib ? tt("canvas-grid.14") : cells > 1 ? tt("canvas-grid.15", { p0: r.p1 - r.p0 + 1, p1: r.keys.length }) : tt("canvas-grid.16");
    const showSplit = Boolean(activeSelected && merges.at(active.p, active.c));
    const n = merges.suspended();
    const hintText = n ? (merges.enabled ? tt("canvas-grid.17", { p0: n, p1: src.tree ? tt("canvas-grid.28") : tt("canvas-grid.29") }) : tt("canvas-grid.18", { p0: n })) : "";
    mb.sync({ canMerge, mergeTip, showSplit, hintText });
    syncSelMerge();
  }
  mb.merge.addEventListener("click", () => {
    const r = rgRect(); if (!r || mb.merge.disabled) return;
    const inside = merges.active().filter((x) => x.p0 >= r.p0 && x.p1 <= r.p1 && x.c0 >= r.c0 && x.c1 <= r.c1).map((x) => x.m); inside.forEach((m) => merges.remove(m));
    const m = merges.add(r.p0, r.p1, r.keys); if (!m) { inside.forEach((x) => merges.restore(x)); toast({ text: tt("canvas-grid.19") }); return; }
    rg = null; vp.focus({ preventScroll: true }); setActive(r.p0, r.keys[0], false); showSel(true, false); schedule();
    toast({ kind: "action", text: tt("canvas-grid.20", { p0: r.p1 - r.p0 + 1, p1: r.keys.length }), action: { label: tt("canvas-grid.21"), run: (t) => { merges.remove(m); inside.forEach((x) => merges.restore(x)); schedule(); syncMergeBar(); t.update({ kind: "status", text: tt("canvas-grid.22"), done: true, duration: 1600 }); } } });
  });
  mb.split.addEventListener("click", () => {
    const x = merges.at(active.p, active.c); if (!x) return; splitHover = false; TW.delete("mgsp"); merges.remove(x.m); vp.focus({ preventScroll: true }); showSel(activeSelected, kbdNav); schedule(); syncMergeBar();
    toast({ kind: "action", text: tt("canvas-grid.23"), action: { label: tt("canvas-grid.21"), run: (t) => { merges.restore(x.m); schedule(); syncMergeBar(); t.update({ kind: "status", text: tt("canvas-grid.24"), done: true, duration: 1600 }); } } });
  });
  src.ready.then(() => { for (const m of opt.merges || []) merges.add(m.rows[0], m.rows[1], m.keys); if (opt.merges?.length) { mergeFx.prime(merges.active(), (x) => ({ m: x.m, zone: merges.zoneOf(x.key0), ids: [...x.m.ids], keys: [...x.keys], key0: x.key0, p0: x.p0, p1: x.p1, r0: src.rowAt(x.p0) })); schedule(); syncMergeBar(); } paintState(); });

  root._grid = { toggleTree, expandAll, tsel, motion: () => mo.busy, selState, dbgHides: (id) => !!drag && (src.tree ? drag.hides(src.findPos(id)) : src.rowAt(drag.p0) === id), drawn: () => drawn, src, model, active: () => ({ ...active }), setActive, startEdit: (k) => startEdit(k), scrollToRow: (p) => { vp.scrollTop = src.rowY(p); }, editing: () => !!editing, selCount, cellRect, hit, rowDragging: () => !!drag, dbg: () => (drag ? { to: drag.to, out: drag.out, done: !!drag.done, lift: drag.lift, off: Object.fromEntries(drag.off), gapY: drag.gapY, top: src.rowY(drag.p0) + drag.lift } : null), merges, sel: () => ({ shown: selShown, rg: rgRect() }), toggleExpand, expanded: () => expd.size };
  // 销毁：停掉下一帧的重画、拿掉放进 <head> 的两段样式、关掉开着的弹层、放开实例。挂载时加的监听、观察器、后台线程由 createCanvasGrid 一起撤
  const api = root._grid;
  // 公开的方法和只读属性（用属性描述符搬过去：Object.assign 会把 getter 当场取值，sort、selectedKeys 就不跟着变了）
  Object.defineProperties(api, Object.getOwnPropertyDescriptors({
    merge: (p0, p1, keys, opts) => { merges.add(p0, p1, keys); if (opts?.silent) mergeFx.prime(merges.active(), (x) => ({ m: x.m, zone: merges.zoneOf(x.key0), ids: [...x.m.ids], keys: [...x.keys], key0: x.key0, p0: x.p0, p1: x.p1, r0: src.rowAt(x.p0) })); schedule(); syncMergeBar(); }, get sort() { return src.query.sort || null; }, get filter() { return { q: src.query.q || "", filters: src.query.filters || {} }; },
    get selectedKeys() { return selKeys(); }, reload: () => src.retry(), ready: src.ready,
    // 选项变了：数据换了重新要；受控的 sort、selectedKeys 传进来的值换了才跟着变；三种状态重画
    update(n, prev = {}) {
      if (n.data !== prev.data || n.dataSource !== prev.dataSource) swapData(n);
      if (n.height !== prev.height) setGridHeight(root, n.height);
      if (n.sort !== undefined && n.sort !== prev.sort && JSON.stringify(n.sort) !== JSON.stringify(src.query.sort || null)) { lastSort = JSON.stringify(n.sort); src.setSort(n.sort); }
      if (n.selectedKeys !== undefined && n.selectedKeys !== prev.selectedKeys) { Object.assign(opt, n); wantKeys = n.selectedKeys; applyKeys(); }
      Object.assign(opt, n); paintState();
    },
  }));
  api.destroy = () => { cancelAnimationFrame(raf); raf = 0; mb.dispose?.(); styleEl.remove(); motionEl.remove(); closeGridPops(); hideErr(); src.destroy(); if (root._grid === api) delete root._grid; };
  return api;
}

// Canvas 版数据表格的标记（和设计稿里那块一样）：createCanvasGrid 遇到空容器自己用它填
export const canvasGridHTML = ({ label = tt("canvas-grid.30"), toolbar = true, controls = false, columns, height } = {}) =>
  `<div class="sn-grid"${heightCSS(height) ? ` style="--sn-g-h:${esc(heightCSS(height))}"` : ""}>${toolbar ? gridBarHTML({ seg: "cg", title: primaryTitle(columns), placeholder: tt("canvas-grid.31", { p0: primaryTitle(columns) }), controls }) : ""}<div class="sn-g-frame"><div class="sn-g-vp" tabindex="0" role="grid" aria-label="${esc(label)}"><div class="sn-g-head" role="row"></div><canvas class="sn-cg-cv" aria-hidden="true"></canvas><div class="sn-cg-sizer"></div></div>${gridShadesHTML()}<div class="sn-cg-sr" aria-live="polite"></div></div></div>`;

// createCanvasGrid(空容器或 .sn-grid, { columns, data | dataSource, rowKey, … }) → { update, destroy, on, off, merge, reload, … }：统一的组件写法（选项、事件和 DOM 版一样）
export const createCanvasGrid = /* @__PURE__ */ defineComponent({
  name: "canvas-grid",
  html: (o) => canvasGridHTML(o),
  mount(el, o, api) { injectIcons(el); return mountCanvasGrid(el, { ...o, emit: api.emit }); },
});
