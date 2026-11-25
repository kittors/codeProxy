// Satin：数据图表（折线面积、分组柱状、环形占比、迷你火花线、真交互 3D 立体柱阵）与 3D 立体质感图标。
// 零第三方依赖，Node 侧导入无副作用；所有颜色读 --sn-* CSS 令牌，深浅主题与自定义主色切换自动重绘。
import { reduced } from "../core/core.js";
import { icon } from "../foundation/icons.js";
import { defineComponent } from "../core/lifecycle.js";
import { scoped, intlLocale } from "../foundation/i18n.js";
import I18N_DEFAULTS from "../foundation/locales/zh-CN/charts.js";

const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);

const EASE_OUT = (t) => 1 - (1 - t) ** 3;
const EASE_STRONG = (t) => (t >= 1 ? 1 : 1 - (1 - t) ** 4);
const EASE_BACK = (t) => { const c1 = 1.18, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtNum = (v, unit = "") => {
  if (v == null || Number.isNaN(+v)) return "—";
  const n = +v, s = Math.abs(n) >= 1000 ? n.toLocaleString(intlLocale(), { maximumFractionDigits: 1 }) : Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit ? `${s}${unit}` : s;
};

// 解析 CSS 令牌为 Canvas 可用的 RGBA（同时支持 rgb/rgba 与 #hex），便于 3D 光影计算
function parseColor(str) {
  const s = String(str || "").trim();
  const hm = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hm) {
    const h = hm[1].length === 3 ? hm[1].split("").map((c) => c + c).join("") : hm[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const m = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
  return { r: 120, g: 120, b: 128, a: 1 };
}
const rgba = (c, a = 1) => `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${(c.a * a).toFixed(3)})`;
const shadeRGB = (c, k) => {
  const f = (ch) => clamp(k >= 0 ? ch + (255 - ch) * k : ch * (1 + k), 0, 255);
  return { r: f(c.r), g: f(c.g), b: f(c.b), a: c.a };
};

function createThemeReader(host) {
  const probe = document.createElement("i");
  probe.style.display = "none";
  host.append(probe);
  const readOne = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
  const read = () => {
    const cs = getComputedStyle(document.documentElement);
    const fam = cs.getPropertyValue("--sn-sans").trim() || "-apple-system, 'PingFang SC', sans-serif";
    const scale = Math.min(1.14, parseFloat(cs.getPropertyValue("--sn-font-scale")) || 1);
    const dark = document.documentElement.dataset.theme === "dark";
    const accent = readOne("var(--sn-accent)");
    const success = readOne("var(--sn-success)");
    const warning = readOne("var(--sn-warning)");
    const danger = readOne("var(--sn-danger)");
    const label = readOne("var(--sn-label)");
    const label2 = readOne("var(--sn-label2)");
    const label3 = readOne("var(--sn-label3)");
    const raised = readOne("var(--sn-raised)");
    const canvas = readOne("var(--sn-canvas)");
    const line = readOne("var(--sn-line)");
    const fillS = readOne("var(--sn-fill-subtle)");
    const fillA = readOne("var(--sn-fill-active)");
    // 系列色板：保持 Satin 克制高级感——主系列跟主题主色，次系列配清透语义/中性色，深浅双色均有清晰分辨度
    const palette = dark
      ? [accent, "#52a8ff", success, warning, "#a78bfa", label2]
      : [accent, "#2563eb", success, warning, "#7c3aed", label2];
    const byTone = { accent, blue: dark ? "#52a8ff" : "#2563eb", success, ok: success, warning, warn: warning, danger, bad: danger, muted: label3, violet: dark ? "#a78bfa" : "#7c3aed" };
    return { fam, scale, dark, accent, success, warning, danger, label, label2, label3, raised, canvas, line, fillS, fillA, palette, byTone,
      pick(color, i) { if (!color) return palette[i % palette.length]; if (byTone[color]) return byTone[color]; return readOne(color); },
    };
  };
  return { read, destroy: () => probe.remove() };
}

function niceMax(maxVal) {
  if (maxVal <= 0) return 10;
  const exp = Math.floor(Math.log10(maxVal)), base = 10 ** exp, f = maxVal / base;
  const nice = f <= 1.2 ? 1.2 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10;
  return nice * base;
}

// Monotone Cubic Hermite 平滑曲线路径（绝不过冲歪曲单调数据）
function traceSmoothPath(g, pts) {
  const n = pts.length;
  if (!n) return;
  g.moveTo(pts[0].x, pts[0].y);
  if (n === 1) return;
  if (n === 2) { g.lineTo(pts[1].x, pts[1].y); return; }
  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x || 1; dy[i] = pts[i + 1].y - pts[i].y; m[i] = dy[i] / dx[i]; }
  const tang = new Array(n).fill(0);
  tang[0] = m[0]; tang[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) tang[i] = 0;
    else { const w1 = dx[i - 1] + 2 * dx[i], w2 = 2 * dx[i - 1] + dx[i]; tang[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]); }
  }
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    g.bezierCurveTo(pts[i].x + h, pts[i].y + tang[i] * h, pts[i + 1].x - h, pts[i + 1].y - tang[i + 1] * h, pts[i + 1].x, pts[i + 1].y);
  }
}

// 将离散序列按同构 Monotone Cubic Hermite 样条重采样为固定点数的归一化高度曲线（值域 [0, 1]）：
// 无论数据点数变化（如 7 天 ↔ 4 周）还是跨数量级切换，都在统一屏幕高度空间里零阶梯跳档、零瞬切丝滑 Morph。
const MORPH_SAMPLES = 96;
function sampleSmoothCurve(values, yMax, samples = MORPH_SAMPLES) {
  const n = values?.length || 0;
  const out = new Float64Array(samples);
  if (!n || yMax <= 0) return out;
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) ys[i] = clamp((+values[i] || 0) / yMax, 0, 1);
  if (n === 1) { out.fill(ys[0]); return out; }
  if (n === 2) {
    for (let j = 0; j < samples; j++) out[j] = lerp(ys[0], ys[1], j / (samples - 1));
    return out;
  }
  const segs = n - 1, h = 1 / segs;
  const m = new Float64Array(segs);
  for (let i = 0; i < segs; i++) m[i] = (ys[i + 1] - ys[i]) / h;
  const tang = new Float64Array(n);
  tang[0] = m[0]; tang[segs] = m[segs - 1];
  for (let i = 1; i < segs; i++) {
    if (m[i - 1] * m[i] <= 0) tang[i] = 0;
    else tang[i] = 2 / (1 / m[i - 1] + 1 / m[i]);
  }
  for (let j = 0; j < samples; j++) {
    const pos = (j / (samples - 1)) * segs;
    const i = Math.min(segs - 1, Math.floor(pos)), t = pos - i;
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    out[j] = clamp(h00 * ys[i] + h10 * h * tang[i] + h01 * ys[i + 1] + h11 * h * tang[i + 1], 0, 1);
  }
  return out;
}

function evalSampled(curve, u) {
  const m = curve?.length || 0;
  if (!m) return 0;
  if (m === 1) return curve[0];
  const pos = clamp(u, 0, 1) * (m - 1);
  const i = Math.min(m - 2, Math.floor(pos)), f = pos - i;
  return lerp(curve[i], curve[i + 1], f);
}

function positionTip(tip, stage, px, py) {
  const sw = stage.clientWidth, sh = stage.clientHeight, tw = tip.offsetWidth || 160, th = tip.offsetHeight || 72;
  let x = px + 14, y = py - th / 2;
  if (x + tw > sw - 8) x = Math.max(8, px - tw - 14);
  y = clamp(y, 8, Math.max(8, sh - th - 8));
  tip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

function setupCanvas(cv, stage) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(120, stage.clientWidth || 320), h = Math.max(60, stage.clientHeight || 220);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h, dpr };
}

