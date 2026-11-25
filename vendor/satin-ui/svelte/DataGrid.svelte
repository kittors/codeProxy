<!--
  数据表格（satin-ui/grid 的 createDataGrid）：<DataGrid {columns} data={rows} rowKey="id" bind:selectedKeys bind:sort onCellEdit={save} />
  import DataGrid from "satin-ui/svelte/DataGrid.svelte"（重组件：只有引了它才会载进 satin-ui/grid）
  · columns（key、title、width、sortable、filter、pinned、type、options、format、render、editable……）；data（数组）或 dataSource（{ total, load }，按块从服务端要）
  · bind:selectedKeys（勾上的 rowKey）、bind:sort；事件写成回调属性：onRowClick、onSortChange、onFilterChange、onSelectionChange、onColumnResize、onColumnReorder、onCellEdit、onScrollEnd、onRowAction
  · 三种状态 loading / error / emptyText；列的 key 变了换一张新表（{#key}）；bind:instance 拿到实例（merge、reload……）
  · 服务端输出和第一帧一样的标记（工具条、表头、空表体），挂上以后才有行；卸载时撤掉监听和放进 <head> 的样式
-->
<script>
  import Satin from "./Satin.svelte";
  import { createDataGrid } from "../src/data/grid.js";

  let { columns = [], selectedKeys = $bindable(), sort = $bindable(), onSelectionChange, onSortChange, instance = $bindable(null), class: className = "", style = "", id, ...options } = $props();
  const pick = (e) => { if (e.keys) selectedKeys = e.keys; onSelectionChange?.(e); };
  const sorted = (s) => { sort = s; onSortChange?.(s); };
</script>

{#key columns.map((c) => c.key).join("|")}
  <Satin create={createDataGrid} options={{ ...options, columns, selectedKeys, sort, onSelectionChange: pick, onSortChange: sorted }} bind:instance class={className} {style} {id} />
{/key}
