// Satin：设计感轮播图（Carousel）+ 体积感追光绑定（bindVolumetric）
// · 四种视觉范式：arc（3D 弧形透视）、focus（体积焦点磨砂）、peek（沉浸画廊窥视）、deck（立体叠牌）
// · 指针拖拽实时 60fps 连续形变、速度惯性吸附、键盘左右切换、无限循环、自动播进度条、触摸方向锁（横滑不抢竖屏页面滚动）
// · 导入零副作用（SSR 安全），严格只动 transform / opacity / filter
import { reduced } from "./core.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function renderSlideContent(it, variant) {
  if (it.html) return it.html;
  const parts = [];
  if (it.vol) {
    parts.push(`<div class="sn-vol" data-vol="${esc(it.vol)}"></div>`);
  }
  if (it.image) {
    parts.push(`<img class="sn-cr-media" src="${esc(it.image)}" alt="${esc(it.alt || it.title || "")}" loading="lazy" decoding="async" draggable="false">`);
  }
  parts.push('<i class="sn-cr-rim" aria-hidden="true"></i>');
  if (it.badge || it.tag) {
    parts.push(`<div class="sn-cr-top">${it.badge ? `<span class="sn-cr-badge${it.lightBadge ? " sn-cr-badge-light" : ""}">${esc(it.badge)}</span>` : "<span></span>"}${it.tag ? `<span class="sn-cr-badge${it.lightBadge ? " sn-cr-badge-light" : ""}">${esc(it.tag)}</span>` : ""}</div>`);
  }
  if (variant === "focus" && !it.image) {
    parts.push(`<div class="sn-cr-focus-center">${it.title ? `<b>${esc(it.title)}</b>` : ""}${it.sub ? `<span>${esc(it.sub)}</span>` : ""}</div>`);
  } else if (it.float || variant === "peek") {
    const pills = Array.isArray(it.meta) && it.meta.length
      ? `<div class="sn-cr-pills">${it.meta.map((m) => (typeof m === "object" ? `<span class="sn-cr-pill">${m.icon ? icon(m.icon, 12) : ""}${esc(m.text)}</span>` : `<span class="sn-cr-pill">${esc(m)}</span>`)).join("")}</div>`
      : "";
    if (it.title || it.sub || pills) {
      parts.push(`<div class="sn-cr-float"><div class="sn-cr-float-hd"><b>${esc(it.title || "")}</b>${it.price ? `<span class="sn-cr-float-price">${esc(it.price)}</span>` : ""}</div>${it.sub ? `<span>${esc(it.sub)}</span>` : ""}${pills}</div>`);
    }
  } else if (it.title || it.sub) {
    parts.push(`<div class="sn-cr-cap">${it.title ? `<b>${esc(it.title)}</b>` : ""}${it.sub ? `<span>${esc(it.sub)}</span>` : ""}</div>`);
  }
  return parts.join("");
}

export function carouselHTML({
  items = [],
  variant = "arc",
  index = 0,
  arrows = true,
  dots = "pill",
  height,
  cardWidth,
  label = "轮播展示",
} = {}) {
  const n = items.length;
  const cur = n ? ((index % n) + n) % n : 0;
  const st = [height ? `--sn-cr-h:${typeof height === "number" ? height + "px" : height}` : "", cardWidth ? `--sn-cr-card-w:${typeof cardWidth === "number" ? cardWidth + "px" : cardWidth}` : ""].filter(Boolean).join(";");
  const slides = items.map((it, i) => `<div class="sn-cr-slide${i === cur ? " sn-cr-cur" : ""}" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${n}" data-cr-i="${i}">${renderSlideContent(it, variant)}</div>`).join("");
  const nav = arrows && n > 1
    ? `<button type="button" class="sn-cr-nav sn-cr-prev sn-tap" data-cr-prev aria-label="上一张">${icon("chevron-left", 16)}</button>`
      + `<button type="button" class="sn-cr-nav sn-cr-next sn-tap" data-cr-next aria-label="下一张">${icon("chevron-right", 16)}</button>`
    : "";
  const dotCls = dots === "bars" ? "sn-cr-dots sn-cr-dots-bars" : "sn-cr-dots";
  const dotsHtml = dots && n > 1
    ? `<div class="${dotCls}" role="tablist" aria-label="切换卡片">${items.map((it, i) => `<button type="button" class="sn-cr-dot${i === cur ? " sn-on" : ""}" role="tab" aria-selected="${i === cur}" aria-label="${esc(it.title || `第 ${i + 1} 张`)}" data-cr-dot="${i}"><i></i></button>`).join("")}</div>`
    : "";
  return `<div class="sn-cr" data-variant="${esc(variant)}" role="region" aria-roledescription="carousel" aria-label="${esc(label)}" tabindex="0"${st ? ` style="${st}"` : ""}>`
    + `<div class="sn-cr-vp"><div class="sn-cr-track">${slides}</div>${nav}</div>${dotsHtml}</div>`;
}