// =========================================================================
// 1. 平滑趋势面积 / 折线图（createAreaChart）
// =========================================================================
function mountAreaChart(root, opts = {}) {
  let cfg = { labels: [], series: [], height: 248, unit: "", legend: true, area: true, ...opts };
  root.classList.add("sn-ch", "sn-ch-area");
  root.innerHTML = `<div class="sn-ch-top"><div class="sn-ch-legend"></div></div><div class="sn-ch-stage" style="--sn-ch-h:${typeof cfg.height === "number" ? cfg.height + "px" : cfg.height}"><canvas class="sn-ch-cv"></canvas><div class="sn-ch-tip" role="status" aria-live="polite"></div></div>`;
  const topEl = root.querySelector(".sn-ch-top"), legEl = root.querySelector(".sn-ch-legend"), stage = root.querySelector(".sn-ch-stage"), cv = root.querySelector(".sn-ch-cv"), tip = root.querySelector(".sn-ch-tip");
  const tr = createThemeReader(root);
  let T = tr.read(), hidden = new Set(), raf = 0, dead = false, legSig = "";
  let reveal = reduced() ? 1 : 0, revealT0 = performance.now();
  let fromYMax = 10, toYMax = 10, fromLabels = [], toLabels = [], labelsChanged = false;
  let fromCurves = [], toCurves = [], curCurves = [], seriesAlpha = [];
  let morphT0 = 0, morphing = false;
  let hoverIdx = -1, smoothX = -1, smoothA = 0, lastT = performance.now();
  const MORPH_DUR = 460;

  const computeYMax = () => {
    let rawMax = 0;
    cfg.series.forEach((s, si) => {
      if (!hidden.has(si)) for (const v of (s.values || [])) { const n = +v || 0; if (n > rawMax) rawMax = n; }
    });
    return niceMax(rawMax * 1.08);
  };

  const stepCurves = (now) => {
    if (!morphing) return 1;
    const k = clamp((now - morphT0) / MORPH_DUR, 0, 1), e = EASE_STRONG(k);
    for (let si = 0; si < toCurves.length; si++) {
      const fc = fromCurves[si], tc = toCurves[si], cc = curCurves[si];
      if (!cc || !tc) continue;
      for (let j = 0; j < cc.length; j++) cc[j] = lerp(fc ? fc[j] : 0, tc[j], e);
    }
    if (k >= 1) morphing = false;
    return k;
  };

  const syncTarget = (animate) => {
    const nextYMax = computeYMax();
    const nextLabels = (cfg.labels || []).slice();
    const nextCurves = cfg.series.map((s) => sampleSmoothCurve(s.values || [], nextYMax));
    seriesAlpha = cfg.series.map((_, si) => (seriesAlpha[si] != null ? seriesAlpha[si] : (hidden.has(si) ? 0 : 1)));
    if (!animate || !curCurves.length || reduced()) {
      fromYMax = toYMax = nextYMax;
      fromLabels = nextLabels.slice();
      toLabels = nextLabels;
      labelsChanged = false;
      fromCurves = nextCurves.map((c) => c.slice());
      toCurves = nextCurves;
      curCurves = nextCurves.map((c) => c.slice());
      morphing = false;
      return;
    }
    stepCurves(performance.now());
    fromYMax = toYMax;
    toYMax = nextYMax;
    fromLabels = toLabels.slice();
    toLabels = nextLabels;
    labelsChanged = fromLabels.length !== toLabels.length || fromLabels.some((l, i) => l !== toLabels[i]);
    fromCurves = nextCurves.map((_, si) => (curCurves[si] ? curCurves[si].slice() : new Float64Array(MORPH_SAMPLES)));
    toCurves = nextCurves;
    curCurves = fromCurves.map((c) => c.slice());
    morphT0 = performance.now();
    morphing = true;
  };
  syncTarget(false);

  const buildLegend = () => {
    topEl.hidden = !cfg.legend || cfg.series.length <= 1;
    if (topEl.hidden) { legSig = ""; return; }
    const sig = cfg.series.map((s, i) => `${s.name}\x1f${T.pick(s.color, i)}\x1f${hidden.has(i) ? 1 : 0}`).join("\x1e");
    if (sig === legSig) return;
    legSig = sig;
    legEl.innerHTML = cfg.series.map((s, i) => {
      const c = T.pick(s.color, i);
      return `<button type="button" class="sn-ch-leg${hidden.has(i) ? " sn-ch-off" : ""}" data-si="${i}" aria-pressed="${!hidden.has(i)}"><i class="sn-ch-leg-dot" style="--sn-ch-c:${c}"></i><span class="sn-ch-leg-lbl">${esc(s.name)}</span></button>`;
    }).join("");
  };
  buildLegend();

  legEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-si]"); if (!b) return;
    const i = +b.dataset.si;
    if (hidden.has(i)) hidden.delete(i);
    else if (hidden.size < cfg.series.length - 1) hidden.add(i);
    buildLegend();
    syncTarget(true);
    schedule();
  });

  const pad = { l: 48, r: 16, t: 16, b: 30 };

  function draw(now = performance.now()) {
    raf = 0; if (dead) return;
    const dt = Math.min(40, Math.max(8, now - lastT)); lastT = now;
    let more = false;
    if (reveal < 1) {
      reveal = reduced() ? 1 : EASE_STRONG(clamp((now - revealT0) / 720, 0, 1));
      if (reveal < 1) more = true;
    }
    const morphK = stepCurves(now);
    if (morphing) more = true;

    const damp = reduced() ? 1 : 1 - Math.exp(-dt / 42);
    for (let si = 0; si < cfg.series.length; si++) {
      const tgt = hidden.has(si) ? 0 : 1;
      const cur = seriesAlpha[si] ?? tgt;
      seriesAlpha[si] = Math.abs(cur - tgt) < .005 ? tgt : lerp(cur, tgt, damp);
      if (seriesAlpha[si] !== tgt) more = true;
    }

    const { g, w, h } = setupCanvas(cv, stage);
    g.clearRect(0, 0, w, h);
    const n = cfg.labels.length;
    if (!n) return;

    const pw = Math.max(10, w - pad.l - pad.r), ph = Math.max(10, h - pad.t - pad.b);
    const xAt = (i, total = n) => pad.l + (total <= 1 ? pw / 2 : (i / (total - 1)) * pw);
    const yNorm = (r) => pad.t + ph - clamp(r, 0, 1) * ph;

    // 水平参考网格线（4 档固定等分，绝不跳动）与 Y 轴刻度数值（跨量级切换时柔和错峰淡入淡出）
    const ticks = 4;
    const yChanged = morphing && fromYMax !== toYMax;
    const yDir = toYMax > fromYMax ? 1 : -1;
    const aOut = yChanged ? clamp(1 - morphK / 0.42, 0, 1) : 0;
    const aIn = yChanged ? EASE_OUT(clamp((morphK - 0.34) / 0.58, 0, 1)) : 1;
    g.font = `400 ${11 * T.scale}px ${T.fam}`;
    g.textBaseline = "middle";
    for (let i = 0; i <= ticks; i++) {
      const y = Math.round(pad.t + ph * (1 - i / ticks)) + .5;
      g.strokeStyle = i === 0 ? T.line : rgba(parseColor(T.label), T.dark ? .07 : .06);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
      g.fillStyle = T.label3; g.textAlign = "right";
      if (i === 0 || !yChanged) {
        g.fillText(fmtNum(Math.round((toYMax / ticks) * i)), pad.l - 10, y);
      } else {
        if (aOut > .01) {
          g.save(); g.globalAlpha = aOut;
          g.fillText(fmtNum(Math.round((fromYMax / ticks) * i)), pad.l - 10, y + yDir * 5 * (1 - aOut));
          g.restore();
        }
        if (aIn > .01) {
          g.save(); g.globalAlpha = aIn;
          g.fillText(fmtNum(Math.round((toYMax / ticks) * i)), pad.l - 10, y - yDir * 5 * (1 - aIn));
          g.restore();
        }
      }
    }

    // X 轴标签（自动避让不拥挤；切换周期标签变动时柔和错峰淡入淡出，彻底消除硬切闪烁）
    const drawXLabels = (labels, alpha, dy) => {
      const len = labels?.length || 0;
      if (!len || alpha <= .01) return;
      const maxLabels = Math.max(2, Math.floor(pw / 64)), step = Math.max(1, Math.ceil(len / maxLabels));
      g.save();
      g.globalAlpha = alpha;
      g.fillStyle = T.label3; g.textAlign = "center"; g.textBaseline = "top";
      for (let i = 0; i < len; i++) {
        if (i % step !== 0 && i !== len - 1) continue;
        if (i !== len - 1 && len - 1 - i < step * 0.5) continue;
        g.fillText(labels[i], xAt(i, len), pad.t + ph + 10 + dy);
      }
      g.restore();
    };
    if (morphing && labelsChanged) {
      const lxOut = clamp(1 - morphK / 0.4, 0, 1);
      const lxIn = EASE_OUT(clamp((morphK - 0.36) / 0.64, 0, 1));
      drawXLabels(fromLabels, lxOut, 4 * (1 - lxOut));
      drawXLabels(toLabels, lxIn, -4 * (1 - lxIn));
    } else {
      drawXLabels(toLabels, 1, 0);
    }

    // 曲线与柔和面积填充（入场从左向右丝滑描边展开；切换周期在归一化高度空间 96 点等距平滑 Morph）
    const clipW = pad.l + pw * reveal + 6;
    g.save();
    g.beginPath(); g.rect(0, 0, clipW, h); g.clip();
    cfg.series.forEach((s, si) => {
      const sa = seriesAlpha[si] ?? (hidden.has(si) ? 0 : 1);
      if (sa <= .005) return;
      const color = T.pick(s.color, si), rgb = parseColor(color);
      const traceCurrent = () => {
        if (morphing) {
          const curve = curCurves[si];
          const m = curve.length;
          g.moveTo(pad.l, yNorm(curve[0]));
          for (let j = 1; j < m; j++) g.lineTo(pad.l + (j / (m - 1)) * pw, yNorm(curve[j]));
        } else {
          const pts = (s.values || []).map((v, i) => ({ x: xAt(i), y: yNorm((+v || 0) / toYMax) }));
          traceSmoothPath(g, pts);
        }
      };
      const firstX = morphing ? pad.l : xAt(0);
      const lastX = morphing ? pad.l + pw : xAt(n - 1);
      g.save();
      g.globalAlpha = sa;
      if (cfg.area) {
        const grad = g.createLinearGradient(0, pad.t, 0, pad.t + ph);
        grad.addColorStop(0, rgba(rgb, (T.dark ? .24 : .16) * reveal));
        grad.addColorStop(1, rgba(rgb, 0));
        g.beginPath(); traceCurrent();
        g.lineTo(lastX, pad.t + ph); g.lineTo(firstX, pad.t + ph); g.closePath();
        g.fillStyle = grad; g.fill();
      }
      g.beginPath(); traceCurrent();
      g.strokeStyle = color; g.lineWidth = si === 0 ? 2.2 : 1.8;
      g.lineCap = "round"; g.lineJoin = "round";
      if (s.dashed) g.setLineDash([5, 4]);
      g.stroke();
      g.setLineDash([]);
      g.restore();
    });
    g.restore();

    // 悬浮准星 + 高亮圆点（沿真实曲线平滑贴合跟手）
    const targetA = hoverIdx >= 0 ? 1 : 0;
    smoothA = lerp(smoothA, targetA, damp);
    if (hoverIdx >= 0) {
      const tx = xAt(Math.min(hoverIdx, n - 1));
      smoothX = smoothX < 0 ? tx : lerp(smoothX, tx, damp);
    }
    if (Math.abs(smoothA - targetA) > .01 || (hoverIdx >= 0 && Math.abs(smoothX - xAt(Math.min(hoverIdx, n - 1))) > .3)) more = true;

    if (smoothA > .01 && smoothX >= pad.l - 1) {
      const u = clamp((smoothX - pad.l) / pw, 0, 1);
      g.save();
      g.globalAlpha = smoothA;
      g.strokeStyle = rgba(parseColor(T.label), T.dark ? .24 : .18);
      g.lineWidth = 1; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(Math.round(smoothX) + .5, pad.t); g.lineTo(Math.round(smoothX) + .5, pad.t + ph); g.stroke();
      g.setLineDash([]);

      if (hoverIdx >= 0) {
        cfg.series.forEach((s, si) => {
          const sa = seriesAlpha[si] ?? (hidden.has(si) ? 0 : 1);
          if (sa <= .05) return;
          const color = T.pick(s.color, si), rgb = parseColor(color);
          const curve = morphing ? curCurves[si] : toCurves[si];
          const cy = yNorm(evalSampled(curve, u));
          g.save();
          g.globalAlpha = smoothA * sa;
          g.beginPath(); g.arc(smoothX, cy, 8, 0, Math.PI * 2);
          g.fillStyle = rgba(rgb, .18); g.fill();
          g.beginPath(); g.arc(smoothX, cy, 4, 0, Math.PI * 2);
          g.fillStyle = T.raised; g.fill();
          g.lineWidth = 2.2; g.strokeStyle = color; g.stroke();
          g.restore();
        });
      }
      g.restore();
    }

    if (more) schedule();
  }

  const schedule = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };

  const updateTip = (idx) => {
    if (idx < 0 || idx >= cfg.labels.length) { tip.classList.remove("sn-ch-vis"); return; }
    const rows = cfg.series.map((s, si) => {
      if (hidden.has(si)) return "";
      const c = T.pick(s.color, si), v = s.values?.[idx] ?? 0;
      return `<div class="sn-ch-tip-row"><i class="sn-ch-tip-dot" style="background:${c}"></i><span class="sn-ch-tip-name">${esc(s.name)}</span><span class="sn-ch-tip-val">${esc(fmtNum(v, s.unit ?? cfg.unit))}</span></div>`;
    }).filter(Boolean).join("");
    const extra = cfg.tipNote ? `<div class="sn-ch-tip-sub">${esc(cfg.tipNote(idx, cfg))}</div>` : "";
    tip.innerHTML = `<div class="sn-ch-tip-hd">${esc(cfg.labels[idx])}</div><div class="sn-ch-tip-rows">${rows}</div>${extra}`;
    tip.classList.add("sn-ch-vis");
    const pw = Math.max(10, stage.clientWidth - pad.l - pad.r), n = cfg.labels.length;
    const px = pad.l + (n === 1 ? pw / 2 : (idx / (n - 1)) * pw);
    positionTip(tip, stage, px, stage.clientHeight * 0.36);
  };

  cv.addEventListener("pointermove", (e) => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, n = cfg.labels.length;
    if (!n) return;
    const pw = Math.max(10, r.width - pad.l - pad.r);
    const idx = n === 1 ? 0 : clamp(Math.round(((x - pad.l) / pw) * (n - 1)), 0, n - 1);
    if (idx !== hoverIdx) { hoverIdx = idx; updateTip(idx); schedule(); }
  });
  cv.addEventListener("pointerleave", () => { hoverIdx = -1; tip.classList.remove("sn-ch-vis"); schedule(); });

  const ro = new ResizeObserver(() => schedule()); ro.observe(stage);
  const mo = new MutationObserver(() => { T = tr.read(); buildLegend(); schedule(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
  schedule();

  return {
    update(next) {
      cfg = { ...cfg, ...next };
      if (next.height) stage.style.setProperty("--sn-ch-h", typeof cfg.height === "number" ? cfg.height + "px" : cfg.height);
      syncTarget(true);
      buildLegend();
      if (hoverIdx >= 0) {
        hoverIdx = Math.min(hoverIdx, Math.max(0, cfg.labels.length - 1));
        updateTip(hoverIdx);
      }
      schedule();
    },
    replay() { reveal = reduced() ? 1 : 0; revealT0 = performance.now(); schedule(); },
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); tr.destroy(); },
  };
}

