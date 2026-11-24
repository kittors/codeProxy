// satin-ui/vue/flow
import type { DefineComponent } from "vue";
import type { FlowOptions } from "./heavy";
export const Flow: DefineComponent<FlowOptions>;
export type { FlowOptions, FlowNode, FlowEdge, FlowGroup, FlowPort } from "./heavy";