// 环形最短有符号距离：用于 loop 模式下保证两侧卡片对称自然衔接
function relOffset(i, cur, n, loop) {
  let d = i - cur;
  if (loop && n > 2) {
    const half = n / 2;
    if (d > half) d -= n;
    else if (d < -half) d += n;
  }
  return d;
}

export function mountCarousel(root, opts = {}, emit) {
  if (root._carousel) return root._carousel;
  let cfg = {
    variant: root.dataset.variant || "arc",
    index: 0,
    loop: true,
    autoplay: 0,
    ...opts,
  };
  const vp = root.querySelector(".sn-cr-vp");
  const prevBtn = root.querySelector("[data-cr-prev]");
  const nextBtn = root.querySelector("[data-cr-next]");
  let slides = [...root.querySelectorAll(".sn-cr-slide")];
  let dots = [...root.querySelectorAll("[data-cr-dot]")];
  const count = () => slides.length;
  let cur = count() ? ((cfg.index % count()) + count()) % count() : 0;
  let dragPx = 0, dragging = false, pointerId = null, startX = 0, startY = 0, lastX = 0, lastT = 0, velX = 0, locked = 0;
  let autoRaf = 0, autoStart = 0, paused = false, alive = true;

  const cardWidth = () => {
    const s = slides[0];
    return (s && s.offsetWidth) || parseFloat(getComputedStyle(root).getPropertyValue("--sn-cr-card-w")) || 240;
  };

  function layout(instant = false) {
    const n = count();
    if (!n || !vp) return;
    if (instant) vp.classList.add("sn-cr-instant");
    const cw = cardWidth();
    const vw = vp.clientWidth || cw * 2;
    const v = cfg.variant;
    const frac = dragPx / Math.max(120, cw);
    const activeFloat = cur - frac;

    for (let i = 0; i < n; i++) {
      const el = slides[i];
      const d = relOffset(i, activeFloat, n, cfg.loop && v !== "peek");
      const ad = Math.abs(d);
      const isCur = i === cur;
      el.classList.toggle("sn-cr-cur", isCur);
      el.setAttribute("aria-hidden", String(ad > 1.65));

      if (v === "arc") {
        // 3D 弧形透视：中心正对，左右沿弧线轻柔下沉、旋转与缩小
        const stride = Math.min(cw * 0.86, vw * 0.44);
        const tx = d * stride;
        const ty = Math.min(44, ad * ad * 16);
        const rz = d * 6.5;
        const ry = d * -15;
        const sc = Math.max(0.76, 1 - ad * 0.14);
        const op = ad > 2.2 ? 0 : Math.max(0.18, 1 - ad * 0.44);
        el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, ${(-ad * 46).toFixed(1)}px) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
        el.style.opacity = op.toFixed(3);
        el.style.filter = ad > 0.35 ? `saturate(${Math.max(0.65, 1 - ad * 0.2).toFixed(2)})` : "none";
        el.style.zIndex = String(10 - Math.round(ad * 3));
        el.style.pointerEvents = ad > 1.7 ? "none" : "auto";
      } else if (v === "focus") {
        // 焦点景深磨砂轮播：中心主卡聚焦，两侧略缩 + 轻微柔焦退后
        const stride = Math.min(cw * 0.94, vw * 0.62);
        const tx = d * stride;
        const sc = Math.max(0.82, 1 - ad * 0.12);
        const op = ad > 2.1 ? 0 : Math.max(0.32, 1 - ad * 0.46);
        const blur = Math.min(2.2, Math.max(0, (ad - 0.18) * 1.8));
        el.style.transform = `translate3d(${tx.toFixed(1)}px, 0, ${(-ad * 60).toFixed(1)}px) scale(${sc.toFixed(3)})`;
        el.style.opacity = op.toFixed(3);
        el.style.filter = blur > 0.08 ? `blur(${blur.toFixed(2)}px) brightness(${Math.max(0.68, 1 - ad * 0.24).toFixed(2)})` : "none";
        el.style.zIndex = String(10 - Math.round(ad * 3));
        el.style.pointerEvents = ad > 1.7 ? "none" : "auto";
      } else if (v === "peek") {
        // 探索画廊：左起对齐，右侧自然露出一截下一张，拖动平滑跟随
        const gap = 14;
        const padL = 16;
        const maxShift = Math.max(0, (n - 1) * (cw + gap) - Math.max(0, vw - cw - padL * 2));
        const baseShift = Math.max(0, Math.min(maxShift, activeFloat * (cw + gap)));
        const tx = padL + i * (cw + gap) - baseShift;
        const sc = 1 - Math.min(0.03, ad * 0.015);
        el.style.transform = `translate3d(${tx.toFixed(1)}px, 0, 0) scale(${sc.toFixed(3)})`;
        el.style.opacity = "1";
        el.style.filter = "none";
        el.style.zIndex = String(isCur ? 4 : 2);
        el.style.pointerEvents = "auto";
      } else {
        // deck：立体物理叠牌（0 在最前，1/2/3 依次后退右移微旋，拖动顶牌跟手飞出）
        let order = (i - cur + n) % n;
        const prog = Math.max(-1, Math.min(1, dragPx / Math.max(120, cw)));
        if (order === 0) {
          const tx = dragPx;
          const ty = Math.abs(prog) * -8;
          const rz = prog * 11;
          el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) rotateZ(${rz.toFixed(1)}deg) scale(1)`;
          el.style.opacity = String(Math.max(0.45, 1 - Math.abs(prog) * 0.45).toFixed(3));
          el.style.filter = "none";
          el.style.zIndex = "12";
          el.style.pointerEvents = "auto";
        } else {
          const lift = Math.min(1, Math.abs(prog));
          const eff = Math.max(0, order - lift);
          const vis = eff <= 3;
          const tx = eff * 14;
          const ty = eff * 7;
          const rz = eff * 2.4;
          const sc = Math.max(0.84, 1 - eff * 0.055);
          const op = vis ? Math.max(0, 1 - eff * 0.24) : 0;
          el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, ${(-eff * 30).toFixed(1)}px) rotateZ(${rz.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
          el.style.opacity = op.toFixed(3);
          el.style.filter = "none";
          el.style.zIndex = String(10 - order);
          el.style.pointerEvents = order === 1 ? "auto" : "none";
        }
      }
    }

    if (prevBtn) prevBtn.disabled = !cfg.loop && cur === 0;
    if (nextBtn) nextBtn.disabled = !cfg.loop && cur === n - 1;
    dots.forEach((d, i) => {
      const on = i === cur;
      d.classList.toggle("sn-on", on);
      d.setAttribute("aria-selected", String(on));
      if (!on) d.style.removeProperty("--sn-cr-prog");
    });

    if (instant) {
      vp.offsetWidth;
      vp.classList.remove("sn-cr-instant");
    }
  }

  function go(nextIdx, { silent = false, instant = false } = {}) {
    const n = count();
    if (!n) return;
    const prev = cur;
    if (cfg.loop && cfg.variant !== "peek") cur = ((nextIdx % n) + n) % n;
    else cur = Math.max(0, Math.min(n - 1, nextIdx));
    dragPx = 0;
    layout(instant || reduced());
    resetAutoplay();
    if (!silent && cur !== prev) {
      cfg.onChange?.(cur, slides[cur]);
      emit?.("change", cur);
      root.dispatchEvent(new CustomEvent("sn-change", { detail: cur, bubbles: true }));
    }
  }

  const next = () => go(cur + 1);
  const prev = () => go(cur - 1);

  // 自动播放（激活胶囊内平滑填充进度条）
  function tickAuto(now) {
    autoRaf = 0;
    if (!alive || !cfg.autoplay || paused || dragging || reduced() || count() <= 1) return;
    if (!autoStart) autoStart = now;
    const elapsed = now - autoStart;
    const p = Math.min(1, elapsed / cfg.autoplay);
    const activeDot = dots[cur];
    if (activeDot) activeDot.style.setProperty("--sn-cr-prog", p.toFixed(3));
    if (elapsed >= cfg.autoplay) {
      autoStart = now;
      go((cur + 1) % count());
      return;
    }
    autoRaf = requestAnimationFrame(tickAuto);
  }
  function resetAutoplay() {
    cancelAnimationFrame(autoRaf);
    autoRaf = 0;
    autoStart = 0;
    const activeDot = dots[cur];
    if (activeDot) activeDot.style.setProperty("--sn-cr-prog", cfg.autoplay && !reduced() ? "0" : "1");
    if (alive && cfg.autoplay > 0 && !paused && !dragging && !reduced() && count() > 1) {
      autoRaf = requestAnimationFrame(tickAuto);
    }
  }

  // 指针拖拽（支持鼠标 & 触控；带水平手势锁，垂直滑动还给页面滚动）
  const onDown = (e) => {
    if (e.button && e.button !== 0) return;
    if (e.target.closest("button, a, input")) return;
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    startY = e.clientY;
    lastT = performance.now();
    velX = 0;
    locked = 0;
    dragPx = 0;
  };
  const onMove = (e) => {
    if (pointerId == null || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!locked) {
      if (Math.hypot(dx, dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.15) {
        pointerId = null;
        return;
      }
      locked = 1;
      dragging = true;
      vp.classList.add("sn-cr-drag");
      try { vp.setPointerCapture(pointerId); } catch {}
      cancelAnimationFrame(autoRaf);
    }
    const now = performance.now();
    const dt = Math.max(4, now - lastT);
    velX = (e.clientX - lastX) / dt;
    lastX = e.clientX;
    lastT = now;
    // 边界橡皮筋阻尼（非循环模式）
    let adj = dx;
    const isLoop = cfg.loop && cfg.variant !== "peek";
    if (!isLoop && ((cur === 0 && dx > 0) || (cur === count() - 1 && dx < 0))) {
      adj = dx * 0.34;
    }
    dragPx = adj;
    layout(false);
  };
  const onUp = (e) => {
    if (pointerId == null || e.pointerId !== pointerId) return;
    const wasDrag = dragging;
    pointerId = null;
    dragging = false;
    vp.classList.remove("sn-cr-drag");
    if (!wasDrag) return;
    const cw = cardWidth();
    const thresh = Math.min(64, cw * 0.22);
    let step = 0;
    if (cfg.variant === "deck") {
      if (Math.abs(dragPx) > thresh || Math.abs(velX) > 0.38) step = 1;
    } else {
      if (dragPx < -thresh || velX < -0.35) step = 1;
      else if (dragPx > thresh || velX > 0.35) step = -1;
    }
    dragPx = 0;
    if (step) go(cur + step);
    else {
      layout(false);
      resetAutoplay();
    }
  };

  // 点击侧边卡片直接切换到该张
  const onTrackClick = (e) => {
    if (Math.abs(lastX - startX) > 8 && locked) return;
    const slide = e.target.closest(".sn-cr-slide");
    if (!slide) return;
    const idx = Number(slide.dataset.crI);
    if (Number.isFinite(idx) && idx !== cur) {
      if (cfg.variant === "deck") next();
      else go(idx);
    }
  };

  const onKey = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
  };
  const onEnter = () => { paused = true; cancelAnimationFrame(autoRaf); };
  const onLeave = () => { paused = false; resetAutoplay(); };

  vp.addEventListener("pointerdown", onDown);
  vp.addEventListener("pointermove", onMove);
  vp.addEventListener("pointerup", onUp);
  vp.addEventListener("pointercancel", onUp);
  vp.addEventListener("click", onTrackClick);
  root.addEventListener("keydown", onKey);
  root.addEventListener("pointerenter", onEnter);
  root.addEventListener("pointerleave", onLeave);
  prevBtn?.addEventListener("click", prev);
  nextBtn?.addEventListener("click", next);
  dots.forEach((d) => d.addEventListener("click", () => go(Number(d.dataset.crDot))));

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => layout(true)) : null;
  ro?.observe(vp);
  layout(true);
  resetAutoplay();

  const api = {
    get index() { return cur; },
    get variant() { return cfg.variant; },
    go,
    next,
    prev,
    setVariant(v) {
      cfg.variant = v;
      root.dataset.variant = v;
      layout(true);
    },
    update(nextOpts = {}) {
      cfg = { ...cfg, ...nextOpts };
      if (nextOpts.variant) root.dataset.variant = nextOpts.variant;
      if (typeof nextOpts.index === "number") cur = count() ? ((nextOpts.index % count()) + count()) % count() : 0;
      slides = [...root.querySelectorAll(".sn-cr-slide")];
      dots = [...root.querySelectorAll("[data-cr-dot]")];
      layout(true);
      resetAutoplay();
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(autoRaf);
      ro?.disconnect();
      vp.removeEventListener("pointerdown", onDown);
      vp.removeEventListener("pointermove", onMove);
      vp.removeEventListener("pointerup", onUp);
      vp.removeEventListener("pointercancel", onUp);
      vp.removeEventListener("click", onTrackClick);
      root.removeEventListener("keydown", onKey);
      root.removeEventListener("pointerenter", onEnter);
      root.removeEventListener("pointerleave", onLeave);
      delete root._carousel;
    },
  };
  return (root._carousel = api);
}

// ———— 体积感卡片 3D 指针追光交互（data-vol-tilt） ————
export function bindVolumetric(scope = typeof document !== "undefined" ? document : null) {
  if (!scope) return () => {};
  const cleanups = [];
  const targets = [...(scope.matches?.("[data-vol-tilt]") ? [scope] : []), ...scope.querySelectorAll("[data-vol-tilt]")];
  for (const el of targets) {
    if (el._volTilt) continue;
    el._volTilt = true;
    const maxDeg = Number(el.dataset.volTilt) || 5.5;
    let raf = 0, mx = 0.5, my = 0.3, hot = 0;
    const apply = () => {
      raf = 0;
      if (reduced()) return;
      el.style.setProperty("--sn-vx", (mx * 100).toFixed(1) + "%");
      el.style.setProperty("--sn-vy", (my * 100).toFixed(1) + "%");
      el.style.setProperty("--sn-vt", String(hot));
      el.style.setProperty("--sn-vrx", (hot ? (0.5 - my) * maxDeg * 2 : 0).toFixed(2) + "deg");
      el.style.setProperty("--sn-vry", (hot ? (mx - 0.5) * maxDeg * 2 : 0).toFixed(2) + "deg");
    };
    const onMove = (e) => {
      if (reduced()) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      mx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      my = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      hot = 1;
      el.classList.add("sn-vol-tilting");
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      hot = 0;
      mx = 0.5;
      my = 0.3;
      el.classList.remove("sn-vol-tilting");
      if (!raf) raf = requestAnimationFrame(apply);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    cleanups.push(() => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      delete el._volTilt;
    });
  }
  return () => { for (const fn of cleanups) fn(); };
}