export const createAreaChart = /* @__PURE__ */ defineComponent({
  name: "area-chart",
  html: () => '<div class="sn-ch-host"></div>',
  mount(el, o) { return mountAreaChart(el, o); },
});

// =========================================================================
// 2. 分组对比柱状图（createBarChart）
// =========================================================================
function mountBarChart(root, opts = {}) {
  let cfg = { labels: [], series: [], height: 248, unit: "", legend: true, activeIndex: -1, ...opts };
  root.classList.add("sn-ch", "sn-ch-bar");
  root.innerHTML = `<div class="sn-ch-top"><div class="sn-ch-legend"></div></div><div class="sn-ch-stage" style="--sn-ch-h:${typeof cfg.height === "number" ? cfg.height + "px" : cfg.height}"><canvas class="sn-ch-cv"></canvas><div class="sn-ch-tip" role="status" aria-live="polite"></div></div>`;
  const topEl = root.querySelector(".sn-ch-top"), legEl = root.querySelector(".sn-ch-legend"), stage = root.querySelector(".sn-ch-stage"), cv = root.querySelector(".sn-ch-cv"), tip = root.querySelector(".sn-ch-tip");
  const tr = createThemeReader(root);
  let T = tr.read(), hidden = new Set(), raf = 0, dead = false;
  let enterT0 = performance.now(), curVals = [], fromVals = [], curNorm = [], fromNorm = [], toNorm = [];
  let fromYMax = 10, toYMax = 10, morphT0 = 0, morphing = false;
  let hoverGrp = -1, selGrp = cfg.activeIndex ?? -1, focusW = [], lastT = performance.now();
  const MORPH_DUR = 440;

  const computeYMax = () => {
    let rawMax = 0;
    cfg.series.forEach((s, si) => {
      if (!hidden.has(si)) for (const v of (s.values || [])) { const n = +v || 0; if (n > rawMax) rawMax = n; }
    });
    return niceMax(rawMax * 1.12);
  };

  const syncVals = (snap) => {
    const target = cfg.series.map((s) => (s.values || []).map((v) => +v || 0));
    const nextYMax = computeYMax();
    const nextNorm = target.map((arr) => arr.map((v) => clamp(v / nextYMax, 0, 1)));
    if (!snap || !curNorm.length || curNorm.length !== nextNorm.length || (curNorm[0]?.length !== nextNorm[0]?.length) || reduced()) {
      fromYMax = toYMax = nextYMax;
      curVals = target.map((a) => a.slice()); fromVals = target.map((a) => a.slice());
      curNorm = nextNorm.map((a) => a.slice()); fromNorm = nextNorm.map((a) => a.slice()); toNorm = nextNorm;
      morphing = false;
    } else {
      fromYMax = toYMax; toYMax = nextYMax;
      fromVals = curVals.map((a) => a.slice());
      fromNorm = curNorm.map((a) => a.slice());
      toNorm = nextNorm;
      morphT0 = performance.now(); morphing = true;
    }
    focusW = new Array(cfg.labels.length).fill(0);
  };
  syncVals(false);

  const buildLegend = () => {
    topEl.hidden = !cfg.legend || cfg.series.length <= 1;
    if (topEl.hidden) return;
    legEl.innerHTML = cfg.series.map((s, i) => {
      const c = T.pick(s.color, i);
      return `<button type="button" class="sn-ch-leg${hidden.has(i) ? " sn-ch-off" : ""}" data-si="${i}" aria-pressed="${!hidden.has(i)}"><i class="sn-ch-leg-dot" style="--sn-ch-c:${c}"></i><span class="sn-ch-leg-lbl">${esc(s.name)}</span></button>`;
    }).join("");
  };
  buildLegend();
  legEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-si]"); if (!b) return;
    const i = +b.dataset.si;
    if (hidden.has(i)) hidden.delete(i); else if (hidden.size < cfg.series.length - 1) hidden.add(i);
    buildLegend(); syncVals(true); schedule();
  });

  const pad = { l: 48, r: 12, t: 22, b: 30 };

  function draw(now = performance.now()) {
    raf = 0; if (dead) return;
    const dt = Math.min(40, Math.max(8, now - lastT)); lastT = now;
    let more = false;
    const morphK = morphing ? clamp((now - morphT0) / MORPH_DUR, 0, 1) : 1;
    const morphE = EASE_STRONG(morphK);
    const vals = morphing
      ? cfg.series.map((s, si) => (s.values || []).map((v, vi) => lerp(fromVals[si]?.[vi] ?? 0, +v || 0, morphE)))
      : cfg.series.map((s) => (s.values || []).map((v) => +v || 0));
    const norms = morphing
      ? toNorm.map((arr, si) => arr.map((r, vi) => lerp(fromNorm[si]?.[vi] ?? 0, r, morphE)))
      : toNorm;
    curVals = vals; curNorm = norms;
    if (morphing) {
      if (morphK >= 1) morphing = false;
      else more = true;
    }

    const { g, w, h } = setupCanvas(cv, stage);
    g.clearRect(0, 0, w, h);
    const n = cfg.labels.length; if (!n) return;
    const visS = cfg.series.map((_, i) => i).filter((i) => !hidden.has(i));
    const pw = Math.max(10, w - pad.l - pad.r), ph = Math.max(10, h - pad.t - pad.b);

    // 网格线（固定 4 档等分；Y 轴数值跨量级切换时柔和错峰淡入淡出）
    const ticks = 4;
    const yChanged = morphing && fromYMax !== toYMax;
    const yDir = toYMax > fromYMax ? 1 : -1;
    const aOut = yChanged ? clamp(1 - morphK / 0.42, 0, 1) : 0;
    const aIn = yChanged ? EASE_OUT(clamp((morphK - 0.34) / 0.58, 0, 1)) : 1;
    g.font = `400 ${11 * T.scale}px ${T.fam}`; g.textBaseline = "middle";
    for (let i = 0; i <= ticks; i++) {
      const y = Math.round(pad.t + ph * (1 - i / ticks)) + .5;
      g.strokeStyle = i === 0 ? T.line : rgba(parseColor(T.label), T.dark ? .07 : .06);
      g.lineWidth = 1; g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
      g.fillStyle = T.label3; g.textAlign = "right";
      if (i === 0 || !yChanged) {
        g.fillText(fmtNum(Math.round((toYMax / ticks) * i)), pad.l - 10, y);
      } else {
        if (aOut > .01) { g.save(); g.globalAlpha = aOut; g.fillText(fmtNum(Math.round((fromYMax / ticks) * i)), pad.l - 10, y + yDir * 5 * (1 - aOut)); g.restore(); }
        if (aIn > .01) { g.save(); g.globalAlpha = aIn; g.fillText(fmtNum(Math.round((toYMax / ticks) * i)), pad.l - 10, y - yDir * 5 * (1 - aIn)); g.restore(); }
      }
    }

    const slotW = pw / n, grpW = Math.min(slotW * 0.66, visS.length * 32 + 12), gap = visS.length > 1 ? 5 : 0;
    const barW = Math.max(6, (grpW - gap * (visS.length - 1)) / visS.length);
    const damp = reduced() ? 1 : 1 - Math.exp(-dt / 45);
    const anyFocus = hoverGrp >= 0 || selGrp >= 0;

    for (let i = 0; i < n; i++) {
      const cx = pad.l + (i + 0.5) * slotW;
      const isFoc = i === hoverGrp || i === selGrp;
      const tgt = isFoc ? 1 : 0;
      focusW[i] = lerp(focusW[i] ?? 0, tgt, damp);
      if (Math.abs(focusW[i] - tgt) > .01) more = true;

      // 柱组柔和悬停底带
      if (focusW[i] > .02) {
        g.fillStyle = rgba(parseColor(T.label), (T.dark ? .06 : .04) * focusW[i]);
        g.beginPath(); g.roundRect(cx - slotW * 0.42, pad.t, slotW * 0.84, ph, 8); g.fill();
      }

      // 交错弹簧生长入场
      const delay = i * 42, rawK = reduced() ? 1 : clamp((now - enterT0 - delay) / 560, 0, 1);
      const grow = rawK >= 1 ? 1 : clamp(EASE_BACK(rawK), 0, 1.06);
      if (rawK < 1) more = true;

      const x0 = cx - grpW / 2;
      const dimAlpha = anyFocus ? lerp(0.38, 1, focusW[i]) : 1;
      visS.forEach((si, j) => {
        const v = vals[si][i] ?? 0;
        const bh = Math.max(0, (norms[si]?.[i] ?? 0) * ph * grow);
        const bx = x0 + j * (barW + gap), by = pad.t + ph - bh;
        const color = T.pick(cfg.series[si].color, si);
        g.save();
        g.globalAlpha = dimAlpha;
        g.fillStyle = color;
        const r = Math.min(6, barW / 2, bh);
        if (bh > 0.5) {
          g.beginPath();
          g.roundRect(bx, by, barW, bh, [r, r, 0, 0]);
          g.fill();
        }
        // 聚焦组柱顶浮现精确数值
        if (focusW[i] > .06 && bh > 2) {
          g.globalAlpha = focusW[i];
          g.font = `600 ${11 * T.scale}px ${T.fam}`;
          g.fillStyle = T.label; g.textAlign = "center"; g.textBaseline = "bottom";
          g.fillText(fmtNum(Math.round(v)), bx + barW / 2, by - 4 - focusW[i] * 2);
        }
        g.restore();
      });

      // X 轴标签
      g.font = `${isFoc ? 600 : 400} ${11.5 * T.scale}px ${T.fam}`;
      g.fillStyle = isFoc ? T.label : T.label3;
      g.textAlign = "center"; g.textBaseline = "top";
      g.fillText(cfg.labels[i], cx, pad.t + ph + 10);
    }

    if (more) schedule();
  }

  const schedule = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };

  const updateTip = (idx) => {
    if (idx < 0 || idx >= cfg.labels.length) { tip.classList.remove("sn-ch-vis"); return; }
    const rows = cfg.series.map((s, si) => {
      if (hidden.has(si)) return "";
      const c = T.pick(s.color, si), v = s.values?.[idx] ?? 0;
      return `<div class="sn-ch-tip-row"><i class="sn-ch-tip-dot" style="background:${c}"></i><span class="sn-ch-tip-name">${esc(s.name)}</span><span class="sn-ch-tip-val">${esc(fmtNum(v, s.unit ?? cfg.unit))}</span></div>`;
    }).filter(Boolean).join("");
    const sub = cfg.onSelect ? `<div class="sn-ch-tip-sub">${selGrp === idx ? tt("charts.0") : tt("charts.1")}</div>` : "";
    tip.innerHTML = `<div class="sn-ch-tip-hd">${esc(cfg.labels[idx])}</div><div class="sn-ch-tip-rows">${rows}</div>${sub}`;
    tip.classList.add("sn-ch-vis");
    const pw = Math.max(10, stage.clientWidth - pad.l - pad.r), cx = pad.l + ((idx + 0.5) / cfg.labels.length) * pw;
    positionTip(tip, stage, cx, stage.clientHeight * 0.34);
  };

  cv.addEventListener("pointermove", (e) => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, n = cfg.labels.length; if (!n) return;
    const pw = Math.max(10, r.width - pad.l - pad.r), idx = clamp(Math.floor(((x - pad.l) / pw) * n), 0, n - 1);
    cv.style.cursor = cfg.onSelect ? "pointer" : "default";
    if (idx !== hoverGrp) { hoverGrp = idx; updateTip(idx); schedule(); }
  });
  cv.addEventListener("pointerleave", () => { hoverGrp = -1; tip.classList.remove("sn-ch-vis"); schedule(); });
  cv.addEventListener("click", () => {
    if (hoverGrp < 0 || !cfg.onSelect) return;
    selGrp = selGrp === hoverGrp ? -1 : hoverGrp;
    cfg.onSelect(selGrp >= 0 ? cfg.labels[selGrp] : null, selGrp);
    updateTip(hoverGrp);
    schedule();
  });

  const ro = new ResizeObserver(() => schedule()); ro.observe(stage);
  const mo = new MutationObserver(() => { T = tr.read(); buildLegend(); schedule(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
  schedule();

  return {
    update(next) {
      cfg = { ...cfg, ...next };
      if ("activeIndex" in next) selGrp = next.activeIndex ?? -1;
      syncVals(true); buildLegend(); schedule();
    },
    replay() { enterT0 = performance.now(); schedule(); },
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); tr.destroy(); },
  };
}

