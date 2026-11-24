// 流程图（FlowCanvas）：节点用 HTML，连线用 SVG，放在同一层（.sn-flow-world）里一起平移缩放，缩放时线和节点不会脱开。
// 同时支持经典轻量流程图节点与 ComfyUI 级多端口节点（群组分区框、语义类型彩色插槽、参数胶囊行、高清预览图、Reroute 路由点）。
// 性能架构（60/120fps 零卡顿）：
// · 平移/缩放走 GPU 合成层 translate3d，仅在缩放变化时局部更新 SVG 线宽变量 --sn-z（绝不触发全节点子树样式重算）；
// · 节点宽高与端口坐标挂载时一次缓存，bounds / 拖动 / 小地图 0 次强制同步回流；
// · 小地图节点底图与视口框解耦，平移缩放仅更新视口框 transform（0 SVG 重建）；
// · 实时邻接表 O(1) 查找相连边；悬停高亮无同步 getBBox 强制重排；拖动与平移自动短路悬停。
import { $, $$, reduced, injectIcons } from "./core.js";
import { icon } from "./icons.js";
import { toast } from "./feedback.js";
import { layeredLayout } from "./flow-layout.js";
import { scoped } from "./i18n.js";
import { defineComponent } from "./lifecycle.js";
import I18N_DEFAULTS from "./locales/zh-CN/flow.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);

// 节点/端口语义色相：低饱和高级配色，仅用于端口圆点、细连线与极淡群组标识，卡片本体始终保持纯净中性
const HUE = {
  text: 214, board: 248, image: 208, audio: 156, video: 184, out: 188,
  MODEL: 248, CLIP: 42, CONDITIONING: 28, LATENT: 292, IMAGE: 208, VAE: 352,
  CONTROL_NET: 156, MASK: 142, VIDEO: 184, STYLE: 324, STRING: 214, ANY: 220,
};
const hueOf = (k, fallback = 214) => (HUE[k] ?? HUE[String(k || "").toUpperCase()] ?? fallback);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const normPort = (p, defHue) => (typeof p === "string"
  ? { name: p, type: p, hue: hueOf(p, defHue) }
  : { name: String(p?.name ?? ""), type: String(p?.type ?? p?.name ?? ""), hue: p?.hue ?? hueOf(p?.type ?? p?.name, defHue) });

