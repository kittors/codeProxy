// UI 库设计稿：输入框加强。字数统计、长文本、密码强度、大写锁定、邮箱校验、搜索、标签输入、数字步进、提示词输入框。
// 原则：动效只用 transform / opacity；数字变化用滚动；等待遵守 300 / 500ms；中文输入法正在拼字时不响应回车和逗号。
// 用法：每种输入框一个 mountXxx(元素, 选项)；bindInputs(root) 按标记一次接上（data-count / data-ta / data-pw / data-email / data-tagin / data-stepper / data-composer）。
import { fmtSize, midEllipsis, waveBars } from "./data.js";
import { scrollArea } from "./scroll.js";
import { EASE_CSS, setFieldError, clearFieldError, mountSelect } from "./form.js";
import { $, $$, reduced, injectIcons, retip } from "./core.js";
import { onCleanup } from "./lifecycle.js";
import { scoped } from "./i18n.js";
import I18N_DEFAULTS from "./locales/zh-CN/input.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
const setErr = setFieldError, clearErr = clearFieldError;
void clearErr;
const IN_OUT = "cubic-bezier(.42,0,.58,1)", POP = "cubic-bezier(.34,1.56,.64,1)", EASE_IN = "cubic-bezier(.42,0,1,1)";
const segmenter = typeof Intl.Segmenter === "function" ? /* @__PURE__ */ new Intl.Segmenter("zh", { granularity: "grapheme" }) : null;
const len = (s) => (segmenter ? [...segmenter.segment(s)].length : [...s].length);
// 按"字"数，表情也算一个
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// ———— 提示词输入框的可选部件（新对话那一套；都不给时输入框的标记和原来一模一样） ————
// context：输入框顶上一条浅灰的上下文栏（项目文件夹、本地 / 云端、分支……），每项 { icon?, text, options?, value? }：
//   有 options（[{ value, label }]）的那项点开是菜单，选了发 contextChange（{ index, value }）；没有的点了发 contextClick（{ index }）
// mode：底部一行的模式 / 权限标签 { label, tone?, options?, value? }（或直接一段文字），tone 用状态色的小圆点：ok 绿、warn 橙、bad 红、need 主色；
//   有 options（[{ value, label, tone? }]）时点开是菜单，选了发 modeChange（value）
// models / model：模型选择，每项 { value, label }（label 写成"名称 · 档位"），点开往上长一个菜单，选了发 modelChange（value）
const attr = (v) => esc(String(v ?? ""));
const TONES = { ok: " sn-ok", warn: " sn-warn", bad: " sn-bad", need: " sn-need" };
const optOf = (opts, v) => opts.find((o) => String(o.value) === String(v)) || opts[0];
const caret = '<span class="sn-cm-caret" data-i="chevron-down" aria-hidden="true"></span>';
const menuHTML = (opts, cur, dots) => `<div class="sn-menu" role="menu">${opts.map((o) => `<div class="sn-item${o === cur ? " sn-sel" : ""}" role="menuitemradio" aria-checked="${o === cur}" data-v="${attr(o.value)}">${dots ? `<i class="sn-cm-dot${TONES[o.tone] || ""}"></i>` : ""}<span class="sn-tx">${attr(o.label)}</span><span class="sn-chk" data-i="check"></span></div>`).join("")}</div>`;
export const cmContextHTML = (context) => (context?.length
  ? `<div class="sn-cm-ctx" role="group" aria-label="${attr(tt("input.ctx"))}">${context.map((c, i) => {
      const ic = c.icon ? ` data-i="${attr(c.icon)}:before"` : "";
      if (!c.options?.length) return `<button type="button" class="sn-cm-ctx-i" data-ctx="${i}"${ic}><span class="sn-cm-lbl">${attr(c.text)}</span></button>`;
      const cur = optOf(c.options, c.value ?? c.options[0].value);
      return `<div class="sn-select sn-inline-menu sn-up sn-cm-pick" data-pick="ctx" data-ctx="${i}"><button type="button" class="sn-cm-ctx-i" data-menubtn aria-haspopup="menu"${ic}><span class="sn-cm-lbl">${attr(cur.label)}</span>${caret}</button>${menuHTML(c.options, cur)}</div>`;
    }).join("")}</div>`
  : "");