export const createBarChart = /* @__PURE__ */ defineComponent({
  name: "bar-chart",
  html: () => '<div class="sn-ch-host"></div>',
  mount(el, o) { return mountBarChart(el, o); },
});

// =========================================================================
// 3. 环形占比图（createDonutChart）
// =========================================================================
function mountDonutChart(root, opts = {}) {
  let cfg = { items: [], totalLabel: opts.totalLabel ?? opts.centerLabel ?? tt("charts.2"), unit: "", activeIndex: -1, ...opts };
  root.classList.add("sn-ch", "sn-ch-donut");
  root.innerHTML = `<div class="sn-ch-donut-wrap"><div class="sn-ch-donut-box"><canvas class="sn-ch-cv"></canvas><div class="sn-ch-donut-mid"><b class="sn-ch-donut-val"></b><span class="sn-ch-donut-lbl"></span></div></div><div class="sn-ch-donut-list"></div></div>`;
  const box = root.querySelector(".sn-ch-donut-box"), cv = root.querySelector(".sn-ch-cv"), valEl = root.querySelector(".sn-ch-donut-val"), lblEl = root.querySelector(".sn-ch-donut-lbl"), listEl = root.querySelector(".sn-ch-donut-list");
  const tr = createThemeReader(root);
  let T = tr.read(), raf = 0, dead = false, enterT0 = performance.now(), lastT = performance.now();
  let hoverIdx = -1, selIdx = cfg.activeIndex ?? -1, expand = [], curVals = [], fromVals = [], morphT0 = 0, morphing = false;

  const totalOf = (arr) => arr.reduce((s, v) => s + Math.max(0, v), 0) || 1;
  const syncVals = (snap) => {
    const t = cfg.items.map((x) => Math.max(0, +x.value || 0));
    if (!snap || curVals.length !== t.length || reduced()) { curVals = t.slice(); fromVals = t.slice(); morphing = false; }
    else { fromVals = curVals.slice(); morphT0 = performance.now(); morphing = true; }
    expand = new Array(t.length).fill(0);
  };
  syncVals(false);

  const syncCenter = () => {
    const foc = hoverIdx >= 0 ? hoverIdx : selIdx;
    const sum = totalOf(cfg.items.map((x) => +x.value || 0));
    if (foc >= 0 && cfg.items[foc]) {
      const it = cfg.items[foc];
      valEl.textContent = fmtNum(it.value, cfg.unit);
      lblEl.textContent = `${it.label} · ${Math.round(((+it.value || 0) / sum) * 100)}%`;
    } else {
      valEl.textContent = fmtNum(Math.round(sum), cfg.unit);
      lblEl.textContent = cfg.totalLabel;
    }
    const items = listEl.querySelectorAll(".sn-ch-donut-item");
    items.forEach((el, i) => {
      el.classList.toggle("sn-ch-hl", i === foc);
      el.classList.toggle("sn-ch-dim", foc >= 0 && i !== foc);
    });
  };

  const buildList = () => {
    const sum = totalOf(cfg.items.map((x) => +x.value || 0));
    listEl.innerHTML = cfg.items.map((it, i) => {
      const c = T.pick(it.color, i), pct = Math.round(((+it.value || 0) / sum) * 100);
      return `<button type="button" class="sn-ch-donut-item" data-di="${i}"><i style="--sn-ch-c:${c}"></i><span>${esc(it.label)}</span><b>${esc(fmtNum(it.value, cfg.unit))}</b><small>${pct}%</small></button>`;
    }).join("");
    syncCenter();
  };
  buildList();

  listEl.addEventListener("pointerover", (e) => {
    const b = e.target.closest("[data-di]"); if (!b) return;
    const i = +b.dataset.di; if (i !== hoverIdx) { hoverIdx = i; syncCenter(); schedule(); }
  });
  listEl.addEventListener("pointerleave", () => { hoverIdx = -1; syncCenter(); schedule(); });
  listEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-di]"); if (!b || !cfg.onSelect) return;
    const i = +b.dataset.di; selIdx = selIdx === i ? -1 : i;
    cfg.onSelect(selIdx >= 0 ? cfg.items[selIdx] : null, selIdx);
    syncCenter(); schedule();
  });

  let arcs = [];
  function draw(now = performance.now()) {
    raf = 0; if (dead) return;
    const dt = Math.min(40, Math.max(8, now - lastT)); lastT = now;
    let more = false;
    const sweep = reduced() ? 1 : EASE_STRONG(clamp((now - enterT0) / 760, 0, 1));
    if (sweep < 1) more = true;

    const vals = morphing ? cfg.items.map((x, i) => {
      const k = clamp((now - morphT0) / 420, 0, 1), e = EASE_STRONG(k);
      if (k >= 1) morphing = false;
      return lerp(fromVals[i] ?? 0, Math.max(0, +x.value || 0), e);
    }) : cfg.items.map((x) => Math.max(0, +x.value || 0));
    curVals = vals; if (morphing) more = true;

    const { g, w, h } = setupCanvas(cv, box);
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, outerR = Math.min(w, h) / 2 - 10, thick = Math.max(14, outerR * 0.24), midR = outerR - thick / 2;
    const sum = totalOf(vals), gapAng = vals.length > 1 ? 0.032 : 0;
    const foc = hoverIdx >= 0 ? hoverIdx : selIdx;
    const damp = reduced() ? 1 : 1 - Math.exp(-dt / 45);

    // 淡灰底环
    g.beginPath(); g.arc(cx, cy, midR, 0, Math.PI * 2);
    g.strokeStyle = T.fillS; g.lineWidth = thick; g.stroke();

    arcs = [];
    let ang = -Math.PI / 2;
    const maxAng = Math.PI * 2 * sweep;
    vals.forEach((v, i) => {
      const span = (v / sum) * maxAng;
      const a0 = ang + gapAng / 2, a1 = ang + Math.max(0, span - gapAng / 2);
      ang += span;
      arcs.push({ a0, a1, mid: (a0 + a1) / 2 });
      const tgt = i === foc ? 1 : 0;
      expand[i] = lerp(expand[i] ?? 0, tgt, damp);
      if (Math.abs(expand[i] - tgt) > .01) more = true;
      if (a1 <= a0 + .003) return;
      const color = T.pick(cfg.items[i].color, i);
      const shift = expand[i] * 4, r = midR + expand[i] * 2.5, lw = thick + expand[i] * 2.5;
      const midA = (a0 + a1) / 2;
      g.save();
      g.globalAlpha = foc >= 0 ? lerp(0.36, 1, expand[i]) : 1;
      g.beginPath();
      g.arc(cx + Math.cos(midA) * shift, cy + Math.sin(midA) * shift, r, a0, a1);
      g.strokeStyle = color; g.lineWidth = lw; g.lineCap = "round"; g.stroke();
      g.restore();
    });
    if (more) schedule();
  }

  const schedule = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };

  cv.addEventListener("pointermove", (e) => {
    const r = cv.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
    const dist = Math.hypot(dx, dy), outerR = Math.min(r.width, r.height) / 2 - 4, innerR = outerR * 0.52;
    let found = -1;
    if (dist >= innerR && dist <= outerR + 6) {
      let a = Math.atan2(dy, dx);
      if (a < -Math.PI / 2) a += Math.PI * 2;
      for (let i = 0; i < arcs.length; i++) if (a >= arcs[i].a0 - .02 && a <= arcs[i].a1 + .02) { found = i; break; }
    }
    cv.style.cursor = found >= 0 && cfg.onSelect ? "pointer" : "default";
    if (found !== hoverIdx) { hoverIdx = found; syncCenter(); schedule(); }
  });
  cv.addEventListener("pointerleave", () => { hoverIdx = -1; syncCenter(); schedule(); });
  cv.addEventListener("click", () => {
    if (hoverIdx < 0 || !cfg.onSelect) return;
    selIdx = selIdx === hoverIdx ? -1 : hoverIdx;
    cfg.onSelect(selIdx >= 0 ? cfg.items[selIdx] : null, selIdx);
    syncCenter(); schedule();
  });

  const ro = new ResizeObserver(() => schedule()); ro.observe(box);
  const mo = new MutationObserver(() => { T = tr.read(); buildList(); schedule(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
  schedule();

  return {
    update(next) { cfg = { ...cfg, ...next }; if ("activeIndex" in next) selIdx = next.activeIndex ?? -1; syncVals(true); buildList(); schedule(); },
    replay() { enterT0 = performance.now(); schedule(); },
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); tr.destroy(); },
  };
}

