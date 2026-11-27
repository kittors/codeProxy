// satin-ui/vue/flow：流程图（satin-ui/flow 的 createFlow：拖节点、连线、缩放、框选）包成的 Vue 组件。
//   <script setup> import { Flow } from "satin-ui/vue/flow"; </script>
//   <Flow :nodes="nodes" :edges="[['a', 'b']]" label="生成流程" />
// 节点、连线只在创建时用（之后由用户在图上拖、连）：要换一张图就换 :key。模板 ref 的 instance：nodes、edges
import { createFlow } from "../src/data/flow.js";
import { wrap } from "./wrap.js";

export const Flow = /* @__PURE__ */ wrap(createFlow, { name: "SnFlow", props: ["nodes", "edges", "groups", "label"], events: [], modelEvent: null });