export function mountFlow(flow, { nodes: nodeList, edges: edgeList, groups: groupList } = {}) {
  if (!flow || flow._flow) return flow?._flow;
  const world = $(".sn-flow-world", flow), svg = $(".sn-flow-edges", flow), layer = $(".sn-flow-nodes", flow), zVal = $(".sn-fz-val", flow);
  let groupLayer = $(".sn-flow-groups", world);
  if (!groupLayer) { groupLayer = document.createElement("div"); groupLayer.className = "sn-flow-groups"; world.prepend(groupLayer); }
  const mini = $(".sn-flow-mini", flow), miniSvg = $("svg", mini), miniView = $(".sn-mini-view", mini), runBtn = $("[data-flow-run]", flow);
  const NS = "http://www.w3.org/2000/svg", DEF_W = 200, PORT_Y = 20, ZMIN = .18, ZMAX = 2.5;

  const nodes = new Map((nodeList || []).map((n) => {
    const k = n.kind ?? n.k ?? "text";
    const h0 = hueOf(k, 214);
    const inputs = Array.isArray(n.inputs) ? n.inputs.map((p) => normPort(p, h0)) : null;
    const outputs = Array.isArray(n.outputs) ? n.outputs.map((p) => normPort(p, h0)) : null;
    const comfy = Boolean(n.reroute || inputs || outputs || n.params?.length || n.preview || n.badge);
    return [n.id, {
      ...n, t: n.title ?? n.t ?? "", ic: n.icon ?? n.ic, d: n.detail ?? n.d ?? "", k, hue: n.hue ?? h0,
      w: n.w || (n.reroute ? 96 : comfy ? 228 : DEF_W), h: 68, comfy, inputs, outputs,
      inY: new Map(), outY: new Map(),
    }];
  }));
  const groups = (groupList || []).map((g, i) => ({
    id: g.id ?? `g${i}`, title: g.title ?? "", x: g.x, y: g.y, w: g.w, h: g.h,
    hue: g.hue ?? hueOf(g.color, 214), el: null,
  }));

  function mkEdge(raw) {
    if (Array.isArray(raw)) return { a: raw[0], b: raw[1], fromPort: null, toPort: null, type: null, o1: { x: 0, y: 0 }, v1: { x: 0, y: 0 }, o2: { x: 0, y: 0 }, v2: { x: 0, y: 0 } };
    return {
      a: raw.from ?? raw.a, b: raw.to ?? raw.b,
      fromPort: raw.fromPort ?? null, toPort: raw.toPort ?? null, type: raw.type ?? null,
      o1: { x: 0, y: 0 }, v1: { x: 0, y: 0 }, o2: { x: 0, y: 0 }, v2: { x: 0, y: 0 },
    };
  }
  let edges = (edgeList || []).map(mkEdge).filter((e) => nodes.has(e.a) && nodes.has(e.b));
  const view = { x: 40, y: 30, z: 1 };
  let sel = null, gid = 0, lastZ = -1, miniDirty = true, boxRect = null;

  const defs = document.createElementNS(NS, "defs"); svg.append(defs);

  // ———— 实时邻接表（O(1) 查找相连边，绝不拖动时全表扫描） ————
  const adjMap = new Map();
  const addAdj = (e) => {
    for (const k of [e.a, e.b]) { let arr = adjMap.get(k); if (!arr) adjMap.set(k, (arr = [])); arr.push(e); }
  };
  const delAdj = (e) => {
    for (const k of [e.a, e.b]) { const arr = adjMap.get(k); if (!arr) continue; const i = arr.indexOf(e); if (i >= 0) arr.splice(i, 1); }
  };

  // ———— 群组分区框（ComfyUI Group） ————
  function placeGroup(gr) {
    gr.el.style.transform = `translate3d(${gr.x}px, ${gr.y}px, 0)`;
    gr.el.style.width = gr.w + "px";
    gr.el.style.height = gr.h + "px";
  }
  function groupEl(gr) {
    const el = document.createElement("div");
    el.className = "sn-fgroup";
    el.dataset.gid = gr.id;
    el.style.setProperty("--sn-hue", gr.hue);
    el.innerHTML = `<div class="sn-fgroup-hd"><span class="sn-fgroup-dot"></span><b>${esc(gr.title)}</b></div>`;
    gr.el = el;
    placeGroup(gr);
    groupLayer.append(el);
  }
  for (const gr of groups) groupEl(gr);

  // ———— 节点（兼容经典卡片 & ComfyUI 多端口/参数/预览/Reroute 节点） ————
  function nodeEl(id, n) {
    const el = document.createElement("div");
    el.className = "sn-fnode" + (n.comfy ? " sn-fcomfy" : "") + (n.reroute ? " sn-freroute" : "");
    el.dataset.id = id;
    el.tabIndex = -1;
    el.style.setProperty("--sn-hue", n.hue);
    if (n.w !== DEF_W) el.style.width = n.w + "px";

    if (n.reroute) {
      const tp = n.outputs?.[0]?.type || n.inputs?.[0]?.type || n.k;
      const ph = hueOf(tp, n.hue);
      el.style.setProperty("--sn-hue", ph);
      el.innerHTML = `<div class="sn-hd sn-rr-hd"><span class="sn-rr-dot"></span><b>${esc(n.t || tp)}</b><span class="sn-st"></span></div>`
        + `<span class="sn-port sn-in sn-fdot" data-port="in" data-slot="${esc(n.inputs?.[0]?.name ?? "in")}" style="--sn-ph:${ph}"></span>`
        + `<span class="sn-port sn-out sn-fdot" data-port="out" data-slot="${esc(n.outputs?.[0]?.name ?? "out")}" style="--sn-ph:${ph}"></span>`
        + `<span class="sn-pb"><i></i></span>`;
    } else if (n.comfy) {
      const ins = n.inputs || [], outs = n.outputs || [], rows = Math.max(ins.length, outs.length);
      let slotsHTML = "";
      if (rows) {
        const items = [];
        for (let i = 0; i < rows; i++) {
          const ip = ins[i], op = outs[i];
          const inPart = ip
            ? `<span class="sn-fs-in"><span class="sn-port sn-in sn-fdot" data-port="in" data-slot="${esc(ip.name)}" data-ptype="${esc(ip.type)}" style="--sn-ph:${ip.hue}" title="${esc(ip.name)} (${esc(ip.type)})"></span><span class="sn-fs-lbl">${esc(ip.name)}</span></span>`
            : `<span class="sn-fs-in"></span>`;
          const outPart = op
            ? `<span class="sn-fs-out"><span class="sn-fs-lbl">${esc(op.name)}</span><span class="sn-port sn-out sn-fdot" data-port="out" data-slot="${esc(op.name)}" data-ptype="${esc(op.type)}" style="--sn-ph:${op.hue}" title="${esc(op.name)} (${esc(op.type)})"></span></span>`
            : `<span class="sn-fs-out"></span>`;
          items.push(`<div class="sn-fslot">${inPart}${outPart}</div>`);
        }
        slotsHTML = `<div class="sn-fslots">${items.join("")}</div>`;
      }
      const paramsHTML = n.params?.length
        ? `<div class="sn-fparams">${n.params.map(([pk, pv]) => `<div class="sn-fparam"><span>${esc(pk)}</span><b>${esc(pv)}</b></div>`).join("")}</div>`
        : "";
      const prevHTML = n.preview
        ? `<div class="sn-fprev"><img src="${esc(n.preview)}" alt="${esc(n.t)}" loading="lazy" decoding="async" draggable="false"></div>`
        : (n.bg != null ? `<div class="sn-fprev"><span class="sn-th" style="--sn-g:${esc(n.bg)}"></span></div>` : "");
      const detailHTML = n.d ? `<div class="sn-fdesc">${esc(n.d)}</div>` : "";
      const badgeHTML = n.badge ? `<span class="sn-fbadge">${esc(n.badge)}</span>` : "";
      el.innerHTML = `<div class="sn-hd sn-fcomfy-hd"><span class="sn-fchip"></span><b>${esc(n.t)}</b>${badgeHTML}<span class="sn-st"></span></div>`
        + slotsHTML + paramsHTML + prevHTML + detailHTML
        + `<div class="sn-fpb-wrap"><span class="sn-pb"><i></i></span></div>`;
    } else {
      el.innerHTML = `<div class="sn-hd"><span class="sn-nic">${icon(n.ic || "box", 16)}</span><b>${esc(n.t)}</b><span class="sn-st"></span></div><div class="sn-bd">${n.bg != null ? `<span class="sn-th" style="--sn-g:${esc(n.bg)}"></span>` : ""}<span class="sn-fname">${esc(n.d)}</span><span class="sn-pb"><i></i></span></div>`
        + tt("flow.0");
    }

    n.el = el;
    place(n);
    layer.append(el);
    return el;
  }

  // 一次性测量并缓存所有节点高度和端口 Y 偏移（彻底避免每帧读取 offsetHeight 强回流）
  function expandGroupsToFit() {
    if (!groups.length) return;
    const PAD = 20;
    for (const gr of groups) {
      let maxR = gr.x + gr.w, maxB = gr.y + gr.h;
      for (const n of nodes.values()) {
        const cx = n.x + n.w / 2, cy = n.y + Math.min(n.h, 60) / 2;
        if (cx >= gr.x && cx <= gr.x + gr.w && cy >= gr.y && cy <= gr.y + gr.h) {
          if (n.x + n.w + PAD > maxR) maxR = n.x + n.w + PAD;
          if (n.y + n.h + PAD > maxB) maxB = n.y + n.h + PAD;
        }
      }
      const nw = Math.ceil(maxR - gr.x), nh = Math.ceil(maxB - gr.y);
      if (nw !== gr.w || nh !== gr.h) { gr.w = nw; gr.h = nh; placeGroup(gr); }
    }
  }
  function measureAll() {
    for (const n of nodes.values()) measureNode(n);
    expandGroupsToFit();
  }
  function measureNode(n) {
    const el = n.el; if (!el) return;
    n.w = el.offsetWidth || n.w || DEF_W;
    n.h = el.offsetHeight || n.h || 68;
    n.inY.clear(); n.outY.clear();
    if (n.reroute) {
      const cy = n.h / 2;
      n.inY.set(n.inputs?.[0]?.name ?? "in", cy);
      n.outY.set(n.outputs?.[0]?.name ?? "out", cy);
      return;
    }
    if (n.comfy) {
      const slots = el.querySelectorAll(".sn-fslot");
      for (const row of slots) {
        const y = row.offsetTop + row.offsetHeight / 2;
        const inp = row.querySelector(".sn-port.sn-in");
        const out = row.querySelector(".sn-port.sn-out");
        if (inp) n.inY.set(inp.dataset.slot || "in", y);
        if (out) n.outY.set(out.dataset.slot || "out", y);
      }
      if (!n.inY.size) n.inY.set("in", PORT_Y);
      if (!n.outY.size) n.outY.set("out", PORT_Y);
    } else {
      n.inY.set("in", PORT_Y);
      n.outY.set("out", PORT_Y);
    }
  }

  const place = (n) => { n.el.style.transform = `translate3d(${n.x}px, ${n.y}px, 0)`; };
  const outPt = (n, portName) => {
    const y = (portName && n.outY.get(portName)) ?? n.outY.values().next().value ?? PORT_Y;
    return [n.x + n.w, n.y + y];
  };
  const inPt = (n, portName) => {
    const y = (portName && n.inY.get(portName)) ?? n.inY.values().next().value ?? PORT_Y;
    return [n.x, n.y + y];
  };

  // ———— 连线：三次贝塞尔曲线，精确落到对应类型端口圆点 ————
  function geom(e) {
    const na = nodes.get(e.a), nb = nodes.get(e.b);
    const [x1, y1] = outPt(na, e.fromPort), [x2, y2] = inPt(nb, e.toPort);
    const fwd = x2 - x1, len = Math.hypot(x2 - x1, y2 - y1);
    let c1, c2;
    if (fwd >= -30) {
      const dx = Math.max(48, fwd * .48, Math.abs(y2 - y1) * .26), sag = Math.min(26, len * .045);
      c1 = [x1 + dx, y1 + sag]; c2 = [x2 - dx, y2 + sag];
    } else {
      const dx = 70 + Math.min(140, -fwd * .3), down = 90 + Math.abs(y2 - y1) * .25;
      c1 = [x1 + dx, y1 + down]; c2 = [x2 - dx, y2 + down];
    }
    return [x1, y1, c1[0] + e.o1.x, c1[1] + e.o1.y, c2[0] + e.o2.x, c2[1] + e.o2.y, x2, y2];
  }
  function edgeHue(e) {
    const na = nodes.get(e.a), nb = nodes.get(e.b);
    if (e.type) { const h = hueOf(e.type, na.hue); return [h, h]; }
    if (e.fromPort && na.outputs) {
      const p = na.outputs.find((x) => x.name === e.fromPort);
      if (p) return [p.hue, p.hue];
    }
    return [na.hue, nb.hue];
  }
  function edgeEl(e, fresh) {
    const [ha, hb] = edgeHue(e);
    const same = ha === hb;
    let strokeMain, strokeLight, grad = null, lg = null;
    if (same) {
      strokeMain = `hsl(${ha} var(--sn-edge-s) var(--sn-edge-l))`;
      strokeLight = `hsl(${ha} var(--sn-beam-s) var(--sn-beam-l))`;
    } else {
      const id = "fg" + ++gid;
      grad = document.createElementNS(NS, "linearGradient"); grad.id = id; grad.setAttribute("gradientUnits", "userSpaceOnUse");
      grad.innerHTML = `<stop offset="0" style="stop-color:hsl(${ha} var(--sn-edge-s) var(--sn-edge-l))"/><stop offset="1" style="stop-color:hsl(${hb} var(--sn-edge-s) var(--sn-edge-l))"/>`;
      lg = document.createElementNS(NS, "linearGradient"); lg.id = id + "L"; lg.setAttribute("gradientUnits", "userSpaceOnUse");
      lg.innerHTML = `<stop offset="0" style="stop-color:hsl(${ha} var(--sn-beam-s) var(--sn-beam-l))"/><stop offset="1" style="stop-color:hsl(${hb} var(--sn-beam-s) var(--sn-beam-l))"/>`;
      defs.append(grad, lg);
      strokeMain = `url(#${id})`; strokeLight = `url(#${id}L)`;
    }
    const g = document.createElementNS(NS, "g"); g.dataset.a = e.a; g.dataset.b = e.b;
    if (fresh && !reduced()) g.classList.add("sn-new");
    g.innerHTML = `<path class="sn-e" stroke="${strokeMain}"/><path class="sn-light" pathLength="100" stroke="${strokeLight}"/><path class="sn-hit"/>`;
    svg.append(g);
    Object.assign(e, { g, grad, lg, paths: [...g.querySelectorAll("path")] });
    addAdj(e);
    drawEdge(e);
    return g;
  }
  function drawEdge(e) {
    const [x1, y1, a, b, c, d, x2, y2] = geom(e), path = `M${x1.toFixed(1)} ${y1.toFixed(1)} C${a.toFixed(1)} ${b.toFixed(1)}, ${c.toFixed(1)} ${d.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    for (const p of e.paths) p.setAttribute("d", path);
    if (e.grad) {
      e.grad.setAttribute("x1", x1); e.grad.setAttribute("y1", y1); e.grad.setAttribute("x2", x2); e.grad.setAttribute("y2", y2);
      e.lg.setAttribute("x1", x1); e.lg.setAttribute("y1", y1); e.lg.setAttribute("x2", x2); e.lg.setAttribute("y2", y2);
    }
  }

  for (const [id, n] of nodes) nodeEl(id, n);
  measureAll();
  for (const e of edges) edgeEl(e);

  // ———— 晃动物理（节点 ≤ 64 时开启细腻风筝线弹性；超大规模保持零余震极致顺滑） ————
  const springs = new Set(); let simRaf = 0, simT = 0;
  const K = 150, C = 12, LIM = 44;
  function kick(id, dx, dy, conn) {
    if (reduced() || nodes.size > 64) return;
    for (const e of conn) {
      const near = e.a === id ? e.o1 : e.o2, far = e.a === id ? e.o2 : e.o1;
      const [x1, y1, , , , , x2, y2] = geom(e), lim = Math.min(LIM, Math.hypot(x2 - x1, y2 - y1) * .28);
      const cl = (v) => Math.max(-lim, Math.min(lim, v));
      near.x = cl(near.x - dx * .16); near.y = cl(near.y - dy * .16);
      far.x = cl(far.x - dx * .36); far.y = cl(far.y - dy * .36);
      springs.add(e);
    }
    if (!simRaf && springs.size) { simT = performance.now(); simRaf = requestAnimationFrame(sim); }
  }
  function sim(now) {
    simRaf = 0; const dt = Math.min(.032, Math.max(.001, (now - simT) / 1000)); simT = now;
    for (const e of springs) {
      let rest = true;
      for (const [o, v] of [[e.o1, e.v1], [e.o2, e.v2]]) {
        v.x += (-K * o.x - C * v.x) * dt; v.y += (-K * o.y - C * v.y) * dt; o.x += v.x * dt; o.y += v.y * dt;
        if (Math.abs(o.x) + Math.abs(o.y) > .05 || Math.abs(v.x) + Math.abs(v.y) > .5) rest = false;
      }
      if (rest) { e.o1.x = e.o1.y = e.o2.x = e.o2.y = e.v1.x = e.v1.y = e.v2.x = e.v2.y = 0; springs.delete(e); }
      drawEdge(e);
    }
    if (springs.size) simRaf = requestAnimationFrame(sim);
  }

  // ———— 悬停节点：上下游整条语义链路高亮（无同步 getBBox 强回流） ————
  function lineage(id) {
    const ns = new Set([id]), es = new Set();
    const walk = (cur, dir) => {
      const list = adjMap.get(cur); if (!list) return;
      for (const e of list) {
        const from = dir > 0 ? e.a : e.b, to = dir > 0 ? e.b : e.a;
        if (from === cur && !es.has(e)) { es.add(e); if (!ns.has(to)) { ns.add(to); walk(to, dir); } }
      }
    };
    walk(id, 1); walk(id, -1);
    return { ns, es };
  }
  let traced = null, sweepRaf = 0;
  function trace(id) {
    if (traced === id) return; traced = id;
    cancelAnimationFrame(sweepRaf);
    if (!id) {
      flow.classList.remove("sn-tracing");
      for (const e of edges) e.g.classList.remove("sn-lit", "sn-sweep");
      for (const n of nodes.values()) n.el.classList.remove("sn-lit");
      return;
    }
    const { ns, es } = lineage(id); flow.classList.add("sn-tracing");
    const depth = new Map(), lit = [...es];
    const roots = [...ns].filter((nid) => !lit.some((e) => e.b === nid));
    let frontier = roots, dpt = 0; roots.forEach((r) => depth.set(r, 0));
    while (frontier.length && dpt < 40) {
      const nx = [];
      for (const nid of frontier) for (const e of lit) if (e.a === nid && (depth.get(e.b) ?? -1) < dpt + 1) { depth.set(e.b, dpt + 1); nx.push(e.b); }
      frontier = nx; dpt++;
    }
    const toSweep = [];
    for (const e of edges) {
      const on = es.has(e); e.g.classList.toggle("sn-lit", on); e.g.classList.remove("sn-sweep");
      if (on && !reduced()) { e.g.style.setProperty("--sn-d", (depth.get(e.a) || 0) * 90 + "ms"); toSweep.push(e.g); }
    }
    for (const [nid, n] of nodes) n.el.classList.toggle("sn-lit", ns.has(nid));
    if (toSweep.length) sweepRaf = requestAnimationFrame(() => { for (const g of toSweep) g.classList.add("sn-sweep"); });
  }
  let interacting = false;
  layer.addEventListener("pointerover", (e) => { if (interacting) return; const n = e.target.closest(".sn-fnode"); if (n) trace(n.dataset.id); });
  layer.addEventListener("pointerout", (e) => { if (interacting) return; const n = e.target.closest(".sn-fnode"); if (n && !n.contains(e.relatedTarget) && !n.classList.contains("sn-drag")) trace(null); });

  // ———— 视图：纯 GPU 合成层平移缩放，仅缩放变化时局部改 SVG 线宽 ————
  const rect = () => boxRect || (boxRect = flow.getBoundingClientRect());
  let raf = 0;
  function apply() {
    raf = 0;
    world.style.transform = `translate3d(${view.x.toFixed(1)}px, ${view.y.toFixed(1)}px, 0) scale(${view.z.toFixed(4)})`;
    flow.style.backgroundPosition = `${view.x.toFixed(1)}px ${view.y.toFixed(1)}px`;
    if (Math.abs(view.z - lastZ) > 1e-4) {
      lastZ = view.z;
      const gSize = (20 * view.z).toFixed(2) + "px";
      flow.style.backgroundSize = `${gSize} ${gSize}`;
      svg.style.setProperty("--sn-z", view.z.toFixed(4));
      zVal.textContent = Math.round(view.z * 100) + "%";
    }
    if (miniDirty) paintMiniNodes();
    syncMiniView();
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
  const clampZ = (z) => Math.min(ZMAX, Math.max(ZMIN, z));
  function zoomAt(cx, cy, z) { z = clampZ(z); const wx = (cx - view.x) / view.z, wy = (cy - view.y) / view.z; view.x = cx - wx * z; view.y = cy - wy * z; view.z = z; schedule(); }
  let tween = 0;
  function animateTo(tx, ty, tz) {
    cancelAnimationFrame(tween); stopZoom(); if (reduced()) { Object.assign(view, { x: tx, y: ty, z: tz }); schedule(); return; }
    const r = rect(), cx = r.width / 2, cy = r.height / 2, z0 = view.z, ax = (cx - view.x) / z0, ay = (cy - view.y) / z0, bx = (cx - tx) / tz, by = (cy - ty) / tz, l0 = Math.log(z0), l1 = Math.log(tz), t0 = performance.now(), DUR = 280, lr = Math.abs(l1 - l0), D = lr > 1 ? Math.min(640, 300 + 90 * lr) : DUR, ease = lr > 1 ? (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2) : (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => { const t = Math.min(1, (now - t0) / D), k = ease(t), z = Math.exp(l0 + (l1 - l0) * k); view.z = z; view.x = cx - (ax + (bx - ax) * k) * z; view.y = cy - (ay + (by - ay) * k) * z; apply(); if (t < 1) tween = requestAnimationFrame(step); else { Object.assign(view, { x: tx, y: ty, z: tz }); apply(); } };
    tween = requestAnimationFrame(step);
  }
  const Z = { target: 1, cx: 0, cy: 0, raf: 0, last: 0 };
  const stopZoom = () => { if (Z.raf) { cancelAnimationFrame(Z.raf); Z.raf = 0; } };
  const zoomTarget = () => (Z.raf ? Z.target : view.z);
  function zoomTo(cx, cy, z) {
    z = clampZ(z); cancelAnimationFrame(tween);
    if (reduced()) { stopZoom(); zoomAt(cx, cy, z); return; }
    Z.target = z; Z.cx = cx; Z.cy = cy; if (!Z.raf) { Z.last = performance.now(); Z.raf = requestAnimationFrame(zoomStep); }
  }
  function zoomStep(now) {
    const dt = Math.min(64, now - Z.last), lz = Math.log(view.z), lt = Math.log(Z.target); Z.last = now;
    const z = Math.abs(lt - lz) < .002 ? Z.target : Math.exp(lz + (lt - lz) * (1 - Math.exp(-dt / 70)));
    zoomAt(Z.cx, Z.cy, z); Z.raf = z === Z.target ? 0 : requestAnimationFrame(zoomStep);
  }

  function zoomBy(k) { const r = rect(); zoomTo(r.width / 2, r.height / 2, zoomTarget() * k); }
  function bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of groups) { x0 = Math.min(x0, g.x); y0 = Math.min(y0, g.y); x1 = Math.max(x1, g.x + g.w); y1 = Math.max(y1, g.y + g.h); }
    for (const n of nodes.values()) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h); }
    if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 400, y1: 300 };
    return { x0, y0, x1, y1 };
  }
  function fit(instant = false) {
    boxRect = flow.getBoundingClientRect();
    const r = boxRect, b = bounds(), pad = 44;
    const z = clampZ(Math.min((r.width - pad * 2) / Math.max(1, b.x1 - b.x0), (r.height - pad * 2 - 36) / Math.max(1, b.y1 - b.y0)));
    const tx = (r.width - (b.x1 - b.x0) * z) / 2 - b.x0 * z;
    const ty = (r.height - (b.y1 - b.y0) * z) / 2 - b.y0 * z - 8;
    if (instant) { Object.assign(view, { x: tx, y: ty, z }); apply(); } else animateTo(tx, ty, z);
  }
  function center() {
    boxRect = flow.getBoundingClientRect();
    const r = boxRect; let cx, cy;
    if (sel?.type === "node" && nodes.get(sel.ref)) { const n = nodes.get(sel.ref); cx = n.x + n.w / 2; cy = n.y + n.h / 2; }
    else { const b = bounds(); cx = (b.x0 + b.x1) / 2; cy = (b.y0 + b.y1) / 2; }
    animateTo(r.width / 2 - cx * view.z, r.height / 2 - cy * view.z, view.z);
  }

  // ———— 整理：自动分层排版，同时按群组包裹节点自动贴合群组框 ————
  const springEase = (k) => { const end = 1 - (1 + k) * Math.exp(-k); return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : (1 - (1 + k * x) * Math.exp(-k * x)) / end); };
  const TIDY = springEase(6.2);
  let tidyRaf = 0;
  function tidy() {
    measureAll();
    const ids = [...nodes.keys()], ix = new Map(ids.map((id, i) => [id, i]));
    const ws = ids.map((id) => nodes.get(id).w), hs = ids.map((id) => nodes.get(id).h);
    // 记录当前每个群组包含哪些节点
    const members = groups.map((gr) => ids.filter((id) => {
      const n = nodes.get(id), cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      return cx >= gr.x && cx <= gr.x + gr.w && cy >= gr.y && cy <= gr.y + gr.h;
    }));
    const lay = layeredLayout(ids.length, edges.map((e) => ix.get(e.a)), edges.map((e) => ix.get(e.b)), (i) => ws[i], (i) => hs[i], { gapX: 76, gapY: 34 });
    const from = ids.map((id) => [nodes.get(id).x, nodes.get(id).y]), to = ids.map((_, i) => [lay.x[i], lay.y[i] + 60]);
    const gFrom = groups.map((gr) => [gr.x, gr.y, gr.w, gr.h]);
    const gTo = groups.map((gr, gi) => {
      const ms = members[gi]; if (!ms.length) return [gr.x, gr.y, gr.w, gr.h];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const id of ms) { const i = ix.get(id); x0 = Math.min(x0, to[i][0]); y0 = Math.min(y0, to[i][1]); x1 = Math.max(x1, to[i][0] + ws[i]); y1 = Math.max(y1, to[i][1] + hs[i]); }
      return [x0 - 20, y0 - 44, x1 - x0 + 40, y1 - y0 + 64];
    });
    for (const e of edges) { e.o1.x = e.o1.y = e.o2.x = e.o2.y = e.v1.x = e.v1.y = e.v2.x = e.v2.y = 0; springs.delete(e); }
    cancelAnimationFrame(tidyRaf); trace(null);
    const done = () => { miniDirty = true; paintMiniNodes(); fit(); };
    if (reduced()) {
      ids.forEach((id, i) => { const n = nodes.get(id); [n.x, n.y] = to[i]; place(n); });
      groups.forEach((gr, gi) => { [gr.x, gr.y, gr.w, gr.h] = gTo[gi]; placeGroup(gr); });
      edges.forEach(drawEdge); done(); return;
    }
    const t0 = performance.now(), D = 520;
    const step = (now) => {
      const k = TIDY(Math.min(1, (now - t0) / D));
      ids.forEach((id, i) => { const n = nodes.get(id); n.x = from[i][0] + (to[i][0] - from[i][0]) * k; n.y = from[i][1] + (to[i][1] - from[i][1]) * k; place(n); });
      groups.forEach((gr, gi) => { gr.x = gFrom[gi][0] + (gTo[gi][0] - gFrom[gi][0]) * k; gr.y = gFrom[gi][1] + (gTo[gi][1] - gFrom[gi][1]) * k; gr.w = gFrom[gi][2] + (gTo[gi][2] - gFrom[gi][2]) * k; gr.h = gFrom[gi][3] + (gTo[gi][3] - gFrom[gi][3]) * k; placeGroup(gr); });
      edges.forEach(drawEdge);
      if (k < 1) tidyRaf = requestAnimationFrame(step); else done();
    };
    tidyRaf = requestAnimationFrame(step);
  }
  $("[data-flow-tidy]", flow)?.addEventListener("click", tidy);

  flow.addEventListener("wheel", (e) => {
    e.preventDefault(); cancelAnimationFrame(tween); const r = rect();
    if (e.ctrlKey || e.metaKey) {
      const f = Math.exp(-e.deltaY * (e.deltaMode ? .05 : .0022)), px = e.clientX - r.left, py = e.clientY - r.top;
      if (e.deltaMode || Math.abs(e.deltaY) >= 40) zoomTo(px, py, zoomTarget() * f);
      else { stopZoom(); zoomAt(px, py, view.z * f); }
    } else { view.x -= e.deltaX; view.y -= e.deltaY; schedule(); }
  }, { passive: false });

  // ———— 指针交互：空白拖动平移 / 群组标题栏整组拖动 / 节点拖动 / 端口拉线 ————
  let ghost = null;
  flow.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".sn-flow-tools, .sn-flow-run, .sn-flow-mini")) return;
    boxRect = flow.getBoundingClientRect();
    const port = e.target.closest(".sn-port.sn-out"), nodeHit = e.target.closest(".sn-fnode"), edgeHit = e.target.closest("g[data-a]"), grpHit = e.target.closest(".sn-fgroup-hd");
    flow.focus({ preventScroll: true }); cancelAnimationFrame(tween);
    if (port && nodeHit) return startConnect(e, nodeHit.dataset.id, port.dataset.slot || null, port.dataset.ptype || null);
    if (edgeHit) { select({ type: "edge", ref: edges.find((x) => x.g === edgeHit) }); return; }
    if (nodeHit && !e.target.closest(".sn-port")) return startDrag(e, nodeHit.dataset.id);
    if (grpHit) { const gr = groups.find((x) => x.el === grpHit.parentElement); if (gr) return startGroupDrag(e, gr); }
    select(null); trace(null);
    interacting = true;
    flow.setPointerCapture(e.pointerId); flow.classList.add("sn-panning");
    let lx = e.clientX, ly = e.clientY;
    const mv = (ev) => { view.x += ev.clientX - lx; view.y += ev.clientY - ly; lx = ev.clientX; ly = ev.clientY; schedule(); };
    const up = () => {
      interacting = false; flow.classList.remove("sn-panning");
      flow.removeEventListener("pointermove", mv); flow.removeEventListener("pointerup", up); flow.removeEventListener("pointercancel", up);
    };
    flow.addEventListener("pointermove", mv); flow.addEventListener("pointerup", up); flow.addEventListener("pointercancel", up);
  });

  function edgePan(px, py) {
    const r = rect(), E = 32, vx = px < r.left + E ? r.left + E - px : px > r.right - E ? r.right - E - px : 0, vy = py < r.top + E ? r.top + E - py : py > r.bottom - E ? r.bottom - E - py : 0;
    if (!vx && !vy) return false;
    const sp = (v) => Math.sign(v) * Math.min(24, Math.abs(v) / 3); view.x += sp(vx); view.y += sp(vy); schedule(); return true;
  }

  // 拖动群组标题栏：整组与组内全部节点和连线 60fps 一起走
  function startGroupDrag(e, gr) {
    trace(null); interacting = true;
    try { gr.el.setPointerCapture(e.pointerId); } catch {}
    const members = [...nodes.values()].filter((n) => {
      const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      return cx >= gr.x && cx <= gr.x + gr.w && cy >= gr.y && cy <= gr.y + gr.h;
    });
    const touchedEdges = new Set();
    for (const n of members) for (const ed of (adjMap.get(n.id) || [])) touchedEdges.add(ed);
    const sx = e.clientX, sy = e.clientY, gx0 = gr.x, gy0 = gr.y;
    const n0 = members.map((n) => [n.x, n.y]);
    let px = sx, py = sy, fr = 0, done = false;
    gr.el.classList.add("sn-drag");
    const frame = () => {
      fr = 0; if (done) return;
      const dx = (px - sx) / view.z, dy = (py - sy) / view.z;
      gr.x = gx0 + dx; gr.y = gy0 + dy; placeGroup(gr);
      for (let i = 0; i < members.length; i++) { const n = members[i]; n.x = n0[i][0] + dx; n.y = n0[i][1] + dy; place(n); }
      for (const ed of touchedEdges) drawEdge(ed);
    };
    const mv = (ev) => { px = ev.clientX; py = ev.clientY; if (!fr) fr = requestAnimationFrame(frame); };
    const up = () => {
      if (done) return; done = true; interacting = false; cancelAnimationFrame(fr);
      gr.el.classList.remove("sn-drag");
      for (const [t, f] of evs) gr.el.removeEventListener(t, f);
      miniDirty = true; paintMiniNodes(); syncMiniView();
    };
    const evs = [["pointermove", mv], ["pointerup", up], ["pointercancel", up], ["lostpointercapture", up]];
    for (const [t, f] of evs) gr.el.addEventListener(t, f);
  }

  function startDrag(e, id) {
    const n = nodes.get(id), conn = adjMap.get(id) || []; select({ type: "node", ref: id }); trace(id);
    try { n.el.setPointerCapture(e.pointerId); } catch {}
    const r0 = rect(), sx = e.clientX, sy = e.clientY, ox = n.x, oy = n.y;
    const gx = sx - (r0.left + view.x + n.x * view.z), gy = sy - (r0.top + view.y + n.y * view.z);
    const cw = n.w * view.z, ch = n.h * view.z;
    let px = sx, py = sy, moved = false, fr = 0, done = false;
    const move = (nx, ny) => {
      const dx = nx - n.x, dy = ny - n.y; n.x = nx; n.y = ny; place(n);
      kick(id, dx, dy, conn);
      for (const x of conn) if (!springs.has(x)) drawEdge(x);
    };
    const frame = () => {
      fr = 0; if (done) return; const panned = edgePan(px, py), r = rect();
      const fitV = (v, lo, hi, size, grab) => (size <= hi - lo ? Math.max(lo, Math.min(hi - size, v - grab)) : Math.max(lo, Math.min(hi, v)) - grab);
      move((fitV(px, r.left + 8, r.right - 8, cw, gx) - r.left - view.x) / view.z, (fitV(py, r.top + 8, r.bottom - 8, ch, gy) - r.top - view.y) / view.z);
      if (panned) fr = requestAnimationFrame(frame);
    };
    const mv = (ev) => {
      px = ev.clientX; py = ev.clientY;
      if (!moved) { if (Math.hypot(px - sx, py - sy) < 3) return; moved = true; interacting = true; n.el.classList.add("sn-drag"); }
      if (!fr) fr = requestAnimationFrame(frame);
    };
    const fin = (how) => {
      if (done) return; done = true; interacting = false; cancelAnimationFrame(fr);
      for (const [t, f] of evs) n.el.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", onBlur);
      n.el.classList.remove("sn-drag");
      if (how !== "up" && moved) {
        const fx = n.x, fy = n.y, t0 = performance.now();
        if (reduced()) { move(ox, oy); miniDirty = true; paintMiniNodes(); syncMiniView(); }
        else {
          const step = (now) => { const k = Math.min(1, (now - t0) / 200), q = 1 - (1 - k) ** 3; move(fx + (ox - fx) * q, fy + (oy - fy) * q); if (k < 1) requestAnimationFrame(step); else { miniDirty = true; paintMiniNodes(); syncMiniView(); } };
          requestAnimationFrame(step);
        }
      } else if (moved) { miniDirty = true; paintMiniNodes(); syncMiniView(); }
      if (!n.el.matches(":hover")) trace(null);
    };
    const onKey = (ev) => { if (ev.key === "Escape" && moved) { ev.preventDefault(); ev.stopPropagation(); fin("cancel"); } }, onBlur = () => fin("cancel");
    const evs = [["pointermove", mv], ["pointerup", () => fin("up")], ["pointercancel", () => fin("cancel")], ["lostpointercapture", () => fin("cancel")]];
    for (const [t, f] of evs) n.el.addEventListener(t, f); document.addEventListener("keydown", onKey, true); addEventListener("blur", onBlur);
  }

  function startConnect(e, from, fromPort, portType) {
    const n = nodes.get(from); flow.classList.add("sn-connecting"); flow.setPointerCapture(e.pointerId); trace(null); interacting = true;
    const h = hueOf(portType || fromPort, n.hue);
    ghost = document.createElementNS(NS, "path"); ghost.setAttribute("class", "sn-ghost"); ghost.style.setProperty("--sn-hue", h); svg.append(ghost);
    let hot = null, fr = 0, last = e, done = false, went = false;
    const toWorld = (ev) => { const r = rect(); return [(ev.clientX - r.left - view.x) / view.z, (ev.clientY - r.top - view.y) / view.z]; };
    const findHot = () => { const t = document.elementFromPoint(last.clientX, last.clientY)?.closest(".sn-port.sn-in"); const ok = t && t.closest(".sn-fnode").dataset.id !== from ? t : null; if (ok !== hot) { hot?.classList.remove("sn-hot"); hot = ok; hot?.classList.add("sn-hot"); } };
    const draw = () => {
      fr = 0; const panned = went && edgePan(last.clientX, last.clientY);
      const [x1, y1] = outPt(n, fromPort), [x2, y2] = toWorld(last), dx = Math.max(40, Math.abs(x2 - x1) * .5); ghost.setAttribute("d", `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
      if (panned) { findHot(); fr = requestAnimationFrame(draw); }
    };
    const mv = (ev) => { last = ev; if (!went && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) >= 3) went = true; if (!fr) fr = requestAnimationFrame(draw); findHot(); };
    const up = (how) => {
      if (done) return; done = true; interacting = false; flow.classList.remove("sn-connecting"); cancelAnimationFrame(fr);
      for (const [t, f] of evs) flow.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", onBlur);
      if (how !== "up") { hot?.classList.remove("sn-hot"); hot = null; }
      if (hot) {
        const to = hot.closest(".sn-fnode").dataset.id, toPort = hot.dataset.slot || null; hot.classList.remove("sn-hot");
        if (!edges.some((x) => x.a === from && x.b === to && x.fromPort === fromPort && x.toPort === toPort)) {
          const ed = mkEdge({ from, fromPort, to, toPort, type: portType || hot.dataset.ptype || null });
          edges.push(ed); edgeEl(ed, true);
          toast({ text: tt("flow.1", { p0: n.t, p1: nodes.get(to).t }) });
        }
        ghost.remove();
      } else if (!reduced()) { const g = ghost; g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).onfinish = () => g.remove(); } else ghost.remove();
      ghost = null;
    };
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); up("cancel"); } }, onBlur = () => up("cancel");
    const evs = [["pointermove", mv], ["pointerup", () => up("up")], ["pointercancel", () => up("cancel")], ["lostpointercapture", () => up("cancel")]];
    for (const [t, f] of evs) flow.addEventListener(t, f); document.addEventListener("keydown", onKey, true); addEventListener("blur", onBlur); draw();
  }

  function select(s) {
    $$(".sn-fnode.sn-sel", flow).forEach((x) => x.classList.remove("sn-sel")); $$("g.sn-sel", svg).forEach((x) => x.classList.remove("sn-sel"));
    sel = s; if (!s) return;
    if (s.type === "node") nodes.get(s.ref).el.classList.add("sn-sel"); else s.ref.g.classList.add("sn-sel");
  }
  const removeEdge = (ed) => { ed.g.remove(); ed.grad?.remove(); ed.lg?.remove(); springs.delete(ed); delAdj(ed); edges = edges.filter((x) => x !== ed); };
  const restoreEdge = (ed) => { edges.push(ed); if (ed.grad) defs.append(ed.grad, ed.lg); svg.append(ed.g); addAdj(ed); drawEdge(ed); };

  flow.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomBy(1.25); }
    else if ((e.metaKey || e.ctrlKey) && e.key === "-") { e.preventDefault(); zoomBy(.8); }
    else if (e.key === "!" && e.shiftKey) { e.preventDefault(); fit(); }
    else if (e.key === "@" && e.shiftKey) { e.preventDefault(); center(); }
    else if ((e.key === "L" || e.key === "l") && e.shiftKey) { e.preventDefault(); tidy(); }
    else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
      e.preventDefault(); trace(null);
      if (sel.type === "edge") {
        const ed = sel.ref; removeEdge(ed); select(null);
        toast({ kind: "action", text: tt("flow.2"), action: { label: tt("flow.3"), run: (t) => { restoreEdge(ed); t.update({ kind: "status", text: tt("flow.4"), done: true, duration: 2000 }); } } });
      } else {
        const id = sel.ref, n = nodes.get(id), gone = [...(adjMap.get(id) || [])];
        n.el.remove(); gone.forEach(removeEdge); nodes.delete(id); adjMap.delete(id); select(null);
        miniDirty = true; paintMiniNodes(); syncMiniView();
        toast({ kind: "action", text: tt("flow.5", { p0: n.t }), action: { label: tt("flow.3"), run: (t) => { nodes.set(id, n); layer.append(n.el); gone.forEach(restoreEdge); miniDirty = true; paintMiniNodes(); syncMiniView(); t.update({ kind: "status", text: tt("flow.6"), done: true, duration: 2000 }); } } });
      }
    }
  });
  for (const b of $$("[data-fz]", flow)) b.addEventListener("click", () => {
    const v = b.dataset.fz; if (v === "fit") fit(); else if (v === "center") center(); else if (v === "reset") { const r = rect(), cx = r.width / 2, cy = r.height / 2, wx = (cx - view.x) / view.z, wy = (cy - view.y) / view.z; animateTo(cx - wx, cy - wy, 1); } else zoomBy(v === "1" ? 1.25 : .8);
  });

  // ———— 小地图：底图静态渲染 + 视口框纯 transform 跟随（0 强制回流、0 SVG 重建） ————
  let mb = { x0: 0, y0: 0, s: .1 };
  function paintMiniNodes() {
    miniDirty = false;
    if (!nodes.size) { miniSvg.innerHTML = ""; return; }
    const b = bounds(), pad = 120, x0 = b.x0 - pad, y0 = b.y0 - pad, x1 = b.x1 + pad, y1 = b.y1 + pad;
    const s = Math.min(168 / Math.max(1, x1 - x0), 104 / Math.max(1, y1 - y0));
    const ox = (168 - (x1 - x0) * s) / 2, oy = (104 - (y1 - y0) * s) / 2;
    mb = { x0, y0, s, ox, oy };
    const gRects = groups.map((gr) => `<rect x="${(ox + (gr.x - x0) * s).toFixed(1)}" y="${(oy + (gr.y - y0) * s).toFixed(1)}" width="${(gr.w * s).toFixed(1)}" height="${(gr.h * s).toFixed(1)}" rx="2.5" style="fill:hsl(${gr.hue} 42% 55% / .12);stroke:hsl(${gr.hue} 42% 55% / .32);stroke-width:.7"/>`).join("");
    const nRects = [...nodes.values()].map((n) => `<rect x="${(ox + (n.x - x0) * s).toFixed(1)}" y="${(oy + (n.y - y0) * s).toFixed(1)}" width="${Math.max(2, n.w * s).toFixed(1)}" height="${Math.max(1.5, n.h * s).toFixed(1)}" rx="1.5" style="fill:hsl(${n.hue} 45% 56% / .62)"/>`).join("");
    miniSvg.innerHTML = gRects + nRects;
  }
  function syncMiniView() {
    if (!nodes.size) return;
    const r = rect(), { x0, y0, s, ox = 0, oy = 0 } = mb;
    const vx = ox + (-view.x / view.z - x0) * s, vy = oy + (-view.y / view.z - y0) * s;
    const vw = (r.width / view.z) * s, vh = (r.height / view.z) * s;
    miniView.style.transform = `translate3d(${vx.toFixed(1)}px, ${vy.toFixed(1)}px, 0)`;
    miniView.style.width = Math.max(8, vw).toFixed(1) + "px";
    miniView.style.height = Math.max(6, vh).toFixed(1) + "px";
  }
  mini.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); mini.setPointerCapture(e.pointerId);
    const mr = mini.getBoundingClientRect(), r = rect();
    const go = (ev) => {
      const wx = (ev.clientX - mr.left - (mb.ox || 0)) / mb.s + mb.x0, wy = (ev.clientY - mr.top - (mb.oy || 0)) / mb.s + mb.y0;
      view.x = r.width / 2 - wx * view.z; view.y = r.height / 2 - wy * view.z; schedule();
    };
    go(e); const up = () => { mini.removeEventListener("pointermove", go); mini.removeEventListener("pointerup", up); };
    mini.addEventListener("pointermove", go); mini.addEventListener("pointerup", up);
  });

  // ———— 运行：按依赖分层推进，实时点亮每个 ComfyUI 节点进度条与彩色数据流 ————
  const SPIN = '<span class="sn-spinner"></span>', OK = '<svg class="sn-ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  function levels() {
    const lv = new Map(), inc = new Map([...nodes.keys()].map((id) => [id, []]));
    for (const e of edges) inc.get(e.b)?.push(e.a);
    const get = (id, seen) => { if (lv.has(id)) return lv.get(id); if (seen.has(id)) return 0; seen.add(id); const v = Math.max(-1, ...inc.get(id).map((a) => get(a, seen))) + 1; lv.set(id, v); return v; };
    for (const id of nodes.keys()) get(id, new Set());
    const out = []; for (const [id, v] of lv) (out[v] ||= []).push(id); return out.filter(Boolean);
  }
  let running = false, dead = false;
  runBtn.addEventListener("click", async () => {
    if (running) return; running = true; runBtn.setAttribute("aria-disabled", "true"); runBtn.lastChild.textContent = tt("flow.7");
    for (const n of nodes.values()) { n.el.classList.remove("sn-done", "sn-running"); const st = $(".sn-st", n.el); if (st) st.innerHTML = ""; const pb = $(".sn-pb", n.el); if (pb) pb.style.setProperty("--sn-p", 0); }
    for (const group of levels()) {
      await Promise.all(group.map(async (id, k) => {
        const n = nodes.get(id), inc = (adjMap.get(id) || []).filter((x) => x.b === id), step = 95 + ((k * 3) % 5) * 24;
        const st = $(".sn-st", n.el), pb = $(".sn-pb", n.el);
        inc.forEach((x) => x.g.classList.add("sn-run")); n.el.classList.add("sn-running"); if (st) st.innerHTML = SPIN;
        for (let p = 0; p <= 1.001; p += .25) { if (pb) pb.style.setProperty("--sn-p", Math.min(1, p)); await new Promise((r) => setTimeout(r, step)); if (dead) return; }
        inc.forEach((x) => x.g.classList.remove("sn-run")); n.el.classList.replace("sn-running", "sn-done"); if (st) st.innerHTML = OK;
      }));
    }
    if (dead) return;
    const outs = [...nodes.values()].filter((n) => n.k === "out" || n.k === "VIDEO").length;
    running = false; runBtn.removeAttribute("aria-disabled"); runBtn.lastChild.textContent = tt("flow.8"); toast({ text: outs > 1 ? tt("flow.9", { p0: outs }) : tt("flow.10") });
  });

  const ro = new ResizeObserver(() => { boxRect = flow.getBoundingClientRect(); schedule(); });
  ro.observe(flow);
  apply();
  requestAnimationFrame(() => { measureAll(); edges.forEach(drawEdge); miniDirty = true; fit(true); });

  const api = { nodes, groups, get edges() { return edges; }, fit, center, tidy, destroy() { dead = true; ro.disconnect(); cancelAnimationFrame(raf); cancelAnimationFrame(tween); cancelAnimationFrame(tidyRaf); cancelAnimationFrame(simRaf); cancelAnimationFrame(sweepRaf); stopZoom(); if (flow._flow === api) delete flow._flow; } };
  return (flow._flow = api);
}