export const createDonutChart = /* @__PURE__ */ defineComponent({
  name: "donut-chart",
  html: () => '<div class="sn-ch-host"></div>',
  mount(el, o) { return mountDonutChart(el, o); },
});

// =========================================================================
// 4. 真交互 3D 立体柱状矩阵图表（createChart3D）
// =========================================================================
function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
  }
  return inside;
}

const VIEWS_3D = {
  iso: { yaw: -0.64, pitch: 0.56 },
  top: { yaw: -0.45, pitch: 1.02 },
  front: { yaw: -0.14, pitch: 0.34 },
};
const nearestAngle = (from, to) => {
  const diff = ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return from + diff;
};

function mountChart3D(root, opts = {}) {
  let cfg = { rows: [], cols: [], values: [], height: 320, unit: "", rowColors: null, interactive: true, ...opts };
  root.classList.add("sn-ch", "sn-ch3d");
  root.innerHTML = `<div class="sn-ch-top"><div class="sn-ch-legend"></div><div class="sn-ch-tools"><button type="button" class="sn-ch-btn sn-ch-on" data-v3="iso">${tt("charts.3")}</button><button type="button" class="sn-ch-btn" data-v3="top">${tt("charts.4")}</button><button type="button" class="sn-ch-btn" data-v3="front">${tt("charts.5")}</button><button type="button" class="sn-ch-btn" data-v3="replay">${tt("charts.6")}</button></div></div><div class="sn-ch-stage" style="--sn-ch-h:${typeof cfg.height === "number" ? cfg.height + "px" : cfg.height}"><canvas class="sn-ch-cv"></canvas><div class="sn-ch-hint">${tt("charts.7")}</div><div class="sn-ch-tip" role="status" aria-live="polite"></div></div>`;
  const legEl = root.querySelector(".sn-ch-legend"), toolsEl = root.querySelector(".sn-ch-tools"), stage = root.querySelector(".sn-ch-stage"), cv = root.querySelector(".sn-ch-cv"), tip = root.querySelector(".sn-ch-tip");
  const tr = createThemeReader(root);
  let T = tr.read(), raf = 0, dead = false;
  let yaw = VIEWS_3D.iso.yaw, pitch = VIEWS_3D.iso.pitch, targetYaw = yaw, targetPitch = pitch, velY = 0, velP = 0;
  let enterT0 = performance.now(), curVals = [], fromVals = [], curNorm = [], fromNorm = [], toNorm = [];
  let morphT0 = 0, morphing = false;
  let hoverKey = "", liftMap = new Map(), hitList = [], dragging = false, lastT = performance.now();

  const normValues = (vals) => cfg.rows.map((_, ri) => cfg.cols.map((__, ci) => Math.max(0, +(vals?.[ri]?.[ci] ?? 0))));
  const maxOf = (mat) => { let m = 0; for (const row of mat) for (const v of row) if (v > m) m = v; return niceMax(m * 1.12); };
  const syncVals = (snap) => {
    const target = normValues(cfg.values);
    const yMax = maxOf(target);
    const nextNorm = target.map((row) => row.map((v) => clamp(v / yMax, 0, 1)));
    if (!snap || !curNorm.length || curNorm.length !== nextNorm.length || (curNorm[0]?.length !== nextNorm[0]?.length) || reduced()) {
      curVals = target.map((r) => r.slice()); fromVals = target.map((r) => r.slice());
      curNorm = nextNorm.map((r) => r.slice()); fromNorm = nextNorm.map((r) => r.slice()); toNorm = nextNorm;
      morphing = false;
    } else {
      fromVals = curVals.map((r) => r.slice());
      fromNorm = curNorm.map((r) => r.slice());
      toNorm = nextNorm;
      morphT0 = performance.now(); morphing = true;
    }
  };
  syncVals(false);

  const buildLegend = () => {
    legEl.innerHTML = cfg.rows.map((rName, ri) => {
      const c = T.pick(cfg.rowColors?.[ri], ri);
      return `<span class="sn-ch-leg" style="cursor:default"><i class="sn-ch-leg-dot" style="--sn-ch-c:${c}"></i><span class="sn-ch-leg-lbl">${esc(rName)}</span></span>`;
    }).join("");
  };
  buildLegend();

  toolsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-v3]"); if (!b) return;
    const k = b.dataset.v3;
    if (k === "replay") { enterT0 = performance.now(); schedule(); return; }
    const v = VIEWS_3D[k]; if (!v) return;
    targetYaw = nearestAngle(yaw, v.yaw); targetPitch = v.pitch; velY = 0; velP = 0;
    toolsEl.querySelectorAll("[data-v3]").forEach((btn) => btn.classList.toggle("sn-ch-on", btn.dataset.v3 === k));
    schedule();
  });

  function draw(now = performance.now()) {
    raf = 0; if (dead) return;
    const dt = Math.min(40, Math.max(8, now - lastT)); lastT = now;
    let more = false;

    // 摄像机视角阻尼与松手惯性
    if (!dragging) {
      if (Math.abs(velY) > .0002 || Math.abs(velP) > .0002) {
        targetYaw += velY * (dt / 16);
        targetPitch = clamp(targetPitch + velP * (dt / 16), 0.22, 1.24);
        velY *= Math.exp(-dt / 140); velP *= Math.exp(-dt / 140);
        more = true;
      }
      const d = reduced() ? 1 : 1 - Math.exp(-dt / 65);
      yaw = lerp(yaw, targetYaw, d);
      pitch = lerp(pitch, targetPitch, d);
      if (Math.abs(yaw - targetYaw) > .001 || Math.abs(pitch - targetPitch) > .001) more = true;
    }

    const morphK = morphing ? clamp((now - morphT0) / 460, 0, 1) : 1;
    const morphE = EASE_STRONG(morphK);
    const vals = morphing
      ? cfg.rows.map((_, ri) => cfg.cols.map((__, ci) => lerp(fromVals[ri]?.[ci] ?? 0, +(cfg.values?.[ri]?.[ci] ?? 0), morphE)))
      : normValues(cfg.values);
    const norms = morphing
      ? toNorm.map((row, ri) => row.map((r, ci) => lerp(fromNorm[ri]?.[ci] ?? 0, r, morphE)))
      : toNorm;
    curVals = vals; curNorm = norms;
    if (morphing) {
      if (morphK >= 1) morphing = false;
      else more = true;
    }

    const { g, w, h } = setupCanvas(cv, stage);
    g.clearRect(0, 0, w, h);
    const R = cfg.rows.length, C = cfg.cols.length;
    if (!R || !C) return;

    // 透视投影函数（右手坐标系：x=列方向，z=行方向，y=向上高度；自适应容器宽高与俯仰角，360° 全角度零裁切）
    const cyA = Math.cos(yaw), syA = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const spanX = Math.max(C, 3), spanZ = Math.max(R, 2);
    const pitchT = clamp((pitch - 0.30) / 0.94, 0, 1);
    const scale = Math.min(w / (spanX + spanZ + 4.4), h / lerp(5.85, 8.75, pitchT));
    const camDist = 19;
    const ox = w * 0.50, oy = h * lerp(0.60, 0.495, pitchT);

    const proj = (x, y, z) => {
      const rx = x * cyA - z * syA;
      const rz = x * syA + z * cyA;
      const ry = y * cp - rz * sp;
      const depth = y * sp + rz * cp;
      const persp = camDist / (camDist - depth * 0.42);
      return { x: ox + rx * scale * persp, y: oy - ry * scale * persp, d: depth };
    };

    const drawPoly = (pts, fill, stroke, lw = 0.8) => {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
    };

    // 1. 3D 磨砂透视底板 + 刻度网格
    const padG = 0.58;
    const xMin = -C / 2 - padG, xMax = C / 2 + padG, zMin = -R / 2 - padG, zMax = R / 2 + padG;
    const basePts = [proj(xMin, 0, zMin), proj(xMax, 0, zMin), proj(xMax, 0, zMax), proj(xMin, 0, zMax)];
    const baseThick = 0.14;
    const baseB = [proj(xMin, -baseThick, zMin), proj(xMax, -baseThick, zMin), proj(xMax, -baseThick, zMax), proj(xMin, -baseThick, zMax)];
    // 底板阴影
    g.save();
    g.shadowColor = T.dark ? "rgba(0,0,0,0.52)" : "rgba(15,23,42,0.12)";
    g.shadowBlur = 24; g.shadowOffsetY = 12;
    drawPoly(baseB, T.dark ? "rgba(32,33,38,0.9)" : "rgba(235,237,242,0.95)");
    g.restore();

    // 底板四侧面（严格外侧顺时针绕序，cross > 0 仅绘制朝向摄像机的真实实体前沿侧边）
    const baseSideC = T.dark ? "rgba(52,54,62,0.96)" : "rgba(222,226,234,0.96)";
    const baseSideD = T.dark ? "rgba(40,42,49,0.96)" : "rgba(208,213,223,0.96)";
    for (let i = 0; i < 4; i++) {
      const ni = (i + 1) % 4;
      const face = [basePts[ni], basePts[i], baseB[i], baseB[ni]];
      const cross = (face[1].x - face[0].x) * (face[2].y - face[0].y) - (face[1].y - face[0].y) * (face[2].x - face[0].x);
      if (cross > 0) drawPoly(face, i % 2 === 0 ? baseSideC : baseSideD, T.line, 0.7);
    }
    // 底板顶面
    drawPoly(basePts, T.dark ? "rgba(40,42,48,0.94)" : "rgba(248,249,252,0.96)", T.line, 1);

    // 底板内部网格线
    g.strokeStyle = rgba(parseColor(T.label), T.dark ? .08 : .06);
    g.lineWidth = 1;
    for (let c = 0; c <= C; c++) {
      const gx = c - C / 2;
      const p0 = proj(gx, 0.002, -R / 2), p1 = proj(gx, 0.002, R / 2);
      g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
    }
    for (let r = 0; r <= R; r++) {
      const gz = r - R / 2;
      const p0 = proj(-C / 2, 0.002, gz), p1 = proj(C / 2, 0.002, gz);
      g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
    }

    // 2. 3D 列/行坐标标签（严格锚定在朝向相机的两条前沿外沿 rz > 0，360° 任意角度永不被柱体遮挡）
    g.font = `500 ${11 * T.scale}px ${T.fam}`;
    g.fillStyle = T.label3; g.textAlign = "center"; g.textBaseline = "middle";
    const frontZ = cyA >= 0 ? zMax + 0.44 : zMin - 0.44;
    for (let c = 0; c < C; c++) {
      const p = proj(c - C / 2 + 0.5, -0.06, frontZ);
      g.fillText(cfg.cols[c], p.x, p.y);
    }
    const frontX = syA >= 0 ? xMax + 0.54 : xMin - 0.54;
    for (let r = 0; r < R; r++) {
      const p = proj(frontX, -0.06, r - R / 2 + 0.5);
      g.textAlign = p.x >= ox ? "left" : "right";
      g.fillText(cfg.rows[r], p.x, p.y);
    }

    // 3. 构建全部 3D 柱体并按中心深度排序（Painter's Algorithm，远离相机先画）
    const bars = [];
    const damp = reduced() ? 1 : 1 - Math.exp(-dt / 42);
    const maxH3D = 2.45;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const key = `${r}:${c}`;
        const gx = c - C / 2 + 0.5, gz = r - R / 2 + 0.5;
        const centerDepth = proj(gx, 0.5, gz).d;
        const delay = (r + c) * 44;
        const rawK = reduced() ? 1 : clamp((now - enterT0 - delay) / 620, 0, 1);
        const grow = rawK >= 1 ? 1 : clamp(EASE_BACK(rawK), 0, 1.05);
        if (rawK < 1) more = true;
        const tgtLift = hoverKey === key ? 1 : 0;
        const prevLift = liftMap.get(key) ?? 0;
        const lift = lerp(prevLift, tgtLift, damp);
        liftMap.set(key, lift);
        if (Math.abs(lift - tgtLift) > .01) more = true;
        bars.push({ r, c, key, gx, gz, v: vals[r][c], norm: norms[r]?.[c] ?? 0, grow, lift, depth: centerDepth });
      }
    }
    bars.sort((a, b) => a.depth - b.depth);

    hitList = [];
    const bw = 0.31; // 柱半宽（实际 0.62 格，留出清爽立体呼吸缝）
    const muteBg = parseColor(T.dark ? "#222328" : "#eef0f4");
    const mixRGB = (a, b, k) => ({ r: lerp(a.r, b.r, k), g: lerp(a.g, b.g, k), b: lerp(a.b, b.b, k), a: 1 });
    for (const b of bars) {
      const hVal = Math.max(0.06, b.norm * maxH3D * b.grow);
      const yBase = b.lift * 0.16; // 悬停时整根 3D 柱体优雅抬起悬浮！
      const yTop = yBase + hVal;
      const baseColor = T.pick(cfg.rowColors?.[b.r], b.r);
      const rawRgb = parseColor(baseColor);
      // 非焦点柱体用实心混淡（不透明）取代半透明透底，彻底消除透视重叠杂线，保持纯净哑光实体质感
      const fadeK = hoverKey ? lerp(T.dark ? 0.56 : 0.62, 0, b.lift) : 0;
      const rgb = fadeK > 0.005 ? mixRGB(rawRgb, muteBg, fadeK) : rawRgb;

      // 地面接触影 / 悬停光晕环
      const shW = bw * (1.06 + b.lift * 0.14);
      const shPts = [proj(b.gx - shW, 0.004, b.gz - shW), proj(b.gx + shW, 0.004, b.gz - shW), proj(b.gx + shW, 0.004, b.gz + shW), proj(b.gx - shW, 0.004, b.gz + shW)];
      drawPoly(shPts, b.lift > .05 ? rgba(rawRgb, .28 * b.lift) : (T.dark ? "rgba(0,0,0,0.34)" : "rgba(15,23,42,0.10)"));

      // 8 个顶点
      const b0 = proj(b.gx - bw, yBase, b.gz - bw), b1 = proj(b.gx + bw, yBase, b.gz - bw), b2 = proj(b.gx + bw, yBase, b.gz + bw), b3 = proj(b.gx - bw, yBase, b.gz + bw);
      const t0 = proj(b.gx - bw, yTop, b.gz - bw), t1 = proj(b.gx + bw, yTop, b.gz - bw), t2 = proj(b.gx + bw, yTop, b.gz + bw), t3 = proj(b.gx - bw, yTop, b.gz + bw);

      // 4 个实体外侧面（严格对外顺时针绕序，cross > 0 精准渲染朝向相机的两个实体外立面；按视图空间固定主光着色，360° 旋转始终明暗分明）
      const sides = [
        { pts: [t1, t0, b0, b1], nx: 0, nz: -1 }, // -Z
        { pts: [t2, t1, b1, b2], nx: 1, nz: 0 },  // +X
        { pts: [t3, t2, b2, b3], nx: 0, nz: 1 },  // +Z
        { pts: [t0, t3, b3, b0], nx: -1, nz: 0 }, // -X
      ];
      g.save();
      const polys = [];
      for (const s of sides) {
        const p = s.pts;
        const cross = (p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[1].y - p[0].y) * (p[2].x - p[0].x);
        if (cross > 0) {
          const vnx = s.nx * cyA - s.nz * syA;
          const vnz = s.nx * syA + s.nz * cyA;
          // 视图空间左上方前向主光，让两面实体立面始终一明一暗呈现饱满体积感
          const ndl = clamp(-vnx * 0.52 + vnz * 0.62, -1, 1);
          const shade = lerp(-0.28, -0.02, (ndl + 1) * 0.5);
          const cTop = shadeRGB(rgb, shade + 0.09 + b.lift * 0.12);
          const cBot = shadeRGB(rgb, shade - 0.13);
          const grad = g.createLinearGradient(p[0].x, p[0].y, p[3].x, p[3].y);
          grad.addColorStop(0, rgba(cTop, 1));
          grad.addColorStop(1, rgba(cBot, 1));
          drawPoly(p, grad, rgba(shadeRGB(rgb, -0.34), .30), 0.55);
          polys.push(p);
        }
      }

      // 顶面（最亮受光面 + 1px 清晰棱线高光）
      const topPts = [t0, t1, t2, t3];
      const topC = shadeRGB(rgb, (T.dark ? 0.24 : 0.20) + b.lift * 0.16);
      drawPoly(topPts, rgba(topC, 1), rgba(shadeRGB(rgb, 0.55), T.dark ? .44 : .60), 0.9);
      polys.push(topPts);
      g.restore();

      hitList.push({ b, polys, topC: proj(b.gx, yTop, b.gz), color: baseColor });
    }

    if (more) schedule();
  }

  const schedule = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };

  // 拖拽 360° 自由旋转（遵循物理转盘直觉：前景随手指同向跟转，停稳松手零误甩）+ 悬停精准多边形命中
  let px0 = 0, py0 = 0, lastMoveT = 0;
  cv.addEventListener("pointerdown", (e) => {
    if (!cfg.interactive || e.button !== 0) return;
    dragging = true; px0 = e.clientX; py0 = e.clientY; velY = 0; velP = 0; lastMoveT = performance.now();
    hoverKey = ""; tip.classList.remove("sn-ch-vis");
    root.classList.add("sn-ch-drag");
    toolsEl.querySelectorAll("[data-v3]").forEach((btn) => btn.classList.remove("sn-ch-on"));
    try { cv.setPointerCapture(e.pointerId); } catch {}
    schedule();
  });
  cv.addEventListener("pointermove", (e) => {
    const r = cv.getBoundingClientRect();
    if (dragging) {
      const now = performance.now();
      const dx = e.clientX - px0, dy = e.clientY - py0;
      px0 = e.clientX; py0 = e.clientY;
      // 前景点 rx = x*cos(yaw) - z*sin(yaw)，∂rx/∂yaw = -rz < 0：向右拖(dx>0)必须减小 yaw，前景才会严格随手向右转
      const stepY = -dx * 0.0085, stepP = dy * 0.0065;
      velY = now - lastMoveT > 50 ? stepY : lerp(velY, stepY, 0.65);
      velP = now - lastMoveT > 50 ? stepP : lerp(velP, stepP, 0.65);
      lastMoveT = now;
      yaw += stepY; targetYaw = yaw;
      pitch = clamp(pitch + stepP, 0.22, 1.24); targetPitch = pitch;
      tip.classList.remove("sn-ch-vis");
      schedule();
      return;
    }
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let found = null;
    for (let i = hitList.length - 1; i >= 0; i--) {
      if (hitList[i].polys.some((poly) => pointInPoly(mx, my, poly))) { found = hitList[i]; break; }
    }
    const nextKey = found ? found.b.key : "";
    if (nextKey !== hoverKey) {
      hoverKey = nextKey;
      if (found) {
        const { b, color, topC } = found;
        tip.innerHTML = `<div class="sn-ch-tip-hd">${esc(cfg.cols[b.c])} · ${esc(cfg.rows[b.r])}</div><div class="sn-ch-tip-rows"><div class="sn-ch-tip-row"><i class="sn-ch-tip-dot" style="background:${color}"></i><span class="sn-ch-tip-name">${esc(cfg.metricLabel || tt("charts.8"))}</span><span class="sn-ch-tip-val">${esc(fmtNum(b.v, cfg.unit))}</span></div></div>`;
        tip.classList.add("sn-ch-vis");
        positionTip(tip, stage, topC.x, topC.y);
      } else {
        tip.classList.remove("sn-ch-vis");
      }
      schedule();
    } else if (found) {
      positionTip(tip, stage, mx, my);
    }
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    // 松手前已停稳 > 60ms 则清零速度，绝不莫名甩飞
    if (performance.now() - lastMoveT > 60) { velY = 0; velP = 0; }
    root.classList.remove("sn-ch-drag");
    schedule();
  };
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);
  cv.addEventListener("pointerleave", () => { endDrag(); hoverKey = ""; tip.classList.remove("sn-ch-vis"); schedule(); });

  const ro = new ResizeObserver(() => schedule()); ro.observe(stage);
  const mo = new MutationObserver(() => { T = tr.read(); buildLegend(); schedule(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
  schedule();

  return {
    update(next) { cfg = { ...cfg, ...next }; syncVals(true); buildLegend(); schedule(); },
    setView(name) { const v = VIEWS_3D[name]; if (!v) return; targetYaw = nearestAngle(yaw, v.yaw); targetPitch = v.pitch; velY = 0; velP = 0; schedule(); },
    replay() { enterT0 = performance.now(); schedule(); },
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); tr.destroy(); },
  };
}

