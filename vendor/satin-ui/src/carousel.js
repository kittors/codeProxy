// Satin：设计感轮播图（Carousel）+ 体积感追光绑定（bindVolumetric）
// · 四种视觉范式：arc（3D 弧形透视）、focus（体积焦点磨砂）、peek（沉浸画廊窥视）、deck（立体叠牌）
// · 60fps 二阶阻尼弹簧物理引擎（速度继承、双曲橡胶边界回弹、半空随时无缝打断再抓、捕获层防误触点击、触控板双指横划）
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
    ? `<button type="button" class="sn-btn sn-ibtn sn-round sn-cr-nav sn-cr-prev" data-cr-prev aria-label="上一张">${icon("chevron-left", 17)}</button>`
      + `<button type="button" class="sn-btn sn-ibtn sn-round sn-cr-nav sn-cr-next" data-cr-next aria-label="下一张">${icon("chevron-right", 17)}</button>`
    : "";
  const dotCls = dots === "bars" ? "sn-cr-dots sn-cr-dots-bars" : "sn-cr-dots";
  const dotsHtml = dots && n > 1
    ? `<div class="${dotCls}" role="tablist" aria-label="切换卡片">${items.map((it, i) => `<button type="button" class="sn-cr-dot${i === cur ? " sn-on" : ""}" role="tab" aria-selected="${i === cur}" aria-label="${esc(it.title || `第 ${i + 1} 张`)}" data-cr-dot="${i}"><i></i></button>`).join("")}</div>`
    : "";
  return `<div class="sn-cr" data-variant="${esc(variant)}" role="region" aria-roledescription="carousel" aria-label="${esc(label)}" tabindex="0"${st ? ` style="${st}"` : ""}>`
    + `<div class="sn-cr-vp"><div class="sn-cr-clip"><div class="sn-cr-track">${slides}</div></div>${nav}</div>${dotsHtml}</div>`;
}

// 环形最短有符号距离：保证 loop 模式下左右两侧无缝对称衔接
function relOffset(i, pos, n, loop) {
  let d = i - pos;
  if (loop && n > 2) {
    d = ((d % n) + n) % n;
    if (d > n / 2) d -= n;
  }
  return d;
}

