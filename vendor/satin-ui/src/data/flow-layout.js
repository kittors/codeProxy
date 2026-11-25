// 自动排版（分层布局）：流程图的"整理"和一万个节点的压力测试共用。
// 1. 去环：深度优先找回边（往回连的线），回边不参与分层；
// 2. 分层：按最长路径分层（拓扑序），每个节点放在它所有上游的右边一层；
// 3. 层内排序：按上下游邻居的重心来回扫 4 遍，减少连线交叉；
// 4. 坐标：x 按层排开；y 让每个节点对齐它上游的中心，同一层不重叠（最小间距 gapY），整层再往"想去的位置"平移一次。
// 全部用类型化数组，一万个节点、一万五千条线几十毫秒。
// 参数：n 节点数；ea、eb 是等长的源、目标下标数组（普通数组或类型化数组都行）；w(i)、h(i) 给节点尺寸。返回 { x, y, layer }（左上角坐标）。
export function layeredLayout(n, ea, eb, w, h, { gapX = 72, gapY = 32 } = {}) {
  const m = ea.length, oc = new Int32Array(n + 1), ic = new Int32Array(n + 1);
  for (let e = 0; e < m; e++) { const a = ea[e], b = eb[e]; if (a !== b) { oc[a + 1]++; ic[b + 1]++; } }
  for (let i = 0; i < n; i++) { oc[i + 1] += oc[i]; ic[i + 1] += ic[i]; }
  const oa = new Int32Array(oc[n]), oe = new Int32Array(oc[n]), ia = new Int32Array(ic[n]), ie = new Int32Array(ic[n]), op = oc.slice(0, n), ip = ic.slice(0, n);
  for (let e = 0; e < m; e++) { const a = ea[e], b = eb[e]; if (a === b) continue; oa[op[a]] = b; oe[op[a]++] = e; ia[ip[b]] = a; ie[ip[b]++] = e; }
  // 1. 去环（迭代版深度优先，避免一万层递归）
  const color = new Uint8Array(n), back = new Uint8Array(m), stack = new Int32Array(n), ptr = new Int32Array(n);
  for (let r = 0; r < n; r++) {
    if (color[r]) continue; let sp = 0; stack[sp++] = r; color[r] = 1; ptr[r] = oc[r];
    while (sp) {
      const u = stack[sp - 1];
      if (ptr[u] < oc[u + 1]) { const k = ptr[u]++, v = oa[k]; if (color[v] === 1) back[oe[k]] = 1; else if (!color[v]) { color[v] = 1; ptr[v] = oc[v]; stack[sp++] = v; } }
      else { color[u] = 2; sp--; }
    }
  }
  // 2. 分层：拓扑序，layer[v] = max(layer[u] + 1)
  const indeg = new Int32Array(n), layer = new Int32Array(n), order = new Int32Array(n);
  for (let k = 0; k < oc[n]; k++) if (!back[oe[k]]) indeg[oa[k]]++;
  let qh = 0, qt = 0; for (let i = 0; i < n; i++) if (!indeg[i]) order[qt++] = i;
  while (qh < qt) { const u = order[qh++]; for (let k = oc[u]; k < oc[u + 1]; k++) { if (back[oe[k]]) continue; const v = oa[k]; if (layer[u] + 1 > layer[v]) layer[v] = layer[u] + 1; if (!--indeg[v]) order[qt++] = v; } }
  let L = 0; for (let i = 0; i < n; i++) if (layer[i] > L) L = layer[i];
  const layers = Array.from({ length: L + 1 }, () => []);
  for (let q = 0; q < qt; q++) layers[layer[order[q]]].push(order[q]);
  // 3. 层内排序：重心法来回扫
  const pos = new Float64Array(n);
  const renum = (arr) => { for (let i = 0; i < arr.length; i++) pos[arr[i]] = i; };
  layers.forEach(renum);
  const bc = new Float64Array(n);
  for (let sweep = 0; sweep < 4; sweep++) {
    const down = sweep % 2 === 0;
    for (let li = down ? 1 : L - 1; down ? li <= L : li >= 0; li += down ? 1 : -1) {
      const arr = layers[li];
      for (const v of arr) {
        let s = 0, c = 0;
        if (down) { for (let k = ic[v]; k < ic[v + 1]; k++) if (!back[ie[k]] && layer[ia[k]] === li - 1) { s += pos[ia[k]]; c++; } }
        else { for (let k = oc[v]; k < oc[v + 1]; k++) if (!back[oe[k]] && layer[oa[k]] === li + 1) { s += pos[oa[k]]; c++; } }
        bc[v] = c ? s / c : pos[v];
      }
      arr.sort((a, b) => bc[a] - bc[b] || pos[a] - pos[b]); renum(arr);
    }
  }
  // 4. 坐标
  const x = new Float64Array(n), y = new Float64Array(n);
  let lx = 0;
  for (let li = 0; li <= L; li++) {
    const arr = layers[li]; let mw = 0; for (const v of arr) mw = Math.max(mw, w(v));
    for (const v of arr) x[v] = lx;
    lx += mw + gapX;
    // 想去的位置：上游中心的平均；没有上游的接在后面
    let bottom = -Infinity, sumD = 0;
    const want = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i]; let s = 0, c = 0;
      for (let k = ic[v]; k < ic[v + 1]; k++) if (!back[ie[k]]) { const u = ia[k]; s += y[u] + h(u) / 2; c++; }
      const top = c ? s / c - h(v) / 2 : (bottom === -Infinity ? 0 : bottom + gapY);
      want[i] = top; y[v] = Math.max(top, bottom + gapY); bottom = y[v] + h(v); sumD += want[i] - y[v];
    }
    // 整层平移：往"想去的位置"挪回平均偏差（不改变层内间距，不会重叠）
    const shift = arr.length ? sumD / arr.length : 0; for (const v of arr) y[v] += shift;
  }
  let minY = Infinity; for (let i = 0; i < n; i++) if (y[i] < minY) minY = y[i];
  for (let i = 0; i < n; i++) y[i] -= minY;
  return { x, y, layer };
}

