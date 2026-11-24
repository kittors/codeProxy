// 在 Web Worker 里跑分层布局和空间索引：几万个节点、几十万条线，全在主线程外，界面一刻不停。
// 消息：
//   { type: "data", ea, eb }                       换一套数据时先发一次连线，后面的请求都用它（不用每次再拷几 MB）
//   { type: "layout", id, n, w, h, gapX, gapY, cell } 分层布局 + 按排好的位置建索引，一起送回
//   { type: "grid", id, n, x, y, w, h, cell }        只按给的位置重建索引（拖完卡片、打乱之后）
import { layeredLayout, buildGrid } from "./flow-layout.js";
let EA = new Int32Array(0), EB = new Int32Array(0), NW = null, NH = null;
const send = (msg, g, extra = []) => self.postMessage(msg, [...extra, g.nStart.buffer, g.nList.buffer, g.eStart.buffer, g.eList.buffer]);
self.onmessage = (e) => {
  const d = e.data;
  if (d.type === "data") { EA = d.ea; EB = d.eb; NW = d.nw || null; NH = d.nh || null; return; }
  const wArg = d.nw || NW || d.w, hArg = d.nh || NH || d.h;
  if (d.type === "grid") { const g = buildGrid(d.n, d.x, d.y, EA, EB, wArg, hArg, d.cell); send({ type: "grid", id: d.id, grid: g }, g); return; }
  const t0 = performance.now();
  const wf = typeof wArg === "number" ? () => wArg : (i) => wArg[i];
  const hf = typeof hArg === "number" ? () => hArg : (i) => hArg[i];
  const r = layeredLayout(d.n, EA, EB, wf, hf, { gapX: d.gapX, gapY: d.gapY }), ms = Math.round(performance.now() - t0);
  const g = buildGrid(d.n, r.x, r.y, EA, EB, wArg, hArg, d.cell);
  send({ type: "layout", id: d.id, x: r.x, y: r.y, ms, grid: g }, g, [r.x.buffer, r.y.buffer]);
};
