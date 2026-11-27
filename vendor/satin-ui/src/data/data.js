// UI 库设计稿第二批：数据展示。表格（排序时行移到位、勾选和批量操作条、密度）、项目卡片、折叠面板。
// 数值照 09 号 §2.1 模式 h：排序、筛选时元素从原位移到新位，300ms ease.inOut，相邻错开 15ms。

/* 拖行的空位模型：和两张数据表格同一份 */

// 附件共用：文件大小、保留扩展名的中间省略、波形条（输入框附件和聊天气泡都用）
export const fmtSize = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
export const midEllipsis = (s, n = 18) => {
  const chars = [...s]; if (chars.length <= n) return s;
  const dot = s.lastIndexOf("."), ext = dot > 0 ? s.slice(dot) : "", base = [...(dot > 0 ? s.slice(0, dot) : s)], keep = Math.max(4, n - [...ext].length - 1);
  return base.slice(0, Math.ceil(keep * .62)).join("") + "…" + base.slice(base.length - Math.floor(keep * .38)).join("") + ext;
};
export const waveBars = (n, seed = 1) => Array.from({ length: n }, (_, i) => `<i style="height:${Math.round(4 + Math.abs(Math.sin(seed * 9.1 + i * 1.7) * .6 + Math.sin(i * .55 + seed) * .4) * 14)}px"></i>`).join("");
// ———— 折叠面板 ————
// mountCollapse(.acc, { single, onToggle(item, open) })：点条目标题展开 / 收起（高度过渡，内容不重排）；single：同时只开一项。
// 返回 { open(i), close(i), toggle(i) }；bindCollapses(root) 把 root 里所有 .acc 接上
export function mountCollapse(acc, { single = false, onToggle } = {}) {
  if (!acc || acc._acc) return acc?._acc;
  const items = () => [...acc.querySelectorAll(":scope > .sn-acc-item")];
  // quiet：照外面给的值开合（受控同步用），不回调 onToggle、也不管 single
  const set = (it, on, quiet) => {
    if (!it || it.classList.contains("sn-open") === on) return;
    if (on && single && !quiet) for (const o of items()) if (o !== it) set(o, false);
    it.classList.toggle("sn-open", on); it.querySelector(".sn-acc-hd")?.setAttribute("aria-expanded", String(on)); if (!quiet) onToggle?.(it, on);
  };
  acc.addEventListener("click", (e) => { const hd = e.target.closest(".sn-acc-hd"); const it = hd?.closest(".sn-acc-item"); if (it && it.parentElement === acc) set(it, !it.classList.contains("sn-open")); });
  return (acc._acc = {
    open: (i) => set(items()[i], true), close: (i) => set(items()[i], false), toggle: (i) => { const it = items()[i]; set(it, !it?.classList.contains("sn-open")); },
    get expanded() { return items().flatMap((it, i) => (it.classList.contains("sn-open") ? [i] : [])); }, // 现在展开的是第几项
    sync: (list) => items().forEach((it, i) => set(it, list.includes(i), true)), // 照给的序号开合，不发事件
  });
}
export function bindCollapses(root = document) { for (const a of root.querySelectorAll(".sn-acc")) mountCollapse(a); }
