// satin-ui/vue/grid：数据表格（satin-ui/grid 的 createDataGrid）包成的 Vue 组件。重组件单独一个子路径，不拉进 satin-ui/vue 主入口。
//   <script setup> import { DataGrid } from "satin-ui/vue/grid"; </script>
//   <DataGrid :columns="columns" :data="rows" row-key="id" v-model:selected="keys" v-model:sort="sort" @cell-edit="save" />
// · 列：columns（key、title、width、sortable、filter、pinned、type、options、format、render、editable……，见类型 GridColumn）；
//   自己画格子：插槽 #cell-<列的 key>="{ value, row, index }"，或者列的 render 返回 VNode（用 h() 写）
// · 数据：data（数组）或 dataSource（{ total, load({ start, end, sort, filter }) } 按块从服务端要）
// · v-model:selected（勾上的 rowKey）、v-model:sort；事件 @row-click、@sort-change、@filter-change、@selection-change、@column-resize、@column-reorder、@cell-edit、@scroll-end、@row-action
// · data 只做浅比较（数组换了才重新要，不深度遍历十万行）；列的 key 变了换一张新表。模板 ref 的 instance 是实例
import { defineComponent, h, ref, shallowRef, computed, onMounted, onBeforeUnmount, watch, isVNode, render as vueRender, getCurrentInstance, Fragment } from "vue";
import { setup } from "../src/setup.js";
import { createDataGrid } from "../src/data/grid.js";
import { cx } from "./wrap.js";

export const GRID_EVENTS = ["rowClick", "sortChange", "filterChange", "selectionChange", "columnResize", "columnReorder", "cellEdit", "scrollEnd", "rowAction", "retry"];
const PROPS = ["columns", "data", "dataSource", "rowKey", "selection", "selected", "defaultSelectedKeys", "sort", "defaultSort", "rowDraggable", "merges", "detail", "treeCount", "loading", "error", "emptyText", "noMatchText", "errorText", "loadingText", "lines", "height", "label", "toolbar", "controls"];
// 两种表格（DOM 版、Canvas 版）共用：create 是 createDataGrid / createCanvasGrid
export function gridComponent(create, name) {
  const Inner = defineComponent({
    name: name + "Instance", inheritAttrs: false,
    props: Object.fromEntries(PROPS.map((k) => [k, { type: null, default: undefined }])),
    emits: [...GRID_EVENTS, "update:selected", "update:sort"],
    setup(p, { emit, expose, attrs, slots }) {
      const host = ref(null), inst = shallowRef(null), app = getCurrentInstance()?.appContext, cells = new Set();
      // 插槽 #cell-<key>、render 返回 VNode：用 Vue 的 render 画进格子（带上应用的上下文：全局组件、provide 都能用）
      const cols = () => (p.columns || []).map((c) => {
        const slot = slots["cell-" + c.key], fn = typeof c.render === "function" ? c.render : slot ? (v, row, ctx) => h(Fragment, null, slot({ value: v, row, index: ctx.index })) : null;
        return !fn ? c : { ...c, render: (v, row, ctx) => { const out = fn(v, row, ctx); if (!isVNode(out)) return out; out.appContext = app; vueRender(out, ctx.cell); cells.add(ctx.cell); return undefined; } };
      });
      const opts = () => { const o = {}; for (const k of PROPS) if (p[k] !== undefined) o[k] = p[k]; if (p.selected !== undefined) o.selectedKeys = p.selected; o.columns = cols(); return o; };
      const html = create.html(opts());
      let unsetup = null;
      onMounted(() => {
        unsetup = setup();
        const handlers = Object.fromEntries(GRID_EVENTS.map((ev) => ["on" + ev[0].toUpperCase() + ev.slice(1), (d) => { emit(ev, d); if (ev === "selectionChange" && d.keys) emit("update:selected", d.keys); /* dataSource 全选时 keys 是 null：看 @selection-change 的 all、except */ if (ev === "sortChange") emit("update:sort", d); }]));
        inst.value = create(host.value.firstElementChild, { ...opts(), ...handlers });
      });
      // 浅比较：这些值本身换了才交给实例（不深度遍历数据）
      watch(() => [p.data, p.dataSource, p.sort, p.selected, p.height, p.loading, p.error, p.emptyText, p.errorText, p.noMatchText, p.loadingText], () => inst.value?.update(opts()));
      onBeforeUnmount(() => { inst.value?.destroy(); inst.value = null; for (const c of cells) vueRender(null, c); cells.clear(); unsetup?.(); });
      expose({ instance: inst });
      return () => h("div", { ...attrs, ref: host, class: cx("sn-host", attrs.class), style: ["display: contents", attrs.style], innerHTML: html });
    },
  });
  return defineComponent({
    name, inheritAttrs: false,
    props: { columns: { type: Array, default: () => [] } },
    setup(p, { attrs, expose, slots }) {
      const inner = ref(null);
      expose({ instance: computed(() => inner.value?.instance ?? null) });
      return () => h(Inner, { ...attrs, columns: p.columns, ref: inner, key: p.columns.map((c) => c.key).join("|") }, slots);
    },
  });
}
export const DataGrid = /* @__PURE__ */ gridComponent(createDataGrid, "SnDataGrid");
