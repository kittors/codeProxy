"use client"; // Next.js 等 React 服务端组件环境：用到状态和副作用，是客户端组件
// satin-ui/react/flow：流程图（satin-ui/flow 的 createFlow：拖节点、连线、缩放、框选）包成的 React 组件。
//   import { Flow } from "satin-ui/react/flow";
//   <Flow nodes={[{ id: "a", x: 40, y: 60, t: "剧本", ic: "file-text" }, …]} edges={[["a", "b"]]} label="生成流程" />
// 节点、连线只在创建时用（之后由用户在图上拖、连）：要换一张图就换 key。ref 拿到实例：nodes、edges
import { createElement as h, forwardRef } from "react";
import { createFlow } from "../src/flow.js";
import { wrap } from "./wrap.js";

const Base = /* @__PURE__ */ wrap(createFlow, { events: [], displayName: "FlowInstance" });
export const Flow = /* @__PURE__ */ forwardRef(function Flow(props, ref) { return h(Base, { ...props, ref }); });