export const flowHTML = ({ label } = {}) =>
  `<div class="sn-flow" tabindex="0" aria-label="${esc(label ?? tt("flow.11"))}">`
  + `<div class="sn-flow-world"><div class="sn-flow-groups"></div><svg class="sn-flow-edges"></svg><div class="sn-flow-nodes"></div></div>`
  + `<div class="sn-flow-tools"><button class="sn-btn sn-ghost sn-sm sn-ibtn" data-fz="-1" data-tip="${tt("flow.12")}" data-kbd="⌘−" data-i="minus"></button>`
  + `<button class="sn-fz-val sn-num" data-fz="reset" data-tip="${tt("flow.13")}">100%</button>`
  + `<button class="sn-btn sn-ghost sn-sm sn-ibtn" data-fz="1" data-tip="${tt("flow.14")}" data-kbd="⌘+" data-i="plus"></button><span class="sn-vr"></span>`
  + `<button class="sn-btn sn-ghost sn-sm sn-ibtn" data-fz="fit" data-tip="${tt("flow.15")}" data-kbd="⇧1" data-i="maximize-2"></button>`
  + `<button class="sn-btn sn-ghost sn-sm sn-ibtn" data-fz="center" data-tip="${tt("flow.16")}" data-kbd="⇧2" data-i="locate-fixed"></button><span class="sn-vr"></span>`
  + `<button class="sn-btn sn-ghost sn-sm" data-flow-tidy data-tip="${tt("flow.17")}" data-kbd="⇧L" data-i="workflow:before">${tt("flow.18")}</button></div>`
  + `<div class="sn-flow-run"><button class="sn-btn sn-primary sn-sm" data-flow-run data-i="play:before">${tt("flow.8")}</button></div>`
  + `<div class="sn-flow-mini"><svg></svg><i class="sn-mini-view"></i></div>`
  + `</div>`;

export const createFlow = /* @__PURE__ */ defineComponent({
  name: "flow",
  html: (o) => flowHTML(o),
  mount(el, o) { injectIcons(el); return mountFlow(el, o); },
});
