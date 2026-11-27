// 数据表格的"后端"：表格只管显示和交互，数据从后端按块要（table-source.js）。三种来源都整理成同一套接口：
//   arrayBackend(data)           data 是数组：筛选、排序在页面里算（几万行以内）；行里带 children 数组就能切树形
//   remoteBackend(dataSource)    { total, load({ start, end, sort, filter }) }：数据在服务端，按块异步加载（排序、筛选也交给服务端）
//   自己实现整套接口（init / view / block / edit / move，树形再加 tree / tview / vals / tmove / adopt）：设计稿的十万行演示就是这样（demo/grid-backend.js，后台线程当服务端）
// 接口（都可以返回 Promise）：
//   init() → { n }                         行号的范围（行号是 0～n-1 的整数，表格按行号记勾选、行高、展开）
//   view({ query, first, ids }) → { total, ms?, first: 块, pos }   换视图（筛选、排序变了）：总数 + 第一块；ids 里的行号在新视图里排第几（pos，不在是 -1）
//   block({ start, count }) → 块           块 = { start, rows: 行号数组, items: 每一行的数据对象 }
//   edit({ row, key, value, tree })        改了一个值；move({ from, to }) 手动拖了行（没筛选、没排序时）
//   tree() → { par, lv, ord, roots }；tview({ query }) → { pre, sz, total, roots, ms }；vals({ ids }) → { ids, items }；tmove({ node, before, after })；adopt()
// query = { q: 搜索词, filters: { 列 key: 选项下标数组 | { min, max } }, sort: { key, dir: 1 | -1 } | null }

const isTree = (data, key) => data.some((r) => Array.isArray(r?.[key]));
const cmpOf = (dir) => (a, b) => { if (a == null) return b == null ? 0 : 1; if (b == null) return -1; const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "zh-CN", { numeric: true }); return r * dir; };
// 筛选：搜索词在主列（和 searchKeys 列出的列）里找；选项列按选项下标；范围列按数值
function passerOf(query, cols, searchKeys) {
  const q = (query.q || "").trim().toLowerCase(), fs = Object.entries(query.filters || {}).filter(([, v]) => (Array.isArray(v) ? v.length : v && (v.min != null || v.max != null)));
  if (!q && !fs.length) return null;
  const byKey = Object.fromEntries(cols.map((c) => [c.key, c]));
  const tests = fs.map(([k, v]) => {
    const c = byKey[k];
    if (Array.isArray(v)) { const want = new Set(v.map((i) => { const x = c?.options?.[i]; return x != null && typeof x === "object" ? x.value : x; })), idx = new Set(v); return (r) => idx.has(r[k]) || want.has(r[k]); }
    return (r) => !((v.min != null && !(r[k] >= v.min)) || (v.max != null && !(r[k] <= v.max)));
  });
  return (r) => (!q || searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q))) && tests.every((t) => t(r));
}

