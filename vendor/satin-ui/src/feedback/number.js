// 数字变化（NumberFlow）
// 只动变了的那几位：变大往上走、变小往下走；从个位开始依次动（每位晚 30ms），像一串连锁反应。
// 四种样式：
//   roll 滚动：每一位是一条 0～9 的竖条，像里程表一样滚过中间的数字；上下边缘渐隐。
//   blur 模糊滚动：同样滚动，滚动时带竖直方向的运动模糊（滚过的格数越多越糊），停下变清晰。
//   push 推入：变了的那一位，旧数字往上（或往下）滑走，新数字从另一头滑进来，带一点模糊。
//   fade 淡入：变了的那一位原地淡出淡入，带一点缩放和模糊，适合小徽标。
// 位数变化（99 → 100、999 → 1,000）：新增的那一位从 0 宽长出来，去掉的收成 0 宽；千分位逗号、小数点、货币符号不跟着滚。
// 中途又来新值：从当前看到的位置接着滚，不跳。减少动态效果时直接换。只动 transform、opacity、filter 和这一位的宽度。

const NS = "http://www.w3.org/2000/svg", COPIES = 5, REST = 20, STAGGER = 30;
// 竖条是 0～9 重复 5 遍，平时停在第 3 遍
const EASE = "cubic-bezier(.2, .85, .25, 1)";
// 起步快、收尾柔
let fid = 0, defs = null;
function filterDefs() {
  if (defs) return defs;
  const s = document.createElementNS(NS, "svg"); s.setAttribute("width", "0"); s.setAttribute("height", "0"); s.setAttribute("aria-hidden", "true"); s.style.position = "absolute";
  defs = document.createElementNS(NS, "defs"); s.append(defs); document.body.append(s); return defs;
}
const STRIP = /* @__PURE__ */ Array.from({ length: COPIES * 10 }, (_, i) => i % 10).join("\n");
export function numberFlow(el, { value = 0, format = (v) => Number(v).toLocaleString("zh-CN"), style = "roll", reduced = () => false } = {}) {
  el.classList.add("sn-nf"); el.dataset.nfStyle = style; el.textContent = "";
  const sr = document.createElement("span"); sr.className = "sn-nf-sr"; el.append(sr);
  let cur = value, slots = [];
  const rolls = () => style === "roll" || style === "blur";
  // ———— 一位 ————
  function makeSlot(ch) {
    const d = /\d/.test(ch), s = { kind: d ? "d" : "c", ch, v: d ? +ch : null, el: document.createElement("span") };
    s.el.className = d ? "sn-nf-d" : "sn-nf-c"; s.el.setAttribute("aria-hidden", "true");
    if (!d) { s.el.textContent = ch; return s; }
    if (rolls()) {
      s.col = document.createElement("span"); s.col.className = "sn-nf-col"; s.col.textContent = STRIP; s.el.append(s.col);
      s.pos = REST + s.v; s.col.style.transform = `translateY(${-s.pos * 1.4}em)`;
      if (style === "blur") {
        const f = document.createElementNS(NS, "filter"), id = "nfb" + ++fid; f.id = id; f.setAttribute("x", "-10%"); f.setAttribute("y", "-20%"); f.setAttribute("width", "120%"); f.setAttribute("height", "140%");
        f.innerHTML = '<feGaussianBlur stdDeviation="0 0"><animate attributeName="stdDeviation" begin="indefinite" fill="freeze" calcMode="spline" keySplines=".2 .8 .3 1; .4 0 .6 1; .4 0 .6 1"/></feGaussianBlur>';
        filterDefs().append(f); s.filter = f; s.blurAnim = f.querySelector("animate"); s.el.style.filter = `url(#${id})`; // 滤镜挂在这一位的小窗口上（只模糊看得见的那一格），不挂在整条竖条上
      }
    } else { s.g = document.createElement("span"); s.g.className = "sn-nf-g"; s.g.textContent = ch; s.el.append(s.g); }
    return s;
  }
  const dropSlot = (s) => { s.el.remove(); s.filter?.remove(); };
  // ———— 滚动：在 0～9 的竖条上往对应方向走到目标数字；中途又来新值就从当前位置接着走 ————
  const lineOf = (s) => s.col.offsetHeight / (COPIES * 10) || 1;
  function curPos(s) { const m = new DOMMatrixReadOnly(getComputedStyle(s.col).transform); return -m.f / lineOf(s); }
  function roll(s, to, dir, delay) {
    let start = s.pos;
    if (s.anim) { start = curPos(s); s.anim.cancel(); s.anim = null; }
    let target = Math.floor(start) + ((to - (Math.floor(start) % 10)) % 10 + 10) % 10; // 往上：start 以上第一个 to
    if (dir < 0) { target = Math.ceil(start) - ((((Math.ceil(start) % 10) - to) % 10) + 10) % 10; } // 往下：start 以下第一个 to
    if (dir > 0 && target <= start - .001) target += 10;
    if (dir < 0 && target >= start + .001) target -= 10;
    target = Math.max(0, Math.min(COPIES * 10 - 1, target));
    const steps = Math.abs(target - start), dur = 420 + Math.min(10, steps) * 16;
    s.v = to; s.pos = target;
    const a = s.col.animate([{ transform: `translateY(${-start * 1.4}em)` }, { transform: `translateY(${-target * 1.4}em)` }], { duration: dur, delay, easing: EASE, fill: "both" });
    s.anim = a;
    a.onfinish = () => { if (s.anim !== a) return; s.anim = null; a.cancel(); s.pos = REST + to; s.col.style.transform = `translateY(${-s.pos * 1.4}em)`; }; // 回到第 3 遍的同一个数字，看不出来
    if (s.blurAnim && steps > .2) { // 竖直方向的运动模糊：走得快时糊，停下变清晰
      const peak = Math.min(2.6, .7 + steps * .22).toFixed(2);
      s.blurAnim.setAttribute("dur", dur + "ms"); s.blurAnim.setAttribute("keyTimes", "0; .22; .7; 1"); s.blurAnim.setAttribute("values", `0 0; 0 ${peak}; 0 ${(peak * .2).toFixed(2)}; 0 0`);
      clearTimeout(s.blurT); s.blurT = setTimeout(() => s.blurAnim.beginElement(), delay);
    }
  }
  // ———— 推入 / 淡入：旧数字走掉，新数字进来 ————
  function swap(s, to, dir, delay) {
    for (const g of s.el.querySelectorAll(".sn-nf-g")) g.getAnimations().forEach((a) => a.finish());
    const old = s.g, g = document.createElement("span"); g.className = "sn-nf-g"; g.textContent = to; s.el.append(g); s.g = g; s.v = to;
    const fade = style === "fade", o = { duration: fade ? 300 : 380, delay, easing: EASE, fill: "both" }, D = dir >= 0 ? -100 : 100;
    const outK = fade ? [{ opacity: 1, transform: "none", filter: "blur(0)" }, { opacity: 0, transform: "scale(.7)", filter: "blur(3px)" }] : [{ opacity: 1, transform: "none", filter: "blur(0)" }, { opacity: 0, transform: `translateY(${D}%)`, filter: "blur(2px)" }];
    const inK = fade ? [{ opacity: 0, transform: "scale(1.35)", filter: "blur(3px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }] : [{ opacity: 0, transform: `translateY(${-D}%)`, filter: "blur(2px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }];
    old.animate(outK, o).onfinish = () => old.remove();
    g.animate(inK, o);
  }
  // ———— 宽度：新增的一位从 0 宽长出来，去掉的收成 0 宽（留在原位，旁边的数字平滑让开） ————
  const widthOf = (s) => (s.kind === "d" ? "1ch" : s.el.getBoundingClientRect().width + "px");
  function enter(s, delay, fromDigit) {
    if (reduced()) return;
    const w = widthOf(s); s.el.animate([{ width: "0px", opacity: 0 }, { width: w, opacity: 1 }], { duration: 320, delay, easing: EASE, fill: "backwards" });
    if (s.kind === "d" && s.col) { const v = s.v; s.pos = REST + fromDigit; s.col.style.transform = `translateY(${-s.pos * 1.4}em)`; roll(s, v, v >= fromDigit ? 1 : -1, delay); }
  }
  function exit(s) {
    if (reduced()) { dropSlot(s); return; }
    s.leaving = true; s.el.style.width = widthOf(s);
    s.el.animate([{ opacity: 1 }, { width: "0px", opacity: 0 }], { duration: 260, easing: EASE, fill: "forwards" }).onfinish = () => dropSlot(s);
  }
  // ———— 换值：从右往左一位一位对齐（数字靠个位对齐） ————
  function set(v, { instant = false } = {}) {
    const prev = cur, str = format(v); cur = v; sr.textContent = str; el.setAttribute("aria-label", str);
    const dir = v > prev ? 1 : v < prev ? -1 : 0, chars = [...str], live = slots.filter((s) => !s.leaving), next = [];
    let oi = live.length - 1, rightRef = null, rank = 0;
    const quiet = instant || reduced();
    for (let ni = chars.length - 1; ni >= 0; ni--, oi--) {
      const ch = chars[ni], isD = /\d/.test(ch), old = oi >= 0 ? live[oi] : null;
      if (old && old.kind === (isD ? "d" : "c") && (isD || old.ch === ch)) {
        if (isD && old.v !== +ch) {
          const delay = quiet ? 0 : rank++ * STAGGER;
          if (quiet) { if (old.col) { old.anim?.cancel(); old.anim = null; old.pos = REST + +ch; old.col.style.transform = `translateY(${-old.pos * 1.4}em)`; } else old.g.textContent = ch; old.v = +ch; }
          else if (old.col) roll(old, +ch, dir || 1, delay); else swap(old, +ch, dir || 1, delay);
        }
        next.unshift(old); rightRef = old.el;
      } else {
        if (old) exit(old);
        const s = makeSlot(ch); el.insertBefore(s.el, rightRef); next.unshift(s); rightRef = s.el;
        if (!quiet && slots.length) enter(s, rank * STAGGER, 0);
      }
    }
    for (; oi >= 0; oi--) exit(live[oi]);
    slots = [...next, ...slots.filter((s) => s.leaving && s.el.isConnected)];
  }
  set(value, { instant: true });
  return {
    set, get: () => cur,
    setStyle(st) { style = st; el.dataset.nfStyle = st; for (const s of slots) dropSlot(s); slots = []; set(cur, { instant: true }); },
  };
}
