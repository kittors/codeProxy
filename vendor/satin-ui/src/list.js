// 无限列表（虚拟滚动 + 分页加载）。数据由 loadPage 给（库里不带演示数据，设计稿的演示在 demo/sections/list.js）。
import { scrollArea } from "./scroll.js";
import { $, reduced } from "./core.js";
import { scoped } from "./i18n.js";
import I18N_DEFAULTS from "./locales/zh-CN/list.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// ———— 无限列表 ————
// mountInfiniteList(容器, { loadPage, renderRow, rowHeight, total, pageSize, onCount })：
//   行高固定，只画看得见的那几十行（上万条照样流畅）；滚到离底部 400px 自动要下一页；
//   等待超过 300ms 才在末尾出三行骨架，出了就至少留 500ms，数据到了骨架原地淡出、新行依次淡入；
//   这一页失败：末尾一行"没加载出来 + 重试"；全部加载完：末尾一行"已经到底了"。
//   loadPage(offset, size) 返回 Promise（这一页的数据数组）；renderRow(行元素, 数据, 下标) 把一行画出来（行元素会复用：子元素可以缓存在 el._d 上，行换成骨架时会清掉）；
//   onCount(已加载, 总数)：数量变了调。返回 { reload(), scrollTop(), count }
export function mountInfiniteList(vl, { loadPage, renderRow, rowHeight = 56, total = Infinity, pageSize = 60, onCount } = {}) {
  if (vl._vl) return vl._vl;
  let space = $(".sn-vl-space", vl); if (!space) { space = document.createElement("div"); space.className = "sn-vl-space"; vl.append(space); }
  const ROW = rowHeight, OVER = 8, data = [];
  let loading = false, skShown = false, failed = false, freshFrom = -1, raf = 0, ended = false;
  const live = new Map(), free = [];
  // 骨架行的两根文字条：宽度照真实标题、副标题的常见长度给（不是按列宽百分比——宽列表里会拉成一大条）
  const SKW = [[168, 116], [132, 92], [196, 128]];
  const items = () => data.length, done = () => ended || items() >= total;
  const kindOf = (i) => i < items() ? "d" : skShown && i < items() + 3 ? "s" : failed && i === items() ? "e" : done() && i === items() ? "x" : null;
  const count = () => items() + (skShown ? 3 : 0) + (failed || done() ? 1 : 0);
  function fill(el, i, k) {
    el._k = k + i; el.className = "sn-vl-row" + (k === "s" ? " sn-sk-row" : k === "e" ? " sn-err" : k === "x" ? " sn-end" : "");
    if (k === "d") {
      if (el._kind !== "d") { el.innerHTML = ""; el._kind = "d"; }
      renderRow(el, data[i], i);
      // 新到的一页：骨架原地换成真内容，前几行依次淡入（每行晚 35ms），像骨架"显影"成内容
      el.style.animationDelay = "";
      if (freshFrom >= 0 && i >= freshFrom && !reduced()) { el.classList.add("sn-vl-in"); el.style.animationDelay = Math.min(5, i - freshFrom) * 35 + "ms"; }
    } else {
      el._kind = k; el._d = null; el.style.animationDelay = ""; // 换成骨架 / 提示行：调用方缓存在 el._d 上的子元素作废
      const j = (i - items()) % 3; el.style.setProperty("--sn-sk-i", j);
      el.innerHTML = k === "s" ? `<span class="sn-th sn-sk"></span><span class="sn-tx"><span class="sn-ln"><i class="sn-sk" style="width:${SKW[j][0]}px"></i></span><span class="sn-ln sn-sm"><i class="sn-sk" style="width:${SKW[j][1]}px"></i></span></span>`
        : k === "e" ? tt("list.0") : `<span>${tt("list.1", { p0: items().toLocaleString("zh-CN") })}</span>`;
    }
    el.style.transform = `translateY(${i * ROW}px)`;
  }
  function render() {
    raf = 0;
    const st = vl.scrollTop, h = vl.clientHeight, n = count();
    space.style.height = n * ROW + "px";
    const first = Math.max(0, Math.floor(st / ROW) - OVER), last = Math.min(n - 1, Math.ceil((st + h) / ROW) + OVER);
    for (const [i, el] of live) { const k = kindOf(i); if (i < first || i > last || !k || el._k !== k + i) { live.delete(i); el.hidden = true; free.push(el); } }
    for (let i = first; i <= last; i++) {
      if (live.has(i)) continue; const k = kindOf(i); if (!k) continue;
      const el = free.pop() || space.appendChild(document.createElement("div")); el.hidden = false; fill(el, i, k); live.set(i, el);
    }
    if (!loading && !failed && !done() && st + h > items() * ROW - 400) loadMore();
    vl.dispatchEvent(new CustomEvent("vlscroll", { detail: { top: st } }));
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
  vl.addEventListener("scroll", schedule, { passive: true });
  vl.addEventListener("sa-jump", render); // 拖滚动条：同一个任务里画好新位置的行
  async function loadMore() {
    loading = true; const show = setTimeout(() => { skShown = true; schedule(); }, 300); let shownAt = 0;
    const t0 = performance.now(); let page = null, err = null;
    try { page = await loadPage(items(), Math.min(pageSize, total - items())); } catch (e) { err = e; }
    clearTimeout(show); if (skShown) { shownAt = t0 + 300; await wait(Math.max(0, 500 - (performance.now() - shownAt))); }
    // 骨架行原地淡出（不立刻删），真内容同时在同一位置淡入：交叉淡化，中间不留空白
    if (skShown && !reduced()) for (const [i, el] of [...live]) if (el.classList.contains("sn-sk-row")) {
      live.delete(i); el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: 220, easing: "ease-out", fill: "forwards" }).onfinish = (e) => { e.target.cancel(); el.hidden = true; free.push(el); };
    }
    skShown = false; loading = false;
    if (err) { failed = true; schedule(); return; }
    freshFrom = items(); data.push(...(page || [])); if (!page?.length) ended = true;
    onCount?.(items(), total);
    schedule(); setTimeout(() => { freshFrom = -1; }, 400);
  }
  vl.addEventListener("click", (e) => { if (e.target.closest("[data-vl-retry]")) { failed = false; schedule(); loadMore(); } });
  scrollArea(vl, { fade: "y", size: 24 });
  loadMore();
  return (vl._vl = {
    reload() { data.length = 0; failed = false; skShown = false; ended = false; for (const el of live.values()) { el.hidden = true; free.push(el); } live.clear(); vl.scrollTop = 0; onCount?.(0, total); loadMore(); },
    scrollTop() { vl.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" }); },
    get count() { return items(); },
  });
}
// 展示页接线（demo/）要用的内部名字
export { wait };