export const cmModeHTML = (mode) => {
  if (mode == null || mode === false || mode === "") return "";
  const m = typeof mode === "object" ? mode : { label: mode };
  if (!m.options?.length) return `<span class="sn-tag sn-cm-mode${TONES[m.tone] || ""}"><i></i><span class="sn-cm-lbl">${attr(m.label)}</span></span>`;
  const cur = optOf(m.options, m.value ?? m.options[0].value), tone = cur.tone ?? m.tone;
  return `<div class="sn-select sn-inline-menu sn-up sn-cm-pick" data-pick="mode"><button type="button" class="sn-tag sn-cm-mode${TONES[tone] || ""}" data-menubtn aria-haspopup="menu"><i></i><span class="sn-cm-lbl">${attr(cur.label)}</span>${caret}</button>${menuHTML(m.options, cur, true)}</div>`;
};
// 模型按钮在窄的时候（底部一行放不下全名）只显示档位：每项可以给 short，不给就取 label 里最后一个"·"后面那段；全名在菜单里、也是按钮的读屏名
// 宽屏下按最后一个"·"拆成两段色阶（主名深色 + 档位浅灰），textContent 依然完整一致
const shortOf = (m) => String(m.short ?? String(m.label).split(/\s*·\s*/).pop());
const modelLabelHTML = (label) => {
  const s = String(label ?? ""), i = s.lastIndexOf("·");
  if (i <= 0 || i >= s.length - 1) return attr(s);
  const a = s.slice(0, i).trimEnd(), b = s.slice(i);
  return `<span class="sn-cm-m1">${attr(a)}</span><span class="sn-cm-m2"> ${attr(b)}</span>`;
};
export const cmModelsHTML = (models, model) => {
  if (!models?.length) return "";
  const cur = optOf(models, model);
  return `<div class="sn-select sn-inline-menu sn-up sn-cm-pick sn-cm-models" data-pick="model"><button type="button" class="sn-btn sn-ghost sn-sm sn-cm-model" data-menubtn data-cm-models aria-haspopup="menu" aria-label="${attr(cur.label)}" data-tip="${attr(tt("input.model"))}"><span class="sn-cm-lbl">${modelLabelHTML(cur.label)}</span><span class="sn-cm-lbl sn-cm-lbl-s" aria-hidden="true">${attr(shortOf(cur))}</span>${caret}</button>` +
    menuHTML(models, cur).replace(/data-v="([^"]*)">/g, (m0, v) => { const o = models.find((x) => attr(x.value) === v); return `data-v="${v}" data-short="${attr(o ? shortOf(o) : "")}">`; }) + `</div>`;
};
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// 框架里属性换了：结构一样、只是选中项换了 → 只改选中（不重画、不发事件，用户刚选完的动画不被打断）；结构变了才换那一块
const withoutValue = (m) => (m && typeof m === "object" ? { ...m, value: undefined, label: m.options ? undefined : m.label, tone: m.options ? undefined : m.tone } : m);
export function syncComposerParts(k, n, p) {
  if (!k) return;
  if (!same(n.context, p.context)) {
    const a = (n.context || []).map(withoutValue), b = (p.context || []).map(withoutValue);
    if (same(a, b)) (n.context || []).forEach((c, i) => { if (c.options && c.value !== p.context[i]?.value) k.setContextValue(i, c.value); });
    else k.setContext(n.context);
  }
  if (!same(n.mode, p.mode)) { if (n.mode?.options && same(withoutValue(n.mode), withoutValue(p.mode))) k.setModeValue(n.mode.value); else k.setMode(n.mode); }
  if (!same(n.models, p.models)) k.setModels(n.models, n.model); else if (n.model !== p.model && n.model != null) k.setModel(n.model);
}
// 按钮上的字换了：旧字往上淡出、新字从下面淡入（只动透明度和位移）；减少动态效果时直接换
const OUT_STRONG = "cubic-bezier(.22,1,.36,1)";
function swapLabel(lbl, text, animate = true, html) {
  if (!lbl || lbl.textContent === text) return;
  const apply = () => { if (html != null) lbl.innerHTML = html; else lbl.textContent = text; };
  if (!animate || reduced() || !lbl.isConnected) { apply(); return; }
  const old = lbl.cloneNode(true); old.setAttribute("aria-hidden", "true");
  Object.assign(old.style, { position: "absolute", left: lbl.offsetLeft + "px", top: lbl.offsetTop + "px", pointerEvents: "none" });
  lbl.parentElement.append(old); apply();
  old.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-6px)" }], { duration: 140, easing: EASE_IN, fill: "forwards" }).onfinish = () => old.remove();
  lbl.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 220, delay: 40, easing: OUT_STRONG, fill: "backwards" });
}
// 数字或短词滚动：dir > 0 时新值从下面上来（变大），dir < 0 时从上面下来
function roll(box, value, dir) {
  const old = box.lastElementChild, text = String(value);
  if (old && old.textContent === text) return;
  const s = document.createElement("span"); s.textContent = text; box.append(s);
  if (!old) return;
  if (reduced()) { old.remove(); return; }
  const up = dir ?? (Number(text) >= Number(old.textContent) ? 1 : -1);
  old.animate([{ transform: "none", opacity: 1 }, { transform: `translateY(${up > 0 ? -100 : 100}%)`, opacity: 0 }], { duration: 160, easing: IN_OUT, fill: "forwards" }).onfinish = () => old.remove();
  s.animate([{ transform: `translateY(${up > 0 ? 100 : -100}%)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 160, easing: IN_OUT });
}
const setRoll = (box, v) => box.replaceChildren(Object.assign(document.createElement("span"), { textContent: String(v) }));
const nudge = (el) => { if (reduced()) return; el.classList.remove("sn-nudge"); void el.offsetWidth; el.classList.add("sn-nudge"); };
// 页面级：字数到顶时计数抖一下，抖完去掉类。setup() 里装一次
export function installInputs() { document.addEventListener("animationend", (e) => e.target.classList?.remove("sn-nudge")); }
const once = (el, k) => (el[k] ? false : (el[k] = true));
// ———— 1. 单行字数 ————
// mountCount(<input data-count maxlength>)：右边的计数跟着滚动，快满变色，写满还在敲时抖一下
export function mountCount(input) {
  if (!once(input, "_cnt")) return;
  const ib = input.closest(".sn-ib"), counter = $(".sn-counter", ib), box = $(".sn-roll", counter), max = input.maxLength;
  const sync = (animate) => {
    const n = len(input.value);
    if (animate) roll(box, n); else setRoll(box, n);
    counter.classList.toggle("sn-warn", n >= Math.ceil(max * .9) && n < max); counter.classList.toggle("sn-full", n >= max);
    ib.classList.toggle("sn-filled", !!input.value);
  };
  input.addEventListener("input", () => sync(true));
  // 写满了还在敲：计数抖一下，告诉用户为什么没反应
  input.addEventListener("beforeinput", (e) => { if (e.inputType.startsWith("insert") && len(input.value) >= max && input.selectionStart === input.selectionEnd) nudge(counter); });
  sync(false);
}
// ———— 2. 自动长高：用一个看不见的镜像量高度，再把高度过渡过去（auto 不能过渡） ————
// autoGrow(容器)：容器里的 textarea 按内容长高（rows 到 data-max-lines 行之间），高度过渡；超出在里面滚，上下渐隐
export function autoGrow(box) {
  const ta = $("textarea", box), cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight), padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const minH = (Number(ta.getAttribute("rows")) || 1) * lh + padV, maxH = (Number(box.dataset.maxLines) || 7) * lh + padV;
  const h0 = ta.style.height, ov0 = ta.style.overflowY;
  // 多行输入统一包进 ScrollArea（渐隐留在 textarea 内容上，滚动条独立在外层 .sn-sa，绝不被 mask-image 虚化）
  const sa = ta.parentNode ? scrollArea(ta, { fade: "none", overscroll: "contain" }) : null;
  const mirror = document.createElement("div");
  Object.assign(mirror.style, { position: "absolute", visibility: "hidden", left: "-9999px", top: "0", boxSizing: "border-box", whiteSpace: "pre-wrap", overflowWrap: "anywhere",
    font: cs.font, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, padding: cs.padding });
  document.body.append(mirror);
  onCleanup(() => {
    mirror.remove();
    delete box.dataset.cmH;
    ta.style.height = h0; ta.style.overflowY = ov0;
    ta.classList.remove("sn-fade-top", "sn-fade-bottom");
    if (!ta.getAttribute("style")) ta.removeAttribute("style");
  }); // 组件销毁或 enhance 撤销时完整还原，保证重复挂载结构逐字一致
  const edges = () => { ta.classList.toggle("sn-fade-top", ta.scrollTop > 2); ta.classList.toggle("sn-fade-bottom", ta.scrollTop + ta.clientHeight < ta.scrollHeight - 2); };
  const fit = () => {
    mirror.style.width = ta.offsetWidth + "px"; mirror.textContent = ta.value + "​";
    const manual = Number(box.dataset.cmH) || 0;
    const h = manual > 0 ? Math.max(minH, manual) : Math.max(minH, Math.min(maxH, mirror.offsetHeight));
    if (ta.style.height !== h + "px") ta.style.height = h + "px";
    ta.style.overflowY = mirror.offsetHeight > h + 1 ? "auto" : "hidden"; edges(); sa?.refresh();
  };
  ta.style.height = minH + "px"; ta.addEventListener("input", fit); ta.addEventListener("scroll", edges, { passive: true });
  new ResizeObserver(() => fit()).observe(box); fit();
  box.addEventListener("pointerdown", (e) => { if (e.target === box || e.target.closest(".sn-ta-foot")) { e.preventDefault(); ta.focus(); } });
  return fit;
}
// ———— 3. 长文本字数：用量环 + 文字；快满"还剩 N 字"，超出"超出 N 字"并整框变红 ————
// longCount(容器, { showFrom })：量环 + 文字计数（data-max 字）；快满"还剩 N 字"，超出"超出 N 字"并整框变红；showFrom：写到几成才显示
export function longCount(box, { showFrom = 0 } = {}) {
  const ta = $("textarea", box), max = Number(box.dataset.max), cnt = $(".sn-ta-count", box), fg = $(".sn-uring .sn-fg", cnt), C = 2 * Math.PI * 6;
  fg.style.strokeDasharray = C; fg.style.strokeDashoffset = C;
  let txt = $(".sn-txt", cnt), mode = "", wasOver = false;
  if (txt) txt.innerHTML = '<span class="sn-pre"></span><span class="sn-roll"><span>0</span></span><span class="sn-suf"></span>';
  const update = (animate) => {
    const n = len(ta.value), p = n / max, over = n > max;
    fg.style.strokeDashoffset = String(C * (1 - Math.min(1, p)));
    cnt.classList.toggle("sn-warn", p >= .9 && !over); cnt.classList.toggle("sn-full", over); box.classList.toggle("sn-over", over);
    cnt.style.opacity = p >= showFrom || over ? "" : "0"; cnt.style.transition = "opacity .2s, color .15s";
    if (over && !wasOver) nudge(cnt); wasOver = over;
    if (!txt) return;
    const m = over ? "over" : p >= .9 ? "left" : "n", num = over ? n - max : p >= .9 ? max - n : n;
    if (m !== mode) {
      mode = m; $(".sn-pre", txt).textContent = m === "over" ? tt("input.0") : m === "left" ? tt("input.1") : ""; $(".sn-suf", txt).textContent = m === "n" ? ` / ${max}` : tt("input.2");
      setRoll($(".sn-roll", txt), num);
      if (animate && !reduced()) txt.animate([{ opacity: .2, transform: "translateY(2px)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "cubic-bezier(0,0,.58,1)" });
    } else if (animate) roll($(".sn-roll", txt), num, m === "n" ? undefined : m === "over" ? 1 : -1); else setRoll($(".sn-roll", txt), num);
  };
  ta.addEventListener("input", () => update(true)); update(false);
  return update;
}
// mountLongText([data-ta] 容器, { onSubmit(text) })：自动长高 + 字数；⌘↵ / Ctrl+↵ 提交（超出字数时只抖一下计数）
export function mountLongText(box, { onSubmit } = {}) {
  if (!once(box, "_lt")) return;
  autoGrow(box); longCount(box);
  $("textarea", box).addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) { e.preventDefault(); box.classList.contains("sn-over") ? nudge($(".sn-ta-count", box)) : onSubmit?.($("textarea", box).value); }
  });
}
// ———— 4. 密码强度、大写锁定 ————
const LABELS = ["", "input.3", "input.4", "input.5", "input.6"]; // 用的时候再 t()
// mountPassword(<input data-pw>)：四段强度条 + 文字（不到 8 位提示还差几位）；大写锁定开着时提示
export function mountPassword(input) {
  if (!once(input, "_pw")) return;
  // 强度条、大写提示都是可选的（登录页只要显示 / 隐藏，不要强度条）
  const field = input.closest(".sn-field") || input.parentElement, meter = field && $(".sn-pw-meter", field), bars = meter ? $$("i", meter) : [], label = meter && $(".sn-pw-label .sn-roll", meter), caps = field && $(".sn-caps", field);
  let last = "", lastLv = 0;
  const score = (v) => {
    if (!v) return [0, "　"];
    if (v.length < 8) return [0, tt("input.7", { p0: 8 - v.length })];
    const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(v)).length;
    return [Math.min(4, 1 + (kinds >= 2) + (kinds >= 3 || v.length >= 12) + (kinds >= 3 && v.length >= 14)), ""];
  };
  if (meter) input.addEventListener("input", () => {
    const v = input.value, [lv, hint] = score(v), lit = lv || (v ? 1 : 0);
    meter.dataset.level = lv;
    bars.forEach((b, i) => { b.style.setProperty("transition-delay", `${i * 30}ms`); b.classList.toggle("sn-on", i < lit); });
    const text = hint || (LABELS[lv] && tt(LABELS[lv]));
    if (text !== last) { roll(label, text, lv >= lastLv ? 1 : -1); last = text; lastLv = lv; }
  });
  if (!caps) return;
  const capsCheck = (e) => caps.classList.toggle("sn-on", !!e.getModifierState?.("CapsLock"));
  input.addEventListener("keydown", capsCheck); input.addEventListener("keyup", capsCheck);
  input.addEventListener("blur", () => caps.classList.remove("sn-on"));
}
// ———— 5. 邮箱校验：停手 400ms 再判断，对了就画对勾；离开时还不对才报错 ————
const okMail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
// mountEmail(<input data-email>)：停手 400ms 再判断，对了画对勾；离开时还不对才在字段下方报错
export function mountEmail(input) {
  if (!once(input, "_em")) return;
  const mark = $(".sn-ok-mark", input.closest(".sn-ib")), field = input.closest(".sn-field"); let t = 0;
  input.addEventListener("input", () => { clearTimeout(t); if (!okMail(input.value)) mark.classList.remove("sn-on"); t = setTimeout(() => mark.classList.toggle("sn-on", okMail(input.value)), 400); });
  input.addEventListener("blur", () => { if (input.value.trim() && !okMail(input.value)) setErr(field, tt("input.8")); });
}
// ———— 6. 搜索：等待超过 300ms 才转圈，转了至少 500ms；结果数量淡入 ————
// mountSearch([data-search] 容器, { search })：search(q) 返回结果数量（或 Promise）；等待超过 300ms 才转圈、转了至少留 500ms；结果数量淡入
export function mountSearch(ib, { search = () => 0, debounce = 150 } = {}) {
  if (!once(ib, "_sr")) return;
  const input = $("input", ib), res = $(".sn-res-count", ib); let seq = 0;
  input.addEventListener("input", () => {
    const q = input.value.trim(), id = ++seq; ib.classList.remove("sn-has-res");
    if (!q) { ib.classList.remove("sn-loading"); return; }
    setTimeout(async () => {
      if (id !== seq) return;
      let shownAt = 0;
      const show = setTimeout(() => { if (id === seq) { ib.classList.add("sn-loading"); shownAt = performance.now(); } }, 300);
      let n = 0; try { n = await search(q); } catch { n = 0; }
      clearTimeout(show); if (id !== seq) return;
      const done = () => { if (id !== seq) return; ib.classList.remove("sn-loading"); const c = Array.isArray(n) ? n.length : Number(n) || 0; if (res) res.textContent = c ? tt("input.9", { p0: c }) : tt("input.10"); ib.classList.add("sn-has-res"); };
      shownAt ? setTimeout(done, Math.max(0, 500 - (performance.now() - shownAt))) : done();
    }, debounce);
  });
}
// ———— 7. 标签输入 ————
// mountTagInput([data-tagin] 容器, { initial: [], onChange(tags) })：回车或逗号加标签，重复的抖一下，超过 data-max 个不让加；
// 退格先"点亮"最后一个、再按才删；粘贴一串自动拆开。返回 { tags, add(text), clear() }
export function mountTagInput(box, { initial = [], onChange } = {}) {
  if (box._tags) return box._tags;
  const input = $("input", box), max = Number(box.dataset.max), foot = box.nextElementSibling, countBox = $(".sn-roll", foot);
  const chips = () => $$(".sn-chip", box), find = (t) => chips().find((c) => c.firstChild.textContent === t);
  let quiet = false; // set() 照外面给的值改时不回调 onChange
  const sync = () => { roll(countBox, chips().length); if (!quiet) onChange?.(chips().map((c) => c.firstChild.textContent)); };
  const disarm = () => chips().forEach((c) => c.classList.remove("sn-armed"));
  function add(raw, delay = 0) {
    const t = raw.trim(); if (!t) return;
    const dup = find(t); if (dup) { nudge(dup); return; }
    if (chips().length >= max) { nudge(foot.lastElementChild); return; }
    const c = document.createElement("span"); c.className = "sn-chip sn-tag sn-on"; c.innerHTML = `${esc(t)}<button class="sn-x" aria-label="${tt("input.11")}${esc(t)}" data-i="x"></button>`; injectIcons(c);
    box.insertBefore(c, input); sync();
    if (!reduced()) c.animate([{ opacity: 0, transform: "scale(.8)" }, { opacity: 1, transform: "none" }], { duration: 260, delay, easing: POP, fill: "backwards" });
  }
  function remove(c) {
    const done = () => { c.remove(); sync(); };
    if (reduced()) { done(); return; }
    // 先量好位置，再把它从排版里拿出来（绝对定位留在原处）；剩下的立刻补位（只用 transform 动），它自己原地缩小淡出
    const sibs = [...chips().filter((x) => x !== c), input], before = new Map(sibs.map((s) => [s, s.getBoundingClientRect()]));
    const br = box.getBoundingClientRect(), cr = c.getBoundingClientRect();
    Object.assign(c.style, { position: "absolute", left: cr.left - br.left - 1 + "px", top: cr.top - br.top - 1 + "px", pointerEvents: "none" });
    for (const s of sibs) { const a = before.get(s), b = s.getBoundingClientRect(); if (a.left !== b.left || a.top !== b.top) s.animate([{ transform: `translate(${a.left - b.left}px,${a.top - b.top}px)` }, { transform: "none" }], { duration: 300, easing: "linear(0, .32, .78, 1.04, 1.09, 1.06, 1.02, 1, .99, .99, 1)" }); }
    c.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.8)" }], { duration: 140, easing: EASE_IN, fill: "forwards" }).onfinish = done;
  }
  const commit = () => { const parts = input.value.split(/[,，、]/); input.value = parts.pop(); parts.forEach((p, i) => add(p, i * 40)); };
  input.addEventListener("input", (e) => { if (!e.isComposing && /[,，、]/.test(input.value)) commit(); disarm(); });
  input.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "Enter") { e.preventDefault(); add(input.value); input.value = ""; }
    else if (e.key === "Backspace" && !input.value && input.selectionStart === 0) {
      const lastChip = chips().at(-1); if (!lastChip) return; e.preventDefault();
      lastChip.classList.contains("sn-armed") ? remove(lastChip) : lastChip.classList.add("sn-armed");
    } else if (e.key !== "Shift") disarm();
  });
  input.addEventListener("paste", (e) => { const t = e.clipboardData.getData("text"); if (/[,，、\n]/.test(t)) { e.preventDefault(); t.split(/[,，、\n]/).forEach((s, i) => add(s, i * 40)); } });
  box.addEventListener("click", (e) => { const x = e.target.closest(".sn-x"); if (x) remove(x.closest(".sn-chip")); else if (e.target === box) input.focus(); });
  quiet = true; initial.forEach((t) => add(t)); sync(); quiet = false; // 一开始给的标签不算"改了"，不回调 onChange
  // set(list)：换成这些标签（受控同步用）：不在里面的直接去掉，缺的按顺序补上（补上的照常弹出来），不回调 onChange
  const set = (list) => { quiet = true; try { for (const c of chips()) if (!list.includes(c.firstChild.textContent)) c.remove(); for (const t of list) if (!find(String(t).trim())) add(String(t)); } finally { quiet = false; } roll(countBox, chips().length); };
  return (box._tags = { get tags() { return chips().map((c) => c.firstChild.textContent); }, add: (t) => add(t), clear: () => { chips().forEach((c) => c.remove()); sync(); }, set });
}
// ———— 8. 数字步进 ————
// mountStepper([data-stepper] 容器, { onChange(value) })：data-min / data-max / data-value；按住连发（400ms 起、越来越快）；
// 在数字上左右拖每 8px 一格；方向键一格、Shift 十格。返回 { value, set(v) }
export function mountStepper(st, { onChange } = {}) {
  if (st._step) return st._step;
  const min = Number(st.dataset.min), max = Number(st.dataset.max), val = $(".sn-st-val", st), box = $(".sn-roll", val), [dec, inc] = $$(".sn-st-btn", st);
  let v = Number(st.dataset.value);
  const sync = () => { dec.setAttribute("aria-disabled", String(v <= min)); inc.setAttribute("aria-disabled", String(v >= max)); val.setAttribute("aria-valuenow", v); val.setAttribute("aria-valuemin", min); val.setAttribute("aria-valuemax", max); };
  // quiet：照外面给的值改（受控同步用），不回调 onChange
  const set = (nv, quiet) => { nv = Math.max(min, Math.min(max, nv)); if (nv === v) { if (!quiet) nudge(val); return false; } roll(box, nv, nv > v ? 1 : -1); v = nv; sync(); if (!quiet) onChange?.(v); return true; };
  for (const b of [dec, inc]) {
    const d = Number(b.dataset.d); let t = 0;
    const stop = () => clearTimeout(t);
    // 按住连发：400ms 后开始，之后每次间隔乘 0.8，最快 50ms 一次；到边界就停
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; e.preventDefault(); if (!set(v + d)) return;
      let delay = 400; const rep = () => { if (!set(v + d)) return; delay = Math.max(50, delay * .8); t = setTimeout(rep, delay); }; t = setTimeout(rep, delay);
    });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, stop);
    b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); set(v + d); } });
  }
  val.addEventListener("keydown", (e) => {
    const k = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]; if (!k) return;
    e.preventDefault(); set(v + k * (e.shiftKey ? 10 : 1));
  });
  // 在数字上左右拖：每 8px 走一格
  val.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; val.setPointerCapture(e.pointerId); const x0 = e.clientX, v0 = v;
    const mv = (ev) => { const nv = Math.max(min, Math.min(max, v0 + Math.round((ev.clientX - x0) / 8))); if (nv !== v) { roll(box, nv, nv > v ? 1 : -1); v = nv; sync(); onChange?.(v); } };
    const up = () => { val.removeEventListener("pointermove", mv); val.removeEventListener("pointerup", up); };
    val.addEventListener("pointermove", mv); val.addEventListener("pointerup", up);
  });
  sync();
  return (st._step = { get value() { return v; }, set: (nv, quiet) => set(nv, quiet) });
}
// ———— 9. 提示词输入框 ————
// mountComposer([data-composer] 容器, { onSend, onStop, upload })：提示词输入框——自动长高、字数、附件（拖进来、粘贴截图、附件菜单）。
//   onSend({ text, files }) 返回 Promise：发送后进入"生成中"（发送键变停止），Promise 结束回到可发送；
//   onStop()：生成中点停止；upload(file, onProgress) 返回 Promise：真上传（不给就是演示用的假进度）。
//   不给 onSend、写了 data-external：发送 / 停止改成在容器上发 compose / compose-stop 事件（对话组件就这样接）。
//   返回 { setBusy(on), clear({ smooth }), files() }
export function mountComposer(box, { onSend, onStop, upload: realUpload, attachments, voice, submitKey, onModelChange, onModeChange, onContextChange, onContextClick } = {}) {
  if (box._cm) return box._cm;
  // 输入框里的菜单（附件、模型）自己接上：用 createComposer / createChat 渲染出来的输入框，页面不一定调过 bindForms；已经接过的不重复接
  for (const h of box.querySelectorAll(".sn-select")) mountSelect(h);
  const card = $(".sn-cm-card", box) || box;
  const ta = $("textarea", box), send = $(".sn-cm-send", box), files = $(".sn-cm-files", box), swap = $(".sn-swap", send);
  autoGrow(box); const upd = longCount(box, { showFrom: .5 });
  // 点击输入框卡片或底栏空白区（如按钮右侧的 .sn-grow）：不拦截外部关闭逻辑，并顺滑将光标放回输入框
  card.addEventListener("pointerdown", (e) => {
    const t = e.target;
    if (t === card || t === box || t.classList?.contains("sn-cm-bar") || t.classList?.contains("sn-grow")) {
      e.preventDefault();
      ta.focus();
    }
  });
  // 附件多了横向滚动：不显示滚动条（会压在附件上），只靠左右渐隐；竖滚轮也能横着滚；滚到头回弹
  scrollArea(files, { fade: "x", size: 20, bar: "none", wheel: "x", overscroll: "bounce" });
  // 就地提示：附件太大、上传失败时，在附件条下面写一行红字（留 5 秒）；同时被拒的几个合成一句
  const note = document.createElement("div"); note.className = "sn-cm-note"; note.setAttribute("role", "status");
  note.innerHTML = '<div><p><span data-i="circle-alert"></span><span class="sn-tx"></span></p></div>'; injectIcons(note);
  (files.closest(".sn-sa") || files).after(note);
  let noteT = 0, rejected = [];
  const notify = (text) => { $(".sn-tx", note).textContent = text; note.classList.add("sn-on"); clearTimeout(noteT); noteT = setTimeout(() => { note.classList.remove("sn-on"); rejected = []; }, 5000); };
  const reject = (name, why) => { rejected.push(name); notify(rejected.length > 1 ? tt("input.12", { p0: rejected.length, p1: why }) : tt("input.13", { p0: midEllipsis(name, 22), p1: why })); };
  // data-external：发送和停止交给外面处理（比如聊天框），输入框只管三种状态；生成中仍然可以接着写下一条
  const external = box.hasAttribute("data-external"), idleLabel = send.getAttribute("aria-label") || tt("input.14");
  const normSubmitKey = (v) => (v === "mod-enter" ? "mod-enter" : "enter");
  let curSubmitKey = normSubmitKey(submitKey ?? box.dataset.submitKey ?? "enter");
  let idleKbd = curSubmitKey === "mod-enter" ? "⌘↵" : "↵";
  send.dataset.kbd = idleKbd;
  const setSubmitKey = (mode) => {
    curSubmitKey = normSubmitKey(mode);
    idleKbd = curSubmitKey === "mod-enter" ? "⌘↵" : "↵";
    if (!busy) { send.dataset.kbd = idleKbd; retip(send); }
  };
  let busy = false, timer = 0, fileN = 0;
  // 有文字或有附件就能发；超出字数不能发。正在收起的附件（.sn-leaving）不算
  const kept = () => [...files.children].filter((f) => !f.classList.contains("sn-leaving"));
  const sync = () => {
    const fs = kept(), waiting = fs.some((f) => !f.classList.contains("sn-done")), failed = fs.some((f) => f.classList.contains("sn-fail"));
    const ready = (!!ta.value.trim() || fs.length > 0) && !waiting && !box.classList.contains("sn-over");
    send.classList.toggle("sn-ready", ready && !busy); send.setAttribute("aria-disabled", String(!ready && !busy));
    if (!busy) send.dataset.tip = failed ? tt("input.15") : waiting ? tt("input.16") : idleLabel;
    retip(send); // 提示正开着（指针停在按钮上）就当场换成新状态的字
  };
  const setBusy = (on) => {
    if (on && voiceState.on) stopVoice(false);
    busy = on; box.classList.toggle("sn-busy", on && !external); send.classList.toggle("sn-busy", on); swap.classList.toggle("sn-on", on); ta.readOnly = on && !external;
    send.setAttribute("aria-label", on ? tt("input.17") : idleLabel); send.dataset.tip = on ? tt("input.17") : idleLabel;
    // 生成中 ⌘↵ 停不了（键盘只晃一下停止按钮），提示里就不带快捷键；回到能发送再带上
    if (idleKbd) { if (on) delete send.dataset.kbd; else send.dataset.kbd = idleKbd; }
    if (!on) clearTimeout(timer); sync();
  };
  const reset = () => { setBusy(false); ta.focus({ preventScroll: true }); };
  // 键盘提交：生成中不停止也不发送（停止是破坏性操作，只能点按钮），只轻轻晃一下停止按钮提示
  const start = (fromKey = false) => {
    if (voiceState.on) stopVoice(false);
    if (busy && fromKey === true) { nudge(send); return; }
    if (busy) { if (onStop) onStop(); else if (external) box.dispatchEvent(new CustomEvent("compose-stop")); reset(); return; }
    if (!send.classList.contains("sn-ready")) { if (box.classList.contains("sn-over")) nudge($(".sn-ta-count", box)); else ta.focus(); return; }
    if (external && !onSend) { box.dispatchEvent(new CustomEvent("compose", { detail: { text: ta.value } })); return; }
    setBusy(true); send.classList.remove("sn-ready");
    const run = onSend ? onSend({ text: ta.value, files: kept() }) : null;
    if (run?.then) run.then(() => { if (busy) reset(); }, () => { if (busy) reset(); });
  };
  // 清空。smooth：发送时用——附件淡出、附件行和输入框一起平滑收起（时长、曲线和外面的飞行一致），占位提示等发出去的内容离开后再淡入
  const clear = ({ smooth = false, dur = 380, ease = "ease-out", phHold = 260 } = {}) => {
    ta.value = "";
    if (!smooth || reduced()) { files.innerHTML = ""; ta.dispatchEvent(new Event("input")); return; }
    ta.style.transition = `height ${dur}ms ${ease}`; setTimeout(() => (ta.style.transition = ""), dur + 40);
    ta.classList.add("sn-ph-hold"); setTimeout(() => ta.classList.remove("sn-ph-hold"), phHold);
    const out = kept();
    if (out.length) {
      const h = files.offsetHeight, pt = getComputedStyle(files).paddingTop;
      for (const f of out) { f.classList.add("sn-leaving"); f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-out", fill: "forwards" }); }
      files.style.overflow = "hidden";
      files.animate([{ height: h + "px", paddingTop: pt }, { height: "0px", paddingTop: "0px" }], { duration: dur, easing: ease }).onfinish = () => {
        for (const f of out) f.remove(); files.style.overflow = ""; sync();
      };
    }
    ta.dispatchEvent(new Event("input"));
  };
  // ———— 语音输入：一键开麦 / 再点停止，按钮原地切换为 4 根灵动微声纹，文字实时落入输入框（零冗余确认/取消弹窗） ————
  const voiceEnabled = voice !== false && box.dataset.voice !== "off";
  const bar = $(".sn-cm-bar", box);
  let micBtn = $("[data-cm-voice]", box);
  if (voiceEnabled && !micBtn && bar && send) {
    micBtn = document.createElement("button");
    micBtn.type = "button"; micBtn.className = "sn-btn sn-ghost sn-sm sn-ibtn sn-cm-mic";
    micBtn.setAttribute("data-cm-voice", ""); micBtn.dataset.tip = tt("input.voice");
    micBtn.setAttribute("aria-label", tt("input.voice")); micBtn.setAttribute("aria-pressed", "false");
    micBtn.innerHTML = `<span class="sn-swap"><span class="sn-a" data-i="mic"></span><span class="sn-b"><span class="sn-cm-vw" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span></span>`;
    send.before(micBtn); injectIcons(micBtn);
  }
  const VBARS = 4;
  const micSwap = micBtn && $(".sn-swap", micBtn), vBars = micBtn ? $$(".sn-cm-vw i", micBtn) : [];
  const voiceState = { on: false, base: "", sep: "", final: "", interim: "", t0: 0, raf: 0, demoT: 0, demoIdx: 0, demoPos: 0, demoText: "", rec: null, stream: null, actx: null, analyser: null, freq: null, levels: new Float32Array(VBARS) };
  const applyVoiceText = (str) => {
    ta.value = voiceState.base + (str ? voiceState.sep + str : "");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.scrollTop = ta.scrollHeight;
  };
  const stopVoiceMedia = () => {
    cancelAnimationFrame(voiceState.raf); voiceState.raf = 0;
    clearTimeout(voiceState.demoT); voiceState.demoT = 0;
    try { voiceState.rec?.abort?.(); } catch { /* ignore */ }
    voiceState.rec = null;
    if (voiceState.stream) { for (const tr of voiceState.stream.getTracks()) tr.stop(); voiceState.stream = null; }
    if (voiceState.actx) { voiceState.actx.close?.().catch?.(() => {}); voiceState.actx = null; }
    voiceState.analyser = null; voiceState.freq = null;
  };
  const runDemoDictation = () => {
    if (!voiceState.on || voiceState.demoT) return;
    const pool = [tt("input.voiceDemo0"), tt("input.voiceDemo1"), tt("input.voiceDemo2")];
    voiceState.demoText = pool[voiceState.demoIdx++ % pool.length];
    voiceState.demoPos = 0;
    const step = () => {
      if (!voiceState.on) return;
      const take = 1 + ((voiceState.demoPos * 7) % 3);
      voiceState.demoPos = Math.min(voiceState.demoText.length, voiceState.demoPos + take);
      voiceState.final = voiceState.demoText.slice(0, voiceState.demoPos);
      applyVoiceText(voiceState.final);
      if (voiceState.demoPos < voiceState.demoText.length) {
        const ch = voiceState.final.at(-1);
        const pause = /[，。、,.]/.test(ch) ? 240 : 90 + ((voiceState.demoPos * 19) % 65);
        voiceState.demoT = setTimeout(step, pause);
      } else {
        voiceState.demoT = setTimeout(() => { if (voiceState.on) stopVoice(false); }, 500);
      }
    };
    voiceState.demoT = setTimeout(step, 300);
  };
  const animateWave = (now) => {
    if (!voiceState.on) return;
    voiceState.raf = requestAnimationFrame(animateWave);
    if (reduced()) {
      const st = [.45, .85, .65, .45];
      for (let i = 0; i < VBARS; i++) vBars[i].style.transform = `scaleY(${st[i]})`;
      return;
    }
    const t = (now - voiceState.t0) * .001;
    let hasAudio = false;
    if (voiceState.analyser && voiceState.freq) {
      voiceState.analyser.getByteFrequencyData(voiceState.freq);
      let sum = 0;
      for (let k = 2; k < 24; k++) sum += voiceState.freq[k];
      hasAudio = sum > 24;
    }
    const WEIGHT = [.68, 1, .92, .68], PHASE = [0, 1.7, 3.3, 4.9];
    for (let i = 0; i < VBARS; i++) {
      let target;
      if (hasAudio) {
        const idx = 3 + i * 5;
        target = Math.min(1, .28 + (voiceState.freq[idx] / 190) * WEIGHT[i]);
      } else {
        const wave = .54 + .32 * Math.sin(t * 7.2 + PHASE[i]) + .14 * Math.cos(t * 11.4 - PHASE[i]);
        target = Math.max(.26, Math.min(1, (.24 + wave * .76) * WEIGHT[i]));
      }
      const prev = voiceState.levels[i] || .35;
      const cur = prev + (target - prev) * .32;
      voiceState.levels[i] = cur;
      vBars[i].style.transform = `scaleY(${cur.toFixed(3)})`;
    }
  };
  function stopVoice(cancel = false) {
    if (!voiceState.on) return;
    voiceState.on = false;
    stopVoiceMedia();
    box.classList.remove("sn-recording");
    micBtn?.classList.remove("sn-on");
    micSwap?.classList.remove("sn-on");
    if (micBtn) {
      micBtn.setAttribute("aria-pressed", "false");
      micBtn.setAttribute("aria-label", tt("input.voice"));
      micBtn.dataset.tip = tt("input.voice");
      retip(micBtn);
    }
    if (cancel) {
      ta.value = voiceState.base;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
    ta.focus({ preventScroll: true });
    const n = ta.value.length; ta.setSelectionRange(n, n);
    sync();
  }
  function startVoice() {
    if (!voiceEnabled || busy) return;
    if (voiceState.on) { stopVoice(false); return; }
    voiceState.on = true;
    voiceState.base = ta.value;
    voiceState.sep = ta.value && !/[\s，。！？,.!?]$/.test(ta.value) ? " " : "";
    voiceState.final = ""; voiceState.interim = ""; voiceState.demoText = "";
    voiceState.t0 = performance.now();
    voiceState.levels.fill(.35);
    box.classList.add("sn-recording");
    micBtn?.classList.add("sn-on");
    micSwap?.classList.add("sn-on");
    if (micBtn) {
      micBtn.setAttribute("aria-pressed", "true");
      micBtn.setAttribute("aria-label", tt("input.voiceStop"));
      micBtn.dataset.tip = tt("input.voiceStop");
      retip(micBtn);
    }
    voiceState.raf = requestAnimationFrame(animateWave);

    // 优先接真实麦克风 + Web Speech API；无权限 / 非安全源 / 不支持时无缝切入拟真听写体验
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    let speechStarted = false;
    if (SR) {
      try {
        const rec = new SR();
        rec.lang = document.documentElement.lang || "zh-CN";
        rec.continuous = true; rec.interimResults = true;
        rec.onresult = (ev) => {
          if (!voiceState.on) return;
          clearTimeout(voiceState.demoT); voiceState.demoT = 0;
          let fin = "", inter = "";
          for (let i = 0; i < ev.results.length; i++) {
            const r = ev.results[i];
            if (r.isFinal) fin += r[0].transcript; else inter += r[0].transcript;
          }
          voiceState.final = fin; voiceState.interim = inter;
          applyVoiceText((fin + inter).trim());
        };
        rec.onerror = () => { if (voiceState.on && !voiceState.final && !voiceState.interim) runDemoDictation(); };
        rec.start(); voiceState.rec = rec; speechStarted = true;
      } catch { speechStarted = false; }
    }
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        if (!voiceState.on) { for (const tr of stream.getTracks()) tr.stop(); return; }
        voiceState.stream = stream;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          const actx = new AC(), src = actx.createMediaStreamSource(stream), analyser = actx.createAnalyser();
          analyser.fftSize = 64; analyser.smoothingTimeConstant = .72;
          src.connect(analyser);
          voiceState.actx = actx; voiceState.analyser = analyser; voiceState.freq = new Uint8Array(analyser.frequencyBinCount);
        }
        if (!speechStarted) runDemoDictation();
      }).catch(() => {
        if (voiceState.on && !voiceState.final && !voiceState.interim) runDemoDictation();
      });
    } else if (!speechStarted) {
      runDemoDictation();
    }
  }
  micBtn?.addEventListener("click", () => startVoice());
  box.addEventListener("keydown", (e) => {
    if (voiceState.on && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); stopVoice(false); }
  });
  onCleanup(() => stopVoice(true));
  box._cm = { setBusy, clear, files: kept, startVoice, stopVoice, setSubmitKey };
  // 填一段字进输入框（新对话的建议、程序里预填）：长高、计数、发送按钮跟着变，光标放到最后；字淡入
  box._cm.fill = (text) => {
    ta.value = String(text ?? ""); ta.dispatchEvent(new Event("input", { bubbles: true })); ta.focus({ preventScroll: true }); const n = ta.value.length; ta.setSelectionRange(n, n);
    if (!reduced()) ta.animate([{ opacity: .2 }, { opacity: 1 }], { duration: 240, easing: "cubic-bezier(0,0,.58,1)" });
  };
  // 选择类的部件（模型、模式、上下文栏里能点开的那项）：用户在菜单里选了 → 打勾、按钮上的字平滑换掉、发事件；程序里设（受控的值换了）不发事件
  const picks = (kind) => [...box.querySelectorAll(`.sn-cm-pick[data-pick="${kind}"]`)];
  // 底部一行不折行，发送按钮永远在最右：放不下全名（全名被省略了、或者一行撑出去了）就收起——模型只显示档位（"精细"），
  // 风格这种文字按钮收成图标；再放不下（320 宽这种，档位也被省略了）：底部一行收紧一点（左右留白、用量环和权限标签的间距），一般就够了
  const cut = (el) => el && el.scrollWidth > el.clientWidth + 0.5;
  const over = () => cut(bar) || [...box.querySelectorAll(".sn-cm-bar .sn-cm-lbl:not(.sn-cm-lbl-s)")].some((l) => l.offsetParent && cut(l));
  const fitModel = () => {
    if (!bar || !box.querySelector(".sn-cm-bar .sn-cm-lbl")) return;
    box.classList.remove("sn-cm-compact", "sn-cm-tight");
    if (!over()) return;
    box.classList.add("sn-cm-compact");
    if (over() || cut($(".sn-cm-model .sn-cm-lbl-s", box))) box.classList.add("sn-cm-tight");
  };
  // 老写法（设计稿里的标记）：风格按钮、模型按钮的字直接写在按钮里——包成能收起的两段（风格：图标 + 字；模型：全名 + 档位），一行放不下时收起
  const styleBtn0 = $("[data-cm-style]", box), modelBtn0 = $("[data-cm-model]", box);
  if (styleBtn0 && !styleBtn0.querySelector(".sn-cm-lbl")) { const t = styleBtn0.textContent; styleBtn0.innerHTML = `<span class="sn-cm-ic" data-i="palette" aria-hidden="true"></span><span class="sn-cm-lbl"></span>`; styleBtn0.lastChild.textContent = t; if (!styleBtn0.getAttribute("aria-label")) styleBtn0.setAttribute("aria-label", t); injectIcons(styleBtn0); }
  if (modelBtn0 && !modelBtn0.querySelector(".sn-cm-lbl")) { const tn = modelBtn0.firstChild; if (tn?.nodeType === 3) { const full = tn.textContent.trim(), l = document.createElement("span"), s = document.createElement("span"); l.className = "sn-cm-lbl"; l.innerHTML = modelLabelHTML(full); s.className = "sn-cm-lbl sn-cm-lbl-s"; s.setAttribute("aria-hidden", "true"); s.textContent = shortOf({ label: full }); tn.replaceWith(l, s); if (!modelBtn0.getAttribute("aria-label")) modelBtn0.setAttribute("aria-label", full); } }
  if (bar && box.querySelector(".sn-cm-bar .sn-cm-lbl")) { new ResizeObserver(fitModel).observe(box); fitModel(); }
  const choose = (pick, v, quiet) => {
    const items = [...pick.querySelectorAll(".sn-menu .sn-item")], it = items.find((x) => x.dataset.v === String(v)); if (!it) return false;
    for (const x of items) { x.classList.toggle("sn-sel", x === it); x.setAttribute("aria-checked", String(x === it)); }
    const btn = pick.querySelector("[data-menubtn]"), full = it.querySelector(".sn-tx").textContent;
    if (pick.dataset.pick === "model") {
      // 全名、档位两个都换（看得见的那个带动画），读屏名跟着全名；换完量一下全名放不放得下
      const compact = box.classList.contains("sn-cm-compact");
      swapLabel(btn.querySelector(".sn-cm-lbl:not(.sn-cm-lbl-s)"), full, !quiet && !compact, modelLabelHTML(full));
      swapLabel(btn.querySelector(".sn-cm-lbl-s"), it.dataset.short || full, !quiet && compact);
      btn.setAttribute("aria-label", full); fitModel();
    } else swapLabel(btn.querySelector(".sn-cm-lbl"), full, !quiet);
    if (pick.dataset.pick === "mode") { const dot = it.querySelector(".sn-cm-dot"); for (const t of Object.values(TONES)) btn.classList.remove(t.trim()); for (const t of Object.values(TONES)) if (dot?.classList.contains(t.trim())) btn.classList.add(t.trim()); }
    return true;
  };
  box.addEventListener("select", (e) => {
    const pick = e.target.closest?.(".sn-cm-pick"); if (!pick || !box.contains(pick)) return;
    const v = e.detail.value; if (!choose(pick, v)) return;
    if (pick.dataset.pick === "model") onModelChange?.(v);
    else if (pick.dataset.pick === "mode") onModeChange?.(v);
    else onContextChange?.({ index: +pick.dataset.ctx, value: v });
  });
  box._cm.setModel = (v) => { for (const p of picks("model")) choose(p, v, true); };
  box._cm.setModeValue = (v) => { for (const p of picks("mode")) choose(p, v, true); };
  box._cm.setContextValue = (index, v) => { const p = box.querySelector(`.sn-cm-pick[data-pick="ctx"][data-ctx="${index}"]`); if (p) choose(p, v, true); };
  box.addEventListener("click", (e) => { const c = e.target.closest(".sn-cm-ctx-i"); if (c && box.contains(c) && !c.hasAttribute("data-menubtn")) onContextClick?.(+c.dataset.ctx); });
  // 上下文栏、模式标签、模型列表的结构换了（框架里的属性变了，不只是选中项）：只换那一块
  const swapPart = (old, html, place) => { const t = document.createElement("template"); t.innerHTML = html; const el = t.content.firstElementChild; if (el) injectIcons(el); if (old) { if (el) old.replaceWith(el); else old.remove(); } else if (el) place(el); if (el) for (const h of [el, ...el.querySelectorAll(".sn-select")]) if (h.matches(".sn-select")) mountSelect(h); return el; };
  box._cm.setContext = (context) => { swapPart($(".sn-cm-ctx", box), cmContextHTML(context), (el) => box.prepend(el)); box.classList.toggle("sn-has-ctx", !!context?.length); };
  box._cm.setMode = (mode) => swapPart($(".sn-cm-bar > .sn-cm-mode, .sn-cm-bar > .sn-cm-pick[data-pick=\"mode\"]", box), cmModeHTML(mode), (el) => $(".sn-cm-bar > .sn-grow", box).before(el));
  box._cm.setModels = (models, model) => { swapPart($(".sn-cm-models", box), cmModelsHTML(models, model), (el) => $(".sn-cm-bar > .sn-grow", box).after(el)); fitModel(); };
  ta.addEventListener("input", sync);
  ta.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
    if (curSubmitKey === "mod-enter") {
      if (e.metaKey || e.ctrlKey) { e.preventDefault(); start(true); }
    } else if (!e.shiftKey && !e.altKey) {
      e.preventDefault(); start(true);
    }
  });
  send.addEventListener("click", () => start());
  // ———— 附件：图片、视频（缩略图块），音频、文档（条）。加进来先上传，传完才能发；可以拖进来，也可以粘贴截图 ————
  const X = tt("input.18");
  const tileHTML = (f) => `<span class="sn-clip"><span class="sn-th"></span>${f.kind === "vid" ? `<span class="sn-play" data-i="play"></span><span class="sn-dur">${f.dur}</span>` : ""}<span class="sn-up"><span class="sn-pring"></span><span class="sn-ic sn-re" data-i="refresh-cw"></span><span class="sn-ic sn-al" data-i="circle-alert"></span></span></span>${X}`;
  const barHTML = (f) => f.kind === "aud"
    ? `<button class="sn-ap" type="button" aria-label="${tt("input.19")}"><span class="sn-swap"><span class="sn-a" data-i="play"></span><span class="sn-b" data-i="pause"></span></span></button><span class="sn-meta"><b class="sn-fname">${esc(midEllipsis(f.name))}</b><span class="sn-wfl"><span class="sn-wf">${waveBars(22, f.seed)}<span class="sn-wf-on">${waveBars(22, f.seed)}</span></span><span class="sn-st">${f.dur}</span></span></span><span class="sn-pb"><i></i></span>${X}`
    : `<span class="sn-ext-card">${f.ext}</span><span class="sn-meta"><b class="sn-fname">${esc(midEllipsis(f.name))}</b><span class="sn-st">${f.ext} · ${fmtSize(f.size)}</span></span><span class="sn-pb"><i></i></span>${X}`;
  const metaOf = (el) => (el.dataset.kind === "aud" ? el.dataset.dur : `${el.dataset.ext} · ${fmtSize(+el.dataset.size)}`);
  const setMeta = (el, msg) => { const st = $(".sn-st", el); if (st) st.textContent = msg || metaOf(el); el.title = msg || ""; };
  function addFile(f, file) {
    const el = document.createElement("span"), tile = f.kind === "img" || f.kind === "vid"; el._file = file;
    el.className = `sn-cm-file sn-k-${f.kind} ${tile ? "sn-tile" : "sn-bar"}`;
    Object.assign(el.dataset, { kind: f.kind, name: f.name, size: String(Math.round(f.size)), dur: f.dur || "", ext: f.ext || "", seed: String(f.seed || 1) });
    if (f.g) el.style.setProperty("--sn-g", f.g);
    el.innerHTML = tile ? tileHTML(f) : barHTML(f); injectIcons(el); files.append(el);
    if (!reduced()) el.animate([{ opacity: 0, transform: "scale(.88) translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: POP });
    requestAnimationFrame(() => files.scrollTo({ left: files.scrollWidth, behavior: reduced() ? "auto" : "smooth" }));
    if (f.bad) { el.classList.add("sn-bad", "sn-leaving"); setMeta(el, f.bad + tt("input.20")); el.title = f.bad; reject(f.name, f.bad); setTimeout(() => nudge(el), 260); sync(); setTimeout(() => removeFile(el), 2600); return; }
    upload(el, f.failAt); sync();
  }
  // 上传（演示）：进度一阵一阵地走；failAt 到了就失败，点一下重传
  function upload(el, failAt = 0) {
    clearTimeout(el._t); el.classList.remove("sn-fail", "sn-done"); el.style.setProperty("--sn-p", 0); let p = 0; sync();
    if (realUpload && el._file) { // 真上传：进度由 upload 报，结束就完成，出错就失败（点一下重试）
      realUpload(el._file, (q) => { el.style.setProperty("--sn-p", q); if (el.dataset.kind === "doc") setMeta(el, tt("input.21", { p0: Math.round(q * 100) })); })
        .then(() => { if (!el.isConnected) return; el.style.setProperty("--sn-p", 1); el.classList.add("sn-done"); setMeta(el, null); sync(); },
              () => { if (!el.isConnected) return; el.classList.add("sn-fail"); setMeta(el, tt("input.22")); notify(tt("input.23", { p0: midEllipsis(el.dataset.name, 22) })); sync(); });
      return;
    }
    const step = () => {
      if (!el.isConnected) return; p = Math.min(1, p + .07 + Math.random() * .1);
      if (failAt && p >= failAt) { el.classList.add("sn-fail"); setMeta(el, tt("input.22")); notify(tt("input.23", { p0: midEllipsis(el.dataset.name, 22) })); sync(); return; }
      el.style.setProperty("--sn-p", p); if (el.dataset.kind === "doc") setMeta(el, tt("input.21", { p0: Math.round(p * 100) }));
      if (p >= 1) { el.classList.add("sn-done"); setMeta(el, null); sync(); return; }
      el._t = setTimeout(step, 130 + Math.random() * 140);
    };
    el._t = setTimeout(step, 160);
  }
  // 移除：被移除的那个先脱离布局、缩小淡出，后面的往左补位；移掉的是最后一个时，整行一起平滑收起
  function removeFile(el) {
    if (!el.isConnected || el._gone) return; el._gone = true; clearTimeout(el._t); el._a?.cancel();
    const rest = [...files.children].filter((x) => x !== el && !x._gone);
    if (reduced()) { el.remove(); sync(); return; }
    el.classList.add("sn-leaving");
    if (!rest.length) {
      const h = files.offsetHeight, pt = getComputedStyle(files).paddingTop; files.style.overflow = "hidden";
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: EASE_IN, fill: "forwards" });
      files.animate([{ height: h + "px", paddingTop: pt }, { height: "0px", paddingTop: "0px" }], { duration: 240, easing: IN_OUT }).onfinish = () => { el.remove(); files.style.overflow = ""; sync(); };
      sync(); return;
    }
    const before = new Map(rest.map((x) => [x, x.getBoundingClientRect().left])), r = el.getBoundingClientRect(), pr = files.getBoundingClientRect();
    Object.assign(el.style, { position: "absolute", left: r.left - pr.left + files.scrollLeft + "px", top: r.top - pr.top + "px", margin: "0" });
    el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.86)" }], { duration: 160, easing: EASE_IN, fill: "forwards" }).onfinish = () => { el.remove(); sync(); };
    for (const x of rest) { const dx = before.get(x) - x.getBoundingClientRect().left; if (Math.abs(dx) > .5) x.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 280, easing: EASE_CSS.outStrong }); }
    sync();
  }
  // 音频试听：播放键变暂停，波形从左往右被"填亮"
  function toggleAudio(el) {
    const on = !el.classList.contains("sn-playing"); el.classList.toggle("sn-playing", on); $(".sn-swap", el).classList.toggle("sn-on", on);
    if (!el._a) {
      el._a = $(".sn-wf-on", el).animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: 6000, easing: "linear", fill: "both" });
      el._a.onfinish = () => { el.classList.remove("sn-playing"); $(".sn-swap", el).classList.remove("sn-on"); el._a.cancel(); el._a = null; };
    } else if (on) el._a.play(); else el._a.pause();
  }
  files.addEventListener("click", (e) => {
    const x = e.target.closest(".sn-x"); if (x) { removeFile(x.closest(".sn-cm-file")); return; }
    const ap = e.target.closest(".sn-ap"); if (ap) { toggleAudio(ap.closest(".sn-cm-file")); return; }
    const f = e.target.closest(".sn-cm-file.sn-fail"); if (f) upload(f);
  });
  // 附件菜单（[data-add] 的条目）：优先用 attachments[键](计数器)；未传演示回调时打开原生系统文件选择器，真选本地文件
  const counter = { get n() { return fileN; }, set n(v) { fileN = v; } };
  const ACCEPT = { img: "image/*", vid: "video/*", aud: "audio/*", doc: ".pdf,.doc,.docx,.txt,.md,.csv,.json" };
  box.addEventListener("click", (e) => {
    const it = e.target.closest(".sn-menu .sn-item[data-add]");
    if (!it || !box.contains(it)) return;
    const k = it.dataset.add;
    if (attachments?.[k]) { addFile(attachments[k](counter)); return; }
    if (!ACCEPT[k]) return;
    const inp = document.createElement("input");
    inp.type = "file"; inp.multiple = true; inp.accept = ACCEPT[k];
    inp.onchange = () => { for (const file of inp.files || []) addReal(file); };
    inp.click();
  });
  // 真文件：拖进来、粘贴。图片直接用本地预览；音视频读一下时长
  const kindOf = (file) => (file.type.startsWith("image/") ? "img" : file.type.startsWith("video/") ? "vid" : file.type.startsWith("audio/") ? "aud" : "doc");
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  function addReal(file) {
    const kind = kindOf(file), url = URL.createObjectURL(file);
    const f = { kind, name: file.name, size: file.size, ext: (file.name.split(".").pop() || "FILE").slice(0, 4).toUpperCase(), dur: "0:00", seed: ++fileN, g: kind === "img" ? `url("${url}") center / cover` : "" };
    if (file.size > 2 * 1024 ** 3) f.bad = tt("input.24");
    addFile(f, file);
    if (kind === "vid" || kind === "aud") { const m = document.createElement(kind === "vid" ? "video" : "audio"); m.preload = "metadata"; m.src = url;
      m.onloadedmetadata = () => { const el = [...files.children].find((x) => x.dataset.seed === String(f.seed)); if (!el || !isFinite(m.duration)) return; el.dataset.dur = clock(m.duration); const d = $(".sn-dur", el) || $(".sn-st", el); if (d && (kind === "vid" || el.classList.contains("sn-done"))) d.textContent = el.dataset.dur; }; }
  }
  let dragN = 0; const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  box.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); if (dragN++ === 0) box.classList.add("sn-drop"); });
  box.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  box.addEventListener("dragleave", () => { if (--dragN <= 0) { dragN = 0; box.classList.remove("sn-drop"); } });
  box.addEventListener("drop", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragN = 0; box.classList.remove("sn-drop"); for (const file of e.dataTransfer.files) addReal(file); });
  ta.addEventListener("paste", (e) => { const fs = [...(e.clipboardData?.files || [])]; if (!fs.length) return; e.preventDefault(); fs.forEach(addReal); });
  const styles = [tt("input.25"), tt("input.26"), tt("input.27"), tt("input.28")]; let si = 0; const styleBtn = $("[data-cm-style]", box);
  styleBtn?.addEventListener("click", () => { si = (si + 1) % styles.length; const st = tt("input.29", { p0: styles[si] }); styleBtn.lastChild.textContent = st; styleBtn.setAttribute("aria-label", st); if (!reduced()) styleBtn.animate([{ opacity: .4 }, { opacity: 1 }], { duration: 200, easing: "cubic-bezier(0,0,.58,1)" }); });
  const models = [tt("input.30"), tt("input.31")]; let mi = 0; const modelBtn = $("[data-cm-model]", box);
  modelBtn?.addEventListener("click", () => { mi = (mi + 1) % models.length; const ml = modelBtn.querySelector(".sn-cm-lbl:not(.sn-cm-lbl-s)"), ms = modelBtn.querySelector(".sn-cm-lbl-s"); if (ml) { ml.textContent = tt("input.32", { p0: models[mi] }); if (ms) ms.textContent = models[mi]; modelBtn.setAttribute("aria-label", ml.textContent); } else modelBtn.firstChild.textContent = tt("input.32", { p0: models[mi] }); fitModel(); if (!reduced()) modelBtn.animate([{ opacity: .4 }, { opacity: 1 }], { duration: 200, easing: "cubic-bezier(0,0,.58,1)" }); });
  sync(); upd(false);
  return box._cm;
}
// ———— 写在标记上：一次接上 ————
// bindInputs(root = document)：data-count、data-ta、data-pw、data-email、data-tagin、data-stepper、data-composer；接过的不重复接。
// 搜索框（data-search）要给搜索函数，用 mountSearch 单独接
export function bindInputs(root = document, { composer } = {}) {
  for (const el of root.querySelectorAll("input[data-count]")) mountCount(el);
  for (const el of root.querySelectorAll("[data-ta]")) mountLongText(el);
  for (const el of root.querySelectorAll("input[data-pw]")) mountPassword(el);
  for (const el of root.querySelectorAll("input[data-email]")) mountEmail(el);
  for (const el of root.querySelectorAll("[data-tagin]")) mountTagInput(el);
  for (const el of root.querySelectorAll("[data-stepper]")) mountStepper(el);
  for (const el of root.querySelectorAll("[data-composer]")) mountComposer(el, composer);
}
