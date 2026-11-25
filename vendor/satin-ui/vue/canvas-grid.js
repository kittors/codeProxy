// satin-ui/vue/canvas-grid：画布表格（一百万行也流畅，satin-ui/canvas-grid 的 createCanvasGrid）包成的 Vue 组件。
//   <script setup> import { CanvasGrid } from "satin-ui/vue/canvas-grid"; </script>
//   <CanvasGrid :columns="columns" :data-source="{ total: 1000000, load }" row-key="id" />
// 属性、v-model、事件和 DataGrid 一样（见 satin-ui/vue/grid）；画布上画不了任意节点：格子的文字用 format（render 只在 DataGrid 里有效）
import { createCanvasGrid } from "../src/data/canvas-grid.js";
import { gridComponent } from "./grid.js";

export const CanvasGrid = /* @__PURE__ */ gridComponent(createCanvasGrid, "SnCanvasGrid");