export function arrayBackend(data = [], { columns = [], primary, treeKey = "children", searchKeys } = {}) {
  // 行号按先序给（上级在前、下级紧跟在后）：一个节点连同下级正好是一段连续的行号
  const items = [], par = [], lv = [], ord = [], top = [];
  const walk = (list, p, l) => list.forEach((r, k) => { const id = items.length; const { [treeKey]: kids, ...rest } = r || {}; items.push({ ...rest }); par.push(p); lv.push(l); ord.push(k); if (p < 0) top.push(id); if (Array.isArray(kids)) walk(kids, id, l + 1); });
  walk(data, -1, 0);
  const n = items.length, tree = isTree(data, treeKey), keys = searchKeys || [primary || columns.find((c) => c.type !== "sel" && c.type !== "act")?.key].filter(Boolean);
  let order = Int32Array.from(top), view = order.slice(), kidsOf = null, sorted = null;
  const sortIds = (ids, s) => { if (!s) return ids; const col = columns.find((c) => c.key === s.key), get = col?.sortValue ? (i) => col.sortValue(items[i]) : (i) => items[i][s.key], cmp = cmpOf(s.dir < 0 ? -1 : 1); return Int32Array.from([...ids].map((i, j) => [i, j]).sort((a, b) => cmp(get(a[0]), get(b[0])) || a[1] - b[1]), (x) => x[0]); };
  const block = (start, count) => { const rows = view.slice(start, Math.min(view.length, start + count)); return { start, rows, items: Array.from(rows, (i) => items[i]) }; };
  const groups = () => { if (kidsOf) return kidsOf; kidsOf = new Map(); for (let i = 0; i < n; i++) { const p = par[i]; if (!kidsOf.has(p)) kidsOf.set(p, []); kidsOf.get(p).push(i); } return kidsOf; };
  return {
    kind: "array", get items() { return items; }, viewIds: () => view, // 当前视图（筛选、排序后）的全部行号：全选时列出 rowKey 用
    init: () => ({ n }),
    view({ query = {}, first = 100, ids = [] }) {
      const pass = passerOf(query, columns, keys);
      view = sortIds(pass ? order.filter((i) => pass(items[i])) : order.slice(), query.sort);
      let pos = null; if (ids.length) { const at = new Map(Array.from(view, (id, p) => [id, p])); pos = Int32Array.from(ids, (id) => at.get(id) ?? -1); }
      return { total: view.length, first: block(0, first), pos };
    },
    block: ({ start, count }) => block(start, count),
    edit({ row, key, value }) { if (items[row]) items[row] = { ...items[row], [key]: value }; },
    move({ from, to }) { for (const a of [view, order]) { const x = a[from]; if (from < to) a.copyWithin(from, from + 1, to + 1); else a.copyWithin(to + 1, to, from); a[to] = x; } },
    // ———— 树形（行里带 children 时）————
    ...(tree ? {
      tree: () => ({ par: Int32Array.from(par), lv: Uint8Array.from(lv), ord: Int32Array.from(ord), roots: top.length }),
      tview({ query = {} }) {
        const pass = passerOf(query, columns, keys), g = groups();
        let keep = null; if (pass) { keep = new Uint8Array(n); for (let i = n - 1; i >= 0; i--) if (keep[i] || pass(items[i])) { keep[i] = 1; if (par[i] >= 0) keep[par[i]] = 1; } }
        sorted = query.sort ? new Map([...g].map(([p, ids]) => [p, sortIds(Int32Array.from(ids), query.sort)])) : null;
        const pre = [], sz = []; let roots = 0;
        const go = (p) => { for (const id of (sorted || g).get(p) || []) { if (keep && !keep[id]) continue; if (p < 0) roots++; const at = pre.length; pre.push(id); sz.push(0); go(id); sz[at] = pre.length - at; } };
        go(-1);
        return { pre: Int32Array.from(pre), sz: Int32Array.from(sz), total: pre.length, roots };
      },
      vals: ({ ids }) => ({ ids, items: Array.from(ids, (i) => items[i]) }),
      tmove({ node, before = -1, after = -1 }) { const g = groups(), seg = g.get(par[node]).filter((x) => x !== node); let at = before >= 0 ? seg.indexOf(before) : after >= 0 ? seg.indexOf(after) + 1 : seg.length; if (at < 0) at = seg.length; seg.splice(at, 0, node); g.set(par[node], seg); },
      adopt() { if (sorted) for (const [p, ids] of sorted) groups().set(p, [...ids]); sorted = null; },
    } : {}),
  };
}

// 服务端数据：dataSource = { total, load({ start, end, sort, filter }) → Promise<行数组 | { rows, total }> }。行号按 rowKey 现场分配（同一行换了视图还是同一个行号）
export function remoteBackend(ds, { rowKey = "id", columns = [] } = {}) {
  const ids = new Map(); let n = 0, query = {};
  const idOf = (row, k) => { const key = typeof rowKey === "function" ? rowKey(row) : row?.[rowKey] ?? `#${k}`; let id = ids.get(key); if (id == null) { id = n++; ids.set(key, id); } return id; };
  const filterOf = (q) => { const out = {}; for (const [k, v] of Object.entries(q.filters || {})) { const c = columns.find((x) => x.key === k); out[k] = Array.isArray(v) ? v.map((i) => { const x = c?.options?.[i]; return x != null && typeof x === "object" ? x.value : x ?? i; }) : v; } return { q: q.q || "", ...out }; };
  async function get(start, count) {
    const res = await ds.load({ start, end: start + count, sort: query.sort || null, filter: filterOf(query) });
    const rows = Array.isArray(res) ? res : res?.rows || [], total = Array.isArray(res) ? ds.total ?? rows.length : res?.total ?? ds.total ?? rows.length;
    return { total, block: { start, rows: Int32Array.from(rows, (r, j) => idOf(r, start + j)), items: rows } };
  }
  return {
    kind: "remote",
    init: () => ({ n: Math.max(ds.total || 0, 0) }),
    async view({ query: q = {}, first = 100 }) { query = q; const r = await get(0, first); return { total: r.total, first: r.block, pos: null }; },
    async block({ start, count }) { return (await get(start, count)).block; },
    edit: (e) => ds.edit?.(e), move: (e) => ds.move?.(e),
  };
}
export const isBackend = (x) => !!x && typeof x.view === "function" && typeof x.block === "function";
export function backendOf({ data, dataSource, columns, rowKey, primary } = {}) {
  if (isBackend(dataSource)) return dataSource;
  if (dataSource) return remoteBackend(dataSource, { rowKey, columns });
  return arrayBackend(data || [], { columns, primary });
}