// 苹果双曲橡胶阻尼：拉过边界柔软回拉，绝不硬撞死停
function rubberBand(over, limit = 0.52) {
  return (over * limit) / (limit + Math.abs(over));
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
  const isLoop = () => cfg.loop && cfg.variant !== "peek" && count() > 2;
  const wrapIdx = (i) => {
    const n = count();
    if (!n) return 0;
    return isLoop() ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
  };

  let cur = count() ? ((cfg.index % count()) + count()) % count() : 0;
  // 统一连续物理状态（pos/target 单位：张；vel 单位：张/秒）
  let pos = cur;
  let target = cur;
  let vel = 0;
  // deck 叠牌专属 2D 物理状态（像素单位 + 速度 px/s）
  let dkX = 0, dkY = 0, dkVx = 0, dkVy = 0, dkTx = 0, dkTy = 0, dkFly = 0, dkSign = 1;
  let physRaf = 0, physLast = 0;
  let autoRaf = 0, autoStart = 0, paused = false, alive = true;
  let dragging = false, pointerId = null, startX = 0, startY = 0, startPos = 0, locked = 0, suppressUntil = 0;
  const samples = [];
  let wheelAcc = 0, wheelTimer = 0;

  const cardWidth = () => {
    const s = slides[0];
    return (s && s.offsetWidth) || parseFloat(getComputedStyle(root).getPropertyValue("--sn-cr-card-w")) || 240;
  };
  const stepWidth = () => {
    const cw = cardWidth();
    const vw = (vp && vp.clientWidth) || cw * 2;
    if (cfg.variant === "arc") return Math.min(cw * 0.88, vw * 0.48);
    if (cfg.variant === "focus") return Math.min(cw * 0.94, vw * 0.62);
    if (cfg.variant === "peek") return cw + 14;
    return cw;
  };

  function syncChrome() {
    const n = count();
    const activeIdx = wrapIdx(Math.round(target));
    if (prevBtn) prevBtn.disabled = !isLoop() && activeIdx === 0;
    if (nextBtn) nextBtn.disabled = !isLoop() && activeIdx === n - 1;
    dots.forEach((d, i) => {
      const on = i === activeIdx;
      d.classList.toggle("sn-on", on);
      d.setAttribute("aria-selected", String(on));
      if (!on) d.style.removeProperty("--sn-cr-prog");
    });
  }

  function renderFrame() {
    const n = count();
    if (!n || !vp) return;
    const cw = cardWidth();
    const vw = vp.clientWidth || cw * 2;
    const v = cfg.variant;
    const loopOn = isLoop();
    const visualCur = wrapIdx(Math.round(pos));

    for (let i = 0; i < n; i++) {
      const el = slides[i];
      if (v === "deck") {
        const order = (i - cur + n) % n;
        const flyProg = Math.min(1, Math.hypot(dkX, dkY * 0.5) / Math.max(130, cw * 0.85));
        const isTop = order === 0;
        el.classList.toggle("sn-cr-cur", isTop);
        el.setAttribute("aria-hidden", String(order > 3));
        if (isTop) {
          const rz = (dkX / Math.max(160, cw)) * 12 * dkSign;
          const sc = 1 - Math.min(0.04, flyProg * 0.03);
          const op = dkFly ? Math.max(0, 1 - flyProg * 0.85) : Math.max(0.55, 1 - flyProg * 0.25);
          el.style.transform = `translate3d(${dkX.toFixed(1)}px, ${dkY.toFixed(1)}px, 0) rotateZ(${rz.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
          el.style.opacity = op.toFixed(3);
          el.style.filter = "none";
          el.style.zIndex = "14";
          el.style.pointerEvents = dkFly ? "none" : "auto";
        } else {
          const eff = Math.max(0, order - flyProg);
          const vis = eff <= 3.1;
          const tx = eff * 14;
          const ty = eff * 7;
          const rz = eff * 2.3;
          const sc = Math.max(0.84, 1 - eff * 0.055);
          const op = vis ? Math.max(0, 1 - eff * 0.24) : 0;
          el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, ${(-eff * 30).toFixed(1)}px) rotateZ(${rz.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
          el.style.opacity = op.toFixed(3);
          el.style.filter = "none";
          el.style.zIndex = String(12 - order);
          el.style.pointerEvents = order === 1 ? "auto" : "none";
        }
        continue;
      }

      const d = relOffset(i, pos, n, loopOn);
      const ad = Math.abs(d);
      const isCur = i === visualCur;
      el.classList.toggle("sn-cr-cur", isCur);
      el.setAttribute("aria-hidden", String(ad > 1.7));

      if (v === "arc") {
        // 3D 弧形透视：严格沿平滑圆弧下沉、旋转与缩放，零直线跳变
        const stride = Math.min(cw * 0.88, vw * 0.45);
        const tx = d * stride;
        const ty = Math.min(40, ad * ad * 14.5);
        const rz = d * 6.4;
        const ry = d * -14;
        const sc = Math.max(0.78, 1 - ad * 0.13);
        const op = ad > 2.25 ? 0 : Math.max(0.22, 1 - ad * 0.40);
        el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, ${(-ad * 44).toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
        el.style.opacity = op.toFixed(3);
        el.style.filter = ad > 0.32 ? `saturate(${Math.max(0.68, 1 - ad * 0.18).toFixed(2)})` : "none";
        el.style.zIndex = String(12 - Math.round(ad * 3));
        el.style.pointerEvents = ad > 1.75 ? "none" : "auto";
      } else if (v === "focus") {
        const stride = Math.min(cw * 0.94, vw * 0.62);
        const tx = d * stride;
        const sc = Math.max(0.82, 1 - ad * 0.12);
        const op = ad > 2.15 ? 0 : Math.max(0.32, 1 - ad * 0.46);
        const blur = Math.min(2.2, Math.max(0, (ad - 0.18) * 1.8));
        el.style.transform = `translate3d(${tx.toFixed(1)}px, 0, ${(-ad * 60).toFixed(1)}px) scale(${sc.toFixed(3)})`;
        el.style.opacity = op.toFixed(3);
        el.style.filter = blur > 0.08 ? `blur(${blur.toFixed(2)}px) brightness(${Math.max(0.68, 1 - ad * 0.24).toFixed(2)})` : "none";
        el.style.zIndex = String(12 - Math.round(ad * 3));
        el.style.pointerEvents = ad > 1.75 ? "none" : "auto";
      } else {
        // peek 沉浸探索画廊：支持柔和越界橡皮筋回弹，无硬撞墙
        const gap = 14;
        const padL = 16;
        const stride = cw + gap;
        const maxShift = Math.max(0, (n - 1) * stride - Math.max(0, vw - cw - padL * 2));
        const rawShift = pos * stride;
        let shift = rawShift;
        if (rawShift < 0) shift = -rubberBand(-rawShift, cw * 0.45);
        else if (rawShift > maxShift) shift = maxShift + rubberBand(rawShift - maxShift, cw * 0.45);
        const tx = padL + i * stride - shift;
        const sc = 1 - Math.min(0.025, ad * 0.012);
        el.style.transform = `translate3d(${tx.toFixed(1)}px, 0, 0) scale(${sc.toFixed(3)})`;
        el.style.opacity = "1";
        el.style.filter = "none";
        el.style.zIndex = String(isCur ? 4 : 2);
        el.style.pointerEvents = "auto";
      }
    }
  }

  // 60fps 二阶阻尼弹簧物理循环（半隐式欧拉 + 固定上限步长防止掉帧发散）
  function startPhysics() {
    if (physRaf || !alive) return;
    physLast = performance.now();
    physRaf = requestAnimationFrame(stepPhysics);
  }
  function stopPhysics() {
    if (physRaf) { cancelAnimationFrame(physRaf); physRaf = 0; }
  }
  function stepPhysics(now) {
    physRaf = 0;
    if (!alive || dragging) return;
    const dt = Math.min(0.032, Math.max(0.004, (now - physLast) / 1000));
    physLast = now;

    if (cfg.variant === "deck") {
      if (dkFly) {
        // 顶牌顺惯性继续滑出直到离场完成，再无缝翻到底部
        dkX += dkVx * dt;
        dkY += dkVy * dt;
        dkVx *= Math.pow(0.88, dt * 60);
        dkVy += 420 * dt;
        const cw = cardWidth();
        if (Math.abs(dkX) > cw * 1.15 || Math.hypot(dkX, dkY) > cw * 1.3) {
          dkFly = 0; dkX = 0; dkY = 0; dkVx = 0; dkVy = 0; dkTx = 0; dkTy = 0;
          const prev = cur;
          cur = (cur + 1) % count();
          pos = target = cur;
          syncChrome();
          renderFrame();
          notifyChange(prev);
          resetAutoplay();
          return;
        }
        renderFrame();
        physRaf = requestAnimationFrame(stepPhysics);
        return;
      }
      // 顶牌未达切牌阈值：2D 弹性回位
      const k = 280, d = 26;
      const ax = (dkTx - dkX) * k - dkVx * d;
      const ay = (dkTy - dkY) * k - dkVy * d;
      dkVx += ax * dt; dkVy += ay * dt;
      dkX += dkVx * dt; dkY += dkVy * dt;
      if (Math.abs(dkX - dkTx) < 0.35 && Math.abs(dkY - dkTy) < 0.35 && Math.hypot(dkVx, dkVy) < 8) {
        dkX = dkTx; dkY = dkTy; dkVx = 0; dkVy = 0;
        renderFrame();
        return;
      }
      renderFrame();
      physRaf = requestAnimationFrame(stepPhysics);
      return;
    }

    // arc / focus / peek 通用二阶弹簧（临界偏柔微弹性，顺滑衔接手速）
    const stiffness = cfg.variant === "peek" ? 210 : 230;
    const damping = cfg.variant === "peek" ? 26.5 : 27;
    const force = (target - pos) * stiffness;
    const damp = vel * damping;
    vel += (force - damp) * dt;
    pos += vel * dt;

    if (Math.abs(target - pos) < 0.0012 && Math.abs(vel) < 0.008) {
      // 落位后归约至 [0, n) 防止无限循环累计坐标过大
      const n = count();
      if (isLoop() && n > 0) {
        const w = ((Math.round(target) % n) + n) % n;
        pos = target = cur = w;
      } else {
        pos = target;
        cur = wrapIdx(Math.round(target));
      }
      vel = 0;
      renderFrame();
      syncChrome();
      return;
    }
    renderFrame();
    physRaf = requestAnimationFrame(stepPhysics);
  }

  function notifyChange(prev) {
    if (cur !== prev) {
      cfg.onChange?.(cur, slides[cur]);
      emit?.("change", cur);
      root.dispatchEvent(new CustomEvent("sn-change", { detail: cur, bubbles: true }));
    }
  }

  function go(nextIdx, { silent = false, instant = false, velocity = null } = {}) {
    const n = count();
    if (!n) return;
    const prev = cur;
    if (cfg.variant === "deck" && !instant && !reduced() && nextIdx !== prev) {
      // 按钮/键盘切牌同样触发真实飞出动画
      const dir = nextIdx > prev || (prev === n - 1 && nextIdx === 0) ? -1 : 1;
      dkFly = 1; dkSign = 1;
      dkVx = dir * Math.max(820, cardWidth() * 3.6);
      dkVy = -90;
      startPhysics();
      return;
    }
    if (isLoop()) {
      // 选取离当前连续 pos 最近的同余目标，保证翻页走最短弧线永不倒车
      const delta = relOffset(((nextIdx % n) + n) % n, pos, n, true);
      target = pos + delta;
      cur = ((Math.round(target) % n) + n) % n;
    } else {
      const clamped = Math.max(0, Math.min(n - 1, nextIdx));
      target = clamped;
      cur = clamped;
    }
    if (velocity != null) vel = velocity;
    syncChrome();
    if (instant || reduced()) {
      stopPhysics();
      pos = target = cur;
      vel = 0;
      dkX = dkY = dkVx = dkVy = dkFly = 0;
      renderFrame();
    } else {
      startPhysics();
    }
    resetAutoplay();
    if (!silent) notifyChange(prev);
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
      go(cur + 1);
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

  // ———— 指针拖拽（支持鼠标 & 触控；半空可随时无缝抓停；滑动窗口速度采样；捕获阶段防误点） ————
  const onDown = (e) => {
    if (e.button && e.button !== 0) return;
    if (e.target.closest(".sn-cr-nav, button, a, input")) return;
    if (count() <= 1) return;
    stopPhysics();
    dkFly = 0;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startPos = pos;
    locked = 0;
    samples.length = 0;
    samples.push([performance.now(), e.clientX, e.clientY]);
    if (cfg.variant === "deck") {
      const r = vp.getBoundingClientRect();
      dkSign = e.clientY < r.top + r.height * 0.5 ? 1 : -0.75;
    }
  };

  const onMove = (e) => {
    if (pointerId == null || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!locked) {
      if (Math.hypot(dx, dy) < 5) return;
      if (cfg.variant !== "deck" && Math.abs(dy) > Math.abs(dx) * 1.15) {
        pointerId = null;
        startPhysics();
        return;
      }
      locked = 1;
      dragging = true;
      vp.classList.add("sn-cr-drag");
      try { vp.setPointerCapture(pointerId); } catch {}
      cancelAnimationFrame(autoRaf);
    }
    const now = performance.now();
    samples.push([now, e.clientX, e.clientY]);
    while (samples.length > 2 && now - samples[0][0] > 90) samples.shift();

    if (cfg.variant === "deck") {
      dkX = dx;
      dkY = dy * 0.42;
      renderFrame();
      return;
    }

    const sw = Math.max(100, stepWidth());
    let nextPos = startPos - dx / sw;
    if (!isLoop()) {
      const maxP = count() - 1;
      if (nextPos < 0) nextPos = -rubberBand(-nextPos, 0.48);
      else if (nextPos > maxP) nextPos = maxP + rubberBand(nextPos - maxP, 0.48);
    }
    pos = nextPos;
    renderFrame();
  };

  const onUp = (e) => {
    if (pointerId == null || (e.pointerId != null && e.pointerId !== pointerId)) return;
    const wasDrag = dragging;
    pointerId = null;
    dragging = false;
    vp.classList.remove("sn-cr-drag");
    if (!wasDrag) {
      startPhysics();
      return;
    }
    // 拖拽结束后短暂拦截捕获层 click，杜绝拖动松手误点进入详情/预订
    suppressUntil = performance.now() + 260;

    // 滑动窗口计算真实甩手初速度（px/s）
    let pxVx = 0, pxVy = 0;
    if (samples.length >= 2) {
      const a = samples[0], b = samples[samples.length - 1];
      const dt = Math.max(0.012, (b[0] - a[0]) / 1000);
      pxVx = (b[1] - a[1]) / dt;
      pxVy = (b[2] - a[2]) / dt;
    }

    if (cfg.variant === "deck") {
      const cw = cardWidth();
      const thresh = Math.min(72, cw * 0.28);
      if (Math.abs(dkX) > thresh || Math.abs(pxVx) > 420) {
        const dir = Math.abs(pxVx) > 180 ? Math.sign(pxVx) : (Math.sign(dkX) || -1);
        dkFly = 1;
        dkVx = Math.abs(pxVx) > 540 ? pxVx * 1.1 : dir * Math.max(780, cw * 3.2);
        dkVy = Math.max(-220, Math.min(220, pxVy * 0.45));
      } else {
        dkTx = 0; dkTy = 0;
        dkVx = pxVx * 0.35;
        dkVy = pxVy * 0.35;
        resetAutoplay();
      }
      startPhysics();
      return;
    }

    const sw = Math.max(100, stepWidth());
    const unitVel = Math.max(-9, Math.min(9, -pxVx / sw)); // 张/秒
    const projected = pos + unitVel * 0.145;
    let nextTarget = Math.round(projected);
    // 轻拖但超阈值确保切 1 张，防止手感迟钝
    const moved = pos - startPos;
    if (nextTarget === Math.round(startPos)) {
      if (moved > 0.22 || unitVel > 1.2) nextTarget = Math.round(startPos) + 1;
      else if (moved < -0.22 || unitVel < -1.2) nextTarget = Math.round(startPos) - 1;
    }
    const n = count();
    if (!isLoop()) nextTarget = Math.max(0, Math.min(n - 1, nextTarget));

    const prev = cur;
    target = nextTarget;
    cur = wrapIdx(nextTarget);
    vel = unitVel;
    syncChrome();
    startPhysics();
    resetAutoplay();
    notifyChange(prev);
  };

  // 桌面触控板双指横划（wheel deltaX）丝滑翻页
  const onWheel = (e) => {
    if (count() <= 1 || Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2 || Math.abs(e.deltaX) < 4) return;
    e.preventDefault();
    wheelAcc += e.deltaX;
    clearTimeout(wheelTimer);
    if (Math.abs(wheelAcc) >= 52) {
      const dir = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0;
      go(cur + dir);
    } else {
      wheelTimer = setTimeout(() => { wheelAcc = 0; }, 140);
    }
  };

  // 捕获阶段拦截拖拽引发的鬼影点击（保护外部所有自定义 click 监听）
  const onCaptureClick = (e) => {
    if (performance.now() < suppressUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // 点击侧边卡片直接平滑切至该张
  const onTrackClick = (e) => {
    if (performance.now() < suppressUntil) return;
    const slide = e.target.closest(".sn-cr-slide");
    if (!slide) return;
    const idx = Number(slide.dataset.crI);
    if (Number.isFinite(idx) && idx !== cur) {
      if (cfg.variant === "deck") next();
      else go(idx);
    }
  };

  const onDragStart = (e) => e.preventDefault();
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
  vp.addEventListener("lostpointercapture", onUp);
  vp.addEventListener("dragstart", onDragStart);
  vp.addEventListener("wheel", onWheel, { passive: false });
  vp.addEventListener("click", onCaptureClick, true);
  vp.addEventListener("click", onTrackClick);
  root.addEventListener("keydown", onKey);
  root.addEventListener("pointerenter", onEnter);
  root.addEventListener("pointerleave", onLeave);
  prevBtn?.addEventListener("click", prev);
  nextBtn?.addEventListener("click", next);
  dots.forEach((d) => d.addEventListener("click", () => go(Number(d.dataset.crDot))));

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => renderFrame()) : null;
  ro?.observe(vp);
  syncChrome();
  renderFrame();
  resetAutoplay();

  const api = {
    get index() { return cur; },
    get variant() { return cfg.variant; },
    go,
    next,
    prev,
    setVariant(v) {
      stopPhysics();
      cfg.variant = v;
      root.dataset.variant = v;
      cur = wrapIdx(cur);
      pos = target = cur;
      vel = 0; dkX = dkY = dkVx = dkVy = dkFly = 0;
      syncChrome();
      renderFrame();
    },
    update(nextOpts = {}) {
      stopPhysics();
      cfg = { ...cfg, ...nextOpts };
      if (nextOpts.variant) root.dataset.variant = nextOpts.variant;
      if (typeof nextOpts.index === "number") cur = count() ? ((nextOpts.index % count()) + count()) % count() : 0;
      slides = [...root.querySelectorAll(".sn-cr-slide")];
      dots = [...root.querySelectorAll("[data-cr-dot]")];
      pos = target = cur;
      vel = 0; dkX = dkY = dkVx = dkVy = dkFly = 0;
      syncChrome();
      renderFrame();
      resetAutoplay();
    },
    destroy() {
      alive = false;
      stopPhysics();
      cancelAnimationFrame(autoRaf);
      clearTimeout(wheelTimer);
      ro?.disconnect();
      vp.removeEventListener("pointerdown", onDown);
      vp.removeEventListener("pointermove", onMove);
      vp.removeEventListener("pointerup", onUp);
      vp.removeEventListener("pointercancel", onUp);
      vp.removeEventListener("lostpointercapture", onUp);
      vp.removeEventListener("dragstart", onDragStart);
      vp.removeEventListener("wheel", onWheel);
      vp.removeEventListener("click", onCaptureClick, true);
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