export const createChart3D = /* @__PURE__ */ defineComponent({
  name: "chart-3d",
  html: () => '<div class="sn-ch-host"></div>',
  mount(el, o) { return mountChart3D(el, o); },
});

// =========================================================================
// 5. 迷你趋势火花线（createSparkline）— 专为 KPI 指标卡打造
// =========================================================================
function mountSparkline(root, opts = {}) {
  let cfg = { values: [], color: "accent", height: 34, ...opts };
  root.classList.add("sn-ch-spark");
  root.style.setProperty("--sn-ch-h", typeof cfg.height === "number" ? cfg.height + "px" : cfg.height);
  root.innerHTML = `<canvas class="sn-ch-cv"></canvas>`;
  const cv = root.querySelector(".sn-ch-cv");
  const tr = createThemeReader(root);
  let T = tr.read(), raf = 0, dead = false, t0 = performance.now();

  function draw(now = performance.now()) {
    raf = 0; if (dead) return;
    const p = reduced() ? 1 : EASE_STRONG(clamp((now - t0) / 600, 0, 1));
    const { g, w, h } = setupCanvas(cv, root);
    g.clearRect(0, 0, w, h);
    const vals = (cfg.values || []).map((v) => +v || 0);
    if (vals.length < 2) return;
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const pts = vals.map((v, i) => ({ x: 4 + (i / (vals.length - 1)) * (w - 10), y: h - 5 - ((v - min) / span) * (h - 10) }));
    const color = T.pick(cfg.color, 0), rgb = parseColor(color);
    g.save();
    g.beginPath(); g.rect(0, 0, w * p + 6, h); g.clip();
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, rgba(rgb, T.dark ? .26 : .18));
    grad.addColorStop(1, rgba(rgb, 0));
    g.beginPath(); traceSmoothPath(g, pts);
    g.lineTo(pts.at(-1).x, h); g.lineTo(pts[0].x, h); g.closePath();
    g.fillStyle = grad; g.fill();
    g.beginPath(); traceSmoothPath(g, pts);
    g.strokeStyle = color; g.lineWidth = 1.8; g.lineCap = "round"; g.lineJoin = "round"; g.stroke();
    g.restore();
    if (p >= .95) {
      const last = pts.at(-1);
      g.beginPath(); g.arc(last.x, last.y, 4.5, 0, Math.PI * 2); g.fillStyle = rgba(rgb, .22); g.fill();
      g.beginPath(); g.arc(last.x, last.y, 2.4, 0, Math.PI * 2); g.fillStyle = color; g.fill();
    }
    if (p < 1) schedule();
  }
  const schedule = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };
  const ro = new ResizeObserver(() => schedule()); ro.observe(root);
  const mo = new MutationObserver(() => { T = tr.read(); schedule(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
  schedule();
  return {
    update(next) { cfg = { ...cfg, ...next }; t0 = performance.now(); schedule(); },
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); tr.destroy(); },
  };
}