// 空间索引：把画布切成 cell 大小的格子，节点按它的矩形、连线按源到目标的包围盒放进覆盖到的格子。
// W、H 可以是统一数值，也可以是按节点下标给的 TypedArray / 数组（支持异构尺寸节点）。
// 结果是紧凑的类型化数组（每格一段：start[c] ～ start[c+1]），先计数、再一次填好；没有闭包和小数组，五万个节点几毫秒。
export function buildGrid(n, X, Y, ea, eb, W, H, CELL) {
  const arrW = typeof W === "number" ? null : W, arrH = typeof H === "number" ? null : H;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = X[i], y = Y[i], wi = arrW ? arrW[i] : W, hi = arrH ? arrH[i] : H;
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x + wi > x1) x1 = x + wi; if (y + hi > y1) y1 = y + hi;
  }
  if (!n) { x0 = y0 = 0; x1 = y1 = 1; }
  const gx0 = Math.floor(x0 / CELL), gy0 = Math.floor(y0 / CELL), gw = Math.floor(x1 / CELL) - gx0 + 1, gh = Math.floor(y1 / CELL) - gy0 + 1, cells = gw * gh, m = ea.length;
  const nStart = new Int32Array(cells + 1), eStart = new Int32Array(cells + 1);
  for (let pass = 0; pass < 2; pass++) {
    const nPos = pass ? nStart.slice(0, cells) : null, ePos = pass ? eStart.slice(0, cells) : null;
    const nList = pass ? new Int32Array(nStart[cells]) : null, eList = pass ? new Int32Array(eStart[cells]) : null;
    for (let i = 0; i < n; i++) {
      const wi = arrW ? arrW[i] : W, hi = arrH ? arrH[i] : H;
      const cx0 = Math.floor(X[i] / CELL) - gx0, cx1 = Math.floor((X[i] + wi) / CELL) - gx0, cy0 = Math.floor(Y[i] / CELL) - gy0, cy1 = Math.floor((Y[i] + hi) / CELL) - gy0;
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const c = cy * gw + cx; if (pass) nList[nPos[c]++] = i; else nStart[c + 1]++; }
    }
    for (let e = 0; e < m; e++) {
      const a = ea[e], b = eb[e], wa = arrW ? arrW[a] : W, ha = arrH ? arrH[a] : H, hb = arrH ? arrH[b] : H;
      const ax = X[a] + wa, ay = Y[a] + ha / 2, bx = X[b], by = Y[b] + hb / 2;
      const cx0 = Math.floor((ax < bx ? ax : bx) / CELL) - gx0, cx1 = Math.floor((ax < bx ? bx : ax) / CELL) - gx0, cy0 = Math.floor((ay < by ? ay : by) / CELL) - gy0, cy1 = Math.floor((ay < by ? by : ay) / CELL) - gy0;
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const c = cy * gw + cx; if (pass) eList[ePos[c]++] = e; else eStart[c + 1]++; }
    }
    if (!pass) { for (let c = 0; c < cells; c++) { nStart[c + 1] += nStart[c]; eStart[c + 1] += eStart[c]; } }
    else return { gx0, gy0, gw, gh, nStart, nList, eStart, eList };
  }
}

