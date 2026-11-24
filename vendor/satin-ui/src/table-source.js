// 数据表格在页面这边的数据源：只缓存已经"到了"的块；看到哪里要哪里（每 80ms 最多要一次，快速划过去的块不会一路要过去）；
// 筛选、排序交给后端（table-backends.js：数组在页面里算、dataSource 交给服务端、设计稿的演示是后台线程）。视图换了（筛选、排序变了）就作废还没到的旧块。
// 两种加载方式：known 总数已知，按需取块；append 先只给 200 行，滚到底再加载 200 行（像信息流）。
// 编辑、手动换行先在本地生效（乐观更新），再告诉"服务端"。
// 树形模式（setTree）：后台线程按筛选、排序算好整棵树的先序（行号 + 每个节点连同下级一共几个），页面这边按展开状态把它展开成看得见的行——
// 展开收起在页面这边同步算（不等后台线程），各列的值仍按行号懒加载；筛选时保留命中的和它的所有上级（上级临时展开，不改原来的展开状态）。
import { scoped } from "./i18n.js";
import I18N_GRID from "./locales/zh-CN/grid.js";
const tt = /* @__PURE__ */ scoped(I18N_GRID);
// 有没有筛选：搜索词，或者哪一列的筛选有值（选项下标数组非空、范围有一头）
export const hasFilter = (q) => !!((q.q && q.q.trim()) || Object.values(q.filters || {}).some((v) => (Array.isArray(v) ? v.length : v && (v.min != null || v.max != null))));

