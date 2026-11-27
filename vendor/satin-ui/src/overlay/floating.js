// Satin 统一浮层智能定位引擎（Select / Picker / Popover / Popconfirm / FloatMenu / Tooltip / ColorPopover / GridPopover 共用）。
export function getViewportBounds(m = 8) {
  const iw = typeof innerWidth === "number" ? innerWidth : 1024, ih = typeof innerHeight === "number" ? innerHeight : 768;
  const c = typeof window !== "undefined" && typeof window.__satinViewportBounds === "function" ? window.__satinViewportBounds() : null;
  let l = 0, t = 0, r = iw, b = ih;
  if (c && Number.isFinite(c.top) && Number.isFinite(c.bottom)) { l = c.left; t = c.top; r = c.right; b = c.bottom; }
  else if (typeof document !== "undefined" && document.documentElement) {
    const sp = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    if (sp > 0 && sp < ih * 0.4) t = sp;
  }
  return { left: l + m, top: t + m, right: r - m, bottom: b - m, rawTop: t, rawBottom: b };
}

export function computeFloating(panel, anchor, { placement = "bottom", align = "start", gap = 6, margin = 8, preferUp = false, preferEnd = false } = {}) {
  const ar = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
  const b = getViewportBounds(margin), w = panel.offsetWidth || 0, h = panel.offsetHeight || 0;
  if (placement === "right" || placement === "left") {
    const rr = b.right - ar.right, rl = ar.left - b.left;
    const right = placement === "right" ? (rr >= w + gap || rr >= rl) : (rl < w + gap && rr > rl);
    const rawL = right ? ar.right + gap : ar.left - gap - w;
    const left = Math.max(b.left, Math.min(Math.max(b.left, b.right - w), rawL));
    const rawT = ar.top + ar.height / 2 - h / 2;
    const top = Math.max(b.top, Math.min(Math.max(b.top, b.bottom - h), rawT));
    const dx = Math.round(left - rawL), dy = Math.round(top - rawT);
    const oy = Math.round(Math.max(8, Math.min(Math.max(8, h - 8), ar.top + ar.height / 2 - top)));
    return { left: Math.round(left), top: Math.round(top), dx, dy, up: false, end: !right, side: right ? "right" : "left", ox: right ? 0 : w, oy };
  }
  const rb = b.bottom - ar.bottom, rt = ar.top - b.top;
  const up = (placement === "top" || preferUp) ? (rt >= h + gap || rt >= rb) : (rb < h + gap && rt > rb);
  const rr = b.right - ar.left, rl = ar.right - b.left;
  let end = align === "end" || preferEnd;
  if (align !== "center") end = (preferEnd || align === "end") ? (rl >= w || rl >= rr) : (rr < w && rl > rr);
  const rawL = align === "center" ? ar.left + ar.width / 2 - w / 2 : end ? ar.right - w : ar.left;
  const left = Math.max(b.left, Math.min(Math.max(b.left, b.right - w), rawL));
  const rawT = up ? ar.top - gap - h : ar.bottom + gap;
  const top = Math.max(b.top, Math.min(Math.max(b.top, b.bottom - h), rawT));
  const dx = Math.round(left - (end ? ar.right - w : ar.left)), dy = Math.round(top - rawT);
  const ox = Math.round(Math.max(8, Math.min(Math.max(8, w - 8), ar.left + ar.width / 2 - left)));
  return { left: Math.round(left), top: Math.round(top), dx, dy, up, end, ox, oy: up ? h : 0 };
}

export function isAnchorOutOfView(anchor) {
  if (!anchor?.getBoundingClientRect) return false;
  const r = anchor.getBoundingClientRect(), b = getViewportBounds(0);
  return (!r.width && !r.height) || r.bottom < b.rawTop || r.top > b.rawBottom;
}