export const createSparkline = /* @__PURE__ */ defineComponent({
  name: "sparkline",
  html: () => '<div class="sn-ch-host"></div>',
  mount(el, o) { return mountSparkline(el, o); },
});

// =========================================================================
// 6. 3D 立体质感图标（icon3DHTML / bindIcons3D / createIcon3D）
// =========================================================================
export function icon3DHTML({ name = "layers", tone = "obsidian", size = "md", label = "" } = {}) {
  const aria = label ? ` aria-label="${esc(label)}" title="${esc(label)}"` : ' aria-hidden="true"';
  return `<span class="sn-ico3d" data-tone="${esc(tone)}" data-size="${esc(size)}" tabindex="0"${aria}><i class="sn-ico3d-shadow"></i><span class="sn-ico3d-body"><i class="sn-ico3d-glare"></i><span class="sn-ico3d-glyph">${icon(name, 28)}</span></span></span>`;
}

export function bindIcons3D(scope = document) {
  const els = scope.matches?.(".sn-ico3d") ? [scope] : [...scope.querySelectorAll(".sn-ico3d")];
  const cleanups = [];
  for (const el of els) {
    if (el._i3d) continue;
    el._i3d = true;
    let rx = 0, ry = 0, tx = 0, ty = 0, gx = 50, gy = 20, ga = 0;
    let trx = 0, try_ = 0, ttx = 0, tty = 0, tgx = 50, tgy = 20, tga = 0;
    let raf = 0, dead = false;
    const step = () => {
      raf = 0; if (dead) return;
      const k = reduced() ? 1 : 0.18;
      rx = lerp(rx, trx, k); ry = lerp(ry, try_, k);
      tx = lerp(tx, ttx, k); ty = lerp(ty, tty, k);
      gx = lerp(gx, tgx, k); gy = lerp(gy, tgy, k); ga = lerp(ga, tga, k);
      el.style.setProperty("--sn-i3-rx", rx.toFixed(2) + "deg");
      el.style.setProperty("--sn-i3-ry", ry.toFixed(2) + "deg");
      el.style.setProperty("--sn-i3-tx", tx.toFixed(2) + "px");
      el.style.setProperty("--sn-i3-ty", ty.toFixed(2) + "px");
      el.style.setProperty("--sn-i3-gx", gx.toFixed(1) + "%");
      el.style.setProperty("--sn-i3-gy", gy.toFixed(1) + "%");
      el.style.setProperty("--sn-i3-ga", ga.toFixed(3));
      if (Math.abs(rx - trx) > .05 || Math.abs(ry - try_) > .05 || Math.abs(ga - tga) > .01) raf = requestAnimationFrame(step);
    };
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(step); };
    const onMove = (e) => {
      if (reduced()) return;
      const r = el.getBoundingClientRect();
      const nx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      const ny = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      el.classList.add("sn-i3-hot");
      trx = -ny * 16; try_ = nx * 18;
      ttx = nx * 5.5; tty = ny * 5.5;
      tgx = (nx * 0.5 + 0.5) * 100; tgy = (ny * 0.5 + 0.5) * 100; tga = 1;
      kick();
    };
    const onLeave = () => {
      el.classList.remove("sn-i3-hot");
      trx = 0; try_ = 0; ttx = 0; tty = 0; tgx = 50; tgy = 20; tga = 0;
      kick();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    cleanups.push(() => { dead = true; cancelAnimationFrame(raf); el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave); delete el._i3d; });
  }
  return () => { for (const fn of cleanups) fn(); };
}

export const createIcon3D = /* @__PURE__ */ defineComponent({
  name: "icon-3d",
  html: (o) => icon3DHTML(o),
  mount(el) { const off = bindIcons3D(el); return { destroy: off }; },
});