export function createSource({ backend, n: n0 = 0, primary = "name", block = 100, rowH: rh0 = 40, query: q0, onChange }) {
  let B = backend, n = n0;
  // 已经到了的行：行号 → 这一行的数据对象（平铺、树形各一份：两种模式的名字可能不一样）
  let byId = new Map(), tById = new Map();
  const pending = new Set();
  let total = 0, rows = new Int32Array(0), ver = 0, query = q0 ? { ...q0 } : {}, mode = "known", shown = 0, busy = true, lastMs = 0, appending = false, failed = null;
  let want = [0, 0], wantT = 0;
  const emit = (what) => onChange?.(what);
  // ———— 行高：默认行高 + 单独拖过高度的行 ————
  // 按行号记（排序、筛选后行会换位置）；视图里的位置在换视图时让后台一起算出来，拖行换位置时在这边跟着挪。
  // 位置排好序、再记一份"到这一行为止多出来的高度"的前缀和：求某行顶部、某个高度落在哪一行都是二分，一百万行也不用逐行加
  // 平铺、树形各记一份（两种模式是两套视图，互不影响）
  const HB = { flat: new Map(), tree: new Map() }, TP = { flat: new Map(), tree: new Map() };
  let base = rh0, HP = new Int32Array(0), HH = new Float64Array(0), HC = new Float64Array(0), pver = 0, hById = HB.flat;
  // 关心位置的行（单独改过高度的、合并了的）：行号 → 在当前视图里排第几（不在视图里是 -1）。换视图时让后台一起算，拖行时在这边跟着挪
  let tpos = TP.flat;
  const heights = () => setPairs([...hById].map(([id, h]) => [tpos.get(id) ?? -1, h]));
  function setPairs(list) {
    list = list.filter((x) => x[0] >= 0).sort((a, b) => a[0] - b[0]);
    HP = Int32Array.from(list, (x) => x[0]); HH = Float64Array.from(list, (x) => x[1]); HC = new Float64Array(list.length);
    let acc = 0; for (let i = 0; i < list.length; i++) { acc += HH[i] - base; HC[i] = acc; }
  }
  const below = (P, p) => { let lo = 0, hi = P.length; while (lo < hi) { const m = (lo + hi) >> 1; if (P[m] < p) lo = m + 1; else hi = m; } return lo; };
  const rowY = (p) => { const k = below(HP, p); return p * base + (k ? HC[k - 1] : 0); };
  const rowHt = (p) => { const k = below(HP, p); return k < HP.length && HP[k] === p ? HH[k] : base; };
  function rowAtY(y) { const n = api.shown; if (n <= 0) return 0; let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (rowY(m) <= y) lo = m; else hi = m - 1; } return lo; }
  // 后端出错（load 抛错、网络断了）：记下来、发 "error"，表格显示出错状态（retry() 重来）
  const fail = (e) => { failed = e || new Error(tt("grid.68")); busy = false; emit("error"); };
  // 一块到了：按视图位置记下行号，按行号记下这一行的数据
  function take(b, v) {
    pending.delete(`${v}:${(b.start / block) | 0}`); if (v !== ver) return;
    for (let j = 0; j < b.rows.length; j++) { const r = b.rows[j]; rows[b.start + j] = r; byId.set(r, b.items[j]); if (got) got[r] = 1; }
    emit("block");
  }
  const blockLoaded = (k) => { const a = k * block, z = Math.min(total, a + block); for (let p = a; p < z; p++) if (rows[p] === -1) return false; return true; };
  function pull() {
    wantT = 0; if (tree) return pullTree(); const [a, z] = want; if (z <= a) return;
    for (let k = (a / block) | 0, k1 = ((z - 1) / block) | 0; k <= k1; k++) {
      const key = `${ver}:${k}`; if (pending.has(key) || blockLoaded(k)) continue;
      pending.add(key); const v = ver; Promise.resolve(B.block({ ver, start: k * block, count: block })).then((b) => take(b, v), (e) => { pending.delete(key); if (v === ver) fail(e); });
    }
  }
  // 视口里要看 [p0, p1)：记下来，80ms 后把还没到的块要过来
  function ensure(p0, p1) { want = [Math.max(0, p0), Math.min(api.shown, p1)]; if (!wantT) wantT = setTimeout(pull, 80); }
  async function refresh() {
    const v = ++ver; busy = true; failed = null; pending.clear(); emit("busy");
    if (tree) return refreshTree(v);
    const ids = [...tpos.keys()]; let d;
    try { d = await B.view({ ver: v, query, first: block, ids }); } catch (e) { if (v === ver) fail(e); return; }
    if (v !== ver || tree) return;
    ids.forEach((id, k) => tpos.set(id, d.pos ? d.pos[k] : -1)); heights(); pver++;
    total = d.total; lastMs = d.ms; rows = new Int32Array(total).fill(-1); shown = mode === "append" ? Math.min(total, 200) : total; busy = false;
    take(d.first, v); emit("view");
  }

  // ———— 树形模式 ————
  // T：每个节点的上级、第几级、原来排第几（起名字）、连同下级一共几个（整棵树，勾选级联用）。行号先序，所以一个节点连同下级正好是行号 [id, id + fsz)
  // pre / psz / pidx：当前筛选、排序下整棵树的先序、每个节点连同下级几个、行号 → 在先序里排第几（不在是 -1）
  // vrows：看得见的行（先序里跳过收起的那几段）；prev：上一次 mark() 时的样子（过渡动画按它找"原来在哪"）
  let tree = false, T = null, pre = new Int32Array(0), psz = new Int32Array(0), pidx = null, m = 0, troots = 0;
  let open = null, shut = null, filt = false, got = null, req = null, tlim = 200, tshown = 0, sver = 0, sAll = 0, sOn = 0; // sAll / sOn：当前视图里能展开的有几个、展开着几个（换视图时数一遍，展开收起时跟着加减——一百万个节点不用每次都数）
  // 收起时下级要先淡出：箭头（"该是什么状态"）马上转，结构上先按收起前的样子留着（frozen：那一刻每个节点展开没展开），淡出完了再 commit()
  let frozen = null;
  let vrows = new Int32Array(0), vn = 0, prevRows = new Int32Array(0), prevN = 0, pHP = HP, pHC = HC;
  const isOpen = (id) => (filt ? !shut[id] : open[id] === 1);
  const hasKids = (id) => { const i = pidx ? pidx[id] : -1; return i >= 0 && psz[i] > 1; };
  // 把先序展开成看得见的行：展开着的接着走下级，收起的跳过它下面那一段。顺手数第一级的个数（滚到底再加载时按项目分页）
  function rebuild() {
    // 热循环里只用局部常量（闭包里会被重新赋值的变量，每次读都要多绕一层，一百万行时慢好几倍）；展开着 = 标记数组里是 want
    const P = pre, S = psz, R = vrows, M = m, F = frozen ?? (filt ? shut : open), want = frozen || !filt ? 1 : 0, lv = T.lv, lim = tlim;
    let k = 0, i = 0, rc = 0, cut = -1;
    while (i < M) { const id = P[i]; if (lv[id] === 0) { if (rc === lim && cut < 0) cut = k; rc++; } R[k++] = id; const s = S[i]; i += s > 1 && F[id] === want ? 1 : s; }
    vn = k; tshown = cut >= 0 ? cut : vn; sver++;
    for (const id of tpos.keys()) tpos.set(id, findPos(id)); heights(); pver++; // 关心位置的行：按先序二分找现在排第几
  }
  // 行号 → 现在排第几（看不见是 -1）：看得见的行按先序排着，二分
  function findIn(R, N, id) { if (!tree || !pidx) return -1; const t = pidx[id]; if (t < 0) return -1; let lo = 0, hi = N; while (lo < hi) { const h = (lo + hi) >> 1; if (pidx[R[h]] < t) lo = h + 1; else hi = h; } return lo < N && R[lo] === id ? lo : -1; }
  const findPos = (id) => findIn(vrows, vn, id);
  // 一个节点连同看得见的下级到哪一行为止（不含）：先序里它那一段之后的第一个看得见的行
  function blockEnd(p) { const id = vrows[p], t = pidx[id] + psz[pidx[id]]; let lo = p + 1, hi = vn; while (lo < hi) { const h = (lo + hi) >> 1; if (pidx[vrows[h]] < t) lo = h + 1; else hi = h; } return lo; }
  async function refreshTree(v) {
    let d; try { d = await B.tview({ ver: v, query }); } catch (e) { if (v === ver) fail(e); return; }
    if (v !== ver || !tree) return;
    const f = hasFilter(query); if (f && !filt) shut.fill(0); // 开始筛选：上级都先临时展开；筛选中改条件，临时的展开收起留着；清掉筛选就回到原来的展开状态
    // 第一屏的值先要过来（不等网络延迟），再一起换上：换上的那一刻就有内容，也不会有一帧是新的结构、旧的滚动位置
    const isO = f ? (id) => !shut[id] : (id) => open[id] === 1, ids = [];
    for (let i = 0, k = 0; i < d.total && k < block; k++) { const id = d.pre[i]; if (!got[id]) { ids.push(id); req[id] = 1; } i += d.sz[i] > 1 && isO(id) ? 1 : d.sz[i]; }
    if (ids.length) { const r = await B.vals({ ids: Int32Array.from(ids), first: true }); takeVals(r, true); if (v !== ver || !tree) return; }
    pre = d.pre; psz = d.sz; m = d.total; troots = d.roots; lastMs = d.ms; filt = f; frozen = null;
    pidx.fill(-1); for (let i = 0; i < m; i++) pidx[pre[i]] = i;
    { const F = filt ? shut : open, want = filt ? 0 : 1; sAll = sOn = 0; for (let i = 0; i < m; i++) if (psz[i] > 1) { sAll++; if (F[pre[i]] === want) sOn++; } }
    vrows = new Int32Array(m); prevRows = new Int32Array(m); prevN = 0; rebuild();
    busy = false; emit("view");
  }
  function pullTree() {
    const [a, z] = want; if (z <= a) return; const ids = [];
    for (let p = Math.floor(a / block) * block, e = Math.min(vn, Math.ceil(z / block) * block); p < e; p++) { const id = vrows[p]; if (!got[id] && !req[id]) { req[id] = 1; ids.push(id); } }
    if (ids.length) Promise.resolve(B.vals({ ids: Int32Array.from(ids) })).then((r) => takeVals(r), fail);
  }
  function takeVals(b, quiet) { for (let j = 0; j < b.ids.length; j++) { const r = b.ids[j]; got[r] = 1; req[r] = 0; tById.set(r, b.items[j]); } if (!quiet) emit("block"); }
  async function setTree(on) {
    on = !!on; if (on === tree || (on && typeof B.tree !== "function")) return; ver++; busy = true; emit("busy");
    if (on && !T) {
      const d = await B.tree(), fsz = new Int32Array(n).fill(1); for (let i = n - 1; i > 0; i--) if (d.par[i] >= 0) fsz[d.par[i]] += fsz[i];
      T = { par: d.par, lv: d.lv, ord: d.ord, fsz, roots: d.roots }; open = new Uint8Array(n); shut = new Uint8Array(n); pidx = new Int32Array(n).fill(-1); req = new Uint8Array(n); got ??= new Uint8Array(n);
    }
    tree = on; hById = HB[on ? "tree" : "flat"]; tpos = TP[on ? "tree" : "flat"]; query = {}; filt = false; tlim = 200;
    return refresh();
  }

  const api = {
    get total() { return tree ? m : total; }, get shown() { return tree ? (mode === "append" ? tshown : vn) : mode === "append" ? shown : total; }, get busy() { return busy; }, get ms() { return lastMs; },
    get mode() { return mode; }, get query() { return query; }, get appending() { return appending; },
    get hasMore() { return mode === "append" && api.shown < (tree ? vn : total); },
    rowAt: (p) => (tree ? (p >= 0 && p < vn && got[vrows[p]] ? vrows[p] : -1) : p >= 0 && p < total ? rows[p] : -1),
    // 第 r 行（行号）的数据对象、某一列的值；name 是主列的值（树形的名字、详情标题用）
    row: (r) => (tree ? tById.get(r) : byId.get(r)), val: (r, k) => (tree ? tById.get(r) : byId.get(r))?.[k], name: (r) => (tree ? tById.get(r) : byId.get(r))?.[primary],
    get error() { return failed; }, retry: () => refresh(), allRows: () => B.items ?? null, viewIds: () => B.viewIds?.() ?? null, /* 数组数据：全部的行、当前视图的全部行号（按 rowKey 找行号、全选时列出 rowKey 用） */ get canTree() { return typeof B.tree === "function"; }, get canReorder() { return typeof B.move === "function"; },
    ensure,
    setQuery(q) { query = { ...q, sort: query.sort }; refresh(); },
    setSort(s) { query = { ...query, sort: s }; refresh(); },
    canMove: () => (tree ? !busy : !query.sort && !hasFilter(query)),
    // 改一个值：先在本地生效（乐观更新；主列在平铺、树形里各是各的名字，别的列两边一起改），再告诉后端
    edit(r, k, v) { for (const m of k === primary ? [tree ? tById : byId] : [byId, tById]) { const o = m.get(r); if (o) m.set(r, { ...o, [k]: v }); } B.edit?.({ row: r, key: k, value: v, tree }); },
    move(from, to) {
      const x = rows[from]; if (from < to) rows.copyWithin(from, from + 1, to + 1); else rows.copyWithin(to + 1, to, from); rows[to] = x;
      for (const [id, q] of tpos) if (q >= 0) tpos.set(id, q === from ? to : from < to && q > from && q <= to ? q - 1 : from > to && q >= to && q < from ? q + 1 : q); // 关心位置的行跟着挪
      heights(); pver++;
      B.move?.({ from, to });
    },
    // 行高：rowY(p) 第 p 行顶部、rowH(p) 第 p 行多高、rowAtY(y) 高度 y 落在哪一行、rowsH() 看得到的行一共多高
    rowY, rowH: rowHt, rowAtY, rowsH: () => rowY(api.shown), get baseH() { return base; }, get tallRows() { return HP.length; },
    // 单独改一行的高度；h 为空或等于默认就恢复默认。返回改没改成（那一行还没到就改不了）
    setRowH(p, h) { const id = tree ? (p >= 0 && p < vn ? vrows[p] : -1) : rows[p]; if (id == null || id < 0) return false; h = h == null ? base : Math.round(h * 2) / 2; tpos.set(id, p); if (h === base) hById.delete(id); else hById.set(id, h); heights(); return true; },
    // 关心某一行的位置（合并单元格用）：posOf(行号) → 当前排第几；pver 位置变了就加一
    setIdH(id, h) { if (id == null || id < 0) return; h = h == null ? base : Math.round(h * 2) / 2; if (h === base) hById.delete(id); else hById.set(id, h); heights(); }, // 按行号改：位置变了（排序、拖行）也改对那一行
    track(id, p) { tpos.set(id, p); }, posOf: (id) => tpos.get(id) ?? -1, get pver() { return pver; },
    // 全选时拖行高：所有行一起改成这个高度（单独改过的也一起变）
    setBaseH(h) { base = Math.round(h); hById.clear(); heights(); },
    setMode(m2) { mode = m2; shown = m2 === "append" ? Math.min(total, 200) : total; if (tree) { tlim = 200; rebuild(); } emit("view"); },
    // 滚到底：再加载 200 行（400ms 后到）；树形模式再加载 200 个项目
    more() { if (mode !== "append" || appending || api.shown >= (tree ? vn : total)) return; appending = true; emit("more"); setTimeout(() => { if (tree) { tlim += 200; rebuild(); } else shown = Math.min(total, shown + 200); appending = false; emit("more"); }, 400); },
    ready: Promise.resolve().then(() => B.init?.()).then((i) => { n = i?.n ?? n0; return refresh(); }, fail),
    get n() { return n; },
    // 换一套数据（data / dataSource 变了）：缓存、树形状态都清掉，按现在的筛选、排序重新要
    reset(b) { B.destroy?.(); B = b; byId = new Map(); tById = new Map(); tree = false; T = null; got = null; pidx = null; return Promise.resolve().then(() => B.init?.()).then((i) => { n = i?.n ?? n0; return refresh(); }, fail); },
    destroy() { clearTimeout(wantT); ver++; B.destroy?.(); },

    // ———— 树形模式 ————
    get tree() { return tree; }, setTree, get roots() { return troots; }, get sver() { return sver; }, get filtered() { return filt; },
    tinfo: () => T, // { par, lv, ord, fsz }
    idAt: (p) => (tree ? (p >= 0 && p < vn ? vrows[p] : -1) : p >= 0 && p < total ? rows[p] : -1), // 这一位是哪个节点（值还没到也知道）
    lvAt: (p) => (tree && p >= 0 && p < vn ? T.lv[vrows[p]] : 0),
    hasKids, isOpen, parentOf: (id) => (T ? T.par[id] : -1),
    // 当前视图里有几个直接下级（筛选时只算保留的）
    kidsN(id) { const i = pidx?.[id] ?? -1; if (i < 0) return 0; let c = 0; for (let j = i + 1, e = i + psz[i]; j < e; j += psz[j]) c++; return c; },
    findPos, blockEnd,
    // 展开 / 收起（ids 为 null = 当前视图里所有能展开的）：收起且 defer 时只改"该是什么状态"（箭头马上转），结构先按现在的样子留着，等下级淡出完 commit()。
    // 展开总是马上生效；收起还没 commit 时又展开，结构上本来就展开着，下级接着淡回来。返回结构变没变
    setOpen(ids, on, defer) {
      const all = ids == null, cnt = all ? m : ids.length, P = pre, S = psz, F = filt ? shut : open, yes = filt ? 0 : 1, no = 1 - yes, set = on ? yes : no; let ch = false;
      if (!on && defer && !frozen) { const Z = new Uint8Array(n); for (let i = 0; i < m; i++) if (S[i] > 1 && F[P[i]] === yes) Z[P[i]] = 1; frozen = Z; }
      const Z = frozen;
      for (let j = 0; j < cnt; j++) {
        let id; if (all) { if (S[j] < 2) continue; id = P[j]; } else { id = ids[j]; if (!hasKids(id)) continue; }
        if (F[id] === set) continue; F[id] = set; sOn += on ? 1 : -1;
        if (Z) { if (on && Z[id] !== 1) { Z[id] = 1; ch = true; } } else ch = true;
      }
      if (ch) rebuild();
      return ch;
    },
    commit() { if (!frozen) return false; frozen = null; rebuild(); return true; }, get pending() { return !!frozen; },
    closing: (id) => !!frozen && frozen[id] === 1 && !isOpen(id), // 已经收起、下级还在淡出
    allOpen: () => sAll > 0 && sOn === sAll, // 当前视图里能展开的是不是都展开着
    // 第一级（当前视图里）：全选用
    rootIds() { const out = []; for (let i = 0; i < m; i += psz[i]) out.push(pre[i]); return out; },
    // 过渡动画用：mark() 记下现在的样子；prevPos(行号) 那时排第几；prevRowY(p) 那时第 p 行的顶部
    mark() { pHP = HP; pHC = HC; prevN = vn; prevRows.set(vrows.subarray(0, vn)); },
    prevPos: (id) => (prevN ? findIn(prevRows, prevN, id) : -1),
    prevRowY: (p) => { const k = below(pHP, p); return p * base + (k ? pHC[k - 1] : 0); },
    // 兄弟（拖行用）：p 这一行同一个上级下面看得见的兄弟，每个连同看得见的下级是一段 { id, p, e }；还有这一组从哪到哪
    siblings(p) {
      const id = vrows[p], par = T.par[id], pp = par >= 0 ? findPos(par) : -1, a = pp + 1, z = pp >= 0 ? blockEnd(pp) : api.shown, out = [];
      for (let q = a; q < z;) { const e = blockEnd(q); out.push({ id: vrows[q], p: q, e }); q = e; }
      return { list: out, a, z };
    },
    // 在兄弟里换位置：插到 before 前面（或 after 后面）。先序里这个节点连同下级是一段，整段挪过去
    moveNode(id, before = -1, after = -1) {
      const anc = before >= 0 ? before : after; if (!tree || pidx[id] < 0 || anc < 0 || pidx[anc] < 0 || T.par[anc] !== T.par[id]) return false; // 视图换了、不是兄弟：不挪（拖着时视图被换掉的保险）
      const a = pidx[id], s = psz[a], b = before >= 0 ? pidx[before] : pidx[after] + psz[pidx[after]];
      if (b < a || b > a + s) {
        const seg = pre.slice(a, a + s), ss = psz.slice(a, a + s);
        if (b < a) { pre.copyWithin(b + s, b, a); psz.copyWithin(b + s, b, a); pre.set(seg, b); psz.set(ss, b); for (let i = b; i < a + s; i++) pidx[pre[i]] = i; }
        else { pre.copyWithin(a, a + s, b); psz.copyWithin(a, a + s, b); pre.set(seg, b - s); psz.set(ss, b - s); for (let i = a; i < b; i++) pidx[pre[i]] = i; }
      }
      B.tmove?.({ node: id, before, after }); prevN = 0; rebuild(); return true;
    },
    // 排序时拖了行：现在排好的顺序就当成手动顺序（和简单表格一样，"拖了就是手动顺序"），排序标记去掉，看到的顺序不变
    adoptSort() { if (!query.sort) return; B.adopt?.(); query = { ...query, sort: null }; emit("sort"); },
  };
  return api;
}
